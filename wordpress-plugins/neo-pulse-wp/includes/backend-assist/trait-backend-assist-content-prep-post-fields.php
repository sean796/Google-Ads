<?php
/**
 * Post field and title instruction helpers for Backend Assist content preparation.
 *
 * @package Neo_Pulse_Wp
 */

defined( 'ABSPATH' ) || exit;

trait Neo_Pulse_Wp_Backend_Assist_Pipeline_Content_Prep_Trait_Post_Fields {

	public static function message_requests_new_page_or_post( string $message ): bool {
		$lower = strtolower( $message );
		if (
			str_contains( $lower, 'create a page' )
			|| str_contains( $lower, 'create a post' )
			|| str_contains( $lower, 'create page' )
			|| str_contains( $lower, 'create post' )
			|| str_contains( $lower, 'new page' )
			|| str_contains( $lower, 'new post' )
			|| str_contains( $lower, 'make a page' )
			|| str_contains( $lower, 'make a new page' )
			|| str_contains( $lower, 'make new page' )
			|| str_contains( $lower, 'new content' )
		) {
			return true;
		}
		return false;
	}

	/**
	 * @param array<int, array<string, mixed>> $history
	 */
	public static function history_requests_new_page_or_post( array $history ): bool {
		for ( $i = count( $history ) - 1; $i >= 0; $i-- ) {
			$turn = $history[ $i ];
			if ( ! is_array( $turn ) || ( $turn['role'] ?? '' ) !== 'user' ) {
				continue;
			}
			$content = isset( $turn['content'] ) ? (string) $turn['content'] : '';
			if ( $content !== '' && self::message_requests_new_page_or_post( $content ) ) {
				return true;
			}
		}
		return false;
	}

	/**
	 * Title and focus keyword for a new page/post. Uses classifier params, then the words after "keyword".
	 *
	 * @param array<string, mixed> $classification
	 * @return array{title: string, keyword: string}
	 */
	public static function create_page_title_from_message( string $message, array $classification = array() ): array {
		$params  = isset( $classification['params'] ) && is_array( $classification['params'] ) ? $classification['params'] : array();
		$title   = isset( $params['title'] ) ? sanitize_text_field( (string) $params['title'] ) : '';
		$keyword = '';
		if ( ! empty( $params['focus_keyword'] ) ) {
			$keyword = sanitize_text_field( (string) $params['focus_keyword'] );
		} elseif ( ! empty( $params['focusKeyword'] ) ) {
			$keyword = sanitize_text_field( (string) $params['focusKeyword'] );
		}

		if ( $keyword === '' ) {
			$lower  = strtolower( $message );
			$marker = 'keyword ';
			$pos    = strpos( $lower, $marker );
			if ( $pos !== false ) {
				$rest = trim( substr( $message, $pos + strlen( $marker ) ) );
				$cut  = stripos( $rest, ' and ' );
				if ( $cut !== false ) {
					$rest = substr( $rest, 0, $cut );
				}
				$keyword = sanitize_text_field( $rest );
			}
		}

		if ( $title === '' ) {
			$title = $keyword !== '' ? $keyword : __( 'New page', 'neo-pulse-wp' );
		}

		return array(
			'title'   => $title,
			'keyword' => $keyword,
		);
	}

	private static function message_implies_current_page_edit( string $message ): bool {
		return (bool) preg_match(
			'/\b(add|append|insert|update|faq\s+table|at the end|end of the post|this section|in this section)\b/i',
			$message
		);
	}

	private static function tool_defaults_to_builder_post( string $tool ): bool {
		return in_array(
			$tool,
			array(
				'add_content',
				'update_post',
				'restore_post_revision',
				'save_post_meta',
				'get_post',
				'get_gsc_context',
			),
			true
		);
	}

	public static function message_is_field_instruction( string $message ): bool {
		$lower = strtolower( trim( $message ) );
		if ( $lower === '' ) {
			return false;
		}
		$phrases = array(
			'undo',
			'revert',
			'wrong field',
			'not the body',
			'not post body',
			'not the post body',
			'i said title',
			'i meant title',
			'not the title',
			'that was wrong',
			'you wrote',
			'you put',
			'in the body',
			'into the body',
		);
		foreach ( $phrases as $phrase ) {
			if ( strpos( $lower, $phrase ) !== false ) {
				return true;
			}
		}
		return false;
	}

