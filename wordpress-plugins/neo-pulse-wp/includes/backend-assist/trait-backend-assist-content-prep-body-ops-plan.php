<?php
/**
 * Body operations planning for Backend Assist content preparation.
 *
 * @package Neo_Pulse_Wp
 */

defined( 'ABSPATH' ) || exit;

trait Neo_Pulse_Wp_Backend_Assist_Pipeline_Content_Prep_Trait_Body_Ops_Plan {

	/**
	 * @param array<string, mixed> $intent_data
	 * @return array<int, array<string, mixed>>|WP_Error
	 */
	public static function build_body_ops_from_intent( string $message, int $post_id, array $intent_data, array $history = array() ) {
		$intent = sanitize_key( (string) ( $intent_data['intent'] ?? 'other' ) );

		if ( self::message_requests_surgical_only( $message ) && $intent === 'replace_section' ) {
			$intent = 'edit_text';
		}

		if ( $intent === 'insert_new_table' ) {
			$table = isset( $intent_data['table'] ) && is_array( $intent_data['table'] ) ? $intent_data['table'] : array();
			$op    = array(
				'op'            => 'insert_table_in_section',
				'generate_rows' => true,
				'user_message'  => $message,
				'placement'     => sanitize_key( (string) ( $table['placement'] ?? 'after_intro' ) ),
				'columns'       => ! empty( $table['columns'] ) && is_array( $table['columns'] ) ? $table['columns'] : array( 'Topic', 'Details' ),
			);
			return array( self::apply_section_target_to_op( $op, $message, $post_id, $intent_data ) );
		}

		if ( $intent === 'replace_section' && ! self::message_requests_surgical_only( $message ) ) {
			$op = array(
				'op'           => 'replace_section_html',
				'generate'     => true,
				'user_message' => $message,
			);
			return array( self::apply_section_target_to_op( $op, $message, $post_id, $intent_data ) );
		}

		if ( $intent === 'convert_section_to_table' ) {
			$table   = isset( $intent_data['table'] ) && is_array( $intent_data['table'] ) ? $intent_data['table'] : array();
			$columns = ! empty( $table['columns'] ) && is_array( $table['columns'] ) ? $table['columns'] : self::detect_table_columns_from_message( $message );
			if ( $columns === array() ) {
				$columns = array( 'Feature', 'Benefit' );
			}
			$op = array(
				'op'            => 'convert_section_to_table',
				'generate_rows' => count( $columns ) > 2 || preg_match( '/\b(example|real.?life|generate)\b/i', $message ),
				'user_message'  => $message,
				'layout'        => 'list',
				'columns'       => $columns,
			);
			return array( self::apply_section_target_to_op( $op, $message, $post_id, $intent_data ) );
		}

		if ( $intent === 'edit_text' ) {
			if ( preg_match( '/\b(delete|remove)\b.*\btable\b|\btable\b.*\b(delete|remove)\b/i', $message ) ) {
				$op = array( 'op' => 'remove_table_in_section' );
				return array( self::apply_section_target_to_op( $op, $message, $post_id, $intent_data ) );
			}
			if ( preg_match( '/\b(bullet|bulleted|unordered|numbered|ordered|list|ul|ol)\b/i', $message ) ) {
				$op = array(
					'op'        => 'convert_list_in_section',
					'list_type' => self::detect_list_type_from_message( $message ),
				);
				return array( self::apply_section_target_to_op( $op, $message, $post_id, $intent_data ) );
			}
		}

		if ( $intent === 'links' ) {
			$op = array(
				'op'         => 'add_internal_links',
				'link_count' => self::detect_link_count_from_message( $message ),
			);
			return array( self::apply_section_target_to_op( $op, $message, $post_id, $intent_data ) );
		}

		return self::plan_post_body_ops( $message, $post_id, $intent_data, $history );
	}

