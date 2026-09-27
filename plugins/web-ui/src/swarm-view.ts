import { html, nothing, render } from "lit";
import { api, withBase } from "./core-bridge";
import { appState } from "./shell-state";
import { normalizeSwarm, mergeMessages, graphLayout, type SwarmInspection, type SwarmMessageView } from "./swarm-events";
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
  const graphHeight = Math.max(120, ...nodes.map((node) => node.y + 55));
  render(html`
    <header class="swarm-head">
      <span class="swarm-eyebrow">QM / LIVE INSPECTOR</span>
      <h1>Swarm View</h1>
      <p>Follow member state, handoffs and notification runs in a session you can access. Read-only; refreshed every 3 seconds while this view is open.</p>
      <label class="swarm-privacy"><input type="checkbox" .checked=${revealPrivateText} @change=${(e: Event) => {
        revealPrivateText = (e.currentTarget as HTMLInputElement).checked;
        draw();
      }} /> Reveal message text and session links (private data)</label>
      <form @submit=${(e: Event) => {
        e.preventDefault();
        const field = (e.currentTarget as HTMLFormElement).querySelector<HTMLInputElement>("input");
        const id = field?.value.trim() ?? "";
        if (!id || id.includes("/")) { error = "Enter a session ID, not a URL."; draw(); return; }
        void load(id);
      }}>
        <label for="swarm-session">QM session ID</label>
        <input id="swarm-session" name="session" .value=${sessionId} placeholder="Paste a session ID" autocomplete="off" />
        <button type="submit">Inspect</button>
      </form>
      ${error ? html`<p class="swarm-error" role="alert">${error}</p>` : nothing}
    </header>
    ${inspect ? html`
      <div class="swarm-summary"><strong>${inspect.peers.length} members</strong><span>${messages.length} messages loaded</span><span>${busy ? "Refreshing…" : "Live refresh"}</span></div>
      <section class="swarm-topology" aria-label="Swarm topology">
        <h2>Topology <small>Parent links and current member state</small></h2>
        <svg viewBox=${`0 0 900 ${graphHeight}`} role="img" aria-label=${`${nodes.length} QM swarm members and parent links`}>
          ${nodes.map((node) => {
            const parent = nodes.find((n) => n.id === node.parentId);
            return parent ? html`<path class="swarm-edge" d=${`M ${parent.x} ${parent.y + 25} L ${node.x} ${node.y - 25}`} />` : nothing;
          })}
          ${nodes.map((node) => html`<g class="swarm-graph-node ${node.state} ${selectedMember === node.id ? "selected" : ""}"
            role="button" tabindex="0" aria-label=${`Inspect member ${inspect!.peers.findIndex((m) => m.id === node.id) + 1}, ${node.state}`}
            @click=${() => { selectedMember = node.id; draw(); }}
            @keydown=${(e: KeyboardEvent) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); selectedMember = node.id; draw(); } }}>
            <circle cx=${node.x} cy=${node.y} r="26" />
            <text x=${node.x} y=${node.y + 5} text-anchor="middle">${inspect!.peers.findIndex((m) => m.id === node.id) + 1}</text>
          </g>`)}
        </svg>
      </section>
      <section aria-label="Swarm members" class="swarm-grid">
        ${inspect.peers.map((member, index) => html`<article class="swarm-member state-${member.state} ${selectedMember === member.id ? "selected" : ""}">
          <button class="swarm-node" type="button" @click=${() => { selectedMember = member.id; draw(); }} aria-label=${`Inspect member ${index + 1}`}>
          <span class="swarm-node-number">${String(index + 1).padStart(2, "0")}</span> View evidence</button>
          <div class="swarm-member-top"><span class="swarm-depth">Depth ${member.depth}</span><span class="swarm-status">${member.state}</span></div>
          <h2>${member.id === inspect!.self.id ? "Root / current member" : `Member ${index + 1}`}</h2>
          ${revealPrivateText ? html`<code title=${member.id}>${member.id}</code>` : nothing}
          ${member.parentId ? html`<p>Has parent member</p>` : nothing}
          ${member.error ? html`<p class="swarm-error">${revealPrivateText ? member.error : "Failure details hidden"}</p>` : nothing}
          ${revealPrivateText && member.sessionId ? html`<a href=${withBase(`/s/${encodeURIComponent(member.sessionId)}`)}>Open session evidence</a>` : nothing}
        </article>`)}
      </section>
      ${selectedMember ? html`<section class="swarm-proof" aria-label="Selected member evidence"><h2>Member evidence</h2>
        <p>QM member state: ${inspect.peers.find((m) => m.id === selectedMember)?.state ?? "Unknown"}.
          ${messages.filter((m) => m.senderId === selectedMember).length} messages sent in the loaded feed;
          ${messages.filter((m) => Object.hasOwn(m.notifications, selectedMember)).length} notification records.
        </p><p>A member session link is available above when private details are revealed and QM supplies a session ID. This is a read-only evidence link, not a generated proof pack.</p>
      </section>` : nothing}
      <section class="swarm-timeline" aria-label="Swarm activity"><h2>Activity <small>QM source data</small></h2>
        ${events.filter((e) => e.kind !== "member").length ? events.filter((e) => e.kind !== "member").map((event) => event.kind === "message"
          ? html`<article class="swarm-activity"><span class="swarm-dot"></span><div><div class="swarm-activity-top"><strong>${event.author === "human" ? "Human" : "Agent"} ${inspect!.peers.findIndex((m) => m.id === event.memberId) + 1 || "?"}</strong><time>${new Date(event.at).toLocaleTimeString()}</time></div><p>${revealPrivateText ? event.text : "Message text hidden for demo privacy"}</p><small>#${event.seq} · to ${event.audience.length} member${event.audience.length === 1 ? "" : "s"}${event.replyTo ? " · reply" : ""}</small></div></article>`
          : html`<article class="swarm-activity notification"><span class="swarm-dot"></span><div><strong>Member ${inspect!.peers.findIndex((m) => m.id === event.memberId) + 1 || "?"}</strong> notification ${event.state} for #${event.messageSeq}${event.runId ? html` · run ${revealPrivateText ? html`<code>${event.runId}</code>` : "recorded"}` : nothing}</div></article>`)
          : html`<p class="swarm-empty">No swarm messages yet. Member state is above.</p>`}
      </section>
      <p class="swarm-disclaimer">Member state is a current snapshot, not a timestamped state history. The message feed is bounded to 256 messages per refresh; later messages may be omitted.</p>
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
    error = `Could not inspect this swarm: ${errMessage(e)}`;
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
