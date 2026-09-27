import { test } from "node:test";
import assert from "node:assert/strict";
import { swarmFixture } from "../../../test/support/swarm-fixture.ts";
import { normalizeSwarm, graphLayout } from "../src/swarm-events.ts";

// Real QM swarm service/storage, with in-memory fixtures. No live provider/model is claimed.
test("QM service spawn, send, read and inspect flow through the viewer adapter", async () => {
  const fixture = await swarmFixture();
  try {
    const children = await fixture.service.spawn(fixture.caller, { requestId: "preview-spawn", text: "Split a bounded task", count: 2 });
    assert.equal(children.length, 2);
    await fixture.service.sweep();
    const sent = await fixture.service.send(fixture.caller, {
      requestId: "preview-message", text: "Check each part", audience: "all",
    });
    assert.equal(sent.author, "agent");
    const inspected = await fixture.service.inspect(fixture.caller);
    const feed = await fixture.service.read(fixture.caller, { after: 0 });
    assert.equal(inspected.peers.length, 3);
    assert.ok(feed.some((m) => m.id === sent.id));
    const events = normalizeSwarm(inspected, feed);
    const nodes = graphLayout(inspected.peers);
    assert.equal(nodes.length, 3);
    assert.ok(nodes.filter((n) => n.parentId === inspected.id).length >= 2);
    assert.ok(events.some((e) => e.kind === "message" && e.text === "Check each part"));
  } finally {
    fixture.service.stop();
  }
});
