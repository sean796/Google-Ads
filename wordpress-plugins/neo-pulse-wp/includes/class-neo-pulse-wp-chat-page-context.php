<?php
/**
 * Current-page context for URL-aware NEO Pulse Chat.
 *
 * @package Neo_Pulse_Wp
 */

defined( 'ABSPATH' ) || exit;

class Neo_Pulse_Wp_Chat_Page_Context {

	const TRANSIENT_PREFIX = 'neo_pulse_chat_pc_';
	const TTL                = 300;

	/**
	 * Page context for wp_localize_script (no full body).
	 *
	 * @return array{postId:int,url:string,title:string,typeLabel:string,pathHint:string}
	 */
	public static function for_localize_script(): array {
		$post_id    = 0;
		$url        = '';
		$title      = '';
		$type_label = '';

		if ( is_singular() ) {
			$post_id = (int) get_queried_object_id();
			$post    = get_post( $post_id );
			if ( $post instanceof WP_Post && self::post_id_accessible( $post_id ) ) {
				$permalink = get_permalink( $post_id );
				$url       = is_string( $permalink ) ? $permalink : '';
				$title     = get_the_title( $post_id );
				$type_label = self::type_label_for_post( $post );
			}
		}

		if ( $post_id < 1 && is_user_logged_in() && current_user_can( 'edit_posts' ) ) {
			$current_url = home_url( add_query_arg( array() ) );
			$from_p      = self::post_id_from_url( $current_url );
			if ( $from_p > 0 && self::post_id_accessible( $from_p ) ) {
				$post_id = $from_p;
				$post    = get_post( $post_id );
				if ( $post instanceof WP_Post ) {
					$url        = $current_url;
					$title      = get_the_title( $post_id );
					$type_label = self::type_label_for_post( $post );
				}
			}
		}

		if ( $url === '' ) {
			$url = home_url( add_query_arg( array() ) );
		}

		if ( $title === '' ) {
			$title = wp_get_document_title();
		}

		return array(
			'postId'    => $post_id,
			'url'       => esc_url_raw( $url ),
			'title'     => Neo_Pulse_Wp_Display_Text::decode( (string) $title ),
			'typeLabel' => $type_label,
			'pathHint'  => self::path_hint_from_url( $url ),
		);
	}

	/**
	 * Warm enriched page context and store in transient.
	 *
	 * @return array{page_context_key:string,title:string,type_label:string,has_body:bool,path_hint:string}
	 */
	public static function warm_and_store( string $page_url, int $post_id, string $page_title, array $settings ): array {
		$context = self::resolve_from_request( $page_url, $post_id, $page_title, $settings, true );
		$key     = self::storage_key( (int) ( $context['post_id'] ?? 0 ), (string) ( $context['url'] ?? $page_url ) );
		set_transient( self::TRANSIENT_PREFIX . $key, $context, self::TTL );

		return array(
			'page_context_key' => $key,
			'title'            => (string) ( $context['title'] ?? '' ),
			'type_label'       => (string) ( $context['type_label'] ?? '' ),
			'has_body'         => ! empty( $context['has_body'] ),
			'path_hint'        => (string) ( $context['path_hint'] ?? '' ),
		);
	}

	/**
	 * Load warmed context or resolve on demand.
	 *
	 * @param array<string,mixed> $settings
	 * @return array<string,mixed>|null
	 */
	public static function load( string $key, string $page_url, int $post_id, string $page_title, array $settings ): ?array {
		$key = trim( $key );
		if ( $key !== '' ) {
			$stored = get_transient( self::TRANSIENT_PREFIX . $key );
			if ( is_array( $stored ) && ! empty( $stored['post_id'] ) && ! self::post_id_accessible( (int) $stored['post_id'] ) ) {
				// Access changed since the context was warmed (unpublished, password added, other user).
				delete_transient( self::TRANSIENT_PREFIX . $key );
				$stored = null;
			}
			if ( is_array( $stored ) && ! empty( $stored ) ) {
				if ( empty( $stored['post_id'] ) ) {
					$site_index = Neo_Pulse_Wp_Chat_Rag::get_site_index( $settings );
					$resolved   = self::resolve_post_id( $page_url, $post_id, $site_index, $page_title );
					if ( $resolved > 0 ) {
						$stored = self::resolve_from_request( $page_url, $resolved, $page_title, $settings, true );
						set_transient( self::TRANSIENT_PREFIX . $key, $stored, self::TTL );
					}
				}
				return $stored;
			}
		}

		$page_url = esc_url_raw( trim( $page_url ) );
		if ( $page_url === '' && $post_id < 1 ) {
			return null;
		}

		return self::resolve_from_request( $page_url, $post_id, $page_title, $settings, true );
	}

