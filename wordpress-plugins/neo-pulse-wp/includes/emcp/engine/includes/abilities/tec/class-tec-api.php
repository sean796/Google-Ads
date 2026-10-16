<?php
/**
 * The only class that touches The Events Calendar (spec 4.3): TEC's ORM (every query by id with
 * status => any, spike item 14), raw state reads, the custom-table row behind an event's dates
 * (D11), and the direct restores the spec allows (D2). Unit tests swap in Fake_TEC_Api.
 *
 * @package EMCP_Tools
 * @since   3.19.0
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/** @since 3.19.0 */
class EMCP_Tools_TEC_Api {

	const EVENT     = 'tribe_events';
	const VENUE     = 'tribe_venue';
	const ORGANIZER = 'tribe_organizer';
	const CATEGORY  = 'tribe_events_cat';

	/** EMCP's object kinds and their post types. */
	const TYPES = array(
		'event'     => self::EVENT,
		'venue'     => self::VENUE,
		'organizer' => self::ORGANIZER,
	);

	/**
	 * EMCP field => [store, key, ORM alias, kind]. Store: post (a post field), meta (one meta row),
	 * metas (every row of the key), term (a taxonomy). Kind: text, bool, int, ints, terms, date.
	 * The one table a TEC rename touches (spec 4.4).
	 */
	const EVENT_FIELDS = array(
		'title'              => array( 'post', 'post_title', 'title', 'text' ),
		'content'            => array( 'post', 'post_content', 'content', 'text' ),
		'excerpt'            => array( 'post', 'post_excerpt', 'excerpt', 'text' ),
		'status'             => array( 'post', 'post_status', 'status', 'enum' ),
		'start_date'         => array( 'meta', '_EventStartDate', 'start_date', 'date' ),
		'end_date'           => array( 'meta', '_EventEndDate', 'end_date', 'date' ),
		'timezone'           => array( 'meta', '_EventTimezone', 'timezone', 'enum' ),
		'all_day'            => array( 'meta', '_EventAllDay', 'all_day', 'bool' ),
		'cost'               => array( 'meta', '_EventCost', 'cost', 'text' ),
		'currency_symbol'    => array( 'meta', '_EventCurrencySymbol', 'currency_symbol', 'text' ),
		'currency_position'  => array( 'meta', '_EventCurrencyPosition', 'currency_position', 'enum' ),
		'website'            => array( 'meta', '_EventURL', 'url', 'text' ),
		'featured_image'     => array( 'meta', '_thumbnail_id', 'image', 'int' ),
		'featured'           => array( 'meta', '_tribe_featured', 'featured', 'bool' ),
		'hide_from_upcoming' => array( 'meta', '_EventHideFromUpcoming', 'hide_from_upcoming', 'bool' ),
		'show_map'           => array( 'meta', '_EventShowMap', 'show_map', 'bool' ),
		'show_map_link'      => array( 'meta', '_EventShowMapLink', 'show_map_link', 'bool' ),
		'venue_id'           => array( 'meta', '_EventVenueID', 'venue', 'int' ),
		'organizer_ids'      => array( 'metas', '_EventOrganizerID', 'organizer', 'ints' ),
		'categories'         => array( 'term', self::CATEGORY, 'category', 'terms' ),
		'tags'               => array( 'term', 'post_tag', 'tag', 'terms' ),
	);

	const VENUE_FIELDS = array(
		'title'          => array( 'post', 'post_title', 'venue', 'text' ),
		'content'        => array( 'post', 'post_content', 'content', 'text' ),
		'status'         => array( 'post', 'post_status', 'status', 'enum' ),
		'address'        => array( 'meta', '_VenueAddress', 'address', 'text' ),
		'city'           => array( 'meta', '_VenueCity', 'city', 'text' ),
		'state_province' => array( 'meta', '_VenueStateProvince', 'state_province', 'text' ),
		'zip'            => array( 'meta', '_VenueZip', 'zip', 'text' ),
		'country'        => array( 'meta', '_VenueCountry', 'country', 'text' ),
		'phone'          => array( 'meta', '_VenuePhone', 'phone', 'text' ),
		'website'        => array( 'meta', '_VenueURL', 'website', 'text' ),
		'show_map'       => array( 'meta', '_VenueShowMap', 'show_map', 'bool' ),
		'show_map_link'  => array( 'meta', '_VenueShowMapLink', 'show_map_link', 'bool' ),
	);

