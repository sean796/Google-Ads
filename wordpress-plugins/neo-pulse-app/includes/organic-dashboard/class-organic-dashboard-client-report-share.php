<?php
/**
 * Public share snapshots for organic client report decks (UUID lookup).
 *
 * @package Neo_Pulse_App
 */

defined( 'ABSPATH' ) || exit;

class Neo_Pulse_App_Organic_Dashboard_Client_Report_Share {

	private const DECK_ID_PATTERN = '/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i';

	/**
	 * @return string|null Sanitized deck id or null when invalid.
	 */
	public static function normalize_deck_id( string $raw ): ?string {
		$id = strtolower( trim( $raw ) );
		if ( $id === '' || ! preg_match( self::DECK_ID_PATTERN, $id ) ) {
			return null;
		}
		return $id;
	}

	private static function file_path( string $deck_id ): string {
		return Neo_Pulse_App_Data_Paths::file( 'organic-client-report-shares', $deck_id . '.json' );
	}

	/**
	 * @param array<string,mixed> $body Request JSON.
	 * @return array{statusCode:int,body:array<string,mixed>}
	 */
	public static function save( array $body ): array {
		$user = class_exists( 'Neo_Pulse_App_Auth_Session' ) ? Neo_Pulse_App_Auth_Session::require_user() : null;
		if ( ! is_array( $user ) || empty( $user['id'] ) ) {
			return array(
				'statusCode' => 401,
				'body'       => array(
					'ok'    => false,
					'error' => 'Sign in to publish a client report link.',
				),
			);
		}

		$deck_id = isset( $body['deckId'] ) ? self::normalize_deck_id( (string) $body['deckId'] ) : null;
		if ( $deck_id === null ) {
			return array(
				'statusCode' => 400,
				'body'       => array(
					'ok'    => false,
					'error' => 'Invalid deckId.',
				),
			);
		}

		$payload = isset( $body['payload'] ) && is_array( $body['payload'] ) ? $body['payload'] : null;
		if ( $payload === null ) {
			return array(
				'statusCode' => 400,
				'body'       => array(
					'ok'    => false,
					'error' => 'Missing payload.',
				),
			);
		}

		$site_id = isset( $payload['siteId'] ) ? trim( (string) $payload['siteId'] ) : '';
		if ( $site_id === '' ) {
			return array(
				'statusCode' => 400,
				'body'       => array(
					'ok'    => false,
					'error' => 'Payload missing siteId.',
				),
			);
		}

		$record = array(
			'deckId'    => $deck_id,
			'siteId'    => $site_id,
			'payload'   => $payload,
			'savedAt'   => gmdate( 'c' ),
			'savedBy'   => (int) $user['id'],
		);

		Neo_Pulse_App_Json_File_Store::write( self::file_path( $deck_id ), $record );

		return array(
			'statusCode' => 200,
			'body'       => array(
				'ok'     => true,
				'deckId' => $deck_id,
			),
		);
	}

	/**
	 * @return array{statusCode:int,body:array<string,mixed>}
	 */
	public static function load( string $deck_id_raw, string $site_id_raw ): array {
		$deck_id = self::normalize_deck_id( $deck_id_raw );
		$site_id = trim( $site_id_raw );
		if ( $deck_id === null || $site_id === '' ) {
			return array(
				'statusCode' => 400,
				'body'       => array(
					'ok'    => false,
					'error' => 'Invalid deckId or siteId.',
				),
			);
		}

		$data = Neo_Pulse_App_Json_File_Store::read( self::file_path( $deck_id ) );
		if ( ! is_array( $data ) || empty( $data['payload'] ) || ! is_array( $data['payload'] ) ) {
			return array(
				'statusCode' => 404,
				'body'       => array(
					'ok'    => false,
					'error' => 'Client report not found.',
				),
			);
		}

		if ( trim( (string) ( $data['siteId'] ?? '' ) ) !== $site_id ) {
			return array(
				'statusCode' => 404,
				'body'       => array(
					'ok'    => false,
					'error' => 'Client report not found.',
				),
			);
		}

		$payload = $data['payload'];
		if ( trim( (string) ( $payload['siteId'] ?? '' ) ) !== $site_id ) {
			return array(
				'statusCode' => 404,
				'body'       => array(
					'ok'    => false,
					'error' => 'Client report not found.',
				),
			);
		}

		return array(
			'statusCode' => 200,
			'body'       => array(
				'ok'      => true,
				'payload' => $payload,
			),
		);
	}

