<?php
/**
 * Elementor NEO Pulse Chat widget.
 *
 * Places the AI chat bubble on every page that uses the template it sits in (put it in the
 * footer template for the whole site) and holds all of the chat's design settings. On the live
 * site the widget prints nothing where it sits: it hands its design to Neo_Pulse_Wp_Chat, which
 * prints the floating bubble in the footer. In the Elementor editor it shows a preview.
 *
 * @package Neo_Pulse_Wp
 */

defined( 'ABSPATH' ) || exit;

use Elementor\Controls_Manager;
use Elementor\Widget_Base;

class Neo_Pulse_Wp_Chat_Elementor_Widget extends Widget_Base {

	const PREVIEW_STYLE = 'neo-pulse-chat-elementor-preview';

	public function get_name(): string {
		return 'neo-pulse_chat';
	}

	public function get_title(): string {
		return esc_html__( 'NEO Pulse Chat', 'neo-pulse-wp' );
	}

	public function get_icon(): string {
		return 'eicon-comments';
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
		return array( 'chat', 'ai', 'assistant', 'neo-pulse', 'bubble' );
	}

	/**
	 * @return array<int,string>
	 */
	public function get_style_depends(): array {
		return array( self::PREVIEW_STYLE );
	}

	/**
	 * The widget must run on every page view (Elementor element caching would skip render()).
	 */
	protected function is_dynamic_content(): bool {
		return true;
	}

	/**
	 * Colour tokens the widget controls, grouped by style section: token => [ label, css var suffix ].
	 *
	 * @return array<string,array<string,array{0:string,1:string}>>
	 */
	public static function color_groups(): array {
		return array(
			'launcher' => array(
				'launcher_bg'   => array( __( 'Bubble background', 'neo-pulse-wp' ), 'launcher-bg' ),
				'launcher_text' => array( __( 'Bubble icon', 'neo-pulse-wp' ), 'launcher-text' ),
				'launcher_glow' => array( __( 'Bubble glow', 'neo-pulse-wp' ), 'launcher-glow' ),
			),
			'panel'    => array(
				'bg'             => array( __( 'Panel background', 'neo-pulse-wp' ), 'bg' ),
				'header_bg'      => array( __( 'Header background', 'neo-pulse-wp' ), 'header-bg' ),
				'bg_elevated'    => array( __( 'Raised areas', 'neo-pulse-wp' ), 'bg-elevated' ),
				'text'           => array( __( 'Text', 'neo-pulse-wp' ), 'text' ),
				'text_secondary' => array( __( 'Secondary text', 'neo-pulse-wp' ), 'text-secondary' ),
				'text_muted'     => array( __( 'Muted text', 'neo-pulse-wp' ), 'text-muted' ),
				'link'           => array( __( 'Links', 'neo-pulse-wp' ), 'link' ),
				'border'         => array( __( 'Borders', 'neo-pulse-wp' ), 'border' ),
			),
			'messages' => array(
				'user_bubble_bg'        => array( __( 'Visitor message background', 'neo-pulse-wp' ), 'user-bubble-bg' ),
				'user_bubble_text'      => array( __( 'Visitor message text', 'neo-pulse-wp' ), 'user-bubble-text' ),
				'assistant_bubble_bg'   => array( __( 'Assistant message background', 'neo-pulse-wp' ), 'assistant-bubble-bg' ),
				'assistant_bubble_text' => array( __( 'Assistant message text', 'neo-pulse-wp' ), 'assistant-bubble-text' ),
				'card_bg'               => array( __( 'Answer cards', 'neo-pulse-wp' ), 'card-bg' ),
				'thinking_border'       => array( __( '"Thinking" outline', 'neo-pulse-wp' ), 'thinking-border' ),
				'highlight'             => array( __( 'Highlights', 'neo-pulse-wp' ), 'highlight' ),
			),
			'composer' => array(
				'input_bg'      => array( __( 'Input background', 'neo-pulse-wp' ), 'input-bg' ),
				'input_text'    => array( __( 'Input text', 'neo-pulse-wp' ), 'input-text' ),
				'placeholder'   => array( __( 'Placeholder', 'neo-pulse-wp' ), 'placeholder' ),
				'form_border'   => array( __( 'Input border', 'neo-pulse-wp' ), 'form-border' ),
				'focus_ring'    => array( __( 'Focus ring', 'neo-pulse-wp' ), 'focus-ring' ),
				'send_bg'       => array( __( 'Send button', 'neo-pulse-wp' ), 'send-bg' ),
				'mic_idle'      => array( __( 'Microphone', 'neo-pulse-wp' ), 'mic-idle' ),
				'mic_recording' => array( __( 'Microphone while recording', 'neo-pulse-wp' ), 'mic-recording' ),
			),
			'buttons'  => array(
				'accent'        => array( __( 'Accent', 'neo-pulse-wp' ), 'accent' ),
				'accent_text'   => array( __( 'Text on accent', 'neo-pulse-wp' ), 'accent-text' ),
				'button_bg'     => array( __( 'Button background', 'neo-pulse-wp' ), 'button-bg' ),
				'button_text'   => array( __( 'Button text', 'neo-pulse-wp' ), 'button-text' ),
				'button_hover'  => array( __( 'Button hover', 'neo-pulse-wp' ), 'button-hover' ),
				'button_border' => array( __( 'Button border', 'neo-pulse-wp' ), 'button-border' ),
				'powered_text'  => array( __( '"Powered by" text', 'neo-pulse-wp' ), 'powered' ),
				'powered_icon'  => array( __( '"Powered by" logo lettering', 'neo-pulse-wp' ), 'powered-icon' ),
			),
		);
	}

