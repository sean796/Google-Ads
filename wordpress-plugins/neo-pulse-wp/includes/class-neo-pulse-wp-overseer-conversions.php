<?php
/**
 * Overseer conversion goals (interaction-based: form attempts, clicks, outbound clicks).
 *
 * @package Neo_Pulse_Wp
 */

defined( 'ABSPATH' ) || exit;

class Neo_Pulse_Wp_Overseer_Conversions {

	const OPTION_KEY = 'neo_pulse_wp_overseer_conversions';

	/**
	 * Trigger of goals created for the removed NEO Pulse Forms module (also the
	 * implicit trigger of goals saved without one). Such goals are kept in the
	 * option so no data is lost, but they are shown as unsupported and never match.
	 */
	const LEGACY_FORM_TRIGGER = 'form_success';

	/** @var array<string, string> */
	const TRIGGER_TYPES = array(
		'form_attempt'   => 'Form submission (attempt)',
		'click'          => 'Click',
		'outbound_click' => 'Outbound click',
	);

	/** @var array<string, string> */
	const INTERACTION_RULE_TYPES = array(
		'page_url_contains' => 'Page URL contains',
		'href_contains'     => 'Link URL contains',
	);

	/** @var array<string, string> */
	const OPTIONAL_INTERACTION_RULE_TYPES = array(
		'text_contains' => 'Element text contains (optional)',
	);

	/**
	 * @return array<string, string>
	 */
	public static function interaction_rule_labels(): array {
		return array_merge( self::INTERACTION_RULE_TYPES, self::OPTIONAL_INTERACTION_RULE_TYPES );
	}

	/**
	 * @return void
	 */
	public static function init(): void {
		add_action( 'neo_pulse_wp_overseer_event_recorded', array( __CLASS__, 'handle_overseer_event' ), 10, 3 );
	}

	/**
	 * @return array<int, array<string, mixed>>
	 */
	public static function get_goals(): array {
		$raw = get_option( self::OPTION_KEY, array() );
		if ( ! is_array( $raw ) ) {
			return array();
		}
		$goals = array();
		foreach ( $raw as $goal ) {
			if ( ! is_array( $goal ) ) {
				continue;
			}
			$normalized = self::normalize_goal( $goal );
			if ( $normalized ) {
				$goals[] = $normalized;
			}
		}
		return $goals;
	}

	/**
	 * @param string $goal_id Goal ID.
	 * @return array<string, mixed>|null
	 */
	public static function get_goal( string $goal_id ): ?array {
		$goal_id = sanitize_key( $goal_id );
		if ( $goal_id === '' ) {
			return null;
		}
		foreach ( self::get_goals() as $goal ) {
			if ( (string) ( $goal['id'] ?? '' ) === $goal_id ) {
				return $goal;
			}
		}
		return null;
	}

	/**
	 * @param array<string, mixed> $goal Goal payload.
	 * @return array<string, mixed>|null
	 */
	public static function save_goal( array $goal ): ?array {
		$normalized = self::normalize_goal( $goal, true );
		if ( ! $normalized ) {
			return null;
		}

		$goals   = self::get_goals();
		$updated = false;
		foreach ( $goals as $index => $existing ) {
			if ( (string) ( $existing['id'] ?? '' ) === (string) $normalized['id'] ) {
				$goals[ $index ] = $normalized;
				$updated         = true;
				break;
			}
		}
		if ( ! $updated ) {
			$goals[] = $normalized;
		}

		update_option( self::OPTION_KEY, $goals, false );
		return $normalized;
	}

	/**
	 * @param string $goal_id Goal ID.
	 * @return bool
	 */
	public static function delete_goal( string $goal_id ): bool {
		$goal_id = sanitize_key( $goal_id );
		if ( $goal_id === '' ) {
			return false;
		}
		$goals = self::get_goals();
		$next  = array();
		$found = false;
		foreach ( $goals as $goal ) {
			if ( (string) ( $goal['id'] ?? '' ) === $goal_id ) {
				$found = true;
				continue;
			}
			$next[] = $goal;
		}
		if ( ! $found ) {
			return false;
		}
		update_option( self::OPTION_KEY, $next, false );
		return true;
	}

