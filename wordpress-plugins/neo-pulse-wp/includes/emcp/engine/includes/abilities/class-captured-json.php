<?php
/**
 * Runs code that may answer with wp_send_json() (and so would end the request) in-process, and
 * hands back the JSON it sent. Used for plugin handlers written for admin-ajax (FunnelKit's
 * wp_send_json routes, Tutor LMS's course builder).
 *
 * While $fn runs, wp_doing_ajax() is true and the wp_die ajax handler throws, so wp_send_json()
 * stops at its wp_die() instead of exiting; the output is buffered and decoded. The REST server's
 * dispatch depth is put back afterwards, since a nested rest_do_request() that never returned
 * would otherwise leave it raised.
 *
 * @package EMCP_Tools
 * @since   3.19.0
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/** Thrown by the wp_die ajax handler while EMCP_Tools_Captured_Json::run() is capturing. @since 3.19.0 */
class EMCP_Tools_Captured_Json_Sent extends RuntimeException {}

/** @since 3.19.0 */
final class EMCP_Tools_Captured_Json {

	/**
	 * @param callable $fn Code that may call wp_send_json() or wp_die().
	 * @return array|WP_Error {sent: true, data: decoded JSON} when it answered, {sent: false,
	 *                        result: what $fn returned} when it returned normally, or
	 *                        WP_Error( 'unexpected_output' ) when it sent something that is not JSON.
	 */
	public static function run( callable $fn ) {
		$depth   = self::dispatch_depth();
		$level   = ob_get_level();
		$handler = static function () {
			return array( __CLASS__, 'stop_sending' );
		};
		add_filter( 'wp_doing_ajax', '__return_true', PHP_INT_MAX );
		add_filter( 'wp_die_ajax_handler', $handler, PHP_INT_MAX );
		ob_start();
		try {
			$result = $fn();
			ob_end_clean();
			return array( 'sent' => false, 'result' => $result );
		} catch ( EMCP_Tools_Captured_Json_Sent $sent ) {
			$body = (string) ob_get_clean();
			self::restore_dispatch_depth( $depth );
			$data = json_decode( $body, true );
			if ( ! is_array( $data ) ) {
				return new WP_Error( 'unexpected_output', __( 'The plugin answered with something that is not JSON.', 'emcp-tools' ), array( 'output' => substr( wp_strip_all_tags( $body ), 0, 300 ) ) );
			}
			return array( 'sent' => true, 'data' => $data );
		} finally {
			remove_filter( 'wp_doing_ajax', '__return_true', PHP_INT_MAX );
			remove_filter( 'wp_die_ajax_handler', $handler, PHP_INT_MAX );
			while ( ob_get_level() > $level ) {
				ob_end_clean();
			}
		}
	}

	/** @internal wp_die ajax handler used while capturing. */
	public static function stop_sending(): void {
		throw new EMCP_Tools_Captured_Json_Sent( 'sent' );
	}

	/** How many requests the REST server is dispatching (its protected dispatching_requests stack). */
	private static function dispatch_depth(): ?int {
		if ( ! function_exists( 'rest_get_server' ) ) {
			return null;
		}
		$server = rest_get_server();
		if ( ! property_exists( $server, 'dispatching_requests' ) ) {
			return null;
		}
		return \Closure::bind( fn() => count( (array) $this->dispatching_requests ), $server, get_class( $server ) )();
	}

	private static function restore_dispatch_depth( ?int $depth ): void {
		if ( null === $depth ) {
			return;
		}
		$server = rest_get_server();
		\Closure::bind(
			function () use ( $depth ) {
				$this->dispatching_requests = array_slice( (array) $this->dispatching_requests, 0, $depth );
			},
			$server,
			get_class( $server )
		)();
	}
}
