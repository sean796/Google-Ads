<?php
/**
 * Slice team construction, slice prompts, and plan normalization.
 *
 * @package Neo_Pulse_App
 */

defined( 'ABSPATH' ) || exit;

trait Neo_Pulse_App_Platform_Data_Intent_Checklist_Trait_Slice_Team {

	/** @param array<int,string> $slices */
	private static function build_slice_team( array $slices, string $mode ): array {
		$labels = self::slice_role_labels();
		$team = array();
		foreach ( array_slice( $slices, 0, self::MAX_SLICE_AGENTS ) as $slice ) {
			$slice = sanitize_key( $slice );
			$team[] = array(
				'id'           => $slice . '_agent',
				'slice'        => $slice,
				'role'         => $labels[ $slice ] ?? ucwords( str_replace( '_', ' ', $slice ) ),
				'systemPrompt' => $slice === 'inventory'
					? self::inventory_slice_system_prompt( $mode )
					: ( in_array( $slice, self::ANALYTICS_SLICES, true )
						? self::analytics_slice_system_prompt( $slice, false )
						: self::slice_system_prompt( $slice, $mode ) ),
			);
		}
		return $team;
	}

	private static function analytics_slice_system_prompt( string $slice, bool $page_scoped = false ): string {
		if ( $slice === 'gsc_queries' && $page_scoped ) {
			return 'You are a GSC page performance specialist. Analyze search queries, clicks, impressions, and average position for the post URL in the analytics payload. Return JSON: {"findings":["string"],"score":null,"notes":"string","byUrl":{}}.';
		}
		if ( $slice === 'gsc_queries' ) {
			return 'You are a GSC top queries specialist. Analyze search query strings only from the analytics payload. A search query is NOT a blog post or page URL. Never describe a query string as a blog post or page. Return JSON: {"findings":["string"],"score":null,"notes":"string","byUrl":{}}.';
		}
		if ( $slice === 'gsc_summary' ) {
			return 'You are a GSC site performance specialist. Summarize period-over-period search metrics from the analytics payload. Return JSON: {"findings":["string"],"score":null,"notes":"string","byUrl":{}}.';
		}
		if ( $slice === 'gsc_reporting' ) {
			return 'You are a GSC reporting compare specialist. Summarize MoM or YoY period labels and site-total deltas (clicks, impressions, CTR, position) from the analytics payload. Return JSON: {"findings":["string"],"score":null,"notes":"string","byUrl":{}}.';
		}
		if ( $slice === 'ads_reporting' ) {
			return 'You are a PPC Ads reporting compare specialist. Summarize MoM or YoY spend, clicks, impressions, conversions, CTR, and avg CPC from the analytics payload. Do not invent spend. Return JSON: {"findings":["string"],"score":null,"notes":"string","byUrl":{}}.';
		}
		if ( $slice === 'gsc_pages' ) {
			return 'You are a GSC top pages specialist. Review top pages by clicks and impressions from the analytics payload. Return JSON: {"findings":["string"],"score":null,"notes":"string","byUrl":{}}.';
		}
		if ( $slice === 'gsc_blog_performers' ) {
			return 'You are a GSC blog performer finder. Use only blog page rows from the analytics payload (url, title, clicks, impressions, position, ctr). Cite each blog by post title and URL. If no blog rows have clicks, say so plainly. Never substitute a search query string for a blog post. Return JSON: {"findings":["string"],"score":null,"notes":"string","byUrl":{}}.';
		}
		if ( $slice === 'ga_organic' ) {
			return 'You are a GA organic traffic specialist. Review organic sessions and conversions from the analytics payload. Return JSON: {"findings":["string"],"score":null,"notes":"string","byUrl":{}}.';
		}
		return 'You are a ' . $slice . ' analytics specialist. Review the analytics payload for this slice. Return JSON: {"findings":["string"],"score":null,"notes":"string","byUrl":{}}.';
	}

	private static function inventory_slice_system_prompt( string $mode, string $post_status = 'publish' ): string {
		$scope = $mode === 'library' ? 'each post in the library payload' : 'the post in the payload';
		if ( $post_status === 'future' ) {
			return 'You are a site inventory listing specialist for scheduled content. Use only inventory rows with status future for ' . $scope . '. List title, scheduled date_gmt, and URL for each upcoming post. If no future rows exist, say so plainly. Do not score SEO quality. Return JSON: {"findings":["string"],"score":null,"notes":"string","byUrl":{}}.';
		}
		if ( $post_status === 'draft' ) {
			return 'You are a site inventory listing specialist for draft content. Use only inventory rows with status draft for ' . $scope . '. List title and URL for each draft post. Do not score SEO quality. Return JSON: {"findings":["string"],"score":null,"notes":"string","byUrl":{}}.';
		}
		return 'You are a site inventory listing specialist. Use only inventory fields (title, url, slug, date_gmt, status, excerpt, focus_keyword) for ' . $scope . '. Answer listing and retrieval questions with explicit title and URL bullets. Do not score SEO quality. Return JSON: {"findings":["string"],"score":null,"notes":"string","byUrl":{}}.';
	}

