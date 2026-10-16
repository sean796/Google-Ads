<?php
/**
 * Alternate Loop Item templates for the Loop Grid (Pro).
 *
 * Show a different card at chosen positions, for example a wide feature every
 * third item. The free tree exposes the seams (a control section to inject
 * into, the two renderer filters, and the settings map that turns the
 * repeater rows into `layout.alternates` inside the signed config); this
 * class is the only place the rules live, so no paid differentiator ships in
 * the public repo.
 *
 * Free installs have exactly one Loop Item, so the feature would have nothing
 * to switch to there anyway. Carousels and Gutenberg blocks have no
 * alternates: the rules apply to grid configs only.
 *
 * @package EMCP_Tools_Pro
 * @since   3.18.0
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * @since 3.18.0
 */
class EMCP_Tools_Themer_Loop_Pro {

	/** The Elementor hook the repeater is injected on (inside the free placeholder section). */
	const SECTION_HOOK = 'elementor/element/emcp-loop-grid/emcp_section_alternates/before_section_end';

	/** License-gated entry point (called from EMCP_Tools_Themer_Pro::attach()). */
	public static function init(): void {
		if ( ! function_exists( 'emcp_tools_fs' ) || ! emcp_tools_fs()->can_use_premium_code() ) {
			return;
		}
		self::attach();
	}

	/** Attach the seams (no license check: the gate is in init()). */
	public static function attach(): void {
		add_filter( 'emcp_themer_loop_item_template', array( __CLASS__, 'pick_template' ), 10, 4 );
		add_filter( 'emcp_themer_loop_item_classes', array( __CLASS__, 'item_classes' ), 10, 4 );
		add_action( self::SECTION_HOOK, array( __CLASS__, 'register_repeater' ), 10, 1 );
	}

	/**
	 * The rule that applies at a position, or null.
	 *
	 * Positions are 1-based as the visitor counts them, so index 2 is position
	 * 3. A repeating rule applies at every multiple of its position. When two
	 * rules match, the later one wins, which is what the panel order implies.
	 *
	 * @param array $alternates Normalized rules.
	 * @param int   $abs_index  0-based absolute position.
	 * @return array|null
	 */
	public static function matching_rule( array $alternates, int $abs_index ): ?array {
		$position = $abs_index + 1;
		$match    = null;
		foreach ( $alternates as $rule ) {
			if ( ! is_array( $rule ) || (int) ( $rule['template_id'] ?? 0 ) <= 0 ) {
				continue;
			}
			$at = (int) ( $rule['position'] ?? 0 );
			if ( $at < 1 ) {
				continue;
			}
			$hit = ! empty( $rule['repeat'] ) ? ( 0 === $position % $at ) : ( $position === $at );
			if ( $hit ) {
				$match = $rule;
			}
		}
		return $match;
	}

	/**
	 * Swap the Loop Item at a position.
	 *
	 * @param mixed $template_id Primary template id.
	 * @param mixed $abs_index   0-based absolute position.
	 * @param mixed $post_id     The card's post.
	 * @param mixed $config      The loop config.
	 * @return int
	 */
	public static function pick_template( $template_id, $abs_index, $post_id, $config ) {
		unset( $post_id );
		$alt = self::alternate_for( $config, (int) $abs_index );
		return null === $alt ? (int) $template_id : (int) $alt['template_id'];
	}

	/**
	 * Add the marker and span classes for an alternate card. The grid
	 * stylesheet already carries the .span-2 to .span-6 rules (collapsed on
	 * mobile), so nothing else is needed here.
	 *
	 * @param mixed $classes   Item classes.
	 * @param mixed $abs_index 0-based absolute position.
	 * @param mixed $post_id   The card's post.
	 * @param mixed $config    The loop config.
	 * @return array
	 */
	public static function item_classes( $classes, $abs_index, $post_id, $config ) {
		unset( $post_id );
		$classes = is_array( $classes ) ? $classes : array();
		$alt     = self::alternate_for( $config, (int) $abs_index );
		if ( null === $alt ) {
			return $classes;
		}
		$classes[] = 'is-alternate';
		$span      = max( 1, min( 6, (int) ( $alt['column_span'] ?? 1 ) ) );
		if ( $span > 1 ) {
			$classes[] = 'span-' . $span;
		}
		return $classes;
	}

