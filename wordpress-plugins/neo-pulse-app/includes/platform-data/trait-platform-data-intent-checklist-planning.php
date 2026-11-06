<?php
/**
 * Entity scope inference, classifier planning, and workspace context plans.
 *
 * @package Neo_Pulse_App
 */

defined( 'ABSPATH' ) || exit;

trait Neo_Pulse_App_Platform_Data_Intent_Checklist_Trait_Planning {

	/**
	 * Infer how many entities to fetch from phrasing like "last post" vs "last 5 posts".
	 *
	 * @return array{mode:string,limit:int,hint:string,sort:string}|null
	 */
	public static function infer_entity_scope_from_message( string $message ): ?array {
		$trimmed = trim( $message );
		if ( $trimmed === '' ) {
			return null;
		}

		if ( preg_match( '/\b(?:last|latest|recent|next)\s+(\d{1,2})\s+\w*\s*(?:blog\s*)?(?:post|posts|page|pages)\b/i', $trimmed, $m ) ) {
			return array(
				'mode'  => 'library',
				'limit' => max( 1, min( 20, (int) $m[1] ) ),
				'hint'  => 'Explicit count with qualifier',
				'sort'  => 'date_desc',
			);
		}

		if ( preg_match( '/\b(\d{1,2})\s+\w*\s*(?:blog\s*)?(?:post|posts|page|pages)\b/i', $trimmed, $m ) ) {
			$count = max( 1, min( 20, (int) $m[1] ) );
			if ( $count === 1 ) {
				return array(
					'mode'  => 'single',
					'limit' => 1,
					'hint'  => 'Single post or page from explicit count',
					'sort'  => 'date_desc',
				);
			}
			return array(
				'mode'  => 'library',
				'limit' => $count,
				'hint'  => 'Explicit multi-post count',
				'sort'  => 'date_desc',
			);
		}

		if ( preg_match( '/\b(?:the\s+)?(?:last|latest|newest|most\s+recent)\s+(?:blog(?:\s+post)?|post|page)\b/i', $trimmed ) ) {
			return array(
				'mode'  => 'single',
				'limit' => 1,
				'hint'  => 'Most recent single post or page',
				'sort'  => 'date_desc',
			);
		}

		if ( preg_match( '/\blast\s+blog\b/i', $trimmed ) && ! preg_match( '/\b(?:posts|pages)\b/i', $trimmed ) ) {
			return array(
				'mode'  => 'single',
				'limit' => 1,
				'hint'  => 'Most recent blog',
				'sort'  => 'date_desc',
			);
		}

		if ( preg_match( '/\b(?:the\s+)?(?:first|oldest)\s+(?:blog(?:\s+post)?|post|page)\b/i', $trimmed ) ) {
			return array(
				'mode'  => 'single',
				'limit' => 1,
				'hint'  => 'Oldest single post or page',
				'sort'  => 'date_asc',
			);
		}

		if ( preg_match( '/\b(?:this|that)\s+(?:blog\s+)?(?:post|page)\b/i', $trimmed ) && ! preg_match( '/\b(?:posts|pages)\b/i', $trimmed ) ) {
			return array(
				'mode'  => 'single',
				'limit' => 1,
				'hint'  => 'Single referenced post or page',
				'sort'  => 'date_desc',
			);
		}

		if ( preg_match( '/\b(?:recent|latest|newest|my|our|some|several|multiple|all|few)\s+(?:blog\s*)?(?:posts|pages)\b/i', $trimmed ) ) {
			$limit = 3;
			if ( preg_match( '/\b(?:all|every)\b/i', $trimmed ) ) {
				$limit = 10;
			} elseif ( preg_match( '/\b(?:several|multiple|few)\b/i', $trimmed ) ) {
				$limit = 5;
			}
			return array(
				'mode'  => 'library',
				'limit' => $limit,
				'hint'  => 'Plural posts or pages without explicit count',
				'sort'  => 'date_desc',
			);
		}

		return null;
	}

