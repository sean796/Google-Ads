<?php
/**
 * Fetches and caches the premium prompts library from emcptools.com.
 *
 * The prompt content lives on the server, not in the plugin zip. The plugin
 * sends the active Freemius license key via Authorization header to a
 * license-gated endpoint; the server validates the entitlement with
 * Freemius and returns the full bundle, which the plugin caches for 24 hours.
 *
 * @package EMCP_Tools
 * @since   1.7.0
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Premium prompts service.
 *
 * @since 1.7.0
 */
class EMCP_Tools_Pro_Prompts {

	/**
	 * Transient marking the stored bundle fresh. It holds the sync time, not the
	 * bundle (3.19 and earlier stored a second copy here). Read the library
	 * through get_bundle() or cached_bundle().
	 *
	 * @var string
	 */
	const CACHE_KEY = 'emcp_tools_pro_prompts_bundle';

	/**
	 * Transient TTL in seconds. 24 hours.
	 *
	 * @var int
	 */
	const CACHE_TTL = 86400;

	/**
	 * Durable option holding the last successful bundle, the only copy. The
	 * transient is just a 24h freshness marker that can expire or be evicted
	 * (object cache); this option never expires, so the Prompts count + tab keep
	 * showing the last synced library instead of resetting to the bundled
	 * fallback. Stored non-autoloaded (it can be large).
	 *
	 * @var string
	 */
	const STORE_KEY = 'emcp_tools_pro_prompts_store';

	/**
	 * Strong ETag for the durable bundle, stored separately from bundle data.
	 *
	 * @var string
	 */
	const ETAG_KEY = 'emcp_tools_pro_prompts_etag';

	/**
	 * Transient remembering a failed fetch for FAILURE_TTL seconds, so a site
	 * whose sync is failing does not make a blocking remote call on every
	 * request. A manual sync ignores and clears it.
	 *
	 * @var string
	 */
	const FAILURE_KEY = 'emcp_tools_pro_prompts_fetch_failed';

	/**
	 * @var int
	 */
	const FAILURE_TTL = 300;

	/**
	 * Current remote bundle schema understood by this client.
	 *
	 * @var int
	 */
	const SCHEMA_VERSION = 1;

	/**
	 * Cron hook that re-fetches the bundle in the background when the transient
	 * is stale, so an expired cache self-heals without a manual "Sync Library".
	 *
	 * @var string
	 */
	const REFRESH_HOOK = 'emcp_tools_refresh_pro_prompts';

	/**
	 * Default endpoint that serves the prompts bundle. Filterable via
	 * `emcp_tools_pro_prompts_endpoint` for staging / local testing.
	 *
	 * @var string
	 */
	const DEFAULT_ENDPOINT = 'https://emcptools.com/api/emcp/prompts.json';

	/**
	 * Bundled legacy (v1) prompt archive, relative to the Pro root. Resolved
	 * dual-root by EMCP_Tools_Pro_Loader::path(); premium builds overlay
	 * pro/assets/ onto assets/.
	 *
	 * @var string
	 */
	const V1_ZIP_REL = 'assets/emcp-prompts-v1.zip';

	/**
	 * Filename offered to the browser for the legacy archive.
	 *
	 * @var string
	 */
	const V1_ZIP_FILENAME = 'emcp-prompts-v1.zip';

	/**
	 * admin-post action name for the legacy archive download.
	 *
	 * @var string
	 */
	const V1_DOWNLOAD_ACTION = 'emcp_tools_download_prompts_v1';

	/**
	 * Whether the current site can access premium prompts.
	 *
	 * @since 1.7.0
	 *
	 * @return bool
	 */
	public static function user_has_access(): bool {
		if ( ! function_exists( 'emcp_tools_fs' ) ) {
			return false;
		}
		return emcp_tools_fs()->can_use_premium_code();
	}

