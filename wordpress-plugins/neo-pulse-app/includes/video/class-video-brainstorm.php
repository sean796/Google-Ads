<?php
/**
 * /api/video/brainstorm/* routes: save a client video, sample small frames for the Brainstorm agent, then cut the chosen beats
 * as full-size stills plus one contact sheet. Files live beside renders in {uploads}/neo-pulse-video/{id}/.
 *
 * @package Neo_Pulse_App
 */

defined( 'ABSPATH' ) || exit;

class Neo_Pulse_App_Video_Brainstorm {

	const MAX_VIDEO_BYTES  = 41943040;
	const SAMPLE_INTERVAL  = 2;
	const SAMPLE_WIDTH     = 320;
	const SHEET_COLUMNS    = 3;
	const SHEET_CELL_WIDTH = 640;
	const MAX_BEATS        = 24;
	const MAX_SUBJECT_PHOTOS  = 8;
	const MAX_SUBJECT_BYTES   = 12582912;
	// 16:9 cells so a 2x2 sheet of locked product renders is 1920x1080 and keeps their detail.
	const SUBJECT_CELL_WIDTH  = 960;
	const SUBJECT_CELL_HEIGHT = 540;

	/**
	 * @param array<string,mixed> $body
	 */
	public static function dispatch_http( string $subpath, string $method, array $body ): void {
		$subpath = trim( $subpath, '/' );
		if ( $subpath === 'frames' && $method === 'POST' ) {
			self::send( self::frames( $body ) );
			return;
		}
		if ( $subpath === 'subject' && $method === 'POST' ) {
			self::send( self::subject( $body ) );
			return;
		}
		if ( preg_match( '#^([A-Za-z0-9-]+)/beats$#', $subpath, $m ) && $method === 'POST' ) {
			self::send( self::beats( $m[1], $body ) );
			return;
		}
		Neo_Pulse_App_Api_Dispatcher::send_json( array( 'ok' => false, 'error' => 'Not found' ), 404 );
	}

	/**
	 * @param array<string,mixed>|WP_Error $result
	 */
	private static function send( $result ): void {
		if ( is_wp_error( $result ) ) {
			$status = (int) ( $result->get_error_data()['status'] ?? 500 );
			Neo_Pulse_App_Api_Dispatcher::send_json( array( 'ok' => false, 'error' => $result->get_error_message() ), $status );
			return;
		}
		Neo_Pulse_App_Api_Dispatcher::send_json( array_merge( array( 'ok' => true ), $result ) );
	}

	private static function bad_request( string $message ): WP_Error {
		return new WP_Error( 'neo-pulse_video_brainstorm', $message, array( 'status' => 400 ) );
	}

	private static function source_path( string $id ): string {
		$files = glob( Neo_Pulse_App_Video_Render_Store::dir( $id ) . '/source.*' );
		return is_array( $files ) && $files ? $files[0] : '';
	}

	private static function data_url( string $path ): string {
		$ext  = strtolower( pathinfo( $path, PATHINFO_EXTENSION ) );
		$mime = $ext === 'jpg' ? 'image/jpeg' : 'image/' . $ext;
		return 'data:' . $mime . ';base64,' . base64_encode( (string) file_get_contents( $path ) );
	}

