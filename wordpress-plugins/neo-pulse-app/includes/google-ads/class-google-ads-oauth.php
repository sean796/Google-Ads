<?php
/**
 * Google Ads OAuth (reuses Drive/GMB Cloud client; own redirect and tokens).
 *
 * @package Neo_Pulse_App
 */

defined( 'ABSPATH' ) || exit;

class Neo_Pulse_App_Google_Ads_Oauth {

	const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
	const GOOGLE_AUTH_URL  = 'https://accounts.google.com/o/oauth2/v2/auth';
	const ADS_SCOPE        = 'https://www.googleapis.com/auth/adwords';
	const TOKENINFO_URL    = 'https://www.googleapis.com/oauth2/v2/tokeninfo';

	/** @var array<string,string>|null */
	private static $config_cache = null;

	public static function reload_config(): void {
		self::$config_cache = null;
	}

	public static function is_configured(): bool {
		$config = self::load_config();
		return $config['clientId'] !== '' && $config['clientSecret'] !== '' && $config['redirectUri'] !== '';
	}

	public static function redirect_uri(): string {
		if ( defined( 'NEO_PULSE_APP_GOOGLE_ADS_REDIRECT_URI' ) ) {
			$override = trim( (string) NEO_PULSE_APP_GOOGLE_ADS_REDIRECT_URI );
			if ( $override !== '' ) {
				return $override;
			}
		}
		return home_url( '/api/google-ads/callback' );
	}

	public static function frontend_url_default(): string {
		return home_url( '/neo-pulse/' );
	}

	public static function frontend_url(): string {
		$config = self::load_config();
		return $config['frontendUrl'] !== '' ? $config['frontendUrl'] : self::frontend_url_default();
	}

	/**
	 * @return array{configured:bool,hasClientId:bool,clientId:string,redirectUri:string,frontendUrl:string,hasDeveloperToken:bool,authUrl:string}
	 */
	public static function config_status(): array {
		$config     = self::load_config();
		$configured = self::is_configured();
		$auth_url   = '';
		if ( $configured ) {
			try {
				$auth_url = self::get_auth_url();
			} catch ( Exception $e ) {
				unset( $e );
			}
		}
		return array(
			'configured'         => $configured,
			'hasClientId'        => $config['clientId'] !== '',
			'clientId'           => $config['clientId'],
			'redirectUri'        => $config['redirectUri'],
			'frontendUrl'        => self::frontend_url(),
			'hasDeveloperToken'  => Neo_Pulse_App_Google_Ads_Credentials::developer_token() !== '',
			'hasMccId'           => Neo_Pulse_App_Google_Ads_Credentials::mcc_id() !== '',
			'mccId'              => Neo_Pulse_App_Google_Ads_Credentials::mcc_id(),
			'authUrl'            => $auth_url,
		);
	}

	/**
	 * @param array<string,mixed> $body
	 * @return array{statusCode:int,body:array<string,mixed>}
	 */
	public static function test_and_save( array $body ): array {
		if ( self::is_production_save_blocked() ) {
			return array(
				'statusCode' => 403,
				'body'       => array(
					'success' => false,
					'error'   => 'Saving Google Ads config from the UI is only allowed locally. On production, set NEO_PULSE_APP_GOOGLE_ADS_MCC_ID and reuse the existing Drive / Business Profile OAuth client.',
				),
			);
		}
		$developer_token = isset( $body['developerToken'] ) ? trim( (string) $body['developerToken'] ) : '';
		$mcc_id          = isset( $body['mccId'] ) ? trim( (string) $body['mccId'] ) : '';
		if ( $developer_token !== '' || $mcc_id !== '' ) {
			$saved = Neo_Pulse_App_Google_Ads_Credentials::save_api_credentials(
				$developer_token !== '' ? $developer_token : Neo_Pulse_App_Google_Ads_Credentials::developer_token(),
				$mcc_id !== '' ? $mcc_id : Neo_Pulse_App_Google_Ads_Credentials::mcc_id()
			);
			if ( empty( $saved['ok'] ) ) {
				return array(
					'statusCode' => 400,
					'body'       => array( 'success' => false, 'error' => (string) ( $saved['error'] ?? 'Could not save Google Ads API credentials.' ) ),
				);
			}
		}
		if ( Neo_Pulse_App_Google_Ads_Credentials::mcc_id() === '' ) {
			return array(
				'statusCode' => 400,
				'body'       => array( 'success' => false, 'error' => 'Paste the MCC ID (393-713-6350).' ),
			);
		}
		if ( ! self::is_configured() ) {
			return array(
				'statusCode' => 400,
				'body'       => array( 'success' => false, 'error' => 'The Drive / Business Profile / Google MCP OAuth client is missing. Connect one of those first; Ads uses the same Cloud client.' ),
			);
		}
		return array(
			'statusCode' => 200,
			'body'       => array(
				'success' => true,
				'message' => 'Google Ads settings saved. Use Connect, then Test connection.',
			),
		);
	}

