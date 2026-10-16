<?php
/**
 * Backend Assist — tool registry and default tool registration
 *
 * @package Neo_Pulse_Wp
 */

defined( 'ABSPATH' ) || exit;

class Neo_Pulse_Wp_Backend_Assist_Registry {

	public static function register_tool( string $tool_name, callable $handler, string $description = '' ): void {
		Neo_Pulse_Wp_Backend_Assist_Context::$tool_registry[ $tool_name ] = array(
			'handler'     => $handler,
			'description' => $description,
		);
	}
	public static function get_tool_descriptions(): string {
		$lines = array();
		foreach ( Neo_Pulse_Wp_Backend_Assist_Context::$tool_registry as $name => $entry ) {
			$lines[] = "- \"{$name}\": {$entry['description']}";
		}
		return implode( "\n", $lines );
	}
	public static function register_default_tools(): void {
		foreach ( Neo_Pulse_Wp_Tools::backend_assist_tool_names() as $ba_name ) {
			$entry = Neo_Pulse_Wp_Tools::get_backend_assist_entry( $ba_name );
			if ( $entry && is_callable( $entry['handler'] ) ) {
				self::register_tool( $ba_name, $entry['handler'], $entry['description'] );
			}
		}

		self::register_tool(
			'get_gsc_context',
			array( 'Neo_Pulse_Wp_Backend_Assist', 'tool_get_gsc_context' ),
			'Fetch Google Search Console keyword/query data for a post or the whole site (read-only)'
		);

		self::register_tool(
			'save_post_meta',
			array( 'Neo_Pulse_Wp_Backend_Assist', 'tool_save_post_meta' ),
			'Save SEO meta on an existing post or page: focusKeyword, metaDescription, seoTitle, faq, seoResearch, dateModifier (ACF date_modifier). Clear a field with clear/empty/remove phrasing. Requires post_id or title.'
		);

		self::register_tool(
			'run_seo_research_brief',
			array( 'Neo_Pulse_Wp_Backend_Assist', 'tool_run_seo_research_brief' ),
			'Build SeoContentBriefV1 JSON from DataForSEO SERP + GSC page queries + Semrush and auto-save to ACF seo_research. Requires post_id and focus keyword on the post.'
		);

		self::register_tool(
			'update_post',
			array( 'Neo_Pulse_Wp_Backend_Assist', 'tool_update_post' ),
			'Update WordPress post fields on an existing post or page: title (post_title), status, excerpt, slug. NOT body HTML. NOT SEO meta. Requires post_id.'
		);

		self::register_tool(
			'restore_post_revision',
			array( 'Neo_Pulse_Wp_Backend_Assist', 'tool_restore_post_revision' ),
			'Undo the last agent body edit on a post by restoring the pre-edit snapshot. Requires post_id.'
		);

		self::register_tool(
			'compose_elementor_page_sections',
			array( 'Neo_Pulse_Wp_Backend_Assist_Tools_Elementor_Sections', 'tool_compose_elementor_page_sections' ),
			'Generate H2 section copy for native Elementor widgets. Used when building a new page.'
		);

		self::register_tool(
			'design_page_with_novamira',
			array( 'Neo_Pulse_Wp_Backend_Assist', 'tool_design_page_with_novamira' ),
			'Design a new Elementor page with Novamira tokens and the homepage pattern from composed Elementor sections. Requires post_id. Publishes the page.'
		);

		Neo_Pulse_Wp_Backend_Assist_Tools_Analytics::register_tools();
	}
}
