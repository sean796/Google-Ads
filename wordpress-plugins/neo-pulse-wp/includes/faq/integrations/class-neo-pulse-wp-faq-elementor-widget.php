<?php
/**
 * Elementor NEO Pulse FAQ widget.
 *
 * @package Neo_Pulse_Wp
 */

defined( 'ABSPATH' ) || exit;

use Elementor\Controls_Manager;
use Elementor\Group_Control_Border;
use Elementor\Group_Control_Box_Shadow;
use Elementor\Group_Control_Typography;
use Elementor\Repeater;
use Elementor\Widget_Base;

class Neo_Pulse_Wp_Faq_Elementor_Widget extends Widget_Base {

	public function get_name(): string {
		return 'neo-pulse_faq';
	}

	public function get_title(): string {
		return esc_html__( 'NEO Pulse FAQ', 'neo-pulse-wp' );
	}

	public function get_icon(): string {
		return 'eicon-help-o';
	}

	/**
	 * @return array<int,string>
	 */
	public function get_categories(): array {
		return array( 'neo-pulse' );
	}

	/**
	 * @return array<int,string>
	 */
	public function get_keywords(): array {
		return array( 'faq', 'questions', 'accordion', 'neo-pulse', 'fields' );
	}

	/**
	 * @return array<int,string>
	 */
	public function get_style_depends(): array {
		return array( 'neo-pulse-faq' );
	}

	/**
	 * @return array<int,string>
	 */
	public function get_script_depends(): array {
		return array( 'neo-pulse-faq' );
	}

	protected function register_controls(): void {
		$this->register_source_controls();
		$this->register_content_controls();
		$this->register_layout_controls();
		$this->register_style_section_controls();
		$this->register_style_items_controls();
		$this->register_style_accordion_controls();
		$this->register_style_table_controls();
		$this->register_style_list_cards_controls();
	}

	private function register_source_controls(): void {
		$this->start_controls_section(
			'section_source',
			array(
				'label' => esc_html__( 'Field source', 'neo-pulse-wp' ),
			)
		);

		$this->add_control(
			'field_mode',
			array(
				'label'       => esc_html__( 'Field mode', 'neo-pulse-wp' ),
				'type'        => Controls_Manager::SELECT,
				'default'     => 'auto',
				'options'     => array(
					'auto'   => esc_html__( 'Auto (faq → seo_faq)', 'neo-pulse-wp' ),
					'manual' => esc_html__( 'Manual field', 'neo-pulse-wp' ),
				),
				'description' => esc_html__( 'Used when FAQ items below are empty.', 'neo-pulse-wp' ),
			)
		);

		$this->add_control(
			'field_name',
			array(
				'label'     => esc_html__( 'FAQ field', 'neo-pulse-wp' ),
				'type'      => Controls_Manager::SELECT,
				'options'   => self::get_faq_field_choices(),
				'default'   => 'faq',
				'condition' => array(
					'field_mode' => 'manual',
				),
			)
		);

		$this->end_controls_section();
	}

