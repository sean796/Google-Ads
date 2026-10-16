<?php
/**
 * Content Sync — source-side push of one item to a paired live site.
 *
 * Builds the item's bundle, base64-encodes its media, signs a 'receive-content'
 * control call with the target's HMAC secret, and POSTs it to the connector's
 * receive-content route. On success the item's current hash is recorded so it
 * leaves the "changes to sync" list.
 *
 * Media rides inline (base64) in the request — fine for a typical page; chunked
 * media transfer for image-heavy items is a later optimization.
 *
 * @package EMCP_Tools
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class EMCP_Tools_Content_Sync {

	const REST_NS = 'emcp-connector/v1';

	/**
	 * Push one content item to a target and mark it synced.
	 *
	 * @param int $target_id Paired target id.
	 * @param int $post_id   Post id.
	 * @return array|WP_Error {applied, uid, live_id, media, permalink} or error.
	 */
	public static function push_item( $target_id, $post_id ) {
		if ( ! class_exists( 'EMCP_Tools_Content_Bundle' ) || ! class_exists( 'EMCP_Tools_Migrate_Targets' ) ) {
			return new WP_Error( 'emcp_sync_unavailable', __( 'Content sync is unavailable.', 'emcp-tools' ) );
		}
		$target = EMCP_Tools_Migrate_Targets::get( (int) $target_id );
		if ( ! $target ) {
			return new WP_Error( 'emcp_sync_target', __( 'Migration target not found.', 'emcp-tools' ) );
		}

		$bundle = EMCP_Tools_Content_Bundle::build( (int) $post_id );
		if ( is_wp_error( $bundle ) ) {
			return $bundle;
		}
		$manifest = EMCP_Tools_Content_Bundle::manifest( $bundle );

		$media_bytes = array();
		foreach ( (array) $bundle['media'] as $m ) {
			if ( empty( $m['_file'] ) || ! is_file( $m['_file'] ) ) {
				continue;
			}
			// phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_file_get_contents
			$raw = file_get_contents( $m['_file'] );
			if ( false !== $raw ) {
				$media_bytes[ $m['uid'] ] = base64_encode( $raw );
			}
		}

		$body = (string) wp_json_encode( array( 'manifest' => $manifest, 'media_bytes' => $media_bytes ) );
		$ts   = time();
		$sig  = EMCP_Tools_Migrate_HMAC::sign(
			EMCP_Tools_Migrate_HMAC::control_canonical( 'receive-content', $ts, $body ),
			$target->secret
		);
		// Prefer the connector's advertised REST base (survives any permalink
		// structure); fall back to the pretty /wp-json/ path for older pairings.
		$base = ( ! empty( $target->caps['rest_url'] ) )
			? untrailingslashit( (string) $target->caps['rest_url'] )
			: untrailingslashit( $target->live_url ) . '/wp-json/' . self::REST_NS;
		$url  = $base . '/receive-content';

		$resp = wp_remote_post( $url, array(
			'timeout' => 60,
			'headers' => array(
				'Content-Type' => 'application/json',
				'X-EMCP-Ts'    => (string) $ts,
				'X-EMCP-Sig'   => $sig,
			),
			'body'    => $body,
		) );
		if ( is_wp_error( $resp ) ) {
			return $resp;
		}
		$code = (int) wp_remote_retrieve_response_code( $resp );
		$data = json_decode( wp_remote_retrieve_body( $resp ), true );
		if ( 200 !== $code || ! is_array( $data ) || empty( $data['applied'] ) ) {
			$why = is_array( $data ) && isset( $data['message'] ) ? $data['message'] : ( 'HTTP ' . $code );
			return new WP_Error(
				'emcp_sync_apply',
				sprintf( /* translators: %s: reason */ __( 'The live site rejected the item: %s', 'emcp-tools' ), $why )
			);
		}

		// Record the pushed hash so the item drops off the list until it changes.
		if ( class_exists( 'EMCP_Tools_Sync_Queue' ) ) {
			EMCP_Tools_Sync_Queue::mark_synced( (int) $post_id, (int) $target_id );
		}
		EMCP_Tools_Migrate_Targets::touch_sync( (int) $target_id );

		return $data;
	}
}
