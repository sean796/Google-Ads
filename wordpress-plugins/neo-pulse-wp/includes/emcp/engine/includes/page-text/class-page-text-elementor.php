<?php
/**
 * Translatable text of an Elementor element tree, chosen by control type from each
 * widget's own registered controls, so third-party widgets are covered too.
 * Keys: elementor:{element_id}:{setting}, elementor:{id}:{repeater}.{index}.{field},
 * elementor:{id}:{setting}.url for a URL control.
 *
 * @package EMCP_Tools
 * @since   3.19.0
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/** @since 3.19.0 */
class EMCP_Tools_Page_Text_Elementor {

	/** Control type => segment kind. */
	const TEXT_TYPES = array(
		'text'     => 'text',
		'textarea' => 'text',
		'wysiwyg'  => 'html',
	);

	/** Settings that are never text, whatever their control type. */
	const SKIP_SETTINGS = array( '_element_id', '_css_classes', 'custom_css', '_title' );

	/** Elementor v4 atomic widgets: setting => kind. Their values are typed props. */
	const ATOMIC = array(
		'e-heading'   => array( 'title' => 'text' ),
		'e-paragraph' => array( 'paragraph' => 'html' ),
		'e-button'    => array( 'text' => 'text' ),
	);

	/** @var callable(string):?array{title:string,controls:array} */
	private $widget_for;

	/**
	 * @param callable|null $widget_for Widget type => {title, controls} or null when the type is not registered.
	 */
	public function __construct( ?callable $widget_for = null ) {
		$this->widget_for = $widget_for ? $widget_for : array( __CLASS__, 'registered_widget' );
	}

	/** @return array{title:string,controls:array}|null */
	public static function registered_widget( string $type ): ?array {
		if ( ! class_exists( '\Elementor\Plugin' ) || ! isset( \Elementor\Plugin::$instance->widgets_manager ) ) {
			return null;
		}
		$widget = \Elementor\Plugin::$instance->widgets_manager->get_widget_types( $type );
		if ( ! $widget ) {
			return null;
		}
		return array(
			'title'    => (string) $widget->get_title(),
			'controls' => (array) $widget->get_controls(),
		);
	}

	/**
	 * @param array $elements Elementor data (top-level element list).
	 * @return array{segments:array,skipped:array}
	 */
	public function segments( array $elements ): array {
		$out = array( 'segments' => array(), 'skipped' => array() );
		$this->walk(
			$elements,
			function ( array $el ) use ( &$out ) {
				foreach ( $this->element_fields( $el, $out['skipped'] ) as $field ) {
					$out['segments'][] = array(
						'key'   => $field['key'],
						'kind'  => $field['kind'],
						'text'  => $field['text'],
						'where' => $field['where'],
					);
				}
				return $el;
			}
		);
		return $out;
	}

	/**
	 * @param array                $elements Elementor data.
	 * @param array<string,string> $values   key => new text (keys come from segments()).
	 * @return array New element tree; settings not named in $values are untouched.
	 */
	public function apply( array $elements, array $values ): array {
		$ignored = array();
		return $this->walk(
			$elements,
			function ( array $el ) use ( $values, &$ignored ) {
				foreach ( $this->element_fields( $el, $ignored ) as $field ) {
					if ( array_key_exists( $field['key'], $values ) ) {
						$el['settings'] = $this->write( $el['settings'], $field, (string) $values[ $field['key'] ] );
					}
				}
				return $el;
			}
		);
	}

	private function walk( array $elements, callable $fn ): array {
		foreach ( $elements as $i => $el ) {
			if ( ! is_array( $el ) ) {
				continue;
			}
			if ( 'widget' === ( $el['elType'] ?? '' ) ) {
				$el = $fn( $el );
			}
			if ( ! empty( $el['elements'] ) && is_array( $el['elements'] ) ) {
				$el['elements'] = $this->walk( $el['elements'], $fn );
			}
			$elements[ $i ] = $el;
		}
		return $elements;
	}

