<?php
/**
 * Settings-related admin_init handlers.
 *
 * @package Neo_Pulse_Wp
 */

defined( 'ABSPATH' ) || exit;

trait Neo_Pulse_Wp_Admin_Trait_Handlers_Settings {

	public static function handle_save_openrouter(): void {
		if ( ! current_user_can( 'manage_options' ) ) {
			wp_die( esc_html__( 'You do not have permission to save AI credentials.', 'neo-pulse-wp' ) );
		}
		check_admin_referer( self::ACTION_SAVE_OPENROUTER, 'neo_pulse_wp_openrouter_nonce' );

		if ( ! empty( $_POST['neo-pulse_editor_ai_types_posted'] ) ) {
			$types = isset( $_POST['neo-pulse_editor_ai_post_types'] ) && is_array( $_POST['neo-pulse_editor_ai_post_types'] )
				? array_map( 'sanitize_key', wp_unslash( $_POST['neo-pulse_editor_ai_post_types'] ) )
				: array();
			Neo_Pulse_Wp_Editor_Ai_Settings::save_post_types( $types );
		}

		$raw    = isset( $_POST['neo-pulse_openrouter_api_key'] ) && is_string( $_POST['neo-pulse_openrouter_api_key'] ) ? wp_unslash( $_POST['neo-pulse_openrouter_api_key'] ) : '';
		$key    = sanitize_text_field( trim( (string) $raw ) );
		$remove = ! empty( $_POST['openrouter_remove_key'] );
		$had    = Neo_Pulse_Wp_Api::get_agency_openrouter_api_key() !== '';

		if ( $remove ) {
			// Explicit "Remove saved key": clear it even if something was typed in the field.
			if ( $had ) {
				Neo_Pulse_Wp_Api::save_agency_openrouter_api_key( '' );
			}
			$message = $had
				? __( 'Editor AI settings saved. The saved OpenRouter key was removed.', 'neo-pulse-wp' )
				: __( 'Editor AI settings saved. There was no saved OpenRouter key to remove.', 'neo-pulse-wp' );
		} elseif ( $key !== '' ) {
			Neo_Pulse_Wp_Api::save_agency_openrouter_api_key( $key );
			$message = __( 'Editor AI settings saved, including the OpenRouter key.', 'neo-pulse-wp' );
		} else {
			// Blank field keeps whatever key is saved.
			$message = __( 'Editor AI settings saved.', 'neo-pulse-wp' );
		}

		self::set_flash(
			array(
				'kind'    => 'openrouter',
				'success' => true,
				'message' => $message,
			)
		);
		self::redirect_to_settings( 'openrouter' );
	}

