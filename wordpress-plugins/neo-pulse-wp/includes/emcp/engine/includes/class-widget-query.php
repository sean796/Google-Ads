<?php
/**
 * Widget Query — the data source behind the Widget Builder's `query` control.
 *
 * A generated widget declares `{ type: "query", source: "posts" }`; the
 * generator emits a per-source set of ordinary Elementor controls (prefixed
 * with the control name) and a render-time call to run() that turns those
 * settings into flat rows the compiled `{{#each name}}` loop iterates. Rows
 * are plain string/`'yes'` values so the template compiler's per-field escaping
 * applies unchanged. Read-only, capped, and it never throws: any failure or
 * missing dependency (no WooCommerce, unknown taxonomy) yields no rows.
 *
 * @package EMCP_Tools
 * @since   3.18.0
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Runs the supported sources and describes their controls and row fields.
 *
 * @since 3.18.0
 */
class EMCP_Tools_Widget_Query {

	/** Hard cap on rows per query (posts/products). */
	const MAX_ROWS = 50;

	/** @var string Human-readable reason the last run() returned no rows ('' when fine). */
	private static $last_error = '';

	/**
	 * The last run's error message, exposed to templates as {{name_error}}.
	 *
	 * @return string
	 */
	public static function last_error(): string {
		return self::$last_error;
	}

	/** Hard cap on rows for a terms query (0 = all, capped here). */
	const MAX_TERMS = 100;

	/** Words per minute used for the posts `reading_time` field. */
	const WPM = 200;

	/**
	 * Supported sources.
	 *
	 * @return string[]
	 */
	public static function sources(): array {
		return array( 'posts', 'products', 'terms', 'menu', 'remote', 'site', 'breadcrumbs', 'cart' );
	}

	/**
	 * Whether a source/preset pair is valid: `remote` needs a known preset,
	 * the others take none.
	 *
	 * @param string $source Source key.
	 * @param string $preset Preset key ('' for non-remote sources).
	 * @return bool
	 */
	public static function valid( string $source, string $preset = '' ): bool {
		if ( ! in_array( $source, self::sources(), true ) ) {
			return false;
		}
		if ( 'remote' === $source ) {
			return class_exists( 'EMCP_Tools_Remote_Source' ) && null !== EMCP_Tools_Remote_Source::preset( $preset );
		}
		return true;
	}

	// -------------------------------------------------------------------------
	// Contract: row fields and generated controls
	// -------------------------------------------------------------------------

	/**
	 * The row fields a source produces, as a compiler field map (name => {type}).
	 * `raw_url` = esc_url, `wysiwyg` = wp_kses_post, `switcher` = 'yes'/'' flag,
	 * everything else `text`.
	 *
	 * @param string $source Source key.
	 * @return array<string, array{type: string}>
	 */
	public static function fields( string $source, string $preset = '', array $args = array() ): array {
		if ( 'remote' === $source ) {
			$p = class_exists( 'EMCP_Tools_Remote_Source' ) ? EMCP_Tools_Remote_Source::preset( $preset ) : null;
			return $p ? $p->fields( $args ) : array();
		}
		$t = static function ( array $names, string $type ): array {
			$out = array();
			foreach ( $names as $n ) {
				$out[ $n ] = array( 'type' => $type );
			}
			return $out;
		};
		switch ( $source ) {
			case 'posts':
				return $t( array( 'id', 'title', 'date', 'date_iso', 'author', 'thumbnail_id', 'categories', 'first_category', 'comments_count', 'reading_time', 'post_type', 'index' ), 'text' )
					+ $t( array( 'permalink', 'author_url', 'author_avatar', 'thumbnail', 'first_category_url' ), 'raw_url' )
					+ $t( array( 'excerpt' ), 'wysiwyg' )
					+ $t( array( 'is_sticky', 'has_thumbnail' ), 'switcher' );
			case 'products':
				return $t( array( 'id', 'title', 'price', 'regular_price', 'sale_price', 'currency', 'stock_status', 'rating', 'rating_count', 'review_count', 'add_to_cart_text', 'sku', 'categories', 'first_category', 'brand', 'discount_pct', 'index' ), 'text' )
					+ $t( array( 'permalink', 'thumbnail', 'hover_image', 'add_to_cart_url', 'first_category_url', 'brand_url' ), 'raw_url' )
					+ $t( array( 'price_html', 'short_description' ), 'wysiwyg' )
					+ $t( array( 'is_on_sale', 'is_featured', 'in_stock', 'has_thumbnail', 'has_hover_image' ), 'switcher' );
			case 'terms':
				return $t( array( 'id', 'name', 'slug', 'count', 'parent', 'index' ), 'text' )
					+ $t( array( 'url', 'thumbnail' ), 'raw_url' )
					+ $t( array( 'description' ), 'wysiwyg' )
					+ $t( array( 'is_child', 'has_thumbnail' ), 'switcher' );
			case 'menu':
				return $t( array( 'id', 'title', 'target', 'depth', 'parent_id', 'classes', 'index' ), 'text' )
					+ $t( array( 'url' ), 'raw_url' )
					+ $t( array( 'has_children', 'is_current', 'is_parent_of_current' ), 'switcher' );
			case 'site':
				return $t( array( 'name', 'tagline', 'logo_id', 'logo_width', 'logo_height', 'language', 'year', 'page_title', 'index' ), 'text' )
					+ $t( array( 'home_url', 'logo', 'icon', 'login_url', 'current_url', 'search_url', 'rss_url' ), 'raw_url' )
					+ $t( array( 'has_logo', 'has_icon', 'is_front', 'is_home', 'is_logged_in' ), 'switcher' );
			case 'breadcrumbs':
				return $t( array( 'title', 'kind', 'depth', 'index' ), 'text' )
					+ $t( array( 'url' ), 'raw_url' )
					+ $t( array( 'is_current', 'is_home', 'is_last' ), 'switcher' );
			case 'cart':
				return $t( array( 'key', 'id', 'name', 'quantity', 'price', 'line_total', 'variation', 'sku', 'index' ), 'text' )
					+ $t( array( 'permalink', 'thumbnail', 'remove_url' ), 'raw_url' )
					+ $t( array( 'has_thumbnail', 'is_on_sale' ), 'switcher' );
		}
		return array();
	}

	/**
	 * Root-level tokens a source adds beside {name}_found / {name}_error,
	 * e.g. {{cart_total}}. Same field-map shape as fields().
	 *
	 * @param string $source Source key.
	 * @return array<string, array{type: string}>
	 */
	public static function extras( string $source ): array {
		if ( 'cart' === $source ) {
			return array(
				'count'        => array( 'type' => 'text' ),
				'total'        => array( 'type' => 'text' ),
				'subtotal'     => array( 'type' => 'text' ),
				'total_html'   => array( 'type' => 'wysiwyg' ),
				'currency'     => array( 'type' => 'text' ),
				'cart_url'     => array( 'type' => 'raw_url' ),
				'checkout_url' => array( 'type' => 'raw_url' ),
				'shop_url'     => array( 'type' => 'raw_url' ),
				'is_empty'     => array( 'type' => 'switcher' ),
			);
		}
		return array();
	}

