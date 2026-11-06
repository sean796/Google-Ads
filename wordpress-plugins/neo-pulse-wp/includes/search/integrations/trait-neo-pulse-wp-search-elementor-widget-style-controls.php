<?php
/**
 * Style controls for the NEO Pulse Search Elementor widget.
 *
 * @package Neo_Pulse_Wp
 */

defined( 'ABSPATH' ) || exit;

use Elementor\Controls_Manager;
use Elementor\Group_Control_Box_Shadow;

trait Neo_Pulse_Wp_Search_Elementor_Widget_Trait_Style_Controls {

	private function style_colors(): void {
		$this->start_controls_section(
			'section_style_colors',
			array(
				'label' => esc_html__( 'Colours and font', 'neo-pulse-wp' ),
				'tab'   => Controls_Manager::TAB_STYLE,
			)
		);

		$this->add_control(
			'style_colors_note',
			array(
				'type'            => Controls_Manager::RAW_HTML,
				'raw'             => esc_html__( 'These set the whole look at once. The sections below fine-tune each part.', 'neo-pulse-wp' ),
				'content_classes' => 'elementor-descriptor',
			)
		);

		$this->color( 'style_accent', esc_html__( 'Accent', 'neo-pulse-wp' ), '--nps-accent', array( 'description' => esc_html__( 'Defaults to the site’s primary colour.', 'neo-pulse-wp' ) ) );
		$this->color( 'style_accent_ink', esc_html__( 'Text on accent', 'neo-pulse-wp' ), '--nps-accent-ink' );
		$this->color( 'style_text', esc_html__( 'Text', 'neo-pulse-wp' ), '--nps-ink' );
		$this->color( 'style_text_2', esc_html__( 'Secondary text', 'neo-pulse-wp' ), '--nps-ink-2' );
		$this->color( 'style_muted', esc_html__( 'Faint text', 'neo-pulse-wp' ), '--nps-muted' );
		$this->color( 'style_surface', esc_html__( 'Background', 'neo-pulse-wp' ), '--nps-surface' );
		$this->color( 'style_field', esc_html__( 'Soft fill (field, pills)', 'neo-pulse-wp' ), '--nps-field' );
		$this->color( 'style_line', esc_html__( 'Lines', 'neo-pulse-wp' ), '--nps-line' );

		$this->add_control(
			'style_font',
			array(
				'label'       => esc_html__( 'Font', 'neo-pulse-wp' ),
				'type'        => Controls_Manager::FONT,
				'default'     => '',
				'description' => esc_html__( 'Blank uses the site’s body font. Each part can still be set below.', 'neo-pulse-wp' ),
				'selectors'   => self::roots( '--nps-font: "{{VALUE}}", sans-serif;' ),
			)
		);

		$this->end_controls_section();
	}

	private function style_launcher(): void {
		$this->start_controls_section(
			'section_style_launcher',
			array(
				'label'     => esc_html__( 'Icon button', 'neo-pulse-wp' ),
				'tab'       => Controls_Manager::TAB_STYLE,
				'condition' => array( 'display_mode' => 'icon_only' ),
			)
		);

		$this->start_controls_tabs( 'style_launcher_tabs' );
		$this->start_controls_tab( 'style_launcher_tab_normal', array( 'label' => esc_html__( 'Normal', 'neo-pulse-wp' ) ) );
		$this->color( 'style_launcher_bg', esc_html__( 'Background', 'neo-pulse-wp' ), '--nps-l-bg' );
		$this->color( 'style_launcher_color', esc_html__( 'Icon and text', 'neo-pulse-wp' ), '--nps-l-fg' );
		$this->color( 'style_launcher_border', esc_html__( 'Border', 'neo-pulse-wp' ), '--nps-l-bd' );
		$this->end_controls_tab();
		$this->start_controls_tab( 'style_launcher_tab_hover', array( 'label' => esc_html__( 'Hover', 'neo-pulse-wp' ) ) );
		$this->color( 'style_launcher_hover_bg', esc_html__( 'Background', 'neo-pulse-wp' ), '--nps-l-bg-h' );
		$this->color( 'style_launcher_hover_color', esc_html__( 'Icon and text', 'neo-pulse-wp' ), '--nps-l-fg-h' );
		$this->color( 'style_launcher_hover_border', esc_html__( 'Border', 'neo-pulse-wp' ), '--nps-l-bd-h' );
		$this->end_controls_tab();
		$this->end_controls_tabs();

		$this->slider( 'style_launcher_size', esc_html__( 'Button size', 'neo-pulse-wp' ), '--nps-l-size', 24, 96, true, array( 'px' ), array( 'separator' => 'before' ) );
		$this->slider( 'style_launcher_icon_size', esc_html__( 'Icon size', 'neo-pulse-wp' ), '--nps-l-icon', 10, 48 );
		$this->slider( 'style_launcher_pad_x', esc_html__( 'Side padding (with text)', 'neo-pulse-wp' ), '--nps-l-pad-x', 0, 48, true, array( 'px' ), array( 'condition' => array( 'launcher_text!' => '' ) ) );
		$this->slider( 'style_launcher_radius', esc_html__( 'Rounding', 'neo-pulse-wp' ), '--nps-l-radius', 0, 60, true, array( 'px', '%' ) );
		$this->slider( 'style_launcher_border_width', esc_html__( 'Border width', 'neo-pulse-wp' ), '--nps-l-bw', 0, 6, false );

		$this->add_group_control(
			Group_Control_Box_Shadow::get_type(),
			array(
				'name'     => 'style_launcher_shadow',
				'selector' => '{{WRAPPER}} .nps-launcher.fbs__icon-launcher',
			)
		);

		$this->typography( 'style_launcher_typography', esc_html__( 'Text', 'neo-pulse-wp' ), '.nps-launcher__text' );

		$this->end_controls_section();
	}

