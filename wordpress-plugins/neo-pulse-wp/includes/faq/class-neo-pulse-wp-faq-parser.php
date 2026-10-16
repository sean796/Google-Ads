<?php
/**
 * Parse FAQ field values (repeater rows, Q/A text, JSON-LD) into normalized Q&A pairs.
 *
 * @package Neo_Pulse_Wp
 */

defined( 'ABSPATH' ) || exit;

class Neo_Pulse_Wp_Faq_Parser {

	/**
	 * @param mixed                     $raw   Raw field value.
	 * @param array<string,mixed>|null $field Field config when available.
	 * @return array<int, array{question: string, answer: string}>
	 */
	public static function parse( $raw, ?array $field = null ): array {
		if ( is_array( $field ) && (string) ( $field['type'] ?? '' ) === 'repeater' && is_array( $raw ) ) {
			$from_repeater = self::parse_repeater_rows( $raw );
			if ( ! empty( $from_repeater ) ) {
				return $from_repeater;
			}
		}

		if ( is_array( $raw ) ) {
			$from_array = self::parse_array_pairs( $raw );
			if ( ! empty( $from_array ) ) {
				return $from_array;
			}
			$raw = wp_json_encode( $raw );
		}

		$text = is_scalar( $raw ) ? trim( (string) $raw ) : '';
		if ( $text === '' ) {
			return array();
		}

		if ( self::is_schema_storage( $text ) ) {
			$entries = self::parse_from_json_candidates( $text );
			if ( ! empty( $entries ) ) {
				return $entries;
			}
			$entries = self::parse_faq_entries_from_line_objects( $text );
			if ( ! empty( $entries ) ) {
				return $entries;
			}
			$entries = self::parse_faq_entries_from_regex( $text );
			if ( ! empty( $entries ) ) {
				return $entries;
			}
			return array();
		}

		$entries = self::parse_faq_entries_from_line_objects( $text );
		if ( ! empty( $entries ) ) {
			return $entries;
		}

		return self::parse_qa_lines( $text );
	}

	/**
	 * @param array<int, mixed> $rows Repeater rows.
	 * @return array<int, array{question: string, answer: string}>
	 */
	private static function parse_repeater_rows( array $rows ): array {
		$entries = array();
		foreach ( $rows as $row ) {
			if ( ! is_array( $row ) ) {
				continue;
			}
			$question = self::read_row_value( $row, array( 'question', 'faq_question', 'q', 'name' ) );
			$answer   = self::read_row_value( $row, array( 'answer', 'faq_answer', 'a', 'text' ) );
			self::push_entry( $entries, $question, $answer );
		}
		return $entries;
	}

	/**
	 * @param array<int|string, mixed> $value Array value.
	 * @return array<int, array{question: string, answer: string}>
	 */
	private static function parse_array_pairs( array $value ): array {
		$entries = array();
		foreach ( $value as $item ) {
			if ( ! is_array( $item ) ) {
				continue;
			}
			if ( isset( $item['question'] ) || isset( $item['answer'] ) ) {
				self::push_entry(
					$entries,
					isset( $item['question'] ) ? (string) $item['question'] : '',
					isset( $item['answer'] ) ? (string) $item['answer'] : ''
				);
				continue;
			}
			if ( self::type_includes_question( $item['@type'] ?? null ) ) {
				self::push_entry( $entries, self::read_question_node( $item ), self::read_answer_node( $item ) );
			}
		}
		if ( ! empty( $entries ) ) {
			return $entries;
		}
		self::collect_faq_nodes( $value, $entries );
		return $entries;
	}

	/**
	 * @param array<string, mixed> $row Row data.
	 * @param array<int, string>   $keys Candidate keys.
	 */
	private static function read_row_value( array $row, array $keys ): string {
		foreach ( $keys as $key ) {
			if ( isset( $row[ $key ] ) && is_scalar( $row[ $key ] ) ) {
				return trim( (string) $row[ $key ] );
			}
		}
		return '';
	}

