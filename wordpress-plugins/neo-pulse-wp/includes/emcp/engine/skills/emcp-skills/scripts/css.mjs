// Master CSS generator. Outputs ONE block for the canonical master-CSS HTML widget
// at the bottom of the page. The buyer copies it into Page Settings → Custom CSS.
//
// The baseline is intentionally minimal, most template styling comes from
// `extra` (the template's own port of its source styles.css with cs- prefix).

const escapeCssVal = (v) => v == null ? '' : String(v);

// Generate :root variables block from theme.colors
const rootVars = (theme) => {
  const lines = [];
  for (const [name, value] of Object.entries(theme.colors)) {
    lines.push(`--${theme.prefix}-${name}: ${escapeCssVal(value)};`);
  }
  return `:root{${lines.join('')}}`;
};

// Google Fonts that only ship a single 400 weight, they 400-error when you
// request multi-weight families. List them explicitly so the URL stays valid.
const SINGLE_WEIGHT_FONTS = new Set([
  'Limelight', 'Italiana', 'Marcellus', 'Permanent Marker', 'Special Elite',
  'Antonio', 'Caveat', 'Cardo', // also have specific axes, handled below
]);

// Per-font weight axis overrides (use when default multi-weight URL fails)
const FONT_AXIS = {
  Limelight: '',
  Italiana: '',
  Marcellus: '',
  'Permanent Marker': '',
  'Special Elite': '',
  Antonio: ':wght@300;400;500;600;700',
  Caveat: ':wght@400;500;600;700',
  Cardo: ':ital,wght@0,400;0,700;1,400',
  'IBM Plex Mono': ':wght@300;400;500;600;700',
  'Inter Tight': ':wght@300;400;500;600;700;800',
  'Schibsted Grotesk': ':wght@400;500;600;700;800',
  'Plus Jakarta Sans': ':wght@300;400;500;600;700;800',
  Sora: ':wght@400;500;600;700;800',
  Quicksand: ':wght@400;500;600;700',
};

// Google Fonts import, single combined URL covers display + body + mono + hand
const fontImport = (theme) => {
  const families = [];
  const seen = new Set();
  for (const font of [theme.fonts.display, theme.fonts.body, theme.fonts.mono, theme.fonts.hand].filter(Boolean)) {
    if (seen.has(font)) continue;
    seen.add(font);
    const axis = FONT_AXIS[font] ?? ':wght@300;400;500;600;700;800;900';
    families.push(`family=${font.replace(/ /g, '+')}${axis}`);
  }
  return `@import url('https://fonts.googleapis.com/css2?${families.join('&')}&display=swap');`;
};

// Minimal baseline, just the wrap container and a generic kicker hook.
// Everything else is template-specific and belongs in `extra`.
const baseline = (theme) => `
.${theme.prefix}-wrap{max-width:${theme.wrap ?? 1320}px;margin-inline:auto;width:100%;padding-inline:clamp(20px,4vw,36px)}
.${theme.prefix}-kicker{display:inline-block}
.${theme.prefix}-ac-accent{color:var(--${theme.prefix}-accent)}
`;

export const generateMasterCSS = ({ theme, extra = '' }) => {
  return [
    fontImport(theme),
    rootVars(theme),
    baseline(theme),
    extra,
  ].join('\n');
};

export { rootVars, fontImport, baseline };
