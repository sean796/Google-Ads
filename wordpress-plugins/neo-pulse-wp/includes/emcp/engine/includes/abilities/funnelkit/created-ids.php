<?php
/**
 * Where each FunnelKit create response reports the IDs it created: op => kind => response paths, first match wins.
 * Kind: a base scope name (its root table), a child table short name, or 'post'. Pinned by Task 1's create-responses.json.
 *
 * @package EMCP_Tools
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

return array(
	'create-automation' => array( 'automation' => array( 'automation_id', 'id', 'ID' ), '_proof' => 'insert' ),
	// get_or_create_terms(): only the message tells a created tag from an existing one (one tag per request, Task 12).
	'create-tags'       => array( 'term' => array( '0.ID', '0.id' ), '_proof' => array( 'message' => array( 'Tag created', 'wp-marketing-automations' ) ) ),
	// Funnel Builder (Task 7). add_funnel() always inserts; the probe's repeat calls created new IDs.
	'create-funnel'     => array( 'funnel' => array( 'funnel.id' ), '_proof' => 'insert' ),
	'duplicate-funnel'  => array( 'funnel' => array( 'funnel_id' ), '_proof' => 'insert' ),
	'import-template'   => array( 'funnel' => array( 'funnel_id' ), '_proof' => 'insert' ),
	// An upsell step comes with a sample offer (data.substeps.offer); both are new posts of this call.
	'create-step'       => array( 'post' => array( array( 'data.id', 'data.substeps.offer.*.id' ) ), '_proof' => 'insert' ),
	// Task 9: create_substep() and wfocu_add_offer() always insert (probe: new IDs on repeat).
	'create-order-bump' => array( 'post' => array( 'data.id' ), '_proof' => 'insert' ),
	'create-offer'      => array( 'post' => array( 'data.id' ), '_proof' => 'insert' ),
	// Task 10: save_experiment() inserts (a second experiment on the same control is refused); add_variant() copies the step.
	'create-experiment' => array( 'experiment' => array( 'ex_id' ), '_proof' => 'insert' ),
	'add-variant'       => array( 'post' => array( 'variant_id', 'data.id' ), '_proof' => 'insert' ),
	// import_from_json_data() inserts every funnel and answers with the list of new IDs.
	'import-funnels'    => array( 'funnel' => array( 'funnel_id' ), '_proof' => 'insert' ),
	// Task 12 (Automations). add-step and duplicate insert on every call; create-contact and
	// create-field refuse a repeat; create-field-group answers a one-row list.
	'add-step'             => array( 'bwfan_automation_step' => array( 'step_id' ), '_proof' => 'insert' ),
	'duplicate-automation' => array( 'automation' => array( 'ID' ), '_proof' => 'insert' ),
	'create-contact'       => array( 'contact' => array( 'id' ), '_proof' => 'insert' ),
	'create-field'         => array( 'field' => array( 'ID' ), '_proof' => 'insert' ),
	'create-field-group'   => array( 'field_group' => array( '0.id' ), '_proof' => 'insert' ),
	// Task 13 (Automations Pro). Repeats insert again, or are refused by title (link trigger, bulk action).
	'create-broadcast'     => array( 'broadcast' => array( 'id' ), '_proof' => 'insert' ),
	'clone-broadcast'      => array( 'broadcast' => array( 'id' ), '_proof' => 'insert' ),
	'create-template'      => array( 'template' => array( 'id' ), '_proof' => 'insert' ),
	'create-form-feed'     => array( 'form_feed' => array( 'id' ), '_proof' => 'insert' ),
	'create-link-trigger'  => array( 'link_trigger' => array( 'id' ), '_proof' => 'insert' ),
	'create-audience'      => array( 'term' => array( 'ID' ), '_proof' => 'insert' ),
	'create-bulk-action'   => array( 'bulk_action' => array( 'id' ), '_proof' => 'insert' ),
	'import-templates'     => array( 'template' => array( 'template_id' ), '_proof' => 'insert' ),
	'import-automations'   => array( 'automation' => array( 'automation_id' ), '_proof' => 'insert' ),
	// Backed by the probe (create-responses.json). Each later task adds its creating operations with their own probe.
);
