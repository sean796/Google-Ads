<?php
/**
 * The only class that touches TranslatePress (free 3.3.7): settings, the dictionary and gettext
 * tables, its own write functions, its abilities, the URL converter and the translating
 * capability. Unit tests replace it with a fake (EMCP_Tools_TranslatePress_Integration::use_api()).
 *
 * Kinds: 'regular' is the dictionary table of a language ({prefix}trp_dictionary_{default}_{lang}),
 * 'gettext' its gettext table ({prefix}trp_gettext_{lang}).
 *
 * @package EMCP_Tools
 * @since   3.19.0
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/** @since 3.19.0 */
class EMCP_Tools_TranslatePress_Api {

	const REGULAR = 'regular';
	const GETTEXT = 'gettext';

	/** TranslatePress status values. */
	const NOT_TRANSLATED = 0;
	const MACHINE        = 1;
	const REVIEWED       = 2;

	/** Block type of rows TranslatePress no longer uses. */
	const DEPRECATED_BLOCK = 2;

	/** Rows per search page. */
	const SEARCH_PAGE = 50;

	/** Where the editor merges strings when TranslatePress cannot be asked (its 3.3.7 list). */
	const TOP_PARENTS = array( 'p', 'div', 'li', 'ol', 'ul', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'h7', 'body', 'footer', 'article', 'main', 'iframe', 'section', 'figure', 'figcaption', 'blockquote', 'cite', 'tr', 'td', 'th', 'table', 'tbody', 'thead', 'tfoot', 'form', 'label' );

	/**
	 * A row's version: the first 16 hex characters of sha256( translated . "\x1f" . status ).
	 * Reads return it and writes name it, so a change made between them is caught.
	 */
	public static function version( ?string $translated, int $status ): string {
		return substr( hash( 'sha256', (string) $translated . "\x1f" . $status ), 0, 16 );
	}

	public function active(): bool {
		return class_exists( 'TRP_Translate_Press' );
	}

	/** @return object|null */
	protected function trp() {
		return class_exists( 'TRP_Translate_Press' ) ? TRP_Translate_Press::get_trp_instance() : null;
	}

	/** @return object|null */
	protected function component( string $name ) {
		$trp = $this->trp();
		return $trp ? $trp->get_component( $name ) : null;
	}

	/** @return \wpdb */
	protected function db() {
		global $wpdb;
		return $wpdb;
	}

	/**
	 * trp_settings read from the database: a long-lived process must see a language another
	 * process added, and TranslatePress's own component keeps the copy it read at boot.
	 */
	public function settings(): array {
		$db  = $this->db();
		$raw = $db->get_var( $db->prepare( "SELECT option_value FROM {$db->options} WHERE option_name = %s", 'trp_settings' ) );
		$val = null === $raw ? array() : maybe_unserialize( $raw );
		return is_array( $val ) ? $val : array();
	}

	public function default_language(): string {
		return (string) ( $this->settings()['default-language'] ?? '' );
	}

	/** Translation languages other than the default. @return string[] */
	public function translation_languages(): array {
		$s = $this->settings();
		return array_values( array_diff( (array) ( $s['translation-languages'] ?? array() ), array( (string) ( $s['default-language'] ?? '' ) ) ) );
	}

	/** @return array<string,string> code => English name. */
	public function language_names( array $codes ): array {
		$languages = $this->component( 'languages' );
		$names     = $languages && method_exists( $languages, 'get_language_names' ) ? (array) $languages->get_language_names( $codes, 'english_name' ) : array();
		$out       = array();
		foreach ( $codes as $code ) {
			$out[ $code ] = (string) ( $names[ $code ] ?? $code );
		}
		return $out;
	}

	public function translating_capability(): string {
		return (string) apply_filters( 'trp_translating_capability', 'manage_options' );
	}

	/** Translation languages the free edition allows besides the default. */
	public function language_limit(): int {
		return (int) apply_filters( 'trp_secondary_languages', 1 );
	}

	/** Whether automatic translation is switched on and with which engine; never a key. */
	public function machine_translation(): array {
		$mt = get_option( 'trp_machine_translation_settings', array() );
		$mt = is_array( $mt ) ? $mt : array();
		return array(
			'enabled' => 'yes' === ( $mt['machine-translation'] ?? '' ),
			'engine'  => sanitize_key( (string) ( $mt['translation-engine'] ?? '' ) ),
		);
	}

	public function table( string $kind, string $lang ): string {
		$query = $this->component( 'query' );
		if ( ! $query ) {
			return '';
		}
		$table = self::GETTEXT === $kind ? (string) $query->get_gettext_table_name( $lang ) : (string) $query->get_table_name( $lang, $this->default_language() );
		return preg_match( '/^[A-Za-z0-9_]+$/', $table ) ? $table : '';
	}

	public function table_exists( string $kind, string $lang ): bool {
		$table = $this->table( $kind, $lang );
		if ( '' === $table ) {
			return false;
		}
		$db = $this->db();
		return $table === $db->get_var( $db->prepare( 'SHOW TABLES LIKE %s', $db->esc_like( $table ) ) );
	}