	/**
	 * Settings → Search Console: store or remove the Google service account JSON.
	 * The pasted JSON is never echoed back; only its client_email is shown afterwards.
	 */
	public static function handle_save_gsc(): void {
		if ( ! current_user_can( 'manage_options' ) ) {
			wp_die( esc_html__( 'You do not have permission to save Search Console credentials.', 'neo-pulse-wp' ) );
		}
		check_admin_referer( self::ACTION_SAVE_GSC, 'neo_pulse_wp_gsc_nonce' );

		if ( ! method_exists( 'Neo_Pulse_Wp_Gsc', 'save_service_account_json' ) ) {
			self::set_flash(
				array(
					'kind'    => 'gsc',
					'success' => false,
					'message' => __( 'Saving a Search Console key here needs a newer version of Neo Pulse.', 'neo-pulse-wp' ),
				)
			);
			self::redirect_to_settings( 'gsc' );
		}

		if ( ! empty( $_POST['gsc_check'] ) ) {
			Neo_Pulse_Wp_Gsc::flush_stats_cache();
			$check = Neo_Pulse_Wp_Gsc::test_connection( true );
			$ok    = ! is_wp_error( $check ) && ! empty( $check['connected'] );
			self::set_flash(
				array(
					'kind'    => 'gsc',
					'success' => $ok,
					'message' => $ok
						? __( 'Connected to Google Search Console.', 'neo-pulse-wp' )
						: ( is_wp_error( $check ) ? $check->get_error_message() : (string) $check['error'] ),
				)
			);
			self::redirect_to_settings( 'gsc' );
		}

		$remove = ! empty( $_POST['gsc_remove_key'] );
		// Raw JSON: the private key must not go through sanitize_text_field(); the GSC class validates it.
		$json = isset( $_POST['gsc_service_account_json'] ) && is_string( $_POST['gsc_service_account_json'] )
			? trim( wp_unslash( $_POST['gsc_service_account_json'] ) ) // phpcs:ignore WordPress.Security.ValidatedSanitizedInput.InputNotSanitized
			: '';

		if ( $remove ) {
			$result  = Neo_Pulse_Wp_Gsc::save_service_account_json( '' );
			$message = __( 'The saved Search Console service account key was removed.', 'neo-pulse-wp' );
		} elseif ( $json !== '' ) {
			$result  = Neo_Pulse_Wp_Gsc::save_service_account_json( $json );
			$message = __( 'Search Console service account key saved.', 'neo-pulse-wp' );
		} else {
			$result  = new WP_Error( 'neo-pulse_gsc_empty', __( 'Paste the service account JSON, or tick "Remove saved key".', 'neo-pulse-wp' ) );
			$message = '';
		}

		if ( is_wp_error( $result ) ) {
			self::set_flash(
				array(
					'kind'    => 'gsc',
					'success' => false,
					'message' => $result->get_error_message(),
				)
			);
		} else {
			self::set_flash(
				array(
					'kind'    => 'gsc',
					'success' => true,
					'message' => $message,
				)
			);
		}
		self::redirect_to_settings( 'gsc' );
	}

	public static function handle_save_dataforseo(): void {
		if ( ! current_user_can( 'manage_options' ) ) {
			wp_die( esc_html__( 'You do not have permission to save research credentials.', 'neo-pulse-wp' ) );
		}
		check_admin_referer( self::ACTION_SAVE_DATAFORSEO, 'neo_pulse_wp_dataforseo_nonce' );

		$login_raw    = isset( $_POST['neo-pulse_dataforseo_login'] ) ? wp_unslash( $_POST['neo-pulse_dataforseo_login'] ) : '';
		$password_raw = isset( $_POST['neo-pulse_dataforseo_password'] ) ? wp_unslash( $_POST['neo-pulse_dataforseo_password'] ) : '';
		$login        = sanitize_text_field( trim( (string) $login_raw ) );
		$password     = trim( (string) $password_raw );
		$existing     = Neo_Pulse_Wp_Api::get_agency_dataforseo_credentials();

		if ( $login === '' && $password === '' ) {
			if ( $existing['login'] !== '' || $existing['password'] !== '' ) {
				Neo_Pulse_Wp_Api::save_agency_dataforseo_credentials( '', '' );
				self::set_flash(
					array(
						'kind'    => 'dataforseo',
						'success' => true,
						'message' => __( 'DataForSEO credentials cleared.', 'neo-pulse-wp' ),
					)
				);
			} else {
				self::set_flash(
					array(
						'kind'    => 'dataforseo',
						'success' => false,
						'message' => __( 'Enter your DataForSEO login and API password.', 'neo-pulse-wp' ),
					)
				);
			}
			self::redirect_to_settings( 'dataforseo' );
		}

		if ( $login === '' && $existing['login'] !== '' ) {
			$login = $existing['login'];
		}
		if ( $password === '' && $existing['password'] !== '' ) {
			$password = $existing['password'];
		}

		if ( $login === '' || $password === '' ) {
			self::set_flash(
				array(
					'kind'    => 'dataforseo',
					'success' => false,
					'message' => __( 'Both DataForSEO login and API password are required.', 'neo-pulse-wp' ),
				)
			);
			self::redirect_to_settings( 'dataforseo' );
		}

		$unchanged = $login === $existing['login'] && $password === $existing['password'];
		if ( $unchanged ) {
			self::set_flash(
				array(
					'kind'    => 'dataforseo',
					'success' => true,
					'message' => __( 'DataForSEO credentials unchanged.', 'neo-pulse-wp' ),
				)
			);
			self::redirect_to_settings( 'dataforseo' );
		}

		Neo_Pulse_Wp_Api::save_agency_dataforseo_credentials( $login, $password );
		self::set_flash(
			array(
				'kind'    => 'dataforseo',
				'success' => true,
				'message' => __( 'DataForSEO credentials saved for SEO research briefs.', 'neo-pulse-wp' ),
			)
		);
		self::redirect_to_settings( 'dataforseo' );
	}

