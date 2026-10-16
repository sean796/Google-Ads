<?php
/**
 * Base class for Elementor addon widget packs (Essential Addons, Premium Addons, ...).
 *
 * These packs are NOT data plugins, so they deliberately do not follow the
 * read/write dispatcher shape used by ACF, WooCommerce, SEO and Forms. An addon
 * pack registers widgets into Elementor's own widget registry, which means EMCP
 * can already PLACE them today: `add-free-widget` accepts any registered
 * `widget_type` and passes every valid control through.
 *
 * What is missing is discovery and curation:
 *
 *  - Discovery: `list-widgets` serves the curated 62-widget catalog only, so an
 *    agent has no way to learn that `eael-pricing-table` exists.
 *  - Curation: an addon widget's raw control set runs to 400-700 controls, which
 *    is unusable in a prompt and would blow the context window.
 *
 * So each pack exposes ONE read tool with two operations (list + schema) and no
 * write tool. Placement stays on `add-free-widget`, which avoids duplicating an
 * existing code path and keeps the tool surface small.
 *
 * The source of truth is Elementor's live registry rather than the addon's own
 * internals, because the registry reflects what is ACTUALLY active (free vs pro
 * tier, conditionally registered widgets) and needs no per-plugin scraping.
 *
 * @package EMCP_Tools
 * @since   3.6.0
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Shared behaviour for an Elementor addon widget pack.
 *
 * @since 3.6.0
 */
abstract class EMCP_Tools_Addon_Pack_Integration {

	/**
	 * Control types that carry content or structural meaning. Everything else
	 * (sliders, switchers, popover toggles, raw_html dividers, colour pickers)
	 * is pure styling chrome and is dropped from the default schema view.
	 *
	 * @var string[]
	 */
	const CONTENT_TYPES = array(
		'text',
		'textarea',
		'wysiwyg',
		'media',
		'url',
		'repeater',
		'icons',
		'icon',
		'gallery',
		'select',
		'select2',
		'number',
		'choose',
	);

	/**
	 * Default cap on returned controls, so a single call stays prompt-sized.
	 *
	 * @var int
	 */
	const DEFAULT_CAP = 80;

	/**
	 * Short pack id, used to build the tool name (`<id>-read`).
	 *
	 * @return string
	 */
	abstract public function id(): string;

	/**
	 * Human label for the pack.
	 *
	 * @return string
	 */
	abstract public function label(): string;

	/**
	 * Widget-name prefixes that belong to this pack (e.g. `eael-`).
	 *
	 * @return string[]
	 */
	abstract public function prefixes(): array;

	/**
	 * True when the addon plugin is active.
	 *
	 * @return bool
	 */
	abstract public function is_active(): bool;

	/**
	 * Registers only when the plugin is active AND the licence allows Pro code.
	 *
	 * @return bool
	 */
	public function is_available(): bool {
		if ( ! $this->is_active() ) {
			return false;
		}
		if ( ! defined( 'ELEMENTOR_VERSION' ) ) {
			return false;
		}
		if ( function_exists( 'emcp_tools_fs' ) && ! emcp_tools_fs()->can_use_premium_code() ) {
			return false;
		}
		return true;
	}

	/**
	 * The single read tool this pack exposes.
	 *
	 * @return string
	 */
	final public function read_tool(): string {
		return 'emcp-tools/' . $this->id() . '-read';
	}

	/**
	 * Ability names contributed by this pack.
	 *
	 * Not final: a pack that is also a data plugin (Ultimate Addons for
	 * Elementor, which registers widgets AND stores header/footer templates)
	 * contributes a write dispatcher on top of the discovery tool.
	 *
	 * @return string[]
	 */
	public function get_ability_names(): array {
		return array( $this->read_tool() );
	}

	/**
	 * Read permission. Discovery is read-only metadata, so the same capability
	 * the rest of the query/discovery group uses.
	 *
	 * @return bool
	 */
	public function can_read(): bool {
		return current_user_can( 'edit_posts' );
	}

