<?php
/**
 * Backend Assist — semantic card builders for REST responses
 *
 * @package Neo_Pulse_Wp
 */

defined( 'ABSPATH' ) || exit;

class Neo_Pulse_Wp_Backend_Assist_Cards {

	public static function normalize_history( array $history ): array {
		$out = array();
		foreach ( array_slice( array_values( $history ), -10 ) as $entry ) {
			if ( ! is_array( $entry ) ) {
				continue;
			}
			$row = array(
				'role'    => isset( $entry['role'] ) && is_string( $entry['role'] ) ? sanitize_text_field( $entry['role'] ) : 'user',
				'content' => isset( $entry['content'] ) && is_string( $entry['content'] ) ? sanitize_textarea_field( $entry['content'] ) : '',
			);
			// Keep the card's workflow id so Workflow::workflow_id_from_history() can resume a plan.
			if ( isset( $entry['card'] ) && is_array( $entry['card'] ) && isset( $entry['card']['workflow_id'] ) && is_scalar( $entry['card']['workflow_id'] ) ) {
				$workflow_id = sanitize_text_field( (string) $entry['card']['workflow_id'] );
				if ( $workflow_id !== '' ) {
					$row['card'] = array( 'workflow_id' => $workflow_id );
				}
			}
			$out[] = $row;
		}
		return $out;
	}
	public static function action_card( array $result, string $tool ): array {
		$success = ! empty( $result['success'] );
		$links   = $success ? self::standard_action_links( $result ) : array();

		$title = self::tool_action_title( $tool, $result, $success );
		$body  = self::tool_action_body( $tool, $result, $success );

		$card = array(
			'type'          => 'action',
			'title'         => $title,
			'body'          => $body,
			'links'         => $links,
			'confidence'    => $success ? 'high' : 'low',
			'action_result' => $result,
		);

		if ( $success && self::should_offer_undo( $tool, $result ) ) {
			$post_id = (int) ( $result['post_id'] ?? 0 );
			if ( $post_id > 0 && Neo_Pulse_Wp_Backend_Assist_Tools_Wp::agent_revision_available( $post_id ) ) {
				$card['links'][] = self::undo_link_for_post( $post_id );
			}
		}

		return $card;
	}

	/**
	 * @return array<string, mixed>
	 */
	public static function undo_link_for_post( int $post_id ): array {
		return array(
			'label'   => __( 'Undo', 'neo-pulse-wp' ),
			'icon'    => 'edit',
			'action'  => 'undo',
			'post_id' => $post_id,
			'url'     => '#',
		);
	}

	/**
	 * @param array<string, mixed> $result
	 */
	private static function should_offer_undo( string $tool, array $result ): bool {
		if ( empty( $result['post_id'] ) ) {
			return false;
		}
		return in_array( $tool, array( 'add_content', 'faq_compound', 'body_schema_cleanup' ), true );
	}

	/**
	 * @param array<string, mixed> $result
	 */
	private static function tool_action_title( string $tool, array $result, bool $success ): string {
		if ( ! $success ) {
			return __( 'Action failed', 'neo-pulse-wp' );
		}

		switch ( $tool ) {
			case 'update_post':
				if ( ! empty( $result['changed_fields'] ) && in_array( 'title', (array) $result['changed_fields'], true ) ) {
					return __( 'Post title updated', 'neo-pulse-wp' );
				}
				if ( ! empty( $result['changed_fields'] ) && in_array( 'status', (array) $result['changed_fields'], true ) ) {
					return __( 'Post status updated', 'neo-pulse-wp' );
				}
				return __( 'Post updated', 'neo-pulse-wp' );
			case 'add_content':
				if ( ! empty( $result['body_ops'] ) ) {
					if (
						! empty( $result['body_ops_list'] )
						&& is_array( $result['body_ops_list'] )
						&& in_array( 'replace_heading', wp_list_pluck( $result['body_ops_list'], 'op' ), true )
					) {
						return __( 'Heading updated', 'neo-pulse-wp' );
					}
					return __( 'Post body updated (ops)', 'neo-pulse-wp' );
				}
				if ( ! empty( $result['body_surgical'] ) ) {
					return __( 'Post body updated (ops)', 'neo-pulse-wp' );
				}
				if ( ! empty( $result['body_edit'] ) ) {
					return __( 'Post body updated (ops)', 'neo-pulse-wp' );
				}
				return __( 'Post content updated', 'neo-pulse-wp' );
			case 'save_post_meta':
				if ( ! empty( $result['saved'] ) && is_array( $result['saved'] ) && in_array( 'date_modifier', $result['saved'], true ) ) {
					return __( 'Date modifier updated', 'neo-pulse-wp' );
				}
				if (
					! empty( $result['saved'] )
					&& is_array( $result['saved'] )
					&& in_array( 'seo_research', $result['saved'], true )
					&& empty( $result['values']['seoResearch'] ?? '' )
				) {
					return __( 'SEO research cleared', 'neo-pulse-wp' );
				}
				if ( ! empty( $result['saved'] ) && is_array( $result['saved'] ) && in_array( 'faq', $result['saved'], true ) ) {
					return __( 'FAQ schema saved to post meta', 'neo-pulse-wp' );
				}
				return __( 'SEO meta updated', 'neo-pulse-wp' );
			case 'run_seo_research_brief':
				return __( 'SEO research brief saved', 'neo-pulse-wp' );
			case 'faq_compound':
				return __( 'FAQ schema and table updated', 'neo-pulse-wp' );
			case 'body_schema_cleanup':
				return __( 'Body cleaned and FAQ schema saved', 'neo-pulse-wp' );
			case 'restore_post_revision':
				return __( 'Changes reverted', 'neo-pulse-wp' );
			default:
				$title_label = isset( $result['title'] ) ? (string) $result['title'] : str_replace( '_', ' ', $tool );
				return sprintf(
					/* translators: %s: action label */
					__( 'Done: %s', 'neo-pulse-wp' ),
					$title_label
				);
		}
	}

