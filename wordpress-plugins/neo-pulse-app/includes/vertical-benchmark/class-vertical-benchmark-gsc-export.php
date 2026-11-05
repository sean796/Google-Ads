<?php
/**
 * GSC top-10 export rows for vertical benchmark (NDJSON stream).
 *
 * @package Neo_Pulse_App
 */

defined( 'ABSPATH' ) || exit;

class Neo_Pulse_App_Vertical_Benchmark_Gsc_Export {

	const TOP_N            = 10;
	const GSC_PAGE_LIMIT   = 100;
	const GSC_LOOKBACK_DAYS = 90;
	const GSC_EXTENDED_N   = 30;

	/**
	 * @return array{startDate:string,endDate:string}
	 */
	public static function date_range_90d(): array {
		$end = new DateTime( 'now', new DateTimeZone( 'UTC' ) );
		$end->modify( '-3 days' );
		$end->setTime( 0, 0, 0 );
		$start = clone $end;
		$start->modify( '-' . self::GSC_LOOKBACK_DAYS . ' days' );
		return array(
			'startDate' => $start->format( 'Y-m-d' ),
			'endDate'   => $end->format( 'Y-m-d' ),
		);
	}

	/**
	 * @param array<int,array<string,mixed>> $sites
	 * @param array<string,mixed>            $opts
	 * @return array{rows:array,extendedRows:array,results:array,dateRange:array}
	 */
	public static function export_rows( array $sites, array $opts = array() ): array {
		$range = self::date_range_90d();
		$tag_map       = isset( $opts['clientTagBySiteId'] ) && is_array( $opts['clientTagBySiteId'] ) ? $opts['clientTagBySiteId'] : array();
		$tag_label_map = isset( $opts['clientTagLabelBySiteId'] ) && is_array( $opts['clientTagLabelBySiteId'] ) ? $opts['clientTagLabelBySiteId'] : array();
		$content_kinds = isset( $opts['contentKinds'] ) && is_array( $opts['contentKinds'] ) ? $opts['contentKinds'] : array( 'post', 'entity' );

		$rows          = array();
		$extended_rows = array();
		$results       = array();
		$done          = 0;
		$total         = count( $sites );

		foreach ( $sites as $site ) {
			$site_id = (string) ( $site['id'] ?? '' );
			if ( is_callable( $opts['onProgress'] ?? null ) ) {
				call_user_func( $opts['onProgress'], array( 'done' => $done, 'total' => $total, 'siteId' => $site_id ) );
			}
			try {
				$r = self::collect_site_rows(
					$site,
					array(
						'startDate'     => $range['startDate'],
						'endDate'       => $range['endDate'],
						'apiKey'        => $opts['apiKey'] ?? '',
						'model'         => $opts['model'] ?? '',
						'contentKinds'  => $content_kinds,
						'clientTag'     => $tag_map[ $site_id ] ?? '',
						'clientTagLabel'=> $tag_label_map[ $site_id ] ?? '',
					)
				);
			} catch ( Exception $e ) {
				$r = array(
					'siteId'  => $site_id,
					'skipped' => true,
					'reason'  => $e->getMessage(),
				);
			}

			$done++;
			if ( is_callable( $opts['onProgress'] ?? null ) ) {
				call_user_func( $opts['onProgress'], array( 'done' => $done, 'total' => $total, 'siteId' => $r['siteId'] ?? $site_id ) );
			}

			$row_count = isset( $r['rows'] ) && is_array( $r['rows'] ) ? count( $r['rows'] ) : 0;
			$results[] = array(
				'siteId'   => $r['siteId'] ?? $site_id,
				'skipped'  => ! empty( $r['skipped'] ) || $row_count === 0,
				'reason'   => $r['reason'] ?? ( $row_count === 0 ? 'no rows' : null ),
				'summary'  => $r['summary'] ?? null,
				'rowCount' => $row_count,
			);
			if ( $row_count > 0 ) {
				$rows = array_merge( $rows, $r['rows'] );
			}
			if ( ! empty( $r['extendedRows'] ) && is_array( $r['extendedRows'] ) ) {
				$extended_rows = array_merge( $extended_rows, $r['extendedRows'] );
			}
		}

		Neo_Pulse_App_Json_File_Store::write(
			Neo_Pulse_App_Data_Paths::vertical_benchmark_export_path(),
			array(
				'rows'          => $rows,
				'extendedRows'  => $extended_rows,
				'results'       => $results,
				'dateRange'     => $range,
				'exportedAt'    => gmdate( 'c' ),
			)
		);

		return array(
			'rows'          => $rows,
			'extendedRows'  => $extended_rows,
			'results'       => $results,
			'dateRange'     => $range,
		);
	}