	/**
	 * Match interaction-based goals when Overseer records click/form_submit events.
	 *
	 * @param string $visit_uid  Event visit UID.
	 * @param string $event_type Event type.
	 * @param object $row        Stored event row.
	 * @return void
	 */
	public static function handle_overseer_event( $visit_uid, $event_type, $row ): void {
		unset( $visit_uid );
		if ( ! is_object( $row ) || ! is_scalar( $event_type ) ) {
			return;
		}
		$event_type = (string) $event_type;

		$trigger_map = array(
			'form_submit'    => 'form_attempt',
			'click'          => 'click',
			'outbound_click' => 'outbound_click',
		);
		if ( ! isset( $trigger_map[ $event_type ] ) ) {
			return;
		}

		$trigger_type = $trigger_map[ $event_type ];
		$ctx          = self::build_interaction_context( $row );

		foreach ( self::get_goals_for_trigger( $trigger_type ) as $goal ) {
			if ( self::goal_matches_interaction( $goal, $ctx ) ) {
				self::record_interaction_conversion( $goal, $row, $ctx );
			}
		}
	}

	/**
	 * @param array<string, mixed> $goal Goal.
	 * @return string
	 */
	public static function get_trigger_type( array $goal ): string {
		$trigger = isset( $goal['trigger_type'] ) ? sanitize_key( (string) $goal['trigger_type'] ) : self::LEGACY_FORM_TRIGGER;
		return array_key_exists( $trigger, self::TRIGGER_TYPES ) ? $trigger : self::LEGACY_FORM_TRIGGER;
	}

	/**
	 * Whether a goal uses a trigger that can still record conversions.
	 *
	 * @param array<string, mixed> $goal Goal.
	 */
	public static function is_supported_goal( array $goal ): bool {
		return array_key_exists( self::get_trigger_type( $goal ), self::TRIGGER_TYPES );
	}

	/**
	 * @param string $trigger_type Trigger slug.
	 * @return array<int, array<string, mixed>>
	 */
	public static function get_goals_for_trigger( string $trigger_type ): array {
		$trigger_type = sanitize_key( $trigger_type );
		return array_values(
			array_filter(
				self::get_goals(),
				static function ( $goal ) use ( $trigger_type ) {
					return ! empty( $goal['enabled'] ) && self::get_trigger_type( $goal ) === $trigger_type;
				}
			)
		);
	}

	/**
	 * @param object $row Event row.
	 * @return array<string, string>
	 */
	public static function build_interaction_context( $row ): array {
		return array(
			'page_url'     => isset( $row->page_url ) ? (string) $row->page_url : '',
			'element_text' => isset( $row->element_text ) ? (string) $row->element_text : '',
			'element_href' => isset( $row->element_href ) ? (string) $row->element_href : '',
			'session_id'   => isset( $row->session_id ) ? (string) $row->session_id : '',
			'visit_uid'    => isset( $row->visit_uid ) ? (string) $row->visit_uid : '',
		);
	}

	/**
	 * @param array<string, mixed> $goal Goal.
	 * @param array<string, mixed> $ctx  Interaction context.
	 * @return bool
	 */
	public static function goal_matches_interaction( array $goal, array $ctx ): bool {
		$rules = self::get_interaction_rules( $goal );
		if ( empty( $rules ) ) {
			return false;
		}

		$match_mode = isset( $goal['match_mode'] ) ? (string) $goal['match_mode'] : 'all';
		$results    = array();
		foreach ( $rules as $rule ) {
			$results[] = self::interaction_rule_matches( $rule, $ctx );
		}
		if ( empty( $results ) ) {
			return false;
		}
		if ( 'any' === $match_mode ) {
			return in_array( true, $results, true );
		}
		return ! in_array( false, $results, true );
	}

	/**
	 * @param array<string, mixed> $goal Goal.
	 * @return array<int, array{type: string, value: string}>
	 */
	public static function get_interaction_rules( array $goal ): array {
		$rules   = isset( $goal['rules'] ) && is_array( $goal['rules'] ) ? $goal['rules'] : array();
		$allowed = self::interaction_rule_labels();
		return array_values(
			array_filter(
				$rules,
				static function ( $rule ) use ( $allowed ) {
					if ( ! is_array( $rule ) ) {
						return false;
					}
					$type = isset( $rule['type'] ) ? sanitize_key( (string) $rule['type'] ) : '';
					return array_key_exists( $type, $allowed );
				}
			)
		);
	}

