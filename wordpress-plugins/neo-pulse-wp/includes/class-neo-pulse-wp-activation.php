<?php
/**
 * Activation, deactivation and version migrations (deferred off the activate redirect).
 *
 * @package Neo_Pulse_Wp
 */

defined( 'ABSPATH' ) || exit;

class Neo_Pulse_Wp_Activation {

	const PENDING_OPTION   = 'neo_pulse_wp_pending_activation';
	const INSTALLED_OPTION = 'neo_pulse_wp_installed_version';

	/** Bumped when a one-time settings clean-up is added (independent of the plugin version). */
	const CLEANUP_OPTION  = 'neo_pulse_wp_settings_cleanup';
	const CLEANUP_VERSION = 2;

	/**
	 * Cron hooks the plugin schedules; all are cleared on deactivation.
	 *
	 * @var string[]
	 */
	const CRON_HOOKS = array(
		'neo_pulse_wp_overseer_prune',
		'neo_pulse_wp_refresh_chat_starters',
		'neo_pulse_wp_generate_chat_starters',
		'neo_pulse_wp_search_weekly_terms',
		'neo_pulse_wp_license_refresh',
		'neo_pulse_wp_indexnow_send',
		'neo_pulse_wp_image_seo_retry',
		'neo_pulse_novamira_page_design',
	);

	/**
	 * Options from the removed Speed module (and its repair flags).
	 *
	 * @var string[]
	 */
	const SPEED_OPTIONS = array(
		'neo_pulse_wp_speed_settings',
		'neo_pulse_wp_speed_image_settings',
		'neo_pulse_wp_speed_image_stats',
		'neo_pulse_wp_speed_elementor_config',
		'neo_pulse_wp_speed_elementor_safe_defaults',
		'neo_pulse_wp_speed_elementor_safe_defaults_v2',
		'neo_pulse_wp_speed_default_on_v4',
		'neo_pulse_wp_speed_simple_enabled_repair_v1',
		'neo_pulse_wp_speed_simple_enabled_repair_v2',
		'neo_pulse_wp_speed_simple_enabled_repair_v3',
		'neo_pulse_wp_speed_simple_enabled_repair_v4',
		'neo_pulse_wp_speed_last_flush',
		'neo_pulse_wp_speed_last_write',
		'neo_pulse_wp_speed_auto_warm_lock',
		'neo_pulse_wp_speed_default_css_excludes',
		'neo_pulse_wp_speed_default_js_excludes',
		'neo_pulse_wp_speed_default_defer_js_excludes',
	);

	/**
	 * Left over from the NEO Pulse Current / Flowbie plugins and the retired Node API pairing.
	 *
	 * @var string[]
	 */
	const LEGACY_OPTIONS = array(
		'neo_pulse_wp_migrated_from_flowbie_v1',
		'neo_pulse_current_settings',
		'flowbie_current_auto_setup_user',
		'neo_pulse_current_auto_setup_user',
		'neo_pulse_wp_builtin_api_base_v1',
		'neo_pulse_wp_welcome_completed',
		'neo_pulse_wp_seo_blocks_db_version',
	);

	/**
	 * One-time clean-up of settings that moved or were removed (runs late on init, so custom post
	 * types are registered). Each step is safe to run again.
	 */
	public static function maybe_run_settings_cleanup(): void {
		$done = (int) get_option( self::CLEANUP_OPTION, 0 );
		if ( $done >= self::CLEANUP_VERSION ) {
			return;
		}

		if ( $done < 1 ) {
			self::cleanup_v1();
		}
		if ( $done < 2 ) {
			self::cleanup_v2();
		}

		// Autoloaded: read on every request.
		update_option( self::CLEANUP_OPTION, self::CLEANUP_VERSION, true );
	}

