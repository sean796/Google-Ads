<?php
/**
 * Visible-tab route registry (parity checklist source).
 *
 * @package Neo_Pulse_App
 */

defined( 'ABSPATH' ) || exit;

class Neo_Pulse_App_Api_Route_Registry {

	/**
	 * @return array<int,array{method:string,path:string}>
	 */
	public static function visible_tab_routes(): array {
		return array(
			array( 'method' => 'POST', 'path' => 'wordpress/test-connection' ),
			array( 'method' => 'POST', 'path' => 'wordpress/bulk-update-overview-seo' ),
			array( 'method' => 'POST', 'path' => 'wordpress/discover-acf-field-groups' ),
			array( 'method' => 'POST', 'path' => 'gsc/fetch-reporting-bundle' ),
			array( 'method' => 'POST', 'path' => 'organic-dashboard/fetch' ),
			array( 'method' => 'POST', 'path' => 'organic-dashboard/fetch-part' ),
			array( 'method' => 'POST', 'path' => 'organic-dashboard/reporting-highlights' ),
			array( 'method' => 'POST', 'path' => 'organic-dashboard/client-report/save' ),
			array( 'method' => 'GET', 'path' => 'organic-dashboard/client-report/load' ),
			array( 'method' => 'GET', 'path' => 'organic-dashboard/client-report/open' ),
			array( 'method' => 'GET', 'path' => 'organic-dashboard/local-grid/workspace' ),
			array( 'method' => 'POST', 'path' => 'organic-dashboard/local-grid/workspace' ),
			array( 'method' => 'POST', 'path' => 'organic-dashboard/local-grid/resolve-business' ),
			array( 'method' => 'POST', 'path' => 'organic-dashboard/local-grid/geocode-address' ),
			array( 'method' => 'POST', 'path' => 'organic-dashboard/local-grid/scan-batch' ),
			array( 'method' => 'GET', 'path' => 'organic-dashboard/local-grid/history' ),
			array( 'method' => 'GET', 'path' => 'organic-dashboard/local-grid/scan' ),
			array( 'method' => 'POST', 'path' => 'organic-dashboard/local-grid/save' ),
			array( 'method' => 'POST', 'path' => 'organic-dashboard/local-grid/report-narrative' ),
			array( 'method' => 'POST', 'path' => 'organic-dashboard/local-grid/delete' ),
			array( 'method' => 'POST', 'path' => 'gsc/reporting-chat-completion' ),
			array( 'method' => 'POST', 'path' => 'openrouter/chat-completion' ),
			array( 'method' => 'GET', 'path' => 'openrouter/models' ),
			array( 'method' => 'POST', 'path' => 'proxy/fetch-text' ),
			array( 'method' => 'POST', 'path' => 'gsc/fetch-pages-performance' ),
			array( 'method' => 'POST', 'path' => 'gsc/top-pages' ),
			array( 'method' => 'POST', 'path' => 'overview/optimize-meta-ai' ),
			array( 'method' => 'POST', 'path' => 'dataforseo/competitor-research' ),
			array( 'method' => 'POST', 'path' => 'semrush/competitor-research' ),
			array( 'method' => 'POST', 'path' => 'proposal/site-audit' ),
			array( 'method' => 'POST', 'path' => 'seo/discover-locations' ),
			array( 'method' => 'GET', 'path' => 'vertical-benchmarks/taxonomy' ),
			array( 'method' => 'GET', 'path' => 'ga/credentials-status' ),
			array( 'method' => 'GET', 'path' => 'gsc/credentials-status' ),
			array( 'method' => 'POST', 'path' => 'gsc/test-and-save' ),
			array( 'method' => 'GET', 'path' => 'gmb/config-status' ),
			array( 'method' => 'GET', 'path' => 'gmb/authorize' ),
			array( 'method' => 'POST', 'path' => 'gmb/performance' ),
			array( 'method' => 'POST', 'path' => 'knowledge-model/auto-graph' ),
			array( 'method' => 'POST', 'path' => 'site-scraper/scrape' ),
			array( 'method' => 'POST', 'path' => 'video/render' ),
			array( 'method' => 'POST', 'path' => 'video/render/{id}/frame' ),
			array( 'method' => 'POST', 'path' => 'video/render/{id}/start' ),
			array( 'method' => 'GET', 'path' => 'video/render/{id}' ),
			array( 'method' => 'POST', 'path' => 'video/brainstorm/frames' ),
			array( 'method' => 'POST', 'path' => 'video/brainstorm/{id}/beats' ),
		);
	}

	/**
	 * @return array<int,array{method:string,path:string}>
	 */
	public static function phase1_routes(): array {
		return self::visible_tab_routes();
	}
}
