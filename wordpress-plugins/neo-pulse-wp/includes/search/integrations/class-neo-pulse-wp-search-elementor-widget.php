<?php
/**
 * Elementor NEO Pulse Search widget (0.9.236).
 *
 * Every part of the search is styled here: the icon button, the search field, the panel or popup,
 * pills, cards, the AI line and "Powered by". Style controls set --nps-* variables (see
 * assets/search/neo-pulse-search.css) on the widget and on the panel once the search script moves it
 * to <body>, so changes show live in the editor and on the site.
 *
 * @package Neo_Pulse_Wp
 */

defined( 'ABSPATH' ) || exit;

use Elementor\Controls_Manager;
use Elementor\Group_Control_Box_Shadow;
use Elementor\Group_Control_Typography;
use Elementor\Widget_Base;

class Neo_Pulse_Wp_Search_Elementor_Widget extends Widget_Base {

	/**
	 * The panel and backdrop are moved to <body> (front end and editor preview) and carry the widget ID.
	 */
	const PORTAL = 'body > .nps-root[data-neo-pulse-el="{{ID}}"]';

	public function get_name(): string {
		return 'neo-pulse_search';
	}

	public function get_title(): string {
		return esc_html__( 'NEO Pulse Search', 'neo-pulse-wp' );
	}

	public function get_icon(): string {
		return 'eicon-search';
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
		return array( 'search', 'ai', 'neo-pulse', 'site search' );
	}

	/**
	 * @return array<int,string>
	 */
	public function get_style_depends(): array {
		return array( 'neo-pulse-ai-sidebar-shell', 'neo-pulse-search' );
	}

	/**
	 * @return array<int,string>
	 */
	public function get_script_depends(): array {
		return array( 'neo-pulse-ai-sidebar-shell', 'neo-pulse-ai-sidebar-unify', 'neo-pulse-search', 'neo-pulse-search-elementor-preview' );
	}

	/**
	 * Output depends on site search settings and live insights, so Elementor must not cache it.
	 */
	protected function is_dynamic_content(): bool {
		return true;
	}

	/* ── Selector helpers ─────────────────────────────────────────────────── */

	/**
	 * Variables go on the widget's search wrap and on its panel/backdrop in <body>.
	 *
	 * @return array<string,string>
	 */
	private static function roots( string $css ): array {
		return array(
			'{{WRAPPER}} .neo-pulse-search-wrap' => $css,
			self::PORTAL                         => $css,
		);
	}

	/**
	 * Element selector inside the widget and inside the panel in <body>.
	 */
	private static function sel( string $inner ): string {
		return '{{WRAPPER}} ' . $inner . ', ' . self::PORTAL . ' ' . $inner;
	}

	/**
	 * The site's saved search setup, used as starting values so an untouched widget behaves as before.
	 *
	 * @return array{sidebar:array<string,mixed>,insights:array<string,mixed>,search:array<string,mixed>}
	 */
	private static function site_defaults(): array {
		static $cache = null;
		if ( $cache === null ) {
			$design = class_exists( 'Neo_Pulse_Wp_Ai_Widget_Design' ) ? Neo_Pulse_Wp_Ai_Widget_Design::get_settings() : array();
			$cache  = array(
				'sidebar'  => isset( $design['search_sidebar'] ) && is_array( $design['search_sidebar'] ) ? $design['search_sidebar'] : array(),
				'insights' => isset( $design['search_insights'] ) && is_array( $design['search_insights'] ) ? $design['search_insights'] : array(),
				'search'   => method_exists( 'Neo_Pulse_Wp_Search', 'get_search_settings' ) ? (array) Neo_Pulse_Wp_Search::get_search_settings() : array(),
			);
		}
		return $cache;
	}

	private static function yes_if( bool $on ): string {
		return $on ? 'yes' : '';
	}

	private static function default_display_mode(): string {
		$mode = (string) ( self::site_defaults()['sidebar']['display_mode'] ?? 'inline' );
		return in_array( $mode, array( 'icon_only', 'sidebar' ), true ) ? 'icon_only' : 'inline';
	}

	private static function default_open_as(): string {
		$sidebar = self::site_defaults()['sidebar'];
		if ( ( $sidebar['display_mode'] ?? '' ) === 'sidebar' ) {
			return ( ( $sidebar['sidebar_side'] ?? 'right' ) === 'left' ) ? 'sidebar_left' : 'sidebar_right';
		}
		$open = (string) ( $sidebar['icon_open_as'] ?? 'sidebar_right' );
		return in_array( $open, array( 'sidebar_right', 'sidebar_left', 'modal_center', 'expand_inline' ), true ) ? $open : 'sidebar_right';
	}

