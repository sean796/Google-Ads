<?php
/**
 * Section-to-table conversion, table insertion, and table building.
 *
 * @package Neo_Pulse_Wp
 */

defined( 'ABSPATH' ) || exit;

trait Neo_Pulse_Wp_Backend_Assist_Body_Ops_Trait_Tables {

	/**
	 * @param array<string, mixed> $op
	 */
	public static function convert_section_to_table( string $html, array $op ): string {
		$sec = self::resolve_section( $html, $op );
		if ( $sec === null || ! empty( $sec['has_table'] ) ) {
			return $html;
		}

		$chunk = substr( $html, (int) $sec['start'], (int) $sec['end'] - (int) $sec['start'] );
		$parts = self::parse_section_chunk( $chunk );
		if ( $parts === null ) {
			return $html;
		}

		$body_html = (string) $parts['body_html'];

		$columns = array();
		if ( ! empty( $op['columns'] ) && is_array( $op['columns'] ) ) {
			foreach ( $op['columns'] as $col ) {
				$col = trim( (string) $col );
				if ( $col !== '' ) {
					$columns[] = $col;
				}
			}
		}

		$layout = sanitize_key( (string) ( $op['layout'] ?? '' ) );
		if ( $layout === '' || ! in_array( $layout, array( 'pairs', 'paragraphs', 'list' ), true ) ) {
			$layout = preg_match( '/<(?:ul|ol|li)\b|<!--\s*wp:list/i', $body_html ) ? 'list' : 'pairs';
		}

		$user_message = (string) ( $op['user_message'] ?? '' );
		$needs_generate = ! empty( $op['generate_rows'] )
			|| count( $columns ) > 2
			|| ( $user_message !== '' && preg_match( '/\b(example|real.?life|generate)\b/i', $user_message ) );

		$rows = array();
		if ( $needs_generate && class_exists( 'Neo_Pulse_Wp_Backend_Assist_Pipeline_Content_Prep' ) ) {
			$generated = Neo_Pulse_Wp_Backend_Assist_Pipeline_Content_Prep::generate_table_rows_for_section(
				$user_message,
				(string) $sec['heading_text'],
				$columns !== array() ? $columns : array( 'Feature', 'Benefit' ),
				wp_trim_words( wp_strip_all_tags( $body_html ), 120, '...' )
			);
			if ( ! is_wp_error( $generated ) && is_array( $generated ) ) {
				$rows = $generated;
			}
		}
		if ( $rows === array() ) {
			$rows = self::parse_table_rows( $body_html, $layout );
		}
		if ( $rows === array() ) {
			return $html;
		}

		$table_html = self::build_table_html( $rows, $columns );
		$new_body   = self::replace_list_with_table_in_body( $body_html, $table_html );
		$new_chunk  = self::rebuild_section_chunk( $parts, $new_body );
		return substr( $html, 0, (int) $sec['start'] ) . $new_chunk . substr( $html, (int) $sec['end'] );
	}

	private static function replace_list_with_table_in_body( string $body_html, string $table_html ): string {
		if ( preg_match( '/(<!--\s*wp:list[\s\S]*?<!--\s*\/wp:list\s-->|<(?:ul|ol)[^>]*>[\s\S]*?<\/(?:ul|ol)>)/is', $body_html, $list_match, PREG_OFFSET_CAPTURE ) ) {
			$before = substr( $body_html, 0, (int) $list_match[0][1] );
			$after  = substr( $body_html, (int) $list_match[0][1] + strlen( (string) $list_match[0][0] ) );
			$new    = trim( $before ) . "\n\n" . $table_html;
			if ( trim( $after ) !== '' ) {
				$new .= "\n\n" . trim( $after );
			}
			return trim( $new );
		}

		if ( preg_match( '/^([\s\S]*?)(?=<!--\s*wp:list|<(?:ul|ol)\b)/i', $body_html, $intro ) ) {
			$intro_html = trim( (string) $intro[1] );
			if ( $intro_html !== '' ) {
				return $intro_html . "\n\n" . $table_html;
			}
		}

		return $table_html;
	}

