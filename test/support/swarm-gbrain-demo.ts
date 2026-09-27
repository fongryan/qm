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
const evidence:{status:string;source:string;factId?:string;fact?:string;writer?:string;reader?:string;provenance?:string;note:string}={status:'waiting',source:'local GBrain PGLite',note:'No write/recall receipt yet.'};
const task='Review Swarm View: worker A checks privacy and writes one synthetic-safe finding to GBrain; worker B recalls it before drafting a limitation.';
const [first]=await fixture.service.spawn(fixture.caller,{requestId:'gbrain-worker-a',text:task,context:{role:'privacy review A'},count:1});
await fixture.service.sweep();
let begun=false;
async function work(){if(begun)return;begun=true;try{
 await pause(1300);
 const workerA=await fixture.workerCaller(first!.id);
 const rootQuestion=(await fixture.service.read(workerA,{after:0}))[0];
 const fact='The local QM Swarm View demo must hide message bodies by default and must label the QM worker model runtime as stubbed.';
 const provenance='Synthetic-safe QM README review by Instinct worker A, local fixture 2026-09-27';
 const written=brain(['remember',fact,'--entity','projects/qm-swarm-memory-demo','--provenance',provenance,'--visibility','private','--json']);
 if(written.state!=='committed'||!written.id)throw new Error('GBrain write not committed');
 evidence.status='written';evidence.factId=String(written.id);evidence.writer=first!.id;evidence.provenance=provenance;evidence.note='Written to local GBrain; awaiting an independent worker recall.';
 await fixture.service.send(workerA,{requestId:'worker-a-gbrain-result',replyTo:rootQuestion!.id,text:'Privacy review A: message text hidden by default; recorded this synthetic-safe finding in local GBrain. The QM worker model runtime remains stubbed.',audience:[fixture.root.id],notify:false});
 await pause(2600);
 const [second]=await fixture.service.spawn(fixture.caller,{requestId:'gbrain-worker-b',text:task,context:{role:'limitations review B'},count:1});
 await fixture.service.sweep();
 await pause(2400);
 const workerB=await fixture.workerCaller(second!.id);
 const recalled=brain(['recall','projects/qm-swarm-memory-demo','--json']);
 const hit=recalled.facts?.find((item:any)=>String(item.id)===String(written.id)&&item.fact===fact&&item.source===provenance);
 if(!hit)throw new Error('GBrain recall did not match the stored fact and provenance');
 evidence.status='recalled';evidence.reader=second!.id;evidence.fact=fact;evidence.note='Worker B read the exact GBrain fact #'+written.id+' and used it to ground the next QM message. Local PGLite, not a hosted brain.';
 const secondQuestion=(await fixture.service.read(workerB,{after:0})).find((m)=>m.senderId===fixture.root.id&&m.audience.includes(second!.id));
 await fixture.service.send(workerB,{requestId:'worker-b-recall-result',replyTo:secondQuestion!.id,text:`Limitations review B: recalled GBrain fact #${written.id} from worker A with matching provenance. Therefore document privacy-hidden message bodies and stubbed QM worker runtime. This is a local memory write/read, not a hosted agent run or Proof Pack.`,audience:[fixture.root.id],notify:false});
 await pause(2000);
 await fixture.service.send(fixture.caller,{requestId:'root-memory-synthesis',text:'Local demonstration: Instinct worker A wrote a synthetic-safe fact to GBrain PGLite; Instinct worker B recalled it before replying through QM. QM worker model runtime and sandbox remain stubbed; no native GBrain/QM or Aside integration is claimed.',audience:[first!.id,second!.id],notify:false});
 }catch(e){evidence.status='failed';evidence.note=String(e);console.error('work error',e)}}
createServer(async(req,res)=>{res.setHeader('access-control-allow-origin','*');res.setHeader('content-type','application/json');const u=new URL(req.url??'/','http://localhost');if(u.pathname==='/start'){void work();res.end(JSON.stringify({started:true}));return}
 const m=u.pathname.match(/^\/v1\/sessions\/([^/]+)(\/swarm|\/memory-demo)?$/);if(!m||m[1]!==id){res.statusCode=404;res.end(JSON.stringify({error:'not_found'}));return}
 try{const caller={kind:'human' as const,actorId:'alice',sessionId:id};const value=u.pathname.endsWith('/memory-demo')?evidence:u.pathname.endsWith('/swarm')?(u.searchParams.get('read')==='1'?{messages:await fixture.service.read(caller,{after:Number(u.searchParams.get('after')??0)})}:await fixture.service.inspect(caller)):{session:{id,surface:'web',threadRef:fixture.root.threadRef}};res.end(JSON.stringify(value))}catch(e){res.statusCode=400;res.end(JSON.stringify({error:String(e)}))}
}).listen(5225,'127.0.0.1',()=>console.log(JSON.stringify({sessionId:id,port:5225})));
process.on('SIGTERM',async()=>{await fixture.service.stop();process.exit(0)});
