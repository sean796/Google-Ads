<?php
/**
 * The exact rows and posts a FunnelKit write can touch: resolved, read, fingerprinted and restored.
 *
 * @package EMCP_Tools
 * @since   3.19.0
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/** Thrown when the state to restore no longer matches what the write left. */
class EMCP_Tools_FunnelKit_Conflict extends RuntimeException {}

/** @since 3.19.0 */
class EMCP_Tools_FunnelKit_Graph {

	/**
	 * Child tables that hold a record's own metadata (key/value rows, field values). FunnelKit adds
	 * rows here as bookkeeping on a write (bwf_funnelmeta _last_updated_on on a funnel's first save),
	 * so a new row in one belongs to the write on its parent; new records anywhere else must be
	 * reported by FunnelKit (created-ids.php).
	 */
	const META_TABLES = array( 'bwf_funnelmeta', 'bwfan_automationmeta', 'bwf_contact_meta', 'bwf_contact_fields' );

	/** Post meta that changes on its own and never counts as a conflict. */
	const VOLATILE_META = array( '_edit_lock', '_edit_last' );

	/**
	 * Post fields that make up a post's state, and that a reinserted post must get back:
	 * owner and password protection included, or undoing a delete would publish a protected
	 * page openly under the user who clicked Undo.
	 */
	const POST_FIELDS = array( 'post_title', 'post_name', 'post_status', 'post_content', 'post_excerpt', 'post_parent', 'menu_order', 'post_type', 'post_author', 'post_password', 'post_date', 'post_date_gmt', 'comment_status', 'ping_status', 'post_mime_type' );

	/** Experiment control-step column (pinned by Task 1's linkage.json). The step list is the funnel row's `steps` column. */
	const EXPERIMENT_CONTROL = 'control';

	const SCOPES = array(
	// A funnel: its row, its meta, and every post in it (steps, substeps such as order bumps and offers).
	'funnel'       => array(
		'root'     => array( 'bwf_funnels', 'id' ),
		'children' => array( array( 'bwf_funnelmeta', 'bwf_funnel_id', 'meta_id' ) ),
		'posts'    => 'funnel',
	),
	// A step resolves to its funnel before the write: deleting a step also deletes its substeps and edits the funnel's step list.
	'step'         => array( 'via' => 'funnel_of_post' ),
	// An experiment's row plus the funnel of its control step (variants are step posts in that funnel).
	'experiment'   => array( 'root' => array( 'bwf_ab_experiments', 'id' ), 'also' => array( 'funnel' => 'funnel_of_experiment' ) ),
	'automation'   => array(
		'root'     => array( 'bwfan_automations', 'ID' ),
		'children' => array( array( 'bwfan_automationmeta', 'bwfan_automation_id', 'ID' ), array( 'bwfan_automation_step', 'aid', 'ID' ) ),
	),
	'contact'      => array(
		'root'     => array( 'bwf_contact', 'id' ),
		'children' => array( array( 'bwf_contact_meta', 'contact_id', 'meta_id' ), array( 'bwf_contact_fields', 'cid', 'ID' ), array( 'bwfan_contact_note', 'cid', 'id' ) ),
	),
	'term'         => array( 'root' => array( 'bwfan_terms', 'ID' ) ),
	'field'        => array( 'root' => array( 'bwfan_fields', 'ID' ) ),
	'field_group'  => array( 'root' => array( 'bwfan_field_groups', 'ID' ) ),
	'note'         => array( 'root' => array( 'bwfan_contact_note', 'id' ) ),
	'broadcast'    => array( 'root' => array( 'bwfan_broadcast', 'id' ) ),
	'template'     => array( 'root' => array( 'bwfan_templates', 'ID' ) ),
	'form_feed'    => array( 'root' => array( 'bwfan_form_feeds', 'ID' ) ),
	'link_trigger' => array( 'root' => array( 'bwfan_link_triggers', 'ID' ) ),
	'bulk_action'  => array( 'root' => array( 'bwfan_bulk_action', 'ID' ) ),
	'settings'     => array( 'option' => 'bwfan_global_settings' ),
);

	/** Primary key of a scope table (root or child). */
	public static function pk_of( string $table ): string {
		foreach ( self::SCOPES as $def ) {
			if ( isset( $def['root'] ) && $def['root'][0] === $table ) {
				return $def['root'][1];
			}
			foreach ( (array) ( $def['children'] ?? array() ) as $child ) {
				if ( $child[0] === $table ) {
					return $child[2];
				}
			}
		}
		throw new InvalidArgumentException( 'Unknown FunnelKit table.' );
	}

