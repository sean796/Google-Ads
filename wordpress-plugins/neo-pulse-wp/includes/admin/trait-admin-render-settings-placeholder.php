<?php
/**
 * Settings screen: Licence, Editor AI (OpenRouter key + editor post types), Search Console
 * (service account key), SEO research (DataForSEO) and Google Business tabs. The tabs are the
 * Settings section tabs across the top of the screen (Neo_Pulse_Wp_Admin_Menu::sections()).
 *
 * @package Neo_Pulse_Wp
 */

defined( 'ABSPATH' ) || exit;

trait Neo_Pulse_Wp_Admin_Trait_Render_Settings_Placeholder {

	public static function render_settings_placeholder_page(): void {
		if ( ! current_user_can( self::required_capability() ) ) {
			return;
		}

		$openrouter_configured = Neo_Pulse_Wp_OpenRouter::get_api_key() !== '';
		$openrouter_source     = Neo_Pulse_Wp_OpenRouter::get_openrouter_source();
		$has_site_openrouter   = Neo_Pulse_Wp_Api::get_agency_openrouter_api_key() !== '';
		$dfs_configured        = Neo_Pulse_Wp_Research_Keys::dataforseo_configured();
		$dfs_source            = Neo_Pulse_Wp_Research_Keys::get_dataforseo_source();
		$has_site_dfs          = Neo_Pulse_Wp_Api::get_agency_dataforseo_login() !== '' || Neo_Pulse_Wp_Api::get_agency_dataforseo_password() !== '';
		$site_dfs_login        = Neo_Pulse_Wp_Api::get_agency_dataforseo_login();
		if ( $site_dfs_login === '' && $dfs_configured ) {
			$site_dfs_login = Neo_Pulse_Wp_Research_Keys::dataforseo()['login'];
		}

		$tab = self::panel_active_tab( 'licence' );
		if ( ! in_array( $tab, array( 'licence', 'openrouter', 'gsc', 'dataforseo', 'gmb' ), true ) ) {
			$tab = 'licence';
		}

		self::neo_pulse_group_shell_open( 'neo-pulse-wp-settings', 'neo-pulse-wp-settings neo-pulse-wp-panel-page' );

		// The section tabs across the top already list these tabs, so no in-page nav is passed.
		self::panel_layout_start( 'neo-pulse-wp-settings', array(), $tab, __( 'Settings sections', 'neo-pulse-wp' ) );
		switch ( $tab ) {
			case 'openrouter':
				self::render_settings_section_openrouter( $openrouter_configured, $openrouter_source, $has_site_openrouter );
				break;
			case 'gsc':
				self::render_settings_section_gsc();
				break;
			case 'dataforseo':
				self::render_settings_section_dataforseo( $dfs_configured, $dfs_source, $has_site_dfs, $site_dfs_login );
				break;
			case 'gmb':
				self::render_settings_section_gmb();
				break;
			default:
				Neo_Pulse_Wp_License::render_settings_section();
				break;
		}
		self::panel_layout_end();

		self::neo_pulse_group_shell_close();
	}

