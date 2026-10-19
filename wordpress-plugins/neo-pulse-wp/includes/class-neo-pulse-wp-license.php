<?php
/**
 * Licence: whether this site may use Neo Pulse's live AI services.
 *
 * Neo Digital switches Neo Pulse on or off per site on its update server (neodigital.ca → Plugin Updates).
 * The site uses the same site key as Neo Tools (or its own, entered under Settings → Licence) and asks
 * the server about every 15 minutes whether it is licensed.
 *
 * When it is not (Neo Pulse switched off for the site, key switched off, key unknown or missing):
 * - every request Neo Pulse itself makes to OpenRouter, DataForSEO, Semrush or AgentMail is refused here,
 *   before it leaves the site, so AI wands, chat replies, AI search and SEO research stop at once;
 * - the chat widget is hidden from visitors and the admin;
 * - the update server stops offering new versions.
 * FAQ, redirects, sitemaps and the other non-AI tools keep working, so the client's
 * site never visibly breaks.
 *
 * If neodigital.ca cannot be reached, the last answer from the server stands for up to 72 hours, so an
 * outage on Neo Digital's side does not switch every client off. A "no" from the server always applies
 * straight away.
 *
 * @package Neo_Pulse_Wp
 */

defined( 'ABSPATH' ) || exit;

class Neo_Pulse_Wp_License {

	const SLUG          = 'neo-pulse-wp';
	const STATE_OPTION  = 'neo_pulse_wp_license_state';
	const KEY_OPTION    = 'neo_pulse_wp_site_key';
	const LOCK          = 'neo_pulse_wp_license_lock';
	const CRON_HOOK     = 'neo_pulse_wp_license_refresh';
	const ACTION_SAVE   = 'neo_pulse_wp_save_license';
	const ACTION_CHECK  = 'neo_pulse_wp_check_license';
	const DEFAULT_TTL   = 900; // 15 minutes.
	const MIN_TTL       = 300; // Never ask the server more often than every 5 minutes.
	const OUTAGE_GRACE  = 259200; // 72 hours.
	const DEFAULT_SERVER = 'https://neodigital.ca/wp-json/neo-updates/v1';
	const SERVER_PATH    = '/wp-json/neo-updates/v1';

	/** NEO Pulse plans Neo Digital can give a site (update server `plan`). */
	const PLAN_PRO    = 'pro';
	const PLAN_PRO_AI = 'pro_ai';

	/**
	 * Per-request copy of the stored state (null until first read).
	 *
	 * @var array<string,mixed>|null
	 */
	private static $memo = null;

	/**
	 * Live services that need a licence. Matched against the host of each outgoing request.
	 *
	 * @return string[]
	 */
	public static function gated_hosts(): array {
		return array( 'openrouter.ai', 'api.dataforseo.com', 'api.semrush.com', 'api.agentmail.to' );
	}

	public static function init(): void {
		add_filter( 'pre_http_request', array( __CLASS__, 'filter_http_request' ), 10, 3 );
		add_filter( 'http_request_args', array( __CLASS__, 'add_key_header' ), 10, 2 );
		add_action( self::CRON_HOOK, array( __CLASS__, 'refresh' ) );
		add_action( 'admin_post_' . self::ACTION_SAVE, array( __CLASS__, 'handle_save_key' ) );
		add_action( 'admin_post_' . self::ACTION_CHECK, array( __CLASS__, 'handle_check_now' ) );
		add_action( 'admin_notices', array( __CLASS__, 'render_admin_notice' ) );

		// A new or changed key (here or in Neo Tools) is checked again straight away.
		foreach ( array( 'add_option_ndet_site_key', 'update_option_ndet_site_key', 'add_option_' . self::KEY_OPTION, 'update_option_' . self::KEY_OPTION ) as $hook ) {
			add_action( $hook, array( __CLASS__, 'forget' ) );
		}
	}

	/* ---------- Key and server ---------- */

	/**
	 * The site key: Neo Tools' key when there is one (one key per site), otherwise Neo Pulse's own.
	 */
	public static function site_key(): string {
		$source = self::key_source();
		switch ( $source ) {
			case 'neo-tools-config':
				return trim( (string) NDET_SITE_KEY );
			case 'neo-tools':
				return trim( (string) get_option( 'ndet_site_key' ) );
			case 'pulse-config':
				return trim( (string) NEO_PULSE_WP_SITE_KEY );
			case 'pulse':
				return trim( (string) get_option( self::KEY_OPTION ) );
		}
		return '';
	}

