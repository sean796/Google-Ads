<?php
/**
 * SEO output settings (titles, descriptions, robots, social and schema defaults).
 *
 * Settings use Rank Math's own key names ("pt_post_title", "robots_global", …) so a site that ran
 * Rank Math can be copied over as-is and the per-post data Rank Math left behind
 * (rank_math_title, rank_math_robots, rank_math_schema_*, …) keeps working without a migration.
 *
 * Until settings are copied, the Rank Math options are read live. Output only happens when the
 * site has switched it on and no other SEO plugin is active.
 *
 * @package Neo_Pulse_Wp
 */

defined( 'ABSPATH' ) || exit;

class Neo_Pulse_Wp_Seo_Settings {

	const OPTION     = 'neo_pulse_wp_seo';
	const RM_TITLES  = 'rank-math-options-titles';
	const RM_GENERAL = 'rank-math-options-general';
	const RM_SITEMAP = 'rank-math-options-sitemap';

	/**
	 * Builder, template and block-editor types that are never SEO content: no SEO settings, no
	 * sitemap by default, noindex in the built-in index rules. One list for all of them.
	 */
	const EXCLUDED_POST_TYPES = array(
		'elementor_library',
		'e-landing-page',
		'e-floating-buttons',
		'ygency_template',
		'qi-addons-template',
		'wp_block',
		'wp_navigation',
	);

	/** Taxonomies that are never SEO content (same idea as EXCLUDED_POST_TYPES). */
	const EXCLUDED_TAXONOMIES = array(
		'post_format',
		'elementor_library_type',
		'elementor_library_category',
	);

	/** @var array<string, mixed>|null */
	private static $raw = null;

	/** @var bool|null */
	private static $output_active = null;

	/**
	 * @return array<string, mixed>
	 */
	public static function raw(): array {
		if ( null === self::$raw ) {
			$value     = get_option( self::OPTION, array() );
			self::$raw = is_array( $value ) ? $value : array();
		}
		return self::$raw;
	}

	public static function flush_cache(): void {
		self::$raw           = null;
		self::$output_active = null;
	}

	/**
	 * Switched on in Neo Pulse → SEO Settings.
	 */
	public static function enabled(): bool {
		$raw = self::raw();
		return ! empty( $raw['enabled'] );
	}

	/**
	 * Settings have been copied into Neo Pulse (from Rank Math or saved on the settings page).
	 */
	public static function has_own(): bool {
		$raw = self::raw();
		return ! empty( $raw['titles'] ) && is_array( $raw['titles'] );
	}

	/**
	 * @return array<string, mixed>
	 */
	public static function titles(): array {
		$raw = self::raw();
		if ( self::has_own() ) {
			return $raw['titles'];
		}
		$rm = get_option( self::RM_TITLES, array() );
		return is_array( $rm ) ? $rm : array();
	}

	/**
	 * @return array<string, mixed>
	 */
	public static function general(): array {
		$raw = self::raw();
		if ( ! empty( $raw['general'] ) && is_array( $raw['general'] ) ) {
			return $raw['general'];
		}
		$rm = get_option( self::RM_GENERAL, array() );
		return is_array( $rm ) ? $rm : array();
	}