	const ORGANIZER_FIELDS = array(
		'title'   => array( 'post', 'post_title', 'organizer', 'text' ),
		'content' => array( 'post', 'post_content', 'content', 'text' ),
		'status'  => array( 'post', 'post_status', 'status', 'enum' ),
		'phone'   => array( 'meta', '_OrganizerPhone', 'phone', 'text' ),
		'email'   => array( 'meta', '_OrganizerEmail', 'email', 'text' ),
		'website' => array( 'meta', '_OrganizerWebsite', 'website', 'text' ),
	);

	/** Event status (spike item 27). */
	const STATUS_KEY = '_tribe_events_status';
	const REASON_KEY = '_tribe_events_status_reason';

	/**
	 * Values that change on their own and never enter a version (spike item 19).
	 * _tribe_ignored_event_previous_status: TEC's Ignored Events hook writes it on every event
	 * trash (wp_trash_post) and an untrash leaves it behind (found by the live smoke).
	 */
	const VOLATILE = array( 'post_modified', 'post_modified_gmt', 'post_date', 'post_date_gmt', '_tribe_modified_fields', '_edit_lock', '_edit_last', '_wp_old_slug', '_wp_old_date', '_EventTimezoneAbbr', '_tribe_ignored_event_previous_status' );

	/** @return array<string,array> the field table of a kind */
	public static function field_map( string $kind ): array {
		switch ( $kind ) {
			case 'venue':
				return self::VENUE_FIELDS;
			case 'organizer':
				return self::ORGANIZER_FIELDS;
		}
		return self::EVENT_FIELDS;
	}

	// Environment.

	public function active(): bool {
		return class_exists( 'Tribe__Events__Main' );
	}

	public function version_string(): string {
		return class_exists( 'Tribe__Events__Main' ) ? (string) Tribe__Events__Main::VERSION : '';
	}

	/** TEC 6.x with its ORM (spec 3). */
	public function supported(): bool {
		$v = $this->version_string();
		return '' !== $v && version_compare( $v, '6.0', '>=' ) && version_compare( $v, '7.0', '<' ) && function_exists( 'tribe_events' );
	}

	/** @return array the settings get-setup reports */
	public function settings(): array {
		$get = static fn( string $k, $d ) => function_exists( 'tribe_get_option' ) ? tribe_get_option( $k, $d ) : $d;
		return array(
			'timezone_mode'       => (string) $get( 'tribe_events_timezone_mode', 'event' ),
			'site_timezone'       => class_exists( 'Tribe__Timezones' ) ? (string) Tribe__Timezones::wp_timezone_string() : (string) get_option( 'timezone_string' ),
			'views'               => array_values( (array) $get( 'tribeEnableViews', array( 'list', 'month', 'day' ) ) ),
			'default_view'        => (string) $get( 'viewOption', 'month' ),
			'events_per_page'     => (int) $get( 'postsPerPage', get_option( 'posts_per_page', 10 ) ),
			'date_with_year'      => (string) $get( 'dateWithYearFormat', 'F j, Y' ),
			'date_without_year'   => (string) $get( 'dateWithoutYearFormat', 'F j' ),
			'time_range_separator' => (string) $get( 'timeRangeSeparator', ' - ' ),
		);
	}

	// The ORM.

	/** @return object|null TEC's repository for a kind */
	protected function orm( string $kind ) {
		switch ( $kind ) {
			case 'venue':
				return function_exists( 'tribe_venues' ) ? tribe_venues() : null;
			case 'organizer':
				return function_exists( 'tribe_organizers' ) ? tribe_organizers() : null;
		}
		return function_exists( 'tribe_events' ) ? tribe_events() : null;
	}

