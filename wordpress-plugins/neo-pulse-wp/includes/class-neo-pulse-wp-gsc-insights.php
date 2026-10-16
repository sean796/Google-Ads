<?php
/**
 * Search Console insights for the Insights → Search Console screen: totals with change against
 * the previous period, a daily trend, ranking bands, devices, countries, opportunities, and
 * winners and losers. One batch of parallel queries per range, cached for 15 minutes.
 *
 * @package Neo_Pulse_Wp
 */

defined( 'ABSPATH' ) || exit;

class Neo_Pulse_Wp_Gsc_Insights {

	const CACHE_PREFIX = 'neo_pulse_wp_gsc_ins_';
	const TTL          = 900;
	const QUERY_ROWS   = 5000; // Keyword rows fetched per period (the count shows "5,000+" when capped).
	const PAGE_ROWS    = 1000;

	/**
	 * Ranges offered on screen: key => [days, label].
	 *
	 * @return array<string,array{days:int,label:string}>
	 */
	public static function ranges(): array {
		return array(
			'7d'  => array( 'days' => 7, 'label' => __( '7 days', 'neo-pulse-wp' ) ),
			'28d' => array( 'days' => 28, 'label' => __( '28 days', 'neo-pulse-wp' ) ),
			'3m'  => array( 'days' => 91, 'label' => __( '3 months', 'neo-pulse-wp' ) ),
			'6m'  => array( 'days' => 182, 'label' => __( '6 months', 'neo-pulse-wp' ) ),
		);
	}

	public static function sanitize_range( $range ): string {
		$range = is_string( $range ) ? sanitize_key( $range ) : '';
		return isset( self::ranges()[ $range ] ) ? $range : '28d';
	}

	/**
	 * Current and previous period of equal length. Search Console data lags about 3 days.
	 *
	 * @return array{key:string,label:string,days:int,start:string,end:string,prevStart:string,prevEnd:string}
	 */
	public static function period( string $range ): array {
		$range = self::sanitize_range( $range );
		$days  = self::ranges()[ $range ]['days'];
		$end   = strtotime( gmdate( 'Y-m-d' ) . ' -3 days' );
		$start = strtotime( '-' . ( $days - 1 ) . ' days', $end );
		$p_end = strtotime( '-1 day', $start );
		$p_beg = strtotime( '-' . ( $days - 1 ) . ' days', $p_end );
		return array(
			'key'       => $range,
			'label'     => self::ranges()[ $range ]['label'],
			'days'      => $days,
			'start'     => gmdate( 'Y-m-d', $start ),
			'end'       => gmdate( 'Y-m-d', $end ),
			'prevStart' => gmdate( 'Y-m-d', $p_beg ),
			'prevEnd'   => gmdate( 'Y-m-d', $p_end ),
		);
	}

	/**
	 * Everything the Search Console screen shows for one range.
	 *
	 * @return array<string,mixed>|WP_Error
	 */
	public static function fetch( string $range ) {
		$period = self::period( $range );
		$host   = (string) wp_parse_url( Neo_Pulse_Wp_Api::get_site_url(), PHP_URL_HOST );
		$key    = self::CACHE_PREFIX . md5( strtolower( $host ) . '|' . wp_json_encode( $period ) . '|' . NEO_PULSE_WP_VERSION );
		$cached = get_transient( $key );
		if ( is_array( $cached ) ) {
			return $cached;
		}

		$connection = Neo_Pulse_Wp_Gsc::connected();
		if ( is_wp_error( $connection ) ) {
			return $connection;
		}
		$property = (string) $connection['property'];

		$cur  = array( 'startDate' => $period['start'], 'endDate' => $period['end'] );
		$prev = array( 'startDate' => $period['prevStart'], 'endDate' => $period['prevEnd'] );

		$raw = Neo_Pulse_Wp_Gsc::query_batch(
			$property,
			array(
				'daily'      => array( 'startDate' => $period['prevStart'], 'endDate' => $period['end'], 'dimensions' => array( 'date' ), 'rowLimit' => 1000 ),
				'queries'    => $cur + array( 'dimensions' => array( 'query' ), 'rowLimit' => self::QUERY_ROWS ),
				'queriesP'   => $prev + array( 'dimensions' => array( 'query' ), 'rowLimit' => self::QUERY_ROWS ),
				'pages'      => $cur + array( 'dimensions' => array( 'page' ), 'rowLimit' => self::PAGE_ROWS ),
				'pagesP'     => $prev + array( 'dimensions' => array( 'page' ), 'rowLimit' => self::PAGE_ROWS ),
				'queryPage'  => $cur + array( 'dimensions' => array( 'query', 'page' ), 'rowLimit' => self::QUERY_ROWS ),
				'devices'    => $cur + array( 'dimensions' => array( 'device' ) ),
				'countries'  => $cur + array( 'dimensions' => array( 'country' ), 'rowLimit' => 250 ),
			)
		);
		foreach ( $raw as $result ) {
			if ( is_wp_error( $result ) ) {
				return $result; // Not cached, so the next load tries again.
			}
		}

		$data = self::build( $period, $raw );
		$data['property'] = $property;
		$data['mode']     = isset( $connection['mode'] ) ? (string) $connection['mode'] : '';
		set_transient( $key, $data, self::TTL );
		return $data;
	}

