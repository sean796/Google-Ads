<?php
/**
 * History for the Polylang tools: dedicated rollback types on the free
 * emcp_tools_change_apply_rollback / emcp_tools_change_current_hash seams, because the
 * change log handles its built-in types itself and they cannot be wrapped in the sync
 * guard. Booted from the Pro loader's wire_runtime_hooks(), so the admin History screen,
 * its REST routes and WP-CLI can undo them.
 *
 *  - polylang-created-post: delete a copy and restore the group it joined.
 *  - polylang-post-state:   status and dates, inside the sync guard.
 *  - polylang-sync-leak:    restore the fields Polylang copied onto another translation.
 *  - polylang-created-term, polylang-setup: see record_created_term() / record_setup().
 *
 * @package EMCP_Tools
 * @since   3.19.0
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/** @since 3.19.0 */
final class EMCP_Tools_Polylang_History {

	const TYPES = array( 'polylang-created-post', 'polylang-post-state', 'polylang-sync-leak', 'polylang-created-term', 'polylang-setup' );

	/** @var EMCP_Tools_Polylang_Api|null */
	private static $api = null;

	public static function use_api( ?EMCP_Tools_Polylang_Api $api ): void {
		self::$api = $api;
	}

	private static function api(): EMCP_Tools_Polylang_Api {
		if ( self::$api ) {
			return self::$api;
		}
		self::ensure();
		return class_exists( 'EMCP_Tools_Polylang_Integration' ) ? EMCP_Tools_Polylang_Integration::shared_api() : new EMCP_Tools_Polylang_Api();
	}

	public static function boot(): void {
		if ( ! has_filter( 'emcp_tools_change_apply_rollback', array( __CLASS__, 'filter_apply' ) ) ) {
			add_filter( 'emcp_tools_change_current_hash', array( __CLASS__, 'filter_hash' ), 10, 2 );
			add_filter( 'emcp_tools_change_apply_rollback', array( __CLASS__, 'filter_apply' ), 10, 3 );
		}
	}

	/** Restores can run before the deferred MCP surface loads (an admin History request). */
	private static function ensure(): void {
		foreach ( array( 'EMCP_Tools_Polylang_Api' => 'class-polylang-api.php', 'EMCP_Tools_Polylang_Copier' => 'class-polylang-copier.php', 'EMCP_Tools_Polylang_Sync_Guard' => 'class-polylang-sync-guard.php' ) as $class => $file ) {
			if ( ! class_exists( $class ) ) {
				require_once __DIR__ . '/' . $file;
			}
		}
	}

	private static function record( string $action, string $target, string $summary, array $rb, array $heavy = array() ): string {
		if ( ! class_exists( 'EMCP_Tools_Change_Log' ) ) {
			return '';
		}
		return EMCP_Tools_Change_Log::record(
			array(
				'domain'   => 'polylang',
				'action'   => $action,
				'target'   => $target,
				'summary'  => $summary,
				'rollback' => $heavy ? EMCP_Tools_Change_Recorder::attach_before( $rb, $heavy ) : $rb,
			)
		);
	}

	// polylang-created-post.

	private static function created_post_hash( int $post_id, int $source_id ): string {
		$resource = EMCP_Tools_Change_Recorder::hash_created_resource( $post_id );
		if ( '' === $resource ) {
			return '';
		}
		$group = self::api()->post_group( $source_id );
		ksort( $group );
		return hash( 'sha256', $resource . '|' . wp_json_encode( $group ) );
	}

	public static function record_created_post( array $copy, string $lang ): string {
		$id = (int) $copy['target_id'];
		return self::record(
			'create-translation',
			'post #' . $id,
			/* translators: 1: language, 2: source post ID. */
			sprintf( __( 'Polylang: %1$s translation of post %2$d', 'emcp-tools' ), $lang, (int) $copy['source_id'] ),
			array(
				'type'                => 'polylang-created-post',
				'post_id'             => $id,
				'source_id'           => (int) $copy['source_id'],
				'group_before'        => (array) $copy['group_before'],
				'group_after'         => (array) $copy['group_after'],
				'resource_after_hash' => (string) $copy['resource_after_hash'],
				'after_hash'          => self::created_post_hash( $id, (int) $copy['source_id'] ),
			)
		);
	}

	// polylang-post-state.

