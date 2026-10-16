<?php
/**
 * History for apply-page-text: rollback type `page-text`, restored through
 * EMCP_Tools_Page_Text_Writer (Elementor data through Elementor's save path, all or
 * nothing) and through the emcp_tools_page_text_around filter, like the apply itself.
 * Booted from the Pro loader's wire_runtime_hooks(), so the admin History screen,
 * its REST routes and WP-CLI can undo it.
 *
 * @package EMCP_Tools
 * @since   3.19.0
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/** @since 3.19.0 */
final class EMCP_Tools_Page_Text_History {

	const TYPE = 'page-text';

	public static function boot(): void {
		if ( ! has_filter( 'emcp_tools_change_apply_rollback', array( __CLASS__, 'filter_apply' ) ) ) {
			add_filter( 'emcp_tools_change_current_hash', array( __CLASS__, 'filter_hash' ), 10, 2 );
			add_filter( 'emcp_tools_change_apply_rollback', array( __CLASS__, 'filter_apply' ), 10, 3 );
		}
	}

	/** @return string Change id ('' when the ledger did not record it). */
	public static function record( int $post_id, array $before, string $page_after_hash, string $summary ): string {
		if ( ! class_exists( 'EMCP_Tools_Change_Log' ) ) {
			return '';
		}
		$rb = array(
			'type'       => self::TYPE,
			'post_id'    => $post_id,
			'after_hash' => $page_after_hash,
		);
		return EMCP_Tools_Change_Log::record(
			array(
				'domain'   => 'content',
				'action'   => 'apply-page-text',
				'target'   => 'post #' . $post_id,
				'summary'  => $summary,
				'rollback' => EMCP_Tools_Change_Recorder::attach_before( $rb, array( 'before' => $before ) ),
			)
		);
	}

	/** @internal */
	public static function filter_hash( $hash, $rb ) {
		if ( ! is_array( $rb ) || self::TYPE !== ( $rb['type'] ?? '' ) ) {
			return $hash;
		}
		self::ensure();
		return EMCP_Tools_Page_Text::hash( (int) ( $rb['post_id'] ?? 0 ) );
	}

	/** @internal */
	public static function filter_apply( $result, $rb, $force = false ) {
		if ( ! is_array( $rb ) || self::TYPE !== ( $rb['type'] ?? '' ) ) {
			return $result;
		}
		self::ensure();
		$post_id = (int) ( $rb['post_id'] ?? 0 );
		$before  = isset( $rb['before'] ) && is_array( $rb['before'] ) ? $rb['before'] : null;
		if ( $post_id <= 0 || null === $before ) {
			return new WP_Error( 'snapshot_missing', __( 'The recorded state for this change is missing.', 'emcp-tools' ) );
		}
		$keys  = array_merge( array_keys( (array) ( $before['fields'] ?? array() ) ), array_keys( (array) ( $before['meta'] ?? array() ) ), array_key_exists( 'elementor_data', $before ) ? array( '_elementor_data' ) : array() );
		$write = static function () use ( $post_id, $before, $rb, $force ) {
			return EMCP_Tools_Page_Text_Writer::commit( $post_id, $before, (string) ( $rb['after_hash'] ?? '' ), (bool) $force );
		};
		$done  = call_user_func( apply_filters( 'emcp_tools_page_text_around', $write, $post_id, $keys ) );
		return is_wp_error( $done ) ? $done : true;
	}

	/** The restore can run before the deferred MCP surface loads (an admin History request). */
	private static function ensure(): void {
		foreach ( array( 'EMCP_Tools_Page_Text_Elementor' => 'class-page-text-elementor.php', 'EMCP_Tools_Page_Text_Blocks' => 'class-page-text-blocks.php', 'EMCP_Tools_Page_Text' => 'class-page-text.php' ) as $class => $file ) {
			if ( ! class_exists( $class ) ) {
				require_once __DIR__ . '/' . $file;
			}
		}
	}
}
