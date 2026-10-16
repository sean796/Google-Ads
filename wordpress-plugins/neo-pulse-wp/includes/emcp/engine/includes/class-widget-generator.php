<?php
/**
 * Widget Generator — compiles a structured spec into a Widget_Base subclass.
 *
 * This is the ONLY component that emits PHP. The AI never authors PHP: it
 * submits a JSON spec (meta + sections[] of controls + an HTML template using
 * `{{control}}` placeholders and simple `{{#if}}`/`{{#each}}`). Every value that
 * reaches the generated PHP is either a fixed token from this class or is
 * escaped/whitelisted by the control's declared type, so the output is
 * deterministic and safe. The result is structurally lint-checked with
 * `token_get_all( …, TOKEN_PARSE )` before it is ever written to disk.
 *
 * @package EMCP_Tools
 * @since   1.9.0
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Compiles widget specs into Elementor Widget_Base PHP.
 *
 * @since 1.9.0
 */
class EMCP_Tools_Widget_Generator {

	/**
	 * Supported control types mapped to their Controls_Manager constant + notes.
	 * The keys are the `type` values the AI uses in a spec.
	 *
	 * @since 1.9.0
	 *
	 * @return array<string, array{const: string, value: bool, group: string, desc: string}>
	 */
	public static function control_types(): array {
		return array(
			// Text & content.
			'text'          => array( 'const' => 'TEXT', 'value' => true, 'group' => 'content', 'desc' => 'Single-line text. Args: placeholder, input_type (text|email|url|tel|number).' ),
			'textarea'      => array( 'const' => 'TEXTAREA', 'value' => true, 'group' => 'content', 'desc' => 'Multi-line text. Args: rows, placeholder, html:true (allow safe HTML).' ),
			'wysiwyg'       => array( 'const' => 'WYSIWYG', 'value' => true, 'group' => 'content', 'desc' => 'Rich-text editor (rendered with wp_kses_post).' ),
			'number'        => array( 'const' => 'NUMBER', 'value' => true, 'group' => 'content', 'desc' => 'Numeric input. Args: min, max, step, placeholder.' ),
			'code'          => array( 'const' => 'CODE', 'value' => true, 'group' => 'content', 'desc' => 'Code field. Args: language (html|css|javascript|json), rows. Rendered with wp_kses_post.' ),
			'hidden'        => array( 'const' => 'HIDDEN', 'value' => true, 'group' => 'content', 'desc' => 'Stored value with no panel UI (flags/config). Scalar string.' ),
			'date_time'     => array( 'const' => 'DATE_TIME', 'value' => true, 'group' => 'content', 'desc' => 'Date/time picker (MySQL "Y-m-d H:i" string). Format in your markup; output via {{name}}.' ),
			// Choices.
			'select'        => array( 'const' => 'SELECT', 'value' => true, 'group' => 'choice', 'desc' => 'Dropdown. Requires options:[{value,label}]. Add a {value:"",label:"Default"} option for "none".' ),
			'select2'       => array( 'const' => 'SELECT2', 'value' => true, 'group' => 'choice', 'desc' => 'Searchable dropdown. Requires options. Set multiple:true to store an array of values (loop with {{#each}}).' ),
			'choose'        => array( 'const' => 'CHOOSE', 'value' => true, 'group' => 'choice', 'desc' => 'Icon button group (e.g. alignment). Requires options; give each an icon (eicon) or alignment values get defaults. toggle:true allows deselect.' ),
			'visual_choice' => array( 'const' => 'VISUAL_CHOICE', 'value' => true, 'group' => 'choice', 'desc' => 'Image button group. Options need {value,label,image:URL}. Args: columns.' ),
			'switcher'      => array( 'const' => 'SWITCHER', 'value' => true, 'group' => 'choice', 'desc' => 'On/off toggle (value "yes"/""). Use in {{#if}}. Args: label_on, label_off, return_value.' ),
			'url'           => array( 'const' => 'URL', 'value' => true, 'group' => 'choice', 'desc' => 'Link picker (url + new-tab + nofollow). In templates use href="{{name}}", outputs the escaped URL.' ),
			// Visual / media.
			'media'         => array( 'const' => 'MEDIA', 'value' => true, 'group' => 'visual', 'desc' => 'Media Library file. Use in src="{{name}}", outputs the escaped file URL. Add media_types:["audio"] (or ["video"], ["image"], …) to restrict the picker — e.g. an MP3/WAV selector for an <audio> element. Works inside a repeater.' ),
			'image'         => array( 'const' => 'MEDIA', 'value' => true, 'group' => 'visual', 'desc' => 'Alias of media.' ),
			'icon'          => array( 'const' => 'ICONS', 'value' => true, 'group' => 'visual', 'desc' => 'Icon picker. {{name}} renders the icon markup (do not wrap in <i>).' ),
			'gallery'       => array( 'const' => 'GALLERY', 'value' => true, 'group' => 'visual', 'desc' => 'Image gallery (array of {id,url}). Loop with {{#each name}} and use {{url}} / {{id}} inside.' ),
			// Style.
			'color'         => array( 'const' => 'COLOR', 'value' => true, 'group' => 'style', 'desc' => 'Color picker. Args: alpha:false to disable transparency. Best used via selectors.' ),
			'font'          => array( 'const' => 'FONT', 'value' => true, 'group' => 'style', 'desc' => 'Font-family picker (outputs a full CSS family string). Prefer the typography group control, which also enqueues the font.' ),
			'slider'        => array( 'const' => 'SLIDER', 'value' => true, 'group' => 'measure', 'desc' => 'Slider with units. Args: min, max, step, units:["px","%","em"]. Use via selectors ({{SIZE}}{{UNIT}}); {{name}} outputs the size.' ),
			'dimensions'    => array( 'const' => 'DIMENSIONS', 'value' => false, 'group' => 'measure', 'desc' => 'Top/right/bottom/left box (margin/padding/radius). Use via selectors with {{TOP}}{{UNIT}} etc. Args: units.' ),
			// Group controls (style bundles injected into a CSS selector — set "selector").
			'typography'    => array( 'const' => '', 'value' => false, 'group' => 'group', 'group_class' => 'Group_Control_Typography', 'desc' => 'Full typography (font, size, weight, line-height, spacing) on a selector. Auto-enqueues fonts. Set "selector".' ),
			'border'        => array( 'const' => '', 'value' => false, 'group' => 'group', 'group_class' => 'Group_Control_Border', 'desc' => 'Border width/style/color on a selector. Set "selector".' ),
			'box_shadow'    => array( 'const' => '', 'value' => false, 'group' => 'group', 'group_class' => 'Group_Control_Box_Shadow', 'desc' => 'Box shadow on a selector. Set "selector".' ),
			'text_shadow'   => array( 'const' => '', 'value' => false, 'group' => 'group', 'group_class' => 'Group_Control_Text_Shadow', 'desc' => 'Text shadow on a selector. Set "selector".' ),
			'text_stroke'   => array( 'const' => '', 'value' => false, 'group' => 'group', 'group_class' => 'Group_Control_Text_Stroke', 'desc' => 'Text stroke on a selector. Set "selector".' ),
			'background'    => array( 'const' => '', 'value' => false, 'group' => 'group', 'group_class' => 'Group_Control_Background', 'desc' => 'Background (color/gradient/image/video) on a selector. Args: types:["classic","gradient"]. Set "selector".' ),
			'css_filter'    => array( 'const' => '', 'value' => false, 'group' => 'group', 'group_class' => 'Group_Control_Css_Filter', 'desc' => 'CSS filters (blur/brightness/contrast/etc.) on a selector. Set "selector".' ),
			// Animations.
			'animation'       => array( 'const' => 'ANIMATION', 'value' => true, 'group' => 'animation', 'desc' => 'Entrance animation (Animate.css). Usually applied via prefix_class.' ),
			'hover_animation' => array( 'const' => 'HOVER_ANIMATION', 'value' => true, 'group' => 'animation', 'desc' => 'Hover animation (Hover.css). Output as a class with the elementor-animation- prefix.' ),
			// Panel UI (no value, no front-end output).
			'heading'       => array( 'const' => 'HEADING', 'value' => false, 'group' => 'ui', 'desc' => 'A label inside the panel (no value).' ),
			'divider'       => array( 'const' => 'DIVIDER', 'value' => false, 'group' => 'ui', 'desc' => 'A horizontal rule inside the panel (no value).' ),
			'raw_html'      => array( 'const' => 'RAW_HTML', 'value' => false, 'group' => 'ui', 'desc' => 'Static HTML note inside the panel ("html" arg; no value).' ),
			'alert'         => array( 'const' => 'ALERT', 'value' => false, 'group' => 'ui', 'desc' => 'Colored note inside the panel. Args: alert_type (info|success|warning|danger), heading, content.' ),
			// Repeater.
			'repeater'      => array( 'const' => 'REPEATER', 'value' => false, 'group' => 'special', 'desc' => 'Repeatable rows. Requires fields:[...] (one level, no nested repeaters). Loop with {{#each name}}. Optional default:[{field:value,…},…] seeds starter rows on a new widget. Optional title_field:"name" sets the row label (else the first text field).' ),
			'shortcode'     => array( 'const' => 'SELECT2', 'value' => true, 'group' => 'data', 'desc' => 'Embed the output of another plugin. Requires tag: "elementor-template" (a saved Elementor template, rendered with its CSS) | "contact-form-7" | "wpforms" | "gravityform" | "fluentform" | "forminator_form". The editor shows a dropdown of the items that provider offers (resolved live, so new templates/forms appear without regenerating); the stored value is the item id and {{name}} renders it. Works inside a repeater (one template per menu item). Only these providers can be embedded; a spec never contains a shortcode string. Use {{#if name}} to skip an unset pick. Typical uses: mega-menu panels, a template carousel, a form styler, template content in a modal or off-canvas panel.' ),
			'query'         => array( 'const' => 'HIDDEN', 'value' => false, 'group' => 'data', 'desc' => 'Live data source. Requires source: "posts" | "products" (WooCommerce) | "terms" (categories, tags, product categories, brands) | "menu" (navigation menu) | "site" (one row of site identity: name, tagline, home_url, logo, has_logo, logo_width, logo_height, icon, has_icon, year, page_title, login_url, current_url, search_url, is_front, is_home, is_logged_in; controls logo_size, fallback_logo) | "breadcrumbs" (the trail for the current request: title, url, kind = home|archive|term|ancestor|date|current, depth, is_current, is_home, is_last; controls home_label, show_home, show_current, show_archive, taxonomy, search_label, not_found_label) | "cart" (WooCommerce cart lines: key, id, name, permalink, thumbnail, has_thumbnail, quantity, price, line_total, variation, sku, is_on_sale, remove_url; plus root tokens {{name_count}}, {{name_total}}, {{name_subtotal}}, {{name_total_html}}, {{name_currency}}, {{name_cart_url}}, {{name_checkout_url}}, {{name_shop_url}}, {{name_is_empty}}; control thumb_size) | "remote" (a JSON API; also needs preset: "openweather" | "google_reviews" | "yelp" | "json"; API keys live on the Connection tab, never in the widget; {{name_error}} explains an empty result). Optional defaults: { generated_control: value } presets the Query panel, e.g. { "taxonomy": "product_brand" } for a brands widget. Generates a Query panel of editor controls prefixed with the control name (posts: post_type, count, orderby, order, taxonomy, terms, include, exclude, offset, exclude_current, ignore_sticky; products: count, orderby, order, category, tag, filter, include, exclude, hide_out_of_stock; terms: taxonomy, count, orderby, order, hide_empty, parent_mode, parent, include, exclude; menu: menu, depth). In the template: {{#each name}}...{{/each}} loops the rows, {{#if name}} tests for results, {{name_found}} is the row count. Row fields: posts = id, title, permalink, excerpt, date, date_iso, author, author_url, author_avatar, thumbnail, thumbnail_id, has_thumbnail, categories, first_category, first_category_url, comments_count, reading_time, post_type, is_sticky, index. products = id, title, permalink, thumbnail, has_thumbnail, hover_image, has_hover_image, price_html, price, regular_price, sale_price, currency, is_on_sale, is_featured, in_stock, stock_status, rating, rating_count, review_count, add_to_cart_url, add_to_cart_text, sku, short_description, categories, first_category, first_category_url, brand, brand_url, discount_pct, index. terms = id, name, slug, url, count, description, thumbnail, has_thumbnail, parent, is_child, index. menu = id, title, url, target, depth, parent_id, classes, has_children, is_current, is_parent_of_current, index (flat list, nest by depth). remote/openweather (one row) = city, country, temp, feels_like, temp_min, temp_max, humidity, pressure, wind, wind_unit, temp_unit, condition, description, icon, icon_url, sunrise, sunset, updated; generated controls location, units, lang. remote/google_reviews and remote/yelp = author, author_url, avatar, rating, text, time, relative_time, url, place_name, place_rating, place_total, source, index; controls place_id|business_id, min_rating, count, sort. remote/json = the fields you declare in its map (field=dot.path per line, names ending url/image/avatar escape as URLs); controls url, items_path, map, ttl, key_slot, key_in, key_name; put url/items_path/map in defaults. Boolean fields work in {{#if}}.' ),
		);
	}