	private function style_field(): void {
		$this->start_controls_section(
			'section_style_field',
			array(
				'label' => esc_html__( 'Search field', 'neo-pulse-wp' ),
				'tab'   => Controls_Manager::TAB_STYLE,
			)
		);

		$this->slider( 'style_field_height', esc_html__( 'Height', 'neo-pulse-wp' ), '--nps-f-h', 32, 88 );
		$this->slider( 'style_border_radius', esc_html__( 'Rounding', 'neo-pulse-wp' ), '--nps-f-radius', 0, 60 );
		$this->slider( 'style_field_pad_x', esc_html__( 'Inner padding (left)', 'neo-pulse-wp' ), '--nps-f-pad-l', 0, 40 );
		$this->slider( 'style_form_border_width', esc_html__( 'Border width', 'neo-pulse-wp' ), '--nps-f-bw', 0, 4, false );

		$this->start_controls_tabs( 'style_field_tabs', array( 'separator' => 'before' ) );
		$this->start_controls_tab( 'style_field_tab_normal', array( 'label' => esc_html__( 'Normal', 'neo-pulse-wp' ) ) );
		$this->color( 'style_input_bg', esc_html__( 'Background', 'neo-pulse-wp' ), '--nps-f-bg' );
		$this->color( 'style_form_border', esc_html__( 'Border', 'neo-pulse-wp' ), '--nps-f-bd' );
		$this->color( 'style_input_text', esc_html__( 'Text', 'neo-pulse-wp' ), '--nps-f-fg' );
		$this->color( 'style_placeholder', esc_html__( 'Placeholder', 'neo-pulse-wp' ), '--nps-f-ph' );
		$this->color( 'style_field_icon', esc_html__( 'Magnifier', 'neo-pulse-wp' ), '--nps-f-icon' );
		$this->end_controls_tab();
		$this->start_controls_tab( 'style_field_tab_focus', array( 'label' => esc_html__( 'Typing', 'neo-pulse-wp' ) ) );
		$this->color( 'style_input_bg_focus', esc_html__( 'Background', 'neo-pulse-wp' ), '--nps-f-bg-focus' );
		$this->color( 'style_form_border_focus', esc_html__( 'Border', 'neo-pulse-wp' ), '--nps-f-bd-focus' );
		$this->color( 'style_focus_ring', esc_html__( 'Glow', 'neo-pulse-wp' ), '--nps-f-ring' );
		$this->end_controls_tab();
		$this->end_controls_tabs();

		$this->typography( 'style_input_typography', esc_html__( 'Text', 'neo-pulse-wp' ), '.nps-field__input.fbs__input' );

		$this->end_controls_section();
	}

