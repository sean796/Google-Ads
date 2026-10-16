<?php
/**
 * Renders a page in TranslatePress's editor preview and maps its string ids (3.19.0).
 *
 * The preview (?trp-edit-translation=preview on the page's URL in the translation language)
 * wraps every string in <translate-press data-trp-translate-id="{dictionary id}">, marks
 * attribute strings data-trp-translate-id-{accessor}="{id}" and gettext strings
 * data-trpgettextoriginal[-{accessor}]="{gettext table row id}". The request carries
 * X-EMCP-Render: 1 (the render guard, so no automatic translation runs) and an answer without
 * X-EMCP-Render-Guard: 1 is refused. Pages that are not publicly viewable are rendered with a
 * 60-second LOGGED_IN_COOKIE for the calling user whose session token is destroyed afterwards;
 * the cookie never leaves this class.
 *
 * @package EMCP_Tools
 * @since   3.19.0
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/** @since 3.19.0 */
class EMCP_Tools_TranslatePress_Renderer {

	/** Elements with no closing tag. */
	const VOID = array( 'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr' );

	/** Accessors whose string is a URL. */
	const URL_ACCESSORS = array( 'href', 'src', 'poster' );

	const COOKIE_TTL = 60;

	/** @var callable|null Test seam for wp_remote_get(). */
	private static $fetcher = null;

	/** @var EMCP_Tools_TranslatePress_Api */
	private $api;

	public function __construct( EMCP_Tools_TranslatePress_Api $api ) {
		$this->api = $api;
	}

	public static function use_fetcher( ?callable $fetcher ): void {
		self::$fetcher = $fetcher;
	}

	/**
	 * Certificate checks for the request to the site itself: off on local and development sites
	 * (their certificates are self-signed), on elsewhere, and adjustable with core's own loopback
	 * filter https_local_ssl_verify.
	 */
	public static function sslverify(): bool {
		$type = function_exists( 'wp_get_environment_type' ) ? wp_get_environment_type() : 'production';
		return (bool) apply_filters( 'https_local_ssl_verify', ! in_array( $type, array( 'local', 'development' ), true ) );
	}

	private static function failed( string $reason, string $message, array $extra = array() ): WP_Error {
		return new WP_Error( 'render_failed', $message, array( 'reason' => $reason ) + $extra );
	}

	/** $url with the scheme of home_url(). */
	private static function site_scheme( string $url ): string {
		$scheme = (string) wp_parse_url( home_url( '/' ), PHP_URL_SCHEME );
		return '' === $scheme ? $url : (string) preg_replace( '#^https?://#i', $scheme . '://', $url );
	}

	/**
	 * Fetch the page's editor preview in $lang.
	 *
	 * @return array{url: string, body: string}|WP_Error
	 */
	public function render( int $post_id, string $lang ) {
		$post = get_post( $post_id );
		if ( ! $post ) {
			/* translators: %d: post ID. */
			return new WP_Error( 'not_found', sprintf( __( 'Post %d does not exist.', 'emcp-tools' ), $post_id ) );
		}
		if ( ! class_exists( 'EMCP_Tools_TranslatePress_Render_Guard' ) ) {
			return self::failed( 'guard_unavailable', __( 'The render guard is not loaded, so the page is not rendered (automatic translation could run).', 'emcp-tools' ) );
		}
		$public = EMCP_Tools_TranslatePress_Integration::is_public( $post );
		$base   = self::site_scheme( $public ? (string) get_permalink( $post ) : (string) get_preview_post_link( $post ) );
		$url    = $this->api->url_for_language( $lang, $base );
		$home   = strtolower( (string) wp_parse_url( home_url( '/' ), PHP_URL_HOST ) );
		if ( '' === $url || strtolower( (string) wp_parse_url( $url, PHP_URL_HOST ) ) !== $home ) {
			return new WP_Error( 'invalid_url', __( 'The page\'s translated URL is not on this site, so it is not rendered.', 'emcp-tools' ) );
		}
		$fetch_url = add_query_arg(
			array(
				'trp-edit-translation' => 'preview',
				'emcp_render'          => bin2hex( random_bytes( 4 ) ),
			),
			$url
		);
		$args = array(
			'timeout'     => 30,
			'redirection' => 0,
			'sslverify'   => self::sslverify(),
			'headers'     => array( EMCP_Tools_TranslatePress_Render_Guard::HEADER => '1' ),
		);
		$token   = '';
		$manager = null;
		$user_id = (int) get_current_user_id();
		if ( ! $public ) {
			if ( $user_id <= 0 || ! class_exists( 'WP_Session_Tokens' ) || ! defined( 'LOGGED_IN_COOKIE' ) ) {
				return self::failed( 'login_unavailable', __( 'This page is not public and no login is available to render it.', 'emcp-tools' ) );
			}
			$expires         = time() + self::COOKIE_TTL;
			$manager         = WP_Session_Tokens::get_instance( $user_id );
			$token           = (string) $manager->create( $expires );
			$args['cookies'] = array( LOGGED_IN_COOKIE => (string) wp_generate_auth_cookie( $user_id, $expires, 'logged_in', $token ) );
		}
		try {
			$response = self::$fetcher ? ( self::$fetcher )( $fetch_url, $args ) : wp_remote_get( $fetch_url, $args );
		} finally {
			if ( $manager && '' !== $token ) {
				$manager->destroy( $token );
			}
			unset( $args['cookies'] );
		}
		if ( is_wp_error( $response ) && false !== stripos( $response->get_error_message(), 'SSL' ) ) {
			return self::failed( 'ssl_failed', __( 'The site could not verify its own HTTPS certificate when rendering the page for itself. On a local site set WP_ENVIRONMENT_TYPE to local, or return false from the https_local_ssl_verify filter.', 'emcp-tools' ) );
		}
		if ( is_wp_error( $response ) ) {
			return self::failed( 'request_failed', __( 'The site could not render the page for itself. A host that blocks requests to itself cannot use get-page-strings; search-strings still works.', 'emcp-tools' ), array( 'detail' => sanitize_text_field( $response->get_error_code() ) ) );
		}
		$code = (int) wp_remote_retrieve_response_code( $response );
		if ( $code >= 300 && $code < 400 ) {
			return self::failed( 'redirect', __( 'The page redirected instead of rendering.', 'emcp-tools' ), array( 'status' => $code ) );
		}
		if ( 200 !== $code ) {
			/* translators: %d: HTTP status. */
			return self::failed( 'http_status', sprintf( __( 'The page answered HTTP %d.', 'emcp-tools' ), $code ), array( 'status' => $code ) );
		}
		if ( '1' !== trim( (string) wp_remote_retrieve_header( $response, strtolower( EMCP_Tools_TranslatePress_Render_Guard::ANSWER ) ) ) ) {
			return self::failed( 'guard_missing', __( 'The answer did not come from a guarded render (a page cache or proxy may have served it), so its strings are not used.', 'emcp-tools' ) );
		}
		$body = (string) wp_remote_retrieve_body( $response );
		if ( false === strpos( $body, 'data-trp-translate-id' ) ) {
			return self::failed( 'no_ids', __( 'The preview has no TranslatePress string ids: TranslatePress may not be translating this page.', 'emcp-tools' ) );
		}
		return array( 'url' => $url, 'body' => $body );
	}

