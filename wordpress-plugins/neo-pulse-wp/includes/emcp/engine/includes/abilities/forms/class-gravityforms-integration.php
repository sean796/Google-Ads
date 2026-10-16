<?php
/**
 * Gravity Forms integration (Pro) — two dispatcher tools (gravityforms-read /
 * gravityforms-write) over the GFAPI.
 *
 * Gravity Forms is a paid plugin (not installable from wordpress.org). This
 * adapter is written against the documented, stable GFAPI PHP interface, covered
 * by stub-based unit tests, AND live-verified end-to-end against a real licensed
 * Gravity Forms install (add_form/add_entry → list/get/status/delete round-trip).
 *
 * GFAPI reference (docs.gravityforms.com, confirmed via Context7):
 *  - GFAPI::get_forms( $active = true, $trash = false ) → form arrays.
 *  - GFAPI::get_form( $form_id ) → form array ('id','title','fields'=>GF_Field[],
 *    'notifications'=>[id=>{name,to,subject,...}]).
 *  - GFAPI::count_entries( $form_id, $search = array() ) → int.
 *  - GFAPI::get_entries( $form_id, $search, $sorting, $paging ) → entry arrays
 *    (id, form_id, date_created, status, plus field values keyed by field id '1','2.3').
 *  - GFAPI::get_entry( $entry_id ) → one entry array (or WP_Error).
 *  - GFAPI::update_entry_property( $entry_id, 'status', 'active'|'spam'|'trash' ).
 *  - GFAPI::delete_entry( $entry_id ).
 *  - caps: gravityforms_edit_forms / _view_entries / _edit_entries / _delete_entries.
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
class EMCP_Tools_GravityForms_Integration extends EMCP_Tools_Form_Integration {

	/** @return string */
	public function id(): string {
		return 'gravityforms';
	}

	/** @return string */
	public function label(): string {
		return 'Gravity Forms';
	}

	/** @return bool */
	public function is_active(): bool {
		return class_exists( 'GFAPI' );
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
		$forms   = static function (): bool {
			return current_user_can( 'gravityforms_edit_forms' ) || current_user_can( 'manage_options' );
		};
		$view    = static function (): bool {
			return current_user_can( 'gravityforms_view_entries' ) || current_user_can( 'manage_options' );
		};
		$edit    = static function (): bool {
			return current_user_can( 'gravityforms_edit_entries' ) || current_user_can( 'manage_options' );
		};
		$del     = static function (): bool {
			return current_user_can( 'gravityforms_delete_entries' ) || current_user_can( 'manage_options' );
		};

		return array(
			'list-forms'          => array(
				'mode' => 'read',
				'run'  => array( $this, 'op_list_forms' ),
				'perm' => $forms,
				'desc' => 'List Gravity forms (id, title, entry count).',
			),
			'get-form'            => array(
				'mode' => 'read',
				'run'  => array( $this, 'op_get_form' ),
				'perm' => $forms,
				'desc' => 'Get one form by { form_id }: fields (id, label, type, required).',
			),
			'list-notifications'  => array(
				'mode' => 'read',
				'run'  => array( $this, 'op_list_notifications' ),
				'perm' => $forms,
				'desc' => 'List a form\'s notifications by { form_id }.',
			),
			'list-entries'        => array(
				'mode' => 'read',
				'run'  => array( $this, 'op_list_entries' ),
				'perm' => $view,
				'desc' => 'List entries for a form: { form_id, limit? }. Returns id, status, date, and field values.',
			),
			'get-entry'           => array(
				'mode' => 'read',
				'run'  => array( $this, 'op_get_entry' ),
				'perm' => $view,
				'desc' => 'Get one entry with its field values by { entry_id }.',
			),
			'update-entry-status' => array(
				'mode' => 'write',
				'run'  => array( $this, 'op_update_entry_status' ),
				'perm' => $edit,
				'desc' => 'Set an entry status: { entry_id, status } (active, spam, or trash).',
			),
			'delete-entry'        => array(
				'mode'    => 'write',
				'run'     => array( $this, 'op_delete_entry' ),
				'perm'    => $del,
				'desc'    => 'Delete an entry by { entry_id }. Permanent (not trashed).',
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
		foreach ( (array) \GFAPI::get_forms() as $form ) {
			$fid   = (int) ( $form['id'] ?? 0 );
			$out[] = array(
				'id'          => $fid,
				'title'       => $form['title'] ?? '',
				'entry_count' => (int) \GFAPI::count_entries( $fid ),
			);
		}
		return array( 'forms' => $out );
	}

	/**
	 * @param array $args { form_id }.
	 * @return array|WP_Error
	 */
	public function op_get_form( array $args ) {
		$form = $this->form( $args );
		if ( is_wp_error( $form ) ) {
			return $form;
		}
		$fields = array();
		foreach ( (array) ( $form['fields'] ?? array() ) as $field ) {
			$fields[] = array(
				'id'       => (string) $this->field_prop( $field, 'id' ),
				'label'    => (string) $this->field_prop( $field, 'label' ),
				'type'     => (string) $this->field_prop( $field, 'type' ),
				'required' => (bool) $this->field_prop( $field, 'isRequired' ),
			);
		}
		return array(
			'id'     => (int) ( $form['id'] ?? 0 ),
			'title'  => $form['title'] ?? '',
			'fields' => $fields,
		);
	}

	/**
	 * @param array $args { form_id }.
	 * @return array|WP_Error
	 */
	public function op_list_notifications( array $args ) {
		$form = $this->form( $args );
		if ( is_wp_error( $form ) ) {
			return $form;
		}
		$out = array();
		foreach ( (array) ( $form['notifications'] ?? array() ) as $nid => $n ) {
			$out[] = array(
				'id'      => (string) $nid,
				'name'    => $n['name'] ?? '',
				'to'      => $n['to'] ?? '',
				'subject' => $n['subject'] ?? '',
			);
		}
		return array( 'notifications' => $out );
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
		$sorting = array( 'key' => 'date_created', 'direction' => 'DESC' );
		$paging  = array( 'offset' => 0, 'page_size' => $limit );
		$entries = \GFAPI::get_entries( $id, array(), $sorting, $paging );
		if ( is_wp_error( $entries ) ) {
			return $entries;
		}
		$out = array();
		foreach ( (array) $entries as $e ) {
			$out[] = array(
				'id'         => (int) ( $e['id'] ?? 0 ),
				'status'     => $e['status'] ?? '',
				'created_at' => $e['date_created'] ?? '',
				'values'     => $this->entry_values( $e ),
			);
		}
		return array( 'entries' => $out, 'count' => count( $out ) );
	}

	/**
	 * @param array $args { entry_id }.
	 * @return array|WP_Error
	 */
	public function op_get_entry( array $args ) {
		$id = isset( $args['entry_id'] ) ? absint( $args['entry_id'] ) : 0;
		if ( ! $id ) {
			return $this->missing( 'entry_id' );
		}
		$e = \GFAPI::get_entry( $id );
		if ( is_wp_error( $e ) || ! is_array( $e ) ) {
			return $this->not_found( 'entry', $id );
		}
		return array(
			'id'         => (int) ( $e['id'] ?? 0 ),
			'form_id'    => (int) ( $e['form_id'] ?? 0 ),
			'status'     => $e['status'] ?? '',
			'created_at' => $e['date_created'] ?? '',
			'values'     => $this->entry_values( $e ),
		);
	}

	/**
	 * @param array $args { entry_id, status }.
	 * @return array|WP_Error
	 */
	public function op_update_entry_status( array $args ) {
		$id = isset( $args['entry_id'] ) ? absint( $args['entry_id'] ) : 0;
		if ( ! $id ) {
			return $this->missing( 'entry_id' );
		}
		$status = isset( $args['status'] ) ? sanitize_key( (string) $args['status'] ) : '';
		if ( ! in_array( $status, array( 'active', 'spam', 'trash' ), true ) ) {
			return new WP_Error( 'invalid_argument', __( 'status must be one of: active, spam, trash.', 'emcp-tools' ), array( 'status' => 400 ) );
		}
		$res = \GFAPI::update_entry_property( $id, 'status', $status );
		if ( is_wp_error( $res ) ) {
			return $res;
		}
		return array( 'updated' => (bool) $res, 'entry_id' => $id, 'status' => $status );
	}

	/**
	 * @param array $args { entry_id, confirm }.
	 * @return array|WP_Error
	 */
	public function op_delete_entry( array $args ) {
		$id = isset( $args['entry_id'] ) ? absint( $args['entry_id'] ) : 0;
		if ( ! $id ) {
			return $this->missing( 'entry_id' );
		}
		$res = \GFAPI::delete_entry( $id );
		if ( is_wp_error( $res ) ) {
			return $res;
		}
		return array( 'deleted' => true, 'entry_id' => $id );
	}

	/**
	 * Load a form array or a WP_Error.
	 *
	 * @param array $args Operation arguments.
	 * @return array|WP_Error
	 */
	private function form( array $args ) {
		$id = isset( $args['form_id'] ) ? absint( $args['form_id'] ) : 0;
		if ( ! $id ) {
			return $this->missing( 'form_id' );
		}
		$form = \GFAPI::get_form( $id );
		if ( is_wp_error( $form ) || ! is_array( $form ) ) {
			return $this->not_found( 'form', $id );
		}
		return $form;
	}

	/**
	 * Read a GF_Field property whether it's an object or an array.
	 *
	 * @param mixed  $field Field.
	 * @param string $key   Property.
	 * @return mixed
	 */
	private function field_prop( $field, string $key ) {
		if ( is_object( $field ) ) {
			return $field->{$key} ?? '';
		}
		if ( is_array( $field ) ) {
			return $field[ $key ] ?? '';
		}
		return '';
	}

	/**
	 * Extract the field values from a GF entry array (keys that are field ids —
	 * numeric or dotted — dropping the meta keys).
	 *
	 * @param array $entry Entry.
	 * @return array<string,mixed>
	 */
	private function entry_values( array $entry ): array {
		$out = array();
		foreach ( $entry as $k => $v ) {
			// GF field-value keys are field ids: simple fields become integer keys
			// (PHP casts '1' → 1), multi-input fields keep dotted string keys ('1.3').
			// Both are numeric; the meta keys (id, form_id, date_created, status, …)
			// are non-numeric strings.
			if ( is_numeric( $k ) ) {
				$out[ (string) $k ] = $v;
			}
		}
		return $out;
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
				__( 'No Gravity Forms %1$s with id %2$d.', 'emcp-tools' ),
				$what,
				$id
			),
			array( 'status' => 404 )
		);
	}
}
