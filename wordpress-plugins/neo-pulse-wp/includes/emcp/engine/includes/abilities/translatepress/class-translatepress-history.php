<?php
/**
 * History for the TranslatePress tools (3.19.0), on the free emcp_tools_change_apply_rollback /
 * emcp_tools_change_current_hash seams. Booted from the Pro loader's wire_runtime_hooks(), so
 * the admin History screen, its REST routes and WP-CLI can undo these entries.
 *
 *  - translatepress-strings (transactional): translations and statuses of dictionary or gettext
 *    rows. The undo runs inside the change log's transaction: it locks the rows, refuses
 *    (conflict, with or without force) when any row is not what the write left, writes the
 *    before-image back with TranslatePress's own function, puts NULL translations back, and
 *    verifies; the change log then marks the entry and records the audit entry in the same
 *    transaction. The editor's save action runs after the commit.
 *  - translatepress-settings: the trp_settings keys a language operation changed. Undoing
 *    add-language is refused once that language's page strings carry translations.
 *
 * @package EMCP_Tools
 * @since   3.19.0
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/** @since 3.19.0 */
final class EMCP_Tools_TranslatePress_History {

	const STRINGS  = 'translatepress-strings';
	const SETTINGS = 'translatepress-settings';

	/** trp_settings keys the language operations change. */
	const SETTINGS_KEYS = array( 'default-language', 'translation-languages', 'publish-languages', 'url-slugs' );

	/** @var EMCP_Tools_TranslatePress_Api|null */
	private static $api = null;

	public static function use_api( ?EMCP_Tools_TranslatePress_Api $api ): void {
		self::$api = $api;
	}

	private static function api(): EMCP_Tools_TranslatePress_Api {
		if ( self::$api ) {
			return self::$api;
		}
		// An undo can run before the deferred MCP surface loads (an admin History request).
		if ( ! class_exists( 'EMCP_Tools_TranslatePress_Api' ) ) {
			require_once __DIR__ . '/class-translatepress-api.php';
		}
		return class_exists( 'EMCP_Tools_TranslatePress_Integration' ) ? EMCP_Tools_TranslatePress_Integration::shared_api() : new EMCP_Tools_TranslatePress_Api();
	}

	public static function boot(): void {
		if ( ! has_filter( 'emcp_tools_change_apply_rollback', array( __CLASS__, 'filter_apply' ) ) ) {
			add_filter( 'emcp_tools_change_current_hash', array( __CLASS__, 'filter_hash' ), 10, 2 );
			add_filter( 'emcp_tools_change_apply_rollback', array( __CLASS__, 'filter_apply' ), 10, 3 );
		}
	}

	/** Hash of rows as {id: version}, in id order. */
	public static function rows_hash( array $rows ): string {
		$versions = array();
		foreach ( $rows as $id => $row ) {
			$versions[ (int) $id ] = EMCP_Tools_TranslatePress_Api::version( isset( $row['translated'] ) ? (string) $row['translated'] : null, (int) $row['status'] );
		}
		ksort( $versions );
		return hash( 'sha256', (string) wp_json_encode( $versions ) );
	}

	/** Only translated and status of each row. */
	public static function image( array $rows ): array {
		$out = array();
		foreach ( $rows as $id => $row ) {
			$out[ (int) $id ] = array(
				'translated' => isset( $row['translated'] ) ? (string) $row['translated'] : null,
				'status'     => (int) $row['status'],
			);
		}
		ksort( $out );
		return $out;
	}

	/**
	 * Record a string write. Called inside the write's transaction.
	 *
	 * @param array $before id => locked row.
	 * @param array $after  id => {translated, status} written.
	 * @return string Change id, or '' when History could not record it.
	 */
	public static function record_strings( string $operation, string $lang, string $kind, array $before, array $after ): string {
		if ( ! class_exists( 'EMCP_Tools_Change_Log' ) ) {
			return '';
		}
		$before = self::image( $before );
		$after  = self::image( $after );
		$ids    = array_keys( $after );
		$label  = EMCP_Tools_TranslatePress_Api::GETTEXT === $kind ? __( 'gettext strings', 'emcp-tools' ) : __( 'strings', 'emcp-tools' );
		$rb     = array(
			'type'          => self::STRINGS,
			'transactional' => true,
			'lang'          => $lang,
			'kind'          => $kind,
			'ids'           => $ids,
			'after_hash'    => self::rows_hash( $after ),
		);
		$heavy  = array(
			'before' => $before,
			'after'  => $after,
		);
		return EMCP_Tools_Change_Log::record(
			array(
				'domain'   => 'translatepress',
				'action'   => $operation,
				'target'   => 'translatepress ' . $lang . ' ' . $kind . ' #' . implode( ',', array_slice( $ids, 0, 20 ) ) . ( count( $ids ) > 20 ? ',...' : '' ),
				/* translators: 1: number of strings, 2: language code, 3: "strings" or "gettext strings", 4: operation. */
				'summary'  => sprintf( __( 'TranslatePress: %1$d %2$s %3$s (%4$s)', 'emcp-tools' ), count( $ids ), $lang, $label, $operation ),
				'rollback' => class_exists( 'EMCP_Tools_Change_Recorder' ) ? EMCP_Tools_Change_Recorder::attach_before( $rb, $heavy ) : array_merge( $rb, $heavy ),
			)
		);
	}

