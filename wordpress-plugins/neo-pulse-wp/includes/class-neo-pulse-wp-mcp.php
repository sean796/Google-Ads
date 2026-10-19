<?php
/**
 * WordPress Abilities API & MCP Registration for Neo Pulse (`neo-pulse/read` and `neo-pulse/write`).
 *
 * Implements the two-dispatcher contract specified in EMCP-INTEGRATION-HANDOFF.md:
 * - Registers category `neo-pulse` on `wp_abilities_api_categories_init`
 * - Registers `neo-pulse/read` and `neo-pulse/write` on `wp_abilities_api_init`
 * - Appends both to `emcp_tools_ability_names` when "Allow Claude access (MCP)" is on
 *
 * @package Neo_Pulse_Wp
 */

defined( 'ABSPATH' ) || exit;

require_once NEO_PULSE_WP_PLUGIN_DIR . 'includes/mcp/class-neo-pulse-wp-mcp-history.php';
require_once NEO_PULSE_WP_PLUGIN_DIR . 'includes/mcp/class-neo-pulse-wp-mcp-audit.php';
require_once NEO_PULSE_WP_PLUGIN_DIR . 'includes/mcp/class-neo-pulse-wp-mcp-read.php';
require_once NEO_PULSE_WP_PLUGIN_DIR . 'includes/mcp/class-neo-pulse-wp-mcp-write.php';
require_once NEO_PULSE_WP_PLUGIN_DIR . 'includes/mcp/class-neo-pulse-wp-mcp-guards.php';

final class Neo_Pulse_Wp_Mcp {

	const OPTION      = 'neo_pulse_wp_mcp';
	const ACTION_SAVE = 'neo_pulse_wp_save_mcp';

	public static function init(): void {
		add_action( 'admin_post_' . self::ACTION_SAVE, array( __CLASS__, 'handle_save_switch' ) );

		// Hook early so EMCP's registrar sees our ability names when building the server.
		add_filter( 'emcp_tools_ability_names', array( __CLASS__, 'filter_emcp_ability_names' ) );
		Neo_Pulse_Wp_Mcp_Guards::init();

		add_action( 'wp_abilities_api_categories_init', array( __CLASS__, 'register_category' ) );
		add_action( 'wp_abilities_api_init', array( __CLASS__, 'register_abilities' ) );
	}

	/**
	 * Whether "Allow Claude access (MCP)" is enabled (on by default).
	 */
	public static function enabled(): bool {
		$val = get_option( self::OPTION, '1' );
		if ( is_bool( $val ) ) {
			return $val;
		}
		return ! in_array( strtolower( trim( (string) $val ) ), array( '0', 'off', 'false', 'no' ), true );
	}

	public static function set_enabled( bool $enabled ): void {
		update_option( self::OPTION, $enabled ? '1' : '0', true );
	}

	/**
	 * Register the `neo-pulse` ability category.
	 */
	public static function register_category(): void {
		if ( ! function_exists( 'wp_register_ability_category' ) ) {
			return;
		}
		wp_register_ability_category(
			'neo-pulse',
			array(
				'label'       => __( 'Neo Pulse', 'neo-pulse-wp' ),
				'description' => __( 'Neo Pulse SEO, schema, redirects, scripts and shared business details.', 'neo-pulse-wp' ),
			)
		);
	}

