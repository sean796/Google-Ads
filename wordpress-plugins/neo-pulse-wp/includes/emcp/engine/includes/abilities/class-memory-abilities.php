<?php
/**
 * Project Memory MCP abilities — let agents recall and contribute site memory.
 *
 * Three Pro-gated tools:
 *   - recall               (read)  approved guidance + recent session records
 *   - remember             (write) propose one guidance entry -> pending
 *   - save-session-summary (write) store an end-of-session summary + digest
 *
 * The writes are INERT: proposals are created `pending` and are never injected
 * into another agent's context until an admin approves them (unless the admin
 * has turned require-approval off). That approval is the hallucination gate.
 *
 * @package EMCP_Tools
 * @since   3.7.0
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Registers and implements the project-memory abilities.
 *
 * @since 3.7.0
 */
class EMCP_Tools_Memory_Abilities {

	const REQUIRE_APPROVAL_OPTION = 'emcp_tools_memory_require_approval';

	/**
	 * Registered ability names.
	 *
	 * @var string[]
	 */
	private $ability_names = array();

	/**
	 * Pro gate.
	 *
	 * @return bool
	 */
	private function has_access(): bool {
		return function_exists( 'emcp_tools_fs' ) && emcp_tools_fs()->can_use_premium_code();
	}

	/**
	 * Ability names (empty on free).
	 *
	 * @return string[]
	 */
	public function get_ability_names(): array {
		if ( ! $this->has_access() ) {
			return array();
		}
		return array(
			'emcp-tools/recall',
			'emcp-tools/remember',
			'emcp-tools/save-session-summary',
		);
	}

	/**
	 * Registers all abilities (Pro only).
	 *
	 * @since 3.7.0
	 */
	public function register(): void {
		if ( ! $this->has_access() ) {
			return;
		}
		$this->register_recall();
		$this->register_remember();
		$this->register_save_session_summary();
	}

	// -------------------------------------------------------------------------
	// Permissions
	// -------------------------------------------------------------------------

	/**
	 * Read permission (recall).
	 *
	 * @return bool
	 */
	public function check_read_permission(): bool {
		return $this->has_access() && current_user_can( 'edit_posts' );
	}

	/**
	 * Write permission (remember / save-session-summary). Writes are inert
	 * proposals, so the bar matches read.
	 *
	 * @return bool
	 */
	public function check_write_permission(): bool {
		return $this->has_access() && current_user_can( 'edit_posts' );
	}

	// -------------------------------------------------------------------------
	// recall
	// -------------------------------------------------------------------------

	/**
	 * Registers recall.
	 *
	 * @since 3.7.0
	 */
	private function register_recall(): void {
		$this->ability_names[] = 'emcp-tools/recall';
		emcp_tools_register_ability(
			'emcp-tools/recall',
			array(
				'label'               => __( 'Recall Project Memory', 'emcp-tools' ),
				'description'         => __( 'Reads this site\'s project memory: admin-approved guidance (guardrails, site facts, conventions) plus recent session summaries. Call this at the start of a task so you do not re-guess site-specific context.', 'emcp-tools' ),
				'category'            => 'emcp-tools',
				'execute_callback'    => array( $this, 'execute_recall' ),
				'permission_callback' => array( $this, 'check_read_permission' ),
				'input_schema'        => array(
					'type'       => 'object',
					'properties' => array(
						'type'  => array(
							'type'        => 'string',
							'enum'        => array( 'guardrail', 'fact', 'convention', 'instruction' ),
							'description' => __( 'Optional: only return guidance of this type.', 'emcp-tools' ),
						),
						'topic' => array(
							'type'        => 'string',
							'description' => __( 'Optional: case-insensitive substring filter over guidance text and session summaries.', 'emcp-tools' ),
						),
						'limit' => array(
							'type'        => 'integer',
							'description' => __( 'Max session records to return (default 10).', 'emcp-tools' ),
						),
					),
				),
				'output_schema'       => array(
					'type'       => 'object',
					'properties' => array(
						'guidance' => array( 'type' => 'array' ),
						'sessions' => array( 'type' => 'array' ),
					),
				),
				'meta'                => array(
					'annotations'  => array( 'readonly' => true, 'destructive' => false, 'idempotent' => true ),
					'show_in_rest' => true,
				),
			)
		);
	}

