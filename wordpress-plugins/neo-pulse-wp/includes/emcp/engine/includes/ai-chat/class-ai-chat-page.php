<?php
/**
 * AI Chat client config and the editor panels' engine asset.
 *
 * client_config() is everything the chat needs in the browser (REST URL and
 * nonce, key status, the fetched model list, the destructive-tool list,
 * pricing, i18n). It is the AI Chat screen's boot payload
 * (EMCP_Tools_Admin_AI_Chat_Data) and the config both editor panels localize,
 * so every context gets an identical config; only `embed`/`postId` differ.
 *
 * @package EMCP_Tools
 * @since   3.1.0
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Enqueues + configures the AI Chat client.
 *
 * @since 3.1.0
 */
class EMCP_Tools_AI_Chat_Page {

	const PAGE = 'emcp-tools-ai-chat';

	/**
	 * @since 3.1.0
	 */
	public function init(): void {
		// Nothing to hook since 3.18.0: the AI Chat screen is a React screen
		// (EMCP_Tools_Admin_AI_Chat_Data) whose boot payload is client_config().
	}

	/**
	 * The chat engine both editor panels load: the bundle built from
	 * pro/admin-src/chat/editor, with its webpack dependencies and version.
	 *
	 * @since 3.18.0
	 * @return array{src:string, deps:array, ver:string}
	 */
	public static function editor_engine_asset(): array {
		$rel   = 'assets/admin/build-pro/chat-editor.js';
		$meta  = array();
		$asset = EMCP_Tools_Pro_Loader::path( 'assets/admin/build-pro/chat-editor.asset.php' );
		if ( '' !== $asset ) {
			$meta = include $asset;
		}
		return array(
			'src'  => EMCP_Tools_Pro_Loader::url( $rel ),
			'deps' => isset( $meta['dependencies'] ) ? (array) $meta['dependencies'] : array(),
			'ver'  => isset( $meta['version'] ) ? (string) $meta['version'] : EMCP_Tools_Pro_Loader::asset_version( $rel ),
		);
	}

