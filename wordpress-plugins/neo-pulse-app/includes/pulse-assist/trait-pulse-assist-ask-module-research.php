<?php
/**
 * Module research and related module expansion.
 *
 * @package Neo_Pulse_App
 */

defined( 'ABSPATH' ) || exit;

trait Neo_Pulse_App_Pulse_Assist_Ask_Trait_Module_Research {

	/**
	 * @param array<int,array<string,mixed>> $history
	 * @param array<string,mixed>            $body
	 * @return array{block:string,label:string,moduleIds:array<int,string>,primaryModuleIds:array<int,string>,featureIds:array<int,string>,modules:array<int,array<string,mixed>>,primaryModules:array<int,array<string,mixed>>,features:array<int,array<string,mixed>>}
	 */
	private static function research_modules_for_message( string $message, array $history, array $body ): array {
		$pulse = isset( $body['pulse_context'] ) && is_array( $body['pulse_context'] ) ? $body['pulse_context'] : array();

		$module_queries = array();

		$current = Neo_Pulse_App_Pulse_Assist_Module_Catalog::current_module_id_from_context( $pulse );
		if ( $current !== null && $current !== '' ) {
			$module_queries[] = $current;
		}

		$classify = self::classify_research_targets( $message, $pulse );
		foreach ( $classify['moduleIds'] as $id ) {
			$module_queries[] = $id;
		}

		$features = Neo_Pulse_App_Pulse_Assist_Module_Catalog::lookup_features( array( $message ), 2 );
		$seen_feat = array();
		foreach ( $features as $feat ) {
			if ( ! empty( $feat['id'] ) ) {
				$seen_feat[ (string) $feat['id'] ] = true;
			}
		}
		foreach ( $classify['featureIds'] as $id ) {
			$feat = Neo_Pulse_App_Pulse_Assist_Module_Catalog::feature_by_id( (string) $id );
			if ( $feat === null || empty( $feat['id'] ) ) {
				continue;
			}
			$fid = (string) $feat['id'];
			if ( isset( $seen_feat[ $fid ] ) ) {
				continue;
			}
			$features[]       = $feat;
			$seen_feat[ $fid ] = true;
		}
		foreach ( $features as $feat ) {
			if ( ! empty( $feat['moduleId'] ) ) {
				$module_queries[] = (string) $feat['moduleId'];
			}
		}

		$modules  = Neo_Pulse_App_Pulse_Assist_Module_Catalog::lookup_modules( $module_queries );
		$expanded = self::expand_related_modules( $modules, 6 );

		if ( count( $features ) > 4 ) {
			$features = array_slice( $features, 0, 4 );
		}

		$labels = array();
		foreach ( array_slice( $features, 0, 2 ) as $feat ) {
			if ( ! empty( $feat['label'] ) ) {
				$labels[] = (string) $feat['label'];
			}
		}
		if ( count( $labels ) === 0 ) {
			foreach ( array_slice( $expanded, 0, 3 ) as $mod ) {
				if ( ! empty( $mod['label'] ) ) {
					$labels[] = (string) $mod['label'];
				}
			}
		}

		$primary_module_ids = array();
		foreach ( $modules as $mod ) {
			if ( ! empty( $mod['id'] ) ) {
				$primary_module_ids[] = (string) $mod['id'];
			}
		}

		$module_ids = array();
		foreach ( $expanded as $mod ) {
			if ( ! empty( $mod['id'] ) ) {
				$module_ids[] = (string) $mod['id'];
			}
		}

		$feature_ids = array();
		foreach ( $features as $feat ) {
			if ( ! empty( $feat['id'] ) ) {
				$feature_ids[] = (string) $feat['id'];
			}
		}

		$block = Neo_Pulse_App_Pulse_Assist_Module_Catalog::format_modules_block( $expanded );
		$feat_block = Neo_Pulse_App_Pulse_Assist_Module_Catalog::format_features_block( $features );
		if ( $feat_block !== '' ) {
			$block = trim( $block . "\n\n" . $feat_block );
		}

		return array(
			'block'             => $block,
			'label'             => count( $labels ) > 0 ? implode( ', ', $labels ) : 'app modules',
			'moduleIds'         => $module_ids,
			'primaryModuleIds'  => $primary_module_ids,
			'featureIds'        => $feature_ids,
			'modules'           => $expanded,
			'primaryModules'    => $modules,
			'features'          => $features,
		);
	}