	public static function record_post_state( int $post_id, array $before, string $summary ): string {
		return self::record(
			'set-status',
			'post #' . $post_id,
			$summary,
			array(
				'type'       => 'polylang-post-state',
				'post_id'    => $post_id,
				'before'     => $before,
				'after_hash' => EMCP_Tools_Change_Recorder::hash_created_resource( $post_id ),
			)
		);
	}

	/** Write status and dates, then verify. @return true|WP_Error */
	public static function write_post_state( int $post_id, array $state ) {
		$fields = array_intersect_key( $state, array_flip( array( 'post_status', 'post_date', 'post_date_gmt' ) ) );
		$result = wp_update_post( array_merge( array( 'ID' => $post_id, 'edit_date' => true ), $fields ), true );
		if ( is_wp_error( $result ) ) {
			return $result;
		}
		if ( ! $result ) {
			return new WP_Error( 'rollback_failed', __( 'The post could not be updated.', 'emcp-tools' ) );
		}
		// wp_update_post() recomputes an empty GMT date for a draft; put the stored values back exactly.
		global $wpdb;
		if ( isset( $wpdb, $wpdb->posts ) && is_object( $wpdb ) && method_exists( $wpdb, 'update' ) && isset( $fields['post_date_gmt'] ) ) {
			$wpdb->update( $wpdb->posts, $fields, array( 'ID' => $post_id ) );
			clean_post_cache( $post_id );
		}
		return true;
	}

	// polylang-sync-leak.

	private static function leak_hash( int $post_id, array $fields ): string {
		$meta = array();
		foreach ( array_keys( $fields ) as $field ) {
			if ( 0 === strpos( $field, 'meta:' ) ) {
				$meta[] = substr( $field, 5 );
			}
		}
		$image = EMCP_Tools_Polylang_Sync_Guard::image( $post_id, $meta );
		return hash( 'sha256', (string) wp_json_encode( array_intersect_key( $image, $fields ) ) );
	}

	/** @param array<string,mixed> $before field => value before Polylang copied the write onto it. */
	public static function record_leak( int $post_id, array $before ): string {
		self::ensure();
		return self::record(
			'sync-leak',
			'post #' . $post_id,
			/* translators: %d: post ID. */
			sprintf( __( 'Polylang sync changed post %d; undo restores it', 'emcp-tools' ), $post_id ),
			array(
				'type'       => 'polylang-sync-leak',
				'post_id'    => $post_id,
				'before'     => $before,
				'after_hash' => self::leak_hash( $post_id, $before ),
			)
		);
	}

	/** @return true|WP_Error */
	private static function restore_leak( int $post_id, array $before ) {
		$fields = array();
		foreach ( $before as $field => $value ) {
			if ( 0 === strpos( $field, 'meta:' ) ) {
				$key = substr( $field, 5 );
				if ( null === $value ) {
					delete_post_meta( $post_id, $key );
				} else {
					update_post_meta( $post_id, $key, wp_slash( $value ) );
				}
			} elseif ( 0 === strpos( $field, 'terms:' ) ) {
				wp_set_object_terms( $post_id, array_map( 'intval', (array) $value ), substr( $field, 6 ) );
			} else {
				$fields[ $field ] = $value;
			}
		}
		if ( $fields ) {
			global $wpdb;
			if ( isset( $wpdb, $wpdb->posts ) && is_object( $wpdb ) && method_exists( $wpdb, 'update' ) ) {
				$wpdb->update( $wpdb->posts, $fields, array( 'ID' => $post_id ) );
			} else {
				wp_update_post( array_merge( array( 'ID' => $post_id ), $fields ) );
			}
			clean_post_cache( $post_id );
		}
		return true;
	}

	// polylang-created-term.

	private static function created_term_hash( int $term_id, int $source_id ): string {
		$api  = self::api();
		$term = $api->term( $term_id );
		if ( ! $term ) {
			return '';
		}
		$group = $api->term_group( $source_id );
		ksort( $group );
		return hash( 'sha256', (string) wp_json_encode( array( $term, $api->term_meta( $term_id ), $group ) ) );
	}

	public static function record_created_term( int $term_id, string $taxonomy, int $source_id, array $group_before ): string {
		return self::record(
			'create-term-translation',
			'term #' . $term_id,
			/* translators: 1: term ID, 2: source term ID. */
			sprintf( __( 'Polylang: term %1$d translates term %2$d', 'emcp-tools' ), $term_id, $source_id ),
			array(
				'type'         => 'polylang-created-term',
				'term_id'      => $term_id,
				'taxonomy'     => $taxonomy,
				'source_id'    => $source_id,
				'group_before' => $group_before,
				'after_hash'   => self::created_term_hash( $term_id, $source_id ),
			)
		);
	}

