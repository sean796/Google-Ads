(function () {
  'use strict';

  var cfg = window.neoPulseChatDemo || {};
  var UI = cfg.ui || {};
  var root = document.getElementById('neo-pulse-chat-demo');
  if (!root) return;

  function uiOn(key) {
    return UI[key] !== false;
  }

  var msgs = document.getElementById('neo-pulse-chat-demo-messages');
  var empty = document.getElementById('neo-pulse-chat-demo-empty');
  var input = document.getElementById('neo-pulse-chat-demo-input');
  var btn = document.getElementById('neo-pulse-chat-demo-send');
  var form = root.querySelector('.fcw-demo-composer');
  var history = [];
  var loading = false;
  function getChatSessionId() {
    var key = 'neo_pulse_chat_session_id';
    var id = sessionStorage.getItem(key);
    if (!id) {
      id = 'csess_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
      sessionStorage.setItem(key, id);
    }
    return id;
  }

  function historyStorageKey() {
    return 'neo_pulse_chat_history_' + getChatSessionId();
  }

  function loadHistory() {
    try {
      var raw = sessionStorage.getItem(historyStorageKey());
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
      sessionStorage.setItem(historyStorageKey(), JSON.stringify(history.slice(-10)));
    } catch (_) {}
  }

  function pushHistoryTurn(role, content, card) {
    var turn = { role: role, content: content || '' };
    if (role === 'assistant' && card) {
      turn.card = {
        title: card.title,
        cta: card.cta,
        links: card.links,
        relatedTopics: card.relatedTopics
      };
    }
    history.push(turn);
    saveHistory();
  }

  loadHistory();

  if (window.NeoPulseChatDebugLog) {
    NeoPulseChatDebugLog.createSession({
      sessionId: getChatSessionId(),
      source: 'demo',
      pageUrl: '',
      siteName: ''
    });
  }

  if (!msgs || !input || !btn) return;

  var copyLogBtn = document.getElementById('neo-pulse-chat-demo-copy-log');
  if (copyLogBtn) {
    copyLogBtn.addEventListener('click', function () {
      if (window.NeoPulseChatDebugLog) {
        NeoPulseChatDebugLog.copyToClipboard(copyLogBtn);
      }
    });
  }

  function hideEmpty() {
    if (empty) empty.hidden = true;
    msgs.hidden = false;
  }

  function clearChat() {
    if (loading) return;
    history = [];
    saveHistory();
    if (window.NeoPulseChatDebugLog) {
      NeoPulseChatDebugLog.clear();
    }
    msgs.innerHTML = '';
    if (empty) empty.hidden = false;
    msgs.hidden = true;
    input.value = '';
    autoResize(input);
    if (window.NeoPulseVoice && typeof window.NeoPulseVoice.updateSendMicVisibility === 'function') {
      NeoPulseVoice.updateSendMicVisibility(input, btn);
    }
  }

  var clearChatBtn = document.getElementById('neo-pulse-chat-demo-clear');
  if (clearChatBtn) {
    clearChatBtn.addEventListener('click', clearChat);
  }

  root.querySelectorAll('.fcw-demo-starter').forEach(function (chip) {
    chip.addEventListener('click', function () {
      var text = chip.getAttribute('data-prompt') || chip.textContent || '';
      if (text) deliverMessage(text.trim());
    });
  });

  btn.addEventListener('mousedown', function () {
    if (window.NeoPulseChatPrefetch && input && input.value.trim()) {
      NeoPulseChatPrefetch.prefetchOnSendIntent(input);
    }
  });
  btn.addEventListener('click', function () {
    if (input.value.trim()) send();
  });

  if (form) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      send();
    });
  }

  input.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  });

  function bindVoiceWhenReady() {
    if (!window.NeoPulseVoice || typeof window.NeoPulseVoice.bindPtt !== 'function') {
      setTimeout(bindVoiceWhenReady, 50);
      return;
    }
    NeoPulseVoice.bindPtt(btn, input, {
      isLoading: function () {
        return loading;
      },
      onTranscript: function (text) {
        deliverMessage(text);
      },
      onError: function (msg) {
        showVoiceToast(msg);
      }
    });
  }
  bindVoiceWhenReady();

  function showVoiceToast(msg) {
    hideEmpty();
    var row = document.createElement('div');
    row.className = 'fcw-msg fcw-msg--assistant';
    var t = document.createElement('div');
    t.className = 'neo-pulse-voice-toast';
    t.textContent = msg;
    row.appendChild(t);
    msgs.appendChild(row);
    setTimeout(function () {
      if (row.parentNode) row.parentNode.removeChild(row);
    }, 4500);
    scrollDown();
  }

  function deliverMessage(text) {
    if (!text || loading) return;
    hideEmpty();
    input.value = '';
    autoResize(input);
    if (window.NeoPulseVoice && typeof window.NeoPulseVoice.updateSendMicVisibility === 'function') {
      NeoPulseVoice.updateSendMicVisibility(input, btn);
    }
    appendUser(text);
    pushHistoryTurn('user', text);
    if (window.NeoPulseChatDebugLog) {
      NeoPulseChatDebugLog.appendTurn({ role: 'user', content: text });
    }
    runStream(text);
  }

  function send() {
    var text = input.value.trim();
    if (!text || loading) return;
    deliverMessage(text);
  }

  function buildStepsList(steps) {
    var ul = document.createElement('ul');
    ul.className = 'fcw-thinking-steps';
    (steps || []).forEach(function (step, idx) {
      var st = step.status || 'pending';
      var li = document.createElement('li');
      li.className = 'fcw-thinking-step fcw-thinking-step--' + st;
      li.setAttribute('data-step-index', String(idx));
      var lbl = document.createElement('span');
      lbl.className = 'fcw-thinking-step-label';
      lbl.textContent = step.label || 'Step ' + (idx + 1);
      li.appendChild(lbl);
      ul.appendChild(li);
    });
    return ul;
  }

  function appendWorkflowCard(card) {
    hideEmpty();
    var row = document.createElement('div');
    row.className = 'fcw-msg fcw-msg--assistant';
    var c = document.createElement('div');
    c.className = 'fcw-card fcw-card--thinking-active';
    var tr = document.createElement('div');
    tr.className = 'fcw-card__title-row';
    var badge = null;
    if (uiOn('type_badge')) {
      badge = document.createElement('span');
      badge.className = 'fcw-card__type-badge';
      badge.textContent = 'working';
      tr.appendChild(badge);
    }
    var title = document.createElement('span');
    title.className = 'fcw-card__title';
    title.innerHTML = renderMd(card.title || 'Working on it\u2026');
    tr.appendChild(title);
    c.appendChild(tr);
    var body = document.createElement('div');
    body.className = 'fcw-card__body';
    if (card.body) {
      body.innerHTML = renderMd(card.body);
    } else {
      body.style.display = 'none';
    }
    c.appendChild(body);
    var stepsList = buildStepsList(card.steps || []);
    c.appendChild(stepsList);
    row.appendChild(c);
    msgs.appendChild(row);
    scrollDown();
    return { root: row, cardEl: c, badgeEl: badge, titleEl: title, bodyEl: body, stepsList: stepsList };
  }

  function setWorkflowStepStatus(shell, idx, status) {
    if (!shell || !shell.stepsList) return;
    var li = shell.stepsList.querySelector('[data-step-index="' + idx + '"]');
    if (!li) return;
    li.className = 'fcw-thinking-step fcw-thinking-step--' + status;
  }

  function setWorkflowCardActive(shell, active) {
    if (shell && shell.cardEl) {
      shell.cardEl.classList.toggle('fcw-card--thinking-active', !!active);
    }
  }

  function typeBadgeLabel(type) {
    if (type === 'lead') return 'Lead';
    return type || 'answer';
  }

  function appendConversionBlock(cardEl, card) {
    if (!cardEl || !card || !card.conversion) return;
    var conv = card.conversion;
    var block = document.createElement('div');
    block.className = 'fcw-card__conversion';
    if (conv.headline) {
      var headline = document.createElement('div');
      headline.className = 'fcw-card__conversion-headline';
      headline.textContent = conv.headline;
      block.appendChild(headline);
    }
    var contact = conv.contact || {};
    if (contact.phone || contact.email || contact.address || contact.hours) {
      var contactWrap = document.createElement('div');
      contactWrap.className = 'fcw-card__conversion-contact';
      if (contact.phone) {
        var phone = document.createElement('a');
        phone.className = 'fcw-card__conversion-item fcw-card__conversion-phone';
        phone.href = 'tel:' + String(contact.phone).replace(/[^\d+]/g, '');
        phone.textContent = contact.phone;
        contactWrap.appendChild(phone);
      }
      if (contact.email) {
        var email = document.createElement('a');
        email.className = 'fcw-card__conversion-item fcw-card__conversion-email';
        email.href = 'mailto:' + contact.email;
        email.textContent = contact.email;
        contactWrap.appendChild(email);
      }
      if (contact.address) {
        var address = document.createElement('div');
        address.className = 'fcw-card__conversion-item fcw-card__conversion-address';
        address.textContent = contact.address;
        contactWrap.appendChild(address);
      }
      if (contact.hours) {
        var hours = document.createElement('div');
        hours.className = 'fcw-card__conversion-item fcw-card__conversion-hours';
        hours.textContent = contact.hours;
        contactWrap.appendChild(hours);
      }
      block.appendChild(contactWrap);
    }
    cardEl.appendChild(block);
  }

  function applyCardBadge(badgeEl, t) {
    badgeEl.textContent = typeBadgeLabel(t);
  }

  function appendTopicChips(cardEl, topics) {
    if (!uiOn('suggestion_chips') || !cardEl || !topics || !topics.length) return;
    if (cardEl.querySelector('.fcw-card__topics')) return;
    var tw = document.createElement('div');
    tw.className = 'fcw-card__topics';
    topics.forEach(function (topic) {
      var chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'fcw-topic-chip';
      chip.textContent = topic;
      chip.addEventListener('click', function () {
        deliverMessage(topic);
      });
      tw.appendChild(chip);
    });
    cardEl.appendChild(tw);
  }

  function appendFollowUpChips(evt) {
    var topics = evt && evt.relatedTopics ? evt.relatedTopics : [];
    if (!topics.length) return;
    var cards = msgs.querySelectorAll('.fcw-card');
    if (!cards.length) return;
    appendTopicChips(cards[cards.length - 1], topics);
    if (history.length && history[history.length - 1].role === 'assistant') {
      var last = history[history.length - 1];
      if (!last.card) last.card = {};
      last.card.relatedTopics = topics.slice();
    }
    prefetchFollowUpChips({ relatedTopics: topics });
    scrollDown();
  }

  function populateCardExtras(shell, card) {
    if (!shell || !shell.cardEl) return;
    var c = shell.cardEl;
    c.querySelectorAll('.fcw-card__conversion,.fcw-card__confidence,.fcw-card__links,.fcw-card__cta-wrap,.fcw-card__topics').forEach(function (n) {
      if (n.parentNode) n.parentNode.removeChild(n);
    });
    appendConversionBlock(c, card);
    if (uiOn('confidence')) {
      var confMap = { high: 'High confidence', medium: 'Based on site content', low: 'Limited information' };
      var conf = document.createElement('div');
      conf.className = 'fcw-card__confidence';
      conf.textContent = confMap[card.confidence] || confMap.medium;
      c.appendChild(conf);
    }
    if (uiOn('source_pills') && card.links && card.links.length) {
      var lw = document.createElement('div');
      lw.className = 'fcw-card__links';
      card.links.forEach(function (link) {
        var a = document.createElement('a');
        a.className = 'fcw-link-pill';
        a.href = link.url;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        a.textContent = link.label;
        lw.appendChild(a);
      });
      c.appendChild(lw);
    }
    if (uiOn('cta_buttons') && card.cta && card.cta.url) {
      var cw = document.createElement('div');
      cw.className = 'fcw-card__cta-wrap';
      var ca = document.createElement('a');
      ca.className = 'fcw-cta-btn';
      ca.href = card.cta.url;
      ca.target = '_blank';
      ca.rel = 'noopener noreferrer';
      ca.textContent = card.cta.label || 'Learn more';
      cw.appendChild(ca);
      c.appendChild(cw);
    }
    if (uiOn('suggestion_chips') && card.relatedTopics && card.relatedTopics.length) {
      appendTopicChips(c, card.relatedTopics);
    }
  }

  function thinkingHost() {
    return {
      appendWorkflowCard: appendWorkflowCard,
      setWorkflowStepStatus: setWorkflowStepStatus,
      setWorkflowCardActive: setWorkflowCardActive,
      applyCardBadge: applyCardBadge,
      renderMd: renderMd,
      populateCardExtras: populateCardExtras,
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
    var shell = opts.shell;
    var host = thinkingHost();
    var finish = function () {
      pushHistoryTurn('assistant', card.body || card.title || '', card);
      if (typeof opts.onDone === 'function') opts.onDone();
    };
    if (shell && window.NeoPulseThinkingCard) {
      NeoPulseThinkingCard.finalizeToCard(shell, card, host);
    } else {
      appendCard(card);
    }
    finish();
    prefetchFollowUpChips(card);
    return Promise.resolve();
  }

  function prefetchOptions() {
    return {
      ajaxUrl: cfg.ajaxUrl,
      streamNonce: cfg.streamNonce || '',
      history: history.slice(-10),
      sessionId: getChatSessionId(),
      source: 'demo',
      pageUrl: '',
      isLoading: function () { return loading; }
    };
  }

  if (window.NeoPulseChatPrefetch && input) {
    NeoPulseChatPrefetch.bindComposer(input, prefetchOptions());
    var starterPrompts = [];
    root.querySelectorAll('.fcw-demo-starter').forEach(function (chip) {
      var starterText = chip.getAttribute('data-prompt') || chip.textContent || '';
      if (starterText.trim()) starterPrompts.push(starterText.trim());
    });
    if (starterPrompts.length) {
      NeoPulseChatPrefetch.prefetchSuggestions(starterPrompts, prefetchOptions());
    }
  }

  function runStream(text) {
    loading = true;
    btn.disabled = true;
    hideEmpty();
    if (window.NeoPulseChatPrefetch) {
      NeoPulseChatPrefetch.refreshOptions(prefetchOptions());
    }
    var prefetchHit = window.NeoPulseChatPrefetch
      ? NeoPulseChatPrefetch.consumeForSubmit(text, history.slice(-10))
      : null;
    if (window.NeoPulseChatDebugLog) {
      NeoPulseChatDebugLog.beginAssistantTurn();
    }
    var host = thinkingHost();
    var streamCtx = window.NeoPulseChatStream
      ? NeoPulseChatStream.createContext({
          host: host,
          messagesEl: msgs,
          scrollDown: scrollDown,
          presentCard: presentCard,
          appendFollowUpChips: appendFollowUpChips,
          onDone: function () {
            loading = false;
            btn.disabled = false;
            input.focus();
            if (window.NeoPulseChatPrefetch) {
              NeoPulseChatPrefetch.refreshOptions(prefetchOptions());
            }
          },
          onStreamEvent: function (evt) {
            if (evt.status === 'done' && evt.card) {
              loading = false;
              btn.disabled = false;
            }
            if (!window.NeoPulseChatDebugLog) return;
            if (evt.status === 'done' && evt.card) {
              var logMeta = {
                prefetch_key: prefetchHit && prefetchHit.prefetch_key ? prefetchHit.prefetch_key : ''
              };
              if (evt.template_intent) {
                logMeta.template_intent = evt.template_intent;
              }
              NeoPulseChatDebugLog.appendTurn({
                role: 'assistant',
                card: evt.card,
                debug: evt.debug || null,
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
      NeoPulseChatStream.setTypingIndicator(streamCtx, msgs, scrollDown);
      var ackText = window.NeoPulseChatPrefetch
        ? NeoPulseChatPrefetch.getPrefetchAck(text, prefetchHit)
        : '';
      if (ackText) {
        NeoPulseChatStream.showInstantAck(streamCtx, ackText);
        NeoPulseChatStream.setTypingIndicator(streamCtx, msgs, scrollDown);
      }
    }
    var thinkingShell = null;
    var url = cfg.ajaxUrl + '?action=neo_pulse_chat_stream&_nonce=' + encodeURIComponent(cfg.streamNonce || '');
    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: text,
        history: history.slice(-10),
        prefetch_key: prefetchHit && prefetchHit.prefetch_key ? prefetchHit.prefetch_key : '',
        session_id: getChatSessionId(),
        source: 'demo',
        page_url: ''
      })
    })
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        var reader = res.body.getReader();
        var decoder = new TextDecoder();
        var buf = '';
        var gotDone = false;
        function handleLine(line) {
              line = line.trim();
              if (!line) return;
              var evt;
              try {
                evt = JSON.parse(line);
              } catch (_) {
                return;
              }
              if (evt.status === 'done' && evt.card) {
                gotDone = true;
              }
              if (streamCtx && window.NeoPulseChatStream) {
                NeoPulseChatStream.handleEvent(evt, streamCtx);
                thinkingShell = streamCtx.thinkingShell || thinkingShell;
              } else if (evt.status === 'done' && evt.card) {
                if (window.NeoPulseChatDebugLog) {
                  NeoPulseChatDebugLog.appendTurn({
                    role: 'assistant',
                    card: evt.card,
                    debug: evt.debug || null
                  });
                }
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
              // Last line may have no trailing newline; a stream with no "done" is an error.
              buf += decoder.decode();
              if (buf.trim()) {
                handleLine(buf);
              }
              buf = '';
              if (!gotDone) {
                throw new Error('Stream ended without a reply');
              }
              if (streamCtx && window.NeoPulseChatStream) {
                NeoPulseChatStream.removeTypingIndicator(streamCtx);
              }
              loading = false;
              btn.disabled = false;
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
      })
      .catch(function () {
        loading = false;
        btn.disabled = false;
        if (window.NeoPulseVoice) NeoPulseVoice.updateSendMicVisibility(input, btn);
        if (streamCtx && window.NeoPulseChatStream) {
          NeoPulseChatStream.removeTypingIndicator(streamCtx);
          thinkingShell = NeoPulseChatStream.ensureThinkingShell(streamCtx);
        }
        presentCard(
          {
            type: 'not-found',
            title: 'Connection error',
            body: 'Could not reach the server.',
            confidence: 'low'
          },
          {
            shell: thinkingShell,
            onDone: function () {
              input.focus();
            }
          }
        );
      });
  }

  function appendUser(text) {
    var row = document.createElement('div');
    row.className = 'fcw-msg fcw-msg--user';
    var bubble = document.createElement('div');
    bubble.className = 'fcw-user-bubble';
    bubble.textContent = text;
    row.appendChild(bubble);
    msgs.appendChild(row);
    scrollDown();
  }

  function appendCard(card) {
    hideEmpty();
    var row = document.createElement('div');
    row.className = 'fcw-msg fcw-msg--assistant';
    var c = document.createElement('div');
    c.className = 'fcw-card';
    var tr = document.createElement('div');
    tr.className = 'fcw-card__title-row';
    if (uiOn('type_badge')) {
      var badge = document.createElement('span');
      badge.className = 'fcw-card__type-badge';
      badge.textContent = typeBadgeLabel(card.type);
      tr.appendChild(badge);
    }
    var title = document.createElement('span');
    title.className = 'fcw-card__title';
    title.innerHTML = renderMd(card.title || '');
    tr.appendChild(title);
    c.appendChild(tr);
    if (card.body) {
      var body = document.createElement('div');
      body.className = 'fcw-card__body';
      body.innerHTML = renderMd(card.body);
      c.appendChild(body);
    }
    populateCardExtras({ cardEl: c }, card);
    row.appendChild(c);
    msgs.appendChild(row);
    scrollDown();
  }

  function scrollDown() {
    requestAnimationFrame(function () {
      msgs.scrollTop = msgs.scrollHeight;
    });
  }

  function autoResize(ta) {
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 160) + 'px';
  }

  input.addEventListener('input', function () {
    autoResize(input);
  });

  function renderMd(text) {
    if (window.NeoPulseMarkdown && typeof window.NeoPulseMarkdown.render === 'function') {
      return NeoPulseMarkdown.render(text);
    }
    // Escape quotes too: captured URLs land inside href="...".
    var s = String(text == null ? '' : text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
    s = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
    s = s.replace(/\n/g, '<br>');
    return s;
  }
})();
