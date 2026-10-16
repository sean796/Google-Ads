<?php
/**
 * Sitemap settings storage and defaults.
 *
 * @package Neo_Pulse_Wp
 */

defined( 'ABSPATH' ) || exit;

/**
 * Manages neo_pulse_wp_sitemap option.
 */
class Neo_Pulse_Wp_Sitemap_Settings {

	const OPTION_KEY = 'neo_pulse_wp_sitemap';

	/**
	 * @return array<string, mixed>
	 */
	public static function get_config(): array {
		$raw = get_option( self::OPTION_KEY, array() );
		if ( ! is_array( $raw ) ) {
			$raw = array();
		}
		return self::sanitize_config( self::merge_with_defaults( $raw ) );
	}

	/**
	 * @param array<string, mixed> $config Config.
	 */
	public static function save_config( array $config ): void {
		$sanitized = self::sanitize_config( self::merge_with_defaults( $config ) );
		if ( get_option( self::OPTION_KEY, null ) === null ) {
			add_option( self::OPTION_KEY, $sanitized, '', false );
		} else {
			update_option( self::OPTION_KEY, $sanitized, false );
		}
	}

	/**
	 * Reset a section to defaults.
	 *
	 * @param string $section general|html|post_type|taxonomy
	 * @param string $slug    Post type or taxonomy slug when applicable.
	 * @return array<string, mixed>
	 */
	public static function reset_section( string $section, string $slug = '' ): array {
		$config   = self::get_config();
		$defaults = self::default_config();

		switch ( $section ) {
			case 'general':
				$config['general'] = $defaults['general'];
				break;
			case 'html':
				$config['html'] = $defaults['html'];
				break;
			case 'post_type':
				$slug = sanitize_key( $slug );
				if ( $slug !== '' && isset( $defaults['post_types'][ $slug ] ) ) {
					$config['post_types'][ $slug ] = $defaults['post_types'][ $slug ];
				}
				break;
			case 'taxonomy':
				$slug = sanitize_key( $slug );
				if ( $slug !== '' && isset( $defaults['taxonomies'][ $slug ] ) ) {
					$config['taxonomies'][ $slug ] = $defaults['taxonomies'][ $slug ];
				}
				break;
		}

		self::save_config( $config );
		return $config;
	}

	/**
	 * @return array<string, mixed>
	 */
	public static function default_config(): array {
		return array(
			'general'    => self::default_general(),
			'html'       => self::default_html(),
			'post_types' => self::default_post_types(),
			'taxonomies' => self::default_taxonomies(),
		);
	}

	/**
	 * @return array<string, mixed>
	 */
	public static function default_general(): array {
		return array(
			'enabled'           => true,
			'links_per_sitemap' => 200,
			'include_images'    => true,
			'exclude_post_ids'  => '',
		);
	}

	/**
	 * @return array<string, mixed>
	 */
	public static function default_html(): array {
		return array(
			'enabled'    => false,
			'shortcode'  => '[neo-pulse_sitemap]',
			'sort_order' => 'title',
		);
	}

	/**
	 * @return array<string, array<string, mixed>>
	 */
	public static function default_post_types(): array {
		$out   = array();
		$types = get_post_types( array( 'public' => true ), 'objects' );
		$skip  = array_merge( array( 'attachment' ), Neo_Pulse_Wp_Seo_Settings::excluded_post_types() );
		foreach ( $types as $slug => $obj ) {
			$include = ! in_array( (string) $slug, $skip, true );
			$out[ $slug ] = array(
				'include_xml'         => $include,
				'include_html'        => $include,
				'image_meta'          => '',
			);
		}
		return $out;
	}

	/**
	 * @return array<string, array<string, mixed>>
	 */
	public static function default_taxonomies(): array {
		$out  = array();
		$taxs = get_taxonomies( array( 'public' => true ), 'objects' );
		$skip_tax = array_merge( array( 'post_tag' ), Neo_Pulse_Wp_Seo_Settings::excluded_taxonomies() );
		foreach ( $taxs as $slug => $obj ) {
			$include = ! in_array( (string) $slug, $skip_tax, true );
			$out[ $slug ] = array(
				'include_xml'  => $include,
				'include_html' => $include,
			);
		}
		return $out;
	}

	/**
	 * Merge saved config with defaults for newly registered types.
	 *
	 * @param array<string, mixed> $raw Raw saved config.
	 * @return array<string, mixed>
	 */
	public static function merge_with_defaults( array $raw ): array {
		$defaults = self::default_config();

		$general = isset( $raw['general'] ) && is_array( $raw['general'] )
			? wp_parse_args( $raw['general'], $defaults['general'] )
			: $defaults['general'];

		$html = isset( $raw['html'] ) && is_array( $raw['html'] )
			? wp_parse_args( $raw['html'], $defaults['html'] )
			: $defaults['html'];

		$post_types = $defaults['post_types'];
		if ( isset( $raw['post_types'] ) && is_array( $raw['post_types'] ) ) {
			foreach ( $raw['post_types'] as $slug => $settings ) {
				if ( ! is_array( $settings ) || ! isset( $post_types[ $slug ] ) ) {
					continue;
				}
				$post_types[ $slug ] = wp_parse_args( $settings, $post_types[ $slug ] );
			}
		}

		$taxonomies = $defaults['taxonomies'];
		if ( isset( $raw['taxonomies'] ) && is_array( $raw['taxonomies'] ) ) {
			foreach ( $raw['taxonomies'] as $slug => $settings ) {
				if ( ! is_array( $settings ) || ! isset( $taxonomies[ $slug ] ) ) {
					continue;
				}
				$taxonomies[ $slug ] = wp_parse_args( $settings, $taxonomies[ $slug ] );
			}
		}

		return array(
			'general'    => $general,
			'html'       => $html,
			'post_types' => $post_types,
			'taxonomies' => $taxonomies,
		);
	}

