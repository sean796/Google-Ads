<?php
/** Design Library transport and native export envelopes. */
if (!defined('ABSPATH')) { exit; }

class EMCP_Tools_Oxygen_Library {
	/** References are structural IDs, never arbitrary numbers embedded in text. */
	public static function references($value, string $key=''): array {
		$ids=array();
		if (is_array($value)) { foreach ($value as $name=>$child) { $ids=array_merge($ids,self::references($child,(string)$name)); } }
		elseif (in_array($key,array('componentId','global_block','block','when_empty','after_title_bar','after_footer','parentId'),true) && (is_int($value) || (is_string($value) && ctype_digit($value))) && (int)$value>0) { $ids[]=(int)$value; }
		return array_values(array_unique($ids));
	}

	public static function validate_bundle(array $bundle, callable $schema) {
		if (($bundle['format'] ?? '')!=='emcp-oxygen-1' || !is_array($bundle['documents'] ?? null) || !array_is_list($bundle['documents']) || !$bundle['documents'] || count($bundle['documents'])>100 || strlen(wp_json_encode($bundle))>10000000) { return new WP_Error('invalid_bundle','Expected an emcp-oxygen-1 bundle with 1–100 documents, up to 10 MB.'); }
		$documents=array();
		foreach ($bundle['documents'] as $item) {
			if (!is_array($item) || !is_int($item['source_id'] ?? null) || $item['source_id']<1 || isset($documents[$item['source_id']]) || !is_string($item['title'] ?? null) || !trim($item['title']) || !in_array($item['post_type'] ?? '',array('page','post',BREAKDANCE_TEMPLATE_POST_TYPE,BREAKDANCE_HEADER_POST_TYPE,BREAKDANCE_FOOTER_POST_TYPE,BREAKDANCE_BLOCK_POST_TYPE),true) || !is_array($item['tree'] ?? null)) { return new WP_Error('invalid_bundle','Invalid or duplicate document identity.'); }
			$valid=EMCP_Tools_Oxygen_Tree::validate($item['tree'],$schema,true); if (is_wp_error($valid)) { return $valid; }
			if (isset($item['settings']) && !is_array($item['settings'])) { return new WP_Error('invalid_bundle','Template settings must be a native object or null.'); }
			$documents[$item['source_id']]=$item;
		}
		$visited=array(); $visit=function($id,array $ancestors) use (&$visit,$documents,&$visited) {
			if (in_array($id,$ancestors,true) || count($ancestors)>30) { return new WP_Error('invalid_bundle','Cyclic or excessively nested document dependencies.'); }
			if (!isset($documents[$id])) { return new WP_Error('invalid_bundle','Bundle is missing referenced document '.$id.'.'); }
			if (isset($visited[$id])) { return true; }
			foreach (self::references(array($documents[$id]['tree'],$documents[$id]['settings'] ?? array())) as $reference) { $valid=$visit($reference,array_merge($ancestors,array($id))); if (is_wp_error($valid)) { return $valid; } }
			$visited[$id]=true; return true;
		};
		foreach (array_keys($documents) as $id) { $valid=$visit($id,array()); if (is_wp_error($valid)) { return $valid; } }
		foreach (array('variables','selectors') as $scope) {
			if (!is_array($bundle[$scope] ?? null)) { return new WP_Error('invalid_bundle','Missing native design document.'); }
			$valid=EMCP_Tools_Oxygen_Design::validate($scope,$bundle[$scope]); if (is_wp_error($valid)) { return $valid; }
		}
		return true;
	}
	public static function options(): array {
		return array('is_copy_from_frontend_enabled','is_copy_button_on_frontend_enabled','design_library_relies_on_global_settings','design_library_relies_on_design_presets','design_library_hide_on_this_website','design_library_hide_in_builder','design_library_full_site_import_enabled');
	}
	public static function state(): array {
		$data=array(); foreach (self::options() as $key) { $data[$key]=\Breakdance\Data\get_global_option($key)==='yes'; }
		$sets=\Breakdance\DesignLibrary\getRegisteredDesignSets();
		$raw=array($data,$sets,\Breakdance\DesignLibrary\getPassword());
		return array('settings'=>$data,'sets'=>array_map(static function($url,$index) {
			$parts=wp_parse_url($url);
			return array('index'=>$index,'url'=>($parts['scheme'] ?? 'https').'://'.($parts['host'] ?? '').(isset($parts['port'])?':'.$parts['port']:'').($parts['path'] ?? ''));
		},$sets,array_keys($sets)), 'password_protected'=>\Breakdance\DesignLibrary\isPasswordProtected(), 'content_hash'=>hash('sha256',wp_json_encode($raw)));
	}
	public static function configure(array $args) {
		if (!current_user_can('manage_options')) { return new WP_Error('oxygen_forbidden','Design Library configuration requires manage_options.'); }
		$lock='emcp_oxygen_library_lock'; if (!add_option($lock,time(),'',false)) { return new WP_Error('library_locked','Library configuration is being changed.'); }
		try {
			if (!hash_equals(self::state()['content_hash'],$args['expected_hash'])) { return new WP_Error('stale_library','Read Design Library state again.'); }
			$patch=$args['settings'] ?? array();
			foreach ($patch as $key=>$value) { if (!in_array($key,self::options(),true) || !is_bool($value)) { return new WP_Error('invalid_settings','Library settings must be known boolean options.'); } }
			if (isset($args['sets'])) {
				if (!is_array($args['sets']) || !array_is_list($args['sets']) || count($args['sets'])>100) { return new WP_Error('invalid_library','Provide up to 100 design-set URLs.'); }
				foreach ($args['sets'] as $url) { $parts=is_string($url)?wp_parse_url($url):false; if (!$parts || !in_array($parts['scheme'] ?? '',array('http','https'),true) || empty($parts['host']) || isset($parts['user']) || isset($parts['pass'])) { return new WP_Error('invalid_library','Design sets require HTTP(S) URLs without user-info credentials.'); } }
			}
			foreach ($patch as $key=>$value) { \Breakdance\Data\set_global_option($key,$value?'yes':'no'); }
			if (isset($args['sets'])) { \Breakdance\Data\set_global_option('design_sets',$args['sets']); delete_transient('breakdance_design_providers'); }
			if (isset($args['password'])) { \Breakdance\DesignLibrary\setPassword($args['password']); }
			return self::state();
		} finally { delete_option($lock); }
	}

