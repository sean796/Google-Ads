<?php
/**
 * Novamira-led page design harness (OpenRouter agent + check-design).
 *
 * @package Neo_Pulse_Wp
 */

defined( 'ABSPATH' ) || exit;

class Neo_Pulse_Wp_Backend_Assist_Novamira_Page_Design_Harness {

	const CHECK_OUTPUT_MAX_BYTES = 900000;

	const MODEL = Neo_Pulse_Wp_Backend_Assist_Context::REASON_MODEL;

	/**
	 * @param array<string,mixed> $params
	 * @return array<string,mixed>|WP_Error
	 */
	public static function run( int $post_id, array $params ) {
		if ( ! function_exists( 'wp_get_ability' ) ) {
			return new WP_Error( 'neo-pulse_novamira', __( 'Novamira abilities are not available.', 'neo-pulse-wp' ) );
		}

		// Page design always uses native Elementor widgets built from composed section copy.
		$elementor_sections = self::elementor_sections_from_params( $params );
		if ( $elementor_sections === array() ) {
			return new WP_Error(
				'neo-pulse_novamira_design',
				__( 'No Elementor section copy to design. Run compose_elementor_page_sections first.', 'neo-pulse-wp' )
			);
		}
		$collected = self::collected_from_elementor_sections( $elementor_sections );

		$agent_context = Neo_Pulse_Wp_Backend_Assist_Novamira_Page::run_ability( 'novamira/agent-context', array() );
		if ( is_wp_error( $agent_context ) ) {
			return $agent_context;
		}

		$active_design = Neo_Pulse_Wp_Backend_Assist_Novamira_Page::run_ability( 'novamira/get-active-design', array() );
		if ( is_wp_error( $active_design ) ) {
			return $active_design;
		}

		if ( ! empty( $active_design['active'] ) && isset( $active_design['readiness'] ) && is_array( $active_design['readiness'] ) ) {
			if ( empty( $active_design['readiness']['ready'] ) ) {
				return new WP_Error(
					'neo-pulse_novamira_design',
					__( 'Novamira active design is not ready. Complete or repair the design in Novamira before page design.', 'neo-pulse-wp' )
				);
			}
		}

		$skill = self::load_design_skill();
		if ( is_wp_error( $skill ) ) {
			return $skill;
		}

		$allowlist = self::discover_tool_allowlist();
		if ( is_wp_error( $allowlist ) ) {
			return $allowlist;
		}

		$rag_note = self::rag_reference_note( $post_id );
		$system   = self::build_system_prompt( $skill, $agent_context, $active_design );
		$user     = self::build_user_prompt_elementor( $post_id, $collected, $rag_note );

		$executor = static function ( string $ability_name, array $input ) use ( $post_id ) {
			$target_error = self::reject_foreign_target( $input, $post_id );
			if ( is_wp_error( $target_error ) ) {
				return $target_error;
			}
			return Neo_Pulse_Wp_Backend_Assist_Novamira_Page::run_ability( $ability_name, $input );
		};

		$loop = Neo_Pulse_Wp_Backend_Assist_Openrouter_Agent::run_loop(
			self::MODEL,
			$system,
			$user,
			$allowlist,
			$executor
		);
		if ( is_wp_error( $loop ) ) {
			return array(
				'success' => false,
				'post_id' => $post_id,
				'error'   => $loop->get_error_message(),
			);
		}

		self::ensure_published( $post_id );

		$check = self::run_check_design( $post_id );
		if ( is_wp_error( $check ) ) {
			return array(
				'success' => false,
				'post_id' => $post_id,
				'error'   => $check->get_error_message(),
			);
		}

		if ( ! self::check_design_passed( $check ) ) {
			$repair_user = $user . "\n\nDesign check failed. Fix every violation using Novamira Elementor tools, then stop.\nViolations:\n"
				. wp_json_encode( $check['violations'] ?? array() );
			$repair = Neo_Pulse_Wp_Backend_Assist_Openrouter_Agent::run_loop(
				self::MODEL,
				$system,
				$repair_user,
				$allowlist,
				$executor
			);
			if ( is_wp_error( $repair ) ) {
				return array(
					'success'      => false,
					'post_id'      => $post_id,
					'error'        => $repair->get_error_message(),
					'check_design' => $check,
				);
			}
			$check = self::run_check_design( $post_id );
			if ( is_wp_error( $check ) ) {
				return array(
					'success' => false,
					'post_id' => $post_id,
					'error'   => $check->get_error_message(),
				);
			}
			if ( ! self::check_design_passed( $check ) ) {
				return array(
					'success'      => false,
					'post_id'      => $post_id,
					'error'        => __( 'Novamira check-design still failing after repair pass.', 'neo-pulse-wp' ),
					'check_design' => $check,
				);
			}
		}

		return array(
			'success'      => true,
			'post_id'      => $post_id,
			'title'        => get_the_title( $post_id ),
			'view_url'     => get_permalink( $post_id ),
			'edit_url'     => get_edit_post_link( $post_id, 'raw' ),
			'section_plan' => self::section_plan_from_elementor_sections( $elementor_sections ),
			'check_design' => $check,
			'summary'      => sprintf(
				/* translators: %s: page title */
				__( 'Designed and published "%s" with Novamira Elementor abilities and check-design.', 'neo-pulse-wp' ),
				get_the_title( $post_id )
			),
		);
	}