	private function register_content_controls(): void {
		$this->start_controls_section(
			'section_content',
			array(
				'label' => esc_html__( 'Section content', 'neo-pulse-wp' ),
			)
		);

		$this->add_control(
			'heading',
			array(
				'label'   => esc_html__( 'Heading', 'neo-pulse-wp' ),
				'type'    => Controls_Manager::TEXT,
				'default' => esc_html__( 'Frequently Asked Questions', 'neo-pulse-wp' ),
			)
		);

		$this->add_control(
			'heading_tag',
			array(
				'label'   => esc_html__( 'Heading HTML tag', 'neo-pulse-wp' ),
				'type'    => Controls_Manager::SELECT,
				'default' => 'h2',
				'options' => array(
					'h2' => 'H2',
					'h3' => 'H3',
					'h4' => 'H4',
					'h5' => 'H5',
					'h6' => 'H6',
				),
			)
		);

		$repeater = new Repeater();

		$repeater->add_control(
			'question',
			array(
				'label'       => esc_html__( 'Question', 'neo-pulse-wp' ),
				'type'        => Controls_Manager::TEXT,
				'default'     => '',
				'label_block' => true,
			)
		);

		$repeater->add_control(
			'answer',
			array(
				'label'       => esc_html__( 'Answer', 'neo-pulse-wp' ),
				'type'        => Controls_Manager::TEXTAREA,
				'default'     => '',
				'rows'        => 4,
				'label_block' => true,
			)
		);

		$this->add_control(
			'faq_items',
			array(
				'label'       => esc_html__( 'FAQ items', 'neo-pulse-wp' ),
				'type'        => Controls_Manager::REPEATER,
				'fields'      => $repeater->get_controls(),
				'default'     => array(),
				'title_field' => '{{{ question }}}',
				'description' => esc_html__( 'Add items here to override the page FAQ field. Leave empty to use the page field (faq / seo_faq).', 'neo-pulse-wp' ),
			)
		);

		$this->add_control(
			'empty_message',
			array(
				'label'   => esc_html__( 'Empty message', 'neo-pulse-wp' ),
				'type'    => Controls_Manager::TEXT,
				'default' => esc_html__( 'No FAQ items found for this page yet.', 'neo-pulse-wp' ),
			)
		);

		$this->add_control(
			'enable_schema',
			array(
				'label'        => esc_html__( 'Enable schema', 'neo-pulse-wp' ),
				'type'         => Controls_Manager::SWITCHER,
				'label_on'     => esc_html__( 'Yes', 'neo-pulse-wp' ),
				'label_off'    => esc_html__( 'No', 'neo-pulse-wp' ),
				'return_value' => 'yes',
				'default'      => '',
			)
		);

		$this->end_controls_section();
	}

	private function register_layout_controls(): void {
		$this->start_controls_section(
			'section_layout',
			array(
				'label' => esc_html__( 'Layout', 'neo-pulse-wp' ),
				'tab'   => Controls_Manager::TAB_CONTENT,
			)
		);

		$this->add_control(
			'layout',
			array(
				'label'   => esc_html__( 'Display mode', 'neo-pulse-wp' ),
				'type'    => Controls_Manager::SELECT,
				'default' => 'accordion',
				'options' => array(
					'accordion' => esc_html__( 'Accordion', 'neo-pulse-wp' ),
					'table'     => esc_html__( 'Table', 'neo-pulse-wp' ),
					'list'      => esc_html__( 'Stacked list', 'neo-pulse-wp' ),
					'cards'     => esc_html__( 'Cards', 'neo-pulse-wp' ),
				),
			)
		);

		$this->add_control(
			'accordion_first_open',
			array(
				'label'        => esc_html__( 'First item open', 'neo-pulse-wp' ),
				'type'         => Controls_Manager::SWITCHER,
				'return_value' => 'yes',
				'default'      => 'yes',
				'condition'    => array(
					'layout' => 'accordion',
				),
			)
		);

		$this->add_control(
			'accordion_allow_multiple',
			array(
				'label'        => esc_html__( 'Allow multiple open', 'neo-pulse-wp' ),
				'type'         => Controls_Manager::SWITCHER,
				'return_value' => 'yes',
				'condition'    => array(
					'layout' => 'accordion',
				),
			)
		);

		$this->add_control(
			'table_question_header',
			array(
				'label'     => esc_html__( 'Question column header', 'neo-pulse-wp' ),
				'type'      => Controls_Manager::TEXT,
				'default'   => esc_html__( 'Question', 'neo-pulse-wp' ),
				'condition' => array(
					'layout' => 'table',
				),
			)
		);

		$this->add_control(
			'table_answer_header',
			array(
				'label'     => esc_html__( 'Answer column header', 'neo-pulse-wp' ),
				'type'      => Controls_Manager::TEXT,
				'default'   => esc_html__( 'Answer', 'neo-pulse-wp' ),
				'condition' => array(
					'layout' => 'table',
				),
			)
		);

		$this->add_control(
			'table_show_header',
			array(
				'label'        => esc_html__( 'Show table header row', 'neo-pulse-wp' ),
				'type'         => Controls_Manager::SWITCHER,
				'return_value' => 'yes',
				'default'      => 'yes',
				'condition'    => array(
					'layout' => 'table',
				),
			)
		);

		$this->add_responsive_control(
			'card_columns',
			array(
				'label'     => esc_html__( 'Card columns', 'neo-pulse-wp' ),
				'type'      => Controls_Manager::SELECT,
				'default'   => '1',
				'options'   => array(
					'1' => '1',
					'2' => '2',
					'3' => '3',
					'4' => '4',
				),
				'selectors' => array(
					'{{WRAPPER}} .neo-pulse-faq' => '--ff-faq-card-columns: {{VALUE}};',
				),
				'condition' => array(
					'layout' => 'cards',
				),
			)
		);

		$this->end_controls_section();
	}