	/**
	 * Register `neo-pulse/read` and `neo-pulse/write` abilities.
	 */
	public static function register_abilities(): void {
		if ( ! function_exists( 'wp_register_ability' ) ) {
			return;
		}

		$schema = array(
			'type'                 => 'object',
			'properties'           => array(
				'operation' => array(
					'type'        => 'string',
					'description' => 'Operation name. Omit to get the catalog.',
				),
				'arguments' => array(
					'type'                 => 'object',
					'additionalProperties' => true,
				),
			),
			'additionalProperties' => false,
		);

		$output_schema = array(
			'type'                 => 'object',
			'additionalProperties' => true,
		);

		wp_register_ability(
			'neo-pulse/read',
			array(
				'label'               => __( 'Neo Pulse: read', 'neo-pulse-wp' ),
				'description'         => __( 'Read Neo Pulse SEO settings, the shared business details (shared with Neo Tools), locations and per-page schema, and preview or audit the JSON-LD. Call with no operation for the catalog.', 'neo-pulse-wp' ),
				'category'            => 'neo-pulse',
				'input_schema'        => $schema,
				'output_schema'       => $output_schema,
				'execute_callback'    => array( __CLASS__, 'read' ),
				'permission_callback' => array( __CLASS__, 'can_read' ),
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

		wp_register_ability(
			'neo-pulse/write',
			array(
				'label'               => __( 'Neo Pulse: write', 'neo-pulse-wp' ),
				'description'         => __( 'Change Neo Pulse SEO settings, the shared business details (shared with Neo Tools), locations and per-page schema. Supports dry_run, expected_version and undo. Call with no operation for the catalog.', 'neo-pulse-wp' ),
				'category'            => 'neo-pulse',
				'input_schema'        => $schema,
				'output_schema'       => $output_schema,
				'execute_callback'    => array( __CLASS__, 'write' ),
				'permission_callback' => array( __CLASS__, 'can_write' ),
				'meta'                => array(
					'annotations'  => array(
						'readonly'    => false,
						'destructive' => true,
						'idempotent'  => false,
					),
					'show_in_rest' => true,
				),
			)
		);
	}

	/**
	 * Add `neo-pulse/read` and `neo-pulse/write` to EMCP's ability list when enabled.
	 *
	 * @param array<int,string>|mixed $names Existing ability names.
	 * @return array<int,string>
	 */
	public static function filter_emcp_ability_names( $names ): array {
		$names = is_array( $names ) ? $names : array();
		if ( ! self::enabled() ) {
			return $names;
		}
		return array_values( array_unique( array_merge( $names, array( 'neo-pulse/read', 'neo-pulse/write' ) ) ) );
	}

	public static function can_read(): bool {
		return self::enabled() && current_user_can( 'edit_posts' );
	}

	public static function can_write(): bool {
		return self::enabled() && current_user_can( 'edit_posts' );
	}

	/**
	 * Execute `neo-pulse/read`.
	 *
	 * @param mixed $input Tool input `{ operation?, arguments? }`.
	 * @return array<string,mixed>|WP_Error
	 */
	public static function read( $input = array() ) {
		if ( ! self::can_read() ) {
			return new WP_Error( 'tool_off', __( 'Claude access (MCP) is switched off or you do not have permission.', 'neo-pulse-wp' ), array( 'status' => 403 ) );
		}
		$input     = is_array( $input ) ? $input : array();
		$operation = isset( $input['operation'] ) ? str_replace( '_', '-', sanitize_key( (string) $input['operation'] ) ) : '';
		$arguments = isset( $input['arguments'] ) && is_array( $input['arguments'] ) ? $input['arguments'] : array();
		return Neo_Pulse_Wp_Mcp_Read::dispatch( $operation, $arguments );
	}

	/**
	 * Execute `neo-pulse/write`.
	 *
	 * @param mixed $input Tool input `{ operation?, arguments? }`.
	 * @return array<string,mixed>|WP_Error
	 */
	public static function write( $input = array() ) {
		if ( ! self::can_write() ) {
			return new WP_Error( 'tool_off', __( 'Claude access (MCP) is switched off or you do not have permission.', 'neo-pulse-wp' ), array( 'status' => 403 ) );
		}
		$input     = is_array( $input ) ? $input : array();
		$operation = isset( $input['operation'] ) ? str_replace( '_', '-', sanitize_key( (string) $input['operation'] ) ) : '';
		$arguments = isset( $input['arguments'] ) && is_array( $input['arguments'] ) ? $input['arguments'] : array();
		return Neo_Pulse_Wp_Mcp_Write::dispatch( $operation, $arguments );
	}

	/**
	 * Save handler for the "Allow Claude access (MCP)" switch on Settings -> Licence.
	 */
	public static function handle_save_switch(): void {
		if ( ! current_user_can( 'manage_options' ) ) {
			wp_die( esc_html__( 'You do not have permission to change MCP settings.', 'neo-pulse-wp' ) );
		}
		check_admin_referer( self::ACTION_SAVE, 'neo_pulse_wp_mcp_nonce' );
		$enabled = ! empty( $_POST['neo_pulse_wp_mcp_enabled'] );
		self::set_enabled( $enabled );
		wp_safe_redirect( add_query_arg( 'mcp', $enabled ? 'on' : 'off', Neo_Pulse_Wp_License::settings_url() ) );
		exit;
	}
}
