<?php
/**
 * Search Console availability, mode, service account credentials, and OAuth token.
 *
 * @package Neo_Pulse_Wp
 */

defined( 'ABSPATH' ) || exit;

trait Neo_Pulse_Wp_Gsc_Trait_Credentials {

	/**
	 * Whether Search Console can be asked at all: an own key, or a site key for the Neo Digital relay.
	 * No request is made here (it runs on editor and admin page loads); fetch_* calls report a
	 * missing property or licence themselves.
	 */
	public static function is_available(): bool {
		return '' !== self::mode();
	}

	/**
	 * 'own' (service account key on this site), 'agency' (Neo Digital relay with the site key) or ''.
	 */
	public static function mode(): string {
		if ( self::has_service_account() ) {
			return 'own';
		}
		if ( class_exists( 'Neo_Pulse_Wp_License', false ) && '' !== Neo_Pulse_Wp_License::site_key() ) {
			return 'agency';
		}
		return '';
	}

	/**
	 * True when a usable service account JSON (client_email + private_key) is configured.
	 */
	public static function has_service_account(): bool {
		return ! is_wp_error( self::get_credentials() );
	}

	/**
	 * Store a service account JSON pasted under Settings. An empty string removes the stored one.
	 *
	 * @param mixed $json Raw JSON text.
	 * @return true|WP_Error
	 */
	public static function save_service_account_json( $json ) {
		$json = is_string( $json ) ? trim( $json ) : '';
		if ( $json === '' ) {
			delete_option( self::ACCOUNT_OPTION );
			self::reset_credentials();
			return true;
		}
		$parsed = self::parse_credentials_json( $json );
		if ( is_wp_error( $parsed ) ) {
			return $parsed;
		}
		$data = json_decode( $json, true );
		if ( ! is_array( $data ) || ( isset( $data['type'] ) && 'service_account' !== $data['type'] ) ) {
			return new WP_Error(
				'neo-pulse_gsc_bad_json',
				__( 'That JSON is not a Google service account key.', 'neo-pulse-wp' )
			);
		}
		// Store re-encoded JSON (validated, no stray whitespace); never autoloaded.
		$stored = wp_json_encode( $data );
		if ( ! is_string( $stored ) ) {
			return new WP_Error( 'neo-pulse_gsc_bad_json', __( 'GSC service account JSON is invalid.', 'neo-pulse-wp' ) );
		}
		if ( false === get_option( self::ACCOUNT_OPTION, false ) ) {
			add_option( self::ACCOUNT_OPTION, $stored, '', false );
		} else {
			update_option( self::ACCOUNT_OPTION, $stored, false );
		}
		self::reset_credentials();
		return true;
	}

	/**
	 * Where the active credentials come from: 'constant', 'option', 'file' (NEO_PULSE_WP_GSC_CREDENTIALS_FILE),
	 * 'legacy_file' (includes/credentials/ in the plugin folder) or '' when none.
	 */
	public static function credentials_source(): string {
		self::get_credentials();
		return self::$credentials_source;
	}

	/**
	 * Admin notice while credentials are still read from the old file inside the plugin folder.
	 * Call from an admin screen (manage_options only); prints nothing otherwise.
	 */
	public static function legacy_file_notice(): void {
		if ( ! current_user_can( 'manage_options' ) || 'legacy_file' !== self::credentials_source() ) {
			return;
		}
		printf(
			'<div class="notice notice-warning neo-pulse-wp-gsc-legacy-notice"><p><strong>%1$s</strong> %2$s</p></div>',
			esc_html__( 'Search Console key file found in the plugin folder.', 'neo-pulse-wp' ),
			esc_html__( 'Paste the service account JSON under Neo Pulse → Settings → Search Console (or define NEO_PULSE_WP_GSC_SERVICE_ACCOUNT_JSON in wp-config.php), then delete includes/credentials/gsc-service-account.json from the plugin folder. Files there can be downloaded by anyone and are removed by plugin updates.', 'neo-pulse-wp' )
		);
	}

