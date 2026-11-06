<?php
/**
 * Fast-path intent detection and concrete plan builders.
 *
 * @package Neo_Pulse_App
 */

defined( 'ABSPATH' ) || exit;

trait Neo_Pulse_App_Platform_Data_Intent_Checklist_Trait_Fast_Path {

	/**
	 * @param array<int,array<string,mixed>> $history
	 * @return array<string,mixed>|null
	 */
	private static function fast_path_plan( string $message, array $history ): ?array {
		$url = self::url_from_history( $history );

		if ( preg_match( '/\b(?:specific|detail|first|that)\b.*\b(?:blog|post)\b/i', $message ) || preg_match( '/\b(?:blog|post)\b.*\b(?:specific|detail|first)\b/i', $message ) ) {
			$entity_plan = self::single_post_plan( $url, 'Deep review of one post from follow-up' );
			if ( self::wants_gsc_analytics( $message ) ) {
				return self::merge_compound_plan( $entity_plan, $message );
			}
			return $entity_plan;
		}

		if ( self::wants_scheduled_listing( $message ) ) {
			$scope = self::infer_entity_scope_from_message( $message );
			$limit = $scope !== null ? $scope['limit'] : 5;
			return self::inventory_list_plan( $limit, 'Scheduled posts listing', 'date_asc', 'future', 'inventory_scheduled' );
		}

		if ( self::wants_draft_listing( $message ) ) {
			$scope = self::infer_entity_scope_from_message( $message );
			$limit = $scope !== null ? $scope['limit'] : 10;
			return self::inventory_list_plan( $limit, 'Draft posts listing', 'date_desc', 'draft' );
		}

		if ( self::wants_inventory_listing( $message ) ) {
			$scope = self::infer_entity_scope_from_message( $message );
			$limit = $scope !== null ? $scope['limit'] : 5;
			$sort  = $scope !== null ? $scope['sort'] : 'date_desc';
			return self::inventory_list_plan( $limit, 'Site inventory listing', $sort );
		}

		$entity_plan = null;
		if ( self::wants_entity_review( $message ) ) {
			$scope     = self::infer_entity_scope_from_message( $message );
			$with_gsc  = self::wants_gsc_analytics( $message );
			if ( $scope !== null && $scope['mode'] === 'single' ) {
				$slices = $with_gsc
					? array( 'meta', 'keyword', 'body' )
					: array( 'url', 'meta', 'keyword', 'faq', 'seo_research', 'body', 'featured_image' );
				$entity_plan = self::single_post_plan( $url, 'Review of the latest post', $scope['sort'], $slices );
			} else {
				$limit       = $scope !== null ? $scope['limit'] : 3;
				$entity_plan = self::library_plan( $limit, 'Editorial review of recent posts' );
			}
		}

		if ( $entity_plan !== null && self::wants_gsc_analytics( $message ) ) {
			return self::merge_compound_plan( $entity_plan, $message );
		}
		if ( $entity_plan !== null ) {
			return $entity_plan;
		}

		if ( self::wants_blog_gsc_discovery( $message ) ) {
			return self::blog_gsc_discovery_plan( $message );
		}

		if ( self::wants_gsc_analytics( $message ) ) {
			return self::gsc_plan( $message );
		}

		if ( self::wants_full_library_review( $message ) ) {
			$scope = self::infer_entity_scope_from_message( $message );
			$limit = $scope !== null ? $scope['limit'] : 20;
			$sort  = $scope !== null ? $scope['sort'] : 'date_desc';
			return self::library_review_plan( $limit, 'Full library SEO review', $sort );
		}

		return null;
	}

	public static function wants_scheduled_listing( string $message ): bool {
		if ( self::wants_full_library_review( $message ) || self::wants_entity_review( $message ) ) {
			return false;
		}
		$lower = strtolower( trim( $message ) );
		if ( ! preg_match( '/\b(?:post|posts|blog|article|articles)\b/i', $message ) ) {
			return false;
		}
		if ( preg_match( '/\b(?:scheduled|upcoming|future)\b/i', $message ) ) {
			return true;
		}
		if ( preg_match( '/\bnext\b/i', $message ) && preg_match( '/\b(?:post|posts|blog)\b/i', $message ) ) {
			return true;
		}
		return false;
	}