	/**
	 * @param array<string,mixed> $plan
	 * @return array<string,mixed>
	 */
	private static function constrain_plan_entity_scope( array $plan, string $message ): array {
		$inferred = self::infer_entity_scope_from_message( $message );
		if ( $inferred === null ) {
			return $plan;
		}

		$entity_type = sanitize_key( (string) ( $plan['entityType'] ?? 'post' ) );
		if ( ! in_array( $entity_type, array( 'post', 'page' ), true ) ) {
			return $plan;
		}

		$scope = isset( $plan['entityScope'] ) && is_array( $plan['entityScope'] ) ? $plan['entityScope'] : array();
		$mode  = sanitize_key( (string) ( $scope['mode'] ?? 'library' ) );
		$limit = max( 1, min( 20, (int) ( $scope['limit'] ?? 5 ) ) );

		if ( $inferred['mode'] === 'single' ) {
			$mode  = 'single';
			$limit = 1;
		} elseif ( $mode === 'library' && $limit > $inferred['limit'] ) {
			$limit = $inferred['limit'];
		}

		$plan['entityScope'] = array(
			'mode'      => $mode,
			'url'       => (string) ( $scope['url'] ?? '' ),
			'limit'     => $limit,
			'post_type' => sanitize_key( (string) ( $scope['post_type'] ?? 'post' ) ),
		);

		if ( $mode === 'single' && is_array( $plan['sliceTeam'] ?? null ) ) {
			foreach ( $plan['sliceTeam'] as &$spec ) {
				if ( ! is_array( $spec ) || empty( $spec['slice'] ) ) {
					continue;
				}
				$slice = sanitize_key( (string) $spec['slice'] );
				if ( in_array( $slice, self::ENTITY_SLICES, true ) ) {
					$spec['systemPrompt'] = $slice === 'inventory'
						? self::inventory_slice_system_prompt( 'single' )
						: self::slice_system_prompt( $slice, 'single' );
				}
			}
			unset( $spec );
			$plan['leadAgent'] = self::default_lead_agent( 'single' );
		}

		$plan['dataNeeds'] = self::sync_data_needs_scope(
			is_array( $plan['dataNeeds'] ?? null ) ? $plan['dataNeeds'] : array(),
			$plan['entityScope'],
			$inferred['sort']
		);

		return $plan;
	}

	/**
	 * @param array<int,array<string,mixed>> $data_needs
	 * @param array<string,mixed>            $entity_scope
	 * @return array<int,array<string,mixed>>
	 */
	private static function sync_data_needs_scope( array $data_needs, array $entity_scope, string $sort ): array {
		$limit          = max( 1, min( 20, (int) ( $entity_scope['limit'] ?? 1 ) ) );
		$out            = array();
		$has_inventory  = false;

		foreach ( $data_needs as $need ) {
			if ( ! is_array( $need ) || empty( $need['tool'] ) ) {
				$out[] = $need;
				continue;
			}
			$tool = sanitize_key( (string) $need['tool'] );
			if ( str_starts_with( $tool, 'inventory_' ) ) {
				$params = isset( $need['params'] ) && is_array( $need['params'] ) ? $need['params'] : array();
				$params['limit'] = $limit;
				$params['sort']  = $sort;
				$out[] = array(
					'tool'   => $tool,
					'params' => $params,
				);
				$has_inventory = true;
				continue;
			}
			$out[] = $need;
		}

		if ( ! $has_inventory ) {
			$out[] = array(
				'tool'   => 'inventory_recent',
				'params' => array(
					'post_type'      => sanitize_key( (string) ( $entity_scope['post_type'] ?? 'post' ) ),
					'limit'          => $limit,
					'sort'           => $sort,
					'includeContent' => true,
					'url'            => (string) ( $entity_scope['url'] ?? '' ),
				),
			);
		}

		return $out;
	}

