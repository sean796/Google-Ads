<?php
/**
 * Sandbox Template Compiler — compiles the {{token}} / {{#if}} / {{#each}} DSL
 * into escaped PHP echo statements. Shared by the Widget Builder and the Block
 * Builder so the security-sensitive escaping lives in exactly one audited place.
 *
 * @package EMCP_Tools
 * @since   3.7.0
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Compiles the html_template DSL into a PHP render body.
 *
 * @since 3.7.0
 */
class EMCP_Tools_Sandbox_Template_Compiler {

	/**
	 * Builds a PHP render body by compiling an html_template.
	 *
	 * @since 3.7.0
	 *
	 * @param string $html_template The HTML with {{name}} / {{#if}} / {{#each}} tokens.
	 * @param array  $field_map     name => [ 'type' => string, 'html'? => bool, 'fields'? => array ].
	 * @param string $context_var   The PHP variable the values are read from.
	 * @return string PHP.
	 */
	public static function compile( string $html_template, array $field_map, string $context_var = '$settings' ): string {
		$context = array(
			array(
				'var'    => $context_var,
				'fields' => $field_map,
			),
		);

		$parts = preg_split( '/(\{\{.*?\}\})/s', $html_template, -1, PREG_SPLIT_DELIM_CAPTURE | PREG_SPLIT_NO_EMPTY );
		if ( ! is_array( $parts ) ) {
			$parts = array();
		}

		$out          = '';
		$last_literal = '';
		$indent       = "\t\t";

		foreach ( $parts as $part ) {
			if ( preg_match( '/^\{\{(.*)\}\}$/s', $part, $m ) ) {
				$token = trim( $m[1] );
				$out  .= self::compile_token( $token, $context, $last_literal, $indent );
			} else {
				$out         .= $indent . 'echo ' . self::php_str( $part ) . ";\n";
				$last_literal = $part;
			}
		}

		return $out;
	}

	/**
	 * Compiles one `{{…}}` token into PHP, mutating the context/indent stack.
	 *
	 * @since 3.7.0
	 *
	 * @param string $token        The inner token text.
	 * @param array  $context      By-ref context stack.
	 * @param string $last_literal The preceding literal (for attribute detection).
	 * @param string $indent       By-ref current indent.
	 * @return string PHP.
	 */
	private static function compile_token( string $token, array &$context, string $last_literal, string &$indent ): string {
		$ctx    = $context[ count( $context ) - 1 ];
		$fields = $ctx['fields'];
		$var    = $ctx['var'];

		// {{#if name}}
		if ( preg_match( '/^#if\s+([a-z0-9_]+)$/i', $token, $m ) ) {
			$name  = sanitize_key( $m[1] );
			$scope = self::resolve_scope( $name, $context );
			$type  = $scope['def']['type'] ?? 'text';
			$expr  = ( 'query' === $type ) ? "\$emcp_q_{$name}" : "{$scope['var']}['{$name}']";
			$cond  = self::truthy_condition( $type, $expr );
			$line    = $indent . "if ( {$cond} ) {\n";
			$indent .= "\t";
			return $line;
		}

		// {{/if}}
		if ( '/if' === $token ) {
			$indent = substr( $indent, 0, -1 );
			return $indent . "}\n";
		}

		// {{#each repeater}}
		if ( preg_match( '/^#each\s+([a-z0-9_]+)$/i', $token, $m ) ) {
			$name    = sanitize_key( $m[1] );
			$scope   = self::resolve_scope( $name, $context );
			$rfields = $scope['def']['fields'] ?? array();
			// A query's rows live in the $emcp_q_{name} variable render() fetched up front.
			$expr    = ( 'query' === ( $scope['def']['type'] ?? '' ) ) ? "\$emcp_q_{$name}" : "{$var}['{$name}']";
			$line    = $indent . "if ( ! empty( {$expr} ) && is_array( {$expr} ) ) { foreach ( {$expr} as \$emcp_item ) {\n";
			$indent .= "\t";
			$context[] = array(
				'var'    => '$emcp_item',
				'fields' => $rfields,
			);
			return $line;
		}

		// {{/each}}
		if ( '/each' === $token ) {
			array_pop( $context );
			$indent = substr( $indent, 0, -1 );
			return $indent . "} }\n";
		}

		// Plain value placeholder.
		if ( preg_match( '/^[a-z0-9_]+$/i', $token ) ) {
			$name  = sanitize_key( $token );
			$scope = self::resolve_scope( $name, $context );
			return $indent . self::value_statement( $scope['def'], "{$scope['var']}['{$name}']", self::is_attr_context( $last_literal ) ) . "\n";
		}

		// Unknown token — emit nothing (do not pass through).
		return '';
	}

