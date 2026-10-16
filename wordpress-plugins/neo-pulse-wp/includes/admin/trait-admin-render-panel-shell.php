<?php
/**
 * Shared sidebar panel shell for NEO Pulse WP admin pages.
 *
 * @package Neo_Pulse_Wp
 */

defined( 'ABSPATH' ) || exit;

trait Neo_Pulse_Wp_Admin_Trait_Render_Panel_Shell {

	/**
	 * @param string $lead Lead paragraph.
	 */
	protected static function panel_page_header( string $lead ): void {
		$flash = self::get_and_clear_flash();
		?>
		<header class="neo-pulse-wp-settings__header">
			<h1 class="neo-pulse-wp-settings__title"><?php echo esc_html( get_admin_page_title() ); ?></h1>
			<p class="neo-pulse-wp-settings__lead"><?php echo esc_html( $lead ); ?></p>
		</header>

		<?php if ( $flash ) : ?>
			<div class="notice inline notice-<?php echo ! empty( $flash['success'] ) ? 'success' : 'error'; ?> is-dismissible">
				<p><?php echo esc_html( isset( $flash['message'] ) ? (string) $flash['message'] : '' ); ?></p>
			</div>
		<?php endif; ?>
		<?php
	}

	/**
	 * @param string                              $page_slug  Admin page slug (e.g. neo-pulse-wp-sitemap).
	 * @param array<int, array{heading?:string,tabs:array<string,string>}> $nav_groups Sidebar groups.
	 * @param string                              $active_tab Active tab key.
	 * @param string                              $nav_label  Accessible nav label.
	 */
	protected static function panel_layout_start( string $page_slug, array $nav_groups, string $active_tab, string $nav_label ): void {
		// Tabs already shown across the top of the section are not repeated here.
		if ( Neo_Pulse_Wp_Admin_Menu::section_shows_page_tabs( $page_slug ) ) {
			echo '<div class="neo-pulse-wp-panel-layout neo-pulse-wp-panel-layout--solo"><div class="neo-pulse-wp-panel-content">';
			return;
		}
		// A short list without headings sits as pills above the content; longer lists go down the side.
		$tabs_count = count( self::panel_flatten_nav_tabs( $nav_groups ) );
		$has_heads  = false;
		foreach ( $nav_groups as $group ) {
			if ( ! empty( $group['heading'] ) && count( $nav_groups ) > 1 ) {
				$has_heads = true;
			}
		}
		$top = ! $has_heads && $tabs_count <= 6;
		?>
		<div class="neo-pulse-wp-panel-layout<?php echo $top ? ' neo-pulse-wp-panel-layout--top' : ''; ?>">
			<nav class="neo-pulse-wp-panel-nav" aria-label="<?php echo esc_attr( $nav_label ); ?>">
				<?php foreach ( $nav_groups as $group ) : ?>
					<?php
					$heading = isset( $group['heading'] ) ? (string) $group['heading'] : '';
					$tabs    = isset( $group['tabs'] ) && is_array( $group['tabs'] ) ? $group['tabs'] : array();
					if ( empty( $tabs ) ) {
						continue;
					}
					?>
					<?php if ( $heading !== '' && ! $top ) : ?>
						<p class="neo-pulse-wp-panel-nav__heading"><?php echo esc_html( $heading ); ?></p>
					<?php endif; ?>
					<ul class="neo-pulse-wp-panel-nav__list">
						<?php foreach ( $tabs as $tab_key => $tab_label ) : ?>
							<?php
							$url       = add_query_arg( 'tab', $tab_key, admin_url( 'admin.php?page=' . $page_slug ) );
							$is_active = $tab_key === $active_tab;
							?>
							<li>
								<a class="neo-pulse-wp-panel-nav__item <?php echo $is_active ? 'neo-pulse-wp-panel-nav__item--active' : ''; ?>" href="<?php echo esc_url( $url ); ?>"<?php echo $is_active ? ' aria-current="page"' : ''; ?>>
									<?php echo esc_html( $tab_label ); ?>
								</a>
							</li>
						<?php endforeach; ?>
					</ul>
				<?php endforeach; ?>
			</nav>
			<div class="neo-pulse-wp-panel-content">
		<?php
	}

