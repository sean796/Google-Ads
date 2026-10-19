<?php
/**
 * GSC service account credentials (uploads/neo-pulse-data/gsc-service-account.json).
 *
 * @package Neo_Pulse_App
 */

defined( 'ABSPATH' ) || exit;

class Neo_Pulse_App_Gsc_Credentials {

	public static function reload(): void {
		if ( class_exists( 'Neo_Pulse_App_Gsc_Service_Account' ) ) {
			Neo_Pulse_App_Gsc_Service_Account::clear_credentials_cache();
		}
	}

	/**
	 * @return array{configured:bool,client_email?:string}
	 */
	public static function credentials_status(): array {
		$raw = Neo_Pulse_App_Secrets::gsc_service_account_json();
		if ( $raw === '' ) {
			return array( 'configured' => false );
		}
		$data = json_decode( $raw, true );
		if ( ! is_array( $data ) || empty( $data['client_email'] ) ) {
			return array( 'configured' => false );
		}
		return array(
			'configured'   => true,
			'client_email' => trim( (string) $data['client_email'] ),
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
					'error'   => 'Saving credentials from the UI is only allowed locally. On production, upload via hub migration or set the JSON file on disk.',
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

		$email = isset( $data['client_email'] ) ? trim( (string) $data['client_email'] ) : '';
		$key   = isset( $data['private_key'] ) ? str_replace( '\\n', "\n", (string) $data['private_key'] ) : '';
		if ( $email === '' || $key === '' ) {
			return array(
				'statusCode' => 400,
				'body'       => array( 'success' => false, 'error' => 'JSON must include client_email and private_key.' ),
			);
		}

		if ( ! Neo_Pulse_App_Json_File_Store::write( Neo_Pulse_App_Data_Paths::gsc_service_account_path(), $data ) ) {
			return array(
				'statusCode' => 500,
				'body'       => array( 'success' => false, 'error' => 'Could not write credentials file.' ),
			);
		}

		self::reload();
		$test = Neo_Pulse_App_Gsc_Service_Account::test_connection();
		if ( empty( $test['success'] ) ) {
			return array(
				'statusCode' => 500,
				'body'       => array(
					'success' => false,
					'error'   => (string) ( $test['error'] ?? 'GSC credentials saved but connection test failed.' ),
				),
			);
		}

		return array(
			'statusCode' => 200,
			'body'       => array(
				'success'      => true,
				'message'      => 'GSC credentials saved. They are active immediately.',
				'client_email' => $email,
				'siteCount'    => (int) ( $test['siteCount'] ?? 0 ),
			),
		);
	}

	private static function is_production_save_blocked(): bool {
		return defined( 'WP_ENVIRONMENT_TYPE' ) && WP_ENVIRONMENT_TYPE === 'production';
	}
}
