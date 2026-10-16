<?php
/**
 * Sitemap admin_post save, reset, and flush handlers.
 *
 * @package Neo_Pulse_Wp
 */

defined( 'ABSPATH' ) || exit;

trait Neo_Pulse_Wp_Admin_Trait_Handlers_Sitemap {

	const ACTION_SAVE_SITEMAP = 'neo_pulse_wp_save_sitemap';

	const ACTION_RESET_SITEMAP = 'neo_pulse_wp_reset_sitemap';

	const ACTION_FLUSH_SITEMAP = 'neo_pulse_wp_flush_sitemap';

	const ACTION_REBUILD_SITEMAP_POST_TYPE = 'neo_pulse_wp_rebuild_sitemap_post_type';

	const ACTION_REBUILD_SITEMAP_ALL_POST_TYPES = 'neo_pulse_wp_rebuild_sitemap_all_post_types';

	public static function handle_save_sitemap(): void {
		if ( ! current_user_can( 'manage_options' ) ) {
			wp_die( esc_html__( 'You do not have permission to manage sitemap settings.', 'neo-pulse-wp' ) );
		}
		check_admin_referer( self::ACTION_SAVE_SITEMAP, 'neo_pulse_wp_sitemap_nonce' );

		$tab      = isset( $_POST['neo-pulse_sitemap_tab'] ) ? sanitize_key( wp_unslash( (string) $_POST['neo-pulse_sitemap_tab'] ) ) : 'general';
		$previous = Neo_Pulse_Wp_Sitemap_Settings::get_config();
		$config   = self::sitemap_config_from_post( $tab, $previous );

		Neo_Pulse_Wp_Sitemap_Settings::save_config( $config );
		Neo_Pulse_Wp_Sitemap_Cache::flush_all();

		if ( (int) ( $previous['general']['links_per_sitemap'] ?? 200 ) !== (int) ( $config['general']['links_per_sitemap'] ?? 200 ) ) {
			Neo_Pulse_Wp_Sitemap::flush_rewrites();
		}

		self::set_flash(
			array(
				'kind'    => 'sitemap',
				'success' => true,
				'message' => __( 'Sitemap settings saved.', 'neo-pulse-wp' ),
			)
		);
		self::redirect_to_sitemap( $tab );
	}

	public static function handle_reset_sitemap(): void {
		if ( ! current_user_can( 'manage_options' ) ) {
			wp_die( esc_html__( 'You do not have permission to manage sitemap settings.', 'neo-pulse-wp' ) );
		}
		check_admin_referer( self::ACTION_RESET_SITEMAP, 'neo_pulse_wp_sitemap_reset_nonce' );

		$tab     = isset( $_POST['neo-pulse_sitemap_tab'] ) ? sanitize_key( wp_unslash( (string) $_POST['neo-pulse_sitemap_tab'] ) ) : 'general';
		$section = 'general';
		$slug    = '';

		if ( 'html' === $tab ) {
			$section = 'html';
		} elseif ( 0 === strpos( $tab, 'pt-' ) ) {
			$section = 'post_type';
			$slug    = substr( $tab, 3 );
		} elseif ( 0 === strpos( $tab, 'tax-' ) ) {
			$section = 'taxonomy';
			$slug    = substr( $tab, 4 );
		}

		Neo_Pulse_Wp_Sitemap_Settings::reset_section( $section, $slug );
		Neo_Pulse_Wp_Sitemap_Cache::flush_all();

		self::set_flash(
			array(
				'kind'    => 'sitemap',
				'success' => true,
				'message' => __( 'Sitemap options reset to defaults for this section.', 'neo-pulse-wp' ),
			)
		);
		self::redirect_to_sitemap( $tab );
	}

	public static function handle_flush_sitemap(): void {
		if ( ! current_user_can( 'manage_options' ) ) {
			wp_die( esc_html__( 'You do not have permission to manage sitemap settings.', 'neo-pulse-wp' ) );
		}
		check_admin_referer( self::ACTION_FLUSH_SITEMAP, 'neo_pulse_wp_sitemap_flush_nonce' );

		Neo_Pulse_Wp_Sitemap_Cache::flush_all();
		if ( class_exists( 'Neo_Pulse_Wp_Chat_Rag', false ) ) {
			Neo_Pulse_Wp_Chat_Rag::invalidate_cache();
		}

		$tab = isset( $_POST['neo-pulse_sitemap_tab'] ) ? sanitize_key( wp_unslash( (string) $_POST['neo-pulse_sitemap_tab'] ) ) : 'general';

		self::set_flash(
			array(
				'kind'    => 'sitemap',
				'success' => true,
				'message' => __( 'Sitemap cache flushed.', 'neo-pulse-wp' ),
			)
		);
		self::redirect_to_sitemap( $tab );
	}

