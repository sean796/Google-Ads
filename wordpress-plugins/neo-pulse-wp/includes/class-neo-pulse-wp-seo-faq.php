<?php
/**
 * FAQ schema for a page. One FAQPage per page, combining:
 *  1. the ACF "faq" / "seo_faq" fields written by the SEO team's content system (Flowbie): repeater
 *     rows, plain question/answer text, "Q:/A:" text, or ready-made FAQPage JSON-LD;
 *  2. Elementor accordions that have Rank Math's "Add FAQ Schema" switch on
 *     (rank_math_add_faq_schema = yes on Accordion, Toggle and Nested Accordion widgets);
 *  3. NEO Pulse FAQ widgets with "Enable schema" on (their own items or the field they show).
 *
 * Client child themes print the ACF FAQ themselves (function inject_custom_acf_schemas, together
 * with a separate "dateModified" WebPage block), and the FAQ widget prints its own FAQPage. While
 * Neo Pulse SEO is live both stand aside: the questions sit in the page's own schema graph.
 *
 * @package Neo_Pulse_Wp
 */

defined( 'ABSPATH' ) || exit;

class Neo_Pulse_Wp_Seo_Faq {

	const FLAG        = 'rank_math_add_faq_schema';
	const FIELDS      = array( 'faq', 'seo_faq' );
	const DATE_FIELDS = array( 'date_modifier', 'seo_date_modifier' );
	const THEME_HOOK  = 'inject_custom_acf_schemas';
	const FAQ_WIDGET  = 'neo-pulse_faq';

	public static function init(): void {
		if ( ! Neo_Pulse_Wp_Seo_Settings::output_active() ) {
			return;
		}
		add_action( 'wp', array( __CLASS__, 'replace_theme_output' ) );
	}

	/**
	 * The child theme's FAQ + dateModified blocks are covered by Neo Pulse's graph.
	 */
	public static function replace_theme_output(): void {
		// Removed at whatever priority the theme used.
		$priority = has_action( 'wp_head', self::THEME_HOOK );
		if ( false !== $priority ) {
			remove_action( 'wp_head', self::THEME_HOOK, (int) $priority );
		}
	}

	/**
	 * Questions and answers for a page: stored Rank Math FAQ schema wins (it is printed as is);
	 * otherwise the ACF fields, flagged Elementor accordions and FAQ widgets, without repeats.
	 *
	 * @return array<int, array{q: string, a: string}>
	 */
	public static function for_post( int $post_id ): array {
		if ( metadata_exists( 'post', $post_id, 'rank_math_schema_FAQPage' ) ) {
			return array();
		}
		$out  = array();
		$seen = array();
		foreach ( array_merge( self::from_fields( $post_id ), self::from_elementor( $post_id ) ) as $pair ) {
			$key = strtolower( $pair['q'] );
			if ( isset( $seen[ $key ] ) ) {
				continue;
			}
			$seen[ $key ] = true;
			$out[]        = $pair;
		}
		return $out;
	}

	/**
	 * @return array<int, array{q: string, a: string}>
	 */
	public static function from_fields( int $post_id ): array {
		foreach ( self::FIELDS as $field ) {
			$pairs = self::pairs_from_value( self::field_value( $post_id, $field ) );
			if ( $pairs !== array() ) {
				return $pairs;
			}
		}
		return array();
	}

	/**
	 * Field value as the FAQ widget reads it (ACF repeaters come back as rows).
	 *
	 * @return mixed
	 */
	private static function field_value( int $post_id, string $field ) {
		if ( class_exists( 'Neo_Pulse_Wp_Faq_Renderer', false ) ) {
			return Neo_Pulse_Wp_Faq_Renderer::field_value( $post_id, $field );
		}
		return get_post_meta( $post_id, $field, true );
	}

	/**
	 * Pairs from a stored FAQ value: repeater rows / arrays through the FAQ widget's parser, text
	 * through parse_text() (which also reads the blank-line and inline "Q: A:" formats the widget
	 * parser does not), falling back to the widget parser.
	 *
	 * @param mixed $raw Stored value.
	 * @return array<int, array{q: string, a: string}>
	 */
	public static function pairs_from_value( $raw ): array {
		if ( is_array( $raw ) ) {
			return self::from_entries( self::widget_parse( $raw, true ) );
		}
		if ( ! is_string( $raw ) || trim( $raw ) === '' ) {
			return array();
		}
		$pairs = self::parse_text( $raw );
		return $pairs !== array() ? $pairs : self::from_entries( self::widget_parse( $raw, false ) );
	}

