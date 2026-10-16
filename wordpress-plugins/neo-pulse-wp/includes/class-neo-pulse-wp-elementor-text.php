<?php
/**
 * Plain text from Elementor data: page body text for RAG and legacy
 * "neo-pulse_seo_section" widget slots (the SEO Block Builder library was removed).
 *
 * @package Neo_Pulse_Wp
 */

defined( 'ABSPATH' ) || exit;

class Neo_Pulse_Wp_Elementor_Text {

	const PAGE_BODY_MAX = 12000;

	const SLOT_TYPES = array( 'h2', 'paragraph', 'cta', 'image', 'list' );

	/**
	 * Plain-text page body for RAG (Elementor widgets + post_content fallback).
	 */
	public static function extract_page_body_text( int $post_id ): string {
		if ( $post_id < 1 ) {
			return '';
		}

		$chunks = array();
		$raw    = get_post_meta( $post_id, '_elementor_data', true );
		if ( is_string( $raw ) && $raw !== '' ) {
			$data = json_decode( $raw, true );
			if ( is_array( $data ) ) {
				$parts = array();
				self::walk_body_text_elements( $data, $parts );
				$parts = array_values( array_unique( array_filter( array_map( 'trim', $parts ) ) ) );
				if ( $parts !== array() ) {
					$chunks[] = implode( "\n", $parts );
				}
			}
		}

		$post = get_post( $post_id );
		if ( $post instanceof WP_Post && is_string( $post->post_content ) && trim( $post->post_content ) !== '' ) {
			$plain = trim( (string) preg_replace( '/\s+/', ' ', wp_strip_all_tags( $post->post_content ) ) );
			if ( $plain !== '' ) {
				$chunks[] = $plain;
			}
		}

		$text = trim( implode( "\n\n", array_unique( array_filter( $chunks ) ) ) );
		if ( strlen( $text ) > self::PAGE_BODY_MAX ) {
			$text = substr( $text, 0, self::PAGE_BODY_MAX ) . '…';
		}
		return $text;
	}

	/**
	 * Parse a legacy neo-pulse_seo_section widget's "content_slots" repeater into normalized slots.
	 *
	 * @param array<string,mixed> $settings Elementor widget settings.
	 * @return array<int,array<string,mixed>>
	 */
	public static function slots_from_settings( array $settings ): array {
		$raw = isset( $settings['content_slots'] ) && is_array( $settings['content_slots'] ) ? $settings['content_slots'] : array();
		$out = array();
		foreach ( $raw as $slot ) {
			if ( ! is_array( $slot ) ) {
				continue;
			}
			$mapped = array(
				'type'    => (string) ( $slot['type'] ?? '' ),
				'_id'     => (string) ( $slot['_id'] ?? '' ),
				'align_h' => (string) ( $slot['align_h'] ?? 'left' ),
				'align_v' => 'middle',
			);
			switch ( $mapped['type'] ) {
				case 'h2':
					$mapped['text']          = (string) ( $slot['text'] ?? '' );
					$mapped['heading_level'] = absint( $slot['heading_level'] ?? 2 );
					break;
				case 'paragraph':
					$mapped['html'] = (string) ( $slot['html'] ?? '' );
					break;
				case 'cta':
					$mapped['label'] = (string) ( $slot['label'] ?? '' );
					$mapped['url']   = isset( $slot['url'] ) && is_array( $slot['url'] ) ? (string) ( $slot['url']['url'] ?? '' ) : (string) ( $slot['url'] ?? '' );
					$mapped['style'] = (string) ( $slot['style'] ?? 'primary' );
					break;
				case 'image':
					$media                   = isset( $slot['attachment_id'] ) && is_array( $slot['attachment_id'] ) ? $slot['attachment_id'] : array();
					$mapped['attachment_id'] = absint( $media['id'] ?? $slot['attachment_id'] ?? 0 );
					$mapped['alt']           = (string) ( $slot['alt'] ?? '' );
					break;
				case 'list':
					$mapped['style'] = (string) ( $slot['list_style'] ?? $slot['style'] ?? 'bullet' );
					$mapped['html']  = (string) ( $slot['html'] ?? '' );
					$items_raw       = is_string( $slot['items'] ?? null ) ? (string) $slot['items'] : '';
					$mapped['items'] = array_values(
						array_filter(
							array_map( 'trim', preg_split( '/\r\n|\r|\n/', $items_raw ) ?: array() ),
							static function ( $item ) {
								return $item !== '';
							}
						)
					);
					break;
			}
			$normalized = self::normalize_slot( $mapped );
			if ( $normalized ) {
				$out[] = $normalized;
			}
		}
		return $out;
	}

	/**
	 * @param array<int,array<string,mixed>> $elements
	 * @param array<int,string>              $parts
	 */
	private static function walk_body_text_elements( array $elements, array &$parts ): void {
		foreach ( $elements as $element ) {
			if ( ! is_array( $element ) ) {
				continue;
			}
			if ( (string) ( $element['elType'] ?? '' ) === 'widget' ) {
				$settings = isset( $element['settings'] ) && is_array( $element['settings'] ) ? $element['settings'] : array();
				$snippet  = self::widget_body_text( (string) ( $element['widgetType'] ?? '' ), $settings );
				if ( $snippet !== '' ) {
					$parts[] = $snippet;
				}
			}
			if ( ! empty( $element['elements'] ) && is_array( $element['elements'] ) ) {
				self::walk_body_text_elements( $element['elements'], $parts );
			}
		}
	}