	private static function render_settings_section_openrouter(
		bool $openrouter_configured,
		string $openrouter_source,
		bool $has_site_openrouter
	): void {
		$form_id = 'neo-pulse-wp-settings-openrouter-form';
		?>
		<h2 class="neo-pulse-wp-panel-content__title"><?php esc_html_e( 'Editor AI', 'neo-pulse-wp' ); ?></h2>
		<p class="neo-pulse-wp-panel-content__desc">
			<?php esc_html_e( 'The AI tools in the post editor (wands, SEO research, writing help) and Flow Assist. They need an OpenRouter key, which can live in wp-config.php or here.', 'neo-pulse-wp' ); ?>
		</p>

		<div class="neo-pulse-wp-panel-info-box" role="status">
			<p>
				<?php
				if ( $openrouter_configured ) {
					if ( 'site' === $openrouter_source ) {
						esc_html_e( 'Status: configured (saved on this site).', 'neo-pulse-wp' );
					} elseif ( 'wp-config' === $openrouter_source ) {
						esc_html_e( 'Status: configured (wp-config.php).', 'neo-pulse-wp' );
					} else {
						esc_html_e( 'Status: configured.', 'neo-pulse-wp' );
					}
				} else {
					esc_html_e( 'Status: not configured yet.', 'neo-pulse-wp' );
				}
				?>
			</p>
		</div>

		<?php if ( current_user_can( 'manage_options' ) ) : ?>
			<form id="<?php echo esc_attr( $form_id ); ?>" method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>" class="neo-pulse-wp-settings__form neo-pulse-schema-form neo-pulse-wp-settings__form--openrouter" autocomplete="off">
				<input type="hidden" name="action" value="<?php echo esc_attr( self::ACTION_SAVE_OPENROUTER ); ?>" />
				<?php wp_nonce_field( self::ACTION_SAVE_OPENROUTER, 'neo_pulse_wp_openrouter_nonce' ); ?>
				<?php
				self::panel_form_group_open();
				self::panel_form_field_input(
					'neo-pulse-wp-openrouter-api-key',
					'neo-pulse_openrouter_api_key',
					__( 'OpenRouter API key', 'neo-pulse-wp' ),
					'',
					'full',
					'password',
					false,
					$has_site_openrouter
						? __( 'A key is saved on this site. Leave blank to keep it, or paste a new key to replace it.', 'neo-pulse-wp' )
						: __( 'Paste your OpenRouter key (starts with sk-or-).', 'neo-pulse-wp' ),
					' placeholder="' . esc_attr( $has_site_openrouter ? '••••••••••••••••' : __( 'sk-or-v1-…', 'neo-pulse-wp' ) ) . '" autocomplete="off"'
				);
				if ( $has_site_openrouter ) {
					self::panel_form_toggle(
						'openrouter_remove_key',
						__( 'Remove saved key', 'neo-pulse-wp' ),
						false,
						__( 'Deletes the key saved on this site when you save. A key set in wp-config.php is not affected.', 'neo-pulse-wp' ),
						'1',
						'neo-pulse-wp-openrouter-remove-key'
					);
				}
				self::panel_form_group_close();
				self::render_editor_ai_post_types();
				?>
			</form>
		<?php else : ?>
			<p class="description"><?php esc_html_e( 'Ask a site administrator to add the OpenRouter key here.', 'neo-pulse-wp' ); ?></p>
		<?php endif; ?>

		<?php if ( current_user_can( 'manage_options' ) ) : ?>
			<div class="neo-pulse-wp-panel-footer">
				<p class="neo-pulse-wp-settings__actions neo-pulse-wp-panel-footer__right">
					<button type="submit" form="<?php echo esc_attr( $form_id ); ?>" class="button button-primary neo-pulse-wp-settings__btn"><?php esc_html_e( 'Save Editor AI', 'neo-pulse-wp' ); ?></button>
				</p>
			</div>
		<?php endif; ?>
		<?php
	}

	/**
	 * Post types that get the editor AI (was "Content Optimizer" under Sitemap).
	 */
	private static function render_editor_ai_post_types(): void {
		$enabled = Neo_Pulse_Wp_Editor_Ai_Settings::post_types();
		$types   = get_post_types( array( 'public' => true ), 'objects' );
		unset( $types['attachment'], $types['elementor_library'], $types['e-floating-buttons'] );
		?>
		<input type="hidden" name="neo-pulse_editor_ai_types_posted" value="1" />
		<h3 class="neo-pulse-chat-settings-section__title"><?php esc_html_e( 'Where the editor AI appears', 'neo-pulse-wp' ); ?></h3>
		<p class="neo-pulse-field__note"><?php esc_html_e( 'Show the NEO Pulse AI box and editor tools on these content types.', 'neo-pulse-wp' ); ?></p>
		<?php
		self::panel_form_group_open();
		foreach ( $types as $slug => $obj ) {
			?>
			<div class="neo-pulse-schema-cell neo-pulse-schema-cell--half">
				<label class="neo-pulse-wp-panel-toggle">
					<input type="checkbox" name="neo-pulse_editor_ai_post_types[]" value="<?php echo esc_attr( $slug ); ?>" <?php checked( in_array( $slug, $enabled, true ) ); ?> />
					<span class="neo-pulse-wp-panel-toggle__label"><?php echo esc_html( $obj->labels->name ); ?></span>
				</label>
			</div>
			<?php
		}
		self::panel_form_group_close();
	}

