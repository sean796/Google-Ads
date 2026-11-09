<?php
/**
 * Backend Assist — WordPress content tool handlers
 *
 * @package Neo_Pulse_Wp
 */

defined( 'ABSPATH' ) || exit;

class Neo_Pulse_Wp_Backend_Assist_Tools_Wp {

	public static function tool_create_page( array $params ): array {
		$title  = isset( $params['title'] ) ? sanitize_text_field( $params['title'] ) : '';
		$status = isset( $params['status'] ) ? sanitize_text_field( $params['status'] ) : 'draft';

		if ( $title === '' ) {
			return array( 'success' => false, 'error' => 'Page title is required.' );
		}

		if ( ! in_array( $status, array( 'draft', 'publish', 'private' ), true ) ) {
			$status = 'draft';
		}

		if ( ! self::user_can_create_in_type( 'page' ) ) {
			return array( 'success' => false, 'error' => __( 'You do not have permission to create pages.', 'neo-pulse-wp' ) );
		}
		if ( ! self::user_can_set_status( 'page', $status ) ) {
			return array( 'success' => false, 'error' => __( 'You do not have permission to publish pages. Create it as a draft instead.', 'neo-pulse-wp' ) );
		}

		$post_id = wp_insert_post(
			array(
				'post_type'   => 'page',
				'post_title'  => $title,
				'post_status' => $status,
				'post_author' => get_current_user_id(),
			),
			true
		);

		if ( is_wp_error( $post_id ) ) {
			return array( 'success' => false, 'error' => $post_id->get_error_message() );
		}

		$focus_keyword = isset( $params['focus_keyword'] ) ? sanitize_text_field( $params['focus_keyword'] ) : '';
		if ( $focus_keyword !== '' ) {
			Neo_Pulse_Wp_Ai_Apply::write_focus_keyword( $post_id, $focus_keyword );
		}

		return array(
			'success'       => true,
			'post_id'       => $post_id,
			'title'         => $title,
			'status'        => $status,
			'type'          => 'page',
			'focus_keyword' => $focus_keyword,
			'edit_url'      => get_edit_post_link( $post_id, 'raw' ),
			'view_url'      => get_permalink( $post_id ),
		);
	}
	public static function tool_create_post( array $params ): array {
		$title  = isset( $params['title'] ) ? sanitize_text_field( $params['title'] ) : '';
		$status = isset( $params['status'] ) ? sanitize_text_field( $params['status'] ) : 'draft';

		if ( $title === '' ) {
			return array( 'success' => false, 'error' => 'Post title is required.' );
		}

		if ( ! in_array( $status, array( 'draft', 'publish', 'private' ), true ) ) {
			$status = 'draft';
		}

		$post_type = 'post';
		if ( ! empty( $params['post_type'] ) ) {
			$candidate = sanitize_key( $params['post_type'] );
			if ( post_type_exists( $candidate ) ) {
				$post_type = $candidate;
			}
		}

		if ( ! self::user_can_create_in_type( $post_type ) ) {
			return array( 'success' => false, 'error' => __( 'You do not have permission to create content of this type.', 'neo-pulse-wp' ) );
		}
		if ( ! self::user_can_set_status( $post_type, $status ) ) {
			return array( 'success' => false, 'error' => __( 'You do not have permission to publish this content type. Create it as a draft instead.', 'neo-pulse-wp' ) );
		}

		$post_data = array(
			'post_type'   => $post_type,
			'post_title'  => $title,
			'post_status' => $status,
			'post_author' => get_current_user_id(),
		);

		if ( ! empty( $params['categories'] ) && is_array( $params['categories'] ) ) {
			$cat_ids = array();
			foreach ( $params['categories'] as $cat_name ) {
				$term = get_term_by( 'name', sanitize_text_field( $cat_name ), 'category' );
				if ( $term ) {
					$cat_ids[] = (int) $term->term_id;
				} elseif ( current_user_can( 'manage_categories' ) ) {
					$new_term = wp_insert_term( sanitize_text_field( $cat_name ), 'category' );
					if ( ! is_wp_error( $new_term ) ) {
						$cat_ids[] = (int) $new_term['term_id'];
					}
				}
			}
			if ( ! empty( $cat_ids ) ) {
				$post_data['post_category'] = $cat_ids;
			}
		}

		$post_id = wp_insert_post( $post_data, true );

		if ( is_wp_error( $post_id ) ) {
			return array( 'success' => false, 'error' => $post_id->get_error_message() );
		}

		$focus_keyword = isset( $params['focus_keyword'] ) ? sanitize_text_field( $params['focus_keyword'] ) : '';
		if ( $focus_keyword !== '' ) {
			Neo_Pulse_Wp_Ai_Apply::write_focus_keyword( $post_id, $focus_keyword );
		}

		return array(
			'success'       => true,
			'post_id'       => $post_id,
			'title'         => $title,
			'status'        => $status,
			'type'          => $post_type,
			'focus_keyword' => $focus_keyword,
			'edit_url'      => get_edit_post_link( $post_id, 'raw' ),
			'view_url'      => get_permalink( $post_id ),
		);
	}
	public static function tool_list_posts( array $params ): array {
		$post_type = isset( $params['post_type'] ) ? sanitize_text_field( $params['post_type'] ) : 'any';
		$count     = isset( $params['count'] ) ? min( absint( $params['count'] ), 50 ) : 10;
		$count     = max( 1, $count );
		$status    = isset( $params['status'] ) ? sanitize_text_field( $params['status'] ) : 'any';

		Neo_Pulse_Wp_Site_Inventory::warm( true );
		$filters = array(
			'include_drafts' => true,
			'limit'          => 500, // Filtered by capability below, then capped at $count.
		);
		if ( $post_type !== 'any' ) {
			$filters['post_type'] = sanitize_key( $post_type );
		}
		if ( $status !== 'any' ) {
			$filters['status'] = sanitize_key( $status );
		}

		$items  = Neo_Pulse_Wp_Site_Inventory::get_items( $filters );
		$result = array();
		$meta   = Neo_Pulse_Wp_Site_Inventory::get_meta();
		$by_type = isset( $meta['by_type'] ) && is_array( $meta['by_type'] ) ? $meta['by_type'] : array();
		$total_available = (int) ( $meta['count'] ?? 0 );
		if ( $post_type !== 'any' && isset( $by_type[ sanitize_key( $post_type ) ] ) ) {
			$total_available = (int) $by_type[ sanitize_key( $post_type ) ];
		}

		$can_edit_others = current_user_can( 'edit_others_posts' );
		foreach ( $items as $item ) {
			if ( count( $result ) >= $count ) {
				break;
			}
			$post_id     = (int) ( $item['id'] ?? 0 );
			$item_status = (string) ( $item['status'] ?? 'publish' );
			if ( $item_status !== 'publish' ) {
				// Drafts/private: editors see all; other users only their own editable items.
				if ( $post_id < 1 || ! current_user_can( 'edit_post', $post_id ) ) {
					continue;
				}
				if ( ! $can_edit_others && (int) get_post_field( 'post_author', $post_id ) !== get_current_user_id() ) {
					continue;
				}
			}
			$result[] = array(
				'id'       => $post_id,
				'title'    => (string) ( $item['title'] ?? '' ),
				'type'     => (string) ( $item['type'] ?? '' ),
				'status'   => (string) ( $item['status'] ?? 'publish' ),
				'date'     => (string) ( $item['date_gmt'] ?? '' ),
				'edit_url' => $post_id > 0 ? get_edit_post_link( $post_id, 'raw' ) : '',
				'view_url' => (string) ( $item['url'] ?? '' ),
			);
		}

		return array(
			'success'         => true,
			'count'           => count( $result ),
			'total_available' => $total_available,
			'posts'           => $result,
		);
	}
	public static function tool_get_post( array $params ): array {
		$post_id = isset( $params['post_id'] ) ? absint( $params['post_id'] ) : 0;
		$title   = isset( $params['title'] ) ? sanitize_text_field( $params['title'] ) : '';

		if ( $post_id > 0 ) {
			$post = get_post( $post_id );
		} elseif ( $title !== '' ) {
			$found = get_posts( array(
				'post_type'   => self::get_content_post_types(),
				'post_status' => array( 'publish', 'draft', 'pending', 'private' ),
				's'           => $title,
				'numberposts' => 1,
			) );
			$post = ! empty( $found ) ? $found[0] : null;
		} else {
			return array( 'success' => false, 'error' => 'Provide a post_id or title to search.' );
		}

		if ( ! $post || ! self::user_can_view_post( $post ) ) {
			return array( 'success' => false, 'error' => 'Post not found.' );
		}

		$meta_hub = Neo_Pulse_Wp_Ai_Context::meta_hub_values( $post->ID );

		return array(
			'success'       => true,
			'id'            => $post->ID,
			'title'         => $post->post_title,
			'type'          => $post->post_type,
			'status'        => $post->post_status,
			'date'          => $post->post_date,
			'modified'      => $post->post_modified,
			'author'        => get_the_author_meta( 'display_name', $post->post_author ),
			'word_count'    => str_word_count( wp_strip_all_tags( $post->post_content ) ),
			'excerpt'       => wp_trim_words( wp_strip_all_tags( $post->post_content ), 40 ),
			'focus_keyword' => (string) ( $meta_hub['focusKeyword'] ?? '' ),
			'meta_hub'      => $meta_hub,
			'edit_url'      => get_edit_post_link( $post->ID, 'raw' ),
			'view_url'      => get_permalink( $post->ID ),
			'categories'    => wp_get_post_categories( $post->ID, array( 'fields' => 'names' ) ),
			'tags'          => wp_get_post_tags( $post->ID, array( 'fields' => 'names' ) ),
		);
	}

