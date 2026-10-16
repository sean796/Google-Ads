<?php
/**
 * Generate bulk-auto-generate-template CSV from Flow Assist chat log knowledge gaps.
 *
 * @package Neo_Pulse_Wp
 */

defined( 'ABSPATH' ) || exit;

require_once __DIR__ . '/class-neo-pulse-wp-csv.php';

class Neo_Pulse_Wp_Chat_Logs_Gap_Csv {

	const DEFAULT_MODEL = 'google/gemini-2.5-flash';

	const MAX_MESSAGES = 400;

	const MAX_IDEAS = 20;

	const CSV_HEADER = 'keyword,entity,title,modifier,featuredImage,publish_date_gmt,sitemap_type,meta_description,target_slug,wikipedia_url,wikipedia_title';

	/**
	 * @return string
	 */
	public static function get_model(): string {
		if ( defined( 'NEO_PULSE_WP_CHAT_LOG_ANALYSIS_MODEL' ) && NEO_PULSE_WP_CHAT_LOG_ANALYSIS_MODEL !== '' ) {
			return trim( (string) NEO_PULSE_WP_CHAT_LOG_ANALYSIS_MODEL );
		}
		return self::DEFAULT_MODEL;
	}

	/**
	 * @param array<string, mixed> $args date_from, date_to, source_filter (all|frontend|demo), content_type (post|page).
	 * @return array{ok: bool, csv?: string, filename?: string, error?: string}
	 */
	public static function run( array $args ): array {
		$content_type = isset( $args['content_type'] ) ? sanitize_key( (string) $args['content_type'] ) : 'post';
		if ( ! in_array( $content_type, array( 'post', 'page' ), true ) ) {
			$content_type = 'post';
		}

		$date_from = isset( $args['date_from'] ) ? sanitize_text_field( (string) $args['date_from'] ) : '';
		$date_to   = isset( $args['date_to'] ) ? sanitize_text_field( (string) $args['date_to'] ) : '';
		if ( ! preg_match( '/^\d{4}-\d{2}-\d{2}$/', $date_from ) || ! preg_match( '/^\d{4}-\d{2}-\d{2}$/', $date_to ) ) {
			return array(
				'ok'    => false,
				'error' => __( 'Please choose a valid date range.', 'neo-pulse-wp' ),
			);
		}

		$source_filter = isset( $args['source_filter'] ) ? sanitize_key( (string) $args['source_filter'] ) : 'all';
		if ( ! in_array( $source_filter, array( 'all', 'frontend', 'demo' ), true ) ) {
			$source_filter = 'all';
		}

		$query_args = array(
			'date_from' => $date_from,
			'date_to'   => $date_to,
			'per_page'  => self::MAX_MESSAGES,
			'page'      => 1,
			'orderby'   => 'created_at',
			'order'     => 'asc',
		);
		if ( $source_filter !== 'all' ) {
			$query_args['source'] = $source_filter;
		}

		$messages = Neo_Pulse_Wp_Chat_Logs::fetch_messages_for_analysis( $query_args );
		if ( empty( $messages ) ) {
			return array(
				'ok'    => false,
				'error' => __( 'No chat messages found for this date range.', 'neo-pulse-wp' ),
			);
		}

		if ( Neo_Pulse_Wp_OpenRouter::get_body_api_key() === '' ) {
			return array(
				'ok'    => false,
				'error' => __( 'OpenRouter API key required. Add one in NEO Pulse WP Settings.', 'neo-pulse-wp' ),
			);
		}

		$site_index = Neo_Pulse_Wp_Chat_Rag::get_site_index();
		$context    = self::build_site_context( $site_index, $content_type );
		$signals    = Neo_Pulse_Wp_Chat_Insights::extract_priority_signals( $messages );

		$prompt = self::build_user_prompt( $signals, $context, $date_from, $date_to, $source_filter, $content_type );
		$system = self::system_prompt( $content_type );
		$model  = self::get_model();
		$raw    = Neo_Pulse_Wp_OpenRouter::complete_agency_only( $system, $prompt, $model, 8192, 0.4 );
		if ( is_wp_error( $raw ) ) {
			return array(
				'ok'    => false,
				'error' => $raw->get_error_message(),
			);
		}

		$empty_error = 'page' === $content_type
			? __( 'OpenRouter returned no page ideas for this date range.', 'neo-pulse-wp' )
			: __( 'OpenRouter returned no post ideas for this date range.', 'neo-pulse-wp' );

		$candidates = self::parse_ideas_response( (string) $raw );
		if ( empty( $candidates ) ) {
			return array(
				'ok'    => false,
				'error' => $empty_error,
			);
		}

		$ideas = self::normalize_ideas_for_csv( $candidates );
		if ( empty( $ideas ) ) {
			return array(
				'ok'    => false,
				'error' => $empty_error,
			);
		}

		$schedule_dates = self::stagger_publish_dates( $date_from, $date_to, count( $ideas ) );
		$csv            = self::build_csv( $ideas, $schedule_dates, $content_type );
		$slug           = sanitize_file_name( get_bloginfo( 'name' ) );
		if ( $slug === '' ) {
			$slug = 'site';
		}
		$filename = 'chat-gap-' . $content_type . 's-' . $slug . '-' . gmdate( 'Y-m-d' ) . '.csv';

		return array(
			'ok'       => true,
			'csv'      => $csv,
			'filename' => $filename,
		);
	}

