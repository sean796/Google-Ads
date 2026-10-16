<?php
/**
 * Content type switch admin UI (hidden list column + Bulk Edit box).
 *
 * @package Neo_Pulse_Wp
 */

defined( 'ABSPATH' ) || exit;

trait Neo_Pulse_Wp_Admin_Trait_Content_Tools_Ui {

	const CONTENT_TYPE_COLUMN = 'neo-pulse_content_type';

	public static function register_content_tools_ui(): void {
		add_action( 'admin_init', array( __CLASS__, 'register_content_tools_list_hooks' ) );
		add_action( 'bulk_edit_custom_box', array( __CLASS__, 'render_bulk_edit_content_type_box' ), 10, 2 );
		add_action( 'admin_enqueue_scripts', array( __CLASS__, 'enqueue_content_tools_assets' ) );
	}

	public static function register_content_tools_list_hooks(): void {
		add_filter( 'default_hidden_columns', array( __CLASS__, 'hide_content_type_column' ), 10, 2 );
		foreach ( array_keys( Neo_Pulse_Wp_Content_Tools::get_switchable_post_types() ) as $post_type ) {
			add_filter( "manage_{$post_type}_posts_columns", array( __CLASS__, 'add_content_type_column' ) );
			add_action( "manage_{$post_type}_posts_custom_column", array( __CLASS__, 'render_content_type_column' ), 10, 2 );
		}
	}

	/**
	 * Hidden column so bulk_edit_custom_box fires (WordPress skips core columns).
	 *
	 * @param array<string, string>|mixed $columns Columns.
	 * @return array<string, string>|mixed
	 */
	public static function add_content_type_column( $columns ) {
		if ( ! is_array( $columns ) ) {
			return $columns;
		}
		$columns[ self::CONTENT_TYPE_COLUMN ] = __( 'Content type', 'neo-pulse-wp' );
		return $columns;
	}

	/**
	 * @param string|mixed $column  Column key.
	 * @param int|mixed    $post_id Post ID (unused).
	 */
	public static function render_content_type_column( $column, $post_id ): void {
		unset( $post_id );
		if ( (string) $column !== self::CONTENT_TYPE_COLUMN ) {
			return;
		}
		echo '&mdash;';
	}

	/**
	 * @param string[]|mixed  $hidden Hidden columns.
	 * @param WP_Screen|mixed $screen Screen.
	 * @return string[]|mixed
	 */
	public static function hide_content_type_column( $hidden, $screen ) {
		if ( ! is_array( $hidden ) || ! $screen instanceof WP_Screen ) {
			return $hidden;
		}
		if ( $screen->base === 'edit' && Neo_Pulse_Wp_Content_Tools::is_switchable_post_type( (string) $screen->post_type ) ) {
			$hidden[] = self::CONTENT_TYPE_COLUMN;
		}
		return $hidden;
	}

	/**
	 * @param string|mixed $column_name List table column.
	 * @param string|mixed $post_type   Post type slug.
	 */
	public static function render_bulk_edit_content_type_box( $column_name, $post_type ): void {
		$post_type = is_string( $post_type ) ? $post_type : '';
		if ( (string) $column_name !== self::CONTENT_TYPE_COLUMN ) {
			return;
		}
		if ( ! Neo_Pulse_Wp_Content_Tools::is_switchable_post_type( $post_type ) ) {
			return;
		}

		$types = Neo_Pulse_Wp_Content_Tools::get_switchable_post_types();
		?>
		<fieldset class="inline-edit-col-right neo-pulse-content-tools-bulk-edit">
			<div class="inline-edit-col column-<?php echo esc_attr( self::CONTENT_TYPE_COLUMN ); ?>">
				<label class="inline-edit-group">
					<span class="title"><?php esc_html_e( 'Content type', 'neo-pulse-wp' ); ?></span>
					<select name="neo-pulse_new_post_type">
						<option value="-1"><?php esc_html_e( 'No Change', 'neo-pulse-wp' ); ?></option>
						<?php foreach ( $types as $slug => $type_obj ) : ?>
							<option value="<?php echo esc_attr( $slug ); ?>">
								<?php echo esc_html( $type_obj->labels->singular_name ?? $slug ); ?>
							</option>
						<?php endforeach; ?>
					</select>
				</label>
			</div>
		</fieldset>
		<?php
	}

	/**
	 * @param string|mixed $hook Current admin page hook.
	 */
	public static function enqueue_content_tools_assets( $hook ): void {
		if ( $hook !== 'edit.php' ) {
			return;
		}
		$screen = function_exists( 'get_current_screen' ) ? get_current_screen() : null;
		if ( ! $screen || $screen->base !== 'edit' ) {
			return;
		}
		$post_type = (string) ( $screen->post_type ?? '' );
		if ( ! Neo_Pulse_Wp_Content_Tools::is_switchable_post_type( $post_type ) ) {
			return;
		}
		wp_enqueue_style(
			'neo-pulse-wp-content-tools',
			plugins_url( 'assets/admin/content-tools.css', NEO_PULSE_WP_PLUGIN_FILE ),
			array(),
			NEO_PULSE_WP_VERSION
		);
	}
}