	private static function mint_state(): string {
		$user_id = Neo_Pulse_App_Auth_Session::user_id();
		if ( $user_id === null || $user_id < 1 ) {
			throw new RuntimeException( 'A logged-in user is required to connect Google Ads.' );
		}
		$state = wp_generate_password( 40, false, false );
		set_transient( 'neo_pulse_app_ads_state_' . $state, $user_id, 600 );
		return $state;
	}

	private static function consume_state( string $state ): bool {
		if ( $state === '' ) {
			return false;
		}
		$key  = 'neo_pulse_app_ads_state_' . $state;
		$user = get_transient( $key );
		delete_transient( $key );
		return is_numeric( $user ) && (int) $user >= 1;
	}

	public static function authorize_redirect(): void {
		if ( ! self::is_configured() ) {
			Neo_Pulse_App_Api_Dispatcher::send_json(
				array(
					'success' => false,
					'error'   => 'Google Ads OAuth is not configured. Connect Drive, Business Profile, or Google MCP first (same Cloud client).',
				),
				503
			);
			return;
		}
		wp_redirect( self::get_auth_url(), 302 );
		exit;
	}

	/**
	 * @param array<string,mixed> $query
	 */
	public static function handle_callback( array $query ): void {
		$frontend = self::frontend_url();
		if ( ! self::is_configured() ) {
			wp_redirect( $frontend . '?ads=error&message=not_configured', 302 );
			exit;
		}
		$state = isset( $query['state'] ) ? trim( (string) $query['state'] ) : '';
		if ( ! self::consume_state( $state ) ) {
			wp_redirect( $frontend . '?ads=error&message=invalid_state', 302 );
			exit;
		}
		$code = isset( $query['code'] ) ? trim( (string) $query['code'] ) : '';
		if ( $code === '' ) {
			$msg = isset( $query['error'] ) ? (string) $query['error'] : 'no_code';
			wp_redirect( $frontend . '?ads=error&message=' . rawurlencode( $msg ), 302 );
			exit;
		}
		$config   = self::load_config();
		$response = wp_remote_post(
			self::GOOGLE_TOKEN_URL,
			array(
				'timeout' => 30,
				'body'    => array(
					'code'          => $code,
					'client_id'     => $config['clientId'],
					'client_secret' => $config['clientSecret'],
					'redirect_uri'  => $config['redirectUri'],
					'grant_type'    => 'authorization_code',
				),
			)
		);
		if ( is_wp_error( $response ) ) {
			wp_redirect( $frontend . '?ads=error&message=' . rawurlencode( $response->get_error_message() ), 302 );
			exit;
		}
		$data = json_decode( wp_remote_retrieve_body( $response ), true );
		if ( ! is_array( $data ) || empty( $data['access_token'] ) ) {
			$msg = is_array( $data ) && ! empty( $data['error_description'] )
				? (string) $data['error_description']
				: 'token_exchange_failed';
			wp_redirect( $frontend . '?ads=error&message=' . rawurlencode( $msg ), 302 );
			exit;
		}
		Neo_Pulse_App_Google_Ads_Tokens::save_tokens(
			array(
				'access_token'  => (string) $data['access_token'],
				'refresh_token' => isset( $data['refresh_token'] ) ? (string) $data['refresh_token'] : '',
				'expires_in'    => isset( $data['expires_in'] ) ? (int) $data['expires_in'] : 0,
			)
		);
		wp_redirect( $frontend . '?ads=connected#settings', 302 );
		exit;
	}