	/** @return true|WP_Error */
	private static function remove_term( array $rb, bool $force ) {
		$api  = self::api();
		$id   = (int) ( $rb['term_id'] ?? 0 );
		$term = $api->term( $id );
		if ( ! $term ) {
			return true;
		}
		if ( $term['count'] > 0 ) {
			return new WP_Error( 'conflict', __( 'This term is in use, so it is not deleted.', 'emcp-tools' ) );
		}
		if ( ! $force && ! hash_equals( (string) ( $rb['after_hash'] ?? '' ), self::created_term_hash( $id, (int) $rb['source_id'] ) ) ) {
			return new WP_Error( 'conflict', __( 'This term or its translation group changed since it was created, so it is not deleted.', 'emcp-tools' ) );
		}
		$api->save_term_group( (array) $rb['group_before'] );
		return $api->delete_term( $id, (string) $rb['taxonomy'] ) ? true : new WP_Error( 'rollback_failed', __( 'The term could not be deleted.', 'emcp-tools' ) );
	}

	// polylang-setup: languages, options, assigned languages, groups, string tables.

	public static function record_setup( string $action, string $summary, string $kind, array $data ): string {
		self::ensure();
		return self::record(
			$action,
			'polylang ' . $kind,
			$summary,
			array(
				'type'       => 'polylang-setup',
				'kind'       => $kind,
				'data'       => $data,
				'after_hash' => self::setup_hash( $kind, $data ),
			)
		);
	}

	private static function language_row( int $term_id ): ?array {
		foreach ( self::api()->languages() as $lang ) {
			if ( (int) $lang['term_id'] === $term_id ) {
				return $lang;
			}
		}
		return null;
	}

	/** Current state of what a setup entry changed. */
	private static function setup_state( string $kind, array $data ) {
		$api = self::api();
		switch ( $kind ) {
			case 'language-added':
			case 'language-updated':
				// What the language is, not how much uses it or whether it is the default now.
				$row = self::language_row( (int) ( $data['term_id'] ?? 0 ) );
				if ( null !== $row ) {
					unset( $row['count'], $row['term_count'], $row['is_default'] );
				}
				return $row;
			case 'options':
				$opts = $api->options();
				$out  = array();
				foreach ( array_keys( (array) $data['before'] ) as $key ) {
					$out[ $key ] = $opts[ $key ] ?? null;
				}
				return $out;
			case 'languages':
				$out = array( 'posts' => array(), 'terms' => array() );
				foreach ( array_keys( (array) $data['before']['posts'] ) as $id ) {
					$out['posts'][ $id ] = $api->post_lang( (int) $id );
				}
				foreach ( array_keys( (array) $data['before']['terms'] ) as $id ) {
					$out['terms'][ $id ] = $api->term_lang( (int) $id );
				}
				return $out;
			case 'groups':
				$out = array();
				foreach ( array_keys( (array) $data['before'] ) as $id ) {
					$group = 'term' === ( $data['object'] ?? 'post' ) ? $api->term_group( (int) $id ) : $api->post_group( (int) $id );
					ksort( $group );
					$out[ $id ] = $group;
				}
				return $out;
			case 'strings':
				$table = $api->string_table( (string) $data['lang'] );
				ksort( $table );
				return $table;
		}
		return null;
	}

	private static function setup_hash( string $kind, array $data ): string {
		$state = self::setup_state( $kind, $data );
		return null === $state ? '' : hash( 'sha256', (string) wp_json_encode( $state ) );
	}

