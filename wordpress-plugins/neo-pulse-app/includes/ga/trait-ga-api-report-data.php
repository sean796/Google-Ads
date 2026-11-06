<?php
/**
 * GA4 report_data entry point and period metric merging.
 *
 * @package Neo_Pulse_App
 */

defined( 'ABSPATH' ) || exit;

trait Neo_Pulse_App_Ga_Api_Trait_Report_Data {

	/**
	 * @param array<string,mixed> $body
	 * @return array{statusCode:int,body:array<string,mixed>}
	 */
	public static function report_data( array $body ): array {
		$property_id = isset( $body['propertyId'] ) ? trim( (string) $body['propertyId'] ) : '';
		if ( $property_id === '' ) {
			return array(
				'statusCode' => 400,
				'body'       => array( 'success' => false, 'error' => 'Missing or invalid propertyId' ),
			);
		}
		if ( empty( $body['startDate'] ) || empty( $body['endDate'] ) ) {
			return array(
				'statusCode' => 400,
				'body'       => array(
					'success' => false,
					'error'   => 'Missing date fields: startDate, endDate',
				),
			);
		}
		$include_compare = ! isset( $body['includeCompare'] ) || ! empty( $body['includeCompare'] );
		if ( $include_compare && ( empty( $body['compareStartDate'] ) || empty( $body['compareEndDate'] ) ) ) {
			return array(
				'statusCode' => 400,
				'body'       => array(
					'success' => false,
					'error'   => 'Missing date fields: compareStartDate, compareEndDate',
				),
			);
		}

		$resolved = Neo_Pulse_App_Ga_Credentials::resolve_from_body( $body );
		if ( ! empty( $resolved['error'] ) ) {
			return array(
				'statusCode' => (int) ( $resolved['status'] ?? 503 ),
				'body'       => array( 'success' => false, 'error' => $resolved['error'] ),
			);
		}

		$credentials = $resolved['credentials'];
		$prop_id     = self::normalize_property_id( $property_id );
		if ( is_wp_error( $prop_id ) ) {
			return array(
				'statusCode' => 400,
				'body'       => array( 'success' => false, 'error' => $prop_id->get_error_message() ),
			);
		}

		if ( ! empty( $body['organicDashboardFastPath'] ) ) {
			$timeout = isset( $body['requestTimeoutSeconds'] )
				? max( 15, min( 120, (int) $body['requestTimeoutSeconds'] ) )
				: 55;
			return self::report_data_organic_dashboard_fast( $body, $credentials, $prop_id, $timeout );
		}

		$probe = self::run_report(
			$credentials,
			$prop_id,
			array(
				'dateRanges' => array( array( 'startDate' => 'yesterday', 'endDate' => 'yesterday' ) ),
				'metrics'    => array( array( 'name' => 'activeUsers' ) ),
			)
		);
		if ( is_wp_error( $probe ) ) {
			return array(
				'statusCode' => self::map_error_status( $probe ),
				'body'       => self::error_body_for_report( $probe, $credentials, $prop_id ),
			);
		}

		$result = array( 'success' => true, 'propertyId' => $prop_id );
		$filter      = array(
			'filter' => array(
				'fieldName'    => 'sessionDefaultChannelGroup',
				'stringFilter' => array( 'matchType' => 'EXACT', 'value' => 'Organic Search' ),
			),
		);
		$current     = array( 'startDate' => (string) $body['startDate'], 'endDate' => (string) $body['endDate'] );
		$compare = array(
			'startDate' => (string) ( $body['compareStartDate'] ?? $body['startDate'] ),
			'endDate'   => (string) ( $body['compareEndDate'] ?? $body['endDate'] ),
		);
		$base    = array(
			'dimensions'      => array( array( 'name' => 'sessionDefaultChannelGroup' ) ),
			'dimensionFilter' => $filter,
		);

		if ( $include_compare ) {
			self::merge_period_metric( $result, 'conversions', $credentials, $prop_id, $base, $current, $compare, 'conversions' );
			self::merge_period_metric( $result, 'organicTraffic', $credentials, $prop_id, $base, $current, $compare, 'sessions', true );
		} else {
			self::merge_period_metric_current_only( $result, 'conversions', $credentials, $prop_id, $base, $current, 'conversions' );
			self::merge_period_metric_current_only( $result, 'organicTraffic', $credentials, $prop_id, $base, $current, 'sessions', true );
		}

		$oa_current = self::fetch_organic_acquisition_period( $credentials, $prop_id, $base, $current );
		if ( is_wp_error( $oa_current ) ) {
			return array(
				'statusCode' => self::map_error_status( $oa_current ),
				'body'       => self::error_body_for_report( $oa_current, $credentials, $prop_id ),
			);
		}
		$oa_previous = null;
		if ( $include_compare ) {
			$oa_previous = self::fetch_organic_acquisition_period( $credentials, $prop_id, $base, $compare );
			if ( is_wp_error( $oa_previous ) ) {
				return array(
					'statusCode' => self::map_error_status( $oa_previous ),
					'body'       => self::error_body_for_report( $oa_previous, $credentials, $prop_id ),
				);
			}
		}
		if ( is_array( $oa_current ) && ( ! $include_compare || is_array( $oa_previous ) ) ) {
			$organic_acquisition = array(
				'current'  => $oa_current,
				'previous' => $include_compare ? $oa_previous : self::empty_organic_acquisition_period(),
			);
			$result['organicAcquisition']        = $organic_acquisition;
			$result['organicTrafficAcquisition'] = $organic_acquisition;
		} else {
			return array(
				'statusCode' => 502,
				'body'       => array(
					'success'      => false,
					'error'        => 'GA4 organic acquisition metrics missing for this property and date range.',
					'propertyId'   => $prop_id,
					'client_email' => $credentials['client_email'] ?? '',
				),
			);
		}

		$include_acquisition_monthly = ! empty( $body['includeOrganicTrafficAcquisitionMonthly'] )
			|| ! empty( $body['includeOrganicUsersMonthly'] );
		if ( $include_acquisition_monthly ) {
			$monthly = self::fetch_organic_search_traffic_acquisition_monthly(
				$credentials,
				$prop_id,
				$base,
				$current
			);
			if ( is_wp_error( $monthly ) ) {
				return array(
					'statusCode' => self::map_error_status( $monthly ),
					'body'       => self::error_body_for_report( $monthly, $credentials, $prop_id ),
				);
			}
			if ( is_array( $monthly ) ) {
				$result['organicTrafficAcquisitionMonthly'] = $monthly;
			}

			$ou_current = self::fetch_organic_first_user_medium_users_monthly( $credentials, $prop_id, $current );
			if ( is_wp_error( $ou_current ) ) {
				return array(
					'statusCode' => self::map_error_status( $ou_current ),
					'body'       => self::error_body_for_report( $ou_current, $credentials, $prop_id ),
				);
			}
			if ( is_array( $ou_current ) ) {
				$result['organicUsersMonthly'] = $ou_current;
				$ou_previous                   = self::empty_organic_users_totals();
				if ( $include_compare ) {
					$ou_prev_block = self::fetch_organic_first_user_medium_users_monthly( $credentials, $prop_id, $compare );
					if ( is_wp_error( $ou_prev_block ) ) {
						return array(
							'statusCode' => self::map_error_status( $ou_prev_block ),
							'body'       => self::error_body_for_report( $ou_prev_block, $credentials, $prop_id ),
						);
					}
					if ( is_array( $ou_prev_block ) && ! empty( $ou_prev_block['totals'] ) ) {
						$ou_previous = $ou_prev_block['totals'];
					}
				}
				$result['organicUsers'] = array(
					'current'  => ! empty( $ou_current['totals'] ) ? $ou_current['totals'] : self::empty_organic_users_totals(),
					'previous' => $ou_previous,
				);
			}
		}

		return array( 'statusCode' => 200, 'body' => $result );
	}