	/**
	 * @param array<string,mixed> $settings
	 * @return array<string,mixed>
	 */
	public static function resolve_from_request( string $page_url, int $post_id, string $page_title, array $settings, bool $enrich = false ): array {
		$site_index       = Neo_Pulse_Wp_Chat_Rag::get_site_index( $settings );
		$title            = sanitize_text_field( $page_title );
		$resolved_post_id = self::resolve_post_id( $page_url, $post_id, $site_index, $title );
		$url              = esc_url_raw( trim( $page_url ) );
		$type_label       = '';
		$item             = null;

		if ( $resolved_post_id > 0 ) {
			$item = self::index_item_for_post( $resolved_post_id, $site_index );
			if ( is_array( $item ) && $enrich ) {
				$item = self::enrich_item( $item );
			}
			$post = get_post( $resolved_post_id );
			if ( $post instanceof WP_Post ) {
				$type_label = self::type_label_for_post( $post );
				if ( $title === '' ) {
					$title = get_the_title( $post );
				}
			}
			if ( is_array( $item ) ) {
				if ( ! empty( $item['title'] ) ) {
					$title = (string) $item['title'];
				}
				if ( ! empty( $item['url'] ) ) {
					$url = (string) $item['url'];
				}
			}
		}

		$has_body = is_array( $item ) && ! empty( $item['excerpt'] ) && strlen( (string) $item['excerpt'] ) > 200;

		return array(
			'post_id'    => $resolved_post_id,
			'url'        => $url,
			'title'      => Neo_Pulse_Wp_Display_Text::decode( $title ),
			'type_label' => $type_label,
			'path_hint'  => self::path_hint_from_url( $url !== '' ? $url : $page_url ),
			'has_body'   => $has_body,
			'item'       => $item,
		);
	}

	/**
	 * @param array<int,array<string,mixed>> $site_index
	 */
	public static function resolve_post_id( string $page_url, int $post_id, array $site_index, string $page_title = '' ): int {
		if ( $post_id > 0 && self::post_id_accessible( $post_id ) ) {
			return $post_id;
		}

		$page_url = esc_url_raw( trim( $page_url ) );
		if ( $page_url !== '' ) {
			$from_p = self::post_id_from_url( $page_url );
			if ( $from_p > 0 && self::post_id_accessible( $from_p ) ) {
				return $from_p;
			}

			$from_url = url_to_postid( $page_url );
			if ( $from_url > 0 && self::post_id_accessible( $from_url ) ) {
				return $from_url;
			}

			$match = Neo_Pulse_Wp_Chat_Rag::find_index_item_by_url( $page_url, $site_index );
			if ( is_array( $match ) && ! empty( $match['id'] ) ) {
				$match_id = (int) $match['id'];
				if ( self::post_id_accessible( $match_id ) ) {
					return $match_id;
				}
			}
		}

		$page_title = sanitize_text_field( trim( $page_title ) );
		if ( $page_title !== '' ) {
			// Only editors may warm the drafts inventory; public requests use published content.
			Neo_Pulse_Wp_Site_Inventory::warm( is_user_logged_in() && current_user_can( 'edit_posts' ) );
			$item = Neo_Pulse_Wp_Site_Inventory::find_item_by_title( $page_title );
			if ( is_array( $item ) && ! empty( $item['id'] ) ) {
				$match_id = (int) $item['id'];
				if ( self::post_id_accessible( $match_id ) ) {
					return $match_id;
				}
			}
		}

		return 0;
	}

