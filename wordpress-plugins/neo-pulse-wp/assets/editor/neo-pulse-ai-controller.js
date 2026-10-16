(function () {
	'use strict';

	var S = window.NeoPulseAiShared;
	var D = window.NeoPulseAiDom;
	var Snip = window.NeoPulseAiSnippet;

	function NeoPulseAiController(root, options) {
		this.root = root;
		this.postId = (options && options.postId) || S.cfg().postId || 0;
		this.layout = (options && options.layout) || 'default';
		this.compact = !!(options && options.compact);
		this.status = null;
		this.activeField = null;
		this.previewValue = '';
		this.loading = false;
		this.loadingField = null;
		this.generatingAll = false;
		this.savingMeta = false;
		this.toastMessage = '';
		this.draft = { seoTitle: '', metaDescription: '', focusKeyword: '', seoResearch: '', faq: '', pageUrl: '' };
		this.saved = Object.assign({}, this.draft);
		this.launcherEl = null;
		this.metaEditorEl = null;
		this.metaEditorOverlay = null;
		this.metaEditorOpen = false;
		this._editorUnsubscribe = null;
		this._escapeHandler = null;
		this.gscLoading = false;
		this.gscSuggestions = undefined;
		this.seoResearchLoading = false;
		this.faqWandRunning = false;
	}

	NeoPulseAiController.prototype.isSidebarLayout = function () {
		return this.layout === 'sidebar';
	};

	NeoPulseAiController.prototype.mount = function () {
		var self = this;
		this.root.innerHTML = '';
		this.root.classList.add('neo-pulse-wp-ai-root');
		if (this.isSidebarLayout()) this.root.classList.add('neo-pulse-wp-ai-root--sidebar');
		this.renderLoading();
		if (!this._metaSavedHandler) {
			this._metaSavedHandler = function (evt) {
				var detail = (evt && evt.detail) || {};
				if (detail.postId && detail.postId !== self.postId) return;
				if (!detail.values) return;
				S.syncDraftFromValues(self, detail.values);
				if (window.NeoPulseAiSnippet) {
					if (detail.values.seoTitle) {
						window.NeoPulseAiSnippet.updateMetaInput(self, 'seoTitle');
						window.NeoPulseAiSnippet.updateAllSnippets(self);
					}
					if (detail.values.metaDescription) {
						window.NeoPulseAiSnippet.updateMetaInput(self, 'metaDescription');
						S.syncEditorMeta('excerpt', detail.values.metaDescription);
						S.syncDomField('excerpt', detail.values.metaDescription);
					}
				}
				self.refreshUI();
			};
			window.addEventListener('neo-pulse:meta-saved', this._metaSavedHandler);
		}
		return this.fetchStatus().then(function () {
			self.initDraftFromStatus();
			self.bindEditorSubscribe();
			self.bindBodyHarnessSubscribe();
			self.render();
			if (window.NeoPulseBodyHarness && self.status && self.status.bodyHarnessAvailable) {
				window.NeoPulseBodyHarness.loadSession(self.postId, true).then(function (resp) {
					if (!resp.hasSession) {
						return window.NeoPulseBodyHarness.plan(self.postId, self).catch(function () {});
					}
				}).catch(function () {});
			}
		}).catch(function (err) {
			self.renderError(err.message || 'Could not load NEO Pulse AI.');
		});
	};

	NeoPulseAiController.prototype.destroy = function () {
		if (window.NeoPulseAiModal) window.NeoPulseAiModal.close(this, true);
		if (this._metaSavedHandler) {
			window.removeEventListener('neo-pulse:meta-saved', this._metaSavedHandler);
			this._metaSavedHandler = null;
		}
		if (this._editorUnsubscribe) {
			this._editorUnsubscribe();
			this._editorUnsubscribe = null;
		}
		if (this._bodyHarnessUnsub) {
			this._bodyHarnessUnsub();
			this._bodyHarnessUnsub = null;
		}
	};

	NeoPulseAiController.prototype.bindBodyHarnessSubscribe = function () {
		var self = this;
		if (!this.isSidebarLayout() || !window.NeoPulseBodyHarnessStore) return;
		if (this._bodyHarnessUnsub) {
			this._bodyHarnessUnsub();
		}
		this._bodyHarnessUnsub = window.NeoPulseBodyHarnessStore.subscribe(function () {
			if (self.isSidebarLayout()) {
				self.render();
			}
		});
	};

	NeoPulseAiController.prototype.bindEditorSubscribe = function () {
		var self = this;
		if (!this.isSidebarLayout() || !window.wp || !wp.data || !wp.data.subscribe) return;
		var prevSlug = Snip.getPostSlugForPreview();
		var prevTitle = Snip.getPostTitleForPreview();
		this._editorUnsubscribe = wp.data.subscribe(function () {
			var slug = Snip.getPostSlugForPreview();
			var title = Snip.getPostTitleForPreview();
			if (slug === prevSlug && title === prevTitle) return;
			prevSlug = slug;
			prevTitle = title;
			Snip.updateAllSnippets(self);
			if (!self.draft.seoTitle && title) {
				self.draft.seoTitle = title;
				Snip.updateMetaInput(self, 'seoTitle');
				Snip.updateAllSnippets(self);
			}
		});
	};

	NeoPulseAiController.prototype.initDraftFromStatus = function () {
		var values = (this.status && this.status.values) || {};
		this.draft = {
			seoTitle: values.seoTitle || '',
			metaDescription: values.metaDescription || '',
			focusKeyword: values.focusKeyword || '',
			seoResearch: values.seoResearch || '',
			faq: values.faq || '',
			pageUrl: values.pageUrl || '',
		};
		this.saved = Object.assign({}, this.draft);
	};

	NeoPulseAiController.prototype.fetchStatus = function () {
		var self = this;
		return S.api('/neo-pulse/v1/ai/status?post_id=' + encodeURIComponent(String(this.postId)), { method: 'GET' }).then(function (body) {
			self.status = body;
		});
	};

	NeoPulseAiController.prototype.renderLoading = function () {
		this.root.appendChild(D.el('p', this.isSidebarLayout() ? 'neo-pulse-wp-ai__loading' : 'neo-pulse-wp-ai__muted', S.str('loading', 'Loading…')));
	};

	NeoPulseAiController.prototype.renderError = function (message) {
		this.root.innerHTML = '';
		this.root.classList.add('neo-pulse-wp-ai-root');
		if (this.isSidebarLayout()) this.root.classList.add('neo-pulse-wp-ai-root--sidebar');
		this.root.appendChild(D.el('p', 'neo-pulse-wp-ai__error', message));
	};

	NeoPulseAiController.prototype.refreshUI = function (opts) {
		this.render();
		if (this.metaEditorOpen && window.NeoPulseAiModal) {
			window.NeoPulseAiModal.render(this, Object.assign({ preserveScroll: true, skipFocus: true }, opts || {}));
		}
	};

	NeoPulseAiController.prototype.render = function () {
		this.root.innerHTML = '';
		if (this.isSidebarLayout()) this.root.classList.add('neo-pulse-wp-ai-root--sidebar');
		var status = this.status || {};

		if (!status.canPreview && status.reasons && status.reasons.length) {
			var notice = D.el('div', 'neo-pulse-wp-ai__notice' + (status.needsUpgrade ? ' neo-pulse-wp-ai__notice--upgrade' : ''));
			if (status.needsUpgrade) {
				notice.appendChild(D.el('span', 'npwp-ai-chip', status.upgradeLabel || 'Pro + AI'));
			}
			status.reasons.forEach(function (reason) { notice.appendChild(D.el('p', '', reason)); });
			this.root.appendChild(notice);
			return;
		}

		if (this.isSidebarLayout()) {
			window.NeoPulseAiSidebar.render(this, this.root);
			return;
		}

		if (status.cap !== null && status.cap !== undefined) {
			this.root.appendChild(D.el('p', 'neo-pulse-wp-ai__cap', S.str('capLabel', 'Optimizations') + ': ' + String(status.used || 0) + '/' + String(status.cap)));
		}
		if (this.activeField) {
			this.renderPreviewPanel();
			return;
		}
		var list = D.el('div', 'neo-pulse-wp-ai__wand-list');
		(status.fields || []).forEach(function (field) {
			list.appendChild(this.createWandButton(field, status.fieldLabels && status.fieldLabels[field] ? status.fieldLabels[field] : field));
		}, this);
		this.root.appendChild(list);
	};

	NeoPulseAiController.prototype.openMetaEditorModal = function () {
		if (window.NeoPulseAiModal) window.NeoPulseAiModal.open(this);
	};

	NeoPulseAiController.prototype.createWandButton = function (field, label) {
		var self = this;
		var btn = D.el('button', 'neo-pulse-wp-ai__wand button button-secondary', label);
		btn.type = 'button';
		btn.appendChild(D.sparkIconSvg());
		btn.addEventListener('click', function () { self.runPreview(field); });
		return btn;
	};

	NeoPulseAiController.prototype.runPreview = function (field) {
		var self = this;
		this.activeField = field;
		this.previewValue = '';
		this.loading = true;
		this.renderPreviewPanel();
		S.api('/neo-pulse/v1/ai/preview', {
			method: 'POST',
			body: JSON.stringify({ post_id: self.postId, field: field }),
		}).then(function (body) {
			self.previewValue = body.value || '';
			self.loading = false;
			self.renderPreviewPanel();
		}).catch(function (err) {
			self.loading = false;
			self.activeField = null;
			self.renderError(err.message || 'Preview failed.');
		});
	};

	NeoPulseAiController.prototype.renderPreviewPanel = function () {
		this.root.innerHTML = '';
		var status = this.status || {};
		var labels = status.fieldLabels || {};
		this.root.appendChild(D.el('h4', 'neo-pulse-wp-ai__preview-title', labels[this.activeField] || this.activeField));
		if (this.loading) {
			this.root.appendChild(D.el('p', 'neo-pulse-wp-ai__muted', S.str('loading', 'Generating…')));
			return;
		}
		var textarea = document.createElement('textarea');
		textarea.className = 'neo-pulse-wp-ai__preview-value widefat';
		textarea.rows = this.activeField === 'faq' || this.activeField === 'seo_research' ? 10 : 4;
		textarea.value = this.previewValue;
		textarea.addEventListener('input', function () { this.previewValue = textarea.value; }.bind(this));
		this.root.appendChild(textarea);
		var actions = D.el('div', 'neo-pulse-wp-ai__actions');
		var back = D.el('button', 'button', S.str('discard', 'Discard'));
		back.type = 'button';
		back.addEventListener('click', function () { this.activeField = null; this.previewValue = ''; this.render(); }.bind(this));
		actions.appendChild(back);
		if (status.canApply) {
			var applyBtn = D.el('button', 'button button-primary', S.str('apply', 'Apply'));
			applyBtn.type = 'button';
			applyBtn.addEventListener('click', function () { this.runApply(textarea.value); }.bind(this));
			actions.appendChild(applyBtn);
		} else {
			actions.appendChild(D.el('p', 'neo-pulse-wp-ai__muted', S.str('capReached', 'Apply disabled (cap reached).')));
		}
		this.root.appendChild(actions);
	};

	NeoPulseAiController.prototype.runApply = function (value) {
		var self = this;
		this.loading = true;
		this.renderPreviewPanel();
		S.api('/neo-pulse/v1/ai/apply', {
			method: 'POST',
			body: JSON.stringify({ post_id: self.postId, field: self.activeField, value: value }),
		}).then(function (body) {
			self.loading = false;
			self.activeField = null;
			self.previewValue = '';
			if (body.optimization && self.status.capEnforced !== false) {
				self.status.used = body.optimization.used;
				self.status.cap = body.optimization.cap;
				self.status.remaining = body.optimization.remaining;
				self.status.canApply = (body.optimization.remaining || 0) > 0;
			}
			S.syncDraftFromValues(self, body.values);
			self.render();
			S.syncDomField(body.field, value);
		}).catch(function (err) {
			self.loading = false;
			self.renderError(err.message || 'Apply failed.');
		});
	};

	NeoPulseAiController.prototype.openFieldPreview = function (field) {
		if (this.isSidebarLayout()) {
			this.openMetaEditorModal();
			return;
		}
		if (this.status && !this.status.canPreview) {
			this.render();
			return;
		}
		this.runPreview(field);
	};

	window.NeoPulseAiController = NeoPulseAiController;
})();
