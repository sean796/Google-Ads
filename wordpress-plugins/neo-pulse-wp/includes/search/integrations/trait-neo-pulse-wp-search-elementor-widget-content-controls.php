<?php
/**
 * Content controls for the NEO Pulse Search Elementor widget.
 *
 * @package Neo_Pulse_Wp
 */

defined( 'ABSPATH' ) || exit;

use Elementor\Controls_Manager;

trait Neo_Pulse_Wp_Search_Elementor_Widget_Trait_Content_Controls {

	/* ── Controls ─────────────────────────────────────────────────────────── */

	protected function register_controls(): void {
		$this->content_search();
		$this->content_icon();
		$this->content_panel();
		$this->content_suggestions();
		$this->content_results();

		$this->style_colors();
		$this->style_launcher();
		$this->style_field();
		$this->style_button();
		$this->style_panel();
		$this->style_head();
		$this->style_labels();
		$this->style_pills();
		$this->style_cards();
		$this->style_dropdown();
		$this->style_extras();
	}

	private function content_search(): void {
		$this->start_controls_section( 'section_search', array( 'label' => esc_html__( 'Search', 'neo-pulse-wp' ) ) );

		$this->add_control(
			'display_mode',
			array(
				'label'   => esc_html__( 'Show as', 'neo-pulse-wp' ),
				'type'    => Controls_Manager::SELECT,
				'default' => self::default_display_mode(),
				'options' => array(
					'inline'    => esc_html__( 'Search bar', 'neo-pulse-wp' ),
					'icon_only' => esc_html__( 'Icon button', 'neo-pulse-wp' ),
				),
			)
		);

		$this->add_control(
			'placeholder',
			array(
				'label'       => esc_html__( 'Placeholder', 'neo-pulse-wp' ),
				'type'        => Controls_Manager::TEXT,
				'default'     => '',
				'placeholder' => (string) ( self::site_defaults()['search']['placeholder'] ?? '' ),
				'label_block' => true,
			)
		);

		$this->add_control(
			'button_label',
			array(
				'label'       => esc_html__( 'Button text', 'neo-pulse-wp' ),
				'type'        => Controls_Manager::TEXT,
				'default'     => '',
				'description' => esc_html__( 'Leave blank for an arrow icon.', 'neo-pulse-wp' ),
			)
		);

		$this->add_control(
			'max_results',
			array(
				'label'       => esc_html__( 'Number of results', 'neo-pulse-wp' ),
				'type'        => Controls_Manager::NUMBER,
				'min'         => 1,
				'max'         => 20,
				'step'        => 1,
				'default'     => '',
				'placeholder' => (string) ( self::site_defaults()['search']['max_results'] ?? 8 ),
			)
		);

		$this->switcher( 'show_field_icon', esc_html__( 'Magnifier in the field', 'neo-pulse-wp' ), 'yes' );

		$this->add_responsive_control(
			'align',
			array(
				'label'                => esc_html__( 'Alignment', 'neo-pulse-wp' ),
				'type'                 => Controls_Manager::CHOOSE,
				'options'              => array(
					'left'   => array(
						'title' => esc_html__( 'Left', 'neo-pulse-wp' ),
						'icon'  => 'eicon-text-align-left',
					),
					'center' => array(
						'title' => esc_html__( 'Center', 'neo-pulse-wp' ),
						'icon'  => 'eicon-text-align-center',
					),
					'right'  => array(
						'title' => esc_html__( 'Right', 'neo-pulse-wp' ),
						'icon'  => 'eicon-text-align-right',
					),
				),
				'default'              => 'center',
				'selectors_dictionary' => array(
					'left'   => '--nps-l-align: flex-start; --nps-bar-ml: 0; --nps-bar-mr: auto; --nps-x-l: 0; --nps-x-r: auto; --nps-x-shift: 0 0;',
					'center' => '--nps-l-align: center; --nps-bar-ml: auto; --nps-bar-mr: auto; --nps-x-l: 50%; --nps-x-r: auto; --nps-x-shift: -50% 0;',
					'right'  => '--nps-l-align: flex-end; --nps-bar-ml: auto; --nps-bar-mr: 0; --nps-x-l: auto; --nps-x-r: 0; --nps-x-shift: 0 0;',
				),
				'selectors'            => array(
					'{{WRAPPER}} .neo-pulse-search-wrap' => '{{VALUE}}',
				),
			)
		);

		$this->slider(
			'max_width',
			esc_html__( 'Max width', 'neo-pulse-wp' ),
			'--nps-bar-max',
			200,
			1200,
			true,
			array( 'px', '%', 'vw' ),
			array(
				'default'   => array( 'unit' => 'px', 'size' => 520 ),
				'condition' => array( 'display_mode' => 'inline' ),
			)
		);

		$this->end_controls_section();
	}

