<?php
/**
 * The only class that touches TablePress (free 3.4): its table and options models, the
 * single-file import parser, the exporter, the renderer, custom CSS and capability checks.
 * Unit tests replace it with a fake (EMCP_Tools_TablePress_Integration::use_api()).
 *
 * TablePress keeps the table registry (`tablepress_tables`, a JSON string) and its plugin
 * options in TablePress_WP_Option objects that read the option once, when the model is built
 * on `init`, and write their in-memory copy back. refresh_registry() replaces both with fresh
 * copies from the database, so a long-lived process never writes a stale registry back.
 *
 * @package EMCP_Tools
 * @since   3.19.0
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/** @since 3.19.0 */
class EMCP_Tools_TablePress_Api {

	/** Shortcode parameters whose value is TablePress's own (never set through EMCP). */
	const BLOCKED_PARAMETERS = array( 'id', 'datatables_custom_commands', 'shortcode_debug', 'block_preview' );

	/**
	 * A table's version: the first 16 hex characters of sha256 over the canonical JSON of name,
	 * description, data, options (without last_editor, which every save changes) and visibility.
	 */
	public static function version( array $table ): string {
		return substr( hash( 'sha256', (string) wp_json_encode( self::canonical( $table ) ) ), 0, 16 );
	}

	/** The parts of a table that versions and exact comparisons look at. */
	public static function canonical( array $table ): array {
		$options = (array) ( $table['options'] ?? array() );
		unset( $options['last_editor'] );
		ksort( $options );
		$visibility = (array) ( $table['visibility'] ?? array() );
		return array(
			'name'        => (string) ( $table['name'] ?? '' ),
			'description' => (string) ( $table['description'] ?? '' ),
			'data'        => array_map(
				static function ( $row ) {
					return array_map( 'strval', array_values( (array) $row ) );
				},
				array_values( (array) ( $table['data'] ?? array() ) )
			),
			'options'     => $options,
			'visibility'  => array(
				'rows'    => array_map( 'intval', array_values( (array) ( $visibility['rows'] ?? array() ) ) ),
				'columns' => array_map( 'intval', array_values( (array) ( $visibility['columns'] ?? array() ) ) ),
			),
		);
	}

	public function active(): bool {
		return class_exists( 'TablePress' ) && isset( TablePress::$model_table );
	}

	public function version_string(): string {
		return class_exists( 'TablePress' ) ? (string) TablePress::version : '';
	}

	public function can( string $cap, ...$args ): bool {
		return current_user_can( $cap, ...$args );
	}

	/** Re-read the table registry and the plugin options from the database. */
	public function refresh_registry(): void {
		foreach ( array( 'tablepress_tables', 'tablepress_plugin_options' ) as $name ) {
			wp_cache_delete( $name, 'options' );
		}
		wp_cache_delete( 'alloptions', 'options' );
		wp_cache_delete( 'notoptions', 'options' );
		$fresh = static function ( string $name, array $default ) {
			return TablePress::load_class( 'TablePress_WP_Option', 'class-wp_option.php', 'classes', array( 'option_name' => $name, 'default_value' => $default ) );
		};
		$tables = $fresh( 'tablepress_tables', array( 'last_id' => 0, 'table_post' => array() ) );
		\Closure::bind(
			function () use ( $tables ) {
				$this->tables = $tables;
			},
			TablePress::$model_table,
			get_class( TablePress::$model_table )
		)();
		$model_options = TablePress::$model_options;
		$plugin        = \Closure::bind(
			function () {
				return $this->default_plugin_options;
			},
			$model_options,
			get_class( $model_options )
		)();
		$options = $fresh( 'tablepress_plugin_options', (array) $plugin );
		\Closure::bind(
			function () use ( $options ) {
				$this->plugin_options = $options;
			},
			$model_options,
			get_class( $model_options )
		)();
	}

	/** @return array<string,int> table id => post id. */
	protected function registry(): array {
		$out = array();
		foreach ( (array) TablePress::$model_table->_debug_get_tables()['table_post'] as $id => $post_id ) {
			$out[ (string) $id ] = (int) $post_id;
		}
		return $out;
	}