	// -------------------------------------------------------------------------
	// Validation
	// -------------------------------------------------------------------------

	/**
	 * Validates a spec's structure. Returns true or a descriptive WP_Error.
	 *
	 * @since 1.9.0
	 *
	 * @param array $spec The widget spec.
	 * @return true|WP_Error
	 */
	public static function validate_spec( $spec ) {
		if ( ! is_array( $spec ) ) {
			return new WP_Error( 'invalid_spec', __( 'Spec must be an object.', 'emcp-tools' ) );
		}
		if ( empty( $spec['meta']['title'] ) ) {
			return new WP_Error( 'invalid_spec', __( 'meta.title is required.', 'emcp-tools' ) );
		}
		if ( empty( $spec['sections'] ) || ! is_array( $spec['sections'] ) ) {
			return new WP_Error( 'invalid_spec', __( 'At least one section is required.', 'emcp-tools' ) );
		}

		$types     = self::control_types();
		$seen_names = array();

		// Elementor registers every section as a control keyed by its id, so a
		// section id and a control name share ONE namespace: a control that
		// reuses a section id is silently dropped by add_control() and the widget
		// renders with that setting missing. Reserve the ids up front.
		foreach ( $spec['sections'] as $section ) {
			$sid = isset( $section['id'] ) ? sanitize_key( (string) $section['id'] ) : '';
			if ( '' !== $sid ) {
				if ( isset( $seen_names[ $sid ] ) ) {
					return new WP_Error(
						'invalid_spec',
						/* translators: %s: section id */
						sprintf( __( 'Duplicate section id "%s".', 'emcp-tools' ), $sid )
					);
				}
				$seen_names[ $sid ] = 'section';
			}
		}

		foreach ( $spec['sections'] as $section ) {
			if ( empty( $section['id'] ) || empty( $section['controls'] ) || ! is_array( $section['controls'] ) ) {
				return new WP_Error( 'invalid_spec', __( 'Each section needs an id and a non-empty controls array.', 'emcp-tools' ) );
			}
			foreach ( $section['controls'] as $control ) {
				$err = self::validate_control( $control, $types, $seen_names );
				if ( is_wp_error( $err ) ) {
					return $err;
				}
			}
		}

		if ( ! isset( $spec['html_template'] ) || ! is_string( $spec['html_template'] ) || '' === trim( $spec['html_template'] ) ) {
			return new WP_Error( 'invalid_spec', __( 'html_template is required.', 'emcp-tools' ) );
		}

		// Inside a query loop the row scope wins, so a root control named like one
		// of that source's row fields can never be read from the loop: the template
		// silently gets the row value. Refuse the shadowing up front.
		if ( class_exists( 'EMCP_Tools_Widget_Query' ) ) {
			$row_fields = array();
			foreach ( $spec['sections'] as $section ) {
				foreach ( (array) ( $section['controls'] ?? array() ) as $control ) {
					if ( is_array( $control ) && 'query' === ( $control['type'] ?? '' ) ) {
						foreach ( array_keys( EMCP_Tools_Widget_Query::fields( sanitize_key( (string) ( $control['source'] ?? '' ) ), sanitize_key( (string) ( $control['preset'] ?? '' ) ), is_array( $control['defaults'] ?? null ) ? $control['defaults'] : array() ) ) as $f ) {
							$row_fields[ $f ] = sanitize_key( (string) $control['name'] );
						}
					}
				}
			}
			if ( $row_fields ) {
				foreach ( $spec['sections'] as $section ) {
					foreach ( (array) ( $section['controls'] ?? array() ) as $control ) {
						$cname = is_array( $control ) ? sanitize_key( (string) ( $control['name'] ?? '' ) ) : '';
						if ( '' !== $cname && isset( $row_fields[ $cname ] ) && 'query' !== ( $control['type'] ?? '' ) ) {
							/* translators: 1: control name, 2: query control name */
							return new WP_Error( 'invalid_spec', sprintf( __( 'Control name "%1$s" shadows a row field of the query "%2$s"; inside {{#each}} the row value would win. Rename the control (e.g. show_%1$s).', 'emcp-tools' ), $cname, $row_fields[ $cname ] ) );
						}
					}
				}
			}
		}

		return true;
	}