	/** @return int|WP_Error */
	public function create( string $kind, array $args ) {
		$orm = $this->orm( $kind );
		if ( ! $orm ) {
			return new WP_Error( 'tec_unavailable', __( 'The Events Calendar is not loaded.', 'emcp-tools' ) );
		}
		list( $args, $meta ) = self::split_direct_meta( $args );
		try {
			$post = $orm->set_args( $args )->create();
		} catch ( \Throwable $e ) {
			return new WP_Error( 'tec_error', $e->getMessage() );
		}
		if ( ! $post instanceof WP_Post ) {
			return new WP_Error( 'save_failed', __( 'The Events Calendar did not create it.', 'emcp-tools' ) );
		}
		$this->write_direct_meta( (int) $post->ID, $meta );
		return (int) $post->ID;
	}

	/**
	 * ORM aliases the ORM itself mangles, written as meta beside it: the event repository allows
	 * only prefix and postfix as currency position and stores anything else as prefix, while TEC's
	 * editor saves and its views read prefix and suffix (found by the live smoke).
	 */
	const DIRECT_META = array( 'currency_position' => '_EventCurrencyPosition' );

	/** @return array{0: array, 1: array} the ORM arguments and the meta written beside them */
	public static function split_direct_meta( array $args ): array {
		$meta = array();
		foreach ( self::DIRECT_META as $alias => $key ) {
			if ( array_key_exists( $alias, $args ) ) {
				$meta[ $key ] = $args[ $alias ];
				unset( $args[ $alias ] );
			}
		}
		return array( $args, $meta );
	}

	protected function write_direct_meta( int $id, array $meta ): void {
		foreach ( $meta as $key => $value ) {
			update_post_meta( $id, $key, wp_slash( $value ) );
		}
		if ( $meta ) {
			clean_post_cache( $id );
		}
	}

	/** Always by id with status => any (spike item 14); success is decided by the read-back (D7). @return true|WP_Error */
	public function update( string $kind, int $id, array $args ) {
		$orm = $this->orm( $kind );
		if ( ! $orm ) {
			return new WP_Error( 'tec_unavailable', __( 'The Events Calendar is not loaded.', 'emcp-tools' ) );
		}
		list( $args, $meta ) = self::split_direct_meta( $args );
		try {
			if ( $args ) {
				$orm->by_args( array( 'id' => $id, 'status' => 'any' ) )->set_args( $args )->save();
			}
		} catch ( \Throwable $e ) {
			return new WP_Error( 'tec_error', $e->getMessage() );
		}
		$this->write_direct_meta( $id, $meta );
		clean_post_cache( $id );
		return true;
	}

	/**
	 * @param array $filters status (string[]), own_only_statuses (string[]: statuses matched only for
	 *                       posts of own_author, D21), own_author (int), search, start_after,
	 *                       end_before, category, venue_id, organizer_id, featured.
	 * @return array{ids: int[], total: int}
	 */
	public function query( string $kind, array $filters, int $page, int $per_page ): array {
		$orm = $this->orm( $kind );
		if ( ! $orm ) {
			return array( 'ids' => array(), 'total' => 0 );
		}
		global $wpdb;
		$statuses = array_values( array_unique( array_merge( (array) ( $filters['status'] ?? array( 'publish' ) ), (array) ( $filters['own_only_statuses'] ?? array() ) ) ) );
		$q        = $orm->by_args( array( 'status' => $statuses ) );
		if ( ! empty( $filters['search'] ) ) {
			$q = $q->search( (string) $filters['search'] );
		}
		if ( 'event' === $kind ) {
			if ( ! empty( $filters['start_after'] ) ) {
				$q = $q->where( 'starts_after', (string) $filters['start_after'] );
			}
			if ( ! empty( $filters['end_before'] ) ) {
				$q = $q->where( 'ends_before', (string) $filters['end_before'] );
			}
			if ( ! empty( $filters['category'] ) ) {
				$q = $q->where( 'category', (int) $filters['category'] );
			}
			if ( ! empty( $filters['venue_id'] ) ) {
				$q = $q->where( 'venue', (int) $filters['venue_id'] );
			}
			if ( ! empty( $filters['organizer_id'] ) ) {
				$q = $q->where( 'organizer', (int) $filters['organizer_id'] );
			}
			if ( isset( $filters['featured'] ) ) {
				$q = $q->where( 'featured', (bool) $filters['featured'] );
			}
			$q = $q->order_by( 'event_date', 'ASC' );
		} else {
			$q = $q->order_by( 'title', 'ASC' );
		}
		// D21: statuses the user may only see on their own posts, inside the query so the total is right.
		$own   = array_values( array_diff( (array) ( $filters['own_only_statuses'] ?? array() ), (array) ( $filters['status'] ?? array() ) ) );
		$where = null;
		if ( $own ) {
			$author = (int) ( $filters['own_author'] ?? 0 );
			$where  = static function ( $sql ) use ( $wpdb, $own, $author ) {
				$in = implode( ',', array_map( static fn( $s ) => "'" . esc_sql( $s ) . "'", $own ) );
				return $sql . $wpdb->prepare( " AND ( {$wpdb->posts}.post_status NOT IN ($in) OR {$wpdb->posts}.post_author = %d )", $author ); // phpcs:ignore WordPress.DB
			};
			add_filter( 'posts_where', $where, PHP_INT_MAX );
		}
		try {
			$q     = $q->per_page( $per_page )->page( $page );
			$total = (int) $q->found();
			$ids   = array_map( 'intval', (array) $q->fields( 'ids' )->all() );
		} finally {
			if ( $where ) {
				remove_filter( 'posts_where', $where, PHP_INT_MAX );
			}
		}
		return array( 'ids' => $ids, 'total' => $total );
	}

