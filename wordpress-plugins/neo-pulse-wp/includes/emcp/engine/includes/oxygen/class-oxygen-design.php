<?php
/** Oxygen global design documents, using the installed native save APIs. */
if (!defined('ABSPATH')) { exit; }

class EMCP_Tools_Oxygen_Design {
	public static function read(string $scope) {
		switch ($scope) {
			case 'variables': $data=array('variables'=>\Breakdance\Variables\getVariables(),'collections'=>\Breakdance\Variables\getVariablesCollections()); break;
			case 'selectors': $data=array('selectors'=>\Breakdance\Data\get_global_option('oxy_selectors_json_string') ?: array(),'collections'=>\Breakdance\Data\get_global_option('oxy_selectors_collections_json_string') ?: array()); break;
			case 'settings': $data=\Breakdance\Data\get_global_settings_array(); break;
			case 'preferences': $data=\Breakdance\Preferences\get_preferences(); break;
			default: return new WP_Error('invalid_scope','Choose variables, selectors, settings or preferences.');
		}
		return array('scope'=>$scope,'data'=>$data,'content_hash'=>hash('sha256',wp_json_encode(array($scope,$data))));
	}

	public static function validate(string $scope, array $data) {
		if (!in_array($scope,array('variables','selectors','settings','preferences'),true)) { return new WP_Error('invalid_scope','Unknown design scope.'); }
		if (strlen(wp_json_encode($data))>2000000) { return new WP_Error('invalid_design','Design document exceeds 2 MB.'); }
		if (in_array($scope,array('variables','selectors'),true)) {
			if (array_diff(array_keys($data),array($scope,'collections')) || !isset($data[$scope],$data['collections']) || !is_array($data[$scope]) || !array_is_list($data[$scope]) || count($data[$scope])>2000 || !is_array($data['collections']) || !array_is_list($data['collections'])) { return new WP_Error('invalid_design','Expected native records and collections arrays.'); }
			foreach ($data['collections'] as $collection) { if (!is_string($collection) || strlen($collection)>200) { return new WP_Error('invalid_design','Collections must be strings.'); } }
			$seen=array();
			foreach ($data[$scope] as $record) {
				if (!is_array($record) || !is_string($record['id'] ?? null) || !$record['id'] || isset($seen[$record['id']]) || !is_string($record['collection'] ?? null) || !in_array($record['collection'],$data['collections'],true)) { return new WP_Error('invalid_design','Records require unique IDs and an existing collection.'); }
				$seen[$record['id']]=true;
				if ($scope==='variables') {
					if (!is_string($record['cssVariableName'] ?? null) || !preg_match('/^[a-zA-Z_][a-zA-Z0-9_-]*$/D',$record['cssVariableName']) || !is_string($record['label'] ?? null) || !is_string($record['type'] ?? null) || !array_key_exists('value',$record)) { return new WP_Error('invalid_design','Variables require cssVariableName, label, type and value.'); }
				} else {
					if (!in_array($record['type'] ?? '',array('class','selector'),true) || !is_string($record['name'] ?? null) || !$record['name'] || !is_array($record['properties'] ?? null) || !is_array($record['children'] ?? null)) { return new WP_Error('invalid_design','Selectors require name, type, properties and children.'); }
					if ($record['type']==='class' && !preg_match('/^[a-zA-Z_][a-zA-Z0-9_-]*$/D',$record['name'])) { return new WP_Error('invalid_design','Invalid class name.'); }
					foreach ($record['children'] as $child) { if (!is_array($child) || !is_string($child['id'] ?? null) || !is_string($child['name'] ?? null) || !is_array($child['properties'] ?? null)) { return new WP_Error('invalid_design','Invalid nested selector.'); } }
				}
			}
		}
		if ($scope==='preferences') {
			if (array_diff(array_keys($data),array_keys(\Breakdance\Preferences\getDefaultPreferences())) || array_diff(array_keys(\Breakdance\Preferences\getDefaultPreferences()),array_keys($data))) { return new WP_Error('invalid_design','Unknown preference key.'); }
			foreach (array('customFonts','designSets','customBreakpoints') as $key) { if (!is_array($data[$key]) || !array_is_list($data[$key])) { return new WP_Error('invalid_design','Preference collections must be arrays.'); } }
			if (!is_array($data['uiSettings'])) { return new WP_Error('invalid_design','UI settings must be an object.'); }
			foreach ($data['uiSettings'] as $key=>$value) { if (!in_array($key,array('autoScrollEnabled','showExperimentalElements'),true) || !is_bool($value)) { return new WP_Error('invalid_design','UI settings require known boolean flags.'); } }
			$ids=array_column(\Breakdance\Config\Breakpoints\get_builtin_breakpoints(),'id');
			foreach ($data['customBreakpoints'] ?? array() as $point) {
				if (!is_array($point) || !is_string($point['id'] ?? null) || !preg_match('/^breakpoint_[a-zA-Z0-9_-]+$/D',$point['id']) || in_array($point['id'],$ids,true) || !is_string($point['label'] ?? null) || !isset($point['defaultPreviewWidth']) || (!isset($point['minWidth']) && !isset($point['maxWidth']))) { return new WP_Error('invalid_design','Invalid or duplicate custom breakpoint.'); }
				foreach (array('minWidth','maxWidth','defaultPreviewWidth') as $key) { if (isset($point[$key]) && (!is_int($point[$key]) || $point[$key]<1 || $point[$key]>10000)) { return new WP_Error('invalid_design','Breakpoint widths must be positive integers up to 10000.'); } }
				if (isset($point['minWidth'],$point['maxWidth']) && $point['minWidth']>$point['maxWidth']) { return new WP_Error('invalid_design','Breakpoint minimum exceeds maximum.'); }
				$ids[]=$point['id'];
			}
		}
		return true;
	}

