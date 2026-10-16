<?php
/**
 * Checklist + blueprint generation for body harness.
 *
 * @package Neo_Pulse_Wp
 */

defined( 'ABSPATH' ) || exit;

class Neo_Pulse_Wp_Harness_Blueprint {

	/**
	 * @param array<string,mixed> $ctx
	 * @return array{checklist:array<int,string>,blueprint:array<string,mixed>}|WP_Error
	 */
	public static function build( array $ctx ) {
		$checklist = self::generate_checklist( $ctx );
		if ( is_wp_error( $checklist ) ) {
			return $checklist;
		}
		$blueprint = self::generate_blueprint( $checklist, $ctx );
		if ( is_wp_error( $blueprint ) ) {
			return $blueprint;
		}
		return array(
			'checklist' => $checklist,
			'blueprint' => $blueprint,
		);
	}

	/**
	 * @param array<string,mixed> $ctx
	 * @return array<int,string>|WP_Error
	 */
	private static function generate_checklist( array $ctx ) {
		$raw = Neo_Pulse_Wp_OpenRouter::complete(
			Neo_Pulse_Wp_Harness_Prompts::checklist_system_prompt(),
			Neo_Pulse_Wp_Harness_Prompts::checklist_user_prompt( $ctx ),
			4000,
			1.0
		);
		if ( is_wp_error( $raw ) ) {
			return $raw;
		}
		$lines = array();
		foreach ( preg_split( '/\r\n|\r|\n/', (string) $raw ) as $line ) {
			$line = trim( (string) $line );
			if ( $line === '' ) {
				continue;
			}
			$line = preg_replace( '/^\d+[\.\)]\s*/', '', $line );
			if ( is_string( $line ) && $line !== '' ) {
				$lines[] = $line;
			}
		}
		if ( count( $lines ) < 2 ) {
			return new WP_Error( 'neo-pulse_body_checklist', __( 'Checklist generation returned too few items.', 'neo-pulse-wp' ) );
		}
		return $lines;
	}

	/**
	 * @param array<int,string>     $checklist
	 * @param array<string,mixed> $ctx
	 * @return array<string,mixed>|WP_Error
	 */
	private static function generate_blueprint( array $checklist, array $ctx ) {
		$raw = Neo_Pulse_Wp_OpenRouter::complete(
			Neo_Pulse_Wp_Harness_Prompts::blueprint_system_prompt(),
			Neo_Pulse_Wp_Harness_Prompts::blueprint_user_prompt( $checklist, $ctx ),
			8000,
			1.0
		);
		if ( is_wp_error( $raw ) ) {
			return $raw;
		}
		$json = self::extract_json_object( (string) $raw );
		if ( $json === null ) {
			return new WP_Error( 'neo-pulse_body_blueprint', __( 'Blueprint response was not valid JSON.', 'neo-pulse-wp' ) );
		}
		$agents = isset( $json['agents'] ) && is_array( $json['agents'] ) ? $json['agents'] : array();
		if ( count( $agents ) < 2 ) {
			return new WP_Error( 'neo-pulse_body_blueprint', __( 'Blueprint has no agents.', 'neo-pulse-wp' ) );
		}
		return $json;
	}

	/**
	 * @return array<string,mixed>|null
	 */
	private static function extract_json_object( string $raw ) {
		if ( ! class_exists( 'Neo_Pulse_Wp_Backend_Assist_Ai', false ) ) {
			require_once NEO_PULSE_WP_PLUGIN_DIR . 'includes/backend-assist/class-neo-pulse-wp-backend-assist-ai.php';
		}
		return Neo_Pulse_Wp_Backend_Assist_Ai::parse_json( $raw );
	}

	/**
	 * @return array<int,array{id:int,slug:string,title:string,excerpt:string,link:string,date_gmt:string}>
	 */
	public static function fetch_linkable_posts(): array {
		$types = array( 'post', 'page' );
		$q     = new WP_Query(
			array(
				'post_type'      => $types,
				'post_status'    => 'publish',
				'posts_per_page' => 80,
				'orderby'        => 'date',
				'order'          => 'DESC',
				'no_found_rows'  => true,
			)
		);
		$out = array();
		foreach ( $q->posts as $post ) {
			if ( ! $post instanceof WP_Post ) {
				continue;
			}
			$link = get_permalink( $post );
			$out[] = array(
				'id'       => (int) $post->ID,
				'slug'     => $post->post_name,
				'title'    => get_the_title( $post ),
				'excerpt'  => has_excerpt( $post ) ? get_the_excerpt( $post ) : '',
				'link'     => is_string( $link ) ? $link : '',
				'date_gmt' => $post->post_date_gmt,
			);
		}
		return $out;
	}
}
