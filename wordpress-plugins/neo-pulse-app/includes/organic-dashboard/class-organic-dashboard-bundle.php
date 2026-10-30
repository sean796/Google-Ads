<?php
/**
 * Single-response organic dashboard: GA4 organic + GSC performance + Semrush overview.
 *
 * @package Neo_Pulse_App
 */

defined( 'ABSPATH' ) || exit;

class Neo_Pulse_App_Organic_Dashboard_Bundle {

	/** @var list<string> */
	private const FETCH_PARTS = array( 'ga4', 'gsc', 'semrush', 'googleAds' );

	/**
	 * @param array<string,mixed> $body
	 * @return array{statusCode:int,body:array<string,mixed>}
	 */
	public static function fetch( array $body ): array {
		$db_validation = Neo_Pulse_App_Organic_Dashboard_Semrush::validate_database_param( $body );
		if ( is_array( $db_validation ) ) {
			return $db_validation;
		}

		$context = self::build_fetch_context( $body );
		if ( isset( $context['statusCode'] ) ) {
			return $context;
		}

		$source_results = self::fetch_dashboard_sources( $context );

		$ga4_result     = $source_results['ga4'];
		$gsc_result     = $source_results['gsc'];
		$semrush_result = $source_results['semrush'];

		$sources = array(
			'ga4'     => $ga4_result['status'],
			'gsc'     => $gsc_result['status'],
			'semrush' => $semrush_result['status'],
		);

		return array(
			'statusCode' => 200,
			'body'       => array(
				'success' => true,
				'meta'    => self::build_response_meta( $context, $gsc_result['gsc_property'] ),
				'ga4'     => $ga4_result['payload'],
				'gsc'     => $gsc_result['payload'],
				'semrush' => $semrush_result['payload'],
				'sources' => $sources,
			),
		);
	}

	/**
	 * Parallel client loads: one source per request (ga4, gsc, semrush, googleAds).
	 *
	 * @param array<string,mixed> $body
	 * @return array{statusCode:int,body:array<string,mixed>}
	 */
	public static function fetch_part( array $body ): array {
		$part = isset( $body['part'] ) ? trim( (string) $body['part'] ) : '';
		if ( ! in_array( $part, self::FETCH_PARTS, true ) ) {
			return array(
				'statusCode' => 400,
				'body'       => array(
					'success' => false,
					'error'   => 'Invalid or missing part',
				),
			);
		}

		$db_validation = Neo_Pulse_App_Organic_Dashboard_Semrush::validate_database_param( $body );
		if ( is_array( $db_validation ) ) {
			return $db_validation;
		}

		$context = self::build_fetch_context( $body );
		if ( isset( $context['statusCode'] ) ) {
			return $context;
		}

		$stub = self::partial_request_stub();

		$sources = array(
			'ga4'       => 'skipped',
			'gsc'       => 'skipped',
			'semrush'   => 'skipped',
			'googleAds' => 'skipped',
		);

		$ga4_payload        = $stub;
		$gsc_payload        = $stub;
		$semrush_payload    = $stub;
		$google_ads_payload = $stub;
		$gsc_property       = null;

		if ( $part === 'ga4' ) {
			$ga4_result     = self::resolve_ga4_source( $context );
			$ga4_payload    = $ga4_result['payload'];
			$sources['ga4'] = $ga4_result['status'];
		} elseif ( $part === 'gsc' ) {
			$gsc_result     = self::resolve_gsc_source( $context );
			$gsc_payload    = $gsc_result['payload'];
			$sources['gsc'] = $gsc_result['status'];
			$gsc_property   = $gsc_result['gsc_property'];
		} elseif ( $part === 'semrush' ) {
			$semrush_result     = self::resolve_semrush_source( $context );
			$semrush_payload    = $semrush_result['payload'];
			$sources['semrush'] = $semrush_result['status'];
		} elseif ( $part === 'googleAds' ) {
			$ads_result            = self::resolve_google_ads_source( $context );
			$google_ads_payload    = $ads_result['payload'];
			$sources['googleAds'] = $ads_result['status'];
		}

		return array(
			'statusCode' => 200,
			'body'       => array(
				'success'   => true,
				'meta'      => self::build_response_meta( $context, $gsc_property ),
				'ga4'       => $ga4_payload,
				'gsc'       => $gsc_payload,
				'semrush'   => $semrush_payload,
				'googleAds' => $google_ads_payload,
				'sources'   => $sources,
				'part'      => $part,
			),
		);
	}