	/**
	 * POST video/brainstorm/frames  {fileName, dataUrl}: save the video, probe it, return one small frame every 2 s.
	 *
	 * @param array<string,mixed> $body
	 * @return array<string,mixed>|WP_Error
	 */
	private static function frames( array $body ) {
		$data_url = isset( $body['dataUrl'] ) ? (string) $body['dataUrl'] : '';
		if ( ! preg_match( '#^data:video/([a-z0-9.+-]+);base64,#i', $data_url, $m ) ) {
			return self::bad_request( 'dataUrl must be a base64 video data URL' );
		}
		$raw = base64_decode( substr( $data_url, strlen( $m[0] ) ), true );
		unset( $data_url, $body );
		if ( $raw === false || strlen( $raw ) < 1024 ) {
			return self::bad_request( 'dataUrl is not valid base64 video data' );
		}
		if ( strlen( $raw ) > self::MAX_VIDEO_BYTES ) {
			return self::bad_request( 'Video is larger than ' . (int) ( self::MAX_VIDEO_BYTES / 1048576 ) . ' MB' );
		}
		$preflight = Neo_Pulse_App_Video_Stitch::preflight();
		if ( is_wp_error( $preflight ) ) {
			return $preflight;
		}
		$ext = strtolower( $m[1] ) === 'quicktime' ? 'mov' : preg_replace( '/[^a-z0-9]/', '', strtolower( $m[1] ) );
		$id  = Neo_Pulse_App_Video_Render_Store::new_id();
		$dir = Neo_Pulse_App_Video_Render_Store::dir( $id );
		if ( ! wp_mkdir_p( $dir ) ) {
			return new WP_Error( 'neo-pulse_video_brainstorm', 'Could not create folder ' . $dir );
		}
		$src = $dir . '/source.' . $ext;
		if ( file_put_contents( $src, $raw ) === false ) {
			return new WP_Error( 'neo-pulse_video_brainstorm', 'Could not write the video file' );
		}
		unset( $raw );
		$info = Neo_Pulse_App_Video_Stitch::probe( $src );
		if ( is_wp_error( $info ) ) {
			return $info;
		}
		$files = Neo_Pulse_App_Video_Stitch::sample_frames( $src, $dir, self::SAMPLE_INTERVAL, self::SAMPLE_WIDTH );
		if ( is_wp_error( $files ) ) {
			return $files;
		}
		$samples = array();
		foreach ( $files as $i => $file ) {
			$samples[] = array(
				'time'    => $i * self::SAMPLE_INTERVAL,
				'dataUrl' => self::data_url( $file ),
			);
		}
		return array(
			'id'              => $id,
			'durationSeconds' => round( (float) $info['duration'], 2 ),
			'width'           => (int) $info['width'],
			'height'          => (int) $info['height'],
			'samples'         => $samples,
		);
	}

	/**
	 * POST video/brainstorm/subject  {images:[{fileName, dataUrl}]}: the product photos tiled into one subject-harness sheet
	 * (mixed sizes and orientations fitted into equal cells) that is attached first to every agent and storyboard frame.
	 *
	 * @param array<string,mixed> $body
	 * @return array<string,mixed>|WP_Error
	 */
	private static function subject( array $body ) {
		$images = isset( $body['images'] ) && is_array( $body['images'] ) ? array_values( $body['images'] ) : array();
		if ( ! $images || count( $images ) > self::MAX_SUBJECT_PHOTOS ) {
			return self::bad_request( 'images must hold 1 to ' . self::MAX_SUBJECT_PHOTOS . ' subject photos' );
		}
		$preflight = Neo_Pulse_App_Video_Stitch::preflight();
		if ( is_wp_error( $preflight ) ) {
			return $preflight;
		}
		$id  = Neo_Pulse_App_Video_Render_Store::new_id();
		$dir = Neo_Pulse_App_Video_Render_Store::dir( $id );
		if ( ! wp_mkdir_p( $dir ) ) {
			return new WP_Error( 'neo-pulse_video_brainstorm', 'Could not create folder ' . $dir );
		}
		$files = array();
		foreach ( $images as $i => $image ) {
			$data_url = is_array( $image ) && isset( $image['dataUrl'] ) ? (string) $image['dataUrl'] : '';
			if ( ! preg_match( '#^data:image/(png|jpeg|jpg|webp);base64,#i', $data_url, $m ) ) {
				return self::bad_request( 'images[' . $i . '].dataUrl must be a base64 PNG, JPEG or WebP data URL' );
			}
			$raw = base64_decode( substr( $data_url, strlen( $m[0] ) ), true );
			if ( $raw === false || strlen( $raw ) < 512 ) {
				return self::bad_request( 'images[' . $i . '].dataUrl is not valid base64 image data' );
			}
			if ( strlen( $raw ) > self::MAX_SUBJECT_BYTES ) {
				return self::bad_request( 'images[' . $i . '] is larger than ' . (int) ( self::MAX_SUBJECT_BYTES / 1048576 ) . ' MB' );
			}
			$ext  = strtolower( $m[1] ) === 'jpeg' ? 'jpg' : strtolower( $m[1] );
			$file = $dir . '/subject-' . str_pad( (string) ( $i + 1 ), 2, '0', STR_PAD_LEFT ) . '.' . $ext;
			if ( file_put_contents( $file, $raw ) === false ) {
				return new WP_Error( 'neo-pulse_video_brainstorm', 'Could not write subject photo ' . ( $i + 1 ) );
			}
			$files[] = $file;
		}
		unset( $raw, $data_url, $images, $body );
		$sheet = $dir . '/subject-harness.png';
		$tiled = Neo_Pulse_App_Video_Stitch::tile_sheet( $files, $sheet, min( 3, count( $files ) ), self::SUBJECT_CELL_WIDTH, self::SUBJECT_CELL_HEIGHT );
		if ( is_wp_error( $tiled ) ) {
			return $tiled;
		}
		return array(
			'id'             => $id,
			'harnessDataUrl' => self::data_url( $sheet ),
		);
	}

