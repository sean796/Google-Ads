<?php
/**
 * Backend Assist — chat session storage (per-user meta) REST handlers.
 *
 * Sessions used to be JSON files under uploads/neo-pulse/sessions/{user_id}/ (publicly
 * reachable). They now live in user meta; legacy files are imported once per user and deleted.
 *
 * @package Neo_Pulse_Wp
 */

defined( 'ABSPATH' ) || exit;

class Neo_Pulse_Wp_Backend_Assist_Sessions {

	const META_KEY          = '_neo_pulse_ba_sessions';
	const MIGRATED_META_KEY = '_neo_pulse_ba_sessions_migrated';
	const MAX_SESSIONS      = 20;
	const MAX_MESSAGES      = 200;
	const MAX_CONTENT_BYTES = 20480;
	const MAX_SESSION_BYTES = 65536;

	/**
	 * Legacy uploads directory for the current user (read-only; no longer created).
	 *
	 * @deprecated Sessions are stored in user meta.
	 */
	public static function sessions_dir(): string {
		$upload = wp_upload_dir();
		return $upload['basedir'] . '/neo-pulse/sessions/' . get_current_user_id();
	}

	/**
	 * Legacy session file path (read-only; no longer written).
	 *
	 * @deprecated Sessions are stored in user meta.
	 */
	public static function session_path( string $id ): string {
		return self::sessions_dir() . '/' . sanitize_file_name( $id ) . '.json';
	}

	public static function rest_sessions_list( WP_REST_Request $request ): WP_REST_Response {
		$sessions = self::load_all();
		uasort(
			$sessions,
			static function ( $a, $b ) {
				return strcmp( (string) ( $b['updated'] ?? '' ), (string) ( $a['updated'] ?? '' ) );
			}
		);

		$out = array();
		foreach ( $sessions as $data ) {
			$out[] = array(
				'id'            => (string) ( $data['id'] ?? '' ),
				'title'         => (string) ( $data['title'] ?? '' ),
				'created'       => (string) ( $data['created'] ?? '' ),
				'updated'       => (string) ( $data['updated'] ?? '' ),
				'message_count' => isset( $data['messages'] ) && is_array( $data['messages'] ) ? count( $data['messages'] ) : 0,
			);
		}

		return new WP_REST_Response( $out, 200 );
	}

	public static function rest_session_get( WP_REST_Request $request ): WP_REST_Response {
		$id       = self::sanitize_id( $request->get_param( 'id' ) );
		$sessions = self::load_all();
		if ( $id === '' || ! isset( $sessions[ $id ] ) ) {
			return new WP_REST_Response( array( 'error' => 'Session not found.' ), 404 );
		}
		return new WP_REST_Response( $sessions[ $id ], 200 );
	}

	public static function rest_sessions_save( WP_REST_Request $request ): WP_REST_Response {
		$body     = $request->get_json_params();
		$body     = is_array( $body ) ? $body : array();
		$id       = self::sanitize_id( $body['id'] ?? '' );
		$messages = self::normalize_messages( isset( $body['messages'] ) && is_array( $body['messages'] ) ? $body['messages'] : array() );

		if ( empty( $messages ) ) {
			return new WP_REST_Response( array( 'error' => 'No messages to save.' ), 400 );
		}

		$now      = gmdate( 'c' );
		$sessions = self::load_all();
		if ( $id === '' ) {
			$id = 'sess_' . time() . '_' . wp_generate_password( 6, false );
		}
		$existing = $sessions[ $id ] ?? null;

		$first_user_msg = '';
		foreach ( $messages as $msg ) {
			if ( $msg['role'] === 'user' && $msg['content'] !== '' ) {
				$first_user_msg = $msg['content'];
				break;
			}
		}

		$sessions[ $id ] = array(
			'id'       => $id,
			'title'    => is_array( $existing ) && ! empty( $existing['title'] )
				? (string) $existing['title']
				: sanitize_text_field( wp_trim_words( $first_user_msg, 6, '...' ) ),
			'created'  => is_array( $existing ) && ! empty( $existing['created'] ) ? (string) $existing['created'] : $now,
			'updated'  => $now,
			'messages' => $messages,
		);

		self::save_all( $sessions );

		return new WP_REST_Response( array( 'id' => $id, 'title' => $sessions[ $id ]['title'] ), 200 );
	}