	/**
	 * @param array<int, array<string, mixed>> $ops
	 * @return array<int, array<string, mixed>>
	 */
	private static function normalize_body_ops_for_message( string $message, array $ops ): array {
		foreach ( $ops as $i => $op ) {
			if ( ! is_array( $op ) || sanitize_key( (string) ( $op['op'] ?? '' ) ) !== 'convert_section_to_table' ) {
				continue;
			}
			if ( empty( $op['user_message'] ) ) {
				$ops[ $i ]['user_message'] = $message;
			}
			$columns = ! empty( $op['columns'] ) && is_array( $op['columns'] ) ? $op['columns'] : self::detect_table_columns_from_message( $message );
			if ( $columns !== array() ) {
				$ops[ $i ]['columns'] = $columns;
			}
			if ( empty( $op['generate_rows'] ) && ( count( $columns ) > 2 || preg_match( '/\b(example|real.?life|generate)\b/i', $message ) ) ) {
				$ops[ $i ]['generate_rows'] = true;
			}
			if ( empty( $op['layout'] ) ) {
				$ops[ $i ]['layout'] = 'list';
			}
		}
		return $ops;
	}

	/**
	 * @param array<int, array<string, mixed>> $ops
	 * @return true|WP_Error
	 */
	private static function validate_body_ops_plan( string $message, int $post_id, array $ops ) {
		$named_section = self::extract_heading_from_message( $message, $post_id ) !== ''
			|| self::message_targets_named_section( $message );
		$section_ops = array(
			'convert_list_in_section',
			'remove_table_in_section',
			'insert_table_in_section',
			'replace_section_html',
			'convert_section_to_table',
		);
		if ( $named_section ) {
			foreach ( $ops as $op ) {
				if ( ! is_array( $op ) ) {
					continue;
				}
				$name = sanitize_key( (string) ( $op['op'] ?? '' ) );
				if ( in_array( $name, $section_ops, true ) && empty( $op['heading_match'] ) ) {
					return new WP_Error(
						'neo-pulse_plan_heading',
						__( 'Plan requires a verified section heading match. Could not target the named section.', 'neo-pulse-wp' )
					);
				}
			}
		}

		$post = get_post( $post_id );
		if ( ! $post instanceof WP_Post ) {
			return true;
		}

		$has_generate = false;
		foreach ( $ops as $op ) {
			if ( is_array( $op ) && ( ! empty( $op['generate_rows'] ) || ! empty( $op['generate'] ) ) ) {
				$has_generate = true;
				break;
			}
		}
		if ( $has_generate ) {
			return true;
		}

		$dry = Neo_Pulse_Wp_Backend_Assist_Body_Ops::apply_ops( (string) $post->post_content, $ops );
		if ( is_wp_error( $dry ) ) {
			return $dry;
		}
		if ( trim( (string) $dry ) === trim( (string) $post->post_content ) ) {
			return new WP_Error(
				'neo-pulse_plan_noop',
				__( 'Dry-run made no change. Verify the target heading matches a section on this post.', 'neo-pulse-wp' )
			);
		}

		return true;
	}