	private static function system_prompt( string $content_type ): string {
		if ( 'page' === $content_type ) {
			return implode(
				"\n",
				array(
					'You are an expert content strategist reviewing prioritized Flow Assist chat signals for a WordPress website.',
					'Identify knowledge gaps that deserve new top-level evergreen PAGES (not blog posts) for THIS site\'s industry only.',
					'Target product hubs, service overviews, comparison landings, FAQ pillars, and buying guides that belong in main site navigation.',
					'You are the sole decision-maker: compare each candidate idea semantically against EXISTING_PAGES and EXISTING_PAGE_KEYWORDS before including it. No PHP or regex will filter your output afterward.',
					'Respond with JSON only. No markdown fences, no prose outside the JSON object.',
					'Schema:',
					'{"ideas":[{"keyword":"2-3 word short-tail","title":"under 60 chars, no colon","modifier":"brief writer angle grounded in chat themes","meta_description":"150-160 chars","rationale":"which customer questions this fills"}]}',
					'Priority order when choosing ideas:',
					'1. REPEATED_CUSTOMER_QUESTIONS (>= ' . Neo_Pulse_Wp_Chat_Insights::MIN_CHIP_CLICKS . ' mentions or sessions) — strongest gap signal',
					'2. CUSTOM_TYPED_QUERIES (visitor-typed questions about this site\'s products or services)',
					'3. FREQUENT_TOPIC_CHIP_OR_STARTER_CLICKS (repeated interest in on-topic prompts)',
					'4. CLICKED_SOURCE_INTEREST (accepted links/CTAs where visitors wanted more depth)',
					'Use SECONDARY_CONTEXT for weak/not-found assistant answers tied to on-topic gaps only.',
					'Each idea must be a new top-level page grounded in this site\'s business. Ignore off-topic chat entirely.',
					'Do NOT propose blog posts. Do NOT propose new geo/service-area landing pages (EXISTING_SERVICE_AREA_PAGES already cover those).',
					'Cannibalization (semantic — you must judge):',
					'- REJECT if the idea matches the same topic, comparison, or search intent as an EXISTING_PAGE or EXISTING_PAGE_KEYWORD.',
					'- Example REJECT: proposing a "Motorized Shades" hub when an equivalent category page already exists.',
					'- Example ACCEPT: customers repeatedly ask about a product line with no dedicated overview page on the site.',
					'- Related topics are OK when the search intent is genuinely different (hub vs troubleshooting vs comparison).',
					'Geo vs product content (semantic — you must judge):',
					'- REJECT: "[city] + service" local landing ideas, near-me spam, "do you serve [city]" coverage questions as new pages.',
					'- ACCEPT: product, repair, delivery, installation, or maintenance hub pages even if chat mentions "service" or "delivery" in a product context.',
					'Hard exclude (never output these as ideas):',
					'- off-topic, joke, or unrelated questions (e.g. military drones, random trivia not about this site)',
					'- meta/navigation chat: "summarize this page", "recommend blogs", "give me blogs to read", blog discovery requests',
					'- transactional: booking appointments, call/contact, promotions, "what services do you offer", pricing quotes',
					'- CANNED_STARTERS and template prompts unless they reveal a genuine on-topic product knowledge gap with repeated customer interest',
					'- staff or team member questions ("who is X", individual employee bios)',
					'- HR, careers, hiring, internal company operations',
					'- contact info, phone, email, hours, address lookups',
					'- one-off transactional requests that cannot become evergreen pages',
					'Skip signals where the assistant only redirected off-topic or listed existing links with no new gap.',
					'Output rules:',
					'- Return up to ' . self::MAX_IDEAS . ' of the best qualifying gaps; prefer genuine unanswered questions over near-duplicates',
					'- Do not invent gaps unsupported by on-topic priority signals',
					'- keyword: 2-3 words, short-tail, no near-me spam',
					'- title: page headline suitable for main navigation, keyword front-loaded, no colon character',
					'- modifier: one concise brief for the writer; reference what customers asked',
					'- meta_description: 150-160 characters, no double quotes inside the value',
				)
			);
		}

		return implode(
			"\n",
			array(
				'You are an expert content strategist reviewing prioritized Flow Assist chat signals for a WordPress website.',
				'Identify general knowledge gaps that deserve standalone informational blog posts for THIS site\'s industry only.',
				'You are the sole decision-maker: compare each candidate idea semantically against EXISTING_BLOG_POSTS and EXISTING_BLOG_KEYWORDS before including it. No PHP or regex will filter your output afterward.',
				'Respond with JSON only. No markdown fences, no prose outside the JSON object.',
				'Schema:',
				'{"ideas":[{"keyword":"2-3 word short-tail","title":"under 60 chars, no colon","modifier":"brief writer angle grounded in chat themes","meta_description":"150-160 chars","rationale":"which customer questions this fills"}]}',
				'Priority order when choosing ideas:',
				'1. REPEATED_CUSTOMER_QUESTIONS (>= ' . Neo_Pulse_Wp_Chat_Insights::MIN_CHIP_CLICKS . ' mentions or sessions) — strongest gap signal',
				'2. CUSTOM_TYPED_QUERIES (visitor-typed questions about this site\'s products or services)',
				'3. FREQUENT_TOPIC_CHIP_OR_STARTER_CLICKS (repeated interest in on-topic prompts)',
				'4. CLICKED_SOURCE_INTEREST (accepted links/CTAs where visitors wanted more depth)',
				'Use SECONDARY_CONTEXT for weak/not-found assistant answers tied to on-topic gaps only.',
				'Each idea must be a new informational blog post grounded in this site\'s business. Ignore off-topic chat entirely.',
				'Product or service pages can inspire new blog angles (benefits, how-to, FAQ), but never duplicate an existing blog post topic or search intent.',
				'Cannibalization (semantic — you must judge):',
				'- REJECT if the idea matches the same topic, comparison, or search intent as an EXISTING_BLOG_POST or EXISTING_BLOG_KEYWORD.',
				'- Example REJECT: proposing a comparison post when a similar comparison post already exists.',
				'- Example ACCEPT: customers repeatedly ask about a specific how-to angle that no existing post covers.',
				'- Related topics are OK when the search intent is genuinely different (how-to vs comparison vs troubleshooting).',
				'Geo vs product content (semantic — you must judge):',
				'- REJECT: "[city] + service" local landing ideas, near-me spam, "do you serve [city]" coverage questions as blog topics.',
				'- ACCEPT: product, repair, delivery, installation, or maintenance content questions even if chat mentions "service" or "delivery" in a product context.',
				'SERVICE_AREA_KEYWORDS are for local landing pages only — never use them as blog keywords.',
				'Hard exclude (never output these as ideas):',
				'- off-topic, joke, or unrelated questions (e.g. military drones, random trivia not about this site)',
				'- meta/navigation chat: "summarize this page", "recommend blogs", "give me blogs to read", blog discovery requests',
				'- transactional: booking appointments, call/contact, promotions, "what services do you offer", pricing quotes',
				'- CANNED_STARTERS and template prompts unless they reveal a genuine on-topic product knowledge gap with repeated customer interest',
				'- staff or team member questions ("who is X", individual employee bios)',
				'- HR, careers, hiring, internal company operations',
				'- contact info, phone, email, hours, address lookups',
				'- one-off transactional requests that cannot become evergreen articles',
				'Skip signals where the assistant only redirected off-topic or listed existing blog links with no new gap.',
				'Output rules:',
				'- Return up to ' . self::MAX_IDEAS . ' of the best qualifying gaps; prefer genuine unanswered questions over near-duplicates',
				'- Do not invent gaps unsupported by on-topic priority signals',
				'- keyword: 2-3 words, short-tail, no near-me spam',
				'- title: informational blog headline, keyword front-loaded, no colon character',
				'- modifier: one concise brief for the writer; reference what customers asked',
				'- meta_description: 150-160 characters, no double quotes inside the value',
			)
		);
	}

