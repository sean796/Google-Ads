<?php
/**
 * ffmpeg helpers (server side only): preflight, last-frame grab, probe, and the final assembly of clips plus narration.
 *
 * @package Neo_Pulse_App
 */

defined( 'ABSPATH' ) || exit;

class Neo_Pulse_App_Video_Stitch {

	const FPS         = 24;
	const AMBIENT_VOL = 0.35;

	public static function ffmpeg_bin(): string {
		return defined( 'NEO_PULSE_FFMPEG_BIN' ) && NEO_PULSE_FFMPEG_BIN !== '' ? (string) NEO_PULSE_FFMPEG_BIN : 'ffmpeg';
	}

	public static function ffprobe_bin(): string {
		$ffmpeg = self::ffmpeg_bin();
		return substr( $ffmpeg, -6 ) === 'ffmpeg' ? substr( $ffmpeg, 0, -6 ) . 'ffprobe' : 'ffprobe';
	}

	/**
	 * Fail fast before any clip is purchased: ffmpeg and ffprobe must run.
	 *
	 * @return true|WP_Error
	 */
	public static function preflight() {
		if ( ! function_exists( 'proc_open' ) ) {
			return new WP_Error( 'neo-pulse_video_stitch', 'proc_open is disabled; ffmpeg cannot run on this server' );
		}
		foreach ( array( self::ffmpeg_bin(), self::ffprobe_bin() ) as $bin ) {
			$result = self::run( array( $bin, '-version' ) );
			if ( is_wp_error( $result ) ) {
				return new WP_Error( 'neo-pulse_video_stitch', basename( $bin ) . ' is not available: ' . $result->get_error_message() );
			}
		}
		return true;
	}

	/**
	 * Grab the last frame of `$clip` as a PNG (first frame of the next chained scene).
	 *
	 * @return true|WP_Error
	 */
	public static function last_frame( string $clip, string $out_png ) {
		if ( ! is_file( $clip ) ) {
			return new WP_Error( 'neo-pulse_video_stitch', 'Missing clip ' . basename( $clip ) );
		}
		$result = self::run( array( self::ffmpeg_bin(), '-y', '-sseof', '-0.1', '-i', $clip, '-frames:v', '1', '-update', '1', $out_png ) );
		if ( is_wp_error( $result ) ) {
			@unlink( $out_png );
			return $result;
		}
		if ( ! is_file( $out_png ) || filesize( $out_png ) < 1024 ) {
			@unlink( $out_png );
			return new WP_Error( 'neo-pulse_video_stitch', 'ffmpeg wrote no frame for ' . basename( $clip ) );
		}
		return true;
	}

	/**
	 * @return array{duration:float,width:int,height:int,hasAudio:bool}|WP_Error
	 */
	public static function probe( string $path ) {
		$out = self::run(
			array(
				self::ffprobe_bin(),
				'-v',
				'error',
				'-show_entries',
				'stream=codec_type,width,height:format=duration',
				'-of',
				'json',
				$path,
			)
		);
		if ( is_wp_error( $out ) ) {
			return $out;
		}
		$json = json_decode( $out, true );
		if ( ! is_array( $json ) ) {
			return new WP_Error( 'neo-pulse_video_stitch', 'ffprobe returned invalid JSON for ' . basename( $path ) );
		}
		$info = array(
			'duration' => (float) ( $json['format']['duration'] ?? 0 ),
			'width'    => 0,
			'height'   => 0,
			'hasAudio' => false,
		);
		foreach ( (array) ( $json['streams'] ?? array() ) as $stream ) {
			if ( ( $stream['codec_type'] ?? '' ) === 'video' && $info['width'] === 0 ) {
				$info['width']  = (int) ( $stream['width'] ?? 0 );
				$info['height'] = (int) ( $stream['height'] ?? 0 );
			}
			if ( ( $stream['codec_type'] ?? '' ) === 'audio' ) {
				$info['hasAudio'] = true;
			}
		}
		if ( $info['duration'] <= 0 || $info['width'] === 0 ) {
			return new WP_Error( 'neo-pulse_video_stitch', basename( $path ) . ' has no readable video stream' );
		}
		return $info;
	}

	private static function xfade_name( string $type ): string {
		$map = array(
			'dissolve'   => 'fade',
			'fade_black' => 'fadeblack',
			'fade_white' => 'fadewhite',
			'wipe_left'  => 'smoothleft',
			'wipe_right' => 'smoothright',
			'zoom_in'    => 'zoomin',
		);
		return $map[ $type ] ?? 'fade';
	}

