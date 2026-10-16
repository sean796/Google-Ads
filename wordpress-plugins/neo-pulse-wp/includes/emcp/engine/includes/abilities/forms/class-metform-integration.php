<?php
/**
 * MetForm integration (Pro) — two dispatcher tools (metform-read /
 * metform-write) over MetForm's CPTs.
 *
 * Verified live against MetForm 4.1.7 (Wpmet). MetForm is an Elementor-based
 * form builder:
 *  - Forms are the `metform-form` CPT; the field layout lives in the form's
 *    `_elementor_data` (each field widget carries `settings.mf_input_name`,
 *    `mf_input_label`, `mf_input_required`; the widgetType is `mf-<type>`).
 *  - Entries are the `metform-entry` CPT with post meta
 *    `metform_entries__form_id` (the source form) and
 *    `metform_entries__form_data` (a { field_name => value } map).
 *  - Form entry total is cached in the form's `metform_form__form_total_entries`.
 *  - MetForm admin is manage_options-gated.
 *
 * @package EMCP_Tools
 * @since   3.5.0
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * @since 3.5.0
 */
class EMCP_Tools_MetForm_Integration extends EMCP_Tools_Form_Integration {

	const FORM_CPT    = 'metform-form';
	const ENTRY_CPT   = 'metform-entry';
	const META_FORMID = 'metform_entries__form_id';
	const META_DATA   = 'metform_entries__form_data';
	const META_TOTAL  = 'metform_form__form_total_entries';

	/** @return string */
	public function id(): string {
		return 'metform';
	}

	/** @return string */
	public function label(): string {
		return 'MetForm';
	}

	/** @return bool */
	public function is_active(): bool {
		return defined( 'METFORM_VERSION' ) || post_type_exists( self::FORM_CPT );
	}

	/** Pro gate + plugin-active. */
	public function register(): void {
		if ( ! ( function_exists( 'emcp_tools_fs' ) && emcp_tools_fs()->can_use_premium_code() ) ) {
			return;
		}
		parent::register();
	}

	/** @return array<string,array> */
	protected function operations(): array {
		$perm = static function (): bool {
			return current_user_can( 'manage_options' );
		};

		return array(
			'list-forms'   => array(
				'mode' => 'read',
				'run'  => array( $this, 'op_list_forms' ),
				'perm' => $perm,
				'desc' => 'List MetForm forms (id, title, entry count).',
			),
			'get-form'     => array(
				'mode' => 'read',
				'run'  => array( $this, 'op_get_form' ),
				'perm' => $perm,
				'desc' => 'Get one form by { form_id }: fields (name, label, type, required) parsed from its layout.',
			),
			'list-entries' => array(
				'mode' => 'read',
				'run'  => array( $this, 'op_list_entries' ),
				'perm' => $perm,
				'desc' => 'List entries for a form: { form_id, limit? }. Returns id, date, and field values.',
			),
			'get-entry'    => array(
				'mode' => 'read',
				'run'  => array( $this, 'op_get_entry' ),
				'perm' => $perm,
				'desc' => 'Get one entry with its field values by { entry_id }.',
			),
			'delete-entry' => array(
				'mode'    => 'write',
				'run'     => array( $this, 'op_delete_entry' ),
				'perm'    => $perm,
				'desc'    => 'Delete an entry by { entry_id }. Irreversible.',
				'confirm' => true,
			),
		);
	}

	/**
	 * @param array $args Unused.
	 * @return array
	 */
	public function op_list_forms( array $args ): array {
		$forms = get_posts(
			array(
				'post_type'      => self::FORM_CPT,
				'post_status'    => 'any',
				'posts_per_page' => -1,
				'orderby'        => 'ID',
				'order'          => 'DESC',
			)
		);
		$out = array();
		foreach ( $forms as $form ) {
			$total = get_post_meta( $form->ID, self::META_TOTAL, true );
			$out[] = array(
				'id'          => (int) $form->ID,
				'title'       => $form->post_title,
				'entry_count' => '' !== $total ? (int) $total : $this->count_entries( $form->ID ),
			);
		}
		return array( 'forms' => $out );
	}

	/**
	 * @param array $args { form_id }.
	 * @return array|WP_Error
	 */
	public function op_get_form( array $args ) {
		$id = isset( $args['form_id'] ) ? absint( $args['form_id'] ) : 0;
		if ( ! $id ) {
			return $this->missing( 'form_id' );
		}
		$post = get_post( $id );
		if ( ! $post || self::FORM_CPT !== $post->post_type ) {
			return $this->not_found( 'form', $id );
		}
		$data   = get_post_meta( $id, '_elementor_data', true );
		$tree   = is_string( $data ) ? json_decode( $data, true ) : ( is_array( $data ) ? $data : array() );
		$fields = array();
		$this->collect_fields( is_array( $tree ) ? $tree : array(), $fields );
		return array(
			'id'     => $id,
			'title'  => $post->post_title,
			'fields' => $fields,
		);
	}