	/**
	 * Where the key comes from: neo-tools-config, neo-tools, pulse-config, pulse, or '' for none.
	 */
	public static function key_source(): string {
		if ( defined( 'NDET_SITE_KEY' ) && '' !== trim( (string) NDET_SITE_KEY ) ) {
			return 'neo-tools-config';
		}
		if ( '' !== trim( (string) get_option( 'ndet_site_key' ) ) ) {
			return 'neo-tools';
		}
		if ( defined( 'NEO_PULSE_WP_SITE_KEY' ) && '' !== trim( (string) NEO_PULSE_WP_SITE_KEY ) ) {
			return 'pulse-config';
		}
		if ( '' !== trim( (string) get_option( self::KEY_OPTION ) ) ) {
			return 'pulse';
		}
		return '';
	}

	public static function server_url(): string {
		if ( defined( 'NEO_PULSE_WP_UPDATE_SERVER' ) && '' !== (string) NEO_PULSE_WP_UPDATE_SERVER ) {
			return untrailingslashit( (string) NEO_PULSE_WP_UPDATE_SERVER );
		}
		if ( defined( 'NDET_UPDATE_SERVER' ) && '' !== (string) NDET_UPDATE_SERVER ) {
			return untrailingslashit( (string) NDET_UPDATE_SERVER );
		}
		return self::DEFAULT_SERVER;
	}

	/**
	 * True for requests going to the update server's API, so the site key is only ever sent there
	 * (same scheme, host and port, and a path under /wp-json/neo-updates/v1).
	 */
	public static function is_server_url( string $url ): bool {
		$server = wp_parse_url( self::server_url() );
		$target = wp_parse_url( $url );
		if ( ! is_array( $server ) || ! is_array( $target ) ) {
			return false;
		}
		if ( empty( $server['host'] ) || empty( $target['host'] ) || empty( $target['scheme'] ) || empty( $server['scheme'] ) ) {
			return false;
		}
		$same_origin = strtolower( $server['host'] ) === strtolower( $target['host'] )
			&& strtolower( $server['scheme'] ) === strtolower( $target['scheme'] )
			&& ( isset( $server['port'] ) ? (int) $server['port'] : null ) === ( isset( $target['port'] ) ? (int) $target['port'] : null );
		if ( ! $same_origin ) {
			return false;
		}
		$path = isset( $target['path'] ) ? '/' . ltrim( (string) $target['path'], '/' ) : '';
		if ( false !== strpos( $path, '..' ) ) {
			return false;
		}
		return $path === self::SERVER_PATH || 0 === strpos( $path, self::SERVER_PATH . '/' );
	}

	/**
	 * Every request to the update server carries the site key in a header (never in the URL),
	 * including the update download that WordPress itself makes.
	 *
	 * @param array  $args HTTP args.
	 * @param string $url  Request URL.
	 */
	public static function add_key_header( $args, $url ) {
		if ( self::is_server_url( (string) $url ) ) {
			$key = self::site_key();
			if ( '' !== $key ) {
				$args['headers']                   = isset( $args['headers'] ) && is_array( $args['headers'] ) ? $args['headers'] : array();
				$args['headers']['X-Neo-Site-Key'] = $key;
			}
		}
		return $args;
	}

	/* ---------- State ---------- */

	/**
	 * Last answer from the server.
	 *
	 * @return array{licensed:bool,status:string,message:string,checked:int,ttl:int,last_active:int,reachable:bool,plan:string}
	 */
	public static function state(): array {
		if ( is_array( self::$memo ) ) {
			return self::$memo;
		}
		$state      = get_option( self::STATE_OPTION );
		self::$memo = array_merge(
			array(
				'licensed'    => false,
				'status'      => 'unknown',
				'message'     => '',
				'checked'     => 0,
				'ttl'         => self::DEFAULT_TTL,
				'last_active' => 0,
				'reachable'   => true,
				// Answers stored before plans existed (and servers that don't send one) count as Pro + AI.
				'plan'        => self::PLAN_PRO_AI,
			),
			is_array( $state ) ? $state : array()
		);
		return self::$memo;
	}