	/**
	 * A titles/meta setting, with Rank Math's own defaults for keys that are not stored.
	 *
	 * @param string $key     Rank Math key name.
	 * @param mixed  $default Fallback when neither stored nor defaulted.
	 * @return mixed
	 */
	public static function get( string $key, $default = '' ) {
		// Business details live in the shared option (with Neo Tools) once it exists.
		if ( class_exists( 'Neo_Pulse_Wp_Business', false ) && Neo_Pulse_Wp_Business::handles( $key ) ) {
			return Neo_Pulse_Wp_Business::seo_value( $key );
		}
		$titles = self::titles();
		if ( array_key_exists( $key, $titles ) ) {
			return $titles[ $key ];
		}
		$defaults = self::defaults();
		if ( array_key_exists( $key, $defaults ) ) {
			return $defaults[ $key ];
		}
		if ( preg_match( '/^pt_(.+)_title$/', $key ) ) {
			return '%title% %sep% %sitename%';
		}
		if ( preg_match( '/^pt_(.+)_archive_title$/', $key ) ) {
			return '%title% %page% %sep% %sitename%';
		}
		if ( preg_match( '/^pt_(.+)_description$/', $key ) ) {
			return '%excerpt%';
		}
		if ( preg_match( '/^tax_(.+)_title$/', $key ) ) {
			return '%term% %sep% %sitename%';
		}
		if ( preg_match( '/^tax_(.+)_description$/', $key ) ) {
			return '%term_description%';
		}
		if ( preg_match( '/^pt_(.+)_default_snippet_name$/', $key ) ) {
			return '%seo_title%';
		}
		if ( preg_match( '/^pt_(.+)_default_snippet_desc$/', $key ) ) {
			return '%seo_description%';
		}
		return $default;
	}

	/**
	 * @param mixed $default Fallback.
	 * @return mixed
	 */
	public static function gen( string $key, $default = '' ) {
		$general = self::general();
		return array_key_exists( $key, $general ) ? $general[ $key ] : $default;
	}

	/**
	 * Rank Math stores switches as "on"/"off", true/false or 1/0.
	 *
	 * @param mixed $value Stored value.
	 */
	public static function on( $value ): bool {
		if ( is_bool( $value ) ) {
			return $value;
		}
		if ( is_int( $value ) ) {
			return $value === 1;
		}
		$value = strtolower( trim( (string) $value ) );
		return in_array( $value, array( 'on', '1', 'true', 'yes' ), true );
	}

	public static function is_on( string $key ): bool {
		return self::on( self::get( $key, 'off' ) );
	}

	/**
	 * @return array<string, mixed>
	 */
	public static function defaults(): array {
		$name = function_exists( 'get_bloginfo' ) ? wp_specialchars_decode( (string) get_bloginfo( 'name' ), ENT_QUOTES ) : '';
		return array(
			'title_separator'             => '-',
			'capitalize_titles'           => 'off',
			'homepage_title'              => '%sitename% %page% %sep% %sitedesc%',
			'homepage_description'        => '',
			'author_archive_title'        => '%name% %sep% %sitename% %page%',
			'author_archive_description'  => '',
			'date_archive_title'          => '%date% %page% %sep% %sitename%',
			'search_title'                => '%search_query% %page% %sep% %sitename%',
			'404_title'                   => 'Page Not Found %sep% %sitename%',
			'robots_global'               => array( 'index' ),
			'advanced_robots_global'      => array(
				'max-snippet'       => '-1',
				'max-video-preview' => '-1',
				'max-image-preview' => 'large',
			),
			'noindex_search'              => 'on',
			'noindex_empty_taxonomies'    => 'on',
			'noindex_paginated_pages'     => 'off',
			'noindex_archive_subpages'    => 'off',
			'noindex_password_protected'  => 'off',
			'author_custom_robots'        => 'on',
			'author_robots'               => array( 'noindex' ),
			'tax_post_tag_custom_robots'  => 'on',
			'tax_post_tag_robots'         => array( 'noindex' ),
			'pt_attachment_custom_robots' => 'on',
			'pt_attachment_robots'        => array( 'noindex' ),
			'knowledgegraph_type'         => 'company',
			'knowledgegraph_name'         => $name,
			'website_name'                => $name,
			'twitter_card_type'           => 'summary_large_image',
			'pt_post_default_rich_snippet' => 'article',
			'pt_post_default_article_type' => 'BlogPosting',
			'pt_post_primary_taxonomy'    => 'category',
			'pt_page_default_rich_snippet' => 'article',
			'pt_page_default_article_type' => 'Article',
			'pt_post_slack_enhanced_sharing' => 'on',
			'pt_page_slack_enhanced_sharing' => 'on',
		);
	}

