<?php
/**
 * create-translation: a full copy of a post in another language, linked to the source's
 * translation group (spec 4.2.1). The caller runs create() inside the sync guard.
 *
 * @package EMCP_Tools
 * @since   3.19.0
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/** @since 3.19.0 */
final class EMCP_Tools_Polylang_Copier {

	/** Meta never copied: locks, edit traces, caches that rebuild themselves. */
	const DENY_META = array( '_edit_lock', '_edit_last', '_wp_old_slug', '_wp_old_date', '_elementor_css', '_elementor_element_cache', '_elementor_page_assets', '_encloseme', '_pingme' );

	/** Meta prefixes never copied: Polylang's own and EMCP's internal keys. */
	const DENY_PREFIXES = array( '_pll_', '_emcp_', '_wp_trash_meta_' );

	/** @var EMCP_Tools_Polylang_Api */
	private $api;

	public function __construct( EMCP_Tools_Polylang_Api $api ) {
		$this->api = $api;
	}

	public static function denied( string $key ): bool {
		if ( in_array( $key, self::DENY_META, true ) ) {
			return true;
		}
		foreach ( self::DENY_PREFIXES as $prefix ) {
			if ( 0 === strpos( $key, $prefix ) ) {
				return true;
			}
		}
		return false;
	}

	/**
	 * Everything the copy will be, without writing.
	 *
	 * @return array|WP_Error
	 */
	public function plan( int $post_id, string $lang, array $args ) {
		$source = get_post( $post_id );
		if ( ! $source ) {
			return new WP_Error( 'not_found', __( 'This post does not exist.', 'emcp-tools' ) );
		}
		if ( ! $this->api->is_translated_post_type( (string) $source->post_type ) ) {
			/* translators: %s: post type. */
			return new WP_Error( 'not_translatable', sprintf( __( 'Polylang does not translate the post type "%s". Turn it on with update-settings (post_types).', 'emcp-tools' ), $source->post_type ) );
		}
		$source_lang = $this->api->post_lang( $post_id );
		if ( '' === $source_lang ) {
			return new WP_Error( 'source_has_no_language', __( 'The source post has no language. Give it one with assign-language first.', 'emcp-tools' ) );
		}
		if ( ! in_array( $lang, array_column( $this->api->languages(), 'slug' ), true ) ) {
			/* translators: %s: language slug. */
			return new WP_Error( 'unknown_language', sprintf( __( 'There is no language "%s". get-setup lists the languages.', 'emcp-tools' ), $lang ) );
		}
		if ( $lang === $source_lang ) {
			return new WP_Error( 'same_language', __( 'The source post is already in that language.', 'emcp-tools' ) );
		}
		$existing = $this->api->post_translation( $post_id, $lang );
		if ( $existing ) {
			return new WP_Error( 'translation_exists', __( 'This post already has a translation in that language.', 'emcp-tools' ), array( 'post_id' => $existing ) );
		}

		$parent      = (int) $source->post_parent;
		$new_parent  = $parent ? $this->api->post_translation( $parent, $lang ) : 0;
		$parent_note = ( $parent && ! $new_parent ) ? __( 'The source\'s parent has no translation in this language, so the copy sits at the top level. Translate the parent, then set the parent here.', 'emcp-tools' ) : '';

		$meta    = array();
		$skipped = array();
		foreach ( (array) get_post_meta( $post_id ) as $key => $values ) {
			$key = (string) $key;
			if ( self::denied( $key ) ) {
				$skipped[] = $key;
				continue;
			}
			$meta[ $key ] = array_map( 'maybe_unserialize', (array) $values );
		}

		$terms        = array();
		$untranslated = array();
		foreach ( get_object_taxonomies( (string) $source->post_type ) as $tax ) {
			$tax = is_object( $tax ) ? (string) $tax->name : (string) $tax;
			if ( 'language' === $tax || 'post_translations' === $tax ) {
				continue;
			}
			// lang '' : Polylang otherwise filters term queries by the current language.
			$ids = wp_get_object_terms( $post_id, $tax, array( 'fields' => 'ids', 'lang' => '' ) );
			if ( ! is_array( $ids ) || ! $ids ) {
				continue;
			}
			if ( ! $this->api->is_translated_taxonomy( $tax ) ) {
				$terms[ $tax ] = array_map( 'intval', $ids );
				continue;
			}
			foreach ( $ids as $term_id ) {
				$tr = $this->api->term_translation( (int) $term_id, $lang );
				if ( $tr ) {
					$terms[ $tax ][] = $tr;
				} else {
					$term           = get_term( (int) $term_id, $tax );
					$untranslated[] = array( 'taxonomy' => $tax, 'term_id' => (int) $term_id, 'name' => ( $term && ! is_wp_error( $term ) ) ? (string) $term->name : '' );
				}
			}
			if ( ! isset( $terms[ $tax ] ) ) {
				$terms[ $tax ] = array();
			}
		}

		$thumb = isset( $meta['_thumbnail_id'][0] ) ? (int) $meta['_thumbnail_id'][0] : 0;
		if ( $thumb && ! empty( $this->api->options()['media_support'] ) ) {
			$tr = $this->api->post_translation( $thumb, $lang );
			if ( $tr ) {
				$meta['_thumbnail_id'] = array( (string) $tr );
			}
		}

		return array(
			'source'       => $source,
			'source_lang'  => $source_lang,
			'lang'         => $lang,
			'title'        => isset( $args['title'] ) ? (string) $args['title'] : (string) $source->post_title,
			'slug'         => isset( $args['slug'] ) ? (string) $args['slug'] : (string) $source->post_name . '-' . $lang,
			'status'       => (string) ( $args['status'] ?? 'draft' ),
			'parent'       => $new_parent,
			'parent_note'  => $parent_note,
			'meta'         => $meta,
			'skipped_meta' => $skipped,
			'terms'        => $terms,
			'untranslated' => $untranslated,
		);
	}

