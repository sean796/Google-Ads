<?php
/**
 * Design a new page with Novamira abilities (OpenRouter agent harness) on wp-cron.
 *
 * @package Neo_Pulse_Wp
 */

defined( 'ABSPATH' ) || exit;

class Neo_Pulse_Wp_Backend_Assist_Novamira_Page {

	const DESIGN_CRON_HOOK = 'neo_pulse_novamira_page_design';

	const JOB_OPTION_PREFIX = 'neo_pulse_novamira_design_';

	/** Seconds the tool call blocks waiting for the cron job before returning a queued status. */
	const POLL_WAIT_SECONDS = 20;

	/** A running job older than this is treated as stale and re-queued. */
	const STALE_JOB_SECONDS = 600;

	/**
	 * Backend Assist tool: design the page (queued on wp-cron unless sync / WP-CLI).
	 *
	 * Calling the tool again for the same post while a job is running polls that job.
	 *
	 * @param array<string,mixed> $params
	 * @return array<string,mixed>
	 */
	public static function tool_design_page_with_novamira( array $params ): array {
		$post_id = absint( $params['post_id'] ?? 0 );
		if ( $post_id < 1 ) {
			return array( 'success' => false, 'error' => __( 'post_id is required.', 'neo-pulse-wp' ) );
		}
		$is_cli = defined( 'WP_CLI' ) && WP_CLI;
		if ( ! $is_cli ) {
			$permission = self::check_design_permission( $post_id );
			if ( is_wp_error( $permission ) ) {
				return array( 'success' => false, 'post_id' => $post_id, 'error' => $permission->get_error_message() );
			}
		}
		if ( ! empty( $params['sync'] ) || $is_cli ) {
			return self::design( $params );
		}

		$job_key = self::JOB_OPTION_PREFIX . $post_id;
		$job     = self::read_job( $job_key );

		// A job for this page is already queued/running: poll it instead of starting another.
		if ( is_array( $job ) && ( $job['state'] ?? '' ) === 'running' && ( time() - (int) ( $job['started'] ?? 0 ) ) < self::STALE_JOB_SECONDS ) {
			if ( (int) ( $job['user_id'] ?? 0 ) !== get_current_user_id() ) {
				return array(
					'success' => false,
					'post_id' => $post_id,
					'error'   => __( 'Another user is already designing this page. Try again in a few minutes.', 'neo-pulse-wp' ),
				);
			}
			return self::poll_job( $job_key, $post_id );
		}
		if ( is_array( $job ) && in_array( (string) ( $job['state'] ?? '' ), array( 'done', 'error' ), true ) && (int) ( $job['user_id'] ?? 0 ) === get_current_user_id() && empty( $params['elementor_sections'] ) ) {
			delete_option( $job_key );
			unset( $job['params'], $job['user_id'] );
			return $job;
		}

		update_option(
			$job_key,
			array(
				'state'   => 'running',
				'started' => time(),
				'post_id' => $post_id,
				'user_id' => get_current_user_id(),
				'params'  => self::persistable_params( $params ),
			),
			false
		);
		$queued = self::queue_design_cron( $post_id, $job_key );
		if ( is_wp_error( $queued ) ) {
			delete_option( $job_key );
			return array( 'success' => false, 'post_id' => $post_id, 'error' => $queued->get_error_message() );
		}
		return self::poll_job( $job_key, $post_id );
	}

	/**
	 * @return true|WP_Error
	 */
	private static function check_design_permission( int $post_id ) {
		$post = get_post( $post_id );
		if ( ! $post instanceof WP_Post ) {
			return new WP_Error( 'neo-pulse_novamira_design', __( 'Post not found.', 'neo-pulse-wp' ) );
		}
		if ( ! current_user_can( 'edit_post', $post_id ) ) {
			return new WP_Error( 'neo-pulse_novamira_design', __( 'You do not have permission to edit this page.', 'neo-pulse-wp' ) );
		}
		// The design harness publishes the page.
		$type_obj = get_post_type_object( $post->post_type );
		$publish  = $type_obj ? $type_obj->cap->publish_posts : 'publish_pages';
		if ( ! current_user_can( $publish ) ) {
			return new WP_Error( 'neo-pulse_novamira_design', __( 'You do not have permission to publish this page.', 'neo-pulse-wp' ) );
		}
		return true;
	}