	/**
	 * @param array<string, mixed> $rule Rule.
	 * @param array<string, mixed> $ctx  Interaction context.
	 * @return bool
	 */
	public static function interaction_rule_matches( array $rule, array $ctx ): bool {
		$rule_type = isset( $rule['type'] ) ? sanitize_key( (string) $rule['type'] ) : '';
		$needle    = isset( $rule['value'] ) ? strtolower( trim( (string) $rule['value'] ) ) : '';
		if ( $needle === '' || ! array_key_exists( $rule_type, self::interaction_rule_labels() ) ) {
			return false;
		}

		if ( 'page_url_contains' === $rule_type ) {
			return strpos( strtolower( (string) ( $ctx['page_url'] ?? '' ) ), $needle ) !== false;
		}
		if ( 'text_contains' === $rule_type ) {
			return strpos( strtolower( (string) ( $ctx['element_text'] ?? '' ) ), $needle ) !== false;
		}
		if ( 'href_contains' === $rule_type ) {
			return strpos( strtolower( (string) ( $ctx['element_href'] ?? '' ) ), $needle ) !== false;
		}
		return false;
	}

	/**
	 * @param string $goal_id Goal ID.
	 * @param string $date_from Y-m-d.
	 * @param string $date_to Y-m-d.
	 * @return int
	 */
	public static function count_goal_conversions( string $goal_id, string $date_from = '', string $date_to = '' ): int {
		global $wpdb;
		$goal_id = sanitize_key( $goal_id );
		if ( $goal_id === '' ) {
			return 0;
		}

		$table = Neo_Pulse_Wp_Overseer::table_name();
		$where = array( "event_type = 'conversion'", 'client_meta LIKE %s' );
		$params = array( '%"conversion_goal_id":"' . $wpdb->esc_like( $goal_id ) . '"%' );

		if ( preg_match( '/^\d{4}-\d{2}-\d{2}$/', $date_from ) ) {
			$where[]  = 'created_at >= %s';
			$params[] = $date_from . ' 00:00:00';
		}
		if ( preg_match( '/^\d{4}-\d{2}-\d{2}$/', $date_to ) ) {
			$where[]  = 'created_at <= %s';
			$params[] = $date_to . ' 23:59:59';
		}

		// phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared
		$sql = 'SELECT COUNT(*) FROM ' . $table . ' WHERE ' . implode( ' AND ', $where );

		// phpcs:ignore WordPress.DB.PreparedSQL.NotPrepared
		return (int) $wpdb->get_var( $wpdb->prepare( $sql, $params ) );
	}

	/**
	 * @param string $date_from Y-m-d.
	 * @param string $date_to Y-m-d.
	 * @return array<int, array{goal_id: string, name: string, count: int}>
	 */
	public static function aggregate_by_goal( string $date_from, string $date_to ): array {
		$rows = array();
		foreach ( self::get_goals() as $goal ) {
			$goal_id = (string) ( $goal['id'] ?? '' );
			if ( $goal_id === '' ) {
				continue;
			}
			$rows[] = array(
				'goal_id' => $goal_id,
				'name'    => (string) ( $goal['name'] ?? '' ),
				'count'   => self::count_goal_conversions( $goal_id, $date_from, $date_to ),
			);
		}
		usort(
			$rows,
			static function ( $a, $b ) {
				return (int) $b['count'] <=> (int) $a['count'];
			}
		);
		return $rows;
	}

	/**
	 * @param array<string, mixed> $goal Goal.
	 * @return string
	 */
	public static function summarize_rules( array $goal ): string {
		if ( ! self::is_supported_goal( $goal ) ) {
			return __( 'Unsupported: NEO Pulse Forms was removed, so this goal no longer records conversions. Edit it to pick a new trigger, or delete it.', 'neo-pulse-wp' );
		}

		$interaction_rules = self::get_interaction_rules( $goal );
		if ( empty( $interaction_rules ) ) {
			return '—';
		}
		$labels = array();
		foreach ( $interaction_rules as $rule ) {
			if ( ! is_array( $rule ) ) {
				continue;
			}
			$labels[] = self::format_interaction_rule_label( $rule );
		}
		$labels = array_values( array_filter( $labels ) );
		if ( empty( $labels ) ) {
			return '—';
		}
		$join = 'any' === ( $goal['match_mode'] ?? 'all' ) ? ' ' . __( 'or', 'neo-pulse-wp' ) . ' ' : ' + ';
		return implode( $join, $labels );
	}