	/**
	 * Validates a single control (recurses one level for repeater fields).
	 *
	 * @since 1.9.0
	 *
	 * @param mixed $control    The control definition.
	 * @param array $types      The supported types map.
	 * @param array $seen_names By-ref set of already-used control names.
	 * @return true|WP_Error
	 */
	/**
	 * Setting keys Elementor reads on every widget regardless of its controls.
	 * `animation` / `_animation` select an entrance animation and add
	 * `elementor-invisible` to the wrapper, so a content control with that
	 * name renders the whole widget hidden.
	 */
	const RESERVED_CONTROL_NAMES = array( 'animation', '_animation', '_animation_delay', 'animation_delay', '_element_id', '_css_classes', 'motion_fx', '_element_width' );

	private static function validate_control( $control, array $types, array &$seen_names ) {
		if ( ! is_array( $control ) || empty( $control['name'] ) || empty( $control['type'] ) ) {
			return new WP_Error( 'invalid_spec', __( 'Each control needs a name and a type.', 'emcp-tools' ) );
		}
		$name = sanitize_key( $control['name'] );
		if ( '' === $name ) {
			return new WP_Error( 'invalid_spec', __( 'Control names must be lowercase letters, numbers, and underscores.', 'emcp-tools' ) );
		}
		if ( in_array( $name, self::RESERVED_CONTROL_NAMES, true ) ) {
			/* translators: %s: control name */
			return new WP_Error( 'invalid_spec', sprintf( __( 'Control name "%s" is reserved by Elementor (it drives the entrance animation and marks the widget invisible until it scrolls into view); rename it, e.g. "anim_style".', 'emcp-tools' ), $name ) );
		}
		if ( isset( $seen_names[ $name ] ) ) {
			if ( 'section' === $seen_names[ $name ] ) {
				/* translators: %s: control name */
				return new WP_Error( 'invalid_spec', sprintf( __( 'Control name "%s" is already used as a section id; Elementor keeps sections and controls in one namespace, so rename one of them.', 'emcp-tools' ), $name ) );
			}
			/* translators: %s: control name */
			return new WP_Error( 'invalid_spec', sprintf( __( 'Duplicate control name: %s.', 'emcp-tools' ), $name ) );
		}
		$seen_names[ $name ] = true;

		if ( ! isset( $types[ $control['type'] ] ) ) {
			/* translators: %s: control type */
			return new WP_Error( 'invalid_spec', sprintf( __( 'Unsupported control type: %s.', 'emcp-tools' ), $control['type'] ) );
		}

		if ( 'shortcode' === $control['type'] ) {
			$tag = isset( $control['tag'] ) ? (string) $control['tag'] : '';
			if ( ! class_exists( 'EMCP_Tools_Shortcode_Registry' ) || ! EMCP_Tools_Shortcode_Registry::allowed( $tag ) ) {
				/* translators: 1: control name, 2: allowed tags */
				return new WP_Error( 'invalid_spec', sprintf( __( 'Shortcode control "%1$s" needs a tag from: %2$s.', 'emcp-tools' ), $name, class_exists( 'EMCP_Tools_Shortcode_Registry' ) ? implode( ', ', EMCP_Tools_Shortcode_Registry::tags() ) : '' ) );
			}
		}

		if ( 'query' === $control['type'] ) {
			$source = isset( $control['source'] ) ? sanitize_key( (string) $control['source'] ) : '';
			$preset = isset( $control['preset'] ) ? sanitize_key( (string) $control['preset'] ) : '';
			if ( ! class_exists( 'EMCP_Tools_Widget_Query' ) || ! EMCP_Tools_Widget_Query::valid( $source, $preset ) ) {
				$presets = class_exists( 'EMCP_Tools_Remote_Source' ) ? implode( ', ', EMCP_Tools_Remote_Source::preset_keys() ) : '';
				/* translators: 1: control name, 2: remote presets */
				return new WP_Error( 'invalid_spec', sprintf( __( 'Query control "%1$s" needs a source of posts, products, terms, menu, or remote with a preset (%2$s).', 'emcp-tools' ), $name, $presets ) );
			}
			// Optional per-widget defaults for the generated controls, e.g. { taxonomy: "product_brand" }.
			if ( isset( $control['defaults'] ) ) {
				if ( ! is_array( $control['defaults'] ) ) {
					return new WP_Error( 'invalid_spec', __( 'Query "defaults" must be an object of generated-control-name => value.', 'emcp-tools' ) );
				}
				$known = array();
				foreach ( EMCP_Tools_Widget_Query::controls( $source, $preset ) as $gc ) {
					$known[ $gc['name'] ] = true;
				}
				foreach ( array_keys( $control['defaults'] ) as $dk ) {
					if ( ! isset( $known[ sanitize_key( (string) $dk ) ] ) ) {
						/* translators: 1: default key, 2: query control name, 3: allowed keys */
						return new WP_Error( 'invalid_spec', sprintf( __( 'Query default "%1$s" on "%2$s" is not a generated control (allowed: %3$s).', 'emcp-tools' ), (string) $dk, $name, implode( ', ', array_keys( $known ) ) ) );
					}
				}
			}
			// The generated Query panel controls share the widget's control namespace.
			foreach ( EMCP_Tools_Widget_Query::generated_names( $name, $source, $preset ) as $gen ) {
				if ( isset( $seen_names[ $gen ] ) ) {
					/* translators: 1: generated control name, 2: query control name */
					return new WP_Error( 'invalid_spec', sprintf( __( 'Control name "%1$s" is reserved by the query control "%2$s".', 'emcp-tools' ), $gen, $name ) );
				}
				$seen_names[ $gen ] = 'query';
			}
			return true;
		}

		if ( in_array( $control['type'], array( 'select', 'select2', 'choose', 'visual_choice' ), true ) && empty( $control['options'] ) ) {
			/* translators: %s: control name */
			return new WP_Error( 'invalid_spec', sprintf( __( 'Control "%s" needs an options array.', 'emcp-tools' ), $name ) );
		}

		// Group controls (typography, border, background, …) style a CSS selector.
		if ( ! empty( $types[ $control['type'] ]['group_class'] ) && empty( $control['selector'] ) ) {
			/* translators: %s: control name */
			return new WP_Error( 'invalid_spec', sprintf( __( 'Group control "%s" needs a "selector" (a class to style, e.g. ".my-title").', 'emcp-tools' ), $name ) );
		}

		if ( 'repeater' === $control['type'] ) {
			if ( empty( $control['fields'] ) || ! is_array( $control['fields'] ) ) {
				/* translators: %s: control name */
				return new WP_Error( 'invalid_spec', sprintf( __( 'Repeater "%s" needs a fields array.', 'emcp-tools' ), $name ) );
			}
			$field_names = array();
			foreach ( $control['fields'] as $field ) {
				// Repeater fields cannot themselves be repeaters.
				if ( is_array( $field ) && 'repeater' === ( $field['type'] ?? '' ) ) {
					return new WP_Error( 'invalid_spec', __( 'Repeater fields cannot be repeaters.', 'emcp-tools' ) );
				}
				$err = self::validate_control( $field, $types, $field_names );
				if ( is_wp_error( $err ) ) {
					return $err;
				}
			}
		}

		return true;
	}

	// -------------------------------------------------------------------------
	// Generation
	// -------------------------------------------------------------------------

