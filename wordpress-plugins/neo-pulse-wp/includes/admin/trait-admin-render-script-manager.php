<?php
/**
 * Script Manager admin pages.
 *
 * @package Neo_Pulse_Wp
 */

defined( 'ABSPATH' ) || exit;

trait Neo_Pulse_Wp_Admin_Trait_Render_Script_Manager {

	public static function render_script_manager_page(): void {
		require_once NEO_PULSE_WP_PLUGIN_DIR . 'includes/admin/class-neo-pulse-wp-script-manager-list-table.php';
		if ( ! current_user_can( 'manage_options' ) ) {
			wp_die( esc_html__( 'You do not have permission to manage scripts.', 'neo-pulse-wp' ) );
		}

		$action = isset( $_GET['action'] ) ? sanitize_key( wp_unslash( (string) $_GET['action'] ) ) : 'list';
		switch ( $action ) {
			case 'new':
			case 'edit':
				self::render_script_edit_page();
				return;
			case 'import-export':
				self::render_script_import_export_page();
				return;
			case 'settings':
				self::render_script_settings_page();
				return;
			default:
				self::render_script_list_page();
		}
	}

	private static function render_script_list_page(): void {
		$list_table = new Neo_Pulse_Wp_Script_Manager_List_Table();
		$list_table->prepare_items();
		$counts   = $list_table->get_status_counts();
		$status   = isset( $_GET['script_status'] ) ? sanitize_key( wp_unslash( (string) $_GET['script_status'] ) ) : 'all';
		if ( $status === '' ) {
			$status = 'all';
		}
		$category = isset( $_GET['script_category'] ) ? sanitize_text_field( wp_unslash( (string) $_GET['script_category'] ) ) : '';
		$search   = isset( $_REQUEST['s'] ) ? sanitize_text_field( wp_unslash( (string) $_REQUEST['s'] ) ) : '';
		$base_url = admin_url( 'admin.php?page=neo-pulse-wp-script-manager' );
		$conflicts = Neo_Pulse_Wp_Script_Manager::conflicting_plugins();
		$hfcm      = self::hfcm_database_import_status();
		if ( ! empty( $hfcm['available'] ) ) {
			// The HFCM panel below already covers HFCM; warn only about other script plugins.
			$conflicts = array_values(
				array_filter(
					$conflicts,
					static function ( $name ) {
						return 0 !== strpos( (string) $name, 'Header Footer Code Manager' );
					}
				)
			);
		}
		self::neo_pulse_group_shell_open( 'neo-pulse-wp-script-manager', 'neo-pulse-wp-script-manager' );
		?>
			<h1 class="wp-heading-inline"><?php esc_html_e( 'Script Manager', 'neo-pulse-wp' ); ?></h1>
			<a href="<?php echo esc_url( admin_url( 'admin.php?page=neo-pulse-wp-script-manager&action=new' ) ); ?>" class="page-title-action"><?php esc_html_e( 'Add New', 'neo-pulse-wp' ); ?></a>
			<hr class="wp-header-end" />

			<?php if ( ! empty( $conflicts ) ) : ?>
				<div class="notice inline notice-warning">
					<p>
						<?php
						echo esc_html(
							sprintf(
								/* translators: %s: comma-separated plugin names */
								__( 'Another script plugin is active (%s). Avoid duplicate pixels or verification tags.', 'neo-pulse-wp' ),
								implode( ', ', $conflicts )
							)
						);
						?>
					</p>
				</div>
			<?php endif; ?>

			<?php if ( ! empty( $hfcm['available'] ) ) : ?>
				<?php self::render_hfcm_switch_panel( $hfcm, true ); ?>
			<?php endif; ?>

			<p class="description neo-pulse-wp-script-manager__note">
				<?php esc_html_e( 'Add tracking pixels, Google Search Console verification meta tags, and other header, footer, or body snippets. Scripts run only on the front end when active and display rules match.', 'neo-pulse-wp' ); ?>
			</p>

			<div class="neo-pulse-wp-script-manager__list-tools">
				<ul class="subsubsub">
					<?php
					$view_keys = array( 'all', 'active', 'inactive', 'trash' );
					$labels    = array(
						'all'      => __( 'All', 'neo-pulse-wp' ),
						'active'   => __( 'Active', 'neo-pulse-wp' ),
						'inactive' => __( 'Inactive', 'neo-pulse-wp' ),
						'trash'    => __( 'Trash', 'neo-pulse-wp' ),
					);
					$parts = array();
					foreach ( $view_keys as $key ) {
						$url   = add_query_arg( 'script_status', $key, $base_url );
						$count = isset( $counts[ $key ] ) ? (int) $counts[ $key ] : 0;
						$text  = $labels[ $key ] . ' (' . $count . ')';
						if ( $status === $key || ( 'all' === $key && ( $status === '' || $status === 'all' ) ) ) {
							$parts[] = '<li class="' . esc_attr( $key ) . '"><a href="' . esc_url( $url ) . '" class="current" aria-current="page">' . esc_html( $text ) . '</a></li>';
						} else {
							$parts[] = '<li class="' . esc_attr( $key ) . '"><a href="' . esc_url( $url ) . '">' . esc_html( $text ) . '</a></li>';
						}
					}
					echo wp_kses_post( implode( ' | ', $parts ) );
					?>
				</ul>

				<form method="get" class="neo-pulse-wp-script-manager__filter-form">
					<input type="hidden" name="page" value="neo-pulse-wp-script-manager" />
					<input type="hidden" name="script_status" value="<?php echo esc_attr( $status ); ?>" />
					<?php self::render_script_category_filter( $category ); ?>
					<label for="neo-pulse-script-search" class="screen-reader-text"><?php esc_html_e( 'Search scripts', 'neo-pulse-wp' ); ?></label>
					<input type="search" id="neo-pulse-script-search" name="s" value="<?php echo esc_attr( $search ); ?>" placeholder="<?php esc_attr_e( 'Search scripts', 'neo-pulse-wp' ); ?>" />
					<?php if ( $search !== '' ) : ?>
						<a class="button" href="<?php echo esc_url( remove_query_arg( 's', add_query_arg( array( 'page' => 'neo-pulse-wp-script-manager', 'script_status' => $status, 'script_category' => $category ), admin_url( 'admin.php' ) ) ) ); ?>"><?php esc_html_e( 'Clear', 'neo-pulse-wp' ); ?></a>
					<?php endif; ?>
					<input type="submit" class="button" value="<?php esc_attr_e( 'Filter', 'neo-pulse-wp' ); ?>" />
				</form>

				<form method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>" class="neo-pulse-wp-script-manager__list-form">
					<input type="hidden" name="action" value="<?php echo esc_attr( self::ACTION_BULK_SCRIPTS ); ?>" />
					<?php wp_nonce_field( 'bulk-scripts' ); ?>
					<input type="hidden" name="script_status" value="<?php echo esc_attr( $status ); ?>" />
					<?php if ( $category !== '' ) : ?>
						<input type="hidden" name="script_category" value="<?php echo esc_attr( $category ); ?>" />
					<?php endif; ?>
					<?php if ( $search !== '' ) : ?>
						<input type="hidden" name="s" value="<?php echo esc_attr( $search ); ?>" />
					<?php endif; ?>
					<?php $list_table->display(); ?>
				</form>
			</div>
		<?php
		self::neo_pulse_group_shell_close();
	}

