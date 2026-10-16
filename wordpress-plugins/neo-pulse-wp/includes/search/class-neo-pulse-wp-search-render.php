<?php
/**
 * NEO Pulse Search markup (0.9.236 design).
 *
 * One clean structure for every search: a search bar with a results dropdown, or an icon button
 * that opens a side panel, a centred popup or a bar that expands under the icon. Class names the
 * search script relies on (fbs__*, fai-sidebar-*) are kept; the look lives in neo-pulse-search.css
 * and is driven by --nps-* variables that the Elementor widget's Style tab sets.
 *
 * @package Neo_Pulse_Wp
 */

defined( 'ABSPATH' ) || exit;

class Neo_Pulse_Wp_Search_Render {

	/**
	 * Normalise any instance (Elementor widget, shortcode, admin demo) into one option set.
	 *
	 * @param array<string,mixed> $instance Raw instance.
	 * @param array<string,mixed> $settings Merged search settings (placeholder, button label, max results).
	 * @param array<string,mixed> $sidebar  Resolved sidebar config (site defaults + instance).
	 * @param array<string,mixed> $insights Resolved insights config.
	 * @return array<string,mixed>
	 */
	public static function options( array $instance, array $settings, array $sidebar, array $insights ): array {
		$display = (string) ( $instance['display_mode'] ?? ( $sidebar['display_mode'] ?? 'inline' ) );
		$mode    = in_array( $display, array( 'icon_only', 'sidebar' ), true ) ? 'icon' : 'bar';

		$open_as = (string) ( $instance['icon_open_as'] ?? ( $sidebar['icon_open_as'] ?? 'sidebar_right' ) );
		if ( $display === 'sidebar' ) {
			$open_as = ( ( $sidebar['sidebar_side'] ?? 'right' ) === 'left' ) ? 'sidebar_left' : 'sidebar_right';
		}
		if ( ! in_array( $open_as, array( 'sidebar_right', 'sidebar_left', 'modal_center', 'expand_inline' ), true ) ) {
			$open_as = 'sidebar_right';
		}

		$transition = (string) ( $instance['sidebar_transition'] ?? ( $sidebar['sidebar_transition'] ?? 'slide' ) );
		if ( ! in_array( $transition, array( 'slide', 'fade', 'none' ), true ) ) {
			$transition = 'slide';
		}

		$layout   = isset( $sidebar['sidebar_layout'] ) && is_array( $sidebar['sidebar_layout'] ) ? $sidebar['sidebar_layout'] : array( 'heading', 'search', 'results', 'popular_terms' );
		$sections = array(
			'popular_terms'          => self::flag( $instance, 'show_popular_terms', ! empty( $insights['show_popular_terms'] ) ),
			'popular_pages_overseer' => self::flag( $instance, 'show_popular_pages_overseer', ! empty( $insights['show_popular_pages_overseer'] ) ),
			'popular_pages_search'   => self::flag( $instance, 'show_popular_pages_search', ! empty( $insights['show_popular_pages_search'] ) ),
		);

		$heading = trim( (string) ( $instance['sidebar_heading'] ?? ( $sidebar['sidebar_heading'] ?? '' ) ) );
		if ( $heading === '' ) {
			$heading = __( 'Search', 'neo-pulse-wp' );
		}

		$labels = array(
			'popular_terms'          => __( 'Popular searches', 'neo-pulse-wp' ),
			'popular_pages_overseer' => __( 'Popular pages', 'neo-pulse-wp' ),
			'popular_pages_search'   => __( 'Others also found', 'neo-pulse-wp' ),
		);
		foreach ( array_keys( $labels ) as $key ) {
			$custom = isset( $instance[ 'label_' . $key ] ) ? trim( (string) $instance[ 'label_' . $key ] ) : '';
			if ( $custom !== '' ) {
				$labels[ $key ] = $custom;
			}
		}

		return array(
			'mode'                  => $mode,
			'open_as'               => $open_as,
			'transition'            => $transition,
			'placeholder'           => (string) ( $settings['placeholder'] ?? '' ),
			'button_label'          => trim( (string) ( $instance['button_label'] ?? '' ) ),
			'max_results'           => max( 1, min( 20, (int) ( $settings['max_results'] ?? 8 ) ) ),
			'launcher_icon_html'    => isset( $instance['launcher_icon_html'] ) ? (string) $instance['launcher_icon_html'] : '',
			'launcher_icon'         => Neo_Pulse_Wp_Search_Icons::sanitize_id( (string) ( $instance['launcher_icon'] ?? ( $sidebar['launcher_icon'] ?? 'search' ) ) ),
			'launcher_text'         => trim( (string) ( $instance['launcher_text'] ?? '' ) ),
			'launcher_label'        => trim( (string) ( $instance['launcher_label'] ?? ( $sidebar['launcher_label'] ?? '' ) ) ),
			'show_heading'          => self::flag( $instance, 'show_heading', in_array( 'heading', $layout, true ) ),
			'heading'               => $heading,
			'subtitle'              => trim( (string) ( $instance['sidebar_subtitle'] ?? ( $sidebar['sidebar_subtitle'] ?? '' ) ) ),
			'sections'              => $sections,
			'labels'                => $labels,
			'terms_limit'           => max( 1, min( 12, (int) ( $instance['popular_terms_limit'] ?? ( $insights['popular_terms_limit'] ?? 5 ) ) ) ),
			'insights_days'         => max( 1, min( 365, (int) ( $insights['insights_days'] ?? 30 ) ) ),
			'logging'               => ! empty( $insights['logging_enabled'] ),
			'show_thumbs'           => self::flag( $instance, 'show_thumbnails', true ),
			'show_excerpt'          => self::flag( $instance, 'show_excerpt', true ),
			'show_tag'              => self::flag( $instance, 'show_type_tag', true ),
			'show_ai'               => self::flag( $instance, 'show_ai_banner', true ),
			'show_score'            => self::flag( $instance, 'show_match_score', true ),
			'show_best'             => self::flag( $instance, 'show_best_match', true ),
			'show_pinned'           => self::flag( $instance, 'show_pinned_terms', true ),
			'show_powered'          => self::flag( $instance, 'show_powered_by', true ),
			'combine_chat'          => self::flag( $instance, 'combine_with_chat', false ),
			'hero'                  => in_array( (string) ( $instance['layout'] ?? '' ), array( 'hero' ), true ),
			'elementor_edit'        => ! empty( $instance['elementor_edit_context'] ),
			'show_field_icon'       => self::flag( $instance, 'show_field_icon', true ),
			'preview_results'       => ! empty( $instance['elementor_edit_context'] ) && ( $instance['preview_state'] ?? '' ) === 'results',
		);
	}