	/**
	 * Generates the full PHP source for a widget class.
	 *
	 * @since 1.9.0
	 *
	 * @param array  $spec        The (validated) widget spec.
	 * @param string $class_name  Unique PHP class name (e.g. EMCP_Widget_12).
	 * @param string $widget_name Unique Elementor widget machine name.
	 * @param array  $opts        Optional: 'style_handle' / 'script_handle' to wire
	 *                            get_style_depends()/get_script_depends().
	 * @return string|WP_Error PHP source, or WP_Error on invalid spec / lint failure.
	 */
	public static function generate( array $spec, string $class_name, string $widget_name, array $opts = array() ) {
		$valid = self::validate_spec( $spec );
		if ( is_wp_error( $valid ) ) {
			return $valid;
		}

		$class_name  = preg_replace( '/[^A-Za-z0-9_]/', '', $class_name );
		$widget_name = sanitize_key( $widget_name );

		$title    = EMCP_Tools_Sandbox_Template_Compiler::php_str( sanitize_text_field( (string) $spec['meta']['title'] ) );
		$icon     = self::sanitize_icon( $spec['meta']['icon'] ?? 'eicon-code' );
		$keywords = self::build_keywords( $spec['meta']['keywords'] ?? array() );

		$register = self::build_register_body( $spec );
		$render   = self::build_render_body( $spec );

		$src  = "<?php\n";
		$src .= "/**\n * Generated by Neo EMCP. DO NOT EDIT.\n";
		$src .= " * Source of truth: the emcp_widget post's _emcp_spec meta. Regenerate via the plugin.\n */\n";
		$src .= "if ( ! defined( 'ABSPATH' ) ) { exit; }\n";
		$src .= "if ( ! class_exists( '{$class_name}' ) && class_exists( '\\\\Elementor\\\\Widget_Base' ) ) {\n";
		$src .= "class {$class_name} extends \\Elementor\\Widget_Base {\n";
		$src .= "\tpublic function get_name() { return '{$widget_name}'; }\n";
		$src .= "\tpublic function get_title() { return {$title}; }\n";
		$src .= "\tpublic function get_icon() { return '{$icon}'; }\n";
		$src .= "\tpublic function get_categories() { return array( 'emcp-custom' ); }\n";
		$src .= "\tpublic function get_keywords() { return array( {$keywords} ); }\n";

		// Per-widget asset depends — Elementor enqueues these handles only when
		// the widget is on the page. The handles are registered by the loader.
		$style_handle  = isset( $opts['style_handle'] ) ? sanitize_key( (string) $opts['style_handle'] ) : '';
		$script_handle = isset( $opts['script_handle'] ) ? sanitize_key( (string) $opts['script_handle'] ) : '';
		if ( '' !== $style_handle ) {
			$src .= "\tpublic function get_style_depends() { return array( '{$style_handle}' ); }\n";
		}
		if ( '' !== $script_handle ) {
			$src .= "\tpublic function get_script_depends() { return array( '{$script_handle}' ); }\n";
		}

		$src .= "\tprotected function register_controls() {\n{$register}\t}\n";
		$src .= "\tprotected function render() {\n";
		$src .= "\t\t\$settings = \$this->get_settings_for_display();\n";
		$src .= "{$render}\t}\n";
		$src .= "}\n}\n";

		// Structural lint — throws ParseError on invalid syntax (PHP 7+).
		try {
			token_get_all( $src, TOKEN_PARSE );
		} catch ( \ParseError $e ) {
			return new WP_Error( 'generate_parse_error', __( 'The generated widget code failed a syntax check.', 'emcp-tools' ), array( 'detail' => $e->getMessage() ) );
		}

		return $src;
	}

	// -------------------------------------------------------------------------
	// register_controls()
	// -------------------------------------------------------------------------

	/**
	 * Builds the body of register_controls().
	 *
	 * @since 1.9.0
	 *
	 * @param array $spec The spec.
	 * @return string PHP.
	 */
	private static function build_register_body( array $spec ): string {
		$out = '';
		foreach ( $spec['sections'] as $i => $section ) {
			$sid  = sanitize_key( $section['id'] ?? ( 'section_' . $i ) );
			$slab = EMCP_Tools_Sandbox_Template_Compiler::php_str( sanitize_text_field( (string) ( $section['label'] ?? 'Section' ) ) );
			$tab  = self::map_tab( $section['tab'] ?? 'content' );

			$out .= "\t\t\$this->start_controls_section( '{$sid}', array( 'label' => {$slab}, 'tab' => {$tab} ) );\n";

			foreach ( $section['controls'] as $control ) {
				$out .= self::build_control( $control );
			}

			$out .= "\t\t\$this->end_controls_section();\n";
		}
		return $out;
	}

	/**
	 * Builds a single add_control() (or a repeater block).
	 *
	 * @since 1.9.0
	 *
	 * @param array $control The control def.
	 * @return string PHP.
	 */
	private static function build_control( array $control ): string {
		$name  = sanitize_key( $control['name'] );
		$type  = $control['type'];
		$types = self::control_types();

		if ( 'repeater' === $type ) {
			return self::build_repeater( $control, $name );
		}
		if ( 'query' === $type ) {
			return self::build_query_controls( $control, $name );
		}
		if ( ! empty( $types[ $type ]['group_class'] ) ) {
			return self::build_group_control( $control, $name, $types[ $type ]['group_class'] );
		}

		$args   = self::build_control_args( $control );
		$method = ! empty( $control['responsive'] ) ? 'add_responsive_control' : 'add_control';
		return "\t\t\$this->{$method}( '{$name}', {$args} );\n";
	}

	/**
	 * Builds the Query panel for a `query` control: a heading followed by the
	 * source's editor controls, each prefixed with the query control's name
	 * (so several queries can coexist), with `condition` keys prefixed too.
	 *
	 * @since 3.18.0
	 *
	 * @param array  $control The query control def.
	 * @param string $name    Sanitized name.
	 * @return string PHP.
	 */
	private static function build_query_controls( array $control, string $name ): string {
		$source = sanitize_key( (string) ( $control['source'] ?? '' ) );
		$preset = sanitize_key( (string) ( $control['preset'] ?? '' ) );
		$label  = EMCP_Tools_Sandbox_Template_Compiler::php_str( sanitize_text_field( (string) ( $control['label'] ?? 'Query' ) ) );
		$out    = "\t\t\$this->add_control( '{$name}_query_heading', array( 'label' => {$label}, 'type' => \\Elementor\\Controls_Manager::HEADING, 'separator' => 'before' ) );\n";
		if ( ! class_exists( 'EMCP_Tools_Widget_Query' ) ) {
			return $out;
		}
		$defaults = ( isset( $control['defaults'] ) && is_array( $control['defaults'] ) ) ? $control['defaults'] : array();
		foreach ( EMCP_Tools_Widget_Query::controls( $source, $preset ) as $gen ) {
			if ( array_key_exists( $gen['name'], $defaults ) ) {
				$gen['default'] = $defaults[ $gen['name'] ];
			}
			$gen['name'] = $name . '_' . $gen['name'];
			if ( ! empty( $gen['condition'] ) && is_array( $gen['condition'] ) ) {
				$cond = array();
				foreach ( $gen['condition'] as $k => $v ) {
					$cond[ $name . '_' . $k ] = $v;
				}
				$gen['condition'] = $cond;
			}
			$out .= self::build_control( $gen );
		}
		return $out;
	}

	/**
	 * Builds an add_group_control() call (typography, border, background, etc.).
	 * These inject CSS into a selector — no render() reading is needed.
	 *
	 * @since 1.9.0
	 *
	 * @param array  $control The control def.
	 * @param string $name    Sanitized name (becomes the field-key prefix).
	 * @param string $class   Group control class (e.g. Group_Control_Typography).
	 * @return string PHP.
	 */
	private static function build_group_control( array $control, string $name, string $class ): string {
		$parts   = array();
		$parts[] = "'name' => '{$name}'";

		if ( isset( $control['label'] ) ) {
			$parts[] = "'label' => " . EMCP_Tools_Sandbox_Template_Compiler::php_str( sanitize_text_field( (string) $control['label'] ) );
		}

		if ( 'image_size' === $control['type'] ) {
			if ( isset( $control['default'] ) && is_string( $control['default'] ) ) {
				$parts[] = "'default' => " . EMCP_Tools_Sandbox_Template_Compiler::php_str( sanitize_text_field( $control['default'] ) );
			}
		} else {
			$selector = self::wrap_selector( isset( $control['selector'] ) ? (string) $control['selector'] : '' );
			$parts[]  = "'selector' => " . EMCP_Tools_Sandbox_Template_Compiler::php_str( $selector );

			if ( 'background' === $control['type'] && ! empty( $control['types'] ) && is_array( $control['types'] ) ) {
				$tt = array();
				foreach ( $control['types'] as $t ) {
					$tt[] = EMCP_Tools_Sandbox_Template_Compiler::php_str( sanitize_key( (string) $t ) );
				}
				if ( $tt ) {
					$parts[] = "'types' => array( " . implode( ', ', $tt ) . ' )';
				}
			}
			if ( ! empty( $control['exclude'] ) && is_array( $control['exclude'] ) ) {
				$ex = array();
				foreach ( $control['exclude'] as $e ) {
					$ex[] = EMCP_Tools_Sandbox_Template_Compiler::php_str( sanitize_key( (string) $e ) );
				}
				if ( $ex ) {
					$parts[] = "'exclude' => array( " . implode( ', ', $ex ) . ' )';
				}
			}
		}

		$cond = self::build_condition( $control );
		if ( '' !== $cond ) {
			$parts[] = $cond;
		}

		return "\t\t\$this->add_group_control( \\Elementor\\{$class}::get_type(), array( " . implode( ', ', $parts ) . " ) );\n";
	}