	public static function handle_rebuild_sitemap_post_type(): void {
		if ( ! current_user_can( 'manage_options' ) ) {
			wp_die( esc_html__( 'You do not have permission to manage sitemap settings.', 'neo-pulse-wp' ) );
		}
		check_admin_referer( self::ACTION_REBUILD_SITEMAP_POST_TYPE, 'neo_pulse_wp_sitemap_rebuild_post_type_nonce' );

		$tab  = isset( $_POST['neo-pulse_sitemap_tab'] ) ? sanitize_key( wp_unslash( (string) $_POST['neo-pulse_sitemap_tab'] ) ) : '';
		$slug = 0 === strpos( $tab, 'pt-' ) && 'pt-rebuild-all' !== $tab ? sanitize_key( substr( $tab, 3 ) ) : '';

		if ( $slug === '' || ! Neo_Pulse_Wp_Sitemap_Settings::rebuild_post_type_sitemap( $slug ) ) {
			wp_die( esc_html__( 'Could not rebuild sitemap for this post type.', 'neo-pulse-wp' ) );
		}

		self::set_flash(
			array(
				'kind'    => 'sitemap',
				'success' => true,
				'message' => __( 'Post type sitemap rebuilt.', 'neo-pulse-wp' ),
			)
		);
		self::redirect_to_sitemap( $tab );
	}

	public static function handle_rebuild_sitemap_all_post_types(): void {
		if ( ! current_user_can( 'manage_options' ) ) {
			wp_die( esc_html__( 'You do not have permission to manage sitemap settings.', 'neo-pulse-wp' ) );
		}
		check_admin_referer( self::ACTION_REBUILD_SITEMAP_ALL_POST_TYPES, 'neo_pulse_wp_sitemap_rebuild_all_post_types_nonce' );

		$tab   = isset( $_POST['neo-pulse_sitemap_tab'] ) ? sanitize_key( wp_unslash( (string) $_POST['neo-pulse_sitemap_tab'] ) ) : 'pt-rebuild-all';
		$count = Neo_Pulse_Wp_Sitemap_Settings::rebuild_all_post_type_sitemaps();

		self::set_flash(
			array(
				'kind'    => 'sitemap',
				'success' => true,
				'message' => sprintf(
					/* translators: %d: number of post types */
					_n( '%d post type sitemap rebuilt.', '%d post type sitemaps rebuilt.', $count, 'neo-pulse-wp' ),
					$count
				),
			)
		);
		self::redirect_to_sitemap( $tab );
	}

	/**
	 * @param string               $tab      Active tab.
	 * @param array<string, mixed> $existing Existing config.
	 * @return array<string, mixed>
	 */
	private static function sitemap_config_from_post( string $tab, array $existing ): array {
		$config = $existing;

		if ( 'general' === $tab ) {
			$config['general'] = array(
				'enabled'           => ! empty( $_POST['neo-pulse_sitemap_enabled'] ),
				'links_per_sitemap' => isset( $_POST['neo-pulse_sitemap_links_per'] ) ? absint( wp_unslash( $_POST['neo-pulse_sitemap_links_per'] ) ) : 200,
				'include_images'    => ! empty( $_POST['neo-pulse_sitemap_include_images'] ),
				'exclude_post_ids'  => isset( $_POST['neo-pulse_sitemap_exclude_ids'] ) ? wp_unslash( (string) $_POST['neo-pulse_sitemap_exclude_ids'] ) : '',
			);
			return Neo_Pulse_Wp_Sitemap_Settings::sanitize_config( $config );
		}

		if ( 'html' === $tab ) {
			$config['html'] = array(
				'enabled'    => ! empty( $_POST['neo-pulse_sitemap_html_enabled'] ),
				'shortcode'  => '[neo-pulse_sitemap]',
				'sort_order' => isset( $_POST['neo-pulse_sitemap_html_sort'] ) ? sanitize_key( wp_unslash( (string) $_POST['neo-pulse_sitemap_html_sort'] ) ) : 'title',
			);
			return Neo_Pulse_Wp_Sitemap_Settings::sanitize_config( $config );
		}

		if ( 0 === strpos( $tab, 'pt-' ) ) {
			$slug = sanitize_key( substr( $tab, 3 ) );
			if ( $slug !== '' && isset( $config['post_types'][ $slug ] ) ) {
				$config['post_types'][ $slug ] = array(
					'include_xml'       => ! empty( $_POST['neo-pulse_sitemap_include_xml'] ),
					'include_html'      => ! empty( $_POST['neo-pulse_sitemap_include_html'] ),
					'image_meta'        => isset( $_POST['neo-pulse_sitemap_image_meta'] ) ? wp_unslash( (string) $_POST['neo-pulse_sitemap_image_meta'] ) : '',
				);
			}
			return Neo_Pulse_Wp_Sitemap_Settings::sanitize_config( $config );
		}

		if ( 0 === strpos( $tab, 'tax-' ) ) {
			$slug = sanitize_key( substr( $tab, 4 ) );
			if ( $slug !== '' && isset( $config['taxonomies'][ $slug ] ) ) {
				$config['taxonomies'][ $slug ] = array(
					'include_xml'  => ! empty( $_POST['neo-pulse_sitemap_include_xml'] ),
					'include_html' => ! empty( $_POST['neo-pulse_sitemap_include_html'] ),
				);
			}
			return Neo_Pulse_Wp_Sitemap_Settings::sanitize_config( $config );
		}

		return Neo_Pulse_Wp_Sitemap_Settings::sanitize_config( $config );
	}

	private static function redirect_to_sitemap( string $tab = 'general' ): void {
		self::redirect_to_page( 'neo-pulse-wp-sitemap', $tab !== '' && 'general' !== $tab ? array( 'tab' => $tab ) : array() );
	}
}