	/**
	 * yes/no/true/false/1/0 → bool, with a default when the key is missing.
	 *
	 * @param array<string,mixed> $instance
	 */
	public static function flag( array $instance, string $key, bool $default ): bool {
		if ( ! array_key_exists( $key, $instance ) ) {
			return $default;
		}
		$value = $instance[ $key ];
		if ( $value === 'yes' || $value === true || $value === 1 || $value === '1' ) {
			return true;
		}
		if ( $value === 'no' || $value === false || $value === 0 || $value === '0' || $value === '' ) {
			return false;
		}
		return $default;
	}

	/**
	 * @param array<string,mixed> $o Options from options().
	 */
	public static function render( array $o, string $rest_url, string $nonce ): string {
		$is_icon  = $o['mode'] === 'icon';
		$is_panel = $is_icon && $o['open_as'] !== 'expand_inline';
		$is_modal = $is_panel && $o['open_as'] === 'modal_center';
		$is_left  = $o['open_as'] === 'sidebar_left';

		$wrap = array( 'neo-pulse-search-wrap', 'nps', 'nps-root', 'nps--' . $o['mode'] );
		if ( $is_icon ) {
			$wrap[] = 'neo-pulse-search-wrap--icon-only';
			$wrap[] = 'neo-pulse-search-wrap--icon-only-mode';
			if ( $o['open_as'] === 'expand_inline' ) {
				$wrap[] = 'neo-pulse-search-wrap--icon-expand';
				$wrap[] = 'nps--expand';
			} elseif ( $is_modal ) {
				$wrap[] = 'fbs-modal-root';
				$wrap[] = 'nps--modal';
				$wrap[] = 'neo-pulse-search-wrap--sidebar-mode';
			} else {
				$wrap[] = 'fbs-icon-panel-root';
				$wrap[] = 'fai-sidebar-root--inline-launcher';
				$wrap[] = 'fai-sidebar-root--' . ( $is_left ? 'left' : 'right' );
				$wrap[] = 'fai-sidebar-root--transition-' . $o['transition'];
				$wrap[] = 'nps--side-' . ( $is_left ? 'left' : 'right' );
				$wrap[] = 'neo-pulse-search-wrap--sidebar-mode';
			}
		}
		if ( $o['hero'] ) {
			$wrap[] = 'nps--hero';
		}
		if ( $o['elementor_edit'] ) {
			$wrap[] = 'neo-pulse-search-wrap--elementor-edit';
		}
		$mods = self::modifier_classes( $o );

		$attrs = array(
			'class'                 => implode( ' ', array_merge( $wrap, $mods ) ),
			'data-rest-url'         => $rest_url,
			'data-log-url'          => rest_url( Neo_Pulse_Wp_Search::REST_NAMESPACE . '/search/log' ),
			'data-accept-url'       => rest_url( Neo_Pulse_Wp_Search::REST_NAMESPACE . '/search/accept' ),
			'data-insights-url'     => rest_url( Neo_Pulse_Wp_Search::REST_NAMESPACE . '/search/insights' ),
			'data-word-ready-url'   => rest_url( Neo_Pulse_Wp_Search::REST_NAMESPACE . '/search/word-ready' ),
			'data-nonce'            => $nonce,
			'data-insights-days'    => (string) $o['insights_days'],
			'data-popular-terms-limit' => (string) $o['terms_limit'],
			'data-placeholder'      => $o['placeholder'],
			'data-button-label'     => $o['button_label'],
			'data-max-results'      => (string) $o['max_results'],
			'data-transition'       => $o['transition'],
		);
		if ( $o['logging'] ) {
			$attrs['data-logging-enabled'] = '1';
		}
		foreach ( array(
			'popular_terms'          => 'data-show-popular-terms',
			'popular_pages_overseer' => 'data-show-popular-pages-overseer',
			'popular_pages_search'   => 'data-show-popular-pages-search',
		) as $key => $attr ) {
			if ( ! empty( $o['sections'][ $key ] ) ) {
				$attrs[ $attr ] = '1';
			}
		}
		if ( $is_panel ) {
			$attrs['data-sidebar-mode'] = '1';
		}
		if ( $is_icon ) {
			$attrs['data-icon-mode']    = '1';
			$attrs['data-icon-open-as'] = $o['open_as'];
		}
		if ( $o['combine_chat'] ) {
			$attrs['data-combine-chat'] = '1';
		}
		if ( ! $o['show_ai'] ) {
			$attrs['data-hide-ai-banner'] = '1';
		}
		if ( ! $o['show_score'] ) {
			$attrs['data-hide-scores'] = '1';
		}
		if ( ! $o['show_best'] ) {
			$attrs['data-hide-best'] = '1';
		}
		if ( ! $o['show_pinned'] ) {
			$attrs['data-hide-pinned'] = '1';
		}
		if ( ! $o['show_powered'] ) {
			$attrs['data-hide-powered'] = '1';
		}
		if ( $o['show_thumbs'] ) {
			$attrs['data-show-thumbs'] = '1';
		}
		if ( $o['elementor_edit'] ) {
			$attrs['data-elementor-edit-preview'] = '1';
		}

		$out = '<div' . self::attrs( $attrs ) . '>';

		if ( ! $is_icon ) {
			$out .= '<div class="fbs nps-bar">' . self::bar_body( $o ) . '</div>';
		} else {
			$out .= self::launcher( $o );
			if ( $o['open_as'] === 'expand_inline' ) {
				$out .= '<div class="fbs__icon-panel fbs__icon-panel--expand nps-expand"' . ( $o['elementor_edit'] ? '' : ' hidden' ) . '><div class="fbs nps-bar">' . self::bar_body( $o ) . '</div></div>';
			} else {
				$out .= self::panel( $o, $mods, $is_modal, $is_left );
			}
		}

		$out .= '</div>';
		return $out;
	}

