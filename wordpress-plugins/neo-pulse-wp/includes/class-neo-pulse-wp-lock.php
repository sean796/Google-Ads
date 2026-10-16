<?php
/**
 * Lock: NEO Pulse does nothing until the site is activated.
 *
 * NEO Pulse is sold to Neo Digital clients only. Until the site key is confirmed by the Neo Digital
 * update server as licensed for NEO Pulse, the plugin still loads in full (its tables, settings,
 * upgrades and automatic imports all run as usual) and every screen can be opened, so a site owner
 * can see everything NEO Pulse does. But nothing can be used:
 *
 * - Front end: no SEO tags, schema, sitemaps, robots.txt or llms.txt changes, redirects, 404 log,
 *   scripts, search, chat, FAQ widget or anything else NEO Pulse would add to the site.
 * - Admin: every NEO Pulse screen shows dimmed and read-only under an "Activate NEO Pulse" card
 *   (Settings → Licence stays usable, so the key can be entered). Saving, importing and every other
 *   NEO Pulse action is refused on the server, not just hidden. The SEO and AI boxes in the post
 *   editor show, read-only. One thing always works: the site's own redirects and scripts can be
 *   downloaded as CSV (buttons on the card and the Licence tab), so a client whose licence lapses
 *   can take them to another plugin.
 * - API: NEO Pulse's REST routes refuse every change. Logged-in editors may still read (GET), so
 *   the screens can show what is there.
 * - Background jobs that use a feature (IndexNow pings, AI alt text, weekly search emails, chat
 *   starters) don't run.
 *
 * The AI, Search Console and update services also check the licence on Neo Digital's own server,
 * so those stay closed even if this file were edited.
 *
 * When is a site unlocked? When the update server's last answer for its key is "licensed". So that
 * a problem at Neo Digital never takes a client's SEO offline:
 * - a site confirmed licensed in the last 14 days stays unlocked while the server can't be reached;
 * - a site confirmed licensed in the last 14 days only locks once the server has said "no" for a
 *   whole day (one wrong answer, say a firewall dropping the key header, changes nothing);
 * - a key the server hasn't answered for yet (just entered, or the server was down) counts as
 *   unlocked for up to 24 hours while it is checked.
 * A site that was never confirmed locks as soon as the server says "no" (key missing, unknown,
 * switched off, or not licensed for NEO Pulse), and once a "no" has been heard, the server being
 * unreachable afterwards doesn't reopen anything.
 *
 * @package Neo_Pulse_Wp
 */

defined( 'ABSPATH' ) || exit;

class Neo_Pulse_Wp_Lock {

	/**
	 * What the lock remembers (one autoloaded option, so a page view costs no extra query):
	 * confirmed (last time the site was seen licensed), refused (when the server started saying no),
	 * pending (when a key with no answer yet was first seen), last ('1' locked / '0' unlocked, so
	 * rewrite rules are rebuilt when it changes).
	 */
	const OPTION = 'neo_pulse_wp_lock';

	/** A site confirmed this recently stays unlocked through an outage or a short run of refusals. */
	const OUTAGE_GRACE = 14 * DAY_IN_SECONDS;

	/** How long a recently confirmed site keeps working while the server says no. */
	const REFUSAL_GRACE = DAY_IN_SECONDS;

	/** A key with no answer yet stays unlocked this long while it is checked. */
	const PENDING_GRACE = DAY_IN_SECONDS;

	/** NEO Pulse screens ask the server again at most this often while locked. */
	const SCREEN_RECHECK = 5 * MINUTE_IN_SECONDS;

	/** @var bool|null Decided once per request. */
	private static $locked = null;

	/** @var string Normalised plugin directory. */
	private static $dir = '';

	public static function init(): void {
		add_action( 'plugins_loaded', array( __CLASS__, 'boot' ), PHP_INT_MAX - 10 );
	}

	/* ---------- The decision ---------- */

	/**
	 * Whether NEO Pulse is locked on this site. Decided once per request (when the plugin has loaded)
	 * and kept for the whole request, so features never switch on or off halfway through a page.
	 */
	public static function is_locked(): bool {
		if ( null === self::$locked ) {
			self::$locked = self::decide(); // No filter on purpose: the lock can't be switched off from another plugin.
		}
		return self::$locked;
	}

	/**
	 * Forget this request's answer (tests only).
	 */
	public static function flush(): void {
		self::$locked = null;
	}

