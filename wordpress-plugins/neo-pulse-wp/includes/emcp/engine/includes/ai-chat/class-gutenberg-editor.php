<?php
/**
 * EMCP AI panel inside the WordPress block (Gutenberg) editor.
 *
 * Enqueues the shared chat engine (build-pro/chat-editor.js, ai-chat.css) + shared window UI
 * (editor-window.js) + the Gutenberg bridge (editor-gutenberg.js) on the block
 * editor, prints the floating window + FAB in the admin footer, and localizes
 * the SAME chat config as the admin AI Chat page plus the block-editor embed
 * context (current post id + a page-context sentence for the model).
 *
 * Pro-gated + edit_posts. Only loads on block-editor screens.
 *
 * @package EMCP_Tools
 * @since   3.1.0
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Gutenberg (block editor) integration for the AI panel.
 *
 * @since 3.1.0
 */
class EMCP_Tools_Gutenberg_Editor {

	/**
	 * @since 3.1.0
	 */
	public function init(): void {
		add_action( 'enqueue_block_editor_assets', array( $this, 'enqueue' ) );
		add_action( 'admin_footer', array( $this, 'render' ) );
	}

	/**
	 * Whether the AI panel may load for the current user/site.
	 *
	 * @since 3.1.0
	 * @return bool
	 */
	private function can_load(): bool {
		return current_user_can( 'edit_posts' )
			&& class_exists( 'EMCP_Tools_AI_Chat_Provider' )
			&& EMCP_Tools_AI_Chat_Provider::has_access()
			&& class_exists( 'EMCP_Tools_AI_Chat_Page' );
	}

	/**
	 * Whether the current admin screen is the block editor.
	 *
	 * @since 3.1.0
	 * @return bool
	 */
	private function is_block_editor_screen(): bool {
		if ( ! function_exists( 'get_current_screen' ) ) {
			return false;
		}
		$screen = get_current_screen();
		return $screen && method_exists( $screen, 'is_block_editor' ) && $screen->is_block_editor();
	}

	/**
	 * Current post id from the block-editor request.
	 *
	 * @since 3.1.0
	 * @return int
	 */
	private function post_id(): int {
		// phpcs:disable WordPress.Security.NonceVerification.Recommended
		if ( isset( $_GET['post'] ) ) {
			return absint( wp_unslash( $_GET['post'] ) );
		}
		// phpcs:enable WordPress.Security.NonceVerification.Recommended
		return (int) get_the_ID();
	}

	/**
	 * @since 3.1.0
	 */
	public function enqueue(): void {
		if ( ! $this->can_load() ) {
			return;
		}

		$css_chat   = EMCP_Tools_Pro_Loader::url( 'assets/css/ai-chat.css' );
		$css_editor = EMCP_Tools_Pro_Loader::url( 'assets/css/editor.css' );
		// The shared chat engine, built from pro/admin-src/chat/editor (Part 4c).
		$engine     = EMCP_Tools_AI_Chat_Page::editor_engine_asset();
		$js_window  = EMCP_Tools_Pro_Loader::url( 'assets/js/editor-window.js' );
		$js_bridge  = EMCP_Tools_Pro_Loader::url( 'assets/js/editor-gutenberg.js' );

		// Per-asset mtime versions: an edited file busts its own cache entry.
		wp_enqueue_style( 'emcp-tools-ai-chat', $css_chat, array(), EMCP_Tools_Pro_Loader::asset_version( 'assets/css/ai-chat.css' ) );
		wp_enqueue_style( 'emcp-tools-ai-editor', $css_editor, array( 'emcp-tools-ai-chat' ), EMCP_Tools_Pro_Loader::asset_version( 'assets/css/editor.css' ) );
		wp_enqueue_script( 'emcp-tools-ai-chat', $engine['src'], $engine['deps'], $engine['ver'], true );
		wp_enqueue_script( 'emcp-tools-ai-window', $js_window, array( 'emcp-tools-ai-chat' ), EMCP_Tools_Pro_Loader::asset_version( 'assets/js/editor-window.js' ), true );
		wp_enqueue_script( 'emcp-tools-ai-gutenberg', $js_bridge, array( 'emcp-tools-ai-chat', 'emcp-tools-ai-window', 'wp-data', 'wp-blocks' ), EMCP_Tools_Pro_Loader::asset_version( 'assets/js/editor-gutenberg.js' ), true );

		$post_id = $this->post_id();
		$config  = EMCP_Tools_AI_Chat_Page::client_config( 'gutenberg', $post_id );

		$title = $post_id ? get_the_title( $post_id ) : '';
		$config['pageContext'] = sprintf(
			/* translators: 1: post id, 2: post title, 3: post id again */
			__( 'You are embedded in the WordPress block (Gutenberg) editor, editing post %1$d ("%2$s"). Edit THIS post in place: read it with get-post and write its content with update-post using VALID Gutenberg block markup (e.g. <!-- wp:paragraph -->…<!-- /wp:paragraph -->) as the post content. ALWAYS target this exact post id, %3$d. NEVER use the Elementor tools, NEVER use build-page, and NEVER create a new post, modify this post only. After you finish, the editor refreshes to show your changes.', 'emcp-tools' ),
			$post_id,
			$title,
			$post_id
		);
		$config['pageContext'] .= ' ' . __( 'For INCREMENTAL edits prefer the block tools, call get-post-blocks to get index paths, then add-block / update-block / move-block / remove-block on this same post id. Use update-post only for a full rewrite.', 'emcp-tools' );

		// The editor panel has no provider/model picker — it uses the default the
		// user set in Neo EMCP → AI Chat, and shows only THIS post's thread.
		$editor                        = EMCP_Tools_AI_Chat_Provider::get_editor_default();
		$config['editorProvider']      = $editor['provider'];
		$config['editorModel']         = $editor['model'];
		$config['editorConversation']  = class_exists( 'EMCP_Tools_AI_Chat_Store' )
			? EMCP_Tools_AI_Chat_Store::get_for_post( $post_id )
			: null;
		$config['editorConversations'] = class_exists( 'EMCP_Tools_AI_Chat_Store' )
			? EMCP_Tools_AI_Chat_Store::list_for_post( $post_id )
			: array();
		$config['pluginChatUrl']       = admin_url( 'admin.php?page=' . EMCP_Tools_AI_Chat_Page::PAGE );

		wp_localize_script( 'emcp-tools-ai-chat', 'emcpAiChat', $config );
	}

