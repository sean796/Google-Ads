<?php
/**
 * Maps POST /api/mcp/DataForSEO_* tool names to DataForSEO REST calls.
 *
 * @package Neo_Pulse_App
 */

defined( 'ABSPATH' ) || exit;

class Neo_Pulse_App_Dataforseo_Mcp_Router {

	/** @var array<string,string> tool name => REST path (no leading slash). */
	const TOOL_ENDPOINTS = array(
		'DataForSEO_dataforseo_labs_google_keyword_overview'       => 'dataforseo_labs/google/keyword_overview/live',
		'DataForSEO_dataforseo_labs_google_keyword_ideas'          => 'dataforseo_labs/google/keyword_ideas/live',
		'DataForSEO_dataforseo_labs_google_related_keywords'       => 'dataforseo_labs/google/related_keywords/live',
		'DataForSEO_kw_data_google_ads_keywords_for_keywords'      => 'keywords_data/google_ads/keywords_for_keywords/live',
		'DataForSEO_kw_data_dfs_trends_explore'                    => 'keywords_data/dataforseo_trends/explore/live',
		'DataForSEO_serp_organic_live_advanced'                    => 'serp/google/organic/live/advanced',
		'DataForSEO_serp_google_maps_live_advanced'                  => 'serp/google/maps/live/advanced',
		'DataForSEO_serp_google_ai_overview'                        => 'serp/google/ai_mode/live/advanced',
		'DataForSEO_on_page_lighthouse'                             => 'on_page/lighthouse/live/json',
		'DataForSEO_on_page_content_parsing'                        => 'on_page/content_parsing/live',
		'DataForSEO_dataforseo_labs_google_page_intersection'       => 'dataforseo_labs/google/page_intersection/live',
		'DataForSEO_dataforseo_labs_google_competitors_domain'      => 'dataforseo_labs/google/competitors_domain/live',
		'DataForSEO_business_data_business_listings_search'         => 'business_data/business_listings/search/live',
		'DataForSEO_business_data_google_my_business_info_live'     => 'business_data/google/my_business_info/live',
	);

	/** @var array<string,string> LLM Responses Live platform slug => REST path segment. */
	const LLM_RESPONSES_PLATFORMS = array(
		'chat_gpt'   => 'ai_optimization/chat_gpt/llm_responses/live',
		'gemini'     => 'ai_optimization/gemini/llm_responses/live',
		'perplexity' => 'ai_optimization/perplexity/llm_responses/live',
	);

	/**
	 * @return string[]
	 */
	public static function supported_tools(): array {
		$tools = array_keys( self::TOOL_ENDPOINTS );
		$tools[] = 'DataForSEO_serp_google_ai_mode';
		$tools[] = 'DataForSEO_llm_responses_live';
		return $tools;
	}

	public static function is_supported( string $tool ): bool {
		return in_array( $tool, self::supported_tools(), true );
	}

