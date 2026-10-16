<?php
/**
 * Video render & project state on disk: {uploads}/neo-pulse-video/{renderId}/render.json,
 * {uploads}/neo-pulse-video/projects/{projectId}.json, and {uploads}/neo-pulse-video/exports/*.zip.
 *
 * @package Neo_Pulse_App
 */

defined( 'ABSPATH' ) || exit;

class Neo_Pulse_App_Video_Render_Store {

	const SUBDIR = 'neo-pulse-video';

	public static function new_id(): string {
		return gmdate( 'Ymd-His' ) . '-' . wp_generate_password( 8, false, false );
	}

	public static function valid_id( string $id ): bool {
		return (bool) preg_match( '/^[0-9]{8}-[0-9]{6}-[A-Za-z0-9]{8}$/', $id );
	}

	public static function valid_project_id( string $id ): bool {
		return (bool) preg_match( '/^[A-Za-z0-9_-]{3,80}$/', $id );
	}

	public static function root_dir(): string {
		$upload = wp_upload_dir();
		$dir    = trailingslashit( (string) ( $upload['basedir'] ?? '' ) ) . self::SUBDIR;
		if ( ! is_dir( $dir ) ) {
			wp_mkdir_p( $dir );
		}
		return $dir;
	}

	public static function root_url(): string {
		$upload = wp_upload_dir();
		return trailingslashit( (string) ( $upload['baseurl'] ?? '' ) ) . self::SUBDIR;
	}

	public static function dir( string $id ): string {
		return self::root_dir() . '/' . $id;
	}

	public static function url( string $id, string $file ): string {
		$base  = self::root_url() . '/' . $id . '/' . $file;
		$path  = self::dir( $id ) . '/' . $file;
		$mtime = is_file( $path ) ? (int) @filemtime( $path ) : 0;
		return $mtime > 0 ? $base . '?v=' . $mtime : $base;
	}

	public static function projects_dir(): string {
		$dir = self::root_dir() . '/projects';
		if ( ! is_dir( $dir ) ) {
			wp_mkdir_p( $dir );
		}
		return $dir;
	}

	public static function exports_dir(): string {
		$dir = self::root_dir() . '/exports';
		if ( ! is_dir( $dir ) ) {
			wp_mkdir_p( $dir );
		}
		return $dir;
	}

	public static function user_clips_dir(): string {
		$dir = self::root_dir() . '/user-clips';
		if ( ! is_dir( $dir ) ) {
			wp_mkdir_p( $dir );
		}
		return $dir;
	}

	/**
	 * Resolve a stored relative clip path (`user-clips/clip-xxx.mp4` or `{renderId}/scene-01.mp4`) to an absolute file on disk.
	 */
	public static function resolve_stored_clip_path( string $rel_path ): string {
		$clean = ltrim( str_replace( '\\', '/', trim( $rel_path ) ), '/' );
		if ( ! preg_match( '#^[A-Za-z0-9_-]+/[A-Za-z0-9_.-]+\.(mp4|mov|webm)$#i', $clean ) ) {
			return '';
		}
		$abs = self::root_dir() . '/' . $clean;
		return is_file( $abs ) ? $abs : '';
	}