	/**
	 * Get the prompts bundle. Returns the cached copy when available.
	 *
	 * Bundle structure:
	 * [
	 *   'fetched_at' => int (unix timestamp),
	 *   'categories' => [
	 *     [
	 *       'slug'    => 'food-dining',
	 *       'label'   => 'Food & Dining',
	 *       'prompts' => [
	 *         [
	 *           'slug'        => 'bakery',
	 *           'title'       => 'Bakery',
	 *           'description' => 'Warm, charming landing page for an artisan bakery.',
	 *           'content'     => '<full markdown body>',
	 *         ],
	 *         ...
	 *       ],
	 *     ],
	 *     ...
	 *   ],
	 * ]
	 *
	 * @since 1.7.0
	 *
	 * @param bool $force_refresh Bypass the local cache.
	 * @return array|WP_Error Bundle on success, WP_Error on failure.
	 */
	public static function get_bundle( bool $force_refresh = false ) {
		if ( ! self::user_has_access() ) {
			return new WP_Error( 'no_license', __( 'A valid Neo EMCP license is required to access premium prompts.', 'emcp-tools' ) );
		}

		if ( ! $force_refresh ) {
			// A stale library is served right away and refreshed in the
			// background, so the library + counts never reset while it is cold.
			list( $local, $fresh ) = self::local();
			if ( null !== $local ) {
				if ( ! $fresh ) {
					self::maybe_schedule_refresh();
				}
				return $local;
			}
		}

		if ( $force_refresh ) {
			delete_transient( self::FAILURE_KEY );
		} else {
			$failed = get_transient( self::FAILURE_KEY );
			if ( is_string( $failed ) && '' !== $failed ) {
				return new WP_Error( 'fetch_failed_recently', $failed );
			}
		}

		$bundle = self::fetch_remote_bundle();
		if ( is_wp_error( $bundle ) ) {
			set_transient( self::FAILURE_KEY, $bundle->get_error_message(), self::FAILURE_TTL );
		}
		return $bundle;
	}

	/**
	 * Hit the remote endpoint, validate the response, store it in the
	 * local cache.
	 *
	 * @since 1.7.0
	 *
	 * @return array|WP_Error
	 */
	private static function fetch_remote_bundle( bool $allow_conditional = true ) {
		$license_key = self::get_license_key();
		$license_id  = self::get_license_id();
		if ( '' === $license_key || '' === $license_id ) {
			return new WP_Error( 'no_license_key', __( 'No active Neo EMCP license was found on this site.', 'emcp-tools' ) );
		}

		$endpoint = apply_filters( 'emcp_tools_pro_prompts_endpoint', self::DEFAULT_ENDPOINT );

		// Auth + site/version metadata travel in headers, never the URL. License
		// keys are credentials — query strings get logged by every proxy in the
		// chain (server access log, Dokploy log, intermediate CDN, browser
		// history). Authorization headers don't.
		//
		// X-EMCP-License-Id carries the numeric Freemius license ID. The
		// server uses it to route to the correct Freemius API endpoint
		// (/v1/plugins/{plugin_id}/licenses/{license_id}.json) and passes
		// the Authorization-header license key as a verification query
		// parameter. Freemius's API does NOT accept the license key as the
		// path segment — it expects the integer ID there.
		$stored  = get_option( self::STORE_KEY );
		$headers = self::request_headers(
			$license_key,
			$license_id,
			is_array( $stored ) ? $stored : array(),
			$allow_conditional
		);

		$response = wp_remote_get(
			$endpoint,
			array(
				'timeout'             => 12,
				'limit_response_size' => 2 * 1024 * 1024,
				'headers'             => $headers,
			)
		);

		if ( is_wp_error( $response ) ) {
			return $response;
		}

		$code = (int) wp_remote_retrieve_response_code( $response );

		if ( 304 === $code ) {
			if ( is_array( $stored ) && self::is_valid_bundle( $stored ) ) {
				$stored['synced_at'] = time();
				self::save( $stored );
				return $stored;
			}

			// A stale ETag without its matching body is locally inconsistent.
			// Clear it and retry once without a conditional header.
			if ( $allow_conditional ) {
				delete_option( self::ETAG_KEY );
				return self::fetch_remote_bundle( false );
			}
		}

		// The server returns a uniform 403 for every auth failure (bad license,
		// site not activated, expired, etc.) to avoid leaking which condition
		// triggered the rejection. Don't try to be clever inferring the cause
		// from the response — show a single message and let the support flow
		// handle diagnosis.
		if ( 403 === $code ) {
			return new WP_Error(
				'forbidden',
				__( 'Premium Prompts are unavailable on this site. Make sure your Neo EMCP license is active and this site is on its activated-sites list. Contact support if the issue persists.', 'emcp-tools' )
			);
		}

		if ( 429 === $code ) {
			return new WP_Error(
				'rate_limited',
				__( 'Premium Prompts endpoint is rate-limiting this site. Try again in a few minutes.', 'emcp-tools' )
			);
		}

		if ( 200 !== $code ) {
			return new WP_Error(
				'remote_error',
				sprintf(
					/* translators: %d: HTTP status code */
					__( 'Prompts endpoint returned HTTP %d. Please try again later or contact support.', 'emcp-tools' ),
					$code
				)
			);
		}

		$body   = wp_remote_retrieve_body( $response );
		$bundle = json_decode( $body, true );

		if ( ! self::is_valid_bundle( $bundle ) ) {
			return new WP_Error( 'invalid_payload', __( 'Prompts endpoint returned an unexpected payload.', 'emcp-tools' ) );
		}

		$bundle['synced_at'] = time();
		// The ETag must describe the stored body, or a later 304 would revive an older one.
		$etag = self::save( $bundle ) ? self::etag_for_bundle( $bundle, wp_remote_retrieve_header( $response, 'etag' ) ) : '';
		if ( '' !== $etag ) {
			update_option( self::ETAG_KEY, $etag, false );
		} else {
			delete_option( self::ETAG_KEY );
		}

		return $bundle;
	}

