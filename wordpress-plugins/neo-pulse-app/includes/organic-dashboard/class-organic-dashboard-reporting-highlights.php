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
						'v'        => 8,
						'siteId'   => $site_id,
						'model'    => $model,
						'snapshot' => $snapshot,
					)
				)
			);
			if ( ! $bypass_cache ) {
				$cached = get_transient( $cache_key );
				if ( is_array( $cached ) && ! empty( $cached['executiveSummary'] ) ) {
					if ( $has_grid && empty( $cached['localGridNarrative'] ) ) {
						$cached = self::patch_local_grid_narrative( $body, $site_id, $snapshot, $cached );
						if ( ! empty( $cached['localGridNarrative'] ) ) {
							set_transient( $cache_key, $cached, 6 * HOUR_IN_SECONDS );
						}
					}
					$cached_grid_ok = ! $has_grid || ! empty( $cached['localGridNarrative'] );
					if ( $cached_grid_ok ) {
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

			$highlights_out = self::patch_local_grid_narrative( $body, $site_id, $snapshot, $merged['highlights'] );

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
		$has_ads   = isset( $snapshot['googleAdsTotals'] ) && is_array( $snapshot['googleAdsTotals'] ) && $snapshot['googleAdsTotals'] !== array();
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
		return 'American English with full sentence grammar. Use snapshot.siteName for the client brand in prose. ' . self::query_prose_line();
	}

	private static function ai_search_context_line( bool $has_semrush = false, bool $has_ads = false, bool $has_grid = false ): string {
		$line = 'AI search context: Google AI Overviews and zero-click summaries can reduce top-of-funnel clicks while high-intent demand still reaches the site. Do not treat a GSC click decline alone as SEO failure. Prioritize key events, engaged sessions, and branded queries in topQueries when present.';
		if ( $has_semrush ) {
			$line .= ' Use semrushBrandedTotals only when that object is in the snapshot.';
		}
		if ( $has_ads ) {
			$line .= ' Include Google Ads leads when googleAdsTotals is in the snapshot.';
		}
		if ( $has_grid ) {
			$line .= ' When localGrid exists, treat map pack visibility as a core local outcome.';
		}
		return $line;
	}

	private static function missing_channel_rules_line(): string {
		return 'Strict rule: ONLY discuss channels and metrics present in the snapshot JSON. Never state that data is missing, unavailable, omitted, or cannot be confirmed (never write "No Semrush data", "branded search totals were not available", or "cannot be confirmed from Semrush"). If semrushBrandedTotals, googleAdsTotals, or localGrid are absent or empty, do not mention that channel at all.';
	}

	private static function insights_system_prompt( bool $has_ads = false, bool $has_grid = false, bool $has_semrush = false ): string {
		$channel_rules = 'Strict rule: ONLY discuss and report on sections and channels that actually exist in the snapshot with active data. Never write negative or omission statements about missing or unconfigured channels (e.g. NEVER write "No Google Ads data is available", "Google Ads is omitted", "No Semrush data reported", or "No local map data"). If a channel or section has no data or is not present, completely omit it without any comment.';

		$takeaway_instructions = 'keyTakeaways: 2–4 sentences covering GA4 engagement/key events and GSC visibility with AI-aware framing.';
		if ( $has_semrush ) {
			$takeaway_instructions .= ' Include Semrush branded vs non-branded search split.';
		} else {
			$takeaway_instructions .= ' Do NOT mention Semrush.';
		}
		if ( $has_grid ) {
			$takeaway_instructions .= ' Include localGrid TARP and local map visibility.';
		} else {
			$takeaway_instructions .= ' Do NOT mention local grid or local map.';
		}
		if ( $has_ads ) {
			$takeaway_instructions .= ' Include one concise line summarizing Google Ads leads/spend from googleAdsTotals.';
		} else {
			$takeaway_instructions .= ' Do NOT mention Google Ads or paid search at all.';
		}

		return 'Neo Digital SEO report. JSON only: {"executiveSummary":"string","keyTakeaways":["string"]}.' . "\n\n"
			. self::prose_line() . "\n\n"
			. self::ai_search_context_line( $has_semrush, $has_ads, $has_grid ) . "\n\n"
			. self::no_dates_line() . "\n\n"
			. $channel_rules . "\n\n"
			. 'executiveSummary: one sentence on business outcomes (demand quality, leads/key events, branded visibility), not vanity traffic alone. '
			. $takeaway_instructions;
	}

	private static function performance_system_prompt( bool $has_semrush = false ): string {
		$semrush_line = $has_semrush
			? 'When semrushBrandedTotals is in the snapshot, briefly note branded vs non-branded search volume alongside GA4 and GSC.'
			: 'Do NOT mention Semrush, branded search totals, or branded vs non-branded volume. Use only GA4 and GSC from the snapshot.';

		return 'Neo Digital SEO report. JSON only: {"performanceNarrative":["string"]}.' . "\n\n"
			. self::prose_line() . "\n\n"
			. self::ai_search_context_line( $has_semrush, false, false ) . "\n\n"
			. self::no_dates_line() . "\n\n"
			. self::missing_channel_rules_line() . "\n\n"
			. 'Write 2–4 short paragraphs (about 80–120 words total): synthesize GA4 organic sessions (engaged sessions, key events) and GSC search visibility (clicks, impressions, CTR, position) with AI-aware interpretation. '
			. $semrush_line . ' No Google Ads. Output only the JSON object.';
	}

	private static function keyword_system_prompt( bool $has_semrush = false ): string {
		$semrush_line = $has_semrush
			? ' You may reference Semrush branded totals only when semrushBrandedTotals is in the snapshot.'
			: ' Do NOT mention Semrush or branded search totals.';

		return 'Neo Digital SEO report. JSON only: {"keywordNarrative":["string"]}.' . "\n\n"
			. self::prose_line() . "\n\n"
			. self::ai_search_context_line( $has_semrush, false, false ) . "\n\n"
			. self::no_dates_line() . "\n\n"
			. self::missing_channel_rules_line() . "\n\n"
			. 'Write one or two concise paragraphs (maximum 200 words total) summarizing topQueries. Separate branded queries (containing snapshot.siteName tokens) from non-branded demand.'
			. $semrush_line
			. ' When showCompare is true, compare laterClicks and earlierClicks across top queries. When showCompare is false, summarize clicks, impressions, and avgPosition for the leading queries. If topQueries is empty, return one factual sentence stating that query-level Search Console data was not recorded for the period. Output only the JSON object.';
	}

	private static function seo_opportunities_system_prompt( bool $has_semrush = false ): string {
		$branded = $has_semrush
			? 'GA4 key events/engagement, GSC, and branded vs non-branded queries when data exists.'
			: 'GA4 key events/engagement and GSC only; do not mention Semrush or branded search totals.';

		return 'Neo Digital SEO report. JSON only: {"topOpportunities":[{"rank":1,"label":"string","why":"string","comparisonRows":[{"metric":"string","comparePeriodValue":"string","primaryPeriodValue":"string"}]}]}.' . "\n\n"
			. self::prose_line() . "\n\n"
			. self::ai_search_context_line( $has_semrush, false, false ) . "\n\n"
			. self::no_dates_line() . "\n\n"
			. self::missing_channel_rules_line() . "\n\n"
			. 'Three or four organic opportunities (' . $branded . ') Each why is one or two full sentences (capital letter first); bold queries in Title Case per query rules above. No Google Ads metrics. No actions.';
	}

	private static function local_grid_system_prompt(): string {
		return 'Neo Digital local SEO report. JSON only: {"localGridNarrative":["string"]}.' . "\n\n"
			. self::prose_line() . "\n\n"
			. self::no_dates_line() . "\n\n"
			. 'Required: localGridNarrative must contain at least one non-empty string (one or two short paragraphs). Write like the keyword performance section: interpret the scan for a client, cite TARP, average rank, top-3 (high) share, and outside-top-20 (out) share from localGrid.summary, plus the tracked keyword. Explain where map pack visibility is strong vs weak and what that means for local leads. Do not invent cities or ranks not in localGrid.summary.';
	}

	private static function google_ads_system_prompt(): string {
		return 'Neo Digital SEO report. JSON only: {"googleAdsNarrative":["string"],"topOpportunities":[{"rank":1,"label":"string","why":"string","comparisonRows":[{"metric":"string","comparePeriodValue":"string","primaryPeriodValue":"string"}]}]}.' . "\n\n"
			. self::prose_line() . "\n\n"
			. self::no_dates_line() . "\n\n"
			. 'googleAdsNarrative: paid search from googleAdsTotals only. topOpportunities: 0–2 paid items with (Google Ads) metrics.';
	}
}
