<?php
/**
 * Source-side migration engine: push a local .emcp to a paired live connector.
 *
 * Builds/locates the .emcp (Phase 1 engine), then streams it to the connector's
 * `receive-packet` route in adaptive, HMAC-signed, base64-encoded packets with
 * offset-based resume, and finally triggers the remote restore. Each packet is
 * base64-encoded because the archive carries raw SQL + PHP that a WAF on the
 * destination would otherwise block (the same lesson as the browser uploader).
 *
 * @package EMCP_Tools
 * @since   3.13.0
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Migration engine (source side).
 *
 * @since 3.13.0
 */
class EMCP_Tools_Migration_Engine {

	/** The connector's REST namespace (kept in sync with the connector plugin). */
	const REST_NS = 'emcp-connector/v1';

	/** Cap on the raw packet size (server-to-server; no browser memory limit). */
	const PACKET_CAP = 4194304; // 4 MB.

	/** Retries per packet before giving up. */
	const MAX_RETRIES = 4;

	/**
	 * Raw packet size for a destination.
	 *
	 * Base64 inflates ~33%, so target ~60% of the destination's reported upload
	 * limit and cap the raw packet at 4 MB. Pure + unit-tested.
	 *
	 * @param int $dest_max Destination wp_max_upload_size (bytes; 0 = unknown).
	 * @return int
	 */
	public static function packet_size( int $dest_max ): int {
		$safe = $dest_max > 0 ? (int) ( $dest_max * 0.6 ) : self::PACKET_CAP;
		$size = min( self::PACKET_CAP, $safe );
		return (int) max( min( 256 * 1024, $safe ), $size );
	}

	/**
	 * Plan contiguous packet ranges covering a file. Pure + unit-tested.
	 *
	 * @param int $file_size   Total bytes.
	 * @param int $packet_size Max bytes per packet.
	 * @return array List of ['offset'=>int,'length'=>int].
	 */
	public static function plan_packets( int $file_size, int $packet_size ): array {
		$packet_size = max( 1, $packet_size );
		$plan        = array();
		for ( $offset = 0; $offset < $file_size; $offset += $packet_size ) {
			$plan[] = array(
				'offset' => $offset,
				'length' => (int) min( $packet_size, $file_size - $offset ),
			);
		}
		return $plan;
	}

	/**
	 * Stable transfer id from a backup's identity (name + size + mtime).
	 *
	 * @param string $name  File basename.
	 * @param int    $size  Bytes.
	 * @param int    $mtime Modified time.
	 * @return string
	 */
	public static function upload_id( string $name, int $size, int $mtime ): string {
		return hash( 'sha256', $name . '|' . $size . '|' . $mtime );
	}

