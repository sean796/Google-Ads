<?php
/**
 * Backend Assist — deterministic WYSIWYG HTML body operations
 *
 * @package Neo_Pulse_Wp
 */

defined( 'ABSPATH' ) || exit;

class Neo_Pulse_Wp_Backend_Assist_Body_Ops {

	/**
	 * @return array<int, array{index: int, level: int, heading_text: string, start: int, end: int, has_table: bool}>
	 */
	public static function index_html_sections( string $html ): array {
		$html = (string) $html;
		if ( trim( $html ) === '' ) {
			return array();
		}

		if ( ! preg_match_all( '/<h([23])[^>]*>(.*?)<\/h\1>/is', $html, $matches, PREG_OFFSET_CAPTURE ) ) {
			return array(
				array(
					'index'        => 0,
					'level'        => 0,
					'heading_text' => '',
					'start'        => 0,
					'end'          => strlen( $html ),
					'has_table'    => stripos( $html, '<table' ) !== false,
				),
			);
		}

		$sections = array();
		$first    = (int) $matches[0][0][1];
		if ( $first > 0 ) {
			$intro = substr( $html, 0, $first );
			$sections[] = array(
				'index'        => 0,
				'level'        => 0,
				'heading_text' => '(intro)',
				'start'        => 0,
				'end'          => $first,
				'has_table'    => stripos( $intro, '<table' ) !== false,
			);
		}

		$count = count( $matches[0] );
		for ( $i = 0; $i < $count; $i++ ) {
			$start = (int) $matches[0][ $i ][1];
			$end   = ( $i + 1 < $count ) ? (int) $matches[0][ $i + 1 ][1] : strlen( $html );
			$chunk = substr( $html, $start, $end - $start );
			$sections[] = array(
				'index'        => count( $sections ),
				'level'        => (int) $matches[1][ $i ][0],
				'heading_text' => trim( wp_strip_all_tags( (string) $matches[2][ $i ][0] ) ),
				'start'        => $start,
				'end'          => $end,
				'has_table'    => stripos( $chunk, '<table' ) !== false,
			);
		}

		return $sections;
	}

	/**
	 * First H2/H3 section after optional lead-in copy (the "intro" heading block).
	 *
	 * @return array<string, mixed>|null
	 */
	public static function resolve_intro_heading_section( string $html ): ?array {
		$sections = self::index_html_sections( $html );
		if ( $sections === array() ) {
			return null;
		}
		if ( ( $sections[0]['heading_text'] ?? '' ) === '(intro)' ) {
			return isset( $sections[1] ) ? $sections[1] : null;
		}
		if ( (int) ( $sections[0]['level'] ?? 0 ) > 0 ) {
			return $sections[0];
		}
		return null;
	}

	/**
	 * @param array<int, array{index: int, level: int, heading_text: string, start: int, end: int, has_table: bool}> $sections
	 * @return array<int, array<string, mixed>>
	 */
	public static function sections_summary_for_planner( array $sections, string $html = '' ): array {
		$out = array();
		foreach ( $sections as $sec ) {
			$ends_with_table = false;
			if ( $html !== '' && ! empty( $sec['has_table'] ) ) {
				$chunk = substr( $html, (int) $sec['start'], (int) $sec['end'] - (int) $sec['start'] );
				$ends_with_table = (bool) preg_match( '/<\/table>\s*$/is', trim( $chunk ) );
			}
			$out[] = array(
				'section_index'   => (int) $sec['index'],
				'heading'         => (string) $sec['heading_text'],
				'level'           => (int) $sec['level'],
				'has_table'       => ! empty( $sec['has_table'] ),
				'ends_with_table' => $ends_with_table,
			);
		}
		return $out;
	}

	public static function remove_section( string $html, int $index ): string {
		$sections = self::index_html_sections( $html );
		if ( ! isset( $sections[ $index ] ) ) {
			return $html;
		}
		$sec = $sections[ $index ];
		$out = substr( $html, 0, $sec['start'] ) . substr( $html, $sec['end'] );
		return trim( (string) preg_replace( "/\n{3,}/", "\n\n", $out ) );
	}

	public static function remove_section_by_heading( string $html, string $heading_match ): string {
		$heading_match = trim( $heading_match );
		if ( $heading_match === '' ) {
			return $html;
		}
		$needle = strtolower( $heading_match );
		foreach ( self::index_html_sections( $html ) as $sec ) {
			if ( $sec['heading_text'] === '(intro)' ) {
				continue;
			}
			if ( str_contains( strtolower( $sec['heading_text'] ), $needle ) ) {
				return self::remove_section( $html, (int) $sec['index'] );
			}
		}
		return $html;
	}