	public static function wants_draft_listing( string $message ): bool {
		if ( self::wants_full_library_review( $message ) || self::wants_entity_review( $message ) ) {
			return false;
		}
		$lower = strtolower( trim( $message ) );
		if ( ! preg_match( '/\b(?:post|posts|blog|page|pages)\b/i', $message ) ) {
			return false;
		}
		return preg_match( '/\b(?:draft|drafts|unpublished|pending(?:\s+review)?)\b/i', $lower ) === 1;
	}

	public static function wants_inventory_listing( string $message ): bool {
		if ( self::wants_scheduled_listing( $message ) || self::wants_draft_listing( $message ) ) {
			return false;
		}
		if ( self::wants_full_library_review( $message ) || self::wants_entity_review( $message ) ) {
			return false;
		}

		$lower = strtolower( trim( $message ) );
		$has_entity = str_contains( $lower, 'post' ) || str_contains( $lower, 'blog' ) || str_contains( $lower, 'page' );
		if ( ! $has_entity ) {
			return false;
		}

		$listing_signals = array( 'title', 'titles', 'list', 'show me', 'tell me', 'what are', 'which', 'how many', 'published' );
		foreach ( $listing_signals as $needle ) {
			if ( str_contains( $lower, $needle ) ) {
				return true;
			}
		}

		if ( preg_match( '/\b(?:last|latest|recent|next)\b/i', $message ) ) {
			return true;
		}

		return false;
	}

	private static function wants_full_library_review( string $message ): bool {
		$lower = strtolower( $message );
		if ( str_contains( $lower, 'audit' ) || str_contains( $lower, 'incomplete' ) || str_contains( $lower, 'broken' ) ) {
			return true;
		}
		if ( str_contains( $lower, 'missing' ) && ( str_contains( $lower, 'meta' ) || str_contains( $lower, 'seo' ) ) ) {
			return true;
		}
		if ( str_contains( $lower, 'review' ) && ! str_contains( $lower, 'title' ) && ( str_contains( $lower, 'meta' ) || str_contains( $lower, 'seo' ) ) ) {
			return true;
		}
		return false;
	}

	private static function wants_entity_review( string $message ): bool {
		$lower         = strtolower( $message );
		$wants_opinion = str_contains( $lower, 'think' ) || str_contains( $lower, 'grade' ) || str_contains( $lower, 'score' ) || str_contains( $lower, 'opinion' ) || str_contains( $lower, 'review' );
		$wants_posts   = str_contains( $lower, 'post' ) || str_contains( $lower, 'blog' ) || str_contains( $lower, 'page' );
		return $wants_opinion && $wants_posts;
	}

	private static function wants_gsc_analytics( string $message ): bool {
		$lower = strtolower( $message );
		if ( str_contains( $lower, 'gsc' ) || str_contains( $lower, 'search console' ) ) {
			return true;
		}
		if ( str_contains( $lower, 'queries' ) && ( str_contains( $lower, 'search' ) || str_contains( $lower, 'google' ) ) ) {
			return true;
		}
		return str_contains( $lower, 'performance' ) && ( str_contains( $lower, 'gsc' ) || str_contains( $lower, 'search console' ) );
	}

	private static function wants_blog_gsc_discovery( string $message ): bool {
		$lower = strtolower( $message );
		$has_blog = str_contains( $lower, 'blog' ) || str_contains( $lower, 'post' );
		$has_perf = str_contains( $lower, 'perform' )
			|| str_contains( $lower, 'well' )
			|| str_contains( $lower, 'click' )
			|| str_contains( $lower, 'top' )
			|| str_contains( $lower, 'best' );
		return $has_blog && $has_perf && self::wants_gsc_analytics( $message );
	}

