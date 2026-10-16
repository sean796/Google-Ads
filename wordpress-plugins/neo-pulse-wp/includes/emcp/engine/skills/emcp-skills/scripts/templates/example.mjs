// Example template, a minimal but complete landing page demonstrating the
// patterns in SKILL.md. Use it as a starting point or a reference.
//
// Build:  node build.mjs example      → output/example.json
// Ship:   node ship.mjs example       → POSTs to your live site
//
// Structure: header + hero + 3-up feature grid + stats strip + CTA slab + footer
// + a singular CSS HTML widget at the bottom holding every custom rule.

import {
  container, heading, textEditor, button, image, iconList, html, box, counter,
} from '../widgets.mjs';
import { generateMasterCSS } from '../css.mjs';

const P = 'ex';   // page-scoped class prefix

const theme = {
  prefix: P,
  wrap: 1280,
  colors: {
    paper: '#FFFFFF',
    soft:  '#F6F7FB',
    ink:   '#0F172A',
    body:  '#475569',
    mute:  '#94A3B8',
    line:  '#E2E8F0',
    accent:'#2563EB',   // primary
    accentDeep: '#1D4ED8',
    accentLight:'#60A5FA',
  },
  fonts: {
    display: 'Inter Tight',
    body:    'Inter',
    mono:    'JetBrains Mono',
    hand:    'Inter Tight',
  },
};
const C = theme.colors;
const F = theme.fonts;

// =============================================================
// 01, HEADER (brand + horizontal nav + CTA)
// =============================================================
const header = container({
  flexDirection: 'row', contentWidth: 'full',
  padding: { unit: 'px', top: '18', right: '0', bottom: '18', left: '0', isLinked: false },
  background: 'classic', backgroundColor: C.paper,
  border: 'solid', borderWidth: box(0, 0, 1, 0, false), borderColor: C.line,
  elementId: 'top',
  classes: `${P}-site-header e-no-lazyload`,
  children: [container({
    flex: false, gridColumns: 'auto 1fr auto', gridGap: 32, gridAlignItems: 'center',
    contentWidth: 'full', padding: 0,
    classes: `${P}-wrap ${P}-masthead`,
    children: [
      image({ url: 'https://placehold.co/180x40/2563EB/FFFFFF?text=BRAND&font=raleway', alt: 'Brand', link: '#top', width: 180 }),
      iconList({
        view: 'inline', spaceBetween: 28,
        items: [
          { text: 'Features', link: { url: '#features' } },
          { text: 'Pricing',  link: { url: '#pricing'  } },
          { text: 'About',    link: { url: '#about'    } },
          { text: 'Contact',  link: { url: '#contact'  } },
        ],
        textColor: C.ink, textHoverColor: C.accent, font: F.body, size: 14, weight: 500,
        classes: `${P}-primary-nav`,
      }),
      button({ text: 'Get started', link: '#contact', classes: `${P}-btn-primary` }),
    ],
  })],
});

// =============================================================
// 02, HERO (eyebrow + h1 + lede + dual CTAs)
// =============================================================
const hero = container({
  flexDirection: 'column', contentWidth: 'full',
  padding: { unit: 'px', top: '96', right: '0', bottom: '120', left: '0', isLinked: false },
  background: 'classic', backgroundColor: C.paper,
  classes: `${P}-hero e-no-lazyload`,
  children: [container({
    flexDirection: 'column', flexAlignItems: 'center', contentWidth: 'full', padding: 0,
    classes: `${P}-wrap`,
    children: [
      heading({ title: 'PRODUCT LAUNCH · 2026', tag: 'span', align: 'center',
        color: C.accent, font: F.body, size: 12, weight: 700, letterSpacing: 0.22, transform: 'uppercase',
        marginBottom: 18, classes: `${P}-kicker` }),
      heading({ title: 'Ship the page, not the codebase.', tag: 'h1', align: 'center',
        color: C.ink, font: F.display, weight: 700, size: 64, lineHeight: 1.04, letterSpacing: -0.02,
        marginBottom: 18, classes: `${P}-hero-title` }),
      textEditor({
        editor: '<p>A clear, fast Elementor page that ships in an afternoon, every section is a native widget your team can edit from the panel, every brand token lives at the kit.</p>',
        align: 'center', color: C.body, font: F.body, size: 19, lineHeight: 1.6,
        marginBottom: 32, classes: `${P}-hero-lede`,
      }),
      container({
        flexDirection: 'row', flexJustifyContent: 'center', flexGap: 14, contentWidth: 'full', padding: 0,
        children: [
          button({ text: 'Get started',  link: '#contact', classes: `${P}-btn-primary ${P}-btn-lg` }),
          button({ text: 'See pricing →',link: '#pricing', classes: `${P}-btn-ghost ${P}-btn-lg` }),
        ],
      }),
    ],
  })],
});

