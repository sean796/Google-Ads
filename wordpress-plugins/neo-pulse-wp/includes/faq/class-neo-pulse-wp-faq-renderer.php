<?php
/**
 * FAQ front-end renderer.
 *
 * @package Neo_Pulse_Wp
 */

defined( 'ABSPATH' ) || exit;

class Neo_Pulse_Wp_Faq_Renderer {

	/** @var array<int, string> */
	private static $heading_tags = array( 'h2', 'h3', 'h4', 'h5', 'h6' );

	/**
	 * @param array<string,mixed> $args Widget / instance settings.
	 * @return string
	 */
	public static function render_instance( array $args ): string {
		Neo_Pulse_Wp_Faq::enqueue_frontend_assets();

		$entries = self::resolve_entries( $args );

		return self::wrap_markup( $args, $entries, empty( $entries ) );
	}

	/**
	 * @param array<string,mixed> $args
	 * @return array<int, array{question: string, answer: string}>
	 */
	private static function resolve_entries( array $args ): array {
		return self::entries_for( $args, self::resolve_post_id( $args ) );
	}

	/**
	 * Entries a widget instance shows for a post: its own items, else the post's FAQ field.
	 * Also used by Neo_Pulse_Wp_Seo_Faq so the SEO schema lists the same questions.
	 *
	 * @param array<string,mixed> $args    Mapped widget settings.
	 * @param int                 $post_id Post the widget is rendered for.
	 * @return array<int, array{question: string, answer: string}>
	 */
	public static function entries_for( array $args, int $post_id ): array {
		$from_widget = self::entries_from_widget( $args );
		if ( ! empty( $from_widget ) ) {
			return $from_widget;
		}
		if ( $post_id < 1 ) {
			return array();
		}

		$field_name = self::resolve_field_name( $post_id, $args );
		$raw        = self::field_value( $post_id, $field_name );

		// Arrays are repeater-style rows (question/answer pairs); scalars are text/JSON-LD.
		return Neo_Pulse_Wp_Faq_Parser::parse( $raw, is_array( $raw ) ? array( 'type' => 'repeater' ) : null );
	}

	/**
	 * Read a FAQ value stored under an ACF-compatible post meta key (repeaters as rows).
	 *
	 * @return mixed
	 */
	public static function field_value( int $post_id, string $field_name ) {
		if ( $field_name === '' ) {
			return null;
		}
		$raw = get_post_meta( $post_id, $field_name, true );

		// ACF stores repeaters as a row count with the rows in sub-keys; let ACF assemble them.
		$is_row_count = is_int( $raw ) || ( is_string( $raw ) && $raw !== '' && ctype_digit( $raw ) );
		if ( $is_row_count && function_exists( 'get_field' ) ) {
			$rows = get_field( $field_name, $post_id );
			if ( is_array( $rows ) && ! empty( $rows ) ) {
				return $rows;
			}
		}

		return $raw;
	}

	/**
	 * @param array<string,mixed> $args
	 * @return array<int, array{question: string, answer: string}>
	 */
	private static function entries_from_widget( array $args ): array {
		if ( empty( $args['faq_items'] ) || ! is_array( $args['faq_items'] ) ) {
			return array();
		}

		$entries = array();
		foreach ( $args['faq_items'] as $row ) {
			if ( ! is_array( $row ) ) {
				continue;
			}
			$question = trim( (string) ( $row['question'] ?? '' ) );
			$answer   = trim( (string) ( $row['answer'] ?? '' ) );
			if ( $question === '' && $answer === '' ) {
				continue;
			}
			$entries[] = array(
				'question' => $question,
				'answer'   => $answer,
			);
		}

		return $entries;
	}

	/**
	 * @param array<string,mixed> $args
	 */
	private static function resolve_post_id( array $args ): int {
		if ( ! empty( $args['post_id'] ) ) {
			return (int) $args['post_id'];
		}
		if ( class_exists( '\Elementor\Plugin', false ) ) {
			$editor_id = self::resolve_elementor_document_id();
			if ( $editor_id > 0 ) {
				return $editor_id;
			}
		}
		$queried = get_queried_object_id();
		if ( $queried > 0 ) {
			return $queried;
		}
		$post_id = get_the_ID();
		return $post_id ? (int) $post_id : 0;
	}

