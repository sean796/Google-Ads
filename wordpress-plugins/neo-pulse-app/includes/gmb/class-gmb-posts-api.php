<?php
/**
 * Google Business Profile post inventory, blog pick, and publish helpers.
 *
 * @package Neo_Pulse_App
 */

defined( 'ABSPATH' ) || exit;

$neo_pulse_app_gmb_posts_api_dir = __DIR__ . '/';
require_once $neo_pulse_app_gmb_posts_api_dir . 'trait-gmb-posts-api-location-resolution.php';
require_once $neo_pulse_app_gmb_posts_api_dir . 'trait-gmb-posts-api-gbp-api.php';
require_once $neo_pulse_app_gmb_posts_api_dir . 'trait-gmb-posts-api-blog-pick.php';

class Neo_Pulse_App_Gmb_Posts_Api {

	const MYBUSINESS_V4_BASE      = 'https://mybusiness.googleapis.com/v4';
	const ACCOUNT_MGMT_BASE       = 'https://mybusinessaccountmanagement.googleapis.com/v1';
	const BUSINESS_INFO_BASE      = 'https://mybusinessbusinessinformation.googleapis.com/v1';
	const RECENT_MEDIA_CAP        = 10;
	const PUBLISH_NOW_GRACE_SEC   = 120;

	/** @var array<string,string> */
	private static $location_parent_cache = array();

	/** @var array<int,string>|null */
	private static $account_names_cache = null;

	use Neo_Pulse_App_Gmb_Posts_Api_Trait_Location_Resolution;
	use Neo_Pulse_App_Gmb_Posts_Api_Trait_Gbp_Api;
	use Neo_Pulse_App_Gmb_Posts_Api_Trait_Blog_Pick;

	/**
	 * @return array{statusCode:int,body:array<string,mixed>}
	 */
	public static function posts_inventory( array $body ): array {
		$raw_location = self::location_id_from_body( $body );
		$location_id  = self::normalize_location_id( $raw_location );
		if ( $location_id === '' ) {
			return self::error( 400, 'gbpLocationId or (accountId and locationId) required.' );
		}

		$access_token = Neo_Pulse_App_Gmb_Tokens::get_valid_access_token();
		if ( is_wp_error( $access_token ) ) {
			return self::error( 401, $access_token->get_error_message() );
		}

		$site_name     = trim( (string) ( $body['siteName'] ?? '' ) );
		$site_url      = trim( (string) ( $body['siteUrl'] ?? '' ) );
		$location_name = self::resolve_location_parent( $access_token, $raw_location, $site_name, $site_url );
		if ( is_wp_error( $location_name ) ) {
			return self::error( 422, $location_name->get_error_message() );
		}

		$posts = self::fetch_all_local_posts( $access_token, $location_name );
		if ( is_wp_error( $posts ) ) {
			return self::error( 422, $posts->get_error_message() );
		}

		$rows               = array();
		$exclude_cta_urls   = array();
		$exclude_media_urls = array();

		foreach ( $posts as $post ) {
			if ( ! is_array( $post ) ) {
				continue;
			}
			$row = self::map_local_post_row( $post );
			if ( $row ) {
				$rows[] = $row;
			}
			$cta = isset( $post['callToAction']['url'] ) ? trim( (string) $post['callToAction']['url'] ) : '';
			if ( $cta !== '' && strpos( $cta, 'http' ) === 0 ) {
				$exclude_cta_urls[] = $cta;
			}
			if ( ! empty( $post['media'] ) && is_array( $post['media'] ) ) {
				foreach ( $post['media'] as $media ) {
					if ( ! is_array( $media ) ) {
						continue;
					}
					$src = isset( $media['sourceUrl'] ) ? trim( (string) $media['sourceUrl'] ) : '';
					if ( $src !== '' && strpos( $src, 'http' ) === 0 ) {
						$exclude_media_urls[] = $src;
					}
				}
			}
		}

		$exclude_cta_urls   = array_values( array_unique( $exclude_cta_urls ) );
		$exclude_media_urls = array_slice( array_values( array_unique( $exclude_media_urls ) ), 0, self::RECENT_MEDIA_CAP );

		return array(
			'statusCode' => 200,
			'body'       => array(
				'success'                => true,
				'posts'                  => $rows,
				'count'                  => count( $rows ),
				'excludeCtaUrls'         => $exclude_cta_urls,
				'excludeRecentMediaUrls' => $exclude_media_urls,
			),
		);
	}