	/** @return array<int,array> id => row. */
	protected function rows_where( string $kind, string $lang, string $column, array $ids, bool $lock ): array {
		$table = $this->table( $kind, $lang );
		$ids   = array_values( array_unique( array_map( 'intval', $ids ) ) );
		if ( '' === $table || ! $ids ) {
			return array();
		}
		$db   = $this->db();
		$sql  = "SELECT * FROM `{$table}` WHERE `{$column}` IN (" . implode( ',', array_fill( 0, count( $ids ), '%d' ) ) . ') ORDER BY id' . ( $lock ? ' FOR UPDATE' : '' );
		$rows = (array) $db->get_results( $db->prepare( $sql, $ids ), ARRAY_A );
		$out  = array();
		foreach ( $rows as $row ) {
			$out[ (int) $row['id'] ] = self::normalize( $row );
		}
		return $out;
	}

	protected static function normalize( array $row ): array {
		$row['id']     = (int) $row['id'];
		$row['status'] = (int) ( $row['status'] ?? 0 );
		if ( isset( $row['block_type'] ) ) {
			$row['block_type'] = (int) $row['block_type'];
		}
		if ( isset( $row['original_id'] ) ) {
			$row['original_id'] = (int) $row['original_id'];
		}
		if ( isset( $row['plural_form'] ) ) {
			$row['plural_form'] = (int) $row['plural_form'];
		}
		return $row;
	}

	/** Rows locked FOR UPDATE (inside the change log's transaction). @return array<int,array> */
	public function lock_rows( string $kind, string $lang, array $ids ): array {
		return $this->rows_where( $kind, $lang, 'id', $ids, true );
	}

	/** @return array<int,array> */
	public function read_rows( string $kind, string $lang, array $ids ): array {
		return $this->rows_where( $kind, $lang, 'id', $ids, false );
	}

	/**
	 * Write rows with TranslatePress's own functions, as its editor does.
	 *
	 * @param array $rows {id, translated, status, block_type} (regular) or {id, translated, status} (gettext).
	 * @return true|WP_Error
	 */
	public function write_rows( string $kind, string $lang, array $rows ) {
		$query = $this->component( 'query' );
		if ( ! $query ) {
			return new WP_Error( 'translatepress_unsupported', __( 'TranslatePress did not provide its query component.', 'emcp-tools' ) );
		}
		$db             = $this->db();
		$db->last_error = '';
		if ( self::GETTEXT === $kind ) {
			$writer = method_exists( $query, 'get_query_component' ) ? $query->get_query_component( 'gettext_insert_update' ) : null;
			if ( ! $writer || ! method_exists( $writer, 'update_gettext_strings' ) ) {
				return new WP_Error( 'translatepress_unsupported', __( 'This TranslatePress version has no gettext writer.', 'emcp-tools' ) );
			}
			$ok = $writer->update_gettext_strings( $rows, $lang, array( 'id', 'translated', 'status' ) );
		} else {
			if ( ! method_exists( $query, 'update_strings' ) ) {
				return new WP_Error( 'translatepress_unsupported', __( 'This TranslatePress version has no string writer.', 'emcp-tools' ) );
			}
			$ok = $query->update_strings( $rows, $lang, array( 'id', 'translated', 'status', 'block_type' ) );
		}
		if ( ! $ok || '' !== (string) $db->last_error ) {
			return new WP_Error( 'write_failed', __( 'TranslatePress did not save the strings.', 'emcp-tools' ) );
		}
		return true;
	}

	/** Set translated back to NULL (TranslatePress's writer stores NULL as ''). */
	public function null_translations( string $kind, string $lang, array $ids ): bool {
		$table = $this->table( $kind, $lang );
		$ids   = array_values( array_map( 'intval', $ids ) );
		if ( '' === $table || ! $ids ) {
			return '' !== $table;
		}
		$db = $this->db();
		return false !== $db->query( $db->prepare( "UPDATE `{$table}` SET translated = NULL WHERE id IN (" . implode( ',', array_fill( 0, count( $ids ), '%d' ) ) . ')', $ids ) );
	}

	/**
	 * Search a language's rows.
	 *
	 * @param array $filters {search?: string, status?: int, domain?: string}.
	 * @return array{rows: array, total: int}
	 */
	public function search( string $kind, string $lang, array $filters, int $page ): array {
		$table = $this->table( $kind, $lang );
		if ( '' === $table || ! $this->table_exists( $kind, $lang ) ) {
			return array( 'rows' => array(), 'total' => 0 );
		}
		$db     = $this->db();
		$where  = array( '1=1' );
		$values = array();
		if ( self::REGULAR === $kind ) {
			$where[]  = 'block_type <> %d';
			$values[] = self::DEPRECATED_BLOCK;
		}
		if ( isset( $filters['status'] ) ) {
			$where[]  = 'status = %d';
			$values[] = (int) $filters['status'];
		}
		if ( '' !== (string) ( $filters['search'] ?? '' ) ) {
			$like     = '%' . $db->esc_like( (string) $filters['search'] ) . '%';
			$where[]  = '( original LIKE %s OR translated LIKE %s )';
			$values[] = $like;
			$values[] = $like;
		}
		if ( self::GETTEXT === $kind && '' !== (string) ( $filters['domain'] ?? '' ) ) {
			$where[]  = 'domain = %s';
			$values[] = (string) $filters['domain'];
		}
		$sql   = implode( ' AND ', $where );
		$count = "SELECT COUNT(*) FROM `{$table}` WHERE {$sql}";
		$total = (int) $db->get_var( $values ? $db->prepare( $count, $values ) : $count );
		$rows  = (array) $db->get_results( $db->prepare( "SELECT * FROM `{$table}` WHERE {$sql} ORDER BY id LIMIT %d OFFSET %d", array_merge( $values, array( self::SEARCH_PAGE, ( max( 1, $page ) - 1 ) * self::SEARCH_PAGE ) ) ), ARRAY_A );
		return array( 'rows' => array_map( array( __CLASS__, 'normalize' ), $rows ), 'total' => $total );
	}