	// Raw state.

	/** @return array{post: array, meta: array, terms: array}|null the raw state of an event, venue or organizer */
	public function fields( int $id ): ?array {
		$p = $id > 0 ? get_post( $id ) : null;
		if ( ! $p || ! in_array( $p->post_type, self::TYPES, true ) ) {
			return null;
		}
		$post = array_intersect_key( $p->to_array(), array_flip( array( 'post_title', 'post_content', 'post_excerpt', 'post_status', 'post_name', 'post_author', 'post_date', 'post_date_gmt', 'post_parent', 'menu_order' ) ) );
		ksort( $post );
		$meta = array();
		foreach ( (array) get_post_meta( $id ) as $k => $values ) {
			if ( preg_match( '/^_(Event|Venue|Organizer|tribe_)/', $k ) || '_thumbnail_id' === $k ) {
				$meta[ $k ] = array_map( 'maybe_unserialize', (array) $values );
			}
		}
		ksort( $meta );
		$terms = array();
		if ( self::EVENT === $p->post_type ) {
			foreach ( array( self::CATEGORY, 'post_tag' ) as $tax ) {
				$ids = wp_get_object_terms( $id, $tax, array( 'fields' => 'ids' ) );
				$ids = is_array( $ids ) ? array_map( 'intval', $ids ) : array();
				sort( $ids );
				$terms[ $tax ] = $ids;
			}
		}
		return array( 'post' => $post, 'meta' => $meta, 'terms' => $terms );
	}

	/** @return array|null the event's row in TEC's custom tables (D11) */
	public function occurrence( int $id ): ?array {
		global $wpdb;
		$row = $wpdb->get_row( $wpdb->prepare( "SELECT e.start_date, e.end_date, e.start_date_utc, e.end_date_utc, e.timezone, e.duration FROM {$wpdb->prefix}tec_events e JOIN {$wpdb->prefix}tec_occurrences o ON o.event_id = e.event_id WHERE e.post_id = %d ORDER BY o.occurrence_id LIMIT 1", $id ), ARRAY_A ); // phpcs:ignore WordPress.DB
		return $row ? $row : null;
	}

	/** Events outside the trash that name a venue or organizer (D10). @return int[] */
	public function linked_events( int $id, string $kind ): array {
		global $wpdb;
		$key = 'venue' === $kind ? '_EventVenueID' : '_EventOrganizerID';
		$ids = $wpdb->get_col( $wpdb->prepare( "SELECT DISTINCT p.ID FROM {$wpdb->postmeta} m JOIN {$wpdb->posts} p ON p.ID = m.post_id WHERE m.meta_key = %s AND m.meta_value = %s AND p.post_type = %s AND p.post_status <> 'trash' ORDER BY p.ID", $key, (string) $id, self::EVENT ) ); // phpcs:ignore WordPress.DB
		return array_map( 'intval', (array) $ids );
	}

