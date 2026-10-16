// Primitive widget + container factories for Elementor build-page payloads.
// All factories return { type, widget_type?, settings, children? } shapes
// that nest into the build-page `structure` array.

// ----- helpers -----
const px = (n) => n == null ? undefined : { unit: 'px', size: n };
const em = (n) => n == null ? undefined : { unit: 'em', size: n };
const fr = (s) => s == null ? undefined : { unit: 'fr', size: s };
const box = (top, right = top, bottom = top, left = right, linked = top === right && right === bottom && bottom === left) =>
  ({ unit: 'px', top: String(top), right: String(right), bottom: String(bottom), left: String(left), isLinked: linked });
const omit = (obj) => Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined));

// Generic settings builder for typography + spacing/border that nearly every widget supports.
// Pass any of: color, font, size, weight, lineHeight, letterSpacing, transform, fontStyle
const typo = ({ font, size, weight, lineHeight, letterSpacing, transform, fontStyle }) => omit({
  typography_typography: (font || size || weight || lineHeight || letterSpacing || transform || fontStyle) ? 'custom' : undefined,
  typography_font_family: font,
  typography_font_size: px(size),
  typography_font_weight: weight != null ? String(weight) : undefined,
  typography_line_height: em(lineHeight),
  typography_letter_spacing: em(letterSpacing),
  typography_text_transform: transform,
  typography_font_style: fontStyle,
});

// Common widget advanced controls (margin/padding/border/background/element width)
// Prefix with underscore in Elementor, these live under "Advanced" tab.
const advanced = ({
  margin, padding, border, borderWidth, borderColor, borderRadius,
  bg, bgColor, bgImage, bgPos = 'center center', bgSize = 'cover',
  elementWidth, customWidth, classes, elementId,
  position, offsetX, offsetXEnd, offsetY, offsetYEnd, offsetOrientationH, offsetOrientationV, zIndex,
  flexGrow, flexShrink, flexSize,
}) => omit({
  _css_classes: classes,
  _element_id: elementId,
  _margin: margin,
  _padding: padding,
  _border_border: border,
  _border_width: borderWidth,
  _border_color: borderColor,
  _border_radius: borderRadius,
  _background_background: bg,
  _background_color: bgColor,
  _background_image: bgImage,
  _background_position: bgImage ? bgPos : undefined,
  _background_size: bgImage ? bgSize : undefined,
  _element_width: elementWidth,
  _element_custom_width: customWidth,
  _position: position,
  _offset_orientation_h: offsetOrientationH,
  _offset_orientation_v: offsetOrientationV,
  _offset_x: offsetX,
  _offset_x_end: offsetXEnd,
  _offset_y: offsetY,
  _offset_y_end: offsetYEnd,
  _z_index: zIndex,
  _flex_grow: flexGrow,
  _flex_shrink: flexShrink,
  _flex_size: flexSize,
});

// ----- widget factories -----

export const heading = ({
  title, tag = 'h2', color, align, hoverColor,
  marginBottom, marginTop, padding, classes, elementId,
  background, backgroundColor, borderRadius, border, borderWidth, borderColor,
  position, offsetX, offsetXEnd, offsetY, offsetOrientationH, offsetOrientationV,
  elementWidth, customWidth,
  ...typoProps
}) => ({
  type: 'widget',
  widget_type: 'heading',
  settings: omit({
    title,
    header_size: tag,
    align,
    title_color: color,
    title_hover_color: hoverColor,
    ...typo(typoProps),
    ...advanced({
      classes, elementId,
      margin: (marginBottom != null || marginTop != null)
        ? { unit: 'px', top: String(marginTop ?? 0), right: '0', bottom: String(marginBottom ?? 0), left: '0', isLinked: false }
        : undefined,
      padding: padding ? (typeof padding === 'number' ? box(padding) : padding) : undefined,
      bg: background, bgColor: backgroundColor,
      border, borderWidth, borderColor, borderRadius,
      position, offsetX, offsetXEnd, offsetY, offsetOrientationH, offsetOrientationV,
      elementWidth, customWidth,
    }),
  }),
});