// =============================================================
// 03, FEATURES (3 cards: icon + title + description)
// =============================================================
const featureCard = ({ iconSvg, h3, desc }) => container({
  flexDirection: 'column', flexAlignItems: 'flex-start', contentWidth: 'full',
  padding: { unit: 'px', top: '32', right: '28', bottom: '32', left: '28', isLinked: false },
  background: 'classic', backgroundColor: C.paper,
  border: 'solid', borderWidth: box(1), borderColor: C.line, borderRadius: box(12),
  classes: `${P}-feature`,
  children: [
    html({ content: `<span class="${P}-feat-icon">${iconSvg}</span>` }),
    heading({ title: h3, tag: 'h3', color: C.ink, font: F.display, weight: 600, size: 22, marginTop: 16, marginBottom: 8 }),
    textEditor({ editor: `<p>${desc}</p>`, color: C.body, font: F.body, size: 15, lineHeight: 1.6 }),
  ],
});

const features = container({
  flexDirection: 'column', contentWidth: 'full',
  padding: { unit: 'px', top: '96', right: '0', bottom: '96', left: '0', isLinked: false },
  background: 'classic', backgroundColor: C.soft, elementId: 'features',
  classes: `${P}-features e-no-lazyload`,
  children: [container({
    flexDirection: 'column', contentWidth: 'full', padding: 0, classes: `${P}-wrap`,
    children: [
      heading({ title: 'WHAT YOU GET', tag: 'span', color: C.accent, font: F.body, size: 12, weight: 700, letterSpacing: 0.22, transform: 'uppercase', marginBottom: 12, classes: `${P}-kicker` }),
      heading({ title: 'Native widgets, every field editable.', tag: 'h2', color: C.ink, font: F.display, weight: 700, size: 42, lineHeight: 1.06, letterSpacing: -0.015, marginBottom: 48 }),
      container({
        flex: false, gridColumns: 3, gridGap: 22, gridAlignItems: 'stretch',
        contentWidth: 'full', padding: 0,
        classes: `${P}-feature-grid`,
        children: [
          featureCard({ iconSvg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" width="28" height="28"><path d="M13 2L3 14h7l-1 8 10-12h-7l1-8z"/></svg>',
                        h3: 'Fast to ship', desc: 'Templates assembled from native widgets, no HTML jungles, no surprise CSS.' }),
          featureCard({ iconSvg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" width="28" height="28"><path d="M12 2l9 4-9 4-9-4 9-4z M3 11l9 4 9-4 M3 16l9 4 9-4"/></svg>',
                        h3: 'Easy to edit', desc: 'Every label, link, price, and image is panel-editable. The buyer never opens code.' }),
          featureCard({ iconSvg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" width="28" height="28"><circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/></svg>',
                        h3: 'Built to last', desc: 'One brand kit drives every page; updates cascade automatically.' }),
        ],
      }),
    ],
  })],
});

