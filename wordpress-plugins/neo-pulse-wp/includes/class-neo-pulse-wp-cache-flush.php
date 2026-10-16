<?php
/**
 * NEO Pulse + WordPress cache flush (plus NitroPack / WP Engine page-cache purges when present).
 *
 * @package Neo_Pulse_Wp
 */

defined( 'ABSPATH' ) || exit;

/**
 * Clears NEO Pulse disk cache, NEO Pulse transients, and WordPress object cache.
 */
class Neo_Pulse_Wp_Cache_Flush {

	const VERSION_OPTION = 'neo_pulse_wp_cache_flush_version';

	const NOCACHE_UNTIL_OPTION = 'neo_pulse_wp_send_nocache_until';

	/** How long guests get no-cache headers after a flush. */
	const NOCACHE_SECONDS = 120;

	/**
	 * Register front-end no-cache headers after a flush (helps browsers refetch for guests).
	 */
	public static function init(): void {
		add_action( 'template_redirect', array( __CLASS__, 'maybe_send_nocache_headers' ), 0 );
		add_filter( 'style_loader_src', array( __CLASS__, 'append_version_to_neo_pulse_src' ), 999, 2 );
		add_filter( 'script_loader_src', array( __CLASS__, 'append_version_to_neo_pulse_src' ), 999, 2 );
	}

	/**
	 * Full WordPress + NEO Pulse flush. Does not call WP Engine or other host APIs.
	 *
	 * @return array<string, mixed> Summary for admin notices.
	 */
	public static function flush_all(): array {
		$summary = array(
			'transients'      => 0,
			'object_cache'    => false,
			'html_caches'     => array(),
			'flush_version'   => 0,
			'nocache_seconds' => self::NOCACHE_SECONDS,
		);

		if ( class_exists( 'Neo_Pulse_Wp_Sitemap_Cache', false ) ) {
			Neo_Pulse_Wp_Sitemap_Cache::flush_all();
		}

		if ( class_exists( 'Neo_Pulse_Wp_Chat_Rag', false ) && is_callable( array( 'Neo_Pulse_Wp_Chat_Rag', 'invalidate_cache' ) ) ) {
			Neo_Pulse_Wp_Chat_Rag::invalidate_cache();
		}

		if ( class_exists( 'Neo_Pulse_Wp_Gsc', false ) && is_callable( array( 'Neo_Pulse_Wp_Gsc', 'flush_stats_cache' ) ) ) {
			Neo_Pulse_Wp_Gsc::flush_stats_cache();
		}

		$summary['transients'] = self::delete_neo_pulse_transients();

		if ( function_exists( 'wp_cache_flush' ) ) {
			wp_cache_flush();
			$summary['object_cache'] = true;
		}

		if ( function_exists( 'wp_cache_flush_group' ) ) {
			wp_cache_flush_group( 'posts' );
			wp_cache_flush_group( 'post_meta' );
			wp_cache_flush_group( 'themes' );
		}

		$summary['html_caches'] = self::purge_html_caches();

		// Both are read on every front-end request (asset URLs, no-cache window), so they are autoloaded.
		$version = time();
		update_option( self::VERSION_OPTION, $version, true );
		update_option( self::NOCACHE_UNTIL_OPTION, $version + self::NOCACHE_SECONDS, true );
		$summary['flush_version'] = $version;

		/**
		 * After NEO Pulse + WordPress caches are cleared.
		 *
		 * @param array<string, mixed> $summary Flush summary.
		 */
		do_action( 'neo_pulse_wp_cache_flushed', $summary );

		return $summary;
	}

	/**
	 * @return int Bumped on each flush; appended to NEO Pulse asset URLs.
	 */
	public static function version(): int {
		return (int) get_option( self::VERSION_OPTION, 0 );
	}

	/**
	 * @param string $src    Asset URL.
	 * @param string $handle Script/style handle.
	 */
	public static function append_version_to_neo_pulse_src( $src, $handle = '' ) {
		if ( ! is_string( $src ) || '' === $src || ! is_string( $handle ) || strpos( $handle, 'neo-pulse' ) === false ) {
			return $src;
		}
		$ver = self::version();
		if ( $ver < 1 ) {
			return $src;
		}
		return add_query_arg( 'neo-pulse_cv', (string) $ver, $src );
	}

	public static function maybe_send_nocache_headers(): void {
		if ( is_admin() || wp_doing_ajax() || wp_doing_cron() ) {
			return;
		}
		$until = (int) get_option( self::NOCACHE_UNTIL_OPTION, 0 );
		if ( $until < time() ) {
			return;
		}
		nocache_headers();
	}

