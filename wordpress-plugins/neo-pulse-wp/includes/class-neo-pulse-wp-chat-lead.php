<?php
/**
 * Lead conversion specialist for NEO Pulse Chat.
 *
 * @package Neo_Pulse_Wp
 */

defined( 'ABSPATH' ) || exit;

class Neo_Pulse_Wp_Chat_Lead {

	const FAST_MODEL                  = 'google/gemini-2.5-flash-lite';
	const CONVERT_MAX_TOKENS          = 1024;
	const CONTACT_MAX_TOKENS          = 512;
	const WIDGET_CONTACT_CACHE_KEY    = 'neo_pulse_chat_widget_contact_facts_v2';
	const WIDGET_CONTACT_CACHE_TTL    = DAY_IN_SECONDS;

	/**
	 * @param array<int,array<string,mixed>> $site_index
	 */
	public static function is_lead_message( string $message, array $site_index = array() ): bool {
		return null !== Neo_Pulse_Wp_Chat_Links::resolve_lead_action( $message, $site_index );
	}

	/**
	 * @param array<string,mixed> $settings
	 */
	public static function is_enabled( array $settings ): bool {
		return ! isset( $settings['lead_conversion_enabled'] ) || ! empty( $settings['lead_conversion_enabled'] );
	}

	/**
	 * @param array<string,mixed> $settings
	 */
	public static function is_chekkit_available( array $settings ): bool {
		$enabled = ! isset( $settings['chekkit_enabled'] ) || ! empty( $settings['chekkit_enabled'] );
		if ( ! $enabled ) {
			return false;
		}
		return class_exists( 'Neo_Pulse_Wp_Chekkit' ) && Neo_Pulse_Wp_Chekkit::is_configured();
	}

	/**
	 * @param array<string,mixed> $classification
	 */
	public static function should_suggest_contact_human( string $message, array $classification ): bool {
		if ( null !== Neo_Pulse_Wp_Chat_Links::detect_lead_action( $message ) ) {
			return true;
		}
		if ( Neo_Pulse_Wp_Chat_Links::is_callback_request( $message ) ) {
			return true;
		}
		if ( Neo_Pulse_Wp_Chat_Links::is_service_coverage_query( $message ) ) {
			return true;
		}
		$intent = isset( $classification['intent'] ) ? (string) $classification['intent'] : '';
		return $intent === 'navigation';
	}

	/**
	 * @param array<string,mixed> $card
	 * @param array<string,mixed> $classification
	 * @param array<string,mixed> $settings
	 * @return array<string,mixed>
	 */
	public static function maybe_attach_contact_human_cta( array $card, string $message, array $classification, array $settings ): array {
		if ( ! self::is_chekkit_available( $settings ) || ! self::should_suggest_contact_human( $message, $classification ) ) {
			return $card;
		}

		$label = isset( $settings['chekkit_cta_label'] ) && trim( (string) $settings['chekkit_cta_label'] ) !== ''
			? (string) $settings['chekkit_cta_label']
			: __( 'Send Us A Text', 'neo-pulse-wp' );

		$card['contactHumanCta'] = array(
			'label'  => $label,
			'action' => 'contact_human',
		);

		unset( $card['cta'] );

		return $card;
	}

	/**
	 * @param array<string,mixed>            $card
	 * @param array<int,array<string,mixed>> $items
	 * @param array<int,array<string,mixed>> $site_index
	 * @param array<string,mixed>            $training
	 * @param array<string,mixed>            $settings
	 * @return array<string,mixed>
	 */
	public static function enrich_card( array $card, string $message, string $answer, array $items, array $site_index, array $training, array $settings ): array {
		if ( ! self::is_enabled( $settings ) ) {
			return $card;
		}

		$lead_action = Neo_Pulse_Wp_Chat_Links::resolve_lead_action( $message, $site_index );
		if ( null === $lead_action ) {
			return $card;
		}

		$lead_pages    = Neo_Pulse_Wp_Chat_Links::find_lead_pages( $message, $site_index, 3 );
		$enriched_lead = Neo_Pulse_Wp_Chat::enrich_relevant_items( $lead_pages, false, $settings );
		$kb            = isset( $training['knowledge_base'] ) && is_array( $training['knowledge_base'] ) ? $training['knowledge_base'] : array();
		$contact_facts = self::resolve_contact_facts( $enriched_lead, $kb );
		$specialist    = self::phase_lead_convert( $message, $lead_action, $answer, $enriched_lead, $contact_facts );

		if ( is_wp_error( $specialist ) ) {
			return $card;
		}

		return self::apply_conversion_to_card( $card, $specialist, $contact_facts, $enriched_lead );
	}

