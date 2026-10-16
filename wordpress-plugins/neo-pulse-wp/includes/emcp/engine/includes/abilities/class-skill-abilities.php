<?php
/**
 * Skill MCP tools (Pro, read-side): list-skills + get-skill.
 *
 * Exposes the bundled SKILL.md skills to connected MCP agents at runtime.
 * Self-guards on the Pro license, mirroring EMCP_Tools_Widget_Builder_Abilities.
 *
 * @package EMCP_Tools
 * @since   3.2.0
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class EMCP_Tools_Skill_Abilities {

	/** @var string[] */
	private $ability_names = array();

	/**
	 * @return bool
	 */
	private function is_available(): bool {
		return function_exists( 'emcp_tools_fs' ) && emcp_tools_fs()->can_use_premium_code();
	}

	/**
	 * @return string[]
	 */
	public function get_ability_names(): array {
		return $this->ability_names;
	}

	public function register(): void {
		if ( ! $this->is_available() ) {
			return;
		}

		emcp_tools_register_ability(
			'emcp-tools/list-skills',
			array(
				'label'               => __( 'List Skills', 'emcp-tools' ),
				'description'         => __( 'List the available EMCP skills, curated playbooks for common tasks (name + when-to-use description). Filter with search. When a skill matches the task, call get-skill to load its full instructions. Read-only.', 'emcp-tools' ),
				'category'            => 'emcp-tools',
				'execute_callback'    => array( $this, 'execute_list_skills' ),
				'permission_callback' => array( $this, 'check_read_permission' ),
				'input_schema'        => array(
					'type'       => 'object',
					'properties' => array(
						'search' => array(
							'type'        => 'string',
							'description' => __( 'Filter skills by substring of slug, name, or description.', 'emcp-tools' ),
						),
					),
				),
				'meta'                => array(
					'annotations'  => array(
						'readonly'    => true,
						'destructive' => false,
						'idempotent'  => true,
					),
					'show_in_rest' => true,
				),
			)
		);

		emcp_tools_register_ability(
			'emcp-tools/get-skill',
			array(
				'label'               => __( 'Get Skill', 'emcp-tools' ),
				'description'         => __( 'Load one skill\'s full instructions (its SKILL.md body) by slug, from list-skills. Read-only.', 'emcp-tools' ),
				'category'            => 'emcp-tools',
				'execute_callback'    => array( $this, 'execute_get_skill' ),
				'permission_callback' => array( $this, 'check_read_permission' ),
				'input_schema'        => array(
					'type'       => 'object',
					'required'   => array( 'slug' ),
					'properties' => array(
						'slug' => array(
							'type'        => 'string',
							'description' => __( 'The skill slug (from list-skills), e.g. "emcp-performance".', 'emcp-tools' ),
						),
					),
				),
				'meta'                => array(
					'annotations'  => array(
						'readonly'    => true,
						'destructive' => false,
						'idempotent'  => true,
					),
					'show_in_rest' => true,
				),
			)
		);

		$this->ability_names = array( 'emcp-tools/list-skills', 'emcp-tools/get-skill' );
	}

	/**
	 * @param array $input { search?: string }
	 * @return array
	 */
	public function execute_list_skills( $input ) {
		$search = isset( $input['search'] ) ? trim( (string) $input['search'] ) : '';
		// Compact entries (slug + one-line description) — the full descriptions
		// are large enough to overflow a small local model's context.
		$all    = EMCP_Tools_Skill_Catalog::compact();
		$skills = $all;

		if ( '' !== $search ) {
			$needle = $search;
			$skills = array_values(
				array_filter(
					$all,
					static function ( $s ) use ( $needle ) {
						return false !== stripos( ( $s['slug'] ?? '' ) . ' ' . ( $s['name'] ?? '' ) . ' ' . ( $s['description'] ?? '' ), $needle );
					}
				)
			);

			// A literal search miss (e.g. "saas") must not dead-end the agent with
			// an empty list. Return the full catalog with a nudge toward get-skill
			// and the general building skill, so it can keep going.
			if ( empty( $skills ) && ! empty( $all ) ) {
				$has_general = false;
				foreach ( $all as $s ) {
					if ( 'emcp-skills' === ( $s['slug'] ?? '' ) ) {
						$has_general = true;
						break;
					}
				}
				return array(
					'skills' => $all,
					'note'   => sprintf(
						/* translators: 1: search term, 2: skill count, 3: optional general-skill hint. */
						__( 'No skill name matched "%1$s". Showing all %2$d skills, call get-skill with a slug to load one.%3$s', 'emcp-tools' ),
						$search,
						count( $all ),
						$has_general ? __( ' For building any Elementor page, start with the general "emcp-skills" skill.', 'emcp-tools' ) : ''
					),
				);
			}
		}

		return array( 'skills' => $skills );
	}

	/**
	 * @param array $input { slug: string }
	 * @return array|\WP_Error
	 */
	public function execute_get_skill( $input ) {
		$slug  = (string) ( $input['slug'] ?? '' );
		$skill = EMCP_Tools_Skill_Catalog::get( $slug );
		if ( null === $skill ) {
			return new \WP_Error( 'not_found', __( 'No skill with that slug.', 'emcp-tools' ) );
		}
		return $skill;
	}

	/**
	 * @return bool
	 */
	public function check_read_permission(): bool {
		return current_user_can( 'edit_posts' );
	}
}
