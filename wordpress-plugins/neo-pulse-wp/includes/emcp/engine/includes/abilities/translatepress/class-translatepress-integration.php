<?php
/**
 * TranslatePress (free) integration: the translatepress-read and translatepress-write dispatcher
 * tools. Operation rows live in ops/translatepress-read.php and ops/translatepress-write.php; each
 * row names its own capability rule (cap_*) and handler (op_*). Every TranslatePress call goes
 * through EMCP_Tools_TranslatePress_Api.
 *
 * Who may read and write strings is TranslatePress's own translating capability; a string row is
 * shared by every page that shows its text, so page ownership grants nothing.
 *
 * @package EMCP_Tools
 * @since   3.19.0
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

if ( ! class_exists( 'EMCP_Tools_Op_Args' ) ) {
	require_once dirname( __DIR__ ) . '/class-op-args.php';
}

/** @since 3.19.0 */
class EMCP_Tools_TranslatePress_Integration {

	/** Strings per page of get-page-strings, and per write call. */
	const MAX_LIMIT = 200;

	/** @var EMCP_Tools_TranslatePress_Api|null Test seam. */
	private static $api_override = null;

	/** @var string[] */
	private $ability_names = array();

	public static function use_api( ?EMCP_Tools_TranslatePress_Api $api ): void {
		self::$api_override = $api;
	}

	public static function translatepress_active(): bool {
		return class_exists( 'TRP_Translate_Press' );
	}

	/** The adapter every TranslatePress class uses (one seam for tests). */
	public static function shared_api(): EMCP_Tools_TranslatePress_Api {
		return self::$api_override ? self::$api_override : new EMCP_Tools_TranslatePress_Api();
	}

	protected function api(): EMCP_Tools_TranslatePress_Api {
		return self::shared_api();
	}

	/** @return string[] */
	public function get_ability_names(): array {
		return $this->ability_names;
	}

	/** Translators (TranslatePress's capability) and administrators reach the tools; each operation checks its own rule. */
	public function check_permission(): bool {
		return current_user_can( $this->api()->translating_capability() ) || current_user_can( 'manage_options' );
	}

	public function register(): void {
		if ( ! ( function_exists( 'emcp_tools_fs' ) && emcp_tools_fs()->can_use_premium_code() ) ) {
			return;
		}
		$schema = static function ( string $what ): array {
			return array(
				'type'       => 'object',
				'properties' => array(
					'operation' => array( 'type' => 'string', 'description' => $what ),
					'arguments' => array( 'type' => 'object', 'description' => __( 'Arguments for the operation, plus confirm and dry_run where listed.', 'emcp-tools' ) ),
				),
			);
		};
		$tools = array(
			'emcp-tools/translatepress-read'  => array(
				'label'       => __( 'TranslatePress Read', 'emcp-tools' ),
				'description' => __( 'Read TranslatePress: the language setup, every translatable string of a page in the translation language with its sentence context and version (get-page-strings), string search by text and status, theme and plugin (gettext) strings, and translation progress. Call with no operation to list operations.', 'emcp-tools' ),
				'callback'    => 'run_read',
				'operation'   => __( 'The read operation. Omit to list operations.', 'emcp-tools' ),
				'annotations' => array( 'readonly' => true, 'destructive' => false, 'idempotent' => true ),
			),
			'emcp-tools/translatepress-write' => array(
				'label'       => __( 'TranslatePress Write', 'emcp-tools' ),
				'description' => __( 'Translate with TranslatePress: write translations of page and gettext strings in one all-or-nothing call (translate-strings, saved as machine translated unless reviewed:true), mark them reviewed (review-strings), and add, update, remove or make default the translation language. Disabled by default; enable under Neo EMCP > Tools > Plugins > TranslatePress. remove-language and set-default-language need confirm:true. Every write except remove-language can be undone in History. Call with no operation to list operations.', 'emcp-tools' ),
				'callback'    => 'run_write',
				'operation'   => __( 'The write operation. Omit to list operations.', 'emcp-tools' ),
				'annotations' => array( 'readonly' => false, 'destructive' => true, 'idempotent' => false ),
			),
		);
		foreach ( $tools as $name => $t ) {
			$this->ability_names[] = $name;
			emcp_tools_register_ability(
				$name,
				array(
					'label'               => $t['label'],
					'description'         => $t['description'],
					'category'            => 'emcp-tools',
					'execute_callback'    => array( $this, $t['callback'] ),
					'permission_callback' => array( $this, 'check_permission' ),
					'input_schema'        => $schema( $t['operation'] ),
					'meta'                => array(
						'annotations'  => $t['annotations'],
						'show_in_rest' => true,
					),
				)
			);
		}
	}

	/** @return array|WP_Error */
	public function run_read( $input ) {
		return $this->run( 'read', $input );
	}

	/** @return array|WP_Error */
	public function run_write( $input ) {
		return $this->run( 'write', $input );
	}

	/** @return array<string,array> */
	protected function operations( string $mode ): array {
		return (array) require __DIR__ . '/ops/translatepress-' . $mode . '.php';
	}