	protected static function panel_layout_end(): void {
		?>
			</div>
		</div>
		<?php
	}

	/**
	 * Footer with reset, optional extra left actions, and save button.
	 *
	 * @param string               $tab              Active tab.
	 * @param string               $form_id          Save form id.
	 * @param string               $reset_action     admin_post action for reset.
	 * @param string               $reset_nonce_action Nonce action.
	 * @param string               $reset_nonce_field  Nonce field name.
	 * @param string               $tab_field_name   Hidden tab field name.
	 * @param array<int, array<string,string>> $extra_actions Optional left-side forms: action, nonce_action, nonce_field, tab_field, label, button_class.
	 */
	protected static function panel_footer_save(
		string $tab,
		string $form_id,
		string $reset_action,
		string $reset_nonce_action,
		string $reset_nonce_field,
		string $tab_field_name,
		array $extra_actions = array()
	): void {
		?>
		<div class="neo-pulse-wp-panel-footer">
			<div class="neo-pulse-wp-panel-footer__left">
				<form method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>" class="neo-pulse-wp-panel-inline-form">
					<input type="hidden" name="action" value="<?php echo esc_attr( $reset_action ); ?>" />
					<input type="hidden" name="<?php echo esc_attr( $tab_field_name ); ?>" value="<?php echo esc_attr( $tab ); ?>" />
					<?php wp_nonce_field( $reset_nonce_action, $reset_nonce_field ); ?>
					<button type="submit" class="button neo-pulse-wp-panel-footer__reset"><?php esc_html_e( 'Reset Options', 'neo-pulse-wp' ); ?></button>
				</form>
				<?php foreach ( $extra_actions as $extra ) : ?>
					<form method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>" class="neo-pulse-wp-panel-inline-form">
						<input type="hidden" name="action" value="<?php echo esc_attr( $extra['action'] ); ?>" />
						<input type="hidden" name="<?php echo esc_attr( $tab_field_name ); ?>" value="<?php echo esc_attr( $tab ); ?>" />
						<?php wp_nonce_field( $extra['nonce_action'], $extra['nonce_field'] ); ?>
						<button type="submit" class="button <?php echo esc_attr( $extra['button_class'] ?? '' ); ?>"><?php echo esc_html( $extra['label'] ); ?></button>
					</form>
				<?php endforeach; ?>
			</div>
			<p class="neo-pulse-wp-settings__actions neo-pulse-wp-panel-footer__right">
				<button type="submit" form="<?php echo esc_attr( $form_id ); ?>" class="button button-primary neo-pulse-wp-settings__btn"><?php esc_html_e( 'Save Changes', 'neo-pulse-wp' ); ?></button>
			</p>
		</div>
		<?php
	}

	/**
	 * Footer with only left-side action forms (no save button).
	 *
	 * @param string                           $tab           Active tab.
	 * @param string                           $tab_field_name Hidden tab field name.
	 * @param array<int, array<string,string>> $actions       action, nonce_action, nonce_field, label, button_class.
	 */
	protected static function panel_footer_actions( string $tab, string $tab_field_name, array $actions ): void {
		?>
		<div class="neo-pulse-wp-panel-footer">
			<div class="neo-pulse-wp-panel-footer__left">
				<?php foreach ( $actions as $action ) : ?>
					<form method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>" class="neo-pulse-wp-panel-inline-form">
						<input type="hidden" name="action" value="<?php echo esc_attr( $action['action'] ); ?>" />
						<input type="hidden" name="<?php echo esc_attr( $tab_field_name ); ?>" value="<?php echo esc_attr( $tab ); ?>" />
						<?php wp_nonce_field( $action['nonce_action'], $action['nonce_field'] ); ?>
						<button type="submit" class="button <?php echo esc_attr( $action['button_class'] ?? '' ); ?>"><?php echo esc_html( $action['label'] ); ?></button>
					</form>
				<?php endforeach; ?>
			</div>
		</div>
		<?php
	}

