<?php
/**
 * llms.txt front-end output (generated; there is no stored copy).
 *
 * Served only while no other SEO plugin is active: Rank Math (and others) serve their own llms.txt.
 *
 * @package Neo_Pulse_Wp
 */

defined( 'ABSPATH' ) || exit;

class Neo_Pulse_Wp_Llms_Txt {

	const QUERY_VAR = 'neo-pulse_llms';

	public static function init(): void {
		add_action( 'init', array( __CLASS__, 'register_rewrites' ), 5 );
		add_filter( 'query_vars', array( __CLASS__, 'register_query_vars' ) );
		add_action( 'template_redirect', array( __CLASS__, 'maybe_serve' ), 0 );
	}

	/**
	 * Neo Pulse answers /llms.txt unless Rank Math's llms.txt module is switched on.
	 */
	public static function should_serve(): bool {
		// Stand aside only when Rank Math's own llms.txt module is switched on (it answers the same URL).
		if ( defined( 'RANK_MATH_VERSION' ) || class_exists( 'RankMath', false ) ) {
			$modules = get_option( 'rank_math_modules', array() );
			if ( is_array( $modules ) && in_array( 'llms-txt', $modules, true ) ) {
				return false;
			}
		}
		return true;
	}

	public static function register_rewrites(): void {
		if ( ! self::should_serve() ) {
			return;
		}
		add_rewrite_rule( '^llms\.txt$', 'index.php?' . self::QUERY_VAR . '=1', 'top' );
	}

	/**
	 * @param mixed $vars Query vars.
	 * @return mixed
	 */
	public static function register_query_vars( $vars ) {
		if ( ! is_array( $vars ) ) {
			return $vars;
		}
		$vars[] = self::QUERY_VAR;
		return $vars;
	}

	/**
	 * @return array<int, array{0: string, 1: string}>
	 */
	public static function default_page_rows(): array {
		return array(
			array( 'Edmonton SEO', '/edmonton-seo/' ),
			array( 'Home', '/' ),
			array( 'About', '/about/' ),
			array( 'Our Services', '/our-services/' ),
			array( 'Our Work', '/our-work/' ),
			array( 'Blog', '/blog/' ),
			array( 'Contact', '/contact/' ),
			array( 'Website Design', '/website-design/' ),
			array( 'Local SEO', '/local-seo/' ),
			array( 'Elementor Experts', '/elementor-help/' ),
			array( 'Window Coverings Marketing', '/window-coverings-marketing/' ),
			array( 'AISEO', '/aiseo/' ),
			array( 'AI Content Optimization', '/aiseo/ai-content-optimization/' ),
			array( 'Generative Engine Optimization', '/aiseo/generative-engine-optimization/' ),
			array( 'AI SEO Audit', '/aiseo/ai-seo-audit/' ),
			array( 'NEO Pulse', '/neo-pulse-platform/' ),
			array( 'Service Areas', '/service-area/' ),
			array( 'Shopify Development', '/shopify-development/' ),
			array( 'Webflow Development', '/webflow-development/' ),
			array( 'Google Ads', '/google-ads/' ),
		);
	}

	public static function default_content(): string {
		if ( ! class_exists( 'Neo_Pulse_Wp_Site', false ) || ! Neo_Pulse_Wp_Site::is_neo_digital() ) {
			return self::generic_content();
		}
		return self::neo_digital_content();
	}

	/**
	 * Default llms.txt for client sites: the site's own name, tagline and published top-level pages.
	 */
	public static function generic_content(): string {
		$name    = trim( wp_specialchars_decode( (string) get_bloginfo( 'name' ), ENT_QUOTES ) );
		$tagline = trim( wp_specialchars_decode( (string) get_bloginfo( 'description' ), ENT_QUOTES ) );
		$lines   = array();
		if ( $name !== '' ) {
			$lines[] = '# ' . $name;
			$lines[] = '';
		}
		if ( $tagline !== '' ) {
			$lines[] = '> ' . $tagline;
			$lines[] = '';
		}
		$pages = get_pages(
			array(
				'parent'      => 0,
				'post_status' => 'publish',
				'sort_column' => 'menu_order,post_title',
				'number'      => 50,
			)
		);
		$front = (int) get_option( 'page_on_front' );
		$rows  = array( '- [' . ( $name !== '' ? $name : 'Home' ) . '](' . home_url( '/' ) . ')' );
		foreach ( is_array( $pages ) ? $pages : array() as $page ) {
			if ( (int) $page->ID === $front || post_password_required( $page ) ) {
				continue;
			}
			$title = trim( wp_strip_all_tags( get_the_title( $page ) ) );
			if ( $title === '' ) {
				continue;
			}
			$rows[] = '- [' . $title . '](' . get_permalink( $page ) . ')';
		}
		$lines[] = '## Pages';
		$lines[] = '';
		$lines   = array_merge( $lines, $rows );
		return implode( "\n", $lines ) . "\n";
	}

	/**
	 * neodigital.ca's llms.txt: site name, tagline and its main pages.
	 */
	public static function neo_digital_content(): string {
		$name    = trim( wp_specialchars_decode( (string) get_bloginfo( 'name' ), ENT_QUOTES ) );
		$tagline = trim( wp_specialchars_decode( (string) get_bloginfo( 'description' ), ENT_QUOTES ) );
		$home    = rtrim( (string) home_url(), '/' );
		$lines   = array();
		if ( $name !== '' ) {
			$lines[] = '# ' . $name;
			$lines[] = '';
		}
		if ( $tagline !== '' ) {
			$lines[] = '> ' . $tagline;
			$lines[] = '';
		}
		$lines[] = '## Pages';
		$lines[] = '';
		foreach ( self::default_page_rows() as $row ) {
			$lines[] = '- [' . $row[0] . '](' . $home . $row[1] . ')';
		}
		return implode( "\n", $lines ) . "\n";
	}

	public static function get_content(): string {
		return self::default_content();
	}

	public static function maybe_serve(): void {
		$flag = get_query_var( self::QUERY_VAR );
		if ( (string) $flag !== '1' || ! self::should_serve() ) {
			return;
		}
		status_header( 200 );
		header( 'Content-Type: text/plain; charset=UTF-8' );
		header( 'Cache-Control: public, max-age=86400, s-maxage=86400' );
		// phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- plain-text payload.
		echo self::get_content();
		exit;
	}
}