	/**
	 * Save Meta Hub SEO fields on an existing post (same path as web app upload).
	 *
	 * @param array<string, mixed> $params post_id or title; focusKeyword, metaDescription, seoTitle, faq, seoResearch.
	 * @return array<string, mixed>
	 */
	public static function tool_save_post_meta( array $params ): array {
		$post_id = isset( $params['post_id'] ) ? absint( $params['post_id'] ) : 0;
		$title   = isset( $params['title'] ) ? sanitize_text_field( (string) $params['title'] ) : '';

		if ( $post_id < 1 && $title !== '' ) {
			Neo_Pulse_Wp_Site_Inventory::warm( true );
			$item = Neo_Pulse_Wp_Site_Inventory::find_item_by_title( $title );
			if ( is_array( $item ) && ! empty( $item['id'] ) ) {
				$post_id = (int) $item['id'];
			}
		}
		if ( $post_id < 1 && $title !== '' ) {
			$post_id = self::resolve_post_by_title( $title );
		}
		if ( $post_id < 1 ) {
			return array(
				'success' => false,
				'error'   => __( 'Provide post_id or a resolvable title.', 'neo-pulse-wp' ),
			);
		}
		if ( ! current_user_can( 'edit_post', $post_id ) ) {
			return array(
				'success' => false,
				'error'   => __( 'You do not have permission to edit this post.', 'neo-pulse-wp' ),
			);
		}

		$fields = self::build_meta_hub_fields_from_params( $params );
		if ( $fields === array() ) {
			return array(
				'success' => false,
				'error'   => __( 'No meta fields to save.', 'neo-pulse-wp' ),
			);
		}

		$result = Neo_Pulse_Wp_Ai_Apply::save_meta(
			$post_id,
			$fields,
			array(
				'seo_title_only' => ! empty( $params['seo_title_only'] ),
			)
		);
		if ( is_wp_error( $result ) ) {
			return array(
				'success' => false,
				'error'   => $result->get_error_message(),
			);
		}

		Neo_Pulse_Wp_Site_Inventory::warm( true );
		$post = get_post( $post_id );

		return array(
			'success'  => true,
			'post_id'  => $post_id,
			'title'    => $post instanceof WP_Post ? $post->post_title : '',
			'url'      => get_permalink( $post_id ),
			'saved'    => isset( $result['saved'] ) && is_array( $result['saved'] ) ? $result['saved'] : array(),
			'values'   => isset( $result['values'] ) && is_array( $result['values'] ) ? $result['values'] : array(),
			'edit_url' => get_edit_post_link( $post_id, 'raw' ),
			'view_url' => get_permalink( $post_id ),
			'constraint_warning' => ! empty( $params['_meta_constraint_warning'] )
				? (string) $params['_meta_constraint_warning']
				: '',
		);
	}

