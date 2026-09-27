import {test} from "node:test";
import assert from "node:assert/strict";
import {demoTicket} from "../src/swarm-support-tickets.ts";
test("invented support labels and review state stay deterministic",()=>{
 assert.deepEqual(demoTicket(1,24,24),{number:1,customer:"Maya R.",subject:"Refund request after duplicate charge",status:"Waiting on review"});
 assert.equal(demoTicket(2,24,24).status,"Draft ready");
 assert.equal(demoTicket(24,3,12).status,"In progress");
 assert.throws(()=>demoTicket(25,0,0),RangeError);
});
