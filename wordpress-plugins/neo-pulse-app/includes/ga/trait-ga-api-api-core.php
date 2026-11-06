<?php
/**
 * GA4 property, error, Admin and Data API, and service-account auth helpers.
 *
 * @package Neo_Pulse_App
 */

defined( 'ABSPATH' ) || exit;

trait Neo_Pulse_App_Ga_Api_Trait_Api_Core {

	/**
	 * @return string|WP_Error Numeric GA4 property id.
	 */
	public static function normalize_property_id( string $raw ) {
		$id = trim( $raw );
		$id = preg_replace( '/^properties\/?/i', '', $id );
		if ( preg_match( '/^G-/i', $id ) ) {
			return new WP_Error(
				'neo-pulse_ga_property',
				'Use the numeric GA4 Property ID from Admin → Property settings, not the Measurement ID (G-…).'
			);
		}
		if ( ! preg_match( '/^\d+$/', $id ) ) {
			return new WP_Error( 'neo-pulse_ga_property', 'GA4 Property ID must be numeric digits only.' );
		}
		return $id;
	}

	/**
	 * @param array<string,string> $credentials
	 * @return array<string,mixed>
	 */
	private static function error_body_for_report( WP_Error $error, array $credentials, string $prop_id ): array {
		return array(
			'success'      => false,
			'error'        => self::format_api_error_for_user( $error, $credentials['client_email'] ?? '', $prop_id ),
			'propertyId'   => $prop_id,
			'client_email' => $credentials['client_email'] ?? '',
		);
	}

	public static function format_api_error_for_user_public( WP_Error $error, string $client_email, string $prop_id ): string {
		return self::format_api_error_for_user( $error, $client_email, $prop_id );
	}

	private static function format_api_error_for_user( WP_Error $error, string $client_email, string $prop_id ): string {
		$msg = $error->get_error_message();
		if ( $client_email === '' ) {
			return $msg;
		}
		if (
			stripos( $msg, 'sufficient permissions' ) !== false
			|| stripos( $msg, 'PERMISSION_DENIED' ) !== false
			|| stripos( $msg, 'permission' ) !== false
		) {
			return sprintf(
				'%s (Property ID %s). Neo Pulse calls GA4 with the service account %s, not your personal Google login. In GA4: Admin → Property access management → Add user → paste that email → role Viewer.',
				$msg,
				$prop_id,
				$client_email
			);
		}
		return $msg;
	}

	/**
	 * @param array<string,string> $credentials
	 * @return array<string,mixed>|WP_Error
	 */
	public static function list_account_summaries( array $credentials ) {
		$token = self::get_access_token( $credentials );
		if ( is_wp_error( $token ) ) {
			return $token;
		}
		$response = wp_remote_get(
			self::ADMIN_BASE . '/accountSummaries',
			array(
				'timeout' => 45,
				'headers' => array(
					'Authorization' => 'Bearer ' . $token,
					'Accept'        => 'application/json',
				),
			)
		);
		if ( is_wp_error( $response ) ) {
			return $response;
		}
		$code = (int) wp_remote_retrieve_response_code( $response );
		$raw  = wp_remote_retrieve_body( $response );
		$data = json_decode( $raw, true );
		if ( $code < 200 || $code >= 300 ) {
			$msg = is_array( $data ) && ! empty( $data['error']['message'] )
				? (string) $data['error']['message']
				: ( $raw !== '' ? $raw : 'HTTP ' . $code );
			return new WP_Error( 'neo-pulse_ga_admin', $msg, array( 'status' => $code ) );
		}
		return is_array( $data ) ? $data : array();
	}

	/**
	 * @param array<string,string> $credentials
	 * @param array<string,mixed>  $payload
	 * @return array<string,mixed>|WP_Error
	 */
	public static function run_report( array $credentials, string $property_id, array $payload ) {
		$token = self::get_access_token( $credentials );
		if ( is_wp_error( $token ) ) {
			return $token;
		}
		$url      = self::DATA_BASE . '/properties/' . rawurlencode( $property_id ) . ':runReport';
		$response = wp_remote_post(
			$url,
			array(
				'timeout' => 60,
				'headers' => array(
					'Authorization' => 'Bearer ' . $token,
					'Content-Type'  => 'application/json',
					'Accept'        => 'application/json',
				),
				'body'    => wp_json_encode( $payload ),
			)
		);
		if ( is_wp_error( $response ) ) {
			return $response;
		}
		$code = (int) wp_remote_retrieve_response_code( $response );
		$raw  = wp_remote_retrieve_body( $response );
		$data = json_decode( $raw, true );
		if ( $code < 200 || $code >= 300 ) {
			$msg = is_array( $data ) && ! empty( $data['error']['message'] )
				? (string) $data['error']['message']
				: ( $raw !== '' ? $raw : 'HTTP ' . $code );
			return new WP_Error( 'neo-pulse_ga_report', $msg, array( 'status' => $code ) );
		}
		return is_array( $data ) ? $data : array();
	}

