<?php
/**
 * The SEO Framework (TSF) integration (Pro) — two dispatcher tools
 * (seoframework-read / seoframework-write) over TSF's post/term meta.
 *
 * Verified live against The SEO Framework 5.1.4:
 *  - TSF stores each field as individual post/term meta: `_genesis_title`,
 *    `_genesis_description`, `_genesis_canonical_uri`, `_genesis_noindex` (0/1),
 *    `_genesis_nofollow` (0/1), `_open_graph_title`, `_open_graph_description`,
 *    `_social_image_url`, `_twitter_title`, `_twitter_description`.
 *  - The_SEO_Framework\Data\Plugin\Post::get_meta($id) /
 *    Term::get_meta($id) return the merged field dict (used for reads).
 *
 * TSF has no focus keyword or separate Twitter image, so those fields are omitted.
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
class EMCP_Tools_SEOFramework_Integration extends EMCP_Tools_SEO_Integration {

	const POST_DATA = '\\The_SEO_Framework\\Data\\Plugin\\Post';
	const TERM_DATA = '\\The_SEO_Framework\\Data\\Plugin\\Term';

	/** @return string */
	public function id(): string {
		return 'seoframework';
	}

	/** @return string */
	public function label(): string {
		return 'The SEO Framework';
	}

	/** @return bool */
	public function is_active(): bool {
		return defined( 'THE_SEO_FRAMEWORK_VERSION' ) || function_exists( 'tsf' );
	}

	/** Pro gate + plugin-active. */
	public function register(): void {
		if ( ! ( function_exists( 'emcp_tools_fs' ) && emcp_tools_fs()->can_use_premium_code() ) ) {
			return;
		}
		parent::register();
	}

	/** Unified field => TSF string meta key. */
	private function map(): array {
		return array(
			'title'               => '_genesis_title',
			'description'         => '_genesis_description',
			'canonical'           => '_genesis_canonical_uri',
			'og_title'            => '_open_graph_title',
			'og_description'      => '_open_graph_description',
			'og_image'            => '_social_image_url',
			'twitter_title'       => '_twitter_title',
			'twitter_description' => '_twitter_description',
		);
	}

	/** Meta keys a write may touch — snapshotted by the base for the ledger.
	 *  TSF uses the same `_genesis_*`/`_open_graph_*`/`_twitter_*` meta for posts and terms. */
	protected function recordable_meta_keys( string $object ): array {
		return array_merge( array_values( $this->map() ), array( '_genesis_noindex', '_genesis_nofollow' ) );
	}

	/** @return array<string,array> */
	protected function operations(): array {
		$edit = static function (): bool {
			return current_user_can( 'edit_posts' );
		};

		return array(
			'get-post-seo'    => array( 'mode' => 'read', 'run' => array( $this, 'op_get_post_seo' ), 'perm' => $edit, 'desc' => 'Get a post\'s SEO Framework metadata by { post_id }.' ),
			'get-term-seo'    => array( 'mode' => 'read', 'run' => array( $this, 'op_get_term_seo' ), 'perm' => $edit, 'desc' => 'Get a term\'s SEO Framework metadata by { term_id }.' ),
			'update-post-seo' => array( 'mode' => 'write', 'run' => array( $this, 'op_update_post_seo' ), 'perm' => $edit, 'desc' => 'Update a post\'s SEO Framework metadata: { post_id, title?, description?, canonical?, noindex?, nofollow?, og_title?, og_description?, og_image?, twitter_title?, twitter_description? }.' ),
			'update-term-seo' => array( 'mode' => 'write', 'run' => array( $this, 'op_update_term_seo' ), 'perm' => $edit, 'desc' => 'Update a term\'s SEO Framework metadata: { term_id, title?, description?, canonical?, noindex?, nofollow?, og_title?, og_description? }.' ),
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
		return array( 'post_id' => $id, 'seo' => $this->read_view( 'get_post_meta', $id ) );
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
		return array( 'term_id' => $id, 'taxonomy' => $term->taxonomy, 'seo' => $this->read_view( 'get_term_meta', $id ) );
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
		$this->apply( 'update_post_meta', $id, $args );
		return $this->op_get_post_seo( array( 'post_id' => $id ) ) + array( 'updated' => true );
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
		$this->apply( 'update_term_meta', $id, $args );
		return $this->op_get_term_seo( array( 'term_id' => $id ) ) + array( 'updated' => true );
	}

	/**
	 * Build the unified read view from raw individual meta (TSF's own get_meta()
	 * is request-cached, so a write followed by a re-read in the same request
	 * would be stale — reading the DB directly avoids that).
	 *
	 * @param string $getter get_post_meta|get_term_meta.
	 * @param int    $id     Object id.
	 * @return array<string,mixed>
	 */
	private function read_view( string $getter, int $id ): array {
		$seo = array();
		foreach ( $this->map() as $field => $key ) {
			$seo[ $field ] = (string) $getter( $id, $key, true );
		}
		$seo['noindex']  = ! empty( $getter( $id, '_genesis_noindex', true ) );
		$seo['nofollow'] = ! empty( $getter( $id, '_genesis_nofollow', true ) );
		return $seo;
	}

	/**
	 * @param string $setter update_post_meta|update_term_meta.
	 * @param int    $id     Object id.
	 * @param array  $args   Arguments.
	 */
	private function apply( string $setter, int $id, array $args ): void {
		foreach ( $this->map() as $field => $key ) {
			if ( array_key_exists( $field, $args ) ) {
				$setter( $id, $key, sanitize_text_field( (string) $args[ $field ] ) );
			}
		}
		if ( array_key_exists( 'noindex', $args ) ) {
			$setter( $id, '_genesis_noindex', ! empty( $args['noindex'] ) ? 1 : 0 );
		}
		if ( array_key_exists( 'nofollow', $args ) ) {
			$setter( $id, '_genesis_nofollow', ! empty( $args['nofollow'] ) ? 1 : 0 );
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
