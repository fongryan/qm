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
const task='Synthetic support queue: refund #1, shipping delay #2, billing error #3, VIP complaint #4. Worker A drafts and records a sanitized support rule; worker B recalls it before drafting a second reply. Refund requires fixture human approval.';
const entity=`projects/qm-swarm-demo-${id.slice(0,8)}`;
let stalled:{id:string;dispatchedAt:number;messageId:string;approvalAt?:number;approvalMessageId?:string}|null=null;
const STALL_THRESHOLD_MS=20_000;
const ticketKinds=['refund','shipping delay','billing error','VIP complaint'] as const;
const queue={source:'local synthetic ticket fixture' as const,total:24,dispatched:0,drafted:0,pending:24,workerIds:[] as string[],events:[] as Array<{ticket:number;worker:string;messageId:string}>};
async function drainQueue(){
 const assignments=Array.from({length:5},(_,i)=>Array.from({length:i===4?4:5},(_,j)=>i*5+j+1));
 const workers=await fixture.service.spawn(fixture.caller,{requestId:'scaled-support-workers',text:'Draft synthetic support tickets only. No customer sends, refunds or payments.',contexts:assignments.map((tickets,i)=>({role:`ticket drafting fixture ${i+1}`,tickets})),count:5});
 await fixture.service.sweep();
 queue.workerIds=workers.map((w)=>w.id);
 for(let i=0;i<workers.length;i++){
  const worker=await fixture.workerCaller(workers[i]!.id);
  for(const ticket of assignments[i]!){
   const kind=ticketKinds[(ticket-1)%4]!;
   const dispatch=await fixture.service.send(fixture.caller,{requestId:`ticket-${ticket}-dispatch`,text:`Synthetic ${kind} ticket #${ticket}. Draft only, do not send to a customer or transact.`,audience:[workers[i]!.id],notify:false});
   queue.dispatched++;queue.pending=queue.total-queue.drafted;
   await pause(900);
   const msg=await fixture.service.send(worker,{requestId:`ticket-${ticket}-draft`,replyTo:dispatch.id,text:`Fixture worker draft for synthetic ${kind} #${ticket}: ${kind==='refund'?'Hold for human review, no refund action.':kind==='billing error'?'Verify account without collecting payment data.':kind==='VIP complaint'?'Escalate without a promise or credit.':'Prepare status update without customer send.'} No real action.`,audience:[fixture.root.id],notify:false});
   queue.drafted++;queue.pending=queue.total-queue.drafted;queue.events.push({ticket,worker:workers[i]!.id,messageId:msg.id});
  }
 }
}

const findings=[
 {fact:'Synthetic support policy: refund requests require a human approval before any refund action.',topic:'approval',tags:['human','approval']},
 {fact:'Synthetic support policy: billing errors require account verification and no card numbers in agent messages.',topic:'approval',tags:['human','privacy']},
 {fact:'Synthetic support workflow: shipping delays receive a status draft before a customer-facing reply is sent.',topic:'workflow',tags:['workflow','shipping']},
 {fact:'Synthetic support workflow: VIP complaints are escalated to a human before a promise or credit is offered.',topic:'workflow',tags:['workflow','vip']}
];
const [first]=await fixture.service.spawn(fixture.caller,{requestId:'gbrain-worker-a',text:task,context:{role:'privacy review A'},count:1});
await fixture.service.sweep();
let begun=false;
async function work(){if(begun)return;begun=true;try{
 await pause(1300);
 const workerA=await fixture.workerCaller(first!.id);
 const rootQuestion=(await fixture.service.read(workerA,{after:0}))[0];
 const provenance='Synthetic support policy invented for local fixture by Instinct worker A, not Armalo policy, 2026-09-27';
 const written=findings.map((finding)=>{
  const result=brain(['remember',finding.fact,'--entity',entity,'--provenance',provenance,'--visibility','private','--json']);
  if(result.state!=='committed'||!result.id)throw new Error('GBrain write not committed');
  return {...finding,id:String(result.id),source:provenance};
 });
 evidence.status='written';evidence.factId=written[0]!.id;evidence.writer=first!.id;evidence.provenance=provenance;evidence.note='Four findings written to local GBrain; awaiting independent worker recall.';
 await fixture.service.send(workerA,{requestId:'worker-a-gbrain-result',replyTo:rootQuestion!.id,text:'Support worker A: drafted refund #1 and billing #3 replies. Refund #1 is held for fixture-human approval; no refund action or customer send. Stored four invented synthetic support rules in local GBrain.',audience:[fixture.root.id],notify:false});
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
 evidence.status='recalled';evidence.reader=second!.id;evidence.fact=written[0]!.fact;evidence.facts=written.map(({id,fact,topic,tags,source})=>({id,fact,topic,tags,source}));evidence.note='Worker B read all four invented synthetic support rules and used the shipping/VIP workflow in its QM draft. No customer-facing send.';
 const secondQuestion=(await fixture.service.read(workerB,{after:0})).find((m)=>m.senderId===fixture.root.id&&m.audience.includes(second!.id));
 await fixture.service.send(workerB,{requestId:'worker-b-recall-result',replyTo:secondQuestion!.id,text:`Support worker B: independently recalled four invented support rules from local GBrain with matching sources. Draft shipping-delay #2 status update; escalate VIP complaint #4 before any promise or credit. No customer message was sent.`,audience:[fixture.root.id],notify:false});
 await pause(2000);
 await fixture.service.send(fixture.caller,{requestId:'root-memory-synthesis',text:'Synthetic support queue: worker A drafted refund/billing; worker B recalled GBrain rules for shipping/VIP. Refund #1 remains at a fixture-human approval gate. No money or customer contact occurred. QM worker runtime remains stubbed.',audience:[first!.id,second!.id],notify:false});
 // A third fixture member receives a task but is deliberately not driven.
 // That is a measured non-response, not proof of an underlying QM agent loop.
 const [third]=await fixture.service.spawn(fixture.caller,{requestId:'stall-demo-worker',text:'Synthetic refund #1 draft awaits fixture-human approval. Do not issue money or contact a customer.',count:1});
 await fixture.service.sweep();
 const dispatched=(await fixture.service.read(fixture.caller,{after:0})).findLast((m)=>m.senderId===fixture.root.id&&m.audience.includes(third!.id));
 if(!dispatched)throw new Error('No third-worker QM dispatch found');
 stalled={id:third!.id,dispatchedAt:Date.now(),messageId:dispatched.id};
 void drainQueue().catch((e)=>console.error('queue error',e));
 }catch(e){evidence.status='failed';evidence.note=String(e);console.error('work error',e)}}
