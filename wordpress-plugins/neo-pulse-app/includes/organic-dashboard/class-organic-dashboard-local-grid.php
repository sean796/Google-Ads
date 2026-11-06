<?php
/**
 * Server-side DataForSEO Google Maps Local Grid Studio service and scan storage.
 *
 * @package Neo_Pulse_App
 */

defined( 'ABSPATH' ) || exit;

$neo_pulse_app_local_grid_dir = __DIR__ . '/';
require_once $neo_pulse_app_local_grid_dir . 'trait-organic-dashboard-local-grid-paths-geocode.php';
require_once $neo_pulse_app_local_grid_dir . 'trait-organic-dashboard-local-grid-business-resolve.php';
require_once $neo_pulse_app_local_grid_dir . 'trait-organic-dashboard-local-grid-scan-execution.php';
require_once $neo_pulse_app_local_grid_dir . 'trait-organic-dashboard-local-grid-workspace-scans.php';

class Neo_Pulse_App_Organic_Dashboard_Local_Grid {

	const SUBDIR = 'local-grid';

	use Neo_Pulse_App_Organic_Dashboard_Local_Grid_Trait_Paths_Geocode;
	use Neo_Pulse_App_Organic_Dashboard_Local_Grid_Trait_Business_Resolve;
	use Neo_Pulse_App_Organic_Dashboard_Local_Grid_Trait_Scan_Execution;
	use Neo_Pulse_App_Organic_Dashboard_Local_Grid_Trait_Workspace_Scans;

	/**
	 * Client report narrative for a saved Local Grid scan (OpenRouter, same contract as reporting highlights).
	 *
	 * @param array<string,mixed> $body siteId, siteName, siteUrl (optional), localGrid snapshot block.
	 * @return array{statusCode:int,body:array<string,mixed>}
	 */
	public static function report_narrative( array $body ): array {
		$site_id = isset( $body['siteId'] ) ? trim( (string) $body['siteId'] ) : '';
		$site_name = isset( $body['siteName'] ) ? trim( (string) $body['siteName'] ) : '';
		$site_url  = isset( $body['siteUrl'] ) ? trim( (string) $body['siteUrl'] ) : '';
		$local_grid = isset( $body['localGrid'] ) && is_array( $body['localGrid'] ) ? $body['localGrid'] : null;

		if ( $site_id === '' || $local_grid === null || empty( $local_grid['scanId'] ) ) {
			return array(
				'statusCode' => 400,
				'body'       => array(
					'success' => false,
					'error'   => 'siteId and localGrid.scanId are required.',
				),
			);
		}

		if ( class_exists( 'Neo_Pulse_App_Chat_Openrouter' ) ) {
			$request_key = Neo_Pulse_App_Chat_Openrouter::api_key_from_request( $body );
			if ( $request_key !== '' ) {
				Neo_Pulse_App_Chat_Openrouter::use_request_api_key( $request_key );
			}
		}

		try {
			$snapshot = array(
				'siteName'        => $site_name !== '' ? $site_name : 'This site',
				'siteUrl'         => $site_url,
				'showCompare'     => false,
				'reportStructure' => 'period_progress',
				'localGrid'       => $local_grid,
			);

			$result = Neo_Pulse_App_Organic_Dashboard_Reporting_Highlights::generate_local_grid_report_narrative(
				$body,
				$site_id,
				$snapshot
			);

			if ( (int) ( $result['statusCode'] ?? 500 ) !== 200 ) {
				$error = is_array( $result['body'] ?? null ) && is_string( $result['body']['error'] ?? null )
					? (string) $result['body']['error']
					: 'Local grid narrative could not be generated.';
				return array(
					'statusCode' => (int) ( $result['statusCode'] ?? 502 ),
					'body'       => array(
						'success' => false,
						'error'   => $error,
					),
				);
			}

			$list = isset( $result['body']['highlights']['localGridNarrative'] ) && is_array( $result['body']['highlights']['localGridNarrative'] )
				? $result['body']['highlights']['localGridNarrative']
				: array();

			return array(
				'statusCode' => 200,
				'body'       => array(
					'success'            => true,
					'localGridNarrative' => $list,
				),
			);
		} catch ( Exception $e ) {
			return array(
				'statusCode' => 500,
				'body'       => array(
					'success' => false,
					'error'   => $e->getMessage(),
				),
			);
		} finally {
			if ( class_exists( 'Neo_Pulse_App_Chat_Openrouter' ) ) {
				Neo_Pulse_App_Chat_Openrouter::clear_request_api_key();
			}
		}
	}
}