	/** @return array{regular: array, gettext: array} counts by status. */
	public function progress( string $lang ): array {
		$out = array();
		foreach ( array( self::REGULAR, self::GETTEXT ) as $kind ) {
			$counts = array( 'untranslated' => 0, 'machine' => 0, 'reviewed' => 0 );
			if ( $this->table_exists( $kind, $lang ) ) {
				$table = $this->table( $kind, $lang );
				$db    = $this->db();
				$skip  = self::REGULAR === $kind ? $db->prepare( 'WHERE block_type <> %d', self::DEPRECATED_BLOCK ) : '';
				foreach ( (array) $db->get_results( "SELECT status, COUNT(*) n FROM `{$table}` {$skip} GROUP BY status", ARRAY_A ) as $r ) {
					$key = array( 0 => 'untranslated', 1 => 'machine', 2 => 'reviewed' )[ (int) $r['status'] ] ?? '';
					if ( '' !== $key ) {
						$counts[ $key ] = (int) $r['n'];
					}
				}
			}
			$out[ $kind ] = $counts;
		}
		return $out;
	}

	/** Rows of a language, and how many carry a translation (remove-language dry run). */
	public function row_counts( string $lang ): array {
		$out = array();
		foreach ( $this->progress( $lang ) as $kind => $c ) {
			$out[ $kind ] = array( 'rows' => array_sum( $c ), 'translated' => $c['machine'] + $c['reviewed'] );
		}
		return $out;
	}

	/**
	 * Whether a language's page strings carry translations. Gettext rows are left out: on every
	 * render TranslatePress fills them from the site's language files with status 2, so they say
	 * nothing about translation work done here.
	 */
	public function has_translations( string $lang ): bool {
		return $this->row_counts( $lang )[ self::REGULAR ]['translated'] > 0;
	}

	/** The editor's action after a save, with its payload shape ({lang: rows}, settings). */
	public function saved_action( string $kind, string $lang, array $rows ): void {
		$settings = $this->component( 'settings' );
		$hook     = self::GETTEXT === $kind ? 'trp_save_editor_translations_gettext_strings' : 'trp_save_editor_translations_regular_strings';
		do_action( $hook, array( $lang => $rows ), $settings && method_exists( $settings, 'get_settings' ) ? $settings->get_settings() : $this->settings() );
	}

	public function url_for_language( string $lang, string $url ): string {
		$converter = $this->component( 'url_converter' );
		return $converter && method_exists( $converter, 'get_url_for_language' ) ? (string) $converter->get_url_for_language( $lang, $url, '' ) : '';
	}

	/** @return string[] */
	public function top_parents(): array {
		$manager = $this->component( 'translation_manager' );
		if ( $manager && method_exists( $manager, 'get_merge_rules' ) ) {
			$rules = (array) $manager->get_merge_rules();
			if ( ! empty( $rules['top_parents'] ) ) {
				return array_values( array_map( 'strtolower', (array) $rules['top_parents'] ) );
			}
		}
		return self::TOP_PARENTS;
	}

	public function sanitize_text( string $text ): string {
		return function_exists( 'trp_sanitize_string' ) ? (string) trp_sanitize_string( $text ) : wp_kses_post( trim( $text ) );
	}

	public function sanitize_url( string $url ): string {
		return (string) esc_url_raw( $url );
	}

	/** @return object|null */
	public function ability( string $name ) {
		return function_exists( 'wp_get_ability' ) ? wp_get_ability( $name ) : null;
	}

	/** Write trp_settings the way TranslatePress's own abilities do. @return true|WP_Error */
	public function save_settings( array $settings ) {
		$component = $this->component( 'settings' );
		if ( ! $component || ! method_exists( $component, 'sanitize_settings' ) ) {
			return new WP_Error( 'translatepress_unsupported', __( 'TranslatePress did not provide its settings component.', 'emcp-tools' ) );
		}
		$clean = $component->sanitize_settings( $settings );
		if ( ! is_array( $clean ) || ! isset( $clean['translation-languages'] ) ) {
			return new WP_Error( 'trp_settings_rejected', __( 'TranslatePress rejected the settings.', 'emcp-tools' ) );
		}
		update_option( 'trp_settings', $clean );
		return true;
	}
}