	/** @return array */
	public function catalog( string $mode ): array {
		$ops = array();
		foreach ( $this->operations( $mode ) as $name => $op ) {
			$args     = array();
			$required = array();
			foreach ( (array) $op['args'] as $arg => $type ) {
				$args[ $arg ] = rtrim( (string) $type, '!' );
				if ( '!' === substr( (string) $type, -1 ) ) {
					$required[] = $arg;
				}
			}
			$ops[] = array(
				'name'        => $name,
				'arguments'   => $args,
				'required'    => $required,
				'confirm'     => ! empty( $op['confirm'] ),
				'dry_run'     => ! empty( $op['dry_run'] ),
				'undo'        => 'write' === $mode ? (string) ( $op['undo'] ?? 'undoable' ) : 'read-only',
				'description' => $op['desc'],
			);
		}
		return array( 'mode' => $mode, 'operations' => $ops );
	}

	/** @return array|WP_Error */
	protected function run( string $mode, $input ) {
		$name = is_array( $input ) && isset( $input['operation'] ) ? str_replace( '_', '-', sanitize_key( (string) $input['operation'] ) ) : '';
		if ( '' === $name ) {
			return $this->catalog( $mode );
		}
		$ops = $this->operations( $mode );
		if ( ! isset( $ops[ $name ] ) ) {
			/* translators: %s: operation name. */
			return new WP_Error( 'unknown_operation', sprintf( __( 'Unknown operation "%s". Call the tool with no operation to list the available operations.', 'emcp-tools' ), $name ) );
		}
		if ( ! $this->api()->active() ) {
			return new WP_Error( 'translatepress_inactive', __( 'TranslatePress is not active.', 'emcp-tools' ) );
		}
		$op   = $ops[ $name ];
		$args = is_array( $input ) && isset( $input['arguments'] ) && is_array( $input['arguments'] ) ? $input['arguments'] : array();

		$dry_run = false;
		if ( array_key_exists( 'dry_run', $args ) ) {
			if ( empty( $op['dry_run'] ) || ! is_bool( $args['dry_run'] ) ) {
				return new WP_Error( 'invalid_argument', __( 'dry_run must be a boolean and is only supported where the operation list says so.', 'emcp-tools' ) );
			}
			$dry_run = $args['dry_run'];
			unset( $args['dry_run'] );
		}
		$confirmed = array_key_exists( 'confirm', $args ) && true === $args['confirm'];
		unset( $args['confirm'] );

		$clean = EMCP_Tools_Op_Args::validate( (array) $op['args'], $args );
		if ( is_wp_error( $clean ) ) {
			return $clean;
		}
		if ( ! method_exists( $this, $op['cap'] ) || ! method_exists( $this, $op['run'] ) ) {
			return new WP_Error( 'not_ready', __( 'This operation is not available yet.', 'emcp-tools' ) );
		}
		$allowed = call_user_func( array( $this, $op['cap'] ), $clean );
		if ( is_wp_error( $allowed ) ) {
			return $allowed;
		}
		if ( ! empty( $op['confirm'] ) && ! $confirmed && ! $dry_run ) {
			return new WP_Error( 'confirmation_required', __( 'This operation cannot be undone or changes which translations apply. Pass confirm:true in arguments to proceed.', 'emcp-tools' ) );
		}
		return call_user_func( array( $this, $op['run'] ), $clean, $dry_run, $confirmed );
	}

	// Capability rules. Each returns true or a WP_Error.

	protected static function forbidden(): WP_Error {
		return new WP_Error( 'forbidden', __( 'You are not allowed to do this.', 'emcp-tools' ), array( 'status' => 403 ) );
	}

	/** @return true|WP_Error */
	protected function cap_manage( array $args ) {
		return current_user_can( 'manage_options' ) ? true : self::forbidden();
	}

	/** TranslatePress's translating capability. @return true|WP_Error */
	protected function cap_translate( array $args ) {
		return current_user_can( $this->api()->translating_capability() ) ? true : self::forbidden();
	}

	/** Translating capability, plus edit_post for a page that is not publicly viewable. @return true|WP_Error */
	protected function cap_page( array $args ) {
		$can = $this->cap_translate( $args );
		if ( is_wp_error( $can ) ) {
			return $can;
		}
		$post = get_post( (int) $args['post_id'] );
		if ( ! $post ) {
			/* translators: %d: post ID. */
			return new WP_Error( 'not_found', sprintf( __( 'Post %d does not exist.', 'emcp-tools' ), (int) $args['post_id'] ) );
		}
		if ( ! self::is_public( $post ) && ! current_user_can( 'edit_post', (int) $post->ID ) ) {
			return self::forbidden();
		}
		return true;
	}

	/** Published and publicly viewable: rendered for a visitor, without a login cookie. */
	public static function is_public( $post ): bool {
		if ( function_exists( 'is_post_publicly_viewable' ) ) {
			return (bool) is_post_publicly_viewable( $post );
		}
		return 'publish' === (string) $post->post_status;
	}

