<?php
/**
 * Forminator integration (Pro) — two dispatcher tools (forminator-read /
 * forminator-write) over the public Forminator_API.
 *
 * Verified live against Forminator 1.56.2:
 *  - Forminator_API::get_forms( null, 1, 100 ) → Forminator_Form_Model[].
 *  - Forminator_API::get_form( $id ) → Forminator_Form_Model
 *    (->id, ->name [slug], ->settings['formName'] [display name], ->status).
 *  - $form->get_fields() → Forminator_Form_Field_Model[] with ->raw
 *    { element_id, type, field_label, required, cols, ... }.
 *  - Forminator_API::get_form_entries( $form_id ) → Forminator_Form_Entry_Model[].
 *  - Forminator_API::get_entry( $form_id, $entry_id ) → Forminator_Form_Entry_Model
 *    (->entry_id, ->date_created_sql, ->meta_data [ field_id => { value } ]).
 *  - Forminator_API::delete_entry( $form_id, $entry_id ).
 * Forminator gates on manage_forminator (falls back to manage_options).
 *
 * @package EMCP_Tools
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class EMCP_Tools_Forminator_Integration extends EMCP_Tools_Form_Integration {

	/** @return string */
	public function id(): string {
		return 'forminator';
	}

	/** @return string */
	public function label(): string {
		return 'Forminator';
	}

	/** @return bool */
	public function is_active(): bool {
		return class_exists( 'Forminator_API' );
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
			return current_user_can( 'manage_forminator' ) || current_user_can( 'manage_options' );
		};

		return array(
			'list-forms'   => array(
				'mode' => 'read',
				'run'  => array( $this, 'op_list_forms' ),
				'perm' => $manage,
				'desc' => 'List Forminator forms (id, name, shortcode).',
			),
			'get-form'     => array(
				'mode' => 'read',
				'run'  => array( $this, 'op_get_form' ),
				'perm' => $manage,
				'desc' => 'Get one form by { form_id }: name, shortcode, and fields (id, type, label, required).',
			),
			'list-entries' => array(
				'mode' => 'read',
				'run'  => array( $this, 'op_list_entries' ),
				'perm' => $manage,
				'desc' => 'List submissions for a form: { form_id, limit? } (id, created_at, field values).',
			),
			'get-entry'    => array(
				'mode' => 'read',
				'run'  => array( $this, 'op_get_entry' ),
				'perm' => $manage,
				'desc' => 'Get one submission by { form_id, entry_id } with its field values.',
			),
			'delete-entry' => array(
				'mode'    => 'write',
				'run'     => array( $this, 'op_delete_entry' ),
				'perm'    => $manage,
				'desc'    => 'Delete a submission by { form_id, entry_id }. Irreversible.',
				'confirm' => true,
			),
		);
	}

	/**
	 * @param array $args Unused.
	 * @return array
	 */
	public function op_list_forms( array $args ): array {
		$forms = \Forminator_API::get_forms( null, 1, 100 );
		$out   = array();
		foreach ( (array) ( $forms ? $forms : array() ) as $form ) {
			$id    = $this->form_id( $form );
			$out[] = array(
				'id'        => $id,
				'name'      => $this->form_name( $form ),
				'shortcode' => sprintf( '[forminator_form id="%d"]', $id ),
			);
		}
		return array( 'forms' => $out, 'count' => count( $out ) );
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
		$form = \Forminator_API::get_form( $id );
		if ( ! $form || is_wp_error( $form ) ) {
			return $this->not_found( 'form', $id );
		}
		return array(
			'id'        => $id,
			'name'      => $this->form_name( $form ),
			'shortcode' => sprintf( '[forminator_form id="%d"]', $id ),
			'fields'    => $this->form_fields( $form ),
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
		$entries = \Forminator_API::get_form_entries( $id );
		$out     = array();
		foreach ( array_slice( (array) ( $entries ? $entries : array() ), 0, $limit ) as $e ) {
			$out[] = $this->entry_row( $e );
		}
		return array( 'entries' => $out, 'count' => count( $out ) );
	}

	/**
	 * @param array $args { form_id, entry_id }.
	 * @return array|WP_Error
	 */
	public function op_get_entry( array $args ) {
		$form_id  = isset( $args['form_id'] ) ? absint( $args['form_id'] ) : 0;
		$entry_id = isset( $args['entry_id'] ) ? absint( $args['entry_id'] ) : 0;
		if ( ! $form_id ) {
			return $this->missing( 'form_id' );
		}
		if ( ! $entry_id ) {
			return $this->missing( 'entry_id' );
		}
		$e = \Forminator_API::get_entry( $form_id, $entry_id );
		if ( ! $e || is_wp_error( $e ) || empty( $e->entry_id ) ) {
			return $this->not_found( 'entry', $entry_id );
		}
		return $this->entry_row( $e );
	}

	/**
	 * @param array $args { form_id, entry_id, confirm }.
	 * @return array|WP_Error
	 */
	public function op_delete_entry( array $args ) {
		$form_id  = isset( $args['form_id'] ) ? absint( $args['form_id'] ) : 0;
		$entry_id = isset( $args['entry_id'] ) ? absint( $args['entry_id'] ) : 0;
		if ( ! $form_id ) {
			return $this->missing( 'form_id' );
		}
		if ( ! $entry_id ) {
			return $this->missing( 'entry_id' );
		}
		$ok = \Forminator_API::delete_entry( $form_id, $entry_id );
		return array(
			'deleted'  => ! is_wp_error( $ok ) && false !== $ok,
			'entry_id' => $entry_id,
		);
	}

	/**
	 * Form id from a Forminator_Form_Model.
	 *
	 * @param mixed $form Form model.
	 * @return int
	 */
	private function form_id( $form ): int {
		return is_object( $form ) && isset( $form->id ) ? (int) $form->id : 0;
	}

	/**
	 * Display name (settings.formName), falling back to the slug (->name).
	 *
	 * @param mixed $form Form model.
	 * @return string
	 */
	private function form_name( $form ): string {
		if ( is_object( $form ) ) {
			if ( isset( $form->settings['formName'] ) && '' !== (string) $form->settings['formName'] ) {
				return (string) $form->settings['formName'];
			}
			if ( ! empty( $form->name ) ) {
				return (string) $form->name;
			}
		}
		return '';
	}

	/**
	 * Field list from $form->get_fields() (Forminator_Form_Field_Model->raw).
	 *
	 * @param mixed $form Form model.
	 * @return array
	 */
	private function form_fields( $form ): array {
		$fields = array();
		if ( is_object( $form ) && method_exists( $form, 'get_fields' ) ) {
			foreach ( (array) $form->get_fields() as $field ) {
				// Forminator's field model has a magic __get with no __isset, so
				// isset($field->raw) is false even though ->raw reads fine.
				$raw      = is_object( $field ) ? (array) ( $field->raw ?? array() ) : (array) $field;
				$fields[] = array(
					'id'       => (string) ( $raw['element_id'] ?? '' ),
					'type'     => (string) ( $raw['type'] ?? '' ),
					'label'    => (string) ( $raw['field_label'] ?? '' ),
					'required' => ! empty( $raw['required'] ),
				);
			}
		}
		return $fields;
	}

	/**
	 * Compact row from a Forminator_Form_Entry_Model.
	 *
	 * @param mixed $e Entry model.
	 * @return array
	 */
	private function entry_row( $e ): array {
		$values = array();
		if ( is_object( $e ) && isset( $e->meta_data ) && is_array( $e->meta_data ) ) {
			foreach ( $e->meta_data as $field_id => $meta ) {
				$values[ (string) $field_id ] = ( is_array( $meta ) && array_key_exists( 'value', $meta ) ) ? $meta['value'] : $meta;
			}
		}
		return array(
			'id'         => is_object( $e ) && isset( $e->entry_id ) ? (int) $e->entry_id : 0,
			'created_at' => is_object( $e ) && isset( $e->date_created_sql ) ? (string) $e->date_created_sql : '',
			'values'     => $values,
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
	 * @param string $what Object type.
	 * @param int    $id   Id.
	 * @return WP_Error
	 */
	private function not_found( string $what, int $id ): WP_Error {
		return new WP_Error(
			'not_found',
			sprintf(
				/* translators: 1: object type, 2: id */
				__( 'No Forminator %1$s with id %2$d.', 'emcp-tools' ),
				$what,
				$id
			),
			array( 'status' => 404 )
		);
	}
}