	/**
	 * @param array<string,mixed> $entity_plan
	 * @return array<string,mixed>
	 */
	private static function merge_compound_plan( array $entity_plan, string $message ): array {
		$addon = self::gsc_addon_for_entity_plan( $entity_plan, $message );

		$data_needs = is_array( $entity_plan['dataNeeds'] ?? null ) ? $entity_plan['dataNeeds'] : array();
		$seen_tools = array();
		foreach ( $data_needs as $need ) {
			if ( is_array( $need ) && ! empty( $need['tool'] ) ) {
				$seen_tools[ sanitize_key( (string) $need['tool'] ) ] = true;
			}
		}
		foreach ( $addon['dataNeeds'] as $need ) {
			if ( ! is_array( $need ) || empty( $need['tool'] ) ) {
				continue;
			}
			$tool = sanitize_key( (string) $need['tool'] );
			if ( $tool !== '' && ! isset( $seen_tools[ $tool ] ) ) {
				$data_needs[]       = $need;
				$seen_tools[ $tool ] = true;
			}
		}

		$slice_team  = is_array( $entity_plan['sliceTeam'] ?? null ) ? $entity_plan['sliceTeam'] : array();
		$seen_slices = array();
		foreach ( $slice_team as $spec ) {
			if ( is_array( $spec ) && ! empty( $spec['slice'] ) ) {
				$seen_slices[ sanitize_key( (string) $spec['slice'] ) ] = true;
			}
		}
		foreach ( $addon['sliceTeam'] as $spec ) {
			if ( ! is_array( $spec ) || empty( $spec['slice'] ) ) {
				continue;
			}
			$slice = sanitize_key( (string) $spec['slice'] );
			if ( $slice === '' || isset( $seen_slices[ $slice ] ) || count( $slice_team ) >= self::MAX_SLICE_AGENTS ) {
				continue;
			}
			$slice_team[]           = $spec;
			$seen_slices[ $slice ] = true;
		}

		$scope = isset( $entity_plan['entityScope'] ) && is_array( $entity_plan['entityScope'] ) ? $entity_plan['entityScope'] : array();
		$mode  = sanitize_key( (string) ( $scope['mode'] ?? 'library' ) );

		$entity_plan['intentSummary'] = trim( (string) ( $entity_plan['intentSummary'] ?? '' ) . ' with GSC performance analysis' );
		$entity_plan['dataNeeds']     = $data_needs;
		$entity_plan['sliceTeam']     = array_slice( $slice_team, 0, self::MAX_SLICE_AGENTS );
		$entity_plan['researchMode']  = 'mixed';
		$entity_plan['leadAgent']     = self::compound_lead_agent( $mode );
		$entity_plan['reason']        = 'fast_path: compound entity review + GSC analytics';

		return $entity_plan;
	}

	/**
	 * @param array<string,mixed> $entity_plan
	 * @return array{dataNeeds:array<int,array<string,mixed>>,sliceTeam:array<int,array<string,mixed>>}
	 */
	private static function gsc_addon_for_entity_plan( array $entity_plan, string $message ): array {
		$scope = isset( $entity_plan['entityScope'] ) && is_array( $entity_plan['entityScope'] ) ? $entity_plan['entityScope'] : array();
		$mode  = sanitize_key( (string) ( $scope['mode'] ?? 'library' ) );

		if ( $mode === 'single' ) {
			return array(
				'dataNeeds' => array(
					array(
						'tool'   => 'gsc_page_queries',
						'params' => array(),
					),
				),
				'sliceTeam' => array(
					array(
						'id'           => 'gsc_page_queries_agent',
						'slice'        => 'gsc_queries',
						'role'         => 'GSC page performance reviewer',
						'systemPrompt' => self::analytics_slice_system_prompt( 'gsc_queries', true ),
					),
				),
			);
		}

		$gsc = self::gsc_plan( $message );
		return array(
			'dataNeeds' => is_array( $gsc['dataNeeds'] ?? null ) ? $gsc['dataNeeds'] : array(),
			'sliceTeam' => is_array( $gsc['sliceTeam'] ?? null ) ? $gsc['sliceTeam'] : array(),
		);
	}