	/** @return true|WP_Error */
	protected function known_language( string $lang ) {
		if ( in_array( $lang, $this->api()->translation_languages(), true ) ) {
			return true;
		}
		/* translators: %s: language code. */
		return new WP_Error( 'unknown_language', sprintf( __( '"%s" is not a translation language of this site. get-setup lists the languages; the default language has no translations.', 'emcp-tools' ), $lang ) );
	}

	// Read handlers.

	/** @return array */
	protected function op_get_setup( array $args ) {
		$api      = $this->api();
		$settings = $api->settings();
		$default  = (string) ( $settings['default-language'] ?? '' );
		$all      = array_values( array_unique( array_merge( array( $default ), (array) ( $settings['translation-languages'] ?? array() ) ) ) );
		$names    = $api->language_names( array_filter( $all ) );
		$slugs    = (array) ( $settings['url-slugs'] ?? array() );
		$publish  = (array) ( $settings['publish-languages'] ?? array() );
		$langs    = array();
		foreach ( array_filter( $all ) as $code ) {
			$langs[] = array(
				'code'      => $code,
				'name'      => $names[ $code ] ?? $code,
				'slug'      => (string) ( $slugs[ $code ] ?? '' ),
				'default'   => $code === $default,
				'published' => in_array( $code, $publish, true ),
			);
		}
		$limit = $api->language_limit();
		return array(
			'default_language'      => $default,
			'translation_languages' => $api->translation_languages(),
			'languages'             => $langs,
			'language_limit'        => $limit,
			'can_add_language'      => count( $api->translation_languages() ) < $limit,
			'automatic_translation' => $api->machine_translation(),
		);
	}

	const STATUS_NAMES = array( 'untranslated' => 0, 'machine' => 1, 'reviewed' => 2 );

	/** One row as reads return it. */
	protected static function row_out( array $row, string $kind ): array {
		$out = array(
			'id'         => (int) $row['id'],
			'original'   => (string) $row['original'],
			'text'       => html_entity_decode( (string) $row['original'], ENT_QUOTES | ENT_HTML5, 'UTF-8' ),
			'translated' => isset( $row['translated'] ) ? (string) $row['translated'] : null,
			'status'     => (int) $row['status'],
			'version'    => EMCP_Tools_TranslatePress_Api::version( isset( $row['translated'] ) ? (string) $row['translated'] : null, (int) $row['status'] ),
		);
		if ( EMCP_Tools_TranslatePress_Api::GETTEXT === $kind ) {
			$out['domain'] = (string) ( $row['domain'] ?? '' );
			if ( isset( $row['plural_form'] ) ) {
				$out['plural_form'] = (int) $row['plural_form'];
			}
		}
		return $out;
	}

	/** @return array|WP_Error */
	protected function op_search_strings( array $args ) {
		$lang  = (string) $args['lang'];
		$known = $this->known_language( $lang );
		if ( is_wp_error( $known ) ) {
			return $known;
		}
		$kind    = ! empty( $args['gettext'] ) ? EMCP_Tools_TranslatePress_Api::GETTEXT : EMCP_Tools_TranslatePress_Api::REGULAR;
		$filters = array();
		if ( isset( $args['search'] ) ) {
			$filters['search'] = (string) $args['search'];
		}
		$status = (string) ( $args['status'] ?? 'any' );
		if ( isset( self::STATUS_NAMES[ $status ] ) ) {
			$filters['status'] = self::STATUS_NAMES[ $status ];
		}
		if ( isset( $args['domain'] ) ) {
			$filters['domain'] = (string) $args['domain'];
		}
		$page  = max( 1, (int) ( $args['page'] ?? 1 ) );
		$found = $this->api()->search( $kind, $lang, $filters, $page );
		return array(
			'lang'     => $lang,
			'gettext'  => EMCP_Tools_TranslatePress_Api::GETTEXT === $kind,
			'total'    => (int) $found['total'],
			'page'     => $page,
			'per_page' => EMCP_Tools_TranslatePress_Api::SEARCH_PAGE,
			'strings'  => array_map(
				static function ( $row ) use ( $kind ) {
					return self::row_out( $row, $kind );
				},
				array_values( (array) $found['rows'] )
			),
		);
	}

	protected function renderer(): EMCP_Tools_TranslatePress_Renderer {
		return new EMCP_Tools_TranslatePress_Renderer( $this->api() );
	}

	/** Collapse whitespace of a context sentence. */
	private static function sentence( array $parts ): string {
		return trim( (string) preg_replace( '/\s+/u', ' ', implode( ' ', $parts ) ) );
	}

