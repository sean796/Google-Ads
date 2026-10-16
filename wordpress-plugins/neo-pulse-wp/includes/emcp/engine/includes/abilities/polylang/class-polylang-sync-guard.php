<?php
/**
 * Keeps Polylang's synchronization from carrying an EMCP write to the other posts of a
 * translation group (spec 4.5). Polylang syncs three ways: meta (pll_copy_post_metas),
 * taxonomies (pll_copy_taxonomies) and post fields (PLL_Sync / PLL_Admin_Sync on the
 * pll_save_post action, a direct $wpdb->update() with no filter). For the length of one
 * write the guard holds back the written meta keys and every taxonomy, and unhooks the
 * field sync; then it checks the other members and attributes a change to the write
 * only when the member's new value is the value the write gave the target. It never
 * writes another member: an attributed change is reported (sync_leak) with a History
 * entry per member, and the target's own write is reversed by the operation's recovery.
 *
 * @package EMCP_Tools
 * @since   3.19.0
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/** @since 3.19.0 */
final class EMCP_Tools_Polylang_Sync_Guard {

	/** Post fields Polylang's field sync copies. */
	const SYNC_FIELDS = array( 'post_date', 'post_date_gmt', 'post_parent', 'menu_order', 'comment_status', 'ping_status' );

	/** @var EMCP_Tools_Polylang_Api|null */
	private static $api = null;

	public static function use_api( ?EMCP_Tools_Polylang_Api $api ): void {
		self::$api = $api;
	}

	private static function api(): EMCP_Tools_Polylang_Api {
		if ( self::$api ) {
			return self::$api;
		}
		return class_exists( 'EMCP_Tools_Polylang_Integration' ) ? EMCP_Tools_Polylang_Integration::shared_api() : new EMCP_Tools_Polylang_Api();
	}

	public static function boot(): void {
		if ( ! has_filter( 'emcp_tools_page_text_around', array( __CLASS__, 'page_text_around' ) ) ) {
			add_filter( 'emcp_tools_page_text_around', array( __CLASS__, 'page_text_around' ), 10, 3 );
		}
	}

	/**
	 * The page-text writer's wrapper: guard the write, and on a leak commit the page back.
	 *
	 * @return callable
	 */
	public static function page_text_around( $write, $post_id = 0, $keys = array() ) {
		if ( ! is_callable( $write ) || ! self::api()->active() || '' === self::api()->post_lang( (int) $post_id ) ) {
			return $write;
		}
		$post_id = (int) $post_id;
		$keys    = (array) $keys;
		return static function () use ( $write, $post_id, $keys ) {
			return self::around(
				$post_id,
				$keys,
				static function () use ( $write, $post_id ) {
					$result = $write();
					if ( is_array( $result ) ) {
						$result['resource_after_hash'] = EMCP_Tools_Change_Recorder::hash_created_resource( $post_id );
					}
					return $result;
				},
				static function ( array $result ) use ( $post_id ) {
					if ( ! hash_equals( (string) $result['resource_after_hash'], EMCP_Tools_Change_Recorder::hash_created_resource( $post_id ) ) ) {
						return new WP_Error( 'conflict', __( 'The page changed again before its write could be reversed.', 'emcp-tools' ) );
					}
					$done = EMCP_Tools_Page_Text_Writer::commit( $post_id, (array) $result['before'], (string) $result['page_after_hash'], false );
					return is_wp_error( $done ) ? $done : true;
				}
			);
		};
	}