	/**
	 * Classes that switch parts of the design on/off (on the wrap and the panel's inner shell).
	 *
	 * @param array<string,mixed> $o
	 * @return array<int,string>
	 */
	private static function modifier_classes( array $o ): array {
		$mods = array();
		if ( ! $o['show_thumbs'] ) {
			$mods[] = 'nps--no-thumbs';
		}
		if ( ! $o['show_excerpt'] ) {
			$mods[] = 'nps--no-excerpt';
		}
		if ( ! $o['show_tag'] ) {
			$mods[] = 'nps--no-tag';
		}
		if ( ! $o['show_powered'] ) {
			$mods[] = 'fbs--no-powered';
		}
		if ( $o['button_label'] !== '' ) {
			$mods[] = 'nps--go-text';
		}
		if ( ! $o['show_field_icon'] ) {
			$mods[] = 'nps--no-field-icon';
		}
		if ( $o['preview_results'] ) {
			$mods[] = 'nps-preview-results';
		}
		return $mods;
	}

	/**
	 * @param array<string,mixed> $o
	 */
	private static function launcher( array $o ): string {
		$label = $o['launcher_label'] !== '' ? $o['launcher_label'] : ( $o['launcher_text'] !== '' ? $o['launcher_text'] : __( 'Open search', 'neo-pulse-wp' ) );
		$icon  = $o['launcher_icon_html'] !== '' ? $o['launcher_icon_html'] : Neo_Pulse_Wp_Search_Icons::render( $o['launcher_icon'], array( 'width' => 20, 'height' => 20 ) );
		$class = 'fbs__icon-launcher nps-launcher' . ( $o['launcher_text'] !== '' ? ' nps-launcher--text' : '' );

		return '<button type="button" class="' . esc_attr( $class ) . '" aria-label="' . esc_attr( $label ) . '" aria-expanded="false">'
			. '<span class="nps-launcher__icon" aria-hidden="true">' . $icon . '</span>' // Icon markup from Elementor's icon renderer or our own SVG.
			. ( $o['launcher_text'] !== '' ? '<span class="nps-launcher__text">' . esc_html( $o['launcher_text'] ) . '</span>' : '' )
			. '</button>';
	}