	public static function separator(): string {
		$sep = (string) self::get( 'title_separator', '-' );
		return trim( html_entity_decode( $sep, ENT_QUOTES, 'UTF-8' ) );
	}

	/**
	 * Clean a typed template or value. Unlike sanitize_text_field() this keeps %variables% such as
	 * %date% and %category%, which look like URL-encoded characters to WordPress.
	 *
	 * @param mixed $value Raw input.
	 */
	public static function clean_input( $value ): string {
		$value = is_scalar( $value ) ? (string) $value : '';
		$value = wp_check_invalid_utf8( $value );
		$value = wp_strip_all_tags( $value );
		$value = (string) preg_replace( '/[\r\n\t ]+/', ' ', $value );
		return trim( $value );
	}

	public static function rank_math_active(): bool {
		return defined( 'RANK_MATH_VERSION' ) || class_exists( 'RankMath', false );
	}

	/**
	 * Name of another SEO plugin that is running, or '' when none.
	 */
	public static function other_seo_plugin(): string {
		if ( self::rank_math_active() ) {
			return 'Rank Math';
		}
		if ( defined( 'WPSEO_VERSION' ) ) {
			return 'Yoast SEO';
		}
		if ( defined( 'AIOSEO_VERSION' ) ) {
			return 'All in One SEO';
		}
		if ( defined( 'SEOPRESS_VERSION' ) ) {
			return 'SEOPress';
		}
		if ( defined( 'THE_SEO_FRAMEWORK_VERSION' ) ) {
			return 'The SEO Framework';
		}
		return '';
	}

	/**
	 * Active plugins that belong to another SEO plugin, add-ons included (Rank Math + Rank Math Pro,
	 * Yoast + Yoast Premium, …), so the switch-over can deactivate them together.
	 *
	 * @return array<string, string> plugin file => plugin name
	 */
	public static function other_seo_plugin_files(): array {
		if ( ! function_exists( 'get_plugins' ) || ! function_exists( 'is_plugin_active' ) ) {
			require_once ABSPATH . 'wp-admin/includes/plugin.php';
		}
		// Matched on the main file name, so a plugin in a renamed folder is still found.
		$main_files = array(
			'rank-math.php',
			'rank-math-pro.php',
			'wp-seo.php',
			'wp-seo-premium.php',
			'all_in_one_seo_pack.php',
			'aioseo-pro.php',
			'seopress.php',
			'seopress-pro.php',
			'autodescription.php',
		);
		$out = array();
		foreach ( get_plugins() as $file => $data ) {
			if ( ! in_array( basename( (string) $file ), $main_files, true ) || ! is_plugin_active( $file ) ) {
				continue;
			}
			$out[ $file ] = isset( $data['Name'] ) && '' !== (string) $data['Name'] ? (string) $data['Name'] : (string) $file;
		}
		return $out;
	}

	/**
	 * Neo Pulse prints the SEO tags on this request: switched on and no other SEO plugin running.
	 *
	 * When Rank Math is still active the setting waits, so the switch-over has no gap: switch
	 * Neo Pulse on, then deactivate Rank Math and Neo Pulse takes over on the next page load.
	 */
	public static function output_active(): bool {
		if ( null === self::$output_active ) {
			self::$output_active = self::enabled() && self::other_seo_plugin() === '';
		}
		return (bool) apply_filters( 'neo_pulse_wp_seo_output_active', self::$output_active );
	}

	/**
	 * Copy Rank Math's titles/meta and general settings into Neo Pulse.
	 *
	 * @return array{ok: bool, message: string}
	 */
	public static function import_from_rank_math(): array {
		$titles  = get_option( self::RM_TITLES, null );
		$general = get_option( self::RM_GENERAL, null );
		if ( ! is_array( $titles ) || $titles === array() ) {
			return array(
				'ok'      => false,
				'message' => __( 'No Rank Math settings were found on this site.', 'neo-pulse-wp' ),
			);
		}
		$raw                = self::raw();
		$raw['titles']      = $titles;
		$raw['general']     = is_array( $general ) ? $general : array();
		$raw['imported_at'] = time();
		self::save_raw( $raw );
		return array(
			'ok'      => true,
			'message' => sprintf(
				/* translators: %d: number of settings */
				__( 'Copied %d Rank Math settings into Neo Pulse.', 'neo-pulse-wp' ),
				count( $titles ) + ( is_array( $general ) ? count( $general ) : 0 )
			),
		);
	}