	/**
	 * @param string              $tool
	 * @param array<string,mixed> $body
	 * @return array<string,mixed>|WP_Error
	 */
	public static function dispatch( string $tool, array $body ) {
		if ( ! Neo_Pulse_App_Dataforseo_Client::has_credentials() ) {
			return new WP_Error( 'neo-pulse_dfs_missing', 'DataForSEO credentials are not configured.', array( 'status' => 400 ) );
		}

		if ( $tool === 'DataForSEO_serp_google_ai_mode' ) {
			return Neo_Pulse_App_Dataforseo_Ai_Mode::run( $body );
		}

		if ( $tool === 'DataForSEO_llm_responses_live' ) {
			return self::dispatch_llm_responses_live( $body );
		}

		if ( ! isset( self::TOOL_ENDPOINTS[ $tool ] ) ) {
			return new WP_Error( 'neo-pulse_dfs_tool', 'Unknown DataForSEO MCP tool.', array( 'status' => 404 ) );
		}

		$endpoint = self::TOOL_ENDPOINTS[ $tool ];
		$built    = self::build_tasks( $tool, $body );
		if ( is_wp_error( $built ) ) {
			return $built;
		}

		$timeout = self::timeout_for_tool( $tool );
		$result  = self::retry_transient_post( $endpoint, $built['tasks'], $timeout );
		if ( is_wp_error( $result ) ) {
			return $result;
		}

		$allow_empty = strpos( $tool, 'serp_' ) !== false;
		$check       = Neo_Pulse_App_Dataforseo_Client::assert_task_ok( $result, $allow_empty );
		if ( is_wp_error( $check ) ) {
			if ( $tool === 'DataForSEO_serp_organic_live_advanced' ) {
				return array(
					'tasks'       => array(),
					'stored_file' => null,
					'storedFile'  => null,
					'serp_error'  => $check->get_error_message(),
				);
			}
			if ( $tool === 'DataForSEO_business_data_google_my_business_info_live' ) {
				$task = $result['tasks'][0] ?? array();
				return new WP_Error(
					'neo-pulse_dfs_gmb_task',
					$check->get_error_message(),
					array(
						'status'                    => 422,
						'upstreamTaskStatusCode'    => $task['status_code'] ?? null,
						'upstreamTaskStatusMessage' => $task['status_message'] ?? null,
						'details'                   => $result,
					)
				);
			}
			return $check;
		}

		if ( $tool === 'DataForSEO_serp_organic_live_advanced' ) {
			$stored = Neo_Pulse_App_Dataforseo_Serp_Dumps::write(
				(string) ( $body['keyword'] ?? 'keyword' ),
				$result
			);
			if ( $stored === null || $stored === '' ) {
				return new WP_Error(
					'neo-pulse_dfs_serp_store',
					'SERP response received but failed to save dump file on the server.',
					array( 'status' => 500 )
				);
			}
			$result['stored_file'] = $stored;
			$result['storedFile']  = $stored;
		}

		return $result;
	}

