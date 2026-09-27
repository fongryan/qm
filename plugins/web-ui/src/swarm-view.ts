import { html, svg, nothing, render } from "lit";
import { api, withBase } from "./core-bridge";
import { appState } from "./shell-state";
import { normalizeSwarm, mergeMessages, graphLayout, deliverySignals, type SwarmInspection, type SwarmMessageView } from "./swarm-events";
import { verifiedMemoryLink, type MemoryReceipt } from "./swarm-memory-evidence";
import { measuredNonReply, type StallReceipt } from "./swarm-stall-evidence";
import { demoTicket } from "./swarm-support-tickets";
import { errMessage } from "../../chassis/src/errors";

let host: HTMLElement | null = null;
let sessionId = "";
let inspect: SwarmInspection | null = null;
let messages: SwarmMessageView[] = [];
let error = "";
let busy = false;
let revealPrivateText = false;
let selectedMember = "";
let selectedTicketId = "";
let timer: ReturnType<typeof setTimeout> | null = null;
let generation = 0;
let memoryReceipt: MemoryReceipt | null = null;
let stallReceipt: StallReceipt | null = null;
export interface QueueReceipt {source:"local synthetic ticket fixture";total:number;dispatched:number;drafted:number;pending:number;workerIds:string[];events:Array<{ticket:number;worker:string;messageId:string}>}
let queueReceipt:QueueReceipt|null=null;
interface LiveDemoState {tickets:Array<{id:string;customer:string;subject:string;detail:string;status:string;draft?:string;policyId?:string;needsReview?:boolean;workerId?:string;reviewNoteId?:string}>;busy:boolean;error?:string;model:string}
let liveDemo:LiveDemoState|null=null;
export function setSwarmLiveDemo(next:LiveDemoState|null):void {liveDemo=next;draw();}
async function submitLiveTicket(e:Event):Promise<void>{
 e.preventDefault(); const form=e.currentTarget as HTMLFormElement; const data=new FormData(form);
 const customer=String(data.get('customer')??'').trim(),subject=String(data.get('subject')??'').trim(),detail=String(data.get('detail')??'').trim();
 if(!customer||!subject||!detail)return;
 const r=await fetch('/api/live-demo/ticket',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({customer,subject,detail})});
 if(r.ok)form.reset();else {error=`Ticket not added: ${r.status}`;draw();}
}
async function reviewLiveTicket(ticketId:string,decision:'approve'|'deny',note:string):Promise<void>{
 const r=await fetch('/api/live-demo/review',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({ticketId,decision,note})});
 if(!r.ok){error=`Review not recorded: ${r.status}`;draw();}
}

export function setSwarmQueueEvidence(receipt:QueueReceipt|null):void {queueReceipt=receipt;draw();}
export function setSwarmStallEvidence(receipt: StallReceipt | null): void { stallReceipt = receipt; draw(); }
/** A caller may attach a separately verified memory receipt; QM itself has no memory endpoint. */
export function setSwarmMemoryEvidence(receipt: MemoryReceipt | null): void { memoryReceipt = receipt; draw(); }

function stop(): void {
  generation++;
  if (timer) clearTimeout(timer);
  timer = null;
}
export function closeSwarmView(): void {
  stop();
}