	/**
	 * Server answers that mean "this key doesn't get NEO Pulse".
	 *
	 * @return string[]
	 */
	private static function refusals(): array {
		return array( 'missing_key', 'invalid_key', 'revoked_key', 'not_licensed' );
	}

	/**
	 * @return array{confirmed:int,refused:int,pending:int,last:string}
	 */
	private static function memory(): array {
		$mem = get_option( self::OPTION );
		$mem = is_array( $mem ) ? $mem : array();
		return array(
			'confirmed' => isset( $mem['confirmed'] ) ? (int) $mem['confirmed'] : 0,
			'refused'   => isset( $mem['refused'] ) ? (int) $mem['refused'] : 0,
			'pending'   => isset( $mem['pending'] ) ? (int) $mem['pending'] : 0,
			'last'      => isset( $mem['last'] ) ? (string) $mem['last'] : '',
		);
	}

	/**
	 * @param array<string,mixed> $mem What to remember.
	 */
	private static function remember( array $mem ): void {
		update_option( self::OPTION, $mem, true );
	}

	private static function decide(): bool {
		if ( '' === Neo_Pulse_Wp_License::site_key() ) {
			return true;
		}

		// Uses the stored answer; asks the server in the background when it is out of date.
		Neo_Pulse_Wp_License::is_licensed( false );
		$state  = Neo_Pulse_Wp_License::state();
		$status = (string) $state['status'];
		$now    = time();
		$mem    = self::memory();

		if ( ! empty( $state['licensed'] ) ) {
			if ( $mem['refused'] || $mem['pending'] || $now - $mem['confirmed'] > HOUR_IN_SECONDS ) {
				$mem['confirmed'] = $now;
				$mem['refused']   = 0;
				$mem['pending']   = 0;
				self::remember( $mem );
			}
			return false;
		}

		$confirmed = max( $mem['confirmed'], (int) $state['last_active'] );
		$recent    = $confirmed > $now - self::OUTAGE_GRACE;

		// The server said no (now, or earlier with no "yes" since).
		if ( $mem['refused'] || in_array( $status, self::refusals(), true ) ) {
			if ( ! $mem['refused'] || $mem['refused'] > $now ) {
				$mem['refused'] = $now;
				self::remember( $mem );
			}
			// A site that was working keeps working for a day, in case the "no" was a mistake.
			return ! ( $recent && $now - $mem['refused'] < self::REFUSAL_GRACE );
		}

		if ( in_array( $status, array( 'unknown', 'unreachable' ), true ) ) {
			if ( $recent ) {
				return false; // Confirmed recently; the server is down or hasn't been asked again yet.
			}
			// Never answered for this key yet (just entered, or the server was down): open while it is checked.
			if ( ! $mem['pending'] || $mem['pending'] > $now ) {
				$mem['pending'] = $now;
				self::remember( $mem );
			}
			return ( $now - $mem['pending'] ) >= self::PENDING_GRACE;
		}

		return true;
	}

	/**
	 * When a recently confirmed site that the server is now refusing will lock (0 when it isn't in
	 * that day of grace). Shown on Settings → Licence.
	 */
	public static function locks_at(): int {
		if ( self::is_locked() ) {
			return 0;
		}
		$mem = self::memory();
		return $mem['refused'] ? $mem['refused'] + self::REFUSAL_GRACE : 0;
	}

	/* ---------- Boot ---------- */

	public static function boot(): void {
		self::$dir = wp_normalize_path( NEO_PULSE_WP_PLUGIN_DIR );

		self::maybe_recheck_for_screen();
		$locked = self::is_locked();

		add_action( 'wp_loaded', array( __CLASS__, 'maybe_rebuild_rewrites' ) );
		add_filter( 'admin_body_class', array( __CLASS__, 'admin_body_class' ), 20 );
		add_action( 'admin_enqueue_scripts', array( __CLASS__, 'enqueue_admin_assets' ), 99 );

		if ( ! $locked ) {
			return;
		}

		self::strip();
		add_action( 'wp_loaded', array( __CLASS__, 'strip' ), 0 ); // Again, for anything added during init.

		add_action( 'admin_init', array( __CLASS__, 'guard_actions' ), 0 );
		add_filter( 'rest_pre_dispatch', array( __CLASS__, 'guard_rest' ), 0, 3 );
		add_filter( 'pre_do_shortcode_tag', array( __CLASS__, 'guard_shortcode' ), 0, 2 );
		add_filter( 'elementor/frontend/widget/should_render', array( __CLASS__, 'guard_widget' ), 10, 2 );
		add_filter( 'elementor/widget/render_content', array( __CLASS__, 'widget_placeholder' ), 10, 2 );
		add_action( 'add_meta_boxes', array( __CLASS__, 'wrap_meta_boxes' ), PHP_INT_MAX );
	}

