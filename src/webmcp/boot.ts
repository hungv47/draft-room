import { registrationFields, type ToolDefinition } from "./definitions";

/**
 * Builds the inline script that registers the tools while the HTML is still parsing.
 *
 * Why not register from React? Agent hosts (ChatGPT's in-app browser in particular) may read
 * `document.modelContext` before hydration finishes. Registering at parse time means the tools
 * are discoverable immediately; each `execute` simply waits for the React bridge
 * (`window.__draftRoom`) to come online before touching the store.
 */
export function buildBootScript(definitions: readonly ToolDefinition[]): string {
  const json = JSON.stringify(definitions.map(registrationFields)).replace(/</g, "\\u003c");
  return `(function () {
  if (window.__draftRoomBootRan) return;
  window.__draftRoomBootRan = true;
  var DEFS = ${json};
  var BRIDGE_WAIT_MS = 30000;
  var CONTEXT_WAIT_MS = 120000;
  var POLL_MS = 25;

  function publish(bound, toolCount, error) {
    window.__draftRoomWebMcp = { bound: bound, toolCount: toolCount, error: error || null };
    try { document.dispatchEvent(new CustomEvent("draftroom:webmcp", { detail: window.__draftRoomWebMcp })); } catch (e) {}
  }

  function waitForBridge() {
    return new Promise(function (resolve, reject) {
      var started = Date.now();
      function tick() {
        var bridge = window.__draftRoom;
        if (bridge && typeof bridge.execute === "function") { resolve(bridge); return true; }
        if (Date.now() - started >= BRIDGE_WAIT_MS) {
          reject(new Error("Draft Room is still loading; try again in a moment."));
          return true;
        }
        return false;
      }
      if (tick()) return;
      var timer = setInterval(function () { if (tick()) clearInterval(timer); }, POLL_MS);
    });
  }

  function makeTool(def) {
    return {
      name: def.name,
      title: def.title,
      description: def.description,
      inputSchema: def.inputSchema,
      annotations: def.annotations,
      execute: function (input) {
        return waitForBridge().then(function (bridge) { return bridge.execute(def.name, input || {}); });
      }
    };
  }

  function bind() {
    var mc = document.modelContext;
    if (!mc || typeof mc.registerTool !== "function") return false;
    if (window.__draftRoomToolsBound) return true;
    window.__draftRoomToolsBound = true;
    var pending = [];
    for (var i = 0; i < DEFS.length; i++) {
      try {
        pending.push(Promise.resolve(mc.registerTool(makeTool(DEFS[i]))));
      } catch (error) {
        pending.push(Promise.reject(error));
      }
    }
    Promise.allSettled(pending).then(function (results) {
      var ok = 0; var firstError = null;
      for (var j = 0; j < results.length; j++) {
        if (results[j].status === "fulfilled") ok++;
        else if (!firstError) firstError = String(results[j].reason && results[j].reason.message || results[j].reason);
      }
      publish(ok > 0, ok, firstError);
    });
    return true;
  }

  // Poll only. Defining our own document.modelContext property would shadow a host that installs
  // the real accessor on Document.prototype later.
  function watch() {
    if (bind()) return;
    var started = Date.now();
    var poll = setInterval(function () {
      if (bind() || Date.now() - started > CONTEXT_WAIT_MS) clearInterval(poll);
    }, POLL_MS);
  }

  watch();
})();`;
}
