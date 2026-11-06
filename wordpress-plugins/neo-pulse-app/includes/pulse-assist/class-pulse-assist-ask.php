<?php
/**
 * NEO Pulse native Flow Assist (Ask / Plan / Build v1).
 *
 * @package Neo_Pulse_App
 */

defined( 'ABSPATH' ) || exit;

$neo_pulse_app_pulse_assist_ask_dir = __DIR__ . '/';
require_once $neo_pulse_app_pulse_assist_ask_dir . 'trait-pulse-assist-ask-run-llm.php';
require_once $neo_pulse_app_pulse_assist_ask_dir . 'trait-pulse-assist-ask-prompt-rules-card-finalize.php';
require_once $neo_pulse_app_pulse_assist_ask_dir . 'trait-pulse-assist-ask-links-followups.php';
require_once $neo_pulse_app_pulse_assist_ask_dir . 'trait-pulse-assist-ask-module-research.php';
require_once $neo_pulse_app_pulse_assist_ask_dir . 'trait-pulse-assist-ask-context-prompts.php';

class Neo_Pulse_App_Pulse_Assist_Ask {

	use Neo_Pulse_App_Pulse_Assist_Ask_Trait_Run_Llm;
	use Neo_Pulse_App_Pulse_Assist_Ask_Trait_Prompt_Rules_Card_Finalize;
	use Neo_Pulse_App_Pulse_Assist_Ask_Trait_Links_Followups;
	use Neo_Pulse_App_Pulse_Assist_Ask_Trait_Module_Research;
	use Neo_Pulse_App_Pulse_Assist_Ask_Trait_Context_Prompts;

