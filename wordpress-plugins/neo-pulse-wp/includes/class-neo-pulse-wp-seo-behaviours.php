<?php
/**
 * Site-wide SEO behaviours Rank Math handled, kept when Neo Pulse takes over: external links in a
 * new tab, disabled date/author archives, and Rank Math shortcodes that would otherwise print as
 * raw text once Rank Math is gone.
 *
 * Only runs while Neo Pulse SEO is live. Attachment pages already redirect (Index Rules).
 *
 * @package Neo_Pulse_Wp
 */

defined( 'ABSPATH' ) || exit;

class Neo_Pulse_Wp_Seo_Behaviours {

	public static function init(): void {
		if ( ! Neo_Pulse_Wp_Seo_Settings::output_active() ) {
			return;
		}
		$S = 'Neo_Pulse_Wp_Seo_Settings';
		if ( $S::on( $S::gen( 'new_window_external_links', 'off' ) ) || $S::on( $S::gen( 'nofollow_external_links', 'off' ) ) ) {
			add_filter( 'the_content', array( __CLASS__, 'filter_external_links' ), 99 );
		}
		if ( $S::is_on( 'disable_date_archives' ) || $S::is_on( 'disable_author_archives' ) ) {
			add_action( 'template_redirect', array( __CLASS__, 'redirect_disabled_archives' ), 2 );
		}
		if ( ! shortcode_exists( 'rank_math_html_sitemap' ) ) {
			add_shortcode( 'rank_math_html_sitemap', array( __CLASS__, 'shortcode_html_sitemap' ) );
		}
		if ( ! shortcode_exists( 'rank_math_breadcrumb' ) ) {
			add_shortcode( 'rank_math_breadcrumb', array( 'Neo_Pulse_Wp_Seo_Breadcrumbs', 'shortcode' ) );
		}
		foreach ( array( 'rank_math_contact_info', 'rank_math_rich_snippet' ) as $tag ) {
			if ( ! shortcode_exists( $tag ) ) {
				add_shortcode( $tag, '__return_empty_string' );
			}
		}
	}

	/**
	 * @param mixed $content Post content.
	 * @return mixed
	 */
	public static function filter_external_links( $content ) {
		if ( ! is_string( $content ) || stripos( $content, '<a ' ) === false || is_admin() || is_feed() ) {
			return $content;
		}
		return self::external_links( $content );
	}

	public static function external_links( string $content ): string {
		$S         = 'Neo_Pulse_Wp_Seo_Settings';
		$new_tab   = $S::on( $S::gen( 'new_window_external_links', 'off' ) );
		$nofollow  = $S::on( $S::gen( 'nofollow_external_links', 'off' ) );
		$home_host = strtolower( (string) wp_parse_url( home_url(), PHP_URL_HOST ) );
		$home_host = preg_replace( '/^www\./', '', $home_host );

		$out = preg_replace_callback(
			'/<a\s[^>]*>/i',
			static function ( array $m ) use ( $new_tab, $nofollow, $home_host ): string {
				$tag = $m[0];
				if ( ! preg_match( '/\shref\s*=\s*(["\'])(https?:)?\/\/([^\/"\'?#:]+)/i', $tag, $h ) ) {
					return $tag;
				}
				$host = preg_replace( '/^www\./', '', strtolower( $h[3] ) );
				if ( $host === $home_host ) {
					return $tag;
				}
				if ( $new_tab && ! preg_match( '/\starget\s*=/i', $tag ) ) {
					$tag = substr( $tag, 0, -1 ) . ' target="_blank">';
				}
				$add = array();
				if ( $new_tab ) {
					$add[] = 'noopener';
				}
				if ( $nofollow ) {
					$add[] = 'nofollow';
				}
				if ( $add === array() ) {
					return $tag;
				}
				if ( preg_match( '/\srel\s*=\s*(["\'])(.*?)\1/i', $tag, $r ) ) {
					$rels = preg_split( '/\s+/', trim( $r[2] ) );
					$rels = array_values( array_unique( array_filter( array_merge( is_array( $rels ) ? $rels : array(), $add ) ) ) );
					return str_replace( $r[0], ' rel="' . esc_attr( implode( ' ', $rels ) ) . '"', $tag );
				}
				return substr( $tag, 0, -1 ) . ' rel="' . esc_attr( implode( ' ', $add ) ) . '">';
			},
			$content
		);
		return is_string( $out ) ? $out : $content;
	}

	public static function redirect_disabled_archives(): void {
		$S = 'Neo_Pulse_Wp_Seo_Settings';
		if ( ( is_date() && $S::is_on( 'disable_date_archives' ) ) || ( is_author() && $S::is_on( 'disable_author_archives' ) ) ) {
			wp_safe_redirect( home_url( '/' ), 301 );
			exit;
		}
	}

	/**
	 * Rank Math's HTML sitemap shortcode, answered by the Neo Pulse HTML sitemap.
	 *
	 * @param mixed $atts Attributes.
	 */
	public static function shortcode_html_sitemap( $atts = array() ): string {
		if ( ! class_exists( 'Neo_Pulse_Wp_Sitemap_Settings', false ) || ! class_exists( 'Neo_Pulse_Wp_Sitemap_Generator', false ) ) {
			return '';
		}
		$config                    = Neo_Pulse_Wp_Sitemap_Settings::get_config();
		$config['html']['enabled'] = true;
		return Neo_Pulse_Wp_Sitemap_Generator::build_html( $config );
	}
}
