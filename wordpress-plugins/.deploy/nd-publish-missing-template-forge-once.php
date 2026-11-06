<?php
/**
 * One-time: create and publish the Missing template Full AISEO Forge workflow.
 * Client = Posh only. Posts only. No trigger. Audit CSV then Full AISEO.
 * Self-deletes after a successful run.
 */
$cli_ok = PHP_SAPI === 'cli' && isset( $argv[1] ) && (string) $argv[1] === 'ND_FORGE_TOKEN';
if ( ! $cli_ok && ( $_GET['key'] ?? '' ) !== 'ND_FORGE_TOKEN' ) {
	http_response_code( 403 );
	header( 'Content-Type: application/json; charset=utf-8' );
	echo json_encode( array( 'ok' => false, 'error' => 'forbidden' ) );
	exit;
}

ini_set( 'display_errors', '0' );
header( 'Content-Type: application/json; charset=utf-8' );

$dir     = __DIR__;
$wp_load = '';
for ( $i = 0; $i < 6; $i++ ) {
	$candidate = $dir . '/wp-load.php';
	if ( is_readable( $candidate ) ) {
		$wp_load = $candidate;
		break;
	}
	$dir = dirname( $dir );
}
if ( $wp_load === '' ) {
	http_response_code( 500 );
	echo json_encode( array( 'ok' => false, 'error' => 'wp-load missing' ) );
	exit;
}

require_once $wp_load;

$sites_path = Neo_Pulse_App_Data_Paths::sites_path();
$mirror     = is_readable( $sites_path ) ? json_decode( (string) file_get_contents( $sites_path ), true ) : null;
$sites      = is_array( $mirror ) && isset( $mirror['sites'] ) && is_array( $mirror['sites'] ) ? $mirror['sites'] : array();
if ( count( $sites ) === 0 ) {
	http_response_code( 500 );
	echo wp_json_encode( array( 'ok' => false, 'error' => 'sites.json empty or missing', 'sitesPath' => $sites_path ) );
	exit;
}

$kept     = array();
$excluded = array();
foreach ( $sites as $site ) {
	if ( ! is_array( $site ) ) {
		continue;
	}
	$id   = trim( (string) ( $site['id'] ?? '' ) );
	$name = trim( (string) ( $site['name'] ?? '' ) );
	$url  = trim( (string) ( $site['siteUrl'] ?? ( $site['url'] ?? '' ) ) );
	if ( $id === '' ) {
		continue;
	}
	$hay = strtolower( $name . ' ' . $url );
	if ( ! str_contains( $hay, 'posh' ) ) {
		$excluded[] = array( 'id' => $id, 'name' => $name );
		continue;
	}
	$kept[] = array( 'id' => $id, 'name' => $name !== '' ? $name : $id );
}

$site_ids = array_values( array_map( static fn( $row ) => $row['id'], $kept ) );
if ( count( $site_ids ) === 0 ) {
	http_response_code( 500 );
	echo wp_json_encode( array( 'ok' => false, 'error' => 'Posh not found in sites.json' ) );
	exit;
}

global $wpdb;
$teams_table = $wpdb->prefix . 'neo_pulse_teams';
$wf_table    = $wpdb->prefix . 'neo_pulse_workflows';
if ( $wpdb->get_var( $wpdb->prepare( 'SHOW TABLES LIKE %s', $teams_table ) ) !== $teams_table ) {
	http_response_code( 500 );
	echo wp_json_encode( array( 'ok' => false, 'error' => 'teams table missing', 'table' => $teams_table ) );
	exit;
}
if ( $wpdb->get_var( $wpdb->prepare( 'SHOW TABLES LIKE %s', $wf_table ) ) !== $wf_table ) {
	http_response_code( 500 );
	echo wp_json_encode( array( 'ok' => false, 'error' => 'workflows table missing', 'table' => $wf_table ) );
	exit;
}

$team      = $wpdb->get_row( "SELECT id, name FROM {$teams_table} ORDER BY id ASC LIMIT 1", ARRAY_A );
$team_id   = is_array( $team ) ? (int) $team['id'] : 0;
$team_name = is_array( $team ) ? (string) ( $team['name'] ?? '' ) : '';
if ( $team_id <= 0 ) {
	http_response_code( 500 );
	echo wp_json_encode( array( 'ok' => false, 'error' => 'no teams' ) );
	exit;
}

