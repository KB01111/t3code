import { useAtomValue } from "@effect/atom-react";
import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import type { EnvironmentId, SymphonySnapshot } from "@t3tools/contracts";
import { useGT, useLocale } from "gt-react-native";
import { useState } from "react";
import { View } from "react-native";

import { AppText as Text } from "../../components/ui/AppText";
import { Button } from "../../components/ui/Button";
import { EmptyState } from "../../components/ui/EmptyState";
import { ListRow } from "../../components/ui/ListRow";
import { Notice } from "../../components/ui/Notice";
import { useEnvironmentQuery } from "../../state/query";
import { symphonyEnvironment } from "../../state/symphony";
import { useAtomCommand } from "../../state/use-atom-command";
import { SettingsSection } from "../settings/components/SettingsSection";
import { useSettingsEnvironmentFilter } from "../settings/settings-environment-filter";

function useFormatters() {
  const locale = useLocale();
  const number = new Intl.NumberFormat(locale);
  const time = new Intl.DateTimeFormat(locale, { timeStyle: "short" });
  return {
    count: (value: number | null) => (value === null ? "–" : number.format(value)),
    time: (value: string | null) => {
      const parsed = value === null ? Number.NaN : Date.parse(value);
      return Number.isNaN(parsed) ? "–" : time.format(parsed);
    },
  };
}

function IssueDetail(props: {
  readonly environmentId: EnvironmentId;
  readonly issueIdentifier: string;
}) {
  const gt = useGT();
  const format = useFormatters();
  const query = useEnvironmentQuery(
    symphonyEnvironment.issue({
      environmentId: props.environmentId,
      input: { issueIdentifier: props.issueIdentifier },
    }),
  );
  const issue = query.data;
  if (issue === null) {
    return query.error ? <Notice tone="danger" message={query.error} /> : null;
  }
  return (
    <View className="gap-1 px-2">
      <Text className="text-sm text-foreground-muted">
        {gt("Workspace: {path}", { path: issue.workspacePath ?? "–" })}
      </Text>
      <Text className="text-sm text-foreground-muted">
        {gt("Restarts: {restarts} · Retry attempt: {attempt}", {
          restarts: format.count(issue.restartCount),
          attempt: format.count(issue.currentRetryAttempt),
        })}
      </Text>
      {issue.lastError ? <Text className="text-sm text-danger">{issue.lastError}</Text> : null}
      {issue.recentEvents.map((event) => (
        <Text
          key={`${event.at ?? ""}:${event.event ?? ""}:${event.message ?? ""}`}
          className="text-sm text-foreground-muted"
        >
          {`${format.time(event.at)} ${event.event ?? ""} ${event.message ?? ""}`}
        </Text>
      ))}
    </View>
  );
}

function SnapshotSections(props: {
  readonly environmentId: EnvironmentId;
  readonly snapshot: SymphonySnapshot;
}) {
  const gt = useGT();
  const format = useFormatters();
  const [picked, setPicked] = useState<string | null>(null);
  const { running, retrying, blocked } = props.snapshot;
  // A finished issue leaves the snapshot; stop showing (and polling) its detail.
  const selected =
    picked !== null &&
    [...running, ...retrying, ...blocked].some((entry) => entry.issueIdentifier === picked)
      ? picked
      : null;
  const toggle = (identifier: string) => setPicked(selected === identifier ? null : identifier);

  const rows = [
    ...running.map((entry) => ({
      id: entry.issueIdentifier,
      section: "running" as const,
      label: entry.issueIdentifier,
      description: entry.lastMessage ?? entry.lastEvent ?? gt("Starting…"),
      detail: gt("{turns} turns · {tokens} tokens", {
        turns: format.count(entry.turnCount),
        tokens: format.count(entry.tokens.totalTokens),
      }),
    })),
    ...retrying.map((entry) => ({
      id: entry.issueIdentifier,
      section: "retrying" as const,
      label: entry.issueIdentifier,
      description: entry.error ?? undefined,
      detail: gt("Attempt {attempt} · retries at {time}", {
        attempt: format.count(entry.attempt),
        time: format.time(entry.dueAt),
      }),
    })),
    ...blocked.map((entry) => ({
      id: entry.issueIdentifier,
      section: "blocked" as const,
      label: entry.issueIdentifier,
      description: entry.error ?? undefined,
      detail: entry.state ?? undefined,
    })),
  ];
  const titles = {
    running: gt("Running ({count})", { count: running.length }),
    retrying: gt("Retrying ({count})", { count: retrying.length }),
    blocked: gt("Blocked ({count})", { count: blocked.length }),
  };

  return (
    <>
      <Text className="px-2 text-sm text-foreground-muted">
        {gt("Total tokens: {tokens} · updated {time}", {
          tokens: format.count(props.snapshot.totals.totalTokens),
          time: format.time(props.snapshot.generatedAt),
        })}
      </Text>
      {(["running", "retrying", "blocked"] as const).map((section) => {
        const sectionRows = rows.filter((row) => row.section === section);
        return (
          <SettingsSection key={section} title={titles[section]}>
            {sectionRows.map((row) => (
              <View key={row.id}>
                <ListRow
                  label={row.label}
                  description={row.description}
                  detail={row.detail}
                  onPress={() => toggle(row.id)}
                />
                {selected === row.id ? (
                  <View className="bg-grouped-card pb-3">
                    <IssueDetail environmentId={props.environmentId} issueIdentifier={row.id} />
                  </View>
                ) : null}
              </View>
            ))}
          </SettingsSection>
        );
      })}
    </>
  );
}

