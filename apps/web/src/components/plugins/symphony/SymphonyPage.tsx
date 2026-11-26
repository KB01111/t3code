import { useAtomValue } from "@effect/atom-react";
import {
  squashAtomCommandFailure,
  isAtomCommandInterrupted,
} from "@t3tools/client-runtime/state/runtime";
import type {
  EnvironmentId,
  SymphonyBlockedEntry,
  SymphonyRetryingEntry,
  SymphonyRunningEntry,
  SymphonySnapshot,
} from "@t3tools/contracts";
import { T, useGT, useLocale, useMessages } from "gt-react";
import { ExternalLinkIcon, RefreshCwIcon, WorkflowIcon } from "lucide-react";
import { useState, type ReactNode } from "react";

import { Alert, AlertDescription } from "~/components/ui/alert";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "~/components/ui/empty";
import { Spinner } from "~/components/ui/spinner";
import { toastManager } from "~/components/ui/toast";
import { usePrimaryEnvironment } from "~/state/environments";
import { useEnvironmentQuery } from "~/state/query";
import { symphonyEnvironment } from "~/state/symphony";
import { useAtomCommand } from "~/state/use-atom-command";

function useFormatters() {
  const locale = useLocale();
  const number = new Intl.NumberFormat(locale);
  const time = new Intl.DateTimeFormat(locale, { timeStyle: "medium" });
  return {
    count: (value: number | null) => (value === null ? "–" : number.format(value)),
    time: (value: string | null) => {
      const parsed = value === null ? Number.NaN : Date.parse(value);
      return Number.isNaN(parsed) ? "–" : time.format(parsed);
    },
  };
}

function IssueLink({
  identifier,
  url,
}: {
  readonly identifier: string;
  readonly url: string | null;
}) {
  if (url === null) return <span className="font-mono">{identifier}</span>;
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1 font-mono hover:underline"
      onClick={(event) => event.stopPropagation()}
    >
      {identifier}
      <ExternalLinkIcon aria-hidden className="size-3" />
    </a>
  );
}

function Section({
  title,
  count,
  children,
}: {
  readonly title: string;
  readonly count: number;
  readonly children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="flex items-center gap-2 text-sm font-medium">
        {title}
        <Badge variant="secondary">{count}</Badge>
      </h2>
      {count === 0 ? null : (
        <ul className="flex flex-col divide-y rounded-lg border">{children}</ul>
      )}
    </section>
  );
}

function Row({
  selected,
  onSelect,
  children,
}: {
  readonly selected: boolean;
  readonly onSelect: () => void;
  readonly children: ReactNode;
}) {
  return (
    <li
      aria-selected={selected}
      className="flex cursor-pointer flex-col gap-1 p-3 text-sm hover:bg-accent/50 aria-selected:bg-accent"
      onClick={onSelect}
    >
      {children}
    </li>
  );
}

