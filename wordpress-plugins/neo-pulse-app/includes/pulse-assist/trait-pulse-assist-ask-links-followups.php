<?php
/**
 * Destination link handling and follow-up topic generation.
 *
 * @package Neo_Pulse_App
 */

defined( 'ABSPATH' ) || exit;

trait Neo_Pulse_App_Pulse_Assist_Ask_Trait_Links_Followups {

	/**
	 * @param array<int,array<string,mixed>>   $links
	 * @param array<string,mixed>|null         $research
	 * @return array<int,array<string,mixed>>
	 */
	private static function filter_links_to_scope( array $links, string $body_text, ?array $research ): array {
		if ( count( $links ) === 0 ) {
			return array();
		}

		$primary_modules = array();
		if ( $research !== null && ! empty( $research['primaryModules'] ) && is_array( $research['primaryModules'] ) ) {
			$primary_modules = $research['primaryModules'];
		}

		$allowed_nav = array();
		foreach ( $primary_modules as $mod ) {
			if ( ! is_array( $mod ) || empty( $mod['pulseNav'] ) ) {
				continue;
			}
			$allowed_nav[ (string) $mod['pulseNav'] ] = $mod;
		}

		$body_lower = strtolower( $body_text );
		$filtered   = array();
		foreach ( $links as $link ) {
			if ( ! is_array( $link ) || empty( $link['url'] ) ) {
				continue;
			}
			$url         = (string) $link['url'];
			$in_body_md  = str_contains( $body_text, '](' . $url . ')' );
			$mod         = isset( $allowed_nav[ $url ] ) ? $allowed_nav[ $url ] : null;
			$path        = is_array( $mod ) && ! empty( $mod['menuPath'] ) ? (string) $mod['menuPath'] : '';
			$label       = is_array( $mod ) && ! empty( $mod['label'] ) ? (string) $mod['label'] : '';
			$mentioned   = $in_body_md
				|| ( $path !== '' && str_contains( $body_lower, strtolower( $path ) ) )
				|| ( $label !== '' && str_contains( $body_lower, strtolower( $label ) ) );

			if ( $mod !== null && $mentioned ) {
				$filtered[] = $link;
				continue;
			}
			if ( $mod === null && $in_body_md ) {
				$filtered[] = $link;
			}
		}

		return array_slice( self::sanitize_links( $filtered ), 0, 2 );
	}

	/**
	 * @param array<string,mixed>      $card
	 * @param array<string,mixed>|null $research
	 * @return array<string,mixed>
	 */
	private static function ensure_destination_links( array $card, ?array $research ): array {
		$links     = isset( $card['links'] ) && is_array( $card['links'] ) ? $card['links'] : array();
		$seen      = array();
		$body_text = (string) ( $card['body'] ?? '' );

		foreach ( $links as $link ) {
			if ( ! empty( $link['url'] ) ) {
				$seen[ (string) $link['url'] ] = true;
			}
		}

		if ( preg_match_all( '/\[([^\]]+)\]\((pulse:nav\/[^)]+)\)/', $body_text, $md_matches, PREG_SET_ORDER ) ) {
			foreach ( $md_matches as $m ) {
				$url = (string) $m[2];
				if ( isset( $seen[ $url ] ) ) {
					continue;
				}
				$links[] = array(
					'label'  => (string) $m[1],
					'url'    => $url,
					'action' => 'navigate',
				);
				$seen[ $url ] = true;
			}
		}

		if ( $research !== null && ! empty( $research['primaryModules'] ) && is_array( $research['primaryModules'] ) ) {
			$modules    = $research['primaryModules'];
			$body_lower = strtolower( $body_text );

			foreach ( $modules as $mod ) {
				if ( ! is_array( $mod ) ) {
					continue;
				}
				$path  = isset( $mod['menuPath'] ) ? (string) $mod['menuPath'] : '';
				$nav   = isset( $mod['pulseNav'] ) ? (string) $mod['pulseNav'] : '';
				$label = isset( $mod['label'] ) ? (string) $mod['label'] : '';
				if ( $nav === '' ) {
					continue;
				}

				$mentioned = ( $path !== '' && str_contains( $body_lower, strtolower( $path ) ) )
					|| ( $label !== '' && str_contains( $body_lower, strtolower( $label ) ) );

				if ( $mentioned && ! isset( $seen[ $nav ] ) ) {
					$links[] = array(
						'label'  => $path !== '' ? $path : $label,
						'url'    => $nav,
						'action' => 'navigate',
					);
					$seen[ $nav ] = true;
				}
			}

			$body_text = self::inject_module_links_in_body( $body_text, $modules );
		}

		$links = self::filter_links_to_scope( $links, $body_text, $research );

		if ( count( $links ) > 0 ) {
			$card['links'] = $links;
		} else {
			unset( $card['links'] );
		}

		$card['body'] = $body_text;
		return $card;
	}