	/**
	 * Base scopes and keys a scope covers, resolved now (before the write).
	 *
	 * @return array<int,array{0:string,1:int}>
	 */
	public function resolve( string $scope, int $key ): array {
		$def = self::SCOPES[ $scope ] ?? null;
		if ( null === $def || $key <= 0 && ! isset( $def['option'] ) ) {
			throw new InvalidArgumentException( 'Unknown scope or key.' );
		}
		if ( isset( $def['via'] ) ) {
			$funnel = (int) call_user_func( array( $this, $def['via'] ), $key );
			if ( $funnel <= 0 ) {
				throw new RuntimeException( __( 'Could not find the funnel this step belongs to, so undo would be incomplete.', 'emcp-tools' ) );
			}
			return array( array( 'funnel', $funnel ) );
		}
		$parts = array( array( $scope, $key ) );
		foreach ( (array) ( $def['also'] ?? array() ) as $also => $resolver ) {
			$also_key = (int) call_user_func( array( $this, $resolver ), $key );
			if ( $also_key <= 0 ) {
				throw new RuntimeException( __( 'Could not find the funnel this experiment belongs to, so undo would be incomplete.', 'emcp-tools' ) );
			}
			$parts[] = array( $also, $also_key );
		}
		return $parts;
	}

	public function funnel_of_post( int $post_id ): int {
		$funnel = (int) get_post_meta( $post_id, '_bwf_in_funnel', true );
		if ( 0 === $funnel && 'wfocu_offer' === get_post_type( $post_id ) ) {
			// An offer carries no _bwf_in_funnel; its _funnel_id is the upsell step that lists it.
			$funnel = (int) get_post_meta( (int) get_post_meta( $post_id, '_funnel_id', true ), '_bwf_in_funnel', true );
		}
		return $funnel;
	}

	public function funnel_of_experiment( int $experiment_id ): int {
		$rows = EMCP_Tools_FunnelKit_Rows::get()->select( 'bwf_ab_experiments', 'id', array( $experiment_id ) );
		return $rows ? $this->funnel_of_post( (int) ( $rows[0][ self::EXPERIMENT_CONTROL ] ?? 0 ) ) : 0;
	}

	/** Every table a set of parts touches, for the transaction check. @return string[] */
	public function tables( array $parts ): array {
		$tables = array();
		foreach ( $parts as $part ) {
			$def = self::SCOPES[ $part[0] ];
			if ( isset( $def['option'] ) ) {
				$tables[] = 'options';
				continue;
			}
			$tables[] = $def['root'][0];
			foreach ( (array) ( $def['children'] ?? array() ) as $child ) {
				$tables[] = $child[0];
			}
			if ( isset( $def['posts'] ) ) {
				array_push( $tables, 'posts', 'postmeta', 'term_relationships' );
			}
		}
		return array_values( array_unique( $tables ) );
	}

	/** Whether every table can roll back a failed restore. */
	public function transactional( array $parts ): bool {
		$rows = EMCP_Tools_FunnelKit_Rows::get();
		foreach ( $this->tables( $parts ) as $table ) {
			if ( 'innodb' !== strtolower( $rows->engine( $table ) ) ) {
				return false;
			}
		}
		return true;
	}

	/** @return array{rows:array,posts:array,option?:mixed} */
	public function read( array $parts, bool $lock = false ): array {
		$graph = array( 'rows' => array(), 'posts' => array() );
		$rows  = EMCP_Tools_FunnelKit_Rows::get();
		foreach ( $parts as $part ) {
			list( $scope, $key ) = $part;
			$def = self::SCOPES[ $scope ];
			if ( isset( $def['option'] ) ) {
				$graph['option'] = $rows->option( (string) $def['option'], $lock );
				continue;
			}
			list( $table, $pk ) = $def['root'];
			foreach ( $rows->select( $table, $pk, array( $key ), $lock ) as $row ) {
				$graph['rows'][ $table ][ (string) $row[ $pk ] ] = $row;
			}
			foreach ( (array) ( $def['children'] ?? array() ) as $child ) {
				list( $ctable, $fk, $cpk ) = $child;
				foreach ( $rows->select( $ctable, $fk, array( $key ), $lock ) as $row ) {
					$graph['rows'][ $ctable ][ (string) $row[ $cpk ] ] = $row;
				}
			}
			if ( 'funnel' === ( $def['posts'] ?? '' ) ) {
				$ids = array_merge( $rows->funnel_post_ids( (int) $key, $lock ), self::step_list_ids( $graph['rows']['bwf_funnels'][ (string) $key ] ?? array() ) );
				$ids = array_values( array_unique( array_map( 'intval', $ids ) ) );
				$ids = array_values( array_unique( array_merge( $ids, self::offer_ids( $ids ) ) ) );
				if ( $lock ) {
					$rows->lock_posts( $ids );
				}
				foreach ( $ids as $id ) {
					if ( $lock ) {
						clean_post_cache( $id );
					}
					$state = self::post_state( $id );
					if ( null !== $state ) {
						$graph['posts'][ (string) $id ] = $state;
					}
				}
			}
		}
		ksort( $graph['posts'] );
		return $graph;
	}