	private function register_style_section_controls(): void {
		$this->start_controls_section(
			'section_style_header',
			array(
				'label' => esc_html__( 'Section header', 'neo-pulse-wp' ),
				'tab'   => Controls_Manager::TAB_STYLE,
			)
		);

		$this->add_group_control(
			Group_Control_Typography::get_type(),
			array(
				'name'     => 'heading_typography',
				'label'    => esc_html__( 'Heading typography', 'neo-pulse-wp' ),
				'selector' => '{{WRAPPER}} .neo-pulse-faq__heading',
			)
		);

		$this->add_control(
			'heading_color',
			array(
				'label'     => esc_html__( 'Heading color', 'neo-pulse-wp' ),
				'type'      => Controls_Manager::COLOR,
				'selectors' => array(
					'{{WRAPPER}} .neo-pulse-faq' => '--ff-faq-heading-color: {{VALUE}};',
				),
			)
		);

		$this->add_responsive_control(
			'header_gap',
			array(
				'label'      => esc_html__( 'Header bottom spacing', 'neo-pulse-wp' ),
				'type'       => Controls_Manager::SLIDER,
				'size_units' => array( 'px', 'em' ),
				'range'      => array(
					'px' => array( 'min' => 0, 'max' => 80 ),
				),
				'selectors'  => array(
					'{{WRAPPER}} .neo-pulse-faq' => '--ff-faq-header-gap: {{SIZE}}{{UNIT}};',
				),
			)
		);

		$this->end_controls_section();
	}

