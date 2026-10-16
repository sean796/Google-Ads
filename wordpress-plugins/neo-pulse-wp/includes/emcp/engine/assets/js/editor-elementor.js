/**
 * EMCP Tools — Elementor editor bridge for the AI panel.
 *
 * Provides the Elementor-specific hooks the chat engine (ai-chat.js) calls:
 * live page/selection context, save-before-edit, and resync-after-edit. The
 * floating-window UI (drag/min/max/resize/persist) lives in the shared
 * editor-window.js. All behavior is feature-detected and degrades gracefully.
 */
( function () {
	'use strict';

	var cfg = window.emcpAiChat;
	if ( ! cfg || 'elementor' !== cfg.embed ) { return; }

	function boot() {
		// ── page + selection context ───────────────────────────────────────────
		var BASE_CONTEXT = cfg.pageContext || '';
		function docId() { try { return window.elementor && elementor.config && elementor.config.document ? elementor.config.document.id : cfg.postId; } catch ( e ) { return cfg.postId; } }
		function selectionContext() {
			try {
				var els = window.elementor && elementor.selection && elementor.selection.getElements ? elementor.selection.getElements() : null;
				if ( els && els.length ) {
					var m = els[ 0 ];
					var id = ( m && m.model && m.model.get ) ? m.model.get( 'id' ) : ( m && m.id );
					if ( id ) { return 'The user currently has element ' + id + ' selected in the editor.'; }
				}
			} catch ( e ) {}
			return '';
		}
		function updateContext() { var s = selectionContext(); window.emcpAiChat.pageContext = BASE_CONTEXT + ( s ? ( '\n' + s ) : '' ); }
		updateContext();
		try { if ( window.elementor && elementor.channels && elementor.channels.editor ) { elementor.channels.editor.on( 'change', updateContext ); } } catch ( e ) {}

		// The shared window (editor-window.js) calls this each time the panel opens.
		window.emcpAiChat.onWindowOpen = updateContext;

		// ── save-before-edit / resync-after-edit hooks ─────────────────────────
		window.emcpAiChat.onBeforeEdit = function () {
			return withTimeout( 6000, function ( resolve ) {
				try {
					var changed = window.elementor && elementor.saver && elementor.saver.isEditorChanged && elementor.saver.isEditorChanged();
					if ( ! changed ) { return resolve(); }
					if ( elementor.saver.update ) { elementor.saver.update( { onSuccess: resolve, onError: resolve } ); return; }
					if ( window.$e && $e.run ) { $e.run( 'document/save/update' ).then( resolve, resolve ); return; }
				} catch ( e ) {}
				resolve();
			} );
		};
		window.emcpAiChat.onAfterEdit = function () {
			return new Promise( function ( resolve ) {
				var settled = false;
				function fullReload() { if ( settled ) { return; } settled = true; window.location.reload(); }
				function inPlaceDone() { if ( settled ) { return; } settled = true; updateContext(); resolve(); }
				var timer = setTimeout( fullReload, 5000 );

				var view = window.elementor && elementor.getPreviewView ? elementor.getPreviewView() : null;
				if ( ! view || ! view.collection || ! view.collection.reset ) {
					clearTimeout( timer ); fullReload(); return;
				}
				fetch( cfg.restBase + '/page-elements?post_id=' + encodeURIComponent( docId() ), {
					credentials: 'same-origin', headers: { 'X-WP-Nonce': cfg.nonce }
				} ).then( function ( r ) { return r.ok ? r.json() : Promise.reject(); } ).then( function ( d ) {
					clearTimeout( timer );
					if ( ! d || ! d.elements ) { return fullReload(); }
					try {
						view.collection.reset( d.elements );
						if ( elementor.saver && elementor.saver.setFlagEditorChange ) { elementor.saver.setFlagEditorChange( false ); }
						inPlaceDone();
					} catch ( e ) { fullReload(); }
				} ).catch( function () { clearTimeout( timer ); fullReload(); } );
			} );
		};
		function withTimeout( ms, work ) {
			return new Promise( function ( resolve ) {
				var done = false;
				function finish() { if ( done ) { return; } done = true; resolve(); }
				setTimeout( finish, ms );
				try { work( finish ); } catch ( e ) { finish(); }
			} );
		}
	}

	if ( 'loading' === document.readyState ) { document.addEventListener( 'DOMContentLoaded', boot ); } else { boot(); }
}() );
