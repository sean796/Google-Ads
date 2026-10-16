<?php
/**
 * Redirects admin pages (Rank Math–style list table).
 *
 * @package Neo_Pulse_Wp
 */

defined( 'ABSPATH' ) || exit;

trait Neo_Pulse_Wp_Admin_Trait_Render_Redirects {

	public static function render_redirects_page(): void {
		require_once NEO_PULSE_WP_PLUGIN_DIR . 'includes/admin/class-neo-pulse-wp-redirects-list-table.php';
		if ( ! current_user_can( 'manage_options' ) ) {
			wp_die( esc_html__( 'You do not have permission to manage redirects.', 'neo-pulse-wp' ) );
		}

		$action = isset( $_GET['action'] ) ? sanitize_key( wp_unslash( (string) $_GET['action'] ) ) : 'list';
		switch ( $action ) {
			case 'new':
			case 'edit':
				self::render_redirect_edit_page();
				return;
			case 'import-export':
				self::render_redirect_import_export_page();
				return;
			case 'settings':
				self::render_redirect_settings_page();
				return;
			case '404':
				self::render_seo_404_page();
				return;
			default:
				self::render_redirect_list_page();
		}
	}

	private static function render_redirect_list_page(): void {
		$list_table = new Neo_Pulse_Wp_Redirects_List_Table();
		$list_table->prepare_items();
		$counts   = $list_table->get_status_counts();
		$status   = isset( $_GET['redirect_status'] ) ? sanitize_key( wp_unslash( (string) $_GET['redirect_status'] ) ) : 'all';
		if ( $status === '' ) {
			$status = 'all';
		}
		$category = isset( $_GET['redirect_category'] ) ? sanitize_text_field( wp_unslash( (string) $_GET['redirect_category'] ) ) : '';
		$base_url = admin_url( 'admin.php?page=neo-pulse-wp-redirects' );
		$rank_math = self::rank_math_database_import_status();
		self::neo_pulse_group_shell_open( 'neo-pulse-wp-redirects', 'neo-pulse-wp-redirects' );
		?>
			<h2 class="wp-heading-inline neo-pulse-wp-panel-content__title"><?php esc_html_e( 'Redirects', 'neo-pulse-wp' ); ?></h2>
			<a href="<?php echo esc_url( admin_url( 'admin.php?page=neo-pulse-wp-redirects&action=new' ) ); ?>" class="page-title-action"><?php esc_html_e( 'Add New', 'neo-pulse-wp' ); ?></a>
			<hr class="wp-header-end" />

			<?php if ( ! empty( $rank_math['available'] ) && (int) $rank_math['pending_count'] > 0 ) : ?>
				<?php self::render_rank_math_redirect_import_panel( $rank_math, true ); ?>
			<?php endif; ?>

			<p class="description neo-pulse-wp-redirects__note">
				<?php esc_html_e( 'Redirects are stored and executed by NEO Pulse WP only. If another redirect plugin is also active, avoid duplicate source paths.', 'neo-pulse-wp' ); ?>
			</p>

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
				foreach ( $view_keys as $i => $key ) {
					$url   = add_query_arg( 'redirect_status', $key, $base_url );
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

			<form method="get" class="neo-pulse-wp-redirects__filter-form">
				<input type="hidden" name="page" value="neo-pulse-wp-redirects" />
				<input type="hidden" name="redirect_status" value="<?php echo esc_attr( $status ); ?>" />
				<?php self::render_category_filter( $category ); ?>
			</form>

			<?php $list_table->search_box( __( 'Search Redirects', 'neo-pulse-wp' ), 'redirect' ); ?>

			<form method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>">
				<input type="hidden" name="action" value="<?php echo esc_attr( self::ACTION_BULK_REDIRECTS ); ?>" />
				<?php wp_nonce_field( 'bulk-redirects' ); ?>
				<input type="hidden" name="redirect_status" value="<?php echo esc_attr( $status ); ?>" />
				<?php if ( $category !== '' ) : ?>
					<input type="hidden" name="redirect_category" value="<?php echo esc_attr( $category ); ?>" />
				<?php endif; ?>
				<?php if ( isset( $_GET['s'] ) && (string) $_GET['s'] !== '' ) : ?>
					<input type="hidden" name="s" value="<?php echo esc_attr( sanitize_text_field( wp_unslash( (string) $_GET['s'] ) ) ); ?>" />
				<?php endif; ?>
				<?php if ( isset( $_GET['orderby'] ) && (string) $_GET['orderby'] !== '' ) : ?>
					<input type="hidden" name="orderby" value="<?php echo esc_attr( sanitize_key( wp_unslash( (string) $_GET['orderby'] ) ) ); ?>" />
				<?php endif; ?>
				<?php if ( isset( $_GET['order'] ) && (string) $_GET['order'] !== '' ) : ?>
					<input type="hidden" name="order" value="<?php echo esc_attr( sanitize_key( wp_unslash( (string) $_GET['order'] ) ) ); ?>" />
				<?php endif; ?>

				<?php $list_table->display(); ?>
			</form>
		<?php
		self::neo_pulse_group_shell_close();
	}

	private static function render_category_filter( string $selected ): void {
		$categories = Neo_Pulse_Wp_Redirects::distinct_categories();
		if ( empty( $categories ) ) {
			return;
		}
		?>
		<label class="screen-reader-text" for="redirect-category-filter"><?php esc_html_e( 'Filter by category', 'neo-pulse-wp' ); ?></label>
		<select name="redirect_category" id="redirect-category-filter">
			<option value=""><?php esc_html_e( 'All categories', 'neo-pulse-wp' ); ?></option>
			<?php foreach ( $categories as $cat ) : ?>
				<option value="<?php echo esc_attr( $cat ); ?>" <?php selected( $selected, $cat ); ?>><?php echo esc_html( $cat ); ?></option>
			<?php endforeach; ?>
		</select>
		<input type="submit" class="button" value="<?php esc_attr_e( 'Filter', 'neo-pulse-wp' ); ?>" />
		<?php
	}

	private static function render_redirect_edit_page(): void {
		$id   = isset( $_GET['id'] ) ? (int) $_GET['id'] : 0;
		$is_new = isset( $_GET['action'] ) && 'new' === sanitize_key( wp_unslash( (string) $_GET['action'] ) );
		$row  = $id > 0 ? Neo_Pulse_Wp_Redirects::get( $id ) : null;
		if ( $id > 0 && ! $row ) {
			wp_die( esc_html__( 'Redirect not found.', 'neo-pulse-wp' ) );
		}

		$settings   = Neo_Pulse_Wp_Redirects::get_settings();
		$categories = Neo_Pulse_Wp_Redirects::distinct_categories();
		self::neo_pulse_group_shell_open( 'neo-pulse-wp-redirects', 'neo-pulse-wp-redirects' );
		?>
			<h2 class="neo-pulse-wp-panel-content__title"><?php echo $is_new ? esc_html__( 'Add Redirect', 'neo-pulse-wp' ) : esc_html__( 'Edit Redirect', 'neo-pulse-wp' ); ?></h2>
			<p><a href="<?php echo esc_url( admin_url( 'admin.php?page=neo-pulse-wp-redirects' ) ); ?>">&larr; <?php esc_html_e( 'Back to list', 'neo-pulse-wp' ); ?></a></p>

			<form method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>" class="neo-pulse-wp-redirects__form">
				<input type="hidden" name="action" value="<?php echo esc_attr( self::ACTION_SAVE_REDIRECT ); ?>" />
				<?php wp_nonce_field( self::ACTION_SAVE_REDIRECT, 'neo_pulse_wp_redirect_nonce' ); ?>
				<input type="hidden" name="redirect_id" value="<?php echo esc_attr( (string) $id ); ?>" />

				<table class="form-table" role="presentation">
					<tr>
						<th scope="row"><label for="redirect_source"><?php esc_html_e( 'Source path', 'neo-pulse-wp' ); ?></label></th>
						<td>
							<input name="redirect_source" id="redirect_source" type="text" class="large-text code" value="<?php echo esc_attr( $row ? (string) $row->source : ( isset( $_GET['source'] ) ? sanitize_text_field( wp_unslash( (string) $_GET['source'] ) ) : '' ) ); ?>" placeholder="blog/old-slug/" required />
							<p class="description"><?php esc_html_e( 'Relative path without leading slash, with trailing slash (e.g. blog/old-slug/).', 'neo-pulse-wp' ); ?></p>
						</td>
					</tr>
					<tr>
						<th scope="row"><label for="redirect_matching"><?php esc_html_e( 'Matching', 'neo-pulse-wp' ); ?></label></th>
						<td>
							<?php
							$matching = $row ? Neo_Pulse_Wp_Redirects::normalize_matching( (string) $row->matching ) : 'exact';
							$match_options = array(
								'exact'    => __( 'Exact', 'neo-pulse-wp' ),
								'contains' => __( 'Contains', 'neo-pulse-wp' ),
								'start'    => __( 'Starts with', 'neo-pulse-wp' ),
								'end'      => __( 'Ends with', 'neo-pulse-wp' ),
								'regex'    => __( 'Regex', 'neo-pulse-wp' ),
							);
							?>
							<select name="redirect_matching" id="redirect_matching">
								<?php foreach ( $match_options as $match_value => $match_label ) : ?>
									<option value="<?php echo esc_attr( $match_value ); ?>" <?php selected( $matching, $match_value ); ?>><?php echo esc_html( $match_label ); ?></option>
								<?php endforeach; ?>
							</select>
							<p>
								<input type="hidden" name="redirect_ignore_case" value="0" />
								<label for="redirect_ignore_case">
									<input name="redirect_ignore_case" id="redirect_ignore_case" type="checkbox" value="1" <?php checked( $row ? ! empty( $row->ignore_case ) : false ); ?> />
									<?php esc_html_e( 'Ignore case', 'neo-pulse-wp' ); ?>
								</label>
							</p>
						</td>
					</tr>
					<tr>
						<th scope="row"><label for="redirect_destination"><?php esc_html_e( 'Destination', 'neo-pulse-wp' ); ?></label></th>
						<td>
							<input name="redirect_destination" id="redirect_destination" type="text" class="large-text code" value="<?php echo esc_attr( $row ? (string) $row->destination : '' ); ?>" placeholder="https://example.com/blog/new-slug/" />
							<p class="description" id="redirect_destination_note"><?php esc_html_e( '410 and 451 do not need a destination; it is ignored for those types.', 'neo-pulse-wp' ); ?></p>
						</td>
					</tr>
					<tr>
						<th scope="row"><label for="redirect_type"><?php esc_html_e( 'Redirect type', 'neo-pulse-wp' ); ?></label></th>
						<td>
							<?php
							$type = $row ? (int) $row->type : (int) $settings['default_type'];
							$type_options = array(
								301 => '301',
								302 => '302',
								307 => '307',
								308 => '308',
								/* translators: HTTP 410 status label */
								410 => __( '410 (Content deleted)', 'neo-pulse-wp' ),
								/* translators: HTTP 451 status label */
								451 => __( '451 (Unavailable for legal reasons)', 'neo-pulse-wp' ),
							);
							?>
							<select name="redirect_type" id="redirect_type">
								<?php foreach ( $type_options as $type_value => $type_label ) : ?>
									<option value="<?php echo esc_attr( (string) $type_value ); ?>" <?php selected( $type, $type_value ); ?>><?php echo esc_html( $type_label ); ?></option>
								<?php endforeach; ?>
							</select>
						</td>
					</tr>
					<tr>
						<th scope="row"><label for="redirect_category"><?php esc_html_e( 'Category', 'neo-pulse-wp' ); ?></label></th>
						<td>
							<input name="redirect_category" id="redirect_category" type="text" class="regular-text" list="neo-pulse-wp-redirect-categories" value="<?php echo esc_attr( $row ? (string) $row->category : __( 'Uncategorized', 'neo-pulse-wp' ) ); ?>" />
							<datalist id="neo-pulse-wp-redirect-categories">
								<?php foreach ( $categories as $cat ) : ?>
									<option value="<?php echo esc_attr( $cat ); ?>"></option>
								<?php endforeach; ?>
							</datalist>
						</td>
					</tr>
					<tr>
						<th scope="row"><label for="redirect_status_field"><?php esc_html_e( 'Status', 'neo-pulse-wp' ); ?></label></th>
						<td>
							<select name="redirect_status_field" id="redirect_status_field">
								<option value="active" <?php selected( $row ? (string) $row->status : 'active', 'active' ); ?>><?php esc_html_e( 'Active', 'neo-pulse-wp' ); ?></option>
								<option value="inactive" <?php selected( $row ? (string) $row->status : '', 'inactive' ); ?>><?php esc_html_e( 'Inactive', 'neo-pulse-wp' ); ?></option>
							</select>
						</td>
					</tr>
				</table>

				<p class="submit">
					<button type="submit" class="button button-primary"><?php esc_html_e( 'Save Redirect', 'neo-pulse-wp' ); ?></button>
					<?php if ( $row ) : ?>
						<a class="button button-link-delete" href="<?php echo esc_url( wp_nonce_url( admin_url( 'admin-post.php?action=' . self::ACTION_DELETE_REDIRECT . '&id=' . (int) $row->id ), self::ACTION_DELETE_REDIRECT, 'neo_pulse_wp_delete_redirect_nonce' ) ); ?>" onclick="return confirm('<?php echo esc_js( __( 'Delete this redirect permanently?', 'neo-pulse-wp' ) ); ?>');"><?php esc_html_e( 'Delete Permanently', 'neo-pulse-wp' ); ?></a>
					<?php endif; ?>
				</p>
			</form>
			<script>
			(function () {
				var type = document.getElementById('redirect_type');
				var dest = document.getElementById('redirect_destination');
				if (!type || !dest) { return; }
				var sync = function () {
					var gone = type.value === '410' || type.value === '451';
					dest.required = !gone;
					dest.disabled = gone;
				};
				type.addEventListener('change', sync);
				sync();
			})();
			</script>
		<?php
		self::neo_pulse_group_shell_close();
	}

	/**
	 * "Import from Rank Math" panel with the one-click import button. Shown on the redirect list
	 * whenever Rank Math has redirects that aren't in Neo Pulse yet, and always on Import & Export.
	 *
	 * @param array<string, mixed> $rank_math From rank_math_database_import_status().
	 * @param bool                 $on_list   Shown on the redirect list (highlighted, with context).
	 */
	private static function render_rank_math_redirect_import_panel( array $rank_math, bool $on_list ): void {
		$pending  = (int) $rank_math['pending_count'];
		$imported = (int) $rank_math['imported_count'];
		?>
		<div class="neo-pulse-wp-redirects__panel<?php echo $on_list ? ' neo-pulse-wp-redirects__panel--rank-math' : ''; ?>">
			<h2><?php esc_html_e( 'Import from Rank Math', 'neo-pulse-wp' ); ?></h2>
			<p>
				<?php
				if ( $pending > 0 ) {
					echo esc_html(
						sprintf(
							/* translators: %d: pending redirect count */
							_n(
								'%d active Rank Math redirect is ready to import.',
								'%d active Rank Math redirects are ready to import.',
								$pending,
								'neo-pulse-wp'
							),
							$pending
						)
					);
					if ( $imported > 0 ) {
						echo ' ' . esc_html(
							sprintf(
								/* translators: %d: redirects already imported */
								_n( '%d is already in Neo Pulse and won\'t be added twice.', '%d are already in Neo Pulse and won\'t be added twice.', $imported, 'neo-pulse-wp' ),
								$imported
							)
						);
					}
					if ( $on_list ) {
						echo ' ' . esc_html__( 'Rank Math stops redirecting once it is deactivated, so bring them across first.', 'neo-pulse-wp' );
					}
				} else {
					esc_html_e( 'Import all active redirects from Rank Math SEO (free or Pro) in one click.', 'neo-pulse-wp' );
				}
				?>
			</p>
			<form method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>">
				<input type="hidden" name="action" value="<?php echo esc_attr( self::ACTION_IMPORT_REDIRECTS_RANK_MATH_DB ); ?>" />
				<?php wp_nonce_field( self::ACTION_IMPORT_REDIRECTS_RANK_MATH_DB, 'neo_pulse_wp_import_redirects_rank_math_db_nonce' ); ?>
				<p><button type="submit" class="button button-primary"><?php esc_html_e( 'Import Rank Math Redirects', 'neo-pulse-wp' ); ?></button></p>
			</form>
		</div>
		<?php
	}

	private static function render_redirect_import_export_page(): void {
		$rank_math = self::rank_math_database_import_status();
		self::neo_pulse_group_shell_open( 'neo-pulse-wp-redirects', 'neo-pulse-wp-redirects' );
		?>
			<h2 class="neo-pulse-wp-panel-content__title"><?php esc_html_e( 'Import & Export', 'neo-pulse-wp' ); ?></h2>

			<?php if ( ! empty( $rank_math['available'] ) ) : ?>
				<?php self::render_rank_math_redirect_import_panel( $rank_math, false ); ?>
			<?php endif; ?>

			<div class="neo-pulse-wp-redirects__panels">
				<div class="neo-pulse-wp-redirects__panel">
					<h2><?php esc_html_e( 'Import CSV', 'neo-pulse-wp' ); ?></h2>
					<p><?php esc_html_e( 'Upload a redirect CSV or the wide optimizer export (must include source and destination columns). Existing source paths are updated; new paths are added.', 'neo-pulse-wp' ); ?></p>
					<p><code>id,source,matching,destination,type,category,status,ignore</code></p>
					<form method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>" enctype="multipart/form-data">
						<input type="hidden" name="action" value="<?php echo esc_attr( self::ACTION_IMPORT_REDIRECTS ); ?>" />
						<?php wp_nonce_field( self::ACTION_IMPORT_REDIRECTS, 'neo_pulse_wp_import_redirects_nonce' ); ?>
						<p><input type="file" name="redirect_csv" accept=".csv,text/csv" required /></p>
						<p><button type="submit" class="button button-primary"><?php esc_html_e( 'Import CSV', 'neo-pulse-wp' ); ?></button></p>
					</form>
				</div>

				<div class="neo-pulse-wp-redirects__panel">
					<h2><?php esc_html_e( 'Export CSV', 'neo-pulse-wp' ); ?></h2>
					<p><?php esc_html_e( 'Download all non-trash redirects as CSV for backup or re-import here.', 'neo-pulse-wp' ); ?></p>
					<form method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>">
						<input type="hidden" name="action" value="<?php echo esc_attr( self::ACTION_EXPORT_REDIRECTS ); ?>" />
						<?php wp_nonce_field( self::ACTION_EXPORT_REDIRECTS, 'neo_pulse_wp_export_redirects_nonce' ); ?>
						<p><button type="submit" class="button button-secondary"><?php esc_html_e( 'Export CSV', 'neo-pulse-wp' ); ?></button></p>
					</form>
				</div>
			</div>
		<?php
		self::neo_pulse_group_shell_close();
	}

	private static function render_redirect_settings_page(): void {
		$settings = Neo_Pulse_Wp_Redirects::get_settings();
		self::neo_pulse_group_shell_open( 'neo-pulse-wp-redirects', 'neo-pulse-wp-redirects' );
		?>
			<h2 class="neo-pulse-wp-panel-content__title"><?php esc_html_e( 'Redirect Settings', 'neo-pulse-wp' ); ?></h2>

			<form method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>">
				<input type="hidden" name="action" value="<?php echo esc_attr( self::ACTION_SAVE_REDIRECT_SETTINGS ); ?>" />
				<?php wp_nonce_field( self::ACTION_SAVE_REDIRECT_SETTINGS, 'neo_pulse_wp_redirect_settings_nonce' ); ?>
				<table class="form-table" role="presentation">
					<tr>
						<th scope="row"><label for="default_redirect_type"><?php esc_html_e( 'Default redirect type', 'neo-pulse-wp' ); ?></label></th>
						<td>
							<select name="default_redirect_type" id="default_redirect_type">
								<option value="301" <?php selected( (int) $settings['default_type'], 301 ); ?>>301</option>
								<option value="302" <?php selected( (int) $settings['default_type'], 302 ); ?>>302</option>
							</select>
							<p class="description"><?php esc_html_e( 'Used for new redirects created in the admin.', 'neo-pulse-wp' ); ?></p>
						</td>
					</tr>
					<tr>
						<th scope="row"><?php esc_html_e( 'Homepage fallback', 'neo-pulse-wp' ); ?></th>
						<td>
							<label for="fallback_home_enabled">
								<input name="fallback_home_enabled" id="fallback_home_enabled" type="checkbox" value="1" <?php checked( ! empty( $settings['fallback_home_enabled'] ) ); ?> />
								<?php esc_html_e( 'Redirect unmatched URLs to the homepage', 'neo-pulse-wp' ); ?>
							</label>
							<p class="description">
								<?php esc_html_e( 'When no user-defined redirect matches, send visitors to the homepage if WordPress would otherwise show a 404. Existing pages and posts are not affected.', 'neo-pulse-wp' ); ?>
							</p>
						</td>
					</tr>
					<tr>
						<th scope="row"><label for="fallback_home_type"><?php esc_html_e( 'Fallback redirect type', 'neo-pulse-wp' ); ?></label></th>
						<td>
							<select name="fallback_home_type" id="fallback_home_type">
								<?php $fallback_type = isset( $settings['fallback_home_type'] ) ? (int) $settings['fallback_home_type'] : (int) $settings['default_type']; ?>
								<option value="301" <?php selected( $fallback_type, 301 ); ?>>301</option>
								<option value="302" <?php selected( $fallback_type, 302 ); ?>>302</option>
							</select>
						</td>
					</tr>
				</table>
				<p class="submit"><button type="submit" class="button button-primary"><?php esc_html_e( 'Save Settings', 'neo-pulse-wp' ); ?></button></p>
			</form>
		<?php
		self::neo_pulse_group_shell_close();
	}
}