	/**
	 * Side panel or centred popup.
	 *
	 * @param array<string,mixed> $o
	 * @param array<int,string>   $mods
	 */
	private static function panel( array $o, array $mods, bool $is_modal, bool $is_left ): string {
		$hidden   = ' hidden';
		$backdrop = 'fai-sidebar-backdrop nps-backdrop nps-root' . ( $is_modal ? ' fbs-modal-backdrop' : '' );
		$panel    = 'fai-sidebar-panel nps-panel nps-root nps-panel--' . ( $is_modal ? 'modal' : ( $is_left ? 'left' : 'right' ) ) . ' nps-panel--t-' . $o['transition'];
		if ( $is_modal ) {
			$panel .= ' fbs-modal-panel';
		}

		$head = '';
		if ( $o['show_heading'] || $o['subtitle'] !== '' ) {
			$head .= '<div class="nps-head__text">';
			if ( $o['show_heading'] ) {
				$head .= '<h2 class="nps-title fbs__heading">' . esc_html( $o['heading'] ) . '</h2>';
			}
			if ( $o['subtitle'] !== '' ) {
				$head .= '<p class="nps-subtitle">' . esc_html( $o['subtitle'] ) . '</p>';
			}
			$head .= '</div>';
		}

		$inner = 'neo-pulse-search-wrap neo-pulse-search-wrap--panel-inner neo-pulse-search-wrap--sidebar-mode nps nps-inner ' . implode( ' ', $mods );

		return '<div class="' . esc_attr( $backdrop ) . '" aria-hidden="true"' . $hidden . '></div>'
			. '<div class="' . esc_attr( $panel ) . '" role="dialog" aria-modal="true" aria-label="' . esc_attr__( 'Site search', 'neo-pulse-wp' ) . '"' . $hidden . '>'
			. '<div class="fai-sidebar-panel__body nps-panel__body">'
			. '<div class="nps-head">' . $head
			. '<button type="button" class="fai-sidebar-close nps-close" aria-label="' . esc_attr__( 'Close search', 'neo-pulse-wp' ) . '">' . Neo_Pulse_Wp_Search_Icons::render_close( array( 'width' => 18, 'height' => 18 ) ) . '</button>'
			. '</div>'
			. '<div class="' . esc_attr( trim( $inner ) ) . '"><div class="fbs fbs--sidebar-inner nps-panel__content">'
			. self::form( $o )
			. '<div class="fbs__results-slot nps-results"><div class="fbs__results-slot-empty" hidden></div>'
			. '<div class="fbs__panel fbs__panel--sidebar"><div class="fbs__status nps-status" aria-live="polite" hidden></div>'
			. ( $o['preview_results'] ? '<div class="fbs__dropdown nps-list">' . self::demo_results( $o, false ) . '</div>' : '<div class="fbs__dropdown nps-list" hidden></div>' )
			. '</div></div>'
			. self::sections( $o )
			. ( $o['show_powered'] ? self::powered() : '' )
			. '</div></div>'
			. '</div></div>';
	}

