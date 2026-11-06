<?php
/**
 * Knowledge model job progress (JSON files in the private neo-pulse-data root).
 *
 * @package Neo_Pulse_App
 */

defined( 'ABSPATH' ) || exit;

class Neo_Pulse_App_Knowledge_Model_Progress {

	public static function init( string $job_id ): void {
		self::write(
			$job_id,
			array(
				'status'         => 'initializing',
				'currentStep'    => 'Starting...',
				'totalPosts'     => 0,
				'processedPosts' => 0,
				'currentPost'    => null,
				'posts'          => array(),
				'errors'         => array(),
				'startTime'      => (int) round( microtime( true ) * 1000 ),
			)
		);
	}

	/**
	 * @param array<string,mixed> $update
	 */
	public static function update( string $job_id, array $update ): void {
		$progress = self::get( $job_id );
		if ( ! $progress ) {
			return;
		}
		$progress = array_merge( $progress, $update );
		$progress['lastUpdate'] = (int) round( microtime( true ) * 1000 );
		self::write( $job_id, $progress );
	}

	/**
	 * @param array<string,mixed> $post_info
	 */
	public static function add_post( string $job_id, array $post_info ): void {
		$progress = self::get( $job_id );
		if ( ! $progress ) {
			return;
		}
		$posts = isset( $progress['posts'] ) && is_array( $progress['posts'] ) ? $progress['posts'] : array();
		$url   = (string) ( $post_info['url'] ?? '' );
		$found = false;
		foreach ( $posts as $i => $row ) {
			if ( is_array( $row ) && ( $row['url'] ?? '' ) === $url ) {
				$posts[ $i ] = array(
					'url'    => $url,
					'title'  => $post_info['title'] ?? ( $row['title'] ?? 'Unknown' ),
					'status' => $post_info['status'] ?? 'processing',
					'postId' => $post_info['id'] ?? ( $row['postId'] ?? null ),
					'error'  => $post_info['error'] ?? null,
				);
				$found = true;
				break;
			}
		}
		if ( ! $found ) {
			$posts[] = array(
				'url'    => $url,
				'title'  => $post_info['title'] ?? 'Unknown',
				'status' => $post_info['status'] ?? 'processing',
				'postId' => $post_info['id'] ?? null,
				'error'  => $post_info['error'] ?? null,
			);
		}
		$progress['posts']          = $posts;
		$progress['processedPosts'] = count( $posts );
		$progress['currentPost']    = $post_info;
		$progress['lastUpdate']     = (int) round( microtime( true ) * 1000 );
		self::write( $job_id, $progress );
	}

	public static function set_total_posts( string $job_id, int $total ): void {
		self::update( $job_id, array( 'totalPosts' => $total ) );
	}

	/** @param mixed $result */
	public static function complete( string $job_id, $result = null ): void {
		$progress = self::get( $job_id );
		if ( ! $progress ) {
			return;
		}
		$now = (int) round( microtime( true ) * 1000 );
		$progress['status']      = 'completed';
		$progress['currentStep'] = 'Completed';
		$progress['result']      = $result;
		$progress['endTime']     = $now;
		$progress['duration']    = $now - (int) ( $progress['startTime'] ?? $now );
		self::write( $job_id, $progress );
	}

	public static function fail( string $job_id, string $error ): void {
		$progress = self::get( $job_id );
		if ( ! $progress ) {
			return;
		}
		$now = (int) round( microtime( true ) * 1000 );
		$progress['status']      = 'failed';
		$progress['currentStep'] = 'Failed';
		$progress['error']     = $error;
		$progress['endTime']     = $now;
		$progress['duration']    = $now - (int) ( $progress['startTime'] ?? $now );
		self::write( $job_id, $progress );
	}

	/** @return array<string,mixed>|null */
	public static function get( string $job_id ) {
		$path = Neo_Pulse_App_Data_Paths::knowledge_model_job_path( $job_id );
		return Neo_Pulse_App_Json_File_Store::read( $path );
	}

	/** @param array<string,mixed> $data */
	private static function write( string $job_id, array $data ): void {
		Neo_Pulse_App_Json_File_Store::write( Neo_Pulse_App_Data_Paths::knowledge_model_job_path( $job_id ), $data );
	}
}
