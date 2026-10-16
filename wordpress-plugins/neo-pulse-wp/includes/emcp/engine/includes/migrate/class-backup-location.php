<?php
/**
 * Where backups live, and keeping that folder closed to the web.
 *
 * Backups (full database dumps, .emcp archives, restore uploads) must never be
 * downloadable over HTTP. An .htaccess deny is not enough: nginx (Kinsta and
 * most managed hosts) ignores it. So, in order:
 *
 * 1. EMCP_BACKUP_DIR in wp-config.php names the folder outright.
 * 2. Otherwise backups go next to the WordPress folder, outside the web root,
 *    when that parent folder is writable and clearly not web-served itself.
 * 3. Otherwise they go to wp-content/emcp-backups-{20 hex}, a name derived from
 *    the site's salts (wp-config.php), so it cannot be guessed and survives a
 *    database restore, which replaces every option.
 *
 * Every folder also gets .htaccess (Apache 2.2 and 2.4), web.config (IIS) and
 * index files, and web_check() fetches a test file over HTTP to prove the
 * folder is closed. Backups from the old wp-content/emcp-backups folder move
 * over automatically.
 *
 * @package EMCP_Tools
 * @since   3.20.0
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

final class EMCP_Tools_Backup_Location {

	const CONSTANT     = 'EMCP_BACKUP_DIR';
	const LEGACY       = 'emcp-backups';
	const PREFIX       = 'emcp-backups-';
	const MARKER       = '.emcp-backups';
	const CHECK_OPTION = 'emcp_tools_backup_web_check';
	const MOVE_OPTION  = 'emcp_tools_backup_legacy_left';
	const CHECK_TTL    = WEEK_IN_SECONDS;

	/** Parent folder names that are web roots on common hosts. */
	const WEB_ROOT_NAMES = array( 'public_html', 'www', 'htdocs', 'httpdocs', 'html', 'wwwroot', 'web', 'public', 'webroot', 'site', 'sites' );

	/** Files that mark a folder as web-served. */
	const WEB_ROOT_FILES = array( 'index.php', 'index.html', 'index.htm', '.htaccess', 'web.config', 'wp-config.php' );

	/** @var array{dir: string, mode: string}|null */
	private static $resolved = null;

	/**
	 * The backup folder (no trailing slash), created and protected.
	 *
	 * @return string
	 */
	public static function dir(): string {
		if ( null === self::$resolved ) {
			self::$resolved = self::resolve( self::environment() );
			self::create( self::$resolved['dir'] );
		}
		return self::$resolved['dir'];
	}

	/**
	 * How the folder was chosen: custom, outside or inside.
	 *
	 * @return string
	 */
	public static function mode(): string {
		self::dir();
		return self::$resolved['mode'];
	}

	/** Forget the resolved folder (tests, and after a move). */
	public static function reset(): void {
		self::$resolved = null;
	}

	/**
	 * The salt-derived folder name, e.g. emcp-backups-3f9a...
	 *
	 * @param string $salt Secret (defaults to wp_salt('auth')).
	 * @return string
	 */
	public static function folder_name( string $salt = '' ): string {
		$salt = '' !== $salt ? $salt : ( function_exists( 'wp_salt' ) ? wp_salt( 'auth' ) : ( defined( 'AUTH_KEY' ) ? AUTH_KEY : ABSPATH ) );
		return self::PREFIX . substr( hash_hmac( 'sha256', 'emcp-backups', $salt ), 0, 20 );
	}

	/**
	 * The facts resolve() needs, read from WordPress and the server.
	 *
	 * @return array
	 */
	private static function environment(): array {
		$constant = defined( self::CONSTANT ) ? (string) constant( self::CONSTANT ) : '';
		return array(
			'constant'      => $constant,
			'abspath'       => ABSPATH,
			'content_dir'   => WP_CONTENT_DIR,
			'document_root' => isset( $_SERVER['DOCUMENT_ROOT'] ) ? (string) $_SERVER['DOCUMENT_ROOT'] : '', // phpcs:ignore WordPress.Security.ValidatedSanitizedInput -- a path, compared only.
			'name'          => self::folder_name(),
			'is_dir'        => 'is_dir',
			'is_writable'   => static fn( string $p ): bool => (bool) @is_writable( $p ), // phpcs:ignore WordPress.PHP.NoSilencedErrors -- open_basedir may refuse.
			'exists'        => static fn( string $p ): bool => (bool) @file_exists( $p ), // phpcs:ignore WordPress.PHP.NoSilencedErrors -- open_basedir may refuse.
			'glob'          => static fn( string $pattern ): array => (array) glob( $pattern, GLOB_ONLYDIR ),
		);
	}

	/**
	 * Choose the folder. Pure apart from the callables in $env.
	 *
	 * @param array $env See environment().
	 * @return array{dir: string, mode: string, renamed_from?: string}
	 */
	public static function resolve( array $env ): array {
		$norm = static fn( string $p ): string => rtrim( str_replace( '\\', '/', $p ), '/' );
		if ( '' !== trim( (string) $env['constant'] ) ) {
			return array( 'dir' => $norm( (string) $env['constant'] ), 'mode' => 'custom' );
		}
		$abspath = $norm( (string) $env['abspath'] );
		$parent  = $norm( dirname( $abspath ) );
		$outside = $parent . '/' . $env['name'];
		$inside  = $norm( (string) $env['content_dir'] ) . '/' . $env['name'];

		if ( ( $env['is_dir'] )( $outside ) ) {
			return array( 'dir' => $outside, 'mode' => 'outside' );
		}
		if ( ( $env['is_dir'] )( $inside ) ) {
			return array( 'dir' => $inside, 'mode' => 'inside' );
		}
		// The salts changed: adopt the one marked folder, renamed by create().
		foreach ( array( array( $parent, $outside, 'outside' ), array( $norm( (string) $env['content_dir'] ), $inside, 'inside' ) ) as $where ) {
			$found = array_values(
				array_filter(
					( $env['glob'] )( $where[0] . '/' . self::PREFIX . '*' ),
					static fn( $d ) => ( $env['exists'] )( $norm( (string) $d ) . '/' . self::MARKER )
				)
			);
			if ( 1 === count( $found ) ) {
				return array( 'dir' => $where[1], 'mode' => $where[2], 'renamed_from' => $norm( (string) $found[0] ) );
			}
		}
		if ( self::outside_allowed( $env, $parent, $outside ) ) {
			return array( 'dir' => $outside, 'mode' => 'outside' );
		}
		return array( 'dir' => $inside, 'mode' => 'inside' );
	}

	/**
	 * Whether a new folder may go next to the WordPress folder. Only from a
	 * web request (so the document root is known), only when the parent is
	 * writable, outside the document root and does not look web-served: on an
	 * addon domain or in a subfolder install the parent is another site's
	 * web root, and a folder there would be public.
	 *
	 * @param array  $env     Environment.
	 * @param string $parent  The folder holding WordPress.
	 * @param string $outside The candidate.
	 * @return bool
	 */
	private static function outside_allowed( array $env, string $parent, string $outside ): bool {
		$root = rtrim( str_replace( '\\', '/', (string) $env['document_root'] ), '/' );
		if ( '' === $root || '' === $parent || ! ( $env['is_writable'] )( $parent ) ) {
			return false;
		}
		$under = static fn( string $path, string $base ): bool => 0 === stripos( $path . '/', $base . '/' );
		if ( $under( $outside, $root ) || $under( $parent, $root ) ) {
			return false;
		}
		if ( in_array( strtolower( basename( $parent ) ), self::WEB_ROOT_NAMES, true ) ) {
			return false;
		}
		foreach ( self::WEB_ROOT_FILES as $file ) {
			if ( ( $env['exists'] )( $parent . '/' . $file ) ) {
				return false;
			}
		}
		return true;
	}

	/**
	 * Create the folder (or adopt a renamed one) and protect it.
	 *
	 * @param string $dir Folder.
	 */
	private static function create( string $dir ): void {
		$from = self::$resolved['renamed_from'] ?? '';
		if ( '' !== $from && ! is_dir( $dir ) && is_dir( $from ) ) {
			@rename( $from, $dir ); // phpcs:ignore WordPress.PHP.NoSilencedErrors, WordPress.WP.AlternativeFunctions -- a failure leaves a fresh folder.
		}
		if ( ! is_dir( $dir ) && function_exists( 'wp_mkdir_p' ) ) {
			wp_mkdir_p( $dir );
		}
		if ( is_dir( $dir ) ) {
			self::protect( $dir );
		}
	}

	/**
	 * Deny web access to a folder in every way a server might honour, and mark
	 * it as ours.
	 *
	 * @param string $dir Folder.
	 */
	public static function protect( string $dir ): void {
		$files = array(
			'.htaccess'   => "# Neo EMCP backups: never served.\n<IfModule mod_authz_core.c>\n\tRequire all denied\n</IfModule>\n<IfModule !mod_authz_core.c>\n\tOrder allow,deny\n\tDeny from all\n</IfModule>\n",
			'web.config'  => "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<configuration>\n\t<system.webServer>\n\t\t<authorization>\n\t\t\t<deny users=\"*\" />\n\t\t</authorization>\n\t</system.webServer>\n</configuration>\n",
			'index.php'   => "<?php\n// Silence is golden.\n",
			'index.html'  => '',
			self::MARKER  => "Neo EMCP backup folder. Do not serve over HTTP.\n",
		);
		foreach ( $files as $name => $body ) {
			$path = $dir . '/' . $name;
			if ( ! file_exists( $path ) || ( '.htaccess' === $name && false === strpos( (string) file_get_contents( $path ), 'Require all denied' ) ) ) { // phpcs:ignore WordPress.WP.AlternativeFunctions
				@file_put_contents( $path, $body ); // phpcs:ignore WordPress.PHP.NoSilencedErrors, WordPress.WP.AlternativeFunctions
			}
		}
	}

	/**
	 * Paths, relative to the WordPress folder, that backups, syncs and
	 * migrations must never pack.
	 *
	 * @return string[]
	 */
	public static function excludes(): array {
		$out = array( 'wp-content/' . self::LEGACY . '/', 'wp-content/' . self::PREFIX . '*' );
		$rel = self::relative( self::dir() );
		if ( null !== $rel ) {
			$out[] = $rel . '/';
		}
		return array_values( array_unique( $out ) );
	}

	/**
	 * A folder's path relative to the WordPress folder, or null outside it.
	 *
	 * @param string $dir Folder.
	 * @return string|null
	 */
	public static function relative( string $dir ): ?string {
		$abs = rtrim( str_replace( '\\', '/', ABSPATH ), '/' ) . '/';
		$dir = rtrim( str_replace( '\\', '/', $dir ), '/' );
		return 0 === stripos( $dir . '/', $abs ) ? substr( $dir, strlen( $abs ) ) : null;
	}

	/** The folder backups used before 3.20.0. */
	public static function legacy_dir(): string {
		return rtrim( str_replace( '\\', '/', WP_CONTENT_DIR ), '/' ) . '/' . self::LEGACY;
	}

	/**
	 * Move backups out of the old wp-content/emcp-backups folder. Skipped while
	 * a backup, restore or sync job runs, because jobs hold absolute paths.
	 * Entries that cannot be renamed (another disk) stay, and are counted so
	 * the Dashboard can say so.
	 *
	 * @param bool   $busy   Whether a job is running.
	 * @param string $legacy Old folder (tests); default legacy_dir().
	 * @param string $dir    New folder (tests); default dir().
	 * @return array{moved: int, left: int}
	 */
	public static function migrate_legacy( bool $busy, string $legacy = '', string $dir = '' ): array {
		$legacy = '' !== $legacy ? $legacy : self::legacy_dir();
		$dir    = '' !== $dir ? $dir : self::dir();
		if ( ! is_dir( $legacy ) || $legacy === $dir || $busy ) {
			return array( 'moved' => 0, 'left' => is_dir( $legacy ) && $legacy !== $dir ? self::count_entries( $legacy ) : 0 );
		}
		$moved = 0;
		$left  = 0;
		foreach ( (array) scandir( $legacy ) as $entry ) {
			if ( in_array( $entry, array( '.', '..', '.htaccess', 'index.php', 'index.html', 'web.config' ), true ) ) {
				continue;
			}
			$target = $dir . '/' . $entry;
			if ( ! file_exists( $target ) && @rename( $legacy . '/' . $entry, $target ) ) { // phpcs:ignore WordPress.PHP.NoSilencedErrors, WordPress.WP.AlternativeFunctions
				++$moved;
			} elseif ( 'uploads' === $entry && is_dir( $legacy . '/uploads' ) && is_dir( $target ) ) {
				// Both have an uploads folder: move the files one by one.
				foreach ( (array) scandir( $legacy . '/uploads' ) as $file ) {
					if ( ! in_array( $file, array( '.', '..', '.htaccess', 'index.php' ), true ) && ! file_exists( $target . '/' . $file ) ) {
						@rename( $legacy . '/uploads/' . $file, $target . '/' . $file ); // phpcs:ignore WordPress.PHP.NoSilencedErrors, WordPress.WP.AlternativeFunctions
					}
				}
				self::remove_if_empty( $legacy . '/uploads' );
				file_exists( $legacy . '/uploads' ) ? ++$left : ++$moved;
			} else {
				++$left;
			}
		}
		if ( 0 === $left ) {
			self::remove_if_empty( $legacy );
		}
		update_option( self::MOVE_OPTION, $left, false );
		return array( 'moved' => $moved, 'left' => $left );
	}

	/**
	 * Entries in a folder other than the protection files.
	 *
	 * @param string $dir Folder.
	 * @return int
	 */
	private static function count_entries( string $dir ): int {
		return count( array_diff( (array) scandir( $dir ), array( '.', '..', '.htaccess', 'index.php', 'index.html', 'web.config' ) ) );
	}

	/**
	 * Delete a folder holding only protection files.
	 *
	 * @param string $dir Folder.
	 */
	private static function remove_if_empty( string $dir ): void {
		if ( ! is_dir( $dir ) || 0 !== self::count_entries( $dir ) ) {
			return;
		}
		foreach ( array( '.htaccess', 'index.php', 'index.html', 'web.config' ) as $file ) {
			if ( file_exists( $dir . '/' . $file ) ) {
				@unlink( $dir . '/' . $file ); // phpcs:ignore WordPress.PHP.NoSilencedErrors, WordPress.WP.AlternativeFunctions
			}
		}
		@rmdir( $dir ); // phpcs:ignore WordPress.PHP.NoSilencedErrors, WordPress.WP.AlternativeFunctions
	}

	/**
	 * The URL a file in the folder would have, or null when the folder is not
	 * under the WordPress folder or wp-content (so not served at all).
	 *
	 * @param string $dir Folder.
	 * @return string|null
	 */
	public static function url( string $dir ): ?string {
		$dir     = rtrim( str_replace( '\\', '/', $dir ), '/' );
		$content = rtrim( str_replace( '\\', '/', WP_CONTENT_DIR ), '/' );
		if ( 0 === stripos( $dir . '/', $content . '/' ) ) {
			return rtrim( content_url(), '/' ) . substr( $dir, strlen( $content ) );
		}
		$rel = self::relative( $dir );
		return null === $rel ? null : rtrim( site_url(), '/' ) . '/' . $rel;
	}

	/**
	 * What a test fetch of a file in the folder means.
	 *
	 * @param int|null $code  HTTP status, null on a transport failure. A
	 *                        redirect that was not followed proves nothing.
	 * @param string   $body  Response body.
	 * @param string   $token The file's content.
	 * @return string closed, exposed or unknown.
	 */
	public static function classify( ?int $code, string $body, string $token ): string {
		if ( null === $code || ( $code >= 300 && $code < 400 ) ) {
			return 'unknown';
		}
		return ( 200 === $code && false !== strpos( $body, $token ) ) ? 'exposed' : 'closed';
	}

	/**
	 * Fetch a test file from the backup folder over HTTP, once a week or on
	 * demand. A folder outside the web root is closed by construction.
	 *
	 * @param bool $force Check now.
	 * @return array{state: string, at: int, dir: string, url: string}
	 */
	public static function web_check( bool $force = false ): array {
		$dir    = self::dir();
		$stored = get_option( self::CHECK_OPTION, array() );
		if ( ! $force && is_array( $stored ) && ( $stored['dir'] ?? '' ) === $dir && (int) ( $stored['at'] ?? 0 ) > time() - self::CHECK_TTL ) {
			return $stored;
		}
		$base   = self::url( $dir );
		$result = array( 'state' => 'closed', 'at' => time(), 'dir' => $dir, 'url' => '' );
		if ( null !== $base && is_dir( $dir ) && is_writable( $dir ) ) {
			$token = bin2hex( random_bytes( 16 ) );
			$name  = 'emcp-web-check-' . bin2hex( random_bytes( 6 ) ) . '.txt';
			@file_put_contents( $dir . '/' . $name, $token ); // phpcs:ignore WordPress.PHP.NoSilencedErrors, WordPress.WP.AlternativeFunctions
			// Reading our own test file: nothing from the response is trusted.
			// Follow the site's own http-to-https or www redirects to the file.
			$res = wp_remote_get( $base . '/' . $name, array( 'timeout' => 10, 'redirection' => 3, 'sslverify' => false ) );
			@unlink( $dir . '/' . $name ); // phpcs:ignore WordPress.PHP.NoSilencedErrors, WordPress.WP.AlternativeFunctions
			$result['state'] = self::classify( is_wp_error( $res ) ? null : (int) wp_remote_retrieve_response_code( $res ), is_wp_error( $res ) ? '' : (string) wp_remote_retrieve_body( $res ), $token );
			$result['url']   = $base . '/';
		}
		update_option( self::CHECK_OPTION, $result, false );
		return $result;
	}

	/**
	 * The nginx rule that closes the folder, for the screen and the Dashboard.
	 *
	 * @return string
	 */
	public static function nginx_rule(): string {
		$rel = self::relative( self::dir() );
		return null === $rel ? '' : 'location ^~ /' . $rel . '/ { deny all; }';
	}

	/**
	 * What the screen shows about the folder.
	 *
	 * @return array
	 */
	public static function summary(): array {
		$dir   = self::dir();
		$check = get_option( self::CHECK_OPTION, array() );
		return array(
			'mode'       => self::mode(),
			'path'       => null === self::relative( $dir ) ? $dir : self::relative( $dir ),
			'check'      => is_array( $check ) && ( $check['dir'] ?? '' ) === $dir ? $check : null,
			'nginxRule'  => self::nginx_rule(),
			'legacyLeft' => is_dir( self::legacy_dir() ) && self::legacy_dir() !== $dir ? self::count_entries( self::legacy_dir() ) : 0,
			'constant'   => self::CONSTANT,
		);
	}
}
