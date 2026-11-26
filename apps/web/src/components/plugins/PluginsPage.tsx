import { Link } from "@tanstack/react-router";
import { T, useGT, useMessages } from "gt-react";
import { PuzzleIcon } from "lucide-react";
import { Suspense, type ReactNode } from "react";

import { WorkspaceBreadcrumb, WorkspaceBreadcrumbItem } from "~/components/WorkspaceBreadcrumb";
import { WorkspacePageHeader } from "~/components/WorkspacePageHeader";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "~/components/ui/empty";
import { SidebarInset } from "~/components/ui/sidebar";
import { Spinner } from "~/components/ui/spinner";
import { isElectron } from "~/env";
import { findNativePlugin, NATIVE_PLUGINS } from "~/plugins/registry";

function PluginShell({
  pluginName,
  children,
}: {
  readonly pluginName: string | null;
  readonly children: ReactNode;
}) {
  const gt = useGT();
  return (
    <SidebarInset className="h-dvh min-h-0 overflow-hidden overscroll-y-none">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-x-hidden bg-background">
        <WorkspacePageHeader electron={isElectron} reserveNativeControls className="bg-background">
          <WorkspaceBreadcrumb ariaLabel={gt("Plugins breadcrumb")}>
            <WorkspaceBreadcrumbItem current={pluginName === null}>
              {pluginName === null ? (
                <h1 className="truncate">
                  <T>Plugins</T>
                </h1>
              ) : (
                <Link to="/plugins" className="truncate hover:text-foreground">
                  <T>Plugins</T>
                </Link>
              )}
            </WorkspaceBreadcrumbItem>
            {pluginName === null ? null : (
              <WorkspaceBreadcrumbItem current>
                <h1 className="truncate">{pluginName}</h1>
              </WorkspaceBreadcrumbItem>
            )}
          </WorkspaceBreadcrumb>
        </WorkspacePageHeader>
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      </div>
    </SidebarInset>
  );
}

export function PluginsPage() {
  const m = useMessages();
  return (
    <PluginShell pluginName={null}>
      <ul className="mx-auto flex w-full max-w-3xl flex-col gap-2 p-4">
        {NATIVE_PLUGINS.map((plugin) => (
          <li key={plugin.id}>
            <Link
              to="/plugins/$pluginId"
              params={{ pluginId: plugin.id }}
              className="flex items-start gap-3 rounded-lg border bg-card p-4 hover:bg-accent/50"
            >
              <plugin.Icon aria-hidden className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
              <span className="flex min-w-0 flex-col gap-1">
                <span className="font-medium">{m(plugin.name)}</span>
                <span className="text-sm text-muted-foreground">{m(plugin.description)}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </PluginShell>
  );
}

export function PluginRoutePage({ pluginId }: { readonly pluginId: string }) {
  const m = useMessages();
  const plugin = findNativePlugin(pluginId);
  if (plugin === null) {
    return (
      <PluginShell pluginName={pluginId}>
        <Empty>
          <EmptyMedia variant="icon">
            <PuzzleIcon />
          </EmptyMedia>
          <EmptyHeader>
            <EmptyTitle>
              <T>Plugin not found</T>
            </EmptyTitle>
            <EmptyDescription>
              <T>This KBCode build does not include that plugin.</T>
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </PluginShell>
    );
  }
  return (
    <PluginShell pluginName={m(plugin.name)}>
      <Suspense
        fallback={
          <div className="flex justify-center p-8">
            <Spinner />
          </div>
        }
      >
        <plugin.Page />
      </Suspense>
    </PluginShell>
  );
}
