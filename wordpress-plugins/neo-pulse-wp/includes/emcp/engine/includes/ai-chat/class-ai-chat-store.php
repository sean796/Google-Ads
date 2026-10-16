<?php
/**
 * AI Chat conversation store — per-user saved conversations.
 *
 * Each conversation is a private `emcp_ai_conversation` post owned by the user:
 * post_title = title, post_content = JSON of the neutral message array, with the
 * provider/model recorded in meta. Private (no UI, not in REST), with ownership
 * enforced on every read/write.
 *
 * @package EMCP_Tools
 * @since   3.1.0
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Saved-conversation CRUD.
 *
 * @since 3.1.0
 */
class EMCP_Tools_AI_Chat_Store {

	const CPT       = 'emcp_ai_conversation';
	const META_PROV = '_emcp_ai_provider';
	const META_MODL = '_emcp_ai_model';
	const META_POST = '_emcp_ai_post'; // page a conversation belongs to (in-editor threads)
	const META_KEY  = '_emcp_ai_conversation_key'; // groups the chat's tool calls (spec 9.2)

	/**
	 * @since 3.1.0
	 */
	public static function register_post_type(): void {
		register_post_type(
			self::CPT,
			array(
				'public'              => false,
				'show_ui'             => false,
				'show_in_rest'        => false,
				'exclude_from_search' => true,
				'publicly_queryable'  => false,
				'supports'            => array( 'title', 'editor', 'author' ),
			)
		);
	}

	/**
	 * Lists the current/given user's conversations, newest first.
	 *
	 * @since 3.1.0
	 * @param int|null $user_id User.
	 * @return array<int,array> [{ id, title, provider, model, updated }]
	 */
	public static function list_conversations( ?int $user_id = null ): array {
		$user_id = $user_id ?? get_current_user_id();
		$posts   = get_posts(
			array(
				'post_type'      => self::CPT,
				'post_status'    => 'private',
				'author'         => $user_id,
				'posts_per_page' => 100,
				'orderby'        => 'modified',
				'order'          => 'DESC',
				'no_found_rows'  => true,
			)
		);
		$out = array();
		foreach ( $posts as $p ) {
			$out[] = array(
				'id'       => $p->ID,
				'title'    => $p->post_title,
				'provider' => (string) get_post_meta( $p->ID, self::META_PROV, true ),
				'model'    => (string) get_post_meta( $p->ID, self::META_MODL, true ),
				'updated'  => get_post_modified_time( 'c', true, $p ),
			);
		}
		return $out;
	}

	/**
	 * Loads a single conversation (ownership-checked).
	 *
	 * @since 3.1.0
	 * @param int      $id      Conversation post ID.
	 * @param int|null $user_id User.
	 * @return array|null { id, title, provider, model, messages }
	 */
	public static function get( int $id, ?int $user_id = null ): ?array {
		$user_id = $user_id ?? get_current_user_id();
		$post    = get_post( $id );
		if ( ! $post || self::CPT !== $post->post_type || (int) $post->post_author !== $user_id ) {
			return null;
		}
		$messages = json_decode( $post->post_content, true );
		return array(
			'id'               => $post->ID,
			'title'            => $post->post_title,
			'provider'         => (string) get_post_meta( $post->ID, self::META_PROV, true ),
			'model'            => (string) get_post_meta( $post->ID, self::META_MODL, true ),
			'messages'         => is_array( $messages ) ? $messages : array(),
			'conversation_key' => (string) get_post_meta( $post->ID, self::META_KEY, true ),
		);
	}

	/**
	 * Whether a conversation key has the accepted shape (spec 9.2).
	 *
	 * @param string $key Key.
	 */
	public static function valid_key( string $key ): bool {
		return 1 === preg_match( '/^[a-z0-9-]{8,64}$/', $key );
	}

	/**
	 * Author of the saved conversation that carries this key, whoever it is, or
	 * null when no saved conversation has it.
	 *
	 * @param string $key Key.
	 */
	public static function owner_of_key( string $key ): ?int {
		if ( ! self::valid_key( $key ) ) {
			return null;
		}
		$posts = get_posts(
			array(
				'post_type'      => self::CPT,
				'post_status'    => 'private',
				'posts_per_page' => 1,
				'no_found_rows'  => true,
				'meta_key'       => self::META_KEY, // phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_meta_key
				'meta_value'     => $key,           // phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_meta_value
			)
		);
		return $posts ? (int) $posts[0]->post_author : null;
	}