	public static function post_id_from_url( string $page_url ): int {
		$query = wp_parse_url( $page_url, PHP_URL_QUERY );
		if ( ! is_string( $query ) || $query === '' ) {
			return 0;
		}
		parse_str( $query, $args );
		if ( ! empty( $args['p'] ) ) {
			return absint( $args['p'] );
		}
		if ( ! empty( $args['post'] ) ) {
			return absint( $args['post'] );
		}
		return 0;
	}

	private static function post_id_accessible( int $post_id ): bool {
		if ( $post_id < 1 ) {
			return false;
		}
		$post = get_post( $post_id );
		if ( ! $post instanceof WP_Post ) {
			return false;
		}
		if ( (string) $post->post_password !== '' ) {
			return false; // Password-protected content never reaches the chat.
		}
		if ( $post->post_status === 'publish' ) {
			return true;
		}
		return current_user_can( 'edit_post', $post_id );
	}

	/**
	 * @param array<int,array<string,mixed>> $site_index
	 * @return array<string,mixed>|null
	 */
	public static function index_item_for_post( int $post_id, array $site_index ): ?array {
		if ( $post_id < 1 || ! self::post_id_accessible( $post_id ) ) {
			return null;
		}
		foreach ( $site_index as $item ) {
			if ( (int) ( $item['id'] ?? 0 ) === $post_id ) {
				return $item;
			}
		}

		$post = get_post( $post_id );
		if ( ! $post instanceof WP_Post ) {
			return null;
		}

		$url = get_permalink( $post_id );
		if ( ! is_string( $url ) || $url === '' ) {
			return null;
		}

		return array(
			'id'      => $post_id,
			'title'   => Neo_Pulse_Wp_Display_Text::decode( get_the_title( $post ) ),
			'url'     => $url,
			'slug'    => (string) $post->post_name,
			'excerpt' => has_excerpt( $post_id )
				? Neo_Pulse_Wp_Display_Text::decode( wp_strip_all_tags( get_the_excerpt( $post ) ) )
				: Neo_Pulse_Wp_Display_Text::decode( wp_trim_words( wp_strip_all_tags( $post->post_content ), 40, '...' ) ),
			'type'    => (string) $post->post_type,
		);
	}

	/**
	 * @param array<string,mixed> $item
	 * @return array<string,mixed>
	 */
	public static function enrich_item( array $item ): array {
		$post_id = (int) ( $item['id'] ?? 0 );
		if ( $post_id < 1 ) {
			return $item;
		}
		if ( ! self::post_id_accessible( $post_id ) ) {
			$item['excerpt'] = '';
			return $item;
		}
		$full = Neo_Pulse_Wp_Chat_Rag::read_post_body_for_chat( $post_id );
		if ( $full !== '' ) {
			$item['excerpt'] = $full;
		}
		return $item;
	}

	public static function type_label_for_post( WP_Post $post ): string {
		$pt = sanitize_key( (string) $post->post_type );
		if ( $pt === 'post' ) {
			return 'blog post';
		}
		if ( $pt === 'page' ) {
			return 'page';
		}
		if ( $pt === 'product' ) {
			return 'product page';
		}
		$obj = get_post_type_object( $pt );
		if ( $obj && ! empty( $obj->labels->singular_name ) ) {
			return strtolower( (string) $obj->labels->singular_name );
		}
		return 'page';
	}

	public static function path_hint_from_url( string $page_url ): string {
		$parsed = wp_parse_url( $page_url );
		$path   = isset( $parsed['path'] ) ? (string) $parsed['path'] : '/';
		$path   = '/' . trim( $path, '/' );
		if ( $path === '/' ) {
			return '/';
		}
		return rtrim( $path, '/' ) . '/';
	}

	public static function message_targets_current_page( string $message ): bool {
		$lower = strtolower( trim( $message ) );
		if ( $lower === '' ) {
			return false;
		}
		foreach ( self::deictic_phrases() as $phrase ) {
			if ( strpos( $lower, $phrase ) !== false ) {
				return true;
			}
		}
		return false;
	}

