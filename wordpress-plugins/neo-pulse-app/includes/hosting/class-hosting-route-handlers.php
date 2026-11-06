<?php
/**
 * Proxy /api/hosting/* to Pulse Host API on Render.
 *
 * @package Neo_Pulse_App
 */

defined( 'ABSPATH' ) || exit;

class Neo_Pulse_App_Hosting_Route_Handlers {

	/**
	 * @param string              $subpath Route after hosting/.
	 * @param string              $method  HTTP method.
	 * @param array<string,mixed> $body    JSON body.
	 */
	public static function dispatch_http( string $subpath, string $method, array $body ): void {
		$user = Neo_Pulse_App_Auth_Session::require_user();
		if ( ! $user ) {
			Neo_Pulse_App_Api_Dispatcher::send_json( array( 'ok' => false, 'error' => 'Unauthorized.' ), 401 );
			return;
		}

		$user_id = (int) $user['id'];
		$team_id = Neo_Pulse_App_Auth_Session::active_team_id();
		if ( $team_id === null ) {
			Neo_Pulse_App_Api_Dispatcher::send_json( array( 'ok' => false, 'error' => 'No active team.' ), 403 );
			return;
		}

		$membership = Neo_Pulse_App_Teams_Store::get_membership( (int) $team_id, $user_id );
		if ( ! $membership ) {
			Neo_Pulse_App_Api_Dispatcher::send_json( array( 'ok' => false, 'error' => 'Not a team member.' ), 403 );
			return;
		}

		$perms = Neo_Pulse_App_Teams_Store::decode_permissions(
			$membership['permissions_json'] ?? null,
			(string) $membership['access_role']
		);
		$hosting = $perms['hosting'] ?? array( 'read' => false, 'write' => false );
		if ( empty( $hosting['read'] ) ) {
			Neo_Pulse_App_Api_Dispatcher::send_json( array( 'ok' => false, 'error' => 'Hosting access denied.' ), 403 );
			return;
		}

		$base = self::host_api_base();
		if ( $base === '' ) {
			Neo_Pulse_App_Api_Dispatcher::send_json(
				array(
					'ok'    => false,
					'error' => 'Pulse Host API is not configured (PULSE_HOST_API_BASE).',
				),
				503
			);
			return;
		}

		// Wave 0: fail closed. Never call the hosting API without the service token.
		if ( self::host_api_token() === '' ) {
			Neo_Pulse_App_Api_Dispatcher::send_json(
				array(
					'ok'    => false,
					'error' => 'Pulse Host API is not configured (PULSE_HOST_API_TOKEN).',
				),
				503
			);
			return;
		}

		if ( isset( $body['pulseUserId'] ) ) {
			$body = self::resolve_pulse_user( $body, (int) $team_id );
			if ( $body === null ) {
				Neo_Pulse_App_Api_Dispatcher::send_json( array( 'ok' => false, 'error' => 'Pulse team member not found.' ), 404 );
				return;
			}
		}

		$subpath = trim( $subpath, '/' );
		$target  = rtrim( $base, '/' ) . '/v1/hosting/' . $subpath;

		$headers = array(
			'Content-Type'               => 'application/json',
			'X-Neo-Pulse-Team-Id'        => (string) (int) $team_id,
			'X-Neo-Pulse-User-Id'        => (string) $user_id,
			'X-Neo-Pulse-Hosting-Write'  => ! empty( $hosting['write'] ) ? '1' : '0',
		);

		$token = self::host_api_token();
		if ( $token !== '' ) {
			$headers['Authorization'] = 'Bearer ' . $token;
		}

		$args = array(
			'method'  => strtoupper( $method ),
			'timeout' => 60,
			'headers' => $headers,
		);
		if ( strtoupper( $method ) !== 'GET' && strtoupper( $method ) !== 'HEAD' ) {
			$args['body'] = wp_json_encode( $body );
		}

		$response = wp_remote_request( $target, $args );
		if ( is_wp_error( $response ) ) {
			Neo_Pulse_App_Api_Dispatcher::send_json(
				array(
					'ok'    => false,
					'error' => $response->get_error_message(),
				),
				502
			);
			return;
		}

		$code = (int) wp_remote_retrieve_response_code( $response );
		$raw  = (string) wp_remote_retrieve_body( $response );
		$data = json_decode( $raw, true );
		if ( ! is_array( $data ) ) {
			Neo_Pulse_App_Api_Dispatcher::send_json(
				array(
					'ok'    => false,
					'error' => 'Invalid Pulse Host API response.',
				),
				502
			);
			return;
		}

		Neo_Pulse_App_Api_Dispatcher::send_json( $data, $code > 0 ? $code : 200 );
	}

	/**
	 * A Pulse team member becomes a hosted-site user with the same password: the browser sends
	 * `pulseUserId`, the hub replaces it with email, display name, and the bcrypt hash server-side.
	 *
	 * @param array<string,mixed> $body
	 * @return array<string,mixed>|null Null when the id is not an active member of the team.
	 */
	private static function resolve_pulse_user( array $body, int $team_id ): ?array {
		$pulse_user_id = (int) $body['pulseUserId'];
		unset( $body['pulseUserId'] );
		$member = Neo_Pulse_App_Teams_Store::get_user_by_id( $pulse_user_id );
		if ( ! $member || ! Neo_Pulse_App_Teams_Store::get_membership( $team_id, $pulse_user_id ) ) {
			return null;
		}
		$member = Neo_Pulse_App_Teams_Store::get_user_by_email( (string) $member['email'] );
		if ( ! $member ) {
			return null;
		}
		$body['email']        = (string) $member['email'];
		$body['displayName']  = (string) $member['display_name'];
		$body['passwordHash'] = (string) $member['password_hash'];
		return $body;
	}

	/** Constant from neo-pulse-app-secrets.php, else process env (Docker/Render). */
	private static function setting( string $name ): string {
		if ( defined( $name ) && is_string( constant( $name ) ) ) {
			return trim( constant( $name ) );
		}
		return trim( (string) getenv( $name ) );
	}

	private static function host_api_base(): string {
		return self::setting( 'PULSE_HOST_API_BASE' );
	}

	private static function host_api_token(): string {
		return self::setting( 'PULSE_HOST_API_TOKEN' );
	}
}