	/**
	 * Match the Neo Pulse sitemap to Rank Math's: which post types and taxonomies are listed,
	 * links per sitemap, images and the HTML sitemap.
	 *
	 * @return string Summary, or '' when Rank Math has no sitemap settings.
	 */
	public static function import_sitemap_from_rank_math(): string {
		$rm = get_option( self::RM_SITEMAP, null );
		if ( ! is_array( $rm ) || $rm === array() || ! class_exists( 'Neo_Pulse_Wp_Sitemap_Settings', false ) ) {
			return '';
		}
		$config = Neo_Pulse_Wp_Sitemap_Settings::get_config();
		if ( isset( $rm['items_per_page'] ) && (int) $rm['items_per_page'] > 0 ) {
			$config['general']['links_per_sitemap'] = (int) $rm['items_per_page'];
		}
		if ( isset( $rm['include_images'] ) ) {
			$config['general']['include_images'] = self::on( $rm['include_images'] );
		}
		if ( isset( $rm['html_sitemap'] ) ) {
			$config['html']['enabled'] = self::on( $rm['html_sitemap'] );
		}
		if ( isset( $rm['html_sitemap_sort'] ) ) {
			$config['html']['sort_order'] = 'published' === $rm['html_sitemap_sort'] || 'modified' === $rm['html_sitemap_sort'] ? 'date' : 'title';
		}
		// Rank Math leaves out any post type or taxonomy its settings don't switch on (including ones
		// it never listed, such as types without pages of their own), so a missing setting means "off".
		$listed = array();
		foreach ( $config['post_types'] as $type => $settings ) {
			$config['post_types'][ $type ]['include_xml']  = self::on( $rm[ 'pt_' . $type . '_sitemap' ] ?? '' );
			$config['post_types'][ $type ]['include_html'] = self::on( $rm[ 'pt_' . $type . '_html_sitemap' ] ?? '' );
			if ( ! empty( $config['post_types'][ $type ]['include_xml'] ) ) {
				$listed[] = $type;
			}
		}
		foreach ( $config['taxonomies'] as $tax => $settings ) {
			$config['taxonomies'][ $tax ]['include_xml']  = self::on( $rm[ 'tax_' . $tax . '_sitemap' ] ?? '' );
			$config['taxonomies'][ $tax ]['include_html'] = self::on( $rm[ 'tax_' . $tax . '_html_sitemap' ] ?? '' );
			if ( ! empty( $config['taxonomies'][ $tax ]['include_xml'] ) ) {
				$listed[] = $tax;
			}
		}
		if ( ! empty( $rm['exclude_posts'] ) && is_string( $rm['exclude_posts'] ) ) {
			$config['general']['exclude_post_ids'] = $rm['exclude_posts'];
		}
		Neo_Pulse_Wp_Sitemap_Settings::save_config( $config );
		if ( class_exists( 'Neo_Pulse_Wp_Sitemap_Cache', false ) ) {
			Neo_Pulse_Wp_Sitemap_Cache::flush_all();
		}
		return sprintf(
			/* translators: %s: list of post types and taxonomies */
			__( 'Sitemap now lists: %s.', 'neo-pulse-wp' ),
			$listed !== array() ? implode( ', ', $listed ) : __( 'nothing', 'neo-pulse-wp' )
		);
	}

