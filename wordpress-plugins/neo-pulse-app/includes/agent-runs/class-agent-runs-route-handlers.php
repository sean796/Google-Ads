<?php
/**
 * /api/agent-runs/* route handlers.
 *
 * @package Neo_Pulse_App
 */

defined( 'ABSPATH' ) || exit;

class Neo_Pulse_App_Agent_Runs_Route_Handlers {

	/**
	 * @param string              $subpath Route after agent-runs/.
	 * @param string              $method  HTTP method.
	 * @param array<string,mixed> $body    JSON body.
	 */
	public static function dispatch_http( string $subpath, string $method, array $body ): void {
		Neo_Pulse_App_Agent_Runs_Store::install_tables();
		Neo_Pulse_App_Tasks_Store::install_tables();

		$user = Neo_Pulse_App_Auth_Session::require_user();
		if ( ! $user ) {
			Neo_Pulse_App_Api_Dispatcher::send_json( array( 'ok' => false, 'error' => 'Unauthorized' ), 401 );
			return;
		}

		$user_id = (int) ( $user['id'] ?? 0 );
		$subpath = trim( $subpath, '/' );
		$method  = strtoupper( $method );

		if ( $subpath === '' && $method === 'GET' ) {
			self::list_runs( $body, $user_id );
			return;
		}

		if ( $subpath === '' && $method === 'POST' ) {
			self::create_run( $body, $user_id );
			return;
		}

		if ( $subpath === 'clear' && $method === 'POST' ) {
			self::clear_runs( $body, $user_id );
			return;
		}

		if ( preg_match( '#^(\d+)$#', $subpath, $m ) ) {
			$run_id = (int) $m[1];
			if ( $method === 'GET' ) {
				self::get_run( $run_id, $body, $user_id );
				return;
			}
			if ( $method === 'PATCH' ) {
				self::patch_run( $run_id, $body, $user_id );
				return;
			}
			if ( $method === 'DELETE' ) {
				self::delete_run( $run_id, $body, $user_id );
				return;
			}
		}

		if ( preg_match( '#^(\d+)/cancel$#', $subpath, $m ) && $method === 'POST' ) {
			self::cancel_run( (int) $m[1], $body, $user_id );
			return;
		}

		if ( preg_match( '#^(\d+)/artifacts$#', $subpath, $m ) ) {
			$run_id = (int) $m[1];
			if ( $method === 'GET' ) {
				self::list_artifacts( $run_id, $body, $user_id );
				return;
			}
			if ( $method === 'POST' ) {
				self::save_artifact( $run_id, $body, $user_id );
				return;
			}
		}

		if ( preg_match( '#^(\d+)/deliverables$#', $subpath, $m ) && $method === 'GET' ) {
			self::list_deliverables( (int) $m[1], $body, $user_id );
			return;
		}

		if ( preg_match( '#^(\d+)/process$#', $subpath, $m ) && $method === 'POST' ) {
			self::process_run( (int) $m[1], $body, $user_id );
			return;
		}

		if ( preg_match( '#^(\d+)/rows/(\d+)/upload-complete$#', $subpath, $m ) && $method === 'POST' ) {
			self::complete_row_upload( (int) $m[1], (int) $m[2], $body, $user_id );
			return;
		}

		Neo_Pulse_App_Api_Dispatcher::send_json( array( 'ok' => false, 'error' => 'Not found' ), 404 );
	}

	/**
	 * @param array<string,mixed> $body
	 */
	private static function resolve_team( array $body, int $user_id ): ?array {
		$team_id = (int) ( $body['teamId'] ?? 0 );
		if ( $team_id <= 0 && isset( $_GET['teamId'] ) ) {
			$team_id = (int) wp_unslash( $_GET['teamId'] );
		}
		if ( $team_id <= 0 ) {
			$ctx = isset( $body['team_context'] ) && is_array( $body['team_context'] ) ? $body['team_context'] : array();
			$team_id = (int) ( $ctx['teamId'] ?? 0 );
		}
		if ( $team_id <= 0 ) {
			return null;
		}

		$member = Neo_Pulse_App_Teams_Store::get_membership( $team_id, $user_id );
		if ( ! is_array( $member ) || ! Neo_Pulse_App_Tasks_Store::is_active_member( $member ) ) {
			return null;
		}

		return array(
			'team_id' => $team_id,
			'member'  => $member,
		);
	}