	/* ── Control helpers ──────────────────────────────────────────────────── */

	/**
	 * Colour control writing one or more variables.
	 *
	 * @param string|array<int,string> $vars
	 * @param array<string,mixed>      $extra
	 */
	private function color( string $id, string $label, $vars, array $extra = array() ): void {
		$css = '';
		foreach ( (array) $vars as $var ) {
			$css .= $var . ': {{VALUE}};';
		}
		$this->add_control(
			$id,
			array_merge(
				array(
					'label'     => $label,
					'type'      => Controls_Manager::COLOR,
					'selectors' => self::roots( $css ),
				),
				$extra
			)
		);
	}

	/**
	 * Slider control writing one variable.
	 *
	 * @param array<int,string>   $units
	 * @param array<string,mixed> $extra
	 */
	private function slider( string $id, string $label, string $var, int $min, int $max, bool $responsive = true, array $units = array( 'px' ), array $extra = array() ): void {
		$ranges = array(
			'px' => array( 'min' => $min, 'max' => $max ),
			'%'  => array( 'min' => 0, 'max' => 100 ),
			'vw' => array( 'min' => 0, 'max' => 100 ),
			'vh' => array( 'min' => 0, 'max' => 100 ),
			'em' => array( 'min' => 0, 'max' => 10, 'step' => 0.1 ),
		);
		$args   = array_merge(
			array(
				'label'      => $label,
				'type'       => Controls_Manager::SLIDER,
				'size_units' => $units,
				'range'      => array_intersect_key( $ranges, array_flip( $units ) ),
				'selectors'  => self::roots( $var . ': {{SIZE}}{{UNIT}};' ),
			),
			$extra
		);
		if ( $responsive ) {
			$this->add_responsive_control( $id, $args );
		} else {
			$this->add_control( $id, $args );
		}
	}

	private function typography( string $name, string $label, string $inner ): void {
		$this->add_group_control(
			Group_Control_Typography::get_type(),
			array(
				'name'     => $name,
				'label'    => $label,
				'selector' => self::sel( $inner ),
			)
		);
	}

	private function heading( string $id, string $label ): void {
		$this->add_control(
			$id,
			array(
				'label'     => $label,
				'type'      => Controls_Manager::HEADING,
				'separator' => 'before',
			)
		);
	}

	/**
	 * @param array<string,mixed> $extra
	 */
	private function switcher( string $id, string $label, string $default, array $extra = array() ): void {
		$this->add_control(
			$id,
			array_merge(
				array(
					'label'        => $label,
					'type'         => Controls_Manager::SWITCHER,
					'label_on'     => esc_html__( 'Show', 'neo-pulse-wp' ),
					'label_off'    => esc_html__( 'Hide', 'neo-pulse-wp' ),
					'return_value' => 'yes',
					'default'      => $default,
				),
				$extra
			)
		);
	}

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

	/* ── Output ───────────────────────────────────────────────────────────── */

	protected function render(): void {
		$settings = $this->get_settings_for_display();
		$raw      = $this->get_data( 'settings' );
		$instance = self::map_settings( is_array( $settings ) ? $settings : array(), is_array( $raw ) ? $raw : array() );

		$icon = isset( $settings['launcher_icon_new'] ) && is_array( $settings['launcher_icon_new'] ) ? $settings['launcher_icon_new'] : array();
		if ( ! empty( $icon['value'] ) && class_exists( '\Elementor\Icons_Manager' ) ) {
			ob_start();
			\Elementor\Icons_Manager::render_icon( $icon, array( 'aria-hidden' => 'true' ) );
			$html = trim( (string) ob_get_clean() );
			if ( $html !== '' ) {
				$instance['launcher_icon_html'] = $html;
			}
		}

		if ( self::is_elementor_editor_context() ) {
			$instance['elementor_edit_context'] = true;
			$instance['preview_state']          = (string) ( $settings['preview_state'] ?? 'suggestions' );
		}

		// phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- Markup built and escaped by the renderer.
		echo Neo_Pulse_Wp_Search::render_instance( $instance );
	}

	public static function is_elementor_editor_context(): bool {
		if ( ! class_exists( '\Elementor\Plugin' ) ) {
			return false;
		}
		$plugin = \Elementor\Plugin::$instance;
		if ( isset( $plugin->editor ) && $plugin->editor->is_edit_mode() ) {
			return true;
		}
		if ( isset( $plugin->preview ) && $plugin->preview->is_preview_mode() ) {
			return true;
		}
		return false;
	}