// =============================================================
// 04, STATS STRIP (animating counters, note explicit title:'')
// =============================================================
const stats = container({
  flexDirection: 'row', contentWidth: 'full',
  padding: { unit: 'px', top: '48', right: '0', bottom: '48', left: '0', isLinked: false },
  background: 'classic', backgroundColor: C.accent,
  classes: `${P}-stats e-no-lazyload`,
  children: [container({
    flex: false, gridColumns: 4, gridGap: 0, gridAlignItems: 'center',
    contentWidth: 'full', padding: 0,
    classes: `${P}-wrap ${P}-stats-grid`,
    children: [
      [12, '+', 'years shipping'],
      [4800, '+', 'pages built'],
      [99,  '%', 'on-time rate'],
      [50,  '+', 'team',      ],
    ].map(([end, suf, lbl]) => container({
      flexDirection: 'column', flexGap: 6, flexAlignItems: 'center', contentWidth: 'full',
      padding: { unit: 'px', top: '8', right: '22', bottom: '8', left: '22', isLinked: false },
      border: 'solid', borderWidth: box(0, 1, 0, 0, false), borderColor: 'rgba(255,255,255,0.18)',
      classes: `${P}-stat-cell`,
      children: [
        counter({
          endingNumber: end, suffix: suf, title: '', duration: 1800, thousandSeparator: 'true',
          numberColor: '#FFFFFF', numberFont: F.display, numberSize: 40, numberWeight: 700,
          classes: `${P}-stat-counter`,
        }),
        heading({ title: lbl, tag: 'span', align: 'center', color: 'rgba(255,255,255,0.8)', font: F.body, size: 12, weight: 600, letterSpacing: 0.12, transform: 'uppercase', marginTop: 4 }),
      ],
    })),
  })],
});

// =============================================================
// 05, CTA SLAB
// =============================================================
const cta = container({
  flexDirection: 'column', contentWidth: 'full',
  padding: { unit: 'px', top: '88', right: '0', bottom: '88', left: '0', isLinked: false },
  background: 'classic', backgroundColor: C.ink, elementId: 'contact',
  classes: `${P}-cta e-no-lazyload`,
  children: [container({
    flexDirection: 'column', flexAlignItems: 'center', contentWidth: 'full', padding: 0,
    classes: `${P}-wrap`,
    children: [
      heading({ title: 'Ready when you are.', tag: 'h2', align: 'center',
        color: '#FFFFFF', font: F.display, weight: 700, size: 50, lineHeight: 1.06, marginBottom: 18 }),
      textEditor({
        editor: '<p>Pick a starter template, swap your brand tokens, ship the page.</p>',
        align: 'center', color: 'rgba(255,255,255,0.7)', font: F.body, size: 18, lineHeight: 1.6,
        marginBottom: 28,
      }),
      button({ text: 'Start building', link: '#top', classes: `${P}-btn-primary-inv ${P}-btn-lg` }),
    ],
  })],
});

