<?php
/**
 * Image SEO config and attachment metadata helpers.
 *
 * @package Neo_Pulse_Wp
 */

defined( 'ABSPATH' ) || exit;

class Neo_Pulse_Wp_Image_Seo {

	const OPTION_KEY = 'neo_pulse_wp_image_seo_config';

	const FIELD_KEYS = array( 'title', 'alt', 'caption', 'description' );

	const RETRY_HOOK    = 'neo_pulse_wp_image_seo_retry';
	const ATTEMPTS_META = '_neo_pulse_image_seo_attempts';
	const MAX_ATTEMPTS  = 3;

	/**
	 * True while filling text automatically (upload or background retry), when no user check applies.
	 *
	 * @var bool
	 */
	public static $system_run = false;

	public static function init(): void {
		add_action( 'add_attachment', array( __CLASS__, 'maybe_auto_on_upload' ), 20, 1 );
		add_action( self::RETRY_HOOK, array( __CLASS__, 'retry' ), 10, 1 );
	}

	/**
	 * @return array<string,mixed>
	 */
	public static function default_config(): array {
		return array(
			'overwrite_mode'    => 'missing_only',
			'fields'            => array(
				'title'       => true,
				'alt'         => true,
				'caption'     => true,
				'description' => false,
			),
			'auto_on_upload'    => true,
			'auto_mode'         => 'ai',
			'context_from_post' => true,
			'ai_instructions'   => '',
		);
	}

	/**
	 * @return array<string,mixed>
	 */
	public static function get_config(): array {
		$stored = get_option( self::OPTION_KEY, array() );
		if ( ! is_array( $stored ) ) {
			$stored = array();
		}
		$config = array_merge( self::default_config(), $stored );
		$fields = is_array( $config['fields'] ?? null ) ? $config['fields'] : array();
		foreach ( self::FIELD_KEYS as $key ) {
			if ( ! array_key_exists( $key, $fields ) ) {
				$fields[ $key ] = (bool) ( self::default_config()['fields'][ $key ] ?? false );
			} else {
				$fields[ $key ] = (bool) $fields[ $key ];
			}
		}
		$config['fields'] = $fields;
		if ( ! in_array( $config['overwrite_mode'], array( 'missing_only', 'overwrite_all' ), true ) ) {
			$config['overwrite_mode'] = 'missing_only';
		}
		if ( ! in_array( $config['auto_mode'], array( 'filename', 'ai' ), true ) ) {
			$config['auto_mode'] = 'filename';
		}
		return $config;
	}

	/**
	 * @param array<string,mixed> $input
	 * @return array<string,mixed>
	 */
	public static function sanitize_config( array $input ): array {
		$defaults = self::default_config();
		$fields   = array();
		foreach ( self::FIELD_KEYS as $key ) {
			$fields[ $key ] = ! empty( $input[ 'field_' . $key ] );
		}
		$overwrite = isset( $input['overwrite_mode'] ) ? sanitize_key( (string) $input['overwrite_mode'] ) : 'missing_only';
		if ( ! in_array( $overwrite, array( 'missing_only', 'overwrite_all' ), true ) ) {
			$overwrite = 'missing_only';
		}
		$auto_mode = isset( $input['auto_mode'] ) ? sanitize_key( (string) $input['auto_mode'] ) : 'filename';
		if ( ! in_array( $auto_mode, array( 'filename', 'ai' ), true ) ) {
			$auto_mode = 'filename';
		}
		return array(
			'overwrite_mode'    => $overwrite,
			'fields'            => $fields,
			'auto_on_upload'    => ! empty( $input['auto_on_upload'] ),
			'auto_mode'         => $auto_mode,
			'context_from_post' => ! empty( $input['context_from_post'] ),
			'ai_instructions'   => isset( $input['ai_instructions'] ) ? mb_substr( trim( wp_strip_all_tags( wp_check_invalid_utf8( (string) $input['ai_instructions'] ) ) ), 0, 2000 ) : (string) ( self::get_config()['ai_instructions'] ?? '' ),
		);
	}

