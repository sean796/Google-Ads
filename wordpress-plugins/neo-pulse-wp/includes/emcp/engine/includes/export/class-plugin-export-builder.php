<?php
/**
 * Sandbox Plugin Export: the builder.
 *
 * Turns a plan (EMCP_Tools_Plugin_Export_Planner::plan()) into a standalone
 * WordPress plugin ZIP. Every entry is emitted as a string: generated files
 * from templates, artifacts from a verified byte snapshot (never addFile() on
 * a sandbox path, so what was verified is what ships). The ZIP is written to a
 * directory proven to sit outside every web-served path, and the temp file is
 * armed for deletion before any build work starts.
 *
 * Generated plugin lifecycle (decided on plugins_loaded:50, after EMCP boots):
 * dormant while EMCP_TOOLS_VERSION is defined, dormant when another export
 * already owns EMCP_SANDBOX_EXPORT_OWNER, otherwise claims ownership, loads
 * config.php, its runtime lib and the kind loaders.
 *
 * @package EMCP_Tools
 * @since   3.18.0
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * @since 3.18.0
 */
class EMCP_Tools_Plugin_Export_Builder {

	/** Slugs that would shadow an EMCP install directory. */
	const RESERVED_SLUGS = array( 'emcp-tools', 'emcp-pro', 'elementor-mcp', 'emcp-migrate-connector' );

	/** Block editor script dependencies, the same five the EMCP loader registers. */
	const EDITOR_DEPS = array( 'wp-blocks', 'wp-block-editor', 'wp-components', 'wp-element', 'wp-server-side-render' );

	/** Basename each runtime unit's lib files get inside includes/lib/. */
	const LIB_ORDER = array( 'remote-keys', 'remote-source', 'widget-query', 'shortcode-registry' );

	// ----- naming ----------------------------------------------------------

	/**
	 * @param string $raw User-supplied slug or name.
	 * @return string|WP_Error `invalid_slug` when empty after sanitising or reserved.
	 */
	public static function sanitize_slug( string $raw ) {
		$slug = sanitize_title( $raw );
		$slug = trim( preg_replace( '/[^a-z0-9\-]+/', '-', strtolower( $slug ) ), '-' );
		if ( '' === $slug ) {
			return new WP_Error( 'invalid_slug', __( 'The plugin slug must contain at least one letter or digit.', 'emcp-tools' ) );
		}
		if ( in_array( $slug, self::RESERVED_SLUGS, true ) ) {
			return new WP_Error( 'invalid_slug', sprintf( /* translators: %s: slug */ __( 'The slug "%s" is reserved for Neo EMCP itself. Choose another.', 'emcp-tools' ), $slug ) );
		}
		return $slug;
	}

	/**
	 * Upper-snake identifier for constants and class names: my-plugin => MY_PLUGIN.
	 */
	public static function ident( string $slug ): string {
		$ident = strtoupper( preg_replace( '/[^A-Za-z0-9]+/', '_', $slug ) );
		$ident = trim( $ident, '_' );
		if ( '' !== $ident && ctype_digit( $ident[0] ) ) {
			$ident = 'X' . $ident;
		}
		return $ident;
	}

	// ----- private temp dir ------------------------------------------------

	/**
	 * A writable directory whose canonical path is outside ABSPATH, WP_CONTENT_DIR,
	 * the uploads basedir and DOCUMENT_ROOT. Fail-closed: with no document root
	 * only an explicitly defined WP_TEMP_DIR is considered.
	 *
	 * @return string|WP_Error Real path, or `no_private_temp`.
	 */
	public static function private_temp_dir() {
		$doc_root = (string) apply_filters( 'emcp_tools_export_document_root', isset( $_SERVER['DOCUMENT_ROOT'] ) ? (string) $_SERVER['DOCUMENT_ROOT'] : '' ); // phpcs:ignore WordPress.Security.ValidatedSanitizedInput
		$explicit = (bool) apply_filters( 'emcp_tools_export_temp_explicit', defined( 'WP_TEMP_DIR' ) );
		$temp     = (string) apply_filters( 'emcp_tools_export_temp_dir', function_exists( 'get_temp_dir' ) ? get_temp_dir() : sys_get_temp_dir() );
		$guidance = __( 'Set WP_TEMP_DIR in wp-config.php to a writable directory outside the web root (beside public_html, not inside it).', 'emcp-tools' );

		if ( '' === trim( $doc_root ) && ! $explicit ) {
			return new WP_Error( 'no_private_temp', __( 'The document root is unknown in this context, so the default temp directory cannot be proven private.', 'emcp-tools' ) . ' ' . $guidance );
		}
		$real = '' !== $temp ? realpath( $temp ) : false;
		if ( false === $real || ! is_dir( $real ) || ! self::writable( $real ) ) {
			return new WP_Error( 'no_private_temp', sprintf( /* translators: %s: path */ __( 'The temp directory %s is missing or not writable.', 'emcp-tools' ), $temp ) . ' ' . $guidance );
		}
		$public = array(
			(string) apply_filters( 'emcp_tools_export_abspath', defined( 'ABSPATH' ) ? ABSPATH : '' ),
			(string) apply_filters( 'emcp_tools_export_content_dir', defined( 'WP_CONTENT_DIR' ) ? WP_CONTENT_DIR : '' ),
			(string) apply_filters( 'emcp_tools_export_uploads_dir', function_exists( 'wp_upload_dir' ) ? (string) ( wp_upload_dir()['basedir'] ?? '' ) : '' ),
			$doc_root,
		);
		foreach ( $public as $p ) {
			$rp = '' !== trim( $p ) ? realpath( $p ) : false;
			if ( false !== $rp && self::path_is_inside( $real, $rp ) ) {
				return new WP_Error( 'no_private_temp', sprintf( /* translators: 1: temp dir, 2: public path */ __( 'The temp directory %1$s is inside the web-served path %2$s.', 'emcp-tools' ), $real, $rp ) . ' ' . $guidance );
			}
		}
		return $real;
	}

