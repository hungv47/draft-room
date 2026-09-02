/// <reference types="webmcp-types" />

import type { ToolResult } from "./execute";
import type { JsonObject } from "./json";

declare global {
  interface DraftRoomBridge {
    execute(name: string, input: JsonObject): ToolResult;
    toolNames: readonly string[];
  }

  interface DraftRoomWebMcpStatus {
    bound: boolean;
    toolCount: number;
    error: string | null;
  }

  interface Window {
    __draftRoom?: DraftRoomBridge;
    __draftRoomWebMcp?: DraftRoomWebMcpStatus;
    __draftRoomToolsBound?: boolean;
    __draftRoomBootRan?: boolean;
  }
}