	/**
	 * @param array<string, mixed> $raw Raw config.
	 * @return array<string, mixed>
	 */
	public static function sanitize_config( array $raw ): array {
		$merged = self::merge_with_defaults( $raw );

		$links = (int) ( $merged['general']['links_per_sitemap'] ?? 200 );
		if ( $links < 1 ) {
			$links = 1;
		}
		if ( $links > 50000 ) {
			$links = 50000;
		}

		$sort = sanitize_key( (string) ( $merged['html']['sort_order'] ?? 'title' ) );
		if ( ! in_array( $sort, array( 'title', 'date', 'menu_order' ), true ) ) {
			$sort = 'title';
		}

		$post_types = array();
		foreach ( $merged['post_types'] as $slug => $settings ) {
			$key = sanitize_key( (string) $slug );
			if ( $key === '' ) {
				continue;
			}
			$post_types[ $key ] = array(
				'include_xml'       => ! empty( $settings['include_xml'] ),
				'include_html'      => ! empty( $settings['include_html'] ),
				'image_meta'        => self::sanitize_meta_lines( (string) ( $settings['image_meta'] ?? '' ) ),
			);
		}

		$taxonomies = array();
		foreach ( $merged['taxonomies'] as $slug => $settings ) {
			$key = sanitize_key( (string) $slug );
			if ( $key === '' ) {
				continue;
			}
			$taxonomies[ $key ] = array(
				'include_xml'  => ! empty( $settings['include_xml'] ),
				'include_html' => ! empty( $settings['include_html'] ),
			);
		}

		return array(
			'general'    => array(
				'enabled'           => ! empty( $merged['general']['enabled'] ),
				'links_per_sitemap' => $links,
				'include_images'    => ! empty( $merged['general']['include_images'] ),
				'exclude_post_ids'  => self::sanitize_id_list( (string) ( $merged['general']['exclude_post_ids'] ?? '' ) ),
			),
			'html'       => array(
				'enabled'    => ! empty( $merged['html']['enabled'] ),
				'shortcode'  => '[neo-pulse_sitemap]',
				'sort_order' => $sort,
			),
			'post_types' => $post_types,
			'taxonomies' => $taxonomies,
		);
	}

	/**
	 * @param string $raw Comma or newline separated IDs.
	 */
	public static function sanitize_id_list( string $raw ): string {
		$parts = preg_split( '/[\s,]+/', trim( $raw ), -1, PREG_SPLIT_NO_EMPTY );
		if ( ! is_array( $parts ) ) {
			return '';
		}
		$ids = array();
		foreach ( $parts as $part ) {
			$id = absint( $part );
			if ( $id > 0 ) {
				$ids[] = (string) $id;
			}
		}
		return implode( ',', array_unique( $ids ) );
	}

	/**
	 * @return array<int, int>
	 */
	public static function excluded_post_ids( array $config ): array {
		$raw = isset( $config['general']['exclude_post_ids'] ) ? (string) $config['general']['exclude_post_ids'] : '';
		if ( $raw === '' ) {
			return array();
		}
		$ids = array();
		foreach ( explode( ',', $raw ) as $part ) {
			$id = absint( $part );
			if ( $id > 0 ) {
				$ids[] = $id;
			}
		}
		return $ids;
	}

	/**
	 * @param string $raw One meta key per line.
	 */
	public static function sanitize_meta_lines( string $raw ): string {
		$lines = preg_split( '/\r\n|\r|\n/', $raw );
		if ( ! is_array( $lines ) ) {
			return '';
		}
		$keys = array();
		foreach ( $lines as $line ) {
			$key = sanitize_key( trim( (string) $line ) );
			if ( $key !== '' ) {
				$keys[] = $key;
			}
		}
		return implode( "\n", array_unique( $keys ) );
	}

	/**
	 * @param string $raw Meta keys string.
	 * @return array<int, string>
	 */
	public static function parse_meta_lines( string $raw ): array {
		if ( trim( $raw ) === '' ) {
			return array();
		}
		return array_values(
			array_filter(
				array_map(
					static function ( $line ) {
						return sanitize_key( trim( (string) $line ) );
					},
					preg_split( '/\r\n|\r|\n/', $raw ) ?: array()
				)
			)
		);
	}