	/**
	 * @return array{email:string,phones:array<int,array{label:string,number:string}>,locations:array<int,array{name:string,address:string,hours:array<int,string>}>}
	 */
	public static function empty_structured_contact(): array {
		return array(
			'email'     => '',
			'phones'    => array(),
			'locations' => array(),
		);
	}

	/**
	 * @param array<int,array<string,mixed>> $lead_pages
	 * @param array<int,array<string,mixed>> $knowledge_base
	 * @return array{email:string,phones:array<int,array{label:string,number:string}>,locations:array<int,array{name:string,address:string,hours:array<int,string>}>}
	 */
	public static function resolve_contact_facts( array $lead_pages, array $knowledge_base ): array {
		$source = self::build_contact_source_text( $lead_pages, $knowledge_base );
		if ( $source === '' ) {
			return self::empty_structured_contact();
		}

		$system = <<<'PROMPT'
Extract contact information from the site content below. Output ONLY valid JSON:
{
  "email": "",
  "phones": [{"label": "Office or location name", "number": "(555) 555-1234"}],
  "locations": [{
    "name": "Location name",
    "address": "Street, City, Region Postal",
    "hours": ["Mon - Fri: 9am - 5pm", "Sat: Closed"]
  }]
}

Rules:
- Include a field only when the source text clearly states it.
- Do not invent or guess phone numbers, emails, addresses, or hours.
- Use one phones entry per distinct number. Set label to the location or city when known.
- Use one locations entry per physical location. Never combine multiple locations into one address or hours string.
- hours must be an array of short lines (one day-range or status per item).
- Use empty string or empty arrays for missing data.
PROMPT;

		$result = self::call_openrouter( self::FAST_MODEL, $system, $source, self::CONTACT_MAX_TOKENS, 0.1 );
		if ( is_wp_error( $result ) ) {
			return self::empty_structured_contact();
		}

		$parsed = self::parse_json_response( (string) $result );
		if ( null === $parsed ) {
			return self::empty_structured_contact();
		}

		return self::normalize_structured_contact_facts( $parsed );
	}

	/**
	 * Cached contact facts for the Talk To A Human modal.
	 *
	 * @param array<string,mixed> $settings
	 * @return array{email:string,phones:array<int,array{label:string,number:string}>,locations:array<int,array{name:string,address:string,hours:array<int,string>}>}
	 */
	public static function get_widget_contact_facts( array $settings ): array {
		$cached = get_transient( self::WIDGET_CONTACT_CACHE_KEY );
		if ( is_array( $cached ) ) {
			return self::normalize_structured_contact_facts( $cached );
		}

		$site_index = Neo_Pulse_Wp_Chat_Rag::get_site_index( $settings );
		$lead_pages = Neo_Pulse_Wp_Chat_Links::find_lead_pages( 'contact us', $site_index, 3 );
		$enriched   = Neo_Pulse_Wp_Chat::enrich_relevant_items( $lead_pages, false, $settings );
		$kb         = isset( $settings['knowledge_base'] ) && is_array( $settings['knowledge_base'] )
			? $settings['knowledge_base']
			: array();
		$facts      = self::resolve_contact_facts( $enriched, $kb );

		set_transient( self::WIDGET_CONTACT_CACHE_KEY, $facts, self::WIDGET_CONTACT_CACHE_TTL );

		return $facts;
	}

