<?php
/**
 * Platform inventory resolution (hint vs audit tiers).
 *
 * Issue-tag parity with Neo_Pulse_Wp_Backend_Assist_Tools_Analytics::tool_grade_post_library_seo.
 *
 * @package Neo_Pulse_App
 */

defined( 'ABSPATH' ) || exit;

class Neo_Pulse_App_Platform_Inventory {

	const TIER_HINT  = 'hint';
	const TIER_AUDIT = 'audit';

	/** @var array<string,array{rows:array<int,array<string,mixed>>,source:string,acfComplete:bool}>|null */
	private static $resolve_cache = null;

	/**
	 * @param array<string,mixed> $body
	 * @param array<string,mixed> $options tier (hint|audit), collections (string[])
	 * @return array{rows:array<int,array<string,mixed>>,source:string,acfComplete:bool}
	 */
	public static function resolve_rows( array $body, array $options ): array {
		$tier        = ! empty( $options['tier'] ) ? sanitize_key( (string) $options['tier'] ) : self::TIER_HINT;
		$collections = isset( $options['collections'] ) && is_array( $options['collections'] )
			? array_values( array_unique( array_map( 'sanitize_key', $options['collections'] ) ) )
			: array( 'posts', 'pages' );
		sort( $collections );

		$cache_key = md5( $tier . '|' . self::cache_site_key( $body ) . '|' . implode( ',', $collections ) );
		if ( is_array( self::$resolve_cache ) && isset( self::$resolve_cache[ $cache_key ] ) ) {
			return self::$resolve_cache[ $cache_key ];
		}

		$empty = array(
			'rows'         => array(),
			'source'       => 'none',
			'acfComplete'  => false,
		);

		if ( $tier === self::TIER_AUDIT ) {
			$result = self::resolve_audit_tier( $body, $collections );
		} else {
			$result = self::resolve_hint_tier( $body, $collections );
		}

		if ( ! is_array( self::$resolve_cache ) ) {
			self::$resolve_cache = array();
		}
		self::$resolve_cache[ $cache_key ] = $result;
		return $result;
	}

	public static function clear_request_cache(): void {
		self::$resolve_cache = null;
	}

	/**
	 * @param array<string,mixed> $body
	 * @param array<int,string>   $collections
	 * @return array{rows:array<int,array<string,mixed>>,source:string,acfComplete:bool}
	 */
	private static function resolve_audit_tier( array $body, array $collections ): array {
		$session = self::session_audit_rows( $body );
		if ( count( $session ) > 0 && self::session_rows_acf_complete( $session ) ) {
			$rows = self::filter_by_collection( $session, $collections );
			return array(
				'rows'        => $rows,
				'source'      => 'session',
				'acfComplete' => true,
			);
		}

		$bulk = self::fetch_bulk_rows( $body, $collections, true );
		if ( count( $bulk ) === 0 ) {
			return array(
				'rows'        => array(),
				'source'      => 'none',
				'acfComplete' => false,
			);
		}

		return array(
			'rows'        => $bulk,
			'source'      => 'bulk',
			'acfComplete' => true,
		);
	}

	/**
	 * @param array<string,mixed> $body
	 * @param array<int,string>   $collections
	 * @return array{rows:array<int,array<string,mixed>>,source:string,acfComplete:bool}
	 */
	private static function resolve_hint_tier( array $body, array $collections ): array {
		$session = self::session_inventory_rows( $body );
		if ( count( $session ) > 0 ) {
			return array(
				'rows'        => self::filter_by_collection( $session, $collections ),
				'source'      => 'session',
				'acfComplete' => ! empty( $body['site_inventory_context']['auditReady'] ),
			);
		}

		$bulk = self::fetch_bulk_rows( $body, $collections, false );
		return array(
			'rows'        => $bulk,
			'source'      => count( $bulk ) > 0 ? 'bulk' : 'none',
			'acfComplete' => false,
		);
	}

