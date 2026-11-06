<?php
/**
 * Prompt format rules and final card normalization.
 *
 * @package Neo_Pulse_App
 */

defined( 'ABSPATH' ) || exit;

trait Neo_Pulse_App_Pulse_Assist_Ask_Trait_Prompt_Rules_Card_Finalize {

	private static function certainty_rules(): string {
		return implode(
			"\n",
			array(
				'Tone and certainty:',
				'- You know the NEO Pulse manager UI exactly. Give direct instructions with exact tab names, toolbar labels, and flyout items.',
				'- Do not hedge: never use might, maybe, perhaps, could be, similar to, or "or similar".',
				'- State product behavior as fact. Do not guess alternate button names.',
				'- If a connected integration site is required, say so directly (Integrations → select an enabled property).',
			)
		);
	}

	private static function minimal_global_ui_rules(): string {
		return implode(
			"\n",
			array(
				'Global NEO Pulse rules:',
				'- **Overview** = Generator → Opt (`pulse:nav/generator/opt` or `#generator`), not a top-level tab.',
				'- **Dashboard / Settings** tab uses hash `#settings`, not `#dashboard`.',
				'- Assist sidebar: **Page** vs **Site** scope; **Ask** / **Plan** / **Build** submode pill in the composer.',
				'- Bulk meta on Overview: **AISEO** flyout → **Meta** → **All Meta** or **MD**; flyouts cannot be deep-linked (use **bold** labels).',
				'- OpenRouter key: [Dashboard → API Keys](pulse:nav/dashboard/api-keys).',
			)
		);
	}

	private static function markdown_format_rules(): string {
		return implode(
			"\n",
			array(
				'Format the body field as readable Markdown:',
				'- Use ## section headings with blank lines before and after each section.',
				'- Never pack multiple data items (keywords, queries, posts, grades) into long paragraphs. Use structure instead.',
				'- For 3+ items with metrics (GSC queries, rankings, comparisons), use a markdown table or a bullet list with one item per line.',
				'- Use numbered lists (1. 2. 3.) for step-by-step instructions; one action per step.',
				'- Use bullet lists for options, tips, feature lists, and keyword/query breakdowns.',
				'- Use Markdown tables when comparing items or listing fields (| Column | Column |).',
				'- Keep the intro to 1-2 short sentences, then ## sections with lists or tables. No wall-of-text answers.',
				'- Put a blank line between paragraphs, lists, and sections.',
				'- Bold **UI labels** for tabs, buttons, pills, and fields the user clicks in NEO Pulse.',
				'- Bold **GSC queries**, **keywords**, **post titles**, and **entity names** without wrapping them in quotation marks. Never write "term" or \'term\' for emphasis; use **term** instead.',
				'- For external site pages or posts, link the title only: [Page title](https://...). Never repeat the raw URL on its own line or in parentheses.',
				'- When Researched data includes a Blog performers (GSC) table, reproduce that table as the main answer body section.',
				'- Do not put "NEO Pulse Assist" in title or at the start of body. Title = short topic headline or empty. Body starts with the first sentence of the answer.',
				'- body is required on every response. Never return an empty body.',
			)
		);
	}

	private static function navigation_link_rules(): string {
		return implode(
			"\n",
			array(
				'In-app navigation links:',
				'- Prefer pulseNav and hash links from the researched module docs above.',
				'- Valid href forms: `pulse:nav/users`, `pulse:nav/generator/opt`, `#users`, `#chat`, `#settings`.',
				'- Use markdown `[Teams → Users](pulse:nav/users)` or `[Teams → Users](#users)` inside numbered steps.',
				'- Every app module you name as a destination MUST include a markdown link in body AND a matching links array entry with pulseNav from the researched module doc.',
				'- If you tell the user to open Chat, Users, Integrations, Overview, or any other module, link it. Never describe a destination without a clickable link.',
				'- Never say "open Overview" when the destination is Chat, Users, Integrations, or another specific module.',
				'- Flyouts (AISEO bulk menus) cannot be deep-linked; use **bold** for those labels.',
				'- When a primary destination helps the user, add a links array entry: {"label":"Teams → Users","url":"pulse:nav/users","action":"navigate"}.',
				'- links array: include only destinations you tell the user to open in this answer (usually one). Do not add Chat, Overview/Opt, or other modules unless the body directs the user there.',
			)
		);
	}