	/**
	 * @param string $selected Selected category.
	 */
	private static function render_script_category_filter( string $selected ): void {
		$categories = Neo_Pulse_Wp_Script_Manager::distinct_categories();
		if ( empty( $categories ) ) {
			return;
		}
		?>
		<label for="script_category" class="screen-reader-text"><?php esc_html_e( 'Filter by category', 'neo-pulse-wp' ); ?></label>
		<select name="script_category" id="script_category">
			<option value=""><?php esc_html_e( 'All categories', 'neo-pulse-wp' ); ?></option>
			<?php foreach ( $categories as $cat ) : ?>
				<option value="<?php echo esc_attr( $cat ); ?>" <?php selected( $selected, $cat ); ?>><?php echo esc_html( $cat ); ?></option>
			<?php endforeach; ?>
		</select>
		<?php
	}

	private static function render_script_edit_page(): void {
		$id     = isset( $_GET['id'] ) ? (int) $_GET['id'] : 0;
		$is_new = isset( $_GET['action'] ) && 'new' === sanitize_key( wp_unslash( (string) $_GET['action'] ) );
		$row    = $id > 0 ? Neo_Pulse_Wp_Script_Manager::get( $id ) : null;
		if ( $id > 0 && ! $row ) {
			wp_die( esc_html__( 'Script not found.', 'neo-pulse-wp' ) );
		}

		$settings   = Neo_Pulse_Wp_Script_Manager::get_settings();
		$categories = Neo_Pulse_Wp_Script_Manager::distinct_categories();
		$rules      = $row
			? Neo_Pulse_Wp_Script_Manager_Rules::decode( (string) $row->display_rules )
			: Neo_Pulse_Wp_Script_Manager_Rules::defaults();
		$rules_json = wp_json_encode( $rules );
		$post_types = get_post_types( array( 'public' => true ), 'objects' );

		self::enqueue_script_manager_assets();
		self::neo_pulse_group_shell_open( 'neo-pulse-wp-script-manager', 'neo-pulse-wp-script-manager' );
		?>
			<h1><?php echo $is_new ? esc_html__( 'Add Script', 'neo-pulse-wp' ) : esc_html__( 'Edit Script', 'neo-pulse-wp' ); ?></h1>
			<p><a href="<?php echo esc_url( admin_url( 'admin.php?page=neo-pulse-wp-script-manager' ) ); ?>">&larr; <?php esc_html_e( 'Back to list', 'neo-pulse-wp' ); ?></a></p>

			<?php if ( $row && class_exists( 'Neo_Pulse_Wp_Overseer', false ) && Neo_Pulse_Wp_Overseer::is_builtin_script_id( (int) $row->id ) ) : ?>
				<div class="notice inline notice-info">
					<p>
						<?php
						esc_html_e(
							'This is the built-in NEO Pulse Page View tag for Overseer analytics. Placeholders (%%NEO_PULSE_OVERSEER_CONFIG%%, %%NEO_PULSE_OVERSEER_JS_URL%%) are replaced with live values on each page load. Do not remove the script tags unless you know what you are doing.',
							'neo-pulse-wp'
						);
						?>
						<a href="<?php echo esc_url( admin_url( 'admin.php?page=neo-pulse-wp-overseer' ) ); ?>"><?php esc_html_e( 'Open Overseer', 'neo-pulse-wp' ); ?></a>
					</p>
				</div>
			<?php endif; ?>

			<form method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>" class="neo-pulse-wp-script-manager__form" id="neo-pulse-script-manager-form">
				<input type="hidden" name="action" value="<?php echo esc_attr( self::ACTION_SAVE_SCRIPT ); ?>" />
				<?php wp_nonce_field( self::ACTION_SAVE_SCRIPT, 'neo_pulse_wp_script_nonce' ); ?>
				<input type="hidden" name="script_id" value="<?php echo esc_attr( (string) $id ); ?>" />
				<input type="hidden" name="script_display_rules" id="script_display_rules" value="<?php echo esc_attr( is_string( $rules_json ) ? $rules_json : '{}' ); ?>" />

				<?php self::render_script_meta_fields( $row, $categories, $settings ); ?>

				<section class="neo-pulse-rules" id="neo-pulse-script-rules-panel" aria-labelledby="neo-pulse-rules-heading"
					data-rules="<?php echo esc_attr( is_string( $rules_json ) ? $rules_json : '{}' ); ?>">
					<header class="neo-pulse-rules__header">
						<h2 id="neo-pulse-rules-heading" class="neo-pulse-rules__title"><?php esc_html_e( 'Display rules', 'neo-pulse-wp' ); ?></h2>
					</header>

					<div class="neo-pulse-rules__global">
						<?php
						self::render_rules_select_field(
							'rules_mode',
							'mode',
							__( 'Show on', 'neo-pulse-wp' ),
							array(
								'all'     => __( 'All pages', 'neo-pulse-wp' ),
								'include' => __( 'Only selected targets', 'neo-pulse-wp' ),
								'exclude' => __( 'All except selected', 'neo-pulse-wp' ),
							)
						);
						self::render_rules_select_field(
							'rules_device',
							'device',
							__( 'Device', 'neo-pulse-wp' ),
							array(
								'all'     => __( 'All devices', 'neo-pulse-wp' ),
								'mobile'  => __( 'Mobile only', 'neo-pulse-wp' ),
								'desktop' => __( 'Desktop only', 'neo-pulse-wp' ),
							)
						);
						self::render_rules_select_field(
							'rules_logged_in',
							'logged_in',
							__( 'Audience', 'neo-pulse-wp' ),
							array(
								'all'     => __( 'Everyone', 'neo-pulse-wp' ),
								'only'    => __( 'Logged-in only', 'neo-pulse-wp' ),
								'exclude' => __( 'Guests only', 'neo-pulse-wp' ),
							)
						);
						?>
					</div>

					<div class="neo-pulse-rules__targets" data-neo-pulse-rules-tabs>
						<div class="neo-pulse-rules__tabs" role="tablist" aria-label="<?php esc_attr_e( 'Target scope', 'neo-pulse-wp' ); ?>">
							<button type="button" class="neo-pulse-rules__tab is-active" role="tab" aria-selected="true" aria-controls="neo-pulse-rules-panel-include" data-rules-tab="include"><?php esc_html_e( 'Include', 'neo-pulse-wp' ); ?></button>
							<button type="button" class="neo-pulse-rules__tab" role="tab" aria-selected="false" aria-controls="neo-pulse-rules-panel-exclude" data-rules-tab="exclude"><?php esc_html_e( 'Exclude', 'neo-pulse-wp' ); ?></button>
						</div>
						<div class="neo-pulse-rules__panel is-active" id="neo-pulse-rules-panel-include" role="tabpanel" data-rules-group="include">
							<?php self::render_rules_target_fields( 'include', $post_types ); ?>
						</div>
						<div class="neo-pulse-rules__panel" id="neo-pulse-rules-panel-exclude" role="tabpanel" data-rules-group="exclude" hidden>
							<?php self::render_rules_target_fields( 'exclude', $post_types ); ?>
						</div>
					</div>
				</section>

				<p class="submit">
					<button type="submit" class="button button-primary"><?php esc_html_e( 'Save Script', 'neo-pulse-wp' ); ?></button>
					<?php if ( $row ) : ?>
						<a class="button button-link-delete" href="<?php echo self::script_admin_post_nonce_url( self::ACTION_DELETE_SCRIPT, 'neo_pulse_wp_delete_script_nonce', array( 'id' => (int) $row->id ) ); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- wp_nonce_url() escapes for HTML attributes. ?>" onclick="return confirm('<?php echo esc_js( __( 'Delete this script permanently?', 'neo-pulse-wp' ) ); ?>');"><?php esc_html_e( 'Delete Permanently', 'neo-pulse-wp' ); ?></a>
					<?php endif; ?>
				</p>
			</form>
		<?php
		self::neo_pulse_group_shell_close();
	}

