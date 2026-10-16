<?php
/**
 * AI Chat REST controller — `emcp-tools/v1` routes for the in-plugin chat:
 * per-provider API-key management, fetched model lists, single-ability
 * execution, and the Anthropic-format tool list.
 *
 * All routes are `manage_options` + Pro gated. `/execute-ability` re-checks the
 * destructive-tool approval gate server-side and only runs tools in the same
 * active set the MCP server exposes.
 *
 * @package EMCP_Tools
 * @since   3.1.0
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * REST controller for the AI Chat feature.
 *
 * @since 3.1.0
 */
class EMCP_Tools_AI_Chat_Controller {

	const NAMESPACE = 'emcp-tools/v1';

	/**
	 * Tools requiring explicit per-call approval (kept in sync with the JS gate;
	 * re-checked here). Names are the full `emcp-tools/…` ability names.
	 * (AI_CHAT_PLAN.md §3.5)
	 *
	 * @var string[]
	 */
	const DESTRUCTIVE_TOOLS = array(
		// Registers / executes code on the site.
		'emcp-tools/create-custom-widget',
		'emcp-tools/update-custom-widget',
		'emcp-tools/add-custom-js',
		'emcp-tools/add-code-snippet',
		'emcp-tools/add-custom-css',
		// Destructive Elementor edits.
		'emcp-tools/delete-page-content',
		'emcp-tools/remove-element',
		'emcp-tools/delete-custom-widget',
		'emcp-tools/delete-php-snippet',
		// Site-wide visual changes.
		'emcp-tools/update-global-colors',
		'emcp-tools/update-global-typography',
		'emcp-tools/apply-brand-kit',
		'emcp-tools/replace-system-colors',
		'emcp-tools/replace-system-typography',
		// Beyond-Elementor destructive / high-impact writes (v3.0.0 domains). Most
		// ship disabled-by-default at the MCP level, but the gate must still cover
		// them for when an admin enables them on the Tools tab.
		'emcp-tools/delete-post',
		'emcp-tools/delete-media',
		'emcp-tools/update-settings',
		'emcp-tools/create-user',
		'emcp-tools/update-user',
		// Plugins & themes mutations (install/enable executes third-party code).
		'emcp-tools/install-plugin',
		'emcp-tools/activate-plugin',
		'emcp-tools/deactivate-plugin',
		'emcp-tools/update-plugin',
		'emcp-tools/delete-plugin',
		'emcp-tools/install-theme',
		'emcp-tools/switch-theme',
		'emcp-tools/update-theme',
		'emcp-tools/delete-theme',
		// Filesystem writes — effectively remote code execution.
		'emcp-tools/write-file',
		'emcp-tools/edit-file',
		'emcp-tools/delete-file',
		// Structured database writes.
		'emcp-tools/insert-row',
		'emcp-tools/update-rows',
		'emcp-tools/delete-rows',
	);

	/**
	 * Whether an ability needs explicit human approval before it may run.
	 *
	 * The canonical source is the ability's own `destructive` annotation, the
	 * same metadata the MCP tool list and the dispatcher publish. A second,
	 * hand-maintained name list silently went stale as new destructive tools
	 * shipped (delete-redirect, remove-block, migrate-site, sync-to-live and
	 * others were never added), so destructive work ran without the approval
	 * the setting promises. DESTRUCTIVE_TOOLS is still honoured as an extra
	 * always-approve list for high-impact tools that are not annotated
	 * destructive (e.g. site-wide colour/typography rewrites).
	 *
	 * FAILS CLOSED: if the ability or its metadata cannot be read, approval is
	 * required rather than skipped.
	 *
	 * @param string $ability_name Ability name.
	 * @param object|null $ability  Registered ability, when already resolved.
	 * @return bool
	 */
	/**
	 * Every tool the browser must gate behind human approval.
	 *
	 * Derived from ability metadata for the same reason requires_approval() is:
	 * a destructive tool added later must be covered without anyone remembering
	 * to edit a list. The static constant is unioned in as a floor.
	 *
	 * Keeping this in step with the server matters for usability, not just
	 * safety. If the server demands approval for a tool the browser cannot
	 * present, the call is simply rejected and the user has no way to allow it.
	 *
	 * @since 3.12.4
	 * @return string[] Fully qualified ability names.
	 */
	public static function destructive_tool_names(): array {
		$names = self::DESTRUCTIVE_TOOLS;
		if ( class_exists( 'WP_Abilities_Registry' ) ) {
			foreach ( WP_Abilities_Registry::get_instance()->get_all_registered() as $name => $ability ) {
				if ( 0 !== strpos( (string) $name, 'emcp-tools/' ) ) {
					continue;
				}
				if ( ! is_object( $ability ) || ! method_exists( $ability, 'get_meta' ) ) {
					continue;
				}
				$meta = (array) $ability->get_meta();
				if ( ! empty( $meta['annotations']['destructive'] ) ) {
					$names[] = (string) $name;
				}
			}
		}
		return array_values( array_unique( $names ) );
	}