	/**
	 * @param array<string, mixed> $result
	 */
	private static function tool_action_body( string $tool, array $result, bool $success ): string {
		if ( ! $success ) {
			return isset( $result['error'] ) ? (string) $result['error'] : __( 'Unknown error.', 'neo-pulse-wp' );
		}

		if ( ! empty( $result['summary'] ) ) {
			return (string) $result['summary'];
		}

		switch ( $tool ) {
			case 'update_post':
				$lines = array();
				if ( ! empty( $result['post_id'] ) ) {
					$lines[] = '**Post ID:** ' . (int) $result['post_id'];
				}
				if ( ! empty( $result['previous_title'] ) && ! empty( $result['title'] )
					&& (string) $result['previous_title'] !== (string) $result['title'] ) {
					$lines[] = '**Previous title:** ' . (string) $result['previous_title'];
					$lines[] = '**New title:** ' . (string) $result['title'];
				} elseif ( ! empty( $result['title'] ) ) {
					$lines[] = '**Title:** ' . (string) $result['title'];
				}
				if ( ! empty( $result['changed_fields'] ) && is_array( $result['changed_fields'] ) ) {
					$lines[] = '**Updated:** ' . implode( ', ', $result['changed_fields'] );
				}
				return implode( "\n", $lines );
			case 'add_content':
				$lines = array();
				if ( ! empty( $result['post_id'] ) ) {
					$lines[] = '**Post ID:** ' . (int) $result['post_id'];
				}
				if ( ! empty( $result['body_ops'] ) || ! empty( $result['body_surgical'] ) ) {
					$lines[] = '**Edit:** ' . __( 'Post body updated (ops)', 'neo-pulse-wp' );
					$summary = ! empty( $result['ops_summary'] )
						? (string) $result['ops_summary']
						: ( ! empty( $result['surgical_summary'] ) ? (string) $result['surgical_summary'] : '' );
					if ( $summary !== '' ) {
						$lines[] = '**Changes:** ' . $summary;
					}
				} elseif ( ! empty( $result['body_edit'] ) ) {
					$lines[] = '**Edit:** ' . __( 'In-place body update', 'neo-pulse-wp' );
					if ( isset( $result['links_added'] ) && (int) $result['links_added'] > 0 ) {
						$lines[] = '**Links added:** ' . (int) $result['links_added'];
					}
				}
				if ( isset( $result['word_count'] ) ) {
					$lines[] = '**Word count:** ' . (int) $result['word_count'];
				}
				if ( ! empty( $result['title'] ) ) {
					$lines[] = '**Title:** ' . (string) $result['title'];
				}
				return implode( "\n", $lines );
			case 'save_post_meta':
				$lines = array();
				if ( ! empty( $result['post_id'] ) ) {
					$lines[] = '**Post ID:** ' . (int) $result['post_id'];
				}
				$values = isset( $result['values'] ) && is_array( $result['values'] ) ? $result['values'] : array();
				$seo_title = trim( (string) ( $values['seoTitle'] ?? '' ) );
				$meta_desc = trim( (string) ( $values['metaDescription'] ?? '' ) );
				if ( $seo_title !== '' ) {
					$lines[] = '**SEO title:** ' . $seo_title;
				}
				if ( $meta_desc !== '' ) {
					$desc_display = function_exists( 'wp_trim_words' )
						? wp_trim_words( $meta_desc, 40, '…' )
						: ( strlen( $meta_desc ) > 220 ? substr( $meta_desc, 0, 217 ) . '…' : $meta_desc );
					$lines[] = '**Meta description:** ' . $desc_display;
				}
				if ( ! empty( $result['saved'] ) && is_array( $result['saved'] ) ) {
					$saved_labels = array_values( $result['saved'] );
					if ( in_array( 'faq', $saved_labels, true ) ) {
						$lines[] = '**FAQ schema:** ' . __( 'Saved to post meta (ACF faq field)', 'neo-pulse-wp' );
						$saved_labels = array_values( array_diff( $saved_labels, array( 'faq' ) ) );
					}
					if ( ! empty( $saved_labels ) ) {
						$lines[] = '**Saved fields:** ' . implode( ', ', $saved_labels );
					}
				}
				if ( ! empty( $result['constraint_warning'] ) ) {
					$lines[] = '**Note:** ' . (string) $result['constraint_warning'];
				}
				return implode( "\n", $lines );
			case 'run_seo_research_brief':
				$lines = array();
				if ( ! empty( $result['post_id'] ) ) {
					$lines[] = '**Post ID:** ' . (int) $result['post_id'];
				}
				if ( ! empty( $result['title'] ) ) {
					$lines[] = '**Title:** ' . (string) $result['title'];
				}
				if ( ! empty( $result['saved'] ) && is_array( $result['saved'] ) ) {
					$lines[] = '**Saved:** ' . implode( ', ', $result['saved'] );
				}
				if ( ! empty( $result['steps'] ) && is_array( $result['steps'] ) ) {
					$lines[] = '**Steps:** ' . implode( ', ', $result['steps'] );
				}
				if ( ! empty( $result['warnings'] ) && is_array( $result['warnings'] ) ) {
					$lines[] = '**Warnings:** ' . implode( ', ', $result['warnings'] );
				}
				return implode( "\n", $lines );
			case 'faq_compound':
				$lines = array();
				if ( ! empty( $result['post_id'] ) ) {
					$lines[] = '**Post ID:** ' . (int) $result['post_id'];
				}
				$lines[] = '**FAQ schema:** ' . __( 'Saved to post meta (ACF faq field)', 'neo-pulse-wp' );
				$lines[] = '**FAQ table:** ' . __( 'Appended to post content', 'neo-pulse-wp' );
				if ( isset( $result['word_count'] ) ) {
					$lines[] = '**Word count:** ' . (int) $result['word_count'];
				}
				if ( ! empty( $result['title'] ) ) {
					$lines[] = '**Title:** ' . (string) $result['title'];
				}
				return implode( "\n", $lines );
			case 'body_schema_cleanup':
				$lines = array();
				if ( ! empty( $result['post_id'] ) ) {
					$lines[] = '**Post ID:** ' . (int) $result['post_id'];
				}
				$lines[] = '**Body:** ' . ( ! empty( $result['surgical_summary'] ) ? (string) $result['surgical_summary'] : __( 'JSON-LD removed from post content', 'neo-pulse-wp' ) );
				$lines[] = '**FAQ schema:** ' . __( 'Saved to post meta (ACF faq field)', 'neo-pulse-wp' );
				if ( isset( $result['word_count'] ) ) {
					$lines[] = '**Word count:** ' . (int) $result['word_count'];
				}
				if ( ! empty( $result['title'] ) ) {
					$lines[] = '**Title:** ' . (string) $result['title'];
				}
				return implode( "\n", $lines );
			case 'restore_post_revision':
				$lines = array();
				if ( ! empty( $result['post_id'] ) ) {
					$lines[] = '**Post ID:** ' . (int) $result['post_id'];
				}
				if ( isset( $result['word_count'] ) ) {
					$lines[] = '**Word count:** ' . (int) $result['word_count'];
				}
				$lines[] = __( 'Restored the post body from before the last agent edit.', 'neo-pulse-wp' );
				return implode( "\n", $lines );
		}

		return sprintf(
			/* translators: %s: tool name */
			__( 'Successfully executed %s.', 'neo-pulse-wp' ),
			str_replace( '_', ' ', $tool )
		);
	}
	public static function needs_info_card( string $tool, array $missing ): array {
		$prompts = array(
			'create_page' => array(
				'title'       => __( 'Let\'s create your page', 'neo-pulse-wp' ),
				'body'        => __( 'What **title** would you like for this page? You can also include a **focus keyword** for SEO.', 'neo-pulse-wp' ),
				'suggestions' => self::create_page_title_suggestions(),
			),
			'create_post' => array(
				'title'       => __( 'Let\'s create your post', 'neo-pulse-wp' ),
				'body'        => __( 'What **title** would you like for this post? You can also include a **focus keyword** and **category**.', 'neo-pulse-wp' ),
				'suggestions' => self::create_post_title_suggestions(),
			),
			'get_post' => array(
				'title'       => __( 'Which post are you looking for?', 'neo-pulse-wp' ),
				'body'        => __( 'Please provide the **post title** or **ID** to look up.', 'neo-pulse-wp' ),
				'suggestions' => array(
					'Homepage',
					'About Us',
					'Post ID 42',
				),
			),
			'add_content' => array(
				'title'       => __( 'What content should I add?', 'neo-pulse-wp' ),
				'body'        => __( 'Tell me **what to write** and **which page/post** to add it to. I can generate content for you — just describe what you need.', 'neo-pulse-wp' ),
				'suggestions' => array(
					'Add 5 H2 headings to SEO Vs. Ads',
					'Write an intro paragraph for my About page',
					'Add a FAQ section to Services',
				),
			),
			'design_page_with_novamira' => array(
				'title'       => __( 'Design page with Novamira', 'neo-pulse-wp' ),
				'body'        => __( 'Which **new page** should I design? Provide post_id after create_page.', 'neo-pulse-wp' ),
				'suggestions' => array(
					'Design the new page with Novamira',
				),
			),
		);

		$info = isset( $prompts[ $tool ] ) ? $prompts[ $tool ] : array(
			'title'       => __( 'I need a bit more info', 'neo-pulse-wp' ),
			'body'        => sprintf( __( 'To run **%s**, please provide: %s', 'neo-pulse-wp' ), str_replace( '_', ' ', $tool ), implode( ', ', $missing ) ),
			'suggestions' => array(),
		);

		return array(
			'type'              => 'prompt',
			'title'             => $info['title'],
			'body'              => $info['body'],
			'links'             => array(),
			'suggested_actions' => $info['suggestions'],
			'confidence'        => 'high',
		);
	}

