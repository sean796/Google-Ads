<?php
/**
 * Content Sync — the per-item bundle.
 *
 * Packages one page/post/CPT into a portable, self-contained bundle the connector
 * can upsert on the live site: the post fields, all non-internal meta (incl.
 * `_elementor_data` and custom fields), taxonomy terms, and every referenced
 * media item (featured + content/Elementor images) with its file. Everything is
 * keyed by a stable sync UID so the connector matches items regardless of
 * slug/ID changes.
 *
 * build() returns the full bundle (media descriptors carry a source-only `_file`
 * absolute path used when streaming bytes); manifest() strips those for the JSON
 * that goes over the wire.
 *
 * @package EMCP_Tools
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class EMCP_Tools_Content_Bundle {

	const VERSION = 1;

	/**
	 * Build the bundle for a post.
	 *
	 * @param int $post_id Post id.
	 * @return array|WP_Error
	 */
	public static function build( int $post_id ) {
		$post = get_post( $post_id );
		if ( ! $post ) {
			return new WP_Error( 'emcp_bundle_no_post', __( 'Post not found.', 'emcp-tools' ) );
		}
		if ( ! class_exists( 'EMCP_Tools_Sync_Queue' ) ) {
			return new WP_Error( 'emcp_bundle_unavailable', __( 'Content sync is unavailable.', 'emcp-tools' ) );
		}

		$uid = EMCP_Tools_Sync_Queue::ensure_uid( $post_id );

		$post_data = array(
			'post_type'       => $post->post_type,
			'post_status'     => $post->post_status,
			'post_title'      => $post->post_title,
			'post_name'       => $post->post_name,
			'post_content'    => $post->post_content,
			'post_excerpt'    => $post->post_excerpt,
			'post_date_gmt'   => $post->post_date_gmt,
			'menu_order'      => (int) $post->menu_order,
			'comment_status'  => $post->comment_status,
			'ping_status'     => $post->ping_status,
			'post_mime_type'  => $post->post_mime_type,
		);

		// Preserve hierarchy by the parent's UID when the parent is itself syncable.
		$parent_uid = '';
		if ( $post->post_parent ) {
			$pu = get_post_meta( (int) $post->post_parent, EMCP_Tools_Sync_Queue::UID_META, true );
			$parent_uid = is_string( $pu ) ? $pu : '';
		}

		// All meta except internal/sync keys; unserialize so it JSON-encodes cleanly.
		$meta = array();
		foreach ( (array) get_post_meta( $post_id ) as $key => $vals ) {
			if ( in_array( $key, EMCP_Tools_Sync_Queue::INTERNAL_META, true ) ) {
				continue;
			}
			$meta[ $key ] = array_map( 'maybe_unserialize', (array) $vals );
		}

		// Terms, by slug, with a one-level parent slug for hierarchy.
		$terms = array();
		foreach ( get_object_taxonomies( $post->post_type ) as $tax ) {
			$objs = wp_get_object_terms( $post_id, $tax );
			if ( is_wp_error( $objs ) || empty( $objs ) ) {
				continue;
			}
			$list = array();
			foreach ( $objs as $t ) {
				$parent_slug = '';
				if ( $t->parent ) {
					$pt = get_term( $t->parent, $tax );
					if ( $pt && ! is_wp_error( $pt ) ) {
						$parent_slug = $pt->slug;
					}
				}
				$list[] = array( 'slug' => $t->slug, 'name' => $t->name, 'parent_slug' => $parent_slug );
			}
			$terms[ $tax ] = $list;
		}

		// Referenced media (featured + content + Elementor).
		$media   = array();
		$missing = array();
		foreach ( EMCP_Tools_Content_Media::referenced( $post_id ) as $aid ) {
			$desc = self::media_descriptor( (int) $aid );
			if ( null === $desc ) {
				$missing[] = (int) $aid;
				continue;
			}
			$media[] = $desc;
		}

		$featured_id  = (int) get_post_thumbnail_id( $post_id );
		$featured_uid = $featured_id ? EMCP_Tools_Sync_Queue::ensure_uid( $featured_id ) : '';

		return array(
			'version'        => self::VERSION,
			'uid'            => $uid,
			'source_url'     => untrailingslashit( site_url() ),
			'source_content' => untrailingslashit( content_url() ),
			'post'           => $post_data,
			'parent_uid'     => $parent_uid,
			'meta'           => $meta,
			'terms'          => $terms,
			'featured_uid'   => $featured_uid,
			'media'          => $media,
			'media_missing'  => $missing,
		);
	}

	/**
	 * A single media item's descriptor, or null if its file is gone.
	 *
	 * @param int $att_id Attachment id.
	 * @return array|null
	 */
	public static function media_descriptor( int $att_id ): ?array {
		$att = get_post( $att_id );
		if ( ! $att || 'attachment' !== $att->post_type ) {
			return null;
		}
		$file = get_attached_file( $att_id );
		if ( ! $file || ! is_file( $file ) ) {
			return null;
		}
		$uploads = wp_get_upload_dir();
		$rel     = ltrim( str_replace( wp_normalize_path( $uploads['basedir'] ), '', wp_normalize_path( $file ) ), '/' );

		return array(
			'uid'             => EMCP_Tools_Sync_Queue::ensure_uid( $att_id ),
			'source_id'       => $att_id,
			'filename'        => $rel, // relative to the uploads basedir (preserves year/month).
			'mime'            => $att->post_mime_type,
			'title'           => $att->post_title,
			'caption'         => $att->post_excerpt,
			'description'     => $att->post_content,
			'alt'             => (string) get_post_meta( $att_id, '_wp_attachment_image_alt', true ),
			'source_url'      => (string) wp_get_attachment_url( $att_id ),
			'filesize'        => (int) filesize( $file ),
			'_file'           => $file, // SOURCE-ONLY — stripped by manifest().
		);
	}

	/**
	 * The over-the-wire manifest: the bundle without source-only file paths.
	 *
	 * @param array $bundle Bundle from build().
	 * @return array
	 */
	public static function manifest( array $bundle ): array {
		if ( isset( $bundle['media'] ) && is_array( $bundle['media'] ) ) {
			$bundle['media'] = array_map(
				static function ( $m ) {
					unset( $m['_file'] );
					return $m;
				},
				$bundle['media']
			);
		}
		return $bundle;
	}
}