	/**
	 * The site's NEO Pulse plan: Pro, or Pro + AI. Only meaningful while licensed.
	 */
	public static function plan(): string {
		$plan = (string) self::state()['plan'];
		/**
		 * The NEO Pulse plan this site is on ('pro' or 'pro_ai'), as set by Neo Digital.
		 *
		 * @param string $plan Plan from the last licence check.
		 */
		$plan = (string) apply_filters( 'neo_pulse_wp_plan', $plan );
		return self::PLAN_PRO === $plan ? self::PLAN_PRO : self::PLAN_PRO_AI;
	}

	public static function plan_label( string $plan = '' ): string {
		$plan = '' === $plan ? self::plan() : $plan;
		return self::PLAN_PRO === $plan ? __( 'Pro', 'neo-pulse-wp' ) : __( 'Pro + AI', 'neo-pulse-wp' );
	}

	/**
	 * True when the site is licensed on NEO Pulse Pro (without AI): AI features show greyed out with
	 * a "Pro + AI" label and their requests to AI and SEO data services are refused. Unlicensed sites
	 * are handled by the licence lock instead, so this stays false for them.
	 *
	 * @param bool $blocking See is_licensed().
	 */
	public static function ai_needs_upgrade( bool $blocking = false ): bool {
		return self::is_licensed( $blocking ) && self::PLAN_PRO === self::plan();
	}

	/**
	 * May this site use NEO Pulse's AI features right now (licensed on Pro + AI)?
	 *
	 * @param bool $blocking See is_licensed().
	 */
	public static function has_ai( bool $blocking = false ): bool {
		return self::is_licensed( $blocking ) && self::PLAN_PRO_AI === self::plan();
	}

	/**
	 * Store the server's answer (autoloaded: the lock reads it on every request).
	 *
	 * @param array<string,mixed> $state State to remember.
	 */
	private static function save_state( array $state ): void {
		update_option( self::STATE_OPTION, $state, true );
		self::$memo = null;
	}

	/**
	 * Clamp a TTL to [MIN_TTL, 1 hour].
	 *
	 * @param mixed $ttl Seconds.
	 */
	private static function clamp_ttl( $ttl ): int {
		return (int) min( HOUR_IN_SECONDS, max( self::MIN_TTL, (int) $ttl ) );
	}

	private static function is_fresh( array $state ): bool {
		return $state['checked'] > 0 && ( $state['checked'] + self::clamp_ttl( $state['ttl'] ) ) > time();
	}

	/**
	 * May this site use Neo Pulse's live services right now?
	 *
	 * @param bool $blocking True to ask the server now when the last answer is stale (AI requests, admin
	 *                       screens). False to use the last answer and refresh in the background (page views).
	 */
	public static function is_licensed( bool $blocking = true ): bool {
		if ( '' === self::site_key() ) {
			return false;
		}
		$state = self::state();
		if ( ! self::is_fresh( $state ) ) {
			if ( $blocking ) {
				$state = self::refresh();
			} elseif ( ! wp_next_scheduled( self::CRON_HOOK ) ) {
				wp_schedule_single_event( time(), self::CRON_HOOK );
			}
		}
		return ! empty( $state['licensed'] );
	}

	/**
	 * Mark the stored answer out of date so the next check asks the server. The answer itself is kept
	 * (including when the site was last confirmed), so changing the key while Neo Digital's server is
	 * down doesn't lock a site that was working minutes earlier.
	 */
	public static function forget(): void {
		$state = get_option( self::STATE_OPTION );
		if ( is_array( $state ) ) {
			$state['checked'] = 0;
			update_option( self::STATE_OPTION, $state, true );
		}
		delete_transient( self::LOCK );
		self::$memo = null;
	}