	private static function is_schema_storage( string $raw ): bool {
		if ( $raw === '' ) {
			return false;
		}
		if ( stripos( $raw, 'FAQPage' ) !== false && stripos( $raw, 'mainEntity' ) !== false ) {
			return true;
		}
		return (bool) preg_match( '/<script[^>]*application\/ld\+json/i', $raw );
	}

	private static function strip_html_tags( string $text ): string {
		return (string) preg_replace( '/<[^>]+>/', '', $text );
	}

	private static function decode_entities( string $text ): string {
		return html_entity_decode( $text, ENT_QUOTES | ENT_HTML5, 'UTF-8' );
	}

	private static function extract_json_text( string $raw ): string {
		$text = trim( $raw );
		if ( preg_match( '/<script[^>]*type\s*=\s*["\']application\/ld\+json["\'][^>]*>([\s\S]*?)<\/script>/i', $text, $matches ) ) {
			return self::decode_entities( trim( $matches[1] ) );
		}
		if ( preg_match( '/<script[^>]*>([\s\S]*?)<\/script>/i', $text, $matches ) ) {
			return self::decode_entities( trim( $matches[1] ) );
		}
		$stripped = trim( self::strip_html_tags( $text ) );
		if ( $stripped !== '' && ( $stripped[0] === '{' || $stripped[0] === '[' ) ) {
			return self::decode_entities( $stripped );
		}
		return self::decode_entities( $text );
	}

	private static function extract_balanced_json( string $text ): string {
		$start = strpos( $text, '{' );
		if ( $start === false ) {
			return '';
		}
		$depth    = 0;
		$in_string = false;
		$escape   = false;
		$len      = strlen( $text );
		for ( $i = $start; $i < $len; $i++ ) {
			$ch = $text[ $i ];
			if ( $in_string ) {
				if ( $escape ) {
					$escape = false;
				} elseif ( $ch === '\\' ) {
					$escape = true;
				} elseif ( $ch === '"' ) {
					$in_string = false;
				}
				continue;
			}
			if ( $ch === '"' ) {
				$in_string = true;
				continue;
			}
			if ( $ch === '{' ) {
				++$depth;
			}
			if ( $ch === '}' ) {
				--$depth;
				if ( $depth === 0 ) {
					return substr( $text, $start, $i - $start + 1 );
				}
			}
		}
		return '';
	}

	/**
	 * @param mixed $type_value Schema @type value.
	 */
	private static function type_includes_faq_page( $type_value ): bool {
		$types = is_array( $type_value ) ? $type_value : array( $type_value );
		foreach ( $types as $type ) {
			if ( strtolower( (string) $type ) === 'faqpage' ) {
				return true;
			}
		}
		return false;
	}

	/**
	 * @param mixed $type_value Schema @type value.
	 */
	private static function type_includes_question( $type_value ): bool {
		$types = is_array( $type_value ) ? $type_value : array( $type_value );
		foreach ( $types as $type ) {
			if ( strtolower( (string) $type ) === 'question' ) {
				return true;
			}
		}
		return false;
	}

	/**
	 * @param array<string, mixed> $node Schema node.
	 */
	private static function read_question_node( array $node ): string {
		foreach ( array( 'name', 'question', 'headline' ) as $key ) {
			if ( isset( $node[ $key ] ) && is_string( $node[ $key ] ) ) {
				return trim( $node[ $key ] );
			}
		}
		return '';
	}

	/**
	 * @param array<string, mixed> $node Schema node.
	 */
	private static function read_answer_node( array $node ): string {
		if ( isset( $node['acceptedAnswer'] ) && is_array( $node['acceptedAnswer'] ) ) {
			foreach ( array( 'text', 'description' ) as $key ) {
				if ( isset( $node['acceptedAnswer'][ $key ] ) && is_string( $node['acceptedAnswer'][ $key ] ) ) {
					return trim( $node['acceptedAnswer'][ $key ] );
				}
			}
		}
		if ( isset( $node['answer'] ) && is_string( $node['answer'] ) ) {
			return trim( $node['answer'] );
		}
		return '';
	}