	/**
	 * @return array<string,mixed>
	 */
	public static function connection_status(): array {
		if ( ! self::is_configured() ) {
			return array( 'connected' => false, 'error' => 'Google Ads OAuth is not configured' );
		}
		$tokens = Neo_Pulse_App_Google_Ads_Tokens::get_tokens();
		return array( 'connected' => is_array( $tokens ) && ! empty( $tokens['access_token'] ) );
	}

	/**
	 * @return array{statusCode:int,body:array<string,mixed>}
	 */
	public static function test_connection(): array {
		if ( ! self::is_configured() ) {
			return array(
				'statusCode' => 503,
				'body'       => array( 'success' => false, 'error' => 'Google Ads OAuth is not configured.' ),
			);
		}
		if ( Neo_Pulse_App_Google_Ads_Credentials::mcc_id() === '' ) {
			return array(
				'statusCode' => 503,
				'body'       => array( 'success' => false, 'error' => 'MCC ID is missing. Paste the manager customer ID (393-713-6350).' ),
			);
		}
		$result = Neo_Pulse_App_Google_Ads_Api::list_accessible_customers();
		if ( empty( $result['ok'] ) ) {
			return array(
				'statusCode' => (int) ( $result['statusCode'] ?? 401 ),
				'body'       => array( 'success' => false, 'error' => (string) ( $result['error'] ?? 'Test failed' ) ),
			);
		}
		$ids = isset( $result['customerIds'] ) && is_array( $result['customerIds'] ) ? $result['customerIds'] : array();
		return array(
			'statusCode' => 200,
			'body'       => array(
				'success'     => true,
				'message'     => 'Google Ads connection OK.',
				'customerIds' => $ids,
			),
		);
	}

	public static function get_auth_url(): string {
		if ( ! self::is_configured() ) {
			throw new RuntimeException( 'Google Ads OAuth is not configured.' );
		}
		$config = self::load_config();
		return add_query_arg(
			array(
				'client_id'     => $config['clientId'],
				'redirect_uri'  => $config['redirectUri'],
				'response_type' => 'code',
				'scope'         => self::ADS_SCOPE,
				'access_type'   => 'offline',
				'prompt'        => 'consent',
				'state'         => self::mint_state(),
			),
			self::GOOGLE_AUTH_URL
		);
	}

	/**
	 * @return array{clientId:string,clientSecret:string,redirectUri:string,frontendUrl:string}
	 */
	public static function load_config_for_tokens(): array {
		return self::load_config();
	}

	/**
	 * @return array{clientId:string,clientSecret:string,redirectUri:string,frontendUrl:string}
	 */
	private static function load_config(): array {
		if ( is_array( self::$config_cache ) ) {
			return self::$config_cache;
		}
		$config = array(
			'clientId'     => '',
			'clientSecret' => '',
			'redirectUri'  => self::redirect_uri(),
			'frontendUrl'  => '',
		);
		$file = Neo_Pulse_App_Json_File_Store::read( Neo_Pulse_App_Data_Paths::google_ads_oauth_config_path() );
		if ( is_array( $file ) ) {
			$config['clientId']     = trim( (string) ( $file['clientId'] ?? $file['client_id'] ?? '' ) );
			$config['clientSecret'] = trim( (string) ( $file['clientSecret'] ?? $file['client_secret'] ?? '' ) );
			$config['frontendUrl'] = trim( (string) ( $file['frontendUrl'] ?? $file['frontend_url'] ?? '' ) );
		}
		if ( $config['clientId'] === '' || $config['clientSecret'] === '' ) {
			$shared = Neo_Pulse_App_Gmb_Oauth::load_config_for_tokens();
			if ( $config['clientId'] === '' ) {
				$config['clientId'] = $shared['clientId'];
			}
			if ( $config['clientSecret'] === '' ) {
				$config['clientSecret'] = $shared['clientSecret'];
			}
			if ( $config['frontendUrl'] === '' ) {
				$config['frontendUrl'] = $shared['frontendUrl'];
			}
		}
		if ( $config['frontendUrl'] === '' ) {
			$config['frontendUrl'] = self::frontend_url_default();
		}
		self::$config_cache = $config;
		return $config;
	}

	private static function is_production_save_blocked(): bool {
		return defined( 'WP_ENVIRONMENT_TYPE' ) && WP_ENVIRONMENT_TYPE === 'production';
	}
}