	/**
	 * @param array<int, array<string, mixed>> $ops
	 * @return string|WP_Error
	 */
	public static function apply_ops( string $html, array $ops ) {
		$before = $html;

		$remove_indexes = array();
		$filtered_ops   = array();
		foreach ( $ops as $op ) {
			if ( ! is_array( $op ) ) {
				continue;
			}
			$name = sanitize_key( (string) ( $op['op'] ?? '' ) );
			if ( $name === 'remove_section' && isset( $op['section_index'] ) ) {
				$remove_indexes[] = (int) $op['section_index'];
				continue;
			}
			$filtered_ops[] = $op;
		}

		if ( $remove_indexes !== array() ) {
			rsort( $remove_indexes );
			foreach ( array_unique( $remove_indexes ) as $idx ) {
				$html = self::remove_section( $html, $idx );
			}
		}

		foreach ( $filtered_ops as $op ) {
			if ( ! is_array( $op ) ) {
				continue;
			}
			$name = sanitize_key( (string) ( $op['op'] ?? '' ) );
			switch ( $name ) {
				case 'remove_section':
					if ( ! empty( $op['heading_match'] ) ) {
						$html = self::remove_section_by_heading( $html, (string) $op['heading_match'] );
					}
					break;
				case 'truncate_after_table':
					$html = self::truncate_after_table( $html, $op );
					break;
				case 'remove_sections_after':
					$html = self::remove_sections_after( $html, $op );
					break;
				case 'strip_json_ld':
					$html = Neo_Pulse_Wp_Backend_Assist_Pipeline_Content_Prep::strip_json_ld_from_html( $html );
					break;
				case 'wrap':
					$html = self::apply_wrap_op( $html, $op );
					break;
				case 'replace_text':
					$html = self::apply_replace_op( $html, $op );
					break;
				case 'replace_heading':
					$html = self::apply_replace_heading( $html, $op );
					break;
				case 'convert_section_to_table':
					$html = self::convert_section_to_table( $html, $op );
					break;
				case 'insert_table_in_section':
					$html = self::insert_table_in_section( $html, $op );
					break;
				case 'replace_section_html':
					$html = self::apply_replace_section_html( $html, $op );
					break;
				case 'convert_list_in_section':
					$html = self::convert_list_in_section( $html, $op );
					break;
				case 'remove_table_in_section':
					$html = self::remove_table_in_section( $html, $op );
					break;
				case 'add_internal_links':
					$html = self::add_internal_links( $html, $op );
					break;
				case 'insert_overview_links':
					$html = self::insert_overview_links( $html, $op );
					break;
				default:
					return new WP_Error(
						'neo-pulse_body_op_unknown',
						sprintf(
							/* translators: %s: operation name */
							__( 'Unknown body edit operation: %s', 'neo-pulse-wp' ),
							$name
						)
					);
			}
		}

		$valid = self::validate_ops_result( $before, $html, $ops );
		if ( is_wp_error( $valid ) ) {
			return $valid;
		}

		return trim( (string) preg_replace( "/\n{3,}/", "\n\n", $html ) );
	}

	/**
	 * @param array<string, mixed> $op
	 */
	private static function apply_wrap_op( string $html, array $op ): string {
		$find = (string) ( $op['find'] ?? '' );
		$tag  = sanitize_key( (string) ( $op['tag'] ?? 'strong' ) );
		if ( $find === '' || ! str_contains( $html, $find ) ) {
			return $html;
		}
		$allowed = array( 'strong', 'em', 'b', 'i', 'a' );
		if ( ! in_array( $tag, $allowed, true ) ) {
			$tag = 'strong';
		}
		if ( $tag === 'a' ) {
			$href = esc_url( (string) ( $op['href'] ?? '' ) );
			if ( $href === '' ) {
				return $html;
			}
			$replacement = '<a href="' . esc_attr( $href ) . '">' . $find . '</a>';
		} else {
			$replacement = '<' . $tag . '>' . $find . '</' . $tag . '>';
		}
		$pos = strpos( $html, $find );
		if ( $pos === false ) {
			return $html;
		}
		return substr_replace( $html, $replacement, $pos, strlen( $find ) );
	}

	/**
	 * @param array<string, mixed> $op
	 */
	private static function apply_replace_op( string $html, array $op ): string {
		$find    = (string) ( $op['find'] ?? '' );
		$replace = (string) ( $op['replace'] ?? '' );
		if ( $find === '' || ! str_contains( $html, $find ) ) {
			return $html;
		}
		$pos = strpos( $html, $find );
		if ( $pos === false ) {
			return $html;
		}
		return substr_replace( $html, $replace, $pos, strlen( $find ) );
	}