	/**
	 * Script edit form — grid with nested labels and dark fields.
	 *
	 * @param object|null          $row        Script row.
	 * @param array<int, string>   $categories Distinct categories.
	 * @param array<string, mixed> $settings   Plugin settings.
	 */
	private static function render_script_meta_fields( $row, array $categories, array $settings ): void {
		$name_value     = $row ? (string) $row->name : '';
		$priority_value = $row ? (string) (int) $row->priority : '10';
		$category_value = $row ? (string) $row->category : (string) $settings['default_category'];
		$code_value     = $row ? (string) $row->code : '';
		$placement      = $row ? (string) $row->placement : 'header';
		$status         = $row ? (string) $row->status : 'active';

		$placements = array(
			'header' => __( 'Header (wp_head)', 'neo-pulse-wp' ),
			'body'   => __( 'Body (wp_body_open)', 'neo-pulse-wp' ),
			'footer' => __( 'Footer (wp_footer)', 'neo-pulse-wp' ),
		);
		$statuses = array(
			'active'   => __( 'Active', 'neo-pulse-wp' ),
			'inactive' => __( 'Inactive', 'neo-pulse-wp' ),
		);
		?>
		<section class="neo-pulse-script-meta" aria-labelledby="neo-pulse-script-meta-heading">
			<h2 id="neo-pulse-script-meta-heading" class="neo-pulse-script-meta__title screen-reader-text"><?php esc_html_e( 'Script details', 'neo-pulse-wp' ); ?></h2>
			<div class="neo-pulse-script-meta__grid">
				<?php
				self::render_meta_text_field(
					'script_name',
					'script_name',
					__( 'Script name', 'neo-pulse-wp' ),
					$name_value,
					'full',
					'text',
					true
				);
				self::render_meta_select_field(
					'script_placement',
					'script_placement',
					__( 'Placement', 'neo-pulse-wp' ),
					$placements,
					$placement,
					'half'
				);
				self::render_meta_text_field(
					'script_priority',
					'script_priority',
					__( 'Priority', 'neo-pulse-wp' ),
					$priority_value,
					'quarter',
					'number'
				);
				self::render_meta_select_field(
					'script_status_field',
					'script_status_field',
					__( 'Status', 'neo-pulse-wp' ),
					$statuses,
					$status,
					'quarter'
				);
				self::render_meta_text_field(
					'script_category',
					'script_category',
					__( 'Category', 'neo-pulse-wp' ),
					$category_value,
					'half',
					'text',
					false,
					'',
					'neo-pulse-wp-script-categories'
				);
				self::render_meta_textarea_field(
					'script_code',
					'script_code',
					__( 'Code', 'neo-pulse-wp' ),
					$code_value
				);
				?>
			</div>
			<datalist id="neo-pulse-wp-script-categories">
				<?php foreach ( $categories as $cat ) : ?>
					<option value="<?php echo esc_attr( $cat ); ?>"></option>
				<?php endforeach; ?>
			</datalist>
		</section>
		<?php
	}