	private static function writable( string $dir ): bool {
		return function_exists( 'wp_is_writable' ) ? wp_is_writable( $dir ) : is_writable( $dir );
	}

	private static function path_is_inside( string $child, string $parent ): bool {
		$child  = rtrim( str_replace( '\\', '/', $child ), '/' ) . '/';
		$parent = rtrim( str_replace( '\\', '/', $parent ), '/' ) . '/';
		return 0 === strncasecmp( $child, $parent, strlen( $parent ) );
	}

	// ----- build -----------------------------------------------------------

	/**
	 * @param array $plan Planner output.
	 * @param array $opts { name, slug, author, version, embed_keys }.
	 * @return string|WP_Error Absolute ZIP path.
	 */
	public static function build( array $plan, array $opts ) {
		$slug = self::sanitize_slug( (string) ( $opts['slug'] ?? '' ) );
		if ( is_wp_error( $slug ) ) {
			return $slug;
		}
		$opts['slug'] = $slug;
		if ( empty( $plan['widgets'] ) && empty( $plan['blocks'] ) && empty( $plan['snippets'] ) ) {
			return new WP_Error( 'nothing_to_export', __( 'There is nothing active to export. Activate at least one widget, block or snippet first.', 'emcp-tools' ) );
		}
		if ( ! class_exists( 'ZipArchive' ) ) {
			return new WP_Error( 'no_ziparchive', __( 'The ZipArchive PHP extension is required to build the plugin ZIP.', 'emcp-tools' ) );
		}
		$dir = self::private_temp_dir();
		if ( is_wp_error( $dir ) ) {
			return $dir;
		}
		$tmp = tempnam( $dir, 'emcp-export-' );
		if ( false === $tmp ) {
			return new WP_Error( 'no_private_temp', __( 'Could not create a temp file for the plugin ZIP.', 'emcp-tools' ) );
		}
		// Armed before any build work: a fatal, an exception or an aborted download all clean up.
		register_shutdown_function(
			static function () use ( $tmp ) {
				if ( file_exists( $tmp ) ) {
					@unlink( $tmp ); // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged
				}
			}
		);
		try {
			$files = self::assemble( $plan, $opts );
			if ( is_wp_error( $files ) ) {
				@unlink( $tmp ); // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged
				return $files;
			}
			$zip = new ZipArchive();
			if ( true !== $zip->open( $tmp, ZipArchive::OVERWRITE ) ) {
				@unlink( $tmp ); // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged
				return new WP_Error( 'zip_open_failed', __( 'Could not open the plugin ZIP for writing.', 'emcp-tools' ) );
			}
			foreach ( $files as $path => $bytes ) {
				$zip->addFromString( $slug . '/' . $path, $bytes );
			}
			$zip->close();
			return $tmp;
		} catch ( \Throwable $e ) {
			@unlink( $tmp ); // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged
			return new WP_Error( 'build_failed', $e->getMessage() );
		}
	}

	/**
	 * Streams a built ZIP as a download and deletes it.
	 *
	 * @param string $zip      Absolute path from build().
	 * @param string $filename Download name.
	 * @param bool   $exit     Exit after streaming (false in tests).
	 */
	public static function stream( string $zip, string $filename, bool $exit = true ): void {
		try {
			if ( ! headers_sent() ) {
				if ( function_exists( 'nocache_headers' ) ) {
					nocache_headers();
				}
				header( 'Content-Type: application/zip' );
				header( 'Content-Disposition: attachment; filename="' . sanitize_file_name( $filename ) . '"' );
				header( 'Content-Length: ' . (int) filesize( $zip ) );
			}
			if ( $exit ) {
				while ( ob_get_level() > 0 ) {
					ob_end_flush();
				}
			}
			// phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_readfile
			readfile( $zip );
		} finally {
			@unlink( $zip ); // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged
		}
		if ( $exit ) {
			exit;
		}
	}