	/**
	 * Main post ID of the Elementor document being rendered/edited (0 when unknown).
	 */
	private static function resolve_elementor_document_id(): int {
		$plugin = \Elementor\Plugin::$instance;
		if ( $plugin && isset( $plugin->documents ) ) {
			$doc = $plugin->documents->get_current();
			if ( $doc && method_exists( $doc, 'get_main_id' ) ) {
				$main_id = (int) $doc->get_main_id();
				if ( $main_id > 0 ) {
					return $main_id;
				}
			}
		}
		$post_id = get_the_ID();
		return $post_id ? (int) $post_id : 0;
	}

	/**
	 * @param array<string,mixed> $args
	 */
	private static function resolve_field_name( int $post_id, array $args ): string {
		if ( ( $args['field_mode'] ?? 'auto' ) === 'manual' && ! empty( $args['field_name'] ) ) {
			return sanitize_key( (string) $args['field_name'] );
		}
		foreach ( array( 'faq', 'seo_faq' ) as $name ) {
			if ( metadata_exists( 'post', $post_id, $name ) ) {
				$raw = get_post_meta( $post_id, $name, true );
				if ( $raw !== '' && $raw !== false && $raw !== null ) {
					return $name;
				}
			}
		}
		return 'faq';
	}

	/**
	 * @param array<string,mixed>                              $args
	 * @param array<int, array{question: string, answer: string}> $entries
	 */
	private static function wrap_markup( array $args, array $entries, bool $is_empty ): string {
		$layout          = sanitize_key( (string) ( $args['layout'] ?? 'accordion' ) );
		$allowed_layouts = array( 'accordion', 'table', 'list', 'cards' );
		if ( ! in_array( $layout, $allowed_layouts, true ) ) {
			$layout = 'accordion';
		}

		$instance_id = ! empty( $args['instance_id'] ) ? sanitize_html_class( (string) $args['instance_id'] ) : 'faq-' . wp_unique_id();
		$heading     = trim( (string) ( $args['heading'] ?? '' ) );
		$empty_msg   = trim( (string) ( $args['empty_message'] ?? __( 'No FAQ items found for this page yet.', 'neo-pulse-wp' ) ) );
		$heading_tag = strtolower( (string) ( $args['heading_tag'] ?? 'h2' ) );
		if ( ! in_array( $heading_tag, self::$heading_tags, true ) ) {
			$heading_tag = 'h2';
		}

		$classes = array(
			'neo-pulse-faq',
			'neo-pulse-faq--' . $layout,
		);
		if ( ! empty( $args['css_class'] ) ) {
			foreach ( preg_split( '/\s+/', (string) $args['css_class'] ) as $class ) {
				$class = sanitize_html_class( $class );
				if ( $class !== '' ) {
					$classes[] = $class;
				}
			}
		}

		$attrs = array(
			'class'                    => implode( ' ', $classes ),
			'data-neo-pulse-faq'         => '1',
			'data-neo-pulse-faq-layout'  => $layout,
			'data-neo-pulse-faq-id'      => $instance_id,
		);

		if ( $layout === 'accordion' ) {
			$attrs['data-neo-pulse-faq-allow-multiple'] = ! empty( $args['accordion_allow_multiple'] ) ? '1' : '0';
		}
		if ( $layout === 'table' && empty( $args['table_show_header'] ) ) {
			$attrs['data-neo-pulse-faq-table-no-header'] = '1';
		}
		if ( $layout === 'cards' && ! empty( $args['card_columns'] ) ) {
			$attrs['style'] = self::build_css_vars( $args );
		} elseif ( ! empty( $args['css_vars'] ) && is_array( $args['css_vars'] ) ) {
			$attrs['style'] = self::build_css_vars( $args );
		} else {
			$style = self::build_css_vars( $args );
			if ( $style !== '' ) {
				$attrs['style'] = $style;
			}
		}

		$html  = '<div ' . self::attr_string( $attrs ) . '>';
		$html .= self::render_header( $heading, $heading_tag );

		if ( $is_empty ) {
			$html .= '<p class="neo-pulse-faq__empty">' . esc_html( $empty_msg ) . '</p>';
		} else {
			$html .= '<div class="neo-pulse-faq__items">';
			switch ( $layout ) {
				case 'table':
					$html .= self::render_table( $entries, $args, $instance_id );
					break;
				case 'list':
					$html .= self::render_list( $entries, $instance_id );
					break;
				case 'cards':
					$html .= self::render_cards( $entries, $instance_id );
					break;
				default:
					$html .= self::render_accordion( $entries, $args, $instance_id );
					break;
			}
			$html .= '</div>';
		}

		$html .= '</div>';

		// When Neo Pulse SEO already printed a FAQPage in the page's schema graph (which includes
		// this page's own FAQ widgets), don't print a second one. A widget in a template, popup or
		// global widget on a page without a FAQPage still prints its own.
		$graph_owns_faq = class_exists( 'Neo_Pulse_Wp_Seo_Head', false ) && Neo_Pulse_Wp_Seo_Head::printed_faqpage();
		if ( ! $is_empty && ! empty( $args['enable_schema'] ) && ! $graph_owns_faq ) {
			$html .= Neo_Pulse_Wp_Faq_Schema::render_script( $entries );
		}

		return $html;
	}

