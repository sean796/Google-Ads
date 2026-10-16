<?php
/**
 * Side-by-side check of the SEO tags the site prints now (usually Rank Math) against what
 * Neo Pulse would print, page by page, before switching over.
 *
 * Neo Pulse's version comes from a preview request: the page URL with a short-lived secret token,
 * answered with JSON before the theme renders. Both requests carry cache-busting parameters so
 * NitroPack and the WP Engine page cache are bypassed.
 *
 * @package Neo_Pulse_Wp
 */

defined( 'ABSPATH' ) || exit;

class Neo_Pulse_Wp_Seo_Compare {

	const PARAM         = 'neo_pulse_seo_preview';
	const TOKEN_KEY     = 'neo_pulse_wp_seo_preview_token';
	const LAST_OPTION   = 'neo_pulse_wp_seo_compare_last';
	const AJAX_ACTION   = 'neo_pulse_wp_seo_compare_url';
	const NONCE_ACTION  = 'neo_pulse_wp_seo_compare';

	/**
	 * Fields compared, in display order.
	 *
	 * @return array<string, string> key => label
	 */
	public static function fields(): array {
		return array(
			'title'               => __( 'Title', 'neo-pulse-wp' ),
			'description'         => __( 'Meta description', 'neo-pulse-wp' ),
			'robots'              => __( 'Robots', 'neo-pulse-wp' ),
			'canonical'           => __( 'Canonical', 'neo-pulse-wp' ),
			'og:type'             => 'og:type',
			'og:title'            => 'og:title',
			'og:description'      => 'og:description',
			'og:url'              => 'og:url',
			'og:image'            => 'og:image',
			'twitter:card'        => 'twitter:card',
			'twitter:title'       => 'twitter:title',
			'twitter:description' => 'twitter:description',
			'twitter:image'       => 'twitter:image',
			'schema'              => __( 'Schema types', 'neo-pulse-wp' ),
		);
	}

	public static function init(): void {
		add_action( 'template_redirect', array( __CLASS__, 'maybe_serve_preview' ), 99999 );
		add_action( 'wp_ajax_' . self::AJAX_ACTION, array( __CLASS__, 'ajax_compare_url' ) );
	}

	public static function token(): string {
		$token = get_transient( self::TOKEN_KEY );
		if ( ! is_string( $token ) || strlen( $token ) < 32 ) {
			$token = wp_generate_password( 40, false, false );
			set_transient( self::TOKEN_KEY, $token, 30 * MINUTE_IN_SECONDS );
		}
		return $token;
	}

	public static function maybe_serve_preview(): void {
		if ( ! isset( $_GET[ self::PARAM ] ) ) { // phpcs:ignore WordPress.Security.NonceVerification.Recommended
			return;
		}
		$given = sanitize_text_field( wp_unslash( (string) $_GET[ self::PARAM ] ) ); // phpcs:ignore WordPress.Security.NonceVerification.Recommended
		$token = get_transient( self::TOKEN_KEY );
		if ( ! is_string( $token ) || $token === '' || ! hash_equals( $token, $given ) ) {
			return;
		}
		nocache_headers();
		Neo_Pulse_Wp_Seo_Head::reset();
		$data         = Neo_Pulse_Wp_Seo_Head::data();
		$data['html'] = Neo_Pulse_Wp_Seo_Head::head_html( $data );
		wp_send_json( array( 'ok' => true, 'neo_pulse_seo' => $data ) );
	}

