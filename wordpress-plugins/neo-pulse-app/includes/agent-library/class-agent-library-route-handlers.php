<?php
/**
 * /api/agent-library/* route handlers.
 *
 * Serves the Agent Library tab: the hub agent catalog, the per-agent enabled
 * switches, and the hub OpenRouter settings. Switches and settings persist in
 * agent-library.json in the private data root. The stored OpenRouter key
 * never leaves the server; responses carry only whether an effective key is
 * configured and its last four characters.
 *
 * @package Neo_Pulse_App
 */

defined( 'ABSPATH' ) || exit;

class Neo_Pulse_App_Agent_Library_Route_Handlers {

	const DEFAULT_MODEL = 'deepseek/deepseek-v4.1-flash';

	/**
	 * @param string              $subpath Route after agent-library/.
	 * @param string              $method  HTTP method.
	 * @param array<string,mixed> $body    JSON body.
	 */
	public static function dispatch_http( string $subpath, string $method, array $body ): void {
		$user = Neo_Pulse_App_Auth_Session::require_user();
		if ( ! $user ) {
			Neo_Pulse_App_Api_Dispatcher::send_json( array( 'ok' => false, 'error' => 'Unauthorized' ), 401 );
			return;
		}

		$subpath = trim( $subpath, '/' );
		$method  = strtoupper( $method );

		if ( $subpath === '' && $method === 'GET' ) {
			Neo_Pulse_App_Api_Dispatcher::send_json( self::payload() );
			return;
		}

		if ( $subpath === 'toggle' && $method === 'POST' ) {
			self::toggle( $body );
			return;
		}

		if ( $subpath === 'settings' && $method === 'POST' ) {
			self::save_settings( $body );
			return;
		}

		Neo_Pulse_App_Api_Dispatcher::send_json( array( 'ok' => false, 'error' => 'Not found' ), 404 );
	}

	/**
	 * The hub agent catalog. The browser merges these rows with its own
	 * registered agents and applies the stored overrides to both.
	 *
	 * @return array<int,array<string,mixed>>
	 */
	private static function hub_agents(): array {
		$source = 'neo-agent-hub/packages/core/src/agents.ts';
		return array(
			array(
				'id'            => 'meeting-notes',
				'name'          => 'Meeting Notes to Checklist',
				'description'   => 'Pick a Gemini meeting note from Gmail or use latest; OpenRouter builds a Slack task list and checklist.',
				'status'        => 'beta',
				'category'      => 'report',
				'domain'        => 'slack-hub',
				'slashCommand'  => '/meeting-notes',
				'requiresGoogle' => true,
				'sourceModule'  => $source,
				'enabled'       => true,
			),
			array(
				'id'            => 'meeting-notes-drive',
				'name'          => 'Meeting Notes to Drive',
				'description'   => 'Publish to Drive button after checklist; creates or copies a Google Doc recap (Drive + Docs API).',
				'status'        => 'beta',
				'category'      => 'report',
				'domain'        => 'slack-hub',
				'slashCommand'  => '/meeting-notes',
				'requiresGoogle' => true,
				'sourceModule'  => $source,
				'enabled'       => true,
			),
			array(
				'id'            => 'write',
				'name'          => 'Write & Proofread',
				'description'   => 'Fix or rewrite drafts: /write, composer drafts, and message shortcuts (correct, polish, shorten, adjust).',
				'status'        => 'active',
				'category'      => 'blog',
				'domain'        => 'slack-hub',
				'slashCommand'  => '/write',
				'requiresGoogle' => false,
				'sourceModule'  => $source,
				'enabled'       => true,
			),
			array(
				'id'            => 'email-desk',
				'name'          => 'Email Desk (Frontend / KWB)',
				'description'   => 'Watch Gmail for inbound client mail, draft replies, and propose site tasks; approve in Slack to send and run Neo MCP via NEO Pulse.',
				'status'        => 'beta',
				'category'      => 'research',
				'domain'        => 'slack-hub',
				'slashCommand'  => '/email-desk',
				'requiresGoogle' => true,
				'sourceModule'  => $source,
				'enabled'       => true,
			),
		);
	}

	/**
	 * @param mixed $raw Decoded agent-library.json contents, if readable.
	 * @return array{overrides: array<string,bool>, settings: array<string,string>}
	 */
	private static function normalize_state( $raw ): array {
		$state = array(
			'overrides' => array(),
			'settings'  => array(),
		);
		if ( ! is_array( $raw ) ) {
			return $state;
		}
		if ( isset( $raw['overrides'] ) && is_array( $raw['overrides'] ) ) {
			foreach ( $raw['overrides'] as $id => $enabled ) {
				$state['overrides'][ (string) $id ] = (bool) $enabled;
			}
		}
		if ( isset( $raw['settings'] ) && is_array( $raw['settings'] ) ) {
			foreach ( array( 'openRouterApiKey', 'openRouterModel', 'openRouterAccountEmail' ) as $key ) {
				if ( isset( $raw['settings'][ $key ] ) && is_string( $raw['settings'][ $key ] ) ) {
					$state['settings'][ $key ] = $raw['settings'][ $key ];
				}
			}
		}
		return $state;
	}

