<?php
/**
 * Client folder name, path segment, and date segment helpers.
 *
 * @package Neo_Pulse_App
 */

defined( 'ABSPATH' ) || exit;

trait Neo_Pulse_App_Google_Drive_Upload_Trait_Client_And_Path_Helpers {

	/**
	 * Create this client's folder. Do not pick another client's folder.
	 *
	 * @return array{statusCode:int,body:array<string,mixed>}
	 */
	private static function drive_folder_names_match( string $a, string $b ): bool {
		$left  = strtolower( trim( (string) preg_replace( '/\s+/', ' ', $a ) ) );
		$right = strtolower( trim( (string) preg_replace( '/\s+/', ' ', $b ) ) );
		return $left !== '' && $left === $right;
	}

	private static function drive_label_client_segment( string $label ): string {
		$parts = array_values(
			array_filter(
				array_map( 'trim', explode( '/', $label ) ),
				static function ( $part ) {
					return $part !== '';
				}
			)
		);
		if ( empty( $parts ) ) {
			return '';
		}
		if ( self::drive_folder_names_match( $parts[0], self::NEO_PULSE_WORKSPACE_FOLDER_NAME ) ) {
			return (string) ( $parts[1] ?? '' );
		}
		return (string) $parts[0];
	}

	private static function drive_label_belongs_to_client( string $label, string $client_name ): bool {
		$want = trim( $client_name );
		if ( $want === '' ) {
			return false;
		}
		return self::drive_folder_names_match( self::drive_label_client_segment( $label ), $want );
	}

	private static function create_new_client_folder_pick( string $site_name, string $site_url, string $reason ): array {
		return array(
			'statusCode' => 200,
			'body'       => array(
				'action'     => 'create_new',
				'folderName' => self::normalize_client_folder_name( $site_name, $site_url ),
				'reason'     => $reason,
			),
		);
	}

	/**
	 * Exact client folder name, or create this client's folder. Never another client.
	 *
	 * @param array<int,mixed> $candidates
	 * @return array{statusCode:int,body:array<string,mixed>}
	 */
	private static function pick_or_create_client_folder(
		array $candidates,
		string $site_name,
		string $site_url
	): array {
		$want = self::normalize_client_folder_name( $site_name, $site_url );
		if ( $want === '' ) {
			return array(
				'statusCode' => 400,
				'body'       => array( 'success' => false, 'error' => 'Client name is required to resolve the Google Drive folder.' ),
			);
		}
		foreach ( $candidates as $row ) {
			if ( ! is_array( $row ) ) {
				continue;
			}
			$folder_id = (string) ( $row['folderId'] ?? '' );
			$name      = (string) ( $row['name'] ?? '' );
			if ( $folder_id === '' || $name === '' ) {
				continue;
			}
			if ( self::drive_folder_names_match( $name, $want ) ) {
				return array(
					'statusCode' => 200,
					'body'       => array(
						'action'   => 'use_existing',
						'folderId' => $folder_id,
						'reason'   => 'exact_name',
					),
				);
			}
		}
		return self::create_new_client_folder_pick( $site_name, $site_url, 'no_exact_client_folder' );
	}

	private static function normalize_folder_source( string $source ): string {
		$normalized = strtolower( trim( $source ) );
		if ( in_array( $normalized, array( 'client_root', 'path', 'variable', 'manual' ), true ) ) {
			return $normalized;
		}
		return 'manual';
	}

	private static function normalize_client_folder_name( string $site_name, string $site_url ): string {
		$from_name = trim( $site_name );
		if ( $from_name !== '' ) {
			return sanitize_text_field( $from_name );
		}
		$url = trim( $site_url );
		if ( $url === '' ) {
			return '';
		}
		$host = wp_parse_url( $url, PHP_URL_HOST );
		if ( ! is_string( $host ) || $host === '' ) {
			$host = wp_parse_url( 'https://' . ltrim( $url, '/' ), PHP_URL_HOST );
		}
		if ( ! is_string( $host ) || $host === '' ) {
			return '';
		}
		$host = preg_replace( '/^www\./i', '', $host );
		$parts = explode( '.', (string) $host );
		return sanitize_text_field( $parts[0] ?? '' );
	}

	/**
	 * @param array{teamRootFolderId?:string,folderAliases?:array<int,array<string,mixed>>} $settings
	 */
	private static function resolve_team_root_folder_id( array $settings ): string {
		$configured = preg_replace( '/[^a-zA-Z0-9_-]/', '', (string) ( $settings['teamRootFolderId'] ?? '' ) );
		if ( is_string( $configured ) && strlen( $configured ) >= 10 ) {
			return $configured;
		}
		return Neo_Pulse_App_Google_Drive_Settings::DEFAULT_TEAM_SHARED_DRIVE_FOLDER_ID;
	}

