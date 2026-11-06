<?php
/**
 * Three-phase sub-agent orchestration for the NEO Pulse Chat widget.
 *
 * Phase A: Classify intent + select relevant content (fast model).
 * Phase B: Reason and draft an answer (capable model).
 * The card is then built deterministically (build_card_from_answer).
 *
 * @package Neo_Pulse_Wp
 */

defined( 'ABSPATH' ) || exit;

$neo_pulse_wp_chat_agents_dir = __DIR__ . '/';
require_once $neo_pulse_wp_chat_agents_dir . 'trait-chat-agents-gate-classify.php';
require_once $neo_pulse_wp_chat_agents_dir . 'trait-chat-agents-phases.php';
require_once $neo_pulse_wp_chat_agents_dir . 'trait-chat-agents-answer-assembly.php';
require_once $neo_pulse_wp_chat_agents_dir . 'trait-chat-agents-followup-generation.php';
require_once $neo_pulse_wp_chat_agents_dir . 'trait-chat-agents-followup-helpers.php';
require_once $neo_pulse_wp_chat_agents_dir . 'trait-chat-agents-openrouter-related.php';

class Neo_Pulse_Wp_Chat_Agents {

	const FAST_MODEL              = 'google/gemini-2.5-flash-lite';
	const REASON_MODEL            = 'google/gemini-2.5-flash';
	const FAST_PATH_SCORE         = 8.0;
	const NARROW_INVENTORY_LIMIT  = 30;
	const MIN_RELATED_TOPICS      = 2;
	const MAX_RELATED_TOPICS      = 2;
	const ACK_MAX_TOKENS          = 128;
	const CLASSIFY_MAX_TOKENS     = 2048;
	const REASON_MAX_TOKENS       = 8192;
	const LINK_RESOLVE_MAX_TOKENS = 2048;
	const TITLE_MAX_TOKENS        = 64;
	const FOLLOWUP_MAX_TOKENS     = 512;
	const TEMPLATE_FORMAT_MAX_TOKENS = 2048;

	use Neo_Pulse_Wp_Chat_Agents_Trait_GateClassify;
	use Neo_Pulse_Wp_Chat_Agents_Trait_Phases;
	use Neo_Pulse_Wp_Chat_Agents_Trait_AnswerAssembly;
	use Neo_Pulse_Wp_Chat_Agents_Trait_FollowupGeneration;
	use Neo_Pulse_Wp_Chat_Agents_Trait_FollowupHelpers;
	use Neo_Pulse_Wp_Chat_Agents_Trait_OpenrouterRelated;
}