	public static function requires_approval( string $ability_name, $ability = null ): bool {
		if ( in_array( $ability_name, self::DESTRUCTIVE_TOOLS, true ) ) {
			return true;
		}
		if ( null === $ability && function_exists( 'wp_get_ability' ) ) {
			$ability = wp_get_ability( $ability_name );
		}
		if ( ! is_object( $ability ) || ! method_exists( $ability, 'get_meta' ) ) {
			return true; // cannot read metadata -> fail closed.
		}
		$meta = (array) $ability->get_meta();
		if ( ! isset( $meta['annotations'] ) || ! is_array( $meta['annotations'] ) ) {
			return true; // malformed/absent annotations -> fail closed.
		}
		return ! empty( $meta['annotations']['destructive'] );
	}

	/**
	 * @since 3.1.0
	 */
	public function register_hooks(): void {
		add_action( 'rest_api_init', array( $this, 'register_routes' ) );
	}

	/**
	 * @since 3.1.0
	 * @return bool
	 */
	public static function permission(): bool {
		return current_user_can( 'manage_options' ) && EMCP_Tools_AI_Chat_Provider::has_access();
	}

	/**
	 * @since 3.1.0
	 */
	public function register_routes(): void {
		$perm = array( __CLASS__, 'permission' );

		register_rest_route(
			self::NAMESPACE,
			'/api-key',
			array(
				array(
					'methods'             => 'POST',
					'permission_callback' => $perm,
					'callback'            => array( $this, 'save_api_key' ),
					'args'                => array(
						'provider' => array( 'type' => 'string', 'required' => true ),
						'key'      => array( 'type' => 'string', 'required' => true ),
					),
				),
				array(
					'methods'             => 'DELETE',
					'permission_callback' => $perm,
					'callback'            => array( $this, 'delete_api_key' ),
					'args'                => array(
						'provider' => array( 'type' => 'string', 'required' => true ),
					),
				),
			)
		);

		register_rest_route( self::NAMESPACE, '/api-key/status', array(
			'methods'             => 'GET',
			'permission_callback' => $perm,
			'callback'            => array( $this, 'api_key_status' ),
		) );

		register_rest_route( self::NAMESPACE, '/api-key/reveal', array(
			'methods'             => 'GET',
			'permission_callback' => $perm,
			'callback'            => array( $this, 'reveal_api_key' ),
			'args'                => array( 'provider' => array( 'type' => 'string', 'required' => true ) ),
		) );

		register_rest_route( self::NAMESPACE, '/models/refresh', array(
			'methods'             => 'POST',
			'permission_callback' => $perm,
			'callback'            => array( $this, 'refresh_models' ),
			'args'                => array( 'provider' => array( 'type' => 'string', 'required' => true ) ),
		) );

		// Describe an image via a LOCAL vision model (text-only-model fallback).
		register_rest_route( self::NAMESPACE, '/describe-image', array(
			'methods'             => 'POST',
			'permission_callback' => $perm,
			'callback'            => array( $this, 'describe_image' ),
			'args'                => array(
				'provider'   => array( 'type' => 'string', 'required' => true ), // 'builtin' or a local runtime id.
				'model'      => array( 'type' => 'string', 'default' => '' ),     // required only for the local-VLM path.
				'data'       => array( 'type' => 'string', 'required' => true ),
				'media_type' => array( 'type' => 'string', 'default' => 'image/jpeg' ),
			),
		) );

		// Server relay for providers that refuse browser requests (OpenCode Go).
		// The destination comes from the provider table, never from the request.
		register_rest_route( self::NAMESPACE, '/chat-relay', array(
			'methods'             => 'POST',
			'permission_callback' => $perm,
			'callback'            => array( 'EMCP_Tools_AI_Chat_Relay', 'handle' ),
		) );

		register_rest_route( self::NAMESPACE, '/abilities', array(
			'methods'             => 'GET',
			'permission_callback' => $perm,
			'callback'            => array( $this, 'get_abilities' ),
		) );

		// Fresh Elementor element tree for a page — used by the in-editor panel to
		// reset the live editing model in place (no full page reload).
		register_rest_route( self::NAMESPACE, '/page-elements', array(
			'methods'             => 'GET',
			'permission_callback' => $perm,
			'callback'            => array( $this, 'get_page_elements' ),
			'args'                => array( 'post_id' => array( 'type' => 'integer', 'required' => true ) ),
		) );

		register_rest_route( self::NAMESPACE, '/post-content', array(
			'methods'             => 'GET',
			'permission_callback' => $perm,
			'callback'            => array( $this, 'get_post_content' ),
			'args'                => array( 'post_id' => array( 'type' => 'integer', 'required' => true ) ),
		) );

		register_rest_route( self::NAMESPACE, '/execute-ability', array(
			'methods'             => 'POST',
			'permission_callback' => $perm,
			'callback'            => array( $this, 'execute_ability' ),
			'args'                => array(
				'ability'  => array( 'type' => 'string', 'required' => true ),
				'args'     => array( 'type' => 'object', 'default' => array() ),
				'approved' => array( 'type' => 'boolean', 'default' => false ),
				// Optional, additive (spec 9.2): groups the call into its conversation's session.
				'conversation_key' => array(
					'type'    => 'string',
					'pattern' => '^[a-z0-9-]{8,64}$',
				),
			),
		) );

		register_rest_route( self::NAMESPACE, '/web-fetch', array(
			'methods'             => 'POST',
			'permission_callback' => $perm,
			'callback'            => array( $this, 'web_fetch' ),
			'args'                => array(
				'url' => array( 'type' => 'string', 'required' => true ),
				// Deliberately NOT an enum: a rejected value costs the model a
				// whole turn. fetch() coerces anything but 'html' to 'text'.
				'format' => array( 'type' => 'string', 'default' => 'text' ),
			),
		) );

		register_rest_route( self::NAMESPACE, '/default-model', array(
			'methods'             => 'POST',
			'permission_callback' => $perm,
			'callback'            => array( $this, 'set_default_model' ),
			'args'                => array(
				'provider' => array( 'type' => 'string', 'required' => true ),
				'model'    => array( 'type' => 'string', 'default' => '' ),
			),
		) );

		// Counts one use of a starter prompt for the current user (new-chat bubbles).
		register_rest_route( self::NAMESPACE, '/suggestions/used', array(
			'methods'             => 'POST',
			'permission_callback' => $perm,
			'callback'            => array( $this, 'record_suggestion' ),
			'args'                => array(
				'id' => array( 'type' => 'string', 'required' => true ),
			),
		) );

		// The provider+model the in-editor "Ask AI" FAB uses silently (no picker).
		register_rest_route( self::NAMESPACE, '/editor-default', array(
			'methods'             => 'POST',
			'permission_callback' => $perm,
			'callback'            => array( $this, 'set_editor_default' ),
			'args'                => array(
				'provider' => array( 'type' => 'string', 'default' => '' ),
				'model'    => array( 'type' => 'string', 'default' => '' ),
			),
		) );

		// Built-in controls (web fetch, destructive-action approval, tool access).
		register_rest_route( self::NAMESPACE, '/settings', array(
			'methods'             => 'POST',
			'permission_callback' => $perm,
			'callback'            => array( $this, 'save_settings' ),
			'args'                => array(
				'web_fetch'           => array( 'type' => 'boolean' ),
				'approve_destructive' => array( 'type' => 'boolean' ),
				'disabled_groups'     => array( 'type' => 'array' ),
			),
		) );

		register_rest_route( self::NAMESPACE, '/conversations', array(
			array( 'methods' => 'GET', 'permission_callback' => $perm, 'callback' => array( $this, 'list_conversations' ) ),
			array( 'methods' => 'POST', 'permission_callback' => $perm, 'callback' => array( $this, 'save_conversation' ) ),
		) );
		register_rest_route( self::NAMESPACE, '/conversations/(?P<id>\d+)', array(
			array( 'methods' => 'GET', 'permission_callback' => $perm, 'callback' => array( $this, 'get_conversation' ) ),
			array( 'methods' => 'DELETE', 'permission_callback' => $perm, 'callback' => array( $this, 'delete_conversation' ) ),
		) );
	}