	/**
	 * @param array<int, array<string, mixed>> $site_index
	 * @return array{
	 *   existing_titles: array<int, string>,
	 *   existing_keywords: array<int, string>,
	 *   service_area_keywords: array<int, string>,
	 *   service_area_titles: array<int, string>
	 * }
	 */
	private static function build_site_context( array $site_index, string $content_type ): array {
		$existing_titles       = array();
		$existing_keywords     = array();
		$service_area_keywords = array();
		$service_area_titles   = array();

		foreach ( $site_index as $item ) {
			if ( ! is_array( $item ) ) {
				continue;
			}

			if ( Neo_Pulse_Wp_Chat_Links::is_service_area_item( $item ) ) {
				$title = isset( $item['title'] ) ? trim( (string) $item['title'] ) : '';
				if ( $title !== '' ) {
					$service_area_titles[] = $title;
				}
				$kw = isset( $item['focus_keyword'] ) ? trim( (string) $item['focus_keyword'] ) : '';
				if ( $kw !== '' ) {
					$service_area_keywords[] = $kw;
				}
				continue;
			}

			$item_type = (string) ( $item['type'] ?? '' );
			if ( 'page' === $content_type && 'page' !== $item_type ) {
				continue;
			}
			if ( 'post' === $content_type && 'post' !== $item_type ) {
				continue;
			}

			$title = isset( $item['title'] ) ? trim( (string) $item['title'] ) : '';
			if ( $title !== '' ) {
				$existing_titles[] = $title;
			}
			$kw = isset( $item['focus_keyword'] ) ? trim( (string) $item['focus_keyword'] ) : '';
			if ( $kw !== '' ) {
				$existing_keywords[] = $kw;
			}
		}

		if ( 'post' === $content_type ) {
			foreach ( Neo_Pulse_Wp_Chat_Links::service_area_items( $site_index ) as $area ) {
				$kw = isset( $area['focus_keyword'] ) ? trim( (string) $area['focus_keyword'] ) : '';
				if ( $kw !== '' ) {
					$service_area_keywords[] = $kw;
				}
			}
			$service_area_keywords = array_values( array_unique( $service_area_keywords ) );
		}

		return array(
			'existing_titles'       => array_values( array_unique( $existing_titles ) ),
			'existing_keywords'     => array_values( array_unique( $existing_keywords ) ),
			'service_area_keywords' => array_values( array_unique( $service_area_keywords ) ),
			'service_area_titles'   => array_values( array_unique( $service_area_titles ) ),
		);
	}

