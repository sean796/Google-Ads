<?php
/**
 * Image fetch and prepare routes (GD-based upscale).
 *
 * @package Neo_Pulse_App
 */

defined( 'ABSPATH' ) || exit;

class Neo_Pulse_App_Image_Fetch_Data_Url {

	const MAX_BYTES = 12582912;

	/**
	 * @param array<string,mixed> $body Request body.
	 * @return array{status:int,body:array<string,mixed>}
	 */
	public static function fetch( array $body ): array {
		$url = isset( $body['url'] ) ? trim( (string) $body['url'] ) : '';
		$ssrf_error = Neo_Pulse_App_Ssrf_Guard::validate_public_url( $url, true );
		if ( $ssrf_error !== null ) {
			return array( 'status' => 400, 'body' => array( 'error' => $ssrf_error ) );
		}

		$referer = isset( $body['referer'] ) ? trim( (string) $body['referer'] ) : '';
		if ( $referer === '' || ! preg_match( '#^https?://#i', $referer ) ) {
			$referer = 'https://www.google.com/';
		}

		$response = Neo_Pulse_App_Ssrf_Guard::get(
			$url,
			array(
				'timeout'     => 25,
				'limit_response_size' => self::MAX_BYTES,
				'user-agent'  => 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
				'headers'     => array(
					'Accept'          => 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
					'Accept-Language' => 'en-US,en;q=0.9',
					'Referer'         => $referer,
				),
			),
			3,
			true
		);

		if ( is_wp_error( $response ) ) {
			return array( 'status' => 502, 'body' => array( 'error' => $response->get_error_message() ) );
		}

		$code = (int) wp_remote_retrieve_response_code( $response );
		$raw  = wp_remote_retrieve_body( $response );
		if ( $code !== 200 || $raw === '' ) {
			return array(
				'status' => 200,
				'body'   => array(
					'success' => false,
					'error'   => 'Failed to download image (' . $code . ')',
				),
			);
		}

		if ( strlen( $raw ) > self::MAX_BYTES ) {
			return array( 'status' => 413, 'body' => array( 'error' => 'Image too large' ) );
		}

		$mime = self::sniff_mime( $raw );
		if ( $mime === null ) {
			$header = wp_remote_retrieve_header( $response, 'content-type' );
			$header = is_string( $header ) ? strtolower( trim( explode( ';', $header )[0] ) ) : '';
			if ( strpos( $header, 'image/' ) === 0 && $header !== 'image/svg+xml' ) {
				$mime = $header;
			}
		}
		if ( $mime === null ) {
			return array(
				'status' => 200,
				'body'   => array(
					'success' => false,
					'error'   => 'URL did not return an image',
				),
			);
		}

		return array(
			'status' => 200,
			'body'   => array(
				'success' => true,
				'mime'    => $mime,
				'dataUrl' => 'data:' . $mime . ';base64,' . base64_encode( $raw ),
			),
		);
	}

	private static function sniff_mime( string $buffer ): ?string {
		if ( strlen( $buffer ) < 4 ) {
			return null;
		}
		$b = unpack( 'C*', substr( $buffer, 0, 12 ) );
		if ( ! $b ) {
			return null;
		}
		if ( $b[1] === 0xff && $b[2] === 0xd8 && $b[3] === 0xff ) {
			return 'image/jpeg';
		}
		if ( $b[1] === 0x89 && $b[2] === 0x50 && $b[3] === 0x4e && $b[4] === 0x47 ) {
			return 'image/png';
		}
		if ( $b[1] === 0x47 && $b[2] === 0x49 && $b[3] === 0x46 ) {
			return 'image/gif';
		}
		if ( $b[1] === 0x52 && $b[2] === 0x49 && $b[3] === 0x46 && $b[4] === 0x46 && isset( $b[9], $b[10] ) && $b[9] === 0x57 && $b[10] === 0x45 ) {
			return 'image/webp';
		}
		return null;
	}
}

class Neo_Pulse_App_Image_Prepare_Local {

	const MAX_BYTES        = 12582912;
	const MIN_SHORT_EDGE   = 96;
	const TARGET_LONG_EDGE = 1600;

