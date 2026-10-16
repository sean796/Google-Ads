<?php
/**
 * Chat panel: tabbed admin UI for Flow Assist chat widget settings, training, and demo.
 *
 * @package Neo_Pulse_Wp
 */

defined( 'ABSPATH' ) || exit;

trait Neo_Pulse_Wp_Admin_Trait_Render_Chat {

	public static function render_chat_page(): void {
		if ( ! current_user_can( 'manage_options' ) ) {
			return;
		}

		$chat_settings = Neo_Pulse_Wp_Chat::get_settings();
		$openrouter_ok = Neo_Pulse_Wp_OpenRouter::get_api_key() !== '';

		$tab = self::panel_active_tab( 'general' );
		if ( ! in_array( $tab, array( 'general', 'training', 'knowledge-base', 'demo' ), true ) ) {
			$tab = 'general';
		}

		self::neo_pulse_group_shell_open( 'neo-pulse-wp-chat', 'neo-pulse-wp-chat neo-pulse-wp-panel-page' );

		// The section tabs across the top already list these tabs, so no in-page nav is passed.
		self::panel_layout_start( 'neo-pulse-wp-chat', array(), $tab, __( 'Chat sections', 'neo-pulse-wp' ) );
		switch ( $tab ) {
			case 'training':
				self::render_chat_section_training( $chat_settings );
				break;
			case 'knowledge-base':
				self::render_chat_section_knowledge_base( $chat_settings );
				break;
			case 'demo':
				self::render_chat_section_demo( $openrouter_ok );
				break;
			default:
				self::render_chat_section_general( $chat_settings, $openrouter_ok );
				break;
		}
		self::panel_layout_end();

		self::neo_pulse_group_shell_close();
	}

	// ── General tab ─────────────────────────────────────────────