	/**
	 * @param string $id       Element id.
	 * @param string $name     Form name.
	 * @param string $label    Label text.
	 * @param string $value    Current value.
	 * @param string $span     Grid span: full|half|quarter.
	 * @param string $type     Input type.
	 * @param bool   $required Required attribute.
	 * @param string $note     Optional note below field.
	 * @param string $list     Optional datalist id.
	 */
	private static function render_meta_text_field(
		string $id,
		string $name,
		string $label,
		string $value = '',
		string $span = 'full',
		string $type = 'text',
		bool $required = false,
		string $note = '',
		string $list = ''
	): void {
		$extra = '';
		if ( 'number' === $type ) {
			$extra = ' min="0" max="9999"';
		}
		?>
		<div class="neo-pulse-script-meta__cell neo-pulse-script-meta__cell--<?php echo esc_attr( $span ); ?>">
			<div class="neo-pulse-field neo-pulse-field--text neo-pulse-field--stacked">
				<span class="neo-pulse-field__label neo-pulse-field__label--above"><?php echo esc_html( $label ); ?></span>
				<input
					type="<?php echo esc_attr( $type ); ?>"
					name="<?php echo esc_attr( $name ); ?>"
					id="<?php echo esc_attr( $id ); ?>"
					class="neo-pulse-field__control"
					value="<?php echo esc_attr( $value ); ?>"
					autocomplete="off"
					<?php echo $required ? ' required' : ''; ?>
					<?php echo $list !== '' ? ' list="' . esc_attr( $list ) . '"' : ''; ?>
					<?php echo $extra; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped ?>
				/>
				<?php if ( $note !== '' ) : ?>
					<p class="neo-pulse-field__note"><?php echo esc_html( $note ); ?></p>
				<?php endif; ?>
			</div>
		</div>
		<?php
	}

