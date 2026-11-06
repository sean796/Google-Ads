<?php
/**
 * Google Drive MCP OAuth (shared OAuth client with GMB; separate tokens + redirect).
 *
 * @package Neo_Pulse_App
 */

defined( 'ABSPATH' ) || exit;

class Neo_Pulse_App_Google_Mcp_Oauth {

	const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
	const GOOGLE_AUTH_URL  = 'https://accounts.google.com/o/oauth2/v2/auth';
	const TOKENINFO_URL    = 'https://www.googleapis.com/oauth2/v2/tokeninfo';
	const DRIVE_SCOPES     = 'https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/drive.readonly https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/documents.readonly https://www.googleapis.com/auth/documents';

	public static function redirect_uri(): string {
		if ( defined( 'NEO_PULSE_APP_GOOGLE_MCP_REDIRECT_URI' ) ) {
			$override = trim( (string) NEO_PULSE_APP_GOOGLE_MCP_REDIRECT_URI );
			if ( $override !== '' ) {
				return $override;
			}
		}
		return home_url( '/api/google-mcp/callback' );
	}

	public static function frontend_url_default(): string {
		return Neo_Pulse_App_Gmb_Oauth::frontend_url_default();
	}

	public static function frontend_url(): string {
		if ( defined( 'NEO_PULSE_APP_FRONTEND_URL' ) ) {
			$override = trim( (string) NEO_PULSE_APP_FRONTEND_URL );
			if ( $override !== '' ) {
				return $override;
			}
		}
		return Neo_Pulse_App_Gmb_Oauth::frontend_url();
	}

	public static function is_configured(): bool {
		$config = self::load_oauth_client_config();
		return $config['clientId'] !== '' && $config['clientSecret'] !== '';
	}

	/**
	 * @return array{configured:bool,hasClientId:bool,clientId:string,redirectUri:string,frontendUrl:string}
	 */
	public static function config_status(): array {
		$config     = self::load_oauth_client_config();
		$configured = self::is_configured();
		return array(
			'configured'  => $configured,
			'hasClientId' => $config['clientId'] !== '',
			'clientId'    => $config['clientId'],
			'redirectUri' => self::redirect_uri(),
			'frontendUrl' => self::frontend_url(),
		);
	}

	private static function mint_state(): string {
		$user_id = Neo_Pulse_App_Auth_Session::user_id();
		if ( $user_id === null || $user_id < 1 ) {
			throw new RuntimeException( 'A logged-in user is required to connect Google Drive.' );
		}
		$state = wp_generate_password( 40, false, false );
		set_transient( 'neo_pulse_app_mcp_state_' . $state, $user_id, 600 );
		return $state;
	}

	private static function consume_state( string $state ): bool {
		if ( $state === '' ) {
			return false;
		}
		$key  = 'neo_pulse_app_mcp_state_' . $state;
		$user = get_transient( $key );
		delete_transient( $key );
		return is_numeric( $user ) && (int) $user >= 1;
	}

