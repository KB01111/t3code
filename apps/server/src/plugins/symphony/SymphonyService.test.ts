import { assert, describe, it } from "@effect/vitest";
import * as ConfigProvider from "effect/ConfigProvider";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Layer from "effect/Layer";
import * as HttpClient from "effect/http/HttpClient";
import * as HttpClientResponse from "effect/http/HttpClientResponse";

import * as SymphonyService from "./SymphonyService.ts";

type Route = { readonly status: number; readonly body: unknown };

function serviceLayer(env: Record<string, string>, routes: Record<string, Route>) {
  const requests: Array<string> = [];
  const httpClient = Layer.succeed(
    HttpClient.HttpClient,
    HttpClient.make((request) =>
      Effect.sync(() => {
        const key = `${request.method} ${request.url}`;
        requests.push(key);
        const route = routes[key] ?? { status: 404, body: { error: { code: "not_found" } } };
        return HttpClientResponse.fromWeb(
          request,
          new Response(typeof route.body === "string" ? route.body : JSON.stringify(route.body), {
            status: route.status,
            headers: { "content-type": "application/json" },
          }),
        );
      }),
    ),
  );
  const layer = SymphonyService.layer.pipe(
    Layer.provide(httpClient),
    Layer.provide(ConfigProvider.layer(ConfigProvider.fromEnv({ env }))),
  );
  return { layer, requests };
}

const BASE = "http://127.0.0.1:4100";

describe("SymphonyService", () => {
  it.effect("reports an unconfigured environment without calling out", () => {
    const { layer, requests } = serviceLayer({}, {});
    return Effect.gen(function* () {
      const symphony = yield* SymphonyService.SymphonyService;
      assert.deepStrictEqual(yield* symphony.getState(), { baseUrl: null, snapshot: null });
      const refresh = yield* Effect.exit(symphony.refresh());
      assert.isTrue(Exit.isFailure(refresh));
      assert.deepStrictEqual(requests, []);
    }).pipe(Effect.provide(layer));
  });

  it.effect("translates the state snapshot and tolerates missing fields", () => {
    const { layer, requests } = serviceLayer(
      { SYMPHONY_URL: `${BASE}/` },
      {
        [`GET ${BASE}/api/v1/state`]: {
          status: 200,
          body: {
            generated_at: "2026-11-22T12:00:00Z",
            counts: { running: 1, retrying: 1, blocked: 0 },
            running: [
              {
                issue_identifier: "KB-12",
                issue_url: "https://linear.app/kb/issue/KB-12",
                state: "In Progress",
                turn_count: 3,
                last_event: "turn_completed",
                tokens: { input_tokens: 100, output_tokens: 40, total_tokens: 140 },
              },
            ],
            retrying: [{ issue_identifier: "KB-9", attempt: 2, error: "no available slots" }],
            codex_totals: { total_tokens: 140, seconds_running: 12.5 },
            rate_limits: null,
          },
        },
      },
    );
    return Effect.gen(function* () {
      const symphony = yield* SymphonyService.SymphonyService;
      const state = yield* symphony.getState();
      assert.strictEqual(state.baseUrl, BASE);
      assert.deepStrictEqual(requests, [`GET ${BASE}/api/v1/state`]);
      const snapshot = state.snapshot!;
      assert.strictEqual(snapshot.running[0]!.issueIdentifier, "KB-12");
      assert.strictEqual(snapshot.running[0]!.turnCount, 3);
      assert.strictEqual(snapshot.running[0]!.sessionId, null);
      assert.deepStrictEqual(snapshot.running[0]!.tokens, {
        inputTokens: 100,
        outputTokens: 40,
        totalTokens: 140,
      });
      assert.strictEqual(snapshot.retrying[0]!.attempt, 2);
      assert.deepStrictEqual(snapshot.blocked, []);
      assert.strictEqual(snapshot.totals.secondsRunning, 12.5);
      assert.strictEqual(snapshot.totals.inputTokens, null);
    }).pipe(Effect.provide(layer));
  });

  it.effect("surfaces Symphony's error envelope and 404s", () => {
    const { layer } = serviceLayer(
      { SYMPHONY_URL: BASE },
      {
        [`GET ${BASE}/api/v1/state`]: {
          status: 200,
          body: {
            generated_at: "2026-11-22T12:00:00Z",
            error: { code: "snapshot_timeout", message: "Snapshot timed out" },
          },
        },
        [`GET ${BASE}/api/v1/KB-HTML`]: { status: 404, body: "<html>Not Found</html>" },
        [`GET ${BASE}/api/v1/KB-404`]: {
          status: 404,
          body: { error: { code: "issue_not_found", message: "Issue not found" } },
        },
      },
    );
    return Effect.gen(function* () {
      const symphony = yield* SymphonyService.SymphonyService;
      const state = yield* Effect.flip(symphony.getState());
      assert.strictEqual(state.category, "upstream");
      assert.strictEqual(state.reason, "Snapshot timed out");
      const issue = yield* Effect.flip(symphony.getIssue({ issueIdentifier: "KB-404" }));
      assert.strictEqual(issue.category, "not_found");
      const proxied = yield* Effect.flip(symphony.getIssue({ issueIdentifier: "KB-HTML" }));
      assert.strictEqual(proxied.category, "not_found");
    }).pipe(Effect.provide(layer));
  });

  it.effect("reads issue detail and posts refresh", () => {
    const { layer, requests } = serviceLayer(
      { SYMPHONY_URL: BASE },
      {
        [`GET ${BASE}/api/v1/KB-12`]: {
          status: 200,
          body: {
            issue_identifier: "KB-12",
            status: "running",
            workspace: { path: "/tmp/symphony/KB-12", host: null },
            attempts: { restart_count: 1, current_retry_attempt: 0 },
            recent_events: [{ at: "2026-11-22T12:00:00Z", event: "notification", message: "ok" }],
            last_error: null,
          },
        },
        [`POST ${BASE}/api/v1/refresh`]: {
          status: 202,
          body: { queued: true, coalesced: false, requested_at: "2026-11-22T12:00:01Z" },
        },
      },
    );
    return Effect.gen(function* () {
      const symphony = yield* SymphonyService.SymphonyService;
      const issue = yield* symphony.getIssue({ issueIdentifier: "KB-12" });
      assert.strictEqual(issue.workspacePath, "/tmp/symphony/KB-12");
      assert.strictEqual(issue.restartCount, 1);
      assert.strictEqual(issue.recentEvents.length, 1);
      assert.deepStrictEqual(yield* symphony.refresh(), {
        requestedAt: "2026-11-22T12:00:01Z",
        coalesced: false,
      });
      assert.deepStrictEqual(requests, [`GET ${BASE}/api/v1/KB-12`, `POST ${BASE}/api/v1/refresh`]);
    }).pipe(Effect.provide(layer));
  });
});