	public static function map_error_status( WP_Error $error ): int {
		$msg    = $error->get_error_message();
		$status = (int) ( $error->get_error_data()['status'] ?? 0 );
		if ( $status === 403 || stripos( $msg, 'PERMISSION_DENIED' ) !== false ) {
			return 403;
		}
		if ( $status === 404 || stripos( $msg, 'NOT_FOUND' ) !== false ) {
			return 404;
		}
		return 502;
	}

	/**
	 * @param array<string,mixed> $response
	 */
	private static function sum_metric_rows( array $response ): float {
		$total = 0.0;
		$rows  = isset( $response['rows'] ) && is_array( $response['rows'] ) ? $response['rows'] : array();
		foreach ( $rows as $row ) {
			if ( ! is_array( $row ) ) {
				continue;
			}
			$values = isset( $row['metricValues'] ) && is_array( $row['metricValues'] ) ? $row['metricValues'] : array();
			if ( ! empty( $values[0]['value'] ) ) {
				$total += (float) $values[0]['value'];
			}
		}
		return $total;
	}

	/**
	 * @param array<string,string> $credentials
	 * @return string|WP_Error
	 */
	private static function get_access_token( array $credentials ) {
		$scope     = self::SCOPE_READONLY;
		$cache_key = 'neo-pulse_app_ga_token_' . md5( $credentials['client_email'] . '|' . $scope );
		$cached    = get_transient( $cache_key );
		if ( is_string( $cached ) && $cached !== '' ) {
			return $cached;
		}
		$jwt = self::build_jwt( $credentials['client_email'], $credentials['private_key'], $scope );
		if ( is_wp_error( $jwt ) ) {
			return $jwt;
		}
		$response = wp_remote_post(
			self::TOKEN_URL,
			array(
				'timeout' => 30,
				'headers' => array( 'Content-Type' => 'application/x-www-form-urlencoded' ),
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
		$data = json_decode( wp_remote_retrieve_body( $response ), true );
		if ( $code < 200 || $code >= 300 || ! is_array( $data ) || empty( $data['access_token'] ) ) {
			$msg = is_array( $data ) && ! empty( $data['error_description'] )
				? (string) $data['error_description']
				: 'Could not obtain GA access token.';
			return new WP_Error( 'neo-pulse_ga_token', $msg );
		}
		$token = (string) $data['access_token'];
		set_transient( $cache_key, $token, 3000 );
		return $token;
	}

	/**
	 * @return string|WP_Error
	 */
	private static function build_jwt( string $client_email, string $private_key, string $scope ) {
		$now    = time();
		$header = self::b64( wp_json_encode( array( 'alg' => 'RS256', 'typ' => 'JWT' ) ) );
		$claim  = self::b64(
			wp_json_encode(
				array(
					'iss'   => $client_email,
					'scope' => $scope,
					'aud'   => self::TOKEN_URL,
					'exp'   => $now + 3600,
					'iat'   => $now,
				)
			)
		);
		$input = $header . '.' . $claim;
		$key   = openssl_pkey_get_private( $private_key );
		if ( false === $key ) {
			return new WP_Error( 'neo-pulse_ga_key', 'Could not read GA service account private key.' );
		}
		$signature = '';
		$signed    = openssl_sign( $input, $signature, $key, OPENSSL_ALGO_SHA256 );
		if ( function_exists( 'openssl_free_key' ) ) {
			openssl_free_key( $key );
		}
		if ( ! $signed ) {
			return new WP_Error( 'neo-pulse_ga_sign', 'Could not sign GA JWT.' );
		}
		return $input . '.' . self::b64( $signature );
	}

	private static function b64( string $data ): string {
		return rtrim( strtr( base64_encode( $data ), '+/', '-_' ), '=' );
	}
}