	/**
	 * POST /api/video/clips/upload  {fileName, dataUrl}: saves a user video clip to disk, probes its duration, and extracts a thumbnail frame.
	 *
	 * @param array<string,mixed> $body
	 * @return array{clipFile:string,clipUrl:string,thumbnailDataUrl:string,durationSeconds:int}|WP_Error
	 */
	public static function upload_user_clip( array $body ) {
		$data_url = isset( $body['dataUrl'] ) ? trim( (string) $body['dataUrl'] ) : '';
		if ( ! preg_match( '#^data:video/([a-z0-9.+-]+);base64,#i', $data_url, $m ) ) {
			return new WP_Error( 'neo-pulse_video_clip', 'dataUrl must be a base64 video data URL (MP4, MOV, or WebM)', array( 'status' => 400 ) );
		}
		$raw = base64_decode( substr( $data_url, strlen( $m[0] ) ), true );
		unset( $data_url );
		if ( $raw === false || strlen( $raw ) < 1024 ) {
			return new WP_Error( 'neo-pulse_video_clip', 'dataUrl is not valid base64 video data', array( 'status' => 400 ) );
		}
		if ( strlen( $raw ) > 52428800 ) {
			return new WP_Error( 'neo-pulse_video_clip', 'Video clip is larger than 50 MB', array( 'status' => 400 ) );
		}
		$preflight = Neo_Pulse_App_Video_Stitch::preflight();
		if ( is_wp_error( $preflight ) ) {
			return $preflight;
		}
		$ext = strtolower( $m[1] ) === 'quicktime' ? 'mov' : preg_replace( '/[^a-z0-9]/', '', strtolower( $m[1] ) );
		if ( ! in_array( $ext, array( 'mp4', 'mov', 'webm' ), true ) ) {
			$ext = 'mp4';
		}
		$clip_id   = 'clip-' . self::new_id();
		$dir       = self::user_clips_dir();
		$clip_name = $clip_id . '.' . $ext;
		$clip_abs  = $dir . '/' . $clip_name;
		if ( file_put_contents( $clip_abs, $raw ) === false ) {
			return new WP_Error( 'neo-pulse_video_clip', 'Could not write video clip to disk' );
		}
		unset( $raw );
		$info = Neo_Pulse_App_Video_Stitch::probe( $clip_abs );
		if ( is_wp_error( $info ) ) {
			@unlink( $clip_abs );
			return $info;
		}
		$duration = max( 1, min( 60, (int) round( (float) $info['duration'] ) ) );
		$thumb    = $dir . '/' . $clip_id . '.png';
		$sample_t = min( 0.2, max( 0.0, (float) $info['duration'] * 0.1 ) );
		$framed   = Neo_Pulse_App_Video_Stitch::frame_at( $clip_abs, $sample_t, $thumb );
		if ( is_wp_error( $framed ) ) {
			$framed = Neo_Pulse_App_Video_Stitch::frame_at( $clip_abs, 0.0, $thumb );
		}
		$thumb_data_url = '';
		if ( ! is_wp_error( $framed ) && is_file( $thumb ) ) {
			$thumb_data_url = 'data:image/png;base64,' . base64_encode( (string) file_get_contents( $thumb ) );
		}
		$rel_file = 'user-clips/' . $clip_name;
		$clip_url = self::root_url() . '/' . $rel_file . '?v=' . (int) @filemtime( $clip_abs );
		return array(
			'clipFile'         => $rel_file,
			'clipUrl'          => $clip_url,
			'thumbnailDataUrl' => $thumb_data_url,
			'durationSeconds'  => $duration,
		);
	}

	public static function project_path( string $project_id ): string {
		return self::projects_dir() . '/' . $project_id . '.json';
	}

	public static function clip_path( string $id, int $order ): string {
		return self::dir( $id ) . '/scene-' . str_pad( (string) $order, 2, '0', STR_PAD_LEFT ) . '.mp4';
	}

	public static function voice_path( string $id, int $order ): string {
		return self::dir( $id ) . '/voice-' . str_pad( (string) $order, 2, '0', STR_PAD_LEFT ) . '.pcm';
	}

	/** Last frame of the previous clip, used as the first frame of a `continue` scene. */
	public static function chain_frame_path( string $id, int $order ): string {
		return self::dir( $id ) . '/chain-' . str_pad( (string) $order, 2, '0', STR_PAD_LEFT ) . '.png';
	}

	public static function final_path( string $id ): string {
		return self::dir( $id ) . '/final.mp4';
	}

	/**
	 * @param array<string,mixed> $render
	 * @return true|WP_Error
	 */
	public static function create( array $render ) {
		$dir = self::dir( (string) $render['id'] );
		if ( ! wp_mkdir_p( $dir ) ) {
			return new WP_Error( 'neo-pulse_video_store', 'Could not create render folder ' . $dir );
		}
		return self::write( (string) $render['id'], $render );
	}