	/**
	 * Runtime values for extras(), unprefixed. Never throws.
	 *
	 * @param string $source   Source key.
	 * @param array  $settings Widget settings.
	 * @param string $name     Query control name.
	 * @return array<string, string>
	 */
	public static function extra_values( string $source, array $settings, string $name ): array {
		if ( 'cart' !== $source ) {
			return array();
		}
		$out = array( 'count' => '0', 'total' => '', 'subtotal' => '', 'total_html' => '', 'currency' => '', 'cart_url' => '', 'checkout_url' => '', 'shop_url' => '', 'is_empty' => 'yes' );
		try {
			if ( ! function_exists( 'WC' ) ) {
				return $out;
			}
			$out['cart_url']     = function_exists( 'wc_get_cart_url' ) ? (string) wc_get_cart_url() : '';
			$out['checkout_url'] = function_exists( 'wc_get_checkout_url' ) ? (string) wc_get_checkout_url() : '';
			$out['shop_url']     = function_exists( 'wc_get_page_permalink' ) ? (string) wc_get_page_permalink( 'shop' ) : '';
			$out['currency']     = function_exists( 'get_woocommerce_currency_symbol' ) ? html_entity_decode( (string) get_woocommerce_currency_symbol(), ENT_QUOTES, 'UTF-8' ) : '';
			$cart                = WC()->cart;
			if ( ! $cart ) {
				return $out;
			}
			$n                 = (int) $cart->get_cart_contents_count();
			$out['count']      = (string) $n;
			$out['is_empty']   = $n > 0 ? '' : 'yes';
			$out['total']      = self::strip_price( (string) $cart->get_cart_total() );
			$out['subtotal']   = self::strip_price( (string) $cart->get_cart_subtotal() );
			$out['total_html'] = (string) $cart->get_cart_total();
		} catch ( \Throwable $e ) {
			return $out;
		}
		return $out;
	}

	/**
	 * The editor controls generated for a `query` control, WITHOUT the name
	 * prefix. Each entry is a widget-builder control def the generator compiles
	 * like any other control. Options that depend on the site (post types,
	 * taxonomies, product categories, menus) are resolved here at register time.
	 *
	 * @param string $source Source key.
	 * @return array<int, array>
	 */
	public static function controls( string $source, string $preset = '' ): array {
		if ( 'remote' === $source ) {
			$p = class_exists( 'EMCP_Tools_Remote_Source' ) ? EMCP_Tools_Remote_Source::preset( $preset ) : null;
			return $p ? $p->controls() : array();
		}
		$order = array(
			'name'    => 'order',
			'type'    => 'select',
			'label'   => 'Order',
			'default' => 'DESC',
			'options' => array(
				array( 'value' => 'DESC', 'label' => 'Descending' ),
				array( 'value' => 'ASC', 'label' => 'Ascending' ),
			),
		);
		$ids   = static function ( string $name, string $label ): array {
			return array( 'name' => $name, 'type' => 'text', 'label' => $label, 'placeholder' => 'e.g. 12, 40, 87', 'description' => 'Comma-separated IDs.' );
		};
		switch ( $source ) {
			case 'posts':
				return array(
					array( 'name' => 'post_type', 'type' => 'select', 'label' => 'Post Type', 'default' => 'post', 'options' => self::post_type_options() ),
					array( 'name' => 'count', 'type' => 'number', 'label' => 'Number of Posts', 'default' => 6, 'min' => 1, 'max' => self::MAX_ROWS ),
					array(
						'name'    => 'orderby',
						'type'    => 'select',
						'label'   => 'Order By',
						'default' => 'date',
						'options' => array(
							array( 'value' => 'date', 'label' => 'Date' ),
							array( 'value' => 'title', 'label' => 'Title' ),
							array( 'value' => 'modified', 'label' => 'Last modified' ),
							array( 'value' => 'comment_count', 'label' => 'Comment count' ),
							array( 'value' => 'menu_order', 'label' => 'Menu order' ),
							array( 'value' => 'rand', 'label' => 'Random' ),
						),
					),
					$order,
					array( 'name' => 'taxonomy', 'type' => 'select', 'label' => 'Filter by Taxonomy', 'default' => '', 'options' => self::taxonomy_options( true ) ),
					array( 'name' => 'terms', 'type' => 'text', 'label' => 'Terms', 'placeholder' => 'news, tips', 'description' => 'Comma-separated term slugs or IDs (used with the taxonomy above).' ),
					$ids( 'include', 'Include Only (IDs)' ),
					$ids( 'exclude', 'Exclude (IDs)' ),
					array( 'name' => 'offset', 'type' => 'number', 'label' => 'Offset', 'default' => 0, 'min' => 0, 'max' => 500 ),
					array( 'name' => 'exclude_current', 'type' => 'switcher', 'label' => 'Exclude Current Post', 'default' => 'yes', 'return_value' => 'yes' ),
					array( 'name' => 'ignore_sticky', 'type' => 'switcher', 'label' => 'Ignore Sticky Posts', 'default' => 'yes', 'return_value' => 'yes' ),
				);
			case 'products':
				return array(
					array( 'name' => 'count', 'type' => 'number', 'label' => 'Number of Products', 'default' => 8, 'min' => 1, 'max' => self::MAX_ROWS ),
					array(
						'name'    => 'orderby',
						'type'    => 'select',
						'label'   => 'Order By',
						'default' => 'date',
						'options' => array(
							array( 'value' => 'date', 'label' => 'Date' ),
							array( 'value' => 'title', 'label' => 'Title' ),
							array( 'value' => 'price', 'label' => 'Price' ),
							array( 'value' => 'popularity', 'label' => 'Popularity (sales)' ),
							array( 'value' => 'rating', 'label' => 'Average rating' ),
							array( 'value' => 'menu_order', 'label' => 'Menu order' ),
							array( 'value' => 'rand', 'label' => 'Random' ),
						),
					),
					$order,
					array( 'name' => 'category', 'type' => 'select2', 'label' => 'Categories', 'multiple' => true, 'options' => self::term_options( 'product_cat' ) ),
					array( 'name' => 'tag', 'type' => 'text', 'label' => 'Tags', 'placeholder' => 'summer, new', 'description' => 'Comma-separated tag slugs.' ),
					array(
						'name'    => 'filter',
						'type'    => 'select',
						'label'   => 'Show',
						'default' => 'all',
						'options' => array(
							array( 'value' => 'all', 'label' => 'All products' ),
							array( 'value' => 'featured', 'label' => 'Featured' ),
							array( 'value' => 'on_sale', 'label' => 'On sale' ),
							array( 'value' => 'best_selling', 'label' => 'Best selling' ),
							array( 'value' => 'top_rated', 'label' => 'Top rated' ),
						),
					),
					$ids( 'include', 'Include Only (IDs)' ),
					$ids( 'exclude', 'Exclude (IDs)' ),
					array( 'name' => 'hide_out_of_stock', 'type' => 'switcher', 'label' => 'Hide Out of Stock', 'return_value' => 'yes' ),
				);
			case 'terms':
				return array(
					array( 'name' => 'taxonomy', 'type' => 'select', 'label' => 'Taxonomy', 'default' => 'category', 'options' => self::taxonomy_options( false ) ),
					array( 'name' => 'count', 'type' => 'number', 'label' => 'Number of Terms (0 = all)', 'default' => 12, 'min' => 0, 'max' => self::MAX_TERMS ),
					array(
						'name'    => 'orderby',
						'type'    => 'select',
						'label'   => 'Order By',
						'default' => 'name',
						'options' => array(
							array( 'value' => 'name', 'label' => 'Name' ),
							array( 'value' => 'count', 'label' => 'Item count' ),
							array( 'value' => 'menu_order', 'label' => 'Menu order' ),
							array( 'value' => 'id', 'label' => 'ID' ),
						),
					),
					array_merge( $order, array( 'default' => 'ASC' ) ),
					array( 'name' => 'hide_empty', 'type' => 'switcher', 'label' => 'Hide Empty Terms', 'default' => 'yes', 'return_value' => 'yes' ),
					array(
						'name'    => 'parent_mode',
						'type'    => 'select',
						'label'   => 'Hierarchy',
						'default' => 'top',
						'options' => array(
							array( 'value' => 'top', 'label' => 'Top-level terms only' ),
							array( 'value' => 'children', 'label' => 'Children of a parent (ID below)' ),
							array( 'value' => 'any', 'label' => 'All terms (flat)' ),
						),
					),
					array( 'name' => 'parent', 'type' => 'number', 'label' => 'Parent Term ID', 'default' => 0, 'min' => 0, 'condition' => array( 'parent_mode' => 'children' ) ),
					$ids( 'include', 'Include Only (IDs)' ),
					$ids( 'exclude', 'Exclude (IDs)' ),
				);
			case 'menu':
				return array(
					array( 'name' => 'menu', 'type' => 'select', 'label' => 'Menu', 'default' => '', 'options' => self::menu_options() ),
					array( 'name' => 'depth', 'type' => 'number', 'label' => 'Depth (0 = all levels)', 'default' => 0, 'min' => 0, 'max' => 5 ),
				);
			case 'site':
				return array(
					array(
						'name'    => 'logo_size',
						'type'    => 'select',
						'label'   => 'Logo Size',
						'default' => 'full',
						'options' => array(
							array( 'value' => 'full', 'label' => 'Full' ),
							array( 'value' => 'large', 'label' => 'Large' ),
							array( 'value' => 'medium', 'label' => 'Medium' ),
							array( 'value' => 'thumbnail', 'label' => 'Thumbnail' ),
						),
					),
					array( 'name' => 'fallback_logo', 'type' => 'media', 'label' => 'Fallback Logo (when the Customizer has none)' ),
				);
			case 'breadcrumbs':
				return array(
					array( 'name' => 'home_label', 'type' => 'text', 'label' => 'Home Label', 'default' => 'Home' ),
					array( 'name' => 'show_home', 'type' => 'switcher', 'label' => 'Show Home', 'default' => 'yes', 'return_value' => 'yes' ),
					array( 'name' => 'show_current', 'type' => 'switcher', 'label' => 'Show Current Page', 'default' => 'yes', 'return_value' => 'yes' ),
					array( 'name' => 'show_archive', 'type' => 'switcher', 'label' => 'Show Post Type Archive', 'default' => 'yes', 'return_value' => 'yes' ),
					array( 'name' => 'taxonomy', 'type' => 'select', 'label' => 'Term Trail for Posts', 'default' => 'category', 'options' => self::taxonomy_options( true ) ),
					array( 'name' => 'search_label', 'type' => 'text', 'label' => 'Search Label', 'default' => 'Search results for' ),
					array( 'name' => 'not_found_label', 'type' => 'text', 'label' => '404 Label', 'default' => 'Page not found' ),
				);
			case 'cart':
				return array(
					array(
						'name'    => 'thumb_size',
						'type'    => 'select',
						'label'   => 'Thumbnail Size',
						'default' => 'thumbnail',
						'options' => array(
							array( 'value' => 'thumbnail', 'label' => 'Thumbnail' ),
							array( 'value' => 'medium', 'label' => 'Medium' ),
						),
					),
				);
		}
		return array();
	}