	/**
	 * Forget resolved credentials and the cached connection test.
	 */
	private static function reset_credentials(): void {
		self::$credentials        = null;
		self::$credentials_source = '';
		delete_transient( self::CONNECTION_TRANSIENT );
	}

	/**
	 * @return array<string,mixed>|WP_Error
	 */
	private static function get_credentials() {
		if ( null !== self::$credentials ) {
			return self::$credentials;
		}

		// Order: wp-config constant → Settings (option) → explicit file path constant →
		// legacy file in the plugin folder (last resort only; see legacy_file_notice()).
		$sources = array(
			'constant'    => self::read_json_constant( 'NEO_PULSE_WP_GSC_SERVICE_ACCOUNT_JSON' ),
			'option'      => self::read_json_option(),
			'file'        => self::read_json_file( self::configured_file_path() ),
			'legacy_file' => self::read_json_file( self::legacy_file_path() ),
		);

		foreach ( $sources as $source => $raw ) {
			if ( $raw === null || $raw === '' ) {
				continue;
			}
			$parsed = self::parse_credentials_json( $raw );
			if ( ! is_wp_error( $parsed ) ) {
				self::$credentials        = $parsed;
				self::$credentials_source = $source;
				return self::$credentials;
			}
		}

		self::$credentials_source = '';
		self::$credentials        = new WP_Error(
			'neo-pulse_gsc_missing',
			__( 'GSC service account JSON is not configured for this plugin.', 'neo-pulse-wp' ),
			array(
				'clientEmail' => self::EMAIL_FALLBACK,
				'hint'        => sprintf(
					/* translators: %s: service account email */
					__( 'No service account key on this site. In Google Search Console, add %s under Settings → Users and permissions.', 'neo-pulse-wp' ),
					self::EMAIL_FALLBACK
				),
			)
		);
		return self::$credentials;
	}

	/**
	 * File named by NEO_PULSE_WP_GSC_CREDENTIALS_FILE (keep it outside the web root), or ''.
	 */
	private static function configured_file_path(): string {
		if ( defined( 'NEO_PULSE_WP_GSC_CREDENTIALS_FILE' ) && is_string( NEO_PULSE_WP_GSC_CREDENTIALS_FILE ) && NEO_PULSE_WP_GSC_CREDENTIALS_FILE !== '' ) {
			return (string) NEO_PULSE_WP_GSC_CREDENTIALS_FILE;
		}
		return '';
	}

	/**
	 * Old default location inside the plugin folder (web-readable; read only as a fallback).
	 */
	private static function legacy_file_path(): string {
		return NEO_PULSE_WP_PLUGIN_DIR . 'includes/credentials/gsc-service-account.json';
	}

	private static function read_json_option(): ?string {
		$value = get_option( self::ACCOUNT_OPTION, '' );
		if ( is_array( $value ) ) {
			$value = wp_json_encode( $value );
		}
		return is_string( $value ) && trim( $value ) !== '' ? trim( $value ) : null;
	}

	private static function read_json_constant( string $name ): ?string {
		if ( defined( $name ) ) {
			$value = constant( $name );
			if ( is_string( $value ) && trim( $value ) !== '' ) {
				return trim( $value );
			}
		}
		return null;
	}

	private static function read_json_file( string $path ): ?string {
		if ( $path === '' || ! is_readable( $path ) ) {
			return null;
		}
		$raw = file_get_contents( $path );
		return is_string( $raw ) && trim( $raw ) !== '' ? trim( $raw ) : null;
	}