	/**
	 * Build SeoContentBriefV1 JSON and save to ACF seo_research.
	 *
	 * @param array<string, mixed> $params post_id; optional focusKeyword
	 * @return array<string, mixed>
	 */
	public static function tool_run_seo_research_brief( array $params ): array {
		$post_id = isset( $params['post_id'] ) ? absint( $params['post_id'] ) : 0;
		if ( $post_id < 1 && ! empty( $params['title'] ) ) {
			Neo_Pulse_Wp_Site_Inventory::warm( true );
			$item = Neo_Pulse_Wp_Site_Inventory::find_item_by_title( sanitize_text_field( (string) $params['title'] ) );
			if ( is_array( $item ) && ! empty( $item['id'] ) ) {
				$post_id = (int) $item['id'];
			}
		}
		if ( $post_id < 1 ) {
			return array(
				'success' => false,
				'error'   => __( 'Provide post_id for SEO research.', 'neo-pulse-wp' ),
			);
		}
		if ( ! current_user_can( 'edit_post', $post_id ) ) {
			return array(
				'success' => false,
				'error'   => __( 'You do not have permission to edit this post.', 'neo-pulse-wp' ),
			);
		}

		$focus  = isset( $params['focusKeyword'] ) ? sanitize_text_field( (string) $params['focusKeyword'] ) : '';
		$result = Neo_Pulse_Wp_Ai_Seo_Research::build_brief( $post_id, $focus, true );
		if ( is_wp_error( $result ) ) {
			return array(
				'success' => false,
				'error'   => $result->get_error_message(),
				'post_id' => $post_id,
			);
		}

		Neo_Pulse_Wp_Site_Inventory::warm( true );
		$post     = get_post( $post_id );
		$warnings = isset( $result['meta']['warnings'] ) && is_array( $result['meta']['warnings'] ) ? $result['meta']['warnings'] : array();
		$steps    = isset( $result['meta']['steps'] ) && is_array( $result['meta']['steps'] ) ? $result['meta']['steps'] : array();

		return array(
			'success'     => true,
			'post_id'     => $post_id,
			'title'       => $post instanceof WP_Post ? $post->post_title : '',
			'saved'       => isset( $result['saved'] ) && is_array( $result['saved'] ) ? $result['saved'] : array( 'seo_research' ),
			'seoResearch' => isset( $result['seoResearch'] ) ? (string) $result['seoResearch'] : '',
			'warnings'    => $warnings,
			'steps'       => $steps,
			'edit_url'    => get_edit_post_link( $post_id, 'raw' ),
			'view_url'    => get_permalink( $post_id ),
		);
	}

