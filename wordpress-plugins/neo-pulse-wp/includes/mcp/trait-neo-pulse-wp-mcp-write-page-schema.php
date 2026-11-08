<?php
/**
 * Page FAQ, video, and schema write operations.
 *
 * @package Neo_Pulse_Wp
 */

defined( 'ABSPATH' ) || exit;

trait Neo_Pulse_Wp_Mcp_Write_Trait_Page_Schema {

	/**
	 * `set-page-faqs`: replace or clear `neo_pulse_seo_schema_FAQPage` on a post.
	 *
	 * @param array<string,mixed> $args Arguments.
	 * @return array<string,mixed>|WP_Error
	 */
	private static function set_page_faqs( array $args ) {
		$post = Neo_Pulse_Wp_Mcp_Read::resolve_post( $args );
		if ( is_wp_error( $post ) ) {
			return $post;
		}
		if ( ! current_user_can( 'edit_post', $post->ID ) ) {
			return new WP_Error( 'forbidden', 'You do not have permission to edit this post.', array( 'status' => 403 ) );
		}
		if ( ! isset( $args['faqs'] ) || ! is_array( $args['faqs'] ) ) {
			return new WP_Error( 'invalid_argument', 'faqs array is required (pass an empty array to clear).', array( 'status' => 400 ) );
		}

		$cur_ver = Neo_Pulse_Wp_Mcp_Read::page_version_hash( (int) $post->ID );
		if ( ! empty( $args['expected_version'] ) && (string) $args['expected_version'] !== $cur_ver ) {
			return new WP_Error(
				'conflict',
				sprintf( 'Page schema meta changed since version %s (current version is %s).', (string) $args['expected_version'], $cur_ver ),
				array( 'status' => 409, 'current_version' => $cur_ver )
			);
		}

		$entities = array();
		foreach ( $args['faqs'] as $row ) {
			if ( ! is_array( $row ) ) {
				continue;
			}
			$q = trim( wp_strip_all_tags( (string) ( $row['question'] ?? $row['q'] ?? '' ) ) );
			$a = trim( wp_kses_post( (string) ( $row['answer'] ?? $row['a'] ?? '' ) ) );
			if ( '' === $q || '' === $a ) {
				return new WP_Error( 'invalid_argument', 'Each FAQ item must have a non-empty question and answer.', array( 'status' => 400 ) );
			}
			$entities[] = array(
				'@type'          => 'Question',
				'name'           => $q,
				'acceptedAnswer' => array(
					'@type' => 'Answer',
					'text'  => $a,
				),
			);
		}

		$before_val = get_post_meta( $post->ID, 'neo_pulse_seo_schema_FAQPage', true );
		$after_val  = array() === $entities
			? null
			: array(
				'@type'      => 'FAQPage',
				'metadata'   => array(
					'title'     => 'FAQ',
					'type'      => 'template',
					'isPrimary' => false,
				),
				'mainEntity' => $entities,
			);

		if ( ! empty( $args['dry_run'] ) ) {
			return array(
				'dry_run'      => true,
				'post_id'      => (int) $post->ID,
				'would_change' => $before_val !== $after_val,
				'before'       => '' === $before_val ? null : $before_val,
				'after'        => $after_val,
				'version'      => $cur_ver,
			);
		}

		$history_id = Neo_Pulse_Wp_Mcp_History::record(
			'set-page-faqs',
			sprintf( 'Updated FAQ schema on post #%d (%s)', (int) $post->ID, get_the_title( $post ) ),
			array(
				'kind'    => 'post_meta',
				'post_id' => (int) $post->ID,
				'meta'    => array( 'neo_pulse_seo_schema_FAQPage' => $before_val ),
			)
		);

		if ( null === $after_val ) {
			delete_post_meta( $post->ID, 'neo_pulse_seo_schema_FAQPage' );
		} else {
			update_post_meta( $post->ID, 'neo_pulse_seo_schema_FAQPage', $after_val );
		}

		if ( Neo_Pulse_Wp_Seo_Settings::output_active() && class_exists( 'Neo_Pulse_Wp_Cache_Flush' ) ) {
			Neo_Pulse_Wp_Cache_Flush::purge_html_caches();
		}

		$read_back = Neo_Pulse_Wp_Mcp_Read::get_page_schema( array( 'post_id' => (int) $post->ID ) );

		return array(
			'ok'         => true,
			'history_id' => $history_id,
			'version'    => is_array( $read_back ) ? ( $read_back['version'] ?? '' ) : '',
			'data'       => $read_back,
		);
	}

