<?php
/**
 * Eligibility checks for Image SEO (OpenRouter only, no NEO Pulse API).
 *
 * @package Neo_Pulse_Wp
 */

defined( 'ABSPATH' ) || exit;

class Neo_Pulse_Wp_Image_Seo_Gate {

	/**
	 * @return array<int,string>
	 */
	public static function collect_reasons( int $post_id = 0, bool $require_ai = false ): array {
		$reasons = array();

		if ( Neo_Pulse_Wp_Image_Seo::$system_run ) {
			// Automatic fill on upload or in the background: no person to check.
		} elseif ( $post_id > 0 ) {
			if ( ! current_user_can( 'edit_post', $post_id ) ) {
				$reasons[] = __( 'You do not have permission to edit this post.', 'neo-pulse-wp' );
			}
		} elseif ( ! current_user_can( 'upload_files' ) ) {
			$reasons[] = __( 'You do not have permission to manage media.', 'neo-pulse-wp' );
		}

		if ( $require_ai && Neo_Pulse_Wp_License::ai_needs_upgrade( false ) ) {
			$reasons[] = Neo_Pulse_Wp_License::upgrade_message();
		} elseif ( $require_ai && Neo_Pulse_Wp_OpenRouter::get_api_key() === '' ) {
			$reasons[] = __( 'Add an OpenRouter API key under NEO Pulse WP → Settings → Editor AI.', 'neo-pulse-wp' );
		}

		return $reasons;
	}

	/**
	 * @return array<string,mixed>
	 */
	public static function get_status(): array {
		$reasons = self::collect_reasons( 0, false );
		$ai_ok   = Neo_Pulse_Wp_OpenRouter::get_api_key() !== '';

		return array(
			'ok'                   => empty( $reasons ),
			'openRouterConfigured' => $ai_ok,
			'config'               => Neo_Pulse_Wp_Image_Seo::get_config(),
			'reasons'              => $reasons,
			'aiReasons'            => self::collect_reasons( 0, true ),
		);
	}

	public static function can_list(): bool {
		return empty( self::collect_reasons( 0, false ) );
	}

	public static function can_ai( int $post_id = 0 ): bool {
		return empty( self::collect_reasons( $post_id, true ) );
	}

	/**
	 * @param int $attachment_id
	 * @param int $post_id
	 * @return bool|\WP_Error
	 */
	public static function can_edit_attachment( int $attachment_id, int $post_id = 0 ) {
		if ( $attachment_id < 1 ) {
			return new WP_Error( 'neo-pulse_attachment', __( 'Invalid attachment.', 'neo-pulse-wp' ) );
		}
		$post = get_post( $attachment_id );
		if ( ! $post instanceof WP_Post || $post->post_type !== 'attachment' ) {
			return new WP_Error( 'neo-pulse_attachment', __( 'Attachment not found.', 'neo-pulse-wp' ) );
		}
		if ( Neo_Pulse_Wp_Image_Seo::$system_run ) {
			return true;
		}
		if ( ! current_user_can( 'edit_post', $attachment_id ) ) {
			return new WP_Error( 'neo-pulse_forbidden', __( 'You do not have permission to edit this attachment.', 'neo-pulse-wp' ), array( 'status' => 403 ) );
		}
		if ( $post_id > 0 && ! current_user_can( 'edit_post', $post_id ) ) {
			return new WP_Error( 'neo-pulse_forbidden', __( 'You do not have permission to edit this post.', 'neo-pulse-wp' ), array( 'status' => 403 ) );
		}
		return true;
	}
}