	/**
	 * Abilities may only touch the target page: reject any post/page/document id in the input
	 * (at any depth) that is not the page being designed.
	 *
	 * @param array<string,mixed> $input
	 * @return true|WP_Error
	 */
	public static function reject_foreign_target( array $input, int $post_id ) {
		$id_keys = array( 'post_id', 'page_id', 'postid', 'pageid', 'document_id', 'documentid', 'post', 'page', 'target_post_id', 'target_page_id' );
		$stack   = array( $input );
		while ( $stack !== array() ) {
			$node = array_pop( $stack );
			foreach ( $node as $key => $value ) {
				if ( is_array( $value ) ) {
					$stack[] = $value;
					continue;
				}
				if ( ! is_string( $key ) || ! in_array( strtolower( $key ), $id_keys, true ) ) {
					continue;
				}
				if ( ( is_int( $value ) || ( is_string( $value ) && ctype_digit( $value ) ) ) && (int) $value !== $post_id ) {
					return new WP_Error(
						'neo-pulse_novamira_target',
						sprintf(
							/* translators: 1: requested id, 2: target page id */
							__( 'Refused: this design run may only edit page %2$d (ability input targeted %1$d).', 'neo-pulse-wp' ),
							(int) $value,
							$post_id
						)
					);
				}
			}
		}
		return true;
	}

	/**
	 * @param array<string,mixed> $params
	 * @return array<int,array{h2:string,body_html:string,bullets:array<int,string>,cta:string}>
	 */
	private static function elementor_sections_from_params( array $params ): array {
		if ( empty( $params['elementor_sections'] ) || ! is_array( $params['elementor_sections'] ) ) {
			return array();
		}
		return Neo_Pulse_Wp_Backend_Assist_Tools_Elementor_Sections::normalize_sections( $params['elementor_sections'] );
	}

	/**
	 * @param array<int,array{h2:string,body_html:string,bullets:array<int,string>,cta:string}> $sections
	 * @return array{slots:array<int,array<string,mixed>>,block_spans:array<int,array{label:string,slot_indexes:array<int,int>}>}
	 */
	private static function collected_from_elementor_sections( array $sections ): array {
		$slots       = array();
		$block_spans = array();
		$offset      = 0;
		foreach ( $sections as $section ) {
			$indexes = array();
			$h2      = (string) ( $section['h2'] ?? '' );
			$body    = (string) ( $section['body_html'] ?? '' );
			$slots[] = array(
				'type' => 'body',
				'html' => '<h2>' . esc_html( $h2 ) . '</h2>' . $body,
			);
			$indexes[] = $offset;
			++$offset;
			if ( ! empty( $section['bullets'] ) && is_array( $section['bullets'] ) ) {
				$list = '<ul>';
				foreach ( $section['bullets'] as $bullet ) {
					$list .= '<li>' . esc_html( (string) $bullet ) . '</li>';
				}
				$list .= '</ul>';
				$slots[]   = array( 'type' => 'list', 'html' => $list );
				$indexes[] = $offset;
				++$offset;
			}
			if ( ! empty( $section['cta'] ) ) {
				$slots[]   = array( 'type' => 'cta', 'text' => (string) $section['cta'] );
				$indexes[] = $offset;
				++$offset;
			}
			$block_spans[] = array(
				'label'        => $h2,
				'slot_indexes' => $indexes,
			);
		}
		return array(
			'slots'       => $slots,
			'block_spans' => $block_spans,
		);
	}