	/** @return int[] Step and substep IDs in a funnel row's `steps` column (JSON: [{type, id, substeps: {type: [ids]}}]). */
	private static function step_list_ids( array $funnel_row ): array {
		$steps = $funnel_row['steps'] ?? '';
		$steps = is_string( $steps ) ? json_decode( $steps, true ) : $steps;
		$ids   = array();
		foreach ( (array) $steps as $step ) {
			$ids[] = (int) ( $step['id'] ?? 0 );
			foreach ( (array) ( $step['substeps'] ?? array() ) as $sub_ids ) {
				foreach ( (array) $sub_ids as $sub ) {
					$ids[] = (int) ( is_array( $sub ) ? ( $sub['id'] ?? 0 ) : $sub );
				}
			}
		}
		return array_values( array_filter( $ids ) );
	}

	/** @return int[] Offers listed in the `_funnel_steps` meta of upsell steps (offers are in neither _bwf_in_funnel nor the steps column). */
	private static function offer_ids( array $post_ids ): array {
		$ids = array();
		foreach ( $post_ids as $id ) {
			foreach ( (array) get_post_meta( (int) $id, '_funnel_steps', true ) as $offer ) {
				$ids[] = (int) ( is_array( $offer ) ? ( $offer['id'] ?? 0 ) : 0 );
			}
		}
		return array_values( array_filter( $ids ) );
	}

	/** @return array|null Normalized post state, or null when the post does not exist. */
	public static function post_state( int $id ): ?array {
		$post = get_post( $id );
		if ( ! $post ) {
			return null;
		}
		$fields = array();
		foreach ( self::POST_FIELDS as $f ) {
			$fields[ $f ] = isset( $post->$f ) ? (string) $post->$f : '';
		}
		$meta = array();
		foreach ( (array) get_post_meta( $id ) as $k => $values ) {
			if ( ! in_array( $k, self::VOLATILE_META, true ) ) {
				$meta[ $k ] = array_values( array_map( 'strval', (array) $values ) );
			}
		}
		ksort( $meta );
		$terms = array();
		foreach ( get_object_taxonomies( $fields['post_type'] ) as $tax ) {
			$t = wp_get_object_terms( $id, $tax, array( 'fields' => 'ids' ) );
			if ( ! is_wp_error( $t ) && $t ) {
				$terms[ $tax ] = array_map( 'intval', $t );
				sort( $terms[ $tax ] );
			}
		}
		ksort( $terms );
		return array( 'fields' => $fields, 'meta' => $meta, 'terms' => $terms );
	}

	/** @return array{rows:array<string,string[]>,posts:string[]} */
	public static function members( array $graph ): array {
		$rows = array();
		foreach ( $graph['rows'] as $table => $list ) {
			$rows[ $table ] = array_map( 'strval', array_keys( $list ) );
			sort( $rows[ $table ] );
		}
		ksort( $rows );
		$posts = array_map( 'strval', array_keys( $graph['posts'] ) );
		sort( $posts );
		return array( 'rows' => $rows, 'posts' => $posts );
	}

	public static function fingerprint( array $graph ): string {
		return hash( 'sha256', (string) wp_json_encode( self::canonical( $graph ) ) );
	}