	/**
	 * Turn raw Search Console rows into what the screen needs. Public for tests.
	 *
	 * @param array<string,mixed>              $period From period().
	 * @param array<string,array<string,mixed>> $raw    Results keyed as in fetch().
	 * @return array<string,mixed>
	 */
	public static function build( array $period, array $raw ): array {
		// Daily series for both periods, with every day present (Search Console skips empty days).
		$by_date = array();
		foreach ( self::rows( $raw['daily'] ?? array() ) as $row ) {
			$by_date[ $row['keys'][0] ] = $row;
		}
		$series = array( 'cur' => array(), 'prev' => array() );
		foreach ( array( 'cur' => array( $period['start'], $period['end'] ), 'prev' => array( $period['prevStart'], $period['prevEnd'] ) ) as $which => $span ) {
			for ( $t = strtotime( $span[0] ); $t <= strtotime( $span[1] ); $t += DAY_IN_SECONDS ) {
				$day = gmdate( 'Y-m-d', $t );
				$row = $by_date[ $day ] ?? array();
				$series[ $which ][] = array(
					'date'        => $day,
					'clicks'      => (int) ( $row['clicks'] ?? 0 ),
					'impressions' => (int) ( $row['impressions'] ?? 0 ),
					'position'    => (float) ( $row['position'] ?? 0 ),
				);
			}
		}

		$queries   = self::metric_rows( $raw['queries'] ?? array() );
		$queries_p = self::metric_rows( $raw['queriesP'] ?? array() );
		$pages     = self::metric_rows( $raw['pages'] ?? array() );
		$pages_p   = self::metric_rows( $raw['pagesP'] ?? array() );

		$totals = array(
			'cur'  => self::totals( $series['cur'] ),
			'prev' => self::totals( $series['prev'] ),
		);
		$totals['cur']['keywords']  = count( $queries );
		$totals['prev']['keywords'] = count( $queries_p );

		return array(
			'period'        => $period,
			'totals'        => $totals,
			'keywordsCapped'=> count( $queries ) >= self::QUERY_ROWS,
			'series'        => $series,
			'bands'         => self::bands( $queries ),
			'devices'       => self::shares( self::metric_rows( $raw['devices'] ?? array() ) ),
			'countries'     => array_slice( self::shares( self::metric_rows( $raw['countries'] ?? array() ) ), 0, 8 ),
			'topQueries'    => self::with_change( array_slice( self::sort_by( $queries, 'clicks', 'impressions' ), 0, 50 ), $queries_p ),
			'topPages'      => self::with_change( array_slice( self::sort_by( $pages, 'clicks', 'impressions' ), 0, 50 ), $pages_p ),
			'nearPageOne'   => self::near_page_one( $queries, self::best_pages( $raw['queryPage'] ?? array() ) ),
			'lowCtrPages'   => self::low_ctr_pages( $pages, $totals['cur'] ),
			'movers'        => array(
				'queries' => self::movers( $queries, $queries_p ),
				'pages'   => self::movers( $pages, $pages_p ),
			),
		);
	}

	/* ---------- Helpers ---------- */

	/**
	 * @return array<int,array<string,mixed>>
	 */
	private static function rows( $result ): array {
		return is_array( $result ) && ! empty( $result['rows'] ) && is_array( $result['rows'] ) ? $result['rows'] : array();
	}

	/**
	 * Rows keyed by their first dimension value.
	 *
	 * @return array<string,array{key:string,clicks:int,impressions:int,ctr:float,position:float}>
	 */
	private static function metric_rows( $result ): array {
		$out = array();
		foreach ( self::rows( $result ) as $row ) {
			if ( empty( $row['keys'][0] ) ) {
				continue;
			}
			$key         = (string) $row['keys'][0];
			$out[ $key ] = array(
				'key'         => $key,
				'clicks'      => (int) ( $row['clicks'] ?? 0 ),
				'impressions' => (int) ( $row['impressions'] ?? 0 ),
				'ctr'         => (float) ( $row['ctr'] ?? 0 ),
				'position'    => round( (float) ( $row['position'] ?? 0 ), 1 ),
			);
		}
		return $out;
	}

