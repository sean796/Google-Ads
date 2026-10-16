<?php
/**
 * Redirects list table (Rank Math–style).
 *
 * @package Neo_Pulse_Wp
 */

defined( 'ABSPATH' ) || exit;

if ( ! class_exists( 'WP_List_Table', false ) ) {
	require_once ABSPATH . 'wp-admin/includes/class-wp-list-table.php';
}

class Neo_Pulse_Wp_Redirects_List_Table extends WP_List_Table {

	/** @var array<string, int> */
	private $status_counts = array();

	public function __construct() {
		parent::__construct(
			array(
				'singular' => 'redirect',
				'plural'   => 'redirects',
				'ajax'     => false,
			)
		);
	}

	public function get_columns(): array {
		return array(
			'cb'               => '<input type="checkbox" />',
			'source'           => __( 'From', 'neo-pulse-wp' ),
			'destination'      => __( 'To', 'neo-pulse-wp' ),
			'type'             => __( 'Type', 'neo-pulse-wp' ),
			'hits'             => __( 'Hits', 'neo-pulse-wp' ),
			'created_at'       => __( 'Created', 'neo-pulse-wp' ),
			'last_accessed_at' => __( 'Last Accessed', 'neo-pulse-wp' ),
			'category'         => __( 'Category', 'neo-pulse-wp' ),
		);
	}

	protected function get_sortable_columns(): array {
		return array(
			'source'           => array( 'source', false ),
			'destination'      => array( 'destination', false ),
			'type'             => array( 'type', false ),
			'hits'             => array( 'hits', false ),
			'created_at'       => array( 'created_at', true ),
			'last_accessed_at' => array( 'last_accessed_at', false ),
		);
	}

	protected function get_bulk_actions(): array {
		$status = isset( $_GET['redirect_status'] ) ? sanitize_key( wp_unslash( (string) $_GET['redirect_status'] ) ) : 'all';
		if ( 'trash' === $status ) {
			return array(
				'restore' => __( 'Restore', 'neo-pulse-wp' ),
				'delete'  => __( 'Delete Permanently', 'neo-pulse-wp' ),
			);
		}
		return array(
			'trash'      => __( 'Move to Trash', 'neo-pulse-wp' ),
			'activate'   => __( 'Activate', 'neo-pulse-wp' ),
			'deactivate' => __( 'Deactivate', 'neo-pulse-wp' ),
			'delete'     => __( 'Delete Permanently', 'neo-pulse-wp' ),
		);
	}

	protected function column_cb( $item ): string {
		return sprintf(
			'<input type="checkbox" name="redirect_ids[]" value="%d" />',
			(int) $item->id
		);
	}

	/**
	 * @param object $item Row.
	 */
	protected function column_source( $item ): string {
		$id     = (int) $item->id;
		$status = isset( $item->status ) ? (string) $item->status : 'active';
		$edit_url = admin_url(
			add_query_arg(
				array(
					'page'   => 'neo-pulse-wp-redirects',
					'action' => 'edit',
					'id'     => $id,
				),
				'admin.php'
			)
		);

		$source_path = ltrim( (string) $item->source, '/' );
		$view_url    = home_url( '/' . $source_path );
		$dest_url    = Neo_Pulse_Wp_Redirects_Csv::resolve_destination_url( (string) $item->destination );

		$actions = array(
			'edit' => sprintf(
				'<a href="%s" aria-label="%s">%s</a>',
				esc_url( $edit_url ),
				/* translators: %s: redirect source path */
				esc_attr( sprintf( __( 'Edit redirect for %s', 'neo-pulse-wp' ), (string) $item->source ) ),
				esc_html__( 'Edit', 'neo-pulse-wp' )
			),
		);

		// Only an exact source is a real URL; contains / starts / ends / regex sources are patterns.
		$matching = isset( $item->matching ) ? Neo_Pulse_Wp_Redirects::normalize_matching( (string) $item->matching ) : 'exact';
		if ( 'exact' === $matching ) {
			$actions['view'] = sprintf(
				'<a href="%s" target="_blank" rel="noopener noreferrer" aria-label="%s">%s</a>',
				esc_url( $view_url ),
				/* translators: %s: redirect source path */
				esc_attr( sprintf( __( 'View source URL for %s', 'neo-pulse-wp' ), (string) $item->source ) ),
				esc_html__( 'View', 'neo-pulse-wp' )
			);
		}

		if ( is_string( $dest_url ) && $dest_url !== '' ) {
			$actions['view_destination'] = sprintf(
				'<a href="%s" target="_blank" rel="noopener noreferrer">%s</a>',
				esc_url( $dest_url ),
				esc_html__( 'View To', 'neo-pulse-wp' )
			);
		}

		if ( 'trash' === $status ) {
			$actions['restore'] = sprintf(
				'<a href="%s">%s</a>',
				esc_url( self::row_action_url( $id, 'restore' ) ),
				esc_html__( 'Restore', 'neo-pulse-wp' )
			);
			$actions['delete'] = sprintf(
				'<a href="%s" class="submitdelete" onclick="return confirm(\'%s\');">%s</a>',
				esc_url( self::row_action_url( $id, 'delete' ) ),
				esc_js( __( 'Delete this redirect permanently?', 'neo-pulse-wp' ) ),
				esc_html__( 'Delete Permanently', 'neo-pulse-wp' )
			);
		} else {
			if ( 'active' === $status ) {
				$actions['deactivate'] = sprintf(
					'<a href="%s">%s</a>',
					esc_url( self::row_action_url( $id, 'deactivate' ) ),
					esc_html__( 'Deactivate', 'neo-pulse-wp' )
				);
			} elseif ( 'inactive' === $status ) {
				$actions['activate'] = sprintf(
					'<a href="%s">%s</a>',
					esc_url( self::row_action_url( $id, 'activate' ) ),
					esc_html__( 'Activate', 'neo-pulse-wp' )
				);
			}

			$actions['trash'] = sprintf(
				'<a href="%s" class="submitdelete">%s</a>',
				esc_url( self::row_action_url( $id, 'trash' ) ),
				esc_html__( 'Trash', 'neo-pulse-wp' )
			);
		}

		return sprintf(
			'<strong><a class="row-title" href="%1$s">%2$s</a></strong> %3$s',
			esc_url( $edit_url ),
			esc_html( (string) $item->source ),
			$this->row_actions( $actions )
		);
	}

