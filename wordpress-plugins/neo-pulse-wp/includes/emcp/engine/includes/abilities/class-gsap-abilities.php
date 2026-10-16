<?php
/**
 * MCP read/write dispatchers for the GSAP Integration module.
 *
 * @package EMCP_Tools
 * @since   3.16.0
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/** @since 3.16.0 */
final class EMCP_Tools_GSAP_Abilities {

	/** @var string[] */
	private $ability_names = array();

	/** @return string[] */
	public function get_ability_names(): array {
		return $this->ability_names;
	}

	public function register(): void {
		if ( ! $this->has_access() ) {
			return;
		}
		$this->register_read();
		$this->register_write();
	}

	private function has_access(): bool {
		return function_exists( 'emcp_tools_fs' ) && emcp_tools_fs()->can_use_premium_code();
	}

	public function check_read_permission(): bool {
		return $this->has_access() && current_user_can( 'edit_posts' );
	}

	public function check_write_permission(): bool {
		return $this->has_access() && current_user_can( 'manage_options' );
	}

	private function register_read(): void {
		$this->ability_names[] = 'emcp-tools/gsap-read';
		emcp_tools_register_ability(
			'emcp-tools/gsap-read',
			array(
				'label'               => __( 'GSAP Read', 'emcp-tools' ),
				'description'         => __( 'Read the bundled GSAP version, WordPress handles, plugin dependencies, enabled contexts, and current registration/enqueue state. Omit operation to list operations.', 'emcp-tools' ),
				'category'            => 'emcp-tools',
				'execute_callback'    => array( $this, 'execute_read' ),
				'permission_callback' => array( $this, 'check_read_permission' ),
				'input_schema'        => self::dispatcher_schema(),
				'output_schema'       => array( 'type' => 'object' ),
				'meta'                => array( 'annotations' => array( 'readonly' => true, 'destructive' => false, 'idempotent' => true ), 'show_in_rest' => true ),
			)
		);
	}

	private function register_write(): void {
		$this->ability_names[] = 'emcp-tools/gsap-write';
		emcp_tools_register_ability(
			'emcp-tools/gsap-write',
			array(
				'label'               => __( 'GSAP Write', 'emcp-tools' ),
				'description'         => __( 'Update GSAP loading contexts or the enabled plugin set. Supports update-settings and set-plugin. Omit operation to list operations.', 'emcp-tools' ),
				'category'            => 'emcp-tools',
				'execute_callback'    => array( $this, 'execute_write' ),
				'permission_callback' => array( $this, 'check_write_permission' ),
				'input_schema'        => self::dispatcher_schema(),
				'output_schema'       => array( 'type' => 'object' ),
				'meta'                => array( 'annotations' => array( 'readonly' => false, 'destructive' => false, 'idempotent' => true ), 'show_in_rest' => true ),
			)
		);
	}

	private static function dispatcher_schema(): array {
		return array(
			'type'       => 'object',
			'properties' => array(
				'operation' => array( 'type' => 'string' ),
				'arguments' => array( 'type' => 'object' ),
			),
		);
	}

	/** @param mixed $input @return array|WP_Error */
	public function execute_read( $input ) {
		$operation = self::operation( $input );
		if ( '' === $operation ) {
			return array(
				'operations' => array(
					array( 'operation' => 'get-status', 'description' => 'Read module state, version, contexts, and selected plugin ids.' ),
					array( 'operation' => 'list-plugins', 'description' => 'List every bundled plugin with its WordPress handle, dependencies, and runtime state.' ),
				),
			);
		}
		if ( 'get-status' === $operation ) {
			return self::status();
		}
		if ( 'list-plugins' === $operation ) {
			return array(
				'version'          => EMCP_Tools_GSAP_Assets::VERSION,
				'core_handle'      => EMCP_Tools_GSAP_Assets::CORE_HANDLE,
				'built_into_core'  => array( 'CSSPlugin', 'AttrPlugin', 'EndArrayPlugin', 'ModifiersPlugin', 'RoundPropsPlugin', 'SnapPlugin' ),
				'plugins'          => EMCP_Tools_GSAP_Assets::public_catalog(),
			);
		}
		return new WP_Error( 'unknown_operation', __( 'Unknown GSAP read operation. Call gsap-read with no operation to list supported operations.', 'emcp-tools' ) );
	}