	/**
	 * The PHP truthiness test for a `{{#if name}}` on a control of the given
	 * type. Elementor's url / media / image / icon controls always hold an
	 * array ({url:''} or {value:''}) even when nothing was chosen, so testing
	 * the array itself is always true and the template emits an empty
	 * <a href=""> or <img src="">; those test the inner value instead.
	 *
	 * @since 3.17.1
	 *
	 * @param string $type The control type.
	 * @param string $expr The PHP access expression.
	 * @return string A boolean PHP expression.
	 */
	private static function truthy_condition( string $type, string $expr ): string {
		switch ( $type ) {
			case 'switcher':
				return "isset( {$expr} ) && 'yes' === {$expr}";
			case 'query':
				return "! empty( {$expr} )";
			case 'url':
			case 'media':
			case 'image':
				return "! empty( {$expr}['url'] )";
			case 'icon':
				return "! empty( {$expr}['value'] )";
			case 'slider':
				return "isset( {$expr}['size'] ) && '' !== {$expr}['size']";
			default:
				return "! empty( {$expr} )";
		}
	}

	/**
	 * Resolve which context a token reads from. Prefers the innermost scope
	 * (e.g. the current {{#each}} row); if the token is not a field there, it
	 * falls back to the root settings — so a top-level control (like a shared
	 * title tag) can be referenced from inside a repeater loop. Unknown tokens
	 * default to text in the current scope (unchanged behavior).
	 *
	 * @param string $name    Sanitized token name.
	 * @param array  $context The context stack.
	 * @return array { var: string, def: array }
	 */
	private static function resolve_scope( string $name, array $context ): array {
		$ctx = $context[ count( $context ) - 1 ];
		if ( isset( $ctx['fields'][ $name ] ) ) {
			return array( 'var' => $ctx['var'], 'def' => $ctx['fields'][ $name ] );
		}
		$root = $context[0];
		if ( $ctx['var'] !== $root['var'] && isset( $root['fields'][ $name ] ) ) {
			return array( 'var' => $root['var'], 'def' => $root['fields'][ $name ] );
		}
		return array( 'var' => $ctx['var'], 'def' => array( 'type' => 'text' ) );
	}

	/**
	 * Produces the PHP statement that outputs one control value, escaped by type.
	 *
	 * @since 3.7.0
	 *
	 * @param array  $def  The control def (needs 'type').
	 * @param string $base_expr The PHP access expression (e.g. $settings['name']).
	 * @param bool   $attr Whether the placeholder sits inside an HTML attribute.
	 * @return string A complete PHP statement.
	 */
	public static function value_statement( array $def, string $base_expr, bool $attr ): string {
		$type = $def['type'] ?? 'text';
		$base = $base_expr;

		switch ( $type ) {
			case 'icon':
				return "if ( ! empty( {$base} ) ) { \\Elementor\\Icons_Manager::render_icon( {$base}, array( 'aria-hidden' => 'true' ) ); }";

			case 'url':
				return "echo esc_url( {$base}['url'] ?? '' );";

			case 'media':
			case 'image':
				return "echo esc_url( {$base}['url'] ?? '' );";

			case 'raw_url':
				// A plain URL string (e.g. a gallery item's url), not a {url:…} array.
				return "echo esc_url( {$base} ?? '' );";

			case 'shortcode':
				// Embedded output of an allowlisted provider; the registry validates
				// the tag and id and returns '' for anything else. The provider's own
				// markup is trusted the way the Elementor Template widget trusts it.
				$tag = self::php_str( (string) ( $def['tag'] ?? '' ) );
				return "echo EMCP_Tools_Shortcode_Registry::render( {$tag}, {$base} ?? '' );";

			case 'wysiwyg':
			case 'code':
				return "echo wp_kses_post( {$base} ?? '' );";

			case 'textarea':
				if ( ! empty( $def['html'] ) ) {
					return "echo wp_kses_post( {$base} ?? '' );";
				}
				return $attr
					? "echo esc_attr( {$base} ?? '' );"
					: "echo nl2br( esc_html( {$base} ?? '' ) );";

			case 'slider':
				return $attr
					? "echo esc_attr( {$base}['size'] ?? '' );"
					: "echo esc_html( {$base}['size'] ?? '' );";

			case 'number':
				return "echo esc_html( {$base} ?? '' );";

			default:
				// text, select, choose, color, switcher, heading, etc.
				return $attr
					? "echo esc_attr( {$base} ?? '' );"
					: "echo esc_html( {$base} ?? '' );";
		}
	}

	/**
	 * Whether the placeholder that follows this literal is inside an HTML
	 * attribute value (so esc_attr should be used instead of esc_html).
	 *
	 * @since 3.7.0
	 *
	 * @param string $literal The preceding literal text.
	 * @return bool
	 */
	private static function is_attr_context( string $literal ): bool {
		return (bool) preg_match( '/=\s*("|\')[^"\']*$/s', $literal );
	}

	/**
	 * Encodes a string as a safe single-quoted PHP string literal.
	 *
	 * @since 3.7.0
	 *
	 * @param string $s The raw string.
	 * @return string A PHP string literal (including the surrounding quotes).
	 */
	public static function php_str( string $s ): string {
		return "'" . str_replace( array( '\\', "'" ), array( '\\\\', "\\'" ), $s ) . "'";
	}
}
