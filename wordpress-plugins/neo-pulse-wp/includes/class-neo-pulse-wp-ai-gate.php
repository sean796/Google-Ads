<?php
/**
 * Eligibility checks for NEO Pulse AI editor wands.
 *
 * @package Neo_Pulse_Wp
 */

defined( 'ABSPATH' ) || exit;

class Neo_Pulse_Wp_Ai_Gate {

	/**
	 * Whether optimization usage caps block Apply. Disabled temporarily for testing.
	 */
	public static function cap_enforcement_enabled(): bool {
		$default = false;
		if ( defined( 'NEO_PULSE_WP_AI_CAP_ENFORCED' ) ) {
			$default = (bool) NEO_PULSE_WP_AI_CAP_ENFORCED;
		}
		return (bool) apply_filters( 'neo_pulse_wp_ai_cap_enforcement_enabled', $default );
	}

	/**
	 * @return array<int,string>
	 */
	public static function allowed_post_types(): array {
		$types = Neo_Pulse_Wp_Editor_Ai_Settings::post_types();
		return apply_filters( 'neo_pulse_wp_ai_allowed_post_types', $types, null );
	}

	public static function post_type_allowed( string $post_type ): bool {
		return in_array( $post_type, self::allowed_post_types(), true );
	}

	/**
	 * @return array<int,string>
	 */
	public static function collect_reasons( int $post_id = 0 ): array {
		$reasons = array();

		if ( ! Neo_Pulse_Wp_License::is_licensed( false ) ) {
			$reasons[] = __( 'This site is not licensed for NEO Pulse WP. Add or renew the licence under NEO Pulse WP → Settings.', 'neo-pulse-wp' );
		} elseif ( Neo_Pulse_Wp_License::ai_needs_upgrade( false ) ) {
			// Pro (without AI): one clear reason, not a list of setup steps that wouldn't help.
			return array( __( 'AI writing is part of NEO Pulse Pro + AI. This site is on NEO Pulse Pro, so the AI tools are switched off. Your SEO title, description and other settings can still be edited in the SEO box.', 'neo-pulse-wp' ) );
		}

		if ( Neo_Pulse_Wp_OpenRouter::get_api_key() === '' ) {
			$reasons[] = __( 'Add an OpenRouter API key under NEO Pulse WP → Settings, or in wp-config.php.', 'neo-pulse-wp' );
		}

		if ( $post_id > 0 ) {
			$post = get_post( $post_id );
			if ( ! $post instanceof WP_Post ) {
				$reasons[] = __( 'Post not found.', 'neo-pulse-wp' );
			} elseif ( ! self::post_type_allowed( $post->post_type ) ) {
				$reasons[] = __( 'The editor AI is not switched on for this content type. Turn it on under NEO Pulse → Settings → Editor AI.', 'neo-pulse-wp' );
			} elseif ( ! current_user_can( 'edit_post', $post_id ) ) {
				$reasons[] = __( 'You do not have permission to edit this post.', 'neo-pulse-wp' );
			}
		}

		return $reasons;
	}

	/**
	 * @return array<string,mixed>
	 */
	public static function get_status( int $post_id ): array {
		$reasons = self::collect_reasons( $post_id );

		// No per-client optimization package/usage exists any more, so there is no cap to report.
		$can_preview  = empty( $reasons );
		$cap_enforced = self::cap_enforcement_enabled();
		$can_apply    = $can_preview;

		$cap_notice = '';
		if ( $can_preview && ! $cap_enforced ) {
			$cap_notice = __( 'Optimization cap is temporarily disabled.', 'neo-pulse-wp' );
		}

		$permalink    = '';
		$values       = array();
		$post_status  = '';
		$slug         = '';
		$is_published = false;
		if ( $post_id > 0 ) {
			$post = get_post( $post_id );
			if ( $post instanceof WP_Post ) {
				$post_status  = (string) $post->post_status;
				$slug         = (string) $post->post_name;
				$is_published = $post_status === 'publish';
			}
			$link = get_permalink( $post_id );
			$permalink = is_string( $link ) ? $link : '';
			if ( $can_preview ) {
				$values = Neo_Pulse_Wp_Ai_Context::meta_hub_values( $post_id );
			}
		}

		return array(
			'ok'                => $can_preview,
			'canPreview'        => $can_preview,
			'canApply'          => $can_apply,
			'capEnforced'       => $cap_enforced,
			'capNotice'         => $cap_notice,
			'flowApiAvailable'  => Neo_Pulse_Wp_Ai_Backend::is_available(),
			'gscAvailable'      => Neo_Pulse_Wp_Ai_Backend::is_available(),
			'researchAvailable' => Neo_Pulse_Wp_Research_Keys::research_configured(),
			'reasons'           => $reasons,
			'needsUpgrade'      => Neo_Pulse_Wp_License::ai_needs_upgrade( false ),
			'upgradeLabel'      => __( 'Pro + AI', 'neo-pulse-wp' ),
			'package'           => '',
			'cap'               => null,
			'used'              => null,
			'remaining'         => null,
			'permalink'         => $permalink,
			'postStatus'        => $post_status,
			'slug'              => $slug,
			'isPublished'       => $is_published,
			'canManageRedirects' => current_user_can( 'manage_options' ),
			'values'            => $values,
			'allowedPostTypes'  => self::allowed_post_types(),
			'fields'            => Neo_Pulse_Wp_Ai_Fields::ALL_FIELDS,
			'fieldLabels'       => Neo_Pulse_Wp_Ai_Fields::labels(),
			'openRouterConfigured' => Neo_Pulse_Wp_OpenRouter::get_api_key() !== '',
			'bodyHarnessAvailable' => Neo_Pulse_Wp_Ai_Body::body_openrouter_configured(),
		);
	}

	public static function can_preview( int $post_id ): bool {
		$status = self::get_status( $post_id );
		return ! empty( $status['canPreview'] );
	}

	public static function can_apply( int $post_id ): bool {
		$status = self::get_status( $post_id );
		return ! empty( $status['canApply'] );
	}
}
