<?php
/**
 * /api/video/brainstorm/* routes: save a client video, sample small frames for the Brainstorm agent, then cut the chosen beats
 * as full-size stills plus one contact sheet. Files live beside renders in {uploads}/neo-pulse-video/{id}/.
 *
 * @package Neo_Pulse_App
 */

defined( 'ABSPATH' ) || exit;

class Neo_Pulse_App_Video_Brainstorm {

	/** Stored source file (full client upload). */
	const MAX_VIDEO_BYTES       = 536870912;
	/** Each part sent to OpenRouter as base64 video_url (~70 MB raw stays under ~100 MB payload). */
	const LLM_SEGMENT_MAX_BYTES = 73400320;
	const MAX_LLM_SEGMENTS      = 12;
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
		if ( $subpath === 'upload' && $method === 'POST' ) {
			@set_time_limit( 600 );
			self::dispatch_upload_http();
			return;
		}
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
		if ( preg_match( '#^([A-Za-z0-9-]+)/slice-clips$#', $subpath, $m ) && $method === 'POST' ) {
			@set_time_limit( 300 );
			self::send( self::slice_clips( $m[1], $body ) );
			return;
		}
		Neo_Pulse_App_Api_Dispatcher::send_json( array( 'ok' => false, 'error' => 'Not found' ), 404 );
	}

	/** POST /api/video/brainstorm/upload multipart field `video` (no base64 in the browser). */
	public static function dispatch_upload_http(): void {
		@ini_set( 'memory_limit', '768M' );
		if ( empty( $_FILES['video']['tmp_name'] ) || ! is_uploaded_file( $_FILES['video']['tmp_name'] ) ) {
			self::send( self::bad_request( 'Multipart field video is required' ) );
			return;
		}
		$size = isset( $_FILES['video']['size'] ) ? (int) $_FILES['video']['size'] : 0;
		if ( $size < 1024 ) {
			self::send( self::bad_request( 'Uploaded video is empty or unreadable' ) );
			return;
		}
		if ( $size > self::MAX_VIDEO_BYTES ) {
			self::send(
				self::bad_request(
					'Video is larger than ' . (int) ( self::MAX_VIDEO_BYTES / 1048576 ) . ' MB'
				)
			);
			return;
		}
		$name         = isset( $_FILES['video']['name'] ) ? sanitize_file_name( (string) wp_unslash( $_FILES['video']['name'] ) ) : 'video.mov';
		$skip_samples = isset( $_POST['skipSamples'] ) && (string) wp_unslash( $_POST['skipSamples'] ) === '1';
		self::send( self::ingest_uploaded_file( (string) $_FILES['video']['tmp_name'], $name, $skip_samples ) );
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

	private static function video_data_url( string $path ): string {
		$ext  = strtolower( pathinfo( $path, PATHINFO_EXTENSION ) );
		$mime = ( $ext === 'mov' || $ext === 'qt' ) ? 'video/quicktime' : 'video/mp4';
		return 'data:' . $mime . ';base64,' . base64_encode( (string) file_get_contents( $path ) );
	}

	/**
	 * @param array<int,array{part:int,startSec:float,endSec:float,path:string}> $segments
	 * @return array<int,array{part:int,startSec:float,endSec:float}>
	 */
	private static function llm_segments_meta( array $segments ): array {
		$out = array();
		foreach ( $segments as $seg ) {
			$out[] = array(
				'part'     => (int) $seg['part'],
				'startSec' => (float) $seg['startSec'],
				'endSec'   => (float) $seg['endSec'],
			);
		}
		return $out;
	}

	/**
	 * @param array<int,array{part:int,startSec:float,endSec:float,path:string}> $segments
	 */
	private static function write_llm_segments_manifest( string $dir, array $segments ): void {
		$manifest = array();
		foreach ( $segments as $seg ) {
			$manifest[] = array(
				'part'     => (int) $seg['part'],
				'startSec' => (float) $seg['startSec'],
				'endSec'   => (float) $seg['endSec'],
				'file'     => basename( (string) $seg['path'] ),
			);
		}
		file_put_contents( $dir . '/llm-segments.json', wp_json_encode( $manifest ) );
	}

	/**
	 * @return array<int,array{part:int,startSec:float,endSec:float,file:string}>|WP_Error
	 */
	private static function read_llm_segments_manifest( string $id ) {
		if ( ! Neo_Pulse_App_Video_Render_Store::valid_id( $id ) ) {
			return self::bad_request( 'Invalid brainstorm id' );
		}
		$dir  = Neo_Pulse_App_Video_Render_Store::dir( $id );
		$path = $dir . '/llm-segments.json';
		if ( is_file( $path ) ) {
			$data = json_decode( (string) file_get_contents( $path ), true );
			if ( is_array( $data ) && $data ) {
				return $data;
			}
		}
		$files = glob( $dir . '/llm-seg-*.mp4' );
		if ( ! is_array( $files ) || ! $files ) {
			$src = self::source_path( $id );
			if ( $src === '' ) {
				return new WP_Error( 'neo-pulse_video_brainstorm', 'Brainstorm video not found', array( 'status' => 404 ) );
			}
			$info = Neo_Pulse_App_Video_Stitch::probe( $src );
			if ( is_wp_error( $info ) ) {
				return $info;
			}
			return array(
				array(
					'part'     => 1,
					'startSec' => 0.0,
					'endSec'   => round( (float) $info['duration'], 2 ),
					'file'     => basename( $src ),
				),
			);
		}
		sort( $files );
		$manifest = array();
		foreach ( $files as $i => $file ) {
			$manifest[] = array(
				'part'     => $i + 1,
				'startSec' => 0.0,
				'endSec'   => 0.0,
				'file'     => basename( $file ),
			);
		}
		return $manifest;
	}

	/**
	 * @return array<int,array{type:string,video_url:array{url:string,processing:string}}>|WP_Error
	 */
	public static function openrouter_video_parts( string $id ) {
		$manifest = self::read_llm_segments_manifest( $id );
		$dir   = Neo_Pulse_App_Video_Render_Store::dir( $id );
		$parts = array();

		// Visual ground-truth: contact sheet showing all key walkthrough frames at a glance
		$sheet = $dir . '/contact-sheet.png';
		if ( is_file( $sheet ) ) {
			$parts[] = array(
				'type'      => 'image_url',
				'image_url' => array(
					'url' => self::data_url( $sheet ),
				),
			);
		}

		// Sequential beat frames extracted from the user's walkthrough video
		$beat_files = glob( $dir . '/beat-*.png' );
		if ( is_array( $beat_files ) && count( $beat_files ) > 0 ) {
			sort( $beat_files );
			foreach ( $beat_files as $bf ) {
				if ( is_file( $bf ) ) {
					$parts[] = array(
						'type'      => 'image_url',
						'image_url' => array(
							'url' => self::data_url( $bf ),
						),
					);
				}
			}
		}

		// If LLM segment mp4 files exist and total size stays under 8MB (base64 under 11MB to avoid 413), attach video clips
		if ( ! is_wp_error( $manifest ) && is_array( $manifest ) ) {
			$total_size = 0;
			$seg_paths  = array();
			foreach ( $manifest as $seg ) {
				$file = isset( $seg['file'] ) ? (string) $seg['file'] : '';
				if ( $file !== '' && is_file( $dir . '/' . $file ) ) {
					$p = $dir . '/' . $file;
					$total_size += filesize( $p );
					$seg_paths[] = array( 'path' => $p, 'seg' => $seg );
				}
			}
			if ( $total_size > 0 && $total_size < 8 * 1024 * 1024 ) {
				foreach ( $seg_paths as $sp ) {
					$start = isset( $sp['seg']['startSec'] ) ? (float) $sp['seg']['startSec'] : 0.0;
					$end   = isset( $sp['seg']['endSec'] ) ? (float) $sp['seg']['endSec'] : 0.0;
					$dur   = $end > $start ? $end - $start : 0.0;
					$parts[] = array(
						'type'      => 'video_url',
						'video_url' => array(
							'url'        => self::video_data_url( $sp['path'] ),
							'processing' => $dur > 45 ? 'agentic' : 'static',
						),
					);
				}
			}
		}

		// Fallback for legacy single-file input
		if ( ! $parts ) {
			$legacy = $dir . '/llm-input.mp4';
			if ( is_file( $legacy ) ) {
				$parts[] = array(
					'type'      => 'video_url',
					'video_url' => array(
						'url'        => self::video_data_url( $legacy ),
						'processing' => 'agentic',
					),
				);
			}
		}

		if ( ! $parts ) {
			return new WP_Error( 'neo-pulse_video_brainstorm', 'No LLM visual parts for id ' . $id );
		}
		return $parts;
	}

	/**
	 * @param array<int,array<string,mixed>> $messages
	 * @return array<int,array<string,mixed>>|WP_Error
	 */
	public static function expand_openrouter_messages( array $messages ) {
		foreach ( $messages as $idx => $msg ) {
			if ( ! isset( $msg['content'] ) || ! is_array( $msg['content'] ) ) {
				continue;
			}
			$next = array();
			foreach ( $msg['content'] as $part ) {
				if ( ! is_array( $part ) ) {
					$next[] = $part;
					continue;
				}
				$type = isset( $part['type'] ) ? (string) $part['type'] : '';
				if ( $type === 'neo_pulse_reference_video' ) {
					$id = isset( $part['serverId'] ) ? trim( (string) $part['serverId'] ) : '';
					if ( $id === '' ) {
						return self::bad_request( 'neo_pulse_reference_video requires serverId' );
					}
					$video_parts = self::openrouter_video_parts( $id );
					if ( is_wp_error( $video_parts ) ) {
						return $video_parts;
					}
					foreach ( $video_parts as $vp ) {
						$next[] = $vp;
					}
					continue;
				}
				$next[] = $part;
			}
			$messages[ $idx ]['content'] = $next;
		}
		return $messages;
	}

	/**
	 * @param array{width:int,height:int,duration:float,hasAudio:bool} $info
	 * @return array<string,mixed>|WP_Error
	 */
	private static function finalize_ingest( string $id, string $dir, string $src, bool $skip_samples, array $info ) {
		$samples = array();
		if ( ! $skip_samples ) {
			$files = Neo_Pulse_App_Video_Stitch::sample_frames( $src, $dir, self::SAMPLE_INTERVAL, self::SAMPLE_WIDTH );
			if ( is_wp_error( $files ) ) {
				return $files;
			}
			foreach ( $files as $i => $file ) {
				$samples[] = array(
					'time'    => $i * self::SAMPLE_INTERVAL,
					'dataUrl' => self::data_url( $file ),
				);
			}
		}
		$llm_raw = Neo_Pulse_App_Video_Stitch::llm_segments( $src, $dir, (float) $info['duration'], self::LLM_SEGMENT_MAX_BYTES );
		if ( is_wp_error( $llm_raw ) ) {
			return $llm_raw;
		}
		self::write_llm_segments_manifest( $dir, $llm_raw );
		$llm_segments = self::llm_segments_meta( $llm_raw );

		return array(
			'id'              => $id,
			'durationSeconds' => round( (float) $info['duration'], 2 ),
			'width'           => (int) $info['width'],
			'height'          => (int) $info['height'],
			'samples'         => $samples,
			'llmSegments'     => $llm_segments,
			'llmSegmentCount' => count( $llm_segments ),
		);
	}

	/**
	 * @return array<string,mixed>|WP_Error
	 */
	private static function ingest_uploaded_file( string $tmp_path, string $file_name, bool $skip_samples ) {
		$preflight = Neo_Pulse_App_Video_Stitch::preflight();
		if ( is_wp_error( $preflight ) ) {
			return $preflight;
		}
		$ext = strtolower( pathinfo( $file_name, PATHINFO_EXTENSION ) );
		if ( $ext === 'qt' ) {
			$ext = 'mov';
		}
		if ( ! in_array( $ext, array( 'mov', 'mp4', 'webm', 'm4v', 'avi' ), true ) ) {
			$ext = 'mov';
		}
		$id  = Neo_Pulse_App_Video_Render_Store::new_id();
		$dir = Neo_Pulse_App_Video_Render_Store::dir( $id );
		if ( ! wp_mkdir_p( $dir ) ) {
			return new WP_Error( 'neo-pulse_video_brainstorm', 'Could not create folder ' . $dir );
		}
		$src = $dir . '/source.' . $ext;
		if ( ! move_uploaded_file( $tmp_path, $src ) ) {
			if ( ! copy( $tmp_path, $src ) ) {
				return new WP_Error( 'neo-pulse_video_brainstorm', 'Could not save the uploaded video' );
			}
		}
		$info = Neo_Pulse_App_Video_Stitch::probe( $src );
		if ( is_wp_error( $info ) ) {
			return $info;
		}
		return self::finalize_ingest( $id, $dir, $src, $skip_samples, $info );
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
		$skip_samples = ! empty( $body['skipSamples'] );
		return self::finalize_ingest( $id, $dir, $src, $skip_samples, $info );
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

	/**
	 * POST video/brainstorm/{id}/slice-clips
	 * Body: { scenes: Array<{ sceneId: string, order: number, startSeconds: number, durationSeconds: number }> }
	 *
	 * Slices the stored source video into clean web MP4 clips for each scene,
	 * making them immediately available as customClipFile (real video with zero hallucinations)
	 * and reference clips for video models.
	 *
	 * @param array<string,mixed> $body
	 * @return array{clips:array<int,array{sceneId:string,order:int,clipFile:string,clipUrl:string,durationSeconds:float}>}|WP_Error
	 */
	private static function slice_clips( string $id, array $body ) {
		if ( ! Neo_Pulse_App_Video_Render_Store::valid_id( $id ) ) {
			return self::bad_request( 'Invalid brainstorm id' );
		}
		$src = self::source_path( $id );
		if ( $src === '' ) {
			return new WP_Error( 'neo-pulse_video_brainstorm', 'Brainstorm video not found', array( 'status' => 404 ) );
		}
		$raw_scenes = isset( $body['scenes'] ) && is_array( $body['scenes'] ) ? $body['scenes'] : array();
		if ( empty( $raw_scenes ) ) {
			return self::bad_request( 'scenes array is required' );
		}
		$info = Neo_Pulse_App_Video_Stitch::probe( $src );
		if ( is_wp_error( $info ) ) {
			return $info;
		}
		$total_dur = (float) ( $info['duration'] ?? 0 );
		$dir       = Neo_Pulse_App_Video_Render_Store::dir( $id );
		$clips     = array();

		foreach ( $raw_scenes as $i => $sc ) {
			$scene_id = isset( $sc['sceneId'] ) ? trim( (string) $sc['sceneId'] ) : '';
			$order    = isset( $sc['order'] ) ? (int) $sc['order'] : ( $i + 1 );
			$start    = isset( $sc['startSeconds'] ) ? max( 0.0, (float) $sc['startSeconds'] ) : 0.0;
			$dur      = isset( $sc['durationSeconds'] ) ? max( 1.0, (float) $sc['durationSeconds'] ) : 5.0;

			if ( $total_dur > 0 && $start >= $total_dur ) {
				$start = max( 0.0, $total_dur - $dur );
			}
			if ( $total_dur > 0 && ( $start + $dur ) > $total_dur ) {
				$dur = max( 1.0, $total_dur - $start );
			}

			$clip_filename = 'clip-scene-' . str_pad( (string) $order, 2, '0', STR_PAD_LEFT ) . '.mp4';
			$out_mp4       = $dir . '/' . $clip_filename;
			$slice_result  = Neo_Pulse_App_Video_Stitch::slice_clip( $src, $start, $dur, $out_mp4 );
			if ( is_wp_error( $slice_result ) ) {
				return $slice_result;
			}

			$rel_file = $id . '/' . $clip_filename;
			$clip_url = Neo_Pulse_App_Video_Render_Store::url( $id, $clip_filename );

			$clips[] = array(
				'sceneId'         => $scene_id !== '' ? $scene_id : ( 'scene_' . $order ),
				'order'           => $order,
				'clipFile'        => $rel_file,
				'clipUrl'         => $clip_url,
				'startSeconds'    => $start,
				'durationSeconds' => round( $dur, 2 ),
			);
		}

		return array(
			'clips' => $clips,
		);
	}
}