	/** @param mixed $input @return array|WP_Error */
	public function execute_write( $input ) {
		$operation = self::operation( $input );
		if ( '' === $operation ) {
			return array(
				'operations' => array(
					array( 'operation' => 'update-settings', 'arguments' => array( 'contexts' => 'array', 'plugins' => 'array' ) ),
					array( 'operation' => 'set-plugin', 'arguments' => array( 'plugin' => 'catalog id', 'enabled' => 'boolean' ) ),
				),
			);
		}

		$args = is_array( $input ) && isset( $input['arguments'] ) && is_array( $input['arguments'] ) ? $input['arguments'] : array();
		if ( 'update-settings' === $operation ) {
			if ( ! array_key_exists( 'contexts', $args ) && ! array_key_exists( 'plugins', $args ) ) {
				return new WP_Error( 'invalid_input', __( 'Provide contexts, plugins, or both.', 'emcp-tools' ) );
			}
			if ( array_key_exists( 'contexts', $args ) ) {
				$invalid = self::invalid_ids( $args['contexts'], array_keys( EMCP_Tools_GSAP_Module::context_catalog() ) );
				if ( $invalid ) {
					/* translators: %s: Comma-separated invalid GSAP loading-context IDs. */
					return new WP_Error( 'invalid_context', sprintf( __( 'Unknown GSAP context: %s', 'emcp-tools' ), implode( ', ', $invalid ) ) );
				}
			}
			if ( array_key_exists( 'plugins', $args ) ) {
				$invalid = self::invalid_ids( $args['plugins'], EMCP_Tools_GSAP_Assets::plugin_ids() );
				if ( $invalid ) {
					/* translators: %s: Comma-separated invalid GSAP plugin IDs. */
					return new WP_Error( 'invalid_plugin', sprintf( __( 'Unknown GSAP plugin: %s', 'emcp-tools' ), implode( ', ', $invalid ) ) );
				}
			}
			if ( array_key_exists( 'contexts', $args ) ) {
				update_option( EMCP_Tools_GSAP_Module::OPTION_CONTEXTS, EMCP_Tools_GSAP_Module::sanitize_contexts( $args['contexts'] ) );
			}
			if ( array_key_exists( 'plugins', $args ) ) {
				update_option( EMCP_Tools_GSAP_Module::OPTION_PLUGINS, EMCP_Tools_GSAP_Module::sanitize_plugins( $args['plugins'] ) );
			}
			return self::status();
		}

		if ( 'set-plugin' === $operation ) {
			$id = isset( $args['plugin'] ) ? sanitize_key( (string) $args['plugin'] ) : '';
			if ( ! in_array( $id, EMCP_Tools_GSAP_Assets::plugin_ids(), true ) ) {
				return new WP_Error( 'invalid_plugin', __( 'A valid GSAP plugin id is required.', 'emcp-tools' ) );
			}
			if ( ! array_key_exists( 'enabled', $args ) || ! is_bool( $args['enabled'] ) ) {
				return new WP_Error( 'invalid_input', __( 'enabled must be a boolean.', 'emcp-tools' ) );
			}
			$plugins = EMCP_Tools_GSAP_Module::selected_plugins();
			if ( $args['enabled'] ) {
				$plugins[] = $id;
				$plugins   = EMCP_Tools_GSAP_Assets::dependency_closure( $plugins );
			} else {
				$plugins = self::remove_with_dependents( $plugins, $id );
			}
			update_option( EMCP_Tools_GSAP_Module::OPTION_PLUGINS, $plugins );
			return self::status();
		}

		return new WP_Error( 'unknown_operation', __( 'Unknown GSAP write operation. Call gsap-write with no operation to list supported operations.', 'emcp-tools' ) );
	}

	/** @param mixed $input */
	private static function operation( $input ): string {
		return is_array( $input ) && isset( $input['operation'] ) ? str_replace( '_', '-', sanitize_key( (string) $input['operation'] ) ) : '';
	}

	/** @param mixed $values @return string[] */
	private static function invalid_ids( $values, array $allowed ): array {
		if ( ! is_array( $values ) ) {
			return array( '(not an array)' );
		}
		$normalized = array();
		foreach ( $values as $value ) {
			$normalized[] = is_scalar( $value ) ? sanitize_key( (string) $value ) : '(non-scalar)';
		}
		$values = array_values( array_unique( $normalized ) );
		return array_values( array_diff( $values, $allowed ) );
	}

	/** @return string[] */
	private static function remove_with_dependents( array $selected, string $remove ): array {
		$removed = array( $remove );
		do {
			$changed = false;
			foreach ( EMCP_Tools_GSAP_Assets::plugins() as $id => $plugin ) {
				if ( in_array( $id, $selected, true ) && array_intersect( $plugin['dependencies'], $removed ) && ! in_array( $id, $removed, true ) ) {
					$removed[] = $id;
					$changed   = true;
				}
			}
		} while ( $changed );
		return array_values( array_diff( $selected, $removed ) );
	}

	/** @return array<string,mixed> */
	private static function status(): array {
		return array(
			'module_enabled'     => EMCP_Tools_GSAP_Module::is_enabled(),
			'version'            => EMCP_Tools_GSAP_Assets::VERSION,
			'core_handle'        => EMCP_Tools_GSAP_Assets::CORE_HANDLE,
			'built_into_core'    => array( 'CSSPlugin', 'AttrPlugin', 'EndArrayPlugin', 'ModifiersPlugin', 'RoundPropsPlugin', 'SnapPlugin' ),
			'core_registered'    => function_exists( 'wp_script_is' ) && wp_script_is( EMCP_Tools_GSAP_Assets::CORE_HANDLE, 'registered' ),
			'core_enqueued'      => function_exists( 'wp_script_is' ) && wp_script_is( EMCP_Tools_GSAP_Assets::CORE_HANDLE, 'enqueued' ),
			'contexts'           => EMCP_Tools_GSAP_Module::selected_contexts(),
			'enabled_plugins'    => EMCP_Tools_GSAP_Module::selected_plugins(),
			'plugin_count'       => count( EMCP_Tools_GSAP_Module::selected_plugins() ),
		);
	}
}