	/**
	 * Keep only the params the design harness reads (stored in the job option for the cron run).
	 *
	 * @param array<string,mixed> $params
	 * @return array<string,mixed>
	 */
	private static function persistable_params( array $params ): array {
		$out = array( 'post_id' => absint( $params['post_id'] ?? 0 ) );
		if ( ! empty( $params['elementor_sections'] ) && is_array( $params['elementor_sections'] ) ) {
			$out['elementor_sections'] = Neo_Pulse_Wp_Backend_Assist_Tools_Elementor_Sections::normalize_sections( $params['elementor_sections'] );
		}
		if ( isset( $params['content_mode'] ) ) {
			$out['content_mode'] = sanitize_key( (string) $params['content_mode'] );
		}
		return $out;
	}

	/**
	 * Read the job option bypassing a stale object cache (the cron runs in another request).
	 *
	 * @return array<string,mixed>|null
	 */
	private static function read_job( string $job_key ): ?array {
		wp_cache_delete( $job_key, 'options' );
		$job = get_option( $job_key );
		return is_array( $job ) ? $job : null;
	}

	/**
	 * Wait briefly for the cron job; return its result or a queued status the UI can re-poll.
	 *
	 * @return array<string,mixed>
	 */
	private static function poll_job( string $job_key, int $post_id ): array {
		$deadline = time() + self::POLL_WAIT_SECONDS;
		while ( time() < $deadline ) {
			sleep( 2 );
			$job = self::read_job( $job_key );
			if ( $job === null ) {
				continue;
			}
			$state = (string) ( $job['state'] ?? '' );
			if ( $state === 'done' || $state === 'error' ) {
				delete_option( $job_key );
				unset( $job['params'], $job['user_id'] );
				return $job;
			}
		}
		return array(
			'success' => false,
			'post_id' => $post_id,
			'queued'  => true,
			'state'   => 'running',
			'error'   => __( 'Novamira design is still running in the background. Run this step again in about a minute to check the result.', 'neo-pulse-wp' ),
		);
	}

	/**
	 * @param array<string,mixed> $params
	 * @return array<string,mixed>
	 */
	public static function design( array $params ): array {
		$post_id = absint( $params['post_id'] ?? 0 );
		if ( $post_id < 1 ) {
			return array( 'success' => false, 'error' => __( 'post_id is required.', 'neo-pulse-wp' ) );
		}

		if ( function_exists( 'set_time_limit' ) ) {
			@set_time_limit( 300 );
		}
		Neo_Pulse_Wp_OpenRouter::maybe_extend_time_limit();

		$result = Neo_Pulse_Wp_Backend_Assist_Novamira_Page_Design_Harness::run( $post_id, $params );
		if ( is_wp_error( $result ) ) {
			return array(
				'success' => false,
				'post_id' => $post_id,
				'error'   => $result->get_error_message(),
			);
		}
		return $result;
	}

	/**
	 * @param array<string,mixed> $input
	 * @return array<string,mixed>|WP_Error
	 */
	public static function run_ability( string $name, array $input ) {
		$ability = wp_get_ability( $name );
		if ( ! is_object( $ability ) || ! method_exists( $ability, 'execute' ) ) {
			return new WP_Error(
				'neo-pulse_novamira',
				sprintf(
					/* translators: %s: ability name */
					__( 'Novamira ability %s is missing.', 'neo-pulse-wp' ),
					$name
				)
			);
		}
		$result = $input === array() ? $ability->execute() : $ability->execute( $input );
		if ( is_wp_error( $result ) ) {
			return $result;
		}
		if ( ! is_array( $result ) ) {
			return new WP_Error( 'neo-pulse_novamira', __( 'Novamira ability returned an invalid payload.', 'neo-pulse-wp' ) );
		}
		return $result;
	}