	/**
	 * Executes recall.
	 *
	 * @param array $input Tool input.
	 * @return array|WP_Error
	 */
	public function execute_recall( $input ) {
		if ( ! $this->has_access() ) {
			return $this->no_license();
		}
		$store    = EMCP_Tools_Memory_Store::instance();
		$type     = isset( $input['type'] ) ? sanitize_key( (string) $input['type'] ) : '';
		$topic    = isset( $input['topic'] ) ? strtolower( trim( (string) $input['topic'] ) ) : '';
		$limit    = isset( $input['limit'] ) ? max( 1, (int) $input['limit'] ) : 10;

		$guidance = $store->list_guidance( 'publish' );
		if ( '' !== $type ) {
			$guidance = array_values( array_filter( $guidance, static function ( $g ) use ( $type ) {
				return $type === $g['type'];
			} ) );
		}
		$sessions = $store->list_sessions( $limit );

		if ( '' !== $topic ) {
			$guidance = array_values( array_filter( $guidance, static function ( $g ) use ( $topic ) {
				return false !== strpos( strtolower( $g['title'] . ' ' . $g['body'] ), $topic );
			} ) );
			$sessions = array_values( array_filter( $sessions, static function ( $s ) use ( $topic ) {
				return false !== strpos( strtolower( (string) ( $s['summary'] ?? '' ) ), $topic );
			} ) );
		}

		return array(
			'guidance' => $guidance,
			'sessions' => $sessions,
		);
	}

	// -------------------------------------------------------------------------
	// remember
	// -------------------------------------------------------------------------

	/**
	 * Registers remember.
	 *
	 * @since 3.7.0
	 */
	private function register_remember(): void {
		$this->ability_names[] = 'emcp-tools/remember';
		emcp_tools_register_ability(
			'emcp-tools/remember',
			array(
				'label'               => __( 'Remember Guidance', 'emcp-tools' ),
				'description'         => __( 'Proposes one piece of durable guidance for this site (a guardrail, site fact, convention, or instruction). It is stored PENDING and is only injected into future sessions after a human approves it in Neo EMCP -> Memory.', 'emcp-tools' ),
				'category'            => 'emcp-tools',
				'execute_callback'    => array( $this, 'execute_remember' ),
				'permission_callback' => array( $this, 'check_write_permission' ),
				'input_schema'        => array(
					'type'       => 'object',
					'properties' => array(
						'type'     => array(
							'type'        => 'string',
							'enum'        => array( 'guardrail', 'fact', 'convention', 'instruction' ),
							'description' => __( 'The kind of guidance.', 'emcp-tools' ),
						),
						'text'     => array(
							'type'        => 'string',
							'description' => __( 'The guidance itself, e.g. "never edit the header template" or "checkout is page 42".', 'emcp-tools' ),
						),
						'title'    => array(
							'type'        => 'string',
							'description' => __( 'Optional short label.', 'emcp-tools' ),
						),
						'scope'    => array(
							'type'        => 'string',
							'description' => __( 'Optional scope, e.g. global, elementor, woocommerce.', 'emcp-tools' ),
						),
						'target'   => array(
							'type'        => 'string',
							'description' => __( 'Concrete target for block enforcement, as key:value — tool:delete-media, post_id:42, or post_type:page (a bare value is treated as a tool slug).', 'emcp-tools' ),
						),
						'severity' => array(
							'type'        => 'string',
							'enum'        => array( 'info', 'warn', 'block' ),
							'description' => __( 'info | warn | block. Once approved, a block-severity guardrail with a target is ENFORCED: a matching write is refused.', 'emcp-tools' ),
						),
					),
					'required'   => array( 'type', 'text' ),
				),
				'output_schema'       => array(
					'type'       => 'object',
					'properties' => array(
						'id'     => array( 'type' => 'integer' ),
						'status' => array( 'type' => 'string' ),
					),
				),
				'meta'                => array(
					'annotations'  => array( 'readonly' => false, 'destructive' => false, 'idempotent' => false ),
					'show_in_rest' => true,
				),
			)
		);
	}

	/**
	 * Executes remember.
	 *
	 * @param array $input Tool input.
	 * @return array|WP_Error
	 */
	public function execute_remember( $input ) {
		if ( ! $this->has_access() ) {
			return $this->no_license();
		}
		$type = isset( $input['type'] ) ? (string) $input['type'] : '';
		$text = isset( $input['text'] ) ? trim( (string) $input['text'] ) : '';
		if ( ! in_array( $type, EMCP_Tools_Memory_Store::TYPES, true ) || '' === $text ) {
			return new WP_Error( 'invalid_input', __( 'A valid type and non-empty text are required.', 'emcp-tools' ) );
		}
		// Human approval is required by default; an admin can turn it off.
		$status = ( '0' === (string) get_option( self::REQUIRE_APPROVAL_OPTION, '1' ) ) ? 'publish' : 'pending';

		$title = isset( $input['title'] ) && '' !== trim( (string) $input['title'] )
			? (string) $input['title']
			: wp_trim_words( $text, 8, '' );

		$id = EMCP_Tools_Memory_Store::instance()->add_guidance(
			array(
				'title'    => $title,
				'body'     => $text,
				'type'     => $type,
				'scope'    => isset( $input['scope'] ) ? (string) $input['scope'] : 'global',
				'target'   => isset( $input['target'] ) ? (string) $input['target'] : '',
				'severity' => isset( $input['severity'] ) ? (string) $input['severity'] : 'info',
				'source'   => 'agent',
				'status'   => $status,
			)
		);
		if ( is_wp_error( $id ) ) {
			return $id;
		}
		return array(
			'id'     => (int) $id,
			'status' => $status,
		);
	}

