/** Clearly synthetic UI stress preview. Never mix these records with QM's API data. */
import { html, svg, render } from "lit";
import { deliverySignals, type SwarmInspection, type SwarmMessageView } from "./swarm-events.ts";

const CLUSTERS = 12;
const WORKERS = 99;
type State = "ready" | "reserved" | "failed";
const peers: SwarmInspection["peers"] = [{ id: "synthetic-root", state: "ready", depth: 0 }];
const feed: SwarmMessageView[] = [];
for (let cluster = 0; cluster < CLUSTERS; cluster++) {
  const leader = `synthetic-lead-${cluster}`;
  peers.push({ id: leader, parentId: "synthetic-root", depth: 1, state: "ready" });
  for (let index = 0; index < WORKERS - (cluster === CLUSTERS - 1 ? 1 : 0); index++) {
    const id = `synthetic-${cluster}-${index}`;
    const state: State = cluster === 7 && index % 5 === 0 ? "failed" : index % 19 === 0 ? "reserved" : "ready";
    peers.push({ id, parentId: leader, depth: 2, state });
    if (index % 13 === 0) {
      feed.push({ id: `synthetic-msg-${cluster}-${index}`, seq: feed.length + 1,
        senderId: leader, author: "agent", audience: [id], text: "Synthetic delivery probe",
        createdAt: 0, notifications: { [id]: { state: cluster === 7 ? "failed" : "pending" } } });
    }
  }
}
export const syntheticInspection: SwarmInspection = {
  id: "synthetic-root", self: peers[0]!, peers, expiresAt: 0,
};
export const syntheticMessages = feed;
export const syntheticSignals = deliverySignals(syntheticInspection, syntheticMessages);
export const syntheticClusterStats = Array.from({ length: CLUSTERS }, (_, index) => {
  const members = peers.filter((p) => p.parentId === `synthetic-lead-${index}`);
  const notifications = syntheticSignals.members.filter((m) => m.memberId.startsWith(`synthetic-${index}-`));
  return {
    index, count: members.length, failedMembers: members.filter((p) => p.state === "failed").length,
    reserved: members.filter((p) => p.state === "reserved").length,
    failed: notifications.reduce((sum, m) => sum + m.failed, 0),
    pending: notifications.reduce((sum, m) => sum + m.pending, 0),
  };
}).sort((a, b) => b.failed - a.failed || b.failedMembers - a.failedMembers || b.pending - a.pending);

let zoom = -1;
if (peers.length !== 1200) throw new Error("synthetic scale count mismatch");
export function renderSyntheticScale(host: HTMLElement): void {
  const worst = syntheticClusterStats[0]!;
  const positions = Array.from({ length: CLUSTERS }, (_, index) => {
    const angle = 2 * Math.PI * index / CLUSTERS - Math.PI / 2;
    return { x: 450 + Math.cos(angle) * 260, y: 310 + Math.sin(angle) * 235 };
  });
  const chosen = zoom < 0 ? null : syntheticClusterStats.find((s) => s.index === zoom)!;
  render(html`<section class="scale-preview">
    <div class="scale-badge">SYNTHETIC SCALE PREVIEW · 1,200 generated members · NOT a QM swarm or live agent run</div>
    <h2>Orchestrator view <small>Generated hierarchy and delivery states</small></h2>
    <p>${CLUSTERS} generated sub-orchestrators, 98-99 generated workers each. This tests display mechanics only. QM currently caps a swarm at 64 members.</p>
    <div class="scale-alert"><strong>Where to look next:</strong> Cluster ${worst.index + 1} has ${worst.failed} failed delivery signals and ${worst.failedMembers} failed members. Synthetic priority, not a real critical path.</div>
    ${svg`<svg class="scale-map" viewBox="0 0 900 620" role="img" aria-label="Synthetic orchestrator hierarchy, twelve clusters">
      ${positions.map((point) => svg`<path d=${`M 450 310 L ${point.x} ${point.y}`} stroke="#44546f" stroke-width="2"/>`)}
      <circle cx="450" cy="310" r="43" fill="#103b3b" stroke="#4de0b2" stroke-width="3"/><text x="450" y="315" text-anchor="middle" fill="white" font-size="17">ROOT</text>
      ${positions.map((point, index) => {
        const data = syntheticClusterStats.find((s) => s.index === index)!;
        return svg`<g class="scale-cluster ${data.failed ? "is-alert" : ""} ${zoom === index ? "is-selected" : ""}" role="button" tabindex="0"
          aria-label=${`Zoom into synthetic cluster ${index + 1}, ${data.failed} failed, ${data.pending} pending`}
          @click=${() => { zoom = index; renderSyntheticScale(host); }}
          @keydown=${(event: KeyboardEvent) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); zoom = index; renderSyntheticScale(host); } }}>
          <circle cx=${point.x} cy=${point.y} r=${36 + Math.round(data.count / 33)} fill=${data.failed ? "#653237" : "#103b3b"} stroke=${zoom === index ? "#fff" : data.failed ? "#fa8b93" : "#4de0b2"} stroke-width="3"/>
          <text x=${point.x} y=${point.y + 5} fill="white" text-anchor="middle" font-size="16">${index + 1}</text>
        </g>`;
      })}
    </svg>`}
    ${chosen ? html`<div class="scale-detail"><button @click=${() => { zoom = -1; renderSyntheticScale(host); }}>Back to all clusters</button>
      <h3>Cluster ${chosen.index + 1}: ${chosen.count} generated workers</h3>
      <p>${chosen.failedMembers} failed members · ${chosen.reserved} reserved · ${chosen.failed} failed notifications · ${chosen.pending} pending</p>
      <canvas id="scale-canvas" width="900" height="188" aria-label="Generated worker status sample"></canvas>
      <small>Canvas shows only generated worker states. It is not the QM member view.</small>
    </div>` : html`<p>Select a cluster to inspect its generated workers and delivery counts.</p>`}
  </section>`, host);
  if (chosen) {
    const ctx = host.querySelector<HTMLCanvasElement>("#scale-canvas")?.getContext("2d");
    if (ctx) for (let index = 0; index < chosen.count; index++) {
      const member = peers.find((p) => p.id === `synthetic-${chosen.index}-${index}`)!;
      ctx.fillStyle = member.state === "failed" ? "#e46b6b" : member.state === "reserved" ? "#e7b75f" : "#51b979";
      ctx.beginPath(); ctx.arc(21 + index % 33 * 26, 24 + Math.floor(index / 33) * 59, 6, 0, Math.PI * 2); ctx.fill();
    }
  }
}