	private static function render_chat_section_general( array $chat_settings, bool $openrouter_ok ): void {
		$form_id = 'neo-pulse-wp-chat-general-form';
		$chekkit_configured = class_exists( 'Neo_Pulse_Wp_Chekkit' ) && Neo_Pulse_Wp_Chekkit::is_configured();
		$chekkit_enabled        = ! isset( $chat_settings['chekkit_enabled'] ) || ! empty( $chat_settings['chekkit_enabled'] );
		$chekkit_teaser_enabled = ! isset( $chat_settings['chekkit_teaser_enabled'] ) || ! empty( $chat_settings['chekkit_teaser_enabled'] );
		$chekkit_cta_label  = isset( $chat_settings['chekkit_cta_label'] ) ? (string) $chat_settings['chekkit_cta_label'] : __( 'Send Us A Text', 'neo-pulse-wp' );
		$chekkit_event_type = isset( $chat_settings['chekkit_event_type'] ) ? (string) $chat_settings['chekkit_event_type'] : 'contact_request';
		$chekkit_webhook_url = isset( $chat_settings['chekkit_webhook_url'] ) && trim( (string) $chat_settings['chekkit_webhook_url'] ) !== ''
			? (string) $chat_settings['chekkit_webhook_url']
			: Neo_Pulse_Wp_Chekkit::DEFAULT_WEBHOOK_URL;
		?>
		<h2 class="neo-pulse-wp-panel-content__title"><?php esc_html_e( 'General', 'neo-pulse-wp' ); ?></h2>
		<p class="neo-pulse-wp-panel-content__desc">
			<?php esc_html_e( 'Turn chat on, decide who sees it and set up voice and Talk To A Human. How the chat looks is set on the NEO Pulse Chat widget in Elementor: place it in your footer template to show the bubble on every page.', 'neo-pulse-wp' ); ?>
		</p>

		<div class="neo-pulse-wp-panel-info-box" role="status">
			<p>
				<?php
				if ( Neo_Pulse_Wp_License::ai_needs_upgrade( false ) ) {
					esc_html_e( 'Status: AI chat is part of NEO Pulse Pro + AI, so it is off on this site. Your chat settings, training and conversations are kept for when the site moves up to Pro + AI.', 'neo-pulse-wp' );
				} elseif ( Neo_Pulse_Wp_Chat::is_off_everywhere() ) {
					esc_html_e( 'Status: AI chat is turned off everywhere. Nobody sees it, administrators included: not on the front end, not in the WordPress admin, not in the search panel.', 'neo-pulse-wp' );
					if ( defined( 'NEO_PULSE_WP_CHAT_OFF' ) && NEO_PULSE_WP_CHAT_OFF ) {
						echo ' ';
						esc_html_e( '(Forced by NEO_PULSE_WP_CHAT_OFF in wp-config.php.)', 'neo-pulse-wp' );
					}
				} elseif ( ! empty( $chat_settings['enabled'] ) ) {
					if ( $openrouter_ok ) {
						esc_html_e( 'Status: enabled and active on the frontend.', 'neo-pulse-wp' );
					} else {
						esc_html_e( 'Status: enabled but OpenRouter key is missing. Chat will not respond until a key is configured.', 'neo-pulse-wp' );
					}
				} else {
					if ( empty( $chat_settings['disable_backend'] ) ) {
						esc_html_e( 'Status: off on the front end, but administrators still see it in the WordPress admin. To hide it there too, turn on "Turn AI chat off everywhere".', 'neo-pulse-wp' );
					} else {
						esc_html_e( 'Status: disabled. Enable below to show the chat widget on your site.', 'neo-pulse-wp' );
					}
				}
				?>
			</p>
		</div>

		<form id="<?php echo esc_attr( $form_id ); ?>" method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>" class="neo-pulse-wp-settings__form neo-pulse-schema-form" autocomplete="off">
			<input type="hidden" name="action" value="neo_pulse_wp_save_chat" />
			<?php wp_nonce_field( 'neo_pulse_wp_save_chat', 'neo_pulse_wp_chat_nonce' ); ?>

			<?php
			self::panel_form_group_open();
			self::panel_form_toggle(
				'neo_pulse_chat_off_everywhere',
				__( 'Turn AI chat off everywhere (front end, WordPress admin and search panel, for every user including administrators)', 'neo-pulse-wp' ),
				! empty( $chat_settings['off_everywhere'] )
			);
			self::panel_form_toggle(
				'neo_pulse_chat_enabled',
				__( 'Enable chat widget on the frontend', 'neo-pulse-wp' ),
				! empty( $chat_settings['enabled'] )
			);
			self::panel_form_toggle(
				'neo_pulse_chat_show_without_widget',
				__( 'Also show the bubble on pages without the NEO Pulse Chat widget (uses the previous site-wide styling)', 'neo-pulse-wp' ),
				! empty( $chat_settings['show_without_widget'] )
			);
			self::panel_form_toggle(
				'neo_pulse_chat_disable_backend',
				__( 'Disable chat widget on the WordPress admin', 'neo-pulse-wp' ),
				! empty( $chat_settings['disable_backend'] )
			);
			?>
			<p class="neo-pulse-field__note neo-pulse-schema-cell neo-pulse-schema-cell--full">
				<?php esc_html_e( 'The chat widget is also hidden automatically in page builders (Elementor, block editor, Divi, Beaver Builder, etc.) so it does not cover the canvas.', 'neo-pulse-wp' ); ?>
			</p>
			<?php
			self::panel_form_toggle(
				'neo_pulse_chat_logged_in_only',
				__( 'Show chat on the frontend for logged-in WordPress users only', 'neo-pulse-wp' ),
				! empty( $chat_settings['logged_in_only'] )
			);
			self::panel_form_toggle(
				'neo_pulse_chat_admin_only',
				__( 'Show chat on the frontend for WordPress administrators only', 'neo-pulse-wp' ),
				! empty( $chat_settings['admin_only'] )
			);
			self::panel_form_toggle(
				'neo_pulse_chat_god_mode_enabled',
				__( 'Enable God Mode for Neo Digital staff (@neodigital.ca)', 'neo-pulse-wp' ),
				! isset( $chat_settings['god_mode_enabled'] ) || ! empty( $chat_settings['god_mode_enabled'] )
			);
			self::panel_form_field_input(
				'neo-pulse-wp-chat-whitelist-url',
				'neo_pulse_chat_whitelist_url',
				__( 'Whitelist URL', 'neo-pulse-wp' ),
				isset( $chat_settings['whitelist_url'] ) ? (string) $chat_settings['whitelist_url'] : '',
				'full',
				'url',
				false,
				__( 'When set, the chat bubble only appears on this frontend URL, including after a page password. Leave blank to show on the whole site.', 'neo-pulse-wp' ),
				' placeholder="https://example.com/demo/"'
			);
			?>
			<div class="neo-pulse-schema-cell neo-pulse-schema-cell--full">
				<div class="neo-pulse-field neo-pulse-field--text neo-pulse-field--stacked">
					<label class="neo-pulse-field__label neo-pulse-field__label--above" for="neo-pulse-chat-shortcode"><?php esc_html_e( 'Shortcode', 'neo-pulse-wp' ); ?></label>
					<div class="neo-pulse-wp-search-shortcode-box">
						<div class="neo-pulse-field neo-pulse-field--text neo-pulse-field--stacked">
							<input
								id="neo-pulse-chat-shortcode"
								class="neo-pulse-field__control"
								type="text"
								value="[neo-pulse_chat]"
								readonly
								onclick="this.select();"
							/>
						</div>
						<button type="button" class="button" onclick="navigator.clipboard.writeText('[neo-pulse_chat]');this.textContent='Copied!';setTimeout(()=>{this.textContent='Copy'},1500);">
							<?php esc_html_e( 'Copy', 'neo-pulse-wp' ); ?>
						</button>
					</div>
					<p class="neo-pulse-field__note">
						<?php esc_html_e( 'Add this shortcode to any page or Elementor Shortcode widget to show the chat bubble on that page only.', 'neo-pulse-wp' ); ?>
					</p>
				</div>
			</div>
			<?php
			self::panel_form_field_input(
				'neo-pulse-wp-chat-welcome',
				'neo_pulse_chat_welcome_message',
				__( 'Welcome message', 'neo-pulse-wp' ),
				(string) $chat_settings['welcome_message'],
				'full',
				'text',
				false,
				__( 'Greeting shown when a visitor opens the chat panel.', 'neo-pulse-wp' ),
				' placeholder="' . esc_attr__( 'Hi! Ask me anything about this website.', 'neo-pulse-wp' ) . '"'
			);
			self::panel_form_group_close();

			self::render_chat_voice_fields( $chat_settings );

			self::panel_form_group_open();
			?>
			<h3 class="neo-pulse-chat-settings-section__title"><?php esc_html_e( 'Talk To A Human (Chekkit)', 'neo-pulse-wp' ); ?></h3>
			<?php
			self::panel_form_toggle(
				'neo_pulse_chat_chekkit_enabled',
				__( 'Enable Talk To A Human contact form in chat sidebar', 'neo-pulse-wp' ),
				$chekkit_enabled
			);
			self::panel_form_toggle(
				'neo_pulse_chat_chekkit_teaser_enabled',
				__( 'Show text-message teaser above launcher', 'neo-pulse-wp' ),
				$chekkit_teaser_enabled
			);
			self::panel_form_field_input(
				'neo-pulse-chat-chekkit-cta-label',
				'neo_pulse_chat_chekkit_cta_label',
				__( 'CTA label', 'neo-pulse-wp' ),
				$chekkit_cta_label,
				'half',
				'text',
				false,
				'',
				' placeholder="' . esc_attr__( 'Send Us A Text', 'neo-pulse-wp' ) . '"'
			);
			self::panel_form_field_input(
				'neo-pulse-chat-chekkit-event-type',
				'neo_pulse_chat_chekkit_event_type',
				__( 'Chekkit event type', 'neo-pulse-wp' ),
				$chekkit_event_type,
				'half',
				'text',
				false,
				'',
				' placeholder="contact_request"'
			);
			self::panel_form_field_input(
				'neo-pulse-chat-chekkit-webhook-url',
				'neo_pulse_chat_chekkit_webhook_url',
				__( 'Chekkit webhook URL', 'neo-pulse-wp' ),
				$chekkit_webhook_url,
				'full',
				'url',
				false,
				__( 'Contact form submissions POST here (NEO Pulse hub for all client sites).', 'neo-pulse-wp' ),
				' placeholder="' . esc_attr( Neo_Pulse_Wp_Chekkit::DEFAULT_WEBHOOK_URL ) . '"'
			);
			?>
			<p class="neo-pulse-field__note">
				<?php
				if ( $chekkit_configured ) {
					printf(
						/* translators: %s: webhook URL */
						esc_html__( 'Active webhook: %s', 'neo-pulse-wp' ),
						esc_html( Neo_Pulse_Wp_Chekkit::get_webhook_url() )
					);
				} else {
					esc_html_e( 'Chekkit webhook URL is missing.', 'neo-pulse-wp' );
				}
				?>
			</p>
			<?php
			self::panel_form_group_close();
			?>
		</form>

		<div class="neo-pulse-wp-panel-footer">
			<p class="neo-pulse-wp-settings__actions neo-pulse-wp-panel-footer__right">
				<button type="submit" form="<?php echo esc_attr( $form_id ); ?>" class="button button-primary neo-pulse-wp-settings__btn">
					<?php esc_html_e( 'Save Changes', 'neo-pulse-wp' ); ?>
				</button>
			</p>
		</div>
		<?php
	}

