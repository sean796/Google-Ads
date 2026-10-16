<?php
/**
 * All in One SEO (AIOSEO) integration (Pro) — two dispatcher tools
 * (aioseo-read / aioseo-write) over AIOSEO's Post model + options.
 *
 * Verified live against All in One SEO 4.9.10:
 *  - Post SEO: the `aioseo_posts` table via AIOSEO\Plugin\Common\Models\Post
 *    (getPost($id) → model with ->save()). Robots use robots_default (bool) +
 *    robots_noindex / robots_nofollow. og_image_custom_url / twitter_image_custom_url
 *    hold custom social images; the resolved values are og_image_url / twitter_image_url.
 *  - Schema: the model's `schema` object.
 *  - Settings: aioseo()->options (search-appearance separator).
 *
 * AIOSEO 4.9 exposes no Term model here, so this adapter covers post SEO only.
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
class EMCP_Tools_AIOSEO_Integration extends EMCP_Tools_SEO_Integration {

	const MODEL = '\\AIOSEO\\Plugin\\Common\\Models\\Post';

	/** @return string */
	public function id(): string {
		return 'aioseo';
	}

	/** @return string */
	public function label(): string {
		return 'All in One SEO';
	}

	/** @return bool */
	public function is_active(): bool {
		return function_exists( 'aioseo' ) || defined( 'AIOSEO_VERSION' );
	}

	/** Pro gate + plugin-active. */
	public function register(): void {
		if ( ! ( function_exists( 'emcp_tools_fs' ) && emcp_tools_fs()->can_use_premium_code() ) ) {
			return;
		}
		parent::register();
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
			'get-post-seo'    => array( 'mode' => 'read', 'run' => array( $this, 'op_get_post_seo' ), 'perm' => $edit, 'desc' => 'Get a post\'s AIOSEO metadata by { post_id }.' ),
			'get-schema'      => array( 'mode' => 'read', 'run' => array( $this, 'op_get_schema' ), 'perm' => $edit, 'desc' => 'Get a post\'s AIOSEO schema (structured data) by { post_id }.' ),
			'get-settings'    => array( 'mode' => 'read', 'run' => array( $this, 'op_get_settings' ), 'perm' => $manage, 'desc' => 'Get AIOSEO search-appearance settings.' ),
			'update-post-seo' => array( 'mode' => 'write', 'run' => array( $this, 'op_update_post_seo' ), 'perm' => $edit, 'desc' => 'Update a post\'s AIOSEO metadata: { post_id, title?, description?, canonical?, noindex?, nofollow?, og_title?, og_description?, og_image?, twitter_title?, twitter_description?, twitter_image? }.' ),
		);
	}

	/**
	 * @param array $args { post_id }.
	 * @return array|WP_Error
	 */
	public function op_get_post_seo( array $args ) {
		$id = isset( $args['post_id'] ) ? absint( $args['post_id'] ) : 0;
		if ( ! $id || ! get_post( $id ) ) {
			return $this->err( $id, 'post_id' );
		}
		$m   = self::MODEL;
		$rec = $m::getPost( $id );
		return array(
			'post_id' => $id,
			'seo'     => array(
				'title'               => (string) ( $rec->title ?? '' ),
				'description'         => (string) ( $rec->description ?? '' ),
				'canonical'           => (string) ( $rec->canonical_url ?? '' ),
				'og_title'            => (string) ( $rec->og_title ?? '' ),
				'og_description'      => (string) ( $rec->og_description ?? '' ),
				'og_image'            => (string) ( $rec->og_image_url ?: ( $rec->og_image_custom_url ?? '' ) ),
				'twitter_title'       => (string) ( $rec->twitter_title ?? '' ),
				'twitter_description' => (string) ( $rec->twitter_description ?? '' ),
				'twitter_image'       => (string) ( $rec->twitter_image_url ?: ( $rec->twitter_image_custom_url ?? '' ) ),
				'noindex'             => ! empty( $rec->robots_noindex ),
				'nofollow'            => ! empty( $rec->robots_nofollow ),
			),
		);
	}

	/**
	 * @param array $args { post_id, ...fields }.
	 * @return array|WP_Error
	 */
	public function op_update_post_seo( array $args ) {
		$id = isset( $args['post_id'] ) ? absint( $args['post_id'] ) : 0;
		if ( ! $id || ! get_post( $id ) ) {
			return $this->err( $id, 'post_id' );
		}
		// The aioseo_posts row is locked, saved, read back and recorded in one History
		// transaction, so History can undo the change (EMCP_Tools_DB_Change).
		global $wpdb;
		$out = EMCP_Tools_DB_Change::write(
			array(
				'table'   => $wpdb->prefix . 'aioseo_posts',
				'op'      => 'custom',
				'where'   => array( 'post_id' => $id ),
				'run'     => function () use ( $args, $id ) {
					$m   = self::MODEL;
					$rec = $m::getPost( $id );
					$this->apply_fields( $rec, $args );
					$rec->post_id = $id;
					$rec->save();
					return null;
				},
				'entry'   => array(
					'domain'  => 'seo',
					'action'  => 'update',
					'target'  => 'aioseo:post:' . $id,
					/* translators: %d: post id */
					'summary' => sprintf( __( 'Updated All in One SEO for post #%d', 'emcp-tools' ), $id ),
				),
				'cap'     => 'edit_posts',
				'post_id' => $id,
			)
		);
		if ( is_wp_error( $out ) ) {
			return $out;
		}

		return $this->op_get_post_seo( array( 'post_id' => $id ) ) + array( 'updated' => true );
	}

	/**
	 * Set the sent fields on an AIOSEO post record.
	 *
	 * @param object $rec  AIOSEO post model.
	 * @param array  $args Tool arguments.
	 */
	private function apply_fields( $rec, array $args ): void {
		$str = array(
			'title'               => 'title',
			'description'         => 'description',
			'canonical'           => 'canonical_url',
			'og_title'            => 'og_title',
			'og_description'      => 'og_description',
			'twitter_title'       => 'twitter_title',
			'twitter_description' => 'twitter_description',
		);
		foreach ( $str as $field => $prop ) {
			if ( array_key_exists( $field, $args ) ) {
				$rec->{$prop} = sanitize_text_field( (string) $args[ $field ] );
			}
		}
		if ( array_key_exists( 'og_image', $args ) ) {
			$rec->og_image_type       = 'custom_image';
			$rec->og_image_custom_url = esc_url_raw( (string) $args['og_image'] );
		}
		if ( array_key_exists( 'twitter_image', $args ) ) {
			$rec->twitter_image_type       = 'custom_image';
			$rec->twitter_image_custom_url = esc_url_raw( (string) $args['twitter_image'] );
		}
		if ( array_key_exists( 'noindex', $args ) || array_key_exists( 'nofollow', $args ) ) {
			$rec->robots_default = false;
			if ( array_key_exists( 'noindex', $args ) ) {
				$rec->robots_noindex = ! empty( $args['noindex'] );
			}
			if ( array_key_exists( 'nofollow', $args ) ) {
				$rec->robots_nofollow = ! empty( $args['nofollow'] );
			}
		}
	}

	/**
	 * @param array $args { post_id }.
	 * @return array|WP_Error
	 */
	public function op_get_schema( array $args ) {
		$id = isset( $args['post_id'] ) ? absint( $args['post_id'] ) : 0;
		if ( ! $id || ! get_post( $id ) ) {
			return $this->err( $id, 'post_id' );
		}
		$m      = self::MODEL;
		$rec    = $m::getPost( $id );
		$schema = $rec->schema ?? null;
		return array( 'post_id' => $id, 'schema' => is_object( $schema ) ? json_decode( wp_json_encode( $schema ), true ) : $schema );
	}

	/**
	 * @param array $args Unused.
	 * @return array
	 */
	public function op_get_settings( array $args ): array {
		$out = array();
		if ( function_exists( 'aioseo' ) && isset( aioseo()->options->searchAppearance->global->separator ) ) {
			$out['separator'] = (string) aioseo()->options->searchAppearance->global->separator;
		}
		return array( 'settings' => $out );
	}

	/**
	 * @param int    $id    Id (0 = missing).
	 * @param string $field Argument name.
	 * @return WP_Error
	 */
	private function err( int $id, string $field ): WP_Error {
		if ( ! $id ) {
			return new WP_Error( 'missing_argument', sprintf( /* translators: %s: arg */ __( 'Missing required argument: %s.', 'emcp-tools' ), $field ), array( 'status' => 400 ) );
		}
		return new WP_Error( 'not_found', sprintf( /* translators: %d: id */ __( 'No post with id %d.', 'emcp-tools' ), $id ), array( 'status' => 404 ) );
	}
}