	/**
	 * @param string              $tool
	 * @param array<string,mixed> $body
	 * @return array{tasks:array<int,mixed>}|WP_Error
	 */
	private static function build_tasks( string $tool, array $body ) {
		unset( $body['language_name'] );

		switch ( $tool ) {
			case 'DataForSEO_dataforseo_labs_google_keyword_overview':
				if ( empty( $body['keywords'] ) || ! is_array( $body['keywords'] ) ) {
					return new WP_Error( 'neo-pulse_dfs_validate', 'keywords array is required', array( 'status' => 400 ) );
				}
				return array(
					'tasks' => array(
						array(
							'keywords'       => array_values( $body['keywords'] ),
							'location_code'  => Neo_Pulse_App_Dataforseo_Client::location_code_from_request_body( $body ),
							'language_code'  => Neo_Pulse_App_Dataforseo_Client::ensure_language_code( $body['language_code'] ?? 'en' ),
						),
					),
				);

			case 'DataForSEO_dataforseo_labs_google_keyword_ideas':
				return array(
					'tasks' => array(
						array(
							'keywords'       => $body['keywords'] ?? array(),
							'location_code'  => Neo_Pulse_App_Dataforseo_Client::location_code_from_request_body( $body ),
							'language_code'  => Neo_Pulse_App_Dataforseo_Client::ensure_language_code( $body['language_code'] ?? 'en' ),
							'limit'          => isset( $body['limit'] ) ? (int) $body['limit'] : 20,
						),
					),
				);

			case 'DataForSEO_dataforseo_labs_google_related_keywords':
				return array(
					'tasks' => array(
						array(
							'keyword'        => (string) ( $body['keyword'] ?? '' ),
							'location_code'  => Neo_Pulse_App_Dataforseo_Client::location_code_from_request_body( $body ),
							'language_code'  => Neo_Pulse_App_Dataforseo_Client::ensure_language_code( $body['language_code'] ?? 'en' ),
							'depth'          => isset( $body['limit'] ) ? min( (int) $body['limit'], 4 ) : 1,
						),
					),
				);

			case 'DataForSEO_kw_data_google_ads_keywords_for_keywords':
				if ( empty( $body['keywords'] ) || ! is_array( $body['keywords'] ) ) {
					return new WP_Error( 'neo-pulse_dfs_validate', 'keywords array is required', array( 'status' => 400 ) );
				}
				$kw = array();
				foreach ( array_slice( $body['keywords'], 0, 20 ) as $k ) {
					$t = trim( (string) $k );
					if ( $t !== '' ) {
						$kw[] = $t;
					}
				}
				if ( $kw === array() ) {
					return new WP_Error( 'neo-pulse_dfs_validate', 'keywords must contain at least one non-empty string', array( 'status' => 400 ) );
				}
				return array(
					'tasks' => array(
						array(
							'keywords'       => $kw,
							'location_code'  => Neo_Pulse_App_Dataforseo_Client::location_code_from_request_body( $body ),
							'language_code'  => Neo_Pulse_App_Dataforseo_Client::ensure_language_code( $body['language_code'] ?? 'en' ),
						),
					),
				);

			case 'DataForSEO_kw_data_dfs_trends_explore':
				if ( empty( $body['keywords'] ) || ! is_array( $body['keywords'] ) ) {
					return new WP_Error( 'neo-pulse_dfs_validate', 'keywords array is required (max 5)', array( 'status' => 400 ) );
				}
				$kw = array();
				foreach ( array_slice( $body['keywords'], 0, 5 ) as $k ) {
					$t = trim( (string) $k );
					if ( $t !== '' ) {
						$kw[] = $t;
					}
				}
				if ( $kw === array() ) {
					return new WP_Error( 'neo-pulse_dfs_validate', 'keywords must contain at least one non-empty string', array( 'status' => 400 ) );
				}
				$task = array(
					'keywords' => $kw,
					'type'     => in_array( $body['type'] ?? 'web', array( 'web', 'news', 'ecommerce' ), true ) ? $body['type'] : 'web',
				);
				if ( isset( $body['location_code'] ) && is_numeric( $body['location_code'] ) ) {
					$task['location_code'] = (int) $body['location_code'];
				} else {
					$task['location_code'] = Neo_Pulse_App_Dataforseo_Client::location_code_from_request_body( $body );
				}
				foreach ( array( 'date_from', 'date_to', 'time_range' ) as $f ) {
					if ( ! empty( $body[ $f ] ) && is_string( $body[ $f ] ) ) {
						$task[ $f ] = $body[ $f ];
					}
				}
				return array( 'tasks' => array( $task ) );

			case 'DataForSEO_serp_organic_live_advanced':
				$raw_kw = trim( (string) ( $body['keyword'] ?? '' ) );
				$raw_kw = preg_replace( '/\s+/u', ' ', $raw_kw );
				if ( $raw_kw === '' ) {
					return new WP_Error( 'neo-pulse_dfs_validate', 'keyword is required', array( 'status' => 400 ) );
				}
				if ( mb_strlen( $raw_kw ) > 200 ) {
					$raw_kw = trim( mb_substr( $raw_kw, 0, 200 ) );
				}
				$words = preg_split( '/\s+/u', $raw_kw, -1, PREG_SPLIT_NO_EMPTY );
				if ( is_array( $words ) && count( $words ) > 10 ) {
					$raw_kw = implode( ' ', array_slice( $words, 0, 10 ) );
				}
				$task = array(
					'keyword'       => $raw_kw,
					'location_code' => Neo_Pulse_App_Dataforseo_Client::location_code_from_request_body( $body ),
					'language_code' => Neo_Pulse_App_Dataforseo_Client::ensure_language_code( $body['language_code'] ?? 'en' ),
					'depth'         => isset( $body['depth'] ) ? (int) $body['depth'] : 10,
					'device'        => 'desktop',
					'os'            => 'windows',
				);
				if ( isset( $body['people_also_ask_click_depth'] ) ) {
					$task['people_also_ask_click_depth'] = (int) $body['people_also_ask_click_depth'];
				}
				return array( 'tasks' => array( $task ) );

			case 'DataForSEO_serp_google_maps_live_advanced':
				if ( empty( $body['keyword'] ) || empty( $body['location_coordinate'] ) ) {
					return new WP_Error( 'neo-pulse_dfs_validate', 'keyword and location_coordinate are required', array( 'status' => 400 ) );
				}
				$task = array(
					'keyword'               => trim( (string) $body['keyword'] ),
					'location_coordinate'   => trim( (string) $body['location_coordinate'] ),
					'language_code'         => Neo_Pulse_App_Dataforseo_Client::ensure_language_code( $body['language_code'] ?? 'en' ),
					'depth'                 => isset( $body['depth'] ) && (int) $body['depth'] > 0 ? (int) $body['depth'] : 20,
				);
				if ( isset( $body['search_places'] ) && $body['search_places'] === false ) {
					$task['search_places'] = false;
				}
				return array( 'tasks' => array( $task ) );

			case 'DataForSEO_serp_google_ai_overview':
				if ( empty( $body['keyword'] ) ) {
					return new WP_Error( 'neo-pulse_dfs_validate', 'keyword is required', array( 'status' => 400 ) );
				}
				return array(
					'tasks' => array(
						array(
							'keyword'       => (string) $body['keyword'],
							'location_code' => Neo_Pulse_App_Dataforseo_Client::location_code_from_request_body( $body ),
							'language_code' => Neo_Pulse_App_Dataforseo_Client::ensure_language_code( $body['language_code'] ?? 'en' ),
							'device'        => 'desktop',
							'os'            => 'windows',
						),
					),
				);

			case 'DataForSEO_on_page_lighthouse':
				if ( empty( $body['url'] ) ) {
					return new WP_Error( 'neo-pulse_dfs_validate', 'url is required', array( 'status' => 400 ) );
				}
				$core = array(
					'first-contentful-paint',
					'largest-contentful-paint',
					'total-blocking-time',
					'cumulative-layout-shift',
					'speed-index',
				);
				return array(
					'tasks' => array(
						array(
							'url'        => (string) $body['url'],
							'for_mobile' => ! empty( $body['for_mobile'] ),
							'categories' => ! empty( $body['categories'] ) && is_array( $body['categories'] )
								? $body['categories']
								: array( 'performance', 'accessibility', 'best_practices', 'seo' ),
							'audits'     => ! empty( $body['audits'] ) && is_array( $body['audits'] ) ? $body['audits'] : $core,
						),
					),
				);

			case 'DataForSEO_on_page_content_parsing':
				if ( empty( $body['url'] ) ) {
					return new WP_Error( 'neo-pulse_dfs_validate', 'url is required', array( 'status' => 400 ) );
				}
				return array(
					'tasks' => array(
						array(
							'url'               => (string) $body['url'],
							'enable_javascript' => array_key_exists( 'enable_javascript', $body ) ? (bool) $body['enable_javascript'] : false,
							'accept_language'   => ! empty( $body['accept_language'] ) ? (string) $body['accept_language'] : 'en',
						),
					),
				);

			case 'DataForSEO_dataforseo_labs_google_page_intersection':
				if ( empty( $body['pages'] ) || ! is_array( $body['pages'] ) ) {
					return new WP_Error( 'neo-pulse_dfs_validate', 'pages array is required', array( 'status' => 400 ) );
				}
				$pages = array_slice( $body['pages'], 0, 20 );
				$mode  = ( $body['intersection_mode'] ?? 'intersect' ) === 'union' ? 'union' : 'intersect';
				return array(
					'tasks' => array(
						array(
							'pages'              => $pages,
							'location_code'      => Neo_Pulse_App_Dataforseo_Client::location_code_from_request_body( $body ),
							'language_code'      => Neo_Pulse_App_Dataforseo_Client::ensure_language_code( $body['language_code'] ?? 'en' ),
							'intersection_mode'  => $mode,
						),
					),
				);

			case 'DataForSEO_dataforseo_labs_google_competitors_domain':
				$target = strtolower( trim( (string) ( $body['target'] ?? '' ) ) );
				$target = preg_replace( '#^https?://#', '', $target );
				$target = preg_replace( '#^www\.#', '', $target );
				$target = rtrim( $target, '/' );
				if ( $target === '' ) {
					return new WP_Error( 'neo-pulse_dfs_validate', 'target is required', array( 'status' => 400 ) );
				}
				$task = array(
					'target'        => $target,
					'language_code' => Neo_Pulse_App_Dataforseo_Client::ensure_language_code( $body['language_code'] ?? 'en' ),
				);
				if ( isset( $body['location_code'] ) && is_numeric( $body['location_code'] ) ) {
					$task['location_code'] = (int) $body['location_code'];
				} else {
					$task['location_code'] = Neo_Pulse_App_Dataforseo_Client::location_code_from_request_body( $body );
				}
				foreach ( array( 'limit', 'offset' ) as $n ) {
					if ( isset( $body[ $n ] ) && is_numeric( $body[ $n ] ) ) {
						$task[ $n ] = (int) $body[ $n ];
					}
				}
				foreach ( array( 'filters', 'order_by', 'item_types' ) as $n ) {
					if ( isset( $body[ $n ] ) ) {
						$task[ $n ] = $body[ $n ];
					}
				}
				foreach ( array( 'exclude_top_domains', 'include_clickstream_data' ) as $n ) {
					if ( isset( $body[ $n ] ) ) {
						$task[ $n ] = (bool) $body[ $n ];
					}
				}
				return array( 'tasks' => array( $task ) );

			case 'DataForSEO_business_data_business_listings_search':
				if ( empty( $body['location_coordinate'] ) ) {
					return new WP_Error( 'neo-pulse_dfs_validate', 'location_coordinate is required', array( 'status' => 400 ) );
				}
				$task = array(
					'location_coordinate' => trim( (string) $body['location_coordinate'] ),
					'limit'               => isset( $body['limit'] ) && (int) $body['limit'] > 0
						? min( (int) $body['limit'], 1000 )
						: 20,
				);
				foreach ( array( 'title', 'description' ) as $f ) {
					if ( ! empty( $body[ $f ] ) ) {
						$task[ $f ] = trim( (string) $body[ $f ] );
					}
				}
				if ( ! empty( $body['categories'] ) && is_array( $body['categories'] ) ) {
					$task['categories'] = array_values( array_filter( array_map( 'strval', $body['categories'] ) ) );
				}
				foreach ( array( 'offset', 'filters', 'order_by' ) as $f ) {
					if ( isset( $body[ $f ] ) ) {
						$task[ $f ] = $body[ $f ];
					}
				}
				if ( isset( $body['is_claimed'] ) ) {
					$task['is_claimed'] = (bool) $body['is_claimed'];
				}
				return array( 'tasks' => array( $task ) );

			case 'DataForSEO_business_data_google_my_business_info_live':
				if ( empty( $body['keyword'] ) ) {
					return new WP_Error( 'neo-pulse_dfs_validate', 'keyword is required', array( 'status' => 400 ) );
				}
				$task = array( 'keyword' => trim( (string) $body['keyword'] ) );
				foreach ( array( 'location_name', 'location_coordinate', 'language_code', 'language_name', 'tag' ) as $f ) {
					if ( ! empty( $body[ $f ] ) && is_string( $body[ $f ] ) ) {
						$task[ $f ] = trim( $body[ $f ] );
					}
				}
				if ( isset( $body['location_code'] ) && is_numeric( $body['location_code'] ) ) {
					$task['location_code'] = (int) $body['location_code'];
				}
				return array( 'tasks' => array( $task ) );
		}

		return new WP_Error( 'neo-pulse_dfs_tool', 'Unhandled DataForSEO tool.', array( 'status' => 500 ) );
	}

