<?php
/**
 * Private updates from the Neo Digital update server (same server and site key as Neo Tools).
 *
 * Twice a day the plugin asks the server for the latest Neo Pulse version. The server only answers
 * for sites with Neo Pulse switched on, so unlicensed sites simply stop being offered updates.
 * New versions appear in Dashboard → Updates like any other plugin, and the download only works
 * with a valid key (the header is added by Neo_Pulse_Wp_License::add_key_header()).
 *
 * @package Neo_Pulse_Wp
 */

defined( 'ABSPATH' ) || exit;

class Neo_Pulse_Wp_Updater {

	const SLUG     = 'neo-pulse-wp';
	const CACHE    = 'neo_pulse_wp_update_info';

	/**
	 * This plugin's basename as WordPress sees it (folder/file.php), whatever the folder is called.
	 */
	public static function basename(): string {
		static $basename = null;
		if ( null === $basename ) {
			$basename = plugin_basename( NEO_PULSE_WP_PLUGIN_FILE );
		}
		return $basename;
	}

	public static function init(): void {
		add_filter( 'pre_set_site_transient_update_plugins', array( __CLASS__, 'inject_update' ) );
		add_filter( 'plugins_api', array( __CLASS__, 'plugin_information' ), 10, 3 );
		add_filter( 'auto_update_plugin', array( __CLASS__, 'auto_update' ), 10, 2 );
		add_action( 'load-update-core.php', array( __CLASS__, 'maybe_force_check' ) );
		add_action( 'upgrader_process_complete', array( __CLASS__, 'after_upgrade' ), 10, 2 );
		foreach ( array( 'add_option_ndet_site_key', 'update_option_ndet_site_key', 'add_option_' . Neo_Pulse_Wp_License::KEY_OPTION, 'update_option_' . Neo_Pulse_Wp_License::KEY_OPTION ) as $hook ) {
			add_action( $hook, array( __CLASS__, 'forget' ) );
		}
	}

	/**
	 * Black-and-lime Neo Digital icons shown next to Neo Pulse on Dashboard → Updates.
	 *
	 * @return array<string, string>
	 */
	public static function icons(): array {
		$base = plugin_dir_url( NEO_PULSE_WP_PLUGIN_FILE ) . 'assets/admin/';
		return array(
			'svg' => $base . 'update-icon.svg',
			'2x'  => $base . 'update-icon-256x256.png',
			'1x'  => $base . 'update-icon-128x128.png',
		);
	}

	public static function forget(): void {
		delete_site_transient( self::CACHE );
		delete_site_transient( 'update_plugins' );
	}

	/**
	 * Latest release info, cached for 12 hours (1 hour after an error).
	 *
	 * @return array 'ok' => true plus the release fields, or 'ok' => false with 'code' and 'message'.
	 */
	public static function info( bool $force = false ): array {
		$cached = get_site_transient( self::CACHE );
		if ( ! $force && is_array( $cached ) ) {
			return $cached;
		}

		$key = Neo_Pulse_Wp_License::site_key();
		if ( '' === $key ) {
			$info = array(
				'ok'      => false,
				'code'    => 'missing_key',
				'message' => __( 'No site key on this site, so Neo Pulse cannot receive updates.', 'neo-pulse-wp' ),
			);
			set_site_transient( self::CACHE, $info, 12 * HOUR_IN_SECONDS );
			return $info;
		}

		global $wp_version;
		$response = wp_remote_post(
			Neo_Pulse_Wp_License::server_url() . '/check',
			array(
				'timeout' => 10,
				'headers' => array( 'Content-Type' => 'application/json' ),
				'body'    => wp_json_encode(
					array(
						'slug'    => self::SLUG,
						'version' => NEO_PULSE_WP_VERSION,
						'site'    => home_url(),
						'wp'      => $wp_version,
						'php'     => PHP_VERSION,
					)
				),
			)
		);

		$code = is_wp_error( $response ) ? 0 : (int) wp_remote_retrieve_response_code( $response );
		$body = is_wp_error( $response ) ? null : json_decode( (string) wp_remote_retrieve_body( $response ), true );

		if ( 200 === $code && is_array( $body ) && ! empty( $body['version'] ) ) {
			$info = array_merge( $body, array( 'ok' => true ) );
			$ttl  = 12 * HOUR_IN_SECONDS;
		} else {
			$info = array(
				'ok'      => false,
				'code'    => is_array( $body ) && ! empty( $body['code'] ) ? sanitize_key( (string) $body['code'] ) : 'unreachable',
				'message' => is_array( $body ) && ! empty( $body['message'] )
					? sanitize_text_field( (string) $body['message'] )
					: __( 'The Neo Digital update server could not be reached. It will try again within the hour.', 'neo-pulse-wp' ),
			);
			$ttl  = HOUR_IN_SECONDS;
		}
		$info['checked'] = time();
		set_site_transient( self::CACHE, $info, $ttl );
		return $info;
	}

