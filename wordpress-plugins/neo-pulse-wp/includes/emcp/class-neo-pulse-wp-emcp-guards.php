<?php
/**
 * Neo EMCP Server Ownership, Category Discovery, and Secret Guards.
 *
 * Implements the server-side rules in EMCP-INTEGRATION-HANDOFF.md:
 * 1. Auto-discovers abilities in categories `neo-pulse` and `neo-tools` via `wp_get_abilities()`.
 * 2. Applies the `neo_mcp_ability_names` filter seam so plugins can customize the server list.
 * 3. Blocks generic EMCP tools (`update-settings`, `insert-row`, `update-rows`, `delete-rows`,
 *    `activate-plugin`) from side-stepping `neo-pulse/write` or `neo-tools/write` on owned data
 *    or reactivating plugins replaced by active Neo Tools modules.
 * 4. Masks secret keys in any read output (`set` / `not set` and at most the last 4 characters).
 *
 * @package Neo_Pulse_Wp
 */

defined( 'ABSPATH' ) || exit;

final class Neo_Pulse_Wp_Emcp_Guards {

	/** Secret option names that must never be written via MCP or returned in plain text. */
	const SECRET_OPTIONS = array(
		'neo_pulse_wp_site_key',
		'neo_pulse_wp_license_state',
		'neo_pulse_wp_lock',
		'ndet_site_key',
		'ndet_license',
		'ndet_google_api_key',
		'neo_pulse_openrouter_api_key',
		'neo_pulse_dataforseo_password',
		'neo_pulse_gsc_service_account_json',
		'neo_pulse_gmb_client_secret',
	);

	/** Options owned by Neo Pulse or Neo Tools that generic option tools must not write raw. */
	const OWNED_OPTIONS = array(
		'neo_business_details' => 'neo-pulse/write or neo-tools/write (operation: update-business-details)',
		'neo_pulse_wp_seo'     => 'neo-pulse/write (operation: update-settings or set-type-rules)',
		'ndet_svg_uploads'     => 'neo-tools/write (operation: update-settings)',
		'ndet_disable_comments'=> 'neo-tools/write (operation: update-settings)',
		'ndet_duplicator'      => 'neo-tools/write (operation: update-settings)',
		'ndet_mega_menu'       => 'neo-tools/write (operation: update-settings)',
		'ndet_media_folders'   => 'neo-tools/write (operation: update-settings)',
		'ndet_modern_admin'    => 'neo-tools/write (operation: update-settings)',
		'ndet_custom_fields'   => 'neo-tools/write (operation: update-settings)',
		'ndet_cf_engine'       => 'neo-tools/write (operation: update-settings)',
		'ndet_cf_options_pages'=> 'neo-tools/write',
		'ndet_cf_db'           => 'neo-tools/write',
	);

	public static function init(): void {
		add_filter( 'emcp_tools_ability_names', array( __CLASS__, 'filter_ability_names' ), 50 );
		add_filter( 'emcp_tools_before_write', array( __CLASS__, 'guard_before_write' ), 10, 3 );
		add_filter( 'emcp_tools_after_execute', array( __CLASS__, 'redact_secrets_after_execute' ), 10, 4 );
	}

	/**
	 * Pick up all registered abilities in `neo-pulse` and `neo-tools` categories
	 * and apply `neo_mcp_ability_names`.
	 *
	 * @param array<int,string>|mixed $names Existing ability names.
	 * @return array<int,string>
	 */
	public static function filter_ability_names( $names ): array {
		$names = is_array( $names ) ? $names : array();

		if ( function_exists( 'wp_get_abilities' ) ) {
			$pulse_on = ! class_exists( 'Neo_Pulse_Wp_Mcp', false ) || Neo_Pulse_Wp_Mcp::enabled();
			$tools_on = ! in_array( strtolower( trim( (string) get_option( 'ndet_mcp', '1' ) ) ), array( '0', 'off', 'false', 'no' ), true );

			foreach ( (array) wp_get_abilities() as $ability ) {
				if ( ! is_object( $ability ) || ! method_exists( $ability, 'get_name' ) ) {
					continue;
				}
				$cat  = method_exists( $ability, 'get_category' ) ? (string) $ability->get_category() : '';
				$name = (string) $ability->get_name();
				if ( 'neo-pulse' === $cat ) {
					if ( $pulse_on && ! in_array( $name, $names, true ) ) {
						$names[] = $name;
					} elseif ( ! $pulse_on ) {
						$names = array_values( array_diff( $names, array( $name ) ) );
					}
				} elseif ( 'neo-tools' === $cat ) {
					if ( $tools_on && ! in_array( $name, $names, true ) ) {
						$names[] = $name;
					} elseif ( ! $tools_on ) {
						$names = array_values( array_diff( $names, array( $name ) ) );
					}
				}
			}
		}

		/**
		 * Filter the MCP ability names exposed by Neo EMCP.
		 *
		 * @param string[] $names Ability names.
		 */
		$filtered = apply_filters( 'neo_mcp_ability_names', $names );
		return is_array( $filtered ) ? array_values( array_unique( array_filter( $filtered, 'is_string' ) ) ) : $names;
	}

