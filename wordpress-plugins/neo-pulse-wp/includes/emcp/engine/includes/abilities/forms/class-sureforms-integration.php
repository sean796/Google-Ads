<?php
/**
 * SureForms integration (Pro) — two dispatcher tools (sureforms-read /
 * sureforms-write) over SureForms' CPT + entries table.
 *
 * Verified live against SureForms 2.12.1 (Brainstorm Force). SureForms is a
 * Gutenberg-block form builder:
 *  - Forms are the `sureforms_form` CPT; fields are `srfm/*` blocks in
 *    post_content with attributes { label, slug, required }.
 *  - Entries live in the `{prefix}srfm_entries` table, accessed via
 *    SRFM\Inc\Database\Tables\Entries: get( $id ), get_all( $args ),
 *    update( $id, $data ), delete( $id ). Rows carry ID, form_id, status,
 *    form_data ({ slug => value }), created_at.
 *  - Entry count per form: SRFM\Inc\Database\Tables\Entries::get_total_entries_by_status( 'all', $form_id ).
 *  - SureForms admin is manage_options-gated.
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
class EMCP_Tools_SureForms_Integration extends EMCP_Tools_Form_Integration {

	const FORM_CPT     = 'sureforms_form';
	const ENTRIES_CLASS = '\SRFM\Inc\Database\Tables\Entries';

	/** @return string */
	public function id(): string {
		return 'sureforms';
	}

	/** @return string */
	public function label(): string {
		return 'SureForms';
	}

	/** @return bool */
	public function is_active(): bool {
		return defined( 'SRFM_VER' ) && class_exists( self::ENTRIES_CLASS );
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
			'list-forms'          => array(
				'mode' => 'read',
				'run'  => array( $this, 'op_list_forms' ),
				'perm' => $perm,
				'desc' => 'List SureForms forms (id, title, entry count).',
			),
			'get-form'            => array(
				'mode' => 'read',
				'run'  => array( $this, 'op_get_form' ),
				'perm' => $perm,
				'desc' => 'Get one form by { form_id }: fields (name, label, type, required) parsed from its blocks.',
			),
			'list-entries'        => array(
				'mode' => 'read',
				'run'  => array( $this, 'op_list_entries' ),
				'perm' => $perm,
				'desc' => 'List entries for a form: { form_id, limit? }. Returns id, status, date, and field values.',
			),
			'get-entry'           => array(
				'mode' => 'read',
				'run'  => array( $this, 'op_get_entry' ),
				'perm' => $perm,
				'desc' => 'Get one entry with its field values by { entry_id }.',
			),
			'update-entry-status' => array(
				'mode' => 'write',
				'run'  => array( $this, 'op_update_entry_status' ),
				'perm' => $perm,
				'desc' => 'Set an entry status: { entry_id, status } (e.g. read, unread, trash).',
			),
			'delete-entry'        => array(
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
		$cls = self::ENTRIES_CLASS;
		$out = array();
		foreach ( $forms as $form ) {
			$out[] = array(
				'id'          => (int) $form->ID,
				'title'       => $form->post_title,
				'entry_count' => (int) $cls::get_total_entries_by_status( 'all', (int) $form->ID ),
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
		$fields = array();
		$this->collect_fields( parse_blocks( $post->post_content ), $fields );
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
		$cls     = self::ENTRIES_CLASS;
		$rows    = (array) $cls::get_all(
			array(
				'where' => array(
					array( 'key' => 'form_id', 'value' => $id, 'compare' => '=' ),
				),
			)
		);
		$rows = array_slice( $rows, 0, $limit );
		$out  = array();
		foreach ( $rows as $row ) {
			$out[] = array(
				'id'         => (int) $this->prop( $row, 'ID' ),
				'status'     => (string) $this->prop( $row, 'status' ),
				'created_at' => (string) $this->prop( $row, 'created_at' ),
				'values'     => $this->form_data( $row ),
			);
		}
		return array( 'entries' => $out, 'count' => count( $out ) );
	}

	/**
	 * @param array $args { entry_id }.
	 * @return array|WP_Error
	 */
	public function op_get_entry( array $args ) {
		$row = $this->entry( $args );
		if ( is_wp_error( $row ) ) {
			return $row;
		}
		return array(
			'id'         => (int) $this->prop( $row, 'ID' ),
			'form_id'    => (int) $this->prop( $row, 'form_id' ),
			'status'     => (string) $this->prop( $row, 'status' ),
			'created_at' => (string) $this->prop( $row, 'created_at' ),
			'values'     => $this->form_data( $row ),
		);
	}

	/**
	 * @param array $args { entry_id, status }.
	 * @return array|WP_Error
	 */
	public function op_update_entry_status( array $args ) {
		$row = $this->entry( $args );
		if ( is_wp_error( $row ) ) {
			return $row;
		}
		$id     = (int) $this->prop( $row, 'ID' );
		$status = isset( $args['status'] ) ? sanitize_key( (string) $args['status'] ) : '';
		if ( '' === $status ) {
			return $this->missing( 'status' );
		}
		$cls = self::ENTRIES_CLASS;
		$cls::update( $id, array( 'status' => $status ) );
		return array( 'updated' => true, 'entry_id' => $id, 'status' => $status );
	}

	/**
	 * @param array $args { entry_id, confirm }.
	 * @return array|WP_Error
	 */
	public function op_delete_entry( array $args ) {
		$row = $this->entry( $args );
		if ( is_wp_error( $row ) ) {
			return $row;
		}
		$id  = (int) $this->prop( $row, 'ID' );
		$cls = self::ENTRIES_CLASS;
		$res = $cls::delete( $id );
		return array( 'deleted' => (bool) $res, 'entry_id' => $id );
	}

	/**
	 * Load an entry row or a WP_Error.
	 *
	 * @param array $args Operation arguments.
	 * @return object|array|WP_Error
	 */
	private function entry( array $args ) {
		$id = isset( $args['entry_id'] ) ? absint( $args['entry_id'] ) : 0;
		if ( ! $id ) {
			return $this->missing( 'entry_id' );
		}
		$cls = self::ENTRIES_CLASS;
		$row = $cls::get( $id );
		if ( empty( $row ) || ! $this->prop( $row, 'ID' ) ) {
			return $this->not_found( 'entry', $id );
		}
		return $row;
	}

	/**
	 * Recursively collect SureForms field blocks (srfm/*) from a parsed block
	 * tree.
	 *
	 * @param array $blocks Parsed blocks.
	 * @param array $out    Accumulator (by ref).
	 */
	private function collect_fields( array $blocks, array &$out ): void {
		foreach ( $blocks as $block ) {
			$name = $block['blockName'] ?? '';
			if ( is_string( $name ) && 0 === strpos( $name, 'srfm/' ) ) {
				$attrs = $block['attrs'] ?? array();
				$slug  = $attrs['slug'] ?? '';
				if ( '' !== $slug || isset( $attrs['label'] ) ) {
					$out[] = array(
						'name'     => (string) $slug,
						'label'    => (string) ( $attrs['label'] ?? '' ),
						'type'     => substr( $name, 5 ),
						'required' => ! empty( $attrs['required'] ),
					);
				}
			}
			if ( ! empty( $block['innerBlocks'] ) && is_array( $block['innerBlocks'] ) ) {
				$this->collect_fields( $block['innerBlocks'], $out );
			}
		}
	}

	/**
	 * The decoded { field => value } map from an entry row's form_data.
	 *
	 * @param object|array $row Entry row.
	 * @return array<string,mixed>
	 */
	private function form_data( $row ): array {
		$fd = $this->prop( $row, 'form_data' );
		if ( is_string( $fd ) ) {
			$fd = json_decode( $fd, true );
		}
		return is_array( $fd ) ? $fd : array();
	}

	/**
	 * Read a property from an object or array row.
	 *
	 * @param object|array $row Row.
	 * @param string       $key Property.
	 * @return mixed
	 */
	private function prop( $row, string $key ) {
		if ( is_object( $row ) ) {
			return $row->{$key} ?? null;
		}
		if ( is_array( $row ) ) {
			return $row[ $key ] ?? null;
		}
		return null;
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
				__( 'No SureForms %1$s with id %2$d.', 'emcp-tools' ),
				$what,
				$id
			),
			array( 'status' => 404 )
		);
	}
}