	/**
	 * @param array<string,mixed> $site
	 * @param array<string,mixed> $opts
	 * @return array<string,mixed>
	 */
	private static function collect_site_rows( array $site, array $opts ): array {
		$site_id  = trim( (string) ( $site['id'] ?? '' ) );
		$site_url = trim( (string) ( $site['productionSiteUrl'] ?? $site['siteUrl'] ?? '' ) );
		if ( $site_id === '' || $site_url === '' ) {
			return array( 'siteId' => $site_id, 'skipped' => true, 'reason' => 'missing site id or url' );
		}

		$kinds = array_values(
			array_filter(
				$opts['contentKinds'] ?? array( 'post', 'entity' ),
				static function ( $k ) {
					return $k === 'post' || $k === 'entity';
				}
			)
		);
		if ( empty( $kinds ) ) {
			$kinds = array( 'post', 'entity' );
		}

		$custom = Neo_Pulse_App_Vertical_Benchmark_Client_Tag::resolve_custom( $site );
		$client_tag_label = $opts['clientTagLabel'] ?: ( $custom['clientTagLabel'] ?? Neo_Pulse_App_Vertical_Benchmark_Taxonomy::label( (string) ( $site['industryVertical'] ?? 'uncategorized' ) ) );
		$client_tag       = $opts['clientTag'] ?: ( $custom['clientTagLabel'] ?? $client_tag_label );

		$gsc = Neo_Pulse_App_Gsc_Performance_Batch::top_pages(
			array(
				'siteUrl'   => $site_url,
				'startDate' => $opts['startDate'],
				'endDate'   => $opts['endDate'],
				'limit'     => self::GSC_PAGE_LIMIT,
			)
		);
		if ( ( $gsc['statusCode'] ?? 500 ) !== 200 || empty( $gsc['body']['success'] ) ) {
			return array(
				'siteId'  => $site_id,
				'skipped' => true,
				'reason'  => (string) ( $gsc['body']['error'] ?? 'GSC fetch failed' ),
			);
		}

		$gsc_pages = $gsc['body']['pages'] ?? array();
		$sets      = Neo_Pulse_App_Vertical_Benchmark_Sitemap_Urls::resolve_url_sets( $site );

		$unknown = array();
		foreach ( $gsc_pages as $p ) {
			$url = trim( (string) ( $p['url'] ?? '' ) );
			if ( $url === '' ) {
				continue;
			}
			if ( Neo_Pulse_App_Vertical_Benchmark_Sitemap_Urls::classify_url_by_sitemap( $url, $sets['postPaths'], $sets['entityPaths'] ) === 'unknown' ) {
				$unknown[] = array( 'url' => $url );
			}
		}

		$gemini_kinds = self::classify_unknown_urls_with_gemini( $unknown, $site, $opts );

		$rows          = array();
		$extended_rows = array();
		$summary       = array( 'post' => 0, 'entity' => 0 );
		$site_name     = (string) ( $site['name'] ?? $site_id );

		foreach ( $kinds as $kind ) {
			$ranked = self::bucket_gsc_pages( $gsc_pages, $kind, $sets['postPaths'], $sets['entityPaths'], $gemini_kinds, self::GSC_EXTENDED_N );
			if ( empty( $ranked ) && ! empty( $gsc_pages ) ) {
				$ranked = self::take_top_n( self::fallback_raw_top_gsc_pages( $gsc_pages, $kind ), self::GSC_EXTENDED_N );
			}
			$top      = array_slice( $ranked, 0, self::TOP_N );
			$extended = array_slice( $ranked, self::TOP_N );
			$push     = static function ( $row, $rank, &$bucket ) use ( $site_id, $site_name, $site_url, $client_tag_label, $kind, $opts ) {
				$bucket[] = array(
					'site_id'        => $site_id,
					'site_name'      => $site_name,
					'site_url'       => $site_url,
					'client_tag'     => $client_tag_label,
					'content_kind'   => $kind,
					'rank'           => $rank,
					'url'            => $row['url'],
					'clicks'         => $row['clicks'],
					'impressions'    => $row['impressions'],
					'position'       => $row['position'],
					'gsc_start_date' => $opts['startDate'],
					'gsc_end_date'   => $opts['endDate'],
				);
			};
			foreach ( $top as $idx => $row ) {
				$push( $row, $idx + 1, $rows );
			}
			foreach ( $extended as $idx => $row ) {
				$push( $row, self::TOP_N + $idx + 1, $extended_rows );
			}
			$summary[ $kind ] = count( $top );
		}

		if ( empty( $rows ) ) {
			return array(
				'siteId'  => $site_id,
				'skipped' => true,
				'reason'  => ! empty( $gsc_pages ) ? 'no pages matched post/entity filter' : 'no GSC pages in range',
				'summary' => $summary,
			);
		}

		return array(
			'siteId'       => $site_id,
			'skipped'      => false,
			'rows'         => $rows,
			'extendedRows' => $extended_rows,
			'summary'      => $summary,
		);
	}