	/**
	 * @param array<string,mixed> $body
	 * @param array<int,string>   $collections
	 * @param bool                $include_acf
	 * @return array<int,array<string,mixed>>
	 */
	private static function fetch_bulk_rows( array $body, array $collections, bool $include_acf ): array {
		if ( ! self::inventory_configured( $body ) ) {
			return array();
		}

		$request = array_merge(
			$body,
			array( 'collections' => $collections )
		);
		if ( $include_acf ) {
			$request['includeRawPostFields'] = true;
		}

		list( $status, $data ) = Neo_Pulse_App_Wp_Posts_Inventory::get_site_inventory_bulk( $request );
		if ( $status < 200 || $status >= 300 || ! is_array( $data ) ) {
			return array();
		}

		$raw  = isset( $data['rows'] ) && is_array( $data['rows'] ) ? $data['rows'] : array();
		$rows = array();
		foreach ( $raw as $row ) {
			if ( ! is_array( $row ) ) {
				continue;
			}
			$rows[] = self::normalize_audit_row( $row );
		}
		return $rows;
	}

	/**
	 * @param array<string,mixed> $body
	 * @return array<int,array<string,mixed>>
	 */
	private static function session_audit_rows( array $body ): array {
		$ctx = isset( $body['site_inventory_context'] ) && is_array( $body['site_inventory_context'] )
			? $body['site_inventory_context']
			: array();
		if ( empty( $ctx['auditReady'] ) || empty( $ctx['rows'] ) || ! is_array( $ctx['rows'] ) ) {
			return array();
		}
		if ( ! self::session_site_matches( $body, $ctx ) ) {
			return array();
		}

		$rows = array();
		foreach ( $ctx['rows'] as $row ) {
			if ( ! is_array( $row ) ) {
				continue;
			}
			$rows[] = self::normalize_audit_row( $row, true );
		}
		return $rows;
	}

	/**
	 * @param array<string,mixed> $body
	 * @return array<int,array<string,mixed>>
	 */
	private static function session_inventory_rows( array $body ): array {
		$ctx = isset( $body['site_inventory_context'] ) && is_array( $body['site_inventory_context'] )
			? $body['site_inventory_context']
			: array();
		if ( empty( $ctx['rows'] ) || ! is_array( $ctx['rows'] ) ) {
			return array();
		}
		if ( ! self::session_site_matches( $body, $ctx ) ) {
			return array();
		}

		$rows = array();
		foreach ( $ctx['rows'] as $row ) {
			if ( ! is_array( $row ) ) {
				continue;
			}
			$rows[] = self::normalize_audit_row( $row, true );
		}
		return $rows;
	}

	/**
	 * @param array<string,mixed> $body
	 * @param array<string,mixed> $ctx
	 */
	private static function session_site_matches( array $body, array $ctx ): bool {
		$pulse_ctx = isset( $body['pulse_context'] ) && is_array( $body['pulse_context'] ) ? $body['pulse_context'] : array();
		$active_id = isset( $pulse_ctx['siteId'] ) ? sanitize_text_field( (string) $pulse_ctx['siteId'] ) : '';
		$ctx_id    = isset( $ctx['siteId'] ) ? sanitize_text_field( (string) $ctx['siteId'] ) : '';
		return $active_id === '' || $ctx_id === '' || $active_id === $ctx_id;
	}

	/**
	 * @param array<int,array<string,mixed>> $rows
	 */
	private static function session_rows_acf_complete( array $rows ): bool {
		foreach ( $rows as $row ) {
			if ( empty( $row['acf_loaded'] ) ) {
				return false;
			}
		}
		return count( $rows ) > 0;
	}

