<?php
/**
 * Post meta planning helpers for Backend Assist content preparation.
 *
 * @package Neo_Pulse_Wp
 */

defined( 'ABSPATH' ) || exit;

trait Neo_Pulse_Wp_Backend_Assist_Pipeline_Content_Prep_Trait_Meta {

	public static function message_requests_seo_research_brief( string $message ): bool {
		$lower = strtolower( trim( $message ) );
		if ( $lower === '' ) {
			return false;
		}
		if ( self::message_clear_meta_field_hub_key( $message ) === 'seoResearch' ) {
			return false;
		}
		if ( preg_match( '/\b(?:clear|empty|remove|delete|wipe|reset|blank)\b.*\b(?:seo research|seo_research|research brief)\b/', $lower ) ) {
			return false;
		}
		if ( preg_match( '/\b(?:run|build|refresh|generate|create|do)\s+(?:the\s+)?(?:seo\s+)?research(?:\s+brief)?\b/', $lower ) ) {
			return true;
		}
		if ( preg_match( '/\bresearch brief\b/', $lower ) && ! preg_match( '/\b(?:clear|empty|remove|delete)\b/', $lower ) ) {
			return true;
		}
		if ( preg_match( '/\bseo research\b/', $lower ) && ! preg_match( '/\b(?:clear|empty|remove|delete|write|set|save)\b/', $lower ) ) {
			return true;
		}
		return (bool) preg_match( '/\bbuild brief\b/', $lower );
	}

	/**
	 * @param array<string, mixed> $params
	 * @return array<string, mixed>
	 */
	private static function prepare_run_seo_research_brief_params( string $message, array $history, array $params ): array {
		if ( empty( $params['post_id'] ) && ! empty( $params['title'] ) ) {
			Neo_Pulse_Wp_Site_Inventory::warm( true );
			$item = Neo_Pulse_Wp_Site_Inventory::find_item_by_title( sanitize_text_field( (string) $params['title'] ) );
			if ( is_array( $item ) && ! empty( $item['id'] ) ) {
				$params['post_id'] = (int) $item['id'];
			}
		}
		unset( $params['title'] );
		return $params;
	}

	public static function message_clear_meta_field_hub_key( string $message ): string {
		$lower = strtolower( trim( $message ) );
		if ( $lower === '' ) {
			return '';
		}
		if ( ! preg_match( '/\b(?:clear|empty|remove|delete|wipe|reset|blank)\b/', $lower ) ) {
			return '';
		}
		$field_map = array(
			'seo_research'    => 'seoResearch',
			'seo research'    => 'seoResearch',
			'focus_keyword'   => 'focusKeyword',
			'focus keyword'   => 'focusKeyword',
			'keyword focus'   => 'focusKeyword',
			'meta_description' => 'metaDescription',
			'meta description' => 'metaDescription',
			'seo_title'       => 'seoTitle',
			'seo title'       => 'seoTitle',
			'date_modifier'   => 'dateModifier',
			'date modifier'   => 'dateModifier',
			'faq'             => 'faq',
		);
		foreach ( $field_map as $needle => $hub_key ) {
			if ( str_contains( $lower, $needle ) ) {
				return $hub_key;
			}
		}
		return '';
	}

	private static function today_date_modifier_value(): string {
		return gmdate( 'Y-m-d' );
	}

	/**
	 * @return array{requires_em_dash: bool, min_exclamations: int}
	 */
	public static function extract_meta_copy_constraints( string $message ): array {
		$lower = strtolower( trim( $message ) );
		$requires_em_dash = str_contains( $lower, 'em dash' )
			|| str_contains( $lower, 'em-dash' )
			|| str_contains( $message, '—' );

		$min_exclamations = 0;
		if ( preg_match( '/\b(\d+)\s*exclamation/i', $message, $matches ) ) {
			$min_exclamations = max( 1, min( 5, absint( $matches[1] ) ) );
		} elseif ( preg_match( '/\b(two|2)\s*(?:of them|exclamation)/i', $lower ) || preg_match( '/!!+/', $message ) ) {
			$min_exclamations = 2;
		}

		return array(
			'requires_em_dash'  => $requires_em_dash,
			'min_exclamations'  => $min_exclamations,
		);
	}

	/**
	 * @param array{requires_em_dash?: bool, min_exclamations?: int} $constraints
	 */
	public static function meta_copy_meets_constraints( string $value, array $constraints ): bool {
		$value = trim( $value );
		if ( $value === '' ) {
			return false;
		}
		if ( ! empty( $constraints['requires_em_dash'] ) && ! str_contains( $value, '—' ) ) {
			return false;
		}
		$min = isset( $constraints['min_exclamations'] ) ? absint( $constraints['min_exclamations'] ) : 0;
		if ( $min > 0 && substr_count( $value, '!' ) < $min ) {
			return false;
		}
		return true;
	}