	private function style_button(): void {
		$this->start_controls_section(
			'section_style_button',
			array(
				'label' => esc_html__( 'Search button', 'neo-pulse-wp' ),
				'tab'   => Controls_Manager::TAB_STYLE,
			)
		);

		$this->color( 'style_button_bg', esc_html__( 'Background', 'neo-pulse-wp' ), '--nps-go-bg' );
		$this->color( 'style_button_hover', esc_html__( 'Hover background', 'neo-pulse-wp' ), '--nps-go-bg-h' );
		$this->color( 'style_button_icon', esc_html__( 'Icon and text', 'neo-pulse-wp' ), '--nps-go-fg' );
		$this->slider( 'style_button_size', esc_html__( 'Size', 'neo-pulse-wp' ), '--nps-go-size', 24, 72 );
		$this->slider( 'style_button_icon_size', esc_html__( 'Icon size', 'neo-pulse-wp' ), '--nps-go-icon', 10, 32 );
		$this->slider( 'style_button_radius', esc_html__( 'Rounding', 'neo-pulse-wp' ), '--nps-go-radius', 0, 60 );
		$this->typography( 'style_button_typography', esc_html__( 'Text', 'neo-pulse-wp' ), '.nps-field__go.fbs__btn' );

		$this->end_controls_section();
	}

	private function style_panel(): void {
		$this->start_controls_section(
			'section_style_panel',
			array(
				'label'     => esc_html__( 'Panel', 'neo-pulse-wp' ),
				'tab'       => Controls_Manager::TAB_STYLE,
				'condition' => array(
					'display_mode'  => 'icon_only',
					'icon_open_as!' => 'expand_inline',
				),
			)
		);

		$this->color( 'style_panel_bg', esc_html__( 'Background', 'neo-pulse-wp' ), '--nps-p-bg' );
		$this->color( 'style_panel_text', esc_html__( 'Text', 'neo-pulse-wp' ), '--nps-p-fg' );

		$this->slider( 'style_panel_width', esc_html__( 'Side panel width', 'neo-pulse-wp' ), '--nps-p-w', 280, 720, true, array( 'px', 'vw' ), array( 'condition' => array( 'icon_open_as!' => 'modal_center' ) ) );
		$this->slider( 'style_modal_width', esc_html__( 'Popup width', 'neo-pulse-wp' ), '--nps-modal-w', 320, 1000, true, array( 'px', 'vw' ), array( 'condition' => array( 'icon_open_as' => 'modal_center' ) ) );
		$this->slider( 'style_panel_offset_top', esc_html__( 'Top padding', 'neo-pulse-wp' ), '--nps-p-pad-top', 0, 240 );
		$this->slider( 'style_panel_padding_x', esc_html__( 'Side padding', 'neo-pulse-wp' ), '--nps-p-pad-x', 0, 80 );
		$this->slider( 'style_panel_padding_bottom', esc_html__( 'Bottom padding', 'neo-pulse-wp' ), '--nps-p-pad-bottom', 0, 120 );
		$this->slider( 'style_panel_gap', esc_html__( 'Space between sections', 'neo-pulse-wp' ), '--nps-p-gap', 0, 64 );
		$this->slider( 'style_panel_radius', esc_html__( 'Rounding', 'neo-pulse-wp' ), '--nps-p-radius', 0, 48, false );

		$this->add_group_control(
			Group_Control_Box_Shadow::get_type(),
			array(
				'name'     => 'style_panel_shadow',
				'selector' => '{{WRAPPER}} .nps-panel.fai-sidebar-panel, ' . self::PORTAL . '.nps-panel',
			)
		);

		$this->heading( 'style_backdrop_heading', esc_html__( 'Page behind the panel', 'neo-pulse-wp' ) );
		$this->color( 'style_backdrop_color', esc_html__( 'Colour', 'neo-pulse-wp' ), '--nps-bd-color' );
		$this->slider( 'style_backdrop_opacity', esc_html__( 'Darkness', 'neo-pulse-wp' ), '--nps-bd-opacity', 0, 100, false, array( '%' ) );
		$this->slider( 'style_backdrop_blur', esc_html__( 'Blur', 'neo-pulse-wp' ), '--nps-bd-blur', 0, 24, false );

		$this->end_controls_section();
	}

