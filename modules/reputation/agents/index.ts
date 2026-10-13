import { readFileSync } from "node:fs";
import { join } from "node:path";
import { type AgentManifest, parseManifest } from "@atrium/policy";

const dir = import.meta.dir;

/** Host's subagents that exist today. Echo needs a language model and comes later. */
export const HOST_MANIFEST_FILES = [
  "host.ask.agent.yaml",
  "host.recovery.agent.yaml",
  "host.sentiment.agent.yaml",
] as const;

export function loadHostManifests(): AgentManifest[] {
  return HOST_MANIFEST_FILES.map((file) => parseManifest(readFileSync(join(dir, file), "utf8")));
}
