<?php
/**
 * GA4 organic acquisition and monthly organic traffic fetchers and row parsing.
 *
 * @package Neo_Pulse_App
 */

defined( 'ABSPATH' ) || exit;

trait Neo_Pulse_App_Ga_Api_Trait_Organic_Acquisition {

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
	 * GA4 User acquisition block: firstUserDefaultChannelGroup = Organic Search, by calendar month.
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
				'fieldName'    => 'firstUserDefaultChannelGroup',
				'stringFilter' => array(
					'matchType' => 'EXACT',
					'value'     => 'Organic Search',
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
}
