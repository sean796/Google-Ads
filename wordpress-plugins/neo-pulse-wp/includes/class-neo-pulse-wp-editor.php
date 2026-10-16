<?php
/**
 * NEO Pulse AI editor surfaces (block sidebar, classic meta box, Content Optimizer).
 *
 * @package Neo_Pulse_Wp
 */

defined( 'ABSPATH' ) || exit;

class Neo_Pulse_Wp_Editor {

	const META_BOX_ID = 'neo_pulse_wp_ai';

	public static function init(): void {
		add_action( 'add_meta_boxes', array( __CLASS__, 'register_meta_box' ), 20 );
		add_action( 'enqueue_block_editor_assets', array( __CLASS__, 'enqueue_block_editor_assets' ) );
		add_action( 'admin_enqueue_scripts', array( __CLASS__, 'enqueue_classic_assets' ) );
	}

	public static function register_meta_box(): void {
		$screen = function_exists( 'get_current_screen' ) ? get_current_screen() : null;
		if ( ! $screen || ! in_array( $screen->base, array( 'post', 'post-new' ), true ) ) {
			return;
		}

		$post_type = isset( $screen->post_type ) ? (string) $screen->post_type : '';
		if ( $post_type === '' ) {
			return;
		}

		add_meta_box(
			self::META_BOX_ID,
			__( 'NEO Pulse AI', 'neo-pulse-wp' ),
			array( __CLASS__, 'render_meta_box' ),
			$post_type,
			'side',
			'high',
			array(
				'__back_compat_meta_box'             => false,
				'__block_editor_compatible_meta_box' => true,
			)
		);
	}

	/**
	 * @param WP_Post|mixed $post Post being edited.
	 */
	public static function render_meta_box( $post ): void {
		if ( ! $post instanceof WP_Post ) {
			return;
		}
		echo '<div id="neo-pulse-wp-ai-classic-root" class="neo-pulse-wp-ai-root" data-post-id="' . esc_attr( (string) $post->ID ) . '"></div>';
	}

	public static function enqueue_block_editor_assets(): void {
		global $post;

		$screen = function_exists( 'get_current_screen' ) ? get_current_screen() : null;
		if ( ! $screen || $screen->base !== 'post' ) {
			return;
		}

		$post_id = 0;
		if ( isset( $_GET['post'] ) ) { // phpcs:ignore WordPress.Security.NonceVerification.Recommended
			$post_id = absint( $_GET['post'] ); // phpcs:ignore WordPress.Security.NonceVerification.Recommended
		} elseif ( $post instanceof WP_Post ) {
			$post_id = (int) $post->ID;
		}

		if ( $post_id < 1 ) {
			return;
		}

		$post = get_post( $post_id );
		if ( ! $post instanceof WP_Post ) {
			return;
		}

		self::enqueue_shared_assets( $post_id );
		self::enqueue_script(
			'neo-pulse-wp-ai-body-harness',
			'neo-pulse-ai-body-harness.js',
			array( 'neo-pulse-wp-ai-shared', 'neo-pulse-wp-ai-dom' )
		);
		self::enqueue_script(
			'neo-pulse-wp-ai-body-apply',
			'neo-pulse-ai-body-apply.js',
			array( 'neo-pulse-wp-ai-body-harness', 'wp-blocks', 'wp-data', 'wp-block-editor' )
		);
		self::enqueue_script(
			'neo-pulse-wp-ai-url-tool',
			'neo-pulse-ai-url-tool.js',
			array( 'neo-pulse-wp-ai-shared', 'neo-pulse-wp-ai-dom', 'neo-pulse-wp-ai-snippet', 'wp-data' )
		);
		self::enqueue_script(
			'neo-pulse-wp-ai-body-modal',
			'neo-pulse-ai-body-modal.js',
			array(
				'neo-pulse-wp-ai-shared',
				'neo-pulse-wp-ai-dom',
				'neo-pulse-wp-ai-snippet',
				'neo-pulse-wp-ai-url-tool',
				'neo-pulse-wp-ai-body-harness',
				'neo-pulse-wp-ai-body-apply',
			)
		);
		self::enqueue_script(
			'neo-pulse-wp-ai-body-canvas',
			'neo-pulse-ai-body-canvas.js',
			array(
				'neo-pulse-wp-ai-body-harness',
				'wp-plugins',
				'wp-editor',
				'wp-element',
				'wp-compose',
				'wp-block-editor',
				'wp-data',
				'wp-hooks',
			)
		);
		self::enqueue_script(
			'neo-pulse-wp-ai-block',
			'neo-pulse-ai-block.js',
			array(
				'neo-pulse-wp-ai-controller',
				'neo-pulse-wp-ai-toolbar',
				'neo-pulse-wp-ai-body-harness',
				'neo-pulse-wp-ai-body-apply',
				'neo-pulse-wp-ai-body-canvas',
				'wp-plugins',
				'wp-editor',
				'wp-edit-post',
				'wp-element',
				'wp-components',
				'wp-data',
				'wp-i18n',
				'wp-dom-ready',
			)
		);
	}

