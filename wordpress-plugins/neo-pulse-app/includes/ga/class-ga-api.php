<?php
/**
 * Google Analytics 4 Admin/Data API calls.
 *
 * @package Neo_Pulse_App
 */

defined( 'ABSPATH' ) || exit;

class Neo_Pulse_App_Ga_Api {

	const SCOPE_READONLY = 'https://www.googleapis.com/auth/analytics.readonly';
	const TOKEN_URL      = 'https://oauth2.googleapis.com/token';
	const ADMIN_BASE     = 'https://analyticsadmin.googleapis.com/v1beta';
	const DATA_BASE      = 'https://analyticsdata.googleapis.com/v1beta';

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
	 * @return array{totalUsers:int,newUsers:int,userKeyEventRate:float,keyEvents:int}
	 */
	private static function empty_organic_users_totals(): array {
		return array(
			'totalUsers'       => 0,
			'newUsers'         => 0,
			'userKeyEventRate' => 0.0,
			'keyEvents'        => 0,
		);
	}

	/**
	 * GA4 User acquisition style block: first user medium = organic, by calendar month.
	 *
	 * @param array<string,string> $credentials
	 * @param array<string,string> $date_range startDate/endDate (YYYY-MM-DD)
	 * @return array<string,mixed>|WP_Error
	 */
	private static function fetch_organic_first_user_medium_users_monthly(
		array $credentials,
		string $prop_id,
		array $date_range
	) {
		$filter = array(
			'filter' => array(
				'fieldName'    => 'firstUserMedium',
				'stringFilter' => array(
					'matchType' => 'EXACT',
					'value'     => 'organic',
				),
			),
		);
		$metrics = array(
			array( 'name' => 'totalUsers' ),
			array( 'name' => 'newUsers' ),
			array( 'name' => 'userKeyEventRate' ),
			array( 'name' => 'keyEvents' ),
		);

		$monthly_report = self::run_report(
			$credentials,
			$prop_id,
			array(
				'dateRanges'      => array( $date_range ),
				'dimensions'      => array( array( 'name' => 'yearMonth' ) ),
				'dimensionFilter' => $filter,
				'metrics'         => $metrics,
				'orderBys'        => array(
					array(
						'dimension' => array( 'dimensionName' => 'yearMonth' ),
					),
				),
			)
		);
		if ( is_wp_error( $monthly_report ) ) {
			return $monthly_report;
		}

		$totals_report = self::run_report(
			$credentials,
			$prop_id,
			array(
				'dateRanges'      => array( $date_range ),
				'dimensionFilter' => $filter,
				'metrics'         => $metrics,
			)
		);
		if ( is_wp_error( $totals_report ) ) {
			return $totals_report;
		}

		$months_raw = self::parse_ga_dimension_metric_rows( $monthly_report, 'yearMonth' );
		$totals_raw = self::parse_ga_dimension_metric_rows( $totals_report, null );
		$months     = array();
		foreach ( $months_raw as $row ) {
			$months[] = array_merge(
				array(
					'yearMonth' => $row['key'],
					'label'     => $row['label'],
				),
				$row['metrics']
			);
		}
		$totals = ! empty( $totals_raw ) ? $totals_raw[0]['metrics'] : array();

		return array(
			'medium'      => 'organic',
			'dimension'   => 'firstUserMedium',
			'periodStart' => (string) $date_range['startDate'],
			'periodEnd'   => (string) $date_range['endDate'],
			'totals'      => $totals,
			'months'      => $months,
		);
	}