	/**
	 * @return array<string,mixed>|null
	 */
	public static function read( string $id ): ?array {
		$path = self::dir( $id ) . '/render.json';
		if ( ! is_file( $path ) ) {
			return null;
		}
		$json = json_decode( (string) file_get_contents( $path ), true );
		return is_array( $json ) ? $json : null;
	}

	/**
	 * @param array<string,mixed> $render
	 * @return true|WP_Error
	 */
	public static function write( string $id, array $render ) {
		$path = self::dir( $id ) . '/render.json';
		$fh   = fopen( $path, 'c+' );
		if ( ! $fh ) {
			return new WP_Error( 'neo-pulse_video_store', 'Could not open ' . $path );
		}
		flock( $fh, LOCK_EX );
		ftruncate( $fh, 0 );
		rewind( $fh );
		fwrite( $fh, (string) wp_json_encode( $render, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES ) );
		fflush( $fh );
		flock( $fh, LOCK_UN );
		fclose( $fh );
		return true;
	}

	/**
	 * Client-facing snapshot (matches VideoRenderSnapshot in the app).
	 *
	 * @param array<string,mixed> $render
	 * @return array<string,mixed>
	 */
	public static function snapshot( array $render ): array {
		$scenes = array();
		foreach ( (array) $render['scenes'] as $scene ) {
			$row = array(
				'sceneId' => (string) $scene['id'],
				'status'  => (string) $scene['status'],
			);
			if ( ! empty( $scene['clipFile'] ) ) {
				$row['clipUrl'] = self::url( (string) $render['id'], (string) $scene['clipFile'] );
			}
			if ( ! empty( $scene['error'] ) ) {
				$row['error'] = (string) $scene['error'];
			}
			$scenes[] = $row;
		}
		$out = array(
			'id'     => (string) $render['id'],
			'status' => (string) $render['status'],
			'scenes' => $scenes,
		);
		if ( ! empty( $render['finalFile'] ) ) {
			$out['finalUrl'] = self::url( (string) $render['id'], (string) $render['finalFile'] );
		}
		if ( ! empty( $render['error'] ) ) {
			$out['error'] = (string) $render['error'];
		}
		return $out;
	}

	/**
	 * Summarize a project snapshot for listing.
	 *
	 * @param array<string,mixed> $project
	 * @return array<string,mixed>
	 */
	public static function project_summary( array $project ): array {
		$scenes      = isset( $project['plan']['scenes'] ) && is_array( $project['plan']['scenes'] ) ? $project['plan']['scenes'] : array();
		$render_id   = isset( $project['render']['id'] ) && is_string( $project['render']['id'] ) ? trim( $project['render']['id'] ) : '';
		$final_url   = isset( $project['render']['finalUrl'] ) && is_string( $project['render']['finalUrl'] ) ? trim( $project['render']['finalUrl'] ) : '';
		if ( $render_id !== '' && self::valid_id( $render_id ) ) {
			$disk_render = self::read( $render_id );
			if ( is_array( $disk_render ) && ! empty( $disk_render['finalFile'] ) ) {
				$final_url = self::url( $render_id, (string) $disk_render['finalFile'] );
			}
		}
		$summary = array(
			'id'         => (string) ( $project['id'] ?? '' ),
			'name'       => (string) ( $project['name'] ?? 'Untitled Project' ),
			'updatedAt'  => (string) ( $project['updatedAt'] ?? gmdate( 'c' ) ),
			'step'       => (string) ( $project['step'] ?? 'brief' ),
			'sceneCount' => count( $scenes ),
		);
		if ( $render_id !== '' ) {
			$summary['renderId'] = $render_id;
		}
		if ( $final_url !== '' ) {
			$summary['finalUrl'] = $final_url;
		}
		return $summary;
	}