	/**
	 * Opening a NEO Pulse screen while locked with a key asks the server again (at most every
	 * 5 minutes), so a site Neo Digital has just licensed unlocks on the next click.
	 */
	private static function maybe_recheck_for_screen(): void {
		if ( ! is_admin() || wp_doing_ajax() || ! self::is_pulse_screen_request() ) {
			return;
		}
		if ( ! current_user_can( 'manage_options' ) || '' === Neo_Pulse_Wp_License::site_key() ) {
			return;
		}
		$state = Neo_Pulse_Wp_License::state();
		if ( ! empty( $state['licensed'] ) || time() - (int) $state['checked'] < self::SCREEN_RECHECK ) {
			return;
		}
		Neo_Pulse_Wp_License::refresh();
	}

	/**
	 * Sitemaps, llms.txt and the category base add rewrite rules only while unlocked, so the rules are
	 * rebuilt once whenever the lock changes.
	 */
	public static function maybe_rebuild_rewrites(): void {
		$now = self::is_locked() ? '1' : '0';
		$mem = self::memory();
		$last = $mem['last'];
		if ( $last === $now ) {
			return;
		}
		if ( '' === $last && '0' === $now ) {
			$mem['last'] = $now;
			self::remember( $mem );
			return; // First run on an unlocked site: its rules already include NEO Pulse's.
		}
		if ( get_transient( 'neo_pulse_wp_lock_flush' ) ) {
			return; // Another request is rebuilding them right now; if it was for the other state, this retries next request.
		}
		set_transient( 'neo_pulse_wp_lock_flush', 1, 15 );
		$mem['last'] = $now;
		self::remember( $mem );
		flush_rewrite_rules( false );
		delete_transient( 'neo_pulse_wp_lock_flush' );
	}

	/* ---------- Switching features off ---------- */

	/**
	 * Hooks where every NEO Pulse callback is front-end output or use of a feature.
	 *
	 * @return string[]
	 */
	public static function output_hooks(): array {
		return array(
			'wp',
			'parse_request',
			'request',
			'template_redirect',
			'send_headers',
			'wp_head',
			'wp_body_open',
			'wp_footer',
			'wp_enqueue_scripts',
			'pre_get_document_title',
			'document_title_parts',
			'wp_title',
			'wp_robots',
			'robots_txt',
			'the_content',
			'redirect_canonical',
			'get_canonical_url',
			'language_attributes',
			'category_link',
			'category_rewrite_rules',
			'query_vars',
			'wp_sitemaps_enabled',
			// Background jobs that use a feature.
			'neo_pulse_novamira_page_design',
			'neo_pulse_wp_generate_chat_starters',
			'neo_pulse_wp_refresh_chat_starters',
			'neo_pulse_wp_image_seo_retry',
			'neo_pulse_wp_indexnow_send',
			'neo_pulse_wp_search_weekly_terms',
		);
	}

	/**
	 * Single callbacks on shared hooks (the same hooks also run NEO Pulse's upgrades, imports and caches,
	 * which keep running).
	 *
	 * @return array<string,string[]> hook => callbacks (Class::method).
	 */
	public static function output_callbacks(): array {
		return array(
			'init'                   => array(
				'Neo_Pulse_Wp_Seo_Indexnow::maybe_serve_key',
				'Neo_Pulse_Wp_Sitemap_Style::maybe_serve',
				'Neo_Pulse_Wp_Sitemap::register_rewrites',
				'Neo_Pulse_Wp_Llms_Txt::register_rewrites',
			),
			'save_post'              => array(
				'Neo_Pulse_Wp_Seo_Meta_Box::save',
				'Neo_Pulse_Wp_Admin::save_bulk_edit_content_type',
			),
			'transition_post_status' => array( 'Neo_Pulse_Wp_Seo_Indexnow::on_transition' ),
			'add_attachment'         => array( 'Neo_Pulse_Wp_Image_Seo::maybe_auto_on_upload' ),
		);
	}