	/**
	 * Default pages to check: home, posts page, recent posts, pages, one of each public post
	 * type and the busiest category.
	 *
	 * @return array<int, string>
	 */
	public static function sample_urls(): array {
		$urls = array( home_url( '/' ) );
		$blog = (int) get_option( 'page_for_posts' );
		if ( $blog > 0 ) {
			$urls[] = (string) get_permalink( $blog );
		}
		foreach ( array( 'post' => 3, 'page' => 3 ) as $type => $count ) {
			foreach ( get_posts( array( 'post_type' => $type, 'post_status' => 'publish', 'numberposts' => $count, 'orderby' => 'modified', 'exclude' => array( (int) get_option( 'page_on_front' ), $blog ) ) ) as $p ) {
				$urls[] = (string) get_permalink( $p );
			}
		}
		foreach ( array_keys( Neo_Pulse_Wp_Seo_Settings::post_types() ) as $type ) {
			if ( in_array( $type, array( 'post', 'page', 'attachment' ), true ) ) {
				continue;
			}
			$latest = get_posts( array( 'post_type' => $type, 'post_status' => 'publish', 'numberposts' => 1 ) );
			if ( $latest ) {
				$urls[] = (string) get_permalink( $latest[0] );
			}
			$archive = get_post_type_archive_link( $type );
			if ( is_string( $archive ) && $archive !== '' ) {
				$urls[] = $archive;
			}
		}
		$cats = get_terms( array( 'taxonomy' => 'category', 'orderby' => 'count', 'order' => 'DESC', 'number' => 1, 'hide_empty' => true ) );
		if ( is_array( $cats ) && isset( $cats[0] ) ) {
			$link = get_term_link( $cats[0] );
			if ( is_string( $link ) ) {
				$urls[] = $link;
			}
		}
		$urls[] = add_query_arg( 's', 'website', home_url( '/' ) );
		return array_values( array_unique( array_filter( $urls ) ) );
	}

	/**
	 * Compare one URL.
	 *
	 * @return array{url: string, ok: bool, skipped: bool, error: string, rows: array<int, array<string, mixed>>, matched: int, total: int}
	 */
	public static function compare_url( string $url ): array {
		$result = array(
			'url'     => $url,
			'ok'      => false,
			'skipped' => false,
			'error'   => '',
			'rows'    => array(),
			'matched' => 0,
			'total'   => 0,
		);
		if ( ! self::is_own_url( $url ) ) {
			$result['error'] = __( 'Only pages on this site can be checked.', 'neo-pulse-wp' );
			return $result;
		}

		// Redirects are not followed: an address that sends visitors elsewhere (an FAQ item without a
		// page of its own, a "404 → homepage" fallback) has nothing of its own to compare.
		$live = self::fetch( self::bust( $url ), 0 );
		if ( '' !== $live['redirect'] ) {
			$result['skipped'] = true;
			/* translators: %s: address */
			$result['error'] = sprintf( __( 'Skipped: visitors are redirected from this address to %s, so there is no page to compare.', 'neo-pulse-wp' ), remove_query_arg( array( 'nonitro', 'np_cmp', self::PARAM ), $live['redirect'] ) );
			self::remember_skip( $url );
			return $result;
		}
		if ( '' !== $live['error'] ) {
			$result['error'] = sprintf( /* translators: %s: error */ __( 'Could not load the live page: %s', 'neo-pulse-wp' ), $live['error'] );
			return $result;
		}
		// No redirects on the preview request: the token stays on this site.
		$preview = self::fetch( add_query_arg( self::PARAM, self::token(), self::bust( $url ) ), 0 );
		$json    = json_decode( $preview['body'], true );
		if ( '' !== $preview['error'] || ! is_array( $json ) || empty( $json['neo_pulse_seo'] ) ) {
			$result['error'] = '' !== $preview['error']
				? sprintf( /* translators: %s: error */ __( 'Could not load the Neo Pulse preview: %s', 'neo-pulse-wp' ), $preview['error'] )
				: __( 'The Neo Pulse preview did not answer. A cache or redirect may be in the way.', 'neo-pulse-wp' );
			return $result;
		}

		$theirs = self::parse_html( $live['body'] );
		$ours   = self::parse_html( (string) ( $json['neo_pulse_seo']['html'] ?? '' ) );
		// The title comes back HTML-escaped (&amp;) for printing; compare it as visitors see it.
		$ours['title']  = trim( (string) preg_replace( '/\s+/u', ' ', html_entity_decode( (string) ( $json['neo_pulse_seo']['title'] ?? '' ), ENT_QUOTES | ENT_HTML5, 'UTF-8' ) ) );
		$ours['robots'] = self::normalise_robots( implode( ',', (array) ( $json['neo_pulse_seo']['robots'] ?? array() ) ) );

		foreach ( self::fields() as $key => $label ) {
			$a        = (string) ( $theirs[ $key ] ?? '' );
			$b        = (string) ( $ours[ $key ] ?? '' );
			$same     = self::same( $key, $a, $b );
			$expected = false;
			$note     = '';
			if ( ! $same && 'schema' === $key ) {
				$added = self::schema_added( $a, $b );
				if ( null !== $added ) {
					// Neo Pulse prints everything the live page has, plus more (site-wide entities on pages
					// where Rank Math's schema is off, FAQs from ACF fields, breadcrumbs). Not a problem.
					$same     = true;
					$expected = true;
					/* translators: %s: schema types */
					$note = sprintf( __( 'Expected: Neo Pulse also adds %s.', 'neo-pulse-wp' ), $added );
				}
			}
			$result['rows'][] = array(
				'key'      => $key,
				'label'    => $label,
				'live'     => $a,
				'ours'     => $b,
				'same'     => $same,
				'expected' => $expected,
				'note'     => $note,
			);
			++$result['total'];
			if ( $same ) {
				++$result['matched'];
			}
		}
		$result['ok'] = true;
		self::remember( $url, $result['matched'], $result['total'] );
		return $result;
	}