	private function content_icon(): void {
		$this->start_controls_section(
			'section_icon',
			array(
				'label'     => esc_html__( 'Icon button', 'neo-pulse-wp' ),
				'condition' => array( 'display_mode' => 'icon_only' ),
			)
		);

		$this->add_control(
			'launcher_icon_new',
			array(
				'label'       => esc_html__( 'Icon', 'neo-pulse-wp' ),
				'type'        => Controls_Manager::ICONS,
				'skin'        => 'inline',
				'label_block' => false,
				'default'     => array(
					'value'   => '',
					'library' => '',
				),
				'description' => esc_html__( 'Pick an icon or upload an SVG. Empty uses the NEO Pulse magnifier.', 'neo-pulse-wp' ),
			)
		);

		$this->add_control(
			'launcher_text',
			array(
				'label'       => esc_html__( 'Text next to the icon', 'neo-pulse-wp' ),
				'type'        => Controls_Manager::TEXT,
				'default'     => '',
				'placeholder' => esc_html__( 'e.g. Search', 'neo-pulse-wp' ),
			)
		);

		$this->add_control(
			'launcher_label',
			array(
				'label'       => esc_html__( 'Screen-reader label', 'neo-pulse-wp' ),
				'type'        => Controls_Manager::TEXT,
				'default'     => '',
				'placeholder' => esc_html__( 'Open search', 'neo-pulse-wp' ),
			)
		);

		$this->add_control(
			'icon_open_as',
			array(
				'label'     => esc_html__( 'Results open in', 'neo-pulse-wp' ),
				'type'      => Controls_Manager::SELECT,
				'default'   => self::default_open_as(),
				'options'   => array(
					'sidebar_right' => esc_html__( 'Side panel (right)', 'neo-pulse-wp' ),
					'sidebar_left'  => esc_html__( 'Side panel (left)', 'neo-pulse-wp' ),
					'modal_center'  => esc_html__( 'Centred popup', 'neo-pulse-wp' ),
					'expand_inline' => esc_html__( 'Search bar under the icon', 'neo-pulse-wp' ),
				),
				'separator' => 'before',
			)
		);

		$this->end_controls_section();
	}

	private function content_panel(): void {
		$panel = array(
			'display_mode'  => 'icon_only',
			'icon_open_as!' => 'expand_inline',
		);

		$this->start_controls_section(
			'section_panel',
			array(
				'label'     => esc_html__( 'Panel', 'neo-pulse-wp' ),
				'condition' => $panel,
			)
		);

		$this->switcher(
			'show_heading',
			esc_html__( 'Heading', 'neo-pulse-wp' ),
			self::yes_if( in_array( 'heading', (array) ( self::site_defaults()['sidebar']['sidebar_layout'] ?? array( 'heading' ) ), true ) )
		);

		$this->add_control(
			'sidebar_heading',
			array(
				'label'     => esc_html__( 'Heading text', 'neo-pulse-wp' ),
				'type'      => Controls_Manager::TEXT,
				'default'   => (string) ( self::site_defaults()['sidebar']['sidebar_heading'] ?? '' ),
				'placeholder' => esc_html__( 'Search', 'neo-pulse-wp' ),
				'condition' => array( 'show_heading' => 'yes' ),
			)
		);

		$this->add_control(
			'sidebar_subtitle',
			array(
				'label'       => esc_html__( 'Subtitle', 'neo-pulse-wp' ),
				'type'        => Controls_Manager::TEXTAREA,
				'default'     => '',
				'rows'        => 2,
				'placeholder' => esc_html__( 'Find products, guides and services', 'neo-pulse-wp' ),
			)
		);

		$this->add_control(
			'sidebar_transition',
			array(
				'label'   => esc_html__( 'Animation', 'neo-pulse-wp' ),
				'type'    => Controls_Manager::SELECT,
				'default' => in_array( (string) ( self::site_defaults()['sidebar']['sidebar_transition'] ?? 'slide' ), array( 'slide', 'fade', 'none' ), true ) ? (string) ( self::site_defaults()['sidebar']['sidebar_transition'] ?? 'slide' ) : 'slide',
				'options' => array(
					'slide' => esc_html__( 'Slide', 'neo-pulse-wp' ),
					'fade'  => esc_html__( 'Fade', 'neo-pulse-wp' ),
					'none'  => esc_html__( 'None', 'neo-pulse-wp' ),
				),
			)
		);

		$this->add_control(
			'combine_with_chat',
			array(
				'label'        => esc_html__( 'Share the panel with NEO Pulse Chat', 'neo-pulse-wp' ),
				'type'         => Controls_Manager::SWITCHER,
				'return_value' => 'yes',
				'default'      => '',
				'description'  => esc_html__( 'When chat is on, show search and chat as tabs in one panel.', 'neo-pulse-wp' ),
			)
		);

		$this->end_controls_section();
	}

