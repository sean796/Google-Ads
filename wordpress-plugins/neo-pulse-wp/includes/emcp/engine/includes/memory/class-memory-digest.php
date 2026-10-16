<?php
/**
 * Memory Digest — builds a factual session digest from the change ledger.
 *
 * Deterministic and derived (not asserted): reads EMCP_Tools_Change_Log entries
 * in a time window and counts them by domain and action, listing the distinct
 * targets touched. Nothing here is agent-supplied, so there is nothing to
 * hallucinate — this is the trustworthy backbone of every session record.
 *
 * @package EMCP_Tools
 * @since   3.7.0
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Builds factual digests from EMCP_Tools_Change_Log.
 *
 * @since 3.7.0
 */
class EMCP_Tools_Memory_Digest {

	/** Cap on distinct targets recorded per digest. */
	const MAX_TARGETS = 20;

	/**
	 * Builds a digest of change-ledger activity in [ $since, $until ].
	 *
	 * @since 3.7.0
	 *
	 * @param int $since Lower bound (inclusive) unix ts; 0 = no lower bound.
	 * @param int $until Upper bound (inclusive) unix ts; 0 = no upper bound.
	 * @return array{from:int,to:int,total:int,by_domain:array,by_action:array,targets:array}
	 */
	public static function build( int $since = 0, int $until = 0 ): array {
		$entries = class_exists( 'EMCP_Tools_Change_Log' ) ? EMCP_Tools_Change_Log::all() : array();

		$by_domain = array();
		$by_action = array();
		$targets   = array();
		$from      = 0;
		$to        = 0;
		$total     = 0;

		foreach ( $entries as $e ) {
			$ts = (int) ( $e['ts'] ?? 0 );
			if ( $ts < $since ) {
				continue;
			}
			if ( $until > 0 && $ts > $until ) {
				continue;
			}
			++$total;
			$from = ( 0 === $from ) ? $ts : min( $from, $ts );
			$to   = max( $to, $ts );

			$dom = (string) ( $e['domain'] ?? 'other' );
			$act = (string) ( $e['action'] ?? 'other' );
			$by_domain[ $dom ] = ( $by_domain[ $dom ] ?? 0 ) + 1;
			$by_action[ $act ] = ( $by_action[ $act ] ?? 0 ) + 1;

			$tg = (string) ( $e['target'] ?? '' );
			if ( '' !== $tg && ! in_array( $tg, $targets, true ) && count( $targets ) < self::MAX_TARGETS ) {
				$targets[] = $tg;
			}
		}

		return array(
			'from'      => $from,
			'to'        => $to,
			'total'     => $total,
			'by_domain' => $by_domain,
			'by_action' => $by_action,
			'targets'   => $targets,
		);
	}
}