	/**
	 * GA4 Traffic acquisition: sessionDefaultChannelGroup = Organic Search, by calendar month.
	 *
	 * @param array<string,string> $credentials
	 * @param array<string,mixed>  $base dimensions + dimensionFilter (Organic Search channel)
	 * @param array<string,string> $date_range
	 * @return array<string,mixed>|WP_Error
	 */
	private static function fetch_organic_search_traffic_acquisition_monthly(
		array $credentials,
		string $prop_id,
		array $base,
		array $date_range
	) {
		$metrics = array(
			array( 'name' => 'sessions' ),
			array( 'name' => 'engagedSessions' ),
			array( 'name' => 'engagementRate' ),
			array( 'name' => 'averageSessionDuration' ),
			array( 'name' => 'eventsPerSession' ),
			array( 'name' => 'eventCount' ),
			array( 'name' => 'keyEvents' ),
		);

		$monthly_report = self::run_report(
			$credentials,
			$prop_id,
			array_merge(
				$base,
				array(
					'dateRanges' => array( $date_range ),
					'dimensions' => array( array( 'name' => 'yearMonth' ) ),
					'metrics'    => $metrics,
					'orderBys'   => array(
						array(
							'dimension' => array( 'dimensionName' => 'yearMonth' ),
						),
					),
				)
			)
		);
		if ( is_wp_error( $monthly_report ) ) {
			return $monthly_report;
		}

		$totals_report = self::run_report(
			$credentials,
			$prop_id,
			array_merge(
				$base,
				array(
					'dateRanges' => array( $date_range ),
					'metrics'    => $metrics,
				)
			)
		);
		if ( is_wp_error( $totals_report ) ) {
			return $totals_report;
		}

		$months_raw = self::parse_ga_dimension_metric_rows( $monthly_report, 'yearMonth' );
		$totals_raw = self::parse_ga_dimension_metric_rows( $totals_report, null );
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
		$totals = ! empty( $totals_raw )
			? self::normalize_organic_acquisition_metrics_row( $totals_raw[0]['metrics'] )
			: array();

		return array(
			'channel'     => 'Organic Search',
			'dimension'   => 'sessionDefaultChannelGroup',
			'periodStart' => (string) $date_range['startDate'],
			'periodEnd'   => (string) $date_range['endDate'],
			'totals'      => $totals,
			'months'      => $months,
		);
	}

	/**
	 * @param array<string,float|int> $metrics Raw GA metric names from parse_ga_dimension_metric_rows.
	 * @return array<string,float|int>
	 */
	private static function normalize_organic_acquisition_metrics_row( array $metrics ): array {
		$sessions = isset( $metrics['sessions'] ) ? (int) round( (float) $metrics['sessions'] ) : 0;
		$engaged  = isset( $metrics['engagedSessions'] ) ? (int) round( (float) $metrics['engagedSessions'] ) : 0;
		$rate     = isset( $metrics['engagementRate'] ) ? (float) $metrics['engagementRate'] : 0.0;
		$avg_sec  = isset( $metrics['averageSessionDuration'] )
			? (int) round( (float) $metrics['averageSessionDuration'] )
			: 0;
		$ev_sess  = isset( $metrics['eventsPerSession'] ) ? round( (float) $metrics['eventsPerSession'], 2 ) : 0.0;
		$events   = isset( $metrics['eventCount'] ) ? (int) round( (float) $metrics['eventCount'] ) : 0;
		$keys     = isset( $metrics['keyEvents'] ) ? (int) round( (float) $metrics['keyEvents'] ) : 0;
		return array(
			'sessions'                  => $sessions,
			'engagedSessions'           => $engaged,
			'engagementRate'            => $rate,
			'averageSessionDurationSec' => $avg_sec,
			'eventsPerSession'          => $ev_sess,
			'eventCount'                => $events,
			'keyEvents'                 => $keys,
		);
	}

	/**
	 * @param array<string,mixed> $response GA runReport body.
	 * @return array<int,array{key:string,label:string,metrics:array<string,float|int>}>
	 */
	private static function parse_ga_dimension_metric_rows( array $response, ?string $dimension_name ): array {
		$rows = isset( $response['rows'] ) && is_array( $response['rows'] ) ? $response['rows'] : array();
		if ( empty( $rows ) ) {
			return array();
		}
		$metric_headers = isset( $response['metricHeaders'] ) && is_array( $response['metricHeaders'] )
			? $response['metricHeaders']
			: array();
		$metric_names   = array();
		foreach ( $metric_headers as $header ) {
			if ( is_array( $header ) && ! empty( $header['name'] ) ) {
				$metric_names[] = (string) $header['name'];
			}
		}
		$out = array();
		foreach ( $rows as $row ) {
			if ( ! is_array( $row ) ) {
				continue;
			}
			$key = '';
			if ( $dimension_name !== null ) {
				$dim_values = isset( $row['dimensionValues'] ) && is_array( $row['dimensionValues'] )
					? $row['dimensionValues']
					: array();
				$key = isset( $dim_values[0]['value'] ) ? (string) $dim_values[0]['value'] : '';
			}
			$metric_values = isset( $row['metricValues'] ) && is_array( $row['metricValues'] )
				? $row['metricValues']
				: array();
			$metrics       = array();
			foreach ( $metric_names as $i => $name ) {
				if ( ! isset( $metric_values[ $i ]['value'] ) ) {
					continue;
				}
				$val = (float) $metric_values[ $i ]['value'];
				if ( in_array( $name, array( 'totalUsers', 'newUsers', 'keyEvents' ), true ) ) {
					$metrics[ $name ] = (int) round( $val );
				} else {
					$metrics[ $name ] = $val;
				}
			}
			$label = $key !== '' ? self::format_ga_year_month_label( $key ) : 'Period total';
			$out[] = array(
				'key'     => $key,
				'label'   => $label,
				'metrics' => $metrics,
			);
		}
		return $out;
	}

