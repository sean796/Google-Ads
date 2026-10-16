<?php
/**
 * Pre-stripped markdown source for template page cards (summarize / tell-me-about).
 *
 * @package Neo_Pulse_Wp
 */

defined( 'ABSPATH' ) || exit;

class Neo_Pulse_Wp_Chat_Page_Summary {

	const SUMMARY_MD_MAX   = 3500;
	const CACHE_PREFIX     = 'neo_pulse_chat_summary_md_';
	const CACHE_TTL        = 3600;

	/** @var array<int,string> */
	private static $skip_widgets = array(
		'spacer',
		'divider',
		'image',
		'image-box',
		'image-carousel',
		'video',
		'google_maps',
		'menu-anchor',
		'template',
		'social-icons',
		'star-rating',
	);

	public static function read_markdown( int $post_id ): string {
		if ( $post_id < 1 ) {
			return '';
		}

		$post = get_post( $post_id );
		if ( ! $post instanceof WP_Post || (string) $post->post_password !== '' ) {
			return ''; // Password-protected content never reaches the chat.
		}

		$cache_key = self::CACHE_PREFIX . $post_id . '_' . md5( (string) $post->post_modified_gmt );
		$cached    = get_transient( $cache_key );
		if ( is_string( $cached ) && $cached !== '' ) {
			return $cached;
		}

		$markdown = self::build_markdown( $post_id, $post );
		if ( $markdown !== '' ) {
			set_transient( $cache_key, $markdown, self::CACHE_TTL );
		}

		return $markdown;
	}

	private static function build_markdown( int $post_id, WP_Post $post ): string {
		$lines = self::markdown_from_elementor( $post_id );
		if ( empty( $lines ) ) {
			$html = Neo_Pulse_Wp_Rest::get_rendered_content_html( $post_id );
			if ( $html !== '' ) {
				$lines = self::markdown_lines_from_html( $html );
			}
		}

		if ( empty( $lines ) && is_string( $post->post_content ) && trim( $post->post_content ) !== '' ) {
			$lines = self::markdown_lines_from_html( (string) $post->post_content );
		}

		$text = self::finalize_markdown( $lines );
		if ( $text === '' ) {
			return '';
		}

		if ( strlen( $text ) > self::SUMMARY_MD_MAX ) {
			$text = substr( $text, 0, self::SUMMARY_MD_MAX ) . '…';
		}

		return $text;
	}

	/**
	 * @return array<int,string>
	 */
	private static function markdown_from_elementor( int $post_id ): array {
		$raw = get_post_meta( $post_id, '_elementor_data', true );
		if ( ! is_string( $raw ) || $raw === '' ) {
			return array();
		}

		$data = json_decode( $raw, true );
		if ( ! is_array( $data ) ) {
			return array();
		}

		$lines = array();
		self::walk_elementor_elements( $data, $lines );
		return $lines;
	}

	/**
	 * @param array<int,array<string,mixed>> $elements
	 * @param array<int,string>             $lines
	 */
	private static function walk_elementor_elements( array $elements, array &$lines ): void {
		foreach ( $elements as $element ) {
			if ( ! is_array( $element ) ) {
				continue;
			}

			$el_type  = (string) ( $element['elType'] ?? '' );
			$settings = isset( $element['settings'] ) && is_array( $element['settings'] ) ? $element['settings'] : array();

			if ( $el_type === 'widget' ) {
				$widget_type = (string) ( $element['widgetType'] ?? '' );
				if ( ! in_array( $widget_type, self::$skip_widgets, true ) ) {
					$snippet_lines = self::widget_to_markdown_lines( $widget_type, $settings );
					foreach ( $snippet_lines as $line ) {
						if ( $line !== '' ) {
							$lines[] = $line;
						}
					}
				}
			}

			if ( ! empty( $element['elements'] ) && is_array( $element['elements'] ) ) {
				self::walk_elementor_elements( $element['elements'], $lines );
			}
		}
	}

	/**
	 * @param array<string,mixed> $settings
	 * @return array<int,string>
	 */
	private static function widget_to_markdown_lines( string $widget_type, array $settings ): array {
		switch ( $widget_type ) {
			case 'heading':
				if ( empty( $settings['title'] ) ) {
					return array();
				}
				$prefix = self::heading_prefix( (string) ( $settings['header_size'] ?? 'h2' ) );
				return array( $prefix . wp_strip_all_tags( (string) $settings['title'] ) );

			case 'text-editor':
			case 'text':
				if ( empty( $settings['editor'] ) ) {
					return array();
				}
				return self::markdown_lines_from_html( (string) $settings['editor'] );

			case 'theme-post-content':
				if ( empty( $settings['content'] ) ) {
					return array();
				}
				return self::markdown_lines_from_html( (string) $settings['content'] );

			case 'icon-list':
				return self::icon_list_to_markdown_lines( $settings );

			case 'icon-box':
				return self::icon_box_to_markdown_lines( $settings );

			case 'button':
				return self::button_to_markdown_lines( $settings );

			case 'neo-pulse_seo_section':
				return self::seo_section_to_markdown_lines( $settings );
		}

		return array();
	}