	/** @return true|WP_Error */
	private static function restore_setup( string $kind, array $data ) {
		$api = self::api();
		switch ( $kind ) {
			case 'language-added':
				$row = self::language_row( (int) ( $data['term_id'] ?? 0 ) );
				if ( ! $row ) {
					return true;
				}
				// Terms do not count: Polylang gives every new language its own default category.
				if ( $row['count'] > 0 ) {
					return new WP_Error( 'conflict', __( 'Posts use this language now, so it is not deleted.', 'emcp-tools' ) );
				}
				$done = $api->rest( 'DELETE', '/pll/v1/languages/' . (int) $row['term_id'] );
				$api->clean_cache();
				return is_wp_error( $done ) ? $done : true;
			case 'language-updated':
				$done = $api->rest( 'PUT', '/pll/v1/languages/' . (int) $data['term_id'], (array) $data['before'] );
				$api->clean_cache();
				return is_wp_error( $done ) ? $done : true;
			case 'options':
				$done = $api->rest( 'PUT', '/pll/v1/settings', (array) $data['before'] );
				$api->clean_cache();
				return is_wp_error( $done ) ? $done : true;
			case 'languages':
				foreach ( (array) $data['before']['posts'] as $id => $lang ) {
					$api->set_post_lang( (int) $id, (string) $lang );
				}
				foreach ( (array) $data['before']['terms'] as $id => $lang ) {
					$api->set_term_lang( (int) $id, (string) $lang );
				}
				return true;
			case 'groups':
				foreach ( (array) $data['before'] as $group ) {
					$group = (array) $group;
					if ( ! $group ) {
						continue;
					}
					if ( 'term' === ( $data['object'] ?? 'post' ) ) {
						$api->save_term_group( $group );
					} else {
						$api->save_post_group( $group );
					}
				}
				return true;
			case 'strings':
				$api->save_string_table( (string) $data['lang'], (array) $data['before'] );
				return true;
		}
		return new WP_Error( 'unknown_rollback', __( 'Unknown Polylang setup change.', 'emcp-tools' ) );
	}

	// Filters.

	/** @internal */
	public static function filter_hash( $hash, $rb ) {
		if ( ! is_array( $rb ) || ! in_array( $rb['type'] ?? '', self::TYPES, true ) ) {
			return $hash;
		}
		self::ensure();
		$id = (int) ( $rb['post_id'] ?? 0 );
		switch ( $rb['type'] ) {
			case 'polylang-created-post':
				return self::created_post_hash( $id, (int) ( $rb['source_id'] ?? 0 ) );
			case 'polylang-post-state':
				return EMCP_Tools_Change_Recorder::hash_created_resource( $id );
			case 'polylang-sync-leak':
				return self::leak_hash( $id, (array) ( $rb['before'] ?? array() ) );
			case 'polylang-created-term':
				return self::created_term_hash( (int) ( $rb['term_id'] ?? 0 ), (int) ( $rb['source_id'] ?? 0 ) );
			case 'polylang-setup':
				return self::setup_hash( (string) ( $rb['kind'] ?? '' ), (array) ( $rb['data'] ?? array() ) );
		}
		return '';
	}

	/** @internal */
	public static function filter_apply( $result, $rb, $force = false ) {
		if ( ! is_array( $rb ) || ! in_array( $rb['type'] ?? '', self::TYPES, true ) ) {
			return $result;
		}
		self::ensure();
		$api = self::api();
		$id  = (int) ( $rb['post_id'] ?? 0 );
		switch ( $rb['type'] ) {
			case 'polylang-created-post':
				return ( new EMCP_Tools_Polylang_Copier( $api ) )->remove( $id, (int) $rb['source_id'], (array) $rb['group_before'], (array) $rb['group_after'], (string) $rb['resource_after_hash'], (bool) $force );
			case 'polylang-post-state':
				$before = (array) ( $rb['before'] ?? array() );
				$done   = EMCP_Tools_Polylang_Sync_Guard::around(
					$id,
					array(),
					static function () use ( $id, $before ) {
						$ok = self::write_post_state( $id, $before );
						return is_wp_error( $ok ) ? $ok : array( 'resource_after_hash' => EMCP_Tools_Change_Recorder::hash_created_resource( $id ) );
					},
					static function () {
						return new WP_Error( 'not_recovered', __( 'Restoring the status was copied to other translations.', 'emcp-tools' ) );
					}
				);
				return is_wp_error( $done ) ? $done : true;
			case 'polylang-sync-leak':
				return self::restore_leak( $id, (array) ( $rb['before'] ?? array() ) );
			case 'polylang-created-term':
				return self::remove_term( $rb, (bool) $force );
			case 'polylang-setup':
				return self::restore_setup( (string) ( $rb['kind'] ?? '' ), (array) ( $rb['data'] ?? array() ) );
		}
		return new WP_Error( 'unknown_rollback', __( 'Unknown rollback type.', 'emcp-tools' ) );
	}
}