	private static function render_header( string $heading, string $heading_tag ): string {
		if ( $heading === '' ) {
			return '';
		}
		return '<header class="neo-pulse-faq__header"><' . $heading_tag . ' class="neo-pulse-faq__heading">' . esc_html( $heading ) . '</' . $heading_tag . '></header>';
	}

	/**
	 * @param array<int, array{question: string, answer: string}> $entries
	 * @param array<string,mixed>                                 $args
	 */
	private static function render_accordion( array $entries, array $args, string $instance_id ): string {
		$first_open = ! empty( $args['accordion_first_open'] );
		$html       = '';

		foreach ( $entries as $index => $entry ) {
			$is_open    = $first_open && $index === 0;
			$trigger_id = $instance_id . '-trigger-' . $index;
			$panel_id   = $instance_id . '-panel-' . $index;
			$item_class = 'neo-pulse-faq__item neo-pulse-faq__item--accordion' . ( $is_open ? ' neo-pulse-faq__item--open' : '' );

			$html .= '<div class="' . esc_attr( $item_class ) . '" data-neo-pulse-faq-item>';
			$html .= '<button type="button" class="neo-pulse-faq__trigger" id="' . esc_attr( $trigger_id ) . '" aria-expanded="' . ( $is_open ? 'true' : 'false' ) . '" aria-controls="' . esc_attr( $panel_id ) . '">';
			$html .= '<span class="neo-pulse-faq__question">' . esc_html( $entry['question'] ) . '</span>';
			$html .= '<span class="neo-pulse-faq__icon" aria-hidden="true"></span>';
			$html .= '</button>';
			$html .= '<div class="neo-pulse-faq__panel" id="' . esc_attr( $panel_id ) . '" role="region" aria-labelledby="' . esc_attr( $trigger_id ) . '"' . ( $is_open ? '' : ' hidden' ) . '>';
			$html .= '<div class="neo-pulse-faq__answer">' . self::format_answer( $entry['answer'] ) . '</div>';
			$html .= '</div>';
			$html .= '</div>';
		}

		return $html;
	}

	/**
	 * @param array<int, array{question: string, answer: string}> $entries
	 * @param array<string,mixed>                                 $args
	 */
	private static function render_table( array $entries, array $args, string $instance_id ): string {
		$q_header = trim( (string) ( $args['table_question_header'] ?? __( 'Question', 'neo-pulse-wp' ) ) );
		$a_header = trim( (string) ( $args['table_answer_header'] ?? __( 'Answer', 'neo-pulse-wp' ) ) );
		$show_hdr = ! isset( $args['table_show_header'] ) || ! empty( $args['table_show_header'] );

		$html = '<table class="neo-pulse-faq__table">';
		if ( $show_hdr ) {
			$html .= '<thead><tr>';
			$html .= '<th scope="col" class="neo-pulse-faq__th neo-pulse-faq__th--question">' . esc_html( $q_header ) . '</th>';
			$html .= '<th scope="col" class="neo-pulse-faq__th neo-pulse-faq__th--answer">' . esc_html( $a_header ) . '</th>';
			$html .= '</tr></thead>';
		}
		$html .= '<tbody>';
		foreach ( $entries as $index => $entry ) {
			$row_class = ( $index % 2 === 1 && ! empty( $args['table_zebra'] ) ) ? ' neo-pulse-faq__row--alt' : '';
			$html     .= '<tr class="neo-pulse-faq__row' . esc_attr( $row_class ) . '">';
			$html     .= '<td class="neo-pulse-faq__cell neo-pulse-faq__cell--question"><span class="neo-pulse-faq__question">' . esc_html( $entry['question'] ) . '</span></td>';
			$html     .= '<td class="neo-pulse-faq__cell neo-pulse-faq__cell--answer"><div class="neo-pulse-faq__answer">' . self::format_answer( $entry['answer'] ) . '</div></td>';
			$html     .= '</tr>';
		}
		$html .= '</tbody></table>';
		return $html;
	}

