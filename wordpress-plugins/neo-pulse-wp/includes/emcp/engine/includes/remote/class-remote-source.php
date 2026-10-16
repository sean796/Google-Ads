<?php
/**
 * Remote Source — runs a `remote` query preset: fetch over HTTPS with
 * WordPress's safe HTTP client, cache in a transient, serve the last good
 * payload when the provider is down, and map the JSON into widget rows.
 *
 * No key ever reaches a widget spec, generated PHP or the browser: the preset
 * names its key provider and the runtime reads the key from
 * EMCP_Tools_Remote_Keys at request time.
 *
 * @package EMCP_Tools
 * @since   3.18.0
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class EMCP_Tools_Remote_Source {

	const TIMEOUT      = 5;
	const MAX_BYTES    = 524288; // 512 KB
	const STALE_TTL    = DAY_IN_SECONDS;
	const MAX_ROWS     = 50;
	const CACHE_PREFIX = 'emcp_rq_';

	/** @var callable|null Test seam: fn( string $url, array $args ): array|WP_Error */
	private static $transport = null;

	/** @var array<string, EMCP_Tools_Remote_Preset>|null */
	private static $presets = null;

	/** @var string Last error message for the current request (read by run()). */
	private static $last_error = '';

	/**
	 * @param callable|null $t Injected transport, or null to reset.
	 */
	public static function set_transport( ?callable $t ): void {
		self::$transport = $t;
	}

	/** @return array<string, EMCP_Tools_Remote_Preset> */
	public static function presets(): array {
		if ( null === self::$presets ) {
			self::$presets = array();
			foreach ( array( 'EMCP_Tools_Remote_Preset_OpenWeather', 'EMCP_Tools_Remote_Preset_Google_Reviews', 'EMCP_Tools_Remote_Preset_Yelp', 'EMCP_Tools_Remote_Preset_Json' ) as $cls ) {
				if ( class_exists( $cls ) ) {
					$p = new $cls();
					self::$presets[ $p->key() ] = $p;
				}
			}
		}
		return self::$presets;
	}

	/** @return string[] */
	public static function preset_keys(): array {
		return array_keys( self::presets() );
	}

	/**
	 * @param string $key Preset key.
	 * @return EMCP_Tools_Remote_Preset|null
	 */
	public static function preset( string $key ): ?EMCP_Tools_Remote_Preset {
		return self::presets()[ $key ] ?? null;
	}

	/** @return string */
	public static function last_error(): string {
		return self::$last_error;
	}

	/**
	 * Runs a preset with unprefixed settings. Never throws.
	 *
	 * @param string $preset Preset key.
	 * @param array  $args   Unprefixed settings.
	 * @return array<int, array<string, string>>
	 */
	public static function run( string $preset, array $args ): array {
		self::$last_error = '';
		$p = self::preset( $preset );
		if ( ! $p ) {
			self::$last_error = 'Unknown preset.';
			return array();
		}
		$provider = $p->key_provider( $args );
		$key      = '';
		if ( '' !== $provider ) {
			$key = class_exists( 'EMCP_Tools_Remote_Keys' ) ? EMCP_Tools_Remote_Keys::get( $provider ) : '';
			if ( '' === $key ) {
				$info  = class_exists( 'EMCP_Tools_Remote_Keys' ) ? (array) ( EMCP_Tools_Remote_Keys::providers()[ $provider ] ?? array() ) : array();
				$label = (string) ( $info['label'] ?? $provider );
				// Inside an exported standalone plugin there is no EMCP admin screen: point at the constant instead.
				if ( defined( 'EMCP_SANDBOX_EXPORT_OWNER' ) && ! empty( $info['const'] ) ) {
					self::$last_error = sprintf( 'Add your %1$s API key by defining %2$s in wp-config.php or the plugin config.php.', $label, (string) $info['const'] );
				} else {
					self::$last_error = sprintf( 'Add your %s API key under Neo EMCP > Connection > 3rd Party Services.', $label );
				}
				return array();
			}
		}
		$req = $p->request( $args, $key );
		if ( ! $req || empty( $req['url'] ) ) {
			self::$last_error = 'This widget needs its Query settings filled in.';
			return array();
		}
		$url = (string) $req['url'];
		if ( 0 !== stripos( $url, 'https://' ) ) {
			self::$last_error = 'Only https:// endpoints are allowed.';
			return array();
		}
		// Cache key excludes the api key value so a key rotation does not orphan entries.
		$ckey  = self::CACHE_PREFIX . md5( $preset . '|' . $url . '|' . wp_json_encode( $req['headers'] ?? array() ) );
		$cached = get_transient( $ckey );
		if ( is_array( $cached ) ) {
			return self::rows( $p, $cached, $args );
		}
		$json = self::fetch( $url, (array) ( $req['headers'] ?? array() ) );
		if ( null === $json ) {
			$stale = get_transient( $ckey . '_stale' );
			if ( is_array( $stale ) ) {
				self::$last_error .= ' Showing the last successful data.';
				return self::rows( $p, $stale, $args );
			}
			return array();
		}
		// A preset may expose a "Cache (minutes)" control; clamp it to 1 min .. 1 day.
		$ttl = ( isset( $args['ttl'] ) && is_numeric( $args['ttl'] ) ) ? max( 60, min( DAY_IN_SECONDS, (int) $args['ttl'] * 60 ) ) : max( 60, (int) $p->ttl() );
		set_transient( $ckey, $json, $ttl );
		set_transient( $ckey . '_stale', $json, self::STALE_TTL );
		return self::rows( $p, $json, $args );
	}

	/**
	 * @param EMCP_Tools_Remote_Preset $p    Preset.
	 * @param array                    $json Decoded payload.
	 * @param array                    $args Unprefixed settings.
	 * @return array<int, array<string, string>>
	 */
	private static function rows( EMCP_Tools_Remote_Preset $p, array $json, array $args ): array {
		try {
			$rows = $p->map( $json, $args );
		} catch ( \Throwable $e ) {
			self::$last_error = 'The provider response did not have the expected shape.';
			return array();
		}
		$rows = array_slice( array_values( (array) $rows ), 0, self::MAX_ROWS );
		$out  = array();
		foreach ( $rows as $i => $row ) {
			$clean = array();
			foreach ( (array) $row as $k => $v ) {
				$clean[ (string) $k ] = is_scalar( $v ) ? (string) $v : '';
			}
			$clean['index'] = (string) $i;
			$out[]          = $clean;
		}
		return $out;
	}

	/**
	 * GET a JSON document through wp_safe_remote_get (rejects private and
	 * loopback hosts), with a size cap. Returns null on any failure and
	 * records the reason.
	 *
	 * @param string               $url     URL.
	 * @param array<string,string> $headers Extra headers.
	 * @return array|null
	 */
	private static function fetch( string $url, array $headers ): ?array {
		$args = array(
			'timeout'             => self::TIMEOUT,
			'redirection'         => 2,
			'limit_response_size' => self::MAX_BYTES,
			'headers'             => array_merge( array( 'Accept' => 'application/json' ), $headers ),
			'user-agent'          => 'EMCP-Tools/' . ( defined( 'EMCP_TOOLS_VERSION' ) ? EMCP_TOOLS_VERSION : 'dev' ) . '; ' . home_url( '/' ),
		);
		try {
			$res = self::$transport ? call_user_func( self::$transport, $url, $args ) : wp_safe_remote_get( $url, $args );
		} catch ( \Throwable $e ) {
			self::$last_error = 'Request failed: ' . $e->getMessage();
			return null;
		}
		if ( is_wp_error( $res ) ) {
			self::$last_error = 'Request failed: ' . $res->get_error_message();
			self::log( $url, self::$last_error );
			return null;
		}
		$code = (int) wp_remote_retrieve_response_code( $res );
		$body = (string) wp_remote_retrieve_body( $res );
		if ( $code < 200 || $code >= 300 ) {
			self::$last_error = sprintf( 'The provider answered HTTP %d.', $code );
			self::log( $url, self::$last_error . ' ' . substr( $body, 0, 200 ) );
			return null;
		}
		if ( strlen( $body ) > self::MAX_BYTES ) {
			self::$last_error = 'The provider response was too large.';
			return null;
		}
		$json = json_decode( $body, true );
		if ( ! is_array( $json ) ) {
			self::$last_error = 'The provider did not return JSON.';
			return null;
		}
		return $json;
	}

	/**
	 * @param string $url URL.
	 * @param string $msg Message.
	 */
	private static function log( string $url, string $msg ): void {
		if ( defined( 'WP_DEBUG' ) && WP_DEBUG ) {
			// Never log the query string: it may carry the api key.
			$host = (string) wp_parse_url( $url, PHP_URL_HOST );
			error_log( '[EMCP Remote Source] ' . $host . ': ' . $msg ); // phpcs:ignore WordPress.PHP.DevelopmentFunctions.error_log_error_log
		}
	}

	/**
	 * Dot-path lookup used by the presets ("main.temp", "results.0.name").
	 *
	 * @param array  $data Decoded JSON.
	 * @param string $path Dot path ('' = whole document).
	 * @return mixed|null
	 */
	public static function pluck( array $data, string $path ) {
		if ( '' === $path ) {
			return $data;
		}
		$cur = $data;
		foreach ( explode( '.', $path ) as $seg ) {
			if ( is_array( $cur ) && array_key_exists( $seg, $cur ) ) {
				$cur = $cur[ $seg ];
			} else {
				return null;
			}
		}
		return $cur;
	}

	/**
	 * Formats a UNIX timestamp in the site's timezone.
	 *
	 * @param int    $ts     Timestamp.
	 * @param string $format Date format (default: site time format).
	 * @return string
	 */
	public static function time( int $ts, string $format = '' ): string {
		if ( $ts <= 0 ) {
			return '';
		}
		$format = '' !== $format ? $format : (string) get_option( 'time_format', 'H:i' );
		return function_exists( 'wp_date' ) ? (string) wp_date( $format, $ts ) : gmdate( $format, $ts );
	}

	/** Test seam. */
	public static function reset_for_tests(): void {
		self::$transport  = null;
		self::$last_error = '';
	}
}
