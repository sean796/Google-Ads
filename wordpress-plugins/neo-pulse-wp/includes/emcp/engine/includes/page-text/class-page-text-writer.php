<?php
/**
 * All-or-nothing writes of a page's text parts: Elementor data, post fields and meta.
 * Preflight first (hash, permission, Elementor's editor lock, data shape); then the
 * steps in the order where the step that can still refuse runs first; on any failure,
 * every attempted part (the failed one included, since a save can persist before it
 * fails) is re-read and put back, and the call says rolled_back only when the page's
 * hash is what it was before the call.
 *
 * @package EMCP_Tools
 * @since   3.19.0
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/** @since 3.19.0 */
final class EMCP_Tools_Page_Text_Writer {

	/** @var callable|null Test seam: ( int $post_id, array $data ): true|WP_Error|false. */
	private static $elementor_saver = null;

	public static function use_elementor_saver( ?callable $saver ): void {
		self::$elementor_saver = $saver;
	}

	/**
	 * @param int    $post_id       Post.
	 * @param array  $target        {elementor_data?: array, fields?: {post_title|post_excerpt|post_content: string}, meta?: {key: string|null}}.
	 * @param string $expected_hash Page-wide hash the caller read.
	 * @param bool   $force         Write even when the hash moved.
	 * @return array{page_after_hash:string,before:array}|WP_Error
	 */
	public static function commit( int $post_id, array $target, string $expected_hash, bool $force ) {
		$pre_call_hash = EMCP_Tools_Page_Text::hash( $post_id );
		if ( '' === $pre_call_hash ) {
			return new WP_Error( 'not_found', __( 'This post does not exist.', 'emcp-tools' ) );
		}
		if ( ! $force && ! hash_equals( $expected_hash, $pre_call_hash ) ) {
			return new WP_Error( 'conflict', __( 'The page changed since its text was read. Call get-page-text again, or pass force:true to write anyway.', 'emcp-tools' ), array( 'status' => 409, 'hash' => $pre_call_hash ) );
		}
		if ( ! current_user_can( 'edit_post', $post_id ) ) {
			return new WP_Error( 'forbidden', __( 'You are not allowed to edit this post.', 'emcp-tools' ), array( 'status' => 403 ) );
		}
		if ( array_key_exists( 'elementor_data', $target ) ) {
			if ( null !== $target['elementor_data'] && ! is_array( $target['elementor_data'] ) ) {
				return new WP_Error( 'invalid_elementor_data', __( 'The Elementor data is not a list of elements.', 'emcp-tools' ) );
			}
			if ( class_exists( 'EMCP_Tools_Elementor_Editor_Sync' ) ) {
				$locked = EMCP_Tools_Elementor_Editor_Sync::guard( $post_id );
				if ( $locked ) {
					return $locked;
				}
			}
		}

		$parts = self::parts( $target );
		$point = array();
		foreach ( $parts as $part ) {
			$point[ $part ] = self::read( $post_id, $part, $target );
		}
		$attempted = array();
		$failure   = null;
		foreach ( array( 'elementor_data', 'fields', 'meta' ) as $step ) {
			$step_parts = self::step_parts( $step, $parts );
			if ( ! $step_parts ) {
				continue;
			}
			$attempted = array_merge( $attempted, $step_parts );
			try {
				do_action( 'emcp_tools_page_text_writer_step', $step, $post_id );
				$result = self::write_step( $post_id, $step, $target );
				do_action( 'emcp_tools_page_text_writer_after_step', $step, $post_id );
			} catch ( Throwable $e ) {
				$result = new WP_Error( 'write_failed', $e->getMessage() );
			}
			if ( true !== $result ) {
				$failure = is_wp_error( $result ) ? $result : new WP_Error( 'write_failed', __( 'The save did not complete.', 'emcp-tools' ) );
				break;
			}
		}
		if ( null === $failure ) {
			self::forget( $post_id );
			return array(
				'page_after_hash' => EMCP_Tools_Page_Text::hash( $post_id ),
				'before'          => self::before_image( $point, $parts ),
			);
		}
		return self::recover( $post_id, $parts, $attempted, $point, $pre_call_hash, $failure );
	}

	/** @return string[] elementor_data, fields, meta:{key}. */
	private static function parts( array $target ): array {
		$parts = array();
		if ( array_key_exists( 'elementor_data', $target ) ) {
			$parts[] = 'elementor_data';
		}
		if ( ! empty( $target['fields'] ) ) {
			$parts[] = 'fields';
		}
		foreach ( array_keys( (array) ( $target['meta'] ?? array() ) ) as $key ) {
			$parts[] = 'meta:' . $key;
		}
		return $parts;
	}

	private static function step_parts( string $step, array $parts ): array {
		return array_values(
			array_filter(
				$parts,
				static function ( $part ) use ( $step ) {
					return 'meta' === $step ? 0 === strpos( $part, 'meta:' ) : $part === $step;
				}
			)
		);
	}

	private static function forget( int $post_id ): void {
		clean_post_cache( $post_id );
		wp_cache_delete( $post_id, 'post_meta' );
	}