$client_id  = 'workflow_client_missing_template';
$csv_id     = 'csv_audit_posts_missing_template';
$posts_id   = 'action_posts_missing_template';
$archive_id = 'rag_archive_missing_template';

$optimize_prompt = 'Adjust posts that do not fit the new live template. Published HTML must include an H2 titled Answer. Skip posts that already have that H2.';

$nodes = array(
	array(
		'id'       => $client_id,
		'kind'     => 'workflow_client',
		'label'    => 'Client',
		'config'   => array(
			'siteIds'     => $site_ids,
			'clientScope' => 'selected',
		),
		'position' => array( 'x' => 120, 'y' => 80 ),
	),
	array(
		'id'       => $csv_id,
		'kind'     => 'csv_rows',
		'label'    => 'Page audit',
		'config'   => array(
			'csvInputSource' => 'site',
			'targetBucket'   => 'posts',
			'csvHeaders'     => array( 'url', 'H2' ),
			'csvColumnMap'   => array(
				'url'      => 'url',
				'research' => 'H2',
			),
			'ragVariableKey' => 'csv_rows_1',
		),
		'position' => array( 'x' => 120, 'y' => 220 ),
	),
	array(
		'id'       => $posts_id,
		'kind'     => 'action_agent',
		'label'    => 'Full AISEO',
		'config'   => array(
			'executionKind'      => 'content_optimizer',
			'executionPayload'   => array(
				'targetBucket'   => 'posts',
				'updateMode'     => 'update',
				'optimizationOptions' => array(
					'optimizeTitle'         => true,
					'optimizeMeta'          => true,
					'optimizeExcerpt'       => true,
					'optimizeContent'       => true,
					'optimizeExtraText'     => false,
					'optimizeFeaturedImage' => false,
					'useAcfKeyword'         => true,
					'forceNewResearch'      => true,
				),
				'optionalPrompt' => $optimize_prompt,
			),
			'ragVariableKey'     => 'content_optimizer_2',
			'ragScope'           => 'run',
			'title'              => 'Full AISEO',
			'actionBlockKeyword' => 'content-optimizer-full',
			'recipeKeyword'      => 'missing-template-aiseo',
			'recipeCategory'     => 'maintenance',
		),
		'position' => array( 'x' => 120, 'y' => 360 ),
	),
	array(
		'id'       => $archive_id,
		'kind'     => 'rag_archive',
		'label'    => 'Archive to RAG',
		'config'   => array(
			'variableKey' => 'content_optimizer_2',
			'scope'       => 'run',
		),
		'position' => array( 'x' => 120, 'y' => 500 ),
	),
);

$edges = array(
	array( 'id' => 'e_' . $client_id . '_' . $csv_id, 'source' => $client_id, 'target' => $csv_id ),
	array( 'id' => 'e_' . $csv_id . '_' . $posts_id, 'source' => $csv_id, 'target' => $posts_id ),
	array( 'id' => 'e_' . $posts_id . '_' . $archive_id, 'source' => $posts_id, 'target' => $archive_id ),
);

$rag = array(
	array(
		'key'    => 'csv_rows_1',
		'nodeId' => $csv_id,
		'scope'  => 'run',
		'label'  => 'Page audit',
	),
	array(
		'key'    => 'content_optimizer_2',
		'nodeId' => $posts_id,
		'scope'  => 'run',
		'label'  => 'Full AISEO',
	),
);

$name        = 'Missing template Full AISEO';
$description = 'Download the posts audit CSV, then Full AISEO adjusts posts that do not fit the new template.';
$body        = array(
	'name'            => $name,
	'description'     => $description,
	'wordpressSiteId' => null,
	'nodes'           => $nodes,
	'edges'           => $edges,
	'ragVariables'    => $rag,
);

$now      = current_time( 'mysql', true );
$payload  = wp_json_encode( $body );
$created  = true;
$wf_id    = 0;
$existing_rows = $wpdb->get_results(
	$wpdb->prepare( "SELECT id, payload_json FROM {$wf_table} WHERE team_id = %d", $team_id ),
	ARRAY_A
);
if ( is_array( $existing_rows ) ) {
	foreach ( $existing_rows as $row ) {
		$decoded = json_decode( (string) ( $row['payload_json'] ?? '' ), true );
		if ( is_array( $decoded ) && (string) ( $decoded['name'] ?? '' ) === $name ) {
			$wf_id   = (int) $row['id'];
			$created = false;
			break;
		}
	}
}