	/**
	 * Replace one section heading text in place; body copy stays unchanged.
	 *
	 * @param array<string, mixed> $op
	 */
	public static function apply_replace_heading( string $html, array $op ): string {
		$sec = self::resolve_section( $html, $op );
		if ( $sec === null ) {
			return $html;
		}

		$new_heading = trim( (string) ( $op['new_heading'] ?? '' ) );
		if ( $new_heading === '' ) {
			return $html;
		}

		$chunk = substr( $html, (int) $sec['start'], (int) $sec['end'] - (int) $sec['start'] );
		$parts = self::parse_section_chunk( $chunk );
		if ( $parts === null ) {
			return $html;
		}

		$heading_html = (string) $parts['heading_html'];
		if ( ! preg_match( '/^(<h[23][^>]*>)(.*?)(<\/h[23]>)$/is', $heading_html, $match ) ) {
			return $html;
		}

		$new_heading_html = $match[1] . esc_html( $new_heading ) . $match[3];
		if ( $new_heading_html === $heading_html ) {
			return $html;
		}

		$parts['heading_html'] = $new_heading_html;
		$new_chunk             = self::rebuild_section_chunk( $parts, (string) $parts['body_html'] );
		return substr( $html, 0, (int) $sec['start'] ) . $new_chunk . substr( $html, (int) $sec['end'] );
	}

	/**
	 * @param array<int, array<string, mixed>> $ops
	 * @return true|WP_Error
	 */
	public static function validate_ops_result( string $before, string $after, array $ops ) {
		$remove_only = true;
		foreach ( $ops as $op ) {
			if ( ! is_array( $op ) ) {
				continue;
			}
			$name = sanitize_key( (string) ( $op['op'] ?? '' ) );
			if ( ! in_array( $name, array( 'remove_section', 'strip_json_ld', 'truncate_after_table', 'remove_sections_after' ), true ) ) {
				$remove_only = false;
				break;
			}
		}
		if ( ! $remove_only ) {
			return true;
		}

		$before_sections = self::index_html_sections( $before );
		$after_sections  = self::index_html_sections( $after );
		$removed_indexes = array();
		foreach ( $ops as $op ) {
			if ( ! is_array( $op ) || sanitize_key( (string) ( $op['op'] ?? '' ) ) !== 'remove_section' ) {
				continue;
			}
			if ( isset( $op['section_index'] ) ) {
				$removed_indexes[] = (int) $op['section_index'];
			}
		}

		foreach ( $before_sections as $sec ) {
			if ( in_array( (int) $sec['index'], $removed_indexes, true ) ) {
				continue;
			}
			if ( empty( $sec['has_table'] ) ) {
				continue;
			}
			$heading = strtolower( (string) $sec['heading_text'] );
			$found   = false;
			foreach ( $after_sections as $after_sec ) {
				if ( strtolower( (string) $after_sec['heading_text'] ) !== $heading ) {
					continue;
				}
				if ( ! empty( $after_sec['has_table'] ) ) {
					$found = true;
					break;
				}
			}
			if ( ! $found ) {
				return new WP_Error(
					'neo-pulse_body_op_table_lost',
					__( 'Body edit would remove or reformat a table section. Operation rejected.', 'neo-pulse-wp' )
				);
			}
		}

		return true;
	}