	private function style_head(): void {
		$this->start_controls_section(
			'section_style_head',
			array(
				'label'     => esc_html__( 'Panel heading', 'neo-pulse-wp' ),
				'tab'       => Controls_Manager::TAB_STYLE,
				'condition' => array(
					'display_mode'  => 'icon_only',
					'icon_open_as!' => 'expand_inline',
				),
			)
		);

		$this->color( 'style_heading_color', esc_html__( 'Heading colour', 'neo-pulse-wp' ), '--nps-title-fg' );
		$this->typography( 'style_panel_heading_typography', esc_html__( 'Heading', 'neo-pulse-wp' ), '.nps-title' );
		$this->color( 'style_subtitle_color', esc_html__( 'Subtitle colour', 'neo-pulse-wp' ), '--nps-sub-fg', array( 'separator' => 'before' ) );
		$this->typography( 'style_subtitle_typography', esc_html__( 'Subtitle', 'neo-pulse-wp' ), '.nps-subtitle' );

		$this->heading( 'style_close_heading', esc_html__( 'Close button', 'neo-pulse-wp' ) );
		$this->color( 'style_close_bg', esc_html__( 'Background', 'neo-pulse-wp' ), '--nps-close-bg' );
		$this->color( 'style_close_bg_hover', esc_html__( 'Hover background', 'neo-pulse-wp' ), '--nps-close-bg-h' );
		$this->color( 'style_close_color', esc_html__( 'Icon', 'neo-pulse-wp' ), '--nps-close-fg' );
		$this->slider( 'style_close_size', esc_html__( 'Size', 'neo-pulse-wp' ), '--nps-close-size', 24, 56 );

		$this->end_controls_section();
	}

	private function style_labels(): void {
		$this->start_controls_section(
			'section_style_labels',
			array(
				'label' => esc_html__( 'Section labels', 'neo-pulse-wp' ),
				'tab'   => Controls_Manager::TAB_STYLE,
			)
		);

		$this->color( 'style_insight_heading', esc_html__( 'Colour', 'neo-pulse-wp' ), '--nps-label-fg' );
		$this->typography( 'style_label_typography', esc_html__( 'Text', 'neo-pulse-wp' ), '.nps-label' );

		$this->end_controls_section();
	}

	private function style_pills(): void {
		$this->start_controls_section(
			'section_style_pills',
			array(
				'label'     => esc_html__( 'Popular search pills', 'neo-pulse-wp' ),
				'tab'       => Controls_Manager::TAB_STYLE,
				'condition' => array( 'show_popular_terms' => 'yes' ),
			)
		);

		$this->start_controls_tabs( 'style_chip_tabs' );
		$this->start_controls_tab( 'style_chip_tab_normal', array( 'label' => esc_html__( 'Normal', 'neo-pulse-wp' ) ) );
		$this->color( 'style_insight_chip_bg', esc_html__( 'Background', 'neo-pulse-wp' ), '--nps-c-bg' );
		$this->color( 'style_chip_color', esc_html__( 'Text', 'neo-pulse-wp' ), '--nps-c-fg' );
		$this->color( 'style_chip_border', esc_html__( 'Border', 'neo-pulse-wp' ), '--nps-c-bd' );
		$this->end_controls_tab();
		$this->start_controls_tab( 'style_chip_tab_hover', array( 'label' => esc_html__( 'Hover', 'neo-pulse-wp' ) ) );
		$this->color( 'style_insight_chip_hover', esc_html__( 'Background', 'neo-pulse-wp' ), '--nps-c-bg-h' );
		$this->color( 'style_chip_color_hover', esc_html__( 'Text', 'neo-pulse-wp' ), '--nps-c-fg-h' );
		$this->color( 'style_chip_border_hover', esc_html__( 'Border', 'neo-pulse-wp' ), '--nps-c-bd-h' );
		$this->end_controls_tab();
		$this->end_controls_tabs();

		$this->typography( 'style_chip_typography', esc_html__( 'Text', 'neo-pulse-wp' ), '.nps-chips .nps-chip' );
		$this->slider( 'style_chip_radius', esc_html__( 'Rounding', 'neo-pulse-wp' ), '--nps-c-radius', 0, 40, false );
		$this->slider( 'style_chip_pad_y', esc_html__( 'Padding (top/bottom)', 'neo-pulse-wp' ), '--nps-c-pad-y', 0, 24 );
		$this->slider( 'style_chip_pad_x', esc_html__( 'Padding (sides)', 'neo-pulse-wp' ), '--nps-c-pad-x', 0, 40 );
		$this->slider( 'style_chip_gap', esc_html__( 'Gap', 'neo-pulse-wp' ), '--nps-c-gap', 0, 24 );

		$this->end_controls_section();
	}