	/**
	 * Build request headers, adding conditional and installation metadata when
	 * the matching local values are trustworthy.
	 *
	 * @param string $license_key       Freemius license secret.
	 * @param string $license_id        Numeric Freemius license ID.
	 * @param array  $stored            Durable cached bundle.
	 * @param bool   $allow_conditional Whether If-None-Match may be sent.
	 * @return array<string,string>
	 */
	private static function request_headers( string $license_key, string $license_id, array $stored, bool $allow_conditional ): array {
		$headers = array(
			'Accept'                => 'application/json',
			'Authorization'         => 'Bearer ' . $license_key,
			'X-EMCP-License-Id'     => $license_id,
			'X-EMCP-Site'           => home_url(),
			'X-EMCP-Plugin-Version' => EMCP_TOOLS_VERSION,
		);

		$install_id = self::get_install_id();
		if ( '' !== $install_id ) {
			$headers['X-EMCP-Install-Id'] = $install_id;
		}

		$etag = self::normalize_etag( get_option( self::ETAG_KEY, '' ) );
		if ( $allow_conditional && '' !== $etag && self::is_valid_bundle( $stored ) ) {
			$headers['If-None-Match'] = $etag;
		}

		return $headers;
	}

	/**
	 * Validate structure and, for schema-v1 bundles, verify content integrity.
	 * Legacy unversioned bundles remain readable during upgrade.
	 *
	 * @param mixed $bundle Candidate bundle.
	 * @return bool
	 */
	private static function is_valid_bundle( $bundle ): bool {
		if ( ! is_array( $bundle ) || empty( $bundle['categories'] ) || ! is_array( $bundle['categories'] ) || count( $bundle['categories'] ) > 100 ) {
			return false;
		}

		$category_slugs = array();
		$prompt_slugs   = array();
		$prompt_count   = 0;

		foreach ( $bundle['categories'] as $category ) {
			if (
				! is_array( $category ) ||
				empty( $category['slug'] ) ||
				! is_string( $category['slug'] ) ||
				! preg_match( '/^[a-z0-9]+(?:-[a-z0-9]+)*$/D', $category['slug'] ) ||
				empty( $category['label'] ) ||
				! is_string( $category['label'] ) ||
				empty( $category['prompts'] ) ||
				! is_array( $category['prompts'] ) ||
				count( $category['prompts'] ) > 100 ||
				isset( $category_slugs[ $category['slug'] ] )
			) {
				return false;
			}
			$category_slugs[ $category['slug'] ] = true;

			foreach ( $category['prompts'] as $prompt ) {
				if (
					! is_array( $prompt ) ||
					empty( $prompt['slug'] ) ||
					! is_string( $prompt['slug'] ) ||
					! preg_match( '/^[a-z0-9]+(?:-[a-z0-9]+)*$/D', $prompt['slug'] ) ||
					empty( $prompt['title'] ) ||
					! is_string( $prompt['title'] ) ||
					empty( $prompt['description'] ) ||
					! is_string( $prompt['description'] ) ||
					empty( $prompt['content'] ) ||
					! is_string( $prompt['content'] ) ||
					strlen( $prompt['content'] ) > 200000 ||
					isset( $prompt_slugs[ $prompt['slug'] ] )
				) {
					return false;
				}
				$prompt_slugs[ $prompt['slug'] ] = true;
				++$prompt_count;
			}
		}

		if ( $prompt_count > 1000 ) {
			return false;
		}

		// Legacy bundles predate version/hash metadata. They remain readable, but
		// only schema-v1 responses are eligible for integrity enforcement.
		if ( ! array_key_exists( 'schema_version', $bundle ) ) {
			return true;
		}

		if (
			self::SCHEMA_VERSION !== $bundle['schema_version'] ||
			empty( $bundle['content_hash'] ) ||
			! is_string( $bundle['content_hash'] ) ||
			! preg_match( '/^[a-f0-9]{64}$/D', $bundle['content_hash'] ) ||
			empty( $bundle['bundle_version'] ) ||
			! is_string( $bundle['bundle_version'] ) ||
			! isset( $bundle['built_at'] ) ||
			! is_int( $bundle['built_at'] ) ||
			$bundle['built_at'] < 0
		) {
			return false;
		}

		$encoded = wp_json_encode( $bundle['categories'], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE );
		if ( ! is_string( $encoded ) ) {
			return false;
		}
		$computed_hash = hash( 'sha256', $encoded );

		return hash_equals( $computed_hash, $bundle['content_hash'] ) &&
			hash_equals( substr( $computed_hash, 0, 16 ), $bundle['bundle_version'] );
	}