	/**
	 * @param array<int, array<string, mixed>> $ops
	 */
	public static function describe_ops( array $ops ): string {
		$parts = array();
		foreach ( $ops as $op ) {
			if ( ! is_array( $op ) ) {
				continue;
			}
			$name = sanitize_key( (string) ( $op['op'] ?? '' ) );
			switch ( $name ) {
				case 'remove_section':
					if ( isset( $op['section_index'] ) ) {
						$parts[] = sprintf(
							/* translators: %d: section index */
							__( 'removed section %d', 'neo-pulse-wp' ),
							(int) $op['section_index']
						);
					} elseif ( ! empty( $op['heading_match'] ) ) {
						$parts[] = sprintf(
							/* translators: %s: heading text */
							__( 'removed section matching "%s"', 'neo-pulse-wp' ),
							(string) $op['heading_match']
						);
					}
					break;
				case 'strip_json_ld':
					$parts[] = __( 'stripped JSON-LD from body', 'neo-pulse-wp' );
					break;
				case 'wrap':
					$parts[] = __( 'applied inline wrap', 'neo-pulse-wp' );
					break;
				case 'replace_text':
					$parts[] = __( 'replaced text', 'neo-pulse-wp' );
					break;
				case 'replace_heading':
					if ( ! empty( $op['new_heading'] ) ) {
						$parts[] = sprintf(
							/* translators: %s: new heading text */
							__( 'updated heading to "%s"', 'neo-pulse-wp' ),
							(string) $op['new_heading']
						);
					} else {
						$parts[] = __( 'updated section heading', 'neo-pulse-wp' );
					}
					break;
				case 'convert_section_to_table':
					if ( ! empty( $op['heading_match'] ) ) {
						$parts[] = sprintf(
							/* translators: %s: heading text */
							__( 'converted section "%s" to table', 'neo-pulse-wp' ),
							(string) $op['heading_match']
						);
					} elseif ( isset( $op['section_index'] ) ) {
						$parts[] = sprintf(
							/* translators: %d: section index */
							__( 'converted section %d to table', 'neo-pulse-wp' ),
							(int) $op['section_index']
						);
					} else {
						$parts[] = __( 'converted section to table', 'neo-pulse-wp' );
					}
					break;
				case 'insert_table_in_section':
					if ( ! empty( $op['heading_match'] ) ) {
						$parts[] = sprintf(
							/* translators: %s: heading text */
							__( 'inserted new table in section "%s"', 'neo-pulse-wp' ),
							(string) $op['heading_match']
						);
					} elseif ( isset( $op['section_index'] ) ) {
						$parts[] = sprintf(
							/* translators: %d: section index */
							__( 'inserted new table in section %d', 'neo-pulse-wp' ),
							(int) $op['section_index']
						);
					} else {
						$parts[] = __( 'inserted new table in section', 'neo-pulse-wp' );
					}
					break;
				case 'replace_section_html':
					if ( ! empty( $op['heading_match'] ) ) {
						$parts[] = sprintf(
							/* translators: %s: heading text */
							__( 'replaced section "%s" in place', 'neo-pulse-wp' ),
							(string) $op['heading_match']
						);
					} elseif ( isset( $op['section_index'] ) ) {
						$parts[] = sprintf(
							/* translators: %d: section index */
							__( 'replaced section %d in place', 'neo-pulse-wp' ),
							(int) $op['section_index']
						);
					} else {
						$parts[] = __( 'replaced section in place', 'neo-pulse-wp' );
					}
					break;
				case 'convert_list_in_section':
					if ( ! empty( $op['heading_match'] ) ) {
						$parts[] = sprintf(
							/* translators: 1: heading, 2: list type */
							__( 'converted list in section "%1$s" to %2$s', 'neo-pulse-wp' ),
							(string) $op['heading_match'],
							sanitize_key( (string) ( $op['list_type'] ?? 'ul' ) )
						);
					} else {
						$parts[] = __( 'converted list format in section', 'neo-pulse-wp' );
					}
					break;
				case 'remove_table_in_section':
					if ( ! empty( $op['heading_match'] ) ) {
						$parts[] = sprintf(
							/* translators: %s: heading text */
							__( 'removed table from section "%s"', 'neo-pulse-wp' ),
							(string) $op['heading_match']
						);
					} else {
						$parts[] = __( 'removed table from section', 'neo-pulse-wp' );
					}
					break;
				case 'add_internal_links':
					$count = isset( $op['link_count'] ) ? (int) $op['link_count'] : 0;
					$parts[] = $count > 0
						? sprintf(
							/* translators: %d: link count */
							__( 'added up to %d internal links', 'neo-pulse-wp' ),
							$count
						)
						: __( 'added internal links', 'neo-pulse-wp' );
					break;
				case 'insert_overview_links':
					$parts[] = __( 'inserted overview with H2 anchor links', 'neo-pulse-wp' );
					break;
				case 'truncate_after_table':
					$parts[] = __( 'removed all content after table', 'neo-pulse-wp' );
					break;
				case 'remove_sections_after':
					if ( ! empty( $op['after_heading_match'] ) ) {
						$parts[] = sprintf(
							/* translators: %s: heading text */
							__( 'removed all sections after "%s"', 'neo-pulse-wp' ),
							(string) $op['after_heading_match']
						);
					} elseif ( isset( $op['after_section_index'] ) ) {
						$parts[] = sprintf(
							/* translators: %d: section index */
							__( 'removed all sections after section %d', 'neo-pulse-wp' ),
							(int) $op['after_section_index']
						);
					} else {
						$parts[] = __( 'removed all sections after anchor', 'neo-pulse-wp' );
					}
					break;
			}
		}
		return implode( '; ', $parts );
	}