	/**
	 * Block generic EMCP tools from writing plugin-owned options, tables, or replaced plugins.
	 *
	 * @param null|WP_Error       $veto  Existing veto.
	 * @param string              $name  Ability name.
	 * @param array<string,mixed> $input Ability input.
	 * @return null|WP_Error
	 */
	public static function guard_before_write( $veto, string $name, array $input ) {
		if ( is_wp_error( $veto ) ) {
			return $veto;
		}

		// 1. Generic option writes.
		if ( 'emcp-tools/update-settings' === $name ) {
			$settings = isset( $input['settings'] ) && is_array( $input['settings'] ) ? $input['settings'] : $input;
			foreach ( array_keys( $settings ) as $opt_key ) {
				$opt_key = (string) $opt_key;
				$err     = self::check_option_write_allowed( $opt_key );
				if ( is_wp_error( $err ) ) {
					return $err;
				}
			}
		}

		// 2. Generic database writes.
		if ( in_array( $name, array( 'emcp-tools/insert-row', 'emcp-tools/update-rows', 'emcp-tools/delete-rows' ), true ) ) {
			$table = isset( $input['table'] ) ? strtolower( trim( (string) $input['table'] ) ) : '';
			$err   = self::check_table_write_allowed( $table, $input );
			if ( is_wp_error( $err ) ) {
				return $err;
			}
		}

		// 3. Plugin activation side-effects (Neo Tools replaced plugins).
		if ( 'emcp-tools/activate-plugin' === $name ) {
			$plugin = isset( $input['plugin'] ) ? strtolower( trim( (string) $input['plugin'] ) ) : '';
			$err    = self::check_plugin_activation_allowed( $plugin );
			if ( is_wp_error( $err ) ) {
				return $err;
			}
		}

		return null;
	}

	/**
	 * Check whether a generic tool is allowed to write an option key.
	 *
	 * @return true|WP_Error
	 */
	public static function check_option_write_allowed( string $opt_key ) {
		if ( in_array( $opt_key, self::SECRET_OPTIONS, true ) ) {
			return new WP_Error(
				'forbidden',
				sprintf( 'Option "%s" holds licence or API credentials and cannot be modified through MCP.', $opt_key ),
				array( 'status' => 403 )
			);
		}
		if ( isset( self::OWNED_OPTIONS[ $opt_key ] ) ) {
			return new WP_Error(
				'owned_by_neo_plugin',
				sprintf( 'Option "%s" is owned by Neo Pulse / Neo Tools. Use %s instead of writing the option raw.', $opt_key, self::OWNED_OPTIONS[ $opt_key ] ),
				array( 'status' => 400 )
			);
		}
		if ( 0 === strpos( $opt_key, 'options_ci_' ) ) {
			return new WP_Error(
				'owned_by_neo_plugin',
				sprintf( 'Option "%s" is bridged to the shared business details. Use neo-pulse/write or neo-tools/write (update-business-details) instead.', $opt_key ),
				array( 'status' => 400 )
			);
		}
		if ( 0 === strpos( $opt_key, 'ndet_gr_data_' ) ) {
			return new WP_Error(
				'owned_by_neo_plugin',
				'Google reviews cache options (ndet_gr_data_*) are managed by Neo Tools and cannot be edited directly.',
				array( 'status' => 400 )
			);
		}
		return true;
	}

	/**
	 * Check whether a generic DB row tool is allowed to write to a table.
	 *
	 * @param string              $table Table name.
	 * @param array<string,mixed> $input Tool input.
	 * @return true|WP_Error
	 */
	public static function check_table_write_allowed( string $table, array $input ) {
		global $wpdb;
		$prefix = isset( $wpdb->prefix ) ? strtolower( (string) $wpdb->prefix ) : 'wp_';
		$short  = 0 === strpos( $table, $prefix ) ? substr( $table, strlen( $prefix ) ) : $table;

		$owned_tables = array(
			'ndet_links',
			'ndet_linkmeta',
			'neo_pulse_redirects',
			'neo_pulse_scripts',
			'neo_pulse_seo_404',
		);
		if ( in_array( $short, $owned_tables, true ) ) {
			return new WP_Error(
				'owned_by_neo_plugin',
				sprintf( 'Table "%s" is owned by Neo Pulse / Neo Tools. Use the plugin MCP tools instead of direct table writes.', $table ),
				array( 'status' => 400 )
			);
		}

		if ( 'options' === $short ) {
			$data = isset( $input['data'] ) && is_array( $input['data'] ) ? $input['data'] : array();
			$whr  = isset( $input['where'] ) && is_array( $input['where'] ) ? $input['where'] : array();
			$opt  = (string) ( $data['option_name'] ?? $whr['option_name'] ?? '' );
			if ( '' !== $opt ) {
				return self::check_option_write_allowed( $opt );
			}
		}

		return true;
	}