	/**
	 * Take NEO Pulse's feature callbacks off their hooks for this request.
	 */
	public static function strip(): void {
		global $wp_filter;
		foreach ( self::output_hooks() as $hook ) {
			if ( isset( $wp_filter[ $hook ] ) ) {
				self::strip_hook( $hook, null );
			}
		}
		foreach ( self::output_callbacks() as $hook => $names ) {
			if ( isset( $wp_filter[ $hook ] ) ) {
				self::strip_hook( $hook, array_map( 'strtolower', $names ) );
			}
		}
	}

	/**
	 * @param string        $hook  Hook name.
	 * @param string[]|null $names Only these callbacks (lower-case Class::method); null for every NEO Pulse callback.
	 */
	private static function strip_hook( string $hook, ?array $names ): void {
		global $wp_filter;
		foreach ( $wp_filter[ $hook ]->callbacks as $priority => $callbacks ) {
			foreach ( $callbacks as $entry ) {
				$callback = $entry['function'];
				if ( null !== $names ) {
					if ( ! in_array( strtolower( self::callback_name( $callback ) ), $names, true ) ) {
						continue;
					}
				} elseif ( ! self::is_pulse_callback( $callback ) ) {
					continue;
				}
				remove_filter( $hook, $callback, $priority );
			}
		}
	}

	/**
	 * Class::method for a static/array callback, the function name otherwise.
	 *
	 * @param mixed $callback Callback.
	 */
	private static function callback_name( $callback ): string {
		if ( is_array( $callback ) && 2 === count( $callback ) ) {
			$class = is_object( $callback[0] ) ? get_class( $callback[0] ) : (string) $callback[0];
			return $class . '::' . (string) $callback[1];
		}
		return is_string( $callback ) ? $callback : '';
	}

	/**
	 * True when the callback is defined in NEO Pulse's own files (but never the licence or lock code).
	 *
	 * @param mixed $callback Callback.
	 */
	private static function is_pulse_callback( $callback ): bool {
		try {
			if ( is_array( $callback ) && 2 === count( $callback ) ) {
				$ref = new ReflectionMethod( $callback[0], (string) $callback[1] );
			} elseif ( is_string( $callback ) && false !== strpos( $callback, '::' ) ) {
				list( $class, $method ) = explode( '::', $callback, 2 );
				$ref = new ReflectionMethod( $class, $method );
			} elseif ( $callback instanceof Closure || ( is_string( $callback ) && function_exists( $callback ) ) ) {
				$ref = new ReflectionFunction( $callback );
			} else {
				return false;
			}
		} catch ( ReflectionException $e ) {
			return false;
		}
		$file = (string) $ref->getFileName();
		if ( '' === $file ) {
			return false;
		}
		$file = wp_normalize_path( $file );
		if ( 0 !== strpos( $file, self::$dir ) ) {
			return false;
		}
		$own = array(
			wp_normalize_path( __FILE__ ),
			wp_normalize_path( self::$dir . 'includes/class-neo-pulse-wp-license.php' ),
			wp_normalize_path( self::$dir . 'includes/class-neo-pulse-wp-mcp.php' ),
		);
		if ( in_array( $file, $own, true ) ) {
			return false;
		}
		if ( 0 === strpos( $file, wp_normalize_path( self::$dir . 'includes/mcp/' ) ) || 0 === strpos( $file, wp_normalize_path( self::$dir . 'includes/emcp/' ) ) ) {
			return false;
		}
		return true;
	}

	/* ---------- Guards ---------- */