	/**
	 * @return array{statusCode:int,body:array<string,mixed>}
	 */
	public static function pick_blog_post( array $body ): array {
		$site_url     = trim( (string) ( $body['siteUrl'] ?? '' ) );
		$username     = trim( (string) ( $body['username'] ?? '' ) );
		$app_password = trim( (string) ( $body['appPassword'] ?? '' ) );
		$sitemap_url  = trim( (string) ( $body['sitemapUrl'] ?? '' ) );
		$keyword      = trim( (string) ( $body['keyword'] ?? '' ) );
		$api_key      = Neo_Pulse_App_Vertical_Benchmark_Openrouter::resolve_key( (string) ( $body['openRouterApiKey'] ?? '' ) );

		if ( $site_url === '' || $username === '' || $app_password === '' ) {
			return self::error( 400, 'siteUrl, username, and appPassword are required.' );
		}
		if ( $sitemap_url === '' ) {
			return self::error( 400, 'sitemapUrl is required. Configure the child sitemap in Integrations for this source.' );
		}
		if ( $api_key === '' ) {
			return self::error( 400, 'openRouterApiKey is required (or set OPENROUTER_API_KEY).' );
		}

		$exclude = self::normalize_url_list( $body['excludeUrls'] ?? array() );
		$exclude = array_merge( $exclude, self::normalize_url_list( $body['excludeGbpCtaUrls'] ?? array() ) );
		$exclude = array_values( array_unique( $exclude ) );

		list( $status, $parsed ) = Neo_Pulse_App_Wp_Sitemap::parse_sitemap(
			array(
				'sitemapUrl'  => $sitemap_url,
				'username'    => $username,
				'appPassword' => $app_password,
			)
		);
		if ( $status !== 200 || ! is_array( $parsed ) ) {
			$msg = is_array( $parsed ) && ! empty( $parsed['error'] )
				? (string) $parsed['error']
				: 'Failed to fetch sitemap (HTTP ' . $status . ').';
			return self::error( 422, $msg );
		}
		if ( ! empty( $parsed['childSitemaps'] ) && is_array( $parsed['childSitemaps'] ) ) {
			return self::error(
				422,
				'Paste the child sitemap URL (e.g. page-sitemap.xml) in Integrations, not the index.'
			);
		}
		if ( empty( $parsed['urls'] ) || ! is_array( $parsed['urls'] ) ) {
			return self::error( 404, 'No URLs in sitemap.' );
		}

		$candidate_urls = array();
		foreach ( array_slice( $parsed['urls'], 0, 40 ) as $page_url ) {
			$normalized = self::normalize_public_url( (string) $page_url );
			if ( $normalized === '' || in_array( $normalized, $exclude, true ) ) {
				continue;
			}
			if ( self::is_index_or_archive_url( $normalized, $site_url ) ) {
				continue;
			}
			$candidate_urls[] = $normalized;
		}
		if ( ! $candidate_urls ) {
			return self::error( 404, 'No eligible URLs in sitemap after exclusions.' );
		}

		$candidates = self::build_candidates_from_urls( $candidate_urls );

		$preferred = self::normalize_public_url( trim( (string) ( $body['preferredUrl'] ?? '' ) ) );
		if ( $preferred !== '' ) {
			if ( ! in_array( $preferred, $candidate_urls, true ) ) {
				return self::error( 422, 'Landing page URL not found in sitemap.' );
			}
			$picked = self::build_candidates_from_urls( array( $preferred ) )[0] ?? null;
			if ( ! is_array( $picked ) ) {
				return self::error( 422, 'Landing page URL not found in sitemap.' );
			}
			$picked['reason'] = 'User-specified landing page URL.';
		} else {
			try {
				$picked = self::openrouter_pick_blog_post( $api_key, $keyword, $candidates );
			} catch ( Exception $e ) {
				return self::error( 422, $e->getMessage() );
			}
		}

		return array(
			'statusCode' => 200,
			'body'       => array(
				'success'  => true,
				'blogPost' => $picked,
			),
		);
	}

