<?php
/**
 * Private data paths for neo-pulse-data JSON and dumps.
 *
 * @package Neo_Pulse_App
 */

defined( 'ABSPATH' ) || exit;

class Neo_Pulse_App_Data_Paths {

	/**
	 * True when a failed migration pinned this request to the legacy uploads
	 * folder. Set only by Neo_Pulse_App_Data_Migration, which also surfaces a
	 * visible admin error; reads keep working from the old folder until the
	 * host issue is fixed.
	 *
	 * @var bool
	 */
	private static $use_legacy_root = false;

	public static function root(): string {
		$dir = self::configured_root();
		if ( ! is_dir( $dir ) ) {
			wp_mkdir_p( $dir );
			if ( ! file_exists( $dir . '/index.php' ) ) {
				file_put_contents( $dir . '/index.php', '<?php // silence' );
			}
		}
		return $dir;
	}

	/**
	 * The one root contract: NEO_PULSE_DATA_DIR (constant, then env) wins,
	 * otherwise a sibling folder above the web root. Never the uploads dir.
	 */
	private static function configured_root(): string {
		if ( self::$use_legacy_root ) {
			return self::legacy_root();
		}
		if ( defined( 'NEO_PULSE_DATA_DIR' ) && is_string( NEO_PULSE_DATA_DIR ) && NEO_PULSE_DATA_DIR !== '' ) {
			return rtrim( str_replace( '\\', '/', NEO_PULSE_DATA_DIR ), '/' );
		}
		$from_env = getenv( 'NEO_PULSE_DATA_DIR' );
		if ( is_string( $from_env ) && $from_env !== '' ) {
			return rtrim( str_replace( '\\', '/', $from_env ), '/' );
		}
		return rtrim( str_replace( '\\', '/', dirname( ABSPATH ) ), '/' ) . '/neo-pulse-data';
	}

	/**
	 * Pre-migration home under the uploads dir. Migration source only; new
	 * reads never resolve here (see configured_root()).
	 */
	public static function legacy_root(): string {
		$upload = wp_upload_dir();
		return rtrim( trailingslashit( $upload['basedir'] ), '/' ) . '/neo-pulse-data';
	}

	public static function use_legacy_root_for_request(): void {
		self::$use_legacy_root = true;
	}

	public static function subdir( string $name ): string {
		$name  = str_replace( '\\', '/', trim( $name, '/' ) );
		$parts = array_values(
			array_filter(
				array_map( 'sanitize_file_name', explode( '/', $name ) ),
				static function ( $part ) {
					return is_string( $part ) && $part !== '';
				}
			)
		);
		$dir   = self::root();
		foreach ( $parts as $part ) {
			$dir .= '/' . $part;
		}
		if ( ! is_dir( $dir ) ) {
			wp_mkdir_p( $dir );
			if ( ! file_exists( $dir . '/index.php' ) ) {
				file_put_contents( $dir . '/index.php', '<?php // silence' );
			}
		}
		return $dir;
	}

	/**
	 * Resolve a stored relative path to a readable absolute file (legacy flat dirs included).
	 */
	public static function resolve_readable_abs( string $rel ): ?string {
		foreach ( self::rel_abs_candidates( $rel ) as $abs ) {
			if ( is_readable( $abs ) ) {
				return $abs;
			}
		}
		return null;
	}

	/**
	 * @return string[]
	 */
	public static function rel_abs_candidates( string $rel ): array {
		$rel = ltrim( str_replace( '\\', '/', $rel ), '/' );
		if ( $rel === '' ) {
			return array();
		}
		$paths   = array( self::root() . '/' . $rel );
		$legacy  = self::legacy_rel_abs( $rel );
		if ( $legacy !== null ) {
			$paths[] = $legacy;
		}
		return array_values( array_unique( $paths ) );
	}

	private static function legacy_rel_abs( string $rel ): ?string {
		if ( preg_match( '#^tasks/teams/(\d+)/(.+)$#', $rel, $m ) ) {
			return self::root() . '/tasksteams' . $m[1] . '/' . $m[2];
		}
		return null;
	}

	public static function file( string $subdir, string $filename ): string {
		return self::subdir( $subdir ) . '/' . sanitize_file_name( $filename );
	}

	public static function sites_path(): string {
		return self::root() . '/sites.json';
	}

	public static function manager_settings_path(): string {
		return self::root() . '/manager-settings.json';
	}

	public static function active_site_path(): string {
		return self::root() . '/active-site-id.json';
	}

	public static function ga_service_account_path(): string {
		return self::root() . '/ga-service-account.json';
	}

	public static function gsc_service_account_path(): string {
		return self::root() . '/gsc-service-account.json';
	}

	public static function gmb_oauth_config_path(): string {
		return self::root() . '/gmb-oauth.json';
	}

	public static function gmb_tokens_path(): string {
		return self::root() . '/gmb-tokens.json';
	}

	public static function google_mcp_tokens_path(): string {
		return self::root() . '/google-mcp-tokens.json';
	}

	public static function google_ads_oauth_config_path(): string {
		return self::root() . '/google-ads-oauth.json';
	}

	public static function google_ads_tokens_path(): string {
		return self::root() . '/google-ads-tokens.json';
	}

	public static function google_ads_api_path(): string {
		return self::root() . '/google-ads-api.json';
	}

	public static function gmb_schedule_queue_path(): string {
		return self::root() . '/gmb-schedule-queue.json';
	}

	public static function vertical_benchmarks_dir(): string {
		return self::subdir( 'vertical-benchmarks' );
	}

	public static function vertical_benchmark_classifications_path(): string {
		return self::vertical_benchmarks_dir() . '/classifications.json';
	}

	public static function vertical_benchmark_export_path(): string {
		return self::vertical_benchmarks_dir() . '/latest-export.json';
	}

	public static function knowledge_model_jobs_dir(): string {
		return self::subdir( 'knowledge-model-jobs' );
	}

	public static function knowledge_model_job_path( string $job_id ): string {
		$safe = preg_replace( '/[^a-zA-Z0-9-]/', '', $job_id );
		return self::knowledge_model_jobs_dir() . '/' . $safe . '.json';
	}

	public static function task_execution_progress_path( int $team_id, int $execution_id ): string {
		return self::file( 'teams/' . (string) $team_id . '/executions', (string) $execution_id . '.json' );
	}
}
