<?php
/**
 * Neo EMCP Engine Loader (Standalone inside Neo Pulse WP).
 *
 * Boots the self-contained Neo EMCP engine inside Neo Pulse WP with zero
 * license/Freemius/Cloud dependencies and prevents any external `emcp-tools` or
 * `emcp-pro` plugin from loading alongside it.
 *
 * @package Neo_Pulse_Wp
 */

defined( 'ABSPATH' ) || exit;

/**
 * Unlicensed (always-unlocked) compatibility shim so every Pro module and tool
 * inside Neo EMCP works out of the box with no license or external account.
 */
final class Neo_Pulse_Wp_Emcp_Fs_Shim {

	public function can_use_premium_code(): bool {
		return true;
	}

	public function is_premium(): bool {
		return true;
	}

	public function is_registered(): bool {
		return false;
	}

	public function has_affiliate_program(): bool {
		return false;
	}

	public function is_activation_mode(): bool {
		return false;
	}

	public function get_account_url(): string {
		return admin_url( 'admin.php?page=neo-pulse-wp-emcp' );
	}

	/**
	 * @return null
	 */
	public function _get_license() {
		return null;
	}

	/**
	 * @param mixed ...$args Ignored.
	 */
	public function add_filter( ...$args ): void {
		unset( $args );
	}

	/**
	 * @param mixed ...$args Ignored.
	 */
	public function add_action( ...$args ): void {
		unset( $args );
	}
}

final class Neo_Pulse_Wp_Emcp_Loader {

	const ENGINE_VERSION = '3.20.0';

	/** Standalone EMCP plugin basenames retired when Neo Pulse WP boots. */
	const STANDALONE_BASENAMES = array(
		'emcp-pro/emcp-tools.php',
		'emcp-tools/emcp-tools.php',
		'elementor-mcp/elementor-mcp.php',
	);

	/** @var Neo_Pulse_Wp_Emcp_Fs_Shim|null */
	private static $fs_shim = null;

	public static function fs(): Neo_Pulse_Wp_Emcp_Fs_Shim {
		if ( null === self::$fs_shim ) {
			self::$fs_shim = new Neo_Pulse_Wp_Emcp_Fs_Shim();
		}
		return self::$fs_shim;
	}

	public static function boot(): void {
		$engine_dir = NEO_PULSE_WP_PLUGIN_DIR . 'includes/emcp/engine/';
		if ( ! is_readable( $engine_dir . 'includes/class-bootstrap.php' ) ) {
			return;
		}

		// Filter active_plugins and retire any standalone emcp-pro / emcp-tools copy
		// so only the standalone Neo EMCP engine inside Neo Pulse WP runs.
		add_filter( 'option_active_plugins', array( __CLASS__, 'filter_active_plugins' ), 1 );
		self::schedule_standalone_retirement();

		if ( defined( 'EMCP_TOOLS_VERSION' ) || class_exists( 'EMCP_Tools_Bootstrap', false ) ) {
			return;
		}

		define( 'EMCP_TOOLS_VERSION', self::ENGINE_VERSION );
		define( 'EMCP_TOOLS_DIR', $engine_dir );
		define( 'EMCP_TOOLS_URL', plugin_dir_url( NEO_PULSE_WP_PLUGIN_FILE ) . 'includes/emcp/engine/' );
		define( 'EMCP_TOOLS_BASENAME', plugin_basename( NEO_PULSE_WP_PLUGIN_FILE ) );

		require_once EMCP_TOOLS_DIR . 'includes/class-migration.php';
		require_once EMCP_TOOLS_DIR . 'includes/class-mcp-adapter-bootstrap.php';
		EMCP_Tools_Adapter_Bootstrap::preload_bundled_namespace();

		require_once EMCP_TOOLS_DIR . 'includes/class-deactivator.php';
		register_deactivation_hook( NEO_PULSE_WP_PLUGIN_FILE, array( 'EMCP_Tools_Deactivator', 'run' ) );

		require_once EMCP_TOOLS_DIR . 'includes/class-bootstrap.php';
		add_action( 'plugins_loaded', array( 'EMCP_Tools_Bootstrap', 'boot' ), 20 );
	}

	/**
	 * Strip external emcp-pro / emcp-tools from active_plugins when Neo EMCP is bundled.
	 *
	 * @param mixed $plugins Active plugins list.
	 * @return mixed
	 */
	public static function filter_active_plugins( $plugins ) {
		if ( ! is_array( $plugins ) ) {
			return $plugins;
		}
		return array_values( array_diff( $plugins, self::STANDALONE_BASENAMES ) );
	}

	private static function schedule_standalone_retirement(): void {
		add_action( 'init', array( __CLASS__, 'retire_standalone_plugins' ), 1 );
		add_action( 'admin_init', array( __CLASS__, 'retire_standalone_plugins' ), 1 );
	}

	public static function retire_standalone_plugins(): void {
		remove_filter( 'option_active_plugins', array( __CLASS__, 'filter_active_plugins' ), 1 );
		$raw_active = (array) get_option( 'active_plugins', array() );
		add_filter( 'option_active_plugins', array( __CLASS__, 'filter_active_plugins' ), 1 );

		$found = array_values( array_intersect( self::STANDALONE_BASENAMES, $raw_active ) );
		if ( array() === $found ) {
			return;
		}
		$cleaned = array_values( array_diff( $raw_active, self::STANDALONE_BASENAMES ) );
		update_option( 'active_plugins', $cleaned );
	}
}

if ( ! function_exists( 'emcp_tools_fs' ) ) {
	/**
	 * Global accessor expected by EMCP classes — always unlocked inside Neo Pulse.
	 */
	function emcp_tools_fs(): Neo_Pulse_Wp_Emcp_Fs_Shim {
		return Neo_Pulse_Wp_Emcp_Loader::fs();
	}
}

if ( ! function_exists( 'emcp_tools_upgrade_url' ) ) {
	function emcp_tools_upgrade_url(): string {
		return admin_url( 'admin.php?page=neo-pulse-wp-emcp' );
	}
}