	private static function render_settings_section_gsc(): void {
		if ( method_exists( 'Neo_Pulse_Wp_Gsc', 'legacy_file_notice' ) ) {
			Neo_Pulse_Wp_Gsc::legacy_file_notice();
		}
		?>
		<h2 class="neo-pulse-wp-panel-content__title"><?php esc_html_e( 'Google Search Console', 'neo-pulse-wp' ); ?></h2>
		<p class="neo-pulse-wp-panel-content__desc">
			<?php esc_html_e( 'Analytics, the editor and Flow Assist read this site\'s Search Console stats through Neo Digital. To connect, add the service account email below as a user on this site\'s property in Google Search Console (Settings → Users and permissions, Restricted is enough). Nothing else to set up.', 'neo-pulse-wp' ); ?>
		</p>
		<?php
		self::render_gsc_connection_panel( false );
		self::render_gsc_service_account_form();
	}

	/**
	 * Client email of the service account JSON saved in the option, or '' when none is saved.
	 * Only this one field is read back; the JSON itself is never printed.
	 */
	private static function gsc_saved_client_email(): string {
		if ( ! defined( 'Neo_Pulse_Wp_Gsc::ACCOUNT_OPTION' ) ) {
			return '';
		}
		$raw = get_option( Neo_Pulse_Wp_Gsc::ACCOUNT_OPTION, '' );
		if ( is_string( $raw ) ) {
			$raw = json_decode( $raw, true );
		}
		if ( ! is_array( $raw ) || empty( $raw['client_email'] ) || ! is_string( $raw['client_email'] ) ) {
			return '';
		}
		return sanitize_email( $raw['client_email'] );
	}