	public static function handle_save_chat(): void {
		if ( ! current_user_can( 'manage_options' ) ) {
			wp_die( esc_html__( 'You do not have permission to save chat settings.', 'neo-pulse-wp' ) );
		}
		check_admin_referer( 'neo_pulse_wp_save_chat', 'neo_pulse_wp_chat_nonce' );

		$enabled          = ! empty( $_POST['neo_pulse_chat_enabled'] );
		$off_everywhere   = ! empty( $_POST['neo_pulse_chat_off_everywhere'] );
		$without_widget   = ! empty( $_POST['neo_pulse_chat_show_without_widget'] );
		$disable_backend  = ! empty( $_POST['neo_pulse_chat_disable_backend'] );
		$logged_in_only   = ! empty( $_POST['neo_pulse_chat_logged_in_only'] );
		$admin_only       = ! empty( $_POST['neo_pulse_chat_admin_only'] );
		$god_mode_enabled = ! empty( $_POST['neo_pulse_chat_god_mode_enabled'] );
		$whitelist_raw   = isset( $_POST['neo_pulse_chat_whitelist_url'] ) ? wp_unslash( $_POST['neo_pulse_chat_whitelist_url'] ) : '';
		$whitelist_url   = esc_url_raw( trim( (string) $whitelist_raw ) );
		$welcome_raw     = isset( $_POST['neo_pulse_chat_welcome_message'] ) ? wp_unslash( $_POST['neo_pulse_chat_welcome_message'] ) : '';
		$welcome_message = sanitize_text_field( trim( (string) $welcome_raw ) );

		$chekkit_enabled        = ! empty( $_POST['neo_pulse_chat_chekkit_enabled'] );
		$chekkit_teaser_enabled = ! empty( $_POST['neo_pulse_chat_chekkit_teaser_enabled'] );
		$chekkit_cta_raw = isset( $_POST['neo_pulse_chat_chekkit_cta_label'] ) ? wp_unslash( $_POST['neo_pulse_chat_chekkit_cta_label'] ) : '';
		$chekkit_cta_label = sanitize_text_field( trim( (string) $chekkit_cta_raw ) );
		$chekkit_event_raw = isset( $_POST['neo_pulse_chat_chekkit_event_type'] ) ? wp_unslash( $_POST['neo_pulse_chat_chekkit_event_type'] ) : '';
		$chekkit_event_type = sanitize_key( trim( (string) $chekkit_event_raw ) );
		if ( $chekkit_event_type === '' ) {
			$chekkit_event_type = 'contact_request';
		}
		$chekkit_webhook_raw = isset( $_POST['neo_pulse_chat_chekkit_webhook_url'] ) ? wp_unslash( $_POST['neo_pulse_chat_chekkit_webhook_url'] ) : '';
		$chekkit_webhook_url = esc_url_raw( trim( (string) $chekkit_webhook_raw ) );
		if ( $chekkit_webhook_url === '' ) {
			$chekkit_webhook_url = Neo_Pulse_Wp_Chekkit::DEFAULT_WEBHOOK_URL;
		}

		Neo_Pulse_Wp_Chat::save_settings(
			array(
				'enabled'              => $enabled,
				'off_everywhere'       => $off_everywhere,
				'show_without_widget'  => $without_widget,
				'voice_enabled'        => ! empty( $_POST['neo_pulse_chat_voice_enabled'] ),
				'voice_ptt'            => ! empty( $_POST['neo_pulse_chat_voice_ptt'] ),
				'mic_replaces_send'    => ! empty( $_POST['neo_pulse_chat_mic_replaces_send'] ),
				'disable_backend'      => $disable_backend,
				'logged_in_only'       => $logged_in_only,
				'admin_only'           => $admin_only,
				'god_mode_enabled'     => $god_mode_enabled,
				'whitelist_url'        => $whitelist_url,
				'welcome_message'      => $welcome_message !== '' ? $welcome_message : __( 'Hi! Ask me anything about this website.', 'neo-pulse-wp' ),
				'chekkit_enabled'        => $chekkit_enabled,
				'chekkit_teaser_enabled' => $chekkit_teaser_enabled,
				'chekkit_cta_label'      => $chekkit_cta_label !== '' ? $chekkit_cta_label : __( 'Send Us A Text', 'neo-pulse-wp' ),
				'chekkit_event_type'   => $chekkit_event_type,
				'chekkit_webhook_url'  => $chekkit_webhook_url,
			)
		);

		self::set_flash(
			array(
				'kind'    => 'chat',
				'success' => true,
				'message' => $off_everywhere
					? __( 'AI chat is turned off everywhere: front end, WordPress admin and the search panel, for every user including administrators.', 'neo-pulse-wp' )
					: ( $enabled
						? __( 'Chat widget enabled. Chat is available in the AI Search sidebar on the frontend.', 'neo-pulse-wp' )
						: __( 'Chat widget disabled.', 'neo-pulse-wp' ) ),
			)
		);
		self::redirect_to_chat();
	}