	/**
	 * v1: settings moved to Neo Tools / Settings → Editor AI, and settings nothing reads any more.
	 */
	private static function cleanup_v1(): void {
		// Editor AI post types moved from Sitemap → Content Optimizer to Settings → Editor AI.
		if ( class_exists( 'Neo_Pulse_Wp_Editor_Ai_Settings', false ) ) {
			Neo_Pulse_Wp_Editor_Ai_Settings::maybe_migrate();
		}

		// Comment disabling now belongs to Neo Tools. Carry over a site's "comments off" choice
		// from either old NEO Pulse switch.
		$comments = get_option( 'neo_pulse_wp_comments_settings' );
		$scripts  = get_option( 'neo_pulse_wp_script_manager_settings' );
		$was_off  = ( is_array( $comments ) && array_key_exists( 'enabled', $comments ) && ! $comments['enabled'] )
			|| ( is_array( $scripts ) && ! empty( $scripts['disable_comments'] ) );
		if ( $was_off ) {
			update_option( 'ndet_disable_comments', 1 );
		}
		delete_option( 'neo_pulse_wp_comments_settings' );
		if ( is_array( $scripts ) && array_key_exists( 'disable_comments', $scripts ) ) {
			unset( $scripts['disable_comments'] );
			update_option( 'neo_pulse_wp_script_manager_settings', $scripts, false );
		}

		// Settings nothing reads any more.
		$search = get_option( 'neo_pulse_wp_search_settings' );
		if ( is_array( $search ) ) {
			unset( $search['primary_color'], $search['bg_color'], $search['border_radius'], $search['font_size'] );
			update_option( 'neo_pulse_wp_search_settings', $search );
		}
		$image_seo = get_option( 'neo_pulse_wp_image_seo_config' );
		if ( is_array( $image_seo ) && array_key_exists( 'auto_in_gallery', $image_seo ) ) {
			unset( $image_seo['auto_in_gallery'] );
			update_option( 'neo_pulse_wp_image_seo_config', $image_seo );
		}
		$sitemap = get_option( 'neo_pulse_wp_sitemap' );
		if ( is_array( $sitemap ) && isset( $sitemap['html'] ) && is_array( $sitemap['html'] ) && array_key_exists( 'page_id', $sitemap['html'] ) ) {
			unset( $sitemap['html']['page_id'] );
			update_option( 'neo_pulse_wp_sitemap', $sitemap, false );
		}
		delete_metadata( 'user', 0, 'neo_pulse_wp_notice_dismissed', '', true );
	}

	/**
	 * v2: retired Node API credentials, Speed module leftovers, legacy migration options, and
	 * autoload flags for the small options read on every request.
	 */
	private static function cleanup_v2(): void {
		// Plain-text WordPress username / Application Password from the old Node API pairing, and
		// the "NEO Pulse WP" Application Passwords it created.
		if ( class_exists( 'Neo_Pulse_Wp_Api', false ) ) {
			Neo_Pulse_Wp_Api::cleanup_legacy_credentials();
		}

		foreach ( array_merge( self::SPEED_OPTIONS, self::LEGACY_OPTIONS ) as $option ) {
			delete_option( $option );
		}
		self::remove_speed_cache_dir();

		if ( function_exists( 'wp_set_option_autoload_values' ) ) {
			wp_set_option_autoload_values(
				array(
					'neo_pulse_wp_overseer_db_version'               => true,
					'neo_pulse_wp_overseer_settings'                 => true,
					'neo_pulse_wp_overseer_builtin_script_id'        => true,
					'neo_pulse_wp_overseer_script_template_version'  => true,
					'neo_pulse_wp_cache_flush_version'               => true,
					'neo_pulse_wp_send_nocache_until'                => true,
					self::INSTALLED_OPTION                           => true,
					'neo_pulse_wp_license_state'                     => false,
				)
			);
		}
	}

	/**
	 * Remove wp-content/cache/neo-pulse-speed/ (Speed module page cache) if it is still there.
	 * Only that folder is touched; symlinks are removed, never followed.
	 */
	private static function remove_speed_cache_dir(): void {
		if ( ! defined( 'WP_CONTENT_DIR' ) ) {
			return;
		}
		$cache_root = realpath( WP_CONTENT_DIR . '/cache' );
		$dir        = WP_CONTENT_DIR . '/cache/neo-pulse-speed';
		if ( false === $cache_root || is_link( $dir ) || ! is_dir( $dir ) ) {
			return;
		}
		$real = realpath( $dir );
		if ( false === $real || wp_normalize_path( dirname( $real ) ) !== wp_normalize_path( $cache_root ) || 'neo-pulse-speed' !== basename( $real ) ) {
			return;
		}

		try {
			$items = new RecursiveIteratorIterator(
				new RecursiveDirectoryIterator( $real, FilesystemIterator::SKIP_DOTS ),
				RecursiveIteratorIterator::CHILD_FIRST
			);
			foreach ( $items as $item ) {
				$path = $item->getPathname();
				if ( 0 !== strpos( wp_normalize_path( $path ), wp_normalize_path( $real ) . '/' ) ) {
					continue;
				}
				if ( $item->isDir() && ! $item->isLink() ) {
					@rmdir( $path ); // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged
				} else {
					wp_delete_file( $path );
				}
			}
			@rmdir( $real ); // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged
		} catch ( Exception $e ) {
			unset( $e ); // Leave it for next time; nothing depends on it.
		}
	}