	/** Current persisted value of one part, read fresh. */
	private static function read( int $post_id, string $part, array $target ) {
		self::forget( $post_id );
		if ( 'elementor_data' === $part ) {
			$raw = (string) get_post_meta( $post_id, '_elementor_data', true );
			if ( '' === $raw ) {
				return null;
			}
			$data = json_decode( $raw, true );
			return is_array( $data ) ? $data : $raw;
		}
		if ( 'fields' === $part ) {
			$post = get_post( $post_id );
			$out  = array();
			foreach ( array_keys( (array) $target['fields'] ) as $field ) {
				$out[ $field ] = $post ? (string) $post->$field : '';
			}
			return $out;
		}
		$key = substr( $part, 5 );
		return metadata_exists( 'post', $post_id, $key ) ? (string) get_post_meta( $post_id, $key, true ) : null;
	}

	/** @return true|WP_Error|false */
	private static function write_step( int $post_id, string $step, array $target ) {
		if ( 'elementor_data' === $step ) {
			return self::save_elementor( $post_id, $target['elementor_data'] );
		}
		if ( 'fields' === $step ) {
			return self::save_fields( $post_id, (array) $target['fields'] );
		}
		foreach ( (array) $target['meta'] as $key => $value ) {
			self::save_meta( $post_id, (string) $key, $value );
		}
		return true;
	}

	/** Elementor data through Elementor's own save path (the test seam replaces it). @return true|WP_Error|false */
	public static function save_elementor_data( int $post_id, array $data ) {
		return self::save_elementor( $post_id, $data );
	}

	/** @return true|WP_Error|false */
	private static function save_elementor( int $post_id, $data ) {
		if ( null === $data ) {
			delete_post_meta( $post_id, '_elementor_data' );
			return true;
		}
		if ( ! is_array( $data ) ) {
			update_post_meta( $post_id, '_elementor_data', wp_slash( (string) $data ) );
			return true;
		}
		if ( self::$elementor_saver ) {
			return call_user_func( self::$elementor_saver, $post_id, $data );
		}
		return ( new EMCP_Tools_Data() )->save_page_data( $post_id, $data );
	}

	/** @return true|WP_Error */
	private static function save_fields( int $post_id, array $fields ) {
		$result = wp_update_post( array_merge( array( 'ID' => $post_id ), wp_slash( $fields ) ), true );
		if ( is_wp_error( $result ) ) {
			return $result;
		}
		return $result ? true : new WP_Error( 'write_failed', __( 'The post could not be updated.', 'emcp-tools' ) );
	}

	private static function save_meta( int $post_id, string $key, $value ): void {
		if ( null === $value ) {
			delete_post_meta( $post_id, $key );
			return;
		}
		update_post_meta( $post_id, $key, wp_slash( (string) $value ) );
	}

	/** Put one part back to its rollback-point value. */
	private static function put_back( int $post_id, string $part, $value ) {
		if ( 'elementor_data' === $part ) {
			return self::save_elementor( $post_id, $value );
		}
		if ( 'fields' === $part ) {
			return self::save_fields( $post_id, (array) $value );
		}
		self::save_meta( $post_id, substr( $part, 5 ), $value );
		return true;
	}

	/** @return WP_Error */
	private static function recover( int $post_id, array $parts, array $attempted, array $point, string $pre_call_hash, WP_Error $failure ) {
		$restored = array();
		$target   = array( 'fields' => is_array( $point['fields'] ?? null ) ? $point['fields'] : array() );
		foreach ( array_reverse( $attempted ) as $part ) {
			if ( self::read( $post_id, $part, $target ) === $point[ $part ] ) {
				continue;
			}
			try {
				$ok = self::put_back( $post_id, $part, $point[ $part ] );
			} catch ( Throwable $e ) {
				$ok = false;
			}
			$restored[ $part ] = true === $ok;
		}
		self::forget( $post_id );
		$hash = EMCP_Tools_Page_Text::hash( $post_id );
		if ( hash_equals( $pre_call_hash, $hash ) ) {
			return new WP_Error( $failure->get_error_code(), $failure->get_error_message(), array( 'rolled_back' => true ) );
		}
		$states = array();
		foreach ( $parts as $part ) {
			$same            = self::read( $post_id, $part, $target ) === $point[ $part ];
			$states[ $part ] = $same ? ( isset( $restored[ $part ] ) ? 'restored' : 'unchanged' ) : 'changed';
		}
		return new WP_Error(
			'partial_write',
			/* translators: %s: the original error. */
			sprintf( __( 'The write failed (%s) and could not be fully put back. The parts list says what the page holds now.', 'emcp-tools' ), $failure->get_error_message() ),
			array( 'parts' => $states, 'hash' => $hash, 'cause' => $failure->get_error_code() )
		);
	}

	/** The rollback point in the shape the page-text History type restores. */
	private static function before_image( array $point, array $parts ): array {
		$out = array();
		foreach ( $parts as $part ) {
			if ( 'elementor_data' === $part ) {
				$out['elementor_data'] = $point[ $part ];
			} elseif ( 'fields' === $part ) {
				$out['fields'] = $point[ $part ];
			} else {
				$out['meta'][ substr( $part, 5 ) ] = $point[ $part ];
			}
		}
		return $out;
	}
}