	private function style_cards(): void {
		$this->start_controls_section(
			'section_style_cards',
			array(
				'label' => esc_html__( 'Result and page cards', 'neo-pulse-wp' ),
				'tab'   => Controls_Manager::TAB_STYLE,
			)
		);

		$this->start_controls_tabs( 'style_card_tabs' );
		$this->start_controls_tab( 'style_card_tab_normal', array( 'label' => esc_html__( 'Normal', 'neo-pulse-wp' ) ) );
		$this->color( 'style_card_bg', esc_html__( 'Background', 'neo-pulse-wp' ), '--nps-k-bg' );
		$this->color( 'style_card_border', esc_html__( 'Border', 'neo-pulse-wp' ), '--nps-k-bd' );
		$this->color( 'style_result_link', esc_html__( 'Title', 'neo-pulse-wp' ), '--nps-k-title' );
		$this->color( 'style_result_muted', esc_html__( 'Description', 'neo-pulse-wp' ), '--nps-k-text' );
		$this->color( 'style_card_arrow', esc_html__( 'Arrow', 'neo-pulse-wp' ), '--nps-k-arrow' );
		$this->end_controls_tab();
		$this->start_controls_tab( 'style_card_tab_hover', array( 'label' => esc_html__( 'Hover', 'neo-pulse-wp' ) ) );
		$this->color( 'style_result_hover', esc_html__( 'Background', 'neo-pulse-wp' ), '--nps-k-bg-h' );
		$this->color( 'style_card_border_hover', esc_html__( 'Border', 'neo-pulse-wp' ), '--nps-k-bd-h' );
		$this->end_controls_tab();
		$this->end_controls_tabs();

		$this->typography( 'style_card_title_typography', esc_html__( 'Title', 'neo-pulse-wp' ), '.nps-card__title' );
		$this->typography( 'style_card_text_typography', esc_html__( 'Description', 'neo-pulse-wp' ), '.nps-card__text' );
		$this->slider( 'style_card_radius', esc_html__( 'Rounding', 'neo-pulse-wp' ), '--nps-k-radius', 0, 40, false, array( 'px' ), array( 'separator' => 'before' ) );
		$this->slider( 'style_card_pad', esc_html__( 'Padding', 'neo-pulse-wp' ), '--nps-k-pad', 0, 32 );
		$this->slider( 'style_card_gap', esc_html__( 'Space between cards', 'neo-pulse-wp' ), '--nps-k-gap', 0, 32 );

		$this->heading( 'style_thumb_heading', esc_html__( 'Thumbnail', 'neo-pulse-wp' ) );
		$this->slider( 'style_thumb_size', esc_html__( 'Size', 'neo-pulse-wp' ), '--nps-thumb', 24, 96, true, array( 'px' ), array( 'condition' => array( 'show_thumbnails' => 'yes' ) ) );
		$this->slider( 'style_thumb_radius', esc_html__( 'Rounding', 'neo-pulse-wp' ), '--nps-thumb-radius', 0, 48, false, array( 'px', '%' ), array( 'condition' => array( 'show_thumbnails' => 'yes' ) ) );

		$this->heading( 'style_tag_heading', esc_html__( 'Type tag', 'neo-pulse-wp' ) );
		$this->color( 'style_tag_bg', esc_html__( 'Background', 'neo-pulse-wp' ), '--nps-tag-bg', array( 'condition' => array( 'show_type_tag' => 'yes' ) ) );
		$this->color( 'style_tag_color', esc_html__( 'Text', 'neo-pulse-wp' ), '--nps-tag-fg', array( 'condition' => array( 'show_type_tag' => 'yes' ) ) );

		$score_on = array( 'condition' => array( 'show_match_score' => 'yes' ) );
		$this->heading( 'style_score_heading', esc_html__( 'Match score', 'neo-pulse-wp' ) );
		$this->color( 'style_score_high', esc_html__( 'Strong match (80%+)', 'neo-pulse-wp' ), '--nps-score-high', array_merge( $score_on, array( 'description' => esc_html__( 'Each pill\'s background, border and text are shades of its colour.', 'neo-pulse-wp' ) ) ) );
		$this->color( 'style_score_mid', esc_html__( 'Good match (50-79%)', 'neo-pulse-wp' ), '--nps-score-mid', $score_on );
		$this->color( 'style_score_low', esc_html__( 'Weak match (under 50%)', 'neo-pulse-wp' ), '--nps-score-low', $score_on );

		$best_on = array( 'condition' => array( 'show_best_match' => 'yes' ) );
		$this->heading( 'style_best_heading', esc_html__( 'Best match', 'neo-pulse-wp' ) );
		$this->color( 'style_best_bg', esc_html__( 'Card background', 'neo-pulse-wp' ), '--nps-best-bg', $best_on );
		$this->color( 'style_best_border', esc_html__( 'Card border', 'neo-pulse-wp' ), '--nps-best-bd', $best_on );
		$this->color( 'style_best_label_bg', esc_html__( 'Label background', 'neo-pulse-wp' ), '--nps-best-label-bg', $best_on );
		$this->color( 'style_best_label_text', esc_html__( 'Label text', 'neo-pulse-wp' ), '--nps-best-label-fg', $best_on );

		$this->end_controls_section();
	}