	/**
	 * Search bar + dropdown (bar mode and expand-under-icon).
	 *
	 * @param array<string,mixed> $o
	 */
	private static function bar_body( array $o ): string {
		// Suggestions sit inside the dropdown and show while the field is focused and empty.
		return self::form( $o )
			. '<div class="fbs__panel nps-drop"><div class="nps-drop__inner">'
			. '<div class="fbs__status nps-status" aria-live="polite" style="display:none;"></div>'
			. ( $o['preview_results'] ? '<div class="fbs__dropdown nps-list">' . self::demo_results( $o, true ) . '</div>' : '<div class="fbs__dropdown nps-list" hidden style="display:none;"></div>' )
			. self::sections( $o )
			. '</div></div>'
			. str_replace( 'class="fbs__powered nps-powered"', 'class="fbs__powered nps-powered nps-powered--template" hidden', self::powered() );
	}

	/**
	 * @param array<string,mixed> $o
	 */
	public static function form( array $o ): string {
		$label = $o['button_label'];
		$aria  = $label !== '' ? $label : __( 'Search', 'neo-pulse-wp' );
		$arrow = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';

		return '<form class="fbs__form nps-field" role="search" action="#" method="get" autocomplete="off">'
			. '<span class="nps-field__icon" aria-hidden="true">' . Neo_Pulse_Wp_Search_Icons::render( 'search', array( 'width' => 18, 'height' => 18 ) ) . '</span>'
			. '<input type="text" class="fbs__input nps-field__input" name="neo-pulse_search_query" value="" placeholder="' . esc_attr( $o['placeholder'] ) . '" aria-label="' . esc_attr( $o['placeholder'] !== '' ? $o['placeholder'] : __( 'Search', 'neo-pulse-wp' ) ) . '" autocomplete="off" inputmode="search" enterkeyhint="search" maxlength="' . (int) Neo_Pulse_Wp_Search::MAX_QUERY_LENGTH . '" />'
			. '<button type="submit" class="fbs__btn fbs__btn--icon nps-field__go" aria-label="' . esc_attr( $aria ) . '">'
			. ( $label !== '' ? '<span class="fbs__btn-label">' . esc_html( $label ) . '</span>' : '<span class="fbs__btn-icon">' . $arrow . '</span>' )
			. '</button>'
			. '</form>';
	}

	/**
	 * Popular searches, popular pages and pages people clicked from search.
	 *
	 * @param array<string,mixed> $o
	 */
	private static function sections( array $o ): string {
		$out = '';
		foreach ( array( 'popular_terms', 'popular_pages_overseer', 'popular_pages_search' ) as $key ) {
			if ( ! empty( $o['sections'][ $key ] ) ) {
				$out .= self::section( $key, $o );
			}
		}
		return $out === '' ? '' : '<div class="nps-sections">' . $out . '</div>';
	}