	/**
	 * The text fields of one widget.
	 *
	 * @return array<int,array{key:string,kind:string,text:string,where:string,path:array,atomic:string}>
	 */
	private function element_fields( array $el, array &$skipped ): array {
		$id       = (string) ( $el['id'] ?? '' );
		$type     = (string) ( $el['widgetType'] ?? '' );
		$settings = is_array( $el['settings'] ?? null ) ? $el['settings'] : array();
		$fields   = array();

		if ( 0 === strpos( $type, 'e-' ) ) {
			if ( ! isset( self::ATOMIC[ $type ] ) ) {
				$skipped[] = array( 'where' => $type . ' ' . $id, 'reason' => 'unsupported_atomic' );
				return array();
			}
			foreach ( self::ATOMIC[ $type ] as $name => $kind ) {
				$prop = $settings[ $name ] ?? null;
				$text = self::atomic_text( $prop );
				if ( null !== $text && '' !== $text ) {
					$fields[] = array( 'key' => "elementor:$id:$name", 'kind' => $kind, 'text' => $text, 'where' => $type . ', ' . $name, 'path' => array( $name ), 'atomic' => (string) $prop['$$type'] );
				}
			}
			return $fields;
		}
		if ( 'html' === $type ) {
			$skipped[] = array( 'where' => 'HTML ' . $id, 'reason' => 'html_widget' );
			return array();
		}
		$widget = call_user_func( $this->widget_for, $type );
		if ( null === $widget ) {
			$skipped[] = array( 'where' => $type . ' ' . $id, 'reason' => 'unregistered' );
			return array();
		}
		$title    = '' !== (string) $widget['title'] ? (string) $widget['title'] : $type;
		$dynamic  = is_array( $settings['__dynamic__'] ?? null ) ? $settings['__dynamic__'] : array();
		$globals  = is_array( $settings['__globals__'] ?? null ) ? $settings['__globals__'] : array();
		foreach ( (array) $widget['controls'] as $name => $control ) {
			$name = (string) ( $control['name'] ?? $name );
			if ( in_array( $name, self::SKIP_SETTINGS, true ) || ! array_key_exists( $name, $settings ) ) {
				continue;
			}
			if ( isset( $dynamic[ $name ] ) || isset( $globals[ $name ] ) ) {
				if ( isset( $dynamic[ $name ] ) ) {
					$skipped[] = array( 'where' => $title . ', ' . self::label( $control, $name ), 'reason' => 'dynamic' );
				}
				continue;
			}
			$ctype = (string) ( $control['type'] ?? '' );
			$label = $title . ', ' . self::label( $control, $name );
			if ( 'repeater' === $ctype && is_array( $settings[ $name ] ) ) {
				foreach ( array_values( $settings[ $name ] ) as $row_index => $row ) {
					if ( ! is_array( $row ) ) {
						continue;
					}
					foreach ( (array) ( $control['fields'] ?? array() ) as $fkey => $fdef ) {
						$fname = (string) ( $fdef['name'] ?? $fkey );
						$field = self::field( "elementor:$id:$name.$row_index.$fname", (string) ( $fdef['type'] ?? '' ), $row[ $fname ] ?? null, $label . ' ' . ( $row_index + 1 ) . ', ' . self::label( $fdef, $fname ), array( $name, $row_index, $fname ) );
						if ( $field ) {
							$fields[] = $field;
						}
					}
				}
				continue;
			}
			$field = self::field( "elementor:$id:$name", $ctype, $settings[ $name ], $label, array( $name ) );
			if ( $field ) {
				$fields[] = $field;
			}
		}
		return $fields;
	}

	/** @return array|null One field when the control type and value carry text. */
	private static function field( string $key, string $ctype, $value, string $where, array $path ): ?array {
		if ( isset( self::TEXT_TYPES[ $ctype ] ) && is_string( $value ) && '' !== trim( $value ) ) {
			return array( 'key' => $key, 'kind' => self::TEXT_TYPES[ $ctype ], 'text' => $value, 'where' => $where, 'path' => $path, 'atomic' => '' );
		}
		if ( 'url' === $ctype && is_array( $value ) && is_string( $value['url'] ?? null ) && '' !== $value['url'] ) {
			return array( 'key' => $key . '.url', 'kind' => 'url', 'text' => $value['url'], 'where' => $where . ' (link)', 'path' => array_merge( $path, array( 'url' ) ), 'atomic' => '' );
		}
		return null;
	}

	private static function label( array $control, string $name ): string {
		return isset( $control['label'] ) && '' !== (string) $control['label'] ? (string) $control['label'] : $name;
	}

	/** Plain text of a string or html-v3 typed prop. */
	private static function atomic_text( $prop ): ?string {
		if ( ! is_array( $prop ) || ! isset( $prop['$$type'] ) ) {
			return null;
		}
		if ( 'string' === $prop['$$type'] && is_string( $prop['value'] ?? null ) ) {
			return $prop['value'];
		}
		if ( 'html-v3' === $prop['$$type'] && is_string( $prop['value']['content']['value'] ?? null ) ) {
			return $prop['value']['content']['value'];
		}
		return null;
	}

	private function write( array $settings, array $field, string $text ): array {
		if ( '' !== $field['atomic'] ) {
			$name              = $field['path'][0];
			$settings[ $name ] = 'html-v3' === $field['atomic'] ? EMCP_Tools_Atomic_Props::html( $text ) : EMCP_Tools_Atomic_Props::string( $text );
			return $settings;
		}
		$ref = &$settings;
		foreach ( $field['path'] as $step ) {
			$ref = &$ref[ $step ];
		}
		$ref = $text;
		unset( $ref );
		return $settings;
	}
}