	/**
	 * All ZIP entries as path => bytes (paths relative to the plugin folder).
	 *
	 * @return array<string,string>|WP_Error
	 */
	public static function assemble( array $plan, array $opts ) {
		$slug = self::sanitize_slug( (string) ( $opts['slug'] ?? '' ) );
		if ( is_wp_error( $slug ) ) {
			return $slug;
		}
		$opts['slug']    = $slug;
		$opts['name']    = trim( (string) ( $opts['name'] ?? '' ) ) !== '' ? (string) $opts['name'] : $slug;
		$opts['version'] = self::clean_version( (string) ( $opts['version'] ?? '1.0.0' ) );
		$opts['author']  = trim( (string) ( $opts['author'] ?? '' ) );
		$files           = array();

		// Artifacts first: a changed file aborts before anything else is emitted.
		$widgets = array();
		foreach ( (array) $plan['widgets'] as $w ) {
			$bytes = self::snapshot( 'widget', $w );
			if ( is_wp_error( $bytes ) ) {
				return $bytes;
			}
			foreach ( $bytes as $name => $content ) {
				$files[ 'widgets/' . $w['dir'] . '/' . $name ] = $content;
			}
			$widgets[] = $w + array( 'css' => isset( $bytes['style.css'] ), 'js' => isset( $bytes['script.js'] ) );
		}
		$blocks = array();
		foreach ( (array) $plan['blocks'] as $b ) {
			$bytes = self::snapshot( 'block', $b );
			if ( is_wp_error( $bytes ) ) {
				return $bytes;
			}
			$has_style = isset( $bytes['style.css'] );
			foreach ( $bytes as $name => $content ) {
				if ( 'block.json' === $name ) {
					$content = self::rewrite_block_json( $content, $has_style );
				}
				$files[ 'blocks/' . $b['dir'] . '/' . $name ] = $content;
			}
			$files[ 'blocks/' . $b['dir'] . '/edit.asset.php' ] = self::emit_edit_asset( (string) $bytes['edit.js'] );
			$blocks[] = $b;
		}
		$snippets = array();
		foreach ( (array) $plan['snippets'] as $s ) {
			$bytes = self::snapshot( 'snippet', $s );
			if ( is_wp_error( $bytes ) ) {
				return $bytes;
			}
			$files[ 'snippets/' . $s['file'] ] = $bytes['snippet.php'];
			$snippets[]                        = $s;
		}

		// Runtime library.
		foreach ( self::lib_entries( $plan ) as $entry ) {
			if ( 'remote-keys' === $entry['unit'] ) {
				$files[ 'includes/lib/' . $entry['name'] ] = self::emit_remote_keys();
				continue;
			}
			$src = EMCP_Tools_Pro_Loader::path( $entry['rel'] );
			if ( '' === $src ) {
				return new WP_Error( 'runtime_missing', sprintf( /* translators: %s: file */ __( 'Runtime file %s is missing from this install.', 'emcp-tools' ), $entry['rel'] ) );
			}
			// phpcs:ignore WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents
			$files[ 'includes/lib/' . $entry['name'] ] = self::wrap_lib( (string) file_get_contents( $src ), $entry['symbol'], $entry['is_interface'] );
		}

		// Generated plugin files.
		$files[ $slug . '.php' ]            = self::emit_main_file( $opts, $plan );
		$files['config.php']                = self::emit_config( $plan, ! empty( $opts['embed_keys'] ) );
		$files['includes/class-loader.php'] = self::emit_loader( $opts, $plan );
		if ( $widgets ) {
			$files['includes/class-widgets.php'] = self::emit_widgets_loader( $opts, $widgets );
		}
		if ( $blocks ) {
			$files['includes/class-blocks.php'] = self::emit_blocks_loader( $opts, $blocks );
		}
		if ( $snippets ) {
			$files['includes/class-snippets.php'] = self::emit_snippets_loader( $opts, $snippets );
		}
		$files['manifest.json'] = self::emit_manifest_json( $opts, $plan, $widgets, $blocks, $snippets );
		$files['readme.txt']    = self::emit_readme( $opts, $plan );

		foreach ( $files as $path => $bytes ) {
			if ( str_ends_with( $path, '.php' ) ) {
				$lint = self::lint( $path, $bytes );
				if ( is_wp_error( $lint ) ) {
					return $lint;
				}
			}
		}
		return $files;
	}

	// ----- snapshot ----------------------------------------------------------

	/**
	 * Reads an artifact's files once, re-verifies the plan's hashes, returns the bytes.
	 *
	 * @return array<string,string>|WP_Error `changed_since_plan`.
	 */
	public static function snapshot( string $kind, array $artifact ) {
		$out = array();
		foreach ( (array) ( $artifact['files'] ?? array() ) as $name => $path ) {
			// phpcs:ignore WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents
			$bytes = is_readable( $path ) ? file_get_contents( $path ) : false;
			if ( false === $bytes || hash( 'sha256', $bytes ) !== (string) ( $artifact['hashes'][ $name ] ?? '' ) ) {
				return new WP_Error(
					'changed_since_plan',
					sprintf( /* translators: 1: kind, 2: title, 3: id */ __( 'The %1$s "%2$s" (id %3$d) changed after the plan was made. Reload the plan and try again.', 'emcp-tools' ), $kind, (string) ( $artifact['title'] ?? '' ), (int) ( $artifact['id'] ?? 0 ) ),
					array( 'kind' => $kind, 'id' => (int) ( $artifact['id'] ?? 0 ) )
				);
			}
			$out[ $name ] = $bytes;
		}
		return $out;
	}

	/** @return true|WP_Error */
	private static function lint( string $path, string $bytes ) {
		try {
			token_get_all( $bytes, TOKEN_PARSE );
		} catch ( \Throwable $e ) {
			return new WP_Error( 'emit_parse_failed', $path . ': ' . $e->getMessage() );
		}
		return true;
	}

	private static function clean_version( string $v ): string {
		$v = preg_replace( '/[^0-9A-Za-z.\-]/', '', $v );
		return '' !== $v ? $v : '1.0.0';
	}

	// ----- runtime lib -------------------------------------------------------

	/**
	 * Ordered lib entries: remote-keys, then the remote interface + classes, then the rest.
	 *
	 * @return array<int, array{unit:string,rel:string,name:string,symbol:string,is_interface:bool}>
	 */
	private static function lib_entries( array $plan ): array {
		$out = array();
		foreach ( self::LIB_ORDER as $unit ) {
			if ( ! in_array( $unit, (array) $plan['runtime'], true ) ) {
				continue;
			}
			if ( 'remote-keys' === $unit ) {
				$out[] = array( 'unit' => $unit, 'rel' => '', 'name' => 'class-remote-keys.php', 'symbol' => 'EMCP_Tools_Remote_Keys', 'is_interface' => false );
				continue;
			}
			foreach ( EMCP_Tools_Plugin_Export_Planner::runtime_files( $unit ) as $rel ) {
				$out[] = array(
					'unit'         => $unit,
					'rel'          => $rel,
					'name'         => basename( $rel ),
					'symbol'       => self::symbol_for( $rel ),
					'is_interface' => str_starts_with( basename( $rel ), 'interface-' ),
				);
			}
		}
		return $out;
	}