	/**
	 * @return array<int,string>
	 */
	private static function deictic_phrases(): array {
		return array(
			'this page',
			'this blog',
			'this blog post',
			'this post',
			'on this post',
			'this article',
			'this product',
			'this product page',
			'current page',
			'on this page',
			'about this page',
			'summarize this',
			'summary of this',
			'what is this page',
			'the page i am on',
			"the page i'm on",
			'the page im on',
			'page im on',
			"page i'm on",
			'this one',
		);
	}

	/**
	 * Pin current page item first in retrieval results.
	 *
	 * @param array<int,array<string,mixed>> $items
	 * @param array<string,mixed>|null       $page_context
	 * @return array<int,array<string,mixed>>
	 */
	public static function merge_into_items( array $items, ?array $page_context, string $user_message ): array {
		if ( ! is_array( $page_context ) || empty( $page_context['item'] ) || ! is_array( $page_context['item'] ) ) {
			return $items;
		}

		$pin    = $page_context['item'];
		$pin_id = (int) ( $pin['id'] ?? 0 );
		if ( $pin_id < 1 ) {
			return $items;
		}

		$deictic        = self::message_targets_current_page( $user_message );
		$pin['score']   = $deictic ? 100.0 : 50.0;
		$pin['page_context_pin'] = true;

		$out = array( $pin );
		foreach ( $items as $item ) {
			if ( (int) ( $item['id'] ?? 0 ) === $pin_id ) {
				continue;
			}
			$out[] = $item;
		}

		return $out;
	}

	/**
	 * Prompt block for Phase B reasoning.
	 *
	 * @param array<string,mixed>|null $page_context
	 */
	public static function format_for_prompt( ?array $page_context ): string {
		if ( ! is_array( $page_context ) ) {
			return '';
		}

		if ( ! empty( $page_context['item'] ) && is_array( $page_context['item'] ) ) {
			$item       = $page_context['item'];
			$title      = (string) ( $item['title'] ?? $page_context['title'] ?? '' );
			$url        = (string) ( $item['url'] ?? $page_context['url'] ?? '' );
			$type_label = (string) ( $page_context['type_label'] ?? 'page' );
			$body       = (string) ( $item['excerpt'] ?? '' );

			return "CURRENT PAGE (visitor is viewing this now):\n"
				. "Title: {$title}\n"
				. "Type: {$type_label}\n"
				. "URL: {$url}\n"
				. "Body:\n{$body}\n";
		}

		$path_hint = (string) ( $page_context['path_hint'] ?? '' );
		$url       = (string) ( $page_context['url'] ?? '' );
		if ( $path_hint === '' && $url === '' ) {
			return '';
		}

		$hint = $path_hint !== '' ? $path_hint : $url;
		return "VISITOR URL (no single page body available):\n"
			. "Path: {$hint}\n"
			. "The visitor is on this URL path. Use SITE CONTENT when it matches. If no page body is available, answer from indexed content and invite staff when helpful — without stating that content is missing.\n";
	}

	/**
	 * @return array{title:string,url:string,type_label:string,has_body:bool,path_hint:string}|null
	 */
	public static function meta_for_log( ?array $page_context ): ?array {
		if ( ! is_array( $page_context ) ) {
			return null;
		}
		return array(
			'title'      => (string) ( $page_context['title'] ?? '' ),
			'url'        => (string) ( $page_context['url'] ?? '' ),
			'type_label' => (string) ( $page_context['type_label'] ?? '' ),
			'has_body'   => ! empty( $page_context['has_body'] ),
			'path_hint'  => (string) ( $page_context['path_hint'] ?? '' ),
		);
	}

	/**
	 * Per-user, salted key so one visitor cannot load another user's (e.g. an editor's draft) context.
	 */
	private static function storage_key( int $post_id, string $page_url ): string {
		return hash_hmac(
			'md5',
			get_current_user_id() . '|' . $post_id . '|' . Neo_Pulse_Wp_Chat_History::normalize_url( $page_url ),
			wp_salt( 'nonce' )
		);
	}
}
