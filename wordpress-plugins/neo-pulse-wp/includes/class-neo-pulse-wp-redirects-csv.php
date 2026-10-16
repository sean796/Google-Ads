<?php
/**
 * Rank Math redirect CSV import/export (ported from NEO Pulse app).
 *
 * @package Neo_Pulse_Wp
 */

defined( 'ABSPATH' ) || exit;

class Neo_Pulse_Wp_Redirects_Csv {

	/**
	 * Normalize relative path: lowercase, trailing slash, no leading slash.
	 * A query string is kept after the slash ("old/?id=5"); a bare "/?p=1"
	 * becomes "?p=1". Fragments are dropped.
	 */
	public static function normalize_relative_path( string $raw ): ?string {
		$p = trim( $raw );
		$p = trim( $p, " \t\n\r\0\x0B\"'" );
		if ( $p === '' ) {
			return null;
		}
		$query = '';
		if ( preg_match( '#^https?://#i', $p ) ) {
			$parts = wp_parse_url( $p );
			if ( ! is_array( $parts ) || empty( $parts['path'] ) ) {
				return null;
			}
			$p = (string) $parts['path'];
			if ( isset( $parts['query'] ) && '' !== $parts['query'] ) {
				$query = (string) $parts['query'];
			}
		} else {
			$hash = strpos( $p, '#' );
			if ( false !== $hash ) {
				$p = substr( $p, 0, $hash );
			}
			$q = strpos( $p, '?' );
			if ( false !== $q ) {
				$query = substr( $p, $q + 1 );
				$p     = substr( $p, 0, $q );
			}
		}
		$p = ltrim( $p, '/' );
		$p = strtolower( (string) preg_replace( '#/+#', '/', $p ) );
		if ( $p !== '' && substr( $p, -1 ) !== '/' ) {
			$p .= '/';
		}
		if ( '' !== $query ) {
			$p .= '?' . strtolower( $query );
		}
		return $p === '' ? null : $p;
	}

	/**
	 * Destination key for comparison (relative path portion).
	 */
	public static function destination_path_key( string $destination ): ?string {
		$trimmed = trim( $destination );
		if ( $trimmed === '' ) {
			return null;
		}
		if ( preg_match( '#^https?://#i', $trimmed ) ) {
			$parts = wp_parse_url( $trimmed );
			if ( ! is_array( $parts ) || ! isset( $parts['path'] ) ) {
				return null;
			}
			$path = ltrim( (string) $parts['path'], '/' );
			$path = strtolower( preg_replace( '#/+#', '/', $path ) );
			if ( substr( $path, -1 ) !== '/' ) {
				$path .= '/';
			}
			return $path;
		}
		return self::normalize_relative_path( $trimmed );
	}

	/**
	 * Resolve destination to absolute URL for redirects.
	 */
	public static function resolve_destination_url( string $destination ): ?string {
		$trimmed = trim( $destination );
		if ( $trimmed === '' ) {
			return null;
		}
		if ( preg_match( '#^https?://#i', $trimmed ) ) {
			$parts = wp_parse_url( $trimmed );
			if ( ! is_array( $parts ) || empty( $parts['host'] ) ) {
				return null;
			}
			// Absolute URLs are used as written (no forced trailing slash, so
			// file URLs such as /doc.pdf on other hosts keep working).
			$path = isset( $parts['path'] ) && '' !== $parts['path'] ? (string) $parts['path'] : '/';
			$path = (string) preg_replace( '#/+#', '/', $path );
			$scheme = isset( $parts['scheme'] ) ? $parts['scheme'] : 'https';
			$host   = $parts['host'];
			$port   = isset( $parts['port'] ) ? ':' . $parts['port'] : '';
			$query  = isset( $parts['query'] ) && $parts['query'] !== '' ? '?' . $parts['query'] : '';
			$frag   = isset( $parts['fragment'] ) && $parts['fragment'] !== '' ? '#' . $parts['fragment'] : '';
			return $scheme . '://' . $host . $port . $path . $query . $frag;
		}
		$rel = self::normalize_relative_path( $trimmed );
		if ( ! $rel ) {
			return null;
		}
		return home_url( '/' . $rel );
	}