	/**
	 * Voice & mic toggles on the General tab (saved by handle_save_chat).
	 *
	 * @param array<string,mixed> $chat_settings
	 */
	private static function render_chat_voice_fields( array $chat_settings ): void {
		self::panel_form_group_open();
		?>
		<h3 class="neo-pulse-chat-settings-section__title"><?php esc_html_e( 'Voice & mic', 'neo-pulse-wp' ); ?></h3>
		<?php
		self::panel_form_toggle( 'neo_pulse_chat_voice_enabled', __( 'Enable voice chat', 'neo-pulse-wp' ), ! isset( $chat_settings['voice_enabled'] ) || ! empty( $chat_settings['voice_enabled'] ) );
		self::panel_form_toggle( 'neo_pulse_chat_voice_ptt', __( 'Hold to speak (push-to-talk)', 'neo-pulse-wp' ), ! isset( $chat_settings['voice_ptt'] ) || ! empty( $chat_settings['voice_ptt'] ) );
		self::panel_form_toggle( 'neo_pulse_chat_mic_replaces_send', __( 'Mic replaces send when input empty', 'neo-pulse-wp' ), ! isset( $chat_settings['mic_replaces_send'] ) || ! empty( $chat_settings['mic_replaces_send'] ) );
		self::panel_form_group_close();
	}