	/**
	 * Queue install work; runs on next init so activate redirect does not fatal.
	 */
	public static function on_activate(): void {
		update_option( self::PENDING_OPTION, NEO_PULSE_WP_VERSION, true );
		self::default_chat_off_on_fresh_install();
		// 0.9.256: NEO Pulse stays locked until the site is activated, so ask the licence server now.
		if ( class_exists( 'Neo_Pulse_Wp_License', false ) && '' !== Neo_Pulse_Wp_License::site_key() ) {
			Neo_Pulse_Wp_License::refresh(); // Keeps the last answer if the server can't be reached.
		}
	}

	/**
	 * 0.9.255: a fresh install starts with AI chat turned off everywhere (front end, wp-admin,
	 * search panel, shortcode, God Mode, chat API). Chat is switched on per site from Chat > General.
	 * Sites that already have chat settings saved are left exactly as they are.
	 */
	private static function default_chat_off_on_fresh_install(): void {
		if ( get_option( 'neo_pulse_wp_chat_settings', null ) !== null ) {
			return;
		}
		add_option(
			'neo_pulse_wp_chat_settings',
			array(
				'enabled'        => false,
				'off_everywhere' => true,
			)
		);
	}

	/**
	 * Deactivation: stop the plugin's scheduled events and let WordPress rebuild its rewrite rules
	 * without the plugin's routes. Data is kept (see uninstall.php).
	 */
	public static function deactivate(): void {
		foreach ( self::CRON_HOOKS as $hook ) {
			wp_unschedule_hook( $hook ); // All events for the hook, whatever their arguments.
		}
		delete_option( self::PENDING_OPTION );
		delete_option( 'rewrite_rules' );
	}

	/**
	 * Run pending activation steps once WordPress is fully booted.
	 */
	public static function maybe_run_pending(): void {
		$pending = (string) get_option( self::PENDING_OPTION, '' );
		if ( $pending === '' ) {
			return;
		}

		// Always cleared once seen, even if it was queued by another version.
		delete_option( self::PENDING_OPTION );
		self::run_install_steps();
		update_option( self::INSTALLED_OPTION, NEO_PULSE_WP_VERSION, true );
	}

	/**
	 * Version bump (same steps as activation, without re-queueing).
	 */
	public static function maybe_run_version_migration(): void {
		$installed = (string) get_option( self::INSTALLED_OPTION, '' );
		if ( $installed === NEO_PULSE_WP_VERSION ) {
			return;
		}

		update_option( self::INSTALLED_OPTION, NEO_PULSE_WP_VERSION, true );
		self::run_install_steps();
		self::purge_hosting_cache();
	}

	private static function run_install_steps(): void {
		// Let WordPress rebuild rewrite rules lazily (on the next rewrite lookup, with every plugin's
		// rules registered) instead of a hard flush during init.
		delete_option( 'rewrite_rules' );

		if ( class_exists( 'Neo_Pulse_Wp_Redirects', false ) ) {
			Neo_Pulse_Wp_Redirects::install();
		}
		if ( class_exists( 'Neo_Pulse_Wp_Chat_Logs', false ) ) {
			Neo_Pulse_Wp_Chat_Logs::install();
		}
		if ( class_exists( 'Neo_Pulse_Wp_Search_Logs', false ) ) {
			Neo_Pulse_Wp_Search_Logs::install();
		}
		if ( class_exists( 'Neo_Pulse_Wp_Script_Manager', false ) ) {
			Neo_Pulse_Wp_Script_Manager::install();
		}
		if ( class_exists( 'Neo_Pulse_Wp_Overseer', false ) ) {
			// Also creates/repairs the built-in Script Manager tag.
			Neo_Pulse_Wp_Overseer::install();
		}
	}

	/**
	 * Clear caches after an update. Neo_Pulse_Wp_Cache_Flush::flush_all() already purges WP Engine
	 * (varnish + memcached) and NitroPack, so nothing host-specific is repeated here.
	 */
	private static function purge_hosting_cache(): void {
		if ( class_exists( 'Neo_Pulse_Wp_Cache_Flush', false ) ) {
			Neo_Pulse_Wp_Cache_Flush::flush_all();
		}
	}
}