	/**
	 * @return array{rows: array<int, array<string, mixed>>, error?: string}
	 */
	public static function parse( string $csv_text ): array {
		$trimmed = trim( $csv_text );
		if ( $trimmed === '' ) {
			return array(
				'rows'  => array(),
				'error' => __( 'CSV is empty.', 'neo-pulse-wp' ),
			);
		}

		$lines = preg_split( '/\r\n|\r|\n/', $trimmed );
		if ( ! is_array( $lines ) || count( $lines ) < 1 ) {
			return array(
				'rows'  => array(),
				'error' => __( 'Failed to parse CSV.', 'neo-pulse-wp' ),
			);
		}

		$header_line = array_shift( $lines );
		$headers     = str_getcsv( (string) $header_line );
		if ( ! is_array( $headers ) || empty( $headers ) ) {
			return array(
				'rows'  => array(),
				'error' => __( 'CSV header row is missing.', 'neo-pulse-wp' ),
			);
		}

		$header_map = array();
		foreach ( $headers as $i => $h ) {
			$key = self::normalize_header_key( (string) $h );
			if ( $key !== '' ) {
				$header_map[ $key ] = (int) $i;
			}
		}

		$out = array();
		foreach ( $lines as $line ) {
			if ( trim( (string) $line ) === '' ) {
				continue;
			}
			$cells = str_getcsv( (string) $line );
			if ( ! is_array( $cells ) ) {
				continue;
			}
			$row = self::row_assoc( $headers, $cells );
			if ( ! self::is_active_status( $row ) ) {
				continue;
			}

			$source_raw = self::pick_column( $row, array( 'source', 'rank_math_source', 'old_url' ) );
			$dest_raw   = self::pick_column( $row, array( 'destination', 'rank_math_destination', 'new_url' ) );
			$type       = (int) self::pick_column( $row, array( 'type' ) );
			if ( ! in_array( $type, Neo_Pulse_Wp_Redirects::STATUS_CODES, true ) ) {
				$type = 301;
			}
			$is_gone = in_array( $type, Neo_Pulse_Wp_Redirects::GONE_CODES, true );
			if ( $source_raw === '' || ( $dest_raw === '' && ! $is_gone ) ) {
				continue;
			}

			$matching = Neo_Pulse_Wp_Redirects::normalize_matching( self::pick_column( $row, array( 'matching' ) ) );
			$source   = Neo_Pulse_Wp_Redirects::normalize_source( $source_raw, $matching );
			if ( ! $source ) {
				continue;
			}

			$dest_trimmed = $is_gone ? '' : trim( $dest_raw );
			if ( ! $is_gone && ! self::destination_path_key( $dest_trimmed ) ) {
				continue;
			}
			if ( ! $is_gone && 'exact' === $matching && self::source_equals_destination( $source, $dest_trimmed ) ) {
				continue;
			}
			$category = self::pick_column( $row, array( 'category' ) );
			if ( $category === '' ) {
				$category = __( 'Uncategorized', 'neo-pulse-wp' );
			}
			$ignore_raw = strtolower( self::pick_column( $row, array( 'ignore' ) ) );
			$ignore     = in_array( $ignore_raw, array( '1', 'yes', 'true', 'case' ), true ) ? 1 : 0;

			$out[] = array(
				'source'      => $source,
				'matching'    => $matching,
				'destination' => $dest_trimmed,
				'type'        => $type,
				'category'    => sanitize_text_field( $category ),
				'status'      => 'active',
				'ignore'      => $ignore,
			);
		}

		if ( empty( $out ) ) {
			return array(
				'rows'  => array(),
				'error' => __( 'No valid source/destination redirect rows found.', 'neo-pulse-wp' ),
			);
		}

		return array( 'rows' => $out );
	}

	/**
	 * @param array<int, array<string, mixed>> $rows DB rows or parsed rows.
	 */
	public static function build( array $rows ): string {
		$header = 'id,source,matching,destination,type,category,status,ignore';
		$lines  = array( $header );
		$i      = 1;
		foreach ( $rows as $row ) {
			$lines[] = Neo_Pulse_Wp_Csv::row(
				array(
					(string) $i,
					isset( $row['source'] ) ? (string) $row['source'] : '',
					isset( $row['matching'] ) ? (string) $row['matching'] : 'exact',
					isset( $row['destination'] ) ? (string) $row['destination'] : '',
					isset( $row['type'] ) ? (string) $row['type'] : '301',
					isset( $row['category'] ) ? (string) $row['category'] : '',
					isset( $row['status'] ) && 'inactive' === $row['status'] ? 'inactive' : 'active',
					! empty( $row['ignore'] ) ? '1' : '',
				)
			);
			++$i;
		}
		return implode( "\n", $lines );
	}

	private static function normalize_header_key( string $key ): string {
		$key = strtolower( trim( $key ) );
		return preg_replace( '/\s+/', '', $key );
	}

	/**
	 * @param array<int, string>   $headers Header cells.
	 * @param array<int, string>   $cells   Row cells.
	 * @return array<string, string>
	 */
	private static function row_assoc( array $headers, array $cells ): array {
		$row = array();
		foreach ( $headers as $i => $h ) {
			$row[ (string) $h ] = isset( $cells[ $i ] ) ? (string) $cells[ $i ] : '';
		}
		return $row;
	}

	/**
	 * @param array<string, string> $row   Row data.
	 * @param array<int, string>    $names Column names to try.
	 */
	private static function pick_column( array $row, array $names ): string {
		$keys = array_keys( $row );
		foreach ( $names as $name ) {
			$norm = self::normalize_header_key( $name );
			foreach ( $keys as $k ) {
				if ( self::normalize_header_key( $k ) === $norm ) {
					$v = trim( (string) $row[ $k ] );
					if ( $v !== '' ) {
						return $v;
					}
				}
			}
		}
		return '';
	}

	/**
	 * @param array<string, string> $row Row data.
	 */
	private static function is_active_status( array $row ): bool {
		$status = self::pick_column( $row, array( 'status' ) );
		if ( $status === '' ) {
			return true;
		}
		return strtolower( $status ) === 'active';
	}

	private static function source_equals_destination( string $source, string $destination ): bool {
		$dest_key = self::destination_path_key( $destination );
		return $dest_key !== null && $source === $dest_key;
	}
}