	/**
	 * @param array<string,mixed> $body
	 * @return array<string,mixed>|array{statusCode:int,body:array<string,mixed>}
	 */
	private static function build_fetch_context( array $body ) {
		$site_url        = isset( $body['siteUrl'] ) ? trim( (string) $body['siteUrl'] ) : '';
		$ga4_property_id = isset( $body['ga4PropertyId'] ) ? trim( (string) $body['ga4PropertyId'] ) : '';

		if ( empty( $body['startDate'] ) || empty( $body['endDate'] ) ) {
			return array(
				'statusCode' => 400,
				'body'       => array(
					'success' => false,
					'error'   => 'Missing date fields: startDate, endDate',
				),
			);
		}

		$period_progress = trim( (string) ( $body['reportStructure'] ?? '' ) ) === 'period_progress';
		$include_compare = ! $period_progress;

		$primary = array(
			'startDate' => trim( (string) $body['startDate'] ),
			'endDate'   => trim( (string) $body['endDate'] ),
		);
		$compare = array(
			'startDate' => trim( (string) ( $body['compareStartDate'] ?? '' ) ),
			'endDate'   => trim( (string) ( $body['compareEndDate'] ?? '' ) ),
		);
		if ( $include_compare && ( $compare['startDate'] === '' || $compare['endDate'] === '' ) ) {
			return array(
				'statusCode' => 400,
				'body'       => array(
					'success' => false,
					'error'   => 'Missing compare date fields: compareStartDate, compareEndDate',
				),
			);
		}

		return array(
			'body'            => $body,
			'site_url'        => $site_url,
			'ga4_property_id' => $ga4_property_id,
			'primary'         => $primary,
			'compare'         => $compare,
			'include_compare' => $include_compare,
			'period_progress' => $period_progress,
		);
	}

	/**
	 * @param array<string,mixed> $context
	 * @return array<string,mixed>
	 */
	private static function build_response_meta( array $context, ?string $gsc_property ): array {
		$primary         = is_array( $context['primary'] ?? null ) ? $context['primary'] : array();
		$compare         = is_array( $context['compare'] ?? null ) ? $context['compare'] : array();
		$include_compare = ! empty( $context['include_compare'] );
		$period_progress = ! empty( $context['period_progress'] );
		$ga4_property_id = (string) ( $context['ga4_property_id'] ?? '' );

		return array(
			'fetchedAt'       => gmdate( 'c' ),
			'primary'         => $primary,
			'compare'         => $include_compare ? $compare : null,
			'reportStructure' => $period_progress ? 'period_progress' : 'compare',
			'gscProperty'     => $gsc_property,
			'ga4PropertyId'   => $ga4_property_id !== '' ? $ga4_property_id : null,
		);
	}

	/**
	 * @return array{skipped:bool,reason:string}
	 */
	private static function partial_request_stub(): array {
		return array(
			'skipped' => true,
			'reason'  => 'partial_request',
		);
	}

	/**
	 * Independent source resolvers (GSC uses internal Search Analytics curl_multi when timeseries is on).
	 *
	 * @param array<string,mixed> $context
	 * @return array<string,array{status:string,payload:array<string,mixed>,gsc_property:?string}>
	 */
	private static function fetch_dashboard_sources( array $context ): array {
		return array(
			'ga4'     => self::resolve_ga4_source( $context ),
			'gsc'     => self::resolve_gsc_source( $context ),
			'semrush' => self::resolve_semrush_source( $context ),
		);
	}