	/**
	 * @param string $trigger_type Trigger slug.
	 * @return string
	 */
	public static function format_trigger_label( string $trigger_type ): string {
		$trigger_type = sanitize_key( $trigger_type );
		if ( isset( self::TRIGGER_TYPES[ $trigger_type ] ) ) {
			return (string) self::TRIGGER_TYPES[ $trigger_type ];
		}
		if ( self::LEGACY_FORM_TRIGGER === $trigger_type ) {
			return __( 'Form submission (successful) — unsupported', 'neo-pulse-wp' );
		}
		return $trigger_type;
	}

	/**
	 * @param array<string, mixed> $rule Interaction rule.
	 * @return string
	 */
	public static function format_interaction_rule_label( array $rule ): string {
		$type  = isset( $rule['type'] ) ? sanitize_key( (string) $rule['type'] ) : '';
		$value = isset( $rule['value'] ) ? (string) $rule['value'] : '';
		if ( $value === '' || ! isset( self::interaction_rule_labels()[ $type ] ) ) {
			return '';
		}
		return (string) self::interaction_rule_labels()[ $type ] . ' "' . $value . '"';
	}

	/**
	 * Label for a field rule / field signal recorded by legacy form conversions.
	 *
	 * @param array<string, mixed> $rule Rule.
	 * @return string
	 */
	public static function format_rule_label( array $rule ): string {
		$rule_type  = isset( $rule['type'] ) ? sanitize_key( (string) $rule['type'] ) : '';
		$rule_value = isset( $rule['value'] ) ? sanitize_key( (string) $rule['value'] ) : '';
		if ( $rule_type === '' || $rule_value === '' ) {
			return '';
		}
		if ( 'field_type' === $rule_type ) {
			return ucwords( str_replace( array( '_', '-' ), ' ', $rule_value ) );
		}
		return $rule_value;
	}

	/**
	 * @param array<string, mixed> $signals Field signals map.
	 * @return string
	 */
	public static function format_field_signals( array $signals ): string {
		$present = array();
		foreach ( $signals as $type => $is_present ) {
			if ( $is_present ) {
				$present[] = self::format_rule_label(
					array(
						'type'  => 'field_type',
						'value' => sanitize_key( (string) $type ),
					)
				);
			}
		}
		$present = array_values( array_filter( $present ) );
		return empty( $present ) ? '—' : implode( ' · ', $present );
	}

	/**
	 * @param array<string, mixed> $goal Goal.
	 * @param object               $row  Source event row.
	 * @param array<string, mixed> $ctx  Interaction context.
	 * @return void
	 */
	private static function record_interaction_conversion( array $goal, $row, array $ctx ): void {
		$page_url = isset( $row->page_url ) ? esc_url_raw( (string) $row->page_url ) : '';
		if ( $page_url === '' ) {
			$page_url = home_url( '/' );
		}
		$page_title = isset( $row->page_title ) ? sanitize_text_field( (string) $row->page_title ) : '';

		$client_meta = array(
			'conversion_goal_id' => (string) ( $goal['id'] ?? '' ),
			'conversion_name'    => (string) ( $goal['name'] ?? '' ),
			'trigger_type'       => self::get_trigger_type( $goal ),
			'source_event_type'  => isset( $row->event_type ) ? sanitize_key( (string) $row->event_type ) : '',
		);

		Neo_Pulse_Wp_Overseer::record_event(
			array(
				'event_type'       => 'conversion',
				'session_id'       => isset( $ctx['session_id'] ) ? (string) $ctx['session_id'] : '',
				'page_url'         => $page_url,
				'page_title'       => $page_title,
				'parent_visit_uid' => isset( $row->visit_uid ) ? sanitize_text_field( (string) $row->visit_uid ) : '',
				'element_tag'      => isset( $row->element_tag ) ? sanitize_key( (string) $row->element_tag ) : '',
				'element_text'     => (string) ( $goal['name'] ?? '' ),
				'element_href'     => isset( $row->element_href ) ? sanitize_text_field( substr( (string) $row->element_href, 0, 512 ) ) : '',
				'client_meta'      => $client_meta,
			)
		);
	}

