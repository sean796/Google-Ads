<?php
/**
 * Minimal in-editor AI Chat panel — a dedicated, stripped-down interface for the
 * Elementor "Ask AI" floating window.
 *
 * Unlike the full admin panel (ai-chat-panel.php) there is NO sidebar, NO
 * provider/model selector, and NO settings screen: the editor uses a default
 * model configured in Neo EMCP → AI Chat, and the conversation is scoped to
 * the page being edited. Just a slim "New" toolbar, the message area, and the
 * composer. ai-chat.js binds the same element ids in its embed mode.
 *
 * @package EMCP_Tools
 * @since   3.1.0
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}
?>
<div id="emcp-ai-chat" class="emcp-ai-chat emcp-ai-chat--embed" data-state="loading">

	<div class="emcp-ai-loading" data-emcp-ai-view="loading">
		<span class="spinner is-active"></span>
	</div>

	<div class="emcp-ai-main" data-emcp-ai-view="chat" hidden>
		<div class="emcp-ai-conv">
			<div class="emcp-ai-embed-bar">
				<div class="emcp-ai-embed-history-wrap">
					<button type="button" class="emcp-ai-embed-histbtn" id="emcp-ai-history-toggle" aria-haspopup="true" aria-expanded="false"><?php esc_html_e( 'History', 'emcp-tools' ); ?> <span aria-hidden="true">▾</span></button>
					<div class="emcp-ai-embed-history" id="emcp-ai-history" hidden></div>
				</div>
				<button type="button" class="emcp-ai-embed-new" id="emcp-ai-new"><?php esc_html_e( '＋ New', 'emcp-tools' ); ?></button>
			</div>

			<div class="emcp-ai-messages" id="emcp-ai-messages"></div>

			<div class="emcp-ai-footer">
				<div class="emcp-ai-composer">
					<div class="emcp-ai-tray" id="emcp-ai-tray" hidden></div>
					<div class="emcp-ai-composer-row">
						<button type="button" class="emcp-ai-attach" id="emcp-ai-attach" aria-label="<?php esc_attr_e( 'Attach images or text files', 'emcp-tools' ); ?>" title="<?php esc_attr_e( 'Attach images or text files', 'emcp-tools' ); ?>">
							<svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true" focusable="false"><path fill="currentColor" d="M12.9 6.05 7.4 11.5a1.4 1.4 0 0 0 2 2l5.5-5.5a2.6 2.6 0 0 0-3.7-3.7l-5.5 5.5a3.8 3.8 0 0 0 5.4 5.4l4.2-4.2a.75.75 0 0 1 1.06 1.06l-4.2 4.2a5.3 5.3 0 0 1-7.5-7.5l5.5-5.5a4.1 4.1 0 0 1 5.8 5.8l-5.5 5.5a2.9 2.9 0 0 1-4.1-4.1l5.5-5.5a.75.75 0 0 1 1.06 1.06Z"/></svg>
						</button>
						<input type="file" id="emcp-ai-file" class="emcp-ai-file-input" multiple hidden />
						<textarea id="emcp-ai-input" rows="1" placeholder="<?php esc_attr_e( 'Ask AI to build or edit this page…', 'emcp-tools' ); ?>"></textarea>
						<button type="button" class="button button-primary" id="emcp-ai-send"><?php esc_html_e( 'Send', 'emcp-tools' ); ?></button>
					</div>
				</div>
			</div>
		</div>
	</div>

</div>