	public static function rest_session_delete( WP_REST_Request $request ): WP_REST_Response {
		$id       = self::sanitize_id( $request->get_param( 'id' ) );
		$sessions = self::load_all();
		if ( $id !== '' && isset( $sessions[ $id ] ) ) {
			unset( $sessions[ $id ] );
			self::save_all( $sessions );
		}
		return new WP_REST_Response( array( 'deleted' => true ), 200 );
	}

	public static function rest_sessions_clear( WP_REST_Request $request ): WP_REST_Response {
		self::load_all(); // Runs the one-time legacy import/cleanup first.
		delete_user_meta( get_current_user_id(), self::META_KEY );
		return new WP_REST_Response( array( 'cleared' => true ), 200 );
	}

	/**
	 * @param mixed $id Raw id.
	 */
	private static function sanitize_id( $id ): string {
		if ( ! is_string( $id ) ) {
			return '';
		}
		return preg_match( '/^[A-Za-z0-9_-]{1,64}$/', $id ) ? $id : '';
	}

	/**
	 * @param array<int|string, mixed> $raw Raw messages from the client.
	 * @return array<int, array<string, mixed>>
	 */
	private static function normalize_messages( array $raw ): array {
		$out = array();
		foreach ( array_values( $raw ) as $msg ) {
			if ( ! is_array( $msg ) ) {
				continue;
			}
			$role = isset( $msg['role'] ) && is_string( $msg['role'] ) ? sanitize_key( $msg['role'] ) : '';
			if ( ! in_array( $role, array( 'user', 'assistant', 'system' ), true ) ) {
				continue;
			}
			$content = isset( $msg['content'] ) && is_string( $msg['content'] ) ? $msg['content'] : '';
			$row     = array(
				'role'    => $role,
				'content' => self::truncate_bytes( $content, self::MAX_CONTENT_BYTES ),
			);
			if ( isset( $msg['card'] ) && is_array( $msg['card'] ) ) {
				$json = wp_json_encode( $msg['card'] );
				if ( is_string( $json ) && strlen( $json ) <= self::MAX_CONTENT_BYTES ) {
					$row['card'] = $msg['card'];
				} else {
					// Keep a small replayable card (and its workflow id) when the full card is too large.
					$card = array(
						'type'  => isset( $msg['card']['type'] ) && is_string( $msg['card']['type'] ) ? sanitize_key( $msg['card']['type'] ) : 'answer',
						'title' => isset( $msg['card']['title'] ) && is_string( $msg['card']['title'] ) ? self::truncate_bytes( $msg['card']['title'], 512 ) : '',
						'body'  => isset( $msg['card']['body'] ) && is_string( $msg['card']['body'] ) ? self::truncate_bytes( $msg['card']['body'], self::MAX_CONTENT_BYTES ) : '',
					);
					if ( isset( $msg['card']['workflow_id'] ) && is_string( $msg['card']['workflow_id'] ) ) {
						$card['workflow_id'] = sanitize_text_field( $msg['card']['workflow_id'] );
					}
					$row['card'] = $card;
				}
			}
			$out[] = $row;
		}
		if ( count( $out ) > self::MAX_MESSAGES ) {
			$out = array_slice( $out, -self::MAX_MESSAGES );
		}
		// Overall per-session budget: drop the oldest messages first.
		while ( count( $out ) > 1 ) {
			$json = wp_json_encode( $out );
			if ( ! is_string( $json ) || strlen( $json ) <= self::MAX_SESSION_BYTES ) {
				break;
			}
			array_shift( $out );
		}
		return $out;
	}

	private static function truncate_bytes( string $text, int $max ): string {
		if ( strlen( $text ) <= $max ) {
			return $text;
		}
		$cut = substr( $text, 0, $max );
		// Avoid ending inside a multibyte character.
		if ( function_exists( 'mb_strcut' ) ) {
			$cut = mb_strcut( $text, 0, $max, 'UTF-8' );
		}
		return $cut;
	}

	/**
	 * @return array<string, array<string, mixed>>
	 */
	private static function load_all(): array {
		$user_id = get_current_user_id();
		if ( $user_id < 1 ) {
			return array();
		}
		self::maybe_migrate_legacy_files( $user_id );
		$stored = get_user_meta( $user_id, self::META_KEY, true );
		if ( ! is_array( $stored ) ) {
			return array();
		}
		$out = array();
		foreach ( $stored as $id => $session ) {
			if ( is_string( $id ) && is_array( $session ) && self::sanitize_id( $id ) !== '' ) {
				$out[ $id ] = $session;
			}
		}
		return $out;
	}