	// ── default model + conversations ─────────────────────────────────────────

	/**
	 * Count one use of a starter prompt for the current user.
	 *
	 * @since 3.18.0
	 * @param \WP_REST_Request $request Request.
	 * @return \WP_REST_Response|\WP_Error
	 */
	public function record_suggestion( \WP_REST_Request $request ) {
		$usage = EMCP_Tools_AI_Chat_Suggestions::record( (string) $request->get_param( 'id' ) );
		if ( is_wp_error( $usage ) ) {
			return $usage;
		}
		return rest_ensure_response( array( 'usage' => (object) $usage ) );
	}

	/**
	 * @since 3.1.0
	 * @param \WP_REST_Request $request Request.
	 * @return \WP_REST_Response|\WP_Error
	 */
	public function set_default_model( \WP_REST_Request $request ) {
		$provider = sanitize_key( (string) $request->get_param( 'provider' ) );
		if ( ! EMCP_Tools_AI_Providers::exists( $provider ) ) {
			return new \WP_Error( 'unknown_provider', __( 'Unknown provider.', 'emcp-tools' ), array( 'status' => 400 ) );
		}
		EMCP_Tools_AI_Chat_Provider::set_chosen_default( $provider, sanitize_text_field( (string) $request->get_param( 'model' ) ) );
		// Picking a provider/model in the chat header is also "where I left off",
		// so remember it for the next page load.
		EMCP_Tools_AI_Chat_Provider::set_last_provider( $provider );
		return rest_ensure_response( $this->state_payload() );
	}