	/**
	 * @param int      $post_id Group anchor: the target, or the source of a post being created.
	 * @param string[] $keys    Meta keys (and field names) the write touches.
	 * @param callable $write   (): array|WP_Error; may return target_id, record_history.
	 * @param callable $recover ( array $result ): true|WP_Error.
	 * @return mixed The write's result, or WP_Error sync_leak.
	 */
	public static function around( int $post_id, array $keys, callable $write, callable $recover ) {
		$api      = self::api();
		$meta     = array_values( array_diff( $keys, array( 'post_title', 'post_excerpt', 'post_content', 'post_status', 'post_name', 'post_password' ) ) );
		$before   = array();
		foreach ( array_diff( array_map( 'intval', $api->post_group( $post_id ) ), array( $post_id ) ) as $member ) {
			$before[ $member ] = self::image( $member, $meta );
		}
		// The anchor is a member too when the write creates a new post (a target_id other than it).
		$before[ $post_id ] = self::image( $post_id, $meta );

		$filter_meta = static function ( $copy ) use ( $meta ) {
			return array_values( array_diff( (array) $copy, $meta ) );
		};
		$filter_tax  = static function () {
			return array();
		};
		add_filter( 'pll_copy_post_metas', $filter_meta, PHP_INT_MAX );
		add_filter( 'pll_copy_taxonomies', $filter_tax, PHP_INT_MAX );
		$removed = self::unhook_field_sync();
		try {
			$result = $write();
		} finally {
			remove_filter( 'pll_copy_post_metas', $filter_meta, PHP_INT_MAX );
			remove_filter( 'pll_copy_taxonomies', $filter_tax, PHP_INT_MAX );
			foreach ( $removed as $r ) {
				add_action( 'pll_save_post', $r[0], $r[1], $r[2] );
			}
		}
		if ( ! is_array( $result ) ) {
			return $result;
		}
		$target = (int) ( $result['target_id'] ?? $post_id );
		if ( $target === $post_id ) {
			unset( $before[ $post_id ] );
		}
		$target_lang  = $api->post_lang( $target );
		$target_image = self::image( $target, $meta );
		$leaks        = array();
		foreach ( $before as $member => $was ) {
			$now     = self::image( $member, $meta );
			$changed = self::attributed( $was, $now, $target_image, $api->post_lang( $member ), $target_lang );
			if ( $changed ) {
				$leaks[] = array( 'post_id' => $member, 'fields' => $changed );
			}
		}
		if ( ! $leaks ) {
			return $result;
		}

		$recovered = $recover( $result );
		$data      = array(
			'members'          => $leaks,
			'target_recovered' => true === $recovered,
			'leak_changes'     => array(),
			'result'           => $result,
		);
		if ( true !== $recovered && isset( $result['record_history'] ) && is_callable( $result['record_history'] ) ) {
			$data['change_id'] = call_user_func( $result['record_history'] );
		}
		if ( class_exists( 'EMCP_Tools_Polylang_History' ) ) {
			foreach ( $leaks as $leak ) {
				$was = array();
				foreach ( $leak['fields'] as $field => $pair ) {
					$was[ $field ] = $pair['before'];
				}
				$id = EMCP_Tools_Polylang_History::record_leak( (int) $leak['post_id'], $was );
				if ( '' !== $id ) {
					$data['leak_changes'][] = $id;
				}
			}
		}
		return new WP_Error(
			'sync_leak',
			true === $recovered
				? __( 'Polylang copied part of this write to other translations. The write was reversed; the other translations were left as they are now and each has a History entry that restores it.', 'emcp-tools' )
				: __( 'Polylang copied part of this write to other translations, and the write could not be reversed. The other translations were left as they are now; History has an entry for each, and for the write.', 'emcp-tools' ),
			$data
		);
	}

	/**
	 * What Polylang can sync on one post: the sync fields, the written meta keys and the
	 * term IDs of translated taxonomies (and post format).
	 *
	 * @return array<string,mixed>
	 */
	public static function image( int $post_id, array $meta ): array {
		clean_post_cache( $post_id );
		wp_cache_delete( $post_id, 'post_meta' );
		$post = get_post( $post_id );
		$out  = array();
		foreach ( self::SYNC_FIELDS as $field ) {
			$out[ $field ] = $post && isset( $post->$field ) ? (string) $post->$field : null;
		}
		foreach ( $meta as $key ) {
			$out[ 'meta:' . $key ] = metadata_exists( 'post', $post_id, $key ) ? get_post_meta( $post_id, $key, true ) : null;
		}
		$api = self::api();
		foreach ( get_object_taxonomies( $post ? (string) $post->post_type : 'post' ) as $tax ) {
			$tax = is_object( $tax ) ? (string) $tax->name : (string) $tax;
			if ( 'post_format' !== $tax && ! $api->is_translated_taxonomy( $tax ) ) {
				continue;
			}
			$ids = wp_get_object_terms( $post_id, $tax, array( 'fields' => 'ids', 'lang' => '' ) );
			$ids = is_array( $ids ) ? array_map( 'intval', $ids ) : array();
			sort( $ids );
			$out[ 'terms:' . $tax ] = $ids;
		}
		return $out;
	}