	/**
	 * Return a safe validator for the next conditional request.
	 *
	 * @param array  $bundle       Validated bundle.
	 * @param string $response_tag ETag returned by the endpoint.
	 * @return string
	 */
	private static function etag_for_bundle( array $bundle, string $response_tag ): string {
		if ( ! empty( $bundle['content_hash'] ) && is_string( $bundle['content_hash'] ) && preg_match( '/^[a-f0-9]{64}$/D', $bundle['content_hash'] ) ) {
			return '"' . $bundle['content_hash'] . '"';
		}
		return self::normalize_etag( $response_tag );
	}

	/**
	 * Accept only single strong/weak SHA-256 ETags to prevent header injection.
	 *
	 * @param mixed $etag Candidate ETag.
	 * @return string
	 */
	private static function normalize_etag( $etag ): string {
		$etag = trim( is_string( $etag ) ? $etag : '' );
		return preg_match( '/^(?:W\/)?"[a-f0-9]{64}"$/Di', $etag ) ? $etag : '';
	}

	/**
	 * Non-blocking prompt count for the admin stats bar. Reads the fresh
	 * transient, else the durable store (scheduling a background refresh), else
	 * 0. Never performs a synchronous HTTP fetch, so it can't slow a page load.
	 *
	 * @since 2.1.0
	 *
	 * @return int
	 */
	public static function cached_count(): int {
		list( $bundle, $fresh ) = self::local();
		if ( ! $fresh ) {
			// Cold or expired: kick off a background refresh (this is only reached
			// in a Pro context); the stored copy keeps the count steady meanwhile.
			self::maybe_schedule_refresh();
		}
		if ( ! is_array( $bundle ) || empty( $bundle['categories'] ) ) {
			return 0;
		}
		$count = 0;
		foreach ( $bundle['categories'] as $category ) {
			if ( ! empty( $category['prompts'] ) && is_array( $category['prompts'] ) ) {
				$count += count( $category['prompts'] );
			}
		}
		return $count;
	}