	private function register_style_items_controls(): void {
		$this->start_controls_section(
			'section_style_items',
			array(
				'label' => esc_html__( 'Items', 'neo-pulse-wp' ),
				'tab'   => Controls_Manager::TAB_STYLE,
			)
		);

		$this->add_responsive_control(
			'item_gap',
			array(
				'label'      => esc_html__( 'Item gap', 'neo-pulse-wp' ),
				'type'       => Controls_Manager::SLIDER,
				'size_units' => array( 'px', 'em' ),
				'range'      => array(
					'px' => array( 'min' => 0, 'max' => 60 ),
				),
				'selectors'  => array(
					'{{WRAPPER}} .neo-pulse-faq' => '--ff-faq-item-gap: {{SIZE}}{{UNIT}}; --ff-faq-items-gap: {{SIZE}}{{UNIT}};',
				),
			)
		);

		$this->add_responsive_control(
			'item_padding',
			array(
				'label'      => esc_html__( 'Item padding', 'neo-pulse-wp' ),
				'type'       => Controls_Manager::DIMENSIONS,
				'size_units' => array( 'px', 'em' ),
				'selectors'  => array(
					'{{WRAPPER}} .neo-pulse-faq' => '--ff-faq-item-padding: {{TOP}}{{UNIT}} {{RIGHT}}{{UNIT}} {{BOTTOM}}{{UNIT}} {{LEFT}}{{UNIT}};',
				),
			)
		);

		$this->add_control(
			'item_bg',
			array(
				'label'     => esc_html__( 'Item background', 'neo-pulse-wp' ),
				'type'      => Controls_Manager::COLOR,
				'selectors' => array(
					'{{WRAPPER}} .neo-pulse-faq' => '--ff-faq-item-bg: {{VALUE}};',
				),
			)
		);

		$this->add_control(
			'item_border_color',
			array(
				'label'     => esc_html__( 'Item border color', 'neo-pulse-wp' ),
				'type'      => Controls_Manager::COLOR,
				'selectors' => array(
					'{{WRAPPER}} .neo-pulse-faq' => '--ff-faq-item-border-color: {{VALUE}};',
				),
			)
		);

		$this->add_responsive_control(
			'item_radius',
			array(
				'label'      => esc_html__( 'Item border radius', 'neo-pulse-wp' ),
				'type'       => Controls_Manager::DIMENSIONS,
				'size_units' => array( 'px', '%' ),
				'selectors'  => array(
					'{{WRAPPER}} .neo-pulse-faq' => '--ff-faq-item-radius: {{TOP}}{{UNIT}};',
				),
			)
		);

		$this->add_group_control(
			Group_Control_Typography::get_type(),
			array(
				'name'     => 'question_typography',
				'label'    => esc_html__( 'Question typography', 'neo-pulse-wp' ),
				'selector' => '{{WRAPPER}} .neo-pulse-faq__question',
			)
		);

		$this->add_control(
			'question_color',
			array(
				'label'     => esc_html__( 'Question color', 'neo-pulse-wp' ),
				'type'      => Controls_Manager::COLOR,
				'selectors' => array(
					'{{WRAPPER}} .neo-pulse-faq' => '--ff-faq-question-color: {{VALUE}};',
				),
			)
		);

		$this->add_group_control(
			Group_Control_Typography::get_type(),
			array(
				'name'     => 'answer_typography',
				'label'    => esc_html__( 'Answer typography', 'neo-pulse-wp' ),
				'selector' => '{{WRAPPER}} .neo-pulse-faq__answer',
			)
		);

		$this->add_control(
			'answer_color',
			array(
				'label'     => esc_html__( 'Answer color', 'neo-pulse-wp' ),
				'type'      => Controls_Manager::COLOR,
				'selectors' => array(
					'{{WRAPPER}} .neo-pulse-faq' => '--ff-faq-answer-color: {{VALUE}};',
				),
			)
		);

		$this->end_controls_section();
	}

	private function register_style_accordion_controls(): void {
		$this->start_controls_section(
			'section_style_accordion',
			array(
				'label'     => esc_html__( 'Accordion', 'neo-pulse-wp' ),
				'tab'       => Controls_Manager::TAB_STYLE,
				'condition' => array(
					'layout' => 'accordion',
				),
			)
		);

		$this->add_control(
			'trigger_bg',
			array(
				'label'     => esc_html__( 'Trigger background', 'neo-pulse-wp' ),
				'type'      => Controls_Manager::COLOR,
				'selectors' => array(
					'{{WRAPPER}} .neo-pulse-faq' => '--ff-faq-trigger-bg: {{VALUE}};',
				),
			)
		);

		$this->add_control(
			'trigger_active_bg',
			array(
				'label'     => esc_html__( 'Active trigger background', 'neo-pulse-wp' ),
				'type'      => Controls_Manager::COLOR,
				'selectors' => array(
					'{{WRAPPER}} .neo-pulse-faq' => '--ff-faq-trigger-active-bg: {{VALUE}};',
				),
			)
		);

		$this->add_control(
			'panel_bg',
			array(
				'label'     => esc_html__( 'Panel background', 'neo-pulse-wp' ),
				'type'      => Controls_Manager::COLOR,
				'selectors' => array(
					'{{WRAPPER}} .neo-pulse-faq' => '--ff-faq-panel-bg: {{VALUE}};',
				),
			)
		);

		$this->add_control(
			'icon_color',
			array(
				'label'     => esc_html__( 'Icon color', 'neo-pulse-wp' ),
				'type'      => Controls_Manager::COLOR,
				'selectors' => array(
					'{{WRAPPER}} .neo-pulse-faq' => '--ff-faq-icon-color: {{VALUE}};',
				),
			)
		);

		$this->add_responsive_control(
			'icon_size',
			array(
				'label'      => esc_html__( 'Icon size', 'neo-pulse-wp' ),
				'type'       => Controls_Manager::SLIDER,
				'size_units' => array( 'px', 'rem' ),
				'range'      => array(
					'px' => array( 'min' => 8, 'max' => 32 ),
				),
				'selectors'  => array(
					'{{WRAPPER}} .neo-pulse-faq' => '--ff-faq-icon-size: {{SIZE}}{{UNIT}};',
				),
			)
		);

		$this->end_controls_section();
	}

