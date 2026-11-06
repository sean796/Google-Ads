<?php
/**
 * Google Analytics 4 service account credentials (uploads/neo-pulse-data/).
 *
 * @package Neo_Pulse_App
 */

defined( 'ABSPATH' ) || exit;

class Neo_Pulse_App_Ga_Credentials {

	/** @var array<string,string>|null */
	private static $cached = null;

	public static function reload(): void {
		self::$cached = null;
	}

	/**
	 * @return array{configured:bool,client_email?:string}
	 */
	public static function credentials_status(): array {
		$creds = self::get_stored_credentials();
		if ( ! is_array( $creds ) ) {
			return array( 'configured' => false );
		}
		return array(
			'configured'   => true,
			'client_email' => $creds['client_email'] ?? '',
		);
	}

	/**
	 * @param array<string,mixed> $body
	 * @return array{credentials?:array<string,string>,error?:string,status?:int}
	 */
	public static function resolve_from_body( array $body ) {
		$credentials = self::get_stored_credentials();
		$raw         = isset( $body['serviceAccountJson'] ) ? trim( (string) $body['serviceAccountJson'] ) : '';
		if ( $raw !== '' ) {
			$data = json_decode( $raw, true );
			if ( ! is_array( $data ) ) {
				return array(
					'error'  => 'Invalid serviceAccountJson: invalid JSON',
					'status' => 400,
				);
			}
			$credentials = self::normalize_credentials( $data );
		}
		if ( ! is_array( $credentials ) ) {
			return array(
				'error'  => 'Google Analytics not configured. Upload a service account JSON file in Settings or set GA_SERVICE_ACCOUNT_JSON in Environment.',
				'status' => 503,
			);
		}
		return array( 'credentials' => $credentials );
	}

	/**
	 * @param array<string,mixed> $body
	 * @return array{statusCode:int,body:array<string,mixed>}
	 */
	public static function test( array $body ): array {
		$resolved = self::resolve_from_body( $body );
		if ( ! empty( $resolved['error'] ) ) {
			return array(
				'statusCode' => (int) ( $resolved['status'] ?? 503 ),
				'body'       => array( 'success' => false, 'error' => $resolved['error'] ),
			);
		}

		$credentials = $resolved['credentials'];
		$property_id = isset( $body['propertyId'] ) ? trim( (string) $body['propertyId'] ) : '';

		if ( $property_id !== '' ) {
			$prop_id = Neo_Pulse_App_Ga_Api::normalize_property_id( $property_id );
			if ( is_wp_error( $prop_id ) ) {
				return array(
					'statusCode' => 400,
					'body'       => array( 'success' => false, 'error' => $prop_id->get_error_message() ),
				);
			}
			$result  = Neo_Pulse_App_Ga_Api::run_report(
				$credentials,
				(string) $prop_id,
				array(
					'dateRanges' => array( array( 'startDate' => 'yesterday', 'endDate' => 'yesterday' ) ),
					'metrics'    => array( array( 'name' => 'activeUsers' ) ),
				)
			);
			if ( is_wp_error( $result ) ) {
				return array(
					'statusCode' => Neo_Pulse_App_Ga_Api::map_error_status( $result ),
					'body'       => array(
						'success'      => false,
						'error'        => Neo_Pulse_App_Ga_Api::format_api_error_for_user_public(
							$result,
							$credentials['client_email'] ?? '',
							(string) $prop_id
						),
						'client_email' => $credentials['client_email'] ?? '',
						'propertyId'   => $prop_id,
					),
				);
			}
			return array(
				'statusCode' => 200,
				'body'       => array( 'success' => true, 'message' => 'Google Analytics connection OK' ),
			);
		}

		$result = Neo_Pulse_App_Ga_Api::list_account_summaries( $credentials );
		if ( is_wp_error( $result ) ) {
			return array(
				'statusCode' => Neo_Pulse_App_Ga_Api::map_error_status( $result ),
				'body'       => array( 'success' => false, 'error' => $result->get_error_message() ),
			);
		}

		return array(
			'statusCode' => 200,
			'body'       => array( 'success' => true, 'message' => 'Google Analytics credentials OK' ),
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
					'error'   => 'Saving credentials from the UI is only allowed locally. On production, set GA_SERVICE_ACCOUNT_JSON in Environment.',
				),
			);
		}

		$raw = isset( $body['serviceAccountJson'] ) ? trim( (string) $body['serviceAccountJson'] ) : '';
		if ( $raw === '' ) {
			return array(
				'statusCode' => 400,
				'body'       => array( 'success' => false, 'error' => 'Upload a service account JSON file and try again.' ),
			);
		}

		$data = json_decode( $raw, true );
		if ( ! is_array( $data ) ) {
			return array(
				'statusCode' => 400,
				'body'       => array( 'success' => false, 'error' => 'Invalid JSON: invalid' ),
			);
		}

		$credentials = self::normalize_credentials( $data );
		if ( empty( $credentials['client_email'] ) || empty( $credentials['private_key'] ) ) {
			return array(
				'statusCode' => 400,
				'body'       => array( 'success' => false, 'error' => 'JSON must include client_email and private_key.' ),
			);
		}

		$result = Neo_Pulse_App_Ga_Api::list_account_summaries( $credentials );
		if ( is_wp_error( $result ) ) {
			return array(
				'statusCode' => Neo_Pulse_App_Ga_Api::map_error_status( $result ),
				'body'       => array(
					'success' => false,
					'error'   => $result->get_error_message() ?: 'Credentials are invalid or lack access.',
				),
			);
		}

		if ( ! Neo_Pulse_App_Json_File_Store::write( Neo_Pulse_App_Data_Paths::ga_service_account_path(), $data ) ) {
			return array(
				'statusCode' => 500,
				'body'       => array( 'success' => false, 'error' => 'Could not write credentials file.' ),
			);
		}

		self::reload();
		return array(
			'statusCode' => 200,
			'body'       => array(
				'success'      => true,
				'message'      => 'Credentials saved. They are active immediately.',
				'client_email' => $credentials['client_email'],
			),
		);
	}

	/**
	 * @return array<string,string>|null
	 */
	private static function get_stored_credentials(): ?array {
		if ( is_array( self::$cached ) ) {
			return self::$cached;
		}
		// Wave 0: env and wp-config constants win over the uploads file.
		$raw = Neo_Pulse_App_Secrets::ga_service_account_json();
		if ( $raw !== '' ) {
			$data = json_decode( trim( $raw ), true );
			if ( is_array( $data ) ) {
				self::$cached = self::normalize_credentials( $data );
				return self::$cached;
			}
		}
		$file = Neo_Pulse_App_Json_File_Store::read( Neo_Pulse_App_Data_Paths::ga_service_account_path() );
		if ( is_array( $file ) ) {
			self::$cached = self::normalize_credentials( $file );
			return self::$cached;
		}
		return null;
	}

	/**
	 * @param array<string,mixed> $data
	 * @return array<string,string>
	 */
	private static function normalize_credentials( array $data ): array {
		$key = isset( $data['private_key'] ) ? (string) $data['private_key'] : '';
		return array(
			'client_email' => isset( $data['client_email'] ) ? trim( (string) $data['client_email'] ) : '',
			'private_key'  => str_replace( '\\n', "\n", $key ),
			'project_id'   => isset( $data['project_id'] ) ? (string) $data['project_id'] : '',
		);
	}

	private static function is_production_save_blocked(): bool {
		return defined( 'WP_ENVIRONMENT_TYPE' ) && WP_ENVIRONMENT_TYPE === 'production';
	}
}
