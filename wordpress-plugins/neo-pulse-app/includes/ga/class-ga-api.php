<?php
/**
 * Google Analytics 4 Admin/Data API calls.
 *
 * @package Neo_Pulse_App
 */

defined( 'ABSPATH' ) || exit;

$neo_pulse_app_ga_api_dir = __DIR__ . '/';
require_once $neo_pulse_app_ga_api_dir . 'trait-ga-api-report-data.php';
require_once $neo_pulse_app_ga_api_dir . 'trait-ga-api-organic-acquisition.php';
require_once $neo_pulse_app_ga_api_dir . 'trait-ga-api-api-core.php';
require_once $neo_pulse_app_ga_api_dir . 'trait-ga-api-organic-dashboard-fast.php';

class Neo_Pulse_App_Ga_Api {

	const SCOPE_READONLY = 'https://www.googleapis.com/auth/analytics.readonly';
	const TOKEN_URL      = 'https://oauth2.googleapis.com/token';
	const ADMIN_BASE     = 'https://analyticsadmin.googleapis.com/v1beta';
	const DATA_BASE      = 'https://analyticsdata.googleapis.com/v1beta';

	use Neo_Pulse_App_Ga_Api_Trait_Report_Data;
	use Neo_Pulse_App_Ga_Api_Trait_Organic_Acquisition;
	use Neo_Pulse_App_Ga_Api_Trait_Api_Core;
	use Neo_Pulse_App_Ga_Api_Trait_Organic_Dashboard_Fast;
}