	/**
	 * Save a project JSON file on disk and return its summary.
	 *
	 * @param array<string,mixed> $project
	 * @return array<string,mixed>|WP_Error
	 */
	public static function save_project( array $project ) {
		$id   = isset( $project['id'] ) ? trim( (string) $project['id'] ) : '';
		$name = isset( $project['name'] ) ? trim( (string) $project['name'] ) : '';
		if ( ! self::valid_project_id( $id ) || $name === '' ) {
			return new WP_Error( 'neo-pulse_video_store', 'Project requires a valid id and name', array( 'status' => 400 ) );
		}
		$project['version']   = 1;
		$project['updatedAt'] = gmdate( 'c' );
		$path                 = self::project_path( $id );
		if ( ! Neo_Pulse_App_Json_File_Store::write( $path, $project ) ) {
			return new WP_Error( 'neo-pulse_video_store', 'Could not write project file ' . basename( $path ) );
		}
		return self::project_summary( $project );
	}

	/**
	 * @return array<string,mixed>|null
	 */
	public static function read_project( string $id ): ?array {
		if ( ! self::valid_project_id( $id ) ) {
			return null;
		}
		$data = Neo_Pulse_App_Json_File_Store::read( self::project_path( $id ) );
		if ( ! is_array( $data ) ) {
			return null;
		}
		if ( ! empty( $data['render']['id'] ) && is_string( $data['render']['id'] ) && self::valid_id( $data['render']['id'] ) ) {
			$live = self::read( $data['render']['id'] );
			if ( is_array( $live ) ) {
				$data['render'] = self::snapshot( $live );
			}
		}
		return $data;
	}

	/**
	 * @return true|WP_Error
	 */
	public static function delete_project( string $id ) {
		if ( ! self::valid_project_id( $id ) ) {
			return new WP_Error( 'neo-pulse_video_store', 'Invalid project id', array( 'status' => 400 ) );
		}
		$path = self::project_path( $id );
		if ( is_file( $path ) && ! @unlink( $path ) ) {
			return new WP_Error( 'neo-pulse_video_store', 'Could not delete project file' );
		}
		return true;
	}

	/**
	 * @return array<int,array<string,mixed>>
	 */
	public static function list_projects(): array {
		$files = glob( self::projects_dir() . '/*.json' );
		if ( ! is_array( $files ) ) {
			return array();
		}
		$list = array();
		foreach ( $files as $file ) {
			$data = Neo_Pulse_App_Json_File_Store::read( $file );
			if ( is_array( $data ) && ! empty( $data['id'] ) ) {
				$list[] = self::project_summary( $data );
			}
		}
		usort(
			$list,
			static fn( array $a, array $b ): int => strcmp( (string) ( $b['updatedAt'] ?? '' ), (string) ( $a['updatedAt'] ?? '' ) )
		);
		return $list;
	}

	/**
	 * Enumerate local render folders and their individual scene clips on disk.
	 *
	 * @return array<int,array<string,mixed>>
	 */
	public static function list_renders(): array {
		$files = glob( self::root_dir() . '/*/render.json' );
		if ( ! is_array( $files ) ) {
			return array();
		}
		$list = array();
		foreach ( $files as $file ) {
			$render = Neo_Pulse_App_Json_File_Store::read( $file );
			if ( ! is_array( $render ) || empty( $render['id'] ) ) {
				continue;
			}
			$id    = (string) $render['id'];
			$clips = array();
			foreach ( (array) ( $render['scenes'] ?? array() ) as $scene ) {
				if ( ! is_array( $scene ) ) {
					continue;
				}
				$row = array(
					'sceneId'         => (string) ( $scene['id'] ?? '' ),
					'order'           => (int) ( $scene['order'] ?? 0 ),
					'durationSeconds' => (int) ( $scene['durationSeconds'] ?? 0 ),
					'status'          => (string) ( $scene['status'] ?? 'queued' ),
				);
				if ( ! empty( $scene['clipFile'] ) && is_file( self::dir( $id ) . '/' . $scene['clipFile'] ) ) {
					$row['clipUrl']  = self::url( $id, (string) $scene['clipFile'] );
					$row['clipFile'] = $id . '/' . (string) $scene['clipFile'];
				}
				if ( ! empty( $scene['frameFile'] ) && is_file( self::dir( $id ) . '/' . $scene['frameFile'] ) ) {
					$row['frameUrl'] = self::url( $id, (string) $scene['frameFile'] );
				}
				$clips[] = $row;
			}
			$entry = array(
				'id'         => $id,
				'status'     => (string) ( $render['status'] ?? 'created' ),
				'model'      => (string) ( $render['model'] ?? '' ),
				'resolution' => (string) ( $render['resolution'] ?? '' ),
				'aspect'     => (string) ( $render['aspect'] ?? '' ),
				'createdAt'  => (string) ( $render['createdAt'] ?? '' ),
				'clips'      => $clips,
			);
			if ( ! empty( $render['finalFile'] ) && is_file( self::dir( $id ) . '/' . $render['finalFile'] ) ) {
				$entry['finalUrl'] = self::url( $id, (string) $render['finalFile'] );
			}
			$list[] = $entry;
		}
		usort(
			$list,
			static fn( array $a, array $b ): int => strcmp( (string) ( $b['createdAt'] ?? '' ), (string) ( $a['createdAt'] ?? '' ) )
		);
		return array_slice( $list, 0, 25 );
	}