	/**
	 * Paste / remove the service account JSON (manage_options only).
	 */
	private static function render_gsc_service_account_form(): void {
		if ( ! method_exists( 'Neo_Pulse_Wp_Gsc', 'save_service_account_json' ) ) {
			return;
		}
		if ( ! current_user_can( 'manage_options' ) ) {
			?>
			<p class="description"><?php esc_html_e( 'Ask a site administrator to add the Search Console service account key.', 'neo-pulse-wp' ); ?></p>
			<?php
			return;
		}

		$form_id      = 'neo-pulse-wp-settings-gsc-form';
		$has_account  = method_exists( 'Neo_Pulse_Wp_Gsc', 'has_service_account' ) && Neo_Pulse_Wp_Gsc::has_service_account();
		$source       = method_exists( 'Neo_Pulse_Wp_Gsc', 'credentials_source' ) ? Neo_Pulse_Wp_Gsc::credentials_source() : '';
		$saved_email  = self::gsc_saved_client_email();
		?>
		<details class="neo-pulse-wp-settings__advanced"<?php echo $has_account ? ' open' : ''; ?>>
		<summary><?php esc_html_e( 'Advanced: use your own service account key', 'neo-pulse-wp' ); ?></summary>
		<p class="description"><?php esc_html_e( 'Only needed if this site should read Search Console with its own Google Cloud service account instead of Neo Digital\'s. A key saved here takes priority.', 'neo-pulse-wp' ); ?></p>
		<div class="neo-pulse-wp-panel-info-box" role="status">
			<p>
				<?php
				if ( 'legacy_file' === $source ) {
					esc_html_e( 'Using the old key file in the plugin folder — paste the key here and delete that file.', 'neo-pulse-wp' );
				} elseif ( $saved_email !== '' ) {
					echo esc_html(
						sprintf(
							/* translators: %s: service account client_email */
							__( 'A key is saved (client_email: %s).', 'neo-pulse-wp' ),
							$saved_email
						)
					);
				} elseif ( $has_account && ( 'constant' === $source || 'file' === $source ) ) {
					esc_html_e( 'A key is set in wp-config.php, so nothing needs to be saved here.', 'neo-pulse-wp' );
				} elseif ( $has_account ) {
					esc_html_e( 'A key is in use, but none is saved here yet.', 'neo-pulse-wp' );
				} else {
					esc_html_e( 'No service account key is saved yet.', 'neo-pulse-wp' );
				}
				?>
			</p>
		</div>

		<form id="<?php echo esc_attr( $form_id ); ?>" method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>" class="neo-pulse-wp-settings__form neo-pulse-schema-form neo-pulse-wp-settings__form--gsc" autocomplete="off">
			<input type="hidden" name="action" value="<?php echo esc_attr( self::ACTION_SAVE_GSC ); ?>" />
			<?php wp_nonce_field( self::ACTION_SAVE_GSC, 'neo_pulse_wp_gsc_nonce' ); ?>
			<?php
			self::panel_form_group_open();
			self::panel_form_field_textarea(
				'neo-pulse-wp-gsc-service-account-json',
				'gsc_service_account_json',
				__( 'Service account JSON', 'neo-pulse-wp' ),
				'',
				'full',
				8,
				$saved_email !== ''
					? __( 'Leave blank to keep the saved key, or paste a new JSON key file to replace it. The saved key is never shown here.', 'neo-pulse-wp' )
					: __( 'Paste the whole JSON key file of the Google Cloud service account that has access to this site in Search Console.', 'neo-pulse-wp' )
			);
			if ( $saved_email !== '' ) {
				self::panel_form_toggle(
					'gsc_remove_key',
					__( 'Remove saved key', 'neo-pulse-wp' ),
					false,
					__( 'Deletes the key saved on this site when you save. A key set in wp-config.php is not affected.', 'neo-pulse-wp' ),
					'1',
					'neo-pulse-wp-gsc-remove-key'
				);
			}
			self::panel_form_group_close();
			?>
		</form>

		<div class="neo-pulse-wp-panel-footer">
			<p class="neo-pulse-wp-settings__actions neo-pulse-wp-panel-footer__right">
				<button type="submit" form="<?php echo esc_attr( $form_id ); ?>" class="button button-primary neo-pulse-wp-settings__btn"><?php esc_html_e( 'Save Search Console key', 'neo-pulse-wp' ); ?></button>
			</p>
		</div>
		</details>
		<?php
	}

