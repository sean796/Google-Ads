<?php
/**
 * Argument validation for dispatcher tools: a schema of `name => type` (a trailing `!`
 * marks a required argument), shared by the FunnelKit and Polylang dispatchers.
 *
 * @package EMCP_Tools
 * @since   3.19.0
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/** @since 3.19.0 */
final class EMCP_Tools_Op_Args {

	/**
	 * @param array $schema name => type.
	 * @param array $args   Caller arguments.
	 * @return array|WP_Error Coerced arguments, only the ones passed.
	 */
	public static function validate( array $schema, array $args ) {
		foreach ( array_keys( $args ) as $key ) {
			if ( ! array_key_exists( $key, $schema ) ) {
				/* translators: %s: argument name. */
				return new WP_Error( 'unknown_argument', sprintf( __( 'Unknown argument "%s" for this operation.', 'emcp-tools' ), $key ) );
			}
		}
		$out = array();
		foreach ( $schema as $key => $type ) {
			$required = '!' === substr( (string) $type, -1 );
			$type     = rtrim( (string) $type, '!' );
			if ( ! array_key_exists( $key, $args ) || null === $args[ $key ] ) {
				if ( $required ) {
					/* translators: %s: argument name. */
					return new WP_Error( 'missing_argument', sprintf( __( 'Missing required argument "%s".', 'emcp-tools' ), $key ) );
				}
				continue;
			}
			$value = self::coerce( $type, $args[ $key ] );
			if ( is_wp_error( $value ) ) {
				/* translators: 1: argument name, 2: expected type. */
				return new WP_Error( 'invalid_argument', sprintf( __( 'Argument "%1$s" must be %2$s.', 'emcp-tools' ), $key, $type ) );
			}
			$out[ $key ] = $value;
		}
		return $out;
	}

	/** @return mixed|WP_Error */
	public static function coerce( string $type, $value ) {
		if ( 0 === strpos( $type, 'enum:' ) ) {
			$allowed = explode( ',', substr( $type, 5 ) );
			return in_array( (string) $value, $allowed, true ) ? (string) $value : new WP_Error( 'bad' );
		}
		switch ( $type ) {
			case 'int':
				if ( is_int( $value ) && $value > 0 ) {
					return $value;
				}
				return ( is_string( $value ) && ctype_digit( $value ) && (int) $value > 0 ) ? (int) $value : new WP_Error( 'bad' );
			case 'uint':
				if ( is_int( $value ) && $value >= 0 ) {
					return $value;
				}
				return ( is_string( $value ) && ctype_digit( $value ) ) ? (int) $value : new WP_Error( 'bad' );
			case 'number':
				// A non-negative finite amount (prices): an int or float, or a plain decimal string.
				if ( ( is_int( $value ) || is_float( $value ) ) && is_finite( (float) $value ) && $value >= 0 ) {
					return $value;
				}
				return ( is_string( $value ) && preg_match( '/^\d{1,12}(\.\d{1,6})?$/', $value ) ) ? (float) $value : new WP_Error( 'bad' );
			case 'ints':
				if ( ! is_array( $value ) || array() === $value ) {
					return new WP_Error( 'bad' );
				}
				$ids = array();
				foreach ( $value as $one ) {
					$id = self::coerce( 'int', $one );
					if ( is_wp_error( $id ) ) {
						return $id;
					}
					$ids[] = $id;
				}
				return array_values( array_unique( $ids ) );
			case 'lang':
				// Polylang language slugs: lowercase letters, digits and hyphens (en, pt-br, zh-hans).
				return ( is_string( $value ) && preg_match( '/^[a-z][a-z0-9-]{0,9}$/', $value ) ) ? $value : new WP_Error( 'bad' );
			case 'locale':
				// TranslatePress language codes (fr_FR, pt_BR, de_DE_formal): its own allowed characters.
				return ( is_string( $value ) && preg_match( '/^[A-Za-z][A-Za-z0-9_-]{1,31}$/', $value ) ) ? $value : new WP_Error( 'bad' );
			case 'table_id':
				// TablePress table ids: letters, digits, - and _ (numbers by default).
				return ( ( is_string( $value ) || is_int( $value ) ) && preg_match( '/^[A-Za-z0-9_-]{1,64}$/', (string) $value ) ) ? (string) $value : new WP_Error( 'bad' );
			case 'string':
				return is_scalar( $value ) ? (string) $value : new WP_Error( 'bad' );
			case 'slug':
				return ( is_string( $value ) && preg_match( '/^[a-z0-9_-]{1,64}$/', $value ) ) ? $value : new WP_Error( 'bad' );
			case 'bool':
				return is_bool( $value ) ? $value : new WP_Error( 'bad' );
			case 'array':
				return is_array( $value ) ? $value : new WP_Error( 'bad' );
			case 'object':
				return is_array( $value ) && ( array() === $value || array_keys( $value ) !== range( 0, count( $value ) - 1 ) ) ? $value : new WP_Error( 'bad' );
			case 'json':
				if ( is_array( $value ) ) {
					return $value;
				}
				return ( is_string( $value ) && null !== json_decode( $value, true ) ) ? json_decode( $value, true ) : new WP_Error( 'bad' );
			default:
				return new WP_Error( 'bad' );
		}
	}
}