	/**
	 * Every marked id of a preview, in document order.
	 *
	 * @param string   $html        Preview body.
	 * @param string[] $top_parents Elements that start a context group.
	 * @return array[] {id, source: regular|gettext, accessor, group}.
	 */
	public static function map( string $html, array $top_parents ): array {
		$p       = new WP_HTML_Tag_Processor( $html );
		$stack   = array();
		$groups  = 0;
		$entries = array();
		while ( $p->next_tag( array( 'tag_closers' => 'visit' ) ) ) {
			$tag = strtolower( (string) $p->get_tag() );
			if ( $p->is_tag_closer() ) {
				for ( $i = count( $stack ) - 1; $i >= 0; $i-- ) {
					if ( $stack[ $i ]['tag'] === $tag ) {
						array_splice( $stack, $i );
						break;
					}
				}
				continue;
			}
			$inherited = $stack ? (int) $stack[ count( $stack ) - 1 ]['group'] : 0;
			$group     = in_array( $tag, $top_parents, true ) ? ++$groups : $inherited;
			foreach ( (array) $p->get_attribute_names_with_prefix( 'data-trp' ) as $name ) {
				$name = strtolower( (string) $name );
				if ( 'data-trp-translate-id' === $name ) {
					$source   = 'regular';
					$accessor = 'text';
				} elseif ( 0 === strpos( $name, 'data-trp-translate-id-' ) ) {
					$source   = 'regular';
					$accessor = substr( $name, strlen( 'data-trp-translate-id-' ) );
				} elseif ( 'data-trpgettextoriginal' === $name ) {
					$source   = 'gettext';
					$accessor = 'text';
				} elseif ( 0 === strpos( $name, 'data-trpgettextoriginal-' ) ) {
					$source   = 'gettext';
					$accessor = substr( $name, strlen( 'data-trpgettextoriginal-' ) );
				} else {
					continue;
				}
				$value = (string) $p->get_attribute( $name );
				if ( ! ctype_digit( $value ) || ! preg_match( '/^[a-z-]+$/', $accessor ) ) {
					continue;
				}
				$entries[] = array(
					'id'       => (int) $value,
					'source'   => $source,
					'accessor' => $accessor,
					'group'    => $group,
				);
			}
			if ( ! in_array( $tag, self::VOID, true ) && ! $p->has_self_closing_flag() ) {
				$stack[] = array( 'tag' => $tag, 'group' => $group );
			}
		}
		return $entries;
	}

	/**
	 * Render and map a page: unique entries in first-seen order with occurrences.
	 *
	 * @return array{url: string, entries: array}|WP_Error entries: {id, source, accessor, group, occurrences}.
	 */
	public function page( int $post_id, string $lang ) {
		$render = $this->render( $post_id, $lang );
		if ( is_wp_error( $render ) ) {
			return $render;
		}
		$unique = array();
		foreach ( self::map( $render['body'], $this->api->top_parents() ) as $e ) {
			$key = $e['source'] . ':' . $e['id'];
			if ( isset( $unique[ $key ] ) ) {
				++$unique[ $key ]['occurrences'];
				continue;
			}
			$unique[ $key ] = $e + array( 'occurrences' => 1 );
		}
		return array( 'url' => $render['url'], 'entries' => array_values( $unique ) );
	}

	/**
	 * The ids a page shows: dictionary ids and gettext table row ids (data-trpgettextoriginal).
	 *
	 * @return array{regular: int[], gettext: int[]}|WP_Error
	 */
	public function page_ids( int $post_id, string $lang ) {
		$page = $this->page( $post_id, $lang );
		if ( is_wp_error( $page ) ) {
			return $page;
		}
		$out = array( 'regular' => array(), 'gettext' => array() );
		foreach ( $page['entries'] as $e ) {
			$out[ 'regular' === $e['source'] ? 'regular' : 'gettext' ][] = (int) $e['id'];
		}
		return $out;
	}
}