	/**
	 * @param array<string,mixed> $row
	 * @param bool                $from_session
	 * @return array<string,mixed>
	 */
	public static function normalize_audit_row( array $row, bool $from_session = false ): array {
		$fields = isset( $row['fields'] ) && is_array( $row['fields'] ) ? $row['fields'] : array();
		$acf    = isset( $row['acf'] ) && is_array( $row['acf'] ) ? $row['acf'] : array();

		$title = trim( (string) ( $from_session ? ( $row['title'] ?? '' ) : ( $fields['title'] ?? '' ) ) );
		$url   = (string) ( $row['url'] ?? '' );
		$type  = sanitize_key( (string) ( $row['collection'] ?? $row['type'] ?? 'post' ) );
		$keyword = trim(
			(string) (
				$from_session
					? ( $row['keyword'] ?? $row['focus_keyword'] ?? '' )
					: ( $fields['keyword'] ?? ( $acf['keyword_focus'] ?? '' ) )
			)
		);
		$excerpt = trim( (string) ( $from_session ? ( $row['excerpt'] ?? '' ) : ( $fields['excerpt'] ?? '' ) ) );
		$meta    = trim( (string) ( $from_session ? ( $row['meta'] ?? '' ) : ( $fields['meta'] ?? '' ) ) );

		$acf_loaded = $from_session
			? ! empty( $row['acf_loaded'] )
			: ( count( $acf ) > 0 );

		$has_seo_research = false;
		$has_faq          = false;
		if ( $from_session ) {
			$has_seo_research = ! empty( $row['has_seo_research'] );
			$has_faq          = ! empty( $row['has_faq'] );
		} else {
			$has_seo_research = self::has_substantive_seo_research( $acf );
			$has_faq          = trim( (string) ( $acf['faq'] ?? '' ) ) !== '';
		}

		$has_featured_image = $from_session
			? ! empty( $row['has_featured_image'] )
			: (int) ( $row['featuredMediaId'] ?? 0 ) > 0;

		return array(
			'title'              => $title,
			'url'                => $url,
			'type'               => $type,
			'status'             => sanitize_key( (string) ( $row['status'] ?? 'publish' ) ),
			'date_gmt'           => (string) ( $row['date_gmt'] ?? '' ),
			'focus_keyword'      => $keyword,
			'excerpt'            => $excerpt,
			'meta'               => $meta,
			'acf_loaded'         => $acf_loaded,
			'has_seo_research'   => $has_seo_research,
			'has_faq'            => $has_faq,
			'has_featured_image' => $has_featured_image,
			'id'                 => (int) ( $row['id'] ?? 0 ),
			'slug'               => (string) ( $row['slug'] ?? '' ),
			'content'            => $from_session ? '' : trim( (string) ( $fields['content'] ?? '' ) ),
			'faq'                => $from_session ? '' : trim( (string) ( $acf['faq'] ?? '' ) ),
			'seo_research'       => $from_session ? '' : self::truncate_text( (string) ( $acf['seo_research'] ?? '' ), 4000 ),
		);
	}