	/**
	 * @param array<int,array<string,mixed>> $aliases
	 * @return array<int,string>
	 */
	private static function resolve_path_segments( string $path_input, array $aliases ): array {
		$trimmed = trim( $path_input );
		$defaults = Neo_Pulse_App_Google_Drive_Settings::default_folder_aliases();
		$alias_rows = ! empty( $aliases ) ? $aliases : $defaults;
		if ( $trimmed === '' ) {
			return array( self::resolve_purpose_folder_name( '', $alias_rows ) );
		}
		$parts = array_values(
			array_filter(
				array_map(
					static function ( $part ) use ( $alias_rows ) {
						$segment = trim( (string) $part );
						return $segment !== '' ? self::resolve_purpose_folder_name( $segment, $alias_rows ) : '';
					},
					explode( '/', $trimmed )
				),
				static function ( $part ) {
					return $part !== '';
				}
			)
		);
		return ! empty( $parts ) ? $parts : array( self::resolve_purpose_folder_name( '', $alias_rows ) );
	}

	/**
	 * @param array<int,array<string,mixed>> $aliases
	 */
	private static function resolve_purpose_folder_name( string $path_input, array $aliases ): string {
		$trimmed = trim( $path_input );
		$defaults = Neo_Pulse_App_Google_Drive_Settings::default_folder_aliases();
		$alias_rows = ! empty( $aliases ) ? $aliases : $defaults;
		if ( $trimmed === '' ) {
			foreach ( $alias_rows as $alias ) {
				if ( is_array( $alias ) && ( $alias['key'] ?? '' ) === 'reporting' ) {
					return (string) ( $alias['folderName'] ?? 'Reporting' );
				}
			}
			return 'Reporting';
		}
		$leaf = strtolower( $trimmed );
		foreach ( $alias_rows as $alias ) {
			if ( ! is_array( $alias ) ) {
				continue;
			}
			$key        = strtolower( (string) ( $alias['key'] ?? '' ) );
			$folder_name = (string) ( $alias['folderName'] ?? '' );
			$alias_list  = isset( $alias['aliases'] ) && is_array( $alias['aliases'] ) ? $alias['aliases'] : array();
			if ( $key === $leaf || strtolower( $folder_name ) === $leaf ) {
				return $folder_name !== '' ? $folder_name : $trimmed;
			}
			foreach ( $alias_list as $alias_name ) {
				if ( strtolower( (string) $alias_name ) === $leaf ) {
					return $folder_name !== '' ? $folder_name : $trimmed;
				}
			}
		}
		return $trimmed;
	}

	/**
	 * @param array<int,string> $segments
	 * @return array<int,string>
	 */
	private static function edmonton_now(): DateTimeImmutable {
		return new DateTimeImmutable( 'now', new DateTimeZone( 'America/Edmonton' ) );
	}

	private static function drive_year_segment( ?DateTimeImmutable $now = null ): string {
		$now = $now instanceof DateTimeImmutable ? $now : self::edmonton_now();
		return $now->format( 'Y' );
	}

	private static function drive_month_segment( ?DateTimeImmutable $now = null ): string {
		$now = $now instanceof DateTimeImmutable ? $now : self::edmonton_now();
		return $now->format( 'F' );
	}

	private static function is_drive_month_segment( string $value ): bool {
		$trimmed = trim( $value );
		if ( $trimmed === '' ) {
			return false;
		}
		return strtotime( $trimmed . ' 1, 2000' ) !== false;
	}

	private static function is_delivery_month_leaf_label( string $label ): bool {
		$parts = array_values(
			array_filter(
				array_map( 'trim', explode( '/', $label ) ),
				static function ( $part ) {
					return $part !== '';
				}
			)
		);
		if ( count( $parts ) < 3 ) {
			return false;
		}
		$month   = (string) $parts[ count( $parts ) - 1 ];
		$year    = (string) $parts[ count( $parts ) - 2 ];
		$purpose = (string) $parts[ count( $parts ) - 3 ];
		return $purpose !== '' && preg_match( '/^\d{4}$/', $year ) === 1 && self::is_drive_month_segment( $month );
	}

	/**
	 * @param array<int,string> $left
	 * @param array<int,string> $right
	 */
	private static function drive_segments_match( array $left, array $right ): bool {
		if ( count( $left ) !== count( $right ) ) {
			return false;
		}
		foreach ( $right as $index => $expected ) {
			if ( strtolower( (string) ( $left[ $index ] ?? '' ) ) !== strtolower( (string) $expected ) ) {
				return false;
			}
		}
		return true;
	}

	private static function append_drive_date_segments( array $segments ): array {
		if ( empty( $segments ) ) {
			return $segments;
		}
		$year_segment  = self::drive_year_segment();
		$month_segment = self::drive_month_segment();
		$last          = $segments[ count( $segments ) - 1 ] ?? '';
		$second_last   = $segments[ count( $segments ) - 2 ] ?? '';
		if ( preg_match( '/^\d{4}$/', (string) $second_last ) && self::is_drive_month_segment( (string) $last ) ) {
			return $segments;
		}
		if ( preg_match( '/^\d{4}$/', (string) $last ) ) {
			return array_merge( $segments, array( $month_segment ) );
		}
		return array_merge( $segments, array( $year_segment, $month_segment ) );
	}
}
