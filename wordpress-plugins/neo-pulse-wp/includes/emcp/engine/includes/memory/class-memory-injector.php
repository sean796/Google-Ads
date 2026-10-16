<?php
/**
 * Memory Injector — composes approved guidance into the discovery context.
 *
 * Reads ONLY approved (`publish`) guidance from EMCP_Tools_Memory_Store, groups
 * it by type into a compact "## Project memory" block, caches the composed
 * string in an option (rebuilt only when guidance changes), and serves it
 * through the free `emcp_tools_discovery_memory` filter. Pending/rejected
 * entries are never composed — that is the hallucination gate.
 *
 * @package EMCP_Tools
 * @since   3.7.0
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Builds + caches + injects the approved-guidance block.
 *
 * @since 3.7.0
 */
class EMCP_Tools_Memory_Injector {

	/** Hard cap on the injected block, in characters. */
	const CAP = 1500;

	/**
	 * type => human label, in the order they appear in the block.
	 *
	 * @var array<string,string>
	 */
	private static $labels = array(
		'guardrail'   => 'Guardrails',
		'fact'        => 'Site facts',
		'convention'  => 'Conventions',
		'instruction' => 'Instructions',
	);

	/**
	 * Wires the discovery filter + cache-rebuild hooks.
	 *
	 * @since 3.7.0
	 */
	public function register(): void {
		add_filter( 'emcp_tools_discovery_memory', array( $this, 'inject' ) );
		add_action( 'save_post_' . EMCP_Tools_Memory_Store::POST_TYPE, array( $this, 'rebuild_cache' ) );
		add_action( 'transition_post_status', array( $this, 'on_transition' ), 10, 3 );
	}

	/**
	 * Rebuilds the cache on any emcp_memory status change.
	 *
	 * @since 3.7.0
	 *
	 * @param string  $new  New status.
	 * @param string  $old  Old status.
	 * @param WP_Post $post The post.
	 */
	public function on_transition( $new, $old, $post ): void {
		if ( isset( $post->post_type ) && EMCP_Tools_Memory_Store::POST_TYPE === $post->post_type ) {
			$this->rebuild_cache();
		}
	}

	/**
	 * Composes the "## Project memory" block from approved guidance.
	 *
	 * @since 3.7.0
	 *
	 * @return string The block, or '' when there is no approved guidance.
	 */
	public function compose(): string {
		if ( ! class_exists( 'EMCP_Tools_Memory_Store' ) ) {
			return '';
		}
		$rows = EMCP_Tools_Memory_Store::instance()->list_guidance( 'publish' );
		if ( empty( $rows ) ) {
			return '';
		}

		usort(
			$rows,
			static function ( $a, $b ) {
				return ( $a['weight'] <=> $b['weight'] ) ?: ( $a['id'] <=> $b['id'] );
			}
		);

		$groups = array();
		foreach ( $rows as $r ) {
			$type = isset( self::$labels[ $r['type'] ] ) ? $r['type'] : 'instruction';
			// Strip trailing punctuation so joining with "; " and appending "." does
			// not produce doubled periods when the guidance already ends in one.
			$text = rtrim( trim( wp_strip_all_tags( (string) $r['body'] ) ), " .;" );
			if ( '' !== $text ) {
				$groups[ $type ][] = $text;
			}
		}
		if ( empty( $groups ) ) {
			return '';
		}

		$lines = array( '## Project memory' );
		foreach ( self::$labels as $type => $label ) {
			if ( ! empty( $groups[ $type ] ) ) {
				$lines[] = $label . ': ' . implode( '; ', $groups[ $type ] ) . '.';
			}
		}
		$lines[] = '(Call recall for session history and full detail.)';

		$out = implode( "\n", $lines );
		if ( strlen( $out ) > self::CAP ) {
			$out = substr( $out, 0, self::CAP - 3 ) . '...';
		}
		return $out;
	}

	/**
	 * Recomposes and stores the cached block.
	 *
	 * @since 3.7.0
	 */
	public function rebuild_cache(): void {
		update_option( EMCP_Tools_Memory_Store::INJECT_OPTION, $this->compose(), false );
	}

	/**
	 * Filter callback: returns the cached block (composing + caching once if unset).
	 *
	 * @since 3.7.0
	 *
	 * @param string $existing Incoming filter value (ignored).
	 * @return string
	 */
	public function inject( $existing = '' ): string {
		$cached = get_option( EMCP_Tools_Memory_Store::INJECT_OPTION, null );
		if ( null === $cached ) {
			$cached = $this->compose();
			update_option( EMCP_Tools_Memory_Store::INJECT_OPTION, $cached, false );
		}
		return (string) $cached;
	}
}