	/**
	 * Ask the update server whether this site is licensed, and remember the answer.
	 */
	public static function refresh(): array {
		$previous = self::state();
		$key      = self::site_key();

		if ( '' === $key ) {
			$state = array_merge(
				$previous,
				array(
					'licensed'  => false,
					'status'    => 'missing_key',
					'message'   => __( 'No site key on this site.', 'neo-pulse-wp' ),
					'checked'   => time(),
					'ttl'       => self::DEFAULT_TTL,
					'reachable' => true,
				)
			);
			self::save_state( $state );
			return $state;
		}

		// One check at a time; parallel requests use the last answer meanwhile.
		if ( get_transient( self::LOCK ) ) {
			return $previous;
		}
		set_transient( self::LOCK, 1, 20 );

		global $wp_version;
		$response = wp_remote_post(
			self::server_url() . '/license',
			array(
				'timeout' => 6,
				'headers' => array(
					'Content-Type'   => 'application/json',
					'X-Neo-Site-Key' => $key,
				),
				'body'    => wp_json_encode(
					array(
						'slug'    => self::SLUG,
						'version' => defined( 'NEO_PULSE_WP_VERSION' ) ? NEO_PULSE_WP_VERSION : '',
						'site'    => home_url(),
						'wp'      => $wp_version,
						'php'     => PHP_VERSION,
					)
				),
			)
		);

		$code = is_wp_error( $response ) ? 0 : (int) wp_remote_retrieve_response_code( $response );
		$body = is_wp_error( $response ) ? null : json_decode( (string) wp_remote_retrieve_body( $response ), true );
		$now  = time();

		$refusals = array( 'missing_key', 'invalid_key', 'revoked_key', 'not_licensed' );

		if ( 200 === $code && is_array( $body ) && array_key_exists( 'licensed', $body ) ) {
			$licensed = (bool) $body['licensed'];
			$plan     = isset( $body['plan'] ) ? sanitize_key( (string) $body['plan'] ) : self::PLAN_PRO_AI;
			$state    = array(
				'licensed'    => $licensed,
				'status'      => $licensed ? 'active' : 'not_licensed',
				'message'     => isset( $body['message'] ) ? sanitize_text_field( (string) $body['message'] ) : '',
				'checked'     => $now,
				'ttl'         => isset( $body['ttl'] ) ? self::clamp_ttl( $body['ttl'] ) : self::DEFAULT_TTL,
				'last_active' => $licensed ? $now : 0,
				'reachable'   => true,
				'plan'        => self::PLAN_PRO === $plan ? self::PLAN_PRO : self::PLAN_PRO_AI,
			);
		} elseif ( in_array( $code, array( 401, 403 ), true ) && is_array( $body ) && ! empty( $body['code'] ) && in_array( $body['code'], $refusals, true ) ) {
			$state = array(
				'licensed'    => false,
				'status'      => sanitize_key( (string) $body['code'] ),
				'message'     => isset( $body['message'] ) ? sanitize_text_field( (string) $body['message'] ) : '',
				'checked'     => $now,
				'ttl'         => self::DEFAULT_TTL,
				'last_active' => 0,
				'reachable'   => true,
			);
		} else {
			// Server down, unreachable or answering oddly: keep the last answer for a while.
			$still = ! empty( $previous['licensed'] ) && $previous['last_active'] > $now - self::OUTAGE_GRACE;
			$state = array_merge(
				$previous,
				array(
					'licensed'  => $still,
					'status'    => $still ? $previous['status'] : 'unreachable',
					'message'   => $still
						? __( 'The Neo Digital licence server could not be reached; the last answer stands for now.', 'neo-pulse-wp' )
						: __( 'The Neo Digital licence server could not be reached, and this site has not been confirmed as licensed in the last 72 hours.', 'neo-pulse-wp' ),
					'checked'   => $now,
					'ttl'       => self::DEFAULT_TTL,
					'reachable' => false,
				)
			);
		}

		self::save_state( $state );
		delete_transient( self::LOCK );

		// A new plan changes what visitors see (the chat bubble comes or goes): clear cached pages.
		if ( ! empty( $state['licensed'] ) && ! empty( $previous['licensed'] ) && (string) $state['plan'] !== (string) $previous['plan']
			&& class_exists( 'Neo_Pulse_Wp_Cache_Flush' ) ) {
			Neo_Pulse_Wp_Cache_Flush::purge_html_caches();
		}
		return $state;
	}

	/* ---------- The switch itself ---------- */

	/**
	 * Refuse Neo Pulse's requests to live AI/data services when the site is not licensed.
	 *
	 * @param false|array|WP_Error $pre  Short-circuit value from earlier filters.
	 * @param array                $args HTTP args.
	 * @param string               $url  Request URL.
	 * @return false|array|WP_Error
	 */
	public static function filter_http_request( $pre, $args, $url ) {
		if ( false !== $pre ) {
			return $pre;
		}
		$host = strtolower( (string) wp_parse_url( (string) $url, PHP_URL_HOST ) );
		if ( '' === $host || ! in_array( $host, self::gated_hosts(), true ) ) {
			return $pre;
		}
		if ( ! self::request_comes_from_pulse() ) {
			return $pre; // Another plugin's request: not ours to block.
		}
		if ( self::is_licensed( true ) ) {
			if ( self::PLAN_PRO === self::plan() ) {
				return new WP_Error( 'neo_pulse_wp_needs_pro_ai', self::upgrade_message() );
			}
			return $pre;
		}
		return new WP_Error( 'neo_pulse_wp_unlicensed', self::refusal_message() );
	}