	/**
	 * @param array<int,array<string,mixed>> $history
	 * @param array<string,mixed>            $body
	 * @param array<string,mixed>|null       $module_research
	 * @return array<string,mixed>
	 */
	public static function plan( string $message, array $history, array $body, ?array $module_research = null ): array {
		if ( self::is_ui_help_message( $message, $body ) ) {
			return self::plan_workspace_context( $message, $body, $module_research );
		}

		$fast = self::fast_path_plan( $message, $history );
		if ( $fast !== null ) {
			return self::constrain_plan_entity_scope( $fast, $message );
		}

		$tool_lines = Neo_Pulse_App_Platform_Data_Orchestrator::tool_catalog_lines( $body );
		$history_snip = self::history_snippet( $history );
		$workspace_snip = self::workspace_snippet( $body );

		$system = 'Return JSON only matching this shape: {"intentSummary":"string","entityType":"post|page|site|workspace","entityScope":{"mode":"single|library","url":"","limit":10,"post_type":"post"},"dataNeeds":[{"tool":"inventory_recent|gsc_top_queries|gsc_performance_summary|ga_organic_summary","params":{}}],"sliceTeam":[{"id":"string","slice":"context|url|meta|keyword|faq|seo_research|body|featured_image|gsc_summary|gsc_queries|gsc_pages|ga_organic","role":"string","focus":"string optional for context slice","systemPrompt":"string"}],"leadAgent":{"systemPrompt":"string","outputSchema":{}},"reason":"string"}. Compose 1-' . self::MAX_SLICE_AGENTS . ' slice specialists to run in parallel. Use slice context for workspace/tab capability agents grounded in module catalog (set focus per agent). Use entity/analytics slices only for live site data. Each slice field must be a slice key, never a data tool id. Each role must reference workspace location and the user question. When the user asks for both post review and GSC/analytics, include entity slices AND analytics slices in one sliceTeam. Lead agent synthesizes all slice reports into the final answer. Entity scope rules (token budget): use mode single with limit 1 for one post or page (last post, latest post, most recent post, this post, that post, named URL). Use library only when the user clearly asks about multiple posts or gives an explicit count. Do not set library limit above 5 unless the user names a higher number. "Last post" always means single limit 1, not a library.';
		$user   = $workspace_snip
			. "\nAvailable data tools:\n" . implode( "\n", $tool_lines )
			. "\nRecent history:\n" . $history_snip
			. "\nUser message: " . $message;

		try {
			$parsed = Neo_Pulse_App_Chat_Openrouter::json_completion(
				array(
					array( 'role' => 'system', 'content' => $system ),
					array( 'role' => 'user', 'content' => $user ),
				),
				array(
					'model'       => self::SLICE_MODEL,
					'temperature' => 0.15,
					'maxTokens'   => 2048,
				)
			);
		} catch ( Exception $e ) {
			return self::fallback_plan( $message );
		}

		return self::constrain_plan_entity_scope( self::normalize_plan( $parsed, $message, $body, $module_research ), $message );
	}

	/**
	 * @param array<string,mixed> $body
	 */
	private static function workspace_location( array $body ): string {
		$pulse = isset( $body['pulse_context'] ) && is_array( $body['pulse_context'] ) ? $body['pulse_context'] : array();
		return ! empty( $pulse['locationSummary'] )
			? sanitize_text_field( (string) $pulse['locationSummary'] )
			: 'Current workspace tab';
	}

	/**
	 * @param array<string,mixed> $body
	 */
	private static function workspace_snippet( array $body ): string {
		$pulse = isset( $body['pulse_context'] ) && is_array( $body['pulse_context'] ) ? $body['pulse_context'] : array();
		$lines = array();
		if ( ! empty( $pulse['locationSummary'] ) ) {
			$lines[] = 'Workspace: ' . sanitize_text_field( (string) $pulse['locationSummary'] );
		}
		if ( ! empty( $pulse['siteName'] ) ) {
			$lines[] = 'Active site: ' . sanitize_text_field( (string) $pulse['siteName'] );
		}
		if ( ! empty( $pulse['expandedPageTitle'] ) ) {
			$lines[] = 'Expanded page: ' . sanitize_text_field( (string) $pulse['expandedPageTitle'] );
		}
		return count( $lines ) > 0 ? implode( "\n", $lines ) . "\n" : '';
	}

	public static function normalize_slice( string $slice, string $entity_type = 'post' ): string {
		$slice = sanitize_key( $slice );
		if ( $slice === 'context' ) {
			return 'context';
		}
		if ( $entity_type !== 'workspace' && isset( self::SLICE_ALIASES[ $slice ] ) ) {
			$slice = self::SLICE_ALIASES[ $slice ];
		}
		$allowed = array_merge( self::CONTEXT_SLICES, self::ENTITY_SLICES, self::ANALYTICS_SLICES );
		return in_array( $slice, $allowed, true ) ? $slice : '';
	}