	/** @return array|WP_Error */
	protected function op_get_page_strings( array $args ) {
		$lang  = (string) $args['lang'];
		$known = $this->known_language( $lang );
		if ( is_wp_error( $known ) ) {
			return $known;
		}
		$cursor = (string) ( $args['cursor'] ?? '0' );
		if ( ! ctype_digit( $cursor ) ) {
			return new WP_Error( 'invalid_argument', __( 'cursor must be the next_cursor of an earlier call.', 'emcp-tools' ) );
		}
		$limit   = min( self::MAX_LIMIT, max( 1, (int) ( $args['limit'] ?? self::MAX_LIMIT ) ) );
		$gettext = ! array_key_exists( 'include_gettext', $args ) || ! empty( $args['include_gettext'] );
		$page    = $this->renderer()->page( (int) $args['post_id'], $lang );
		if ( is_wp_error( $page ) ) {
			return $page;
		}
		$api       = $this->api();
		// data-trpgettextoriginal carries the id of the row in the language's gettext table: the
		// editor reads it with TRP_Query::get_gettext_string_rows_by_ids() (WHERE tt.id IN).
		$regular   = array();
		$originals = array();
		foreach ( $page['entries'] as $e ) {
			if ( 'regular' === $e['source'] ) {
				$regular[] = (int) $e['id'];
			} elseif ( $gettext ) {
				$originals[] = (int) $e['id'];
			}
		}
		$rows   = $regular ? $api->read_rows( EMCP_Tools_TranslatePress_Api::REGULAR, $lang, $regular ) : array();
		$g_rows = $originals ? $api->read_rows( EMCP_Tools_TranslatePress_Api::GETTEXT, $lang, $originals ) : array();

		// Context: the decoded text strings of each top-parent group, in document order.
		$groups = array();
		foreach ( $page['entries'] as $e ) {
			if ( 'regular' === $e['source'] && 'text' === $e['accessor'] && isset( $rows[ $e['id'] ] ) && EMCP_Tools_TranslatePress_Api::DEPRECATED_BLOCK !== (int) ( $rows[ $e['id'] ]['block_type'] ?? 0 ) ) {
				$groups[ $e['group'] ][] = html_entity_decode( (string) $rows[ $e['id'] ]['original'], ENT_QUOTES | ENT_HTML5, 'UTF-8' );
			}
		}

		$all = array();
		foreach ( $page['entries'] as $e ) {
			if ( 'regular' === $e['source'] ) {
				$row = $rows[ $e['id'] ] ?? null;
				if ( ! $row || EMCP_Tools_TranslatePress_Api::DEPRECATED_BLOCK === (int) ( $row['block_type'] ?? 0 ) ) {
					continue;
				}
				$out                = self::row_out( $row, EMCP_Tools_TranslatePress_Api::REGULAR );
				$item               = array(
					'id'       => $out['id'],
					'kind'     => in_array( $e['accessor'], EMCP_Tools_TranslatePress_Renderer::URL_ACCESSORS, true ) ? 'url' : 'text',
					'accessor' => $e['accessor'],
				) + $out;
				$item['occurrences'] = (int) $e['occurrences'];
				$item['context']     = isset( $groups[ $e['group'] ] ) ? self::sentence( $groups[ $e['group'] ] ) : $out['text'];
				$all[]               = array( 'r', $item );
				continue;
			}
			if ( isset( $g_rows[ (int) $e['id'] ] ) ) {
				$item                = self::row_out( $g_rows[ (int) $e['id'] ], EMCP_Tools_TranslatePress_Api::GETTEXT );
				$item['occurrences'] = (int) $e['occurrences'];
				$all[]               = array( 'g', $item );
			}
		}

		$counts = array( 'untranslated' => 0, 'machine' => 0, 'reviewed' => 0 );
		$hash   = array();
		foreach ( $all as $pair ) {
			$counts[ array_search( (int) $pair[1]['status'], self::STATUS_NAMES, true ) ?: 'untranslated' ]++;
			$hash[ $pair[0] . ':' . $pair[1]['id'] ] = array( $pair[1]['translated'], (int) $pair[1]['status'] );
		}
		ksort( $hash, SORT_NATURAL );

		$offset = (int) $cursor;
		$slice  = array_slice( $all, $offset, $limit );
		$out    = array(
			'post_id'     => (int) $args['post_id'],
			'lang'        => $lang,
			'url'         => $page['url'],
			'strings'     => array(),
			'gettext'     => array(),
			'total'       => count( $all ),
			'counts'      => $counts,
			'next_cursor' => $offset + $limit < count( $all ) ? (string) ( $offset + $limit ) : null,
			'page_hash'   => hash( 'sha256', (string) wp_json_encode( $hash ) ),
		);
		foreach ( $slice as $pair ) {
			$out[ 'r' === $pair[0] ? 'strings' : 'gettext' ][] = $pair[1];
		}
		$post = get_post( (int) $args['post_id'] );
		if ( $post && '' !== (string) ( $post->post_password ?? '' ) ) {
			$out['note'] = __( 'This page is password protected: only the password form was rendered, so its content strings are missing.', 'emcp-tools' );
		}
		return $out;
	}

	// String writes.

	/** An http(s) URL with a host, or a root-relative path. */
	public static function is_url( string $value ): bool {
		$value = trim( $value );
		if ( preg_match( '#^/(?!/)\S*$#', $value ) ) {
			return true;
		}
		$scheme = strtolower( (string) wp_parse_url( $value, PHP_URL_SCHEME ) );
		return in_array( $scheme, array( 'http', 'https' ), true ) && '' !== (string) wp_parse_url( $value, PHP_URL_HOST ) && ! preg_match( '/\s/', $value );
	}

