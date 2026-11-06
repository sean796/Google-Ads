<?php
/**
 * GA4 organic dashboard fast path and parallel report runner.
 *
 * @package Neo_Pulse_App
 */

defined( 'ABSPATH' ) || exit;

trait Neo_Pulse_App_Ga_Api_Trait_Organic_Dashboard_Fast {

	/**
	 * Organic Performance: one token, all runReport calls in curl_multi (no probe).
	 *
	 * @param array<string,mixed>  $body
	 * @param array<string,string> $credentials
	 * @return array{statusCode:int,body:array<string,mixed>}
	 */
	private static function report_data_organic_dashboard_fast(
		array $body,
		array $credentials,
		string $prop_id,
		int $timeout_seconds
	): array {
		$include_compare = ! isset( $body['includeCompare'] ) || ! empty( $body['includeCompare'] );
		$current         = array(
			'startDate' => (string) $body['startDate'],
			'endDate'   => (string) $body['endDate'],
		);
		$compare         = array(
			'startDate' => (string) ( $body['compareStartDate'] ?? $body['startDate'] ),
			'endDate'   => (string) ( $body['compareEndDate'] ?? $body['endDate'] ),
		);
		$filter          = array(
			'filter' => array(
				'fieldName'    => 'sessionDefaultChannelGroup',
				'stringFilter' => array( 'matchType' => 'EXACT', 'value' => 'Organic Search' ),
			),
		);
		$base            = array(
			'dimensions'      => array( array( 'name' => 'sessionDefaultChannelGroup' ) ),
			'dimensionFilter' => $filter,
		);
		$acq_metrics     = array(
			array( 'name' => 'sessions' ),
			array( 'name' => 'engagedSessions' ),
			array( 'name' => 'engagementRate' ),
			array( 'name' => 'averageSessionDuration' ),
			array( 'name' => 'eventsPerSession' ),
			array( 'name' => 'eventCount' ),
			array( 'name' => 'keyEvents' ),
		);
		$ta_metrics      = array(
			array( 'name' => 'sessions' ),
			array( 'name' => 'engagedSessions' ),
			array( 'name' => 'engagementRate' ),
			array( 'name' => 'averageSessionDuration' ),
			array( 'name' => 'eventsPerSession' ),
			array( 'name' => 'eventCount' ),
			array( 'name' => 'keyEvents' ),
		);
		$user_filter     = array(
			'filter' => array(
				'fieldName'    => 'firstUserDefaultChannelGroup',
				'stringFilter' => array(
					'matchType' => 'EXACT',
					'value'     => 'Organic Search',
				),
			),
		);
		$user_metrics    = array(
			array( 'name' => 'totalUsers' ),
			array( 'name' => 'newUsers' ),
			array( 'name' => 'userKeyEventRate' ),
			array( 'name' => 'keyEvents' ),
		);

		$requests = array();
		if ( $include_compare ) {
			$requests['conv_cur'] = array_merge(
				$base,
				array(
					'dateRanges' => array( $current ),
					'metrics'    => array( array( 'name' => 'conversions' ) ),
				)
			);
			$requests['conv_cmp'] = array_merge(
				$base,
				array(
					'dateRanges' => array( $compare ),
					'metrics'    => array( array( 'name' => 'conversions' ) ),
				)
			);
			$requests['sess_cur'] = array_merge(
				$base,
				array(
					'dateRanges' => array( $current ),
					'metrics'    => array( array( 'name' => 'sessions' ) ),
				)
			);
			$requests['sess_cmp'] = array_merge(
				$base,
				array(
					'dateRanges' => array( $compare ),
					'metrics'    => array( array( 'name' => 'sessions' ) ),
				)
			);
			$requests['acq_cur']  = array_merge(
				$base,
				array(
					'dateRanges' => array( $current ),
					'metrics'    => $acq_metrics,
				)
			);
			$requests['acq_cmp']  = array_merge(
				$base,
				array(
					'dateRanges' => array( $compare ),
					'metrics'    => $acq_metrics,
				)
			);
		} else {
			$requests['conv_cur'] = array_merge(
				$base,
				array(
					'dateRanges' => array( $current ),
					'metrics'    => array( array( 'name' => 'conversions' ) ),
				)
			);
			$requests['sess_cur'] = array_merge(
				$base,
				array(
					'dateRanges' => array( $current ),
					'metrics'    => array( array( 'name' => 'sessions' ) ),
				)
			);
			$requests['acq_cur']  = array_merge(
				$base,
				array(
					'dateRanges' => array( $current ),
					'metrics'    => $acq_metrics,
				)
			);
		}

		$include_acquisition_monthly = ! empty( $body['includeOrganicTrafficAcquisitionMonthly'] )
			|| ! empty( $body['includeOrganicUsersMonthly'] );
		if ( $include_acquisition_monthly ) {
			$requests['ta_monthly'] = array_merge(
				$base,
				array(
					'dateRanges' => array( $current ),
					'dimensions' => array( array( 'name' => 'yearMonth' ) ),
					'metrics'    => $ta_metrics,
					'orderBys'   => array(
						array(
							'dimension' => array( 'dimensionName' => 'yearMonth' ),
						),
					),
				)
			);
			$requests['ta_totals']  = array_merge(
				$base,
				array(
					'dateRanges' => array( $current ),
					'metrics'    => $ta_metrics,
				)
			);
			$requests['ou_monthly'] = array(
				'dateRanges'      => array( $current ),
				'dimensions'      => array( array( 'name' => 'yearMonth' ) ),
				'dimensionFilter' => $user_filter,
				'metrics'         => $user_metrics,
				'orderBys'        => array(
					array(
						'dimension' => array( 'dimensionName' => 'yearMonth' ),
					),
				),
			);
			$requests['ou_totals']  = array(
				'dateRanges'      => array( $current ),
				'dimensionFilter' => $user_filter,
				'metrics'         => $user_metrics,
			);
			if ( $include_compare ) {
				$requests['ou_cmp_totals'] = array(
					'dateRanges'      => array( $compare ),
					'dimensionFilter' => $user_filter,
					'metrics'         => $user_metrics,
				);
			}
		}

		$reports = self::run_reports_parallel( $credentials, $prop_id, $requests, $timeout_seconds );
		foreach ( $reports as $report ) {
			if ( is_wp_error( $report ) ) {
				return array(
					'statusCode' => self::map_error_status( $report ),
					'body'       => self::error_body_for_report( $report, $credentials, $prop_id ),
				);
			}
		}

		$result = array(
			'success'    => true,
			'propertyId' => $prop_id,
		);

		if ( $include_compare ) {
			$cur_conv  = self::sum_metric_rows( $reports['conv_cur'] );
			$prev_conv = self::sum_metric_rows( $reports['conv_cmp'] );
			$conv_chg  = $cur_conv - $prev_conv;
			$result['conversions'] = array(
				'current'       => $cur_conv,
				'previous'      => $prev_conv,
				'change'        => $conv_chg,
				'changePercent' => $prev_conv > 0 ? (int) round( ( $conv_chg / $prev_conv ) * 100 ) : null,
			);
			$cur_sess  = self::sum_metric_rows( $reports['sess_cur'] );
			$prev_sess = self::sum_metric_rows( $reports['sess_cmp'] );
			$sess_chg  = $cur_sess - $prev_sess;
			$result['organicTraffic'] = array(
				'sessionsCurrent'  => $cur_sess,
				'sessionsPrevious' => $prev_sess,
				'change'           => $sess_chg,
				'changePercent'    => $prev_sess > 0 ? (int) round( ( $sess_chg / $prev_sess ) * 100 ) : null,
			);
		} else {
			$cur_conv = self::sum_metric_rows( $reports['conv_cur'] );
			$result['conversions']    = array(
				'current'       => $cur_conv,
				'previous'      => 0,
				'change'        => $cur_conv,
				'changePercent' => null,
			);
			$cur_sess = self::sum_metric_rows( $reports['sess_cur'] );
			$result['organicTraffic'] = array(
				'sessionsCurrent'  => $cur_sess,
				'sessionsPrevious' => 0,
				'change'           => $cur_sess,
				'changePercent'    => null,
			);
		}

		$oa_current = self::parse_organic_acquisition_row( $reports['acq_cur'] );
		if ( ! is_array( $oa_current ) ) {
			$oa_current = self::empty_organic_acquisition_period();
		}
		$oa_previous = self::empty_organic_acquisition_period();
		if ( $include_compare ) {
			$parsed_prev = self::parse_organic_acquisition_row( $reports['acq_cmp'] );
			if ( is_array( $parsed_prev ) ) {
				$oa_previous = $parsed_prev;
			}
		}
		$organic_acquisition = array(
			'current'  => $oa_current,
			'previous' => $oa_previous,
		);
		$result['organicAcquisition']          = $organic_acquisition;
		$result['organicTrafficAcquisition'] = $organic_acquisition;

		if ( $include_acquisition_monthly ) {
			$months_raw = self::parse_ga_dimension_metric_rows( $reports['ta_monthly'], 'yearMonth' );
			$totals_raw = self::parse_ga_dimension_metric_rows( $reports['ta_totals'], null );
			$months     = array();
			foreach ( $months_raw as $row ) {
				$months[] = array_merge(
					array(
						'yearMonth' => $row['key'],
						'label'     => $row['label'],
					),
					self::normalize_organic_acquisition_metrics_row( $row['metrics'] )
				);
			}
			$totals_row = ! empty( $totals_raw ) ? self::normalize_organic_acquisition_metrics_row( $totals_raw[0]['metrics'] ) : self::empty_organic_acquisition_period();
			$result['organicTrafficAcquisitionMonthly'] = array(
				'periodStart' => $current['startDate'],
				'periodEnd'   => $current['endDate'],
				'totals'      => $totals_row,
				'months'      => $months,
			);

			$ou_months_raw = self::parse_ga_dimension_metric_rows( $reports['ou_monthly'], 'yearMonth' );
			$ou_totals_raw = self::parse_ga_dimension_metric_rows( $reports['ou_totals'], null );
			$ou_months     = array();
			foreach ( $ou_months_raw as $row ) {
				$ou_months[] = array_merge(
					array(
						'yearMonth' => $row['key'],
						'label'     => $row['label'],
					),
					$row['metrics']
				);
			}
			$ou_totals = ! empty( $ou_totals_raw ) ? $ou_totals_raw[0]['metrics'] : array();
			$result['organicUsersMonthly'] = array(
				'medium'      => 'organic',
				'dimension'   => 'firstUserMedium',
				'periodStart' => $current['startDate'],
				'periodEnd'   => $current['endDate'],
				'totals'      => $ou_totals,
				'months'      => $ou_months,
			);
			$ou_previous = self::empty_organic_users_totals();
			if ( $include_compare && isset( $reports['ou_cmp_totals'] ) ) {
				$ou_cmp_raw = self::parse_ga_dimension_metric_rows( $reports['ou_cmp_totals'], null );
				if ( ! empty( $ou_cmp_raw[0]['metrics'] ) ) {
					$ou_previous = $ou_cmp_raw[0]['metrics'];
				}
			}
			$result['organicUsers'] = array(
				'current'  => ! empty( $ou_totals ) ? $ou_totals : self::empty_organic_users_totals(),
				'previous' => $ou_previous,
			);
		}

		return array(
			'statusCode' => 200,
			'body'       => $result,
		);
	}