	private function style_dropdown(): void {
		$this->start_controls_section(
			'section_style_dropdown',
			array(
				'label'      => esc_html__( 'Dropdown', 'neo-pulse-wp' ),
				'tab'        => Controls_Manager::TAB_STYLE,
				'conditions' => array(
					'relation' => 'or',
					'terms'    => array(
						array(
							'name'     => 'display_mode',
							'operator' => '==',
							'value'    => 'inline',
						),
						array(
							'name'     => 'icon_open_as',
							'operator' => '==',
							'value'    => 'expand_inline',
						),
					),
				),
			)
		);

		$this->color( 'style_dropdown_bg', esc_html__( 'Background', 'neo-pulse-wp' ), '--nps-d-bg' );
		$this->slider( 'style_dropdown_radius', esc_html__( 'Rounding', 'neo-pulse-wp' ), '--nps-d-radius', 0, 40, false );
		$this->slider( 'style_dropdown_pad', esc_html__( 'Padding', 'neo-pulse-wp' ), '--nps-d-pad', 0, 32 );
		$this->slider( 'style_dropdown_max_h', esc_html__( 'Max height', 'neo-pulse-wp' ), '--nps-d-max-h', 160, 900, true, array( 'px', 'vh' ) );
		$this->slider( 'style_expand_width', esc_html__( 'Width under the icon', 'neo-pulse-wp' ), '--nps-x-w', 240, 720, true, array( 'px', 'vw' ), array( 'condition' => array( 'display_mode' => 'icon_only' ) ) );

		$this->add_group_control(
			Group_Control_Box_Shadow::get_type(),
			array(
				'name'     => 'style_dropdown_shadow',
				'selector' => '{{WRAPPER}} .nps-drop .nps-drop__inner',
			)
		);

		$this->end_controls_section();
	}

	private function style_extras(): void {
		$this->start_controls_section(
			'section_style_extras',
			array(
				'label' => esc_html__( 'AI line and "Powered by"', 'neo-pulse-wp' ),
				'tab'   => Controls_Manager::TAB_STYLE,
			)
		);

		$this->color( 'style_banner_bg', esc_html__( 'AI line background', 'neo-pulse-wp' ), '--nps-ai-bg', array( 'condition' => array( 'show_ai_banner' => 'yes' ) ) );
		$this->color( 'style_banner_text', esc_html__( 'AI line text', 'neo-pulse-wp' ), '--nps-ai-fg', array( 'condition' => array( 'show_ai_banner' => 'yes' ) ) );
		$this->color( 'style_ai_icon', esc_html__( 'AI icon', 'neo-pulse-wp' ), '--nps-ai-icon', array( 'condition' => array( 'show_ai_banner' => 'yes' ) ) );
		$this->color( 'style_powered_text', esc_html__( '"Powered by" text', 'neo-pulse-wp' ), '--nps-pw-fg', array( 'condition' => array( 'show_powered_by' => 'yes' ), 'separator' => 'before' ) );
		$this->color( 'style_powered_icon', esc_html__( '"Powered by" logo lettering', 'neo-pulse-wp' ), '--nps-pw-icon', array( 'condition' => array( 'show_powered_by' => 'yes' ) ) );

		$this->end_controls_section();
	}
}