	/**
	 * Site-aware post title chips for the create_post prompt.
	 *
	 * @return array<int, string>
	 */
	private static function create_post_title_suggestions(): array {
		Neo_Pulse_Wp_Site_Inventory::warm( true );
		$posts = Neo_Pulse_Wp_Site_Inventory::get_type_items( 'post' );

		$existing_titles = array();
		$title_corpus    = '';
		foreach ( $posts as $post ) {
			$title = trim( (string) ( $post['title'] ?? '' ) );
			if ( $title === '' ) {
				continue;
			}
			$lower = strtolower( $title );
			if (
				strpos( $lower, 'blog ideas' ) !== false
				|| strpos( $lower, 'blog post ideas' ) !== false
			) {
				continue;
			}
			$existing_titles[] = $lower;
			$title_corpus     .= ' ' . $lower;
		}

		$ideas = array(
			array(
				'title'   => __( 'How To Install Blinds: A Homeowner Step-by-Step Guide', 'neo-pulse-wp' ),
				'keyword' => 'install blinds',
				'signals' => array( 'install', 'blinds', 'how to' ),
			),
			array(
				'title'   => __( 'Room-by-Room Window Covering Guide for New Homeowners', 'neo-pulse-wp' ),
				'keyword' => 'window coverings guide',
				'signals' => array( 'window', 'room', 'guide' ),
			),
			array(
				'title'   => __( 'Motorized vs Manual Blinds: Which Fits Your Home?', 'neo-pulse-wp' ),
				'keyword' => 'motorized blinds',
				'signals' => array( 'motorized', 'manual', 'blinds' ),
			),
			array(
				'title'   => __( 'How To Fix Common Blind Problems Without Replacing Them', 'neo-pulse-wp' ),
				'keyword' => 'blind repair',
				'signals' => array( 'repair', 'blinds', 'how to' ),
			),
			array(
				'title'   => __( 'Choosing Child-Safe Window Treatments for Your Family', 'neo-pulse-wp' ),
				'keyword' => 'child safe window treatments',
				'signals' => array( 'child', 'safe', 'window' ),
			),
			array(
				'title'   => __( 'Energy-Efficient Window Coverings: What to Look For', 'neo-pulse-wp' ),
				'keyword' => 'energy efficient window coverings',
				'signals' => array( 'energy', 'efficient', 'window' ),
			),
		);

		$scored = array();
		foreach ( $ideas as $idea ) {
			if ( self::title_too_similar_to_existing( $idea['title'], $existing_titles ) ) {
				continue;
			}
			$score = 0;
			foreach ( $idea['signals'] as $signal ) {
				if ( strpos( $title_corpus, $signal ) !== false ) {
					++$score;
				}
			}
			$scored[] = array(
				'score' => $score,
				'idea'  => $idea,
			);
		}

		usort(
			$scored,
			static function ( array $a, array $b ): int {
				return $b['score'] <=> $a['score'];
			}
		);

		$out = array();
		foreach ( $scored as $row ) {
			$out[] = sprintf(
				'%s (keyword: %s)',
				$row['idea']['title'],
				$row['idea']['keyword']
			);
			if ( count( $out ) >= 3 ) {
				break;
			}
		}

		if ( count( $out ) >= 3 ) {
			return $out;
		}

		foreach ( $ideas as $idea ) {
			$label = sprintf( '%s (keyword: %s)', $idea['title'], $idea['keyword'] );
			if ( in_array( $label, $out, true ) ) {
				continue;
			}
			$out[] = $label;
			if ( count( $out ) >= 3 ) {
				break;
			}
		}

		return $out;
	}

