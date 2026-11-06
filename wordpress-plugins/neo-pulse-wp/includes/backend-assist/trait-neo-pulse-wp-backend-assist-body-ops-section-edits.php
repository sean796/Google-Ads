<?php
/**
 * Section HTML replacement, list and table edits, and link insertion.
 *
 * @package Neo_Pulse_Wp
 */

defined( 'ABSPATH' ) || exit;

trait Neo_Pulse_Wp_Backend_Assist_Body_Ops_Trait_Section_Edits {

	/**
	 * Replace one section's HTML in place (strict: no append on miss).
	 *
	 * @param array<string, mixed> $op
	 */
	public static function apply_replace_section_html( string $html, array $op ): string {
		$sec = self::resolve_section( $html, $op );
		if ( $sec === null ) {
			return $html;
		}

		$chunk = substr( $html, (int) $sec['start'], (int) $sec['end'] - (int) $sec['start'] );
		$parts = self::parse_section_chunk( $chunk );
		if ( $parts === null ) {
			return $html;
		}

		$new_body = '';
		if ( ! empty( $op['new_html'] ) ) {
			$incoming = (string) $op['new_html'];
			$parsed   = self::parse_section_chunk( $incoming );
			$new_body = $parsed !== null ? (string) $parsed['body_html'] : $incoming;
		} elseif ( ! empty( $op['generate'] ) ) {
			$generated = Neo_Pulse_Wp_Backend_Assist_Pipeline_Content_Prep::generate_section_html_for_replace(
				(string) ( $op['user_message'] ?? '' ),
				(string) $sec['heading_text'],
				$chunk
			);
			if ( is_wp_error( $generated ) || $generated === '' ) {
				return $html;
			}
			$new_body = $generated;
		}

		if ( trim( $new_body ) === '' ) {
			return $html;
		}

		$new_chunk = self::rebuild_section_chunk( $parts, $new_body );
		return substr( $html, 0, (int) $sec['start'] ) . $new_chunk . substr( $html, (int) $sec['end'] );
	}

	/**
	 * @param array<string, mixed> $op
	 */
	public static function convert_list_in_section( string $html, array $op ): string {
		$sec = self::resolve_section( $html, $op );
		if ( $sec === null ) {
			return $html;
		}

		$list_type = sanitize_key( (string) ( $op['list_type'] ?? 'ul' ) );
		if ( ! in_array( $list_type, array( 'ul', 'ol' ), true ) ) {
			$list_type = 'ul';
		}

		$chunk = substr( $html, (int) $sec['start'], (int) $sec['end'] - (int) $sec['start'] );
		$parts = self::parse_section_chunk( $chunk );
		if ( $parts === null ) {
			return $html;
		}

		$new_body = self::convert_list_tags_in_html( (string) $parts['body_html'], $list_type );
		if ( $new_body === $parts['body_html'] ) {
			return $html;
		}

		$new_chunk = self::rebuild_section_chunk( $parts, $new_body );
		return substr( $html, 0, (int) $sec['start'] ) . $new_chunk . substr( $html, (int) $sec['end'] );
	}

	/**
	 * @param array<string, mixed> $op
	 */
	public static function remove_table_in_section( string $html, array $op ): string {
		$sec = self::resolve_section( $html, $op );
		if ( $sec === null ) {
			return $html;
		}

		$chunk = substr( $html, (int) $sec['start'], (int) $sec['end'] - (int) $sec['start'] );
		$parts = self::parse_section_chunk( $chunk );
		if ( $parts === null ) {
			return $html;
		}

		$body_html = (string) $parts['body_html'];
		$new_body  = (string) preg_replace( '/<table[^>]*>[\s\S]*?<\/table>\s*/is', '', $body_html, 1 );
		if ( $new_body === $body_html ) {
			return $html;
		}

		$new_chunk = self::rebuild_section_chunk( $parts, trim( $new_body ) );
		return substr( $html, 0, (int) $sec['start'] ) . $new_chunk . substr( $html, (int) $sec['end'] );
	}

	private static function convert_list_tags_in_html( string $html, string $list_type ): string {
		if ( $list_type === 'ul' ) {
			$html = (string) preg_replace( '/<!--\s*wp:list\s+\{"ordered":true([^}]*)\}/i', '<!-- wp:list {"ordered":false$1}', $html );
			$html = (string) preg_replace( '/<ol(\s[^>]*)?>/i', '<ul$1>', $html );
			$html = (string) preg_replace( '/<\/ol>/i', '</ul>', $html );
		} else {
			$html = (string) preg_replace( '/<!--\s*wp:list\s+\{"ordered":false([^}]*)\}/i', '<!-- wp:list {"ordered":true$1}', $html );
			$html = (string) preg_replace( '/<ul(\s[^>]*)?>/i', '<ol$1>', $html );
			$html = (string) preg_replace( '/<\/ul>/i', '</ol>', $html );
		}

		return $html;
	}