	/** Use only an already registered provider, and WordPress's safe HTTP transport. */
	public static function request(int $index, string $action, array $args=array()) {
		$sets=\Breakdance\DesignLibrary\getRegisteredDesignSets();
		$url=$sets[$index] ?? null;
		if (!$url) { return new WP_Error('invalid_provider','Choose a registered Design Library set index.'); }
		$parts=wp_parse_url($url);
		if (!$parts || !in_array($parts['scheme'] ?? '',array('https','http'),true) || isset($parts['user']) || isset($parts['pass'])) { return new WP_Error('invalid_provider','Provider URL is invalid.'); }
		$endpoint=$parts['scheme'].'://'.$parts['host'].(isset($parts['port'])?':'.$parts['port']:'').rtrim($parts['path'] ?? '','/').'/wp-admin/admin-ajax.php'.(isset($parts['query'])?'?'.$parts['query']:'');
		$response=wp_safe_remote_post($endpoint,array('timeout'=>20,'redirection'=>0,'limit_response_size'=>5000000,'body'=>array_merge(array('action'=>$action),$args)));
		if (is_wp_error($response)) { return new WP_Error('library_fetch_failed','Could not fetch the registered design set. Check its URL, availability and WordPress safe-HTTP policy.'); }
		if (wp_remote_retrieve_response_code($response)!==200) { return new WP_Error('library_fetch_failed','Design set returned a non-success HTTP status.'); }
		$data=json_decode(wp_remote_retrieve_body($response),true);
		if (!is_array($data) || isset($data['error'])) { return new WP_Error('library_fetch_failed','Design set returned invalid data or denied access.'); }
		return $data;
	}

	/** Decode a single remote native export without inserting posts or executing code. */
	public static function item(int $index, int $id, bool $template) {
		$data=self::request($index,$template?'breakdance_design_lib_get_template_data':'breakdance_design_lib_get_post_data',array('id'=>$id));
		if (is_wp_error($data)) { return $data; }
		$type=$template?($data['postType'] ?? ''):($data['postData']['post_type'] ?? '');
		if (!in_array($type,array('page','post',BREAKDANCE_TEMPLATE_POST_TYPE,BREAKDANCE_HEADER_POST_TYPE,BREAKDANCE_FOOTER_POST_TYPE,BREAKDANCE_BLOCK_POST_TYPE),true)) { return new WP_Error('invalid_library','Unsupported remote document type.'); }
		$tree=json_decode($data['breakdanceData']['tree_json_string'] ?? '',true);
		if (!is_array($tree)) { return new WP_Error('invalid_library','Design item has no native Oxygen tree.'); }
		$settings=$data['settings'] ?? null; if (is_string($settings)) { $settings=json_decode($settings,true); }
		return array('source_id'=>$id,'post_type'=>$type,'title'=>$template?($data['title'] ?? ''):($data['postData']['post_title'] ?? ''),'tree'=>$tree,'settings'=>$settings);
	}

	/** Exact value replacement prevents ID 12 accidentally modifying ID 123. */
	public static function remap($value, array $posts, array $design, string $key='') {
		if (is_array($value)) {
			// These native conditions contain post IDs; taxonomy/user conditions do not.
			if (is_string($value['ruleSlug'] ?? null) && (strpos($value['ruleSlug'],'post-dropdown-')===0 || $value['ruleSlug']==='has-parent-page')) {
				$map_value=static function($id) use ($posts) { return (is_int($id) || (is_string($id) && ctype_digit($id))) && isset($posts[(int)$id]) ? (is_string($id)?(string)$posts[(int)$id]:$posts[(int)$id]) : $id; };
				if (is_array($value['value'] ?? null)) { foreach ($value['value'] as &$selected) { if (is_array($selected) && isset($selected['value'])) { $selected['value']=$map_value($selected['value']); } else { $selected=$map_value($selected); } } unset($selected); }
				elseif (isset($value['value'])) { $value['value']=$map_value($value['value']); }
			}
			foreach ($value as $name=>$child) { $value[$name]=self::remap($child,$posts,$design,(string)$name); } return $value;
		}
		if (in_array($key,array('componentId','global_block','block','when_empty','after_title_bar','after_footer','parentId'),true) && (is_int($value) || (is_string($value) && ctype_digit($value))) && isset($posts[(int)$value])) { return $posts[(int)$value]; }
		if (is_string($value)) {
			if (isset($design[$value])) { return $design[$value]; }
			foreach ($design as $old=>$new) { $value=str_replace('{var-'.$old.'}','{var-'.$new.'}',$value); }
		}
		return $value;
	}
}
