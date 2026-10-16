/**
 * Loads Pulse chat CSS/JS on first launcher tap or after idle.
 */
(function () {
  "use strict";

  var pack = window.neoPulseChatLazy || {};
  var loaded = false;
  var inflight = null;
  // Files already loaded, so a retry after a failure never runs a script twice.
  var doneStyles = {};
  var doneScripts = {};

  function injectStyle(href) {
    if (doneStyles[href]) return Promise.resolve();
    return new Promise(function (resolve) {
      var link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = href;
      link.onload = function () {
        doneStyles[href] = true;
        resolve();
      };
      link.onerror = function () {
        if (link.parentNode) link.parentNode.removeChild(link);
        resolve();
      };
      document.head.appendChild(link);
    });
  }

  function injectScript(src) {
    if (doneScripts[src]) return Promise.resolve();
    return new Promise(function (resolve, reject) {
      var script = document.createElement("script");
      script.src = src;
      script.async = false;
      script.onload = function () {
        doneScripts[src] = true;
        resolve();
      };
      script.onerror = function () {
        if (script.parentNode) script.parentNode.removeChild(script);
        reject(new Error("Could not load " + src));
      };
      document.body.appendChild(script);
    });
  }

  function revealLauncher() {
    var btn = document.getElementById("neo-pulse-chat-mobile-launcher");
    if (!btn) return;
    btn.removeAttribute("hidden");
    btn.classList.remove("fcw-launcher--pending");
  }

  function load() {
    if (loaded) return Promise.resolve();
    if (inflight) return inflight;
    window.neoPulseChatConfig = pack.config || window.neoPulseChatConfig || {};
    if (pack.voiceConfig) {
      window.neoPulseVoiceConfig = pack.voiceConfig;
    }
    // Stylesheets download in parallel (document order keeps the cascade); scripts run in order.
    inflight = Promise.all((pack.styles || []).map(injectStyle))
      .then(function () {
        return (pack.scripts || []).reduce(function (chain, src) {
          return chain.then(function () {
            return injectScript(src);
          });
        }, Promise.resolve());
      })
      .then(
        function () {
          loaded = true;
          inflight = null;
          revealLauncher();
        },
        function (err) {
          // Let the next tap try again, and never leave the launcher hidden.
          inflight = null;
          revealLauncher();
          throw err;
        }
      );
    return inflight;
  }

  function isLauncher(node) {
    if (!node || !node.closest) return null;
    return node.closest("[data-fcw-chat-launcher], #neo-pulse-chat-mobile-launcher");
  }

  document.addEventListener(
    "click",
    function (event) {
      var btn = isLauncher(event.target);
      if (!btn || loaded) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      load().then(
        function () {
          btn.click();
        },
        function () {
          // Load failed (offline, blocked file): the next tap retries.
        }
      );
    },
    true
  );

  var idle = window.requestIdleCallback || function (cb) {
    return window.setTimeout(cb, 2000);
  };
  idle(function () {
    load().catch(function () {});
  }, { timeout: 4000 });
})();
