"use client";

import { useState, type CSSProperties } from "react";
import { WebMcpBridge } from "@/webmcp/WebMcpBridge";
import { AgentConsole } from "./AgentConsole";
import { DragController } from "./DragController";
import { Header } from "./Header";
import { PitchPanel } from "./PitchPanel";
import { PlayerPool } from "./PlayerPool";

type DraftRoomStyle = CSSProperties & {
  "--pool-rail": string;
  "--agent-rail": string;
};

/*
 * The room. Desktop (≥1024px): player pool, the pitch, the agent console, all exactly one viewport tall so the
 * rails scroll inside themselves. Below that: the pitch leads, then the pool; the console lives in a sheet
 * behind the Agent button.
 */
export function DraftRoom() {
  const [poolCollapsed, setPoolCollapsed] = useState(false);
  const [agentCollapsed, setAgentCollapsed] = useState(false);
  const railStyle: DraftRoomStyle = {
    "--pool-rail": poolCollapsed ? "52px" : "clamp(320px, 23.6vw, 340px)",
    "--agent-rail": agentCollapsed ? "52px" : "clamp(340px, 26.4vw, 380px)",
  };

  return (
    <DragController>
      <div className="flex flex-col">
        <WebMcpBridge />
        <Header />
        <main
          className="draft-room-grid grid grid-cols-1 gap-2 px-2 pb-2 sm:gap-3 sm:px-3 sm:pb-3 lg:h-[calc(100dvh-52px)] lg:min-h-[600px] lg:grid-rows-[minmax(0,1fr)]"
          style={railStyle}
        >
          <div className="order-2 flex h-[70dvh] min-h-0 flex-col lg:order-1 lg:h-auto">
            <PlayerPool collapsed={poolCollapsed} onCollapsedChange={setPoolCollapsed} />
          </div>
          <div className="order-1 flex h-[66dvh] min-h-[480px] flex-col lg:order-2 lg:h-auto lg:min-h-0">
            <PitchPanel />
          </div>
          <div className="hidden min-h-0 flex-col lg:order-3 lg:flex">
            <AgentConsole collapsed={agentCollapsed} onCollapsedChange={setAgentCollapsed} />
          </div>
        </main>
      </div>
    </DragController>
  );
}