	/**
	 * One section; the list is filled by the search script (or with sample rows in the editor).
	 *
	 * @param array<string,mixed> $o
	 */
	private static function section( string $key, array $o ): string {
		$is_terms = $key === 'popular_terms';
		$list     = 'fbs__insights-list ' . ( $is_terms ? 'fbs__insights-list--terms nps-chips' : 'fbs__insights-list--links nps-cards' );
		$demo     = $o['elementor_edit'] ? self::demo_items( $key ) : '';
		$hidden   = $o['elementor_edit'] ? '' : ' hidden';

		return '<section class="fbs__insights-block nps-section nps-section--' . esc_attr( $key ) . '" data-insight="' . esc_attr( $key ) . '"' . $hidden . '>'
			. '<h3 class="fbs__insights-label nps-label">' . esc_html( $o['labels'][ $key ] ) . '</h3>'
			. '<div class="' . esc_attr( $list ) . '" role="list">' . $demo . '</div>'
			. '</section>';
	}

	/**
	 * Sample content so the editor preview shows every part while styling.
	 */
	private static function demo_items( string $key ): string {
		if ( $key === 'popular_terms' ) {
			$out = '';
			foreach ( array( __( 'Pricing', 'neo-pulse-wp' ), __( 'Book a consultation', 'neo-pulse-wp' ), __( 'Opening hours', 'neo-pulse-wp' ), __( 'Warranty', 'neo-pulse-wp' ), __( 'Locations', 'neo-pulse-wp' ) ) as $term ) {
				$out .= '<button type="button" class="fbs__insight-chip nps-chip" tabindex="-1">' . esc_html( $term ) . '</button>';
			}
			return $out;
		}
		$pages = array(
			array( __( 'Our services', 'neo-pulse-wp' ), __( 'Page', 'neo-pulse-wp' ) ),
			array( __( 'About us', 'neo-pulse-wp' ), __( 'Page', 'neo-pulse-wp' ) ),
			array( __( 'Contact', 'neo-pulse-wp' ), __( 'Page', 'neo-pulse-wp' ) ),
		);
		$out = '';
		foreach ( $pages as $page ) {
			$out .= self::card_html( '#', $page[0], '', $page[1], '' );
		}
		return $out;
	}

	/**
	 * Sample results for the editor preview ("Preview shows: Sample results"), same markup as the script.
	 *
	 * @param array<string,mixed> $o
	 */
	private static function demo_results( array $o, bool $footer ): string {
		$out = '';
		if ( $o['show_ai'] ) {
			$out .= '<div class="fbs__ai-banner nps-ai"><span class="nps-ai__icon" aria-hidden="true"><svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor"><path d="M12 2l2.2 6.6L21 11l-6.8 2.4L12 20l-2.2-6.6L3 11l6.8-2.4z"/></svg></span>'
				. '<span class="nps-ai__text">' . esc_html__( 'Comparing options? Best matches first', 'neo-pulse-wp' ) . '</span>'
				. '<span class="nps-ai__keywords fbs__ai-keywords"><span class="nps-ai__keyword">' . esc_html__( 'pricing', 'neo-pulse-wp' ) . '</span><span class="nps-ai__keyword">' . esc_html__( 'installation', 'neo-pulse-wp' ) . '</span></span></div>';
		}
		$rows = array(
			array( __( 'Pricing and packages', 'neo-pulse-wp' ), __( 'What each option includes, typical costs and how to get a quote.', 'neo-pulse-wp' ), __( 'Page', 'neo-pulse-wp' ) ),
			array( __( 'How installation works', 'neo-pulse-wp' ), __( 'From the first visit to the finished job, step by step.', 'neo-pulse-wp' ), __( 'Blog', 'neo-pulse-wp' ) ),
			array( __( 'Book a free consultation', 'neo-pulse-wp' ), __( 'Pick a time that suits you and we will come to you.', 'neo-pulse-wp' ), __( 'Page', 'neo-pulse-wp' ) ),
		);
		$scores = array( 95, 82, 58 );
		foreach ( $rows as $i => $row ) {
			$card = self::card_html( '#', $row[0], $row[1], $row[2], '', $o['show_score'] ? $scores[ $i ] : -1, 0 === $i && $o['show_best'] );
			$out .= str_replace( 'class="fbs__insight-link nps-card', 'class="fbs__result nps-card nps-card--result', $card );
		}
		if ( $footer && $o['show_powered'] ) {
			$out .= str_replace( 'class="fbs__powered nps-powered"', 'class="fbs__dropdown-footer nps-powered"', self::powered() );
		}
		return $out;
	}

