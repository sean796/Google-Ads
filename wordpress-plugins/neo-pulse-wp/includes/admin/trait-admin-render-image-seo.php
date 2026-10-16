<?php
/**
 * Image SEO admin page.
 *
 * @package Neo_Pulse_Wp
 */

defined( 'ABSPATH' ) || exit;

trait Neo_Pulse_Wp_Admin_Trait_Render_Image_Seo {

	public static function render_image_seo_page(): void {
		require_once NEO_PULSE_WP_PLUGIN_DIR . 'includes/admin/class-neo-pulse-wp-image-seo-list-table.php';
		if ( ! current_user_can( 'upload_files' ) ) {
			wp_die( esc_html__( 'You do not have permission to manage Image SEO.', 'neo-pulse-wp' ) );
		}

		$tab    = self::panel_active_tab( 'library' );
		$config = Neo_Pulse_Wp_Image_Seo::get_config();
		$status = Neo_Pulse_Wp_Image_Seo_Gate::get_status();

		self::neo_pulse_group_shell_open( 'neo-pulse-wp-image-seo', 'neo-pulse-wp-image-seo', 'image-seo' );

		if ( 'settings' === $tab ) {
			self::render_image_seo_settings( $config, $status );
		} else {
			self::render_image_seo_library( $status );
		}

		self::neo_pulse_group_shell_close();
	}

	private static function render_image_seo_openrouter_notice( array $status ): void {
		if ( ! empty( $status['openRouterConfigured'] ) ) {
			return;
		}
		?>
		<div class="notice inline notice-warning">
			<p>
				<?php
				printf(
					wp_kses(
						/* translators: %s: settings link */
						__( 'OpenRouter is not configured. Filename-only optimization works; add a key under %s for AI optimization.', 'neo-pulse-wp' ),
						array( 'a' => array( 'href' => array() ) )
					),
					'<a href="' . esc_url( admin_url( 'admin.php?page=neo-pulse-wp-settings&tab=openrouter' ) ) . '">' . esc_html__( 'Settings → Editor AI', 'neo-pulse-wp' ) . '</a>'
				);
				?>
			</p>
		</div>
		<?php
	}

	/**
	 * @param array<string,mixed> $status
	 */
	private static function render_image_seo_library( array $status ): void {
		$list_table = new Neo_Pulse_Wp_Image_Seo_List_Table();
		$list_table->prepare_items();
		$edit_mode   = $list_table->is_edit_mode();
		$missing_alt = isset( $_GET['missing_alt'] ) && '1' === (string) wp_unslash( $_GET['missing_alt'] );
		$base_url    = admin_url( 'admin.php?page=neo-pulse-wp-image-seo&tab=library' );
		$settings_url = admin_url( 'admin.php?page=neo-pulse-wp-image-seo&tab=settings' );
		$toggle_url  = add_query_arg( 'edit_mode', $edit_mode ? '0' : '1', $base_url );
		if ( $missing_alt ) {
			$toggle_url = add_query_arg( 'missing_alt', '1', $toggle_url );
		}
		?>
			<h1 class="wp-heading-inline"><?php esc_html_e( 'Image SEO', 'neo-pulse-wp' ); ?></h1>
			<a href="<?php echo esc_url( $toggle_url ); ?>" class="page-title-action">
				<?php echo $edit_mode ? esc_html__( 'Exit edit mode', 'neo-pulse-wp' ) : esc_html__( 'Edit inline', 'neo-pulse-wp' ); ?>
			</a>
			<?php if ( $edit_mode ) : ?>
				<button type="button" class="page-title-action button-primary neo-pulse-image-seo-save-inline"><?php esc_html_e( 'Save changes', 'neo-pulse-wp' ); ?></button>
			<?php endif; ?>
			<hr class="wp-header-end" />

			<?php self::render_image_seo_openrouter_notice( $status ); ?>

			<p class="description neo-pulse-wp-image-seo__note">
				<?php esc_html_e( 'Review and optimize image metadata. Use bulk actions or row Optimize for AI suggestions based on filenames.', 'neo-pulse-wp' ); ?>
			</p>

			<ul class="subsubsub">
				<?php
				$views = array(
					array(
						'key'     => 'all',
						'label'   => __( 'All images', 'neo-pulse-wp' ),
						'url'     => $base_url,
						'current' => ! $missing_alt,
					),
					array(
						'key'     => 'missing_alt',
						'label'   => __( 'Missing alt', 'neo-pulse-wp' ),
						'url'     => add_query_arg( 'missing_alt', '1', $base_url ),
						'current' => $missing_alt,
					),
				);
				$parts = array();
				foreach ( $views as $view ) {
					$url = $view['url'];
					if ( $edit_mode ) {
						$url = add_query_arg( 'edit_mode', '1', $url );
					}
					if ( ! empty( $view['current'] ) ) {
						$parts[] = '<li class="' . esc_attr( (string) $view['key'] ) . '"><a href="' . esc_url( $url ) . '" class="current" aria-current="page">' . esc_html( (string) $view['label'] ) . '</a></li>';
					} else {
						$parts[] = '<li class="' . esc_attr( (string) $view['key'] ) . '"><a href="' . esc_url( $url ) . '">' . esc_html( (string) $view['label'] ) . '</a></li>';
					}
				}
				echo wp_kses_post( implode( ' | ', $parts ) );
				?>
			</ul>

			<form method="get" class="neo-pulse-image-seo-search">
				<input type="hidden" name="page" value="neo-pulse-wp-image-seo" />
				<input type="hidden" name="tab" value="library" />
				<?php if ( $missing_alt ) : ?>
					<input type="hidden" name="missing_alt" value="1" />
				<?php endif; ?>
				<?php if ( $edit_mode ) : ?>
					<input type="hidden" name="edit_mode" value="1" />
				<?php endif; ?>
				<?php $list_table->search_box( __( 'Search images', 'neo-pulse-wp' ), 'image-seo' ); ?>
			</form>

			<form method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>">
				<input type="hidden" name="action" value="<?php echo esc_attr( self::ACTION_BULK_IMAGE_SEO ); ?>" />
				<?php wp_nonce_field( 'bulk-images' ); ?>
				<?php if ( isset( $_GET['s'] ) && (string) $_GET['s'] !== '' ) : ?>
					<input type="hidden" name="s" value="<?php echo esc_attr( sanitize_text_field( wp_unslash( (string) $_GET['s'] ) ) ); ?>" />
				<?php endif; ?>
				<?php if ( $missing_alt ) : ?>
					<input type="hidden" name="missing_alt" value="1" />
				<?php endif; ?>
				<?php $list_table->display(); ?>
			</form>
		<?php
	}