	/**
	 * Bulk fetch for sub-agent paths (always bulk + ACF + content).
	 *
	 * @param array<string,mixed> $body
	 * @param array<string,mixed> $options collections, limit, sort, post_type, url, includeIds
	 * @return array{rows:array<int,array<string,mixed>>,source:string,acfComplete:bool}
	 */
	public static function resolve_for_subagent( array $body, array $options ): array {
		if ( ! self::inventory_configured( $body ) ) {
			return array(
				'rows'        => array(),
				'source'      => 'none',
				'acfComplete' => false,
			);
		}

		$post_status = self::normalize_post_status( (string) ( $options['post_status'] ?? 'publish' ) );
		if ( $post_status === 'future' ) {
			$scheduled = self::resolve_scheduled_rows( $body, $options );
			if ( count( $scheduled['rows'] ) > 0 ) {
				return $scheduled;
			}
		}

		$collections = isset( $options['collections'] ) && is_array( $options['collections'] )
			? $options['collections']
			: self::collections_for_params( $options );

		if ( in_array( $post_status, array( 'future', 'draft' ), true ) ) {
			$rows = self::fetch_rows_by_wp_status( $body, $post_status, $collections );
			$max  = isset( $options['limit'] ) ? (int) $options['limit'] : 50;
			$rows = self::filter_inventory_rows(
				$rows,
				array(
					'post_type'   => $options['post_type'] ?? '',
					'post_status' => $post_status,
					'sort'        => $options['sort'] ?? 'date_desc',
					'limit'       => $max,
				),
				$max
			);
			return array(
				'rows'        => $rows,
				'source'      => count( $rows ) > 0 ? 'bulk' : 'none',
				'acfComplete' => count( $rows ) > 0,
			);
		}

		$request = array_merge(
			$body,
			array(
				'collections'    => $collections,
				'includeRawPostFields'  => true,
				'includeContent' => true,
			)
		);
		if ( ! empty( $options['includeIds'] ) && is_array( $options['includeIds'] ) ) {
			$request['includeIds'] = array_map( 'intval', $options['includeIds'] );
		}

		list( $status, $data ) = Neo_Pulse_App_Wp_Posts_Inventory::get_site_inventory_bulk( $request );
		if ( $status < 200 || $status >= 300 || ! is_array( $data ) ) {
			return array(
				'rows'        => array(),
				'source'      => 'none',
				'acfComplete' => false,
			);
		}

		$raw  = isset( $data['rows'] ) && is_array( $data['rows'] ) ? $data['rows'] : array();
		$rows = array();
		foreach ( $raw as $row ) {
			if ( ! is_array( $row ) ) {
				continue;
			}
			$rows[] = self::normalize_audit_row( $row );
		}

		if ( ! empty( $options['url'] ) ) {
			$target = esc_url_raw( trim( (string) $options['url'] ) );
			$rows   = array_values(
				array_filter(
					$rows,
					static function ( $row ) use ( $target ) {
						return (string) ( $row['url'] ?? '' ) === $target;
					}
				)
			);
		}

		$max = isset( $options['limit'] ) ? (int) $options['limit'] : 50;
		$rows = self::filter_inventory_rows(
			$rows,
			array(
				'post_type'   => $options['post_type'] ?? '',
				'post_status' => $post_status,
				'sort'        => $options['sort'] ?? 'date_desc',
				'limit'       => $max,
			),
			$max
		);

		return array(
			'rows'        => $rows,
			'source'      => count( $rows ) > 0 ? 'bulk' : 'none',
			'acfComplete' => count( $rows ) > 0,
		);
	}

	/**
	 * @param array<string,mixed> $body
	 * @param array<string,mixed> $options
	 * @return array{rows:array<int,array<string,mixed>>,source:string,acfComplete:bool}
	 */
	public static function resolve_scheduled_rows( array $body, array $options ): array {
		if ( ! self::inventory_configured( $body ) ) {
			return array(
				'rows'        => array(),
				'source'      => 'none',
				'acfComplete' => false,
			);
		}

		$request = array_merge(
			$body,
			array(
				'allScheduled' => true,
			)
		);
		list( $status, $data ) = Neo_Pulse_App_Wp_Posts_Inventory::get_scheduled_posts( $request );
		if ( $status < 200 || $status >= 300 || ! is_array( $data ) ) {
			return array(
				'rows'        => array(),
				'source'      => 'none',
				'acfComplete' => false,
			);
		}

		$posts = isset( $data['posts'] ) && is_array( $data['posts'] ) ? $data['posts'] : array();
		$rows  = array();
		foreach ( $posts as $post ) {
			if ( ! is_array( $post ) ) {
				continue;
			}
			$rows[] = self::normalize_scheduled_post_row( $post );
		}

		$max = isset( $options['limit'] ) ? (int) $options['limit'] : 50;
		$rows = self::filter_inventory_rows(
			$rows,
			array(
				'post_type'   => $options['post_type'] ?? 'post',
				'post_status' => 'future',
				'sort'        => $options['sort'] ?? 'date_asc',
				'limit'       => $max,
			),
			$max
		);

		return array(
			'rows'        => $rows,
			'source'      => count( $rows ) > 0 ? 'bulk' : 'none',
			'acfComplete' => false,
		);
	}