	public static function invalidate_widget_contact_cache(): void {
		delete_transient( self::WIDGET_CONTACT_CACHE_KEY );
	}

	/**
	 * @param array<int,array<string,mixed>>                               $lead_pages
	 * @param array{phone:string,email:string,address:string,hours:string} $contact_facts
	 * @return array<string,mixed>|WP_Error
	 */
	public static function phase_lead_convert( string $message, string $lead_action, string $answer, array $lead_pages, array $contact_facts ) {
		$pages_block = self::summarize_lead_pages( $lead_pages );
		$facts_block = wp_json_encode( $contact_facts );

		$system = <<<'PROMPT'
You are a lead conversion specialist for a website chat assistant.
Given the user's message, the drafted answer, contact facts, and lead pages, output ONLY valid JSON:
{
  "conversionHeadline": "Personalized 1-line CTA tied to the answer",
  "contactEmphasis": ["phone", "email", "address", "hours"],
  "ctaLabel": "Short button label",
  "bodyLeadIn": "Optional 1-2 sentence bridge to append after the main answer",
  "relatedTopics": ["follow-up chip 1", "follow-up chip 2"]
}

Rules:
- Personalize to THIS answer and lead action (booking, contact, pricing).
- When the user asked about service coverage for a location not listed on the site, conversionHeadline and bodyLeadIn should invite them to speak with staff to confirm that area — do not imply the area is or is not serviced.
- For pricing, quote, or phone questions: never say quotes or help aren't available by phone or over the phone; invite a free consultation or conversation with staff instead.
- When the user asked to be called: never ask for their phone number. conversionHeadline and bodyLeadIn should invite contacting the store directly or sending a text.
- For any partial answer: conversionHeadline and bodyLeadIn must be inviting and forward-looking — never restate limitations, refusals, or "we don't/can't" language from the draft.
- conversionHeadline and ctaLabel are required non-empty strings.
- contactEmphasis must only include keys present in CONTACT FACTS with non-empty values.
- Never invent contact data.
- relatedTopics: exactly 2 short next-step questions focused on conversion when possible.
- bodyLeadIn must add information not already in the draft answer. Use empty string when the answer already ends with a similar closing line.
- No filler acknowledgments (Certainly, Sure, Of course).
- ctaLabel must match the lead action (book/consult, contact/call, quote/pricing).
PROMPT;

		$user = "Lead action: {$lead_action}\nUser message: {$message}\n\nDraft answer:\n" . substr( $answer, 0, 3000 );
		$user .= "\n\nCONTACT FACTS:\n{$facts_block}";
		if ( $pages_block !== '' ) {
			$user .= "\n\nLEAD PAGES:\n{$pages_block}";
		}

		$result = self::call_openrouter( self::FAST_MODEL, $system, $user, self::CONVERT_MAX_TOKENS, 0.2 );
		if ( is_wp_error( $result ) ) {
			return $result;
		}

		$parsed = self::parse_json_response( (string) $result );
		if ( null === $parsed ) {
			return new WP_Error( 'neo_pulse_chat_lead_parse', __( 'Lead conversion specialist returned invalid JSON.', 'neo-pulse-wp' ) );
		}

		return self::normalize_specialist_output( $parsed, $contact_facts );
	}