	/**
	 * @param array<string, mixed> $params
	 * @return array<string, string>
	 */
	private static function build_meta_hub_fields_from_params( array $params ): array {
		$fields  = array();
		$post_id = isset( $params['post_id'] ) ? absint( $params['post_id'] ) : 0;
		if ( ! empty( $params['clearFields'] ) && is_array( $params['clearFields'] ) ) {
			foreach ( $params['clearFields'] as $hub_key ) {
				$hub_key = sanitize_key( (string) $hub_key );
				if ( $hub_key !== '' ) {
					$fields[ $hub_key ] = '';
				}
			}
		}
		$text_map = array(
			'focusKeyword'    => array( 'focusKeyword', 'focus_keyword' ),
			'metaDescription' => array( 'metaDescription', 'meta_description' ),
			'seoTitle'        => array( 'seoTitle', 'seo_title' ),
			'pageUrl'         => array( 'pageUrl', 'page_url' ),
		);
		foreach ( $text_map as $hub_key => $keys ) {
			foreach ( $keys as $param_key ) {
				if ( ! isset( $params[ $param_key ] ) || trim( (string) $params[ $param_key ] ) === '' ) {
					continue;
				}
				$value = sanitize_text_field( (string) $params[ $param_key ] );
				if ( Neo_Pulse_Wp_Ai_Seo_Limits::is_placeholder_copy( $value ) ) {
					continue;
				}
				if ( $post_id > 0 && Neo_Pulse_Wp_Ai_Seo_Limits::meta_copy_drifts_from_post( $value, $post_id ) ) {
					continue;
				}
				$fields[ $hub_key ] = $value;
				break;
			}
		}
		foreach ( array( 'faq' => 'faq', 'seoResearch' => array( 'seoResearch', 'seo_research' ), 'dateModifier' => array( 'dateModifier', 'date_modifier' ) ) as $hub_key => $keys ) {
			$key_list = is_array( $keys ) ? $keys : array( $keys );
			foreach ( $key_list as $param_key ) {
				if ( ! isset( $params[ $param_key ] ) || trim( (string) $params[ $param_key ] ) === '' ) {
					continue;
				}
				$value = sanitize_textarea_field( (string) $params[ $param_key ] );
				if ( Neo_Pulse_Wp_Ai_Seo_Limits::is_placeholder_copy( $value ) ) {
					continue;
				}
				if ( $post_id > 0 && Neo_Pulse_Wp_Ai_Seo_Limits::meta_copy_drifts_from_post( $value, $post_id ) ) {
					continue;
				}
				$fields[ $hub_key ] = $value;
				break;
			}
		}
		return $fields;
	}

