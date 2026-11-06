<?php
/**
 * Intent checklist: plans entity scope, data needs, and dynamic slice team.
 *
 * @package Neo_Pulse_App
 */

defined( 'ABSPATH' ) || exit;

$neo_pulse_app_intent_checklist_dir = __DIR__ . '/';
require_once $neo_pulse_app_intent_checklist_dir . 'trait-platform-data-intent-checklist-planning.php';
require_once $neo_pulse_app_intent_checklist_dir . 'trait-platform-data-intent-checklist-fast-path.php';
require_once $neo_pulse_app_intent_checklist_dir . 'trait-platform-data-intent-checklist-slice-team.php';

class Neo_Pulse_App_Platform_Data_Intent_Checklist {

	const MAX_SLICE_AGENTS = 8;
	const SLICE_MODEL      = 'google/gemini-2.5-flash-lite';

	/** @var array<int,string> */
	const ENTITY_SLICES = array(
		'inventory',
		'url',
		'meta',
		'keyword',
		'faq',
		'seo_research',
		'body',
		'featured_image',
	);

	/** @var array<int,string> */
	const ANALYTICS_SLICES = array(
		'gsc_summary',
		'gsc_reporting',
		'gsc_queries',
		'gsc_pages',
		'gsc_blog_performers',
		'ga_organic',
		'ads_reporting',
	);

	/** @var array<string,string> Map mistaken tool ids to slice keys. */
	const SLICE_ALIASES = array(
		'inventory_recent'          => 'meta',
		'inventory_grade'           => 'meta',
		'inventory_audit'           => 'meta',
		'gsc_performance_summary'   => 'gsc_summary',
		'gsc_reporting_compare_summary' => 'gsc_reporting',
		'gsc_reporting_status'      => 'gsc_reporting',
		'ads_reporting_compare_summary' => 'ads_reporting',
		'ads_reporting_status'      => 'ads_reporting',
		'gsc_top_queries'           => 'gsc_queries',
		'gsc_top_pages'             => 'gsc_pages',
		'gsc_blog_performers'       => 'gsc_blog_performers',
		'ga_organic_summary'        => 'ga_organic',
	);

	/** @var array<int,string> */
	const CONTEXT_SLICES = array(
		'context',
	);

	use Neo_Pulse_App_Platform_Data_Intent_Checklist_Trait_Planning;
	use Neo_Pulse_App_Platform_Data_Intent_Checklist_Trait_Fast_Path;
	use Neo_Pulse_App_Platform_Data_Intent_Checklist_Trait_Slice_Team;

	/**
	 * Tab / workspace help: module catalog + optional site data, not a hard skip.
	 *
	 * @param array<string,mixed> $body
	 */
	public static function is_ui_help_message( string $message, array $body = array() ): bool {
		$lower = strtolower( trim( $message ) );
		if ( $lower === '' ) {
			return false;
		}

		$needles = array(
			'what can i do on this tab',
			'what can i do here',
			'what can i do on this page',
			'what can you do on this tab',
			'what is this tab',
			'what does this tab',
			'how do i use this tab',
			'what am i looking at',
			'help on this tab',
			'features on this tab',
			'what can i do in this section',
		);
		foreach ( $needles as $needle ) {
			if ( str_contains( $lower, $needle ) ) {
				return true;
			}
		}

		if ( str_contains( $lower, 'what can i do' ) && str_contains( $lower, 'tab' ) ) {
			return true;
		}

		$pulse = isset( $body['pulse_context'] ) && is_array( $body['pulse_context'] ) ? $body['pulse_context'] : array();
		if ( str_contains( $lower, 'what can i do' ) && ! empty( $pulse['locationSummary'] ) ) {
			return true;
		}

		return false;
	}

	/**
	 * @param array<string,mixed> $body
	 */
	public static function empty_plan( string $reason ): array {
		return array(
			'intentSummary' => '',
			'entityType'    => 'post',
			'entityScope'   => array(
				'mode'      => 'library',
				'url'       => '',
				'limit'     => 10,
				'post_type' => 'post',
			),
			'dataNeeds'     => array(),
			'sliceTeam'     => array(),
			'leadAgent'     => self::default_lead_agent( 'library' ),
			'reason'        => $reason,
		);
	}
}
