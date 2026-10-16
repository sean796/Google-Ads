<?php
/**
 * "Strip category base": category archives at /blinds/ instead of /category/blinds/, as Rank Math's
 * strip_category_base setting does. Old /category/… addresses redirect to the new ones.
 *
 * Runs only while Neo Pulse SEO is live. Rewrite rules are rebuilt once whenever this turns on or
 * off (including the moment Rank Math is deactivated) and whenever a category changes.
 *
 * @package Neo_Pulse_Wp
 */

defined( 'ABSPATH' ) || exit;

class Neo_Pulse_Wp_Seo_Category_Base {

	const STATE_OPTION = 'neo_pulse_wp_category_base_rules';
	const QUERY_VAR    = 'npwp_category_redirect';

	public static function active(): bool {
		return Neo_Pulse_Wp_Seo_Settings::output_active()
			&& '' !== (string) get_option( 'permalink_structure', '' )
			&& Neo_Pulse_Wp_Seo_Settings::on( Neo_Pulse_Wp_Seo_Settings::gen( 'strip_category_base', 'off' ) );
	}

	public static function init(): void {
		add_action( 'init', array( __CLASS__, 'maybe_flush' ), 999 );
		foreach ( array( 'created_category', 'edited_category', 'delete_category' ) as $hook ) {
			add_action( $hook, array( __CLASS__, 'schedule_flush' ) );
		}
		if ( ! self::active() ) {
			return;
		}
		add_filter( 'category_link', array( __CLASS__, 'filter_link' ), 10, 2 );
		add_filter( 'category_rewrite_rules', array( __CLASS__, 'rewrite_rules' ) );
		add_filter( 'query_vars', array( __CLASS__, 'query_vars' ) );
		add_filter( 'request', array( __CLASS__, 'maybe_redirect_old' ) );
	}

	private static function base(): string {
		$base = trim( (string) get_option( 'category_base', '' ), '/' );
		return $base !== '' ? $base : 'category';
	}

	/**
	 * /blog/category/window-blinds/ → /window-blinds/ (both the permalink front and the base go,
	 * as with Rank Math).
	 *
	 * @param string $link    Category link.
	 * @param int    $term_id Category ID.
	 */
	public static function filter_link( $link, $term_id = 0 ): string {
		$path = self::path( (int) $term_id );
		return $path !== '' ? user_trailingslashit( trailingslashit( home_url() ) . $path, 'category' ) : (string) $link;
	}

	/**
	 * "parent/child" slug path of a category.
	 */
	private static function path( int $term_id ): string {
		$term = $term_id > 0 ? get_term( $term_id, 'category' ) : null;
		if ( ! $term instanceof WP_Term ) {
			return '';
		}
		$path = $term->slug;
		if ( $term->parent > 0 ) {
			$parents = get_category_parents( $term->parent, false, '/', true );
			if ( is_string( $parents ) && ! is_wp_error( $parents ) ) {
				$path = $parents . $term->slug;
			}
		}
		return $path;
	}

	/**
	 * One set of rules per category so /blinds/, /blinds/page/2/ and /blinds/feed/ resolve.
	 *
	 * @param array<string, string> $rules Default rules.
	 * @return array<string, string>
	 */
	public static function rewrite_rules( $rules ): array {
		$out   = array();
		$terms = get_categories(
			array(
				'hide_empty' => false,
				'fields'     => 'all',
			)
		);
		foreach ( (array) $terms as $term ) {
			if ( ! $term instanceof WP_Term ) {
				continue;
			}
			$path = self::path( (int) $term->term_id );
			if ( $path === '' ) {
				continue;
			}
			$variants = array( $path );
			if ( strpos( $path, '%' ) !== false ) {
				// Browsers may send %C3%A9 where the slug is stored as %c3%a9.
				$variants[] = (string) preg_replace_callback( '/%[0-9a-f]{2}/', static function ( array $m ): string {
					return strtoupper( $m[0] );
				}, $path );
			}
			foreach ( array_unique( $variants ) as $variant ) {
				$regex = preg_quote( $variant, '#' );
				$out[ '(' . $regex . ')/(?:feed/)?(feed|rdf|rss|rss2|atom)/?$' ] = 'index.php?category_name=$matches[1]&feed=$matches[2]';
				$out[ '(' . $regex . ')/page/?([0-9]{1,})/?$' ]                 = 'index.php?category_name=$matches[1]&paged=$matches[2]';
				$out[ '(' . $regex . ')/?$' ]                                   = 'index.php?category_name=$matches[1]';
			}
		}
		// Old addresses, with and without the permalink front (/blog/category/…), redirect.
		global $wp_rewrite;
		$front = $wp_rewrite instanceof WP_Rewrite ? trim( (string) $wp_rewrite->front, '/' ) : '';
		$old   = array( self::base() );
		if ( $front !== '' && strpos( $front, '%' ) === false ) {
			array_unshift( $old, $front . '/' . self::base() );
		}
		foreach ( $old as $prefix ) {
			$out[ preg_quote( $prefix, '#' ) . '/(.+?)/?$' ] = 'index.php?' . self::QUERY_VAR . '=$matches[1]';
		}
		return $out;
	}

	/**
	 * @param array<int, string> $vars Query vars.
	 * @return array<int, string>
	 */
	public static function query_vars( $vars ): array {
		$vars   = (array) $vars;
		$vars[] = self::QUERY_VAR;
		return $vars;
	}

	/**
	 * /category/blinds/ → /blinds/ (301).
	 *
	 * @param array<string, mixed> $query Request vars.
	 * @return array<string, mixed>
	 */
	public static function maybe_redirect_old( $query ) {
		if ( is_array( $query ) && ! empty( $query[ self::QUERY_VAR ] ) ) {
			$path = trim( (string) $query[ self::QUERY_VAR ], '/' );
			wp_safe_redirect( user_trailingslashit( trailingslashit( home_url() ) . $path, 'category' ), 301 );
			exit;
		}
		return $query;
	}

	public static function schedule_flush(): void {
		delete_option( self::STATE_OPTION );
	}

	/**
	 * Rebuild the rewrite rules once when the state changes.
	 */
	public static function maybe_flush(): void {
		$state = self::active() ? 'strip' : 'off';
		if ( get_option( self::STATE_OPTION, '' ) === $state ) {
			return;
		}
		update_option( self::STATE_OPTION, $state, true );
		// Lazy rebuild: WordPress regenerates the rules when they are next needed, after every
		// plugin has registered its own (a flush here at init could miss later registrations).
		delete_option( 'rewrite_rules' );
	}
}
