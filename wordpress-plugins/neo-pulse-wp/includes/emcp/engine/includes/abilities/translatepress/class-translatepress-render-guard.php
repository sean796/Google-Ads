<?php
/**
 * Render guard for EMCP's TranslatePress page renders (3.19.0). TranslatePress translates new
 * strings automatically inside any render in the translation language when an engine is
 * switched on, and it builds the engine before EMCP boots, so the setting cannot be switched
 * off for one request. A request carrying X-EMCP-Render: 1 instead gets three layers:
 *
 *  1. trp_machine_translator_is_available answers false;
 *  2. pre_http_request refuses every translation engine host in process, so even the
 *     supported-languages check on a cold cache never leaves the site;
 *  3. pre_update_option_trp_db_stored_data keeps the stored value, so that refused check is
 *     never cached as "no languages supported";
 *
 * and the answer carries X-EMCP-Render-Guard: 1, which the renderer requires. The guard reads
 * nothing stored: a request either carries the header and is guarded or is an ordinary page
 * view. Anyone may send the header; it only switches automatic translation off for their own
 * page view. Runtime file (Pro loader FILES), because the rendered request is a front-end view.
 *
 * @package EMCP_Tools
 * @since   3.19.0
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/** @since 3.19.0 */
final class EMCP_Tools_TranslatePress_Render_Guard {

	const HEADER = 'X-EMCP-Render';
	const ANSWER = 'X-EMCP-Render-Guard';

	/** Hosts of the engines TranslatePress free and its AI service call. */
	const ENGINE_HOSTS = array( 'translation.googleapis.com', 'mtapi.translatepress.com', 'api.deepl.com', 'api-free.deepl.com' );

	/** @var callable|null Test seam for header(). */
	private static $emitter = null;

	/** @var string[]|null */
	private static $hosts = null;

	public static function use_emitter( ?callable $emitter ): void {
		self::$emitter = $emitter;
	}

	/** Whether this request asked for the guard. */
	public static function requested(): bool {
		return isset( $_SERVER['HTTP_X_EMCP_RENDER'] ) && '1' === (string) $_SERVER['HTTP_X_EMCP_RENDER']; // phpcs:ignore WordPress.Security.ValidatedSanitizedInput
	}

	public static function boot(): void {
		if ( ! self::requested() || has_filter( 'send_headers', array( __CLASS__, 'send_header' ) ) ) {
			return;
		}
		self::$hosts = null;
		add_filter( 'trp_machine_translator_is_available', array( __CLASS__, 'unavailable' ), PHP_INT_MAX );
		add_filter( 'pre_http_request', array( __CLASS__, 'block_engine' ), PHP_INT_MAX, 3 );
		add_filter( 'pre_update_option_trp_db_stored_data', array( __CLASS__, 'keep_stored' ), PHP_INT_MAX, 2 );
		add_action( 'send_headers', array( __CLASS__, 'send_header' ) );
	}

	public static function unavailable(): bool {
		return false;
	}

	/** @return string[] */
	private static function hosts(): array {
		if ( null === self::$hosts ) {
			/**
			 * Translation engine hosts an EMCP render may never call.
			 *
			 * @param string[] $hosts Host names.
			 */
			self::$hosts = array_map( 'strtolower', array_map( 'strval', (array) apply_filters( 'emcp_tools_translatepress_engine_hosts', self::ENGINE_HOSTS ) ) );
		}
		return self::$hosts;
	}

	/**
	 * @param false|array|WP_Error $pre  Short-circuit value.
	 * @param array                $args Request arguments.
	 * @param string               $url  Request URL.
	 * @return false|array|WP_Error
	 */
	public static function block_engine( $pre, $args, $url ) {
		$host = strtolower( (string) wp_parse_url( (string) $url, PHP_URL_HOST ) );
		if ( '' !== $host && in_array( $host, self::hosts(), true ) ) {
			// A plain message: TranslatePress hooks gettext during the render, and translating text
			// here re-enters its engine check until the render runs out of memory.
			return new WP_Error( 'emcp_render_guard', 'EMCP render: automatic translation is switched off for this request.' );
		}
		return $pre;
	}

	/**
	 * @param mixed $value     New value.
	 * @param mixed $old_value Stored value.
	 * @return mixed
	 */
	public static function keep_stored( $value, $old_value ) {
		return $old_value;
	}

	public static function send_header(): void {
		$line = self::ANSWER . ': 1';
		if ( self::$emitter ) {
			( self::$emitter )( $line );
			return;
		}
		if ( ! headers_sent() ) {
			header( $line );
		}
	}
}