	/**
	 * Show/hide switches: chat_ui key => label.
	 *
	 * @return array<string,string>
	 */
	public static function visibility_labels(): array {
		return array(
			'header'           => __( 'Header', 'neo-pulse-wp' ),
			'avatar'           => __( 'Avatar', 'neo-pulse-wp' ),
			'assistant_name'   => __( 'Assistant name', 'neo-pulse-wp' ),
			'close_button'     => __( 'Close button', 'neo-pulse-wp' ),
			'welcome_message'  => __( 'Welcome message', 'neo-pulse-wp' ),
			'thinking_card'    => __( '"Thinking" card', 'neo-pulse-wp' ),
			'source_pills'     => __( 'Source links', 'neo-pulse-wp' ),
			'cta_buttons'      => __( 'Call-to-action buttons', 'neo-pulse-wp' ),
			'suggestion_chips' => __( 'Suggested questions', 'neo-pulse-wp' ),
			'confidence'       => __( 'Confidence label', 'neo-pulse-wp' ),
			'type_badge'       => __( 'Answer type badge', 'neo-pulse-wp' ),
			'powered_by'       => __( '"Powered by NEO Pulse"', 'neo-pulse-wp' ),
			'send_button'      => __( 'Send button', 'neo-pulse-wp' ),
			'mic_button'       => __( 'Microphone button', 'neo-pulse-wp' ),
			'voice_toast'      => __( 'Voice tips', 'neo-pulse-wp' ),
		);
	}

	/**
	 * Current site chat design: the starting values for a newly placed widget.
	 *
	 * @return array{tokens:array<string,mixed>,ui:array<string,bool>,sidebar:array<string,mixed>}
	 */
	private static function site_defaults(): array {
		static $cache = null;
		if ( $cache !== null ) {
			return $cache;
		}
		$tokens  = class_exists( 'Neo_Pulse_Wp_Ai_Widget_Design' ) ? Neo_Pulse_Wp_Ai_Widget_Design::resolve( 'chat' ) : array();
		$design  = class_exists( 'Neo_Pulse_Wp_Ai_Widget_Design' ) ? Neo_Pulse_Wp_Ai_Widget_Design::get_settings() : array();
		$ui      = isset( $design['chat_ui'] ) && is_array( $design['chat_ui'] ) ? $design['chat_ui'] : array();
		$stored  = get_option( Neo_Pulse_Wp_Chat::OPTION_KEY, array() );
		$sidebar = Neo_Pulse_Wp_Ai_Widget_Design::resolve_sidebar_config( 'chat', is_array( $stored ) ? $stored : array() );
		$cache   = array(
			'tokens'  => $tokens,
			'ui'      => $ui,
			'sidebar' => $sidebar,
		);
		return $cache;
	}

