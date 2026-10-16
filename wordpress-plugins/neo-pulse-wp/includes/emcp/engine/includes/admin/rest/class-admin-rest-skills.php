<?php
/**
 * Agent Skills screen REST (spec 8.9) and the Custom skills sub-screen.
 * Downloads stay admin_post.
 *
 * @package EMCP_Tools
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

final class EMCP_Tools_Admin_REST_Skills extends EMCP_Tools_Admin_REST_Controller {

	public function register_routes(): void {
		$this->route( 'skills', array( 'methods' => 'GET', 'callback' => array( $this, 'get' ) ) );
		$this->route( 'skills/runtime', array( 'methods' => 'POST', 'callback' => array( $this, 'runtime' ) ) );
		// Literal before the id route: the first matching route wins.
		$this->route(
			'skills/custom',
			array(
				array(
					'methods'  => 'GET',
					'callback' => array( $this, 'list_custom' ),
				),
				array(
					'methods'  => 'POST',
					'callback' => array( $this, 'create_custom' ),
				),
			)
		);
		$this->route(
			'skills/custom/(?P<id>\d+)',
			array(
				array(
					'methods'  => 'GET',
					'callback' => array( $this, 'get_custom' ),
				),
				array(
					'methods'  => 'POST',
					'callback' => array( $this, 'update_custom' ),
				),
				array(
					'methods'  => 'DELETE',
					'callback' => array( $this, 'delete_custom' ),
				),
			)
		);
	}

	public static function register_screen(): void {
		EMCP_Tools_Admin_Screens::register(
			'skills',
			array(
				'script' => 'screen-skills',
				'root'   => 'pro',
				'tabs'   => array( 'skills' ),
				'boot'   => static function (): array {
					return ( new EMCP_Tools_Admin_Skills_Data() )->payload();
				},
			)
		);
		EMCP_Tools_Admin_Screens::register(
			'skills-custom',
			array(
				'script'  => 'screen-skills-custom',
				'root'    => 'pro',
				'tabs'    => array( 'skills:custom' ),
				// WordPress's own code editor (CodeMirror, Markdown mode) for the body.
				'enqueue' => static function (): void {
					if ( function_exists( 'wp_enqueue_code_editor' ) ) {
						$GLOBALS['emcp_tools_skill_editor'] = wp_enqueue_code_editor( array( 'type' => 'text/x-markdown' ) );
					}
				},
				'boot'    => static function (): array {
					$data = ( new EMCP_Tools_Admin_Custom_Skills_Data() )->payload();
					// false when the user switched syntax highlighting off: plain textarea.
					$data['codeEditor'] = $GLOBALS['emcp_tools_skill_editor']
						?? ( function_exists( 'wp_get_code_editor_settings' ) ? wp_get_code_editor_settings( array( 'type' => 'text/x-markdown' ) ) : false );
					return $data;
				},
			)
		);
	}

	public function get( $request ) {
		return new WP_REST_Response( ( new EMCP_Tools_Admin_Skills_Data() )->payload() );
	}

	public function runtime( $request ) {
		$data = new EMCP_Tools_Admin_Skills_Data();
		if ( ! $data->payload()['licensed'] ) {
			return $this->unlicensed();
		}
		return new WP_REST_Response( $data->set_runtime( rest_sanitize_boolean( $request->get_param( 'enabled' ) ) ) );
	}

	public function list_custom( $request ) {
		return $this->licensed() ? new WP_REST_Response( $this->list_payload() ) : $this->unlicensed();
	}

	public function get_custom( $request ) {
		if ( ! $this->licensed() ) {
			return $this->unlicensed();
		}
		$skill = EMCP_Tools_Custom_Skills::find( (int) self::route_param( $request, 'id' ) );
		return $skill
			? new WP_REST_Response( array( 'skill' => $skill ) )
			: new WP_Error( 'skill_not_found', __( 'That skill no longer exists.', 'emcp-tools' ), array( 'status' => 404 ) );
	}

	public function create_custom( $request ) {
		return $this->write( $request, 0 );
	}

	public function update_custom( $request ) {
		return $this->write( $request, (int) self::route_param( $request, 'id' ) );
	}

	public function delete_custom( $request ) {
		if ( ! $this->licensed() ) {
			return $this->unlicensed();
		}
		if ( ! rest_sanitize_boolean( $request->get_param( 'confirm' ) ) ) {
			return new WP_Error( 'confirm_required', __( 'Confirm to delete the skill.', 'emcp-tools' ), array( 'status' => 400 ) );
		}
		$result = EMCP_Tools_Custom_Skills::delete( (int) self::route_param( $request, 'id' ) );
		return is_wp_error( $result ) ? $result : new WP_REST_Response( $this->list_payload() );
	}

	/**
	 * Create or update, then answer with the saved skill and the fresh list.
	 *
	 * @param WP_REST_Request $request Request.
	 * @param int             $id      0 to create.
	 */
	private function write( $request, int $id ) {
		if ( ! $this->licensed() ) {
			return $this->unlicensed();
		}
		// An update keeps any field it was not sent (the list's on/off switch
		// sends only `enabled`).
		$current = $id ? EMCP_Tools_Custom_Skills::find( $id ) : null;
		if ( $id && ! $current ) {
			return new WP_Error( 'skill_not_found', __( 'That skill no longer exists.', 'emcp-tools' ), array( 'status' => 404 ) );
		}
		$in = array();
		foreach ( array( 'name', 'slug', 'description', 'body' ) as $key ) {
			$value      = $request->get_param( $key );
			$in[ $key ] = null === $value ? (string) ( $current[ $key ] ?? '' ) : (string) $value;
		}
		$enabled       = $request->get_param( 'enabled' );
		$in['enabled'] = null === $enabled ? ! empty( $current['enabled'] ) : rest_sanitize_boolean( $enabled );
		$result        = EMCP_Tools_Custom_Skills::save( $in, $id );
		if ( is_wp_error( $result ) ) {
			return $result;
		}
		return new WP_REST_Response(
			array_merge( array( 'skill' => EMCP_Tools_Custom_Skills::find( $result ) ), $this->list_payload() ),
			$id ? 200 : 201
		);
	}

	private function list_payload(): array {
		$p = ( new EMCP_Tools_Admin_Custom_Skills_Data() )->payload();
		return array(
			'items' => $p['items'],
			'stats' => $p['stats'],
		);
	}

	private function licensed(): bool {
		return (bool) ( new EMCP_Tools_Admin_Skills_Data() )->payload()['licensed'];
	}

	private function unlicensed(): WP_Error {
		return new WP_Error( 'emcp_no_license', __( 'Agent Skills need an active Neo EMCP licence.', 'emcp-tools' ), array( 'status' => 403 ) );
	}
}