	private function content_suggestions(): void {
		$insights = self::site_defaults()['insights'];

		$this->start_controls_section(
			'section_suggestions',
			array(
				'label' => esc_html__( 'Suggestions', 'neo-pulse-wp' ),
			)
		);

		$this->add_control(
			'suggestions_note',
			array(
				'type'            => Controls_Manager::RAW_HTML,
				'raw'             => esc_html__( 'Shown before the visitor types: in the panel, or in the dropdown when the search bar is clicked.', 'neo-pulse-wp' ),
				'content_classes' => 'elementor-descriptor',
			)
		);

		$sections = array(
			'popular_terms'          => array( esc_html__( 'Popular searches', 'neo-pulse-wp' ), ! empty( $insights['show_popular_terms'] ?? true ) ),
			'popular_pages_overseer' => array( esc_html__( 'Popular pages', 'neo-pulse-wp' ), ! empty( $insights['show_popular_pages_overseer'] ?? false ) ),
			'popular_pages_search'   => array( esc_html__( 'Others also found', 'neo-pulse-wp' ), ! empty( $insights['show_popular_pages_search'] ?? false ) ),
		);

		foreach ( $sections as $key => $section ) {
			$this->switcher( 'show_' . $key, $section[0], self::yes_if( $section[1] ), array( 'separator' => 'before' ) );
			$this->add_control(
				'label_' . $key,
				array(
					'label'       => esc_html__( 'Label', 'neo-pulse-wp' ),
					'type'        => Controls_Manager::TEXT,
					'default'     => '',
					'placeholder' => $section[0],
					'condition'   => array( 'show_' . $key => 'yes' ),
				)
			);
			if ( $key === 'popular_terms' ) {
				$this->add_control(
					'popular_terms_limit',
					array(
						'label'     => esc_html__( 'How many', 'neo-pulse-wp' ),
						'type'      => Controls_Manager::NUMBER,
						'min'       => 1,
						'max'       => 12,
						'default'   => (int) ( $insights['popular_terms_limit'] ?? 5 ),
						'condition' => array( 'show_popular_terms' => 'yes' ),
					)
				);
				$this->switcher(
					'show_pinned_terms',
					esc_html__( 'Pinned searches', 'neo-pulse-wp' ),
					'yes',
					array(
						'condition'   => array( 'show_popular_terms' => 'yes' ),
						'description' => esc_html__( 'Searches pinned under NEO Pulse → Search → Popular searches show first. On a new site with no searches yet, the AI suggests a couple.', 'neo-pulse-wp' ),
					)
				);
			}
		}

		$this->end_controls_section();
	}

	private function content_results(): void {
		$this->start_controls_section( 'section_results', array( 'label' => esc_html__( 'Results', 'neo-pulse-wp' ) ) );

		$this->switcher( 'show_thumbnails', esc_html__( 'Thumbnails', 'neo-pulse-wp' ), 'yes' );
		$this->switcher( 'show_excerpt', esc_html__( 'Description', 'neo-pulse-wp' ), 'yes' );
		$this->switcher( 'show_type_tag', esc_html__( 'Type tag (Page, Blog…)', 'neo-pulse-wp' ), 'yes' );
		$this->switcher(
			'show_match_score',
			esc_html__( 'Match score (%)', 'neo-pulse-wp' ),
			'yes',
			array( 'description' => esc_html__( 'A pill on each result showing how closely it matches the search, green for strong matches, amber for good and grey for weak.', 'neo-pulse-wp' ) )
		);
		$this->switcher(
			'show_best_match',
			esc_html__( '"Best match" label', 'neo-pulse-wp' ),
			'yes',
			array( 'description' => esc_html__( 'Highlights the top result with a tinted card and a "Best match" label.', 'neo-pulse-wp' ) )
		);
		$this->switcher( 'show_ai_banner', esc_html__( 'AI summary line', 'neo-pulse-wp' ), 'yes' );
		$this->switcher( 'show_powered_by', esc_html__( '"Powered by NEO Pulse"', 'neo-pulse-wp' ), 'yes' );

		$this->add_control(
			'preview_panel',
			array(
				'label'        => esc_html__( 'Preview while editing', 'neo-pulse-wp' ),
				'type'         => Controls_Manager::SWITCHER,
				'label_on'     => esc_html__( 'On', 'neo-pulse-wp' ),
				'label_off'    => esc_html__( 'Off', 'neo-pulse-wp' ),
				'return_value' => 'yes',
				'default'      => 'yes',
				'separator'    => 'before',
				'description'  => esc_html__( 'Opens the panel or dropdown in the editor while this widget is selected, so style changes show live. It closes when you select something else.', 'neo-pulse-wp' ),
			)
		);

		$this->add_control(
			'preview_state',
			array(
				'label'     => esc_html__( 'Preview shows', 'neo-pulse-wp' ),
				'type'      => Controls_Manager::SELECT,
				'default'   => 'suggestions',
				'options'   => array(
					'suggestions' => esc_html__( 'Suggestions (before typing)', 'neo-pulse-wp' ),
					'results'     => esc_html__( 'Sample results', 'neo-pulse-wp' ),
				),
				'condition' => array( 'preview_panel' => 'yes' ),
			)
		);

		$this->end_controls_section();
	}
}
