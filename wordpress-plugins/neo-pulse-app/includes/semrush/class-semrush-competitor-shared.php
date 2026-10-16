<?php
/**
 * Shared Semrush competitor research helpers (CSV, enrichment caps, portfolio blocks).
 *
 * @package Neo_Pulse_App
 */

defined( 'ABSPATH' ) || exit;

class Neo_Pulse_App_Semrush_Competitor_Shared {

	const DEFAULT_DISPLAY_LIMIT           = 50;
	const DEFAULT_ENRICHMENT_CAP          = 15;
	const SEED_DOMAIN_ORGANIC_LIMIT       = 25;
	const ENRICHMENT_DOMAIN_ORGANIC_LIMIT = 25;
	const DOMAIN_ORGANIC_CSV_TOP_ROWS     = 25;
	const ENRICHMENT_DEADLINE_SEC         = 120;

	const EXPORT_COMPETITORS         = 'Dn,Cr,Np,Or,Ot,Oc,Ad';
	const EXPORT_SEED_RANK           = 'Dn,Or,Ot,Oc,Ad';
	const EXPORT_DOMAIN_ORGANIC_KW   = 'Ph,Nq,Tr,Po';

	/**
	 * @param mixed $raw
	 * @return string[]|null
	 */
	public static function sanitize_portfolio_blocked_hosts( $raw ): ?array {
		if ( ! is_array( $raw ) || $raw === array() ) {
			return null;
		}
		$out = array();
		foreach ( array_slice( $raw, 0, 200 ) as $item ) {
			if ( ! is_string( $item ) ) {
				continue;
			}
			$t = trim( $item );
			if ( $t === '' || strlen( $t ) > 253 ) {
				continue;
			}
			$out[] = $t;
		}
		return $out !== array() ? $out : null;
	}

	public static function domain_from_site_url( string $site_url ): string {
		$s = trim( $site_url );
		if ( $s === '' ) {
			return '';
		}
		if ( ! preg_match( '#^https?://#i', $s ) ) {
			$s = 'https://' . $s;
		}
		$host = wp_parse_url( $s, PHP_URL_HOST );
		return is_string( $host ) ? strtolower( $host ) : '';
	}

	public static function clean_domain_key( string $domain ): string {
		return strtolower( preg_replace( '/^www\./i', '', trim( $domain ) ) );
	}

	/**
	 * @param string[] $blocked_hosts
	 */
	public static function is_portfolio_blocked_domain( string $domain, array $blocked_hosts ): bool {
		if ( $blocked_hosts === array() ) {
			return false;
		}
		$d = strtolower( trim( $domain ) );
		if ( $d === '' ) {
			return true;
		}
		$reg = self::registrable_guess( $d );
		foreach ( $blocked_hosts as $b ) {
			$bl = strtolower( trim( (string) $b ) );
			if ( $bl === '' ) {
				continue;
			}
			if ( $d === $bl || $reg === $bl ) {
				return true;
			}
			if ( substr( $d, - ( strlen( $bl ) + 1 ) ) === '.' . $bl ) {
				return true;
			}
		}
		return false;
	}

	public static function registrable_guess( string $host ): string {
		$h     = strtolower( preg_replace( '/^www\./', '', $host ) );
		$parts = explode( '.', $h );
		if ( count( $parts ) <= 2 ) {
			return $h;
		}
		return implode( '.', array_slice( $parts, -2 ) );
	}

	public static function hostname_from_domain_field( $raw ): string {
		$s = trim( (string) $raw );
		if ( $s === '' ) {
			return '';
		}
		if ( preg_match( '#^https?://#i', $s ) ) {
			$host = wp_parse_url( $s, PHP_URL_HOST );
			return is_string( $host ) ? preg_replace( '/^www\./i', '', $host ) : '';
		}
		$no_path = preg_replace( '/^www\./i', '', explode( '/', $s )[0] );
		return trim( (string) $no_path );
	}