	/**
	 * @param array<string,mixed> $config
	 * @param array<string,mixed> $status
	 */
	private static function render_image_seo_settings( array $config, array $status ): void {
		$form_id = 'neo-pulse-wp-image-seo-settings-form';
		$fields  = is_array( $config['fields'] ?? null ) ? $config['fields'] : Neo_Pulse_Wp_Image_Seo::default_config()['fields'];
		?>
			<h1><?php esc_html_e( 'Image SEO Settings', 'neo-pulse-wp' ); ?></h1>

			<?php self::render_image_seo_openrouter_notice( $status ); ?>

			<form id="<?php echo esc_attr( $form_id ); ?>" method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>" class="neo-pulse-wp-settings__form">
			<input type="hidden" name="action" value="<?php echo esc_attr( self::ACTION_SAVE_IMAGE_SEO ); ?>" />
			<input type="hidden" name="neo-pulse_image_seo_tab" value="settings" />
			<?php wp_nonce_field( self::ACTION_SAVE_IMAGE_SEO, 'neo_pulse_wp_image_seo_nonce' ); ?>

			<table class="form-table" role="presentation">
				<tr>
					<th scope="row"><?php esc_html_e( 'Overwrite mode', 'neo-pulse-wp' ); ?></th>
					<td>
						<label><input type="radio" name="overwrite_mode" value="missing_only" <?php checked( $config['overwrite_mode'] ?? 'missing_only', 'missing_only' ); ?> /> <?php esc_html_e( 'Fill missing fields only', 'neo-pulse-wp' ); ?></label><br />
						<label><input type="radio" name="overwrite_mode" value="overwrite_all" <?php checked( $config['overwrite_mode'] ?? '', 'overwrite_all' ); ?> /> <?php esc_html_e( 'Overwrite existing text', 'neo-pulse-wp' ); ?></label>
					</td>
				</tr>
				<tr>
					<th scope="row"><?php esc_html_e( 'Target fields', 'neo-pulse-wp' ); ?></th>
					<td>
						<?php foreach ( Neo_Pulse_Wp_Image_Seo::FIELD_KEYS as $key ) : ?>
							<label style="display:block;margin-bottom:4px;">
								<input type="checkbox" name="field_<?php echo esc_attr( $key ); ?>" value="1" <?php checked( ! empty( $fields[ $key ] ) ); ?> />
								<?php echo esc_html( ucfirst( $key ) ); ?>
							</label>
						<?php endforeach; ?>
					</td>
				</tr>
				<tr>
					<th scope="row"><?php esc_html_e( 'Auto on upload', 'neo-pulse-wp' ); ?></th>
					<td>
						<label><input type="checkbox" name="auto_on_upload" value="1" <?php checked( ! empty( $config['auto_on_upload'] ) ); ?> /> <?php esc_html_e( 'Fill in missing text as soon as an image is uploaded', 'neo-pulse-wp' ); ?></label>
						<p class="description"><?php esc_html_e( 'Fills the title and alt text (if ticked above) for uploads from the Media Library, the post editor and Elementor. Captions and descriptions are left for you to add from the library, since many themes show captions under images. Only empty fields are filled unless "Overwrite existing text" is chosen above.', 'neo-pulse-wp' ); ?></p>
					</td>
				</tr>
				<tr>
					<th scope="row"><?php esc_html_e( 'Auto-update mode', 'neo-pulse-wp' ); ?></th>
					<td>
						<label><input type="radio" name="auto_mode" value="filename" <?php checked( $config['auto_mode'] ?? 'filename', 'filename' ); ?> /> <?php esc_html_e( 'Filename only (no API call)', 'neo-pulse-wp' ); ?></label><br />
						<label><input type="radio" name="auto_mode" value="ai" <?php checked( $config['auto_mode'] ?? '', 'ai' ); ?> /> <?php esc_html_e( 'AI looks at the image (OpenRouter, a fraction of a cent per image)', 'neo-pulse-wp' ); ?></label>
					</td>
				</tr>
				<tr>
					<th scope="row"><label for="neo-pulse-image-seo-instructions"><?php esc_html_e( 'Instructions for the AI', 'neo-pulse-wp' ); ?></label></th>
					<td>
						<textarea id="neo-pulse-image-seo-instructions" name="ai_instructions" rows="5" class="large-text" placeholder="<?php echo esc_attr__( 'e.g. We sell and install window coverings in Edmonton. Name the product type when you can tell (roller shades, zebra blinds, shutters). Mention Edmonton in the title, not the alt text. Keep alt text under 100 characters.', 'neo-pulse-wp' ); ?>"><?php echo esc_textarea( (string) ( $config['ai_instructions'] ?? '' ) ); ?></textarea>
						<p class="description"><?php esc_html_e( 'Guides every alt text, title, caption and description the AI writes: wording, keywords, what to mention or avoid. The site name and city are already passed along.', 'neo-pulse-wp' ); ?></p>
					</td>
				</tr>
				<tr>
					<th scope="row"><?php esc_html_e( 'Post context', 'neo-pulse-wp' ); ?></th>
					<td>
						<label><input type="checkbox" name="context_from_post" value="1" <?php checked( ! empty( $config['context_from_post'] ) ); ?> /> <?php esc_html_e( 'Include parent post title and URL in AI prompts when optimizing from the post editor', 'neo-pulse-wp' ); ?></label>
					</td>
				</tr>
			</table>
				<p class="submit"><button type="submit" class="button button-primary"><?php esc_html_e( 'Save Image SEO settings', 'neo-pulse-wp' ); ?></button></p>
			</form>
		<?php
	}