	/**
	 * @param array<string, mixed> $goal Raw goal.
	 * @param bool                 $allow_new_id Allow generating a new ID.
	 * @return array<string, mixed>|null
	 */
	private static function normalize_goal( array $goal, bool $allow_new_id = false ): ?array {
		$id = isset( $goal['id'] ) ? sanitize_key( (string) $goal['id'] ) : '';
		if ( $id === '' && $allow_new_id ) {
			$id = 'cv_' . substr( uniqid(), -10 );
		}
		if ( $id === '' || ! preg_match( '/^cv_[a-z0-9_]{4,32}$/', $id ) ) {
			return null;
		}

		$name = isset( $goal['name'] ) ? sanitize_text_field( (string) $goal['name'] ) : '';
		if ( $name === '' ) {
			return null;
		}

		$trigger_type = self::get_trigger_type( $goal );
		$is_legacy    = self::LEGACY_FORM_TRIGGER === $trigger_type;
		if ( $is_legacy && $allow_new_id ) {
			// NEO Pulse Forms goals can no longer be created or saved.
			return null;
		}

		$form_id = isset( $goal['form_id'] ) ? absint( $goal['form_id'] ) : 0;
		if ( $is_legacy && $form_id < 1 ) {
			return null;
		}
		if ( ! $is_legacy ) {
			$form_id = 0;
		}

		$match_mode = isset( $goal['match_mode'] ) ? sanitize_key( (string) $goal['match_mode'] ) : 'all';
		if ( ! in_array( $match_mode, array( 'all', 'any' ), true ) ) {
			$match_mode = 'all';
		}

		$rules = array();
		if ( isset( $goal['rules'] ) && is_array( $goal['rules'] ) ) {
			foreach ( $goal['rules'] as $rule ) {
				if ( ! is_array( $rule ) ) {
					continue;
				}
				$normalized = self::normalize_rule( $rule, $trigger_type );
				if ( $normalized ) {
					$rules[] = $normalized;
				}
			}
		}

		if ( ! $is_legacy && empty( $rules ) ) {
			return null;
		}

		return array(
			'id'           => $id,
			'name'         => $name,
			'enabled'      => ! empty( $goal['enabled'] ),
			'trigger_type' => $trigger_type,
			'form_id'      => $form_id,
			'match_mode'   => $match_mode,
			'rules'        => $rules,
		);
	}

	/**
	 * @param array<string, mixed> $rule Raw rule.
	 * @param string               $trigger_type Goal trigger.
	 * @return array{type: string, value: string}|null
	 */
	private static function normalize_rule( array $rule, string $trigger_type ): ?array {
		$type  = isset( $rule['type'] ) ? sanitize_key( (string) $rule['type'] ) : '';
		$value = isset( $rule['value'] ) ? trim( (string) $rule['value'] ) : '';
		if ( $type === '' || $value === '' ) {
			return null;
		}

		if ( in_array( $type, array( 'field_type', 'field_id' ), true ) ) {
			// Field rules only belong to legacy NEO Pulse Forms goals (kept for display).
			if ( self::LEGACY_FORM_TRIGGER !== $trigger_type ) {
				return null;
			}
			if ( 'field_type' === $type ) {
				$value = sanitize_key( $value );
			}
			if ( 'field_id' === $type ) {
				$value = sanitize_key( $value );
				if ( ! preg_match( '/^fld_[a-z0-9_]+$/i', $value ) ) {
					return null;
				}
			}
			return array(
				'type'  => $type,
				'value' => $value,
			);
		}

		if ( array_key_exists( $type, self::interaction_rule_labels() ) ) {
			if ( self::LEGACY_FORM_TRIGGER === $trigger_type ) {
				return null;
			}
			return array(
				'type'  => $type,
				'value' => sanitize_text_field( substr( $value, 0, 200 ) ),
			);
		}

		return null;
	}
}
