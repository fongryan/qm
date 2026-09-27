import { createServer } from 'node:http';
import { spawnSync } from 'node:child_process';
import { swarmFixture } from './swarm-fixture.ts';
const fixture=await swarmFixture();
const id=fixture.root.id;
const pause=(ms:number)=>new Promise(r=>setTimeout(r,ms));
const gbrainRoot=process.env.GBRAIN_SOURCE_DIR;
if(!gbrainRoot)throw new Error('Set GBRAIN_SOURCE_DIR to an installed garrytan/gbrain source checkout');
if(!process.env.GBRAIN_HOME)throw new Error('Set GBRAIN_HOME to a separate initialized local brain');
const env={...process.env,PATH:`${process.env.HOME}/.bun/bin:${process.env.PATH}`,GBRAIN_HOME:process.env.GBRAIN_HOME};
function brain(args:string[]){const p=spawnSync(`${process.env.HOME}/.bun/bin/bun`,['src/cli.ts',...args],{cwd:gbrainRoot,env,encoding:'utf8',timeout:20000});if(p.status!==0)throw new Error(`GBrain ${args[0]} failed: ${p.stderr.slice(0,350)}`);return JSON.parse(p.stdout)}
const evidence:{status:string;source:string;factId?:string;fact?:string;writer?:string;reader?:string;provenance?:string;note:string;facts?:Array<{id:string;fact:string;topic:string;tags:string[];source:string}>}={status:'waiting',source:'local GBrain PGLite',note:'No write/recall receipt yet.'};
const task='Review Swarm View: worker A checks source-bound constraints and writes four findings to GBrain; worker B recalls them before drafting a limitation.';
const entity=`projects/qm-swarm-demo-${id.slice(0,8)}`;
let stalled:{id:string;dispatchedAt:number;messageId:string}|null=null;
const STALL_THRESHOLD_MS=20_000;
const findings=[
 {fact:'Swarm View forwards a portal-authenticated actor and the core rechecks session visibility and membership.',topic:'access',tags:['security','access']},
 {fact:'Swarm View hides message text and session IDs by default; revealing them in a private view is not a sharing grant.',topic:'access',tags:['security','privacy']},
 {fact:'Swarm View refreshes every three seconds, and the read-only message feed is bounded to 256 entries per refresh.',topic:'operations',tags:['operations','refresh']},
 {fact:'QM currently configures a 64-member swarm maximum; the 1,200-member preview is generated visualization data.',topic:'operations',tags:['operations','scale']}
];
const [first]=await fixture.service.spawn(fixture.caller,{requestId:'gbrain-worker-a',text:task,context:{role:'privacy review A'},count:1});
await fixture.service.sweep();
let begun=false;
async function work(){if(begun)return;begun=true;try{
 await pause(1300);
 const workerA=await fixture.workerCaller(first!.id);
 const rootQuestion=(await fixture.service.read(workerA,{after:0}))[0];
 const provenance='Synthetic-safe QM README and swarm-settings source review by Instinct worker A, local fixture 2026-09-27';
 const written=findings.map((finding)=>{
  const result=brain(['remember',finding.fact,'--entity',entity,'--provenance',provenance,'--visibility','private','--json']);
  if(result.state!=='committed'||!result.id)throw new Error('GBrain write not committed');
  return {...finding,id:String(result.id),source:provenance};
 });
 evidence.status='written';evidence.factId=written[0]!.id;evidence.writer=first!.id;evidence.provenance=provenance;evidence.note='Four findings written to local GBrain; awaiting independent worker recall.';
 await fixture.service.send(workerA,{requestId:'worker-a-gbrain-result',replyTo:rootQuestion!.id,text:'Privacy review A: message text hidden by default; recorded this synthetic-safe finding in local GBrain. The QM worker model runtime remains stubbed.',audience:[fixture.root.id],notify:false});
 await pause(2600);
 const [second]=await fixture.service.spawn(fixture.caller,{requestId:'gbrain-worker-b',text:task,context:{role:'limitations review B'},count:1});
 await fixture.service.sweep();
 await pause(2400);
 const workerB=await fixture.workerCaller(second!.id);
 const recalled=brain(['recall',entity,'--json']);
 for(const item of written){
  const hit=recalled.facts?.find((entry:any)=>String(entry.id)===item.id&&entry.fact===item.fact&&entry.source===item.source);
  if(!hit)throw new Error(`GBrain recall did not match fact #${item.id} and its provenance`);
 }
 evidence.status='recalled';evidence.reader=second!.id;evidence.fact=written[0]!.fact;evidence.facts=written.map(({id,fact,topic,tags,source})=>({id,fact,topic,tags,source}));evidence.note='Worker B read all four exact GBrain facts and source, then used the access/privacy and operations findings in QM reply. Local PGLite, not hosted.';
 const secondQuestion=(await fixture.service.read(workerB,{after:0})).find((m)=>m.senderId===fixture.root.id&&m.audience.includes(second!.id));
 await fixture.service.send(workerB,{requestId:'worker-b-recall-result',replyTo:secondQuestion!.id,text:`Limitations review B: independently recalled four GBrain facts from worker A with matching sources, including access/privacy and refresh/scale limits. Document session authorization, privacy defaults, three-second refresh, bounded feed, and real 64-member cap. This is local memory readback, not hosted execution or a Proof Pack.`,audience:[fixture.root.id],notify:false});
 await pause(2000);
 await fixture.service.send(fixture.caller,{requestId:'root-memory-synthesis',text:'Local demonstration: Instinct worker A wrote a synthetic-safe fact to GBrain PGLite; Instinct worker B recalled it before replying through QM. QM worker model runtime and sandbox remain stubbed; no native GBrain/QM or Aside integration is claimed.',audience:[first!.id,second!.id],notify:false});
 // A third fixture member receives a task but is deliberately not driven.
 // That is a measured non-response, not proof of an underlying QM agent loop.
 const [third]=await fixture.service.spawn(fixture.caller,{requestId:'stall-demo-worker',text:'Fixture-only follow-up: check the memory panel',count:1});
 await fixture.service.sweep();
 const dispatched=(await fixture.service.read(fixture.caller,{after:0})).findLast((m)=>m.senderId===fixture.root.id&&m.audience.includes(third!.id));
 if(!dispatched)throw new Error('No third-worker QM dispatch found');
 stalled={id:third!.id,dispatchedAt:Date.now(),messageId:dispatched.id};
 }catch(e){evidence.status='failed';evidence.note=String(e);console.error('work error',e)}}
