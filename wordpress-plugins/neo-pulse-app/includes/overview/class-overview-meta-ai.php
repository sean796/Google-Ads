<?php
/**
 * Overview meta optimizer via OpenRouter (WordPress REST + wp_remote_post).
 *
 * @package Neo_Pulse_App
 */

defined( 'ABSPATH' ) || exit;

class Neo_Pulse_App_Overview_Meta_Ai {

	const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
	const DEFAULT_MODEL  = 'google/gemini-2.5-flash-lite';

	private static function exclude_meta_keys(): array {
		return array(
			'_elementor_data',
			'_elementor_edit_mode',
			'_elementor_template_type',
			'_elementor_css',
			'_elementor_page_settings',
		);
	}

	/**
	 * @param array<string,mixed> $params
	 * @return array<string,mixed>
	 */
	public static function run_optimize_meta_ai( array $params ): array {
		$url = trim( (string) ( $params['url'] ?? '' ) );
		if ( $url === '' ) {
			throw new Exception( 'url is required' );
		}

		$api_key = trim( (string) ( $params['openRouterApiKey'] ?? Neo_Pulse_App_Secrets::openrouter_api_key() ) );
		if ( $api_key === '' ) {
			throw new Exception( 'openRouterApiKey or OPENROUTER_API_KEY is required for the Meta Optimizer AI step.' );
		}

		$wp = isset( $params['wordpress'] ) && is_array( $params['wordpress'] ) ? $params['wordpress'] : null;
		if ( ! $wp || empty( $wp['siteUrl'] ) || empty( $wp['username'] ) || empty( $wp['appPassword'] ) ) {
			throw new Exception( 'wordpress: { siteUrl, username, appPassword } is required. Meta optimization uses the Content Optimizer pipeline (authenticated WordPress REST), not public page scraping.' );
		}

		$site_url_norm = rtrim( (string) $wp['siteUrl'], '/' );
		$resolved      = self::resolve_url( $site_url_norm, (string) $wp['username'], (string) $wp['appPassword'], $url );
		if ( ! $resolved ) {
			throw new Exception( 'Could not resolve this URL to a WordPress post. Check the permalink and REST access.' );
		}

		$post_type          = ( $resolved['subtype'] ?? '' ) === 'page' ? 'page' : 'post';
		$post_type_endpoint = ( $resolved['endpoint'] ?? '' ) === 'pages' ? 'pages' : 'posts';
		$meta_payload       = self::get_post_meta( $site_url_norm, (string) $wp['username'], (string) $wp['appPassword'], (int) $resolved['id'], $post_type_endpoint );

		if ( empty( $meta_payload['success'] ) ) {
			throw new Exception( (string) ( $meta_payload['error'] ?? 'Failed to load post meta from WordPress' ) );
		}

		$existing_meta = is_array( $meta_payload['meta'] ?? null ) ? $meta_payload['meta'] : array();
		$post_title    = self::strip_html( (string) ( $meta_payload['title'] ?? '' ) ) ?: '(no title)';
		$content_html  = (string) ( $meta_payload['content'] ?? '' );
		$text_content  = ( false !== strpos( $content_html, '<' ) && false !== strpos( $content_html, '>' ) ) ? self::strip_html( $content_html ) : $content_html;
		$limited       = substr( $text_content, 0, 5000 );

		$raw_desc = ! empty( $existing_meta['neo_pulse_seo_description'] ) && is_string( $existing_meta['neo_pulse_seo_description'] )
			? trim( $existing_meta['neo_pulse_seo_description'] )
			: substr( self::strip_html( (string) ( $meta_payload['excerpt'] ?? '' ) ), 0, 300 );
		$limited_meta_description = $raw_desc ? substr( preg_replace( '/\s+/', ' ', wp_strip_all_tags( $raw_desc ) ), 0, 300 ) : '';

		$post_link       = ! empty( $meta_payload['link'] ) ? trim( (string) $meta_payload['link'] ) : $url;
		$is_page         = $post_type === 'page';
		$primary_keyword = self::infer_primary_keyword( $post_link, $post_title, $params['primaryKeyword'] ?? '' );

		$existing_for_prompt = array();
		foreach ( $existing_meta as $k => $v ) {
			if ( in_array( $k, self::exclude_meta_keys(), true ) ) {
				continue;
			}
			$s = is_string( $v ) ? $v : wp_json_encode( $v );
			if ( is_string( $s ) && strlen( $s ) <= 2000 ) {
				$existing_for_prompt[ $k ] = $v;
			}
		}

		$acf = is_array( $meta_payload['acf'] ?? null ) ? $meta_payload['acf'] : array();
		$seo_brief = ! empty( $acf['seo_research'] ) && is_string( $acf['seo_research'] ) ? substr( trim( $acf['seo_research'] ), 0, 4000 ) : '';

		$system_prompt = self::system_prompt( $is_page, $seo_brief !== '' );
		$user_prompt   = self::user_prompt( $post_title, $limited_meta_description, $primary_keyword, $limited, $site_url_norm, $post_link, $seo_brief, $existing_for_prompt, $is_page );

		$model = defined( 'NEO_PULSE_APP_EMAIL_AGENT_MODEL' ) ? (string) NEO_PULSE_APP_EMAIL_AGENT_MODEL : self::DEFAULT_MODEL;
		$ai    = self::openrouter_chat( $api_key, $model, $system_prompt, $user_prompt );

		$optimized = self::parse_json_object( $ai );
		if ( ! empty( $optimized['neo_pulse_seo_title'] ) && strlen( (string) $optimized['neo_pulse_seo_title'] ) > 60 ) {
			$optimized['neo_pulse_seo_title'] = substr( trim( (string) $optimized['neo_pulse_seo_title'] ), 0, 60 );
		}
		$desc = (string) ( $optimized['neo_pulse_seo_description'] ?? '' );
		if ( $desc && $primary_keyword && false === stripos( $desc, $primary_keyword ) ) {
			$optimized['neo_pulse_seo_description'] = trim( $desc ) . ' Learn more about ' . $primary_keyword . '.';
		}
		if ( empty( $optimized['neo_pulse_seo_focus_keyword'] ) ) {
			$optimized['neo_pulse_seo_focus_keyword'] = $primary_keyword;
		}
		if ( empty( $optimized['neo_pulse_seo_canonical_url'] ) && $post_link ) {
			$optimized['neo_pulse_seo_canonical_url'] = $post_link;
		}

		$final_meta = array_merge( $existing_meta, $optimized );
		$final_meta['neo_pulse_seo_focus_keyword'] = $primary_keyword;
		if ( trim( $primary_keyword ) !== '' ) {
			$final_meta['keyword_focus'] = trim( $primary_keyword );
		}

		$prop_title = trim( (string) ( $optimized['neo_pulse_seo_title'] ?? '' ) );
		$prop_desc  = trim( (string) ( $optimized['neo_pulse_seo_description'] ?? '' ) );
		$live_t     = trim( (string) ( $existing_meta['neo_pulse_seo_title'] ?? $post_title ) );
		$live_d     = trim( (string) ( $existing_meta['neo_pulse_seo_description'] ?? $limited_meta_description ) );
		$norm       = static function ( $s ) {
			return strtolower( preg_replace( '/\s+/', ' ', trim( (string) $s ) ) );
		};
		$title_similar = $prop_title && $live_t && $norm( $prop_title ) === $norm( $live_t );
		$desc_similar  = $prop_desc && $live_d && $norm( $prop_desc ) === $norm( $live_d );

		return array(
			'tool'                      => 'neo-pulse_meta_optimizer',
			'wordpressPostType'         => $post_type,
			'wordpressPostTypeEndpoint' => $post_type_endpoint,
			'explanation'               => array(
				'what_happened'               => 'Loaded this post via WordPress REST (authenticated post meta + content, not public HTML). Ran the same meta-field AI as src/lib/meta-field-optimizer.ts.',
				'live_snapshot_from_wordpress' => array(
					'post_id'                   => $resolved['id'],
					'post_type'                 => $post_type,
					'title'                     => $post_title,
					'neo_pulse_seo_title_before'    => $existing_meta['neo_pulse_seo_title'] ?? null,
					'neo_pulse_seo_description_before' => $existing_meta['neo_pulse_seo_description'] ?? null,
				),
				'proposed_neo_pulse_seo'          => array(
					'neo_pulse_seo_title'       => $final_meta['neo_pulse_seo_title'] ?? null,
					'neo_pulse_seo_description' => $final_meta['neo_pulse_seo_description'] ?? null,
					'neo_pulse_seo_focus_keyword' => $final_meta['neo_pulse_seo_focus_keyword'] ?? null,
				),
				'similarity_note'             => $title_similar && $desc_similar
					? 'Proposed SEO title and meta are very close to what is already stored - page may already be well tuned.'
					: ( $title_similar ? 'Title similar to current - check description and social fields.' : ( $desc_similar ? 'Meta similar to current - title or social fields may carry most of the change.' : 'Proposed fields differ from stored meta - review attachment for full merged JSON.' ) ),
			),
			'source'                    => array(
				'url'             => $url,
				'title'           => $post_title,
				'metaDescription' => $limited_meta_description,
				'primaryKeyword'  => $primary_keyword,
				'isPage'          => $is_page,
				'wordpressPostId' => $resolved['id'],
			),
			'optimizedMeta'             => $final_meta,
		);
	}

