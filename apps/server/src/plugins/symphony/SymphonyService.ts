import {
  SymphonyPluginError,
  type SymphonyIssueDetail,
  type SymphonyIssueInput,
  type SymphonyRefreshResult,
  type SymphonyStateResult,
} from "@t3tools/contracts";
import * as Config from "effect/Config";
import * as Context from "effect/Context";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as HttpClient from "effect/http/HttpClient";
import * as HttpClientRequest from "effect/http/HttpClientRequest";

const REQUEST_TIMEOUT = Duration.seconds(5);

type Operation = SymphonyPluginError["operation"];

const Str = Schema.optional(Schema.NullOr(Schema.String));
const Num = Schema.optional(Schema.NullOr(Schema.Number));

const UpstreamTokens = Schema.optional(
  Schema.NullOr(
    Schema.Struct({
      input_tokens: Num,
      output_tokens: Num,
      total_tokens: Num,
      seconds_running: Num,
    }),
  ),
);

const UpstreamEntry = Schema.Struct({
  issue_id: Str,
  issue_identifier: Schema.String,
  issue_url: Str,
  worker_host: Str,
  workspace_path: Str,
  state: Str,
  session_id: Str,
  turn_count: Num,
  last_event: Str,
  last_message: Str,
  started_at: Str,
  last_event_at: Str,
  attempt: Num,
  due_at: Str,
  error: Str,
  blocked_at: Str,
  tokens: UpstreamTokens,
});
type UpstreamEntry = typeof UpstreamEntry.Type;

const UpstreamError = Schema.Struct({
  error: Schema.Struct({ code: Str, message: Str }),
});

const UpstreamState = Schema.Struct({
  generated_at: Str,
  running: Schema.optional(Schema.Array(UpstreamEntry)),
  retrying: Schema.optional(Schema.Array(UpstreamEntry)),
  blocked: Schema.optional(Schema.Array(UpstreamEntry)),
  codex_totals: UpstreamTokens,
});

const UpstreamIssue = Schema.Struct({
  issue_identifier: Schema.String,
  issue_id: Str,
  status: Str,
  workspace: Schema.optional(Schema.NullOr(Schema.Struct({ path: Str, host: Str }))),
  attempts: Schema.optional(
    Schema.NullOr(Schema.Struct({ restart_count: Num, current_retry_attempt: Num })),
  ),
  recent_events: Schema.optional(
    Schema.NullOr(Schema.Array(Schema.Struct({ at: Str, event: Str, message: Str }))),
  ),
  last_error: Schema.optional(Schema.Unknown),
});

const UpstreamRefresh = Schema.Struct({
  requested_at: Str,
  coalesced: Schema.optional(Schema.NullOr(Schema.Boolean)),
});

const decodeUpstreamError = Schema.decodeUnknownOption(UpstreamError);
const decodeUpstreamState = Schema.decodeUnknownEffect(UpstreamState);
const decodeUpstreamIssue = Schema.decodeUnknownEffect(UpstreamIssue);
const decodeUpstreamRefresh = Schema.decodeUnknownEffect(UpstreamRefresh);

const n = <A>(value: A | null | undefined): A | null => value ?? null;

function errorText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return value;
  if (typeof value === "object" && "message" in value && typeof value.message === "string") {
    return value.message;
  }
  return JSON.stringify(value);
}

function tokens(entry: UpstreamEntry) {
  return {
    inputTokens: n(entry.tokens?.input_tokens),
    outputTokens: n(entry.tokens?.output_tokens),
    totalTokens: n(entry.tokens?.total_tokens),
  };
}

function issueRef(entry: UpstreamEntry) {
  return {
    issueId: n(entry.issue_id),
    issueIdentifier: entry.issue_identifier,
    issueUrl: n(entry.issue_url),
    workerHost: n(entry.worker_host),
    workspacePath: n(entry.workspace_path),
  };
}

function toSnapshot(raw: typeof UpstreamState.Type) {
  return {
    generatedAt: n(raw.generated_at),
    running: (raw.running ?? []).map((entry) => ({
      ...issueRef(entry),
      state: n(entry.state),
      sessionId: n(entry.session_id),
      turnCount: n(entry.turn_count),
      lastEvent: n(entry.last_event),
      lastMessage: n(entry.last_message),
      startedAt: n(entry.started_at),
      lastEventAt: n(entry.last_event_at),
      tokens: tokens(entry),
    })),
    retrying: (raw.retrying ?? []).map((entry) => ({
      ...issueRef(entry),
      attempt: n(entry.attempt),
      dueAt: n(entry.due_at),
      error: n(entry.error),
    })),
    blocked: (raw.blocked ?? []).map((entry) => ({
      ...issueRef(entry),
      state: n(entry.state),
      error: n(entry.error),
      sessionId: n(entry.session_id),
      blockedAt: n(entry.blocked_at),
      lastEvent: n(entry.last_event),
      lastMessage: n(entry.last_message),
      lastEventAt: n(entry.last_event_at),
    })),
    totals: {
      inputTokens: n(raw.codex_totals?.input_tokens),
      outputTokens: n(raw.codex_totals?.output_tokens),
      totalTokens: n(raw.codex_totals?.total_tokens),
      secondsRunning: n(raw.codex_totals?.seconds_running),
    },
  };
}