	/** The keys the copy writes, for the sync guard. */
	public static function keys( array $plan ): array {
		return array_merge( array_keys( $plan['meta'] ), array( 'post_title', 'post_content', 'post_excerpt' ) );
	}

	/**
	 * Write the copy. Run inside the sync guard.
	 *
	 * @return array|WP_Error
	 */
	public function create( array $plan ) {
		$source = $plan['source'];
		$id     = wp_insert_post(
			wp_slash(
				array(
					'post_type'      => (string) $source->post_type,
					'post_status'    => 'draft',
					'post_title'     => $plan['title'],
					'post_name'      => $plan['slug'],
					'post_content'   => (string) $source->post_content,
					'post_excerpt'   => (string) $source->post_excerpt,
					'post_password'  => (string) ( $source->post_password ?? '' ),
					'menu_order'     => (int) ( $source->menu_order ?? 0 ),
					'comment_status' => (string) ( $source->comment_status ?? 'closed' ),
					'ping_status'    => (string) ( $source->ping_status ?? 'closed' ),
					'post_author'    => (int) $source->post_author,
					'post_parent'    => (int) $plan['parent'],
				)
			),
			true
		);
		if ( is_wp_error( $id ) || ! $id ) {
			return is_wp_error( $id ) ? $id : new WP_Error( 'create_failed', __( 'The copy could not be created.', 'emcp-tools' ) );
		}
		$id = (int) $id;
		try {
			$this->api->set_post_lang( $id, $plan['lang'] );
			$elementor = null;
			foreach ( $plan['meta'] as $key => $values ) {
				if ( '_elementor_data' === $key ) {
					$elementor = $values[0] ?? null;
					continue;
				}
				foreach ( $values as $value ) {
					add_post_meta( $id, $key, wp_slash( $value ) );
				}
			}
			if ( null !== $elementor ) {
				$data  = is_array( $elementor ) ? $elementor : json_decode( (string) $elementor, true );
				$saved = is_array( $data ) ? EMCP_Tools_Page_Text_Writer::save_elementor_data( $id, $data ) : false;
				if ( true !== $saved ) {
					throw new RuntimeException( is_wp_error( $saved ) ? $saved->get_error_message() : __( 'The Elementor data could not be saved on the copy.', 'emcp-tools' ) );
				}
			}
			foreach ( $plan['terms'] as $tax => $ids ) {
				wp_set_object_terms( $id, array_map( 'intval', $ids ), $tax );
			}
			$group_before = $this->api->post_group( (int) $source->ID );
			$this->api->save_post_group( array_merge( $group_before, array( $plan['lang'] => $id ) ) );
			if ( 'draft' !== $plan['status'] ) {
				wp_update_post( array( 'ID' => $id, 'post_status' => $plan['status'] ) );
			}
		} catch ( Throwable $e ) {
			wp_delete_post( $id, true );
			return new WP_Error( 'create_failed', $e->getMessage() );
		}
		return array(
			'target_id'           => $id,
			'source_id'           => (int) $source->ID,
			'group_before'        => $group_before,
			'group_after'         => $this->api->post_group( (int) $source->ID ),
			'resource_after_hash' => EMCP_Tools_Change_Recorder::hash_created_resource( $id ),
		);
	}

	/**
	 * Reverse a create: only while the copy and the group are as the create left them.
	 *
	 * @return true|WP_Error
	 */
	public function remove( int $id, int $source_id, array $group_before, array $group_after, string $resource_after_hash, bool $force = false ) {
		if ( ! get_post( $id ) ) {
			return true;
		}
		if ( ! $force && ( ! hash_equals( $resource_after_hash, EMCP_Tools_Change_Recorder::hash_created_resource( $id ) ) || $this->api->post_group( $source_id ) != $group_after ) ) { // phpcs:ignore Universal.Operators.StrictComparisons -- key order differs.
			return new WP_Error( 'conflict', __( 'The copy or its translation group changed since it was created, so it is not deleted.', 'emcp-tools' ) );
		}
		$this->api->save_post_group( $group_before );
		return wp_delete_post( $id, true ) ? true : new WP_Error( 'rollback_failed', __( 'The copy could not be deleted.', 'emcp-tools' ) );
	}
}