	/**
	 * @param array<int, array{keyword: string, title: string, modifier: string, meta_description: string}> $candidates
	 * @return array<int, array{keyword: string, title: string, modifier: string, meta_description: string}>
	 */
	private static function normalize_ideas_for_csv( array $candidates ): array {
		$out  = array();
		$seen = array();

		foreach ( $candidates as $idea ) {
			if ( count( $out ) >= self::MAX_IDEAS ) {
				break;
			}

			$keyword = isset( $idea['keyword'] ) ? sanitize_text_field( (string) $idea['keyword'] ) : '';
			$title   = isset( $idea['title'] ) ? sanitize_text_field( (string) $idea['title'] ) : '';
			if ( $keyword === '' || $title === '' ) {
				continue;
			}

			$key = Neo_Pulse_Wp_Chat_Insights::normalize_text( $keyword );
			if ( isset( $seen[ $key ] ) ) {
				continue;
			}
			$seen[ $key ] = true;

			$out[] = array(
				'keyword'          => $keyword,
				'title'            => $title,
				'modifier'         => isset( $idea['modifier'] ) ? sanitize_text_field( (string) $idea['modifier'] ) : '',
				'meta_description' => isset( $idea['meta_description'] ) ? sanitize_text_field( (string) $idea['meta_description'] ) : '',
			);
		}

		return $out;
	}