	// ── Training tab ────────────────────────────────────────────

	private static function render_chat_section_training( array $chat_settings ): void {
		$form_id = 'neo-pulse-wp-chat-training-form';

		$assistant_name    = isset( $chat_settings['assistant_name'] ) ? $chat_settings['assistant_name'] : 'Pulse Assist';
		$system_prompt     = isset( $chat_settings['system_prompt'] ) ? $chat_settings['system_prompt'] : '';
		$greeting_style    = isset( $chat_settings['greeting_style'] ) ? $chat_settings['greeting_style'] : 'friendly';
		$indexed_types     = isset( $chat_settings['indexed_post_types'] ) && is_array( $chat_settings['indexed_post_types'] ) ? $chat_settings['indexed_post_types'] : array( 'post', 'page' );
		$excluded_cats     = isset( $chat_settings['excluded_categories'] ) && is_array( $chat_settings['excluded_categories'] ) ? $chat_settings['excluded_categories'] : array();
		$full_content      = ! empty( $chat_settings['full_content'] );
		$lead_conversion   = ! isset( $chat_settings['lead_conversion_enabled'] ) || ! empty( $chat_settings['lead_conversion_enabled'] );

		$all_post_types = get_post_types( array( 'public' => true ), 'objects' );
		$all_categories = get_categories( array( 'hide_empty' => false ) );
		?>
		<h2 class="neo-pulse-wp-panel-content__title"><?php esc_html_e( 'Training', 'neo-pulse-wp' ); ?></h2>
		<p class="neo-pulse-wp-panel-content__desc">
			<?php esc_html_e( 'Customize how Flow Assist thinks, what it knows, and which content it draws from.', 'neo-pulse-wp' ); ?>
		</p>

		<form id="<?php echo esc_attr( $form_id ); ?>" method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>" class="neo-pulse-wp-settings__form neo-pulse-schema-form" autocomplete="off">
			<input type="hidden" name="action" value="neo_pulse_wp_save_chat_training" />
			<?php wp_nonce_field( 'neo_pulse_wp_save_chat_training', 'neo_pulse_wp_chat_training_nonce' ); ?>

			<?php // ── Custom Instructions ── ?>
			<section class="neo-pulse-schema-group neo-pulse-chat-settings-section" aria-labelledby="neo-pulse-chat-instructions-heading">
				<h3 id="neo-pulse-chat-instructions-heading" class="neo-pulse-chat-settings-section__title">
					<?php esc_html_e( 'Custom Instructions', 'neo-pulse-wp' ); ?>
				</h3>
				<div class="neo-pulse-schema-grid">
					<?php
					self::panel_form_field_input(
						'neo-pulse-chat-assistant-name',
						'neo_pulse_chat_assistant_name',
						__( 'Assistant name', 'neo-pulse-wp' ),
						$assistant_name,
						'full',
						'text',
						false,
						__( 'The name the AI answers as, and the default chat header name. A Chat widget can show a different header name.', 'neo-pulse-wp' ),
						' placeholder="Pulse Assist"'
					);
					self::panel_form_field_textarea(
						'neo-pulse-chat-system-prompt',
						'neo_pulse_chat_system_prompt',
						__( 'System instructions', 'neo-pulse-wp' ),
						$system_prompt,
						'full',
						6,
						__( 'These instructions shape personality and tone. Leave blank for the default. Do not use this field to limit the assistant to one product category; it answers from this site\'s published content.', 'neo-pulse-wp' )
					);
					self::panel_form_field_select(
						'neo-pulse-chat-greeting-style',
						'neo_pulse_chat_greeting_style',
						__( 'Greeting style', 'neo-pulse-wp' ),
						array(
							'professional' => __( 'Professional', 'neo-pulse-wp' ),
							'friendly'     => __( 'Friendly', 'neo-pulse-wp' ),
							'casual'       => __( 'Casual', 'neo-pulse-wp' ),
						),
						$greeting_style,
						'half',
						__( 'Sets the overall tone of responses.', 'neo-pulse-wp' )
					);
					?>
				</div>
				<p class="neo-pulse-field__note">
					<?php
					printf(
						wp_kses(
							/* translators: %s: link to Knowledge Base tab */
							__( 'Manage custom Q&amp;A pairs on the %s tab.', 'neo-pulse-wp' ),
							array( 'a' => array( 'href' => array() ) )
						),
						'<a href="' . esc_url( admin_url( 'admin.php?page=neo-pulse-wp-chat&tab=knowledge-base' ) ) . '">' . esc_html__( 'Knowledge Base', 'neo-pulse-wp' ) . '</a>'
					);
					?>
				</p>
			</section>

			<?php // ── Lead conversion ── ?>
			<section class="neo-pulse-schema-group neo-pulse-chat-settings-section" aria-labelledby="neo-pulse-chat-lead-heading">
				<h3 id="neo-pulse-chat-lead-heading" class="neo-pulse-chat-settings-section__title">
					<?php esc_html_e( 'Lead conversion', 'neo-pulse-wp' ); ?>
				</h3>
				<div class="neo-pulse-schema-grid">
					<div class="neo-pulse-schema-cell neo-pulse-schema-cell--full">
						<label class="neo-pulse-wp-panel-toggle">
							<input type="checkbox" name="neo_pulse_chat_lead_conversion_enabled" value="1" <?php checked( $lead_conversion ); ?> />
							<span class="neo-pulse-wp-panel-toggle__label"><?php esc_html_e( 'Enable lead conversion specialist', 'neo-pulse-wp' ); ?></span>
						</label>
					</div>
				</div>
			</section>

			<?php // ── Content Sources ── ?>
			<section class="neo-pulse-schema-group neo-pulse-chat-settings-section" aria-labelledby="neo-pulse-chat-sources-heading">
				<h3 id="neo-pulse-chat-sources-heading" class="neo-pulse-chat-settings-section__title">
					<?php esc_html_e( 'Content Sources', 'neo-pulse-wp' ); ?>
				</h3>
				<p class="neo-pulse-field__note neo-pulse-chat-settings-section__intro">
					<?php esc_html_e( 'Chat indexes the intersection of checked post types here and post types enabled in the NEO Pulse sitemap (Include in XML). Unchecking a type removes it from chat even if it stays in the sitemap for SEO. Save to refresh the index cache.', 'neo-pulse-wp' ); ?>
				</p>

				<div class="neo-pulse-schema-grid">
					<div class="neo-pulse-schema-cell neo-pulse-schema-cell--full">
						<fieldset class="neo-pulse-field neo-pulse-field--stacked neo-pulse-chat-fieldset">
							<legend class="neo-pulse-field__label neo-pulse-field__label--above"><?php esc_html_e( 'Post types to index', 'neo-pulse-wp' ); ?></legend>
							<?php foreach ( $all_post_types as $pt ) : ?>
								<?php if ( $pt->name === 'attachment' ) continue; ?>
								<label class="neo-pulse-wp-panel-toggle neo-pulse-chat-index-toggle">
									<input
										type="checkbox"
										name="neo_pulse_chat_indexed_types[]"
										value="<?php echo esc_attr( $pt->name ); ?>"
										<?php checked( in_array( $pt->name, $indexed_types, true ) ); ?>
									/>
									<span class="neo-pulse-wp-panel-toggle__label">
										<?php echo esc_html( $pt->labels->singular_name ); ?>
										<code class="neo-pulse-chat-training-cpt-code">(<?php echo esc_html( $pt->name ); ?>)</code>
									</span>
								</label>
							<?php endforeach; ?>
						</fieldset>
					</div>

					<?php if ( ! empty( $all_categories ) ) : ?>
					<div class="neo-pulse-schema-cell neo-pulse-schema-cell--full">
						<div class="neo-pulse-field neo-pulse-field--select neo-pulse-field--stacked">
							<label class="neo-pulse-field__label neo-pulse-field__label--above"><?php esc_html_e( 'Exclude categories', 'neo-pulse-wp' ); ?></label>
							<select name="neo_pulse_chat_excluded_cats[]" multiple class="neo-pulse-field__control neo-pulse-field__control--multiselect">
								<?php foreach ( $all_categories as $cat ) : ?>
									<option value="<?php echo (int) $cat->term_id; ?>" <?php echo in_array( $cat->term_id, $excluded_cats, false ) ? 'selected' : ''; ?>>
										<?php echo esc_html( $cat->name ); ?>
									</option>
								<?php endforeach; ?>
							</select>
							<p class="neo-pulse-field__note"><?php esc_html_e( 'Hold Ctrl/Cmd to select multiple. Posts in these categories will be excluded from the index.', 'neo-pulse-wp' ); ?></p>
						</div>
					</div>
					<?php endif; ?>

					<div class="neo-pulse-schema-cell neo-pulse-schema-cell--full">
						<label class="neo-pulse-wp-panel-toggle">
							<input type="checkbox" name="neo_pulse_chat_full_content" value="1" <?php checked( $full_content ); ?> />
							<span class="neo-pulse-wp-panel-toggle__label"><?php esc_html_e( 'Include extended content (120 words instead of 40)', 'neo-pulse-wp' ); ?></span>
						</label>
						<p class="neo-pulse-field__note"><?php esc_html_e( 'Gives the assistant more context per page but uses more tokens per request.', 'neo-pulse-wp' ); ?></p>
					</div>
				</div>
			</section>
		</form>

		<div class="neo-pulse-wp-panel-footer">
			<p class="neo-pulse-wp-settings__actions neo-pulse-wp-panel-footer__right">
				<button type="submit" form="<?php echo esc_attr( $form_id ); ?>" class="button button-primary neo-pulse-wp-settings__btn">
					<?php esc_html_e( 'Save Changes', 'neo-pulse-wp' ); ?>
				</button>
			</p>
		</div>
		<?php
	}