	/**
	 * Site-aware page title chips for the create_page prompt.
	 *
	 * @return array<int, string>
	 */
	private static function create_page_title_suggestions(): array {
		Neo_Pulse_Wp_Site_Inventory::warm( true );
		$pages = Neo_Pulse_Wp_Site_Inventory::get_type_items( 'page' );

		$title_corpus = '';
		foreach ( $pages as $page ) {
			$title = trim( (string) ( $page['title'] ?? '' ) );
			if ( $title !== '' ) {
				$title_corpus .= ' ' . strtolower( $title );
			}
		}

		$ideas = array(
			array(
				'label'   => __( 'Free In-Home Consultation (keyword: window covering consultation)', 'neo-pulse-wp' ),
				'signals' => array( 'consultation', 'service', 'appointment' ),
			),
			array(
				'label'   => __( 'Blind Repair Services (keyword: blind repair)', 'neo-pulse-wp' ),
				'signals' => array( 'repair', 'service', 'blinds' ),
			),
			array(
				'label'   => __( 'Custom Window Coverings (keyword: custom blinds)', 'neo-pulse-wp' ),
				'signals' => array( 'custom', 'window', 'blinds' ),
			),
			array(
				'label'   => __( 'Hunter Douglas Products (keyword: hunter douglas)', 'neo-pulse-wp' ),
				'signals' => array( 'hunter', 'douglas', 'products' ),
			),
			array(
				'label'   => __( 'Operating Systems Guide (keyword: blind operating systems)', 'neo-pulse-wp' ),
				'signals' => array( 'operating', 'systems', 'motorized' ),
			),
		);

		$scored = array();
		foreach ( $ideas as $idea ) {
			$score = 0;
			foreach ( $idea['signals'] as $signal ) {
				if ( strpos( $title_corpus, $signal ) !== false ) {
					++$score;
				}
			}
			$scored[] = array(
				'score' => $score,
				'label' => $idea['label'],
			);
		}

		usort(
			$scored,
			static function ( array $a, array $b ): int {
				return $b['score'] <=> $a['score'];
			}
		);

		$out = array();
		foreach ( $scored as $row ) {
			$out[] = $row['label'];
			if ( count( $out ) >= 3 ) {
				break;
			}
		}

		return $out;
	}

