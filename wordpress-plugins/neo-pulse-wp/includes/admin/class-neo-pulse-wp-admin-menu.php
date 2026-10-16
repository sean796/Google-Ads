<?php
/**
 * NEO Pulse admin menu: nine sections in the sidebar, each with tabs across the top of its screens.
 *
 * Every screen is still registered as its own submenu page (so screen hooks and old links keep
 * working); screens that are a tab of another section are kept out of the sidebar with a class.
 *
 * @package Neo_Pulse_Wp
 */

defined( 'ABSPATH' ) || exit;

class Neo_Pulse_Wp_Admin_Menu {

	const PARENT_SLUG = 'neo-pulse-wp';

	/**
	 * Neo Tools' top-level menu slug (Neo Digital Elementor Tools). Neo Pulse sits directly below it.
	 */
	const NEO_TOOLS_SLUG = 'ndet-settings';

	/** Class on sidebar entries that are tabs of another section. */
	const HIDDEN_CLASS = 'neo-pulse-wp-menu-hidden';

	public static function init(): void {
		add_action( 'admin_menu', array( __CLASS__, 'register' ) );
		add_action( 'admin_menu', array( __CLASS__, 'arrange_submenu' ), 999 );
		add_filter( 'custom_menu_order', array( __CLASS__, 'enable_custom_menu_order' ), 99 );
		add_filter( 'menu_order', array( __CLASS__, 'filter_menu_order' ), 99 );
		add_action( 'admin_head', array( __CLASS__, 'print_menu_icon_css' ) );
		add_filter( 'parent_file', array( __CLASS__, 'filter_parent_file' ) );
		add_filter( 'submenu_file', array( __CLASS__, 'filter_submenu_file' ), 10, 2 );
	}

	/**
	 * Every NEO Pulse admin screen: slug => title, capability, render callback.
	 *
	 * @return array<string, array{title:string,capability:string,callback:callable}>
	 */
	public static function pages(): array {
		$cap = Neo_Pulse_Wp_Admin::required_capability();
		$a   = 'Neo_Pulse_Wp_Admin';
		return array(
			'neo-pulse-wp-emcp'           => array( 'title' => __( 'Neo EMCP', 'neo-pulse-wp' ), 'capability' => 'manage_options', 'callback' => array( 'Neo_Pulse_Wp_Emcp_Admin', 'render_page' ) ),
			'neo-pulse-wp-seo'            => array( 'title' => __( 'SEO', 'neo-pulse-wp' ), 'capability' => 'manage_options', 'callback' => array( $a, 'render_seo_page' ) ),
			'neo-pulse-wp-sitemap'        => array( 'title' => __( 'Sitemap', 'neo-pulse-wp' ), 'capability' => 'manage_options', 'callback' => array( $a, 'render_sitemap_page' ) ),
			'neo-pulse-wp-robots-txt'     => array( 'title' => __( 'robots.txt', 'neo-pulse-wp' ), 'capability' => 'manage_options', 'callback' => array( $a, 'render_robots_txt_page' ) ),
			'neo-pulse-wp-redirects'      => array( 'title' => __( 'Redirects', 'neo-pulse-wp' ), 'capability' => 'manage_options', 'callback' => array( $a, 'render_redirects_page' ) ),
			'neo-pulse-wp-image-seo'      => array( 'title' => __( 'Image SEO', 'neo-pulse-wp' ), 'capability' => 'upload_files', 'callback' => array( $a, 'render_image_seo_page' ) ),
			'neo-pulse-wp-chat'           => array( 'title' => __( 'Chat', 'neo-pulse-wp' ), 'capability' => 'manage_options', 'callback' => array( $a, 'render_chat_page' ) ),
			'neo-pulse-wp-chat-logs'      => array( 'title' => __( 'Conversations', 'neo-pulse-wp' ), 'capability' => 'manage_options', 'callback' => array( $a, 'render_chat_logs_page' ) ),
			'neo-pulse-wp-search'         => array( 'title' => __( 'Search', 'neo-pulse-wp' ), 'capability' => 'manage_options', 'callback' => array( $a, 'render_search_page' ) ),
			'neo-pulse-wp-search-logs'    => array( 'title' => __( 'Search log', 'neo-pulse-wp' ), 'capability' => 'manage_options', 'callback' => array( $a, 'render_search_logs_page' ) ),
			'neo-pulse-wp-backend-assist' => array( 'title' => __( 'Backend Assist', 'neo-pulse-wp' ), 'capability' => 'manage_options', 'callback' => array( $a, 'render_backend_assist_page' ) ),
			'neo-pulse-wp-tool-library'   => array( 'title' => __( 'Tool library', 'neo-pulse-wp' ), 'capability' => 'edit_posts', 'callback' => array( $a, 'render_tool_library_page' ) ),
			'neo-pulse-wp-analytics'      => array( 'title' => __( 'Search Console', 'neo-pulse-wp' ), 'capability' => $cap, 'callback' => array( $a, 'render_analytics_page' ) ),
			'neo-pulse-wp-overseer'       => array( 'title' => __( 'Visitors', 'neo-pulse-wp' ), 'capability' => 'manage_options', 'callback' => array( $a, 'render_overseer_page' ) ),
			'neo-pulse-wp-script-manager' => array( 'title' => __( 'Script Manager', 'neo-pulse-wp' ), 'capability' => 'manage_options', 'callback' => array( $a, 'render_script_manager_page' ) ),
			'neo-pulse-wp-settings'       => array( 'title' => __( 'Settings', 'neo-pulse-wp' ), 'capability' => $cap, 'callback' => array( $a, 'render_settings_placeholder_page' ) ),
		);
	}