	/**
	 * Decode a base64 data URL (`data:image/png;base64,...`) into raw bytes and extension.
	 *
	 * @return array{bytes:string,ext:string}|null
	 */
	private static function decode_data_url( string $data_url ): ?array {
		if ( ! preg_match( '#^data:image/(png|jpeg|jpg|webp);base64,(.+)$#s', trim( $data_url ), $m ) ) {
			return null;
		}
		$bytes = base64_decode( $m[2], true );
		if ( $bytes === false || strlen( $bytes ) < 64 ) {
			return null;
		}
		$ext = $m[1] === 'jpeg' ? 'jpg' : $m[1];
		return array(
			'bytes' => $bytes,
			'ext'   => $ext,
		);
	}

	/**
	 * Build a ZIP package containing `project.json`, `final.mp4` (when rendered), individual `clips/scene-XX.mp4` files,
	 * `frames/scene-XX.png`, `environments/scene-XX-env.png`, and `product/view-XX.png`.
	 *
	 * @param array<string,mixed> $project
	 * @return array{zipUrl:string,fileName:string}|WP_Error
	 */
	public static function build_export_zip( array $project ) {
		if ( ! class_exists( 'ZipArchive' ) ) {
			return new WP_Error( 'neo-pulse_video_zip', 'PHP ZipArchive extension is required to export ZIP archives' );
		}
		$raw_name = isset( $project['name'] ) ? trim( (string) $project['name'] ) : 'video-project';
		$slug     = sanitize_title( $raw_name );
		if ( $slug === '' ) {
			$slug = 'video-project';
		}
		$file_name = $slug . '-' . gmdate( 'Ymd-His' ) . '.zip';
		$zip_path  = self::exports_dir() . '/' . $file_name;

		$zip = new ZipArchive();
		if ( true !== $zip->open( $zip_path, ZipArchive::CREATE | ZipArchive::OVERWRITE ) ) {
			return new WP_Error( 'neo-pulse_video_zip', 'Could not create ZIP archive on disk' );
		}

		// 1. Resumable project.json
		$project['version']   = 1;
		$project['updatedAt'] = gmdate( 'c' );
		$zip->addFromString( 'project.json', (string) wp_json_encode( $project, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES ) );

		// 2. Product Lock studio views
		$views = isset( $project['productLock']['views'] ) && is_array( $project['productLock']['views'] )
			? $project['productLock']['views']
			: array();
		foreach ( $views as $idx => $view ) {
			if ( ! is_array( $view ) || empty( $view['imageDataUrl'] ) || ! is_string( $view['imageDataUrl'] ) ) {
				continue;
			}
			$decoded = self::decode_data_url( $view['imageDataUrl'] );
			if ( $decoded !== null ) {
				$vid = sanitize_file_name( (string) ( $view['id'] ?? ( 'view-' . ( $idx + 1 ) ) ) );
				$zip->addFromString(
					sprintf( 'product/%02d-%s.%s', $idx + 1, $vid, $decoded['ext'] ),
					$decoded['bytes']
				);
			}
		}

		// 3. Storyboard keyframes & environment plates
		$plan_scenes = isset( $project['plan']['scenes'] ) && is_array( $project['plan']['scenes'] )
			? $project['plan']['scenes']
			: array();
		$scene_meta  = array();
		foreach ( $plan_scenes as $idx => $sc ) {
			if ( is_array( $sc ) && ! empty( $sc['id'] ) ) {
				$scene_meta[ (string) $sc['id'] ] = array(
					'order' => isset( $sc['order'] ) ? (int) $sc['order'] : ( $idx + 1 ),
					'title' => sanitize_title( (string) ( $sc['title'] ?? '' ) ),
				);
			}
		}

		$frames = isset( $project['frames'] ) && is_array( $project['frames'] ) ? $project['frames'] : array();
		foreach ( $frames as $idx => $frame ) {
			if ( ! is_array( $frame ) ) {
				continue;
			}
			$sid   = (string) ( $frame['sceneId'] ?? '' );
			$order = $scene_meta[ $sid ]['order'] ?? ( $idx + 1 );
			$title = $scene_meta[ $sid ]['title'] ?? '';
			$tag   = $title !== '' ? sprintf( 'scene-%02d-%s', $order, $title ) : sprintf( 'scene-%02d', $order );

			if ( ! empty( $frame['imageDataUrl'] ) && is_string( $frame['imageDataUrl'] ) ) {
				$decoded = self::decode_data_url( $frame['imageDataUrl'] );
				if ( $decoded !== null ) {
					$zip->addFromString( sprintf( 'frames/%s.%s', $tag, $decoded['ext'] ), $decoded['bytes'] );
				}
			}
			if ( ! empty( $frame['environmentDataUrl'] ) && is_string( $frame['environmentDataUrl'] ) ) {
				$decoded = self::decode_data_url( $frame['environmentDataUrl'] );
				if ( $decoded !== null ) {
					$zip->addFromString( sprintf( 'environments/%s-env.%s', $tag, $decoded['ext'] ), $decoded['bytes'] );
				}
			}
		}

		// 4. Full stitched final.mp4 + individual rendered scene clips from disk
		$render_id = isset( $project['render']['id'] ) && is_string( $project['render']['id'] )
			? trim( $project['render']['id'] )
			: '';
		if ( $render_id !== '' && self::valid_id( $render_id ) ) {
			$render_dir = self::dir( $render_id );
			$final_mp4  = self::final_path( $render_id );
			if ( is_file( $final_mp4 ) ) {
				$zip->addFile( $final_mp4, $slug . '-final.mp4' );
			}
			$disk_render = self::read( $render_id );
			if ( is_array( $disk_render ) && ! empty( $disk_render['scenes'] ) && is_array( $disk_render['scenes'] ) ) {
				foreach ( $disk_render['scenes'] as $sc ) {
					if ( ! is_array( $sc ) || empty( $sc['clipFile'] ) ) {
						continue;
					}
					$clip_file = $render_dir . '/' . $sc['clipFile'];
					if ( is_file( $clip_file ) ) {
						$order = (int) ( $sc['order'] ?? 0 );
						$sid   = (string) ( $sc['id'] ?? '' );
						$title = $scene_meta[ $sid ]['title'] ?? '';
						$name  = $title !== ''
							? sprintf( 'clips/scene-%02d-%s.mp4', $order, $title )
							: sprintf( 'clips/scene-%02d.mp4', $order );
						$zip->addFile( $clip_file, $name );
					}
				}
			}
		}

		$zip->close();
		if ( ! is_file( $zip_path ) ) {
			return new WP_Error( 'neo-pulse_video_zip', 'ZIP archive could not be finalized' );
		}

		return array(
			'zipUrl'   => self::root_url() . '/exports/' . $file_name . '?v=' . (int) @filemtime( $zip_path ),
			'fileName' => $file_name,
		);
	}
}
