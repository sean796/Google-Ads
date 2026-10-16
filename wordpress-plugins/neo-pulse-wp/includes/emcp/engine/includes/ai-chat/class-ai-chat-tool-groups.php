<?php
/**
 * AI Chat tool-group registry — the single source of truth for the chat's
 * lazy-loading model.
 *
 * The chat advertises only a lean CORE set of tools to the model each turn,
 * then lets the model pull in the rest one
 * GROUP at a time via the synthetic `load_tools` meta-tool. This cuts the
 * repeated tools payload without losing any capability (every tool remains
 * reachable; `/execute-ability` is unchanged).
 *
 * This class defines: which slugs are core, the loadable groups (id → label +
 * description + membership rule), and a classifier. It is consumed by the REST
 * controller (`/abilities` tags each tool + returns the registry), the prompt
 * builder (advertises core + the loadable groups), and, via those, the JS.
 *
 * @package EMCP_Tools
 * @since   3.1.0
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Core/loadable grouping for the AI Chat lazy-loading model.
 *
 * @since 3.1.0
 */
class EMCP_Tools_AI_Chat_Tool_Groups {

	/**
	 * Slugs always advertised to the model (the common Elementor discovery and
	 * editing path). Filtered to the active set by callers, so inactive ones
	 * simply drop out. Unmatched active tools are available through the `other`
	 * loadable group (see classify()).
	 *
	 * @since 3.1.0
	 * @var string[]
	 */
	const CORE = array(
		// Discovery.
		'list-widgets', 'get-widget-schema', 'get-page-structure', 'get-element-settings',
		'list-pages', 'detect-elementor-version', 'find-element', 'get-page-snapshot',
		// Pages & layout.
		'create-page', 'add-container', 'update-container', 'move-element',
		'remove-element', 'update-element', 'build-page',
		// Widgets.
		'add-free-widget', 'update-widget',
	);

