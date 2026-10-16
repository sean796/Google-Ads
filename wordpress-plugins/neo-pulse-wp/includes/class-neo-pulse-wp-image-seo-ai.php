<?php
/**
 * Image SEO AI and filename-based optimization.
 *
 * @package Neo_Pulse_Wp
 */

defined( 'ABSPATH' ) || exit;

class Neo_Pulse_Wp_Image_Seo_Ai {

	/**
	 * @param array<string,bool>   $fields
	 * @param array<string,mixed>  $config
	 * @return array<string,string>|WP_Error
	 */
	public static function preview_ai( int $attachment_id, int $post_id, array $fields, array $config ) {
		if ( ! Neo_Pulse_Wp_Image_Seo_Gate::can_ai( $post_id ) ) {
			return new WP_Error( 'neo-pulse_ai', __( 'OpenRouter is not configured.', 'neo-pulse-wp' ) );
		}

		$meta     = Neo_Pulse_Wp_Image_Seo::read_meta( $attachment_id );
		$filename = Neo_Pulse_Wp_Image_Seo::filename_from_attachment( $attachment_id );
		$context  = self::build_post_context( $post_id, $config );

		$enabled = self::enabled_field_keys( $fields );
		if ( empty( $enabled ) ) {
			return array();
		}

		$image = self::image_data_url( $attachment_id );

		$system = 'You are an expert WordPress image SEO specialist. Write attachment metadata for the image'
			. ( $image !== '' ? ' you are shown. Describe what is actually visible in the image' : ' from its filename and any context provided' )
			. '. Return ONLY valid JSON with keys: title, alt, caption, description. Use an empty string for fields you are not asked to fill.'
			. ' Alt text: one plain sentence or phrase, max 125 characters, describing the image for someone who cannot see it; no "image of" or "picture of"; use keywords only where they fit naturally.'
			. ' Title: short and human-readable (not a file name). Caption and description: optional, brief supporting text.'
			. ' Do not invent brand names, product names or locations that are not visible in the image or given in the context.';
		$instructions = trim( (string) ( $config['ai_instructions'] ?? '' ) );
		if ( $instructions !== '' ) {
			$system .= "\n\nInstructions from the site owner (follow these):\n" . $instructions;
		}

		$user = self::site_context();
		$user .= "Filename: {$filename}\n";
		if ( $meta['title'] !== '' || $meta['alt'] !== '' || $meta['caption'] !== '' || $meta['description'] !== '' ) {
			$user .= "Existing metadata:\n";
			$user .= '- title: ' . $meta['title'] . "\n";
			$user .= '- alt: ' . $meta['alt'] . "\n";
			$user .= '- caption: ' . $meta['caption'] . "\n";
			$user .= '- description: ' . wp_strip_all_tags( $meta['description'] ) . "\n";
		}
		if ( $context !== '' ) {
			$user .= "Page context:\n{$context}\n";
		}
		$user .= 'Generate values for: ' . implode( ', ', $enabled ) . '.';

		$timeout = (int) ( $config['ai_timeout'] ?? 0 );
		$raw     = $image !== ''
			? Neo_Pulse_Wp_OpenRouter::complete_with_image( $system, $user, $image, 800, 0.3, $timeout )
			: Neo_Pulse_Wp_OpenRouter::complete( $system, $user, 1024, 0.4 );
		if ( is_wp_error( $raw ) ) {
			return $raw;
		}

		return self::parse_ai_json( (string) $raw, $enabled );
	}