export const textEditor = ({
  editor, color, align, classes,
  marginBottom, marginTop,
  ...typoProps
}) => ({
  type: 'widget',
  widget_type: 'text-editor',
  settings: omit({
    editor,
    align,
    text_color: color,
    ...typo(typoProps),
    ...advanced({
      classes,
      margin: (marginBottom != null || marginTop != null)
        ? { unit: 'px', top: String(marginTop ?? 0), right: '0', bottom: String(marginBottom ?? 0), left: '0', isLinked: false }
        : undefined,
    }),
  }),
});

export const button = ({
  text, link, icon, iconAlign, iconIndent,
  bgColor = 'rgba(0,0,0,0)', textColor, hoverBg, hoverColor,
  border, borderWidth, borderColor, borderRadius,
  padding = box(14, 26),
  classes, elementWidth, customWidth, marginBottom, marginTop,
  ...typoProps
}) => ({
  type: 'widget',
  widget_type: 'button',
  settings: omit({
    text,
    link: typeof link === 'string' ? { url: link } : link,
    selected_icon: icon ? { value: icon, library: icon.startsWith('fas') ? 'fa-solid' : (icon.startsWith('far') ? 'fa-regular' : 'fa-brands') } : undefined,
    icon_align: iconAlign,
    icon_indent: iconIndent ? px(iconIndent) : undefined,
    background_color: bgColor,
    button_text_color: textColor,
    button_background_hover_color: hoverBg,
    hover_color: hoverColor,
    border_border: border,
    border_width: borderWidth,
    border_color: borderColor,
    border_radius: borderRadius,
    text_padding: padding,
    ...typo(typoProps),
    ...advanced({
      classes, elementWidth, customWidth,
      margin: (marginBottom != null || marginTop != null)
        ? { unit: 'px', top: String(marginTop ?? 0), right: '0', bottom: String(marginBottom ?? 0), left: '0', isLinked: false }
        : undefined,
    }),
  }),
});

export const image = ({
  url, alt, link, linkTo = link ? 'custom' : undefined,
  width, height, borderRadius, classes, caption, captionSource,
}) => ({
  type: 'widget',
  widget_type: 'image',
  settings: omit({
    image: { url, alt },
    link: typeof link === 'string' ? { url: link } : link,
    link_to: linkTo,
    width: width ? px(width) : undefined,
    height: height ? px(height) : undefined,
    image_border_radius: borderRadius,
    caption_source: captionSource,
    caption,
    ...advanced({ classes }),
  }),
});

// Icon-list. items: [{text, icon?, link?}]
export const iconList = ({
  items, view = 'traditional', spaceBetween, textColor, textHoverColor,
  iconColor, iconSize, classes, marginBottom, marginTop,
  ...typoProps
}) => ({
  type: 'widget',
  widget_type: 'icon-list',
  settings: omit({
    view,
    icon_list: items.map(it => ({
      text: it.text,
      selected_icon: it.icon
        ? { value: it.icon, library: it.icon.startsWith('fas') ? 'fa-solid' : (it.icon.startsWith('far') ? 'fa-regular' : 'fa-brands') }
        : { value: '', library: '' },
      link: typeof it.link === 'string' ? { url: it.link } : it.link,
    })),
    space_between: spaceBetween != null ? px(spaceBetween) : undefined,
    text_color: textColor,
    text_color_hover: textHoverColor,
    icon_color: iconColor,
    icon_size: iconSize ? px(iconSize) : undefined,
    icon_typography_typography: (typoProps.font || typoProps.size || typoProps.weight || typoProps.letterSpacing || typoProps.transform) ? 'custom' : undefined,
    icon_typography_font_family: typoProps.font,
    icon_typography_font_size: typoProps.size ? px(typoProps.size) : undefined,
    icon_typography_font_weight: typoProps.weight != null ? String(typoProps.weight) : undefined,
    icon_typography_letter_spacing: typoProps.letterSpacing != null ? em(typoProps.letterSpacing) : undefined,
    icon_typography_text_transform: typoProps.transform,
    ...advanced({
      classes,
      margin: (marginBottom != null || marginTop != null)
        ? { unit: 'px', top: String(marginTop ?? 0), right: '0', bottom: String(marginBottom ?? 0), left: '0', isLinked: false }
        : undefined,
    }),
  }),
});

