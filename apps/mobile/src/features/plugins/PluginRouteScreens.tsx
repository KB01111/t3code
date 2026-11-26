import { useNavigation, type StaticScreenProps } from "@react-navigation/native";
import { useGT, useMessages } from "gt-react-native";
import type { ReactNode } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { EmptyState } from "../../components/ui/EmptyState";
import { ListRow } from "../../components/ui/ListRow";
import { ScreenScrollView as ScrollView } from "../../components/ui/ScreenScrollView";
import { SettingsScreen } from "../settings/components/SettingsScreen";
import { SettingsSection } from "../settings/components/SettingsSection";
import { findMobileNativePlugin, MOBILE_NATIVE_PLUGINS } from "./registry";

function PluginScroll({ children }: { readonly children: ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      showsVerticalScrollIndicator={false}
      className="flex-1"
      contentContainerClassName="gap-3 px-5 pt-4"
      contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 18) + 18 }}
    >
      {children}
    </ScrollView>
  );
}

export function SettingsPluginsRouteScreen() {
  const gt = useGT();
  const m = useMessages();
  const navigation = useNavigation();
  return (
    <SettingsScreen title={gt("Plugins")}>
      <PluginScroll>
        <SettingsSection>
          {MOBILE_NATIVE_PLUGINS.map((plugin) => (
            <ListRow
              key={plugin.id}
              icon={plugin.icon}
              label={m(plugin.name)}
              description={m(plugin.description)}
              onPress={() => navigation.navigate("SettingsPlugin", { pluginId: plugin.id })}
            />
          ))}
        </SettingsSection>
      </PluginScroll>
    </SettingsScreen>
  );
}

export function SettingsPluginRouteScreen({
  route,
}: StaticScreenProps<{ readonly pluginId: string }>) {
  const gt = useGT();
  const m = useMessages();
  const plugin = findMobileNativePlugin(route.params.pluginId);
  return (
    <SettingsScreen title={plugin === null ? gt("Plugins") : m(plugin.name)}>
      <PluginScroll>
        {plugin === null ? (
          <EmptyState
            variant="plain"
            title={gt("Plugin not found")}
            detail={gt("This KBCode build does not include that plugin.")}
          />
        ) : (
          <plugin.Screen />
        )}
      </PluginScroll>
    </SettingsScreen>
  );
}
