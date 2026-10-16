<?php
/**
 * Memory Store — source of truth for project memory.
 *
 * Two record kinds, each reusing an existing plugin pattern:
 *   1. Guidance entries — a private `emcp_memory` CPT whose POST STATUS is the
 *      human trust gate (`pending` = agent-proposed and never injected;
 *      `publish` = admin-approved and injected; trashed = rejected; `draft` =
 *      approved-but-toggled-off). Same status-as-gate approach as the PHP
 *      snippet and block stores.
 *   2. Session records — a capped rolling option (like the change log), read
 *      on demand by the `recall` tool and never injected.
 *
 * @package EMCP_Tools
 * @since   3.7.0
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Stores curated guidance entries + rolling session records.
 *
 * @since 3.7.0
 */
class EMCP_Tools_Memory_Store {

	const POST_TYPE       = 'emcp_memory';
	const SESSIONS_OPTION = 'emcp_tools_memory_sessions';
	const INJECT_OPTION   = 'emcp_tools_memory_injected';
	const SESSIONS_MAX    = 25;

	const META_TYPE     = '_emcp_mem_type';
	const META_SCOPE    = '_emcp_mem_scope';
	const META_TARGET   = '_emcp_mem_target';
	const META_SEVERITY = '_emcp_mem_severity';
	const META_SOURCE   = '_emcp_mem_source';
	const META_WEIGHT   = '_emcp_mem_weight';

	const TYPES      = array( 'guardrail', 'fact', 'convention', 'instruction' );
	const SEVERITIES = array( 'info', 'warn', 'block' );

	/**
	 * Singleton instance.
	 *
	 * @var self|null
	 */
	private static $instance = null;

	/**
	 * Returns the singleton.
	 *
	 * @since 3.7.0
	 *
	 * @return self
	 */
	public static function instance(): self {
		return self::$instance ?? ( self::$instance = new self() );
	}

	/**
	 * Registers the private CPT. Hooked on `init`.
	 *
	 * @since 3.7.0
	 */
	public static function register_post_type(): void {
		register_post_type(
			self::POST_TYPE,
			array(
				'public'              => false,
				'publicly_queryable'  => false,
				'show_ui'             => false,
				'show_in_menu'        => false,
				'show_in_rest'        => false,
				'exclude_from_search' => true,
				'has_archive'         => false,
				'rewrite'             => false,
				'query_var'           => false,
				'capability_type'     => 'page',
				'map_meta_cap'        => true,
				'supports'            => array( 'title', 'editor', 'author' ),
				'labels'              => array( 'name' => __( 'EMCP Memory', 'emcp-tools' ) ),
			)
		);
	}

	/**
	 * Whether the current user may manage memory. Pro gate + manage_options.
	 *
	 * @since 3.7.0
	 *
	 * @return bool
	 */
	public static function user_has_access(): bool {
		if ( ! function_exists( 'emcp_tools_fs' ) || ! emcp_tools_fs()->can_use_premium_code() ) {
			return false;
		}
		return current_user_can( 'manage_options' );
	}

	// -------------------------------------------------------------------------
	// Guidance entries (CPT)
	// -------------------------------------------------------------------------

	/**
	 * Creates a guidance entry.
	 *
	 * @since 3.7.0
	 *
	 * @param array $args { title, body, type, scope?, target?, severity?, source, status?, weight? }.
	 * @return int|WP_Error New post ID.
	 */
	public function add_guidance( array $args ) {
		$type   = in_array( $args['type'] ?? '', self::TYPES, true ) ? $args['type'] : 'instruction';
		$status = in_array( $args['status'] ?? '', array( 'pending', 'publish', 'draft' ), true ) ? $args['status'] : 'pending';

		$id = wp_insert_post(
			array(
				'post_type'    => self::POST_TYPE,
				'post_status'  => $status,
				'post_title'   => sanitize_text_field( (string) ( $args['title'] ?? '' ) ),
				'post_content' => wp_kses_post( (string) ( $args['body'] ?? '' ) ),
				'post_author'  => get_current_user_id(),
			),
			true
		);
		if ( is_wp_error( $id ) ) {
			return $id;
		}
		$id = (int) $id;

		update_post_meta( $id, self::META_TYPE, $type );
		update_post_meta( $id, self::META_SCOPE, sanitize_text_field( (string) ( $args['scope'] ?? 'global' ) ) );
		update_post_meta( $id, self::META_TARGET, sanitize_text_field( (string) ( $args['target'] ?? '' ) ) );
		$sev = in_array( $args['severity'] ?? '', self::SEVERITIES, true ) ? $args['severity'] : 'info';
		update_post_meta( $id, self::META_SEVERITY, $sev );
		update_post_meta( $id, self::META_SOURCE, ( 'admin' === ( $args['source'] ?? '' ) ) ? 'admin' : 'agent' );
		update_post_meta( $id, self::META_WEIGHT, (int) ( $args['weight'] ?? 10 ) );

		return $id;
	}

	/**
	 * Changes a guidance entry's status (the trust gate).
	 *
	 * @since 3.7.0
	 *
	 * @param int    $id     Post ID.
	 * @param string $status pending|publish|draft|trash.
	 * @return bool
	 */
	public function set_guidance_status( int $id, string $status ): bool {
		$post = get_post( $id );
		if ( ! $post || self::POST_TYPE !== $post->post_type ) {
			return false;
		}
		if ( 'trash' === $status ) {
			return (bool) wp_trash_post( $id );
		}
		if ( ! in_array( $status, array( 'pending', 'publish', 'draft' ), true ) ) {
			return false;
		}
		return ! is_wp_error( wp_update_post( array( 'ID' => $id, 'post_status' => $status ) ) );
	}