	/**
	 * @param array<string,mixed> $pulse
	 * @return array{moduleIds:array<int,string>,featureIds:array<int,string>}
	 */
	private static function classify_research_targets( string $message, array $pulse ): array {
		$module_ids  = array();
		$feature_ids = array();

		foreach ( Neo_Pulse_App_Pulse_Assist_Module_Catalog::all_modules() as $mod ) {
			if ( ! empty( $mod['id'] ) ) {
				$module_ids[] = (string) $mod['id'];
			}
		}
		foreach ( Neo_Pulse_App_Pulse_Assist_Module_Catalog::all_feature_playbooks() as $feat ) {
			if ( ! empty( $feat['id'] ) ) {
				$feature_ids[] = (string) $feat['id'];
			}
		}

		if ( count( $module_ids ) === 0 && count( $feature_ids ) === 0 ) {
			return array(
				'moduleIds'  => array(),
				'featureIds' => array(),
			);
		}

		$location = ! empty( $pulse['locationSummary'] ) ? sanitize_text_field( (string) $pulse['locationSummary'] ) : '';
		$system   = 'Return JSON only: {"moduleIds":["id1"],"featureIds":["chat/create-channel"],"reason":"brief"}. Pick 1-4 module ids. Use featureIds only when the user asks how to do one specific feature (e.g. create a channel). For general module questions (e.g. "Is there chat?", "Can I chat with users?"), use moduleIds only and leave featureIds empty.';
		$user     = 'Module ids: ' . implode( ', ', $module_ids ) . "\nFeature ids: " . implode( ', ', $feature_ids ) . "\nCurrent location: " . $location . "\nUser message: " . $message;

		$raw = Neo_Pulse_App_Chat_Openrouter::chat_text(
			array(
				array(
					'role'    => 'system',
					'content' => $system,
				),
				array(
					'role'    => 'user',
					'content' => $user,
				),
			),
			array(
				'temperature' => 0.1,
				'maxTokens'   => 280,
			)
		);

		$parsed = self::parse_json_card( $raw );
		if ( ! is_array( $parsed ) ) {
			return array(
				'moduleIds'  => array(),
				'featureIds' => array(),
			);
		}

		$out_modules = array();
		if ( ! empty( $parsed['moduleIds'] ) && is_array( $parsed['moduleIds'] ) ) {
			foreach ( $parsed['moduleIds'] as $id ) {
				if ( ! is_scalar( $id ) ) {
					continue;
				}
				$out_modules[] = sanitize_text_field( (string) $id );
				if ( count( $out_modules ) >= 4 ) {
					break;
				}
			}
		}

		$out_features = array();
		if ( ! empty( $parsed['featureIds'] ) && is_array( $parsed['featureIds'] ) ) {
			foreach ( $parsed['featureIds'] as $id ) {
				if ( ! is_scalar( $id ) ) {
					continue;
				}
				$out_features[] = sanitize_text_field( (string) $id );
				if ( count( $out_features ) >= 4 ) {
					break;
				}
			}
		}

		return array(
			'moduleIds'  => $out_modules,
			'featureIds' => $out_features,
		);
	}

	/**
	 * @param array<int,array<string,mixed>> $modules
	 * @return array<int,array<string,mixed>>
	 */
	private static function expand_related_modules( array $modules, int $cap ): array {
		$expanded = $modules;
		$seen     = array();
		foreach ( $modules as $mod ) {
			if ( ! empty( $mod['id'] ) ) {
				$seen[ (string) $mod['id'] ] = true;
			}
		}
		foreach ( $modules as $mod ) {
			if ( empty( $mod['relatedModules'] ) || ! is_array( $mod['relatedModules'] ) ) {
				continue;
			}
			foreach ( $mod['relatedModules'] as $rel ) {
				if ( count( $expanded ) >= $cap ) {
					return $expanded;
				}
				$rel_id = is_scalar( $rel ) ? (string) $rel : '';
				if ( $rel_id === '' || isset( $seen[ $rel_id ] ) ) {
					continue;
				}
				$rel_mod = Neo_Pulse_App_Pulse_Assist_Module_Catalog::module_by_id( $rel_id );
				if ( $rel_mod ) {
					$expanded[]       = $rel_mod;
					$seen[ $rel_id ] = true;
				}
			}
		}
		return $expanded;
	}
}