	/**
	 * admin-post.php and admin-ajax.php: refuse every NEO Pulse action except entering the site key.
	 */
	public static function guard_actions(): void {
		$doing_ajax = wp_doing_ajax();
		$script     = isset( $GLOBALS['pagenow'] ) ? (string) $GLOBALS['pagenow'] : '';
		if ( '' === $script && isset( $_SERVER['SCRIPT_NAME'] ) ) {
			$script = basename( (string) $_SERVER['SCRIPT_NAME'] );
		}
		if ( ! $doing_ajax && 'admin-post.php' !== $script ) {
			return;
		}
		$action = isset( $_REQUEST['action'] ) ? sanitize_key( wp_unslash( (string) $_REQUEST['action'] ) ) : ''; // phpcs:ignore WordPress.Security.NonceVerification.Recommended -- refusing, not acting.
		if ( '' === $action || 0 !== strpos( $action, 'neo_pulse' ) ) {
			return;
		}
		if ( in_array( $action, self::allowed_actions(), true ) ) {
			return;
		}
		if ( $doing_ajax ) {
			wp_send_json_error(
				array(
					'code'    => 'neo_pulse_wp_locked',
					'message' => self::locked_message(),
				),
				403
			);
		}
		wp_die(
			wp_kses_post(
				'<h1>' . esc_html__( 'NEO Pulse is locked', 'neo-pulse-wp' ) . '</h1><p>' . esc_html( self::locked_message() ) . '</p>'
				. ( current_user_can( 'manage_options' ) ? '<p><a class="button button-primary" href="' . esc_url( Neo_Pulse_Wp_License::settings_url() ) . '">' . esc_html__( 'Activate NEO Pulse', 'neo-pulse-wp' ) . '</a></p>' : '' )
			),
			esc_html__( 'NEO Pulse is locked', 'neo-pulse-wp' ),
			array( 'response' => 403 )
		);
	}

	/**
	 * Actions that work while locked: entering and checking the site key.
	 *
	 * @return string[]
	 */
	public static function allowed_actions(): array {
		return array(
			Neo_Pulse_Wp_License::ACTION_SAVE,
			Neo_Pulse_Wp_License::ACTION_CHECK,
			'neo_pulse_wp_save_mcp',
			// The site's own data, so it can be moved elsewhere if the licence lapses.
			self::EXPORT_REDIRECTS,
			self::EXPORT_SCRIPTS,
		);
	}

	/* ---------- Taking your data with you ---------- */

	/** Existing CSV exports (Redirects → Import & export, Script Manager → Import & export). */
	const EXPORT_REDIRECTS = 'neo_pulse_wp_export_redirects';
	const EXPORT_SCRIPTS   = 'neo_pulse_wp_export_scripts';

	/** @var array<string,int>|null */
	private static $export_counts = null;

	/**
	 * How many redirects and scripts the site has (not counting the trash).
	 *
	 * @return array{redirects:int,scripts:int}
	 */
	public static function export_counts(): array {
		if ( null !== self::$export_counts ) {
			return self::$export_counts;
		}
		global $wpdb;
		$counts = array( 'redirects' => 0, 'scripts' => 0 );
		$tables = array(
			'redirects' => class_exists( 'Neo_Pulse_Wp_Redirects', false ) ? Neo_Pulse_Wp_Redirects::table_name() : '',
			'scripts'   => class_exists( 'Neo_Pulse_Wp_Script_Manager', false ) ? Neo_Pulse_Wp_Script_Manager::table_name() : '',
		);
		$quiet = $wpdb->suppress_errors( true );
		foreach ( $tables as $what => $table ) {
			if ( '' !== $table ) {
				// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, WordPress.DB.PreparedSQL.InterpolatedNotPrepared -- table name from the plugin.
				$counts[ $what ] = (int) $wpdb->get_var( "SELECT COUNT(*) FROM `{$table}` WHERE status != 'trash'" );
			}
		}
		$wpdb->suppress_errors( $quiet );
		self::$export_counts = $counts;
		return $counts;
	}

	/**
	 * "Download your redirects / scripts" buttons (administrators, while locked, when there is something to export).
	 */
	public static function render_export_buttons(): void {
		if ( ! self::is_locked() || ! current_user_can( 'manage_options' ) ) {
			return;
		}
		$counts  = self::export_counts();
		$exports = array();
		if ( $counts['redirects'] > 0 ) {
			/* translators: %s: number of redirects */
			$exports[] = array( self::EXPORT_REDIRECTS, 'neo_pulse_wp_export_redirects_nonce', sprintf( _n( 'Export %s redirect (CSV)', 'Export %s redirects (CSV)', $counts['redirects'], 'neo-pulse-wp' ), number_format_i18n( $counts['redirects'] ) ) );
		}
		if ( $counts['scripts'] > 0 ) {
			/* translators: %s: number of scripts */
			$exports[] = array( self::EXPORT_SCRIPTS, 'neo_pulse_wp_export_scripts_nonce', sprintf( _n( 'Export %s script (CSV)', 'Export %s scripts (CSV)', $counts['scripts'], 'neo-pulse-wp' ), number_format_i18n( $counts['scripts'] ) ) );
		}
		if ( ! $exports ) {
			return;
		}
		?>
		<div class="npwp-lock__exports">
			<span class="npwp-lock__exports-label"><?php esc_html_e( 'Your data stays yours. Download it any time:', 'neo-pulse-wp' ); ?></span>
			<?php foreach ( $exports as $export ) : ?>
				<form method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>">
					<input type="hidden" name="action" value="<?php echo esc_attr( $export[0] ); ?>" />
					<?php wp_nonce_field( $export[0], $export[1] ); ?>
					<button type="submit" class="npwp-lock__export"><?php echo esc_html( $export[2] ); ?></button>
				</form>
			<?php endforeach; ?>
		</div>
		<?php
	}