	/**
	 * @param array<int, string> $existing_titles Lowercase titles already on the site.
	 */
	private static function title_too_similar_to_existing( string $title, array $existing_titles ): bool {
		$needle = strtolower( trim( $title ) );
		if ( $needle === '' ) {
			return true;
		}
		foreach ( $existing_titles as $existing ) {
			if ( $existing === $needle ) {
				return true;
			}
			if ( strlen( $needle ) >= 24 && strpos( $existing, substr( $needle, 0, 24 ) ) !== false ) {
				return true;
			}
			if ( strlen( $existing ) >= 24 && strpos( $needle, substr( $existing, 0, 24 ) ) !== false ) {
				return true;
			}
		}
		return false;
	}

	public static function error_card( string $message ): array {
		return array(
			'type'       => 'error',
			'title'      => __( 'Something went wrong', 'neo-pulse-wp' ),
			'body'       => $message,
			'links'      => array(),
			'confidence' => 'low',
		);
	}

	/**
	 * Resolve placeholder links and merge URLs from tool results / body post refs.
	 *
	 * @param array<string, mixed> $card
	 * @param array<string, mixed> $exec_result
	 * @return array<string, mixed>
	 */
	public static function enrich_card( array $card, string $tool = '', array $exec_result = array() ): array {
		if ( empty( $exec_result ) && ! empty( $card['action_result'] ) && is_array( $card['action_result'] ) ) {
			$exec_result = $card['action_result'];
		}

		$body       = isset( $card['body'] ) ? (string) $card['body'] : '';
		$links      = isset( $card['links'] ) && is_array( $card['links'] ) ? $card['links'] : array();
		$card_type  = isset( $card['type'] ) ? sanitize_key( (string) $card['type'] ) : '';
		$has_exec   = ! empty( $exec_result['success'] );
		$resolve_inventory = ! ( $card_type === 'answer' && ! $has_exec );

		$links = self::sanitize_card_links( $links, $resolve_inventory );

		if ( ! empty( $exec_result['success'] ) ) {
			$links = self::merge_card_links( $links, self::links_from_tool_result( $tool, $exec_result, $body ) );
			if ( self::result_has_editor_link_pills( $exec_result ) ) {
				unset( $card['cta'] );
			} else {
				$card  = self::attach_primary_cta( $card, $exec_result );
				$card  = self::ensure_body_links_to_result( $card, $exec_result );
			}
			$body  = isset( $card['body'] ) ? (string) $card['body'] : $body;
		}

		if ( $has_exec || $card_type !== 'answer' ) {
			$links = self::merge_card_links( $links, self::links_from_body_inventory_refs( $body ) );
		} elseif ( $card_type === 'answer' ) {
			$links = array();
		}

		if ( $has_exec && ! empty( $exec_result['post_id'] ) && ! self::links_have_undo( $links ) ) {
			$inferred_tool = $tool;
			if ( $inferred_tool === '' && empty( $exec_result['restored'] ) ) {
				if (
					! empty( $exec_result['body_ops'] )
					|| ! empty( $exec_result['body_edit'] )
					|| ! empty( $exec_result['body_surgical'] )
					|| isset( $exec_result['mode'] )
				) {
					$inferred_tool = 'add_content';
				}
			}
			if ( $inferred_tool !== '' && self::should_offer_undo( $inferred_tool, $exec_result ) ) {
				$post_id = (int) $exec_result['post_id'];
				if ( Neo_Pulse_Wp_Backend_Assist_Tools_Wp::agent_revision_available( $post_id ) ) {
					$links[] = self::undo_link_for_post( $post_id );
				}
			}
		}

		$card['links'] = array_slice( $links, 0, 20 );
		unset( $card['undo'] );

		return $card;
	}