	/**
	 * The full client config for the chat, shared by the admin page and the
	 * Elementor in-editor window. `$embed`/`$post_id` are the only per-context
	 * fields ('' / 0 for the admin page).
	 *
	 * @since 3.1.0
	 * @param string $embed   Embed context id ('' | 'elementor').
	 * @param int    $post_id Current post id when embedded (0 otherwise).
	 * @return array
	 */
	public static function client_config( string $embed = '', int $post_id = 0 ): array {
		// Strip the emcp-tools/ prefix so the JS gate matches the Anthropic tool
		// names (which can't contain "/").
		$destructive = array_map(
			static function ( $n ) {
				return str_replace( 'emcp-tools/', '', $n );
			},
			EMCP_Tools_AI_Chat_Controller::destructive_tool_names()
		);

		$models   = array();
		$defaults = array();
		$chosen   = array();
		foreach ( EMCP_Tools_AI_Providers::ids() as $pid ) {
			$models[ $pid ]   = EMCP_Tools_AI_Chat_Provider::get_models( $pid );
			$defaults[ $pid ] = EMCP_Tools_AI_Chat_Provider::default_model( $pid );
			$chosen[ $pid ]   = EMCP_Tools_AI_Chat_Provider::get_chosen_default( $pid );
		}
		$convos = class_exists( 'EMCP_Tools_AI_Chat_Store' ) ? EMCP_Tools_AI_Chat_Store::list_conversations() : array();

		return array(
			'restBase'      => esc_url_raw( rest_url( EMCP_Tools_AI_Chat_Controller::NAMESPACE ) ),
			'nonce'         => wp_create_nonce( 'wp_rest' ),
			'hasAccess'     => EMCP_Tools_AI_Chat_Provider::has_access(),
			'providers'     => EMCP_Tools_AI_Providers::for_client(),
			'connections'   => EMCP_Tools_AI_Chat_Provider::connections(),
			'models'        => $models,
			'defaults'      => $defaults,
			'chosen'        => $chosen,
			'conversations' => $convos,
			// Resume the last-used provider on reload (see go() in ai-chat.js).
			'lastProvider'  => EMCP_Tools_AI_Chat_Provider::get_last_provider(),
			// The settings screen renders straight from this initial config, so it
			// must carry the same keys state_payload() returns — otherwise the
			// built-in controls, the tool-group list, and the local-runtime cards
			// are all missing until some REST call happens to refresh state.
			'settings'      => class_exists( 'EMCP_Tools_AI_Chat_Settings' )
				? EMCP_Tools_AI_Chat_Settings::for_client()
				: array(),
			'allGroups'     => ( class_exists( 'EMCP_Tools_AI_Chat_Tool_Groups' ) && class_exists( 'EMCP_Tools_Plugin' ) )
				? EMCP_Tools_AI_Chat_Tool_Groups::loadable_for( EMCP_Tools_Plugin::instance()->get_active_ability_names() )
				: array(),
			'localAvail'    => self::local_availability(),
			'hasAnyKey'     => EMCP_Tools_AI_Chat_Provider::has_any_key(),
			'destructive'   => array_values( $destructive ),
			'maxIterations' => 20,
			'defaultBudget' => 5,
			'upgradeUrl'    => function_exists( 'emcp_tools_upgrade_url' ) ? emcp_tools_upgrade_url() : '',
			'siteUrl'       => site_url(),
			'wpVersion'     => get_bloginfo( 'version' ),
			'elementorVer'  => defined( 'ELEMENTOR_VERSION' ) ? ELEMENTOR_VERSION : '',
			'elementorPro'  => defined( 'ELEMENTOR_PRO_VERSION' ),
			'userName'      => wp_get_current_user()->display_name,
			// Authoritative, EMCP-aware system prompt built server-side from the
			// live active-tool set (class-ai-chat-prompt.php). The client sends
			// this verbatim as the system block for every provider.
			'systemPrompt'  => class_exists( 'EMCP_Tools_AI_Chat_Prompt' ) ? EMCP_Tools_AI_Chat_Prompt::build() : '',
			// Per-context: '' / 0 on the admin page; 'elementor' + the current
			// document id inside the Elementor editor.
			'embed'         => $embed,
			'postId'        => $post_id,
			// Attachment limits + accepted types for the composer (images are
			// downscaled client-side; text files are inlined). Kept in one place
			// so the JS never hardcodes them.
			'attach'        => array(
				'maxCount'      => 5,
				'maxImageBytes' => 2 * 1024 * 1024,   // post-downscale soft cap.
				'maxTextBytes'  => 100 * 1024,        // read cap for text files.
				'maxEdge'       => 1568,              // downscale long-edge target (px).
				'imageTypes'    => array( 'image/png', 'image/jpeg', 'image/webp', 'image/gif' ),
				'textExts'      => array( 'txt', 'md', 'markdown', 'csv', 'json', 'log', 'html', 'css', 'js', 'ts', 'php', 'xml', 'yml', 'yaml', 'ini', 'sql' ),
				'accept'        => 'image/png,image/jpeg,image/webp,image/gif,.txt,.md,.markdown,.csv,.json,.log,.html,.css,.js,.ts,.php,.xml,.yml,.yaml,.ini,.sql',
			),
			// Rough list pricing per million tokens (USD): [input, output]. Keys
			// are matched as substrings of the model id; first match wins, so
			// order specific → generic. Best-effort — used only for the cost
			// estimate footer. (Anthropic cache write ≈ 1.25× in, read ≈ 0.1×.)
			'pricing'       => array(
				'opus'        => array( 15.0, 75.0 ),
				'sonnet'      => array( 3.0, 15.0 ),
				'haiku'       => array( 0.8, 4.0 ),
				'gpt-4o-mini' => array( 0.15, 0.6 ),
				'gpt-4o'      => array( 2.5, 10.0 ),
				'o3-mini'     => array( 1.1, 4.4 ),
				'o3'          => array( 2.0, 8.0 ),
				'o1'          => array( 15.0, 60.0 ),
				'gpt-4'       => array( 30.0, 60.0 ),
				'gpt-3.5'     => array( 0.5, 1.5 ),
				'flash'       => array( 0.3, 2.5 ),
				'gemini'      => array( 1.25, 10.0 ),
			),
			'i18n'          => self::i18n_strings(),
			'suggestions'   => self::suggestions( $embed ),
			// Counted per user; the script keeps the most used prompt first and
			// picks the rest at random from the unused ones. An object even when
			// empty, so the script never receives a JSON list.
			'suggestionUsage' => (object) EMCP_Tools_AI_Chat_Suggestions::usage(),
			'suggestionsShown' => EMCP_Tools_AI_Chat_Suggestions::SHOWN,
		);
	}

