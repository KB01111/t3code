import * as Schema from "effect/Schema";

import { TrimmedNonEmptyString } from "./baseSchemas.ts";

// Mirrors the observability API of OpenAI Symphony (SPEC.md §13.7), renamed to camelCase.
// Every upstream field is nullable: the spec marks these shapes as suggestions.

const NullableString = Schema.NullOr(Schema.String);
const NullableNumber = Schema.NullOr(Schema.Number);

export const SymphonyTokenCounts = Schema.Struct({
  inputTokens: NullableNumber,
  outputTokens: NullableNumber,
  totalTokens: NullableNumber,
});
export type SymphonyTokenCounts = typeof SymphonyTokenCounts.Type;

const SymphonyIssueRef = {
  issueId: NullableString,
  issueIdentifier: Schema.String,
  issueUrl: NullableString,
  workerHost: NullableString,
  workspacePath: NullableString,
};

export const SymphonyRunningEntry = Schema.Struct({
  ...SymphonyIssueRef,
  state: NullableString,
  sessionId: NullableString,
  turnCount: NullableNumber,
  lastEvent: NullableString,
  lastMessage: NullableString,
  startedAt: NullableString,
  lastEventAt: NullableString,
  tokens: SymphonyTokenCounts,
});
export type SymphonyRunningEntry = typeof SymphonyRunningEntry.Type;

export const SymphonyRetryingEntry = Schema.Struct({
  ...SymphonyIssueRef,
  attempt: NullableNumber,
  dueAt: NullableString,
  error: NullableString,
});
export type SymphonyRetryingEntry = typeof SymphonyRetryingEntry.Type;

export const SymphonyBlockedEntry = Schema.Struct({
  ...SymphonyIssueRef,
  state: NullableString,
  error: NullableString,
  sessionId: NullableString,
  blockedAt: NullableString,
  lastEvent: NullableString,
  lastMessage: NullableString,
  lastEventAt: NullableString,
});
export type SymphonyBlockedEntry = typeof SymphonyBlockedEntry.Type;

export const SymphonySnapshot = Schema.Struct({
  generatedAt: NullableString,
  running: Schema.Array(SymphonyRunningEntry),
  retrying: Schema.Array(SymphonyRetryingEntry),
  blocked: Schema.Array(SymphonyBlockedEntry),
  totals: Schema.Struct({
    ...SymphonyTokenCounts.fields,
    secondsRunning: NullableNumber,
  }),
});
export type SymphonySnapshot = typeof SymphonySnapshot.Type;

/** `baseUrl` is null when this environment has no Symphony service configured. */
export const SymphonyStateResult = Schema.Struct({
  baseUrl: NullableString,
  snapshot: Schema.NullOr(SymphonySnapshot),
});
export type SymphonyStateResult = typeof SymphonyStateResult.Type;

// One path segment that cannot alias Symphony's own `state` and `refresh` routes or `..`.
export const SymphonyIssueInput = Schema.Struct({
  issueIdentifier: TrimmedNonEmptyString.check(
    Schema.isMaxLength(128),
    Schema.isPattern(/^(?!(?:state|refresh)$)[A-Za-z0-9][A-Za-z0-9_.-]*$/u),
  ),
});
export type SymphonyIssueInput = typeof SymphonyIssueInput.Type;

export const SymphonyIssueEvent = Schema.Struct({
  at: NullableString,
  event: NullableString,
  message: NullableString,
});

export const SymphonyIssueDetail = Schema.Struct({
  issueIdentifier: Schema.String,
  issueId: NullableString,
  status: NullableString,
  workspacePath: NullableString,
  workspaceHost: NullableString,
  restartCount: NullableNumber,
  currentRetryAttempt: NullableNumber,
  lastError: NullableString,
  recentEvents: Schema.Array(SymphonyIssueEvent),
});
export type SymphonyIssueDetail = typeof SymphonyIssueDetail.Type;

export const SymphonyRefreshResult = Schema.Struct({
  requestedAt: NullableString,
  coalesced: Schema.NullOr(Schema.Boolean),
});
export type SymphonyRefreshResult = typeof SymphonyRefreshResult.Type;

export class SymphonyPluginError extends Schema.TaggedError<SymphonyPluginError>()(
  "SymphonyPluginError",
  {
    operation: Schema.Literals(["state", "issue", "refresh"]),
    category: Schema.Literals(["unconfigured", "unreachable", "not_found", "upstream"]),
    reason: Schema.String,
  },
) {
  override get message(): string {
    return this.reason;
  }
}
