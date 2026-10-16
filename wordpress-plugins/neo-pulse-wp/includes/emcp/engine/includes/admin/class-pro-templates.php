<?php
/**
 * Fetches and caches the premium templates library from emcptools.com.
 *
 * Mirror of class-pro-prompts.php for templates. Same auth flow, different
 * endpoint and bundle shape. Each template's `data` field is an Elementor
 * element tree that can be imported into a new or existing page.
 *
 * @package EMCP_Tools
 * @since   1.7.1
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Premium templates service.
 *
 * @since 1.7.1
 */
class EMCP_Tools_Pro_Templates {

	/**
	 * Transient marking the stored bundle fresh. It holds the fetch time, not
	 * the bundle: 3.19 and earlier stored the whole library here, one row of
	 * about 8 MB that hosts with a small max_allowed_packet (or a 1 MB object
	 * cache item limit) silently refused, so every screen load downloaded it
	 * again. Read the library through get_bundle() or cached_bundle().
	 *
	 * @var string
	 */
	const CACHE_KEY = 'emcp_tools_pro_templates_bundle';

	/**
	 * Option holding the manifest of the stored library: chunk count, an md5 of
	 * the joined chunks and the fetch time. Non-autoloaded.
	 *
	 * @var string
	 */
	const STORE_KEY = 'emcp_tools_pro_templates_store';

	/**
	 * Prefix of the non-autoloaded options holding the library's JSON, one
	 * CHUNK_SIZE slice each (CHUNK_KEY . 0, 1, ...).
	 *
	 * @var string
	 */
	const CHUNK_KEY = 'emcp_tools_pro_templates_chunk_';

	/**
	 * Bytes per chunk: well under a 1 MB max_allowed_packet and a 1 MB object
	 * cache item.
	 *
	 * @var int
	 */
	const CHUNK_SIZE = 524288;

	/**
	 * Transient TTL in seconds. 24 hours.
	 *
	 * @var int
	 */
	const CACHE_TTL = 86400;

	/**
	 * Default endpoint. Filterable via `emcp_tools_pro_templates_endpoint`.
	 *
	 * @var string
	 */
	const DEFAULT_ENDPOINT = 'https://emcptools.com/api/emcp/templates.json';

	/**
	 * Transient remembering a failed fetch for FAILURE_TTL seconds, so a site
	 * whose sync is failing does not make a blocking remote call on every
	 * request. A manual sync ignores and clears it.
	 *
	 * @var string
	 */
	const FAILURE_KEY = 'emcp_tools_pro_templates_fetch_failed';

	/**
	 * @var int
	 */
	const FAILURE_TTL = 300;