	public static function tool_add_content( array $params ): array {
		if ( ! empty( $params['_prep_error'] ) ) {
			return array(
				'success' => false,
				'error'   => sanitize_text_field( (string) $params['_prep_error'] ),
			);
		}

		$post_id = isset( $params['post_id'] ) ? absint( $params['post_id'] ) : 0;
		$title   = isset( $params['title'] ) ? sanitize_text_field( $params['title'] ) : '';
		$content = isset( $params['content'] ) ? wp_kses_post( $params['content'] ) : '';
		$mode    = isset( $params['mode'] ) ? sanitize_text_field( $params['mode'] ) : 'append';

		if ( $post_id === 0 && $title !== '' ) {
			$found = get_posts( array(
				'post_type'   => self::get_content_post_types(),
				'post_status' => array( 'publish', 'draft', 'pending', 'private' ),
				's'           => $title,
				'numberposts' => 1,
			) );
			if ( ! empty( $found ) ) {
				$post_id = $found[0]->ID;
			}
		}

		if ( $post_id === 0 ) {
			return array( 'success' => false, 'error' => 'Could not find the target page/post. Provide a valid post_id or title.' );
		}

		if ( ! current_user_can( 'edit_post', $post_id ) ) {
			return array( 'success' => false, 'error' => __( 'You do not have permission to edit this post.', 'neo-pulse-wp' ) );
		}

		if ( $content === '' ) {
			return array( 'success' => false, 'error' => 'Content to add is required.' );
		}

		$content = Neo_Pulse_Wp_Backend_Assist_Pipeline_Content_Prep::strip_json_ld_from_html( $content );
		if ( $content === '' ) {
			return array( 'success' => false, 'error' => 'Content to add is required.' );
		}

		$post = get_post( $post_id );
		if ( ! $post ) {
			return array( 'success' => false, 'error' => 'Post not found.' );
		}

		$body_ops      = ! empty( $params['body_ops'] );
		$body_surgical = ! empty( $params['body_surgical'] );
		$body_edit     = ! empty( $params['body_edit'] );
		$is_ops_save   = $body_ops || $body_surgical || $body_edit;
		$prev_words    = str_word_count( wp_strip_all_tags( (string) $post->post_content ) );
		$prev_links    = $is_ops_save ? Neo_Pulse_Wp_Backend_Assist_Pipeline_Content_Prep::count_same_site_links( (string) $post->post_content ) : 0;

		if ( $mode === 'replace' ) {
			$new_content = $content;
		} else {
			$new_content = trim( $post->post_content ) !== '' ? $post->post_content . "\n\n" . $content : $content;
		}

		$new_words_preview = str_word_count( wp_strip_all_tags( $new_content ) );
		if ( $prev_words > 200 ) {
			$has_remove   = false;
			$ops_list     = ! empty( $params['body_ops_list'] ) && is_array( $params['body_ops_list'] )
				? $params['body_ops_list']
				: ( ! empty( $params['surgical_ops'] ) && is_array( $params['surgical_ops'] ) ? $params['surgical_ops'] : array() );
			$intentional_remove_ops = array( 'remove_section', 'truncate_after_table', 'remove_sections_after' );
			foreach ( $ops_list as $op ) {
				if ( is_array( $op ) && in_array( sanitize_key( (string) ( $op['op'] ?? '' ) ), $intentional_remove_ops, true ) ) {
					$has_remove = true;
					break;
				}
			}
			if ( ! $has_remove && $new_words_preview < (int) floor( $prev_words * 0.85 ) ) {
				return array(
					'success' => false,
					'error'   => __( 'Content loss blocked: this edit would drop more than 15% of the post body. Use restore previous revision to undo a bad edit, then retry with a narrower request.', 'neo-pulse-wp' ),
				);
			}
		}

		self::snapshot_agent_revision( $post_id );

		$result = wp_update_post(
			array(
				'ID'           => $post_id,
				'post_content' => $new_content,
			),
			true
		);

		if ( is_wp_error( $result ) ) {
			return array( 'success' => false, 'error' => $result->get_error_message() );
		}

		$new_words = str_word_count( wp_strip_all_tags( $new_content ) );
		$response  = array(
			'success'    => true,
			'post_id'    => $post_id,
			'title'      => $post->post_title,
			'type'       => $post->post_type,
			'mode'       => $mode,
			'word_count' => $new_words,
			'edit_url'   => get_edit_post_link( $post_id, 'raw' ),
			'view_url'   => get_permalink( $post_id ),
		);
		if ( $body_ops ) {
			$new_links = Neo_Pulse_Wp_Backend_Assist_Pipeline_Content_Prep::count_same_site_links( $new_content );
			$response['body_ops']      = true;
			$response['links_added']   = max( 0, $new_links - $prev_links );
			$response['words_before']  = $prev_words;
			$response['words_after']   = $new_words;
			if ( ! empty( $params['ops_summary'] ) ) {
				$response['ops_summary'] = (string) $params['ops_summary'];
			}
			if ( ! empty( $params['body_ops_list'] ) && is_array( $params['body_ops_list'] ) ) {
				$response['body_ops_list'] = $params['body_ops_list'];
			}
		}
		if ( $body_edit ) {
			$new_links = Neo_Pulse_Wp_Backend_Assist_Pipeline_Content_Prep::count_same_site_links( $new_content );
			$response['body_edit']    = true;
			$response['links_added']  = max( 0, $new_links - $prev_links );
			$response['words_before'] = $prev_words;
			$response['words_after']  = $new_words;
		}
		if ( $body_surgical ) {
			$response['body_surgical'] = true;
			if ( ! empty( $params['surgical_summary'] ) ) {
				$response['surgical_summary'] = (string) $params['surgical_summary'];
			} elseif ( ! empty( $params['ops_summary'] ) ) {
				$response['surgical_summary'] = (string) $params['ops_summary'];
			}
			if ( ! empty( $params['surgical_ops'] ) && is_array( $params['surgical_ops'] ) ) {
				$response['surgical_ops'] = $params['surgical_ops'];
			}
			$response['words_before'] = $prev_words;
			$response['words_after']  = $new_words;
		}

		return $response;
	}
	public static function tool_get_gsc_context( array $params ): array {
		$post_id = isset( $params['post_id'] ) ? absint( $params['post_id'] ) : 0;
		if ( $post_id < 1 && ! empty( $params['title'] ) ) {
			$found = self::resolve_post_by_title( sanitize_text_field( (string) $params['title'] ) );
			if ( $found > 0 ) {
				$post_id = $found;
			}
		}

		$context = Neo_Pulse_Wp_Gsc_Prompt::get_context(
			array(
				'post_id'       => $post_id,
				'focus_keyword' => isset( $params['focus_keyword'] ) ? (string) $params['focus_keyword'] : '',
				'date_from'     => isset( $params['date_from'] ) ? (string) $params['date_from'] : '',
				'date_to'       => isset( $params['date_to'] ) ? (string) $params['date_to'] : '',
			)
		);

		if ( empty( $context['prompt_block'] ) && empty( $context['queries'] ) ) {
			return array(
				'success' => false,
				'error'   => Neo_Pulse_Wp_Gsc_Prompt::is_available()
					? __( 'No GSC query data found for this range.', 'neo-pulse-wp' )
					: __( 'Google Search Console is not configured.', 'neo-pulse-wp' ),
			);
		}

		return array(
			'success'      => true,
			'prompt_block' => (string) $context['prompt_block'],
			'queries'      => $context['queries'],
			'summary'      => (string) $context['prompt_block'],
		);
	}