	/** Tag names of a string, sorted (a multiset). @return string[] */
	public static function tag_names( string $html ): array {
		preg_match_all( '/<([a-z][a-z0-9-]*)\b/i', $html, $m );
		$names = array_map( 'strtolower', $m[1] );
		sort( $names );
		return $names;
	}

	private static function entry_error( int $index, int $id, string $code, string $message ): array {
		return array( 'index' => $index, 'id' => $id, 'code' => $code, 'message' => $message );
	}

	private static function errors_out( array $errors ): WP_Error {
		$codes = array_unique( array_column( $errors, 'code' ) );
		/* translators: %d: number of entries. */
		return new WP_Error( 1 === count( $codes ) ? (string) reset( $codes ) : (string) $errors[0]['code'], sprintf( _n( '%d entry was refused, so nothing was written.', '%d entries were refused, so nothing was written.', count( $errors ), 'emcp-tools' ), count( $errors ) ), array( 'errors' => array_values( $errors ) ) );
	}

	/**
	 * Shape checks that need no query: count, ids, duplicates, versions, empty translations.
	 *
	 * @return array|WP_Error {entries: [{index, id, translated?, version?}], errors}
	 */
	private static function read_entries( array $strings, bool $needs_text, bool $force ) {
		if ( ! $strings ) {
			return new WP_Error( 'invalid_argument', __( 'strings must list at least one entry.', 'emcp-tools' ) );
		}
		if ( count( $strings ) > self::MAX_LIMIT ) {
			/* translators: %d: maximum. */
			return new WP_Error( 'too_many_strings', sprintf( __( 'At most %d strings per call.', 'emcp-tools' ), self::MAX_LIMIT ) );
		}
		$entries = array();
		$errors  = array();
		$seen    = array();
		foreach ( array_values( $strings ) as $i => $s ) {
			$id = is_array( $s ) ? EMCP_Tools_Op_Args::coerce( 'int', $s['id'] ?? null ) : new WP_Error( 'bad' );
			if ( is_wp_error( $id ) ) {
				return new WP_Error( 'invalid_argument', sprintf( /* translators: %d: entry index. */ __( 'Entry %d needs a numeric id.', 'emcp-tools' ), $i ) );
			}
			if ( isset( $seen[ $id ] ) ) {
				$errors[] = self::entry_error( $i, $id, 'duplicate_string', __( 'This id appears more than once.', 'emcp-tools' ) );
				continue;
			}
			$seen[ $id ] = true;
			$version     = isset( $s['version'] ) && is_string( $s['version'] ) ? $s['version'] : '';
			if ( '' === $version && ! $force ) {
				$errors[] = self::entry_error( $i, $id, 'missing_version', __( 'Pass the version get-page-strings or search-strings returned for this row.', 'emcp-tools' ) );
				continue;
			}
			$entry = array( 'index' => $i, 'id' => $id, 'version' => $version );
			if ( $needs_text ) {
				$text = isset( $s['translated'] ) && is_scalar( $s['translated'] ) ? (string) $s['translated'] : '';
				if ( '' === trim( $text ) ) {
					$errors[] = self::entry_error( $i, $id, 'empty_translation', __( 'The translation is empty.', 'emcp-tools' ) );
					continue;
				}
				$entry['translated'] = $text;
			}
			$entries[] = $entry;
		}
		return array( 'entries' => $entries, 'errors' => $errors );
	}

	/** Dictionary or gettext, plus the ids on the page when post_id is given. @return array|WP_Error */
	private function write_context( array $args ) {
		$lang  = (string) $args['lang'];
		$known = $this->known_language( $lang );
		if ( is_wp_error( $known ) ) {
			return $known;
		}
		$kind     = ! empty( $args['gettext'] ) ? EMCP_Tools_TranslatePress_Api::GETTEXT : EMCP_Tools_TranslatePress_Api::REGULAR;
		$on_page  = null;
		if ( isset( $args['post_id'] ) ) {
			$can = $this->cap_page( array( 'post_id' => (int) $args['post_id'] ) );
			if ( is_wp_error( $can ) ) {
				return $can;
			}
			$ids = $this->renderer()->page_ids( (int) $args['post_id'], $lang );
			if ( is_wp_error( $ids ) ) {
				return $ids;
			}
			$on_page = array_flip( $ids[ $kind ] );
		}
		return array( 'lang' => $lang, 'kind' => $kind, 'on_page' => $on_page );
	}

	/** Row checks shared by both writes: unknown, not on the page, version. @return array|null error */
	private static function row_error( array $entry, ?array $row, ?array $on_page, bool $force ): ?array {
		if ( ! $row || EMCP_Tools_TranslatePress_Api::DEPRECATED_BLOCK === (int) ( $row['block_type'] ?? 0 ) ) {
			return self::entry_error( $entry['index'], $entry['id'], 'unknown_string', __( 'There is no such string in this language.', 'emcp-tools' ) );
		}
		if ( null !== $on_page && ! isset( $on_page[ $entry['id'] ] ) ) {
			return self::entry_error( $entry['index'], $entry['id'], 'not_on_page', __( 'This string is not on the page post_id names.', 'emcp-tools' ) );
		}
		$now = EMCP_Tools_TranslatePress_Api::version( isset( $row['translated'] ) ? (string) $row['translated'] : null, (int) $row['status'] );
		if ( ! $force && ! hash_equals( $now, (string) $entry['version'] ) ) {
			return self::entry_error( $entry['index'], $entry['id'], 'conflict', __( 'This row changed since it was read. Read it again, or pass force:true to write anyway.', 'emcp-tools' ) );
		}
		return null;
	}