	/**
	 * @param array{requires_em_dash?: bool, min_exclamations?: int} $constraints
	 */
	public static function meta_copy_constraints_prompt_block( array $constraints, string $message = '' ): string {
		$is_meta_write = self::message_requests_meta_refresh( $message ) || self::message_requests_meta_only_write( $message );
		if (
			empty( $constraints['requires_em_dash'] )
			&& empty( $constraints['min_exclamations'] )
			&& ! $is_meta_write
		) {
			return '';
		}

		$lines   = array( 'USER FORMATTING REQUIREMENTS (mandatory in seoTitle AND metaDescription):' );
		if ( ! empty( $constraints['requires_em_dash'] ) ) {
			$lines[] = '- Include an em dash character (—) in both seoTitle and metaDescription.';
		}
		if ( ! empty( $constraints['min_exclamations'] ) ) {
			$lines[] = sprintf(
				'- Include at least %d exclamation mark(s) (!) in both seoTitle and metaDescription.',
				(int) $constraints['min_exclamations']
			);
		}
		if ( $is_meta_write ) {
			$lines[] = '- Output BOTH seoTitle and metaDescription with clearly new copy vs existing POST CONTEXT values.';
			$lines[] = '- Do NOT set focusKeyword unless the user explicitly asked for keyword work.';
		}

		return implode( "\n", $lines ) . "\n";
	}

	/**
	 * @return array<int, string>
	 */
	public static function fields_requested_for_meta_write( string $message ): array {
		$fields = array();
		if ( self::message_requests_meta_refresh( $message ) || self::message_requests_meta_only_write( $message ) ) {
			$fields = array( 'seoTitle', 'metaDescription' );
		}
		if ( self::message_requests_focus_keyword( $message ) ) {
			$fields[] = 'focusKeyword';
		}
		if ( self::message_requests_faq_schema( $message ) ) {
			$fields[] = 'faq';
		}
		if ( self::message_requests_seo_research_brief( $message ) ) {
			$fields[] = 'seoResearch';
		}
		if ( self::message_requests_date_modifier( $message ) ) {
			$fields[] = 'dateModifier';
		}

		return array_values( array_unique( $fields ) );
	}

	/**
	 * @param array<string, mixed> $params
	 */
	public static function meta_plan_output_valid( string $message, array $params ): bool {
		$title = trim( (string) ( $params['seoTitle'] ?? $params['seo_title'] ?? '' ) );
		$desc  = trim( (string) ( $params['metaDescription'] ?? $params['meta_description'] ?? '' ) );

		if ( self::message_requests_meta_refresh( $message ) || self::message_requests_meta_only_write( $message ) ) {
			if ( $title === '' || $desc === '' ) {
				return false;
			}
		}

		$constraints = self::extract_meta_copy_constraints( $message );
		if ( empty( $constraints['requires_em_dash'] ) && empty( $constraints['min_exclamations'] ) ) {
			return $title !== '' || $desc !== '' || self::save_post_meta_has_values( $params );
		}

		return self::meta_copy_meets_constraints( $title, $constraints )
			&& self::meta_copy_meets_constraints( $desc, $constraints );
	}

	/**
	 * @param array<string, mixed> $params
	 */
	public static function meta_plan_retry_note( string $message, array $params ): string {
		$constraints = self::extract_meta_copy_constraints( $message );
		$missing     = array();
		$title       = trim( (string) ( $params['seoTitle'] ?? $params['seo_title'] ?? '' ) );
		$desc        = trim( (string) ( $params['metaDescription'] ?? $params['meta_description'] ?? '' ) );

		if ( $title === '' ) {
			$missing[] = 'seoTitle is empty';
		}
		if ( $desc === '' ) {
			$missing[] = 'metaDescription is empty';
		}
		if ( ! empty( $constraints['requires_em_dash'] ) ) {
			if ( ! self::meta_copy_meets_constraints( $title, array( 'requires_em_dash' => true, 'min_exclamations' => 0 ) ) ) {
				$missing[] = 'seoTitle missing em dash (—)';
			}
			if ( ! self::meta_copy_meets_constraints( $desc, array( 'requires_em_dash' => true, 'min_exclamations' => 0 ) ) ) {
				$missing[] = 'metaDescription missing em dash (—)';
			}
		}
		if ( ! empty( $constraints['min_exclamations'] ) ) {
			$min_rule = array(
				'requires_em_dash' => false,
				'min_exclamations' => (int) $constraints['min_exclamations'],
			);
			if ( ! self::meta_copy_meets_constraints( $title, $min_rule ) ) {
				$missing[] = 'seoTitle missing required exclamation marks';
			}
			if ( ! self::meta_copy_meets_constraints( $desc, $min_rule ) ) {
				$missing[] = 'metaDescription missing required exclamation marks';
			}
		}

		if ( empty( $missing ) ) {
			return '';
		}

		return 'RETRY NOTE: Prior output failed validation. Fix: ' . implode( '; ', $missing ) . '.';
	}