	/**
	 * @since 3.1.0
	 * @param \WP_REST_Request $request Request.
	 * @return \WP_REST_Response|\WP_Error
	 */
	public function set_editor_default( \WP_REST_Request $request ) {
		$provider = sanitize_key( (string) $request->get_param( 'provider' ) );
		if ( '' !== $provider && ! EMCP_Tools_AI_Providers::exists( $provider ) ) {
			return new \WP_Error( 'unknown_provider', __( 'Unknown provider.', 'emcp-tools' ), array( 'status' => 400 ) );
		}
		EMCP_Tools_AI_Chat_Provider::set_editor_default( $provider, sanitize_text_field( (string) $request->get_param( 'model' ) ) );
		return rest_ensure_response( $this->state_payload() );
	}

	/** @since 3.1.0 @return \WP_REST_Response */
	public function list_conversations( \WP_REST_Request $request ) {
		$post_id = $request->get_param( 'post_id' ) ? (int) $request->get_param( 'post_id' ) : 0;
		$list    = $post_id
			? EMCP_Tools_AI_Chat_Store::list_for_post( $post_id )
			: EMCP_Tools_AI_Chat_Store::list_conversations();
		return rest_ensure_response( array( 'conversations' => $list ) );
	}

	/**
	 * @since 3.1.0
	 * @param \WP_REST_Request $request Request.
	 * @return \WP_REST_Response|\WP_Error
	 */
	public function get_conversation( \WP_REST_Request $request ) {
		$c = EMCP_Tools_AI_Chat_Store::get( (int) $request['id'] );
		if ( null === $c ) {
			return new \WP_Error( 'not_found', __( 'Conversation not found.', 'emcp-tools' ), array( 'status' => 404 ) );
		}
		return rest_ensure_response( $c );
	}

	/**
	 * @since 3.1.0
	 * @param \WP_REST_Request $request Request.
	 * @return \WP_REST_Response|\WP_Error
	 */
	public function save_conversation( \WP_REST_Request $request ) {
		$id      = $request->get_param( 'id' ) ? (int) $request->get_param( 'id' ) : null;
		$post_id = $request->get_param( 'post_id' ) ? (int) $request->get_param( 'post_id' ) : 0;
		$res     = EMCP_Tools_AI_Chat_Store::save(
			$id,
			(string) $request->get_param( 'title' ),
			sanitize_key( (string) $request->get_param( 'provider' ) ),
			sanitize_text_field( (string) $request->get_param( 'model' ) ),
			(array) $request->get_param( 'messages' ),
			null, // current user
			$post_id ?: null,
			(string) $request->get_param( 'conversation_key' )
		);
		if ( is_wp_error( $res ) ) {
			return $res;
		}
		// Return the list scoped to the same context the client is showing: the
		// page's threads in-editor, all threads on the admin page.
		$list = $post_id
			? EMCP_Tools_AI_Chat_Store::list_for_post( $post_id )
			: EMCP_Tools_AI_Chat_Store::list_conversations();
		return rest_ensure_response( array( 'id' => $res, 'conversations' => $list ) );
	}

	/**
	 * @since 3.1.0
	 * @param \WP_REST_Request $request Request.
	 * @return \WP_REST_Response
	 */
	public function delete_conversation( \WP_REST_Request $request ) {
		$ok      = EMCP_Tools_AI_Chat_Store::delete( (int) $request['id'] );
		$post_id = $request->get_param( 'post_id' ) ? (int) $request->get_param( 'post_id' ) : 0;
		$list    = $post_id
			? EMCP_Tools_AI_Chat_Store::list_for_post( $post_id )
			: EMCP_Tools_AI_Chat_Store::list_conversations();
		return rest_ensure_response( array( 'deleted' => $ok, 'conversations' => $list ) );
	}

	// ── keys ────────────────────────────────────────────────────────────────