	/**
	 * Lock, write, verify and record inside the change log's transaction.
	 *
	 * @param callable $plan ( array $locked ): array{errors, write: id => {translated, status}, extra: array}.
	 * @return array|WP_Error
	 */
	private function commit_rows( string $operation, string $lang, string $kind, array $ids, callable $plan, bool $dry_run ) {
		$api    = $this->api();
		$result = EMCP_Tools_Change_Log::transaction(
			static function () use ( $api, $operation, $lang, $kind, $ids, $plan, $dry_run ) {
				$locked = $api->lock_rows( $kind, $lang, $ids );
				$p      = $plan( $locked );
				if ( $p['errors'] ) {
					return self::errors_out( $p['errors'] );
				}
				$write = (array) $p['write'];
				$base  = array(
					'lang'      => $lang,
					'gettext'   => EMCP_Tools_TranslatePress_Api::GETTEXT === $kind,
					'unchanged' => array_values( (array) $p['unchanged'] ),
				) + (array) ( $p['extra'] ?? array() );
				if ( $dry_run ) {
					$rows = array();
					foreach ( $write as $id => $w ) {
						$rows[] = array(
							'id'     => $id,
							'before' => array( 'translated' => isset( $locked[ $id ]['translated'] ) ? (string) $locked[ $id ]['translated'] : null, 'status' => (int) $locked[ $id ]['status'] ),
							'after'  => $w,
						);
					}
					return array( 'dry_run' => true ) + $base + array( 'rows' => $rows );
				}
				if ( ! $write ) {
					return $base + array( 'written' => 0, 'strings' => array(), 'committed' => true, 'change' => array( 'change_id' => '', 'undo' => array( 'available' => false ) ) );
				}
				$rows = array();
				foreach ( $write as $id => $w ) {
					$row = array( 'id' => $id, 'translated' => $w['translated'], 'status' => $w['status'] );
					if ( EMCP_Tools_TranslatePress_Api::REGULAR === $kind ) {
						$row['block_type'] = (int) ( $locked[ $id ]['block_type'] ?? 0 );
					}
					$rows[] = $row;
				}
				$written = $api->write_rows( $kind, $lang, $rows );
				if ( is_wp_error( $written ) ) {
					return $written;
				}
				$check  = $api->lock_rows( $kind, $lang, array_keys( $write ) );
				$missed = array();
				foreach ( $write as $id => $w ) {
					if ( ! isset( $check[ $id ] ) || (string) ( $check[ $id ]['translated'] ?? '' ) !== $w['translated'] || (int) $check[ $id ]['status'] !== $w['status'] ) {
						$missed[] = $id;
					}
				}
				if ( $missed ) {
					return new WP_Error( 'write_failed', __( 'TranslatePress did not save every row, so nothing was written.', 'emcp-tools' ), array( 'ids' => $missed ) );
				}
				$before = array_intersect_key( $locked, $write );
				$change = EMCP_Tools_TranslatePress_History::record_strings( $operation, $lang, $kind, $before, $write );
				if ( '' === $change ) {
					return new WP_Error( 'history_unavailable', __( 'History could not record this change, so nothing was written (a translation that cannot be undone is never saved).', 'emcp-tools' ) );
				}
				$saved = array();
				foreach ( $rows as $row ) {
					$saved[] = array( 'id' => $row['id'], 'original' => (string) ( $locked[ $row['id'] ]['original'] ?? '' ) ) + $row;
				}
				EMCP_Tools_Change_Log::after_commit(
					static function () use ( $api, $kind, $lang, $saved ) {
						$api->saved_action( $kind, $lang, $saved );
					}
				);
				$strings = array();
				foreach ( $write as $id => $w ) {
					$strings[] = array( 'id' => $id ) + $w + array( 'version' => EMCP_Tools_TranslatePress_Api::version( $w['translated'], $w['status'] ) );
				}
				return $base + array(
					'written'   => count( $write ),
					'strings'   => $strings,
					'committed' => true,
					'change'    => array( 'change_id' => $change, 'undo' => array( 'available' => true ) ),
				);
			},
			$dry_run
		);
		if ( is_wp_error( $result ) && 'commit_failed' === $result->get_error_code() ) {
			$now  = $api->read_rows( $kind, $lang, $ids );
			$rows = array();
			foreach ( $ids as $id ) {
				$rows[] = array( 'id' => $id, 'holds' => isset( $now[ $id ] ) && ( $this->pending[ $id ] ?? null ) === array( isset( $now[ $id ]['translated'] ) ? (string) $now[ $id ]['translated'] : null, (int) $now[ $id ]['status'] ) ? 'new' : 'old' );
			}
			return new WP_Error( 'commit_failed', $result->get_error_message(), array( 'rows' => $rows ) );
		}
		return $result;
	}