	/**
	 * @param array<int,array<string,mixed>> $modules
	 */
	private static function inject_module_links_in_body( string $body, array $modules ): string {
		foreach ( $modules as $mod ) {
			if ( ! is_array( $mod ) ) {
				continue;
			}
			$path = isset( $mod['menuPath'] ) ? (string) $mod['menuPath'] : '';
			$nav  = isset( $mod['pulseNav'] ) ? (string) $mod['pulseNav'] : '';
			$hash = isset( $mod['hash'] ) ? (string) $mod['hash'] : '';
			if ( $path === '' || $nav === '' ) {
				continue;
			}
			if ( str_contains( $body, '](' . $nav . ')' ) || ( $hash !== '' && str_contains( $body, '](' . $hash . ')' ) ) ) {
				continue;
			}

			$linked = '[' . $path . '](' . $nav . ')';
			$bold   = '**' . $path . '**';
			if ( str_contains( $body, $bold ) ) {
				$replaced = preg_replace( '/\*\*' . preg_quote( $path, '/' ) . '\*\*/', $linked, $body, 1 );
				$body     = is_string( $replaced ) ? $replaced : $body;
				continue;
			}
			if ( str_contains( $body, $path ) ) {
				$replaced = preg_replace( '/' . preg_quote( $path, '/' ) . '/', $linked, $body, 1 );
				$body     = is_string( $replaced ) ? $replaced : $body;
			}
		}
		return $body;
	}

	/**
	 * @param array<string,mixed>      $card
	 * @param array<string,mixed>|null $research
	 * @return array<string,mixed>
	 */
	private static function ensure_topic_followups( array $card, string $message, ?array $research ): array {
		$topics = isset( $card['relatedTopics'] ) && is_array( $card['relatedTopics'] ) ? $card['relatedTopics'] : array();
		if ( self::followups_are_generic( $topics ) && $research !== null ) {
			$generated = self::followups_from_playbooks( $research, $message );
			if ( count( $generated ) > 0 ) {
				$card['relatedTopics'] = $generated;
			}
		}
		return $card;
	}

	/**
	 * @param array<int,string> $topics
	 */
	private static function followups_are_generic( array $topics ): bool {
		if ( count( $topics ) === 0 ) {
			return true;
		}
		$generic = self::generic_followup_topics();
		$hits    = 0;
		foreach ( $topics as $topic ) {
			foreach ( $generic as $g ) {
				if ( strcasecmp( trim( (string) $topic ), trim( $g ) ) === 0 ) {
					++$hits;
					break;
				}
			}
		}
		return $hits >= 2 || $hits === count( $topics );
	}

	/**
	 * @return array<int,string>
	 */
	private static function generic_followup_topics(): array {
		return array(
			'What can I do on this tab?',
			'What property am I working on?',
			'Explain Page vs Site scope',
		);
	}

	/**
	 * @param array<string,mixed> $research
	 * @return array<int,string>
	 */
	private static function followups_from_playbooks( array $research, string $user_message ): array {
		$msg_lower  = strtolower( trim( $user_message ) );
		$candidates = array();
		$seen       = array();

		if ( ! empty( $research['features'] ) && is_array( $research['features'] ) ) {
			foreach ( $research['features'] as $feat ) {
				if ( ! is_array( $feat ) || empty( $feat['moduleId'] ) ) {
					continue;
				}
				foreach ( Neo_Pulse_App_Pulse_Assist_Module_Catalog::playbooks_for_module( (string) $feat['moduleId'] ) as $pb ) {
					$id = isset( $pb['id'] ) ? (string) $pb['id'] : '';
					if ( $id !== '' && ! isset( $seen[ $id ] ) ) {
						$candidates[] = $pb;
						$seen[ $id ]  = true;
					}
				}
			}
		}

		if ( ! empty( $research['primaryModuleIds'] ) && is_array( $research['primaryModuleIds'] ) ) {
			foreach ( $research['primaryModuleIds'] as $module_id ) {
				foreach ( Neo_Pulse_App_Pulse_Assist_Module_Catalog::playbooks_for_module( (string) $module_id ) as $pb ) {
					$id = isset( $pb['id'] ) ? (string) $pb['id'] : '';
					if ( $id !== '' && ! isset( $seen[ $id ] ) ) {
						$candidates[] = $pb;
						$seen[ $id ]  = true;
					}
				}
			}
		}

		$topics = array();
		foreach ( $candidates as $pb ) {
			$q = isset( $pb['question'] ) ? trim( (string) $pb['question'] ) : '';
			if ( $q === '' ) {
				continue;
			}
			if ( strcasecmp( $q, trim( $user_message ) ) === 0 ) {
				continue;
			}
			if ( str_contains( $msg_lower, strtolower( $q ) ) ) {
				continue;
			}
			$topics[] = $q;
			if ( count( $topics ) >= 3 ) {
				break;
			}
		}

		return array_slice( array_values( array_unique( $topics ) ), 0, 3 );
	}
}
