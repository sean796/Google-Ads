<?php
/**
 * Attach the Themer Pro power-ups to the free extension seams.
 *
 * License-gated: init() only attaches when can_use_premium_code(). attach() is the
 * pure wiring (no license check) so tests can exercise it directly.
 *
 * @package EMCP_Tools_Pro
 * @since   3.1.0
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * @since 3.1.0
 */
class EMCP_Tools_Themer_Pro {

	/** License-gated entry point (called by the Pro loader). */
	public static function init(): void {
		if ( ! function_exists( 'emcp_tools_fs' ) || ! emcp_tools_fs()->can_use_premium_code() ) {
			return;
		}
		self::attach();
	}

	/** Attach every seam (no license check — the gate is in init()). */
	public static function attach(): void {
		if ( class_exists( 'EMCP_Tools_Themer_Dynamic_Pro' ) ) {
			EMCP_Tools_Themer_Dynamic_Pro::init();
		}
		if ( class_exists( 'EMCP_Tools_Themer_Loop_Pro' ) ) {
			EMCP_Tools_Themer_Loop_Pro::init();
		}
		add_filter( 'emcp_themer_matchers', array( 'EMCP_Tools_Themer_Pro_Matchers', 'register' ) );
		add_filter( 'emcp_themer_selectors', array( 'EMCP_Tools_Themer_Pro_Conditions', 'selectors' ) );
		add_filter( 'emcp_themer_quota', array( 'EMCP_Tools_Themer_Pro_Conditions', 'quota' ), 10, 2 );
		add_filter(
			'emcp_themer_rank',
			static function () {
				return EMCP_Tools_Themer_Pro_Conditions::ranker();
			}
		);
		add_filter( 'emcp_themer_condition_schema', array( 'EMCP_Tools_Themer_Pro_Conditions', 'schema' ), 10, 2 );
		add_action( 'wp_ajax_emcp_themer_object_search', array( 'EMCP_Tools_Themer_Pro_Conditions', 'ajax_object_search' ) );
	}
}
