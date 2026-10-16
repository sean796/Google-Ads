---
name: emcp-gsap
description: >-
  Use this skill whenever the user wants to build, change, debug, or optimize
  GSAP animation on a WordPress site through Neo EMCP, recognizable by the
  `emcp-tools-gsap-read` and `emcp-tools-gsap-write` dispatchers or the stable
  `emcp-gsap` WordPress script handle. Covers live capability discovery,
  per-plugin and loading-context configuration, core tweens, timelines,
  ScrollTrigger, all bundled GSAP plugins, Elementor lifecycle handling,
  selector scoping, cleanup, responsive and reduced-motion behavior,
  performance, and real-browser verification. Trigger for scroll animation,
  pinning, parallax, SplitText, MorphSVG, DrawSVG, Flip, Draggable, MotionPath,
  animation timelines, or GSAP troubleshooting on an EMCP-connected site.
license: MIT
---

# EMCP GSAP animation over WordPress and MCP

Neo EMCP bundles GSAP locally and exposes its loading configuration through two MCP dispatchers. Use the bundled scripts and stable WordPress handles. Do not add a CDN copy, npm bundle, GreenSock auth token, or private registry configuration to the site.

This playbook consolidates the official GreenSock GSAP skills for core, timelines, ScrollTrigger, plugins, utilities, framework lifecycle, React lifecycle, and performance, then adapts them to EMCP, WordPress, and Elementor. Upstream: [GreenSock GSAP Skills](https://github.com/greensock/gsap-skills/tree/main/skills), MIT license, Copyright (c) 2026 GreenSock.

**Required workflow: discover -> configure -> implement -> verify -> read back.**

## 1. Discover the live integration before writing code

Never infer availability from this skill or from a remembered plugin list. The connected site is authoritative.

```jsonc
// Discover dispatcher operations.
emcp-tools-gsap-read({})
emcp-tools-gsap-write({})

// Read the active module, bundled version, contexts, and selected plugin ids.
emcp-tools-gsap-read({
  "operation": "get-status",
  "arguments": {}
})

// Read every plugin's id, browser global, WordPress handle, dependencies,
// external prerequisite, selected state, and request-local runtime state.
emcp-tools-gsap-read({
  "operation": "list-plugins",
  "arguments": {}
})
```

- If neither dispatcher exists, the Pro GSAP Integration module is not active or licensed. Tell the administrator to enable **Neo EMCP -> Modules -> GSAP Integration**. Do not silently load another GSAP copy.
- If read exists but write does not, the write tool is disabled or the connected user lacks `manage_options`. Report that instead of inventing another settings path.
- `core_registered`, `core_enqueued`, `is_registered`, and `is_enqueued` describe the current request. Treat the configured contexts and enabled plugin ids as persistent state, then verify asset loading on the actual target page.
- The normal frontend context is `frontend`. Other valid contexts are `wp-admin`, `block-editor`, and `elementor-editor`. Do not enable admin/editor contexts unless the animation code must run there.

## 2. Enable only what the animation needs

Core is always loaded in every selected context. Enable a missing plugin with the narrow `set-plugin` operation:

```jsonc
emcp-tools-gsap-write({
  "operation": "set-plugin",
  "arguments": { "plugin": "scroll-trigger", "enabled": true }
})
```

Dependencies are added automatically. Disabling a dependency also disables selected plugins that require it, so do not disable existing plugins unless the user asked for that change and the impact is understood.

`update-settings` replaces each list that is supplied. Read current status, merge deliberately, and send only the keys that need changing:

```jsonc
emcp-tools-gsap-write({
  "operation": "update-settings",
  "arguments": {
    "contexts": ["frontend", "elementor-editor"]
  }
})
```

After every write, inspect the returned status and call `get-status` again. Do not claim a plugin is available merely because the write returned without an error.

## 3. Know the packaged handles and globals

Core handle: `emcp-gsap`. In browser code use the global `gsap` object. CSSPlugin, AttrPlugin, EndArrayPlugin, ModifiersPlugin, RoundPropsPlugin, and SnapPlugin are built into core and have no separate toggle.

Every optional handle is `emcp-gsap-{plugin-id}`. Confirm the following catalog against `list-plugins` because the live plugin version may differ from this skill:

| Plugin id | Browser global | Use for | Dependency / prerequisite |
|---|---|---|---|
| `css-rule` | `CSSRulePlugin` | CSS rule and pseudo-element properties | none |
| `custom-bounce` | `CustomBounce` | custom bounce eases | `custom-ease` |
| `custom-ease` | `CustomEase` | custom easing curves | none |
| `custom-wiggle` | `CustomWiggle` | wiggle eases | `custom-ease` |
| `draggable` | `Draggable` | pointer/touch dragging | add `inertia` for momentum |
| `draw-svg` | `DrawSVGPlugin` | SVG stroke reveals | visible SVG stroke required |
| `easel` | `EaselPlugin` | CreateJS/EaselJS objects | CreateJS/EaselJS is not bundled |
| `ease-pack` | `EasePack` | RoughEase, SlowMo, ExpoScaleEase | none |
| `flip` | `Flip` | layout-state transitions | none |
| `gs-dev-tools` | `GSDevTools` | development timeline controls | development only |
| `inertia` | `InertiaPlugin` | velocity and momentum | none |
| `morph-svg` | `MorphSVGPlugin` | morph SVG shapes | none |
| `motion-path-helper` | `MotionPathHelper` | visually tune motion paths | `motion-path`; development only |
| `motion-path` | `MotionPathPlugin` | animate along a path | none |
| `observer` | `Observer` | normalized wheel, touch, pointer input | none |
| `physics-2d` | `Physics2DPlugin` | velocity, angle, gravity | none |
| `physics-props` | `PhysicsPropsPlugin` | physics on arbitrary properties | none |
| `pixi` | `PixiPlugin` | PixiJS display objects | PixiJS is not bundled |
| `scramble-text` | `ScrambleTextPlugin` | scrambled text transitions | none |
| `scroll-smoother` | `ScrollSmoother` | smooth native scrolling | `scroll-trigger`; wrapper markup required |
| `scroll-to` | `ScrollToPlugin` | animated scroll positions | none |
| `scroll-trigger` | `ScrollTrigger` | scroll-linked animation and pinning | none |
| `split-text` | `SplitText` | character, word, or line animation | none |
| `text` | `TextPlugin` | animate text content | none |

Register every optional plugin before first use, even when its UMD file exposes a global:

```javascript
gsap.registerPlugin(ScrollTrigger, SplitText);
```

In a theme or plugin, make the animation file depend on the registered WordPress handles so execution order is guaranteed:

```php
wp_enqueue_script(
    'site-hero-animation',
    get_stylesheet_directory_uri() . '/assets/js/hero-animation.js',
    array( 'emcp-gsap', 'emcp-gsap-scroll-trigger' ),
    '1.0.0',
    array( 'in_footer' => true, 'strategy' => 'defer' )
);
```

For integrations already running in PHP, `EMCP_Tools_GSAP_Assets::enqueue_plugin( 'scroll-trigger' )` can request a catalog plugin and its dependencies. Prefer normal WordPress dependency declarations for a dedicated script file.

## 4. Put animation code in the right site surface

- **One Elementor page:** inspect the page first, choose a stable container id/class, then use `add-custom-js` with `wrap_dom_ready: true`. Pass JavaScript only; the tool adds the script tags. The tool inserts a new HTML widget, so search the page for an existing animation widget before creating another.
- **Site-wide Elementor Pro code:** use `list-code-snippets` first to prevent duplicates. Create or update a clearly named snippet and delay initialization until DOM ready. Prefer a draft for review unless the user explicitly wants it active.
- **Theme or plugin code:** enqueue a dedicated file with the exact `emcp-gsap*` dependencies. Do not hard-code the vendor file path and do not register another copy of GSAP.
- **Block or admin UI:** enable the matching context first and initialize only inside the target editor/admin screen. Never make an editor-wide animation global by accident.

When using `add-custom-js`, the `wrap_dom_ready` option is important: EMCP's GSAP files are deferred WordPress footer scripts, so waiting for DOM ready lets those scripts execute before the inline page callback.

## 5. Canonical Elementor-safe initialization

Scope selectors to one stable Elementor element. Revert the previous instance before an Elementor preview re-renders the element. `gsap.matchMedia()` provides its own GSAP context, so do not nest `gsap.context()` inside it.

```javascript
(function () {
  const elementId = "abc123"; // replace with the verified Elementor element id
  const instances = new WeakMap();

  function mount(root) {
    if (!root || !window.gsap) return;

    const previous = instances.get(root);
    if (previous) previous.revert();

    const mm = gsap.matchMedia();
    mm.add(
      {
        desktop: "(min-width: 768px)",
        reduceMotion: "(prefers-reduced-motion: reduce)"
      },
      function (context) {
        const reduceMotion = context.conditions.reduceMotion;
        const distance = context.conditions.desktop ? 48 : 20;

        if (reduceMotion) {
          gsap.set(".hero-item", { clearProps: "all" });
          return;
        }

        gsap.from(".hero-item", {
          y: distance,
          autoAlpha: 0,
          duration: 0.65,
          stagger: 0.08,
          ease: "power2.out"
        });
      },
      root
    );

    instances.set(root, mm);
  }

  function findAndMount() {
    mount(document.querySelector('[data-id="' + elementId + '"]'));
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", findAndMount, { once: true });
  } else {
    findAndMount();
  }

  window.addEventListener("elementor/frontend/init", function () {
    elementorFrontend.hooks.addAction("frontend/element_ready/global", function ($scope) {
      const root = $scope && $scope[0];
      if (root && root.dataset.id === elementId) mount(root);
    });
  });
})();
```

For a normal non-responsive animation, use `gsap.context(callback, root)` and retain the returned context; call `context.revert()` before rebuilding or removing that DOM subtree. Remove event listeners and revert Draggable, Observer, SplitText, ScrollSmoother, and other retained instances during cleanup.

## 6. Authoring rules from the official GSAP skills

### Core tweens

- Use `gsap.to()` for current-to-end, `gsap.from()` for entrance-from-state, `gsap.fromTo()` for explicit endpoints, and `gsap.set()` for immediate state.
- Use camelCase vars and GSAP transform aliases: `x`, `y`, `xPercent`, `yPercent`, `scale`, `rotation`. Prefer `autoAlpha` when zero opacity should also remove visibility and pointer interception.
- Use documented eases such as `power1.out`, `power2.inOut`, `back.out(1.7)`, or `none`.
- Store the returned tween or timeline when it needs pause, play, reverse, seek, or kill control.
- Later `from()` or `fromTo()` tweens on the same target/property may need `immediateRender: false` so they do not overwrite an earlier start state.

### Timelines

- Use `gsap.timeline()` for coordinated multi-step animation instead of chains of manual delays.
- Put shared `duration` and `ease` in timeline `defaults`.
- Use the position parameter (`<`, `>`, `+=`, `-=`, labels) to express overlap and sequencing.
- Put ScrollTrigger on a top-level tween or on the timeline configuration, never on child tweens inside a timeline.

### Responsive and accessible motion

- Use `gsap.matchMedia()` for breakpoints and `prefers-reduced-motion`.
- Under reduced motion, skip decorative movement or set the final readable state immediately. Do not leave content hidden at `autoAlpha: 0`.
- Motion must not be the only way to communicate state. Preserve focus order, pointer access, and keyboard operation.
- SplitText defaults help screen readers by labeling the original text and hiding fragments. When the content has nested links or meaningful child semantics, use an accessible unsplit duplicate rather than flattening those semantics.

### Performance

- Prefer transforms and opacity over layout-heavy `width`, `height`, `top`, `left`, margin, or padding animation.
- Use `will-change` only on elements that genuinely animate; remove or clear it afterward when practical.
- Use stagger rather than many equivalent delayed tweens, `gsap.quickTo()` for high-frequency pointer updates, and avoid creating timelines inside an animation frame loop.
- Read layout values together before writes. Test large target sets and pinned experiences on a small viewport and a lower-powered device profile.

### Utilities

Use `gsap.utils` instead of reimplementing common animation math: `clamp`, `mapRange`, `normalize`, `interpolate`, `random`, `snap`, `distribute`, `selector`, `toArray`, `pipe`, `wrap`, and `wrapYoyo`. Most return a reusable function when the final value argument is omitted; `random()` uses a final `true` flag for that form.

## 7. Plugin-specific guardrails

### ScrollTrigger

- Register `ScrollTrigger` before use. Choose `scrub` for progress linked to scroll or `toggleActions` for discrete lifecycle behavior; do not configure both on one trigger.
- Pin a wrapper and animate a child. Do not animate the pinned element itself.
- Create triggers in page order. After fonts, images, AJAX, or Elementor layout changes affect geometry, call `ScrollTrigger.refresh()` once the layout is stable.
- Development markers must be removed before delivery.
- A fake horizontal-scroll `containerAnimation` must use `ease: "none"`; its nested triggers cannot pin or snap.
- ScrollSmoother already integrates with ScrollTrigger. Third-party smooth-scroll libraries need `scrollerProxy()` and an update bridge, but do not add one without a concrete requirement.

### SplitText and text effects

- Split only the units being animated. For line animation or custom fonts, use `autoSplit: true` with `onSplit()` and return its tween/timeline so re-splits clean up correctly.
- Restore the original markup with `revert()` when the effect is removed. SplitText does not support SVG text.
- ScrambleText and TextPlugin change visible copy; preserve the correct final text and do not use the effect where it harms comprehension.

### SVG

- DrawSVG requires a visible stroke and animates stroke segments, not fills.
- MorphSVG targets paths, polygons, or polylines; convert primitives when needed and test complex multi-segment shapes visually.
- MotionPath needs a verified path and alignment origin. Enable MotionPathHelper only while tuning and remove development helpers afterward.

### Interaction and layout

- Flip flow is `Flip.getState()` -> perform the DOM/layout change -> `Flip.from(state, vars)`.
- Draggable momentum requires InertiaPlugin. Provide bounds, preserve click/keyboard alternatives, and retain the returned instances for cleanup.
- Observer normalizes gesture input; it does not replace ScrollTrigger for position-linked scroll animation.
- ScrollSmoother requires its documented wrapper/content DOM structure and can affect the whole page. Do not enable it casually on an existing theme or builder layout.
- GSDevTools and MotionPathHelper are development aids. Do not leave them enabled or instantiated in production code.

## 8. Verification is part of the change

Configuration alone is not proof. Test the actual target URL in a real browser.

1. Read `get-status` and `list-plugins`; record the required context, ids, handles, globals, and dependencies.
2. Inspect the page data and rendered DOM. Confirm each selector matches only the intended elements.
3. Load the frontend and confirm `window.gsap` plus each required plugin global exists. Confirm the expected local `emcp-gsap*` scripts loaded and no second GSAP copy came from a CDN/theme/plugin.
4. Exercise the animation to completion. For ScrollTrigger, test forward and reverse scrolling, start/end placement, pins, and refresh after late content.
5. Test desktop and mobile widths plus reduced-motion emulation. Confirm readable final states and usable controls.
6. Check the browser console for errors and warnings, and watch for duplicate initialization after Elementor preview updates.
7. Read page/code data back through MCP and re-run `gsap-read`. Report the tested URL, contexts, plugin ids, and observed result.

Do not declare success from generated JavaScript, MCP settings, or a network response alone. The animation must visibly run on the real page without console errors, layout breakage, duplicate instances, or reduced-motion regressions.

> This skill ships in the Neo EMCP premium build and is included in both downloadable skills bundle formats.