	private static function followup_topic_rules(): string {
		return implode(
			"\n",
			array(
				'Follow-up chips (relatedTopics):',
				'- Exactly 3 short questions copied from researched feature playbook question fields for sibling features in the same module(s).',
				'- Do not repeat the user\'s current question.',
				'- Write plain questions without quotation marks around keywords or queries.',
				'- Do not use generic chips like "What can I do on this tab?", "What property am I working on?", or "Explain Page vs Site scope".',
			)
		);
	}

	private static function feature_playbook_rules(): string {
		return implode(
			"\n",
			array(
				'Feature playbook rules:',
				'- Use playbook numbered steps only for the specific feature the user asked about.',
				'- For general questions (e.g. "Is there a chat feature?", "Can I chat with users?"), answer from module docs. Do not lead with unrelated playbook steps.',
				'- Never dump multiple feature playbooks into the answer unless the user asked about each one.',
				'- When a playbook applies, use its numbered steps with exact UI labels. Do not invent steps.',
				'- body is required. Never return an empty body.',
			)
		);
	}

	/**
	 * @param array<string,mixed>      $card
	 * @param array<string,mixed>      $body
	 * @param array<string,mixed>|null $research
	 * @return array<string,mixed>
	 */
	private static function finalize_card( array $card, string $message, array $body, ?array $research ): array {
		if ( trim( (string) ( $card['body'] ?? '' ) ) === '' ) {
			return $card;
		}
		$card = self::ensure_destination_links( $card, $research );
		$card = self::ensure_topic_followups( $card, $message, $research );
		if ( ! empty( $card['body'] ) ) {
			$card['body'] = self::normalize_assist_display_markdown( (string) $card['body'] );
		}
		if ( ! empty( $card['relatedTopics'] ) && is_array( $card['relatedTopics'] ) ) {
			$card['relatedTopics'] = self::normalize_assist_related_topics( $card['relatedTopics'] );
		}
		if ( ! empty( $card['suggested_actions'] ) && is_array( $card['suggested_actions'] ) ) {
			$card['suggested_actions'] = self::normalize_assist_related_topics( $card['suggested_actions'] );
		}
		return $card;
	}

	private static function normalize_assist_display_markdown( string $body ): string {
		if ( $body === '' ) {
			return '';
		}
		$normalized = preg_replace( '/\*\*"([^"]+)"\*\*/', '**$1**', $body );
		$normalized = is_string( $normalized ) ? $normalized : $body;
		$normalized = preg_replace( "/\\*\\*'([^']+)'\\*\\*/", '**$1**', $normalized );
		$normalized = is_string( $normalized ) ? $normalized : $body;
		$normalized = self::sanitize_assist_markdown_links( $normalized );
		return is_string( $normalized ) ? $normalized : $body;
	}

	private static function sanitize_assist_markdown_links( string $body ): string {
		return preg_replace_callback(
			'/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/',
			static function ( array $matches ): string {
				$label = trim( (string) ( $matches[1] ?? '' ) );
				$url   = trim( (string) ( $matches[2] ?? '' ) );
				if ( $label === '' || $url === '' ) {
					return $matches[0];
				}
				$suffix = ' (' . $url . ')';
				if ( str_ends_with( $label, $suffix ) ) {
					$label = substr( $label, 0, -strlen( $suffix ) );
				}
				return '[' . $label . '](' . $url . ')';
			},
			$body
		) ?? $body;
	}