	/**
	 * @return array<int, array<string, mixed>>|WP_Error
	 */
	public static function plan_post_body_ops( string $message, int $post_id, array $intent_data = array(), array $history = array() ) {
		if ( $post_id < 1 ) {
			return new WP_Error( 'neo-pulse_body_ops_post', __( 'post_id is required for body ops.', 'neo-pulse-wp' ) );
		}

		$post = get_post( $post_id );
		if ( ! $post instanceof WP_Post ) {
			return new WP_Error( 'neo-pulse_body_ops_post', __( 'Post not found.', 'neo-pulse-wp' ) );
		}

		$html = (string) $post->post_content;
		if ( trim( $html ) === '' ) {
			return new WP_Error( 'neo-pulse_body_ops_empty', __( 'Post body is empty.', 'neo-pulse-wp' ) );
		}

		if ( ! class_exists( 'Neo_Pulse_Wp_Backend_Assist_Body_Ops' ) ) {
			require_once NEO_PULSE_WP_PLUGIN_DIR . 'includes/backend-assist/class-neo-pulse-wp-backend-assist-body-ops.php';
		}

		$sections     = Neo_Pulse_Wp_Backend_Assist_Body_Ops::index_html_sections( $html );
		$summary      = Neo_Pulse_Wp_Backend_Assist_Body_Ops::sections_summary_for_planner( $sections, $html );
		$summary_json = wp_json_encode( $summary, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES );
		$post_context = self::build_post_context_for_plan( $post_id );

		$system = <<<'PROMPT'
You plan WYSIWYG HTML body edits for a WordPress post. Output ONLY valid JSON:
{"ops":[{"op":"remove_section","section_index":0}]}

Allowed ops (Phase 1):
- remove_section: section_index OR heading_match (substring). Removes ONE section only.
- truncate_after_table: optional heading_match or section_index; optional which (last|first, default last). Keeps HTML through closing </table>; deletes everything after. Use for "delete all content after the FAQ table".
- remove_sections_after: after_section_index OR after_heading_match. Keeps through end of anchor section; deletes all following sections.
- convert_section_to_table: section_index OR heading_match; optional columns (string array, e.g. ["Question","Answer"]); optional layout (pairs|paragraphs|list). Preserves heading and restructures section body into table rows.
- insert_table_in_section: section_index OR heading_match; columns (string array); placement (after_heading|after_intro|section_end). Inserts NEW table; existing section prose stays.
- convert_list_in_section: section_index OR heading_match; list_type (ul|ol). Swaps list tags in section body only; heading and paragraphs stay.
- remove_table_in_section: section_index OR heading_match. Removes first table from section body only; prose and lists stay.
- replace_heading: section_index OR heading_match; new_heading (plain text). Use for rename/change H2/H3 only; body copy stays.
- replace_section_html: section_index OR heading_match; replaces entire section HTML in place (use for rewrite/replace/update section requests).
- strip_json_ld: no extra fields
- wrap: find (exact phrase), tag (strong|em|b|i|a), href when tag is a
- replace_text: find, replace (single occurrence)
- add_internal_links: link_count (integer); optional section_index
- insert_overview_links: optional label (default Overview)

Rules:
- Interpret natural language; map intent to one or more ops.
- "Delete/remove all content after [table/FAQ table]" → ONE truncate_after_table op (NOT multiple remove_section).
- "Delete everything after [section heading]" → ONE remove_sections_after op.
- Never emit multiple remove_section ops for bulk tail delete; use truncate_after_table or remove_sections_after.
- "Don't change any content" → format ops only on named section; never remove_section elsewhere.
- "Keep the second FAQ" → remove_section on first FAQ section_index only.
- "Convert to table" / "make into table" → convert_section_to_table with appropriate columns when implied.
- "Add/insert/create a table in [section/heading]" → insert_table_in_section ONLY (never convert_section_to_table for add/insert/create).
- "Change/rename/update the intro h2" or follow-up after assistant added intro → replace_heading on first intro heading section only
- List format change (bulleted/numbered, ul/ol) → convert_list_in_section, NEVER replace_section_html.
- Delete/remove table in one section → remove_table_in_section, NEVER replace_section_html.
- Never use truncate_after_table, remove_sections_after, or remove_section when user only asked to add a table to one section.
- Never replace or regenerate the full post body.
- Prefer section_index from SECTION INDEX; use ends_with_table to locate FAQ table sections.
- Never output full replacement HTML.
- Do not output markdown fences or commentary.
PROMPT;

		$user = self::build_planner_history_block( $history ) . "USER REQUEST:\n{$message}\n\n{$post_context}\nSECTION INDEX:\n{$summary_json}\n";
		$result = Neo_Pulse_Wp_Backend_Assist_Ai::call_openrouter(
			Neo_Pulse_Wp_Backend_Assist_Context::REASON_MODEL,
			$system,
			$user,
			2048,
			0.2
		);
		if ( is_wp_error( $result ) ) {
			return $result;
		}

		$parsed = Neo_Pulse_Wp_Backend_Assist_Ai::parse_json_response( $result );
		if ( ! is_array( $parsed ) || empty( $parsed['ops'] ) || ! is_array( $parsed['ops'] ) ) {
			return new WP_Error( 'neo-pulse_body_ops_parse', __( 'Body ops planner returned invalid JSON.', 'neo-pulse-wp' ) );
		}

		$allowed = self::body_ops_allowed_names();
		$ops     = array();
		foreach ( $parsed['ops'] as $row ) {
			if ( ! is_array( $row ) || empty( $row['op'] ) ) {
				continue;
			}
			$op_name = sanitize_key( (string) $row['op'] );
			if ( ! in_array( $op_name, $allowed, true ) ) {
				continue;
			}
			if ( $op_name === 'add_internal_links' ) {
				$row['post_id'] = $post_id;
				if ( empty( $row['link_count'] ) && self::message_requests_internal_links( $message ) ) {
					$parsed_count = self::parse_link_count_from_message( $message );
					$row['link_count'] = $parsed_count > 0 ? $parsed_count : 5;
				}
			}
			$ops[] = $row;
		}

		if ( $ops === array() ) {
			return new WP_Error( 'neo-pulse_body_ops_empty', __( 'Body ops planner returned no valid operations.', 'neo-pulse-wp' ) );
		}

		return $ops;
	}

