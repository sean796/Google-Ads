/**
 * God Mode Build harness — one POST, Details drawer parity.
 */
(function (global) {
  'use strict';

  var PHASES = [
    { title: 'Build checklist' },
    { title: 'Build blueprint' },
    { title: 'Deliverable' }
  ];

  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (!attrs) return node;
    Object.keys(attrs).forEach(function (key) {
      if (key === 'textContent') {
        node.textContent = attrs[key];
      } else if (key === 'innerHTML') {
        node.innerHTML = attrs[key];
      } else if (key === 'className') {
        node.className = attrs[key];
      } else {
        node.setAttribute(key, attrs[key]);
      }
    });
    return node;
  }

  function downloadFile(file) {
    if (!file || !file.content) return;
    var blob = new Blob([file.content], { type: file.mimeType || 'application/octet-stream' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = file.fileName || 'download';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function downloadAll(files) {
    if (!files || !files.length) return;
    var i = 0;
    function next() {
      if (i >= files.length) return;
      downloadFile(files[i]);
      i += 1;
      setTimeout(next, 300);
    }
    next();
  }

  var progressEl = null;
  var progressLabelEl = null;
  var progressFillEl = null;

  function mountProgress(root) {
    if (!root) return;
    progressEl = root.querySelector('.fcw-harness-progress');
    if (!progressEl) {
      progressEl = el('div', { className: 'fcw-harness-progress', hidden: '' });
      progressLabelEl = el('div', { className: 'fcw-harness-progress__label' });
      var track = el('div', { className: 'fcw-harness-progress__track' });
      progressFillEl = el('div', { className: 'fcw-harness-progress__fill' });
      track.appendChild(progressFillEl);
      progressEl.appendChild(progressLabelEl);
      progressEl.appendChild(track);
      var toolbar = root.querySelector('.fai-sidebar-panel__toolbar');
      if (toolbar && toolbar.parentNode) {
        toolbar.parentNode.insertBefore(progressEl, toolbar.nextSibling);
      }
    } else {
      progressLabelEl = progressEl.querySelector('.fcw-harness-progress__label');
      progressFillEl = progressEl.querySelector('.fcw-harness-progress__fill');
    }
  }

  function setProgress(completed, total, label) {
    if (!progressEl) return;
    completed = completed || 0;
    total = total || 3;
    var pct = total > 0 ? Math.round((completed / total) * 100) : 0;
    progressEl.removeAttribute('hidden');
    if (progressLabelEl) {
      progressLabelEl.textContent = (label || 'Build') + ' · ' + completed + '/' + total;
    }
    if (progressFillEl) {
      progressFillEl.style.width = pct + '%';
    }
  }

  function hideProgress() {
    if (progressEl) {
      progressEl.setAttribute('hidden', '');
    }
  }

  function thinkingSteps(deliverableTitle, customSteps) {
    if (customSteps && customSteps.length) {
      return customSteps.map(function (step, idx) {
        return {
          label: step.label || step,
          status: idx === 0 ? 'running' : (step.status || 'pending')
        };
      });
    }
    return [
      { label: 'Build checklist', status: 'running' },
      { label: 'Build blueprint', status: 'pending' },
      { label: deliverableTitle || 'Deliverable', status: 'pending' }
    ];
  }

  function renderDetailsDrawer(drawer, container) {
    if (!drawer || !container) return;
    container.innerHTML = '';
    var wrap = el('div', { className: 'fcw-details-drawer' });
    var rail = el('div', { className: 'fcw-details-drawer__rail' });
    var railFill = el('div', { className: 'fcw-details-drawer__rail-fill' });
    var progress = drawer.progress || { completed: 3, total: 3 };
    var pct = progress.total > 0 ? (progress.completed / progress.total) * 100 : 100;
    railFill.style.height = pct + '%';
    rail.appendChild(railFill);
    wrap.appendChild(rail);

    var stack = el('div', { className: 'fcw-details-stack' });

    var prep = drawer.prep || {};
    var prepBlock = el('div', { className: 'fcw-details-prep' });
    var prepTrigger = el('button', {
      type: 'button',
      className: 'fcw-details-prep__trigger',
      innerHTML: '<span>' + (prep.title || 'Build prep') + '</span>'
    });
    var prepBadge = el('span', { className: 'fcw-details-prep__badge' });
    prepBadge.textContent = String((prep.steps || []).length);
    prepTrigger.appendChild(prepBadge);
    prepBlock.appendChild(prepTrigger);
    var prepList = el('ol', { className: 'fcw-details-prep__steps' });
    (prep.steps || []).forEach(function (step, idx) {
      var li = el('li', { className: 'fcw-details-prep__step' });
      li.textContent = (idx + 1) + '. ' + (step.label || '');
      prepList.appendChild(li);
    });
    prepBlock.appendChild(prepList);
    stack.appendChild(prepBlock);

    var row = drawer.target_row || {};
    var rowWrap = el('div', { className: 'fcw-details-row-wrap' });
    var rowEl = el('div', { className: 'fcw-details-row fcw-details-row--active' });
    var rowMeta = el('div', { className: 'fcw-details-row__meta' });
    rowMeta.appendChild(el('span', { className: 'fcw-details-row__title', textContent: row.title || 'Target post' }));
    if (row.focus_keyword) {
      rowMeta.appendChild(el('span', { className: 'fcw-details-row__keyword', textContent: row.focus_keyword }));
    }
    if (row.date_label) {
      rowMeta.appendChild(el('span', { className: 'fcw-details-row__date', textContent: row.date_label }));
    }
    rowEl.appendChild(rowMeta);
    rowWrap.appendChild(rowEl);

    var rowBody = el('div', { className: 'fcw-details-row-body' });
    var summary = drawer.result_summary || {};
    if (summary.seo_title) {
      var seoLine = el('p', { className: 'fcw-details-summary' });
      seoLine.innerHTML = '<strong>SEO title:</strong> ' + escapeHtml(summary.seo_title);
      rowBody.appendChild(seoLine);
    }
    if (summary.meta_description) {
      var metaLine = el('p', { className: 'fcw-details-summary' });
      metaLine.innerHTML = '<strong>Meta description:</strong> ' + escapeHtml(summary.meta_description);
      rowBody.appendChild(metaLine);
    }
    if (summary.saved_fields) {
      var savedLine = el('p', { className: 'fcw-details-summary' });
      savedLine.innerHTML = '<strong>Saved fields:</strong> ' + escapeHtml(summary.saved_fields);
      rowBody.appendChild(savedLine);
    }

    var files = drawer.generated_files || [];
    var filesOpen = true;
    var filesBtn = el('button', { type: 'button', className: 'fcw-details-generated' });
    var filesHead = el('div', { className: 'fcw-details-generated__head' });
    filesHead.appendChild(el('span', { className: 'fcw-details-generated__icon', textContent: '\u2193' }));
    filesHead.appendChild(el('span', { className: 'fcw-details-generated__label', textContent: 'Generated files' }));
    filesBtn.appendChild(filesHead);
    var filesMeta = el('div', { className: 'fcw-details-generated__meta' });
    filesMeta.appendChild(el('span', {
      className: 'fcw-details-generated__status',
      textContent: drawer.status_message || 'Build complete'
    }));
    filesMeta.appendChild(el('span', {
      className: 'fcw-details-generated__progress',
      textContent: (progress.completed || 0) + '/' + (progress.total || 3)
    }));
    filesMeta.appendChild(el('span', {
      className: 'fcw-details-generated__count',
      textContent: String(files.length)
    }));
    var dlBtn = el('button', {
      type: 'button',
      className: 'fcw-details-generated__download',
      title: 'Download all',
      textContent: '\u2B07'
    });
    dlBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      downloadAll(files);
    });
    filesMeta.appendChild(dlBtn);
    filesBtn.appendChild(filesMeta);

    var fileList = el('ul', { className: 'fcw-details-file-list' });
    files.forEach(function (file) {
      var li = el('li');
      li.appendChild(el('span', { textContent: file.fileName || file.id || 'file' }));
      var one = el('button', { type: 'button', textContent: 'Download' });
      one.addEventListener('click', function () {
        downloadFile(file);
      });
      li.appendChild(one);
      fileList.appendChild(li);
    });

    filesBtn.addEventListener('click', function () {
      filesOpen = !filesOpen;
      fileList.style.display = filesOpen ? '' : 'none';
    });

    rowBody.appendChild(filesBtn);
    rowBody.appendChild(fileList);
    rowWrap.appendChild(rowBody);
    stack.appendChild(rowWrap);
    wrap.appendChild(stack);
    container.appendChild(wrap);
  }

  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function assistHeaders(cfg) {
    return {
      'Content-Type': 'application/json',
      'X-WP-Nonce': cfg.nonce || ''
    };
  }

  function lastPlanFromHistory(history) {
    if (!Array.isArray(history)) {
      return null;
    }
    var i;
    for (i = history.length - 1; i >= 0; i -= 1) {
      var turn = history[i];
      var card = turn && turn.card;
      if (card && card.workflow_id && Array.isArray(card.steps) && card.steps.length) {
        return card;
      }
    }
    return null;
  }

  function isSuccessfulBuildCard(card) {
    var exec = card && card.action_result;
    var ok = !!(exec && exec.success && exec.post_id);
    if (!ok) {
      return false;
    }
    return card.type === 'action' || card.type === 'workflow';
  }

  function normalizeBuildCard(card) {
    if (card && card.type === 'workflow' && card.action_result && card.action_result.success) {
      card.type = 'action';
    }
    return card;
  }

  function postJson(url, cfg, payload) {
    return fetch(url, {
      method: 'POST',
      headers: assistHeaders(cfg),
      body: JSON.stringify(payload)
    }).then(function (res) {
      return res.json().then(function (data) {
        if (!res.ok) {
          throw new Error((data && data.error) || 'Build request failed');
        }
        return data;
      });
    });
  }

  function postBuild(cfg, message, history, opts) {
    opts = opts || {};
    var url = cfg.backendAssistUrl || '';
    if (!url) {
      return Promise.reject(new Error('Build URL not configured'));
    }
    var pageCtx = cfg.pageContext || {};
    return postJson(url, cfg, {
      message: message,
      history: history,
      mode: 'build',
      admin_submode: 'build',
      target_scope: opts.targetScope || 'page',
      page_url: opts.pageUrl || window.location.href || pageCtx.url || '',
      post_id: typeof opts.postId === 'number' ? opts.postId : (pageCtx.postId || 0),
      page_title: typeof document !== 'undefined' ? document.title || '' : '',
      page_context_key: opts.pageContextKey || ''
    });
  }

  function postStep(cfg, workflowId, stepIndex, message, history) {
    var url = cfg.backendAssistStepUrl || '';
    if (!url) {
      return Promise.reject(new Error('Build step URL not configured'));
    }
    return postJson(url, cfg, {
      workflow_id: workflowId,
      step_index: stepIndex,
      message: message,
      history: history
    });
  }

  function runBuild(opts) {
    opts = opts || {};
    var message = opts.message || '';
    var history = opts.history || [];
    var cfg = opts.cfg || {};
    var host = opts.host || {};
    var presentCard = opts.presentCard;

    mountProgress(opts.root || document.getElementById('neo-pulse-chat-widget-root'));

    var plan = lastPlanFromHistory(history);
    var walked = !!(plan && cfg.backendAssistStepUrl);
    setProgress(0, walked && plan.steps ? plan.steps.length : 3, 'Build');

    var shell = null;
    var buildSteps = (walked && plan.steps) ? plan.steps : (opts.thinkingSteps || null);
    if (global.NeoPulseThinkingCard && host.appendWorkflowCard) {
      shell = global.NeoPulseThinkingCard.createThinkingCard(host, {
        stream: false,
        title: 'Building…',
        body: '',
        steps: thinkingSteps(null, buildSteps)
      });
      if (shell && shell.cardEl) {
        shell.cardEl.classList.add('fcw-card--build-running');
      }
      if (host.setWorkflowStepStatus) {
        host.setWorkflowStepStatus(shell, 0, 'running');
      }
    }

    function clearBuildRunning() {
      if (shell && shell.cardEl) {
        shell.cardEl.classList.remove('fcw-card--build-running');
      }
    }

    function finishPresent(card) {
      clearBuildRunning();
      if (typeof presentCard === 'function') {
        return presentCard(card, { shell: shell, onDone: opts.onDone });
      }
      return card;
    }

    function staggerHarnessPresent(card) {
      var tick = 0;
      var milestones = [
        { completed: 1, running: 1 },
        { completed: 2, running: 2 },
        { completed: 3, running: -1 }
      ];
      function step() {
        if (tick >= milestones.length) {
          finishPresent(card);
          return;
        }
        var m = milestones[tick];
        setProgress(m.completed, 3, tick >= 2 ? 'Build complete' : 'Build');
        if (shell && host.setWorkflowStepStatus) {
          var i;
          for (i = 0; i < 3; i++) {
            var st = 'pending';
            if (m.running < 0) {
              st = 'done';
            } else if (i < m.completed) {
              st = 'done';
            } else if (i === m.running) {
              st = 'running';
            }
            host.setWorkflowStepStatus(shell, i, st);
          }
        }
        tick += 1;
        setTimeout(step, 150);
      }
      step();
    }

    function walkPlan(plan) {
      var steps = plan.steps || [];
      var total = steps.length;
      var index = 0;
      setProgress(0, total, 'Build');
      if (shell && host.setWorkflowStepStatus) {
        for (var s = 0; s < total; s += 1) {
          host.setWorkflowStepStatus(shell, s, s === 0 ? 'running' : 'pending');
        }
      }

      function mark(i, status) {
        if (shell && host.setWorkflowStepStatus) {
          host.setWorkflowStepStatus(shell, i, status);
        }
      }

      function next() {
        if (index >= total) {
          return Promise.reject(new Error('Build finished without applying the changes.'));
        }
        var step = steps[index] || {};
        var label = step.label || ('Step ' + (index + 1));
        setProgress(index, total, label);
        if (step.executable === false || !step.tool) {
          mark(index, 'done');
          index += 1;
          return next();
        }
        mark(index, 'running');
        return postStep(cfg, plan.workflow_id, index, message, history).then(function (data) {
          if (!data || data.error) {
            mark(index, 'error');
            throw new Error((data && data.error) || 'Build step failed');
          }
          if (data.status === 'error') {
            mark(index, 'error');
            if (data.card) {
              return data.card;
            }
            throw new Error((data.result && data.result.error) || 'Build step failed');
          }
          mark(index, data.status || 'done');
          if (data.workflow_complete && data.card) {
            setProgress(total, total, 'Build complete');
            return normalizeBuildCard(data.card);
          }
          index += 1;
          return next();
        });
      }

      return next();
    }

    var start = walked
      ? walkPlan(plan)
      : postBuild(cfg, message, history, opts);

    return start.then(function (card) {
      card = normalizeBuildCard(card);
      var createdPage = isSuccessfulBuildCard(card);
      var isHarnessAction = !!(card && (card.type === 'action') && (card.details_drawer || createdPage));
      if (card && card.type === 'action' && !card.details_drawer && !createdPage) {
        hideProgress();
        card = {
          type: 'error',
          title: (card && card.title) ? card.title : 'Build did not run',
          body: (card && card.body) ? String(card.body) : 'Build did not execute.',
          confidence: 'low'
        };
      }
      if (!isHarnessAction) {
        hideProgress();
        if (shell && global.NeoPulseThinkingCard && host.setWorkflowStepStatus) {
          host.setWorkflowStepStatus(shell, 0, 'error');
          host.setWorkflowStepStatus(shell, 1, 'pending');
          host.setWorkflowStepStatus(shell, 2, 'pending');
        }
        if (!isHarnessAction && card && card.type !== 'error') {
          var failBody = (card && card.body) ? String(card.body) : '';
          if (card && card.type === 'plan') {
            failBody = 'Build did not execute the plan. Hard refresh, re-plan in Plan mode, then click Switch to Build mode again.';
          } else if (!failBody) {
            failBody = 'Build did not produce an action result.';
          }
          card = {
            type: 'error',
            title: (card && card.title) ? card.title : 'Build did not run',
            body: failBody,
            confidence: 'low'
          };
        }
        return finishPresent(card);
      }
      if (walked) {
        return finishPresent(card);
      }
      staggerHarnessPresent(card);
      return card;
    }).catch(function (err) {
      hideProgress();
      clearBuildRunning();
      var errCard = {
        type: 'error',
        title: 'Build failed',
        body: err && err.message ? err.message : 'Build request failed.',
        confidence: 'low'
      };
      if (typeof presentCard === 'function') {
        return presentCard(errCard, { shell: shell, onDone: opts.onDone });
      }
      throw err;
    });
  }

  global.NeoPulseBuildHarness = {
    runBuild: runBuild,
    renderDetailsDrawer: renderDetailsDrawer,
    setProgress: setProgress,
    hideProgress: hideProgress,
    downloadFile: downloadFile,
    downloadAll: downloadAll,
    mountProgress: mountProgress
  };
})(typeof window !== 'undefined' ? window : this);