	/**
	 * Builds a repeater control block using \Elementor\Repeater.
	 *
	 * @since 1.9.0
	 *
	 * @param array  $control The repeater control def.
	 * @param string $name    Sanitized control name.
	 * @return string PHP.
	 */
	private static function build_repeater( array $control, string $name ): string {
		$var  = '$repeater_' . $name;
		$out  = "\t\t{$var} = new \\Elementor\\Repeater();\n";
		$field_types = array();
		foreach ( $control['fields'] as $field ) {
			$fname = sanitize_key( $field['name'] );
			$field_types[ $fname ] = (string) ( $field['type'] ?? 'text' );
			$args  = self::build_control_args( $field );
			$out  .= "\t\t{$var}->add_control( '{$fname}', {$args} );\n";
		}

		// The repeater row label. Prefer an explicit `title_field`, else the first
		// text-like field (media/url/color fields render as "[object Object]"),
		// else the first field.
		$title_field = '';
		if ( ! empty( $control['title_field'] ) ) {
			$tf = sanitize_key( (string) $control['title_field'] );
			if ( isset( $field_types[ $tf ] ) ) {
				$title_field = $tf;
			}
		}
		if ( '' === $title_field ) {
			foreach ( $field_types as $fn => $ft ) {
				if ( in_array( $ft, array( 'text', 'textarea', 'wysiwyg', 'select' ), true ) ) {
					$title_field = $fn;
					break;
				}
			}
		}
		if ( '' === $title_field && $field_types ) {
			$title_field = (string) array_key_first( $field_types );
		}

		$label = EMCP_Tools_Sandbox_Template_Compiler::php_str( sanitize_text_field( (string) ( $control['label'] ?? $name ) ) );
		$out  .= "\t\t\$this->add_control( '{$name}', array( ";
		$out  .= "'label' => {$label}, ";
		$out  .= "'type' => \\Elementor\\Controls_Manager::REPEATER, ";
		$out  .= "'fields' => {$var}->get_controls()";
		if ( '' !== $title_field ) {
			$out .= ", 'title_field' => '{{{ ' . '{$title_field}' . ' }}}'";
		}
		$default = self::build_repeater_default( $control, $field_types );
		if ( '' !== $default ) {
			$out .= ", 'default' => {$default}";
		}
		$out  .= " ) );\n";
		return $out;
	}

	/**
	 * Builds the repeater's `default` array literal from an optional
	 * `default:[{field:value,…},…]` on the control, so a freshly-added widget
	 * shows starter rows instead of an empty repeater. Each value is typed by
	 * its field (number/switcher/text) and sanitized.
	 *
	 * @param array $control     The repeater control def.
	 * @param array $field_types Map of sanitized field name => type.
	 * @return string PHP array literal, or '' when there is no usable default.
	 */
	private static function build_repeater_default( array $control, array $field_types ): string {
		if ( empty( $control['default'] ) || ! is_array( $control['default'] ) ) {
			return '';
		}
		$rows = array();
		foreach ( $control['default'] as $row ) {
			if ( ! is_array( $row ) ) {
				continue;
			}
			$pairs = array();
			foreach ( $field_types as $fname => $ftype ) {
				if ( ! array_key_exists( $fname, $row ) ) {
					continue;
				}
				$val = $row[ $fname ];
				if ( 'number' === $ftype ) {
					$num     = is_numeric( $val ) ? $val + 0 : 0;
					$pairs[] = "'{$fname}' => " . ( is_int( $num ) ? (string) (int) $num : (string) (float) $num );
				} elseif ( 'switcher' === $ftype ) {
					$on      = ( 'yes' === $val || true === $val || 1 === $val || '1' === (string) $val );
					$pairs[] = "'{$fname}' => " . ( $on ? "'yes'" : "''" );
				} elseif ( is_array( $val ) ) {
					$lit = self::array_default_literal( $ftype, $val, false );
					if ( '' !== $lit ) {
						$pairs[] = "'{$fname}' => {$lit}";
					}
				} elseif ( in_array( $ftype, array( 'textarea', 'wysiwyg', 'code' ), true ) ) {
					// Keep newlines: "one per line" textareas are split per line by the widget's JS.
					$pairs[] = "'{$fname}' => " . EMCP_Tools_Sandbox_Template_Compiler::php_str( sanitize_textarea_field( (string) $val ) );
				} else {
					$pairs[] = "'{$fname}' => " . EMCP_Tools_Sandbox_Template_Compiler::php_str( sanitize_text_field( (string) $val ) );
				}
			}
			if ( $pairs ) {
				$rows[] = 'array( ' . implode( ', ', $pairs ) . ' )';
			}
		}
		return $rows ? 'array( ' . implode( ', ', $rows ) . ' )' : '';
	}

	/**
	 * PHP literal for an array-shaped control default, or '' when the shape
	 * is not one we know how to express safely.
	 *
	 * @since 3.18.0
	 *
	 * @param string $type     Control type.
	 * @param mixed  $default  Spec default.
	 * @param bool   $multiple Whether a select2 stores a list.
	 * @return string
	 */
	private static function array_default_literal( string $type, $default, bool $multiple ): string {
		if ( ! is_array( $default ) ) {
			return '';
		}
		$str = static function ( $v ): string {
			return EMCP_Tools_Sandbox_Template_Compiler::php_str( sanitize_text_field( (string) $v ) );
		};
		if ( 'icon' === $type ) {
			$value = (string) ( $default['value'] ?? '' );
			if ( '' === $value ) {
				return '';
			}
			$library = (string) ( $default['library'] ?? '' );
			if ( '' === $library ) {
				$library = 0 === strpos( $value, 'far ' ) ? 'fa-regular' : ( 0 === strpos( $value, 'fab ' ) ? 'fa-brands' : 'fa-solid' );
			}
			return "array( 'value' => " . $str( $value ) . ", 'library' => " . $str( $library ) . ' )';
		}
		if ( 'url' === $type ) {
			$url = esc_url_raw( (string) ( $default['url'] ?? '' ) );
			if ( '' === $url && '#' !== (string) ( $default['url'] ?? '' ) ) {
				return '';
			}
			$url = '' === $url ? '#' : $url;
			return "array( 'url' => " . $str( $url ) . ", 'is_external' => " . ( ! empty( $default['is_external'] ) ? "'on'" : "''" ) . ", 'nofollow' => " . ( ! empty( $default['nofollow'] ) ? "'on'" : "''" ) . ' )';
		}
		if ( in_array( $type, array( 'media', 'image' ), true ) ) {
			$url = esc_url_raw( (string) ( $default['url'] ?? '' ) );
			if ( '' === $url ) {
				return '';
			}
			return "array( 'url' => " . $str( $url ) . ", 'id' => " . (int) ( $default['id'] ?? 0 ) . ' )';
		}
		if ( 'select2' === $type && $multiple ) {
			$vals = array();
			foreach ( $default as $v ) {
				if ( is_scalar( $v ) ) {
					$vals[] = $str( $v );
				}
			}
			return $vals ? 'array( ' . implode( ', ', $vals ) . ' )' : '';
		}
		return '';
	}

