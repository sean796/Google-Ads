<?php
/**
 * Video schema for new posts: finds YouTube and Vimeo videos embedded in the content (embed blocks,
 * iframes, auto-embedded URLs and Elementor video widgets; not plain links) and stores VideoObject schema the way Rank Math Pro's
 * "Autodetect Video" did (rank_math_schema_VideoObject meta), so the schema output, the
 * side-by-side check and older posts all work the same.
 *
 * Follows Rank Math's per post type setting pt_{type}_autodetect_video. Runs only while Neo Pulse
 * SEO is live (while Rank Math is active it does this itself).
 *
 * @package Neo_Pulse_Wp
 */

defined( 'ABSPATH' ) || exit;

class Neo_Pulse_Wp_Seo_Video {

	const META = 'rank_math_schema_VideoObject';

	public static function init(): void {
		if ( ! Neo_Pulse_Wp_Seo_Settings::output_active() ) {
			return;
		}
		add_action( 'save_post', array( __CLASS__, 'on_save' ), 30, 2 );
		// Elementor saves its data after save_post.
		add_action( 'elementor/document/after_save', array( __CLASS__, 'on_elementor_save' ), 30, 1 );
	}

	public static function enabled_for( string $post_type ): bool {
		return Neo_Pulse_Wp_Seo_Settings::on( Neo_Pulse_Wp_Seo_Settings::get( 'pt_' . $post_type . '_autodetect_video', 'off' ) );
	}

	/**
	 * @param int     $post_id Post ID.
	 * @param WP_Post $post    Post.
	 */
	public static function on_save( $post_id, $post ): void {
		if ( ! $post instanceof WP_Post || wp_is_post_revision( $post ) || wp_is_post_autosave( $post ) ) {
			return;
		}
		self::sync( $post );
	}

	/**
	 * @param mixed $document Elementor document.
	 */
	public static function on_elementor_save( $document ): void {
		if ( is_object( $document ) && method_exists( $document, 'get_main_id' ) ) {
			$post = get_post( (int) $document->get_main_id() );
			if ( $post instanceof WP_Post ) {
				self::sync( $post );
			}
		}
	}

	/**
	 * Add schema for videos the post does not have yet. Existing schema is never changed or removed.
	 *
	 * @return int Videos added.
	 */
	public static function sync( WP_Post $post ): int {
		if ( 'publish' !== $post->post_status || ! self::enabled_for( $post->post_type ) ) {
			return 0;
		}
		if ( 'off' === (string) get_post_meta( $post->ID, 'rank_math_rich_snippet', true ) ) {
			return 0;
		}
		$found = self::find_videos( $post );
		if ( $found === array() ) {
			return 0;
		}
		$known = array();
		foreach ( get_post_meta( $post->ID ) as $key => $values ) {
			if ( self::META !== $key ) {
				continue;
			}
			foreach ( (array) $values as $value ) {
				$schema = maybe_unserialize( $value );
				if ( is_array( $schema ) && ! empty( $schema['embedUrl'] ) ) {
					$known[ self::normalise( (string) $schema['embedUrl'] ) ] = true;
				}
			}
		}
		$added = 0;
		foreach ( $found as $video ) {
			if ( isset( $known[ $video['embed'] ] ) ) {
				continue;
			}
			if ( strpos( $video['thumb'], 'vimeo:' ) === 0 ) {
				$video['thumb'] = self::vimeo_thumbnail( substr( $video['thumb'], 6 ), $post );
			}
			if ( $video['thumb'] === '' ) {
				continue;
			}
			add_post_meta( $post->ID, self::META, self::schema( $video ) );
			$known[ $video['embed'] ] = true;
			++$added;
		}
		return $added;
	}

