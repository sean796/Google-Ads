<?php
/**
 * Backend Assist panel: centered chat modal with suggested actions.
 *
 * @package Neo_Pulse_Wp
 */

defined( 'ABSPATH' ) || exit;

trait Neo_Pulse_Wp_Admin_Trait_Render_Backend_Assist {

	/**
	 * Enqueue Backend Assist admin script (REST URLs + nonce via localize).
	 */
	public static function enqueue_backend_assist_script(): void {
		$rel = 'assets/admin/backend-assist/admin-backend-assist.js';
		$abs = NEO_PULSE_WP_PLUGIN_DIR . $rel;
		if ( ! is_readable( $abs ) ) {
			return;
		}

		$ver = defined( 'NEO_PULSE_WP_VERSION' ) ? NEO_PULSE_WP_VERSION : '0.9.31';
		$ver .= '.' . (string) filemtime( $abs );

		Neo_Pulse_Wp_Voice::enqueue_thinking_card_assets( true );
		wp_enqueue_script( 'neo-pulse-markdown' );

		wp_enqueue_script(
			'neo-pulse-wp-backend-assist',
			plugin_dir_url( NEO_PULSE_WP_PLUGIN_FILE ) . $rel,
			array( 'neo-pulse-markdown' ),
			$ver,
			true
		);

		wp_localize_script(
			'neo-pulse-wp-backend-assist',
			'neoPulseBackendAssist',
			array(
				'baseUrl'            => esc_url_raw( rest_url( 'neo-pulse/v1/backend-assist' ) ),
				'stepUrl'            => esc_url_raw( rest_url( 'neo-pulse/v1/backend-assist/step' ) ),
				'undoUrl'            => esc_url_raw( rest_url( 'neo-pulse/v1/backend-assist/undo' ) ),
				'workflowStatusBase' => esc_url_raw( rest_url( 'neo-pulse/v1/backend-assist/workflow' ) ),
				'sessionsUrl'        => esc_url_raw( rest_url( 'neo-pulse/v1/backend-assist/sessions' ) ),
				'chatAjaxUrl'        => admin_url( 'admin-ajax.php' ),
				'chatStreamNonce'    => wp_create_nonce( 'neo_pulse_chat_stream' ),
				'nonce'              => wp_create_nonce( 'wp_rest' ),
				'brainSvg'           => self::brand_icon_svg( '#22d3ee', 32 ),
			)
		);
	}