	/**
	 * Builds the args array literal for an add_control() call.
	 *
	 * @since 1.9.0
	 *
	 * @param array $control The control def.
	 * @return string PHP array literal.
	 */
	private static function build_control_args( array $control ): string {
		$types = self::control_types();
		$type  = $control['type'];
		$const = '\\Elementor\\Controls_Manager::' . $types[ $type ]['const'];
		$label = EMCP_Tools_Sandbox_Template_Compiler::php_str( sanitize_text_field( (string) ( $control['label'] ?? $control['name'] ) ) );

		$parts   = array();
		$parts[] = "'label' => {$label}";
		$parts[] = "'type' => {$const}";

		// raw_html uses 'raw' instead of label.
		if ( 'raw_html' === $type && isset( $control['html'] ) ) {
			$parts[] = "'raw' => " . EMCP_Tools_Sandbox_Template_Compiler::php_str( wp_kses_post( (string) $control['html'] ) );
		}

		// ALERT panel note.
		if ( 'alert' === $type ) {
			$at = isset( $control['alert_type'] ) ? sanitize_key( (string) $control['alert_type'] ) : 'info';
			if ( ! in_array( $at, array( 'info', 'success', 'warning', 'danger' ), true ) ) {
				$at = 'info';
			}
			$parts[] = "'alert_type' => '{$at}'";
			if ( isset( $control['heading'] ) ) {
				$parts[] = "'heading' => " . EMCP_Tools_Sandbox_Template_Compiler::php_str( sanitize_text_field( (string) $control['heading'] ) );
			}
			if ( isset( $control['content'] ) ) {
				$parts[] = "'content' => " . EMCP_Tools_Sandbox_Template_Compiler::php_str( wp_kses_post( (string) $control['content'] ) );
			}
		}

		// SHORTCODE: a SELECT2 whose options come from the provider registry on
		// every request, so items created after generation still show up.
		if ( 'shortcode' === $type ) {
			$tag     = EMCP_Tools_Sandbox_Template_Compiler::php_str( (string) ( $control['tag'] ?? '' ) );
			$parts[] = "'options' => ( class_exists( 'EMCP_Tools_Shortcode_Registry' ) ? EMCP_Tools_Shortcode_Registry::options( {$tag} ) : array() )";
			$parts[] = "'label_block' => true";
			$parts[] = "'default' => ''";
		}

		// SELECT / SELECT2 options: value => label.
		if ( in_array( $type, array( 'select', 'select2' ), true ) && ! empty( $control['options'] ) ) {
			$opts = array();
			foreach ( (array) $control['options'] as $opt ) {
				if ( is_array( $opt ) && isset( $opt['value'] ) ) {
					$ov = EMCP_Tools_Sandbox_Template_Compiler::php_str( sanitize_text_field( (string) $opt['value'] ) );
					$ol = EMCP_Tools_Sandbox_Template_Compiler::php_str( sanitize_text_field( (string) ( $opt['label'] ?? $opt['value'] ) ) );
					$opts[] = "{$ov} => {$ol}";
				}
			}
			if ( $opts ) {
				$parts[] = "'options' => array( " . implode( ', ', $opts ) . ' )';
			}
		}
		if ( 'select2' === $type && ! empty( $control['multiple'] ) ) {
			$parts[] = "'multiple' => true";
			$parts[] = "'label_block' => true";
		}

		// VISUAL_CHOICE: options carry images instead of icons.
		if ( 'visual_choice' === $type && ! empty( $control['options'] ) ) {
			$opts = array();
			foreach ( (array) $control['options'] as $opt ) {
				if ( is_array( $opt ) && isset( $opt['value'] ) ) {
					$val   = (string) $opt['value'];
					$ov    = EMCP_Tools_Sandbox_Template_Compiler::php_str( sanitize_text_field( $val ) );
					$title = EMCP_Tools_Sandbox_Template_Compiler::php_str( sanitize_text_field( (string) ( $opt['label'] ?? $val ) ) );
					$img   = EMCP_Tools_Sandbox_Template_Compiler::php_str( sanitize_text_field( (string) ( $opt['image'] ?? '' ) ) );
					$opts[] = "{$ov} => array( 'title' => {$title}, 'image' => {$img} )";
				}
			}
			if ( $opts ) {
				$parts[] = "'options' => array( " . implode( ', ', $opts ) . ' )';
			}
			if ( isset( $control['columns'] ) && is_numeric( $control['columns'] ) ) {
				$parts[] = "'columns' => " . ( 0 + $control['columns'] );
			}
		}

		// SWITCHER labels / return value.
		if ( 'switcher' === $type ) {
			if ( isset( $control['label_on'] ) ) {
				$parts[] = "'label_on' => " . EMCP_Tools_Sandbox_Template_Compiler::php_str( sanitize_text_field( (string) $control['label_on'] ) );
			}
			if ( isset( $control['label_off'] ) ) {
				$parts[] = "'label_off' => " . EMCP_Tools_Sandbox_Template_Compiler::php_str( sanitize_text_field( (string) $control['label_off'] ) );
			}
			if ( isset( $control['return_value'] ) ) {
				$parts[] = "'return_value' => " . EMCP_Tools_Sandbox_Template_Compiler::php_str( sanitize_text_field( (string) $control['return_value'] ) );
			}
		}

		// COLOR alpha (on by default; only emit when disabled).
		if ( 'color' === $type && isset( $control['alpha'] ) && false === $control['alpha'] ) {
			$parts[] = "'alpha' => false";
		}

		// MEDIA: restrict the Media Library picker to given types so the control
		// opens the right selector — e.g. media_types:["audio"] for an MP3/WAV file
		// picker instead of Elementor's default image-only one (#107). Elementor's
		// Media control reads `media_types`. This runs for repeater fields too (they
		// reuse build_control_args), so a media control nested in a repeater works.
		if ( in_array( $type, array( 'media', 'image' ), true ) ) {
			$mt = array();
			if ( ! empty( $control['media_types'] ) && is_array( $control['media_types'] ) ) {
				$mt = $control['media_types'];
			} elseif ( ! empty( $control['media_type'] ) ) {
				$mt = array( (string) $control['media_type'] );
			}
			$allowed = array( 'image', 'audio', 'video', 'application', 'svg' );
			$mt      = array_values( array_unique( array_intersect( array_map( 'sanitize_key', array_map( 'strval', $mt ) ), $allowed ) ) );
			if ( $mt ) {
				$lits    = array_map( static function ( $m ) {
					return "'{$m}'";
				}, $mt );
				$parts[] = "'media_types' => array( " . implode( ', ', $lits ) . ' )';
			}
		}

		// TEXT input_type; CODE language; TEXTAREA/CODE rows.
		if ( 'text' === $type && isset( $control['input_type'] ) ) {
			$it = sanitize_key( (string) $control['input_type'] );
			if ( in_array( $it, array( 'text', 'email', 'url', 'tel', 'number', 'password' ), true ) ) {
				$parts[] = "'input_type' => '{$it}'";
			}
		}
		if ( in_array( $type, array( 'textarea', 'code' ), true ) && isset( $control['rows'] ) && is_numeric( $control['rows'] ) ) {
			$parts[] = "'rows' => " . ( 0 + $control['rows'] );
		}
		if ( 'code' === $type && isset( $control['language'] ) ) {
			$lang = sanitize_key( (string) $control['language'] );
			if ( '' !== $lang ) {
				$parts[] = "'language' => '{$lang}'";
			}
		}

		// CHOOSE renders icon buttons, so each option needs an icon (eicon).
		// Use the spec's per-option icon if given, else a sensible eicon for
		// common alignment-style values — otherwise the buttons render empty.
		if ( 'choose' === $type && ! empty( $control['options'] ) ) {
			$opts = array();
			foreach ( (array) $control['options'] as $opt ) {
				if ( is_array( $opt ) && isset( $opt['value'] ) ) {
					$val   = (string) $opt['value'];
					$ov    = EMCP_Tools_Sandbox_Template_Compiler::php_str( sanitize_text_field( $val ) );
					$title = EMCP_Tools_Sandbox_Template_Compiler::php_str( sanitize_text_field( (string) ( $opt['label'] ?? $val ) ) );
					$icon  = isset( $opt['icon'] ) ? self::sanitize_icon( $opt['icon'] ) : self::guess_choose_icon( $val );
					$opts[] = "{$ov} => array( 'title' => {$title}, 'icon' => '{$icon}' )";
				}
			}
			if ( $opts ) {
				$parts[] = "'options' => array( " . implode( ', ', $opts ) . ' )';
				$parts[] = "'toggle' => true";
			}
		}

		// Scalar default for value-bearing scalar controls. Controls whose
		// Elementor default is an ARRAY (slider, dimensions, media, url, icon,
		// repeater) must NOT receive a scalar default — Elementor array_merges
		// its array default with this value and fatals on a string (controls.php
		// add_control_to_stack). Slider is handled separately just below.
		if ( isset( $control['default'] ) && is_scalar( $control['default'] )
			&& ! in_array( $type, array( 'media', 'image', 'icon', 'url', 'repeater', 'dimensions', 'slider', 'gallery', 'select2', 'shortcode' ), true ) ) {
			$parts[] = "'default' => " . EMCP_Tools_Sandbox_Template_Compiler::php_str( (string) $control['default'] );
		}

		// Structured defaults for the array-valued controls: icon {value,library},
		// url {url}, media {url,id}, and a multiple select2 list. Anything else
		// array-shaped is still dropped (Elementor would fatal on a bad shape).
		$array_default = self::array_default_literal( $type, $control['default'] ?? null, ! empty( $control['multiple'] ) );
		if ( '' !== $array_default ) {
			$parts[] = "'default' => {$array_default}";
		}

		// Slider: default must be a {size, unit} array; bounds belong in `range`.
		if ( 'slider' === $type ) {
			$units = self::size_units( $control );
			if ( isset( $control['default'] ) && is_numeric( $control['default'] ) ) {
				$u0      = $units[0];
				$parts[] = "'default' => array( 'size' => " . ( 0 + $control['default'] ) . ", 'unit' => '{$u0}' )";
			}
			$range = array();
			if ( isset( $control['min'] ) && is_numeric( $control['min'] ) ) {
				$range[] = "'min' => " . ( 0 + $control['min'] );
			}
			if ( isset( $control['max'] ) && is_numeric( $control['max'] ) ) {
				$range[] = "'max' => " . ( 0 + $control['max'] );
			}
			if ( isset( $control['step'] ) && is_numeric( $control['step'] ) ) {
				$range[] = "'step' => " . ( 0 + $control['step'] );
			}
			if ( $range ) {
				$rparts = array();
				foreach ( $units as $u ) {
					$rparts[] = "'{$u}' => array( " . implode( ', ', $range ) . ' )';
				}
				$parts[] = "'range' => array( " . implode( ', ', $rparts ) . ' )';
			}
			$parts[] = "'size_units' => " . self::units_literal( $units );
		}

		// Dimensions: declare available units.
		if ( 'dimensions' === $type ) {
			$parts[] = "'size_units' => " . self::units_literal( self::size_units( $control ) );
		}

		// Placeholder for text-like controls.
		if ( isset( $control['placeholder'] ) && in_array( $type, array( 'text', 'textarea', 'number', 'url' ), true ) ) {
			$parts[] = "'placeholder' => " . EMCP_Tools_Sandbox_Template_Compiler::php_str( sanitize_text_field( (string) $control['placeholder'] ) );
		}

		// Numeric bounds for number.
		if ( 'number' === $type ) {
			if ( isset( $control['min'] ) && is_numeric( $control['min'] ) ) {
				$parts[] = "'min' => " . ( 0 + $control['min'] );
			}
			if ( isset( $control['max'] ) && is_numeric( $control['max'] ) ) {
				$parts[] = "'max' => " . ( 0 + $control['max'] );
			}
			if ( isset( $control['step'] ) && is_numeric( $control['step'] ) ) {
				$parts[] = "'step' => " . ( 0 + $control['step'] );
			}
		}

		// prefix_class (e.g. animations apply a CSS class from the value).
		if ( isset( $control['prefix_class'] ) && is_string( $control['prefix_class'] ) ) {
			$parts[] = "'prefix_class' => " . EMCP_Tools_Sandbox_Template_Compiler::php_str( $control['prefix_class'] );
		}

		// CSS selectors: a map of selector => 'css: {{VALUE}};'. Keys are scoped to
		// {{WRAPPER}}; the {{VALUE}}/{{SIZE}}{{UNIT}} tokens are fixed Elementor syntax.
		if ( ! empty( $control['selectors'] ) && is_array( $control['selectors'] ) ) {
			$sel = array();
			foreach ( $control['selectors'] as $k => $v ) {
				$sel[] = EMCP_Tools_Sandbox_Template_Compiler::php_str( self::wrap_selector( (string) $k ) ) . ' => ' . EMCP_Tools_Sandbox_Template_Compiler::php_str( (string) $v );
			}
			if ( $sel ) {
				$parts[] = "'selectors' => array( " . implode( ', ', $sel ) . ' )';
			}
		}

		// Common args available on every control.
		if ( isset( $control['description'] ) ) {
			$parts[] = "'description' => " . EMCP_Tools_Sandbox_Template_Compiler::php_str( sanitize_text_field( (string) $control['description'] ) );
		}
		if ( isset( $control['separator'] ) && in_array( $control['separator'], array( 'before', 'after', 'default', 'none' ), true ) ) {
			$parts[] = "'separator' => '" . $control['separator'] . "'";
		}
		if ( isset( $control['label_block'] ) ) {
			$parts[] = "'label_block' => " . ( $control['label_block'] ? 'true' : 'false' );
		}
		if ( isset( $control['show_label'] ) ) {
			$parts[] = "'show_label' => " . ( $control['show_label'] ? 'true' : 'false' );
		}
		$cond = self::build_condition( $control );
		if ( '' !== $cond ) {
			$parts[] = $cond;
		}

		return 'array( ' . implode( ', ', $parts ) . ' )';
	}