	/**
	 * Widget settings → render instance. $raw holds only what was saved on the widget, used to carry
	 * values from controls that no longer exist (older versions of this widget).
	 *
	 * @param array<string,mixed> $settings Settings with defaults filled in.
	 * @param array<string,mixed> $raw      Saved settings only.
	 * @return array<string,mixed>
	 */
	public static function map_settings( array $settings, array $raw = array() ): array {
		$instance = array();

		// Show as: old "Full-height sidebar" is an icon button that opens a side panel.
		$display = (string) ( $settings['display_mode'] ?? '' );
		$open_as = (string) ( $settings['icon_open_as'] ?? '' );
		if ( $display === 'sidebar' ) {
			$display = 'icon_only';
			$open_as = ( ( $raw['sidebar_side'] ?? ( self::site_defaults()['sidebar']['sidebar_side'] ?? 'right' ) ) === 'left' ) ? 'sidebar_left' : 'sidebar_right';
		}
		if ( ! in_array( $display, array( 'inline', 'icon_only' ), true ) ) {
			$display = self::default_display_mode();
		}
		if ( ! in_array( $open_as, array( 'sidebar_right', 'sidebar_left', 'modal_center', 'expand_inline' ), true ) ) {
			$open_as = self::default_open_as();
		}
		$instance['display_mode'] = $display;
		$instance['icon_open_as'] = $open_as;

		// Text: blank means the site's search settings.
		foreach ( array( 'placeholder', 'button_label' ) as $key ) {
			if ( isset( $settings[ $key ] ) && trim( (string) $settings[ $key ] ) !== '' ) {
				$instance[ $key ] = (string) $settings[ $key ];
			}
		}
		if ( isset( $settings['max_results'] ) && $settings['max_results'] !== '' && $settings['max_results'] !== null ) {
			$instance['max_results'] = (int) $settings['max_results'];
		}

		// Icon button.
		foreach ( array( 'launcher_text', 'launcher_label' ) as $key ) {
			if ( isset( $settings[ $key ] ) ) {
				$instance[ $key ] = (string) $settings[ $key ];
			}
		}
		if ( ! empty( $raw['launcher_icon'] ) ) {
			$instance['launcher_icon'] = Neo_Pulse_Wp_Search_Icons::sanitize_id( (string) $raw['launcher_icon'] );
		}

		// Panel.
		$show_heading = $settings['show_heading'] ?? 'yes';
		if ( ! array_key_exists( 'show_heading', $raw ) && array_key_exists( 'sidebar_layout_heading', $raw ) ) {
			$show_heading = $raw['sidebar_layout_heading'];
		}
		$instance['show_heading']       = ( $show_heading === 'yes' ) ? 'yes' : 'no';
		$instance['sidebar_heading']    = (string) ( $settings['sidebar_heading'] ?? '' );
		$instance['sidebar_subtitle']   = (string) ( $settings['sidebar_subtitle'] ?? '' );
		$instance['sidebar_transition'] = (string) ( $settings['sidebar_transition'] ?? 'slide' );

		// Older widgets: "Hero" preset keeps its larger bar.
		if ( ( $raw['layout_preset'] ?? '' ) === 'hero' ) {
			$instance['layout'] = 'hero';
		}

		// Suggestions.
		foreach ( array( 'popular_terms', 'popular_pages_overseer', 'popular_pages_search' ) as $key ) {
			$instance[ 'show_' . $key ] = ( ( $settings[ 'show_' . $key ] ?? '' ) === 'yes' ) ? 'yes' : 'no';
			if ( isset( $settings[ 'label_' . $key ] ) && trim( (string) $settings[ 'label_' . $key ] ) !== '' ) {
				$instance[ 'label_' . $key ] = (string) $settings[ 'label_' . $key ];
			}
		}
		if ( isset( $settings['popular_terms_limit'] ) && $settings['popular_terms_limit'] !== '' ) {
			$instance['popular_terms_limit'] = (int) $settings['popular_terms_limit'];
		}

		// Switches (yes / no).
		foreach ( array( 'show_field_icon', 'show_thumbnails', 'show_excerpt', 'show_type_tag', 'show_match_score', 'show_best_match', 'show_pinned_terms', 'show_ai_banner', 'show_powered_by', 'combine_with_chat' ) as $key ) {
			$instance[ $key ] = ( ( $settings[ $key ] ?? '' ) === 'yes' ) ? 'yes' : 'no';
		}

		return $instance;
	}
}