	/**
	 * Edits a guidance entry's title/body/meta.
	 *
	 * @since 3.7.0
	 *
	 * @param int   $id   Post ID.
	 * @param array $args Partial { title, body, type, scope, target, severity, weight }.
	 * @return bool
	 */
	public function update_guidance( int $id, array $args ): bool {
		$post = get_post( $id );
		if ( ! $post || self::POST_TYPE !== $post->post_type ) {
			return false;
		}
		$fields = array( 'ID' => $id );
		if ( isset( $args['title'] ) ) {
			$fields['post_title'] = sanitize_text_field( (string) $args['title'] );
		}
		if ( isset( $args['body'] ) ) {
			$fields['post_content'] = wp_kses_post( (string) $args['body'] );
		}
		if ( count( $fields ) > 1 ) {
			wp_update_post( $fields );
		}
		$meta_map = array(
			'type'     => self::META_TYPE,
			'scope'    => self::META_SCOPE,
			'target'   => self::META_TARGET,
			'severity' => self::META_SEVERITY,
			'weight'   => self::META_WEIGHT,
		);
		foreach ( $meta_map as $k => $meta ) {
			if ( array_key_exists( $k, $args ) ) {
				$v = ( 'weight' === $k ) ? (int) $args[ $k ] : sanitize_text_field( (string) $args[ $k ] );
				update_post_meta( $id, $meta, $v );
			}
		}
		return true;
	}

	/**
	 * Lists guidance entries.
	 *
	 * @since 3.7.0
	 *
	 * @param string $status 'any' | 'pending' | 'publish' | 'draft'.
	 * @return array<int, array>
	 */
	/**
	 * Count of agent-proposed guidance entries awaiting admin review.
	 *
	 * @return int
	 */
	public function pending_count(): int {
		return count( $this->list_guidance( 'pending' ) );
	}

	public function list_guidance( string $status = 'any' ): array {
		$query = new WP_Query(
			array(
				'post_type'      => self::POST_TYPE,
				'post_status'    => ( 'any' === $status ) ? 'any' : $status,
				'posts_per_page' => 500,
				'orderby'        => array(
					'menu_order' => 'ASC',
					'date'       => 'DESC',
				),
				'no_found_rows'  => true,
			)
		);
		$out = array();
		foreach ( $query->posts as $p ) {
			$out[] = array(
				'id'       => (int) $p->ID,
				'title'    => (string) $p->post_title,
				'body'     => (string) $p->post_content,
				'type'     => (string) get_post_meta( $p->ID, self::META_TYPE, true ),
				'scope'    => (string) get_post_meta( $p->ID, self::META_SCOPE, true ),
				'target'   => (string) get_post_meta( $p->ID, self::META_TARGET, true ),
				'severity' => (string) get_post_meta( $p->ID, self::META_SEVERITY, true ),
				'source'   => (string) get_post_meta( $p->ID, self::META_SOURCE, true ),
				'weight'   => (int) get_post_meta( $p->ID, self::META_WEIGHT, true ),
				'status'   => (string) $p->post_status,
			);
		}
		return $out;
	}

	// -------------------------------------------------------------------------
	// Session records (capped option)
	// -------------------------------------------------------------------------

	/**
	 * Appends a session record, dropping the oldest beyond SESSIONS_MAX.
	 *
	 * @since 3.7.0
	 *
	 * @param array $record { ts, session_token, summary, summary_source, digest, proposed_ids }.
	 */
	public function add_session( array $record ): void {
		$sessions = get_option( self::SESSIONS_OPTION, array() );
		if ( ! is_array( $sessions ) ) {
			$sessions = array();
		}
		$source     = in_array( $record['summary_source'] ?? '', array( 'agent', 'llm' ), true ) ? $record['summary_source'] : '';
		$sessions[] = array(
			'ts'             => (int) ( $record['ts'] ?? time() ),
			'session_token'  => sanitize_text_field( (string) ( $record['session_token'] ?? '' ) ),
			'summary'        => (string) ( $record['summary'] ?? '' ),
			'summary_source' => $source,
			'digest'         => is_array( $record['digest'] ?? null ) ? $record['digest'] : array(),
			'proposed_ids'   => array_map( 'intval', (array) ( $record['proposed_ids'] ?? array() ) ),
		);
		if ( count( $sessions ) > self::SESSIONS_MAX ) {
			$sessions = array_slice( $sessions, -self::SESSIONS_MAX );
		}
		update_option( self::SESSIONS_OPTION, $sessions, false );
	}

	/**
	 * Returns session records newest-first.
	 *
	 * @since 3.7.0
	 *
	 * @param int $limit Max records.
	 * @return array<int, array>
	 */
	public function list_sessions( int $limit = 25 ): array {
		$sessions = get_option( self::SESSIONS_OPTION, array() );
		if ( ! is_array( $sessions ) ) {
			return array();
		}
		$sessions = array_reverse( $sessions );
		return array_slice( $sessions, 0, max( 1, $limit ) );
	}

	// -------------------------------------------------------------------------
	// Uninstall
	// -------------------------------------------------------------------------

	/**
	 * Deletes all memory posts + options. Called from the uninstaller.
	 *
	 * @since 3.7.0
	 */
	public static function uninstall_cleanup(): void {
		$query = new WP_Query(
			array(
				'post_type'      => self::POST_TYPE,
				'post_status'    => 'any',
				'posts_per_page' => -1,
				'fields'         => 'ids',
				'no_found_rows'  => true,
			)
		);
		foreach ( $query->posts as $id ) {
			wp_delete_post( (int) $id, true );
		}
		delete_option( self::SESSIONS_OPTION );
		delete_option( self::INJECT_OPTION );
	}
}