	/**
	 * The full list of generated control names for a `query` control (prefixed),
	 * so the validator can reserve them.
	 *
	 * @param string $name   Query control name.
	 * @param string $source Source key.
	 * @return string[]
	 */
	public static function generated_names( string $name, string $source, string $preset = '' ): array {
		$out = array( $name . '_found', $name . '_error' );
		foreach ( self::controls( $source, $preset ) as $c ) {
			$out[] = $name . '_' . $c['name'];
		}
		foreach ( array_keys( self::extras( $source ) ) as $k ) {
			$out[] = $name . '_' . $k;
		}
		return array_values( array_unique( $out ) );
	}

	// -------------------------------------------------------------------------
	// Runtime
	// -------------------------------------------------------------------------

	/**
	 * Runs a query and returns flat rows. Never throws.
	 *
	 * @param string $source   Source key.
	 * @param array  $settings The widget's settings (get_settings_for_display()).
	 * @param string $name     The query control's name (settings prefix).
	 * @return array<int, array<string, string>>
	 */
	public static function run( string $source, array $settings, string $name, string $preset = '' ): array {
		self::$last_error = '';
		try {
			$s = self::prefixed( $settings, $name );
			switch ( $source ) {
				case 'remote':
					if ( ! class_exists( 'EMCP_Tools_Remote_Source' ) ) {
						return array();
					}
					$rows             = EMCP_Tools_Remote_Source::run( $preset, $s );
					self::$last_error = EMCP_Tools_Remote_Source::last_error();
					return $rows;
				case 'posts':
					return self::run_posts( $s );
				case 'products':
					return self::run_products( $s );
				case 'terms':
					return self::run_terms( $s );
				case 'menu':
					return self::run_menu( $s );
				case 'site':
					return self::run_site( $s );
				case 'breadcrumbs':
					return self::run_breadcrumbs( $s );
				case 'cart':
					return self::run_cart( $s );
			}
		} catch ( \Throwable $e ) {
			// A data source must never take the page down; surface the cause to the debug log only.
			if ( defined( 'WP_DEBUG' ) && WP_DEBUG ) {
				error_log( sprintf( '[EMCP Widget Query] %s source "%s" failed: %s in %s:%d', $name, $source, $e->getMessage(), $e->getFile(), $e->getLine() ) ); // phpcs:ignore WordPress.PHP.DevelopmentFunctions.error_log_error_log
			}
		}
		return array();
	}

	/**
	 * Extracts `{name}_*` settings into an unprefixed array.
	 *
	 * @param array  $settings Widget settings.
	 * @param string $name     Prefix.
	 * @return array
	 */
	public static function prefixed( array $settings, string $name ): array {
		$out = array();
		$p   = $name . '_';
		$len = strlen( $p );
		foreach ( $settings as $k => $v ) {
			if ( is_string( $k ) && 0 === strpos( $k, $p ) ) {
				$out[ substr( $k, $len ) ] = $v;
			}
		}
		return $out;
	}

	// ---- posts --------------------------------------------------------------