	/** The current hash of the keys a settings entry covers. */
	public static function settings_hash( array $settings, array $keys ): string {
		$picked = array();
		foreach ( $keys as $key ) {
			$picked[ $key ] = $settings[ $key ] ?? null;
		}
		ksort( $picked );
		return hash( 'sha256', (string) wp_json_encode( $picked ) );
	}

	/**
	 * Record a language operation.
	 *
	 * @param array $before trp_settings before the operation.
	 * @param array $after  trp_settings after it.
	 * @param array $extra  added_language for add-language.
	 */
	public static function record_settings( string $operation, string $summary, array $before, array $after, array $extra = array() ): string {
		if ( ! class_exists( 'EMCP_Tools_Change_Log' ) ) {
			return '';
		}
		$keys = array();
		foreach ( self::SETTINGS_KEYS as $key ) {
			if ( ( $before[ $key ] ?? null ) !== ( $after[ $key ] ?? null ) ) {
				$keys[] = $key;
			}
		}
		if ( ! $keys ) {
			return '';
		}
		$picked = array();
		foreach ( $keys as $key ) {
			$picked[ $key ] = $before[ $key ] ?? null;
		}
		return EMCP_Tools_Change_Log::record(
			array(
				'domain'   => 'translatepress',
				'action'   => $operation,
				'target'   => 'option trp_settings',
				'summary'  => $summary,
				'rollback' => array(
					'type'       => self::SETTINGS,
					'keys'       => $keys,
					'before'     => $picked,
					'after_hash' => self::settings_hash( $after, $keys ),
				) + $extra,
			)
		);
	}

	/**
	 * Current hash for our types.
	 *
	 * @param string $hash '' when unknown.
	 * @param array  $rb   Rollback ref.
	 */
	public static function filter_hash( $hash, $rb ) {
		$type = (string) ( $rb['type'] ?? '' );
		if ( self::STRINGS === $type ) {
			$rows = self::api()->read_rows( (string) $rb['kind'], (string) $rb['lang'], (array) ( $rb['ids'] ?? array() ) );
			return count( $rows ) === count( (array) ( $rb['ids'] ?? array() ) ) ? self::rows_hash( $rows ) : '';
		}
		if ( self::SETTINGS === $type ) {
			return self::settings_hash( self::api()->settings(), (array) ( $rb['keys'] ?? array() ) );
		}
		return $hash;
	}

	/**
	 * Apply our types.
	 *
	 * @param true|WP_Error|null $result null when unhandled.
	 * @param array              $rb     Rollback ref.
	 * @param bool               $force  Caller's force flag.
	 * @return true|WP_Error|null
	 */
	public static function filter_apply( $result, $rb, $force = false ) {
		$type = (string) ( $rb['type'] ?? '' );
		if ( self::STRINGS === $type ) {
			return self::undo_strings( (array) $rb );
		}
		if ( self::SETTINGS === $type ) {
			return self::undo_settings( (array) $rb );
		}
		return $result;
	}

	private static function conflict(): WP_Error {
		return new WP_Error( 'conflict', __( 'A translation changed after this write, so it is not undone (force does not apply: undoing would overwrite the newer translation).', 'emcp-tools' ) );
	}