	/**
	 * @param mixed $raw Value.
	 * @return array<int, array{question: string, answer: string}>
	 */
	private static function widget_parse( $raw, bool $repeater ): array {
		if ( ! class_exists( 'Neo_Pulse_Wp_Faq_Parser', false ) ) {
			return array();
		}
		return Neo_Pulse_Wp_Faq_Parser::parse( $raw, $repeater ? array( 'type' => 'repeater' ) : null );
	}

	/**
	 * @param array<int, array{question: string, answer: string}> $entries FAQ widget entries.
	 * @return array<int, array{q: string, a: string}>
	 */
	private static function from_entries( array $entries ): array {
		$out = array();
		foreach ( $entries as $entry ) {
			if ( is_array( $entry ) ) {
				self::add( $out, self::text( (string) ( $entry['question'] ?? '' ) ), self::text( (string) ( $entry['answer'] ?? '' ) ) );
			}
		}
		return $out;
	}

	/**
	 * The "last updated" date the SEO team sets on a page, as ISO 8601, or ''.
	 */
	public static function date_modified( int $post_id ): string {
		foreach ( self::DATE_FIELDS as $field ) {
			$raw = get_post_meta( $post_id, $field, true );
			if ( is_string( $raw ) && trim( $raw ) !== '' ) {
				$time = strtotime( trim( $raw ) );
				if ( $time ) {
					return wp_date( 'c', $time );
				}
			}
		}
		return '';
	}

	/**
	 * Any of the stored formats: JSON-LD (in a script tag or bare), plain blocks (question line,
	 * answer lines, blank line between), "Q: … / A: …" lines, or inline "Q: … A: …".
	 *
	 * @return array<int, array{q: string, a: string}>
	 */
	public static function parse_text( string $raw ): array {
		$text = trim( $raw );
		if ( $text === '' || is_numeric( $text ) ) {
			return array();
		}
		$json = $text;
		if ( preg_match( '#<script[^>]*>([\s\S]*?)</script>#i', $text, $m ) ) {
			$json = trim( $m[1] );
		}
		if ( $json !== '' && ( '{' === $json[0] || '[' === $json[0] ) ) {
			$data = json_decode( $json, true );
			if ( ! is_array( $data ) ) {
				$data = json_decode( html_entity_decode( $json, ENT_QUOTES | ENT_HTML5, 'UTF-8' ), true );
			}
			if ( is_array( $data ) ) {
				$out = array();
				self::collect_json( $data, $out );
				return $out;
			}
		}
		if ( stripos( $text, '<script' ) !== false ) {
			return array();
		}
		$text = str_replace( array( "\r\n", "\r" ), "\n", $text );
		$out  = preg_match( '/^\s*Q\s*[:\-]/im', $text ) ? self::parse_qa_lines( $text ) : self::parse_blocks( $text );
		if ( $out === array() ) {
			$out = self::parse_inline( $text );
		}
		return $out;
	}

	/**
	 * @param array<int|string, mixed>                $data JSON-LD.
	 * @param array<int, array{q: string, a: string}> $out  Pairs.
	 */
	private static function collect_json( array $data, array &$out ): void {
		if ( isset( $data['@graph'] ) && is_array( $data['@graph'] ) ) {
			$data = $data['@graph'];
		}
		$nodes = isset( $data['@type'] ) || isset( $data['mainEntity'] ) ? array( $data ) : $data;
		foreach ( $nodes as $node ) {
			if ( ! is_array( $node ) || empty( $node['mainEntity'] ) || ! is_array( $node['mainEntity'] ) ) {
				continue;
			}
			$items = isset( $node['mainEntity']['@type'] ) ? array( $node['mainEntity'] ) : $node['mainEntity'];
			foreach ( $items as $item ) {
				if ( ! is_array( $item ) ) {
					continue;
				}
				$answer = $item['acceptedAnswer'] ?? '';
				if ( is_array( $answer ) && isset( $answer[0] ) && is_array( $answer[0] ) ) {
					$answer = $answer[0];
				}
				self::add( $out, self::text( (string) ( $item['name'] ?? '' ) ), self::text( is_array( $answer ) ? (string) ( $answer['text'] ?? '' ) : (string) $answer ) );
			}
		}
	}

