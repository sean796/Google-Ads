<?php
/**
 * AI Chat server-side usage budget.
 *
 * The chat's LLM calls go browser→provider (the browser holds the key), so the
 * server can't meter provider tokens directly. But every TOOL call the AI makes
 * goes through the server's /execute-ability route — the reliable signal for a
 * runaway agent loop. This caps that: a per-user per-minute rate limit and a
 * per-day tool-call budget, so a loop can't hammer the site (or rack up work)
 * unbounded. Both caps are filter/const-overridable; 0 = unlimited.
 *
 * @package EMCP_Tools
 * @since   3.10.0
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Per-user tool-call budget for AI Chat.
 *
 * @since 3.10.0
 */
class EMCP_Tools_AI_Chat_Usage {

	const DAILY_DEFAULT = 2000; // tool calls / user / day.
	const RATE_DEFAULT  = 120;  // tool calls / user / minute.

	/**
	 * Daily tool-call cap (0 = unlimited).
	 *
	 * @return int
	 */
	public static function daily_cap(): int {
		$c = defined( 'EMCP_TOOLS_AI_CHAT_DAILY_CAP' ) ? (int) EMCP_TOOLS_AI_CHAT_DAILY_CAP : self::DAILY_DEFAULT;
		return max( 0, (int) apply_filters( 'emcp_tools_ai_chat_daily_cap', $c ) );
	}

	/**
	 * Per-minute tool-call cap (0 = unlimited).
	 *
	 * @return int
	 */
	public static function rate_cap(): int {
		$c = defined( 'EMCP_TOOLS_AI_CHAT_RATE_CAP' ) ? (int) EMCP_TOOLS_AI_CHAT_RATE_CAP : self::RATE_DEFAULT;
		return max( 0, (int) apply_filters( 'emcp_tools_ai_chat_rate_cap', $c ) );
	}

	/**
	 * Check the per-minute + per-day budget for a user and record one tool call.
	 * Returns true when allowed, or a WP_Error (status 429) when a cap is hit.
	 *
	 * @param int $user_id User id.
	 * @return true|WP_Error
	 */
	public static function check_and_record( int $user_id ) {
		$user_id = max( 0, $user_id );

		$rate = self::rate_cap();
		if ( $rate > 0 ) {
			$mkey = 'emcp_ai_rate_' . $user_id . '_' . gmdate( 'YmdHi' );
			$m    = (int) get_transient( $mkey );
			if ( $m >= $rate ) {
				return new WP_Error( 'rate_limited', __( 'AI Chat is issuing tool calls too fast. Pause a moment and try again.', 'emcp-tools' ), array( 'status' => 429 ) );
			}
			set_transient( $mkey, $m + 1, 120 );
		}

		$daily = self::daily_cap();
		if ( $daily > 0 ) {
			$dkey = 'emcp_ai_daily_' . $user_id . '_' . gmdate( 'Ymd' );
			$d    = (int) get_transient( $dkey );
			if ( $d >= $daily ) {
				return new WP_Error( 'daily_budget_reached', __( 'The AI Chat daily tool-call budget has been reached; it resets tomorrow. Raise it with the emcp_tools_ai_chat_daily_cap filter or the EMCP_TOOLS_AI_CHAT_DAILY_CAP constant.', 'emcp-tools' ), array( 'status' => 429 ) );
			}
			set_transient( $dkey, $d + 1, DAY_IN_SECONDS );
		}

		return true;
	}

	/**
	 * Tool calls a user has made today (for display).
	 *
	 * @param int $user_id User id.
	 * @return int
	 */
	public static function today_count( int $user_id ): int {
		return (int) get_transient( 'emcp_ai_daily_' . max( 0, $user_id ) . '_' . gmdate( 'Ymd' ) );
	}
}