	/**
	 * @return array{statusCode:int,body:array<string,mixed>}
	 */
	public static function publish_from_harness( array $body ): array {
		$site_url        = trim( (string) ( $body['siteUrl'] ?? '' ) );
		$username        = trim( (string) ( $body['username'] ?? '' ) );
		$app_password    = trim( (string) ( $body['appPassword'] ?? '' ) );
		$gbp_location_raw  = trim( (string) ( $body['gbpLocationId'] ?? '' ) );
		$gbp_location_id   = self::normalize_location_id( $gbp_location_raw );
		$blog_url        = trim( (string) ( $body['blogPostUrl'] ?? '' ) );
		$blog_title      = trim( (string) ( $body['blogPostTitle'] ?? '' ) );
		$blog_excerpt    = trim( (string) ( $body['blogPostExcerpt'] ?? '' ) );
		$keyword         = trim( (string) ( $body['keyword'] ?? '' ) );
		$site_name       = trim( (string) ( $body['siteName'] ?? '' ) );
		$pre_copy        = trim( (string) ( $body['preGeneratedCopy'] ?? '' ) );
		$api_key         = Neo_Pulse_App_Vertical_Benchmark_Openrouter::resolve_key( (string) ( $body['openRouterApiKey'] ?? '' ) );
		$should_publish  = ! array_key_exists( 'publish', $body ) || ! empty( $body['publish'] );
		$scheduled_at    = trim( (string) ( $body['scheduledPublishAt'] ?? '' ) );

		if ( $site_url === '' || $username === '' || $app_password === '' || $gbp_location_id === '' ) {
			return self::error( 400, 'siteUrl, username, appPassword, and gbpLocationId are required.' );
		}
		if ( $api_key === '' ) {
			return self::error( 400, 'openRouterApiKey is required (or set OPENROUTER_API_KEY).' );
		}
		if ( $blog_url === '' || $blog_title === '' ) {
			return self::error( 400, 'blogPostUrl and blogPostTitle are required.' );
		}

		try {
			$summary = $pre_copy !== '' ? $pre_copy : self::openrouter_gbp_summary(
				$api_key,
				$blog_title,
				$blog_excerpt,
				$keyword,
				$site_name
			);
		} catch ( Exception $e ) {
			return self::error( 422, $e->getMessage() );
		}

		$image = self::featured_image_for_url( $site_url, $username, $app_password, $blog_url );
		$exclude_media = self::normalize_url_list( $body['excludeMediaUrls'] ?? array() );
		if ( $image && in_array( $image['sourceUrl'], $exclude_media, true ) ) {
			$image = null;
		}

		$preview = array(
			'summary'          => $summary,
			'moneyPageUrl'     => $blog_url,
			'moneyPageReason'  => 'Learn more CTA target from sitemap pick.',
			'imageSearchTerms' => array( 'library' ),
			'media'            => $image ? $image : array(),
			'linkedBlog'       => array(
				'blogPostUrl'     => $blog_url,
				'blogPostTitle'   => $blog_title,
				'blogPostExcerpt' => $blog_excerpt,
				'reason'          => 'Harness linked page.',
			),
		);

		if ( ! $should_publish ) {
			return array(
				'statusCode' => 200,
				'body'       => array(
					'success'   => true,
					'preview'   => $preview,
					'published' => false,
					'scheduled' => false,
				),
			);
		}

		$scheduled_ts = $scheduled_at !== '' ? strtotime( $scheduled_at ) : 0;
		$publish_now  = $scheduled_ts <= 0 || $scheduled_ts <= ( time() + self::PUBLISH_NOW_GRACE_SEC );

		if ( ! $publish_now ) {
			$queued = self::enqueue_scheduled_post(
				array(
					'scheduledPublishAt' => gmdate( 'c', $scheduled_ts ),
					'gbpLocationId'      => $gbp_location_id,
					'summary'            => $summary,
					'blogPostUrl'        => $blog_url,
					'blogPostTitle'      => $blog_title,
					'imageUrl'           => $image ? (string) $image['sourceUrl'] : '',
				)
			);
			if ( is_wp_error( $queued ) ) {
				return self::error( 500, $queued->get_error_message() );
			}
			return array(
				'statusCode' => 200,
				'body'       => array(
					'success'     => true,
					'preview'     => $preview,
					'published'   => false,
					'scheduled'   => true,
					'scheduledAt' => gmdate( 'c', $scheduled_ts ),
				),
			);
		}

		$access_token = Neo_Pulse_App_Gmb_Tokens::get_valid_access_token();
		if ( is_wp_error( $access_token ) ) {
			return self::error( 401, $access_token->get_error_message() );
		}

		$location_name = self::resolve_location_parent( $access_token, $gbp_location_raw, $site_name, $site_url );
		if ( is_wp_error( $location_name ) ) {
			return self::error( 422, $location_name->get_error_message() );
		}

		$published = self::create_local_post(
			$access_token,
			$location_name,
			$summary,
			$blog_url,
			$image ? (string) $image['sourceUrl'] : null
		);
		if ( is_wp_error( $published ) ) {
			return self::error( 422, $published->get_error_message() );
		}

		return array(
			'statusCode' => 200,
			'body'       => array(
				'success'   => true,
				'preview'   => $preview,
				'published' => true,
				'scheduled' => false,
			),
		);
	}