	/** @return array<string,mixed> */
	private static function compound_lead_agent( string $mode ): array {
		return array(
			'systemPrompt' => 'You are the lead research agent. Synthesize editorial slice reports and GSC analytics for the user question. Return JSON with summary, score or scores, findings array, recommendations array, and byUrl when library mode.',
			'outputSchema' => array(
				'summary'         => 'string',
				'score'           => 'number',
				'findings'        => array(),
				'recommendations' => array(),
				'byUrl'           => array(),
			),
		);
	}

	/** @param array<int,string> $slices */
	private static function single_post_plan( string $url, string $summary, string $sort = 'date_desc', array $slices = array() ): array {
		if ( count( $slices ) === 0 ) {
			$slices = array( 'url', 'meta', 'keyword', 'faq', 'seo_research', 'body', 'featured_image' );
		}
		return array(
			'intentSummary' => $summary,
			'entityType'    => 'post',
			'entityScope'   => array(
				'mode'      => 'single',
				'url'       => $url,
				'limit'     => 1,
				'post_type' => 'post',
			),
			'dataNeeds'     => array(
				array(
					'tool'   => 'inventory_recent',
					'params' => array(
						'post_type'      => 'post',
						'limit'          => 1,
						'sort'           => $sort,
						'includeContent' => true,
						'url'            => $url,
					),
				),
			),
			'sliceTeam'     => self::build_slice_team( $slices, 'single' ),
			'leadAgent'     => self::default_lead_agent( 'single' ),
			'reason'        => 'fast_path: single post deep dive',
		);
	}

	/** @param array<int,string> $slices */
	private static function library_review_plan( int $limit, string $summary, string $sort = 'date_desc' ): array {
		$slices = array( 'url', 'meta', 'keyword', 'faq', 'seo_research', 'body', 'featured_image' );
		$plan   = self::library_plan( $limit, $summary, $slices, $sort );
		$plan['researchMode'] = 'site_data';
		$plan['reason']       = 'fast_path: full library review';
		return $plan;
	}

	/** @return array<string,mixed> */
	private static function inventory_list_plan( int $limit, string $summary, string $sort = 'date_desc', string $post_status = 'publish', string $tool = 'inventory_recent' ): array {
		$post_status = Neo_Pulse_App_Platform_Inventory::normalize_post_status( $post_status );
		$team        = self::build_slice_team( array( 'inventory' ), 'library' );
		if ( $post_status === 'future' ) {
			foreach ( $team as &$spec ) {
				if ( is_array( $spec ) && ( $spec['slice'] ?? '' ) === 'inventory' ) {
					$spec['systemPrompt'] = self::inventory_slice_system_prompt( 'library', 'future' );
				}
			}
			unset( $spec );
		} elseif ( $post_status === 'draft' ) {
			foreach ( $team as &$spec ) {
				if ( is_array( $spec ) && ( $spec['slice'] ?? '' ) === 'inventory' ) {
					$spec['systemPrompt'] = self::inventory_slice_system_prompt( 'library', 'draft' );
				}
			}
			unset( $spec );
		}

		return array(
			'intentSummary' => $summary,
			'entityType'    => 'post',
			'researchMode'  => 'site_data',
			'entityScope'   => array(
				'mode'      => 'library',
				'url'       => '',
				'limit'     => $limit,
				'post_type' => 'post',
			),
			'dataNeeds'     => array(
				array(
					'tool'   => sanitize_key( $tool ),
					'params' => array(
						'post_type'      => 'post',
						'limit'          => $limit,
						'sort'           => $sort,
						'post_status'    => $post_status,
						'includeContent' => false,
					),
				),
			),
			'sliceTeam'     => $team,
			'leadAgent'     => self::listing_lead_agent( $post_status ),
			'reason'        => $post_status === 'future' ? 'fast_path: scheduled inventory listing' : ( $post_status === 'draft' ? 'fast_path: draft inventory listing' : 'fast_path: inventory listing' ),
		);
	}

