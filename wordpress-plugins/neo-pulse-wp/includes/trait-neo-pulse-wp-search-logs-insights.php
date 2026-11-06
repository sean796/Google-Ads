<?php
/**
 * Search logging, accepted results, and public insights.
 *
 * @package Neo_Pulse_Wp
 */

defined( 'ABSPATH' ) || exit;

trait Neo_Pulse_Wp_Search_Trait_Logs_Insights {

	/**
	 * @param WP_REST_Request $request Request.
	 * @return WP_REST_Response|WP_Error
	 */
	public static function handle_search_log( WP_REST_Request $request ) {
		if ( Neo_Pulse_Wp_OpenRouter::rate_limit_exceeded( 'search_log', self::LOG_RATE_LIMIT_MAX, self::LOG_RATE_LIMIT_WINDOW ) ) {
			return new WP_REST_Response( array( 'ok' => false, 'error' => 'rate_limited' ), 429 );
		}

		$body = $request->get_json_params();
		if ( ! is_array( $body ) ) {
			$body = array();
		}

		$result = Neo_Pulse_Wp_Search_Logs::insert(
			array(
				'session_id'   => isset( $body['session_id'] ) ? (string) $body['session_id'] : '',
				'page_url'     => isset( $body['page_url'] ) ? (string) $body['page_url'] : '',
				'query'        => isset( $body['query'] ) ? (string) $body['query'] : '',
				'result_count' => isset( $body['result_count'] ) ? (int) $body['result_count'] : 0,
				'intent'       => isset( $body['intent'] ) ? (string) $body['intent'] : '',
				'sentiment'    => isset( $body['sentiment'] ) ? (string) $body['sentiment'] : '',
				'results'      => isset( $body['results'] ) && is_array( $body['results'] ) ? $body['results'] : array(),
			)
		);

		if ( empty( $result['ok'] ) ) {
			$status = ( isset( $result['error'] ) && $result['error'] === 'logging_disabled' ) ? 200 : 400;
			return new WP_REST_Response( $result, $status );
		}

		return new WP_REST_Response(
			array(
				'ok'       => true,
				'eventUid' => $result['event_uid'],
			),
			200
		);
	}

	/**
	 * @param WP_REST_Request $request Request.
	 * @return WP_REST_Response|WP_Error
	 */
	public static function handle_search_accept( WP_REST_Request $request ) {
		if ( Neo_Pulse_Wp_OpenRouter::rate_limit_exceeded( 'search_log', self::LOG_RATE_LIMIT_MAX, self::LOG_RATE_LIMIT_WINDOW ) ) {
			return new WP_REST_Response( array( 'ok' => false, 'error' => 'rate_limited' ), 429 );
		}

		$body = $request->get_json_params();
		if ( ! is_array( $body ) ) {
			$body = array();
		}

		// Accepted pages feed the public "Others also found" list, so only real, public pages
		// on this site count, and the title always comes from the post (never from the browser).
		$post = self::public_post_for_url( isset( $body['url'] ) ? (string) $body['url'] : '' );
		if ( null === $post ) {
			return new WP_REST_Response( array( 'ok' => false, 'error' => 'invalid_url' ), 400 );
		}
		$permalink = get_permalink( $post );

		$result = Neo_Pulse_Wp_Search_Logs::record_accept(
			array(
				'event_uid' => isset( $body['eventUid'] ) ? (string) $body['eventUid'] : '',
				'url'       => is_string( $permalink ) && $permalink !== '' ? $permalink : (string) $body['url'],
				'title'     => html_entity_decode( get_the_title( $post ), ENT_QUOTES, 'UTF-8' ),
				'rank'      => isset( $body['rank'] ) ? (int) $body['rank'] : 0,
			)
		);

		if ( empty( $result['ok'] ) ) {
			$status = ( isset( $result['error'] ) && $result['error'] === 'logging_disabled' ) ? 200 : 400;
			return new WP_REST_Response( $result, $status );
		}

		return new WP_REST_Response( array( 'ok' => true ), 200 );
	}