	/**
	 * Render GSC connection status panel (shared by Settings and Analytics).
	 */
	protected static function render_gsc_connection_panel( bool $show_settings_link = true ): void {
		$connection = Neo_Pulse_Wp_Gsc::test_connection();
		$connected  = ! is_wp_error( $connection ) && ! empty( $connection['connected'] );
		$client_email = Neo_Pulse_Wp_Gsc::EMAIL_FALLBACK;
		$property   = '';
		$message    = '';
		$error_msg  = '';
		$hint       = '';
		$settings_url = admin_url( 'admin.php?page=neo-pulse-wp-settings&tab=gsc' );

		if ( is_wp_error( $connection ) ) {
			$error_data = $connection->get_error_data();
			if ( is_array( $error_data ) && ! empty( $error_data['clientEmail'] ) ) {
				$client_email = (string) $error_data['clientEmail'];
			}
			$error_msg = $connection->get_error_message();
			if ( is_array( $error_data ) && ! empty( $error_data['hint'] ) ) {
				$hint = (string) $error_data['hint'];
			}
		} else {
			$client_email = isset( $connection['clientEmail'] ) ? (string) $connection['clientEmail'] : $client_email;
			$property     = isset( $connection['property'] ) ? (string) $connection['property'] : '';
			$message      = isset( $connection['message'] ) ? (string) $connection['message'] : '';
			if ( ! $connected && ! empty( $connection['error'] ) ) {
				$error_msg = (string) $connection['error'];
			}
		}

		if ( $hint === '' && ! $connected ) {
			$hint = sprintf(
				/* translators: %s: service account email */
				__( 'In Google Search Console, go to Settings → Users and permissions and add %s with at least Restricted access for this site.', 'neo-pulse-wp' ),
				$client_email
			);
		}

		$status_class = $connected ? 'neo-pulse-wp-settings__gsc-status--ok' : 'neo-pulse-wp-settings__gsc-status--error';
		$status_label = $connected
			? __( 'Connected', 'neo-pulse-wp' )
			: __( 'Not connected', 'neo-pulse-wp' );
		?>
		<section class="neo-pulse-wp-settings__card neo-pulse-wp-settings__card--gsc" aria-labelledby="neo-pulse-wp-gsc-connection-heading">
			<h2 id="neo-pulse-wp-gsc-connection-heading" class="neo-pulse-wp-settings__card-title"><?php esc_html_e( 'Google Search Console', 'neo-pulse-wp' ); ?></h2>
			<p class="neo-pulse-wp-settings__card-desc">
				<?php esc_html_e( 'Search Console stats for this site, read with the service account below.', 'neo-pulse-wp' ); ?>
			</p>

			<div class="neo-pulse-wp-settings__gsc-panel">
				<div class="neo-pulse-wp-settings__gsc-row">
					<span class="neo-pulse-wp-settings__gsc-status <?php echo esc_attr( $status_class ); ?>">
						<?php echo esc_html( $status_label ); ?>
					</span>
				</div>

				<dl class="neo-pulse-wp-settings__gsc-meta">
					<div class="neo-pulse-wp-settings__gsc-meta-row">
						<dt><?php esc_html_e( 'Service account', 'neo-pulse-wp' ); ?></dt>
						<dd><code><?php echo esc_html( $client_email ); ?></code></dd>
					</div>
					<?php if ( $property !== '' ) : ?>
						<div class="neo-pulse-wp-settings__gsc-meta-row">
							<dt><?php esc_html_e( 'GSC property', 'neo-pulse-wp' ); ?></dt>
							<dd><code><?php echo esc_html( $property ); ?></code></dd>
						</div>
					<?php endif; ?>
				</dl>

				<?php if ( $error_msg !== '' ) : ?>
					<p class="neo-pulse-wp-settings__gsc-error"><?php echo esc_html( $error_msg ); ?></p>
				<?php elseif ( $message !== '' ) : ?>
					<p class="neo-pulse-wp-settings__gsc-note"><?php echo esc_html( $message ); ?></p>
				<?php endif; ?>

				<?php if ( $hint !== '' && ! $connected ) : ?>
					<p class="neo-pulse-wp-settings__gsc-hint"><?php echo esc_html( $hint ); ?></p>
				<?php endif; ?>

				<?php if ( current_user_can( 'manage_options' ) ) : ?>
					<form method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>" class="neo-pulse-wp-settings__gsc-check">
						<input type="hidden" name="action" value="<?php echo esc_attr( self::ACTION_SAVE_GSC ); ?>" />
						<input type="hidden" name="gsc_check" value="1" />
						<?php wp_nonce_field( self::ACTION_SAVE_GSC, 'neo_pulse_wp_gsc_nonce' ); ?>
						<button type="submit" class="button"><?php echo $connected ? esc_html__( 'Check connection', 'neo-pulse-wp' ) : esc_html__( 'Check again', 'neo-pulse-wp' ); ?></button>
					</form>
				<?php endif; ?>
			</div>

			<?php if ( $show_settings_link ) : ?>
			<p class="description" style="margin-top:12px;">
				<a href="<?php echo esc_url( $settings_url ); ?>"><?php esc_html_e( 'Open Settings for GSC credentials', 'neo-pulse-wp' ); ?></a>
			</p>
			<?php endif; ?>
		</section>
		<?php
	}