	/**
	 * Changes on a member that the write explains.
	 *
	 * @return array<string,array{before:mixed,now:mixed}>
	 */
	private static function attributed( array $was, array $now, array $target, string $member_lang, string $target_lang ): array {
		$api = self::api();
		$out = array();
		foreach ( $now as $field => $value ) {
			$old = $was[ $field ] ?? null;
			if ( $old === $value ) {
				continue;
			}
			$theirs = $target[ $field ] ?? null;
			if ( 0 === strpos( $field, 'terms:' ) ) {
				$projected = array();
				foreach ( (array) $theirs as $term ) {
					$tr          = '' === $member_lang ? 0 : $api->term_translation( (int) $term, $member_lang );
					$projected[] = $tr ? $tr : (int) $term;
				}
				$added   = array_diff( (array) $value, (array) $old );
				$removed = array_diff( (array) $old, (array) $value );
				$explained = ( $added && ! array_diff( $added, $projected ) ) || ( $removed && ! array_intersect( $removed, $projected ) && ! $added );
				if ( $explained ) {
					$out[ $field ] = array( 'before' => $old, 'now' => $value );
				}
				continue;
			}
			if ( 'post_parent' === $field ) {
				$parent    = (int) $theirs;
				$explained = (int) $value === $parent || ( '' !== $member_lang && $parent && (int) $value === $api->post_translation( $parent, $member_lang ) );
			} else {
				$explained = $value === $theirs;
			}
			if ( $explained ) {
				$out[ $field ] = array( 'before' => $old, 'now' => $value );
			}
		}
		return $out;
	}

	/**
	 * Remove every pll_save_post callback of PLL_Sync / PLL_Admin_Sync, found by walking
	 * the hook (a WP_Hook in WordPress, the plain array in the unit bootstrap).
	 *
	 * @return array<int,array{0:callable,1:int,2:int}>
	 */
	private static function unhook_field_sync(): array {
		$found = array();
		$hook  = $GLOBALS['wp_filter']['pll_save_post'] ?? null;
		if ( is_object( $hook ) && isset( $hook->callbacks ) ) {
			foreach ( $hook->callbacks as $priority => $callbacks ) {
				foreach ( $callbacks as $cb ) {
					if ( self::is_field_sync( $cb['function'] ?? null ) ) {
						$found[] = array( $cb['function'], (int) $priority, (int) ( $cb['accepted_args'] ?? 1 ) );
					}
				}
			}
		} elseif ( isset( $GLOBALS['_wp_filters']['pll_save_post'] ) ) {
			foreach ( $GLOBALS['_wp_filters']['pll_save_post'] as $priority => $callbacks ) {
				foreach ( $callbacks as $cb ) {
					if ( self::is_field_sync( $cb['cb'] ?? null ) ) {
						$found[] = array( $cb['cb'], (int) $priority, (int) ( $cb['args'] ?? 1 ) );
					}
				}
			}
		}
		foreach ( $found as $f ) {
			remove_action( 'pll_save_post', $f[0], $f[1] );
		}
		return $found;
	}

	private static function is_field_sync( $callback ): bool {
		if ( ! is_array( $callback ) || ! isset( $callback[0] ) || ! is_object( $callback[0] ) ) {
			return false;
		}
		return ( class_exists( 'PLL_Sync' ) && $callback[0] instanceof PLL_Sync ) || ( class_exists( 'PLL_Admin_Sync' ) && $callback[0] instanceof PLL_Admin_Sync );
	}
}