	/**
	 * @param array<string,mixed> $config
	 */
	public static function save_config( array $config ): void {
		update_option( self::OPTION_KEY, self::sanitize_config( $config ), false );
	}

	/**
	 * @return array<string,string>
	 */
	public static function read_meta( int $attachment_id ): array {
		$post = get_post( $attachment_id );
		if ( ! $post instanceof WP_Post ) {
			return array(
				'title'       => '',
				'alt'         => '',
				'caption'     => '',
				'description' => '',
				'filename'    => '',
			);
		}
		$file = get_attached_file( $attachment_id );
		return array(
			'title'       => (string) $post->post_title,
			'alt'         => (string) get_post_meta( $attachment_id, '_wp_attachment_image_alt', true ),
			'caption'     => (string) $post->post_excerpt,
			'description' => (string) $post->post_content,
			'filename'    => $file ? basename( $file ) : '',
		);
	}

	/**
	 * @param array<string,string> $values
	 * @return true|WP_Error
	 */
	public static function save_meta( int $attachment_id, array $values ) {
		$check = Neo_Pulse_Wp_Image_Seo_Gate::can_edit_attachment( $attachment_id );
		if ( is_wp_error( $check ) ) {
			return $check;
		}

		$update = array( 'ID' => $attachment_id );
		if ( array_key_exists( 'title', $values ) ) {
			$update['post_title'] = sanitize_text_field( (string) $values['title'] );
		}
		if ( array_key_exists( 'caption', $values ) ) {
			$update['post_excerpt'] = sanitize_textarea_field( (string) $values['caption'] );
		}
		if ( array_key_exists( 'description', $values ) ) {
			$update['post_content'] = wp_kses_post( (string) $values['description'] );
		}

		if ( count( $update ) > 1 ) {
			$result = wp_update_post( $update, true );
			if ( is_wp_error( $result ) ) {
				return $result;
			}
		}

		if ( array_key_exists( 'alt', $values ) ) {
			update_post_meta( $attachment_id, '_wp_attachment_image_alt', sanitize_text_field( (string) $values['alt'] ) );
		}

		return true;
	}

	/**
	 * @param array<string,string> $proposed
	 * @param array<string,string> $existing
	 * @param string               $overwrite_mode
	 * @param array<string,bool>   $fields
	 * @return array<string,string>
	 */
	public static function merge_values( array $proposed, array $existing, string $overwrite_mode, array $fields ): array {
		$out = array();
		foreach ( self::FIELD_KEYS as $key ) {
			if ( empty( $fields[ $key ] ) ) {
				continue;
			}
			$new_val = isset( $proposed[ $key ] ) ? trim( (string) $proposed[ $key ] ) : '';
			$old_val = isset( $existing[ $key ] ) ? trim( (string) $existing[ $key ] ) : '';
			// WordPress titles new uploads after the file ("IMG_4821"); that counts as missing.
			if ( 'title' === $key && $old_val !== '' && self::is_filename_title( $old_val, (string) ( $existing['filename'] ?? '' ) ) ) {
				$old_val = '';
			}
			if ( $new_val === '' ) {
				continue;
			}
			if ( $overwrite_mode === 'overwrite_all' || $old_val === '' ) {
				$out[ $key ] = $new_val;
			}
		}
		return $out;
	}

	public static function is_filename_title( string $title, string $filename ): bool {
		if ( $filename === '' ) {
			return false;
		}
		$norm = static function ( string $s ): string {
			return (string) preg_replace( '/[^a-z0-9]+/', '', strtolower( $s ) );
		};
		$stem = (string) preg_replace( '/\.[^.]+$/', '', $filename );
		$stem = (string) preg_replace( '/-(scaled|rotated|e\d+)$/', '', $stem );
		$t    = $norm( $title );
		return $t !== '' && ( $t === $norm( $stem ) || $t === $norm( (string) preg_replace( '/-\d+$/', '', $stem ) ) );
	}