	/**
	 * True when Neo Pulse's own code made the current HTTP request.
	 */
	private static function request_comes_from_pulse(): bool {
		$dir = wp_normalize_path( NEO_PULSE_WP_PLUGIN_DIR );
		$me  = wp_normalize_path( __FILE__ );
		// phpcs:ignore WordPress.PHP.DevelopmentFunctions.error_log_debug_backtrace
		foreach ( debug_backtrace( DEBUG_BACKTRACE_IGNORE_ARGS, 60 ) as $frame ) {
			if ( empty( $frame['file'] ) ) {
				continue;
			}
			$file = wp_normalize_path( $frame['file'] );
			if ( $file !== $me && 0 === strpos( $file, $dir ) ) {
				return true;
			}
		}
		return false;
	}

	public static function refusal_message(): string {
		return __( 'Neo Pulse is not licensed for this site, so its AI features are switched off. Contact Neo Digital to turn them back on.', 'neo-pulse-wp' );
	}

	/**
	 * Shown when a Pro site tries an AI feature.
	 */
	public static function upgrade_message(): string {
		return __( 'This is part of NEO Pulse Pro + AI. This site is on NEO Pulse Pro, so AI features are switched off. Contact Neo Digital to upgrade.', 'neo-pulse-wp' );
	}

	/* ---------- Admin ---------- */

	public static function settings_url(): string {
		return admin_url( 'admin.php?page=neo-pulse-wp-settings&tab=licence' );
	}

	/**
	 * Status pill in the Neo Pulse header, matching the "Activated" badge in Neo Tools.
	 * Links to Settings → Licence.
	 */
	public static function render_header_badge(): void {
		if ( ! current_user_can( 'manage_options' ) ) {
			return;
		}
		$on     = self::is_licensed( true );
		$locked = class_exists( 'Neo_Pulse_Wp_Lock', false ) && Neo_Pulse_Wp_Lock::is_locked();
		printf(
			'<a class="npwp-activated%1$s" href="%2$s" title="%3$s"><span class="npwp-activated__dot" aria-hidden="true"></span>%4$s</a>',
			$on ? '' : ' is-off',
			esc_url( self::settings_url() ),
			esc_attr__( 'Show licence details', 'neo-pulse-wp' ),
			$on ? esc_html( self::plan_label() ) : ( $locked ? esc_html__( 'Locked', 'neo-pulse-wp' ) : esc_html__( 'Not licensed', 'neo-pulse-wp' ) )
		);
	}

	/**
	 * Warning at the top of every Neo Pulse screen while the site is not licensed. (Neo Pulse screens hide
	 * WordPress admin notices, so this is drawn inside the page frame instead.)
	 */
	public static function render_shell_banner(): void {
		if ( ! current_user_can( 'manage_options' ) ) {
			return;
		}
		if ( isset( $_GET['tab'] ) && 'licence' === $_GET['tab'] ) { // phpcs:ignore WordPress.Security.NonceVerification.Recommended -- display only.
			return; // The licence tab shows the details itself.
		}
		if ( self::is_licensed( true ) ) {
			return;
		}
		if ( class_exists( 'Neo_Pulse_Wp_Lock', false ) && Neo_Pulse_Wp_Lock::is_locked() ) {
			return; // The "Activate NEO Pulse" card says it (Neo_Pulse_Wp_Lock::render_admin_card()).
		}
		printf(
			'<div class="notice notice-warning neo-pulse-wp-acf-shell-notice neo-pulse-wp-license-notice"><p><strong>%1$s</strong> %2$s <a href="%3$s">%4$s</a></p></div>',
			esc_html__( 'Neo Pulse is not licensed for this site.', 'neo-pulse-wp' ),
			esc_html__( 'AI wands, chat, AI search and SEO research are switched off. FAQ, redirects, sitemaps and the other tools keep working.', 'neo-pulse-wp' ),
			esc_url( self::settings_url() ),
			esc_html__( 'Licence details', 'neo-pulse-wp' )
		);
	}

