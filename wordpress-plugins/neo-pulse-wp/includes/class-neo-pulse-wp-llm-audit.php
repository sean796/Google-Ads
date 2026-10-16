<?php
/**
 * DataForSEO LLM Responses audit for SEO research briefs.
 *
 * @package Neo_Pulse_Wp
 */

defined( 'ABSPATH' ) || exit;

class Neo_Pulse_Wp_Llm_Audit {

	const SYSTEM_MESSAGE = 'You are a local resident and AISEO researcher in this market. Use web search. Return bullet facts only someone who lives here would know. Forbidden: census or population stats, km/mile distances, blog outlines, SEO advice, any business or brand names. Each bullet: one specific resident-level detail plus https source (verification only, not for the post).';

	/** Seconds per DataForSEO LLM call (platforms run sequentially). */
	const PER_CALL_TIMEOUT = 45;

	/** @var array<int,array<string,mixed>> */
	const PLATFORM_CONFIG = array(
		array(
			'platform'                       => 'chat_gpt',
			'label'                          => 'ChatGPT',
			'path'                           => 'ai_optimization/chat_gpt/llm_responses/live',
			'model_name'                     => 'o4-mini',
			'force_web_search'               => false,
			'web_search_country_iso_code'    => true,
			'web_search_city'                => true,
		),
		array(
			'platform'                       => 'gemini',
			'label'                          => 'Gemini',
			'path'                           => 'ai_optimization/gemini/llm_responses/live',
			'model_name'                     => 'gemini-2.5-flash',
			'force_web_search'               => false,
			'web_search_country_iso_code'    => false,
			'web_search_city'                => false,
		),
		array(
			'platform'                       => 'perplexity',
			'label'                          => 'Perplexity',
			'path'                           => 'ai_optimization/perplexity/llm_responses/live',
			'model_name'                     => 'sonar',
			'force_web_search'               => false,
			'web_search_country_iso_code'    => false,
			'web_search_city'                => false,
		),
	);

	/**
	 * @param string $keyword
	 * @return string
	 */
	public static function resolve_location_from_keyword( $keyword ) {
		$kw = trim( (string) $keyword );
		if ( preg_match( '/\bnear\s+(.+)$/i', $kw, $m ) ) {
			return trim( $m[1] );
		}
		return '';
	}

	/**
	 * @param array<string,string> $input
	 * @return array<string,mixed>
	 */
	public static function fetch_parallel( array $input ) {
		$keyword  = trim( (string) ( $input['keyword'] ?? '' ) );
		$site_url = trim( (string) ( $input['siteUrl'] ?? '' ) );
		$location = trim( (string) ( $input['location'] ?? '' ) );
		if ( $location === '' ) {
			$location = self::resolve_location_from_keyword( $keyword );
		}

		$platforms = array();
		foreach ( self::PLATFORM_CONFIG as $cfg ) {
			$platforms[] = self::fetch_one( $cfg, $keyword, $site_url, $location );
		}

		return array(
			'siteUrl'   => $site_url,
			'location'  => $location,
			'platforms' => $platforms,
		);
	}

	/**
	 * @param array<string,mixed> $cfg
	 * @return array<string,mixed>
	 */
	private static function fetch_one( array $cfg, $keyword, $site_url, $location ) {
		$platform   = (string) $cfg['platform'];
		$label      = (string) $cfg['label'];
		$model_name = (string) $cfg['model_name'];

		$task = self::build_task( $cfg, $keyword, $location );
		$raw  = Neo_Pulse_Wp_Dataforseo::post_live( (string) $cfg['path'], array( $task ), self::PER_CALL_TIMEOUT );

		if ( is_wp_error( $raw ) ) {
			return array(
				'platform'   => $platform,
				'label'      => $label,
				'model_name' => $model_name,
				'status'     => 'error',
				'error'      => $raw->get_error_message(),
			);
		}

		return self::extract_platform_result( $platform, $label, $model_name, $raw );
	}

	/**
	 * @param array<string,mixed> $cfg
	 * @return array<string,mixed>
	 */
	private static function build_task( array $cfg, $keyword, $location ) {
		$location = trim( (string) $location );
		$subject  = $location !== ''
			? sprintf( "'%s' in %s", $keyword, $location )
			: sprintf( "'%s'", $keyword );
		$task = array(
			'model_name'        => (string) $cfg['model_name'],
			'user_prompt'       => self::clip(
				sprintf(
					'For %s: %s. List 12 hyper-local AREA facts only (no businesses): how locals refer to places, Main Street rhythm, typical home/entry styles, seasonal habits and local climate, events, nearby towns locals name. No wiki census. Bullets + https (verify only).',
					(string) $cfg['label'],
					$subject
				),
				500
			),
			'system_message'    => self::clip( self::SYSTEM_MESSAGE, 500 ),
			'web_search'        => true,
			'max_output_tokens' => 2048,
		);
		if ( ! empty( $cfg['force_web_search'] ) ) {
			$task['force_web_search'] = true;
		}
		$iso  = self::web_search_country_iso( $location );
		$city = self::web_search_city( $location );
		if ( ! empty( $cfg['web_search_country_iso_code'] ) && $iso !== '' ) {
			$task['web_search_country_iso_code'] = $iso;
		}
		if ( ! empty( $cfg['web_search_city'] ) && $city !== '' ) {
			$task['web_search_city'] = $city;
		}
		return $task;
	}