	/**
	 * The image as a small JPEG data URL for the AI to look at ('' when it cannot be read).
	 * Resized to at most 1024px so the request stays small and fast.
	 */
	public static function image_data_url( int $attachment_id ): string {
		$file = get_attached_file( $attachment_id );
		if ( ! is_string( $file ) || $file === '' || ! is_readable( $file ) ) {
			return '';
		}
		$mime = (string) get_post_mime_type( $attachment_id );
		if ( ! in_array( $mime, array( 'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif', 'image/heic' ), true ) ) {
			return '';
		}
		$editor = wp_get_image_editor( $file );
		if ( ! is_wp_error( $editor ) ) {
			$editor->resize( 1024, 1024, false );
			$editor->set_quality( 75 );
			$tmp   = wp_tempnam( 'neo-pulse-img-seo' ) . '.jpg';
			$saved = $editor->save( $tmp, 'image/jpeg' );
			if ( ! is_wp_error( $saved ) && ! empty( $saved['path'] ) && is_readable( $saved['path'] ) ) {
				$bytes = (string) file_get_contents( $saved['path'] ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents
				wp_delete_file( $saved['path'] );
				wp_delete_file( $tmp );
				return $bytes !== '' ? 'data:image/jpeg;base64,' . base64_encode( $bytes ) : ''; // phpcs:ignore WordPress.PHP.DiscouragedPHPFunctions.obfuscation_base64_encode
			}
			wp_delete_file( $tmp );
		}
		if ( in_array( $mime, array( 'image/jpeg', 'image/png', 'image/webp', 'image/gif' ), true ) && filesize( $file ) <= 4 * MB_IN_BYTES ) {
			$bytes = (string) file_get_contents( $file ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents
			return $bytes !== '' ? 'data:' . $mime . ';base64,' . base64_encode( $bytes ) : ''; // phpcs:ignore WordPress.PHP.DiscouragedPHPFunctions.obfuscation_base64_encode
		}
		return '';
	}

	/**
	 * Business name, tagline and city, so the AI can use them when the instructions ask.
	 */
	private static function site_context(): string {
		$lines = array( 'Website: ' . wp_specialchars_decode( (string) get_bloginfo( 'name' ), ENT_QUOTES ) );
		$tagline = wp_specialchars_decode( (string) get_bloginfo( 'description' ), ENT_QUOTES );
		if ( $tagline !== '' ) {
			$lines[] = 'Tagline: ' . $tagline;
		}
		if ( class_exists( 'Neo_Pulse_Wp_Seo_Settings', false ) ) {
			$address = Neo_Pulse_Wp_Seo_Settings::get( 'local_address', array() );
			if ( is_array( $address ) ) {
				$place = trim( implode( ', ', array_filter( array( (string) ( $address['addressLocality'] ?? '' ), (string) ( $address['addressRegion'] ?? '' ) ) ) ) );
				if ( $place !== '' ) {
					$lines[] = 'Business location: ' . $place;
				}
			}
		}
		return implode( "\n", $lines ) . "\n";
	}

	/**
	 * @param array<string,bool> $fields
	 * @return array<string,string>
	 */
	public static function preview_filename( int $attachment_id, array $fields ): array {
		$filename = Neo_Pulse_Wp_Image_Seo::filename_from_attachment( $attachment_id );
		$human    = self::humanize_filename( $filename );
		$out      = array();
		foreach ( Neo_Pulse_Wp_Image_Seo::FIELD_KEYS as $key ) {
			if ( empty( $fields[ $key ] ) ) {
				continue;
			}
			if ( $key === 'alt' || $key === 'title' ) {
				$out[ $key ] = $human;
			} elseif ( $key === 'caption' ) {
				$out[ $key ] = $human;
			} else {
				$out[ $key ] = '';
			}
		}
		return $out;
	}

	/**
	 * @param array<string,bool>|null $fields
	 * @param array<string,mixed>|null $config
	 * @return array{proposed:array<string,string>,merged:array<string,string>,existing:array<string,string>}|WP_Error
	 */
	public static function preview( int $attachment_id, int $post_id = 0, bool $use_ai = true, ?array $fields = null, ?string $overwrite_mode = null, ?array $config = null ) {
		$config = $config ?? Neo_Pulse_Wp_Image_Seo::get_config();
		$fields = $fields ?? ( is_array( $config['fields'] ?? null ) ? $config['fields'] : Neo_Pulse_Wp_Image_Seo::default_config()['fields'] );
		$overwrite_mode = $overwrite_mode ?? (string) ( $config['overwrite_mode'] ?? 'missing_only' );

		if ( $use_ai ) {
			$proposed = self::preview_ai( $attachment_id, $post_id, $fields, $config );
			if ( is_wp_error( $proposed ) ) {
				return $proposed;
			}
		} else {
			$proposed = self::preview_filename( $attachment_id, $fields );
		}

		$existing = Neo_Pulse_Wp_Image_Seo::read_meta( $attachment_id );
		$merged   = Neo_Pulse_Wp_Image_Seo::merge_values( $proposed, $existing, $overwrite_mode, $fields );

		return array(
			'proposed' => $proposed,
			'merged'   => $merged,
			'existing' => array(
				'title'       => $existing['title'],
				'alt'         => $existing['alt'],
				'caption'     => $existing['caption'],
				'description' => $existing['description'],
			),
		);
	}

	/**
	 * @param array<string,string> $values
	 * @return array{ok:bool,values:array<string,string>}|WP_Error
	 */
	public static function apply( int $attachment_id, array $values, ?string $overwrite_mode = null, ?array $fields = null ) {
		$config = Neo_Pulse_Wp_Image_Seo::get_config();
		$fields = $fields ?? ( is_array( $config['fields'] ?? null ) ? $config['fields'] : Neo_Pulse_Wp_Image_Seo::default_config()['fields'] );
		$overwrite_mode = $overwrite_mode ?? (string) ( $config['overwrite_mode'] ?? 'missing_only' );
		$existing = Neo_Pulse_Wp_Image_Seo::read_meta( $attachment_id );
		$merged   = Neo_Pulse_Wp_Image_Seo::merge_values( $values, $existing, $overwrite_mode, $fields );
		if ( empty( $merged ) ) {
			return array(
				'ok'     => true,
				'values' => array(),
				'skipped' => true,
			);
		}
		$result = Neo_Pulse_Wp_Image_Seo::save_meta( $attachment_id, $merged );
		if ( is_wp_error( $result ) ) {
			return $result;
		}
		return array(
			'ok'     => true,
			'values' => $merged,
			'row'    => Neo_Pulse_Wp_Image_Seo::attachment_row( $attachment_id ),
		);
	}

	public static function humanize_filename( string $filename ): string {
		$name = preg_replace( '/\.[^.]+$/', '', $filename );
		$name = str_replace( array( '-', '_', '.' ), ' ', (string) $name );
		$name = preg_replace( '/\s+/', ' ', trim( (string) $name ) );
		if ( $name === '' ) {
			return '';
		}
		return mb_strtoupper( mb_substr( $name, 0, 1 ) ) . mb_substr( $name, 1 );
	}

	/**
	 * @param array<string,bool> $fields
	 * @return array<int,string>
	 */
	private static function enabled_field_keys( array $fields ): array {
		$keys = array();
		foreach ( Neo_Pulse_Wp_Image_Seo::FIELD_KEYS as $key ) {
			if ( ! empty( $fields[ $key ] ) ) {
				$keys[] = $key;
			}
		}
		return $keys;
	}

	/**
	 * @param array<string,mixed> $config
	 */
	private static function build_post_context( int $post_id, array $config ): string {
		if ( $post_id < 1 || empty( $config['context_from_post'] ) ) {
			return '';
		}
		$post = get_post( $post_id );
		if ( ! $post instanceof WP_Post ) {
			return '';
		}
		$link = get_permalink( $post_id );
		$parts = array(
			'Post title: ' . $post->post_title,
		);
		if ( is_string( $link ) && $link !== '' ) {
			$parts[] = 'URL: ' . $link;
		}
		return implode( "\n", $parts );
	}

	/**
	 * @param array<int,string> $enabled
	 * @return array<string,string>
	 */
	private static function parse_ai_json( string $raw, array $enabled ): array {
		$raw = trim( $raw );
		if ( preg_match( '/\{[\s\S]*\}/', $raw, $m ) ) {
			$raw = $m[0];
		}
		$decoded = json_decode( $raw, true );
		$out     = array();
		if ( ! is_array( $decoded ) ) {
			return $out;
		}
		foreach ( $enabled as $key ) {
			if ( ! isset( $decoded[ $key ] ) ) {
				continue;
			}
			$val = trim( (string) $decoded[ $key ] );
			if ( $key === 'alt' && mb_strlen( $val ) > 125 ) {
				$val = mb_substr( $val, 0, 125 );
			}
			$out[ $key ] = $val;
		}
		return $out;
	}
}