	public static function authorize_redirect(): void {
		if ( ! self::is_configured() ) {
			Neo_Pulse_App_Api_Dispatcher::send_json(
				array(
					'success' => false,
					'error'   => 'Google OAuth not configured. Enter Client ID and Client Secret in Settings, then Test and save.',
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
		if ( ! self::is_configured() ) {
			self::finish_oauth_flow( false, 'Google OAuth not configured. Enter Client ID and Client Secret in Settings, then Test and save.' );
			return;
		}
		if ( ! empty( $query['error'] ) ) {
			$message = (string) $query['error'];
			if ( ! empty( $query['error_description'] ) ) {
				$message = (string) $query['error_description'];
			}
			self::finish_oauth_flow( false, $message );
			return;
		}
		$state = isset( $query['state'] ) ? trim( (string) $query['state'] ) : '';
		if ( ! self::consume_state( $state ) ) {
			self::finish_oauth_flow( false, 'Invalid or expired OAuth state. Start the connect flow again.' );
			return;
		}
		$code = isset( $query['code'] ) ? trim( (string) $query['code'] ) : '';
		if ( $code === '' ) {
			self::finish_oauth_flow( false, 'Google did not return an authorization code.' );
			return;
		}
		$config   = self::load_oauth_client_config();
		$response = wp_remote_post(
			self::GOOGLE_TOKEN_URL,
			array(
				'timeout' => 30,
				'body'    => array(
					'code'          => $code,
					'client_id'     => $config['clientId'],
					'client_secret' => $config['clientSecret'],
					'redirect_uri'  => self::redirect_uri(),
					'grant_type'    => 'authorization_code',
				),
			)
		);
		if ( is_wp_error( $response ) ) {
			self::finish_oauth_flow( false, $response->get_error_message() );
			return;
		}
		$data = json_decode( wp_remote_retrieve_body( $response ), true );
		if ( ! is_array( $data ) || empty( $data['access_token'] ) ) {
			$msg = is_array( $data ) && ! empty( $data['error_description'] )
				? (string) $data['error_description']
				: ( is_array( $data ) && ! empty( $data['error'] ) ? (string) $data['error'] : 'Token exchange failed.' );
			self::finish_oauth_flow( false, $msg );
			return;
		}
		Neo_Pulse_App_Google_Mcp_Tokens::save_tokens(
			array(
				'access_token'  => (string) $data['access_token'],
				'refresh_token' => isset( $data['refresh_token'] ) ? (string) $data['refresh_token'] : '',
				'expires_in'    => isset( $data['expires_in'] ) ? (int) $data['expires_in'] : 0,
			)
		);
		self::finish_oauth_flow( true, 'Google Drive connected. You can close this window.' );
	}

	/**
	 * @param array<string,mixed> $body
	 * @return array{statusCode:int,body:array<string,mixed>}
	 */
	public static function test_and_save( array $body ): array {
		// Wave 0: same rule as GMB, Ads, GSC, and GA. On production, credentials
		// persist in env and wp-config constants only; this route validates.
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
					'error'   => 'Client ID does not look like a Google OAuth Client ID. Copy the full value from Google Cloud Console.',
				),
			);
		}
		$credential_error = self::validate_client_credentials( $client_id, $client_secret );
		if ( $credential_error !== null ) {
			return array(
				'statusCode' => 400,
				'body'       => array( 'success' => false, 'error' => $credential_error ),
			);
		}
		$existing = Neo_Pulse_App_Json_File_Store::read( Neo_Pulse_App_Data_Paths::gmb_oauth_config_path() );
		if ( ! is_array( $existing ) ) {
			$existing = array();
		}
		$frontend = self::frontend_url();
		$payload  = array(
			'clientId'     => $client_id,
			'clientSecret' => $client_secret,
			'redirectUri'  => (string) ( $existing['redirectUri'] ?? Neo_Pulse_App_Gmb_Oauth::redirect_uri() ),
			'frontendUrl'  => $frontend !== '' ? $frontend : (string) ( $existing['frontendUrl'] ?? '' ),
		);
		if ( ! Neo_Pulse_App_Json_File_Store::write( Neo_Pulse_App_Data_Paths::gmb_oauth_config_path(), $payload ) ) {
			return array(
				'statusCode' => 500,
				'body'       => array( 'success' => false, 'error' => 'Could not write credentials file.' ),
			);
		}
		Neo_Pulse_App_Gmb_Oauth::reload_config();
		return array(
			'statusCode' => 200,
			'body'       => array(
				'success' => true,
				'message' => 'Google OAuth credentials validated and saved. Use Connect Google Drive, then Test connection.',
			),
		);
	}