	public static function message_requests_meta_refresh( string $message ): bool {
		$lower = strtolower( trim( $message ) );
		if ( $lower === '' ) {
			return false;
		}
		if ( ! preg_match( '/\b(meta|seo title|meta title|meta description|seo description)\b/i', $lower ) ) {
			return false;
		}
		return (bool) preg_match( '/\b(refresh|update|rewrite|regenerate|redo|new|change)\b/i', $lower );
	}

	private static function message_targets_acf_meta_fields( string $message ): bool {
		$lower = strtolower( trim( $message ) );
		if ( $lower === '' ) {
			return false;
		}
		if ( str_contains( $lower, 'acf field' ) || str_contains( $lower, 'acf fields' ) || str_contains( $lower, 'acf meta' ) ) {
			return true;
		}
		if ( preg_match( '/\b(?:for|to|in|into)\s+acf\b/', $lower ) ) {
			return true;
		}
		if ( preg_match( '/\b(?:meta|keyword|keywrod|description).{0,40}\bacf\b/', $lower ) ) {
			return true;
		}
		if ( preg_match( '/\bacf.{0,40}(?:meta|keyword|keywrod|description)\b/', $lower ) ) {
			return true;
		}
		return false;
	}

	private static function message_requests_meta_description( string $message ): bool {
		$lower = strtolower( trim( $message ) );
		return $lower !== '' && str_contains( $lower, 'meta description' );
	}

	public static function message_requests_focus_keyword( string $message ): bool {
		$lower = strtolower( trim( $message ) );
		if ( $lower === '' ) {
			return false;
		}
		if ( str_contains( $lower, 'focus keyword' ) || str_contains( $lower, 'keyword focus' ) ) {
			return true;
		}
		if ( str_contains( $lower, 'keywrod' ) || str_contains( $lower, 'a keyword' ) ) {
			return true;
		}
		return str_contains( $lower, 'keyword' )
			&& ( str_contains( $lower, 'add ' ) || str_contains( $lower, 'creat ' ) || str_contains( $lower, 'create ' ) || str_contains( $lower, 'set ' ) || str_contains( $lower, 'update ' ) );
	}

	/**
	 * @param array<string, mixed> $params
	 * @return array<string, mixed>
	 */
	private static function strip_unusable_meta_params( string $message, array $params, int $post_id = 0 ): array {
		$meta_keys = array(
			'focusKeyword',
			'focus_keyword',
			'metaDescription',
			'meta_description',
			'seoTitle',
			'seo_title',
			'seoResearch',
			'seo_research',
			'faq',
		);
		foreach ( $meta_keys as $meta_key ) {
			if ( empty( $params[ $meta_key ] ) ) {
				continue;
			}
			$value = (string) $params[ $meta_key ];
			if (
				Neo_Pulse_Wp_Ai_Seo_Limits::is_placeholder_copy( $value )
				|| self::copy_value_needs_planning( $value, $message )
				|| ( $post_id > 0 && Neo_Pulse_Wp_Ai_Seo_Limits::meta_copy_drifts_from_post( $value, $post_id ) )
			) {
				unset( $params[ $meta_key ] );
			}
		}
		return $params;
	}

	/**
	 * @param array<string, mixed> $params
	 * @return bool
	 */
	private static function save_post_meta_has_values( array $params ): bool {
		if ( ! empty( $params['clearFields'] ) && is_array( $params['clearFields'] ) ) {
			return true;
		}
		foreach ( array( 'focusKeyword', 'focus_keyword', 'metaDescription', 'meta_description', 'seoTitle', 'seo_title', 'faq', 'seoResearch', 'seo_research', 'dateModifier', 'date_modifier' ) as $meta_key ) {
			if ( ! empty( $params[ $meta_key ] ) ) {
				return true;
			}
		}
		return false;
	}