	/**
	 * @param array<int,array{h2:string,body_html:string,bullets?:array<int,string>,cta?:string}> $sections
	 * @return array<int,array{label:string,slot_indexes:array<int,int>}>
	 */
	public static function section_plan_from_elementor_sections( array $sections ): array {
		$plan = array();
		foreach ( Neo_Pulse_Wp_Backend_Assist_Tools_Elementor_Sections::normalize_sections( $sections ) as $i => $section ) {
			$plan[] = array(
				'label'        => $section['h2'],
				'slot_indexes' => array( $i ),
			);
		}
		return $plan;
	}

	private static function load_design_skill() {
		if ( ! function_exists( 'wp_has_ability' ) ) {
			return new WP_Error( 'neo-pulse_novamira_design', __( 'WordPress Abilities API is unavailable.', 'neo-pulse-wp' ) );
		}
		if ( wp_has_ability( 'novamira/skill-get' ) ) {
			$result = Neo_Pulse_Wp_Backend_Assist_Novamira_Page::run_ability(
				'novamira/skill-get',
				array( 'slug' => 'novamira-design' )
			);
			if ( ! is_wp_error( $result ) && ! empty( $result['content'] ) ) {
				return (string) $result['content'];
			}
		}
		if ( wp_has_ability( 'novamira/skill-prompt-novamira-design' ) ) {
			$result = Neo_Pulse_Wp_Backend_Assist_Novamira_Page::run_ability( 'novamira/skill-prompt-novamira-design', array() );
			if ( ! is_wp_error( $result ) && ! empty( $result['prompt'] ) ) {
				return (string) $result['prompt'];
			}
			if ( ! is_wp_error( $result ) && ! empty( $result['content'] ) ) {
				return (string) $result['content'];
			}
		}
		return new WP_Error(
			'neo-pulse_novamira_design',
			__( 'Novamira design skill is missing. Enable Novamira Design in Abilities Hub.', 'neo-pulse-wp' )
		);
	}

	/**
	 * @return array<int,string>|WP_Error
	 */
	public static function discover_tool_allowlist() {
		$always = array(
			'novamira/agent-context',
			'novamira/get-active-design',
			'novamira/check-design',
		);

		$write = self::filter_elementor_write_abilities( self::discover_ability_names() );
		if ( $write === array() ) {
			return new WP_Error(
				'neo-pulse_novamira_design',
				__( 'No Novamira Elementor write abilities found. Enable Novamira Elementor integration on this site.', 'neo-pulse-wp' )
			);
		}

		return array_values( array_unique( array_merge( $always, $write ) ) );
	}

	/**
	 * @return array<int,string>
	 */
	private static function discover_ability_names(): array {
		if ( wp_has_ability( 'novamira-mcp-adapter/discover-abilities' ) ) {
			$result = Neo_Pulse_Wp_Backend_Assist_Novamira_Page::run_ability( 'novamira-mcp-adapter/discover-abilities', array() );
			if ( ! is_wp_error( $result ) && ! empty( $result['abilities'] ) && is_array( $result['abilities'] ) ) {
				$names = array();
				foreach ( $result['abilities'] as $row ) {
					if ( is_array( $row ) && ! empty( $row['name'] ) ) {
						$names[] = (string) $row['name'];
					} elseif ( is_string( $row ) ) {
						$names[] = $row;
					}
				}
				if ( $names !== array() ) {
					return $names;
				}
			}
		}

		$names = array();
		if ( function_exists( 'wp_get_abilities' ) ) {
			$all = wp_get_abilities();
			if ( is_array( $all ) ) {
				foreach ( $all as $ability ) {
					if ( is_object( $ability ) && method_exists( $ability, 'get_name' ) ) {
						$names[] = (string) $ability->get_name();
					}
				}
			}
		}
		return $names;
	}

