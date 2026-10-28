<?php
/**
 * Google Ads reporting bundle for two date ranges.
 *
 * @package Neo_Pulse_App
 */

defined( 'ABSPATH' ) || exit;

class Neo_Pulse_App_Google_Ads_Reporting_Bundle {

	/**
	 * @param array<string,mixed> $body
	 * @return array<string,mixed>
	 */
	/**
	 * Account totals + primary-period daily series for organic Performance (no campaign/keyword bulk).
	 *
	 * @param array<string,mixed> $body customerId or googleAdsCustomerId, dates, reportStructure
	 * @return array<string,mixed>
	 */
	public static function fetch_organic_dashboard_google_ads( array $body ): array {
		$customer_id = self::resolve_customer_id_from_body( $body );
		if ( $customer_id === '' ) {
			$customer_id = Neo_Pulse_App_Google_Ads_Credentials::normalize_customer_id( (string) ( $body['googleAdsCustomerId'] ?? '' ) );
		}
		if ( strlen( $customer_id ) !== 10 ) {
			return self::err( 400, 'Missing Google Ads customer ID for this property.' );
		}

		$start = Neo_Pulse_App_Google_Ads_Credentials::validate_ymd( (string) ( $body['startDate'] ?? '' ) );
		$end   = Neo_Pulse_App_Google_Ads_Credentials::validate_ymd( (string) ( $body['endDate'] ?? '' ) );
		if ( $start === '' || $end === '' ) {
			return self::err( 400, 'Invalid date range' );
		}

		$report_structure = (string) ( $body['reportStructure'] ?? 'compare' );
		$period_progress  = $report_structure === 'period_progress';

		$currency = self::fetch_customer_currency_code( $customer_id );

		$primary = self::fetch_account_period( $customer_id, $start, $end );
		if ( empty( $primary['ok'] ) ) {
			return self::err( (int) ( $primary['statusCode'] ?? 502 ), (string) ( $primary['error'] ?? 'Ads fetch failed' ) );
		}

		$compare_account = self::empty_account_metrics();
		if ( ! $period_progress ) {
			$compare_start = Neo_Pulse_App_Google_Ads_Credentials::validate_ymd( (string) ( $body['compareStartDate'] ?? '' ) );
			$compare_end   = Neo_Pulse_App_Google_Ads_Credentials::validate_ymd( (string) ( $body['compareEndDate'] ?? '' ) );
			if ( $compare_start === '' || $compare_end === '' ) {
				return self::err( 400, 'Invalid comparison date range' );
			}
			$compare = self::fetch_account_period( $customer_id, $compare_start, $compare_end );
			if ( empty( $compare['ok'] ) ) {
				return self::err( (int) ( $compare['statusCode'] ?? 502 ), (string) ( $compare['error'] ?? 'Ads compare fetch failed' ) );
			}
			$compare_account = $compare['account'];
		}

		$spend_micros  = (int) ( $primary['account']['costMicros'] ?? 0 );
		$budget_micros = self::fetch_period_budget_cap_micros( $customer_id, $start, $end );
		$pacing        = self::build_budget_pacing( $start, $end, $spend_micros, $budget_micros );

		$payload = array(
			'success'        => true,
			'customerId'     => $customer_id,
			'currencyCode'   => $currency,
			'account'        => $primary['account'],
			'compareAccount' => $compare_account,
			'dailySeries'    => $primary['dailySeries'],
		);
		if ( is_array( $pacing ) ) {
			$payload['budgetPacing'] = $pacing;
		}
		return $payload;
	}

