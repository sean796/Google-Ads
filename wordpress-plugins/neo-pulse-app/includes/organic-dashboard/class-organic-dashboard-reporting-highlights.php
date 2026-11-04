<?php
/**
 * Server-side organic Performance report narratives (OpenRouter).
 *
 * @package Neo_Pulse_App
 */

defined( 'ABSPATH' ) || exit;

class Neo_Pulse_App_Organic_Dashboard_Reporting_Highlights {

	/** Output budget for structured JSON slices (long ranges + many queries). */
	private const SLICE_MAX_TOKENS = 65536;

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
			if ( ! empty( $body['localGridNarrativeOnly'] ) ) {
				return self::generate_local_grid_report_narrative( $body, $site_id, $snapshot );
			}

			$model = Neo_Pulse_App_Openrouter_Agent_Models::resolve(
				Neo_Pulse_App_Openrouter_Agent_Models::CATEGORY_REPORT,
				isset( $body['model'] ) ? (string) $body['model'] : ''
			);
			$job_opts = array(
				'model'       => $model,
				'temperature' => 0.15,
				'maxTokens'   => self::SLICE_MAX_TOKENS,
				'reasoning'   => array(
					'effort'  => 'none',
					'exclude' => true,
				),
			);

			$has_grid     = isset( $snapshot['localGrid'] ) && is_array( $snapshot['localGrid'] ) && ! empty( $snapshot['localGrid']['scanId'] );
			$bypass_cache = self::reporting_highlights_bypass_cache( $body );

			$cache_key = 'neo_pulse_orh_' . md5(
				wp_json_encode(
					array(
						'v'        => 11,
						'siteId'   => $site_id,
						'model'    => $model,
						'snapshot' => $snapshot,
					)
				)
			);
			if ( ! $bypass_cache ) {
				$cached = get_transient( $cache_key );
				if ( is_array( $cached ) && ! empty( $cached['executiveSummary'] ) ) {
					$has_ads = self::snapshot_has_google_ads( $snapshot );
					if ( $has_grid && empty( $cached['localGridNarrative'] ) ) {
						$cached = self::patch_local_grid_narrative( $body, $site_id, $snapshot, $cached );
						if ( ! empty( $cached['localGridNarrative'] ) ) {
							set_transient( $cache_key, $cached, 6 * HOUR_IN_SECONDS );
						}
					}
					if ( $has_ads && empty( $cached['googleAdsNarrative'] ) ) {
						$cached = self::patch_google_ads_narrative( $body, $site_id, $snapshot, $cached );
						if ( ! empty( $cached['googleAdsNarrative'] ) ) {
							set_transient( $cache_key, $cached, 6 * HOUR_IN_SECONDS );
						}
					}
					if ( self::snapshot_has_top_queries( $snapshot ) && empty( $cached['keywordNarrative'] ) ) {
						$cached = self::patch_keyword_narrative( $body, $site_id, $snapshot, $cached );
						if ( ! empty( $cached['keywordNarrative'] ) ) {
							set_transient( $cache_key, $cached, 6 * HOUR_IN_SECONDS );
						}
					}
					$cached_grid_ok = ! $has_grid || ! empty( $cached['localGridNarrative'] );
					$cached_ads_ok  = ! $has_ads || ! empty( $cached['googleAdsNarrative'] );
					$cached_kw_ok   = ! self::snapshot_has_top_queries( $snapshot ) || ! empty( $cached['keywordNarrative'] );
					if ( $cached_grid_ok && $cached_ads_ok && $cached_kw_ok ) {
						return array(
							'statusCode' => 200,
							'body'       => array(
								'success'    => true,
								'highlights' => $cached,
								'cached'     => true,
							),
						);
					}
				}
			}