	/**
	 * Videos actually embedded in the post: iframes / embed tags, embed blocks and [embed]
	 * shortcodes, a video URL on a line or paragraph of its own (WordPress turns those into players),
	 * and Elementor video widgets. A plain link to a video is not an embedded video.
	 *
	 * @return array<int, array{embed: string, thumb: string}>
	 */
	public static function find_videos( WP_Post $post ): array {
		$sources   = self::embedded_sources( (string) $post->post_content );
		$elementor = get_post_meta( $post->ID, '_elementor_data', true );
		if ( is_string( $elementor ) && $elementor !== '' ) {
			$data = json_decode( $elementor, true );
			if ( is_array( $data ) ) {
				self::walk_elementor( $data, $sources );
			}
		}
		return self::videos_in( implode( "\n", array_unique( $sources ) ) );
	}

	/**
	 * Video addresses from HTML / block markup that render as players.
	 *
	 * @return array<int, string>
	 */
	public static function embedded_sources( string $html ): array {
		$out = array();
		if ( $html === '' ) {
			return $out;
		}
		if ( preg_match_all( '#<(?:iframe|embed)\b[^>]*?\bsrc\s*=\s*["\']([^"\']+)["\']#i', $html, $m ) ) {
			$out = array_merge( $out, $m[1] );
		}
		if ( preg_match_all( '#<object\b[^>]*?\bdata\s*=\s*["\']([^"\']+)["\']#i', $html, $m ) ) {
			$out = array_merge( $out, $m[1] );
		}
		// Block editor embeds: <!-- wp:embed {"url":"…"} --> (and the older core-embed/* names).
		if ( preg_match_all( '#<!--\s+wp:(?:core-)?embed(?:/[a-z0-9-]+)?\s+(\{.*?\})\s+/?-->#s', $html, $m ) ) {
			foreach ( $m[1] as $json ) {
				$attrs = json_decode( $json, true );
				if ( is_array( $attrs ) && ! empty( $attrs['url'] ) && is_string( $attrs['url'] ) ) {
					$out[] = $attrs['url'];
				}
			}
		}
		if ( preg_match_all( '#\[embed[^\]]*\]\s*(\S+?)\s*\[/embed\]#i', $html, $m ) ) {
			$out = array_merge( $out, $m[1] );
		}
		// A URL alone on its line or in its own paragraph is auto-embedded by WordPress.
		if ( preg_match_all( '#^\s*(?:<p[^>]*>\s*)?(https?://[^\s<>"\']+)\s*(?:</p>)?\s*$#mi', $html, $m ) ) {
			$out = array_merge( $out, $m[1] );
		}
		return $out;
	}

	/**
	 * @param array<int|string, mixed> $elements Elementor elements.
	 * @param array<int, string>       $out      Collected video addresses.
	 */
	private static function walk_elementor( array $elements, array &$out ): void {
		foreach ( $elements as $element ) {
			if ( ! is_array( $element ) ) {
				continue;
			}
			$type     = (string) ( $element['widgetType'] ?? '' );
			$settings = isset( $element['settings'] ) && is_array( $element['settings'] ) ? $element['settings'] : array();
			if ( 'video' === $type ) {
				// Only the source the widget is set to play (YouTube by default).
				$kind = (string) ( $settings['video_type'] ?? 'youtube' );
				$url  = $settings[ $kind . '_url' ] ?? '';
				if ( is_string( $url ) && $url !== '' ) {
					$out[] = $url;
				}
			} elseif ( in_array( $type, array( 'e-youtube', 'video-playlist' ), true ) ) {
				$out = array_merge( $out, self::strings_in( $settings ) );
			} elseif ( $settings !== array() ) {
				// Text, HTML and similar widgets: only players in their markup count.
				foreach ( self::strings_in( $settings ) as $value ) {
					if ( strpos( $value, '<' ) !== false || strpos( $value, '[embed' ) !== false ) {
						$out = array_merge( $out, self::embedded_sources( $value ) );
					}
				}
			}
			// Background videos on sections and containers are decoration, not content: never read.
			if ( isset( $element['elements'] ) && is_array( $element['elements'] ) ) {
				self::walk_elementor( $element['elements'], $out );
			}
		}
	}

	/**
	 * @param array<int|string, mixed> $value Settings.
	 * @return array<int, string>
	 */
	private static function strings_in( array $value ): array {
		$out = array();
		foreach ( $value as $key => $item ) {
			if ( is_string( $key ) && strpos( $key, 'background' ) === 0 ) {
				continue;
			}
			if ( is_string( $item ) ) {
				$out[] = $item;
			} elseif ( is_array( $item ) ) {
				$out = array_merge( $out, self::strings_in( $item ) );
			}
		}
		return $out;
	}

