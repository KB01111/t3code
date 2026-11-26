import { createFileRoute } from "@tanstack/react-router";

import { PluginRoutePage } from "../components/plugins/PluginsPage";

export const Route = createFileRoute("/_chat/plugins/$pluginId")({
  component: function PluginRoute() {
    const { pluginId } = Route.useParams();
    return <PluginRoutePage pluginId={pluginId} />;
  },
});