	/**
	 * Live NDJSON stream: progress events while the pipeline runs.
	 *
	 * @param array<string,mixed> $body Request body.
	 * @param callable            $emit Emits each NDJSON event.
	 */
	public static function stream_live( array $body, callable $emit ): void {
		$key_err = self::prepare_openrouter_key( $body );
		if ( $key_err !== null ) {
			$emit(
				array(
					'status' => 'done',
					'card'   => self::error_card( $key_err ),
				)
			);
			return;
		}

		$message = isset( $body['message'] ) ? sanitize_textarea_field( wp_unslash( (string) $body['message'] ) ) : '';
		if ( trim( $message ) === '' ) {
			$emit(
				array(
					'status' => 'done',
					'card'   => self::error_card( 'Message cannot be empty.' ),
				)
			);
			Neo_Pulse_App_Chat_Openrouter::clear_request_api_key();
			return;
		}

		$submode = self::normalize_submode( isset( $body['admin_submode'] ) ? (string) $body['admin_submode'] : 'ask' );
		$history = self::normalize_history( isset( $body['history'] ) && is_array( $body['history'] ) ? $body['history'] : array() );
		$user_id = self::current_user_id();

		if ( $submode === 'build' ) {
			$automation = Neo_Pulse_App_Pulse_Assist_Automation_Intent::match( $message, $body, 'build' );
			if ( is_array( $automation ) ) {
				$card = Neo_Pulse_App_Pulse_Assist_Automation_Intent::dispatch_card( $automation );
				Neo_Pulse_App_Chat_Openrouter::clear_request_api_key();
				$emit(
					array(
						'status'           => 'done',
						'card'             => $card,
						'sliceTeam'        => array(),
						'intentSummary'    => 'Automation dispatch',
						'actionPlanTools'  => array(),
						'actionExecuted'   => false,
						'leadAgentUsed'    => false,
					)
				);
				return;
			}

			$action = Neo_Pulse_App_Pulse_Assist_Action_Orchestrator::run( $message, $history, $body, 'build', $user_id, $emit );
			$card   = ( $action['handled'] && is_array( $action['card'] ) ) ? $action['card'] : self::build_no_action_card();
			Neo_Pulse_App_Chat_Openrouter::clear_request_api_key();
			$emit(
				array(
					'status'           => 'done',
					'card'             => $card,
					'sliceTeam'        => isset( $action['sliceTeam'] ) && is_array( $action['sliceTeam'] ) ? $action['sliceTeam'] : array(),
					'intentSummary'    => (string) ( $action['intentSummary'] ?? '' ),
					'actionPlanTools'  => isset( $action['actionPlanTools'] ) && is_array( $action['actionPlanTools'] ) ? $action['actionPlanTools'] : array(),
					'actionExecuted'   => ! empty( $action['executed'] ),
					'leadAgentUsed'    => ! empty( $action['handled'] ),
				)
			);
			return;
		}

		$research = null;
		$data_research = null;

		$skip_modules = Neo_Pulse_App_Platform_Data_Intent_Checklist::wants_inventory_listing( $message )
			|| Neo_Pulse_App_Platform_Data_Intent_Checklist::wants_scheduled_listing( $message )
			|| Neo_Pulse_App_Platform_Data_Intent_Checklist::wants_draft_listing( $message );
		if ( ! $skip_modules ) {
			$emit(
				array(
					'status' => 'phase',
					'phase'  => 'modules',
					'label'  => $submode === 'plan' ? 'Researching modules for plan…' : 'Researching modules…',
				)
			);
			$research = self::research_modules_for_message( $message, $history, $body );
		} else {
			$research = array(
				'block'            => '',
				'label'            => '',
				'moduleIds'        => array(),
				'primaryModuleIds' => array(),
				'featureIds'       => array(),
				'modules'          => array(),
				'primaryModules'   => array(),
				'features'         => array(),
			);
		}

		$data_research = Neo_Pulse_App_Pulse_Assist_Data_Tools::research_for_message(
			$message,
			$history,
			$body,
			$research,
			$emit
		);

		$action_result = Neo_Pulse_App_Pulse_Assist_Action_Orchestrator::run( $message, $history, $body, $submode, $user_id, $emit );
		if ( ! empty( $action_result['handled'] ) && is_array( $action_result['card'] ) ) {
			$card = $action_result['card'];
		} else {
			$emit(
				array(
					'status' => 'phase',
					'phase'  => 'compose',
					'label'  => $submode === 'plan' ? 'Drafting plan preview…' : 'Composing answer…',
				)
			);
			$card = self::run_for_submode( $submode, $message, $history, $body, $research, $data_research );
		}

		$emit(
			array(
				'status' => 'phase',
				'phase'  => 'format',
				'label'  => 'Formatting response…',
			)
		);

		Neo_Pulse_App_Chat_Openrouter::clear_request_api_key();

		$emit(
			array(
				'status'                => 'done',
				'card'                  => $card,
				'relatedTopics'         => isset( $card['relatedTopics'] ) && is_array( $card['relatedTopics'] ) ? $card['relatedTopics'] : array(),
				'researchedModules'     => ( $research !== null && ! empty( $research['moduleIds'] ) ) ? $research['moduleIds'] : array(),
				'researchedFeatureIds'  => ( $research !== null && ! empty( $research['featureIds'] ) ) ? $research['featureIds'] : array(),
				'researchedDataToolIds' => ( isset( $data_research ) && ! empty( $data_research['toolIds'] ) ) ? $data_research['toolIds'] : array(),
				'dataToolClassifierReason' => ( isset( $data_research['classifierReason'] ) && is_string( $data_research['classifierReason'] ) ) ? $data_research['classifierReason'] : '',
				'researchedDataBlock'   => ( isset( $data_research['block'] ) && is_string( $data_research['block'] ) ) ? self::truncate_debug_block( $data_research['block'] ) : '',
				'inventorySource'       => ( isset( $data_research['inventorySource'] ) && is_string( $data_research['inventorySource'] ) ) ? $data_research['inventorySource'] : '',
				'acfComplete'           => ! empty( $data_research['acfComplete'] ),
				'sliceTeam'             => ! empty( $action_result['sliceTeam'] ) && is_array( $action_result['sliceTeam'] ) ? $action_result['sliceTeam'] : ( ( isset( $data_research['sliceTeam'] ) && is_array( $data_research['sliceTeam'] ) ) ? $data_research['sliceTeam'] : array() ),
				'leadAgentUsed'         => ! empty( $action_result['handled'] ) || ! empty( $data_research['leadAgentUsed'] ),
				'intentSummary'         => ! empty( $action_result['intentSummary'] ) ? (string) $action_result['intentSummary'] : ( ( isset( $data_research['intentSummary'] ) && is_string( $data_research['intentSummary'] ) ) ? $data_research['intentSummary'] : '' ),
				'researchArtifacts'     => ( isset( $data_research['researchArtifacts'] ) && is_array( $data_research['researchArtifacts'] ) ) ? $data_research['researchArtifacts'] : null,
				'actionPlanTools'       => isset( $action_result['actionPlanTools'] ) && is_array( $action_result['actionPlanTools'] ) ? $action_result['actionPlanTools'] : array(),
				'actionExecuted'        => ! empty( $action_result['executed'] ),
			)
		);
	}