	private static function strip_html( string $html ): string {
		if ( $html === '' ) {
			return '';
		}
		$html = preg_replace( '/<script[^>]*>[\s\S]*?<\/script>/i', ' ', $html );
		$html = preg_replace( '/<style[^>]*>[\s\S]*?<\/style>/i', ' ', $html );
		return trim( preg_replace( '/\s+/', ' ', wp_strip_all_tags( (string) $html ) ) );
	}

	private static function infer_primary_keyword( string $url, string $title, $explicit ): string {
		$e = is_string( $explicit ) ? trim( $explicit ) : '';
		if ( strlen( $e ) >= 2 ) {
			return $e;
		}
		$parts = wp_parse_url( $url );
		$path  = isset( $parts['path'] ) ? trim( $parts['path'], '/' ) : '';
		$segs  = $path !== '' ? explode( '/', $path ) : array();
		$last  = $segs ? end( $segs ) : '';
		$slug  = trim( preg_replace( '/\.(html?|php)$/i', '', str_replace( '-', ' ', (string) $last ) ) );
		if ( strlen( $slug ) >= 3 ) {
			return $slug;
		}
		$t = trim( $title );
		if ( strlen( $t ) >= 3 ) {
			return substr( implode( ' ', array_slice( preg_split( '/\s+/', $t ), 0, 5 ) ), 0, 80 );
		}
		return 'seo';
	}