	/**
	 * Builds WP_Query args from unprefixed query settings. Pure.
	 *
	 * @param array $s          Unprefixed settings.
	 * @param int   $current_id The current post id (for exclude_current), 0 if none.
	 * @return array
	 */
	public static function build_post_args( array $s, int $current_id = 0 ): array {
		$count   = self::clamp( $s['count'] ?? 6, 1, self::MAX_ROWS );
		$orderby = (string) ( $s['orderby'] ?? 'date' );
		if ( ! in_array( $orderby, array( 'date', 'title', 'modified', 'comment_count', 'menu_order', 'rand' ), true ) ) {
			$orderby = 'date';
		}
		$args = array(
			'post_type'           => sanitize_key( (string) ( $s['post_type'] ?? 'post' ) ) ?: 'post',
			'post_status'         => 'publish',
			'posts_per_page'      => $count,
			'orderby'             => $orderby,
			'order'               => ( 'ASC' === strtoupper( (string) ( $s['order'] ?? 'DESC' ) ) ) ? 'ASC' : 'DESC',
			'no_found_rows'       => true,
			'ignore_sticky_posts' => self::on( $s['ignore_sticky'] ?? 'yes' ),
		);
		$offset = self::clamp( $s['offset'] ?? 0, 0, 500 );
		if ( $offset > 0 ) {
			$args['offset'] = $offset;
		}
		$include = self::id_list( $s['include'] ?? '' );
		$exclude = self::id_list( $s['exclude'] ?? '' );
		if ( self::on( $s['exclude_current'] ?? '' ) && $current_id > 0 ) {
			$exclude[] = $current_id;
		}
		if ( $include ) {
			$args['post__in'] = $include;
			if ( 'date' === $orderby ) {
				$args['orderby'] = 'post__in';
			}
		}
		if ( $exclude ) {
			$args['post__not_in'] = array_values( array_unique( $exclude ) );
		}
		$tax   = sanitize_key( (string) ( $s['taxonomy'] ?? '' ) );
		$terms = self::slug_or_id_list( $s['terms'] ?? '' );
		if ( '' !== $tax && $terms ) {
			$ids   = array_filter( $terms, 'is_int' );
			$slugs = array_filter( $terms, 'is_string' );
			$q     = array( 'relation' => 'OR' );
			if ( $ids ) {
				$q[] = array( 'taxonomy' => $tax, 'field' => 'term_id', 'terms' => array_values( $ids ) );
			}
			if ( $slugs ) {
				$q[] = array( 'taxonomy' => $tax, 'field' => 'slug', 'terms' => array_values( $slugs ) );
			}
			$args['tax_query'] = $q; // phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_tax_query
		}
		return $args;
	}

	/**
	 * @param array $s Unprefixed settings.
	 * @return array<int, array<string, string>>
	 */
	private static function run_posts( array $s ): array {
		$current = ( is_singular() && get_queried_object_id() ) ? (int) get_queried_object_id() : 0;
		$args    = self::build_post_args( $s, $current );
		if ( ! post_type_exists( $args['post_type'] ) ) {
			return array();
		}
		$query = new WP_Query( $args );
		$rows  = array();
		foreach ( $query->posts as $i => $post ) {
			$rows[] = self::post_row( $post, $i );
		}
		return $rows;
	}

	/**
	 * @param WP_Post $post  Post.
	 * @param int     $index Zero-based index.
	 * @return array<string, string>
	 */
	private static function post_row( $post, int $index ): array {
		$id      = (int) $post->ID;
		$tax     = ( 'post' === $post->post_type ) ? 'category' : self::first_public_taxonomy( $post->post_type );
		$terms   = $tax ? get_the_terms( $id, $tax ) : array();
		$terms   = ( is_array( $terms ) ) ? array_values( $terms ) : array();
		$first   = $terms ? $terms[0] : null;
		$thumb   = get_the_post_thumbnail_url( $id, 'large' );
		$content = (string) $post->post_content;
		$words   = str_word_count( wp_strip_all_tags( strip_shortcodes( $content ) ) );
		return array(
			'id'                 => (string) $id,
			'title'              => (string) get_the_title( $post ),
			'permalink'          => (string) get_permalink( $post ),
			'excerpt'            => wp_kses_post( get_the_excerpt( $post ) ),
			'date'               => (string) get_the_date( '', $post ),
			'date_iso'           => (string) get_the_date( 'c', $post ),
			'author'             => (string) get_the_author_meta( 'display_name', (int) $post->post_author ),
			'author_url'         => (string) get_author_posts_url( (int) $post->post_author ),
			'author_avatar'      => (string) get_avatar_url( (int) $post->post_author, array( 'size' => 96 ) ),
			'thumbnail'          => $thumb ? (string) $thumb : '',
			'thumbnail_id'       => (string) (int) get_post_thumbnail_id( $id ),
			'has_thumbnail'      => $thumb ? 'yes' : '',
			'categories'         => implode( ', ', array_map( static fn( $t ) => (string) $t->name, $terms ) ),
			'first_category'     => $first ? (string) $first->name : '',
			'first_category_url' => $first ? (string) get_term_link( $first ) : '',
			'comments_count'     => (string) (int) $post->comment_count,
			'reading_time'       => (string) max( 1, (int) ceil( $words / self::WPM ) ),
			'post_type'          => (string) $post->post_type,
			'is_sticky'          => is_sticky( $id ) ? 'yes' : '',
			'index'              => (string) $index,
		);
	}

	// ---- products -----------------------------------------------------------

	/**
	 * Builds wc_get_products() args from unprefixed settings. Pure.
	 *
	 * @param array $s Unprefixed settings.
	 * @return array
	 */
	public static function build_product_args( array $s ): array {
		$count   = self::clamp( $s['count'] ?? 8, 1, self::MAX_ROWS );
		$orderby = (string) ( $s['orderby'] ?? 'date' );
		$order   = ( 'ASC' === strtoupper( (string) ( $s['order'] ?? 'DESC' ) ) ) ? 'ASC' : 'DESC';
		$args    = array(
			'status'     => 'publish',
			'limit'      => $count,
			'order'      => $order,
			'visibility' => 'catalog',
			'return'     => 'objects',
		);
		switch ( $orderby ) {
			case 'price':
				$args['orderby'] = 'meta_value_num';
				$args['meta_key'] = '_price'; // phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_meta_key
				break;
			case 'popularity':
				$args['orderby'] = 'meta_value_num';
				$args['meta_key'] = 'total_sales'; // phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_meta_key
				break;
			case 'rating':
				$args['orderby'] = 'meta_value_num';
				$args['meta_key'] = '_wc_average_rating'; // phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_meta_key
				break;
			case 'title':
			case 'menu_order':
			case 'rand':
			case 'date':
				$args['orderby'] = $orderby;
				break;
			default:
				$args['orderby'] = 'date';
		}
		$cats = $s['category'] ?? array();
		$cats = is_array( $cats ) ? array_filter( array_map( 'sanitize_title', $cats ) ) : self::slug_list( (string) $cats );
		if ( $cats ) {
			$args['category'] = array_values( $cats );
		}
		$tags = self::slug_list( (string) ( $s['tag'] ?? '' ) );
		if ( $tags ) {
			$args['tag'] = $tags;
		}
		switch ( (string) ( $s['filter'] ?? 'all' ) ) {
			case 'featured':
				$args['featured'] = true;
				break;
			case 'best_selling':
				$args['orderby']  = 'meta_value_num';
				$args['meta_key'] = 'total_sales'; // phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_meta_key
				$args['order']    = 'DESC';
				break;
			case 'top_rated':
				$args['orderby']  = 'meta_value_num';
				$args['meta_key'] = '_wc_average_rating'; // phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_meta_key
				$args['order']    = 'DESC';
				break;
			case 'on_sale':
				$args['_on_sale'] = true; // resolved at run time (needs wc_get_product_ids_on_sale()).
				break;
		}
		$include = self::id_list( $s['include'] ?? '' );
		$exclude = self::id_list( $s['exclude'] ?? '' );
		if ( $include ) {
			$args['include'] = $include;
		}
		if ( $exclude ) {
			$args['exclude'] = $exclude;
		}
		if ( self::on( $s['hide_out_of_stock'] ?? '' ) ) {
			$args['stock_status'] = 'instock';
		}
		return $args;
	}

