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
}
