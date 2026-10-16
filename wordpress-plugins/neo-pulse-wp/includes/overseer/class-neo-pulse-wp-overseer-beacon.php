<?php
/**
 * Overseer — builtin Script Manager beacon tag
 *
 * @package Neo_Pulse_Wp
 */

defined( 'ABSPATH' ) || exit;

class Neo_Pulse_Wp_Overseer_Beacon {

	public static function get_builtin_script_id(): int {
		return (int) get_option( Neo_Pulse_Wp_Overseer_Context::BUILTIN_SCRIPT_ID_OPTION, 0 );
	}
	public static function is_builtin_script_id( int $id ): bool {
		$builtin = self::get_builtin_script_id();
		return $builtin > 0 && $builtin === $id;
	}
	public static function is_builtin_protected(): bool {
		return Neo_Pulse_Wp_Overseer_Settings::is_tracking_active();
	}
	public static function beacon_js_url(): string {
		return plugins_url( 'assets/frontend/neo-pulse-overseer.js', NEO_PULSE_WP_PLUGIN_FILE );
	}
	public static function builtin_script_template(): string {
		return "<!-- NEO Pulse Page View Tag (Overseer) — first-party pageview beacon. Do not remove. -->\n"
			. '<script type="application/json" id="' . Neo_Pulse_Wp_Overseer_Context::CONFIG_SCRIPT_ID . '">' . Neo_Pulse_Wp_Overseer_Context::CONFIG_PLACEHOLDER . "</script>\n"
			. '<script src="' . Neo_Pulse_Wp_Overseer_Context::JS_URL_PLACEHOLDER . '"></script>' . "\n";
	}
	public static function resolve_script_placeholders( string $code ): string {
		if ( strpos( $code, Neo_Pulse_Wp_Overseer_Context::CONFIG_PLACEHOLDER ) !== false ) {
			$code = str_replace( Neo_Pulse_Wp_Overseer_Context::CONFIG_PLACEHOLDER, self::beacon_config_json(), $code );
		}
		if ( strpos( $code, Neo_Pulse_Wp_Overseer_Context::JS_URL_PLACEHOLDER ) !== false ) {
			$code = str_replace( Neo_Pulse_Wp_Overseer_Context::JS_URL_PLACEHOLDER, esc_url( self::beacon_js_url() ), $code );
		}
		return $code;
	}
	public static function beacon_config(): array {
		$settings = Neo_Pulse_Wp_Overseer_Settings::get_settings();
		$post_id = 0;
		if ( did_action( 'wp' ) && is_singular() ) {
			$post_id = (int) get_queried_object_id();
		}
		return array(
			'endpoint'            => rest_url( 'neo-pulse/v1/overseer/collect' ),
			// Only checked for logged-in visitors (cached pages carry stale nonces).
			'nonce'               => is_user_logged_in() ? wp_create_nonce( 'wp_rest' ) : '',
			'post_id'             => $post_id,
			'track_interactions'  => ! empty( $settings['track_interactions'] ),
			'track_outbound_only' => ! empty( $settings['track_outbound_only'] ),
		);
	}
	public static function beacon_config_json(): string {
		$json = wp_json_encode(
			self::beacon_config(),
			JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT
		);
		return is_string( $json ) ? $json : '{}';
	}
	public static function is_stub_script_code( string $code ): bool {
		return strpos( $code, 'NEO Pulse Page View Tag (Overseer)' ) !== false
			&& strpos( $code, '<script' ) === false;
	}
	public static function needs_builtin_script_resync( string $code ): bool {
		if ( self::is_stub_script_code( $code ) ) {
			return true;
		}
		return strpos( $code, Neo_Pulse_Wp_Overseer_Context::CONFIG_PLACEHOLDER ) === false
			|| strpos( $code, Neo_Pulse_Wp_Overseer_Context::JS_URL_PLACEHOLDER ) === false;
	}
	public static function has_script_manager_beacon_template(): bool {
		if ( ! class_exists( 'Neo_Pulse_Wp_Script_Manager', false ) ) {
			return false;
		}
		$builtin_id = self::get_builtin_script_id();
		if ( $builtin_id < 1 ) {
			return false;
		}
		$row = Neo_Pulse_Wp_Script_Manager::get( $builtin_id );
		if ( ! $row ) {
			return false;
		}
		$code = isset( $row->code ) ? (string) $row->code : '';
		return ! self::needs_builtin_script_resync( $code );
	}
	public static function maybe_enqueue_beacon_fallback(): void {
		if ( ! Neo_Pulse_Wp_Overseer_Settings::should_load_beacon_on_frontend() ) {
			return;
		}
		if ( self::has_script_manager_beacon_template() ) {
			return;
		}

		$ver = defined( 'NEO_PULSE_WP_VERSION' ) ? NEO_PULSE_WP_VERSION : '1';
		wp_enqueue_script(
			'neo-pulse-overseer',
			self::beacon_js_url(),
			array(),
			$ver,
			true
		);
		wp_localize_script(
			'neo-pulse-overseer',
			'neoPulseOverseer',
			self::beacon_config()
		);
	}
	public static function maybe_upgrade_script_template(): void {
		if ( get_option( Neo_Pulse_Wp_Overseer_Context::SCRIPT_TEMPLATE_OPTION, '1' ) === Neo_Pulse_Wp_Overseer_Context::SCRIPT_TEMPLATE_VERSION ) {
			return;
		}
		update_option( Neo_Pulse_Wp_Overseer_Context::SCRIPT_TEMPLATE_OPTION, Neo_Pulse_Wp_Overseer_Context::SCRIPT_TEMPLATE_VERSION, true );
		if ( self::get_builtin_script_id() > 0 ) {
			self::sync_builtin_script();
		}
	}
	/**
	 * Create or repair the built-in Script Manager tag. Runs on install / plugin version change
	 * (Neo_Pulse_Wp_Overseer_Install::install) and when the Overseer settings are saved, not on
	 * every request.
	 */
	public static function ensure_builtin_script(): void {
		if ( ! class_exists( 'Neo_Pulse_Wp_Script_Manager', false ) ) {
			return;
		}

		$by_name = Neo_Pulse_Wp_Script_Manager::get_by_name( Neo_Pulse_Wp_Overseer_Context::BUILTIN_SCRIPT_NAME );
		if ( $by_name ) {
			$canonical_id = (int) $by_name->id;
			if ( self::get_builtin_script_id() !== $canonical_id ) {
				update_option( Neo_Pulse_Wp_Overseer_Context::BUILTIN_SCRIPT_ID_OPTION, $canonical_id, true );
			}
			self::maybe_sync_builtin_script();
			self::maybe_upgrade_script_template();
			return;
		}

		$result = Neo_Pulse_Wp_Script_Manager::save(
			array(
				'name'          => Neo_Pulse_Wp_Overseer_Context::BUILTIN_SCRIPT_NAME,
				'placement'     => 'footer',
				'code'          => self::builtin_script_template(),
				'priority'      => 5,
				'category'      => Neo_Pulse_Wp_Overseer_Context::BUILTIN_SCRIPT_CATEGORY,
				'status'        => Neo_Pulse_Wp_Overseer_Settings::is_tracking_active() ? 'active' : 'inactive',
				'display_rules' => Neo_Pulse_Wp_Script_Manager_Rules::defaults(),
			)
		);

		if ( ! empty( $result['ok'] ) && ! empty( $result['id'] ) ) {
			update_option( Neo_Pulse_Wp_Overseer_Context::BUILTIN_SCRIPT_ID_OPTION, (int) $result['id'], true );
			self::sync_builtin_script();
		}
	}
	public static function maybe_sync_builtin_script(): void {
		$builtin_id = self::get_builtin_script_id();
		if ( $builtin_id < 1 ) {
			return;
		}
		$row = Neo_Pulse_Wp_Script_Manager::get( $builtin_id );
		if ( ! $row ) {
			return;
		}
		$existing = isset( $row->code ) ? (string) $row->code : '';
		if ( self::needs_builtin_script_resync( $existing ) ) {
			self::sync_builtin_script();
		}
	}
	public static function sync_builtin_script(): void {
		$builtin_id = self::get_builtin_script_id();
		if ( $builtin_id < 1 ) {
			return;
		}
		$row = Neo_Pulse_Wp_Script_Manager::get( $builtin_id );
		if ( ! $row ) {
			return;
		}

		Neo_Pulse_Wp_Script_Manager::save(
			array(
				'id'            => $builtin_id,
				'name'          => Neo_Pulse_Wp_Overseer_Context::BUILTIN_SCRIPT_NAME,
				'placement'     => 'footer',
				'code'          => self::builtin_script_template(),
				'priority'      => 5,
				'category'      => Neo_Pulse_Wp_Overseer_Context::BUILTIN_SCRIPT_CATEGORY,
				'status'        => Neo_Pulse_Wp_Overseer_Settings::is_tracking_active() ? 'active' : 'inactive',
				'display_rules' => Neo_Pulse_Wp_Script_Manager_Rules::decode( isset( $row->display_rules ) ? (string) $row->display_rules : '' ),
			)
		);
	}
	public static function is_overseer_tag_row( $row ): bool {
		if ( ! is_object( $row ) ) {
			return false;
		}
		if ( self::is_builtin_script_id( (int) $row->id ) ) {
			return true;
		}
		$name = isset( $row->name ) ? Neo_Pulse_Wp_Script_Manager::normalize_name( (string) $row->name ) : '';
		return $name === Neo_Pulse_Wp_Overseer_Context::BUILTIN_SCRIPT_NAME;
	}
	/**
	 * Filter: neo_pulse_wp_script_manager_render_code.
	 *
	 * @param mixed $code Script code.
	 * @param mixed $row  Script row.
	 */
	public static function filter_script_code( $code, $row ): string {
		$code = is_scalar( $code ) ? (string) $code : '';
		if ( is_object( $row ) && self::is_overseer_tag_row( $row ) ) {
			if ( ! Neo_Pulse_Wp_Overseer_Settings::is_tracking_active() ) {
				return '';
			}
			$canonical_id = (int) $row->id;
			if ( self::get_builtin_script_id() !== $canonical_id ) {
				update_option( Neo_Pulse_Wp_Overseer_Context::BUILTIN_SCRIPT_ID_OPTION, $canonical_id, true );
			}
			$template = self::needs_builtin_script_resync( $code )
				? self::builtin_script_template()
				: $code;
			return self::resolve_script_placeholders( $template );
		}

		if ( strpos( $code, Neo_Pulse_Wp_Overseer_Context::CONFIG_PLACEHOLDER ) === false
			&& strpos( $code, Neo_Pulse_Wp_Overseer_Context::JS_URL_PLACEHOLDER ) === false ) {
			return $code;
		}
		if ( ! Neo_Pulse_Wp_Overseer_Settings::is_tracking_active() ) {
			return $code;
		}
		return self::resolve_script_placeholders( $code );
	}
}