	public static function validate_client_credentials( string $client_id, string $client_secret ): ?string {
		$response = wp_remote_post(
			self::GOOGLE_TOKEN_URL,
			array(
				'timeout' => 20,
				'body'    => array(
					'code'          => 'credential-validation-probe',
					'client_id'     => $client_id,
					'client_secret' => $client_secret,
					'redirect_uri'  => self::redirect_uri(),
					'grant_type'    => 'authorization_code',
				),
			)
		);
		if ( is_wp_error( $response ) ) {
			return $response->get_error_message();
		}
		$data = json_decode( wp_remote_retrieve_body( $response ), true );
		if ( ! is_array( $data ) ) {
			return 'Could not validate Google OAuth credentials.';
		}
		$error = isset( $data['error'] ) ? (string) $data['error'] : '';
		$desc  = isset( $data['error_description'] ) ? (string) $data['error_description'] : '';
		if ( $error === 'invalid_client' || stripos( $desc, 'client secret' ) !== false ) {
			return $desc !== '' ? $desc : 'The provided client secret is invalid.';
		}
		if ( $error === 'invalid_grant' || $error === 'invalid_code' ) {
			return null;
		}
		if ( $desc !== '' ) {
			return $desc;
		}
		if ( $error !== '' ) {
			return $error;
		}
		return null;
	}

	private static function finish_oauth_flow( bool $success, string $message ): void {
		$frontend = self::frontend_url();
		$params   = $success
			? 'drive=connected'
			: 'drive=error&message=' . rawurlencode( $message );
		$target   = rtrim( $frontend, '/' ) . '/?' . $params . '#settings';
		if ( self::wants_html_oauth_completion_page() ) {
			self::render_oauth_completion_page( $success, $message, $target );
			return;
		}
		wp_redirect( $target, 302 );
		exit;
	}

	private static function wants_html_oauth_completion_page(): bool {
		if ( ! isset( $_SERVER['HTTP_ACCEPT'] ) ) {
			return true;
		}
		return is_string( $_SERVER['HTTP_ACCEPT'] ) && stripos( (string) $_SERVER['HTTP_ACCEPT'], 'text/html' ) !== false;
	}

	private static function render_oauth_completion_page( bool $success, string $message, string $target ): void {
		if ( ! headers_sent() ) {
			status_header( $success ? 200 : 400 );
			header( 'Content-Type: text/html; charset=utf-8' );
			header( 'Cache-Control: no-store' );
		}
		$title   = $success ? 'Google Drive connected' : 'Google Drive connection failed';
		$payload = wp_json_encode(
			array(
				'type'    => $success ? 'google-drive-oauth-complete' : 'google-drive-oauth-error',
				'message' => $message,
			)
		);
		$safe_message = esc_html( $message );
		$safe_target  = esc_url( $target );
		echo '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">';
		echo '<title>' . esc_html( $title ) . '</title>';
		echo '<style>body{margin:0;background:#09090b;color:#fff;font:1rem/1.5 Lato,sans-serif;display:flex;min-height:100vh;align-items:center;justify-content:center;padding:24px}';
		echo '.panel{max-width:32rem;background:#18181b;padding:24px}.ok{color:#4ade80}.err{color:#f87171}a{color:#93c5fd}</style></head><body>';
		echo '<div class="panel"><h1 style="margin:0 0 12px;font-size:1rem">' . esc_html( $title ) . '</h1>';
		echo '<p class="' . ( $success ? 'ok' : 'err' ) . '" style="margin:0 0 16px">' . $safe_message . '</p>';
		if ( ! $success ) {
			echo '<p style="margin:0 0 16px">Update Client Secret in Settings → Google Drive → Test and save, then click Connect again.</p>';
		} else {
			echo '<p style="margin:0 0 16px">You can close this window and run Test connection in Settings.</p>';
		}
		echo '<p style="margin:0"><a href="' . $safe_target . '">Return to Settings</a></p></div>';
		echo '<script>(function(){var payload=' . $payload . ';try{if(window.opener&&!window.opener.closed){window.opener.postMessage(payload,window.location.origin);}}catch(e){}setTimeout(function(){try{window.close()}catch(e2){}},' . ( $success ? '1500' : '8000' ) . ');})();</script>';
		echo '</body></html>';
		exit;
	}