	/** @var array id => [translated, status] being written (for a commit_failed report). */
	private $pending = array();

	/** @return array|WP_Error */
	protected function op_translate_strings( array $args, bool $dry_run ) {
		$force = ! empty( $args['force'] );
		$read  = self::read_entries( (array) $args['strings'], true, $force );
		if ( is_wp_error( $read ) ) {
			return $read;
		}
		$ctx = $this->write_context( $args );
		if ( is_wp_error( $ctx ) ) {
			return $ctx;
		}
		$api       = $this->api();
		$kind      = $ctx['kind'];
		$status    = ! empty( $args['reviewed'] ) ? EMCP_Tools_TranslatePress_Api::REVIEWED : EMCP_Tools_TranslatePress_Api::MACHINE;
		$overwrite = ! empty( $args['overwrite_reviewed'] );
		$on_page   = $ctx['on_page'];
		$entries   = $read['entries'];
		$shape     = $read['errors'];
		$pending   = &$this->pending;
		$plan      = static function ( array $locked ) use ( $api, $kind, $status, $overwrite, $on_page, $entries, $shape, $force, &$pending ) {
			$errors    = $shape;
			$write     = array();
			$unchanged = array();
			foreach ( $entries as $e ) {
				$row = $locked[ $e['id'] ] ?? null;
				$err = self::row_error( $e, $row, $on_page, $force );
				if ( $err ) {
					$errors[] = $err;
					continue;
				}
				$original = html_entity_decode( (string) $row['original'], ENT_QUOTES | ENT_HTML5, 'UTF-8' );
				if ( EMCP_Tools_TranslatePress_Api::REGULAR === $kind && self::is_url( $original ) ) {
					if ( ! self::is_url( $e['translated'] ) ) {
						$errors[] = self::entry_error( $e['index'], $e['id'], 'invalid_url', __( 'This string is a link or file address: its translation must be an http(s) URL or a path starting with /.', 'emcp-tools' ) );
						continue;
					}
					$clean = $api->sanitize_url( trim( $e['translated'] ) );
				} else {
					$clean = $api->sanitize_text( $e['translated'] );
					if ( '' === trim( $clean ) ) {
						$errors[] = self::entry_error( $e['index'], $e['id'], 'empty_translation', __( 'The translation is empty once unsafe markup is removed.', 'emcp-tools' ) );
						continue;
					}
					if ( self::tag_names( (string) $row['original'] ) !== self::tag_names( $clean ) ) {
						$errors[] = self::entry_error( $e['index'], $e['id'], 'tags_changed', __( 'The translation must keep the same HTML tags as the original.', 'emcp-tools' ) );
						continue;
					}
				}
				$was = isset( $row['translated'] ) ? (string) $row['translated'] : null;
				if ( $was === $clean && (int) $row['status'] === $status ) {
					$unchanged[] = $e['id'];
					continue;
				}
				if ( EMCP_Tools_TranslatePress_Api::REVIEWED === (int) $row['status'] && ! $overwrite ) {
					$errors[] = self::entry_error( $e['index'], $e['id'], 'reviewed_exists', __( 'This string has a human-reviewed translation. Pass overwrite_reviewed:true to replace it.', 'emcp-tools' ) );
					continue;
				}
				$write[ $e['id'] ]   = array( 'translated' => $clean, 'status' => $status );
				$pending[ $e['id'] ] = array( $clean, $status );
			}
			return array( 'errors' => $errors, 'write' => $write, 'unchanged' => $unchanged );
		};
		if ( ! $entries && $shape ) {
			return self::errors_out( $shape );
		}
		return $this->commit_rows( 'translate-strings', $ctx['lang'], $kind, array_column( $entries, 'id' ), $plan, $dry_run );
	}

	/** @return array|WP_Error */
	protected function op_review_strings( array $args, bool $dry_run ) {
		$force = ! empty( $args['force'] );
		$read  = self::read_entries( (array) $args['strings'], false, $force );
		if ( is_wp_error( $read ) ) {
			return $read;
		}
		$ctx = $this->write_context( $args );
		if ( is_wp_error( $ctx ) ) {
			return $ctx;
		}
		$on_page = $ctx['on_page'];
		$entries = $read['entries'];
		$shape   = $read['errors'];
		$pending = &$this->pending;
		$plan    = static function ( array $locked ) use ( $on_page, $entries, $shape, $force, &$pending ) {
			$errors  = $shape;
			$write   = array();
			$skipped = array();
			foreach ( $entries as $e ) {
				$row = $locked[ $e['id'] ] ?? null;
				$err = self::row_error( $e, $row, $on_page, $force );
				if ( $err ) {
					$errors[] = $err;
					continue;
				}
				if ( EMCP_Tools_TranslatePress_Api::MACHINE !== (int) $row['status'] ) {
					$skipped[] = array( 'id' => $e['id'], 'status' => (int) $row['status'] );
					continue;
				}
				$write[ $e['id'] ]   = array( 'translated' => (string) $row['translated'], 'status' => EMCP_Tools_TranslatePress_Api::REVIEWED );
				$pending[ $e['id'] ] = array( (string) $row['translated'], EMCP_Tools_TranslatePress_Api::REVIEWED );
			}
			return array( 'errors' => $errors, 'write' => $write, 'unchanged' => array(), 'extra' => array( 'skipped' => $skipped ) );
		};
		if ( ! $entries && $shape ) {
			return self::errors_out( $shape );
		}
		return $this->commit_rows( 'review-strings', $ctx['lang'], $ctx['kind'], array_column( $entries, 'id' ), $plan, $dry_run );
	}