	/**
	 * Returns the validated CSS units for a slider/dimensions control.
	 *
	 * @since 1.9.0
	 *
	 * @param array $control The control def.
	 * @return string[] Non-empty list of units (defaults to ['px']).
	 */
	private static function size_units( array $control ): array {
		$raw = array();
		if ( ! empty( $control['units'] ) && is_array( $control['units'] ) ) {
			$raw = $control['units'];
		} elseif ( ! empty( $control['size_units'] ) && is_array( $control['size_units'] ) ) {
			$raw = $control['size_units'];
		}
		$allowed = array( 'px', '%', 'em', 'rem', 'vw', 'vh', 'vmin', 'vmax', 'deg', 'rad', 'custom' );
		$out     = array();
		foreach ( $raw as $u ) {
			$u = is_string( $u ) ? trim( $u ) : '';
			if ( in_array( $u, $allowed, true ) ) {
				$out[] = $u;
			}
		}
		return $out ? array_values( array_unique( $out ) ) : array( 'px' );
	}

	/**
	 * PHP array-literal for a list of units.
	 *
	 * @param string[] $units Units.
	 * @return string
	 */
	private static function units_literal( array $units ): string {
		$q = array();
		foreach ( $units as $u ) {
			$q[] = EMCP_Tools_Sandbox_Template_Compiler::php_str( $u );
		}
		return 'array( ' . implode( ', ', $q ) . ' )';
	}

	/**
	 * Builds a "'condition' => array(...)" / "'conditions' => array(...)" fragment
	 * from the spec, or '' when none. Values are emitted as safe PHP literals.
	 *
	 * @since 1.9.0
	 *
	 * @param array $control The control def.
	 * @return string
	 */
	private static function build_condition( array $control ): string {
		$out = array();
		if ( ! empty( $control['condition'] ) && is_array( $control['condition'] ) ) {
			$out[] = "'condition' => " . self::php_value( $control['condition'] );
		}
		if ( ! empty( $control['conditions'] ) && is_array( $control['conditions'] ) ) {
			$out[] = "'conditions' => " . self::php_value( $control['conditions'] );
		}
		return implode( ', ', $out );
	}

	/**
	 * Ensures a CSS selector is scoped to the widget. Prepends `{{WRAPPER}} ` when
	 * the selector doesn't already reference a `{{...}}` placeholder.
	 *
	 * @since 1.9.0
	 *
	 * @param string $selector The selector.
	 * @return string
	 */
	private static function wrap_selector( string $selector ): string {
		$selector = trim( $selector );
		if ( '' === $selector ) {
			return '{{WRAPPER}}';
		}
		if ( false !== strpos( $selector, '{{' ) ) {
			return $selector;
		}
		return '{{WRAPPER}} ' . $selector;
	}

	/**
	 * Serializes a JSON-decoded value to a safe PHP literal (strings, numbers,
	 * booleans, null, and nested arrays). Used for condition fragments.
	 *
	 * @since 1.9.0
	 *
	 * @param mixed $value The value.
	 * @return string PHP literal.
	 */
	private static function php_value( $value ): string {
		if ( is_bool( $value ) ) {
			return $value ? 'true' : 'false';
		}
		if ( is_int( $value ) || is_float( $value ) ) {
			return (string) ( 0 + $value );
		}
		if ( is_null( $value ) ) {
			return 'null';
		}
		if ( is_array( $value ) ) {
			$is_list = array_keys( $value ) === range( 0, count( $value ) - 1 );
			$items   = array();
			foreach ( $value as $k => $v ) {
				if ( $is_list ) {
					$items[] = self::php_value( $v );
				} else {
					$items[] = EMCP_Tools_Sandbox_Template_Compiler::php_str( (string) $k ) . ' => ' . self::php_value( $v );
				}
			}
			return 'array( ' . implode( ', ', $items ) . ' )';
		}
		return EMCP_Tools_Sandbox_Template_Compiler::php_str( (string) $value );
	}

