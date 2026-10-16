<?php
/**
 * Keep crawlers on valuable URLs: core pages, posts, service areas, and work.
 *
 * @package Neo_Pulse_Wp
 */

defined( 'ABSPATH' ) || exit;

/**
 * noindex + attachment redirects for pagination, archives, templates, and media pages.
 */
class Neo_Pulse_Wp_Index_Rules {

	/**
	 * Builder/template CPTs that must not be indexed.
	 *
	 * @return array<int, string>
	 */
	public static function template_post_types(): array {
		return Neo_Pulse_Wp_Seo_Settings::excluded_post_types();
	}

	/**
	 * @return array<int, string>
	 */
	public static function noindex_post_types(): array {
		return array_merge( array( 'attachment' ), self::template_post_types() );
	}

	/**
	 * @return array<int, string>
	 */
	public static function noindex_taxonomies(): array {
		return array_values( array_unique( array_merge( array( 'post_tag' ), Neo_Pulse_Wp_Seo_Settings::excluded_taxonomies() ) ) );
	}

	/**
	 * @return array<int, string>
	 */
	public static function noindex_page_slugs(): array {
		return array( 'thank-you' );
	}

	public static function init(): void {
		add_filter( 'wp_robots', array( __CLASS__, 'filter_robots' ), 99 );
		add_action( 'send_headers', array( __CLASS__, 'send_noindex_header' ), 0 );
		add_action( 'template_redirect', array( __CLASS__, 'redirect_attachment_pages' ), 0 );
	}

	/**
	 * Elementor Loop Grid / Loop Carousel pagination (?e-page-{id}=N).
	 *
	 * @param array<string, mixed>|null $query Query args. Defaults to $_GET.
	 */
	public static function request_has_elementor_epage( ?array $query = null ): bool {
		$query = $query ?? ( isset( $_GET ) && is_array( $_GET ) ? $_GET : array() );
		foreach ( array_keys( $query ) as $key ) {
			if ( is_string( $key ) && strncmp( $key, 'e-page-', 7 ) === 0 ) {
				return true;
			}
		}
		return false;
	}

	/**
	 * @param array<string, mixed> $robots Robots directives.
	 * @return array<string, mixed>
	 */
	public static function filter_robots( $robots ): array {
		if ( ! is_array( $robots ) ) {
			$robots = array();
		}
		// Neo Pulse SEO (SEO Settings) or another SEO plugin sets robots per page type itself; only the
		// Elementor pagination rule applies on top. These built-in rules are for sites with neither.
		if ( self::seo_handled_elsewhere() ? ! self::request_has_elementor_epage() : ! self::should_noindex() ) {
			return $robots;
		}
		$robots['noindex'] = true;
		$robots['follow']  = true;
		unset( $robots['index'] );
		return $robots;
	}

	public static function should_noindex(): bool {
		if ( is_admin() || wp_doing_ajax() || wp_doing_cron() ) {
			return false;
		}
		if ( self::request_has_elementor_epage() ) {
			return true;
		}
		if ( is_search() || is_author() || is_date() || is_attachment() || is_feed() || is_404() ) {
			return true;
		}
		if ( is_paged() ) {
			return true;
		}
		if ( is_tag() ) {
			return true;
		}
		foreach ( self::noindex_taxonomies() as $taxonomy ) {
			if ( function_exists( 'is_tax' ) && is_tax( $taxonomy ) ) {
				return true;
			}
		}
		if ( is_singular( self::noindex_post_types() ) ) {
			return true;
		}
		if ( is_singular( 'page' ) ) {
			$slug = get_post_field( 'post_name', get_queried_object_id() );
			if ( in_array( (string) $slug, self::noindex_page_slugs(), true ) ) {
				return true;
			}
		}
		return false;
	}

	public static function send_noindex_header(): void {
		if ( ! self::request_has_elementor_epage() ) {
			return;
		}
		if ( ! headers_sent() ) {
			header( 'X-Robots-Tag: noindex, follow', false );
		}
	}

	/**
	 * Whether NEO Pulse SEO is live or another SEO plugin (Rank Math, Yoast…) is active.
	 */
	public static function seo_handled_elsewhere(): bool {
		if ( ! class_exists( 'Neo_Pulse_Wp_Seo_Settings', false ) ) {
			return false;
		}
		return Neo_Pulse_Wp_Seo_Settings::output_active() || Neo_Pulse_Wp_Seo_Settings::other_seo_plugin() !== '';
	}

	/**
	 * Attachment pages go to the post they belong to. When the site ran Rank Math, its "Redirect
	 * Attachments" setting decides: off leaves attachment pages alone; on sends orphans to its
	 * "Redirect Orphan Attachments" address. Without Rank Math settings: parent, else the file.
	 */
	public static function redirect_attachment_pages(): void {
		// Other SEO plugins have their own attachment redirect setting.
		if ( ! is_attachment() || Neo_Pulse_Wp_Seo_Settings::other_seo_plugin() !== '' ) {
			return;
		}
		$rm_setting = Neo_Pulse_Wp_Seo_Settings::gen( 'attachment_redirect_urls', null );
		if ( null !== $rm_setting && ! Neo_Pulse_Wp_Seo_Settings::on( $rm_setting ) ) {
			return;
		}
		$id     = (int) get_queried_object_id();
		$parent = $id > 0 ? (int) wp_get_post_parent_id( $id ) : 0;
		if ( $parent > 0 ) {
			$url = get_permalink( $parent );
		} elseif ( null !== $rm_setting ) {
			$url = trim( (string) Neo_Pulse_Wp_Seo_Settings::gen( 'attachment_redirect_default', '' ) );
			$url = $url !== '' ? $url : home_url( '/' );
		} else {
			$url = wp_get_attachment_url( $id );
		}
		if ( ! is_string( $url ) || $url === '' ) {
			return;
		}
		// The file URL or the configured address may be on another host (CDN), which
		// wp_safe_redirect() would refuse; allow http(s) only.
		$url = esc_url_raw( $url, array( 'http', 'https' ) );
		if ( $url === '' ) {
			return;
		}
		// phpcs:ignore WordPress.Security.SafeRedirect.wp_redirect_wp_redirect
		wp_redirect( $url, 301, 'NEO Pulse WP' );
		exit;
	}
}
