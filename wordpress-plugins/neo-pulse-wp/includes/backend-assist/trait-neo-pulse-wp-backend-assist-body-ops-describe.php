<?php
/**
 * Plain-language descriptions of body operations.
 *
 * @package Neo_Pulse_Wp
 */

defined( 'ABSPATH' ) || exit;

trait Neo_Pulse_Wp_Backend_Assist_Body_Ops_Trait_Describe {

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
}