	private static function symbol_for( string $rel ): string {
		$map = array(
			'includes/class-widget-query.php'                    => 'EMCP_Tools_Widget_Query',
			'includes/class-shortcode-registry.php'              => 'EMCP_Tools_Shortcode_Registry',
			'includes/remote/interface-remote-preset.php'        => 'EMCP_Tools_Remote_Preset',
			'includes/remote/class-remote-source.php'            => 'EMCP_Tools_Remote_Source',
			'includes/remote/class-remote-preset-openweather.php' => 'EMCP_Tools_Remote_Preset_OpenWeather',
			'includes/remote/class-remote-preset-google-reviews.php' => 'EMCP_Tools_Remote_Preset_Google_Reviews',
			'includes/remote/class-remote-preset-yelp.php'       => 'EMCP_Tools_Remote_Preset_Yelp',
			'includes/remote/class-remote-preset-json.php'       => 'EMCP_Tools_Remote_Preset_Json',
		);
		return $map[ $rel ] ?? '';
	}

	/**
	 * Wraps a verbatim runtime file in a class_exists / interface_exists guard.
	 */
	public static function wrap_lib( string $src, string $symbol, bool $is_interface = false ): string {
		$body = preg_replace( '/^<\?php\s*/', '', ltrim( $src ), 1 );
		$body = preg_replace( '/if \( ! defined\( \'ABSPATH\' \) \) \{\s*exit;\s*\}\s*/', '', $body, 1 );
		$fn   = $is_interface ? 'interface_exists' : 'class_exists';
		return "<?php\nif ( ! {$fn}( '{$symbol}' ) ) {\n" . rtrim( $body ) . "\n}\n";
	}

	/**
	 * A constants-only EMCP_Tools_Remote_Keys with the free class's signatures.
	 */
	public static function emit_remote_keys(): string {
		$providers = class_exists( 'EMCP_Tools_Remote_Keys' ) ? EMCP_Tools_Remote_Keys::providers() : array();
		if ( ! $providers ) {
			foreach ( array( 'openweather' => 'OpenWeather', 'google_places' => 'Google Places', 'yelp' => 'Yelp Fusion', 'json_1' => 'Generic API key 1', 'json_2' => 'Generic API key 2', 'json_3' => 'Generic API key 3' ) as $slug => $label ) {
				$providers[ $slug ] = array( 'label' => $label, 'url' => '', 'const' => 'EMCP_TOOLS_REMOTE_KEY_' . strtoupper( $slug ), 'hint' => '' );
			}
		}
		$export = var_export( $providers, true );
		return "<?php\nif ( ! class_exists( 'EMCP_Tools_Remote_Keys' ) ) {\n"
			. "/**\n * Constants-only API key lookup for the exported plugin. Reads the\n * EMCP_TOOLS_REMOTE_KEY_* constants (config.php or wp-config.php) and\n * nothing else: a missing constant is a missing key, never a stored option.\n */\n"
			. "class EMCP_Tools_Remote_Keys {\n"
			. "\tconst OPTION_PREFIX = 'emcp_tools_remote_key_';\n\n"
			. "\t/** @return array<string, array{label:string,url:string,const:string,hint:string}> */\n"
			. "\tpublic static function providers(): array {\n\t\treturn " . str_replace( "\n", "\n\t\t", $export ) . ";\n\t}\n\n"
			. "\tpublic static function option( string \$slug ): string {\n\t\treturn isset( self::providers()[ \$slug ] ) ? self::OPTION_PREFIX . \$slug : '';\n\t}\n\n"
			. "\tpublic static function get( string \$slug ): string {\n\t\t\$p = self::providers()[ \$slug ] ?? null;\n\t\tif ( ! \$p ) {\n\t\t\treturn '';\n\t\t}\n\t\t\$const = (string) \$p['const'];\n\t\treturn defined( \$const ) ? (string) constant( \$const ) : '';\n\t}\n\n"
			. "\tpublic static function has( string \$slug ): bool {\n\t\treturn '' !== self::get( \$slug );\n\t}\n\n"
			. "\t/** @return array<string,string> */\n\tpublic static function options(): array {\n\t\treturn array();\n\t}\n"
			. "}\n}\n";
	}

	// ----- generated files ---------------------------------------------------

	private static function s( string $v ): string {
		return var_export( $v, true );
	}

	private static function boot_fn( string $slug ): string {
		return 'emcp_export_' . strtolower( self::ident( $slug ) ) . '_boot';
	}