	/**
	 * One ffmpeg pass: clips normalized to the first clip's size at 24 fps, joined by concat (cut/continue) or xfade (dissolve/fade_black/fade_white/wipe_left/wipe_right/zoom_in),
	 * optional fade-in from black and fade-out to black on the assembled stream, and narration placed at each scene's start.
	 *
	 * @param array<int,array{clip:string,voice:string,voiceRate:int,voiceChannels:int,transition:?array{type:string,seconds:float}}> $segments Ordered; voice is '' for a render without narration, else a raw 16-bit little-endian PCM file.
	 * @param string $out_path Output MP4 path.
	 * @param float  $fade_in  Optional fade-in from black in seconds (0..1.5).
	 * @param float  $fade_out Optional fade-out to black in seconds (0..1.5).
	 * @return true|WP_Error
	 */
	public static function assemble( array $segments, string $out_path, float $fade_in = 0.0, float $fade_out = 0.0 ) {
		$n = count( $segments );
		if ( $n === 0 ) {
			return new WP_Error( 'neo-pulse_video_stitch', 'No clips to assemble' );
		}
		$narrated = $segments[0]['voice'] !== '';
		$clips    = array();
		foreach ( $segments as $i => $seg ) {
			if ( ( $seg['voice'] !== '' ) !== $narrated ) {
				return new WP_Error( 'neo-pulse_video_stitch', 'Every scene must have narration, or none may' );
			}
			foreach ( $narrated ? array( $seg['clip'], $seg['voice'] ) : array( $seg['clip'] ) as $file ) {
				if ( ! is_file( $file ) ) {
					return new WP_Error( 'neo-pulse_video_stitch', 'Missing file ' . basename( $file ) );
				}
			}
			$info = self::probe( $seg['clip'] );
			if ( is_wp_error( $info ) ) {
				return $info;
			}
			$clips[ $i ] = $info;
		}
		$w = (int) $clips[0]['width'];
		$h = (int) $clips[0]['height'];

		$argv    = array( self::ffmpeg_bin(), '-y' );
		$filters = array();
		foreach ( $segments as $i => $seg ) {
			$argv[] = '-i';
			$argv[] = $seg['clip'];
		}
		foreach ( $narrated ? $segments : array() as $seg ) {
			if ( (int) $seg['voiceRate'] <= 0 || (int) $seg['voiceChannels'] <= 0 ) {
				return new WP_Error( 'neo-pulse_video_stitch', 'Narration ' . basename( $seg['voice'] ) . ' has no PCM rate or channel count' );
			}
			array_push( $argv, '-f', 's16le', '-ar', (string) (int) $seg['voiceRate'], '-ac', (string) (int) $seg['voiceChannels'], '-i', $seg['voice'] );
		}
		for ( $i = 0; $i < $n; $i++ ) {
			$filters[] = sprintf(
				'[%d:v]scale=%d:%d:force_original_aspect_ratio=decrease,pad=%d:%d:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=%d,format=yuv420p,settb=1/%d,setpts=PTS-STARTPTS[v%d]',
				$i,
				$w,
				$h,
				$w,
				$h,
				self::FPS,
				self::FPS,
				$i
			);
		}

		$starts  = array( 0.0 );
		$total   = (float) $clips[0]['duration'];
		$current = '[v0]';
		for ( $i = 1; $i < $n; $i++ ) {
			$transition = $segments[ $i ]['transition'];
			$tr_type    = is_array( $transition ) && isset( $transition['type'] ) ? (string) $transition['type'] : 'cut';
			$is_xfade   = $tr_type !== 'cut' && $tr_type !== 'continue';
			$xfade_sec  = $is_xfade && is_array( $transition ) ? (float) ( $transition['seconds'] ?? 0.0 ) : 0.0;
			$label      = '[x' . $i . ']';
			if ( $xfade_sec > 0 ) {
				$xfade_name = self::xfade_name( $tr_type );
				$offset     = max( 0.0, $total - $xfade_sec );
				$filters[]  = sprintf(
					'%s[v%d]xfade=transition=%s:duration=%s:offset=%s,fps=%d,format=yuv420p,settb=1/%d,setpts=PTS-STARTPTS%s',
					$current,
					$i,
					$xfade_name,
					self::num( $xfade_sec ),
					self::num( $offset ),
					self::FPS,
					self::FPS,
					$label
				);
				$starts[] = $offset;
				$total    = $offset + (float) $clips[ $i ]['duration'];
			} else {
				$filters[] = sprintf(
					'%s[v%d]concat=n=2:v=1:a=0,fps=%d,format=yuv420p,settb=1/%d,setpts=PTS-STARTPTS%s',
					$current,
					$i,
					self::FPS,
					self::FPS,
					$label
				);
				$starts[] = $total;
				$total   += (float) $clips[ $i ]['duration'];
			}
			$current = $label;
		}
		$end_filters = array();
		if ( $fade_in > 0.0 && $total > $fade_in ) {
			$end_filters[] = sprintf( 'fade=t=in:st=0:d=%s', self::num( $fade_in ) );
		}
		if ( $fade_out > 0.0 && $total > $fade_out ) {
			$fade_out_start = max( 0.0, $total - $fade_out );
			$end_filters[]  = sprintf( 'fade=t=out:st=%s:d=%s', self::num( $fade_out_start ), self::num( $fade_out ) );
		}
		$filters[] = $current . ( count( $end_filters ) > 0 ? implode( ',', $end_filters ) : 'null' ) . '[vout]';

		$mix_inputs = array();
		for ( $i = 0; $i < $n; $i++ ) {
			$delay_ms = (int) round( $starts[ $i ] * 1000 );
			if ( $narrated ) {
				$seg           = $segments[ $i ];
				$bytes_per_sec = max( 1, (int) $seg['voiceRate'] * (int) $seg['voiceChannels'] * 2 );
				$pcm_seconds   = is_file( $seg['voice'] ) ? ( (float) filesize( $seg['voice'] ) / (float) $bytes_per_sec ) : 0.0;
				$window        = ( $i + 1 < $n ) ? max( 1.0, $starts[ $i + 1 ] - $starts[ $i ] - 0.15 ) : max( 1.0, $total - $starts[ $i ] - 0.1 );
				$atempo_filter = '';
				if ( $pcm_seconds > $window && $window > 0.5 ) {
					$tempo         = min( 1.35, max( 1.01, $pcm_seconds / $window ) );
					$atempo_filter = 'atempo=' . self::num( $tempo ) . ',';
				}
				$filters[]    = sprintf(
					'[%d:a]%saresample=48000,aformat=channel_layouts=stereo,adelay=%d:all=1[n%d]',
					$n + $i,
					$atempo_filter,
					$delay_ms,
					$i
				);
				$mix_inputs[] = '[n' . $i . ']';
			}
		}
		$has_audio = count( $mix_inputs ) > 0;
		if ( $has_audio ) {
			$filters[] = implode( '', $mix_inputs ) . 'amix=inputs=' . count( $mix_inputs ) . ':duration=longest:normalize=0[aout]';
		}

		$argv = array_merge(
			$argv,
			array( '-filter_complex', implode( ';', $filters ), '-map', '[vout]' ),
			$has_audio ? array( '-map', '[aout]', '-c:a', 'aac' ) : array( '-an' ),
			array( '-t', self::num( $total ), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', $out_path )
		);
		$result = self::run( $argv );
		if ( is_wp_error( $result ) ) {
			@unlink( $out_path );
			return $result;
		}
		if ( ! is_file( $out_path ) || filesize( $out_path ) < 1024 ) {
			return new WP_Error( 'neo-pulse_video_stitch', 'ffmpeg produced no output file' );
		}
		return true;
	}

	/**
	 * One small JPEG every `$interval` seconds of `$src` into `$dir` (sample-001.jpg, ...), for the Brainstorm agent to look at.
	 *
	 * @return string[]|WP_Error Written file paths in time order.
	 */
	public static function sample_frames( string $src, string $dir, int $interval, int $width ) {
		$pattern = $dir . '/sample-%03d.jpg';
		$result  = self::run(
			array( self::ffmpeg_bin(), '-y', '-i', $src, '-vf', sprintf( 'fps=1/%d,scale=%d:-2', $interval, $width ), '-q:v', '4', $pattern )
		);
		if ( is_wp_error( $result ) ) {
			return $result;
		}
		$files = glob( $dir . '/sample-*.jpg' );
		if ( ! is_array( $files ) || ! $files ) {
			return new WP_Error( 'neo-pulse_video_stitch', 'ffmpeg wrote no sample frames for ' . basename( $src ) );
		}
		sort( $files );
		return $files;
	}

	/**
	 * Full-size PNG still of `$src` at `$seconds`.
	 *
	 * @return true|WP_Error
	 */
	public static function frame_at( string $src, float $seconds, string $out_png ) {
		$result = self::run( array( self::ffmpeg_bin(), '-y', '-ss', self::num( $seconds ), '-i', $src, '-frames:v', '1', '-update', '1', $out_png ) );
		if ( is_wp_error( $result ) ) {
			@unlink( $out_png );
			return $result;
		}
		if ( ! is_file( $out_png ) || filesize( $out_png ) < 1024 ) {
			@unlink( $out_png );
			return new WP_Error( 'neo-pulse_video_stitch', 'ffmpeg wrote no frame at ' . self::num( $seconds ) . ' s' );
		}
		return true;
	}

	/**
	 * Contact sheet: `$pngs` (in order) tiled `$cols` per row. Same-size frames: each scaled to `$cell_width`.
	 * With `$cell_height` (photos of mixed sizes and orientations): each image is fitted and padded into a
	 * `$cell_width` x `$cell_height` box first, so concat accepts them.
	 *
	 * @param string[] $pngs
	 * @return true|WP_Error
	 */
	public static function tile_sheet( array $pngs, string $out_png, int $cols, int $cell_width, int $cell_height = 0 ) {
		$n = count( $pngs );
		if ( $n === 0 ) {
			return new WP_Error( 'neo-pulse_video_stitch', 'No frames to tile' );
		}
		$argv = array( self::ffmpeg_bin(), '-y' );
		foreach ( $pngs as $png ) {
			$argv[] = '-i';
			$argv[] = $png;
		}
		$rows = (int) ceil( $n / $cols );
		$tile = sprintf( 'tile=%dx%d:padding=6:margin=6:color=0x222222', min( $cols, $n ), $rows );
		if ( $cell_height > 0 ) {
			$filters = array();
			$inputs  = '';
			for ( $i = 0; $i < $n; $i++ ) {
				$filters[] = sprintf(
					'[%d:v]scale=%d:%d:force_original_aspect_ratio=decrease,pad=%d:%d:(ow-iw)/2:(oh-ih)/2:color=0x222222,format=rgb24,setsar=1[c%d]',
					$i,
					$cell_width,
					$cell_height,
					$cell_width,
					$cell_height,
					$i
				);
				$inputs   .= '[c' . $i . ']';
			}
			$filters[] = sprintf( '%sconcat=n=%d:v=1:a=0,%s', $inputs, $n, $tile );
			$filter    = implode( ';', $filters );
		} else {
			$filter = sprintf( 'concat=n=%d:v=1:a=0,scale=%d:-2,%s', $n, $cell_width, $tile );
		}
		array_push( $argv, '-filter_complex', $filter, '-frames:v', '1', '-update', '1', $out_png );
		$result = self::run( $argv );
		if ( is_wp_error( $result ) ) {
			@unlink( $out_png );
			return $result;
		}
		if ( ! is_file( $out_png ) || filesize( $out_png ) < 1024 ) {
			@unlink( $out_png );
			return new WP_Error( 'neo-pulse_video_stitch', 'ffmpeg produced no contact sheet' );
		}
		return true;
	}

	private static function num( float $v ): string {
		return rtrim( rtrim( number_format( $v, 3, '.', '' ), '0' ), '.' );
	}

	/**
	 * @param string[] $argv
	 * @return string|WP_Error Stdout on success; the error message carries the stderr tail.
	 */
	private static function run( array $argv ) {
		$spec = array(
			0 => array( 'pipe', 'r' ),
			1 => array( 'pipe', 'w' ),
			2 => array( 'pipe', 'w' ),
		);
		$proc = @proc_open( $argv, $spec, $pipes );
		if ( ! is_resource( $proc ) ) {
			return new WP_Error( 'neo-pulse_video_stitch', 'Could not start ' . $argv[0] );
		}
		fclose( $pipes[0] );
		$stdout = (string) stream_get_contents( $pipes[1] );
		$stderr = (string) stream_get_contents( $pipes[2] );
		fclose( $pipes[1] );
		fclose( $pipes[2] );
		$exit = proc_close( $proc );
		if ( $exit !== 0 ) {
			$tail = trim( substr( $stderr, -600 ) );
			return new WP_Error( 'neo-pulse_video_stitch', basename( $argv[0] ) . ' exited with code ' . $exit . ( $tail !== '' ? ': ' . $tail : '' ) );
		}
		return $stdout;
	}
}