	/**
	 * The starter prompt pool for a context (see EMCP_Tools_AI_Chat_Suggestions).
	 *
	 * @param string $embed '' for the AI Chat page, 'elementor' or 'gutenberg' in an editor.
	 * @return array<int,array{id:string,label:string,prompt:string}>
	 */
	public static function suggestions( string $embed = '' ): array {
		return EMCP_Tools_AI_Chat_Suggestions::pool( $embed );
	}

	/**
	 * Which local runtimes (Ollama, LM Studio) are answering on loopback.
	 *
	 * @since 3.6.0
	 * @return array<string,bool> Provider id => reachable.
	 */
	private static function local_availability(): array {
		$out = array();
		if ( ! class_exists( 'EMCP_Tools_AI_Providers' ) ) {
			return $out;
		}
		foreach ( EMCP_Tools_AI_Providers::local_ids() as $lid ) {
			$out[ $lid ] = EMCP_Tools_AI_Providers::local_available( $lid );
		}
		return $out;
	}

	/**
	 * The chat i18n strings (kept separate so both the config and any future
	 * server-rendered labels share one list).
	 *
	 * @since 3.1.0
	 * @return array<string,string>
	 */
	private static function i18n_strings(): array {
		return array(
			'thinking'      => __( 'Thinking…', 'emcp-tools' ),
			'greeting'      => __( 'What should we build?', 'emcp-tools' ),
			/* translators: %s: the user's first name. */
			'greetingNamed' => __( 'Hi %s, what should we build?', 'emcp-tools' ),
			'suggestions'   => __( 'Suggested prompts', 'emcp-tools' ),
			'greetingSub'   => __( 'Describe a page and I will build it on your site: containers, widgets, content and styling. Or pick a starting point below.', 'emcp-tools' ),
			'calling'       => __( 'Calling', 'emcp-tools' ),
			'approve'       => __( 'Approve', 'emcp-tools' ),
			'reject'        => __( 'Reject', 'emcp-tools' ),
			'rejected'      => __( 'You rejected this action.', 'emcp-tools' ),
			'send'          => __( 'Send', 'emcp-tools' ),
			'stop'          => __( 'Stop', 'emcp-tools' ),
			'validating'    => __( 'Validating…', 'emcp-tools' ),
			'saved'         => __( 'Key saved.', 'emcp-tools' ),
			'refreshing'    => __( 'Refreshing…', 'emcp-tools' ),
			'thisTurn'      => __( 'This turn', 'emcp-tools' ),
			'convTotal'     => __( 'Conversation total', 'emcp-tools' ),
			'tokens'        => __( 'tokens', 'emcp-tools' ),
			'loopStopped'   => __( 'Stopped, exceeded 50 tool calls in one turn. The AI may be looping; refine your request.', 'emcp-tools' ),
			'budgetHit'     => __( 'Budget cap reached for this conversation. Raise it in Settings or start a new chat.', 'emcp-tools' ),
			'apiError'      => __( 'Provider API error', 'emcp-tools' ),
			'newChat'       => __( 'New chat', 'emcp-tools' ),
			'connect'       => __( 'Connect', 'emcp-tools' ),
			'disconnect'    => __( 'Disconnect', 'emcp-tools' ),
			'connected'     => __( 'Connected', 'emcp-tools' ),
			'notConnected'  => __( 'Not connected', 'emcp-tools' ),
			'getApiKey'     => __( 'Get an API key →', 'emcp-tools' ),
			// Built-in controls (settings screen, left column).
			'webFetchTitle' => __( 'Web fetch', 'emcp-tools' ),
			'webFetchDesc'  => __( 'Let the assistant read a web page you point it at. Fetching runs on the server and is SSRF-guarded.', 'emcp-tools' ),
			'approveTitle'  => __( 'Approve destructive actions', 'emcp-tools' ),
			'approveDesc'   => __( 'Ask before deletes and overwrites. Turning this off lets the assistant run destructive tools without confirming, leave it on unless you know why.', 'emcp-tools' ),
			'noGroups'      => __( 'No loadable tool groups, enable tools in Neo EMCP → Tools.', 'emcp-tools' ),
			// Local runtimes (Ollama).
			'useLocal'      => __( 'Use this runtime', 'emcp-tools' ),
			'noKeyNeeded'   => __( 'Detected on this machine · no API key needed', 'emcp-tools' ),
			'refreshModels' => __( 'Refresh models', 'emcp-tools' ),
			'emptyStalled'  => __( 'The model returned an empty response. Local models sometimes stall, try a more capable model, raise its context length, or rephrase the request.', 'emcp-tools' ),
			// Vision describe fallback (text-only models).
			'visionFailed'  => __( 'Could not read the image.', 'emcp-tools' ),
			'builtinReader' => __( 'the built-in image reader', 'emcp-tools' ),
			'visionHint'    => __( 'This model can’t see images, and no local vision model was found, using the built-in reader (size, colours, format). For a full description, run “ollama pull llava” (or load a vision model in LM Studio) and Refresh models, or switch to Claude / GPT-4o / Gemini.', 'emcp-tools' ),
			'refreshing'    => __( 'Refreshing…', 'emcp-tools' ),
			'detected'      => __( 'Detected', 'emcp-tools' ),
			'notRunning'    => __( 'Not running', 'emcp-tools' ),
			'localNotRunning' => __( 'Start it on this machine, then reload, no API key needed.', 'emcp-tools' ),
			'getLocal'      => __( 'Download →', 'emcp-tools' ),
			'noModelsYet'   => __( 'Connect a provider to choose a model.', 'emcp-tools' ),
			'providerLabel' => __( 'Provider', 'emcp-tools' ),
			'modelLabel'    => __( 'Model', 'emcp-tools' ),
			'searchModels'  => __( 'Search models…', 'emcp-tools' ),
			'noMatches'     => __( 'No matches', 'emcp-tools' ),
			'selectModel'   => __( 'Select model…', 'emcp-tools' ),
			'freeGroup'     => __( 'Free', 'emcp-tools' ),
			'defaultModel'  => __( 'Default model', 'emcp-tools' ),
			/* translators: %d is the maximum number of attachments per message. */
			'attachMax'     => __( 'You can attach up to %d files per message.', 'emcp-tools' ),
			'attachRemove'  => __( 'Remove attachment', 'emcp-tools' ),
			'attachType'    => __( 'Unsupported file type, attach images or text files only.', 'emcp-tools' ),
			'attachTooBig'  => __( 'That file is too large to attach.', 'emcp-tools' ),
			'attachFailed'  => __( 'Could not read that file.', 'emcp-tools' ),
			'attachTrunc'   => __( '…(truncated)', 'emcp-tools' ),
			'deleteChat'    => __( 'Delete chat', 'emcp-tools' ),
			'deleteTitle'   => __( 'Delete chat?', 'emcp-tools' ),
			/* translators: %s is the conversation title. */
			'deleteBody'    => __( 'This permanently deletes “%s”. This can’t be undone.', 'emcp-tools' ),
			'delete'        => __( 'Delete', 'emcp-tools' ),
			'cancel'        => __( 'Cancel', 'emcp-tools' ),
			'applyingEdit'  => __( 'Changes applied to the editor.', 'emcp-tools' ),
			'reloadEditor'  => __( 'Reload if you don’t see them', 'emcp-tools' ),
			'historyEmpty'  => __( 'No chats for this page yet.', 'emcp-tools' ),
			'restore'       => __( 'Restore', 'emcp-tools' ),
			'minimize'      => __( 'Minimize', 'emcp-tools' ),
			'editorNoModel' => __( 'Connect a provider and pick an in-editor model to use Ask AI.', 'emcp-tools' ),
			'openAiChat'    => __( 'Open Neo EMCP → AI Chat', 'emcp-tools' ),
			'editorModelLabel' => __( 'In-editor Ask AI model', 'emcp-tools' ),
			'editorModelHelp'  => __( 'Used by the Ask AI button inside the Elementor editor, no picker is shown there.', 'emcp-tools' ),
		);
	}
}