	public static function message_is_undo_or_correction( string $message ): bool {
		return self::message_is_field_instruction( $message );
	}

	private static function content_looks_like_user_instruction( string $content, string $message ): bool {
		$content = trim( wp_strip_all_tags( $content ) );
		$message = trim( $message );
		if ( $content === '' || $message === '' ) {
			return false;
		}
		if ( $content === $message ) {
			return true;
		}
		return self::message_is_field_instruction( $content );
	}

	public static function copy_value_needs_planning( string $proposed, string $message ): bool {
		$proposed_norm = strtolower( preg_replace( '/\s+/', ' ', trim( $proposed ) ) );
		$message_norm  = strtolower( preg_replace( '/\s+/', ' ', trim( $message ) ) );
		if ( $proposed_norm === '' ) {
			return false;
		}
		if ( Neo_Pulse_Wp_Ai_Seo_Limits::is_placeholder_copy( $proposed ) ) {
			return true;
		}
		if ( self::title_looks_instructional( $proposed ) ) {
			return true;
		}
		if ( $message_norm === '' ) {
			return false;
		}
		if ( str_contains( $proposed_norm, $message_norm ) || str_contains( $message_norm, $proposed_norm ) ) {
			return true;
		}
		if ( preg_match( '/\|\s*(.+)$/', $proposed, $matches ) ) {
			$suffix = strtolower( trim( $matches[1] ) );
			if ( $suffix !== '' && str_contains( $message_norm, $suffix ) ) {
				return true;
			}
		}
		return false;
	}

	public static function title_looks_instructional( string $title ): bool {
		$title_norm = strtolower( preg_replace( '/\s+/', ' ', trim( $title ) ) );
		if ( $title_norm === '' ) {
			return false;
		}
		if ( preg_match( '/\|\s*(cta|seo|h1|h2|faq|meta)\s*$/i', $title ) ) {
			return true;
		}
		$instruction_markers = array(
			'pipeline character',
			'pipe character',
			'with a cta',
			'add to the title',
			'call to action',
			'a cta',
		);
		foreach ( $instruction_markers as $marker ) {
			if ( str_contains( $title_norm, $marker ) ) {
				return true;
			}
		}
		return false;
	}

	private static function message_gives_explicit_copy( string $message, string $proposed ): bool {
		if ( preg_match( '/(?:rename|change\s+(?:the\s+)?title\s+to|title\s+to|new\s+title\s+(?:is\s+)?)\s*["\']?(.+?)["\']?\s*$/i', $message, $matches ) ) {
			return trim( $matches[1] ) === trim( $proposed );
		}
		return false;
	}

	private static function message_requests_title_edit( string $message ): bool {
		$lower = strtolower( trim( $message ) );
		return $lower !== '' && str_contains( $lower, 'title' );
	}

	/**
	 * @param array<string, mixed> $params
	 * @return array<string, mixed>
	 */
	private static function prepare_update_post_params( string $message, array $history, array $params ): array {
		if ( empty( $params['post_id'] ) && ! empty( $params['title'] ) ) {
			Neo_Pulse_Wp_Site_Inventory::warm( true );
			$item = Neo_Pulse_Wp_Site_Inventory::find_item_by_title( sanitize_text_field( (string) $params['title'] ) );
			if ( is_array( $item ) && ! empty( $item['id'] ) ) {
				$params['post_id'] = (int) $item['id'];
			}
		}

		$post_id = isset( $params['post_id'] ) ? absint( $params['post_id'] ) : 0;
		if ( $post_id > 0 ) {
			$post = get_post( $post_id );
			if ( $post instanceof WP_Post && empty( $params['title'] ) ) {
				$params['current_title'] = $post->post_title;
			}
		}

		if ( ! empty( $params['title'] ) ) {
			$proposed = (string) $params['title'];
			$explicit = self::message_gives_explicit_copy( $message, $proposed );
			$needs_plan = self::copy_value_needs_planning( $proposed, $message )
				|| ( self::message_requests_title_edit( $message ) && ! $explicit );
			if ( $needs_plan ) {
				unset( $params['title'] );
			}
		} elseif ( $post_id > 0 && self::message_requests_title_edit( $message ) ) {
			unset( $params['title'] );
		}

		$has_field = ! empty( $params['title'] ) || ! empty( $params['status'] )
			|| ! empty( $params['excerpt'] ) || ! empty( $params['slug'] );
		if ( ! $has_field ) {
			$plan   = Neo_Pulse_Wp_Backend_Assist_Pipeline_Phases::phase_plan( $message, $history, 'update_post', $params );
			$params = is_array( $plan['params'] ) ? array_merge( $params, $plan['params'] ) : $params;
		}

		return $params;
	}