	public static function ajax_compare_url(): void {
		if ( ! current_user_can( 'manage_options' ) ) {
			wp_send_json_error( array( 'message' => __( 'Not allowed.', 'neo-pulse-wp' ) ), 403 );
		}
		check_ajax_referer( self::NONCE_ACTION, 'nonce' );
		$url = isset( $_POST['url'] ) ? esc_url_raw( wp_unslash( (string) $_POST['url'] ) ) : '';
		if ( $url === '' ) {
			wp_send_json_error( array( 'message' => __( 'No URL given.', 'neo-pulse-wp' ) ) );
		}
		if ( ! empty( $_POST['first'] ) ) {
			// A new run replaces the previous run's results.
			delete_option( self::LAST_OPTION );
		}
		wp_send_json_success( self::compare_url( $url ) );
	}

	private static function is_own_url( string $url ): bool {
		$a = wp_parse_url( $url );
		$b = wp_parse_url( home_url() );
		if ( ! is_array( $a ) || ! is_array( $b ) || empty( $a['host'] ) ) {
			return false;
		}
		return strtolower( (string) $a['host'] ) === strtolower( (string) ( $b['host'] ?? '' ) )
			&& in_array( strtolower( (string) ( $a['scheme'] ?? '' ) ), array( 'http', 'https' ), true )
			&& (int) ( $a['port'] ?? 0 ) === (int) ( $b['port'] ?? 0 );
	}

	/**
	 * Cache-busting parameters for NitroPack and the WP Engine page cache.
	 */
	public static function bust( string $url ): string {
		return add_query_arg(
			array(
				'nonitro' => '1',
				'np_cmp'  => wp_generate_password( 10, false, false ),
			),
			$url
		);
	}

	/**
	 * Types the preview adds when it keeps every type the live page has; null when the live page has
	 * a type the preview lacks.
	 */
	private static function schema_added( string $live, string $ours ): ?string {
		$a = array_filter( array_map( 'trim', explode( ',', $live ) ), 'strlen' );
		$b = array_filter( array_map( 'trim', explode( ',', $ours ) ), 'strlen' );
		if ( array_diff( $a, $b ) !== array() ) {
			return null;
		}
		$added = array_values( array_diff( $b, $a ) );
		return $added === array() ? null : implode( ', ', $added );
	}