	/**
	 * @param mixed $raw
	 * @return array<string,mixed>
	 */
	private static function extract_platform_result( $platform, $label, $model_name, $raw ) {
		$base = array(
			'platform'   => $platform,
			'label'      => $label,
			'model_name' => $model_name,
			'status'     => 'error',
		);

		if ( ! is_array( $raw ) || empty( $raw['tasks'][0] ) || ! is_array( $raw['tasks'][0] ) ) {
			return array_merge( $base, array( 'error' => 'Empty response' ) );
		}

		$task = $raw['tasks'][0];
		if ( empty( $task['status_code'] ) || (int) $task['status_code'] !== 20000 ) {
			$msg = isset( $task['status_message'] ) ? (string) $task['status_message'] : 'Task failed';
			return array_merge( $base, array( 'error' => $msg ) );
		}

		$result0 = isset( $task['result'][0] ) && is_array( $task['result'][0] ) ? $task['result'][0] : null;
		if ( ! $result0 ) {
			return array_merge( $base, array( 'error' => 'No result' ) );
		}

		$text_parts  = array();
		$annotations = array();
		$items       = isset( $result0['items'] ) && is_array( $result0['items'] ) ? $result0['items'] : array();

		foreach ( $items as $item ) {
			if ( ! is_array( $item ) ) {
				continue;
			}
			if ( ( $item['type'] ?? '' ) === 'message' && ! empty( $item['sections'] ) && is_array( $item['sections'] ) ) {
				foreach ( $item['sections'] as $sec ) {
					if ( is_array( $sec ) && ( $sec['type'] ?? '' ) === 'text' && ! empty( $sec['text'] ) ) {
						$text_parts[] = trim( (string) $sec['text'] );
					}
				}
			}
			if ( ! empty( $item['annotations'] ) && is_array( $item['annotations'] ) ) {
				foreach ( $item['annotations'] as $ann ) {
					if ( is_array( $ann ) && ! empty( $ann['url'] ) ) {
						$annotations[] = array(
							'title' => isset( $ann['title'] ) ? (string) $ann['title'] : null,
							'url'   => (string) $ann['url'],
						);
					}
				}
			}
		}

		$response_text = trim( implode( "\n\n", $text_parts ) );
		$live_links    = self::dedupe_urls(
			array_merge(
				array_map(
					function ( $a ) {
						return $a['url'];
					},
					$annotations
				),
				self::urls_from_text( $response_text )
			)
		);

		$web_search_used = ! empty( $result0['web_search'] ) || ! empty( $annotations ) || ! empty( $live_links );

		$out = array(
			'platform'       => $platform,
			'label'          => $label,
			'model_name'     => ! empty( $result0['model_name'] ) ? (string) $result0['model_name'] : $model_name,
			'status'         => $response_text !== '' ? 'ok' : 'error',
			'webSearchUsed'  => $web_search_used,
		);
		if ( $response_text !== '' ) {
			$out['responseText'] = $response_text;
		}
		if ( ! empty( $annotations ) ) {
			$out['annotations'] = $annotations;
		}
		if ( ! empty( $live_links ) ) {
			$out['liveLinks'] = $live_links;
		}
		if ( isset( $result0['input_tokens'] ) ) {
			$out['input_tokens'] = (int) $result0['input_tokens'];
		}
		if ( isset( $result0['output_tokens'] ) ) {
			$out['output_tokens'] = (int) $result0['output_tokens'];
		}
		if ( isset( $task['cost'] ) ) {
			$out['cost'] = (float) $task['cost'];
		}
		if ( $response_text === '' ) {
			$out['error'] = 'No message text in response';
		}
		return $out;
	}

	/**
	 * @param string $location
	 * @return string
	 */
	private static function web_search_country_iso( $location ) {
		$upper = strtoupper( trim( (string) $location ) );
		if ( preg_match( '/\b(CANADA|,\s*MB\b|,\s*ON\b|,\s*BC\b|,\s*AB\b|,\s*SK\b|,\s*QC\b)/', $upper ) ) {
			return 'CA';
		}
		if ( preg_match( '/\b(USA|,\s*US\b)/', $upper ) ) {
			return 'US';
		}
		return '';
	}

	/**
	 * @param string $location
	 * @return string
	 */
	private static function web_search_city( $location ) {
		$parts = explode( ',', trim( (string) $location ) );
		return trim( (string) ( $parts[0] ?? '' ) );
	}

	/**
	 * @param string $text
	 * @return string[]
	 */
	private static function urls_from_text( $text ) {
		if ( ! is_string( $text ) || $text === '' ) {
			return array();
		}
		if ( ! preg_match_all( '#https://[^\s)\]"\'<>]+#i', $text, $m ) ) {
			return array();
		}
		$out = array();
		foreach ( $m[0] as $url ) {
			$out[] = rtrim( $url, '.,;:!?)' );
		}
		return $out;
	}

	/**
	 * @param string[] $urls
	 * @return string[]
	 */
	private static function dedupe_urls( array $urls ) {
		$seen = array();
		$out  = array();
		foreach ( $urls as $url ) {
			$k = trim( (string) $url );
			if ( $k === '' || isset( $seen[ $k ] ) ) {
				continue;
			}
			$seen[ $k ] = true;
			$out[]      = $k;
		}
		return $out;
	}

	/**
	 * @param string $s
	 * @param int    $max
	 * @return string
	 */
	private static function clip( $s, $max ) {
		$t = trim( (string) $s );
		if ( strlen( $t ) <= $max ) {
			return $t;
		}
		return substr( $t, 0, $max - 1 ) . '…';
	}
}
