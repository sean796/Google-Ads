<?php
/**
 * Project Memory screen data (spec 8.10). Post status is the trust gate:
 * pending = proposed by an agent, publish = approved and injected,
 * draft = approved but switched off, trash = rejected or deleted.
 *
 * @package EMCP_Tools
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

final class EMCP_Tools_Admin_Memory_Data {

	const TABS = array( 'active', 'pending', 'sessions' );

	private static function store(): EMCP_Tools_Memory_Store {
		return EMCP_Tools_Memory_Store::instance();
	}

	private static function entry( array $g ): array {
		$post = get_post( (int) $g['id'] );
		return array(
			'id'      => (int) $g['id'],
			'type'    => in_array( $g['type'], EMCP_Tools_Memory_Store::TYPES, true ) ? $g['type'] : 'instruction',
			'text'    => wp_strip_all_tags( (string) $g['body'] ),
			'source'  => 'admin' === $g['source'] ? 'admin' : 'agent',
			'date'    => $post ? (string) ( $post->post_date ?? '' ) : '',
			'enabled' => 'publish' === $g['status'],
			'status'  => (string) $g['status'],
		);
	}

	private static function settings(): array {
		return array(
			'requireApproval' => '0' !== (string) get_option( 'emcp_tools_memory_require_approval', '1' ),
			'autoSummarize'   => '1' === (string) get_option( 'emcp_tools_memory_auto_summarize', '0' ),
		);
	}

	public function payload( string $tab = 'active' ): array {
		$tab          = in_array( $tab, self::TABS, true ) ? $tab : 'active';
		$active       = array_merge( self::store()->list_guidance( 'publish' ), self::store()->list_guidance( 'draft' ) );
		$pending      = self::store()->list_guidance( 'pending' );
		$all_sessions = self::store()->list_sessions( EMCP_Tools_Memory_Store::SESSIONS_MAX );
		$sessions     = array();
		if ( 'sessions' === $tab ) {
			foreach ( $all_sessions as $s ) {
				$sessions[] = array(
					'ts'      => (int) ( $s['ts'] ?? 0 ),
					'summary' => (string) ( $s['summary'] ?? '' ),
					'source'  => (string) ( $s['summary_source'] ?? '' ),
					'changes' => (int) ( $s['digest']['total'] ?? 0 ),
				);
			}
		}
		$rows = array();
		if ( 'pending' === $tab ) {
			$rows = $pending;
		} elseif ( 'active' === $tab ) {
			$rows = $active;
		}
		return array(
			'tab'      => $tab,
			'counts'   => array(
				'active'   => count( $active ),
				'pending'  => count( $pending ),
				'sessions' => count( $all_sessions ),
			),
			'entries'  => array_map( array( __CLASS__, 'entry' ), $rows ),
			'sessions' => $sessions,
			'settings' => self::settings(),
			'types'    => EMCP_Tools_Memory_Store::TYPES,
		);
	}

	/**
	 * A human-authored entry, published at once.
	 *
	 * @return array|WP_Error
	 */
	public function create( string $type, string $text ) {
		$text = sanitize_textarea_field( $text );
		if ( ! in_array( $type, EMCP_Tools_Memory_Store::TYPES, true ) || '' === trim( $text ) ) {
			return new WP_Error( 'emcp_memory_invalid', __( 'Choose a type and write the guidance.', 'emcp-tools' ), array( 'status' => 400 ) );
		}
		$id = self::store()->add_guidance(
			array(
				'title'  => wp_trim_words( $text, 8, '' ),
				'body'   => $text,
				'type'   => $type,
				'source' => 'admin',
				'status' => 'publish',
			)
		);
		if ( is_wp_error( $id ) ) {
			return new WP_Error( $id->get_error_code(), $id->get_error_message(), array( 'status' => 400 ) );
		}
		return $this->payload( 'active' );
	}

	/** @return WP_Post|object|WP_Error */
	private static function memory_post( int $id ) {
		$post = get_post( $id );
		if ( ! $post || EMCP_Tools_Memory_Store::POST_TYPE !== $post->post_type || 'trash' === $post->post_status ) {
			return new WP_Error( 'emcp_memory_not_found', __( 'That memory entry does not exist.', 'emcp-tools' ), array( 'status' => 404 ) );
		}
		return $post;
	}

	/**
	 * @param int    $id     Entry id.
	 * @param string $action toggle|approve|reject|edit.
	 * @param array  $args   { enabled?, type?, text? }.
	 * @return array|WP_Error
	 */
	public function act( int $id, string $action, array $args ) {
		$post = self::memory_post( $id );
		if ( is_wp_error( $post ) ) {
			return $post;
		}
		switch ( $action ) {
			case 'toggle':
				// Switching a proposal on would skip the review: approve it instead.
				if ( 'pending' === $post->post_status ) {
					return new WP_Error( 'emcp_memory_pending', __( 'Approve or reject a proposal first.', 'emcp-tools' ), array( 'status' => 409 ) );
				}
				self::store()->set_guidance_status( $id, rest_sanitize_boolean( $args['enabled'] ?? false ) ? 'publish' : 'draft' );
				return $this->payload( 'active' );
			case 'approve':
				if ( 'pending' !== $post->post_status ) {
					return new WP_Error( 'emcp_memory_not_pending', __( 'Only a pending proposal can be approved.', 'emcp-tools' ), array( 'status' => 409 ) );
				}
				self::store()->set_guidance_status( $id, 'publish' );
				return $this->payload( 'pending' );
			case 'reject':
				self::store()->set_guidance_status( $id, 'trash' );
				return $this->payload( 'pending' );
			case 'edit':
				$type = (string) ( $args['type'] ?? '' );
				$text = sanitize_textarea_field( (string) ( $args['text'] ?? '' ) );
				if ( ! in_array( $type, EMCP_Tools_Memory_Store::TYPES, true ) || '' === trim( $text ) ) {
					return new WP_Error( 'emcp_memory_invalid', __( 'Choose a type and write the guidance.', 'emcp-tools' ), array( 'status' => 400 ) );
				}
				self::store()->update_guidance(
					$id,
					array(
						'type'  => $type,
						'body'  => $text,
						'title' => wp_trim_words( $text, 8, '' ),
					)
				);
				return $this->payload( 'pending' === $post->post_status ? 'pending' : 'active' );
			default:
				return new WP_Error( 'emcp_memory_bad_action', __( 'Unknown action.', 'emcp-tools' ), array( 'status' => 400 ) );
		}
	}

	/** @return array|WP_Error */
	public function delete( int $id ) {
		$post = self::memory_post( $id );
		if ( is_wp_error( $post ) ) {
			return $post;
		}
		$tab = 'pending' === $post->post_status ? 'pending' : 'active';
		self::store()->set_guidance_status( $id, 'trash' );
		return $this->payload( $tab );
	}

	/** @param array $diff { requireApproval?, autoSummarize? }. */
	public function save_settings( array $diff ): array {
		if ( array_key_exists( 'requireApproval', $diff ) ) {
			update_option( 'emcp_tools_memory_require_approval', rest_sanitize_boolean( $diff['requireApproval'] ) ? '1' : '0' );
		}
		if ( array_key_exists( 'autoSummarize', $diff ) ) {
			update_option( 'emcp_tools_memory_auto_summarize', rest_sanitize_boolean( $diff['autoSummarize'] ) ? '1' : '0' );
		}
		return $this->payload( 'active' );
	}
}
