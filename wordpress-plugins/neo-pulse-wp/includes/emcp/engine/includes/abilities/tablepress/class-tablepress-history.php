<?php
/**
 * History for the TablePress tools (3.19.0), on the free emcp_tools_change_apply_rollback /
 * emcp_tools_change_current_hash seams. Booted from the Pro loader's wire_runtime_hooks(), so
 * the admin History screen, its REST routes and WP-CLI can undo these entries. Every undo runs
 * through EMCP_Tools_TablePress_Writer in undo mode, inside the registry lease, re-checking the
 * recorded after-version there (History's own check runs before the handler, outside the lease).
 *
 *  - tablepress-table: mode edit (restore the before-image), created (delete the table) or
 *    deleted (add the before-image back under its old id).
 *  - tablepress-table-id: change the id back.
 *  - tablepress-css: the custom CSS and its switch as they were.
 *
 * @package EMCP_Tools
 * @since   3.19.0
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/** @since 3.19.0 */
final class EMCP_Tools_TablePress_History {

	const TABLE = 'tablepress-table';
	const ID    = 'tablepress-table-id';
	const CSS   = 'tablepress-css';

	/** @var EMCP_Tools_TablePress_Api|null */
	private static $api = null;

	public static function use_api( ?EMCP_Tools_TablePress_Api $api ): void {
		self::$api = $api;
	}

	private static function api(): EMCP_Tools_TablePress_Api {
		if ( self::$api ) {
			return self::$api;
		}
		// An undo can run before the deferred MCP surface loads (an admin History request).
		foreach ( array( 'EMCP_Tools_TablePress_Api' => 'class-tablepress-api.php', 'EMCP_Tools_TablePress_Writer' => 'class-tablepress-writer.php', 'EMCP_Tools_TablePress_Integration' => 'class-tablepress-integration.php' ) as $class => $file ) {
			if ( ! class_exists( $class ) ) {
				require_once __DIR__ . '/' . $file;
			}
		}
		return EMCP_Tools_TablePress_Integration::shared_api();
	}

	private static function writer(): EMCP_Tools_TablePress_Writer {
		return new EMCP_Tools_TablePress_Writer( self::api() );
	}

	public static function boot(): void {
		if ( ! has_filter( 'emcp_tools_change_apply_rollback', array( __CLASS__, 'filter_apply' ) ) ) {
			add_filter( 'emcp_tools_change_current_hash', array( __CLASS__, 'filter_hash' ), 10, 2 );
			add_filter( 'emcp_tools_change_apply_rollback', array( __CLASS__, 'filter_apply' ), 10, 3 );
		}
	}

	private static function record( string $action, string $target, string $summary, array $rb, array $heavy = array() ): string {
		if ( ! class_exists( 'EMCP_Tools_Change_Log' ) ) {
			return '';
		}
		return EMCP_Tools_Change_Log::record(
			array(
				'domain'   => 'tablepress',
				'action'   => $action,
				'target'   => $target,
				'summary'  => $summary,
				'rollback' => $heavy ? ( class_exists( 'EMCP_Tools_Change_Recorder' ) ? EMCP_Tools_Change_Recorder::attach_before( $rb, $heavy ) : array_merge( $rb, $heavy ) ) : $rb,
			)
		);
	}

	public static function record_edit( string $operation, string $id, array $before, array $after ): string {
		return self::record(
			$operation,
			'tablepress table ' . $id,
			/* translators: 1: table id, 2: operation. */
			sprintf( __( 'TablePress: table %1$s (%2$s)', 'emcp-tools' ), $id, $operation ),
			array(
				'type'       => self::TABLE,
				'mode'       => 'edit',
				'table_id'   => $id,
				'after_hash' => EMCP_Tools_TablePress_Api::version( $after ),
			),
			array( 'before' => EMCP_Tools_TablePress_Api::canonical( $before ) )
		);
	}

	public static function record_created( string $operation, string $id, array $after ): string {
		return self::record(
			$operation,
			'tablepress table ' . $id,
			/* translators: 1: table id, 2: operation. */
			sprintf( __( 'TablePress: table %1$s created (%2$s)', 'emcp-tools' ), $id, $operation ),
			array(
				'type'       => self::TABLE,
				'mode'       => 'created',
				'table_id'   => $id,
				'after_hash' => EMCP_Tools_TablePress_Api::version( $after ),
			)
		);
	}