	/**
	 * @param array<string,mixed> $post
	 * @return array<string,mixed>
	 */
	private static function normalize_scheduled_post_row( array $post ): array {
		$url = esc_url_raw( trim( (string) ( $post['url'] ?? $post['link'] ?? '' ) ) );
		return array(
			'id'            => (int) ( $post['id'] ?? 0 ),
			'title'         => trim( (string) ( $post['title'] ?? '' ) ),
			'url'           => $url,
			'slug'          => (string) ( $post['slug'] ?? '' ),
			'date_gmt'      => (string) ( $post['date_gmt'] ?? '' ),
			'status'        => 'future',
			'type'          => 'posts',
			'focus_keyword' => '',
			'excerpt'       => '',
			'meta'          => '',
		);
	}

	public static function normalize_post_status( string $status ): string {
		$status = sanitize_key( $status );
		if ( $status === 'scheduled' ) {
			return 'future';
		}
		if ( in_array( $status, array( 'publish', 'future', 'draft', 'pending', 'private' ), true ) ) {
			return $status;
		}
		return 'publish';
	}

	/**
	 * @param array<string,mixed> $body
	 * @param string              $wp_status
	 * @param array<int,string>   $collections
	 * @return array<int,array<string,mixed>>
	 */
	private static function fetch_rows_by_wp_status( array $body, string $wp_status, array $collections ): array {
		$normalized = Neo_Pulse_App_Wp_Url_Normalize::normalize_url( (string) $body['siteUrl'] );
		$rows       = array();

		foreach ( $collections as $coll ) {
			$rest = ( $coll === 'pages' ) ? 'pages' : 'posts';
			if ( $wp_status === 'future' && $rest !== 'posts' ) {
				continue;
			}
			$result = Neo_Pulse_App_Wp_Inventory_Collector::collect(
				$normalized,
				(string) $body['username'],
				(string) $body['appPassword'],
				$rest,
				true,
				true,
				false,
				$wp_status,
				null,
				null
			);
			if ( empty( $result['ok'] ) || empty( $result['rows'] ) || ! is_array( $result['rows'] ) ) {
				continue;
			}
			foreach ( $result['rows'] as $row ) {
				if ( ! is_array( $row ) ) {
					continue;
				}
				$row['collection'] = $coll;
				$rows[]            = self::normalize_audit_row( $row );
			}
		}

		return $rows;
	}

	/**
	 * @param array<string,mixed> $entity Normalized inventory row or GSC payload slice.
	 * @param string              $slice
	 * @return array<string,mixed>
	 */
	public static function extract_slice( array $entity, string $slice ): array {
		$slice = sanitize_key( $slice );
		switch ( $slice ) {
			case 'inventory':
				return array(
					'id'            => (int) ( $entity['id'] ?? 0 ),
					'title'         => (string) ( $entity['title'] ?? '' ),
					'url'           => (string) ( $entity['url'] ?? '' ),
					'slug'          => (string) ( $entity['slug'] ?? '' ),
					'date_gmt'      => (string) ( $entity['date_gmt'] ?? '' ),
					'status'        => sanitize_key( (string) ( $entity['status'] ?? 'publish' ) ),
					'focus_keyword' => (string) ( $entity['focus_keyword'] ?? '' ),
					'excerpt'       => self::truncate_text( (string) ( $entity['excerpt'] ?? '' ), 500 ),
				);
			case 'url':
				return array(
					'title' => (string) ( $entity['title'] ?? '' ),
					'url'   => (string) ( $entity['url'] ?? '' ),
					'slug'  => (string) ( $entity['slug'] ?? '' ),
				);
			case 'meta':
				$meta = trim( (string) ( $entity['meta'] ?? '' ) );
				return array(
					'meta'       => $meta,
					'char_count' => strlen( $meta ),
				);
			case 'keyword':
				return array(
					'focus_keyword' => (string) ( $entity['focus_keyword'] ?? '' ),
				);
			case 'faq':
				return array(
					'faq'     => self::truncate_text( (string) ( $entity['faq'] ?? '' ), 2000 ),
					'has_faq' => trim( (string) ( $entity['faq'] ?? '' ) ) !== '',
				);
			case 'seo_research':
				return array(
					'seo_research' => self::truncate_text( (string) ( $entity['seo_research'] ?? '' ), 3000 ),
					'has_seo_research' => ! empty( $entity['has_seo_research'] ),
				);
			case 'body':
				$body = (string) ( $entity['body'] ?? $entity['content'] ?? $entity['excerpt'] ?? '' );
				return array(
					'body' => self::truncate_text( wp_strip_all_tags( $body ), 6000 ),
				);
			case 'featured_image':
				return array(
					'has_featured_image' => ! empty( $entity['has_featured_image'] ),
					'featured_media_id'  => (int) ( $entity['featuredMediaId'] ?? $entity['id'] ?? 0 ),
				);
			case 'gsc_summary':
			case 'gsc_reporting':
			case 'ads_reporting':
			case 'gsc_queries':
			case 'gsc_pages':
			case 'gsc_blog_performers':
			case 'ga_organic':
				return is_array( $entity[ $slice ] ?? null ) ? $entity[ $slice ] : array( 'lines' => $entity['lines'] ?? array() );
			default:
				return array( 'raw' => $entity );
		}
	}

