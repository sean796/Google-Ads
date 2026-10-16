<?php
/**
 * GSAP Integration Pro module.
 *
 * @package EMCP_Tools
 * @since   3.16.0
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/** @since 3.16.0 */
class EMCP_Tools_GSAP_Module extends EMCP_Tools_Module {

	const ID             = 'gsap';
	const OPTION_PLUGINS = 'emcp_tools_module_gsap_plugins';
	const OPTION_CONTEXTS = 'emcp_tools_module_gsap_contexts';

	public function id(): string {
		return self::ID;
	}

	public function title(): string {
		return __( 'GSAP Integration', 'emcp-tools' );
	}

	public function description(): string {
		return __( 'Register the complete local GSAP core and plugin suite with WordPress, control each plugin independently, and expose stable handles to pages, themes, plugins, and MCP clients.', 'emcp-tools' );
	}

	public function tier(): string {
		return 'pro';
	}

	/** Modules screen group. */
	public function group(): string {
		return 'content';
	}

	/** Modules screen icon. */
	public function icon(): string {
		return 'wand-sparkles';
	}

	public function default_active(): bool {
		return false;
	}

	public function is_available(): bool {
		return function_exists( 'emcp_tools_fs' ) && emcp_tools_fs()->can_use_premium_code();
	}

	public static function is_enabled(): bool {
		return in_array( self::ID, (array) get_option( EMCP_Tools_Module::OPTION_ACTIVE, array() ), true );
	}

	/** @return array<string,string> */
	public static function context_catalog(): array {
		return array(
			'frontend'         => __( 'Site frontend', 'emcp-tools' ),
			'wp-admin'         => __( 'WordPress admin', 'emcp-tools' ),
			'block-editor'     => __( 'Block editor', 'emcp-tools' ),
			'elementor-editor' => __( 'Elementor editor', 'emcp-tools' ),
		);
	}

	/** @return string[] */
	public static function selected_plugins(): array {
		return EMCP_Tools_GSAP_Assets::dependency_closure( get_option( self::OPTION_PLUGINS, EMCP_Tools_GSAP_Assets::plugin_ids() ) );
	}

	/** @return string[] */
	public static function selected_contexts(): array {
		return self::sanitize_contexts( get_option( self::OPTION_CONTEXTS, array( 'frontend' ) ) );
	}

	/** @param mixed $value @return string[] */
	public static function sanitize_plugins( $value ): array {
		return EMCP_Tools_GSAP_Assets::dependency_closure( $value );
	}

	/** @param mixed $value @return string[] */
	public static function sanitize_contexts( $value ): array {
		$value = is_array( $value ) ? array_values( array_filter( $value, 'is_scalar' ) ) : array();
		$value = array_values( array_unique( array_map( 'sanitize_key', $value ) ) );
		return array_values( array_intersect( array_keys( self::context_catalog() ), $value ) );
	}

	/** Labelled drawer fields (spec 8.4). */
	public function settings_schema(): array {
		$contexts = array();
		foreach ( self::context_catalog() as $value => $label ) {
			$contexts[] = array( 'value' => $value, 'label' => $label );
		}
		$plugins = array();
		foreach ( EMCP_Tools_GSAP_Assets::plugins() as $value => $plugin ) {
			$plugins[] = array( 'value' => $value, 'label' => $plugin['label'], 'description' => $plugin['description'] );
		}
		return array(
			array( 'key' => self::OPTION_CONTEXTS, 'type' => 'checkboxes', 'label' => __( 'Load GSAP in', 'emcp-tools' ), 'choices' => $contexts ),
			array( 'key' => self::OPTION_PLUGINS, 'type' => 'checkboxes', 'label' => __( 'GSAP plugins', 'emcp-tools' ), 'choices' => $plugins ),
		);
	}