	/**
	 * @return array{ok:bool,statusCode?:int,error?:string,account?:array<string,mixed>,dailySeries?:array<int,array<string,mixed>>}
	 */
	private static function fetch_account_period( string $customer_id, string $start, string $end ): array {
		$date_where = "segments.date BETWEEN '" . $start . "' AND '" . $end . "'";

		$account_q = 'SELECT customer.id, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.ctr, metrics.average_cpc, metrics.conversions, metrics.conversions_value FROM customer WHERE ' . $date_where;
		$account   = Neo_Pulse_App_Google_Ads_Api::search( $customer_id, $account_q );
		if ( empty( $account['ok'] ) ) {
			return $account;
		}

		$daily_q = 'SELECT segments.date, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions, metrics.conversions_value FROM customer WHERE ' . $date_where . ' ORDER BY segments.date ASC';
		$daily   = Neo_Pulse_App_Google_Ads_Api::search( $customer_id, $daily_q );
		if ( empty( $daily['ok'] ) ) {
			return $daily;
		}

		return array(
			'ok'          => true,
			'account'     => self::sum_metrics( isset( $account['results'] ) ? $account['results'] : array() ),
			'dailySeries' => self::map_account_daily_series( isset( $daily['results'] ) ? $daily['results'] : array() ),
		);
	}

	/**
	 * @param array<int,array<string,mixed>> $results
	 * @return array<int,array<string,mixed>>
	 */
	private static function map_account_daily_series( array $results ): array {
		$out = array();
		foreach ( $results as $row ) {
			$segments = isset( $row['segments'] ) && is_array( $row['segments'] ) ? $row['segments'] : array();
			$date     = (string) ( $segments['date'] ?? '' );
			if ( $date === '' ) {
				continue;
			}
			$m     = self::metrics_of( $row );
			$out[] = array(
				'date'        => $date,
				'costMicros'  => (int) $m['costMicros'],
				'conversions' => (float) $m['conversions'],
				'clicks'      => (int) $m['clicks'],
			);
		}
		return $out;
	}

	private static function fetch_customer_currency_code( string $customer_id ): string {
		$q = 'SELECT customer.currency_code FROM customer LIMIT 1';
		$r = Neo_Pulse_App_Google_Ads_Api::search( $customer_id, $q );
		if ( empty( $r['ok'] ) || empty( $r['results'][0] ) ) {
			return 'USD';
		}
		$row      = $r['results'][0];
		$customer = isset( $row['customer'] ) && is_array( $row['customer'] ) ? $row['customer'] : array();
		$code     = strtoupper( trim( (string) ( $customer['currencyCode'] ?? '' ) ) );
		return $code !== '' ? $code : 'USD';
	}

	public static function fetch_reporting_bundle( array $body ): array {
		$customer_id = self::resolve_customer_id_from_body( $body );
		if ( $customer_id === '' ) {
			return self::err( 400, 'Missing Google Ads customer ID for this property.' );
		}
		$start = Neo_Pulse_App_Google_Ads_Credentials::validate_ymd( (string) ( $body['startDate'] ?? '' ) );
		$end   = Neo_Pulse_App_Google_Ads_Credentials::validate_ymd( (string) ( $body['endDate'] ?? '' ) );
		if ( $start === '' || $end === '' ) {
			return self::err( 400, 'Invalid date range' );
		}
		$report_structure = (string) ( $body['reportStructure'] ?? 'compare' );
		$period_progress  = $report_structure === 'period_progress';

		$primary = self::fetch_period( $customer_id, $start, $end );
		if ( empty( $primary['ok'] ) ) {
			return self::err( (int) ( $primary['statusCode'] ?? 502 ), (string) ( $primary['error'] ?? 'Ads fetch failed' ) );
		}

		if ( $period_progress ) {
			return array(
				'success'            => true,
				'customerId'         => $customer_id,
				'startDate'          => $start,
				'endDate'            => $end,
				'compareStartDate'   => $start,
				'compareEndDate'     => $end,
				'account'            => $primary['account'],
				'compareAccount'     => self::empty_account_metrics(),
				'campaigns'          => $primary['campaigns'],
				'compareCampaigns'   => array(),
				'keywords'           => $primary['keywords'],
				'compareKeywords'    => array(),
				'searchTerms'        => $primary['searchTerms'],
				'compareSearchTerms' => array(),
			);
		}

		$compare_start = Neo_Pulse_App_Google_Ads_Credentials::validate_ymd( (string) ( $body['compareStartDate'] ?? '' ) );
		$compare_end   = Neo_Pulse_App_Google_Ads_Credentials::validate_ymd( (string) ( $body['compareEndDate'] ?? '' ) );
		if ( $compare_start === '' || $compare_end === '' ) {
			return self::err( 400, 'Invalid comparison date range' );
		}

		$compare = self::fetch_period( $customer_id, $compare_start, $compare_end );
		if ( empty( $compare['ok'] ) ) {
			return self::err( (int) ( $compare['statusCode'] ?? 502 ), (string) ( $compare['error'] ?? 'Ads compare fetch failed' ) );
		}

		return array(
			'success'            => true,
			'customerId'         => $customer_id,
			'startDate'          => $start,
			'endDate'            => $end,
			'compareStartDate'   => $compare_start,
			'compareEndDate'     => $compare_end,
			'account'            => $primary['account'],
			'compareAccount'     => $compare['account'],
			'campaigns'          => $primary['campaigns'],
			'compareCampaigns'   => $compare['campaigns'],
			'keywords'           => $primary['keywords'],
			'compareKeywords'    => $compare['keywords'],
			'searchTerms'        => $primary['searchTerms'],
			'compareSearchTerms' => $compare['searchTerms'],
		);
	}