	/**
	 * POST video/brainstorm/{id}/beats  {times:number[]}: full-size still per time, in order, plus one contact sheet.
	 *
	 * @param array<string,mixed> $body
	 * @return array<string,mixed>|WP_Error
	 */
	private static function beats( string $id, array $body ) {
		if ( ! Neo_Pulse_App_Video_Render_Store::valid_id( $id ) ) {
			return self::bad_request( 'Invalid brainstorm id' );
		}
		$src = self::source_path( $id );
		if ( $src === '' ) {
			return new WP_Error( 'neo-pulse_video_brainstorm', 'Brainstorm video not found', array( 'status' => 404 ) );
		}
		$times = isset( $body['times'] ) && is_array( $body['times'] ) ? array_values( $body['times'] ) : array();
		if ( ! $times || count( $times ) > self::MAX_BEATS ) {
			return self::bad_request( 'times must hold 1 to ' . self::MAX_BEATS . ' beat times' );
		}
		$info = Neo_Pulse_App_Video_Stitch::probe( $src );
		if ( is_wp_error( $info ) ) {
			return $info;
		}
		$dir   = Neo_Pulse_App_Video_Render_Store::dir( $id );
		$pngs  = array();
		$beats = array();
		foreach ( $times as $i => $t ) {
			if ( ! is_numeric( $t ) || (float) $t < 0 || (float) $t > (float) $info['duration'] ) {
				return self::bad_request( 'times[' . $i . '] is outside the video (0..' . round( (float) $info['duration'], 2 ) . ' s)' );
			}
			$png  = $dir . '/beat-' . str_pad( (string) ( $i + 1 ), 2, '0', STR_PAD_LEFT ) . '.png';
			$grab = Neo_Pulse_App_Video_Stitch::frame_at( $src, (float) $t, $png );
			if ( is_wp_error( $grab ) ) {
				return $grab;
			}
			$pngs[]  = $png;
			$beats[] = array(
				'time'    => (float) $t,
				'dataUrl' => self::data_url( $png ),
			);
		}
		$sheet = $dir . '/contact-sheet.png';
		$tiled = Neo_Pulse_App_Video_Stitch::tile_sheet( $pngs, $sheet, self::SHEET_COLUMNS, self::SHEET_CELL_WIDTH );
		if ( is_wp_error( $tiled ) ) {
			return $tiled;
		}
		return array(
			'beats'        => $beats,
			'sheetDataUrl' => self::data_url( $sheet ),
		);
	}
}