	/**
	 * @param array<string,mixed> $settings
	 * @return array<int,string>
	 */
	private static function icon_list_to_markdown_lines( array $settings ): array {
		$items = isset( $settings['icon_list'] ) && is_array( $settings['icon_list'] ) ? $settings['icon_list'] : array();
		if ( empty( $items ) ) {
			return array();
		}

		$lines = array();
		foreach ( $items as $item ) {
			if ( ! is_array( $item ) ) {
				continue;
			}
			$text = trim( wp_strip_all_tags( (string) ( $item['text'] ?? '' ) ) );
			if ( $text === '' ) {
				continue;
			}
			$url = self::elementor_link_url( $item['link'] ?? null );
			$lines[] = $url !== '' ? '- [' . $text . '](' . $url . ')' : '- ' . $text;
		}

		return $lines;
	}

	/**
	 * @param array<string,mixed> $settings
	 * @return array<int,string>
	 */
	private static function icon_box_to_markdown_lines( array $settings ): array {
		$title = trim( wp_strip_all_tags( (string) ( $settings['title_text'] ?? '' ) ) );
		$desc  = trim( wp_strip_all_tags( (string) ( $settings['description_text'] ?? '' ) ) );
		if ( $title === '' && $desc === '' ) {
			return array();
		}

		$url = self::elementor_link_url( $settings['link'] ?? null );
		if ( $title !== '' ) {
			$line = $url !== '' ? '### [' . $title . '](' . $url . ')' : '### ' . $title;
			if ( $desc !== '' ) {
				$line .= "\n" . $desc;
			}
			return array( $line );
		}

		return $desc !== '' ? array( $desc ) : array();
	}

	/**
	 * @param array<string,mixed> $settings
	 * @return array<int,string>
	 */
	private static function button_to_markdown_lines( array $settings ): array {
		$label = trim( wp_strip_all_tags( (string) ( $settings['text'] ?? '' ) ) );
		if ( $label === '' ) {
			return array();
		}
		$url = self::elementor_link_url( $settings['link'] ?? null );
		return array( $url !== '' ? '- [' . $label . '](' . $url . ')' : '- ' . $label );
	}

	/**
	 * @param mixed $link
	 */
	private static function elementor_link_url( $link ): string {
		if ( ! is_array( $link ) || empty( $link['url'] ) ) {
			return '';
		}
		$url = esc_url_raw( (string) $link['url'] );
		return is_string( $url ) ? $url : '';
	}

	/**
	 * @param array<string,mixed> $settings
	 * @return array<int,string>
	 */
	private static function seo_section_to_markdown_lines( array $settings ): array {
		$slots = Neo_Pulse_Wp_Elementor_Text::slots_from_settings( $settings );
		$lines = array();

		foreach ( $slots as $slot ) {
			$type = (string) ( $slot['type'] ?? '' );
			if ( $type === 'h2' && ! empty( $slot['text'] ) ) {
				$level   = absint( $slot['heading_level'] ?? 2 );
				$prefix  = self::heading_prefix( 'h' . max( 2, min( 6, $level ) ) );
				$lines[] = $prefix . trim( (string) $slot['text'] );
			} elseif ( $type === 'paragraph' && ! empty( $slot['html'] ) ) {
				foreach ( self::markdown_lines_from_html( (string) $slot['html'] ) as $line ) {
					$lines[] = $line;
				}
			} elseif ( $type === 'list' ) {
				if ( ! empty( $slot['html'] ) ) {
					foreach ( self::list_html_to_markdown_lines( (string) $slot['html'], (string) ( $slot['style'] ?? 'bullet' ) ) as $line ) {
						$lines[] = $line;
					}
				} elseif ( ! empty( $slot['items'] ) && is_array( $slot['items'] ) ) {
					$style = (string) ( $slot['style'] ?? 'bullet' );
					$i     = 0;
					foreach ( $slot['items'] as $item ) {
						$text = trim( wp_strip_all_tags( (string) $item ) );
						if ( $text === '' ) {
							continue;
						}
						++$i;
						$lines[] = $style === 'number' ? ( $i . '. ' . $text ) : ( '- ' . $text );
					}
				}
			} elseif ( $type === 'cta' && ! empty( $slot['label'] ) ) {
				$label = trim( (string) $slot['label'] );
				$url   = trim( (string) ( $slot['url'] ?? '' ) );
				$lines[] = $url !== '' ? '- [' . $label . '](' . $url . ')' : '- ' . $label;
			}
		}

		return $lines;
	}