	// -------------------------------------------------------------------------
	// save-session-summary
	// -------------------------------------------------------------------------

	/**
	 * Registers save-session-summary.
	 *
	 * @since 3.7.0
	 */
	private function register_save_session_summary(): void {
		$this->ability_names[] = 'emcp-tools/save-session-summary';
		emcp_tools_register_ability(
			'emcp-tools/save-session-summary',
			array(
				'label'               => __( 'Save Session Summary', 'emcp-tools' ),
				'description'         => __( 'Records a short summary of what you did this session. The plugin attaches a factual digest of the actual changes. Optional takeaways become PENDING guidance proposals for a human to review.', 'emcp-tools' ),
				'category'            => 'emcp-tools',
				'execute_callback'    => array( $this, 'execute_save_session_summary' ),
				'permission_callback' => array( $this, 'check_write_permission' ),
				'input_schema'        => array(
					'type'       => 'object',
					'properties' => array(
						'summary'   => array(
							'type'        => 'string',
							'description' => __( 'A 2-4 sentence summary of the session for a future agent.', 'emcp-tools' ),
						),
						'takeaways' => array(
							'type'        => 'array',
							'items'       => array(
								'type'       => 'object',
								'properties' => array(
									'type' => array( 'type' => 'string', 'enum' => array( 'guardrail', 'fact', 'convention', 'instruction' ) ),
									'text' => array( 'type' => 'string' ),
								),
							),
							'description' => __( 'Optional durable guidance to propose (each becomes a pending entry).', 'emcp-tools' ),
						),
					),
					'required'   => array( 'summary' ),
				),
				'output_schema'       => array(
					'type'       => 'object',
					'properties' => array(
						'recorded' => array( 'type' => 'boolean' ),
						'proposed' => array( 'type' => 'integer' ),
					),
				),
				'meta'                => array(
					'annotations'  => array( 'readonly' => false, 'destructive' => false, 'idempotent' => false ),
					'show_in_rest' => true,
				),
			)
		);
	}

	/**
	 * Executes save-session-summary.
	 *
	 * @param array $input Tool input.
	 * @return array|WP_Error
	 */
	public function execute_save_session_summary( $input ) {
		if ( ! $this->has_access() ) {
			return $this->no_license();
		}
		$summary = isset( $input['summary'] ) ? trim( (string) $input['summary'] ) : '';
		if ( '' === $summary ) {
			return new WP_Error( 'invalid_input', __( 'A summary is required.', 'emcp-tools' ) );
		}
		$store = EMCP_Tools_Memory_Store::instance();

		// Digest of changes since the last session record.
		$last  = $store->list_sessions( 1 );
		$since = ! empty( $last ) ? ( (int) ( $last[0]['digest']['to'] ?? $last[0]['ts'] ) + 1 ) : 0;
		$digest = class_exists( 'EMCP_Tools_Memory_Digest' ) ? EMCP_Tools_Memory_Digest::build( $since ) : array();

		// Turn takeaways into pending proposals.
		$proposed = array();
		foreach ( (array) ( $input['takeaways'] ?? array() ) as $t ) {
			$type = isset( $t['type'] ) ? (string) $t['type'] : '';
			$text = isset( $t['text'] ) ? trim( (string) $t['text'] ) : '';
			if ( in_array( $type, EMCP_Tools_Memory_Store::TYPES, true ) && '' !== $text ) {
				$id = $store->add_guidance( array(
					'title'  => wp_trim_words( $text, 8, '' ),
					'body'   => $text,
					'type'   => $type,
					'source' => 'agent',
					'status' => 'pending',
				) );
				if ( ! is_wp_error( $id ) ) {
					$proposed[] = (int) $id;
				}
			}
		}

		$store->add_session( array(
			'ts'             => time(),
			'session_token'  => 'agent-' . time(),
			'summary'        => $summary,
			'summary_source' => 'agent',
			'digest'         => is_array( $digest ) ? $digest : array(),
			'proposed_ids'   => $proposed,
		) );

		return array(
			'recorded' => true,
			'proposed' => count( $proposed ),
		);
	}

	// -------------------------------------------------------------------------
	// Helpers
	// -------------------------------------------------------------------------

	/**
	 * Standard no-license error.
	 *
	 * @return WP_Error
	 */
	private function no_license(): WP_Error {
		return new WP_Error( 'no_license', __( 'A valid Neo EMCP license is required to use project memory.', 'emcp-tools' ) );
	}
}
