<?php
/**
 * NEO Pulse plans on the admin side: Pro and Pro + AI.
 *
 * Neo Digital sets each site's plan on its update server; the licence check brings it back
 * (Neo_Pulse_Wp_License::plan()). On Pro, requests to AI and SEO data services are refused in one
 * place (Neo_Pulse_Wp_License::filter_http_request()). This class makes that visible instead of
 * letting people click into an error: screens that are only AI show an "Available with Pro + AI"
 * card and are dimmed like a locked screen, AI controls on other screens are greyed out with a
 * "Pro + AI" chip, and the sidebar and tabs mark the AI sections.
 *
 * Nothing is deleted on Pro: AI settings, chat history and logs stay and come back on an upgrade.
 *
 * @package Neo_Pulse_Wp
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

final class Neo_Pulse_Wp_Plan {

	/** Body class on every NEO Pulse screen and editor of a Pro site. */
	const BODY_CLASS = 'npwp-plan-pro';

	/** Body class on a screen that is only AI, on a Pro site. */
	const LOCKED_CLASS = 'npwp-ai-locked';

	/** Class for an AI control (button, field, panel) on a mixed screen. */
	const NEEDS_AI = 'npwp-needs-ai';

	public static function init(): void {
		add_filter( 'admin_body_class', array( __CLASS__, 'admin_body_class' ), 21 );
		add_action( 'admin_enqueue_scripts', array( __CLASS__, 'enqueue_admin_assets' ), 100 );
	}

	/**
	 * True on a Pro site (licensed, without AI).
	 */
	public static function is_pro(): bool {
		return Neo_Pulse_Wp_License::ai_needs_upgrade( false );
	}

	/**
	 * AI-only screens: page slug => tabs ('' = every tab of that page).
	 *
	 * @return array<string, array<int,string>>
	 */
	public static function ai_screens(): array {
		return array(
			'neo-pulse-wp-chat'           => array(),
			'neo-pulse-wp-chat-logs'      => array(),
			'neo-pulse-wp-backend-assist' => array(),
			'neo-pulse-wp-tool-library'   => array(),
			'neo-pulse-wp-settings'       => array( 'openrouter', 'dataforseo' ),
		);
	}

	/**
	 * Whether a screen (page + ?tab=) is only AI.
	 */
	public static function is_ai_screen( string $page, string $tab = '' ): bool {
		$screens = self::ai_screens();
		if ( ! isset( $screens[ $page ] ) ) {
			return false;
		}
		return array() === $screens[ $page ] || ( '' !== $tab && in_array( $tab, $screens[ $page ], true ) );
	}

	/**
	 * Whether a sidebar section is only AI (all of its tabs are AI screens).
	 */
	public static function is_ai_section( string $section_id ): bool {
		$sections = Neo_Pulse_Wp_Admin_Menu::sections();
		if ( ! isset( $sections[ $section_id ] ) ) {
			return false;
		}
		foreach ( $sections[ $section_id ]['tabs'] as $tab ) {
			if ( ! self::is_ai_screen( (string) $tab['page'], isset( $tab['tab'] ) ? (string) $tab['tab'] : '' ) ) {
				return false;
			}
		}
		return true;
	}

	private static function request_page(): string {
		return isset( $_GET['page'] ) ? sanitize_key( wp_unslash( (string) $_GET['page'] ) ) : ''; // phpcs:ignore WordPress.Security.NonceVerification.Recommended -- display only.
	}

	private static function request_tab(): string {
		return isset( $_GET['tab'] ) ? sanitize_key( wp_unslash( (string) $_GET['tab'] ) ) : ''; // phpcs:ignore WordPress.Security.NonceVerification.Recommended -- display only.
	}

	/**
	 * The current screen is AI-only and the site is on Pro (and not locked outright).
	 */
	public static function screen_is_ai_locked(): bool {
		if ( ! self::is_pro() ) {
			return false;
		}
		if ( class_exists( 'Neo_Pulse_Wp_Lock', false ) && Neo_Pulse_Wp_Lock::screen_is_locked() ) {
			return false;
		}
		return self::is_ai_screen( self::request_page(), self::request_tab() );
	}

	/**
	 * @param string|mixed $classes Admin body classes.
	 * @return string|mixed
	 */
	public static function admin_body_class( $classes ) {
		if ( ! is_string( $classes ) || ! self::is_pro() ) {
			return $classes;
		}
		$classes .= ' ' . self::BODY_CLASS;
		if ( self::screen_is_ai_locked() ) {
			$classes .= ' ' . self::LOCKED_CLASS;
		}
		return $classes;
	}

	/**
	 * The parts of an AI-only screen that are dimmed: everything in the frame except the heading,
	 * the tabs, notices and the upgrade card.
	 */
	public static function locked_selector(): string {
		return 'body.' . self::LOCKED_CLASS . ' .npwp-admin__frame > :not(.npwp-head):not(.npwp-tabs):not(.npwp-lock):not(.notice)';
	}

	/**
	 * AI controls on mixed screens, as [ selector, container to grey ('' = the element itself) ].
	 * Matched in the browser, so screens don't each need a change.
	 *
	 * @return array<int, array{0:string,1:string}>
	 */
	public static function ai_controls(): array {
		$controls = array(
			// Search → Settings: the AI model and daily AI limit.
			array( '#neo-pulse-search-openrouter-model', '.neo-pulse-schema-cell' ),
			array( '#neo-pulse-search-daily-ai-cap', '.neo-pulse-schema-cell' ),
			// Image SEO: AI optimizing (row links) and the AI-only settings. Edit inline stays.
			array( '.neo-pulse-image-seo-row-optimize', '' ),
			array( 'input[name="auto_mode"][value="ai"]', 'label' ),
			array( '#neo-pulse-image-seo-instructions', 'tr' ),
			array( 'input[name="context_from_post"]', 'tr' ),
			// Anything a screen marks itself.
			array( '.' . self::NEEDS_AI, '' ),
		);
		/**
		 * AI controls greyed out on a Pro site.
		 *
		 * @param array<int, array{0:string,1:string}> $controls [ selector, container ] pairs.
		 */
		return (array) apply_filters( 'neo_pulse_wp_plan_ai_controls', $controls );
	}

	/**
	 * @param string|mixed $hook_suffix Admin page hook.
	 */
	public static function enqueue_admin_assets( $hook_suffix ): void {
		if ( ! self::is_pro() ) {
			return;
		}
		$editor = in_array( (string) $hook_suffix, array( 'post.php', 'post-new.php' ), true );
		$pulse  = class_exists( 'Neo_Pulse_Wp_Lock', false ) && Neo_Pulse_Wp_Lock::is_pulse_screen_request();
		if ( ! $editor && ! $pulse ) {
			// The sidebar chip shows on every admin screen.
			wp_register_style( 'neo-pulse-wp-plan-menu', false, array(), NEO_PULSE_WP_VERSION );
			wp_enqueue_style( 'neo-pulse-wp-plan-menu' );
			wp_add_inline_style( 'neo-pulse-wp-plan-menu', self::menu_chip_css() );
			return;
		}
		$url = plugin_dir_url( NEO_PULSE_WP_PLUGIN_FILE );
		wp_enqueue_style( 'neo-pulse-wp-plan', $url . 'assets/admin/admin-plan.css', array(), NEO_PULSE_WP_VERSION );
		wp_register_script( 'neo-pulse-wp-plan', '', array(), NEO_PULSE_WP_VERSION, true );
		wp_enqueue_script( 'neo-pulse-wp-plan' );
		wp_add_inline_script(
			'neo-pulse-wp-plan',
			'window.npwpPlan=' . wp_json_encode(
				array(
					'locked'   => self::locked_selector(),
					'controls' => array_values( self::ai_controls() ),
					'chip'     => __( 'Pro + AI', 'neo-pulse-wp' ),
					'title'    => __( 'Part of NEO Pulse Pro + AI. Contact Neo Digital to upgrade.', 'neo-pulse-wp' ),
				)
			) . ';' . self::inline_js()
		);
	}

	/**
	 * Grey the AI controls: dimmed, not clickable or focusable, with a "Pro + AI" chip. Form fields
	 * are made inert rather than disabled, so saving a form on a Pro site keeps their saved values.
	 */
	private static function inline_js(): string {
		return <<<'JS'
(function(){
	var P = window.npwpPlan || {};
	function mark(el){
		if (!el || el.getAttribute('data-npwp-ai') === '1') { return; }
		el.setAttribute('data-npwp-ai', '1');
		el.classList.add('npwp-ai-greyed');
		el.inert = true;
		el.setAttribute('aria-disabled', 'true');
		el.setAttribute('title', P.title || '');
		if (/^(BUTTON|A|INPUT)$/.test(el.tagName)) {
			var wrap = document.createElement('span');
			wrap.className = 'npwp-ai-wrap';
			el.parentNode.insertBefore(wrap, el);
			wrap.appendChild(el);
			el = wrap;
		}
		var chip = document.createElement('span');
		chip.className = 'npwp-ai-chip';
		chip.textContent = P.chip || 'Pro + AI';
		chip.title = P.title || '';
		// Table rows: the chip goes next to the row's label.
		var host = el.tagName === 'TR' ? (el.querySelector('th, td') || el) : el;
		host.appendChild(chip);
	}
	function run(){
		if (P.locked) {
			document.querySelectorAll(P.locked).forEach(function(el){ el.inert = true; el.setAttribute('aria-hidden', 'true'); });
		}
		(P.controls || []).forEach(function(c){
			document.querySelectorAll(c[0]).forEach(function(el){
				var box = c[1] ? (el.closest(c[1]) || el) : el;
				if (box.closest && box.closest('[data-npwp-ai="1"]') && box.getAttribute('data-npwp-ai') !== '1') { return; }
				mark(box);
			});
		});
	}
	if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', run); } else { run(); }
	// Screens that draw controls later (lists, panels opened by script).
	if (window.MutationObserver) {
		var t = null;
		new MutationObserver(function(){ clearTimeout(t); t = setTimeout(run, 120); }).observe(document.documentElement, { childList: true, subtree: true });
	}
})();
JS;
	}

	private static function menu_chip_css(): string {
		return '#adminmenu .npwp-menu-ai{display:inline-block;margin-left:5px;padding:0 5px;border-radius:999px;background:rgba(132,189,0,.18);color:#b9dd5c;font-size:9px;font-weight:600;line-height:15px;vertical-align:1px;letter-spacing:.02em}';
	}

	/**
	 * Small chip after a sidebar or tab label on a Pro site.
	 */
	public static function label_chip( string $class = 'npwp-menu-ai' ): string {
		if ( ! self::is_pro() ) {
			return '';
		}
		// The sidebar is narrow: "+ AI" there, "Pro + AI" everywhere else.
		$text = 'npwp-menu-ai' === $class ? __( '+ AI', 'neo-pulse-wp' ) : __( 'Pro + AI', 'neo-pulse-wp' );
		return ' <span class="' . esc_attr( $class ) . '" title="' . esc_attr__( 'Part of NEO Pulse Pro + AI', 'neo-pulse-wp' ) . '">' . esc_html( $text ) . '</span>';
	}

	/**
	 * " npwp-needs-ai" for a control's class attribute on a Pro site ('' otherwise).
	 */
	public static function needs_ai_class(): string {
		return self::is_pro() ? ' ' . self::NEEDS_AI : '';
	}

	/**
	 * The "Available with NEO Pulse Pro + AI" card at the top of an AI-only screen.
	 */
	public static function render_admin_card(): void {
		if ( ! self::screen_is_ai_locked() ) {
			return;
		}
		?>
		<section class="npwp-lock npwp-lock--ai" role="region" aria-label="<?php esc_attr_e( 'Part of NEO Pulse Pro + AI', 'neo-pulse-wp' ); ?>">
			<span class="npwp-lock__icon" aria-hidden="true">
				<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/></svg>
			</span>
			<div class="npwp-lock__text">
				<h2 class="npwp-lock__title"><?php esc_html_e( 'Available with NEO Pulse Pro + AI', 'neo-pulse-wp' ); ?></h2>
				<p class="npwp-lock__desc">
					<?php esc_html_e( 'This site is on NEO Pulse Pro. Upgrade to Pro + AI for the AI chat assistant, AI writing in the editor, AI Smart Search, AI image text, Search Console insights and keyword research. Everything here is shown so you can see what it does; your settings are kept.', 'neo-pulse-wp' ); ?>
				</p>
			</div>
			<div class="npwp-lock__actions">
				<a class="npwp-lock__btn npwp-lock__btn--primary" href="<?php echo esc_url( self::upgrade_url() ); ?>" target="_blank" rel="noopener noreferrer"><?php esc_html_e( 'Ask about Pro + AI', 'neo-pulse-wp' ); ?></a>
				<?php if ( current_user_can( 'manage_options' ) ) : ?>
					<a class="npwp-lock__btn" href="<?php echo esc_url( Neo_Pulse_Wp_License::settings_url() ); ?>"><?php esc_html_e( 'Licence details', 'neo-pulse-wp' ); ?></a>
				<?php endif; ?>
			</div>
		</section>
		<?php
	}

	/**
	 * Where "Ask about Pro + AI" goes.
	 */
	public static function upgrade_url(): string {
		$url = defined( 'NEO_PULSE_WP_POWERED_URL' ) ? (string) NEO_PULSE_WP_POWERED_URL : 'https://neodigital.ca/neo-pulse-platform/';
		/**
		 * Link behind "Ask about Pro + AI".
		 *
		 * @param string $url URL.
		 */
		return (string) apply_filters( 'neo_pulse_wp_upgrade_url', $url );
	}
}
