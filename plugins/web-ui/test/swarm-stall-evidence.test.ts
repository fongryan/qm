import assert from "node:assert/strict";
import {test} from "node:test";
import {measuredNonReply, type StallReceipt} from "../src/swarm-stall-evidence.ts";
const receipt:StallReceipt={source:"local fixture dispatch timer",memberId:"worker",dispatchedAt:1000,thresholdMs:20000,elapsedMs:24000,hasReply:false};
test("only measured, threshold-past fixture non-replies produce a signal",()=>{
 assert.deepEqual(measuredNonReply(receipt,["worker"]),{memberId:"worker",seconds:24,thresholdSeconds:20});
 assert.equal(measuredNonReply({...receipt,elapsedMs:19000},["worker"]),null);
 assert.equal(measuredNonReply({...receipt,hasReply:true},["worker"]),null);
 assert.equal(measuredNonReply(receipt,["other"]),null);
});
