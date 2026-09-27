import assert from "node:assert/strict";
import { test } from "node:test";
import { mergeMessages, normalizeSwarm, type SwarmInspection, type SwarmMessageView } from "../src/swarm-events.ts";

const inspect: SwarmInspection = {
  id: "root", self: { id: "root", depth: 0, state: "ready" },
  peers: [{ id: "root", depth: 0, state: "ready" }, { id: "worker", parentId: "root", depth: 1, state: "reserved" }],
  expiresAt: 1000,
};
const message: SwarmMessageView = {
  id: "m1", seq: 1, senderId: "root", author: "agent", text: "Investigate",
  audience: ["worker"], createdAt: 100, notifications: { worker: { state: "queued", runId: "run-1" } },
};

test("normalizes real inspection and message feed with stable identities", () => {
  const events = normalizeSwarm(inspect, [message]);
  assert.deepEqual(events.map((e) => e.key), ["member:root:ready:", "member:worker:reserved:", "message:1", "notification:1:worker:queued:run-1"]);
  assert.deepEqual(events[1], { key: "member:worker:reserved:", kind: "member", memberId: "worker", parentId: "root", state: "reserved", depth: 1 });
  assert.deepEqual(events[2], { key: "message:1", kind: "message", memberId: "root", seq: 1, text: "Investigate", audience: ["worker"], at: 100, author: "agent" });
});

test("deduplicates overlapping pages and retains sequence order", () => {
  const second = { ...message, id: "m2", seq: 2, text: "Result" };
  assert.deepEqual(mergeMessages([message], [second, message]).map((m) => m.seq), [1, 2]);
  assert.deepEqual(normalizeSwarm(inspect, [second, message]).filter((e) => e.kind === "message").map((e) => e.key), ["message:1", "message:2"]);
});