	/**
	 * @param array{
	 *   typed: array<int, array{text: string, count: int, sessions: array<int, string>|array<string, bool>}>,
	 *   chips: array<int, array{text: string, count: int, sessions: array<int, string>|array<string, bool>, context: string}>,
	 *   accepted: array<int, array{label: string, count: int, url: string, context: string}>,
	 *   secondary: array<int, string>,
	 *   predefined_texts: array<int, string>
	 * } $signals
	 * @param array{existing_titles: array<int, string>, existing_keywords: array<int, string>, service_area_keywords: array<int, string>, service_area_titles: array<int, string>} $context
	 */
	private static function build_user_prompt( array $signals, array $context, string $date_from, string $date_to, string $source_filter, string $content_type ): string {
		$site_name = get_bloginfo( 'name' );
		$settings  = Neo_Pulse_Wp_Chat::get_settings();
		$custom    = isset( $settings['custom_prompt'] ) ? trim( (string) $settings['custom_prompt'] ) : '';
		$lines     = array(
			'Site: ' . $site_name,
			'Date range: ' . $date_from . ' to ' . $date_to,
			'Source filter: ' . $source_filter,
			'Content type: ' . $content_type,
		);
		if ( $custom !== '' ) {
			$lines[] = '';
			$lines[] = 'SITE_OWNER_CONTEXT:';
			$lines[] = $custom;
		}

		$lines[] = '';
		if ( 'page' === $content_type ) {
			$lines[] = 'SITE_PAGE_SAMPLE (this site\'s existing top-level pages — ideas must fit this domain):';
			$lines[] = self::format_list_block( array_slice( $context['existing_titles'], 0, 30 ), 30 );
			$lines[] = '';
			$lines[] = 'EXISTING_PAGES (compare semantically — reject same topic, comparison, or search intent):';
			$lines[] = self::format_list_block( $context['existing_titles'], 200 );
			$lines[] = '';
			$lines[] = 'EXISTING_PAGE_KEYWORDS (compare semantically — reject duplicates):';
			$lines[] = self::format_list_block( $context['existing_keywords'], 200 );
			$lines[] = '';
			$lines[] = 'EXISTING_SERVICE_AREA_PAGES (already covered — do not propose new geo/service-area landings):';
			$lines[] = self::format_list_block( $context['service_area_titles'], 100 );
			$lines[] = '';
			$lines[] = 'CANNED_STARTERS (never output as page ideas — ignore unless revealing a genuine on-topic product gap):';
		} else {
			$lines[] = 'SITE_BLOG_SAMPLE (this site\'s existing blog topics — ideas must fit this domain):';
			$lines[] = self::format_list_block( array_slice( $context['existing_titles'], 0, 30 ), 30 );
			$lines[] = '';
			$lines[] = 'EXISTING_BLOG_POSTS (compare semantically — reject same topic, comparison, or search intent):';
			$lines[] = self::format_list_block( $context['existing_titles'], 200 );
			$lines[] = '';
			$lines[] = 'EXISTING_BLOG_KEYWORDS (compare semantically — reject duplicates):';
			$lines[] = self::format_list_block( $context['existing_keywords'], 200 );
			$lines[] = '';
			$lines[] = 'SERVICE_AREA_KEYWORDS (local landing pages only — never use as blog keywords; product/repair content is still valid):';
			$lines[] = self::format_list_block( $context['service_area_keywords'], 100 );
			$lines[] = '';
			$lines[] = 'CANNED_STARTERS (never output as blog ideas — ignore unless revealing a genuine on-topic product gap):';
		}
		$lines[] = self::format_list_block( $signals['predefined_texts'], 50 );
		$lines[] = '';
		$lines[] = 'PRIORITY_SIGNALS:';
		$lines[] = '';
		$lines[] = '1. REPEATED_CUSTOMER_QUESTIONS (>= ' . Neo_Pulse_Wp_Chat_Insights::MIN_CHIP_CLICKS . ' mentions or sessions):';

		if ( empty( $signals['chips'] ) ) {
			$lines[] = '(none met threshold yet)';
		} else {
			foreach ( $signals['chips'] as $row ) {
				$sessions = is_array( $row['sessions'] ) ? count( $row['sessions'] ) : 0;
				$line     = '- "' . $row['text'] . '" (mentions: ' . (int) $row['count'] . ', sessions: ' . $sessions . ', origin: ' . $row['origin'] . ')';
				if ( ! empty( $row['context'] ) ) {
					$line .= ' | ' . $row['context'];
				}
				$lines[] = $line;
			}
		}

		$lines[] = '';
		$lines[] = '2. CUSTOM_TYPED_OR_SINGLE_MENTION_QUERIES:';
		if ( empty( $signals['typed'] ) ) {
			$lines[] = '(none — all questions met repeated threshold above)';
		} else {
			foreach ( $signals['typed'] as $row ) {
				$sessions = is_array( $row['sessions'] ) ? count( $row['sessions'] ) : 0;
				$lines[]  = '- "' . $row['text'] . '" (mentions: ' . (int) $row['count'] . ', sessions: ' . $sessions . ', origin: ' . $row['origin'] . ')';
			}
		}

		$lines[] = '';
		$lines[] = '3. CLICKED_SOURCE_INTEREST:';
		if ( empty( $signals['accepted'] ) ) {
			$lines[] = '(none)';
		} else {
			foreach ( $signals['accepted'] as $row ) {
				$lines[] = '- "' . $row['label'] . '" (clicks: ' . (int) $row['count'] . ', url: ' . $row['url'] . ')';
			}
		}

		$lines[] = '';
		$lines[] = 'SECONDARY_CONTEXT (weak / not-found assistant answers only):';
		if ( empty( $signals['secondary'] ) ) {
			$lines[] = '(none)';
		} else {
			$lines = array_merge( $lines, $signals['secondary'] );
		}

		$lines[] = '';
		if ( 'page' === $content_type ) {
			$lines[] = 'Return up to ' . self::MAX_IDEAS . ' top-level page ideas as JSON matching the schema. You decide what qualifies — compare each idea against existing pages before including it. Evergreen pages only (sitemap_type page).';
		} else {
			$lines[] = 'Return up to ' . self::MAX_IDEAS . ' blog post ideas as JSON matching the schema. You decide what qualifies — compare each idea against existing posts before including it. Informational posts only (sitemap_type post).';
		}

		return implode( "\n", $lines );
	}

