<?php
/**
 * Hub parity: export/import allowlisted neo-pulse-data JSON (Google Ads tokens, etc.).
 *
 * @package Neo_Pulse_App
 */

defined( 'ABSPATH' ) || exit;

class Neo_Pulse_App_Hub_Data_Sync {

	/** @var array<string,callable():string> */
	private const KEY_TO_PATH = array(
		'google-ads-tokens' => array( Neo_Pulse_App_Data_Paths::class, 'google_ads_tokens_path' ),
		'google-ads-api'    => array( Neo_Pulse_App_Data_Paths::class, 'google_ads_api_path' ),
		'google-ads-oauth'  => array( Neo_Pulse_App_Data_Paths::class, 'google_ads_oauth_config_path' ),
		'gmb-oauth'         => array( Neo_Pulse_App_Data_Paths::class, 'gmb_oauth_config_path' ),
	);

	public static function require_sync_token(): bool {
		$expected = self::sync_token();
		if ( $expected === '' && self::allow_open_local_export() ) {
			return true;
		}
		if ( $expected === '' ) {
			Neo_Pulse_App_Api_Dispatcher::send_json(
				array(
					'ok'    => false,
					'error' => 'PULSE_HOST_API_TOKEN is not configured.',
				),
				503
			);
			return false;
		}
		$sent = isset( $_SERVER['HTTP_X_PULSE_HOST_API_TOKEN'] )
			? trim( (string) wp_unslash( $_SERVER['HTTP_X_PULSE_HOST_API_TOKEN'] ) )
			: '';
		if ( $sent === '' || ! hash_equals( $expected, $sent ) ) {
			Neo_Pulse_App_Api_Dispatcher::send_json(
				array(
					'ok'    => false,
					'error' => 'Unauthorized.',
				),
				401
			);
			return false;
		}
		return true;
	}

	private static function is_hub_container(): bool {
		if ( defined( 'NEO_PULSE_HUB' ) && (string) NEO_PULSE_HUB === '1' ) {
			return true;
		}
		return trim( (string) getenv( 'NEO_PULSE_HUB' ) ) === '1';
	}

	private static function allow_open_local_export(): bool {
		return ! self::is_hub_container();
	}

	/**
	 * @param array<string,mixed> $body
	 */
	public static function export( array $body ): void {
		if ( ! self::require_sync_token() ) {
			return;
		}
		$key = isset( $body['key'] ) ? trim( (string) $body['key'] ) : '';
		if ( $key === '' || ! isset( self::KEY_TO_PATH[ $key ] ) ) {
			Neo_Pulse_App_Api_Dispatcher::send_json(
				array(
					'ok'    => false,
					'error' => 'Invalid or missing key.',
				),
				400
			);
			return;
		}

		$data = null;
		if ( $key === 'google-ads-tokens' ) {
			$data = Neo_Pulse_App_Google_Ads_Tokens::get_tokens();
		}
		if ( $data === null ) {
			$path = call_user_func( self::KEY_TO_PATH[ $key ] );
			$data = Neo_Pulse_App_Json_File_Store::read( $path );
		}
		if ( $key === 'gmb-oauth' && ( ! is_array( $data ) || empty( $data['clientId'] ) ) ) {
			$data = Neo_Pulse_App_Gmb_Oauth::load_config_for_tokens();
		}

		if ( ! is_array( $data ) || $data === array() ) {
			Neo_Pulse_App_Api_Dispatcher::send_json(
				array(
					'ok'    => false,
					'error' => 'No data for key.',
				),
				404
			);
			return;
		}

		Neo_Pulse_App_Api_Dispatcher::send_json(
			array(
				'ok'   => true,
				'key'  => $key,
				'data' => $data,
			)
		);
	}

	/**
	 * @param array<string,mixed> $body
	 */
	public static function import( array $body ): void {
		if ( ! self::require_sync_token_for_import() ) {
			return;
		}
		$key = isset( $body['key'] ) ? trim( (string) $body['key'] ) : '';
		$data = isset( $body['data'] ) && is_array( $body['data'] ) ? $body['data'] : null;
		if ( $key === '' || ! isset( self::KEY_TO_PATH[ $key ] ) || $data === null ) {
			Neo_Pulse_App_Api_Dispatcher::send_json(
				array(
					'ok'    => false,
					'error' => 'Invalid key or missing data object.',
				),
				400
			);
			return;
		}

		if ( $key === 'google-ads-tokens' ) {
			Neo_Pulse_App_Google_Ads_Tokens::save_tokens( $data );
			Neo_Pulse_App_Api_Dispatcher::send_json( array( 'ok' => true, 'key' => $key ) );
			return;
		}

		$path    = call_user_func( self::KEY_TO_PATH[ $key ] );
		$written = Neo_Pulse_App_Json_File_Store::write( $path, $data );
		if ( ! $written ) {
			Neo_Pulse_App_Api_Dispatcher::send_json(
				array(
					'ok'    => false,
					'error' => 'Could not write file.',
				),
				500
			);
			return;
		}
		if ( $key === 'gmb-oauth' && class_exists( 'Neo_Pulse_App_Gmb_Oauth' ) ) {
			Neo_Pulse_App_Gmb_Oauth::reload_config();
		}
		if ( $key === 'google-ads-oauth' && class_exists( 'Neo_Pulse_App_Google_Ads_Oauth' ) ) {
			Neo_Pulse_App_Google_Ads_Oauth::reload_config();
		}

		Neo_Pulse_App_Api_Dispatcher::send_json( array( 'ok' => true, 'key' => $key ) );
	}

	private static function sync_token(): string {
		if ( defined( 'PULSE_HOST_API_TOKEN' ) && is_string( PULSE_HOST_API_TOKEN ) ) {
			return trim( PULSE_HOST_API_TOKEN );
		}
		return trim( (string) getenv( 'PULSE_HOST_API_TOKEN' ) );
	}

	private static function require_sync_token_for_import(): bool {
		$expected = self::sync_token();
		if ( $expected === '' ) {
			Neo_Pulse_App_Api_Dispatcher::send_json(
				array(
					'ok'    => false,
					'error' => 'PULSE_HOST_API_TOKEN is not configured.',
				),
				503
			);
			return false;
		}
		$sent = isset( $_SERVER['HTTP_X_PULSE_HOST_API_TOKEN'] )
			? trim( (string) wp_unslash( $_SERVER['HTTP_X_PULSE_HOST_API_TOKEN'] ) )
			: '';
		if ( $sent === '' || ! hash_equals( $expected, $sent ) ) {
			Neo_Pulse_App_Api_Dispatcher::send_json(
				array(
					'ok'    => false,
					'error' => 'Unauthorized.',
				),
				401
			);
			return false;
		}
		return true;
	}
}