	/**
	 * @param array<int, array<string, mixed>> $links
	 */
	private static function links_have_undo( array $links ): bool {
		foreach ( $links as $link ) {
			if ( is_array( $link ) && sanitize_key( (string) ( $link['action'] ?? '' ) ) === 'undo' ) {
				return true;
			}
		}
		return false;
	}

	/**
	 * Edit / view link pills for a known post (plan cards and previews).
	 *
	 * @return array<int, array<string, mixed>>
	 */
	public static function links_for_post( int $post_id ): array {
		if ( $post_id < 1 ) {
			return array();
		}
		$post = get_post( $post_id );
		if ( ! $post instanceof WP_Post ) {
			return array();
		}
		return self::standard_action_links(
			array(
				'post_id'  => $post_id,
				'title'    => $post->post_title,
				'type'     => $post->post_type,
				'status'   => $post->post_status,
				'edit_url' => get_edit_post_link( $post_id, 'raw' ),
				'view_url' => get_permalink( $post_id ),
			)
		);
	}

	/**
	 * Attach post editor links to plan cards without changing card type.
	 *
	 * @param array<string, mixed> $card
	 * @return array<string, mixed>
	 */
	public static function enrich_plan_card( array $card, int $post_id, string $tool = '', string $build_message = '' ): array {
		if ( $post_id > 0 && ! in_array( $tool, array( 'create_page', 'create_post' ), true ) ) {
			$existing      = isset( $card['links'] ) && is_array( $card['links'] ) ? $card['links'] : array();
			$card['links'] = self::merge_card_links( $existing, self::links_for_post( $post_id ) );
		}
		$trimmed = trim( $build_message );
		if ( $trimmed !== '' && ! empty( $card['submode_switch'] ) && $card['submode_switch'] === 'build' ) {
			$card['build_message'] = $trimmed;
		}
		return self::enrich_card( $card, $tool );
	}

	/**
	 * @param array<int, array<string, mixed>> $links
	 * @return array<int, array<string, mixed>>
	 */
	public static function sanitize_card_links( array $links, bool $resolve_inventory = true ): array {
		$out = array();
		foreach ( $links as $link ) {
			if ( ! is_array( $link ) ) {
				continue;
			}
			$label = trim( (string) ( $link['label'] ?? '' ) );
			$url   = trim( (string) ( $link['url'] ?? '' ) );
			$action = isset( $link['action'] ) ? sanitize_key( (string) $link['action'] ) : '';
			if ( $action === 'undo' && ! empty( $link['post_id'] ) ) {
				$out[] = array(
					'label'   => $label !== '' ? $label : __( 'Undo', 'neo-pulse-wp' ),
					'url'     => '#',
					'icon'    => isset( $link['icon'] ) ? sanitize_key( (string) $link['icon'] ) : 'edit',
					'action'  => 'undo',
					'post_id' => absint( $link['post_id'] ),
				);
				continue;
			}
			if ( $resolve_inventory && ! self::is_valid_card_link_url( $url ) && $label !== '' ) {
				$item = Neo_Pulse_Wp_Site_Inventory::find_item_by_title( $label );
				if ( is_array( $item ) && ! empty( $item['url'] ) ) {
					$url = (string) $item['url'];
				}
			}
			if ( ! self::is_valid_card_link_url( $url ) ) {
				continue;
			}
			$out[] = array(
				'label' => $label !== '' ? $label : $url,
				'url'   => $url,
				'icon'  => isset( $link['icon'] ) ? sanitize_key( (string) $link['icon'] ) : 'page',
			);
		}
		return $out;
	}