	/**
	 * NEO Pulse REST routes: refuse everything except reads by logged-in editors (so the screens can
	 * show what is there). Search Console suggestions and the Google Business sign-in are refused even
	 * for reads, and every AI request is stopped by the licence anyway.
	 *
	 * @param mixed           $result  Response to send instead, if any.
	 * @param WP_REST_Server  $server  Server.
	 * @param WP_REST_Request $request Request.
	 * @return mixed
	 */
	public static function guard_rest( $result, $server, $request ) {
		if ( null !== $result || ! $request instanceof WP_REST_Request ) {
			return $result;
		}
		$route = '/' . ltrim( strtolower( (string) $request->get_route() ), '/' ); // WordPress matches routes case-insensitively.
		if ( 0 !== strpos( $route, '/neo-pulse/v1/' ) ) {
			return $result;
		}
		$read = in_array( $request->get_method(), array( 'GET', 'HEAD' ), true );
		// Reads that are really actions: Search Console suggestions, the Google Business sign-in.
		$feature_read = 0 === strpos( $route, '/neo-pulse/v1/ai/gsc-suggestions' ) || 0 === strpos( $route, '/neo-pulse/v1/gmb/callback' );
		if ( $read && ! $feature_read && is_user_logged_in() && current_user_can( 'edit_posts' ) ) {
			return $result;
		}
		return new WP_Error( 'neo_pulse_wp_locked', self::locked_message(), array( 'status' => 403 ) );
	}

	/**
	 * NEO Pulse shortcodes print nothing while locked.
	 *
	 * @param false|string $return Output to use instead.
	 * @param string       $tag    Shortcode tag.
	 * @return false|string
	 */
	public static function guard_shortcode( $return, $tag ) {
		global $shortcode_tags;
		if ( false !== $return || ! isset( $shortcode_tags[ $tag ] ) ) {
			return $return;
		}
		return self::is_pulse_callback( $shortcode_tags[ $tag ] ) ? '' : $return;
	}

	/**
	 * NEO Pulse Elementor widget names.
	 *
	 * @return string[]
	 */
	public static function widget_names(): array {
		return array( 'neo-pulse_chat', 'neo-pulse_search', 'neo-pulse_faq' );
	}

	/**
	 * @param mixed $widget Elementor widget.
	 */
	private static function is_pulse_widget( $widget ): bool {
		return is_object( $widget ) && method_exists( $widget, 'get_name' ) && in_array( (string) $widget->get_name(), self::widget_names(), true );
	}

	/**
	 * NEO Pulse widgets don't show on the live site while locked.
	 *
	 * @param bool  $should_render Whether to render.
	 * @param mixed $widget        Elementor widget.
	 */
	public static function guard_widget( $should_render, $widget ) {
		return self::is_pulse_widget( $widget ) ? false : $should_render;
	}

	/**
	 * In the Elementor editor a NEO Pulse widget shows a "locked" box instead of its content.
	 *
	 * @param string $content Widget HTML.
	 * @param mixed  $widget  Elementor widget.
	 */
	public static function widget_placeholder( $content, $widget ) {
		if ( ! self::is_pulse_widget( $widget ) ) {
			return $content;
		}
		$editing = class_exists( '\Elementor\Plugin' ) && isset( \Elementor\Plugin::$instance->editor ) && \Elementor\Plugin::$instance->editor->is_edit_mode();
		$preview = class_exists( '\Elementor\Plugin' ) && isset( \Elementor\Plugin::$instance->preview ) && \Elementor\Plugin::$instance->preview->is_preview_mode();
		if ( ! $editing && ! $preview ) {
			return '';
		}
		return '<div style="padding:18px 20px;border:1px dashed #b9dd5c;border-radius:12px;background:#f6faea;font:500 14px/1.5 system-ui,sans-serif;color:#02050a;">'
			. '<strong>' . esc_html( (string) $widget->get_title() ) . '</strong><br>'
			. esc_html__( 'Locked until NEO Pulse is activated on this site. Visitors don\'t see this widget yet.', 'neo-pulse-wp' )
			. '</div>';
	}

