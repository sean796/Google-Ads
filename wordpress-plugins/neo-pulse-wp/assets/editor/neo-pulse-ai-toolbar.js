(function () {
	'use strict';

	var SIDEBAR_ID = 'neo-pulse-wp-ai-sidebar/neo-pulse-wp-ai-sidebar';
	var WRAP_CLASS = 'neo-pulse-wp-ai-toolbar-wrap';

	function cfg() {
		return window.neoPulseWpAi || {};
	}

	function str(key, fallback) {
		var strings = cfg().strings || {};
		return strings[key] || fallback;
	}

	function getSidebarStore() {
		if (!window.wp || !wp.data) {
			return null;
		}
		var editorSelect = wp.data.select('core/editor');
		var editorDispatch = wp.data.dispatch('core/editor');
		if (editorSelect && editorDispatch && editorDispatch.openGeneralSidebar) {
			return { select: editorSelect, dispatch: editorDispatch };
		}
		var editPostSelect = wp.data.select('core/edit-post');
		var editPostDispatch = wp.data.dispatch('core/edit-post');
		if (editPostSelect && editPostDispatch && editPostDispatch.openGeneralSidebar) {
			return { select: editPostSelect, dispatch: editPostDispatch };
		}
		return null;
	}

	function isSidebarOpen() {
		var store = getSidebarStore();
		if (!store || !store.select.getActiveGeneralSidebarName) {
			return false;
		}
		return store.select.getActiveGeneralSidebarName() === SIDEBAR_ID;
	}

	function openNeoPulse() {
		var store = getSidebarStore();
		if (store) {
			if (isSidebarOpen() && store.dispatch.closeGeneralSidebar) {
				store.dispatch.closeGeneralSidebar();
			} else {
				store.dispatch.openGeneralSidebar(SIDEBAR_ID);
			}
			syncButtonState();
			return;
		}

		if (window.neoPulseWpAiController && window.NeoPulseAiModal) {
			window.NeoPulseAiModal.open(window.neoPulseWpAiController);
			return;
		}

		var meta = document.getElementById('neo_pulse_wp_ai');
		if (meta) {
			if (meta.classList.contains('closed')) {
				var toggle = meta.querySelector('.handlediv, .postbox-header button');
				if (toggle) {
					toggle.click();
				}
			}
			meta.scrollIntoView({ behavior: 'smooth', block: 'start' });
		}
	}

	function syncButtonState() {
		var btn = document.querySelector('.' + WRAP_CLASS + ' .neo-pulse-wp-ai-toolbar-btn');
		if (!btn) {
			return;
		}
		var open = isSidebarOpen();
		btn.setAttribute('aria-expanded', open ? 'true' : 'false');
		btn.classList.toggle('is-pressed', open);
	}

	function createButton() {
		var btn = document.createElement('button');
		btn.type = 'button';
		btn.className = 'neo-pulse-wp-ai-toolbar-btn components-button';
		btn.title = str('title', 'NEO Pulse AI');
		btn.setAttribute('aria-label', str('title', 'NEO Pulse AI'));
		btn.innerHTML = '<svg class="neo-pulse-wp-brand-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z"/><path d="M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z"/><path d="M15 13a4.5 4.5 0 0 1-3-4 4.5 4.5 0 0 1-3 4"/><path d="M17.599 6.5a3 3 0 0 0 .399-1.375"/><path d="M6.003 5.125A3 3 0 0 0 6.401 6.5"/><path d="M3.477 10.896a4 4 0 0 1 .585-.396"/><path d="M19.938 10.5a4 4 0 0 1 .585.396"/><path d="M6 18a4 4 0 0 1-1.967-.516"/><path d="M19.967 17.484A4 4 0 0 1 18 18"/></svg><span class="neo-pulse-wp-ai-toolbar-btn__label">' + str('toolbarLabel', 'NEO Pulse') + '</span>';
		btn.addEventListener('click', function (event) {
			event.preventDefault();
			event.stopPropagation();
			openNeoPulse();
		});
		syncButtonState();
		return btn;
	}

	function findInsertParent() {
		var selectors = [
			'.editor-header__settings',
			'.edit-post-header__settings',
			'.edit-post-header-toolbar',
			'.editor-header__toolbar',
		];
		var i;
		for (i = 0; i < selectors.length; i++) {
			var node = document.querySelector(selectors[i]);
			if (node) {
				return node;
			}
		}
		return null;
	}

	function findInsertBefore(parent) {
		if (!parent) {
			return null;
		}
		return parent.querySelector('.editor-post-save-panel')
			|| parent.querySelector('.edit-post-header__settings .components-button.is-primary')
			|| parent.querySelector('.editor-post-publish-button__button')
			|| null;
	}

	function mountToolbar() {
		if (document.querySelector('.' + WRAP_CLASS)) {
			return true;
		}

		var parent = findInsertParent();
		if (!parent) {
			return false;
		}

		var wrap = document.createElement('span');
		wrap.className = WRAP_CLASS;
		wrap.appendChild(createButton());

		var before = findInsertBefore(parent);
		if (before && before.parentNode === parent) {
			parent.insertBefore(wrap, before);
		} else {
			parent.appendChild(wrap);
		}

		return true;
	}

	function startMountLoop() {
		var attempts = 0;
		var timer = window.setInterval(function () {
			if (mountToolbar() || attempts++ > 80) {
				window.clearInterval(timer);
			}
		}, 200);

		if (window.wp && wp.data && wp.data.subscribe) {
			wp.data.subscribe(function () {
				mountToolbar();
				syncButtonState();
			});
		}
	}

	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', startMountLoop);
	} else {
		startMountLoop();
	}
})();
