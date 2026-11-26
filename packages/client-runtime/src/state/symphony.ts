import { WS_METHODS } from "@t3tools/contracts";
import type { Atom } from "effect/reactivity";

import type { EnvironmentRegistry } from "../connection/registry.ts";
import {
  createAtomCommandScheduler,
  createEnvironmentRpcCommand,
  createEnvironmentRpcQueryAtomFamily,
} from "./runtime.ts";

// Symphony has no push channel, so an open page polls; atoms stop when nothing reads them.
const STATE_REFRESH_INTERVAL_MS = 5_000;

export function createSymphonyEnvironmentAtoms<R, E>(
  runtime: Atom.AtomRuntime<EnvironmentRegistry | R, E>,
) {
  const scheduler = createAtomCommandScheduler();
  return {
    state: createEnvironmentRpcQueryAtomFamily(runtime, {
      label: "environment-data:symphony:state",
      tag: WS_METHODS.symphonyGetState,
      refreshIntervalMs: STATE_REFRESH_INTERVAL_MS,
    }),
    issue: createEnvironmentRpcQueryAtomFamily(runtime, {
      label: "environment-data:symphony:issue",
      tag: WS_METHODS.symphonyGetIssue,
      refreshIntervalMs: STATE_REFRESH_INTERVAL_MS,
    }),
    refresh: createEnvironmentRpcCommand(runtime, {
      label: "environment-data:symphony:refresh",
      tag: WS_METHODS.symphonyRefresh,
      scheduler,
      concurrency: {
        mode: "serial" as const,
        key: ({ environmentId }: { environmentId: string }) => environmentId,
      },
    }),
  };
}