	/**
	 * Sidebar sections, in order. Each tab points at a screen, optionally with a `tab` or `action`
	 * query value; `default` marks the tab shown when that screen is opened without one.
	 *
	 * @return array<string, array{label:string,group:string,tabs:array<int,array<string,mixed>>}>
	 */
	public static function sections(): array {
		$seo      = __( 'SEO', 'neo-pulse-wp' );
		$ai       = __( 'AI on your site', 'neo-pulse-wp' );
		$insights = __( 'Insights', 'neo-pulse-wp' );
		$site     = __( 'Site', 'neo-pulse-wp' );
		return array(
			'emcp'           => array(
				'label' => __( 'Neo EMCP', 'neo-pulse-wp' ),
				'group' => $ai,
				'tabs'  => array(
					array( 'label' => __( 'Neo EMCP', 'neo-pulse-wp' ), 'page' => 'neo-pulse-wp-emcp', 'default' => true ),
				),
			),
			'seo'            => array(
				'label' => __( 'SEO', 'neo-pulse-wp' ),
				'group' => $seo,
				'tabs'  => array(
					array( 'label' => __( 'Titles & meta', 'neo-pulse-wp' ), 'page' => 'neo-pulse-wp-seo' ),
					array( 'label' => __( 'Sitemap', 'neo-pulse-wp' ), 'page' => 'neo-pulse-wp-sitemap' ),
					array( 'label' => __( 'robots.txt', 'neo-pulse-wp' ), 'page' => 'neo-pulse-wp-robots-txt' ),
				),
			),
			'redirects'      => array(
				'label' => __( 'Redirects', 'neo-pulse-wp' ),
				'group' => $seo,
				'tabs'  => array(
					array( 'label' => __( 'Redirects', 'neo-pulse-wp' ), 'page' => 'neo-pulse-wp-redirects', 'default' => true ),
					array( 'label' => __( '404 log', 'neo-pulse-wp' ), 'page' => 'neo-pulse-wp-redirects', 'action' => '404' ),
					array( 'label' => __( 'Import & export', 'neo-pulse-wp' ), 'page' => 'neo-pulse-wp-redirects', 'action' => 'import-export' ),
					array( 'label' => __( 'Settings', 'neo-pulse-wp' ), 'page' => 'neo-pulse-wp-redirects', 'action' => 'settings' ),
				),
			),
			'image-seo'      => array(
				'label' => __( 'Image SEO', 'neo-pulse-wp' ),
				'group' => $seo,
				'tabs'  => array(
					array( 'label' => __( 'Library', 'neo-pulse-wp' ), 'page' => 'neo-pulse-wp-image-seo', 'tab' => 'library', 'default' => true ),
					array( 'label' => __( 'Settings', 'neo-pulse-wp' ), 'page' => 'neo-pulse-wp-image-seo', 'tab' => 'settings' ),
				),
			),
			'chat'           => array(
				'label' => __( 'Chat', 'neo-pulse-wp' ),
				'group' => $ai,
				'tabs'  => array(
					array( 'label' => __( 'Settings', 'neo-pulse-wp' ), 'page' => 'neo-pulse-wp-chat', 'tab' => 'general', 'default' => true ),
					array( 'label' => __( 'Training', 'neo-pulse-wp' ), 'page' => 'neo-pulse-wp-chat', 'tab' => 'training' ),
					array( 'label' => __( 'Knowledge base', 'neo-pulse-wp' ), 'page' => 'neo-pulse-wp-chat', 'tab' => 'knowledge-base' ),
					array( 'label' => __( 'Try it', 'neo-pulse-wp' ), 'page' => 'neo-pulse-wp-chat', 'tab' => 'demo' ),
					array( 'label' => __( 'Conversations', 'neo-pulse-wp' ), 'page' => 'neo-pulse-wp-chat-logs' ),
				),
			),
			'search'         => array(
				'label' => __( 'Search', 'neo-pulse-wp' ),
				'group' => $ai,
				'tabs'  => array(
					array( 'label' => __( 'Settings', 'neo-pulse-wp' ), 'page' => 'neo-pulse-wp-search', 'tab' => 'general', 'default' => true ),
					array( 'label' => __( 'Popular searches', 'neo-pulse-wp' ), 'page' => 'neo-pulse-wp-search', 'tab' => 'popular' ),
					array( 'label' => __( 'Shortcode', 'neo-pulse-wp' ), 'page' => 'neo-pulse-wp-search', 'tab' => 'shortcode' ),
					array( 'label' => __( 'Search log', 'neo-pulse-wp' ), 'page' => 'neo-pulse-wp-search-logs' ),
				),
			),
			'backend-assist' => array(
				'label' => __( 'Backend Assist', 'neo-pulse-wp' ),
				'group' => $ai,
				'tabs'  => array(
					array( 'label' => __( 'Assistant', 'neo-pulse-wp' ), 'page' => 'neo-pulse-wp-backend-assist' ),
					array( 'label' => __( 'Tool library', 'neo-pulse-wp' ), 'page' => 'neo-pulse-wp-tool-library' ),
				),
			),
			'insights'       => array(
				'label' => __( 'Insights', 'neo-pulse-wp' ),
				'group' => $insights,
				'tabs'  => array(
					array( 'label' => __( 'Search Console', 'neo-pulse-wp' ), 'page' => 'neo-pulse-wp-analytics' ),
					array( 'label' => __( 'Visitors', 'neo-pulse-wp' ), 'page' => 'neo-pulse-wp-overseer', 'action' => 'metrics', 'default' => true ),
				),
			),
			'script-manager' => array(
				'label' => __( 'Script Manager', 'neo-pulse-wp' ),
				'group' => $site,
				'tabs'  => array(
					array( 'label' => __( 'Scripts', 'neo-pulse-wp' ), 'page' => 'neo-pulse-wp-script-manager', 'default' => true ),
					array( 'label' => __( 'Import & export', 'neo-pulse-wp' ), 'page' => 'neo-pulse-wp-script-manager', 'action' => 'import-export' ),
					array( 'label' => __( 'Settings', 'neo-pulse-wp' ), 'page' => 'neo-pulse-wp-script-manager', 'action' => 'settings' ),
				),
			),
			'settings'       => array(
				'label' => __( 'Settings', 'neo-pulse-wp' ),
				'group' => $site,
				'tabs'  => array(
					array( 'label' => __( 'Licence', 'neo-pulse-wp' ), 'page' => 'neo-pulse-wp-settings', 'tab' => 'licence', 'default' => true ),
					array( 'label' => __( 'Editor AI', 'neo-pulse-wp' ), 'page' => 'neo-pulse-wp-settings', 'tab' => 'openrouter' ),
					array( 'label' => __( 'Search Console', 'neo-pulse-wp' ), 'page' => 'neo-pulse-wp-settings', 'tab' => 'gsc' ),
					array( 'label' => __( 'SEO research', 'neo-pulse-wp' ), 'page' => 'neo-pulse-wp-settings', 'tab' => 'dataforseo' ),
					array( 'label' => __( 'Google Business', 'neo-pulse-wp' ), 'page' => 'neo-pulse-wp-settings', 'tab' => 'gmb' ),
				),
			),
		);
	}