	/**
	 * Sum a daily series. Position is the impression-weighted average, as Search Console reports it.
	 *
	 * @param array<int,array<string,mixed>> $days
	 * @return array{clicks:int,impressions:int,ctr:float,position:float}
	 */
	private static function totals( array $days ): array {
		$clicks = 0;
		$impr   = 0;
		$pos_w  = 0.0;
		foreach ( $days as $day ) {
			$clicks += $day['clicks'];
			$impr   += $day['impressions'];
			$pos_w  += $day['position'] * $day['impressions'];
		}
		return array(
			'clicks'      => $clicks,
			'impressions' => $impr,
			'ctr'         => $impr > 0 ? $clicks / $impr : 0.0,
			'position'    => $impr > 0 ? round( $pos_w / $impr, 1 ) : 0.0,
		);
	}

	private static function sort_by( array $rows, string $field, string $then = '' ): array {
		uasort(
			$rows,
			static function ( $a, $b ) use ( $field, $then ) {
				$cmp = $b[ $field ] <=> $a[ $field ];
				return 0 === $cmp && '' !== $then ? $b[ $then ] <=> $a[ $then ] : $cmp;
			}
		);
		return $rows;
	}

	/**
	 * Add the previous period's clicks and position to each row.
	 */
	private static function with_change( array $rows, array $previous ): array {
		$out = array();
		foreach ( $rows as $key => $row ) {
			$row['prevClicks']   = isset( $previous[ $key ] ) ? $previous[ $key ]['clicks'] : null;
			$row['prevPosition'] = isset( $previous[ $key ] ) ? $previous[ $key ]['position'] : null;
			$out[]               = $row;
		}
		return $out;
	}

	/**
	 * Keyword counts by ranking band.
	 *
	 * @return array<int,array{label:string,count:int}>
	 */
	private static function bands( array $queries ): array {
		$bands = array(
			array( 'label' => __( 'Top 3', 'neo-pulse-wp' ), 'max' => 3.49, 'count' => 0 ),
			array( 'label' => __( '4–10', 'neo-pulse-wp' ), 'max' => 10.49, 'count' => 0 ),
			array( 'label' => __( '11–20', 'neo-pulse-wp' ), 'max' => 20.49, 'count' => 0 ),
			array( 'label' => __( '21–50', 'neo-pulse-wp' ), 'max' => 50.49, 'count' => 0 ),
			array( 'label' => __( '51+', 'neo-pulse-wp' ), 'max' => INF, 'count' => 0 ),
		);
		foreach ( $queries as $row ) {
			foreach ( $bands as $i => $band ) {
				if ( $row['position'] <= $band['max'] ) {
					++$bands[ $i ]['count'];
					break;
				}
			}
		}
		return array_map(
			static function ( $band ) {
				return array( 'label' => $band['label'], 'count' => $band['count'] );
			},
			$bands
		);
	}

	/**
	 * Share of clicks per row (devices, countries), most clicks first.
	 */
	private static function shares( array $rows ): array {
		$total = array_sum( array_column( $rows, 'clicks' ) );
		$out   = array();
		foreach ( self::sort_by( $rows, 'clicks', 'impressions' ) as $row ) {
			$row['share'] = $total > 0 ? $row['clicks'] / $total : 0.0;
			$out[]        = $row;
		}
		return $out;
	}

	/**
	 * The page that gets the most impressions for each keyword.
	 *
	 * @return array<string,string>
	 */
	private static function best_pages( $result ): array {
		$best = array();
		$seen = array();
		foreach ( self::rows( $result ) as $row ) {
			if ( empty( $row['keys'][0] ) || empty( $row['keys'][1] ) ) {
				continue;
			}
			$q    = (string) $row['keys'][0];
			$impr = (int) ( $row['impressions'] ?? 0 );
			if ( ! isset( $seen[ $q ] ) || $impr > $seen[ $q ] ) {
				$seen[ $q ] = $impr;
				$best[ $q ] = (string) $row['keys'][1];
			}
		}
		return $best;
	}

	/**
	 * Keywords at positions 8–20 with the most impressions: the quickest wins.
	 */
	private static function near_page_one( array $queries, array $best_pages ): array {
		$out = array();
		foreach ( $queries as $key => $row ) {
			if ( $row['position'] >= 8 && $row['position'] <= 20 && $row['impressions'] >= 10 ) {
				$row['page'] = $best_pages[ $key ] ?? '';
				$out[]       = $row;
			}
		}
		return array_slice( self::sort_by( $out, 'impressions', 'clicks' ), 0, 25 );
	}

