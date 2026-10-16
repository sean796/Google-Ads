<?php
/**
 * Backend Assist — expand create-page/post packs and heading outlines
 *
 * @package Neo_Pulse_Wp
 */

defined( 'ABSPATH' ) || exit;

class Neo_Pulse_Wp_Backend_Assist_Workflow_Expand {

	/**
	 * Expand a create-only (or create-without-meta/content) decompose into the full page/post pack.
	 *
	 * @param array<string, mixed> $decomposed
	 * @param array<string, mixed> $classification
	 * @return array<string, mixed>
	 */
	public static function expand_create_to_full_page( array $decomposed, string $message, array $classification = array() ): array {
		$steps = isset( $decomposed['steps'] ) && is_array( $decomposed['steps'] ) ? $decomposed['steps'] : array();
		$tools = self::decomposed_tool_names( $steps );

		$create_tool = '';
		if ( in_array( 'create_page', $tools, true ) ) {
			$create_tool = 'create_page';
		} elseif ( in_array( 'create_post', $tools, true ) ) {
			$create_tool = 'create_post';
		} else {
			$classified = isset( $classification['tool'] ) ? sanitize_key( (string) $classification['tool'] ) : '';
			if ( in_array( $classified, array( 'create_page', 'create_post' ), true ) ) {
				$create_tool = $classified;
			}
		}

		if ( $create_tool === '' ) {
			return $decomposed;
		}

		$create_params = self::first_step_params( $steps, $create_tool );
		$class_params  = isset( $classification['params'] ) && is_array( $classification['params'] ) ? $classification['params'] : array();
		$from_message  = Neo_Pulse_Wp_Backend_Assist_Pipeline_Content_Prep::create_page_title_from_message( $message, $classification );
		$title         = '';
		if ( ! empty( $create_params['title'] ) ) {
			$title = sanitize_text_field( (string) $create_params['title'] );
		} elseif ( ! empty( $class_params['title'] ) ) {
			$title = sanitize_text_field( (string) $class_params['title'] );
		} elseif ( $from_message['title'] !== '' ) {
			$title = $from_message['title'];
		}

		$keyword = '';
		if ( ! empty( $create_params['focus_keyword'] ) ) {
			$keyword = sanitize_text_field( (string) $create_params['focus_keyword'] );
		} elseif ( ! empty( $class_params['focus_keyword'] ) ) {
			$keyword = sanitize_text_field( (string) $class_params['focus_keyword'] );
		} elseif ( ! empty( $class_params['focusKeyword'] ) ) {
			$keyword = sanitize_text_field( (string) $class_params['focusKeyword'] );
		} elseif ( $from_message['keyword'] !== '' ) {
			$keyword = $from_message['keyword'];
		}

		if ( $title === '' && $keyword !== '' ) {
			$title = $keyword;
		}
		if ( $title === '' ) {
			return $decomposed;
		}

		$has_create  = in_array( $create_tool, $tools, true );
		$has_meta    = in_array( 'save_post_meta', $tools, true );
		$has_content = self::decomposed_has_content_steps( $tools );

		if ( $has_create && $has_meta && $has_content ) {
			$decomposed['workflow'] = true;
			$decomposed['steps']    = self::finish_create_page_steps( $steps, $create_tool );
			return $decomposed;
		}

		$out = array();
		if ( ! $has_create ) {
			$create_step_params = array( 'title' => $title );
			if ( $keyword !== '' ) {
				$create_step_params['focus_keyword'] = $keyword;
			}
			$out[] = array(
				'tool'   => $create_tool,
				'label'  => ( $create_tool === 'create_page' ? 'Create page ' : 'Create post ' ) . $title,
				'params' => $create_step_params,
			);
		}

		foreach ( $steps as $step ) {
			if ( ! is_array( $step ) || empty( $step['tool'] ) ) {
				continue;
			}
			$out[] = $step;
			if ( sanitize_key( (string) $step['tool'] ) === $create_tool && ! $has_meta ) {
				$out[]     = self::full_page_meta_step( $keyword );
				$has_meta = true;
			}
		}

		if ( ! $has_meta ) {
			$out      = self::insert_meta_after_create( $out, $create_tool, $keyword );
			$has_meta = true;
		}

		if ( ! $has_content ) {
			if ( $create_tool === 'create_page' ) {
				$prompt = $title;
				if ( $keyword !== '' ) {
					$prompt .= '. Focus keyword ' . $keyword . '.';
				}
				$out[] = self::compose_elementor_step(
					'Compose Elementor sections for ' . $title,
					array( 'prompt' => $prompt )
				);
				$out[] = self::design_step();
			} else {
				$brief = 'Write full post body for ' . $title . '.';
				if ( $keyword !== '' ) {
					$brief .= ' Focus keyword ' . $keyword . '.';
				}
				$out[] = array(
					'tool'   => 'add_content',
					'label'  => 'Add post body',
					'params' => array(
						'mode'            => 'replace',
						'expand_sections' => true,
						'content_brief'   => $brief,
					),
				);
			}
		}

		$decomposed['workflow'] = true;
		$decomposed['steps']    = self::finish_create_page_steps( $out, $create_tool );
		if ( empty( $decomposed['title'] ) ) {
			$decomposed['title'] = ( $create_tool === 'create_page' ? 'Create page ' : 'Create post ' ) . $title;
		}
		return $decomposed;
	}

