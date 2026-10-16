<?php
/**
 * Ninja Forms integration (Pro) — two dispatcher tools (ninjaforms-read /
 * ninjaforms-write) over the Ninja_Forms() model factory.
 *
 * Verified live against Ninja Forms free core 3.14.9:
 *  - Ninja_Forms()->form()->get_forms() → NF_Database_Models_Form[]
 *    (->get_id(), ->get_setting('title')).
 *  - Ninja_Forms()->form($id)->get_fields() → field models
 *    (->get_id(), ->get_setting('key'|'type'|'label'|'required')).
 *  - Ninja_Forms()->form($id)->get_subs() → submission models;
 *    ->get_id(), ->get_seq_num(), ->get_sub_date($fmt), ->get_field_values().
 *  - Ninja_Forms()->form($form_id)->get_sub($id) → one submission.
 *  - get_field_values() returns both raw _field_N keys and human field keys plus
 *    _form_id/_seq_num — we keep only the human keys (no leading underscore).
 *  - Submissions are the nf_sub CPT (meta _form_id); deleted via wp_delete_post.
 *  - Ninja admin is manage_options-gated by default.
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
class EMCP_Tools_NinjaForms_Integration extends EMCP_Tools_Form_Integration {

	/** @return string */
	public function id(): string {
		return 'ninjaforms';
	}

	/** @return string */
	public function label(): string {
		return 'Ninja Forms';
	}

	/** @return bool */
	public function is_active(): bool {
		return function_exists( 'Ninja_Forms' );
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
				'desc' => 'List Ninja Forms (id, title, entry count).',
			),
			'get-form'     => array(
				'mode' => 'read',
				'run'  => array( $this, 'op_get_form' ),
				'perm' => $perm,
				'desc' => 'Get one form by { form_id }: fields (key, type, label, required).',
			),
			'list-entries' => array(
				'mode' => 'read',
				'run'  => array( $this, 'op_list_entries' ),
				'perm' => $perm,
				'desc' => 'List submissions for a form: { form_id, limit? }. Returns id, seq, date, and field values.',
			),
			'get-entry'    => array(
				'mode' => 'read',
				'run'  => array( $this, 'op_get_entry' ),
				'perm' => $perm,
				'desc' => 'Get one submission with its field values by { entry_id }.',
			),
			'delete-entry' => array(
				'mode'    => 'write',
				'run'     => array( $this, 'op_delete_entry' ),
				'perm'    => $perm,
				'desc'    => 'Delete a submission by { entry_id }. Irreversible.',
				'confirm' => true,
			),
		);
	}

	/**
	 * @param array $args Unused.
	 * @return array
	 */
	public function op_list_forms( array $args ): array {
		$out = array();
		foreach ( (array) \Ninja_Forms()->form()->get_forms() as $form ) {
			$fid   = (int) $form->get_id();
			$out[] = array(
				'id'          => $fid,
				'title'       => $form->get_setting( 'title' ),
				'entry_count' => $this->entry_count( $fid ),
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
		$form = \Ninja_Forms()->form( $id )->get();
		if ( ! $form || ! $form->get_id() ) {
			return $this->not_found( 'form', $id );
		}
		$fields = array();
		foreach ( (array) \Ninja_Forms()->form( $id )->get_fields() as $field ) {
			$fields[] = array(
				'id'       => (int) $field->get_id(),
				'key'      => $field->get_setting( 'key' ),
				'type'     => $field->get_setting( 'type' ),
				'label'    => $field->get_setting( 'label' ),
				'required' => (bool) $field->get_setting( 'required' ),
			);
		}
		return array(
			'id'     => $id,
			'title'  => $form->get_setting( 'title' ),
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
		$limit = isset( $args['limit'] ) ? absint( $args['limit'] ) : 50;
		$limit = $limit > 0 ? min( $limit, 200 ) : 50;
		$subs  = (array) \Ninja_Forms()->form( $id )->get_subs();
		$subs  = array_slice( $subs, 0, $limit );
		$out   = array();
		foreach ( $subs as $sub ) {
			$out[] = array(
				'id'     => (int) $sub->get_id(),
				'seq'    => $sub->get_seq_num(),
				'date'   => $sub->get_sub_date( 'Y-m-d H:i:s' ),
				'values' => $this->clean_values( $sub->get_field_values() ),
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
		$post = $this->sub_post( $id );
		if ( is_wp_error( $post ) ) {
			return $post;
		}
		$form_id = (int) get_post_meta( $id, '_form_id', true );
		$sub     = \Ninja_Forms()->form( $form_id )->get_sub( $id );
		return array(
			'id'      => $id,
			'form_id' => $form_id,
			'seq'     => $sub ? $sub->get_seq_num() : '',
			'date'    => $sub ? $sub->get_sub_date( 'Y-m-d H:i:s' ) : '',
			'values'  => $sub ? $this->clean_values( $sub->get_field_values() ) : array(),
		);
	}

	/**
	 * @param array $args { entry_id, confirm }.
	 * @return array|WP_Error
	 */
	public function op_delete_entry( array $args ) {
		$id   = isset( $args['entry_id'] ) ? absint( $args['entry_id'] ) : 0;
		$post = $this->sub_post( $id );
		if ( is_wp_error( $post ) ) {
			return $post;
		}
		$deleted = wp_delete_post( $id, true );
		return array( 'deleted' => (bool) $deleted, 'entry_id' => $id );
	}

	/**
	 * Count submissions for a form (nf_sub posts with _form_id meta).
	 *
	 * @param int $form_id Form id.
	 * @return int
	 */
	private function entry_count( int $form_id ): int {
		$q = new \WP_Query(
			array(
				'post_type'      => 'nf_sub',
				'post_status'    => 'any',
				'meta_key'       => '_form_id', // phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_meta_key
				'meta_value'     => $form_id,   // phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_meta_value
				'fields'         => 'ids',
				'posts_per_page' => 1,
			)
		);
		return (int) $q->found_posts;
	}

	/**
	 * Keep only human field keys (drop the raw _field_N / _form_id / _seq_num
	 * duplicates Ninja returns alongside them).
	 *
	 * @param array $values get_field_values() output.
	 * @return array<string,mixed>
	 */
	private function clean_values( $values ): array {
		$out = array();
		foreach ( (array) $values as $k => $v ) {
			if ( is_string( $k ) && '' !== $k && '_' !== $k[0] ) {
				$out[ $k ] = $v;
			}
		}
		return $out;
	}

	/**
	 * Fetch an nf_sub post or a WP_Error.
	 *
	 * @param int $id Entry (nf_sub post) id.
	 * @return \WP_Post|WP_Error
	 */
	private function sub_post( int $id ) {
		if ( ! $id ) {
			return $this->missing( 'entry_id' );
		}
		$post = get_post( $id );
		if ( ! $post || 'nf_sub' !== $post->post_type ) {
			return $this->not_found( 'submission', $id );
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
				__( 'No Ninja Forms %1$s with id %2$d.', 'emcp-tools' ),
				$what,
				$id
			),
			array( 'status' => 404 )
		);
	}
}
