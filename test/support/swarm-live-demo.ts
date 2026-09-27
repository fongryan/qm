/** Local-only interactive support demo. No customer system is connected. */
import { createServer, type IncomingMessage } from 'node:http';
import { spawnSync } from 'node:child_process';
import { swarmFixture } from './swarm-fixture.ts';
import { createSwarmMemory } from './swarm-memory-bridge.ts';
import { validateTicket, validateDraft, type DraftModel, type LiveTicket, type TeamPolicy } from './swarm-live-ticket.ts';

const fixture=await swarmFixture({actorId:'demo-operator'});
const id=fixture.root.id;
const actor={kind:'human' as const,actorId:'demo-operator',sessionId:id};
const entity=`projects/qm-interactive-${id.slice(0,8)}`;
const brainRoot=process.env.GBRAIN_SOURCE_DIR;
if(!brainRoot || !process.env.GBRAIN_HOME) throw new Error('Local GBrain checkout and home required');
const env={...process.env,PATH:`${process.env.HOME}/.bun/bin:${process.env.PATH}`};
function brain(args:string[]){const p=spawnSync(`${process.env.HOME}/.bun/bin/bun`,['src/cli.ts',...args],{cwd:brainRoot,env,encoding:'utf8',timeout:20000});if(p.status!==0)throw new Error(`GBrain ${args[0]} failed: ${p.stderr.slice(0,200)}`);return JSON.parse(p.stdout)}
const memory=createSwarmMemory({remember:(fact,e,source)=>brain(['remember',fact,'--entity',e,'--provenance',source,'--visibility','private','--json']),recall:(e)=>brain(['recall',e,'--json'])});
const seed=[
 {fact:'Demo policy: refund requests require human review before any refund action.',topic:'approval',tags:['refund','approval']},
 {fact:'Demo policy: billing errors require account verification; never ask for card numbers in messages.',topic:'privacy',tags:['billing','privacy']},
 {fact:'Demo policy: delayed shipping gets a status draft before any customer-facing reply.',topic:'workflow',tags:['shipping','workflow']},
 {fact:'Public Armalo page says its customer-support team drafts replies and loops in a human for the rest.',topic:'product',tags:['armalo','support']}
];
const writer=await fixture.service.spawn(fixture.caller,{requestId:'memory-writer',text:'Store demo support policies.',count:1});
const workers=await fixture.service.spawn(fixture.caller,{requestId:'live-support-workers',text:'Draft demo support tickets only. No customer sends, refunds or payments.',count:7});
await fixture.service.sweep();
const stored=memory.write(entity,writer[0]!.id,'Invented local demo policy, not Armalo policy',seed.slice(0,3));
stored.push(...memory.write(entity,writer[0]!.id,'https://armalo.ai/ (public page, observed 2026-09-27)',seed.slice(3)));
const reader=workers[0]!.id;
let verified=memory.recall(entity,reader,stored).facts;
const state:{tickets:Array<LiveTicket & {status:string;draft?:string;policyId?:string;needsReview?:boolean;messageId?:string}>;busy:boolean;error?:string;model:string}={tickets:[],busy:false,model:'Offline draft adapter'};
let next=0;
const reviewed=new Set<string>();
const draftAdapter:DraftModel={async draft(ticket,policies){
 const kind=/refund|return|chargeback/i.test(ticket.subject+' '+ticket.detail)?'refund':/billing|invoice|charge/i.test(ticket.subject+' '+ticket.detail)?'billing':/shipping|delivery|order/i.test(ticket.subject+' '+ticket.detail)?'shipping':'vip';
 const policy=policies.find((p)=>p.fact.toLowerCase().includes(kind))??policies.find((p)=>p.fact.includes('Armalo'))??policies[0]!;
 return validateDraft({text:`Internal draft for ${ticket.customer}: I can help with "${ticket.subject}". ${policy.fact.replace(/^Demo policy: /,'')} This is an unsent draft for review.`,policyId:policy.id,needsReview:kind==='refund',model:'Offline draft adapter'},policies);
}};
function policies():TeamPolicy[]{return verified.map(({id,fact,source})=>({id,fact,source}))}
function publicState(){return {tickets:state.tickets,busy:state.busy,error:state.error,model:state.model,memory:{source:'local GBrain PGLite',status:'recalled',factId:verified[0]!.id,fact:verified[0]!.fact,writer:writer[0]!.id,reader,provenance:verified[0]!.source,note:'Independent readback',facts:verified.map(({id,fact,topic,tags,source})=>({id,fact,topic,tags,source}))}}}
async function readBody(req:IncomingMessage){let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>1600)throw new Error('Input too long')}return JSON.parse(raw)}
function json(res:import('node:http').ServerResponse,status:number,value:unknown){res.statusCode=status;res.setHeader('content-type','application/json');res.end(JSON.stringify(value))}
createServer(async(req,res)=>{
 const u=new URL(req.url??'/','http://127.0.0.1');
 try {
  if(req.method==='GET' && u.pathname==='/state'){json(res,200,publicState());return}
  if(req.method==='POST' && u.pathname==='/ticket'){
   if(state.busy)throw new Error('Another ticket is in progress');
   const input=await readBody(req);
   const ticket=validateTicket({id:String(++next),customer:String(input.customer??'Demo customer'),subject:String(input.subject??''),detail:String(input.detail??'')});
   state.tickets.unshift({...ticket,status:'Drafting'});state.busy=true;state.error=undefined;
   json(res,202,{ticketId:ticket.id,status:'Drafting'});
   void (async()=>{try {
     const worker=workers[(next-1)%workers.length]!;
     const dispatch=await fixture.service.send(actor,{requestId:`live-ticket-${ticket.id}`,text:`New invented support ticket #${ticket.id}: ${ticket.subject}. ${ticket.detail}. Draft only.`,audience:[worker.id],notify:false});
     // Independent GBrain readback is required for every new draft.
     verified=memory.recall(entity,worker.id,stored).facts;
     const draft=validateDraft(await draftAdapter.draft(ticket,policies()),policies());
     state.model=draft.model;
     const reply=await fixture.service.send(await fixture.workerCaller(worker.id),{requestId:`live-draft-${ticket.id}`,replyTo:dispatch.id,text:`Internal draft (policy #${draft.policyId}, ${draft.model}): ${draft.text} ${draft.needsReview?'Human review required; no refund issued.':'No customer message sent.'}`,audience:[fixture.root.id],notify:false});
     Object.assign(state.tickets.find((t)=>t.id===ticket.id)!,{status:draft.needsReview?'Awaiting review':'Draft ready',draft:draft.text,policyId:draft.policyId,needsReview:draft.needsReview,messageId:reply.id});
    }catch(e){const t=state.tickets.find((t)=>t.id===ticket.id);if(t)t.status='Draft failed';state.error=String(e)}finally{state.busy=false}})();return;
  }
  if(req.method==='POST' && u.pathname==='/review'){
   const input=await readBody(req);const ticket=state.tickets.find((t)=>t.id===String(input.ticketId));
   if(!ticket||ticket.status!=='Awaiting review'||!ticket.messageId||reviewed.has(ticket.id))throw new Error('No draft awaiting review');
   if(input.decision!=='approve'&&input.decision!=='deny')throw new Error('Choose approve or deny');
   const note=String(input.note??'').trim();if(note.length>240)throw new Error('Review note too long');
   const text=`Local demo operator (test actor demo-operator) ${input.decision==='approve'?'approved the internal draft for review':'denied the internal draft'} for invented ticket #${ticket.id}.${note?' Note: '+note:''} No real refund or customer send.`;
   const message=await fixture.service.send(actor,{requestId:`review-${ticket.id}`,replyTo:ticket.messageId,text,audience:[workers[0]!.id],notify:false});
   reviewed.add(ticket.id);ticket.status=input.decision==='approve'?'Draft approved':'Draft denied';
   // A note is human input, not established company policy. Store as a labeled demo review note.
   if(note){const rows=memory.write(entity,writer[0]!.id,`Local demo review note from test actor demo-operator for QM message ${message.id}, not Armalo policy`,[{fact:`Demo review note for ticket #${ticket.id}: ${note}`,topic:'review',tags:['human','review']}]);stored.push(...rows);verified=memory.recall(entity,reader,stored).facts}
   json(res,200,{messageId:message.id,status:ticket.status});return;
  }
  if(req.method==='GET' && u.pathname==='/v1/session'){json(res,200,{session:{id,surface:'web',threadRef:fixture.root.threadRef}});return}
  if(req.method==='GET' && u.pathname==='/v1/swarm'){json(res,200,u.searchParams.get('read')==='1'?{messages:await fixture.service.read(actor,{after:Number(u.searchParams.get('after')??0)})}:await fixture.service.inspect(actor));return}
  json(res,404,{error:'not_found'});
 }catch(e){json(res,400,{error:String(e)})}
}).listen(5230,'127.0.0.1',()=>console.log(JSON.stringify({sessionId:id,port:5230,mode:'local interactive demo'})));
process.on('SIGTERM',async()=>{await fixture.service.stop();process.exit(0)});