	/** @return array<string,mixed> */
	private static function listing_lead_agent( string $post_status = 'publish' ): array {
		$post_status = Neo_Pulse_App_Platform_Inventory::normalize_post_status( $post_status );
		$prompt      = 'Answer the user listing question directly from inventory specialist findings and the inventory summary. List titles, URLs, and dates when relevant. Do not mention missing meta or body unless the user asked for SEO review.';
		if ( $post_status === 'future' ) {
			$prompt = 'Answer using only future or scheduled posts from inventory specialist findings and the inventory summary. List each title with its scheduled date_gmt. If no scheduled posts were returned, say no scheduled posts were found.';
		} elseif ( $post_status === 'draft' ) {
			$prompt = 'Answer using only draft posts from inventory specialist findings and the inventory summary. List titles and URLs. If no draft posts were returned, say no draft posts were found.';
		}
		return array(
			'systemPrompt' => $prompt,
			'outputSchema' => array(
				'summary'         => 'string',
				'findings'        => array(),
				'recommendations' => array(),
				'byUrl'           => array(),
			),
		);
	}

	/** @param array<int,string> $slices */
	private static function library_plan( int $limit, string $summary, array $slices = array( 'meta', 'keyword', 'body' ), string $sort = 'date_desc' ): array {
		if ( count( $slices ) === 0 ) {
			$slices = array( 'meta', 'keyword', 'body' );
		}
		return array(
			'intentSummary' => $summary,
			'entityType'    => 'post',
			'entityScope'   => array(
				'mode'      => 'library',
				'url'       => '',
				'limit'     => $limit,
				'post_type' => 'post',
			),
			'dataNeeds'     => array(
				array(
					'tool'   => 'inventory_recent',
					'params' => array(
						'post_type'      => 'post',
						'limit'          => $limit,
						'sort'           => $sort,
						'includeContent' => true,
					),
				),
			),
			'sliceTeam'     => self::build_slice_team( $slices, 'library' ),
			'leadAgent'     => self::default_lead_agent( 'library' ),
			'reason'        => 'fast_path: post library review',
		);
	}

	private static function gsc_plan( string $message ): array {
		return array(
			'intentSummary' => 'Site search performance review',
			'entityType'    => 'site',
			'entityScope'   => array( 'mode' => 'single', 'url' => '', 'limit' => 1 ),
			'dataNeeds'     => array(
				array( 'tool' => 'gsc_performance_summary', 'params' => array() ),
				array( 'tool' => 'gsc_top_queries', 'params' => array( 'rowLimit' => 15 ) ),
				array( 'tool' => 'gsc_top_pages', 'params' => array( 'limit' => 15 ) ),
			),
			'sliceTeam'     => self::build_slice_team( array( 'gsc_summary', 'gsc_queries', 'gsc_pages' ), 'site' ),
			'leadAgent'     => self::default_lead_agent( 'site' ),
			'reason'        => 'fast_path: GSC analytics',
		);
	}

	private static function blog_gsc_discovery_plan( string $message ): array {
		return array(
			'intentSummary' => 'Find blog posts performing well in Google Search Console',
			'entityType'    => 'site',
			'entityScope'   => array( 'mode' => 'single', 'url' => '', 'limit' => 1 ),
			'dataNeeds'     => array(
				array(
					'tool'   => 'gsc_blog_performers',
					'params' => array(
						'limit'     => 5,
						'minClicks' => 1,
					),
				),
			),
			'sliceTeam'     => self::build_slice_team( array( 'gsc_blog_performers' ), 'site' ),
			'leadAgent'     => self::default_lead_agent( 'site' ),
			'reason'        => 'fast_path: GSC blog discovery',
		);
	}
}