	/**
	 * Restore $parts to $target in one transaction, under row locks.
	 *
	 * @param string|null $expected Fingerprint the locked current state must have (null: forced).
	 * @throws EMCP_Tools_FunnelKit_Conflict When the current state is not $expected.
	 * @throws RuntimeException On any failed write or failed verification. The graph is left unchanged.
	 */
	public function restore( array $parts, array $target, ?string $expected ): void {
		if ( ! $this->transactional( $parts ) ) {
			throw new RuntimeException( 'not_transactional' );
		}
		$touched = array();
		try {
			EMCP_Tools_FunnelKit_Rows::get()->transaction(
				function () use ( $parts, $target, $expected, &$touched ) {
					$now = $this->read( $parts, true );
					if ( null !== $expected && ! hash_equals( $expected, self::fingerprint( $now ) ) ) {
						throw new EMCP_Tools_FunnelKit_Conflict( 'conflict' );
					}
					$this->apply( $now, $target, $touched );
					$check = $this->read( $parts, true );
					if ( ! hash_equals( self::fingerprint( $target ), self::fingerprint( $check ) ) ) {
						throw new RuntimeException( __( 'The restored state did not match the recorded state. Nothing was changed.', 'emcp-tools' ) );
					}
				}
			);
		} finally {
			foreach ( array_keys( $touched ) as $id ) {
				clean_post_cache( (int) $id );
			}
			EMCP_Tools_FunnelKit_Rows::forget_option( (string) self::SCOPES['settings']['option'] );
		}
	}

	/** Make $now equal to $target. Every write is checked. */
	private function apply( array $now, array $target, array &$touched ): void {
		$rows = EMCP_Tools_FunnelKit_Rows::get();
		foreach ( $now['rows'] as $table => $list ) {
			$extra = array_diff( array_map( 'strval', array_keys( $list ) ), array_map( 'strval', array_keys( $target['rows'][ $table ] ?? array() ) ) );
			$rows->delete( $table, self::pk_of( $table ), $extra );
		}
		foreach ( $target['rows'] as $table => $list ) {
			foreach ( $list as $pk => $row ) {
				if ( ( $now['rows'][ $table ][ $pk ] ?? null ) != $row ) { // phpcs:ignore Universal.Operators.StrictComparisons
					$rows->replace( $table, $row );
				}
			}
		}
		foreach ( array_diff( array_keys( $now['posts'] ), array_keys( $target['posts'] ) ) as $id ) {
			$touched[ $id ] = true;
			// FunnelKit's own before_delete_post hooks delete children (an upsell step's offers), so a post can be gone already.
			clean_post_cache( (int) $id );
			if ( ! get_post( (int) $id ) ) {
				continue;
			}
			if ( ! wp_delete_post( (int) $id, true ) ) {
				throw new RuntimeException( sprintf( 'Could not delete post %d.', (int) $id ) );
			}
		}
		foreach ( $target['posts'] as $id => $state ) {
			if ( ( $now['posts'][ $id ] ?? null ) === $state ) {
				continue;
			}
			$touched[ $id ] = true;
			self::write_post( (int) $id, $state, isset( $now['posts'][ $id ] ) );
		}
		if ( array_key_exists( 'option', $target ) && $target['option'] !== ( $now['option'] ?? null ) ) {
			$rows->write_option( (string) self::SCOPES['settings']['option'], $target['option'] );
		}
	}

	private static function write_post( int $id, array $state, bool $exists ): void {
		$fields = $state['fields'];
		if ( $exists ) {
			$fields['ID'] = $id;
			$result       = wp_update_post( wp_slash( $fields ), true );
		} else {
			$fields['import_id'] = $id;
			$result              = wp_insert_post( wp_slash( $fields ), true );
		}
		if ( is_wp_error( $result ) || (int) $result !== $id ) {
			throw new RuntimeException( sprintf( 'Could not restore post %d.', $id ) );
		}
		foreach ( array_keys( (array) get_post_meta( $id ) ) as $k ) {
			if ( ! in_array( $k, self::VOLATILE_META, true ) && ! delete_post_meta( $id, $k ) ) {
				throw new RuntimeException( sprintf( 'Could not clear meta %s on post %d.', $k, $id ) );
			}
		}
		foreach ( $state['meta'] as $k => $values ) {
			foreach ( $values as $v ) {
				if ( ! add_post_meta( $id, $k, wp_slash( maybe_unserialize( $v ) ) ) ) {
					throw new RuntimeException( sprintf( 'Could not restore meta %s on post %d.', $k, $id ) );
				}
			}
		}
		foreach ( $state['terms'] as $tax => $ids ) {
			if ( is_wp_error( wp_set_object_terms( $id, $ids, $tax ) ) ) {
				throw new RuntimeException( sprintf( 'Could not restore %s terms on post %d.', $tax, $id ) );
			}
		}
	}

	private static function canonical( $value ) {
		if ( is_array( $value ) ) {
			ksort( $value );
			return array_map( array( __CLASS__, 'canonical' ), $value );
		}
		return null === $value ? null : ( is_scalar( $value ) ? (string) $value : $value );
	}
}