	/**
	 * @return array<int, array<string, mixed>>|WP_Error
	 */
	private static function resolve_body_ops_for_message( string $message, int $post_id, array $history = array() ) {
		$cached = Neo_Pulse_Wp_Backend_Assist_Plan_Cache::load( $message, $post_id );
		if ( is_array( $cached ) && ! empty( $cached['ops'] ) && is_array( $cached['ops'] ) ) {
			return $cached['ops'];
		}

		if ( self::message_targets_named_section( $message ) || preg_match( '/\btable\b/i', $message ) ) {
			$intent = self::classify_body_edit_intent( $message, $post_id, $history );
			if ( ! is_wp_error( $intent ) ) {
				$ops = self::build_body_ops_from_intent( $message, $post_id, $intent, $history );
				if ( ! is_wp_error( $ops ) ) {
					return $ops;
				}
			}
		}

		return self::plan_post_body_ops( $message, $post_id, array(), $history );
	}

	/**
	 * @param array<string, mixed> $params
	 * @return array<string, mixed>|WP_Error
	 */
	private static function prepare_body_ops_params( string $message, array $history, array $params ) {
		$params['mode'] = 'ops';

		if ( empty( $params['post_id'] ) && ! empty( $params['title'] ) ) {
			Neo_Pulse_Wp_Site_Inventory::warm( true );
			$item = Neo_Pulse_Wp_Site_Inventory::find_item_by_title( sanitize_text_field( (string) $params['title'] ) );
			if ( is_array( $item ) && ! empty( $item['id'] ) ) {
				$params['post_id'] = (int) $item['id'];
			}
		}

		if ( empty( $params['post_id'] ) ) {
			$plan   = Neo_Pulse_Wp_Backend_Assist_Pipeline_Phases::phase_plan( $message, $history, 'add_content', $params );
			$params = is_array( $plan['params'] ) ? array_merge( $params, $plan['params'] ) : $params;
		}

		$post_id = isset( $params['post_id'] ) ? absint( $params['post_id'] ) : 0;
		if ( $post_id < 1 ) {
			return $params;
		}

		if ( ! class_exists( 'Neo_Pulse_Wp_Backend_Assist_Body_Ops' ) ) {
			require_once NEO_PULSE_WP_PLUGIN_DIR . 'includes/backend-assist/class-neo-pulse-wp-backend-assist-body-ops.php';
		}

		$ops = null;
		if ( self::message_requests_heading_change( $message ) ) {
			$heading_ops = self::build_heading_change_ops( $message, $post_id, $history );
			if ( is_wp_error( $heading_ops ) ) {
				return $heading_ops;
			}
			$ops = $heading_ops;
		} elseif ( self::message_requests_body_schema_cleanup( $message ) && ! preg_match( '/\b(delete|remove|convert|table)\b/i', $message ) ) {
			$ops = array( array( 'op' => 'strip_json_ld' ) );
		} else {
			$planned = self::resolve_body_ops_for_message( $message, $post_id, $history );
			if ( is_wp_error( $planned ) && self::message_requests_body_schema_cleanup( $message ) ) {
				$ops = array( array( 'op' => 'strip_json_ld' ) );
			} elseif ( is_wp_error( $planned ) ) {
				return $planned;
			} else {
				$ops = $planned;
			}
			if ( is_array( $ops ) ) {
				$ops = self::normalize_body_ops_for_message( $message, $ops );
			}
			if ( is_array( $ops ) && self::message_requests_body_schema_cleanup( $message ) ) {
				$has_strip = false;
				foreach ( $ops as $op ) {
					if ( is_array( $op ) && sanitize_key( (string) ( $op['op'] ?? '' ) ) === 'strip_json_ld' ) {
						$has_strip = true;
						break;
					}
				}
				if ( ! $has_strip ) {
					$ops[] = array( 'op' => 'strip_json_ld' );
				}
			}
		}

		$post = get_post( $post_id );
		if ( ! $post instanceof WP_Post ) {
			return $params;
		}

		$original = (string) $post->post_content;
		$updated  = Neo_Pulse_Wp_Backend_Assist_Body_Ops::apply_ops( $original, $ops );
		if ( is_wp_error( $updated ) ) {
			return $updated;
		}
		if ( trim( (string) $updated ) === trim( $original ) ) {
			return new WP_Error(
				'neo-pulse_body_ops_noop',
				__( 'Could not apply body edit in place. The target section may not have been found, or block markup prevented the splice.', 'neo-pulse-wp' )
			);
		}

		$params['content']       = $updated;
		$params['mode']          = 'replace';
		$params['body_ops']      = true;
		$params['body_ops_list'] = $ops;
		$params['ops_summary']   = Neo_Pulse_Wp_Backend_Assist_Body_Ops::describe_ops( $ops );

		return $params;
	}