	public function settings_fields(): array {
		return array(
			self::OPTION_CONTEXTS => array(
				'type'              => 'array',
				'default'           => array( 'frontend' ),
				'sanitize_callback' => array( __CLASS__, 'sanitize_contexts' ),
			),
			self::OPTION_PLUGINS => array(
				'type'              => 'array',
				'default'           => EMCP_Tools_GSAP_Assets::plugin_ids(),
				'sanitize_callback' => array( __CLASS__, 'sanitize_plugins' ),
			),
		);
	}

	public function register(): void {
		EMCP_Tools_GSAP_Assets::register_scripts();
		$contexts = self::selected_contexts();
		if ( in_array( 'frontend', $contexts, true ) ) {
			add_action( 'wp_enqueue_scripts', array( 'EMCP_Tools_GSAP_Assets', 'enqueue_selected' ), 1 );
		}
		if ( in_array( 'wp-admin', $contexts, true ) ) {
			add_action( 'admin_enqueue_scripts', array( 'EMCP_Tools_GSAP_Assets', 'enqueue_selected' ), 1 );
		}
		if ( in_array( 'block-editor', $contexts, true ) ) {
			add_action( 'enqueue_block_editor_assets', array( 'EMCP_Tools_GSAP_Assets', 'enqueue_selected' ), 1 );
		}
		if ( in_array( 'elementor-editor', $contexts, true ) ) {
			add_action( 'elementor/editor/after_enqueue_scripts', array( 'EMCP_Tools_GSAP_Assets', 'enqueue_selected' ), 1 );
		}
	}

	public function render_settings(): void {
		$contexts = self::selected_contexts();
		$plugins  = self::selected_plugins();
		?>
		<p><?php esc_html_e( 'Choose where GSAP loads. Core is always included in every selected context.', 'emcp-tools' ); ?></p>
		<fieldset>
			<legend><strong><?php esc_html_e( 'Loading contexts', 'emcp-tools' ); ?></strong></legend>
			<input type="hidden" name="<?php echo esc_attr( self::OPTION_CONTEXTS ); ?>[]" value="" />
			<?php foreach ( self::context_catalog() as $id => $label ) : ?>
				<label style="display:block;margin:8px 0;">
					<input type="checkbox" name="<?php echo esc_attr( self::OPTION_CONTEXTS ); ?>[]" value="<?php echo esc_attr( $id ); ?>" <?php checked( in_array( $id, $contexts, true ) ); ?> />
					<?php echo esc_html( $label ); ?>
				</label>
			<?php endforeach; ?>
		</fieldset>

		<fieldset style="margin-top:20px;">
			<legend><strong><?php esc_html_e( 'GSAP plugins', 'emcp-tools' ); ?></strong></legend>
			<p class="description"><?php esc_html_e( 'Required dependencies are loaded automatically. PixiPlugin and EaselPlugin require their third-party runtimes separately.', 'emcp-tools' ); ?></p>
			<input type="hidden" name="<?php echo esc_attr( self::OPTION_PLUGINS ); ?>[]" value="" />
			<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:8px 16px;margin-top:12px;">
				<?php foreach ( EMCP_Tools_GSAP_Assets::plugins() as $id => $plugin ) : ?>
					<label title="<?php echo esc_attr( $plugin['description'] ); ?>">
						<input type="checkbox" name="<?php echo esc_attr( self::OPTION_PLUGINS ); ?>[]" value="<?php echo esc_attr( $id ); ?>" <?php checked( in_array( $id, $plugins, true ) ); ?> />
						<?php echo esc_html( $plugin['label'] ); ?>
					</label>
				<?php endforeach; ?>
			</div>
		</fieldset>
		<p class="description" style="margin-top:20px;">
			<?php echo esc_html( sprintf( /* translators: %s: script handle */ __( 'Theme and plugin code can depend on %s for core or the plugin handles reported by the GSAP MCP read tool.', 'emcp-tools' ), EMCP_Tools_GSAP_Assets::CORE_HANDLE ) ); ?>
		</p>
		<?php
	}
}
