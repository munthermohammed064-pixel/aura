import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const source = readFileSync(new URL("../src/lib/api.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function client(fetch) {
  const storage = new Map([["access_token", "user-one"]]);
  const context = {
    exports: {}, process: { env: {} }, fetch, FormData, Event,
    localStorage: {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value),
      removeItem: (key) => storage.delete(key),
    },
    window: { location: { pathname: "/dashboard" }, dispatchEvent() {} },
  };
  vm.runInNewContext(compiled, context);
  return { ...context.exports, storage };
}

test("concurrent account reads share one request, later reads fetch fresh balances", async () => {
  let calls = 0;
  const { api } = client(async () => {
    calls++;
    await new Promise((resolve) => setTimeout(resolve, 5));
    return Response.json({ available: calls });
  });
  const results = await Promise.all([api("/wallet"), api("/wallet"), api("/wallet")]);
  assert.equal(calls, 1);
  assert.ok(results.every((value) => value.available === 1));
  assert.equal((await api("/wallet")).available, 2);
});

test("different accounts and independent cancellations never share a request", async () => {
  let calls = 0;
  const { api, storage } = client(async () => { calls++; return Response.json({ ok: true }); });
  const first = api("/auth/me");
  storage.set("access_token", "user-two");
  const second = api("/auth/me");
  await Promise.all([first, second]);
  assert.equal(calls, 2);
  await Promise.all([
    api("/wallet", { signal: new AbortController().signal }),
    api("/wallet", { signal: new AbortController().signal }),
  ]);
  assert.equal(calls, 4);
});

test("financial mutations are not deduplicated and failed reads can be retried", async () => {
  let calls = 0;
  const { api } = client(async () => {
    calls++;
    return calls === 3 ? Response.json({ detail: "temporarily unavailable" }, { status: 503 })
      : Response.json({ ok: true });
  });
  await Promise.all([
    api("/withdrawals", { method: "POST", body: "{}" }),
    api("/withdrawals", { method: "POST", body: "{}" }),
  ]);
  assert.equal(calls, 2);
  await assert.rejects(api("/wallet"), /temporarily unavailable/);
  assert.equal((await api("/wallet")).ok, true);
  assert.equal(calls, 4);
});

test("simultaneous expired reads refresh once and safely retry each endpoint", async () => {
  let refreshes = 0;
  const { api, storage } = client(async (url, opts) => {
    if (url.endsWith("/auth/refresh")) {
      refreshes++;
      await new Promise((resolve) => setTimeout(resolve, 5));
      return Response.json({ access_token: "new-token", refresh_token: "new-refresh" });
    }
    return opts.headers.Authorization === "Bearer new-token"
      ? Response.json({ ok: true }) : Response.json({}, { status: 401 });
  });
  storage.set("refresh_token", "old-refresh");
  const results = await Promise.all([api("/wallet"), api("/auth/me"), api("/wallet")]);
  assert.equal(refreshes, 1);
  assert.ok(results.every((value) => value.ok));
});
