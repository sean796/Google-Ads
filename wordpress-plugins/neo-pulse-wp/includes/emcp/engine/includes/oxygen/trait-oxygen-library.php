<?php
/** Dependency-aware Oxygen design transfers. */
if (!defined('ABSPATH')) { exit; }

trait EMCP_Tools_Oxygen_Library_Operations {
	private function export_library(array $args) {
		$remote=isset($args['provider_index']);
		$queue=$args['post_ids']; $documents=array();
		while ($queue) {
			$id=(int)array_shift($queue); if (isset($documents[$id])) { continue; }
			if (count($documents)>=100) { return new WP_Error('library_limit','Export exceeds 100 documents including dependencies.'); }
			if ($remote) {
				$item=EMCP_Tools_Oxygen_Library::item($args['provider_index'],$id,in_array($id,$args['template_ids'] ?? array(),true));
				// Dependencies are native component/template records, never ordinary posts.
				if (is_wp_error($item) && !in_array($id,$args['post_ids'],true)) { $item=EMCP_Tools_Oxygen_Library::item($args['provider_index'],$id,true); }
			} else {
				$state=$this->get_page($id); if (is_wp_error($state)) { return $state; }
				$item=array('source_id'=>$id,'post_type'=>$state['post_type'],'title'=>$state['title'],'tree'=>$state['tree'],'settings'=>$state['template_settings']);
			}
			if (is_wp_error($item)) { return $item; }
			$documents[$id]=$item;
			$queue=array_merge($queue,EMCP_Tools_Oxygen_Library::references(array($item['tree'],$item['settings'])));
		}
		$bundle=array('format'=>'emcp-oxygen-1','documents'=>array_values($documents));
		foreach (array('variables','selectors') as $scope) {
			$data=$remote ? EMCP_Tools_Oxygen_Library::request($args['provider_index'],$scope==='variables'?'breakdance_get_variables_for_design_library':'breakdance_get_oxy_selectors_for_design_library') : EMCP_Tools_Oxygen_Design::read($scope)['data'];
			if (is_wp_error($data)) { return $data; } $bundle[$scope]=$data;
		}
		$valid=EMCP_Tools_Oxygen_Library::validate_bundle($bundle,array($this,'element_schema')); if (is_wp_error($valid)) { return $valid; }
		return array('bundle'=>$bundle,'bundle_hash'=>hash('sha256',wp_json_encode($bundle)),'note'=>'Contains native trees, referenced components/templates, variables and selectors. Media URLs remain external; WordPress content, custom fields and global preferences are not transferred.');
	}