	/**
	 * Same markup the script builds for page cards (kept in sync with cardNode() in neo-pulse-search.js).
	 *
	 * @param int  $score Match percentage shown as a pill next to the tag; -1 for none.
	 * @param bool $best  Show the "Best match" label (top result).
	 */
	public static function card_html( string $url, string $title, string $excerpt, string $tag, string $thumb, int $score = -1, bool $best = false ): string {
		$meta = ( $tag !== '' ? '<span class="nps-tag">' . esc_html( $tag ) . '</span>' : '' ) . ( $score >= 0 ? self::score_html( $score ) : '' );
		return '<a class="fbs__insight-link nps-card' . ( $best ? ' nps-card--best' : '' ) . '" href="' . esc_url( $url ) . '" tabindex="-1">'
			. ( $best ? self::best_html() : '' )
			. ( $thumb !== '' ? '<span class="nps-card__thumb"><img src="' . esc_url( $thumb ) . '" alt="" loading="lazy" /></span>' : '<span class="nps-card__thumb nps-card__thumb--empty">' . esc_html( function_exists( 'mb_substr' ) ? mb_strtoupper( mb_substr( trim( $title ), 0, 1 ) ) : strtoupper( substr( trim( $title ), 0, 1 ) ) ) . '</span>' )
			. '<span class="nps-card__body"><span class="nps-card__title">' . esc_html( $title ) . '</span>'
			. ( $excerpt !== '' ? '<span class="nps-card__text">' . esc_html( $excerpt ) . '</span>' : '' )
			. ( $meta !== '' ? '<span class="nps-card__meta">' . $meta . '</span>' : '' )
			. '</span>'
			. '<span class="nps-card__arrow" aria-hidden="true"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg></span>'
			. '</a>';
	}

	/**
	 * Match percentage pill (kept in sync with scoreNode() in neo-pulse-search.js).
	 */
	public static function score_html( int $score ): string {
		$score = max( 0, min( 100, $score ) );
		$grade = $score >= 80 ? 'high' : ( $score >= 50 ? 'mid' : 'low' );
		/* translators: %d: match percentage */
		return '<span class="nps-score nps-score--' . $grade . '"><span class="nps-score__dot"></span>' . esc_html( sprintf( __( '%d%% match', 'neo-pulse-wp' ), $score ) ) . '</span>';
	}

	/**
	 * "Best match" label on the top result (kept in sync with bestNode() in neo-pulse-search.js).
	 */
	public static function best_html(): string {
		return '<span class="nps-best"><svg viewBox="0 0 24 24" width="10" height="10" fill="currentColor" aria-hidden="true"><path d="M12 2l2.9 6.3 6.9.7-5.1 4.7 1.4 6.8L12 17l-6.1 3.5 1.4-6.8L2.2 9l6.9-.7z"/></svg>' . esc_html__( 'Best match', 'neo-pulse-wp' ) . '</span>';
	}

	public static function powered(): string {
		return '<a class="fbs__powered nps-powered" href="' . esc_url( NEO_PULSE_WP_POWERED_URL ) . '" target="_blank" rel="noopener noreferrer">'
			. Neo_Pulse_Wp_Brand::powered_inner() . '</a>';
	}

	/**
	 * @param array<string,string> $attrs
	 */
	private static function attrs( array $attrs ): string {
		$out = '';
		foreach ( $attrs as $name => $value ) {
			$out .= ' ' . $name . '="' . esc_attr( (string) $value ) . '"';
		}
		return $out;
	}
}
