<?php
/**
 * Server-side organic Performance report narratives (OpenRouter).
 *
 * @package Neo_Pulse_App
 */

defined( 'ABSPATH' ) || exit;

class Neo_Pulse_App_Organic_Dashboard_Reporting_Highlights {

	/**
	 * @param array<string,mixed> $body Expects siteId (string) and snapshot (array).
	 * @return array{statusCode:int,body:array<string,mixed>}
	 */
	public static function generate( array $body ): array {
		if ( function_exists( 'set_time_limit' ) ) {
			@set_time_limit( 180 );
		}

		$site_id  = isset( $body['siteId'] ) ? trim( (string) $body['siteId'] ) : '';
		$snapshot = isset( $body['snapshot'] ) && is_array( $body['snapshot'] ) ? $body['snapshot'] : null;

		if ( $site_id === '' || $snapshot === null ) {
			return array(
				'statusCode' => 400,
				'body'       => array(
					'success' => false,
					'error'   => 'siteId and snapshot are required',
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
			$model = Neo_Pulse_App_Openrouter_Agent_Models::resolve(
				Neo_Pulse_App_Openrouter_Agent_Models::CATEGORY_REPORT,
				isset( $body['model'] ) ? (string) $body['model'] : ''
			);
			$job_opts = array(
				'model'       => $model,
				'temperature' => 0.15,
				'maxTokens'   => 4096,
				'reasoning'   => array(
					'effort'  => 'none',
					'exclude' => true,
				),
			);

			$cache_key = 'neo_pulse_orh_' . md5(
				wp_json_encode(
					array(
						'v'        => 2,
						'siteId'   => $site_id,
						'model'    => $model,
						'snapshot' => $snapshot,
					)
				)
			);
			$cached = get_transient( $cache_key );
			if ( is_array( $cached ) && ! empty( $cached['executiveSummary'] ) ) {
				return array(
					'statusCode' => 200,
					'body'       => array(
						'success'    => true,
						'highlights' => $cached,
						'cached'     => true,
					),
				);
			}

			$slice_specs = self::build_parallel_slice_specs( $snapshot );
			$jobs        = array();
			$slice_ids   = array();
			foreach ( $slice_specs as $spec ) {
				$slice_ids[] = $spec['id'];
				$jobs[]      = array(
					'messages' => array(
						array(
							'role'    => 'system',
							'content' => $spec['system'],
						),
						array(
							'role'    => 'user',
							'content' => self::snapshot_user_message( $spec['snapshot'] ),
						),
					),
					'opts'     => $job_opts,
				);
			}

			$results = Neo_Pulse_App_Chat_Openrouter::json_completion_parallel( $jobs );

			$merged = self::merge_slice_results( $slice_ids, $results, $snapshot );
			if ( isset( $merged['error'] ) ) {
				return array(
					'statusCode' => 502,
					'body'       => array(
						'success' => false,
						'error'   => (string) $merged['error'],
					),
				);
			}

			set_transient( $cache_key, $merged['highlights'], 6 * HOUR_IN_SECONDS );

			return array(
				'statusCode' => 200,
				'body'       => array(
					'success'    => true,
					'highlights' => $merged['highlights'],
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

	/**
	 * @param array<string,mixed> $snapshot
	 * @return array<int,array{id:string,system:string,snapshot:array<string,mixed>}>
	 */
	private static function build_parallel_slice_specs( array $snapshot ): array {
		$common = self::snapshot_common_fields( $snapshot );
		$has_ads = isset( $snapshot['googleAdsTotals'] ) && is_array( $snapshot['googleAdsTotals'] ) && $snapshot['googleAdsTotals'] !== array();

		$specs = array(
			array(
				'id'       => 'insights',
				'system'   => self::insights_system_prompt(),
				'snapshot' => array_merge(
					$common,
					self::pick_snapshot_fields(
						$snapshot,
						array( 'ga4Rows', 'gscTotals', 'googleAdsTotals', 'periodTotals' )
					)
				),
			),
			array(
				'id'       => 'performance',
				'system'   => self::performance_system_prompt(),
				'snapshot' => array_merge(
					$common,
					self::pick_snapshot_fields(
						$snapshot,
						array( 'ga4Rows', 'gscTotals', 'monthlyProgression', 'periodTotals' )
					)
				),
			),
			array(
				'id'       => 'keyword',
				'system'   => self::keyword_system_prompt(),
				'snapshot' => array_merge(
					$common,
					self::pick_snapshot_fields( $snapshot, array( 'topQueries' ) )
				),
			),
			array(
				'id'       => 'seo_opportunities',
				'system'   => self::seo_opportunities_system_prompt(),
				'snapshot' => array_merge(
					$common,
					self::pick_snapshot_fields(
						$snapshot,
						array( 'ga4Rows', 'gscTotals', 'topQueries' )
					)
				),
			),
		);

		if ( $has_ads ) {
			$specs[] = array(
				'id'       => 'google_ads',
				'system'   => self::google_ads_system_prompt(),
				'snapshot' => array_merge(
					$common,
					self::pick_snapshot_fields(
						$snapshot,
						array( 'googleAdsTotals', 'googleAdsBudgetCaption' )
					)
				),
			);
		}

		return $specs;
	}

	/**
	 * @param array<string,mixed> $snapshot
	 * @return array<string,mixed>
	 */
	private static function snapshot_common_fields( array $snapshot ): array {
		return self::pick_snapshot_fields(
			$snapshot,
			array( 'siteName', 'siteUrl', 'showCompare', 'reportStructure' )
		);
	}

	/**
	 * @param array<string,mixed> $snapshot
	 * @param array<int,string>   $keys
	 * @return array<string,mixed>
	 */
	private static function pick_snapshot_fields( array $snapshot, array $keys ): array {
		$out = array();
		foreach ( $keys as $key ) {
			if ( array_key_exists( $key, $snapshot ) ) {
				$out[ $key ] = $snapshot[ $key ];
			}
		}
		return $out;
	}

	/**
	 * @param array<string,mixed> $snapshot
	 */
	private static function snapshot_user_message( array $snapshot ): string {
		return 'Organic dashboard snapshot (JSON). Use only these numbers. Date labels are not in this JSON; the report UI already shows them.' . "\n\n"
			. wp_json_encode( $snapshot, JSON_PRETTY_PRINT ) . "\n\n"
			. self::no_dates_line() . "\n\n"
			. self::query_prose_line();
	}

	/**
	 * @param array<int,string> $slice_ids
	 * @param array<int,array{parsed:array<string,mixed>|null,error:string,ms:int}> $results
	 * @param array<string,mixed> $snapshot
	 * @return array{highlights:array<string,mixed>}|array{error:string}
	 */
	private static function merge_slice_results( array $slice_ids, array $results, array $snapshot ): array {
		$highlights = array(
			'executiveSummary'     => '',
			'keyTakeaways'         => array(),
			'performanceNarrative' => array(),
			'keywordNarrative'     => array(),
			'googleAdsNarrative'   => array(),
			'topOpportunities'     => array(),
		);

		foreach ( $slice_ids as $i => $slice_id ) {
			$result = isset( $results[ $i ] ) && is_array( $results[ $i ] ) ? $results[ $i ] : array();
			$error  = isset( $result['error'] ) ? trim( (string) $result['error'] ) : '';
			$parsed = isset( $result['parsed'] ) && is_array( $result['parsed'] ) ? $result['parsed'] : null;

			if ( $error !== '' ) {
				return array( 'error' => 'Highlights slice "' . $slice_id . '": ' . $error );
			}
			if ( $parsed === null ) {
				return array( 'error' => 'Highlights slice "' . $slice_id . '" returned invalid JSON.' );
			}

			switch ( $slice_id ) {
				case 'insights':
					if ( ! self::is_non_empty_string( $parsed['executiveSummary'] ?? '' ) ) {
						return array( 'error' => 'Highlights slice "insights" missing executiveSummary.' );
					}
					$highlights['executiveSummary'] = trim( (string) $parsed['executiveSummary'] );
					$highlights['keyTakeaways']     = self::string_list( $parsed['keyTakeaways'] ?? array(), 8 );
					if ( count( $highlights['keyTakeaways'] ) < 2 ) {
						return array( 'error' => 'Highlights slice "insights" missing keyTakeaways.' );
					}
					break;
				case 'performance':
					$highlights['performanceNarrative'] = self::string_list( $parsed['performanceNarrative'] ?? array(), 6 );
					if ( count( $highlights['performanceNarrative'] ) < 1 ) {
						return array( 'error' => 'Highlights slice "performance" missing performanceNarrative.' );
					}
					break;
				case 'keyword':
					$highlights['keywordNarrative'] = self::string_list( $parsed['keywordNarrative'] ?? array(), 4 );
					if ( count( $highlights['keywordNarrative'] ) < 1 ) {
						return array( 'error' => 'Highlights slice "keyword" missing keywordNarrative.' );
					}
					break;
				case 'seo_opportunities':
					$top = $parsed['topOpportunities'] ?? array();
					if ( ! is_array( $top ) || count( $top ) < 1 ) {
						return array( 'error' => 'Highlights slice "seo_opportunities" missing topOpportunities.' );
					}
					$highlights['topOpportunities'] = $top;
					break;
				case 'google_ads':
					$highlights['googleAdsNarrative'] = self::string_list( $parsed['googleAdsNarrative'] ?? array(), 4 );
					if ( count( $highlights['googleAdsNarrative'] ) < 1 ) {
						return array( 'error' => 'Highlights slice "google_ads" missing googleAdsNarrative.' );
					}
					$ads_top = $parsed['topOpportunities'] ?? array();
					if ( is_array( $ads_top ) && count( $ads_top ) > 0 ) {
						$highlights['topOpportunities'] = array_merge(
							$highlights['topOpportunities'],
							$ads_top
						);
					}
					break;
			}
		}

		return array( 'highlights' => $highlights );
	}

	/**
	 * @param mixed $raw
	 * @return array<int,string>
	 */
	private static function string_list( $raw, int $max ): array {
		if ( ! is_array( $raw ) ) {
			return array();
		}
		$out = array();
		foreach ( $raw as $item ) {
			if ( ! self::is_non_empty_string( $item ) ) {
				continue;
			}
			$out[] = trim( (string) $item );
			if ( count( $out ) >= $max ) {
				break;
			}
		}
		return $out;
	}

	/**
	 * @param mixed $value
	 */
	private static function is_non_empty_string( $value ): bool {
		return is_string( $value ) && trim( $value ) !== '';
	}

	private static function no_dates_line(): string {
		return 'Never write calendar dates or date ranges in your output (no month-day-year, no "Sep 21 - Oct 20", no years). Tables already show dates. When showCompare is true, say the reporting period and the prior period with metrics only.';
	}

	private static function query_prose_line(): string {
		return 'GSC queries in JSON are lowercase slugs. In narrative prose, never copy them verbatim. Bold each query you cite using **readable Title Case** and correct brand or place names (JSON hunter douglas blinds edmonton → **Hunter Douglas blinds Edmonton**; branded queries → use snapshot.siteName capitalization, e.g. **Blind Magic Edmonton**). Every sentence must start with a capital letter; never start a sentence with a lowercase word.';
	}

	private static function prose_line(): string {
		return 'American English with full sentence grammar. Use snapshot.siteName for the client brand in prose. ' . self::query_prose_line();
	}

	private static function insights_system_prompt(): string {
		return 'Neo Digital SEO report. JSON only: {"executiveSummary":"string","keyTakeaways":["string"]}.' . "\n\n"
			. self::prose_line() . "\n\n"
			. self::no_dates_line() . "\n\n"
			. 'executiveSummary: one sentence. keyTakeaways: 2–4 sentences (GA4 organic, GSC visibility; optional one Google Ads line if googleAdsTotals exists).';
	}

	private static function performance_system_prompt(): string {
		return 'Neo Digital SEO report. JSON only: {"performanceNarrative":["string"]}.' . "\n\n"
			. self::prose_line() . "\n\n"
			. self::no_dates_line() . "\n\n"
			. 'Two or three short paragraphs: (1) GA4 organic sessions and engagement, (2) GSC clicks, impressions, CTR, position. No Google Ads.';
	}

	private static function keyword_system_prompt(): string {
		return 'Neo Digital SEO report. JSON only: {"keywordNarrative":["string"]}.' . "\n\n"
			. self::prose_line() . "\n\n"
			. self::no_dates_line() . "\n\n"
			. 'Write one or two paragraphs summarizing topQueries only. When showCompare is true, compare laterClicks and earlierClicks across top queries (e.g. **Blind Magic Edmonton** recorded 27 clicks compared with 44 in the prior period). When showCompare is false, summarize clicks, impressions, and avgPosition for the leading queries. If topQueries is empty, return one factual sentence stating that query-level Search Console data was not recorded for the period.';
	}

	private static function seo_opportunities_system_prompt(): string {
		return 'Neo Digital SEO report. JSON only: {"topOpportunities":[{"rank":1,"label":"string","why":"string","comparisonRows":[{"metric":"string","comparePeriodValue":"string","primaryPeriodValue":"string"}]}]}.' . "\n\n"
			. self::prose_line() . "\n\n"
			. self::no_dates_line() . "\n\n"
			. 'Three or four organic opportunities (GA4, GSC, queries). Each why is one or two full sentences (capital letter first); bold queries in Title Case per query rules above. No Google Ads metrics. No actions.';
	}

	private static function google_ads_system_prompt(): string {
		return 'Neo Digital SEO report. JSON only: {"googleAdsNarrative":["string"],"topOpportunities":[{"rank":1,"label":"string","why":"string","comparisonRows":[{"metric":"string","comparePeriodValue":"string","primaryPeriodValue":"string"}]}]}.' . "\n\n"
			. self::prose_line() . "\n\n"
			. self::no_dates_line() . "\n\n"
			. 'googleAdsNarrative: paid search from googleAdsTotals only. topOpportunities: 0–2 paid items with (Google Ads) metrics.';
	}
}