	/**
	 * `clear-page-video-schemas`: delete all `neo_pulse_seo_schema_VideoObject` post meta on a post.
	 *
	 * @param array<string,mixed> $args Arguments.
	 * @return array<string,mixed>|WP_Error
	 */
	private static function clear_page_video_schemas( array $args ) {
		$post = Neo_Pulse_Wp_Mcp_Read::resolve_post( $args );
		if ( is_wp_error( $post ) ) {
			return $post;
		}
		if ( ! current_user_can( 'edit_post', $post->ID ) ) {
			return new WP_Error( 'forbidden', 'You do not have permission to edit this post.', array( 'status' => 403 ) );
		}

		$cur_ver = Neo_Pulse_Wp_Mcp_Read::page_version_hash( (int) $post->ID );
		if ( ! empty( $args['expected_version'] ) && (string) $args['expected_version'] !== $cur_ver ) {
			return new WP_Error(
				'conflict',
				sprintf( 'Page schema meta changed since version %s (current version is %s).', (string) $args['expected_version'], $cur_ver ),
				array( 'status' => 409, 'current_version' => $cur_ver )
			);
		}

		$meta_key = class_exists( 'Neo_Pulse_Wp_Seo_Video', false )
			? Neo_Pulse_Wp_Seo_Video::META
			: 'neo_pulse_seo_schema_VideoObject';
		$before   = get_post_meta( $post->ID, $meta_key, false );
		if ( ! is_array( $before ) ) {
			$before = array();
		}

		if ( ! empty( $args['dry_run'] ) ) {
			return array(
				'dry_run'      => true,
				'post_id'      => (int) $post->ID,
				'would_change' => count( $before ) > 0,
				'before_count' => count( $before ),
				'version'      => $cur_ver,
			);
		}

		$history_id = Neo_Pulse_Wp_Mcp_History::record(
			'clear-page-video-schemas',
			sprintf( 'Cleared VideoObject schema on post #%d (%s)', (int) $post->ID, get_the_title( $post ) ),
			array(
				'kind'    => 'post_meta',
				'post_id' => (int) $post->ID,
				'meta'    => array( $meta_key => $before ),
			)
		);

		delete_post_meta( $post->ID, $meta_key );

		if ( Neo_Pulse_Wp_Seo_Settings::output_active() && class_exists( 'Neo_Pulse_Wp_Cache_Flush' ) ) {
			Neo_Pulse_Wp_Cache_Flush::purge_html_caches();
		}

		$read_back = Neo_Pulse_Wp_Mcp_Read::get_page_schema( array( 'post_id' => (int) $post->ID ) );

		return array(
			'ok'           => true,
			'history_id'   => $history_id,
			'removed_count'=> count( $before ),
			'version'      => is_array( $read_back ) ? ( $read_back['version'] ?? '' ) : '',
			'data'         => $read_back,
		);
	}