	/**
	 * Plain-language op descriptions for Plan mode preview.
	 *
	 * @param array<int, array<string, mixed>> $ops
	 * @return array<int, string>
	 */
	public static function describe_ops_for_plan( array $ops ): array {
		$lines = array();
		foreach ( $ops as $i => $op ) {
			if ( ! is_array( $op ) ) {
				continue;
			}
			$name = sanitize_key( (string) ( $op['op'] ?? '' ) );
			$n    = $i + 1;
			switch ( $name ) {
				case 'insert_table_in_section':
					$target = ! empty( $op['heading_match'] )
						? (string) $op['heading_match']
						: ( isset( $op['section_index'] ) ? sprintf( __( 'section %d', 'neo-pulse-wp' ), (int) $op['section_index'] ) : __( 'target section', 'neo-pulse-wp' ) );
					$cols = ! empty( $op['columns'] ) && is_array( $op['columns'] )
						? implode( ', ', array_map( 'strval', $op['columns'] ) )
						: 'Topic, Details';
					$placement = sanitize_key( (string) ( $op['placement'] ?? 'after_intro' ) );
					$lines[] = sprintf(
						/* translators: 1: step number, 2: op name, 3: section, 4: columns, 5: placement */
						__( '%1$d. `%2$s` on "%3$s" — new table with columns (%4$s), placed %5$s. Existing paragraphs in that section stay unchanged.', 'neo-pulse-wp' ),
						$n,
						'insert_table_in_section',
						$target,
						$cols,
						str_replace( '_', ' ', $placement )
					);
					break;
				case 'convert_section_to_table':
					$target = ! empty( $op['heading_match'] )
						? (string) $op['heading_match']
						: ( isset( $op['section_index'] ) ? sprintf( __( 'section %d', 'neo-pulse-wp' ), (int) $op['section_index'] ) : __( 'target section', 'neo-pulse-wp' ) );
					$cols = ! empty( $op['columns'] ) && is_array( $op['columns'] )
						? implode( ', ', array_map( 'strval', $op['columns'] ) )
						: 'Topic, Details';
					$gen_note = ! empty( $op['generate_rows'] )
						? __( 'Rows generated from section content.', 'neo-pulse-wp' )
						: __( 'Rows parsed from existing section content.', 'neo-pulse-wp' );
					$lines[] = sprintf(
						/* translators: 1: step number, 2: op name, 3: section, 4: columns, 5: row source note */
						__( '%1$d. `%2$s` on "%3$s" — list replaced with table (%4$s). %5$s Intro paragraphs in that section stay unchanged.', 'neo-pulse-wp' ),
						$n,
						'convert_section_to_table',
						$target,
						$cols,
						$gen_note
					);
					break;
				case 'replace_section_html':
					$target = ! empty( $op['heading_match'] )
						? (string) $op['heading_match']
						: ( isset( $op['section_index'] ) ? sprintf( __( 'section %d', 'neo-pulse-wp' ), (int) $op['section_index'] ) : __( 'target section', 'neo-pulse-wp' ) );
					$lines[] = sprintf(
						/* translators: 1: step number, 2: op name, 3: section */
						__( '%1$d. `%2$s` on "%3$s" — entire section HTML is swapped in place. Other sections stay unchanged.', 'neo-pulse-wp' ),
						$n,
						'replace_section_html',
						$target
					);
					break;
				case 'convert_list_in_section':
					$target = ! empty( $op['heading_match'] )
						? (string) $op['heading_match']
						: ( isset( $op['section_index'] ) ? sprintf( __( 'section %d', 'neo-pulse-wp' ), (int) $op['section_index'] ) : __( 'target section', 'neo-pulse-wp' ) );
					$list_type = sanitize_key( (string) ( $op['list_type'] ?? 'ul' ) );
					$lines[] = sprintf(
						/* translators: 1: step number, 2: op name, 3: section, 4: ul or ol */
						__( '%1$d. `%2$s` on "%3$s" — change list to %4$s only. Heading, paragraphs, and other sections stay unchanged.', 'neo-pulse-wp' ),
						$n,
						'convert_list_in_section',
						$target,
						$list_type === 'ol' ? 'numbered (ol)' : 'bulleted (ul)'
					);
					break;
				case 'remove_table_in_section':
					$target = ! empty( $op['heading_match'] )
						? (string) $op['heading_match']
						: ( isset( $op['section_index'] ) ? sprintf( __( 'section %d', 'neo-pulse-wp' ), (int) $op['section_index'] ) : __( 'target section', 'neo-pulse-wp' ) );
					$lines[] = sprintf(
						/* translators: 1: step number, 2: op name, 3: section */
						__( '%1$d. `%2$s` on "%3$s" — remove table from section body only. Prose and lists stay unchanged.', 'neo-pulse-wp' ),
						$n,
						'remove_table_in_section',
						$target
					);
					break;
				default:
					$short = self::describe_ops( array( $op ) );
					if ( $short !== '' ) {
						$lines[] = sprintf(
							/* translators: 1: step number, 2: op name, 3: effect */
							__( '%1$d. `%2$s` — %3$s', 'neo-pulse-wp' ),
							$n,
							$name !== '' ? $name : 'op',
							$short
						);
					}
					break;
			}
		}
		return $lines;
	}