	public static function save(string $scope, array $data, string $expected) {
		// Advanced native documents can contain CSS and extension-defined expressions.
		if (!current_user_can('edit_theme_options') || !current_user_can('unfiltered_html')) { return new WP_Error('oxygen_forbidden','Advanced global design writes require edit_theme_options and unfiltered_html.'); }
		$valid=self::validate($scope,$data); if (is_wp_error($valid)) { return $valid; }
		$lock='emcp_oxygen_design_lock';
		if (!add_option($lock,time(),'',false)) { return new WP_Error('design_locked','Another global design save is in progress.'); }
		try {
			$before=self::read($scope); if (is_wp_error($before)) { return $before; }
			if (!hash_equals($before['content_hash'],$expected)) { return new WP_Error('stale_design','Read this design scope again.'); }
			if ($scope==='selectors') {
				$next=array_column($data['selectors'],null,'id');
				foreach ($before['data']['selectors'] as $selector) { if (!empty($selector['locked']) && ($next[$selector['id']] ?? null)!==$selector) { return new WP_Error('class_locked','Locked selectors cannot be changed or removed.'); } }
			}
			// Keep a complete prior document including collections/preferences, which native revisions omit.
			$history=(array)get_option('emcp_oxygen_design_revisions',array());
			$revision=wp_generate_uuid4();
			$history[$revision]=array('scope'=>$scope,'data'=>$before['data'],'time'=>time(),'author'=>get_current_user_id());
			update_option('emcp_oxygen_design_revisions',array_slice($history,-20,null,true),false);
			try {
				switch ($scope) {
					case 'variables': \Breakdance\Variables\saveVariables(wp_json_encode($data)); break;
					case 'selectors': \Breakdance\BreakdanceOxygen\Selectors\saveSelectors(wp_json_encode($data)); break;
					case 'settings': \Breakdance\Data\save_global_settings(wp_json_encode($data)); break;
					case 'preferences': \Breakdance\Data\set_global_option('preferences',wp_json_encode($data)); \Breakdance\Render\generateCacheForGlobalSettings(); break;
				}
			} catch (\Throwable $error) { return new WP_Error('save_failed','Native global save failed. Prior document revision: '.$revision); }
			$after=self::read($scope);
			if (is_wp_error($after) || $after['data']!==$data) { return new WP_Error('save_failed','Native global readback differs. Prior document revision: '.$revision); }
			return $after+array('revision_id'=>$revision);
		} finally { delete_option($lock); }
	}
}
