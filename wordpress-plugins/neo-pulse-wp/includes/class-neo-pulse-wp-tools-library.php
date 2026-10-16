<?php
/**
 * Human-readable tool dictionary for admin Tool Library UI.
 *
 * @package Neo_Pulse_Wp
 */

defined( 'ABSPATH' ) || exit;

class Neo_Pulse_Wp_Tools_Library {

	/**
	 * @return array<string, string>
	 */
	public static function get_categories(): array {
		return array(
			'connection'  => __( 'Connection & site', 'neo-pulse-wp' ),
			'posts'       => __( 'Posts & pages', 'neo-pulse-wp' ),
			'editor_ai'   => __( 'Editor AI wands', 'neo-pulse-wp' ),
			'body'        => __( 'Body harness', 'neo-pulse-wp' ),
			'image_seo'   => __( 'Image SEO', 'neo-pulse-wp' ),
			'site'        => __( 'Schema & sitemap', 'neo-pulse-wp' ),
			'redirects'   => __( 'Redirects', 'neo-pulse-wp' ),
			'scripts'     => __( 'Script Manager', 'neo-pulse-wp' ),
			'gmb'         => __( 'Google Business Profile', 'neo-pulse-wp' ),
			'assist'      => __( 'Backend Assist', 'neo-pulse-wp' ),
			'safety'      => __( 'Audit & safety', 'neo-pulse-wp' ),
		);
	}

	/**
	 * @param string $tool_name Tool name.
	 * @return string Category slug.
	 */
	public static function category_for_tool( string $tool_name ): string {
		if ( strpos( $tool_name, 'wp_ai_' ) === 0 ) {
			return 'editor_ai';
		}
		if ( strpos( $tool_name, 'wp_body_' ) === 0 ) {
			return 'body';
		}
		if ( strpos( $tool_name, 'wp_image_seo_' ) === 0 ) {
			return 'image_seo';
		}
		if ( strpos( $tool_name, 'wp_sitemap_' ) === 0 ) {
			return 'site';
		}
		if ( strpos( $tool_name, 'wp_redirects_' ) === 0 ) {
			return 'redirects';
		}
		if ( strpos( $tool_name, 'wp_scripts_' ) === 0 ) {
			return 'scripts';
		}
		if ( strpos( $tool_name, 'wp_gmb_' ) === 0 ) {
			return 'gmb';
		}
		if ( strpos( $tool_name, 'wp_assist_' ) === 0 ) {
			return 'assist';
		}
		if ( in_array( $tool_name, array( 'wp_audit_list', 'wp_revision_restore' ), true ) ) {
			return 'safety';
		}
		if ( in_array( $tool_name, array( 'wp_ping', 'wp_whoami', 'wp_site_dashboard', 'wp_site_index', 'wp_site_index_search', 'wp_openrouter_status', 'wp_chat_settings_get', 'wp_chat_settings_update' ), true ) ) {
			return 'connection';
		}
		return 'posts';
	}

