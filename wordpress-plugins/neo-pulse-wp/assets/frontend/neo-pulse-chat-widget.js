/**
 * NEO Pulse Chat Widget – Dark Glassmorphism Edition
 *
 * Reads config from the global `neoPulseChatConfig` object injected by
 * wp_localize_script (ajaxUrl, streamNonce, siteName, welcomeMessage, color, assistantName).
 */
(function () {
  'use strict';

  var cfg = window.neoPulseChatConfig || {};
  if (!cfg.ajaxUrl) return;

  var root = document.getElementById('neo-pulse-chat-widget-root');
  if (!root) return;

  var ASSISTANT = cfg.assistantName || 'Pulse Assist';
  var UI = cfg.ui || {};
  // 0.9.236 look on the public site (the wp-admin assistant keeps its own styling).
  var MODERN = cfg.modern === true && !cfg.isWpAdmin;
  var SIDEBAR_SIDE = cfg.sidebarSide === 'left' ? 'left' : 'right';
  var LAUNCHER_STYLE = cfg.launcherStyle === 'edge_tab' || cfg.launcherStyle === 'none'
    ? cfg.launcherStyle
    : 'circle';
  var HIDE_LAUNCHER = LAUNCHER_STYLE === 'none';
  var SIDEBAR_TRANSITION = cfg.sidebarTransition || 'slide';
  var SIDEBAR_LAYOUT = Array.isArray(cfg.sidebarLayout) ? cfg.sidebarLayout : ['chat'];
  var SHOW_SIDEBAR_HEADING = SIDEBAR_LAYOUT.indexOf('heading') !== -1 && cfg.sidebarHeading;
  function cfgFlagOn(value) {
    return value === true || value === 1 || value === '1' || value === 'true';
  }
  var SHOW_CONTACT_HUMAN = cfgFlagOn(cfg.chekkitEnabled) && !!cfg.chekkitSubmitUrl;
  var CAN_COPY_LOG = cfg.canCopyLog === true;
  var CAN_BACKEND_MODE = cfg.canBackendMode === true;
  var SITE_INVENTORY_URL = cfg.siteInventoryUrl || '';
  var BACKEND_ASSIST_UNDO_URL = cfg.backendAssistUndoUrl || '';
  var SHOW_CHAT_BODY = SIDEBAR_LAYOUT.indexOf('chat') !== -1 || SIDEBAR_LAYOUT.length === 0;
  var sidebarShell = null;
  var isOpen = false;
  var history = [];
  var isLoading = false;
  var shellNodesMounted = false;

  function isMobileViewport() {
    return window.matchMedia && window.matchMedia('(max-width:767px)').matches;
  }

  function isEdgeTabDesktop() {
    return LAUNCHER_STYLE === 'edge_tab' && !isMobileViewport();
  }

  function lockMobileRootClosed() {
    if (!isMobileViewport()) return;
    root.hidden = true;
    root.setAttribute('aria-hidden', 'true');
    root.classList.add('fcw-mobile-root-closed');
    root.style.cssText = (cfg.cssVars || '') + ';display:none!important;visibility:hidden!important;position:absolute!important;left:-9999px!important;top:auto!important;width:0!important;height:0!important;max-width:0!important;overflow:hidden!important;pointer-events:none!important;margin:0!important;padding:0!important;border:0!important';
  }

  function showMobileRootForPanel() {
    if (!isMobileViewport()) return;
    root.hidden = false;
    root.removeAttribute('aria-hidden');
    root.classList.remove('fcw-mobile-root-closed');
    root.style.display = 'block';
    root.style.visibility = 'visible';
    root.style.position = 'fixed';
    root.style.inset = '0';
    root.style.left = '0';
    root.style.right = '0';
    root.style.top = '0';
    root.style.bottom = '0';
    root.style.width = 'auto';
    root.style.height = 'auto';
    root.style.maxWidth = 'none';
    root.style.overflow = 'visible';
    root.style.zIndex = '999950';
    root.style.pointerEvents = 'none';
    if (cfg.cssVars) {
      root.setAttribute('style', cfg.cssVars + ';display:block!important;visibility:visible!important;position:fixed!important;inset:0!important;left:0!important;right:0!important;top:0!important;bottom:0!important;width:auto!important;height:auto!important;max-width:none!important;overflow:visible!important;z-index:999950!important;pointer-events:none!important');
    }
  }

  lockMobileRootClosed();

  function applyLauncherStyle(launcher) {
    if (!launcher) return;
    launcher.classList.toggle('fcw-launcher--edge-tab', isEdgeTabDesktop());
    launcher.classList.toggle('fcw-launcher--side-left', SIDEBAR_SIDE === 'left' && isEdgeTabDesktop());
    if (isEdgeTabDesktop()) {
      var label = launcher.querySelector('.fcw-launcher__label');
      if (!label) {
        label = document.createElement('span');
        label.className = 'fcw-launcher__label';
        launcher.appendChild(label);
      }
      label.textContent = cfg.launcherLabel || ('Open ' + ASSISTANT);
      var glow = root && window.getComputedStyle(root).getPropertyValue('--fcw-launcher-glow');
      if (glow) {
        launcher.style.setProperty('--fcw-launcher-glow', glow.trim());
      }
      var dockText = root && window.getComputedStyle(root).getPropertyValue('--fcw-launcher-text');
      if (dockText) {
        launcher.style.setProperty('--fcw-launcher-text', dockText.trim());
        launcher.style.color = dockText.trim();
      }
      var panelH = root && window.getComputedStyle(root).getPropertyValue('--fcw-panel-max-height');
      if (panelH) {
        launcher.style.setProperty('--fcw-panel-max-height', panelH.trim());
      }
      var panelW = root && window.getComputedStyle(root).getPropertyValue('--fai-sidebar-width');
      if (panelW) {
        launcher.style.setProperty('--fai-sidebar-width', panelW.trim());
      }
    }
  }

  function removeFloatingLauncher() {
    var nodes = document.querySelectorAll('#neo-pulse-chat-mobile-launcher, .fcw-launcher, .fai-sidebar-launcher.fcw-launcher');
    for (var i = 0; i < nodes.length; i++) {
      var node = nodes[i];
      if (node && node.parentNode) {
        node.parentNode.removeChild(node);
      }
    }
    root.classList.remove('neo-pulse-chat--standalone-launcher');
  }

  function applyLauncherChrome() {
    if (HIDE_LAUNCHER) {
      removeFloatingLauncher();
      return;
    }
    var launcher = document.getElementById('neo-pulse-chat-mobile-launcher') || root.querySelector('.fcw-launcher');
    if (!launcher) return;
    launcher.id = 'neo-pulse-chat-mobile-launcher';
    launcher.classList.add('fcw-mobile-launcher', 'fai-sidebar-launcher', 'fcw-launcher');
    if (MODERN) {
      launcher.classList.add('fcw-launcher--modern');
    }
    launcher.setAttribute('data-fcw-chat-launcher', '1');
    launcher.setAttribute('aria-controls', 'neo-pulse-chat-widget-root');
    applyLauncherStyle(launcher);
    if (isMobileViewport()) {
      launcher.classList.remove('fcw-launcher--edge-tab', 'fcw-launcher--side-left', 'fcw-launcher--docked');
      launcher.style.position = 'fixed';
      launcher.style.bottom = '20px';
      launcher.style.right = '16px';
      launcher.style.left = 'auto';
      launcher.style.top = 'auto';
      launcher.style.width = '56px';
      launcher.style.height = '56px';
      launcher.style.minWidth = '56px';
      launcher.style.maxWidth = '56px';
      launcher.style.padding = '0';
      launcher.style.borderRadius = '50%';
      launcher.style.zIndex = '999900';
      launcher.style.pointerEvents = 'auto';
      launcher.style.transform = 'none';
    }
  }

  applyLauncherChrome();

  var SVG_DISMISS_RIGHT = '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M9 6l7 6-7 6V6z"/></svg>';
  var SVG_DISMISS_LEFT = '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M15 6l-7 6 7 6V6z"/></svg>';
  var SVG_TRASH = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>';
  var SVG_CLIPBOARD = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.75" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="1"/><rect x="4" y="4" width="11" height="11" rx="1"/></svg>';
  var SVG_SEND = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>';
  var SVG_ICON_PAGE = '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4 1h5.5L13 4.5V14a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1z"/><polyline points="9 1 9 5 13 5"/></svg>';
  var SVG_ICON_POST = '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="2" width="12" height="12" rx="1"/><line x1="5" y1="5" x2="11" y2="5"/><line x1="5" y1="8" x2="11" y2="8"/><line x1="5" y1="11" x2="8" y2="11"/></svg>';
  var SVG_ICON_EXT = '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 9v4a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h4"/><polyline points="8 2 14 2 14 8"/><line x1="14" y1="2" x2="7" y2="9"/></svg>';
  var SVG_ICON_EDIT = '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M11.5 1.5l3 3L5 14H2v-3L11.5 1.5z"/></svg>';
  var SVG_ICON_PREVIEW = '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="7" cy="7" r="4.5"/><line x1="10.5" y1="10.5" x2="14" y2="14"/></svg>';
  var SVG_CHAT_LAUNCHER = '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';
  var SVG_PHONE_LAUNCHER = '<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor" aria-hidden="true"><path d="M17 1H7C5.9 1 5 1.9 5 3v18c0 1.1.9 2 2 2h10c1.1 0 2-.9 2-2V3c0-1.1-.9-2-2-2zm-5 20c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1zm5-4H7V4h10v13z"/></svg>';
  var SVG_AI_SPARK = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3z"/><path d="M19 13l.75 2.25L22 16l-2.25.75L19 19l-.75-2.25L16 16l2.25-.75L19 13z"/></svg>';
  var SVG_MORE = '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><circle cx="12" cy="5" r="1.75"/><circle cx="12" cy="12" r="1.75"/><circle cx="12" cy="19" r="1.75"/></svg>';
  var SVG_DOWNLOAD = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12"/><polyline points="7 11 12 16 17 11"/><path d="M5 21h14"/></svg>';
  var STARTERS = Array.isArray(cfg.conversationStarters) ? cfg.conversationStarters : [];
  var BACKEND_STARTERS = Array.isArray(cfg.backendStarters) ? cfg.backendStarters : [];
  var VISITOR_GREETING_LINE = cfg.greetingLine || 'Hello';
  var VISITOR_GREETING_SUB = cfg.greetingSubline || 'How can I help you today?';
  var adminMode = 'visitor';
  var ADMIN_SUBMODES = ['ask', 'plan', 'build'];
  var ADMIN_SUBMODE_LABELS = { ask: 'Ask', plan: 'Plan', build: 'Build' };
  var adminSubmode = 'ask';
  var adminSubmodeBtn = null;
  // 0.9.232: Block Builder (SEO blocks) was removed, so pages are always built with Elementor widgets.
  var PAGE_CONTENT_MODES = ['elementor_widgets'];
  var PAGE_CONTENT_MODE_LABELS = { elementor_widgets: 'Elementor' };
  var pageContentMode = 'elementor_widgets';
  var pageContentModeBtn = null;
  var adminTargetScope = 'page';
  var scopeToggleWrap = null;
  var pendingBuildRerun = null;

  function normalizeSubmodeSwitchTopic(text) {
    var t = String(text || '').trim().toLowerCase();
    if (t === 'switch to build mode' || t === 'switch to build') return 'build';
    if (t === 'switch to plan mode' || t === 'switch to plan') return 'plan';
    if (t === 'switch to ask mode' || t === 'switch to ask') return 'ask';
    return '';
  }

  function lastUserMessageFromHistory() {
    for (var i = history.length - 1; i >= 0; i--) {
      if (history[i].role === 'user' && history[i].content) {
        return String(history[i].content).trim();
      }
    }
    return '';
  }

  var AGENT_STEP_LABELS = {
    seo_title: 'Generate SEO title',
    meta_description: 'Generate meta description',
    focus_keyword: 'Generate focus keyword',
    faq_schema: 'Generate FAQ schema',
    body_heading: 'Rewrite heading',
    body_section: 'Rewrite section',
    body_intro: 'Rewrite intro',
    body_faq_table: 'Build FAQ table',
    body_full_post: 'Rewrite post body',
    body_table: 'Build table',
    body_list: 'Format list',
    body_internal_links: 'Add internal links'
  };

  function messageRequestsMetaCompound(msg) {
    var lower = String(msg || '').toLowerCase();
    if (!lower) return false;
    return /\b(refresh|update|rewrite|regenerate|redo|new|change)\b/.test(lower)
      && /\b(meta|seo title|meta title|meta description|seo description)\b/.test(lower);
  }

  function resolveAgentIdsForMessage(msg) {
    var lower = String(msg || '').toLowerCase();
    if (!lower) return [];
    if (messageRequestsMetaCompound(msg)) {
      return ['seo_title', 'meta_description'];
    }
    if (/\bfaq\b/.test(lower) && /\b(schema|table)\b/.test(lower)) {
      return ['faq_schema', 'body_faq_table'];
    }
    if (/\bfocus keyword\b/.test(lower) && /\b(meta|title|description)\b/.test(lower)) {
      return ['focus_keyword', 'seo_title', 'meta_description'];
    }
    if (/\bfocus keyword\b/.test(lower)) {
      return ['focus_keyword'];
    }
    if (/\b(intro|h2|heading)\b/.test(lower) && /\b(change|rewrite|update|shorten|rename)\b/.test(lower)) {
      return ['body_heading', 'body_section'];
    }
    if (/\bconvert\b.*\btable\b/.test(lower)) {
      return ['body_table'];
    }
    return [];
  }

  function thinkingStepsFromAgentIds(agentIds) {
    var steps = (agentIds || []).map(function (id) {
      return { label: AGENT_STEP_LABELS[id] || id.replace(/_/g, ' '), status: 'pending' };
    });
    if (steps.length) {
      steps.push({ label: 'Upload to post', status: 'pending' });
      steps[0].status = 'running';
    }
    return steps.length ? steps : null;
  }

  function resolveBuildThinkingSteps(msg) {
    return thinkingStepsFromAgentIds(resolveAgentIdsForMessage(msg));
  }

  function dispatchMetaSavedEvent(card) {
    if (!card) return;
    var exec = card.action_result;
    if (!exec && card.details_drawer) {
      var drawer = card.details_drawer;
      var summary = drawer.result_summary || {};
      var row = drawer.target_row || {};
      var values = {};
      if (summary.seo_title) values.seoTitle = summary.seo_title;
      if (summary.meta_description) values.metaDescription = summary.meta_description;
      if (values.seoTitle || values.metaDescription) {
        exec = {
          success: (drawer.status_message || '').toLowerCase().indexOf('complete') >= 0,
          post_id: row.post_id || 0,
          saved: summary.saved_fields ? String(summary.saved_fields).split(',').map(function (s) { return s.trim(); }) : [],
          values: values
        };
      }
    }
    if (!exec || !exec.success || !exec.values) return;
    var saved = exec.saved || [];
    var hasMeta = saved.indexOf('title') >= 0 || saved.indexOf('excerpt') >= 0
      || !!exec.values.seoTitle || !!exec.values.metaDescription;
    if (!hasMeta) return;
    try {
      window.dispatchEvent(new CustomEvent('neo-pulse:meta-saved', {
        detail: {
          postId: exec.post_id || 0,
          values: exec.values,
          seoTitleOnly: saved.indexOf('title') >= 0 && saved.indexOf('excerpt') >= 0
        }
      }));
    } catch (_) {}
  }

  function resolveBuildMessage(card, skipPending) {
    if (card && card.build_message) {
      var fromCard = String(card.build_message).trim();
      if (fromCard && !normalizeSubmodeSwitchTopic(fromCard)) {
        return fromCard;
      }
    }
    if (!skipPending && pendingBuildRerun) {
      return pendingBuildRerun;
    }
    var last = lastUserMessageFromHistory();
    if (last && !normalizeSubmodeSwitchTopic(last)) {
      return last;
    }
    return '';
  }

  function rememberBuildRerunFromCard(card) {
    if (!card || !card.submode_switch || card.submode_switch !== 'build') return;
    var msg = resolveBuildMessage(card, true);
    if (msg) {
      pendingBuildRerun = msg;
    }
  }

  function handleSubmodeSwitch(mode, explicitMessage, options) {
    options = options || {};
    if (ADMIN_SUBMODES.indexOf(mode) < 0) return;
    setAdminSubmode(mode);
    if (mode !== 'build' || !isBackendMode()) return;
    var msg = explicitMessage || pendingBuildRerun;
    if (!msg || normalizeSubmodeSwitchTopic(msg)) return;
    pendingBuildRerun = null;
    if (isLoading && !options.fromPlanCta) return;
    sendMessage(msg, 'submode_rerun', { skipUserBubble: true });
  }

  function loadAdminMode() {
    if (!CAN_BACKEND_MODE) return;
    try {
      var stored = sessionStorage.getItem('neo_pulse_chat_admin_mode');
      if (stored === 'backend' || stored === 'visitor') {
        adminMode = stored;
        return;
      }
    } catch (_) {}
    if (cfg.isWpAdmin && cfg.defaultAdminMode === 'backend') {
      adminMode = 'backend';
    }
  }

  function saveAdminMode(mode) {
    adminMode = mode === 'backend' ? 'backend' : 'visitor';
    try {
      sessionStorage.setItem('neo_pulse_chat_admin_mode', adminMode);
    } catch (_) {}
  }

  function isBackendMode() {
    return CAN_BACKEND_MODE && adminMode === 'backend';
  }

  function getActiveStarters() {
    return isBackendMode() ? BACKEND_STARTERS : STARTERS;
  }

  function getGreetingLine() {
    return VISITOR_GREETING_LINE;
  }

  function getGreetingSubline() {
    if (!isBackendMode()) {
      return VISITOR_GREETING_SUB;
    }
    if (adminTargetScope === 'site') {
      if (adminSubmode === 'plan') {
        return 'Site mode: plan changes across the full site inventory.';
      }
      if (adminSubmode === 'build') {
        return 'Site mode: build against the full site, not the current page.';
      }
      return 'Site mode: full-site inventory and analytics.';
    }
    if (adminSubmode === 'plan') {
      return 'Plan mode: review proposed changes before building.';
    }
    if (adminSubmode === 'build') {
      return 'Build mode: can edit posts and pages.';
    }
    return 'Ask mode: analytics, SEO, and read-only site insights.';
  }

  function getAdminModeForApi() {
    return isBackendMode() ? 'backend' : 'visitor';
  }

  function loadAdminTargetScope() {
    if (!CAN_BACKEND_MODE) return;
    try {
      var stored = sessionStorage.getItem('neo_pulse_chat_target_scope');
      if (stored === 'page' || stored === 'site') {
        adminTargetScope = stored;
      }
    } catch (_) {}
  }

  function saveAdminTargetScope(scope) {
    adminTargetScope = scope === 'site' ? 'site' : 'page';
    try {
      sessionStorage.setItem('neo_pulse_chat_target_scope', adminTargetScope);
    } catch (_) {}
  }

  function getTargetScopeForApi() {
    return isBackendMode() ? adminTargetScope : 'page';
  }

  function getEffectivePostIdForApi() {
    if (!isBackendMode() || adminTargetScope === 'site') {
      return 0;
    }
    var pageCtx = cfg.pageContext || {};
    return pageCtx.postId || 0;
  }

  function loadAdminSubmode() {
    if (!CAN_BACKEND_MODE) return;
    try {
      var stored = sessionStorage.getItem('neo_pulse_chat_admin_submode');
      if (stored === 'ask' || stored === 'plan' || stored === 'build') {
        adminSubmode = stored;
      }
    } catch (_) {}
  }

  function saveAdminSubmode(mode) {
    if (ADMIN_SUBMODES.indexOf(mode) < 0) {
      mode = 'ask';
    }
    adminSubmode = mode;
    try {
      sessionStorage.setItem('neo_pulse_chat_admin_submode', adminSubmode);
    } catch (_) {}
  }

  function getAdminSubmodeForApi() {
    return isBackendMode() ? adminSubmode : '';
  }

  function loadPageContentMode() {
    if (!CAN_BACKEND_MODE) return;
    try {
      var stored = sessionStorage.getItem('neo_pulse_page_content_mode');
      if (stored === 'elementor_widgets') {
        pageContentMode = stored;
      }
    } catch (_) {}
  }

  function savePageContentMode(mode) {
    if (PAGE_CONTENT_MODES.indexOf(mode) < 0) {
      mode = 'elementor_widgets';
    }
    pageContentMode = mode;
    try {
      sessionStorage.setItem('neo_pulse_page_content_mode', pageContentMode);
    } catch (_) {}
  }

  function getPageContentModeForApi() {
    return 'elementor_widgets';
  }

  function togglePageContentMode() {
    savePageContentMode('elementor_widgets');
    updatePageContentModeUi();
  }

  function updatePageContentModeUi() {
    if (!pageContentModeBtn) return;
    pageContentModeBtn.hidden = true; // Only one mode left, so the toggle stays hidden.
    pageContentModeBtn.textContent = PAGE_CONTENT_MODE_LABELS[pageContentMode] || 'Elementor';
    pageContentModeBtn.classList.toggle(
      'fcw-page-content-pill--elementor',
      pageContentMode === 'elementor_widgets'
    );
    pageContentModeBtn.setAttribute(
      'aria-label',
      'Page content: ' + (PAGE_CONTENT_MODE_LABELS[pageContentMode] || 'Elementor') + '.'
    );
  }

  function updateTargetScopeUi() {
    if (!scopeToggleWrap) return;
    scopeToggleWrap.hidden = !isBackendMode();
    scopeToggleWrap.style.display = isBackendMode() ? '' : 'none';
    var btns = scopeToggleWrap.querySelectorAll('.fcw-scope-btn');
    for (var i = 0; i < btns.length; i++) {
      var on = btns[i].getAttribute('data-scope') === adminTargetScope;
      btns[i].classList.toggle('fcw-scope-btn--active', on);
      btns[i].setAttribute('aria-pressed', on ? 'true' : 'false');
    }
  }

  function setAdminTargetScope(scope) {
    saveAdminTargetScope(scope);
    updateTargetScopeUi();
    refreshEmptyState();
    if (window.NeoPulseChatPrefetch) {
      NeoPulseChatPrefetch.refreshOptions(prefetchOptions());
      if (scope === 'page' && cfg.pageContext) {
        NeoPulseChatPrefetch.warmPageContext(cfg.pageContext, prefetchOptions());
      }
    }
  }

  function updateAdminSubmodeUi() {
    if (!adminSubmodeBtn) return;
    adminSubmodeBtn.hidden = !isBackendMode();
    ADMIN_SUBMODES.forEach(function (m) {
      adminSubmodeBtn.classList.toggle('fcw-admin-submode--' + m, adminSubmode === m);
    });
    var labelEl = adminSubmodeBtn.querySelector('.fcw-admin-submode__label');
    if (labelEl) {
      labelEl.textContent = ADMIN_SUBMODE_LABELS[adminSubmode] || 'Ask';
    }
    adminSubmodeBtn.setAttribute(
      'aria-label',
      'God Mode: ' + (ADMIN_SUBMODE_LABELS[adminSubmode] || 'Ask') + '. Shift+Tab to change.'
    );
    if (sendBtn) {
      sendBtn.classList.toggle('fcw-send--build', isBackendMode() && adminSubmode === 'build');
    }
  }

  function setAdminSubmode(mode) {
    saveAdminSubmode(mode);
    updateAdminSubmodeUi();
    refreshEmptyState();
  }

  function cycleAdminSubmode() {
    var idx = ADMIN_SUBMODES.indexOf(adminSubmode);
    var next = ADMIN_SUBMODES[(idx + 1) % ADMIN_SUBMODES.length];
    setAdminSubmode(next);
  }

  loadAdminMode();
  loadAdminSubmode();
  loadPageContentMode();
  loadAdminTargetScope();

  var GREETING_LINE = getGreetingLine();
  var GREETING_SUB = getGreetingSubline();
  var COMPOSER_PLACEHOLDER = cfg.composerPlaceholder || ('Ask about ' + (cfg.siteName || 'this site') + '\u2026');

  function uiOn(key) {
    return UI[key] !== false;
  }

  function showSourcePills() {
    return uiOn('source_pills') || isBackendMode();
  }

  function getChatSessionId() {
    var key = 'neo_pulse_chat_session_id';
    var id = sessionStorage.getItem(key);
    if (!id) {
      id = 'csess_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
      sessionStorage.setItem(key, id);
    }
    return id;
  }

  function mintConversationId() {
    return 'conv_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
  }

  function getConversationId() {
    var key = 'neo_pulse_chat_conversation_id';
    var id = sessionStorage.getItem(key);
    if (!id) {
      id = mintConversationId();
      sessionStorage.setItem(key, id);
    }
    return id;
  }

  function rotateConversationId() {
    var id = mintConversationId();
    sessionStorage.setItem('neo_pulse_chat_conversation_id', id);
    return id;
  }

  function initDebugLogSession() {
    if (!window.NeoPulseChatDebugLog || !CAN_COPY_LOG) return;
    NeoPulseChatDebugLog.createSession({
      sessionId: getChatSessionId(),
      conversationId: getConversationId(),
      source: cfg.isWpAdmin ? 'wp-admin' : 'frontend',
      pageUrl: window.location.href || '',
      siteName: cfg.siteName || '',
      godModePersist: useGodModeHistoryStorage(),
      persistUserId: cfg.currentUserId || 0
    });
  }

  var GODMODE_HISTORY_MAX = 20;
  var VISITOR_HISTORY_MAX = 10;

  function useGodModeHistoryStorage() {
    return !!(cfg.isWpAdmin && isBackendMode());
  }

  function godModeHistoryStorageKey() {
    var uid = cfg.currentUserId ? String(cfg.currentUserId) : '0';
    return 'neo-pulse_godmode_chat_' + uid;
  }

  function historyStorageKey() {
    if (useGodModeHistoryStorage()) {
      return godModeHistoryStorageKey();
    }
    return 'neo_pulse_chat_history_' + getChatSessionId();
  }

  function historyStorage() {
    return useGodModeHistoryStorage() ? localStorage : sessionStorage;
  }

  function historyMaxTurns() {
    return useGodModeHistoryStorage() ? GODMODE_HISTORY_MAX : VISITOR_HISTORY_MAX;
  }

  function loadHistory() {
    try {
      var raw = historyStorage().getItem(historyStorageKey());
      if (raw) {
        var parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          history = parsed;
        }
      }
    } catch (_) {}
  }

  function saveHistory() {
    try {
      historyStorage().setItem(historyStorageKey(), JSON.stringify(history.slice(-historyMaxTurns())));
    } catch (_) {}
  }

  function snapshotCardForHistory(card) {
    if (!card || typeof card !== 'object') return null;
    var snap = {
      type: card.type ? String(card.type).slice(0, 40) : '',
      title: card.title ? String(card.title).slice(0, 120) : '',
      body: card.body ? String(card.body).slice(0, 400) : '',
      confidence: card.confidence ? String(card.confidence).slice(0, 20) : '',
      cta: card.cta || null,
      submode_switch: card.submode_switch || '',
      links: Array.isArray(card.links) ? card.links.slice(0, 6) : undefined,
      relatedTopics: Array.isArray(card.relatedTopics) ? card.relatedTopics.slice(0, 8) : undefined
    };
    if (card.action_result && card.action_result.post_id) {
      snap.action_result = {
        post_id: card.action_result.post_id,
        title: card.action_result.title ? String(card.action_result.title).slice(0, 120) : ''
      };
    }
    if (card.details_drawer) {
      snap.details_drawer = card.details_drawer;
    }
    if (card.harness_sections) {
      snap.harness_sections = card.harness_sections;
    }
    if (card.harness_progress) {
      snap.harness_progress = card.harness_progress;
    }
    if (card.build_message) {
      snap.build_message = String(card.build_message).slice(0, 400);
    }
    if (card.workflow_id) {
      snap.workflow_id = String(card.workflow_id).slice(0, 80);
    }
    if (Array.isArray(card.steps) && card.steps.length) {
      snap.steps = card.steps.slice(0, 24).map(function (step) {
        return {
          label: step && step.label ? String(step.label).slice(0, 160) : '',
          status: step && step.status ? String(step.status).slice(0, 20) : 'pending',
          tool: step && step.tool ? String(step.tool).slice(0, 60) : '',
          executable: step && step.executable !== false
        };
      });
    }
    return snap;
  }

  function assistantSummaryFromCard(card) {
    var summary = card.title || (card.body ? String(card.body).slice(0, 160) : '');
    if (card.action_result && card.action_result.post_id) {
      summary += ' [post_id=' + card.action_result.post_id +
        ', title="' + (card.action_result.title || '') + '"]';
    }
    return summary;
  }

  function pushHistoryTurn(role, content, card) {
    var turn = { role: role, content: content || '' };
    if (role === 'assistant' && card) {
      turn.content = assistantSummaryFromCard(card);
      turn.card = snapshotCardForHistory(card);
      if (card.action_result && card.action_result.post_id) {
        turn.action_result = {
          post_id: card.action_result.post_id,
          title: card.action_result.title ? String(card.action_result.title).slice(0, 120) : ''
        };
      }
    }
    history.push(turn);
    saveHistory();
  }

  function historyForApi() {
    if (window.NeoPulseChatPrefetch && typeof window.NeoPulseChatPrefetch.minifyHistoryForApi === 'function') {
      return NeoPulseChatPrefetch.minifyHistoryForApi(history);
    }
    return history.slice(-6);
  }

  loadHistory();

  function buildContactHumanModule() {
    var ctaLabel = cfg.chekkitCtaLabel || 'Send Us A Text';
    var formTitle = ctaLabel;
    var expanded = false;
    var submitting = false;

    var toggleBtn = el('button', {
      type: 'button',
      className: 'fcw-contact-human__cta fcw-composer-human-cta',
      'aria-expanded': 'false',
      'aria-haspopup': 'dialog'
    });
    toggleBtn.textContent = 'Talk to a human';

    var overlay = el('div', {
      className: 'fcw-contact-human__overlay',
      hidden: ''
    });
    var card = el('div', {
      className: 'fcw-contact-human__card',
      role: 'dialog',
      'aria-modal': 'true',
      'aria-label': formTitle
    });
    var closeBtn = el('button', {
      type: 'button',
      className: 'fcw-contact-human__close',
      'aria-label': 'Close'
    });
    closeBtn.innerHTML = '&times;';

    var formHeading = el('h3', { className: 'fcw-contact-human__form-heading' });
    formHeading.textContent = formTitle;

    var formIntro = el('p', { className: 'fcw-contact-human__form-intro' });
    formIntro.textContent = 'Submit your information and one of our specialists will get back to you as soon as possible.';

    var form = el('form', { className: 'fcw-contact-human__form' });
    var noticeSlot = el('div', { className: 'fcw-contact-human__notice-slot' });
    var statusEl = el('p', { className: 'fcw-contact-human__status', role: 'status', 'aria-live': 'polite' });

    function fieldWrap(name) {
      return el('div', { className: 'fcw-contact-human__field', 'data-field': name });
    }

    function addField(wrap, input, name, label, example) {
      input.setAttribute('placeholder', example);
      input.setAttribute('aria-label', label);
      wrap.appendChild(input);
      var labelEl = el('label', { className: 'fcw-contact-human__label', for: input.id });
      labelEl.textContent = label;
      wrap.appendChild(labelEl);
      wrap.appendChild(el('p', { className: 'fcw-contact-human__error', 'data-field': name, hidden: '' }));
    }

    function clearErrors() {
      form.querySelectorAll('.fcw-contact-human__error').forEach(function (node) {
        node.hidden = true;
        node.textContent = '';
      });
      statusEl.textContent = '';
      statusEl.classList.remove(
        'fcw-contact-human__status--error',
        'fcw-contact-human__status--success',
        'fcw-contact-human__status--visible'
      );
      submitBtn.disabled = false;
      submitBtn.textContent = 'Send Message';
    }

    function fieldError(name) {
      return form.querySelector('.fcw-contact-human__error[data-field="' + name + '"]');
    }

    var nameWrap = fieldWrap('name');
    var nameInput = el('input', {
      type: 'text',
      className: 'fcw-contact-human__input',
      id: 'fcw-contact-name',
      name: 'name',
      required: true,
      autocomplete: 'name'
    });
    addField(nameWrap, nameInput, 'name', 'Name', 'Jane Smith');

    var phoneWrap = fieldWrap('phone');
    var phoneInput = el('input', {
      type: 'tel',
      className: 'fcw-contact-human__input',
      id: 'fcw-contact-phone',
      name: 'phone',
      required: true,
      autocomplete: 'tel'
    });
    addField(phoneWrap, phoneInput, 'phone', 'Phone', '555-123-4567');

    var emailWrap = fieldWrap('email');
    var emailInput = el('input', {
      type: 'email',
      className: 'fcw-contact-human__input',
      id: 'fcw-contact-email',
      name: 'email',
      autocomplete: 'email'
    });
    addField(emailWrap, emailInput, 'email', 'Email', 'jane@example.com');

    var messageWrap = fieldWrap('message');
    messageWrap.classList.add('fcw-contact-human__field--message');
    var messageInput = el('textarea', {
      className: 'fcw-contact-human__textarea',
      id: 'fcw-contact-message',
      name: 'message',
      rows: 3
    });
    addField(messageWrap, messageInput, 'message', 'Message', 'How can we help?');

    var honeypot = el('input', {
      type: 'text',
      className: 'fcw-contact-human__hp',
      name: 'neo-pulse_hp',
      tabindex: '-1',
      autocomplete: 'off',
      'aria-hidden': 'true'
    });

    var submitBtn = el('button', {
      type: 'submit',
      className: 'fcw-contact-human__submit'
    });
    submitBtn.textContent = 'Send Message';

    var siteLabel = (cfg.siteName && String(cfg.siteName).trim()) ? String(cfg.siteName).trim() : 'us';
    var termsUrl = ((window.location && window.location.origin) ? window.location.origin : '').replace(/\/$/, '') + '/terms';
    var disclaimer = el('p', { className: 'fcw-contact-human__disclaimer' });
    disclaimer.appendChild(document.createTextNode(
      'By submitting, you authorize ' + siteLabel + ' to text/call the number above with offers & other information. Msg/data rates apply, msg frequency varies. Consent is not a condition of purchase. See '
    ));
    var termsLink = el('a', { href: termsUrl });
    termsLink.textContent = 'terms';
    disclaimer.appendChild(termsLink);
    disclaimer.appendChild(document.createTextNode('. Text HELP for help and STOP to unsubscribe.'));

    form.appendChild(nameWrap);
    form.appendChild(phoneWrap);
    form.appendChild(emailWrap);
    form.appendChild(messageWrap);
    form.appendChild(honeypot);
    form.appendChild(disclaimer);
    form.appendChild(submitBtn);

    card.appendChild(closeBtn);
    card.appendChild(formHeading);
    card.appendChild(formIntro);
    card.appendChild(form);
    noticeSlot.appendChild(statusEl);
    card.appendChild(noticeSlot);
    overlay.appendChild(card);

    function setExpanded(next) {
      expanded = next;
      toggleBtn.setAttribute('aria-expanded', expanded ? 'true' : 'false');
      toggleBtn.classList.toggle('fcw-contact-human__cta--open', expanded);
      overlay.hidden = !expanded;
      if (expanded) {
        nameInput.focus();
      } else {
        clearErrors();
        toggleBtn.focus();
      }
    }

    function closeModal() {
      if (expanded) setExpanded(false);
    }

    toggleBtn.addEventListener('click', function () {
      setExpanded(!expanded);
    });

    closeBtn.addEventListener('click', closeModal);

    document.addEventListener('keydown', function (evt) {
      if (!expanded) return;
      if (evt.key === 'Escape') {
        evt.preventDefault();
        closeModal();
      }
    });

    form.addEventListener('submit', function (evt) {
      evt.preventDefault();
      if (submitting || !cfg.chekkitSubmitUrl) return;
      clearErrors();
      submitting = true;
      submitBtn.disabled = true;
      submitBtn.textContent = 'Sending…';

      fetch(cfg.chekkitSubmitUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-WP-Nonce': cfg.nonce
        },
        body: JSON.stringify({
          name: nameInput.value.trim(),
          phone: phoneInput.value.trim(),
          email: emailInput.value.trim(),
          message: messageInput.value.trim(),
          'neo-pulse_hp': honeypot.value,
          source_url: window.location.href || ''
        })
      })
        .then(function (res) {
          return res.json().then(function (data) {
            return { ok: res.ok, data: data || {} };
          });
        })
        .then(function (result) {
          if (result.ok && result.data.success) {
            form.reset();
            statusEl.textContent = result.data.message || "Thanks! We'll be in touch soon.";
            statusEl.classList.add('fcw-contact-human__status--success', 'fcw-contact-human__status--visible');
            return;
          }
          if (result.data.errors && typeof result.data.errors === 'object') {
            Object.keys(result.data.errors).forEach(function (key) {
              var errNode = fieldError(key);
              if (errNode) {
                errNode.textContent = result.data.errors[key];
                errNode.hidden = false;
              }
            });
          }
          statusEl.textContent = result.data.message || 'Unable to send your request. Please try again.';
          statusEl.classList.add('fcw-contact-human__status--error', 'fcw-contact-human__status--visible');
        })
        .catch(function () {
          statusEl.textContent = 'Unable to send your request. Please try again.';
          statusEl.classList.add('fcw-contact-human__status--error', 'fcw-contact-human__status--visible');
        })
        .finally(function () {
          submitting = false;
          submitBtn.disabled = false;
          submitBtn.textContent = 'Send Message';
        });
    });

    document.body.appendChild(overlay);

    return {
      toolbarBtn: toggleBtn,
      overlay: overlay,
      open: function () {
        setExpanded(true);
      }
    };
  }

  initDebugLogSession();

  function recordChatAccept(messageId, url, label, type) {
    if (!messageId || !cfg.acceptUrl) return;
    fetch(cfg.acceptUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-WP-Nonce': cfg.nonce
      },
      body: JSON.stringify({
        messageId: messageId,
        url: url,
        label: label,
        type: type
      }),
      keepalive: true
    }).catch(function () {});
  }

  function bindAcceptClick(anchor, card, type, label) {
    if (!card || !card.message_uid) return;
    anchor.addEventListener('click', function () {
      recordChatAccept(
        card.message_uid,
        anchor.href || '',
        label || anchor.textContent || '',
        type
      );
    });
  }

  function appendCardCtas(cardEl, card) {
    if (!uiOn('cta_buttons') || !cardEl || !card) return;
    var hasPageCta = !!(card.cta && card.cta.url);
    var humanCta = card.contactHumanCta;
    var hasHumanCta = !!(humanCta && humanCta.action === 'contact_human' && contactHuman);
    var hasSubmodeSwitch = !!(card.submode_switch && ADMIN_SUBMODES.indexOf(card.submode_switch) >= 0);
    if (!hasPageCta && !hasHumanCta && !hasSubmodeSwitch) return;

    var ctaWrap = el('div', { className: 'fcw-card__cta-wrap' });
    if (hasSubmodeSwitch) {
      var switchLabel = 'Switch to ' + (ADMIN_SUBMODE_LABELS[card.submode_switch] || 'Build') + ' mode';
      var switchBtn = el('button', {
        className: 'fcw-cta-btn fcw-cta-btn--submode fcw-cta-btn--submode-' + card.submode_switch,
        type: 'button'
      });
      switchBtn.textContent = switchLabel;
      switchBtn.addEventListener('click', function () {
        if (card.submode_switch === 'build') {
          handleSubmodeSwitch('build', resolveBuildMessage(card), { fromPlanCta: true });
          return;
        }
        handleSubmodeSwitch(card.submode_switch);
      });
      ctaWrap.appendChild(switchBtn);
    }
    if (hasHumanCta) {
      var humanLabel = (humanCta.label && String(humanCta.label).trim()) ? String(humanCta.label).trim() : 'Send Us A Text';
      var humanBtn = el('a', {
        className: 'fcw-cta-btn',
        href: '#',
        role: 'button'
      });
      humanBtn.textContent = humanLabel;
      humanBtn.addEventListener('click', function (evt) {
        evt.preventDefault();
        contactHuman.open();
      });
      bindAcceptClick(humanBtn, card, 'cta', humanLabel);
      ctaWrap.appendChild(humanBtn);
    } else if (hasPageCta) {
      var pageCta = el('a', {
        className: 'fcw-cta-btn',
        href: card.cta.url
      });
      pageCta.textContent = (card.cta.label && String(card.cta.label).trim()) ? String(card.cta.label).trim() : 'Learn more';
      pageCta.addEventListener('click', function () {
        if (sidebarShell && typeof sidebarShell.close === 'function') {
          sidebarShell.close();
        } else {
          closeStandalonePanel();
        }
      });
      bindAcceptClick(pageCta, card, 'cta', pageCta.textContent);
      ctaWrap.appendChild(pageCta);
    }
    cardEl.appendChild(ctaWrap);
  }

  // ── DOM scaffold ──────────────────────────────────────────────

  var savedLauncher = document.getElementById('neo-pulse-chat-mobile-launcher') || root.querySelector('.fcw-launcher');
  var child = root.firstChild;
  while (child) {
    var next = child.nextSibling;
    if (child !== savedLauncher) {
      root.removeChild(child);
    }
    child = next;
  }
  var hideMap = {
    header: 'fcw-hide-header',
    assistant_name: 'fcw-hide-assistant-name',
    close_button: 'fcw-hide-close-button',
    thinking_card: 'fcw-hide-thinking-card',
    source_pills: 'fcw-hide-source-pills',
    cta_buttons: 'fcw-hide-cta-buttons',
    suggestion_chips: 'fcw-hide-suggestion-chips',
    confidence: 'fcw-hide-confidence',
    type_badge: 'fcw-hide-type-badge',
    send_button: 'fcw-hide-send-button'
  };

  function syncRootShellState(panelOpen) {
    var keepOpen = !!(panelOpen || isOpen);
    var hideClasses = '';
    Object.keys(hideMap).forEach(function (k) {
      if (isBackendMode() && (k === 'source_pills' || k === 'cta_buttons')) {
        return;
      }
      if (!uiOn(k)) hideClasses += ' ' + hideMap[k];
    });
    if (isMobileViewport() && !keepOpen) {
      root.className = ('neo-pulse-chat-widget neo-pulse-chat--standalone-launcher' + hideClasses + (MODERN ? ' fcw-modern' : '')).trim();
      lockMobileRootClosed();
      return;
    }
    var nextClass = (
      'neo-pulse-chat-widget neo-pulse-chat--sidebar neo-pulse-chat--standalone-launcher fai-sidebar-root fai-sidebar-root--' +
      SIDEBAR_SIDE + ' fai-sidebar-root--transition-' + SIDEBAR_TRANSITION + hideClasses
    ).trim();
    if (keepOpen) {
      nextClass += ' fai-sidebar-root--open';
    }
    if (isEdgeTabDesktop()) {
      nextClass += ' fai-sidebar-root--edge-tab';
    }
    if (isBackendMode()) {
      nextClass += ' fcw--super-admin-mode';
    }
    if (MODERN) {
      nextClass += ' fcw-modern';
      if (!uiOn('avatar')) nextClass += ' fcw-hide-avatar';
      if (!uiOn('powered_by')) nextClass += ' fcw-hide-powered-by';
    }
    root.className = nextClass;
    if (!keepOpen) {
      root.classList.remove('fai-sidebar-root--open');
    }
    if (cfg.cssVars) {
      if (isMobileViewport() && keepOpen) {
        root.setAttribute(
          'style',
          cfg.cssVars + ';display:block!important;visibility:visible!important;position:fixed!important;inset:0!important;left:0!important;right:0!important;top:0!important;bottom:0!important;width:100%!important;height:100%!important;max-width:none!important;overflow:visible!important;z-index:999950!important;pointer-events:none!important'
        );
      } else if (!isMobileViewport() || keepOpen) {
        root.setAttribute('style', cfg.cssVars);
      }
    }
  }

  function attachEdgeTabToPanel() {
    if (!isEdgeTabDesktop() || !panel) return;
    var launcher = getStandaloneLauncher();
    if (!launcher) return;
    if (launcher.parentNode !== panel) {
      panel.appendChild(launcher);
    }
    launcher.classList.add('fcw-launcher--docked');
    root.classList.add('fai-sidebar-root--edge-tab');
    panel.removeAttribute('hidden');
  }

  function mountShellNodes() {
    if (shellNodesMounted) return;
    shellNodesMounted = true;
    if (backdrop && !backdrop.parentNode) root.appendChild(backdrop);
    if (panel && !panel.parentNode) root.appendChild(panel);
    attachEdgeTabToPanel();
  }

  function unmountShellNodes() {
    if (backdrop && backdrop.parentNode) backdrop.parentNode.removeChild(backdrop);
    if (panel && panel.parentNode) panel.parentNode.removeChild(panel);
    shellNodesMounted = false;
  }

  function teardownShellIfMobile() {
    if (!isMobileViewport()) return;
    unmountShellNodes();
    syncRootShellState(false);
    lockMobileRootClosed();
  }

  syncRootShellState(false);

  var backdrop = el('div', { className: 'fai-sidebar-backdrop', 'aria-hidden': 'true', hidden: '' });

  var panel = el('div', {
    className: 'fai-sidebar-panel fcw-panel fcw-panel--sidebar'
  });

  var closeBtn = el('button', {
    type: 'button',
    className: 'fai-sidebar-close fcw-toolbar-icon-btn',
    'aria-label': 'Close chat',
    innerHTML: SIDEBAR_SIDE === 'left' ? SVG_DISMISS_LEFT : SVG_DISMISS_RIGHT
  });
  var clearBtn = el('button', {
    type: 'button',
    className: 'fcw-toolbar-icon-btn',
    'aria-label': 'Clear chat',
    innerHTML: SVG_TRASH
  });
  var copyLogBtn = null;
  if (CAN_COPY_LOG) {
    copyLogBtn = el('button', {
      type: 'button',
      className: 'fcw-toolbar-icon-btn',
      'aria-label': 'Copy log',
      innerHTML: SVG_CLIPBOARD
    });
  }
  var inventoryBtn = null;
  if (CAN_COPY_LOG) {
    inventoryBtn = el('button', {
      type: 'button',
      className: 'fcw-toolbar-icon-btn fcw-inventory-download',
      'aria-label': 'Download conversation log',
      innerHTML: SVG_DOWNLOAD
    });
  }
  var toolbarLeading = el('div', { className: 'fcw-toolbar-leading' });
  var toolbarActions = el('div', { className: 'fai-sidebar-toolbar-actions' });
  var modeToggleWrap = null;
  var startersWrapEl = null;
  var greetingEl = null;
  var greetingSubEl = null;

  function refreshEmptyState() {
    GREETING_LINE = getGreetingLine();
    GREETING_SUB = getGreetingSubline();
    if (greetingEl) greetingEl.textContent = GREETING_LINE;
    if (greetingSubEl) greetingSubEl.textContent = GREETING_SUB;
    if (root) {
      root.classList.toggle('fcw--super-admin-mode', isBackendMode());
    }
    updateInventoryMenuUi();
    if (!startersWrapEl || !uiOn('suggestion_chips')) return;
    while (startersWrapEl.firstChild) {
      startersWrapEl.removeChild(startersWrapEl.firstChild);
    }
    getActiveStarters().forEach(function (prompt) {
      var chip = el('button', {
        type: 'button',
        className: 'fcw-starter',
        'data-prompt': prompt
      });
      chip.textContent = prompt;
      chip.addEventListener('click', function () {
        var text = chip.getAttribute('data-prompt') || chip.textContent || '';
        if (text.trim()) deliverMessage(text.trim(), 'starter');
      });
      startersWrapEl.appendChild(chip);
    });
    if (window.NeoPulseChatPrefetch && !isBackendMode() && chatPrefetchAllowed()) {
      NeoPulseChatPrefetch.prefetchSuggestions(getActiveStarters(), prefetchOptions());
    }
  }

  function setAdminMode(mode) {
    saveAdminMode(mode);
    refreshEmptyState();
    updateAdminSubmodeUi();
    updatePageContentModeUi();
    updateTargetScopeUi();
    syncRootShellState(root.classList.contains('fai-sidebar-root--open'));
    if (mode === 'backend') {
      warmSiteInventory();
    }
    if (modeToggleWrap) {
      modeToggleWrap.classList.toggle('fcw-mode-toggle--visitor', adminMode === 'visitor');
      modeToggleWrap.classList.toggle('fcw-mode-toggle--backend', adminMode === 'backend');
      var btns = modeToggleWrap.querySelectorAll('.fcw-mode-btn');
      for (var i = 0; i < btns.length; i++) {
        var on = btns[i].getAttribute('data-mode') === adminMode;
        btns[i].classList.toggle('fcw-mode-btn--active', on);
        btns[i].setAttribute('aria-pressed', on ? 'true' : 'false');
      }
    }
  }

  if (CAN_BACKEND_MODE) {
    modeToggleWrap = el('div', {
      className: 'fcw-mode-toggle',
      role: 'group',
      'aria-label': 'God Mode'
    });
    var visitorModeBtn = el('button', {
      type: 'button',
      className: 'fcw-mode-btn fcw-mode-btn--active',
      'data-mode': 'visitor',
      'aria-pressed': 'true'
    });
    visitorModeBtn.textContent = 'Visitor';
    var backendModeBtn = el('button', {
      type: 'button',
      className: 'fcw-mode-btn',
      'data-mode': 'backend',
      'aria-pressed': 'false'
    });
    backendModeBtn.textContent = 'God Mode';
    modeToggleWrap.appendChild(visitorModeBtn);
    modeToggleWrap.appendChild(backendModeBtn);
    visitorModeBtn.addEventListener('click', function (evt) {
      evt.preventDefault();
      evt.stopPropagation();
      setAdminMode('visitor');
    });
    backendModeBtn.addEventListener('click', function (evt) {
      evt.preventDefault();
      evt.stopPropagation();
      setAdminMode('backend');
    });

    scopeToggleWrap = el('div', {
      className: 'fcw-scope-toggle',
      role: 'group',
      'aria-label': 'Target context'
    });
    var pageScopeBtn = el('button', {
      type: 'button',
      className: 'fcw-scope-btn fcw-scope-btn--active',
      'data-scope': 'page',
      'aria-pressed': 'true'
    });
    pageScopeBtn.textContent = 'Page';
    var siteScopeBtn = el('button', {
      type: 'button',
      className: 'fcw-scope-btn',
      'data-scope': 'site',
      'aria-pressed': 'false'
    });
    siteScopeBtn.textContent = 'Site';
    scopeToggleWrap.appendChild(pageScopeBtn);
    scopeToggleWrap.appendChild(siteScopeBtn);
    pageScopeBtn.addEventListener('click', function (evt) {
      evt.preventDefault();
      evt.stopPropagation();
      setAdminTargetScope('page');
    });
    siteScopeBtn.addEventListener('click', function (evt) {
      evt.preventDefault();
      evt.stopPropagation();
      setAdminTargetScope('site');
    });
  }

  function updateInventoryMenuUi() {
    if (!inventoryBtn) return;
    var show = isBackendMode();
    inventoryBtn.hidden = !show;
    inventoryBtn.style.display = show ? '' : 'none';
    inventoryBtn.setAttribute('aria-label', 'Download conversation log');
    inventoryBtn.title = 'Download conversation log';
  }

  function warmSiteInventory() {
    if (!SITE_INVENTORY_URL || !cfg.nonce) return;
    fetch(SITE_INVENTORY_URL + (SITE_INVENTORY_URL.indexOf('?') >= 0 ? '&' : '?') + 'include_drafts=1', {
      method: 'GET',
      credentials: 'same-origin',
      headers: { 'X-WP-Nonce': cfg.nonce }
    }).then(function (res) {
      if (!res.ok) return null;
      return res.json();
    }).catch(function () {});
  }

  if (CAN_BACKEND_MODE && isBackendMode()) {
    warmSiteInventory();
  }

  if (CAN_BACKEND_MODE) {
    adminSubmodeBtn = el('button', {
      type: 'button',
      className: 'fcw-admin-submode fcw-admin-submode--ask',
      hidden: ''
    });
    adminSubmodeBtn.appendChild(el('span', { className: 'fcw-admin-submode__dot', 'aria-hidden': 'true' }));
    var submodeLabelEl = el('span', { className: 'fcw-admin-submode__label' });
    submodeLabelEl.textContent = 'Ask';
    adminSubmodeBtn.appendChild(submodeLabelEl);
    adminSubmodeBtn.addEventListener('click', function () {
      cycleAdminSubmode();
    });
    pageContentModeBtn = el('button', {
      type: 'button',
      className: 'fcw-submode-pill fcw-page-content-pill',
      hidden: ''
    });
    pageContentModeBtn.textContent = PAGE_CONTENT_MODE_LABELS[pageContentMode];
    pageContentModeBtn.addEventListener('click', function () {
      togglePageContentMode();
    });
  }

  if (modeToggleWrap) {
    toolbarLeading.appendChild(modeToggleWrap);
  }
  if (scopeToggleWrap) {
    toolbarLeading.appendChild(scopeToggleWrap);
    updateTargetScopeUi();
  }
  if (inventoryBtn) toolbarActions.appendChild(inventoryBtn);
  if (copyLogBtn) toolbarActions.appendChild(copyLogBtn);
  toolbarActions.appendChild(clearBtn);
  toolbarActions.appendChild(closeBtn);
  var contactHuman = SHOW_CONTACT_HUMAN ? buildContactHumanModule() : null;
  var toolbar = el('div', { className: 'fai-sidebar-panel__toolbar' });
  // Who you're talking to: avatar, name and a short status line.
  if (MODERN && uiOn('header') && !toolbarLeading.childNodes.length) {
    var head = el('div', { className: 'fcw-head' });
    var headAvatar = el('span', { className: 'fcw-head__avatar', 'aria-hidden': 'true' });
    if (cfg.avatarUrl) {
      var headImg = document.createElement('img');
      headImg.src = cfg.avatarUrl;
      headImg.alt = '';
      headAvatar.appendChild(headImg);
    } else {
      headAvatar.textContent = String(ASSISTANT || '?').trim().charAt(0).toUpperCase();
    }
    var headText = el('span', { className: 'fcw-head__text' });
    var headName = el('span', { className: 'fcw-head__name' });
    headName.textContent = ASSISTANT;
    headText.appendChild(headName);
    if (cfg.headerStatus) {
      var headStatus = el('span', { className: 'fcw-head__status' });
      headStatus.textContent = cfg.headerStatus;
      headText.appendChild(headStatus);
    }
    head.appendChild(headAvatar);
    head.appendChild(headText);
    toolbarLeading.appendChild(head);
  }
  if (toolbarLeading.childNodes.length) {
    toolbar.appendChild(toolbarLeading);
  }
  toolbar.appendChild(toolbarActions);

  var emptyEl = null;
  var messages = el('div', { className: 'fcw-messages' });
  messages.addEventListener('click', function (evt) {
    var anchor = evt.target && evt.target.closest ? evt.target.closest('a') : null;
    if (!anchor || !anchor.href) return;
    var href = anchor.getAttribute('href') || '';
    if (href === '#' || href.indexOf('mailto:') === 0 || href.indexOf('tel:') === 0) return;
    if (sidebarShell && typeof sidebarShell.close === 'function') {
      sidebarShell.close();
    } else {
      closeStandalonePanel();
    }
  });
  if (uiOn('welcome_message')) {
    emptyEl = el('div', { className: 'fcw-empty' });
    var greetingBlock = el('div');
    var greeting = el('p', { className: 'fcw-greeting' });
    greeting.textContent = GREETING_LINE;
    greetingEl = greeting;
    var sub = el('p', { className: 'fcw-sub' });
    sub.textContent = GREETING_SUB;
    greetingSubEl = sub;
    greetingBlock.appendChild(greeting);
    greetingBlock.appendChild(sub);
    emptyEl.appendChild(greetingBlock);
    if (uiOn('suggestion_chips')) {
      var startersWrap = el('div', { className: 'fcw-starters' });
      startersWrapEl = startersWrap;
      getActiveStarters().forEach(function (prompt) {
        var chip = el('button', {
          type: 'button',
          className: 'fcw-starter',
          'data-prompt': prompt
        });
        chip.textContent = prompt;
        chip.addEventListener('click', function () {
          var text = chip.getAttribute('data-prompt') || chip.textContent || '';
          if (text.trim()) deliverMessage(text.trim(), 'starter');
        });
        startersWrap.appendChild(chip);
      });
      emptyEl.appendChild(startersWrap);
    }
    messages.setAttribute('hidden', '');
  }

  var inputRow = el('form', { className: 'fcw-input-row fcw-composer' });
  var composerShell = el('div', { className: 'fcw-composer-shell' });
  var composerActions = el('div', { className: 'fcw-composer-actions' });
  var composerPlaceholder = COMPOSER_PLACEHOLDER;
  if (SHOW_CONTACT_HUMAN) {
    composerPlaceholder = COMPOSER_PLACEHOLDER.replace(/\u2026$/, ', or send us a text to reach a person.');
    if (composerPlaceholder === COMPOSER_PLACEHOLDER) {
      composerPlaceholder = 'Ask anything, or send us a text to reach a person.';
    }
  }
  var textarea = el('textarea', {
    className: 'fcw-textarea',
    placeholder: composerPlaceholder,
    rows: 1
  });
  var sendBtn = el('button', {
    className: 'fcw-send',
    type: 'button',
    'aria-label': 'Send message',
    innerHTML: '<span class="fcw-send__icon fcw-send__icon--send" aria-hidden="true">' + SVG_SEND + '</span>'
  });

  composerShell.appendChild(textarea);
  if (adminSubmodeBtn) {
    composerActions.appendChild(adminSubmodeBtn);
  }
  if (contactHuman) {
    composerActions.classList.add('fcw-composer-actions--with-human');
    composerActions.appendChild(contactHuman.toolbarBtn);
  }
  composerActions.appendChild(sendBtn);
  composerShell.appendChild(composerActions);
  inputRow.appendChild(composerShell);

  var panelBody = el('div', { className: 'fai-sidebar-panel__body' });
  if (SHOW_SIDEBAR_HEADING) {
    var headingEl = el('h2', { className: 'fai-sidebar-heading fcw-sidebar-heading' });
    headingEl.textContent = cfg.sidebarHeading;
    panelBody.appendChild(headingEl);
  }

  var chatMain = el('div', { className: 'fcw-sidebar-main' });
  if (SHOW_CHAT_BODY) {
    if (emptyEl) chatMain.appendChild(emptyEl);
    chatMain.appendChild(messages);
    chatMain.appendChild(inputRow);
    if (MODERN && uiOn('powered_by')) {
      var powered = el('a', { className: 'fcw-powered', href: cfg.poweredUrl || 'https://neodigital.ca/neo-pulse-platform/', target: '_blank', rel: 'noopener noreferrer' });
      powered.innerHTML = '<span class="np-powered__label">Powered by</span>' + (cfg.poweredLogo || ' <strong>NEO Pulse</strong>');
      chatMain.appendChild(powered);
    }
  }
  panelBody.appendChild(chatMain);
  panel.appendChild(toolbar);
  panel.appendChild(panelBody);
  panel.setAttribute('role', 'complementary');
  panel.setAttribute('aria-label', ASSISTANT);
  panel.setAttribute('hidden', '');
  if (CAN_BACKEND_MODE) {
    setAdminMode(adminMode);
    updateAdminSubmodeUi();
    updatePageContentModeUi();
  }
  if (savedLauncher) {
    if (!savedLauncher.innerHTML || !savedLauncher.innerHTML.trim()) {
      savedLauncher.innerHTML = SVG_CHAT_LAUNCHER;
    }
    if (!isMobileViewport() && savedLauncher.parentNode !== root) {
      root.appendChild(savedLauncher);
    }
  }
  bindStandaloneLauncher();

  function hideEmpty() {
    if (emptyEl) emptyEl.hidden = true;
    messages.hidden = false;
  }

  function clearChat() {
    if (isLoading) return;
    history = [];
    saveHistory();
    messages.innerHTML = '';
    if (emptyEl) {
      emptyEl.hidden = false;
      messages.hidden = true;
    }
    textarea.value = '';
    autoResize(textarea);
    if (window.NeoPulseChatPrefetch) {
      NeoPulseChatPrefetch.clearCache();
    }
    if (window.NeoPulseChatDebugLog) {
      NeoPulseChatDebugLog.clear();
    }
    rotateConversationId();
    initDebugLogSession();
    if (window.NeoPulseVoice && typeof window.NeoPulseVoice.updateSendMicVisibility === 'function') {
      NeoPulseVoice.updateSendMicVisibility(textarea, sendBtn);
    }
  }

  clearBtn.addEventListener('click', clearChat);
  if (copyLogBtn) {
    copyLogBtn.addEventListener('click', function () {
      if (window.NeoPulseChatDebugLog) {
        NeoPulseChatDebugLog.copyToClipboard(copyLogBtn, history);
      }
    });
  }
  if (inventoryBtn) {
    inventoryBtn.addEventListener('click', function () {
      if (window.NeoPulseChatDebugLog && typeof window.NeoPulseChatDebugLog.downloadFile === 'function') {
        NeoPulseChatDebugLog.downloadFile(inventoryBtn, history);
      }
    });
  }

  // ── Events ────────────────────────────────────────────────────

  inputRow.addEventListener('submit', onSubmit);

  function fcwBuildStepsList(steps) {
    var ul = el('ul', { className: 'fcw-thinking-steps' });
    (steps || []).forEach(function (step, idx) {
      var st = step.status || 'pending';
      var li = el('li', { className: 'fcw-thinking-step fcw-thinking-step--' + st });
      li.setAttribute('data-step-index', String(idx));
      var lbl = el('span', { className: 'fcw-thinking-step-label' });
      lbl.textContent = step.label || 'Step ' + (idx + 1);
      li.appendChild(lbl);
      ul.appendChild(li);
    });
    return ul;
  }

  function fcwAppendWorkflowCard(card) {
    var row = el('div', { className: 'fcw-msg fcw-msg--assistant' });
    var cardEl = el('div', { className: 'fcw-card fcw-card--thinking-active' });
    var titleRow = el('div', { className: 'fcw-card__title-row' });
    var badge = null;
    if (uiOn('type_badge')) {
      badge = el('span', { className: 'fcw-card__type-badge' });
      badge.textContent = 'working';
      titleRow.appendChild(badge);
    }
    var title = el('span', { className: 'fcw-card__title' });
    title.innerHTML = renderMarkdown(card.title || 'Working on it\u2026');
    titleRow.appendChild(title);
    cardEl.appendChild(titleRow);
    var bodyEl = el('div', { className: 'fcw-card__body' });
    if (card.body) {
      bodyEl.innerHTML = renderMarkdown(card.body);
    } else {
      bodyEl.style.display = 'none';
    }
    cardEl.appendChild(bodyEl);
    var stepsList = fcwBuildStepsList(card.steps || []);
    cardEl.appendChild(stepsList);
    row.appendChild(cardEl);
    messages.appendChild(row);
    scrollDown(row);
    return { root: row, cardEl: cardEl, badgeEl: badge, titleEl: title, bodyEl: bodyEl, stepsList: stepsList };
  }

  function fcwSetWorkflowStepStatus(shell, idx, status) {
    if (!shell || !shell.stepsList) return;
    var li = shell.stepsList.querySelector('[data-step-index="' + idx + '"]');
    if (!li) return;
    li.className = 'fcw-thinking-step fcw-thinking-step--' + status;
  }

  function fcwSetWorkflowCardActive(shell, active) {
    if (shell && shell.cardEl) {
      shell.cardEl.classList.toggle('fcw-card--thinking-active', !!active);
    }
  }

  function fcwTypeBadgeLabel(type) {
    if (type === 'lead') return 'Lead';
    if (type === 'plan') return 'plan';
    return type || 'answer';
  }

  function appendPlanCard(card) {
    rememberBuildRerunFromCard(card);
    var shell = fcwAppendWorkflowCard(card);
    fcwSetWorkflowCardActive(shell, false);
    if (shell.badgeEl && typeof fcwApplyCardBadge === 'function') {
      fcwApplyCardBadge(shell.badgeEl, 'plan');
    }
    fcwPopulateCardExtras(shell, card);
    return shell;
  }

  function fcwParseLegacyFlatContact(contact) {
    var normalized = { email: contact.email ? String(contact.email) : '', phones: [], locations: [] };

    if (contact.phone) {
      String(contact.phone).split(',').forEach(function (part) {
        var number = part.trim();
        if (number) normalized.phones.push({ label: '', number: number });
      });
    }

    var address = contact.address ? String(contact.address).trim() : '';
    var hours = [];
    if (contact.hours) {
      String(contact.hours).split(';').forEach(function (line) {
        line = line.trim();
        if (line) hours.push(line);
      });
    }
    if (address || hours.length) {
      normalized.locations.push({ name: '', address: address, hours: hours });
    }

    return normalized;
  }

  function fcwNormalizeConversionContact(contact) {
    contact = contact || {};
    if (Array.isArray(contact.phones) || Array.isArray(contact.locations)) {
      return {
        email: contact.email ? String(contact.email) : '',
        phones: Array.isArray(contact.phones) ? contact.phones : [],
        locations: Array.isArray(contact.locations) ? contact.locations : []
      };
    }
    if (contact.phone || contact.address || contact.hours) {
      return fcwParseLegacyFlatContact(contact);
    }
    return { email: contact.email ? String(contact.email) : '', phones: [], locations: [] };
  }

  function fcwAppendConversionContact(contactWrap, contact) {
    var data = fcwNormalizeConversionContact(contact);
    if (data.email) {
      var email = el('a', {
        className: 'fcw-card__conversion-item fcw-card__conversion-email',
        href: 'mailto:' + data.email
      });
      email.textContent = data.email;
      contactWrap.appendChild(email);
    }
    if (data.phones.length) {
      var phoneList = el('ul', { className: 'fcw-card__conversion-list fcw-card__conversion-phones' });
      data.phones.forEach(function (entry) {
        var number = entry && entry.number ? String(entry.number).trim() : '';
        if (!number) return;
        var li = el('li', { className: 'fcw-card__conversion-phone-row' });
        if (entry.label && String(entry.label).trim()) {
          var label = el('span', { className: 'fcw-card__conversion-phone-label' });
          label.textContent = String(entry.label).trim() + ': ';
          li.appendChild(label);
        }
        var phone = el('a', {
          className: 'fcw-card__conversion-item fcw-card__conversion-phone',
          href: 'tel:' + number.replace(/[^\d+]/g, '')
        });
        phone.textContent = number;
        li.appendChild(phone);
        phoneList.appendChild(li);
      });
      contactWrap.appendChild(phoneList);
    }
    data.locations.forEach(function (location) {
      if (!location) return;
      var name = location.name ? String(location.name).trim() : '';
      var address = location.address ? String(location.address).trim() : '';
      var hours = Array.isArray(location.hours) ? location.hours : [];
      if (!name && !address && !hours.length) return;
      var locBlock = el('div', { className: 'fcw-card__conversion-location' });
      if (name) {
        var nameEl = el('div', { className: 'fcw-card__conversion-location-name' });
        nameEl.textContent = name;
        locBlock.appendChild(nameEl);
      }
      if (address) {
        var addressEl = el('div', { className: 'fcw-card__conversion-item fcw-card__conversion-address' });
        addressEl.textContent = address;
        locBlock.appendChild(addressEl);
      }
      if (hours.length) {
        var hoursList = el('ul', { className: 'fcw-card__conversion-hours-list' });
        hours.forEach(function (line) {
          line = line ? String(line).trim() : '';
          if (!line) return;
          var hoursItem = el('li');
          hoursItem.textContent = line;
          hoursList.appendChild(hoursItem);
        });
        locBlock.appendChild(hoursList);
      }
      contactWrap.appendChild(locBlock);
    });
  }

  function fcwAppendConversionBlock(cardEl, card) {
    if (!cardEl || !card || !card.conversion) return;
    var conv = card.conversion;
    var block = el('div', { className: 'fcw-card__conversion' });
    if (conv.headline) {
      var headline = el('div', { className: 'fcw-card__conversion-headline' });
      headline.textContent = conv.headline;
      block.appendChild(headline);
    }
    var contact = conv.contact || {};
    var hasContact = contact.email || contact.phone || contact.address || contact.hours
      || (Array.isArray(contact.phones) && contact.phones.length)
      || (Array.isArray(contact.locations) && contact.locations.length);
    if (hasContact) {
      var contactWrap = el('div', { className: 'fcw-card__conversion-contact' });
      fcwAppendConversionContact(contactWrap, contact);
      block.appendChild(contactWrap);
    }
    cardEl.appendChild(block);
  }

  function fcwApplyCardBadge(badgeEl, t) {
    badgeEl.textContent = fcwTypeBadgeLabel(t);
  }

  function appendTopicChips(cardEl, topics, card) {
    if (!uiOn('suggestion_chips') || !cardEl || !topics || !topics.length) return;
    if (cardEl.querySelector('.fcw-card__topics')) return;
    var hasSubmodeCta = !!(card && card.submode_switch && ADMIN_SUBMODES.indexOf(card.submode_switch) >= 0);
    var topicsWrap = el('div', { className: 'fcw-card__topics' });
    topics.forEach(function (topic) {
      if (hasSubmodeCta && normalizeSubmodeSwitchTopic(topic)) return;
      var chip = el('button', { className: 'fcw-topic-chip', type: 'button' });
      chip.textContent = topic;
      chip.addEventListener('click', function () {
        var switchMode = normalizeSubmodeSwitchTopic(topic);
        if (switchMode) {
          handleSubmodeSwitch(switchMode);
          return;
        }
        deliverMessage(topic, 'topic_chip');
      });
      topicsWrap.appendChild(chip);
    });
    if (!topicsWrap.childNodes.length) return;
    cardEl.appendChild(topicsWrap);
  }

  function appendFollowUpChips(evt) {
    var topics = evt && evt.relatedTopics ? evt.relatedTopics : [];
    if (!topics.length) return;
    var cards = messages.querySelectorAll('.fcw-card');
    if (!cards.length) return;
    var cardEl = cards[cards.length - 1];
    var cardData = null;
    if (history.length && history[history.length - 1].role === 'assistant') {
      cardData = history[history.length - 1].card || null;
    }
    appendTopicChips(cardEl, topics, cardData);
    if (history.length && history[history.length - 1].role === 'assistant') {
      var last = history[history.length - 1];
      if (!last.card) last.card = {};
      last.card.relatedTopics = topics.slice();
    }
    prefetchFollowUpChips({ relatedTopics: topics });
    var msgRow = cardEl.closest('.fcw-msg');
    scrollDown(msgRow || null);
  }

  function fcwAppendCardLinkPills(cardEl, card, shell) {
    var links = card.links && card.links.length ? card.links.slice() : [];
    if (card.undo && card.undo.post_id) {
      links.push({
        label: card.undo.label || 'Undo',
        icon: 'edit',
        action: 'undo',
        post_id: card.undo.post_id,
        url: '#'
      });
    }
    if (!showSourcePills() || !links.length || !cardEl) return;
    var linksWrap = el('div', { className: 'fcw-card__links' });
    links.forEach(function (link) {
      fcwAppendOneLinkPill(linksWrap, link, card, shell, cardEl);
    });
    if (linksWrap.childNodes.length) {
      cardEl.appendChild(linksWrap);
    }
  }

  function fcwAppendOneLinkPill(linksWrap, link, card, shell, cardEl) {
    if (!link) return;
    if (link.action === 'undo' && link.post_id) {
      if (!BACKEND_ASSIST_UNDO_URL) return;
      var undoEl = el('a', { className: 'fcw-link-pill', href: '#' });
      var undoIcon = linkIcon(link.icon || 'edit');
      if (undoIcon) {
        undoEl.appendChild(el('span', { className: 'fcw-link-pill__icon', innerHTML: undoIcon }));
      }
      var undoLbl = el('span');
      undoLbl.textContent = link.label || 'Undo';
      undoEl.appendChild(undoLbl);
      undoEl.addEventListener('click', function (e) {
        e.preventDefault();
        runFcwCardUndo(link.post_id, card, shell || { cardEl: cardEl }, undoEl);
      });
      linksWrap.appendChild(undoEl);
      return;
    }
    if (!link.url || link.url === '#') return;
    var a = el('a', { className: 'fcw-link-pill', href: link.url });
    var icon = linkIcon(link.icon);
    if (icon) {
      a.appendChild(el('span', { className: 'fcw-link-pill__icon', innerHTML: icon }));
    }
    var lbl = el('span');
    lbl.textContent = link.label;
    a.appendChild(lbl);
    bindAcceptClick(a, card, 'source', link.label);
    linksWrap.appendChild(a);
  }

  function runFcwCardUndo(postId, card, shell, undoEl) {
    if (isLoading || !postId || !BACKEND_ASSIST_UNDO_URL) return;
    var cardEl = shell && shell.cardEl ? shell.cardEl : null;
    if (undoEl) undoEl.setAttribute('aria-disabled', 'true');
    fetch(BACKEND_ASSIST_UNDO_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-WP-Nonce': cfg.nonce || ''
      },
      body: JSON.stringify({ post_id: postId })
    }).then(function (res) {
      return res.json().then(function (data) {
        if (!res.ok || !data) {
          if (undoEl) undoEl.removeAttribute('aria-disabled');
          return;
        }
        var updated = data;
        if (window.NeoPulseDisplayText && typeof window.NeoPulseDisplayText.decodeCard === 'function') {
          updated = window.NeoPulseDisplayText.decodeCard(updated);
        }
        if (shell && shell.titleEl) {
          shell.titleEl.innerHTML = renderMarkdown(updated.title || '');
        } else if (cardEl) {
          var titleNode = cardEl.querySelector('.fcw-card__title');
          if (titleNode) titleNode.innerHTML = renderMarkdown(updated.title || '');
        }
        if (shell && shell.bodyEl) {
          if (updated.body) {
            shell.bodyEl.innerHTML = renderMarkdown(updated.body);
            shell.bodyEl.style.display = '';
          } else {
            shell.bodyEl.style.display = 'none';
          }
        } else if (cardEl && updated.body) {
          var bodyNode = cardEl.querySelector('.fcw-card__body');
          if (!bodyNode) {
            bodyNode = el('div', { className: 'fcw-card__body' });
            var titleRow = cardEl.querySelector('.fcw-card__title-row');
            if (titleRow) {
              cardEl.insertBefore(bodyNode, titleRow.nextSibling);
            } else {
              cardEl.appendChild(bodyNode);
            }
          }
          bodyNode.innerHTML = renderMarkdown(updated.body);
          bodyNode.style.display = '';
        }
        if (shell && shell.badgeEl && updated.type) {
          fcwApplyCardBadge(shell.badgeEl, updated.type);
        }
        fcwPopulateCardExtras(shell || { cardEl: cardEl }, updated);
        pushHistoryTurn('assistant', updated.title || (updated.body ? String(updated.body).slice(0, 160) : ''), updated);
      });
    }).catch(function () {
      if (undoEl) undoEl.removeAttribute('aria-disabled');
    });
  }

  function fcwRenderDetailsDrawerInCard(cardEl, card) {
    if (!cardEl || !card || !card.details_drawer || !window.NeoPulseBuildHarness) {
      return false;
    }
    cardEl.classList.add('fcw-card--build-harness');
    var existing = cardEl.querySelector('.fcw-card__body--details-drawer');
    if (existing && existing.parentNode) {
      existing.parentNode.removeChild(existing);
    }
    var body = el('div', { className: 'fcw-card__body fcw-card__body--details-drawer' });
    window.NeoPulseBuildHarness.renderDetailsDrawer(card.details_drawer, body);
    if (card.details_drawer.progress && window.NeoPulseBuildHarness.setProgress) {
      var p = card.details_drawer.progress;
      window.NeoPulseBuildHarness.setProgress(p.completed || 0, p.total || 3, 'Build complete');
    }
    cardEl.appendChild(body);
    return true;
  }

  function fcwFinalizeBuildActionCard(shell, card, host) {
    if (!shell || !card) return;
    if (!card.details_drawer || !window.NeoPulseBuildHarness) {
      if (shell.cardEl) {
        shell.cardEl.classList.remove('fcw-card--build-running');
      }
      if (window.NeoPulseThinkingCard) {
        NeoPulseThinkingCard.finalizeToCard(shell, card, host);
      }
      return;
    }
    if (host.setWorkflowCardActive) {
      host.setWorkflowCardActive(shell, false);
    }
    if (shell.cardEl) {
      shell.cardEl.classList.remove('fcw-card--build-running');
    }
    if (shell.stepsList && shell.stepsList.parentNode) {
      shell.stepsList.parentNode.removeChild(shell.stepsList);
      shell.stepsList = null;
    }
    var t = card.type || 'action';
    if (shell.badgeEl && typeof host.applyCardBadge === 'function') {
      host.applyCardBadge(shell.badgeEl, t);
    }
    if (shell.titleEl) {
      shell.titleEl.innerHTML = renderMarkdown(card.title || '');
    }
    if (shell.bodyEl) {
      shell.bodyEl.innerHTML = '';
      shell.bodyEl.style.display = '';
      if (card.details_drawer && window.NeoPulseBuildHarness) {
        if (shell.cardEl) {
          shell.cardEl.classList.add('fcw-card--build-harness');
        }
        shell.bodyEl.className = 'fcw-card__body fcw-card__body--details-drawer';
        window.NeoPulseBuildHarness.renderDetailsDrawer(card.details_drawer, shell.bodyEl);
      } else if (card.body) {
        shell.bodyEl.className = 'fcw-card__body';
        shell.bodyEl.innerHTML = renderMarkdown(card.body);
      } else {
        shell.bodyEl.style.display = 'none';
      }
    }
    if (typeof host.populateCardExtras === 'function') {
      host.populateCardExtras(shell, card);
    }
    if (typeof host.scrollDown === 'function') {
      host.scrollDown(shell.root);
    }
    dispatchMetaSavedEvent(card);
  }

  function fcwPopulateCardExtras(shell, card) {
    if (!shell || !shell.cardEl) return;
    var cardEl = shell.cardEl;
    var old = cardEl.querySelectorAll('.fcw-card__conversion, .fcw-card__confidence, .fcw-card__links, .fcw-card__cta-wrap, .fcw-card__topics');
    old.forEach(function (n) { if (n.parentNode) n.parentNode.removeChild(n); });
    fcwAppendConversionBlock(cardEl, card);
    if (uiOn('confidence')) {
      var confMap = { high: 'High confidence', medium: 'Based on site content', low: 'Limited information' };
      var conf = el('div', { className: 'fcw-card__confidence' });
      conf.textContent = confMap[card.confidence] || confMap.medium;
      cardEl.appendChild(conf);
    }
    if (showSourcePills()) {
      fcwAppendCardLinkPills(cardEl, card, shell);
    }
    appendCardCtas(cardEl, card);
    if (uiOn('suggestion_chips') && card.relatedTopics && card.relatedTopics.length) {
      appendTopicChips(cardEl, card.relatedTopics, card);
    }
  }

  function fcwThinkingHost() {
    return {
      appendWorkflowCard: fcwAppendWorkflowCard,
      setWorkflowStepStatus: fcwSetWorkflowStepStatus,
      setWorkflowCardActive: fcwSetWorkflowCardActive,
      applyCardBadge: fcwApplyCardBadge,
      renderMd: renderMarkdown,
      populateCardExtras: fcwPopulateCardExtras,
      scrollDown: scrollDown
    };
  }

  function prefetchFollowUpChips(card) {
    if (!window.NeoPulseChatPrefetch || !uiOn('suggestion_chips')) return;
    if (!card || !card.relatedTopics || !card.relatedTopics.length) return;
    NeoPulseChatPrefetch.prefetchSuggestions(card.relatedTopics, prefetchOptions());
  }

  function presentCard(card, opts) {
    opts = opts || {};
    if (window.NeoPulseDisplayText && typeof window.NeoPulseDisplayText.decodeCard === 'function') {
      card = window.NeoPulseDisplayText.decodeCard(card || {});
    }
    rememberBuildRerunFromCard(card);
    var shell = opts.shell;
    var host = fcwThinkingHost();
    var done = function () {
      pushHistoryTurn('assistant', card.title || (card.body ? String(card.body).slice(0, 160) : ''), card);
      if (typeof opts.onDone === 'function') {
        opts.onDone();
      }
    };
    if (card.type === 'plan' && card.steps && card.steps.length) {
      if (shell && shell.stepsList) {
        fcwSetWorkflowCardActive(shell, false);
        if (shell.badgeEl) {
          fcwApplyCardBadge(shell.badgeEl, 'plan');
        }
        if (shell.titleEl) {
          shell.titleEl.innerHTML = renderMarkdown(card.title || '');
        }
        if (shell.bodyEl) {
          if (card.body) {
            shell.bodyEl.innerHTML = renderMarkdown(card.body);
            shell.bodyEl.style.display = '';
          } else {
            shell.bodyEl.style.display = 'none';
          }
        }
        if (shell.stepsList.parentNode) {
          shell.stepsList.parentNode.removeChild(shell.stepsList);
        }
        shell.stepsList = fcwBuildStepsList(card.steps || []);
        shell.cardEl.appendChild(shell.stepsList);
        fcwPopulateCardExtras(shell, card);
      } else {
        appendPlanCard(card);
      }
      done();
      prefetchFollowUpChips(card);
      return Promise.resolve();
    }
    if (shell && card.details_drawer && window.NeoPulseBuildHarness) {
      fcwFinalizeBuildActionCard(shell, card, host);
      done();
      prefetchFollowUpChips(card);
      return Promise.resolve();
    }
    if (shell && window.NeoPulseThinkingCard) {
      NeoPulseThinkingCard.finalizeToCard(shell, card, host);
    } else {
      appendCard(card);
    }
    done();
    prefetchFollowUpChips(card);
    return Promise.resolve();
  }

  sendBtn.addEventListener('mousedown', function () {
    if (window.NeoPulseChatPrefetch && textarea.value.trim()) {
      NeoPulseChatPrefetch.prefetchOnSendIntent(textarea);
    }
  });
  sendBtn.addEventListener('click', function () {
    if (textarea.value.trim()) {
      inputRow.dispatchEvent(new Event('submit'));
    }
  });
  textarea.addEventListener('keydown', function (e) {
    if (e.key === 'Tab' && e.shiftKey && isBackendMode()) {
      e.preventDefault();
      cycleAdminSubmode();
      return;
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      inputRow.dispatchEvent(new Event('submit'));
    }
  });

  function getUnifiedShell() {
    if (window.NeoPulseAiSidebarUnify && window.NeoPulseAiSidebarUnify.isMerged()) {
      return window.NeoPulseAiSidebarUnify.getShell();
    }
    return null;
  }

  function setLauncherVisible(visible) {
    var launcher = getStandaloneLauncher();
    if (!launcher) return;
    var keepEdge = isEdgeTabDesktop() && launcher.classList.contains('fcw-launcher--edge-tab');
    if (visible || keepEdge) {
      launcher.removeAttribute('hidden');
      launcher.style.display = '';
      launcher.style.visibility = '';
      launcher.style.pointerEvents = '';
      launcher.setAttribute('aria-expanded', visible ? 'false' : 'true');
      return;
    }
    launcher.setAttribute('hidden', '');
    launcher.style.display = 'none';
    launcher.style.visibility = 'hidden';
    launcher.style.pointerEvents = 'none';
    launcher.setAttribute('aria-expanded', 'true');
  }

  var chekkitTeaser = null;

  var peekTimer = null;
  var peekOutTimer = null;
  var PEEK_SLIDE_MS = 500;
  var PEEK_HOLD_MS = 600;

  function prefersReducedMotion() {
    return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  function clearPeekTimers() {
    if (peekTimer) {
      clearTimeout(peekTimer);
      peekTimer = null;
    }
    if (peekOutTimer) {
      clearTimeout(peekOutTimer);
      peekOutTimer = null;
    }
  }

  function peekLauncher() {
    return document.getElementById('neo-pulse-chat-mobile-launcher');
  }

  function peekPanelWidth() {
    if (panel && panel.offsetWidth) return panel.offsetWidth;
    var raw = root && window.getComputedStyle(root).getPropertyValue('--fai-sidebar-width');
    var n = raw ? parseInt(raw, 10) : 0;
    return n || 400;
  }

  function setDockerShift(px) {
    var launcher = peekLauncher();
    var value = px + 'px';
    document.documentElement.style.setProperty('--fcw-docker-shift', value);
    if (launcher) {
      launcher.style.setProperty('--fcw-docker-shift', value);
    }
  }

  function clearDockerShift() {
    document.documentElement.style.removeProperty('--fcw-docker-shift');
    var launcher = peekLauncher();
    if (launcher) {
      launcher.style.removeProperty('--fcw-docker-shift');
    }
  }

  function finishPeekHide() {
    root.classList.remove('fai-sidebar-root--peek');
    root.classList.remove('fai-sidebar-root--peek-track');
    clearDockerShift();
    if (!isOpen && panel && !root.classList.contains('fai-sidebar-root--open') && !isEdgeTabDesktop()) {
      panel.setAttribute('hidden', '');
    }
    if (!isOpen) {
      lockMobileRootClosed();
    }
  }

  function clearEdgeTabPeek() {
    clearPeekTimers();
    finishPeekHide();
  }

  var PEEK_SESSION_KEY = 'neo_pulse_edge_peek_session';

  function startEdgeTabPeek(force) {
    if (isOpen) return;
    if (!force) {
      if (!isEdgeTabDesktop() || prefersReducedMotion()) return;
      try {
        if (sessionStorage.getItem(PEEK_SESSION_KEY)) return;
        sessionStorage.setItem(PEEK_SESSION_KEY, '1');
      } catch (e) {
        return;
      }
    }
    clearPeekTimers();
    mountShellNodes();
    showMobileRootForPanel();
    root.classList.remove('fai-sidebar-root--peek');
    root.classList.add('fai-sidebar-root--peek-track');
    if (panel) {
      panel.removeAttribute('hidden');
      void panel.offsetWidth;
    }
    attachEdgeTabToPanel();
    window.requestAnimationFrame(function () {
      window.requestAnimationFrame(function () {
        if (isOpen) return;
        root.classList.add('fai-sidebar-root--peek');
        peekTimer = window.setTimeout(function () {
          peekTimer = null;
          root.classList.remove('fai-sidebar-root--peek');
          peekOutTimer = window.setTimeout(function () {
            peekOutTimer = null;
            finishPeekHide();
          }, PEEK_SLIDE_MS);
        }, PEEK_HOLD_MS);
      });
    });
  }

  window.NeoPulseChatTestPeek = function () {
    var launcher = getStandaloneLauncher();
    applyLauncherStyle(launcher);
    if (launcher) {
      launcher.classList.add('fcw-launcher--edge-tab');
    }
    startEdgeTabPeek(true);
  };

  function onSidebarOpen() {
    isOpen = true;
    clearEdgeTabPeek();
    setLauncherVisible(false);
    if (chekkitTeaser) chekkitTeaser.onChatOpen();
    textarea.focus();
  }

  function onSidebarClose() {
    isOpen = false;
    setLauncherVisible(true);
    if (chekkitTeaser) chekkitTeaser.onChatClose();
  }

  function removeStandaloneLauncher() {
    var launcher = root.querySelector('.fcw-launcher');
    if (launcher && launcher.parentNode) {
      launcher.parentNode.removeChild(launcher);
    }
    root.classList.remove('neo-pulse-chat--standalone-launcher');
  }

  function getStandaloneLauncher() {
    if (HIDE_LAUNCHER) return null;
    var mobileBtn = document.getElementById('neo-pulse-chat-mobile-launcher');
    if (mobileBtn) return mobileBtn;
    return ensureStandaloneLauncher();
  }

  function ensureStandaloneLauncher() {
    if (HIDE_LAUNCHER) return null;
    var existing = document.getElementById('neo-pulse-chat-mobile-launcher')
      || root.querySelector('.fai-sidebar-launcher.fcw-launcher');
    if (existing) {
      applyLauncherStyle(existing);
      return existing;
    }
    root.classList.add('neo-pulse-chat--standalone-launcher');
    var launcher = el('button', {
      type: 'button',
      className: 'fai-sidebar-launcher fcw-launcher',
      'aria-label': cfg.launcherLabel || ('Open ' + ASSISTANT),
      'aria-expanded': 'false',
      innerHTML: SVG_CHAT_LAUNCHER
    });
    applyLauncherStyle(launcher);
    root.appendChild(launcher);
    return launcher;
  }

  function bindShellCallbacks(shell) {
    if (!shell || shell._fcwBound) {
      return;
    }
    shell._fcwBound = true;
    var prevOnOpen = shell.opts.onOpen;
    var prevOnClose = shell.opts.onClose;
    shell.opts.onOpen = function () {
      if (typeof prevOnOpen === 'function') prevOnOpen();
      onSidebarOpen();
    };
    shell.opts.onClose = function () {
      if (typeof prevOnClose === 'function') prevOnClose();
      onSidebarClose();
      teardownShellIfMobile();
    };
  }

  function openStandalonePanel() {
    showMobileRootForPanel();
    mountShellNodes();
    syncRootShellState(true);
    root.classList.add('fai-sidebar-root--open');
    if (backdrop) {
      backdrop.removeAttribute('hidden');
      backdrop.classList.add('fai-sidebar-backdrop--visible');
    }
    if (panel) {
      panel.removeAttribute('hidden');
      panel.classList.add('fai-sidebar-panel--visible');
    }
    var launcher = getStandaloneLauncher();
    if (launcher) launcher.setAttribute('aria-expanded', 'true');
    onSidebarOpen();
  }

  function closeStandalonePanel() {
    root.classList.remove('fai-sidebar-root--open');
    onSidebarClose();
    var finish = function () {
      if (root.classList.contains('fai-sidebar-root--open')) return;
      if (backdrop) {
        backdrop.setAttribute('hidden', '');
        backdrop.classList.remove('fai-sidebar-backdrop--visible');
      }
      if (panel && !isEdgeTabDesktop()) {
        panel.setAttribute('hidden', '');
        panel.classList.remove('fai-sidebar-panel--visible');
      }
      teardownShellIfMobile();
    };
    if (prefersReducedMotion() || isMobileViewport()) {
      finish();
      return;
    }
    window.setTimeout(finish, 500);
  }

  function chatPrefetchAllowed() {
    return !!(root && (root.classList.contains('fai-sidebar-root--open') || (sidebarShell && sidebarShell.isOpen)));
  }

  function warmChatWhenOpened() {
    if (!window.NeoPulseChatPrefetch) {
      return;
    }
    if (cfg.pageContext && getTargetScopeForApi() !== 'site') {
      NeoPulseChatPrefetch.warmPageContext(cfg.pageContext, prefetchOptions());
    }
    if (uiOn('suggestion_chips') && !isBackendMode()) {
      NeoPulseChatPrefetch.prefetchSuggestions(getActiveStarters(), prefetchOptions());
    }
  }

  function openChatFromLauncher() {
    var alreadyOpen = (sidebarShell && sidebarShell.isOpen) || root.classList.contains('fai-sidebar-root--open');
    if (alreadyOpen) {
      clearEdgeTabPeek();
      if (sidebarShell && typeof sidebarShell.toggle === 'function') {
        sidebarShell.toggle(false);
        return;
      }
      closeStandalonePanel();
      return;
    }
    clearPeekTimers();
    root.classList.remove('fai-sidebar-root--peek');
    root.classList.remove('fai-sidebar-root--peek-track');
    clearDockerShift();
    showMobileRootForPanel();
    mountShellNodes();
    syncRootShellState(true);
    warmChatWhenOpened();
    if (isMobileViewport()) {
      openStandalonePanel();
      return;
    }
    if (sidebarShell && typeof sidebarShell.toggle === 'function') {
      sidebarShell.toggle(true);
      return;
    }
    var shell = ensureStandaloneShell();
    if (shell && typeof shell.toggle === 'function') {
      shell.toggle(true);
      return;
    }
    openStandalonePanel();
  }

  function bindStandaloneLauncher() {
    var launcher = getStandaloneLauncher();
    if (!launcher || launcher._fcwBound) return;
    launcher._fcwBound = true;
    launcher.addEventListener('click', openChatFromLauncher);
    if (backdrop && !backdrop._fcwBound) {
      backdrop._fcwBound = true;
      backdrop.addEventListener('click', function () {
        if (sidebarShell && typeof sidebarShell.close === 'function') {
          sidebarShell.close();
          return;
        }
        closeStandalonePanel();
      });
    }
    if (closeBtn && !closeBtn._fcwStandaloneBound) {
      closeBtn._fcwStandaloneBound = true;
      closeBtn.addEventListener('click', function () {
        if (sidebarShell && typeof sidebarShell.toggle === 'function') {
          sidebarShell.toggle(false);
          return;
        }
        closeStandalonePanel();
      });
    }
  }

  function ensureStandaloneShell() {
    if (isMobileViewport()) {
      return null;
    }
    if (sidebarShell) {
      return sidebarShell;
    }
    if (getUnifiedShell()) {
      return null;
    }
    if (!window.NeoPulseAiSidebarShell) {
      return null;
    }
    mountShellNodes();
    syncRootShellState(isOpen);
    sidebarShell = window.NeoPulseAiSidebarShell.init(root, {
      backdrop: backdrop,
      panel: panel,
      launcher: getStandaloneLauncher(),
      onOpen: onSidebarOpen,
      onClose: function () {
        onSidebarClose();
        teardownShellIfMobile();
      }
    });
    sidebarShell._fcwBound = true;
    return sidebarShell;
  }

  function initStandaloneShell() {
    if (sidebarShell || getUnifiedShell()) {
      return;
    }
    bindStandaloneLauncher();
    if (!window.NeoPulseAiSidebarShell) {
      return;
    }
    if (isMobileViewport()) {
      return;
    }
    ensureStandaloneShell();
  }

  function bindUnifiedShell() {
    if (window.NeoPulseAiSidebarUnify) {
      window.NeoPulseAiSidebarUnify.tryMerge();
    }
    var shell = getUnifiedShell();
    if (shell) {
      bindShellCallbacks(shell);
      sidebarShell = shell;
      var mobileLauncher = document.getElementById('neo-pulse-chat-mobile-launcher');
      if (mobileLauncher && typeof shell.registerLauncher === 'function' && !mobileLauncher._fcwUnifiedBound) {
        mobileLauncher._fcwUnifiedBound = true;
        shell.registerLauncher(mobileLauncher, {
          onBeforeOpen: function () {
            if (window.NeoPulseAiSidebarUnify && typeof window.NeoPulseAiSidebarUnify.setActiveTab === 'function') {
              window.NeoPulseAiSidebarUnify.setActiveTab('chat');
            }
          }
        });
      }
      var chatLauncher = ensureStandaloneLauncher();
      if (chatLauncher && chatLauncher !== mobileLauncher && typeof shell.registerLauncher === 'function' && !chatLauncher._fcwUnifiedBound) {
        chatLauncher._fcwUnifiedBound = true;
        shell.registerLauncher(chatLauncher, {
          onBeforeOpen: function () {
            if (window.NeoPulseAiSidebarUnify && typeof window.NeoPulseAiSidebarUnify.setActiveTab === 'function') {
              window.NeoPulseAiSidebarUnify.setActiveTab('chat');
            }
          }
        });
      }
      return;
    }
    bindStandaloneLauncher();
    if (document.readyState === 'loading') {
      return;
    }
    initStandaloneShell();
  }

  function applyChekkitLauncherChrome() {
    if (HIDE_LAUNCHER) return;
    if (!SHOW_CONTACT_HUMAN || !cfgFlagOn(cfg.chekkitTeaserEnabled)) return;
    var launcher = getStandaloneLauncher();
    if (!launcher) return;
    if (isEdgeTabDesktop()) return;
    launcher.classList.add('fcw-launcher--chekkit');
    launcher.innerHTML = SVG_PHONE_LAUNCHER;
    launcher.style.setProperty('background', '#d8005f', 'important');
    launcher.style.setProperty('color', '#ffffff', 'important');
    launcher.style.setProperty('border', 'none', 'important');
  }

  function initChekkitTeaser() {
    if (HIDE_LAUNCHER || isEdgeTabDesktop()) return null;
    if (!SHOW_CONTACT_HUMAN || !cfgFlagOn(cfg.chekkitTeaserEnabled)) return null;
    if (typeof Element === 'undefined' || !Element.prototype.attachShadow) return null;

    var SESSION_KEY = 'neo-pulse_chekkit_teaser_dismissed';
    try {
      if (sessionStorage.getItem(SESSION_KEY)) return null;
    } catch (_) {
      return null;
    }

    var launcher = getStandaloneLauncher();
    if (!launcher || isOpen) return null;

    var dismissed = false;
    var visible = false;
    var hiddenByChat = false;
    var delayTimer = null;

    var host = document.createElement('div');
    host.id = 'neo-pulse-chekkit-teaser-host';
    host.hidden = true;
    if (SIDEBAR_SIDE === 'left') {
      host.classList.add('left');
    }
    if (isEdgeTabDesktop()) {
      host.classList.add('edge');
    }

    var shadow = host.attachShadow({ mode: 'open' });
    var style = document.createElement('style');
    style.textContent =
      ':host{position:fixed;z-index:999899;display:block;opacity:0;transform:translateY(8px);transition:opacity .2s ease,transform .2s ease;pointer-events:none;font-family:Lato,ui-sans-serif,system-ui,sans-serif}'
      + ':host(.visible){opacity:1;transform:translateY(0);pointer-events:auto}'
      + '.card{position:relative;display:flex;align-items:center;gap:12px;box-sizing:border-box;margin:0;padding:12px 32px 12px 12px;border:none;border-radius:16px;background:#fff;box-shadow:0 4px 24px rgba(0,0,0,.14);color:#111;cursor:pointer;width:max-content;min-width:268px;max-width:320px}'
      + '.card:hover{box-shadow:0 6px 28px rgba(0,0,0,.16)}'
      + '.avatar{width:48px;height:48px;min-width:48px;border-radius:50%;flex-shrink:0;overflow:hidden;background:#f5f5f5;display:block}'
      + '.avatar img{display:block;width:100%;height:100%;object-fit:cover;border-radius:50%}'
      + '.copy{display:flex;flex-direction:column;gap:2px;flex:1;min-width:0}'
      + '.line{display:block;font-size:1rem;line-height:1.35;color:#111;white-space:normal}'
      + '.dismiss{position:absolute;top:6px;right:6px;width:22px;height:22px;margin:0;padding:0;border:none;border-radius:50%;background:#fff;box-shadow:0 1px 4px rgba(0,0,0,.15);color:#666;font-size:1rem;line-height:1;cursor:pointer}'
      + '.dismiss:hover{background:#f3f4f6;color:#374151}'
      + '.card::after{content:"";position:absolute;top:50%;width:0;height:0;transform:translateY(-50%);filter:drop-shadow(0 2px 2px rgba(0,0,0,.06))}'
      + ':host(.left) .card::after{left:-8px;right:auto;border-top:8px solid transparent;border-bottom:8px solid transparent;border-right:8px solid #fff;border-left:none}'
      + ':host(:not(.left)) .card::after{right:-8px;left:auto;border-top:8px solid transparent;border-bottom:8px solid transparent;border-left:8px solid #fff;border-right:none}'
      + ':host(.edge) .card{align-items:center;gap:8px;min-width:0;max-width:none;width:auto;padding:8px 28px 8px 12px;border-radius:999px;box-shadow:0 2px 10px rgba(0,0,0,.12)}'
      + ':host(.edge) .avatar{display:none}'
      + ':host(.edge) .copy{flex:none}'
      + ':host(.edge) .line + .line{display:none}'
      + ':host(.edge) .dismiss{top:50%;right:6px;transform:translateY(-50%);box-shadow:none}';

    var card = document.createElement('div');
    card.className = 'card';
    card.setAttribute('aria-label', 'Questions? Send us a text message!');

    var avatar = document.createElement('span');
    avatar.className = 'avatar';
    avatar.setAttribute('aria-hidden', 'true');
    var avatarImg = document.createElement('img');
    avatarImg.src = cfg.chekkitTeaserAvatarUrl || '';
    avatarImg.alt = '';
    avatarImg.width = 48;
    avatarImg.height = 48;
    avatarImg.loading = 'lazy';
    avatarImg.decoding = 'async';
    avatar.appendChild(avatarImg);

    var copy = document.createElement('div');
    copy.className = 'copy';
    var line1 = document.createElement('span');
    line1.className = 'line';
    line1.textContent = 'Questions?';
    var line2 = document.createElement('span');
    line2.className = 'line';
    line2.textContent = 'Send us a text message!';
    copy.appendChild(line1);
    copy.appendChild(line2);

    var dismissBtn = document.createElement('button');
    dismissBtn.type = 'button';
    dismissBtn.className = 'dismiss';
    dismissBtn.setAttribute('aria-label', 'Dismiss');
    dismissBtn.textContent = '\u00d7';

    if (!isEdgeTabDesktop()) {
      card.appendChild(avatar);
    }
    card.appendChild(copy);
    card.appendChild(dismissBtn);
    if (isEdgeTabDesktop()) {
      line2.hidden = true;
    }
    shadow.appendChild(style);
    shadow.appendChild(card);
    document.body.appendChild(host);

    function positionTeaser() {
      if (dismissed || !launcher) return;
      var rect = launcher.getBoundingClientRect();
      var gap = isEdgeTabDesktop() ? 8 : 14;
      var hostH = host.offsetHeight || (isEdgeTabDesktop() ? 40 : 88);
      var top = Math.max(16, rect.top + rect.height / 2 - hostH / 2);
      host.style.top = top + 'px';
      host.style.bottom = 'auto';
      if (SIDEBAR_SIDE === 'left') {
        host.style.left = Math.max(16, rect.right + gap) + 'px';
        host.style.right = 'auto';
      } else {
        host.style.right = Math.max(16, window.innerWidth - rect.left + gap) + 'px';
        host.style.left = 'auto';
      }
    }

    function setVisible(next) {
      visible = next;
      if (next) {
        positionTeaser();
        host.hidden = false;
        requestAnimationFrame(function () {
          host.classList.add('visible');
        });
        return;
      }
      host.classList.remove('visible');
      host.hidden = true;
    }

    function clearTriggers() {
      if (delayTimer) {
        clearTimeout(delayTimer);
        delayTimer = null;
      }
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', positionTeaser);
    }

    function dismissTeaser(persist) {
      if (dismissed) return;
      dismissed = true;
      clearTriggers();
      setVisible(false);
      if (persist) {
        try {
          sessionStorage.setItem(SESSION_KEY, '1');
        } catch (_) {}
      }
    }

    function showTeaser() {
      if (dismissed || visible || isOpen || hiddenByChat) return;
      clearTriggers();
      setVisible(true);
    }

    function onScroll() {
      var y = window.scrollY || window.pageYOffset || 0;
      if (y > 50) showTeaser();
    }

    function openFromTeaser() {
      setVisible(false);
      openChatFromLauncher();
    }

    dismissBtn.addEventListener('click', function (evt) {
      evt.stopPropagation();
      dismissTeaser(true);
    });

    card.addEventListener('click', openFromTeaser);

    delayTimer = setTimeout(showTeaser, 2000);
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', positionTeaser);

    return {
      onChatOpen: function () {
        if (!visible || dismissed) return;
        hiddenByChat = true;
        setVisible(false);
      },
      onChatClose: function () {
        if (dismissed || !hiddenByChat) return;
        hiddenByChat = false;
        if (!isOpen) setVisible(true);
      }
    };
  }

  window.NeoPulseChatMountShell = function () {
    showMobileRootForPanel();
    mountShellNodes();
    syncRootShellState(true);
  };

  window.NeoPulseChatOpen = function () {
    var alreadyOpen = (sidebarShell && sidebarShell.isOpen) || root.classList.contains('fai-sidebar-root--open');
    if (alreadyOpen) {
      return;
    }
    openChatFromLauncher();
  };

  bindUnifiedShell();
  if (!isMobileViewport()) {
    root.hidden = false;
    root.removeAttribute('hidden');
    root.removeAttribute('aria-hidden');
    root.classList.remove('fcw-mobile-root-closed');
    if (cfg.cssVars) {
      root.setAttribute('style', cfg.cssVars);
    }
    if (isEdgeTabDesktop()) {
      mountShellNodes();
      syncRootShellState(false);
    }
  } else {
    lockMobileRootClosed();
  }
  applyLauncherChrome();
  if (!isOpen) {
    setLauncherVisible(true);
  }
  chekkitTeaser = initChekkitTeaser();
  window.requestAnimationFrame(function () {
    window.setTimeout(startEdgeTabPeek, 120);
  });
  if (window.matchMedia) {
    window.matchMedia('(max-width:767px)').addEventListener('change', function () {
      applyLauncherChrome();
      if (isMobileViewport()) {
        if (!isOpen) lockMobileRootClosed();
      } else {
        root.hidden = false;
        root.removeAttribute('aria-hidden');
        root.classList.remove('fcw-mobile-root-closed');
        if (cfg.cssVars) root.setAttribute('style', cfg.cssVars);
      }
    });
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bindUnifiedShell);
  }
  window.addEventListener('load', bindUnifiedShell);
  document.addEventListener('neo-pulse-ai-sidebar-merged', bindUnifiedShell);

  function onSubmit(e) {
    e.preventDefault();
    var text = textarea.value.trim();
    if (!text || isLoading) return;
    deliverMessage(text, 'typed');
  }

  function deliverMessage(text, origin) {
    if (!text || isLoading) return;
    var switchMode = normalizeSubmodeSwitchTopic(text);
    if (switchMode) {
      handleSubmodeSwitch(switchMode);
      return;
    }
    var inputOrigin = origin || 'typed';
    hideEmpty();
    textarea.value = '';
    autoResize(textarea);
    if (window.NeoPulseVoice && typeof window.NeoPulseVoice.updateSendMicVisibility === 'function') {
      NeoPulseVoice.updateSendMicVisibility(textarea, sendBtn);
    }
    appendUserBubble(text);
    pushHistoryTurn('user', text);
    if (window.NeoPulseChatDebugLog) {
      NeoPulseChatDebugLog.appendTurn({ role: 'user', content: text });
    }
    sendMessage(text, inputOrigin);
  }

  function showVoiceToast(msg) {
    var row = el('div', { className: 'fcw-msg fcw-msg--assistant' });
    var t = el('div', { className: 'neo-pulse-voice-toast' });
    t.textContent = msg;
    row.appendChild(t);
    messages.appendChild(row);
    scrollDown();
    setTimeout(function () {
      if (row.parentNode) row.parentNode.removeChild(row);
    }, 4500);
  }

  // ── API (streaming via admin-ajax) ────────────────────────────

  function prefetchOptions() {
    var pageCtx = cfg.pageContext || {};
    var pageContextKey = window.NeoPulseChatPrefetch && typeof window.NeoPulseChatPrefetch.getPageContextKey === 'function'
      ? window.NeoPulseChatPrefetch.getPageContextKey()
      : '';
    return {
      ajaxUrl: cfg.ajaxUrl,
      streamNonce: cfg.streamNonce || '',
      history: historyForApi(),
      sessionId: getChatSessionId(),
      source: 'frontend',
      adminMode: getAdminModeForApi(),
      adminSubmode: getAdminSubmodeForApi(),
      targetScope: getTargetScopeForApi(),
      pageUrl: window.location.href || pageCtx.url || '',
      postId: getEffectivePostIdForApi(),
      pageTitle: typeof document !== 'undefined' ? document.title || '' : '',
      pageContextKey: pageContextKey,
      isLoading: function () { return isLoading; }
    };
  }

  if (window.NeoPulseChatPrefetch) {
    NeoPulseChatPrefetch.bindComposer(textarea, prefetchOptions());
  }

  function sendMessage(text, inputOrigin, options) {
    options = options || {};
    inputOrigin = inputOrigin || 'typed';

    if (
      isBackendMode()
      && getAdminSubmodeForApi() === 'build'
      && window.NeoPulseBuildHarness
      && cfg.backendAssistUrl
    ) {
      isLoading = true;
      sendBtn.disabled = true;
      if (window.NeoPulseVoice) {
        NeoPulseVoice.updateSendMicVisibility(textarea, sendBtn);
      }
      if (window.NeoPulseBuildHarness.mountProgress) {
        NeoPulseBuildHarness.mountProgress(root);
      }
      NeoPulseBuildHarness.runBuild({
        message: text,
        history: history.slice(-6),
        cfg: cfg,
        root: root,
        thinkingSteps: resolveBuildThinkingSteps(text),
        pageUrl: window.location.href || (cfg.pageContext && cfg.pageContext.url) || '',
        postId: getEffectivePostIdForApi(),
        targetScope: getTargetScopeForApi(),
        pageContextKey: window.NeoPulseChatPrefetch && typeof window.NeoPulseChatPrefetch.getPageContextKey === 'function'
          ? NeoPulseChatPrefetch.getPageContextKey()
          : '',
        host: fcwThinkingHost(),
        presentCard: presentCard,
        onDone: function () {
          isLoading = false;
          sendBtn.disabled = false;
          if (window.NeoPulseVoice) {
            NeoPulseVoice.updateSendMicVisibility(textarea, sendBtn);
          }
          if (window.NeoPulseChatPrefetch) {
            NeoPulseChatPrefetch.refreshOptions(prefetchOptions());
          }
        }
      });
      return;
    }

    isLoading = true;
    sendBtn.disabled = true;
    if (window.NeoPulseVoice) {
      NeoPulseVoice.updateSendMicVisibility(textarea, sendBtn);
    }
    if (window.NeoPulseChatPrefetch) {
      NeoPulseChatPrefetch.refreshOptions(prefetchOptions());
    }
    var prefetchHit = null;
    if (window.NeoPulseChatPrefetch && !isBackendMode()) {
      prefetchHit = NeoPulseChatPrefetch.consumeForSubmit(text, historyForApi());
    }
    if (window.NeoPulseChatDebugLog) {
      NeoPulseChatDebugLog.beginAssistantTurn();
    }
    var host = fcwThinkingHost();
    var streamCtx = window.NeoPulseChatStream
      ? NeoPulseChatStream.createContext({
          host: host,
          messagesEl: messages,
          scrollDown: scrollDown,
          presentCard: presentCard,
          appendFollowUpChips: appendFollowUpChips,
          onDone: function () {
            isLoading = false;
            sendBtn.disabled = false;
            if (window.NeoPulseVoice) {
              NeoPulseVoice.updateSendMicVisibility(textarea, sendBtn);
            }
            if (window.NeoPulseChatPrefetch) {
              NeoPulseChatPrefetch.refreshOptions(prefetchOptions());
            }
          },
          onStreamEvent: function (evt) {
            if (evt.status === 'done' && evt.card) {
              isLoading = false;
              sendBtn.disabled = false;
              if (window.NeoPulseVoice) {
                NeoPulseVoice.updateSendMicVisibility(textarea, sendBtn);
              }
            }
            if (!window.NeoPulseChatDebugLog) return;
            if (evt.status === 'done' && evt.card) {
              var logMeta = {
                prefetch_key: prefetchHit && prefetchHit.prefetch_key ? prefetchHit.prefetch_key : ''
              };
              if (evt.template_intent) {
                logMeta.template_intent = evt.template_intent;
              }
              if (cfg.pageContext) {
                logMeta.page_context = {
                  title: cfg.pageContext.title || '',
                  url: cfg.pageContext.url || window.location.href || '',
                  type_label: cfg.pageContext.typeLabel || '',
                  has_body: !!(cfg.pageContext.postId),
                  path_hint: cfg.pageContext.pathHint || ''
                };
              }
              NeoPulseChatDebugLog.appendTurn({
                role: 'assistant',
                card: evt.card,
                meta: logMeta
              });
            } else if (evt.status === 'chips' && evt.relatedTopics && evt.relatedTopics.length) {
              NeoPulseChatDebugLog.appendStreamEvent('chips', '', { relatedTopics: evt.relatedTopics });
              NeoPulseChatDebugLog.patchLastAssistantRelatedTopics(evt.relatedTopics);
            } else if (evt.status) {
              if (evt.status === 'ack' && evt.text) {
                NeoPulseChatDebugLog.appendStreamEvent('ack', evt.text);
              } else if (evt.status !== 'ack') {
                NeoPulseChatDebugLog.appendStreamEvent(evt.status, evt.label || '');
              }
            }
          }
        })
      : null;
    if (streamCtx && window.NeoPulseChatStream) {
      NeoPulseChatStream.setTypingIndicator(streamCtx, messages, scrollDown);
      var ackText = window.NeoPulseChatPrefetch
        ? NeoPulseChatPrefetch.getPrefetchAck(text, prefetchHit)
        : '';
      if (ackText) {
        NeoPulseChatStream.showInstantAck(streamCtx, ackText);
        NeoPulseChatStream.setTypingIndicator(streamCtx, messages, scrollDown);
      }
    }
    var thinkingShell = null;

    var url = cfg.ajaxUrl +
      '?action=neo_pulse_chat_stream&_nonce=' + encodeURIComponent(cfg.streamNonce || '');

    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: text,
        history: historyForApi(),
        prefetch_key: prefetchHit && prefetchHit.prefetch_key ? prefetchHit.prefetch_key : '',
        session_id: getChatSessionId(),
        assistant_name: ASSISTANT,
        source: 'frontend',
        admin_mode: getAdminModeForApi(),
        admin_submode: getAdminSubmodeForApi(),
        page_content_mode: getPageContentModeForApi(),
        target_scope: getTargetScopeForApi(),
        page_url: window.location.href || (cfg.pageContext && cfg.pageContext.url) || '',
        post_id: getEffectivePostIdForApi(),
        page_title: typeof document !== 'undefined' ? document.title || '' : '',
        page_context_key: window.NeoPulseChatPrefetch && typeof window.NeoPulseChatPrefetch.getPageContextKey === 'function'
          ? NeoPulseChatPrefetch.getPageContextKey()
          : '',
        input_origin: inputOrigin
      })
    }).then(function (res) {
      if (!res.ok) {
        var httpErr = new Error('HTTP ' + res.status);
        httpErr.status = res.status;
        throw httpErr;
      }
      var reader = res.body.getReader();
      var decoder = new TextDecoder();
      var buf = '';
      var gotDone = false;

      function handleLine(line) {
        line = line.trim();
        if (!line) return;
        var evt;
        try { evt = JSON.parse(line); } catch (_) { return; }
        if (evt.status === 'done' && evt.card) {
          gotDone = true;
        }
        if (streamCtx && window.NeoPulseChatStream) {
          NeoPulseChatStream.handleEvent(evt, streamCtx);
          thinkingShell = streamCtx.thinkingShell || thinkingShell;
        } else if (evt.status === 'done' && evt.card) {
          presentCard(evt.card, {
            shell: thinkingShell,
            onDone: streamCtx ? streamCtx.onDone : undefined
          });
        } else if (evt.label && thinkingShell && window.NeoPulseThinkingCard) {
          NeoPulseThinkingCard.advanceStreamLabel(thinkingShell, host, evt.label);
        }
      }

      function pump() {
        return reader.read().then(function (result) {
          if (result.done) {
            // A last line may arrive without a trailing newline.
            buf += decoder.decode();
            if (buf.trim()) {
              handleLine(buf);
            }
            buf = '';
            if (!gotDone) {
              // The server stopped (timeout, fatal error) before sending an answer.
              var endErr = new Error('Stream ended without a reply');
              endErr.incomplete = true;
              throw endErr;
            }
            if (streamCtx && window.NeoPulseChatStream) {
              NeoPulseChatStream.removeTypingIndicator(streamCtx);
            }
            isLoading = false;
            sendBtn.disabled = false;
            if (window.NeoPulseVoice) {
              NeoPulseVoice.updateSendMicVisibility(textarea, sendBtn);
            }
            return;
          }
          buf += decoder.decode(result.value, { stream: true });
          var lines = buf.split('\n');
          buf = lines.pop();
          lines.forEach(handleLine);
          return pump();
        });
      }
      return pump();
    }).catch(function (err) {
      isLoading = false;
      sendBtn.disabled = false;
      if (window.NeoPulseVoice) {
        NeoPulseVoice.updateSendMicVisibility(textarea, sendBtn);
      }
      if (streamCtx && window.NeoPulseChatStream) {
        if (NeoPulseChatStream.clearDoneTimer) {
          NeoPulseChatStream.clearDoneTimer(streamCtx);
        }
        NeoPulseChatStream.removeTypingIndicator(streamCtx);
        thinkingShell = NeoPulseChatStream.ensureThinkingShell(streamCtx);
      }
      presentCard(streamErrorCard(err), { shell: thinkingShell });
    });
  }

  function streamErrorCard(err) {
    var status = err && err.status ? err.status : 0;
    if (status === 403) {
      return {
        type: 'not-found',
        title: 'Session expired',
        body: 'This page has been open for a while. Please refresh the page and send your message again.',
        confidence: 'low'
      };
    }
    if (status === 429) {
      return {
        type: 'not-found',
        title: 'Please slow down',
        body: 'You have sent a lot of messages in a short time. Please wait a few minutes and try again.',
        confidence: 'low'
      };
    }
    if (err && err.incomplete) {
      return {
        type: 'not-found',
        title: 'Something went wrong',
        body: 'The reply was interrupted before it finished. Please try again.',
        confidence: 'low'
      };
    }
    if (status >= 500) {
      return {
        type: 'not-found',
        title: 'Something went wrong',
        body: 'The assistant is unavailable right now. Please try again in a moment.',
        confidence: 'low'
      };
    }
    return {
      type: 'not-found',
      title: 'Connection error',
      body: 'Could not reach the server. Please check your internet connection.',
      confidence: 'low'
    };
  }

  // ── Rendering ─────────────────────────────────────────────────

  function appendUserBubble(text) {
    var row = el('div', { className: 'fcw-msg fcw-msg--user' });
    var bub = el('div', { className: 'fcw-user-bubble' });
    bub.textContent = text;
    row.appendChild(bub);
    messages.appendChild(row);
    scrollDown();
  }

  function appendCard(card) {
    if (card.type === 'plan' && card.steps && card.steps.length) {
      appendPlanCard(card);
      return;
    }
    rememberBuildRerunFromCard(card);
    var row = el('div', { className: 'fcw-msg fcw-msg--assistant' });
    var cardEl = el('div', { className: 'fcw-card' });

    var titleRow = el('div', { className: 'fcw-card__title-row' });

    if (uiOn('type_badge')) {
      var badge = el('span', {
        className: 'fcw-card__type-badge'
      });
      badge.textContent = fcwTypeBadgeLabel(card.type);
      titleRow.appendChild(badge);
    }

    var title = el('span', { className: 'fcw-card__title' });
    title.innerHTML = renderMarkdown(card.title || '');
    titleRow.appendChild(title);
    cardEl.appendChild(titleRow);

    if (!fcwRenderDetailsDrawerInCard(cardEl, card) && card.body) {
      var body = el('div', { className: 'fcw-card__body' });
      body.innerHTML = renderMarkdown(card.body);
      cardEl.appendChild(body);
    }

    fcwAppendConversionBlock(cardEl, card);

    var confMap = {
      high: 'High confidence',
      medium: 'Based on site content',
      low: 'Limited information'
    };
    if (uiOn('confidence')) {
      var conf = el('div', { className: 'fcw-card__confidence' });
      conf.textContent = confMap[card.confidence] || confMap.medium;
      cardEl.appendChild(conf);
    }

    if (showSourcePills()) {
      fcwAppendCardLinkPills(cardEl, card, null);
    }

    appendCardCtas(cardEl, card);

    if (uiOn('suggestion_chips') && card.relatedTopics && card.relatedTopics.length) {
      appendTopicChips(cardEl, card.relatedTopics, card);
    }

    row.appendChild(cardEl);
    messages.appendChild(row);
    scrollDown(row);
  }

  function appendStatus(label) {
    var row = el('div', { className: 'fcw-msg fcw-msg--assistant' });
    var s = el('div', { className: 'fcw-status' });
    s.textContent = label;
    row.appendChild(s);
    messages.appendChild(row);
    scrollDown();
    return row;
  }

  function updateStatus(row, label) {
    var s = row && row.querySelector('.fcw-status');
    if (s) s.textContent = label;
    scrollDown();
  }

  function removeStatus(row) {
    if (row && row.parentNode) {
      row.parentNode.removeChild(row);
    }
  }

  function scrollDown(target) {
    requestAnimationFrame(function () {
      if (target && target.nodeType === 1 && messages) {
        var messagesRect = messages.getBoundingClientRect();
        var rowRect = target.getBoundingClientRect();
        messages.scrollTop += rowRect.top - messagesRect.top;
        return;
      }
      messages.scrollTop = messages.scrollHeight;
    });
  }

  // ── Helpers ───────────────────────────────────────────────────

  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'className') node.className = attrs[k];
        else if (k === 'innerHTML') node.innerHTML = attrs[k];
        else node.setAttribute(k, attrs[k]);
      });
    }
    return node;
  }

  // Escapes quotes too: results are used inside attribute values.
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function fallbackLink(label, url) {
    if (!/^https?:\/\//i.test(String(url))) return label;
    return '<a href="' + url + '" target="_blank" rel="noopener noreferrer">' + label + '</a>';
  }

  function renderMarkdown(text) {
    if (window.NeoPulseMarkdown && typeof window.NeoPulseMarkdown.render === 'function') {
      return NeoPulseMarkdown.render(text);
    }
    // Fallback when the shared renderer did not load. Text is escaped first (quotes included),
    // so captured URLs cannot break out of href.
    var s = esc(text);
    s = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, function (match, label, url) {
      return fallbackLink(label, url);
    });
    s = s.replace(/(^|[\s(])((https?:\/\/[^\s<)]+))/g, function (match, prefix, url) {
      return prefix + fallbackLink(url, url);
    });
    s = s.replace(/\n/g, '<br>');
    return s;
  }

  function linkIcon(type) {
    if (type === 'edit') return SVG_ICON_EDIT;
    if (type === 'preview') return SVG_ICON_PREVIEW;
    if (type === 'post') return SVG_ICON_POST;
    if (type === 'page') return SVG_ICON_PAGE;
    if (type === 'external') return SVG_ICON_EXT;
    return SVG_ICON_PAGE;
  }

  function autoResize(ta) {
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 120) + 'px';
  }
  textarea.addEventListener('input', function () { autoResize(textarea); });

  function cardFromStoredTurn(turn) {
    if (!turn) {
      return { title: '', body: '' };
    }
    if (!turn.card) {
      return { title: turn.content || '', body: '' };
    }
    var card = {
      type: turn.card.type || '',
      title: turn.card.title || turn.content || '',
      body: turn.card.body || '',
      confidence: turn.card.confidence || '',
      cta: turn.card.cta || null,
      submode_switch: turn.card.submode_switch || '',
      links: turn.card.links || [],
      relatedTopics: turn.card.relatedTopics || []
    };
    if (turn.action_result && turn.action_result.post_id) {
      card.action_result = turn.action_result;
    } else if (turn.card.action_result && turn.card.action_result.post_id) {
      card.action_result = turn.card.action_result;
    }
    if (turn.card.details_drawer) {
      card.details_drawer = turn.card.details_drawer;
    }
    if (turn.card.harness_sections) {
      card.harness_sections = turn.card.harness_sections;
    }
    if (turn.card.harness_progress) {
      card.harness_progress = turn.card.harness_progress;
    }
    if (turn.card.build_message) {
      card.build_message = turn.card.build_message;
    }
    return card;
  }

  function restoreHistoryToUi() {
    if (!history.length || !messages) return;
    hideEmpty();
    history.forEach(function (turn) {
      if (!turn || !turn.role) return;
      if (turn.role === 'user') {
        appendUserBubble(turn.content || '');
        return;
      }
      if (turn.role === 'assistant') {
        appendCard(cardFromStoredTurn(turn));
      }
    });
    scrollDown();
  }

  restoreHistoryToUi();
})();