	/**
	 * @param array<string, mixed> $op
	 */
	public static function add_internal_links( string $html, array $op ): string {
		$link_count = isset( $op['link_count'] ) ? max( 1, min( 30, (int) $op['link_count'] ) ) : 5;
		$post_id    = isset( $op['post_id'] ) ? absint( $op['post_id'] ) : 0;

		if ( ! class_exists( 'Neo_Pulse_Wp_Harness_Blueprint' ) ) {
			require_once NEO_PULSE_WP_PLUGIN_DIR . 'includes/harness/class-neo-pulse-wp-harness-blueprint.php';
		}
		if ( ! class_exists( 'Neo_Pulse_Wp_Harness_Links' ) ) {
			require_once NEO_PULSE_WP_PLUGIN_DIR . 'includes/harness/class-neo-pulse-wp-harness-links.php';
		}

		$site_url  = home_url( '/' );
		$all_posts = Neo_Pulse_Wp_Harness_Blueprint::fetch_linkable_posts();
		$query     = isset( $op['grep_query'] ) ? (string) $op['grep_query'] : wp_strip_all_tags( $html );
		$matched   = Neo_Pulse_Wp_Harness_Links::grep_linkable_posts( $all_posts, $query, max( $link_count, 25 ), $post_id );
		$allowed   = Neo_Pulse_Wp_Harness_Links::allowed_url_set( $matched, $site_url );

		$scope_html = $html;
		$scope_start = 0;
		if ( isset( $op['section_index'] ) ) {
			$sec = self::resolve_section( $html, $op );
			if ( $sec !== null ) {
				$scope_start = (int) $sec['start'];
				$scope_html  = substr( $html, $scope_start, (int) $sec['end'] - $scope_start );
			}
		}

		$added = 0;
		foreach ( $matched as $lp ) {
			if ( $added >= $link_count ) {
				break;
			}
			$title = isset( $lp['title'] ) ? trim( (string) $lp['title'] ) : '';
			$url   = isset( $lp['link'] ) ? trim( (string) $lp['link'] ) : '';
			if ( $title === '' || $url === '' ) {
				continue;
			}
			if ( ! isset( $allowed[ $url ] ) ) {
				continue;
			}
			$phrase = $title;
			if ( ! str_contains( $scope_html, $phrase ) ) {
				$words = preg_split( '/\s+/', $phrase, -1, PREG_SPLIT_NO_EMPTY );
				if ( is_array( $words ) && count( $words ) >= 3 ) {
					$phrase = implode( ' ', array_slice( $words, 0, 3 ) );
				}
			}
			if ( $phrase === '' || ! str_contains( $scope_html, $phrase ) ) {
				continue;
			}
			if ( preg_match( '/<a\s[^>]*>' . preg_quote( $phrase, '/' ) . '<\/a>/is', $scope_html ) ) {
				continue;
			}
			$pos = strpos( $scope_html, $phrase );
			if ( $pos === false ) {
				continue;
			}
			$replacement = '<a href="' . esc_attr( esc_url_raw( $url ) ) . '">' . $phrase . '</a>';
			$scope_html  = substr_replace( $scope_html, $replacement, $pos, strlen( $phrase ) );
			++$added;
		}

		if ( $added === 0 ) {
			return $html;
		}

		if ( $scope_start > 0 ) {
			return substr( $html, 0, $scope_start ) . $scope_html . substr( $html, (int) $sec['end'] );
		}

		$html = Neo_Pulse_Wp_Harness_Links::strip_unknown_internal_links( $scope_html, $allowed, $site_url );
		return $html;
	}

	/**
	 * @param array<string, mixed> $op
	 */
	public static function insert_overview_links( string $html, array $op ): string {
		if ( preg_match( '/class=["\']neo-pulse-overview["\']/i', $html ) ) {
			return $html;
		}

		$label = ! empty( $op['label'] ) ? sanitize_text_field( (string) $op['label'] ) : 'Overview';
		$items = array();

		$html = (string) preg_replace_callback(
			'/<h2([^>]*)>(.*?)<\/h2>/is',
			static function ( array $m ) use ( &$items ): string {
				$text = trim( wp_strip_all_tags( (string) $m[2] ) );
				if ( $text === '' ) {
					return $m[0];
				}
				$id = sanitize_title( $text );
				if ( preg_match( '/\sid\s*=\s*["\']([^"\']+)["\']/i', $m[1], $id_match ) ) {
					$id = (string) $id_match[1];
				} else {
					$m[1] = ' id="' . esc_attr( $id ) . '"' . $m[1];
				}
				$items[] = '<li><a href="#' . esc_attr( $id ) . '">' . esc_html( $text ) . '</a></li>';
				return '<h2' . $m[1] . '>' . $m[2] . '</h2>';
			},
			$html
		);

		if ( $items === array() ) {
			return $html;
		}

		$block = '<p class="neo-pulse-overview"><strong>' . esc_html( $label ) . '</strong></p>' . "\n"
			. '<ul class="neo-pulse-overview">' . implode( '', $items ) . '</ul>' . "\n\n";

		return $block . $html;
	}
}
