<?php
/**
 * Local Grid export execution runner (preflight + client harness contract).
 *
 * @package Neo_Pulse_App
 */

defined( 'ABSPATH' ) || exit;

class Neo_Pulse_App_Task_Execution_Runner_Local_Dominator_Export {

	/**
	 * Resolve stored keyword sentinel for client Local Grid harness.
	 *
	 * @param array<string,mixed> $site
	 */
	private static function normalize_stored_keyword( array $site, string $keyword ): string {
		$keyword = trim( $keyword );
		$lower   = strtolower( $keyword );
		if ( $lower === 'property' ) {
			return 'property';
		}
		if ( $lower === 'auto' || $keyword === '' ) {
			return 'auto';
		}
		if (
			$lower === 'blinds near me'
			&& strtolower( trim( (string) ( $site['name'] ?? '' ) ) ) !== 'advance blinds & drapery'
		) {
			return 'property';
		}
		return $keyword;
	}

	/**
	 * @param array<string,mixed> $task
	 * @param array<string,mixed> $execution
	 * @param array<string,mixed> $context
	 * @return array<string,mixed>
	 */
	public static function run( string $kind, array $task, array $execution, array $context ): array {
		unset( $kind, $task );

		$site_id = trim( (string) ( $context['siteId'] ?? '' ) );
		if ( $site_id === '' ) {
			return array( 'ok' => false, 'error' => 'wordpressSiteId is required.' );
		}

		$site = Neo_Pulse_App_Task_Execution_Site_Resolver::resolve_by_id( $site_id );
		if ( ! $site ) {
			return array( 'ok' => false, 'error' => 'Could not resolve WordPress site from sites.json.' );
		}

		$payload       = is_array( $context['payload'] ?? null ) ? $context['payload'] : array();
		$sanitized     = Neo_Pulse_App_Tasks_Store::sanitize_execution_payload( $payload );
		$business_name = trim( (string) ( $sanitized['businessName'] ?? '' ) );
		if ( $business_name === '' ) {
			$business_name = trim( (string) ( $site['name'] ?? '' ) );
		}
		if ( $business_name === '' ) {
			return array( 'ok' => false, 'error' => 'businessName is required.' );
		}

		$keyword = self::normalize_stored_keyword(
			$site,
			trim( (string) ( $sanitized['keyword'] ?? '' ) )
		);
		if ( $keyword === 'property' ) {
			$profile_kw = trim( (string) ( $site['primaryLocalKeyword'] ?? '' ) );
			if ( $profile_kw === '' ) {
				return array(
					'ok'    => false,
					'error' => 'Set Primary keyword on the property profile before running Local Grid export.',
				);
			}
		}

		$save_to_disk = ! array_key_exists( 'saveToDisk', $payload ) || ! empty( $payload['saveToDisk'] );
		$save_local   = ! empty( $sanitized['saveLocalArchive'] )
			|| ! array_key_exists( 'saveLocalArchive', $payload )
			|| ! empty( $payload['saveLocalArchive'] )
			|| ! empty( $sanitized['saveToGoogleDrive'] );
		$execution_id = (int) ( $execution['id'] ?? 0 );

		$contract = array_merge(
			array(
				'executionId'      => $execution_id,
				'siteId'           => $site_id,
				'businessName'     => $business_name,
				'keyword'          => $keyword,
				'saveToDisk'       => $save_to_disk,
				'saveLocalArchive' => $save_local,
			),
			Neo_Pulse_App_Tasks_Store::automation_email_contract_fields( $payload )
		);
		$contract = array_merge( $contract, Neo_Pulse_App_Tasks_Store::google_drive_contract_fields( $payload ) );

		return array(
			'ok'      => true,
			'status'  => 'awaiting_client',
			'message' => 'Ready for client Local Grid export harness.',
			'payload' => array(
				'clientRunContract' => $contract,
				'executionMode'     => 'client',
			),
		);
	}
}