	/**
	 * The alternates repeater, injected into the free widget's placeholder
	 * section in place of its locked note. It writes `emcp_alternates` rows
	 * with the keys EMCP_Tools_Themer_Loop_Widget_Map::alternates() reads.
	 *
	 * @param mixed $widget The Loop Grid widget.
	 */
	public static function register_repeater( $widget ): void {
		if ( ! is_object( $widget ) || ! method_exists( $widget, 'add_control' ) || ! class_exists( '\Elementor\Repeater' ) ) {
			return;
		}
		if ( method_exists( $widget, 'remove_control' ) ) {
			$widget->remove_control( 'emcp_alternates_note' );
		}

		$templates = array( '0' => esc_html__( 'Choose a Loop Item', 'emcp-tools' ) );
		$source    = array( 'EMCP_Tools_Themer_Widget_Loop_Base', 'emcp_template_options' );
		if ( is_callable( $source ) ) {
			foreach ( (array) call_user_func( $source ) as $id => $label ) {
				$templates[ (string) $id ] = esc_html( (string) $label );
			}
		}

		$repeater = new \Elementor\Repeater();
		$repeater->add_control(
			'emcp_alt_template',
			array(
				'label'   => __( 'Loop Item', 'emcp-tools' ),
				'type'    => \Elementor\Controls_Manager::SELECT,
				'options' => $templates,
				'default' => '0',
			)
		);
		$repeater->add_control(
			'emcp_alt_position',
			array(
				'label'       => __( 'Position', 'emcp-tools' ),
				'type'        => \Elementor\Controls_Manager::NUMBER,
				'min'         => 1,
				'max'         => 100,
				'default'     => 3,
				'description' => __( 'Counting from the first card in the grid.', 'emcp-tools' ),
			)
		);
		$repeater->add_control(
			'emcp_alt_repeat',
			array(
				'label'        => __( 'Repeat', 'emcp-tools' ),
				'type'         => \Elementor\Controls_Manager::SWITCHER,
				'default'      => 'yes',
				'return_value' => 'yes',
				'description'  => __( 'On: every multiple of the position. Off: that one card.', 'emcp-tools' ),
			)
		);
		$repeater->add_control(
			'emcp_alt_span',
			array(
				'label'       => __( 'Column span', 'emcp-tools' ),
				'type'        => \Elementor\Controls_Manager::NUMBER,
				'min'         => 1,
				'max'         => 6,
				'default'     => 1,
				'description' => __( "Wider spans are capped at each device's column count. On mobile a wide card takes one column.", 'emcp-tools' ),
			)
		);

		$widget->add_control(
			'emcp_alternates',
			array(
				'label'       => __( 'Alternate templates', 'emcp-tools' ),
				'type'        => \Elementor\Controls_Manager::REPEATER,
				'fields'      => $repeater->get_controls(),
				'default'     => array(),
				/* translators: %s: the rule's position, filled in by the editor */
				'title_field' => sprintf( __( 'Position %s', 'emcp-tools' ), '{{ emcp_alt_position }}' ),
				'description' => __( 'Rules apply in order and the last matching rule wins. With load more or infinite scroll the position keeps counting across the whole grid; with page numbers every page starts again at 1.', 'emcp-tools' ),
			)
		);
	}

	/**
	 * The usable alternate for a position in a grid config, or null. A rule
	 * whose template is deleted, unpublished or not a Loop Item is ignored,
	 * so the primary card renders rather than a gap in the grid.
	 *
	 * @param mixed $config    Loop config.
	 * @param int   $abs_index 0-based absolute position.
	 * @return array|null
	 */
	private static function alternate_for( $config, int $abs_index ): ?array {
		if ( ! is_array( $config ) ) {
			return null;
		}
		$layout = is_array( $config['layout'] ?? null ) ? $config['layout'] : array();
		if ( 'grid' !== (string) ( $layout['kind'] ?? '' ) ) {
			return null; // Alternates are a grid feature.
		}
		$alternates = is_array( $layout['alternates'] ?? null ) ? $layout['alternates'] : array();
		if ( ! $alternates ) {
			return null;
		}
		$rule = self::matching_rule( $alternates, $abs_index );
		if ( null === $rule || ! EMCP_Tools_Themer_CPT::is_published_loop_template( (int) $rule['template_id'] ) ) {
			return null;
		}
		return $rule;
	}
}