	public static function emit_main_file( array $opts, array $plan ): string {
		$slug   = (string) $opts['slug'];
		$ident  = self::ident( $slug );
		$name   = (string) $opts['name'];
		$ver    = self::clean_version( (string) ( $opts['version'] ?? '1.0.0' ) );
		$author = trim( (string) ( $opts['author'] ?? '' ) );
		$fn     = self::boot_fn( $slug );
		$libs   = array();
		foreach ( self::lib_entries( $plan ) as $e ) {
			$libs[] = "\t\t" . self::s( $e['name'] ) . ',';
		}
		$lib_list = $libs ? "array(\n" . implode( "\n", $libs ) . "\n\t)" : 'array()';

		$header = "<?php\n/**\n * Plugin Name: " . str_replace( array( "\r", "\n", '*/' ), ' ', $name ) . "\n"
			. " * Description: Custom Elementor widgets, Gutenberg blocks and PHP snippets exported from Neo EMCP. Works without Neo EMCP and stays dormant while it is active.\n"
			. " * Version: {$ver}\n"
			. ( '' !== $author ? " * Author: " . str_replace( array( "\r", "\n", '*/' ), ' ', $author ) . "\n" : '' )
			. " * Requires at least: 6.0\n * Requires PHP: 8.1\n * Text Domain: {$slug}\n * License: GPL-2.0-or-later\n */\n\n";

		return $header
			. "if ( ! defined( 'ABSPATH' ) ) {\n\texit;\n}\n\n"
			. "define( 'EMCP_EXPORT_{$ident}_VERSION', " . self::s( $ver ) . " );\n"
			. "define( 'EMCP_EXPORT_{$ident}_DIR', plugin_dir_path( __FILE__ ) );\n"
			. "define( 'EMCP_EXPORT_{$ident}_URL', plugin_dir_url( __FILE__ ) );\n\n"
			. "/**\n * Ownership is decided here, after every plugin file has loaded, never while this file is being read.\n */\n"
			. "function {$fn}() {\n"
			. "\tif ( defined( 'EMCP_TOOLS_VERSION' ) ) {\n"
			. "\t\tadd_action( 'admin_notices', static function () {\n"
			. "\t\t\techo '<div class=\"notice notice-info\"><p>' . esc_html( " . self::s( $name . ' is dormant while Neo EMCP is active. Deactivate Neo EMCP to let it take over.' ) . " ) . '</p></div>';\n"
			. "\t\t} );\n\t\treturn;\n\t}\n"
			. "\tif ( defined( 'EMCP_SANDBOX_EXPORT_OWNER' ) ) {\n"
			. "\t\tadd_action( 'admin_notices', static function () {\n"
			. "\t\t\techo '<div class=\"notice notice-warning\"><p>' . esc_html( sprintf( " . self::s( $name . ' is dormant because another export (%s) already owns the Sandbox artifacts on this site. Keep only one export active.' ) . ", EMCP_SANDBOX_EXPORT_OWNER ) ) . '</p></div>';\n"
			. "\t\t} );\n\t\treturn;\n\t}\n"
			. "\tdefine( 'EMCP_SANDBOX_EXPORT_OWNER', " . self::s( $slug ) . " );\n"
			. "\trequire_once EMCP_EXPORT_{$ident}_DIR . 'config.php';\n"
			. "\tforeach ( {$lib_list} as \$emcp_lib ) {\n"
			. "\t\trequire_once EMCP_EXPORT_{$ident}_DIR . 'includes/lib/' . \$emcp_lib;\n\t}\n"
			. "\trequire_once EMCP_EXPORT_{$ident}_DIR . 'includes/class-loader.php';\n"
			. "\tEMCP_Export_{$ident}_Loader::boot();\n"
			. "}\n"
			. "add_action( 'plugins_loaded', '{$fn}', 50 );\n";
	}

	public static function emit_loader( array $opts, array $plan ): string {
		$ident = self::ident( (string) $opts['slug'] );
		$parts = array();
		if ( ! empty( $plan['widgets'] ) ) {
			$parts[] = "\t\trequire_once EMCP_EXPORT_{$ident}_DIR . 'includes/class-widgets.php';\n\t\tEMCP_Export_{$ident}_Widgets::boot();";
		}
		if ( ! empty( $plan['blocks'] ) ) {
			$parts[] = "\t\trequire_once EMCP_EXPORT_{$ident}_DIR . 'includes/class-blocks.php';\n\t\tEMCP_Export_{$ident}_Blocks::boot();";
		}
		if ( ! empty( $plan['snippets'] ) ) {
			$parts[] = "\t\trequire_once EMCP_EXPORT_{$ident}_DIR . 'includes/class-snippets.php';\n\t\tEMCP_Export_{$ident}_Snippets::boot();";
		}
		return "<?php\nif ( ! defined( 'ABSPATH' ) ) {\n\texit;\n}\n\n"
			. "/**\n * Boots the kind loaders. Called once by the owning plugins_loaded callback.\n */\n"
			. "class EMCP_Export_{$ident}_Loader {\n\tpublic static function boot() {\n" . implode( "\n", $parts ) . "\n\t}\n}\n";
	}

