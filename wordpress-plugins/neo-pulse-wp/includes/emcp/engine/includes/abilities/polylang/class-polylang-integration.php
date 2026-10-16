<?php
/**
 * Polylang (free) integration: the polylang-read and polylang-write dispatcher tools.
 * Operation rows live in ops/polylang-read.php and ops/polylang-write.php; each row names
 * its own capability rule (cap_*) and handler (op_*). Every Polylang call goes through
 * EMCP_Tools_Polylang_Api.
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
require_once __DIR__ . '/trait-polylang-setup-ops.php';

/** @since 3.19.0 */
class EMCP_Tools_Polylang_Integration {

	use EMCP_Tools_Polylang_Setup_Ops;

	/** IDs find-missing scans at most per call. */
	const SCAN_CAP = 5000;

	/** @var EMCP_Tools_Polylang_Api|null Test seam. */
	private static $api_override = null;

	/** @var string[] */
	private $ability_names = array();

	public static function use_api( ?EMCP_Tools_Polylang_Api $api ): void {
		self::$api_override = $api;
	}

	public static function polylang_active(): bool {
		return function_exists( 'pll_languages_list' ) && function_exists( 'PLL' );
	}

	protected function api(): EMCP_Tools_Polylang_Api {
		return self::shared_api();
	}

	/** The adapter every Polylang class uses (one seam for tests). */
	public static function shared_api(): EMCP_Tools_Polylang_Api {
		return self::$api_override ? self::$api_override : new EMCP_Tools_Polylang_Api();
	}

	/** @return string[] */
	public function get_ability_names(): array {
		return $this->ability_names;
	}

