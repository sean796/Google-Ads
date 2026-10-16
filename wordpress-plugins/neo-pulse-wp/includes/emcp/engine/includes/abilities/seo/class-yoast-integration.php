<?php
/**
 * Yoast SEO integration (Pro) — two dispatcher tools (yoast-read / yoast-write)
 * over Yoast's post meta + term option + settings option.
 *
 * Verified live against Yoast SEO 28.0:
 *  - Post SEO: individual `_yoast_wpseo_*` post meta (title, metadesc, canonical,
 *    focuskw, opengraph-*, twitter-*, meta-robots-noindex where '1' = noindex).
 *  - Term SEO: the `wpseo_taxonomy_meta` option, keyed [taxonomy][term_id] with
 *    `wpseo_*` keys.
 *  - Settings: the `wpseo_titles` option (read-only view).
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
class EMCP_Tools_Yoast_Integration extends EMCP_Tools_SEO_Integration {

	/** @return string */
	public function id(): string {
		return 'yoast';
	}

	/** @return string */
	public function label(): string {
		return 'Yoast SEO';
	}

	/** @return bool */
	public function is_active(): bool {
		return defined( 'WPSEO_VERSION' );
	}

	/** Pro gate + plugin-active. */
	public function register(): void {
		if ( ! ( function_exists( 'emcp_tools_fs' ) && emcp_tools_fs()->can_use_premium_code() ) ) {
			return;
		}
		parent::register();
	}

	/** Unified field => post-meta key (strings). */
	private function post_map(): array {
		return array(
			'title'               => '_yoast_wpseo_title',
			'description'         => '_yoast_wpseo_metadesc',
			'canonical'           => '_yoast_wpseo_canonical',
			'focus_keyword'       => '_yoast_wpseo_focuskw',
			'og_title'            => '_yoast_wpseo_opengraph-title',
			'og_description'      => '_yoast_wpseo_opengraph-description',
			'og_image'            => '_yoast_wpseo_opengraph-image',
			'twitter_title'       => '_yoast_wpseo_twitter-title',
			'twitter_description' => '_yoast_wpseo_twitter-description',
			'twitter_image'       => '_yoast_wpseo_twitter-image',
		);
	}

	/** Post-meta keys a write may touch — snapshotted by the base for the ledger.
	 *  Terms live in the `wpseo_taxonomy_meta` option (not term meta), so they
	 *  opt out of the meta-before-image recorder. */
	protected function recordable_meta_keys( string $object ): array {
		if ( 'post' !== $object ) {
			return array();
		}
		return array_merge( array_values( $this->post_map() ), array( '_yoast_wpseo_meta-robots-noindex' ) );
	}

	/** Unified field => term-option key. */
	private function term_map(): array {
		return array(
			'title'         => 'wpseo_title',
			'description'   => 'wpseo_desc',
			'canonical'     => 'wpseo_canonical',
			'focus_keyword' => 'wpseo_focuskw',
		);
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
			'get-post-seo'    => array( 'mode' => 'read', 'run' => array( $this, 'op_get_post_seo' ), 'perm' => $edit, 'desc' => 'Get a post\'s Yoast SEO metadata by { post_id }.' ),
			'get-term-seo'    => array( 'mode' => 'read', 'run' => array( $this, 'op_get_term_seo' ), 'perm' => $edit, 'desc' => 'Get a term\'s Yoast SEO metadata by { term_id }.' ),
			'get-settings'    => array( 'mode' => 'read', 'run' => array( $this, 'op_get_settings' ), 'perm' => $manage, 'desc' => 'Get Yoast title/meta settings (the wpseo_titles option).' ),
			'update-post-seo' => array( 'mode' => 'write', 'run' => array( $this, 'op_update_post_seo' ), 'perm' => $edit, 'desc' => 'Update a post\'s Yoast SEO metadata: { post_id, title?, description?, canonical?, noindex?, focus_keyword?, og_title?, og_description?, og_image?, twitter_title?, twitter_description?, twitter_image? }.' ),
			'update-term-seo' => array( 'mode' => 'write', 'run' => array( $this, 'op_update_term_seo' ), 'perm' => $edit, 'desc' => 'Update a term\'s Yoast SEO metadata: { term_id, title?, description?, canonical?, noindex?, focus_keyword? }.' ),
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
		$seo = array();
		foreach ( $this->post_map() as $field => $key ) {
			$seo[ $field ] = (string) get_post_meta( $id, $key, true );
		}
		$seo['noindex'] = '1' === (string) get_post_meta( $id, '_yoast_wpseo_meta-robots-noindex', true );
		return array( 'post_id' => $id, 'seo' => $seo );
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
		foreach ( $this->post_map() as $field => $key ) {
			if ( array_key_exists( $field, $args ) ) {
				update_post_meta( $id, $key, sanitize_text_field( (string) $args[ $field ] ) );
			}
		}
		if ( array_key_exists( 'noindex', $args ) ) {
			update_post_meta( $id, '_yoast_wpseo_meta-robots-noindex', ! empty( $args['noindex'] ) ? '1' : '2' );
		}
		return $this->op_get_post_seo( array( 'post_id' => $id ) ) + array( 'updated' => true );
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
		$all  = (array) get_option( 'wpseo_taxonomy_meta', array() );
		$meta = $all[ $term->taxonomy ][ $id ] ?? array();
		$seo  = array();
		foreach ( $this->term_map() as $field => $key ) {
			$seo[ $field ] = (string) ( $meta[ $key ] ?? '' );
		}
		$seo['noindex'] = 'noindex' === ( $meta['wpseo_noindex'] ?? '' );
		return array( 'term_id' => $id, 'taxonomy' => $term->taxonomy, 'seo' => $seo );
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
		$all = (array) get_option( 'wpseo_taxonomy_meta', array() );
		if ( ! isset( $all[ $term->taxonomy ][ $id ] ) || ! is_array( $all[ $term->taxonomy ][ $id ] ) ) {
			$all[ $term->taxonomy ][ $id ] = array();
		}
		foreach ( $this->term_map() as $field => $key ) {
			if ( array_key_exists( $field, $args ) ) {
				$all[ $term->taxonomy ][ $id ][ $key ] = sanitize_text_field( (string) $args[ $field ] );
			}
		}
		if ( array_key_exists( 'noindex', $args ) ) {
			$all[ $term->taxonomy ][ $id ]['wpseo_noindex'] = ! empty( $args['noindex'] ) ? 'noindex' : 'index';
		}
		update_option( 'wpseo_taxonomy_meta', $all );
		return $this->op_get_term_seo( array( 'term_id' => $id ) ) + array( 'updated' => true );
	}

	/**
	 * @param array $args Unused.
	 * @return array
	 */
	public function op_get_settings( array $args ): array {
		$opt = (array) get_option( 'wpseo_titles', array() );
		$keys = array( 'separator', 'title-home-wpseo', 'metadesc-home-wpseo', 'company_name', 'website_name' );
		$out  = array();
		foreach ( $keys as $k ) {
			if ( isset( $opt[ $k ] ) ) {
				$out[ $k ] = $opt[ $k ];
			}
		}
		return array( 'settings' => $out );
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