	/**
	 * @param array<int, string> $items
	 */
	private static function format_list_block( array $items, int $limit ): string {
		if ( empty( $items ) ) {
			return '(none)';
		}
		$slice = array_slice( $items, 0, $limit );
		if ( count( $items ) > $limit ) {
			$slice[] = '… additional rows omitted …';
		}
		return implode( "\n", $slice );
	}

	/**
	 * @return array<int, array{keyword: string, title: string, modifier: string, meta_description: string}>
	 */
	private static function parse_ideas_response( string $text ): array {
		$decoded = self::parse_json_response( $text );
		if ( ! is_array( $decoded ) || empty( $decoded['ideas'] ) || ! is_array( $decoded['ideas'] ) ) {
			return array();
		}

		$out = array();
		foreach ( $decoded['ideas'] as $idea ) {
			if ( ! is_array( $idea ) ) {
				continue;
			}
			$out[] = array(
				'keyword'          => isset( $idea['keyword'] ) ? (string) $idea['keyword'] : '',
				'title'            => isset( $idea['title'] ) ? (string) $idea['title'] : '',
				'modifier'         => isset( $idea['modifier'] ) ? (string) $idea['modifier'] : '',
				'meta_description' => isset( $idea['meta_description'] ) ? (string) $idea['meta_description'] : '',
			);
		}

		return $out;
	}