	public function check_permission(): bool {
		return current_user_can( 'edit_posts' );
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
			'emcp-tools/polylang-read'  => array(
				'label'       => __( 'Polylang Read', 'emcp-tools' ),
				'description' => __( 'Read Polylang: languages and settings, translation groups, posts missing a translation, the translatable text of a page as numbered segments, and string translations. Call with no operation to list operations.', 'emcp-tools' ),
				'callback'    => 'run_read',
				'operation'   => __( 'The read operation. Omit to list operations.', 'emcp-tools' ),
				'annotations' => array( 'readonly' => true, 'destructive' => false, 'idempotent' => true ),
			),
			'emcp-tools/polylang-write' => array(
				'label'       => __( 'Polylang Write', 'emcp-tools' ),
				'description' => __( 'Translate with Polylang: copy a page into another language and link it (create-translation), write its translated text back in one call (apply-page-text), publish it (set-status), and manage languages, links, term translations, strings, menus per language and settings. Disabled by default; enable under Neo EMCP > Tools > Plugins > Polylang. delete-language and URL changes need confirm:true. Every write is recorded in History. Call with no operation to list operations.', 'emcp-tools' ),
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
		return (array) require __DIR__ . '/ops/polylang-' . $mode . '.php';
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
			return new WP_Error( 'polylang_inactive', __( 'Polylang is not active.', 'emcp-tools' ) );
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
			return new WP_Error( 'confirmation_required', __( 'This operation deletes data or cannot be undone. Pass confirm:true in arguments to proceed.', 'emcp-tools' ) );
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

	/** @return true|WP_Error */
	protected function cap_edit_posts( array $args ) {
		return current_user_can( 'edit_posts' ) ? true : self::forbidden();
	}

	/** @return true|WP_Error */
	protected function cap_edit_post( array $args ) {
		return $this->can_edit_post( (int) $args['post_id'] );
	}

	/** @return true|WP_Error */
	protected function can_edit_post( int $post_id ) {
		if ( ! get_post( $post_id ) ) {
			/* translators: %d: post ID. */
			return new WP_Error( 'not_found', sprintf( __( 'Post %d does not exist.', 'emcp-tools' ), $post_id ) );
		}
		return current_user_can( 'edit_post', $post_id ) ? true : self::forbidden();
	}

	/** @return true|WP_Error */
	protected function can_edit_term( int $term_id ) {
		return current_user_can( 'edit_term', $term_id ) ? true : self::forbidden();
	}

	/** @return true|WP_Error */
	protected function cap_list_translations( array $args ) {
		if ( isset( $args['post_id'] ) === isset( $args['term_id'] ) ) {
			return new WP_Error( 'invalid_argument', __( 'Pass exactly one of post_id or term_id.', 'emcp-tools' ) );
		}
		return isset( $args['post_id'] ) ? $this->can_edit_post( (int) $args['post_id'] ) : $this->can_edit_term( (int) $args['term_id'] );
	}

	/** A post type's mapped capability (create_posts, publish_posts), with core's defaults. */
	protected static function type_cap( string $post_type, string $cap ): string {
		$object = get_post_type_object( $post_type );
		if ( $object && isset( $object->cap->$cap ) ) {
			return (string) $object->cap->$cap;
		}
		$plural = 'page' === $post_type ? 'pages' : 'posts';
		return 'create_posts' === $cap ? 'edit_' . $plural : 'publish_' . $plural;
	}

	const STATUSES = array( 'draft', 'pending', 'publish', 'private' );

	/** @return true|WP_Error */
	protected function cap_create_translation( array $args ) {
		$status = (string) ( $args['status'] ?? 'draft' );
		if ( ! in_array( $status, self::STATUSES, true ) ) {
			return new WP_Error( 'invalid_status', __( 'status must be draft, pending, publish or private.', 'emcp-tools' ) );
		}
		$can = $this->can_edit_post( (int) $args['post_id'] );
		if ( is_wp_error( $can ) ) {
			return $can;
		}
		$type = (string) get_post( (int) $args['post_id'] )->post_type;
		if ( ! current_user_can( self::type_cap( $type, 'create_posts' ) ) ) {
			return self::forbidden();
		}
		if ( in_array( $status, array( 'publish', 'private' ), true ) && ! current_user_can( self::type_cap( $type, 'publish_posts' ) ) ) {
			return self::forbidden();
		}
		return true;
	}

	/** @return true|WP_Error */
	protected function cap_set_status( array $args ) {
		if ( ! isset( $args['status'] ) ) {
			return new WP_Error( 'missing_argument', __( 'Missing required argument "status".', 'emcp-tools' ) );
		}
		$can = $this->can_edit_post( (int) $args['post_id'] );
		if ( is_wp_error( $can ) ) {
			return $can;
		}
		$type = (string) get_post( (int) $args['post_id'] )->post_type;
		if ( in_array( (string) $args['status'], array( 'publish', 'private' ), true ) && ! current_user_can( self::type_cap( $type, 'publish_posts' ) ) ) {
			return self::forbidden();
		}
		return true;
	}

	// Post writes.

	/** @return array|WP_Error */
	protected function op_create_translation( array $args, bool $dry_run ) {
		$copier = new EMCP_Tools_Polylang_Copier( $this->api() );
		$plan   = $copier->plan( (int) $args['post_id'], (string) $args['lang'], $args );
		if ( is_wp_error( $plan ) ) {
			return $plan;
		}
		$answer = array(
			'post_id'            => null,
			'lang'               => $plan['lang'],
			'title'              => $plan['title'],
			'slug'               => $plan['slug'],
			'status'             => $plan['status'],
			'password_protected' => '' !== (string) ( $plan['source']->post_password ?? '' ),
			'untranslated_terms' => $plan['untranslated'],
			'parent_note'        => $plan['parent_note'],
			'skipped_meta'       => $plan['skipped_meta'],
			'next'               => 'get-page-text',
		);
		if ( $dry_run ) {
			return array( 'dry_run' => true ) + $answer;
		}
		$lang   = $plan['lang'];
		$result = EMCP_Tools_Polylang_Sync_Guard::around(
			(int) $args['post_id'],
			EMCP_Tools_Polylang_Copier::keys( $plan ),
			static function () use ( $copier, $plan, $lang ) {
				$done = $copier->create( $plan );
				if ( is_array( $done ) ) {
					$done['record_history'] = static function () use ( $done, $lang ) {
						return EMCP_Tools_Polylang_History::record_created_post( $done, $lang );
					};
				}
				return $done;
			},
			static function ( array $done ) use ( $copier ) {
				return $copier->remove( (int) $done['target_id'], (int) $done['source_id'], (array) $done['group_before'], (array) $done['group_after'], (string) $done['resource_after_hash'] );
			}
		);
		if ( is_wp_error( $result ) ) {
			return self::without_result( $result );
		}
		$id                = (int) $result['target_id'];
		$change            = EMCP_Tools_Polylang_History::record_created_post( $result, $lang );
		$answer['post_id'] = $id;
		$answer['status']  = (string) get_post( $id )->post_status;
		$answer['edit_url']    = (string) get_edit_post_link( $id, 'raw' );
		$answer['preview_url'] = (string) get_permalink( $id );
		$answer['change']      = array( 'change_id' => $change, 'undo' => array( 'available' => '' !== $change ) );
		return $answer;
	}

	/** @return array|WP_Error */
	protected function op_set_status( array $args ) {
		$id     = (int) $args['post_id'];
		$status = (string) $args['status'];
		$post   = get_post( $id );
		$before = array(
			'post_status'   => (string) $post->post_status,
			'post_date'     => (string) ( $post->post_date ?? '' ),
			'post_date_gmt' => (string) ( $post->post_date_gmt ?? '' ),
		);
		$result = EMCP_Tools_Polylang_Sync_Guard::around(
			$id,
			array(),
			static function () use ( $id, $status, $before ) {
				do_action( 'emcp_tools_polylang_set_status', $id, $status );
				$updated = wp_update_post( array( 'ID' => $id, 'post_status' => $status ), true );
				if ( is_wp_error( $updated ) ) {
					return $updated;
				}
				/* translators: 1: post ID, 2: status. */
				$summary = sprintf( __( 'Polylang: post %1$d set to %2$s', 'emcp-tools' ), $id, $status );
				return array(
					'resource_after_hash' => EMCP_Tools_Change_Recorder::hash_created_resource( $id ),
					'record_history'      => static function () use ( $id, $before, $summary ) {
						return EMCP_Tools_Polylang_History::record_post_state( $id, $before, $summary );
					},
				);
			},
			static function ( array $done ) use ( $id, $before ) {
				if ( ! hash_equals( (string) $done['resource_after_hash'], EMCP_Tools_Change_Recorder::hash_created_resource( $id ) ) ) {
					return new WP_Error( 'conflict', __( 'The post changed again before its status could be reversed.', 'emcp-tools' ) );
				}
				return EMCP_Tools_Polylang_History::write_post_state( $id, $before );
			}
		);
		if ( is_wp_error( $result ) ) {
			return self::without_result( $result );
		}
		/* translators: 1: post ID, 2: status. */
		$change = EMCP_Tools_Polylang_History::record_post_state( $id, $before, sprintf( __( 'Polylang: post %1$d set to %2$s', 'emcp-tools' ), $id, $status ) );
		return array(
			'post_id' => $id,
			'status'  => (string) get_post( $id )->post_status,
			'url'     => (string) get_permalink( $id ),
			'change'  => array( 'change_id' => $change, 'undo' => array( 'available' => '' !== $change ) ),
		);
	}

	/** A guard error without the raw write result (closures and snapshots stay internal). */
	protected static function without_result( WP_Error $error ): WP_Error {
		$data = $error->get_error_data();
		if ( is_array( $data ) && array_key_exists( 'result', $data ) ) {
			unset( $data['result'] );
			return new WP_Error( $error->get_error_code(), $error->get_error_message(), $data );
		}
		return $error;
	}

	// Read handlers.

	protected static function url_mode( int $force_lang ): string {
		$modes = array( 0 => 'query', 1 => 'directory', 2 => 'subdomain', 3 => 'domain' );
		return $modes[ $force_lang ] ?? 'directory';
	}

	/** @return array */
	protected function op_get_setup( array $args ) {
		$api  = $this->api();
		$opts = $api->options();
		$types = array();
		foreach ( (array) get_post_types( array( 'public' => true ) ) as $type ) {
			if ( $api->is_translated_post_type( (string) $type ) ) {
				$types[] = (string) $type;
			}
		}
		$taxes = array();
		foreach ( (array) get_taxonomies( array( 'public' => true ) ) as $tax ) {
			if ( $api->is_translated_taxonomy( (string) $tax ) ) {
				$taxes[] = (string) $tax;
			}
		}
		return array(
			'languages'              => $api->languages(),
			'default_language'       => $api->default_lang(),
			'url_mode'               => self::url_mode( (int) ( $opts['force_lang'] ?? 1 ) ),
			'hide_default'           => ! empty( $opts['hide_default'] ),
			'rewrite'                => ! empty( $opts['rewrite'] ),
			'redirect_lang'          => ! empty( $opts['redirect_lang'] ),
			'browser'                => ! empty( $opts['browser'] ),
			'media_support'          => ! empty( $opts['media_support'] ),
			'translated_post_types'  => $types,
			'translated_taxonomies'  => $taxes,
			'sync'                   => array_values( (array) ( $opts['sync'] ?? array() ) ),
			'menu_locations'         => (array) ( $opts['nav_menus'] ?? array() ),
		);
	}

	/** @return array */
	protected function op_list_translations( array $args ) {
		$api = $this->api();
		if ( isset( $args['post_id'] ) ) {
			$id = (int) $args['post_id'];
			return array( 'post_id' => $id, 'lang' => $api->post_lang( $id ), 'translations' => $api->post_group( $id ) );
		}
		$id = (int) $args['term_id'];
		return array( 'term_id' => $id, 'lang' => $api->term_lang( $id ), 'translations' => $api->term_group( $id ) );
	}

	/** @return true|WP_Error */
	protected function known_language( string $lang ) {
		if ( in_array( $lang, array_column( $this->api()->languages(), 'slug' ), true ) ) {
			return true;
		}
		/* translators: %s: language slug. */
		return new WP_Error( 'unknown_language', sprintf( __( 'There is no language "%s". get-setup lists the languages.', 'emcp-tools' ), $lang ) );
	}

	/** @return array|WP_Error */
	protected function op_find_missing( array $args ) {
		$lang  = (string) $args['lang'];
		$known = $this->known_language( $lang );
		if ( is_wp_error( $known ) ) {
			return $known;
		}
		$api      = $this->api();
		$type     = (string) ( $args['post_type'] ?? 'page' );
		$ids      = $api->post_ids( $type, (string) ( $args['status'] ?? 'publish' ), self::SCAN_CAP );
		$missing  = array();
		foreach ( $ids as $id ) {
			$own = $api->post_lang( $id );
			if ( '' !== $own && $lang !== $own && 0 === $api->post_translation( $id, $lang ) ) {
				$missing[] = array( 'post_id' => $id, 'title' => (string) get_post( $id )->post_title, 'lang' => $own );
			}
		}
		$per_page = min( 100, max( 1, (int) ( $args['per_page'] ?? 20 ) ) );
		$page     = max( 1, (int) ( $args['page'] ?? 1 ) );
		$out      = array(
			'lang'      => $lang,
			'post_type' => $type,
			'total'     => count( $missing ),
			'page'      => $page,
			'per_page'  => $per_page,
			'items'     => array_slice( $missing, ( $page - 1 ) * $per_page, $per_page ),
		);
		if ( count( $ids ) >= self::SCAN_CAP ) {
			/* translators: %d: number of posts. */
			$out['note'] = sprintf( __( 'Only the first %d posts of this type were checked.', 'emcp-tools' ), self::SCAN_CAP );
		}
		return $out;
	}

	/** @return array|WP_Error */
	protected function op_get_page_text( array $args ) {
		return EMCP_Tools_Page_Text::extract( (int) $args['post_id'], isset( $args['cursor'] ) ? (string) $args['cursor'] : null, (int) ( $args['limit'] ?? EMCP_Tools_Page_Text::MAX_LIMIT ) );
	}

	/** @return array|WP_Error */
	protected function op_apply_page_text( array $args ) {
		return EMCP_Tools_Page_Text::apply( (int) $args['post_id'], (string) $args['based_on'], (array) $args['segments'], ! empty( $args['force'] ) );
	}

	/** @return array */
	protected function op_list_strings( array $args ) {
		$api   = $this->api();
		$langs = isset( $args['lang'] ) ? array( (string) $args['lang'] ) : array_column( $api->languages(), 'slug' );
		$rows  = array();
		foreach ( $api->strings() as $s ) {
			$rows[ $s['string'] ] = $s + array( 'translations' => array() );
		}
		$tables = array();
		foreach ( $langs as $lang ) {
			$tables[ $lang ] = $api->string_table( $lang );
			foreach ( array_keys( $tables[ $lang ] ) as $original ) {
				if ( ! isset( $rows[ $original ] ) ) {
					$rows[ $original ] = array( 'string' => (string) $original, 'name' => '', 'group' => '', 'multiline' => false, 'translations' => array() );
				}
			}
		}
		foreach ( $rows as $original => &$row ) {
			foreach ( $langs as $lang ) {
				$row['translations'][ $lang ] = $tables[ $lang ][ $original ] ?? '';
			}
		}
		unset( $row );
		$rows   = array_values( $rows );
		$search = isset( $args['search'] ) ? strtolower( (string) $args['search'] ) : '';
		$group  = isset( $args['group'] ) ? (string) $args['group'] : '';
		$rows   = array_values(
			array_filter(
				$rows,
				static function ( $r ) use ( $search, $group ) {
					return ( '' === $group || $group === $r['group'] ) && ( '' === $search || false !== strpos( strtolower( $r['string'] . ' ' . $r['name'] ), $search ) );
				}
			)
		);
		$page = max( 1, (int) ( $args['page'] ?? 1 ) );
		return array(
			'total'        => count( $rows ),
			'page'         => $page,
			'strings'      => array_slice( $rows, ( $page - 1 ) * 100, 100 ),
			'context_note' => __( 'Strings that themes, widgets and plugins register appear here only after a wp-admin page load has registered them. Strings already in a language table are always listed.', 'emcp-tools' ),
		);
	}
}