	/**
	 * @return array<string,float|int>
	 */
	private static function empty_account_metrics(): array {
		return array(
			'impressions'      => 0,
			'clicks'           => 0,
			'costMicros'       => 0,
			'conversions'      => 0.0,
			'conversionsValue' => 0.0,
			'ctr'              => 0.0,
			'averageCpc'       => 0.0,
		);
	}

	/**
	 * @return array{ok:bool,statusCode?:int,error?:string,account?:array<string,mixed>,campaigns?:array<int,array<string,mixed>>,keywords?:array<int,array<string,mixed>>,searchTerms?:array<int,array<string,mixed>>}
	 */
	private static function fetch_period( string $customer_id, string $start, string $end ): array {
		$date_where = "segments.date BETWEEN '" . $start . "' AND '" . $end . "'";

		$account_q = 'SELECT customer.id, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.ctr, metrics.average_cpc, metrics.conversions, metrics.conversions_value FROM customer WHERE ' . $date_where;
		$account   = Neo_Pulse_App_Google_Ads_Api::search( $customer_id, $account_q );
		if ( empty( $account['ok'] ) ) {
			return $account;
		}

		$campaign_q = 'SELECT campaign.id, campaign.name, campaign.status, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.ctr, metrics.average_cpc, metrics.conversions, metrics.conversions_value FROM campaign WHERE ' . $date_where . " AND campaign.status != 'REMOVED'";
		$campaigns  = Neo_Pulse_App_Google_Ads_Api::search( $customer_id, $campaign_q );
		if ( empty( $campaigns['ok'] ) ) {
			return $campaigns;
		}

		$keyword_q = 'SELECT ad_group_criterion.keyword.text, ad_group_criterion.keyword.match_type, campaign.name, ad_group.name, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.average_cpc, metrics.conversions, metrics.conversions_value FROM keyword_view WHERE ' . $date_where . " AND campaign.status != 'REMOVED'";
		$keywords  = Neo_Pulse_App_Google_Ads_Api::search( $customer_id, $keyword_q );
		if ( empty( $keywords['ok'] ) ) {
			return $keywords;
		}

		$term_q = 'SELECT search_term_view.search_term, campaign.name, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions, metrics.conversions_value FROM search_term_view WHERE ' . $date_where;
		$terms  = Neo_Pulse_App_Google_Ads_Api::search( $customer_id, $term_q );
		if ( empty( $terms['ok'] ) ) {
			return $terms;
		}

		return array(
			'ok'          => true,
			'account'     => self::sum_metrics( isset( $account['results'] ) ? $account['results'] : array() ),
			'campaigns'   => self::map_campaigns( isset( $campaigns['results'] ) ? $campaigns['results'] : array() ),
			'keywords'    => self::map_keywords( isset( $keywords['results'] ) ? $keywords['results'] : array() ),
			'searchTerms' => self::map_search_terms( isset( $terms['results'] ) ? $terms['results'] : array() ),
		);
	}