	/**
	 * @param array<int,mixed> $candidates
	 * @return array<int,string>
	 */
	public static function filter_elementor_write_abilities( array $candidates ): array {
		$write = array();
		foreach ( $candidates as $name ) {
			if ( ! is_string( $name ) || ! str_starts_with( $name, 'novamira/' ) ) {
				continue;
			}
			if ( self::is_read_only_ability( $name ) ) {
				continue;
			}
			if ( self::is_elementor_write_ability( $name ) ) {
				$write[] = $name;
			}
		}
		return array_values( array_unique( $write ) );
	}

	/**
	 * Whether check-design passed (used after repair gate).
	 *
	 * @param array<string,mixed> $check
	 */
	public static function check_design_passed( array $check ): bool {
		return ! empty( $check['ok'] );
	}

	private static function is_read_only_ability( string $name ): bool {
		$lower = strtolower( $name );
		foreach ( array( '/get-', '/list-', '/discover-', '/skill-get', '/skill-prompt-', '/check-design', '/agent-context', '/get-active-design' ) as $needle ) {
			if ( str_contains( $lower, $needle ) ) {
				return true;
			}
		}
		return false;
	}

	private static function is_elementor_write_ability( string $name ): bool {
		$lower = strtolower( $name );
		if ( ! str_contains( $lower, 'elementor' ) ) {
			return false;
		}
		foreach ( array( 'update', 'write', 'set', 'create', 'save', 'apply', 'insert', 'replace', 'build' ) as $verb ) {
			if ( str_contains( $lower, $verb ) ) {
				return true;
			}
		}
		return false;
	}

	private static function rag_reference_note( int $post_id ): string {
		$digest = Neo_Pulse_Wp_Backend_Assist_Novamira_Page_Design_Rag::build( $post_id );
		if ( is_wp_error( $digest ) ) {
			return '';
		}
		$ids = isset( $digest['source_page_ids'] ) && is_array( $digest['source_page_ids'] ) ? $digest['source_page_ids'] : array();
		$arch = isset( $digest['archetypes'] ) && is_array( $digest['archetypes'] ) ? $digest['archetypes'] : array();
		$lines = array( 'Site reference pages (match their marketing layout, do not copy their copy):' );
		foreach ( array_slice( $ids, 0, 4 ) as $id ) {
			$id = absint( $id );
			if ( $id < 1 ) {
				continue;
			}
			$lines[] = '- post_id ' . $id . ': ' . get_the_title( $id ) . ' (' . get_permalink( $id ) . ')';
		}
		if ( $arch !== array() ) {
			$lines[] = 'Section archetypes seen on site: ' . implode( ', ', $arch );
		}
		return implode( "\n", $lines );
	}

	/**
	 * @param array<string,mixed> $agent_context
	 * @param array<string,mixed> $active_design
	 */
	private static function build_system_prompt( string $skill, array $agent_context, array $active_design ): string {
		$parts   = array();
		$parts[] = $skill;
		$parts[] = 'Novamira agent context (JSON): ' . wp_json_encode( $agent_context );
		$parts[] = 'Active design summary (JSON): ' . wp_json_encode(
			array(
				'active'    => $active_design['active'] ?? false,
				'authority' => $active_design['authority'] ?? '',
				'builder'   => $active_design['builder'] ?? null,
				'tokens'    => $active_design['tokens'] ?? array(),
				'guidance'  => $active_design['guidance'] ?? array(),
			)
		);
		$layout_rules = array(
			'You are building one WordPress page in Elementor using only native Elementor widgets (heading, text-editor, button, image) via Novamira tools.',
			'Only edit the target page_id given below; never edit, create or delete any other page.',
			'Map each Elementor content section below to one distinct Elementor section on the page.',
			'Place section H2 in a heading widget, body in text widgets, CTA in a button widget.',
			"Match the site's existing pages: columns, heroes, images, readable contrast.",
			'When finished building, respond with a short plain summary (no JSON).',
		);
		$parts[] = implode( "\n", $layout_rules );
		return implode( "\n\n", $parts );
	}

