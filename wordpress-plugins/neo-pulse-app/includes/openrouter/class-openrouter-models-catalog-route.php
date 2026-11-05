<?php
/**
 * GET /api/openrouter/models — cached OpenRouter catalog for Dashboard model pickers.
 *
 * @package Neo_Pulse_App
 */

defined( 'ABSPATH' ) || exit;

class Neo_Pulse_App_Openrouter_Models_Catalog_Route {

	const MODELS_URL     = 'https://openrouter.ai/api/v1/models';
	/** Video generation models are not in the base catalog; OpenRouter lists them only with this filter. */
	const VIDEO_MODELS_URL = 'https://openrouter.ai/api/v1/models?output_modalities=video';
	const TRANSIENT_KEY  = 'neo_pulse_openrouter_models_catalog_v3';
	const TRANSIENT_TTL  = 82800; // 23 hours

	/**
	 * @return void
	 */
	public static function send_catalog(): void {
		$cached = get_transient( self::TRANSIENT_KEY );
		if ( is_array( $cached ) && isset( $cached['models'] ) && is_array( $cached['models'] ) ) {
			Neo_Pulse_App_Api_Dispatcher::send_json(
				array(
					'ok'       => true,
					'models'   => $cached['models'],
					'cachedAt' => isset( $cached['cachedAt'] ) ? (string) $cached['cachedAt'] : gmdate( 'c' ),
				),
				200
			);
			return;
		}

		$api_key = class_exists( 'Neo_Pulse_App_Secrets' )
			? Neo_Pulse_App_Secrets::openrouter_api_key_for_request( array() )
			: '';
		$headers = Neo_Pulse_App_Openrouter_Attribution::attribution_headers();
		if ( $api_key !== '' ) {
			$headers['Authorization'] = 'Bearer ' . $api_key;
		}
		$response = wp_remote_get(
			self::MODELS_URL,
			array(
				'timeout' => 60,
				'headers' => $headers,
			)
		);

		if ( is_wp_error( $response ) ) {
			Neo_Pulse_App_Api_Dispatcher::send_json(
				array(
					'ok'    => false,
					'error' => $response->get_error_message(),
				),
				502
			);
			return;
		}

		$code = (int) wp_remote_retrieve_response_code( $response );
		$body = (string) wp_remote_retrieve_body( $response );
		$decoded = json_decode( $body, true );
		if ( $code < 200 || $code >= 300 || ! is_array( $decoded ) ) {
			Neo_Pulse_App_Api_Dispatcher::send_json(
				array(
					'ok'    => false,
					'error' => 'OpenRouter models HTTP ' . $code,
				),
				502
			);
			return;
		}

		$models = self::normalize_models_payload( $decoded );

		$video_response = wp_remote_get(
			self::VIDEO_MODELS_URL,
			array(
				'timeout' => 60,
				'headers' => $headers,
			)
		);
		if ( is_wp_error( $video_response ) ) {
			Neo_Pulse_App_Api_Dispatcher::send_json(
				array(
					'ok'    => false,
					'error' => $video_response->get_error_message(),
				),
				502
			);
			return;
		}
		$video_code    = (int) wp_remote_retrieve_response_code( $video_response );
		$video_decoded = json_decode( (string) wp_remote_retrieve_body( $video_response ), true );
		if ( $video_code < 200 || $video_code >= 300 || ! is_array( $video_decoded ) ) {
			Neo_Pulse_App_Api_Dispatcher::send_json(
				array(
					'ok'    => false,
					'error' => 'OpenRouter video models HTTP ' . $video_code,
				),
				502
			);
			return;
		}
		$models = array_merge( $models, self::normalize_models_payload( $video_decoded ) );

		$cached_at = gmdate( 'c' );
		set_transient(
			self::TRANSIENT_KEY,
			array(
				'models'   => $models,
				'cachedAt' => $cached_at,
			),
			self::TRANSIENT_TTL
		);

		Neo_Pulse_App_Api_Dispatcher::send_json(
			array(
				'ok'       => true,
				'models'   => $models,
				'cachedAt' => $cached_at,
			),
			200
		);
	}

	/**
	 * @param array<string,mixed> $raw OpenRouter /models JSON.
	 * @return array<int,array<string,mixed>>
	 */
	private static function normalize_models_payload( array $raw ): array {
		$data = isset( $raw['data'] ) && is_array( $raw['data'] ) ? $raw['data'] : array();
		$out  = array();
		foreach ( $data as $row ) {
			if ( ! is_array( $row ) ) {
				continue;
			}
			$id = isset( $row['id'] ) ? trim( (string) $row['id'] ) : '';
			if ( $id === '' ) {
				continue;
			}
			$name = isset( $row['name'] ) ? trim( (string) $row['name'] ) : '';
			if ( $name === '' ) {
				$name = $id;
			}
			$pricing = isset( $row['pricing'] ) && is_array( $row['pricing'] ) ? $row['pricing'] : array();
			$arch    = isset( $row['architecture'] ) && is_array( $row['architecture'] ) ? $row['architecture'] : array();
			$output  = isset( $arch['output_modalities'] ) && is_array( $arch['output_modalities'] )
				? $arch['output_modalities']
				: array();
			$text_output  = count( $output ) === 0 || in_array( 'text', $output, true );
			$image_output = in_array( 'image', $output, true );
			$video_output = in_array( 'video', $output, true );
			$context      = isset( $row['context_length'] ) ? (int) $row['context_length'] : null;

			$out[] = array(
				'id'                     => $id,
				'name'                   => $name,
				'promptUsdPerToken'      => self::parse_usd_per_token( $pricing['prompt'] ?? null ),
				'completionUsdPerToken'  => self::parse_usd_per_token( $pricing['completion'] ?? null ),
				'imageUsdPerToken'       => self::parse_usd_per_token( $pricing['image'] ?? null ),
				'contextLength'          => $context > 0 ? $context : null,
				'textOutput'             => $text_output,
				'imageOutput'            => $image_output,
				'videoOutput'            => $video_output,
			);
		}
		return $out;
	}

	/**
	 * @param mixed $value Pricing field from OpenRouter.
	 */
	private static function parse_usd_per_token( $value ): ?float {
		if ( $value === null || $value === '' ) {
			return null;
		}
		if ( is_numeric( $value ) ) {
			$num = (float) $value;
			return $num >= 0 ? $num : null;
		}
		return null;
	}
}