	/**
	 * Extended dictionary entries keyed by tool name.
	 *
	 * @return array<string, array{summary: string, params: array<string, string>, example?: string}>
	 */
	private static function dictionary(): array {
		return array(
			'wp_ping'                    => array(
				'summary' => __( 'Verifies NEO Pulse WP is installed and returns the plugin version. Use before any other tool.', 'neo-pulse-wp' ),
				'params'  => array(),
				'example' => '{}',
			),
			'wp_whoami'                  => array(
				'summary' => __( 'Returns the authenticated WordPress user, roles, and key capabilities for the Application Password in use.', 'neo-pulse-wp' ),
				'params'  => array(),
			),
			'wp_site_dashboard'          => array(
				'summary' => __( 'Loads paired NEO Pulse property metrics: post bank, SAP bank, optimization usage, and editorial period counts.', 'neo-pulse-wp' ),
				'params'  => array(),
			),
			'wp_site_index'              => array(
				'summary' => __( 'Builds a site graph of posts/pages with URL, focus keyword, and seo_research presence. Optional drafts.', 'neo-pulse-wp' ),
				'params'  => array(
					'include_drafts' => __( 'Include draft and pending posts.', 'neo-pulse-wp' ),
					'limit'          => __( 'Max items returned (default 500).', 'neo-pulse-wp' ),
				),
			),
			'wp_site_index_search'       => array(
				'summary' => __( 'Keyword search over the site index; ranks by title, excerpt, categories, and focus keyword.', 'neo-pulse-wp' ),
				'params'  => array(
					'query' => __( 'Search query string.', 'neo-pulse-wp' ),
					'limit' => __( 'Max results (default 8).', 'neo-pulse-wp' ),
				),
			),
			'wp_openrouter_status'       => array(
				'summary' => __( 'Reports whether OpenRouter is configured on this site. Does not return the API key.', 'neo-pulse-wp' ),
				'params'  => array(),
			),
			'wp_chat_settings_get'       => array(
				'summary' => __( 'Returns Flow Assist chat widget enabled and logged-in-only flags.', 'neo-pulse-wp' ),
				'params'  => array(),
			),
			'wp_chat_settings_update'    => array(
				'summary' => __( 'Updates Flow Assist chat widget enabled and/or logged-in-only visibility.', 'neo-pulse-wp' ),
				'params'  => array(
					'enabled'        => __( 'Master on/off for the frontend chat widget.', 'neo-pulse-wp' ),
					'logged_in_only' => __( 'When true, only logged-in WordPress users see the widget.', 'neo-pulse-wp' ),
				),
			),
			'wp_list_posts'              => array(
				'summary' => __( 'Lists recent posts or pages with ID, title, status, type, and edit/view URLs.', 'neo-pulse-wp' ),
				'params'  => array(
					'post_type' => __( 'Post type slug (default post).', 'neo-pulse-wp' ),
					'count'     => __( 'Number of items (default 10).', 'neo-pulse-wp' ),
					'status'    => __( 'Post status filter.', 'neo-pulse-wp' ),
				),
			),
			'wp_get_post'                => array(
				'summary' => __( 'Fetches one post by post_id or title search.', 'neo-pulse-wp' ),
				'params'  => array(
					'post_id' => __( 'Numeric post ID.', 'neo-pulse-wp' ),
					'title'   => __( 'Title search if post_id omitted.', 'neo-pulse-wp' ),
				),
			),
			'wp_get_post_content'        => array(
				'summary' => __( 'Returns rendered HTML content, raw blocks, excerpt, and permalink for a post.', 'neo-pulse-wp' ),
				'params'  => array(
					'post_id' => __( 'Required post ID.', 'neo-pulse-wp' ),
				),
			),
			'wp_create_post'             => array(
				'summary' => __( 'Creates a new post (or custom post type). Can set focus keyword meta on create.', 'neo-pulse-wp' ),
				'params'  => array(
					'title'          => __( 'Post title (required).', 'neo-pulse-wp' ),
					'status'         => __( 'draft, publish, or private.', 'neo-pulse-wp' ),
					'post_type'      => __( 'Custom post type slug.', 'neo-pulse-wp' ),
					'focus_keyword'  => __( 'Rank Math focus keyword.', 'neo-pulse-wp' ),
					'categories'     => __( 'Array of category names.', 'neo-pulse-wp' ),
				),
			),
			'wp_create_page'             => array(
				'summary' => __( 'Creates a new WordPress page.', 'neo-pulse-wp' ),
				'params'  => array(
					'title'         => __( 'Page title (required).', 'neo-pulse-wp' ),
					'status'        => __( 'draft, publish, or private.', 'neo-pulse-wp' ),
					'focus_keyword' => __( 'Optional focus keyword.', 'neo-pulse-wp' ),
				),
			),
			'wp_update_post'             => array(
				'summary' => __( 'Updates core post fields without replacing full body content.', 'neo-pulse-wp' ),
				'params'  => array(
					'post_id' => __( 'Required.', 'neo-pulse-wp' ),
					'title'   => __( 'New title.', 'neo-pulse-wp' ),
					'status'  => __( 'New status.', 'neo-pulse-wp' ),
					'excerpt' => __( 'Post excerpt.', 'neo-pulse-wp' ),
					'slug'    => __( 'Post slug (post_name).', 'neo-pulse-wp' ),
				),
			),
			'wp_add_content'             => array(
				'summary' => __( 'Appends or replaces HTML in post_content via Backend Assist content tool.', 'neo-pulse-wp' ),
				'params'  => array(
					'post_id' => __( 'Target post.', 'neo-pulse-wp' ),
					'title'   => __( 'Find post by title if no ID.', 'neo-pulse-wp' ),
					'content' => __( 'HTML to add.', 'neo-pulse-wp' ),
					'mode'    => __( 'append or replace.', 'neo-pulse-wp' ),
				),
			),
			'wp_replace_content'         => array(
				'summary' => __( 'Replaces entire post_content. Snapshots content for wp_revision_restore.', 'neo-pulse-wp' ),
				'params'  => array(
					'post_id' => __( 'Required.', 'neo-pulse-wp' ),
					'content' => __( 'Full new HTML/content.', 'neo-pulse-wp' ),
					'confirm' => __( 'Must be true.', 'neo-pulse-wp' ),
				),
			),
			'wp_delete_post'             => array(
				'summary' => __( 'Moves post to trash or permanently deletes when force is true.', 'neo-pulse-wp' ),
				'params'  => array(
					'post_id' => __( 'Required.', 'neo-pulse-wp' ),
					'force'   => __( 'Permanent delete if true.', 'neo-pulse-wp' ),
					'confirm' => __( 'Must be true.', 'neo-pulse-wp' ),
				),
			),
			'wp_resolve_url'             => array(
				'summary' => __( 'Resolves a front-end URL or path to a post_id.', 'neo-pulse-wp' ),
				'params'  => array(
					'url' => __( 'Full permalink or path.', 'neo-pulse-wp' ),
				),
			),
			'wp_ai_apply_field'          => array(
				'summary' => __( 'Applies a previewed wand value to Rank Math meta, title, excerpt, or ACF / post meta fields. Counts toward optimization usage.', 'neo-pulse-wp' ),
				'params'  => array(
					'post_id' => __( 'Required.', 'neo-pulse-wp' ),
					'field'   => __( 'title, focus_keyword, excerpt, seo_research, faq, page_url.', 'neo-pulse-wp' ),
					'value'   => __( 'Value to save.', 'neo-pulse-wp' ),
					'confirm' => __( 'Must be true.', 'neo-pulse-wp' ),
				),
				'example' => '{"post_id":123,"field":"focus_keyword","value":"hvac edmonton","confirm":true}',
			),
			'wp_body_section_apply'      => array(
				'summary' => __( 'Writes AI-generated HTML into the matching H2 section and saves the post.', 'neo-pulse-wp' ),
				'params'  => array(
					'post_id'       => __( 'Required.', 'neo-pulse-wp' ),
					'sectionIndex'  => __( 'Zero-based section index.', 'neo-pulse-wp' ),
					'sessionId'     => __( 'Harness session ID.', 'neo-pulse-wp' ),
					'html'          => __( 'Section HTML to apply.', 'neo-pulse-wp' ),
					'confirm'       => __( 'Must be true.', 'neo-pulse-wp' ),
				),
			),
		);
	}

