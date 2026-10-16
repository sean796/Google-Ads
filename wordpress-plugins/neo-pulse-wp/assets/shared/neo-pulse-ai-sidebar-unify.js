(function () {
  'use strict';

  var TAB_KEY = 'neo-pulse_ai_sidebar_tab';
  var merged = false;
  var shell = null;
  var activeTab = 'chat';

  function findSearchWrap() {
    var wraps = document.querySelectorAll('.neo-pulse-search-wrap:not(.neo-pulse-search-wrap--panel-inner)');
    for (var i = 0; i < wraps.length; i++) {
      var wrap = wraps[i];
      if (wrap.getAttribute('data-sidebar-mode') !== '1') continue;
      if (wrap.getAttribute('data-elementor-edit-preview') === '1') continue;
      // Only when the Search widget's "Combine with chat" switch is on.
      if (wrap.getAttribute('data-combine-chat') !== '1') continue;
      return wrap;
    }
    return null;
  }

  function getStoredTab() {
    try {
      var tab = sessionStorage.getItem(TAB_KEY);
      if (tab === 'search' || tab === 'chat') return tab;
    } catch (_) {}
    return 'chat';
  }

  function setActiveTab(tabId) {
    if (tabId !== 'chat' && tabId !== 'search') return;
    activeTab = tabId;
    try {
      sessionStorage.setItem(TAB_KEY, tabId);
    } catch (_) {}
    var host = document.querySelector('[data-fai-unified="1"]');
    if (!host) return;
    var panes = host.querySelectorAll('.fai-sidebar-tab-pane');
    var tabs = host.querySelectorAll('.fai-sidebar-tab');
    for (var i = 0; i < panes.length; i++) {
      var pane = panes[i];
      var on = pane.getAttribute('data-fai-tab') === tabId;
      pane.classList.toggle('fai-sidebar-tab-pane--active', on);
      pane.hidden = !on;
    }
    for (var j = 0; j < tabs.length; j++) {
      var btn = tabs[j];
      var selected = btn.getAttribute('data-fai-tab') === tabId;
      btn.classList.toggle('fai-sidebar-tab--active', selected);
      btn.setAttribute('aria-selected', selected ? 'true' : 'false');
    }
    var activePane = host.querySelector('.fai-sidebar-tab-pane[data-fai-tab="' + tabId + '"]');
    if (activePane) {
      var focusEl = activePane.querySelector('input:not([type="hidden"]), textarea');
      if (focusEl) focusEl.focus();
    }
  }

  function openTab(tabId) {
    setActiveTab(tabId);
    if (shell) shell.open();
  }

  function ensureChatSidebarStructure(chatRoot, searchWrap) {
    var side = searchWrap.classList.contains('fai-sidebar-root--left') ? 'left' : 'right';
    chatRoot.classList.remove('fai-sidebar-root--left', 'fai-sidebar-root--right');
    chatRoot.classList.add('fai-sidebar-root--' + side);
  }

  function wrapChatPane(panelBody) {
    if (panelBody.querySelector('.fai-sidebar-tab-pane[data-fai-tab="chat"]')) return;
    panelBody.classList.add('fai-sidebar-panel__body--tabs');
    var chatPane = document.createElement('div');
    chatPane.className = 'fai-sidebar-tab-pane fai-sidebar-tab-pane--active';
    chatPane.setAttribute('data-fai-tab', 'chat');
    var heading = panelBody.querySelector('.fcw-sidebar-heading, .fai-sidebar-heading');
    var chatMain = panelBody.querySelector('.fcw-sidebar-main');
    if (heading) chatPane.appendChild(heading);
    if (chatMain) chatPane.appendChild(chatMain);
    panelBody.insertBefore(chatPane, panelBody.firstChild);
  }

  function findSearchPanelBody(searchWrap) {
    var searchPanel = searchWrap.querySelector('.fai-sidebar-panel, .fbs-modal-panel');
    if (searchPanel) {
      return searchPanel.querySelector('.fai-sidebar-panel__body');
    }
    var portaledPanels = document.querySelectorAll('.fai-sidebar-panel--portaled, .fbs-modal-panel--portaled');
    for (var i = 0; i < portaledPanels.length; i++) {
      var panel = portaledPanels[i];
      if (!panel.querySelector('.neo-pulse-search-wrap--panel-inner, .fbs--sidebar-inner')) continue;
      return panel.querySelector('.fai-sidebar-panel__body');
    }
    var inners = document.querySelectorAll('.neo-pulse-search-wrap--panel-inner');
    for (var j = 0; j < inners.length; j++) {
      var body = inners[j].closest('.fai-sidebar-panel__body');
      if (body) return body;
    }
    return null;
  }

  function findSearchPanel(searchWrap) {
    var searchPanel = searchWrap.querySelector('.fai-sidebar-panel, .fbs-modal-panel');
    if (searchPanel) return searchPanel;
    var portaledPanels = document.querySelectorAll('.fai-sidebar-panel--portaled, .fbs-modal-panel--portaled');
    for (var i = 0; i < portaledPanels.length; i++) {
      var panel = portaledPanels[i];
      if (panel.querySelector('.neo-pulse-search-wrap--panel-inner, .fbs--sidebar-inner')) {
        return panel;
      }
    }
    return null;
  }
  function hideDuplicateShell(node) {
    if (!node) return;
    node.setAttribute('hidden', '');
    node.style.display = 'none';
  }

  function clearShellBinding(root) {
    if (!root) return;
    if (root._faiSidebarShell && root._faiSidebarShell.isOpen) {
      root._faiSidebarShell.close();
    }
    root.removeAttribute('data-fai-sidebar-bound');
    root._faiSidebarShell = null;
  }

  function tryMerge() {
    if (merged) return true;

    var chatRoot = document.getElementById('neo-pulse-chat-widget-root');
    var searchWrap = findSearchWrap();
    if (!chatRoot || !searchWrap) return false;

    if (chatRoot.getAttribute('data-fai-unified') === '1') {
      merged = true;
      shell = chatRoot._faiSidebarShell || shell;
      return true;
    }

    ensureChatSidebarStructure(chatRoot, searchWrap);

    var chatPanel = chatRoot.querySelector('.fai-sidebar-panel');
    var chatBackdrop = chatRoot.querySelector('.fai-sidebar-backdrop');
    if (!chatPanel || !chatBackdrop) return false;

    var searchPanel = findSearchPanel(searchWrap);
    var searchBody = findSearchPanelBody(searchWrap);
    if (!searchBody) return false;

    var panelBody = chatPanel.querySelector('.fai-sidebar-panel__body');
    if (!panelBody) {
      panelBody = document.createElement('div');
      panelBody.className = 'fai-sidebar-panel__body fai-sidebar-panel__body--tabs';
      chatPanel.appendChild(panelBody);
    }
    wrapChatPane(panelBody);

    var searchPane = document.createElement('div');
    searchPane.className = 'fai-sidebar-tab-pane';
    searchPane.setAttribute('data-fai-tab', 'search');
    searchPane.hidden = true;
    searchPane.appendChild(searchBody);
    panelBody.appendChild(searchPane);

    var toolbar = chatPanel.querySelector('.fai-sidebar-panel__toolbar');
    if (!toolbar) {
      toolbar = document.createElement('div');
      toolbar.className = 'fai-sidebar-panel__toolbar';
      chatPanel.insertBefore(toolbar, panelBody);
    }

    if (!toolbar.querySelector('.fai-sidebar-tabs')) {
      var tablist = document.createElement('div');
      tablist.className = 'fai-sidebar-tabs';
      tablist.setAttribute('role', 'tablist');
      ['chat', 'search'].forEach(function (id) {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'fai-sidebar-tab' + (id === 'chat' ? ' fai-sidebar-tab--active' : '');
        btn.setAttribute('role', 'tab');
        btn.setAttribute('data-fai-tab', id);
        btn.setAttribute('aria-selected', id === 'chat' ? 'true' : 'false');
        btn.textContent = id === 'chat' ? 'Chat' : 'Search';
        btn.addEventListener('click', function () {
          setActiveTab(id);
        });
        tablist.appendChild(btn);
      });
      toolbar.insertBefore(tablist, toolbar.firstChild);
    }

    hideDuplicateShell(searchPanel);
    hideDuplicateShell(searchWrap.querySelector('.fai-sidebar-backdrop, .fbs-modal-backdrop'));

    clearShellBinding(searchWrap);
    clearShellBinding(chatRoot);

    chatRoot.classList.add('fai-sidebar-root--unified');
    chatRoot.setAttribute('data-fai-unified', '1');

    if (window.NeoPulseAiSidebarShell) {
      shell = window.NeoPulseAiSidebarShell.init(chatRoot, {
        backdrop: chatBackdrop,
        panel: chatPanel
      });
    }

    var searchLauncher = searchWrap.querySelector('.fai-sidebar-launcher, .fbs__icon-launcher');
    var mobileLauncher = document.getElementById('neo-pulse-chat-mobile-launcher');
    if (shell && searchLauncher && typeof shell.registerLauncher === 'function') {
      shell.registerLauncher(searchLauncher, {
        onBeforeOpen: function () {
          setActiveTab('search');
        }
      });
    }
    if (shell && mobileLauncher && typeof shell.registerLauncher === 'function') {
      shell.registerLauncher(mobileLauncher);
    }

    activeTab = getStoredTab();
    setActiveTab(activeTab);
    merged = true;
    document.dispatchEvent(new CustomEvent('neo-pulse-ai-sidebar-merged'));
    return true;
  }

  window.NeoPulseAiSidebarUnify = {
    tryMerge: tryMerge,
    isMerged: function () {
      return merged;
    },
    getShell: function () {
      return shell;
    },
    setActiveTab: setActiveTab,
    openTab: openTab
  };
})();