	/**
	 * @return array{body: string, error: string, redirect: string}
	 */
	private static function fetch( string $url, int $redirects = 3 ): array {
		$response = wp_safe_remote_get(
			$url,
			array(
				'timeout'     => 25,
				'redirection' => $redirects,
				'sslverify'   => apply_filters( 'https_local_ssl_verify', false ),
				'headers'     => array(
					'Cache-Control' => 'no-cache',
					'Pragma'        => 'no-cache',
					'User-Agent'    => 'Neo Pulse SEO check; ' . home_url( '/' ),
				),
				'cookies'     => array( 'wordpress_no_cache' => '1' ),
			)
		);
		if ( is_wp_error( $response ) ) {
			return array( 'body' => '', 'error' => $response->get_error_message(), 'redirect' => '' );
		}
		$code = (int) wp_remote_retrieve_response_code( $response );
		if ( $code >= 300 && $code < 400 ) {
			$location = (string) wp_remote_retrieve_header( $response, 'location' );
			return array( 'body' => '', 'error' => sprintf( 'HTTP %d redirect to %s', $code, $location ), 'redirect' => $location !== '' ? $location : '?' );
		}
		if ( $code >= 400 && 404 !== $code ) {
			return array( 'body' => '', 'error' => 'HTTP ' . $code, 'redirect' => '' );
		}
		return array( 'body' => (string) wp_remote_retrieve_body( $response ), 'error' => '', 'redirect' => '' );
	}

	/**
	 * Pull the SEO tags out of a page's <head>. When several tags compete (two meta descriptions,
	 * say) the first wins, which is what search engines use.
	 *
	 * @return array<string, string>
	 */
	public static function parse_html( string $html ): array {
		$end  = stripos( $html, '</head>' );
		$head = false !== $end ? substr( $html, 0, $end ) : $html;
		$out  = array();

		if ( preg_match( '#<title[^>]*>(.*?)</title>#is', $head, $m ) ) {
			$out['title'] = $m[1];
		}
		if ( preg_match_all( '#<meta\s[^>]*>#i', $head, $metas ) ) {
			foreach ( $metas[0] as $tag ) {
				$attrs = self::attributes( $tag );
				$key   = strtolower( (string) ( $attrs['property'] ?? $attrs['name'] ?? '' ) );
				if ( $key === '' || ! isset( $attrs['content'] ) ) {
					continue;
				}
				if ( in_array( $key, array( 'description', 'robots' ), true ) || strpos( $key, 'og:' ) === 0 || strpos( $key, 'twitter:' ) === 0 ) {
					if ( ! isset( $out[ $key ] ) ) {
						$out[ $key ] = $attrs['content'];
					}
				}
			}
		}
		if ( preg_match_all( '#<link\s[^>]*>#i', $head, $links ) ) {
			foreach ( $links[0] as $tag ) {
				$attrs = self::attributes( $tag );
				if ( strtolower( (string) ( $attrs['rel'] ?? '' ) ) === 'canonical' && ! isset( $out['canonical'] ) ) {
					$out['canonical'] = (string) ( $attrs['href'] ?? '' );
				}
			}
		}
		$out['schema'] = self::schema_types( $head );
		if ( isset( $out['robots'] ) ) {
			$out['robots'] = self::normalise_robots( $out['robots'] );
		}
		foreach ( $out as $key => $value ) {
			$out[ $key ] = trim( (string) preg_replace( '/\s+/u', ' ', html_entity_decode( (string) $value, ENT_QUOTES | ENT_HTML5, 'UTF-8' ) ) );
		}
		return $out;
	}

	/**
	 * @return array<string, string>
	 */
	private static function attributes( string $tag ): array {
		$out = array();
		if ( preg_match_all( '/([a-zA-Z:-]+)\s*=\s*("([^"]*)"|\'([^\']*)\')/', $tag, $m, PREG_SET_ORDER ) ) {
			foreach ( $m as $match ) {
				$out[ strtolower( $match[1] ) ] = isset( $match[4] ) && $match[4] !== '' ? $match[4] : $match[3];
			}
		}
		return $out;
	}