	/**
	 * Warning on the Plugins screen while the site is not licensed.
	 */
	public static function render_admin_notice(): void {
		if ( ! current_user_can( 'manage_options' ) ) {
			return;
		}
		$screen = function_exists( 'get_current_screen' ) ? get_current_screen() : null;
		if ( ! $screen ) {
			return;
		}
		if ( 'plugins' !== $screen->id ) {
			return;
		}
		if ( self::is_licensed( false ) ) {
			return;
		}
		if ( class_exists( 'Neo_Pulse_Wp_Lock', false ) && Neo_Pulse_Wp_Lock::is_locked() ) {
			printf(
				'<div class="notice notice-warning neo-pulse-wp-license-notice"><p><strong>%1$s</strong> %2$s <a href="%3$s">%4$s</a></p></div>',
				esc_html__( 'NEO Pulse is locked.', 'neo-pulse-wp' ),
				esc_html__( 'None of its features run on this site until it is activated with a site key from Neo Digital.', 'neo-pulse-wp' ),
				esc_url( self::settings_url() ),
				esc_html__( 'Activate NEO Pulse', 'neo-pulse-wp' )
			);
			return;
		}
		printf(
			'<div class="notice notice-warning neo-pulse-wp-license-notice"><p><strong>%1$s</strong> %2$s <a href="%3$s">%4$s</a></p></div>',
			esc_html__( 'Neo Pulse is not licensed for this site.', 'neo-pulse-wp' ),
			esc_html__( 'AI wands, chat, AI search and SEO research are switched off. FAQ, redirects, sitemaps and the other tools keep working.', 'neo-pulse-wp' ),
			esc_url( self::settings_url() ),
			esc_html__( 'Licence details', 'neo-pulse-wp' )
		);
	}