	/**
	 * @param string|mixed $hook Current admin page hook.
	 */
	public static function enqueue_classic_assets( $hook ): void {
		$hook = is_string( $hook ) ? $hook : '';
		if ( ! in_array( $hook, array( 'post.php', 'post-new.php' ), true ) ) {
			return;
		}

		$post_id = 0;
		if ( 'post.php' === $hook && isset( $_GET['post'] ) ) { // phpcs:ignore WordPress.Security.NonceVerification.Recommended
			$post_id = absint( $_GET['post'] ); // phpcs:ignore WordPress.Security.NonceVerification.Recommended
		} elseif ( 'post-new.php' === $hook ) {
			global $post;
			if ( $post instanceof WP_Post ) {
				$post_id = (int) $post->ID;
			}
		}

		if ( $post_id < 1 ) {
			return;
		}

		$post = get_post( $post_id );
		if ( ! $post instanceof WP_Post ) {
			return;
		}

		self::enqueue_shared_assets( $post_id );
		self::enqueue_script( 'neo-pulse-wp-ai-classic', 'neo-pulse-ai-classic.js', array( 'neo-pulse-wp-ai-controller' ) );
	}

	private static function enqueue_shared_assets( int $post_id ): void {
		self::enqueue_styles();
		self::enqueue_script( 'neo-pulse-wp-ai-shared', 'neo-pulse-ai-shared.js', array() );
		self::enqueue_script( 'neo-pulse-wp-ai-dom', 'neo-pulse-ai-dom.js', array() );
		self::enqueue_script( 'neo-pulse-wp-ai-snippet', 'neo-pulse-ai-snippet.js', array( 'neo-pulse-wp-ai-shared', 'neo-pulse-wp-ai-dom' ) );
		self::enqueue_script( 'neo-pulse-wp-ai-sidebar', 'neo-pulse-ai-sidebar.js', array( 'neo-pulse-wp-ai-shared', 'neo-pulse-wp-ai-dom', 'neo-pulse-wp-ai-snippet' ) );
		self::enqueue_script( 'neo-pulse-wp-social-modal', 'neo-pulse-social-modal.js', array( 'wp-api-fetch' ) );
		self::enqueue_script( 'neo-pulse-wp-ai-faq', 'neo-pulse-ai-faq.js', array( 'neo-pulse-wp-ai-shared', 'neo-pulse-wp-ai-dom' ) );
		self::enqueue_script( 'neo-pulse-wp-ai-modal', 'neo-pulse-ai-modal.js', array( 'neo-pulse-wp-ai-shared', 'neo-pulse-wp-ai-dom', 'neo-pulse-wp-ai-snippet', 'neo-pulse-wp-ai-faq' ) );
		self::enqueue_script(
			'neo-pulse-wp-ai-controller',
			'neo-pulse-ai-controller.js',
			array( 'neo-pulse-wp-ai-shared', 'neo-pulse-wp-ai-dom', 'neo-pulse-wp-ai-snippet', 'neo-pulse-wp-ai-sidebar', 'neo-pulse-wp-ai-faq', 'neo-pulse-wp-ai-modal', 'wp-api-fetch', 'wp-data' )
		);
		self::enqueue_script(
			'neo-pulse-wp-ai-toolbar',
			'neo-pulse-ai-toolbar.js',
			array( 'neo-pulse-wp-ai-shared', 'wp-data' )
		);
		$seo_research_hint = __( 'Brief includes DataForSEO SERP and Semrush (called directly from this site, no Flow API URL).', 'neo-pulse-wp' );
		if ( class_exists( 'Neo_Pulse_Wp_Gsc_Prompt', false ) && Neo_Pulse_Wp_Gsc_Prompt::is_available() ) {
			$seo_research_hint = __( 'Brief includes DataForSEO SERP, Semrush, and GSC page queries (called directly from this site, no Flow API URL).', 'neo-pulse-wp' );
		}
		wp_localize_script(
			'neo-pulse-wp-ai-shared',
			'neoPulseWpAi',
			array(
				'postId'  => $post_id,
				'siteUrl' => esc_url_raw( home_url( '/' ) ),
				'root'    => esc_url_raw( rest_url() ),
				'nonce'   => wp_create_nonce( 'wp_rest' ),
				'strings' => array(
					'title'                   => __( 'NEO Pulse AI', 'neo-pulse-wp' ),
					'preview'                 => __( 'Preview', 'neo-pulse-wp' ),
					'apply'                   => __( 'Apply', 'neo-pulse-wp' ),
					'discard'                 => __( 'Discard', 'neo-pulse-wp' ),
					'loading'                 => __( 'Generating…', 'neo-pulse-wp' ),
					'applied'                 => __( 'Applied to this post.', 'neo-pulse-wp' ),
					'capLabel'                => __( 'Optimizations this period', 'neo-pulse-wp' ),
					'wandTitle'               => __( 'Enhance with NEO Pulse AI', 'neo-pulse-wp' ),
					'metaSeo'                 => __( 'Meta & SEO', 'neo-pulse-wp' ),
					'contentFields'           => __( 'Content fields', 'neo-pulse-wp' ),
					'enhance'                 => __( 'Enhance', 'neo-pulse-wp' ),
					'wandHint'                => __( 'Generate with NEO Pulse AI', 'neo-pulse-wp' ),
					'previewLabel'            => __( 'Preview', 'neo-pulse-wp' ),
					'previewTitlePlaceholder' => __( 'Post title', 'neo-pulse-wp' ),
					'previewDescPlaceholder'  => __( 'Meta description will appear here.', 'neo-pulse-wp' ),
					'backToFields'            => __( '← All fields', 'neo-pulse-wp' ),
					'capReached'              => __( 'Apply disabled — optimization cap reached for this period.', 'neo-pulse-wp' ),
					'capPaused'               => __( 'Optimization cap is temporarily disabled.', 'neo-pulse-wp' ),
					'seoTitle'                => __( 'SEO title', 'neo-pulse-wp' ),
					'metaDescription'         => __( 'Meta description', 'neo-pulse-wp' ),
					'focusKeyword'            => __( 'Focus keyword', 'neo-pulse-wp' ),
					'saveMeta'                => __( 'Save meta', 'neo-pulse-wp' ),
					'savingMeta'              => __( 'Saving…', 'neo-pulse-wp' ),
					'metaSaved'               => __( 'Meta saved.', 'neo-pulse-wp' ),
					'applyField'              => __( 'Apply', 'neo-pulse-wp' ),
					'unsavedChanges'          => __( 'Unsaved changes', 'neo-pulse-wp' ),
					'titleCharHint'           => __( 'Recommended: up to 60 characters.', 'neo-pulse-wp' ),
					'metaCharHint'            => __( 'Recommended: 150–160 characters.', 'neo-pulse-wp' ),
					'editMeta'                => __( 'Edit meta', 'neo-pulse-wp' ),
					'metaEditorTitle'         => __( 'Meta editor', 'neo-pulse-wp' ),
					'generateAll'             => __( 'Generate all with AI', 'neo-pulse-wp' ),
					'discardChanges'          => __( 'You have unsaved changes. Discard them?', 'neo-pulse-wp' ),
					'titleHelp'               => __( 'This is what will appear as the title in search results.', 'neo-pulse-wp' ),
					'descriptionHelp'         => __( 'This is what will appear as the description when this page shows up in search results.', 'neo-pulse-wp' ),
					'focusKeywordHelp'        => __( 'The main keyword you want this page to rank for.', 'neo-pulse-wp' ),
					'close'                   => __( 'Close', 'neo-pulse-wp' ),
					'editSnippet'             => __( 'Edit Snippet', 'neo-pulse-wp' ),
					'usageLabel'              => __( 'Optimizations this period', 'neo-pulse-wp' ),
					'focusKeywordEmpty'       => __( 'Not set', 'neo-pulse-wp' ),
					'toolbarLabel'            => __( 'NEO Pulse', 'neo-pulse-wp' ),
					'copyFaqSchema'           => __( 'Copy all schema', 'neo-pulse-wp' ),
					'copied'                  => __( 'Copied!', 'neo-pulse-wp' ),
					'faqQuestion'             => __( 'Question', 'neo-pulse-wp' ),
					'faqAnswer'               => __( 'Answer', 'neo-pulse-wp' ),
					'gscSuggestions'          => __( 'GSC suggestions', 'neo-pulse-wp' ),
					'gscSuggestionsLoading'     => __( 'Loading GSC suggestions…', 'neo-pulse-wp' ),
					'gscSuggestionsEmpty'       => __( 'No GSC suggestions for this URL.', 'neo-pulse-wp' ),
					'gscImpressions'            => __( 'Impressions', 'neo-pulse-wp' ),
					'runSeoResearch'            => __( 'Run research', 'neo-pulse-wp' ),
					'runSeoResearchLoading'     => __( 'Researching…', 'neo-pulse-wp' ),
					'runSeoResearchNeedKeyword' => __( 'Set focus keyword first.', 'neo-pulse-wp' ),
					'runSeoResearchDone'        => __( 'SEO research brief ready.', 'neo-pulse-wp' ),
					'runSeoResearchFailed'      => __( 'SEO research failed.', 'neo-pulse-wp' ),
					'runSeoResearchUnavailable' => __( 'SEO research credentials are missing from this plugin build.', 'neo-pulse-wp' ),
					'seoResearchBriefHint'      => $seo_research_hint,
					'faqWandNeedResearch'       => __( 'Run SEO research first or paste a research brief.', 'neo-pulse-wp' ),
					'faqWandRunning'            => __( 'Generating FAQs from research…', 'neo-pulse-wp' ),
					'faqWandSeeding'            => __( 'Creating FAQ pairs…', 'neo-pulse-wp' ),
					'faqWandStep'               => __( 'Optimizing FAQ', 'neo-pulse-wp' ),
					'faqWandFailed'             => __( 'FAQ generation failed.', 'neo-pulse-wp' ),
					'faqWandParseFailed'        => __( 'Could not parse generated FAQ pairs.', 'neo-pulse-wp' ),
					'bodyHarnessTitle'          => __( 'Body optimizer', 'neo-pulse-wp' ),
					'bodyHarnessOpen'           => __( 'Open Body Optimizer', 'neo-pulse-wp' ),
					'bodyHarnessHint'           => __( 'Click "Plan sections" to generate a blueprint from seo_research.', 'neo-pulse-wp' ),
					'bodyNoSections'            => __( 'No H2 sections found in this post. Add headings to optimize content.', 'neo-pulse-wp' ),
					'bodyClear'                 => __( 'Clear session', 'neo-pulse-wp' ),
					'bodyHarnessKeyRequired'    => __( 'Body optimizer requires OpenRouter in wp-config, environment, or NEO Pulse WP Settings (not cloud-only).', 'neo-pulse-wp' ),
					'bodyPlan'                  => __( 'Plan sections', 'neo-pulse-wp' ),
					'bodyRunAll'                => __( 'Run all', 'neo-pulse-wp' ),
					'bodyStop'                  => __( 'Stop', 'neo-pulse-wp' ),
					'bodyOptimize'              => __( 'Optimize', 'neo-pulse-wp' ),
					'bodyFleetStatus'           => __( 'Fleet status', 'neo-pulse-wp' ),
					'bodyColStatus'             => __( 'Status', 'neo-pulse-wp' ),
					'bodyColSection'            => __( 'Section', 'neo-pulse-wp' ),
					'bodyColKeyword'            => __( 'Keyword', 'neo-pulse-wp' ),
					'bodyColProgress'           => __( 'Progress', 'neo-pulse-wp' ),
					'bodySectionsComplete'      => __( 'sections complete', 'neo-pulse-wp' ),
					'bodyPhasePlanning'         => __( 'Planning blueprint…', 'neo-pulse-wp' ),
					'bodyPhaseReady'            => __( 'Ready to preview sections', 'neo-pulse-wp' ),
					'bodyHarnessActive'         => __( 'Harness', 'neo-pulse-wp' ),
					'bodyDiffCurrent'           => __( 'Current', 'neo-pulse-wp' ),
					'bodyDiffProposed'          => __( 'Proposed', 'neo-pulse-wp' ),
					'bodyDiffEmpty'             => __( '(no matching section)', 'neo-pulse-wp' ),
					'bodyStatusWaiting'         => __( 'Waiting', 'neo-pulse-wp' ),
					'bodyStatusGenerating'      => __( 'Generating…', 'neo-pulse-wp' ),
					'bodyStatusReady'           => __( 'Ready', 'neo-pulse-wp' ),
					'bodyStatusApplied'         => __( 'Applied', 'neo-pulse-wp' ),
					'bodyStatusError'           => __( 'Error', 'neo-pulse-wp' ),
					'contentOptimizer'          => __( 'Content Optimizer', 'neo-pulse-wp' ),
					'changeUrlTitle'            => __( 'Change URL', 'neo-pulse-wp' ),
					'currentUrl'                => __( 'Current URL', 'neo-pulse-wp' ),
					'newSlug'                   => __( 'New slug', 'neo-pulse-wp' ),
					'urlPreview'                => __( 'Preview', 'neo-pulse-wp' ),
					'updateUrl'                 => __( 'Update URL', 'neo-pulse-wp' ),
					'updatingUrl'               => __( 'Updating…', 'neo-pulse-wp' ),
					'urlUpdated'                => __( 'URL updated.', 'neo-pulse-wp' ),
					'redirectConfirm'           => __( 'Add a 301 redirect in NEO Pulse from the old URL to the new URL?\n\nFrom: %1$s\nTo: %2$s\n\nClick OK to add the redirect, or Cancel to update the URL only.', 'neo-pulse-wp' ),
					'redirectAdded'             => __( 'URL updated and 301 redirect added in NEO Pulse.', 'neo-pulse-wp' ),
					'redirectSkipped'           => __( 'URL updated. No redirect was added.', 'neo-pulse-wp' ),
					'redirectNoPermission'      => __( 'Only administrators can add 301 redirects in NEO Pulse. Your slug will still update.', 'neo-pulse-wp' ),
					'changeUrlFailed'           => __( 'URL update failed.', 'neo-pulse-wp' ),
					'changeUrlUnchangedHint'    => __( 'Change the slug below — it must be different from the live URL to enable Update URL.', 'neo-pulse-wp' ),
				),
			)
		);
	}

