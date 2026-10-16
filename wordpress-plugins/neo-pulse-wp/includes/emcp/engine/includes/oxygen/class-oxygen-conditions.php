<?php
/** Native Oxygen condition discovery and validation. */
if (!defined('ABSPATH')) { exit; }

class EMCP_Tools_Oxygen_Conditions {
	public static function catalog(): array {
		$controller = \Breakdance\Themeless\ThemelessController::getInstance();
		if (!$controller->templateTypeCategories) { bdox_run_action('breakdance_register_template_types_and_conditions'); }
		return $controller->conditions;
	}

	public static function schema(): array {
		$result = array();
		foreach (self::catalog() as $condition) {
			$row = array_intersect_key($condition,array_flip(array('slug','label','category','operands','valueInputType','availableForType','supports')));
			$row['executable'] = (bool)preg_match('/php|custom-code/i',$condition['slug']);
			$result[] = $row;
		}
		return $result;
	}

	/** Match native OR groups of AND rules; never evaluate condition callbacks. */
	public static function validate($groups, array $catalog, string $context = 'templating') {
		if (!is_array($groups) || !array_is_list($groups) || count($groups)>50) { return new WP_Error('invalid_conditions','Provide up to 50 condition groups.'); }
		$conditions = array_column($catalog,null,'slug');
		foreach ($groups as $group) {
			if (!is_array($group) || !array_is_list($group) || !$group || count($group)>50) { return new WP_Error('invalid_conditions','Each group must contain 1–50 rules.'); }
			foreach ($group as $rule) {
				if (!is_array($rule) || array_diff(array_keys($rule),array('ruleSlug','ruleCategorySlug','operand','value','ruleDynamic'))) { return new WP_Error('invalid_conditions','Malformed condition rule.'); }
				$slug = $rule['ruleSlug'] ?? null;
				$condition = is_string($slug) ? ($conditions[$slug] ?? null) : null;
				if (!$condition || !in_array($context,$condition['supports'] ?? array(),true) || !in_array($rule['operand'] ?? null,$condition['operands'],true)) { return new WP_Error('invalid_conditions','Unknown condition, unsupported context or invalid operand.'); }
				if (preg_match('/php|custom-code/i',$slug) && !current_user_can('unfiltered_html')) { return new WP_Error('oxygen_forbidden','Executable conditions require unfiltered_html.'); }
				$value = $rule['value'] ?? null;
				if (is_array($value)) {
					if (!array_is_list($value) || count($value)>500) { return new WP_Error('invalid_conditions','Condition values must be a bounded list.'); }
					foreach ($value as $item) {
						if (!is_scalar($item) && !(is_array($item) && isset($item['value']) && is_scalar($item['value']) && !array_diff(array_keys($item),array('text','value')))) { return new WP_Error('invalid_conditions','Invalid selected condition value.'); }
					}
				} elseif ($value !== null && !is_scalar($value)) { return new WP_Error('invalid_conditions','Invalid condition value.'); }
				if (!empty($rule['ruleDynamic']) && !current_user_can('unfiltered_html')) { return new WP_Error('oxygen_forbidden','Dynamic condition expressions require unfiltered_html.'); }
				if (isset($rule['ruleDynamic']) && !is_string($rule['ruleDynamic'])) { return new WP_Error('invalid_conditions','Dynamic expression must be a string.'); }
			}
		}
		return true;
	}
}