	/**
	 * @return array<string,mixed>
	 */
	public static function connection_status(): array {
		if ( ! self::is_configured() ) {
			return array(
				'connected' => false,
				'error'     => 'Google OAuth not configured',
			);
		}
		$tokens = Neo_Pulse_App_Google_Mcp_Tokens::get_tokens();
		if ( ! is_array( $tokens ) ) {
			return array( 'connected' => false );
		}
		$access_token = Neo_Pulse_App_Google_Mcp_Tokens::get_valid_access_token();
		if ( is_wp_error( $access_token ) ) {
			return array(
				'connected' => false,
				'error'     => $access_token->get_error_message(),
			);
		}
		$email = isset( $tokens['email'] ) ? trim( (string) $tokens['email'] ) : '';
		return array(
			'connected' => true,
			'email'     => $email,
		);
	}

	/**
	 * @return array{statusCode:int,body:array<string,mixed>}
	 */
	public static function test_connection( array $body = array() ): array {
		if ( ! self::is_configured() ) {
			return array(
				'statusCode' => 503,
				'body'       => array(
					'success' => false,
					'error'   => 'Google OAuth not configured. Enter Client ID and Client Secret in Settings, then Test and save.',
				),
			);
		}
		$tokens = Neo_Pulse_App_Google_Mcp_Tokens::get_tokens();
		if ( ! is_array( $tokens ) ) {
			return array(
				'statusCode' => 401,
				'body'       => array(
					'success' => false,
					'error'   => 'Not connected. Use Connect Google Drive first.',
				),
			);
		}
		$access_token = Neo_Pulse_App_Google_Mcp_Tokens::get_valid_access_token();
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
		$email = is_array( $data ) && ! empty( $data['email'] ) ? (string) $data['email'] : '';
		if ( $email !== '' ) {
			Neo_Pulse_App_Google_Mcp_Tokens::save_email( $email );
		}

		$parent_folder_id = isset( $body['folderId'] ) ? preg_replace( '/[^a-zA-Z0-9_-]/', '', (string) $body['folderId'] ) : '';
		$upload           = Neo_Pulse_App_Google_Drive_Upload::upload_connection_test( $parent_folder_id );
		if ( (int) ( $upload['statusCode'] ?? 500 ) !== 200 ) {
			return $upload;
		}
		$upload_body = isset( $upload['body'] ) && is_array( $upload['body'] ) ? $upload['body'] : array();
		return array(
			'statusCode' => 200,
			'body'       => array(
				'success'     => true,
				'message'     => 'Test file uploaded to Google Drive.',
				'email'       => $email,
				'webViewLink' => (string) ( $upload_body['webViewLink'] ?? '' ),
				'folderLink'  => (string) ( $upload_body['folderLink'] ?? '' ),
				'fileName'    => (string) ( $upload_body['name'] ?? '' ),
				'fileId'      => (string) ( $upload_body['fileId'] ?? '' ),
				'folderId'    => (string) ( $upload_body['folderId'] ?? '' ),
			),
		);
	}

	private static function is_production_save_blocked(): bool {
		return defined( 'WP_ENVIRONMENT_TYPE' ) && WP_ENVIRONMENT_TYPE === 'production';
	}

	public static function get_auth_url(): string {
		if ( ! self::is_configured() ) {
			throw new RuntimeException( 'Google OAuth not configured.' );
		}
		$config = self::load_oauth_client_config();
		return add_query_arg(
			array(
				'client_id'     => $config['clientId'],
				'redirect_uri'  => self::redirect_uri(),
				'response_type' => 'code',
				'scope'         => self::DRIVE_SCOPES,
				'access_type'   => 'offline',
				'prompt'        => 'consent',
				'state'         => self::mint_state(),
			),
			self::GOOGLE_AUTH_URL
		);
	}

	/**
	 * @return array{clientId:string,clientSecret:string}
	 */
	public static function load_oauth_client_config(): array {
		return Neo_Pulse_App_Gmb_Oauth::load_config_for_tokens();
	}
}