	/**
	 * @param array<string, mixed> $op
	 */
	public static function truncate_after_table( string $html, array $op ): string {
		$which = sanitize_key( (string) ( $op['which'] ?? 'last' ) );
		if ( ! in_array( $which, array( 'first', 'last' ), true ) ) {
			$which = 'last';
		}

		$scope        = $html;
		$scope_offset = 0;
		$sec          = self::resolve_section( $html, $op );
		if ( $sec !== null ) {
			$scope_offset = (int) $sec['start'];
			$scope        = substr( $html, $scope_offset, (int) $sec['end'] - (int) $sec['start'] );
		}

		if ( ! preg_match_all( '/<table[^>]*>[\s\S]*?<\/table>/is', $scope, $matches, PREG_OFFSET_CAPTURE ) ) {
			if ( $sec !== null ) {
				return $html;
			}
			$scope        = $html;
			$scope_offset = 0;
			if ( ! preg_match_all( '/<table[^>]*>[\s\S]*?<\/table>/is', $scope, $matches, PREG_OFFSET_CAPTURE ) ) {
				return $html;
			}
		}

		$tables = $matches[0];
		$target = $which === 'first' ? $tables[0] : $tables[ count( $tables ) - 1 ];
		$end    = $scope_offset + (int) $target[1] + strlen( (string) $target[0] );

		return trim( substr( $html, 0, $end ) );
	}

	/**
	 * @param array<string, mixed> $op
	 */
	public static function remove_sections_after( string $html, array $op ): string {
		$sec = null;
		if ( isset( $op['after_section_index'] ) ) {
			$sections = self::index_html_sections( $html );
			$idx      = (int) $op['after_section_index'];
			$sec      = isset( $sections[ $idx ] ) ? $sections[ $idx ] : null;
		} elseif ( ! empty( $op['after_heading_match'] ) ) {
			$needle = strtolower( trim( (string) $op['after_heading_match'] ) );
			foreach ( self::index_html_sections( $html ) as $candidate ) {
				if ( $candidate['heading_text'] === '(intro)' ) {
					continue;
				}
				if ( str_contains( strtolower( (string) $candidate['heading_text'] ), $needle ) ) {
					$sec = $candidate;
					break;
				}
			}
		}

		if ( $sec === null ) {
			return $html;
		}

		return trim( substr( $html, 0, (int) $sec['end'] ) );
	}

	/**
	 * Parse a section chunk with optional Gutenberg heading block comments.
	 *
	 * @return array{heading_prefix: string, heading_html: string, heading_suffix: string, body_html: string}|null
	 */
	private static function parse_section_chunk( string $chunk ): ?array {
		if ( preg_match(
			'/^(?P<prefix>(?:<!--\s*wp:heading[^>]*-->\s*)?)(?P<heading><h[23][^>]*>.*?<\/h[23]>)(?P<suffix>\s*(?:<!--\s*\/wp:heading\s*-->)?)(?P<body>[\s\S]*)$/is',
			$chunk,
			$match
		) ) {
			return array(
				'heading_prefix' => (string) $match['prefix'],
				'heading_html'   => (string) $match['heading'],
				'heading_suffix' => (string) $match['suffix'],
				'body_html'      => (string) $match['body'],
			);
		}

		return null;
	}

	/**
	 * @param array{heading_prefix: string, heading_html: string, heading_suffix: string, body_html: string} $parts
	 */
	private static function rebuild_section_chunk( array $parts, string $body_html ): string {
		return $parts['heading_prefix'] . $parts['heading_html'] . $parts['heading_suffix'] . $body_html;
	}