	/**
	 * @return array<string, mixed>|null
	 */
	private static function parse_json_response( string $text ): ?array {
		$text = trim( $text );
		$text = preg_replace( '/^```(?:json)?\s*/i', '', $text );
		$text = preg_replace( '/\s*```$/', '', $text );
		$text = trim( (string) $text );

		$decoded = json_decode( $text, true );
		return is_array( $decoded ) ? $decoded : null;
	}

	/**
	 * @param array<int, array{keyword: string, title: string, modifier: string, meta_description: string}> $ideas Ideas.
	 * @param array<int, string>                                                                             $schedule_dates Publish dates.
	 */
	private static function build_csv( array $ideas, array $schedule_dates, string $content_type ): string {
		$lines = array( self::CSV_HEADER );
		foreach ( $ideas as $i => $idea ) {
			$lines[] = implode(
				',',
				array(
					Neo_Pulse_Wp_Csv::cell( $idea['keyword'] ),
					Neo_Pulse_Wp_Csv::cell( '' ),
					Neo_Pulse_Wp_Csv::cell( $idea['title'] ),
					Neo_Pulse_Wp_Csv::cell( $idea['modifier'] ),
					Neo_Pulse_Wp_Csv::cell( 'y' ),
					Neo_Pulse_Wp_Csv::cell( isset( $schedule_dates[ $i ] ) ? (string) $schedule_dates[ $i ] : '' ),
					Neo_Pulse_Wp_Csv::cell( $content_type ),
					Neo_Pulse_Wp_Csv::cell( $idea['meta_description'] ),
					Neo_Pulse_Wp_Csv::cell( '' ),
					Neo_Pulse_Wp_Csv::cell( '' ),
					Neo_Pulse_Wp_Csv::cell( '' ),
				)
			);
		}
		return implode( "\n", $lines );
	}

	/**
	 * @return array<int, string>
	 */
	private static function stagger_publish_dates( string $date_from, string $date_to, int $row_count ): array {
		if ( $row_count <= 0 ) {
			return array();
		}

		$start = strtotime( $date_from . ' 12:00:00 UTC' );
		$end   = strtotime( $date_to . ' 12:00:00 UTC' );
		if ( false === $start || false === $end || $end < $start ) {
			return array_fill( 0, $row_count, '' );
		}

		if ( 1 === $row_count ) {
			return array( gmdate( 'Y-m-d\TH:i:s.000\Z', $start ) );
		}

		$dates = array();
		$span  = $end - $start;
		for ( $i = 0; $i < $row_count; $i++ ) {
			$offset  = (int) round( ( $span * $i ) / ( $row_count - 1 ) );
			$dates[] = gmdate( 'Y-m-d\TH:i:s.000\Z', $start + $offset );
		}
		return $dates;
	}
}