	/**
	 * @param array<int,array<string,mixed>> $results
	 * @return array<string,float|int>
	 */
	public static function sum_metrics( array $results ): array {
		$out = array(
			'impressions'       => 0,
			'clicks'            => 0,
			'costMicros'        => 0,
			'conversions'       => 0.0,
			'conversionsValue'  => 0.0,
		);
		foreach ( $results as $row ) {
			$m = self::metrics_of( $row );
			$out['impressions']      += (int) $m['impressions'];
			$out['clicks']           += (int) $m['clicks'];
			$out['costMicros']       += (int) $m['costMicros'];
			$out['conversions']      += (float) $m['conversions'];
			$out['conversionsValue'] += (float) $m['conversionsValue'];
		}
		$out['ctr']        = $out['impressions'] > 0 ? $out['clicks'] / $out['impressions'] : 0;
		$out['averageCpc'] = $out['clicks'] > 0 ? $out['costMicros'] / $out['clicks'] : 0;
		return $out;
	}

	/**
	 * @param array<int,array<string,mixed>> $results
	 * @return array<int,array<string,mixed>>
	 */
	public static function map_campaigns( array $results ): array {
		$out = array();
		foreach ( $results as $row ) {
			$campaign = isset( $row['campaign'] ) && is_array( $row['campaign'] ) ? $row['campaign'] : array();
			$out[]    = array_merge(
				self::metrics_of( $row ),
				array(
					'id'     => (string) ( $campaign['id'] ?? '' ),
					'name'   => (string) ( $campaign['name'] ?? '' ),
					'status' => (string) ( $campaign['status'] ?? '' ),
				)
			);
		}
		return $out;
	}

	/**
	 * @param array<int,array<string,mixed>> $results
	 * @return array<int,array<string,mixed>>
	 */
	public static function map_keywords( array $results ): array {
		$out = array();
		foreach ( $results as $row ) {
			$criterion = isset( $row['adGroupCriterion'] ) && is_array( $row['adGroupCriterion'] ) ? $row['adGroupCriterion'] : array();
			$keyword   = isset( $criterion['keyword'] ) && is_array( $criterion['keyword'] ) ? $criterion['keyword'] : array();
			$campaign  = isset( $row['campaign'] ) && is_array( $row['campaign'] ) ? $row['campaign'] : array();
			$ad_group  = isset( $row['adGroup'] ) && is_array( $row['adGroup'] ) ? $row['adGroup'] : array();
			$out[]     = array_merge(
				self::metrics_of( $row ),
				array(
					'text'         => (string) ( $keyword['text'] ?? '' ),
					'matchType'    => (string) ( $keyword['matchType'] ?? '' ),
					'campaignName' => (string) ( $campaign['name'] ?? '' ),
					'adGroupName'  => (string) ( $ad_group['name'] ?? '' ),
				)
			);
		}
		return $out;
	}

	/**
	 * @param array<int,array<string,mixed>> $results
	 * @return array<int,array<string,mixed>>
	 */
	public static function map_search_terms( array $results ): array {
		$out = array();
		foreach ( $results as $row ) {
			$view     = isset( $row['searchTermView'] ) && is_array( $row['searchTermView'] ) ? $row['searchTermView'] : array();
			$campaign = isset( $row['campaign'] ) && is_array( $row['campaign'] ) ? $row['campaign'] : array();
			$out[]    = array_merge(
				self::metrics_of( $row ),
				array(
					'searchTerm'   => (string) ( $view['searchTerm'] ?? '' ),
					'campaignName' => (string) ( $campaign['name'] ?? '' ),
				)
			);
		}
		return $out;
	}