	/**
	 * @param array<string,string> $r
	 * @return array{domain:string,competitionLevel:?float,commonKeywords:?float,organicTraffic:?float,trafficCost:?float,organicKeywords:?float,adsKeywords:?float}|null
	 */
	public static function normalize_competitor_row( array $r ): ?array {
		$lower = Neo_Pulse_App_Semrush_Table_Parse::record_keys_lower( $r );
		$pick  = static function ( array $keys ) use ( $lower ) {
			foreach ( $keys as $k ) {
				$kk = strtolower( $k );
				if ( isset( $lower[ $kk ] ) && trim( (string) $lower[ $kk ] ) !== '' ) {
					return $lower[ $kk ];
				}
				$us = str_replace( ' ', '_', $kk );
				if ( isset( $lower[ $us ] ) && trim( (string) $lower[ $us ] ) !== '' ) {
					return $lower[ $us ];
				}
				$sp = str_replace( '_', ' ', $kk );
				if ( $sp !== $kk && isset( $lower[ $sp ] ) && trim( (string) $lower[ $sp ] ) !== '' ) {
					return $lower[ $sp ];
				}
			}
			return null;
		};

		$dn = self::hostname_from_domain_field( $pick( array( 'dn', 'domain' ) ) );
		if ( $dn === '' ) {
			return null;
		}

		return array(
			'domain'           => $dn,
			'competitionLevel' => Neo_Pulse_App_Semrush_Table_Parse::num( $pick( array( 'cr', 'competition', 'competition_level' ) ) ),
			'commonKeywords'   => Neo_Pulse_App_Semrush_Table_Parse::num( $pick( array( 'np', 'common_keywords', 'common keywords' ) ) ),
			'organicTraffic'   => Neo_Pulse_App_Semrush_Table_Parse::num( $pick( array( 'or', 'organic_traffic', 'organic traffic', 'traffic' ) ) ),
			'trafficCost'      => Neo_Pulse_App_Semrush_Table_Parse::num( $pick( array( 'ot', 'traffic_cost', 'organic cost', 'organic traffic_cost', 'traffic_value' ) ) ),
			'organicKeywords'  => Neo_Pulse_App_Semrush_Table_Parse::num( $pick( array( 'oc', 'organic_keywords', 'organic keywords' ) ) ),
			'adsKeywords'      => Neo_Pulse_App_Semrush_Table_Parse::num( $pick( array( 'ad', 'paid_keywords', 'adwords keywords', 'ads_keywords' ) ) ),
		);
	}

	/**
	 * @param string $csv
	 * @return array<int,array{domain:string,competitionLevel:?float,commonKeywords:?float,organicTraffic:?float,trafficCost:?float,organicKeywords:?float,adsKeywords:?float}>
	 */
	public static function extract_competitor_rows( string $csv ): array {
		$out  = array();
		$rows = Neo_Pulse_App_Semrush_Table_Parse::rows_from_csv_text( $csv );
		foreach ( $rows as $row ) {
			$n = self::normalize_competitor_row( $row );
			if ( $n !== null ) {
				$out[] = $n;
			}
		}
		return $out;
	}

	/**
	 * @param array<int,array{domain:string,commonKeywords:?float,organicTraffic:?float}> $rows
	 * @return string[]
	 */
	public static function domains_for_enrichment( array $rows, int $cap = self::DEFAULT_ENRICHMENT_CAP ): array {
		usort(
			$rows,
			static function ( $a, $b ) {
				$na = $a['commonKeywords'] ?? 0;
				$nb = $b['commonKeywords'] ?? 0;
				if ( $nb !== $na ) {
					return $nb <=> $na;
				}
				return ( $b['organicTraffic'] ?? 0 ) <=> ( $a['organicTraffic'] ?? 0 );
			}
		);
		$lim = min( max( 1, $cap ), count( $rows ) );
		$out = array();
		for ( $i = 0; $i < $lim; $i++ ) {
			$out[] = self::clean_domain_key( $rows[ $i ]['domain'] );
		}
		return $out;
	}