	private static function timeout_for_tool( string $tool ): int {
		if ( $tool === 'DataForSEO_llm_responses_live' ) {
			return 130000;
		}
		if ( $tool === 'DataForSEO_kw_data_dfs_trends_explore' || $tool === 'DataForSEO_on_page_lighthouse' ) {
			return 120000;
		}
		if ( $tool === 'DataForSEO_business_data_google_my_business_info_live' ) {
			return 180000;
		}
		if ( strpos( $tool, 'serp_' ) === 0 ) {
			return 120000;
		}
		return 60000;
	}

	private static function is_transient_dataforseo_error( string $message ): bool {
		return Neo_Pulse_App_Http_Transient_Retry::is_transient_transport_error( $message )
			|| str_contains( strtolower( $message ), 'internal se server error' );
	}

	/**
	 * @param array<int,mixed> $tasks
	 * @return array<string,mixed>|WP_Error
	 */
	private static function retry_transient_post( string $endpoint, array $tasks, int $timeout ) {
		$max_attempts = 4;
		$last_error   = null;
		for ( $attempt = 1; $attempt <= $max_attempts; $attempt++ ) {
			if ( $attempt > 1 ) {
				sleep( min( 8, 2 * ( $attempt - 1 ) ) );
			}

			$result = Neo_Pulse_App_Dataforseo_Client::post(
				$endpoint,
				$tasks,
				array( 'timeout' => $timeout )
			);
			if ( ! is_wp_error( $result ) ) {
				return $result;
			}

			$last_error = $result;
			if ( ! self::is_transient_dataforseo_error( $result->get_error_message() ) || $attempt >= $max_attempts ) {
				return $result;
			}
		}

		return $last_error ?? new WP_Error( 'neo-pulse_dataforseo_retry', 'DataForSEO request failed' );
	}