	/**
	 * @param array $args { form_id, limit? }.
	 * @return array|WP_Error
	 */
	public function op_list_entries( array $args ) {
		$id = isset( $args['form_id'] ) ? absint( $args['form_id'] ) : 0;
		if ( ! $id ) {
			return $this->missing( 'form_id' );
		}
		$limit   = isset( $args['limit'] ) ? absint( $args['limit'] ) : 50;
		$limit   = $limit > 0 ? min( $limit, 200 ) : 50;
		$entries = get_posts(
			array(
				'post_type'      => self::ENTRY_CPT,
				'post_status'    => 'any',
				'posts_per_page' => $limit,
				'orderby'        => 'ID',
				'order'          => 'DESC',
				'meta_key'       => self::META_FORMID, // phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_meta_key
				'meta_value'     => $id,               // phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_meta_value
			)
		);
		$out = array();
		foreach ( $entries as $entry ) {
			$out[] = array(
				'id'         => (int) $entry->ID,
				'created_at' => $entry->post_date,
				'values'     => $this->entry_values( $entry->ID ),
			);
		}
		return array( 'entries' => $out, 'count' => count( $out ) );
	}

	/**
	 * @param array $args { entry_id }.
	 * @return array|WP_Error
	 */
	public function op_get_entry( array $args ) {
		$id   = isset( $args['entry_id'] ) ? absint( $args['entry_id'] ) : 0;
		$post = $this->entry_post( $id );
		if ( is_wp_error( $post ) ) {
			return $post;
		}
		return array(
			'id'         => $id,
			'form_id'    => (int) get_post_meta( $id, self::META_FORMID, true ),
			'created_at' => $post->post_date,
			'values'     => $this->entry_values( $id ),
		);
	}

	/**
	 * @param array $args { entry_id, confirm }.
	 * @return array|WP_Error
	 */
	public function op_delete_entry( array $args ) {
		$id   = isset( $args['entry_id'] ) ? absint( $args['entry_id'] ) : 0;
		$post = $this->entry_post( $id );
		if ( is_wp_error( $post ) ) {
			return $post;
		}
		$deleted = wp_delete_post( $id, true );
		return array( 'deleted' => (bool) $deleted, 'entry_id' => $id );
	}

	/**
	 * Recursively collect MetForm field widgets (marked by settings.mf_input_name)
	 * from a decoded _elementor_data tree.
	 *
	 * @param array $nodes Elementor elements.
	 * @param array $out   Accumulator (by ref).
	 */
	private function collect_fields( array $nodes, array &$out ): void {
		foreach ( $nodes as $node ) {
			if ( ! is_array( $node ) ) {
				continue;
			}
			$settings = $node['settings'] ?? array();
			if ( is_array( $settings ) && ! empty( $settings['mf_input_name'] ) ) {
				$type = isset( $node['widgetType'] ) ? preg_replace( '/^mf-/', '', (string) $node['widgetType'] ) : '';
				$out[] = array(
					'name'     => (string) $settings['mf_input_name'],
					'label'    => (string) ( $settings['mf_input_label'] ?? '' ),
					'type'     => $settings['mf_input_type'] ?? $type,
					'required' => in_array( $settings['mf_input_required'] ?? '', array( 'yes', '1', 1, true, 'true' ), true ),
				);
			}
			if ( ! empty( $node['elements'] ) && is_array( $node['elements'] ) ) {
				$this->collect_fields( $node['elements'], $out );
			}
		}
	}

	/**
	 * The { field_name => value } map stored on an entry.
	 *
	 * @param int $entry_id Entry id.
	 * @return array<string,mixed>
	 */
	private function entry_values( int $entry_id ): array {
		$data = get_post_meta( $entry_id, self::META_DATA, true );
		return is_array( $data ) ? $data : array();
	}

	/**
	 * Count entries for a form.
	 *
	 * @param int $form_id Form id.
	 * @return int
	 */
	private function count_entries( int $form_id ): int {
		$q = new \WP_Query(
			array(
				'post_type'      => self::ENTRY_CPT,
				'post_status'    => 'any',
				'fields'         => 'ids',
				'posts_per_page' => 1,
				'meta_key'       => self::META_FORMID, // phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_meta_key
				'meta_value'     => $form_id,          // phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_meta_value
			)
		);
		return (int) $q->found_posts;
	}

	/**
	 * Fetch a metform-entry post or a WP_Error.
	 *
	 * @param int $id Entry id.
	 * @return \WP_Post|WP_Error
	 */
	private function entry_post( int $id ) {
		if ( ! $id ) {
			return $this->missing( 'entry_id' );
		}
		$post = get_post( $id );
		if ( ! $post || self::ENTRY_CPT !== $post->post_type ) {
			return $this->not_found( 'entry', $id );
		}
		return $post;
	}

	/**
	 * @param string $field Argument name.
	 * @return WP_Error
	 */
	private function missing( string $field ): WP_Error {
		return new WP_Error(
			'missing_argument',
			sprintf(
				/* translators: %s: argument name */
				__( 'Missing required argument: %s.', 'emcp-tools' ),
				$field
			),
			array( 'status' => 400 )
		);
	}

	/**
	 * @param string $what Thing.
	 * @param int    $id   Id.
	 * @return WP_Error
	 */
	private function not_found( string $what, int $id ): WP_Error {
		return new WP_Error(
			'not_found',
			sprintf(
				/* translators: 1: object type, 2: id */
				__( 'No MetForm %1$s with id %2$d.', 'emcp-tools' ),
				$what,
				$id
			),
			array( 'status' => 404 )
		);
	}
}