	/**
	 * Settings → Licence.
	 */
	public static function render_settings_section(): void {
		$state  = self::is_fresh( self::state() ) ? self::state() : self::refresh();
		$source = self::key_source();
		$ok     = '' !== $source && ! empty( $state['licensed'] );
		$locked = class_exists( 'Neo_Pulse_Wp_Lock', false ) && Neo_Pulse_Wp_Lock::is_locked();
		$notice = isset( $_GET['licence'] ) ? sanitize_key( wp_unslash( (string) $_GET['licence'] ) ) : ''; // phpcs:ignore WordPress.Security.NonceVerification.Recommended -- display only.

		$sources = array(
			'neo-tools-config' => __( 'Neo Tools site key (wp-config.php)', 'neo-pulse-wp' ),
			'neo-tools'        => __( 'Neo Tools site key (Neo Tools page)', 'neo-pulse-wp' ),
			'pulse-config'     => __( 'Neo Pulse site key (wp-config.php)', 'neo-pulse-wp' ),
			'pulse'            => __( 'Neo Pulse site key (entered below)', 'neo-pulse-wp' ),
		);
		$form_id = 'neo-pulse-wp-settings-licence-form';
		?>
		<h2 class="neo-pulse-wp-panel-content__title"><?php esc_html_e( 'Licence', 'neo-pulse-wp' ); ?></h2>
		<p class="neo-pulse-wp-panel-content__desc">
			<?php esc_html_e( 'NEO Pulse runs only on sites Neo Digital has activated. Until then every screen can be opened, but nothing is switched on: no SEO tags, sitemaps, redirects, search, chat or AI. The site uses the same site key as Neo Tools; Neo Digital switches NEO Pulse on or off for it.', 'neo-pulse-wp' ); ?>
		</p>

		<?php if ( 'saved' === $notice ) : ?>
			<div class="notice notice-success inline"><p><?php esc_html_e( 'Site key saved and checked.', 'neo-pulse-wp' ); ?></p></div>
		<?php elseif ( 'cleared' === $notice ) : ?>
			<div class="notice notice-success inline"><p><?php esc_html_e( 'Site key removed.', 'neo-pulse-wp' ); ?></p></div>
		<?php elseif ( 'checked' === $notice ) : ?>
			<div class="notice notice-success inline"><p><?php esc_html_e( 'Checked with Neo Digital just now.', 'neo-pulse-wp' ); ?></p></div>
		<?php endif; ?>

		<div class="neo-pulse-wp-panel-info-box neo-pulse-wp-license <?php echo $ok ? 'is-active' : 'is-inactive'; ?>" role="status">
			<p>
				<strong>
					<?php
					if ( '' === $source ) {
						esc_html_e( 'Status: locked. Enter the site key from Neo Digital to activate NEO Pulse.', 'neo-pulse-wp' );
					} elseif ( $ok ) {
						if ( self::PLAN_PRO === self::plan() ) {
							esc_html_e( 'Status: activated on NEO Pulse Pro. AI features (chat, AI writing, AI search, AI image text and keyword research) are part of Pro + AI and show greyed out.', 'neo-pulse-wp' );
						} else {
							esc_html_e( 'Status: activated on NEO Pulse Pro + AI. Every NEO Pulse feature is available.', 'neo-pulse-wp' );
						}
					} elseif ( $locked ) {
						esc_html_e( 'Status: locked. This site key is not activated for NEO Pulse.', 'neo-pulse-wp' );
					} elseif ( class_exists( 'Neo_Pulse_Wp_Lock', false ) && Neo_Pulse_Wp_Lock::locks_at() > 0 ) {
						echo esc_html(
							sprintf(
								/* translators: %s: time until NEO Pulse locks, e.g. "18 hours" */
								__( 'Status: Neo Digital\'s server says this key is not activated for NEO Pulse. In case that is a mistake, NEO Pulse keeps running for another %s, then locks.', 'neo-pulse-wp' ),
								human_time_diff( time(), Neo_Pulse_Wp_Lock::locks_at() )
							)
						);
					} else {
						esc_html_e( 'Status: checking with Neo Digital. NEO Pulse keeps running meanwhile; AI features wait for the answer.', 'neo-pulse-wp' );
					}
					?>
				</strong>
			</p>
			<?php if ( '' !== $state['message'] && ! $ok ) : ?>
				<p><?php echo esc_html( $state['message'] ); ?></p>
			<?php elseif ( empty( $state['reachable'] ) ) : ?>
				<p><?php echo esc_html( $state['message'] ); ?></p>
			<?php endif; ?>
			<?php if ( '' !== $source ) : ?>
				<p><?php echo esc_html( sprintf( /* translators: %s: where the key comes from */ __( 'Key: %s', 'neo-pulse-wp' ), $sources[ $source ] ) ); ?></p>
			<?php endif; ?>
			<?php if ( $state['checked'] ) : ?>
				<p><?php echo esc_html( sprintf( /* translators: %s: time ago */ __( 'Last checked: %s ago', 'neo-pulse-wp' ), human_time_diff( (int) $state['checked'] ) ) ); ?></p>
			<?php endif; ?>
		</div>

		<?php
		if ( $locked ) {
			echo '<div class="npwp-lock-exports-wrap">';
			Neo_Pulse_Wp_Lock::render_export_buttons(); // The site's redirects and scripts, downloadable even while locked.
			echo '</div>';
		}
		?>

		<?php if ( current_user_can( 'manage_options' ) ) : ?>
			<?php if ( in_array( $source, array( '', 'pulse' ), true ) ) : ?>
				<form id="<?php echo esc_attr( $form_id ); ?>" method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>" class="neo-pulse-wp-settings__form neo-pulse-schema-form" autocomplete="off">
					<input type="hidden" name="action" value="<?php echo esc_attr( self::ACTION_SAVE ); ?>" />
					<?php wp_nonce_field( self::ACTION_SAVE, 'neo_pulse_wp_license_nonce' ); ?>
					<div class="neo-pulse-wp-panel-form-group">
						<label for="neo-pulse-wp-site-key" class="neo-pulse-wp-panel-form-label"><?php esc_html_e( 'Site key', 'neo-pulse-wp' ); ?></label>
						<input type="password" id="neo-pulse-wp-site-key" name="neo_pulse_wp_site_key" class="regular-text" value="" placeholder="<?php echo esc_attr( 'pulse' === $source ? '••••••••••••••••' : 'nd_…' ); ?>" autocomplete="off" spellcheck="false" />
						<p class="description"><?php esc_html_e( 'Paste the key Neo Digital gave you for this site. Neo Tools (1.7.5 and later) uses this same key, so it only needs entering once. Leave blank and save to remove it.', 'neo-pulse-wp' ); ?></p>
					</div>
				</form>
			<?php else : ?>
				<p class="description"><?php esc_html_e( 'This site\'s key is managed in Neo Tools, so there is nothing to enter here.', 'neo-pulse-wp' ); ?></p>
			<?php endif; ?>

			<div class="neo-pulse-wp-panel-footer">
				<p class="neo-pulse-wp-settings__actions neo-pulse-wp-panel-footer__right">
					<a class="button neo-pulse-wp-settings__btn" href="<?php echo esc_url( wp_nonce_url( admin_url( 'admin-post.php?action=' . self::ACTION_CHECK ), self::ACTION_CHECK ) ); ?>"><?php esc_html_e( 'Check now', 'neo-pulse-wp' ); ?></a>
					<?php if ( in_array( $source, array( '', 'pulse' ), true ) ) : ?>
						<button type="submit" form="<?php echo esc_attr( $form_id ); ?>" class="button button-primary neo-pulse-wp-settings__btn"><?php esc_html_e( 'Save site key', 'neo-pulse-wp' ); ?></button>
					<?php endif; ?>
				</p>
			</div>

			<?php if ( class_exists( 'Neo_Pulse_Wp_Mcp', false ) ) : ?>
				<?php
				$mcp_on     = Neo_Pulse_Wp_Mcp::enabled();
				$mcp_notice = isset( $_GET['mcp'] ) ? sanitize_key( wp_unslash( (string) $_GET['mcp'] ) ) : ''; // phpcs:ignore WordPress.Security.NonceVerification.Recommended
				?>
				<h3 class="neo-pulse-chat-settings-section__title" style="margin-top:28px;"><?php esc_html_e( 'Claude access (MCP)', 'neo-pulse-wp' ); ?></h3>
				<?php if ( 'on' === $mcp_notice || 'off' === $mcp_notice ) : ?>
					<div class="notice notice-success inline"><p><?php echo 'on' === $mcp_notice ? esc_html__( 'Claude access (MCP) enabled.', 'neo-pulse-wp' ) : esc_html__( 'Claude access (MCP) disabled.', 'neo-pulse-wp' ); ?></p></div>
				<?php endif; ?>
				<form method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>" class="neo-pulse-wp-settings__form neo-pulse-schema-form">
					<input type="hidden" name="action" value="<?php echo esc_attr( Neo_Pulse_Wp_Mcp::ACTION_SAVE ); ?>" />
					<?php wp_nonce_field( Neo_Pulse_Wp_Mcp::ACTION_SAVE, 'neo_pulse_wp_mcp_nonce' ); ?>
					<section class="neo-pulse-schema-group">
						<div class="neo-pulse-schema-grid">
							<div class="neo-pulse-schema-cell neo-pulse-schema-cell--full">
								<label class="neo-pulse-wp-panel-toggle">
									<input type="checkbox" name="neo_pulse_wp_mcp_enabled" value="1" <?php checked( $mcp_on ); ?> onchange="this.form.submit()" />
									<span class="neo-pulse-wp-panel-toggle__label"><?php esc_html_e( 'Allow Claude access (MCP)', 'neo-pulse-wp' ); ?></span>
								</label>
								<p class="neo-pulse-field__note"><?php esc_html_e( 'Exposes neo-pulse/read and neo-pulse/write on this site\'s MCP server so Claude can inspect and update SEO settings, shared business details, locations and page schema.', 'neo-pulse-wp' ); ?></p>
							</div>
						</div>
					</section>
				</form>
			<?php endif; ?>
		<?php endif; ?>
		<?php
	}