	/**
	 * @param array<string, mixed> $params
	 * @return array<string, mixed>
	 */
	private static function prepare_restore_post_revision_params( string $message, array $history, array $params ): array {
		unset( $message );
		if ( empty( $params['post_id'] ) && ! empty( $params['title'] ) ) {
			Neo_Pulse_Wp_Site_Inventory::warm( true );
			$item = Neo_Pulse_Wp_Site_Inventory::find_item_by_title( sanitize_text_field( (string) $params['title'] ) );
			if ( is_array( $item ) && ! empty( $item['id'] ) ) {
				$params['post_id'] = (int) $item['id'];
			}
		}
		if ( empty( $params['post_id'] ) ) {
			foreach ( array_reverse( $history ) as $entry ) {
				if ( ! is_array( $entry ) || ( $entry['role'] ?? '' ) !== 'assistant' ) {
					continue;
				}
				if ( preg_match( '/\[post_id=(\d+)/', (string) ( $entry['content'] ?? '' ), $matches ) ) {
					$params['post_id'] = absint( $matches[1] );
					break;
				}
			}
		}
		return $params;
	}

	private static function message_names_explicit_post_id( string $message, int $current_post_id ): bool {
		$lower = strtolower( trim( $message ) );
		if ( $lower === '' ) {
			return false;
		}

		if ( preg_match( '/post\s*(?:id|#)\s*(\d+)/', $lower, $matches ) ) {
			return absint( $matches[1] ) !== $current_post_id;
		}

		if ( preg_match_all( '/\b(\d{4,})\b/', $message, $matches ) ) {
			foreach ( $matches[1] as $num ) {
				$candidate = absint( $num );
				if ( $candidate > 0 && $candidate !== $current_post_id ) {
					return true;
				}
			}
		}

		return false;
	}

	public static function message_requests_heading_change( string $message ): bool {
		$lower = strtolower( trim( $message ) );
		if ( $lower === '' ) {
			return false;
		}
		if ( preg_match( '/\b(?:change|chnge|rename|rewrite|reword|update|shorten|edit)\b.*\b(?:h[23]|heading|intro)\b/i', $lower ) ) {
			return true;
		}
		return (bool) preg_match( '/\b(?:h[23]|heading|intro)\b.*\b(?:change|chnge|rename|rewrite|reword|update|shorten|edit)\b/i', $lower );
	}

	/**
	 * @param array<int, array<string, mixed>> $history
	 */
	private static function history_recently_created_intro( array $history ): bool {
		foreach ( array_reverse( array_slice( $history, -6 ) ) as $entry ) {
			if ( sanitize_key( (string) ( $entry['role'] ?? '' ) ) !== 'user' ) {
				continue;
			}
			$content = strtolower( trim( (string) ( $entry['content'] ?? '' ) ) );
			if ( $content === '' ) {
				continue;
			}
			if ( preg_match( '/\b(?:write|add|create)\b.*\bintro\b|\bintro\b.*\bh[23]\b|\bh[23]\b.*\bintro\b/i', $content ) ) {
				return true;
			}
		}
		return false;
	}

	public static function message_requests_date_modifier( string $message ): bool {
		$lower = strtolower( trim( $message ) );
		if ( $lower === '' ) {
			return false;
		}
		if ( str_contains( $lower, 'date modifier' ) || str_contains( $lower, 'date_modifier' ) ) {
			return true;
		}
		if ( preg_match( '/\bset(?:ting)?\s+(?:the\s+)?date\b/', $lower ) ) {
			return true;
		}
		if ( preg_match( '/\bdate\s+(?:to\s+)?today\b/', $lower ) ) {
			return true;
		}
		return str_contains( $lower, 'update the date' ) || str_contains( $lower, 'set today' );
	}
}