	/**
	 * Update WordPress post fields (title, status, excerpt, slug). Not body HTML or SEO meta.
	 *
	 * @param array<string, mixed> $params
	 * @return array<string, mixed>
	 */
	public static function tool_update_post( array $params ): array {
		$post_id = isset( $params['post_id'] ) ? absint( $params['post_id'] ) : 0;
		if ( $post_id < 1 ) {
			return array( 'success' => false, 'error' => __( 'post_id is required.', 'neo-pulse-wp' ) );
		}
		if ( ! current_user_can( 'edit_post', $post_id ) ) {
			return array( 'success' => false, 'error' => __( 'You do not have permission to edit this post.', 'neo-pulse-wp' ) );
		}

		$post = get_post( $post_id );
		if ( ! $post instanceof WP_Post ) {
			return array( 'success' => false, 'error' => __( 'Post not found.', 'neo-pulse-wp' ) );
		}

		$update         = array( 'ID' => $post_id );
		$changed_fields = array();
		$previous_title = $post->post_title;

		if ( isset( $params['title'] ) && trim( (string) $params['title'] ) !== '' ) {
			$new_title = sanitize_text_field( (string) $params['title'] );
			if (
				class_exists( 'Neo_Pulse_Wp_Backend_Assist_Pipeline_Content_Prep' )
				&& Neo_Pulse_Wp_Backend_Assist_Pipeline_Content_Prep::title_looks_instructional( $new_title )
			) {
				return array(
					'success' => false,
					'error'   => __( 'Title contains instructional text, not reader-facing copy.', 'neo-pulse-wp' ),
				);
			}
			if ( $new_title !== $previous_title ) {
				$update['post_title'] = $new_title;
				$changed_fields[]     = 'title';
			}
		}
		if ( isset( $params['status'] ) && trim( (string) $params['status'] ) !== '' ) {
			$status = sanitize_key( (string) $params['status'] );
			if ( in_array( $status, array( 'draft', 'publish', 'private', 'pending', 'future' ), true ) && $status !== $post->post_status ) {
				if ( ! self::user_can_set_status( $post->post_type, $status ) ) {
					return array( 'success' => false, 'error' => __( 'You do not have permission to publish this content.', 'neo-pulse-wp' ) );
				}
				$update['post_status'] = $status;
				$changed_fields[]      = 'status';
			}
		}
		if ( isset( $params['excerpt'] ) ) {
			$excerpt = sanitize_textarea_field( (string) $params['excerpt'] );
			if ( $excerpt !== $post->post_excerpt ) {
				$update['post_excerpt'] = $excerpt;
				$changed_fields[]       = 'excerpt';
			}
		}
		if ( isset( $params['slug'] ) && trim( (string) $params['slug'] ) !== '' ) {
			$slug = sanitize_title( (string) $params['slug'] );
			if ( $slug !== $post->post_name ) {
				$update['post_name'] = $slug;
				$changed_fields[]    = 'slug';
			}
		}

		if ( count( $update ) === 1 ) {
			return array(
				'success' => false,
				'error'   => __( 'No post fields to update.', 'neo-pulse-wp' ),
			);
		}

		$rs = wp_update_post( $update, true );
		if ( is_wp_error( $rs ) ) {
			return array( 'success' => false, 'error' => $rs->get_error_message() );
		}

		Neo_Pulse_Wp_Site_Inventory::warm( true );
		$updated = get_post( $post_id );

		return array(
			'success'        => true,
			'post_id'        => $post_id,
			'title'          => $updated instanceof WP_Post ? $updated->post_title : '',
			'previous_title' => $previous_title,
			'changed_fields' => $changed_fields,
			'edit_url'       => get_edit_post_link( $post_id, 'raw' ),
			'view_url'       => get_permalink( $post_id ),
		);
	}