	/**
	 * @return array<string, mixed>|WP_Error
	 */
	public static function prepare_body_ops_params_public( string $message, array $history, array $params ) {
		return self::prepare_body_ops_params( $message, $history, $params );
	}

	/**
	 * @param array<int, array<string, mixed>> $history
	 * @return array<string, mixed>|null
	 */
	private static function resolve_heading_change_section( string $message, int $post_id, array $history ): ?array {
		if ( ! class_exists( 'Neo_Pulse_Wp_Backend_Assist_Body_Ops' ) ) {
			require_once NEO_PULSE_WP_PLUGIN_DIR . 'includes/backend-assist/class-neo-pulse-wp-backend-assist-body-ops.php';
		}
		$post = get_post( $post_id );
		if ( ! $post instanceof WP_Post ) {
			return null;
		}
		$html  = (string) $post->post_content;
		$lower = strtolower( trim( $message ) );

		if (
			preg_match( '/\b(?:the\s+)?intro\b|\bintro\s+h[23]\b|\bh[23]\b.*\bintro\b/i', $lower )
			|| (
				self::history_recently_created_intro( $history )
				&& preg_match( '/\b(?:it|that|this|the)\b|\bh[23]\b|\bheading\b/i', $lower )
			)
		) {
			return Neo_Pulse_Wp_Backend_Assist_Body_Ops::resolve_intro_heading_section( $html );
		}

		$heading = self::extract_heading_from_message( $message, $post_id );
		if ( $heading !== '' ) {
			foreach ( Neo_Pulse_Wp_Backend_Assist_Body_Ops::index_html_sections( $html ) as $sec ) {
				if ( strtolower( (string) $sec['heading_text'] ) === strtolower( $heading ) ) {
					return $sec;
				}
			}
		}

		$headed = array();
		foreach ( Neo_Pulse_Wp_Backend_Assist_Body_Ops::index_html_sections( $html ) as $sec ) {
			if ( ( $sec['heading_text'] ?? '' ) === '(intro)' || (int) ( $sec['level'] ?? 0 ) < 1 ) {
				continue;
			}
			$headed[] = $sec;
		}
		if ( count( $headed ) === 1 ) {
			return $headed[0];
		}

		return null;
	}

	/**
	 * @param array<int, array<string, mixed>> $history
	 * @return array<int, array<string, mixed>>|WP_Error
	 */
	public static function build_heading_change_ops_public( string $message, int $post_id, array $history ) {
		return self::build_heading_change_ops( $message, $post_id, $history );
	}

	/**
	 * @param array<int, array<string, mixed>> $history
	 * @return array<int, array<string, mixed>>|WP_Error
	 */
	private static function build_heading_change_ops( string $message, int $post_id, array $history ) {
		$sec = self::resolve_heading_change_section( $message, $post_id, $history );
		if ( $sec === null ) {
			return new WP_Error(
				'neo-pulse_heading_target',
				__( 'Could not find the intro heading to update. Name the section or retry after adding the intro.', 'neo-pulse-wp' )
			);
		}
		$current = (string) ( $sec['heading_text'] ?? '' );
		$new     = self::generate_heading_replacement( $message, $post_id, $current, $history );
		if ( is_wp_error( $new ) ) {
			return $new;
		}
		return array(
			array(
				'op'            => 'replace_heading',
				'section_index' => (int) ( $sec['index'] ?? 0 ),
				'new_heading'   => $new,
			),
		);
	}
}
