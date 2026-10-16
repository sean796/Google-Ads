(function () {
	'use strict';

	function el(tag, className, text) {
		var node = document.createElement(tag);
		if (className) node.className = className;
		if (text !== undefined && text !== null) node.textContent = text;
		return node;
	}

	function truncate(text, max) {
		var s = String(text || '');
		if (s.length <= max) return s;
		return s.slice(0, max - 1) + '…';
	}

	function wandIconSvg(size) {
		var ns = 'http://www.w3.org/2000/svg';
		var dim = String(size || 16);
		var svg = document.createElementNS(ns, 'svg');
		svg.setAttribute('viewBox', '0 0 24 24');
		svg.setAttribute('width', dim);
		svg.setAttribute('height', dim);
		svg.setAttribute('class', 'neo-pulse-wp-ai-wand-icon');
		svg.setAttribute('aria-hidden', 'true');
		svg.setAttribute('fill', 'none');
		svg.setAttribute('stroke', 'currentColor');
		svg.setAttribute('stroke-width', '2');
		svg.setAttribute('stroke-linecap', 'round');
		svg.setAttribute('stroke-linejoin', 'round');

		[
			'M15 4V2',
			'M15 16v-2',
			'M8 9h2',
			'M20 9h2',
			'M17.8 11.8 19 13',
			'M15 9h.01',
			'M17.8 6.2 19 5',
			'm3 21 9-9',
			'M12.2 6.2 11 5',
		].forEach(function (d) {
			var path = document.createElementNS(ns, 'path');
			path.setAttribute('d', d);
			svg.appendChild(path);
		});
		return svg;
	}

	function sparkIconSvg(size) {
		return wandIconSvg(size);
	}

	function spinnerSvg() {
		var ns = 'http://www.w3.org/2000/svg';
		var svg = document.createElementNS(ns, 'svg');
		svg.setAttribute('viewBox', '0 0 24 24');
		svg.setAttribute('width', '14');
		svg.setAttribute('height', '14');
		svg.setAttribute('class', 'neo-pulse-wp-ai-spinner');
		svg.setAttribute('aria-hidden', 'true');
		var circle = document.createElementNS(ns, 'circle');
		circle.setAttribute('cx', '12');
		circle.setAttribute('cy', '12');
		circle.setAttribute('r', '10');
		circle.setAttribute('fill', 'none');
		circle.setAttribute('stroke', 'currentColor');
		circle.setAttribute('stroke-width', '2');
		circle.setAttribute('stroke-dasharray', '31.4 31.4');
		svg.appendChild(circle);
		return svg;
	}

	function normalizeLimit(limit) {
		if (limit && typeof limit === 'object') {
			return {
				min: limit.min || 0,
				max: limit.max || 0,
			};
		}
		if (typeof limit === 'number') {
			return { min: 0, max: limit };
		}
		return { min: 0, max: 0 };
	}

	function counterClass(count, limit) {
		var spec = normalizeLimit(limit);
		if (!spec.max) return '';
		if (count > spec.max) return ' neo-pulse-wp-ai-counter--over';
		if (spec.min && count >= spec.min && count <= spec.max) return ' neo-pulse-wp-ai-counter--ok';
		if (spec.min && count < spec.min) return ' neo-pulse-wp-ai-counter--warn';
		if (!spec.min && count >= spec.max * 0.9) return ' neo-pulse-wp-ai-counter--warn';
		return ' neo-pulse-wp-ai-counter--ok';
	}

	function progressClass(count, limit) {
		var spec = normalizeLimit(limit);
		if (!spec.max) return '';
		if (count > spec.max) return ' neo-pulse-wp-ai-field-progress__fill--over';
		if (spec.min && count >= spec.min && count <= spec.max) return ' neo-pulse-wp-ai-field-progress__fill--ok';
		if (spec.min && count < spec.min) return ' neo-pulse-wp-ai-field-progress__fill--warn';
		if (!spec.min && count >= spec.max * 0.9) return ' neo-pulse-wp-ai-field-progress__fill--warn';
		return ' neo-pulse-wp-ai-field-progress__fill--ok';
	}

	function progressPercent(count, limit) {
		var spec = normalizeLimit(limit);
		if (!spec.max) return 0;
		if (spec.min) {
			if (count <= spec.min) {
				return Math.min(85, Math.round((count / spec.min) * 85));
			}
			if (count <= spec.max) {
				return 85 + Math.round(((count - spec.min) / (spec.max - spec.min)) * 15);
			}
			return 100;
		}
		return Math.min(100, Math.round((count / spec.max) * 100));
	}

	function createProgressBar(count, limit, wide) {
		var pct = progressPercent(count, limit);
		var wrap = el('div', 'neo-pulse-wp-ai-field-progress' + (wide ? ' neo-pulse-wp-ai-field-progress--wide' : ''));
		var fill = el('div', 'neo-pulse-wp-ai-field-progress__fill' + progressClass(count, limit));
		fill.style.width = pct + '%';
		wrap.appendChild(fill);
		return wrap;
	}

	function createFieldMeter(count, limitSpec, counterLabel) {
		var meter = el('div', 'neo-pulse-wp-ai-field-meter');
		meter.appendChild(el('span', 'neo-pulse-wp-ai-counter' + counterClass(count, limitSpec), counterLabel));
		meter.appendChild(createProgressBar(count, limitSpec, true));
		return meter;
	}

	function createSparkButton(options) {
		options = options || {};
		var className = options.className || 'neo-pulse-wp-ai-wand-btn neo-pulse-wp-ai-spark-btn';
		if (options.bare) {
			className += ' neo-pulse-wp-ai-wand-btn--compact neo-pulse-wp-ai-spark-btn--bare';
		}
		var btn = el('button', className, '');
		btn.type = 'button';
		btn.setAttribute('title', options.label);
		btn.setAttribute('aria-label', options.label);
		if (options.loading) {
			btn.disabled = true;
			btn.appendChild(spinnerSvg());
		} else {
			btn.appendChild(wandIconSvg(options.size || 16));
		}
		if (typeof options.onClick === 'function') {
			btn.addEventListener('click', options.onClick);
		}
		return btn;
	}

	window.NeoPulseAiDom = {
		el: el,
		truncate: truncate,
		wandIconSvg: wandIconSvg,
		sparkIconSvg: sparkIconSvg,
		spinnerSvg: spinnerSvg,
		counterClass: counterClass,
		progressClass: progressClass,
		progressPercent: progressPercent,
		createProgressBar: createProgressBar,
		createFieldMeter: createFieldMeter,
		createSparkButton: createSparkButton,
		createWandButton: createSparkButton,
	};

	window.neoPulseWpAiSparkIcon = wandIconSvg;
})();