	public static function render_backend_assist_page(): void {
		if ( ! current_user_can( 'edit_posts' ) ) {
			return;
		}

		$openrouter_ok = Neo_Pulse_Wp_OpenRouter::get_api_key() !== '';
		$gsc_ok        = Neo_Pulse_Wp_Gsc_Prompt::is_available();
		$gsc_url       = admin_url( 'admin.php?page=neo-pulse-wp-settings&tab=gsc' );
		self::neo_pulse_group_shell_open( 'neo-pulse-wp-backend-assist', 'neo-pulse-wp-panel-page fba-page' );
		?>
			<div class="fba-shell">
				<!-- Sidebar: session history -->
				<aside class="fba-sidebar" id="fba-sidebar">
					<div class="fba-sidebar-header">
						<button type="button" id="fba-new-chat" class="fba-sidebar-btn fba-sidebar-btn--new" title="<?php esc_attr_e( 'New Chat', 'neo-pulse-wp' ); ?>">
							<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
							<?php esc_html_e( 'New Chat', 'neo-pulse-wp' ); ?>
						</button>
					</div>
					<div class="fba-sidebar-list" id="fba-sidebar-list"></div>
					<div class="fba-sidebar-footer">
						<button type="button" id="fba-clear-memory" class="fba-sidebar-btn fba-sidebar-btn--danger" title="<?php esc_attr_e( 'Clear all session history', 'neo-pulse-wp' ); ?>">
							<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
							<?php esc_html_e( 'Clear Memory', 'neo-pulse-wp' ); ?>
						</button>
					</div>
				</aside>

				<!-- Main chat area -->
				<div class="fba-main">
					<?php if ( ! $openrouter_ok ) : ?>
						<div class="fba-alert" role="alert">
							<p><?php esc_html_e( 'Backend Assist requires an OpenRouter API key. Configure it under Settings > Editor AI.', 'neo-pulse-wp' ); ?></p>
						</div>
					<?php endif; ?>

					<div class="fba-chat" id="fba-chat">
						<div class="fba-messages" id="fba-messages"></div>

						<div class="fba-center" id="fba-center">
							<h2 class="fba-brand">Flow Assist</h2>
							<p class="fba-subtitle"><?php esc_html_e( 'Your WordPress backend specialist', 'neo-pulse-wp' ); ?></p>
							<p class="fba-gsc-status">
								<?php if ( $gsc_ok ) : ?>
									<span class="neo-pulse-wp-settings__gsc-status neo-pulse-wp-settings__gsc-status--ok"><?php esc_html_e( 'Search Console connected', 'neo-pulse-wp' ); ?></span>
								<?php else : ?>
									<span class="neo-pulse-wp-settings__gsc-status neo-pulse-wp-settings__gsc-status--error"><?php esc_html_e( 'Search Console not configured', 'neo-pulse-wp' ); ?></span>
									— <a href="<?php echo esc_url( $gsc_url ); ?>"><?php esc_html_e( 'Set up GSC', 'neo-pulse-wp' ); ?></a>
								<?php endif; ?>
							</p>

							<div class="fba-suggestions" id="fba-suggestions">
								<button type="button" class="fba-chip" data-prompt="Create a new page">
									<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/></svg>
									<?php esc_html_e( 'Create a page', 'neo-pulse-wp' ); ?>
								</button>
								<button type="button" class="fba-chip" data-prompt="Create a new blog post">
									<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
									<?php esc_html_e( 'Create a post', 'neo-pulse-wp' ); ?>
								</button>
								<button type="button" class="fba-chip" data-prompt="List my recent drafts">
									<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
									<?php esc_html_e( 'List recent drafts', 'neo-pulse-wp' ); ?>
								</button>
								<button type="button" class="fba-chip" data-prompt="Show me all published pages">
									<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
									<?php esc_html_e( 'View pages', 'neo-pulse-wp' ); ?>
								</button>
								<button type="button" class="fba-chip" data-prompt="Add content to my page">
									<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
									<?php esc_html_e( 'Add content', 'neo-pulse-wp' ); ?>
								</button>
							</div>
						</div>

						<div class="fba-input-wrap">
							<?php if ( $openrouter_ok ) : ?>
							<div class="fba-mode-toggle" id="fba-mode-toggle" role="group" aria-label="<?php esc_attr_e( 'Assist mode', 'neo-pulse-wp' ); ?>">
								<button type="button" class="fba-mode-btn fba-mode-btn--active" data-mode="backend"><?php esc_html_e( 'Backend', 'neo-pulse-wp' ); ?></button>
								<button type="button" class="fba-mode-btn" data-mode="chat"><?php esc_html_e( 'Flow Chat', 'neo-pulse-wp' ); ?></button>
							</div>
							<?php endif; ?>
							<div class="fba-input-row" id="fba-input-row">
								<input
									type="text"
									id="fba-input"
									class="fba-input"
									placeholder="<?php esc_attr_e( 'Write with Flow Assist...', 'neo-pulse-wp' ); ?>"
									autocomplete="off"
									<?php echo $openrouter_ok ? '' : 'disabled'; ?>
								/>
								<button type="button" id="fba-send" class="fba-send" aria-label="<?php esc_attr_e( 'Hold to speak', 'neo-pulse-wp' ); ?>" <?php echo $openrouter_ok ? '' : 'disabled'; ?>>
									<span class="fba-send__icon fba-send__icon--send" aria-hidden="true">
										<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 8 16 12 12 16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
									</span>
								</button>
							</div>
						</div>
					</div>
				</div>
			</div>

		<style>
			.fba-page{display:flex;flex-direction:column;font-family:var(--fc-font,'NPWP Poppins',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif);font-size:14px}
			.fba-shell{display:flex;flex:1;flex-direction:row;min-height:calc(100vh - 32px - 300px);margin:0;padding:0;background:var(--npwp-panel,#fff);border-radius:22px;box-shadow:var(--npwp-card-shadow,0 12px 32px rgba(2,5,10,.05));overflow:hidden}

			/* Sidebar */
			.fba-sidebar{width:260px;min-width:260px;border-right:1px solid var(--npwp-line,#e3e8ee);display:flex;flex-direction:column;background:var(--npwp-field,#f6f8fa);padding:0}
			.fba-sidebar-header{padding:16px 16px 12px;border-bottom:1px solid var(--npwp-line,#e3e8ee)}
			.fba-sidebar-btn{display:inline-flex;align-items:center;gap:6px;padding:8px 14px;border-radius:8px;border:1px solid #dfe4ea;background:#fff;color:var(--npwp-text,#02050a);font-size:1rem;cursor:pointer;transition:all .15s;font-family:inherit;width:100%;justify-content:center}
			.fba-sidebar-btn:hover{background:#fff;border-color:var(--npwp-line-strong,#d3dae3);color:var(--npwp-text,#02050a)}
			.fba-sidebar-btn--new{background:linear-gradient(135deg,#97d400,#84bd00);border-color:transparent;color:var(--npwp-dark,#02050a);border-radius:999px;font-weight:600}
			.fba-sidebar-btn--new:hover{background:linear-gradient(135deg,#a3e000,#8fcc00);border-color:transparent;color:var(--npwp-dark,#02050a)}
			.fba-sidebar-btn--danger{background:#fff;border-color:var(--npwp-error-line,#f7c4bf);color:var(--npwp-error-ink,#b42318);border-radius:999px}
			.fba-sidebar-btn--danger:hover{background:var(--npwp-error-tint,#fef1f0);border-color:var(--npwp-error-line,#f7c4bf);color:var(--npwp-error-ink,#b42318)}
			.fba-sidebar-list{flex:1;overflow-y:auto;padding:8px;scrollbar-width:thin;scrollbar-color:rgba(2,5,10,.12) transparent}
			.fba-sidebar-empty{padding:20px 12px;text-align:center;color:var(--npwp-muted,#5f6b78);font-size:13px}
			.fba-sidebar-item{display:block;width:100%;text-align:left;padding:10px 12px;border-radius:10px;border:1px solid transparent;background:transparent;color:var(--npwp-text,#02050a);font-size:1rem;cursor:pointer;transition:all .12s;margin-bottom:2px;font-family:inherit;line-height:1.4}
			.fba-sidebar-item:hover{background:#fff;color:var(--npwp-text,#02050a)}
			.fba-sidebar-item--active{background:var(--npwp-lime-tint,#ecf6d4);color:var(--npwp-lime-ink,#3f6b00);border:1px solid var(--npwp-lime-line,#b9dd5c)}
			.fba-sidebar-item-title{font-weight:500;display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-bottom:2px}
			.fba-sidebar-item-meta{font-size:1rem;color:var(--npwp-muted,#5f6b78)}
			.fba-sidebar-footer{padding:12px 16px;border-top:1px solid var(--npwp-line,#e3e8ee)}

			/* Main area */
			.fba-main{flex:1;display:flex;flex-direction:column;min-height:0;max-width:760px;margin:0 auto;padding:40px 24px 24px;min-width:0}

			.fba-alert{background:var(--npwp-error-tint,#fef1f0);border:1px solid var(--npwp-error-line,#f7c4bf);border-radius:12px;padding:12px 18px;margin-bottom:20px;color:var(--npwp-error-ink,#b42318);font-size:14px}
			.fba-chat{flex:1;display:flex;flex-direction:column;position:relative}
			.fba-messages{flex:1;overflow-y:auto;display:flex;flex-direction:column;gap:14px;padding:0 0 20px;scrollbar-width:thin;scrollbar-color:rgba(2,5,10,.12) transparent;min-height:0}
			.fba-messages:empty{display:none}
			.fba-messages:not(:empty)+.fba-center{display:none}
			.fba-center{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;padding-bottom:80px}
			.fba-brand{font-size:22px;font-weight:600;color:var(--npwp-text,#02050a);margin:0;letter-spacing:0}
			.fba-subtitle{font-size:14px;color:var(--npwp-muted,#5f6b78);margin:0 0 20px}
			.fba-suggestions{display:flex;flex-wrap:wrap;justify-content:center;gap:8px;max-width:520px}
			.fba-chip{display:inline-flex;align-items:center;gap:6px;padding:8px 16px;border-radius:20px;border:1px solid #dfe4ea;background:#fff;color:var(--npwp-text,#02050a);font-size:1rem;cursor:pointer;transition:all .15s;font-family:inherit}
			.fba-chip:hover{background:var(--npwp-lime-tint,#ecf6d4);border-color:var(--npwp-lime-line,#b9dd5c);color:var(--npwp-lime-ink,#3f6b00);transform:translateY(-1px)}
			.fba-chip svg{opacity:.6;flex-shrink:0}
			.fba-input-wrap{position:sticky;bottom:0;padding:16px 0 0;background:linear-gradient(to top,var(--npwp-panel,#fff) 60%,rgba(255,255,255,0))}
			.fba-input-row{display:flex;align-items:center;gap:8px;background:var(--npwp-field,#f6f8fa);border:1px solid var(--npwp-line,#e3e8ee);border-radius:28px;padding:6px 8px 6px 16px;transition:border-color .2s,box-shadow .2s}
			.fba-input-row:focus-within{border-color:#84bd00;box-shadow:0 0 0 3px rgba(151,212,0,.18)}
			.fba-input{flex:1;background:transparent;border:none;outline:none;color:var(--npwp-text,#02050a);font-size:1rem;padding:8px 4px;font-family:inherit}
			.fba-input::placeholder{color:#8a95a3}
			.fba-input:disabled{opacity:.4;cursor:not-allowed}
			.fba-send{width:36px;height:36px;border-radius:50%;border:none;background:#84bd00;color:var(--npwp-dark,#02050a);cursor:pointer;display:flex;align-items:center;justify-content:center;transition:background .15s,transform .1s;flex-shrink:0;touch-action:none;user-select:none}
			.fba-send:hover:not(:disabled){background:#97d400;transform:scale(1.05)}
			.fba-send:disabled{opacity:.3;cursor:not-allowed}

			.fba-user{align-self:flex-end;max-width:75%;padding:10px 16px;border-radius:18px 18px 4px 18px;background:var(--npwp-dark,#02050a);color:#fff;font-size:1rem;line-height:1.6;animation:fbaFadeUp .2s ease}
			.fba-card{border-radius:16px;padding:16px 20px;background:var(--npwp-field,#f6f8fa);border:1px solid var(--npwp-line,#e3e8ee);font-size:1rem;line-height:1.7;color:var(--npwp-text,#02050a);animation:fbaSlideUp .25s ease}
			.fba-card-header{display:flex;align-items:center;gap:8px;margin-bottom:8px}
			.fba-card-badge{padding:3px 10px;border-radius:999px;font-size:1rem;font-weight:600;text-transform:uppercase;letter-spacing:.4px;background:#e9edf2;color:#475569}
			.fba-card-badge--action{background:var(--npwp-lime-tint,#ecf6d4);color:var(--npwp-lime-ink,#3f6b00)}
			.fba-card-badge--workflow{background:var(--npwp-lime-tint,#ecf6d4);color:var(--npwp-lime-ink,#3f6b00)}
			.fba-card-badge--prompt{background:#e9edf2;color:var(--npwp-text,#02050a)}
			.fba-card-badge--error{background:var(--npwp-error-tint,#fef1f0);color:var(--npwp-error-ink,#b42318)}
			.fba-card-title{font-weight:600;font-size:1rem;color:var(--npwp-text,#02050a)}
			.fba-card-body{color:#1e2a36;margin-top:4px}
			.fba-card-body a{color:var(--npwp-lime-ink,#3f6b00);text-decoration:underline;text-underline-offset:2px}
			.fba-card-body a:hover{color:var(--npwp-lime-ink-hover,#2d4d00)}
			.fba-card-body strong{font-weight:600;color:var(--npwp-text,#02050a)}
			.fba-card-links{display:flex;flex-wrap:wrap;gap:6px;margin-top:12px}
			.fba-pill{display:inline-flex;align-items:center;gap:4px;padding:6px 12px;border-radius:999px;background:#fff;border:1px solid #dfe4ea;font-size:1rem;text-decoration:none;color:var(--npwp-text,#02050a);transition:all .15s}
			.fba-pill:hover{background:#fff;border-color:var(--npwp-line-strong,#d3dae3);color:var(--npwp-text,#02050a);text-decoration:none}
			.fba-pill[aria-disabled='true']{opacity:.5;pointer-events:none}
			.fba-card-actions{display:flex;flex-wrap:wrap;gap:6px;margin-top:12px;padding-top:10px;border-top:1px solid var(--npwp-line,#e3e8ee)}
			.fba-action-chip{padding:5px 14px;border-radius:16px;border:1px solid #dfe4ea;background:#fff;color:var(--npwp-text,#02050a);font-size:1rem;cursor:pointer;transition:all .15s;font-family:inherit}
			.fba-action-chip:hover{background:var(--npwp-lime-tint,#ecf6d4);border-color:var(--npwp-lime-line,#b9dd5c);color:var(--npwp-lime-ink,#3f6b00)}
			.fba-workflow-steps{list-style:none;margin:12px 0 0;padding:0;display:flex;flex-direction:column;gap:8px}
			.fba-workflow-step{display:flex;align-items:flex-start;gap:10px;font-size:1rem;color:#1e2a36;line-height:1.5}
			.fba-workflow-step-icon{flex-shrink:0;width:1.25rem;text-align:center;line-height:1.5}
			.fba-workflow-step--running .fba-workflow-step-icon{color:#6a9a00}
			.fba-workflow-step--done .fba-workflow-step-icon{color:var(--npwp-lime-ink,#3f6b00)}
			.fba-workflow-step--error .fba-workflow-step-icon{color:var(--npwp-error-ink,#b42318)}
			.fba-workflow-step--pending .fba-workflow-step-icon{color:#8a95a3}
			.fba-workflow-step--plan .fba-workflow-step-label{font-weight:600;color:var(--npwp-lime-ink,#3f6b00)}
			.fba-workflow-step--micro{padding-left:1.25rem}
			.fba-card--workflow-active{border-color:var(--npwp-lime-line,#b9dd5c);animation:fbaNeonBreathe 2.8s ease-in-out infinite}
			.fba-workflow-step-icon--thinking{width:2rem;display:inline-flex;align-items:center;justify-content:center;text-align:center}
			.fba-workflow-step-icon--thinking svg{animation:fbaBrainPulse 1.4s ease-in-out infinite;filter:drop-shadow(0 0 6px rgba(132,189,0,.45))}
			.fba-loader{display:flex;gap:5px;padding:16px 0}
			.fba-loader span{width:7px;height:7px;border-radius:50%;background:rgba(2,5,10,.25);animation:fbaBounce 1.2s infinite}
			.fba-loader span:nth-child(2){animation-delay:.15s}
			.fba-loader span:nth-child(3){animation-delay:.3s}

			@keyframes fbaBounce{0%,60%,100%{transform:translateY(0);opacity:.3}30%{transform:translateY(-5px);opacity:1}}
			@keyframes fbaFadeUp{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
			@keyframes fbaSlideUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
			@keyframes fbaNeonBreathe{0%,100%{box-shadow:0 0 12px rgba(132,189,0,.12)}50%{box-shadow:0 0 22px rgba(132,189,0,.35)}}
			@keyframes fbaBrainPulse{0%,100%{transform:scale(.92);opacity:.85}50%{transform:scale(1.06);opacity:1}}

			@media(max-width:768px){
				.fba-shell{flex-direction:column}
				.fba-sidebar{width:100%;min-width:0;max-height:180px;border-right:none;border-bottom:1px solid var(--npwp-line,#e3e8ee)}
				.fba-main{padding:20px 16px 16px}
			}
			@media (prefers-reduced-motion:reduce){.fba-page *{animation:none!important;transition:none!important}}
		</style>
		<?php
		self::neo_pulse_group_shell_close();
	}
}