	// ── Knowledge Base tab ──────────────────────────────────────

	private static function render_chat_section_knowledge_base( array $chat_settings ): void {
		$form_id        = 'neo-pulse-wp-chat-kb-form';
		$knowledge_base = isset( $chat_settings['knowledge_base'] ) && is_array( $chat_settings['knowledge_base'] ) ? $chat_settings['knowledge_base'] : array();
		$entry_count    = 0;

		foreach ( $knowledge_base as $entry ) {
			$q = isset( $entry['question'] ) ? trim( (string) $entry['question'] ) : '';
			$a = isset( $entry['answer'] ) ? trim( (string) $entry['answer'] ) : '';
			if ( $q !== '' || $a !== '' ) {
				++$entry_count;
			}
		}

		if ( empty( $knowledge_base ) ) {
			$knowledge_base = array( array( 'question' => '', 'answer' => '', 'priority' => 'normal' ) );
		}
		?>
		<h2 class="neo-pulse-wp-panel-content__title"><?php esc_html_e( 'Knowledge Base', 'neo-pulse-wp' ); ?></h2>
		<p class="neo-pulse-wp-panel-content__desc">
			<?php
			echo esc_html(
				sprintf(
					/* translators: %d: number of saved Q&A pairs */
					_n(
						'%d Q&A pair saved. Add custom pairs prioritized over site content when answering matching questions.',
						'%d Q&A pairs saved. Add custom pairs prioritized over site content when answering matching questions.',
						$entry_count,
						'neo-pulse-wp'
					),
					$entry_count
				)
			);
			?>
		</p>

		<form id="<?php echo esc_attr( $form_id ); ?>" method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>" class="neo-pulse-wp-settings__form neo-pulse-chat-kb-form" autocomplete="off">
			<input type="hidden" name="action" value="neo_pulse_wp_save_chat_knowledge_base" />
			<?php wp_nonce_field( 'neo_pulse_wp_save_chat_knowledge_base', 'neo_pulse_wp_chat_kb_nonce' ); ?>

			<div class="neo-pulse-chat-kb-table-wrap">
				<table class="widefat striped neo-pulse-chat-kb-table">
					<thead>
						<tr>
							<th scope="col" class="neo-pulse-chat-kb-table__col-question"><?php esc_html_e( 'Question / Topic', 'neo-pulse-wp' ); ?></th>
							<th scope="col" class="neo-pulse-chat-kb-table__col-answer"><?php esc_html_e( 'Answer', 'neo-pulse-wp' ); ?></th>
							<th scope="col" class="neo-pulse-chat-kb-table__col-priority"><?php esc_html_e( 'Priority', 'neo-pulse-wp' ); ?></th>
							<th scope="col" class="neo-pulse-chat-kb-table__col-actions"><span class="screen-reader-text"><?php esc_html_e( 'Actions', 'neo-pulse-wp' ); ?></span></th>
						</tr>
					</thead>
					<tbody id="neo-pulse-chat-kb-entries">
						<?php foreach ( $knowledge_base as $i => $entry ) : ?>
							<?php self::render_chat_kb_table_row( (int) $i, $entry ); ?>
						<?php endforeach; ?>
					</tbody>
				</table>
			</div>

			<p class="neo-pulse-chat-kb-add-wrap">
				<button type="button" id="neo-pulse-chat-kb-add" class="button button-secondary neo-pulse-chat-kb-add">
					+ <?php esc_html_e( 'Add Row', 'neo-pulse-wp' ); ?>
				</button>
			</p>
		</form>

		<div class="neo-pulse-wp-panel-footer">
			<p class="neo-pulse-wp-settings__actions neo-pulse-wp-panel-footer__right">
				<button type="submit" form="<?php echo esc_attr( $form_id ); ?>" class="button button-primary neo-pulse-wp-settings__btn">
					<?php esc_html_e( 'Save Changes', 'neo-pulse-wp' ); ?>
				</button>
			</p>
		</div>

		<script>
		(function(){
			var container = document.getElementById('neo-pulse-chat-kb-entries');
			var addBtn    = document.getElementById('neo-pulse-chat-kb-add');
			if (!container || !addBtn) return;

			function rowHtml(idx) {
				return '<tr class="neo-pulse-chat-kb-row" data-index="'+idx+'">'
					+ '<td class="neo-pulse-chat-kb-table__col-question"><input type="text" name="neo_pulse_chat_kb['+idx+'][question]" class="neo-pulse-field__control" placeholder="What are your business hours?"></td>'
					+ '<td class="neo-pulse-chat-kb-table__col-answer"><textarea name="neo_pulse_chat_kb['+idx+'][answer]" class="neo-pulse-field__control" rows="2" placeholder="We are open Monday-Friday, 9am-5pm MST."></textarea></td>'
					+ '<td class="neo-pulse-chat-kb-table__col-priority"><select name="neo_pulse_chat_kb['+idx+'][priority]" class="neo-pulse-field__control"><option value="high">High</option><option value="normal" selected>Normal</option></select></td>'
					+ '<td class="neo-pulse-chat-kb-table__col-actions"><button type="button" class="button neo-pulse-chat-kb-remove" title="Remove">&times; Remove</button></td>'
					+ '</tr>';
			}

			addBtn.addEventListener('click', function(){
				var rows = container.querySelectorAll('.neo-pulse-chat-kb-row');
				var idx  = rows.length;
				container.insertAdjacentHTML('beforeend', rowHtml(idx));
			});

			container.addEventListener('click', function(e){
				if (e.target.classList.contains('neo-pulse-chat-kb-remove') || e.target.closest('.neo-pulse-chat-kb-remove')) {
					var row = e.target.closest('.neo-pulse-chat-kb-row');
					if (row && container.querySelectorAll('.neo-pulse-chat-kb-row').length > 1) {
						row.remove();
					}
				}
			});
		})();
		</script>
		<?php
	}

