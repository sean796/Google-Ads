<?php
/**
 * Checked access to FunnelKit's own tables for History. Every failure throws.
 *
 * @package EMCP_Tools
 * @since   3.19.0
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/** @since 3.19.0 */
class EMCP_Tools_FunnelKit_Rows {

	/** @var EMCP_Tools_FunnelKit_Rows|null */
	private static $instance = null;

	public static function get(): EMCP_Tools_FunnelKit_Rows {
		return self::$instance ?? ( self::$instance = new self() );
	}

	/** Replace the gateway (tests); null restores the real one. */
	public static function use( ?EMCP_Tools_FunnelKit_Rows $rows ): void {
		self::$instance = $rows;
	}

	/** Full table name: a FunnelKit short name, or one of the core tables History reads. */
	private static function table( string $short ): string {
		global $wpdb;
		$core = array( 'posts' => $wpdb->posts, 'postmeta' => $wpdb->postmeta, 'term_relationships' => $wpdb->term_relationships, 'options' => $wpdb->options );
		if ( isset( $core[ $short ] ) ) {
			return $core[ $short ];
		}
		if ( ! preg_match( '/^(bwf_|bwfan_)[a-z_]+$/', $short ) ) {
			throw new InvalidArgumentException( 'Not a FunnelKit table.' );
		}
		return $wpdb->prefix . $short;
	}

	private static function column( string $column ): string {
		if ( ! preg_match( '/^[A-Za-z_]+$/', $column ) ) {
			throw new InvalidArgumentException( 'Bad column.' );
		}
		return $column;
	}

	private static function fail_on_error(): void {
		global $wpdb;
		if ( '' !== (string) $wpdb->last_error ) {
			throw new RuntimeException( (string) $wpdb->last_error );
		}
	}

	/** @return array<int,array<string,mixed>> */
	public function select( string $table, string $column, array $values, bool $lock = false ): array {
		global $wpdb;
		$values = array_values( array_unique( array_map( 'strval', $values ) ) );
		if ( ! $values ) {
			return array();
		}
		$in   = implode( ',', array_fill( 0, count( $values ), '%s' ) );
		$sql  = 'SELECT * FROM `' . self::table( $table ) . '` WHERE `' . self::column( $column ) . "` IN ($in)" . ( $lock ? ' FOR UPDATE' : '' );
		$rows = $wpdb->get_results( $wpdb->prepare( $sql, $values ), ARRAY_A ); // phpcs:ignore WordPress.DB.PreparedSQL.NotPrepared
		self::fail_on_error();
		return is_array( $rows ) ? $rows : array();
	}

	public function replace( string $table, array $row ): void {
		global $wpdb;
		if ( false === $wpdb->replace( self::table( $table ), $row ) ) {
			throw new RuntimeException( 'Could not write a row to ' . $table . ': ' . $wpdb->last_error );
		}
	}

	public function delete( string $table, string $pk, array $ids ): void {
		global $wpdb;
		$ids = array_values( array_unique( array_map( 'strval', $ids ) ) );
		if ( ! $ids ) {
			return;
		}
		$in = implode( ',', array_fill( 0, count( $ids ), '%s' ) );
		if ( false === $wpdb->query( $wpdb->prepare( 'DELETE FROM `' . self::table( $table ) . '` WHERE `' . self::column( $pk ) . "` IN ($in)", $ids ) ) ) { // phpcs:ignore WordPress.DB.PreparedSQL.NotPrepared
			throw new RuntimeException( 'Could not delete rows from ' . $table . ': ' . $wpdb->last_error );
		}
	}

	/** Highest primary key in a table ('posts' for the posts table). Used only to reject IDs that existed before a write. */
	public function max_id( string $table ): int {
		global $wpdb;
		$pk  = 'posts' === $table ? 'ID' : EMCP_Tools_FunnelKit_Graph::pk_of( $table );
		$max = $wpdb->get_var( 'SELECT MAX(`' . self::column( $pk ) . '`) FROM `' . self::table( $table ) . '`' ); // phpcs:ignore WordPress.DB.PreparedSQL.NotPrepared
		self::fail_on_error();
		return (int) $max;
	}