	/**
	 * @param array<string,mixed>                                            $card
	 * @param array<string,mixed>                                            $specialist
	 * @param array{phone:string,email:string,address:string,hours:string}   $contact_facts
	 * @param array<int,array<string,mixed>>                                 $lead_pages
	 * @return array<string,mixed>
	 */
	public static function apply_conversion_to_card( array $card, array $specialist, array $contact_facts, array $lead_pages ): array {
		$headline = isset( $specialist['conversionHeadline'] ) ? trim( sanitize_text_field( (string) $specialist['conversionHeadline'] ) ) : '';
		$cta_label = isset( $specialist['ctaLabel'] ) ? trim( sanitize_text_field( (string) $specialist['ctaLabel'] ) ) : '';
		if ( $headline === '' || $cta_label === '' ) {
			return $card;
		}

		$emphasis = isset( $specialist['contactEmphasis'] ) && is_array( $specialist['contactEmphasis'] )
			? $specialist['contactEmphasis']
			: array();

		$conversion = array(
			'headline' => $headline,
			'contact'  => self::filter_contact_by_emphasis( $contact_facts, $emphasis ),
		);

		$body_lead_in = isset( $specialist['bodyLeadIn'] ) ? trim( (string) $specialist['bodyLeadIn'] ) : '';
		if ( $body_lead_in !== '' && ! empty( $card['body'] ) ) {
			$body = (string) $card['body'];
			if ( stripos( $body, $body_lead_in ) === false ) {
				$card['body'] = rtrim( $body ) . "\n\n" . sanitize_textarea_field( $body_lead_in );
			}
		}

		$card['type']       = 'lead';
		$card['conversion'] = $conversion;

		$cta_url = self::lead_page_url( $lead_pages );
		if ( $cta_url !== '' ) {
			$card['cta'] = array(
				'label' => $cta_label,
				'url'   => $cta_url,
			);
		}

		if ( ! empty( $specialist['relatedTopics'] ) && is_array( $specialist['relatedTopics'] ) ) {
			$topics = array();
			foreach ( $specialist['relatedTopics'] as $topic ) {
				if ( ! is_string( $topic ) ) {
					continue;
				}
				$topic = trim( $topic );
				if ( $topic !== '' ) {
					$topics[] = $topic;
				}
				if ( count( $topics ) >= Neo_Pulse_Wp_Chat_Agents::MAX_RELATED_TOPICS ) {
					break;
				}
			}
			if ( count( $topics ) >= Neo_Pulse_Wp_Chat_Agents::MIN_RELATED_TOPICS ) {
				$card['relatedTopics'] = $topics;
			}
		}

		return $card;
	}

	/**
	 * Address of the first lead page (contact, booking or quote), for the card's CTA button.
	 *
	 * @param array<int,array<string,mixed>> $lead_pages
	 */
	private static function lead_page_url( array $lead_pages ): string {
		foreach ( $lead_pages as $page ) {
			if ( ! empty( $page['url'] ) ) {
				return (string) $page['url'];
			}
		}
		return '';
	}

	/**
	 * @param array<int,array<string,mixed>> $lead_pages
	 * @param array<int,array<string,mixed>> $knowledge_base
	 */
	private static function build_contact_source_text( array $lead_pages, array $knowledge_base ): string {
		$parts = array();

		foreach ( $knowledge_base as $entry ) {
			if ( ! is_array( $entry ) ) {
				continue;
			}
			if ( ( $entry['priority'] ?? 'normal' ) !== 'high' ) {
				continue;
			}
			$q = isset( $entry['question'] ) ? trim( (string) $entry['question'] ) : '';
			$a = isset( $entry['answer'] ) ? trim( (string) $entry['answer'] ) : '';
			if ( $a === '' ) {
				continue;
			}
			$blob = strtolower( $q . ' ' . $a );
			if ( self::text_mentions_contact( $blob ) ) {
				$parts[] = $q !== '' ? "{$q}\n{$a}" : $a;
			}
		}

		foreach ( $lead_pages as $page ) {
			$title   = isset( $page['title'] ) ? trim( (string) $page['title'] ) : '';
			$content = isset( $page['excerpt'] ) ? trim( wp_strip_all_tags( (string) $page['excerpt'] ) ) : '';
			if ( $content === '' && isset( $page['content'] ) ) {
				$content = trim( wp_strip_all_tags( (string) $page['content'] ) );
			}
			if ( $content === '' ) {
				continue;
			}
			$parts[] = ( $title !== '' ? $title . "\n" : '' ) . substr( $content, 0, 4000 );
		}

		return implode( "\n\n---\n\n", $parts );
	}

