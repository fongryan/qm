import {test} from "node:test";
import assert from "node:assert/strict";
import {validateTicket,validateDraft} from "./swarm-live-ticket.ts";
test("live ticket input bounded and model must cite a verified policy",()=>{
 const ticket={id:"25",customer:"Judge",subject:"Shipping delay",detail:"Where is my order?"};
 assert.deepEqual(validateTicket(ticket),ticket);
 assert.throws(()=>validateTicket({...ticket,detail:"x".repeat(1201)}));
 const p=[{id:"42",fact:"Draft first",source:"local GBrain"}];
 assert.deepEqual(validateDraft({text:"Draft reply",policyId:"42",needsReview:false,model:"River"},p).policyId,"42");
 assert.throws(()=>validateDraft({text:"Draft",policyId:"unknown",needsReview:false,model:"River"},p));
});
