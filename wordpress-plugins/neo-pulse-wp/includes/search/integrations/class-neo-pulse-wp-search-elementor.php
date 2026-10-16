<?php
/**
 * Elementor widget integration for NEO Pulse Search.
 *
 * @package Neo_Pulse_Wp
 */

defined( 'ABSPATH' ) || exit;

class Neo_Pulse_Wp_Search_Elementor {

	/** @var bool */
	private static $booted = false;

	public static function init(): void {
		add_action( 'elementor/loaded', array( __CLASS__, 'boot' ) );
		add_action( 'plugins_loaded', array( __CLASS__, 'boot' ), 120 );
	}

	public static function boot(): void {
		if ( self::$booted ) {
			return;
		}
		if ( ! did_action( 'elementor/loaded' ) && ! defined( 'ELEMENTOR_VERSION' ) ) {
			return;
		}

		add_action( 'elementor/elements/categories_registered', array( __CLASS__, 'register_category' ) );
		add_action( 'elementor/widgets/register', array( __CLASS__, 'register_widgets' ) );
		add_action( 'wp_enqueue_scripts', array( __CLASS__, 'register_preview_script' ) );
		add_action( 'admin_enqueue_scripts', array( __CLASS__, 'register_preview_script' ) );
		add_action( 'elementor/preview/enqueue_scripts', array( __CLASS__, 'enqueue_preview_assets' ) );
		add_action( 'elementor/editor/after_enqueue_scripts', array( __CLASS__, 'enqueue_preview_assets' ) );
		self::$booted = true;
	}

	/**
	 * @param \Elementor\Elements_Manager $elements_manager
	 */
	public static function register_category( $elements_manager ): void {
		$elements_manager->add_category(
			'neo-pulse',
			array(
				'title' => esc_html__( 'NEO Pulse', 'neo-pulse-wp' ),
				'icon'  => 'fa fa-plug',
			)
		);
	}

	/**
	 * @param \Elementor\Widgets_Manager $widgets_manager
	 */
	public static function register_widgets( $widgets_manager ): void {
		require_once NEO_PULSE_WP_PLUGIN_DIR . 'includes/search/integrations/class-neo-pulse-wp-search-elementor-widget.php';
		$widgets_manager->register( new Neo_Pulse_Wp_Search_Elementor_Widget() );
		if ( class_exists( 'Neo_Pulse_Wp_Chat' ) ) {
			require_once NEO_PULSE_WP_PLUGIN_DIR . 'includes/search/integrations/class-neo-pulse-wp-chat-elementor-widget.php';
			$widgets_manager->register( new Neo_Pulse_Wp_Chat_Elementor_Widget() );
		}
	}

	public static function enqueue_preview_assets(): void {
		Neo_Pulse_Wp_Search::enqueue_search_assets();
		if ( ! wp_script_is( 'neo-pulse-search-elementor-preview', 'registered' ) ) {
			return;
		}
		wp_enqueue_script( 'neo-pulse-search-elementor-preview' );
	}

	public static function register_preview_script(): void {
		$chat_css = NEO_PULSE_WP_PLUGIN_DIR . 'assets/frontend/neo-pulse-chat-elementor-preview.css';
		wp_register_style(
			'neo-pulse-chat-elementor-preview',
			plugin_dir_url( NEO_PULSE_WP_PLUGIN_FILE ) . 'assets/frontend/neo-pulse-chat-elementor-preview.css',
			array(),
			NEO_PULSE_WP_VERSION . ( is_readable( $chat_css ) ? '.' . (string) filemtime( $chat_css ) : '' )
		);

		$path = NEO_PULSE_WP_PLUGIN_DIR . 'assets/search/neo-pulse-search-elementor-preview.js';
		$ver  = Neo_Pulse_Wp_Search::search_asset_version();
		if ( is_readable( $path ) ) {
			$ver .= '.' . (string) filemtime( $path );
		}
		wp_register_script(
			'neo-pulse-search-elementor-preview',
			plugin_dir_url( NEO_PULSE_WP_PLUGIN_FILE ) . 'assets/search/neo-pulse-search-elementor-preview.js',
			array( 'jquery', 'neo-pulse-search' ),
			$ver,
			true
		);
	}
}