	/**
	 * @param array<string,mixed> $row
	 * @return array<string,mixed>
	 */
	public static function build_subagent_post_bundle( array $row ): array {
		return array(
			'id'            => (int) ( $row['id'] ?? 0 ),
			'title'         => (string) ( $row['title'] ?? '' ),
			'url'           => (string) ( $row['url'] ?? '' ),
			'slug'          => (string) ( $row['slug'] ?? '' ),
			'date_gmt'      => (string) ( $row['date_gmt'] ?? '' ),
			'status'        => sanitize_key( (string) ( $row['status'] ?? 'publish' ) ),
			'focus_keyword' => (string) ( $row['focus_keyword'] ?? '' ),
			'meta'          => self::truncate_text( (string) ( $row['meta'] ?? '' ), 500 ),
			'excerpt'       => self::truncate_text( (string) ( $row['excerpt'] ?? '' ), 500 ),
			'faq'           => self::truncate_text( (string) ( $row['faq'] ?? '' ), 800 ),
			'seo_research'  => self::truncate_text( (string) ( $row['seo_research'] ?? '' ), 1200 ),
			'body'          => self::truncate_text( wp_strip_all_tags( (string) ( $row['content'] ?? '' ) ), 1500 ),
			'has_featured_image' => ! empty( $row['has_featured_image'] ),
		);
	}

	private static function truncate_text( string $text, int $max ): string {
		$text = trim( $text );
		if ( strlen( $text ) <= $max ) {
			return $text;
		}
		return substr( $text, 0, $max ) . '…';
	}

	/**
	 * @param array<string,mixed> $acf
	 */
	public static function has_substantive_seo_research( array $acf ): bool {
		$raw = isset( $acf['seo_research'] ) ? trim( (string) $acf['seo_research'] ) : '';
		if ( $raw === '' ) {
			return false;
		}
		$decoded = json_decode( $raw, true );
		if ( JSON_ERROR_NONE === json_last_error() ) {
			if ( $decoded === null ) {
				return false;
			}
			if ( is_array( $decoded ) ) {
				return count( $decoded ) > 0;
			}
			if ( is_object( $decoded ) ) {
				return count( (array) $decoded ) > 0;
			}
		}
		return true;
	}

	/**
	 * @param array<int,array<string,mixed>> $rows
	 * @param array<int,string>              $collections
	 * @return array<int,array<string,mixed>>
	 */
	public static function filter_by_collection( array $rows, array $collections ): array {
		if ( count( $collections ) === 0 ) {
			return $rows;
		}
		return array_values(
			array_filter(
				$rows,
				static function ( $row ) use ( $collections ) {
					return in_array( sanitize_key( (string) ( $row['type'] ?? '' ) ), $collections, true );
				}
			)
		);
	}

