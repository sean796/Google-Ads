<?php
/**
 * CSV cell/row writer shared by the plugin's exports.
 *
 * Every cell is quoted, quotes are doubled, carriage returns are dropped, and a cell that starts
 * with = + - @ or a tab gets a leading apostrophe so spreadsheet apps do not run it as a formula
 * (CSV / formula injection).
 *
 * @package Neo_Pulse_Wp
 */

defined( 'ABSPATH' ) || exit;

class Neo_Pulse_Wp_Csv {

	/**
	 * One CSV cell.
	 *
	 * @param mixed $value Cell value (scalars; null and non-scalars become '').
	 */
	public static function cell( $value ): string {
		if ( is_bool( $value ) ) {
			$value = $value ? '1' : '0';
		} elseif ( ! is_scalar( $value ) ) {
			$value = '';
		}
		$value = str_replace( "\r", '', (string) $value );
		if ( $value !== '' && in_array( $value[0], array( '=', '+', '-', '@', "\t" ), true ) ) {
			$value = "'" . $value;
		}
		return '"' . str_replace( '"', '""', $value ) . '"';
	}

	/**
	 * One CSV line (no line break).
	 *
	 * @param array<int|string, mixed> $cells Cell values in column order.
	 */
	public static function row( array $cells ): string {
		return implode( ',', array_map( array( __CLASS__, 'cell' ), array_values( $cells ) ) );
	}
}