	public static function handle_save_chat_training(): void {
		if ( ! current_user_can( 'manage_options' ) ) {
			wp_die( esc_html__( 'You do not have permission to save training settings.', 'neo-pulse-wp' ) );
		}
		check_admin_referer( 'neo_pulse_wp_save_chat_training', 'neo_pulse_wp_chat_training_nonce' );

		$assistant_name = isset( $_POST['neo_pulse_chat_assistant_name'] )
			? sanitize_text_field( trim( (string) wp_unslash( $_POST['neo_pulse_chat_assistant_name'] ) ) )
			: 'Pulse Assist';
		if ( $assistant_name === '' ) {
			$assistant_name = 'Pulse Assist';
		}

		$system_prompt = isset( $_POST['neo_pulse_chat_system_prompt'] )
			? sanitize_textarea_field( wp_unslash( $_POST['neo_pulse_chat_system_prompt'] ) )
			: '';

		$greeting_style_raw = isset( $_POST['neo_pulse_chat_greeting_style'] )
			? sanitize_text_field( wp_unslash( $_POST['neo_pulse_chat_greeting_style'] ) )
			: 'friendly';
		$greeting_style = in_array( $greeting_style_raw, array( 'professional', 'friendly', 'casual' ), true )
			? $greeting_style_raw
			: 'friendly';

		$indexed_types_raw = isset( $_POST['neo_pulse_chat_indexed_types'] ) && is_array( $_POST['neo_pulse_chat_indexed_types'] )
			? $_POST['neo_pulse_chat_indexed_types'] // phpcs:ignore WordPress.Security.ValidatedSanitizedInput
			: array( 'post', 'page' );
		$indexed_types = array_map( 'sanitize_key', $indexed_types_raw );
		if ( empty( $indexed_types ) ) {
			$indexed_types = array( 'post', 'page' );
		}

		$excluded_cats = array();
		if ( isset( $_POST['neo_pulse_chat_excluded_cats'] ) && is_array( $_POST['neo_pulse_chat_excluded_cats'] ) ) {
			$excluded_cats = array_map( 'absint', $_POST['neo_pulse_chat_excluded_cats'] );
		}

		$full_content = ! empty( $_POST['neo_pulse_chat_full_content'] );
		$lead_conversion_enabled = ! empty( $_POST['neo_pulse_chat_lead_conversion_enabled'] );

		Neo_Pulse_Wp_Chat::save_settings(
			array(
				'assistant_name'            => $assistant_name,
				'system_prompt'             => $system_prompt,
				'greeting_style'            => $greeting_style,
				'indexed_post_types'        => $indexed_types,
				'excluded_categories'       => $excluded_cats,
				'full_content'              => $full_content,
				'lead_conversion_enabled'   => $lead_conversion_enabled,
			)
		);

		Neo_Pulse_Wp_Chat_Rag::invalidate_cache();

		self::set_flash(
			array(
				'kind'    => 'chat',
				'success' => true,
				'message' => __( 'Training settings saved. The RAG cache has been refreshed.', 'neo-pulse-wp' ),
			)
		);
		self::redirect_to_chat( 'training' );
	}