	/**
	 * @param string               $id       Element id.
	 * @param string               $name     Form name.
	 * @param string               $label    Label above select.
	 * @param array<string,string> $options  Value => label.
	 * @param string               $selected Selected value.
	 * @param string               $span     Grid span.
	 */
	private static function render_meta_select_field(
		string $id,
		string $name,
		string $label,
		array $options,
		string $selected,
		string $span = 'half'
	): void {
		?>
		<div class="neo-pulse-script-meta__cell neo-pulse-script-meta__cell--<?php echo esc_attr( $span ); ?>">
			<div class="neo-pulse-field neo-pulse-field--select">
				<span class="neo-pulse-field__label neo-pulse-field__label--above"><?php echo esc_html( $label ); ?></span>
				<select name="<?php echo esc_attr( $name ); ?>" id="<?php echo esc_attr( $id ); ?>" class="neo-pulse-field__control">
					<?php foreach ( $options as $value => $text ) : ?>
						<option value="<?php echo esc_attr( $value ); ?>" <?php selected( $selected, $value ); ?>><?php echo esc_html( $text ); ?></option>
					<?php endforeach; ?>
				</select>
			</div>
		</div>
		<?php
	}

	/**
	 * @param string $id    Element id.
	 * @param string $name  Form name.
	 * @param string $label Label above textarea.
	 * @param string $value Code content.
	 * @param string $note  Helper text.
	 */
	private static function render_meta_textarea_field( string $id, string $name, string $label, string $value, string $note = '' ): void {
		$filled = trim( $value ) !== '';
		?>
		<div class="neo-pulse-script-meta__cell neo-pulse-script-meta__cell--full">
			<div class="neo-pulse-field neo-pulse-field--textarea<?php echo $filled ? ' neo-pulse-field--filled' : ''; ?>">
				<span class="neo-pulse-field__label neo-pulse-field__label--above"><?php echo esc_html( $label ); ?></span>
				<textarea name="<?php echo esc_attr( $name ); ?>" id="<?php echo esc_attr( $id ); ?>" class="neo-pulse-field__control neo-pulse-field__control--code" rows="12" required placeholder=" "><?php echo esc_textarea( $value ); ?></textarea>
				<?php if ( $note !== '' ) : ?>
					<p class="neo-pulse-field__note"><?php echo esc_html( $note ); ?></p>
				<?php endif; ?>
			</div>
		</div>
		<?php
	}

	/**
	 * @param string               $id         Field id.
	 * @param string               $field_key  data-rule-field value.
	 * @param string               $label      Floating label.
	 * @param array<string,string> $options    Value => label.
	 */
	private static function render_rules_select_field( string $id, string $field_key, string $label, array $options ): void {
		?>
		<div class="neo-pulse-field neo-pulse-field--select">
			<span class="neo-pulse-field__label neo-pulse-field__label--above"><?php echo esc_html( $label ); ?></span>
			<select id="<?php echo esc_attr( $id ); ?>" class="neo-pulse-field__control" data-rule-field="<?php echo esc_attr( $field_key ); ?>">
				<?php foreach ( $options as $value => $text ) : ?>
					<option value="<?php echo esc_attr( $value ); ?>"><?php echo esc_html( $text ); ?></option>
				<?php endforeach; ?>
			</select>
		</div>
		<?php
	}

	/**
	 * @param string               $group   include|exclude.
	 * @param string               $target  Target key.
	 * @param string               $label   Field label.
	 * @param array<string,string> $options Value => label.
	 */
	private static function render_rules_multiselect_field( string $group, string $target, string $label, array $options ): void {
		$uid = 'neo-pulse-ms-' . $group . '-' . $target;
		?>
		<div class="neo-pulse-field neo-pulse-field--multiselect" data-neo-pulse-ms>
			<button type="button" class="neo-pulse-ms__trigger neo-pulse-field__control" aria-expanded="false" aria-haspopup="listbox" aria-controls="<?php echo esc_attr( $uid ); ?>-menu" id="<?php echo esc_attr( $uid ); ?>-trigger">
				<span class="neo-pulse-field__label"><?php echo esc_html( $label ); ?></span>
				<span class="neo-pulse-ms__summary" aria-live="polite"></span>
			</button>
			<div class="neo-pulse-ms__menu" id="<?php echo esc_attr( $uid ); ?>-menu" role="listbox" aria-multiselectable="true" hidden>
				<?php foreach ( $options as $value => $text ) : ?>
					<button type="button" class="neo-pulse-ms__option" role="option" aria-selected="false" data-value="<?php echo esc_attr( $value ); ?>">
						<?php echo esc_html( $text ); ?>
					</button>
				<?php endforeach; ?>
			</div>
			<select class="neo-pulse-ms__native" data-target="<?php echo esc_attr( $target ); ?>" data-group="<?php echo esc_attr( $group ); ?>" multiple hidden aria-hidden="true" tabindex="-1">
				<?php foreach ( $options as $value => $text ) : ?>
					<option value="<?php echo esc_attr( $value ); ?>"><?php echo esc_html( $text ); ?></option>
				<?php endforeach; ?>
			</select>
		</div>
		<?php
	}