	/**
	 * Print the FAB + floating-window shell (with the shared panel partial) into
	 * the admin footer on block-editor screens. The bridge JS wires behavior.
	 *
	 * @since 3.1.0
	 */
	public function render(): void {
		if ( ! $this->can_load() || ! $this->is_block_editor_screen() ) {
			return;
		}
		$panel = EMCP_Tools_Pro_Loader::path( 'includes/admin/views/ai-chat-panel-editor.php' );
		if ( '' === $panel ) {
			return;
		}
		?>
		<button type="button" id="emcp-ai-fab" class="emcp-ai-fab" aria-label="<?php esc_attr_e( 'Ask AI', 'emcp-tools' ); ?>">
			<span class="emcp-ai-fab-star" aria-hidden="true">✦</span>
			<span class="emcp-ai-fab-label"><?php esc_html_e( 'Ask AI', 'emcp-tools' ); ?></span>
		</button>

		<div id="emcp-ai-window" class="emcp-ai-window" hidden role="dialog" aria-label="<?php esc_attr_e( 'EMCP AI', 'emcp-tools' ); ?>">
			<div class="emcp-ai-win-bar" id="emcp-ai-win-bar">
				<span class="emcp-ai-win-title"><span aria-hidden="true">✦</span> <?php esc_html_e( 'EMCP AI', 'emcp-tools' ); ?></span>
				<span class="emcp-ai-win-ctrls">
					<button type="button" class="emcp-ai-win-btn" data-act="min" aria-label="<?php esc_attr_e( 'Minimize', 'emcp-tools' ); ?>" title="<?php esc_attr_e( 'Minimize', 'emcp-tools' ); ?>">–</button>
					<button type="button" class="emcp-ai-win-btn" data-act="max" aria-label="<?php esc_attr_e( 'Maximize', 'emcp-tools' ); ?>" title="<?php esc_attr_e( 'Maximize', 'emcp-tools' ); ?>">▢</button>
					<button type="button" class="emcp-ai-win-btn" data-act="close" aria-label="<?php esc_attr_e( 'Close', 'emcp-tools' ); ?>" title="<?php esc_attr_e( 'Close', 'emcp-tools' ); ?>">×</button>
				</span>
			</div>
			<div class="emcp-ai-win-body">
				<div class="emcp-ai-wrap"><?php require $panel; ?></div>
			</div>
			<div class="emcp-ai-win-resize" id="emcp-ai-win-resize" aria-hidden="true"></div>
		</div>
		<?php
	}
}