	/**
	 * Validates the key against the provider's model endpoint, stores it, and
	 * caches the returned models.
	 *
	 * @since 3.1.0
	 * @param \WP_REST_Request $request Request.
	 * @return \WP_REST_Response|\WP_Error
	 */
	public function save_api_key( \WP_REST_Request $request ) {
		$provider = sanitize_key( (string) $request->get_param( 'provider' ) );
		$key      = (string) $request->get_param( 'key' );

		if ( ! EMCP_Tools_AI_Providers::exists( $provider ) ) {
			return new \WP_Error( 'unknown_provider', __( 'Unknown provider.', 'emcp-tools' ), array( 'status' => 400 ) );
		}

		// Local runtimes (Ollama) have no account and no key. Store a sentinel so
		// the rest of the connection plumbing (has_key/connections/masked) works
		// unchanged; nothing is ever sent as credentials.
		$is_local = EMCP_Tools_AI_Providers::is_local( $provider );
		if ( '' === trim( $key ) ) {
			if ( ! $is_local ) {
				return new \WP_Error( 'missing_key', __( 'API key is required.', 'emcp-tools' ), array( 'status' => 400 ) );
			}
			$key = 'local';
		}

		$models = EMCP_Tools_AI_Chat_Provider::fetch_models( $provider, $key );
		if ( is_wp_error( $models ) ) {
			return $models;
		}
		if ( ! EMCP_Tools_AI_Chat_Provider::save_key( $provider, $key ) ) {
			return new \WP_Error( 'store_failed', __( 'Could not securely store the key.', 'emcp-tools' ), array( 'status' => 500 ) );
		}
		EMCP_Tools_AI_Chat_Provider::store_models( $provider, $models, time() );
		EMCP_Tools_AI_Chat_Provider::maybe_schedule_refresh();

		return rest_ensure_response( $this->state_payload() );
	}

	/**
	 * Describes an attached image via a local vision model (server-side loopback).
	 *
	 * @since 3.6.0
	 * @param \WP_REST_Request $request Request.
	 * @return \WP_REST_Response|\WP_Error
	 */
	public function describe_image( \WP_REST_Request $request ) {
		$provider = sanitize_key( (string) $request->get_param( 'provider' ) );
		$model    = sanitize_text_field( (string) $request->get_param( 'model' ) );
		$data     = (string) $request->get_param( 'data' );
		$mime     = sanitize_text_field( (string) $request->get_param( 'media_type' ) );

		// Accept a raw base64 payload or a full data: URL.
		if ( 0 === strpos( $data, 'data:' ) && false !== strpos( $data, ',' ) ) {
			$data = substr( $data, strpos( $data, ',' ) + 1 );
		}

		// 'builtin' → the dependency-free reader (no local vision model available).
		if ( 'builtin' === $provider ) {
			$read = EMCP_Tools_AI_Chat_Image_Reader::read( $data, $mime );
			return rest_ensure_response( array( 'description' => $read['text'], 'builtin' => true ) );
		}

		$result = EMCP_Tools_AI_Chat_Provider::describe_image( $provider, $model, $data, $mime );
		if ( is_wp_error( $result ) ) {
			return $result;
		}
		return rest_ensure_response( array( 'description' => $result, 'builtin' => false ) );
	}

	/**
	 * Saves the built-in control settings (partial patch) and returns fresh state.
	 *
	 * @since 3.6.0
	 * @param \WP_REST_Request $request Request.
	 * @return \WP_REST_Response
	 */
	public function save_settings( \WP_REST_Request $request ) {
		$patch = array();

		if ( null !== $request->get_param( 'web_fetch' ) ) {
			$patch['web_fetch'] = (bool) $request->get_param( 'web_fetch' );
		}
		if ( null !== $request->get_param( 'approve_destructive' ) ) {
			$patch['approve_destructive'] = (bool) $request->get_param( 'approve_destructive' );
		}
		if ( null !== $request->get_param( 'disabled_groups' ) ) {
			$patch['disabled_groups'] = (array) $request->get_param( 'disabled_groups' );
		}

		EMCP_Tools_AI_Chat_Settings::update( $patch );

		return rest_ensure_response( $this->state_payload() );
	}

	/**
	 * @since 3.1.0
	 * @return \WP_REST_Response
	 */
	public function api_key_status() {
		return rest_ensure_response( $this->state_payload() );
	}

	/**
	 * @since 3.1.0
	 * @param \WP_REST_Request $request Request.
	 * @return \WP_REST_Response|\WP_Error
	 */
	public function reveal_api_key( \WP_REST_Request $request ) {
		$provider = sanitize_key( (string) $request->get_param( 'provider' ) );
		// A relayed provider's key is used only by the server relay; it is never
		// handed to the browser.
		$cfg = EMCP_Tools_AI_Providers::get( $provider );
		if ( null !== $cfg && ! empty( $cfg['relay'] ) ) {
			return new \WP_Error( 'key_server_only', __( 'This provider\'s key stays on the server.', 'emcp-tools' ), array( 'status' => 403 ) );
		}
		$key = EMCP_Tools_AI_Chat_Provider::get_key( $provider );
		if ( '' === $key ) {
			return new \WP_Error( 'no_key', __( 'No API key stored for this provider.', 'emcp-tools' ), array( 'status' => 404 ) );
		}
		return rest_ensure_response( array( 'provider' => $provider, 'key' => $key ) );
	}