	/**
	 * Question line, answer line(s), blank line between pairs.
	 *
	 * @return array<int, array{q: string, a: string}>
	 */
	private static function parse_blocks( string $text ): array {
		$out = array();
		foreach ( preg_split( '/\n\s*\n/', $text ) ?: array() as $block ) {
			$lines = array_values( array_filter( array_map( 'trim', explode( "\n", (string) $block ) ), 'strlen' ) );
			if ( count( $lines ) > 1 ) {
				self::add( $out, self::text( $lines[0] ), self::text( implode( ' ', array_slice( $lines, 1 ) ) ) );
			}
		}
		return $out;
	}

	/**
	 * "Q: …" and "A: …" lines (continuation lines join the one above).
	 *
	 * @return array<int, array{q: string, a: string}>
	 */
	private static function parse_qa_lines( string $text ): array {
		$out     = array();
		$current = null;
		foreach ( array_filter( array_map( 'trim', explode( "\n", $text ) ), 'strlen' ) as $line ) {
			if ( preg_match( '/^Q\s*[:\-]\s*(.*)$/i', $line, $m ) ) {
				if ( is_array( $current ) ) {
					self::add( $out, self::text( $current[0] ), self::text( $current[1] ) );
				}
				$current = array( $m[1], '' );
			} elseif ( preg_match( '/^A\s*[:\-]\s*(.*)$/i', $line, $m ) ) {
				$current    = is_array( $current ) ? $current : array( '', '' );
				$current[1] = $m[1];
			} elseif ( is_array( $current ) ) {
				$current[ $current[1] === '' ? 0 : 1 ] .= ' ' . $line;
			}
		}
		if ( is_array( $current ) ) {
			self::add( $out, self::text( $current[0] ), self::text( $current[1] ) );
		}
		return $out;
	}

	/**
	 * "Q: … A: … Q: … A: …" on one line.
	 *
	 * @return array<int, array{q: string, a: string}>
	 */
	private static function parse_inline( string $text ): array {
		$out   = array();
		$plain = self::text( $text );
		if ( preg_match_all( '/Q\s*[:\-]\s*(.*?)\s*A\s*[:\-]\s*(.*?)(?=\s*Q\s*[:\-]|$)/is', $plain, $m, PREG_SET_ORDER ) ) {
			foreach ( $m as $match ) {
				self::add( $out, trim( $match[1] ), trim( $match[2] ) );
			}
		}
		return $out;
	}

	/**
	 * Questions and answers from the post's flagged Elementor accordions and FAQ widgets.
	 *
	 * @return array<int, array{q: string, a: string}>
	 */
	public static function from_elementor( int $post_id ): array {
		$raw = get_post_meta( $post_id, '_elementor_data', true );
		if ( is_array( $raw ) ) {
			$raw = wp_json_encode( $raw );
		}
		if ( ! is_string( $raw ) || ( strpos( $raw, self::FLAG ) === false && strpos( $raw, self::FAQ_WIDGET ) === false ) ) {
			return array();
		}
		$data = json_decode( $raw, true );
		if ( ! is_array( $data ) ) {
			return array();
		}
		$out = array();
		self::walk( $data, $out, $post_id );
		return $out;
	}

