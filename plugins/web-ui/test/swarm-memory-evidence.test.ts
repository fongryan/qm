import assert from "node:assert/strict";
import { test } from "node:test";
import { verifiedMemoryLink, type MemoryReceipt } from "../src/swarm-memory-evidence.ts";
const receipt: MemoryReceipt = {source:"local GBrain PGLite",status:"recalled",factId:"1",fact:"synthetic-safe fact",writer:"a",reader:"b",provenance:"local source",note:""};
test("memory link requires separate readback, identity and provenance", () => {
  assert.deepEqual(verifiedMemoryLink(receipt,["a","b"]),{from:"a",to:"b",factId:"1"});
  assert.equal(verifiedMemoryLink({...receipt,status:"written"},["a","b"]),null);
  assert.equal(verifiedMemoryLink({...receipt,provenance:undefined},["a","b"]),null);
  assert.equal(verifiedMemoryLink(receipt,["a"]),null);
  assert.equal(verifiedMemoryLink({...receipt,reader:"a"},["a","b"]),null);
});
