<?php
/**
 * Google Business Profile OAuth config and token storage.
 *
 * @package Neo_Pulse_App
 */

defined( 'ABSPATH' ) || exit;

class Neo_Pulse_App_Gmb_Oauth {

	const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
	const GOOGLE_AUTH_URL  = 'https://accounts.google.com/o/oauth2/v2/auth';
	const GMB_SCOPE        = 'https://www.googleapis.com/auth/business.manage';
	const TOKENINFO_URL    = 'https://www.googleapis.com/oauth2/v2/tokeninfo';

	/** @var array<string,string>|null */
	private static $config_cache = null;

	public static function reload_config(): void {
		self::$config_cache = null;
	}

	/**
	 * One-time migration: neo-pulse-wp wp_options or env-only setup → gmb-oauth.json on neodigital.ca.
	 */
	public static function maybe_migrate_legacy_config(): void {
		if ( self::is_configured() ) {
			return;
		}
		$legacy = self::legacy_wp_gmb_credentials();
		if ( $legacy['clientId'] === '' || $legacy['clientSecret'] === '' ) {
			return;
		}
		self::write_config(
			array(
				'clientId'     => $legacy['clientId'],
				'clientSecret' => $legacy['clientSecret'],
				'redirectUri'  => self::redirect_uri(),
				'frontendUrl'  => self::frontend_url_default(),
			)
		);
	}

	public static function is_configured(): bool {
		$config = self::load_config();
		return $config['clientId'] !== '' && $config['clientSecret'] !== '' && $config['redirectUri'] !== '';
	}

	public static function redirect_uri(): string {
		return home_url( '/api/gmb/callback' );
	}

	public static function frontend_url_default(): string {
		return home_url( '/neo-pulse/' );
	}

	public static function frontend_url(): string {
		$config = self::load_config();
		return $config['frontendUrl'] !== '' ? $config['frontendUrl'] : self::frontend_url_default();
	}

