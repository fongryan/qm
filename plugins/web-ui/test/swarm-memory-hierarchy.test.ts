import assert from "node:assert/strict";
import { test } from "node:test";
import {groupVerifiedFacts, type LearnedFact} from "../src/swarm-memory-hierarchy.ts";
const fact=(id:string,topic:string,tags:string[]):LearnedFact=>({id,topic,tags,source:`fixture:${id}`,text:id});
test("single verified recall stays a leaf; no imagined hierarchy",()=>{
 const item=fact("1","privacy",["privacy"]);
 assert.deepEqual(groupVerifiedFacts([item]),{kind:"leaf",facts:[item]});
});
test("selects maximum information gain over source-labeled topics",()=>{
 const items=[fact("1","privacy",["privacy","qm"]),fact("2","privacy",["privacy"]),fact("3","runtime",["runtime","qm"]),fact("4","runtime",["runtime"])];
 const tree=groupVerifiedFacts(items);
 assert.equal(tree.kind,"split");
 if(tree.kind==="split") {assert.equal(tree.tag,"privacy");assert.ok(Math.abs(tree.gain-1)<1e-9);assert.deepEqual(tree.matches.kind,"leaf");assert.deepEqual(tree.other.kind,"leaf")}
});
test("does not split when source topics are indistinguishable",()=>{
 assert.equal(groupVerifiedFacts([fact("1","privacy",["a"]),fact("2","privacy",["b"])]).kind,"leaf");
});