	public static function filename_from_attachment( int $attachment_id ): string {
		$file = get_attached_file( $attachment_id );
		return $file ? basename( $file ) : '';
	}

	public static function is_missing_alt( int $attachment_id ): bool {
		$alt = get_post_meta( $attachment_id, '_wp_attachment_image_alt', true );
		return trim( (string) $alt ) === '';
	}

	/**
	 * @return array<string,mixed>
	 */
	public static function attachment_row( int $attachment_id ): array {
		$meta = self::read_meta( $attachment_id );
		$thumb = wp_get_attachment_image_src( $attachment_id, 'thumbnail' );
		return array(
			'id'          => $attachment_id,
			'filename'    => $meta['filename'],
			'title'       => $meta['title'],
			'alt'         => $meta['alt'],
			'caption'     => $meta['caption'],
			'description' => $meta['description'],
			'thumbUrl'    => $thumb ? $thumb[0] : '',
			'missingAlt'  => self::is_missing_alt( $attachment_id ),
		);
	}

	/**
	 * New upload: fill missing title/alt/etc. straight away so they show in the media window.
	 * If the AI call fails it is retried in the background before falling back to the file name.
	 */
	public static function maybe_auto_on_upload( $attachment_id ): void {
		$attachment_id = (int) $attachment_id;
		if ( ! wp_attachment_is_image( $attachment_id ) ) {
			return;
		}
		$config = self::upload_config();
		if ( null === $config ) {
			return;
		}
		$parent = (int) wp_get_post_parent_id( $attachment_id );
		self::$system_run = true;
		try {
			$done = self::auto_optimize( $attachment_id, $parent, $config, false, 25 );
		} finally {
			self::$system_run = false;
		}
		if ( ! $done && ( $config['auto_mode'] ?? '' ) === 'ai' ) {
			update_post_meta( $attachment_id, self::ATTEMPTS_META, 1 );
			wp_schedule_single_event( time() + 60, self::RETRY_HOOK, array( $attachment_id ) );
		}
	}

	/**
	 * Settings for the automatic fill on upload, or null when it should not run.
	 *
	 * Only the title and alt text are filled on upload: captions show under images in many themes
	 * and galleries, so those stay a manual choice in Image SEO. In AI mode nothing runs without an
	 * OpenRouter key, so new uploads never get file-name text by surprise.
	 *
	 * @return array<string,mixed>|null
	 */
	public static function upload_config(): ?array {
		$config = self::get_config();
		if ( empty( $config['auto_on_upload'] ) ) {
			return null;
		}
		if ( ( $config['auto_mode'] ?? '' ) === 'ai' && ( Neo_Pulse_Wp_OpenRouter::get_api_key() === '' || Neo_Pulse_Wp_License::ai_needs_upgrade( false ) ) ) {
			return null; // No AI (no key, or NEO Pulse Pro): nothing runs, rather than file-name text by surprise.
		}
		$fields           = is_array( $config['fields'] ?? null ) ? $config['fields'] : array();
		$config['fields'] = array(
			'title'       => ! empty( $fields['title'] ),
			'alt'         => ! empty( $fields['alt'] ),
			'caption'     => false,
			'description' => false,
		);
		return ( $config['fields']['title'] || $config['fields']['alt'] ) ? $config : null;
	}

	/**
	 * Background retry after a failed AI call on upload.
	 *
	 * @param mixed $attachment_id Attachment ID.
	 */
	public static function retry( $attachment_id ): void {
		$attachment_id = (int) $attachment_id;
		if ( $attachment_id < 1 || ! wp_attachment_is_image( $attachment_id ) ) {
			return;
		}
		$config = self::upload_config();
		if ( null === $config ) {
			delete_post_meta( $attachment_id, self::ATTEMPTS_META );
			return;
		}
		$attempts = (int) get_post_meta( $attachment_id, self::ATTEMPTS_META, true ) + 1;
		$last     = $attempts >= self::MAX_ATTEMPTS;
		self::$system_run = true;
		try {
			// No file-name fallback: an empty alt is better than "IMG 4821".
			$done = self::auto_optimize( $attachment_id, (int) wp_get_post_parent_id( $attachment_id ), $config, false );
		} finally {
			self::$system_run = false;
		}
		if ( $done || $last ) {
			delete_post_meta( $attachment_id, self::ATTEMPTS_META );
			return;
		}
		update_post_meta( $attachment_id, self::ATTEMPTS_META, $attempts );
		wp_schedule_single_event( time() + 300, self::RETRY_HOOK, array( $attachment_id ) );
	}