	/**
	 * @param array<string,mixed>                                            $parsed
	 * @param array{phone:string,email:string,address:string,hours:string} $contact_facts
	 * @return array<string,mixed>|WP_Error
	 */
	private static function normalize_specialist_output( array $parsed, array $contact_facts ) {
		$headline = ! empty( $parsed['conversionHeadline'] ) ? trim( sanitize_text_field( (string) $parsed['conversionHeadline'] ) ) : '';
		$cta_label = ! empty( $parsed['ctaLabel'] ) ? trim( sanitize_text_field( (string) $parsed['ctaLabel'] ) ) : '';
		if ( $headline === '' || $cta_label === '' ) {
			return new WP_Error( 'neo_pulse_chat_lead_incomplete', __( 'Lead conversion specialist omitted required fields.', 'neo-pulse-wp' ) );
		}

		$allowed_keys = array();
		foreach ( array( 'phone', 'email', 'address', 'hours' ) as $key ) {
			if ( self::structured_contact_has( $contact_facts, $key ) ) {
				$allowed_keys[ $key ] = true;
			}
		}

		$emphasis = array();
		if ( ! empty( $parsed['contactEmphasis'] ) && is_array( $parsed['contactEmphasis'] ) ) {
			foreach ( $parsed['contactEmphasis'] as $key ) {
				if ( ! is_string( $key ) ) {
					continue;
				}
				$key = strtolower( trim( $key ) );
				if ( isset( $allowed_keys[ $key ] ) ) {
					$emphasis[] = $key;
				}
			}
		}

		$topics = array();
		if ( ! empty( $parsed['relatedTopics'] ) && is_array( $parsed['relatedTopics'] ) ) {
			foreach ( $parsed['relatedTopics'] as $topic ) {
				if ( is_string( $topic ) && trim( $topic ) !== '' ) {
					$topics[] = sanitize_text_field( trim( $topic ) );
				}
			}
		}

		return array(
			'conversionHeadline' => $headline,
			'contactEmphasis'    => $emphasis,
			'ctaLabel'           => $cta_label,
			'bodyLeadIn'         => isset( $parsed['bodyLeadIn'] ) ? sanitize_textarea_field( (string) $parsed['bodyLeadIn'] ) : '',
			'relatedTopics'      => $topics,
		);
	}

	/**
	 * @param array{email:string,phones:array<int,array{label:string,number:string}>,locations:array<int,array{name:string,address:string,hours:array<int,string>}>} $contact_facts
	 * @param array<int,string>                                                                                                                      $emphasis
	 * @return array{email:string,phones:array<int,array{label:string,number:string}>,locations:array<int,array{name:string,address:string,hours:array<int,string>}>}
	 */
	private static function filter_contact_by_emphasis( array $contact_facts, array $emphasis ): array {
		$structured = self::normalize_structured_contact_facts( $contact_facts );
		if ( empty( $emphasis ) ) {
			return $structured;
		}

		$out = self::empty_structured_contact();
		foreach ( $emphasis as $key ) {
			$key = strtolower( sanitize_key( (string) $key ) );
			if ( $key === 'email' && $structured['email'] !== '' ) {
				$out['email'] = $structured['email'];
			}
			if ( $key === 'phone' && ! empty( $structured['phones'] ) ) {
				$out['phones'] = $structured['phones'];
			}
			if ( in_array( $key, array( 'address', 'hours' ), true ) && ! empty( $structured['locations'] ) ) {
				$out['locations'] = $structured['locations'];
			}
		}

		return $out;
	}

