(function () {
  'use strict';

  var DEBOUNCE_MS = 300;
  var MAX_QUERY_LENGTH = 100;
  var SESSION_KEY = 'neo-pulse_search_session_id';

  function bindAllSearchWraps() {
    var wraps = document.querySelectorAll('.neo-pulse-search-wrap:not(.neo-pulse-search-wrap--panel-inner)');
    for (var i = 0; i < wraps.length; i++) {
      initSearch(wraps[i]);
    }
  }

  document.addEventListener('DOMContentLoaded', bindAllSearchWraps);
  document.addEventListener('neo-pulse-ai-sidebar-merged', bindAllSearchWraps);

  function resolveSearchScope(wrap, shellPanel) {
    var unifiedPane = document.querySelector('[data-fai-unified="1"] .fai-sidebar-tab-pane[data-fai-tab="search"]');
    if (unifiedPane) {
      var unifiedInner = unifiedPane.querySelector('.neo-pulse-search-wrap--panel-inner') || unifiedPane;
      if (unifiedInner.querySelector('.fbs__input')) {
        return unifiedInner;
      }
    }
    if (shellPanel) {
      var panelInner = shellPanel.querySelector('.neo-pulse-search-wrap--panel-inner');
      if (panelInner) {
        return panelInner;
      }
    }
    return wrap;
  }

  function initSearch(wrap) {
    if (wrap.getAttribute('data-fbs-bound') === '1') {
      return;
    }
    if (wrap.classList.contains('neo-pulse-search-wrap--panel-inner')) {
      return;
    }
    if (!wrap.getAttribute('data-rest-url')) {
      return;
    }
    var isSidebar   = wrap.getAttribute('data-sidebar-mode') === '1';
    var isIconMode  = wrap.getAttribute('data-icon-mode') === '1';
    var iconOpenAs  = wrap.getAttribute('data-icon-open-as') || '';
    var sidebarShell = null;
    var shellPanel   = null;

    if (isIconMode && iconOpenAs === 'expand_inline') {
      var iconLauncher = wrap.querySelector('.fbs__icon-launcher');
      var iconPanel = wrap.querySelector('.fbs__icon-panel--expand');
      if (iconLauncher && iconPanel) {
        iconLauncher.addEventListener('click', function () {
          var open = !wrap.classList.contains('fbs--open');
          wrap.classList.toggle('fbs--open', open);
          iconLauncher.setAttribute('aria-expanded', open ? 'true' : 'false');
          if (open) {
            // Phones: the bar spans the screen just below the icon.
            if (window.matchMedia && window.matchMedia('(max-width: 767px)').matches) {
              iconPanel.style.top = Math.round(iconLauncher.getBoundingClientRect().bottom + 10) + 'px';
            } else {
              iconPanel.style.top = '';
            }
            iconPanel.removeAttribute('hidden');
            var focusInput = iconPanel.querySelector('.fbs__input');
            if (focusInput) focusInput.focus();
          } else {
            iconPanel.setAttribute('hidden', '');
          }
        });
        // Tap or click anywhere else closes it.
        document.addEventListener('click', function (e) {
          if (wrap.classList.contains('fbs--open') && !wrap.contains(e.target) && !wrap.hasAttribute('data-elementor-panel-preview')) {
            wrap.classList.remove('fbs--open');
            iconLauncher.setAttribute('aria-expanded', 'false');
            iconPanel.setAttribute('hidden', '');
          }
        });
      }
    }

    var isElementorEdit = wrap.getAttribute('data-elementor-edit-preview') === '1';
    var isElementorPanelPreview = wrap.getAttribute('data-elementor-panel-preview') === '1';

    function copyWrapSurfaceVars(source, panel, backdrop) {
      if (!source) {
        return;
      }
      var computed = window.getComputedStyle(source);
      var vars = [
        '--fai-sidebar-width', '--fai-sidebar-z-index', '--fbs-panel-bg', '--fai-sidebar-bg',
        '--fbs-panel-text', '--fai-sidebar-text', '--fbs-panel-text-muted', '--fai-sidebar-text-muted',
        '--fbs-panel-offset-top', '--fbs-radius', '--fbs-modal-max-width', '--fbs-backdrop-color', '--fbs-backdrop-opacity'
      ];
      for (var i = 0; i < vars.length; i++) {
        var name = vars[i];
        var value = computed.getPropertyValue(name);
        if (!value || value.trim() === '') {
          continue;
        }
        if (panel) {
          panel.style.setProperty(name, value.trim());
        }
        if (backdrop && (name === '--fbs-backdrop-color' || name === '--fbs-backdrop-opacity')) {
          backdrop.style.setProperty(name, value.trim());
        }
      }
    }

    if (isSidebar && window.NeoPulseAiSidebarShell && !isElementorEdit) {
      var shellBackdrop = wrap.querySelector('.fai-sidebar-backdrop, .fbs-modal-backdrop');
      shellPanel = wrap.querySelector('.fai-sidebar-panel, .fbs-modal-panel');
      if (isIconMode && iconOpenAs !== 'expand_inline' && shellBackdrop && shellPanel && shellPanel.parentNode === wrap) {
        document.body.appendChild(shellBackdrop);
        document.body.appendChild(shellPanel);
        shellBackdrop.classList.add('fai-sidebar-backdrop--portaled');
        shellPanel.classList.add('fai-sidebar-panel--portaled');
        if (wrap.classList.contains('fai-sidebar-root--left')) {
          shellPanel.classList.add('fai-sidebar-panel--portaled-left');
        } else {
          shellPanel.classList.add('fai-sidebar-panel--portaled-right');
        }
        if (wrap.classList.contains('fbs-modal-root')) {
          shellPanel.classList.add('fbs-modal-panel--portaled');
          shellBackdrop.classList.add('fbs-modal-backdrop--portaled');
        }
        copyWrapSurfaceVars(wrap, shellPanel, shellBackdrop);
        // Lets the Elementor widget's own style rules follow the panel to <body>.
        var elHost = wrap.closest ? wrap.closest('.elementor-element[data-id]') : null;
        if (elHost) {
          shellPanel.setAttribute('data-neo-pulse-el', elHost.getAttribute('data-id'));
          shellBackdrop.setAttribute('data-neo-pulse-el', elHost.getAttribute('data-id'));
        }
      }
      if (window.NeoPulseAiSidebarUnify) {
        window.NeoPulseAiSidebarUnify.tryMerge();
      }
      if (window.NeoPulseAiSidebarUnify && window.NeoPulseAiSidebarUnify.isMerged()) {
        sidebarShell = window.NeoPulseAiSidebarUnify.getShell();
      } else {
        sidebarShell = window.NeoPulseAiSidebarShell.init(wrap, {
          backdrop: shellBackdrop,
          panel: shellPanel,
          onOpen: function () {
            wrap.classList.add('neo-pulse-search-wrap--open');
          },
          onClose: function () {
            wrap.classList.remove('neo-pulse-search-wrap--open');
          }
        });
      }
    }

    var restUrl      = wrap.getAttribute('data-rest-url');
    var logUrl       = wrap.getAttribute('data-log-url') || '';
    var acceptUrl    = wrap.getAttribute('data-accept-url') || '';
    var insightsUrl  = wrap.getAttribute('data-insights-url') || '';
    var nonce        = wrap.getAttribute('data-nonce') || '';

    // Only logged-in pages carry a nonce. If one has expired (cached page, tab left open),
    // WordPress answers 403 rest_cookie_invalid_nonce: drop it and try once more without.
    function apiHeaders(json) {
      var h = {};
      if (json) h['Content-Type'] = 'application/json';
      if (nonce) h['X-WP-Nonce'] = nonce;
      return h;
    }
    function apiFetch(url, opts) {
      opts = opts || {};
      opts.headers = apiHeaders(!!opts.body);
      return fetch(url, opts).then(function (res) {
        if (res.status !== 403 || !nonce) return res;
        return res.clone().json().then(function (data) {
          if (!data || data.code !== 'rest_cookie_invalid_nonce') return res;
          nonce = '';
          opts.headers = apiHeaders(!!opts.body);
          return fetch(url, opts);
        }, function () { return res; });
      });
    }
    var maxResults   = parseInt(wrap.getAttribute('data-max-results'), 10) || 8;
    var hideAi       = wrap.getAttribute('data-hide-ai-banner') === '1';
    var hideScores   = wrap.getAttribute('data-hide-scores') === '1';
    var hideBest     = wrap.getAttribute('data-hide-best') === '1';
    var hidePowered  = wrap.getAttribute('data-hide-powered') === '1';
    var loggingOn    = wrap.getAttribute('data-logging-enabled') === '1';
    var termsLimit   = parseInt(wrap.getAttribute('data-popular-terms-limit'), 10) || 5;
    var showTerms    = wrap.getAttribute('data-show-popular-terms') === '1';
    var hidePinned   = wrap.getAttribute('data-hide-pinned') === '1';
    var showOverseer = wrap.getAttribute('data-show-popular-pages-overseer') === '1';
    var showSearchPg = wrap.getAttribute('data-show-popular-pages-search') === '1';
    var showThumbs   = wrap.getAttribute('data-show-thumbs') === '1';

    var searchScope = resolveSearchScope(wrap, shellPanel);
    var container = searchScope.querySelector('.fbs');
    var form      = searchScope.querySelector('.fbs__form');
    var input     = searchScope.querySelector('.fbs__input');
    var dropdown  = searchScope.querySelector('.fbs__dropdown');
    var statusEl  = searchScope.querySelector('.fbs__status');
    var poweredEl = searchScope.querySelector('.fbs__powered');

    if (!container || !input || !dropdown || !statusEl) {
      return;
    }
    wrap.setAttribute('data-fbs-bound', '1');

    if (hidePowered && poweredEl) {
      poweredEl.style.display = 'none';
    }

    var timer       = null;
    var controller  = null;
    var lastQuery   = '';
    var lastEventUid = '';
    var insightsLoaded = false;
    var resultsSlot = searchScope.querySelector('.fbs__results-slot');
    var hasResultsSlot = !!resultsSlot;
    var resultsSlotEmpty = searchScope.querySelector('.fbs__results-slot-empty');

    if (form) {
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        doSearch();
      });
    }

    input.addEventListener('input', function () {
      clearTimeout(timer);
      var q = input.value.trim();
      if (q === '') {
        closeDropdown();
        return;
      }
      timer = setTimeout(checkWordReadyThenSearch, DEBOUNCE_MS);
    });

    input.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        if (isSidebar && sidebarShell && sidebarShell.isOpen) {
          sidebarShell.close();
        } else if (isIconMode && iconOpenAs === 'expand_inline' && wrap.classList.contains('fbs--open')) {
          wrap.classList.remove('fbs--open');
          var panel = wrap.querySelector('.fbs__icon-panel--expand');
          if (panel) panel.setAttribute('hidden', '');
          var launcher = wrap.querySelector('.fbs__icon-launcher');
          if (launcher) {
            launcher.setAttribute('aria-expanded', 'false');
            launcher.focus();
          }
        } else {
          closeDropdown();
        }
        input.blur();
      }
    });

    if (!isSidebar && !(isIconMode && iconOpenAs === 'expand_inline')) {
      document.addEventListener('click', function (e) {
        if (!searchScope.contains(e.target) && !(isIconMode && wrap.querySelector('.fbs__icon-launcher') === e.target)) {
          closeDropdown();
        }
      });
    }

    if (!isElementorPanelPreview && (showTerms || showOverseer || showSearchPg)) {
      loadInsights();
    }

    function getSessionId() {
      try {
        var id = sessionStorage.getItem(SESSION_KEY);
        if (!id) {
          id = 'csess_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
          sessionStorage.setItem(SESSION_KEY, id);
        }
        return id;
      } catch (_) {
        return 'csess_' + Date.now() + '_fallback';
      }
    }

    // 0.9.253: decided here, with no server or AI call. Search once the visitor has finished a
    // word: the input ends in a space or punctuation, or the last word has 3+ characters.
    function wordReady(raw) {
      if (!raw || raw.trim() === '') return false;
      if (/[\s.,!?;:'")\]-]$/.test(raw)) return true;
      var words = raw.trim().split(/\s+/);
      var last = words.length ? words[words.length - 1] : '';
      return Array.from ? Array.from(last).length >= 3 : last.length >= 3;
    }

    function checkWordReadyThenSearch() {
      var q = input.value.trim();
      if (q === '' || q === lastQuery) return;
      if (wordReady(input.value)) {
        doSearch();
      } else {
        closeDropdown();
      }
    }

    function doSearch() {
      var q = input.value.trim().slice(0, MAX_QUERY_LENGTH).trim();
      if (q === '' || q === lastQuery) return;
      lastQuery = q;

      if (controller) {
        try { controller.abort(); } catch (_) {}
      }
      controller = typeof AbortController !== 'undefined' ? new AbortController() : null;

      if (isSidebar && sidebarShell && !sidebarShell.isOpen) {
        if (window.NeoPulseAiSidebarUnify && window.NeoPulseAiSidebarUnify.isMerged()) {
          window.NeoPulseAiSidebarUnify.openTab('search');
        } else {
          sidebarShell.open();
        }
      }

      showStatus('searching');

      var opts = {
        method: 'POST',
        body: JSON.stringify({ query: q, per_page: maxResults })
      };
      if (controller) opts.signal = controller.signal;

      apiFetch(restUrl, opts)
        .then(function (res) {
          if (!res.ok) {
            var httpErr = new Error('HTTP ' + res.status);
            httpErr.status = res.status;
            throw httpErr;
          }
          return res.json();
        })
        .then(function (data) {
          var results  = data && data.results ? data.results : [];
          var analysis = data && data.analysis ? data.analysis : null;
          if (results.length === 0) {
            showStatus('no-results');
            logSearch(q, 0, analysis, results);
            if (!isSidebar) closeDropdown();
            return;
          }
          renderResults(results, analysis);
          logSearch(q, results.length, analysis, results);
          hideStatus();
        })
        .catch(function (err) {
          if (err && err.name === 'AbortError') return;
          if (err && err.status === 429) {
            // Rate limited: keep the current results and allow the same query again later.
            lastQuery = '';
            hideStatus();
            return;
          }
          showStatus('error');
          if (!isSidebar) closeDropdown();
        });
    }

    function logSearch(query, resultCount, analysis, results) {
      if (!loggingOn || !logUrl) return;

      apiFetch(logUrl, {
        method: 'POST',
        body: JSON.stringify({
          session_id: getSessionId(),
          page_url: window.location.href || '',
          query: query,
          result_count: resultCount,
          intent: analysis && analysis.intent ? analysis.intent : '',
          sentiment: analysis && analysis.sentiment ? analysis.sentiment : '',
          results: results
        })
      }).then(function (res) {
        return res.json();
      }).then(function (data) {
        if (data && data.eventUid) {
          lastEventUid = data.eventUid;
        }
      }).catch(function () {});
    }

    function recordAccept(url, title, rank) {
      if (!loggingOn || !acceptUrl || !lastEventUid) return;
      apiFetch(acceptUrl, {
        method: 'POST',
        body: JSON.stringify({
          eventUid: lastEventUid,
          url: url,
          title: title,
          rank: rank
        }),
        keepalive: true
      }).catch(function () {});
    }

    function loadInsights() {
      if (insightsLoaded || !insightsUrl) return;
      insightsLoaded = true;

      var asked = [];
      if (showTerms) asked.push('popular_terms');
      if (showOverseer) asked.push('popular_pages_overseer');
      if (showSearchPg) asked.push('popular_pages_search');
      // Days come from the site settings; the list size from this widget (capped at 12 on the server).
      var url = insightsUrl + (insightsUrl.indexOf('?') === -1 ? '?' : '&') + 'sections=' + encodeURIComponent(asked.join(',')) + '&limit=' + encodeURIComponent(String(termsLimit || 5)) + (hidePinned ? '&pinned=0' : '');
      apiFetch(url, {}).then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      }).then(function (data) {
        var overseerPages = data.popularPagesOverseer || [];
        if (showTerms && data.popularTerms) {
          renderInsightBlock('popular_terms', data.popularTerms.slice(0, termsLimit), 'term');
        }
        if (showOverseer && overseerPages.length) {
          renderInsightBlock('popular_pages_overseer', overseerPages, 'page');
        }
        if (showSearchPg && data.popularPagesFromSearch) {
          renderInsightBlock('popular_pages_search', data.popularPagesFromSearch, 'page');
        }
      }).catch(function () {});
    }

    function popularTermLabel(query) {
      var words = String(query || '').trim().split(/\s+/).filter(Boolean);
      var maxWords = window.matchMedia('(max-width: 782px)').matches ? 2 : 3;
      if (words.length <= maxWords) {
        return words.join(' ');
      }
      return words.slice(0, maxWords).join(' ');
    }

    function renderInsightBlock(key, items, mode) {
      var block = searchScope.querySelector('.fbs__insights-block[data-insight="' + key + '"]');
      if (!block || !items || !items.length) return;

      var list = block.querySelector('.fbs__insights-list');
      if (!list) return;

      if (mode === 'page') {
        list.classList.add('fbs__insights-list--links');
      }
      if (mode === 'term') {
        list.classList.add('fbs__insights-list--terms');
      }

      list.innerHTML = '';
      for (var i = 0; i < items.length; i++) {
        var item = items[i];
        if (mode === 'term') {
          var chip = document.createElement('button');
          chip.type = 'button';
          chip.className = 'fbs__insight-chip nps-chip';
          chip.textContent = popularTermLabel(item.query);
          if (item.query && item.query !== chip.textContent) {
            chip.title = item.query;
          }
          chip.addEventListener('click', function (term) {
            return function () {
              input.value = term;
              lastQuery = '';
              doSearch();
            };
          }(item.query));
          list.appendChild(chip);
        } else {
          list.appendChild(cardNode('a', 'fbs__insight-link nps-card', item.url, item.title || item.url, '', item.type_label || '', item.thumb || ''));
        }
      }

      block.removeAttribute('hidden');
      wrap.classList.add('nps-has-sections');
      if (searchScope !== wrap) searchScope.classList.add('nps-has-sections');
    }

    function setSuggestionsOpen(open) {
      wrap.classList.toggle('neo-pulse-search-wrap--open', !!open);
      wrap.classList.toggle('nps-has-results', !!open);
      if (searchScope !== wrap) {
        searchScope.classList.toggle('nps-has-results', !!open);
      }
    }

    function el(tag, className, text) {
      var node = document.createElement(tag);
      if (className) node.className = className;
      if (text !== undefined && text !== null && text !== '') node.textContent = text;
      return node;
    }

    function thumbNode(src, title) {
      var box = el('span', 'nps-card__thumb');
      if (src) {
        var img = document.createElement('img');
        img.src = src;
        img.alt = '';
        img.loading = 'lazy';
        box.appendChild(img);
      } else {
        box.classList.add('nps-card__thumb--empty');
        box.textContent = String(title || '?').trim().charAt(0).toUpperCase();
      }
      return box;
    }

    function arrowNode() {
      var a = el('span', 'nps-card__arrow');
      a.setAttribute('aria-hidden', 'true');
      a.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>';
      return a;
    }

    var STAR_SVG = '<svg viewBox="0 0 24 24" width="10" height="10" fill="currentColor" aria-hidden="true"><path d="M12 2l2.9 6.3 6.9.7-5.1 4.7 1.4 6.8L12 17l-6.1 3.5 1.4-6.8L2.2 9l6.9-.7z"/></svg>';

    // Same markup as Neo_Pulse_Wp_Search_Render::score_html().
    function scoreNode(pct) {
      pct = Math.max(0, Math.min(100, Math.round(pct)));
      var grade = pct >= 80 ? 'high' : (pct >= 50 ? 'mid' : 'low');
      var pill = el('span', 'nps-score nps-score--' + grade);
      pill.appendChild(el('span', 'nps-score__dot'));
      pill.appendChild(document.createTextNode(pct + '% match'));
      return pill;
    }

    function bestNode() {
      var label = el('span', 'nps-best');
      label.innerHTML = STAR_SVG;
      label.appendChild(document.createTextNode('Best match'));
      return label;
    }

    // Same structure as Neo_Pulse_Wp_Search_Render::card_html().
    // opts.score: match percentage (pill next to the tag); opts.best: "Best match" label on the card.
    function cardNode(tagName, className, url, title, excerpt, tag, thumb, opts) {
      opts = opts || {};
      var scored = typeof opts.score === 'number' && opts.score >= 0;
      var card = el(tagName, className + (opts.best ? ' nps-card--best' : ''));
      if (tagName === 'a') card.href = url;
      if (opts.best) card.appendChild(bestNode());
      if (showThumbs) card.appendChild(thumbNode(thumb, title));
      var body = el('span', 'nps-card__body');
      body.appendChild(el('span', 'nps-card__title fbs__result-title', title));
      if (excerpt) body.appendChild(el('span', 'nps-card__text fbs__result-excerpt', excerpt));
      if (tag || scored) {
        var meta = el('span', 'nps-card__meta');
        if (tag) meta.appendChild(el('span', 'nps-tag fbs__result-meta', tag));
        if (scored) meta.appendChild(scoreNode(opts.score));
        body.appendChild(meta);
      }
      card.appendChild(body);
      card.appendChild(arrowNode());
      return card;
    }

    function showSlotEmpty() {
      if (resultsSlotEmpty) {
        resultsSlotEmpty.removeAttribute('hidden');
      }
    }

    function hideSlotEmpty() {
      if (resultsSlotEmpty) {
        resultsSlotEmpty.setAttribute('hidden', '');
      }
    }

    function showSlotDropdown() {
      dropdown.removeAttribute('hidden');
      if (!hasResultsSlot) {
        dropdown.style.display = 'block';
      }
    }

    function hideSlotDropdown() {
      dropdown.setAttribute('hidden', '');
      if (!hasResultsSlot) {
        dropdown.style.display = 'none';
      }
    }

    function showSlotStatus() {
      statusEl.removeAttribute('hidden');
      if (!hasResultsSlot) {
        statusEl.style.display = 'flex';
      }
    }

    function hideSlotStatus() {
      statusEl.setAttribute('hidden', '');
      if (!hasResultsSlot) {
        statusEl.style.display = 'none';
      }
    }

    function renderResults(results, analysis) {
      hideSlotEmpty();
      hideSlotStatus();
      dropdown.innerHTML = '';
      showSlotDropdown();
      setSuggestionsOpen(true);

      if (analysis && !hideAi && (analysis.intent || (analysis.keywords && analysis.keywords.length))) {
        var intents = {
          informational: 'Here is what we found',
          transactional: 'Ready to buy or book? Best matches first',
          commercial: 'Comparing options? Best matches first',
          navigational: 'Pages that match what you are looking for'
        };
        var banner = el('div', 'fbs__ai-banner nps-ai');
        var spark = el('span', 'nps-ai__icon');
        spark.setAttribute('aria-hidden', 'true');
        spark.innerHTML = '<svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor"><path d="M12 2l2.2 6.6L21 11l-6.8 2.4L12 20l-2.2-6.6L3 11l6.8-2.4z"/></svg>';
        banner.appendChild(spark);
        var line = el('span', 'nps-ai__text', intents[analysis.intent] || 'Best matches first');
        banner.appendChild(line);
        if (analysis.keywords && analysis.keywords.length) {
          var kws = el('span', 'nps-ai__keywords fbs__ai-keywords');
          for (var k = 0; k < Math.min(analysis.keywords.length, 4); k++) {
            kws.appendChild(el('span', 'nps-ai__keyword', analysis.keywords[k]));
          }
          banner.appendChild(kws);
        }
        dropdown.appendChild(banner);
      }

      // Match score: the server's "match" (how closely each result matches what was typed;
      // rank_results() always sets it).
      var ceiling = 100;

      dropdown.setAttribute('role', 'listbox');
      for (var i = 0; i < results.length; i++) {
        var item = results[i];
        var rank = i + 1;
        var pct = isFinite(Number(item.match)) ? Number(item.match) : -1;
        if (pct >= 0) {
          pct = Math.min(ceiling, Math.round(pct));
          ceiling = pct;
        }
        var a = cardNode('a', 'fbs__result nps-card nps-card--result', item.url, item.title, item.excerpt, item.type_label || item.type, item.thumb || '', {
          score: hideScores ? -1 : pct,
          best: i === 0 && !hideBest && (pct < 0 || pct >= 50)
        });
        a.setAttribute('role', 'option');
        a.addEventListener('click', function (url, title, r) {
          return function () {
            recordAccept(url, title, r);
          };
        }(item.url, item.title, rank));
        dropdown.appendChild(a);
      }

      appendPoweredFooter(dropdown);
      if (!hasResultsSlot) {
        dropdown.style.display = 'block';
      }
    }

    function appendPoweredFooter(parent) {
      if (hidePowered || hasResultsSlot) { // Panels already show it at the bottom.
        return;
      }
      var existing = parent.querySelector('.fbs__dropdown-footer');
      if (existing) {
        existing.remove();
      }
      if (!poweredEl) {
        return;
      }
      var footer = poweredEl.cloneNode(true);
      footer.className = 'fbs__dropdown-footer nps-powered';
      footer.removeAttribute('hidden');
      footer.setAttribute('href', poweredEl.href || 'https://neodigital.ca/neo-pulse-platform/');
      footer.setAttribute('target', '_blank');
      footer.setAttribute('rel', 'noopener noreferrer');
      parent.appendChild(footer);
    }

    function closeDropdown() {
      dropdown.innerHTML = '';
      hideSlotDropdown();
      hideSlotStatus();
      lastQuery = '';
      if (hasResultsSlot) {
        showSlotEmpty();
      }
      setSuggestionsOpen(false);
    }

    function showStatus(type) {
      hideSlotEmpty();
      hideSlotDropdown();
      setSuggestionsOpen(true);
      showSlotStatus();
      if (type === 'searching') {
        statusEl.innerHTML = '<span class="fbs__spinner nps-spinner"></span> Searching…';
      } else if (type === 'no-results') {
        statusEl.textContent = 'No results found.';
      } else {
        statusEl.textContent = 'Search failed. Please try again.';
      }
    }

    function hideStatus() {
      hideSlotStatus();
      statusEl.textContent = '';
      if (dropdown.hasAttribute('hidden')) {
        if (!isSidebar) setSuggestionsOpen(false);
      }
    }
  }

  window.NeoPulseSearch = window.NeoPulseSearch || {};
  window.NeoPulseSearch.initWrap = function (wrap) {
    if (wrap) {
      initSearch(wrap);
    }
  };
  window.NeoPulseSearch.initAll = function (root) {
    var scope = root || document;
    var wraps = scope.querySelectorAll('.neo-pulse-search-wrap:not(.neo-pulse-search-wrap--panel-inner)');
    for (var i = 0; i < wraps.length; i++) {
      initSearch(wraps[i]);
    }
  };
})();
