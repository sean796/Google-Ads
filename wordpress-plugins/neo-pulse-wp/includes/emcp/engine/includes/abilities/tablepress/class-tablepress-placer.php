<?php
/**
 * Putting a TablePress table on a page, and finding the pages that show one (3.19.0).
 *
 * Elementor pages get TablePress's `tablepress-table` widget, other pages its `tablepress/table`
 * block. The page write is recorded with EMCP's own page History types, so the existing undo
 * for that page applies.
 *
 * @package EMCP_Tools
 * @since   3.19.0
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/** @since 3.19.0 */
final class EMCP_Tools_TablePress_Placer {

	/** @var object|null EMCP_Tools_Data or a double with get_page_data() and save_page_data(). */
	private static $data = null;

	/** @var callable|null Test seam: returns candidate posts. */
	private static $finder = null;

	public static function use_data( ?object $data ): void {
		self::$data = $data;
	}

	public static function use_finder( ?callable $finder ): void {
		self::$finder = $finder;
	}

	private static function data(): object {
		return self::$data ? self::$data : new EMCP_Tools_Data();
	}

	/** TablePress's parameter string: key=value pairs, values with spaces quoted. */
	public static function parameter_string( array $params ): string {
		$parts = array();
		foreach ( $params as $key => $value ) {
			$value   = (string) $value;
			$parts[] = $key . '=' . ( preg_match( '/[\s"\']/', $value ) ? '"' . str_replace( '"', '&quot;', $value ) . '"' : $value );
		}
		return implode( ' ', $parts );
	}

	/** Candidate posts: anything not in the trash whose content or Elementor data names TablePress. */
	private static function candidates(): array {
		if ( self::$finder ) {
			return (array) ( self::$finder )();
		}
		global $wpdb;
		$skip = "'revision','tablepress_table','nav_menu_item'";
		$rows = (array) $wpdb->get_results(
			"SELECT p.ID AS post_id, p.post_title AS title, p.post_type AS type, p.post_status AS status, p.post_content AS content, COALESCE(m.meta_value, '') AS elementor
			 FROM {$wpdb->posts} p
			 LEFT JOIN {$wpdb->postmeta} m ON m.post_id = p.ID AND m.meta_key = '_elementor_data'
			 WHERE p.post_status <> 'trash' AND p.post_type NOT IN ({$skip})
			   AND ( p.post_content LIKE '%[table%' OR p.post_content LIKE '%tablepress/table%' OR m.meta_value LIKE '%tablepress-table%' )
			 ORDER BY p.ID LIMIT 2000",
			ARRAY_A
		);
		return $rows;
	}

	private static function elementor_has( array $elements, string $id ): bool {
		foreach ( $elements as $el ) {
			if ( ! is_array( $el ) ) {
				continue;
			}
			if ( 'tablepress-table' === ( $el['widgetType'] ?? '' ) && $id === (string) ( $el['settings']['table_id'] ?? $el['settings']['id'] ?? '' ) ) {
				return true;
			}
			if ( ! empty( $el['elements'] ) && self::elementor_has( (array) $el['elements'], $id ) ) {
				return true;
			}
		}
		return false;
	}

	/** @return array[] {post_id, title, type, status, via} */
	public static function find_usage( string $id ): array {
		$quoted = preg_quote( $id, '/' );
		$out    = array();
		foreach ( self::candidates() as $c ) {
			$content = (string) ( $c['content'] ?? '' );
			$via     = '';
			if ( preg_match( '/\[table\s[^\]]*\bid=(["\']?)' . $quoted . '\1(?=[\s\/\]])/i', $content ) ) {
				$via = 'shortcode';
			} elseif ( preg_match( '/\[table-info\s[^\]]*\bid=(["\']?)' . $quoted . '\1(?=[\s\/\]])/i', $content ) ) {
				$via = 'table-info';
			} elseif ( preg_match_all( '/<!--\s+wp:tablepress\/table\s+(\{.*?\})\s+\/?-->/s', $content, $m ) ) {
				foreach ( $m[1] as $json ) {
					$attrs = json_decode( $json, true );
					if ( is_array( $attrs ) && $id === (string) ( $attrs['id'] ?? '' ) ) {
						$via = 'block';
						break;
					}
				}
			}
			if ( '' === $via && '' !== (string) ( $c['elementor'] ?? '' ) ) {
				$tree = json_decode( (string) $c['elementor'], true );
				if ( is_array( $tree ) && self::elementor_has( $tree, $id ) ) {
					$via = 'elementor';
				}
			}
			if ( '' !== $via ) {
				$out[] = array(
					'post_id' => (int) $c['post_id'],
					'title'   => (string) $c['title'],
					'type'    => (string) $c['type'],
					'status'  => (string) $c['status'],
					'via'     => $via,
				);
			}
		}
		return $out;
	}