	/**
	 * @param array<string, array<string, mixed>> $sessions
	 */
	private static function save_all( array $sessions ): void {
		$user_id = get_current_user_id();
		if ( $user_id < 1 ) {
			return;
		}
		if ( count( $sessions ) > self::MAX_SESSIONS ) {
			uasort(
				$sessions,
				static function ( $a, $b ) {
					return strcmp( (string) ( $b['updated'] ?? '' ), (string) ( $a['updated'] ?? '' ) );
				}
			);
			$sessions = array_slice( $sessions, 0, self::MAX_SESSIONS, true );
		}
		if ( $sessions === array() ) {
			delete_user_meta( $user_id, self::META_KEY );
			return;
		}
		// update_user_meta() unslashes; slash first so backslashes in messages survive.
		update_user_meta( $user_id, self::META_KEY, wp_slash( $sessions ) );
	}

	/**
	 * One-time import of legacy uploads/neo-pulse/sessions/{uid}/sess_*.json files for this user,
	 * then delete those files (only inside this user's own legacy folder).
	 */
	private static function maybe_migrate_legacy_files( int $user_id ): void {
		if ( get_user_meta( $user_id, self::MIGRATED_META_KEY, true ) ) {
			return;
		}
		$upload = wp_upload_dir( null, false );
		$base   = isset( $upload['basedir'] ) ? (string) $upload['basedir'] : '';
		$dir    = $base !== '' ? $base . '/neo-pulse/sessions/' . $user_id : '';
		if ( $dir === '' || ! is_dir( $dir ) ) {
			update_user_meta( $user_id, self::MIGRATED_META_KEY, gmdate( 'c' ) );
			return;
		}
		$real_dir = realpath( $dir );
		$files    = glob( $dir . '/sess_*.json' );
		$files    = is_array( $files ) ? $files : array();

		$stored   = get_user_meta( $user_id, self::META_KEY, true );
		$sessions = is_array( $stored ) ? $stored : array();
		foreach ( $files as $file ) {
			$real = realpath( $file );
			if ( $real === false || $real_dir === false || dirname( $real ) !== $real_dir ) {
				continue;
			}
			// phpcs:ignore WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents
			$data = json_decode( (string) file_get_contents( $real ), true );
			if ( ! is_array( $data ) ) {
				continue;
			}
			$id = self::sanitize_id( $data['id'] ?? basename( $real, '.json' ) );
			if ( $id === '' || isset( $sessions[ $id ] ) ) {
				continue;
			}
			$messages = self::normalize_messages( isset( $data['messages'] ) && is_array( $data['messages'] ) ? $data['messages'] : array() );
			if ( $messages === array() ) {
				continue;
			}
			$sessions[ $id ] = array(
				'id'       => $id,
				'title'    => isset( $data['title'] ) && is_string( $data['title'] ) ? sanitize_text_field( $data['title'] ) : '',
				'created'  => isset( $data['created'] ) && is_string( $data['created'] ) ? sanitize_text_field( $data['created'] ) : gmdate( 'c', (int) filemtime( $real ) ),
				'updated'  => isset( $data['updated'] ) && is_string( $data['updated'] ) ? sanitize_text_field( $data['updated'] ) : gmdate( 'c', (int) filemtime( $real ) ),
				'messages' => $messages,
			);
		}

		self::save_all( $sessions );
		update_user_meta( $user_id, self::MIGRATED_META_KEY, gmdate( 'c' ) );

		// Imported: remove the public files for this user only.
		foreach ( $files as $file ) {
			$real = realpath( $file );
			if ( $real !== false && $real_dir !== false && dirname( $real ) === $real_dir ) {
				wp_delete_file( $real );
			}
		}
		if ( $real_dir !== false ) {
			if ( is_file( $real_dir . '/index.php' ) ) {
				wp_delete_file( $real_dir . '/index.php' );
			}
			$left = glob( $real_dir . '/*' );
			if ( is_array( $left ) && $left === array() ) {
				@rmdir( $real_dir ); // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged
			}
		}
	}
}