	/**
	 * @return array<string,string>|WP_Error
	 */
	private static function parse_credentials_json( string $raw ) {
		$raw  = trim( $raw );
		$data = json_decode( $raw, true );
		if ( ! is_array( $data ) ) {
			return new WP_Error(
				'neo-pulse_gsc_bad_json',
				__( 'GSC service account JSON is invalid.', 'neo-pulse-wp' )
			);
		}

		$email = isset( $data['client_email'] ) ? trim( (string) $data['client_email'] ) : '';
		$key   = isset( $data['private_key'] ) ? (string) $data['private_key'] : '';
		$key   = str_replace( '\\n', "\n", $key );

		if ( $email === '' || $key === '' ) {
			return new WP_Error(
				'neo-pulse_gsc_incomplete',
				__( 'GSC service account JSON must include client_email and private_key.', 'neo-pulse-wp' )
			);
		}

		return array(
			'client_email' => $email,
			'private_key'  => $key,
			'project_id'   => isset( $data['project_id'] ) ? (string) $data['project_id'] : '',
		);
	}

	/**
	 * @return string|WP_Error
	 */
	private static function get_access_token() {
		$creds = self::get_credentials();
		if ( is_wp_error( $creds ) ) {
			return $creds;
		}

		$cache_key = 'neo_pulse_wp_gsc_token_' . md5( $creds['client_email'] . '|' . NEO_PULSE_WP_VERSION );
		$cached    = get_transient( $cache_key );
		if ( is_string( $cached ) && $cached !== '' ) {
			return $cached;
		}

		$jwt = self::build_jwt( $creds['client_email'], $creds['private_key'] );
		if ( is_wp_error( $jwt ) ) {
			return $jwt;
		}

		$response = wp_remote_post(
			self::TOKEN_URL,
			array(
				'timeout' => 30,
				'headers' => array(
					'Content-Type' => 'application/x-www-form-urlencoded',
				),
				'body'    => array(
					'grant_type' => 'urn:ietf:params:oauth:grant-type:jwt-bearer',
					'assertion'  => $jwt,
				),
			)
		);

		if ( is_wp_error( $response ) ) {
			return $response;
		}

		$code = (int) wp_remote_retrieve_response_code( $response );
		$raw  = wp_remote_retrieve_body( $response );
		$data = json_decode( $raw, true );

		if ( $code < 200 || $code >= 300 || ! is_array( $data ) || empty( $data['access_token'] ) ) {
			$msg = is_array( $data ) && ! empty( $data['error_description'] )
				? (string) $data['error_description']
				: ( $raw !== '' ? $raw : sprintf( 'HTTP %d', $code ) );
			return new WP_Error( 'neo-pulse_gsc_token', $msg );
		}

		$token = (string) $data['access_token'];
		set_transient( $cache_key, $token, self::TOKEN_TTL );
		return $token;
	}

	/**
	 * @return string|WP_Error
	 */
	private static function build_jwt( string $client_email, string $private_key ) {
		$now = time();
		$header = self::base64url_encode(
			wp_json_encode(
				array(
					'alg' => 'RS256',
					'typ' => 'JWT',
				)
			)
		);
		$claim = self::base64url_encode(
			wp_json_encode(
				array(
					'iss'   => $client_email,
					'scope' => self::SCOPE,
					'aud'   => self::TOKEN_URL,
					'exp'   => $now + 3600,
					'iat'   => $now,
				)
			)
		);

		$input = $header . '.' . $claim;
		$key   = openssl_pkey_get_private( $private_key );
		if ( false === $key ) {
			return new WP_Error(
				'neo-pulse_gsc_key',
				__( 'Could not read GSC service account private key.', 'neo-pulse-wp' )
			);
		}

		$signature = '';
		$signed    = openssl_sign( $input, $signature, $key, OPENSSL_ALGO_SHA256 );
		if ( PHP_VERSION_ID < 80000 && function_exists( 'openssl_free_key' ) ) { // Deprecated (and unnecessary) on PHP 8+.
			openssl_free_key( $key );
		}
		if ( ! $signed ) {
			return new WP_Error(
				'neo-pulse_gsc_sign',
				__( 'Could not sign GSC JWT.', 'neo-pulse-wp' )
			);
		}

		return $input . '.' . self::base64url_encode( $signature );
	}

	private static function base64url_encode( string $data ): string {
		return rtrim( strtr( base64_encode( $data ), '+/', '-_' ), '=' );
	}
}