	/**
	 * @param object $item Row.
	 * @param string $column_name Column.
	 */
	protected function column_default( $item, $column_name ) {
		switch ( $column_name ) {
			case 'source':
				return '';
			case 'destination':
				return esc_html( (string) $item->destination );
			case 'type':
				return esc_html( (string) $item->type );
			case 'hits':
				return esc_html( number_format_i18n( (int) $item->hits ) );
			case 'created_at':
				return esc_html( self::format_datetime( (string) $item->created_at ) );
			case 'last_accessed_at':
				$val = isset( $item->last_accessed_at ) ? (string) $item->last_accessed_at : '';
				return $val !== '' ? esc_html( self::format_datetime( $val ) ) : '&mdash;';
			case 'category':
				return esc_html( (string) $item->category );
			default:
				return '';
		}
	}

	public function prepare_items(): void {
		$this->status_counts = Neo_Pulse_Wp_Redirects::status_counts();

		$per_page = 20;
		$page     = $this->get_pagenum();
		$status   = isset( $_GET['redirect_status'] ) ? sanitize_key( wp_unslash( (string) $_GET['redirect_status'] ) ) : 'all';
		$category = isset( $_GET['redirect_category'] ) ? sanitize_text_field( wp_unslash( (string) $_GET['redirect_category'] ) ) : '';
		$search   = isset( $_REQUEST['s'] ) ? sanitize_text_field( wp_unslash( (string) $_REQUEST['s'] ) ) : '';
		$orderby  = isset( $_GET['orderby'] ) ? sanitize_key( wp_unslash( (string) $_GET['orderby'] ) ) : 'created_at';
		$order    = isset( $_GET['order'] ) ? sanitize_key( wp_unslash( (string) $_GET['order'] ) ) : 'desc';

		$result = Neo_Pulse_Wp_Redirects::query(
			array(
				'status'   => $status,
				'category' => $category,
				'search'   => $search,
				'orderby'  => $orderby,
				'order'    => $order,
				'per_page' => $per_page,
				'page'     => $page,
			)
		);

		$this->items = $result['items'];
		$this->set_pagination_args(
			array(
				'total_items' => $result['total'],
				'per_page'    => $per_page,
				'total_pages' => (int) ceil( $result['total'] / $per_page ),
			)
		);

		$this->_column_headers = array( $this->get_columns(), array(), $this->get_sortable_columns() );
	}

	/**
	 * @return array<string, int>
	 */
	public function get_status_counts(): array {
		return $this->status_counts;
	}

	private static function format_datetime( string $mysql_gmt ): string {
		if ( $mysql_gmt === '' ) {
			return '';
		}
		$ts = strtotime( $mysql_gmt . ' UTC' );
		if ( ! $ts ) {
			return $mysql_gmt;
		}
		return wp_date( get_option( 'date_format' ) . ', ' . get_option( 'time_format' ), $ts );
	}

	private static function row_action_url( int $id, string $op ): string {
		$url = admin_url(
			add_query_arg(
				array(
					'action'      => 'neo_pulse_wp_redirect_row',
					'redirect_op' => $op,
					'id'          => $id,
				),
				'admin-post.php'
			)
		);
		return wp_nonce_url( $url, 'neo_pulse_wp_redirect_row_' . $op . '_' . $id );
	}
}