	/**
	 * @param array $s Unprefixed settings.
	 * @return array<int, array<string, string>>
	 */
	private static function run_products( array $s ): array {
		if ( ! function_exists( 'wc_get_products' ) ) {
			return array();
		}
		$args = self::build_product_args( $s );
		if ( ! empty( $args['_on_sale'] ) ) {
			unset( $args['_on_sale'] );
			$on_sale = function_exists( 'wc_get_product_ids_on_sale' ) ? (array) wc_get_product_ids_on_sale() : array();
			if ( ! $on_sale ) {
				return array();
			}
			$args['include'] = ! empty( $args['include'] ) ? array_values( array_intersect( $args['include'], $on_sale ) ) : $on_sale;
			if ( ! $args['include'] ) {
				return array();
			}
		}
		$products = wc_get_products( $args );
		$rows     = array();
		$i        = 0;
		foreach ( (array) $products as $product ) {
			if ( ! is_object( $product ) || ! method_exists( $product, 'get_id' ) ) {
				continue;
			}
			$rows[] = self::product_row( $product, $i++ );
		}
		return $rows;
	}

	/**
	 * @param object $p     WC_Product.
	 * @param int    $index Zero-based index.
	 * @return array<string, string>
	 */
	private static function product_row( $p, int $index ): array {
		$id      = (int) $p->get_id();
		$thumb   = get_the_post_thumbnail_url( $id, 'woocommerce_thumbnail' ) ?: get_the_post_thumbnail_url( $id, 'large' );
		$gallery = method_exists( $p, 'get_gallery_image_ids' ) ? (array) $p->get_gallery_image_ids() : array();
		$hover   = $gallery ? (string) wp_get_attachment_image_url( (int) $gallery[0], 'woocommerce_thumbnail' ) : '';
		$cats    = get_the_terms( $id, 'product_cat' );
		$cats    = is_array( $cats ) ? array_values( $cats ) : array();
		$brands  = taxonomy_exists( 'product_brand' ) ? get_the_terms( $id, 'product_brand' ) : array();
		$brands  = is_array( $brands ) ? array_values( $brands ) : array();
		$regular = (float) $p->get_regular_price();
		$sale    = (float) $p->get_sale_price();
		$pct     = ( $p->is_on_sale() && $regular > 0 && $sale > 0 ) ? (int) round( ( 1 - $sale / $regular ) * 100 ) : 0;
		return array(
			'id'                 => (string) $id,
			'title'              => (string) $p->get_name(),
			'permalink'          => (string) $p->get_permalink(),
			'thumbnail'          => $thumb ? (string) $thumb : ( function_exists( 'wc_placeholder_img_src' ) ? (string) wc_placeholder_img_src( 'woocommerce_thumbnail' ) : '' ),
			'has_thumbnail'      => $thumb ? 'yes' : '',
			'hover_image'        => $hover,
			'has_hover_image'    => $hover ? 'yes' : '',
			'price_html'         => wp_kses_post( (string) $p->get_price_html() ),
			'price'              => self::plain_price( (float) $p->get_price() ),
			'regular_price'      => $regular > 0 ? self::plain_price( $regular ) : '',
			'sale_price'         => $sale > 0 ? self::plain_price( $sale ) : '',
			'currency'           => function_exists( 'get_woocommerce_currency_symbol' ) ? html_entity_decode( (string) get_woocommerce_currency_symbol(), ENT_QUOTES ) : '',
			'is_on_sale'         => $p->is_on_sale() ? 'yes' : '',
			'is_featured'        => $p->is_featured() ? 'yes' : '',
			'in_stock'           => $p->is_in_stock() ? 'yes' : '',
			'stock_status'       => (string) $p->get_stock_status(),
			'rating'             => (string) round( (float) $p->get_average_rating(), 1 ),
			'rating_count'       => (string) (int) $p->get_rating_count(),
			'review_count'       => (string) (int) $p->get_review_count(),
			'add_to_cart_url'    => (string) $p->add_to_cart_url(),
			'add_to_cart_text'   => (string) $p->add_to_cart_text(),
			'sku'                => (string) $p->get_sku(),
			'short_description'  => wp_kses_post( (string) $p->get_short_description() ),
			'categories'         => implode( ', ', array_map( static fn( $t ) => (string) $t->name, $cats ) ),
			'first_category'     => $cats ? (string) $cats[0]->name : '',
			'first_category_url' => $cats ? (string) get_term_link( $cats[0] ) : '',
			'brand'              => $brands ? (string) $brands[0]->name : '',
			'brand_url'          => $brands ? (string) get_term_link( $brands[0] ) : '',
			'discount_pct'       => $pct > 0 ? (string) $pct : '',
			'index'              => (string) $index,
		);
	}

	// ---- terms --------------------------------------------------------------

	/**
	 * Builds get_terms() args from unprefixed settings. Pure.
	 *
	 * @param array $s Unprefixed settings.
	 * @return array
	 */
	public static function build_term_args( array $s ): array {
		$orderby = (string) ( $s['orderby'] ?? 'name' );
		if ( ! in_array( $orderby, array( 'name', 'count', 'menu_order', 'id' ), true ) ) {
			$orderby = 'name';
		}
		$args = array(
			'taxonomy'   => sanitize_key( (string) ( $s['taxonomy'] ?? 'category' ) ) ?: 'category',
			'hide_empty' => self::on( $s['hide_empty'] ?? 'yes' ),
			'orderby'    => ( 'id' === $orderby ) ? 'term_id' : ( 'menu_order' === $orderby ? 'meta_value_num' : $orderby ),
			'order'      => ( 'DESC' === strtoupper( (string) ( $s['order'] ?? 'ASC' ) ) ) ? 'DESC' : 'ASC',
		);
		if ( 'menu_order' === $orderby ) {
			$args['meta_key'] = 'order'; // phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_meta_key
		}
		$count = self::clamp( $s['count'] ?? 12, 0, self::MAX_TERMS );
		$args['number'] = $count > 0 ? $count : self::MAX_TERMS;
		switch ( (string) ( $s['parent_mode'] ?? 'top' ) ) {
			case 'children':
				$args['parent'] = self::clamp( $s['parent'] ?? 0, 0, PHP_INT_MAX );
				break;
			case 'any':
				break;
			default:
				$args['parent'] = 0;
		}
		$include = self::id_list( $s['include'] ?? '' );
		$exclude = self::id_list( $s['exclude'] ?? '' );
		if ( $include ) {
			$args['include'] = $include;
			unset( $args['parent'] );
		}
		if ( $exclude ) {
			$args['exclude'] = $exclude;
		}
		return $args;
	}

	/**
	 * @param array $s Unprefixed settings.
	 * @return array<int, array<string, string>>
	 */
	private static function run_terms( array $s ): array {
		$args = self::build_term_args( $s );
		if ( ! taxonomy_exists( $args['taxonomy'] ) ) {
			return array();
		}
		$terms = get_terms( $args );
		if ( is_wp_error( $terms ) || ! is_array( $terms ) ) {
			return array();
		}
		$rows = array();
		foreach ( array_values( $terms ) as $i => $term ) {
			$thumb_id = (int) get_term_meta( (int) $term->term_id, 'thumbnail_id', true );
			$thumb    = $thumb_id ? (string) wp_get_attachment_image_url( $thumb_id, 'large' ) : '';
			$rows[]   = array(
				'id'            => (string) (int) $term->term_id,
				'name'          => (string) $term->name,
				'slug'          => (string) $term->slug,
				'url'           => (string) get_term_link( $term ),
				'count'         => (string) (int) $term->count,
				'description'   => wp_kses_post( (string) $term->description ),
				'thumbnail'     => $thumb,
				'has_thumbnail' => $thumb ? 'yes' : '',
				'parent'        => (string) (int) $term->parent,
				'is_child'      => (int) $term->parent > 0 ? 'yes' : '',
				'index'         => (string) $i,
			);
		}
		return $rows;
	}