	/**
	 * @param array<int,array<string,mixed>> $rows
	 * @param array<string,mixed>            $params
	 * @return array<int,array<string,mixed>>
	 */
	public static function filter_inventory_rows( array $rows, array $params, int $max_rows ): array {
		if ( ! empty( $params['post_type'] ) ) {
			$collection = self::collection_for_post_type( (string) $params['post_type'] );
			$rows       = array_values(
				array_filter(
					$rows,
					static function ( $row ) use ( $collection ) {
						return sanitize_key( (string) ( $row['type'] ?? '' ) ) === $collection;
					}
				)
			);
		}

		$query = isset( $params['query'] ) ? trim( (string) $params['query'] ) : '';
		if ( $query !== '' ) {
			$terms = array_values( array_filter( preg_split( '/\s+/', strtolower( $query ) ) ) );
			$rows  = array_values(
				array_filter(
					$rows,
					static function ( $row ) use ( $terms ) {
						$haystack = strtolower(
							(string) ( $row['title'] ?? '' ) . ' '
							. (string) ( $row['url'] ?? '' ) . ' '
							. (string) ( $row['focus_keyword'] ?? '' )
						);
						foreach ( $terms as $term ) {
							if ( $term !== '' && strpos( $haystack, $term ) === false ) {
								return false;
							}
						}
						return true;
					}
				)
			);
		}

		if ( ! empty( $params['post_status'] ) ) {
			$want = self::normalize_post_status( (string) $params['post_status'] );
			$rows = array_values(
				array_filter(
					$rows,
					static function ( $row ) use ( $want ) {
						return self::normalize_post_status( (string) ( $row['status'] ?? 'publish' ) ) === $want;
					}
				)
			);
		}

		$sort = ! empty( $params['sort'] ) ? sanitize_key( (string) $params['sort'] ) : '';
		if ( $sort === 'date_desc' ) {
			usort(
				$rows,
				static function ( $a, $b ) {
					return strcmp( (string) ( $b['date_gmt'] ?? '' ), (string) ( $a['date_gmt'] ?? '' ) );
				}
			);
		} elseif ( $sort === 'date_asc' ) {
			usort(
				$rows,
				static function ( $a, $b ) {
					return strcmp( (string) ( $a['date_gmt'] ?? '' ), (string) ( $b['date_gmt'] ?? '' ) );
				}
			);
		} elseif ( $sort === 'title_asc' ) {
			usort(
				$rows,
				static function ( $a, $b ) {
					return strcasecmp( (string) ( $a['title'] ?? '' ), (string) ( $b['title'] ?? '' ) );
				}
			);
		}

		if ( ! empty( $params['limit'] ) ) {
			$rows = array_slice( $rows, 0, max( 1, min( $max_rows, (int) $params['limit'] ) ) );
		}

		return $rows;
	}

	/** @param array<string,mixed> $params @return array<int,string> */
	public static function collections_for_params( array $params ): array {
		if ( ! empty( $params['post_type'] ) ) {
			return array( self::collection_for_post_type( (string) $params['post_type'] ) );
		}
		return array( 'posts', 'pages' );
	}

	public static function collection_for_post_type( string $post_type ): string {
		$pt = sanitize_key( $post_type );
		if ( $pt === 'post' ) {
			return 'posts';
		}
		if ( $pt === 'page' ) {
			return 'pages';
		}
		return $pt;
	}

	/** @param array<string,mixed> $body */
	public static function inventory_configured( array $body ): bool {
		$site_url     = isset( $body['siteUrl'] ) ? trim( (string) $body['siteUrl'] ) : '';
		$username     = isset( $body['username'] ) ? trim( (string) $body['username'] ) : '';
		$app_password = isset( $body['appPassword'] ) ? trim( (string) $body['appPassword'] ) : '';
		return $site_url !== '' && $username !== '' && $app_password !== '';
	}

	/** @param array<string,mixed> $body */
	private static function cache_site_key( array $body ): string {
		$pulse = isset( $body['pulse_context'] ) && is_array( $body['pulse_context'] ) ? $body['pulse_context'] : array();
		$site  = isset( $pulse['siteId'] ) ? sanitize_text_field( (string) $pulse['siteId'] ) : '';
		$url   = isset( $body['siteUrl'] ) ? trim( (string) $body['siteUrl'] ) : '';
		return $site . '|' . $url;
	}
}
