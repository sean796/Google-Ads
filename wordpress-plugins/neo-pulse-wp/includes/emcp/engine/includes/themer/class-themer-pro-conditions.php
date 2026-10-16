<?php
/**
 * Pro ranking + quota + selector-list contributions for Neo EMCP Themer.
 *
 * @package EMCP_Tools_Pro
 * @since   3.1.0
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * @since 3.1.0
 */
class EMCP_Tools_Themer_Pro_Conditions {

	/**
	 * Priority ranker (used via the emcp_themer_rank filter).
	 *
	 * @return callable
	 */
	public static function ranker(): callable {
		return static function ( array $row ): int {
			return (int) ( $row['priority'] ?? 0 );
		};
	}

	/**
	 * Unlimited quota (via emcp_themer_quota).
	 *
	 * @param int    $cap  Incoming cap.
	 * @param string $type Template type.
	 * @return int
	 */
	public static function quota( int $cap, string $type ): int {
		return PHP_INT_MAX;
	}

	/**
	 * Add granular selector keys (via emcp_themer_selectors).
	 *
	 * @param array $selectors Free selector keys.
	 * @return array
	 */
	public static function selectors( array $selectors ): array {
		return array_values( array_unique( array_merge( $selectors, EMCP_Tools_Themer_Pro_Matchers::selector_keys() ) ) );
	}

	/**
	 * Augment the free condition schema (via emcp_themer_condition_schema): adds the
	 * Exclude relation, specific-object search on taxonomy/post-type nodes, and the
	 * granular Author/Date/In-term nodes. This is the paid UI config and lives in pro/.
	 *
	 * @param array  $schema The free schema.
	 * @param string $type   Template type.
	 * @return array
	 */
	public static function schema( array $schema, string $type ): array {
		$schema['relations'][] = array( 'value' => 'exclude', 'label' => __( 'Exclude', 'emcp-tools' ) );

		foreach ( $schema['groups'] as &$group ) {
			if ( 'archive' === $group['value'] ) {
				foreach ( $group['subs'] as &$sub ) {
					if ( ! empty( $sub['taxonomy'] ) ) {
						$sub['object'] = array( 'kind' => 'term', 'taxonomy' => $sub['taxonomy'], 'specificSelector' => 'term:' . $sub['taxonomy'] . ':%d' );
					}
				}
				unset( $sub );
				$group['subs'][] = array( 'value' => 'date', 'label' => __( 'Date archive', 'emcp-tools' ), 'selector' => 'date' );
				$group['subs'][] = array( 'value' => 'author-archive', 'label' => __( 'Author archive', 'emcp-tools' ), 'selector' => '', 'object' => array( 'kind' => 'author', 'specificSelector' => 'author-archive:%d' ) );
			}

			if ( 'singular' === $group['value'] ) {
				foreach ( $group['subs'] as &$sub2 ) {
					if ( ! empty( $sub2['post_type'] ) ) {
						$sub2['object'] = array( 'kind' => 'post', 'post_type' => $sub2['post_type'], 'specificSelector' => 'post:%d' );
					}
				}
				unset( $sub2 );
				foreach ( get_taxonomies( array( 'public' => true ), 'objects' ) as $tx ) {
					$group['subs'][] = array(
						'value'    => 'in-' . $tx->name,
						/* translators: %s: taxonomy label */
						'label'    => sprintf( __( 'In %s', 'emcp-tools' ), $tx->label ),
						'selector' => '',
						'object'   => array( 'kind' => 'term', 'taxonomy' => $tx->name, 'specificSelector' => 'tax:' . $tx->name . ':%d' ),
					);
				}
				$group['subs'][] = array( 'value' => 'by-author', 'label' => __( 'By author', 'emcp-tools' ), 'selector' => '', 'object' => array( 'kind' => 'author', 'specificSelector' => 'author:%d' ) );
			}
		}
		unset( $group );

		return $schema;
	}

	/**
	 * admin-ajax handler for the object search (posts / terms / authors).
	 */
	public static function ajax_object_search(): void {
		if ( ! check_ajax_referer( 'emcp_themer_object_search', 'nonce', false ) || ! current_user_can( 'edit_pages' ) || EMCP_Tools_Themer_CPT::excluded( get_current_user_id() ) ) {
			wp_send_json_error( array( 'items' => array() ), 403 );
		}
		$object = json_decode( isset( $_POST['object'] ) && is_string( $_POST['object'] ) ? wp_unslash( $_POST['object'] ) : '', true ); // phpcs:ignore WordPress.Security.ValidatedSanitizedInput
		$q      = isset( $_POST['q'] ) && is_string( $_POST['q'] ) ? sanitize_text_field( wp_unslash( $_POST['q'] ) ) : '';
		$kind   = is_array( $object ) && is_string( $object['kind'] ?? null ) ? sanitize_key( $object['kind'] ) : '';
		$items  = array();

		if ( 'post' === $kind ) {
			$posts = get_posts( array(
				'post_type'      => is_string( $object['post_type'] ?? null ) ? sanitize_key( $object['post_type'] ) : 'post',
				'post_status'    => array( 'publish', 'private', 'draft' ),
				's'              => $q,
				'posts_per_page' => 20,
				'no_found_rows'  => true,
			) );
			foreach ( $posts as $p ) {
				if ( ! current_user_can( 'read_post', $p->ID ) ) {
					continue;
				}
				$items[] = array( 'id' => $p->ID, 'label' => $p->post_title . ' (#' . $p->ID . ')' );
			}
		} elseif ( 'term' === $kind ) {
			$terms = get_terms( array(
				'taxonomy'   => is_string( $object['taxonomy'] ?? null ) ? sanitize_key( $object['taxonomy'] ) : 'category',
				'search'     => $q,
				'number'     => 20,
				'hide_empty' => false,
			) );
			if ( ! is_wp_error( $terms ) ) {
				foreach ( $terms as $t ) {
					$items[] = array( 'id' => $t->term_id, 'label' => $t->name . ' (#' . $t->term_id . ')' );
				}
			}
		} elseif ( 'author' === $kind ) {
			$users = get_users( array( 'search' => '*' . $q . '*', 'search_columns' => array( 'display_name', 'user_login' ), 'number' => 20, 'who' => 'authors' ) );
			foreach ( $users as $u ) {
				$items[] = array( 'id' => $u->ID, 'label' => $u->display_name . ' (#' . $u->ID . ')' );
			}
		}

		wp_send_json_success( array( 'items' => $items ) );
	}
}
