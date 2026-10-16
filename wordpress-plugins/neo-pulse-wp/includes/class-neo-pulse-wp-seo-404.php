<?php
/**
 * 404 log: records addresses that returned "page not found" so they can be redirected.
 *
 * Runs while Neo Pulse SEO is live (Rank Math keeps its own log while it is active). One row per
 * address with a hit counter, capped at 1,000 rows.
 *
 * @package Neo_Pulse_Wp
 */

defined( 'ABSPATH' ) || exit;

class Neo_Pulse_Wp_Seo_404 {

	const DB_VERSION     = '1';
	const VERSION_OPTION = 'neo_pulse_wp_404_db_version';
	const MAX_ROWS       = 1000;

	public static function table(): string {
		global $wpdb;
		return $wpdb->prefix . 'neo_pulse_wp_404';
	}

	public static function enabled(): bool {
		return Neo_Pulse_Wp_Seo_Settings::output_active() && Neo_Pulse_Wp_Seo_Settings::on( Neo_Pulse_Wp_Seo_Settings::get( 'neo_pulse_404_monitor', 'on' ) );
	}

	public static function init(): void {
		if ( ! self::enabled() ) {
			return;
		}
		// After redirects (priority 1), before the optional "send 404s home" fallback (20).
		add_action( 'template_redirect', array( __CLASS__, 'maybe_log' ), 15 );
	}

	public static function install(): void {
		global $wpdb;
		if ( get_option( self::VERSION_OPTION ) === self::DB_VERSION ) {
			return;
		}
		require_once ABSPATH . 'wp-admin/includes/upgrade.php';
		$charset = $wpdb->get_charset_collate();
		dbDelta(
			'CREATE TABLE ' . self::table() . " (
				id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
				url varchar(255) NOT NULL DEFAULT '',
				hits int(10) unsigned NOT NULL DEFAULT 1,
				referer varchar(255) NOT NULL DEFAULT '',
				user_agent varchar(255) NOT NULL DEFAULT '',
				first_seen datetime NOT NULL DEFAULT '0000-00-00 00:00:00',
				last_seen datetime NOT NULL DEFAULT '0000-00-00 00:00:00',
				PRIMARY KEY  (id),
				UNIQUE KEY url (url(191)),
				KEY last_seen (last_seen)
			) $charset;"
		);
		update_option( self::VERSION_OPTION, self::DB_VERSION, true );
	}

	public static function maybe_log(): void {
		if ( ! is_404() || is_admin() || wp_doing_ajax() || ( defined( 'REST_REQUEST' ) && REST_REQUEST ) ) {
			return;
		}
		$uri  = isset( $_SERVER['REQUEST_URI'] ) ? (string) wp_unslash( $_SERVER['REQUEST_URI'] ) : '';
		$path = (string) wp_parse_url( $uri, PHP_URL_PATH );
		if ( $path === '' ) {
			return;
		}
		$referer = isset( $_SERVER['HTTP_REFERER'] ) ? esc_url_raw( wp_unslash( (string) $_SERVER['HTTP_REFERER'] ) ) : '';
		$agent   = isset( $_SERVER['HTTP_USER_AGENT'] ) ? sanitize_text_field( wp_unslash( (string) $_SERVER['HTTP_USER_AGENT'] ) ) : '';
		self::log( $path, $referer, $agent );
	}

	public static function log( string $path, string $referer = '', string $agent = '' ): void {
		global $wpdb;
		self::install();
		$path  = substr( sanitize_text_field( rawurldecode( $path ) ), 0, 255 );
		$now   = current_time( 'mysql' );
		$table = self::table();
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery
		$id = (int) $wpdb->get_var( $wpdb->prepare( "SELECT id FROM {$table} WHERE url = %s", $path ) );
		if ( $id > 0 ) {
			// phpcs:ignore WordPress.DB.DirectDatabaseQuery
			$wpdb->query( $wpdb->prepare( "UPDATE {$table} SET hits = hits + 1, last_seen = %s, referer = %s, user_agent = %s WHERE id = %d", $now, substr( $referer, 0, 255 ), substr( $agent, 0, 255 ), $id ) );
			return;
		}
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery
		$wpdb->insert(
			$table,
			array(
				'url'        => $path,
				'hits'       => 1,
				'referer'    => substr( $referer, 0, 255 ),
				'user_agent' => substr( $agent, 0, 255 ),
				'first_seen' => $now,
				'last_seen'  => $now,
			)
		);
		if ( wp_rand( 1, 50 ) === 1 ) {
			self::prune();
		}
	}

	public static function prune(): void {
		global $wpdb;
		$table = self::table();
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery
		$cut = $wpdb->get_var( $wpdb->prepare( "SELECT last_seen FROM {$table} ORDER BY last_seen DESC LIMIT 1 OFFSET %d", self::MAX_ROWS ) );
		if ( is_string( $cut ) && $cut !== '' ) {
			// phpcs:ignore WordPress.DB.DirectDatabaseQuery
			$wpdb->query( $wpdb->prepare( "DELETE FROM {$table} WHERE last_seen <= %s", $cut ) );
		}
	}

	/**
	 * @return array<int, object>
	 */
	public static function rows( int $limit = 200 ): array {
		global $wpdb;
		if ( get_option( self::VERSION_OPTION ) !== self::DB_VERSION ) {
			return array();
		}
		$table = self::table();
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery
		$rows = $wpdb->get_results( $wpdb->prepare( "SELECT * FROM {$table} ORDER BY last_seen DESC LIMIT %d", $limit ) );
		return is_array( $rows ) ? $rows : array();
	}

	public static function delete( int $id ): void {
		global $wpdb;
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery
		$wpdb->delete( self::table(), array( 'id' => $id ), array( '%d' ) );
	}

	public static function clear(): void {
		global $wpdb;
		if ( get_option( self::VERSION_OPTION ) !== self::DB_VERSION ) {
			return;
		}
		$table = self::table();
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery
		$wpdb->query( "DELETE FROM {$table}" );
	}
}
