<?php
/**
 * Sitemap transient cache.
 *
 * Keys carry a cache version stored in an option; flushing bumps the version, so old entries are
 * never read again. That works with persistent object caches too, where transients do not live in
 * the options table and cannot be found by a LIKE query.
 *
 * @package Neo_Pulse_Wp
 */

defined( 'ABSPATH' ) || exit;

/**
 * Caches generated sitemap XML in transients.
 */
class Neo_Pulse_Wp_Sitemap_Cache {

	const PREFIX         = 'neo_pulse_wp_sitemap_';
	const VERSION_OPTION = 'neo_pulse_wp_sitemap_cache_version';

	/**
	 * Current cache version (part of every key).
	 */
	public static function version(): int {
		return max( 1, (int) get_option( self::VERSION_OPTION, 1 ) );
	}

	/**
	 * @param string $key Cache key suffix.
	 */
	public static function get( string $key ): ?string {
		$value = get_transient( self::full_key( $key ) );
		return is_string( $value ) && $value !== '' ? $value : null;
	}

	/**
	 * @param string $key Cache key suffix.
	 * @param string $xml XML content.
	 * @param int    $ttl TTL in seconds.
	 */
	public static function set( string $key, string $xml, int $ttl = DAY_IN_SECONDS ): void {
		set_transient( self::full_key( $key ), $xml, $ttl );
	}

	private static function full_key( string $key ): string {
		return self::PREFIX . 'v' . self::version() . '_' . $key;
	}

	/**
	 * Invalidate every cached sitemap (cheap: one option write). Old entries expire on their own.
	 */
	public static function bump(): void {
		update_option( self::VERSION_OPTION, self::version() + 1, true );
	}

	/**
	 * Flush all sitemap transients: bump the version, then remove database-stored entries.
	 */
	public static function flush_all(): void {
		self::bump();

		global $wpdb;

		if ( ! isset( $wpdb ) || wp_using_ext_object_cache() ) {
			return;
		}

		$like = $wpdb->esc_like( '_transient_' . self::PREFIX ) . '%';
		$rows = $wpdb->get_col(
			$wpdb->prepare(
				"SELECT option_name FROM {$wpdb->options} WHERE option_name LIKE %s OR option_name LIKE %s",
				$like,
				$wpdb->esc_like( '_transient_timeout_' . self::PREFIX ) . '%'
			)
		);

		if ( ! is_array( $rows ) ) {
			return;
		}

		foreach ( $rows as $option_name ) {
			$name = (string) $option_name;
			if ( 0 === strpos( $name, '_transient_timeout_' . self::PREFIX ) ) {
				delete_option( $name );
				continue;
			}
			if ( 0 === strpos( $name, '_transient_' . self::PREFIX ) ) {
				$key = substr( $name, strlen( '_transient_' ) );
				delete_transient( $key );
			}
		}
	}

	/**
	 * Build cache key from request parts.
	 *
	 * @param string $kind index|post_type|taxonomy
	 * @param string $slug Slug.
	 * @param int    $page Page number.
	 */
	public static function cache_key( string $kind, string $slug = '', int $page = 1 ): string {
		$config = Neo_Pulse_Wp_Sitemap_Settings::get_config();
		$hash   = md5( (string) wp_json_encode( $config ) );
		return sanitize_key( $kind . '_' . $slug . '_' . $page . '_' . $hash );
	}
}