	/**
	 * Drop HTML page caches (NitroPack and similar) so guests see the latest markup.
	 *
	 * @return array<int, string>
	 */
	public static function purge_html_caches(): array {
		$did = array();

		foreach ( array( 'nitropack_sdk_purge_cache', 'nitropack_purge_cache', 'nitropack_invalidate_cache', 'nitropack_sdk_invalidate_cache' ) as $fn ) {
			if ( function_exists( $fn ) ) {
				$fn();
				$did[] = $fn;
			}
		}
		if ( function_exists( 'do_action' ) ) {
			do_action( 'nitropack_integration_purge_all' );
			do_action( 'nitropack_cache_invalidate' );
			$did[] = 'nitropack_actions';
		}

		$nitro_class = 'NitroPack\\WordPress\\NitroPack';
		if ( class_exists( $nitro_class, false ) && is_callable( array( $nitro_class, 'getInstance' ) ) ) {
			$inst = $nitro_class::getInstance();
			if ( is_object( $inst ) && is_callable( array( $inst, 'getSdk' ) ) ) {
				$sdk = $inst->getSdk();
				if ( is_object( $sdk ) && is_callable( array( $sdk, 'invalidateCache' ) ) ) {
					$sdk->invalidateCache();
					$did[] = 'nitropack_sdk_invalidate';
				}
				if ( is_object( $sdk ) && is_callable( array( $sdk, 'purgeCache' ) ) ) {
					$sdk->purgeCache();
					$did[] = 'nitropack_sdk_purge';
				}
			}
		}

		if ( defined( 'WP_CONTENT_DIR' ) ) {
			$wiped = self::wipe_nitropack_cache_dirs();
			if ( $wiped > 0 ) {
				$did[] = 'nitropack_dirs:' . $wiped;
			}
		}

		if ( class_exists( 'WpeCommon', false ) ) {
			if ( is_callable( array( 'WpeCommon', 'purge_varnish_cache' ) ) ) {
				WpeCommon::purge_varnish_cache();
				$did[] = 'wpe_varnish';
			}
			if ( is_callable( array( 'WpeCommon', 'purge_memcached' ) ) ) {
				WpeCommon::purge_memcached();
				$did[] = 'wpe_memcached';
			}
		}

		return $did;
	}

	/**
	 * @return int NitroPack cache directories removed.
	 */
	private static function wipe_nitropack_cache_dirs(): int {
		$cache = WP_CONTENT_DIR . '/cache';
		if ( ! is_dir( $cache ) ) {
			return 0;
		}
		$wiped = 0;
		$items = scandir( $cache );
		if ( ! is_array( $items ) ) {
			return 0;
		}
		foreach ( $items as $name ) {
			if ( $name === '.' || $name === '..' || stripos( $name, 'nitropack' ) === false ) {
				continue;
			}
			$path = $cache . '/' . $name;
			if ( ! is_dir( $path ) ) {
				continue;
			}
			$it = new RecursiveIteratorIterator(
				new RecursiveDirectoryIterator( $path, FilesystemIterator::SKIP_DOTS ),
				RecursiveIteratorIterator::CHILD_FIRST
			);
			foreach ( $it as $file ) {
				$file->isDir() ? @rmdir( $file->getPathname() ) : @unlink( $file->getPathname() );
			}
			@rmdir( $path );
			++$wiped;
		}
		return $wiped;
	}

	/**
	 * Delete NEO Pulse-related transients (neo_pulse… and the older neo-pulse… keys) from wp_options.
	 */
	public static function delete_neo_pulse_transients(): int {
		global $wpdb;

		if ( ! isset( $wpdb ) ) {
			return 0;
		}

		// esc_like() the literal prefix only, then add the wildcard ('_' and '%' in the prefix stay literal).
		$patterns = array(
			$wpdb->esc_like( '_transient_neo_pulse' ) . '%',
			$wpdb->esc_like( '_transient_timeout_neo_pulse' ) . '%',
			$wpdb->esc_like( '_transient_neo-pulse' ) . '%',
			$wpdb->esc_like( '_transient_timeout_neo-pulse' ) . '%',
		);

		$deleted = 0;
		foreach ( $patterns as $like ) {
			// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching
			$rows = $wpdb->get_col(
				$wpdb->prepare(
					"SELECT option_name FROM {$wpdb->options} WHERE option_name LIKE %s",
					$like
				)
			);
			if ( ! is_array( $rows ) ) {
				continue;
			}
			foreach ( $rows as $option_name ) {
				if ( delete_option( (string) $option_name ) ) {
					++$deleted;
				}
			}
		}

		return $deleted;
	}
}