	/**
	 * Restore post body from the last agent snapshot (undo mistaken add_content).
	 *
	 * @param array<string, mixed> $params
	 * @return array<string, mixed>
	 */
	public static function tool_restore_post_revision( array $params ): array {
		$post_id = isset( $params['post_id'] ) ? absint( $params['post_id'] ) : 0;
		if ( $post_id < 1 ) {
			return array( 'success' => false, 'error' => __( 'post_id is required.', 'neo-pulse-wp' ) );
		}
		if ( ! current_user_can( 'edit_post', $post_id ) ) {
			return array( 'success' => false, 'error' => __( 'You do not have permission to edit this post.', 'neo-pulse-wp' ) );
		}

		if ( ! class_exists( 'Neo_Pulse_Wp_Tools_Handlers' ) ) {
			require_once NEO_PULSE_WP_PLUGIN_DIR . 'includes/class-neo-pulse-wp-tools-handlers.php';
		}

		$rs = Neo_Pulse_Wp_Tools_Handlers::wp_revision_restore( array( 'post_id' => $post_id ) );
		if ( is_wp_error( $rs ) ) {
			return array( 'success' => false, 'error' => $rs->get_error_message() );
		}

		$post = get_post( $post_id );
		if ( ! $post instanceof WP_Post ) {
			return array( 'success' => false, 'error' => __( 'Post not found after restore.', 'neo-pulse-wp' ) );
		}

		return array(
			'success'    => true,
			'post_id'    => $post_id,
			'title'      => $post->post_title,
			'restored'   => true,
			'word_count' => str_word_count( wp_strip_all_tags( $post->post_content ) ),
			'edit_url'   => get_edit_post_link( $post_id, 'raw' ),
			'view_url'   => get_permalink( $post_id ),
		);
	}