	/**
	 * @param array<int, array<string, mixed>> $base
	 * @param array<int, array<string, mixed>> $extra
	 * @return array<int, array<string, mixed>>
	 */
	private static function merge_card_links( array $base, array $extra ): array {
		$seen = array();
		foreach ( $base as $link ) {
			if ( ! empty( $link['url'] ) ) {
				$seen[ strtolower( (string) $link['url'] ) ] = true;
			}
		}
		foreach ( $extra as $link ) {
			$url = isset( $link['url'] ) ? strtolower( (string) $link['url'] ) : '';
			if ( $url === '' || isset( $seen[ $url ] ) ) {
				continue;
			}
			$seen[ $url ] = true;
			$base[]       = $link;
		}
		return $base;
	}

	private static function is_valid_card_link_url( string $url ): bool {
		if ( $url === '' || $url === '#' || ! preg_match( '#^https?://#i', $url ) ) {
			return false;
		}
		$host = wp_parse_url( $url, PHP_URL_HOST );
		if ( ! is_string( $host ) || $host === '' ) {
			return false;
		}
		$host = strtolower( $host );
		return $host !== 'example.com' && ! str_ends_with( $host, '.example.com' );
	}

	/**
	 * @param array<string, mixed> $result
	 * @return array<int, array<string, mixed>>
	 */
	private static function links_from_tool_result( string $tool, array $result, string $body ): array {
		$links = self::standard_action_links( $result );

		if ( $tool === 'grade_post_library_seo' && ! empty( $result['posts'] ) && is_array( $result['posts'] ) ) {
			$weak  = 0;
			$strong = 0;
			foreach ( $result['posts'] as $post ) {
				if ( ! is_array( $post ) || empty( $post['url'] ) ) {
					continue;
				}
				$grade = (string) ( $post['grade'] ?? 'A' );
				if ( in_array( $grade, array( 'C', 'D' ), true ) ) {
					if ( $weak >= 10 ) {
						continue;
					}
					$weak++;
				} elseif ( $grade === 'A' ) {
					if ( $strong >= 5 ) {
						continue;
					}
					$strong++;
				} else {
					continue;
				}
				$links[] = array(
					'label' => (string) ( $post['title'] ?? __( 'View post', 'neo-pulse-wp' ) ),
					'url'   => (string) $post['url'],
					'icon'  => 'post',
				);
			}
		}

		if ( $tool === 'analyze_content_gaps' && ! empty( $result['existing_blogs'] ) && is_array( $result['existing_blogs'] ) ) {
			$added = 0;
			foreach ( $result['existing_blogs'] as $blog ) {
				if ( ! is_array( $blog ) || empty( $blog['url'] ) ) {
					continue;
				}
				$title = trim( (string) ( $blog['title'] ?? '' ) );
				if ( $title === '' || stripos( $body, $title ) === false ) {
					continue;
				}
				$links[] = array(
					'label' => $title,
					'url'   => (string) $blog['url'],
					'icon'  => 'post',
				);
				$added++;
				if ( $added >= 15 ) {
					break;
				}
			}
		}

		return $links;
	}

	/**
	 * @param array<string, mixed> $result
	 * @return array<int, array<string, mixed>>
	 */
	private static function standard_action_links( array $result ): array {
		$links  = array();
		$status = sanitize_key( (string) ( $result['status'] ?? '' ) );
		$type   = sanitize_key( (string) ( $result['type'] ?? 'post' ) );
		$title  = trim( (string) ( $result['title'] ?? '' ) );

		if ( ! empty( $result['elementor_edit_url'] ) ) {
			$links[] = array(
				'label' => __( 'Edit in Elementor', 'neo-pulse-wp' ),
				'url'   => (string) $result['elementor_edit_url'],
				'icon'  => 'edit',
			);
		} elseif ( ! empty( $result['edit_url'] ) ) {
			$edit_label = $status === 'draft'
				? ( $type === 'page' ? __( 'Edit draft page', 'neo-pulse-wp' ) : __( 'Edit draft post', 'neo-pulse-wp' ) )
				: ( $type === 'page' ? __( 'Edit page', 'neo-pulse-wp' ) : __( 'Edit post', 'neo-pulse-wp' ) );
			$links[] = array(
				'label' => $edit_label,
				'url'   => (string) $result['edit_url'],
				'icon'  => 'edit',
			);
		}
		if ( ! empty( $result['view_url'] ) ) {
			$view_label = $status === 'publish'
				? ( $title !== '' ? $title : ( $type === 'page' ? __( 'View page', 'neo-pulse-wp' ) : __( 'View post', 'neo-pulse-wp' ) ) )
				: __( 'Preview', 'neo-pulse-wp' );
			$links[] = array(
				'label' => $view_label,
				'url'   => (string) $result['view_url'],
				'icon'  => 'preview',
			);
		}
		return $links;
	}