	/**
	 * @param array<string,mixed> $context
	 * @return array{status:string,payload:array<string,mixed>,gsc_property:?string}
	 */
	private static function resolve_ga4_source( array $context ): array {
		$ga4_property_id = (string) ( $context['ga4_property_id'] ?? '' );
		$primary         = is_array( $context['primary'] ?? null ) ? $context['primary'] : array();
		$compare         = is_array( $context['compare'] ?? null ) ? $context['compare'] : array();
		$include_compare = ! empty( $context['include_compare'] );

		if ( $ga4_property_id === '' ) {
			return array(
				'status'        => 'skipped',
				'payload'       => array(
					'skipped' => true,
					'reason'  => 'missing_ga4_property_id',
					'error'   => 'GA4 Property ID is not set for this site.',
				),
				'gsc_property'  => null,
			);
		}

		$ga_body = array(
			'propertyId'                              => $ga4_property_id,
			'startDate'                               => $primary['startDate'] ?? '',
			'endDate'                                 => $primary['endDate'] ?? '',
			'compareStartDate'                        => $compare['startDate'] ?? '',
			'compareEndDate'                          => $compare['endDate'] ?? '',
			'includeCompare'                          => $include_compare,
			'includeOrganicTrafficAcquisitionMonthly' => true,
		);
		$ga_result = Neo_Pulse_App_Ga_Api::report_data( $ga_body );
		if ( 200 === (int) $ga_result['statusCode'] && ! empty( $ga_result['body']['success'] ) ) {
			return array(
				'status'       => 'ok',
				'payload'      => $ga_result['body'],
				'gsc_property' => null,
			);
		}

		$err = is_array( $ga_result['body'] ) ? (string) ( $ga_result['body']['error'] ?? 'GA4 report failed' ) : 'GA4 report failed';
		$payload = array(
			'skipped' => true,
			'reason'  => 'ga4_error',
			'error'   => $err,
		);
		if ( is_array( $ga_result['body'] ) && ! empty( $ga_result['body']['client_email'] ) ) {
			$payload['client_email'] = (string) $ga_result['body']['client_email'];
		}

		return array(
			'status'       => 'error',
			'payload'      => $payload,
			'gsc_property' => null,
		);
	}

	/**
	 * @param array<string,mixed> $context
	 * @return array{status:string,payload:array<string,mixed>,gsc_property:?string}
	 */
	private static function resolve_gsc_source( array $context ): array {
		$site_url        = (string) ( $context['site_url'] ?? '' );
		$primary         = is_array( $context['primary'] ?? null ) ? $context['primary'] : array();
		$compare         = is_array( $context['compare'] ?? null ) ? $context['compare'] : array();
		$include_compare = ! empty( $context['include_compare'] );

		if ( $site_url === '' ) {
			return array(
				'status'       => 'skipped',
				'payload'      => array(
					'skipped' => true,
					'reason'  => 'missing_site_url',
					'error'   => 'Site URL is required for Search Console.',
				),
				'gsc_property' => null,
			);
		}

		$gsc_body = array(
			'siteUrl'           => $site_url,
			'startDate'         => $primary['startDate'] ?? '',
			'endDate'           => $primary['endDate'] ?? '',
			'compareStartDate'  => $compare['startDate'] ?? '',
			'compareEndDate'    => $compare['endDate'] ?? '',
			'includeCompare'    => $include_compare,
			'includePagesCount' => false,
			'includeTimeseries' => true,
		);
		$gsc_result = Neo_Pulse_App_Gsc_Performance::fetch_performance_stats( $gsc_body );
		$gsc_status = (int) ( $gsc_result['statusCode'] ?? 500 );
		$gsc_body_r = is_array( $gsc_result['body'] ?? null ) ? $gsc_result['body'] : array();

		if ( 200 === $gsc_status && ! empty( $gsc_body_r['success'] ) ) {
			$gsc_property = null;
			if ( ! empty( $gsc_body_r['property'] ) ) {
				$gsc_property = (string) $gsc_body_r['property'];
			}
			return array(
				'status'       => 'ok',
				'payload'      => $gsc_body_r,
				'gsc_property' => $gsc_property,
			);
		}

		$gsc_err = (string) ( $gsc_body_r['error'] ?? 'GSC performance fetch failed' );
		$payload = array(
			'skipped' => true,
			'reason'  => ! empty( $gsc_body_r['errorType'] ) ? (string) $gsc_body_r['errorType'] : 'gsc_error',
			'error'   => $gsc_err,
		);
		if ( ! empty( $gsc_body_r['serviceAccountEmail'] ) ) {
			$payload['serviceAccountEmail'] = (string) $gsc_body_r['serviceAccountEmail'];
		}

		return array(
			'status'       => 'error',
			'payload'      => $payload,
			'gsc_property' => null,
		);
	}