/** Accepts an http(s) origin with an optional path prefix; drops trailing slashes. */
function parseSymphonyBaseUrl(raw: string | undefined): string | null {
  const trimmed = raw?.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return `${url.origin}${url.pathname.replace(/\/+$/u, "")}`;
  } catch {
    return null;
  }
}

export class SymphonyService extends Context.Service<
  SymphonyService,
  {
    readonly getState: () => Effect.Effect<SymphonyStateResult, SymphonyPluginError>;
    readonly getIssue: (
      input: SymphonyIssueInput,
    ) => Effect.Effect<SymphonyIssueDetail, SymphonyPluginError>;
    readonly refresh: () => Effect.Effect<SymphonyRefreshResult, SymphonyPluginError>;
  }
>()("t3/plugins/symphony/SymphonyService") {}

const fail = (operation: Operation, category: SymphonyPluginError["category"], reason: string) =>
  new SymphonyPluginError({ operation, category, reason });

const make = Effect.gen(function* () {
  const httpClient = yield* HttpClient.HttpClient;
  const rawUrl = yield* Config.option(Config.String("SYMPHONY_URL")).pipe(
    Effect.orElseSucceed(() => Option.none<string>()),
  );
  const baseUrl = parseSymphonyBaseUrl(Option.getOrUndefined(rawUrl));
  if (Option.isSome(rawUrl) && rawUrl.value.trim().length > 0 && baseUrl === null) {
    yield* Effect.logWarning("Ignoring invalid SYMPHONY_URL; expected an http(s) URL.");
  }

  const call = Effect.fn("SymphonyService.call")(function* <A, E>(
    operation: Operation,
    request: (base: string) => HttpClientRequest.HttpClientRequest,
    decode: (body: unknown) => Effect.Effect<A, E>,
  ) {
    if (baseUrl === null) {
      return yield* fail(operation, "unconfigured", "Set SYMPHONY_URL on this server.");
    }
    const { status, body } = yield* httpClient.execute(request(baseUrl)).pipe(
      Effect.mapError(() =>
        fail(operation, "unreachable", `Could not reach Symphony at ${baseUrl}.`),
      ),
      Effect.flatMap((response) =>
        response.json.pipe(
          Effect.map((json): { status: number; body: unknown } => ({
            status: response.status,
            body: json,
          })),
          Effect.mapError(() =>
            response.status === 404
              ? fail(operation, "not_found", "Symphony has no such route or issue.")
              : fail(operation, "upstream", `Symphony answered ${response.status} without JSON.`),
          ),
        ),
      ),
      Effect.timeoutOrElse({
        duration: REQUEST_TIMEOUT,
        orElse: () =>
          Effect.fail(fail(operation, "unreachable", `Symphony at ${baseUrl} timed out.`)),
      }),
    );
    if (status >= 400 || (typeof body === "object" && body !== null && "error" in body)) {
      const upstream = decodeUpstreamError(body);
      const message = Option.match(upstream, {
        onNone: () => `Symphony answered ${status}.`,
        onSome: (value) =>
          value.error.message ?? value.error.code ?? `Symphony answered ${status}.`,
      });
      return yield* fail(operation, status === 404 ? "not_found" : "upstream", message);
    }
    return yield* decode(body).pipe(
      Effect.mapError(() =>
        fail(operation, "upstream", "Symphony sent a response this version cannot read."),
      ),
    );
  });

  return SymphonyService.of({
    getState: Effect.fn("SymphonyService.getState")(function* () {
      if (baseUrl === null) return { baseUrl: null, snapshot: null };
      const raw = yield* call(
        "state",
        (base) => HttpClientRequest.get(`${base}/api/v1/state`),
        decodeUpstreamState,
      );
      return { baseUrl, snapshot: toSnapshot(raw) };
    }),
    getIssue: Effect.fn("SymphonyService.getIssue")(function* (input) {
      const raw = yield* call(
        "issue",
        (base) =>
          HttpClientRequest.get(`${base}/api/v1/${encodeURIComponent(input.issueIdentifier)}`),
        decodeUpstreamIssue,
      );
      return {
        issueIdentifier: raw.issue_identifier,
        issueId: n(raw.issue_id),
        status: n(raw.status),
        workspacePath: n(raw.workspace?.path),
        workspaceHost: n(raw.workspace?.host),
        restartCount: n(raw.attempts?.restart_count),
        currentRetryAttempt: n(raw.attempts?.current_retry_attempt),
        lastError: errorText(raw.last_error),
        recentEvents: (raw.recent_events ?? []).map((event) => ({
          at: n(event.at),
          event: n(event.event),
          message: n(event.message),
        })),
      };
    }),
    refresh: Effect.fn("SymphonyService.refresh")(function* () {
      const raw = yield* call(
        "refresh",
        (base) => HttpClientRequest.post(`${base}/api/v1/refresh`),
        decodeUpstreamRefresh,
      );
      return { requestedAt: n(raw.requested_at), coalesced: n(raw.coalesced) };
    }),
  });
});

export const layer = Layer.effect(SymphonyService, make);