	/**
	 * @param array<string,mixed> $body Request body.
	 * @return array{0:int,1:array<string,mixed>}
	 */
	public static function stream( array $body ) {
		$key_err = self::prepare_openrouter_key( $body );
		if ( $key_err !== null ) {
			return array( 400, array( 'ok' => false, 'error' => $key_err ) );
		}

		$message = isset( $body['message'] ) ? sanitize_textarea_field( wp_unslash( (string) $body['message'] ) ) : '';
		if ( trim( $message ) === '' ) {
			return array( 400, array( 'ok' => false, 'error' => 'Message cannot be empty.' ) );
		}

		$submode = self::normalize_submode( isset( $body['admin_submode'] ) ? (string) $body['admin_submode'] : 'ask' );
		$history = self::normalize_history( isset( $body['history'] ) && is_array( $body['history'] ) ? $body['history'] : array() );
		$user_id = self::current_user_id();
		if ( $submode === 'build' ) {
			$action        = Neo_Pulse_App_Pulse_Assist_Action_Orchestrator::run( $message, $history, $body, 'build', $user_id, null );
			$card          = ( ! empty( $action['handled'] ) && is_array( $action['card'] ) ) ? $action['card'] : self::build_no_action_card();
			$research      = null;
			$data_research = null;
		} else {
			$research      = self::research_modules_for_message( $message, $history, $body );
			$data_research = Neo_Pulse_App_Pulse_Assist_Data_Tools::research_for_message( $message, $history, $body, $research );
			$card          = self::run_for_submode( $submode, $message, $history, $body, $research, $data_research );
		}

		Neo_Pulse_App_Chat_Openrouter::clear_request_api_key();

		$search_label = $submode === 'plan' ? 'Planning…' : 'Analyzing Pulse context…';
		if ( isset( $data_research ) && ! empty( $data_research['toolIds'] ) ) {
			$search_label = 'Querying site data…';
		} elseif ( $research !== null && ! empty( $research['label'] ) ) {
			$search_label = 'Researching ' . $research['label'] . '…';
		}
		$ack_text = $submode === 'plan' ? 'Drafting a plan preview…' : 'Looking at your Pulse workspace…';

		return array(
			200,
			array(
				'ok'     => true,
				'ndjson' => array(
					array( 'status' => 'ack', 'text' => $ack_text ),
					array( 'status' => 'thinking', 'label' => $search_label ),
					array( 'status' => 'formatting', 'label' => 'Formatting response…' ),
					array(
						'status'                => 'done',
						'card'                  => $card,
						'relatedTopics'         => isset( $card['relatedTopics'] ) && is_array( $card['relatedTopics'] ) ? $card['relatedTopics'] : array(),
						'researchedModules'     => ( $research !== null && ! empty( $research['moduleIds'] ) ) ? $research['moduleIds'] : array(),
						'researchedFeatureIds'  => ( $research !== null && ! empty( $research['featureIds'] ) ) ? $research['featureIds'] : array(),
						'researchedDataToolIds' => ( isset( $data_research ) && ! empty( $data_research['toolIds'] ) ) ? $data_research['toolIds'] : array(),
						'dataToolClassifierReason' => ( isset( $data_research['classifierReason'] ) && is_string( $data_research['classifierReason'] ) ) ? $data_research['classifierReason'] : '',
						'researchedDataBlock'   => ( isset( $data_research['block'] ) && is_string( $data_research['block'] ) ) ? self::truncate_debug_block( $data_research['block'] ) : '',
						'inventorySource'       => ( isset( $data_research['inventorySource'] ) && is_string( $data_research['inventorySource'] ) ) ? $data_research['inventorySource'] : '',
						'acfComplete'           => ! empty( $data_research['acfComplete'] ),
						'sliceTeam'             => ( isset( $data_research['sliceTeam'] ) && is_array( $data_research['sliceTeam'] ) ) ? $data_research['sliceTeam'] : array(),
						'leadAgentUsed'         => ! empty( $data_research['leadAgentUsed'] ),
						'intentSummary'         => ( isset( $data_research['intentSummary'] ) && is_string( $data_research['intentSummary'] ) ) ? $data_research['intentSummary'] : '',
						'researchArtifacts'     => ( isset( $data_research['researchArtifacts'] ) && is_array( $data_research['researchArtifacts'] ) ) ? $data_research['researchArtifacts'] : null,
					),
				),
			),
		);
	}