	/**
	 * Registers the pack's read ability.
	 *
	 * @return void
	 */
	public function register(): void {
		$label = $this->label();

		emcp_tools_register_ability(
			$this->read_tool(),
			array(
				// The `category` key is REQUIRED. Without it wp_register_ability()
				// silently drops the ability (learned on the Themes domain).
				'category'            => 'emcp-tools',
				'label'               => sprintf( '%s: read', $label ),
				'description'         => $this->read_description(),
				'input_schema'        => array(
					'type'       => 'object',
					'properties' => array(
						'operation' => array(
							'type'        => 'string',
							'description' => 'Operation to run. Omit to get the catalog of operations.',
							'enum'        => array_keys( $this->operations() ),
						),
						'arguments' => array(
							'type'        => 'object',
							'description' => 'Arguments for the operation.',
						),
					),
				),
				'permission_callback' => array( $this, 'can_read' ),
				'execute_callback'    => array( $this, 'run_read' ),
			)
		);
	}

	/**
	 * Operation map for this pack.
	 *
	 * @return array<string, array>
	 */
	protected function operations(): array {
		return array(
			'list-widgets'      => array(
				'run'  => 'op_list_widgets',
				'desc' => 'List the pack\'s widgets that are actually registered in Elementor. Filter with `search` or `category`. Step 1 of discover, inspect, act.',
			),
			'get-widget-schema' => array(
				'run'  => 'op_get_widget_schema',
				'desc' => 'Content-bearing controls for a widget `type` (or `types` array). Pass `full: true` for every control including styling. Step 2.',
			),
		);
	}

	/**
	 * Dispatches a read operation.
	 *
	 * @param mixed $input Tool input.
	 * @return array|WP_Error
	 */
	public function run_read( $input ) {
		$input = is_array( $input ) ? $input : array();
		$op    = isset( $input['operation'] ) ? sanitize_text_field( (string) $input['operation'] ) : '';
		$args  = isset( $input['arguments'] ) && is_array( $input['arguments'] ) ? $input['arguments'] : array();

		if ( ! $this->is_active() ) {
			return new WP_Error(
				'plugin_inactive',
				sprintf( '%s is not active on this site.', $this->label() )
			);
		}

		$ops = $this->operations();

		// No operation given: return the catalog so the agent can choose.
		if ( '' === $op ) {
			$catalog = array();
			foreach ( $ops as $name => $spec ) {
				$catalog[] = array(
					'operation'   => $name,
					'description' => $spec['desc'],
				);
			}
			return array(
				'pack'       => $this->label(),
				'operations' => $catalog,
				'note'       => 'To PLACE one of these widgets use `add-free-widget` with the widget `type` from `list-widgets`. This pack has no add tool of its own.',
			);
		}

		if ( ! isset( $ops[ $op ] ) ) {
			return new WP_Error(
				'unknown_operation',
				sprintf( 'Unknown operation "%s". Call with no operation to list them.', $op )
			);
		}

		$method = $ops[ $op ]['run'];
		return $this->$method( $args );
	}

	// ---------------------------------------------------------------------
	// Operations
	// ---------------------------------------------------------------------

	/**
	 * Lists this pack's registered widgets.
	 *
	 * @param array $args Operation arguments.
	 * @return array
	 */
	protected function op_list_widgets( array $args ): array {
		$search   = isset( $args['search'] ) ? strtolower( sanitize_text_field( (string) $args['search'] ) ) : '';
		$category = isset( $args['category'] ) ? sanitize_text_field( (string) $args['category'] ) : '';

		$out = array();
		foreach ( $this->pack_widgets() as $type => $widget ) {
			$title      = method_exists( $widget, 'get_title' ) ? (string) $widget->get_title() : $type;
			$categories = method_exists( $widget, 'get_categories' ) ? (array) $widget->get_categories() : array();

			if ( '' !== $search && false === strpos( strtolower( $type . ' ' . $title ), $search ) ) {
				continue;
			}
			if ( '' !== $category && ! in_array( $category, $categories, true ) ) {
				continue;
			}

			$out[] = array(
				'type'       => $type,
				'title'      => $title,
				'categories' => $categories,
			);
		}

		return array(
			'pack'    => $this->label(),
			'count'   => count( $out ),
			'widgets' => $out,
			'next'    => 'Inspect one with operation `get-widget-schema`, then place it with `add-free-widget` using its `type`.',
		);
	}