	/**
	 * @return array{overrides: array<string,bool>, settings: array<string,string>}
	 */
	private static function read_state(): array {
		return self::normalize_state(
			Neo_Pulse_App_Json_File_Store::read( Neo_Pulse_App_Data_Paths::agent_library_path() )
		);
	}

	/**
	 * Apply a change to the stored state under the store lock, so two
	 * requests cannot read the same state and overwrite each other.
	 *
	 * @param callable $mutator fn(array &$state): void
	 */
	private static function mutate_state( callable $mutator ): bool {
		return Neo_Pulse_App_Json_File_Store::update(
			Neo_Pulse_App_Data_Paths::agent_library_path(),
			static function ( $current ) use ( $mutator ) {
				$state = self::normalize_state( $current );
				$mutator( $state );
				return array(
					'overrides' => $state['overrides'],
					'settings'  => $state['settings'],
				);
			}
		);
	}

	/**
	 * The effective key is the stored Agent Library override when set, and
	 * the server-resolved key (constants, env, manager settings) otherwise.
	 * Only its last four characters are ever exposed.
	 *
	 * @param array<string,string> $settings Stored settings.
	 * @return array<string,mixed>
	 */
	private static function public_settings( array $settings ): array {
		$key = isset( $settings['openRouterApiKey'] ) ? trim( (string) $settings['openRouterApiKey'] ) : '';
		if ( $key === '' ) {
			$key = Neo_Pulse_App_Secrets::openrouter_api_key();
		}
		$model = isset( $settings['openRouterModel'] ) && $settings['openRouterModel'] !== ''
			? $settings['openRouterModel']
			: self::DEFAULT_MODEL;
		return array(
			'openRouter'             => array(
				'configured' => $key !== '',
				'suffix'     => $key !== '' ? substr( $key, -4 ) : null,
			),
			'openRouterModel'        => $model,
			'openRouterAccountEmail' => isset( $settings['openRouterAccountEmail'] ) ? (string) $settings['openRouterAccountEmail'] : '',
		);
	}

	/**
	 * @return array<string,mixed>
	 */
	private static function payload(): array {
		$state = self::read_state();
		return array(
			'ok'        => true,
			'hubAgents' => self::hub_agents(),
			'overrides' => $state['overrides'] === array() ? new stdClass() : $state['overrides'],
			'settings'  => self::public_settings( $state['settings'] ),
		);
	}

	/**
	 * @param array<string,mixed> $body JSON body.
	 */
	private static function toggle( array $body ): void {
		$agent_id = isset( $body['agentId'] ) && is_string( $body['agentId'] ) ? trim( $body['agentId'] ) : '';
		if ( $agent_id === '' ) {
			Neo_Pulse_App_Api_Dispatcher::send_json( array( 'ok' => false, 'error' => 'agentId is required' ), 400 );
			return;
		}
		if ( ! array_key_exists( 'enabled', $body ) ) {
			Neo_Pulse_App_Api_Dispatcher::send_json( array( 'ok' => false, 'error' => 'enabled is required' ), 400 );
			return;
		}
		$saved = self::mutate_state(
			static function ( array &$state ) use ( $agent_id, $body ): void {
				$state['overrides'][ $agent_id ] = (bool) $body['enabled'];
			}
		);
		if ( ! $saved ) {
			Neo_Pulse_App_Api_Dispatcher::send_json( array( 'ok' => false, 'error' => 'Agent Library save failed' ), 500 );
			return;
		}
		Neo_Pulse_App_Api_Dispatcher::send_json( self::payload() );
	}

	/**
	 * @param array<string,mixed> $body JSON body.
	 */
	private static function save_settings( array $body ): void {
		$saved = self::mutate_state(
			static function ( array &$state ) use ( $body ): void {
				if ( isset( $body['openRouterApiKey'] ) && is_string( $body['openRouterApiKey'] ) && trim( $body['openRouterApiKey'] ) !== '' ) {
					$state['settings']['openRouterApiKey'] = trim( $body['openRouterApiKey'] );
				}
				if ( isset( $body['openRouterModel'] ) && is_string( $body['openRouterModel'] ) && trim( $body['openRouterModel'] ) !== '' ) {
					$state['settings']['openRouterModel'] = sanitize_text_field( $body['openRouterModel'] );
				}
				if ( isset( $body['openRouterAccountEmail'] ) && is_string( $body['openRouterAccountEmail'] ) ) {
					$state['settings']['openRouterAccountEmail'] = sanitize_email( $body['openRouterAccountEmail'] );
				}
			}
		);
		if ( ! $saved ) {
			Neo_Pulse_App_Api_Dispatcher::send_json( array( 'ok' => false, 'error' => 'Agent Library save failed' ), 500 );
			return;
		}
		Neo_Pulse_App_Api_Dispatcher::send_json( self::payload() );
	}
}
