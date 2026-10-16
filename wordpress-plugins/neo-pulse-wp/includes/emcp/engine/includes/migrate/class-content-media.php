<?php
/**
 * Content Sync — referenced media discovery.
 *
 * Finds every Media Library attachment a content item depends on, so a per-item
 * sync can carry its images and the page renders correctly on the live site:
 *   - the featured image;
 *   - images in classic/Gutenberg content (wp-image-<id>, [gallery ids], core
 *     image/gallery/cover/media-text block attrs);
 *   - images in Elementor data — classic `{id,url}` image controls and gallery
 *     arrays, and Elementor 4.0 atomic `{$$type:'image-attachment-id',value:N}`.
 *
 * The tree/HTML collectors are pure (no WP) so they're unit-testable; referenced()
 * validates the ids against the Media Library.
 *
 * @package EMCP_Tools
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class EMCP_Tools_Content_Media {

	/**
	 * Attachment ids a post depends on (featured + content + Elementor).
	 *
	 * @param int $post_id Post id.
	 * @return int[] Unique attachment ids that exist as image/file attachments.
	 */
	public static function referenced( int $post_id ): array {
		$ids = array();

		$thumb = (int) get_post_thumbnail_id( $post_id );
		if ( $thumb > 0 ) {
			$ids[ $thumb ] = true;
		}

		$post = get_post( $post_id );
		if ( $post ) {
			foreach ( self::collect_from_html( (string) $post->post_content ) as $id ) {
				$ids[ $id ] = true;
			}
		}

		$edata = get_post_meta( $post_id, '_elementor_data', true );
		if ( is_string( $edata ) && '' !== $edata ) {
			$tree = json_decode( $edata, true );
			if ( is_array( $tree ) ) {
				foreach ( self::collect_from_tree( $tree ) as $id ) {
					$ids[ $id ] = true;
				}
			}
		}

		$ids = array_keys( $ids );
		/** Let sites add ids (e.g. ACF image fields) or remove false positives. */
		$ids = (array) apply_filters( 'emcp_tools_sync_referenced_media', $ids, $post_id );

		// Keep only real attachments.
		$out = array();
		foreach ( $ids as $id ) {
			$id = (int) $id;
			if ( $id > 0 && 'attachment' === get_post_type( $id ) ) {
				$out[ $id ] = true;
			}
		}
		return array_map( 'intval', array_keys( $out ) );
	}

	/**
	 * Collect attachment ids from classic/Gutenberg HTML. Pure (no WP calls).
	 *
	 * @param string $html Post content.
	 * @return int[]
	 */
	public static function collect_from_html( string $html ): array {
		if ( '' === $html ) {
			return array();
		}
		$ids = array();

		if ( preg_match_all( '/wp-image-(\d+)/', $html, $m ) ) {
			foreach ( $m[1] as $id ) {
				$ids[ (int) $id ] = true;
			}
		}
		if ( preg_match_all( '/\[gallery[^\]]*ids=["\']([\d,\s]+)["\']/', $html, $m ) ) {
			foreach ( $m[1] as $list ) {
				foreach ( preg_split( '/[,\s]+/', $list ) as $id ) {
					if ( (int) $id > 0 ) {
						$ids[ (int) $id ] = true;
					}
				}
			}
		}
		if ( function_exists( 'parse_blocks' ) && false !== strpos( $html, '<!-- wp:' ) ) {
			self::from_blocks( parse_blocks( $html ), $ids );
		}

		return array_map( 'intval', array_keys( $ids ) );
	}

	/**
	 * @param array<int,array<string,mixed>> $blocks Parsed blocks.
	 * @param array<int,bool>                $ids    Accumulator (by ref).
	 */
	private static function from_blocks( array $blocks, array &$ids ): void {
		foreach ( $blocks as $b ) {
			$name  = isset( $b['blockName'] ) ? (string) $b['blockName'] : '';
			$attrs = isset( $b['attrs'] ) && is_array( $b['attrs'] ) ? $b['attrs'] : array();
			if ( isset( $attrs['id'] ) && is_numeric( $attrs['id'] )
				&& in_array( $name, array( 'core/image', 'core/cover', 'core/media-text' ), true ) ) {
				$ids[ (int) $attrs['id'] ] = true;
			}
			if ( 'core/gallery' === $name && isset( $attrs['ids'] ) && is_array( $attrs['ids'] ) ) {
				foreach ( $attrs['ids'] as $id ) {
					if ( is_numeric( $id ) ) {
						$ids[ (int) $id ] = true;
					}
				}
			}
			if ( ! empty( $b['innerBlocks'] ) && is_array( $b['innerBlocks'] ) ) {
				self::from_blocks( $b['innerBlocks'], $ids );
			}
		}
	}

	/**
	 * Collect attachment ids from a decoded Elementor `_elementor_data` tree.
	 * Pure (no WP calls).
	 *
	 * @param array $tree Decoded Elementor data.
	 * @return int[]
	 */
	public static function collect_from_tree( array $tree ): array {
		$ids = array();
		self::walk_tree( $tree, $ids );
		return array_map( 'intval', array_keys( $ids ) );
	}

	/**
	 * @param mixed           $node Node.
	 * @param array<int,bool> $ids  Accumulator (by ref).
	 */
	private static function walk_tree( $node, array &$ids ): void {
		if ( ! is_array( $node ) ) {
			return;
		}
		// Classic image/gallery control: { id: N, url: "..." }.
		if ( isset( $node['id'], $node['url'] ) && is_numeric( $node['id'] ) ) {
			$ids[ (int) $node['id'] ] = true;
		}
		// Atomic (Elementor 4.0): { $$type: '…image…|…attachment…', value: N }.
		if ( isset( $node['$$type'], $node['value'] ) && is_string( $node['$$type'] ) && is_numeric( $node['value'] )
			&& ( false !== strpos( $node['$$type'], 'attachment' ) || false !== strpos( $node['$$type'], 'image' ) ) ) {
			$ids[ (int) $node['value'] ] = true;
		}
		foreach ( $node as $v ) {
			if ( is_array( $v ) ) {
				self::walk_tree( $v, $ids );
			}
		}
	}
}
