import assert from "node:assert/strict";
import { test } from "node:test";
import { syntheticInspection, syntheticMessages, syntheticClusterStats, syntheticSignals } from "../src/swarm-scale-preview.ts";

test("synthetic preview is exactly 1,200 members in twelve radial clusters", () => {
  assert.equal(syntheticInspection.peers.length, 1200);
  assert.equal(syntheticInspection.peers.filter((p) => p.depth === 0).length, 1);
  assert.equal(syntheticInspection.peers.filter((p) => p.depth === 1).length, 12);
  assert.equal(syntheticInspection.peers.filter((p) => p.depth === 2).length, 1187);
  assert.equal(syntheticClusterStats.length, 12);
  assert.equal(syntheticClusterStats.reduce((count, cluster) => count + cluster.count, 0), 1187);
  assert.equal(syntheticClusterStats[0]?.index, 7);
  assert.equal(syntheticClusterStats[0]?.failedMembers, 20);
  assert.equal(syntheticClusterStats[0]?.failed, 8);
  assert.ok(syntheticMessages.every((m) => m.id.startsWith("synthetic-")));
  assert.ok(syntheticSignals.failed >= 8);
});