	/**
	 * Loadable groups in classification order (first match wins, so specific →
	 * generic). Each: label, desc (both shown to the model), and needles matched as
	 * substrings of the slug.
	 *
	 * @since 3.1.0
	 * @return array<string,array{label:string,desc:string,needles:string[]}>
	 */
	public static function group_defs(): array {
		return array(
			'spectra' => array('label'=>'Spectra','desc'=>'Independent Spectra block discovery and page editing','needles'=>array('spectra-')),
			'kadence-blocks' => array('label'=>'Kadence Blocks','desc'=>'Kadence block discovery, patterns and page editing','needles'=>array('kadence-blocks-')),
			'blocksy-blocks' => array('label'=>'Blocksy Blocks','desc'=>'Independent Gutenberg block discovery and editing','needles'=>array('blocksy-blocks-')),
			'otter' => array('label'=>'Otter Blocks','desc'=>'Native Free and Pro blocks, patterns, styles and features','needles'=>array('otter-')),
			'blocksy-companion' => array('label'=>'Blocksy Companion','desc'=>'Companion extensions and native Content Blocks','needles'=>array('blocksy-content-','blocksy-extensions-')),
			'blocksy-theme' => array('label'=>'Blocksy Theme','desc'=>'Theme layout and design settings','needles'=>array('blocksy-theme-')),
			'generateblocks' => array('label'=>'GenerateBlocks','desc'=>'GenerateBlocks schemas, styles and page editing','needles'=>array('generateblocks-')),
			'bricks' => array( 'label' => 'Bricks Builder', 'desc' => 'Bricks element schemas, draft pages, tree editing, local templates and design system', 'needles' => array( 'bricks-' ) ),
			'beaver' => array('label'=>'Beaver Builder','desc'=>'Beaver native staged layouts, modules, CSS, saved library and recovery','needles'=>array('beaver-')),
			'visual-composer' => array('label'=>'Visual Composer','desc'=>'Visual Composer native documents, schemas, staged render artifacts, library and recovery','needles'=>array('visual-composer-')),
			'wpbakery' => array('label'=>'WPBakery Builder','desc'=>'WPBakery native shortcode pages, element schemas, CSS, templates and recovery','needles'=>array('wpbakery-')),
			'kirki' => array('label'=>'Kirki Builder','desc'=>'Kirki native pages, responsive styles, versions, library and CMS discovery','needles'=>array('kirki-')),
			'oxygen' => array('label'=>'Oxygen Builder','desc'=>'Oxygen 6 native pages, element editing, responsive CSS classes, templates and design system','needles'=>array('oxygen-')),
			'breakdance' => array( 'label' => 'Breakdance Builder', 'desc' => 'Breakdance element schemas, draft pages, nested tree editing, templates and design system', 'needles' => array( 'breakdance-' ) ),
			'avada' => array( 'label' => 'Avada Builder', 'desc' => 'Avada page layouts, native schemas, templates, design system and Core Portfolio, FAQ and Slider discovery', 'needles' => array( 'avada-' ) ),
			'thrive' => array( 'label' => 'Thrive Architect', 'desc' => 'Native Architect pages, element schemas, HTML and CSS edits, local library discovery', 'needles' => array( 'thrive-' ) ),
			'divi' => array( 'label' => 'Divi Builder', 'desc' => 'Divi 5 pages, module schemas, library, Theme Builder templates and assignments, theme options and design system', 'needles' => array( 'divi-' ) ),
			'elementor-advanced' => array( 'label' => 'Advanced Elementor', 'desc' => 'Advanced schemas, templates, global design, labels, variables, imports/exports and batch editing', 'needles' => array( 'container-schema', 'list-templates', 'global-settings', 'control-types', 'page-settings', 'page-content', 'duplicate-element', 'reorder-elements', 'import-template', 'export-page', 'add-pro-widget', 'validate-widget', 'batch-update', 'global-color', 'global-typography', 'save-as-template', 'apply-template', 'element-label', 'global-class', 'variable' ) ),
			'atomic'         => array( 'label' => 'Atomic elements (Elementor v4)', 'desc' => 'Atomic widgets + flexbox/div-block containers for Elementor 4.0+', 'needles' => array( 'atomic', 'flexbox', 'div-block' ) ),
			'gutenberg'      => array( 'label' => 'Gutenberg blocks', 'desc' => 'Block schemas, patterns and incremental block editing', 'needles' => array( 'block', 'pattern' ) ),
			'history-backup' => array( 'label' => 'History, backup & sync', 'desc' => 'Snapshots, change rollback, backups and sync queues', 'needles' => array( 'snapshot', 'change', 'rollback', 'backup', 'syncable', 'sync-change' ) ),
			'content-transfer' => array( 'label' => 'Content search & transfer', 'desc' => 'Search indexes and content export/restore operations', 'needles' => array( 'search-content', 'reindex-search', 'export-content', 'restore-content', 'content-exports' ) ),
			'templates-dynamic' => array( 'label' => 'Template conditions & dynamic data', 'desc' => 'Template conditions, target resolution and dynamic sources', 'needles' => array( 'template-condition', 'resolve-template', 'condition-target', 'dynamic-source' ) ),
			'site-structure' => array( 'label' => 'Menus, ACF & theme settings', 'desc' => 'Navigation menus, ACF values and supported theme settings', 'needles' => array( 'menu-', 'acf-', 'astra-' ) ),
			'cloud'          => array( 'label' => 'Neo EMCP & portable artifacts', 'desc' => 'Cloud status, backup, restore, sync, marketplace and sandbox artifact transfer', 'needles' => array( 'cloud-', 'sandbox-artifact' ) ),
			'php-snippets'   => array( 'label' => 'PHP snippets', 'desc' => 'Author/validate PHP snippet drafts (never auto-run)', 'needles' => array( 'php-snippet' ) ),
			'widget-builder' => array( 'label' => 'Widget builder', 'desc' => 'Create/update/delete custom widgets', 'needles' => array( 'custom-widget' ) ),
			'custom-code'    => array( 'label' => 'Custom code', 'desc' => 'Custom CSS/JS + site-wide code snippets', 'needles' => array( 'custom-css', 'custom-js', 'code-snippet' ) ),
			'brand-kits'     => array( 'label' => 'Brand kits', 'desc' => 'Apply brand kits / replace system colors + typography site-wide', 'needles' => array( 'brand-kit', 'replace-system', 'system-color', 'system-typography' ) ),
			'seo'            => array( 'label' => 'SEO & accessibility', 'desc' => 'Page SEO/a11y audits + meta-tag / JSON-LD schema generation', 'needles' => array( 'seo', 'a11y', 'keyword', 'meta-tag', 'schema-markup', 'alt-text', 'contrast' ) ),
			'plugins-themes' => array( 'label' => 'Plugins & themes', 'desc' => 'Discover/install/activate/update/remove plugins & themes', 'needles' => array( 'plugin', 'theme' ) ),
			'users'          => array( 'label' => 'Users', 'desc' => 'List/inspect users; create/update non-admin users', 'needles' => array( 'user' ) ),
			'media'          => array( 'label' => 'Media & images', 'desc' => 'Media library + Creative-Commons stock images', 'needles' => array( 'media', 'image', 'svg-icon' ) ),
			'filesystem'     => array( 'label' => 'Filesystem', 'desc' => 'Read/list/search files in the install (write/edit/delete if enabled)', 'needles' => array( '-file', 'directory', 'search-files' ) ),
			'database'       => array( 'label' => 'Database', 'desc' => 'List/describe tables, read-only query (structured writes if enabled)', 'needles' => array( 'table', 'query', '-row', '-rows' ) ),
			'diagnostics'    => array( 'label' => 'Performance & security', 'desc' => 'Performance analyzer + security/malware scanner (read-only)', 'needles' => array( 'performance', 'security' ) ),
			'content'        => array( 'label' => 'WordPress content', 'desc' => 'Create/read/update/delete posts, pages, CPTs + taxonomies; inspect public page HTML', 'needles' => array( 'post', 'taxonom', 'page-html' ) ),
			'settings'       => array( 'label' => 'Site settings', 'desc' => 'Read/update core WordPress settings', 'needles' => array( 'get-settings', 'update-settings' ) ),
			'other'          => array( 'label' => 'Other tools', 'desc' => 'Additional enabled tools that do not belong to a standard group', 'needles' => array() ),
		);
	}