	/**
	 * Schedules a one-off background refresh (deduped) so an expired cache
	 * self-heals without the user clicking "Sync Library".
	 *
	 * @since 2.1.0
	 */
	public static function maybe_schedule_refresh(): void {
		if ( ! function_exists( 'wp_next_scheduled' ) || wp_next_scheduled( self::REFRESH_HOOK ) ) {
			return;
		}
		wp_schedule_single_event( time() + 30, self::REFRESH_HOOK );
	}

	/**
	 * Returns the active license key from Freemius, or empty string.
	 *
	 * @since 1.7.0
	 *
	 * @return string
	 */
	private static function get_license_key(): string {
		if ( ! function_exists( 'emcp_tools_fs' ) ) {
			return '';
		}
		$license = emcp_tools_fs()->_get_license();
		if ( ! $license || empty( $license->secret_key ) ) {
			return '';
		}
		return (string) $license->secret_key;
	}

	/**
	 * Returns the active license's numeric Freemius ID, or empty string.
	 * The server uses this to route the Freemius API check to the
	 * correct license endpoint (id in path, key in query string).
	 *
	 * @since 1.7.0
	 *
	 * @return string
	 */
	private static function get_license_id(): string {
		if ( ! function_exists( 'emcp_tools_fs' ) ) {
			return '';
		}
		$license = emcp_tools_fs()->_get_license();
		if ( ! $license || empty( $license->id ) ) {
			return '';
		}
		return (string) $license->id;
	}

	/**
	 * Returns the current numeric Freemius installation ID, or empty string.
	 * This gives the API a stable activation identifier in addition to the URL.
	 *
	 * @return string
	 */
	private static function get_install_id(): string {
		if ( ! function_exists( 'emcp_tools_fs' ) ) {
			return '';
		}
		$freemius = emcp_tools_fs();
		if ( ! is_object( $freemius ) || ! method_exists( $freemius, 'get_site' ) ) {
			return '';
		}
		$site = $freemius->get_site();
		if ( ! is_object( $site ) || empty( $site->id ) || ! is_numeric( $site->id ) ) {
			return '';
		}
		return (string) $site->id;
	}

	/**
	 * Clear the cached bundle. Useful from a "Sync now" button or after
	 * the user activates / changes a license.
	 *
	 * @since 1.7.0
	 */
	public static function flush_cache(): void {
		delete_transient( self::CACHE_KEY );
	}

	/**
	 * The last synced library without any remote call or refresh, or null when
	 * none is stored. For the command palette and other instant reads.
	 *
	 * @since 3.20.0
	 */
	public static function cached_bundle(): ?array {
		return self::local()[0];
	}

	/**
	 * The stored library and whether it is still fresh. The library lives only
	 * in STORE_KEY; CACHE_KEY holds the sync time while it is fresh.
	 *
	 * @return array{0: ?array, 1: bool}
	 */
	private static function local(): array {
		$marker = get_transient( self::CACHE_KEY );
		// 3.19 and earlier kept a second copy of the library in the transient.
		if ( is_array( $marker ) && self::is_valid_bundle( $marker ) ) {
			return array( $marker, true );
		}
		$stored = get_option( self::STORE_KEY );
		if ( ! is_array( $stored ) || ! self::is_valid_bundle( $stored ) ) {
			return array( null, false );
		}
		return array( $stored, false !== $marker && ! is_array( $marker ) );
	}