	public static function record_deleted( string $id, array $before ): string {
		return self::record(
			'delete-table',
			'tablepress table ' . $id,
			/* translators: %s: table id. */
			sprintf( __( 'TablePress: table %s deleted', 'emcp-tools' ), $id ),
			array(
				'type'       => self::TABLE,
				'mode'       => 'deleted',
				'table_id'   => $id,
				'after_hash' => 'absent',
			),
			array( 'before' => EMCP_Tools_TablePress_Api::canonical( $before ) )
		);
	}

	private static function id_state( string $old, string $new ): string {
		$api = self::api();
		return hash( 'sha256', ( $api->exists( $new ) ? 'new' : '-' ) . '|' . ( $api->exists( $old ) ? 'old' : '-' ) . '|' . $old . '>' . $new );
	}

	public static function record_id_change( string $old, string $new ): string {
		return self::record(
			'change-table-id',
			'tablepress table ' . $new,
			/* translators: 1: old id, 2: new id. */
			sprintf( __( 'TablePress: table %1$s renamed to %2$s', 'emcp-tools' ), $old, $new ),
			array(
				'type'       => self::ID,
				'old_id'     => $old,
				'new_id'     => $new,
				'after_hash' => self::id_state( $old, $new ),
			)
		);
	}

	public static function css_hash( array $options ): string {
		return hash( 'sha256', (string) wp_json_encode( array( ! empty( $options['use_custom_css'] ), (string) ( $options['custom_css'] ?? '' ) ) ) );
	}

	public static function record_css( array $before, array $after ): string {
		return self::record(
			'update-custom-css',
			'option tablepress_plugin_options',
			__( 'TablePress: custom CSS', 'emcp-tools' ),
			array(
				'type'       => self::CSS,
				'before'     => array( 'use_custom_css' => ! empty( $before['use_custom_css'] ), 'custom_css' => (string) ( $before['custom_css'] ?? '' ) ),
				'after_hash' => self::css_hash( $after ),
			)
		);
	}

	/**
	 * @param string $hash '' when unknown.
	 * @param array  $rb   Rollback ref.
	 */
	public static function filter_hash( $hash, $rb ) {
		$type = (string) ( $rb['type'] ?? '' );
		if ( in_array( $type, array( self::TABLE, self::ID, self::CSS ), true ) ) {
			// A long-lived process must not judge the conflict on a registry it read at boot.
			self::api()->refresh_registry();
		}
		if ( self::TABLE === $type ) {
			$table = self::api()->load( (string) $rb['table_id'], true );
			return is_wp_error( $table ) ? 'absent' : EMCP_Tools_TablePress_Api::version( $table );
		}
		if ( self::ID === $type ) {
			return self::id_state( (string) $rb['old_id'], (string) $rb['new_id'] );
		}
		if ( self::CSS === $type ) {
			return self::css_hash( self::api()->plugin_options() );
		}
		return $hash;
	}

	/**
	 * @param true|WP_Error|null $result null when unhandled.
	 * @param array              $rb     Rollback ref.
	 * @param bool               $force  Caller's force flag.
	 * @return true|WP_Error|null
	 */
	public static function filter_apply( $result, $rb, $force = false ) {
		$type  = (string) ( $rb['type'] ?? '' );
		$force = (bool) $force;
		if ( self::TABLE === $type ) {
			$id = (string) $rb['table_id'];
			switch ( (string) ( $rb['mode'] ?? '' ) ) {
				case 'edit':
					return self::writer()->restore( $id, (string) $rb['after_hash'], $force, (array) ( $rb['before'] ?? array() ) );
				case 'created':
					return self::writer()->undo_create( $id, (string) $rb['after_hash'], $force );
				case 'deleted':
					return self::writer()->undo_delete( $id, (array) ( $rb['before'] ?? array() ), $force );
			}
			return new WP_Error( 'rollback_failed', __( 'Unknown TablePress History entry.', 'emcp-tools' ) );
		}
		if ( self::ID === $type ) {
			return self::writer()->undo_change_id( (string) $rb['old_id'], (string) $rb['new_id'], $force );
		}
		if ( self::CSS === $type ) {
			if ( ! class_exists( 'EMCP_Tools_TablePress_Integration' ) ) {
				self::api();
			}
			return ( new EMCP_Tools_TablePress_Integration() )->restore_css( (array) ( $rb['before'] ?? array() ), (string) $rb['after_hash'], $force );
		}
		return $result;
	}
}
