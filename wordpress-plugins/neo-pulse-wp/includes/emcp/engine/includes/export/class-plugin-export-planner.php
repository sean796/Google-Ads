<?php
/**
 * Sandbox Plugin Export: the planner.
 *
 * Pure inventory. Reads the three stores' manifests (which already hold the
 * ACTIVE set), re-verifies every artifact against its recorded hash the way
 * the loaders do, derives runtime needs from the stored spec (never from the
 * compiled source, which for remote widgets does not name the remote class),
 * and computes the transitive runtime closure + the API-key constants the
 * export will expect. Writes nothing.
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
class EMCP_Tools_Plugin_Export_Planner {

	/**
	 * Runtime units and the Pro files (plugin-relative) that make them up.
	 * `remote-keys` is emitted by the builder, not copied.
	 */
	const RUNTIME_FILES = array(
		'widget-query'       => array( 'includes/class-widget-query.php' ),
		'remote-source'      => array(
			'includes/remote/interface-remote-preset.php',
			'includes/remote/class-remote-source.php',
			'includes/remote/class-remote-preset-openweather.php',
			'includes/remote/class-remote-preset-google-reviews.php',
			'includes/remote/class-remote-preset-yelp.php',
			'includes/remote/class-remote-preset-json.php',
		),
		'remote-keys'        => array(),
		'shortcode-registry' => array( 'includes/class-shortcode-registry.php' ),
	);

	/** Hooks that have already fired when the export binds on plugins_loaded:50. */
	const EARLY_HOOKS = array( 'muplugins_loaded', 'plugins_loaded' );

	/** Preset key => provider slug (json resolves per control from key_slot). */
	const PRESET_PROVIDERS = array(
		'openweather'    => 'openweather',
		'google-reviews' => 'google_places',
		'yelp'           => 'yelp',
	);

	/**
	 * @param array $opts { widgets?: bool, blocks?: bool, snippets?: bool } (defaults true).
	 * @return array{widgets:array,blocks:array,snippets:array,skipped:array,runtime:string[],keys:array,warnings:string[]}
	 */
	public static function plan( array $opts ): array {
		$opts = array_merge( array( 'widgets' => true, 'blocks' => true, 'snippets' => true ), $opts );
		$plan = array(
			'widgets'  => array(),
			'blocks'   => array(),
			'snippets' => array(),
			'skipped'  => array(),
			'runtime'  => array(),
			'keys'     => array(),
			'warnings' => array(),
		);
		if ( $opts['widgets'] && class_exists( 'EMCP_Tools_Widget_Store' ) ) {
			self::plan_widgets( $plan );
		}
		if ( $opts['blocks'] && class_exists( 'EMCP_Tools_Block_Store' ) ) {
			self::plan_blocks( $plan );
		}
		if ( $opts['snippets'] && class_exists( 'EMCP_Tools_PHP_Snippet_Store' ) ) {
			self::plan_snippets( $plan );
		}
		$plan['runtime'] = self::runtime_closure( $plan );
		$plan['keys']    = self::keys( $plan );
		return $plan;
	}

	/**
	 * Runtime needs of a widget or block spec: `query`, `remote`, `shortcode`.
	 *
	 * @param array $spec Stored spec.
	 * @return string[]
	 */
	public static function needs_for_widget_spec( array $spec ): array {
		$needs = array();
		foreach ( self::spec_controls( $spec ) as $control ) {
			self::collect_needs( $control, $needs );
		}
		return array_values( array_unique( $needs ) );
	}

	/**
	 * Every control in a spec, whichever shape it uses: the Widget Builder DSL
	 * groups controls under `sections[].controls`; the block DSL and older
	 * specs put them at the top level as `controls`.
	 *
	 * @param array $spec Stored spec.
	 * @return array<int, array>
	 */
	public static function spec_controls( array $spec ): array {
		$out = array();
		foreach ( (array) ( $spec['controls'] ?? array() ) as $control ) {
			if ( is_array( $control ) ) {
				$out[] = $control;
			}
		}
		foreach ( (array) ( $spec['sections'] ?? array() ) as $section ) {
			if ( ! is_array( $section ) ) {
				continue;
			}
			foreach ( (array) ( $section['controls'] ?? array() ) as $control ) {
				if ( is_array( $control ) ) {
					$out[] = $control;
				}
			}
		}
		return $out;
	}

	/**
	 * Provider key slugs a widget spec's remote controls read.
	 *
	 * @param array $spec Stored spec.
	 * @return string[]
	 */
	public static function key_slugs_for_widget_spec( array $spec ): array {
		$slugs = array();
		foreach ( self::spec_controls( $spec ) as $control ) {
			self::collect_key_slugs( $control, $slugs );
		}
		return array_values( array_unique( $slugs ) );
	}

	/**
	 * Files (plugin-relative) a runtime unit is made of.
	 *
	 * @param string $unit Runtime unit key.
	 * @return string[]
	 */
	public static function runtime_files( string $unit ): array {
		return self::RUNTIME_FILES[ $unit ] ?? array();
	}

	// ----- internals -------------------------------------------------------

	private static function collect_needs( array $control, array &$needs ): void {
		$type = sanitize_key( (string) ( $control['type'] ?? '' ) );
		if ( 'query' === $type ) {
			$needs[] = 'query';
			if ( 'remote' === sanitize_key( (string) ( $control['source'] ?? '' ) ) ) {
				$needs[] = 'remote';
			}
		} elseif ( 'shortcode' === $type ) {
			$needs[] = 'shortcode';
		}
		foreach ( (array) ( $control['fields'] ?? array() ) as $field ) {
			if ( is_array( $field ) ) {
				self::collect_needs( $field, $needs );
			}
		}
	}

	private static function collect_key_slugs( array $control, array &$slugs ): void {
		if ( 'query' === sanitize_key( (string) ( $control['type'] ?? '' ) ) && 'remote' === sanitize_key( (string) ( $control['source'] ?? '' ) ) ) {
			$preset = sanitize_key( (string) ( $control['preset'] ?? '' ) );
			if ( 'json' === $preset ) {
				$defaults = is_array( $control['defaults'] ?? null ) ? $control['defaults'] : array();
				$slot     = sanitize_key( (string) ( $defaults['key_slot'] ?? 'json_1' ) );
				$slugs[]  = in_array( $slot, array( 'json_1', 'json_2', 'json_3' ), true ) ? $slot : 'json_1';
			} elseif ( isset( self::PRESET_PROVIDERS[ $preset ] ) ) {
				$slugs[] = self::PRESET_PROVIDERS[ $preset ];
			}
		}
		foreach ( (array) ( $control['fields'] ?? array() ) as $field ) {
			if ( is_array( $field ) ) {
				self::collect_key_slugs( $field, $slugs );
			}
		}
	}

	private static function title_of( int $id, string $fallback ): string {
		$post  = function_exists( 'get_post' ) ? get_post( $id ) : null;
		$title = $post && isset( $post->post_title ) ? trim( (string) $post->post_title ) : '';
		return '' !== $title ? $title : $fallback;
	}

	private static function slug_of( string $title, string $fallback ): string {
		$slug = sanitize_title( $title );
		return '' !== $slug ? $slug : $fallback;
	}

	private static function sha( string $path ): string {
		// phpcs:ignore WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents
		return is_readable( $path ) ? hash( 'sha256', (string) file_get_contents( $path ) ) : '';
	}

	private static function plan_widgets( array &$plan ): void {
		$base = EMCP_Tools_Widget_Store::widgets_dir();
		foreach ( EMCP_Tools_Widget_Store::read_manifest() as $entry ) {
			$id = isset( $entry['post_id'] ) ? (int) $entry['post_id'] : 0;
			if ( ! $id ) {
				continue;
			}
			$title = self::title_of( $id, 'Widget ' . $id );
			$dir   = $base . '/' . $id;
			$files = array( 'widget.php' => $dir . '/widget.php' );
			$want  = array( 'widget.php' => (string) ( $entry['hash'] ?? '' ) );
			if ( ! empty( $entry['css'] ) ) {
				$files['style.css'] = $dir . '/style.css';
				$want['style.css']  = (string) $entry['css'];
			}
			if ( ! empty( $entry['js'] ) ) {
				$files['script.js'] = $dir . '/script.js';
				$want['script.js']  = (string) $entry['js'];
			}
			$hashes = array();
			$ok     = true;
			foreach ( $files as $name => $path ) {
				$hashes[ $name ] = self::sha( $path );
				if ( '' === $hashes[ $name ] || $hashes[ $name ] !== $want[ $name ] ) {
					$ok = false;
				}
			}
			if ( ! $ok ) {
				$plan['skipped'][] = array( 'kind' => 'widget', 'id' => $id, 'title' => $title, 'reason' => 'integrity' );
				continue;
			}
			$spec  = EMCP_Tools_Widget_Store::get_spec( $id ) ?? array();
			$needs = self::needs_for_widget_spec( $spec );
			// phpcs:ignore WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents
			self::scan_source( 'widget', $id, $title, (string) file_get_contents( $files['widget.php'] ), $needs, $plan['warnings'] );
			$slug              = self::slug_of( $title, 'widget-' . $id );
			$plan['widgets'][] = array(
				'id'          => $id,
				'title'       => $title,
				'slug'        => $slug,
				'dir'         => $id . '-' . $slug,
				'class'       => (string) ( $entry['class_name'] ?? 'EMCP_Widget_' . $id ),
				'widget_name' => (string) ( $entry['widget_name'] ?? 'emcp_custom_' . $id ),
				'files'       => $files,
				'hashes'      => $hashes,
				'needs'       => $needs,
				'key_slugs'   => self::key_slugs_for_widget_spec( $spec ),
			);
		}
	}

	private static function plan_blocks( array &$plan ): void {
		$store = EMCP_Tools_Block_Store::instance();
		foreach ( $store->read_manifest() as $entry ) {
			$id = isset( $entry['post_id'] ) ? (int) $entry['post_id'] : 0;
			if ( ! $id ) {
				continue;
			}
			$title  = self::title_of( $id, 'Block ' . $id );
			$dir    = $store->artifact_dir( $id );
			$assets = array();
			$files  = array();
			$hashes = array();
			foreach ( array( 'block.json', 'render.php', 'edit.js', 'style.css' ) as $file ) {
				$path = $dir . '/' . $file;
				if ( file_exists( $path ) ) {
					// phpcs:ignore WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents
					$assets[ $file ] = (string) file_get_contents( $path );
					$files[ $file ]  = $path;
					$hashes[ $file ] = hash( 'sha256', $assets[ $file ] );
				}
			}
			$ok = class_exists( 'EMCP_Tools_Sandbox_Bundle' )
				&& isset( $assets['block.json'], $assets['render.php'], $assets['edit.js'] )
				&& EMCP_Tools_Sandbox_Bundle::checksum( $assets ) === (string) ( $entry['checksum'] ?? '' );
			if ( ! $ok ) {
				$plan['skipped'][] = array( 'kind' => 'block', 'id' => $id, 'title' => $title, 'reason' => 'integrity' );
				continue;
			}
			$spec  = $store->get_spec( $id ) ?? array();
			$needs = self::needs_for_widget_spec( $spec );
			self::scan_source( 'block', $id, $title, $assets['render.php'], $needs, $plan['warnings'] );
			$slug             = self::slug_of( $title, 'block-' . $id );
			$plan['blocks'][] = array(
				'id'     => $id,
				'title'  => $title,
				'slug'   => $slug,
				'dir'    => $id . '-' . $slug,
				'name'   => (string) ( $entry['block_name'] ?? 'emcp/custom-' . $id ),
				'files'  => $files,
				'hashes' => $hashes,
				'needs'  => $needs,
			);
		}
	}

	private static function plan_snippets( array &$plan ): void {
		$root = dirname( EMCP_Tools_PHP_Snippet_Store::snippets_dir() );
		foreach ( EMCP_Tools_PHP_Snippet_Store::read_manifest() as $entry ) {
			$id = isset( $entry['post_id'] ) ? (int) $entry['post_id'] : 0;
			if ( ! $id ) {
				continue;
			}
			$title = self::title_of( $id, 'Snippet ' . $id );
			$path  = $root . '/' . ltrim( (string) ( $entry['php_path'] ?? EMCP_Tools_PHP_Snippet_Store::relative_php_path( $id ) ), '/' );
			$hash  = self::sha( $path );
			if ( '' === $hash || $hash !== (string) ( $entry['hash'] ?? '' ) ) {
				$plan['skipped'][] = array( 'kind' => 'snippet', 'id' => $id, 'title' => $title, 'reason' => 'integrity' );
				continue;
			}
			$hook    = (string) ( $entry['hook'] ?? '' );
			$context = (string) ( $entry['context'] ?? 'shortcode' );
			if ( in_array( $context, array( 'hook', 'both' ), true ) && in_array( $hook, self::EARLY_HOOKS, true ) ) {
				/* translators: 1: snippet title, 2: hook name */
				$plan['warnings'][] = sprintf( __( 'Snippet "%1$s" runs on %2$s, which has already fired when the exported plugin takes over; it will not run from the export.', 'emcp-tools' ), $title, $hook );
			}
			$slug               = self::slug_of( $title, 'snippet-' . $id );
			$plan['snippets'][] = array(
				'id'       => $id,
				'title'    => $title,
				'slug'     => $slug,
				'file'     => $id . '-' . $slug . '.php',
				'func'     => (string) ( $entry['func'] ?? 'emcp_php_snippet_' . $id ),
				'context'  => $context,
				'hook'     => $hook,
				'priority' => isset( $entry['priority'] ) ? (int) $entry['priority'] : 10,
				'files'    => array( 'snippet.php' => $path ),
				'hashes'   => array( 'snippet.php' => $hash ),
			);
		}
	}

	/**
	 * Cross-check: the compiled source names a runtime class the spec did not
	 * ask for (or the reverse). The spec wins; the mismatch becomes a warning.
	 */
	private static function scan_source( string $kind, int $id, string $title, string $src, array $needs, array &$warnings ): void {
		$pairs = array(
			'EMCP_Tools_Widget_Query::'       => 'query',
			'EMCP_Tools_Shortcode_Registry::' => 'shortcode',
		);
		foreach ( $pairs as $literal => $need ) {
			$in_src  = false !== strpos( $src, $literal );
			$in_spec = in_array( $need, $needs, true );
			if ( $in_src && ! $in_spec ) {
				/* translators: 1: artifact kind, 2: title, 3: class name */
				$warnings[] = sprintf( __( 'The compiled %1$s "%2$s" calls %3$s but its spec declares no matching control; the export follows the spec. Regenerate the %1$s if it renders empty.', 'emcp-tools' ), $kind, $title, rtrim( $literal, ':' ) );
			}
		}
	}

	/** @return string[] */
	private static function runtime_closure( array $plan ): array {
		$all = array();
		foreach ( array_merge( $plan['widgets'], $plan['blocks'] ) as $artifact ) {
			$all = array_merge( $all, (array) ( $artifact['needs'] ?? array() ) );
		}
		$out = array();
		if ( in_array( 'query', $all, true ) ) {
			$out[] = 'widget-query';
			$out[] = 'remote-source';
			$out[] = 'remote-keys';
		}
		if ( in_array( 'shortcode', $all, true ) ) {
			$out[] = 'shortcode-registry';
		}
		return $out;
	}

	/** @return array<int, array{slug:string,const:string,has_value:bool}> */
	private static function keys( array $plan ): array {
		$slugs = array();
		foreach ( $plan['widgets'] as $w ) {
			$slugs = array_merge( $slugs, (array) ( $w['key_slugs'] ?? array() ) );
		}
		$slugs     = array_values( array_unique( $slugs ) );
		$providers = class_exists( 'EMCP_Tools_Remote_Keys' ) ? EMCP_Tools_Remote_Keys::providers() : array();
		$out       = array();
		foreach ( $slugs as $slug ) {
			$out[] = array(
				'slug'      => $slug,
				'const'     => (string) ( $providers[ $slug ]['const'] ?? 'EMCP_TOOLS_REMOTE_KEY_' . strtoupper( $slug ) ),
				'has_value' => class_exists( 'EMCP_Tools_Remote_Keys' ) && EMCP_Tools_Remote_Keys::has( $slug ),
			);
		}
		return $out;
	}
}