	/**
	 * @return string Section id for a screen, or '' (e.g. the Dashboard).
	 */
	public static function section_for_page( string $page ): string {
		foreach ( self::sections() as $id => $section ) {
			foreach ( $section['tabs'] as $tab ) {
				if ( $tab['page'] === $page ) {
					return $id;
				}
			}
		}
		return '';
	}

	public static function user_can_open( string $page ): bool {
		$pages = self::pages();
		return isset( $pages[ $page ] ) && current_user_can( $pages[ $page ]['capability'] );
	}

	public static function tab_url( array $tab ): string {
		$args = array( 'page' => $tab['page'] );
		if ( ! empty( $tab['tab'] ) ) {
			$args['tab'] = $tab['tab'];
		}
		if ( ! empty( $tab['action'] ) ) {
			$args['action'] = $tab['action'];
		}
		return add_query_arg( $args, admin_url( 'admin.php' ) );
	}

	/**
	 * The section's tabs the current user can open, each with `url` and `active`.
	 *
	 * @return array<int, array<string,mixed>>
	 */
	public static function section_tabs( string $section_id, string $page = '' ): array {
		$sections = self::sections();
		if ( ! isset( $sections[ $section_id ] ) ) {
			return array();
		}
		$page     = $page !== '' ? $page : self::current_page();
		$cur_tab  = isset( $_GET['tab'] ) ? sanitize_key( wp_unslash( (string) $_GET['tab'] ) ) : ''; // phpcs:ignore WordPress.Security.NonceVerification.Recommended
		$cur_act  = isset( $_GET['action'] ) ? sanitize_key( wp_unslash( (string) $_GET['action'] ) ) : ''; // phpcs:ignore WordPress.Security.NonceVerification.Recommended
		$tabs     = array();
		$matched  = -1;
		$fallback = -1;
		foreach ( $sections[ $section_id ]['tabs'] as $tab ) {
			if ( ! self::user_can_open( $tab['page'] ) ) {
				continue;
			}
			$i           = count( $tabs );
			$tab['url']  = self::tab_url( $tab );
			$tab['active'] = false;
			$tabs[]      = $tab;
			if ( $tab['page'] !== $page ) {
				continue;
			}
			if ( ! empty( $tab['tab'] ) && $tab['tab'] === $cur_tab ) {
				$matched = $i;
			} elseif ( ! empty( $tab['action'] ) && $tab['action'] === $cur_act ) {
				$matched = $i;
			}
			if ( $fallback < 0 && ( ! empty( $tab['default'] ) || ( empty( $tab['tab'] ) && empty( $tab['action'] ) ) ) ) {
				$fallback = $i;
			}
		}
		$active = $matched >= 0 ? $matched : $fallback;
		if ( $active >= 0 ) {
			$tabs[ $active ]['active'] = true;
		}
		return $tabs;
	}

