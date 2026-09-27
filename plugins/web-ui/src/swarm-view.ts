import { html, svg, nothing, render } from "lit";
import { api, withBase } from "./core-bridge";
import { appState } from "./shell-state";
import { normalizeSwarm, mergeMessages, graphLayout, deliverySignals, type SwarmInspection, type SwarmMessageView } from "./swarm-events";
import { verifiedMemoryLink, type MemoryReceipt } from "./swarm-memory-evidence";
import { groupVerifiedFacts, type LearnedFact, type MemoryTree } from "./swarm-memory-hierarchy";
import { measuredNonReply, type StallReceipt } from "./swarm-stall-evidence";
import { renderSyntheticScale } from "./swarm-scale-preview";
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
let showSynthetic = false;
let memoryReceipt: MemoryReceipt | null = null;
let stallReceipt: StallReceipt | null = null;
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
      <span class="swarm-eyebrow">QM / LIVE INSPECTOR</span>
      <h1>Swarm View</h1>


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
      <button class="scale-toggle" type="button" @click=${() => { showSynthetic = !showSynthetic; draw(); }}>${showSynthetic ? "Hide synthetic scale preview" : "Open synthetic 1,200-member scale preview"}</button>
      ${error ? html`<p class="swarm-error" role="alert">${error}</p>` : nothing}
    </header>
    ${showSynthetic ? html`<div id="scale-host"></div>` : nothing}
    ${inspect ? html`
      <div class="swarm-summary"><span class="swarm-live-dot"></span><strong>QM SESSION LIVE</strong><span>${inspect.peers.length} agents</span><span>${messages.length} messages</span><span>${busy ? "Refreshing…" : "Refreshes every 3s"}</span></div>
      <section class="swarm-mission" aria-label="Swarm mission control">
        <div class="mission-meta"><span>LIVE TOPOLOGY</span><span>${inspect.peers.length} AGENTS · ${signals!.queued} QUEUED · ${signals!.failed} FAILED</span></div>
        ${fixtureHumanMessage ? html`<div class="human-fixture-badge"><span class="human-avatar">H</span><div><strong>HUMAN MESSAGE / FIXTURE-SENT</strong><small>Synthetic refund draft approved in QM #${fixtureHumanMessage.seq}. Not Ryan and no real refund.</small></div></div>` : nothing}
        ${nonReply ? html`<div class="mission-alert stalled"><strong>FOLLOW-UP NEEDS ATTENTION</strong><span>Worker ${inspect.peers.findIndex((m)=>m.id===nonReply.memberId)+1}: no reply for ${nonReply.seconds}s (threshold ${nonReply.thresholdSeconds}s)</span><small>Measured local fixture dispatch, not a QM run-health signal</small></div>` : signals!.failed || signals!.pending || signals!.failedMembers || signals!.reserved ? html`<div class="mission-alert"><strong>WHERE TO LOOK NEXT</strong><span>${signals!.failed} failed · ${signals!.pending} pending deliveries · ${signals!.failedMembers} failed agents</span><small>Delivery signals only, not a critical path</small></div>` : html`<div class="mission-alert quiet"><strong>NO FAILED DELIVERY SIGNALS</strong><span>${signals!.queued} queued, not yet confirmed complete</span></div>`}
        ${selectedMember ? html`<aside class="mission-drawer" aria-label="Selected member evidence">
          <button class="drawer-close" @click=${() => { selectedMember=""; draw(); }} aria-label="Close evidence">×</button>
          <span class="drawer-eyebrow">MEMBER EVIDENCE / ${inspect.peers.findIndex((m) => m.id === selectedMember)+1}</span>
          <h2>${selectedMember === inspect!.self.id ? "Orchestrator" : `Worker ${inspect.peers.findIndex((m) => m.id === selectedMember)+1}`}</h2>
          <p>State: ${inspect.peers.find((m) => m.id === selectedMember)?.state ?? "Unknown"}</p>
          <p>${messages.filter((m) => m.senderId === selectedMember).length} messages sent; ${messages.filter((m) => Object.hasOwn(m.notifications,selectedMember)).length} notifications in loaded feed.</p>
          <p>Read-only evidence, not a generated proof pack.</p>
          ${revealPrivateText && inspect.peers.find((m) => m.id === selectedMember)?.sessionId ? html`<a href=${withBase(`/s/${encodeURIComponent(inspect.peers.find((m)=>m.id===selectedMember)!.sessionId!)}`)}>Open member session</a>` : nothing}
        </aside>` : nothing}
        ${svg`<svg class="mission-graph" viewBox=${`0 0 900 ${Math.max(500, graphHeight + 145)}`} role="img" aria-label=${`${nodes.length} QM swarm members and parent links`}>
          <defs><radialGradient id="mission-glow"><stop stop-color="#315479" stop-opacity=".24"/><stop offset="1" stop-color="#101928" stop-opacity="0"/></radialGradient></defs>
          <circle cx="450" cy="235" r="370" fill="url(#mission-glow)"/>
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
        <div class="mission-legend"><span><i class="ready"></i>READY</span><span><i class="reserved"></i>RESERVED</span><span><i class="failed"></i>FAILED</span><span>STATE IS A SNAPSHOT · PARTICLES REPLAY LOADED MESSAGES</span>${memoryLink ? html`<span><i class="memory"></i>VERIFIED LOCAL MEMORY RECALL</span>` : nothing}</div>
      </section>
      ${memoryLink && memoryReceipt ? html`<section class="memory-evidence" aria-label="GBrain memory evidence">
        <span class="memory-kicker">GBRAIN / LOCAL PGLITE · VERIFIED READBACK</span>
        <h2>What this swarm learned</h2>
        <div class="memory-hierarchy"><strong>Information-gain grouping prototype</strong><ul>${renderMemoryTree(groupVerifiedFacts(memoryReceipt.facts?.map((fact):LearnedFact=>({id:fact.id,topic:fact.topic,tags:fact.tags,source:fact.source,text:fact.fact})) ?? [{id:memoryLink.factId,topic:"unclassified",tags:[],source:memoryReceipt.provenance!,text:memoryReceipt.fact!}]))}</ul><small>${memoryReceipt.facts && memoryReceipt.facts.length > 1 ? "Groups use source-reviewed topic labels and tags, not inferred hidden content." : "One verified recall, so no topic split is justified. Future splits require multiple source-labeled facts and tags."}</small></div>
        <p>Worker ${inspect.peers.findIndex((m)=>m.id===memoryLink.from)+1} wrote ${memoryReceipt.facts?.length ?? 1} source-bound fact${memoryReceipt.facts?.length===1?"":"s"}; worker ${inspect.peers.findIndex((m)=>m.id===memoryLink.to)+1} recalled ${memoryReceipt.facts?.length ?? 1} exact fact${memoryReceipt.facts?.length===1?"":"s"} before replying.</p>
        <p class="memory-fact">${revealPrivateText ? memoryReceipt.fact : "Fact text hidden for demo privacy"}</p>
        <small>Source: ${revealPrivateText ? memoryReceipt.provenance : "local, source-bound GBrain receipt"}. This receipt comes from the local demo, not the QM inspect API. No hosted or Aside integration is implied.</small>
      </section>` : nothing}
      <section class="swarm-timeline" aria-label="Swarm activity"><h2>Support queue signal log <small>Four synthetic tickets · QM source messages, no customer sends</small></h2>
        ${events.filter((e) => e.kind !== "member").length ? events.filter((e) => e.kind !== "member").map((event) => event.kind === "message"
          ? html`<article class="swarm-activity"><span class="swarm-dot"></span><div><div class="swarm-activity-top"><strong>${event.author === "human" ? "Human" : "Agent"} ${inspect!.peers.findIndex((m) => m.id === event.memberId) + 1 || "?"}</strong><time>${new Date(event.at).toLocaleTimeString()}</time></div><p>${revealPrivateText ? event.text : "Message text hidden for demo privacy"}</p><small>#${event.seq} · to ${event.audience.length} member${event.audience.length === 1 ? "" : "s"}${event.replyTo ? html` · replies to #${messages.find((m) => m.id === event.replyTo)?.seq ?? "earlier message"}` : nothing}</small></div></article>`
          : html`<article class="swarm-activity notification"><span class="swarm-dot"></span><div><strong>Member ${inspect!.peers.findIndex((m) => m.id === event.memberId) + 1 || "?"}</strong> notification ${event.state} for #${event.messageSeq}${event.runId ? html` · run ${revealPrivateText ? html`<code>${event.runId}</code>` : "recorded"}` : nothing}</div></article>`)
          : html`<p class="swarm-empty">No swarm messages yet. Member state is above.</p>`}
      </section>
      <p class="swarm-disclaimer">Member state is a current snapshot, not a timestamped state history. The message feed is bounded to 256 messages per refresh; later messages may be omitted.</p>
    ` : html`<div class="swarm-empty">${busy ? "Loading…" : "Enter a session ID to inspect its swarm."}</div>`}
  `, host);
  if (showSynthetic) { const scaleHost = host.querySelector<HTMLElement>("#scale-host"); if (scaleHost) renderSyntheticScale(scaleHost); }
}

function renderMemoryTree(tree: MemoryTree): ReturnType<typeof html> {
  if (tree.kind === "leaf") return html`<li>${tree.facts.length} verified recalled fact${tree.facts.length===1?"":"s"}${tree.facts.length===1?html` · #${tree.facts[0]!.id}`:nothing}</li>`;
  return html`<li>${tree.tag} <small>(information gain ${tree.gain.toFixed(2)} bits)</small><ul><li>matches<ul>${renderMemoryTree(tree.matches)}</ul></li><li>other<ul>${renderMemoryTree(tree.other)}</ul></li></ul></li>`;
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