	private static function heading_prefix( string $tag ): string {
		$tag = strtolower( trim( $tag ) );
		if ( $tag === 'h1' || $tag === 'h2' ) {
			return '## ';
		}
		if ( $tag === 'h3' || $tag === 'h4' || $tag === 'h5' || $tag === 'h6' ) {
			return '### ';
		}
		return '### ';
	}

	/**
	 * @return array<int,string>
	 */
	private static function markdown_lines_from_html( string $html ): array {
		$html = trim( $html );
		if ( $html === '' ) {
			return array();
		}

		if ( ! str_contains( $html, '<' ) ) {
			$plain = trim( preg_replace( '/\s+/', ' ', wp_strip_all_tags( $html ) ) );
			return $plain !== '' ? array( $plain ) : array();
		}

		$converted = self::html_to_summary_markdown( $html );
		if ( $converted === '' ) {
			return array();
		}

		$lines = array();
		foreach ( preg_split( '/\r\n|\r|\n/', $converted ) as $line ) {
			$line = trim( (string) $line );
			if ( $line !== '' ) {
				$lines[] = $line;
			}
		}

		return $lines;
	}

	/**
	 * @return array<int,string>
	 */
	private static function list_html_to_markdown_lines( string $html, string $style ): array {
		$lines = array();
		if ( preg_match_all( '/<li[^>]*>(.*?)<\/li>/is', $html, $matches ) ) {
			$i = 0;
			foreach ( $matches[1] as $item_html ) {
				$text = trim( preg_replace( '/\s+/', ' ', wp_strip_all_tags( (string) $item_html ) ) );
				if ( $text === '' ) {
					continue;
				}
				++$i;
				$lines[] = $style === 'number' ? ( $i . '. ' . $text ) : ( '- ' . $text );
			}
		}

		if ( ! empty( $lines ) ) {
			return $lines;
		}

		$plain = trim( preg_replace( '/\s+/', ' ', wp_strip_all_tags( $html ) ) );
		return $plain !== '' ? array( '- ' . $plain ) : array();
	}

	public static function html_to_summary_markdown( string $html ): string {
		$html = trim( $html );
		if ( $html === '' ) {
			return '';
		}

		$html = preg_replace( '/<(script|style)[^>]*>.*?<\/\1>/is', '', $html );
		$html = preg_replace( '/<!--.*?-->/s', '', (string) $html );

		$replacements = array(
			'/<h1[^>]*>(.*?)<\/h1>/is' => "## $1\n\n",
			'/<h2[^>]*>(.*?)<\/h2>/is' => "## $1\n\n",
			'/<h3[^>]*>(.*?)<\/h3>/is' => "### $1\n\n",
			'/<h4[^>]*>(.*?)<\/h4>/is' => "### $1\n\n",
			'/<h5[^>]*>(.*?)<\/h5>/is' => "### $1\n\n",
			'/<h6[^>]*>(.*?)<\/h6>/is' => "### $1\n\n",
			'/<br\s*\/?>/i'             => "\n",
			'/<\/p>/i'                  => "\n\n",
			'/<\/li>/i'                 => "\n",
			'/<li[^>]*>/i'              => '- ',
			'/<\/ul>/i'                 => "\n",
			'/<\/ol>/i'                 => "\n",
		);

		foreach ( $replacements as $pattern => $replacement ) {
			$html = preg_replace( $pattern, $replacement, (string) $html );
		}

		$html = preg_replace_callback(
			'/<a[^>]+href=["\']([^"\']+)["\'][^>]*>(.*?)<\/a>/is',
			function ( array $match ) {
				$label = trim( preg_replace( '/\s+/', ' ', wp_strip_all_tags( (string) $match[2] ) ) );
				$url   = trim( (string) $match[1] );
				if ( $label === '' || $url === '' ) {
					return $label;
				}
				return '[' . $label . '](' . $url . ')';
			},
			(string) $html
		);

		$text = wp_strip_all_tags( (string) $html );
		$text = html_entity_decode( $text, ENT_QUOTES | ENT_HTML5, 'UTF-8' );
		$text = preg_replace( "/[ \t]+/", ' ', (string) $text );
		$text = preg_replace( "/\n{3,}/", "\n\n", (string) $text );

		return trim( (string) $text );
	}

	/**
	 * @param array<int,string> $lines
	 */
	private static function finalize_markdown( array $lines ): string {
		$out      = array();
		$previous = '';

		foreach ( $lines as $line ) {
			$line = trim( (string) $line );
			if ( $line === '' || $line === $previous ) {
				continue;
			}
			$out[]    = $line;
			$previous = $line;
		}

		return trim( implode( "\n", $out ) );
	}
}