	/**
	 * Image SEO screen only: its stylesheet (not in the shared admin list) and script.
	 *
	 * @param string|mixed $hook_suffix Current admin page hook.
	 */
	public static function enqueue_image_seo_assets( $hook_suffix ): void {
		$hook_suffix = is_string( $hook_suffix ) ? $hook_suffix : '';
		if ( ! Neo_Pulse_Wp_Admin::admin_hook_matches( $hook_suffix, array( 'neo-pulse-wp_page_neo_pulse-wp-image-seo' ) ) ) {
			return;
		}
		$base = 'assets/admin/';
		$css  = NEO_PULSE_WP_PLUGIN_DIR . $base . 'admin-image-seo.css';
		$js   = NEO_PULSE_WP_PLUGIN_DIR . $base . 'admin-image-seo.js';
		$ver  = defined( 'NEO_PULSE_WP_VERSION' ) ? NEO_PULSE_WP_VERSION : '0.9.0';
		if ( is_readable( $css ) ) {
			wp_enqueue_style(
				'neo-pulse-wp-admin-image-seo',
				plugin_dir_url( NEO_PULSE_WP_PLUGIN_FILE ) . $base . 'admin-image-seo.css',
				array( 'neo-pulse-wp-admin-settings' ),
				$ver . '.' . (string) filemtime( $css )
			);
		}
		if ( is_readable( $js ) ) {
			wp_enqueue_script(
				'neo-pulse-wp-admin-image-seo',
				plugin_dir_url( NEO_PULSE_WP_PLUGIN_FILE ) . $base . 'admin-image-seo.js',
				array( 'jquery' ),
				$ver . '.' . (string) filemtime( $js ),
				true
			);
			wp_localize_script(
				'neo-pulse-wp-admin-image-seo',
				'neoPulseWpImageSeo',
				array(
					'root'  => esc_url_raw( rest_url( 'neo-pulse/v1/image-seo' ) ),
					'nonce' => wp_create_nonce( 'wp_rest' ),
					'strings' => array(
						'optimizing' => __( 'Optimizing…', 'neo-pulse-wp' ),
						'apply'      => __( 'Apply', 'neo-pulse-wp' ),
						'cancel'     => __( 'Cancel', 'neo-pulse-wp' ),
						'error'      => __( 'Optimization failed.', 'neo-pulse-wp' ),
						'saved'      => __( 'Changes saved.', 'neo-pulse-wp' ),
					),
				)
			);
		}
	}
}