	public static function agent_revision_available( int $post_id ): bool {
		if ( $post_id < 1 ) {
			return false;
		}
		$key = 'neo-pulse_agent_rev_' . $post_id;
		$rev = get_post_meta( $post_id, $key, true );
		return is_array( $rev ) && ! empty( $rev['content'] );
	}

	public static function snapshot_agent_revision( int $post_id ): void {
		if ( $post_id < 1 ) {
			return;
		}
		$post = get_post( $post_id );
		if ( ! $post instanceof WP_Post ) {
			return;
		}
		$key = 'neo-pulse_agent_rev_' . $post_id;
		if ( get_post_meta( $post_id, $key, true ) ) {
			return;
		}
		update_post_meta(
			$post_id,
			$key,
			array(
				'content'  => $post->post_content,
				'saved_at' => gmdate( 'c' ),
			)
		);
	}

	/**
	 * Current user may create items of a public post type.
	 */
	private static function user_can_create_in_type( string $post_type ): bool {
		$obj = get_post_type_object( $post_type );
		if ( ! $obj || empty( $obj->public ) ) {
			return false;
		}
		return current_user_can( $obj->cap->create_posts ) && current_user_can( $obj->cap->edit_posts );
	}

	/**
	 * Current user may set this status on an item of the given post type
	 * (publish / private / future need the type's publish capability).
	 */
	public static function user_can_set_status( string $post_type, string $status ): bool {
		$obj = get_post_type_object( $post_type );
		if ( ! $obj ) {
			return false;
		}
		if ( in_array( $status, array( 'publish', 'private', 'future' ), true ) ) {
			return current_user_can( $obj->cap->publish_posts );
		}
		return true;
	}

	/**
	 * Published, non-password posts need read_post; anything else needs edit_post.
	 */
	private static function user_can_view_post( WP_Post $post ): bool {
		if ( $post->post_status === 'publish' && $post->post_password === '' ) {
			return current_user_can( 'read_post', $post->ID );
		}
		return current_user_can( 'edit_post', $post->ID );
	}

	public static function resolve_post_by_title( string $title ): int {
		if ( $title === '' ) {
			return 0;
		}
		$found = get_posts(
			array(
				'post_type'   => self::get_content_post_types(),
				'post_status' => array( 'publish', 'draft', 'pending', 'private' ),
				's'           => $title,
				'numberposts' => 1,
			)
		);
		return ! empty( $found[0] ) ? (int) $found[0]->ID : 0;
	}
	public static function get_content_post_types(): array {
		$types = array( 'post', 'page' );
		if ( post_type_exists( 'service-area' ) ) {
			$types[] = 'service-area';
		}
		return $types;
	}
}