if ( $wf_id > 0 ) {
	$ok = $wpdb->update(
		$wf_table,
		array(
			'payload_json' => $payload,
			'status'       => 'published',
			'published_at' => $now,
			'updated_at'   => $now,
		),
		array(
			'id'      => $wf_id,
			'team_id' => $team_id,
		),
		array( '%s', '%s', '%s', '%s' ),
		array( '%d', '%d' )
	);
	if ( $ok === false ) {
		http_response_code( 500 );
		echo wp_json_encode( array( 'ok' => false, 'error' => 'patch_workflow failed', 'db' => $wpdb->last_error ) );
		exit;
	}
} else {
	$ok = $wpdb->insert(
		$wf_table,
		array(
			'team_id'      => $team_id,
			'payload_json' => $payload,
			'status'       => 'published',
			'created_at'   => $now,
			'updated_at'   => $now,
			'published_at' => $now,
		),
		array( '%d', '%s', '%s', '%s', '%s', '%s' )
	);
	if ( ! $ok ) {
		http_response_code( 500 );
		echo wp_json_encode( array( 'ok' => false, 'error' => 'create_workflow failed', 'db' => $wpdb->last_error ) );
		exit;
	}
	$wf_id = (int) $wpdb->insert_id;
}

$published = array(
	'id'     => $wf_id,
	'status' => 'published',
	'name'   => $name,
	'nodes'  => $nodes,
);

$client_node = null;
foreach ( $published['nodes'] ?? array() as $node ) {
	if ( is_array( $node ) && ( $node['kind'] ?? '' ) === 'workflow_client' ) {
		$client_node = $node;
		break;
	}
}
$actions = array();
foreach ( $published['nodes'] ?? array() as $node ) {
	if ( ! is_array( $node ) ) {
		continue;
	}
	$kind = (string) ( $node['kind'] ?? '' );
	if ( $kind !== 'action_agent' && $kind !== 'csv_rows' ) {
		continue;
	}
	$config  = isset( $node['config'] ) && is_array( $node['config'] ) ? $node['config'] : array();
	$payload = isset( $config['executionPayload'] ) && is_array( $config['executionPayload'] ) ? $config['executionPayload'] : array();
	$actions[] = array(
		'label'          => (string) ( $node['label'] ?? '' ),
		'kind'           => $kind,
		'executionKind'  => (string) ( $config['executionKind'] ?? '' ),
		'csvInputSource' => (string) ( $config['csvInputSource'] ?? '' ),
		'targetBucket'   => (string) ( $payload['targetBucket'] ?? ( $config['targetBucket'] ?? '' ) ),
		'hasInstructions'=> $kind === 'action_agent'
			? ( trim( (string) ( $payload['optionalPrompt'] ?? '' ) ) !== '' )
			: ( trim( (string) ( $config['optionalPrompt'] ?? '' ) ) !== '' ),
		'hasQuestions'   => is_array( $payload['auditQuestions'] ?? null )
			&& count( array_filter( array_map( 'trim', $payload['auditQuestions'] ) ) ) > 0,
	);
}

echo wp_json_encode(
	array(
		'ok'            => true,
		'created'       => $created,
		'teamId'        => $team_id,
		'teamName'      => $team_name,
		'workflowId'    => (int) $published['id'],
		'status'        => (string) $published['status'],
		'name'          => (string) $published['name'],
		'siteCount'     => count( $site_ids ),
		'siteNames'     => array_values( array_map( static fn( $row ) => $row['name'], $kept ) ),
		'excluded'      => $excluded,
		'clientScope'   => is_array( $client_node ) && isset( $client_node['config']['clientScope'] ) ? (string) $client_node['config']['clientScope'] : '',
		'clientSiteIds' => is_array( $client_node ) && isset( $client_node['config']['siteIds'] ) && is_array( $client_node['config']['siteIds'] ) ? $client_node['config']['siteIds'] : array(),
		'actions'       => $actions,
	)
);

@unlink( __FILE__ );
