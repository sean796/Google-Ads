<?php
/**
 * Blog URL selection, OpenRouter picking, and featured image helpers.
 *
 * @package Neo_Pulse_App
 */

defined( 'ABSPATH' ) || exit;

trait Neo_Pulse_App_Gmb_Posts_Api_Trait_Blog_Pick {

	/**
	 * @param array<int,mixed> $urls
	 * @return array<int,string>
	 */
	private static function normalize_url_list( $urls ): array {
		if ( ! is_array( $urls ) ) {
			return array();
		}
		$out = array();
		foreach ( $urls as $url ) {
			$trimmed = trim( (string) $url );
			if ( $trimmed !== '' && strpos( $trimmed, 'http' ) === 0 ) {
				$out[] = $trimmed;
			}
		}
		return $out;
	}

	private static function normalize_public_url( string $url ): string {
		$trimmed = trim( $url );
		if ( $trimmed === '' || strpos( $trimmed, 'http' ) !== 0 ) {
			return '';
		}
		return untrailingslashit( $trimmed );
	}

	/** Skip homepage and listing pages (e.g. /blog) so GBP links to a single post or page. */
	private static function is_index_or_archive_url( string $url, string $site_url ): bool {
		$normalized = self::normalize_public_url( $url );
		$site_base  = self::normalize_public_url( $site_url );
		if ( $normalized === '' ) {
			return true;
		}
		if ( $site_base !== '' && $normalized === $site_base ) {
			return true;
		}
		$path = (string) wp_parse_url( $normalized, PHP_URL_PATH );
		$path = trim( $path, '/' );
		if ( $path === '' ) {
			return true;
		}
		$parts = explode( '/', $path );
		$depth = count( $parts );
		if ( $depth === 1 ) {
			$single = strtolower( $parts[0] );
			$archives = array( 'blog', 'news', 'articles', 'resources', 'category', 'tag', 'shop', 'store' );
			if ( in_array( $single, $archives, true ) ) {
				return true;
			}
		}
		if ( $depth === 2 && strtolower( $parts[0] ) === 'blog' ) {
			$second = strtolower( $parts[1] );
			if ( in_array( $second, array( 'page', 'category', 'tag', 'author' ), true ) ) {
				return true;
			}
		}
		return false;
	}

	private static function title_from_public_url( string $url ): string {
		$path = (string) wp_parse_url( $url, PHP_URL_PATH );
		$slug = $path !== '' ? basename( rtrim( $path, '/' ) ) : $url;
		$slug = str_replace( array( '-', '_' ), ' ', $slug );
		return ucwords( trim( $slug ) );
	}

	/**
	 * @param array<int,string> $urls
	 * @return array<int,array<string,string>>
	 */
	private static function build_candidates_from_urls( array $urls ): array {
		$out = array();
		foreach ( $urls as $url ) {
			$normalized = self::normalize_public_url( (string) $url );
			if ( $normalized === '' ) {
				continue;
			}
			$out[] = array(
				'blogPostUrl'     => $normalized,
				'blogPostTitle'   => self::title_from_public_url( $normalized ),
				'blogPostExcerpt' => '',
			);
		}
		return $out;
	}

	/**
	 * @param array<int,array<string,string>> $candidates
	 * @return array<string,string>
	 */
	private static function openrouter_pick_blog_post( string $api_key, string $keyword, array $candidates ): array {
		$lines = array();
		foreach ( array_slice( $candidates, 0, 40 ) as $i => $candidate ) {
			$lines[] = ( $i + 1 ) . '. ' . $candidate['blogPostTitle'] . ' | ' . $candidate['blogPostUrl'];
		}
		$parsed = Neo_Pulse_App_Vertical_Benchmark_Openrouter::json_completion(
			array(
				array(
					'role'    => 'system',
					'content' => 'Pick one specific article or service page URL for a Google Business Profile post CTA. Never pick the homepage, blog index (/blog), shop index, category archives, or other listing pages. The URL must be a single piece of content with its own slug (e.g. /blog/my-article-title/). Output JSON only: {"blogPostUrl":"https://...","blogPostTitle":"string","blogPostExcerpt":"string","reason":"string"}. Use one of the provided URLs exactly.',
				),
				array(
					'role'    => 'user',
					'content' => 'Topic: ' . ( $keyword !== '' ? $keyword : 'local business update' ) . "\n\nCandidates:\n" . implode( "\n", $lines ),
				),
			),
			array(
				'apiKey'      => $api_key,
				'temperature' => 0.2,
				'maxTokens'   => 400,
			)
		);

		$url = self::normalize_public_url( (string) ( $parsed['blogPostUrl'] ?? '' ) );
		if ( $url === '' ) {
			throw new Exception( 'OpenRouter did not return a valid blogPostUrl.' );
		}

		foreach ( $candidates as $candidate ) {
			if ( self::normalize_public_url( $candidate['blogPostUrl'] ) === $url ) {
				return array(
					'blogPostUrl'     => $url,
					'blogPostTitle'   => trim( (string) ( $parsed['blogPostTitle'] ?? $candidate['blogPostTitle'] ) ),
					'blogPostExcerpt' => trim( (string) ( $parsed['blogPostExcerpt'] ?? $candidate['blogPostExcerpt'] ) ),
					'reason'          => trim( (string) ( $parsed['reason'] ?? 'Best match for topic.' ) ),
				);
			}
		}

		return array(
			'blogPostUrl'     => $url,
			'blogPostTitle'   => trim( (string) ( $parsed['blogPostTitle'] ?? $url ) ),
			'blogPostExcerpt' => trim( (string) ( $parsed['blogPostExcerpt'] ?? '' ) ),
			'reason'          => trim( (string) ( $parsed['reason'] ?? 'Best match for topic.' ) ),
		);
	}

