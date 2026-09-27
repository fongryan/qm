import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer, type IncomingMessage } from "node:http";
import type { AddressInfo } from "node:net";
import { mintPortalIdentity, PORTAL_IDENTITY_HEADER } from "../../chassis/src/portal-identity.ts";

const calls: Array<{ url: string; identity: string | undefined }> = [];
const core = createServer((req: IncomingMessage, res) => {
  const url = req.url ?? "";
  calls.push({ url, identity: req.headers[PORTAL_IDENTITY_HEADER] as string | undefined });
  res.setHeader("content-type", "application/json");
  if (url.startsWith("/v1/sessions/hidden")) {
    res.statusCode = 404;
    res.end(JSON.stringify({ error: "not_found" }));
  } else if (url.startsWith("/v1/sessions/") && url.includes("/swarm")) {
    res.end(JSON.stringify(url.includes("read=1") ? { messages: [] } : { id: "root", peers: [] }));
  } else if (url.startsWith("/v1/sessions/")) {
    res.end(JSON.stringify({ session: { id: "visible" } }));
  } else {
    res.statusCode = 404;
    res.end(JSON.stringify({ error: "not_found" }));
  }
});
await new Promise<void>((resolve) => core.listen(0, resolve));

process.env.CORE_API_URL = `http://localhost:${(core.address() as AddressInfo).port}`;
process.env.CORE_SIGNING_SECRET = "swarm-view-route-test";
process.env.WEB_UI_PRINCIPALS = "alice";
const { handler } = await import("../server/index.ts");
const surface = createServer((req, res) => void handler(req, res));
await new Promise<void>((resolve) => surface.listen(0, resolve));
const base = `http://localhost:${(surface.address() as AddressInfo).port}`;
const token = mintPortalIdentity({ p: "alice", exp: Date.now() + 60_000 }, "swarm-view-route-test");
const headers = { [PORTAL_IDENTITY_HEADER]: token };
test.after(() => { surface.close(); core.close(); });

test("visible session swarm request forwards identity to core", async () => {
  const before = calls.length;
  const result = await fetch(`${base}/api/sessions/visible/swarm?read=1&after=3`, { headers });
  assert.equal(result.status, 200);
  assert.deepEqual(await result.json(), { messages: [] });
  const got = calls.slice(before).filter((c) => c.url.startsWith("/v1/sessions/"));
  assert.equal(got.length, 2);
  assert.ok(got[0]?.url.startsWith("/v1/sessions/visible?viewer=alice&tailTurns=1"));
  assert.ok(got[1]?.url.startsWith("/v1/sessions/visible/swarm?read=1&after=3"));
  assert.deepEqual(got.map((c) => c.identity), [token, token]);
});

test("hidden session and malformed cursor never reach swarm core", async () => {
  const before = calls.length;
  assert.equal((await fetch(`${base}/api/sessions/hidden/swarm`, { headers })).status, 404);
  assert.equal(calls.slice(before).filter((c) => c.url.includes("/swarm")).length, 0);
  const after = calls.length;
  assert.equal((await fetch(`${base}/api/sessions/visible/swarm?read=1&after=-1`, { headers })).status, 400);
  assert.equal(calls.length, after);
});

test("no portal identity cannot inspect through a cookie", async () => {
  const before = calls.length;
  const result = await fetch(`${base}/api/sessions/visible/swarm`, { headers: { cookie: "webuiuser=alice" } });
  assert.equal(result.status, 401);
  assert.equal(calls.length, before);
});