	/**
	 * Stores a synced library and marks it fresh, only once the store holds it.
	 *
	 * @param array $bundle Validated bundle.
	 * @return bool Whether the store holds the bundle.
	 */
	private static function save( array $bundle ): bool {
		if ( ! update_option( self::STORE_KEY, $bundle, false ) && get_option( self::STORE_KEY ) !== $bundle ) {
			return false;
		}
		set_transient( self::CACHE_KEY, (int) ( $bundle['synced_at'] ?? time() ), self::CACHE_TTL );
		return true;
	}

	/**
	 * Register the legacy-prompts download handler. Called from
	 * EMCP_Tools_Pro_Loader::wire_admin_hooks().
	 *
	 * @since 3.2.0
	 */
	public static function register_download(): void {
		add_action( 'admin_post_' . self::V1_DOWNLOAD_ACTION, array( __CLASS__, 'handle_v1_download' ) );
	}

	/**
	 * Absolute path to the bundled v1 prompt archive, or '' when absent.
	 *
	 * The archive ships only in premium builds (pro/assets/, overlaid to
	 * assets/), so this is '' on free installs.
	 *
	 * @since 3.2.0
	 * @return string
	 */
	public static function v1_zip_path(): string {
		if ( ! class_exists( 'EMCP_Tools_Pro_Loader' ) ) {
			return '';
		}
		return EMCP_Tools_Pro_Loader::path( self::V1_ZIP_REL );
	}

	/**
	 * True when the current user may download the v1 archive and it exists.
	 *
	 * @since 3.2.0
	 * @return bool
	 */
	public static function v1_zip_available(): bool {
		return self::user_has_access() && '' !== self::v1_zip_path();
	}

	/**
	 * Nonce-protected admin-post URL for the v1 archive download.
	 *
	 * @since 3.2.0
	 * @return string
	 */
	public static function v1_download_url(): string {
		// wp_nonce_url() HTML-escapes & as &amp; for printing; the Prompts screen
		// sets this URL as an href from JSON, so decode it or _wpnonce never arrives.
		return wp_specialchars_decode(
			wp_nonce_url(
				admin_url( 'admin-post.php?action=' . self::V1_DOWNLOAD_ACTION ),
				self::V1_DOWNLOAD_ACTION
			),
			ENT_QUOTES
		);
	}

	/**
	 * Stream the v1 prompt archive to a licensed administrator.
	 *
	 * The file is never linked directly: it is gated on capability, nonce, and
	 * an active premium license before a single byte is sent.
	 *
	 * @since 3.2.0
	 */
	public static function handle_v1_download(): void {
		if ( ! current_user_can( 'manage_options' ) ) {
			wp_die( esc_html__( 'You do not have permission to download this file.', 'emcp-tools' ), '', array( 'response' => 403 ) );
		}

		check_admin_referer( self::V1_DOWNLOAD_ACTION );

		if ( ! self::user_has_access() ) {
			wp_die( esc_html__( 'An active Neo EMCP license is required to download the legacy prompt library.', 'emcp-tools' ), '', array( 'response' => 403 ) );
		}

		$path = self::v1_zip_path();
		if ( '' === $path ) {
			wp_die( esc_html__( 'The legacy prompt archive is not bundled with this build.', 'emcp-tools' ), '', array( 'response' => 404 ) );
		}

		nocache_headers();
		header( 'Content-Type: application/zip' );
		header( 'Content-Disposition: attachment; filename="' . self::V1_ZIP_FILENAME . '"' );
		header( 'Content-Length: ' . (string) filesize( $path ) );
		header( 'X-Content-Type-Options: nosniff' );

		// phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_readfile -- Streaming a bundled static archive.
		readfile( $path );
		exit;
	}
}
