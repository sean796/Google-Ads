<?php
/**
 * SEOPress integration (Pro) — two dispatcher tools (seopress-read /
 * seopress-write) over SEOPress's `_seopress_*` post/term meta + options.
 *
 * Verified live against SEOPress 10.0.2:
 *  - Post & term SEO: individual `_seopress_*` meta (titles_title, titles_desc,
 *    robots_canonical, analysis_target_kw, social_fb_*, social_twitter_*).
 *    Robots: `_seopress_robots_index` = 'yes' means NOINDEX;
 *    `_seopress_robots_follow` = 'yes' means NOFOLLOW.
 *  - Schema: `_seopress_pro_schemas` + `_seopress_rich_snippets_type` meta.
 *  - Settings: the `seopress_titles_option_name` option (read-only view).
 *
 * @package EMCP_Tools
 * @since   3.5.0
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * @since 3.5.0
 */
class EMCP_Tools_SeoPress_Integration extends EMCP_Tools_SEO_Integration {

	/** @return string */
	public function id(): string {
		return 'seopress';
	}

	/** @return string */
	public function label(): string {
		return 'SEOPress';
	}

	/** @return bool */
	public function is_active(): bool {
		return defined( 'SEOPRESS_VERSION' );
	}

	/** Pro gate + plugin-active. */
	public function register(): void {
		if ( ! ( function_exists( 'emcp_tools_fs' ) && emcp_tools_fs()->can_use_premium_code() ) ) {
			return;
		}
		parent::register();
	}

	/** Unified field => meta key (post + term share these). */
	private function map(): array {
		return array(
			'title'               => '_seopress_titles_title',
			'description'         => '_seopress_titles_desc',
			'canonical'           => '_seopress_robots_canonical',
			'focus_keyword'       => '_seopress_analysis_target_kw',
			'og_title'            => '_seopress_social_fb_title',
			'og_description'      => '_seopress_social_fb_desc',
			'og_image'            => '_seopress_social_fb_img',
			'twitter_title'       => '_seopress_social_twitter_title',
			'twitter_description' => '_seopress_social_twitter_desc',
			'twitter_image'       => '_seopress_social_twitter_img',
		);
	}

	/** Meta keys a write may touch — snapshotted by the base for the ledger.
	 *  SEOPress uses the same `_seopress_*` meta for posts and terms. */
	protected function recordable_meta_keys( string $object ): array {
		return array_merge( array_values( $this->map() ), array( '_seopress_robots_index', '_seopress_robots_follow' ) );
	}

	/** @return array<string,array> */
	protected function operations(): array {
		$edit   = static function (): bool {
			return current_user_can( 'edit_posts' );
		};
		$manage = static function (): bool {
			return current_user_can( 'manage_options' );
		};

		return array(
			'get-post-seo'    => array( 'mode' => 'read', 'run' => array( $this, 'op_get_post_seo' ), 'perm' => $edit, 'desc' => 'Get a post\'s SEOPress metadata by { post_id }.' ),
			'get-term-seo'    => array( 'mode' => 'read', 'run' => array( $this, 'op_get_term_seo' ), 'perm' => $edit, 'desc' => 'Get a term\'s SEOPress metadata by { term_id }.' ),
			'get-schema'      => array( 'mode' => 'read', 'run' => array( $this, 'op_get_schema' ), 'perm' => $edit, 'desc' => 'Get a post\'s SEOPress schema (structured data) by { post_id }.' ),
			'get-settings'    => array( 'mode' => 'read', 'run' => array( $this, 'op_get_settings' ), 'perm' => $manage, 'desc' => 'Get SEOPress title/meta settings.' ),
			'update-post-seo' => array( 'mode' => 'write', 'run' => array( $this, 'op_update_post_seo' ), 'perm' => $edit, 'desc' => 'Update a post\'s SEOPress metadata: { post_id, title?, description?, canonical?, noindex?, nofollow?, focus_keyword?, og_*?, twitter_*? }.' ),
			'update-term-seo' => array( 'mode' => 'write', 'run' => array( $this, 'op_update_term_seo' ), 'perm' => $edit, 'desc' => 'Update a term\'s SEOPress metadata: { term_id, title?, description?, canonical?, noindex?, nofollow?, focus_keyword? }.' ),
		);
	}

	/**
	 * @param array $args { post_id }.
	 * @return array|WP_Error
	 */
	public function op_get_post_seo( array $args ) {
		$id = isset( $args['post_id'] ) ? absint( $args['post_id'] ) : 0;
		if ( ! $id || ! get_post( $id ) ) {
			return $this->err( $id, 'post_id', 'post' );
		}
		return array( 'post_id' => $id, 'seo' => $this->read_view( 'post', $id ) );
	}