	/**
	 * YouTube and Vimeo videos in a list of embedded addresses.
	 *
	 * @return array<int, array{embed: string, thumb: string}>
	 */
	private static function videos_in( string $haystack ): array {
		$out = array();
		if ( preg_match_all( '#(?:youtube(?:-nocookie)?\.com/(?:watch\?(?:[^"\'\s<>]*&)?v=|embed/|shorts/|live/|v/)|youtu\.be/)([A-Za-z0-9_-]{11})#i', $haystack, $m ) ) {
			foreach ( array_unique( $m[1] ) as $id ) {
				if ( in_array( strtolower( $id ), array( 'videoseries', 'live_stream' ), true ) ) {
					continue;
				}
				$out[] = array(
					'embed' => 'https://www.youtube.com/embed/' . $id,
					'thumb' => 'https://i.ytimg.com/vi/' . $id . '/hqdefault.jpg',
				);
			}
		}
		if ( preg_match_all( '#(?:player\.)?vimeo\.com/(?:video/)?([0-9]{6,12})#i', $haystack, $m ) ) {
			foreach ( array_unique( $m[1] ) as $id ) {
				$out[] = array(
					'embed' => 'https://player.vimeo.com/video/' . $id,
					'thumb' => 'vimeo:' . $id,
				);
			}
		}
		return $out;
	}

	/**
	 * Vimeo's own thumbnail (oEmbed), else the featured image, else '' (the video is then skipped:
	 * Google requires a thumbnail).
	 */
	private static function vimeo_thumbnail( string $id, WP_Post $post ): string {
		$response = wp_remote_get( 'https://vimeo.com/api/oembed.json?url=' . rawurlencode( 'https://vimeo.com/' . $id ), array( 'timeout' => 4 ) );
		if ( ! is_wp_error( $response ) && 200 === (int) wp_remote_retrieve_response_code( $response ) ) {
			$data = json_decode( (string) wp_remote_retrieve_body( $response ), true );
			if ( is_array( $data ) && ! empty( $data['thumbnail_url'] ) ) {
				return esc_url_raw( (string) $data['thumbnail_url'] );
			}
		}
		return has_post_thumbnail( $post ) ? '%post_thumbnail%' : '';
	}

	private static function normalise( string $url ): string {
		if ( preg_match( '#(?:youtube(?:-nocookie)?\.com/embed/|youtu\.be/|[?&]v=)([A-Za-z0-9_-]{11})#', $url, $m ) ) {
			return 'https://www.youtube.com/embed/' . $m[1];
		}
		if ( preg_match( '#vimeo\.com/(?:video/)?([0-9]{6,12})#', $url, $m ) ) {
			return 'https://player.vimeo.com/video/' . $m[1];
		}
		return $url;
	}

	/**
	 * Rank Math's stored VideoObject format. Never primary: the post keeps its default Article.
	 *
	 * @param array{embed: string, thumb: string} $video Video.
	 * @return array<string, mixed>
	 */
	private static function schema( array $video ): array {
		return array(
			'@type'            => 'VideoObject',
			'metadata'         => array(
				'title'                   => 'Video',
				'type'                    => 'template',
				'shortcode'               => uniqid( 's-' ),
				'isPrimary'               => false,
				'reviewLocationShortcode' => '[rank_math_rich_snippet]',
				'category'                => '%categories%',
				'tags'                    => '%tags%',
				'isAutoGenerated'         => true,
				'npwpAuto'                => true,
			),
			'name'             => '%seo_title%',
			'description'      => '%seo_description%',
			'uploadDate'       => '%date(Y-m-dTH:i:sP)%',
			'thumbnailUrl'     => $video['thumb'],
			'embedUrl'         => $video['embed'],
			'contentUrl'       => '',
			'duration'         => '',
			'width'            => '',
			'height'           => '',
			'isFamilyFriendly' => true,
		);
	}
}