	public static function handle_save_chat_knowledge_base(): void {
		if ( ! current_user_can( 'manage_options' ) ) {
			wp_die( esc_html__( 'You do not have permission to save knowledge base settings.', 'neo-pulse-wp' ) );
		}
		check_admin_referer( 'neo_pulse_wp_save_chat_knowledge_base', 'neo_pulse_wp_chat_kb_nonce' );

		$knowledge_base = array();
		if ( isset( $_POST['neo_pulse_chat_kb'] ) && is_array( $_POST['neo_pulse_chat_kb'] ) ) {
			foreach ( $_POST['neo_pulse_chat_kb'] as $entry ) { // phpcs:ignore WordPress.Security.ValidatedSanitizedInput
				$q = isset( $entry['question'] ) ? sanitize_text_field( wp_unslash( $entry['question'] ) ) : '';
				$a = isset( $entry['answer'] ) ? sanitize_textarea_field( wp_unslash( $entry['answer'] ) ) : '';
				$p = isset( $entry['priority'] ) && $entry['priority'] === 'high' ? 'high' : 'normal';
				if ( $q !== '' || $a !== '' ) {
					$knowledge_base[] = array(
						'question' => $q,
						'answer'   => $a,
						'priority' => $p,
					);
				}
			}
		}

		Neo_Pulse_Wp_Chat::save_settings(
			array(
				'knowledge_base' => $knowledge_base,
			)
		);

		Neo_Pulse_Wp_Chat_Rag::invalidate_cache();

		self::set_flash(
			array(
				'kind'    => 'chat',
				'success' => true,
				'message' => __( 'Knowledge base saved. The RAG cache has been refreshed.', 'neo-pulse-wp' ),
			)
		);
		self::redirect_to_chat( 'knowledge-base' );
	}

	public static function handle_save_gmb(): void {
		if ( ! current_user_can( 'manage_options' ) ) {
			wp_die( esc_html__( 'You do not have permission to save GMB credentials.', 'neo-pulse-wp' ) );
		}
		check_admin_referer( 'neo_pulse_wp_save_gmb', 'neo_pulse_wp_gmb_nonce' );

		$client_id     = isset( $_POST['neo-pulse_gmb_client_id'] ) ? sanitize_text_field( wp_unslash( $_POST['neo-pulse_gmb_client_id'] ) ) : '';
		$client_secret = isset( $_POST['neo-pulse_gmb_client_secret'] ) ? trim( (string) wp_unslash( $_POST['neo-pulse_gmb_client_secret'] ) ) : '';
		$location_id   = isset( $_POST['neo-pulse_gmb_location_id'] ) ? sanitize_text_field( wp_unslash( $_POST['neo-pulse_gmb_location_id'] ) ) : '';

		if ( $client_secret === '' ) {
			$client_secret = Neo_Pulse_Wp_Gmb::get_client_secret();
		}

		if ( $client_id !== '' ) {
			Neo_Pulse_Wp_Gmb::save_credentials( $client_id, $client_secret, $location_id );
		} elseif ( $location_id !== '' ) {
			Neo_Pulse_Wp_Gmb::save_location_id( $location_id );
		}

		self::set_flash(
			array(
				'kind'    => 'gmb',
				'success' => true,
				'message' => __( 'GMB credentials saved.', 'neo-pulse-wp' ),
			)
		);
		self::redirect_to_settings( 'gmb' );
	}
}
