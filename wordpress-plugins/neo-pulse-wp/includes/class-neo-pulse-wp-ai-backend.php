<?php
/**
 * Flow Node API base URL for GSC / SEO research proxies.
 *
 * @package Neo_Pulse_Wp
 */

defined( 'ABSPATH' ) || exit;

class Neo_Pulse_Wp_Ai_Backend {

	public static function api_base(): string {
		$settings = Neo_Pulse_Wp_Api::get_effective_settings();
		$base     = is_array( $settings ) && ! empty( $settings['api_base'] )
			? trim( (string) $settings['api_base'] )
			: '';
		if ( $base === '' ) {
			return '';
		}
		return (string) apply_filters( 'neo_pulse_wp_flow_api_base', $base );
	}

	public static function is_available(): bool {
		return self::api_base() !== '';
	}

	/**
	 * @param string               $path e.g. /api/gsc/fetch-page-performance
	 * @param array<string,mixed>  $body
	 * @param int                  $timeout
	 * @return array|WP_Error
	 */
	public static function post_json( string $path, array $body, int $timeout = 120 ) {
		$base = self::api_base();
		if ( $base === '' ) {
			return new WP_Error(
				'neo-pulse_flow_api_missing',
				__( 'NEO Pulse API URL is not configured. Set it under NEO Pulse WP → Settings or NEO_PULSE_WP_DEFAULT_API_BASE in the plugin build.', 'neo-pulse-wp' )
			);
		}

		$path = '/' . ltrim( $path, '/' );
		$url  = untrailingslashit( $base ) . $path;

		$response = wp_remote_post(
			$url,
			array(
				'timeout' => $timeout,
				'headers' => array(
					'Content-Type' => 'application/json; charset=utf-8',
					'Accept'       => 'application/json',
				),
				'body'    => wp_json_encode( $body ),
			)
		);

		if ( is_wp_error( $response ) ) {
			return $response;
		}

		$code = (int) wp_remote_retrieve_response_code( $response );
		$raw  = wp_remote_retrieve_body( $response );
		$data = json_decode( $raw, true );

		if ( $code < 200 || $code >= 300 ) {
			$msg = '';
			if ( is_array( $data ) ) {
				if ( ! empty( $data['error'] ) && is_string( $data['error'] ) ) {
					$msg = $data['error'];
				} elseif ( ! empty( $data['message'] ) && is_string( $data['message'] ) ) {
					$msg = $data['message'];
				}
			}
			if ( $msg === '' ) {
				$msg = $raw !== '' ? $raw : sprintf( 'HTTP %d', $code );
			}
			return new WP_Error( 'neo-pulse_flow_api_http', $msg, array( 'status' => $code ) );
		}

		return is_array( $data ) ? $data : array();
	}

	/**
	 * @return array{siteUrl:string,pageUrl:string,companyName:string}
	 */
	public static function resolve_urls( int $post_id ): array {
		$site = esc_url_raw( home_url( '/' ) );

		$page = get_permalink( $post_id );
		$page = is_string( $page ) ? esc_url_raw( trim( $page ) ) : '';
		if ( $page === '' ) {
			$page = esc_url_raw( trim( Neo_Pulse_Wp_Ai_Context::read_field_value( $post_id, 'page_url' ) ) );
		}

		return array(
			'siteUrl'     => $site,
			'pageUrl'     => $page,
			'companyName' => '',
		);
	}
}