	/**
	 * @return string
	 */
	/**
	 * Post types switched on in the old "Content Optimizer" toggles that used to live on this screen.
	 * Only read once, to carry the choice over to Settings → Editor AI.
	 *
	 * @return array<int, string>
	 */
	public static function content_optimizer_post_types(): array {
		$raw   = get_option( self::OPTION_KEY, array() );
		$types = is_array( $raw ) && isset( $raw['post_types'] ) && is_array( $raw['post_types'] ) ? $raw['post_types'] : array();
		$out    = array();
		foreach ( $types as $slug => $settings ) {
			if ( ! is_array( $settings ) || empty( $settings['content_optimizer'] ) ) {
				continue;
			}
			$key = sanitize_key( (string) $slug );
			if ( $key !== '' ) {
				$out[] = $key;
			}
		}
		return array_values( array_unique( $out ) );
	}

	public static function index_url(): string {
		return home_url( '/sitemap_index.xml' );
	}

	/**
	 * @param string $type Post type or taxonomy slug.
	 * @param int    $page Page number (1-based).
	 */
	public static function child_sitemap_url( string $type, int $page = 1 ): string {
		$slug = sanitize_key( $type );
		if ( $page > 1 ) {
			return home_url( '/' . $slug . '-sitemap' . $page . '.xml' );
		}
		return home_url( '/' . $slug . '-sitemap.xml' );
	}

	/**
	 * Exclude a post type from sitemaps, flush cache, then restore prior inclusion flags.
	 */
	public static function rebuild_post_type_sitemap( string $slug ): bool {
		$slug   = sanitize_key( $slug );
		$config = self::get_config();
		if ( $slug === '' || ! isset( $config['post_types'][ $slug ] ) || ! is_array( $config['post_types'][ $slug ] ) ) {
			return false;
		}

		$settings = $config['post_types'][ $slug ];
		$flags    = array(
			'include_xml'  => ! empty( $settings['include_xml'] ),
			'include_html' => ! empty( $settings['include_html'] ),
		);

		$config['post_types'][ $slug ]['include_xml']  = false;
		$config['post_types'][ $slug ]['include_html'] = false;
		self::save_config( self::sanitize_config( $config ) );
		Neo_Pulse_Wp_Sitemap_Cache::flush_all();

		$config = self::get_config();
		if ( ! isset( $config['post_types'][ $slug ] ) || ! is_array( $config['post_types'][ $slug ] ) ) {
			return false;
		}

		$config['post_types'][ $slug ]['include_xml']  = $flags['include_xml'];
		$config['post_types'][ $slug ]['include_html'] = $flags['include_html'];
		self::save_config( self::sanitize_config( $config ) );
		Neo_Pulse_Wp_Sitemap_Cache::flush_all();

		return true;
	}

	/**
	 * Rebuild every post type sitemap (exclude all, flush, restore, flush).
	 *
	 * @return int Number of post types rebuilt.
	 */
	public static function rebuild_all_post_type_sitemaps(): int {
		$config = self::get_config();
		$flags  = array();

		foreach ( $config['post_types'] as $slug => $settings ) {
			if ( ! is_array( $settings ) ) {
				continue;
			}
			$key = sanitize_key( (string) $slug );
			if ( $key === '' ) {
				continue;
			}
			$flags[ $key ] = array(
				'include_xml'  => ! empty( $settings['include_xml'] ),
				'include_html' => ! empty( $settings['include_html'] ),
			);
			$config['post_types'][ $slug ]['include_xml']  = false;
			$config['post_types'][ $slug ]['include_html'] = false;
		}

		if ( empty( $flags ) ) {
			return 0;
		}

		self::save_config( self::sanitize_config( $config ) );
		Neo_Pulse_Wp_Sitemap_Cache::flush_all();

		$config = self::get_config();
		foreach ( $flags as $slug => $saved ) {
			if ( ! isset( $config['post_types'][ $slug ] ) || ! is_array( $config['post_types'][ $slug ] ) ) {
				continue;
			}
			$config['post_types'][ $slug ]['include_xml']  = $saved['include_xml'];
			$config['post_types'][ $slug ]['include_html'] = $saved['include_html'];
		}

		self::save_config( self::sanitize_config( $config ) );
		Neo_Pulse_Wp_Sitemap_Cache::flush_all();

		return count( $flags );
	}

	public static function conflicting_plugins(): array {
		$conflicts = array();
		if ( defined( 'RANK_MATH_VERSION' ) ) {
			$conflicts[] = 'Rank Math SEO';
		}
		if ( defined( 'RANK_MATH_PRO_VERSION' ) ) {
			$conflicts[] = 'Rank Math SEO PRO';
		}
		if ( defined( 'WPSEO_VERSION' ) ) {
			$conflicts[] = 'Yoast SEO';
		}
		if ( defined( 'AIOSEO_VERSION' ) ) {
			$conflicts[] = 'All in One SEO';
		}
		if ( defined( 'SEOPRESS_VERSION' ) ) {
			$conflicts[] = 'SEOPress';
		}
		return $conflicts;
	}
}