	/**
	 * @param array<string,mixed>  $result
	 * @param array<string,string> $credentials
	 * @param array<string,mixed>  $base
	 * @param array<string,string> $current
	 * @param array<string,string> $compare
	 */
	/**
	 * @param array<string,mixed>  $base
	 * @param array<string,string> $current
	 */
	private static function merge_period_metric_current_only(
		array &$result,
		string $key,
		array $credentials,
		string $prop_id,
		array $base,
		array $current,
		string $metric,
		bool $sessions_shape = false
	): void {
		$cur = self::run_report(
			$credentials,
			$prop_id,
			array_merge( $base, array( 'dateRanges' => array( $current ), 'metrics' => array( array( 'name' => $metric ) ) ) )
		);
		if ( is_wp_error( $cur ) ) {
			return;
		}
		$current_total = self::sum_metric_rows( $cur );
		if ( $sessions_shape ) {
			$result[ $key ] = array(
				'sessionsCurrent'  => $current_total,
				'sessionsPrevious' => 0,
				'change'           => $current_total,
				'changePercent'    => null,
			);
			return;
		}
		$result[ $key ] = array(
			'current'       => $current_total,
			'previous'      => 0,
			'change'        => $current_total,
			'changePercent' => null,
		);
	}

	private static function merge_period_metric(
		array &$result,
		string $key,
		array $credentials,
		string $prop_id,
		array $base,
		array $current,
		array $compare,
		string $metric,
		bool $sessions_shape = false
	): void {
		$cur = self::run_report(
			$credentials,
			$prop_id,
			array_merge( $base, array( 'dateRanges' => array( $current ), 'metrics' => array( array( 'name' => $metric ) ) ) )
		);
		$prev = self::run_report(
			$credentials,
			$prop_id,
			array_merge( $base, array( 'dateRanges' => array( $compare ), 'metrics' => array( array( 'name' => $metric ) ) ) )
		);
		if ( is_wp_error( $cur ) || is_wp_error( $prev ) ) {
			return;
		}
		$current_total  = self::sum_metric_rows( $cur );
		$previous_total = self::sum_metric_rows( $prev );
		$change         = $current_total - $previous_total;
		if ( $sessions_shape ) {
			$result[ $key ] = array(
				'sessionsCurrent'  => $current_total,
				'sessionsPrevious' => $previous_total,
				'change'           => $change,
				'changePercent'    => $previous_total > 0 ? (int) round( ( $change / $previous_total ) * 100 ) : null,
			);
			return;
		}
		$result[ $key ] = array(
			'current'       => $current_total,
			'previous'      => $previous_total,
			'change'        => $change,
			'changePercent' => $previous_total > 0 ? (int) round( ( $change / $previous_total ) * 100 ) : null,
		);
	}
}