	/**
	 * @param array<string,mixed> $body
	 * @return array<string,mixed>|WP_Error
	 */
	public static function run_llm_responses_live( array $body ) {
		return self::dispatch_llm_responses_live( $body );
	}

	/**
	 * @param array<string,mixed> $body
	 * @return array<string,mixed>|WP_Error
	 */
	private static function dispatch_llm_responses_live( array $body ) {
		$platform = isset( $body['platform'] ) ? trim( (string) $body['platform'] ) : '';
		if ( $platform === '' || ! isset( self::LLM_RESPONSES_PLATFORMS[ $platform ] ) ) {
			return array(
				'skipped' => true,
				'reason'  => 'dfs_invalid_platform',
				'tasks'   => array(),
			);
		}
		if ( empty( $body['model_name'] ) || empty( $body['user_prompt'] ) ) {
			return array(
				'skipped' => true,
				'reason'  => 'dfs_missing_params',
				'tasks'   => array(),
			);
		}

		$task = array(
			'model_name'  => trim( (string) $body['model_name'] ),
			'user_prompt' => trim( (string) $body['user_prompt'] ),
		);
		foreach ( array( 'system_message', 'web_search_country_iso_code', 'web_search_city' ) as $f ) {
			if ( ! empty( $body[ $f ] ) && is_string( $body[ $f ] ) ) {
				$task[ $f ] = trim( $body[ $f ] );
			}
		}
		if ( isset( $body['web_search'] ) ) {
			$task['web_search'] = (bool) $body['web_search'];
		}
		if ( isset( $body['force_web_search'] ) ) {
			$task['force_web_search'] = (bool) $body['force_web_search'];
		}
		if ( isset( $body['message_chain'] ) && is_array( $body['message_chain'] ) ) {
			$chain = array();
			foreach ( $body['message_chain'] as $entry ) {
				if ( ! is_array( $entry ) ) {
					continue;
				}
				$role    = isset( $entry['role'] ) ? trim( (string) $entry['role'] ) : '';
				$message = isset( $entry['message'] ) ? trim( (string) $entry['message'] ) : '';
				if ( $role !== 'user' || $message === '' ) {
					continue;
				}
				$chain[] = array(
					'role'    => 'user',
					'message' => $message,
				);
				if ( count( $chain ) >= 10 ) {
					break;
				}
			}
			if ( ! empty( $chain ) ) {
				$task['message_chain'] = $chain;
			}
		}

		$endpoint = self::LLM_RESPONSES_PLATFORMS[ $platform ];
		$result   = Neo_Pulse_App_Dataforseo_Client::post(
			$endpoint,
			array( $task ),
			array( 'timeout' => 130000 )
		);
		if ( is_wp_error( $result ) ) {
			return array(
				'skipped' => true,
				'reason'  => 'dfs_request_error',
				'tasks'   => array(),
				'error'   => $result->get_error_message(),
			);
		}

		$check = Neo_Pulse_App_Dataforseo_Client::assert_task_ok( $result, false );
		if ( is_wp_error( $check ) ) {
			return array(
				'skipped' => true,
				'reason'  => 'dfs_task_error',
				'tasks'   => array(),
				'error'   => $check->get_error_message(),
			);
		}

		return $result;
	}

}