	private function import_library(array $args) {
		if (!current_user_can('manage_options') || !current_user_can('unfiltered_html')) { return new WP_Error('oxygen_forbidden','Design import requires manage_options and unfiltered_html.'); }
		$bundle=$args['bundle'];
		if (!hash_equals(hash('sha256',wp_json_encode($bundle)),$args['bundle_hash'])) { return new WP_Error('stale_bundle','Bundle hash does not match the reviewed export.'); }
		$valid=EMCP_Tools_Oxygen_Library::validate_bundle($bundle,array($this,'element_schema')); if (is_wp_error($valid)) { return $valid; }
		$key='emcp_oxygen_import_'.hash('sha256',get_current_user_id().':'.$args['request_id']);
		$previous=get_option($key);
		if ($previous) { return $previous['bundle_hash']===$args['bundle_hash'] ? $previous : new WP_Error('request_conflict','This request ID belongs to another import.'); }
		if (!add_option('emcp_oxygen_import_lock',time(),'',false)) { return new WP_Error('import_locked','Another design import is running.'); }
		$result=array('bundle_hash'=>$args['bundle_hash'],'status'=>'in_progress','post_map'=>array(),'design_revisions'=>array());
		try {
			$previous=get_option($key);
			if ($previous) { return $previous['bundle_hash']===$args['bundle_hash'] ? $previous : new WP_Error('request_conflict','This request ID belongs to another import.'); }
			// Check both target documents before allocating records or saving styles.
			$states=array();
			foreach (array('variables','selectors') as $scope) {
				$states[$scope]=EMCP_Tools_Oxygen_Design::read($scope);
				if (!hash_equals($states[$scope]['content_hash'],$args[$scope.'_hash'])) { return new WP_Error('stale_design','Read both target design scopes before importing.'); }
			}
			foreach ($bundle['documents'] as $item) {
				$object=get_post_type_object($item['post_type']);
				if (!$object || !current_user_can($object->cap->create_posts) || !\Breakdance\Permissions\isPostTypeAllowed($item['post_type'])) { return new WP_Error('oxygen_forbidden','Import post-type permission denied.'); }
				if (!empty($item['settings']['ruleGroups'])) { $valid=EMCP_Tools_Oxygen_Conditions::validate($item['settings']['ruleGroups'],EMCP_Tools_Oxygen_Conditions::catalog()); if (is_wp_error($valid)) { return $valid; } }
			}
			foreach ($bundle['selectors']['selectors'] as $selector) { if ($selector['type']!=='class') { return new WP_Error('invalid_bundle','Import class selectors only; apply global selectors explicitly with save-design-state.'); } }
			add_option($key,$result,'',false);
			$map=array(); $prefix='emcp-'.substr(wp_generate_uuid4(),0,8).'-';
			foreach (array('variables','selectors') as $scope) { foreach ($bundle[$scope][$scope] as $record) { $map[$record['id']]=wp_generate_uuid4(); } }
			foreach (array('variables','selectors') as $scope) {
				$data=$states[$scope]['data'];
				foreach ($bundle[$scope][$scope] as $record) {
					$record=EMCP_Tools_Oxygen_Library::remap($record,array(),$map);
					$record['collection']=$prefix.$record['collection'];
					if ($scope==='variables') { $record['cssVariableName']=$prefix.$record['cssVariableName']; }
					elseif ($record['type']==='class') { $record['name']=$prefix.$record['name']; }
					else { throw new \RuntimeException('Imports of global CSS selectors require an explicit save-design-state operation; class selectors can be imported.'); }
					foreach ($record['children'] ?? array() as $index=>$child) { $record['children'][$index]['id']=wp_generate_uuid4(); }
					$data[$scope][]=$record;
					if (!in_array($record['collection'],$data['collections'],true)) { $data['collections'][]=$record['collection']; }
				}
				if ($data!==$states[$scope]['data']) {
					$saved=EMCP_Tools_Oxygen_Design::save($scope,$data,$states[$scope]['content_hash']);
					if (is_wp_error($saved)) { throw new \RuntimeException($saved->get_error_message()); }
					$result['design_revisions'][$scope]=$saved['revision_id']; update_option($key,$result,false);
				}
			}
			foreach ($bundle['documents'] as $item) {
				$kind=in_array($item['post_type'],array('page','post'),true)?$item['post_type']:array_search($item['post_type'],$this->library_types(),true);
				$created=$this->create_library_item(array('kind'=>$kind,'title'=>$item['title'].' (import)'));
				if (is_wp_error($created)) { throw new \RuntimeException($created->get_error_message()); }
				$result['post_map'][$item['source_id']]=$created['post_id']; update_option($key,$result,false);
			}
			$this->native_write=true;
			// Dependencies are saved first so component validation sees their completed trees.
			$pending=array_column($bundle['documents'],null,'source_id'); $completed=array();
			while ($pending) {
				foreach ($pending as $source=>$item) {
					if (array_diff(EMCP_Tools_Oxygen_Library::references(array($item['tree'],$item['settings'])),$completed)) { continue; }
					$id=$result['post_map'][$source]; $state=$this->get_page($id);
					$tree=EMCP_Tools_Oxygen_Library::remap($item['tree'],$result['post_map'],$map);
					$saved=$this->mutate('set-page-tree',array('post_id'=>$id,'expected_hash'=>$state['content_hash'],'tree'=>$tree));
					if (is_wp_error($saved)) { throw new \RuntimeException($saved->get_error_message()); }
					if (in_array($item['post_type'],array(BREAKDANCE_TEMPLATE_POST_TYPE,BREAKDANCE_HEADER_POST_TYPE,BREAKDANCE_FOOTER_POST_TYPE),true)) {
						$settings=array_intersect_key($item['settings'] ?? array(),array_flip(array('type','priority','ruleGroups','parentId')));
						$settings=EMCP_Tools_Oxygen_Library::remap($settings,$result['post_map'],array()); $settings['disabled']=true;
						$saved=$this->update_template_settings(array('post_id'=>$id,'expected_hash'=>$saved['content_hash'],'settings'=>$settings));
						if (is_wp_error($saved)) { throw new \RuntimeException($saved->get_error_message()); }
					}
					$completed[]=$source; unset($pending[$source]);
				}
			}
			$result['status']='complete';
		} catch (\Throwable $error) { $result['status']='partial'; $result['error']=$error->getMessage(); }
		finally { $this->native_write=false; delete_option('emcp_oxygen_import_lock'); }
		update_option($key,$result,false);
		return $result;
	}
}
