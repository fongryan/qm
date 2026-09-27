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
let timer: ReturnType<typeof setTimeout> | null = null;
let generation = 0;
let memoryReceipt: MemoryReceipt | null = null;
let stallReceipt: StallReceipt | null = null;
export interface QueueReceipt {source:"local synthetic ticket fixture";total:number;dispatched:number;drafted:number;pending:number;workerIds:string[];events:Array<{ticket:number;worker:string;messageId:string}>}
let queueReceipt:QueueReceipt|null=null;
interface LiveDemoState {tickets:Array<{id:string;customer:string;subject:string;detail:string;status:string;draft?:string;policyId?:string;needsReview?:boolean}>;busy:boolean;error?:string;model:string}
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
      <div class="swarm-workspace">
      <div class="swarm-sidebar">
      ${memoryLink && memoryReceipt ? html`<section class="memory-evidence" aria-label="Team memory">
        <span class="memory-kicker">GBRAIN · SHARED KNOWLEDGE</span><h2>Team memory</h2>
        <p class="memory-intro">Invented demo policies and a source-linked public Armalo fact, stored and read back from local GBrain.</p>
        <ul class="memory-policies">${(memoryReceipt.facts ?? []).map((fact)=>html`<li><span>${fact.topic === "product" ? "PUBLIC SOURCE" : fact.topic === "review" ? "LOCAL DEMO NOTE" : fact.topic === "approval" ? "DEMO REVIEW RULE" : "DEMO WORKFLOW"}</span><p>${fact.fact.replace(/^(Synthetic support (policy|workflow)|Demo policy): /, "")}</p>${fact.source.startsWith("https://") ? html`<a href=${fact.source.split(" ")[0]} target="_blank" rel="noopener noreferrer">Source: armalo.ai</a>` : nothing}</li>`)}</ul>
        <small>Exact ID, text and source readback from local GBrain.</small>
      </section>` : nothing}
      ${(queueReceipt || liveDemo) ? html`<section class="ticket-inbox" aria-label="Demo ticket inbox"><div class="ticket-inbox-head"><h2>Tickets</h2><span>${liveDemo?.tickets.length ?? queueReceipt?.total} demo cases</span></div><div class="ticket-list">${(liveDemo ? liveDemo.tickets : Array.from({length:Math.min(queueReceipt!.total,24)},(_,i)=>demoTicket(i+1,queueReceipt!.drafted,queueReceipt!.dispatched))).map((ticket)=>html`<article class="ticket-row"><div><strong>${ticket.customer}</strong><span>#${String("number" in ticket ? ticket.number : ticket.id).padStart(3,"0")}</span></div><p>${ticket.subject}</p><small class=${ticket.status === "Waiting on review" || ticket.status === "Awaiting review" ? "status-review" : ticket.status === "Draft ready" ? "status-ready" : "status-progress"}>${ticket.status}</small>${'draft' in ticket && ticket.draft ? html`<p class="ticket-draft">${ticket.draft} <span>Policy #${ticket.policyId}</span></p>`:nothing}${'id' in ticket && ticket.status==='Awaiting review' ? html`<div class="review-controls"><input aria-label="Review note for ticket ${ticket.id}" placeholder="Optional review note" maxlength="240"/><button type="button" @click=${(e:Event)=>{const input=(e.currentTarget as HTMLElement).parentElement!.querySelector('input')!;void reviewLiveTicket(ticket.id,'approve',input.value)}}>Approve draft</button><button type="button" @click=${(e:Event)=>{const input=(e.currentTarget as HTMLElement).parentElement!.querySelector('input')!;void reviewLiveTicket(ticket.id,'deny',input.value)}}>Deny draft</button></div>`:nothing}</article>`)}</div></section>` : nothing}
      </div>
      <section class="swarm-mission" aria-label="Swarm mission control">
        <div class="mission-meta"><span>TEAM ACTIVITY</span><span>${inspect.peers.length} MEMBERS · ${signals!.queued} QUEUED · ${signals!.failed} FAILED</span></div>
        ${fixtureHumanMessage ? html`<div class="human-fixture-badge"><span class="human-avatar">H</span><div><strong>Review recorded</strong><small>Test actor Alice reviewed the demo draft. No refund issued.</small></div></div>` : nothing}
        ${nonReply ? html`<div class="mission-alert stalled"><strong>NEEDS REVIEW</strong><span>Refund for Maya R. is waiting on review, ${nonReply.seconds}s</span><small>No refund has been issued.</small></div>` : signals!.failed || signals!.pending || signals!.failedMembers || signals!.reserved ? html`<div class="mission-alert"><strong>DELIVERY ATTENTION</strong><span>${signals!.failed} failed · ${signals!.pending} pending deliveries · ${signals!.failedMembers} failed agents</span></div>` : html`<div class="mission-alert quiet"><strong>DELIVERIES LOOK CLEAR</strong><span>${signals!.queued} queued, not yet confirmed complete</span></div>`}
        ${selectedMember ? html`<aside class="mission-drawer" aria-label="Selected member evidence">
          <button class="drawer-close" @click=${() => { selectedMember=""; draw(); }} aria-label="Close evidence">×</button>
          <span class="drawer-eyebrow">TEAM MEMBER / ${inspect.peers.findIndex((m) => m.id === selectedMember)+1}</span>
          <h2>${selectedMember === inspect!.self.id ? "Orchestrator" : `Worker ${inspect.peers.findIndex((m) => m.id === selectedMember)+1}`}</h2>
          <p>State: ${inspect.peers.find((m) => m.id === selectedMember)?.state ?? "Unknown"}</p>
          <p>${messages.filter((m) => m.senderId === selectedMember).length} messages sent; ${messages.filter((m) => Object.hasOwn(m.notifications,selectedMember)).length} notifications in loaded feed.</p>
          <p>Read-only activity.</p>
          ${revealPrivateText && inspect.peers.find((m) => m.id === selectedMember)?.sessionId ? html`<a href=${withBase(`/s/${encodeURIComponent(inspect.peers.find((m)=>m.id===selectedMember)!.sessionId!)}`)}>Open member session</a>` : nothing}
        </aside>` : nothing}
        ${svg`<svg class="mission-graph" viewBox=${`0 0 900 ${Math.max(500, graphHeight + 145)}`} role="img" aria-label=${`${nodes.length} QM swarm members and parent links`}>

          ${nodes.map((node) => {
            const parent = nodes.find((n) => n.id === node.parentId);
            return parent ? svg`<path class="mission-link" d=${`M ${parent.x} ${parent.y + 85} L ${node.x} ${node.y + 85}`} />` : nothing;
          })}
          ${memoryLink ? (() => {const from=nodes.find((n)=>n.id===memoryLink.from)!;const to=nodes.find((n)=>n.id===memoryLink.to)!;return svg`<path class="memory-link" d=${`M ${from.x} ${from.y+85} Q 450 -120 ${to.x} ${to.y+85}`} />`;})() : nothing}
          ${nodes.filter((node) => node.parentId && messages.some((m) => m.audience.includes(node.id) || m.senderId === node.id)).map((node) => {
            const parent = nodes.find((n) => n.id === node.parentId)!;
            const path = `M ${parent.x} ${parent.y + 85} L ${node.x} ${node.y + 85}`;
            return svg`<circle class="mission-particle" r="3"><animateMotion dur="4s" begin="${(nodes.indexOf(node)%5)*-.7}s" repeatCount="indefinite" path=${path}/></circle>`;
          })}
          ${nodes.map((node) => {
            const member = inspect!.peers.find((m) => m.id === node.id)!;
            const number = inspect!.peers.indexOf(member) + 1;
            const volume = messages.filter((m) => m.senderId === node.id).length;
            const label = member.id === inspect!.self.id ? "ORCHESTRATOR" : `WORKER ${String(number).padStart(2,"0")}`;
            const trouble = signals!.members.some((m) => m.memberId === node.id);
            return svg`<g class="mission-agent ${node.state} ${trouble || nonReply?.memberId === node.id ? "attention" : ""} ${selectedMember === node.id ? "selected" : ""}"
                role="button" tabindex="0" aria-label=${`${label}, ${node.state}, ${volume} messages`} @click=${() => { selectedMember=node.id; draw(); }}
                @keydown=${(e: KeyboardEvent) => { if(e.key === "Enter" || e.key === " "){e.preventDefault(); selectedMember=node.id; draw();} }}>
              <circle class="agent-aura" cx=${node.x} cy=${node.y + 85} r=${38 + Math.min(14,volume*4)} />
              <circle class="agent-core" cx=${node.x} cy=${node.y + 85} r=${25 + Math.min(9,volume*3)} />
              <text class="agent-number" x=${node.x} y=${node.y + 91} text-anchor="middle">${String(number).padStart(2,"0")}</text>
              <text class="agent-label" x=${node.x} y=${node.y + 141} text-anchor="middle">${label}</text>
              <text class="agent-state" x=${node.x} y=${node.y + 158} text-anchor="middle">${node.state.toUpperCase()} · ${volume} MSG</text>
            </g>`;
          })}
        </svg>`}
        <div class="mission-legend"><span><i class="ready"></i>READY</span><span><i class="reserved"></i>RESERVED</span><span><i class="failed"></i>FAILED</span>${memoryLink ? html`<span><i class="memory"></i>TEAM MEMORY SHARED</span>` : nothing}</div>
      </section>
      </div>
      <section class="swarm-timeline" aria-label="Swarm activity"><h2>Activity <small>QM messages and delivery events</small></h2>
        ${events.filter((e) => e.kind !== "member").length ? events.filter((e) => e.kind !== "member").map((event) => event.kind === "message"
          ? html`<article class="swarm-activity"><span class="swarm-dot"></span><div><div class="swarm-activity-top"><strong>${event.author === "human" ? "Human" : "Agent"} ${inspect!.peers.findIndex((m) => m.id === event.memberId) + 1 || "?"}</strong><time>${new Date(event.at).toLocaleTimeString()}</time></div><p>${revealPrivateText ? event.text : "Details hidden"}</p><small>#${event.seq} · to ${event.audience.length} member${event.audience.length === 1 ? "" : "s"}${event.replyTo ? html` · replies to #${messages.find((m) => m.id === event.replyTo)?.seq ?? "earlier message"}` : nothing}</small></div></article>`
          : html`<article class="swarm-activity notification"><span class="swarm-dot"></span><div><strong>Member ${inspect!.peers.findIndex((m) => m.id === event.memberId) + 1 || "?"}</strong> notification ${event.state} for #${event.messageSeq}${event.runId ? html` · run ${revealPrivateText ? html`<code>${event.runId}</code>` : "recorded"}` : nothing}</div></article>`)
          : html`<p class="swarm-empty">No swarm messages yet. Member state is above.</p>`}
      </section>
      <p class="swarm-disclaimer">Demo data. Local test actor, not an authenticated Ryan account. Scripted workers unless explicitly labeled River. Built today on QM + GBrain. No customer sends or refunds. Member states are snapshots; the feed shows up to 256 messages.</p>
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
