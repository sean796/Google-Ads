<?php
/**
 * Templates screen data (spec 8.16): one filtered, sorted page of the Pro
 * template library without the element trees, plus apply.
 *
 * @package EMCP_Tools
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

final class EMCP_Tools_Admin_Templates_Data {

	const PER_PAGE       = 12;
	const OPTION_APPLIED = 'emcp_tools_applied_templates';

	/**
	 * Load EMCP_Tools_Pro_Templates (an admin-only Pro file) outside wp-admin.
	 */
	public static function pro_class(): bool {
		if ( ! class_exists( 'EMCP_Tools_Pro_Templates' ) && class_exists( 'EMCP_Tools_Pro_Loader' ) ) {
			foreach ( array( 'includes/admin/class-pro-templates.php', 'includes/admin/class-pro-usage.php' ) as $rel ) {
				$file = EMCP_Tools_Pro_Loader::path( $rel );
				if ( '' !== $file && file_exists( $file ) ) {
					require_once $file;
				}
			}
		}
		return class_exists( 'EMCP_Tools_Pro_Templates' );
	}

	private static function licensed(): bool {
		return self::pro_class() && EMCP_Tools_Pro_Templates::user_has_access();
	}

	private static function elementor_active(): bool {
		if ( defined( 'EMCP_TOOLS_TESTING' ) && isset( $GLOBALS['_emcp_elementor_active'] ) ) {
			return (bool) $GLOBALS['_emcp_elementor_active'];
		}
		return class_exists( 'EMCP_Tools_Bootstrap' ) && EMCP_Tools_Bootstrap::elementor_active();
	}

	/**
	 * Display title: the bundle's title, or the slug humanised when the title
	 * is only the slug.
	 *
	 * @param array $t Template entry.
	 */
	public static function title( array $t ): string {
		$title = (string) ( $t['title'] ?? '' );
		$slug  = (string) ( $t['slug'] ?? '' );
		if ( '' === $title || $title === $slug ) {
			return ucwords( str_replace( array( '-', '_' ), ' ', $slug ) );
		}
		return $title;
	}

	/** @return array{bundle: array, error: string} */
	private function library(): array {
		if ( ! self::licensed() ) {
			return array( 'bundle' => array( 'categories' => array() ), 'error' => '' );
		}
		$bundle = EMCP_Tools_Pro_Templates::get_bundle();
		if ( is_wp_error( $bundle ) ) {
			return array( 'bundle' => array( 'categories' => array() ), 'error' => $bundle->get_error_message() );
		}
		return array( 'bundle' => $bundle, 'error' => '' );
	}

	public function find( string $category, string $slug ): ?array {
		foreach ( $this->library()['bundle']['categories'] ?? array() as $cat ) {
			if ( ( $cat['slug'] ?? '' ) !== $category ) {
				continue;
			}
			foreach ( $cat['templates'] ?? array() as $t ) {
				if ( ( $t['slug'] ?? '' ) === $slug ) {
					return $t;
				}
			}
		}
		return null;
	}

	/** @return array{postId:int, editUrl:string}|null */
	private static function applied( string $category, string $slug ): ?array {
		$all = get_option( self::OPTION_APPLIED, array() );
		$rec = is_array( $all ) ? ( $all[ $category . '/' . $slug ] ?? null ) : null;
		if ( ! is_array( $rec ) || empty( $rec['post_id'] ) ) {
			return null;
		}
		$status = get_post_status( (int) $rec['post_id'] );
		if ( false === $status || 'trash' === $status ) {
			return null;
		}
		return array(
			'postId'  => (int) $rec['post_id'],
			'editUrl' => admin_url( 'post.php?post=' . (int) $rec['post_id'] . '&action=elementor' ),
		);
	}

	public function payload( array $query = array() ): array {
		$lib     = $this->library();
		$cats    = $lib['bundle']['categories'] ?? array();
		$builder = (string) ( $query['builder'] ?? '' );
		$sort    = in_array( $query['sort'] ?? '', array( 'name', 'popular' ), true ) ? $query['sort'] : 'default';
		$usage   = class_exists( 'EMCP_Tools_Pro_Usage' ) ? EMCP_Tools_Pro_Usage::get_counts() : array();
		$used    = static function ( array $t ) use ( $usage ): int {
			return (int) ( $usage[ 'template:' . ( $t['slug'] ?? '' ) ] ?? 0 );
		};

		$builders = array();
		foreach ( $cats as $i => $cat ) {
			$kept = array();
			foreach ( (array) ( $cat['templates'] ?? array() ) as $t ) {
				$b              = (string) ( $t['builder'] ?? 'elementor' );
				$builders[ $b ] = true;
				if ( '' === $builder || $builder === $b ) {
					$kept[] = $t;
				}
			}
			$cats[ $i ]['templates'] = $kept;
		}

		$compare = null;
		if ( 'name' === $sort ) {
			$compare = static function ( array $a, array $b ): int {
				return strcasecmp( self::title( $a ), self::title( $b ) );
			};
		} elseif ( 'popular' === $sort ) {
			$compare = static function ( array $a, array $b ) use ( $used ): int {
				return $used( $b ) <=> $used( $a );
			};
		}

		$list          = EMCP_Tools_Admin_Library_List::build(
			$cats,
			'templates',
			static function ( array $t ): string {
				return self::title( $t ) . ' ' . ( $t['description'] ?? '' );
			},
			$query,
			self::PER_PAGE,
			$compare
		);
		$list['items'] = array_map(
			static function ( array $t ) use ( $used ): array {
				return array(
					'slug'          => (string) $t['slug'],
					'category'      => (string) $t['category'],
					'categoryLabel' => (string) $t['categoryLabel'],
					'title'         => self::title( $t ),
					'description'   => (string) ( $t['description'] ?? '' ),
					'thumbnail'     => (string) ( $t['thumbnail_url'] ?? '' ),
					'previewUrl'    => (string) ( $t['preview_url'] ?? '' ),
					'pages'         => max( 1, (int) ( $t['pages'] ?? 1 ) ),
					'builder'       => (string) ( $t['builder'] ?? 'elementor' ),
					'used'          => $used( $t ),
					'applied'       => self::applied( (string) $t['category'], (string) $t['slug'] ),
				);
			},
			$list['items']
		);

		$names = array_keys( $builders );
		sort( $names );
		// Category counts ignore the builder filter: they size the Industry list.
		$list['categories'] = EMCP_Tools_Admin_Library_List::build( $lib['bundle']['categories'] ?? array(), 'templates', '__return_empty_string', array() )['categories'];

		return array_merge(
			$list,
			array(
				'builders'        => $names,
				'sort'            => $sort,
				'syncedAt'        => (int) ( $lib['bundle']['fetched_at'] ?? 0 ),
				'error'           => $lib['error'],
				'licensed'        => self::licensed(),
				'elementorActive' => self::elementor_active(),
				'upgradeUrl'      => function_exists( 'emcp_tools_upgrade_url' ) ? emcp_tools_upgrade_url() : 'https://emcptools.com/pricing',
			)
		);
	}

	/**
	 * @param string $category Category slug.
	 * @param string $slug     Template slug.
	 * @param string $mode     'page' (new draft page) or 'library' (Elementor saved templates).
	 * @return array|WP_Error
	 */
	public function apply( string $category, string $slug, string $mode ) {
		if ( ! in_array( $mode, array( 'page', 'library' ), true ) ) {
			return new WP_Error( 'emcp_bad_mode', __( 'Unknown apply mode.', 'emcp-tools' ), array( 'status' => 400 ) );
		}
		if ( ! self::elementor_active() ) {
			return new WP_Error( 'emcp_no_elementor', __( 'Activate Elementor to use a template: templates are Elementor page designs.', 'emcp-tools' ), array( 'status' => 409 ) );
		}
		$template = $this->find( $category, $slug );
		if ( null === $template ) {
			return new WP_Error( 'emcp_unknown_template', __( 'That template is not in the library.', 'emcp-tools' ), array( 'status' => 404 ) );
		}
		if ( 'library' === $mode ) {
			$r = EMCP_Tools_Pro_Templates::import_to_library( $category, $slug );
			if ( is_wp_error( $r ) ) {
				return new WP_Error( $r->get_error_code(), $r->get_error_message(), array( 'status' => 400 ) );
			}
			return array(
				'mode'       => 'library',
				'postId'     => (int) $r['template_id'],
				'editUrl'    => (string) $r['edit_url'],
				'viewUrl'    => '',
				'libraryUrl' => (string) $r['library_url'],
				'title'      => self::title( $template ),
			);
		}
		$r = EMCP_Tools_Pro_Templates::apply_template( $category, $slug, 0 );
		if ( is_wp_error( $r ) ) {
			return new WP_Error( $r->get_error_code(), $r->get_error_message(), array( 'status' => 400 ) );
		}
		$all                            = get_option( self::OPTION_APPLIED, array() );
		$all                            = is_array( $all ) ? $all : array();
		$all[ $category . '/' . $slug ] = array( 'post_id' => (int) $r['post_id'], 'at' => time() );
		update_option( self::OPTION_APPLIED, $all, false );
		if ( class_exists( 'EMCP_Tools_Pro_Usage' ) ) {
			EMCP_Tools_Pro_Usage::record( 'template', $slug, $category );
		}
		return array(
			'mode'       => 'page',
			'postId'     => (int) $r['post_id'],
			'editUrl'    => (string) $r['edit_url'],
			'viewUrl'    => (string) $r['view_url'],
			'libraryUrl' => '',
			'title'      => self::title( $template ),
		);
	}

	/** Template titles for the command palette, from the cached bundle only. */
	public static function palette_items(): array {
		if ( ! self::licensed() ) {
			return array();
		}
		// No titles while the Templates module is switched off: WordPress would refuse the link.
		if ( class_exists( 'EMCP_Tools_Modules_Registry' ) ) {
			$module = EMCP_Tools_Modules_Registry::instance()->get( 'templates' );
			if ( $module && ! $module->is_active() ) {
				return array();
			}
		}
		$bundle = EMCP_Tools_Pro_Templates::cached_bundle();
		$base   = admin_url( 'admin.php?page=emcp-tools-templates' );
		$out    = array();
		foreach ( is_array( $bundle ) ? (array) ( $bundle['categories'] ?? array() ) : array() as $cat ) {
			foreach ( (array) ( $cat['templates'] ?? array() ) as $t ) {
				$title = self::title( is_array( $t ) ? $t : array() );
				if ( '' === $title ) {
					continue;
				}
				$out[] = array(
					'kind'  => 'template',
					'label' => $title,
					'hint'  => (string) ( $cat['label'] ?? '' ),
					'url'   => $base . '&q=' . rawurlencode( $title ),
				);
			}
		}
		return $out;
	}

	/** Add template titles to the palette library (Pro seam on a free filter). */
	public static function hook_palette(): void {
		add_filter(
			'emcp_tools_palette_library',
			static function ( array $items ): array {
				return array_merge( $items, self::palette_items() );
			}
		);
	}
}