	/**
	 * @param array<int|string, mixed>                $elements Elementor elements.
	 * @param array<int, array{q: string, a: string}> $out      Collected pairs.
	 * @param int                                     $post_id  Post being read.
	 */
	private static function walk( array $elements, array &$out, int $post_id = 0 ): void {
		foreach ( $elements as $element ) {
			if ( ! is_array( $element ) ) {
				continue;
			}
			$settings = isset( $element['settings'] ) && is_array( $element['settings'] ) ? $element['settings'] : array();
			$type     = (string) ( $element['widgetType'] ?? '' );
			// NEO Pulse FAQ widget with schema on: its items (or field) join the page's FAQPage.
			if ( self::FAQ_WIDGET === $type && 'yes' === ( $settings['enable_schema'] ?? '' ) && class_exists( 'Neo_Pulse_Wp_Faq_Renderer', false ) ) {
				// Same keys as Neo_Pulse_Wp_Faq_Elementor_Widget::map_settings() (that class only loads with Elementor's widgets).
				$args = array(
					'field_mode' => (string) ( $settings['field_mode'] ?? 'auto' ),
					'field_name' => (string) ( $settings['field_name'] ?? 'faq' ),
					'faq_items'  => is_array( $settings['faq_items'] ?? null ) ? $settings['faq_items'] : array(),
				);
				foreach ( self::from_entries( Neo_Pulse_Wp_Faq_Renderer::entries_for( $args, $post_id ) ) as $pair ) {
					$out[] = $pair;
				}
			}
			// Elementor's own "FAQ Schema" switch already prints FAQPage for this widget.
			if ( 'yes' === ( $settings[ self::FLAG ] ?? '' ) && 'yes' !== ( $settings['faq_schema'] ?? '' ) ) {
				if ( 'nested-accordion' === $type ) {
					$children = isset( $element['elements'] ) && is_array( $element['elements'] ) ? array_values( $element['elements'] ) : array();
					foreach ( array_values( (array) ( $settings['items'] ?? array() ) ) as $i => $item ) {
						$q = self::text( (string) ( is_array( $item ) ? ( $item['item_title'] ?? '' ) : '' ) );
						$a = isset( $children[ $i ] ) && is_array( $children[ $i ] ) ? self::text( self::collect_text( $children[ $i ] ) ) : '';
						self::add( $out, $q, $a );
					}
				} else {
					foreach ( (array) ( $settings['tabs'] ?? array() ) as $tab ) {
						if ( is_array( $tab ) ) {
							self::add( $out, self::text( (string) ( $tab['tab_title'] ?? '' ) ), self::text( (string) ( $tab['tab_content'] ?? '' ) ) );
						}
					}
				}
			}
			if ( isset( $element['elements'] ) && is_array( $element['elements'] ) && 'nested-accordion' !== $type ) {
				self::walk( $element['elements'], $out, $post_id );
			}
		}
	}

	/**
	 * Visible text of a container and the widgets inside it.
	 *
	 * @param array<string, mixed> $element Element.
	 */
	private static function collect_text( array $element ): string {
		$parts    = array();
		$settings = isset( $element['settings'] ) && is_array( $element['settings'] ) ? $element['settings'] : array();
		foreach ( array( 'editor', 'title', 'text', 'description', 'html' ) as $key ) {
			if ( isset( $settings[ $key ] ) && is_string( $settings[ $key ] ) && trim( $settings[ $key ] ) !== '' ) {
				$parts[] = $settings[ $key ];
			}
		}
		foreach ( (array) ( $element['elements'] ?? array() ) as $child ) {
			if ( is_array( $child ) ) {
				$parts[] = self::collect_text( $child );
			}
		}
		return implode( ' ', array_filter( $parts ) );
	}

	private static function text( string $html ): string {
		$text = wp_strip_all_tags( html_entity_decode( $html, ENT_QUOTES | ENT_HTML5, 'UTF-8' ) );
		return trim( (string) preg_replace( '/\s+/u', ' ', $text ) );
	}

	/**
	 * @param array<int, array{q: string, a: string}> $out Pairs.
	 */
	private static function add( array &$out, string $q, string $a ): void {
		if ( $q !== '' && $a !== '' ) {
			$out[] = array(
				'q' => $q,
				'a' => $a,
			);
		}
	}

	/**
	 * @param array<int, array{q: string, a: string}> $pairs Questions and answers.
	 * @return array<string, mixed>
	 */
	public static function schema_node( array $pairs, string $page_url ): array {
		if ( $pairs === array() ) {
			return array();
		}
		$entities = array();
		foreach ( $pairs as $pair ) {
			$entities[] = array(
				'@type'          => 'Question',
				'name'           => $pair['q'],
				'acceptedAnswer' => array(
					'@type' => 'Answer',
					'text'  => $pair['a'],
				),
			);
		}
		return array(
			'@type'      => 'FAQPage',
			'@id'        => $page_url . '#faq',
			'isPartOf'   => array( '@id' => $page_url . '#webpage' ),
			'mainEntity' => $entities,
		);
	}
}
