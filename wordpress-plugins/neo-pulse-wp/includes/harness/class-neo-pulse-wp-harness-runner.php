<?php
/**
 * Per-section harness OpenRouter generation.
 *
 * @package Neo_Pulse_Wp
 */

defined( 'ABSPATH' ) || exit;

class Neo_Pulse_Wp_Harness_Runner {

	/**
	 * @param array<string,mixed>              $session
	 * @param int                              $section_index
	 * @param array<string,mixed>              $ctx
	 * @return array{html:string,truncated:bool,title:string}|WP_Error
	 */
	public static function preview_section( array $session, int $section_index, array $ctx ) {
		$outline = isset( $session['outline'] ) && is_array( $session['outline'] ) ? $session['outline'] : array();
		if ( ! isset( $outline[ $section_index ] ) || ! is_array( $outline[ $section_index ] ) ) {
			return new WP_Error( 'neo-pulse_body_section', __( 'Invalid section index.', 'neo-pulse-wp' ) );
		}
		$row          = $outline[ $section_index ];
		$agent        = isset( $row['agent'] ) && is_array( $row['agent'] ) ? $row['agent'] : array();
		$display      = isset( $row['displayTitle'] ) ? (string) $row['displayTitle'] : '';
		$total        = count( $outline );
		$other_titles = array();
		foreach ( $outline as $i => $o ) {
			if ( (int) $i === $section_index || ! is_array( $o ) ) {
				continue;
			}
			$other_titles[] = isset( $o['displayTitle'] ) ? (string) $o['displayTitle'] : '';
		}

		$blueprint = isset( $session['blueprint'] ) && is_array( $session['blueprint'] ) ? $session['blueprint'] : array();
		$flow_title   = isset( $blueprint['title'] ) ? (string) $blueprint['title'] : ( isset( $ctx['title'] ) ? (string) $ctx['title'] : '' );
		$flow_purpose = isset( $blueprint['purpose'] ) ? (string) $blueprint['purpose'] : '';

		$acf_parts = array();
		if ( ! empty( $ctx['focusKeyword'] ) ) {
			$acf_parts[] = 'Keyword focus: ' . $ctx['focusKeyword'];
		}
		if ( ! empty( $ctx['seoResearch'] ) ) {
			$acf_parts[] = "SEO content brief (ACF seo_research - parse for intent, do not paste verbatim):\n" . substr( (string) $ctx['seoResearch'], 0, 24000 );
		}
		$acf_block = $acf_parts ? "\n=== ACF ===\n" . implode( "\n", $acf_parts ) . "\n=== END ACF ===\n" : '';

		$gsc_block = '';
		if ( ! empty( $ctx['gscKeywordsContext'] ) ) {
			$gsc_block = "\n=== SEARCH CONSOLE QUERIES ===\n" . (string) $ctx['gscKeywordsContext'] . "\n=== END ===\n";
		}

		$posts_block = '';
		if ( ! empty( $ctx['posts'] ) && is_array( $ctx['posts'] ) ) {
			$posts_block = Neo_Pulse_Wp_Harness_Prompts::wordpress_posts_block(
				$ctx['posts'],
				isset( $ctx['siteName'] ) ? (string) $ctx['siteName'] : ''
			);
		}

		$system = Neo_Pulse_Wp_Harness_Prompts::harness_system_prompt(
			array(
				'siteName'        => isset( $ctx['siteName'] ) ? (string) $ctx['siteName'] : '',
				'siteUrl'         => isset( $ctx['siteUrl'] ) ? (string) $ctx['siteUrl'] : '',
				'primaryKeyword'  => isset( $ctx['focusKeyword'] ) ? (string) $ctx['focusKeyword'] : '',
				'postsBlock'      => $posts_block,
			)
		);

		$user = Neo_Pulse_Wp_Harness_Prompts::harness_section_user_prompt(
			array(
				'flowTitle'           => $flow_title,
				'flowPurpose'         => $flow_purpose,
				'singleSectionPrompt' => Neo_Pulse_Wp_Harness_Prompts::single_section_prompt( $agent, 'html' ),
				'outlineBlock'        => Neo_Pulse_Wp_Harness_Prompts::format_outline_for_prompt( $outline ),
				'otherSectionTitles'  => $other_titles,
				'sectionIndex'        => $section_index,
				'totalSections'       => $total,
				'acfBlock'            => $acf_block,
				'gscBlock'            => $gsc_block,
				'hasWordPressPosts'   => ! empty( $ctx['posts'] ),
			)
		);

		$per_section = (int) min( 1400, max( 640, (int) floor( 16000 / max( $total, 1 ) ) ) );
		$result      = Neo_Pulse_Wp_OpenRouter::complete_chat( $system, $user, $per_section, 1.0 );
		if ( is_wp_error( $result ) ) {
			return $result;
		}

		$html = Neo_Pulse_Wp_Harness_Outline::strip_footer_from_section_html( (string) $result['content'] );
		if ( $html === '' ) {
			return new WP_Error( 'neo-pulse_body_empty', __( 'Harness returned empty section HTML.', 'neo-pulse-wp' ) );
		}

		$html = self::maybe_length_compliance( $html, $display, $other_titles, $flow_title );

		$truncated = isset( $result['finish_reason'] ) && 'length' === (string) $result['finish_reason'];

		return array(
			'html'      => $html,
			'truncated' => $truncated,
			'title'     => $display,
		);
	}

	/**
	 * @param array<int,string> $siblings
	 */
	private static function maybe_length_compliance( string $html, string $section_title, array $siblings, string $article_title ): string {
		$raw = Neo_Pulse_Wp_OpenRouter::complete(
			Neo_Pulse_Wp_Harness_Prompts::length_compliance_system(),
			Neo_Pulse_Wp_Harness_Prompts::length_compliance_user( $html, $section_title, $siblings, $article_title ),
			2048,
			0.3
		);
		if ( is_wp_error( $raw ) ) {
			return $html;
		}
		if ( ! class_exists( 'Neo_Pulse_Wp_Backend_Assist_Ai', false ) ) {
			require_once NEO_PULSE_WP_PLUGIN_DIR . 'includes/backend-assist/class-neo-pulse-wp-backend-assist-ai.php';
		}
		$data = Neo_Pulse_Wp_Backend_Assist_Ai::parse_json( (string) $raw );
		if ( is_array( $data ) && ! empty( $data['section_html'] ) && is_string( $data['section_html'] ) ) {
			return Neo_Pulse_Wp_Harness_Outline::strip_footer_from_section_html( $data['section_html'] );
		}
		return $html;
	}
}