	/** @return string[] */
	public function table_ids(): array {
		return array_map( 'strval', TablePress::$model_table->load_all( true, false ) );
	}

	public function exists( string $id ): bool {
		return TablePress::$model_table->table_exists( $id );
	}

	public function post_id( string $id ): int {
		return (int) ( $this->registry()[ $id ] ?? 0 );
	}

	/** @return array|WP_Error */
	public function load( string $id, bool $data = true ) {
		return TablePress::$model_table->load( $id, $data, true );
	}

	public function template(): array {
		return TablePress::$model_table->get_table_template();
	}

	/** @return array|WP_Error */
	public function prepare( array $existing, array $new, bool $size_check ) {
		return TablePress::$model_table->prepare_table( $existing, $new, $size_check );
	}

	/** @return string|WP_Error */
	public function add( array $table ) {
		return TablePress::$model_table->add( $table );
	}

	/** @return string|WP_Error */
	public function save( array $table ) {
		return TablePress::$model_table->save( $table );
	}

	/** @return string|WP_Error */
	public function copy( string $id ) {
		return TablePress::$model_table->copy( $id );
	}

	/** @return true|WP_Error */
	public function delete( string $id ) {
		return TablePress::$model_table->delete( $id );
	}

	/** @return true|WP_Error */
	public function change_id( string $old, string $new ) {
		return TablePress::$model_table->change_table_id( $old, $new );
	}

	/** TablePress's own sanitizing (wp_kses_post on name, description and every cell). */
	public function sanitize( array $table ): array {
		return TablePress::$model_table->sanitize( $table );
	}

	/** A tablepress_table post that no table id points to (a failed add()). */
	public function orphan_post( int $post_id ): bool {
		$post = get_post( $post_id );
		return $post && 'tablepress_table' === $post->post_type && ! in_array( $post_id, $this->registry(), true );
	}

	public function delete_post( int $post_id ): bool {
		return (bool) wp_delete_post( $post_id, true );
	}

	public function error_string( WP_Error $error ): string {
		return class_exists( 'TablePress' ) ? (string) TablePress::get_wp_error_string( $error ) : $error->get_error_code();
	}

	public function export( array $table, string $format, string $delimiter ): string {
		$exporter = TablePress::load_class( 'TablePress_Export', 'class-export.php', 'classes' );
		return (string) $exporter->export_table( $table, $format, $delimiter );
	}

	public function render_defaults(): array {
		$render   = TablePress::load_class( 'TablePress_Render', 'class-render.php', 'classes' );
		$defaults = (array) $render->get_default_render_options();
		return (array) apply_filters( 'tablepress_shortcode_table_default_shortcode_atts', $defaults );
	}

	/** The table's HTML as visitors get it (TablePress's shortcode handler). */
	public function render( string $id, array $params ): string {
		return (string) TablePress::$controller->shortcode_table( array( 'id' => $id, 'cache_table_output' => false ) + $params );
	}

	public function plugin_options(): array {
		return (array) TablePress::$model_options->get();
	}

	public function update_plugin_options( array $options ): void {
		TablePress::$model_options->update( $options );
	}

	public function flush_caches(): void {
		TablePress::$model_table->_flush_caching_plugins_caches();
	}

	/** The CSS steps of TablePress's options save. @return array{css: string, minified: string} */
	public function prepare_css( string $css ): array {
		if ( '' === $css ) {
			return array( 'css' => '', 'minified' => '' );
		}
		$tool = TablePress::load_class( 'TablePress_CSS', 'class-css.php', 'classes' );
		$css  = (string) $tool->sanitize_css( (string) TablePress::convert_datatables_api_data( $css ) );
		return array( 'css' => $css, 'minified' => (string) $tool->minify_css( $css ) );
	}

	public function css_file_contents(): string {
		$tool     = TablePress::load_class( 'TablePress_CSS', 'class-css.php', 'classes' );
		$contents = $tool->load_custom_css_from_file( 'normal' );
		return false === $contents ? '' : (string) $contents;
	}