	/**
	 * Classify a tool slug → 'core' or a loadable group id. Core wins; then the
	 * first group whose needle matches; unmatched tools remain reachable through
	 * the on-demand `other` group instead of silently inflating every request.
	 *
	 * @since 3.1.0
	 * @param string $slug Ability slug (no `emcp-tools/` prefix).
	 * @return string Group id, or 'core'.
	 */
	public static function classify( string $slug ): string {
		if ( in_array( $slug, self::CORE, true ) ) {
			return 'core';
		}
		foreach ( self::group_defs() as $id => $def ) {
			foreach ( $def['needles'] as $needle ) {
				if ( false !== strpos( $slug, $needle ) ) {
					return $id;
				}
			}
		}
		return 'other';
	}

	/**
	 * The registry to expose to the client: only groups that actually have ≥1 tool
	 * in the given active set, each with label + description. `core` is intentionally
	 * omitted (it is not loadable).
	 *
	 * @since 3.1.0
	 * @param string[] $active_names Active `emcp-tools/…` ability names.
	 * @return array<string,array{label:string,desc:string,count:int}>
	 */
	public static function loadable_for( array $active_names ): array {
		$counts = array();
		foreach ( $active_names as $name ) {
			$slug  = ( 0 === strpos( $name, 'emcp-tools/' ) ) ? substr( $name, 11 ) : $name;
			$group = self::classify( $slug );
			if ( 'core' === $group ) {
				continue;
			}
			$counts[ $group ] = ( $counts[ $group ] ?? 0 ) + 1;
		}
		$defs = self::group_defs();
		$out  = array();
		foreach ( $defs as $id => $def ) {
			if ( ! empty( $counts[ $id ] ) ) {
				$out[ $id ] = array( 'label' => $def['label'], 'desc' => $def['desc'], 'count' => $counts[ $id ] );
			}
		}
		return $out;
	}
}