	/**
	 * Whether a screen's own in-page tabs (?tab=) are already shown as section tabs.
	 */
	public static function section_shows_page_tabs( string $page ): bool {
		$section = self::section_for_page( $page );
		if ( $section === '' ) {
			return false;
		}
		foreach ( self::sections()[ $section ]['tabs'] as $tab ) {
			if ( $tab['page'] === $page && ! empty( $tab['tab'] ) ) {
				return true;
			}
		}
		return false;
	}

	public static function current_page(): string {
		return isset( $_GET['page'] ) ? sanitize_key( wp_unslash( (string) $_GET['page'] ) ) : ''; // phpcs:ignore WordPress.Security.NonceVerification.Recommended
	}

	/**
	 * The screen a section opens on in the sidebar: its first tab the user can open.
	 */
	public static function section_primary_page( string $section_id ): string {
		$sections = self::sections();
		if ( ! isset( $sections[ $section_id ] ) ) {
			return '';
		}
		foreach ( $sections[ $section_id ]['tabs'] as $tab ) {
			if ( self::user_can_open( $tab['page'] ) ) {
				return $tab['page'];
			}
		}
		return '';
	}

	public static function register(): void {
		// The menu title passed here also names the screen hooks (`neo-pulse-wp_page_...`) that the rest
		// of the plugin matches against, so it stays "NEO Pulse WP"; the visible sidebar label is swapped
		// to "Neo Pulse" right after. Position: filter_menu_order(). Icon: print_menu_icon_css().
		add_menu_page(
			__( 'NEO Pulse WP', 'neo-pulse-wp' ),
			__( 'NEO Pulse WP', 'neo-pulse-wp' ),
			Neo_Pulse_Wp_Admin::required_capability(),
			self::PARENT_SLUG,
			array( 'Neo_Pulse_Wp_Admin', 'render_app_page' ),
			'none',
			58
		);
		self::relabel_top_level_menu();

		foreach ( self::pages() as $slug => $page ) {
			add_submenu_page( self::PARENT_SLUG, $page['title'], $page['title'], $page['capability'], $slug, $page['callback'] );
		}
	}