	// ---- menu ---------------------------------------------------------------

	/**
	 * @param array $s Unprefixed settings.
	 * @return array<int, array<string, string>>
	 */
	private static function run_menu( array $s ): array {
		$menu = (string) ( $s['menu'] ?? '' );
		if ( '' === $menu ) {
			$locations = get_nav_menu_locations();
			$menu      = $locations ? (string) reset( $locations ) : '';
			if ( '' === $menu ) {
				$all  = wp_get_nav_menus();
				$menu = $all ? (string) $all[0]->term_id : '';
			}
		}
		if ( '' === $menu ) {
			return array();
		}
		$items = wp_get_nav_menu_items( is_numeric( $menu ) ? (int) $menu : $menu );
		if ( ! is_array( $items ) || ! $items ) {
			return array();
		}
		_wp_menu_item_classes_by_context( $items );
		$max_depth = self::clamp( $s['depth'] ?? 0, 0, 5 );

		$by_parent = array();
		foreach ( $items as $it ) {
			$by_parent[ (int) $it->menu_item_parent ][] = $it;
		}
		$rows = array();
		$idx  = 0;
		$walk = static function ( int $parent, int $depth ) use ( &$walk, &$rows, &$idx, $by_parent, $max_depth ): void {
			if ( empty( $by_parent[ $parent ] ) ) {
				return;
			}
			if ( $max_depth > 0 && $depth >= $max_depth ) {
				return;
			}
			foreach ( $by_parent[ $parent ] as $it ) {
				$classes  = is_array( $it->classes ) ? array_filter( array_map( 'sanitize_html_class', $it->classes ) ) : array();
				$children = ! empty( $by_parent[ (int) $it->ID ] ) && ( 0 === $max_depth || $depth + 1 < $max_depth );
				$rows[]   = array(
					'id'                   => (string) (int) $it->ID,
					'title'                => (string) $it->title,
					'url'                  => (string) $it->url,
					'target'               => (string) $it->target,
					'depth'                => (string) $depth,
					'parent_id'            => (string) (int) $it->menu_item_parent,
					'classes'              => implode( ' ', $classes ),
					'has_children'         => $children ? 'yes' : '',
					'is_current'           => in_array( 'current-menu-item', $classes, true ) ? 'yes' : '',
					'is_parent_of_current' => ( in_array( 'current-menu-ancestor', $classes, true ) || in_array( 'current-menu-parent', $classes, true ) ) ? 'yes' : '',
					'index'                => (string) $idx++,
				);
				$walk( (int) $it->ID, $depth + 1 );
			}
		};
		$walk( 0, 0 );
		return $rows;
	}

	// ---- site ---------------------------------------------------------------

	/**
	 * One row of site identity: name, tagline, logo, URLs. Fits header widgets
	 * (Site Logo) and footers (copyright year) without a bespoke source each.
	 *
	 * @param array $s Unprefixed settings.
	 * @return array<int, array<string, string>>
	 */
	private static function run_site( array $s ): array {
		$size    = (string) ( $s['logo_size'] ?? 'full' );
		$logo_id = (int) get_theme_mod( 'custom_logo' );
		$logo    = '';
		$w       = '';
		$h       = '';
		if ( $logo_id ) {
			$src = wp_get_attachment_image_src( $logo_id, $size ? $size : 'full' );
			if ( $src ) {
				$logo = (string) $src[0];
				$w    = (string) (int) $src[1];
				$h    = (string) (int) $src[2];
			}
		}
		if ( '' === $logo && ! empty( $s['fallback_logo']['url'] ) ) {
			$logo    = (string) $s['fallback_logo']['url'];
			$logo_id = (int) ( $s['fallback_logo']['id'] ?? 0 );
		}
		$icon = function_exists( 'get_site_icon_url' ) ? (string) get_site_icon_url( 192 ) : '';
		$req  = isset( $_SERVER['REQUEST_URI'] ) && is_string( $_SERVER['REQUEST_URI'] ) ? esc_url_raw( wp_unslash( $_SERVER['REQUEST_URI'] ) ) : '/'; // phpcs:ignore WordPress.Security.ValidatedSanitizedInput.InputNotSanitized
		return array(
			array(
				'name'         => (string) get_bloginfo( 'name' ),
				'tagline'      => (string) get_bloginfo( 'description' ),
				'home_url'     => (string) home_url( '/' ),
				'logo'         => $logo,
				'logo_id'      => (string) $logo_id,
				'logo_width'   => $w,
				'logo_height'  => $h,
				'has_logo'     => '' !== $logo ? 'yes' : '',
				'icon'         => $icon,
				'has_icon'     => '' !== $icon ? 'yes' : '',
				'language'     => (string) get_bloginfo( 'language' ),
				'year'         => (string) wp_date( 'Y' ),
				'page_title'   => function_exists( 'wp_get_document_title' ) ? (string) wp_get_document_title() : '',
				'login_url'    => (string) wp_login_url(),
				'current_url'  => (string) home_url( $req ),
				'search_url'   => (string) home_url( '/?s=' ),
				'rss_url'      => (string) get_bloginfo( 'rss2_url' ),
				'is_front'     => is_front_page() ? 'yes' : '',
				'is_home'      => is_home() ? 'yes' : '',
				'is_logged_in' => is_user_logged_in() ? 'yes' : '',
				'index'        => '0',
			),
		);
	}

	// ---- breadcrumbs --------------------------------------------------------

	/**
	 * Pushes a term and its ancestors onto the trail.
	 *
	 * @param array    $trail Trail (by reference).
	 * @param \WP_Term $term  Term.
	 */
	private static function crumb_terms( array &$trail, \WP_Term $term ): void {
		foreach ( array_reverse( (array) get_ancestors( (int) $term->term_id, $term->taxonomy, 'taxonomy' ) ) as $aid ) {
			$a = get_term( (int) $aid, $term->taxonomy );
			if ( $a && ! is_wp_error( $a ) ) {
				$trail[] = array( 'title' => (string) $a->name, 'url' => (string) get_term_link( $a ), 'kind' => 'term' );
			}
		}
		$trail[] = array( 'title' => (string) $term->name, 'url' => (string) get_term_link( $term ), 'kind' => 'term' );
	}