	private static function render_settings_section_dataforseo(
		bool $dfs_configured,
		string $dfs_source,
		bool $has_site_dfs,
		string $site_dfs_login
	): void {
		$form_id = 'neo-pulse-wp-settings-dataforseo-form';
		?>
		<h2 class="neo-pulse-wp-panel-content__title"><?php esc_html_e( 'SEO research (DataForSEO)', 'neo-pulse-wp' ); ?></h2>
		<p class="neo-pulse-wp-panel-content__desc">
			<?php esc_html_e( 'Required for editor SEO research briefs. Use your DataForSEO account login and API password (from app.dataforseo.com → API Access).', 'neo-pulse-wp' ); ?>
		</p>

		<div class="neo-pulse-wp-panel-info-box" role="status">
			<p>
				<?php
				if ( $dfs_configured ) {
					if ( 'wp-config' === $dfs_source ) {
						esc_html_e( 'Status: configured (wp-config.php).', 'neo-pulse-wp' );
					} elseif ( 'site' === $dfs_source ) {
						esc_html_e( 'Status: configured (saved on this site).', 'neo-pulse-wp' );
					} else {
						esc_html_e( 'Status: configured.', 'neo-pulse-wp' );
					}
				} else {
					esc_html_e( 'Status: not configured yet.', 'neo-pulse-wp' );
				}
				?>
			</p>
		</div>

		<?php if ( current_user_can( 'manage_options' ) ) : ?>
			<form id="<?php echo esc_attr( $form_id ); ?>" method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>" class="neo-pulse-wp-settings__form neo-pulse-schema-form neo-pulse-wp-settings__form--dataforseo" autocomplete="off">
				<input type="hidden" name="action" value="<?php echo esc_attr( self::ACTION_SAVE_DATAFORSEO ); ?>" />
				<?php wp_nonce_field( self::ACTION_SAVE_DATAFORSEO, 'neo_pulse_wp_dataforseo_nonce' ); ?>
				<?php
				self::panel_form_group_open();
				self::panel_form_field_input(
					'neo-pulse-wp-dataforseo-login',
					'neo-pulse_dataforseo_login',
					__( 'DataForSEO login', 'neo-pulse-wp' ),
					$site_dfs_login,
					'half',
					'text',
					false,
					'',
					' placeholder="' . esc_attr__( 'your@email.com', 'neo-pulse-wp' ) . '" autocomplete="off"'
				);
				self::panel_form_field_input(
					'neo-pulse-wp-dataforseo-password',
					'neo-pulse_dataforseo_password',
					__( 'DataForSEO API password', 'neo-pulse-wp' ),
					'',
					'half',
					'password',
					false,
					__( 'Leave password blank to keep the current value. Clear both fields and save to remove stored credentials.', 'neo-pulse-wp' ),
					' placeholder="' . esc_attr( $has_site_dfs ? '••••••••••••••••' : __( 'API password from DataForSEO dashboard', 'neo-pulse-wp' ) ) . '" autocomplete="new-password"'
				);
				self::panel_form_group_close();
				?>
			</form>
		<?php else : ?>
			<p class="description"><?php esc_html_e( 'Ask a site administrator to add DataForSEO credentials here.', 'neo-pulse-wp' ); ?></p>
		<?php endif; ?>

		<?php if ( current_user_can( 'manage_options' ) ) : ?>
			<div class="neo-pulse-wp-panel-footer">
				<p class="neo-pulse-wp-settings__actions neo-pulse-wp-panel-footer__right">
					<button type="submit" form="<?php echo esc_attr( $form_id ); ?>" class="button button-primary neo-pulse-wp-settings__btn">
						<?php esc_html_e( 'Save DataForSEO credentials', 'neo-pulse-wp' ); ?>
					</button>
				</p>
			</div>
		<?php endif; ?>
		<?php
	}