	/**
	 * @param array<int, array{question: string, answer: string}> $entries Output list.
	 */
	private static function push_entry( array &$entries, string $question, string $answer ): void {
		$question = trim( $question );
		$answer   = trim( $answer );
		if ( $question === '' && $answer === '' ) {
			return;
		}
		$entries[] = array(
			'question' => $question,
			'answer'   => $answer,
		);
	}

	/**
	 * @param array<int, mixed> $main_entity Main entity list.
	 * @param array<int, array{question: string, answer: string}> $entries Output list.
	 */
	private static function collect_from_main_entity( array $main_entity, array &$entries ): void {
		foreach ( $main_entity as $node ) {
			if ( ! is_array( $node ) ) {
				continue;
			}
			$question = self::read_question_node( $node );
			$answer   = self::read_answer_node( $node );
			if ( $question !== '' || $answer !== '' ) {
				self::push_entry( $entries, $question, $answer );
			}
		}
	}

	/**
	 * @param array<string, mixed> $node Schema node.
	 * @param array<int, array{question: string, answer: string}> $entries Output list.
	 */
	private static function collect_faq_nodes( array $node, array &$entries ): void {
		if ( self::type_includes_question( $node['@type'] ?? null ) ) {
			self::push_entry( $entries, self::read_question_node( $node ), self::read_answer_node( $node ) );
			return;
		}
		if ( self::type_includes_faq_page( $node['@type'] ?? null ) && isset( $node['mainEntity'] ) && is_array( $node['mainEntity'] ) ) {
			self::collect_from_main_entity( $node['mainEntity'], $entries );
		}
		if ( isset( $node['mainEntity'] ) && is_array( $node['mainEntity'] ) && ! self::type_includes_faq_page( $node['@type'] ?? null ) ) {
			self::collect_from_main_entity( $node['mainEntity'], $entries );
		}
		if ( isset( $node['@graph'] ) && is_array( $node['@graph'] ) ) {
			foreach ( $node['@graph'] as $child ) {
				if ( is_array( $child ) ) {
					self::collect_faq_nodes( $child, $entries );
				}
			}
		}
	}

	/**
	 * @return array<int, array{question: string, answer: string}>
	 */
	private static function parse_faq_entries_from_json( $parsed ): array {
		$entries = array();
		$nodes   = is_array( $parsed ) && self::is_list_array( $parsed ) ? $parsed : array( $parsed );
		foreach ( $nodes as $node ) {
			if ( is_array( $node ) ) {
				self::collect_faq_nodes( $node, $entries );
			}
		}
		return $entries;
	}

	/**
	 * @param array<int|string, mixed> $arr
	 */
	private static function is_list_array( array $arr ): bool {
		if ( $arr === array() ) {
			return true;
		}
		return array_keys( $arr ) === range( 0, count( $arr ) - 1 );
	}

	/**
	 * @return array<int, array{question: string, answer: string}>
	 */
	private static function parse_from_json_candidates( string $raw ): array {
		$candidates = array(
			self::extract_json_text( $raw ),
			self::extract_balanced_json( self::strip_html_tags( $raw ) ),
			self::extract_balanced_json( $raw ),
		);
		foreach ( $candidates as $candidate ) {
			if ( $candidate === '' ) {
				continue;
			}
			$parsed = json_decode( $candidate, true );
			if ( ! is_array( $parsed ) ) {
				continue;
			}
			$entries = self::parse_faq_entries_from_json( $parsed );
			if ( ! empty( $entries ) ) {
				return $entries;
			}
		}
		return array();
	}