	/**
	 * @param array<string,mixed> $context
	 * @return array{status:string,payload:array<string,mixed>}
	 */
	private static function resolve_google_ads_source( array $context ): array {
		$body            = is_array( $context['body'] ?? null ) ? $context['body'] : array();
		$primary         = is_array( $context['primary'] ?? null ) ? $context['primary'] : array();
		$compare         = is_array( $context['compare'] ?? null ) ? $context['compare'] : array();
		$period_progress = ! empty( $context['period_progress'] );

		$customer_id = Neo_Pulse_App_Google_Ads_Credentials::normalize_customer_id(
			(string) ( $body['googleAdsCustomerId'] ?? '' )
		);
		if ( strlen( $customer_id ) !== 10 ) {
			return array(
				'status'  => 'skipped',
				'payload' => array(
					'skipped' => true,
					'reason'  => 'missing_google_ads_customer_id',
					'error'   => 'Google Ads customer ID is not set for this property.',
				),
			);
		}

		$ads_body = array_merge(
			$body,
			array(
				'googleAdsCustomerId' => $customer_id,
				'startDate'           => $primary['startDate'] ?? '',
				'endDate'             => $primary['endDate'] ?? '',
				'compareStartDate'    => $compare['startDate'] ?? '',
				'compareEndDate'      => $compare['endDate'] ?? '',
				'reportStructure'     => $period_progress ? 'period_progress' : 'compare',
			)
		);

		$result = Neo_Pulse_App_Google_Ads_Reporting_Bundle::fetch_organic_dashboard_google_ads( $ads_body );
		if ( empty( $result['success'] ) ) {
			return array(
				'status'  => 'error',
				'payload' => array(
					'skipped' => true,
					'reason'  => 'google_ads_error',
					'error'   => (string) ( $result['error'] ?? 'Google Ads fetch failed' ),
				),
			);
		}

		return array(
			'status'  => 'ok',
			'payload' => $result,
		);
	}

	/**
	 * @param array<string,mixed> $context
	 * @return array{status:string,payload:array<string,mixed>,gsc_property:?string}
	 */
	private static function resolve_semrush_source( array $context ): array {
		$body            = is_array( $context['body'] ?? null ) ? $context['body'] : array();
		$site_url        = (string) ( $context['site_url'] ?? '' );
		$compare         = is_array( $context['compare'] ?? null ) ? $context['compare'] : array();
		$period_progress = ! empty( $context['period_progress'] );

		$semrush_body = array_merge(
			$body,
			array(
				'siteUrl'         => $site_url,
				'reportStructure' => $period_progress ? 'period_progress' : 'compare',
				'compareEndDate'  => $compare['endDate'] ?? '',
			)
		);
		$semrush_result = Neo_Pulse_App_Organic_Dashboard_Semrush::fetch( $semrush_body );

		return array(
			'status'       => $semrush_result['status'],
			'payload'      => $semrush_result['payload'],
			'gsc_property' => null,
		);
	}
}