	/** Events Calendar Pro's recurrence (spec 11). */
	public function is_recurring( int $id ): bool {
		$r = get_post_meta( $id, '_EventRecurrence', true );
		return is_array( $r ) && ! empty( $r['rules'] );
	}

	/** TEC's own custom-table upsert from the meta (spike items 23, 31). */
	public function sync_dates( int $id ): bool {
		if ( ! class_exists( 'TEC\\Events\\Custom_Tables\\V1\\Updates\\Events' ) ) {
			return false;
		}
		clean_post_cache( $id );
		try {
			$ok = (bool) tribe( 'TEC\\Events\\Custom_Tables\\V1\\Updates\\Events' )->update( $id );
			if ( class_exists( 'TEC\\Events\\Custom_Tables\\V1\\Updates\\Meta_Watcher' ) ) {
				tribe( 'TEC\\Events\\Custom_Tables\\V1\\Updates\\Meta_Watcher' )->remove( $id );
			}
		} catch ( \Throwable $e ) {
			return false;
		}
		return $ok;
	}

	// Posts and access.

	public function can( string $cap, ...$args ): bool {
		return current_user_can( $cap, ...$args );
	}

	public function post_type( int $id ): string {
		$p = $id > 0 ? get_post( $id ) : null;
		return $p ? (string) $p->post_type : '';
	}

	public function post_status( int $id ): string {
		$p = $id > 0 ? get_post( $id ) : null;
		return $p ? (string) $p->post_status : '';
	}

	public function post_author( int $id ): int {
		$p = $id > 0 ? get_post( $id ) : null;
		return $p ? (int) $p->post_author : 0;
	}

	public function title( int $id ): string {
		$p = $id > 0 ? get_post( $id ) : null;
		return $p ? (string) $p->post_title : '';
	}

	public function url( int $id ): string {
		$u = get_permalink( $id );
		return is_string( $u ) ? $u : '';
	}

	/** TEC free registers venues and organizers as not publicly queryable; Events Calendar Pro gives them pages. */
	public function viewable( string $post_type ): bool {
		return is_post_type_viewable( $post_type );
	}

	public function is_image( int $id ): bool {
		return $id > 0 && 'attachment' === get_post_type( $id ) && wp_attachment_is_image( $id );
	}

	public function tag_name( int $id ): string {
		$t = get_term( $id, 'post_tag' );
		return $t instanceof WP_Term ? (string) $t->name : '';
	}

	public function user_id(): int {
		return get_current_user_id();
	}

	// Direct writes D2 allows: before-image restores and untrash status.

	const SNAPSHOT_FIELDS = array( 'post_title', 'post_content', 'post_excerpt', 'post_status', 'post_name', 'post_parent', 'menu_order', 'post_author', 'post_password', 'comment_status', 'ping_status', 'post_date', 'post_date_gmt', 'post_type', 'post_mime_type' );

	/** Meta keys WordPress writes on its own. */
	const SNAPSHOT_SKIP_META = array( '_edit_lock', '_edit_last', '_wp_old_slug' );

	/** @return array{id: int, post: array, meta: array, terms: array}|null */
	public function snapshot_post( int $id ): ?array {
		$p = $id > 0 ? get_post( $id ) : null;
		if ( ! $p ) {
			return null;
		}
		$post = array_intersect_key( $p->to_array(), array_flip( self::SNAPSHOT_FIELDS ) );
		ksort( $post );
		$meta = array();
		foreach ( (array) get_post_meta( $id ) as $k => $values ) {
			if ( in_array( $k, self::SNAPSHOT_SKIP_META, true ) ) {
				continue;
			}
			$meta[ $k ] = array_map( 'maybe_unserialize', (array) $values );
		}
		ksort( $meta );
		$terms = array();
		foreach ( get_object_taxonomies( $p->post_type ) as $tax ) {
			$ids = wp_get_object_terms( $id, $tax, array( 'fields' => 'ids' ) );
			if ( is_array( $ids ) ) {
				$ids = array_map( 'intval', $ids );
				sort( $ids );
				$terms[ $tax ] = $ids;
			}
		}
		ksort( $terms );
		return array( 'id' => $id, 'post' => $post, 'meta' => $meta, 'terms' => $terms );
	}

