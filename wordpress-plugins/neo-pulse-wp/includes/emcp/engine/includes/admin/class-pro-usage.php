<?php
/**
 * Pro usage telemetry client.
 *
 * Fires fire-and-forget "a template was applied / a prompt was copied" events
 * to emcptools.com, and fetches the aggregate global usage counts (transient-
 * cached) that the templates page + dashboard display. Also keeps a small
 * this-site counter for the dashboard's "your activity" widget.
 *
 * @package EMCP_Tools
 * @since   3.4.2
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * @since 3.4.2
 */
class EMCP_Tools_Pro_Usage {

	const USAGE_ENDPOINT   = 'https://emcptools.com/api/emcp/usage';
	const COUNTS_ENDPOINT  = 'https://emcptools.com/api/emcp/usage-counts.json';
	const COUNTS_CACHE_KEY = 'emcp_tools_usage_counts';
	const LOCAL_OPTION     = 'emcp_tools_local_usage';
	const FAILURE_KEY      = 'emcp_tools_usage_counts_failed';
	const FAILURE_TTL      = 300;

	/** @return string */
	public static function usage_endpoint(): string {
		return (string) apply_filters( 'emcp_tools_usage_endpoint', self::USAGE_ENDPOINT );
	}

	/** @return string */
	public static function counts_endpoint(): string {
		return (string) apply_filters( 'emcp_tools_usage_counts_endpoint', self::COUNTS_ENDPOINT );
	}

	/**
	 * Record a usage event. Best-effort, non-blocking — never delays the UI.
	 *
	 * @param string $type     'template' | 'prompt'.
	 * @param string $slug     Item slug.
	 * @param string $category Category slug.
	 */
	public static function record( string $type, string $slug, string $category ): void {
		self::bump_local( $type );

		$headers = self::auth_headers();
		if ( null === $headers ) {
			return; // No active license, nothing to attribute the event to.
		}

		$headers['Content-Type'] = 'application/json';
		wp_remote_post(
			self::usage_endpoint(),
			array(
				'blocking' => false,
				'timeout'  => 0.5,
				'headers'  => $headers,
				'body'     => wp_json_encode(
					array(
						'contentType'  => $type,
						'slug'         => $slug,
						'categorySlug' => $category,
					)
				),
			)
		);
	}

	/**
	 * Global per-item usage counts, keyed "type:slug". Transient-cached ~1h.
	 *
	 * @return array<string,int>
	 */
	public static function get_counts(): array {
		$cached = get_transient( self::COUNTS_CACHE_KEY );
		if ( is_array( $cached ) ) {
			return $cached;
		}
		// A failed fetch is remembered for a while, so a slow or unreachable
		// endpoint does not block every screen load that reads the counts.
		if ( get_transient( self::FAILURE_KEY ) ) {
			return array();
		}

		$response = wp_remote_get(
			self::counts_endpoint(),
			array( 'timeout' => 8, 'headers' => array( 'Accept' => 'application/json' ) )
		);
		if ( is_wp_error( $response ) || 200 !== (int) wp_remote_retrieve_response_code( $response ) ) {
			set_transient( self::FAILURE_KEY, 1, self::FAILURE_TTL );
			return array();
		}

		$data = json_decode( (string) wp_remote_retrieve_body( $response ), true );
		if ( ! is_array( $data ) ) {
			$data = array();
		}
		set_transient( self::COUNTS_CACHE_KEY, $data, self::ttl() );
		return $data;
	}

	/**
	 * Cached counts only — never triggers a network fetch. Safe for hot paths
	 * like the dashboard render; returns empty until something warms the cache.
	 *
	 * @return array<string,int>
	 */
	public static function cached_counts(): array {
		$cached = get_transient( self::COUNTS_CACHE_KEY );
		return is_array( $cached ) ? $cached : array();
	}

	/**
	 * Global usage count for one item.
	 *
	 * @param string $type 'template' | 'prompt'.
	 * @param string $slug Item slug.
	 * @return int
	 */
	public static function count_for( string $type, string $slug ): int {
		$counts = self::get_counts();
		$key    = $type . ':' . $slug;
		return isset( $counts[ $key ] ) ? (int) $counts[ $key ] : 0;
	}

	/**
	 * This-site activity totals for the dashboard widget.
	 *
	 * @return array{templates:int,prompts:int}
	 */
	public static function local_summary(): array {
		$local = get_option( self::LOCAL_OPTION, array() );
		if ( ! is_array( $local ) ) {
			$local = array();
		}
		return array(
			'templates' => isset( $local['template'] ) ? (int) $local['template'] : 0,
			'prompts'   => isset( $local['prompt'] ) ? (int) $local['prompt'] : 0,
		);
	}

	/** Clear the cached counts (e.g. on library sync). */
	public static function flush_counts(): void {
		if ( function_exists( 'delete_transient' ) ) {
			delete_transient( self::COUNTS_CACHE_KEY );
			delete_transient( self::FAILURE_KEY );
		}
	}

	/**
	 * @param string $type 'template' | 'prompt'.
	 */
	private static function bump_local( string $type ): void {
		$local = get_option( self::LOCAL_OPTION, array() );
		if ( ! is_array( $local ) ) {
			$local = array();
		}
		$local[ $type ] = ( isset( $local[ $type ] ) ? (int) $local[ $type ] : 0 ) + 1;
		update_option( self::LOCAL_OPTION, $local );
	}

	/** @return int */
	private static function ttl(): int {
		return defined( 'HOUR_IN_SECONDS' ) ? HOUR_IN_SECONDS : 3600;
	}

	/**
	 * Build the license auth headers, mirroring the templates fetch. Returns
	 * null when there's no active license.
	 *
	 * @return array<string,string>|null
	 */
	private static function auth_headers(): ?array {
		if ( ! function_exists( 'emcp_tools_fs' ) ) {
			return null;
		}
		$license = emcp_tools_fs()->_get_license();
		if ( ! $license || empty( $license->secret_key ) || empty( $license->id ) ) {
			return null;
		}
		return array(
			'Authorization'         => 'Bearer ' . $license->secret_key,
			'X-EMCP-License-Id'     => (string) $license->id,
			'X-EMCP-Site'           => home_url(),
			'X-EMCP-Plugin-Version' => defined( 'EMCP_TOOLS_VERSION' ) ? EMCP_TOOLS_VERSION : '',
		);
	}
}
