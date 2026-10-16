<?php
/**
 * Image SEO media library list table.
 *
 * @package Neo_Pulse_Wp
 */

defined( 'ABSPATH' ) || exit;

if ( ! class_exists( 'WP_List_Table', false ) ) {
	require_once ABSPATH . 'wp-admin/includes/class-wp-list-table.php';
}

class Neo_Pulse_Wp_Image_Seo_List_Table extends WP_List_Table {

	/** @var bool */
	private $edit_mode = false;

	public function __construct() {
		parent::__construct(
			array(
				'singular' => 'image',
				'plural'   => 'images',
				'ajax'     => false,
			)
		);
	}

	public function get_columns(): array {
		return array(
			'cb'       => '<input type="checkbox" />',
			'thumb'    => __( 'Image', 'neo-pulse-wp' ),
			'filename' => __( 'Filename', 'neo-pulse-wp' ),
			'title'    => __( 'Title', 'neo-pulse-wp' ),
			'alt'      => __( 'Alt text', 'neo-pulse-wp' ),
			'caption'  => __( 'Caption', 'neo-pulse-wp' ),
			'status'   => __( 'Status', 'neo-pulse-wp' ),
		);
	}

	protected function get_bulk_actions(): array {
		if ( Neo_Pulse_Wp_License::ai_needs_upgrade( false ) ) {
			return array(); // AI optimizing is part of NEO Pulse Pro + AI; the row links show it greyed out.
		}
		return array(
			'optimize_ai' => __( 'Optimize with AI', 'neo-pulse-wp' ),
		);
	}

	/**
	 * Use custom field names so the bulk dropdown does not overwrite admin-post action.
	 *
	 * @param string $which top|bottom.
	 */
	protected function bulk_actions( $which = '' ): void {
		if ( ! $this->has_items() ) {
			return;
		}

		$actions = $this->get_bulk_actions();
		if ( empty( $actions ) ) {
			return;
		}

		$field = ( 'bottom' === $which ) ? 'image_seo_bulk_action2' : 'image_seo_bulk_action';
		$id    = 'bulk-' . sanitize_html_class( $which ) . '-selector';

		echo '<label for="' . esc_attr( $id ) . '" class="screen-reader-text">' . esc_html__( 'Select bulk action', 'neo-pulse-wp' ) . '</label>';
		echo '<select name="' . esc_attr( $field ) . '" id="' . esc_attr( $id ) . '">';
		echo '<option value="-1">' . esc_html__( 'Bulk actions', 'neo-pulse-wp' ) . '</option>';
		foreach ( $actions as $key => $label ) {
			echo '<option value="' . esc_attr( (string) $key ) . '">' . esc_html( (string) $label ) . '</option>';
		}
		echo '</select>';
		submit_button( __( 'Apply' ), 'action', '', false, array( 'id' => 'doaction' . ( 'bottom' === $which ? '2' : '' ) ) );
	}

	protected function column_cb( $item ): string {
		return sprintf(
			'<input type="checkbox" name="attachment_ids[]" value="%d" />',
			(int) ( $item['id'] ?? 0 )
		);
	}

	/**
	 * @param array<string,mixed> $item
	 */
	protected function column_thumb( $item ): string {
		$url = isset( $item['thumbUrl'] ) ? (string) $item['thumbUrl'] : '';
		if ( $url === '' ) {
			return '&mdash;';
		}
		return '<img src="' . esc_url( $url ) . '" alt="" class="neo-pulse-image-seo-thumb" width="60" height="60" />';
	}

	/**
	 * @param array<string,mixed> $item
	 */
	protected function column_filename( $item ): string {
		$id       = (int) ( $item['id'] ?? 0 );
		$filename = isset( $item['filename'] ) ? (string) $item['filename'] : '';
		$actions  = array(
			'optimize' => sprintf(
				'<a href="#" class="neo-pulse-image-seo-row-optimize" data-id="%d">%s</a>',
				$id,
				esc_html__( 'Optimize', 'neo-pulse-wp' )
			),
		);
		return sprintf(
			'<div class="neo-pulse-image-seo-filename-cell"><strong class="neo-pulse-image-seo-filename">%1$s</strong>%2$s</div>',
			esc_html( $filename ),
			$this->row_actions( $actions )
		);
	}

	/**
	 * @param array<string,mixed> $item
	 */
	protected function column_title( $item ): string {
		return $this->render_field_cell( $item, 'title', 'text' );
	}

	/**
	 * @param array<string,mixed> $item
	 */
	protected function column_alt( $item ): string {
		return $this->render_field_cell( $item, 'alt', 'text' );
	}

	/**
	 * @param array<string,mixed> $item
	 */
	protected function column_caption( $item ): string {
		return $this->render_field_cell( $item, 'caption', 'textarea' );
	}

	/**
	 * @param array<string,mixed> $item
	 */
	protected function column_status( $item ): string {
		$missing = ! empty( $item['missingAlt'] );
		if ( $missing ) {
			return '<span class="neo-pulse-image-seo-badge neo-pulse-image-seo-badge--warn">' . esc_html__( 'Missing alt', 'neo-pulse-wp' ) . '</span>';
		}
		return '<span class="neo-pulse-image-seo-badge neo-pulse-image-seo-badge--ok">' . esc_html__( 'Complete', 'neo-pulse-wp' ) . '</span>';
	}

	/**
	 * @param array<string,mixed> $item
	 */
	private function render_field_cell( $item, string $field, string $type ): string {
		$id    = (int) ( $item['id'] ?? 0 );
		$value = isset( $item[ $field ] ) ? (string) $item[ $field ] : '';
		if ( ! $this->edit_mode ) {
			return $value !== '' ? esc_html( $value ) : '<span class="neo-pulse-image-seo-empty">&mdash;</span>';
		}
		if ( $type === 'textarea' ) {
			return sprintf(
				'<textarea class="neo-pulse-image-seo-inline-field" data-id="%1$d" data-field="%2$s" rows="2">%3$s</textarea>',
				$id,
				esc_attr( $field ),
				esc_textarea( $value )
			);
		}
		return sprintf(
			'<input type="text" class="neo-pulse-image-seo-inline-field" data-id="%1$d" data-field="%2$s" value="%3$s" />',
			$id,
			esc_attr( $field ),
			esc_attr( $value )
		);
	}

	public function prepare_items(): void {
		$this->edit_mode = isset( $_GET['edit_mode'] ) && '1' === (string) wp_unslash( $_GET['edit_mode'] );

		$per_page = 20;
		$page     = $this->get_pagenum();
		$search   = isset( $_REQUEST['s'] ) ? sanitize_text_field( wp_unslash( (string) $_REQUEST['s'] ) ) : '';
		$missing  = isset( $_GET['missing_alt'] ) && '1' === (string) wp_unslash( $_GET['missing_alt'] );

		$result = Neo_Pulse_Wp_Image_Seo::query_attachments(
			array(
				'page'        => $page,
				'per_page'    => $per_page,
				'search'      => $search,
				'missing_alt' => $missing,
			)
		);

		$this->items = $result['items'];
		$this->set_pagination_args(
			array(
				'total_items' => $result['total'],
				'per_page'    => $per_page,
				'total_pages' => (int) ceil( max( 1, $result['total'] ) / $per_page ),
			)
		);

		$this->_column_headers = array( $this->get_columns(), array(), array() );
	}

	public function is_edit_mode(): bool {
		return $this->edit_mode;
	}
}