	private static function slice_system_prompt( string $slice, string $mode ): string {
		$scope = $mode === 'library' ? 'each post in the library payload' : 'the post in the payload';
		return 'You are a ' . $slice . ' specialist. Review only the ' . $slice . ' slice for ' . $scope . '. Return JSON: {"findings":["string"],"score":1-10 optional,"notes":"string","byUrl":{}}. Be critical; avoid uniform 10/10 scores unless genuinely excellent.';
	}

	/** @return array<string,mixed> */
	private static function default_lead_agent( string $mode ): array {
		return array(
			'systemPrompt'  => 'You are the lead research agent. Synthesize all slice specialist reports into a final answer for the user question. Return JSON with summary, score or scores, findings array, recommendations array, and byUrl when library mode.',
			'outputSchema'  => array(
				'summary'         => 'string',
				'score'           => 'number',
				'findings'        => array(),
				'recommendations' => array(),
				'byUrl'           => array(),
			),
		);
	}

	/** @return array<string,mixed> */
	private static function fallback_plan( string $message ): array {
		$scope = self::infer_entity_scope_from_message( $message );

		if ( self::wants_scheduled_listing( $message ) ) {
			$limit = $scope !== null ? $scope['limit'] : 5;
			return self::inventory_list_plan( $limit, 'Scheduled posts listing', 'date_asc', 'future', 'inventory_scheduled' );
		}

		if ( self::wants_draft_listing( $message ) ) {
			$limit = $scope !== null ? $scope['limit'] : 10;
			return self::inventory_list_plan( $limit, 'Draft posts listing', 'date_desc', 'draft' );
		}

		if ( self::wants_inventory_listing( $message ) ) {
			$limit = $scope !== null ? $scope['limit'] : 5;
			$sort  = $scope !== null ? $scope['sort'] : 'date_desc';
			return self::inventory_list_plan( $limit, 'Site inventory listing', $sort );
		}

		if ( self::wants_full_library_review( $message ) || self::wants_entity_review( $message ) ) {
			if ( $scope !== null && $scope['mode'] === 'single' ) {
				return self::single_post_plan( '', 'Review of one post', $scope['sort'] );
			}
			$limit = $scope !== null ? $scope['limit'] : 10;
			$sort  = $scope !== null ? $scope['sort'] : 'date_desc';
			return self::library_review_plan( $limit, 'Full library SEO review', $sort );
		}

		if ( $scope !== null && $scope['mode'] === 'single' ) {
			return self::single_post_plan( '', 'Review of one post', $scope['sort'] );
		}

		$limit = $scope !== null ? $scope['limit'] : 5;
		return self::inventory_list_plan( $limit, 'General post library listing' );
	}