	/**
	 * @return array<int, array{question: string, answer: string}>
	 */
	private static function parse_faq_entries_from_line_objects( string $raw ): array {
		$entries = array();
		foreach ( preg_split( '/\r\n|\r|\n/', $raw ) as $line ) {
			$trimmed = trim( $line );
			if ( $trimmed === '' || $trimmed[0] !== '{' ) {
				continue;
			}
			$obj = json_decode( $trimmed, true );
			if ( ! is_array( $obj ) ) {
				continue;
			}
			if ( self::type_includes_question( $obj['@type'] ?? null ) ) {
				self::push_entry( $entries, self::read_question_node( $obj ), self::read_answer_node( $obj ) );
				continue;
			}
			self::collect_faq_nodes( $obj, $entries );
		}
		return $entries;
	}

	/**
	 * @return array<int, array{question: string, answer: string}>
	 */
	private static function parse_faq_entries_from_regex( string $raw ): array {
		$text    = self::decode_entities( self::strip_html_tags( $raw ) );
		$entries = array();
		$pattern = '/"name"\s*:\s*"((?:\\\\.|[^"\\\\])*)"\s*,[\s\S]*?"acceptedAnswer"\s*:\s*\{[\s\S]*?"text"\s*:\s*"((?:\\\\.|[^"\\\\])*)"/i';
		if ( preg_match_all( $pattern, $text, $matches, PREG_SET_ORDER ) ) {
			foreach ( $matches as $match ) {
				self::push_entry(
					$entries,
					self::unescape_json_string( $match[1] ),
					self::unescape_json_string( $match[2] )
				);
			}
		}
		return $entries;
	}

	private static function unescape_json_string( string $value ): string {
		return stripcslashes( str_replace(
			array( '\\n', '\\r', '\\t', '\\"', '\\\\' ),
			array( "\n", "\r", "\t", '"', '\\' ),
			$value
		) );
	}

	/**
	 * @return array<int, array{question: string, answer: string}>
	 */
	private static function parse_qa_lines( string $raw ): array {
		$lines   = array_values( array_filter( array_map( 'trim', preg_split( '/\r\n|\r|\n/', $raw ) ) ) );
		$entries = array();
		$current = null;

		foreach ( $lines as $line ) {
			if ( preg_match( '/^Q[:\-]/i', $line ) ) {
				if ( is_array( $current ) ) {
					$entries[] = $current;
				}
				$current = array(
					'question' => trim( (string) preg_replace( '/^Q[:\-]\s*/i', '', $line ) ),
					'answer'   => '',
				);
			} elseif ( preg_match( '/^A[:\-]/i', $line ) ) {
				if ( ! is_array( $current ) ) {
					$current = array(
						'question' => '',
						'answer'   => trim( (string) preg_replace( '/^A[:\-]\s*/i', '', $line ) ),
					);
				} else {
					$current['answer'] = trim( (string) preg_replace( '/^A[:\-]\s*/i', '', $line ) );
				}
			} elseif ( is_array( $current ) && $current['question'] !== '' && $current['answer'] === '' ) {
				$current['question'] = trim( $current['question'] . ' ' . $line );
			} elseif ( is_array( $current ) && $current['answer'] !== '' ) {
				$current['answer'] = trim( $current['answer'] . ' ' . $line );
			} else {
				$current = array(
					'question' => $line,
					'answer'   => '',
				);
			}
		}

		if ( is_array( $current ) ) {
			$entries[] = $current;
		}

		$filtered = array();
		foreach ( $entries as $entry ) {
			if ( ! is_array( $entry ) ) {
				continue;
			}
			$question = trim( (string) ( $entry['question'] ?? '' ) );
			$answer   = trim( (string) ( $entry['answer'] ?? '' ) );
			if ( $question !== '' || $answer !== '' ) {
				$filtered[] = array(
					'question' => $question,
					'answer'   => $answer,
				);
			}
		}

		return $filtered;
	}
}