	/**
	 * Insert a new table into a section without removing existing prose.
	 *
	 * @param array<string, mixed> $op
	 */
	public static function insert_table_in_section( string $html, array $op ): string {
		$sec = self::resolve_section( $html, $op );
		if ( $sec === null ) {
			return $html;
		}

		$chunk = substr( $html, (int) $sec['start'], (int) $sec['end'] - (int) $sec['start'] );
		$parts = self::parse_section_chunk( $chunk );
		if ( $parts === null ) {
			return $html;
		}

		$body_html = (string) $parts['body_html'];

		$columns = array();
		if ( ! empty( $op['columns'] ) && is_array( $op['columns'] ) ) {
			foreach ( $op['columns'] as $col ) {
				$col = trim( (string) $col );
				if ( $col !== '' ) {
					$columns[] = $col;
				}
			}
		}
		if ( $columns === array() ) {
			$columns = array( 'Topic', 'Details' );
		}

		$rows = array();
		if ( ! empty( $op['rows'] ) && is_array( $op['rows'] ) ) {
			foreach ( $op['rows'] as $row ) {
				if ( ! is_array( $row ) ) {
					continue;
				}
				$cells = array_values( $row );
				$rows[] = array(
					(string) ( $cells[0] ?? '' ),
					(string) ( $cells[1] ?? '' ),
				);
			}
		} elseif ( ! empty( $op['generate_rows'] ) ) {
			$generated = Neo_Pulse_Wp_Backend_Assist_Pipeline_Content_Prep::generate_table_rows_for_section(
				(string) ( $op['user_message'] ?? '' ),
				(string) $sec['heading_text'],
				$columns,
				wp_trim_words( wp_strip_all_tags( $body_html ), 120, '...' )
			);
			if ( ! is_wp_error( $generated ) && is_array( $generated ) ) {
				$rows = $generated;
			}
		}

		if ( $rows === array() ) {
			return $html;
		}

		$table_html = self::build_table_html( $rows, $columns );
		$placement  = sanitize_key( (string) ( $op['placement'] ?? 'after_intro' ) );
		if ( ! in_array( $placement, array( 'after_heading', 'after_intro', 'section_end' ), true ) ) {
			$placement = 'after_intro';
		}

		$insert_at = 0;
		if ( $placement === 'section_end' ) {
			$insert_at = strlen( $body_html );
		} elseif ( $placement === 'after_heading' ) {
			$insert_at = 0;
		} else {
			if ( preg_match( '/<\/p>/i', $body_html, $m, PREG_OFFSET_CAPTURE ) ) {
				$insert_at = (int) $m[0][1] + strlen( (string) $m[0][0] );
			} else {
				$insert_at = 0;
			}
		}

		$new_body   = substr( $body_html, 0, $insert_at ) . "\n" . $table_html . "\n" . substr( $body_html, $insert_at );
		$new_chunk  = self::rebuild_section_chunk( $parts, $new_body );
		return substr( $html, 0, (int) $sec['start'] ) . $new_chunk . substr( $html, (int) $sec['end'] );
	}

	/**
	 * @return array<int, array{0: string, 1: string}>
	 */
	private static function parse_table_rows( string $body_html, string $layout ): array {
		$rows = array();
		if ( $layout === 'list' ) {
			if ( preg_match_all( '/<li[^>]*>([\s\S]*?)<\/li>/is', $body_html, $items ) ) {
				foreach ( $items[1] as $item ) {
					$text = trim( (string) $item );
					if ( $text !== '' ) {
						$rows[] = array( $text, '' );
					}
				}
			}
			return $rows;
		}

		if ( $layout === 'paragraphs' ) {
			if ( preg_match_all( '/<p[^>]*>([\s\S]*?)<\/p>/is', $body_html, $paras ) ) {
				$cells = array();
				foreach ( $paras[1] as $para ) {
					$text = trim( (string) $para );
					if ( $text === '' ) {
						continue;
					}
					$cells[] = $text;
				}
				for ( $i = 0; $i < count( $cells ); $i += 2 ) {
					$rows[] = array(
						$cells[ $i ],
						isset( $cells[ $i + 1 ] ) ? $cells[ $i + 1 ] : '',
					);
				}
			}
			return $rows;
		}

		if ( preg_match_all( '/(?:<(?:strong|b)[^>]*>([\s\S]*?)<\/(?:strong|b)>|<h3[^>]*>([\s\S]*?)<\/h3>)\s*(?:<p[^>]*>([\s\S]*?)<\/p>)?/is', $body_html, $pairs, PREG_SET_ORDER ) ) {
			foreach ( $pairs as $pair ) {
				$label = trim( (string) ( $pair[1] !== '' ? $pair[1] : $pair[2] ) );
				$value = trim( (string) ( $pair[3] ?? '' ) );
				if ( $label !== '' || $value !== '' ) {
					$rows[] = array( $label, $value );
				}
			}
		}

		return $rows;
	}

	/**
	 * @param array<int, array<int, string>> $rows
	 * @param array<int, string>             $columns
	 */
	private static function build_table_html( array $rows, array $columns ): string {
		$col_count = $columns !== array() ? count( $columns ) : 2;
		if ( $col_count < 1 ) {
			$col_count = 2;
		}

		$html = '<table>';
		if ( $columns !== array() ) {
			$html .= '<thead><tr>';
			foreach ( $columns as $col ) {
				$html .= '<th>' . esc_html( $col ) . '</th>';
			}
			$html .= '</tr></thead>';
		}
		$html .= '<tbody>';
		foreach ( $rows as $row ) {
			$html .= '<tr>';
			for ( $i = 0; $i < $col_count; $i++ ) {
				$cell = '';
				if ( is_array( $row ) ) {
					$vals = array_values( $row );
					$cell = (string) ( $vals[ $i ] ?? '' );
				}
				$html .= '<td>' . $cell . '</td>';
			}
			$html .= '</tr>';
		}
		$html .= '</tbody></table>';
		return $html;
	}
}
