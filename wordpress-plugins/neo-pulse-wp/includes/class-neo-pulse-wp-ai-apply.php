<?php
/**
 * Apply AI wand previews to WordPress fields.
 *
 * @package Neo_Pulse_Wp
 */

defined( 'ABSPATH' ) || exit;

class Neo_Pulse_Wp_Ai_Apply {

	/**
	 * @return array<string,mixed>|WP_Error
	 */
	public static function apply( int $post_id, string $field, string $value ) {
		if ( ! Neo_Pulse_Wp_Ai_Fields::is_allowed( $field ) ) {
			return new WP_Error( 'neo-pulse_field', __( 'Invalid field.', 'neo-pulse-wp' ) );
		}
		if ( ! Neo_Pulse_Wp_Ai_Gate::can_apply( $post_id ) ) {
			$status = Neo_Pulse_Wp_Ai_Gate::get_status( $post_id );
			$msg    = ! empty( $status['reasons'][0] ) ? (string) $status['reasons'][0] : __( 'Apply is not allowed.', 'neo-pulse-wp' );
			return new WP_Error( 'neo-pulse_ai_apply', $msg );
		}

		$value = trim( $value );
		if ( $value === '' || Neo_Pulse_Wp_Ai_Seo_Limits::is_placeholder_copy( $value ) ) {
			return new WP_Error( 'neo-pulse_empty', __( 'Value is empty.', 'neo-pulse-wp' ) );
		}

		if ( $field === 'title' ) {
			$value = Neo_Pulse_Wp_Ai_Seo_Limits::normalize_title( $value );
		} elseif ( $field === 'excerpt' ) {
			$focus = Neo_Pulse_Wp_Ai_Context::read_focus_keyword( $post_id );
			$value = Neo_Pulse_Wp_Ai_Seo_Limits::normalize_description( $value, $focus );
		}

		$post = get_post( $post_id );
		if ( ! $post instanceof WP_Post ) {
			return new WP_Error( 'neo-pulse_post', __( 'Post not found.', 'neo-pulse-wp' ) );
		}

		$applied = self::write_field( $post_id, $field, $value );
		if ( is_wp_error( $applied ) ) {
			return $applied;
		}

		self::stamp_date_modifier( $post_id );

		return array(
			'ok'      => true,
			'applied' => $applied,
			'field'   => $field,
			'values'  => Neo_Pulse_Wp_Ai_Context::meta_hub_values( $post_id ),
		);
	}

	/**
	 * Save meta hub fields without counting as an optimization.
	 *
	 * @param array<string,string> $fields
	 * @param array<string, mixed> $options
	 * @return array<string,mixed>|WP_Error
	 */
	public static function save_meta( int $post_id, array $fields, array $options = array() ) {
		$post = get_post( $post_id );
		if ( ! $post instanceof WP_Post ) {
			return new WP_Error( 'neo-pulse_post', __( 'Post not found.', 'neo-pulse-wp' ) );
		}
		if ( ! current_user_can( 'edit_post', $post_id ) ) {
			return new WP_Error( 'neo-pulse_forbidden', __( 'You do not have permission to edit this post.', 'neo-pulse-wp' ) );
		}

		$map = array(
			'seoTitle'        => 'title',
			'metaDescription' => 'excerpt',
			'focusKeyword'    => 'focus_keyword',
			'seoResearch'     => 'seo_research',
			'faq'             => 'faq',
			'pageUrl'         => 'page_url',
			'dateModifier'    => 'date_modifier',
		);

		$seo_title_only = ! empty( $options['seo_title_only'] );

		$saved = array();
		foreach ( $map as $key => $field ) {
			if ( ! array_key_exists( $key, $fields ) ) {
				continue;
			}
			$value = trim( (string) $fields[ $key ] );
			if ( $value === '' ) {
				if ( ! Neo_Pulse_Wp_Ai_Fields::is_allowed( $field ) ) {
					continue;
				}
				$written = self::write_field( $post_id, $field, '' );
				if ( is_wp_error( $written ) ) {
					return $written;
				}
				$saved = array_merge( $saved, $written );
				continue;
			}
			if ( Neo_Pulse_Wp_Ai_Seo_Limits::is_placeholder_copy( $value ) ) {
				continue;
			}
			if ( $field === 'title' ) {
				$value = Neo_Pulse_Wp_Ai_Seo_Limits::normalize_title( $value );
			} elseif ( $field === 'excerpt' ) {
				$focus = Neo_Pulse_Wp_Ai_Context::read_focus_keyword( $post_id );
				$value = Neo_Pulse_Wp_Ai_Seo_Limits::normalize_description( $value, $focus );
			}
			if ( ! Neo_Pulse_Wp_Ai_Fields::is_allowed( $field ) ) {
				continue;
			}
			if ( $field === 'title' && $seo_title_only ) {
				$written = self::write_seo_title_only( $post_id, $value );
			} else {
				$written = self::write_field( $post_id, $field, $value );
			}
			if ( is_wp_error( $written ) ) {
				return $written;
			}
			$saved = array_merge( $saved, $written );
		}

		if ( $saved === array() ) {
			return new WP_Error( 'neo-pulse_empty', __( 'Nothing to save.', 'neo-pulse-wp' ) );
		}

		return array(
			'ok'     => true,
			'saved'  => array_values( array_unique( $saved ) ),
			'values' => Neo_Pulse_Wp_Ai_Context::meta_hub_values( $post_id ),
		);
	}