	private static function format_ga_year_month_label( string $year_month ): string {
		if ( ! preg_match( '/^(\d{4})(\d{2})$/', $year_month, $m ) ) {
			return $year_month;
		}
		$month = (int) $m[2];
		$year  = (int) $m[1];
		if ( $month < 1 || $month > 12 ) {
		 return $year_month;
		}
		$ts = gmmktime( 0, 0, 0, $month, 1, $year );
		return gmdate( 'F Y', $ts );
	}

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
	 * Organic Search metrics for one date range (single channel row expected).
	 *
	 * @param array<string,string> $credentials
	 * @param array<string,mixed>  $base
	 * @param array<string,string> $date_range
	 * @return array<string,float|int>|null
	 */
	/**
	 * @return array<string,float|int>|WP_Error|null
	 */
	private static function fetch_organic_acquisition_period(
		array $credentials,
		string $prop_id,
		array $base,
		array $date_range
	) {
		$metrics = array(
			array( 'name' => 'sessions' ),
			array( 'name' => 'engagedSessions' ),
			array( 'name' => 'engagementRate' ),
			array( 'name' => 'averageSessionDuration' ),
			array( 'name' => 'eventsPerSession' ),
			array( 'name' => 'eventCount' ),
			array( 'name' => 'keyEvents' ),
		);
		$report = self::run_report(
			$credentials,
			$prop_id,
			array_merge(
				$base,
				array(
					'dateRanges' => array( $date_range ),
					'metrics'    => $metrics,
				)
			)
		);
		if ( is_wp_error( $report ) ) {
			return $report;
		}
		$parsed = self::parse_organic_acquisition_row( $report );
		if ( is_array( $parsed ) ) {
			return $parsed;
		}
		return array(
			'sessions'                  => 0,
			'engagedSessions'           => 0,
			'engagementRate'            => 0.0,
			'averageSessionDurationSec' => 0,
			'keyEvents'                 => 0,
			'eventCount'                => 0,
			'eventsPerSession'          => 0.0,
		);
	}

	/**
	 * @param array<string,mixed> $response
	 * @return array<string,float|int>|null
	 */
	private static function parse_organic_acquisition_row( array $response ): ?array {
		$rows = isset( $response['rows'] ) && is_array( $response['rows'] ) ? $response['rows'] : array();
		if ( empty( $rows ) || ! is_array( $rows[0] ) ) {
			return null;
		}
		$headers = isset( $response['metricHeaders'] ) && is_array( $response['metricHeaders'] )
			? $response['metricHeaders']
			: array();
		$values  = isset( $rows[0]['metricValues'] ) && is_array( $rows[0]['metricValues'] )
			? $rows[0]['metricValues']
			: array();
		$by_name = array();
		foreach ( $headers as $i => $header ) {
			if ( ! is_array( $header ) ) {
				continue;
			}
			$name = isset( $header['name'] ) ? (string) $header['name'] : '';
			if ( $name === '' || ! isset( $values[ $i ]['value'] ) ) {
				continue;
			}
			$by_name[ $name ] = (float) $values[ $i ]['value'];
		}
		$read = static function ( string $metric ) use ( $by_name ): float {
			return isset( $by_name[ $metric ] ) ? (float) $by_name[ $metric ] : 0.0;
		};
		return array(
			'sessions'                  => (int) round( $read( 'sessions' ) ),
			'engagedSessions'           => (int) round( $read( 'engagedSessions' ) ),
			'engagementRate'            => $read( 'engagementRate' ),
			'averageSessionDurationSec' => (int) round( $read( 'averageSessionDuration' ) ),
			'eventsPerSession'          => round( $read( 'eventsPerSession' ), 2 ),
			'eventCount'                => (int) round( $read( 'eventCount' ) ),
			'keyEvents'                 => (int) round( $read( 'keyEvents' ) ),
		);
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

	/** @return array<string,int|float> */
	private static function empty_organic_acquisition_period(): array {
		return array(
			'sessions'                  => 0,
			'engagedSessions'           => 0,
			'engagementRate'            => 0.0,
			'averageSessionDurationSec' => 0,
			'keyEvents'                 => 0,
			'eventCount'                => 0,
			'eventsPerSession'          => 0.0,
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
				'fieldName'    => 'firstUserMedium',
				'stringFilter' => array(
					'matchType' => 'EXACT',
					'value'     => 'organic',
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