	/** Lock posts and their meta rows for the rest of the transaction. */
	public function lock_posts( array $ids ): void {
		global $wpdb;
		$ids = array_values( array_unique( array_filter( array_map( 'intval', $ids ) ) ) );
		if ( ! $ids ) {
			return;
		}
		$in = implode( ',', array_fill( 0, count( $ids ), '%d' ) );
		$wpdb->get_col( $wpdb->prepare( "SELECT ID FROM {$wpdb->posts} WHERE ID IN ($in) FOR UPDATE", $ids ) ); // phpcs:ignore
		self::fail_on_error();
		$wpdb->get_col( $wpdb->prepare( "SELECT meta_id FROM {$wpdb->postmeta} WHERE post_id IN ($in) FOR UPDATE", $ids ) ); // phpcs:ignore
		self::fail_on_error();
	}

	/** @return int[] Posts whose _bwf_in_funnel is $funnel_id; with $lock, the matching meta range is locked (next-key locks also block new matches). */
	public function funnel_post_ids( int $funnel_id, bool $lock ): array {
		global $wpdb;
		$ids = $wpdb->get_col( $wpdb->prepare( "SELECT post_id FROM {$wpdb->postmeta} WHERE meta_key = '_bwf_in_funnel' AND meta_value = %s" . ( $lock ? ' FOR UPDATE' : '' ), (string) $funnel_id ) ); // phpcs:ignore
		self::fail_on_error();
		return array_map( 'intval', (array) $ids );
	}

	/** An option row read directly (no cache), optionally locked. @return array{exists:bool,value:mixed} */
	public function option( string $name, bool $lock ): array {
		global $wpdb;
		$raw = $wpdb->get_var( $wpdb->prepare( "SELECT option_value FROM {$wpdb->options} WHERE option_name = %s" . ( $lock ? ' FOR UPDATE' : '' ), $name ) ); // phpcs:ignore
		self::fail_on_error();
		return null === $raw ? array( 'exists' => false, 'value' => null ) : array( 'exists' => true, 'value' => maybe_unserialize( $raw ) );
	}

	/** Restore an option to {exists, value}, through WordPress (so its hooks run), with every cache that could hide the row cleared. */
	public function write_option( string $name, array $state ): void {
		self::forget_option( $name );
		if ( $state['exists'] ) {
			$ok = update_option( $name, $state['value'] ) || maybe_serialize( $this->option( $name, false )['value'] ) === maybe_serialize( $state['value'] );
		} else {
			$ok = delete_option( $name ) || ! $this->option( $name, false )['exists'];
		}
		self::forget_option( $name );
		if ( ! $ok ) {
			throw new RuntimeException( 'Could not restore ' . $name . '.' );
		}
	}

	/** Drop every cached copy of an option: its own entry, the autoloaded set and the missing-options list. */
	public static function forget_option( string $name ): void {
		wp_cache_delete( $name, 'options' );
		wp_cache_delete( 'alloptions', 'options' );
		wp_cache_delete( 'notoptions', 'options' );
	}

	/** Storage engine of a table. */
	public function engine( string $table ): string {
		global $wpdb;
		$engine = $wpdb->get_var( $wpdb->prepare( 'SELECT ENGINE FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = %s', self::table( $table ) ) );
		self::fail_on_error();
		return (string) $engine;
	}

	/**
	 * Run $fn in one transaction: commit on return, roll back on any throw.
	 *
	 * @return mixed What $fn returns.
	 */
	public function transaction( callable $fn ) {
		global $wpdb;
		if ( false === $wpdb->query( 'START TRANSACTION' ) ) {
			throw new RuntimeException( 'Could not start a transaction: ' . $wpdb->last_error );
		}
		try {
			$out = $fn();
		} catch ( Throwable $e ) {
			$wpdb->query( 'ROLLBACK' );
			throw $e;
		}
		if ( false === $wpdb->query( 'COMMIT' ) ) {
			$wpdb->query( 'ROLLBACK' );
			throw new RuntimeException( 'Could not commit: ' . $wpdb->last_error );
		}
		return $out;
	}
}