	/**
	 * @param array<string,mixed> $body
	 */
	private static function list_runs( array $body, int $user_id ): void {
		$resolved = self::resolve_team( $body, $user_id );
		if ( ! $resolved ) {
			Neo_Pulse_App_Api_Dispatcher::send_json( array( 'ok' => false, 'error' => 'Forbidden' ), 403 );
			return;
		}

		$filters = array(
			'limit' => isset( $_GET['limit'] ) ? (int) wp_unslash( $_GET['limit'] ) : 50,
		);
		if ( isset( $_GET['status'] ) ) {
			$filters['status'] = sanitize_key( (string) wp_unslash( $_GET['status'] ) );
		}
		if ( isset( $_GET['source'] ) ) {
			$filters['source'] = sanitize_key( (string) wp_unslash( $_GET['source'] ) );
		}
		if ( isset( $_GET['task_id'] ) ) {
			$filters['task_id'] = (int) wp_unslash( $_GET['task_id'] );
		} elseif ( isset( $body['taskId'] ) ) {
			$filters['task_id'] = (int) $body['taskId'];
		}

		Neo_Pulse_App_Api_Dispatcher::send_json(
			array(
				'ok'   => true,
				'runs' => Neo_Pulse_App_Agent_Runs_Store::list_runs( $resolved['team_id'], $filters ),
			)
		);
	}

	/**
	 * @param array<string,mixed> $body
	 */
	private static function create_run( array $body, int $user_id ): void {
		$resolved = self::resolve_team( $body, $user_id );
		if ( ! $resolved ) {
			Neo_Pulse_App_Api_Dispatcher::send_json( array( 'ok' => false, 'error' => 'Forbidden' ), 403 );
			return;
		}

		$recipe_key = sanitize_key( (string) ( $body['recipeKey'] ?? $body['recipe_key'] ?? '' ) );
		if ( ! Neo_Pulse_App_Agent_Runs_Recipe_Registry::is_valid( $recipe_key ) ) {
			Neo_Pulse_App_Api_Dispatcher::send_json(
				array(
					'ok'    => false,
					'error' => 'Invalid agent recipe key: ' . $recipe_key,
				),
				400
			);
			return;
		}

		$run = Neo_Pulse_App_Agent_Runs_Store::create_run( $resolved['team_id'], $user_id, $body );
		if ( ! $run ) {
			Neo_Pulse_App_Api_Dispatcher::send_json(
				array( 'ok' => false, 'error' => 'Could not create agent run' ),
				400
			);
			return;
		}

		if ( Neo_Pulse_App_Agent_Runs_Store::run_uses_server_execution( $run ) ) {
			if ( class_exists( 'Neo_Pulse_App_Agent_Run_Worker' ) ) {
				Neo_Pulse_App_Agent_Run_Worker::process_run_tick( $run, true );
			}
			if ( class_exists( 'Neo_Pulse_App_Agent_Run_Worker_Cron' ) ) {
				Neo_Pulse_App_Agent_Run_Worker_Cron::kick();
			}
			$refreshed = Neo_Pulse_App_Agent_Runs_Store::get_run( $resolved['team_id'], (int) $run['id'], true );
			if ( is_array( $refreshed ) ) {
				$run = $refreshed;
			}
		}

		Neo_Pulse_App_Api_Dispatcher::send_json(
			array(
				'ok'  => true,
				'run' => $run,
			)
		);
	}