	/**
	 * @return string Sanitized tab from query string.
	 */
	protected static function panel_active_tab( string $default = 'general' ): string {
		$tab = isset( $_GET['tab'] ) ? sanitize_key( wp_unslash( (string) $_GET['tab'] ) ) : $default;
		return $tab !== '' ? $tab : $default;
	}

	/**
	 * @param array<int, array{heading?:string,tabs:array<string,string>}> $nav_groups Sidebar groups.
	 * @return array<string, string>
	 */
	protected static function panel_flatten_nav_tabs( array $nav_groups ): array {
		$tabs = array();
		foreach ( $nav_groups as $group ) {
			$group_tabs = isset( $group['tabs'] ) && is_array( $group['tabs'] ) ? $group['tabs'] : array();
			foreach ( $group_tabs as $tab_key => $tab_label ) {
				$tabs[ (string) $tab_key ] = (string) $tab_label;
			}
		}
		return $tabs;
	}

	protected static function neo_pulse_current_admin_page_slug(): string {
		return isset( $_GET['page'] ) ? sanitize_key( wp_unslash( (string) $_GET['page'] ) ) : '';
	}

	protected static function neo_pulse_overseer_active_section(): string {
		$action = isset( $_GET['action'] ) ? sanitize_key( wp_unslash( (string) $_GET['action'] ) ) : 'list';
		if ( $action === '' || $action === 'list' || $action === 'session' ) {
			return 'list';
		}
		if ( $action === 'view-report' ) {
			return 'reports';
		}
		if ( $action === 'import-export' ) {
			return 'export';
		}
		return $action;
	}

	protected static function neo_pulse_shell_wrap_classes( string $extra = '' ): string {
		return trim( 'neo-pulse-wp-settings neo-pulse-wp-settings--wide neo-pulse-wp-settings--shell ' . $extra );
	}