	/** @return array<string,mixed>|null */
	private static function resolve_url( string $site_url, string $username, string $app_password, string $url ) {
		$slug = basename( untrailingslashit( wp_parse_url( $url, PHP_URL_PATH ) ?: '' ) );
		foreach ( array( 'posts', 'pages' ) as $endpoint ) {
			$api = $site_url . '/wp-json/wp/v2/' . $endpoint . '?slug=' . rawurlencode( $slug ) . '&context=edit';
			$res = self::wp_get( $api, $username, $app_password );
			if ( is_array( $res ) && ! empty( $res[0]['id'] ) ) {
				return array(
					'id'       => (int) $res[0]['id'],
					'subtype'  => $endpoint === 'pages' ? 'page' : 'post',
					'endpoint' => $endpoint,
				);
			}
		}
		return null;
	}

	/** @return array<string,mixed> */
	private static function get_post_meta( string $site_url, string $username, string $app_password, int $post_id, string $endpoint ): array {
		$api = $site_url . '/wp-json/wp/v2/' . $endpoint . '/' . $post_id . '?context=edit';
		$res = self::wp_get( $api, $username, $app_password );
		if ( ! is_array( $res ) ) {
			return array( 'success' => false, 'error' => is_string( $res ) ? $res : 'WordPress API request failed' );
		}
		$title = is_array( $res['title'] ?? null ) ? (string) ( $res['title']['rendered'] ?? '' ) : (string) ( $res['title'] ?? '' );
		$content = is_array( $res['content'] ?? null ) ? (string) ( $res['content']['rendered'] ?? '' ) : '';
		$excerpt = is_array( $res['excerpt'] ?? null ) ? (string) ( $res['excerpt']['rendered'] ?? '' ) : '';
		return array(
			'success' => true,
			'postId'  => $post_id,
			'meta'    => is_array( $res['meta'] ?? null ) ? $res['meta'] : array(),
			'acf'     => is_array( $res['acf'] ?? null ) ? $res['acf'] : array(),
			'title'   => $title,
			'content' => $content,
			'excerpt' => $excerpt,
			'link'    => (string) ( $res['link'] ?? '' ),
		);
	}

	/** @return array<string,mixed>|array<int,mixed>|string|null */
	private static function wp_get( string $url, string $username, string $app_password ) {
		$response = wp_remote_get(
			$url,
			array(
				'timeout' => 30,
				'headers' => array(
					'Authorization' => 'Basic ' . base64_encode( $username . ':' . $app_password ),
					'Accept'        => 'application/json',
				),
			)
		);
		if ( is_wp_error( $response ) ) {
			return $response->get_error_message();
		}
		$code = (int) wp_remote_retrieve_response_code( $response );
		$data = json_decode( wp_remote_retrieve_body( $response ), true );
		if ( $code < 200 || $code >= 300 ) {
			$msg = is_array( $data ) && ! empty( $data['message'] ) ? (string) $data['message'] : 'HTTP ' . $code;
			return $msg;
		}
		return is_array( $data ) ? $data : null;
	}