	/**
	 * Returns curated controls for one or more widgets.
	 *
	 * @param array $args Operation arguments.
	 * @return array|WP_Error
	 */
	protected function op_get_widget_schema( array $args ) {
		$types = array();
		if ( ! empty( $args['types'] ) && is_array( $args['types'] ) ) {
			$types = array_map( 'sanitize_text_field', $args['types'] );
		} elseif ( ! empty( $args['type'] ) ) {
			$types = array( sanitize_text_field( (string) $args['type'] ) );
		}

		if ( empty( $types ) ) {
			return new WP_Error( 'missing_type', 'Provide `type` (or `types`) from `list-widgets`.' );
		}

		$full = ! empty( $args['full'] );
		$pack = $this->pack_widgets();
		$out  = array();

		foreach ( $types as $type ) {
			if ( ! isset( $pack[ $type ] ) ) {
				$out[ $type ] = array( 'error' => 'Not a widget of this pack, or not registered. Use `list-widgets`.' );
				continue;
			}

			$controls = $pack[ $type ]->get_controls();
			$total    = count( $controls );

			if ( ! $full ) {
				$controls = array_filter(
					$controls,
					static function ( $ctl ) {
						return in_array( isset( $ctl['type'] ) ? $ctl['type'] : '', self::CONTENT_TYPES, true );
					}
				);
			}

			$shown   = count( $controls );
			$capped  = false;
			if ( ! $full && $shown > self::DEFAULT_CAP ) {
				$controls = array_slice( $controls, 0, self::DEFAULT_CAP, true );
				$capped   = true;
			}

			$params = array();
			foreach ( $controls as $key => $ctl ) {
				$param = array(
					'type'  => isset( $ctl['type'] ) ? $ctl['type'] : '',
					'label' => isset( $ctl['label'] ) ? wp_strip_all_tags( (string) $ctl['label'] ) : '',
				);
				if ( isset( $ctl['default'] ) && ! is_array( $ctl['default'] ) ) {
					$param['default'] = $ctl['default'];
				}
				if ( ! empty( $ctl['options'] ) && is_array( $ctl['options'] ) ) {
					$param['options'] = array_slice( array_keys( $ctl['options'] ), 0, 12 );
				}
				$params[ $key ] = $param;
			}

			$entry = array(
				'type'           => $type,
				'title'          => method_exists( $pack[ $type ], 'get_title' ) ? (string) $pack[ $type ]->get_title() : $type,
				'total_controls' => $total,
				'shown'          => count( $params ),
				'params'         => $params,
			);
			if ( ! $full ) {
				$entry['note'] = $capped
					? sprintf( 'Showing the first %d content-bearing controls of %d total. Pass `full: true` for everything, including styling.', self::DEFAULT_CAP, $total )
					: sprintf( 'Showing content-bearing controls only (%d of %d). Pass `full: true` for styling controls too.', count( $params ), $total );
			}
			$out[ $type ] = $entry;
		}

		return array(
			'pack'    => $this->label(),
			'widgets' => $out,
			'next'    => 'Place with `add-free-widget` (post_id, parent_id, widget_type, settings).',
		);
	}

	// ---------------------------------------------------------------------
	// Helpers
	// ---------------------------------------------------------------------

	/**
	 * This pack's widgets, taken from Elementor's live registry.
	 *
	 * Using the registry (rather than the addon's internals) means the result
	 * reflects what is actually registered on this site, including the addon's
	 * own free/pro gating and any conditionally registered widgets.
	 *
	 * @return array<string, object> Widget type => widget instance.
	 */
	protected function pack_widgets(): array {
		if ( ! class_exists( '\Elementor\Plugin' ) ) {
			return array();
		}
		$manager = \Elementor\Plugin::$instance->widgets_manager;
		if ( ! $manager || ! method_exists( $manager, 'get_widget_types' ) ) {
			return array();
		}

		$all   = (array) $manager->get_widget_types();
		$out   = array();
		$prefs = $this->prefixes();

		foreach ( $all as $type => $widget ) {
			foreach ( $prefs as $prefix ) {
				if ( 0 === strpos( (string) $type, $prefix ) ) {
					$out[ $type ] = $widget;
					break;
				}
			}
		}

		ksort( $out );
		return $out;
	}

	/**
	 * Description for the read tool.
	 *
	 * @return string
	 */
	protected function read_description(): string {
		return sprintf(
			'Discover %s widgets available on this site. Operations: `list-widgets` (catalog with search/category filters), `get-widget-schema` (content-bearing controls for a widget, `full:true` for all). These widgets are placed with the standard `add-free-widget` tool using the returned `type`, so this pack adds no widget-adding tool of its own. Call with no `operation` to list operations.',
			$this->label()
		);
	}
}