	/**
	 * @since 3.1.0
	 * @param \WP_REST_Request $request Request.
	 * @return \WP_REST_Response
	 */
	public function delete_api_key( \WP_REST_Request $request ) {
		$provider = sanitize_key( (string) $request->get_param( 'provider' ) );
		EMCP_Tools_AI_Chat_Provider::delete_key( $provider );
		return rest_ensure_response( $this->state_payload() );
	}

	// ── models ──────────────────────────────────────────────────────────────

	/**
	 * @since 3.1.0
	 * @param \WP_REST_Request $request Request.
	 * @return \WP_REST_Response|\WP_Error
	 */
	public function refresh_models( \WP_REST_Request $request ) {
		$provider = sanitize_key( (string) $request->get_param( 'provider' ) );
		if ( ! EMCP_Tools_AI_Providers::exists( $provider ) ) {
			return new \WP_Error( 'unknown_provider', __( 'Unknown provider.', 'emcp-tools' ), array( 'status' => 400 ) );
		}
		$result = EMCP_Tools_AI_Chat_Provider::refresh_models( $provider );
		if ( is_wp_error( $result ) ) {
			return $result;
		}
		if ( false === $result ) {
			return new \WP_Error( 'no_key', __( 'Connect this provider first.', 'emcp-tools' ), array( 'status' => 400 ) );
		}
		return rest_ensure_response( $this->state_payload() );
	}

	/**
	 * The full client state: per-provider connection status, cached models, and
	 * default model ids. Returned by every key/model mutation so the UI stays in
	 * sync from one response.
	 *
	 * @since 3.1.0
	 * @return array
	 */
	private function state_payload(): array {
		$models   = array();
		$defaults = array();
		$chosen   = array();
		foreach ( EMCP_Tools_AI_Providers::ids() as $id ) {
			$models[ $id ]   = EMCP_Tools_AI_Chat_Provider::get_models( $id );
			$defaults[ $id ] = EMCP_Tools_AI_Chat_Provider::default_model( $id );
			$chosen[ $id ]   = EMCP_Tools_AI_Chat_Provider::get_chosen_default( $id );
		}
		// Local runtimes (Ollama) only make sense when they answer on loopback —
		// report availability so the UI can hide the card on hosts without one.
		$local = array();
		foreach ( EMCP_Tools_AI_Providers::local_ids() as $lid ) {
			$local[ $lid ] = EMCP_Tools_AI_Providers::local_available( $lid );
		}

		return array(
			'connections' => EMCP_Tools_AI_Chat_Provider::connections(),
			'models'      => $models,
			'defaults'    => $defaults,
			'chosen'      => $chosen,
			'editor'      => EMCP_Tools_AI_Chat_Provider::get_editor_default(),
			'lastProvider' => EMCP_Tools_AI_Chat_Provider::get_last_provider(),
			'settings'    => EMCP_Tools_AI_Chat_Settings::for_client(),
			'localAvail'  => $local,
			// UNFILTERED group catalog — the settings screen must list switched-off
			// groups too, or they could never be switched back on.
			'allGroups'   => EMCP_Tools_AI_Chat_Tool_Groups::loadable_for( self::active_ability_names() ),
		);
	}

	// ── tools ───────────────────────────────────────────────────────────────

	/**
	 * Active tools in Anthropic function-schema format (the OpenAI adapter maps
	 * these to its own shape client-side). `/` is stripped from names.
	 *
	 * @since 3.1.0
	 * @return \WP_REST_Response
	 */
	/**
	 * Return the raw `_elementor_data` element tree for a page so the in-editor
	 * panel can reset Elementor's live model in place after the AI edits it.
	 *
	 * @since 3.1.0
	 * @param \WP_REST_Request $request Request.
	 * @return \WP_REST_Response|\WP_Error
	 */
	public function get_page_elements( \WP_REST_Request $request ) {
		$post_id = (int) $request->get_param( 'post_id' );
		if ( ! $post_id || ! current_user_can( 'edit_post', $post_id ) ) {
			return new \WP_Error( 'forbidden', __( 'You cannot read this page.', 'emcp-tools' ), array( 'status' => 403 ) );
		}
		$raw      = get_post_meta( $post_id, '_elementor_data', true );
		$elements = is_string( $raw ) ? json_decode( $raw, true ) : ( is_array( $raw ) ? $raw : array() );
		return rest_ensure_response( array( 'elements' => is_array( $elements ) ? $elements : array() ) );
	}