	private static function openrouter_chat( string $api_key, string $model, string $system, string $user ): string {
		$response = wp_remote_post(
			self::OPENROUTER_URL,
			array(
				'timeout' => 120,
				'headers' => Neo_Pulse_App_Openrouter_Attribution::request_headers( $api_key ),
				'body'    => wp_json_encode(
					array(
						'model'       => $model,
						'messages'    => array(
							array( 'role' => 'system', 'content' => $system ),
							array( 'role' => 'user', 'content' => $user ),
						),
						'temperature' => 0.7,
						'max_tokens'  => 4000,
					)
				),
			)
		);
		if ( is_wp_error( $response ) ) {
			throw new Exception( $response->get_error_message() );
		}
		$code = (int) wp_remote_retrieve_response_code( $response );
		$json = json_decode( wp_remote_retrieve_body( $response ), true );
		if ( $code < 200 || $code >= 300 ) {
			$msg = is_array( $json ) ? ( $json['error']['message'] ?? $json['message'] ?? wp_remote_retrieve_response_message( $response ) ) : 'OpenRouter error';
			throw new Exception( 'OpenRouter ' . $code . ': ' . $msg );
		}
		$content = trim( (string) ( $json['choices'][0]['message']['content'] ?? '' ) );
		if ( $content === '' ) {
			throw new Exception( 'Meta optimizer returned empty content' );
		}
		return $content;
	}

	/** @return array<string,mixed> */
	private static function parse_json_object( string $raw ): array {
		if ( preg_match( '/\{[\s\S]*\}/', $raw, $m ) ) {
			$parsed = json_decode( $m[0], true );
		} else {
			$parsed = json_decode( $raw, true );
		}
		if ( ! is_array( $parsed ) ) {
			throw new Exception( 'Failed to parse meta optimizer JSON' );
		}
		return $parsed;
	}

	private static function system_prompt( bool $is_page, bool $has_brief ): string {
		$brief = $has_brief ? "\nSEO CONTENT BRIEF (from ACF seo_research when present): included in the user message. Use it as a signal for intent and angles when writing the SEO title, meta description, and social fields. Do NOT paste raw brief into outputs verbatim.\n" : '';
		$page_desc = $is_page
			? ' Naturally FRONT-LOAD the exact post title at the very beginning of the description (no quotes, no labels), then continue with a clear value proposition.'
			: ' Do NOT include the post title in the description. Start with a direct question hook or concrete benefit statement, then include a clear value proposition.';
		return 'You are a senior SEO content specialist optimizing WordPress SEO meta fields. Analyze the post and write accurate, neutral titles and descriptions aligned with search intent.

CRITICAL REQUIREMENTS:
1. SEO title: 50-60 characters, primary keyword near the BEGINNING. Colons are forbidden in titles. No brand prefix.
2. Meta description: 150-160 characters. MUST include the Focus Keyword clearly.' . $page_desc . '
3. Focus keyword: Use the exact primary keyword provided
4. Canonical URL: Use the post link if provided
5. Robots meta: Preserve existing value or use ["index", "follow"] if not present
6. Social meta: Optimize Facebook and Twitter titles/descriptions
7. Preserve ALL other existing meta fields
8. Never invent testimonials or fake review quotes in meta fields.
' . $brief . '
Return ONLY a valid JSON object with optimized meta field keys matching EXISTING META FIELDS.';
	}

	/** @param array<string,mixed> $existing */
	private static function user_prompt( string $post_title, string $meta_desc, string $keyword, string $content, string $site_url, string $post_link, string $brief, array $existing, bool $is_page ): string {
		$page_rule = $is_page
			? ' Begin by naturally weaving in the exact POST TITLE at the very start of the sentence (no quotes, no "Title:" label).'
			: ' Do NOT include the post title in the description. Start with a question hook or benefit statement.';
		$brief_block = $brief !== '' ? "\nSEO CONTENT BRIEF (ACF seo_research)\n{$brief}\n" : '';
		return "Analyze this WordPress post and generate optimized meta fields:

POST TITLE: {$post_title}
META DESCRIPTION: " . ( $meta_desc ?: 'Not provided' ) . "
PRIMARY KEYWORD: {$keyword}
POST CONTENT (first 5000 chars): {$content}
SITE URL: {$site_url}
POST LINK: {$post_link}
{$brief_block}
EXISTING META FIELDS:
" . wp_json_encode( $existing, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES ) . "

Generate optimized meta fields. Meta description must include \"{$keyword}\" clearly.{$page_rule}
Return ONLY a JSON object with the optimized meta fields.";
	}
}
