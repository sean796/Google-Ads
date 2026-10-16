<?php
/**
 * Flash transients and app redirects.
 *
 * @package Neo_Pulse_Wp
 */

defined( 'ABSPATH' ) || exit;

trait Neo_Pulse_Wp_Admin_Trait_Flash_Redirect {

	/**
	 * @param array<string,mixed> $data Flash payload.
	 */
	private static function set_flash( array $data ): void {
		set_transient( 'neo_pulse_wp_flash_' . get_current_user_id(), $data, 120 );
	}

	/**
	 * @return array<string,mixed>|null
	 */
	private static function get_and_clear_flash(): ?array {
		$key = 'neo_pulse_wp_flash_' . get_current_user_id();
		$d   = get_transient( $key );
		if ( false !== $d ) {
			delete_transient( $key );
		}
		return is_array( $d ) ? $d : null;
	}

	/**
	 * Redirect to a Neo Pulse admin screen and stop. Every redirect_to_* helper goes through here.
	 *
	 * @param string               $slug     Admin page slug (e.g. neo-pulse-wp-settings).
	 * @param array<string, mixed> $args     Extra query args, added in order.
	 * @param string               $fragment Optional #fragment (without the #).
	 */
	private static function redirect_to_page( string $slug, array $args = array(), string $fragment = '' ): void {
		$url = admin_url( 'admin.php?page=' . $slug );
		if ( ! empty( $args ) ) {
			$url = add_query_arg( $args, $url );
		}
		if ( $fragment !== '' ) {
			$url .= '#' . $fragment;
		}
		wp_safe_redirect( $url );
		exit;
	}

	/**
	 * Query args for list-style screens: `action` (omitted for the list view), `id`, then extras.
	 *
	 * @param array<string, mixed> $query Extra query args.
	 * @return array<string, mixed>
	 */
	private static function redirect_view_args( string $view, int $id, array $query ): array {
		$args = array();
		if ( 'list' !== $view ) {
			$args['action'] = $view;
		}
		if ( $id > 0 ) {
			$args['id'] = $id;
		}
		return array_merge( $args, $query );
	}

	/**
	 * @param string $tab Settings tab ('' opens the default tab).
	 */
	private static function redirect_to_settings( string $tab = '' ): void {
		self::redirect_to_page( 'neo-pulse-wp-settings', $tab !== '' ? array( 'tab' => $tab ) : array() );
	}

	private static function redirect_to_analytics( string $tab = 'overview' ): void {
		self::redirect_to_page( 'neo-pulse-wp-analytics', $tab !== '' && 'overview' !== $tab ? array( 'tab' => $tab ) : array() );
	}

	private static function redirect_to_chat( string $tab = 'general' ): void {
		self::redirect_to_page( 'neo-pulse-wp-chat', $tab !== '' && 'general' !== $tab ? array( 'tab' => $tab ) : array() );
	}

	private static function redirect_to_search( string $tab = 'general' ): void {
		self::redirect_to_page( 'neo-pulse-wp-search', $tab !== '' && 'general' !== $tab ? array( 'tab' => $tab ) : array() );
	}

	/**
	 * @param string               $view  list|new|edit|import-export|settings|404
	 * @param int                  $id    Redirect ID for edit redirect.
	 * @param array<string, mixed> $query Extra query args.
	 */
	private static function redirect_to_redirects( string $view = 'list', int $id = 0, array $query = array() ): void {
		self::redirect_to_page( 'neo-pulse-wp-redirects', self::redirect_view_args( $view, $id, $query ) );
	}

	/**
	 * @param string               $view  list|import-export|settings
	 * @param int                  $id    Unused.
	 * @param array<string, mixed> $query Extra query args.
	 */
	private static function redirect_to_search_logs( string $view = 'list', int $id = 0, array $query = array() ): void {
		unset( $id );
		self::redirect_to_page( 'neo-pulse-wp-search-logs', self::redirect_view_args( $view, 0, $query ) );
	}

	/**
	 * @param string               $view  list|import-export|settings|analysis|reports|view-report
	 * @param int                  $id    Report ID for view-report.
	 * @param array<string, mixed> $query Extra query args.
	 */
	private static function redirect_to_chat_logs( string $view = 'list', int $id = 0, array $query = array() ): void {
		self::redirect_to_page( 'neo-pulse-wp-chat-logs', self::redirect_view_args( $view, $id, $query ) );
	}

	/**
	 * @param string               $view  list|import-export|settings|session|analysis|reports|view-report|tasks
	 * @param int                  $id    Report ID for view-report.
	 * @param array<string, mixed> $query Extra query args.
	 */
	private static function redirect_to_overseer( string $view = 'list', int $id = 0, array $query = array() ): void {
		self::redirect_to_page( 'neo-pulse-wp-overseer', self::redirect_view_args( $view, $id, $query ) );
	}

	/**
	 * @param string               $view  list|new|edit|import-export|settings
	 * @param int                  $id    Script ID for edit redirect.
	 * @param array<string, mixed> $query Extra query args.
	 */
	private static function redirect_to_script_manager( string $view = 'list', int $id = 0, array $query = array() ): void {
		self::redirect_to_page( 'neo-pulse-wp-script-manager', self::redirect_view_args( $view, $id, $query ) );
	}
}