	/**
	 * Published, non-password post on this site for a URL, or null.
	 */
	private static function public_post_for_url( string $url ): ?WP_Post {
		$url = esc_url_raw( trim( $url ) );
		if ( $url === '' ) {
			return null;
		}
		$host = wp_parse_url( $url, PHP_URL_HOST );
		$home = wp_parse_url( home_url(), PHP_URL_HOST );
		if ( ! is_string( $host ) || ! is_string( $home ) || strtolower( $host ) !== strtolower( $home ) ) {
			return null;
		}
		$post_id = url_to_postid( $url );
		if ( $post_id < 1 ) {
			return null;
		}
		$post = get_post( $post_id );
		if ( ! $post instanceof WP_Post || $post->post_status !== 'publish' || (string) $post->post_password !== '' ) {
			return null;
		}
		return $post;
	}

	/**
	 * Public insights lists (aggregates only). Days come from the site settings, never the request;
	 * the widget picks its sections and a list size of 1–12, so the cache stays small and bounded.
	 *
	 * @param WP_REST_Request $request Request.
	 * @return WP_REST_Response
	 */
	public static function handle_search_insights( WP_REST_Request $request ): WP_REST_Response {
		$insights = Neo_Pulse_Wp_Ai_Widget_Design::resolve_search_insights( array() );
		$days     = max( 1, min( 365, (int) ( $insights['insights_days'] ?? 30 ) ) );
		$limit    = max( 1, min( 12, (int) ( $insights['popular_terms_limit'] ?? 5 ) ) );
		$req_lim  = $request->get_param( 'limit' );
		if ( is_scalar( $req_lim ) && (int) $req_lim > 0 ) {
			$limit = min( 12, (int) $req_lim );
		}

		// The widget says which sections it shows (each widget has its own switches).
		$asked = $request->get_param( 'sections' );
		if ( is_string( $asked ) && $asked !== '' ) {
			$asked = array_map( 'trim', explode( ',', $asked ) );
			$insights['show_popular_terms']          = in_array( 'popular_terms', $asked, true );
			$insights['show_popular_pages_overseer'] = in_array( 'popular_pages_overseer', $asked, true );
			$insights['show_popular_pages_search']   = in_array( 'popular_pages_search', $asked, true );
		}

		$payload = array(
			'popularTerms'            => array(),
			'popularPagesOverseer'    => array(),
			'popularPagesFromSearch'  => array(),
		);

		if ( ! empty( $insights['show_popular_terms'] ) ) {
			$payload['popularTerms'] = Neo_Pulse_Wp_Search_Popular::terms( $days, $limit, (string) $request->get_param( 'pinned' ) !== '0' );
		}
		if ( ! empty( $insights['show_popular_pages_overseer'] ) ) {
			$payload['popularPagesOverseer'] = Neo_Pulse_Wp_Search_Logs::aggregate_popular_pages_overseer( $days, $limit );
		}
		if ( ! empty( $insights['show_popular_pages_search'] ) ) {
			$payload['popularPagesFromSearch'] = Neo_Pulse_Wp_Search_Logs::aggregate_popular_pages_from_search( $days, $limit );
		}
		foreach ( array( 'popularPagesOverseer', 'popularPagesFromSearch' ) as $list ) {
			$payload[ $list ] = self::with_page_details( $payload[ $list ] );
		}

		return new WP_REST_Response( $payload, 200 );
	}

	/**
	 * Add a thumbnail and a type label ("Page", "Blog") to popular page rows.
	 *
	 * @param array<int,array<string,mixed>> $rows
	 * @return array<int,array<string,mixed>>
	 */
	private static function with_page_details( array $rows ): array {
		foreach ( $rows as $i => $row ) {
			$post_id = isset( $row['url'] ) ? url_to_postid( (string) $row['url'] ) : 0;
			$rows[ $i ]['thumb']      = $post_id ? (string) get_the_post_thumbnail_url( $post_id, 'thumbnail' ) : '';
			$rows[ $i ]['type_label'] = $post_id ? self::content_type_label( (string) get_post_type( $post_id ) ) : '';
		}
		return $rows;
	}
}