	/**
	 * Prevent reactivating plugins that an active Neo Tools module replaces.
	 *
	 * @return true|WP_Error
	 */
	public static function check_plugin_activation_allowed( string $plugin ) {
		if ( '' === $plugin ) {
			return true;
		}
		if ( function_exists( 'ndet_replaced_plugin_rules' ) ) {
			foreach ( (array) ndet_replaced_plugin_rules() as $rule ) {
				if ( ! is_array( $rule ) || empty( $rule['option'] ) || empty( $rule['plugins'] ) ) {
					continue;
				}
				if ( '1' !== (string) get_option( (string) $rule['option'], '0' ) ) {
					continue;
				}
				foreach ( (array) $rule['plugins'] as $slug_or_file ) {
					if ( false !== stripos( $plugin, (string) $slug_or_file ) ) {
						$label = (string) ( $rule['label'] ?? $rule['option'] );
						return new WP_Error(
							'conflict',
							sprintf( 'Refused: "%s" is replaced by Neo Tools (%s), which is currently switched on. Switch off %s in Neo Tools first if you need this plugin.', $plugin, $label, $label ),
							array( 'status' => 409 )
						);
					}
				}
			}
		}

		$fallback_rules = array(
			'ndet_svg_uploads'      => array(
				'label'   => 'SVG uploads',
				'matches' => array( 'safe-svg', 'svg-support', 'enable-svg-uploads' ),
			),
			'ndet_disable_comments' => array(
				'label'   => 'Disable comments',
				'matches' => array( 'disable-comments' ),
			),
			'ndet_duplicator'       => array(
				'label'   => 'Duplicator (Duplicate post)',
				'matches' => array( 'duplicate-post', 'duplicate-page', 'post-duplicator' ),
			),
		);
		foreach ( $fallback_rules as $opt => $rule ) {
			if ( '1' !== (string) get_option( $opt, '0' ) ) {
				continue;
			}
			foreach ( $rule['matches'] as $needle ) {
				if ( false !== stripos( $plugin, $needle ) ) {
					return new WP_Error(
						'conflict',
						sprintf( 'Refused: "%s" is covered by Neo Tools (%s), which is currently switched on.', $plugin, $rule['label'] ),
						array( 'status' => 409 )
					);
				}
			}
		}

		return true;
	}

	/**
	 * Mask secret option values in any ability response.
	 *
	 * @param mixed               $result   Ability result.
	 * @param string              $name     Ability name.
	 * @param array<string,mixed> $input    Ability input.
	 * @param bool                $readonly Whether ability is readonly.
	 * @return mixed
	 */
	public static function redact_secrets_after_execute( $result, string $name, array $input, bool $readonly ) {
		unset( $name, $input, $readonly );
		if ( ! is_array( $result ) ) {
			return $result;
		}
		return self::redact_array_recursive( $result );
	}

	/**
	 * @param array<int|string,mixed> $data
	 * @return array<int|string,mixed>
	 */
	private static function redact_array_recursive( array $data ): array {
		foreach ( $data as $k => $v ) {
			if ( is_string( $k ) && in_array( $k, self::SECRET_OPTIONS, true ) ) {
				$data[ $k ] = self::mask_secret_value( $v );
				continue;
			}
			if ( is_array( $v ) ) {
				if ( isset( $v['option_name'] ) && is_string( $v['option_name'] ) && in_array( $v['option_name'], self::SECRET_OPTIONS, true ) && array_key_exists( 'option_value', $v ) ) {
					$v['option_value'] = self::mask_secret_value( $v['option_value'] );
				}
				$data[ $k ] = self::redact_array_recursive( $v );
			}
		}
		return $data;
	}

	/**
	 * Mask a secret value to "set (****1234)" or "not set".
	 *
	 * @param mixed $val Raw secret.
	 */
	public static function mask_secret_value( $val ): string {
		if ( is_array( $val ) || is_object( $val ) ) {
			return empty( (array) $val ) ? 'not set' : 'set';
		}
		$str = trim( (string) $val );
		if ( '' === $str ) {
			return 'not set';
		}
		if ( strlen( $str ) <= 4 ) {
			return 'set';
		}
		return 'set (****' . substr( $str, -4 ) . ')';
	}
}
