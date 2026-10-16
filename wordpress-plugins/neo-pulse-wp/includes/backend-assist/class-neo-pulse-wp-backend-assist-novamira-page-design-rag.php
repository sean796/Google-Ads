<?php
/**
 * Site Elementor design reference for the Novamira design harness (no hardcoded reference pages).
 *
 * Produces a small digest (reference page ids + section archetypes) used in the design prompt.
 *
 * @package Neo_Pulse_Wp
 */

defined( 'ABSPATH' ) || exit;

class Neo_Pulse_Wp_Backend_Assist_Novamira_Page_Design_Rag {

	const MAX_SOURCE_PAGES = 4;

	/**
	 * @return array{source_page_ids:array<int,int>,archetypes:array<int,string>}|WP_Error
	 */
	public static function build( int $exclude_post_id ) {
		$cache_key = 'neo_pulse_nv_design_rag_v4';
		$cached    = get_transient( $cache_key );
		if ( is_array( $cached ) && $cached !== array() ) {
			return $cached;
		}

		$candidates = self::discover_candidates( $exclude_post_id );
		if ( $candidates === array() ) {
			return new WP_Error(
				'neo-pulse_novamira_rag',
				__( 'No published Elementor pages on this site to learn design from.', 'neo-pulse-wp' )
			);
		}

		$source_ids = array();
		$archetypes = array();
		$all_types  = array();
		foreach ( array_slice( self::rank_candidates( $candidates ), 0, self::MAX_SOURCE_PAGES ) as $row ) {
			$elements = self::decode_elementor( (int) $row['post_id'] );
			if ( $elements === array() ) {
				continue;
			}
			$source_ids[] = (int) $row['post_id'];
			foreach ( $elements as $block ) {
				if ( ! is_array( $block ) ) {
					continue;
				}
				$el_type = (string) ( $block['elType'] ?? '' );
				if ( $el_type !== 'section' && $el_type !== 'container' ) {
					continue;
				}
				$types = array();
				self::collect_widget_types( isset( $block['elements'] ) && is_array( $block['elements'] ) ? $block['elements'] : array(), $types );
				if ( $types === array() ) {
					continue;
				}
				$archetypes[ self::infer_archetype( $types ) ] = true;
				foreach ( $types as $type ) {
					$all_types[ $type ] = true;
				}
			}
		}

		if ( $source_ids === array() || $all_types === array() ) {
			return new WP_Error(
				'neo-pulse_novamira_rag',
				__( 'Published Elementor pages had no usable layout data.', 'neo-pulse-wp' )
			);
		}

		if ( ! isset( $archetypes['hero'] ) && isset( $all_types['ygency-section-title'], $all_types['image'] ) ) {
			$archetypes['hero'] = true;
		}
		foreach ( array_keys( $all_types ) as $type ) {
			if ( str_contains( $type, 'marquee' ) ) {
				$archetypes['marquee_band'] = true;
				break;
			}
		}
		$archetypes['content_band'] = true;

		$digest = array(
			'source_page_ids' => $source_ids,
			'archetypes'      => array_keys( $archetypes ),
		);
		set_transient( $cache_key, $digest, HOUR_IN_SECONDS );

		return $digest;
	}

	/**
	 * @return array<int,array{post_id:int,title:string}>
	 */
	private static function discover_candidates( int $exclude_post_id ): array {
		$query = new WP_Query(
			array(
				'post_type'              => 'page',
				'post_status'            => 'publish',
				'posts_per_page'         => 30,
				'post__not_in'           => $exclude_post_id > 0 ? array( $exclude_post_id ) : array(),
				'orderby'                => 'modified',
				'order'                  => 'DESC',
				'no_found_rows'          => true,
				'update_post_meta_cache' => true,
				'meta_query'             => array(
					'relation' => 'OR',
					array(
						'key'   => '_elementor_edit_mode',
						'value' => 'builder',
					),
					array(
						'key'     => '_elementor_data',
						'compare' => 'EXISTS',
					),
				),
			)
		);

		$out = array();
		foreach ( $query->posts as $post ) {
			if ( ! $post instanceof WP_Post ) {
				continue;
			}
			$raw = get_post_meta( $post->ID, '_elementor_data', true );
			if ( ! is_string( $raw ) || trim( $raw ) === '' || trim( $raw ) === '[]' ) {
				continue;
			}
			$out[] = array(
				'post_id' => (int) $post->ID,
				'title'   => get_the_title( $post ),
			);
		}
		wp_reset_postdata();
		return $out;
	}

	/**
	 * @param array<int,array{post_id:int,title:string}> $candidates
	 * @return array<int,array{post_id:int,title:string,score:int}>
	 */
	private static function rank_candidates( array $candidates ): array {
		$scored = array();
		foreach ( $candidates as $row ) {
			$post_id = (int) $row['post_id'];
			$raw     = get_post_meta( $post_id, '_elementor_data', true );
			$score   = is_string( $raw ) ? strlen( $raw ) : 0;
			if ( $score < 100 ) {
				continue;
			}
			$scored[] = array(
				'post_id' => $post_id,
				'title'   => (string) $row['title'],
				'score'   => $score,
			);
		}
		usort(
			$scored,
			static function ( $a, $b ) {
				return ( $b['score'] ?? 0 ) <=> ( $a['score'] ?? 0 );
			}
		);
		return $scored;
	}

	/**
	 * @return array<int,array<string,mixed>>
	 */
	private static function decode_elementor( int $post_id ): array {
		$raw  = get_post_meta( $post_id, '_elementor_data', true );
		$data = is_string( $raw ) ? json_decode( $raw, true ) : ( is_array( $raw ) ? $raw : array() );
		return is_array( $data ) ? $data : array();
	}

	/**
	 * @param array<int,array<string,mixed>> $elements
	 * @param array<int,string>              $types
	 */
	private static function collect_widget_types( array $elements, array &$types ): void {
		foreach ( $elements as $element ) {
			if ( ! is_array( $element ) ) {
				continue;
			}
			if ( ( $element['elType'] ?? '' ) === 'widget' ) {
				$widget_type = (string) ( $element['widgetType'] ?? '' );
				if ( $widget_type !== '' ) {
					$types[] = $widget_type;
				}
				continue;
			}
			if ( ! empty( $element['elements'] ) && is_array( $element['elements'] ) ) {
				self::collect_widget_types( $element['elements'], $types );
			}
		}
	}

	/**
	 * @param array<int,string> $widget_types
	 */
	private static function infer_archetype( array $widget_types ): string {
		$joined = implode( ' ', $widget_types );
		if ( str_contains( $joined, 'text_marquee' ) || str_contains( $joined, 'marquee' ) ) {
			return 'marquee_band';
		}
		if ( str_contains( $joined, 'testimonial' ) ) {
			return 'testimonial';
		}
		if ( str_contains( $joined, 'feature-list' ) || str_contains( $joined, 'info-box' ) ) {
			return 'card_grid';
		}
		if ( in_array( 'image', $widget_types, true ) && ( in_array( 'ygency-section-title', $widget_types, true ) || in_array( 'heading', $widget_types, true ) ) ) {
			return 'hero';
		}
		if ( in_array( 'ygency-button', $widget_types, true ) || in_array( 'button', $widget_types, true ) ) {
			if ( in_array( 'ygency-section-title', $widget_types, true ) || in_array( 'heading', $widget_types, true ) ) {
				return 'hero';
			}
			return 'cta_band';
		}
		if ( in_array( 'heading', $widget_types, true ) && in_array( 'text-editor', $widget_types, true ) ) {
			return 'faq_pair';
		}
		return 'content_band';
	}
}