export const iconBox = ({
  icon, title, description,
  position = 'block-start', titleTag = 'h3',
  primaryColor, titleColor, descriptionColor, iconSize,
  titleFont, titleSize, titleWeight, descFont, descSize,
  classes,
}) => ({
  type: 'widget',
  widget_type: 'icon-box',
  settings: omit({
    selected_icon: { value: icon, library: icon.startsWith('fas') ? 'fa-solid' : (icon.startsWith('far') ? 'fa-regular' : 'fa-brands') },
    title_text: title,
    description_text: description,
    position,
    title_size: titleTag,
    primary_color: primaryColor,
    title_color: titleColor,
    description_color: descriptionColor,
    icon_size: iconSize ? px(iconSize) : undefined,
    title_typography_typography: (titleFont || titleSize || titleWeight) ? 'custom' : undefined,
    title_typography_font_family: titleFont,
    title_typography_font_size: titleSize ? px(titleSize) : undefined,
    title_typography_font_weight: titleWeight != null ? String(titleWeight) : undefined,
    description_typography_typography: (descFont || descSize) ? 'custom' : undefined,
    description_typography_font_family: descFont,
    description_typography_font_size: descSize ? px(descSize) : undefined,
    ...advanced({ classes }),
  }),
});

export const counter = ({
  endingNumber, startingNumber, prefix, suffix, title, duration,
  thousandSeparator, numberColor, titleColor,
  numberFont, numberSize, numberWeight, titleFont, titleSize, titleSpacing, titleTransform,
  classes,
}) => ({
  type: 'widget',
  widget_type: 'counter',
  settings: omit({
    ending_number: endingNumber,
    starting_number: startingNumber,
    prefix,
    suffix,
    title,
    duration,
    thousand_separator: thousandSeparator,
    number_color: numberColor,
    title_color: titleColor,
    typography_number_typography: (numberFont || numberSize || numberWeight) ? 'custom' : undefined,
    typography_number_font_family: numberFont,
    typography_number_font_size: numberSize ? px(numberSize) : undefined,
    typography_number_font_weight: numberWeight != null ? String(numberWeight) : undefined,
    typography_title_typography: (titleFont || titleSize || titleSpacing || titleTransform) ? 'custom' : undefined,
    typography_title_font_family: titleFont,
    typography_title_font_size: titleSize ? px(titleSize) : undefined,
    typography_title_letter_spacing: titleSpacing != null ? em(titleSpacing) : undefined,
    typography_title_text_transform: titleTransform,
    ...advanced({ classes }),
  }),
});

export const priceList = ({ items, titleTag = 'span', classes, marginBottom, marginTop, elementWidth = 'initial', customWidth }) => ({
  type: 'widget',
  widget_type: 'price-list',
  settings: omit({
    title_tag: titleTag,
    price_list: items.map(it => omit({
      title: it.title,
      price: it.price,
      item_description: it.description,
      image: it.image ? { url: it.image } : undefined,
      link: typeof it.link === 'string' ? { url: it.link } : it.link,
    })),
    ...advanced({
      classes, elementWidth, customWidth,
      margin: (marginBottom != null || marginTop != null)
        ? { unit: 'px', top: String(marginTop ?? 0), right: '0', bottom: String(marginBottom ?? 0), left: '0', isLinked: false }
        : undefined,
    }),
  }),
});

export const form = ({
  name, fields, submitText, submitWidth, submitBg, submitColor, submitHoverBg, successMessage,
}) => ({
  type: 'widget',
  widget_type: 'form',
  settings: omit({
    form_name: name,
    form_fields: fields,
    button_text: submitText,
    button_width: submitWidth,
    button_background_color: submitBg,
    button_text_color: submitColor,
    button_background_hover_color: submitHoverBg,
    success_message: successMessage,
  }),
});

export const googleMaps = ({ address, zoom = 14, height = 480 }) => ({
  type: 'widget',
  widget_type: 'google_maps',
  settings: {
    address,
    zoom: { unit: 'px', size: zoom },
    height: { unit: 'px', size: height },
  },
});

