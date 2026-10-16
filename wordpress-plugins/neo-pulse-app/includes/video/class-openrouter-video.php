<?php
/**
 * OpenRouter video jobs (HeyGen Video / Grok Imagine): submit a clip from a first frame (and optional target last frame), poll, download.
 *
 * @package Neo_Pulse_App
 */

defined( 'ABSPATH' ) || exit;

class Neo_Pulse_App_Openrouter_Video {

	const VIDEOS_URL = 'https://openrouter.ai/api/v1/videos';

	/**
	 * @param array{model:string,prompt:string,duration:int,resolution:string,aspectRatio:string,firstFrameDataUrl:string,lastFrameDataUrl?:string} $opts
	 * @return array{id:string,pollingUrl:string}|WP_Error
	 */
	public static function submit( string $api_key, array $opts ) {
		$frame_images = array(
			array(
				'type'       => 'image_url',
				'image_url'  => array( 'url' => $opts['firstFrameDataUrl'] ),
				'frame_type' => 'first_frame',
			),
		);
		if ( ! empty( $opts['lastFrameDataUrl'] ) ) {
			$frame_images[] = array(
				'type'       => 'image_url',
				'image_url'  => array( 'url' => (string) $opts['lastFrameDataUrl'] ),
				'frame_type' => 'last_frame',
			);
		}

		$response = wp_remote_post(
			self::VIDEOS_URL,
			array(
				'timeout' => 120,
				'headers' => Neo_Pulse_App_Openrouter_Attribution::request_headers( $api_key ),
				'body'    => wp_json_encode(
					array(
						'model'        => $opts['model'],
						'prompt'       => $opts['prompt'],
						'duration'     => (int) $opts['duration'],
						'resolution'   => $opts['resolution'],
						'aspect_ratio' => $opts['aspectRatio'],
						'frame_images' => $frame_images,
					)
				),
			)
		);
		$json = self::decode( $response );
		if ( is_wp_error( $json ) ) {
			return $json;
		}
		$id = isset( $json['id'] ) ? trim( (string) $json['id'] ) : '';
		if ( $id === '' ) {
			return new WP_Error( 'neo-pulse_openrouter_video', 'OpenRouter returned no video job id' );
		}
		return array(
			'id'         => $id,
			'pollingUrl' => isset( $json['polling_url'] ) ? (string) $json['polling_url'] : self::VIDEOS_URL . '/' . rawurlencode( $id ),
		);
	}

	/**
	 * @return array{status:string,unsignedUrl:string,error:string}|WP_Error
	 */
	public static function status( string $api_key, string $job_id ) {
		$response = wp_remote_get(
			self::VIDEOS_URL . '/' . rawurlencode( $job_id ),
			array(
				'timeout' => 60,
				'headers' => Neo_Pulse_App_Openrouter_Attribution::request_headers( $api_key ),
			)
		);
		$json = self::decode( $response );
		if ( is_wp_error( $json ) ) {
			return $json;
		}
		$urls  = isset( $json['unsigned_urls'] ) && is_array( $json['unsigned_urls'] ) ? array_values( $json['unsigned_urls'] ) : array();
		$error = '';
		if ( isset( $json['error'] ) ) {
			$error = is_array( $json['error'] ) ? (string) ( $json['error']['message'] ?? wp_json_encode( $json['error'] ) ) : (string) $json['error'];
		}
		return array(
			'status'      => isset( $json['status'] ) ? strtolower( (string) $json['status'] ) : '',
			'unsignedUrl' => isset( $urls[0] ) && is_string( $urls[0] ) ? $urls[0] : '',
			'error'       => $error,
		);
	}

	/**
	 * Download a finished clip to disk (unsigned URLs require the bearer header).
	 *
	 * @return true|WP_Error
	 */
	public static function download( string $api_key, string $unsigned_url, string $dest_path ) {
		$response = wp_remote_get(
			$unsigned_url,
			array(
				'timeout'  => 300,
				'stream'   => true,
				'filename' => $dest_path,
				'headers'  => array( 'Authorization' => 'Bearer ' . $api_key ),
			)
		);
		if ( is_wp_error( $response ) ) {
			return $response;
		}
		$code = (int) wp_remote_retrieve_response_code( $response );
		if ( $code < 200 || $code >= 300 ) {
			@unlink( $dest_path );
			return new WP_Error( 'neo-pulse_openrouter_video', 'Clip download failed with HTTP ' . $code );
		}
		if ( ! is_file( $dest_path ) || filesize( $dest_path ) < 1024 ) {
			@unlink( $dest_path );
			return new WP_Error( 'neo-pulse_openrouter_video', 'Clip download produced an empty file' );
		}
		return true;
	}

	/**
	 * @param array|WP_Error $response
	 * @return array<string,mixed>|WP_Error
	 */
	private static function decode( $response ) {
		if ( is_wp_error( $response ) ) {
			return $response;
		}
		$code = (int) wp_remote_retrieve_response_code( $response );
		$json = json_decode( wp_remote_retrieve_body( $response ), true );
		if ( $code < 200 || $code >= 300 ) {
			$msg = is_array( $json )
				? (string) ( $json['error']['message'] ?? $json['message'] ?? 'OpenRouter video error' )
				: 'OpenRouter video error';
			return new WP_Error( 'neo-pulse_openrouter_video', 'OpenRouter ' . $code . ': ' . $msg );
		}
		if ( ! is_array( $json ) ) {
			return new WP_Error( 'neo-pulse_openrouter_video', 'OpenRouter returned invalid JSON' );
		}
		return $json;
	}
}