	/**
	 * Full library rows for admin UI, grouped-ready.
	 *
	 * @return array<int, array<string, mixed>>
	 */
	public static function get_entries(): array {
		$dict       = self::dictionary();
		$registry   = Neo_Pulse_Wp_Tools::get_registry();
		$entries    = array();

		foreach ( $registry as $name => $def ) {
			$extra    = isset( $dict[ $name ] ) ? $dict[ $name ] : array();
			$category = self::category_for_tool( $name );
			$params   = isset( $extra['params'] ) && is_array( $extra['params'] ) ? $extra['params'] : array();

			$entries[] = array(
				'name'             => $name,
				'category'         => $category,
				'category_label'   => self::get_categories()[ $category ] ?? $category,
				'risk'             => $def['risk'],
				'capability'       => $def['capability'],
				'description'      => $def['description'],
				'summary'          => isset( $extra['summary'] ) ? $extra['summary'] : $def['description'],
				'params'           => $params,
				'requires_confirm' => Neo_Pulse_Wp_Tools::requires_confirm( $name ),
				'example'          => isset( $extra['example'] ) ? $extra['example'] : '',
				'endpoint'         => 'POST /wp-json/neo-pulse/v1/tools/execute',
			);
		}

		usort(
			$entries,
			function ( $a, $b ) {
				$c = strcmp( $a['category'], $b['category'] );
				if ( $c !== 0 ) {
					return $c;
				}
				return strcmp( $a['name'], $b['name'] );
			}
		);

		return $entries;
	}

	/**
	 * @return array<string, array<int, array<string, mixed>>>
	 */
	public static function get_entries_by_category(): array {
		$grouped = array();
		foreach ( self::get_categories() as $slug => $label ) {
			$grouped[ $slug ] = array();
		}
		foreach ( self::get_entries() as $entry ) {
			$cat = $entry['category'];
			if ( ! isset( $grouped[ $cat ] ) ) {
				$grouped[ $cat ] = array();
			}
			$grouped[ $cat ][] = $entry;
		}
		return array_filter( $grouped );
	}

	/**
	 * @return int
	 */
	public static function tool_count(): int {
		return count( Neo_Pulse_Wp_Tools::get_registry() );
	}
}
