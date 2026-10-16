<?php
/**
 * funnelkit-read operations.
 *
 * @package EMCP_Tools
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

$fk_type = 'enum:checkout,landing,optin,optin-ty,thankyou,upsell';

return array(
	'list-funnels'          => array( 'mode' => 'read', 'method' => 'GET', 'route' => '/funnelkit-app/funnels', 'args' => array( 'limit' => 'int', 'offset' => 'string', 'status' => 'string', 's' => 'string', 'categories' => 'string' ), 'handler' => 'op_list_funnels', 'desc' => 'List or search funnels with their ordered steps.' ),
	'get-funnel'            => array( 'mode' => 'read', 'method' => 'GET', 'route' => '/funnelkit-app/funnels/{funnel_id}', 'args' => array( 'funnel_id' => 'int!' ), 'handler' => 'op_get_funnel', 'desc' => 'Get one funnel and its ordered steps.' ),
	'get-funnel-page'       => array( 'mode' => 'read', 'method' => 'GET', 'route' => '/funnelkit-app/funnel-{type}/{step_id}/design', 'args' => array( 'step_id' => 'int!', 'detail' => 'enum:summary,full', 'type' => $fk_type ), 'handler' => 'op_get_funnel_page', 'desc' => 'Funnel page summary; detail:full adds decoded design, customization, settings and checkout configuration.' ),
	'get-checkout-products' => array( 'mode' => 'read', 'method' => 'GET', 'route' => '/funnelkit-app/funnel-checkout/{step_id}/products', 'args' => array( 'step_id' => 'int!' ), 'handler' => 'op_get_checkout_products', 'desc' => 'Checkout products, quantities, discounts and effective prices.' ),
	'get-checkout-fields'   => array( 'mode' => 'read', 'method' => 'GET', 'route' => '/funnelkit-app/funnel-checkout/{step_id}/form_fields', 'args' => array( 'step_id' => 'int!' ), 'handler' => 'op_get_checkout_fields', 'desc' => 'Checkout fieldsets in saved order with labels, types and required flags.' ),

	'list-order-bumps'      => array( 'mode' => 'read', 'method' => 'GET', 'route' => '/funnelkit-app/funnels/{funnel_id}', 'args' => array( 'funnel_id' => 'int!' ), 'pro' => 'funnel-builder-pro', 'handler' => 'op_list_order_bumps', 'desc' => 'Order bumps on a funnel\'s checkout steps (substeps of type wc_order_bump).' ),
	'get-order-bump'        => array( 'mode' => 'read', 'method' => 'GET', 'route' => '', 'composite' => array( '/funnelkit-app/funnel-bump/{bump_id}', '/funnelkit-app/funnel-bump/{step_id}/products', '/funnelkit-app/funnel-bump/{step_id}/rules' ), 'args' => array( 'bump_id' => 'int!' ), 'pro' => 'funnel-builder-pro', 'handler' => 'run_composite', 'desc' => 'Order bump design, products and display rules.' ),
	'get-upsell'            => array( 'mode' => 'read', 'method' => 'GET', 'route' => '', 'composite' => array( '/funnelkit-app/funnel-upsell/{step_id}/offers', '/funnelkit-app/funnel-upsell/{step_id}/rules' ), 'args' => array( 'step_id' => 'int!' ), 'pro' => 'funnel-builder-pro', 'handler' => 'run_composite', 'desc' => 'Upsell step offers and rules.' ),
	'get-offer-products'    => array( 'mode' => 'read', 'method' => 'GET', 'route' => '/funnelkit-app/funnel-offer/{step_id}/products', 'args' => array( 'step_id' => 'int!' ), 'pro' => 'funnel-builder-pro', 'desc' => 'An offer\'s products, prices and quantities.' ),
	'get-step-design'       => array( 'mode' => 'read', 'method' => 'GET', 'route' => '/funnelkit-app/funnel-{type}/{step_id}/design', 'args' => array( 'type' => $fk_type . '!', 'step_id' => 'int!' ), 'desc' => 'A step\'s design (template and builder).' ),
	'get-step-customize'    => array( 'mode' => 'read', 'method' => 'GET', 'route' => '/funnelkit-app/funnel-{type}/{step_id}/customize', 'args' => array( 'type' => $fk_type . '!', 'step_id' => 'int!' ), 'desc' => 'A step\'s customizer values.' ),
	'get-step-settings'     => array( 'mode' => 'read', 'method' => 'GET', 'route' => '/funnelkit-app/funnel-{type}/{step_id}/settings', 'args' => array( 'type' => $fk_type . '!', 'step_id' => 'int!' ), 'desc' => 'A step\'s settings.' ),
	'get-optin-fields'      => array( 'mode' => 'read', 'method' => 'GET', 'route' => '/funnelkit-app/funnel-optin/{step_id}/form_fields', 'args' => array( 'step_id' => 'int!' ), 'desc' => 'Opt-in form fields.' ),
	'get-optin-actions'     => array( 'mode' => 'read', 'method' => 'GET', 'route' => '/funnelkit-app/funnel-optin/{step_id}/actions', 'args' => array( 'step_id' => 'int!' ), 'desc' => 'Opt-in submission actions.' ),
	'get-checkout-optimizations' => array( 'mode' => 'read', 'method' => 'GET', 'route' => '/funnelkit-app/funnel-checkout/{id}/optimizations', 'args' => array( 'id' => 'int!' ), 'desc' => 'Checkout optimizations.' ),
	'get-thankyou-rules'    => array( 'mode' => 'read', 'method' => 'GET', 'route' => '/funnelkit-app/funnel-thankyou/{step_id}/rules', 'args' => array( 'step_id' => 'int!' ), 'pro' => 'funnel-builder-pro', 'desc' => 'Thank-you page display rules.' ),
	'get-funnel-settings'   => array( 'mode' => 'read', 'method' => 'GET', 'route' => '/funnelkit-app/funnels/{funnel_id}/settings', 'args' => array( 'funnel_id' => 'int!' ), 'desc' => 'Per-funnel settings.' ),
	'list-templates'        => array( 'mode' => 'read', 'method' => 'GET', 'route' => '/funnelkit-app/funnels/get-templates', 'args' => array(), 'desc' => 'FunnelKit template library (funnels and steps by builder).' ),
	'import-status'         => array( 'mode' => 'read', 'method' => 'GET', 'route' => '/funnelkit-app/funnels/{funnel_id}/import-status', 'args' => array( 'funnel_id' => 'int!', 'job' => 'slug' ), 'handler' => 'op_import_status', 'desc' => 'Progress of a template import. Pass the job from import-template\'s pending answer to record it in History when it has finished.' ),
	'funnel-orders'         => array( 'mode' => 'read', 'method' => 'GET', 'route' => '/funnelkit-app/funnel-orders/{funnel_id}', 'args' => array( 'funnel_id' => 'int!', 's' => 'string', 'after' => 'string', 'before' => 'string', 'limit' => 'int', 'offset' => 'string', 'order' => 'enum:asc,desc', 'orderby' => 'string' ), 'desc' => 'Orders that went through a funnel.' ),
	'funnel-leads'          => array( 'mode' => 'read', 'method' => 'GET', 'route' => '/funnelkit-app/funnel-leads/{funnel_id}', 'args' => array( 'funnel_id' => 'int!', 's' => 'string', 'after' => 'string', 'before' => 'string', 'limit' => 'int', 'offset' => 'string', 'order' => 'enum:asc,desc', 'orderby' => 'string' ), 'desc' => 'Opt-in leads of a funnel.' ),
	'search-steps'          => array( 'mode' => 'read', 'method' => 'GET', 'route' => '/funnelkit-app/funnels/step/search', 'args' => array( 's' => 'string', 'type' => 'string' ), 'desc' => 'Search funnel steps.' ),

	'list-experiments'      => array( 'mode' => 'read', 'method' => 'GET', 'route' => '/funnelkit-app/experiment', 'args' => array( 'offset' => 'string', 'limit' => 'int', 'status' => 'string', 's' => 'string' ), 'pro' => 'funnel-builder-pro', 'desc' => 'A/B experiments.' ),
	'get-experiment'        => array( 'mode' => 'read', 'method' => 'GET', 'route' => '/funnelkit-app/experiment/{experiment_id}', 'args' => array( 'experiment_id' => 'int!' ), 'pro' => 'funnel-builder-pro', 'desc' => 'One A/B experiment.' ),
	'get-experiment-stats'  => array( 'mode' => 'read', 'method' => 'GET', 'route' => '/funnelkit-app/experiment/{experiment_id}/stats', 'args' => array( 'experiment_id' => 'int!', 'after' => 'string', 'before' => 'string', 'interval' => 'string' ), 'pro' => 'funnel-builder-pro', 'desc' => 'Experiment stats.' ),
	'list-experiment-variants' => array( 'mode' => 'read', 'method' => 'GET', 'route' => '/funnelkit-app/experiment/{experiment_id}/variants', 'args' => array( 'experiment_id' => 'int!' ), 'pro' => 'funnel-builder-pro', 'desc' => 'Experiment variants.' ),
	'experiment-controls'   => array( 'mode' => 'read', 'method' => 'GET', 'route' => '/funnelkit-app/experiment/controls', 'args' => array( 'type' => 'string' ), 'pro' => 'funnel-builder-pro', 'desc' => 'Steps an experiment can test.' ),

	'funnel-analytics'      => array( 'mode' => 'read', 'method' => 'GET', 'route' => '', 'composite' => array( '/funnelkit-app/funnel-analytics/{id}/overview', '/funnelkit-app/funnel-analytics/{id}/stats', '/funnelkit-app/funnel-analytics/{id}/steps', '/funnelkit-app/funnel-analytics/{id}/referrer', '/funnelkit-app/funnel-analytics/{id}/referrer-social-stats', '/funnelkit-app/funnel-analytics/{id}/contacts' ), 'args' => array( 'id' => 'int!', 'section' => 'enum:overview,stats,steps,referrer,referrer-social-stats,contacts!', 'after' => 'string', 'before' => 'string', 'limit' => 'int', 'offset' => 'string' ), 'handler' => 'op_analytics_section', 'desc' => 'One analytics section of a funnel.' ),
	'funnel-conversions'    => array( 'mode' => 'read', 'method' => 'GET', 'route' => '/funnelkit-app/funnel-analytics/{id}/conversion/stats', 'args' => array( 'id' => 'int!', 'after' => 'string', 'before' => 'string' ), 'desc' => 'Funnel conversion stats.' ),
	'funnel-campaigns'      => array( 'mode' => 'read', 'method' => 'GET', 'route' => '/funnelkit-app/funnel-analytics/{id}/conversion/campaign-data', 'args' => array( 'id' => 'int!', 'after' => 'string', 'before' => 'string' ), 'desc' => 'Funnel UTM campaign data.' ),
	'analytics-dashboard'   => array( 'mode' => 'read', 'method' => 'GET', 'route' => '/funnelkit-app/funnel-analytics/dashboard', 'args' => array( 'after' => 'string', 'before' => 'string' ), 'desc' => 'Store-wide funnel dashboard.' ),
	'analytics-dashboard-stats' => array( 'mode' => 'read', 'method' => 'GET', 'route' => '/funnelkit-app/funnel-analytics/dashboard/stats', 'args' => array( 'after' => 'string', 'before' => 'string' ), 'desc' => 'Dashboard stats.' ),
	'analytics-dashboard-sources' => array( 'mode' => 'read', 'method' => 'GET', 'route' => '/funnelkit-app/funnel-analytics/dashboard/sources', 'args' => array( 'after' => 'string', 'before' => 'string' ), 'desc' => 'Traffic sources.' ),
	'analytics-timeline'    => array( 'mode' => 'read', 'method' => 'GET', 'route' => '/funnelkit-app/funnel-analytics/stream/timeline', 'args' => array( 'after' => 'string', 'before' => 'string', 'limit' => 'int' ), 'desc' => 'Recent funnel activity.' ),
	'analytics-upsells'     => array( 'mode' => 'read', 'method' => 'GET', 'route' => '/funnelkit-app/funnel-analytics/all-upsells', 'args' => array( 'after' => 'string', 'before' => 'string' ), 'desc' => 'Upsell performance.' ),
	'analytics-revenue-split' => array( 'mode' => 'read', 'method' => 'GET', 'route' => '/funnelkit-app/funnel-analytics/revenue-percentage', 'args' => array( 'after' => 'string', 'before' => 'string' ), 'desc' => 'Revenue split by funnel step type.' ),
	'funnel-utms'           => array( 'mode' => 'read', 'method' => 'GET', 'route' => '/funnelkit-app/funnel-utms', 'args' => array(), 'desc' => 'UTM sources in use.' ),
	'funnel-referrers'      => array( 'mode' => 'read', 'method' => 'GET', 'route' => '/funnelkit-app/funnel-referrers', 'args' => array(), 'desc' => 'Referrers in use.' ),
	'canvas-nodes'          => array( 'mode' => 'read', 'method' => 'GET', 'route' => '/funnelkit-app/canvas/{funnel_id}/nodes', 'args' => array( 'funnel_id' => 'int!' ), 'desc' => 'The funnel canvas (steps and links).' ),

	'export-funnels'        => array( 'mode' => 'read', 'method' => 'GET', 'route' => '/funnelkit-app/funnels/export', 'args' => array( 'ids' => 'string!' ), 'native' => true, 'handler' => 'op_export_funnels', 'desc' => 'Export funnels as JSON (inline, up to 2 MB). ids: comma-separated funnel ids.' ),
	'export-store-checkout' => array( 'mode' => 'read', 'method' => 'GET', 'route' => '/funnelkit-app/store-checkout/export', 'args' => array( 'ids' => 'string!' ), 'native' => true, 'handler' => 'op_export_store_checkout', 'desc' => 'Export the store checkout as JSON (inline, up to 2 MB).' ),
	'export-checkout'       => array( 'mode' => 'read', 'method' => 'POST', 'route' => '/wfacp-admin/wfacp/{wfacp_id}/export', 'args' => array( 'wfacp_id' => 'int!' ), 'handler' => 'op_export_inline', 'desc' => 'Export one checkout page configuration as JSON.' ),
);