	private static function openrouter_gbp_summary(
		string $api_key,
		string $title,
		string $excerpt,
		string $keyword,
		string $site_name
	): string {
		$parsed = Neo_Pulse_App_Vertical_Benchmark_Openrouter::json_completion(
			array(
				array(
					'role'    => 'system',
					'content' => 'Write a Google Business Profile post (max 150 words, no hashtags, no emojis). Output JSON only: {"summary":"string"}. End with a short call to action.',
				),
				array(
					'role'    => 'user',
					'content' => 'Business: ' . $site_name . "\nTopic: " . $keyword . "\nPage title: " . $title . "\nExcerpt: " . $excerpt,
				),
			),
			array(
				'apiKey'      => $api_key,
				'temperature' => 0.6,
				'maxTokens'   => 500,
			)
		);
		$summary = trim( (string) ( $parsed['summary'] ?? '' ) );
		if ( $summary === '' ) {
			throw new Exception( 'OpenRouter returned empty GBP summary.' );
		}
		return $summary;
	}

	/**
	 * @return array{sourceUrl:string,title:string,reason:string}|null
	 */
	private static function featured_image_for_url( string $site_url, string $username, string $app_password, string $page_url ) {
		list( $status, $payload ) = Neo_Pulse_App_Wp_Url_Resolver::resolve_urls(
			array(
				'siteUrl'     => $site_url,
				'username'    => $username,
				'appPassword' => $app_password,
				'urls'        => array( $page_url ),
			)
		);
		if ( $status !== 200 || empty( $payload['resolved'][0] ) || ! is_array( $payload['resolved'][0] ) ) {
			return null;
		}
		$resolved   = $payload['resolved'][0];
		$id         = isset( $resolved['id'] ) ? (int) $resolved['id'] : 0;
		if ( $id <= 0 ) {
			return null;
		}
		$subtype    = (string) ( $resolved['subtype'] ?? 'post' );
		$endpoint   = $subtype === 'page' ? 'pages' : 'posts';
		$normalized = Neo_Pulse_App_Wp_Url_Normalize::normalize_url( $site_url );

		$post_resp = Neo_Pulse_App_Wp_Rest_Client::request(
			'GET',
			$normalized . '/wp-json/wp/v2/' . $endpoint . '/' . $id,
			$username,
			$app_password,
			array(
				'timeout' => 15,
				'params'  => array(
					'context' => 'edit',
					'_fields' => 'id,title,featured_media',
				),
			)
		);
		if ( $post_resp['is_wp_error'] || (int) $post_resp['status'] !== 200 || ! is_array( $post_resp['body'] ) ) {
			return null;
		}
		$post_row    = $post_resp['body'];
		$featured_id = (int) ( $post_row['featured_media'] ?? 0 );
		if ( $featured_id <= 0 ) {
			return null;
		}

		$media_resp = Neo_Pulse_App_Wp_Rest_Client::request(
			'GET',
			$normalized . '/wp-json/wp/v2/media/' . $featured_id,
			$username,
			$app_password,
			array(
				'timeout' => 15,
				'params'  => array( '_fields' => 'source_url,title' ),
			)
		);
		if ( $media_resp['is_wp_error'] || (int) $media_resp['status'] !== 200 || ! is_array( $media_resp['body'] ) ) {
			return null;
		}
		$media = $media_resp['body'];
		$url   = trim( (string) ( $media['source_url'] ?? '' ) );
		if ( $url === '' || strpos( $url, 'http' ) !== 0 ) {
			return null;
		}
		return array(
			'sourceUrl' => $url,
			'title'     => trim( (string) ( $media['title'] ?? $post_row['title'] ?? '' ) ),
			'reason'    => 'Featured image from linked page.',
		);
	}
}