	protected function register_controls(): void {
		$defaults = self::site_defaults();
		$tokens   = $defaults['tokens'];
		$sidebar  = $defaults['sidebar'];
		$ui       = $defaults['ui'];
		$inner    = '{{WRAPPER}} .np-chat-mock__inner';

		// ── Content: where it shows ──────────────────────────────────
		$this->start_controls_section( 'section_chat', array( 'label' => esc_html__( 'Chat bubble', 'neo-pulse-wp' ) ) );
		$this->add_control(
			'chat_note',
			array(
				'type'            => Controls_Manager::RAW_HTML,
				'raw'             => sprintf(
					/* translators: %s: link to the Chat settings screen */
					esc_html__( 'The chat bubble floats at the bottom of every page that uses this template, so place this widget in your footer template to show chat on the whole site. Everything about how chat looks is set here. Turning chat on or off, who can see it and what it knows are under %s.', 'neo-pulse-wp' ),
					'<a href="' . esc_url( admin_url( 'admin.php?page=neo-pulse-wp-chat' ) ) . '" target="_blank">' . esc_html__( 'NEO Pulse → AI Tools → Chat', 'neo-pulse-wp' ) . '</a>'
				),
				'content_classes' => 'elementor-panel-alert elementor-panel-alert-info',
			)
		);
		$this->add_control(
			'preview_open',
			array(
				'label'        => esc_html__( 'Show the panel open in the editor', 'neo-pulse-wp' ),
				'type'         => Controls_Manager::SWITCHER,
				'return_value' => 'yes',
				'default'      => 'yes',
			)
		);
		$this->end_controls_section();

		// ── Content: launcher ────────────────────────────────────────
		$this->start_controls_section( 'section_launcher', array( 'label' => esc_html__( 'Launcher', 'neo-pulse-wp' ) ) );
		$this->add_control(
			'launcher_style',
			array(
				'label'   => esc_html__( 'Style', 'neo-pulse-wp' ),
				'type'    => Controls_Manager::SELECT,
				'default' => in_array( $sidebar['launcher_style'] ?? 'circle', array( 'circle', 'edge_tab', 'none' ), true ) ? (string) $sidebar['launcher_style'] : 'circle',
				'options' => array(
					'circle'   => esc_html__( 'Round bubble', 'neo-pulse-wp' ),
					'edge_tab' => esc_html__( 'Tab on the edge of the screen', 'neo-pulse-wp' ),
					'none'     => esc_html__( 'No launcher (open from the search panel only)', 'neo-pulse-wp' ),
				),
			)
		);
		$this->add_control(
			'sidebar_side',
			array(
				'label'   => esc_html__( 'Side of the screen', 'neo-pulse-wp' ),
				'type'    => Controls_Manager::CHOOSE,
				'default' => ( $sidebar['sidebar_side'] ?? 'right' ) === 'left' ? 'left' : 'right',
				'options' => array(
					'left'  => array(
						'title' => esc_html__( 'Left', 'neo-pulse-wp' ),
						'icon'  => 'eicon-h-align-left',
					),
					'right' => array(
						'title' => esc_html__( 'Right', 'neo-pulse-wp' ),
						'icon'  => 'eicon-h-align-right',
					),
				),
				'toggle'  => false,
			)
		);
		$this->add_control(
			'launcher_icon_new',
			array(
				'label'       => esc_html__( 'Bubble icon', 'neo-pulse-wp' ),
				'type'        => Controls_Manager::ICONS,
				'skin'        => 'inline',
				'label_block' => false,
				'default'     => array(
					'value'   => '',
					'library' => '',
				),
				'description' => esc_html__( 'Pick an icon or upload an SVG. Empty uses the chat bubble icon.', 'neo-pulse-wp' ),
				'condition'   => array( 'launcher_style!' => 'none' ),
			)
		);
		$this->add_control(
			'launcher_label',
			array(
				'label'       => esc_html__( 'Tab text / screen-reader label', 'neo-pulse-wp' ),
				'type'        => Controls_Manager::TEXT,
				'default'     => (string) ( $sidebar['launcher_label'] ?? '' ),
				'placeholder' => esc_html__( 'Open Pulse Assist', 'neo-pulse-wp' ),
			)
		);
		$this->add_control(
			'header_search_opens_sidebar',
			array(
				'label'        => esc_html__( 'Header search icon opens chat', 'neo-pulse-wp' ),
				'type'         => Controls_Manager::SWITCHER,
				'return_value' => 'yes',
				'default'      => ! empty( $sidebar['header_search_opens_sidebar'] ) ? 'yes' : '',
			)
		);
		$this->end_controls_section();

		// ── Content: panel ───────────────────────────────────────────
		$this->start_controls_section( 'section_panel', array( 'label' => esc_html__( 'Panel', 'neo-pulse-wp' ) ) );
		$this->add_control(
			'sidebar_heading',
			array(
				'label'       => esc_html__( 'Heading', 'neo-pulse-wp' ),
				'type'        => Controls_Manager::TEXT,
				'default'     => (string) ( $sidebar['sidebar_heading'] ?? '' ),
				'placeholder' => esc_html__( 'Leave blank for none', 'neo-pulse-wp' ),
			)
		);
		$this->add_control(
			'assistant_name',
			array(
				'label'       => esc_html__( 'Assistant name', 'neo-pulse-wp' ),
				'type'        => Controls_Manager::TEXT,
				'default'     => (string) ( Neo_Pulse_Wp_Chat::get_settings()['assistant_name'] ?? 'Pulse Assist' ),
				'placeholder' => 'Pulse Assist',
				'description' => esc_html__( 'Shown in the chat header, and the name the assistant uses for itself.', 'neo-pulse-wp' ),
			)
		);
		$this->add_control(
			'header_status',
			array(
				'label'       => esc_html__( 'Line under the assistant name', 'neo-pulse-wp' ),
				'type'        => Controls_Manager::TEXT,
				'default'     => __( 'Replies instantly', 'neo-pulse-wp' ),
				'placeholder' => esc_html__( 'Leave blank for none', 'neo-pulse-wp' ),
			)
		);
		$this->add_control(
			'avatar_image',
			array(
				'label'       => esc_html__( 'Avatar image', 'neo-pulse-wp' ),
				'type'        => Controls_Manager::MEDIA,
				'default'     => array( 'url' => '' ),
				'description' => esc_html__( 'Empty shows the first letter of the assistant name.', 'neo-pulse-wp' ),
			)
		);
		$this->add_control(
			'sidebar_transition',
			array(
				'label'   => esc_html__( 'Opening animation', 'neo-pulse-wp' ),
				'type'    => Controls_Manager::SELECT,
				'default' => in_array( $sidebar['sidebar_transition'] ?? 'slide', array( 'slide', 'fade', 'none' ), true ) ? (string) $sidebar['sidebar_transition'] : 'slide',
				'options' => array(
					'slide' => esc_html__( 'Slide in', 'neo-pulse-wp' ),
					'fade'  => esc_html__( 'Fade in', 'neo-pulse-wp' ),
					'none'  => esc_html__( 'None', 'neo-pulse-wp' ),
				),
			)
		);
		$this->add_control(
			'sidebar_width',
			array(
				'label'      => esc_html__( 'Panel width', 'neo-pulse-wp' ),
				'type'       => Controls_Manager::SLIDER,
				'size_units' => array( 'px' ),
				'range'      => array(
					'px' => array(
						'min' => 280,
						'max' => 560,
					),
				),
				'default'    => array(
					'unit' => 'px',
					'size' => max( 280, min( 560, (int) ( $sidebar['sidebar_width'] ?? 400 ) ) ),
				),
				'selectors'  => array( $inner => '--np-mock-width: {{SIZE}}px;' ),
			)
		);
		$this->end_controls_section();

		// ── Content: show / hide ─────────────────────────────────────
		$this->start_controls_section( 'section_visibility', array( 'label' => esc_html__( 'Show or hide', 'neo-pulse-wp' ) ) );
		foreach ( self::visibility_labels() as $key => $label ) {
			$this->add_control(
				'ui_' . $key,
				array(
					'label'        => $label,
					'type'         => Controls_Manager::SWITCHER,
					'return_value' => 'yes',
					'default'      => ! empty( $ui[ $key ] ) ? 'yes' : '',
				)
			);
		}
		$this->end_controls_section();

		// ── Style ────────────────────────────────────────────────────
		$sections = array(
			'launcher' => esc_html__( 'Launcher', 'neo-pulse-wp' ),
			'panel'    => esc_html__( 'Panel', 'neo-pulse-wp' ),
			'messages' => esc_html__( 'Messages', 'neo-pulse-wp' ),
			'composer' => esc_html__( 'Message box', 'neo-pulse-wp' ),
			'buttons'  => esc_html__( 'Buttons and accents', 'neo-pulse-wp' ),
		);
		$groups = self::color_groups();
		foreach ( $sections as $group => $title ) {
			$this->start_controls_section(
				'section_style_' . $group,
				array(
					'label' => $title,
					'tab'   => Controls_Manager::TAB_STYLE,
				)
			);
			foreach ( $groups[ $group ] as $token => $meta ) {
				$this->add_control(
					'c_' . $token,
					array(
						'label'     => $meta[0],
						'type'      => Controls_Manager::COLOR,
						'default'   => '',
						'selectors' => array( $inner => '--fcw-' . $meta[1] . ': {{VALUE}};' ),
					)
				);
			}
			if ( $group === 'launcher' ) {
				$this->add_size_control( 'launcher_size', esc_html__( 'Bubble size', 'neo-pulse-wp' ), 40, 96, (int) ( $tokens['launcher_size'] ?? 56 ), '--fcw-bubble-size' );
				$this->add_size_control( 'launcher_icon', esc_html__( 'Icon size', 'neo-pulse-wp' ), 12, 48, 24, '--fcw-launcher-icon' );
				$this->add_size_control( 'launcher_radius', esc_html__( 'Bubble rounding', 'neo-pulse-wp' ), 0, 48, 48, '--fcw-launcher-radius' );
				$this->add_size_control( 'offset_x', esc_html__( 'Distance from the side', 'neo-pulse-wp' ), 0, 200, (int) ( $tokens['offset_x'] ?? 16 ), '--np-mock-offset-x' );
				$this->add_size_control( 'offset_y', esc_html__( 'Distance from the bottom', 'neo-pulse-wp' ), 0, 200, (int) ( $tokens['offset_y'] ?? 20 ), '--np-mock-offset-y' );
			}
			if ( $group === 'panel' ) {
				$this->add_control(
					'font_family',
					array(
						'label'     => esc_html__( 'Font', 'neo-pulse-wp' ),
						'type'      => Controls_Manager::FONT,
						'default'   => '',
						'selectors' => array( $inner => '--fcw-font-family: "{{VALUE}}";' ),
					)
				);
				$this->add_size_control( 'font_size', esc_html__( 'Text size', 'neo-pulse-wp' ), 16, 22, max( 16, (int) ( $tokens['font_size'] ?? 16 ) ), '--fcw-font-size' );
				$this->add_size_control( 'radius', esc_html__( 'Corner rounding (small parts)', 'neo-pulse-wp' ), 0, 30, (int) ( $tokens['radius'] ?? 8 ), '--fcw-radius' );
				$this->add_size_control( 'panel_radius', esc_html__( 'Panel rounding', 'neo-pulse-wp' ), 0, 48, 24, '--fcw-panel-radius' );
				$this->add_size_control( 'head_size', esc_html__( 'Assistant name size', 'neo-pulse-wp' ), 12, 32, 17, '--fcw-head-size' );
				$this->add_control(
					'c_bd_color',
					array(
						'label'     => esc_html__( 'Page behind the panel', 'neo-pulse-wp' ),
						'type'      => Controls_Manager::COLOR,
						'default'   => '',
						'separator' => 'before',
						'selectors' => array( $inner => '--fcw-bd-color: {{VALUE}};' ),
					)
				);
				$this->add_size_control( 'bd_opacity', esc_html__( 'Darkness (%)', 'neo-pulse-wp' ), 0, 100, 38, '--fcw-bd-opacity', '%' );
				$this->add_size_control( 'bd_blur', esc_html__( 'Blur', 'neo-pulse-wp' ), 0, 24, 4, '--fcw-bd-blur' );
			}
			if ( $group === 'messages' ) {
				$this->add_size_control( 'msg_radius', esc_html__( 'Message rounding', 'neo-pulse-wp' ), 0, 32, 18, '--fcw-msg-radius' );
			}
			if ( $group === 'composer' ) {
				$this->add_size_control( 'composer_radius', esc_html__( 'Message box rounding', 'neo-pulse-wp' ), 0, 40, 26, '--fcw-composer-radius' );
			}
			if ( $group === 'buttons' ) {
				$this->add_size_control( 'pill_radius', esc_html__( 'Button and suggestion rounding', 'neo-pulse-wp' ), 0, 40, 40, '--fcw-pill-radius' );
			}
			$this->end_controls_section();
		}
	}