	/**
	 * Page heading shared by every Neo Pulse screen (same look as the Neo Tools page): a small
	 * "Neo Pulse / group" line, the screen title, and the licence and version pills.
	 *
	 * @param string $group Group name for the small line ('' for the Dashboard).
	 * @param string $title Screen title.
	 */
	public static function render_page_head( string $group, string $title ): void {
		$version = defined( 'NEO_PULSE_WP_VERSION' ) ? (string) NEO_PULSE_WP_VERSION : '';
		?>
		<header class="npwp-head">
			<div class="npwp-head__titles">
				<span class="npwp-head__crumb"><?php echo esc_html( $group !== '' ? sprintf( /* translators: %s: section group */ __( 'Neo Pulse / %s', 'neo-pulse-wp' ), $group ) : __( 'Neo Digital / Neo Pulse', 'neo-pulse-wp' ) ); ?></span>
				<h1 class="npwp-head__title"><?php echo esc_html( $title ); ?></h1>
			</div>
			<div class="npwp-head__meta">
				<?php Neo_Pulse_Wp_License::render_header_badge(); ?>
				<?php if ( $version !== '' ) : ?>
					<span class="npwp-head__version">v<?php echo esc_html( $version ); ?></span>
				<?php endif; ?>
			</div>
		</header>
		<?php
	}

	/**
	 * Section tabs across the top of a screen (Settings / Training / Conversations …).
	 */
	public static function render_section_tabs( string $section_id ): void {
		$tabs = Neo_Pulse_Wp_Admin_Menu::section_tabs( $section_id );
		if ( count( $tabs ) < 2 ) {
			return;
		}
		$label = Neo_Pulse_Wp_Admin_Menu::sections()[ $section_id ]['label'];
		?>
		<nav class="npwp-tabs" aria-label="<?php echo esc_attr( sprintf( /* translators: %s: section name */ __( '%s sections', 'neo-pulse-wp' ), $label ) ); ?>">
			<?php foreach ( $tabs as $tab ) : ?>
				<a class="npwp-tabs__item<?php echo $tab['active'] ? ' is-active' : ''; ?>" href="<?php echo esc_url( $tab['url'] ); ?>"<?php echo $tab['active'] ? ' aria-current="page"' : ''; ?>><?php echo esc_html( $tab['label'] ); ?><?php echo ! Neo_Pulse_Wp_Plan::is_ai_section( $section_id ) && Neo_Pulse_Wp_Plan::is_ai_screen( (string) $tab['page'], isset( $tab['tab'] ) ? (string) $tab['tab'] : '' ) ? Neo_Pulse_Wp_Plan::label_chip( 'npwp-tabs__ai' ) : ''; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- escaped in label_chip(). ?></a>
			<?php endforeach; ?>
		</nav>
		<?php
	}

	/**
	 * Opens a Neo Pulse screen: heading, section tabs, then the body (flash message, licence warning).
	 *
	 * @param string $page_slug    Current admin page slug.
	 * @param string $wrap_classes Extra wrap classes.
	 * @param string $flash_kind   Optional flash kind filter.
	 */
	public static function neo_pulse_group_shell_open( string $page_slug, string $wrap_classes = '', string $flash_kind = '' ): void {
		$page_slug = sanitize_key( $page_slug );
		if ( $page_slug === '' ) {
			$page_slug = self::neo_pulse_current_admin_page_slug();
		}

		$section_id = Neo_Pulse_Wp_Admin_Menu::section_for_page( $page_slug );
		$sections   = Neo_Pulse_Wp_Admin_Menu::sections();
		$section    = $section_id !== '' ? $sections[ $section_id ] : null;
		$title      = $section ? $section['label'] : (string) get_admin_page_title();
		$group      = $section ? $section['group'] : '';

		$flash = self::get_and_clear_flash();
		if ( $flash && $flash_kind !== '' && ( ! isset( $flash['kind'] ) || (string) $flash['kind'] !== $flash_kind ) ) {
			$flash = null;
		}

		$wrap_classes = trim( 'npwp-admin neo-pulse-wp-acf-shell ' . self::neo_pulse_shell_wrap_classes( $wrap_classes ) );
		?>
		<div class="wrap <?php echo esc_attr( $wrap_classes ); ?>">
			<div class="neo-pulse-wp-acf-shell-app npwp-admin__frame">
				<?php self::render_page_head( $group, $title ); ?>
				<?php
				if ( $section_id !== '' ) {
					self::render_section_tabs( $section_id );
				}
				Neo_Pulse_Wp_Lock::render_admin_card();
				Neo_Pulse_Wp_Plan::render_admin_card();
				?>
				<div class="neo-pulse-wp-acf-shell-body npwp-admin__panel">
					<?php if ( $flash ) : ?>
						<div class="notice inline notice-<?php echo ! empty( $flash['success'] ) ? 'success' : 'error'; ?> is-dismissible neo-pulse-wp-acf-shell-notice">
							<p><?php echo esc_html( isset( $flash['message'] ) ? (string) $flash['message'] : '' ); ?></p>
						</div>
					<?php endif; ?>
					<?php Neo_Pulse_Wp_License::render_shell_banner(); ?>
		<?php
	}