	/**
	 * Sidebar: Dashboard, then one entry per section (named after the section). Screens that are a
	 * tab of a section stay registered but get a class that hides them.
	 */
	public static function arrange_submenu(): void {
		global $submenu;
		if ( ! isset( $submenu[ self::PARENT_SLUG ] ) || ! is_array( $submenu[ self::PARENT_SLUG ] ) ) {
			return;
		}

		$by_slug = array();
		foreach ( $submenu[ self::PARENT_SLUG ] as $entry ) {
			if ( is_array( $entry ) && isset( $entry[2] ) ) {
				$by_slug[ (string) $entry[2] ] = $entry;
			}
		}

		$new = array();
		if ( isset( $by_slug[ self::PARENT_SLUG ] ) ) {
			$entry    = $by_slug[ self::PARENT_SLUG ];
			$entry[0] = __( 'Dashboard', 'neo-pulse-wp' );
			$new[]    = $entry;
			unset( $by_slug[ self::PARENT_SLUG ] );
		}

		foreach ( self::sections() as $id => $section ) {
			$primary = self::section_primary_page( $id );
			if ( $primary === '' || ! isset( $by_slug[ $primary ] ) ) {
				continue;
			}
			$entry    = $by_slug[ $primary ];
			$entry[0] = $section['label'] . ( Neo_Pulse_Wp_Plan::is_ai_section( $id ) ? Neo_Pulse_Wp_Plan::label_chip() : '' );
			$new[]    = $entry;
			unset( $by_slug[ $primary ] );
		}

		foreach ( $by_slug as $entry ) {
			$entry[4] = trim( ( isset( $entry[4] ) ? (string) $entry[4] : '' ) . ' ' . self::HIDDEN_CLASS );
			$new[]    = $entry;
		}

		$submenu[ self::PARENT_SLUG ] = $new; // phpcs:ignore WordPress.WP.GlobalVariablesOverride.Prohibited
	}

	/**
	 * Keep the Neo Pulse menu open on every Neo Pulse screen.
	 *
	 * @param string|false|null $parent_file Parent menu file.
	 * @return string|false|null
	 */
	public static function filter_parent_file( $parent_file ) {
		$page = self::current_page();
		if ( $page === self::PARENT_SLUG || isset( self::pages()[ $page ] ) || 0 === strpos( $page, 'emcp-tools' ) ) {
			return self::PARENT_SLUG;
		}
		return $parent_file;
	}

	/**
	 * Highlight the section a screen belongs to.
	 *
	 * @param string|false|null $submenu_file Active submenu file.
	 * @param string|false|null $parent_file  Parent menu file.
	 * @return string|false|null
	 */
	public static function filter_submenu_file( $submenu_file, $parent_file ) {
		if ( $parent_file !== self::PARENT_SLUG ) {
			return $submenu_file;
		}
		$page = self::current_page();
		if ( 0 === strpos( $page, 'emcp-tools' ) ) {
			return 'neo-pulse-wp-emcp';
		}
		$section = self::section_for_page( $page );
		if ( $section === '' ) {
			return $submenu_file;
		}
		$primary = self::section_primary_page( $section );
		return $primary !== '' ? $primary : $submenu_file;
	}

	/**
	 * Visible sidebar label for the top-level item.
	 */
	private static function relabel_top_level_menu(): void {
		global $menu;

		if ( ! is_array( $menu ) ) {
			return;
		}

		foreach ( $menu as $position => $item ) {
			if ( is_array( $item ) && isset( $item[2] ) && self::PARENT_SLUG === $item[2] ) {
				$menu[ $position ][0] = __( 'Neo Pulse', 'neo-pulse-wp' ); // phpcs:ignore WordPress.WP.GlobalVariablesOverride.Prohibited
			}
		}
	}

	/**
	 * Turn on WordPress custom menu ordering so filter_menu_order() runs.
	 *
	 * @param bool $enabled Current value.
	 */
	public static function enable_custom_menu_order( $enabled ): bool {
		return true;
	}