	/**
	 * @param array<string, mixed> $params
	 * @return array<string, mixed>
	 */
	private static function prepare_save_post_meta_params( string $message, array $history, array $params ): array {
		if ( empty( $params['post_id'] ) && ! empty( $params['title'] ) ) {
			Neo_Pulse_Wp_Site_Inventory::warm( true );
			$item = Neo_Pulse_Wp_Site_Inventory::find_item_by_title( sanitize_text_field( (string) $params['title'] ) );
			if ( is_array( $item ) && ! empty( $item['id'] ) ) {
				$params['post_id'] = (int) $item['id'];
			}
		}

		$post_id = isset( $params['post_id'] ) ? absint( $params['post_id'] ) : 0;

		$clear_hub = self::message_clear_meta_field_hub_key( $message );
		if ( $clear_hub !== '' && $post_id > 0 ) {
			$params['clearFields'] = array( $clear_hub );
		}

		if ( self::message_requests_date_modifier( $message ) && $post_id > 0 ) {
			$params['dateModifier'] = self::today_date_modifier_value();
		}

		if ( self::message_targets_acf_meta_fields( $message ) ) {
			foreach ( array( 'focusKeyword', 'focus_keyword', 'metaDescription', 'meta_description', 'seoTitle', 'seo_title', 'seoResearch', 'seo_research' ) as $meta_key ) {
				unset( $params[ $meta_key ] );
			}
		}

		$params     = self::strip_unusable_meta_params( $message, $params, $post_id );
		$has_values = self::save_post_meta_has_values( $params );

		if ( empty( $params['faq'] ) && self::message_requests_faq_schema( $message ) && $post_id > 0 ) {
			$generated = self::generate_faq_schema_for_meta( $post_id, $message, $history );
			if ( ! is_wp_error( $generated ) && $generated !== '' ) {
				$params['faq'] = $generated;
				$has_values    = true;
			}
		}

		if ( ! $has_values ) {
			$params = self::plan_save_post_meta_params( $message, $history, $params );
		} else {
			$params = self::finalize_save_post_meta_params( $message, $params );
		}

		if ( empty( $params['faq'] ) && self::message_requests_faq_schema( $message ) && $post_id > 0 ) {
			$generated = self::generate_faq_schema_for_meta( $post_id, $message, $history );
			if ( ! is_wp_error( $generated ) && $generated !== '' ) {
				$params['faq'] = $generated;
			}
		}

		return $params;
	}

	/**
	 * @param array<string, mixed> $params
	 * @return array<string, mixed>
	 */
	private static function plan_save_post_meta_params( string $message, array $history, array $params ): array {
		$constraints  = self::extract_meta_copy_constraints( $message );
		$plan_options = array(
			'meta_constraints' => $constraints,
			'meta_only_write'  => self::message_requests_meta_only_write( $message ),
		);

		$plan   = Neo_Pulse_Wp_Backend_Assist_Pipeline_Phases::phase_plan( $message, $history, 'save_post_meta', $params, $plan_options );
		$params = is_array( $plan['params'] ) ? array_merge( $params, $plan['params'] ) : $params;
		$post_id = isset( $params['post_id'] ) ? absint( $params['post_id'] ) : 0;
		$params  = self::strip_unusable_meta_params( $message, $params, $post_id );
		$params  = self::finalize_save_post_meta_params( $message, $params );

		if ( ! self::meta_plan_output_valid( $message, $params ) ) {
			$retry_note = self::meta_plan_retry_note( $message, $params );
			if ( $retry_note !== '' ) {
				$retry_plan = Neo_Pulse_Wp_Backend_Assist_Pipeline_Phases::phase_plan(
					$message . "\n\n" . $retry_note,
					$history,
					'save_post_meta',
					$params,
					$plan_options
				);
				$params = is_array( $retry_plan['params'] ) ? array_merge( $params, $retry_plan['params'] ) : $params;
				$params = self::strip_unusable_meta_params( $message, $params, $post_id );
				$params = self::finalize_save_post_meta_params( $message, $params );
			}
		}

		if ( ! self::meta_plan_output_valid( $message, $params ) ) {
			$params['_meta_constraint_warning'] = __( 'Saved meta may not include all requested formatting (em dash or exclamation marks).', 'neo-pulse-wp' );
		}

		return $params;
	}

	/**
	 * @param array<string, mixed> $params
	 * @return array<string, mixed>
	 */
	private static function finalize_save_post_meta_params( string $message, array $params ): array {
		$post_id = isset( $params['post_id'] ) ? absint( $params['post_id'] ) : 0;

		if ( self::message_requests_meta_only_write( $message ) && ! self::message_requests_focus_keyword( $message ) ) {
			unset( $params['focusKeyword'], $params['focus_keyword'] );
		}

		if ( self::message_requests_meta_only_write( $message ) ) {
			$params['seo_title_only'] = true;
		}

		if (
			$post_id > 0
			&& ( self::message_requests_focus_keyword( $message ) || self::message_targets_acf_meta_fields( $message ) )
			&& empty( $params['focusKeyword'] )
			&& empty( $params['focus_keyword'] )
		) {
			$inferred = Neo_Pulse_Wp_Ai_Seo_Limits::infer_focus_keyword_from_post( $post_id );
			if ( $inferred !== '' ) {
				$params['focusKeyword'] = $inferred;
			}
		}

		return $params;
	}
}
