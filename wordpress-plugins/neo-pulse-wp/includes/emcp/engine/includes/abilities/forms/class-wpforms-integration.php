<?php
/**
 * WPForms integration (Pro) — two dispatcher tools (wpforms-read /
 * wpforms-write) over the wpforms() API.
 *
 * Verified live against WPForms Lite 2.0.0.2 (forms/fields/notifications) with
 * Pro-only entry ops degrading gracefully:
 *  - wpforms()->form->get() → published form WP_Post[] (or false).
 *  - wpforms()->form->get( $id ) → one form WP_Post.
 *  - wpforms()->form->add( $title, [ 'post_content' => json ] ) / ->update( $id, $data ).
 *  - wpforms_decode( $post->post_content ) → [ fields => [id=>{id,type,label,required}],
 *    settings => [ form_title, notifications => [id=>{notification_name,email,subject,...}] ] ].
 *  - Entries: wpforms()->entry exists ONLY in WPForms Pro (Lite → null). Entry
 *    ops (list-entries/get-entry/update-entry-status/delete-entry) return
 *    requires_wpforms_pro on Lite.
 *  - caps: wpforms_view_entries / wpforms_edit_entries / wpforms_delete_entries
 *    (fall back to manage_options).
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
class EMCP_Tools_WPForms_Integration extends EMCP_Tools_Form_Integration {

	/** @return string */
	public function id(): string {
		return 'wpforms';
	}

	/** @return string */
	public function label(): string {
		return 'WPForms';
	}

	/** @return bool */
	public function is_active(): bool {
		return function_exists( 'wpforms' );
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
		$manage = static function (): bool {
			return current_user_can( 'wpforms_edit_forms' ) || current_user_can( 'manage_options' );
		};
		$view   = static function (): bool {
			return current_user_can( 'wpforms_view_entries' ) || current_user_can( 'manage_options' );
		};
		$edit   = static function (): bool {
			return current_user_can( 'wpforms_edit_entries' ) || current_user_can( 'manage_options' );
		};
		$del    = static function (): bool {
			return current_user_can( 'wpforms_delete_entries' ) || current_user_can( 'manage_options' );
		};

		return array(
			'list-forms'          => array(
				'mode' => 'read',
				'run'  => array( $this, 'op_list_forms' ),
				'perm' => $manage,
				'desc' => 'List WPForms forms (id, title, entry count when available).',
			),
			'get-form'            => array(
				'mode' => 'read',
				'run'  => array( $this, 'op_get_form' ),
				'perm' => $manage,
				'desc' => 'Get one form by { form_id }: fields (id, type, label, required).',
			),
			'list-notifications'  => array(
				'mode' => 'read',
				'run'  => array( $this, 'op_list_notifications' ),
				'perm' => $manage,
				'desc' => 'List a form\'s email notifications by { form_id }.',
			),
			'list-entries'        => array(
				'mode' => 'read',
				'run'  => array( $this, 'op_list_entries' ),
				'perm' => $view,
				'desc' => 'List entries for a form: { form_id, limit? } (requires WPForms Pro).',
			),
			'get-entry'           => array(
				'mode' => 'read',
				'run'  => array( $this, 'op_get_entry' ),
				'perm' => $view,
				'desc' => 'Get one entry with its field values by { entry_id } (requires WPForms Pro).',
			),
			'update-notification' => array(
				'mode' => 'write',
				'run'  => array( $this, 'op_update_notification' ),
				'perm' => $manage,
				'desc' => 'Update a form notification: { form_id, notification_id, fields: { email?, subject?, message?, notification_name? } }. Only provided keys change.',
			),
			'update-entry-status' => array(
				'mode' => 'write',
				'run'  => array( $this, 'op_update_entry_status' ),
				'perm' => $edit,
				'desc' => 'Set an entry status: { entry_id, status } (requires WPForms Pro).',
			),
			'delete-entry'        => array(
				'mode'    => 'write',
				'run'     => array( $this, 'op_delete_entry' ),
				'perm'    => $del,
				'desc'    => 'Delete an entry by { entry_id } (requires WPForms Pro). Irreversible.',
				'confirm' => true,
			),
		);
	}

	/**
	 * @param array $args Unused.
	 * @return array
	 */
	public function op_list_forms( array $args ): array {
		$forms   = wpforms()->form->get();
		$has_pro = $this->entries_available();
		$out     = array();
		foreach ( (array) ( $forms ?: array() ) as $form ) {
			$row = array(
				'id'    => (int) $form->ID,
				'title' => $form->post_title,
			);
			if ( $has_pro ) {
				$row['entry_count'] = (int) wpforms()->entry->get_entries( array( 'form_id' => (int) $form->ID ), true );
			}
			$out[] = $row;
		}
		return array( 'forms' => $out, 'entries_available' => $has_pro );
	}

	/**
	 * @param array $args { form_id }.
	 * @return array|WP_Error
	 */
	public function op_get_form( array $args ) {
		$data = $this->form_data( $args );
		if ( is_wp_error( $data ) ) {
			return $data;
		}
		list( $id, $decoded ) = $data;
		$fields = array();
		foreach ( (array) ( $decoded['fields'] ?? array() ) as $field ) {
			$fields[] = array(
				'id'       => isset( $field['id'] ) ? (int) $field['id'] : 0,
				'type'     => $field['type'] ?? '',
				'label'    => $field['label'] ?? '',
				'required' => ! empty( $field['required'] ),
			);
		}
		return array(
			'id'     => $id,
			'title'  => $decoded['settings']['form_title'] ?? '',
			'fields' => $fields,
		);
	}

	/**
	 * @param array $args { form_id }.
	 * @return array|WP_Error
	 */
	public function op_list_notifications( array $args ) {
		$data = $this->form_data( $args );
		if ( is_wp_error( $data ) ) {
			return $data;
		}
		list( , $decoded ) = $data;
		$out = array();
		foreach ( (array) ( $decoded['settings']['notifications'] ?? array() ) as $nid => $n ) {
			$out[] = array(
				'id'      => (string) $nid,
				'name'    => $n['notification_name'] ?? '',
				'email'   => $n['email'] ?? '',
				'subject' => $n['subject'] ?? '',
			);
		}
		return array( 'notifications' => $out );
	}

	/**
	 * @param array $args { form_id, notification_id, fields }.
	 * @return array|WP_Error
	 */
	public function op_update_notification( array $args ) {
		$data = $this->form_data( $args );
		if ( is_wp_error( $data ) ) {
			return $data;
		}
		list( $id, $decoded ) = $data;
		$nid   = isset( $args['notification_id'] ) ? (string) $args['notification_id'] : '';
		$patch = ( isset( $args['fields'] ) && is_array( $args['fields'] ) ) ? $args['fields'] : array();
		if ( '' === $nid || ! isset( $decoded['settings']['notifications'][ $nid ] ) ) {
			return new WP_Error( 'not_found', __( 'No notification with that id on this form.', 'emcp-tools' ), array( 'status' => 404 ) );
		}
		if ( ! $patch ) {
			return new WP_Error( 'missing_argument', __( 'Missing required argument: fields (object of notification keys to change).', 'emcp-tools' ), array( 'status' => 400 ) );
		}
		$decoded['settings']['notifications'][ $nid ] = array_merge( $decoded['settings']['notifications'][ $nid ], $patch );
		wpforms()->form->update( $id, $decoded );
		$fresh = wpforms_decode( wpforms()->form->get( $id )->post_content );
		return array( 'updated' => true, 'notification' => $fresh['settings']['notifications'][ $nid ] ?? array() );
	}

	/**
	 * @param array $args { form_id, limit? }.
	 * @return array|WP_Error
	 */
	public function op_list_entries( array $args ) {
		if ( ! $this->entries_available() ) {
			return $this->pro_required();
		}
		$id = isset( $args['form_id'] ) ? absint( $args['form_id'] ) : 0;
		if ( ! $id ) {
			return $this->missing( 'form_id' );
		}
		$limit   = isset( $args['limit'] ) ? absint( $args['limit'] ) : 50;
		$limit   = $limit > 0 ? min( $limit, 200 ) : 50;
		$entries = wpforms()->entry->get_entries( array( 'form_id' => $id, 'number' => $limit ) );
		$out     = array();
		foreach ( (array) $entries as $e ) {
			$out[] = array(
				'id'         => (int) $e->entry_id,
				'status'     => $e->status ?? '',
				'created_at' => $e->date ?? '',
				'values'     => json_decode( (string) ( $e->fields ?? '' ), true ),
			);
		}
		return array( 'entries' => $out, 'count' => count( $out ) );
	}

	/**
	 * @param array $args { entry_id }.
	 * @return array|WP_Error
	 */
	public function op_get_entry( array $args ) {
		if ( ! $this->entries_available() ) {
			return $this->pro_required();
		}
		$id = isset( $args['entry_id'] ) ? absint( $args['entry_id'] ) : 0;
		if ( ! $id ) {
			return $this->missing( 'entry_id' );
		}
		$e = wpforms()->entry->get( $id );
		if ( ! $e ) {
			return $this->not_found( 'entry', $id );
		}
		return array(
			'id'         => (int) $e->entry_id,
			'form_id'    => (int) $e->form_id,
			'status'     => $e->status ?? '',
			'created_at' => $e->date ?? '',
			'values'     => json_decode( (string) ( $e->fields ?? '' ), true ),
		);
	}

	/**
	 * @param array $args { entry_id, status }.
	 * @return array|WP_Error
	 */
	public function op_update_entry_status( array $args ) {
		if ( ! $this->entries_available() ) {
			return $this->pro_required();
		}
		$id = isset( $args['entry_id'] ) ? absint( $args['entry_id'] ) : 0;
		if ( ! $id ) {
			return $this->missing( 'entry_id' );
		}
		$status = isset( $args['status'] ) ? sanitize_key( (string) $args['status'] ) : '';
		if ( '' === $status ) {
			return $this->missing( 'status' );
		}
		wpforms()->entry->update( $id, array( 'status' => $status ) );
		return array( 'updated' => true, 'entry_id' => $id, 'status' => $status );
	}

	/**
	 * @param array $args { entry_id, confirm }.
	 * @return array|WP_Error
	 */
	public function op_delete_entry( array $args ) {
		if ( ! $this->entries_available() ) {
			return $this->pro_required();
		}
		$id = isset( $args['entry_id'] ) ? absint( $args['entry_id'] ) : 0;
		if ( ! $id ) {
			return $this->missing( 'entry_id' );
		}
		$e = wpforms()->entry->get( $id );
		if ( ! $e ) {
			return $this->not_found( 'entry', $id );
		}
		$ok = wpforms()->entry->delete( $id );
		return array( 'deleted' => (bool) $ok, 'entry_id' => $id );
	}

	/**
	 * Whether the WPForms Pro entry object is loaded.
	 *
	 * @return bool
	 */
	private function entries_available(): bool {
		return ! empty( wpforms()->entry );
	}

	/**
	 * Load { id, decoded } for a form or a WP_Error.
	 *
	 * @param array $args Operation arguments.
	 * @return array|WP_Error
	 */
	private function form_data( array $args ) {
		$id = isset( $args['form_id'] ) ? absint( $args['form_id'] ) : 0;
		if ( ! $id ) {
			return $this->missing( 'form_id' );
		}
		$post = wpforms()->form->get( $id );
		if ( ! $post || empty( $post->ID ) ) {
			return $this->not_found( 'form', $id );
		}
		$decoded = wpforms_decode( $post->post_content );
		if ( ! is_array( $decoded ) ) {
			$decoded = array();
		}
		return array( $id, $decoded );
	}

	/** @return WP_Error */
	private function pro_required(): WP_Error {
		return new WP_Error(
			'requires_wpforms_pro',
			__( 'Entry operations require WPForms Pro (WPForms Lite does not store entries).', 'emcp-tools' ),
			array( 'status' => 409 )
		);
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
				__( 'No WPForms %1$s with id %2$d.', 'emcp-tools' ),
				$what,
				$id
			),
			array( 'status' => 404 )
		);
	}
}