createServer(async(req,res)=>{res.setHeader('access-control-allow-origin','*');res.setHeader('content-type','application/json');const u=new URL(req.url??'/','http://localhost');if(u.pathname==='/start'){void work();res.end(JSON.stringify({started:true}));return}
 if(u.pathname==='/queue-demo'){res.end(JSON.stringify(queue));return}
 if(u.pathname==='/approve-demo'){
  if(!stalled){res.statusCode=409;res.end(JSON.stringify({error:'approval gate not ready'}));return}
  if(stalled.approvalAt){res.end(JSON.stringify({approvedAt:stalled.approvalAt,messageId:stalled.approvalMessageId}));return}
  if(Date.now()-stalled.dispatchedAt<STALL_THRESHOLD_MS){res.statusCode=409;res.end(JSON.stringify({error:'wait for measured threshold'}));return}
  const approval=await fixture.service.send({kind:'human',actorId:'alice',sessionId:id},{requestId:'fixture-human-refund-approval',replyTo:stalled.messageId,text:'Test actor approval for synthetic refund #1 draft only. Sent by the local fixture, not Ryan. No real refund or customer send.',audience:[stalled.id],notify:false});
  stalled.approvalAt=Date.now();stalled.approvalMessageId=approval.id;
  const waiting=await fixture.workerCaller(stalled.id);
  await fixture.service.send(waiting,{requestId:'fixture-worker-after-approval',replyTo:approval.id,text:'Support worker: received fixture-human approval for the synthetic refund #1 draft. No actual refund or customer message executed.',audience:[fixture.root.id],notify:false});
  res.end(JSON.stringify({approvedAt:stalled.approvalAt,messageId:approval.id}));return
 }
 const m=u.pathname.match(/^\/v1\/sessions\/([^/]+)(\/swarm|\/memory-demo|\/stall-demo|\/approve-demo)?$/);if(!m||m[1]!==id){res.statusCode=404;res.end(JSON.stringify({error:'not_found'}));return}
 try{const caller={kind:'human' as const,actorId:'alice',sessionId:id};const value=u.pathname.endsWith('/memory-demo')?evidence:u.pathname.endsWith('/stall-demo')?(stalled?{source:'local fixture dispatch timer',memberId:stalled.id,dispatchedAt:stalled.dispatchedAt,thresholdMs:STALL_THRESHOLD_MS,elapsedMs:Date.now()-stalled.dispatchedAt,hasReply:Boolean(stalled.approvalAt),approvalAt:stalled.approvalAt??null,approvalMessageId:stalled.approvalMessageId??null}:{source:'local fixture dispatch timer',status:'waiting'}):u.pathname.endsWith('/swarm')?(u.searchParams.get('read')==='1'?{messages:await fixture.service.read(caller,{after:Number(u.searchParams.get('after')??0)})}:await fixture.service.inspect(caller)):{session:{id,surface:'web',threadRef:fixture.root.threadRef}};res.end(JSON.stringify(value))}catch(e){res.statusCode=400;res.end(JSON.stringify({error:String(e)}))}
}).listen(5225,'127.0.0.1',()=>console.log(JSON.stringify({sessionId:id,port:5225})));
process.on('SIGTERM',async()=>{await fixture.service.stop();process.exit(0)});