	/**
	 * NEO Pulse boxes in the post editor show read-only, under a short "locked" note.
	 */
	public static function wrap_meta_boxes(): void {
		global $wp_meta_boxes;
		if ( ! is_array( $wp_meta_boxes ) ) {
			return;
		}
		$ids = array( 'neo_pulse_wp_seo' );
		if ( class_exists( 'Neo_Pulse_Wp_Editor', false ) && defined( 'Neo_Pulse_Wp_Editor::META_BOX_ID' ) ) {
			$ids[] = (string) Neo_Pulse_Wp_Editor::META_BOX_ID;
		}
		foreach ( $wp_meta_boxes as $screen => $contexts ) {
			foreach ( (array) $contexts as $context => $priorities ) {
				foreach ( (array) $priorities as $priority => $boxes ) {
					foreach ( (array) $boxes as $id => $box ) {
						if ( ! is_array( $box ) || ! in_array( (string) $id, $ids, true ) || empty( $box['callback'] ) ) {
							continue;
						}
						$original = $box['callback'];
						$wp_meta_boxes[ $screen ][ $context ][ $priority ][ $id ]['callback'] = static function ( $post, $meta_box ) use ( $original ) {
							Neo_Pulse_Wp_Lock::render_meta_box_note();
							echo '<div class="npwp-lock-box" inert>';
							call_user_func( $original, $post, $meta_box );
							echo '</div>';
						};
					}
				}
			}
		}
	}

	public static function render_meta_box_note(): void {
		echo '<p class="npwp-lock-note"><span class="dashicons dashicons-lock" aria-hidden="true"></span> ';
		esc_html_e( 'Locked until NEO Pulse is activated on this site.', 'neo-pulse-wp' );
		if ( current_user_can( 'manage_options' ) ) {
			echo ' <a href="' . esc_url( Neo_Pulse_Wp_License::settings_url() ) . '">' . esc_html__( 'Activate', 'neo-pulse-wp' ) . '</a>';
		}
		echo '</p>';
	}

	/* ---------- Admin screens ---------- */

	public static function locked_message(): string {
		return __( 'NEO Pulse is not activated on this site yet. Enter the site key from Neo Digital under NEO Pulse → Settings → Licence to unlock it.', 'neo-pulse-wp' );
	}

	/**
	 * True on a NEO Pulse admin screen request (?page=neo-pulse-wp…).
	 */
	public static function is_pulse_screen_request(): bool {
		$page = isset( $_GET['page'] ) ? sanitize_key( wp_unslash( (string) $_GET['page'] ) ) : ''; // phpcs:ignore WordPress.Security.NonceVerification.Recommended -- display only.
		return '' !== $page && 0 === strpos( $page, 'neo-pulse-wp' );
	}

	/**
	 * Settings → Licence, the one screen that stays usable while locked.
	 */
	public static function is_licence_screen(): bool {
		$page = isset( $_GET['page'] ) ? sanitize_key( wp_unslash( (string) $_GET['page'] ) ) : ''; // phpcs:ignore WordPress.Security.NonceVerification.Recommended -- display only.
		$tab  = isset( $_GET['tab'] ) ? sanitize_key( wp_unslash( (string) $_GET['tab'] ) ) : ''; // phpcs:ignore WordPress.Security.NonceVerification.Recommended -- display only.
		// Same fallback as the Settings page: an unknown tab shows the licence form.
		return 'neo-pulse-wp-settings' === $page && ! in_array( $tab, array( 'openrouter', 'gsc', 'dataforseo', 'gmb' ), true );
	}

	/**
	 * Whether the current admin screen shows locked (a NEO Pulse screen other than the licence tab).
	 */
	public static function screen_is_locked(): bool {
		return self::is_locked() && self::is_pulse_screen_request() && ! self::is_licence_screen();
	}

	/**
	 * @param string|mixed $classes Admin body classes.
	 * @return string|mixed
	 */
	public static function admin_body_class( $classes ) {
		if ( is_string( $classes ) && self::screen_is_locked() ) {
			$classes .= ' npwp-locked';
		}
		return $classes;
	}

