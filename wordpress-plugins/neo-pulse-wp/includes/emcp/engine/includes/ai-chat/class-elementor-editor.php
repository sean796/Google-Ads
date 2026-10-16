<?php
/**
 * EMCP AI panel inside the Elementor editor.
 *
 * Enqueues the shared chat engine (build-pro/chat-editor.js, ai-chat.css) + the editor bridge
 * (editor-elementor.js/editor.css) on the Elementor editor, prints the floating
 * window + FAB in the editor footer, and localizes the SAME chat config as the
 * admin AI Chat page (via EMCP_Tools_AI_Chat_Page::client_config) plus the
 * embed context (current page id + a page-context sentence for the model).
 *
 * Pro-gated + edit_posts. Only loads inside Elementor's editor.
 *
 * @package EMCP_Tools
 * @since   3.1.0
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Elementor editor integration for the AI panel.
 *
 * @since 3.1.0
 */
class EMCP_Tools_Elementor_Editor {

	/**
	 * @since 3.1.0
	 */
	public function init(): void {
		add_action( 'elementor/editor/after_enqueue_scripts', array( $this, 'enqueue' ) );
		add_action( 'elementor/editor/footer', array( $this, 'render' ) );
	}

	/**
	 * Whether the AI panel may load for the current user/site.
	 *
	 * @since 3.1.0
	 * @return bool
	 */
	private function can_load(): bool {
		return EMCP_Tools_Page_Builders::enabled( 'elementor' )
			&& current_user_can( 'edit_posts' )
			&& class_exists( 'EMCP_Tools_AI_Chat_Provider' )
			&& EMCP_Tools_AI_Chat_Provider::has_access()
			&& class_exists( 'EMCP_Tools_AI_Chat_Page' );
	}

	/**
	 * Current document id from the Elementor editor request.
	 *
	 * @since 3.1.0
	 * @return int
	 */
	private function post_id(): int {
		// Elementor editor: post.php?post=ID&action=elementor (or ?post_id=ID).
		// phpcs:disable WordPress.Security.NonceVerification.Recommended
		if ( isset( $_GET['post'] ) ) {
			return absint( wp_unslash( $_GET['post'] ) );
		}
		if ( isset( $_GET['post_id'] ) ) {
			return absint( wp_unslash( $_GET['post_id'] ) );
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
		$js_bridge  = EMCP_Tools_Pro_Loader::url( 'assets/js/editor-elementor.js' );

		// Per-asset mtime versions: an edited file busts its own cache entry.
		wp_enqueue_style( 'emcp-tools-ai-chat', $css_chat, array(), EMCP_Tools_Pro_Loader::asset_version( 'assets/css/ai-chat.css' ) );
		wp_enqueue_style( 'emcp-tools-ai-editor', $css_editor, array( 'emcp-tools-ai-chat' ), EMCP_Tools_Pro_Loader::asset_version( 'assets/css/editor.css' ) );
		wp_enqueue_script( 'emcp-tools-ai-chat', $engine['src'], $engine['deps'], $engine['ver'], true );
		wp_enqueue_script( 'emcp-tools-ai-window', $js_window, array( 'emcp-tools-ai-chat' ), EMCP_Tools_Pro_Loader::asset_version( 'assets/js/editor-window.js' ), true );
		wp_enqueue_script( 'emcp-tools-ai-editor', $js_bridge, array( 'emcp-tools-ai-chat', 'emcp-tools-ai-window' ), EMCP_Tools_Pro_Loader::asset_version( 'assets/js/editor-elementor.js' ), true );

		$post_id = $this->post_id();
		$config  = EMCP_Tools_AI_Chat_Page::client_config( 'elementor', $post_id );

		$title = $post_id ? get_the_title( $post_id ) : '';
		$config['pageContext'] = sprintf(
			/* translators: 1: page id, 2: page title, 3: page id again */
			__( 'You are embedded in the Elementor editor, editing page %1$d ("%2$s"). ALWAYS target this exact page id, %3$d. Build directly on it: use add-container for layout, then add-free-widget / add-pro-widget (or the atomic tools) for content. NEVER create a new page and NEVER use build-page, build-page makes a SEPARATE page; build incrementally on this page instead. Do NOT round-trip through export-page / import-template. Call get-page-structure only when you actually need the current tree (its output is large, avoid repeating it). After you finish, the editor reloads to show your changes.', 'emcp-tools' ),
			$post_id,
			$title,
			$post_id
		);

		// The editor panel has no provider/model picker — it uses the default the
		// user set in Neo EMCP → AI Chat (falls back to the first connected
		// provider). And it shows only THIS page's conversation thread.
		$editor                     = EMCP_Tools_AI_Chat_Provider::get_editor_default();
		$config['editorProvider']   = $editor['provider'];
		$config['editorModel']      = $editor['model'];
		$config['editorConversation'] = class_exists( 'EMCP_Tools_AI_Chat_Store' )
			? EMCP_Tools_AI_Chat_Store::get_for_post( $post_id )
			: null;
		$config['editorConversations'] = class_exists( 'EMCP_Tools_AI_Chat_Store' )
			? EMCP_Tools_AI_Chat_Store::list_for_post( $post_id )
			: array();
		$config['pluginChatUrl']    = admin_url( 'admin.php?page=' . EMCP_Tools_AI_Chat_Page::PAGE );

		wp_localize_script( 'emcp-tools-ai-chat', 'emcpAiChat', $config );
	}

	/**
	 * Print the FAB + floating-window shell (with the shared panel partial) into
	 * the editor footer. The bridge JS wires all behavior.
	 *
	 * @since 3.1.0
	 */
	public function render(): void {
		if ( ! $this->can_load() ) {
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
				<?php
				// IMPORTANT: every --emcp-ai-* CSS variable is scoped to .emcp-ai-wrap
				// (ai-chat.css); the admin page provides that wrapper, so the window
				// must too or the whole panel loses its palette.
				?>
				<div class="emcp-ai-wrap"><?php require $panel; ?></div>
			</div>
			<div class="emcp-ai-win-resize" id="emcp-ai-win-resize" aria-hidden="true"></div>
		</div>
		<?php
	}
}
