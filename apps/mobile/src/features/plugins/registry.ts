import { msg } from "gt-react-native";
import type { ComponentType } from "react";

import type { AppSymbolName } from "../../components/ui/AppSymbol";
import { SymphonyPluginScreen } from "./SymphonyPluginScreen";

/** Mobile's half of KBCode's native plugins; web keeps the same ids in apps/web/src/plugins. */
export interface MobileNativePlugin {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly icon: AppSymbolName;
  readonly Screen: ComponentType;
}

export const MOBILE_NATIVE_PLUGINS: ReadonlyArray<MobileNativePlugin> = [
  {
    id: "symphony",
    name: msg("OpenAI Symphony"),
    description: msg("Watch Symphony turn tracker issues into autonomous agent runs."),
    icon: "flowchart",
    Screen: SymphonyPluginScreen,
  },
];

export function findMobileNativePlugin(id: string): MobileNativePlugin | null {
  return MOBILE_NATIVE_PLUGINS.find((plugin) => plugin.id === id) ?? null;
}