	/**
	 * @param array<string, mixed> $entry
	 */
	private static function render_chat_kb_table_row( int $index, array $entry ): void {
		$q = isset( $entry['question'] ) ? $entry['question'] : '';
		$a = isset( $entry['answer'] ) ? $entry['answer'] : '';
		$p = isset( $entry['priority'] ) ? $entry['priority'] : 'normal';
		?>
		<tr class="neo-pulse-chat-kb-row" data-index="<?php echo (int) $index; ?>">
			<td class="neo-pulse-chat-kb-table__col-question">
				<input
					type="text"
					name="neo_pulse_chat_kb[<?php echo (int) $index; ?>][question]"
					class="neo-pulse-field__control"
					value="<?php echo esc_attr( $q ); ?>"
					placeholder="<?php esc_attr_e( 'What are your business hours?', 'neo-pulse-wp' ); ?>"
				/>
			</td>
			<td class="neo-pulse-chat-kb-table__col-answer">
				<textarea
					name="neo_pulse_chat_kb[<?php echo (int) $index; ?>][answer]"
					class="neo-pulse-field__control"
					rows="2"
					placeholder="<?php esc_attr_e( 'We are open Monday-Friday, 9am-5pm MST.', 'neo-pulse-wp' ); ?>"
				><?php echo esc_textarea( $a ); ?></textarea>
			</td>
			<td class="neo-pulse-chat-kb-table__col-priority">
				<select name="neo_pulse_chat_kb[<?php echo (int) $index; ?>][priority]" class="neo-pulse-field__control">
					<option value="high" <?php selected( $p, 'high' ); ?>><?php esc_html_e( 'High', 'neo-pulse-wp' ); ?></option>
					<option value="normal" <?php selected( $p, 'normal' ); ?>><?php esc_html_e( 'Normal', 'neo-pulse-wp' ); ?></option>
				</select>
			</td>
			<td class="neo-pulse-chat-kb-table__col-actions">
				<button type="button" class="button neo-pulse-chat-kb-remove" title="<?php esc_attr_e( 'Remove', 'neo-pulse-wp' ); ?>">&times; <?php esc_html_e( 'Remove', 'neo-pulse-wp' ); ?></button>
			</td>
		</tr>
		<?php
	}