	// Language operations: TranslatePress's own abilities, so its permission check, validation,
	// sanitizer and settings save run unchanged.

	/** @return array|WP_Error */
	private function run_ability( string $name, array $input ) {
		$ability = $this->api()->ability( $name );
		if ( ! $ability || ! method_exists( $ability, 'execute' ) ) {
			/* translators: %s: ability name. */
			return new WP_Error( 'translatepress_too_old', sprintf( __( 'This TranslatePress version does not provide %s. Update TranslatePress.', 'emcp-tools' ), $name ) );
		}
		$result = $ability->execute( $input );
		if ( is_wp_error( $result ) ) {
			return $result;
		}
		return is_array( $result ) ? $result : array( 'result' => $result );
	}

	/** Run a settings ability and record the trp_settings keys it changed. @return array|WP_Error */
	private function settings_operation( string $operation, string $ability, array $input, string $summary, array $extra = array() ) {
		$before = $this->api()->settings();
		$result = $this->run_ability( $ability, $input );
		if ( is_wp_error( $result ) ) {
			return $result;
		}
		$change = EMCP_Tools_TranslatePress_History::record_settings( $operation, $summary, $before, $this->api()->settings(), $extra );
		return $result + array( 'change' => array( 'change_id' => $change, 'undo' => array( 'available' => '' !== $change ) ) );
	}

	/** @return array|WP_Error */
	protected function op_add_language( array $args ) {
		$code  = (string) $args['language_code'];
		$input = array( 'language_code' => $code );
		if ( isset( $args['slug'] ) ) {
			$input['slug'] = (string) $args['slug'];
		}
		/* translators: %s: language code. */
		return $this->settings_operation( 'add-language', 'translatepress/add-language', $input, sprintf( __( 'TranslatePress: added %s', 'emcp-tools' ), $code ), array( 'added_language' => $code ) );
	}

	/** @return array|WP_Error */
	protected function op_update_language( array $args ) {
		$code = (string) $args['language_code'];
		/* translators: %s: language code. */
		return $this->settings_operation( 'update-language', 'translatepress/update-language', array( 'language_code' => $code, 'slug' => (string) $args['slug'], 'published' => (bool) $args['published'] ), sprintf( __( 'TranslatePress: updated %s', 'emcp-tools' ), $code ) );
	}

	/** @return array|WP_Error */
	protected function op_set_default_language( array $args ) {
		$code = (string) $args['language_code'];
		/* translators: %s: language code. */
		return $this->settings_operation( 'set-default-language', 'translatepress/set-default-language', array( 'language_code' => $code ), sprintf( __( 'TranslatePress: %s made the default language', 'emcp-tools' ), $code ) );
	}

	/** @return array|WP_Error */
	protected function op_remove_language( array $args, bool $dry_run ) {
		$code  = (string) $args['language_code'];
		$known = $this->known_language( $code );
		if ( is_wp_error( $known ) ) {
			return $known;
		}
		if ( $dry_run ) {
			return array(
				'dry_run'       => true,
				'language_code' => $code,
				'strings'       => $this->api()->row_counts( $code ),
				'note'          => __( 'TranslatePress keeps these rows in the database but stops using them.', 'emcp-tools' ),
			);
		}
		$result = $this->run_ability( 'translatepress/remove-language', array( 'language_code' => $code ) );
		if ( is_wp_error( $result ) ) {
			return $result;
		}
		$change = EMCP_Tools_Change_Log::record(
			array(
				'domain'   => 'translatepress',
				'action'   => 'remove-language',
				'target'   => 'option trp_settings',
				/* translators: %s: language code. */
				'summary'  => sprintf( __( 'TranslatePress: removed %s', 'emcp-tools' ), $code ),
				'rollback' => array(
					'type'   => 'irreversible',
					'reason' => __( 'Removing a TranslatePress language cannot be undone from History: TranslatePress keeps its table, but adding the language back cannot be shown to restore everything. Add it again with add-language.', 'emcp-tools' ),
				),
			)
		);
		return $result + array( 'change' => array( 'change_id' => $change, 'undo' => array( 'available' => false ) ) );
	}

	/** @return array|WP_Error */
	protected function op_get_progress( array $args ) {
		$langs = $this->api()->translation_languages();
		if ( isset( $args['lang'] ) ) {
			$known = $this->known_language( (string) $args['lang'] );
			if ( is_wp_error( $known ) ) {
				return $known;
			}
			$langs = array( (string) $args['lang'] );
		}
		$out = array();
		foreach ( $langs as $lang ) {
			$out[ $lang ] = $this->api()->progress( $lang );
		}
		return array( 'languages' => $out );
	}
}