			$slice_specs = self::build_parallel_slice_specs( $snapshot );
			$jobs        = array();
			$slice_ids   = array();
			foreach ( $slice_specs as $spec ) {
				$slice_ids[] = $spec['id'];
				$slice_opts  = $job_opts;
				if ( $spec['id'] === 'google_ads' ) {
					$slice_opts['responseFormat'] = self::google_ads_response_format();
				}
				if ( $spec['id'] === 'keyword' ) {
					$slice_opts['responseFormat'] = self::keyword_response_format();
				}
				$jobs[] = array(
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
					'opts'     => $slice_opts,
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

			$highlights_out = self::patch_keyword_narrative( $body, $site_id, $snapshot, $merged['highlights'] );
			$highlights_out = self::patch_google_ads_narrative( $body, $site_id, $snapshot, $highlights_out );
			$highlights_out = self::patch_local_grid_narrative( $body, $site_id, $snapshot, $highlights_out );

			if ( self::snapshot_has_top_queries( $snapshot ) && empty( $highlights_out['keywordNarrative'] ) ) {
				return array(
					'statusCode' => 502,
					'body'       => array(
						'success' => false,
						'error'   => 'Highlights slice "keyword" missing keywordNarrative.',
					),
				);
			}

			if ( self::snapshot_has_google_ads( $snapshot ) && empty( $highlights_out['googleAdsNarrative'] ) ) {
				return array(
					'statusCode' => 502,
					'body'       => array(
						'success' => false,
						'error'   => 'Highlights slice "google_ads" missing googleAdsNarrative.',
					),
				);
			}

			set_transient( $cache_key, $highlights_out, 6 * HOUR_IN_SECONDS );

			return array(
				'statusCode' => 200,
				'body'       => array(
					'success'    => true,
					'highlights' => $highlights_out,
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
	/**
	 * @param array<string,mixed> $body
	 * @param array<string,mixed> $snapshot
	 * @return array{statusCode:int,body:array<string,mixed>}
	 */
	/**
	 * @param array<string,mixed> $body
	 * @param array<string,mixed> $snapshot
	 * @param array<string,mixed> $highlights
	 * @return array<string,mixed>
	 */
	/**
	 * @param array<string,mixed> $snapshot
	 */
	private static function snapshot_has_google_ads( array $snapshot ): bool {
		return isset( $snapshot['googleAdsTotals'] )
			&& is_array( $snapshot['googleAdsTotals'] )
			&& $snapshot['googleAdsTotals'] !== array();
	}

	/**
	 * @param array<string,mixed> $snapshot
	 */
	private static function snapshot_has_top_queries( array $snapshot ): bool {
		$queries = $snapshot['topQueries'] ?? null;
		return is_array( $queries ) && count( $queries ) > 0;
	}

	/**
	 * @return array{type:string,json_schema:array<string,mixed>}
	 */
	private static function keyword_response_format(): array {
		return array(
			'type'        => 'json_schema',
			'json_schema' => array(
				'name'   => 'organic_keyword_highlights',
				'strict' => true,
				'schema' => array(
					'type'                 => 'object',
					'additionalProperties' => false,
					'required'             => array( 'keywordNarrative' ),
					'properties'           => array(
						'keywordNarrative' => array(
							'type'     => 'array',
							'minItems' => 1,
							'maxItems' => 2,
							'items'    => array(
								'type'      => 'string',
								'minLength' => 24,
							),
						),
					),
				),
			),
		);
	}

	/**
	 * @return array{type:string,json_schema:array<string,mixed>}
	 */
	private static function google_ads_response_format(): array {
		return array(
			'type'        => 'json_schema',
			'json_schema' => array(
				'name'   => 'organic_google_ads_highlights',
				'strict' => true,
				'schema' => array(
					'type'                 => 'object',
					'additionalProperties' => false,
					'required'             => array( 'googleAdsNarrative' ),
					'properties'           => array(
						'googleAdsNarrative' => array(
							'type'     => 'array',
							'minItems' => 1,
							'maxItems' => 2,
							'items'    => array(
								'type'      => 'string',
								'minLength' => 24,
							),
						),
					),
				),
			),
		);
	}

	/**
	 * @param array<string,mixed> $body
	 * @param array<string,mixed> $snapshot
	 * @param array<string,mixed> $highlights
	 * @return array<string,mixed>
	 */
	private static function patch_keyword_narrative( array $body, string $site_id, array $snapshot, array $highlights ): array {
		if ( ! self::snapshot_has_top_queries( $snapshot ) || ! empty( $highlights['keywordNarrative'] ) ) {
			return $highlights;
		}

		$model = Neo_Pulse_App_Openrouter_Agent_Models::resolve(
			Neo_Pulse_App_Openrouter_Agent_Models::CATEGORY_REPORT,
			isset( $body['model'] ) ? (string) $body['model'] : ''
		);

		$has_semrush = isset( $snapshot['semrushBrandedTotals'] ) && is_array( $snapshot['semrushBrandedTotals'] ) && ! empty( $snapshot['semrushBrandedTotals'] );
		$slice_snapshot = array_merge(
			self::snapshot_common_fields( $snapshot ),
			self::pick_snapshot_fields( $snapshot, array( 'topQueries', 'semrushBrandedTotals' ) )
		);

		try {
			$parsed = Neo_Pulse_App_Chat_Openrouter::json_completion(
				array(
					array(
						'role'    => 'system',
						'content' => self::keyword_system_prompt( $has_semrush ),
					),
					array(
						'role'    => 'user',
						'content' => self::snapshot_user_message( $slice_snapshot ),
					),
				),
				array(
					'model'          => $model,
					'temperature'    => 0.15,
					'maxTokens'      => 8192,
					'responseFormat' => self::keyword_response_format(),
					'reasoning'      => array(
						'effort'  => 'none',
						'exclude' => true,
					),
				)
			);
		} catch ( Exception $e ) {
			return $highlights;
		}

		if ( ! is_array( $parsed ) ) {
			return $highlights;
		}

		$list = self::string_list( $parsed['keywordNarrative'] ?? array(), 4 );
		if ( count( $list ) < 1 ) {
			return $highlights;
		}

		$highlights['keywordNarrative'] = $list;
		return $highlights;
	}

	private static function patch_google_ads_narrative( array $body, string $site_id, array $snapshot, array $highlights ): array {
		if ( ! self::snapshot_has_google_ads( $snapshot ) || ! empty( $highlights['googleAdsNarrative'] ) ) {
			return $highlights;
		}

		$model = Neo_Pulse_App_Openrouter_Agent_Models::resolve(
			Neo_Pulse_App_Openrouter_Agent_Models::CATEGORY_REPORT,
			isset( $body['model'] ) ? (string) $body['model'] : ''
		);

		$slice_snapshot = array_merge(
			self::snapshot_common_fields( $snapshot ),
			self::pick_snapshot_fields(
				$snapshot,
				array( 'googleAdsTotals', 'googleAdsBudgetCaption' )
			)
		);

		try {
			$parsed = Neo_Pulse_App_Chat_Openrouter::json_completion(
				array(
					array(
						'role'    => 'system',
						'content' => self::google_ads_system_prompt(),
					),
					array(
						'role'    => 'user',
						'content' => self::snapshot_user_message( $slice_snapshot ),
					),
				),
				array(
					'model'          => $model,
					'temperature'    => 0.15,
					'maxTokens'      => 8192,
					'responseFormat' => self::google_ads_response_format(),
					'reasoning'      => array(
						'effort'  => 'none',
						'exclude' => true,
					),
				)
			);
		} catch ( Exception $e ) {
			return $highlights;
		}

		if ( ! is_array( $parsed ) ) {
			return $highlights;
		}

		$list = self::string_list( $parsed['googleAdsNarrative'] ?? array(), 4 );
		if ( count( $list ) < 1 ) {
			return $highlights;
		}

		$highlights['googleAdsNarrative'] = $list;
		$ads_top                          = $parsed['topOpportunities'] ?? array();
		if ( is_array( $ads_top ) && count( $ads_top ) > 0 ) {
			$highlights['topOpportunities'] = array_merge(
				isset( $highlights['topOpportunities'] ) && is_array( $highlights['topOpportunities'] )
					? $highlights['topOpportunities']
					: array(),
				$ads_top
			);
		}

		return $highlights;
	}

	private static function patch_local_grid_narrative( array $body, string $site_id, array $snapshot, array $highlights ): array {
		$has_grid = isset( $snapshot['localGrid'] ) && is_array( $snapshot['localGrid'] ) && ! empty( $snapshot['localGrid']['scanId'] );
		if ( ! $has_grid || ! empty( $highlights['localGridNarrative'] ) ) {
			return $highlights;
		}

		$only = self::generate_local_grid_report_narrative( $body, $site_id, $snapshot );
		if ( (int) ( $only['statusCode'] ?? 500 ) !== 200 ) {
			return $highlights;
		}

		$list = isset( $only['body']['highlights']['localGridNarrative'] ) && is_array( $only['body']['highlights']['localGridNarrative'] )
			? $only['body']['highlights']['localGridNarrative']
			: array();
		if ( count( $list ) < 1 ) {
			return $highlights;
		}

		$highlights['localGridNarrative'] = $list;
		return $highlights;
	}

	/**
	 * @param array<string,mixed> $body
	 * @param array<string,mixed> $snapshot
	 * @return array{statusCode:int,body:array<string,mixed>}
	 */
	public static function generate_local_grid_report_narrative( array $body, string $site_id, array $snapshot ): array {
		$has_grid = isset( $snapshot['localGrid'] ) && is_array( $snapshot['localGrid'] ) && ! empty( $snapshot['localGrid']['scanId'] );
		if ( ! $has_grid ) {
			return array(
				'statusCode' => 400,
				'body'       => array(
					'success' => false,
					'error'   => 'snapshot.localGrid with scanId is required',
				),
			);
		}

		$model = Neo_Pulse_App_Openrouter_Agent_Models::resolve(
			Neo_Pulse_App_Openrouter_Agent_Models::CATEGORY_REPORT,
			isset( $body['model'] ) ? (string) $body['model'] : ''
		);
		$job_opts = array(
			'model'       => $model,
			'temperature' => 0.15,
			'maxTokens'   => self::SLICE_MAX_TOKENS,
			'reasoning'   => array(
				'effort'  => 'none',
				'exclude' => true,
			),
		);

		$slice_snapshot = array_merge(
			self::snapshot_common_fields( $snapshot ),
			self::pick_snapshot_fields( $snapshot, array( 'localGrid' ) )
		);

		$parsed = Neo_Pulse_App_Chat_Openrouter::json_completion(
			array(
				array(
					'role'    => 'system',
					'content' => self::local_grid_system_prompt(),
				),
				array(
					'role'    => 'user',
					'content' => self::snapshot_user_message( $slice_snapshot ),
				),
			),
			$job_opts
		);

		if ( ! is_array( $parsed ) ) {
			return array(
				'statusCode' => 502,
				'body'       => array(
					'success' => false,
					'error'   => 'Local grid narrative returned invalid JSON.',
				),
			);
		}

		$local_grid_narrative = self::string_list( $parsed['localGridNarrative'] ?? array(), 4 );
		if ( count( $local_grid_narrative ) < 1 ) {
			return array(
				'statusCode' => 502,
				'body'       => array(
					'success' => false,
					'error'   => 'Highlights slice "local_grid" missing localGridNarrative.',
				),
			);
		}

		return array(
			'statusCode' => 200,
			'body'       => array(
				'success'    => true,
				'highlights' => array(
					'localGridNarrative' => $local_grid_narrative,
				),
			),
		);
	}

	/**
	 * @param array<string,mixed> $snapshot
	 * @return array<int,array{id:string,system:string,snapshot:array<string,mixed>}>
	 */
	private static function build_parallel_slice_specs( array $snapshot ): array {
		$common = self::snapshot_common_fields( $snapshot );
		$has_ads   = self::snapshot_has_google_ads( $snapshot );
		$has_grid  = isset( $snapshot['localGrid'] ) && is_array( $snapshot['localGrid'] ) && ! empty( $snapshot['localGrid']['scanId'] );
		$has_semrush = isset( $snapshot['semrushBrandedTotals'] ) && is_array( $snapshot['semrushBrandedTotals'] ) && ! empty( $snapshot['semrushBrandedTotals'] );

		$specs = array(
			array(
				'id'       => 'insights',
				'system'   => self::insights_system_prompt( $has_ads, $has_grid, $has_semrush ),
				'snapshot' => array_merge(
					$common,
					self::pick_snapshot_fields(
						$snapshot,
						array( 'ga4Rows', 'gscTotals', 'googleAdsTotals', 'periodTotals', 'semrushBrandedTotals', 'localGrid' )
					)
				),
			),
			array(
				'id'       => 'performance',
				'system'   => self::performance_system_prompt( $has_semrush ),
				'snapshot' => array_merge(
					$common,
					self::pick_snapshot_fields(
						$snapshot,
						$has_semrush
							? array( 'ga4Rows', 'gscTotals', 'monthlyProgression', 'periodTotals', 'semrushBrandedTotals' )
							: array( 'ga4Rows', 'gscTotals', 'monthlyProgression', 'periodTotals' )
					)
				),
			),
			array(
				'id'       => 'keyword',
				'system'   => self::keyword_system_prompt( $has_semrush ),
				'snapshot' => array_merge(
					$common,
					self::pick_snapshot_fields( $snapshot, array( 'topQueries', 'semrushBrandedTotals' ) )
				),
			),
			array(
				'id'       => 'seo_opportunities',
				'system'   => self::seo_opportunities_system_prompt( $has_semrush ),
				'snapshot' => array_merge(
					$common,
					self::pick_snapshot_fields(
						$snapshot,
						array( 'ga4Rows', 'gscTotals', 'topQueries', 'semrushBrandedTotals' )
					)
				),
			),
		);

		if ( $has_grid ) {
			$specs[] = array(
				'id'       => 'local_grid',
				'system'   => self::local_grid_system_prompt(),
				'snapshot' => array_merge(
					$common,
					self::pick_snapshot_fields( $snapshot, array( 'localGrid' ) )
				),
			);
		}

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
			'localGridNarrative'   => array(),
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
					if ( count( $highlights['keyTakeaways'] ) === 1 ) {
						$highlights['keyTakeaways'][] = 'Search Console and GA4 engagement metrics are detailed in the performance sections below.';
					}
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
					$ads_top = $parsed['topOpportunities'] ?? array();
					if ( is_array( $ads_top ) && count( $ads_top ) > 0 ) {
						$highlights['topOpportunities'] = array_merge(
							$highlights['topOpportunities'],
							$ads_top
						);
					}
					break;
				case 'local_grid':
					$highlights['localGridNarrative'] = self::string_list( $parsed['localGridNarrative'] ?? array(), 4 );
					if ( count( $highlights['localGridNarrative'] ) < 1 ) {
						return array( 'error' => 'Highlights slice "local_grid" missing localGridNarrative.' );
					}
					break;
			}
		}

		return array( 'highlights' => $highlights );
	}

	private static function is_negative_omission_statement( string $text ): bool {
		$t = trim( $text );
		if ( $t === '' ) {
			return false;
		}
		if ( preg_match( '/\bno\s+branded\s+search\s+totals?\s+(?:were|are|was)\s+available\b/i', $t ) ) {
			return true;
		}
		if ( preg_match( '/\bbranded\s+demand\s+cannot\s+be\s+(?:confirmed|verified|measured)\b/i', $t ) ) {
			return true;
		}
		if ( preg_match( '/\bcannot\s+be\s+confirmed\s+from\s+semrush\b/i', $t ) ) {
			return true;
		}
		if ( preg_match( '/\bsemrush\b/i', $t ) && preg_match( '/\b(?:not|no|cannot|can\'t)\s+[^.]{0,140}(?:available|confirmed|verified|alone)\b/i', $t ) ) {
			return true;
		}
		$channel = '/(?:google\s+ads|paid\s+search|semrush|local\s+grid|local\s+map|map\s+pack|local\s+falcon|tarp)/i';
		if ( ! preg_match( $channel, $t ) ) {
			return false;
		}
		$no_channel = '/\bno\s+(?:google\s+ads|paid\s+search|semrush|local\s+grid|local\s+map|map\s+pack|local\s+falcon|data\s+for\s+google\s+ads)[^.]*?(?:available|reported|recorded|supplied|provided|found|configured|tracked|data|figures?|totals?|metrics?|results?|included|active|inquiries|leads)/i';
		$channel_negative = '/\b(?:google\s+ads|paid\s+search|semrush|local\s+grid|local\s+map|map\s+pack|local\s+falcon)[^.]*?(?:(?:(?:is|was|are|were|has\s+been)\s+)?(?:omitted|unavailable|not\s+configured|not\s+available|not\s+connected|not\s+reported|not\s+tracked|not\s+supplied|not\s+provided|not\s+active|excluded)|returned\s+no\s+data|contained\s+no|is\s+omitted|omitted\s+from\s+this\s+report|was\s+not\s+recorded|were\s+not\s+recorded)/i';
		$omitted = '/(?:omitted\s+from\s+this\s+report|(?:not|no)\s+(?:data|metrics|figures|totals)\s+(?:are|is|were|was)?\s*(?:available|reported|found|supplied|provided)\s+for\s+(?:google\s+ads|paid\s+search|semrush|local\s+map|local\s+grid))/i';

		return (bool) ( preg_match( $no_channel, $t ) || preg_match( $channel_negative, $t ) || preg_match( $omitted, $t ) );
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
			$str = trim( (string) $item );
			if ( self::is_negative_omission_statement( $str ) ) {
				continue;
			}
			$out[] = $str;
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

	/**
	 * @param array<string,mixed> $body
	 */
	private static function reporting_highlights_bypass_cache( array $body ): bool {
		if ( ! empty( $body['bypassCache'] ) ) {
			return true;
		}
		if ( isset( $_SERVER['HTTP_X_NEO_PULSE_REPORTING_HIGHLIGHTS_BYPASS_CACHE'] ) ) {
			return trim( (string) wp_unslash( $_SERVER['HTTP_X_NEO_PULSE_REPORTING_HIGHLIGHTS_BYPASS_CACHE'] ) ) === '1';
		}
		return false;
	}

	private static function no_dates_line(): string {
		return 'Never write calendar dates or date ranges in your output (no month-day-year, no "Sep 21 - Oct 20", no years). Tables already show dates. When showCompare is true, say the reporting period and the prior period with metrics only.';
	}

	private static function query_prose_line(): string {
		return 'GSC queries in JSON are lowercase slugs. In narrative prose, never copy them verbatim. Bold each query you cite using **readable Title Case** and correct brand or place names (JSON hunter douglas blinds edmonton → **Hunter Douglas blinds Edmonton**; branded queries → use snapshot.siteName capitalization, e.g. **Blind Magic Edmonton**). Every sentence must start with a capital letter; never start a sentence with a lowercase word.';
	}

	private static function prose_line(): string {
		return 'Write in plain, everyday business English directly to a busy CEO or business owner (such as the owner of Blind Magic). Use snapshot.siteName for the client brand. Keep sentences simple, warm, and conversational. Avoid stat-heavy dumps because the numbers are already shown in the tables below. Never use technical SEO or analytics acronyms like GA4, GSC, Google Search Console, CTR, SERP, TARP, key events, or impressions; instead say website visits, shoppers seeing your business on Google, clicks to your website, quote and call actions, and neighborhood map spots. ' . self::query_prose_line();
	}

	private static function ai_search_context_line( bool $has_semrush = false, bool $has_ads = false, bool $has_grid = false ): string {
		$line = 'Owner business context: Google AI summaries answer simple questions right on the search page, so the shoppers who click through to your website are higher-intent buyers ready to browse products or request a quote. Focus on buyer interest, website visits, quote/call actions, and people searching for your brand or products.';
		if ( $has_semrush ) {
			$line .= ' Reference people searching your brand name vs general product searches only when semrushBrandedTotals is in the snapshot.';
		}
		if ( $has_ads ) {
			$line .= ' Mention paid Google Ads leads when googleAdsTotals is in the snapshot.';
		}
		if ( $has_grid ) {
			$line .= ' When localGrid exists, highlight how well the business shows up in local Google Maps results.';
		}
		return $line;
	}

	private static function missing_channel_rules_line(): string {
		return 'Strict rule: ONLY discuss channels and metrics present in the snapshot JSON. Never state that data is missing, unavailable, omitted, or cannot be confirmed (never write "No Semrush data", "branded search totals were not available", or "cannot be confirmed from Semrush"). If semrushBrandedTotals, googleAdsTotals, or localGrid are absent or empty, do not mention that channel at all.';
	}

	private static function insights_system_prompt( bool $has_ads = false, bool $has_grid = false, bool $has_semrush = false ): string {
		$channel_rules = 'Strict rule: ONLY discuss and report on sections and channels that actually exist in the snapshot with active data. Never write negative or omission statements about missing or unconfigured channels (e.g. NEVER write "No Google Ads data is available", "Google Ads is omitted", "No Semrush data reported", or "No local map data"). If a channel or section has no data or is not present, completely omit it without any comment.';

		$takeaway_instructions = 'keyTakeaways: 2–4 short, plain-English bullet sentences for the business owner explaining how website visits, buyer interest on Google, and customer actions moved.';
		if ( $has_semrush ) {
			$takeaway_instructions .= ' Include a simple takeaway on people searching your brand name versus general product searches.';
		} else {
			$takeaway_instructions .= ' Do NOT mention Semrush.';
		}
		if ( $has_grid ) {
			$takeaway_instructions .= ' Include a plain-English takeaway on neighborhood Google Maps visibility.';
		} else {
			$takeaway_instructions .= ' Do NOT mention local grid or local map.';
		}
		if ( $has_ads ) {
			$takeaway_instructions .= ' Include one clear line on customer leads and ad spend from paid Google Ads.';
		} else {
			$takeaway_instructions .= ' Do NOT mention Google Ads or paid search at all.';
		}

		return 'Neo Digital owner-friendly performance report. JSON only: {"executiveSummary":"string","keyTakeaways":["string"]}.' . "\n\n"
			. self::prose_line() . "\n\n"
			. self::ai_search_context_line( $has_semrush, $has_ads, $has_grid ) . "\n\n"
			. self::no_dates_line() . "\n\n"
			. $channel_rules . "\n\n"
			. 'executiveSummary: one simple, direct sentence for the CEO/owner explaining the bottom-line business story (customer demand, quote/call actions, and brand presence) without listing a string of raw numbers. '
			. $takeaway_instructions;
	}

	private static function performance_system_prompt( bool $has_semrush = false ): string {
		$semrush_line = $has_semrush
			? 'When semrushBrandedTotals is in the snapshot, briefly explain how many people searched directly for the company name versus general product terms.'
			: 'Do NOT mention Semrush, branded search totals, or branded vs non-branded volume.';

		return 'Neo Digital owner-friendly performance report. JSON only: {"performanceNarrative":["string"]}.' . "\n\n"
			. self::prose_line() . "\n\n"
			. self::ai_search_context_line( $has_semrush, false, false ) . "\n\n"
			. self::no_dates_line() . "\n\n"
			. self::missing_channel_rules_line() . "\n\n"
			. 'Write 1 or 2 short, easy-to-read paragraphs (about 60–90 words total) for a business owner: explain in plain language how website visits, active shoppers on the site, and visibility on Google moved, focusing on what it means for customer inquiries rather than reciting every number from the table. '
			. $semrush_line . ' No Google Ads. Output only the JSON object.';
	}

	private static function keyword_system_prompt( bool $has_semrush = false ): string {
		$semrush_line = $has_semrush
			? ' You may briefly note brand-name demand when semrushBrandedTotals is in the snapshot.'
			: ' Do NOT mention Semrush or branded search totals.';

		return 'Neo Digital owner-friendly performance report. JSON only: {"keywordNarrative":["string"]}.' . "\n\n"
			. self::prose_line() . "\n\n"
			. self::ai_search_context_line( $has_semrush, false, false ) . "\n\n"
			. self::no_dates_line() . "\n\n"
			. self::missing_channel_rules_line() . "\n\n"
			. 'Required: keywordNarrative must contain 1 or 2 short, plain-English paragraphs (each at least two sentences, maximum 140 words total). Explain to the business owner what customers are typing into Google to find them, distinguishing people searching directly for their company name from shoppers looking for specific products or services (such as custom blinds, shades, or local installers) without overloading the paragraph with raw numbers.'
			. $semrush_line
			. ' If topQueries is empty, return one simple sentence stating that individual search terms were not recorded for this window. Output only the JSON object.';
	}

	private static function seo_opportunities_system_prompt( bool $has_semrush = false ): string {
		$branded = $has_semrush
			? 'customer actions, Google search terms, and brand vs product demand when data exists.'
			: 'customer actions and Google search terms only; do not mention Semrush or branded search totals.';

		return 'Neo Digital owner-friendly performance report. JSON only: {"topOpportunities":[{"rank":1,"label":"string","why":"string","comparisonRows":[{"metric":"string","comparePeriodValue":"string","primaryPeriodValue":"string"}]}]}.' . "\n\n"
			. self::prose_line() . "\n\n"
			. self::ai_search_context_line( $has_semrush, false, false ) . "\n\n"
			. self::no_dates_line() . "\n\n"
			. self::missing_channel_rules_line() . "\n\n"
			. 'Three or four growth opportunities (' . $branded . ') Write each label as a clear, owner-friendly headline (no SEO jargon). Each why is one or two simple sentences explaining in plain business speak why this search term or trend matters for bringing in more customers and quotes; bold search terms in Title Case per query rules above. Do not cram raw stats into why because the table below already shows the numbers. No Google Ads metrics.';
	}

	private static function local_grid_system_prompt(): string {
		return 'Neo Digital owner-friendly local report. JSON only: {"localGridNarrative":["string"]}.' . "\n\n"
			. self::prose_line() . "\n\n"
			. self::no_dates_line() . "\n\n"
			. 'Required: localGridNarrative must contain 1 short, plain-English paragraph for a business owner. Explain where the business shows up in the top 3 on Google Maps for the tracked search term and where outlying neighborhoods have room to grow to bring in more local callers and showroom/in-home visits. Avoid technical acronyms like TARP; use everyday language and let the scorecard table below carry the exact percentages.';
	}

	private static function google_ads_system_prompt(): string {
		return 'Neo Digital owner-friendly report. JSON only: {"googleAdsNarrative":["string"],"topOpportunities":[{"rank":1,"label":"string","why":"string","comparisonRows":[{"metric":"string","comparePeriodValue":"string","primaryPeriodValue":"string"}]}]}.' . "\n\n"
			. self::prose_line() . "\n\n"
			. self::no_dates_line() . "\n\n"
			. 'Required: googleAdsNarrative must contain 1 or 2 short, plain-English paragraphs (each at least two sentences) for the business owner. Explain how the paid ad budget performed in bringing in customer leads, calls, and website visits without repeating every number in the scorecard. Never say Google Ads data is missing, omitted, unavailable, or not configured.' . "\n\n"
			. 'topOpportunities: optional 0–2 paid items with (Google Ads) in the label and comparisonRows from googleAdsTotals.';
	}
}