	// -------------------------------------------------------------------------
	// render() — template compiler
	// -------------------------------------------------------------------------

	/**
	 * Builds the body of render() by compiling the html_template.
	 *
	 * Delegates to EMCP_Tools_Sandbox_Template_Compiler, which is shared with
	 * the Block Builder so the security-sensitive escaping lives in exactly
	 * one audited place.
	 *
	 * @since 1.9.0
	 *
	 * @param array $spec The spec.
	 * @return string PHP.
	 */
	private static function build_render_body( array $spec ): string {
		$field_map = self::collect_field_map( $spec );
		$pre       = '';
		foreach ( $field_map as $name => $def ) {
			if ( 'query' === ( $def['type'] ?? '' ) ) {
				$source = sanitize_key( (string) ( $def['source'] ?? '' ) );
				$preset = sanitize_key( (string) ( $def['preset'] ?? '' ) );
				$pre   .= "\t\t\$emcp_q_{$name} = class_exists( 'EMCP_Tools_Widget_Query' ) ? EMCP_Tools_Widget_Query::run( '{$source}', \$settings, '{$name}', '{$preset}' ) : array();\n";
				$pre   .= "\t\t\$settings['{$name}_found'] = (string) count( \$emcp_q_{$name} );\n";
				$pre   .= "\t\t\$settings['{$name}_error'] = class_exists( 'EMCP_Tools_Widget_Query' ) ? EMCP_Tools_Widget_Query::last_error() : '';\n";
				if ( class_exists( 'EMCP_Tools_Widget_Query' ) && EMCP_Tools_Widget_Query::extras( $source ) ) {
					$pre .= "\t\tforeach ( EMCP_Tools_Widget_Query::extra_values( '{$source}', \$settings, '{$name}' ) as \$emcp_k => \$emcp_v ) { \$settings[ '{$name}_' . \$emcp_k ] = \$emcp_v; }\n";
				}
			}
		}
		return $pre . EMCP_Tools_Sandbox_Template_Compiler::compile( (string) $spec['html_template'], $field_map, '$settings' );
	}

	// -------------------------------------------------------------------------
	// Helpers
	// -------------------------------------------------------------------------

	/**
	 * Builds a flat name => def map of all value controls (top level), including
	 * repeater defs (with their 'fields' sub-map attached).
	 *
	 * @since 1.9.0
	 *
	 * @param array $spec The spec.
	 * @return array<string, array>
	 */
	private static function collect_field_map( array $spec ): array {
		$map = array();
		foreach ( $spec['sections'] as $section ) {
			foreach ( (array) ( $section['controls'] ?? array() ) as $control ) {
				if ( empty( $control['name'] ) || empty( $control['type'] ) ) {
					continue;
				}
				$name = sanitize_key( $control['name'] );
				$def  = array( 'type' => $control['type'] );
				if ( isset( $control['html'] ) ) {
					$def['html'] = (bool) $control['html'];
				}
				if ( 'shortcode' === $control['type'] ) {
					$def['tag'] = (string) ( $control['tag'] ?? '' );
				}
				if ( 'repeater' === $control['type'] ) {
					$sub = array();
					foreach ( (array) ( $control['fields'] ?? array() ) as $field ) {
						if ( empty( $field['name'] ) || empty( $field['type'] ) ) {
							continue;
						}
						$fdef = array( 'type' => $field['type'] );
						if ( isset( $field['html'] ) ) {
							$fdef['html'] = (bool) $field['html'];
						}
						if ( 'shortcode' === $field['type'] ) {
							$fdef['tag'] = (string) ( $field['tag'] ?? '' );
						}
						$sub[ sanitize_key( $field['name'] ) ] = $fdef;
					}
					$def['fields'] = $sub;
				}
				// A query exposes its source's row fields to the {{#each}} loop and a
				// synthetic {name}_found (row count) at the root.
				if ( 'query' === $control['type'] ) {
					$def['source'] = sanitize_key( (string) ( $control['source'] ?? '' ) );
					$def['preset'] = sanitize_key( (string) ( $control['preset'] ?? '' ) );
					$def['fields'] = class_exists( 'EMCP_Tools_Widget_Query' ) ? EMCP_Tools_Widget_Query::fields( $def['source'], $def['preset'], is_array( $control['defaults'] ?? null ) ? $control['defaults'] : array() ) : array();
					$map[ $name . '_found' ] = array( 'type' => 'text' );
					$map[ $name . '_error' ] = array( 'type' => 'text' );
					if ( class_exists( 'EMCP_Tools_Widget_Query' ) ) {
						foreach ( EMCP_Tools_Widget_Query::extras( $def['source'] ) as $xk => $xdef ) {
							$map[ $name . '_' . $xk ] = $xdef;
						}
					}
				}
				// A gallery is an array of {id,url}; expose those as loop fields so
				// {{#each gallery}}…{{url}}/{{id}}…{{/each}} works.
				if ( 'gallery' === $control['type'] ) {
					$def['fields'] = array(
						'url' => array( 'type' => 'raw_url' ),
						'id'  => array( 'type' => 'number' ),
					);
				}
				$map[ $name ] = $def;
			}
		}
		return $map;
	}

	/**
	 * Maps a spec tab name to its Controls_Manager constant.
	 *
	 * @since 1.9.0
	 *
	 * @param string $tab The tab name.
	 * @return string PHP constant reference.
	 */
	private static function map_tab( string $tab ): string {
		switch ( $tab ) {
			case 'style':
				return '\\Elementor\\Controls_Manager::TAB_STYLE';
			case 'advanced':
				return '\\Elementor\\Controls_Manager::TAB_ADVANCED';
			default:
				return '\\Elementor\\Controls_Manager::TAB_CONTENT';
		}
	}

	/**
	 * Picks a sensible eicon for a CHOOSE option value when the spec doesn't
	 * supply one, so alignment-style button groups aren't rendered empty.
	 *
	 * @since 1.9.0
	 *
	 * @param string $value The option value.
	 * @return string An eicon class.
	 */
	private static function guess_choose_icon( string $value ): string {
		$v   = strtolower( trim( $value ) );
		$map = array(
			'left'          => 'eicon-text-align-left',
			'flex-start'    => 'eicon-text-align-left',
			'start'         => 'eicon-text-align-left',
			'center'        => 'eicon-text-align-center',
			'justify'       => 'eicon-text-align-justify',
			'space-between' => 'eicon-justify-space-between-h',
			'space-around'  => 'eicon-justify-space-around-h',
			'right'         => 'eicon-text-align-right',
			'flex-end'      => 'eicon-text-align-right',
			'end'           => 'eicon-text-align-right',
			'top'           => 'eicon-v-align-top',
			'middle'        => 'eicon-v-align-middle',
			'bottom'        => 'eicon-v-align-bottom',
			'stretch'       => 'eicon-v-align-stretch',
			'row'           => 'eicon-arrow-right',
			'column'        => 'eicon-arrow-down',
			'none'          => 'eicon-ban',
		);
		return $map[ $v ] ?? 'eicon-dot-circle-o';
	}

	/**
	 * Validates an Elementor icon class against an allow-pattern.
	 *
	 * @since 1.9.0
	 *
	 * @param mixed $icon The icon class.
	 * @return string A safe icon class.
	 */
	private static function sanitize_icon( $icon ): string {
		$icon = is_string( $icon ) ? trim( $icon ) : '';
		if ( preg_match( '/^(eicon|fa|fas|far|fab)[a-z0-9 _-]*$/i', $icon ) ) {
			return $icon;
		}
		return 'eicon-code';
	}

	/**
	 * Builds the PHP for the keywords array contents.
	 *
	 * @since 1.9.0
	 *
	 * @param mixed $keywords Array of keyword strings.
	 * @return string Comma-separated quoted PHP strings.
	 */
	private static function build_keywords( $keywords ): string {
		if ( ! is_array( $keywords ) ) {
			return '';
		}
		$out = array();
		foreach ( array_slice( $keywords, 0, 12 ) as $kw ) {
			if ( is_scalar( $kw ) ) {
				$out[] = EMCP_Tools_Sandbox_Template_Compiler::php_str( sanitize_text_field( (string) $kw ) );
			}
		}
		return implode( ', ', $out );
	}
}