	public static function register_cron(): void {
		add_action( self::DESIGN_CRON_HOOK, array( __CLASS__, 'run_design_cron' ), 10, 2 );
	}

	/**
	 * Queue Novamira design on wp-cron (avoids HTTP gateway timeouts on long Elementor writes).
	 *
	 * @return true|WP_Error
	 */
	public static function queue_design_cron( int $post_id, string $job_option_key ) {
		if ( $post_id < 1 || $job_option_key === '' ) {
			return new WP_Error( 'neo-pulse_novamira_queue', __( 'Invalid design queue parameters.', 'neo-pulse-wp' ) );
		}
		wp_clear_scheduled_hook( self::DESIGN_CRON_HOOK, array( $post_id, $job_option_key ) );
		$scheduled = wp_schedule_single_event( time(), self::DESIGN_CRON_HOOK, array( $post_id, $job_option_key ) );
		if ( $scheduled === false ) {
			return new WP_Error( 'neo-pulse_novamira_queue', __( 'Could not schedule Novamira design.', 'neo-pulse-wp' ) );
		}
		// Kick wp-cron now (works with or without ALTERNATE_WP_CRON).
		$cron_url = add_query_arg( 'doing_wp_cron', rawurlencode( (string) microtime( true ) ), site_url( 'wp-cron.php' ) );
		wp_remote_get(
			$cron_url,
			array(
				'timeout'   => 0.01,
				'blocking'  => false,
				'sslverify' => apply_filters( 'https_local_ssl_verify', false ),
			)
		);
		return true;
	}

	/**
	 * Cron callback. Runs as the user who requested the design, with the params they sent.
	 *
	 * @param mixed $post_id        Post ID.
	 * @param mixed $job_option_key Job option name.
	 */
	public static function run_design_cron( $post_id, $job_option_key ): void {
		$post_id        = absint( $post_id );
		$job_option_key = is_string( $job_option_key ) ? $job_option_key : '';
		if ( $post_id < 1 || $job_option_key !== self::JOB_OPTION_PREFIX . $post_id ) {
			return;
		}
		$job = self::read_job( $job_option_key );
		if ( $job === null || ( $job['state'] ?? '' ) !== 'running' ) {
			return;
		}
		$user_id = absint( $job['user_id'] ?? 0 );
		$params  = isset( $job['params'] ) && is_array( $job['params'] ) ? $job['params'] : array();
		$params['post_id'] = $post_id;

		if ( function_exists( 'set_time_limit' ) ) {
			@set_time_limit( 300 );
		}
		Neo_Pulse_Wp_OpenRouter::maybe_extend_time_limit();
		Neo_Pulse_Wp_Backend_Assist::ensure_dependencies();

		$user = $user_id > 0 ? get_userdata( $user_id ) : false;
		if ( ! $user ) {
			$result = array(
				'success' => false,
				'post_id' => $post_id,
				'error'   => __( 'The user who requested this design no longer exists.', 'neo-pulse-wp' ),
			);
		} else {
			wp_set_current_user( $user_id );
			$permission = self::check_design_permission( $post_id );
			$result     = is_wp_error( $permission )
				? array( 'success' => false, 'post_id' => $post_id, 'error' => $permission->get_error_message() )
				: self::design( $params );
		}

		$result['state'] = ! empty( $result['success'] ) ? 'done' : 'error';
		if ( defined( 'NEO_PULSE_WP_VERSION' ) ) {
			$result['plugin'] = NEO_PULSE_WP_VERSION;
		}
		$result['status']  = get_post_status( $post_id );
		$result['user_id'] = $user_id;
		update_option( $job_option_key, $result, false );
	}
}