	/**
	 * @param array<string,mixed> $settings
	 */
	private static function widget_body_text( string $widget_type, array $settings ): string {
		switch ( $widget_type ) {
			case 'heading':
				if ( ! empty( $settings['title'] ) ) {
					return wp_strip_all_tags( (string) $settings['title'] );
				}
				break;
			case 'text-editor':
			case 'text':
				if ( ! empty( $settings['editor'] ) ) {
					return self::plain( (string) $settings['editor'] );
				}
				break;
			case 'theme-post-content':
				if ( ! empty( $settings['content'] ) ) {
					return self::plain( (string) $settings['content'] );
				}
				break;
			case 'neo-pulse_seo_section':
				$lines = array();
				foreach ( self::slots_from_settings( $settings ) as $slot ) {
					$type = (string) ( $slot['type'] ?? '' );
					if ( $type === 'h2' && ! empty( $slot['text'] ) ) {
						$lines[] = (string) $slot['text'];
					} elseif ( $type === 'paragraph' && ! empty( $slot['html'] ) ) {
						$lines[] = self::plain( (string) $slot['html'] );
					} elseif ( $type === 'list' ) {
						if ( ! empty( $slot['html'] ) ) {
							$lines[] = self::plain( (string) $slot['html'] );
						} elseif ( ! empty( $slot['items'] ) && is_array( $slot['items'] ) ) {
							$lines[] = implode( '; ', array_map( 'strval', $slot['items'] ) );
						}
					} elseif ( $type === 'cta' && ! empty( $slot['label'] ) ) {
						$lines[] = (string) $slot['label'];
					}
				}
				return implode( "\n", array_filter( $lines ) );
		}
		return '';
	}

	private static function plain( string $html ): string {
		return trim( (string) preg_replace( '/\s+/', ' ', wp_strip_all_tags( $html ) ) );
	}

	/**
	 * @param array<string,mixed> $slot
	 * @return array<string,mixed>|null
	 */
	private static function normalize_slot( array $slot ): ?array {
		$type = sanitize_key( (string) ( $slot['type'] ?? '' ) );
		if ( ! in_array( $type, self::SLOT_TYPES, true ) ) {
			return null;
		}

		$base = array( 'type' => $type );
		if ( ! empty( $slot['_id'] ) ) {
			$base['_id'] = sanitize_key( (string) $slot['_id'] );
		}

		switch ( $type ) {
			case 'h2':
				$base['text']          = sanitize_text_field( (string) ( $slot['text'] ?? '' ) );
				$level                 = absint( $slot['heading_level'] ?? 2 );
				$base['heading_level'] = ( $level >= 1 && $level <= 6 ) ? $level : 2;
				break;
			case 'paragraph':
				$base['html'] = wp_kses_post( (string) ( $slot['html'] ?? $slot['text'] ?? '' ) );
				break;
			case 'cta':
				$base['label'] = sanitize_text_field( (string) ( $slot['label'] ?? '' ) );
				$base['url']   = esc_url_raw( (string) ( $slot['url'] ?? '' ) );
				$style         = sanitize_key( (string) ( $slot['style'] ?? 'primary' ) );
				$base['style'] = in_array( $style, array( 'primary', 'secondary', 'outline' ), true ) ? $style : 'primary';
				break;
			case 'image':
				$base['attachment_id'] = absint( $slot['attachment_id'] ?? $slot['id'] ?? 0 );
				$base['alt']           = sanitize_text_field( (string) ( $slot['alt'] ?? '' ) );
				break;
			case 'list':
				$html = (string) ( $slot['html'] ?? '' );
				if ( $html !== '' ) {
					$base['html'] = wp_kses_post( $html );
				}
				$style         = sanitize_key( (string) ( $slot['style'] ?? 'bullet' ) );
				$base['style'] = in_array( $style, array( 'bullet', 'number' ), true ) ? $style : 'bullet';
				$items         = isset( $slot['items'] ) && is_array( $slot['items'] ) ? $slot['items'] : array();
				$base['items'] = array_values(
					array_filter(
						array_map(
							static function ( $item ) {
								return sanitize_text_field( (string) $item );
							},
							$items
						),
						static function ( $item ) {
							return $item !== '';
						}
					)
				);
				break;
		}

		$align_h         = sanitize_key( (string) ( $slot['align_h'] ?? 'left' ) );
		$base['align_h'] = in_array( $align_h, array( 'left', 'center', 'right' ), true ) ? $align_h : 'left';
		$align_v         = sanitize_key( (string) ( $slot['align_v'] ?? 'middle' ) );
		$base['align_v'] = in_array( $align_v, array( 'top', 'middle', 'bottom' ), true ) ? $align_v : 'middle';

		return $base;
	}
}