	/**
	 * @param array{slots:array<int,array<string,mixed>>,block_spans:array<int,array{label:string,slot_indexes:array<int,int>}>} $collected
	 */
	private static function build_user_prompt_elementor( int $post_id, array $collected, string $rag_note ): string {
		$page_title = get_the_title( $post_id );
		$lines      = array(
			'Target page_id: ' . $post_id,
			'Page title: ' . $page_title,
			'Permalink: ' . get_permalink( $post_id ),
			'Content mode: native Elementor widgets only.',
		);
		if ( $rag_note !== '' ) {
			$lines[] = $rag_note;
		}
		$lines[] = 'Elementor sections (one Elementor section each):';
		foreach ( $collected['block_spans'] as $i => $span ) {
			$label = (string) ( $span['label'] ?? 'Section ' . ( $i + 1 ) );
			$lines[] = 'Section ' . ( $i + 1 ) . ' H2: ' . $label;
			foreach ( (array) ( $span['slot_indexes'] ?? array() ) as $idx ) {
				$slot = $collected['slots'][ (int) $idx ] ?? null;
				if ( ! is_array( $slot ) ) {
					continue;
				}
				$type    = (string) ( $slot['type'] ?? '' );
				$preview = self::slot_preview( $slot );
				$lines[] = '  part type=' . $type . ' ' . substr( $preview, 0, 400 );
			}
		}
		return implode( "\n", $lines );
	}

	/**
	 * @param array<string,mixed> $slot
	 */
	private static function slot_preview( array $slot ): string {
		foreach ( array( 'html', 'text', 'content', 'title', 'label' ) as $key ) {
			if ( ! empty( $slot[ $key ] ) && is_string( $slot[ $key ] ) ) {
				return wp_strip_all_tags( $slot[ $key ] );
			}
		}
		return '';
	}

	private static function ensure_published( int $post_id ): void {
		$update = array(
			'ID'          => $post_id,
			'post_status' => 'publish',
		);
		$name = (string) get_post_field( 'post_name', $post_id );
		if ( $name !== '' && str_contains( $name, 'trashed' ) ) {
			$update['post_name'] = sanitize_title( get_the_title( $post_id ) );
		}
		wp_update_post( $update );
	}

	/**
	 * @return array<string,mixed>|WP_Error
	 */
	private static function run_check_design( int $post_id ) {
		$html = self::fetch_public_html( $post_id );
		if ( is_wp_error( $html ) ) {
			return $html;
		}
		if ( strlen( $html ) > self::CHECK_OUTPUT_MAX_BYTES ) {
			$html = substr( $html, 0, self::CHECK_OUTPUT_MAX_BYTES );
		}
		return Neo_Pulse_Wp_Backend_Assist_Novamira_Page::run_ability(
			'novamira/check-design',
			array( 'output' => $html )
		);
	}

	/**
	 * @return string|WP_Error
	 */
	private static function fetch_public_html( int $post_id ) {
		$url = get_permalink( $post_id );
		if ( ! is_string( $url ) || $url === '' ) {
			return new WP_Error( 'neo-pulse_novamira_design', __( 'Page permalink missing for design check.', 'neo-pulse-wp' ) );
		}
		$response = wp_remote_get(
			$url,
			array(
				'timeout'   => 45,
				'sslverify' => true,
			)
		);
		if ( is_wp_error( $response ) ) {
			return $response;
		}
		$code = (int) wp_remote_retrieve_response_code( $response );
		if ( $code < 200 || $code >= 300 ) {
			return new WP_Error(
				'neo-pulse_novamira_design',
				sprintf(
					/* translators: %d: HTTP status */
					__( 'Could not fetch public page HTML (HTTP %d).', 'neo-pulse-wp' ),
					$code
				)
			);
		}
		$body = wp_remote_retrieve_body( $response );
		if ( ! is_string( $body ) || trim( $body ) === '' ) {
			return new WP_Error( 'neo-pulse_novamira_design', __( 'Public page HTML was empty.', 'neo-pulse-wp' ) );
		}
		return $body;
	}
}