	/**
	 * @param array $args { term_id }.
	 * @return array|WP_Error
	 */
	public function op_get_term_seo( array $args ) {
		$id   = isset( $args['term_id'] ) ? absint( $args['term_id'] ) : 0;
		$term = $id ? get_term( $id ) : null;
		if ( ! $id || ! $term || is_wp_error( $term ) ) {
			return $this->err( $id, 'term_id', 'term' );
		}
		return array( 'term_id' => $id, 'taxonomy' => $term->taxonomy, 'seo' => $this->read_view( 'term', $id ) );
	}

	/**
	 * @param array $args { post_id, ...fields }.
	 * @return array|WP_Error
	 */
	public function op_update_post_seo( array $args ) {
		$id = isset( $args['post_id'] ) ? absint( $args['post_id'] ) : 0;
		if ( ! $id || ! get_post( $id ) ) {
			return $this->err( $id, 'post_id', 'post' );
		}
		$this->apply( 'post', $id, $args );
		return array( 'updated' => true, 'post_id' => $id, 'seo' => $this->read_view( 'post', $id ) );
	}

	/**
	 * @param array $args { term_id, ...fields }.
	 * @return array|WP_Error
	 */
	public function op_update_term_seo( array $args ) {
		$id   = isset( $args['term_id'] ) ? absint( $args['term_id'] ) : 0;
		$term = $id ? get_term( $id ) : null;
		if ( ! $id || ! $term || is_wp_error( $term ) ) {
			return $this->err( $id, 'term_id', 'term' );
		}
		$this->apply( 'term', $id, $args );
		return array( 'updated' => true, 'term_id' => $id, 'seo' => $this->read_view( 'term', $id ) );
	}

	/**
	 * @param array $args { post_id }.
	 * @return array|WP_Error
	 */
	public function op_get_schema( array $args ) {
		$id = isset( $args['post_id'] ) ? absint( $args['post_id'] ) : 0;
		if ( ! $id || ! get_post( $id ) ) {
			return $this->err( $id, 'post_id', 'post' );
		}
		return array(
			'post_id' => $id,
			'schema'  => array(
				'pro_schemas'        => maybe_unserialize( get_post_meta( $id, '_seopress_pro_schemas', true ) ),
				'rich_snippets_type' => get_post_meta( $id, '_seopress_rich_snippets_type', true ),
			),
		);
	}

	/**
	 * @param array $args Unused.
	 * @return array
	 */
	public function op_get_settings( array $args ): array {
		$opt  = (array) get_option( 'seopress_titles_option_name', array() );
		$keys = array( 'seopress_titles_sep', 'seopress_titles_home_site_title', 'seopress_titles_home_site_desc' );
		$out  = array();
		foreach ( $keys as $k ) {
			if ( isset( $opt[ $k ] ) ) {
				$out[ $k ] = $opt[ $k ];
			}
		}
		return array( 'settings' => $out );
	}

	/**
	 * @param string $type 'post'|'term'.
	 * @param int    $id   Object id.
	 * @return array<string,mixed>
	 */
	private function read_view( string $type, int $id ): array {
		$get = 'post' === $type ? 'get_post_meta' : 'get_term_meta';
		$seo = array();
		foreach ( $this->map() as $field => $key ) {
			$seo[ $field ] = (string) $get( $id, $key, true );
		}
		$seo['noindex']  = 'yes' === (string) $get( $id, '_seopress_robots_index', true );
		$seo['nofollow'] = 'yes' === (string) $get( $id, '_seopress_robots_follow', true );
		return $seo;
	}

	/**
	 * @param string $type 'post'|'term'.
	 * @param int    $id   Object id.
	 * @param array  $args Arguments.
	 */
	private function apply( string $type, int $id, array $args ): void {
		$set = 'post' === $type ? 'update_post_meta' : 'update_term_meta';
		foreach ( $this->map() as $field => $key ) {
			if ( array_key_exists( $field, $args ) ) {
				$set( $id, $key, sanitize_text_field( (string) $args[ $field ] ) );
			}
		}
		if ( array_key_exists( 'noindex', $args ) ) {
			$set( $id, '_seopress_robots_index', ! empty( $args['noindex'] ) ? 'yes' : '' );
		}
		if ( array_key_exists( 'nofollow', $args ) ) {
			$set( $id, '_seopress_robots_follow', ! empty( $args['nofollow'] ) ? 'yes' : '' );
		}
	}

	/**
	 * @param int    $id    Id (0 = missing).
	 * @param string $field Argument name.
	 * @param string $what  Object type.
	 * @return WP_Error
	 */
	private function err( int $id, string $field, string $what ): WP_Error {
		if ( ! $id ) {
			return new WP_Error( 'missing_argument', sprintf( /* translators: %s: arg */ __( 'Missing required argument: %s.', 'emcp-tools' ), $field ), array( 'status' => 400 ) );
		}
		return new WP_Error( 'not_found', sprintf( /* translators: 1: type 2: id */ __( 'No %1$s with id %2$d.', 'emcp-tools' ), $what, $id ), array( 'status' => 404 ) );
	}
}