	/**
	 * Raw block markup for a post — powers the Gutenberg editor resync.
	 *
	 * @since 3.1.0
	 * @param \WP_REST_Request $request Request.
	 * @return \WP_REST_Response|\WP_Error
	 */
	public function get_post_content( \WP_REST_Request $request ) {
		$post_id = (int) $request->get_param( 'post_id' );
		if ( ! $post_id || ! current_user_can( 'edit_post', $post_id ) ) {
			return new \WP_Error( 'forbidden', __( 'You cannot read this post.', 'emcp-tools' ), array( 'status' => 403 ) );
		}
		$post = get_post( $post_id );
		if ( ! $post ) {
			return new \WP_Error( 'not_found', __( 'Post not found.', 'emcp-tools' ), array( 'status' => 404 ) );
		}
		return rest_ensure_response( array(
			'content' => (string) $post->post_content,
			'title'   => (string) $post->post_title,
			'excerpt' => (string) $post->post_excerpt,
		) );
	}

	/**
	 * @since 3.1.0
	 * @return \WP_REST_Response
	 */
	public function get_abilities() {
		$active     = self::active_ability_names();
		$has_groups = class_exists( 'EMCP_Tools_AI_Chat_Tool_Groups' );
		$tools      = array();
		foreach ( $active as $name ) {
			$ability = wp_get_ability( $name );
			if ( ! $ability ) {
				continue;
			}
			$slug    = str_replace( 'emcp-tools/', '', $name );
			$schema  = $ability->get_input_schema();
			$tools[] = array(
				'name'         => $slug,
				'description'  => method_exists( $ability, 'get_description' ) ? (string) $ability->get_description() : '',
				'input_schema' => empty( $schema ) ? array( 'type' => 'object', 'properties' => new \stdClass() ) : $schema,
				// Lazy-loading group: 'core' tools are always advertised; others load
				// on demand via the `load_tools` meta-tool. (AI_CHAT_PLAN §6.)
				'group'        => $has_groups ? EMCP_Tools_AI_Chat_Tool_Groups::classify( $slug ) : 'core',
			);
		}
		// Only advertise groups the admin has left switched on. (execute-ability
		// enforces the same policy, so this is UX rather than the security line.)
		$groups = $has_groups ? EMCP_Tools_AI_Chat_Tool_Groups::loadable_for( $active ) : array();
		foreach ( array_keys( $groups ) as $gid ) {
			if ( ! EMCP_Tools_AI_Chat_Settings::group_enabled( (string) $gid ) ) {
				unset( $groups[ $gid ] );
			}
		}

		return rest_ensure_response(
			array(
				'tools'  => $tools,
				// id => { label, desc, count } for the groups the model can load.
				'groups' => $groups,
			)
		);
	}

	/**
	 * Fetch a web page on the model's behalf (the `web_fetch` synthetic tool).
	 *
	 * The chat runs in the browser, where CORS blocks reading a third-party
	 * page, so the request is made here. Every URL — and every redirect hop —
	 * is validated by EMCP_Tools_Url_Guard::validate() first; see that class for the SSRF
	 * rules and their one known limit.
	 *
	 * @since 3.2.0
	 * @param \WP_REST_Request $request Request.
	 * @return \WP_REST_Response|\WP_Error
	 */
	public function web_fetch( \WP_REST_Request $request ) {
		// Built-in control: the admin can switch page fetching off entirely.
		if ( ! EMCP_Tools_AI_Chat_Settings::web_fetch_enabled() ) {
			return new \WP_Error( 'web_fetch_disabled', __( 'Web fetch is switched off in AI Chat settings.', 'emcp-tools' ), array( 'status' => 403 ) );
		}

		$url    = (string) $request->get_param( 'url' );
		$format = (string) $request->get_param( 'format' );

		$fetcher = new EMCP_Tools_AI_Chat_Web_Fetch();
		$result  = $fetcher->fetch( $url, $format );

		if ( is_wp_error( $result ) ) {
			// 422 rather than 500: the model can read the message and adapt
			// (try another URL, another format) instead of the turn dying.
			return new \WP_Error( $result->get_error_code(), $result->get_error_message(), array( 'status' => 422 ) );
		}

		return rest_ensure_response( array( 'success' => true, 'result' => $result ) );
	}