	public static function neo_pulse_group_shell_close(): void {
		?>
				</div>
			</div>
		</div>
		<?php
	}

	/** Open compact panel form grid (no section heading). */
	protected static function panel_form_group_open(): void {
		?>
		<section class="neo-pulse-schema-group">
			<div class="neo-pulse-schema-grid">
		<?php
	}

	/** Close panel form grid opened by panel_form_group_open(). */
	protected static function panel_form_group_close(): void {
		?>
			</div>
		</section>
		<?php
	}

	/**
	 * @param string $id          Element id.
	 * @param string $name        Form name.
	 * @param string $label       Label text.
	 * @param string $value       Current value.
	 * @param string $span        Grid span: full|half|quarter.
	 * @param string $type        Input type.
	 * @param bool   $required    Required attribute.
	 * @param string $note        Optional note below field.
	 * @param string $extra_attrs Extra HTML attributes.
	 * @param bool   $wrap_cell   Wrap in grid cell.
	 */
	protected static function panel_form_field_input(
		string $id,
		string $name,
		string $label,
		string $value = '',
		string $span = 'half',
		string $type = 'text',
		bool $required = false,
		string $note = '',
		string $extra_attrs = '',
		bool $wrap_cell = true
	): void {
		if ( $wrap_cell ) {
			?>
			<div class="neo-pulse-schema-cell neo-pulse-schema-cell--<?php echo esc_attr( $span ); ?>">
			<?php
		}
		?>
			<div class="neo-pulse-field neo-pulse-field--text neo-pulse-field--stacked">
				<label class="neo-pulse-field__label neo-pulse-field__label--above" for="<?php echo esc_attr( $id ); ?>"><?php echo esc_html( $label ); ?></label>
				<input
					type="<?php echo esc_attr( $type ); ?>"
					name="<?php echo esc_attr( $name ); ?>"
					id="<?php echo esc_attr( $id ); ?>"
					class="neo-pulse-field__control"
					value="<?php echo esc_attr( $value ); ?>"
					autocomplete="off"
					<?php echo $required ? ' required' : ''; ?>
					<?php echo $extra_attrs; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped ?>
				/>
				<?php if ( $note !== '' ) : ?>
					<p class="neo-pulse-field__note"><?php echo esc_html( $note ); ?></p>
				<?php endif; ?>
			</div>
		<?php
		if ( $wrap_cell ) {
			?>
			</div>
			<?php
		}
	}