	/**
	 * Add Neo Pulse to WordPress's list of available updates.
	 *
	 * @param mixed $transient update_plugins transient.
	 * @return mixed
	 */
	public static function inject_update( $transient ) {
		if ( ! is_object( $transient ) ) {
			return $transient;
		}
		$info = self::info();
		if ( empty( $info['ok'] ) ) {
			unset( $transient->response[ self::basename() ] );
			return $transient;
		}
		$item = (object) array(
			'id'            => self::basename(),
			'slug'          => self::SLUG,
			'plugin'        => self::basename(),
			'new_version'   => $info['version'],
			'url'           => 'https://neodigital.ca',
			'package'       => isset( $info['package'] ) ? $info['package'] : '',
			'tested'        => isset( $info['tested'] ) ? $info['tested'] : '',
			'requires'      => isset( $info['requires'] ) ? $info['requires'] : '',
			'requires_php'  => isset( $info['requires_php'] ) ? $info['requires_php'] : '',
			'icons'         => self::icons(),
			'banners'       => array(),
			'compatibility' => new stdClass(),
		);
		if ( version_compare( $info['version'], NEO_PULSE_WP_VERSION, '>' ) ) {
			$transient->response[ self::basename() ] = $item;
			unset( $transient->no_update[ self::basename() ] );
		} else {
			// Listing it as up to date lets WordPress show the "Enable auto-updates" link.
			$transient->no_update[ self::basename() ] = $item;
			unset( $transient->response[ self::basename() ] );
		}
		return $transient;
	}

	/**
	 * The "View details" popup.
	 *
	 * @param mixed  $result Result so far.
	 * @param string $action plugins_api action.
	 * @param object $args   Request args.
	 * @return mixed
	 */
	public static function plugin_information( $result, $action, $args ) {
		if ( 'plugin_information' !== $action || empty( $args->slug ) || self::SLUG !== $args->slug ) {
			return $result;
		}
		$info = self::info();
		if ( empty( $info['ok'] ) ) {
			return $result;
		}
		$sections = isset( $info['sections'] ) && is_array( $info['sections'] ) ? $info['sections'] : array();
		return (object) array(
			'name'          => 'Neo Pulse',
			'slug'          => self::SLUG,
			'version'       => $info['version'],
			'author'        => '<a href="https://neodigital.ca">Neo Digital</a>',
			'homepage'      => 'https://neodigital.ca',
			'requires'      => isset( $info['requires'] ) ? $info['requires'] : '',
			'tested'        => isset( $info['tested'] ) ? $info['tested'] : '',
			'requires_php'  => isset( $info['requires_php'] ) ? $info['requires_php'] : '',
			'last_updated'  => isset( $info['released'] ) ? $info['released'] : '',
			'download_link' => isset( $info['package'] ) ? $info['package'] : '',
			'sections'      => array_map( 'wp_kses_post', $sections ),
		);
	}

	/**
	 * The update server can switch automatic updates on for this plugin.
	 *
	 * @param mixed  $update Current decision.
	 * @param object $item   Update item.
	 * @return mixed
	 */
	public static function auto_update( $update, $item ) {
		if ( isset( $item->plugin ) && self::basename() === $item->plugin ) {
			$info = get_site_transient( self::CACHE );
			if ( is_array( $info ) && ! empty( $info['ok'] ) && ! empty( $info['auto_update'] ) ) {
				return true;
			}
		}
		return $update;
	}

	public static function maybe_force_check(): void {
		if ( isset( $_GET['force-check'] ) ) { // phpcs:ignore WordPress.Security.NonceVerification.Recommended -- read-only refresh, same as core.
			delete_site_transient( self::CACHE );
		}
	}

	/**
	 * @param object $upgrader Upgrader.
	 * @param array  $options  Upgrade details.
	 */
	public static function after_upgrade( $upgrader, $options ): void {
		if ( isset( $options['type'], $options['plugins'] ) && 'plugin' === $options['type'] && in_array( self::basename(), (array) $options['plugins'], true ) ) {
			delete_site_transient( self::CACHE );
		}
	}
}