	/**
	 * @param array<string,mixed>            $body
	 * @param array<string,mixed>|null       $module_research
	 * @return array<string,mixed>
	 */
	public static function plan_workspace_context( string $message, array $body, ?array $module_research = null ): array {
		$pulse    = isset( $body['pulse_context'] ) && is_array( $body['pulse_context'] ) ? $body['pulse_context'] : array();
		$location = ! empty( $pulse['locationSummary'] )
			? sanitize_text_field( (string) $pulse['locationSummary'] )
			: 'Current workspace tab';

		$context_specs = array(
			array(
				'id'           => 'content_opt_agent',
				'slice'        => 'context',
				'focus'        => 'Content optimization (pages, posts, SAP)',
				'role'         => 'Content optimization on ' . $location,
				'systemPrompt' => self::context_system_prompt( 'Content optimization for pages, posts, and service area pages', $location ),
			),
			array(
				'id'           => 'bulk_aiseo_agent',
				'slice'        => 'context',
				'focus'        => 'AISEO bulk meta actions',
				'role'         => 'AISEO bulk meta actions on ' . $location,
				'systemPrompt' => self::context_system_prompt( 'AISEO bulk actions for meta titles and descriptions', $location ),
			),
			array(
				'id'           => 'sitemap_workflows_agent',
				'slice'        => 'context',
				'focus'        => 'Sitemap clusters and URL workflows',
				'role'         => 'Sitemap workflows on ' . $location,
				'systemPrompt' => self::context_system_prompt( 'Sitemap source switching, clusters, and URL structure workflows', $location ),
			),
		);

		$data_needs = array();
		$site_specs = array();
		if ( Neo_Pulse_App_Platform_Data_Orchestrator::gsc_available_for_body( $body ) ) {
			$data_needs[] = array(
				'tool'   => 'gsc_performance_summary',
				'params' => array(),
			);
			$site_specs[] = array(
				'id'           => 'gsc_tab_context_agent',
				'slice'        => 'gsc_summary',
				'role'         => 'GSC performance context for ' . $location,
				'systemPrompt' => 'You connect live GSC performance data to actions the user can take on this tab. Explain what the metrics imply for optimization work here. Return JSON: {"findings":[],"score":null,"notes":"","byUrl":{}}.',
			);
		}

		$slice_team = array_merge( $context_specs, $site_specs );
		$mode       = count( $site_specs ) > 0 ? 'mixed' : 'workspace_context';

		return array(
			'intentSummary' => 'What you can do on this tab',
			'entityType'    => 'workspace',
			'researchMode'  => $mode,
			'entityScope'   => array(
				'mode'      => 'single',
				'url'       => '',
				'limit'     => 1,
				'post_type' => 'post',
			),
			'dataNeeds'     => $data_needs,
			'sliceTeam'     => $slice_team,
			'leadAgent'     => array(
				'systemPrompt' => 'You are the lead agent. Synthesize workspace capability specialists (and any site analytics context) into a clear answer for what the user can do on this tab at ' . $location . '. Return JSON with summary, findings array, and recommendations array tied to in-app actions.',
				'outputSchema' => array(),
			),
			'reason'        => 'fast_path: workspace context agents for tab help',
		);
	}

	private static function context_system_prompt( string $focus, string $location ): string {
		return 'You are a workspace specialist for ' . $focus . ' at ' . $location . '. Review the module catalog and workspace context in the payload. List concrete in-app actions the user can take on this tab. Return JSON: {"findings":["string"],"score":null,"notes":"string","byUrl":{}}.';
	}

	/**
	 * @param array<int,array<string,mixed>> $slice_team
	 * @param array<string,mixed>            $payload
	 * @return array<int,array<string,mixed>>
	 */
	public static function filter_slice_team_for_payload( array $slice_team, array $payload ): array {
		$has_entities  = ! empty( $payload['entities'] ) && is_array( $payload['entities'] );
		$has_analytics = ! empty( $payload['analytics'] ) && is_array( $payload['analytics'] );
		$has_context   = ! empty( $payload['context'] ) && is_array( $payload['context'] );
		$filtered      = array();

		foreach ( $slice_team as $spec ) {
			if ( ! is_array( $spec ) || empty( $spec['slice'] ) ) {
				continue;
			}
			$entity_type = sanitize_key( (string) ( $spec['entityType'] ?? 'post' ) );
			$slice       = self::normalize_slice( (string) $spec['slice'], $entity_type );
			if ( $slice === '' ) {
				continue;
			}
			if ( $slice === 'context' ) {
				if ( ! $has_context ) {
					continue;
				}
			} elseif ( in_array( $slice, self::ENTITY_SLICES, true ) && ! $has_entities ) {
				continue;
			} elseif ( in_array( $slice, self::ANALYTICS_SLICES, true ) && ! $has_analytics ) {
				continue;
			}
			$spec['slice'] = $slice;
			$filtered[]    = $spec;
		}

		return $filtered;
	}
}