	/**
	 * @param array<string,mixed> $body
	 */
	private static function get_run( int $run_id, array $body, int $user_id ): void {
		$resolved = self::resolve_team( $body, $user_id );
		if ( ! $resolved ) {
			Neo_Pulse_App_Api_Dispatcher::send_json( array( 'ok' => false, 'error' => 'Forbidden' ), 403 );
			return;
		}

		$run = Neo_Pulse_App_Agent_Runs_Store::get_run( $resolved['team_id'], $run_id );
		if ( ! $run ) {
			Neo_Pulse_App_Api_Dispatcher::send_json( array( 'ok' => false, 'error' => 'Not found' ), 404 );
			return;
		}

		Neo_Pulse_App_Api_Dispatcher::send_json(
			array(
				'ok'  => true,
				'run' => $run,
			)
		);
	}

	/**
	 * @param array<string,mixed> $body
	 */
	private static function patch_run( int $run_id, array $body, int $user_id ): void {
		$resolved = self::resolve_team( $body, $user_id );
		if ( ! $resolved ) {
			Neo_Pulse_App_Api_Dispatcher::send_json( array( 'ok' => false, 'error' => 'Forbidden' ), 403 );
			return;
		}

		$run = Neo_Pulse_App_Agent_Runs_Store::patch_run( $resolved['team_id'], $run_id, $body );
		if ( ! $run ) {
			Neo_Pulse_App_Api_Dispatcher::send_json( array( 'ok' => false, 'error' => 'Not found' ), 404 );
			return;
		}

		if ( ! empty( $body['taskStatus'] ) && ! empty( $run['taskId'] ) ) {
			$status = sanitize_key( (string) $body['taskStatus'] );
			if ( in_array( $status, Neo_Pulse_App_Tasks_Store::STATUSES, true ) ) {
				Neo_Pulse_App_Tasks_Store::update_task(
					$resolved['team_id'],
					(int) $run['taskId'],
					array( 'status' => $status ),
					$user_id
				);
			}
		}

		Neo_Pulse_App_Api_Dispatcher::send_json(
			array(
				'ok'  => true,
				'run' => $run,
			)
		);
	}

	/**
	 * @param array<string,mixed> $body
	 */
	private static function cancel_run( int $run_id, array $body, int $user_id ): void {
		$resolved = self::resolve_team( $body, $user_id );
		if ( ! $resolved ) {
			Neo_Pulse_App_Api_Dispatcher::send_json( array( 'ok' => false, 'error' => 'Forbidden' ), 403 );
			return;
		}

		$run = Neo_Pulse_App_Agent_Runs_Store::cancel_run( $resolved['team_id'], $run_id );
		if ( ! $run ) {
			Neo_Pulse_App_Api_Dispatcher::send_json( array( 'ok' => false, 'error' => 'Not found' ), 404 );
			return;
		}

		Neo_Pulse_App_Api_Dispatcher::send_json(
			array(
				'ok'  => true,
				'run' => $run,
			)
		);
	}

	/**
	 * @param array<string,mixed> $body
	 */
	private static function delete_run( int $run_id, array $body, int $user_id ): void {
		$resolved = self::resolve_team( $body, $user_id );
		if ( ! $resolved ) {
			Neo_Pulse_App_Api_Dispatcher::send_json( array( 'ok' => false, 'error' => 'Forbidden' ), 403 );
			return;
		}

		$deleted = Neo_Pulse_App_Agent_Runs_Store::delete_run( $resolved['team_id'], $run_id );
		if ( ! $deleted ) {
			Neo_Pulse_App_Api_Dispatcher::send_json( array( 'ok' => false, 'error' => 'Not found' ), 404 );
			return;
		}

		Neo_Pulse_App_Api_Dispatcher::send_json( array( 'ok' => true ) );
	}

	private static function clear_runs( array $body, int $user_id ): void {
		$resolved = self::resolve_team( $body, $user_id );
		if ( ! $resolved ) {
			Neo_Pulse_App_Api_Dispatcher::send_json( array( 'ok' => false, 'error' => 'Forbidden' ), 403 );
			return;
		}

		$statuses = array( 'done', 'failed', 'cancelled' );
		if ( isset( $body['statuses'] ) && is_array( $body['statuses'] ) ) {
			$statuses = array_map(
				static function ( $status ) {
					return sanitize_key( (string) $status );
				},
				$body['statuses']
			);
		}

		$deleted = Neo_Pulse_App_Agent_Runs_Store::clear_runs( $resolved['team_id'], $statuses );

		Neo_Pulse_App_Api_Dispatcher::send_json(
			array(
				'ok'      => true,
				'deleted' => $deleted,
			)
		);
	}