	/**
	 * @param array<string,mixed> $parsed
	 * @return array{email:string,phones:array<int,array{label:string,number:string}>,locations:array<int,array{name:string,address:string,hours:array<int,string>}>}
	 */
	private static function normalize_structured_contact_facts( array $parsed ): array {
		$out = self::empty_structured_contact();
		$out['email'] = self::sanitize_contact_field( $parsed, 'email', 120 );

		if ( ! empty( $parsed['phones'] ) && is_array( $parsed['phones'] ) ) {
			foreach ( $parsed['phones'] as $row ) {
				if ( ! is_array( $row ) ) {
					continue;
				}
				$number = isset( $row['number'] ) ? sanitize_text_field( trim( (string) $row['number'] ) ) : '';
				if ( $number === '' ) {
					continue;
				}
				$label = isset( $row['label'] ) ? sanitize_text_field( trim( (string) $row['label'] ) ) : '';
				$out['phones'][] = array(
					'label'  => substr( $label, 0, 80 ),
					'number' => substr( $number, 0, 40 ),
				);
			}
		}

		if ( ! empty( $parsed['locations'] ) && is_array( $parsed['locations'] ) ) {
			foreach ( $parsed['locations'] as $row ) {
				if ( ! is_array( $row ) ) {
					continue;
				}
				$address = isset( $row['address'] ) ? sanitize_text_field( trim( (string) $row['address'] ) ) : '';
				$name    = isset( $row['name'] ) ? sanitize_text_field( trim( (string) $row['name'] ) ) : '';
				$hours   = array();
				if ( ! empty( $row['hours'] ) && is_array( $row['hours'] ) ) {
					foreach ( $row['hours'] as $line ) {
						if ( ! is_string( $line ) ) {
							continue;
						}
						$line = sanitize_text_field( trim( $line ) );
						if ( $line !== '' ) {
							$hours[] = substr( $line, 0, 120 );
						}
					}
				} elseif ( ! empty( $row['hours'] ) && is_string( $row['hours'] ) ) {
					foreach ( preg_split( '/\s*;\s*/', trim( $row['hours'] ) ) as $line ) {
						$line = sanitize_text_field( trim( (string) $line ) );
						if ( $line !== '' ) {
							$hours[] = substr( $line, 0, 120 );
						}
					}
				}
				if ( $name === '' && $address === '' && empty( $hours ) ) {
					continue;
				}
				$out['locations'][] = array(
					'name'    => substr( $name, 0, 80 ),
					'address' => substr( $address, 0, 240 ),
					'hours'   => $hours,
				);
			}
		}

		if ( empty( $out['phones'] ) && ! empty( $parsed['phone'] ) && is_string( $parsed['phone'] ) ) {
			foreach ( preg_split( '/\s*,\s*/', trim( $parsed['phone'] ) ) as $number ) {
				$number = sanitize_text_field( trim( (string) $number ) );
				if ( $number !== '' ) {
					$out['phones'][] = array(
						'label'  => '',
						'number' => substr( $number, 0, 40 ),
					);
				}
			}
		}

		if ( empty( $out['locations'] ) ) {
			$legacy_address = self::sanitize_contact_field( $parsed, 'address', 240 );
			$legacy_hours   = self::sanitize_contact_field( $parsed, 'hours', 240 );
			if ( $legacy_address !== '' || $legacy_hours !== '' ) {
				$out['locations'] = self::legacy_flat_locations( $legacy_address, $legacy_hours );
			}
		}

		return $out;
	}

	/**
	 * @return array<int,array{name:string,address:string,hours:array<int,string>}>}
	 */
	private static function legacy_flat_locations( string $address, string $hours ): array {
		$hour_lines = array();
		if ( $hours !== '' ) {
			foreach ( explode( ';', $hours ) as $line ) {
				$line = sanitize_text_field( trim( (string) $line ) );
				if ( $line !== '' ) {
					$hour_lines[] = substr( $line, 0, 120 );
				}
			}
		}
		if ( $address === '' && empty( $hour_lines ) ) {
			return array();
		}
		return array(
			array(
				'name'    => '',
				'address' => substr( sanitize_text_field( $address ), 0, 240 ),
				'hours'   => $hour_lines,
			),
		);
	}

