/**
 * EMCP Tools — Gutenberg (block editor) bridge for the AI panel.
 *
 * Provides the block-editor hooks the chat engine (ai-chat.js) calls:
 * save-before-edit (persist the current post) and resync-after-edit (pull the
 * AI's server-side block changes back into the editor in place). The floating-
 * window UI lives in the shared editor-window.js.
 */
( function () {
	'use strict';

	var cfg = window.emcpAiChat;
	if ( ! cfg || 'gutenberg' !== cfg.embed ) { return; }

	function wpData() { return ( window.wp && wp.data ) ? wp.data : null; }

	function boot() {
		// Save the current post before the AI edits, so it works on exactly what
		// the user sees. Never rejects; hard-timeout so a stuck save can't block.
		window.emcpAiChat.onBeforeEdit = function () {
			return new Promise( function ( resolve ) {
				var done = false;
				function finish() { if ( done ) { return; } done = true; resolve(); }
				setTimeout( finish, 8000 );
				try {
					var data = wpData();
					if ( ! data || ! data.dispatch || ! data.select ) { return finish(); }
					var ed = data.select( 'core/editor' );
					var dirty = ed && ed.isEditedPostDirty ? ed.isEditedPostDirty() : true;
					if ( ! dirty ) { return finish(); }
					Promise.resolve( data.dispatch( 'core/editor' ).savePost() ).then( finish, finish );
				} catch ( e ) { finish(); }
			} );
		};

		// Reflect the AI's server-side block changes in the editor IN PLACE:
		// fetch the fresh post_content, parse it, and reset the block list. Falls
		// back to a full reload if the block APIs are unavailable or anything fails.
		window.emcpAiChat.onAfterEdit = function () {
			return new Promise( function ( resolve ) {
				var settled = false;
				function fullReload() { if ( settled ) { return; } settled = true; window.location.reload(); }
				function inPlaceDone() { if ( settled ) { return; } settled = true; resolve(); }
				var timer = setTimeout( fullReload, 6000 );

				var data     = wpData();
				var canReset = data && window.wp && wp.blocks && wp.blocks.parse;
				if ( ! canReset ) { clearTimeout( timer ); fullReload(); return; }

				fetch( cfg.restBase + '/post-content?post_id=' + encodeURIComponent( cfg.postId ), {
					credentials: 'same-origin', headers: { 'X-WP-Nonce': cfg.nonce }
				} ).then( function ( r ) { return r.ok ? r.json() : Promise.reject(); } ).then( function ( d ) {
					clearTimeout( timer );
					if ( ! d || 'string' !== typeof d.content ) { return fullReload(); }
					try {
						// Post title / excerpt live on the core/editor store, not in the
						// block list — update them too so an AI-changed title shows.
						var edits = {};
						if ( 'string' === typeof d.title ) { edits.title = d.title; }
						if ( 'string' === typeof d.excerpt ) { edits.excerpt = d.excerpt; }
						if ( data.dispatch( 'core/editor' ) && Object.keys( edits ).length ) {
							data.dispatch( 'core/editor' ).editPost( edits );
						}
						var blocks = wp.blocks.parse( d.content );
						data.dispatch( 'core/block-editor' ).resetBlocks( blocks );
						inPlaceDone();
					} catch ( e ) { fullReload(); }
				} ).catch( function () { clearTimeout( timer ); fullReload(); } );
			} );
		};
	}

	if ( 'loading' === document.readyState ) { document.addEventListener( 'DOMContentLoaded', boot ); } else { boot(); }
}() );