	private function register_style_table_controls(): void {
		$this->start_controls_section(
			'section_style_table',
			array(
				'label'     => esc_html__( 'Table', 'neo-pulse-wp' ),
				'tab'       => Controls_Manager::TAB_STYLE,
				'condition' => array(
					'layout' => 'table',
				),
			)
		);

		$this->add_group_control(
			Group_Control_Typography::get_type(),
			array(
				'name'     => 'table_header_typography',
				'label'    => esc_html__( 'Header typography', 'neo-pulse-wp' ),
				'selector' => '{{WRAPPER}} .neo-pulse-faq__th',
			)
		);

		$this->add_control(
			'table_header_bg',
			array(
				'label'     => esc_html__( 'Header background', 'neo-pulse-wp' ),
				'type'      => Controls_Manager::COLOR,
				'selectors' => array(
					'{{WRAPPER}} .neo-pulse-faq' => '--ff-faq-table-header-bg: {{VALUE}};',
				),
			)
		);

		$this->add_control(
			'table_header_color',
			array(
				'label'     => esc_html__( 'Header text color', 'neo-pulse-wp' ),
				'type'      => Controls_Manager::COLOR,
				'selectors' => array(
					'{{WRAPPER}} .neo-pulse-faq' => '--ff-faq-table-header-color: {{VALUE}};',
				),
			)
		);

		$this->add_control(
			'table_border_color',
			array(
				'label'     => esc_html__( 'Border color', 'neo-pulse-wp' ),
				'type'      => Controls_Manager::COLOR,
				'selectors' => array(
					'{{WRAPPER}} .neo-pulse-faq' => '--ff-faq-table-border-color: {{VALUE}};',
				),
			)
		);

		$this->add_control(
			'table_zebra',
			array(
				'label'        => esc_html__( 'Zebra striping', 'neo-pulse-wp' ),
				'type'         => Controls_Manager::SWITCHER,
				'return_value' => 'yes',
			)
		);

		$this->add_control(
			'table_zebra_bg',
			array(
				'label'     => esc_html__( 'Zebra row background', 'neo-pulse-wp' ),
				'type'      => Controls_Manager::COLOR,
				'selectors' => array(
					'{{WRAPPER}} .neo-pulse-faq' => '--ff-faq-table-zebra-bg: {{VALUE}};',
				),
				'condition' => array(
					'table_zebra' => 'yes',
				),
			)
		);

		$this->end_controls_section();
	}

	private function register_style_list_cards_controls(): void {
		$this->start_controls_section(
			'section_style_cards',
			array(
				'label'     => esc_html__( 'Cards', 'neo-pulse-wp' ),
				'tab'       => Controls_Manager::TAB_STYLE,
				'condition' => array(
					'layout' => 'cards',
				),
			)
		);

		$this->add_group_control(
			Group_Control_Box_Shadow::get_type(),
			array(
				'name'     => 'card_shadow',
				'selector' => '{{WRAPPER}} .neo-pulse-faq__card',
			)
		);

		$this->add_group_control(
			Group_Control_Border::get_type(),
			array(
				'name'     => 'card_border',
				'selector' => '{{WRAPPER}} .neo-pulse-faq__card',
			)
		);

		$this->end_controls_section();
	}

	protected function render(): void {
		$settings = $this->get_settings_for_display();
		$args     = self::map_settings( $settings, (string) $this->get_id() );
		// phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- Markup from render_instance().
		echo Neo_Pulse_Wp_Faq::render_instance( $args );
	}

