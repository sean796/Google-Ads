/**
 * NEO Pulse Overseer — first-party analytics beacon (pageviews, time on page, interactions).
 */
(function () {
	'use strict';

	function readConfig() {
		if (window.neoPulseOverseer && window.neoPulseOverseer.endpoint) {
			return window.neoPulseOverseer;
		}
		var el = document.getElementById('neo-pulse-overseer-config');
		if (el && el.textContent) {
			try {
				return JSON.parse(el.textContent);
			} catch (e) {
				/* fall through */
			}
		}
		return null;
	}

	var cfg = readConfig();
	if (!cfg || !cfg.endpoint) {
		return;
	}
	// The REST nonce is only sent (and only required) for logged-in visitors.
	var nonce = typeof cfg.nonce === 'string' ? cfg.nonce : '';
	var pagePostId = parseInt(cfg.post_id, 10) || 0;

	var STORAGE_KEY = 'neo-pulse_overseer_session';
	var VISIT_UID_PREFIX = 'neo-pulse_overseer_visit:';
	var trackInteractions = cfg.track_interactions !== false;
	var trackOutboundOnly = cfg.track_outbound_only === true;
	var HEARTBEAT_INTERVAL_MS = 30000;

	var pageStartMs = Date.now();
	var activeStartMs = Date.now();
	var activeMs = 0;
	var maxScrollPct = 0;
	var currentPageVisitUid = '';
	var exitSent = false;
	var pendingEvents = [];
	var flushTimer = null;
	var heartbeatTimer = null;

	function readSessionId() {
		try {
			return localStorage.getItem(STORAGE_KEY) || '';
		} catch (e) {
			return '';
		}
	}

	function writeSessionId(id) {
		if (!id) {
			return;
		}
		try {
			localStorage.setItem(STORAGE_KEY, id);
		} catch (e) {
			/* ignore */
		}
	}

	function newSessionId() {
		return 'ovsess_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10);
	}

	function pageVisitStorageKey() {
		return VISIT_UID_PREFIX + window.location.pathname;
	}

	function writePageVisitUid(id) {
		if (!id) {
			return;
		}
		currentPageVisitUid = id;
		try {
			sessionStorage.setItem(pageVisitStorageKey(), id);
		} catch (e) {
			/* ignore */
		}
	}

	function readPageVisitUid() {
		if (currentPageVisitUid) {
			return currentPageVisitUid;
		}
		try {
			return sessionStorage.getItem(pageVisitStorageKey()) || '';
		} catch (e2) {
			return '';
		}
	}

	function clearPageVisitUid() {
		currentPageVisitUid = '';
		try {
			sessionStorage.removeItem(pageVisitStorageKey());
		} catch (e) {
			/* ignore */
		}
	}

	function parseUtm() {
		var params = new URLSearchParams(window.location.search);
		var utm = {};
		['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'].forEach(function (key) {
			var val = params.get(key);
			if (val) {
				utm[key.replace('utm_', '')] = val;
			}
		});
		return Object.keys(utm).length ? utm : null;
	}

	function baseContext() {
		var sessionId = readSessionId();
		if (!sessionId) {
			sessionId = newSessionId();
		}
		var payload = {
			session_id: sessionId,
			page_url: window.location.href,
			page_title: document.title || '',
			referrer: document.referrer || '',
			screen_width: window.screen && window.screen.width ? window.screen.width : 0,
			screen_height: window.screen && window.screen.height ? window.screen.height : 0,
			language: navigator.language || '',
			timezone: '',
			platform: navigator.platform || ''
		};
		if (pagePostId > 0) {
			payload.post_id = pagePostId;
		}
		try {
			payload.timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
		} catch (e2) {
			payload.timezone = '';
		}
		var utm = parseUtm();
		if (utm) {
			payload.utm = utm;
		}
		return payload;
	}

	function getPageLoadMs() {
		try {
			var entries = performance.getEntriesByType('navigation');
			if (entries && entries.length && entries[0].loadEventEnd > 0) {
				return Math.max(0, Math.round(entries[0].loadEventEnd - entries[0].startTime));
			}
		} catch (eNav) {
			/* ignore */
		}
		return 0;
	}

	function tickActiveTime() {
		if (document.visibilityState === 'visible') {
			activeMs += Math.max(0, Date.now() - activeStartMs);
		}
		activeStartMs = Date.now();
	}

	function getActiveDurationMs() {
		tickActiveTime();
		return activeMs;
	}

	function getWallDurationMs() {
		return Math.max(0, Date.now() - pageStartMs);
	}

	function updateScrollDepth() {
		var doc = document.documentElement;
		var body = document.body;
		var scrollTop = window.pageYOffset || doc.scrollTop || (body ? body.scrollTop : 0) || 0;
		var scrollHeight = Math.max(
			body ? body.scrollHeight : 0,
			doc.scrollHeight,
			body ? body.offsetHeight : 0,
			doc.offsetHeight
		);
		var clientHeight = doc.clientHeight || window.innerHeight || 0;
		var denom = scrollHeight - clientHeight;
		var pct = denom > 0 ? Math.round((scrollTop / denom) * 100) : 100;
		if (pct > maxScrollPct) {
			maxScrollPct = Math.min(100, pct);
		}
	}

	function endpointWithNonce() {
		var url = cfg.endpoint;
		if (!nonce) {
			return url;
		}
		var sep = url.indexOf('?') >= 0 ? '&' : '?';
		return url + sep + '_wpnonce=' + encodeURIComponent(nonce);
	}

	function onCollectResponse(data, fallbackSessionId) {
		if (data && data.ok) {
			if (data.session_id) {
				writeSessionId(data.session_id);
			}
			if (data.visit_uid) {
				writePageVisitUid(data.visit_uid);
			}
		} else if (fallbackSessionId) {
			writeSessionId(fallbackSessionId);
		}
	}

	function sendPayload(payload, isExit) {
		var body = JSON.stringify(payload);
		var headers = {
			'Content-Type': 'application/json'
		};
		if (nonce) {
			headers['X-WP-Nonce'] = nonce;
		}
		var fallbackSession = payload.session_id || (payload.events && payload.events[0] && payload.events[0].session_id) || '';

		if (isExit && navigator.sendBeacon) {
			try {
				var blob = new Blob([body], { type: 'application/json' });
				if (navigator.sendBeacon(endpointWithNonce(), blob)) {
					onCollectResponse({ ok: true, session_id: fallbackSession }, fallbackSession);
					return Promise.resolve();
				}
			} catch (eBeacon) {
				/* fall through */
			}
		}

		return fetch(endpointWithNonce(), {
			method: 'POST',
			headers: headers,
			body: body,
			credentials: 'same-origin',
			keepalive: true
		})
			.then(function (res) {
				if (!res.ok) {
					throw new Error('collect_failed');
				}
				return res.json();
			})
			.then(function (data) {
				onCollectResponse(data, fallbackSession);
			})
			.catch(function () {
				if (navigator.sendBeacon) {
					try {
						var blob2 = new Blob([body], { type: 'application/json' });
						if (navigator.sendBeacon(endpointWithNonce(), blob2)) {
							onCollectResponse({ ok: true, session_id: fallbackSession }, fallbackSession);
						}
					} catch (e3) {
						/* silent */
					}
				}
			});
	}

	function buildEngagementEvent(eventType) {
		updateScrollDepth();
		tickActiveTime();
		var ctx = baseContext();
		return {
			event_type: eventType,
			session_id: ctx.session_id,
			page_url: ctx.page_url,
			page_title: ctx.page_title,
			duration_ms: getWallDurationMs(),
			active_duration_ms: getActiveDurationMs(),
			scroll_depth_pct: maxScrollPct,
			parent_visit_uid: readPageVisitUid(),
			post_id: pagePostId
		};
	}

	function stopHeartbeat() {
		if (heartbeatTimer) {
			clearInterval(heartbeatTimer);
			heartbeatTimer = null;
		}
	}

	function startHeartbeat() {
		stopHeartbeat();
		heartbeatTimer = setInterval(function () {
			if (exitSent || document.visibilityState !== 'visible' || !readPageVisitUid()) {
				return;
			}
			updateScrollDepth();
			sendPayload({ events: [buildEngagementEvent('page_heartbeat')] }, true);
		}, HEARTBEAT_INTERVAL_MS);
	}

	function resetPageTimers() {
		pageStartMs = Date.now();
		activeStartMs = Date.now();
		activeMs = 0;
		maxScrollPct = 0;
	}

	function sendPageview() {
		exitSent = false;
		resetPageTimers();
		clearPageVisitUid();
		stopHeartbeat();

		var payload = baseContext();
		payload.event_type = 'pageview';
		payload.page_load_ms = getPageLoadMs();
		return sendPayload(payload, false).then(function () {
			startHeartbeat();
		});
	}

	function sendPageExit() {
		if (exitSent) {
			return;
		}
		exitSent = true;
		stopHeartbeat();
		sendPayload({ events: [buildEngagementEvent('page_exit')] }, true);
	}

	function queueInteraction(eventType, el, href) {
		if (!trackInteractions) {
			return;
		}
		var ctx = baseContext();
		var text = '';
		if (el) {
			text = (el.getAttribute('aria-label') || el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim();
			if (text.length > 120) {
				text = text.slice(0, 120);
			}
		}
		pendingEvents.push({
			event_type: eventType,
			session_id: ctx.session_id,
			page_url: ctx.page_url,
			page_title: ctx.page_title,
			parent_visit_uid: readPageVisitUid(),
			post_id: pagePostId,
			element_tag: el ? el.tagName.toLowerCase() : '',
			element_text: text,
			element_href: href || (el && el.href ? el.href : '')
		});
		scheduleFlush();
	}

	function scheduleFlush() {
		if (flushTimer) {
			return;
		}
		flushTimer = setTimeout(function () {
			flushTimer = null;
			flushPending();
		}, 2000);
	}

	function flushPending() {
		if (!pendingEvents.length) {
			return;
		}
		var batch = pendingEvents.splice(0, 10);
		sendPayload({ events: batch }, false);
		if (pendingEvents.length) {
			scheduleFlush();
		}
	}

	function isOutboundHref(href) {
		if (!href) {
			return false;
		}
		try {
			var link = document.createElement('a');
			link.href = href;
			return link.hostname !== '' && link.hostname !== window.location.hostname;
		} catch (e) {
			return false;
		}
	}

	function isInteractiveTarget(el) {
		if (!el || !el.tagName) {
			return null;
		}
		var tag = el.tagName.toLowerCase();
		if (tag === 'a' || tag === 'button') {
			return el;
		}
		if (tag === 'input') {
			var type = (el.getAttribute('type') || '').toLowerCase();
			if (type === 'submit' || type === 'button') {
				return el;
			}
		}
		if (el.getAttribute && el.getAttribute('role') === 'button') {
			return el;
		}
		return null;
	}

	function nearestInteractive(el) {
		var node = el;
		while (node && node !== document.body) {
			var hit = isInteractiveTarget(node);
			if (hit) {
				return hit;
			}
			node = node.parentElement;
		}
		return null;
	}

	function bindInteractionListeners() {
		if (!trackInteractions) {
			return;
		}

		document.addEventListener('click', function (ev) {
			var target = nearestInteractive(ev.target);
			if (!target) {
				return;
			}
			var href = target.href || target.getAttribute('href') || '';
			var outbound = isOutboundHref(href);
			if (trackOutboundOnly && !outbound && target.tagName.toLowerCase() !== 'button') {
				return;
			}
			queueInteraction(outbound ? 'outbound_click' : 'click', target, href);
		}, true);

		document.addEventListener('submit', function (ev) {
			var form = ev.target;
			if (!form || !form.tagName || form.tagName.toLowerCase() !== 'form') {
				return;
			}
			queueInteraction('form_submit', form, form.action || '');
			flushPending();
		}, true);
	}

	window.addEventListener('scroll', function () {
		updateScrollDepth();
	}, { passive: true });

	window.addEventListener('pagehide', sendPageExit);
	document.addEventListener('visibilitychange', function () {
		if (document.visibilityState === 'hidden') {
			sendPageExit();
			flushPending();
		} else {
			activeStartMs = Date.now();
		}
	});

	window.addEventListener('pageshow', function (ev) {
		if (ev && ev.persisted) {
			sendPageview();
		}
	});

	sendPageview();
	bindInteractionListeners();
})();