	/**
	 * `set-page-schema`: set per-page schema type (`off`, `default`, `WebPage`, `Article`, `BlogPosting`, `NewsArticle`).
	 *
	 * @param array<string,mixed> $args Arguments.
	 * @return array<string,mixed>|WP_Error
	 */
	private static function set_page_schema( array $args ) {
		$post = Neo_Pulse_Wp_Mcp_Read::resolve_post( $args );
		if ( is_wp_error( $post ) ) {
			return $post;
		}
		if ( ! current_user_can( 'edit_post', $post->ID ) ) {
			return new WP_Error( 'forbidden', 'You do not have permission to edit this post.', array( 'status' => 403 ) );
		}

		$type    = isset( $args['type'] ) ? trim( (string) $args['type'] ) : '';
		$allowed = array( 'off', 'default', 'WebPage', 'Article', 'BlogPosting', 'NewsArticle' );
		if ( ! in_array( $type, $allowed, true ) ) {
			return new WP_Error( 'invalid_argument', 'type must be one of: off, default, WebPage, Article, BlogPosting, NewsArticle.', array( 'status' => 400 ) );
		}

		$cur_ver = Neo_Pulse_Wp_Mcp_Read::page_version_hash( (int) $post->ID );
		if ( ! empty( $args['expected_version'] ) && (string) $args['expected_version'] !== $cur_ver ) {
			return new WP_Error(
				'conflict',
				sprintf( 'Page schema meta changed since version %s (current version is %s).', (string) $args['expected_version'], $cur_ver ),
				array( 'status' => 409, 'current_version' => $cur_ver )
			);
		}

		$before_meta = array(
			'neo_pulse_seo_rich_snippet'   => get_post_meta( $post->ID, 'neo_pulse_seo_rich_snippet', true ),
			'neo_pulse_seo_schema_Article' => get_post_meta( $post->ID, 'neo_pulse_seo_schema_Article', true ),
		);

		$after_meta = array(
			'neo_pulse_seo_rich_snippet'   => '',
			'neo_pulse_seo_schema_Article' => '',
		);
		if ( 'off' === $type || 'WebPage' === $type ) {
			$after_meta['neo_pulse_seo_rich_snippet'] = 'off';
		} elseif ( in_array( $type, array( 'Article', 'BlogPosting', 'NewsArticle' ), true ) ) {
			$after_meta['neo_pulse_seo_rich_snippet']   = 'article';
			$after_meta['neo_pulse_seo_schema_Article'] = array(
				'@type'          => $type,
				'metadata'       => array(
					'title'     => 'Article',
					'type'      => 'template',
					'isPrimary' => true,
				),
				'headline'       => '%seo_title%',
				'datePublished'  => '%date(Y-m-dTH:i:sP)%',
				'dateModified'   => '%modified(Y-m-dTH:i:sP)%',
				'author'         => array(
					'@type' => 'Person',
					'name'  => '%name%',
				),
				'description'    => '%seo_description%',
			);
		}

		if ( ! empty( $args['dry_run'] ) ) {
			return array(
				'dry_run'      => true,
				'post_id'      => (int) $post->ID,
				'would_change' => $before_meta !== $after_meta,
				'before'       => $before_meta,
				'after'        => $after_meta,
				'version'      => $cur_ver,
			);
		}

		$history_id = Neo_Pulse_Wp_Mcp_History::record(
			'set-page-schema',
			sprintf( 'Set page schema to %s on post #%d (%s)', $type, (int) $post->ID, get_the_title( $post ) ),
			array(
				'kind'    => 'post_meta',
				'post_id' => (int) $post->ID,
				'meta'    => $before_meta,
			)
		);

		foreach ( $after_meta as $mk => $mv ) {
			if ( '' === $mv || null === $mv ) {
				delete_post_meta( $post->ID, $mk );
			} else {
				update_post_meta( $post->ID, $mk, $mv );
			}
		}

		if ( Neo_Pulse_Wp_Seo_Settings::output_active() && class_exists( 'Neo_Pulse_Wp_Cache_Flush' ) ) {
			Neo_Pulse_Wp_Cache_Flush::purge_html_caches();
		}

		$read_back = Neo_Pulse_Wp_Mcp_Read::get_page_schema( array( 'post_id' => (int) $post->ID ) );

		return array(
			'ok'         => true,
			'history_id' => $history_id,
			'version'    => is_array( $read_back ) ? ( $read_back['version'] ?? '' ) : '',
			'data'       => $read_back,
		);
	}
}