	/**
	 * Push a slice of a .emcp to a paired target for up to $max_seconds, resuming
	 * from $start_offset. Transfer is offset-based and the connector reports
	 * next_offset, so this can be called repeatedly (browser-driven) to keep each
	 * request under a host's per-request time cap (mod_fcgid FcgidBusyTimeout,
	 * nginx proxy_read_timeout, php-fpm request_terminate_timeout) that
	 * set_time_limit(0) can't lift.
	 *
	 * @param int           $target_id    Paired target id.
	 * @param string        $emcp_path    Absolute path to the .emcp archive.
	 * @param int           $start_offset Byte offset to resume from.
	 * @param int           $max_seconds  Time budget for this call (0 = run to completion).
	 * @param callable|null $progress     fn(int $sent, int $total): void.
	 * @return array|WP_Error {done, offset, total, upload_id} or error.
	 */
	public static function push_window( $target_id, $emcp_path, $start_offset = 0, $max_seconds = 0, $progress = null ) {
		if ( ! is_readable( $emcp_path ) ) {
			return new WP_Error( 'emcp_mig_file', __( 'Backup file not found.', 'emcp-tools' ) );
		}
		$target = EMCP_Tools_Migrate_Targets::get( $target_id );
		if ( ! $target ) {
			return new WP_Error( 'emcp_mig_target', __( 'Migration target not found.', 'emcp-tools' ) );
		}

		$secret    = $target->secret;
		$base      = untrailingslashit( $target->live_url ) . '/wp-json/' . self::REST_NS;
		$endpoint  = $base . '/receive-packet';
		$dest_max  = isset( $target->caps['max_upload_size'] ) ? (int) $target->caps['max_upload_size'] : 0;
		$psize     = self::packet_size( $dest_max );

		$total     = (int) filesize( $emcp_path );
		$upload_id = self::upload_id( basename( $emcp_path ), $total, (int) filemtime( $emcp_path ) );

		// phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_fopen
		$fh = fopen( $emcp_path, 'rb' );
		if ( ! $fh ) {
			return new WP_Error( 'emcp_mig_open', __( 'Cannot open the backup file.', 'emcp-tools' ) );
		}

		$offset     = max( 0, min( (int) $start_offset, $total ) );
		$retries    = 0;
		$start_time = microtime( true );
		$budget     = $max_seconds > 0 ? (float) $max_seconds : 0.0; // 0 = unlimited.
		while ( $offset < $total ) {
			$length = (int) min( $psize, $total - $offset );
			fseek( $fh, $offset );
			// phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_fread
			$raw = fread( $fh, $length );
			if ( false === $raw || '' === $raw ) {
				fclose( $fh );
				return new WP_Error( 'emcp_mig_read', __( 'Failed to read the backup file.', 'emcp-tools' ) );
			}

			$sig  = EMCP_Tools_Migrate_HMAC::sign(
				EMCP_Tools_Migrate_HMAC::packet_canonical( $upload_id, $offset, $total, $raw ),
				$secret
			);
			$resp = wp_remote_post( $endpoint, array(
				'timeout' => 60,
				'headers' => array(
					'Content-Type'  => 'text/plain',
					'X-EMCP-Upload' => $upload_id,
					'X-EMCP-Offset' => (string) $offset,
					'X-EMCP-Total'  => (string) $total,
					'X-EMCP-Sig'    => $sig,
				),
				'body'    => base64_encode( $raw ),
			) );

			if ( is_wp_error( $resp ) ) {
				if ( ++$retries > self::MAX_RETRIES ) {
					fclose( $fh );
					return new WP_Error( 'emcp_mig_net', $resp->get_error_message() );
				}
				continue; // retry same offset.
			}

			$code = (int) wp_remote_retrieve_response_code( $resp );
			$data = json_decode( wp_remote_retrieve_body( $resp ), true );

			// Offset mismatch / recoverable error: resync to the connector's next_offset.
			if ( 409 === $code && isset( $data['next_offset'] ) ) {
				$offset  = (int) $data['next_offset'];
				$retries = 0;
				continue;
			}
			if ( 200 !== $code || ! is_array( $data ) || empty( $data['success'] ) ) {
				if ( ++$retries > self::MAX_RETRIES ) {
					fclose( $fh );
					return new WP_Error(
						'emcp_mig_reject',
						sprintf( /* translators: 1: HTTP code */ __( 'Destination rejected a packet (HTTP %d).', 'emcp-tools' ), $code )
					);
				}
				continue;
			}

			$next    = isset( $data['data']['next_offset'] ) ? (int) $data['data']['next_offset'] : ( $offset + $length );
			$offset  = $next;
			$retries = 0;
			if ( is_callable( $progress ) ) {
				call_user_func( $progress, $offset, $total );
			}

			// Yield after a full time window so the browser can re-drive the next
			// slice, keeping each request under the host's per-request cap.
			if ( $budget > 0.0 && ( microtime( true ) - $start_time ) >= $budget ) {
				fclose( $fh );
				return array( 'done' => false, 'offset' => $offset, 'total' => $total, 'upload_id' => $upload_id );
			}
		}

		fclose( $fh );
		return array( 'done' => true, 'offset' => $total, 'total' => $total, 'upload_id' => $upload_id );
	}

	/**
	 * Push a whole .emcp to a target in one call (used by the MCP tools, which
	 * aren't bounded by a browser request). Delegates to push_window with no time
	 * limit.
	 *
	 * @param int           $target_id Paired target id.
	 * @param string        $emcp_path Absolute path to the .emcp archive.
	 * @param callable|null $progress  fn(int $sent, int $total): void.
	 * @return array|WP_Error {upload_id, total} on success.
	 */
	public static function push( $target_id, $emcp_path, $progress = null ) {
		$r = self::push_window( $target_id, $emcp_path, 0, 0, $progress );
		if ( is_wp_error( $r ) ) {
			return $r;
		}
		return array( 'upload_id' => $r['upload_id'], 'total' => $r['total'] );
	}