	private static function structured_contact_has( array $contact_facts, string $key ): bool {
		$structured = self::normalize_structured_contact_facts( $contact_facts );
		if ( $key === 'phone' ) {
			return ! empty( $structured['phones'] );
		}
		if ( $key === 'email' ) {
			return $structured['email'] !== '';
		}
		if ( $key === 'address' || $key === 'hours' ) {
			return ! empty( $structured['locations'] );
		}
		return false;
	}

	/**
	 * @param array<int,array<string,mixed>> $lead_pages
	 */
	private static function summarize_lead_pages( array $lead_pages ): string {
		$lines = array();
		foreach ( $lead_pages as $page ) {
			if ( empty( $page['title'] ) ) {
				continue;
			}
			$url     = isset( $page['url'] ) ? (string) $page['url'] : '';
			$lines[] = '- ' . (string) $page['title'] . ( $url !== '' ? ' → ' . $url : '' );
		}
		return implode( "\n", $lines );
	}

	private static function text_mentions_contact( string $text ): bool {
		$needles = array( 'phone', 'email', 'contact', 'address', 'hours', 'call', 'location', '@', 'tel' );
		foreach ( $needles as $needle ) {
			if ( strpos( $text, $needle ) !== false ) {
				return true;
			}
		}
		return false;
	}

	/**
	 * @param array<string,mixed> $parsed
	 */
	private static function sanitize_contact_field( array $parsed, string $key, int $max_len ): string {
		if ( empty( $parsed[ $key ] ) || ! is_string( $parsed[ $key ] ) ) {
			return '';
		}
		return substr( sanitize_text_field( trim( $parsed[ $key ] ) ), 0, $max_len );
	}

	/**
	 * @return string|WP_Error
	 */
	private static function call_openrouter( string $model, string $system_prompt, string $user_prompt, int $max_tokens, float $temperature ) {
		$key = Neo_Pulse_Wp_OpenRouter::get_api_key();
		if ( $key === '' ) {
			return new WP_Error(
				'neo-pulse_openrouter_key',
				__( 'OpenRouter API key is not configured.', 'neo-pulse-wp' )
			);
		}

		Neo_Pulse_Wp_OpenRouter::maybe_extend_time_limit();

		$response = wp_remote_post(
			Neo_Pulse_Wp_OpenRouter::API_URL,
			array(
				'timeout' => Neo_Pulse_Wp_OpenRouter::get_timeout(),
				'headers' => Neo_Pulse_Wp_OpenRouter::request_headers( $key ),
				'body'    => wp_json_encode(
					array(
						'model'       => $model,
						'messages'    => array(
							array( 'role' => 'system', 'content' => $system_prompt ),
							array( 'role' => 'user', 'content' => $user_prompt ),
						),
						'temperature' => $temperature,
						'max_tokens'  => $max_tokens,
					)
				),
			)
		);

		if ( is_wp_error( $response ) ) {
			return $response;
		}

		$code = (int) wp_remote_retrieve_response_code( $response );
		$raw  = wp_remote_retrieve_body( $response );
		$data = json_decode( $raw, true );

		if ( $code < 200 || $code >= 300 ) {
			return new WP_Error( 'neo_pulse_chat_lead_ai', __( 'Lead conversion AI request failed.', 'neo-pulse-wp' ) );
		}

		if ( ! is_array( $data ) || empty( $data['choices'][0]['message']['content'] ) ) {
			return new WP_Error( 'neo_pulse_chat_lead_empty', __( 'Lead conversion AI returned empty content.', 'neo-pulse-wp' ) );
		}

		return trim( (string) $data['choices'][0]['message']['content'] );
	}

	/**
	 * @return array|null
	 */
	private static function parse_json_response( string $text ): ?array {
		$text    = trim( $text );
		$text    = preg_replace( '/^```(?:json)?\s*/i', '', $text );
		$text    = preg_replace( '/\s*```$/', '', $text );
		$text    = trim( $text );
		$decoded = json_decode( $text, true );
		return is_array( $decoded ) ? $decoded : null;
	}
}
