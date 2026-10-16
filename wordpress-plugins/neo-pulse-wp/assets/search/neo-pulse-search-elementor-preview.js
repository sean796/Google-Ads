(function ($) {
  'use strict';

  var reconcileTimer = null;

  function normalizeWidgetId(id) {
    return String(id || '').replace(/^elementor-element-/, '');
  }

  function getElementorWidgetIdFromElement(el) {
    if (!el || !el.className) {
      return '';
    }
    var classes = el.className.split(/\s+/);
    for (var i = 0; i < classes.length; i++) {
      if (classes[i].indexOf('elementor-element-') === 0) {
        return classes[i].slice('elementor-element-'.length);
      }
    }
    return '';
  }

  function getElementorWidgetId(wrap) {
    return getElementorWidgetIdFromElement(wrap ? wrap.closest('.elementor-element') : null);
  }

  function isNeoPulseSearchModel(model) {
    return model && typeof model.get === 'function' && model.get('widgetType') === 'neo-pulse_search';
  }

  // On unless switched off (older widgets saved before the switch existed count as on).
  function previewValueOn(value) {
    return value === undefined || value === null || value === 'yes';
  }

  function readPreviewPanelFromSettings(settings) {
    if (!settings) {
      return true;
    }
    if (typeof settings.get === 'function') {
      return previewValueOn(settings.get('preview_panel'));
    }
    return previewValueOn(settings.preview_panel);
  }

  function readPreviewPanelFromModel(model) {
    if (!model || typeof model.get !== 'function') {
      return false;
    }
    return readPreviewPanelFromSettings(model.get('settings'));
  }

  function getParentElementor() {
    try {
      var parentWin = window.parent;
      if (!parentWin || parentWin === window) {
        return null;
      }
      return parentWin.elementor || null;
    } catch (err) {
      return null;
    }
  }

  function getPanelEditingNeoPulseSearchModel() {
    try {
      var elementor = getParentElementor();
      if (!elementor || !elementor.getPanelView) {
        return null;
      }
      var panel = elementor.getPanelView();
      if (!panel || !panel.getCurrentPageView) {
        return null;
      }
      var page = panel.getCurrentPageView();
      if (!page || !page.model || !isNeoPulseSearchModel(page.model)) {
        return null;
      }
      return page.model;
    } catch (err) {
      return null;
    }
  }

  function getSelectedModelsFromParent() {
    try {
      var parentWin = window.parent;
      if (!parentWin || parentWin === window) {
        return [];
      }

      if (parentWin.$e && typeof parentWin.$e.run === 'function') {
        var selected = parentWin.$e.run('document/elements/get-selected');
        if (selected && selected.length) {
          return selected;
        }
      }

      var elementor = parentWin.elementor;
      if (elementor && elementor.selection && typeof elementor.selection.getElements === 'function') {
        var elements = elementor.selection.getElements();
        if (elements && elements.length) {
          var models = [];
          for (var i = 0; i < elements.length; i++) {
            var el = elements[i];
            models.push(el.model || el);
          }
          return models;
        }
      }
    } catch (err) {
      return [];
    }

    return [];
  }

  function readPreviewPanelFromFrontendConfig(widgetId) {
    if (!widgetId || typeof elementorFrontend === 'undefined') {
      return null;
    }

    var elements = elementorFrontend.config && elementorFrontend.config.elements;
    if (!elements || !elements.data) {
      return null;
    }

    var data = elements.data;
    var entry = data[widgetId];
    if (entry && entry.settings) {
      return previewValueOn(entry.settings.preview_panel);
    }

    var key;
    for (key in data) {
      if (!Object.prototype.hasOwnProperty.call(data, key)) {
        continue;
      }
      var item = data[key];
      if (!item || !item.settings) {
        continue;
      }
      if (normalizeWidgetId(key) === widgetId || normalizeWidgetId(item.id) === widgetId) {
        return previewValueOn(item.settings.preview_panel);
      }
    }

    return null;
  }

  function isWrapSelected(wrap) {
    var widgetId = normalizeWidgetId(getElementorWidgetId(wrap));
    if (!widgetId) {
      return false;
    }

    var models = getSelectedModelsFromParent();
    for (var i = 0; i < models.length; i++) {
      var model = models[i];
      if (typeof model.get === 'function' && normalizeWidgetId(model.get('id')) === widgetId) {
        return true;
      }
    }

    var panelModel = getPanelEditingNeoPulseSearchModel();
    if (panelModel && normalizeWidgetId(panelModel.get('id')) === widgetId) {
      return true;
    }

    return false;
  }

  function resolveShowPreview(wrap) {
    if (!isWrapSelected(wrap)) {
      return false;
    }

    var widgetId = normalizeWidgetId(getElementorWidgetId(wrap));

    var panelModel = getPanelEditingNeoPulseSearchModel();
    if (panelModel && normalizeWidgetId(panelModel.get('id')) === widgetId) {
      return readPreviewPanelFromModel(panelModel) === true;
    }

    var fromConfig = readPreviewPanelFromFrontendConfig(widgetId);
    if (fromConfig !== null) {
      return fromConfig === true;
    }

    var models = getSelectedModelsFromParent();
    for (var i = 0; i < models.length; i++) {
      var model = models[i];
      if (isNeoPulseSearchModel(model) && normalizeWidgetId(model.get('id')) === widgetId) {
        return readPreviewPanelFromModel(model) === true;
      }
    }

    return false;
  }

  function bindSearchWrap(wrap) {
    if (!wrap || wrap.getAttribute('data-elementor-edit-preview') !== '1') {
      return;
    }
    if (wrap.getAttribute('data-fbs-bound') === '1') {
      return;
    }
    if (window.NeoPulseSearch && typeof window.NeoPulseSearch.initWrap === 'function') {
      window.NeoPulseSearch.initWrap(wrap);
    }
  }

  function findPanelForWrap(wrap) {
    if (!wrap) {
      return null;
    }

    if (wrap._fbsPreviewPanel && wrap._fbsPreviewPanel.isConnected) {
      return wrap._fbsPreviewPanel;
    }

    var panel = wrap.querySelector(':scope > .fai-sidebar-panel, :scope > .fbs-modal-panel');
    if (panel) {
      return panel;
    }

    var widgetId = normalizeWidgetId(getElementorWidgetId(wrap));
    if (!widgetId) {
      return null;
    }

    return document.body.querySelector(
      '.fai-sidebar-panel[data-neo-pulse-el="' + widgetId + '"], .fbs-modal-panel[data-neo-pulse-el="' + widgetId + '"]'
    );
  }

  function restorePanelToWrap(wrap, panel) {
    if (!wrap || !panel) {
      return;
    }
    var home = wrap._fbsPanelHome;
    if (home && panel.parentNode !== home) {
      home.appendChild(panel);
    }
    panel.classList.remove('fai-sidebar-panel--elementor-editor-preview');
    panel.removeAttribute('data-neo-pulse-el');
    panel.style.cssText = '';
    wrap._fbsPreviewPanel = null;
  }

  // A re-rendered widget leaves its previous preview panel in <body>; keep only the current one.
  function removeStalePanels(widgetId, keep) {
    if (!widgetId) {
      return;
    }
    var nodes = document.body.querySelectorAll(':scope > [data-neo-pulse-el="' + widgetId + '"]');
    for (var i = 0; i < nodes.length; i++) {
      if (nodes[i] !== keep && !(nodes[i].closest && nodes[i].closest('.elementor-element'))) {
        nodes[i].parentNode.removeChild(nodes[i]);
      }
    }
  }

  function mountPanelForPreview(wrap, panel) {
    if (!wrap || !panel) {
      return;
    }

    if (!wrap._fbsPanelHome) {
      wrap._fbsPanelHome = panel.parentNode;
    }

    var widgetId = getElementorWidgetId(wrap);
    var isModal = wrap.classList.contains('fbs-modal-root');
    var isLeft = wrap.classList.contains('fai-sidebar-root--left');

    removeStalePanels(widgetId, panel);
    if (panel.parentNode !== document.body) {
      document.body.appendChild(panel);
    }

    panel.classList.add('fai-sidebar-panel--elementor-editor-preview');
    panel.setAttribute('data-neo-pulse-el', widgetId);
    panel.removeAttribute('hidden');
    panel.removeAttribute('aria-hidden');
    panel.classList.remove('fai-sidebar-panel--editor-preview-left', 'fai-sidebar-panel--editor-preview-right');

    if (isModal) {
      panel.classList.add('fbs-modal-panel');
    } else if (isLeft) {
      panel.classList.add('fai-sidebar-panel--editor-preview-left');
    } else {
      panel.classList.add('fai-sidebar-panel--editor-preview-right');
    }

    wrap._fbsPreviewPanel = panel;
  }

  function applyEditorPreviewState(wrap, show) {
    if (!wrap) {
      return;
    }

    var backdrop = wrap.querySelector('.fai-sidebar-backdrop, .fbs-modal-backdrop');
    var panel = findPanelForWrap(wrap);
    var iconPanel = wrap.querySelector('.fbs__icon-panel--expand');
    var isModal = wrap.classList.contains('fbs-modal-root');
    var isExpand = wrap.classList.contains('neo-pulse-search-wrap--icon-expand');

    if (show) {
      wrap.setAttribute('data-elementor-panel-preview', '1');
      wrap.classList.add('neo-pulse-search-wrap--panel-preview');
      wrap.classList.add(isModal ? 'fbs-modal-root--open' : 'fai-sidebar-root--open');

      if (isExpand) {
        wrap.classList.add('fbs--open', 'neo-pulse-search-wrap--open');
        if (iconPanel) {
          iconPanel.removeAttribute('hidden');
          iconPanel.removeAttribute('aria-hidden');
        }
      } else if (panel) {
        mountPanelForPreview(wrap, panel);
      }

      if (backdrop) {
        backdrop.setAttribute('hidden', '');
        backdrop.setAttribute('aria-hidden', 'true');
      }
      return;
    }

    wrap.removeAttribute('data-elementor-panel-preview');
    wrap.classList.remove(
      'neo-pulse-search-wrap--panel-preview',
      'fbs--open',
      'neo-pulse-search-wrap--open',
      'fai-sidebar-root--open',
      'fbs-modal-root--open'
    );

    if (panel) {
      restorePanelToWrap(wrap, panel);
      panel.classList.remove(
        'fai-sidebar-panel--editor-preview-left',
        'fai-sidebar-panel--editor-preview-right'
      );
      panel.setAttribute('hidden', '');
      panel.setAttribute('aria-hidden', 'true');
    }

    if (iconPanel) {
      iconPanel.setAttribute('hidden', '');
      iconPanel.setAttribute('aria-hidden', 'true');
    }

    if (backdrop) {
      backdrop.setAttribute('hidden', '');
      backdrop.setAttribute('aria-hidden', 'true');
    }
  }

  function reconcileActivePreviews() {
    document.querySelectorAll('.neo-pulse-search-wrap[data-elementor-edit-preview="1"]:not(.neo-pulse-search-wrap--panel-inner)').forEach(function (wrap) {
      var show = resolveShowPreview(wrap);
      applyEditorPreviewState(wrap, show);
      if (!show) {
        bindSearchWrap(wrap);
      }
    });
    // Widget deleted while its preview was open.
    document.querySelectorAll('body > .fai-sidebar-panel--elementor-editor-preview[data-neo-pulse-el]').forEach(function (panel) {
      var id = panel.getAttribute('data-neo-pulse-el');
      if (id && !document.querySelector('.elementor-element-' + id)) {
        panel.parentNode.removeChild(panel);
      }
    });
  }

  function scheduleReconcile() {
    if (reconcileTimer) {
      clearTimeout(reconcileTimer);
    }
    reconcileTimer = setTimeout(function () {
      reconcileTimer = null;
      reconcileActivePreviews();
    }, 0);
  }

  function scheduleReconcileDelayed() {
    scheduleReconcile();
    setTimeout(scheduleReconcile, 80);
    setTimeout(scheduleReconcile, 250);
  }

  function bindElementorEditorEvents() {
    var elementor = getParentElementor();
    if (!elementor) {
      return;
    }

    if (elementor.hooks && typeof elementor.hooks.addAction === 'function') {
      elementor.hooks.addAction('panel/open_editor/widget/neo-pulse_search', scheduleReconcileDelayed);
    }

    if (elementor.channels && elementor.channels.editor) {
      var editor = elementor.channels.editor;
      if (typeof editor.on === 'function') {
        editor.on('element:selected', scheduleReconcileDelayed);
        editor.on('change', scheduleReconcileDelayed);
        editor.on('element:change', scheduleReconcileDelayed);
      }
    }
  }

  function initScope(scope) {
    if (!scope || !scope.querySelectorAll) {
      return;
    }

    var wraps = scope.querySelectorAll('.neo-pulse-search-wrap[data-elementor-edit-preview="1"]:not(.neo-pulse-search-wrap--panel-inner)');
    for (var i = 0; i < wraps.length; i++) {
      bindSearchWrap(wraps[i]);
    }

    scheduleReconcileDelayed();
  }

  function bindElementorPreview() {
    if (typeof elementorFrontend === 'undefined') {
      return;
    }

    elementorFrontend.hooks.addAction('frontend/element_ready/neo-pulse_search.default', function ($scope) {
      initScope($scope[0]);
    });

    bindElementorEditorEvents();
    scheduleReconcileDelayed();

    $(window).on('elementor/element/activate elementor/element/deactivate', scheduleReconcileDelayed);
  }

  $(window).on('elementor/frontend/init', bindElementorPreview);
  $(function () {
    bindElementorEditorEvents();
    document.querySelectorAll('.neo-pulse-search-wrap[data-elementor-edit-preview="1"]:not(.neo-pulse-search-wrap--panel-inner)').forEach(function (wrap) {
      bindSearchWrap(wrap);
    });
    scheduleReconcileDelayed();
  });
})(jQuery);