	public function filesystem_direct(): bool {
		if ( ! function_exists( 'get_filesystem_method' ) ) {
			require_once ABSPATH . 'wp-admin/includes/file.php';
		}
		return 'direct' === get_filesystem_method();
	}

	/** Write the CSS files as TablePress's follow-up screen does. */
	public function save_css_files( string $css, string $minified ): bool {
		if ( ! function_exists( 'request_filesystem_credentials' ) ) {
			require_once ABSPATH . 'wp-admin/includes/file.php';
		}
		if ( ! function_exists( 'submit_button' ) ) {
			require_once ABSPATH . 'wp-admin/includes/template.php';
		}
		$tool = TablePress::load_class( 'TablePress_CSS', 'class-css.php', 'classes' );
		ob_start();
		$result = $tool->save_custom_css_to_file_plugin_options( $css, $minified );
		ob_end_clean();
		return true === $result;
	}

	// Import.

	/** TablePress's own cloud metadata blocklist (class-import.php). */
	public function metadata_blocked( string $url ): bool {
		$host = (string) wp_parse_url( $url, PHP_URL_HOST );
		$ip   = gethostbyname( $host );
		return in_array( $ip, array( '169.254.169.254', '169.254.170.2', '192.0.0.192', '100.100.100.200' ), true );
	}

	/** TablePress's URL fixes for Google Sheets, Dropbox and others. */
	public function fix_url( string $url ): string {
		$importer = TablePress::load_class( 'TablePress_Import', 'class-import.php', 'classes' );
		$fix      = new \ReflectionMethod( $importer, 'fix_common_url_mistakes' );
		$fix->setAccessible( true );
		return (string) $fix->invoke( $importer, $url );
	}

	/** Download to a temp file through core (wp_safe_remote_get refuses private addresses). @return string|WP_Error */
	public function download( string $url ) {
		if ( ! function_exists( 'download_url' ) ) {
			require_once ABSPATH . 'wp-admin/includes/file.php';
		}
		return download_url( $url, 30 );
	}

	/** Whether TablePress itself would use its legacy importer. */
	protected function legacy_import(): bool {
		if ( apply_filters( 'tablepress_use_legacy_table_import_class', false ) ) {
			return true;
		}
		return ! ( extension_loaded( 'mbstring' ) && class_exists( 'ZipArchive', false ) && class_exists( 'DOMDocument', false ) && function_exists( 'simplexml_load_string' ) );
	}

	/**
	 * Parse one file with TablePress's single-file parser; nothing is saved.
	 *
	 * @param string $path      File.
	 * @param string $extension Extension the file should be read as ('' for detection).
	 * @return array|WP_Error {data, and for a full JSON export id, name, description, options, visibility}
	 */
	public function parse_file( string $path, string $extension ) {
		TablePress::load_file( 'class-import-base.php', 'classes' );
		TablePress::load_file( 'class-import-file.php', 'classes' );
		if ( $this->legacy_import() ) {
			$data   = (string) file_get_contents( $path );
			$format = in_array( $extension, array( 'csv', 'html', 'json' ), true ) ? $extension : ( preg_match( '/^\s*[\[{]/', $data ) ? 'json' : ( false !== stripos( $data, '<table' ) ? 'html' : 'csv' ) );
			$legacy = TablePress::load_class( 'TablePress_Import_Legacy', 'class-import-legacy.php', 'classes' );
			$table  = $legacy->import_table( $format, $data );
			return is_array( $table ) ? $table : new WP_Error( 'table_import_legacy_failed' );
		}
		$parser = TablePress::load_class( 'TablePress_Import_PHPSpreadsheet', 'class-import-phpspreadsheet.php', 'classes' );
		$file   = new \TablePress\Import\File(
			array(
				'location'  => $path,
				'name'      => basename( $path ),
				'extension' => $extension,
				'mime_type' => function_exists( 'mime_content_type' ) ? (string) mime_content_type( $path ) : '',
				'keep_file' => true,
			)
		);
		$table = $parser->import_table( $file );
		if ( $file->location !== $path && file_exists( $file->location ) ) {
			@unlink( $file->location ); // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged
		}
		return $table;
	}
}
