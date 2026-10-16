<?php
/**
 * Memory Summarizer — rollup cron + opt-in AI-Chat-backed session summaries.
 *
 * There is no session-end signal from MCP, so an hourly cron closes out
 * "orphaned" activity windows: a block of change-ledger activity that is now
 * idle and not already covered by an agent-written session record. Each such
 * window becomes one session record built from the factual digest. When the
 * `auto_summarize` setting is on and a usable AI Chat provider exists, that
 * record also gets a one-shot LLM summary; otherwise it is digest-only. Any
 * provider failure degrades silently — the summarizer never throws.
 *
 * @package EMCP_Tools
 * @since   3.7.0
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Rolls up orphaned sessions and (optionally) summarizes them.
 *
 * @since 3.7.0
 */
class EMCP_Tools_Memory_Summarizer {

	const CRON_HOOK    = 'emcp_tools_memory_rollup';
	const IDLE_SECONDS = 1800;
	const AUTO_OPTION  = 'emcp_tools_memory_auto_summarize';

	/**
	 * Schedules the hourly rollup cron (idempotent).
	 *
	 * @since 3.7.0
	 */
	public function schedule(): void {
		if ( ! wp_next_scheduled( self::CRON_HOOK ) ) {
			wp_schedule_event( time() + 300, 'hourly', self::CRON_HOOK );
		}
	}

	/**
	 * Clears the rollup cron.
	 *
	 * @since 3.7.0
	 */
	public function unschedule(): void {
		wp_clear_scheduled_hook( self::CRON_HOOK );
	}

	/**
	 * Cron callback: writes one session record for a completed, idle activity
	 * window not yet covered by an agent record. No-op when there is no new
	 * activity or the window is still active.
	 *
	 * @since 3.7.0
	 */
	public function run_rollup(): void {
		if ( ! class_exists( 'EMCP_Tools_Memory_Store' ) || ! class_exists( 'EMCP_Tools_Memory_Digest' ) ) {
			return;
		}
		$store = EMCP_Tools_Memory_Store::instance();
		$last  = $store->list_sessions( 1 );
		$since = 0;
		if ( ! empty( $last ) ) {
			$since = (int) ( $last[0]['digest']['to'] ?? $last[0]['ts'] ) + 1;
		}

		$digest = EMCP_Tools_Memory_Digest::build( $since );
		if ( 0 === $digest['total'] ) {
			return; // no new activity
		}
		if ( ( time() - (int) $digest['to'] ) < self::IDLE_SECONDS ) {
			return; // window still active — wait for it to close
		}

		list( $summary, $source ) = $this->maybe_summarize( $digest );
		$store->add_session(
			array(
				'ts'             => time(),
				'session_token'  => 'rollup-' . $digest['to'],
				'summary'        => $summary,
				'summary_source' => $source,
				'digest'         => $digest,
				'proposed_ids'   => array(),
			)
		);
	}

	/**
	 * Returns [ summary, source ]. LLM summary only when the toggle is on and a
	 * provider yields text; otherwise [ '', '' ]. Never throws.
	 *
	 * @since 3.7.0
	 *
	 * @param array $digest Factual digest.
	 * @return array{0:string,1:string}
	 */
	public function maybe_summarize( array $digest ): array {
		if ( '1' !== (string) get_option( self::AUTO_OPTION, '0' ) ) {
			return array( '', '' );
		}
		if ( ! class_exists( 'EMCP_Tools_AI_Chat_Provider' ) || ! method_exists( 'EMCP_Tools_AI_Chat_Provider', 'summarize_text' ) ) {
			return array( '', '' );
		}
		try {
			$text = (string) EMCP_Tools_AI_Chat_Provider::summarize_text( $this->prompt_from_digest( $digest ) );
		} catch ( \Throwable $e ) {
			$text = '';
		}
		return '' !== trim( $text ) ? array( $text, 'llm' ) : array( '', '' );
	}

	/**
	 * Builds the summarization prompt from a factual digest.
	 *
	 * @since 3.7.0
	 *
	 * @param array $digest Factual digest.
	 * @return string
	 */
	private function prompt_from_digest( array $digest ): string {
		$doms = array();
		foreach ( (array) ( $digest['by_domain'] ?? array() ) as $d => $c ) {
			$doms[] = "$d x$c";
		}
		return 'Summarize this WordPress site editing session in 2-3 sentences for a future AI agent. '
			. 'Changes by domain: ' . implode( ', ', $doms ) . '. '
			. 'Targets: ' . implode( ', ', (array) ( $digest['targets'] ?? array() ) ) . '. '
			. 'Be factual; do not invent details.';
	}
}