	private function add_size_control( string $id, string $label, int $min, int $max, int $default, string $css_var, string $unit = 'px' ): void {
		$this->add_control(
			$id,
			array(
				'label'      => $label,
				'type'       => Controls_Manager::SLIDER,
				'size_units' => array( $unit ),
				'range'      => array(
					$unit => array(
						'min' => $min,
						'max' => $max,
					),
				),
				'default'    => array(
					'unit' => $unit,
					'size' => max( $min, min( $max, $default ) ),
				),
				'selectors'  => array( '{{WRAPPER}} .np-chat-mock__inner' => $css_var . ': {{SIZE}}' . $unit . ';' ),
			)
		);
	}

	/**
	 * Accept only plain colour values (hex, rgb/rgba, hsl/hsla, Elementor global variables).
	 */
	public static function clean_color( $value ): string {
		$value = trim( (string) $value );
		if ( $value === '' ) {
			return '';
		}
		if ( preg_match( '/^#[0-9a-f]{3,8}$/i', $value )
			|| preg_match( '/^(rgb|hsl)a?\([0-9.,%\s\/]+\)$/i', $value )
			|| preg_match( '/^var\(\s*--e-global-color-[a-z0-9_-]+\s*\)$/i', $value ) ) {
			return $value;
		}
		return '';
	}