	/** @return true|WP_Error */
	private static function undo_strings( array $rb ) {
		if ( ! EMCP_Tools_Change_Log::in_transaction() ) {
			return new WP_Error( 'rollback_failed', __( 'A TranslatePress string undo only runs inside History\'s transaction.', 'emcp-tools' ) );
		}
		$api    = self::api();
		$lang   = (string) ( $rb['lang'] ?? '' );
		$kind   = EMCP_Tools_TranslatePress_Api::GETTEXT === ( $rb['kind'] ?? '' ) ? EMCP_Tools_TranslatePress_Api::GETTEXT : EMCP_Tools_TranslatePress_Api::REGULAR;
		$before = (array) ( $rb['before'] ?? array() );
		$after  = (array) ( $rb['after'] ?? array() );
		$ids    = array_map( 'intval', array_keys( $after ) );
		if ( ! $ids || count( $before ) !== count( $after ) ) {
			return new WP_Error( 'rollback_failed', __( 'This History entry has no rows to restore.', 'emcp-tools' ) );
		}
		$locked = $api->lock_rows( $kind, $lang, $ids );
		foreach ( $ids as $id ) {
			if ( ! isset( $locked[ $id ] ) ) {
				return self::conflict();
			}
			$now  = EMCP_Tools_TranslatePress_Api::version( isset( $locked[ $id ]['translated'] ) ? (string) $locked[ $id ]['translated'] : null, (int) $locked[ $id ]['status'] );
			$then = EMCP_Tools_TranslatePress_Api::version( isset( $after[ $id ]['translated'] ) ? (string) $after[ $id ]['translated'] : null, (int) $after[ $id ]['status'] );
			if ( ! hash_equals( $then, $now ) ) {
				return self::conflict();
			}
		}
		$rows  = array();
		$nulls = array();
		foreach ( $ids as $id ) {
			$b   = (array) ( $before[ $id ] ?? $before[ (string) $id ] ?? array() );
			$row = array(
				'id'         => $id,
				'translated' => (string) ( $b['translated'] ?? '' ),
				'status'     => (int) ( $b['status'] ?? 0 ),
			);
			if ( EMCP_Tools_TranslatePress_Api::REGULAR === $kind ) {
				$row['block_type'] = (int) ( $locked[ $id ]['block_type'] ?? 0 );
			}
			$rows[] = $row;
			if ( ! isset( $b['translated'] ) ) {
				$nulls[] = $id;
			}
		}
		$written = $api->write_rows( $kind, $lang, $rows );
		if ( is_wp_error( $written ) ) {
			return $written;
		}
		if ( $nulls && ! $api->null_translations( $kind, $lang, $nulls ) ) {
			return new WP_Error( 'rollback_failed', __( 'TranslatePress rows could not be set back to untranslated.', 'emcp-tools' ) );
		}
		$check = $api->lock_rows( $kind, $lang, $ids );
		foreach ( $ids as $id ) {
			$b = (array) ( $before[ $id ] ?? $before[ (string) $id ] ?? array() );
			if ( ! isset( $check[ $id ] ) || ( $b['translated'] ?? null ) !== ( isset( $check[ $id ]['translated'] ) ? (string) $check[ $id ]['translated'] : null ) || (int) ( $b['status'] ?? 0 ) !== (int) $check[ $id ]['status'] ) {
				return new WP_Error( 'rollback_failed', __( 'TranslatePress did not restore every row.', 'emcp-tools' ) );
			}
		}
		$saved = array();
		foreach ( $rows as $row ) {
			$saved[] = array( 'id' => $row['id'], 'original' => (string) ( $locked[ $row['id'] ]['original'] ?? '' ) ) + $row;
		}
		EMCP_Tools_Change_Log::after_commit(
			static function () use ( $api, $kind, $lang, $saved ) {
				$api->saved_action( $kind, $lang, $saved );
			}
		);
		return true;
	}

	/** @return true|WP_Error */
	private static function undo_settings( array $rb ) {
		$api  = self::api();
		$now  = $api->settings();
		$keys = (array) ( $rb['keys'] ?? array() );
		if ( ! hash_equals( (string) ( $rb['after_hash'] ?? '' ), self::settings_hash( $now, $keys ) ) ) {
			return new WP_Error( 'conflict', __( 'The TranslatePress language settings changed after this change, so it is not undone.', 'emcp-tools' ) );
		}
		$added = (string) ( $rb['added_language'] ?? '' );
		if ( '' !== $added && $api->has_translations( $added ) ) {
			return new WP_Error( 'conflict', __( 'The language added by this change now has translations; remove it with remove-language instead if that is what you want.', 'emcp-tools' ) );
		}
		$next = $now;
		foreach ( $keys as $key ) {
			if ( array_key_exists( $key, (array) ( $rb['before'] ?? array() ) ) && null !== $rb['before'][ $key ] ) {
				$next[ $key ] = $rb['before'][ $key ];
			} else {
				unset( $next[ $key ] );
			}
		}
		$saved = $api->save_settings( $next );
		if ( is_wp_error( $saved ) ) {
			return $saved;
		}
		$after = $api->settings();
		foreach ( $keys as $key ) {
			if ( ( $rb['before'][ $key ] ?? null ) !== ( $after[ $key ] ?? null ) ) {
				return new WP_Error( 'rollback_failed', __( 'TranslatePress did not keep the restored language settings.', 'emcp-tools' ) );
			}
		}
		return true;
	}
}