	/**
	 * Creates or updates a conversation (ownership-checked on update).
	 *
	 * @since 3.1.0
	 * @param int|null $id       Existing id, or null to create.
	 * @param string   $title    Title.
	 * @param string   $provider Provider id.
	 * @param string   $model    Model id.
	 * @param array    $messages Neutral message array.
	 * @param int|null $user_id  User.
	 * @param int|null $post_id  Page the thread belongs to (in-editor), or null.
	 * @param string   $conversation_key Conversation key (spec 9.2), '' for none.
	 * @return int|\WP_Error The conversation id.
	 */
	public static function save( ?int $id, string $title, string $provider, string $model, array $messages, ?int $user_id = null, ?int $post_id = null, string $conversation_key = '' ) {
		$user_id = $user_id ?? get_current_user_id();
		$title   = '' !== trim( $title ) ? wp_strip_all_tags( $title ) : __( 'Untitled chat', 'emcp-tools' );
		if ( mb_strlen( $title ) > 120 ) {
			$title = mb_substr( $title, 0, 117 ) . '…';
		}
		$content = wp_json_encode( $messages );
		if ( false === $content ) {
			return new \WP_Error( 'encode_failed', __( 'Could not serialize the conversation.', 'emcp-tools' ) );
		}

		$data = array(
			'post_type'    => self::CPT,
			'post_status'  => 'private',
			'post_author'  => $user_id,
			'post_title'   => $title,
			'post_content' => wp_slash( $content ),
		);

		if ( $id ) {
			$existing = get_post( $id );
			if ( ! $existing || self::CPT !== $existing->post_type || (int) $existing->post_author !== $user_id ) {
				return new \WP_Error( 'not_found', __( 'Conversation not found.', 'emcp-tools' ), array( 'status' => 404 ) );
			}
			$data['ID'] = $id;
			$result     = wp_update_post( $data, true );
		} else {
			$result = wp_insert_post( $data, true );
		}
		if ( is_wp_error( $result ) ) {
			return $result;
		}

		update_post_meta( $result, self::META_PROV, sanitize_key( $provider ) );
		update_post_meta( $result, self::META_MODL, sanitize_text_field( $model ) );
		if ( null !== $post_id && $post_id > 0 ) {
			update_post_meta( $result, self::META_POST, (int) $post_id );
		}
		// A key already on another user's conversation is never adopted.
		if ( self::valid_key( $conversation_key ) ) {
			$owner = self::owner_of_key( $conversation_key );
			if ( null === $owner || $owner === $user_id ) {
				update_post_meta( $result, self::META_KEY, $conversation_key );
			}
		}
		return (int) $result;
	}

	/**
	 * The current/given user's most-recent conversation for a specific page (the
	 * in-editor per-page thread), or null if none yet.
	 *
	 * @since 3.1.0
	 * @param int      $post_id Page id.
	 * @param int|null $user_id User.
	 * @return array|null Same shape as get().
	 */
	public static function get_for_post( int $post_id, ?int $user_id = null ): ?array {
		$user_id = $user_id ?? get_current_user_id();
		$posts   = self::query_for_post( $post_id, $user_id, 1 );
		if ( empty( $posts ) ) {
			return null;
		}
		return self::get( (int) $posts[0]->ID, $user_id );
	}

	/**
	 * All of the current/given user's conversation threads for a page, newest first
	 * (summaries only — same shape as list_conversations()).
	 *
	 * @since 3.1.0
	 * @param int      $post_id Page id.
	 * @param int|null $user_id User.
	 * @return array<int,array>
	 */
	public static function list_for_post( int $post_id, ?int $user_id = null ): array {
		$user_id = $user_id ?? get_current_user_id();
		$posts   = self::query_for_post( $post_id, $user_id, 50 );
		$out     = array();
		foreach ( $posts as $p ) {
			$out[] = array(
				'id'       => $p->ID,
				'title'    => $p->post_title,
				'provider' => (string) get_post_meta( $p->ID, self::META_PROV, true ),
				'model'    => (string) get_post_meta( $p->ID, self::META_MODL, true ),
				'updated'  => get_post_modified_time( 'c', true, $p ),
			);
		}
		return $out;
	}

	/**
	 * @since 3.1.0
	 * @param int $post_id Page id.
	 * @param int $user_id User.
	 * @param int $limit   Max rows.
	 * @return \WP_Post[]
	 */
	private static function query_for_post( int $post_id, int $user_id, int $limit ): array {
		return get_posts(
			array(
				'post_type'      => self::CPT,
				'post_status'    => 'private',
				'author'         => $user_id,
				'posts_per_page' => $limit,
				'orderby'        => 'modified',
				'order'          => 'DESC',
				'no_found_rows'  => true,
				// meta_value filters; meta_value_num would only order the results.
				'meta_key'       => self::META_POST, // phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_meta_key
				'meta_value'     => (string) $post_id, // phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_meta_value
			)
		);
	}

	/**
	 * Deletes a conversation (ownership-checked).
	 *
	 * @since 3.1.0
	 * @param int      $id      Conversation id.
	 * @param int|null $user_id User.
	 * @return bool
	 */
	public static function delete( int $id, ?int $user_id = null ): bool {
		$user_id = $user_id ?? get_current_user_id();
		$post    = get_post( $id );
		if ( ! $post || self::CPT !== $post->post_type || (int) $post->post_author !== $user_id ) {
			return false;
		}
		return (bool) wp_delete_post( $id, true );
	}

	/**
	 * Deletes every saved conversation (uninstall).
	 *
	 * @since 3.1.0
	 */
	public static function uninstall_cleanup(): void {
		$ids = get_posts(
			array(
				'post_type'      => self::CPT,
				'post_status'    => 'any',
				'posts_per_page' => -1,
				'fields'         => 'ids',
				'no_found_rows'  => true,
			)
		);
		foreach ( $ids as $id ) {
			wp_delete_post( (int) $id, true );
		}
	}
}