	/**
	 * @param string $group    include|exclude.
	 * @param string $target   Target key.
	 * @param string $label    Floating label.
	 * @param string $hint     Optional hint.
	 * @param string $taxonomy Taxonomy slug when target is taxonomy.
	 */
	private static function render_rules_text_field( string $group, string $target, string $label ): void {
		$title = '';
		if ( 'taxonomies' === $target ) {
			$title = __( 'Example: category:12,34 post_tag:5', 'neo-pulse-wp' );
		}
		?>
		<div class="neo-pulse-field neo-pulse-field--text neo-pulse-field--stacked">
			<span class="neo-pulse-field__label neo-pulse-field__label--above"><?php echo esc_html( $label ); ?></span>
			<input type="text" class="neo-pulse-field__control" data-target="<?php echo esc_attr( $target ); ?>" data-group="<?php echo esc_attr( $group ); ?>" autocomplete="off"<?php echo $title !== '' ? ' title="' . esc_attr( $title ) . '"' : ''; ?> />
		</div>
		<?php
	}

	/**
	 * @return array<string, string>
	 */
	private static function rules_archive_labels(): array {
		return array(
			'category'          => __( 'Category archives', 'neo-pulse-wp' ),
			'tag'               => __( 'Tag archives', 'neo-pulse-wp' ),
			'author'            => __( 'Author archives', 'neo-pulse-wp' ),
			'date'              => __( 'Date archives', 'neo-pulse-wp' ),
			'post_type_archive' => __( 'Post type archives', 'neo-pulse-wp' ),
		);
	}

	/**
	 * @return array<string, string>
	 */
	private static function rules_special_labels(): array {
		return array(
			'front_page' => __( 'Front page', 'neo-pulse-wp' ),
			'blog'       => __( 'Blog index', 'neo-pulse-wp' ),
			'search'     => __( 'Search results', 'neo-pulse-wp' ),
			'404'        => __( '404 page', 'neo-pulse-wp' ),
			'attachment' => __( 'Attachments', 'neo-pulse-wp' ),
			'singular'   => __( 'All singular', 'neo-pulse-wp' ),
			'archive'    => __( 'All archives', 'neo-pulse-wp' ),
		);
	}

	/**
	 * @param string                      $group      include|exclude.
	 * @param array<string, WP_Post_Type> $post_types Post types.
	 */
	private static function render_rules_target_fields( string $group, array $post_types ): void {
		$post_type_options = array();
		foreach ( $post_types as $pt ) {
			$post_type_options[ $pt->name ] = $pt->labels->singular_name;
		}

		$archive_options = array();
		foreach ( Neo_Pulse_Wp_Script_Manager_Rules::ARCHIVES as $arch ) {
			$labels = self::rules_archive_labels();
			$archive_options[ $arch ] = isset( $labels[ $arch ] ) ? $labels[ $arch ] : $arch;
		}

		$special_options = self::rules_special_labels();
		?>
		<div class="neo-pulse-rules__stack">
			<?php
			self::render_rules_text_field( $group, 'posts', __( 'Post IDs', 'neo-pulse-wp' ) );
			self::render_rules_multiselect_field( $group, 'post_types', __( 'Post types', 'neo-pulse-wp' ), $post_type_options );
			self::render_rules_multiselect_field( $group, 'archives', __( 'Archives', 'neo-pulse-wp' ), $archive_options );
			self::render_rules_multiselect_field( $group, 'special', __( 'Special pages', 'neo-pulse-wp' ), $special_options );
			self::render_rules_text_field( $group, 'taxonomies', __( 'Taxonomy terms', 'neo-pulse-wp' ) );
			?>
		</div>
		<?php
	}