	/**
	 * @param array<string,mixed> $body Request body.
	 * @return array{status:int,body:array<string,mixed>}
	 */
	public static function prepare( array $body ): array {
		$data_url = isset( $body['dataUrl'] ) ? trim( (string) $body['dataUrl'] ) : '';
		if ( $data_url === '' ) {
			return array( 'status' => 400, 'body' => array( 'error' => 'dataUrl is required' ) );
		}

		try {
			$input = self::buffer_from_data_url( $data_url );
		} catch ( Exception $e ) {
			return array(
				'status' => 400,
				'body'   => array(
					'error'        => $e->getMessage(),
					'rejectReason' => 'invalid_data_url',
				),
			);
		}

		if ( strlen( $input ) > self::MAX_BYTES ) {
			return array(
				'status' => 413,
				'body'   => array(
					'error'        => 'Image exceeds max size',
					'rejectReason' => 'too_large',
				),
			);
		}

		if ( ! function_exists( 'imagecreatefromstring' ) ) {
			return array( 'status' => 500, 'body' => array( 'error' => 'GD extension not available' ) );
		}

		$src = self::image_from_buffer( $input );
		if ( ! $src ) {
			return array(
				'status' => 422,
				'body'   => array(
					'error'        => 'Could not read image dimensions',
					'rejectReason' => 'unreadable',
				),
			);
		}

		$width  = imagesx( $src );
		$height = imagesy( $src );
		if ( $width < 1 || $height < 1 ) {
			imagedestroy( $src );
			return array(
				'status' => 422,
				'body'   => array(
					'error'        => 'Could not read image dimensions',
					'rejectReason' => 'unreadable',
				),
			);
		}

		$short_edge = min( $width, $height );
		$long_edge  = max( $width, $height );
		if ( $short_edge < self::MIN_SHORT_EDGE ) {
			imagedestroy( $src );
			return array(
				'status' => 422,
				'body'   => array(
					'error'        => "Image too tiny to recognize ({$width}x{$height}). Skipping.",
					'rejectReason' => 'too_small',
					'width'        => $width,
					'height'       => $height,
				),
			);
		}

		$upscaled  = false;
		$out_w     = $width;
		$out_h     = $height;
		$dest      = $src;

		if ( $long_edge < self::TARGET_LONG_EDGE ) {
			$scale = self::TARGET_LONG_EDGE / $long_edge;
			$out_w = (int) round( $width * $scale );
			$out_h = (int) round( $height * $scale );
			$dest  = imagecreatetruecolor( $out_w, $out_h );
			imagecopyresampled( $dest, $src, 0, 0, 0, 0, $out_w, $out_h, $width, $height );
			if ( $dest !== $src ) {
				imagedestroy( $src );
			}
			$upscaled = true;
		}

		ob_start();
		imagejpeg( $dest, null, 90 );
		$jpeg = ob_get_clean();
		imagedestroy( $dest );

		if ( ! is_string( $jpeg ) || $jpeg === '' ) {
			return array(
				'status' => 502,
				'body'   => array(
					'error'        => 'Prepare failed',
					'rejectReason' => 'prepare_failed',
				),
			);
		}

		return array(
			'status' => 200,
			'body'   => array(
				'success'       => true,
				'mime'          => 'image/jpeg',
				'dataUrl'       => 'data:image/jpeg;base64,' . base64_encode( $jpeg ),
				'width'         => $out_w,
				'height'        => $out_h,
				'upscaled'      => $upscaled,
				'sourceWidth'   => $width,
				'sourceHeight'  => $height,
			),
		);
	}

	/**
	 * @return \GdImage|resource|false
	 */
	private static function image_from_buffer( string $input ) {
		$src = @imagecreatefromstring( $input );
		if ( $src ) {
			return $src;
		}
		$is_webp = strlen( $input ) >= 12 && substr( $input, 8, 4 ) === 'WEBP';
		if ( $is_webp && function_exists( 'imagecreatefromwebp' ) ) {
			$tmp = function_exists( 'wp_tempnam' ) ? wp_tempnam( 'prepare-webp' ) : tempnam( sys_get_temp_dir(), 'prepare-webp' );
			if ( ! is_string( $tmp ) || $tmp === '' ) {
				return false;
			}
			if ( file_put_contents( $tmp, $input ) === false ) {
				return false;
			}
			$src = @imagecreatefromwebp( $tmp );
			unlink( $tmp );
			return $src;
		}
		return false;
	}

	private static function buffer_from_data_url( string $data_url ): string {
		$comma = strpos( $data_url, ',' );
		if ( $comma === false || strpos( $data_url, 'data:' ) !== 0 ) {
			throw new Exception( 'dataUrl must be a data:image/...;base64,... URL' );
		}
		$meta = strtolower( substr( $data_url, 0, $comma ) );
		if ( strpos( $meta, 'image/' ) === false || strpos( $meta, 'svg' ) !== false ) {
			throw new Exception( 'dataUrl must be a raster image' );
		}
		$raw = base64_decode( substr( $data_url, $comma + 1 ), true );
		if ( $raw === false ) {
			throw new Exception( 'Invalid base64 in dataUrl' );
		}
		return $raw;
	}
}

class Neo_Pulse_App_Images_Route_Handlers {

	/**
	 * @param string              $subpath Route after images/.
	 * @param string              $method  HTTP method.
	 * @param array<string,mixed> $body    JSON body.
	 */
	public static function dispatch_http( string $subpath, string $method, array $body ): void {
		$subpath = trim( $subpath, '/' );
		$method  = strtoupper( $method );

		if ( $subpath === 'fetch-data-url' && $method === 'POST' ) {
			$r = Neo_Pulse_App_Image_Fetch_Data_Url::fetch( $body );
			Neo_Pulse_App_Api_Dispatcher::send_json( $r['body'], $r['status'] );
			return;
		}

		if ( $subpath === 'prepare-local-image' && $method === 'POST' ) {
			$r = Neo_Pulse_App_Image_Prepare_Local::prepare( $body );
			Neo_Pulse_App_Api_Dispatcher::send_json( $r['body'], $r['status'] );
			return;
		}

		Neo_Pulse_App_Api_Dispatcher::send_json( array( 'error' => 'Not found' ), 404 );
	}
}