function IssueDetail({
  environmentId,
  issueIdentifier,
}: {
  readonly environmentId: EnvironmentId;
  readonly issueIdentifier: string;
}) {
  const resolve = useMessages();
  const format = useFormatters();
  const query = useEnvironmentQuery(
    symphonyEnvironment.issue({ environmentId, input: { issueIdentifier } }),
    resolve,
  );
  const issue = query.data;
  return (
    <section className="flex flex-col gap-2 rounded-lg border p-4 text-sm">
      <h2 className="font-medium">
        <span className="font-mono">{issueIdentifier}</span>
        {issue?.status ? <span className="text-muted-foreground"> · {issue.status}</span> : null}
      </h2>
      {query.error && issue === null ? (
        <p className="text-destructive-foreground">{query.error}</p>
      ) : issue === null ? (
        <Spinner />
      ) : (
        <>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
            <dt className="text-muted-foreground">
              <T>Workspace</T>
            </dt>
            <dd className="truncate font-mono">
              {issue.workspacePath ?? "–"}
              {issue.workspaceHost ? ` @ ${issue.workspaceHost}` : ""}
            </dd>
            <dt className="text-muted-foreground">
              <T>Restarts</T>
            </dt>
            <dd>{format.count(issue.restartCount)}</dd>
            <dt className="text-muted-foreground">
              <T>Retry attempt</T>
            </dt>
            <dd>{format.count(issue.currentRetryAttempt)}</dd>
          </dl>
          {issue.lastError ? (
            <p className="text-destructive-foreground">{issue.lastError}</p>
          ) : null}
          {issue.recentEvents.length === 0 ? null : (
            <ul className="flex flex-col gap-1">
              {issue.recentEvents.map((event) => (
                <li
                  key={`${event.at ?? ""}:${event.event ?? ""}:${event.message ?? ""}`}
                  className="flex gap-2"
                >
                  <span className="shrink-0 text-muted-foreground tabular-nums">
                    {format.time(event.at)}
                  </span>
                  <span className="shrink-0 font-mono">{event.event ?? "–"}</span>
                  <span className="min-w-0 truncate">{event.message}</span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}

function SnapshotView({
  environmentId,
  snapshot,
}: {
  readonly environmentId: EnvironmentId;
  readonly snapshot: SymphonySnapshot;
}) {
  const gt = useGT();
  const format = useFormatters();
  const [picked, setPicked] = useState<string | null>(null);
  // A finished issue leaves the snapshot; stop showing (and polling) its detail.
  const selected =
    picked !== null &&
    [...snapshot.running, ...snapshot.retrying, ...snapshot.blocked].some(
      (entry) => entry.issueIdentifier === picked,
    )
      ? picked
      : null;
  const select = (identifier: string) => setPicked(selected === identifier ? null : identifier);

  const running = (entry: SymphonyRunningEntry) => (
    <Row
      key={entry.issueIdentifier}
      selected={selected === entry.issueIdentifier}
      onSelect={() => select(entry.issueIdentifier)}
    >
      <div className="flex items-center gap-2">
        <IssueLink identifier={entry.issueIdentifier} url={entry.issueUrl} />
        {entry.state ? <Badge variant="info">{entry.state}</Badge> : null}
        <span className="ml-auto text-xs text-muted-foreground tabular-nums">
          {gt("{turns} turns · {tokens} tokens", {
            turns: format.count(entry.turnCount),
            tokens: format.count(entry.tokens.totalTokens),
          })}
        </span>
      </div>
      <p className="truncate text-muted-foreground">
        {entry.lastMessage ?? entry.lastEvent ?? gt("Starting…")}
      </p>
    </Row>
  );

  const retrying = (entry: SymphonyRetryingEntry) => (
    <Row
      key={entry.issueIdentifier}
      selected={selected === entry.issueIdentifier}
      onSelect={() => select(entry.issueIdentifier)}
    >
      <div className="flex items-center gap-2">
        <IssueLink identifier={entry.issueIdentifier} url={entry.issueUrl} />
        <Badge variant="warning">
          {gt("Attempt {attempt}", { attempt: format.count(entry.attempt) })}
        </Badge>
        <span className="ml-auto text-xs text-muted-foreground tabular-nums">
          {gt("Retries at {time}", { time: format.time(entry.dueAt) })}
        </span>
      </div>
      {entry.error ? <p className="truncate text-muted-foreground">{entry.error}</p> : null}
    </Row>
  );

  const blocked = (entry: SymphonyBlockedEntry) => (
    <Row
      key={entry.issueIdentifier}
      selected={selected === entry.issueIdentifier}
      onSelect={() => select(entry.issueIdentifier)}
    >
      <div className="flex items-center gap-2">
        <IssueLink identifier={entry.issueIdentifier} url={entry.issueUrl} />
        <Badge variant="error">{entry.state ?? gt("Blocked")}</Badge>
        <span className="ml-auto text-xs text-muted-foreground tabular-nums">
          {format.time(entry.blockedAt)}
        </span>
      </div>
      {entry.error ? <p className="truncate text-muted-foreground">{entry.error}</p> : null}
    </Row>
  );

  return (
    <>
      <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-muted-foreground">
        <span>
          {gt("Total tokens: {tokens}", { tokens: format.count(snapshot.totals.totalTokens) })}
        </span>
        <span>{gt("Updated {time}", { time: format.time(snapshot.generatedAt) })}</span>
      </div>
      <Section title={gt("Running")} count={snapshot.running.length}>
        {snapshot.running.map(running)}
      </Section>
      <Section title={gt("Retrying")} count={snapshot.retrying.length}>
        {snapshot.retrying.map(retrying)}
      </Section>
      <Section title={gt("Blocked")} count={snapshot.blocked.length}>
        {snapshot.blocked.map(blocked)}
      </Section>
      {selected === null ? null : (
        <IssueDetail environmentId={environmentId} issueIdentifier={selected} />
      )}
    </>
  );
}

function SymphonyEnvironmentView({ environmentId }: { readonly environmentId: EnvironmentId }) {
  const gt = useGT();
  const resolve = useMessages();
  const query = useEnvironmentQuery(
    symphonyEnvironment.state({ environmentId, input: {} }),
    resolve,
  );
  const canRefresh = useAtomValue(symphonyEnvironment.refresh.permissionAtom(environmentId));
  const runRefresh = useAtomCommand(symphonyEnvironment.refresh, { reportFailure: false });
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = async () => {
    setRefreshing(true);
    const result = await runRefresh({ environmentId, input: {} });
    setRefreshing(false);
    if (result._tag === "Failure") {
      if (isAtomCommandInterrupted(result)) return;
      const error = squashAtomCommandFailure(result);
      toastManager.add({
        type: "error",
        title: gt("Could not ask Symphony to refresh"),
        description: error instanceof Error ? error.message : undefined,
      });
      return;
    }
    query.refresh();
  };

  const state = query.data;
  if (state === null) {
    return query.error ? (
      <Alert variant="error">
        <AlertDescription>{query.error}</AlertDescription>
      </Alert>
    ) : (
      <div className="flex justify-center p-8">
        <Spinner />
      </div>
    );
  }

  if (state.baseUrl === null) {
    return (
      <Empty>
        <EmptyMedia variant="icon">
          <WorkflowIcon />
        </EmptyMedia>
        <EmptyHeader>
          <EmptyTitle>
            <T>Connect Symphony</T>
          </EmptyTitle>
          <EmptyDescription>
            <T>
              Start Symphony with its HTTP server enabled (<code>--port</code> or{" "}
              <code>server.port</code> in <code>WORKFLOW.md</code>), then set{" "}
              <code>SYMPHONY_URL</code> on this KBCode server, for example{" "}
              <code>http://127.0.0.1:4000</code>, and restart it.
            </T>
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <>
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate font-mono text-xs text-muted-foreground">
          {state.baseUrl}
        </span>
        <Button
          variant="outline"
          size="compact"
          disabled={!canRefresh || refreshing}
          onClick={() => void handleRefresh()}
        >
          <RefreshCwIcon aria-hidden />
          <T>Poll tracker now</T>
        </Button>
      </div>
      {query.error ? (
        <Alert variant="error">
          <AlertDescription>{query.error}</AlertDescription>
        </Alert>
      ) : null}
      {state.snapshot === null ? null : (
        <SnapshotView environmentId={environmentId} snapshot={state.snapshot} />
      )}
    </>
  );
}

export function SymphonyPage() {
  const environment = usePrimaryEnvironment();
  const capabilities = environment?.serverConfig?.environment.capabilities;
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 p-4">
      {environment === null || capabilities === undefined ? (
        <Spinner />
      ) : capabilities.symphonyPlugin !== true ? (
        <Alert variant="warning">
          <AlertDescription>
            <T>Update this environment's KBCode server to use the Symphony plugin.</T>
          </AlertDescription>
        </Alert>
      ) : (
        <SymphonyEnvironmentView environmentId={environment.environmentId} />
      )}
    </div>
  );
}