	/**
	 * Sorted list of schema @types in SEO-plugin JSON-LD (Rank Math, Yoast or Neo Pulse blocks).
	 */
	public static function schema_types( string $head ): string {
		if ( ! preg_match_all( '#<script[^>]+application/ld\+json[^>]*>(.*?)</script>#is', $head, $m, PREG_SET_ORDER ) ) {
			return '';
		}
		$types = array();
		foreach ( $m as $match ) {
			$open = substr( $match[0], 0, (int) strpos( $match[0], '>' ) );
			if ( ! preg_match( '/rank-math|yoast|neo-pulse-seo-schema|aioseo/i', $open ) ) {
				continue;
			}
			$data = json_decode( html_entity_decode( $match[1], ENT_NOQUOTES, 'UTF-8' ), true );
			if ( ! is_array( $data ) ) {
				$data = json_decode( $match[1], true );
			}
			$nodes = is_array( $data ) && isset( $data['@graph'] ) && is_array( $data['@graph'] ) ? $data['@graph'] : array( $data );
			foreach ( $nodes as $node ) {
				if ( is_array( $node ) && isset( $node['@type'] ) ) {
					foreach ( (array) $node['@type'] as $type ) {
						$types[] = (string) $type;
					}
				}
			}
		}
		$types = array_unique( $types );
		sort( $types );
		return implode( ', ', $types );
	}

	public static function normalise_robots( string $robots ): string {
		$parts = array_filter( array_map( 'trim', explode( ',', strtolower( str_replace( ' ', '', $robots ) ) ) ) );
		sort( $parts );
		return implode( ', ', array_unique( $parts ) );
	}

	private static function same( string $key, string $a, string $b ): bool {
		if ( in_array( $key, array( 'canonical', 'og:url', 'og:image', 'twitter:image' ), true ) ) {
			return untrailingslashit( $a ) === untrailingslashit( $b );
		}
		return $a === $b;
	}

	private static function remember( string $url, int $matched, int $total ): void {
		$last = get_option( self::LAST_OPTION, array() );
		if ( ! is_array( $last ) ) {
			$last = array();
		}
		$last['time']         = time();
		$last['urls'][ $url ] = array( $matched, $total );
		if ( count( $last['urls'] ) > 60 ) {
			$last['urls'] = array_slice( $last['urls'], -60, null, true );
		}
		update_option( self::LAST_OPTION, $last, false );
	}

	private static function remember_skip( string $url ): void {
		$last = get_option( self::LAST_OPTION, array() );
		if ( ! is_array( $last ) ) {
			$last = array();
		}
		$last['time']            = time();
		$last['skipped'][ $url ] = 1;
		update_option( self::LAST_OPTION, $last, false );
	}

	/**
	 * Summary of the most recent check.
	 *
	 * @return array{time: int, pages: int, perfect: int, matched: int, total: int, skipped: int}
	 */
	public static function last_summary(): array {
		$last = get_option( self::LAST_OPTION, array() );
		$out  = array( 'time' => 0, 'pages' => 0, 'perfect' => 0, 'matched' => 0, 'total' => 0, 'skipped' => 0 );
		if ( ! is_array( $last ) || empty( $last['urls'] ) ) {
			return $out;
		}
		$out['time']    = (int) ( $last['time'] ?? 0 );
		$out['skipped'] = is_array( $last['skipped'] ?? null ) ? count( $last['skipped'] ) : 0;
		foreach ( $last['urls'] as $pair ) {
			++$out['pages'];
			$out['matched'] += (int) $pair[0];
			$out['total']   += (int) $pair[1];
			if ( (int) $pair[0] === (int) $pair[1] ) {
				++$out['perfect'];
			}
		}
		return $out;
	}
}