	/**
	 * @return array{configured:bool,hasClientId:bool,clientId:string,redirectUri:string,frontendUrl:string,authUrl:string}
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
			'configured'   => $configured,
			'hasClientId'  => $config['clientId'] !== '',
			'clientId'     => $config['clientId'],
			'redirectUri'  => $config['redirectUri'],
			'frontendUrl'  => self::frontend_url(),
			'authUrl'      => $auth_url,
		);
	}

	/**
	 * @param array<string,mixed> $body
	 * @return array{statusCode:int,body:array<string,mixed>}
	 */
	public static function save_config( array $body ): array {
		if ( self::is_production_save_blocked() ) {
			return array(
				'statusCode' => 403,
				'body'       => array(
					'success' => false,
					'error'   => 'Saving GMB config from the UI is only allowed locally. On production, set NEO_PULSE_APP_GMB_CLIENT_ID, NEO_PULSE_APP_GMB_CLIENT_SECRET, NEO_PULSE_APP_GMB_REDIRECT_URI, and NEO_PULSE_APP_FRONTEND_URL in wp-config or neo-pulse-app-secrets.php.',
				),
			);
		}
		$client_id     = isset( $body['clientId'] ) ? trim( (string) $body['clientId'] ) : '';
		$client_secret = isset( $body['clientSecret'] ) ? trim( (string) $body['clientSecret'] ) : '';
		$redirect_uri  = isset( $body['redirectUri'] ) ? trim( (string) $body['redirectUri'] ) : '';
		$frontend_url  = isset( $body['frontendUrl'] ) ? trim( (string) $body['frontendUrl'] ) : '';
		if ( $client_id === '' || $client_secret === '' ) {
			return array(
				'statusCode' => 400,
				'body'       => array( 'success' => false, 'error' => 'Client ID and Client Secret are required.' ),
			);
		}
		$existing = Neo_Pulse_App_Json_File_Store::read( Neo_Pulse_App_Data_Paths::gmb_oauth_config_path() );
		if ( ! is_array( $existing ) ) {
			$existing = array();
		}
		$payload = array(
			'clientId'     => $client_id,
			'clientSecret' => $client_secret,
			'redirectUri'  => $redirect_uri !== '' ? $redirect_uri : (string) ( $existing['redirectUri'] ?? $existing['redirect_uri'] ?? self::redirect_uri() ),
			'frontendUrl'  => $frontend_url !== '' ? $frontend_url : (string) ( $existing['frontendUrl'] ?? $existing['frontend_url'] ?? '' ),
		);
		if ( ! self::write_config( $payload ) ) {
			return array(
				'statusCode' => 500,
				'body'       => array( 'success' => false, 'error' => 'Could not write credentials file.' ),
			);
		}
		return array(
			'statusCode' => 200,
			'body'       => array(
				'success' => true,
				'message' => 'GMB credentials saved. You can now use Connect Google Business and Test connection.',
			),
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
					'error'   => 'Test and save is only allowed locally. On production, set NEO_PULSE_APP_GMB_CLIENT_ID, NEO_PULSE_APP_GMB_CLIENT_SECRET, NEO_PULSE_APP_GMB_REDIRECT_URI, and NEO_PULSE_APP_FRONTEND_URL in wp-config or neo-pulse-app-secrets.php.',
				),
			);
		}
		$client_id     = isset( $body['clientId'] ) ? trim( (string) $body['clientId'] ) : '';
		$client_secret = isset( $body['clientSecret'] ) ? trim( (string) $body['clientSecret'] ) : '';
		if ( $client_id === '' || $client_secret === '' ) {
			return array(
				'statusCode' => 400,
				'body'       => array( 'success' => false, 'error' => 'Client ID and Client Secret are required.' ),
			);
		}
		if ( strlen( $client_id ) < 20 || strpos( $client_id, '.apps.googleusercontent.com' ) === false ) {
			return array(
				'statusCode' => 400,
				'body'       => array(
					'success' => false,
					'error'   => 'Client ID does not look like a Google OAuth Client ID. Copy the full value from Google Cloud Console (Credentials → your OAuth client). It should be long and end with .apps.googleusercontent.com',
				),
			);
		}
		if ( ! self::write_config(
			array(
				'clientId'     => $client_id,
				'clientSecret' => $client_secret,
				'redirectUri'  => self::redirect_uri(),
				'frontendUrl'  => self::frontend_url_default(),
			)
		) ) {
			return array(
				'statusCode' => 500,
				'body'       => array( 'success' => false, 'error' => 'Could not write credentials file.' ),
			);
		}
		return array(
			'statusCode' => 200,
			'body'       => array(
				'success' => true,
				'message' => 'GMB credentials validated and saved. Use Connect Google Business, then Test connection.',
			),
		);
	}

	private static function mint_state(): string {
		$user_id = Neo_Pulse_App_Auth_Session::user_id();
		if ( $user_id === null || $user_id < 1 ) {
			throw new RuntimeException( 'A logged-in user is required to connect Google Business.' );
		}
		$state = wp_generate_password( 40, false, false );
		set_transient( 'neo_pulse_app_gmb_state_' . $state, $user_id, 600 );
		return $state;
	}

	private static function consume_state( string $state ): bool {
		if ( $state === '' ) {
			return false;
		}
		$key  = 'neo_pulse_app_gmb_state_' . $state;
		$user = get_transient( $key );
		delete_transient( $key );
		return is_numeric( $user ) && (int) $user >= 1;
	}

	public static function authorize_redirect(): void {
		if ( ! self::is_configured() ) {
			Neo_Pulse_App_Api_Dispatcher::send_json(
				array(
					'success' => false,
					'error'   => 'GMB not configured. Enter Client ID and Client Secret in Settings and use Test and save.',
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
			wp_redirect( $frontend . '?gmb=error&message=not_configured', 302 );
			exit;
		}
		$state = isset( $query['state'] ) ? trim( (string) $query['state'] ) : '';
		if ( ! self::consume_state( $state ) ) {
			wp_redirect( $frontend . '?gmb=error&message=invalid_state', 302 );
			exit;
		}
		$code = isset( $query['code'] ) ? trim( (string) $query['code'] ) : '';
		if ( $code === '' ) {
			wp_redirect( $frontend . '?gmb=error&message=no_code', 302 );
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
			wp_redirect( $frontend . '?gmb=error&message=' . rawurlencode( $response->get_error_message() ), 302 );
			exit;
		}
		$data = json_decode( wp_remote_retrieve_body( $response ), true );
		if ( ! is_array( $data ) || empty( $data['access_token'] ) ) {
			$msg = is_array( $data ) && ! empty( $data['error_description'] )
				? (string) $data['error_description']
				: 'token_exchange_failed';
			wp_redirect( $frontend . '?gmb=error&message=' . rawurlencode( $msg ), 302 );
			exit;
		}
		Neo_Pulse_App_Gmb_Tokens::save_tokens(
			array(
				'access_token'  => (string) $data['access_token'],
				'refresh_token' => isset( $data['refresh_token'] ) ? (string) $data['refresh_token'] : '',
				'expires_in'    => isset( $data['expires_in'] ) ? (int) $data['expires_in'] : 0,
			)
		);
		wp_redirect( $frontend . '#settings', 302 );
		exit;
	}

	/**
	 * @return array<string,mixed>
	 */
	public static function connection_status(): array {
		if ( ! self::is_configured() ) {
			return array( 'connected' => false, 'error' => 'GMB not configured' );
		}
		$tokens = Neo_Pulse_App_Gmb_Tokens::get_tokens();
		return array( 'connected' => is_array( $tokens ) && ! empty( $tokens['access_token'] ) );
	}

	/**
	 * @return array{statusCode:int,body:array<string,mixed>}
	 */
	public static function test_connection(): array {
		if ( ! self::is_configured() ) {
			return array(
				'statusCode' => 503,
				'body'       => array(
					'success' => false,
					'error'   => 'GMB not configured. Enter Client ID and Client Secret in Settings and use Test and save.',
				),
			);
		}
		$tokens = Neo_Pulse_App_Gmb_Tokens::get_tokens();
		if ( ! is_array( $tokens ) || empty( $tokens['access_token'] ) ) {
			return array(
				'statusCode' => 401,
				'body'       => array( 'success' => false, 'error' => 'Not connected. Use Connect Google Business first.' ),
			);
		}
		$access_token = Neo_Pulse_App_Gmb_Tokens::get_valid_access_token();
		if ( is_wp_error( $access_token ) ) {
			return array(
				'statusCode' => 401,
				'body'       => array( 'success' => false, 'error' => $access_token->get_error_message() ),
			);
		}
		$response = wp_remote_get(
			self::TOKENINFO_URL,
			array(
				'timeout' => 20,
				'body'    => array( 'access_token' => $access_token ),
			)
		);
		if ( is_wp_error( $response ) ) {
			return array(
				'statusCode' => 502,
				'body'       => array( 'success' => false, 'error' => $response->get_error_message() ),
			);
		}
		$code = (int) wp_remote_retrieve_response_code( $response );
		$data = json_decode( wp_remote_retrieve_body( $response ), true );
		if ( $code !== 200 ) {
			$msg = is_array( $data ) && ! empty( $data['error_description'] )
				? (string) $data['error_description']
				: ( is_array( $data ) && ! empty( $data['error'] ) ? (string) $data['error'] : 'Token invalid or revoked' );
			return array(
				'statusCode' => 401,
				'body'       => array( 'success' => false, 'error' => $msg ),
			);
		}
		return array(
			'statusCode' => 200,
			'body'       => array(
				'success' => true,
				'message' => 'Google Business Profile connection OK (token valid). Set GBP Location ID on the site and use Pull stats to fetch data without using account-discovery quota.',
			),
		);
	}

	public static function get_auth_url(): string {
		if ( ! self::is_configured() ) {
			throw new RuntimeException( 'GMB not configured.' );
		}
		$config = self::load_config();
		return add_query_arg(
			array(
				'client_id'     => $config['clientId'],
				'redirect_uri'  => $config['redirectUri'],
				'response_type' => 'code',
				'scope'         => self::GMB_SCOPE,
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
			'redirectUri'  => '',
			'frontendUrl'  => '',
		);
		$file = Neo_Pulse_App_Json_File_Store::read( Neo_Pulse_App_Data_Paths::gmb_oauth_config_path() );
		if ( is_array( $file ) ) {
			$config['clientId']     = trim( (string) ( $file['clientId'] ?? $file['client_id'] ?? '' ) );
			$config['clientSecret'] = trim( (string) ( $file['clientSecret'] ?? $file['client_secret'] ?? '' ) );
			$config['redirectUri']  = trim( (string) ( $file['redirectUri'] ?? $file['redirect_uri'] ?? '' ) );
			$config['frontendUrl']  = trim( (string) ( $file['frontendUrl'] ?? $file['frontend_url'] ?? '' ) );
		}
		$env = Neo_Pulse_App_Secrets::gmb_oauth_env();
		if ( $env['clientId'] !== '' ) {
			$config['clientId'] = $env['clientId'];
		}
		if ( $env['clientSecret'] !== '' ) {
			$config['clientSecret'] = $env['clientSecret'];
		}
		if ( $env['redirectUri'] !== '' ) {
			$config['redirectUri'] = $env['redirectUri'];
		}
		if ( $env['frontendUrl'] !== '' ) {
			$config['frontendUrl'] = $env['frontendUrl'];
		}
		if ( $config['clientId'] === '' || $config['clientSecret'] === '' ) {
			$wp = self::legacy_wp_gmb_credentials();
			if ( $config['clientId'] === '' && $wp['clientId'] !== '' ) {
				$config['clientId'] = $wp['clientId'];
			}
			if ( $config['clientSecret'] === '' && $wp['clientSecret'] !== '' ) {
				$config['clientSecret'] = $wp['clientSecret'];
			}
		}
		if ( $config['redirectUri'] === '' ) {
			$config['redirectUri'] = self::redirect_uri();
		}
		if ( $config['frontendUrl'] === '' ) {
			$config['frontendUrl'] = self::frontend_url_default();
		}
		self::$config_cache = $config;
		return $config;
	}

	/**
	 * @return array{clientId:string,clientSecret:string}
	 */
	private static function legacy_wp_gmb_credentials(): array {
		if ( ! function_exists( 'get_option' ) ) {
			return array(
				'clientId'     => '',
				'clientSecret' => '',
			);
		}
		return array(
			'clientId'     => trim( (string) get_option( 'neo_pulse_wp_gmb_client_id', '' ) ),
			'clientSecret' => trim( (string) get_option( 'neo_pulse_wp_gmb_client_secret', '' ) ),
		);
	}

	/**
	 * @param array<string,string> $payload
	 */
	private static function write_config( array $payload ): bool {
		$written = Neo_Pulse_App_Json_File_Store::write( Neo_Pulse_App_Data_Paths::gmb_oauth_config_path(), $payload );
		if ( $written ) {
			self::reload_config();
		}
		return $written;
	}

	private static function is_production_save_blocked(): bool {
		return defined( 'WP_ENVIRONMENT_TYPE' ) && WP_ENVIRONMENT_TYPE === 'production';
	}
}