	/**
	 * HTML link preview + redirect to the SPA client report (Slack, iMessage, etc.).
	 */
	public static function open_link_preview(): void {
		$deck_id = isset( $_GET['deckId'] ) ? (string) wp_unslash( $_GET['deckId'] ) : '';
		if ( $deck_id === '' && isset( $_GET['deck'] ) ) {
			$deck_id = (string) wp_unslash( $_GET['deck'] );
		}
		$site_id = isset( $_GET['siteId'] ) ? trim( (string) wp_unslash( $_GET['siteId'] ) ) : '';
		$app_url = isset( $_GET['app'] ) ? trim( (string) wp_unslash( $_GET['app'] ) ) : '';

		$site_name = isset( $_GET['client'] ) ? trim( (string) wp_unslash( $_GET['client'] ) ) : '';
		$site_url  = '';
		$period    = '';

		if ( $deck_id !== '' && $site_id !== '' ) {
			$loaded = self::load( $deck_id, $site_id );
			if ( 200 === (int) ( $loaded['statusCode'] ?? 0 ) && is_array( $loaded['body']['payload'] ?? null ) ) {
				$payload   = $loaded['body']['payload'];
				$site_name = $site_name !== '' ? $site_name : trim( (string) ( $payload['siteName'] ?? '' ) );
				$site_url  = trim( (string) ( $payload['siteUrl'] ?? '' ) );
				$period    = self::period_line_from_payload( $payload );
			}
		}

		if ( $site_name === '' ) {
			$site_name = $site_id !== '' ? $site_id : 'Client report';
		}

		$title       = $site_name . ' · Organic performance report';
		$description = self::build_preview_description( $site_url, $period );
		$redirect    = self::sanitize_app_redirect_url( $app_url );

		status_header( 200 );
		header( 'Content-Type: text/html; charset=utf-8' );
		header( 'X-Robots-Tag: noindex, nofollow' );

		echo '<!doctype html><html lang="en"><head>';
		echo '<meta charset="utf-8"/>';
		echo '<meta name="viewport" content="width=device-width, initial-scale=1"/>';
		echo '<title>' . esc_html( $title ) . '</title>';
		echo '<meta name="description" content="' . esc_attr( $description ) . '"/>';
		echo '<meta property="og:title" content="' . esc_attr( $title ) . '"/>';
		echo '<meta property="og:description" content="' . esc_attr( $description ) . '"/>';
		echo '<meta property="og:type" content="article"/>';
		echo '<meta name="twitter:card" content="summary"/>';
		echo '<meta name="twitter:title" content="' . esc_attr( $title ) . '"/>';
		echo '<meta name="twitter:description" content="' . esc_attr( $description ) . '"/>';
		if ( $redirect !== '' ) {
			echo '<meta http-equiv="refresh" content="0;url=' . esc_attr( $redirect ) . '"/>';
			echo '<link rel="canonical" href="' . esc_url( $redirect ) . '"/>';
		}
		echo '</head><body>';
		if ( $redirect !== '' ) {
			echo '<p><a href="' . esc_url( $redirect ) . '">Open ' . esc_html( $site_name ) . ' client report</a></p>';
		} else {
			echo '<p>Client report link preview.</p>';
		}
		echo '</body></html>';
		exit;
	}

	/**
	 * @param array<string,mixed> $payload Deck payload.
	 */
	private static function period_line_from_payload( array $payload ): string {
		$show_compare = ! empty( $payload['showCompare'] );
		$vm           = is_array( $payload['viewModel'] ?? null ) ? $payload['viewModel'] : array();
		$labels       = is_array( $vm['periodLabels'] ?? null ) ? $vm['periodLabels'] : array();
		$primary      = trim( (string) ( $labels['primary'] ?? '' ) );
		$compare      = trim( (string) ( $labels['compare'] ?? '' ) );
		if ( $primary === '' ) {
			return '';
		}
		if ( ! $show_compare || $compare === '' ) {
			return $primary;
		}
		return $compare . ' vs ' . $primary;
	}

	private static function build_preview_description( string $site_url, string $period ): string {
		$parts = array();
		if ( $site_url !== '' ) {
			$parts[] = $site_url;
		}
		if ( $period !== '' ) {
			$parts[] = $period;
		}
		return implode( ' · ', $parts );
	}

	private static function sanitize_app_redirect_url( string $url ): string {
		$url = trim( $url );
		if ( $url === '' || ! wp_http_validate_url( $url ) ) {
			return '';
		}
		return $url;
	}
}