	/** @return array<string, mixed>|null */
	private static function resolve_section( string $html, array $op ): ?array {
		$sections = self::index_html_sections( $html );
		if ( isset( $op['section_index'] ) ) {
			$idx = (int) $op['section_index'];
			return isset( $sections[ $idx ] ) ? $sections[ $idx ] : null;
		}
		if ( ! empty( $op['heading_match'] ) ) {
			$needle = strtolower( trim( (string) $op['heading_match'] ) );
			foreach ( $sections as $sec ) {
				if ( $sec['heading_text'] === '(intro)' ) {
					continue;
				}
				if ( str_contains( strtolower( (string) $sec['heading_text'] ), $needle ) ) {
					return $sec;
				}
			}
		}
		return null;
	}

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
	 * Replace one section's HTML in place (strict: no append on miss).
	 *
	 * @param array<string, mixed> $op
	 */
	public static function apply_replace_section_html( string $html, array $op ): string {
		$sec = self::resolve_section( $html, $op );
		if ( $sec === null ) {
			return $html;
		}

		$chunk = substr( $html, (int) $sec['start'], (int) $sec['end'] - (int) $sec['start'] );
		$parts = self::parse_section_chunk( $chunk );
		if ( $parts === null ) {
			return $html;
		}

		$new_body = '';
		if ( ! empty( $op['new_html'] ) ) {
			$incoming = (string) $op['new_html'];
			$parsed   = self::parse_section_chunk( $incoming );
			$new_body = $parsed !== null ? (string) $parsed['body_html'] : $incoming;
		} elseif ( ! empty( $op['generate'] ) ) {
			$generated = Neo_Pulse_Wp_Backend_Assist_Pipeline_Content_Prep::generate_section_html_for_replace(
				(string) ( $op['user_message'] ?? '' ),
				(string) $sec['heading_text'],
				$chunk
			);
			if ( is_wp_error( $generated ) || $generated === '' ) {
				return $html;
			}
			$new_body = $generated;
		}

		if ( trim( $new_body ) === '' ) {
			return $html;
		}

		$new_chunk = self::rebuild_section_chunk( $parts, $new_body );
		return substr( $html, 0, (int) $sec['start'] ) . $new_chunk . substr( $html, (int) $sec['end'] );
	}

	/**
	 * @param array<string, mixed> $op
	 */
	public static function convert_list_in_section( string $html, array $op ): string {
		$sec = self::resolve_section( $html, $op );
		if ( $sec === null ) {
			return $html;
		}

		$list_type = sanitize_key( (string) ( $op['list_type'] ?? 'ul' ) );
		if ( ! in_array( $list_type, array( 'ul', 'ol' ), true ) ) {
			$list_type = 'ul';
		}

		$chunk = substr( $html, (int) $sec['start'], (int) $sec['end'] - (int) $sec['start'] );
		$parts = self::parse_section_chunk( $chunk );
		if ( $parts === null ) {
			return $html;
		}

		$new_body = self::convert_list_tags_in_html( (string) $parts['body_html'], $list_type );
		if ( $new_body === $parts['body_html'] ) {
			return $html;
		}

		$new_chunk = self::rebuild_section_chunk( $parts, $new_body );
		return substr( $html, 0, (int) $sec['start'] ) . $new_chunk . substr( $html, (int) $sec['end'] );
	}

	/**
	 * @param array<string, mixed> $op
	 */
	public static function remove_table_in_section( string $html, array $op ): string {
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
		$new_body  = (string) preg_replace( '/<table[^>]*>[\s\S]*?<\/table>\s*/is', '', $body_html, 1 );
		if ( $new_body === $body_html ) {
			return $html;
		}

		$new_chunk = self::rebuild_section_chunk( $parts, trim( $new_body ) );
		return substr( $html, 0, (int) $sec['start'] ) . $new_chunk . substr( $html, (int) $sec['end'] );
	}

