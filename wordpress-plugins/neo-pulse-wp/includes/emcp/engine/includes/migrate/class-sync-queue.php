<?php
/**
 * Content Sync — the change queue.
 *
 * Backs the "Changes to sync" list: which locally created/updated pages, posts,
 * and CPTs differ from what has been pushed to a given live target. State lives
 * on the post (no new table):
 *
 *   _emcp_sync_uid        stable UUID, stamped once, used to match the item on live.
 *   _emcp_sync_state      { <target_id>: { hash, at } }  what we last pushed there.
 *   _emcp_sync_discarded  { <target_id>: hash }          dismissed until it changes.
 *
 * An item is PENDING for a target when its current content hash differs from the
 * last-pushed hash (or it was never pushed) and it isn't discarded at that hash.
 *
 * Phase 1: list + discard + uid + hash. The bundle/push land in later phases.
 *
 * @package EMCP_Tools
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class EMCP_Tools_Sync_Queue {

	const UID_META     = '_emcp_sync_uid';
	const STATE_META   = '_emcp_sync_state';
	const DISCARD_META = '_emcp_sync_discarded';

	/** Meta keys that never belong in a content hash or a bundle. */
	const INTERNAL_META = array( '_edit_lock', '_edit_last', self::UID_META, self::STATE_META, self::DISCARD_META );

	/**
	 * Public post types that participate in content sync (attachments ride along
	 * with their items, so they're excluded as top-level entries).
	 *
	 * @return string[]
	 */
	public static function syncable_post_types(): array {
		$types = get_post_types( array( 'public' => true ), 'names' );
		// Attachments ride along with their items; the rest are internal stores
		// (Elementor templates/kits, FSE templates, global styles, menus) — not the
		// pages/posts/CPTs a content sync is about. Filterable to add them back.
		foreach ( array(
			'attachment',
			'elementor_library',
			'e-landing-page',
			'wp_template',
			'wp_template_part',
			'wp_global_styles',
			'wp_navigation',
			'oembed_cache',
			'user_request',
		) as $skip ) {
			unset( $types[ $skip ] );
		}
		/** Allow sites to add/remove syncable types. */
		return array_values( (array) apply_filters( 'emcp_tools_sync_post_types', array_values( $types ) ) );
	}

	/** Post statuses considered "content" (not autosaves/revisions/trash). */
	public static function syncable_statuses(): array {
		return array( 'publish', 'future', 'draft', 'pending', 'private' );
	}

	/**
	 * Ensure a stable sync UID exists on a post; return it.
	 *
	 * @param int $post_id Post id.
	 * @return string
	 */
	public static function ensure_uid( int $post_id ): string {
		$uid = (string) get_post_meta( $post_id, self::UID_META, true );
		if ( '' === $uid ) {
			$uid = wp_generate_uuid4();
			update_post_meta( $post_id, self::UID_META, $uid );
		}
		return $uid;
	}

	/**
	 * Find a post by its stable sync uid on THIS (source) site. 0 if none.
	 *
	 * @param string $uid Sync uid.
	 * @return int
	 */
	public static function find_by_uid( string $uid ): int {
		if ( '' === $uid ) {
			return 0;
		}
		$ids = get_posts( array(
			'post_type'        => 'any',
			'post_status'      => 'any',
			'numberposts'      => 1,
			'fields'           => 'ids',
			'meta_key'         => self::UID_META,   // phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_meta_key
			'meta_value'       => $uid,             // phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_meta_value
			'no_found_rows'    => true,
			'suppress_filters' => true,
		) );
		return $ids ? (int) $ids[0] : 0;
	}

	/**
	 * Content hash — changes whenever anything that would be synced changes
	 * (fields + non-internal meta + terms + featured image). Deliberately
	 * excludes post_modified so a no-op re-save doesn't re-surface the item.
	 *
	 * @param int $post_id Post id.
	 * @return string '' if the post is gone.
	 */
	public static function content_hash( int $post_id ): string {
		$p = get_post( $post_id );
		if ( ! $p ) {
			return '';
		}

		$meta = array();
		foreach ( (array) get_post_meta( $post_id ) as $key => $vals ) {
			if ( in_array( $key, self::INTERNAL_META, true ) ) {
				continue;
			}
			$meta[ $key ] = $vals;
		}
		ksort( $meta );

		$terms = array();
		foreach ( get_object_taxonomies( $p->post_type ) as $tax ) {
			$slugs = wp_get_object_terms( $post_id, $tax, array( 'fields' => 'slugs' ) );
			if ( ! is_wp_error( $slugs ) && ! empty( $slugs ) ) {
				sort( $slugs );
				$terms[ $tax ] = $slugs;
			}
		}
		ksort( $terms );

		$parts = array(
			'post_title'   => $p->post_title,
			'post_name'    => $p->post_name,
			'post_content' => $p->post_content,
			'post_excerpt' => $p->post_excerpt,
			'post_status'  => $p->post_status,
			'post_parent'  => (int) $p->post_parent,
			'menu_order'   => (int) $p->menu_order,
			'post_type'    => $p->post_type,
			'meta'         => $meta,
			'terms'        => $terms,
		);

		return md5( (string) wp_json_encode( $parts ) );
	}

	// ---------------------------------------------------------------- state

	/** @return array{hash?:string,at?:int} */
	private static function state_for( int $post_id, int $target_id ): array {
		$state = get_post_meta( $post_id, self::STATE_META, true );
		$state = is_array( $state ) ? $state : array();
		return isset( $state[ $target_id ] ) && is_array( $state[ $target_id ] ) ? $state[ $target_id ] : array();
	}

	/**
	 * Record that a post's current content was pushed to a target.
	 *
	 * @param int    $post_id   Post id.
	 * @param int    $target_id Target id.
	 * @param string $hash      Hash that was pushed (defaults to current).
	 * @return void
	 */
	public static function mark_synced( int $post_id, int $target_id, string $hash = '' ): void {
		if ( '' === $hash ) {
			$hash = self::content_hash( $post_id );
		}
		$state = get_post_meta( $post_id, self::STATE_META, true );
		$state = is_array( $state ) ? $state : array();
		$state[ $target_id ] = array( 'hash' => $hash, 'at' => time() );
		update_post_meta( $post_id, self::STATE_META, $state );
		// A fresh push clears any stale discard for this target.
		self::undiscard( $post_id, $target_id );
	}

	/**
	 * Dismiss an item for a target until its content changes again.
	 *
	 * @param int $post_id   Post id.
	 * @param int $target_id Target id.
	 * @return void
	 */
	public static function discard( int $post_id, int $target_id ): void {
		$d = get_post_meta( $post_id, self::DISCARD_META, true );
		$d = is_array( $d ) ? $d : array();
		$d[ $target_id ] = self::content_hash( $post_id );
		update_post_meta( $post_id, self::DISCARD_META, $d );
	}

	/**
	 * Clear a discard (so the item can be listed/synced again).
	 *
	 * @param int $post_id   Post id.
	 * @param int $target_id Target id.
	 * @return void
	 */
	public static function undiscard( int $post_id, int $target_id ): void {
		$d = get_post_meta( $post_id, self::DISCARD_META, true );
		if ( ! is_array( $d ) || ! isset( $d[ $target_id ] ) ) {
			return;
		}
		unset( $d[ $target_id ] );
		if ( empty( $d ) ) {
			delete_post_meta( $post_id, self::DISCARD_META );
		} else {
			update_post_meta( $post_id, self::DISCARD_META, $d );
		}
	}

	private static function is_discarded( int $post_id, int $target_id, string $current_hash ): bool {
		$d = get_post_meta( $post_id, self::DISCARD_META, true );
		return is_array( $d ) && isset( $d[ $target_id ] ) && (string) $d[ $target_id ] === $current_hash;
	}

	// ---------------------------------------------------------------- listing

	/**
	 * Classify a post's sync state for a target.
	 *
	 * @param int $post_id   Post id.
	 * @param int $target_id Target id.
	 * @return array{kind:string,hash:string} kind = new|updated|synced.
	 */
	public static function classify( int $post_id, int $target_id ): array {
		$hash  = self::content_hash( $post_id );
		$state = self::state_for( $post_id, $target_id );
		if ( empty( $state['hash'] ) ) {
			return array( 'kind' => 'new', 'hash' => $hash );
		}
		if ( (string) $state['hash'] !== $hash ) {
			return array( 'kind' => 'updated', 'hash' => $hash );
		}
		return array( 'kind' => 'synced', 'hash' => $hash );
	}

	/**
	 * The pending "changes to sync" list for a target.
	 *
	 * Scans the most-recently-modified syncable posts (bounded by $scan) and
	 * returns those whose content differs from what was last pushed and isn't
	 * discarded at the current hash. Paginated over the filtered result.
	 *
	 * @param int   $target_id Target id.
	 * @param array $args      { paged, per_page, scan, search }.
	 * @return array{items:array<int,array<string,mixed>>,total:int,scanned:int,capped:bool}
	 */
	public static function pending( int $target_id, array $args = array() ): array {
		$per_page = isset( $args['per_page'] ) ? max( 1, (int) $args['per_page'] ) : 20;
		$paged    = isset( $args['paged'] ) ? max( 1, (int) $args['paged'] ) : 1;
		$scan     = isset( $args['scan'] ) ? max( 1, (int) $args['scan'] ) : (int) apply_filters( 'emcp_tools_sync_scan_limit', 300 );
		$search   = isset( $args['search'] ) ? trim( (string) $args['search'] ) : '';

		$q = new WP_Query( array(
			'post_type'           => self::syncable_post_types(),
			'post_status'         => self::syncable_statuses(),
			'orderby'             => 'modified',
			'order'               => 'DESC',
			'posts_per_page'      => $scan,
			'no_found_rows'       => true,
			'ignore_sticky_posts' => true,
			's'                   => '' !== $search ? $search : '',
			'fields'              => 'ids',
		) );
		$ids     = $q->posts;
		$scanned = count( $ids );

		$pending = array();
		foreach ( $ids as $pid ) {
			$pid = (int) $pid;
			$c   = self::classify( $pid, $target_id );
			if ( 'synced' === $c['kind'] ) {
				continue;
			}
			if ( self::is_discarded( $pid, $target_id, $c['hash'] ) ) {
				continue;
			}
			$p = get_post( $pid );
			if ( ! $p ) {
				continue;
			}
			$pto = get_post_type_object( $p->post_type );
			$pending[] = array(
				'id'         => $pid,
				'uid'        => self::ensure_uid( $pid ),
				'title'      => '' !== $p->post_title ? $p->post_title : __( '(no title)', 'emcp-tools' ),
				'type'       => $p->post_type,
				'type_label' => $pto ? $pto->labels->singular_name : $p->post_type,
				'status'     => $p->post_status,
				'kind'       => $c['kind'],
				'changed_at' => get_post_modified_time( 'U', true, $pid ),
				'edit_link'  => get_edit_post_link( $pid, 'raw' ),
			);
		}

		$total = count( $pending );
		$slice = array_slice( $pending, ( $paged - 1 ) * $per_page, $per_page );

		return array(
			'items'   => $slice,
			'total'   => $total,
			'scanned' => $scanned,
			'capped'  => $scanned >= $scan,
		);
	}

	/**
	 * Count pending items for a target (for a badge). Bounded by the scan limit.
	 *
	 * @param int $target_id Target id.
	 * @return int
	 */
	public static function pending_count( int $target_id ): int {
		$res = self::pending( $target_id, array( 'per_page' => 1, 'paged' => 1 ) );
		return (int) $res['total'];
	}
}