	/**
	 * @param array<string,mixed> $body
	 */
	private static function list_artifacts( int $run_id, array $body, int $user_id ): void {
		$resolved = self::resolve_team( $body, $user_id );
		if ( ! $resolved ) {
			Neo_Pulse_App_Api_Dispatcher::send_json( array( 'ok' => false, 'error' => 'Forbidden' ), 403 );
			return;
		}

		$run = Neo_Pulse_App_Agent_Runs_Store::get_run( $resolved['team_id'], $run_id, false );
		if ( ! $run ) {
			Neo_Pulse_App_Api_Dispatcher::send_json( array( 'ok' => false, 'error' => 'Not found' ), 404 );
			return;
		}

		Neo_Pulse_App_Api_Dispatcher::send_json(
			array(
				'ok'        => true,
				'artifacts' => Neo_Pulse_App_Agent_Runs_Artifacts::list_artifacts( $run_id ),
			)
		);
	}

	/**
	 * @param array<string,mixed> $body
	 */
	private static function list_deliverables( int $run_id, array $body, int $user_id ): void {
		$resolved = self::resolve_team( $body, $user_id );
		if ( ! $resolved ) {
			Neo_Pulse_App_Api_Dispatcher::send_json( array( 'ok' => false, 'error' => 'Forbidden' ), 403 );
			return;
		}

		$run = Neo_Pulse_App_Agent_Runs_Store::get_run( $resolved['team_id'], $run_id, false );
		if ( ! $run ) {
			Neo_Pulse_App_Api_Dispatcher::send_json( array( 'ok' => false, 'error' => 'Not found' ), 404 );
			return;
		}

		Neo_Pulse_App_Api_Dispatcher::send_json(
			array(
				'ok'    => true,
				'files' => Neo_Pulse_App_Agent_Runs_Artifacts::list_deliverable_contents( $run_id ),
			)
		);
	}

	/**
	 * @param array<string,mixed> $body
	 */
	private static function save_artifact( int $run_id, array $body, int $user_id ): void {
		$resolved = self::resolve_team( $body, $user_id );
		if ( ! $resolved ) {
			Neo_Pulse_App_Api_Dispatcher::send_json( array( 'ok' => false, 'error' => 'Forbidden' ), 403 );
			return;
		}

		$result = Neo_Pulse_App_Agent_Runs_Artifacts::save_artifact( $resolved['team_id'], $run_id, $body );
		$code   = ! empty( $result['ok'] ) ? 200 : 400;
		Neo_Pulse_App_Api_Dispatcher::send_json( $result, $code );
	}

	/**
	 * @param array<string,mixed> $body
	 */
	private static function process_run( int $run_id, array $body, int $user_id ): void {
		$resolved = self::resolve_team( $body, $user_id );
		if ( ! $resolved ) {
			Neo_Pulse_App_Api_Dispatcher::send_json( array( 'ok' => false, 'error' => 'Forbidden' ), 403 );
			return;
		}

		$run = Neo_Pulse_App_Agent_Runs_Store::get_run( $resolved['team_id'], $run_id, true );
		if ( ! $run ) {
			Neo_Pulse_App_Api_Dispatcher::send_json( array( 'ok' => false, 'error' => 'Not found' ), 404 );
			return;
		}

		if ( ! Neo_Pulse_App_Agent_Runs_Store::run_uses_server_execution( $run ) ) {
			Neo_Pulse_App_Api_Dispatcher::send_json(
				array( 'ok' => false, 'error' => 'Run is not server-executed.' ),
				400
			);
			return;
		}

		if ( class_exists( 'Neo_Pulse_App_Agent_Run_Worker_Cron' ) ) {
			Neo_Pulse_App_Agent_Run_Worker_Cron::kick();
		}

		$openrouter_key = class_exists( 'Neo_Pulse_App_Chat_Openrouter' )
			? Neo_Pulse_App_Chat_Openrouter::api_key_from_request( $body )
			: '';
		if ( $openrouter_key !== '' && class_exists( 'Neo_Pulse_App_Chat_Openrouter' ) ) {
			Neo_Pulse_App_Chat_Openrouter::use_request_api_key( $openrouter_key );
		}

		try {
			$processed = self::process_server_run_once( $resolved['team_id'], $run_id, $run );
		} finally {
			if ( class_exists( 'Neo_Pulse_App_Chat_Openrouter' ) ) {
				Neo_Pulse_App_Chat_Openrouter::clear_request_api_key();
			}
		}

		if ( ! $processed ) {
			Neo_Pulse_App_Api_Dispatcher::send_json( array( 'ok' => false, 'error' => 'Could not process run' ), 500 );
			return;
		}

		Neo_Pulse_App_Api_Dispatcher::send_json(
			array(
				'ok'  => true,
				'run' => $processed,
			)
		);
	}