	/**
	 * @param array<int, mixed> $steps
	 * @return array<int, string>
	 */
	private static function decomposed_tool_names( array $steps ): array {
		$tools = array();
		foreach ( $steps as $step ) {
			if ( is_array( $step ) && ! empty( $step['tool'] ) ) {
				$tools[] = sanitize_key( (string) $step['tool'] );
			}
		}
		return $tools;
	}

	/**
	 * @param array<int, mixed> $steps
	 * @return array<string, mixed>
	 */
	private static function first_step_params( array $steps, string $tool ): array {
		foreach ( $steps as $step ) {
			if ( ! is_array( $step ) || sanitize_key( (string) ( $step['tool'] ?? '' ) ) !== $tool ) {
				continue;
			}
			return isset( $step['params'] ) && is_array( $step['params'] ) ? $step['params'] : array();
		}
		return array();
	}

	/**
	 * @param array<int, string> $tools
	 */
	private static function decomposed_has_content_steps( array $tools ): bool {
		foreach ( array( 'add_content', 'compose_elementor_page_sections', 'design_page_with_novamira' ) as $tool ) {
			if ( in_array( $tool, $tools, true ) ) {
				return true;
			}
		}
		return false;
	}

	/**
	 * @return array<string, mixed>
	 */
	private static function full_page_meta_step( string $keyword ): array {
		$params = array();
		if ( $keyword !== '' ) {
			$params['focusKeyword'] = $keyword;
		}
		return array(
			'tool'   => 'save_post_meta',
			'label'  => 'Save SEO meta',
			'params' => $params,
		);
	}

	/**
	 * @param array<int, mixed> $steps
	 * @return array<int, mixed>
	 */
	private static function clear_create_pack_post_ids( array $steps ): array {
		$out = array();
		foreach ( $steps as $step ) {
			if ( ! is_array( $step ) ) {
				continue;
			}
			$tool = sanitize_key( (string) ( $step['tool'] ?? '' ) );
			if ( in_array( $tool, array( 'save_post_meta', 'design_page_with_novamira', 'add_content' ), true ) ) {
				if ( isset( $step['params'] ) && is_array( $step['params'] ) ) {
					unset( $step['params']['post_id'] );
				}
			}
			$out[] = $step;
		}
		return $out;
	}

	/**
	 * @param array<int, mixed> $steps
	 * @return array<int, mixed>
	 */
	private static function insert_meta_after_create( array $steps, string $create_tool, string $keyword ): array {
		$out  = array();
		$done = false;
		foreach ( $steps as $step ) {
			$out[] = $step;
			if ( $done || ! is_array( $step ) ) {
				continue;
			}
			if ( sanitize_key( (string) ( $step['tool'] ?? '' ) ) === $create_tool ) {
				$out[] = self::full_page_meta_step( $keyword );
				$done  = true;
			}
		}
		if ( ! $done ) {
			array_unshift( $out, self::full_page_meta_step( $keyword ) );
		}
		return $out;
	}

	/**
	 * @param array<int, mixed> $steps
	 * @return array<int, mixed>
	 */
	private static function finish_create_page_steps( array $steps, string $create_tool ): array {
		$steps = self::clear_create_pack_post_ids( $steps );
		if ( $create_tool !== 'create_page' ) {
			return $steps;
		}
		$out         = array();
		$has_design  = false;
		foreach ( $steps as $step ) {
			if ( ! is_array( $step ) ) {
				continue;
			}
			$tool = sanitize_key( (string) ( $step['tool'] ?? '' ) );
			if ( $tool === 'design_page_with_novamira' ) {
				if ( $has_design ) {
					continue;
				}
				$has_design = true;
			}
			$out[] = $step;
		}
		if ( ! $has_design ) {
			$out[] = self::design_step();
		}
		return $out;
	}

	/**
	 * @return array<string, mixed>
	 */
	private static function design_step(): array {
		return array(
			'tool'   => 'design_page_with_novamira',
			'label'  => 'Design page with Novamira',
			'params' => array( 'content_mode' => 'elementor_widgets' ),
		);
	}

	/**
	 * @param array<string, mixed> $params
	 * @return array<string, mixed>
	 */
	private static function compose_elementor_step( string $label, array $params ): array {
		return array(
			'tool'   => 'compose_elementor_page_sections',
			'label'  => $label,
			'params' => $params,
		);
	}

}