	/**
	 * @param array<string,mixed> $settings
	 * @return array<string,mixed>
	 */
	public static function map_settings( array $settings, string $widget_id = '' ): array {
		$faq_items = array();
		if ( ! empty( $settings['faq_items'] ) && is_array( $settings['faq_items'] ) ) {
			foreach ( $settings['faq_items'] as $row ) {
				if ( ! is_array( $row ) ) {
					continue;
				}
				$faq_items[] = array(
					'question' => (string) ( $row['question'] ?? '' ),
					'answer'   => (string) ( $row['answer'] ?? '' ),
				);
			}
		}

		return array(
			'instance_id'              => $widget_id !== '' ? 'neo-pulse-faq-' . $widget_id : '',
			'field_mode'               => (string) ( $settings['field_mode'] ?? 'auto' ),
			'field_name'               => (string) ( $settings['field_name'] ?? 'faq' ),
			'heading'                  => (string) ( $settings['heading'] ?? '' ),
			'heading_tag'              => (string) ( $settings['heading_tag'] ?? 'h2' ),
			'faq_items'                => $faq_items,
			'empty_message'            => (string) ( $settings['empty_message'] ?? '' ),
			'enable_schema'            => ( $settings['enable_schema'] ?? '' ) === 'yes',
			'layout'                   => (string) ( $settings['layout'] ?? 'accordion' ),
			'accordion_first_open'     => ( $settings['accordion_first_open'] ?? '' ) === 'yes',
			'accordion_allow_multiple' => ( $settings['accordion_allow_multiple'] ?? '' ) === 'yes',
			'table_question_header'    => (string) ( $settings['table_question_header'] ?? '' ),
			'table_answer_header'      => (string) ( $settings['table_answer_header'] ?? '' ),
			'table_show_header'        => ! isset( $settings['table_show_header'] ) || ( $settings['table_show_header'] ?? '' ) === 'yes',
			'table_zebra'              => ( $settings['table_zebra'] ?? '' ) === 'yes',
			'card_columns'             => (int) ( $settings['card_columns'] ?? 1 ),
			'is_elementor'             => true,
		);
	}

	/**
	 * @return array<string, string>
	 */
	private static function get_faq_field_choices(): array {
		$allowed_types = array( 'text', 'textarea', 'wysiwyg', 'repeater' );
		$choices       = array();
		$all           = self::get_acf_post_field_choices( $allowed_types );

		foreach ( $all as $name => $label ) {
			if ( stripos( $name, 'faq' ) !== false ) {
				$choices[ $name ] = $label;
			}
		}

		if ( empty( $choices ) ) {
			$choices = $all;
		}

		if ( ! isset( $choices['faq'] ) ) {
			$choices = array_merge( array( 'faq' => esc_html__( 'FAQ (faq)', 'neo-pulse-wp' ) ), $choices );
		}
		if ( ! isset( $choices['seo_faq'] ) ) {
			$choices['seo_faq'] = esc_html__( 'SEO FAQ (seo_faq)', 'neo-pulse-wp' );
		}

		return $choices;
	}

	/**
	 * Post field choices from ACF field groups (when ACF is active).
	 *
	 * @param array<int, string> $types Allowed ACF field types.
	 * @return array<string, string> name => label
	 */
	private static function get_acf_post_field_choices( array $types ): array {
		if ( ! function_exists( 'acf_get_field_groups' ) || ! function_exists( 'acf_get_fields' ) ) {
			return array();
		}
		$choices = array();
		$groups  = acf_get_field_groups();
		foreach ( is_array( $groups ) ? $groups : array() as $group ) {
			if ( ! is_array( $group ) ) {
				continue;
			}
			$fields = acf_get_fields( $group );
			foreach ( is_array( $fields ) ? $fields : array() as $field ) {
				if ( ! is_array( $field ) ) {
					continue;
				}
				$name = (string) ( $field['name'] ?? '' );
				$type = (string) ( $field['type'] ?? '' );
				if ( $name === '' || ! in_array( $type, $types, true ) ) {
					continue;
				}
				$label  = (string) ( $field['label'] ?? $name );
				$title  = (string) ( $group['title'] ?? '' );
				$detail = $title !== ''
					? sprintf( '%s » %s (%s)', $title, $label, $type )
					: sprintf( '%s (%s)', $label, $type );
				$choices[ $name ] = sprintf( '%s — %s', $name, $detail );
			}
		}
		return $choices;
	}
}