	/**
	 * Whether the current site can access premium templates.
	 *
	 * @since 1.7.1
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
	 * Get the templates bundle. Returns cached copy when available.
	 *
	 * Bundle shape:
	 *   [
	 *     'fetched_at' => int,
	 *     'categories' => [
	 *       [
	 *         'slug'      => 'hero-sections',
	 *         'label'     => 'Hero Sections',
	 *         'templates' => [
	 *           [
	 *             'slug'          => 'bakery-hero',
	 *             'title'         => 'Bakery Hero',
	 *             'description'   => '...',
	 *             'thumbnail_url' => 'https://...' (optional),
	 *             'data'          => [ ... Elementor elements ... ],
	 *           ],
	 *         ],
	 *       ],
	 *     ],
	 *   ]
	 *
	 * @since 1.7.1
	 *
	 * @param bool $force_refresh Bypass the local cache.
	 * @return array|WP_Error
	 */
	public static function get_bundle( bool $force_refresh = false ) {
		if ( ! self::user_has_access() ) {
			return new WP_Error( 'no_license', __( 'A valid Neo EMCP license is required to access premium templates.', 'emcp-tools' ) );
		}

		if ( ! $force_refresh ) {
			list( $local, $fresh ) = self::local();
			if ( $fresh ) {
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
	 * Find a specific template by its category and slug. Returns the template
	 * entry (with the `data` array) or null if not found.
	 *
	 * @since 1.7.1
	 *
	 * @param string $category_slug
	 * @param string $template_slug
	 * @return array|null
	 */
	public static function find_template( string $category_slug, string $template_slug ): ?array {
		$bundle = self::get_bundle();
		if ( is_wp_error( $bundle ) || ! is_array( $bundle ) ) {
			return null;
		}
		foreach ( $bundle['categories'] ?? array() as $category ) {
			if ( ( $category['slug'] ?? '' ) !== $category_slug ) {
				continue;
			}
			foreach ( $category['templates'] ?? array() as $template ) {
				if ( ( $template['slug'] ?? '' ) === $template_slug ) {
					return $template;
				}
			}
		}
		return null;
	}

	/**
	 * Hit the remote endpoint, validate the response, store it in cache.
	 *
	 * @since 1.7.1
	 *
	 * @return array|WP_Error
	 */
	private static function fetch_remote_bundle() {
		$license_key = self::get_license_key();
		$license_id  = self::get_license_id();
		if ( '' === $license_key || '' === $license_id ) {
			return new WP_Error( 'no_license_key', __( 'No active Neo EMCP license was found on this site.', 'emcp-tools' ) );
		}

		$endpoint = apply_filters( 'emcp_tools_pro_templates_endpoint', self::DEFAULT_ENDPOINT );

		$response = wp_remote_get(
			$endpoint,
			array(
				'timeout' => 12,
				'headers' => array(
					'Accept'                => 'application/json',
					'Authorization'         => 'Bearer ' . $license_key,
					'X-EMCP-License-Id'     => $license_id,
					'X-EMCP-Site'           => home_url(),
					'X-EMCP-Plugin-Version' => EMCP_TOOLS_VERSION,
				),
			)
		);

		if ( is_wp_error( $response ) ) {
			return $response;
		}

		$code = (int) wp_remote_retrieve_response_code( $response );

		if ( 403 === $code ) {
			return new WP_Error(
				'forbidden',
				__( 'Premium Templates are unavailable on this site. Make sure your Neo EMCP license is active and this site is on its activated-sites list. Contact support if the issue persists.', 'emcp-tools' )
			);
		}

		if ( 429 === $code ) {
			return new WP_Error(
				'rate_limited',
				__( 'Premium Templates endpoint is rate-limiting this site. Try again in a few minutes.', 'emcp-tools' )
			);
		}

		if ( 200 !== $code ) {
			return new WP_Error(
				'remote_error',
				sprintf(
					/* translators: %d: HTTP status code */
					__( 'Templates endpoint returned HTTP %d. Please try again later or contact support.', 'emcp-tools' ),
					$code
				)
			);
		}

		$body   = wp_remote_retrieve_body( $response );
		$bundle = json_decode( $body, true );

		if ( ! is_array( $bundle ) || ! isset( $bundle['categories'] ) || ! is_array( $bundle['categories'] ) ) {
			return new WP_Error( 'invalid_payload', __( 'Templates endpoint returned an unexpected payload.', 'emcp-tools' ) );
		}

		$bundle['fetched_at'] = time();
		if ( self::save( $bundle ) ) {
			set_transient( self::CACHE_KEY, $bundle['fetched_at'], self::CACHE_TTL );
		} else {
			// Back off like a failed fetch, so each screen load does not download it again.
			set_transient( self::FAILURE_KEY, __( 'The templates library was downloaded but could not be saved on this site. Try again in a few minutes.', 'emcp-tools' ), self::FAILURE_TTL );
		}

		return $bundle;
	}

	/**
	 * Returns the active license key from Freemius, or empty string.
	 *
	 * @since 1.7.1
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
	 *
	 * @since 1.7.1
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
	 * Clear the cached bundle.
	 *
	 * @since 1.7.1
	 */
	public static function flush_cache(): void {
		delete_transient( self::CACHE_KEY );
	}

	/**
	 * The last stored library, fresh or not, without any remote call; null when
	 * none is stored. For the command palette and the stats counts.
	 *
	 * @since 3.20.0
	 */
	public static function cached_bundle(): ?array {
		return self::local()[0];
	}

	/**
	 * The stored library and whether it is still fresh.
	 *
	 * @return array{0: ?array, 1: bool}
	 */
	private static function local(): array {
		$marker = get_transient( self::CACHE_KEY );
		// 3.19 and earlier kept the whole library in the transient.
		if ( is_array( $marker ) && isset( $marker['categories'] ) && is_array( $marker['categories'] ) ) {
			return array( $marker, true );
		}
		$bundle = self::read_store();
		return array( $bundle, null !== $bundle && false !== $marker && ! is_array( $marker ) );
	}

	/** The library from its chunks, or null when missing, incomplete or changed. */
	private static function read_store(): ?array {
		$manifest = get_option( self::STORE_KEY );
		if ( ! is_array( $manifest ) || empty( $manifest['chunks'] ) || ! is_string( $manifest['hash'] ?? null ) ) {
			return null;
		}
		$json = '';
		for ( $i = 0; $i < (int) $manifest['chunks']; $i++ ) {
			$part = get_option( self::CHUNK_KEY . $i );
			if ( ! is_string( $part ) ) {
				return null;
			}
			$json .= $part;
		}
		if ( ! hash_equals( $manifest['hash'], md5( $json ) ) ) {
			return null;
		}
		$bundle = json_decode( $json, true );
		return is_array( $bundle ) && isset( $bundle['categories'] ) && is_array( $bundle['categories'] ) ? $bundle : null;
	}

	/**
	 * Stores the library as JSON in CHUNK_SIZE slices, then the manifest that
	 * names them. JSON escapes every non-ASCII character, so a slice never
	 * splits a UTF-8 sequence. A save cut short leaves a manifest whose hash
	 * no longer matches, which reads as no library.
	 *
	 * @param array $bundle Validated bundle.
	 * @return bool Whether the whole library was stored.
	 */
	private static function save( array $bundle ): bool {
		$json = wp_json_encode( $bundle );
		if ( ! is_string( $json ) || '' === $json ) {
			return false;
		}
		$old    = get_option( self::STORE_KEY );
		$chunks = str_split( $json, self::CHUNK_SIZE );
		foreach ( $chunks as $i => $part ) {
			$key = self::CHUNK_KEY . $i;
			if ( ! update_option( $key, $part, false ) && get_option( $key ) !== $part ) {
				delete_option( self::STORE_KEY );
				return false;
			}
		}
		$manifest = array(
			'chunks'     => count( $chunks ),
			'hash'       => md5( $json ),
			'fetched_at' => (int) ( $bundle['fetched_at'] ?? 0 ),
		);
		if ( ! update_option( self::STORE_KEY, $manifest, false ) && get_option( self::STORE_KEY ) !== $manifest ) {
			return false;
		}
		for ( $i = count( $chunks ); $i < (int) ( is_array( $old ) ? ( $old['chunks'] ?? 0 ) : 0 ); $i++ ) {
			delete_option( self::CHUNK_KEY . $i );
		}
		return true;
	}

	/**
	 * Apply a template to a target page (existing or new).
	 *
	 * Creates a new Elementor-enabled page if $target_post_id is 0, otherwise
	 * replaces the target page's Elementor data with the template's data.
	 *
	 * @since 1.7.1
	 *
	 * @param string $category_slug
	 * @param string $template_slug
	 * @param int    $target_post_id  0 to create a new page; otherwise an existing post ID.
	 * @return array|WP_Error { post_id, edit_url, view_url, action: 'created'|'replaced' }
	 */
	public static function apply_template( string $category_slug, string $template_slug, int $target_post_id ) {
		$template = self::find_template( $category_slug, $template_slug );
		if ( ! $template || empty( $template['data'] ) || ! is_array( $template['data'] ) ) {
			return new WP_Error( 'template_not_found', __( 'Template not found in the cached bundle. Try clicking Sync Library first.', 'emcp-tools' ) );
		}

		$elementor_data = $template['data'];

		if ( $target_post_id > 0 ) {
			$post = get_post( $target_post_id );
			if ( ! $post ) {
				return new WP_Error( 'post_not_found', __( 'The target page no longer exists.', 'emcp-tools' ) );
			}
			if ( ! current_user_can( 'edit_post', $target_post_id ) ) {
				return new WP_Error( 'forbidden', __( 'You do not have permission to edit that page.', 'emcp-tools' ) );
			}
			$post_id = $target_post_id;
			$action  = 'replaced';
		} else {
			if ( ! current_user_can( 'edit_pages' ) ) {
				return new WP_Error( 'forbidden', __( 'You do not have permission to create pages.', 'emcp-tools' ) );
			}
			$post_id = wp_insert_post(
				array(
					'post_title'  => class_exists( 'EMCP_Tools_Admin_Templates_Data' )
						? EMCP_Tools_Admin_Templates_Data::title( $template )
						: ( isset( $template['title'] ) ? (string) $template['title'] : __( 'Untitled Template', 'emcp-tools' ) ),
					'post_type'   => 'page',
					'post_status' => 'draft',
				),
				true
			);
			if ( is_wp_error( $post_id ) ) {
				return $post_id;
			}
			$action = 'created';
		}

		// Persist the Elementor element tree. wp_slash() so backslashes inside
		// the template content (rare but possible) don't get stripped by
		// update_post_meta().
		update_post_meta( $post_id, '_elementor_data', wp_slash( wp_json_encode( $elementor_data ) ) );
		update_post_meta( $post_id, '_elementor_edit_mode', 'builder' );
		update_post_meta( $post_id, '_elementor_template_type', 'wp-page' );

		// Page-level settings (background, padding, hide_title, etc.) when the
		// template ships them — common in Elementor's native exports.
		if ( ! empty( $template['page_settings'] ) && is_array( $template['page_settings'] ) ) {
			update_post_meta( $post_id, '_elementor_page_settings', $template['page_settings'] );
		}

		// Trigger Elementor's CSS regeneration if available.
		if ( class_exists( '\Elementor\Plugin' ) && isset( \Elementor\Plugin::$instance->files_manager ) ) {
			\Elementor\Plugin::$instance->files_manager->clear_cache();
		}

		$edit_url = admin_url( 'post.php?post=' . $post_id . '&action=elementor' );
		$view_url = get_permalink( $post_id );

		return array(
			'post_id'  => $post_id,
			'edit_url' => $edit_url,
			'view_url' => $view_url ? $view_url : '',
			'action'   => $action,
		);
	}

	/**
	 * Import a template into Elementor's Saved Templates library.
	 *
	 * Creates an `elementor_library` CPT post — the same post type Elementor
	 * itself uses for templates saved via the editor's "Save as Template"
	 * action. After import, the template is visible at
	 * Elementor → Templates → Saved Templates and insertable from the
	 * editor's "Add Template" picker on any page.
	 *
	 * @since 1.7.1
	 *
	 * @param string $category_slug
	 * @param string $template_slug
	 * @return array|WP_Error { template_id, edit_url, library_url }
	 */
	public static function import_to_library( string $category_slug, string $template_slug ) {
		$template = self::find_template( $category_slug, $template_slug );
		if ( ! $template || empty( $template['data'] ) || ! is_array( $template['data'] ) ) {
			return new WP_Error( 'template_not_found', __( 'Template not found in the cached bundle. Try clicking Sync Library first.', 'emcp-tools' ) );
		}

		if ( ! current_user_can( 'edit_posts' ) ) {
			return new WP_Error( 'forbidden', __( 'You do not have permission to import templates.', 'emcp-tools' ) );
		}

		if ( ! post_type_exists( 'elementor_library' ) ) {
			return new WP_Error( 'no_library', __( 'Elementor template library post type is not available. Make sure Elementor is active.', 'emcp-tools' ) );
		}

		$title = isset( $template['title'] ) ? (string) $template['title'] : __( 'Untitled Template', 'emcp-tools' );

		$post_id = wp_insert_post(
			array(
				'post_title'  => $title,
				'post_type'   => 'elementor_library',
				'post_status' => 'publish',
			),
			true
		);
		if ( is_wp_error( $post_id ) ) {
			return $post_id;
		}

		// Tell Elementor this is a page-type template (full page layout).
		// Other valid types: 'section', 'widget'. Theme-builder types
		// require Elementor Pro.
		wp_set_object_terms( $post_id, 'page', 'elementor_library_type' );

		update_post_meta( $post_id, '_elementor_data', wp_slash( wp_json_encode( $template['data'] ) ) );
		update_post_meta( $post_id, '_elementor_edit_mode', 'builder' );
		update_post_meta( $post_id, '_elementor_template_type', 'page' );

		if ( ! empty( $template['page_settings'] ) && is_array( $template['page_settings'] ) ) {
			update_post_meta( $post_id, '_elementor_page_settings', $template['page_settings'] );
		}

		// Trigger Elementor's CSS regeneration if available.
		if ( class_exists( '\Elementor\Plugin' ) && isset( \Elementor\Plugin::$instance->files_manager ) ) {
			\Elementor\Plugin::$instance->files_manager->clear_cache();
		}

		return array(
			'template_id' => $post_id,
			'edit_url'    => admin_url( 'post.php?post=' . $post_id . '&action=elementor' ),
			'library_url' => admin_url( 'edit.php?post_type=elementor_library' ),
		);
	}
}