	/**
	 * Elementor settings → chat design (tokens, visibility, sidebar).
	 *
	 * @param array<string,mixed> $settings Widget settings for display.
	 * @return array{tokens:array<string,mixed>,ui:array<string,bool>,sidebar:array<string,mixed>}
	 */
	public static function design_from_settings( array $settings ): array {
		$tokens  = array();
		$globals = isset( $settings['__globals__'] ) && is_array( $settings['__globals__'] ) ? $settings['__globals__'] : array();
		foreach ( self::color_groups() as $group ) {
			foreach ( array_keys( $group ) as $token ) {
				$key = 'c_' . $token;
				// A colour picked from the Elementor global palette is stored as a reference, not a value.
				if ( ! empty( $globals[ $key ] ) && preg_match( '/^globals\/colors\?id=([a-z0-9_-]+)$/i', (string) $globals[ $key ], $m ) ) {
					$tokens[ $token ] = 'var(--e-global-color-' . strtolower( $m[1] ) . ')';
					continue;
				}
				$color = self::clean_color( $settings[ $key ] ?? '' );
				if ( $color !== '' ) {
					$tokens[ $token ] = $color;
				}
			}
		}
		$sizes = array(
			'launcher_size' => array( 40, 96 ),
			'offset_x'      => array( 0, 200 ),
			'offset_y'      => array( 0, 200 ),
			'font_size'     => array( 16, 22 ),
			'radius'        => array( 0, 30 ),
			'launcher_icon'   => array( 12, 48 ),
			'launcher_radius' => array( 0, 48 ),
			'panel_radius'    => array( 0, 48 ),
			'head_size'       => array( 12, 32 ),
			'bd_opacity'      => array( 0, 100 ),
			'bd_blur'         => array( 0, 24 ),
			'msg_radius'      => array( 0, 32 ),
			'composer_radius' => array( 0, 40 ),
			'pill_radius'     => array( 0, 40 ),
		);
		foreach ( $sizes as $key => $range ) {
			if ( isset( $settings[ $key ]['size'] ) && $settings[ $key ]['size'] !== '' ) {
				$tokens[ $key ] = max( $range[0], min( $range[1], (int) $settings[ $key ]['size'] ) );
			}
		}
		// "Fully round" at the top of the range.
		foreach ( array( 'launcher_radius' => 48, 'pill_radius' => 40 ) as $key => $max ) {
			if ( isset( $tokens[ $key ] ) && $tokens[ $key ] >= $max ) {
				$tokens[ $key ] = 999;
			}
		}
		if ( ! empty( $globals['c_bd_color'] ) && preg_match( '/^globals\/colors\?id=([a-z0-9_-]+)$/i', (string) $globals['c_bd_color'], $m ) ) {
			$tokens['bd_color'] = 'var(--e-global-color-' . strtolower( $m[1] ) . ')';
		} elseif ( self::clean_color( $settings['c_bd_color'] ?? '' ) !== '' ) {
			$tokens['bd_color'] = self::clean_color( $settings['c_bd_color'] );
		}
		if ( isset( $tokens['radius'] ) ) {
			$tokens['radius_sm'] = max( 0, (int) round( $tokens['radius'] * 0.75 ) );
		}
		$font = isset( $settings['font_family'] ) ? trim( (string) $settings['font_family'] ) : '';
		if ( $font !== '' && preg_match( '/^[a-z0-9 \-]+$/i', $font ) ) {
			$tokens['font_family'] = $font;
		}

		$ui = array();
		foreach ( array_keys( self::visibility_labels() ) as $key ) {
			$ui[ $key ] = ( $settings[ 'ui_' . $key ] ?? '' ) === 'yes';
		}

		$style   = (string) ( $settings['launcher_style'] ?? 'circle' );
		$sidebar = array(
			'launcher_style'              => in_array( $style, array( 'circle', 'edge_tab', 'none' ), true ) ? $style : 'circle',
			'sidebar_side'                => ( $settings['sidebar_side'] ?? 'right' ) === 'left' ? 'left' : 'right',
			'launcher_label'              => sanitize_text_field( (string) ( $settings['launcher_label'] ?? '' ) ),
			'sidebar_heading'             => sanitize_text_field( (string) ( $settings['sidebar_heading'] ?? '' ) ),
			'sidebar_transition'          => in_array( $settings['sidebar_transition'] ?? 'slide', array( 'slide', 'fade', 'none' ), true ) ? (string) $settings['sidebar_transition'] : 'slide',
			'header_search_opens_sidebar' => ( $settings['header_search_opens_sidebar'] ?? '' ) === 'yes',
		);
		$name = trim( sanitize_text_field( (string) ( $settings['assistant_name'] ?? '' ) ) );
		if ( $name !== '' ) {
			$sidebar['assistant_name'] = function_exists( 'mb_substr' ) ? mb_substr( $name, 0, 60 ) : substr( $name, 0, 60 );
		}
		if ( isset( $settings['sidebar_width']['size'] ) && $settings['sidebar_width']['size'] !== '' ) {
			$sidebar['sidebar_width'] = max( 280, min( 560, (int) $settings['sidebar_width']['size'] ) );
		}

		$avatar = isset( $settings['avatar_image']['url'] ) ? esc_url_raw( (string) $settings['avatar_image']['url'] ) : '';

		return array(
			'tokens'  => $tokens,
			'ui'      => $ui,
			'sidebar' => $sidebar,
			'extra'   => array(
				'avatar_url'    => $avatar,
				'header_status' => sanitize_text_field( (string) ( $settings['header_status'] ?? '' ) ),
			),
		);
	}