	// ── Demo tab ────────────────────────────────────────────────

	private static function render_chat_section_demo( bool $openrouter_ok ): void {
		$chat_settings = Neo_Pulse_Wp_Chat::get_settings();
		$design        = Neo_Pulse_Wp_Ai_Widget_Design::get_settings();
		$chat_ui       = isset( $design['chat_ui'] ) && is_array( $design['chat_ui'] ) ? $design['chat_ui'] : array();
		$user          = wp_get_current_user();
		$display_name  = $user->exists() ? $user->display_name : __( 'there', 'neo-pulse-wp' );
		$site_name     = get_bloginfo( 'name' );
		$starters      = Neo_Pulse_Wp_Chat::conversation_starters( $chat_settings );
		$demo_classes  = array( 'neo-pulse-chat-widget', 'fcw-demo-inline' );
		$hide_map      = array(
			'type_badge'       => 'fcw-hide-type-badge',
			'source_pills'     => 'fcw-hide-source-pills',
			'confidence'       => 'fcw-hide-confidence',
			'cta_buttons'      => 'fcw-hide-cta-buttons',
			'suggestion_chips' => 'fcw-hide-suggestion-chips',
		);
		foreach ( $hide_map as $ui_key => $hide_class ) {
			if ( empty( $chat_ui[ $ui_key ] ) ) {
				$demo_classes[] = $hide_class;
			}
		}
		?>
		<h2 class="neo-pulse-wp-panel-content__title"><?php esc_html_e( 'Flow Assist Demo', 'neo-pulse-wp' ); ?></h2>
		<p class="neo-pulse-wp-panel-content__desc">
			<?php esc_html_e( 'Preview the same chat chrome visitors see on the frontend (greeting, starters, composer). Messages use the live RAG + sub-agent pipeline.', 'neo-pulse-wp' ); ?>
		</p>

		<?php if ( ! $openrouter_ok ) : ?>
			<div class="neo-pulse-wp-panel-info-box neo-pulse-wp-panel-info-box--error" role="alert">
				<p><?php esc_html_e( 'Demo unavailable: OpenRouter API key is not configured. Add it under Settings > Editor AI.', 'neo-pulse-wp' ); ?></p>
			</div>
		<?php endif; ?>

		<div class="fcw-demo-wrap">
			<div id="neo-pulse-chat-demo" class="<?php echo esc_attr( implode( ' ', $demo_classes ) ); ?>" aria-label="<?php esc_attr_e( 'Flow Assist sidebar preview', 'neo-pulse-wp' ); ?>">
				<div class="fai-sidebar-panel fcw-panel fcw-panel--sidebar fcw-demo-panel">
					<div class="fai-sidebar-panel__toolbar">
						<div class="fcw-demo-toolbar-actions">
							<button type="button" id="neo-pulse-chat-demo-clear" class="fcw-demo-toolbar-btn fcw-demo-clear-chat" aria-label="<?php esc_attr_e( 'Clear chat', 'neo-pulse-wp' ); ?>" <?php echo $openrouter_ok ? '' : 'disabled'; ?>>
								<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
							</button>
							<button type="button" id="neo-pulse-chat-demo-copy-log" class="fcw-demo-copy-log" <?php echo $openrouter_ok ? '' : 'disabled'; ?>>
								<?php esc_html_e( 'Copy log', 'neo-pulse-wp' ); ?>
							</button>
							<span class="fcw-demo-toolbar-btn" title="<?php esc_attr_e( 'Preview', 'neo-pulse-wp' ); ?>" aria-hidden="true">
								<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg>
							</span>
						</div>
					</div>
					<div class="fai-sidebar-panel__body">
						<div class="fcw-sidebar-main">
							<div id="neo-pulse-chat-demo-empty" class="fcw-demo-empty">
								<div>
									<p class="fcw-demo-greeting"><?php echo esc_html( sprintf( __( 'Hello, %s', 'neo-pulse-wp' ), $display_name ) ); ?></p>
									<p class="fcw-demo-sub"><?php esc_html_e( 'How can I help you today?', 'neo-pulse-wp' ); ?></p>
								</div>
								<div class="fcw-demo-starters">
									<?php foreach ( $starters as $starter ) : ?>
										<button type="button" class="fcw-demo-starter" data-prompt="<?php echo esc_attr( $starter ); ?>" <?php echo $openrouter_ok ? '' : 'disabled'; ?>>
											<?php echo esc_html( $starter ); ?>
										</button>
									<?php endforeach; ?>
								</div>
							</div>
							<div id="neo-pulse-chat-demo-messages" class="fcw-messages" hidden></div>
							<form class="fcw-input-row fcw-demo-composer">
								<div class="fcw-demo-composer-shell">
									<textarea
										id="neo-pulse-chat-demo-input"
										class="fcw-textarea"
										rows="1"
										placeholder="<?php echo esc_attr( sprintf( __( 'Ask about %s…', 'neo-pulse-wp' ), $site_name ) ); ?>"
										<?php echo $openrouter_ok ? '' : 'disabled'; ?>
									></textarea>
									<div class="fcw-demo-composer-actions">
										<button type="button" id="neo-pulse-chat-demo-send" class="fcw-send" aria-label="<?php esc_attr_e( 'Hold to speak', 'neo-pulse-wp' ); ?>" <?php echo $openrouter_ok ? '' : 'disabled'; ?>>
											<span class="fcw-send__icon fcw-send__icon--send" aria-hidden="true">
												<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3z"/><path d="M19 13l.75 2.25L22 16l-2.25.75L19 19l-.75-2.25L16 16l2.25-.75L19 13z"/></svg>
											</span>
										</button>
									</div>
								</div>
							</form>
						</div>
					</div>
				</div>
			</div>
		</div>
		<?php
	}
}