	/**
	 * @param array<string,mixed> $row
	 * @return array<string,float|int>
	 */
	public static function metrics_of( array $row ): array {
		$m = isset( $row['metrics'] ) && is_array( $row['metrics'] ) ? $row['metrics'] : array();
		return array(
			'impressions'      => (int) ( $m['impressions'] ?? 0 ),
			'clicks'           => (int) ( $m['clicks'] ?? 0 ),
			'costMicros'       => (int) ( $m['costMicros'] ?? 0 ),
			'ctr'              => (float) ( $m['ctr'] ?? 0 ),
			'averageCpc'       => (float) ( $m['averageCpc'] ?? 0 ),
			'conversions'      => (float) ( $m['conversions'] ?? 0 ),
			'conversionsValue' => (float) ( $m['conversionsValue'] ?? 0 ),
		);
	}

	/**
	 * @param array<string,mixed> $body
	 */
	private static function resolve_customer_id_from_body( array $body ): string {
		$customer_id = Neo_Pulse_App_Google_Ads_Credentials::normalize_customer_id( (string) ( $body['customerId'] ?? '' ) );
		if ( strlen( $customer_id ) === 10 ) {
			return $customer_id;
		}
		$from_body = Neo_Pulse_App_Google_Ads_Credentials::normalize_customer_id( (string) ( $body['googleAdsCustomerId'] ?? '' ) );
		if ( strlen( $from_body ) === 10 ) {
			return $from_body;
		}
		$site_id = sanitize_text_field( (string) ( $body['siteId'] ?? '' ) );
		if ( $site_id !== '' ) {
			$site = Neo_Pulse_App_Task_Execution_Site_Resolver::resolve_by_id( $site_id );
			if ( is_array( $site ) ) {
				$from_site = Neo_Pulse_App_Google_Ads_Credentials::normalize_customer_id( (string) ( $site['googleAdsCustomerId'] ?? '' ) );
				if ( strlen( $from_site ) === 10 ) {
					return $from_site;
				}
			}
		}
		return '';
	}

	/**
	 * Sum of enabled Search campaign daily budgets × days in the reporting range.
	 */
	private static function fetch_period_budget_cap_micros( string $customer_id, string $start, string $end ): ?int {
		$q = "SELECT campaign.status, campaign_budget.amount_micros FROM campaign WHERE campaign.status = 'ENABLED' AND campaign.advertising_channel_type = 'SEARCH'";
		$r = Neo_Pulse_App_Google_Ads_Api::search( $customer_id, $q );
		if ( empty( $r['ok'] ) || ! is_array( $r['results'] ?? null ) ) {
			return null;
		}
		$daily_total = 0;
		foreach ( $r['results'] as $row ) {
			if ( ! is_array( $row ) ) {
				continue;
			}
			$budget = isset( $row['campaignBudget'] ) && is_array( $row['campaignBudget'] ) ? $row['campaignBudget'] : array();
			$daily_total += (int) ( $budget['amountMicros'] ?? 0 );
		}
		if ( $daily_total <= 0 ) {
			return null;
		}
		$days = self::inclusive_days_between( $start, $end );
		if ( $days <= 0 ) {
			return null;
		}
		return $daily_total * $days;
	}

	private static function inclusive_days_between( string $start, string $end ): int {
		$a = strtotime( $start );
		$b = strtotime( $end );
		if ( $a === false || $b === false || $b < $a ) {
			return 0;
		}
		return (int) floor( ( $b - $a ) / 86400 ) + 1;
	}

	/**
	 * @return array<string,mixed>|null
	 */
	private static function build_budget_pacing( string $start, string $end, int $spend_micros, ?int $budget_micros ): ?array {
		if ( $budget_micros === null || $budget_micros <= 0 ) {
			return null;
		}
		return array(
			'spendMicros'  => $spend_micros,
			'budgetMicros' => $budget_micros,
			'periodStart'  => $start,
			'periodEnd'    => $end,
		);
	}

	/**
	 * @return array<string,mixed>
	 */
	private static function err( int $status, string $message ): array {
		return array(
			'success'    => false,
			'statusCode' => $status,
			'error'      => $message,
		);
	}
}