	/**
	 * Pages seen often in search but rarely clicked: well under the site's own click-through rate.
	 */
	private static function low_ctr_pages( array $pages, array $totals ): array {
		$site_ctr = (float) $totals['ctr'];
		$min_impr = max( 100, (int) round( $totals['impressions'] * 0.002 ) );
		$out      = array();
		foreach ( $pages as $row ) {
			if ( $row['impressions'] >= $min_impr && $row['position'] <= 20 && $row['ctr'] < $site_ctr * 0.5 ) {
				$row['missed'] = (int) round( $row['impressions'] * $site_ctr ) - $row['clicks'];
				$out[]         = $row;
			}
		}
		return array_slice( self::sort_by( $out, 'missed', 'impressions' ), 0, 15 );
	}

	/**
	 * Biggest gains and drops in clicks against the previous period.
	 *
	 * @return array{up:array,down:array}
	 */
	private static function movers( array $current, array $previous ): array {
		$changes = array();
		foreach ( array_unique( array_merge( array_keys( $current ), array_keys( $previous ) ) ) as $key ) {
			$now  = $current[ $key ]['clicks'] ?? 0;
			$then = $previous[ $key ]['clicks'] ?? 0;
			if ( $now === $then ) {
				continue;
			}
			$changes[] = array(
				'key'          => (string) $key,
				'clicks'       => $now,
				'prevClicks'   => $then,
				'change'       => $now - $then,
				'position'     => $current[ $key ]['position'] ?? null,
				'prevPosition' => $previous[ $key ]['position'] ?? null,
			);
		}
		$up = array_values(
			array_filter(
				$changes,
				static function ( $c ) {
					return $c['change'] > 0;
				}
			)
		);
		$down = array_values(
			array_filter(
				$changes,
				static function ( $c ) {
					return $c['change'] < 0;
				}
			)
		);
		usort(
			$up,
			static function ( $a, $b ) {
				return $b['change'] <=> $a['change'];
			}
		);
		usort(
			$down,
			static function ( $a, $b ) {
				return $a['change'] <=> $b['change'];
			}
		);
		return array(
			'up'   => array_slice( $up, 0, 10 ),
			'down' => array_slice( $down, 0, 10 ),
		);
	}

	/**
	 * Post edit link for a page URL on this site, or '' when it is not a post or page here.
	 */
	public static function edit_link( string $url ): string {
		if ( '' === $url || ! current_user_can( 'edit_posts' ) ) {
			return '';
		}
		// Search Console reports the live address; map it onto this site (e.g. on staging).
		$path    = (string) wp_parse_url( $url, PHP_URL_PATH );
		$post_id = url_to_postid( home_url( '' !== $path ? $path : '/' ) );
		if ( ! $post_id && '/' === untrailingslashit( $path ) . '/' ) {
			$post_id = (int) get_option( 'page_on_front' );
		}
		if ( ! $post_id || ! current_user_can( 'edit_post', $post_id ) ) {
			return '';
		}
		return (string) get_edit_post_link( $post_id, 'raw' );
	}

	/**
	 * Country name for Search Console's three-letter code.
	 */
	public static function country_name( string $code ): string {
		$names = array(
			'can' => 'Canada', 'usa' => 'United States', 'gbr' => 'United Kingdom', 'aus' => 'Australia', 'ind' => 'India',
			'phl' => 'Philippines', 'deu' => 'Germany', 'fra' => 'France', 'mex' => 'Mexico', 'bra' => 'Brazil',
			'nzl' => 'New Zealand', 'irl' => 'Ireland', 'pak' => 'Pakistan', 'nga' => 'Nigeria', 'zaf' => 'South Africa',
			'chn' => 'China', 'jpn' => 'Japan', 'kor' => 'South Korea', 'esp' => 'Spain', 'ita' => 'Italy',
			'nld' => 'Netherlands', 'bel' => 'Belgium', 'che' => 'Switzerland', 'swe' => 'Sweden', 'nor' => 'Norway',
			'dnk' => 'Denmark', 'pol' => 'Poland', 'tur' => 'Turkey', 'are' => 'United Arab Emirates', 'sau' => 'Saudi Arabia',
			'sgp' => 'Singapore', 'mys' => 'Malaysia', 'idn' => 'Indonesia', 'vnm' => 'Vietnam', 'bgd' => 'Bangladesh',
			'egy' => 'Egypt', 'ken' => 'Kenya', 'arg' => 'Argentina', 'col' => 'Colombia', 'chl' => 'Chile',
			'per' => 'Peru', 'rus' => 'Russia', 'ukr' => 'Ukraine', 'isr' => 'Israel', 'grc' => 'Greece',
			'prt' => 'Portugal', 'aut' => 'Austria', 'fin' => 'Finland', 'hkg' => 'Hong Kong', 'twn' => 'Taiwan',
			'xkx' => 'Kosovo', 'jam' => 'Jamaica', 'tto' => 'Trinidad and Tobago', 'cri' => 'Costa Rica', 'dom' => 'Dominican Republic',
		);
		$code = strtolower( $code );
		return $names[ $code ] ?? strtoupper( $code );
	}
}