// =============================================================
// 06, FOOTER (3-col link grid + legal row)
// =============================================================
const footer = container({
  flexDirection: 'column', contentWidth: 'full',
  padding: { unit: 'px', top: '64', right: '0', bottom: '32', left: '0', isLinked: false },
  background: 'classic', backgroundColor: C.soft,
  border: 'solid', borderWidth: box(1, 0, 0, 0, false), borderColor: C.line,
  classes: `${P}-site-footer e-no-lazyload`,
  children: [container({
    flexDirection: 'column', contentWidth: 'full', padding: 0,
    classes: `${P}-wrap`,
    children: [
      container({
        flex: false, gridColumns: 3, gridGap: 32, gridAlignItems: 'start',
        contentWidth: 'full', padding: 0,
        margin: { unit: 'px', top: '0', right: '0', bottom: '40', left: '0', isLinked: false },
        classes: `${P}-foot-grid`,
        children: [
          container({ flexDirection: 'column', contentWidth: 'full', padding: 0, children: [
            heading({ title: 'Product', tag: 'h4', color: C.ink, font: F.display, weight: 700, size: 14, letterSpacing: 0.12, transform: 'uppercase', marginBottom: 14 }),
            iconList({ view: 'traditional', spaceBetween: 6,
              items: [{ text: 'Features', link: { url: '#features' } }, { text: 'Pricing', link: { url: '#pricing' } }, { text: 'Changelog', link: { url: '#' } }],
              textColor: C.body, textHoverColor: C.accent, font: F.body, size: 14,
              classes: `${P}-foot-links` }),
          ]}),
          container({ flexDirection: 'column', contentWidth: 'full', padding: 0, children: [
            heading({ title: 'Company', tag: 'h4', color: C.ink, font: F.display, weight: 700, size: 14, letterSpacing: 0.12, transform: 'uppercase', marginBottom: 14 }),
            iconList({ view: 'traditional', spaceBetween: 6,
              items: [{ text: 'About', link: { url: '#about' } }, { text: 'Contact', link: { url: '#contact' } }, { text: 'Careers', link: { url: '#' } }],
              textColor: C.body, textHoverColor: C.accent, font: F.body, size: 14,
              classes: `${P}-foot-links` }),
          ]}),
          container({ flexDirection: 'column', contentWidth: 'full', padding: 0, children: [
            heading({ title: 'Contact', tag: 'h4', color: C.ink, font: F.display, weight: 700, size: 14, letterSpacing: 0.12, transform: 'uppercase', marginBottom: 14 }),
            textEditor({
              editor: '<p>123 Example Street<br>Anytown, USA<br><a href="mailto:hello@example.com">hello@example.com</a></p>',
              color: C.body, font: F.body, size: 14, lineHeight: 1.7,
              classes: `${P}-foot-address`,
            }),
          ]}),
        ],
      }),
      container({
        flexDirection: 'row', flexJustifyContent: 'space-between', contentWidth: 'full',
        padding: { unit: 'px', top: '20', right: '0', bottom: '0', left: '0', isLinked: false },
        border: 'solid', borderWidth: box(1, 0, 0, 0, false), borderColor: C.line,
        classes: `${P}-foot-base`,
        children: [
          heading({ title: '© 2026 Example, Inc.', tag: 'span', color: C.mute, font: F.body, size: 12 }),
          heading({ title: '<a href="#" style="color:inherit">Privacy</a> · <a href="#" style="color:inherit">Terms</a>', tag: 'span', color: C.mute, font: F.body, size: 12 }),
        ],
      }),
    ],
  })],
});