	/**
	 * @param array<int,mixed> $topics
	 * @return array<int,string>
	 */
	private static function normalize_assist_related_topics( array $topics ): array {
		$out = array();
		foreach ( $topics as $topic ) {
			if ( ! is_string( $topic ) ) {
				continue;
			}
			$label = trim( $topic );
			if ( $label === '' ) {
				continue;
			}
			$label = preg_replace( '/\s+for\s+"([^"]+)"(\?)?/i', ' for $1$2', $label );
			$label = is_string( $label ) ? $label : trim( $topic );
			$label = preg_replace( "/\s+for\s+'([^']+)'(\?)?/i", ' for $1$2', $label );
			$label = is_string( $label ) ? $label : trim( $topic );
			$label = preg_replace( '/"([^"]+)"/', '$1', $label );
			$label = is_string( $label ) ? $label : trim( $topic );
			$label = preg_replace( "/'([^']+)'/", '$1', $label );
			$label = is_string( $label ) ? trim( $label ) : trim( $topic );
			if ( $label !== '' ) {
				$out[] = $label;
			}
		}
		return $out;
	}

	/**
	 * @param array<string,mixed> $card
	 * @return array<string,mixed>
	 */
	private static function normalize_card_structured_fields( array $card ): array {
		$body = (string) ( $card['body'] ?? '' );
		if ( $body === '' ) {
			return $card;
		}

		$lines = preg_split( '/\r\n|\r|\n/', $body );
		if ( ! is_array( $lines ) ) {
			return $card;
		}

		$leak_start = null;
		foreach ( $lines as $i => $line ) {
			$trim = trim( (string) $line );
			if ( preg_match( '/^relatedTopics:\s*$/i', $trim ) || preg_match( '/^links:\s*$/i', $trim ) ) {
				$leak_start = $i;
				break;
			}
		}

		if ( $leak_start === null ) {
			return $card;
		}

		$leak_lines       = array_slice( $lines, $leak_start );
		$recovered_topics = array();
		$recovered_links  = array();
		$section          = '';

		foreach ( $leak_lines as $line ) {
			$trim = trim( (string) $line );
			if ( preg_match( '/^relatedTopics:\s*$/i', $trim ) ) {
				$section = 'topics';
				continue;
			}
			if ( preg_match( '/^links:\s*$/i', $trim ) ) {
				$section = 'links';
				continue;
			}
			if ( $section === 'topics' && preg_match( '/^-\s*(.+)$/', $trim, $m ) ) {
				$topic = trim( (string) $m[1] );
				if ( preg_match( '/^(.+?)\s+links:\s*$/i', $topic, $tm ) ) {
					$topic   = trim( (string) $tm[1] );
					$section = 'links';
				}
				if ( $topic !== '' && $topic[0] !== '{' ) {
					$recovered_topics[] = $topic;
				}
				continue;
			}
			if ( $section === 'links' && preg_match( '/^-\s*(\{.+)$/', $trim, $m ) ) {
				$decoded = json_decode( (string) $m[1], true );
				if ( is_array( $decoded ) ) {
					$recovered_links[] = $decoded;
				}
			}
		}

		$card['body'] = trim( implode( "\n", array_slice( $lines, 0, $leak_start ) ) );

		$existing_topics = isset( $card['relatedTopics'] ) && is_array( $card['relatedTopics'] ) ? $card['relatedTopics'] : array();
		if ( count( $existing_topics ) === 0 && count( $recovered_topics ) > 0 ) {
			$card['relatedTopics'] = self::sanitize_topics( $recovered_topics );
		}

		if ( count( $recovered_links ) > 0 ) {
			$existing_links = isset( $card['links'] ) && is_array( $card['links'] ) ? $card['links'] : array();
			$card['links']  = self::sanitize_links( array_merge( $existing_links, $recovered_links ) );
		}

		return $card;
	}
}