	/**
	 * Store edited titles settings. Starts from what is currently in use, so the first save also
	 * copies anything still being read from Rank Math.
	 *
	 * @param array<string, mixed> $changes Rank Math-format keys.
	 */
	public static function save_titles( array $changes ): void {
		$raw           = self::raw();
		$titles        = self::titles();
		$raw['titles'] = array_merge( $titles, $changes );
		if ( empty( $raw['general'] ) ) {
			$raw['general'] = self::general();
		}
		self::save_raw( $raw );
	}

	/**
	 * @param array<string, mixed> $changes Rank Math-format general keys.
	 */
	public static function save_general( array $changes ): void {
		$raw = self::raw();
		if ( empty( $raw['titles'] ) ) {
			$raw['titles'] = self::titles();
		}
		$raw['general'] = array_merge( self::general(), $changes );
		self::save_raw( $raw );
	}

	public static function set_enabled( bool $enabled ): void {
		$raw            = self::raw();
		$raw['enabled'] = $enabled;
		if ( $enabled && ! self::has_own() ) {
			$raw['titles']  = self::titles();
			$raw['general'] = self::general();
			if ( is_array( get_option( self::RM_TITLES, null ) ) ) {
				$raw['imported_at'] = time();
			}
		}
		self::save_raw( $raw );
		// Bring the GA tag, robots.txt and 404 fallback across too (each step skips what is done).
		if ( $enabled && class_exists( 'Neo_Pulse_Wp_Seo_Takeover', false ) ) {
			Neo_Pulse_Wp_Seo_Takeover::import_extras();
		}
	}

	/**
	 * @param array<string, mixed> $raw Full option.
	 */
	public static function save_raw( array $raw ): void {
		update_option( self::OPTION, $raw, true );
		self::flush_cache();
	}

	/**
	 * @return array<int, string>
	 */
	public static function excluded_post_types(): array {
		$list = apply_filters( 'neo_pulse_wp_seo_excluded_post_types', self::EXCLUDED_POST_TYPES );
		return is_array( $list ) ? array_values( array_map( 'strval', $list ) ) : self::EXCLUDED_POST_TYPES;
	}

	/**
	 * @return array<int, string>
	 */
	public static function excluded_taxonomies(): array {
		$list = apply_filters( 'neo_pulse_wp_seo_excluded_taxonomies', self::EXCLUDED_TAXONOMIES );
		return is_array( $list ) ? array_values( array_map( 'strval', $list ) ) : self::EXCLUDED_TAXONOMIES;
	}

	/**
	 * Public post types that get SEO settings, in a stable order.
	 *
	 * @return array<string, string> name => label
	 */
	public static function post_types(): array {
		$out  = array();
		$skip = self::excluded_post_types();
		foreach ( get_post_types( array( 'public' => true ), 'objects' ) as $name => $object ) {
			if ( in_array( (string) $name, $skip, true ) ) {
				continue;
			}
			$out[ (string) $name ] = (string) $object->labels->name;
		}
		return $out;
	}

	/**
	 * @return array<string, string> name => label
	 */
	public static function taxonomies(): array {
		$out  = array();
		$skip = self::excluded_taxonomies();
		foreach ( get_taxonomies( array( 'public' => true ), 'objects' ) as $name => $object ) {
			if ( in_array( (string) $name, $skip, true ) ) {
				continue;
			}
			$out[ (string) $name ] = (string) $object->labels->name;
		}
		return $out;
	}

	/**
	 * Robots list for a stored Rank Math robots value.
	 *
	 * @param mixed $value Stored value.
	 * @return array<int, string>
	 */
	public static function robots_list( $value ): array {
		if ( is_string( $value ) ) {
			$value = maybe_unserialize( $value );
		}
		if ( is_string( $value ) ) {
			$value = preg_split( '/[\s,]+/', $value );
		}
		if ( ! is_array( $value ) ) {
			return array();
		}
		$out = array();
		foreach ( $value as $item ) {
			$item = strtolower( trim( (string) $item ) );
			if ( $item !== '' ) {
				$out[] = $item;
			}
		}
		return array_values( array_unique( $out ) );
	}
}
