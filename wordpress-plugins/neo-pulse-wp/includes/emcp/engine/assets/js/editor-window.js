/**
 * EMCP Tools — shared floating-window UI for the in-editor AI panel.
 *
 * Editor-agnostic: FAB open/close, title-bar drag, minimize / maximize / close,
 * corner resize, and geometry persistence (localStorage). Used by both the
 * Elementor and Gutenberg editor bridges. On open it calls the optional
 * window.emcpAiChat.onWindowOpen() hook so a bridge can refresh live context.
 */
( function () {
	'use strict';

	var cfg = window.emcpAiChat;
	if ( ! cfg || ! cfg.embed ) { return; }

	function boot() {
		var win  = document.getElementById( 'emcp-ai-window' );
		var bar  = document.getElementById( 'emcp-ai-win-bar' );
		var fab  = document.getElementById( 'emcp-ai-fab' );
		var grip = document.getElementById( 'emcp-ai-win-resize' );
		if ( ! win || ! bar || ! fab || ! grip ) { return; }

		var i18n   = cfg.i18n || {};
		var STORE  = 'emcpAiWindowState';
		var geom   = loadState() || { x: null, y: null, w: 420, h: 620, min: false, max: false };
		var minBtn = win.querySelector( '.emcp-ai-win-btn[data-act="min"]' );

		function onOpen() { try { if ( 'function' === typeof cfg.onWindowOpen ) { cfg.onWindowOpen(); } } catch ( e ) {} }

		// ── window: open / close / controls ────────────────────────────────────
		function openWin() { win.hidden = false; fab.hidden = true; applyGeom(); onOpen(); }
		function closeWin() { win.hidden = true; fab.hidden = false; }
		fab.addEventListener( 'click', openWin );
		bar.addEventListener( 'click', function ( e ) {
			var b = e.target.closest( '.emcp-ai-win-btn' ); if ( ! b ) { return; }
			var act = b.getAttribute( 'data-act' );
			if ( 'min' === act ) { geom.min = ! geom.min; geom.max = false; }
			else if ( 'max' === act ) { geom.max = ! geom.max; geom.min = false; }
			else if ( 'close' === act ) { closeWin(); return; }
			applyGeom(); saveState();
		} );

		// ── geometry ───────────────────────────────────────────────────────────
		function clampPos( x, y, w ) {
			var vw = window.innerWidth, vh = window.innerHeight;
			if ( null === x || null === y ) { x = vw - ( w || 420 ) - 24; y = Math.max( 16, vh - ( geom.h || 620 ) - 80 ); }
			x = Math.min( Math.max( x, 60 - ( w || 420 ) ), vw - 60 );
			y = Math.min( Math.max( y, 0 ), vh - 44 );
			return { x: x, y: y };
		}
		function applyGeom() {
			win.classList.toggle( 'is-max', !! geom.max );
			win.classList.toggle( 'is-min', !! geom.min );
			if ( minBtn ) {
				minBtn.textContent = geom.min ? '▢' : '–';
				var lbl = geom.min ? ( i18n.restore || 'Restore' ) : ( i18n.minimize || 'Minimize' );
				minBtn.title = lbl; minBtn.setAttribute( 'aria-label', lbl );
			}
			if ( geom.max ) { win.style.left = ''; win.style.top = ''; win.style.width = ''; win.style.height = ''; return; }
			win.style.width = geom.w + 'px';
			win.style.height = geom.min ? '' : ( geom.h + 'px' );
			var p = clampPos( geom.x, geom.y, geom.w );
			win.style.left = p.x + 'px'; win.style.top = p.y + 'px';
		}
		function loadState() { try { return JSON.parse( localStorage.getItem( STORE ) ); } catch ( e ) { return null; } }
		function saveState() { try { localStorage.setItem( STORE, JSON.stringify( geom ) ); } catch ( e ) {} }

		// ── drag (title bar) ───────────────────────────────────────────────────
		bar.addEventListener( 'pointerdown', function ( e ) {
			if ( e.target.closest( '.emcp-ai-win-btn' ) || geom.max ) { return; }
			var sx = e.clientX, sy = e.clientY, ox = win.offsetLeft, oy = win.offsetTop;
			bar.setPointerCapture( e.pointerId );
			function mv( ev ) { var p = clampPos( ox + ( ev.clientX - sx ), oy + ( ev.clientY - sy ), win.offsetWidth ); win.style.left = p.x + 'px'; win.style.top = p.y + 'px'; }
			function up() { bar.releasePointerCapture( e.pointerId ); bar.removeEventListener( 'pointermove', mv ); bar.removeEventListener( 'pointerup', up ); geom.x = win.offsetLeft; geom.y = win.offsetTop; saveState(); }
			bar.addEventListener( 'pointermove', mv ); bar.addEventListener( 'pointerup', up );
		} );

		// ── resize (corner grip) ───────────────────────────────────────────────
		grip.addEventListener( 'pointerdown', function ( e ) {
			if ( geom.max || geom.min ) { return; }
			e.preventDefault();
			var sx = e.clientX, sy = e.clientY, ow = win.offsetWidth, oh = win.offsetHeight;
			grip.setPointerCapture( e.pointerId );
			function mv( ev ) { geom.w = Math.max( 340, ow + ( ev.clientX - sx ) ); geom.h = Math.max( 420, oh + ( ev.clientY - sy ) ); win.style.width = geom.w + 'px'; win.style.height = geom.h + 'px'; }
			function up() { grip.releasePointerCapture( e.pointerId ); grip.removeEventListener( 'pointermove', mv ); grip.removeEventListener( 'pointerup', up ); saveState(); }
			grip.addEventListener( 'pointermove', mv ); grip.addEventListener( 'pointerup', up );
		} );

		// Re-clamp if the viewport shrinks below the window's position.
		window.addEventListener( 'resize', function () { if ( ! win.hidden && ! geom.max ) { applyGeom(); } } );
	}

	if ( 'loading' === document.readyState ) { document.addEventListener( 'DOMContentLoaded', boot ); } else { boot(); }
}() );