	/**
	 * @param string               $id       Element id.
	 * @param string               $name     Form name.
	 * @param string               $label    Label text.
	 * @param array<string,string> $options  Value => label pairs.
	 * @param string               $selected Selected value.
	 * @param string               $span     Grid span.
	 * @param string               $note     Optional note.
	 */
	protected static function panel_form_field_select(
		string $id,
		string $name,
		string $label,
		array $options,
		string $selected,
		string $span = 'half',
		string $note = ''
	): void {
		?>
		<div class="neo-pulse-schema-cell neo-pulse-schema-cell--<?php echo esc_attr( $span ); ?>">
			<div class="neo-pulse-field neo-pulse-field--select neo-pulse-field--stacked">
				<label class="neo-pulse-field__label neo-pulse-field__label--above" for="<?php echo esc_attr( $id ); ?>"><?php echo esc_html( $label ); ?></label>
				<select name="<?php echo esc_attr( $name ); ?>" id="<?php echo esc_attr( $id ); ?>" class="neo-pulse-field__control">
					<?php foreach ( $options as $value => $text ) : ?>
						<option value="<?php echo esc_attr( $value ); ?>" <?php selected( $selected, $value ); ?>><?php echo esc_html( $text ); ?></option>
					<?php endforeach; ?>
				</select>
				<?php if ( $note !== '' ) : ?>
					<p class="neo-pulse-field__note"><?php echo esc_html( $note ); ?></p>
				<?php endif; ?>
			</div>
		</div>
		<?php
	}

	/**
	 * @param string $id        Element id.
	 * @param string $name      Form name.
	 * @param string $label     Label text.
	 * @param string $value     Current value.
	 * @param string $span      Grid span.
	 * @param int    $rows      Textarea rows.
	 * @param string $note      Optional note.
	 * @param bool   $wrap_cell Wrap in grid cell.
	 */
	protected static function panel_form_field_textarea(
		string $id,
		string $name,
		string $label,
		string $value,
		string $span = 'full',
		int $rows = 3,
		string $note = '',
		bool $wrap_cell = true
	): void {
		if ( $wrap_cell ) {
			?>
			<div class="neo-pulse-schema-cell neo-pulse-schema-cell--<?php echo esc_attr( $span ); ?>">
			<?php
		}
		?>
			<div class="neo-pulse-field neo-pulse-field--textarea neo-pulse-field--stacked">
				<label class="neo-pulse-field__label neo-pulse-field__label--above" for="<?php echo esc_attr( $id ); ?>"><?php echo esc_html( $label ); ?></label>
				<textarea
					name="<?php echo esc_attr( $name ); ?>"
					id="<?php echo esc_attr( $id ); ?>"
					class="neo-pulse-field__control"
					rows="<?php echo esc_attr( (string) max( 2, $rows ) ); ?>"
				><?php echo esc_textarea( $value ); ?></textarea>
				<?php if ( $note !== '' ) : ?>
					<p class="neo-pulse-field__note"><?php echo esc_html( $note ); ?></p>
				<?php endif; ?>
			</div>
		<?php
		if ( $wrap_cell ) {
			?>
			</div>
			<?php
		}
	}

	/**
	 * @param string $name    Checkbox name.
	 * @param string $label   Toggle label.
	 * @param bool   $checked Checked state.
	 * @param string $note    Optional note.
	 * @param string $value   Checkbox value.
	 * @param string $id      Optional id.
	 */
	protected static function panel_form_toggle(
		string $name,
		string $label,
		bool $checked,
		string $note = '',
		string $value = '1',
		string $id = ''
	): void {
		?>
		<div class="neo-pulse-schema-cell neo-pulse-schema-cell--full">
			<label class="neo-pulse-wp-panel-toggle">
				<input
					type="checkbox"
					name="<?php echo esc_attr( $name ); ?>"
					value="<?php echo esc_attr( $value ); ?>"
					<?php echo $id !== '' ? ' id="' . esc_attr( $id ) . '"' : ''; ?>
					<?php checked( $checked ); ?>
				/>
				<span class="neo-pulse-wp-panel-toggle__label"><?php echo esc_html( $label ); ?></span>
			</label>
			<?php if ( $note !== '' ) : ?>
				<p class="neo-pulse-field__note"><?php echo esc_html( $note ); ?></p>
			<?php endif; ?>
		</div>
		<?php
	}
}