	/**
	 * Place Neo Pulse directly below Neo Tools when Neo Tools is active, otherwise at the top.
	 * Numeric menu positions are compared with a natural sort and collide easily, so the order
	 * is set explicitly here instead.
	 *
	 * @param array<int, string>|mixed $order Top-level menu slugs in display order.
	 * @return array<int, string>|mixed
	 */
	public static function filter_menu_order( $order ) {
		if ( ! is_array( $order ) || ! in_array( self::PARENT_SLUG, $order, true ) ) {
			return $order;
		}

		$order = array_values(
			array_filter(
				$order,
				static function ( $slug ) {
					return self::PARENT_SLUG !== $slug;
				}
			)
		);

		$anchor = array_search( self::NEO_TOOLS_SLUG, $order, true );
		if ( false === $anchor ) {
			array_unshift( $order, self::PARENT_SLUG );
		} else {
			array_splice( $order, (int) $anchor + 1, 0, array( self::PARENT_SLUG ) );
		}

		return $order;
	}

	/**
	 * Pulse line icon (24x24 viewBox) in one colour.
	 *
	 * @param string $color Stroke colour (hex).
	 */
	public static function menu_icon_svg( string $color = '#84bd00' ): string {
		return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="' . $color . '" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">'
			. '<path d="M2.5 12.5h4l2.5 6 3.5-14 3 11.5 2-3.5h4"/>'
			. '</svg>';
	}

	/**
	 * Same treatment as the Neo Tools menu item: lime icon, brighter lime on hover, and a solid Neo
	 * green item with a white icon while any Neo Pulse screen is open. Drawn with CSS and
	 * URL-encoded rather than base64, because WordPress's svg-painter recolours base64 SVG icons.
	 */
	public static function print_menu_icon_css(): void {
		$icon  = 'data:image/svg+xml,' . rawurlencode( self::menu_icon_svg() );
		$hover = 'data:image/svg+xml,' . rawurlencode( self::menu_icon_svg( '#97d400' ) );
		$white = 'data:image/svg+xml,' . rawurlencode( self::menu_icon_svg( '#ffffff' ) );
		$item  = '#adminmenu li.toplevel_page_' . self::PARENT_SLUG;
		$idle  = $item . ':not(.current):not(.wp-has-current-submenu) > a';
		// Screens kept out of the sidebar (tabs of another section) are not always "current" in
		// WordPress's menu, so the Neo Pulse body class marks them too.
		$cur   = array( $item . '.current > a.menu-top', $item . '.wp-has-current-submenu > a.menu-top', 'body.neo-pulse-wp-admin-screen ' . $item . ' > a.menu-top' );

		$css  = $item . ' .wp-menu-image{background:url(' . esc_attr( $icon ) . ') center/20px 20px no-repeat;}';
		$css .= $item . ' .wp-menu-image:before{content:none;}';
		$css .= $idle . ':hover .wp-menu-image,' . $idle . ':focus .wp-menu-image{background-image:url(' . esc_attr( $hover ) . ');}';
		$sel  = array();
		$img  = array();
		foreach ( $cur as $current ) {
			$sel[] = $current;
			$sel[] = $current . ':hover';
			$sel[] = $current . ':focus';
			$img[] = $current . ' .wp-menu-image';
		}
		$css .= implode( ',', $sel ) . '{background:#84bd00;color:#fff;font-weight:600;}';
		$css .= implode( ',', $img ) . '{background-image:url(' . esc_attr( $white ) . ');}';

		// Screens that are a tab of another section stay registered but are not listed.
		$css .= $item . ' .wp-submenu li.' . self::HIDDEN_CLASS . '{display:none;}';
		echo '<style id="neo-pulse-wp-menu-icon">' . $css . '</style>' . "\n"; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- fixed markup.
	}

	/**
	 * Bundled Poppins (SIL OFL, see assets/admin/fonts/OFL.txt) as "NPWP Poppins"; no request to Google.
	 */
	public static function register_font_style(): void {
		if ( wp_style_is( 'neo-pulse-wp-admin-fonts', 'registered' ) ) {
			return;
		}

		$rel = 'assets/admin/admin-fonts.css';
		$abs = NEO_PULSE_WP_PLUGIN_DIR . $rel;
		$ver = defined( 'NEO_PULSE_WP_VERSION' ) ? NEO_PULSE_WP_VERSION : '0.5.0';
		if ( is_readable( $abs ) ) {
			$ver .= '.' . (string) filemtime( $abs );
		}

		wp_register_style( 'neo-pulse-wp-admin-fonts', plugin_dir_url( NEO_PULSE_WP_PLUGIN_FILE ) . $rel, array(), $ver );
	}
}