	/**
	 * "Move from HFCM" panel: what each snippet becomes, then one button that imports and turns HFCM off.
	 *
	 * @param array<string, mixed> $plan    Plan from hfcm_database_import_status().
	 * @param bool                 $compact On the script list: the snippet table starts folded.
	 */
	private static function render_hfcm_switch_panel( array $plan, bool $compact = false ): void {
		$labels = array(
			'import'     => __( 'Imports, switched on', 'neo-pulse-wp' ),
			'import_off' => __( 'Imports, switched off', 'neo-pulse-wp' ),
			'comments'   => __( 'Replaced by Neo Tools "Disable comments"', 'neo-pulse-wp' ),
			'skip'       => __( 'Skipped (switched off in HFCM)', 'neo-pulse-wp' ),
			'done'       => __( 'Already imported', 'neo-pulse-wp' ),
			'blocker'    => __( 'Needs attention', 'neo-pulse-wp' ),
		);
		$items = isset( $plan['items'] ) && is_array( $plan['items'] ) ? $plan['items'] : array();
		?>
		<div class="neo-pulse-wp-script-manager__panel neo-pulse-wp-script-manager__panel--hfcm-switch">
			<h2><?php esc_html_e( 'Move from Header Footer Code Manager', 'neo-pulse-wp' ); ?></h2>
			<p>
				<?php
				if ( (int) $plan['pending'] > 0 ) {
					esc_html_e( 'Imports every HFCM snippet with the same on/off state, location and page rules, then deactivates HFCM so nothing runs twice.', 'neo-pulse-wp' );
				} else {
					esc_html_e( 'All HFCM snippets are already in Script Manager. HFCM is still active, so the button below just deactivates it.', 'neo-pulse-wp' );
				}
				?>
			</p>
			<?php if ( ! empty( $items ) ) : ?>
				<?php if ( $compact ) : ?>
				<details class="neo-pulse-wp-script-manager__hfcm-details"<?php echo (int) $plan['blockers'] > 0 ? ' open' : ''; ?>>
					<summary>
						<?php
						echo esc_html(
							sprintf(
								/* translators: %d: number of HFCM snippets */
								_n( 'See what happens to the %d HFCM snippet', 'See what happens to each of the %d HFCM snippets', count( $items ), 'neo-pulse-wp' ),
								count( $items )
							)
						);
						?>
					</summary>
				<?php endif; ?>
				<table class="widefat striped neo-pulse-wp-script-manager__hfcm-table">
					<thead>
						<tr>
							<th><?php esc_html_e( 'HFCM snippet', 'neo-pulse-wp' ); ?></th>
							<th><?php esc_html_e( 'Type', 'neo-pulse-wp' ); ?></th>
							<th><?php esc_html_e( 'In HFCM', 'neo-pulse-wp' ); ?></th>
							<th><?php esc_html_e( 'What happens', 'neo-pulse-wp' ); ?></th>
						</tr>
					</thead>
					<tbody>
						<?php foreach ( $items as $item ) : ?>
							<tr>
								<td><?php echo esc_html( (string) $item['name'] ); ?></td>
								<td><?php echo esc_html( strtoupper( (string) $item['type'] ) ); ?></td>
								<td><?php echo $item['active'] ? esc_html__( 'On', 'neo-pulse-wp' ) : esc_html__( 'Off', 'neo-pulse-wp' ); ?></td>
								<td>
									<strong><?php echo esc_html( $labels[ $item['outcome'] ] ?? (string) $item['outcome'] ); ?></strong>
									<?php if ( '' !== (string) $item['note'] ) : ?>
										<br /><span class="description"><?php echo esc_html( (string) $item['note'] ); ?></span>
									<?php endif; ?>
								</td>
							</tr>
						<?php endforeach; ?>
					</tbody>
				</table>
				<?php if ( $compact ) : ?>
				</details>
				<?php endif; ?>
			<?php endif; ?>
			<?php if ( (int) $plan['blockers'] > 0 ) : ?>
				<p class="description"><?php esc_html_e( 'Snippets marked "Needs attention" are switched on but can\'t move to Script Manager. Everything else will still be imported, and HFCM stays on until they are dealt with.', 'neo-pulse-wp' ); ?></p>
			<?php endif; ?>
			<form method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>">
				<input type="hidden" name="action" value="<?php echo esc_attr( self::ACTION_IMPORT_SCRIPTS_HFCM_DB ); ?>" />
				<?php wp_nonce_field( self::ACTION_IMPORT_SCRIPTS_HFCM_DB, 'neo_pulse_wp_import_scripts_hfcm_db_nonce' ); ?>
				<p>
					<button type="submit" class="button button-primary">
						<?php
						echo (int) $plan['blockers'] > 0
							? esc_html__( 'Import from HFCM', 'neo-pulse-wp' )
							: esc_html__( 'Import from HFCM and deactivate HFCM', 'neo-pulse-wp' );
						?>
					</button>
				</p>
			</form>
		</div>
		<?php
	}