function SymphonyEnvironmentSection(props: {
  readonly environmentId: EnvironmentId;
  readonly environmentLabel: string;
  readonly showLabel: boolean;
}) {
  const gt = useGT();
  const query = useEnvironmentQuery(
    symphonyEnvironment.state({ environmentId: props.environmentId, input: {} }),
  );
  const canRefresh = useAtomValue(symphonyEnvironment.refresh.permissionAtom(props.environmentId));
  const runRefresh = useAtomCommand(symphonyEnvironment.refresh, { reportFailure: false });
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);

  const handleRefresh = async () => {
    setRefreshing(true);
    setRefreshError(null);
    const result = await runRefresh({ environmentId: props.environmentId, input: {} });
    setRefreshing(false);
    if (result._tag === "Failure") {
      if (isAtomCommandInterrupted(result)) return;
      const error = squashAtomCommandFailure(result);
      setRefreshError(
        error instanceof Error ? error.message : gt("Could not ask Symphony to refresh"),
      );
      return;
    }
    query.refresh();
  };

  const state = query.data;
  return (
    <View className="gap-3">
      {props.showLabel ? (
        <Text className="px-2 font-t3-bold text-foreground">{props.environmentLabel}</Text>
      ) : null}
      {state === null ? (
        query.error ? (
          <Notice tone="danger" message={query.error} />
        ) : null
      ) : state.baseUrl === null ? (
        <EmptyState
          variant="plain"
          title={gt("Connect Symphony")}
          detail={gt(
            "Start Symphony with its HTTP server enabled (--port or server.port in WORKFLOW.md), then set SYMPHONY_URL on this KBCode server, for example http://127.0.0.1:4000, and restart it.",
          )}
        />
      ) : (
        <>
          <Button
            label={gt("Poll tracker now")}
            icon="arrow.clockwise"
            size="compact"
            disabled={!canRefresh}
            loading={refreshing}
            onPress={() => void handleRefresh()}
          />
          {refreshError ? <Notice tone="danger" message={refreshError} /> : null}
          {query.error ? <Notice tone="danger" message={query.error} /> : null}
          {state.snapshot === null ? null : (
            <SnapshotSections environmentId={props.environmentId} snapshot={state.snapshot} />
          )}
        </>
      )}
    </View>
  );
}

export function SymphonyPluginScreen() {
  const gt = useGT();
  const { selectedTargets } = useSettingsEnvironmentFilter();
  const supported = selectedTargets.filter(
    (target) => target.serverConfig.environment.capabilities.symphonyPlugin === true,
  );
  if (supported.length === 0) {
    return (
      <EmptyState
        variant="plain"
        title={gt("Symphony unavailable")}
        detail={
          selectedTargets.length === 0
            ? gt("Connect an environment to use the Symphony plugin.")
            : gt("Update this environment's KBCode server to use the Symphony plugin.")
        }
      />
    );
  }
  return (
    <View className="gap-6">
      {supported.map((target) => (
        <SymphonyEnvironmentSection
          key={target.environmentId}
          environmentId={target.environmentId}
          environmentLabel={target.label}
          showLabel={supported.length > 1}
        />
      ))}
    </View>
  );
}