createServer(async(req,res)=>{res.setHeader('access-control-allow-origin','*');res.setHeader('content-type','application/json');const u=new URL(req.url??'/','http://localhost');if(u.pathname==='/start'){void work();res.end(JSON.stringify({started:true}));return}
 const m=u.pathname.match(/^\/v1\/sessions\/([^/]+)(\/swarm|\/memory-demo|\/stall-demo)?$/);if(!m||m[1]!==id){res.statusCode=404;res.end(JSON.stringify({error:'not_found'}));return}
 try{const caller={kind:'human' as const,actorId:'alice',sessionId:id};const value=u.pathname.endsWith('/memory-demo')?evidence:u.pathname.endsWith('/stall-demo')?(stalled?{source:'local fixture dispatch timer',memberId:stalled.id,dispatchedAt:stalled.dispatchedAt,thresholdMs:STALL_THRESHOLD_MS,elapsedMs:Date.now()-stalled.dispatchedAt,hasReply:(await fixture.service.read(caller,{after:0})).some((msg)=>msg.senderId===stalled!.id&&msg.replyTo===stalled!.messageId)}:{source:'local fixture dispatch timer',status:'waiting'}):u.pathname.endsWith('/swarm')?(u.searchParams.get('read')==='1'?{messages:await fixture.service.read(caller,{after:Number(u.searchParams.get('after')??0)})}:await fixture.service.inspect(caller)):{session:{id,surface:'web',threadRef:fixture.root.threadRef}};res.end(JSON.stringify(value))}catch(e){res.statusCode=400;res.end(JSON.stringify({error:String(e)}))}
}).listen(5225,'127.0.0.1',()=>console.log(JSON.stringify({sessionId:id,port:5225})));
process.on('SIGTERM',async()=>{await fixture.service.stop();process.exit(0)});