	/**
	 * @param array<int,array{url:string}>   $unknown_urls
	 * @param array<string,mixed>            $site
	 * @param array<string,mixed>            $opts
	 * @return array<string,string>
	 */
	private static function classify_unknown_urls_with_gemini( array $unknown_urls, array $site, array $opts ): array {
		$map = array();
		if ( empty( $unknown_urls ) ) {
			return $map;
		}
		$list = array_slice( array_map( static fn( $u ) => $u['url'], $unknown_urls ), 0, 40 );
		try {
			$system = 'You label URLs for a local SEO portfolio. Reply with JSON only: { "assignments": [ { "url": "<exact url>", "kind": "post" | "entity" | "exclude" } ] }
post = blog/article content. entity = service area / location landing pages. exclude = homepage, category archives, contact, shop, or non-content URLs.';
			$user = 'Site: ' . ( $site['name'] ?? '' ) . ' (' . ( $site['siteUrl'] ?? '' ) . ")\nEntity sitemap hint: " . ( $site['entitySitemapUrl'] ?? '(none)' ) . "\n\nURLs:\n";
			foreach ( $list as $i => $u ) {
				$user .= ( $i + 1 ) . '. ' . $u . "\n";
			}
			$parsed = Neo_Pulse_App_Vertical_Benchmark_Openrouter::json_completion(
				array(
					array( 'role' => 'system', 'content' => $system ),
					array( 'role' => 'user', 'content' => $user ),
				),
				array(
					'apiKey'    => $opts['apiKey'] ?? '',
					'model'     => $opts['model'] ?? '',
					'maxTokens' => 2048,
				)
			);
			foreach ( ( $parsed['assignments'] ?? array() ) as $row ) {
				if ( is_array( $row ) && ! empty( $row['url'] ) && ! empty( $row['kind'] ) ) {
					$map[ (string) $row['url'] ] = (string) $row['kind'];
				}
			}
		} catch ( Exception $e ) {
			unset( $e );
		}
		return $map;
	}

	/**
	 * @param array<int,array<string,mixed>> $gsc_pages
	 * @param array<string,bool>             $post_paths
	 * @param array<string,bool>             $entity_paths
	 * @param array<string,string>           $gemini_kinds
	 * @return array<int,array<string,mixed>>
	 */
	private static function bucket_gsc_pages( array $gsc_pages, string $kind, array $post_paths, array $entity_paths, array $gemini_kinds, int $max_n ): array {
		$out = array();
		foreach ( $gsc_pages as $p ) {
			$url = trim( (string) ( $p['url'] ?? '' ) );
			if ( $url === '' ) {
				continue;
			}
			$label = Neo_Pulse_App_Vertical_Benchmark_Sitemap_Urls::classify_url_by_sitemap( $url, $post_paths, $entity_paths );
			if ( $label === 'unknown' ) {
				$label = $gemini_kinds[ $url ] ?? 'exclude';
			}
			if ( $label !== $kind ) {
				continue;
			}
			$out[] = array(
				'url'         => $url,
				'clicks'      => (int) ( $p['clicks'] ?? 0 ),
				'impressions' => (int) ( $p['impressions'] ?? 0 ),
				'position'    => (float) ( $p['position'] ?? 0 ),
				'contentKind' => $kind,
			);
		}
		return self::take_top_n( $out, $max_n );
	}

	/** @param array<int,array<string,mixed>> $gsc_pages @return array<int,array<string,mixed>> */
	private static function fallback_raw_top_gsc_pages( array $gsc_pages, string $kind ): array {
		$out = array();
		foreach ( $gsc_pages as $p ) {
			$url = trim( (string) ( $p['url'] ?? '' ) );
			if ( $url === '' ) {
				continue;
			}
			$out[] = array(
				'url'         => $url,
				'clicks'      => (int) ( $p['clicks'] ?? 0 ),
				'impressions' => (int) ( $p['impressions'] ?? 0 ),
				'position'    => (float) ( $p['position'] ?? 0 ),
				'contentKind' => $kind,
			);
		}
		return self::take_top_n( $out, self::TOP_N );
	}

	/** @param array<int,array<string,mixed>> $pages */
	private static function take_top_n( array $pages, int $n ): array {
		usort(
			$pages,
			static function ( $a, $b ) {
				$click_diff = ( $b['clicks'] ?? 0 ) - ( $a['clicks'] ?? 0 );
				if ( $click_diff !== 0 ) {
					return $click_diff;
				}
				return ( $b['impressions'] ?? 0 ) - ( $a['impressions'] ?? 0 );
			}
		);
		return array_slice( $pages, 0, $n );
	}
}