	/**
	 * @param array<string,mixed>|null $config
	 * @param bool                     $fallback Use the file name when the AI call fails.
	 * @param int                      $timeout  AI request timeout in seconds (0 = default).
	 * @return bool True when the AI (or chosen mode) produced text, even if nothing needed changing.
	 */
	public static function auto_optimize( int $attachment_id, int $post_id = 0, ?array $config = null, bool $fallback = true, int $timeout = 0 ): bool {
		$config = $config ?? self::get_config();
		$use_ai = ( $config['auto_mode'] ?? 'filename' ) === 'ai';

		if ( $use_ai && ! Neo_Pulse_Wp_Image_Seo_Gate::can_ai( $post_id ) ) {
			$use_ai = false;
		}
		$config['ai_timeout'] = $timeout;

		$existing = self::read_meta( $attachment_id );
		$fields   = is_array( $config['fields'] ?? null ) ? $config['fields'] : self::default_config()['fields'];

		if ( $use_ai ) {
			$proposed = Neo_Pulse_Wp_Image_Seo_Ai::preview_ai( $attachment_id, $post_id, $fields, $config );
			if ( is_wp_error( $proposed ) || $proposed === array() ) {
				if ( ! $fallback ) {
					return false;
				}
				$proposed = Neo_Pulse_Wp_Image_Seo_Ai::preview_filename( $attachment_id, $fields );
			}
		} else {
			$proposed = Neo_Pulse_Wp_Image_Seo_Ai::preview_filename( $attachment_id, $fields );
		}

		$merged = self::merge_values(
			$proposed,
			$existing,
			(string) ( $config['overwrite_mode'] ?? 'missing_only' ),
			$fields
		);
		if ( empty( $merged ) ) {
			return true;
		}
		$result = self::save_meta( $attachment_id, $merged );
		return ! is_wp_error( $result );
	}

	/**
	 * @param array<string,mixed> $args
	 * @return array{items:array<int,array<string,mixed>>,total:int,page:int,per_page:int}
	 */
	public static function query_attachments( array $args = array() ): array {
		$page     = max( 1, (int) ( $args['page'] ?? 1 ) );
		$per_page = max( 1, min( 100, (int) ( $args['per_page'] ?? 20 ) ) );
		$search   = isset( $args['search'] ) ? sanitize_text_field( (string) $args['search'] ) : '';
		$missing  = ! empty( $args['missing_alt'] );

		$query_args = array(
			'post_type'      => 'attachment',
			'post_status'    => 'inherit',
			'post_mime_type' => 'image',
			'posts_per_page' => $per_page,
			'paged'          => $page,
			'orderby'        => 'date',
			'order'          => 'DESC',
		);

		if ( $search !== '' ) {
			$query_args['s'] = $search;
		}

		if ( $missing ) {
			$query_args['meta_query'] = array(
				'relation' => 'OR',
				array(
					'key'     => '_wp_attachment_image_alt',
					'compare' => 'NOT EXISTS',
				),
				array(
					'key'     => '_wp_attachment_image_alt',
					'value'   => '',
					'compare' => '=',
				),
			);
		}

		$query = new WP_Query( $query_args );
		$items = array();
		foreach ( $query->posts as $post ) {
			if ( $post instanceof WP_Post ) {
				$items[] = self::attachment_row( (int) $post->ID );
			}
		}

		return array(
			'items'    => $items,
			'total'    => (int) $query->found_posts,
			'page'     => $page,
			'per_page' => $per_page,
		);
	}
}