	/**
	 * Sign + send a control call (restore/status) to a target.
	 *
	 * @param object $target   Target row (with ->secret, ->live_url).
	 * @param string $action   'restore' | 'status'.
	 * @param array  $body     JSON body (for POST actions).
	 * @param bool   $blocking Wait for the response?
	 * @return array|WP_Error Decoded response, or error.
	 */
	private static function control( $target, $action, $body = array(), $blocking = true ) {
		$json = ( 'status' === $action ) ? '' : wp_json_encode( $body );
		$ts   = time();
		$sig  = EMCP_Tools_Migrate_HMAC::sign(
			EMCP_Tools_Migrate_HMAC::control_canonical( $action, $ts, $json ),
			$target->secret
		);
		$url  = untrailingslashit( $target->live_url ) . '/wp-json/' . self::REST_NS . '/' . $action;
		$args = array(
			'timeout'  => $blocking ? 30 : 1,
			'blocking' => $blocking,
			'headers'  => array(
				'Content-Type' => 'application/json',
				'X-EMCP-Ts'    => (string) $ts,
				'X-EMCP-Sig'   => $sig,
			),
		);
		if ( 'status' === $action ) {
			$resp = wp_remote_get( $url, $args );
		} else {
			$args['body'] = $json;
			$resp         = wp_remote_post( $url, $args );
		}
		if ( is_wp_error( $resp ) ) {
			return $resp;
		}
		return json_decode( wp_remote_retrieve_body( $resp ), true );
	}

	/**
	 * Trigger the remote restore of an already-pushed upload (non-blocking).
	 *
	 * @param int    $target_id Target id.
	 * @param string $upload_id Transfer id from push().
	 * @return true|WP_Error
	 */
	public static function trigger_restore( $target_id, $upload_id ) {
		$target = EMCP_Tools_Migrate_Targets::get( $target_id );
		if ( ! $target ) {
			return new WP_Error( 'emcp_mig_target', __( 'Migration target not found.', 'emcp-tools' ) );
		}
		$resp = self::control( $target, 'restore', array( 'upload_id' => $upload_id ), false );
		if ( is_wp_error( $resp ) ) {
			return $resp;
		}
		return true;
	}

	/**
	 * Poll the remote restore status.
	 *
	 * @param int $target_id Target id.
	 * @return array|WP_Error {status, phase, percent, message}.
	 */
	public static function poll_status( $target_id ) {
		$target = EMCP_Tools_Migrate_Targets::get( $target_id );
		if ( ! $target ) {
			return new WP_Error( 'emcp_mig_target', __( 'Migration target not found.', 'emcp-tools' ) );
		}
		$resp = self::control( $target, 'status', array(), true );
		if ( is_wp_error( $resp ) ) {
			// Connector unreachable. After a full migration this is EXPECTED and
			// benign: the database import swaps in the source site and deactivates
			// the connector, so its REST route vanishes right as the restore
			// finishes. Signal 'offline' so the UI can report completion instead of
			// a scary "no route" error.
			return array( 'status' => 'offline', 'message' => $resp->get_error_message() );
		}
		// A 404 rest_no_route means the connector plugin is no longer active (its
		// route is gone) — same "site was replaced, restore finished" situation.
		if ( is_array( $resp ) && isset( $resp['code'] ) && 'rest_no_route' === $resp['code'] ) {
			return array( 'status' => 'offline', 'message' => __( 'The connector is offline (the live site was replaced).', 'emcp-tools' ) );
		}
		return is_array( $resp ) ? $resp : array( 'status' => 'unknown' );
	}

	/**
	 * Ask the connector to clean itself up — unpair, purge transfer state,
	 * deactivate, and (when $remove) delete the connector plugin from the live
	 * site. Signed with the pairing secret, so only the paired source can do it.
	 *
	 * @param int  $target_id Target id.
	 * @param bool $remove    Also delete the connector plugin (not just deactivate).
	 * @return array|WP_Error {cleaned, deactivated, deleted} or error.
	 */
	public static function cleanup( $target_id, $remove = true ) {
		$target = EMCP_Tools_Migrate_Targets::get( $target_id );
		if ( ! $target ) {
			return new WP_Error( 'emcp_mig_target', __( 'Migration target not found.', 'emcp-tools' ) );
		}
		$resp = self::control( $target, 'cleanup', array( 'remove' => (bool) $remove ), true );
		if ( is_wp_error( $resp ) ) {
			return $resp;
		}
		return is_array( $resp ) ? $resp : array( 'cleaned' => false );
	}
}