	/**
	 * @param array<string,string>     $credentials
	 * @param array<string,mixed>      $keyed_payloads
	 * @return array<string,array<string,mixed>|WP_Error>
	 */
	private static function run_reports_parallel(
		array $credentials,
		string $property_id,
		array $keyed_payloads,
		int $timeout_seconds
	): array {
		if ( count( $keyed_payloads ) === 0 ) {
			return array();
		}

		$timeout_seconds = max( 15, min( 120, $timeout_seconds ) );
		$token           = self::get_access_token( $credentials );
		if ( is_wp_error( $token ) ) {
			$out = array();
			foreach ( array_keys( $keyed_payloads ) as $key ) {
				$out[ $key ] = $token;
			}
			return $out;
		}

		$url = self::DATA_BASE . '/properties/' . rawurlencode( $property_id ) . ':runReport';
		if ( count( $keyed_payloads ) === 1 || ! function_exists( 'curl_multi_init' ) ) {
			$out = array();
			foreach ( $keyed_payloads as $key => $payload ) {
				$out[ $key ] = self::run_report( $credentials, $property_id, $payload );
			}
			return $out;
		}

		$headers = array(
			'Authorization: Bearer ' . $token,
			'Content-Type: application/json',
			'Accept: application/json',
		);
		$mh      = curl_multi_init();
		$handles = array();
		$results = array();

		foreach ( $keyed_payloads as $key => $payload ) {
			$ch = curl_init( $url );
			curl_setopt_array(
				$ch,
				array(
					CURLOPT_POST           => true,
					CURLOPT_POSTFIELDS     => wp_json_encode( $payload ),
					CURLOPT_HTTPHEADER     => $headers,
					CURLOPT_RETURNTRANSFER => true,
					CURLOPT_TIMEOUT        => $timeout_seconds,
				)
			);
			curl_multi_add_handle( $mh, $ch );
			$handles[ $key ] = $ch;
		}

		$running = null;
		do {
			$status = curl_multi_exec( $mh, $running );
			if ( $running ) {
				curl_multi_select( $mh, 1.0 );
			}
		} while ( $running && $status === CURLM_OK );

		foreach ( $handles as $key => $ch ) {
			$raw  = curl_multi_getcontent( $ch );
			$code = (int) curl_getinfo( $ch, CURLINFO_HTTP_CODE );
			curl_multi_remove_handle( $mh, $ch );
			curl_close( $ch );

			$data = json_decode( (string) $raw, true );
			if ( $code < 200 || $code >= 300 ) {
				$msg = is_array( $data ) && ! empty( $data['error']['message'] )
					? (string) $data['error']['message']
					: ( $raw !== '' ? (string) $raw : 'HTTP ' . $code );
				$results[ $key ] = new WP_Error( 'neo-pulse_ga_report', $msg, array( 'status' => $code ) );
				continue;
			}
			$results[ $key ] = is_array( $data ) ? $data : array();
		}

		curl_multi_close( $mh );
		return $results;
	}
}
