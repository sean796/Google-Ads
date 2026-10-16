<?php
/**
 * Lesson guard (spec D10). Tutor's Lesson::save_lesson_meta() runs on every lesson save and deletes
 * the lesson's thumbnail and attachments whenever $_POST lacks them (spike item 9), so EMCP's own
 * generic tools (update-post, the Polylang copier, the page-text writer) would wipe them on a
 * lesson. While an EMCP tool runs (EMCP_Tools_Schema_Compat::executing(), released in a finally),
 * this snapshots both at priority 9 and puts back, at priority 11, whatever Tutor deleted that the
 * request did not carry. Outside EMCP calls Tutor behaves as it always does.
 *
 * @package EMCP_Tools
 * @since   3.19.0
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/** @since 3.19.0 */
final class EMCP_Tools_Tutor_Lesson_Guard {

	/** Meta key => the $_POST key that sets it on purpose. */
	const KEYS = array(
		'_thumbnail_id'      => 'thumbnail_id',
		'_tutor_attachments' => 'tutor_attachments',
	);

	/** @var array post id => meta key => value */
	private static $held = array();

	private static $booted = false;

	public static function boot(): void {
		if ( self::$booted ) {
			return;
		}
		self::$booted = true;
		$type         = function_exists( 'tutor' ) && isset( tutor()->lesson_post_type ) ? (string) tutor()->lesson_post_type : 'lesson';
		add_action( 'save_post_' . $type, array( __CLASS__, 'snapshot' ), 9 );
		add_action( 'save_post_' . $type, array( __CLASS__, 'restore' ), 11 );
	}

	/** @internal Test seam. */
	public static function reset_for_tests(): void {
		self::$booted = false;
		self::$held   = array();
	}

	private static function active(): bool {
		return class_exists( 'EMCP_Tools_Schema_Compat' ) && EMCP_Tools_Schema_Compat::executing();
	}

	/** @param int $post_id Lesson id. */
	public static function snapshot( $post_id ): void {
		$post_id = (int) $post_id;
		unset( self::$held[ $post_id ] );
		if ( ! self::active() ) {
			return;
		}
		foreach ( self::KEYS as $meta => $request ) {
			if ( array_key_exists( $request, $_POST ) ) { // phpcs:ignore WordPress.Security.NonceVerification
				continue; // The request sets it on purpose.
			}
			if ( metadata_exists( 'post', $post_id, $meta ) ) {
				self::$held[ $post_id ][ $meta ] = get_post_meta( $post_id, $meta, true );
			}
		}
	}

	/** @param int $post_id Lesson id. */
	public static function restore( $post_id ): void {
		$post_id = (int) $post_id;
		if ( empty( self::$held[ $post_id ] ) ) {
			return;
		}
		foreach ( self::$held[ $post_id ] as $meta => $value ) {
			if ( ! metadata_exists( 'post', $post_id, $meta ) ) {
				update_post_meta( $post_id, $meta, wp_slash( $value ) );
			}
		}
		unset( self::$held[ $post_id ] );
	}
}
