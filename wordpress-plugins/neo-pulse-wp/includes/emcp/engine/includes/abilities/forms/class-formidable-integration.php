<?php
/**
 * Formidable Forms integration (Pro) — two dispatcher tools (formidable-read /
 * formidable-write) over the FrmForm / FrmField / FrmEntry / FrmFormAction API.
 *
 * Verified live against Formidable Forms free core (object shapes probed on a
 * real install):
 *  - FrmForm::getAll( $where, $order_by, $limit ) → form rows
 *    (id, form_key, name, description, is_template, status, created_at).
 *  - FrmForm::getOne( $id ) → one form row.
 *  - FrmField::get_all_for_form( $form_id ) → field rows
 *    (id, field_key, name, type, required, options, field_options, field_order).
 *  - FrmEntry::getAll( $where, $order_by, $limit, $meta, $inc_form ) → entry rows
 *    (id, item_key, form_id, form_name, created_at, updated_at, metas[field_id=>value]).
 *  - FrmEntry::getOne( $id, true ) → one entry with metas.
 *  - FrmEntry::destroy( $id ) → delete an entry.
 *  - FrmFormAction::get_action_for_form( $form_id, 'email' ) → email actions (WP_Post).
 *  - caps: frm_view_forms, frm_view_entries, frm_delete_entries.
 *
 * Formidable entries carry no spam/status field (only is_draft), so there is no
 * update-entry-status op; the write surface is delete-entry.
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
class EMCP_Tools_Formidable_Integration extends EMCP_Tools_Form_Integration {

	/** @return string */
	public function id(): string {
		return 'formidable';
	}

	/** @return string */
	public function label(): string {
		return 'Formidable Forms';
	}

	/** @return bool */
	public function is_active(): bool {
		return class_exists( 'FrmForm' );
	}

	/** Pro gate + plugin-active — mirrors the Woo defense-in-depth. */
	public function register(): void {
		if ( ! ( function_exists( 'emcp_tools_fs' ) && emcp_tools_fs()->can_use_premium_code() ) ) {
			return;
		}
		parent::register();
	}

	/** @return array<string,array> */
	protected function operations(): array {
		$view_forms   = static function (): bool {
			return current_user_can( 'frm_view_forms' ) || current_user_can( 'manage_options' );
		};
		$view_entries = static function (): bool {
			return current_user_can( 'frm_view_entries' ) || current_user_can( 'manage_options' );
		};
		$del_entries  = static function (): bool {
			return current_user_can( 'frm_delete_entries' ) || current_user_can( 'manage_options' );
		};

		return array(
			'list-forms'         => array(
				'mode' => 'read',
				'run'  => array( $this, 'op_list_forms' ),
				'perm' => $view_forms,
				'desc' => 'List Formidable forms (id, key, name, entry count).',
			),
			'get-form'           => array(
				'mode' => 'read',
				'run'  => array( $this, 'op_get_form' ),
				'perm' => $view_forms,
				'desc' => 'Get one form by { form_id }: fields (name, type, required) and settings.',
			),
			'list-notifications' => array(
				'mode' => 'read',
				'run'  => array( $this, 'op_list_notifications' ),
				'perm' => $view_forms,
				'desc' => 'List a form\'s email actions (notifications) by { form_id }.',
			),
			'list-entries'       => array(
				'mode' => 'read',
				'run'  => array( $this, 'op_list_entries' ),
				'perm' => $view_entries,
				'desc' => 'List entries for a form: { form_id, limit? }. Returns id, key, dates, and field values.',
			),
			'get-entry'          => array(
				'mode' => 'read',
				'run'  => array( $this, 'op_get_entry' ),
				'perm' => $view_entries,
				'desc' => 'Get one entry with its field values by { entry_id }.',
			),
			'delete-entry'       => array(
				'mode'    => 'write',
				'run'     => array( $this, 'op_delete_entry' ),
				'perm'    => $del_entries,
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
		$out = array();
		// Formidable treats a numeric 0 limit as LIMIT 0 (no rows); '' = unlimited.
		foreach ( (array) \FrmForm::getAll( array( 'is_template' => 0, 'status' => 'published' ), '', '' ) as $f ) {
			$out[] = array(
				'id'          => (int) $f->id,
				'key'         => $f->form_key,
				'name'        => $f->name,
				'entry_count' => (int) \FrmEntry::getRecordCount( 'it.form_id=' . (int) $f->id ),
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
		$form = \FrmForm::getOne( $id );
		if ( ! $form || empty( $form->id ) ) {
			return $this->not_found( 'form', $id );
		}
		$fields = array();
		foreach ( (array) \FrmField::get_all_for_form( $id ) as $field ) {
			$fields[] = array(
				'id'       => (int) $field->id,
				'key'      => $field->field_key,
				'name'     => $field->name,
				'type'     => $field->type,
				'required' => (bool) $field->required,
			);
		}
		return array(
			'id'          => (int) $form->id,
			'key'         => $form->form_key,
			'name'        => $form->name,
			'description' => $form->description,
			'fields'      => $fields,
		);
	}

	/**
	 * @param array $args { form_id }.
	 * @return array|WP_Error
	 */
	public function op_list_notifications( array $args ) {
		$id = isset( $args['form_id'] ) ? absint( $args['form_id'] ) : 0;
		if ( ! $id ) {
			return $this->missing( 'form_id' );
		}
		$out = array();
		if ( class_exists( 'FrmFormAction' ) ) {
			foreach ( (array) \FrmFormAction::get_action_for_form( $id, 'email' ) as $action ) {
				$settings = isset( $action->post_content ) ? maybe_unserialize( $action->post_content ) : array();
				$out[]    = array(
					'id'       => isset( $action->ID ) ? (int) $action->ID : 0,
					'name'     => isset( $action->post_title ) ? $action->post_title : '',
					'settings' => $settings,
				);
			}
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
		$entries = (array) \FrmEntry::getAll( array( 'it.form_id' => $id ), ' ORDER BY it.created_at DESC', $limit, true );
		$out     = array();
		foreach ( $entries as $e ) {
			$out[] = array(
				'id'         => (int) $e->id,
				'key'        => $e->item_key,
				'created_at' => $e->created_at,
				'values'     => isset( $e->metas ) ? $e->metas : array(),
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
		$entry = \FrmEntry::getOne( $id, true );
		if ( ! $entry || empty( $entry->id ) ) {
			return $this->not_found( 'entry', $id );
		}
		return array(
			'id'         => (int) $entry->id,
			'key'        => $entry->item_key,
			'form_id'    => (int) $entry->form_id,
			'form_name'  => $entry->form_name ?? '',
			'created_at' => $entry->created_at,
			'updated_at' => $entry->updated_at,
			'values'     => isset( $entry->metas ) ? $entry->metas : array(),
		);
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
		$entry = \FrmEntry::getOne( $id );
		if ( ! $entry || empty( $entry->id ) ) {
			return $this->not_found( 'entry', $id );
		}
		$ok = \FrmEntry::destroy( $id );
		return array( 'deleted' => (bool) $ok, 'entry_id' => $id );
	}

	/**
	 * @param string $field Field name.
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
				__( 'No Formidable %1$s with id %2$d.', 'emcp-tools' ),
				$what,
				$id
			),
			array( 'status' => 404 )
		);
	}
}