	/**
	 * @param array<int,array{phrase:string,volume:?float,traffic:?float,position:?float}> $top_keywords
	 */
	public static function build_domain_organic_csv( array $top_keywords, int $limit = self::DOMAIN_ORGANIC_CSV_TOP_ROWS ): string {
		$lim   = min( max( 1, $limit ), 100 );
		$lines = array( 'Keyword,Volume,Traffic,Position' );
		foreach ( array_slice( $top_keywords, 0, $lim ) as $k ) {
			$phrase = trim( (string) ( $k['phrase'] ?? '' ) );
			if ( $phrase === '' ) {
				continue;
			}
			$lines[] = implode(
				',',
				array(
					self::escape_csv_cell( $phrase ),
					self::escape_csv_cell( self::csv_metric_whole( $k['volume'] ?? null ) ),
					self::escape_csv_cell( self::csv_metric_whole( $k['traffic'] ?? null ) ),
					self::escape_csv_cell( self::csv_metric_whole( $k['position'] ?? null ) ),
				)
			);
		}
		return implode( "\n", $lines ) . "\n";
	}

	/**
	 * @param string $csv
	 * @return array<int,array{phrase:string,volume:?float,traffic:?float,position:?float}>
	 */
	public static function extract_top_keywords_from_csv( string $csv, int $limit = self::ENRICHMENT_DOMAIN_ORGANIC_LIMIT ): array {
		$rows = Neo_Pulse_App_Semrush_Table_Parse::rows_from_csv_text( $csv );
		$out  = array();
		$seen = array();
		foreach ( $rows as $row ) {
			$m = self::record_keys_lower( Neo_Pulse_App_Semrush_Table_Parse::record_keys_lower( $row ) );
			$phrase = self::phrase_from_keyword_row( $m );
			if ( $phrase === '' ) {
				continue;
			}
			$norm = strtolower( trim( $phrase ) );
			if ( isset( $seen[ $norm ] ) ) {
				continue;
			}
			$seen[ $norm ] = true;
			$out[] = array(
				'phrase'   => $phrase,
				'volume'   => self::volume_from_row( $m ),
				'traffic'  => self::traffic_from_row( $m ),
				'position' => Neo_Pulse_App_Semrush_Table_Parse::num( $m['po'] ?? $m['position'] ?? null ),
			);
			if ( count( $out ) >= $limit ) {
				break;
			}
		}
		return $out;
	}

	/**
	 * @param array<string,string> $m
	 */
	private static function phrase_from_keyword_row( array $m ): string {
		foreach ( array( 'ph', 'keyword', 'phrase', 'query' ) as $k ) {
			if ( ! empty( $m[ $k ] ) ) {
				return trim( (string) $m[ $k ] );
			}
		}
		return '';
	}

	/**
	 * @param array<string,string> $m
	 */
	private static function volume_from_row( array $m ): ?float {
		foreach ( array( 'nq', 'volume', 'search volume', 'sv' ) as $k ) {
			if ( isset( $m[ $k ] ) ) {
				$n = Neo_Pulse_App_Semrush_Table_Parse::num( $m[ $k ] );
				if ( $n !== null ) {
					return $n;
				}
			}
		}
		return null;
	}

	/**
	 * @param array<string,string> $m
	 */
	private static function traffic_from_row( array $m ): ?float {
		foreach ( array( 'tr', 'traffic', 'etv' ) as $k ) {
			if ( isset( $m[ $k ] ) ) {
				$n = Neo_Pulse_App_Semrush_Table_Parse::num( $m[ $k ] );
				if ( $n !== null ) {
					return $n;
				}
			}
		}
		return null;
	}

	/**
	 * @param array<string,string> $m
	 * @return array<string,string>
	 */
	private static function record_keys_lower( array $m ): array {
		return Neo_Pulse_App_Semrush_Table_Parse::record_keys_lower( $m );
	}

	private static function escape_csv_cell( string $cell ): string {
		if ( preg_match( '/[",\r\n]/', $cell ) ) {
			return '"' . str_replace( '"', '""', $cell ) . '"';
		}
		return $cell;
	}

	/**
	 * @param float|int|null $n
	 */
	private static function csv_metric_whole( $n ): string {
		if ( $n === null || ! is_finite( (float) $n ) ) {
			return '';
		}
		return (string) (int) round( (float) $n );
	}

	public static function resolve_database( $body_database, string $site_url, string $default = 'us' ): string {
		if ( is_string( $body_database ) && trim( $body_database ) !== '' ) {
			return trim( $body_database );
		}
		$from_site = Neo_Pulse_App_Semrush_Client::database_from_site_url( $site_url );
		return $from_site !== '' ? $from_site : $default;
	}
}