	public static function emit_widgets_loader( array $opts, array $widgets ): string {
		$ident = self::ident( (string) $opts['slug'] );
		$slug  = (string) $opts['slug'];
		$rows  = array();
		foreach ( $widgets as $w ) {
			$rows[] = "\t\t" . (int) $w['id'] . ' => array( ' . "'dir' => " . self::s( (string) $w['dir'] ) . ", 'class' => " . self::s( (string) $w['class'] ) . ", 'css' => " . ( $w['css'] ? 'true' : 'false' ) . ", 'js' => " . ( $w['js'] ? 'true' : 'false' ) . ' ),';
		}
		return "<?php\nif ( ! defined( 'ABSPATH' ) ) {\n\texit;\n}\n\n"
			. "/**\n * Registers the exported Elementor widgets: the \"Custom (EMCP)\" category, the\n * widget classes on elementor/widgets/register, and their assets on the\n * emcp-widget-{id}-style / -script handles the generated classes declare.\n */\n"
			. "class EMCP_Export_{$ident}_Widgets {\n"
			. "\tconst CATEGORY = 'emcp-custom';\n\n"
			. "\t/** @var array<int, array{dir:string,class:string,css:bool,js:bool}> */\n"
			. "\tprivate static \$widgets = array(\n" . implode( "\n", $rows ) . "\n\t);\n\n"
			. "\tpublic static function boot() {\n"
			. "\t\tadd_action( 'elementor/elements/categories_registered', array( __CLASS__, 'category' ) );\n"
			. "\t\tadd_action( 'elementor/widgets/register', array( __CLASS__, 'register' ) );\n"
			. "\t\tadd_action( 'wp_enqueue_scripts', array( __CLASS__, 'assets' ) );\n"
			. "\t\tadd_action( 'elementor/editor/after_enqueue_scripts', array( __CLASS__, 'assets' ) );\n"
			. "\t}\n\n"
			. "\tpublic static function category( \$elements_manager ) {\n"
			. "\t\t\$elements_manager->add_category( self::CATEGORY, array( 'title' => 'Custom (EMCP)', 'icon' => 'eicon-code' ) );\n"
			. "\t}\n\n"
			. "\tpublic static function assets() {\n"
			. "\t\tforeach ( self::\$widgets as \$id => \$w ) {\n"
			. "\t\t\t\$url = EMCP_EXPORT_{$ident}_URL . 'widgets/' . \$w['dir'];\n"
			. "\t\t\tif ( \$w['css'] ) {\n\t\t\t\twp_register_style( 'emcp-widget-' . \$id . '-style', \$url . '/style.css', array(), EMCP_EXPORT_{$ident}_VERSION );\n\t\t\t}\n"
			. "\t\t\tif ( \$w['js'] ) {\n\t\t\t\twp_register_script( 'emcp-widget-' . \$id . '-script', \$url . '/script.js', array( 'jquery' ), EMCP_EXPORT_{$ident}_VERSION, true );\n\t\t\t}\n"
			. "\t\t}\n\t}\n\n"
			. "\tpublic static function register( \$widgets_manager ) {\n"
			. "\t\tif ( ! class_exists( '\\\\Elementor\\\\Widget_Base' ) ) {\n\t\t\treturn;\n\t\t}\n"
			. "\t\tforeach ( self::\$widgets as \$id => \$w ) {\n"
			. "\t\t\ttry {\n"
			. "\t\t\t\tif ( ! class_exists( \$w['class'] ) ) {\n\t\t\t\t\tinclude_once EMCP_EXPORT_{$ident}_DIR . 'widgets/' . \$w['dir'] . '/widget.php';\n\t\t\t\t}\n"
			. "\t\t\t\tif ( class_exists( \$w['class'] ) ) {\n\t\t\t\t\t\$widgets_manager->register( new \$w['class']() );\n\t\t\t\t}\n"
			. "\t\t\t} catch ( \\Throwable \$e ) {\n"
			. "\t\t\t\terror_log( '[" . $slug . "] widget ' . \$id . ' failed to register: ' . \$e->getMessage() );\n"
			. "\t\t\t}\n\t\t}\n\t}\n}\n";
	}

	public static function emit_blocks_loader( array $opts, array $blocks ): string {
		$ident = self::ident( (string) $opts['slug'] );
		$rows  = array();
		foreach ( $blocks as $b ) {
			$rows[] = "\t\t" . self::s( (string) $b['dir'] ) . ' => ' . self::s( (string) $b['name'] ) . ',';
		}
		return "<?php\nif ( ! defined( 'ABSPATH' ) ) {\n\texit;\n}\n\n"
			. "/**\n * Registers the exported Gutenberg blocks from their block.json files and the\n * \"EMCP Custom\" category they list.\n */\n"
			. "class EMCP_Export_{$ident}_Blocks {\n"
			. "\t/** @var array<string,string> dir => block name */\n"
			. "\tprivate static \$blocks = array(\n" . implode( "\n", $rows ) . "\n\t);\n\n"
			. "\tpublic static function boot() {\n"
			. "\t\tadd_filter( 'block_categories_all', array( __CLASS__, 'category' ) );\n"
			. "\t\tadd_action( 'init', array( __CLASS__, 'register' ), 20 );\n"
			. "\t}\n\n"
			. "\tpublic static function category( \$categories ) {\n"
			. "\t\tforeach ( (array) \$categories as \$c ) {\n\t\t\tif ( isset( \$c['slug'] ) && 'emcp-custom' === \$c['slug'] ) {\n\t\t\t\treturn \$categories;\n\t\t\t}\n\t\t}\n"
			. "\t\tarray_unshift( \$categories, array( 'slug' => 'emcp-custom', 'title' => 'EMCP Custom', 'icon' => null ) );\n"
			. "\t\treturn \$categories;\n\t}\n\n"
			. "\tpublic static function register() {\n"
			. "\t\tif ( ! function_exists( 'register_block_type' ) ) {\n\t\t\treturn;\n\t\t}\n"
			. "\t\t\$registry = WP_Block_Type_Registry::get_instance();\n"
			. "\t\tforeach ( self::\$blocks as \$dir => \$name ) {\n"
			. "\t\t\tif ( \$registry->is_registered( \$name ) ) {\n\t\t\t\tcontinue;\n\t\t\t}\n"
			. "\t\t\ttry {\n\t\t\t\tregister_block_type( EMCP_EXPORT_{$ident}_DIR . 'blocks/' . \$dir );\n"
			. "\t\t\t} catch ( \\Throwable \$e ) {\n\t\t\t\terror_log( '[" . (string) $opts['slug'] . "] block ' . \$name . ' failed to register: ' . \$e->getMessage() );\n\t\t\t}\n"
			. "\t\t}\n\t}\n}\n";
	}

