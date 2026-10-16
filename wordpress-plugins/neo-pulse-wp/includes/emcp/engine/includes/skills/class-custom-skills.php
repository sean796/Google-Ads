<?php
/**
 * Custom skills (Pro): playbooks a site owner writes on Skills > Custom
 * skills. Each is a private `emcp_skill` post (title = name, post_name =
 * slug, excerpt = description, content = the Markdown body); published means
 * injected, draft means kept but switched off. Enabled skills join the
 * bundled catalog through `emcp_tools_skill_sources`, so the discovery
 * context, list-skills, get-skill and AI Chat all see them with no other
 * change. A custom skill can never take a bundled skill's slug.
 *
 * @package EMCP_Tools
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

final class EMCP_Tools_Custom_Skills {

	const POST_TYPE       = 'emcp_skill';
	const MAX_NAME        = 80;
	const MAX_DESCRIPTION = 1024;
	const MAX_BODY        = 60000;

	/** Set while reading the catalog without our own entries (no recursion). */
	private static $bare = false;

	/** Register the post type and join the catalog (Pro loader, runtime). */
	public static function init(): void {
		if ( did_action( 'init' ) ) {
			self::register_post_type();
		} else {
			add_action( 'init', array( __CLASS__, 'register_post_type' ) );
		}
		add_filter( 'emcp_tools_skill_sources', array( __CLASS__, 'sources' ), 20 );
	}

	/** Private: no admin UI, no front end, no REST; the Custom skills screen edits it. */
	public static function register_post_type(): void {
		if ( ! function_exists( 'register_post_type' ) || post_type_exists( self::POST_TYPE ) ) {
			return;
		}
		register_post_type(
			self::POST_TYPE,
			array(
				'label'        => __( 'Custom skills', 'emcp-tools' ),
				'public'       => false,
				'show_ui'      => false,
				'show_in_rest' => false,
				'rewrite'      => false,
				'query_var'    => false,
				'supports'     => array( 'title', 'editor', 'excerpt', 'revisions' ),
			)
		);
	}

	/**
	 * Append the enabled custom skills to the catalog. A slug the list already
	 * holds (a bundled skill shipped later) keeps the bundled one.
	 *
	 * @param array $skills Catalog entries.
	 * @return array
	 */
	public static function sources( $skills ): array {
		$skills = (array) $skills;
		if ( self::$bare ) {
			return $skills;
		}
		$taken = array_flip( array_column( $skills, 'slug' ) );
		foreach ( self::posts() as $p ) {
			if ( 'publish' !== $p->post_status || isset( $taken[ $p->post_name ] ) ) {
				continue;
			}
			$skills[]                 = array(
				'slug'        => (string) $p->post_name,
				'name'        => (string) $p->post_title,
				'description' => (string) $p->post_excerpt,
				'body'        => (string) $p->post_content,
				'source'      => 'custom',
			);
			$taken[ $p->post_name ] = true;
		}
		return $skills;
	}

	/**
	 * Every custom skill, newest first: the list the screen shows.
	 *
	 * @return array<int,array>
	 */
	public static function items(): array {
		$posts = self::posts();
		usort(
			$posts,
			static function ( $a, $b ) {
				return strcmp( (string) ( $b->post_modified ?? '' ), (string) ( $a->post_modified ?? '' ) ) ?: ( (int) $b->ID <=> (int) $a->ID );
			}
		);
		return array_map( array( __CLASS__, 'row' ), $posts );
	}

	/**
	 * One skill with its body, or null.
	 *
	 * @param int $id Post id.
	 * @return array|null
	 */
	public static function find( int $id ): ?array {
		$p = self::post( $id );
		return $p ? array_merge( self::row( $p ), array( 'body' => (string) $p->post_content ) ) : null;
	}

	/**
	 * Create ( $id 0 ) or update a skill.
	 *
	 * @param array $in { name, slug, description, body, enabled }.
	 * @param int   $id Post id, 0 for a new skill.
	 * @return int|WP_Error Post id.
	 */
	public static function save( array $in, int $id = 0 ) {
		if ( $id && ! self::post( $id ) ) {
			return self::error( 'skill_not_found', __( 'That skill no longer exists.', 'emcp-tools' ), 404 );
		}
		$name        = trim( wp_strip_all_tags( (string) ( $in['name'] ?? '' ) ) );
		$description = trim( (string) preg_replace( '/\s+/', ' ', wp_strip_all_tags( (string) ( $in['description'] ?? '' ) ) ) );
		$body        = trim( str_replace( "\r\n", "\n", (string) ( $in['body'] ?? '' ) ) );
		$slug        = self::slugify( '' !== trim( (string) ( $in['slug'] ?? '' ) ) ? (string) $in['slug'] : $name );
		$raw_slug    = trim( (string) ( $in['slug'] ?? '' ) );

		if ( '' === $name ) {
			return self::error( 'skill_name_required', __( 'Give the skill a name.', 'emcp-tools' ) );
		}
		if ( mb_strlen( $name ) > self::MAX_NAME ) {
			return self::error( 'skill_name_too_long', __( 'Keep the name under 80 characters.', 'emcp-tools' ) );
		}
		if ( '' !== $raw_slug && $raw_slug !== $slug ) {
			return self::error( 'skill_slug_invalid', __( 'Use 3 to 60 lowercase letters, numbers and hyphens for the slug.', 'emcp-tools' ) );
		}
		if ( ! preg_match( '/^[a-z0-9](?:[a-z0-9-]{1,58})[a-z0-9]$/', $slug ) ) {
			return self::error( 'skill_slug_invalid', __( 'Use 3 to 60 lowercase letters, numbers and hyphens for the slug.', 'emcp-tools' ) );
		}
		if ( self::slug_taken( $slug, $id ) ) {
			return self::error( 'skill_slug_taken', __( 'Another skill already uses that slug.', 'emcp-tools' ), 409 );
		}
		if ( '' === $description ) {
			return self::error( 'skill_description_required', __( 'Describe when agents should use the skill; they decide from this line.', 'emcp-tools' ) );
		}
		if ( mb_strlen( $description ) > self::MAX_DESCRIPTION ) {
			return self::error( 'skill_description_too_long', __( 'Keep the description under 1,024 characters.', 'emcp-tools' ) );
		}
		if ( '' === $body ) {
			return self::error( 'skill_body_required', __( 'Write the instructions agents follow when they load the skill.', 'emcp-tools' ) );
		}
		if ( mb_strlen( $body ) > self::MAX_BODY ) {
			return self::error( 'skill_body_too_long', __( 'Keep the instructions under 60,000 characters.', 'emcp-tools' ) );
		}

		$post = array(
			'post_type'    => self::POST_TYPE,
			'post_title'   => $name,
			'post_name'    => $slug,
			'post_excerpt' => $description,
			// wp_insert_post() unslashes its input.
			'post_content' => wp_slash( $body ),
			'post_status'  => ! empty( $in['enabled'] ) ? 'publish' : 'draft',
		);
		if ( $id ) {
			$post['ID'] = $id;
			$result     = wp_update_post( $post, true );
		} else {
			$result = wp_insert_post( $post, true );
		}
		if ( is_wp_error( $result ) || ! $result ) {
			return self::error( 'skill_not_saved', __( 'The skill could not be saved.', 'emcp-tools' ), 500 );
		}
		return (int) $result;
	}

	/**
	 * Delete a skill for good.
	 *
	 * @param int $id Post id.
	 * @return true|WP_Error
	 */
	public static function delete( int $id ) {
		if ( ! self::post( $id ) ) {
			return self::error( 'skill_not_found', __( 'That skill no longer exists.', 'emcp-tools' ), 404 );
		}
		wp_delete_post( $id, true );
		return true;
	}

	/** Lowercase letters, numbers and single hyphens. */
	public static function slugify( string $text ): string {
		$slug = strtolower( function_exists( 'remove_accents' ) ? remove_accents( $text ) : $text );
		$slug = (string) preg_replace( '/[^a-z0-9]+/', '-', $slug );
		return substr( trim( $slug, '-' ), 0, 60 );
	}

	/** Slugs of every other catalog source (bundled and other filters). */
	private static function catalog_slugs(): array {
		if ( ! class_exists( 'EMCP_Tools_Skill_Catalog' ) ) {
			return array();
		}
		self::$bare = true;
		try {
			return array_column( EMCP_Tools_Skill_Catalog::all(), 'slug' );
		} finally {
			self::$bare = false;
		}
	}

	private static function slug_taken( string $slug, int $id ): bool {
		if ( in_array( $slug, self::catalog_slugs(), true ) ) {
			return true;
		}
		foreach ( self::posts() as $p ) {
			if ( (int) $p->ID !== $id && $slug === (string) $p->post_name ) {
				return true;
			}
		}
		return false;
	}

	/** Every emcp_skill post, filtered here too (not every get_posts honours its args). */
	private static function posts(): array {
		$posts = get_posts(
			array(
				'post_type'        => self::POST_TYPE,
				'post_status'      => array( 'publish', 'draft' ),
				'numberposts'      => 500,
				'orderby'          => 'modified',
				'order'            => 'DESC',
				'suppress_filters' => true,
			)
		);
		return array_values(
			array_filter(
				(array) $posts,
				static function ( $p ) {
					return is_object( $p ) && self::POST_TYPE === ( $p->post_type ?? '' ) && in_array( $p->post_status ?? '', array( 'publish', 'draft' ), true );
				}
			)
		);
	}

	private static function post( int $id ) {
		$p = $id > 0 ? get_post( $id ) : null;
		return ( $p && self::POST_TYPE === ( $p->post_type ?? '' ) && in_array( $p->post_status ?? '', array( 'publish', 'draft' ), true ) ) ? $p : null;
	}

	private static function row( $p ): array {
		$body = (string) $p->post_content;
		return array(
			'id'          => (int) $p->ID,
			'name'        => (string) $p->post_title,
			'slug'        => (string) $p->post_name,
			'description' => (string) $p->post_excerpt,
			'enabled'     => 'publish' === $p->post_status,
			'chars'       => mb_strlen( $body ),
			'tokens'      => (int) ceil( strlen( $body ) / 4 ),
			'modified'    => (string) ( $p->post_modified_gmt ?? $p->post_modified ?? '' ),
		);
	}

	private static function error( string $code, string $message, int $status = 400 ): WP_Error {
		return new WP_Error( $code, $message, array( 'status' => $status ) );
	}
}