	private static function render_settings_section_gmb(): void {
		$configured   = Neo_Pulse_Wp_Gmb::is_configured();
		$connected    = Neo_Pulse_Wp_Gmb::is_connected();
		$location_id  = Neo_Pulse_Wp_Gmb::get_location_id();
		$redirect_uri = Neo_Pulse_Wp_Gmb::get_redirect_uri();
		$form_id      = 'neo-pulse-wp-settings-gmb-form';

		$notice = isset( $_GET['neo-pulse_gmb_notice'] ) ? sanitize_text_field( wp_unslash( $_GET['neo-pulse_gmb_notice'] ) ) : ''; // phpcs:ignore WordPress.Security.NonceVerification
		$notice_type = '';
		$notice_msg  = '';
		if ( $notice !== '' && strpos( $notice, '|' ) !== false ) {
			list( $notice_type, $notice_msg ) = explode( '|', $notice, 2 );
		}
		?>
		<h2 class="neo-pulse-wp-panel-content__title"><?php esc_html_e( 'Google Business Profile (GMB)', 'neo-pulse-wp' ); ?></h2>
		<p class="neo-pulse-wp-panel-content__desc">
			<?php esc_html_e( 'Connect your Google Business Profile to publish social posts directly from the editor sidebar. Enter your OAuth credentials from Google Cloud, set your GBP Location ID, then click Connect.', 'neo-pulse-wp' ); ?>
		</p>

		<?php if ( $notice_msg !== '' ) : ?>
			<div class="neo-pulse-wp-panel-info-box<?php echo $notice_type === 'error' ? ' neo-pulse-wp-panel-info-box--error' : ''; ?>" role="alert">
				<p><?php echo esc_html( $notice_msg ); ?></p>
			</div>
		<?php endif; ?>

		<div class="neo-pulse-wp-panel-info-box" role="status">
			<p>
				<?php
				if ( $connected ) {
					esc_html_e( 'Status: connected to Google Business Profile.', 'neo-pulse-wp' );
				} elseif ( $configured ) {
					esc_html_e( 'Status: credentials saved but not connected. Click Connect below.', 'neo-pulse-wp' );
				} else {
					esc_html_e( 'Status: not configured yet. Enter your Client ID and Secret below.', 'neo-pulse-wp' );
				}
				?>
			</p>
		</div>

		<?php if ( current_user_can( 'manage_options' ) ) : ?>
			<form id="<?php echo esc_attr( $form_id ); ?>" method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>" class="neo-pulse-wp-settings__form neo-pulse-schema-form" autocomplete="off">
				<input type="hidden" name="action" value="neo_pulse_wp_save_gmb" />
				<?php wp_nonce_field( 'neo_pulse_wp_save_gmb', 'neo_pulse_wp_gmb_nonce' ); ?>
				<?php
				self::panel_form_group_open();
				self::panel_form_field_input(
					'neo-pulse-wp-gmb-client-id',
					'neo-pulse_gmb_client_id',
					__( 'OAuth Client ID', 'neo-pulse-wp' ),
					Neo_Pulse_Wp_Gmb::get_client_id(),
					'full',
					'text',
					false,
					'',
					' placeholder="' . esc_attr__( 'xxxxx.apps.googleusercontent.com', 'neo-pulse-wp' ) . '" autocomplete="off"'
				);
				self::panel_form_field_input(
					'neo-pulse-wp-gmb-client-secret',
					'neo-pulse_gmb_client_secret',
					__( 'OAuth Client Secret', 'neo-pulse-wp' ),
					'',
					'full',
					'password',
					false,
					__( 'Leave blank to keep the current secret.', 'neo-pulse-wp' ),
					' placeholder="' . esc_attr( $configured ? '••••••••••••••••' : 'GOCSPX-...' ) . '" autocomplete="new-password"'
				);
				self::panel_form_field_input(
					'neo-pulse-wp-gmb-location-id',
					'neo-pulse_gmb_location_id',
					__( 'GBP Location ID', 'neo-pulse-wp' ),
					$location_id,
					'full',
					'text',
					false,
					__( 'Find this in your Google Business Profile URL or via the Advanced settings → Copy ID.', 'neo-pulse-wp' ),
					' placeholder="' . esc_attr__( 'Numeric location ID or full locations/123 path', 'neo-pulse-wp' ) . '" autocomplete="off"'
				);
				self::panel_form_group_close();
				?>
			</form>

			<?php if ( $redirect_uri ) : ?>
				<div class="neo-pulse-wp-panel-info-box">
					<p><strong><?php esc_html_e( 'Redirect URI (add this in Google Cloud → OAuth client → Authorized redirect URIs)', 'neo-pulse-wp' ); ?></strong></p>
					<p><code><?php echo esc_html( $redirect_uri ); ?></code></p>
				</div>
			<?php endif; ?>
		<?php else : ?>
			<p class="description"><?php esc_html_e( 'Ask a site administrator to configure GMB credentials.', 'neo-pulse-wp' ); ?></p>
		<?php endif; ?>

		<?php if ( current_user_can( 'manage_options' ) ) : ?>
			<div class="neo-pulse-wp-panel-footer">
				<div class="neo-pulse-wp-panel-footer__left">
					<?php if ( $configured ) : ?>
						<a href="<?php echo esc_url( Neo_Pulse_Wp_Gmb::get_authorize_url() ); ?>" class="button button-secondary">
							<?php echo $connected ? esc_html__( 'Re-connect Google Business', 'neo-pulse-wp' ) : esc_html__( 'Connect Google Business', 'neo-pulse-wp' ); ?>
						</a>
					<?php endif; ?>
				</div>
				<p class="neo-pulse-wp-settings__actions neo-pulse-wp-panel-footer__right">
					<button type="submit" form="<?php echo esc_attr( $form_id ); ?>" class="button button-primary neo-pulse-wp-settings__btn">
						<?php esc_html_e( 'Save GMB credentials', 'neo-pulse-wp' ); ?>
					</button>
				</p>
			</div>
		<?php endif; ?>
		<?php
	}
}