	public static function emit_snippets_loader( array $opts, array $snippets ): string {
		$ident = self::ident( (string) $opts['slug'] );
		$slug  = (string) $opts['slug'];
		$rows  = array();
		foreach ( $snippets as $s ) {
			$rows[] = "\t\t" . (int) $s['id'] . ' => array( ' . "'file' => " . self::s( (string) $s['file'] ) . ", 'func' => " . self::s( (string) $s['func'] ) . ", 'context' => " . self::s( (string) $s['context'] ) . ", 'hook' => " . self::s( (string) $s['hook'] ) . ", 'priority' => " . (int) $s['priority'] . ' ),';
		}
		return "<?php\nif ( ! defined( 'ABSPATH' ) ) {\n\texit;\n}\n\n"
			. "/**\n * Loads the exported PHP snippets, binds hook snippets to their hooks and\n * serves [emcp_snippet id=\"N\"]. Each call is isolated; a throwing snippet\n * logs and returns nothing (there is no store to deactivate it in).\n */\n"
			. "class EMCP_Export_{$ident}_Snippets {\n"
			. "\t/** @var array<int, array{file:string,func:string,context:string,hook:string,priority:int}> */\n"
			. "\tprivate static \$snippets = array(\n" . implode( "\n", $rows ) . "\n\t);\n\n"
			. "\tpublic static function boot() {\n"
			. "\t\tforeach ( self::\$snippets as \$id => \$s ) {\n"
			. "\t\t\ttry {\n\t\t\t\trequire_once EMCP_EXPORT_{$ident}_DIR . 'snippets/' . \$s['file'];\n"
			. "\t\t\t} catch ( \\Throwable \$e ) {\n\t\t\t\terror_log( '[{$slug}] snippet ' . \$id . ' failed to load: ' . \$e->getMessage() );\n\t\t\t\tcontinue;\n\t\t\t}\n"
			. "\t\t\tif ( in_array( \$s['context'], array( 'hook', 'both' ), true ) && '' !== \$s['hook'] && function_exists( \$s['func'] ) ) {\n"
			. "\t\t\t\t\$func = \$s['func'];\n"
			. "\t\t\t\tadd_action( \$s['hook'], static function () use ( \$func, \$id ) {\n"
			. "\t\t\t\t\ttry {\n\t\t\t\t\t\t\$func();\n\t\t\t\t\t} catch ( \\Throwable \$e ) {\n\t\t\t\t\t\terror_log( '[{$slug}] snippet ' . \$id . ' failed: ' . \$e->getMessage() );\n\t\t\t\t\t}\n"
			. "\t\t\t\t}, (int) \$s['priority'] );\n\t\t\t}\n\t\t}\n"
			. "\t\tif ( ! shortcode_exists( 'emcp_snippet' ) ) {\n\t\t\tadd_shortcode( 'emcp_snippet', array( __CLASS__, 'shortcode' ) );\n\t\t}\n"
			. "\t}\n\n"
			. "\tpublic static function shortcode( \$atts ) {\n"
			. "\t\t\$atts = shortcode_atts( array( 'id' => 0 ), (array) \$atts, 'emcp_snippet' );\n"
			. "\t\t\$id   = (int) \$atts['id'];\n"
			. "\t\t\$s    = self::\$snippets[ \$id ] ?? null;\n"
			. "\t\tif ( ! \$s || ! in_array( \$s['context'], array( 'shortcode', 'both' ), true ) || ! function_exists( \$s['func'] ) ) {\n\t\t\treturn '';\n\t\t}\n"
			. "\t\tob_start();\n\t\ttry {\n\t\t\t\$ret = call_user_func( \$s['func'] );\n\t\t\t\$out = (string) ob_get_clean();\n"
			. "\t\t\treturn \$out . ( is_string( \$ret ) || is_numeric( \$ret ) ? (string) \$ret : '' );\n"
			. "\t\t} catch ( \\Throwable \$e ) {\n\t\t\tob_end_clean();\n\t\t\terror_log( '[{$slug}] snippet ' . \$id . ' failed: ' . \$e->getMessage() );\n\t\t\treturn '';\n\t\t}\n"
			. "\t}\n}\n";
	}

	/**
	 * config.php: one define() per key constant the exported widgets read.
	 */
	public static function emit_config( array $plan, bool $embed ): string {
		$lines = array(
			'<?php',
			'/**',
			' * API keys for the exported remote-data widgets.',
			' *',
			' * Each constant below is read by the bundled EMCP_Tools_Remote_Keys. Define it',
			' * here or in wp-config.php (wp-config.php wins because it loads first). A key',
			' * that stays undefined makes its widget report a missing key instead of data.',
			' */',
			'',
			"if ( ! defined( 'ABSPATH' ) ) {",
			"\texit;",
			'}',
			'',
		);
		foreach ( (array) $plan['keys'] as $k ) {
			$const = preg_replace( '/[^A-Z0-9_]/', '', strtoupper( (string) $k['const'] ) );
			$value = $embed && class_exists( 'EMCP_Tools_Remote_Keys' ) ? EMCP_Tools_Remote_Keys::get( (string) $k['slug'] ) : '';
			if ( $embed && '' !== $value ) {
				$lines[] = "if ( ! defined( '{$const}' ) ) {";
				$lines[] = "\tdefine( '{$const}', " . self::s( $value ) . ' );';
				$lines[] = '}';
			} else {
				$lines[] = "// define( '{$const}', '' );";
			}
		}
		return implode( "\n", $lines ) . "\n";
	}

