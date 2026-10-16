<?php
/**
 * SureRank integration (Pro) — two dispatcher tools (surerank-read /
 * surerank-write) over SureRank's real per-object meta keys.
 *
 * Verified against SureRank 1.9.3 (Brainstorm Force) — `Get::all_post_meta()`
 * reads each field group as a SEPARATE `surerank_settings_<key>` meta value,
 * NOT a single array. This integration reads/writes those keys directly:
 *   - surerank_settings_general (array): page_title, page_description, canonical_url
 *   - surerank_settings_social  (array): facebook_* (OG), twitter_* fields
 *   - surerank_settings_post_no_index  (scalar 'yes'|'no')
 *   - surerank_settings_post_no_follow (scalar 'yes'|'no')
 * Existing keys in each array are preserved on write; terms use the matching
 * term meta. (Earlier versions wrote a phantom `_surerank_meta` key that
 * SureRank never reads — see the SureRank bug report.)
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
class EMCP_Tools_SureRank_Integration extends EMCP_Tools_SEO_Integration {

	// SureRank stores per-post/term SEO across SEPARATE meta keys (verified
	// against SureRank 1.9.3's Get::all_post_meta(), which reads each key as
	// `surerank_settings_<key>`). There is no single `_surerank_meta` array.
	const GENERAL_KEY  = 'surerank_settings_general';        // array: page_title, page_description, canonical_url, …
	const SOCIAL_KEY   = 'surerank_settings_social';         // array: facebook_*, twitter_* …
	const NOINDEX_KEY  = 'surerank_settings_post_no_index';  // scalar '' | 'yes' | 'no'
	const NOFOLLOW_KEY = 'surerank_settings_post_no_follow'; // scalar '' | 'yes' | 'no'

	/** @return string */
	public function id(): string {
		return 'surerank';
	}

	/** @return string */
	public function label(): string {
		return 'SureRank';
	}

	/** @return bool */
	public function is_active(): bool {
		return defined( 'SURERANK_VERSION' );
	}

	/** Pro gate + plugin-active. */
	public function register(): void {
		if ( ! ( function_exists( 'emcp_tools_fs' ) && emcp_tools_fs()->can_use_premium_code() ) ) {
			return;
		}
		parent::register();
	}

	/** Unified field => key inside the `surerank_settings_general` array. */
	private function general_map(): array {
		return array(
			'title'       => 'page_title',
			'description' => 'page_description',
			'canonical'   => 'canonical_url',
		);
	}

	/** Unified field => key inside the `surerank_settings_social` array. */
	private function social_map(): array {
		return array(
			'og_title'            => 'facebook_title',
			'og_description'      => 'facebook_description',
			'og_image'            => 'facebook_image_url',
			'twitter_title'       => 'twitter_title',
			'twitter_description' => 'twitter_description',
			'twitter_image'       => 'twitter_image_url',
		);
	}

	/**
	 * Read a meta value for a post or term.
	 *
	 * @param string $object 'post' or 'term'.
	 * @param int    $id     Object id.
	 * @param string $key    Meta key.
	 * @return mixed
	 */
	private function get_meta( string $object, int $id, string $key ) {
		return 'term' === $object ? get_term_meta( $id, $key, true ) : get_post_meta( $id, $key, true );
	}

	/**
	 * Write a meta value for a post or term.
	 *
	 * @param string $object 'post' or 'term'.
	 * @param int    $id     Object id.
	 * @param string $key    Meta key.
	 * @param mixed  $value  Value.
	 * @return void
	 */
	private function set_meta( string $object, int $id, string $key, $value ): void {
		if ( 'term' === $object ) {
			update_term_meta( $id, $key, $value );
		} else {
			update_post_meta( $id, $key, $value );
		}
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
			'get-post-seo'    => array( 'mode' => 'read', 'run' => array( $this, 'op_get_post_seo' ), 'perm' => $edit, 'desc' => 'Get a post\'s SureRank metadata by { post_id }.' ),
			'get-term-seo'    => array( 'mode' => 'read', 'run' => array( $this, 'op_get_term_seo' ), 'perm' => $edit, 'desc' => 'Get a term\'s SureRank metadata by { term_id }.' ),
			'get-settings'    => array( 'mode' => 'read', 'run' => array( $this, 'op_get_settings' ), 'perm' => $manage, 'desc' => 'Get SureRank global settings.' ),
			'update-post-seo' => array( 'mode' => 'write', 'run' => array( $this, 'op_update_post_seo' ), 'perm' => $edit, 'desc' => 'Update a post\'s SureRank metadata: { post_id, title?, description?, canonical?, noindex?, nofollow?, og_*?, twitter_*? }.' ),
			'update-term-seo' => array( 'mode' => 'write', 'run' => array( $this, 'op_update_term_seo' ), 'perm' => $edit, 'desc' => 'Update a term\'s SureRank metadata: { term_id, title?, description?, canonical?, noindex?, nofollow?, og_*?, twitter_*? }.' ),
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
		return array( 'post_id' => $id, 'seo' => $this->read_seo( 'post', $id ) );
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
		return array( 'term_id' => $id, 'taxonomy' => $term->taxonomy, 'seo' => $this->read_seo( 'term', $id ) );
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
		$this->write_seo( 'post', $id, $args );
		return array( 'updated' => true, 'post_id' => $id, 'seo' => $this->read_seo( 'post', $id ) );
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
		$this->write_seo( 'term', $id, $args );
		return array( 'updated' => true, 'term_id' => $id, 'seo' => $this->read_seo( 'term', $id ) );
	}

	/**
	 * @param array $args Unused.
	 * @return array
	 */
	public function op_get_settings( array $args ): array {
		$opt = get_option( 'surerank_settings', array() );
		return array( 'settings' => is_array( $opt ) ? $opt : array() );
	}

	/**
	 * Assemble the unified read view from SureRank's real per-object meta keys.
	 *
	 * @param string $object 'post' or 'term'.
	 * @param int    $id     Object id.
	 * @return array<string,mixed>
	 */
	private function read_seo( string $object, int $id ): array {
		$general = $this->get_meta( $object, $id, self::GENERAL_KEY );
		$social  = $this->get_meta( $object, $id, self::SOCIAL_KEY );
		$general = is_array( $general ) ? $general : array();
		$social  = is_array( $social ) ? $social : array();

		$seo = array();
		foreach ( $this->general_map() as $field => $key ) {
			$seo[ $field ] = (string) ( $general[ $key ] ?? '' );
		}
		foreach ( $this->social_map() as $field => $key ) {
			$seo[ $field ] = (string) ( $social[ $key ] ?? '' );
		}
		$seo['noindex']  = $this->truthy( $this->get_meta( $object, $id, self::NOINDEX_KEY ) );
		$seo['nofollow'] = $this->truthy( $this->get_meta( $object, $id, self::NOFOLLOW_KEY ) );
		return $seo;
	}

	/** Meta keys a write may touch — snapshotted by the base for the ledger.
	 *  SureRank uses the same keys for posts and terms. */
	protected function recordable_meta_keys( string $object ): array {
		return array( self::GENERAL_KEY, self::SOCIAL_KEY, self::NOINDEX_KEY, self::NOFOLLOW_KEY );
	}

	/**
	 * Merge unified input into SureRank's real meta keys, preserving keys
	 * already present in each array. (The base dispatch records the change.)
	 *
	 * @param string $object 'post' or 'term'.
	 * @param int    $id     Object id.
	 * @param array  $args   Unified arguments.
	 * @return void
	 */
	private function write_seo( string $object, int $id, array $args ): void {
		// General bucket (array) — merge, preserve existing keys.
		$general = $this->get_meta( $object, $id, self::GENERAL_KEY );
		$general = is_array( $general ) ? $general : array();
		$hit     = false;
		foreach ( $this->general_map() as $field => $key ) {
			if ( array_key_exists( $field, $args ) ) {
				$general[ $key ] = sanitize_text_field( (string) $args[ $field ] );
				$hit             = true;
			}
		}
		if ( $hit ) {
			$this->set_meta( $object, $id, self::GENERAL_KEY, $general );
		}

		// Social bucket (array) — merge, preserve existing keys.
		$social = $this->get_meta( $object, $id, self::SOCIAL_KEY );
		$social = is_array( $social ) ? $social : array();
		$hit    = false;
		foreach ( $this->social_map() as $field => $key ) {
			if ( array_key_exists( $field, $args ) ) {
				$social[ $key ] = sanitize_text_field( (string) $args[ $field ] );
				$hit            = true;
			}
		}
		if ( $hit ) {
			$this->set_meta( $object, $id, self::SOCIAL_KEY, $social );
		}

		// Robots flags — separate scalar meta keys ('yes' | 'no').
		if ( array_key_exists( 'noindex', $args ) ) {
			$this->set_meta( $object, $id, self::NOINDEX_KEY, ! empty( $args['noindex'] ) ? 'yes' : 'no' );
		}
		if ( array_key_exists( 'nofollow', $args ) ) {
			$this->set_meta( $object, $id, self::NOFOLLOW_KEY, ! empty( $args['nofollow'] ) ? 'yes' : 'no' );
		}
	}

	/**
	 * @param mixed $val Value.
	 * @return bool
	 */
	private function truthy( $val ): bool {
		return in_array( $val, array( 'yes', '1', 1, true, 'true' ), true );
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