	/**
	 * The trail for the current request: Home > (post type archive) > (term or
	 * page ancestors) > current. Built from the main query so it is right in
	 * a Themer body template; in the editor it resolves against the edited post.
	 *
	 * @param array $s Unprefixed settings.
	 * @return array<int, array<string, string>>
	 */
	private static function run_breadcrumbs( array $s ): array {
		$trail = array();
		$push  = static function ( string $title, string $url, string $kind ) use ( &$trail ): void {
			if ( '' !== $title ) {
				$trail[] = array( 'title' => $title, 'url' => $url, 'kind' => $kind );
			}
		};
		if ( 'yes' === (string) ( $s['show_home'] ?? 'yes' ) ) {
			$push( (string) ( $s['home_label'] ?? 'Home' ), (string) home_url( '/' ), 'home' );
		}
		$show_archive = 'yes' === (string) ( $s['show_archive'] ?? 'yes' );
		$tax          = (string) ( $s['taxonomy'] ?? 'category' );
		$obj          = get_queried_object();

		if ( is_front_page() && ! is_home() ) {
			// Home only.
		} elseif ( is_home() ) {
			$pp = (int) get_option( 'page_for_posts' );
			$push( $pp ? (string) get_the_title( $pp ) : (string) get_bloginfo( 'name' ), $pp ? (string) get_permalink( $pp ) : (string) home_url( '/' ), 'current' );
		} elseif ( is_search() ) {
			$push( trim( (string) ( $s['search_label'] ?? 'Search results for' ) . ' "' . get_search_query() . '"' ), '', 'current' );
		} elseif ( is_404() ) {
			$push( (string) ( $s['not_found_label'] ?? 'Page not found' ), '', 'current' );
		} elseif ( is_author() && $obj instanceof \WP_User ) {
			$push( (string) $obj->display_name, (string) get_author_posts_url( (int) $obj->ID ), 'current' );
		} elseif ( is_date() ) {
			$y = (int) get_query_var( 'year' );
			if ( is_year() ) {
				$push( (string) $y, '', 'current' );
			} elseif ( is_month() ) {
				$push( (string) $y, (string) get_year_link( $y ), 'date' );
				$push( (string) single_month_title( ' ', false ), '', 'current' );
			} else {
				$push( (string) $y, (string) get_year_link( $y ), 'date' );
				$push( (string) single_month_title( ' ', false ), (string) get_month_link( $y, (int) get_query_var( 'monthnum' ) ), 'date' );
				$push( (string) get_query_var( 'day' ), '', 'current' );
			}
		} elseif ( is_post_type_archive() && $obj instanceof \WP_Post_Type ) {
			$push( (string) $obj->labels->name, (string) get_post_type_archive_link( $obj->name ), 'current' );
		} elseif ( ( is_category() || is_tag() || is_tax() ) && $obj instanceof \WP_Term ) {
			$tx = get_taxonomy( $obj->taxonomy );
			if ( $show_archive && $tx && ! empty( $tx->object_type[0] ) && 'post' !== $tx->object_type[0] ) {
				$pt_obj = get_post_type_object( $tx->object_type[0] );
				if ( $pt_obj && $pt_obj->has_archive ) {
					$push( (string) $pt_obj->labels->name, (string) get_post_type_archive_link( $pt_obj->name ), 'archive' );
				} elseif ( 'product' === $tx->object_type[0] && function_exists( 'wc_get_page_id' ) && (int) wc_get_page_id( 'shop' ) > 0 ) {
					$push( (string) get_the_title( (int) wc_get_page_id( 'shop' ) ), (string) get_permalink( (int) wc_get_page_id( 'shop' ) ), 'archive' );
				}
			}
			self::crumb_terms( $trail, $obj );
			$last         = count( $trail ) - 1;
			$trail[ $last ]['kind'] = 'current';
		} else {
			$post = $obj instanceof \WP_Post ? $obj : get_post();
			if ( $post instanceof \WP_Post ) {
				$post_id = (int) $post->ID;
				$pt_obj  = get_post_type_object( $post->post_type );
				if ( 'post' === $post->post_type ) {
					$pp = (int) get_option( 'page_for_posts' );
					if ( $show_archive && $pp ) {
						$push( (string) get_the_title( $pp ), (string) get_permalink( $pp ), 'archive' );
					}
					if ( '' !== $tax && taxonomy_exists( $tax ) ) {
						$terms = get_the_terms( $post_id, $tax );
						if ( is_array( $terms ) && $terms ) {
							self::crumb_terms( $trail, $terms[0] );
						}
					}
				} elseif ( 'product' === $post->post_type ) {
					if ( $show_archive && function_exists( 'wc_get_page_id' ) && (int) wc_get_page_id( 'shop' ) > 0 ) {
						$push( (string) get_the_title( (int) wc_get_page_id( 'shop' ) ), (string) get_permalink( (int) wc_get_page_id( 'shop' ) ), 'archive' );
					}
					if ( '' !== $tax && taxonomy_exists( 'product_cat' ) ) {
						$terms = get_the_terms( $post_id, 'product_cat' );
						if ( is_array( $terms ) && $terms ) {
							self::crumb_terms( $trail, $terms[0] );
						}
					}
				} elseif ( $pt_obj && $show_archive && $pt_obj->has_archive ) {
					$push( (string) $pt_obj->labels->name, (string) get_post_type_archive_link( $post->post_type ), 'archive' );
				}
				if ( $pt_obj && $pt_obj->hierarchical ) {
					foreach ( array_reverse( (array) get_post_ancestors( $post ) ) as $aid ) {
						$push( (string) get_the_title( (int) $aid ), (string) get_permalink( (int) $aid ), 'ancestor' );
					}
				}
				$push( (string) get_the_title( $post ), (string) get_permalink( $post ), 'current' );
			}
		}
		if ( 'yes' !== (string) ( $s['show_current'] ?? 'yes' ) && $trail && 'current' === end( $trail )['kind'] ) {
			array_pop( $trail );
		}
		$rows = array();
		$n    = count( $trail );
		foreach ( array_values( $trail ) as $i => $c ) {
			$rows[] = array(
				'title'      => $c['title'],
				'url'        => $c['url'],
				'kind'       => $c['kind'],
				'depth'      => (string) $i,
				'is_current' => 'current' === $c['kind'] ? 'yes' : '',
				'is_home'    => 'home' === $c['kind'] ? 'yes' : '',
				'is_last'    => $i === $n - 1 ? 'yes' : '',
				'index'      => (string) $i,
			);
		}
		return $rows;
	}

	// ---- cart ---------------------------------------------------------------

	/**
	 * The current WooCommerce cart's line items. Totals and URLs come through
	 * extra_values() as root tokens.
	 *
	 * @param array $s Unprefixed settings.
	 * @return array<int, array<string, string>>
	 */
	private static function run_cart( array $s ): array {
		if ( ! function_exists( 'WC' ) ) {
			self::$last_error = 'WooCommerce is not active.';
			return array();
		}
		$cart = WC()->cart;
		if ( ! $cart ) {
			return array();
		}
		$size = (string) ( $s['thumb_size'] ?? 'thumbnail' );
		$rows = array();
		$i    = 0;
		foreach ( $cart->get_cart() as $key => $item ) {
			$product = $item['data'] ?? null;
			if ( ! $product || ! is_object( $product ) ) {
				continue;
			}
			$thumb = '';
			$tid   = (int) $product->get_image_id();
			if ( $tid ) {
				$src   = wp_get_attachment_image_src( $tid, $size ? $size : 'thumbnail' );
				$thumb = $src ? (string) $src[0] : '';
			}
			$variation = '';
			if ( ! empty( $item['variation'] ) && is_array( $item['variation'] ) ) {
				$parts = array();
				foreach ( $item['variation'] as $k => $v ) {
					$parts[] = ucfirst( str_replace( array( 'attribute_pa_', 'attribute_' ), '', (string) $k ) ) . ': ' . (string) $v;
				}
				$variation = implode( ', ', $parts );
			}
			$rows[] = array(
				'key'           => (string) $key,
				'id'            => (string) (int) ( $item['product_id'] ?? 0 ),
				'name'          => (string) $product->get_name(),
				'permalink'     => (string) $product->get_permalink(),
				'thumbnail'     => $thumb,
				'has_thumbnail' => '' !== $thumb ? 'yes' : '',
				'quantity'      => (string) (int) ( $item['quantity'] ?? 1 ),
				'price'         => self::plain_price( (float) $product->get_price() ),
				'line_total'    => self::plain_price( (float) ( $item['line_total'] ?? 0 ) ),
				'variation'     => $variation,
				'sku'           => (string) $product->get_sku(),
				'is_on_sale'    => $product->is_on_sale() ? 'yes' : '',
				'remove_url'    => (string) wc_get_cart_remove_url( (string) $key ),
				'index'         => (string) $i++,
			);
		}
		return $rows;
	}

