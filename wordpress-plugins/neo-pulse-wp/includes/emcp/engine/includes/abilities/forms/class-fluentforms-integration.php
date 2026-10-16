<?php
/**
 * Fluent Forms integration (Pro) — two dispatcher tools (fluentforms-read /
 * fluentforms-write) over Fluent's own wpFluent() query builder.
 *
 * Verified live against Fluent Forms free core 6.2.7 (schema + JSON shapes
 * probed on a real install):
 *  - fluentform_forms: id, title, status, form_fields (JSON {fields[],submitButton}),
 *    type, created_at.
 *  - fluentform_submissions: id, form_id, serial_number, response (JSON field=>value),
 *    status, created_at, updated_at.
 *  - Related per-submission tables: fluentform_entry_details.submission_id,
 *    fluentform_submission_meta.response_id — deleted alongside the submission.
 *  - caps: fluentform_forms_manager (admin) — falls back to manage_options.
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
class EMCP_Tools_FluentForms_Integration extends EMCP_Tools_Form_Integration {

	/** @return string */
	public function id(): string {
		return 'fluentforms';
	}

	/** @return string */
	public function label(): string {
		return 'Fluent Forms';
	}

	/** @return bool */
	public function is_active(): bool {
		return defined( 'FLUENTFORM_VERSION' ) && function_exists( 'wpFluent' );
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
			return current_user_can( 'fluentform_forms_manager' ) || current_user_can( 'manage_options' );
		};

		return array(
			'list-forms'          => array(
				'mode' => 'read',
				'run'  => array( $this, 'op_list_forms' ),
				'perm' => $perm,
				'desc' => 'List Fluent Forms (id, title, status, entry count).',
			),
			'get-form'            => array(
				'mode' => 'read',
				'run'  => array( $this, 'op_get_form' ),
				'perm' => $perm,
				'desc' => 'Get one form by { form_id }: fields (name, element, label, required).',
			),
			'list-entries'        => array(
				'mode' => 'read',
				'run'  => array( $this, 'op_list_entries' ),
				'perm' => $perm,
				'desc' => 'List submissions for a form: { form_id, limit? }. Returns id, status, dates, and field values.',
			),
			'get-entry'           => array(
				'mode' => 'read',
				'run'  => array( $this, 'op_get_entry' ),
				'perm' => $perm,
				'desc' => 'Get one submission with its field values by { entry_id }.',
			),
			'update-entry-status' => array(
				'mode' => 'write',
				'run'  => array( $this, 'op_update_entry_status' ),
				'perm' => $perm,
				'desc' => 'Set a submission status: { entry_id, status } (e.g. read, unread, trashed).',
			),
			'delete-entry'        => array(
				'mode'    => 'write',
				'run'     => array( $this, 'op_delete_entry' ),
				'perm'    => $perm,
				'desc'    => 'Delete a submission and its detail rows by { entry_id }. Irreversible.',
				'confirm' => true,
			),
		);
	}

	/**
	 * @param array $args Unused.
	 * @return array
	 */
	public function op_list_forms( array $args ): array {
		// get() returns a Fluent Collection (Traversable) — iterate directly; an
		// (array) cast on it exposes internal props instead of the rows.
		$forms = wpFluent()->table( 'fluentform_forms' )->orderBy( 'id', 'DESC' )->get();
		$out   = array();
		foreach ( $forms as $f ) {
			$out[] = array(
				'id'          => (int) $f->id,
				'title'       => $f->title,
				'status'      => $f->status,
				'entry_count' => (int) wpFluent()->table( 'fluentform_submissions' )->where( 'form_id', (int) $f->id )->count(),
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
		$form = wpFluent()->table( 'fluentform_forms' )->find( $id );
		if ( ! $form ) {
			return $this->not_found( 'form', $id );
		}
		$decoded = json_decode( (string) $form->form_fields, true );
		$fields  = array();
		if ( isset( $decoded['fields'] ) && is_array( $decoded['fields'] ) ) {
			foreach ( $decoded['fields'] as $field ) {
				$name = $field['attributes']['name'] ?? '';
				if ( '' === $name ) {
					continue;
				}
				$fields[] = array(
					'name'     => $name,
					'element'  => $field['element'] ?? '',
					'label'    => $field['settings']['label'] ?? ( $field['settings']['admin_field_label'] ?? '' ),
					'required' => ! empty( $field['settings']['validation_rules']['required']['value'] ),
				);
			}
		}
		return array(
			'id'     => (int) $form->id,
			'title'  => $form->title,
			'status' => $form->status,
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
		$rows  = wpFluent()->table( 'fluentform_submissions' )->where( 'form_id', $id )->orderBy( 'id', 'DESC' )->limit( $limit )->get();
		$out   = array();
		foreach ( $rows as $r ) {
			$out[] = array(
				'id'         => (int) $r->id,
				'serial'     => (int) $r->serial_number,
				'status'     => $r->status,
				'created_at' => $r->created_at,
				'values'     => json_decode( (string) $r->response, true ),
			);
		}
		return array( 'entries' => $out, 'count' => count( $out ) );
	}

	/**
	 * @param array $args { entry_id }.
	 * @return array|WP_Error
	 */
	public function op_get_entry( array $args ) {
		$id  = isset( $args['entry_id'] ) ? absint( $args['entry_id'] ) : 0;
		$sub = $this->submission( $id );
		if ( is_wp_error( $sub ) ) {
			return $sub;
		}
		return array(
			'id'         => (int) $sub->id,
			'form_id'    => (int) $sub->form_id,
			'status'     => $sub->status,
			'created_at' => $sub->created_at,
			'values'     => json_decode( (string) $sub->response, true ),
		);
	}

	/**
	 * @param array $args { entry_id, status }.
	 * @return array|WP_Error
	 */
	public function op_update_entry_status( array $args ) {
		$id  = isset( $args['entry_id'] ) ? absint( $args['entry_id'] ) : 0;
		$sub = $this->submission( $id );
		if ( is_wp_error( $sub ) ) {
			return $sub;
		}
		$status = isset( $args['status'] ) ? sanitize_key( (string) $args['status'] ) : '';
		if ( '' === $status ) {
			return $this->missing( 'status' );
		}
		wpFluent()->table( 'fluentform_submissions' )->where( 'id', $id )->update( array( 'status' => $status, 'updated_at' => current_time( 'mysql' ) ) );
		return array( 'updated' => true, 'entry_id' => $id, 'status' => $status );
	}

	/**
	 * @param array $args { entry_id, confirm }.
	 * @return array|WP_Error
	 */
	public function op_delete_entry( array $args ) {
		$id  = isset( $args['entry_id'] ) ? absint( $args['entry_id'] ) : 0;
		$sub = $this->submission( $id );
		if ( is_wp_error( $sub ) ) {
			return $sub;
		}
		wpFluent()->table( 'fluentform_entry_details' )->where( 'submission_id', $id )->delete();
		wpFluent()->table( 'fluentform_submission_meta' )->where( 'response_id', $id )->delete();
		wpFluent()->table( 'fluentform_submissions' )->where( 'id', $id )->delete();
		return array( 'deleted' => true, 'entry_id' => $id );
	}

	/**
	 * @param int $id Submission id.
	 * @return object|WP_Error
	 */
	private function submission( int $id ) {
		if ( ! $id ) {
			return $this->missing( 'entry_id' );
		}
		$sub = wpFluent()->table( 'fluentform_submissions' )->find( $id );
		if ( ! $sub ) {
			return $this->not_found( 'submission', $id );
		}
		return $sub;
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
				__( 'No Fluent Forms %1$s with id %2$d.', 'emcp-tools' ),
				$what,
				$id
			),
			array( 'status' => 404 )
		);
	}
}