	/**
	 * @param array<string,mixed> $run
	 * @return array<string,mixed>|null
	 */
	private static function process_server_run_once( int $team_id, int $run_id, array $run ): ?array {
		if ( $run_id <= 0 || ! class_exists( 'Neo_Pulse_App_Agent_Run_Worker' ) ) {
			return null;
		}

		$plan = is_array( $run['plan'] ?? null ) ? $run['plan'] : array();
		if ( empty( $plan['executionMode'] ) ) {
			$plan['executionMode'] = 'server';
			Neo_Pulse_App_Agent_Runs_Store::patch_run(
				$team_id,
				$run_id,
				array(
					'plan' => $plan,
				)
			);
		}

		if ( in_array( (string) ( $run['status'] ?? '' ), array( 'queued', 'running' ), true ) ) {
			for ( $i = 0; $i < 24; $i++ ) {
				$current = Neo_Pulse_App_Agent_Runs_Store::get_run( $team_id, $run_id, true );
				if ( ! $current ) {
					break;
				}
				if ( ! in_array( (string) ( $current['status'] ?? '' ), array( 'queued', 'running' ), true ) ) {
					break;
				}
				Neo_Pulse_App_Agent_Run_Worker::process_run_tick( $current, false );
			}
		}

		return Neo_Pulse_App_Agent_Runs_Store::get_run( $team_id, $run_id, true );
	}

	/**
	 * @param array<string,mixed> $body
	 */
	private static function complete_row_upload( int $run_id, int $row_index, array $body, int $user_id ): void {
		$resolved = self::resolve_team( $body, $user_id );
		if ( ! $resolved ) {
			Neo_Pulse_App_Api_Dispatcher::send_json( array( 'ok' => false, 'error' => 'Forbidden' ), 403 );
			return;
		}

		$run = Neo_Pulse_App_Agent_Runs_Store::get_run( $resolved['team_id'], $run_id, true );
		if ( ! $run ) {
			Neo_Pulse_App_Api_Dispatcher::send_json( array( 'ok' => false, 'error' => 'Not found' ), 404 );
			return;
		}

		$uploaded = is_array( $body['uploadedPost'] ?? null ) ? $body['uploadedPost'] : array();
		$url      = trim( (string) ( $uploaded['url'] ?? '' ) );
		if ( $url === '' ) {
			Neo_Pulse_App_Api_Dispatcher::send_json( array( 'ok' => false, 'error' => 'uploadedPost.url is required' ), 400 );
			return;
		}

		if ( ! class_exists( 'Neo_Pulse_App_Agent_Run_Post_Creator_Upload_Complete' ) ) {
			Neo_Pulse_App_Api_Dispatcher::send_json( array( 'ok' => false, 'error' => 'Post creator upload handler unavailable' ), 500 );
			return;
		}

		$updated = Neo_Pulse_App_Agent_Run_Post_Creator_Upload_Complete::complete_client_upload(
			$resolved['team_id'],
			$run_id,
			$row_index,
			$run,
			$uploaded
		);

		Neo_Pulse_App_Api_Dispatcher::send_json(
			array(
				'ok'  => true,
				'run' => $updated,
			)
		);
	}
}