	private static function enqueue_styles(): void {
		wp_enqueue_style(
			'neo-pulse-wp-ai-lato',
			'https://fonts.googleapis.com/css2?family=Lato:ital,wght@0,400;0,600;0,700;1,400&display=swap',
			array(),
			null
		);
		$files = array(
			'neo-pulse-wp-ai-tokens'        => 'neo-pulse-ai-tokens.css',
			'neo-pulse-wp-ai-components'    => 'neo-pulse-ai-components.css',
			'neo-pulse-wp-ai-sidebar'       => 'neo-pulse-ai-sidebar.css',
			'neo-pulse-wp-ai-body'          => 'neo-pulse-ai-body.css',
			'neo-pulse-wp-ai-toolbar'       => 'neo-pulse-ai-toolbar.css',
			'neo-pulse-wp-ai-modal'         => 'neo-pulse-ai-modal.css',
			'neo-pulse-wp-social-modal'     => 'neo-pulse-social-modal.css',
		);
		$prev = array( 'neo-pulse-wp-ai-lato' );
		foreach ( $files as $handle => $file ) {
			$rel = 'assets/editor/' . $file;
			$abs = NEO_PULSE_WP_PLUGIN_DIR . $rel;
			$ver = NEO_PULSE_WP_VERSION;
			if ( is_readable( $abs ) ) {
				$ver .= '.' . (string) filemtime( $abs );
			}
			wp_enqueue_style(
				$handle,
				plugins_url( $rel, NEO_PULSE_WP_PLUGIN_FILE ),
				$prev,
				$ver
			);
			$prev[] = $handle;
		}
	}

	private static function enqueue_style(): void {
		self::enqueue_styles();
	}

	/**
	 * @param array<int,string> $deps
	 */
	private static function enqueue_script( string $handle, string $file, array $deps = array() ): void {
		$rel = 'assets/editor/' . $file;
		$abs = NEO_PULSE_WP_PLUGIN_DIR . $rel;
		$ver = NEO_PULSE_WP_VERSION;
		if ( is_readable( $abs ) ) {
			$ver .= '.' . (string) filemtime( $abs );
		}
		wp_enqueue_script(
			$handle,
			plugins_url( $rel, NEO_PULSE_WP_PLUGIN_FILE ),
			$deps,
			$ver,
			true
		);
	}
}
