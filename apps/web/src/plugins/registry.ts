import { msg } from "gt-react";
import { WorkflowIcon, type LucideIcon } from "lucide-react";
import { lazy, type ComponentType } from "react";

/**
 * KBCode native plugins ship in the bundle: each one owns a page under /plugins/<id> and,
 * when it needs the environment, typed RPCs served by a server service.
 */
export interface NativePlugin {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly Icon: LucideIcon;
  readonly Page: ComponentType;
}

export const NATIVE_PLUGINS: ReadonlyArray<NativePlugin> = [
  {
    id: "symphony",
    name: msg("OpenAI Symphony"),
    description: msg("Watch Symphony turn tracker issues into autonomous agent runs."),
    Icon: WorkflowIcon,
    Page: lazy(() =>
      import("~/components/plugins/symphony/SymphonyPage").then((module) => ({
        default: module.SymphonyPage,
      })),
    ),
  },
];

export function findNativePlugin(id: string): NativePlugin | null {
  return NATIVE_PLUGINS.find((plugin) => plugin.id === id) ?? null;
}