	public static function handle_save_key(): void {
		if ( ! current_user_can( 'manage_options' ) ) {
			wp_die( esc_html__( 'You do not have permission to change the site key.', 'neo-pulse-wp' ) );
		}
		check_admin_referer( self::ACTION_SAVE, 'neo_pulse_wp_license_nonce' );
		$key = isset( $_POST['neo_pulse_wp_site_key'] ) ? sanitize_text_field( trim( (string) wp_unslash( $_POST['neo_pulse_wp_site_key'] ) ) ) : '';
		if ( '' === $key ) {
			delete_option( self::KEY_OPTION );
		} else {
			update_option( self::KEY_OPTION, $key, false );
		}
		self::forget();
		self::refresh();
		wp_safe_redirect( add_query_arg( 'licence', '' === $key ? 'cleared' : 'saved', self::settings_url() ) );
		exit;
	}

	public static function handle_check_now(): void {
		if ( ! current_user_can( 'manage_options' ) ) {
			wp_die( esc_html__( 'You do not have permission to do that.', 'neo-pulse-wp' ) );
		}
		check_admin_referer( self::ACTION_CHECK );
		self::forget();
		self::refresh();
		wp_safe_redirect( add_query_arg( 'licence', 'checked', self::settings_url() ) );
		exit;
	}
}
