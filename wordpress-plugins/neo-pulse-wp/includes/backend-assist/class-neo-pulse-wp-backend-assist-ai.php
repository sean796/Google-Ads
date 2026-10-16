<?php
/**
 * Backend Assist — OpenRouter calls and JSON parsing
 *
 * @package Neo_Pulse_Wp
 */

defined( 'ABSPATH' ) || exit;

class Neo_Pulse_Wp_Backend_Assist_Ai {

	/**
	 * @param array<string, mixed> $extra Extra request body fields (e.g. response_format).
	 * @return string|WP_Error
	 */
	public static function call_openrouter( string $model, string $system_prompt, string $user_prompt, int $max_tokens = 1024, float $temperature = 0.3, array $extra = array() ) {
		return Neo_Pulse_Wp_OpenRouter::complete( $system_prompt, $user_prompt, $max_tokens, $temperature, $model, $extra );
	}

	/**
	 * Parse a JSON object/array from model output: strips ``` fences, then falls back to the
	 * first {...} span. Single helper for Backend Assist and the content harness.
	 *
	 * @return array<mixed>|null
	 */
	public static function parse_json( string $text ): ?array {
		$text = trim( $text );
		$text = (string) preg_replace( '/^```(?:json)?\s*/i', '', $text );
		$text = (string) preg_replace( '/\s*```\s*$/', '', $text );
		$text = trim( $text );

		$decoded = json_decode( $text, true );
		if ( is_array( $decoded ) ) {
			return $decoded;
		}
		if ( preg_match( '/\{[\s\S]*\}/', $text, $m ) ) {
			$decoded = json_decode( $m[0], true );
			return is_array( $decoded ) ? $decoded : null;
		}
		return null;
	}

	/**
	 * @return array<mixed>|null
	 */
	public static function parse_json_response( string $text ): ?array {
		return self::parse_json( $text );
	}
	public static function build_site_context(): string {
		$lines   = array();
		$lines[] = 'Site: ' . get_bloginfo( 'name' );
		$lines[] = 'URL: ' . home_url( '/' );
		$lines[] = 'WordPress: ' . get_bloginfo( 'version' );
		$lines[] = 'Theme: ' . wp_get_theme()->get( 'Name' );

		$post_types = get_post_types( array( 'public' => true ), 'objects' );
		$pt_names   = array();
		foreach ( $post_types as $pt ) {
			if ( $pt->name === 'attachment' ) {
				continue;
			}
			$count      = wp_count_posts( $pt->name );
			$published  = isset( $count->publish ) ? (int) $count->publish : 0;
			$drafts     = isset( $count->draft ) ? (int) $count->draft : 0;
			$pt_names[] = "{$pt->labels->singular_name} ({$pt->name}): {$published} published, {$drafts} drafts";
		}
		$lines[] = 'Content types: ' . implode( '; ', $pt_names );

		return implode( "\n", $lines );
	}
}