	/**
	 * @param array<string, mixed> $result
	 */
	private static function result_has_editor_link_pills( array $result ): bool {
		return self::is_valid_card_link_url( (string) ( $result['edit_url'] ?? '' ) )
			|| self::is_valid_card_link_url( (string) ( $result['view_url'] ?? '' ) );
	}

	/**
	 * @param array<string, mixed> $card
	 * @param array<string, mixed> $result
	 * @return array<string, mixed>
	 */
	private static function attach_primary_cta( array $card, array $result ): array {
		if (
			! empty( $card['cta'] )
			&& is_array( $card['cta'] )
			&& self::is_valid_card_link_url( (string) ( $card['cta']['url'] ?? '' ) )
		) {
			return $card;
		}

		$status = sanitize_key( (string) ( $result['status'] ?? '' ) );
		$type   = sanitize_key( (string) ( $result['type'] ?? 'post' ) );
		$edit   = trim( (string) ( $result['edit_url'] ?? '' ) );
		$view   = trim( (string) ( $result['view_url'] ?? '' ) );

		if ( $status === 'publish' && self::is_valid_card_link_url( $view ) ) {
			$card['cta'] = array(
				'label' => $type === 'page' ? __( 'View page', 'neo-pulse-wp' ) : __( 'View post', 'neo-pulse-wp' ),
				'url'   => $view,
			);
		} elseif ( self::is_valid_card_link_url( $edit ) ) {
			$card['cta'] = array(
				'label' => $status === 'draft'
					? ( $type === 'page' ? __( 'Edit draft page', 'neo-pulse-wp' ) : __( 'Edit draft post', 'neo-pulse-wp' ) )
					: __( 'Open in editor', 'neo-pulse-wp' ),
				'url'   => $edit,
			);
		} elseif ( self::is_valid_card_link_url( $view ) ) {
			$card['cta'] = array(
				'label' => __( 'View', 'neo-pulse-wp' ),
				'url'   => $view,
			);
		}

		return $card;
	}

	/**
	 * @param array<string, mixed> $card
	 * @param array<string, mixed> $result
	 * @return array<string, mixed>
	 */
	private static function ensure_body_links_to_result( array $card, array $result ): array {
		$body = trim( (string) ( $card['body'] ?? '' ) );
		if ( $body === '' ) {
			return $card;
		}

		$append = array();
		foreach ( self::standard_action_links( $result ) as $link ) {
			$url = trim( (string) ( $link['url'] ?? '' ) );
			if ( ! self::is_valid_card_link_url( $url ) || stripos( $body, $url ) !== false ) {
				continue;
			}
			$label = trim( (string) ( $link['label'] ?? __( 'Open', 'neo-pulse-wp' ) ) );
			$append[] = '[' . $label . '](' . $url . ')';
		}

		if ( ! empty( $append ) ) {
			$card['body'] = $body . "\n\n" . implode( ' · ', $append );
		}

		return $card;
	}

	/**
	 * @return array<int, array<string, mixed>>
	 */
	private static function links_from_body_inventory_refs( string $body ): array {
		if ( $body === '' ) {
			return array();
		}

		$links = array();
		if ( preg_match_all( '/\bID:(\d+)\b/i', $body, $matches ) ) {
			$ids = array_unique( array_map( 'absint', $matches[1] ) );
			foreach ( $ids as $post_id ) {
				if ( $post_id < 1 ) {
					continue;
				}
				$url = get_permalink( $post_id );
				if ( ! is_string( $url ) || ! self::is_valid_card_link_url( $url ) ) {
					continue;
				}
				$title = get_the_title( $post_id );
				$links[] = array(
					'label' => $title !== '' ? $title : sprintf( __( 'Post %d', 'neo-pulse-wp' ), $post_id ),
					'url'   => $url,
					'icon'  => 'post',
				);
			}
		}

		if ( preg_match_all( '#<(https?://[^>]+)>#i', $body, $angle_matches ) ) {
			foreach ( array_unique( $angle_matches[1] ) as $url ) {
				$url = trim( (string) $url );
				if ( ! self::is_valid_card_link_url( $url ) ) {
					continue;
				}
				$links[] = array(
					'label' => $url,
					'url'   => $url,
					'icon'  => 'external',
				);
			}
		}

		return $links;
	}
}
