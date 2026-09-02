"use client";

import { useEffect } from "react";
import { getDraftStore, useDraftStore } from "@/lib/store";
import { TOOL_DEFINITIONS, TOOL_NAMES, registrationFields } from "./definitions";
import { executeTool } from "./execute";
import { jsonObjectSchema } from "./json";

const UNAVAILABLE_AFTER_MS = 2500;
const LATE_INJECTION_POLL_MS = 250;
const LATE_INJECTION_GIVE_UP_MS = 120_000;

/**
 * Connects the parse-time tool shells (see boot.ts) to the live store, and mirrors registration
 * status into the store so the header can show whether an agent can see the tools.
 */
export function WebMcpBridge() {
  const setWebMcp = useDraftStore((s) => s.setWebMcp);

  useEffect(() => {
    const store = getDraftStore();
    window.__draftRoom = {
      execute: (name, input) => executeTool(store, name, input),
      toolNames: TOOL_NAMES,
    };

    const readStatus = () => {
      const status = window.__draftRoomWebMcp;
      if (status?.bound) {
        setWebMcp({ state: "registered", toolCount: status.toolCount });
        return true;
      }
      return false;
    };

    // The boot script normally runs first. If it was stripped (CSP, some hosts), register here,
    // and keep looking for a while in case the host injects the API after hydration.
    const bindTools = (): boolean => {
      const modelContext = document.modelContext;
      if (window.__draftRoomToolsBound) return true;
      if (!modelContext?.registerTool) return false;
      window.__draftRoomToolsBound = true;
      Promise.allSettled(
        TOOL_DEFINITIONS.map((def) =>
          modelContext.registerTool({
            ...registrationFields(def),
            execute: (input) => {
              // The browser's argument object is the one untyped value in the app; decode it here.
              const decoded = jsonObjectSchema.safeParse(input);
              return executeTool(store, def.name, decoded.success ? decoded.data : {});
            },
          }),
        ),
      ).then((results) => {
        const ok = results.filter((r) => r.status === "fulfilled").length;
        window.__draftRoomWebMcp = { bound: ok > 0, toolCount: ok, error: null };
        readStatus();
      });
      return true;
    };

    const startedAt = Date.now();
    let poll: number | null = null;
    if (!bindTools()) {
      poll = window.setInterval(() => {
        if (bindTools() || Date.now() - startedAt > LATE_INJECTION_GIVE_UP_MS) {
          if (poll !== null) window.clearInterval(poll);
          poll = null;
        }
      }, LATE_INJECTION_POLL_MS);
    }

    readStatus();
    const onChange = () => readStatus();
    document.addEventListener("draftroom:webmcp", onChange);
    const timer = window.setTimeout(() => {
      if (!readStatus()) setWebMcp({ state: "unavailable", toolCount: 0 });
    }, UNAVAILABLE_AFTER_MS);

    return () => {
      document.removeEventListener("draftroom:webmcp", onChange);
      window.clearTimeout(timer);
      if (poll !== null) window.clearInterval(poll);
    };
  }, [setWebMcp]);

  return null;
}
