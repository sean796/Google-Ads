<?php
/**
 * IndexNow: tells Bing, Yandex, Seznam and other IndexNow engines when a page is published,
 * updated or removed, as Rank Math's Instant Indexing did.
 *
 * Uses Rank Math's key and post types when the site had them. Runs only while Neo Pulse SEO is
 * live, never on staging or non-public sites, and sends in the background (WP-Cron) so saving a
 * post is never slowed down.
 *
 * @package Neo_Pulse_Wp
 */

defined( 'ABSPATH' ) || exit;

class Neo_Pulse_Wp_Seo_Indexnow {

	const OPTION     = 'neo_pulse_wp_indexnow';
	const LOG        = 'neo_pulse_wp_indexnow_log';
	const RM_OPTION  = 'rank-math-options-instant-indexing';
	const ENDPOINT   = 'https://api.indexnow.org/indexnow';
	const CRON_HOOK  = 'neo_pulse_wp_indexnow_send';
	const LOG_SIZE   = 50;
	const THROTTLE   = 600;
	const BATCH_SIZE = 10000;

	/** @var array<string, array{post_id: int, removed: bool}> */
	private static $queue = array();

	/** @var array<string, mixed>|null */
	private static $settings = null;

	public static function init(): void {
		if ( ! Neo_Pulse_Wp_Seo_Settings::output_active() ) {
			return;
		}
		add_action( 'init', array( __CLASS__, 'maybe_serve_key' ), 0 );
		add_action( self::CRON_HOOK, array( __CLASS__, 'send' ) );
		if ( ! self::can_submit() ) {
			return;
		}
		add_action( 'transition_post_status', array( __CLASS__, 'on_transition' ), 20, 3 );
		add_action( 'shutdown', array( __CLASS__, 'flush' ) );
	}

	/**
	 * Own settings, created once from Rank Math's (key, post types, whether the module was on).
	 *
	 * @return array{key: string, post_types: array<int, string>, enabled: bool}
	 */
	public static function settings(): array {
		if ( null !== self::$settings ) {
			return self::$settings;
		}
		$own = get_option( self::OPTION, array() );
		$own = is_array( $own ) ? $own : array();
		if ( ! self::valid_key( (string) ( $own['key'] ?? '' ) ) ) {
			$rm  = get_option( self::RM_OPTION, array() );
			$rm  = is_array( $rm ) ? $rm : array();
			$key = (string) ( $rm['indexnow_api_key'] ?? '' );
			$own = array(
				'key'        => self::valid_key( $key ) ? $key : str_replace( '-', '', wp_generate_uuid4() ),
				'post_types' => isset( $rm['bing_post_types'] ) ? (array) $rm['bing_post_types'] : array( 'post', 'page' ),
				'enabled'    => self::rank_math_module_on(),
			);
			// Autoloaded: the key is checked on front-end requests.
			update_option( self::OPTION, $own, true );
		}
		self::$settings = array(
			'key'        => (string) $own['key'],
			'post_types' => array_values( array_filter( array_map( 'strval', (array) ( $own['post_types'] ?? array( 'post', 'page' ) ) ) ) ),
			'enabled'    => ! empty( $own['enabled'] ),
		);
		return self::$settings;
	}

	/**
	 * On unless the site ran Rank Math with its Instant Indexing module switched off.
	 */
	private static function rank_math_module_on(): bool {
		$modules = get_option( 'rank_math_modules', null );
		return ! is_array( $modules ) || in_array( 'instant-indexing', $modules, true );
	}

	/** IndexNow key shape: 8-128 characters, a-z, A-Z, 0-9 and "-". */
	const KEY_PATTERN = '[a-zA-Z0-9-]{8,128}';

	private static function valid_key( string $key ): bool {
		return (bool) preg_match( '/^' . self::KEY_PATTERN . '$/', $key );
	}

	/**
	 * Where search engines check the key. WP Engine's nginx answers missing .txt files itself, so a
	 * key file that only WordPress knows about is never found (that is why Rank Math's submissions
	 * on WP Engine sites came back "403 Forbidden"). A real file in the site root works everywhere;
	 * if it cannot be written, WordPress answers the key at an address without an extension.
	 */
	public static function key_url(): string {
		$key = self::settings()['key'];
		return self::ensure_key_file() ? home_url( '/' . $key . '.txt' ) : home_url( '/' . $key );
	}