	/**
	 * block.json with standard file: asset references (the export is a real plugin dir).
	 */
	public static function rewrite_block_json( string $json, bool $has_style ): string {
		$data = json_decode( $json, true );
		if ( ! is_array( $data ) ) {
			return $json;
		}
		$data['editorScript'] = 'file:./edit.js';
		if ( $has_style ) {
			$data['style'] = 'file:./style.css';
		} else {
			unset( $data['style'] );
		}
		if ( empty( $data['render'] ) ) {
			$data['render'] = 'file:./render.php';
		}
		return (string) wp_json_encode( $data, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES );
	}

	/**
	 * edit.asset.php: the dependencies WordPress reads for a file: editorScript.
	 */
	public static function emit_edit_asset( string $edit_js ): string {
		return "<?php\nreturn array(\n\t'dependencies' => array( " . implode( ', ', array_map( array( __CLASS__, 's' ), self::EDITOR_DEPS ) ) . " ),\n\t'version'      => " . self::s( hash( 'sha256', $edit_js ) ) . ",\n);\n";
	}

	public static function emit_manifest_json( array $opts, array $plan, array $widgets, array $blocks, array $snippets ): string {
		$out = array(
			'generator'    => 'Neo EMCP Sandbox Plugin Export',
			'emcp_version' => defined( 'EMCP_TOOLS_VERSION' ) ? EMCP_TOOLS_VERSION : '',
			'exported_at'  => gmdate( 'c' ),
			'site'         => function_exists( 'home_url' ) ? home_url() : '',
			'slug'         => (string) $opts['slug'],
			'version'      => (string) $opts['version'],
			'widgets'      => array(),
			'blocks'       => array(),
			'snippets'     => array(),
			'runtime'      => array_values( (array) $plan['runtime'] ),
			'keys'         => array_map( static fn( $k ) => array( 'slug' => $k['slug'], 'const' => $k['const'] ), (array) $plan['keys'] ),
			'skipped'      => array_values( (array) $plan['skipped'] ),
		);
		foreach ( $widgets as $w ) {
			$out['widgets'][] = array( 'id' => (int) $w['id'], 'title' => $w['title'], 'dir' => $w['dir'], 'class' => $w['class'], 'widget_name' => $w['widget_name'], 'css' => (bool) $w['css'], 'js' => (bool) $w['js'], 'sha256' => $w['hashes'] );
		}
		foreach ( $blocks as $b ) {
			$out['blocks'][] = array( 'id' => (int) $b['id'], 'title' => $b['title'], 'dir' => $b['dir'], 'name' => $b['name'], 'sha256' => $b['hashes'] );
		}
		foreach ( $snippets as $s ) {
			$out['snippets'][] = array( 'id' => (int) $s['id'], 'title' => $s['title'], 'file' => $s['file'], 'func' => $s['func'], 'context' => $s['context'], 'hook' => $s['hook'], 'priority' => (int) $s['priority'], 'sha256' => $s['hashes']['snippet.php'] ?? '' );
		}
		return (string) wp_json_encode( $out, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES );
	}

	public static function emit_readme( array $opts, array $plan ): string {
		$name  = (string) $opts['name'];
		$keys  = array();
		foreach ( (array) $plan['keys'] as $k ) {
			$keys[] = '* ' . $k['const'];
		}
		$counts = sprintf( '%d widgets, %d blocks, %d snippets', count( (array) $plan['widgets'] ), count( (array) $plan['blocks'] ), count( (array) $plan['snippets'] ) );
		return "=== {$name} ===\n"
			. "Requires at least: 6.0\nRequires PHP: 8.1\nStable tag: " . (string) $opts['version'] . "\nLicense: GPL-2.0-or-later\n\n"
			. "Custom Elementor widgets, Gutenberg blocks and PHP snippets exported from Neo EMCP.\n\n"
			. "== What is inside ==\n\n"
			. "{$counts}, exactly as they were active on the source site, with their original widget types, block names, shortcode and asset handles. Pages that used them keep working.\n\n"
			. "== How the handover works ==\n\n"
			. "1. Install and activate this plugin while Neo EMCP is still active. It stays dormant and shows a notice.\n"
			. "2. Deactivate Neo EMCP. From the next request on, this plugin registers the widgets, blocks and snippets itself.\n"
			. "3. Keep only one export active per site. A second export stays dormant and names the owner.\n"
			. "4. Reinstalling Neo EMCP puts this plugin back to sleep automatically.\n\n"
			. "== API keys ==\n\n"
			. ( $keys ? "Remote-data widgets read these constants (see config.php, or define them in wp-config.php):\n\n" . implode( "\n", $keys ) . "\n\n" : "No remote-data widgets are included; no API keys are needed.\n\n" )
			. "== Limitations ==\n\n"
			. "* A snippet that throws is logged and skipped; it is not deactivated automatically.\n"
			. "* Snippets bound to hooks that fire before plugins_loaded (priority 50) cannot run from this plugin.\n"
			. "* If the Neo EMCP licence lapses while Neo EMCP stays active, EMCP stops registering Pro artifacts and this plugin stays dormant. Deactivate Neo EMCP to hand over.\n"
			. "* Edit the artifacts on the source site and export again; files in this plugin are generated and not meant to be edited by hand.\n";
	}
}