	/**
	 * @return array<int,string>|WP_Error
	 */
	public static function write_field( int $post_id, string $field, string $value ) {
		switch ( $field ) {
			case 'title':
				self::write_title( $post_id, $value );
				return array( 'title' );
			case 'excerpt':
				self::write_excerpt( $post_id, $value );
				return array( 'excerpt' );
			case 'focus_keyword':
				self::write_focus_keyword( $post_id, $value );
				return array( 'focus_keyword' );
			case 'seo_research':
				self::write_acf_or_meta( $post_id, 'seo_research', $value );
				self::maybe_sync_post_title_from_seo_research( $post_id, $value );
				return array( 'seo_research' );
			case 'faq':
				$key = Neo_Pulse_Wp_Ai_Context::resolve_write_key( $post_id, array( 'faq', 'seo_faq' ) );
				self::write_acf_or_meta( $post_id, $key, $value );
				return array( 'faq' );
			case 'page_url':
				self::write_acf_or_meta( $post_id, 'page_url', $value );
				return array( 'page_url' );
			case 'date_modifier':
				self::write_date_modifier( $post_id, $value );
				return array( 'date_modifier' );
			default:
				return new WP_Error( 'neo-pulse_field', __( 'Invalid field.', 'neo-pulse-wp' ) );
		}
	}

	public static function write_title( int $post_id, string $value ): void {
		wp_update_post(
			array(
				'ID'         => $post_id,
				'post_title' => $value,
			)
		);
		update_post_meta( $post_id, 'rank_math_title', $value );
	}

	/**
	 * @return array<int,string>
	 */
	public static function write_seo_title_only( int $post_id, string $value ): array {
		update_post_meta( $post_id, 'rank_math_title', $value );
		return array( 'title' );
	}

	public static function write_excerpt( int $post_id, string $value ): void {
		wp_update_post(
			array(
				'ID'           => $post_id,
				'post_excerpt' => $value,
			)
		);
		update_post_meta( $post_id, 'rank_math_description', $value );
	}

	public static function write_focus_keyword( int $post_id, string $value ): void {
		update_post_meta( $post_id, 'rank_math_focus_keyword', $value );
		update_post_meta( $post_id, '_neo_pulse_focus_keyword', $value );
		self::write_acf_or_meta( $post_id, 'keyword_focus', $value );
	}

	public static function write_acf_or_meta( int $post_id, string $key, string $value ): void {
		if ( function_exists( 'update_field' ) ) {
			update_field( $key, $value, $post_id );
		}
		update_post_meta( $post_id, $key, $value );
	}

	public static function stamp_date_modifier( int $post_id ): void {
		self::write_date_modifier( $post_id, gmdate( 'Y-m-d' ) );
	}

	public static function write_date_modifier( int $post_id, string $value ): void {
		$value = trim( $value );
		if ( $value === '' ) {
			return;
		}
		if ( ! preg_match( '/^\d{4}-\d{2}-\d{2}$/', $value ) ) {
			$ts = strtotime( $value );
			$value = $ts ? gmdate( 'Y-m-d', $ts ) : gmdate( 'Y-m-d' );
		}
		self::write_acf_or_meta( $post_id, 'date_modifier', $value );
	}

	/**
	 * When SEO research title matches this post's keyword and post_title does not, write the research title.
	 */
	public static function maybe_sync_post_title_from_seo_research( int $post_id, string $research_json = '' ): void {
		if ( $research_json === '' ) {
			$research_json = Neo_Pulse_Wp_Ai_Context::read_acf_or_meta( $post_id, array( 'seo_research' ) );
		}
		$decoded = json_decode( $research_json, true );
		if ( ! is_array( $decoded ) ) {
			return;
		}
		$research_title = trim( (string) ( $decoded['title'] ?? '' ) );
		$primary        = trim( (string) ( $decoded['primary_keyword'] ?? '' ) );
		if ( $research_title === '' || $primary === '' ) {
			return;
		}
		$focus = Neo_Pulse_Wp_Ai_Context::read_focus_keyword( $post_id );
		$check = $focus !== '' ? $focus : $primary;
		if ( ! self::title_covers_keyword( $research_title, $check ) && ! self::title_covers_keyword( $research_title, $primary ) ) {
			return;
		}
		$post = get_post( $post_id );
		if ( ! $post instanceof WP_Post ) {
			return;
		}
		if ( self::title_covers_keyword( (string) $post->post_title, $check ) ) {
			return;
		}
		self::write_title( $post_id, Neo_Pulse_Wp_Ai_Seo_Limits::normalize_title( $research_title ) );
	}

	public static function title_covers_keyword( string $title, string $keyword ): bool {
		$tokens = self::keyword_content_tokens( $keyword );
		if ( $tokens === array() ) {
			return true;
		}
		$hay = strtolower( $title );
		foreach ( $tokens as $w ) {
			if ( strpos( $hay, $w ) === false ) {
				return false;
			}
		}
		return true;
	}

	/**
	 * @return array<int,string>
	 */
	private static function keyword_content_tokens( string $phrase ): array {
		$stop = array( 'a' => true, 'an' => true, 'and' => true, 'for' => true, 'how' => true, 'in' => true, 'is' => true, 'of' => true, 'on' => true, 'or' => true, 'the' => true, 'to' => true, 'what' => true, 'why' => true );
		$parts = preg_split( '/\s+/', strtolower( $phrase ) );
		if ( ! is_array( $parts ) ) {
			return array();
		}
		$out = array();
		foreach ( $parts as $w ) {
			$w = preg_replace( '/[^a-z0-9]+/', '', $w );
			if ( ! is_string( $w ) || strlen( $w ) < 2 || isset( $stop[ $w ] ) ) {
				continue;
			}
			$out[] = $w;
		}
		return $out;
	}
}