	private static function render_script_import_export_page(): void {
		$hfcm = self::hfcm_database_import_status();
		self::neo_pulse_group_shell_open( 'neo-pulse-wp-script-manager', 'neo-pulse-wp-script-manager' );
		?>
			<h1><?php esc_html_e( 'Import & Export', 'neo-pulse-wp' ); ?></h1>

			<?php if ( ! empty( $hfcm['available'] ) ) : ?>
				<?php self::render_hfcm_switch_panel( $hfcm ); ?>
			<?php endif; ?>

			<div class="neo-pulse-wp-script-manager__panels neo-pulse-wp-script-manager__panels--quad">

				<div class="neo-pulse-wp-script-manager__panel neo-pulse-wp-script-manager__panel--hfcm">
					<h2><?php esc_html_e( 'Import HFCM export file', 'neo-pulse-wp' ); ?></h2>
					<p><?php esc_html_e( 'Upload the JSON file from Header Footer Code Manager (Tools → Import/Export). Snippets are converted to NEO Pulse scripts; PHP snippets are skipped.', 'neo-pulse-wp' ); ?></p>
					<form method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>" enctype="multipart/form-data">
						<input type="hidden" name="action" value="<?php echo esc_attr( self::ACTION_IMPORT_SCRIPTS_HFCM ); ?>" />
						<?php wp_nonce_field( self::ACTION_IMPORT_SCRIPTS_HFCM, 'neo_pulse_wp_import_scripts_hfcm_nonce' ); ?>
						<p><input type="file" name="script_hfcm_import_file" accept=".json,application/json" required /></p>
						<p><button type="submit" class="button button-primary"><?php esc_html_e( 'Import HFCM JSON', 'neo-pulse-wp' ); ?></button></p>
					</form>
				</div>

				<div class="neo-pulse-wp-script-manager__panel">
					<h2><?php esc_html_e( 'Import NEO Pulse / CSV', 'neo-pulse-wp' ); ?></h2>
					<p><?php esc_html_e( 'Upload a NEO Pulse JSON export or CSV. Matching names are updated; others are added.', 'neo-pulse-wp' ); ?></p>
					<form method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>" enctype="multipart/form-data">
						<input type="hidden" name="action" value="<?php echo esc_attr( self::ACTION_IMPORT_SCRIPTS ); ?>" />
						<?php wp_nonce_field( self::ACTION_IMPORT_SCRIPTS, 'neo_pulse_wp_import_scripts_nonce' ); ?>
						<p><input type="file" name="script_import_file" accept=".json,.csv,application/json,text/csv" required /></p>
						<p><button type="submit" class="button button-secondary"><?php esc_html_e( 'Import NEO Pulse file', 'neo-pulse-wp' ); ?></button></p>
					</form>
				</div>

				<div class="neo-pulse-wp-script-manager__panel">
					<h2><?php esc_html_e( 'Export JSON', 'neo-pulse-wp' ); ?></h2>
					<p><?php esc_html_e( 'Download all non-trash scripts as NEO Pulse JSON for backup or migration.', 'neo-pulse-wp' ); ?></p>
					<p><code>version, exported_at, scripts[]</code></p>
					<form method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>">
						<input type="hidden" name="action" value="<?php echo esc_attr( self::ACTION_EXPORT_SCRIPTS_JSON ); ?>" />
						<?php wp_nonce_field( self::ACTION_EXPORT_SCRIPTS_JSON, 'neo_pulse_wp_export_scripts_json_nonce' ); ?>
						<p><button type="submit" class="button button-secondary"><?php esc_html_e( 'Export JSON', 'neo-pulse-wp' ); ?></button></p>
					</form>
				</div>

				<div class="neo-pulse-wp-script-manager__panel">
					<h2><?php esc_html_e( 'Export CSV', 'neo-pulse-wp' ); ?></h2>
					<p><?php esc_html_e( 'Download all non-trash scripts for spreadsheet editing.', 'neo-pulse-wp' ); ?></p>
					<p><code>id,name,placement,code,status,priority,category,display_rules,created_at,updated_at</code></p>
					<form method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>">
						<input type="hidden" name="action" value="<?php echo esc_attr( self::ACTION_EXPORT_SCRIPTS ); ?>" />
						<?php wp_nonce_field( self::ACTION_EXPORT_SCRIPTS, 'neo_pulse_wp_export_scripts_nonce' ); ?>
						<p><button type="submit" class="button button-secondary"><?php esc_html_e( 'Export CSV', 'neo-pulse-wp' ); ?></button></p>
					</form>
				</div>
			</div>
		<?php
		self::neo_pulse_group_shell_close();
	}

	private static function render_script_settings_page(): void {
		$settings = Neo_Pulse_Wp_Script_Manager::get_settings();
		self::neo_pulse_group_shell_open( 'neo-pulse-wp-script-manager', 'neo-pulse-wp-script-manager' );
		?>
			<h1><?php esc_html_e( 'Script Manager Settings', 'neo-pulse-wp' ); ?></h1>

			<form method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>">
				<input type="hidden" name="action" value="<?php echo esc_attr( self::ACTION_SAVE_SCRIPT_SETTINGS ); ?>" />
				<?php wp_nonce_field( self::ACTION_SAVE_SCRIPT_SETTINGS, 'neo_pulse_wp_script_settings_nonce' ); ?>
				<table class="form-table" role="presentation">
					<tr>
						<th scope="row"><label for="default_script_category"><?php esc_html_e( 'Default category', 'neo-pulse-wp' ); ?></label></th>
						<td>
							<input name="default_script_category" id="default_script_category" type="text" class="regular-text" value="<?php echo esc_attr( (string) $settings['default_category'] ); ?>" />
						</td>
					</tr>
					<tr>
						<th scope="row"><?php esc_html_e( 'Customizer preview', 'neo-pulse-wp' ); ?></th>
						<td>
							<label for="customizer_preview">
								<input name="customizer_preview" id="customizer_preview" type="checkbox" value="1" <?php checked( ! empty( $settings['customizer_preview'] ) ); ?> />
								<?php esc_html_e( 'Load scripts in the Customizer preview', 'neo-pulse-wp' ); ?>
							</label>
						</td>
					</tr>
				</table>
				<p class="submit"><button type="submit" class="button button-primary"><?php esc_html_e( 'Save Settings', 'neo-pulse-wp' ); ?></button></p>
			</form>
		<?php
		self::neo_pulse_group_shell_close();
	}

	public static function enqueue_script_manager_assets(): void {
		$rel = 'assets/admin/admin-script-manager.js';
		$abs = NEO_PULSE_WP_PLUGIN_DIR . $rel;
		$ver = defined( 'NEO_PULSE_WP_VERSION' ) ? NEO_PULSE_WP_VERSION : '0.5.0';
		if ( is_readable( $abs ) ) {
			$ver .= '.' . (string) filemtime( $abs );
		}
		wp_enqueue_script(
			'neo-pulse-wp-admin-script-manager',
			plugin_dir_url( NEO_PULSE_WP_PLUGIN_FILE ) . $rel,
			array(),
			$ver,
			true
		);
	}
}