	/**
	 * The widget's bubble icon (Elementor icon library or uploaded SVG) as markup, or ''.
	 *
	 * @param array<string,mixed> $settings
	 */
	private static function launcher_icon_html( array $settings ): string {
		$icon = isset( $settings['launcher_icon_new'] ) && is_array( $settings['launcher_icon_new'] ) ? $settings['launcher_icon_new'] : array();
		if ( empty( $icon['value'] ) || ! class_exists( '\\Elementor\\Icons_Manager' ) ) {
			return '';
		}
		ob_start();
		\Elementor\Icons_Manager::render_icon( $icon, array( 'aria-hidden' => 'true' ) );
		return trim( (string) ob_get_clean() );
	}

	protected function render(): void {
		$settings = $this->get_settings_for_display();
		$design   = self::design_from_settings( is_array( $settings ) ? $settings : array() );
		$design['extra']['launcher_icon_html'] = self::launcher_icon_html( is_array( $settings ) ? $settings : array() );

		if ( Neo_Pulse_Wp_Search_Elementor_Widget::is_elementor_editor_context() ) {
			// phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- escaped in render_preview().
			echo self::render_preview( $design, ( $settings['preview_open'] ?? 'yes' ) === 'yes' );
			return;
		}

		if ( ! Neo_Pulse_Wp_Chat::can_show_frontend_bubble() ) {
			return;
		}
		Neo_Pulse_Wp_Chat::apply_widget_design( $design, (string) $this->get_id() );
		Neo_Pulse_Wp_Chat::enqueue_for_widget();
	}

