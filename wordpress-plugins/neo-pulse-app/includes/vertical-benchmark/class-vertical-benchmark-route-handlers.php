<?php
/**
 * /api/vertical-benchmarks/* route handlers.
 *
 * @package Neo_Pulse_App
 */

defined( 'ABSPATH' ) || exit;

class Neo_Pulse_App_Vertical_Benchmark_Route_Handlers {

	/**
	 * @param string              $subpath Route after vertical-benchmarks/.
	 * @param string              $method  HTTP method.
	 * @param array<string,mixed> $body    JSON body.
	 */
	public static function dispatch_http( string $subpath, string $method, array $body ): void {
		$subpath = trim( $subpath, '/' );
		$method  = strtoupper( $method );

		if ( $subpath === 'taxonomy' && $method === 'GET' ) {
			Neo_Pulse_App_Api_Dispatcher::send_json(
				array(
					'ok'       => true,
					'taxonomy' => Neo_Pulse_App_Vertical_Benchmark_Taxonomy::TAXONOMY,
				)
			);
			return;
		}

		if ( $subpath === 'classify-clients' && $method === 'POST' ) {
			self::classify_clients( $body );
			return;
		}

		if ( $subpath === 'export-gsc-csv' && $method === 'POST' ) {
			self::export_gsc_csv( $body );
			return;
		}

		Neo_Pulse_App_Api_Dispatcher::send_json( array( 'ok' => false, 'error' => 'Not found' ), 404 );
	}

	/** @param array<string,mixed> $body */
	private static function classify_clients( array $body ): void {
		try {
			$api_key = Neo_Pulse_App_Vertical_Benchmark_Openrouter::resolve_key( (string) ( $body['apiKey'] ?? '' ) );
			if ( $api_key === '' ) {
				Neo_Pulse_App_Api_Dispatcher::send_json( array( 'ok' => false, 'error' => 'OpenRouter API key required for Gemini client tags' ), 400 );
				return;
			}

			$body_sites = isset( $body['sites'] ) && is_array( $body['sites'] ) ? $body['sites'] : null;
			$sites      = Neo_Pulse_App_Vertical_Benchmark_Sites::resolve_for_job( $body_sites );
			$site_ids   = isset( $body['siteIds'] ) && is_array( $body['siteIds'] ) ? $body['siteIds'] : null;
			$sites      = Neo_Pulse_App_Vertical_Benchmark_Sites::filter_by_ids( $sites, $site_ids );

			if ( empty( $sites ) ) {
				Neo_Pulse_App_Api_Dispatcher::send_json( array( 'ok' => false, 'error' => 'No sites to classify' ), 400 );
				return;
			}

			$tags = Neo_Pulse_App_Vertical_Benchmark_Classify::classify_client_tags_batch(
				$sites,
				array(
					'apiKey' => $api_key,
					'model'  => isset( $body['model'] ) ? (string) $body['model'] : '',
				)
			);

			$clients = array();
			foreach ( $tags as $t ) {
				$clients[] = array(
					'siteId'         => $t['siteId'],
					'clientTag'      => $t['clientTag'],
					'clientTagLabel' => $t['clientTagLabel'] ?? Neo_Pulse_App_Vertical_Benchmark_Taxonomy::label( (string) $t['clientTag'] ),
					'source'         => $t['source'] ?? 'taxonomy',
				);
			}

			Neo_Pulse_App_Vertical_Benchmark_Sites::save_classification_snapshot( $clients );
			Neo_Pulse_App_Api_Dispatcher::send_json( array( 'ok' => true, 'clients' => $clients ) );
		} catch ( Exception $e ) {
			Neo_Pulse_App_Api_Dispatcher::send_json( array( 'ok' => false, 'error' => $e->getMessage() ), 500 );
		}
	}

	/** @param array<string,mixed> $body */
	private static function export_gsc_csv( array $body ): void {
		$api_key = Neo_Pulse_App_Vertical_Benchmark_Openrouter::resolve_key( (string) ( $body['apiKey'] ?? '' ) );
		if ( $api_key === '' ) {
			Neo_Pulse_App_Api_Dispatcher::send_json( array( 'ok' => false, 'error' => 'OpenRouter API key required for Gemini URL labeling' ), 400 );
			return;
		}

		$body_sites = isset( $body['sites'] ) && is_array( $body['sites'] ) ? $body['sites'] : null;
		$sites      = Neo_Pulse_App_Vertical_Benchmark_Sites::resolve_for_job( $body_sites );
		$site_ids   = isset( $body['siteIds'] ) && is_array( $body['siteIds'] ) ? $body['siteIds'] : null;
		$sites      = Neo_Pulse_App_Vertical_Benchmark_Sites::filter_by_ids( $sites, $site_ids );

		if ( empty( $sites ) ) {
			Neo_Pulse_App_Api_Dispatcher::send_json( array( 'ok' => false, 'error' => 'No sites selected for export' ), 400 );
			return;
		}

		if ( function_exists( 'set_time_limit' ) ) {
			@set_time_limit( 300 );
		}
		if ( function_exists( 'ignore_user_abort' ) ) {
			@ignore_user_abort( true );
		}
		status_header( 200 );
		header( 'Content-Type: application/x-ndjson' );
		header( 'X-Accel-Buffering: no' );
		header( 'Cache-Control: no-cache' );
		while ( ob_get_level() > 0 ) {
			@ob_end_flush();
		}

		$write_line = static function ( $obj ) {
			echo wp_json_encode( $obj ) . "\n";
			if ( function_exists( 'ob_flush' ) ) {
				@ob_flush();
			}
			flush();
		};

		try {
			$out = Neo_Pulse_App_Vertical_Benchmark_Gsc_Export::export_rows(
				$sites,
				array(
					'apiKey'                 => $api_key,
					'model'                  => isset( $body['model'] ) ? (string) $body['model'] : '',
					'contentKinds'           => isset( $body['contentKinds'] ) && is_array( $body['contentKinds'] ) ? $body['contentKinds'] : null,
					'clientTagBySiteId'      => isset( $body['clientTagBySiteId'] ) && is_array( $body['clientTagBySiteId'] ) ? $body['clientTagBySiteId'] : array(),
					'clientTagLabelBySiteId' => isset( $body['clientTagLabelBySiteId'] ) && is_array( $body['clientTagLabelBySiteId'] ) ? $body['clientTagLabelBySiteId'] : array(),
					'onProgress'             => static function ( $progress ) use ( $write_line ) {
						$write_line( array_merge( array( 'type' => 'progress' ), $progress ) );
					},
				)
			);
			$write_line(
				array(
					'type'         => 'done',
					'ok'           => true,
					'rows'         => $out['rows'],
					'extendedRows' => $out['extendedRows'],
					'results'      => $out['results'],
					'dateRange'    => $out['dateRange'],
				)
			);
		} catch ( Exception $e ) {
			$write_line(
				array(
					'type'    => 'done',
					'ok'      => true,
					'rows'    => array(),
					'results' => array_map(
						static function ( $site ) use ( $e ) {
							return array(
								'siteId'  => (string) ( $site['id'] ?? '' ),
								'skipped' => true,
								'reason'  => $e->getMessage(),
							);
						},
						$sites
					),
					'error'   => $e->getMessage(),
				)
			);
		}
	}
}