	private static function convert_list_tags_in_html( string $html, string $list_type ): string {
		if ( $list_type === 'ul' ) {
			$html = (string) preg_replace( '/<!--\s*wp:list\s+\{"ordered":true([^}]*)\}/i', '<!-- wp:list {"ordered":false$1}', $html );
			$html = (string) preg_replace( '/<ol(\s[^>]*)?>/i', '<ul$1>', $html );
			$html = (string) preg_replace( '/<\/ol>/i', '</ul>', $html );
		} else {
			$html = (string) preg_replace( '/<!--\s*wp:list\s+\{"ordered":false([^}]*)\}/i', '<!-- wp:list {"ordered":true$1}', $html );
			$html = (string) preg_replace( '/<ul(\s[^>]*)?>/i', '<ol$1>', $html );
			$html = (string) preg_replace( '/<\/ul>/i', '</ol>', $html );
		}

		return $html;
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

	/**
	 * @param array<string, mixed> $op
	 */
	public static function add_internal_links( string $html, array $op ): string {
		$link_count = isset( $op['link_count'] ) ? max( 1, min( 30, (int) $op['link_count'] ) ) : 5;
		$post_id    = isset( $op['post_id'] ) ? absint( $op['post_id'] ) : 0;

		if ( ! class_exists( 'Neo_Pulse_Wp_Harness_Blueprint' ) ) {
			require_once NEO_PULSE_WP_PLUGIN_DIR . 'includes/harness/class-neo-pulse-wp-harness-blueprint.php';
		}
		if ( ! class_exists( 'Neo_Pulse_Wp_Harness_Links' ) ) {
			require_once NEO_PULSE_WP_PLUGIN_DIR . 'includes/harness/class-neo-pulse-wp-harness-links.php';
		}

		$site_url  = home_url( '/' );
		$all_posts = Neo_Pulse_Wp_Harness_Blueprint::fetch_linkable_posts();
		$query     = isset( $op['grep_query'] ) ? (string) $op['grep_query'] : wp_strip_all_tags( $html );
		$matched   = Neo_Pulse_Wp_Harness_Links::grep_linkable_posts( $all_posts, $query, max( $link_count, 25 ), $post_id );
		$allowed   = Neo_Pulse_Wp_Harness_Links::allowed_url_set( $matched, $site_url );

		$scope_html = $html;
		$scope_start = 0;
		if ( isset( $op['section_index'] ) ) {
			$sec = self::resolve_section( $html, $op );
			if ( $sec !== null ) {
				$scope_start = (int) $sec['start'];
				$scope_html  = substr( $html, $scope_start, (int) $sec['end'] - $scope_start );
			}
		}

		$added = 0;
		foreach ( $matched as $lp ) {
			if ( $added >= $link_count ) {
				break;
			}
			$title = isset( $lp['title'] ) ? trim( (string) $lp['title'] ) : '';
			$url   = isset( $lp['link'] ) ? trim( (string) $lp['link'] ) : '';
			if ( $title === '' || $url === '' ) {
				continue;
			}
			if ( ! isset( $allowed[ $url ] ) ) {
				continue;
			}
			$phrase = $title;
			if ( ! str_contains( $scope_html, $phrase ) ) {
				$words = preg_split( '/\s+/', $phrase, -1, PREG_SPLIT_NO_EMPTY );
				if ( is_array( $words ) && count( $words ) >= 3 ) {
					$phrase = implode( ' ', array_slice( $words, 0, 3 ) );
				}
			}
			if ( $phrase === '' || ! str_contains( $scope_html, $phrase ) ) {
				continue;
			}
			if ( preg_match( '/<a\s[^>]*>' . preg_quote( $phrase, '/' ) . '<\/a>/is', $scope_html ) ) {
				continue;
			}
			$pos = strpos( $scope_html, $phrase );
			if ( $pos === false ) {
				continue;
			}
			$replacement = '<a href="' . esc_attr( esc_url_raw( $url ) ) . '">' . $phrase . '</a>';
			$scope_html  = substr_replace( $scope_html, $replacement, $pos, strlen( $phrase ) );
			++$added;
		}

		if ( $added === 0 ) {
			return $html;
		}

		if ( $scope_start > 0 ) {
			return substr( $html, 0, $scope_start ) . $scope_html . substr( $html, (int) $sec['end'] );
		}

		$html = Neo_Pulse_Wp_Harness_Links::strip_unknown_internal_links( $scope_html, $allowed, $site_url );
		return $html;
	}

	/**
	 * @param array<string, mixed> $op
	 */
	public static function insert_overview_links( string $html, array $op ): string {
		if ( preg_match( '/class=["\']neo-pulse-overview["\']/i', $html ) ) {
			return $html;
		}

		$label = ! empty( $op['label'] ) ? sanitize_text_field( (string) $op['label'] ) : 'Overview';
		$items = array();

		$html = (string) preg_replace_callback(
			'/<h2([^>]*)>(.*?)<\/h2>/is',
			static function ( array $m ) use ( &$items ): string {
				$text = trim( wp_strip_all_tags( (string) $m[2] ) );
				if ( $text === '' ) {
					return $m[0];
				}
				$id = sanitize_title( $text );
				if ( preg_match( '/\sid\s*=\s*["\']([^"\']+)["\']/i', $m[1], $id_match ) ) {
					$id = (string) $id_match[1];
				} else {
					$m[1] = ' id="' . esc_attr( $id ) . '"' . $m[1];
				}
				$items[] = '<li><a href="#' . esc_attr( $id ) . '">' . esc_html( $text ) . '</a></li>';
				return '<h2' . $m[1] . '>' . $m[2] . '</h2>';
			},
			$html
		);

		if ( $items === array() ) {
			return $html;
		}

		$block = '<p class="neo-pulse-overview"><strong>' . esc_html( $label ) . '</strong></p>' . "\n"
			. '<ul class="neo-pulse-overview">' . implode( '', $items ) . '</ul>' . "\n\n";

		return $block . $html;
	}
}