	/**
	 * Editor preview: a picture of the bubble and open panel in the same look as the live chat,
	 * restyled live by the widget controls (they set --fcw-* variables on .np-chat-mock__inner).
	 *
	 * @param array{tokens:array<string,mixed>,ui:array<string,bool>,sidebar:array<string,mixed>,extra?:array<string,string>} $design
	 */
	public static function render_preview( array $design, bool $open ): string {
		$tokens   = array_merge( Neo_Pulse_Wp_Chat::public_base_tokens(), $design['tokens'] );
		$ui       = $design['ui'];
		$sidebar  = $design['sidebar'];
		$extra    = isset( $design['extra'] ) && is_array( $design['extra'] ) ? $design['extra'] : array();
		$settings = Neo_Pulse_Wp_Chat::get_settings();
		$name     = ! empty( $sidebar['assistant_name'] ) ? (string) $sidebar['assistant_name'] : ( isset( $settings['assistant_name'] ) && $settings['assistant_name'] !== '' ? (string) $settings['assistant_name'] : 'Pulse Assist' );
		$side     = $sidebar['sidebar_side'] === 'left' ? 'left' : 'right';
		$style    = $sidebar['launcher_style'];
		$label    = $sidebar['launcher_label'] !== '' ? $sidebar['launcher_label'] : sprintf( /* translators: %s: assistant name */ __( 'Open %s', 'neo-pulse-wp' ), $name );
		// Colour tokens the widget has no control for still need a value in the picture.
		$vars     = Neo_Pulse_Wp_Ai_Widget_Design::build_chat_css_vars( $tokens )
			. '--np-mock-width:' . (int) ( $sidebar['sidebar_width'] ?? 400 ) . 'px;';
		$show     = static function ( string $key ) use ( $ui ): bool {
			return ! empty( $ui[ $key ] );
		};
		$chat_svg = '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';
		$icon     = ! empty( $extra['launcher_icon_html'] ) ? (string) $extra['launcher_icon_html'] : $chat_svg;
		$mic_svg  = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10a7 7 0 0 0 14 0M12 17v5"/></svg>';
		$send_svg = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 2 11 13M22 2l-7 20-4-9-9-4z"/></svg>';
		$trash    = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/></svg>';
		$close    = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>';
		$doc      = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 3H6v18h12V7z"/><path d="M14 3v4h4"/></svg>';
		$status   = isset( $extra['header_status'] ) ? (string) $extra['header_status'] : '';
		$avatar   = isset( $extra['avatar_url'] ) ? (string) $extra['avatar_url'] : '';

		ob_start();
		?>
		<div class="np-chat-mock np-chat-mock--<?php echo esc_attr( $side ); ?>" style="<?php echo esc_attr( $vars ); ?>">
			<div class="np-chat-mock__inner">
				<p class="np-chat-mock__note">
					<?php
					printf(
						/* translators: %s: left or right */
						esc_html__( 'Chat preview. On the live site the bubble floats at the bottom %s of the screen; this widget takes no space on the page.', 'neo-pulse-wp' ),
						$side === 'left' ? esc_html__( 'left', 'neo-pulse-wp' ) : esc_html__( 'right', 'neo-pulse-wp' )
					);
					?>
				</p>
				<div class="np-chat-mock__stage">
					<?php if ( $open ) : ?>
						<div class="np-chat-mock__panel">
							<div class="np-chat-mock__header">
								<?php if ( $show( 'header' ) ) : ?>
									<div class="np-chat-mock__head">
										<?php if ( $show( 'avatar' ) ) : ?>
											<span class="np-chat-mock__avatar"><?php echo $avatar !== '' ? '<img src="' . esc_url( $avatar ) . '" alt="" />' : esc_html( strtoupper( substr( trim( $name ), 0, 1 ) ) ); ?></span>
										<?php endif; ?>
										<span class="np-chat-mock__headtext">
											<?php if ( $show( 'assistant_name' ) ) : ?>
												<span class="np-chat-mock__name"><?php echo esc_html( $name ); ?></span>
											<?php endif; ?>
											<?php if ( $status !== '' ) : ?>
												<span class="np-chat-mock__status"><?php echo esc_html( $status ); ?></span>
											<?php endif; ?>
										</span>
									</div>
								<?php endif; ?>
								<span class="np-chat-mock__tools">
									<span class="np-chat-mock__tool"><?php echo $trash; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped ?></span>
									<?php if ( $show( 'close_button' ) ) : ?>
										<span class="np-chat-mock__tool np-chat-mock__tool--close"><?php echo $close; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped ?></span>
									<?php endif; ?>
								</span>
							</div>
							<?php if ( $sidebar['sidebar_heading'] !== '' ) : ?>
								<h2 class="np-chat-mock__heading"><?php echo esc_html( $sidebar['sidebar_heading'] ); ?></h2>
							<?php endif; ?>
							<div class="np-chat-mock__body">
								<?php if ( $show( 'welcome_message' ) ) : ?>
									<div class="np-chat-mock__welcome">
										<p class="np-chat-mock__greeting"><?php esc_html_e( 'Hello', 'neo-pulse-wp' ); ?></p>
										<p class="np-chat-mock__sub"><?php esc_html_e( 'How can I help you today?', 'neo-pulse-wp' ); ?></p>
									</div>
									<?php if ( $show( 'suggestion_chips' ) ) : ?>
										<div class="np-chat-mock__chips"><span><?php esc_html_e( 'Summarize this page', 'neo-pulse-wp' ); ?></span><span><?php esc_html_e( 'What areas do you serve?', 'neo-pulse-wp' ); ?></span></div>
									<?php endif; ?>
								<?php endif; ?>
								<div class="np-chat-mock__msg np-chat-mock__msg--user"><?php esc_html_e( 'Do you offer free in-home consultations?', 'neo-pulse-wp' ); ?></div>
								<?php if ( $show( 'thinking_card' ) ) : ?>
									<div class="np-chat-mock__thinking"><?php esc_html_e( 'Thinking…', 'neo-pulse-wp' ); ?></div>
								<?php endif; ?>
								<div class="np-chat-mock__card">
									<?php if ( $show( 'type_badge' ) || $show( 'confidence' ) ) : ?>
										<div class="np-chat-mock__meta">
											<?php if ( $show( 'type_badge' ) ) : ?>
												<span class="np-chat-mock__badge"><?php esc_html_e( 'Answer', 'neo-pulse-wp' ); ?></span>
											<?php endif; ?>
											<?php if ( $show( 'confidence' ) ) : ?>
												<span class="np-chat-mock__muted"><?php esc_html_e( 'High confidence', 'neo-pulse-wp' ); ?></span>
											<?php endif; ?>
										</div>
									<?php endif; ?>
									<p class="np-chat-mock__title"><?php esc_html_e( 'Free in-home consultations', 'neo-pulse-wp' ); ?></p>
									<p><?php esc_html_e( 'Yes! We come to you with samples and measure every window.', 'neo-pulse-wp' ); ?> <a href="#" onclick="return false;"><?php esc_html_e( 'See our services', 'neo-pulse-wp' ); ?></a></p>
									<?php if ( $show( 'source_pills' ) ) : ?>
										<div class="np-chat-mock__pills"><span><?php echo $doc; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped ?><?php esc_html_e( 'Book a consultation', 'neo-pulse-wp' ); ?></span><span><?php echo $doc; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped ?><?php esc_html_e( 'Contact', 'neo-pulse-wp' ); ?></span></div>
									<?php endif; ?>
									<?php if ( $show( 'cta_buttons' ) ) : ?>
										<div class="np-chat-mock__ctas"><span class="np-chat-mock__btn"><?php esc_html_e( 'Book now', 'neo-pulse-wp' ); ?></span></div>
									<?php endif; ?>
									<?php if ( $show( 'suggestion_chips' ) ) : ?>
										<div class="np-chat-mock__chips np-chat-mock__chips--in-card"><span><?php esc_html_e( 'How long does install take?', 'neo-pulse-wp' ); ?></span><span><?php esc_html_e( 'Do you offer financing?', 'neo-pulse-wp' ); ?></span></div>
									<?php endif; ?>
								</div>
							</div>
							<div class="np-chat-mock__composer">
								<span class="np-chat-mock__input"><?php esc_html_e( 'Ask a question…', 'neo-pulse-wp' ); ?></span>
								<?php if ( $show( 'mic_button' ) ) : ?>
									<span class="np-chat-mock__mic"><?php echo $mic_svg; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped ?></span>
								<?php endif; ?>
								<?php if ( $show( 'send_button' ) ) : ?>
									<span class="np-chat-mock__send"><?php echo $send_svg; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped ?></span>
								<?php endif; ?>
							</div>
							<?php if ( $show( 'powered_by' ) ) : ?>
								<div class="np-chat-mock__powered"><?php echo Neo_Pulse_Wp_Brand::powered_inner(); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- fixed markup. ?></div>
							<?php endif; ?>
						</div>
					<?php endif; ?>
					<?php if ( $style === 'circle' ) : ?>
						<span class="np-chat-mock__launcher" title="<?php echo esc_attr( $label ); ?>"><?php echo $icon; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped ?></span>
					<?php elseif ( $style === 'edge_tab' ) : ?>
						<span class="np-chat-mock__tab"><?php echo $icon; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped ?><span><?php echo esc_html( $label ); ?></span></span>
					<?php else : ?>
						<span class="np-chat-mock__nolauncher"><?php esc_html_e( 'No launcher: visitors open chat from the search panel.', 'neo-pulse-wp' ); ?></span>
					<?php endif; ?>
				</div>
			</div>
		</div>
		<?php
		return (string) ob_get_clean();
	}
}
