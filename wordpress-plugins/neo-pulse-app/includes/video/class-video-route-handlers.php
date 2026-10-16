<?php
/**
 * /api/video/* routes: create render, upload storyboard frames, start (narration + clip jobs), poll (chain, assemble).
 *
 * @package Neo_Pulse_App
 */

defined( 'ABSPATH' ) || exit;

class Neo_Pulse_App_Video_Route_Handlers {

	const SCENE_MIN_SECONDS = 5;
	const SCENE_MAX_SECONDS = 15;
	const DISSOLVE_MIN      = 0.4;
	const DISSOLVE_MAX      = 1.5;
	const TICK_LOCK_TTL     = 120;
	const XFADE_TYPES       = array( 'dissolve', 'fade_black', 'fade_white', 'wipe_left', 'wipe_right', 'zoom_in' );

	/**
	 * @param array<string,mixed> $body
	 */
	public static function dispatch_http( string $subpath, string $method, array $body ): void {
		$subpath = trim( $subpath, '/' );
		$method  = strtoupper( $method );

		if ( 0 === strpos( $subpath, 'brainstorm/' ) ) {
			Neo_Pulse_App_Video_Brainstorm::dispatch_http( substr( $subpath, 11 ), $method, $body );
			return;
		}
		if ( $subpath === 'projects' && $method === 'GET' ) {
			self::send(
				array(
					'projects' => Neo_Pulse_App_Video_Render_Store::list_projects(),
					'renders'  => Neo_Pulse_App_Video_Render_Store::list_renders(),
				)
			);
			return;
		}
		if ( $subpath === 'projects' && $method === 'POST' ) {
			$project = isset( $body['project'] ) && is_array( $body['project'] ) ? $body['project'] : $body;
			$saved   = Neo_Pulse_App_Video_Render_Store::save_project( $project );
			self::send( is_wp_error( $saved ) ? $saved : array( 'summary' => $saved ) );
			return;
		}
		if ( preg_match( '#^projects/([A-Za-z0-9_-]+)$#', $subpath, $m ) && $method === 'GET' ) {
			$project = Neo_Pulse_App_Video_Render_Store::read_project( $m[1] );
			self::send(
				$project === null
					? new WP_Error( 'neo-pulse_video', 'Project not found', array( 'status' => 404 ) )
					: array( 'project' => $project )
			);
			return;
		}
		if ( preg_match( '#^projects/([A-Za-z0-9_-]+)$#', $subpath, $m ) && $method === 'DELETE' ) {
			$deleted = Neo_Pulse_App_Video_Render_Store::delete_project( $m[1] );
			self::send( is_wp_error( $deleted ) ? $deleted : array() );
			return;
		}
		if ( $subpath === 'export-zip' && $method === 'POST' ) {
			$project = isset( $body['project'] ) && is_array( $body['project'] ) ? $body['project'] : $body;
			$zip     = Neo_Pulse_App_Video_Render_Store::build_export_zip( $project );
			self::send( $zip );
			return;
		}
		if ( $subpath === 'clips/upload' && $method === 'POST' ) {
			self::send( Neo_Pulse_App_Video_Render_Store::upload_user_clip( $body ) );
			return;
		}
		if ( $subpath === 'render' && $method === 'POST' ) {
			self::send( self::create( $body ) );
			return;
		}
		if ( preg_match( '#^render/([A-Za-z0-9-]+)/frame$#', $subpath, $m ) && $method === 'POST' ) {
			self::send( self::upload_frame( $m[1], $body ) );
			return;
		}
		if ( preg_match( '#^render/([A-Za-z0-9-]+)/start$#', $subpath, $m ) && $method === 'POST' ) {
			self::send( self::start( $m[1] ) );
			return;
		}
		if ( preg_match( '#^render/([A-Za-z0-9-]+)/scene/([A-Za-z0-9_-]+)/rerender$#', $subpath, $m ) && $method === 'POST' ) {
			self::send( self::rerender_scene( $m[1], $m[2], $body ) );
			return;
		}
		if ( preg_match( '#^render/([A-Za-z0-9-]+)/restitch$#', $subpath, $m ) && $method === 'POST' ) {
			self::send( self::restitch( $m[1], $body ) );
			return;
		}
		if ( preg_match( '#^render/([A-Za-z0-9-]+)$#', $subpath, $m ) && $method === 'GET' ) {
			self::send( self::poll( $m[1] ) );
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
		return new WP_Error( 'neo-pulse_video', $message, array( 'status' => 400 ) );
	}

	/**
	 * @return array<string,mixed>|WP_Error
	 */
	private static function load( string $id ) {
		if ( ! Neo_Pulse_App_Video_Render_Store::valid_id( $id ) ) {
			return self::bad_request( 'Invalid render id' );
		}
		$render = Neo_Pulse_App_Video_Render_Store::read( $id );
		if ( $render === null ) {
			return new WP_Error( 'neo-pulse_video', 'Render not found', array( 'status' => 404 ) );
		}
		return $render;
	}

	/**
	 * @param mixed $raw transitionIn from the client.
	 * @return array{type:string,seconds:float}|WP_Error
	 */
	private static function parse_transition( $raw, int $index ) {
		if ( ! is_array( $raw ) ) {
			return self::bad_request( 'scenes[' . $index . '] needs transitionIn' );
		}
		$type    = isset( $raw['type'] ) ? trim( (string) $raw['type'] ) : '';
		$seconds = isset( $raw['seconds'] ) ? (float) $raw['seconds'] : 0.0;
		if ( $type === 'cut' || $type === 'continue' ) {
			return array( 'type' => $type, 'seconds' => 0.0 );
		}
		if ( in_array( $type, self::XFADE_TYPES, true ) ) {
			if ( $seconds <= 0.0 ) {
				$seconds = 0.7;
			}
			if ( $seconds < self::DISSOLVE_MIN || $seconds > self::DISSOLVE_MAX ) {
				return self::bad_request( 'scenes[' . $index . '] transition seconds must be ' . self::DISSOLVE_MIN . '..' . self::DISSOLVE_MAX . ' s' );
			}
			return array( 'type' => $type, 'seconds' => round( $seconds, 1 ) );
		}
		return self::bad_request( 'scenes[' . $index . '] transitionIn.type must be cut, continue, dissolve, fade_black, fade_white, wipe_left, wipe_right, or zoom_in' );
	}

	/**
	 * POST video/render  {model, resolution, aspectRatio, voiceModel, voice, scenes:[{id, order, durationSeconds, videoPrompt, narration, transitionIn?}]}
	 * voice "none" renders without a narration track; every scene narration is then "". A HeyGen voice needs narration on every scene.
	 *
	 * @param array<string,mixed> $body
	 * @return array<string,mixed>|WP_Error
	 */
	private static function create( array $body ) {
		$model       = isset( $body['model'] ) ? trim( (string) $body['model'] ) : '';
		$resolution  = isset( $body['resolution'] ) ? trim( (string) $body['resolution'] ) : '';
		$aspect      = isset( $body['aspectRatio'] ) ? trim( (string) $body['aspectRatio'] ) : '';
		$voice_model = isset( $body['voiceModel'] ) ? trim( (string) $body['voiceModel'] ) : '';
		$voice       = isset( $body['voice'] ) ? trim( (string) $body['voice'] ) : '';
		$scenes_in   = isset( $body['scenes'] ) && is_array( $body['scenes'] ) ? array_values( $body['scenes'] ) : array();
		if ( $model === '' || $resolution === '' || $aspect === '' || $voice_model === '' || $voice === '' ) {
			return self::bad_request( 'model, resolution, aspectRatio, voiceModel and voice are required' );
		}
		if ( ! $scenes_in ) {
			return self::bad_request( 'scenes must not be empty' );
		}
		$scenes = array();
		foreach ( $scenes_in as $i => $scene ) {
			if ( ! is_array( $scene ) ) {
				return self::bad_request( 'scenes[' . $i . '] is invalid' );
			}
			$sid         = isset( $scene['id'] ) ? trim( (string) $scene['id'] ) : '';
			$order       = isset( $scene['order'] ) ? (int) $scene['order'] : 0;
			$duration    = isset( $scene['durationSeconds'] ) ? (int) $scene['durationSeconds'] : 0;
			$custom_clip = isset( $scene['customClipFile'] ) ? trim( (string) $scene['customClipFile'] ) : '';
			$prompt      = isset( $scene['videoPrompt'] ) ? trim( (string) $scene['videoPrompt'] ) : '';
			if ( $prompt === '' && $custom_clip !== '' ) {
				$prompt = 'Uploaded video clip';
			}
			$narration = isset( $scene['narration'] ) ? trim( (string) $scene['narration'] ) : '';
			if ( $sid === '' || $order !== $i + 1 || $prompt === '' ) {
				return self::bad_request( 'scenes[' . $i . '] needs id, sequential order and videoPrompt' );
			}
			if ( ( $voice === 'none' ) !== ( $narration === '' ) ) {
				return self::bad_request( 'scenes[' . $i . ']: narration must be empty when voice is none, and present otherwise' );
			}
			$min_dur = $custom_clip !== '' ? 1 : self::SCENE_MIN_SECONDS;
			$max_dur = $custom_clip !== '' ? 60 : self::SCENE_MAX_SECONDS;
			if ( $duration < $min_dur || $duration > $max_dur ) {
				return self::bad_request( 'scenes[' . $i . '] duration must be ' . $min_dur . '..' . $max_dur . ' seconds' );
			}
			if ( $custom_clip !== '' && Neo_Pulse_App_Video_Render_Store::resolve_stored_clip_path( $custom_clip ) === '' ) {
				return self::bad_request( 'scenes[' . $i . '] customClipFile was not found on disk' );
			}
			$transition = null;
			if ( $i === 0 ) {
				if ( isset( $scene['transitionIn'] ) ) {
					return self::bad_request( 'scenes[0] must not have transitionIn' );
				}
			} else {
				$transition = self::parse_transition( $scene['transitionIn'] ?? null, $i );
				if ( is_wp_error( $transition ) ) {
					return $transition;
				}
			}
			$scenes[] = array(
				'id'              => $sid,
				'order'           => $order,
				'durationSeconds' => $duration,
				'videoPrompt'     => $prompt,
				'narration'       => $narration,
				'transition'      => $transition,
				'customClipFile'  => $custom_clip,
				'status'          => 'queued',
				'frameFile'       => '',
				'voiceFile'       => '',
				'voiceRate'       => 0,
				'voiceChannels'   => 0,
				'jobId'           => '',
				'clipFile'        => '',
				'error'           => '',
			);
		}
		$fade_in     = isset( $body['fadeInSeconds'] ) ? max( 0.0, min( 1.5, round( (float) $body['fadeInSeconds'], 1 ) ) ) : 0.0;
		$fade_out    = isset( $body['fadeOutSeconds'] ) ? max( 0.0, min( 1.5, round( (float) $body['fadeOutSeconds'], 1 ) ) ) : 0.0;
		$render      = array(
			'id'             => Neo_Pulse_App_Video_Render_Store::new_id(),
			'status'         => 'created',
			'model'          => $model,
			'resolution'     => $resolution,
			'aspect'         => $aspect,
			'voiceModel'     => $voice_model,
			'voice'          => $voice,
			'fadeInSeconds'  => $fade_in,
			'fadeOutSeconds' => $fade_out,
			'scenes'         => $scenes,
			'finalFile'      => '',
			'error'          => '',
			'createdAt'      => gmdate( 'c' ),
		);
		$saved = Neo_Pulse_App_Video_Render_Store::create( $render );
		if ( is_wp_error( $saved ) ) {
			return $saved;
		}
		$has_custom = false;
		foreach ( $render['scenes'] as &$scene ) {
			if ( empty( $scene['customClipFile'] ) ) {
				continue;
			}
			$src_clip = Neo_Pulse_App_Video_Render_Store::resolve_stored_clip_path( (string) $scene['customClipFile'] );
			$dst_clip = Neo_Pulse_App_Video_Render_Store::clip_path( (string) $render['id'], (int) $scene['order'] );
			if ( $src_clip !== '' && @copy( $src_clip, $dst_clip ) ) {
				$scene['clipFile'] = basename( $dst_clip );
				$scene['status']   = 'done';
				$has_custom        = true;
			}
		}
		unset( $scene );
		if ( $has_custom ) {
			Neo_Pulse_App_Video_Render_Store::write( (string) $render['id'], $render );
		}
		return array( 'id' => $render['id'] );
	}

	/**
	 * POST video/render/{id}/frame  {sceneId, dataUrl}
	 *
	 * @param array<string,mixed> $body
	 * @return array<string,mixed>|WP_Error
	 */
	private static function upload_frame( string $id, array $body ) {
		$render = self::load( $id );
		if ( is_wp_error( $render ) ) {
			return $render;
		}
		if ( $render['status'] !== 'created' ) {
			return self::bad_request( 'Frames can only be uploaded before the render starts' );
		}
		$scene_id = isset( $body['sceneId'] ) ? trim( (string) $body['sceneId'] ) : '';
		$data_url = isset( $body['dataUrl'] ) ? trim( (string) $body['dataUrl'] ) : '';
		if ( ! preg_match( '#^data:(image/(png|jpeg|webp));base64,(.+)$#s', $data_url, $m ) ) {
			return self::bad_request( 'dataUrl must be a base64 PNG, JPEG or WebP data URL' );
		}
		$raw = base64_decode( $m[3], true );
		if ( $raw === false || strlen( $raw ) < 1024 ) {
			return self::bad_request( 'dataUrl is not valid base64 image data' );
		}
		$ext = $m[2] === 'jpeg' ? 'jpg' : $m[2];
		foreach ( $render['scenes'] as &$scene ) {
			if ( $scene['id'] !== $scene_id ) {
				continue;
			}
			$file = 'scene-' . str_pad( (string) $scene['order'], 2, '0', STR_PAD_LEFT ) . '.' . $ext;
			if ( file_put_contents( Neo_Pulse_App_Video_Render_Store::dir( $id ) . '/' . $file, $raw ) === false ) {
				return new WP_Error( 'neo-pulse_video', 'Could not write frame file' );
			}
			$scene['frameFile'] = $file;
			unset( $scene );
			$saved = Neo_Pulse_App_Video_Render_Store::write( $id, $render );
			return is_wp_error( $saved ) ? $saved : array();
		}
		return self::bad_request( 'Unknown sceneId ' . $scene_id );
	}

	/**
	 * POST video/render/{id}/start: preflight ffmpeg and frames, synthesize narration, then submit scene 1 and every dissolve scene.
	 * `continue` scenes wait for the previous clip's last frame (see tick).
	 *
	 * @return array<string,mixed>|WP_Error
	 */
	private static function start( string $id ) {
		$render = self::load( $id );
		if ( is_wp_error( $render ) ) {
			return $render;
		}
		if ( $render['status'] !== 'created' ) {
			return self::bad_request( 'Render already started' );
		}
		$api_key = Neo_Pulse_App_Openrouter_Image::resolve_key();
		if ( $api_key === '' ) {
			return self::bad_request( 'OpenRouter API key is missing' );
		}
		$preflight = Neo_Pulse_App_Video_Stitch::preflight();
		if ( is_wp_error( $preflight ) ) {
			return $preflight;
		}
		foreach ( $render['scenes'] as $scene ) {
			if ( $scene['frameFile'] === '' && empty( $scene['clipFile'] ) ) {
				return self::bad_request( 'Scene ' . $scene['order'] . ' has no storyboard frame or video clip' );
			}
		}

		foreach ( $render['scenes'] as &$scene ) {
			if ( $scene['narration'] === '' ) {
				continue;
			}
			$voice_path = Neo_Pulse_App_Video_Render_Store::voice_path( $id, (int) $scene['order'] );
			$tts        = Neo_Pulse_App_Openrouter_Speech::synthesize(
				$api_key,
				(string) $render['voiceModel'],
				(string) $render['voice'],
				(string) $scene['narration'],
				$voice_path
			);
			if ( is_wp_error( $tts ) ) {
				return new WP_Error( 'neo-pulse_video', 'Scene ' . $scene['order'] . ' narration failed: ' . $tts->get_error_message() );
			}
			$scene['voiceFile']     = basename( $voice_path );
			$scene['voiceRate']     = $tts['rate'];
			$scene['voiceChannels'] = $tts['channels'];
		}
		unset( $scene );

		$dir   = Neo_Pulse_App_Video_Render_Store::dir( $id );
		$count = count( $render['scenes'] );
		for ( $i = 0; $i < $count; $i++ ) {
			$scene = &$render['scenes'][ $i ];
			if ( $scene['status'] === 'done' && ! empty( $scene['clipFile'] ) ) {
				$clip_path = $dir . '/' . $scene['clipFile'];
				unset( $scene );
				self::chain_next( $api_key, $render, $i, $clip_path );
				continue;
			}
			if ( is_array( $scene['transition'] ) && $scene['transition']['type'] === 'continue' ) {
				unset( $scene );
				continue;
			}
			self::submit_scene( $api_key, $render, $scene, $dir . '/' . $scene['frameFile'] );
			unset( $scene );
		}

		$render['status'] = 'rendering';
		if ( ! self::settle_failures( $render ) ) {
			$pending = array_filter( $render['scenes'], static fn( $s ) => $s['status'] !== 'done' );
			if ( ! $pending ) {
				$segments = array();
				foreach ( $render['scenes'] as $s ) {
					$segments[] = array(
						'clip'          => $dir . '/' . $s['clipFile'],
						'voice'         => $s['voiceFile'] === '' ? '' : Neo_Pulse_App_Video_Render_Store::voice_path( $id, (int) $s['order'] ),
						'voiceRate'     => (int) $s['voiceRate'],
						'voiceChannels' => (int) $s['voiceChannels'],
						'transition'    => $s['transition'],
					);
				}
				$out      = Neo_Pulse_App_Video_Render_Store::final_path( $id );
				$fade_in  = isset( $render['fadeInSeconds'] ) ? (float) $render['fadeInSeconds'] : 0.0;
				$fade_out = isset( $render['fadeOutSeconds'] ) ? (float) $render['fadeOutSeconds'] : 0.0;
				$assemble = Neo_Pulse_App_Video_Stitch::assemble( $segments, $out, $fade_in, $fade_out );
				if ( is_wp_error( $assemble ) ) {
					$render['status'] = 'failed';
					$render['error']  = $assemble->get_error_message();
				} else {
					$render['status']    = 'done';
					$render['finalFile'] = basename( $out );
				}
			}
		}
		$saved = Neo_Pulse_App_Video_Render_Store::write( $id, $render );
		if ( is_wp_error( $saved ) ) {
			return $saved;
		}
		return array( 'render' => Neo_Pulse_App_Video_Render_Store::snapshot( $render ) );
	}

	/**
	 * Submit one clip job from `$frame_path` (and optional `$last_frame_path`); marks the scene generating or failed.
	 *
	 * @param array<string,mixed> $render
	 * @param array<string,mixed> $scene
	 */
	private static function submit_scene( string $api_key, array $render, array &$scene, string $frame_path, string $last_frame_path = '' ): void {
		$ext  = pathinfo( $frame_path, PATHINFO_EXTENSION );
		$mime = $ext === 'jpg' ? 'image/jpeg' : 'image/' . $ext;
		$opts = array(
			'model'             => (string) $render['model'],
			'prompt'            => (string) $scene['videoPrompt'],
			'duration'          => (int) $scene['durationSeconds'],
			'resolution'        => (string) $render['resolution'],
			'aspectRatio'       => (string) $render['aspect'],
			'firstFrameDataUrl' => 'data:' . $mime . ';base64,' . base64_encode( (string) file_get_contents( $frame_path ) ),
		);
		if ( $last_frame_path !== '' && is_file( $last_frame_path ) ) {
			$last_ext                 = pathinfo( $last_frame_path, PATHINFO_EXTENSION );
			$last_mime                = $last_ext === 'jpg' ? 'image/jpeg' : 'image/' . $last_ext;
			$opts['lastFrameDataUrl'] = 'data:' . $last_mime . ';base64,' . base64_encode( (string) file_get_contents( $last_frame_path ) );
		}
		$job = Neo_Pulse_App_Openrouter_Video::submit( $api_key, $opts );
		if ( is_wp_error( $job ) ) {
			$scene['status'] = 'failed';
			$scene['error']  = $job->get_error_message();
			return;
		}
		$scene['status'] = 'generating';
		$scene['error']  = '';
		$scene['jobId']  = $job['id'];
	}

	/**
	 * GET video/render/{id}: advance jobs under a lock, chain continue scenes, assemble when every clip is on disk.
	 *
	 * @return array<string,mixed>|WP_Error
	 */
	private static function poll( string $id ) {
		$render = self::load( $id );
		if ( is_wp_error( $render ) ) {
			return $render;
		}
		if ( $render['status'] !== 'rendering' ) {
			return array( 'render' => Neo_Pulse_App_Video_Render_Store::snapshot( $render ) );
		}
		$lock = 'neo_pulse_video_tick_' . $id;
		if ( get_transient( $lock ) ) {
			return array( 'render' => Neo_Pulse_App_Video_Render_Store::snapshot( $render ) );
		}
		set_transient( $lock, 1, self::TICK_LOCK_TTL );
		try {
			$render = self::tick( $render );
		} finally {
			delete_transient( $lock );
		}
		return array( 'render' => Neo_Pulse_App_Video_Render_Store::snapshot( $render ) );
	}

	/**
	 * @param array<string,mixed> $render
	 * @return array<string,mixed>
	 */
	private static function tick( array $render ): array {
		$id      = (string) $render['id'];
		$api_key = Neo_Pulse_App_Openrouter_Image::resolve_key();
		if ( $api_key === '' ) {
			$render['status'] = 'failed';
			$render['error']  = 'OpenRouter API key is missing';
			Neo_Pulse_App_Video_Render_Store::write( $id, $render );
			return $render;
		}

		$count = count( $render['scenes'] );
		for ( $i = 0; $i < $count; $i++ ) {
			$scene = &$render['scenes'][ $i ];
			if ( $scene['status'] !== 'generating' ) {
				unset( $scene );
				continue;
			}
			$status = Neo_Pulse_App_Openrouter_Video::status( $api_key, (string) $scene['jobId'] );
			if ( is_wp_error( $status ) ) {
				$scene['status'] = 'failed';
				$scene['error']  = $status->get_error_message();
				unset( $scene );
				continue;
			}
			if ( $status['status'] === 'completed' ) {
				if ( $status['unsignedUrl'] === '' ) {
					$scene['status'] = 'failed';
					$scene['error']  = 'OpenRouter completed the job without a download URL';
					unset( $scene );
					continue;
				}
				$clip = Neo_Pulse_App_Video_Render_Store::clip_path( $id, (int) $scene['order'] );
				$dl   = Neo_Pulse_App_Openrouter_Video::download( $api_key, $status['unsignedUrl'], $clip );
				if ( is_wp_error( $dl ) ) {
					$scene['status'] = 'failed';
					$scene['error']  = $dl->get_error_message();
					unset( $scene );
					continue;
				}
				$scene['status']   = 'done';
				$scene['clipFile'] = basename( $clip );
				unset( $scene );
				self::chain_next( $api_key, $render, $i, $clip );
				continue;
			}
			if ( in_array( $status['status'], array( 'failed', 'cancelled', 'expired' ), true ) ) {
				$scene['status'] = 'failed';
				$scene['error']  = $status['error'] !== '' ? $status['error'] : 'OpenRouter job ' . $status['status'];
			}
			unset( $scene );
		}

		if ( ! self::settle_failures( $render ) ) {
			$pending = array_filter( $render['scenes'], static fn( $s ) => $s['status'] !== 'done' );
			if ( ! $pending ) {
				$render['status'] = 'stitching';
				Neo_Pulse_App_Video_Render_Store::write( $id, $render );
				$segments = array();
				foreach ( $render['scenes'] as $s ) {
					$segments[] = array(
						'clip'          => Neo_Pulse_App_Video_Render_Store::clip_path( $id, (int) $s['order'] ),
						'voice'         => $s['voiceFile'] === '' ? '' : Neo_Pulse_App_Video_Render_Store::voice_path( $id, (int) $s['order'] ),
						'voiceRate'     => (int) $s['voiceRate'],
						'voiceChannels' => (int) $s['voiceChannels'],
						'transition'    => $s['transition'],
					);
				}
				$out      = Neo_Pulse_App_Video_Render_Store::final_path( $id );
				$fade_in  = isset( $render['fadeInSeconds'] ) ? (float) $render['fadeInSeconds'] : 0.0;
				$fade_out = isset( $render['fadeOutSeconds'] ) ? (float) $render['fadeOutSeconds'] : 0.0;
				$assemble = Neo_Pulse_App_Video_Stitch::assemble( $segments, $out, $fade_in, $fade_out );
				if ( is_wp_error( $assemble ) ) {
					$render['status'] = 'failed';
					$render['error']  = $assemble->get_error_message();
				} else {
					$render['status']    = 'done';
					$render['finalFile'] = basename( $out );
				}
			}
		}
		Neo_Pulse_App_Video_Render_Store::write( $id, $render );
		return $render;
	}

	/**
	 * Scene `$index` just finished: when the next scene is a queued `continue`, submit it from this clip's last frame
	 * anchored to the next scene's approved storyboard frame as `last_frame`.
	 *
	 * @param array<string,mixed> $render
	 */
	private static function chain_next( string $api_key, array &$render, int $index, string $clip ): void {
		if ( ! isset( $render['scenes'][ $index + 1 ] ) ) {
			return;
		}
		$next = &$render['scenes'][ $index + 1 ];
		if ( $next['status'] !== 'queued' || ! is_array( $next['transition'] ) || $next['transition']['type'] !== 'continue' ) {
			unset( $next );
			return;
		}
		$id    = (string) $render['id'];
		$frame = Neo_Pulse_App_Video_Render_Store::chain_frame_path( $id, (int) $next['order'] );
		$grab  = Neo_Pulse_App_Video_Stitch::last_frame( $clip, $frame );
		if ( is_wp_error( $grab ) ) {
			$next['status'] = 'failed';
			$next['error']  = 'Could not read the last frame of scene ' . ( $index + 1 ) . ': ' . $grab->get_error_message();
			unset( $next );
			return;
		}
		$target_storyboard = $next['frameFile'] !== '' ? ( Neo_Pulse_App_Video_Render_Store::dir( $id ) . '/' . $next['frameFile'] ) : '';
		self::submit_scene( $api_key, $render, $next, $frame, $target_storyboard );
		unset( $next );
	}

	/**
	 * POST video/render/{id}/scene/{sceneId}/rerender  {dataUrl?, videoPrompt?, narration?, transitionIn?}
	 * Non-destructively re-renders a single scene clip while keeping all other finished scene clips intact.
	 *
	 * @param array<string,mixed> $body
	 * @return array<string,mixed>|WP_Error
	 */
	private static function rerender_scene( string $id, string $scene_id, array $body ) {
		$render = self::load( $id );
		if ( is_wp_error( $render ) ) {
			return $render;
		}
		$api_key = Neo_Pulse_App_Openrouter_Image::resolve_key();
		if ( $api_key === '' ) {
			return self::bad_request( 'OpenRouter API key is missing' );
		}
		$dir         = Neo_Pulse_App_Video_Render_Store::dir( $id );
		$scene_index = -1;
		foreach ( $render['scenes'] as $i => $s ) {
			if ( $s['id'] === $scene_id ) {
				$scene_index = $i;
				break;
			}
		}
		if ( $scene_index < 0 ) {
			return self::bad_request( 'Unknown sceneId ' . $scene_id );
		}

		$scene = &$render['scenes'][ $scene_index ];
		if ( ! empty( $body['dataUrl'] ) && is_string( $body['dataUrl'] ) ) {
			$data_url = trim( $body['dataUrl'] );
			if ( ! preg_match( '#^data:(image/(png|jpeg|webp));base64,(.+)$#s', $data_url, $m ) ) {
				unset( $scene );
				return self::bad_request( 'dataUrl must be a base64 PNG, JPEG or WebP data URL' );
			}
			$raw = base64_decode( $m[3], true );
			if ( $raw === false || strlen( $raw ) < 1024 ) {
				unset( $scene );
				return self::bad_request( 'dataUrl is not valid base64 image data' );
			}
			$ext  = $m[2] === 'jpeg' ? 'jpg' : $m[2];
			$file = 'scene-' . str_pad( (string) $scene['order'], 2, '0', STR_PAD_LEFT ) . '.' . $ext;
			if ( file_put_contents( $dir . '/' . $file, $raw ) === false ) {
				unset( $scene );
				return new WP_Error( 'neo-pulse_video', 'Could not write updated frame file' );
			}
			$scene['frameFile'] = $file;
		}

		if ( isset( $body['videoPrompt'] ) && trim( (string) $body['videoPrompt'] ) !== '' ) {
			$scene['videoPrompt'] = trim( (string) $body['videoPrompt'] );
		}
		if ( $scene_index > 0 && isset( $body['transitionIn'] ) && is_array( $body['transitionIn'] ) ) {
			$parsed_tr = self::parse_transition( $body['transitionIn'], $scene_index );
			if ( is_wp_error( $parsed_tr ) ) {
				unset( $scene );
				return $parsed_tr;
			}
			$scene['transition'] = $parsed_tr;
		}
		if ( isset( $body['narration'] ) && $render['voice'] !== 'none' ) {
			$narration = trim( (string) $body['narration'] );
			if ( $narration !== '' && $narration !== $scene['narration'] ) {
				$voice_path = Neo_Pulse_App_Video_Render_Store::voice_path( $id, (int) $scene['order'] );
				$tts        = Neo_Pulse_App_Openrouter_Speech::synthesize(
					$api_key,
					(string) $render['voiceModel'],
					(string) $render['voice'],
					$narration,
					$voice_path
				);
				if ( is_wp_error( $tts ) ) {
					unset( $scene );
					return new WP_Error( 'neo-pulse_video', 'Scene ' . $scene['order'] . ' narration failed: ' . $tts->get_error_message() );
				}
				$scene['narration']     = $narration;
				$scene['voiceFile']     = basename( $voice_path );
				$scene['voiceRate']     = $tts['rate'];
				$scene['voiceChannels'] = $tts['channels'];
			}
		}

		$is_continue = $scene_index > 0 && is_array( $scene['transition'] ) && $scene['transition']['type'] === 'continue';
		$prev_clip   = $scene_index > 0 ? Neo_Pulse_App_Video_Render_Store::clip_path( $id, (int) $render['scenes'][ $scene_index - 1 ]['order'] ) : '';
		if ( $is_continue && $prev_clip !== '' && is_file( $prev_clip ) ) {
			$chain_frame = Neo_Pulse_App_Video_Render_Store::chain_frame_path( $id, (int) $scene['order'] );
			$grab        = Neo_Pulse_App_Video_Stitch::last_frame( $prev_clip, $chain_frame );
			if ( ! is_wp_error( $grab ) ) {
				$target_storyboard = $scene['frameFile'] !== '' ? ( $dir . '/' . $scene['frameFile'] ) : '';
				self::submit_scene( $api_key, $render, $scene, $chain_frame, $target_storyboard );
			} else {
				self::submit_scene( $api_key, $render, $scene, $dir . '/' . $scene['frameFile'] );
			}
		} else {
			self::submit_scene( $api_key, $render, $scene, $dir . '/' . $scene['frameFile'] );
		}
		unset( $scene );

		$render['status']    = 'rendering';
		$render['error']     = '';
		$render['finalFile'] = '';
		self::settle_failures( $render );
		$saved = Neo_Pulse_App_Video_Render_Store::write( $id, $render );
		if ( is_wp_error( $saved ) ) {
			return $saved;
		}
		return array( 'render' => Neo_Pulse_App_Video_Render_Store::snapshot( $render ) );
	}

	/**
	 * POST video/render/{id}/restitch  {scenes?:[{id, transitionIn?}]}
	 * Re-runs final FFmpeg assembly using already-rendered scene clips on disk.
	 *
	 * @param array<string,mixed> $body
	 * @return array<string,mixed>|WP_Error
	 */
	private static function restitch( string $id, array $body ) {
		$render = self::load( $id );
		if ( is_wp_error( $render ) ) {
			return $render;
		}
		if ( isset( $body['fadeInSeconds'] ) ) {
			$render['fadeInSeconds'] = max( 0.0, min( 1.5, round( (float) $body['fadeInSeconds'], 1 ) ) );
		}
		if ( isset( $body['fadeOutSeconds'] ) ) {
			$render['fadeOutSeconds'] = max( 0.0, min( 1.5, round( (float) $body['fadeOutSeconds'], 1 ) ) );
		}
		$dir = Neo_Pulse_App_Video_Render_Store::dir( $id );
		if ( isset( $body['scenes'] ) && is_array( $body['scenes'] ) && count( $body['scenes'] ) > 0 ) {
			$existing_by_id = array();
			foreach ( $render['scenes'] as $s ) {
				if ( is_array( $s ) && ! empty( $s['id'] ) ) {
					$existing_by_id[ (string) $s['id'] ] = $s;
				}
			}
			$rebuilt = array();
			foreach ( array_values( $body['scenes'] ) as $idx => $patch ) {
				if ( ! is_array( $patch ) || empty( $patch['id'] ) ) {
					continue;
				}
				$sid = trim( (string) $patch['id'] );
				$tr  = null;
				if ( $idx > 0 ) {
					$parsed_tr = isset( $patch['transitionIn'] )
						? self::parse_transition( $patch['transitionIn'], $idx )
						: array( 'type' => 'dissolve', 'seconds' => 0.7 );
					$tr        = is_wp_error( $parsed_tr ) ? array( 'type' => 'dissolve', 'seconds' => 0.7 ) : $parsed_tr;
				}
				if ( isset( $existing_by_id[ $sid ] ) ) {
					$row               = $existing_by_id[ $sid ];
					$row['order']      = $idx + 1;
					$row['transition'] = $tr;
					$rebuilt[]         = $row;
					continue;
				}
				$custom_clip = isset( $patch['customClipFile'] ) ? trim( (string) $patch['customClipFile'] ) : '';
				$src_clip    = $custom_clip !== '' ? Neo_Pulse_App_Video_Render_Store::resolve_stored_clip_path( $custom_clip ) : '';
				if ( $src_clip !== '' ) {
					$safe_sid  = preg_replace( '/[^A-Za-z0-9_-]/', '', $sid );
					$clip_file = 'custom-' . $safe_sid . '.mp4';
					if ( @copy( $src_clip, $dir . '/' . $clip_file ) ) {
						$rebuilt[] = array(
							'id'              => $sid,
							'order'           => $idx + 1,
							'durationSeconds' => isset( $patch['durationSeconds'] ) ? max( 1, (int) $patch['durationSeconds'] ) : 5,
							'videoPrompt'     => 'Uploaded video clip',
							'narration'       => '',
							'transition'      => $tr,
							'customClipFile'  => $custom_clip,
							'status'          => 'done',
							'frameFile'       => '',
							'voiceFile'       => '',
							'voiceRate'       => 0,
							'voiceChannels'   => 0,
							'jobId'           => '',
							'clipFile'        => $clip_file,
							'error'           => '',
						);
					}
				}
			}
			if ( count( $rebuilt ) > 0 ) {
				$render['scenes'] = $rebuilt;
			}
		}
		$segments = array();
		foreach ( $render['scenes'] as $s ) {
			if ( $s['status'] !== 'done' ) {
				return self::bad_request( 'All scenes must be rendered before re-stitching (scene ' . $s['order'] . ' is ' . $s['status'] . ')' );
			}
			$clip_abs = ! empty( $s['clipFile'] ) && is_file( $dir . '/' . $s['clipFile'] )
				? $dir . '/' . $s['clipFile']
				: Neo_Pulse_App_Video_Render_Store::clip_path( $id, (int) $s['order'] );
			$segments[] = array(
				'clip'          => $clip_abs,
				'voice'         => $s['voiceFile'] === '' ? '' : Neo_Pulse_App_Video_Render_Store::voice_path( $id, (int) $s['order'] ),
				'voiceRate'     => (int) $s['voiceRate'],
				'voiceChannels' => (int) $s['voiceChannels'],
				'transition'    => $s['transition'],
			);
		}
		$out      = Neo_Pulse_App_Video_Render_Store::final_path( $id );
		$fade_in  = isset( $render['fadeInSeconds'] ) ? (float) $render['fadeInSeconds'] : 0.0;
		$fade_out = isset( $render['fadeOutSeconds'] ) ? (float) $render['fadeOutSeconds'] : 0.0;
		$assemble = Neo_Pulse_App_Video_Stitch::assemble( $segments, $out, $fade_in, $fade_out );
		if ( is_wp_error( $assemble ) ) {
			$render['status'] = 'failed';
			$render['error']  = $assemble->get_error_message();
		} else {
			$render['status']    = 'done';
			$render['error']     = '';
			$render['finalFile'] = basename( $out );
		}
		Neo_Pulse_App_Video_Render_Store::write( $id, $render );
		return array( 'render' => Neo_Pulse_App_Video_Render_Store::snapshot( $render ) );
	}

	/**
	 * One failed scene fails the render (no partial videos). Returns true when failed.
	 *
	 * @param array<string,mixed> $render
	 */
	private static function settle_failures( array &$render ): bool {
		foreach ( $render['scenes'] as $scene ) {
			if ( $scene['status'] === 'failed' ) {
				$render['status'] = 'failed';
				$render['error']  = 'Scene ' . $scene['order'] . ' failed: ' . $scene['error'];
				return true;
			}
		}
		return false;
	}
}