	/**
	 * @param array<string,mixed> $body Request body.
	 * @return array{0:int,1:array<string,mixed>}
	 */
	public static function assist( array $body ) {
		$key_err = self::prepare_openrouter_key( $body );
		if ( $key_err !== null ) {
			return array( 400, array( 'ok' => false, 'error' => $key_err ) );
		}

		$submode = self::normalize_submode( isset( $body['admin_submode'] ) ? (string) $body['admin_submode'] : 'build' );
		if ( $submode !== 'build' ) {
			Neo_Pulse_App_Chat_Openrouter::clear_request_api_key();
			return array( 400, array( 'ok' => false, 'error' => 'Use pulse-assist/stream for Ask and Plan.' ) );
		}

		$message = isset( $body['message'] ) ? sanitize_textarea_field( wp_unslash( (string) $body['message'] ) ) : '';
		$history = self::normalize_history( isset( $body['history'] ) && is_array( $body['history'] ) ? $body['history'] : array() );
		$user_id = self::current_user_id();

		$automation = Neo_Pulse_App_Pulse_Assist_Automation_Intent::match( $message, $body, 'build' );
		if ( is_array( $automation ) ) {
			Neo_Pulse_App_Chat_Openrouter::clear_request_api_key();
			return array( 200, Neo_Pulse_App_Pulse_Assist_Automation_Intent::dispatch_card( $automation ) );
		}

		$action  = Neo_Pulse_App_Pulse_Assist_Action_Orchestrator::run( $message, $history, $body, 'build', $user_id, null );
		Neo_Pulse_App_Chat_Openrouter::clear_request_api_key();
		if ( ! empty( $action['handled'] ) && is_array( $action['card'] ) ) {
			return array( 200, $action['card'] );
		}
		return array( 200, self::build_no_action_card() );
	}

	/**
	 * @return int
	 */
	private static function current_user_id(): int {
		$user = Neo_Pulse_App_Auth_Session::require_user();
		if ( ! is_array( $user ) ) {
			return 0;
		}
		return (int) ( $user['id'] ?? 0 );
	}

	/**
	 * @return array<string,mixed>
	 */
	public static function build_no_action_card() {
		return array(
			'type'           => 'prompt',
			'title'          => 'No build actions matched',
			'body'           => 'This Build request did not match a task action. Try Plan mode first, or phrase the request as creating or assigning team tasks.',
			'submode_switch' => 'plan',
			'confidence'     => 'medium',
			'relatedTopics'  => array(
				'Create tasks for a team member',
				'Switch to Plan mode',
			),
		);
	}

	/**
	 * @deprecated Use build_no_action_card()
	 * @return array<string,mixed>
	 */
	public static function build_stub_card() {
		return self::build_no_action_card();
	}

	/**
	 * @param array<string,mixed> $body Request body.
	 * @return string|null Error message when key missing.
	 */
	private static function prepare_openrouter_key( array $body ) {
		$api_key = Neo_Pulse_App_Chat_Openrouter::api_key_from_request( $body );
		if ( $api_key === '' ) {
			return 'OpenRouter API key is required. Add it in Dashboard → API Keys.';
		}
		Neo_Pulse_App_Chat_Openrouter::use_request_api_key( $api_key );
		return null;
	}
}
