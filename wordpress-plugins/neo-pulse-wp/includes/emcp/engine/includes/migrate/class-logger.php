<?php
/**
 * Minimal activity logger for the Backup & Migrate engine.
 *
 * Phase 1 keeps no logs table (the design folds progress into the job's
 * `current_step`); this shim satisfies the ported engine's `EMCP_Tools_Logger::*`
 * calls by writing to the PHP error log when WP_DEBUG is on. A richer log view
 * can back this later without touching callers.
 *
 * @package EMCP_Tools
 * @since   3.12.0
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * @since 3.12.0
 */
class EMCP_Tools_Logger {

	public static function debug( $context, $message, $data = array() ) {
		self::log( 'debug', $context, $message, $data );
	}

	public static function info( $context, $message, $data = array() ) {
		self::log( 'info', $context, $message, $data );
	}

	public static function warning( $context, $message, $data = array() ) {
		self::log( 'warning', $context, $message, $data );
	}

	public static function error( $context, $message, $data = array() ) {
		self::log( 'error', $context, $message, $data );
	}

	/**
	 * @param string $level   Level.
	 * @param string $context Context tag.
	 * @param string $message Message.
	 * @param array  $data    Extra data.
	 */
	public static function log( $level, $context, $message, $data = array() ) {
		if ( ! ( defined( 'WP_DEBUG' ) && WP_DEBUG ) ) {
			return;
		}
		$suffix = empty( $data ) ? '' : ' ' . wp_json_encode( $data );
		// phpcs:ignore WordPress.PHP.DevelopmentFunctions.error_log_error_log
		error_log( sprintf( '[EMCP Migrate][%s][%s] %s%s', $level, $context, $message, $suffix ) );
	}

	public static function is_debug() {
		return defined( 'WP_DEBUG' ) && WP_DEBUG;
	}

	public static function file_debug( $context, $message ) {
		self::log( 'debug', $context, $message );
	}

	// No-op stubs (no logs table in Phase 1).
	public static function get_logs( $args = array() ) {
		return array();
	}
	public static function get_count( $args = array() ) {
		return 0;
	}
	public static function purge( $days = 30 ) {
		return 0;
	}
	public static function clear_all() {
		return true;
	}
}