	/** Write a before-image back exactly (post fields directly, every meta row, terms). */
	public function restore_post( array $record ): bool {
		global $wpdb;
		$id = (int) $record['id'];
		if ( ! get_post( $id ) ) {
			return false;
		}
		$fields = array_intersect_key( (array) $record['post'], array_flip( self::SNAPSHOT_FIELDS ) );
		if ( false === $wpdb->update( $wpdb->posts, $fields, array( 'ID' => $id ) ) ) { // phpcs:ignore WordPress.DB.DirectDatabaseQuery
			return false;
		}
		foreach ( array_keys( (array) get_post_meta( $id ) ) as $k ) {
			if ( ! in_array( $k, self::SNAPSHOT_SKIP_META, true ) && ! array_key_exists( $k, (array) $record['meta'] ) ) {
				delete_post_meta( $id, $k );
			}
		}
		foreach ( (array) $record['meta'] as $k => $values ) {
			delete_post_meta( $id, $k );
			foreach ( (array) $values as $v ) {
				add_post_meta( $id, $k, wp_slash( $v ) );
			}
		}
		foreach ( (array) $record['terms'] as $tax => $ids ) {
			wp_set_object_terms( $id, array_map( 'intval', (array) $ids ), $tax );
		}
		clean_post_cache( $id );
		return $this->snapshot_post( $id ) === $record;
	}

	/** Create the object again with its old id (D18), then write its before-image. */
	public function recreate_post( array $record ): bool {
		$id = (int) $record['id'];
		if ( get_post( $id ) ) {
			return false;
		}
		$new = wp_insert_post(
			array(
				'import_id'   => $id,
				'post_type'   => (string) ( $record['post']['post_type'] ?? 'post' ),
				'post_title'  => (string) ( $record['post']['post_title'] ?? '' ),
				'post_status' => 'draft',
			),
			true
		);
		if ( is_wp_error( $new ) || (int) $new !== $id ) {
			if ( ! is_wp_error( $new ) ) {
				wp_delete_post( (int) $new, true );
			}
			return false;
		}
		return $this->restore_post( $record );
	}

	/** wp_delete_post( force ): LifterLMS's relationships run (spike item 17). */
	public function delete_post_permanently( int $id ): bool {
		return $id > 0 && (bool) wp_delete_post( $id, true );
	}

	/** Untrash with an explicit status (WordPress would answer draft, spike item 25). */
	public function untrash( int $id, string $status ): bool {
		if ( 'trash' !== get_post_status( $id ) ) {
			return false;
		}
		$filter = static function ( $new, $post_id ) use ( $id, $status ) {
			return (int) $post_id === $id ? $status : $new;
		};
		add_filter( 'wp_untrash_post_status', $filter, PHP_INT_MAX, 2 );
		try {
			wp_untrash_post( $id );
		} finally {
			remove_filter( 'wp_untrash_post_status', $filter, PHP_INT_MAX );
		}
		clean_post_cache( $id );
		return get_post_status( $id ) === $status;
	}


	/** Event status as TEC's editor writes it (D14, spike item 27): '' clears both keys. */
	public function set_event_status( int $id, string $status, string $reason ): bool {
		if ( '' === $status ) {
			delete_post_meta( $id, self::STATUS_KEY );
			delete_post_meta( $id, self::REASON_KEY );
		} else {
			update_post_meta( $id, self::STATUS_KEY, $status );
			update_post_meta( $id, self::REASON_KEY, $reason );
		}
		do_action( 'tribe_events_event_status_update_post_meta', $id, array( 'status' => $status, 'status-reason' => $reason ) );
		clean_post_cache( $id );
		return true;
	}

	/** featured_image 0 (WordPress's own thumbnail API, not TEC data). */
	public function remove_thumbnail( int $id ): bool {
		delete_post_thumbnail( $id );
		return '' === (string) get_post_meta( $id, '_thumbnail_id', true );
	}

	public function trash_post( int $id ): bool {
		return (bool) wp_trash_post( $id );
	}

	// Categories (D16, D23).