	/** Add the widget to a container, at its start or end. */
	private static function add_to( array &$elements, string $container, array $widget, bool $prepend ): bool {
		foreach ( $elements as &$el ) {
			if ( ! is_array( $el ) ) {
				continue;
			}
			if ( ( $el['id'] ?? '' ) === $container && 'container' === ( $el['elType'] ?? '' ) ) {
				$children = (array) ( $el['elements'] ?? array() );
				$prepend ? array_unshift( $children, $widget ) : array_push( $children, $widget );
				$el['elements'] = $children;
				return true;
			}
			if ( ! empty( $el['elements'] ) ) {
				$children = (array) $el['elements'];
				if ( self::add_to( $children, $container, $widget, $prepend ) ) {
					$el['elements'] = $children;
					return true;
				}
			}
		}
		return false;
	}

	/**
	 * Put the table on the page.
	 *
	 * @param array $params Shortcode parameters, already checked.
	 * @return array|WP_Error
	 */
	public static function place( string $table_id, int $post_id, string $position, ?string $container, array $params ) {
		$post = get_post( $post_id );
		if ( ! $post ) {
			/* translators: %d: post ID. */
			return new WP_Error( 'not_found', sprintf( __( 'Post %d does not exist.', 'emcp-tools' ), $post_id ) );
		}
		$prepend    = 'prepend' === $position;
		$parameters = self::parameter_string( $params );
		/* translators: 1: table id, 2: post ID. */
		$summary = sprintf( __( 'TablePress: table %1$s placed on post %2$d', 'emcp-tools' ), $table_id, $post_id );

		if ( 'builder' === (string) get_post_meta( $post_id, '_elementor_edit_mode', true ) ) {
			$data   = self::data();
			$tree   = $data->get_page_data( $post_id );
			$tree   = is_array( $tree ) ? $tree : array();
			$before = $tree;
			$widget = array(
				'id'         => EMCP_Tools_Id_Generator::generate(),
				'elType'     => 'widget',
				'widgetType' => 'tablepress-table',
				'settings'   => array( 'table_id' => $table_id, 'parameters' => $parameters ),
				'elements'   => array(),
			);
			if ( null !== $container && '' !== $container ) {
				if ( ! self::add_to( $tree, $container, $widget, $prepend ) ) {
					/* translators: %s: element id. */
					return new WP_Error( 'not_found', sprintf( __( 'There is no container "%s" on this page.', 'emcp-tools' ), $container ) );
				}
			} else {
				$box = array(
					'id'       => EMCP_Tools_Id_Generator::generate(),
					'elType'   => 'container',
					'settings' => array(),
					'elements' => array( $widget ),
					'isInner'  => false,
				);
				$prepend ? array_unshift( $tree, $box ) : array_push( $tree, $box );
			}
			$saved = $data->save_page_data( $post_id, $tree );
			if ( is_wp_error( $saved ) || false === $saved ) {
				return new WP_Error( 'save_failed', is_wp_error( $saved ) ? $saved->get_error_message() : __( 'The page could not be saved.', 'emcp-tools' ) );
			}
			$change = EMCP_Tools_Change_Recorder::record_elementor( $post_id, $before, $summary, 'post #' . $post_id );
			return array(
				'post_id'    => $post_id,
				'builder'    => 'elementor',
				'table_id'   => $table_id,
				'element_id' => $widget['id'],
				'change'     => array( 'change_id' => $change, 'undo' => array( 'available' => '' !== $change ) ),
			);
		}

		$attrs = array( 'id' => $table_id );
		if ( '' !== $parameters ) {
			$attrs['parameters'] = $parameters;
		}
		$before = (string) $post->post_content;
		// The block's save() writes the shortcode inside the block; the block editor compares the two
		// and calls a self-closing tablepress/table block invalid content.
		$inner  = '[' . EMCP_Tools_TablePress_Integration::shortcode_tag() . ' id=' . $table_id . ' ' . ( '' !== $parameters ? $parameters . ' ' : '' ) . '/]';
		$block  = parse_blocks( '<!-- wp:tablepress/table ' . wp_json_encode( $attrs, JSON_UNESCAPED_SLASHES ) . " -->\n" . $inner . "\n<!-- /wp:tablepress/table -->" );
		$blocks = EMCP_Tools_Block_Tree::insert( EMCP_Tools_Block_Tree::from_markup( $before ), array( $block[0] ), array( 'mode' => $prepend ? 'prepend' : 'append' ) );
		$saved  = wp_update_post( array( 'ID' => $post_id, 'post_content' => wp_slash( EMCP_Tools_Block_Tree::to_markup( $blocks ) ) ), true );
		if ( is_wp_error( $saved ) || ! $saved ) {
			return new WP_Error( 'save_failed', is_wp_error( $saved ) ? $saved->get_error_message() : __( 'The page could not be saved.', 'emcp-tools' ) );
		}
		$change = EMCP_Tools_Change_Recorder::record_post_fields(
			$post_id,
			array( 'fields' => array( 'post_content' => $before ), 'meta' => array(), 'terms' => array() ),
			$summary,
			'post #' . $post_id,
			'content',
			'place-table'
		);
		return array(
			'post_id'  => $post_id,
			'builder'  => 'blocks',
			'table_id' => $table_id,
			'change'   => array( 'change_id' => $change, 'undo' => array( 'available' => '' !== $change ) ),
		);
	}
}