	/**
	 * @param string|mixed $hook_suffix Admin page hook.
	 */
	public static function enqueue_admin_assets( $hook_suffix ): void {
		if ( ! self::is_locked() ) {
			return;
		}
		$editor = in_array( (string) $hook_suffix, array( 'post.php', 'post-new.php' ), true );
		if ( ! $editor && ! self::is_pulse_screen_request() ) {
			return;
		}
		$ver = defined( 'NEO_PULSE_WP_VERSION' ) ? NEO_PULSE_WP_VERSION : null;
		wp_enqueue_style( 'neo-pulse-wp-lock', plugin_dir_url( NEO_PULSE_WP_PLUGIN_FILE ) . 'assets/admin/admin-lock.css', array(), $ver );
		if ( self::screen_is_locked() ) {
			// Keyboard and screen readers skip the locked parts too (the CSS already blocks the mouse).
			wp_register_script( 'neo-pulse-wp-lock', '', array(), $ver, true );
			wp_enqueue_script( 'neo-pulse-wp-lock' );
			wp_add_inline_script(
				'neo-pulse-wp-lock',
				'document.querySelectorAll(' . wp_json_encode( self::locked_selector() ) . ').forEach(function(el){el.inert=true;el.setAttribute("aria-hidden","true");});'
			);
		}
	}

	/**
	 * The parts of a NEO Pulse screen that lock: everything in the frame except the heading, the tabs,
	 * notices and the lock card.
	 */
	public static function locked_selector(): string {
		return 'body.npwp-locked .npwp-admin__frame > :not(.npwp-head):not(.npwp-tabs):not(.npwp-lock):not(.notice)';
	}

	/**
	 * The "Activate NEO Pulse" card at the top of a locked screen.
	 */
	public static function render_admin_card(): void {
		if ( ! self::screen_is_locked() ) {
			return;
		}
		$admin  = current_user_can( 'manage_options' );
		$key    = '' !== Neo_Pulse_Wp_License::site_key();
		$state  = Neo_Pulse_Wp_License::state();
		$reason = $key && '' !== (string) $state['message'] && empty( $state['licensed'] ) ? (string) $state['message'] : '';
		?>
		<section class="npwp-lock" role="region" aria-label="<?php esc_attr_e( 'NEO Pulse is locked', 'neo-pulse-wp' ); ?>">
			<span class="npwp-lock__icon" aria-hidden="true">
				<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>
			</span>
			<div class="npwp-lock__text">
				<h2 class="npwp-lock__title"><?php esc_html_e( 'Activate NEO Pulse to unlock this', 'neo-pulse-wp' ); ?></h2>
				<p class="npwp-lock__desc">
					<?php esc_html_e( 'Everything on this screen is part of NEO Pulse, shown so you can see what it does. Nothing here runs on your site until NEO Pulse is activated with a site key from Neo Digital.', 'neo-pulse-wp' ); ?>
				</p>
				<?php if ( '' !== $reason ) : ?>
					<p class="npwp-lock__reason"><?php echo esc_html( $reason ); ?></p>
				<?php endif; ?>
				<?php self::render_export_buttons(); ?>
			</div>
			<div class="npwp-lock__actions">
				<?php if ( $admin ) : ?>
					<a class="npwp-lock__btn npwp-lock__btn--primary" href="<?php echo esc_url( Neo_Pulse_Wp_License::settings_url() ); ?>"><?php echo $key ? esc_html__( 'Licence details', 'neo-pulse-wp' ) : esc_html__( 'Enter site key', 'neo-pulse-wp' ); ?></a>
				<?php else : ?>
					<span class="npwp-lock__hint"><?php esc_html_e( 'Ask your site administrator to activate NEO Pulse.', 'neo-pulse-wp' ); ?></span>
				<?php endif; ?>
				<a class="npwp-lock__btn" href="<?php echo esc_url( defined( 'NEO_PULSE_WP_POWERED_URL' ) ? NEO_PULSE_WP_POWERED_URL : 'https://neodigital.ca/neo-pulse-platform/' ); ?>" target="_blank" rel="noopener noreferrer"><?php esc_html_e( 'Get NEO Pulse', 'neo-pulse-wp' ); ?></a>
			</div>
		</section>
		<?php
	}
}