// =============================================================
// MASTER CSS, singular bottom HTML widget
// =============================================================
const extra = `
/* Buttons */
.elementor-element.${P}-btn-primary .elementor-button{background:var(--${P}-accent)!important;color:#fff!important;border:1.5px solid var(--${P}-accent)!important;border-radius:8px!important;padding:13px 22px!important;font-family:'${F.body}',sans-serif!important;font-weight:600!important;font-size:14px!important;transition:all .3s}
.elementor-element.${P}-btn-primary .elementor-button:hover{background:var(--${P}-accentDeep)!important;border-color:var(--${P}-accentDeep)!important;transform:translateY(-1px);box-shadow:0 10px 25px rgba(37,99,235,.3)}
.elementor-element.${P}-btn-ghost .elementor-button{background:transparent!important;color:var(--${P}-ink)!important;border:1.5px solid var(--${P}-ink)!important;border-radius:8px!important;padding:13px 22px!important;font-family:'${F.body}',sans-serif!important;font-weight:600!important;font-size:14px!important}
.elementor-element.${P}-btn-ghost .elementor-button:hover{background:var(--${P}-ink)!important;color:#fff!important;transform:translateY(-1px)}
.elementor-element.${P}-btn-primary-inv .elementor-button{background:#fff!important;color:var(--${P}-ink)!important;border:1.5px solid #fff!important;border-radius:8px!important;padding:13px 22px!important;font-family:'${F.body}',sans-serif!important;font-weight:600!important;font-size:14px!important}
.elementor-element.${P}-btn-primary-inv .elementor-button:hover{background:var(--${P}-soft)!important;transform:translateY(-1px)}
.elementor-element.${P}-btn-lg .elementor-button{padding:16px 28px!important;font-size:15px!important}

/* Header nav */
.${P}-masthead{grid-template-columns:auto 1fr auto!important;align-items:center!important;gap:32px!important}
.${P}-primary-nav .elementor-icon-list-items{display:flex!important;justify-content:center!important;gap:28px!important}
.${P}-primary-nav .elementor-icon-list-item{padding:0!important;margin:0!important}
.${P}-primary-nav .elementor-icon-list-icon{display:none!important}
.${P}-primary-nav .elementor-icon-list-text{font-family:'${F.body}',sans-serif!important;font-weight:500;font-size:14px;color:var(--${P}-ink);padding:6px 4px;border-bottom:1.5px solid transparent;transition:color .3s,border-color .3s}
.${P}-primary-nav .elementor-icon-list-item:hover .elementor-icon-list-text{color:var(--${P}-accent)!important;border-color:var(--${P}-accent)}

/* Features */
.${P}-feature-grid{grid-template-columns:repeat(3,1fr)!important;gap:22px!important;align-items:stretch!important}
.${P}-feature{transition:transform .3s,box-shadow .3s}
.${P}-feature:hover{transform:translateY(-4px);box-shadow:0 20px 40px rgba(15,23,42,.08)}
.${P}-feat-icon{display:inline-flex;align-items:center;justify-content:center;width:52px;height:52px;background:var(--${P}-soft);color:var(--${P}-accent);border-radius:12px}

/* Stats */
.${P}-stats-grid{grid-template-columns:repeat(4,1fr)!important;gap:0!important}
.${P}-stat-cell:last-child{border-right:0!important}

/* Footer */
.${P}-foot-grid{grid-template-columns:repeat(3,1fr)!important;gap:32px!important}
.${P}-foot-links .elementor-icon-list-items{display:flex!important;flex-direction:column;gap:6px!important}
.${P}-foot-links .elementor-icon-list-item{padding:0!important;margin:0!important}
.${P}-foot-links .elementor-icon-list-icon{display:none!important}
.${P}-foot-links .elementor-icon-list-text{font-size:14px;color:var(--${P}-body)!important;transition:color .3s;font-family:'${F.body}',sans-serif}
.${P}-foot-links .elementor-icon-list-item:hover .elementor-icon-list-text{color:var(--${P}-accent)!important}
.${P}-foot-address p{margin:0;color:var(--${P}-body)!important}
.${P}-foot-address a{color:var(--${P}-accent)!important;text-decoration:none}
.${P}-foot-address a:hover{text-decoration:underline}

/* Responsive */
@media (max-width:1080px){
  .${P}-feature-grid{grid-template-columns:1fr 1fr!important}
  .${P}-stats-grid{grid-template-columns:1fr 1fr!important}
  .${P}-foot-grid{grid-template-columns:1fr 1fr!important}
}
@media (max-width:640px){
  .${P}-primary-nav{display:none!important}
  .${P}-masthead{grid-template-columns:auto auto!important}
  .${P}-feature-grid,.${P}-stats-grid,.${P}-foot-grid{grid-template-columns:1fr!important}
  .${P}-stat-cell{border-right:0!important;border-bottom:1px solid rgba(255,255,255,0.18)}
}
`;

export default {
  title: 'Example Landing Page',
  status: 'publish',
  page_settings: { template: 'elementor_canvas' },
  structure: [
    header, hero, features, stats, cta, footer,
    html({ content: `<style>\n${generateMasterCSS({ theme, extra })}\n</style>` }),
  ],
};