	/**
	 * @param array<int, array{question: string, answer: string}> $entries
	 */
	private static function render_list( array $entries, string $instance_id ): string {
		$html = '<dl class="neo-pulse-faq__list">';
		foreach ( $entries as $index => $entry ) {
			$dt_id = $instance_id . '-q-' . $index;
			$dd_id = $instance_id . '-a-' . $index;
			$html .= '<div class="neo-pulse-faq__item neo-pulse-faq__item--list">';
			$html .= '<dt class="neo-pulse-faq__question" id="' . esc_attr( $dt_id ) . '">' . esc_html( $entry['question'] ) . '</dt>';
			$html .= '<dd class="neo-pulse-faq__answer" id="' . esc_attr( $dd_id ) . '" aria-labelledby="' . esc_attr( $dt_id ) . '">' . self::format_answer( $entry['answer'] ) . '</dd>';
			$html .= '</div>';
		}
		$html .= '</dl>';
		return $html;
	}

	/**
	 * @param array<int, array{question: string, answer: string}> $entries
	 */
	private static function render_cards( array $entries, string $instance_id ): string {
		$html = '<div class="neo-pulse-faq__cards">';
		foreach ( $entries as $index => $entry ) {
			$html .= '<article class="neo-pulse-faq__card neo-pulse-faq__item" aria-labelledby="' . esc_attr( $instance_id . '-card-q-' . $index ) . '">';
			$html .= '<h3 class="neo-pulse-faq__question" id="' . esc_attr( $instance_id . '-card-q-' . $index ) . '">' . esc_html( $entry['question'] ) . '</h3>';
			$html .= '<div class="neo-pulse-faq__answer">' . self::format_answer( $entry['answer'] ) . '</div>';
			$html .= '</article>';
		}
		$html .= '</div>';
		return $html;
	}

	private static function format_answer( string $answer ): string {
		$answer = trim( $answer );
		if ( $answer === '' ) {
			return '';
		}
		if ( $answer !== wp_strip_all_tags( $answer ) ) {
			return wp_kses_post( $answer );
		}
		return wpautop( esc_html( $answer ) );
	}

	/**
	 * @param array<string,mixed> $args
	 */
	private static function build_css_vars( array $args ): string {
		$vars = array();
		if ( ! empty( $args['css_vars'] ) && is_array( $args['css_vars'] ) ) {
			foreach ( $args['css_vars'] as $key => $value ) {
				if ( $value === '' || $value === null ) {
					continue;
				}
				$vars[ (string) $key ] = (string) $value;
			}
		}
		if ( ! empty( $args['card_columns'] ) ) {
			$vars['--ff-faq-card-columns'] = max( 1, min( 4, (int) $args['card_columns'] ) );
		}
		if ( empty( $vars ) ) {
			return '';
		}
		$parts = array();
		foreach ( $vars as $key => $value ) {
			$key = preg_replace( '/[^a-zA-Z0-9\-_]/', '', (string) $key );
			if ( $key === '' ) {
				continue;
			}
			$parts[] = $key . ':' . $value;
		}
		return implode( ';', $parts ) . ';';
	}

	/**
	 * @param array<string, string|int> $attrs
	 */
	private static function attr_string( array $attrs ): string {
		$parts = array();
		foreach ( $attrs as $key => $value ) {
			if ( $value === '' || $value === null ) {
				continue;
			}
			$parts[] = esc_attr( (string) $key ) . '="' . esc_attr( (string) $value ) . '"';
		}
		return implode( ' ', $parts );
	}
}