	/** @param array<string,mixed> $parsed */
	private static function normalize_plan( array $parsed, string $message, array $body = array(), ?array $module_research = null ): array {
		$scope       = isset( $parsed['entityScope'] ) && is_array( $parsed['entityScope'] ) ? $parsed['entityScope'] : array();
		$team        = isset( $parsed['sliceTeam'] ) && is_array( $parsed['sliceTeam'] ) ? $parsed['sliceTeam'] : array();
		$mode        = sanitize_key( (string) ( $scope['mode'] ?? 'library' ) );
		$entity_type = sanitize_key( (string) ( $parsed['entityType'] ?? 'post' ) );
		$normalized_team = array();
		$seen_slices     = array();
		$seen_ids        = array();

		foreach ( array_slice( $team, 0, self::MAX_SLICE_AGENTS ) as $entry ) {
			if ( ! is_array( $entry ) || empty( $entry['slice'] ) ) {
				continue;
			}
			$slice = self::normalize_slice( (string) $entry['slice'], $entity_type );
			if ( $slice === '' ) {
				continue;
			}
			$entry_id = sanitize_key( (string) ( $entry['id'] ?? $slice . '_agent' ) );
			if ( isset( $seen_ids[ $entry_id ] ) ) {
				continue;
			}
			if ( $slice !== 'context' && isset( $seen_slices[ $slice ] ) ) {
				continue;
			}
			$seen_ids[ $entry_id ]    = true;
			if ( $slice !== 'context' ) {
				$seen_slices[ $slice ] = true;
			}
			$labels = self::slice_role_labels();
			$row = array(
				'id'           => $entry_id,
				'slice'        => $slice,
				'role'         => sanitize_text_field( (string) ( $entry['role'] ?? ( $labels[ $slice ] ?? $slice ) ) ),
				'systemPrompt' => sanitize_textarea_field( (string) ( $entry['systemPrompt'] ?? self::slice_prompt_for( $slice, $mode, $body, $entry ) ) ),
			);
			if ( $slice === 'context' && ! empty( $entry['focus'] ) ) {
				$row['focus'] = sanitize_text_field( (string) $entry['focus'] );
			}
			$normalized_team[] = $row;
		}
		if ( count( $normalized_team ) === 0 ) {
			if ( self::is_ui_help_message( $message, $body ) ) {
				return self::plan_workspace_context( $message, $body, $module_research );
			}
			return self::empty_plan( 'No valid slice team for this message' );
		}

		$research_mode = sanitize_key( (string) ( $parsed['researchMode'] ?? '' ) );
		if ( $research_mode === '' ) {
			$has_context = false;
			$has_site    = false;
			foreach ( $normalized_team as $spec ) {
				if ( ( $spec['slice'] ?? '' ) === 'context' ) {
					$has_context = true;
				} else {
					$has_site = true;
				}
			}
			$research_mode = $has_context && $has_site ? 'mixed' : ( $has_context ? 'workspace_context' : 'site_data' );
		}

		return array(
			'intentSummary' => sanitize_text_field( (string) ( $parsed['intentSummary'] ?? 'Research request' ) ),
			'entityType'    => $entity_type,
			'researchMode'  => $research_mode,
			'entityScope'   => array(
				'mode'      => $mode,
				'url'       => esc_url_raw( trim( (string) ( $scope['url'] ?? '' ) ) ),
				'limit'     => max( 1, min( 20, (int) ( $scope['limit'] ?? 5 ) ) ),
				'post_type' => sanitize_key( (string) ( $scope['post_type'] ?? 'post' ) ),
			),
			'dataNeeds'     => is_array( $parsed['dataNeeds'] ?? null ) ? $parsed['dataNeeds'] : array(),
			'sliceTeam'     => $normalized_team,
			'leadAgent'     => is_array( $parsed['leadAgent'] ?? null ) ? $parsed['leadAgent'] : self::default_lead_agent( $mode ),
			'reason'        => sanitize_text_field( (string) ( $parsed['reason'] ?? 'classifier plan' ) ),
		);
	}

	private static function slice_prompt_for( string $slice, string $mode, array $body, array $entry ): string {
		if ( $slice === 'context' ) {
			return self::context_system_prompt( (string) ( $entry['focus'] ?? 'tab capabilities' ), self::workspace_location( $body ) );
		}
		if ( $slice === 'inventory' ) {
			return self::inventory_slice_system_prompt( $mode );
		}
		if ( in_array( $slice, self::ANALYTICS_SLICES, true ) ) {
			return self::analytics_slice_system_prompt( $slice, false );
		}
		return self::slice_system_prompt( $slice, $mode );
	}

	/** @return array<string,string> */
	private static function slice_role_labels(): array {
		return array(
			'inventory'      => 'Site inventory listing specialist',
			'url'            => 'URL and slug reviewer',
			'meta'           => 'Meta description reviewer',
			'keyword'        => 'Focus keyword reviewer',
			'faq'            => 'FAQ schema reviewer',
			'seo_research'   => 'SEO research brief reviewer',
			'body'           => 'Body content reviewer',
			'featured_image' => 'Featured image reviewer',
			'gsc_summary'    => 'GSC performance reviewer',
			'gsc_reporting'  => 'GSC reporting compare reviewer',
			'ads_reporting'  => 'PPC Ads reporting compare reviewer',
			'gsc_queries'    => 'GSC top queries reviewer',
			'gsc_pages'      => 'GSC top pages reviewer',
			'gsc_blog_performers' => 'GSC blog performer finder',
			'ga_organic'     => 'GA organic traffic reviewer',
		);
	}

	/**
	 * @param array<int,array<string,mixed>> $history
	 */
	private static function history_snippet( array $history ): string {
		$lines = array();
		foreach ( array_slice( $history, -4 ) as $entry ) {
			if ( ! is_array( $entry ) ) {
				continue;
			}
			$role = (string) ( $entry['role'] ?? '' );
			$text = trim( (string) ( $entry['content'] ?? '' ) );
			if ( $text !== '' ) {
				$lines[] = $role . ': ' . substr( $text, 0, 400 );
			}
		}
		return implode( "\n", $lines );
	}

	/**
	 * @param array<int,array<string,mixed>> $history
	 */
	private static function url_from_history( array $history ): string {
		for ( $i = count( $history ) - 1; $i >= 0; $i-- ) {
			$entry = $history[ $i ];
			if ( ! is_array( $entry ) || ( $entry['role'] ?? '' ) !== 'assistant' ) {
				continue;
			}
			$content = (string) ( $entry['content'] ?? '' );
			if ( preg_match( '#\((https?://[^\)]+)\)#', $content, $m ) ) {
				return esc_url_raw( $m[1] );
			}
		}
		return '';
	}
}