export const starRating = ({ rating, scale = '5', classes, titleColor }) => ({
  type: 'widget',
  widget_type: 'star-rating',
  settings: omit({
    rating: { unit: 'px', size: rating },
    rating_scale: scale,
    star_style: 'star_fontawesome',
    ...advanced({ classes }),
  }),
});

export const html = ({ content }) => ({
  type: 'widget',
  widget_type: 'html',
  settings: { html: content },
});

// ----- container factory -----

export const container = ({
  children = [],
  flex = true, // false → grid
  flexDirection = 'column',
  flexAlignItems,
  flexJustifyContent,
  flexWrap,
  flexGap,
  gridColumns, gridRows, gridGap, gridAlignItems,
  contentWidth = 'full',
  padding,
  background, backgroundColor, backgroundColorB, backgroundGradientAngle,
  backgroundImage, backgroundPosition = 'center center', backgroundSize = 'cover',
  border, borderWidth, borderColor, borderRadius,
  overflow, minHeight, minWidth,
  boxShadow,
  classes, elementId, link,
  position, offsetX, offsetXEnd, offsetY, offsetOrientationH, offsetOrientationV, zIndex,
  elementWidth, customWidth, margin,
}) => {
  const containerType = flex ? 'flex' : 'grid';
  return {
    type: 'container',
    settings: omit({
      container_type: flex ? undefined : 'grid',
      flex_direction: flex ? flexDirection : undefined,
      flex_align_items: flex ? flexAlignItems : undefined,
      flex_justify_content: flex ? flexJustifyContent : undefined,
      flex_wrap: flex ? flexWrap : undefined,
      flex_gap: flex && flexGap != null ? { unit: 'px', size: flexGap, column: String(flexGap), row: String(flexGap) } : undefined,
      grid_columns_grid: !flex && gridColumns ? (
        typeof gridColumns === 'number'
          ? { unit: 'fr', size: String(gridColumns) }
          : (gridColumns.unit
              ? gridColumns
              : (typeof gridColumns === 'string'
                  ? { unit: 'fr', size: gridColumns }
                  : fr(gridColumns)))
      ) : undefined,
      grid_rows_grid: !flex ? (gridRows ? (typeof gridRows === 'number' ? fr(gridRows) : gridRows) : fr(1)) : undefined,
      grid_gaps: !flex && gridGap != null ? { unit: 'px', size: gridGap, column: String(gridGap), row: String(gridGap) } : undefined,
      grid_align_items: !flex ? gridAlignItems : undefined,
      content_width: contentWidth,
      padding: padding ? (typeof padding === 'number' ? box(padding) : padding) : undefined,
      background_background: background || (backgroundImage ? 'classic' : undefined),
      background_color: backgroundColor,
      background_color_b: backgroundColorB,
      background_gradient_angle: backgroundGradientAngle != null ? { unit: 'deg', size: backgroundGradientAngle } : undefined,
      background_image: backgroundImage ? { url: backgroundImage } : undefined,
      background_position: backgroundImage ? backgroundPosition : undefined,
      background_size: backgroundImage ? backgroundSize : undefined,
      border_border: border,
      border_width: borderWidth,
      border_color: borderColor,
      border_radius: borderRadius,
      overflow,
      min_height: minHeight ? px(minHeight) : undefined,
      box_shadow_box_shadow_type: boxShadow ? 'yes' : undefined,
      box_shadow_box_shadow: boxShadow,
      css_classes: classes,
      _element_id: elementId,
      link: typeof link === 'string' ? { url: link } : link,
      // A container's own controls are `margin`, `position`, `z_index` and `width`
      // (the widget-only `_margin`, `_position`, `_z_index`, `_element_*` do nothing here).
      margin,
      position,
      z_index: zIndex,
      width: customWidth, // applies with content_width 'full' (the default here)
      ...advanced({ offsetX, offsetXEnd, offsetY, offsetOrientationH, offsetOrientationV }),
    }),
    children,
  };
};

// Convenience helpers for common spacing tokens
export const box1 = box;

// Re-export omit for advanced custom use
export { omit, px, em, fr, box };