function draw(): void {
  if (appState.currentView !== "swarms" || !appState.mainEl) return;
  if (!host || host.parentElement !== appState.mainEl) {
    host = document.createElement("div");
    host.className = "pane swarm-view";
    appState.mainEl.replaceChildren(host);
  }
  const events = inspect ? normalizeSwarm(inspect, messages) : [];
  const nodes = inspect ? graphLayout(inspect.peers) : [];
  const signals = inspect ? deliverySignals(inspect, messages) : null;
  const nonReply = inspect ? measuredNonReply(stallReceipt, inspect.peers.map((m)=>m.id)) : null;
  const memoryLink = inspect ? verifiedMemoryLink(memoryReceipt, inspect.peers.map((m) => m.id)) : null;
  const fixtureHumanMessage = messages.find((m)=>m.author==="human" && m.text.startsWith("Test actor approval for synthetic refund #1 draft only."));
  const graphHeight = Math.max(120, ...nodes.map((node) => node.y + 55));
  render(html`
    <header class="swarm-head">
      <span class="swarm-eyebrow">DEMO SUPPORT OPERATIONS</span>
      <h1>Support swarm</h1>


      <form @submit=${(e: Event) => {
        e.preventDefault();
        const field = (e.currentTarget as HTMLFormElement).querySelector<HTMLInputElement>("input");
        const id = field?.value.trim() ?? "";
        if (!id || id.includes("/")) { error = "Enter a session ID, not a URL."; draw(); return; }
        void load(id);
      }}>
<label for="swarm-session">SESSION</label>
        <input id="swarm-session" name="session" .value=${sessionId} placeholder="Paste a session ID" autocomplete="off" />
        <button type="submit">Inspect</button>
      </form>
      <label class="swarm-privacy"><input type="checkbox" .checked=${revealPrivateText} @change=${(e: Event) => { revealPrivateText = (e.currentTarget as HTMLInputElement).checked; draw(); }} /> Reveal private details</label>

      ${error ? html`<p class="swarm-error" role="alert">${error}</p>` : nothing}
    </header>
    ${inspect ? html`
      <div class="swarm-summary"><span class="swarm-live-dot"></span><strong>SUPPORT SWARM</strong><span>${inspect.peers.length} QM members · local demo operator · shared memory</span><span>${messages.length} messages</span>${queueReceipt ? html`<span>${queueReceipt.workerIds.length+3} workers · ${queueReceipt.drafted}/${queueReceipt.total} drafts</span>` : nothing}<span>${busy ? "Refreshing…" : "Refreshes every 3s"}</span></div>
      ${queueReceipt && queueReceipt.workerIds.length ? html`<section class="queue-evidence" aria-label="Synthetic support ticket progress"><div><strong>Support inbox</strong><span>${queueReceipt.drafted} drafts ready / ${queueReceipt.total} demo tickets</span><small>Demo drafts only. No customer sends or refunds.</small></div><div class="queue-track"><div style=${`width:${Math.round(queueReceipt.drafted/queueReceipt.total*100)}%`}></div></div><span>${queueReceipt.pending} awaiting draft · ${queueReceipt.dispatched} assigned</span></section>` : nothing}
      ${liveDemo ? html`<section class="live-ticket" aria-label="Live demo ticket input"><div><strong>Try a ticket</strong><small>${liveDemo.model === 'Offline draft adapter' ? 'Local rules adapter - no live model' : `Live model: ${liveDemo.model}`} · draft only</small></div><form @submit=${submitLiveTicket}><input name="customer" maxlength="120" placeholder="Invented customer name" required /><input name="subject" maxlength="120" placeholder="Ticket subject" required /><input name="detail" maxlength="1200" placeholder="What happened?" required /><button type="submit" ?disabled=${liveDemo.busy}>${liveDemo.busy?'Drafting...':'Draft reply'}</button></form>${liveDemo.error ? html`<small role="alert">Draft failed; no customer message sent.</small>`:nothing}</section>` : nothing}
      <div class="support-workbench">
      ${(queueReceipt || liveDemo) ? html`<section class="ticket-inbox" aria-label="Demo ticket inbox"><div class="ticket-inbox-head"><h2>Ticket inbox</h2><span>${liveDemo?.tickets.length ?? queueReceipt?.total} demo cases</span></div><div class="ticket-list">${(liveDemo ? liveDemo.tickets : Array.from({length:Math.min(queueReceipt!.total,24)},(_,i)=>demoTicket(i+1,queueReceipt!.drafted,queueReceipt!.dispatched))).map((ticket)=>html`<button class="ticket-select ${'id' in ticket && ticket.id === selectedTicketId ? 'selected' : ''}" type="button" @click=${() => { selectedTicketId='id' in ticket ? ticket.id : String(ticket.number);draw(); }}><strong>${ticket.customer}</strong><span>#${String("number" in ticket ? ticket.number : ticket.id).padStart(3,"0")}</span><p>${ticket.subject}</p><small class=${ticket.status === "Waiting on review" || ticket.status === "Awaiting review" ? "status-review" : ticket.status === "Draft ready" ? "status-ready" : "status-progress"}>${ticket.status}</small></button>`)}</div></section>` : nothing}
      <section class="ticket-detail" aria-label="Selected ticket draft"><span class="detail-kicker">DRAFT WORKSPACE</span>
      ${liveDemo && liveDemo.tickets.length ? (()=>{const t=liveDemo.tickets.find((x)=>x.id===selectedTicketId) ?? liveDemo.tickets[0]!; const policy=memoryReceipt?.facts?.find((x)=>x.id===t.policyId); return html`
        <h2>${t.subject}</h2><p class="detail-customer">${t.customer} · Demo ticket #${t.id}</p>
        <div class="detail-section"><strong>Customer wrote</strong><p>${t.detail}</p></div>
        <div class="detail-section draft"><strong>${t.status === 'Drafting' ? 'Draft in progress' : 'Internal draft - not sent'}</strong><p>${t.draft ?? 'Waiting for a QM worker draft.'}</p></div>
        ${policy ? html`<div class="detail-policy"><strong>Why this draft?</strong><p>Team memory #${policy.id}: ${policy.fact.replace(/^Demo policy: /,'')}</p><small>Invented demo rule, verified in local GBrain</small></div>` : nothing}
        <div class="detail-actions"><span class=${t.status==='Awaiting review'?'review-needed':'review-done'}>${t.status}</span>${t.status==='Awaiting review' ? html`<div class="review-controls"><input aria-label="Review note for ticket ${t.id}" placeholder="Review note (optional)" maxlength="240"/><button type="button" @click=${(e:Event)=>{const input=(e.currentTarget as HTMLElement).parentElement!.querySelector('input')!;void reviewLiveTicket(t.id,'approve',input.value)}}>Approve draft</button><button type="button" @click=${(e:Event)=>{const input=(e.currentTarget as HTMLElement).parentElement!.querySelector('input')!;void reviewLiveTicket(t.id,'deny',input.value)}}>Deny draft</button></div>`:nothing}</div>
        <small>No customer send or refund is connected to this demo.</small>
      `})() : html`<div class="detail-empty"><h2>Select a ticket</h2><p>Enter an invented ticket above to see its draft, the memory fact it used, and the review step.</p></div>`}
      </section>
      ${liveDemo ? html`<section class="evidence-graph" aria-label="Evidence graph"><div class="graph-heading"><strong>Connected work</strong><span>Edges from this local run</span></div>${(()=>{
        const tickets=liveDemo.tickets.slice(0,8);const facts=memoryReceipt?.facts?.slice(0,6)??[];
        const points:Array<{id:string;label:string;kind:string;x:number;y:number}>=[];
        points.push({id:'human',label:'DEMO OPERATOR',kind:'human',x:45,y:36});
        inspect.peers.slice(0,9).forEach((m,i)=>points.push({id:m.id,label:i===0?'QM ROOT':i===1?'MEMORY':`WORKER ${i-1}`,kind:i===0?'root':'worker',x:178+(i%2)*67,y:35+Math.floor(i/2)*71}));
        tickets.forEach((t,i)=>points.push({id:`ticket-${t.id}`,label:`TICKET ${t.id}`,kind:'ticket',x:38+(i%2)*88,y:140+Math.floor(i/2)*66}));
        facts.forEach((f,i)=>points.push({id:`fact-${f.id}`,label:f.topic==='review'?'REVIEW NOTE':`POLICY ${i+1}`,kind:f.topic==='review'?'note':'policy',x:323+(i%2)*70,y:51+Math.floor(i/2)*82}));
        const find=(id:string)=>points.find(x=>x.id===id);
        const edges:Array<{a:string;b:string;label:string}>=[];
        tickets.forEach(t=>{if(t.workerId&&find(t.workerId))edges.push({a:`ticket-${t.id}`,b:t.workerId,label:'assigned'});if(t.policyId&&find(`fact-${t.policyId}`))edges.push({a:`ticket-${t.id}`,b:`fact-${t.policyId}`,label:'cites'});if(t.reviewNoteId&&find(`fact-${t.reviewNoteId}`)){edges.push({a:'human',b:`fact-${t.reviewNoteId}`,label:'wrote'});edges.push({a:`ticket-${t.id}`,b:'human',label:'reviewed'});}});
        const h=460;
        return svg`<svg viewBox=${`0 0 460 ${h}`} class="evidence-map" role="img" aria-label=${`${points.length} nodes and ${edges.length} observed links`}>
          ${edges.map(e=>{const a=find(e.a)!,b=find(e.b)!;return svg`<line x1=${a.x} y1=${a.y} x2=${b.x} y2=${b.y} class="evidence-edge"/>`;})}
          ${points.map(p=>svg`<g class=${`evidence-node ${p.kind}`}><title>${p.label}</title>${p.kind==='policy'||p.kind==='note'?svg`<rect x=${p.x-8} y=${p.y-8} width="16" height="16" rx="2"/>`:p.kind==='ticket'?svg`<rect x=${p.x-8} y=${p.y-8} width="16" height="16" transform=${`rotate(45 ${p.x} ${p.y})`}/>`:svg`<circle cx=${p.x} cy=${p.y} r="9"/>`}<text x=${p.x+12} y=${p.y+3}>${p.label}</text></g>`)}
        </svg>`;
      })()}<div class="graph-legend">◆ ticket · ● QM member · ■ GBrain memory · ◉ test operator<br/>Lines: QM assignment, cited memory, or test review write; no inferred links.</div></section>`:nothing}
      <div class="memory-column">
      ${memoryLink && memoryReceipt ? html`<section class="memory-evidence" aria-label="Team memory">
        <span class="memory-kicker">GBRAIN · SHARED KNOWLEDGE</span><h2>Team memory</h2>
        <p class="memory-intro">Invented demo rules stored and read back from local GBrain.</p>
        <ul class="memory-policies">${(memoryReceipt.facts ?? []).map((fact)=>html`<li><span>${fact.topic === "review" ? "LOCAL DEMO NOTE" : fact.topic === "approval" ? "DEMO REVIEW RULE" : "DEMO WORKFLOW"}</span><p>${fact.fact.replace(/^(Synthetic support (policy|workflow)|Demo policy): /, "")}</p></li>`)}</ul>
        <small>Exact ID, text and source readback from local GBrain.</small>
      </section>` : nothing}
      </div>
      </div>
      <div class="swarm-status-strip" aria-label="QM swarm status"><span>QM SWARM</span><strong>${inspect.peers.length} members</strong><span>${signals!.queued} queued · ${signals!.failed} failed</span>${nonReply ? html`<span class="status-attention">Refund demo waiting ${nonReply.seconds}s</span>` : nothing}<span>Local snapshot · no model-health inference</span></div>
      <section class="swarm-timeline" aria-label="Swarm activity"><h2>Activity <small>QM messages and delivery events</small></h2>
        ${events.filter((e) => e.kind !== "member").length ? events.filter((e) => e.kind !== "member").map((event) => event.kind === "message"
          ? html`<article class="swarm-activity"><span class="swarm-dot"></span><div><div class="swarm-activity-top"><strong>${event.author === "human" ? "Human" : "Agent"} ${inspect!.peers.findIndex((m) => m.id === event.memberId) + 1 || "?"}</strong><time>${new Date(event.at).toLocaleTimeString()}</time></div><p>${revealPrivateText ? event.text : "Details hidden"}</p><small>#${event.seq} · to ${event.audience.length} member${event.audience.length === 1 ? "" : "s"}${event.replyTo ? html` · replies to #${messages.find((m) => m.id === event.replyTo)?.seq ?? "earlier message"}` : nothing}</small></div></article>`
          : html`<article class="swarm-activity notification"><span class="swarm-dot"></span><div><strong>Member ${inspect!.peers.findIndex((m) => m.id === event.memberId) + 1 || "?"}</strong> notification ${event.state} for #${event.messageSeq}${event.runId ? html` · run ${revealPrivateText ? html`<code>${event.runId}</code>` : "recorded"}` : nothing}</div></article>`)
          : html`<p class="swarm-empty">No swarm messages yet. Member state is above.</p>`}
      </section>
      <p class="swarm-disclaimer">Demo data. Local test actor, not the user. Local deterministic draft adapter. Built today on QM + GBrain. No customer sends or refunds. Member states are snapshots; the feed shows up to 256 messages.</p>
    ` : html`<div class="swarm-empty">${busy ? "Loading…" : "Enter a session ID to inspect its swarm."}</div>`}
  `, host);
}

async function poll(version: number): Promise<void> {
  if (version !== generation || appState.currentView !== "swarms" || !sessionId) return;
  busy = true;
  draw();
  try {
    const state = await api<SwarmInspection>(`/api/sessions/${encodeURIComponent(sessionId)}/swarm`);
    // Re-read a bounded window from the start: QM may update notification state
    // on an existing message without issuing a new sequence number.
    let cursor = 0;
    let page: SwarmMessageView[] = [];
    let latest: SwarmMessageView[] = [];
    for (let i = 0; i < 8; i++) {
      const feed = await api<{ messages: SwarmMessageView[] }>(`/api/sessions/${encodeURIComponent(sessionId)}/swarm?read=1&after=${cursor}`);
      page = feed.messages;
      latest = mergeMessages(latest, page);
      if (page.length < 32) break;
      cursor = page.at(-1)!.seq;
    }
    if (version !== generation) return;
    inspect = state;
    if (selectedMember && !state.peers.some((m) => m.id === selectedMember)) selectedMember = "";
    messages = latest;
    error = "";
  } catch (e) {
    if (version !== generation) return;
    error = revealPrivateText ? `Could not inspect this swarm: ${errMessage(e)}` : "Could not inspect this swarm. Check access and session ID.";
  } finally {
    if (version === generation) {
      busy = false;
      draw();
      timer = setTimeout(() => void poll(version), 3_000);
    }
  }
}

function load(id: string): void {
  stop();
  sessionId = id;
  inspect = null;
  messages = [];
  selectedMember = "";
  error = "";
  void poll(generation);
}

export function renderSwarmView(): void {
  stop();
  draw();
  if (sessionId) void poll(generation);
}