	/**
	 * Runs a single ability. Enforces the active-tool set + the destructive gate.
	 *
	 * @since 3.1.0
	 * @param \WP_REST_Request $request Request.
	 * @return \WP_REST_Response|\WP_Error
	 */
	public function execute_ability( \WP_REST_Request $request ) {
		$ability_name = (string) $request->get_param( 'ability' );
		$args         = (array) $request->get_param( 'args' );

		if ( false === strpos( $ability_name, '/' ) ) {
			$ability_name = 'emcp-tools/' . $ability_name;
		}

		$ability = wp_get_ability( $ability_name );
		if ( ! $ability ) {
			return new \WP_Error( 'unknown_ability', "Unknown ability: $ability_name", array( 'status' => 404 ) );
		}
		if ( ! in_array( $ability_name, self::active_ability_names(), true ) ) {
			return new \WP_Error( 'tool_unavailable', __( 'This tool is disabled or unavailable in Neo EMCP → Tools.', 'emcp-tools' ), array( 'status' => 403 ) );
		}
		// Tool-access policy from the AI Chat settings screen. Enforced here, not
		// just in the advertised tool list — the browser can call this route directly.
		if ( ! EMCP_Tools_AI_Chat_Settings::ability_allowed( $ability_name ) ) {
			return new \WP_Error( 'group_disabled', __( 'This tool group is switched off in AI Chat settings.', 'emcp-tools' ), array( 'status' => 403 ) );
		}
		if (
			EMCP_Tools_AI_Chat_Settings::approval_required()
			&& self::requires_approval( $ability_name, $ability )
			&& true !== $request->get_param( 'approved' )
		) {
			return new \WP_Error( 'approval_required', __( 'This tool requires explicit user approval.', 'emcp-tools' ), array( 'status' => 403 ) );
		}
		// Server-side runaway-loop guard: a per-user per-minute + per-day tool-call
		// budget. The LLM calls are browser-direct, but every tool action passes
		// through here, so this bounds what a loop can actually do.
		if ( class_exists( 'EMCP_Tools_AI_Chat_Usage' ) ) {
			$budget = EMCP_Tools_AI_Chat_Usage::check_and_record( get_current_user_id() );
			if ( is_wp_error( $budget ) ) {
				return $budget;
			}
		}

		// Who runs this call, for the change ledger (spec 9.2); cleared after it.
		$chat = self::chat_context(
			(string) $request->get_param( 'conversation_key' ),
			get_current_user_id(),
			function_exists( 'wp_get_referer' ) ? (string) wp_get_referer() : ''
		);
		EMCP_Tools_Request_Context::set_chat( $chat['client'], $chat['session'] );

		try {
			$result = $ability->execute( $args );
			if ( is_wp_error( $result ) ) {
				return new \WP_Error( 'ability_error', $result->get_error_message(), array( 'status' => 422 ) );
			}
			return rest_ensure_response( array( 'success' => true, 'result' => $result ) );
		} catch ( \Throwable $e ) {
			return new \WP_Error(
				'ability_failed',
				$e->getMessage(),
				array( 'status' => 500, 'trace' => ( defined( 'WP_DEBUG' ) && WP_DEBUG ) ? $e->getTraceAsString() : null )
			);
		} finally {
			EMCP_Tools_Request_Context::set_chat( '', '' );
		}
	}

	/**
	 * Client label and session for an AI Chat tool call (spec 9.2). A key that
	 * belongs to another user's saved conversation is ignored; an unknown key
	 * (a conversation not saved yet) is accepted.
	 *
	 * @param string        $key     conversation_key from the request.
	 * @param int           $user_id Current user.
	 * @param string        $referer Page that sent the call; picks the surface label.
	 * @param callable|null $owner   ( string $key ): ?int, injectable for tests.
	 * @return array{client:string, session:string}
	 */
	public static function chat_context( string $key, int $user_id, string $referer, ?callable $owner = null ): array {
		$labels = array(
			'elementor' => 'AI Chat (Elementor)',
			'gutenberg' => 'AI Chat (Gutenberg)',
		);
		$client = $labels[ self::chat_surface( $referer ) ] ?? 'AI Chat';
		if ( $user_id <= 0 || ! EMCP_Tools_AI_Chat_Store::valid_key( $key ) ) {
			return array( 'client' => $client, 'session' => '' );
		}
		$owner_id = $owner ? $owner( $key ) : EMCP_Tools_AI_Chat_Store::owner_of_key( $key );
		if ( null !== $owner_id && (int) $owner_id !== $user_id ) {
			return array( 'client' => $client, 'session' => '' );
		}
		return array( 'client' => $client, 'session' => 'chat-' . $user_id . '-' . $key );
	}

	/**
	 * Which editor sent a chat call: 'elementor', 'gutenberg' or '' (the AI Chat screen).
	 *
	 * @param string $referer Referer URL.
	 */
	public static function chat_surface( string $referer ): string {
		$query = array();
		parse_str( (string) wp_parse_url( $referer, PHP_URL_QUERY ), $query );
		if ( isset( $query['action'] ) && 'elementor' === $query['action'] ) {
			return 'elementor';
		}
		$path = (string) wp_parse_url( $referer, PHP_URL_PATH );
		return preg_match( '#/wp-admin/post(-new)?\.php$#', $path ) ? 'gutenberg' : '';
	}

	/**
	 * @since 3.1.0
	 * @return string[]
	 */
	private static function active_ability_names(): array {
		if ( class_exists( 'EMCP_Tools_Plugin' ) ) {
			return EMCP_Tools_Plugin::instance()->get_active_ability_names();
		}
		return array();
	}
}
