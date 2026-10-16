<?php
/**
 * Search settings admin_post handlers.
 *
 * @package Neo_Pulse_Wp
 */

defined( 'ABSPATH' ) || exit;

trait Neo_Pulse_Wp_Admin_Trait_Handlers_Search {

	const ACTION_SAVE_SEARCH  = 'neo_pulse_wp_save_search';
	const ACTION_RESET_SEARCH = 'neo_pulse_wp_reset_search';

	public static function handle_save_search(): void {
		if ( ! current_user_can( 'manage_options' ) ) {
			wp_die( esc_html__( 'You do not have permission to save search settings.', 'neo-pulse-wp' ) );
		}
		check_admin_referer( self::ACTION_SAVE_SEARCH, 'neo_pulse_wp_search_nonce' );

		$raw = isset( $_POST['neo-pulse_search'] ) ? (array) wp_unslash( $_POST['neo-pulse_search'] ) : array();
		$tab = isset( $_POST['neo-pulse_search_tab'] ) ? sanitize_key( wp_unslash( $_POST['neo-pulse_search_tab'] ) ) : 'general';

		$data = array();

		if ( $tab === 'general' ) {
			if ( isset( $raw['placeholder'] ) && is_string( $raw['placeholder'] ) ) {
				$data['placeholder'] = (string) $raw['placeholder'];
			}
			if ( isset( $raw['button_label'] ) && is_string( $raw['button_label'] ) ) {
				$data['button_label'] = (string) $raw['button_label'];
			}
			if ( isset( $raw['max_results'] ) && is_scalar( $raw['max_results'] ) ) {
				$data['max_results'] = (int) $raw['max_results'];
			}
			if ( isset( $raw['daily_ai_cap'] ) && is_scalar( $raw['daily_ai_cap'] ) && $raw['daily_ai_cap'] !== '' ) {
				$data['daily_ai_cap'] = (int) $raw['daily_ai_cap'];
			}
			$data['post_types'] = isset( $raw['post_types'] ) && is_array( $raw['post_types'] )
				? $raw['post_types']
				: array( 'post', 'page' );
			if ( isset( $raw['content_type_labels'] ) && is_array( $raw['content_type_labels'] ) ) {
				$data['content_type_labels'] = $raw['content_type_labels'];
			}
			if ( isset( $raw['openrouter_model'] ) && is_string( $raw['openrouter_model'] ) ) {
				$data['openrouter_model'] = (string) $raw['openrouter_model'];
			}
			if ( isset( $raw['type_priority'] ) && is_array( $raw['type_priority'] ) ) {
				$data['type_priority'] = $raw['type_priority'];
			}
			if ( isset( $raw['priority_mode'] ) && is_string( $raw['priority_mode'] ) ) {
				$data['priority_mode'] = $raw['priority_mode'];
			}
			$data['indexable_only'] = ! empty( $raw['indexable_only'] );
		}

		if ( $tab === 'popular' ) {
			$pinned               = isset( $raw['pinned_terms'] ) && is_string( $raw['pinned_terms'] ) ? $raw['pinned_terms'] : '';
			$hidden               = isset( $raw['hidden_terms'] ) && is_string( $raw['hidden_terms'] ) ? $raw['hidden_terms'] : '';
			$data['pinned_terms'] = Neo_Pulse_Wp_Search_Popular::sanitize_list( $pinned, Neo_Pulse_Wp_Search_Popular::MAX_PINNED );
			$data['hidden_terms'] = Neo_Pulse_Wp_Search_Popular::sanitize_list( $hidden, Neo_Pulse_Wp_Search_Popular::MAX_HIDDEN );
		}

		if ( ! empty( $data ) ) {
			Neo_Pulse_Wp_Search::save_search_settings( $data );
		}

		self::set_flash(
			array(
				'kind'    => 'search',
				'success' => true,
				'message' => __( 'Search settings saved. Purge the NitroPack or WP Engine page cache if guests still see an old search bar.', 'neo-pulse-wp' ),
			)
		);
		self::redirect_to_search( $tab );
	}

	public static function handle_reset_search(): void {
		if ( ! current_user_can( 'manage_options' ) ) {
			wp_die( esc_html__( 'You do not have permission to reset search settings.', 'neo-pulse-wp' ) );
		}
		check_admin_referer( self::ACTION_RESET_SEARCH, 'neo_pulse_wp_search_reset_nonce' );

		$tab = isset( $_POST['neo-pulse_search_tab'] ) ? sanitize_key( wp_unslash( $_POST['neo-pulse_search_tab'] ) ) : 'general';

		if ( $tab === 'popular' ) {
			// Resetting this tab only clears the pinned and hidden searches.
			Neo_Pulse_Wp_Search::save_search_settings( array( 'pinned_terms' => array(), 'hidden_terms' => array() ) );
		} else {
			// Reset Options on the Settings tab restores defaults but keeps the Popular searches
			// lists (pinned / hidden terms); those have their own reset on that tab.
			// Only one cache purge: the reset skips it when save_search_settings() (which purges) follows.
			$current   = Neo_Pulse_Wp_Search::get_search_settings();
			$keep      = array(
				'pinned_terms' => isset( $current['pinned_terms'] ) && is_array( $current['pinned_terms'] ) ? $current['pinned_terms'] : array(),
				'hidden_terms' => isset( $current['hidden_terms'] ) && is_array( $current['hidden_terms'] ) ? $current['hidden_terms'] : array(),
			);
			$will_save = $keep['pinned_terms'] !== array() || $keep['hidden_terms'] !== array();
			Neo_Pulse_Wp_Search::reset_search_settings( ! $will_save );
			if ( $will_save ) {
				Neo_Pulse_Wp_Search::save_search_settings( $keep );
			}
		}

		self::set_flash(
			array(
				'kind'    => 'search',
				'success' => true,
				'message' => __( 'Search settings reset to defaults. Purge your host page cache so guests see the update.', 'neo-pulse-wp' ),
			)
		);
		self::redirect_to_search( $tab );
	}
}