	public static function ensure_key_file(): bool {
		$key = self::settings()['key'];
		if ( ! function_exists( 'get_home_path' ) ) {
			require_once ABSPATH . 'wp-admin/includes/file.php';
		}
		$root = trailingslashit( get_home_path() );
		$file = $root . $key . '.txt';
		if ( is_readable( $file ) && trim( (string) file_get_contents( $file ) ) === $key ) { // phpcs:ignore WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents
			return true;
		}
		if ( ! wp_is_writable( $root ) ) {
			return false;
		}
		return false !== file_put_contents( $file, $key ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_file_put_contents
	}

	/**
	 * Production site that search engines may crawl.
	 */
	public static function can_submit(): bool {
		if ( ! self::settings()['enabled'] || '0' === (string) get_option( 'blog_public', '1' ) ) {
			return false;
		}
		if ( Neo_Pulse_Wp_Site::is_staging() ) {
			return false;
		}
		$host = strtolower( (string) wp_parse_url( home_url(), PHP_URL_HOST ) );
		return ! preg_match( '/(\.local|\.test|localhost|127\.0\.0\.1)/', $host );
	}

	/**
	 * Answer /{key}.txt and /{key} with the key, which is how IndexNow checks the site owns it.
	 */
	public static function maybe_serve_key(): void {
		$path = (string) wp_parse_url( isset( $_SERVER['REQUEST_URI'] ) ? (string) wp_unslash( $_SERVER['REQUEST_URI'] ) : '', PHP_URL_PATH );
		$home = (string) wp_parse_url( home_url( '/' ), PHP_URL_PATH );
		$name = trim( substr( $path, strlen( $home ) ), '/' );
		// Cheap shape check before reading anything: one path segment, key-like.
		if ( ! preg_match( '/^' . self::KEY_PATTERN . '(\.txt)?$/', $name ) ) {
			return;
		}
		$key = self::settings()['key'];
		if ( $name !== $key . '.txt' && $name !== $key ) {
			return;
		}
		nocache_headers();
		header( 'Content-Type: text/plain; charset=utf-8' );
		header( 'X-Robots-Tag: noindex' );
		echo esc_html( $key );
		exit;
	}

	/**
	 * @param string  $new_status New status.
	 * @param string  $old_status Old status.
	 * @param WP_Post $post       Post.
	 */
	public static function on_transition( $new_status, $old_status, $post ): void {
		if ( ! $post instanceof WP_Post || wp_is_post_revision( $post ) || wp_is_post_autosave( $post ) ) {
			return;
		}
		if ( ! in_array( $post->post_type, self::settings()['post_types'], true ) ) {
			return;
		}
		$published_now = 'publish' === $new_status;
		$removed       = 'publish' === $old_status && 'publish' !== $new_status;
		if ( ! $published_now && ! $removed ) {
			return;
		}
		$url = $removed ? self::removed_url( $post ) : get_permalink( $post );
		if ( is_string( $url ) && $url !== '' ) {
			self::$queue[ $url ] = array(
				'post_id' => (int) $post->ID,
				'removed' => $removed,
			);
		}
	}

	private static function removed_url( WP_Post $post ): string {
		$clone              = clone $post;
		$clone->post_status = 'publish';
		$clone->post_name   = preg_replace( '/__trashed$/', '', (string) $clone->post_name );
		$url                = get_permalink( $clone );
		return is_string( $url ) ? $url : '';
	}

	/**
	 * End of the request: hand the URLs to a background job. The block editor saves twice (once for
	 * the post, once for the meta boxes), so a URL sent in the last 10 minutes is skipped.
	 */
	public static function flush(): void {
		if ( self::$queue === array() ) {
			return;
		}
		$batch = array();
		foreach ( self::$queue as $url => $item ) {
			$lock = 'npwp_indexnow_' . md5( $url );
			if ( get_transient( $lock ) ) {
				continue;
			}
			set_transient( $lock, 1, self::THROTTLE );
			$batch[] = array( $url, $item['post_id'], $item['removed'] );
		}
		self::$queue = array();
		if ( $batch !== array() ) {
			wp_schedule_single_event( time() + 30, self::CRON_HOOK, array( $batch ) );
		}
	}

	/**
	 * Background job. Published pages are checked again here, after the meta boxes have saved, so a
	 * page just switched to noindex or made private is not sent.
	 *
	 * @param mixed $batch [ url, post id, removed ] rows.
	 */
	public static function send( $batch ): void {
		// The job may run after the site moved to staging or the setting was switched off.
		if ( ! self::can_submit() ) {
			return;
		}
		$urls = array();
		foreach ( (array) $batch as $row ) {
			if ( ! is_array( $row ) || count( $row ) < 3 ) {
				continue;
			}
			list( $url, $post_id, $removed ) = $row;
			if ( ! $removed && ! Neo_Pulse_Wp_Seo_Head::is_indexable_post( (int) $post_id ) ) {
				continue;
			}
			$urls[] = (string) $url;
		}
		foreach ( array_chunk( array_values( array_unique( $urls ) ), self::BATCH_SIZE ) as $chunk ) {
			self::submit( $chunk );
		}
	}

	/**
	 * @param array<int, string> $urls Absolute URLs on this site.
	 * @return int HTTP status (0 on a connection error).
	 */
	public static function submit( array $urls ): int {
		$settings = self::settings();
		$host     = (string) wp_parse_url( home_url(), PHP_URL_HOST );
		$response = wp_remote_post(
			self::ENDPOINT,
			array(
				'timeout' => 10,
				'headers' => array( 'Content-Type' => 'application/json; charset=utf-8' ),
				'body'    => wp_json_encode(
					array(
						'host'        => $host,
						'key'         => $settings['key'],
						'keyLocation' => self::key_url(),
						'urlList'     => array_values( $urls ),
					)
				),
			)
		);
		$code = is_wp_error( $response ) ? 0 : (int) wp_remote_retrieve_response_code( $response );
		self::log( $urls, $code, is_wp_error( $response ) ? $response->get_error_message() : (string) wp_remote_retrieve_response_message( $response ) );
		return $code;
	}

	/**
	 * @param array<int, string> $urls URLs sent.
	 */
	private static function log( array $urls, int $code, string $message ): void {
		$log = get_option( self::LOG, array() );
		$log = is_array( $log ) ? $log : array();
		foreach ( array_slice( $urls, 0, self::LOG_SIZE ) as $url ) {
			array_unshift(
				$log,
				array(
					'url'     => $url,
					'status'  => $code,
					'message' => $message,
					'time'    => time(),
				)
			);
		}
		update_option( self::LOG, array_slice( $log, 0, self::LOG_SIZE ), false );
	}

	/**
	 * Latest submission, for the SEO screen.
	 *
	 * @return array<string, mixed>|null
	 */
	public static function last(): ?array {
		$log = get_option( self::LOG, array() );
		return is_array( $log ) && isset( $log[0] ) && is_array( $log[0] ) ? $log[0] : null;
	}
}