	/** @return array|null {id, name, slug, parent, description, count, meta} */
	public function category( int $id ): ?array {
		$t = get_term( $id, self::CATEGORY );
		if ( ! $t instanceof WP_Term ) {
			return null;
		}
		$meta = array();
		foreach ( (array) get_term_meta( $id ) as $k => $v ) {
			$meta[ $k ] = array_map( 'maybe_unserialize', (array) $v );
		}
		ksort( $meta );
		return array( 'id' => (int) $t->term_id, 'name' => (string) $t->name, 'slug' => (string) $t->slug, 'parent' => (int) $t->parent, 'description' => (string) $t->description, 'count' => (int) $t->count, 'meta' => $meta );
	}

	/** @return int[] every event category id, by name */
	public function categories( string $search = '' ): array {
		$args = array( 'taxonomy' => self::CATEGORY, 'hide_empty' => false, 'fields' => 'ids', 'orderby' => 'name' );
		if ( '' !== $search ) {
			$args['search'] = $search;
		}
		$ids = get_terms( $args );
		return is_array( $ids ) ? array_map( 'intval', $ids ) : array();
	}

	/** @return int|WP_Error */
	public function insert_category( array $args ) {
		$r = wp_insert_term( (string) $args['name'], self::CATEGORY, array_intersect_key( $args, array( 'slug' => 1, 'description' => 1, 'parent' => 1 ) ) );
		return is_wp_error( $r ) ? $r : (int) $r['term_id'];
	}

	/** @return true|WP_Error */
	public function update_category( int $id, array $args ) {
		$r = wp_update_term( $id, self::CATEGORY, $args );
		return is_wp_error( $r ) ? $r : true;
	}

	/** Events using a category, any status but trash. */
	public function category_use( int $id ): int {
		global $wpdb;
		return (int) $wpdb->get_var( $wpdb->prepare( "SELECT COUNT(DISTINCT p.ID) FROM {$wpdb->term_relationships} r JOIN {$wpdb->term_taxonomy} t ON t.term_taxonomy_id = r.term_taxonomy_id JOIN {$wpdb->posts} p ON p.ID = r.object_id WHERE t.term_id = %d AND t.taxonomy = %s AND p.post_status <> 'trash'", $id, self::CATEGORY ) ); // phpcs:ignore WordPress.DB
	}

	/** A category's earlier state back (name, slug, description, parent, every term meta row). */
	public function restore_category( array $record ): bool {
		$id = (int) $record['id'];
		$r  = wp_update_term( $id, self::CATEGORY, array( 'name' => $record['name'], 'slug' => $record['slug'], 'description' => $record['description'], 'parent' => (int) $record['parent'] ) );
		if ( is_wp_error( $r ) ) {
			return false;
		}
		foreach ( array_keys( (array) get_term_meta( $id ) ) as $k ) {
			delete_term_meta( $id, $k );
		}
		foreach ( (array) $record['meta'] as $k => $values ) {
			foreach ( (array) $values as $v ) {
				add_term_meta( $id, $k, wp_slash( $v ) );
			}
		}
		clean_term_cache( $id, self::CATEGORY );
		return true;
	}

	public function delete_category( int $id ): bool {
		return true === wp_delete_term( $id, self::CATEGORY );
	}

	// Versions.

	/** 16 hex characters of sha256 over the canonical JSON (keys sorted). */
	public static function version( array $canonical ): string {
		return substr( hash( 'sha256', (string) wp_json_encode( self::canonical( $canonical ) ) ), 0, 16 );
	}

	protected static function canonical( $v ) {
		if ( is_array( $v ) ) {
			if ( array_keys( $v ) !== range( 0, count( $v ) - 1 ) ) {
				ksort( $v );
			}
			return array_map( array( __CLASS__, 'canonical' ), $v );
		}
		return $v;
	}

	/** Raw state minus what changes on its own (spike item 19). */
	public static function strip_volatile( array $fields ): array {
		foreach ( array( 'post', 'meta' ) as $part ) {
			foreach ( array_keys( (array) ( $fields[ $part ] ?? array() ) ) as $k ) {
				if ( in_array( $k, self::VOLATILE, true ) || 0 === strpos( (string) $k, '_emcp_' ) ) {
					unset( $fields[ $part ][ $k ] );
				}
			}
		}
		return $fields;
	}
}
