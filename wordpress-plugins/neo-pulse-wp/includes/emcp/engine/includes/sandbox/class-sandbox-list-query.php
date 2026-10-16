<?php
/**
 * One paged query behind every sandbox artifact list.
 *
 * The three sandbox stores (blocks, widgets, PHP snippets) are the same shape:
 * a private CPT, ordered by modified date, filtered by status. All three asked
 * for a flat 200 rows with `no_found_rows`, which had two consequences. The
 * admin screens rendered every artifact in a single table (and each row of the
 * snippet and widget tables carries that artifact's whole source), and a site
 * past its 200th artifact silently lost the rest with nothing on screen saying
 * so.
 *
 * Owning the query here fixes both once: callers get one page of IDs plus the
 * real total, and each store maps those IDs through its own summary shape.
 *
 * @package EMCP_Tools
 * @since   3.15.0
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Paged listing for the sandbox artifact post types.
 *
 * @since 3.15.0
 */
class EMCP_Tools_Sandbox_List_Query {

	/**
	 * Rows per page on the sandbox management screens.
	 *
	 * @since 3.15.0
	 * @var int
	 */
	const PER_PAGE = 20;

	/**
	 * Upper bound on `per_page`, so a hand-edited URL cannot ask for the whole
	 * table back and undo the point of paging.
	 *
	 * @since 3.15.0
	 * @var int
	 */
	const MAX_PER_PAGE = 100;

	/**
	 * Returns one page of artifact IDs plus the totals needed to draw a pager.
	 *
	 * A requested page beyond the end lands on the last page that exists rather
	 * than on an empty table: that is what a bookmarked URL looks like once rows
	 * have been deleted, and an empty screen reads as data loss.
	 *
	 * @since 3.15.0
	 *
	 * @param string $post_type Artifact post type.
	 * @param string $status    'active', 'draft', or 'any'.
	 * @param int    $page      1-based page number.
	 * @param int    $per_page  Rows per page.
	 * @return array{ids:int[],total:int,page:int,pages:int,per_page:int}
	 */
	public static function page( string $post_type, string $status = 'any', int $page = 1, int $per_page = self::PER_PAGE ): array {
		$per_page    = max( 1, min( self::MAX_PER_PAGE, $per_page ) );
		$page        = max( 1, $page );
		$post_status = self::post_status( $status );

		$result = self::query( $post_type, $post_status, $page, $per_page );

		// WP_Query::set_found_posts() bails when the page came back empty, so an
		// out-of-range page reports a total of zero and cannot say where the list
		// really ends. Page 1 does carry the total, so ask it, then land on the
		// last page that exists.
		if ( empty( $result['ids'] ) && $page > 1 ) {
			$page   = 1;
			$result = self::query( $post_type, $post_status, 1, $per_page );

			if ( $result['pages'] > 1 ) {
				$page   = $result['pages'];
				$result = self::query( $post_type, $post_status, $page, $per_page );
			}
		}

		return array(
			'ids'      => $result['ids'],
			'total'    => $result['total'],
			'page'     => $page,
			'pages'    => $result['pages'],
			'per_page' => $per_page,
		);
	}

	/**
	 * Maps the stores' status vocabulary onto post statuses.
	 *
	 * Drafts are the whole point of the sandbox (AI writes them, a human
	 * activates them), so 'any' has to mean both.
	 *
	 * @since 3.15.0
	 *
	 * @param string $status 'active', 'draft', or anything else for both.
	 * @return string
	 */
	public static function post_status( string $status ): string {
		if ( 'active' === $status ) {
			return 'publish';
		}
		if ( 'draft' === $status ) {
			return 'draft';
		}
		return 'any';
	}

	/**
	 * Runs the query for one page.
	 *
	 * @since 3.15.0
	 *
	 * @param string $post_type   Artifact post type.
	 * @param string $post_status Resolved post status.
	 * @param int    $page        1-based page number.
	 * @param int    $per_page    Rows per page.
	 * @return array{ids:int[],total:int,pages:int}
	 */
	private static function query( string $post_type, string $post_status, int $page, int $per_page ): array {
		$query = new WP_Query(
			array(
				'post_type'      => $post_type,
				'post_status'    => $post_status,
				'posts_per_page' => $per_page,
				'paged'          => $page,
				// Modified date alone is not a total order: artifacts saved in the
				// same second tie, and MySQL may order the tie differently for
				// `LIMIT 0,20` than for `LIMIT 20,20`. That shows one row on two
				// pages and hides another entirely. ID is unique, so it settles it.
				'orderby'        => array(
					'modified' => 'DESC',
					'ID'       => 'DESC',
				),
				'fields'         => 'ids',
				// The whole point is the total, so found_rows stays on here.
				'no_found_rows'  => false,
			)
		);

		$ids = array();
		foreach ( (array) $query->posts as $post ) {
			// 'fields' => 'ids' gives plain integers, but a filtered query (or a
			// test double) can still hand back objects.
			$ids[] = is_object( $post ) ? (int) $post->ID : (int) $post;
		}

		$total = (int) $query->found_posts;

		return array(
			'ids'   => $ids,
			'total' => $total,
			'pages' => max( 1, (int) ceil( $total / $per_page ) ),
		);
	}
}