	/**
	 * @return array{statusCode:int,body:array<string,mixed>}
	 */
	public static function process_schedule_queue(): array {
		$access_token = Neo_Pulse_App_Gmb_Tokens::get_valid_access_token();
		if ( is_wp_error( $access_token ) ) {
			return self::error( 401, $access_token->get_error_message() );
		}

		$queue   = self::read_schedule_queue();
		$now     = time();
		$remain  = array();
		$published = 0;
		$failed    = 0;

		foreach ( $queue as $item ) {
			if ( ! is_array( $item ) ) {
				continue;
			}
			$scheduled_ts = isset( $item['scheduledPublishAt'] ) ? strtotime( (string) $item['scheduledPublishAt'] ) : 0;
			if ( $scheduled_ts > $now ) {
				$remain[] = $item;
				continue;
			}

			$location_raw = (string) ( $item['gbpLocationId'] ?? '' );
			$location_id  = self::normalize_location_id( $location_raw );
			$summary     = trim( (string) ( $item['summary'] ?? '' ) );
			$cta_url     = trim( (string) ( $item['blogPostUrl'] ?? '' ) );
			$image_url   = trim( (string) ( $item['imageUrl'] ?? '' ) );
			if ( $location_id === '' || $summary === '' || $cta_url === '' ) {
				++$failed;
				continue;
			}

			$location_name = self::resolve_location_parent(
				$access_token,
				$location_raw,
				trim( (string) ( $item['siteName'] ?? '' ) ),
				trim( (string) ( $item['siteUrl'] ?? '' ) )
			);
			if ( is_wp_error( $location_name ) ) {
				++$failed;
				$remain[] = $item;
				continue;
			}

			$result = self::create_local_post(
				$access_token,
				$location_name,
				$summary,
				$cta_url,
				$image_url !== '' ? $image_url : null
			);
			if ( is_wp_error( $result ) ) {
				++$failed;
				$remain[] = $item;
			} else {
				++$published;
			}
		}

		self::write_schedule_queue( $remain );

		return array(
			'statusCode' => 200,
			'body'       => array(
				'success'          => true,
				'processed'        => $published + $failed,
				'publishedThisRun' => $published,
				'failedThisRun'    => $failed,
				'remaining'        => count( $remain ),
			),
		);
	}

	/**
	 * @param array<string,mixed> $body
	 */
	private static function location_id_from_body( array $body ): string {
		if ( ! empty( $body['gbpLocationId'] ) ) {
			return (string) $body['gbpLocationId'];
		}
		$account  = trim( (string) ( $body['accountId'] ?? '' ) );
		$location = trim( (string) ( $body['locationId'] ?? '' ) );
		if ( $account !== '' && $location !== '' ) {
			return $location;
		}
		return '';
	}

	private static function normalize_location_id( string $location_id ): string {
		return Neo_Pulse_App_Gmb_Performance::normalize_location_id( $location_id );
	}

	/**
	 * @return array<int,array<string,mixed>>
	 */
	private static function read_schedule_queue(): array {
		$path = Neo_Pulse_App_Data_Paths::gmb_schedule_queue_path();
		$data = Neo_Pulse_App_Json_File_Store::read( $path );
		return is_array( $data ) ? $data : array();
	}

	/**
	 * @param array<int,array<string,mixed>> $items
	 */
	private static function write_schedule_queue( array $items ): void {
		Neo_Pulse_App_Json_File_Store::write( Neo_Pulse_App_Data_Paths::gmb_schedule_queue_path(), array_values( $items ) );
	}

	/**
	 * @param array<string,mixed> $item
	 * @return true|WP_Error
	 */
	private static function enqueue_scheduled_post( array $item ) {
		$queue   = self::read_schedule_queue();
		$queue[] = $item;
		self::write_schedule_queue( $queue );
		return true;
	}

	/**
	 * @return array{statusCode:int,body:array<string,mixed>}
	 */
	private static function error( int $status, string $message ): array {
		return array(
			'statusCode' => $status,
			'body'       => array(
				'success' => false,
				'error'   => $message,
			),
		);
	}
}