	// -------------------------------------------------------------------------
	// Option builders (register time)
	// -------------------------------------------------------------------------

	/** @return array<int, array{value:string,label:string}> */
	private static function post_type_options(): array {
		$out = array();
		if ( ! function_exists( 'get_post_types' ) ) {
			return array( array( 'value' => 'post', 'label' => 'Posts' ) );
		}
		foreach ( get_post_types( array( 'public' => true ), 'objects' ) as $pt ) {
			if ( in_array( $pt->name, array( 'attachment', 'elementor_library', 'e-landing-page' ), true ) ) {
				continue;
			}
			$out[] = array( 'value' => (string) $pt->name, 'label' => (string) $pt->labels->name );
		}
		return $out ?: array( array( 'value' => 'post', 'label' => 'Posts' ) );
	}

	/**
	 * @param bool $with_none Prepend a "None" option.
	 * @return array<int, array{value:string,label:string}>
	 */
	private static function taxonomy_options( bool $with_none ): array {
		$out = $with_none ? array( array( 'value' => '', 'label' => 'None' ) ) : array();
		if ( ! function_exists( 'get_taxonomies' ) ) {
			return $out ?: array( array( 'value' => 'category', 'label' => 'Categories' ) );
		}
		foreach ( get_taxonomies( array( 'public' => true ), 'objects' ) as $tx ) {
			if ( 'post_format' === $tx->name ) {
				continue;
			}
			$out[] = array( 'value' => (string) $tx->name, 'label' => (string) $tx->labels->name . ' (' . $tx->name . ')' );
		}
		return $out;
	}

	/**
	 * @param string $taxonomy Taxonomy.
	 * @return array<int, array{value:string,label:string}>
	 */
	private static function term_options( string $taxonomy ): array {
		if ( ! function_exists( 'taxonomy_exists' ) || ! taxonomy_exists( $taxonomy ) ) {
			return array();
		}
		$terms = get_terms( array( 'taxonomy' => $taxonomy, 'hide_empty' => false, 'number' => 200, 'orderby' => 'name' ) );
		if ( is_wp_error( $terms ) || ! is_array( $terms ) ) {
			return array();
		}
		$out = array();
		foreach ( $terms as $t ) {
			$out[] = array( 'value' => (string) $t->slug, 'label' => (string) $t->name );
		}
		return $out;
	}

	/** @return array<int, array{value:string,label:string}> */
	private static function menu_options(): array {
		$out = array( array( 'value' => '', 'label' => 'Primary (first assigned location)' ) );
		if ( ! function_exists( 'wp_get_nav_menus' ) ) {
			return $out;
		}
		foreach ( (array) wp_get_nav_menus() as $m ) {
			$out[] = array( 'value' => (string) $m->term_id, 'label' => (string) $m->name );
		}
		return $out;
	}

	// -------------------------------------------------------------------------
	// Helpers
	// -------------------------------------------------------------------------

	/**
	 * First public taxonomy attached to a post type (for the categories fields).
	 *
	 * @param string $post_type Post type.
	 * @return string
	 */
	private static function first_public_taxonomy( string $post_type ): string {
		foreach ( get_object_taxonomies( $post_type, 'objects' ) as $tx ) {
			if ( $tx->public && 'post_format' !== $tx->name ) {
				return (string) $tx->name;
			}
		}
		return '';
	}

	/**
	 * A formatted price as plain text ("$12.00"): wc_price() markup stripped and
	 * its entities decoded, so the template's esc_html() does not double-encode.
	 *
	 * @param float $amount Amount.
	 * @return string
	 */
	/**
	 * Plain text from a wc_price()-style HTML fragment (entities decoded, NBSP normalised).
	 *
	 * @param string $html Price markup.
	 * @return string
	 */
	private static function strip_price( string $html ): string {
		$txt = html_entity_decode( wp_strip_all_tags( $html ), ENT_QUOTES | ENT_HTML5, 'UTF-8' );
		return trim( str_replace( "\xC2\xA0", ' ', $txt ) );
	}

	private static function plain_price( float $amount ): string {
		if ( ! function_exists( 'wc_price' ) ) {
			return (string) $amount;
		}
		$txt = html_entity_decode( wp_strip_all_tags( (string) wc_price( $amount ) ), ENT_QUOTES | ENT_HTML5, 'UTF-8' );
		return trim( str_replace( "\xC2\xA0", ' ', $txt ) );
	}

	/**
	 * @param mixed $v   Value.
	 * @param int   $min Min.
	 * @param int   $max Max.
	 * @return int
	 */
	private static function clamp( $v, int $min, int $max ): int {
		$n = is_numeric( $v ) ? (int) $v : $min;
		return max( $min, min( $max, $n ) );
	}

	/**
	 * @param mixed $v Switcher value.
	 * @return bool
	 */
	private static function on( $v ): bool {
		return 'yes' === $v || true === $v || 1 === $v || '1' === $v;
	}

	/**
	 * "12, 40,87" => [12, 40, 87].
	 *
	 * @param mixed $v Raw value.
	 * @return int[]
	 */
	public static function id_list( $v ): array {
		if ( is_array( $v ) ) {
			$v = implode( ',', $v );
		}
		$out = array();
		foreach ( explode( ',', (string) $v ) as $p ) {
			$p = trim( $p );
			if ( '' !== $p && is_numeric( $p ) && (int) $p > 0 ) {
				$out[] = (int) $p;
			}
		}
		return array_values( array_unique( $out ) );
	}

	/**
	 * "news, 12, tips" => ['news', 12, 'tips'] (ints for numeric entries).
	 *
	 * @param mixed $v Raw value.
	 * @return array<int, int|string>
	 */
	public static function slug_or_id_list( $v ): array {
		$out = array();
		foreach ( explode( ',', (string) $v ) as $p ) {
			$p = trim( $p );
			if ( '' === $p ) {
				continue;
			}
			$out[] = is_numeric( $p ) ? (int) $p : sanitize_title( $p );
		}
		return array_values( array_unique( $out, SORT_REGULAR ) );
	}

	/**
	 * "summer, New Arrivals" => ['summer', 'new-arrivals'].
	 *
	 * @param string $v Raw value.
	 * @return string[]
	 */
	public static function slug_list( string $v ): array {
		$out = array();
		foreach ( explode( ',', $v ) as $p ) {
			$p = sanitize_title( trim( $p ) );
			if ( '' !== $p ) {
				$out[] = $p;
			}
		}
		return array_values( array_unique( $out ) );
	}
}
