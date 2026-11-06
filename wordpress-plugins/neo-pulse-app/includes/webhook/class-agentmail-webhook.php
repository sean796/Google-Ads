<?php
/**
 * AgentMail inbound webhook (message.received → workflow trigger).
 *
 * @package Neo_Pulse_App
 */

defined( 'ABSPATH' ) || exit;

class Neo_Pulse_App_Agentmail_Webhook {

	/**
	 * @param array<string,mixed> $body
	 */
	public static function handle( string $method, array $body, string $raw_body = '' ): void {
		if ( $method !== 'POST' ) {
			self::send_json( array( 'ok' => false, 'error' => 'Method not allowed' ), 405 );
			return;
		}

		if ( ! self::verify_request( $raw_body ) ) {
			self::send_json( array( 'ok' => false, 'error' => 'Unauthorized' ), 401 );
			return;
		}

		$event_type = (string) ( $body['event_type'] ?? $body['eventType'] ?? '' );
		if ( $event_type !== 'message.received' ) {
			self::send_json( array( 'ok' => true, 'ignored' => true ), 200 );
			return;
		}

		$message = isset( $body['message'] ) && is_array( $body['message'] ) ? $body['message'] : array();
		if ( empty( $message ) ) {
			self::send_json( array( 'ok' => false, 'error' => 'Missing message' ), 400 );
			return;
		}

		$message_id = trim( (string) ( $message['message_id'] ?? $message['id'] ?? '' ) );
		if ( $message_id === '' ) {
			self::send_json( array( 'ok' => false, 'error' => 'Missing message_id' ), 400 );
			return;
		}

		if ( Neo_Pulse_App_Agentmail_Inbound_Store::is_processed( $message_id ) ) {
			self::send_json( array( 'ok' => true, 'duplicate' => true ), 200 );
			return;
		}

		$inbox = sanitize_email( strtolower( trim( (string) ( $message['inbox_id'] ?? Neo_Pulse_App_Agentmail_Api::default_inbox() ) ) ) );
		if ( $inbox === '' ) {
			$inbox = Neo_Pulse_App_Agentmail_Api::default_inbox();
		}

		if ( (string) ( $message['text'] ?? '' ) === '' && (string) ( $message['html'] ?? '' ) === '' ) {
			$hydrated = Neo_Pulse_App_Agentmail_Api::get_message( $inbox, $message_id );
			if ( is_array( $hydrated ) ) {
				$message = array_merge( $message, $hydrated );
			}
		}

		$sender = Neo_Pulse_App_Agentmail_Api::extract_sender( $message );
		if ( $sender === '' ) {
			self::send_json( array( 'ok' => false, 'error' => 'Missing sender' ), 400 );
			return;
		}

		$attachment_meta = isset( $message['attachments'] ) && is_array( $message['attachments'] ) ? $message['attachments'] : array();
		$downloaded      = array();
		foreach ( $attachment_meta as $meta ) {
			if ( ! is_array( $meta ) ) {
				continue;
			}
			$attachment_id = trim( (string) ( $meta['attachment_id'] ?? $meta['attachmentId'] ?? '' ) );
			if ( $attachment_id === '' ) {
				continue;
			}
			$binary = Neo_Pulse_App_Agentmail_Api::download_attachment( $inbox, $message_id, $attachment_id );
			if ( $binary === '' ) {
				continue;
			}
			$downloaded[] = array_merge( $meta, array( 'binary' => $binary ) );
		}

		$enqueued = 0;
		if ( class_exists( 'Neo_Pulse_App_Workflow_Trigger_Evaluator' ) ) {
			$enqueued = Neo_Pulse_App_Workflow_Trigger_Evaluator::on_agentmail_received(
				$sender,
				$inbox,
				$message,
				$downloaded
			);
		}

		Neo_Pulse_App_Agentmail_Inbound_Store::mark_processed( $message_id );
		self::send_json(
			array(
				'ok'       => true,
				'enqueued' => $enqueued,
			),
			200
		);
	}

	private static function verify_request( string $raw_body ): bool {
		// Wave 0: fail closed. A signing secret (Svix) is verified when configured;
		// otherwise the shared Bearer secret is required. Neither configured means reject.
		$signing = class_exists( 'Neo_Pulse_App_Secrets' ) ? Neo_Pulse_App_Secrets::agentmail_signing_secret() : '';
		if ( $signing !== '' ) {
			return self::verify_svix( $signing, $raw_body );
		}
		$secret = class_exists( 'Neo_Pulse_App_Secrets' ) ? Neo_Pulse_App_Secrets::agentmail_webhook_secret() : '';
		if ( $secret === '' ) {
			return false;
		}
		$auth = isset( $_SERVER['HTTP_AUTHORIZATION'] ) ? (string) wp_unslash( $_SERVER['HTTP_AUTHORIZATION'] ) : '';
		if ( $auth === '' && function_exists( 'getallheaders' ) ) {
			$headers = getallheaders();
			if ( is_array( $headers ) ) {
				foreach ( $headers as $name => $value ) {
					if ( strtolower( (string) $name ) === 'authorization' ) {
						$auth = (string) $value;
						break;
					}
				}
			}
		}
		if ( preg_match( '/^Bearer\s+(.+)$/i', $auth, $m ) ) {
			return hash_equals( $secret, trim( $m[1] ) );
		}
		return false;
	}

	private static function verify_svix( string $signing_secret, string $raw_body ): bool {
		$id        = isset( $_SERVER['HTTP_SVIX_ID'] ) ? (string) wp_unslash( $_SERVER['HTTP_SVIX_ID'] ) : '';
		$timestamp = isset( $_SERVER['HTTP_SVIX_TIMESTAMP'] ) ? (string) wp_unslash( $_SERVER['HTTP_SVIX_TIMESTAMP'] ) : '';
		$signature = isset( $_SERVER['HTTP_SVIX_SIGNATURE'] ) ? (string) wp_unslash( $_SERVER['HTTP_SVIX_SIGNATURE'] ) : '';
		if ( $id === '' || $timestamp === '' || $signature === '' || $raw_body === '' ) {
			return false;
		}
		if ( ! is_numeric( $timestamp ) || abs( time() - (int) $timestamp ) > 300 ) {
			return false;
		}
		$key_b64 = str_starts_with( $signing_secret, 'whsec_' ) ? substr( $signing_secret, 6 ) : $signing_secret;
		$key     = base64_decode( $key_b64, true );
		if ( $key === false || $key === '' ) {
			return false;
		}
		$expected = base64_encode( hash_hmac( 'sha256', $id . '.' . $timestamp . '.' . $raw_body, $key, true ) );
		foreach ( explode( ' ', $signature ) as $part ) {
			$pieces = explode( ',', trim( $part ), 2 );
			if ( count( $pieces ) === 2 && $pieces[0] === 'v1' && hash_equals( $expected, $pieces[1] ) ) {
				return true;
			}
		}
		return false;
	}

	/**
	 * @param array<string,mixed> $payload
	 */
	private static function send_json( array $payload, int $status ): void {
		if ( class_exists( 'Neo_Pulse_App_Api_Dispatcher' ) ) {
			Neo_Pulse_App_Api_Dispatcher::send_json( $payload, $status );
			return;
		}
		status_header( $status );
		header( 'Content-Type: application/json; charset=utf-8' );
		echo wp_json_encode( $payload );
	}
}
