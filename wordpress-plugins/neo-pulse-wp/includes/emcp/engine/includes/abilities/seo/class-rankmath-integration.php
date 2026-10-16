<?php
/**
 * Rank Math integration (Pro) — two dispatcher tools (rankmath-read /
 * rankmath-write) over Rank Math's post/term meta + options.
 *
 * Verified live against Rank Math 1.0.274.1:
 *  - Post & term SEO: individual `rank_math_*` meta (title, description,
 *    canonical_url, focus_keyword, facebook_*, twitter_*). Robots is the
 *    `rank_math_robots` ARRAY (contains 'noindex'/'nofollow' when set).
 *  - Schema: `rank_math_schema_*` post meta (get-schema reads them).
 *  - Settings: the `rank-math-options-titles` option (read-only view).
 *
 * Redirects (the rank_math_redirections table) require Rank Math's Redirections
 * module to be enabled; deferred to a future release.
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
class EMCP_Tools_RankMath_Integration extends EMCP_Tools_SEO_Integration {

	/** @return string */
	public function id(): string {
		return 'rankmath';
	}

	/** @return string */
	public function label(): string {
		return 'Rank Math';
	}

	/** @return bool */
	public function is_active(): bool {
		return class_exists( 'RankMath' ) || defined( 'RANK_MATH_VERSION' );
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
			'title'               => 'rank_math_title',
			'description'         => 'rank_math_description',
			'canonical'           => 'rank_math_canonical_url',
			'focus_keyword'       => 'rank_math_focus_keyword',
			'og_title'            => 'rank_math_facebook_title',
			'og_description'      => 'rank_math_facebook_description',
			'og_image'            => 'rank_math_facebook_image',
			'twitter_title'       => 'rank_math_twitter_title',
			'twitter_description' => 'rank_math_twitter_description',
			'twitter_image'       => 'rank_math_twitter_image',
		);
	}

	/** Meta keys a write may touch — snapshotted by the base for the ledger.
	 *  Rank Math uses the same `rank_math_*` meta for posts and terms. */
	protected function recordable_meta_keys( string $object ): array {
		return array_merge( array_values( $this->map() ), array( 'rank_math_robots' ) );
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
			'get-post-seo'    => array( 'mode' => 'read', 'run' => array( $this, 'op_get_post_seo' ), 'perm' => $edit, 'desc' => 'Get a post\'s Rank Math SEO metadata by { post_id }.' ),
			'get-term-seo'    => array( 'mode' => 'read', 'run' => array( $this, 'op_get_term_seo' ), 'perm' => $edit, 'desc' => 'Get a term\'s Rank Math SEO metadata by { term_id }.' ),
			'get-schema'      => array( 'mode' => 'read', 'run' => array( $this, 'op_get_schema' ), 'perm' => $edit, 'desc' => 'Get a post\'s Rank Math schema (structured data) by { post_id }.' ),
			'get-settings'    => array( 'mode' => 'read', 'run' => array( $this, 'op_get_settings' ), 'perm' => $manage, 'desc' => 'Get Rank Math title/meta settings.' ),
			'update-post-seo' => array( 'mode' => 'write', 'run' => array( $this, 'op_update_post_seo' ), 'perm' => $edit, 'desc' => 'Update a post\'s Rank Math SEO metadata: { post_id, title?, description?, canonical?, noindex?, nofollow?, focus_keyword?, og_*?, twitter_*? }.' ),
			'update-term-seo' => array( 'mode' => 'write', 'run' => array( $this, 'op_update_term_seo' ), 'perm' => $edit, 'desc' => 'Update a term\'s Rank Math SEO metadata: { term_id, title?, description?, canonical?, noindex?, nofollow?, focus_keyword? }.' ),
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
		$out = array();
		foreach ( get_post_meta( $id ) as $key => $vals ) {
			if ( 0 === strpos( $key, 'rank_math_schema_' ) ) {
				$out[ $key ] = maybe_unserialize( $vals[0] ?? '' );
			}
		}
		return array( 'post_id' => $id, 'schema' => $out );
	}

	/**
	 * @param array $args Unused.
	 * @return array
	 */
	public function op_get_settings( array $args ): array {
		$opt  = (array) get_option( 'rank-math-options-titles', array() );
		$keys = array( 'title_separator', 'homepage_title', 'homepage_description', 'noindex_empty_taxonomies' );
		$out  = array();
		foreach ( $keys as $k ) {
			if ( isset( $opt[ $k ] ) ) {
				$out[ $k ] = $opt[ $k ];
			}
		}
		return array( 'settings' => $out );
	}

	/**
	 * Build the unified read view for a post or term.
	 *
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
		$robots           = $get( $id, 'rank_math_robots', true );
		$robots           = is_array( $robots ) ? $robots : array();
		$seo['noindex']   = in_array( 'noindex', $robots, true );
		$seo['nofollow']  = in_array( 'nofollow', $robots, true );
		return $seo;
	}

	/**
	 * Apply unified input to a post or term.
	 *
	 * @param string $type 'post'|'term'.
	 * @param int    $id   Object id.
	 * @param array  $args Arguments.
	 */
	private function apply( string $type, int $id, array $args ): void {
		$get = 'post' === $type ? 'get_post_meta' : 'get_term_meta';
		$set = 'post' === $type ? 'update_post_meta' : 'update_term_meta';
		foreach ( $this->map() as $field => $key ) {
			if ( array_key_exists( $field, $args ) ) {
				$set( $id, $key, sanitize_text_field( (string) $args[ $field ] ) );
			}
		}
		if ( array_key_exists( 'noindex', $args ) || array_key_exists( 'nofollow', $args ) ) {
			$robots = $get( $id, 'rank_math_robots', true );
			$robots = is_array( $robots ) ? $robots : array();
			$robots = $this->toggle( $robots, 'noindex', $args );
			$robots = $this->toggle( $robots, 'nofollow', $args );
			$set( $id, 'rank_math_robots', array_values( $robots ) );
		}
	}

	/**
	 * Add/remove a robots flag from the array based on a bool arg.
	 *
	 * @param array  $robots Robots array.
	 * @param string $flag   'noindex'|'nofollow'.
	 * @param array  $args   Arguments.
	 * @return array
	 */
	private function toggle( array $robots, string $flag, array $args ): array {
		if ( ! array_key_exists( $flag, $args ) ) {
			return $robots;
		}
		$robots = array_diff( $robots, array( $flag ) );
		if ( ! empty( $args[ $flag ] ) ) {
			$robots[] = $flag;
		}
		return $robots;
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
