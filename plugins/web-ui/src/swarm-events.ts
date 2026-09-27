/** Read-only view model for QM's session-bound swarm API. No synthetic run events. */
export interface SwarmMemberView {
  id: string;
  sessionId?: string;
  parentId?: string;
  depth: number;
  state: "reserved" | "ready" | "failed";
  error?: string;
}
export interface SwarmMessageView {
  id: string;
  seq: number;
  senderId: string;
  author: "agent" | "human";
  text: string;
  audience: string[];
  replyTo?: string;
  createdAt: number;
  notifications: Record<string, { state: "pending" | "queued" | "failed"; runId?: string }>;
}
export interface SwarmInspection {
  id: string;
  self: SwarmMemberView;
  peers: SwarmMemberView[];
  expiresAt: number;
}
export type SwarmEvent =
  | { key: string; kind: "member"; memberId: string; parentId?: string; state: SwarmMemberView["state"]; depth: number; error?: string }
  | { key: string; kind: "message"; memberId: string; seq: number; text: string; audience: string[]; at: number; author: SwarmMessageView["author"]; replyTo?: string }
  | { key: string; kind: "notification"; memberId: string; messageSeq: number; state: "pending" | "queued" | "failed"; runId?: string };

/** Produce stable IDs so repeated snapshots can be deduplicated without a false event history. */
export function normalizeSwarm(inspect: SwarmInspection, messages: readonly SwarmMessageView[]): SwarmEvent[] {
  const members: SwarmEvent[] = inspect.peers.map((m) => ({
    key: `member:${m.id}:${m.state}:${m.error ?? ""}`,
    kind: "member",
    memberId: m.id,
    ...(m.parentId ? { parentId: m.parentId } : {}),
    state: m.state,
    depth: m.depth,
    ...(m.error ? { error: m.error } : {}),
  }));
  const ordered = [...messages].sort((a, b) => a.seq - b.seq);
  const activity: SwarmEvent[] = ordered.flatMap((m) => [
    {
      key: `message:${m.seq}`,
      kind: "message" as const,
      memberId: m.senderId,
      seq: m.seq,
      text: m.text,
      audience: m.audience,
      at: m.createdAt,
      author: m.author,
      ...(m.replyTo ? { replyTo: m.replyTo } : {}),
    },
    ...Object.entries(m.notifications).map(([memberId, n]) => ({
      key: `notification:${m.seq}:${memberId}:${n.state}:${n.runId ?? ""}`,
      kind: "notification" as const,
      memberId,
      messageSeq: m.seq,
      state: n.state,
      ...(n.runId ? { runId: n.runId } : {}),
    })),
  ]);
  return [...members, ...activity];
}

export function mergeMessages(old: readonly SwarmMessageView[], next: readonly SwarmMessageView[]): SwarmMessageView[] {
  const bySeq = new Map(old.map((m) => [m.seq, m]));
  for (const m of next) bySeq.set(m.seq, m);
  return [...bySeq.values()].sort((a, b) => a.seq - b.seq);
}

/** Stable, bounded geometry for a small swarm topology. The API's member IDs are never rendered here. */
export function graphLayout(members: readonly SwarmMemberView[], width = 900): Array<{ id: string; x: number; y: number; parentId?: string; state: SwarmMemberView["state"] }> {
  const depths = new Map<number, SwarmMemberView[]>();
  for (const m of members) depths.set(m.depth, [...(depths.get(m.depth) ?? []), m]);
  const levels = [...depths.keys()].sort((a, b) => a - b);
  return levels.flatMap((depth, row) => {
    const siblings = depths.get(depth)!;
    return siblings.map((m, index) => ({
      id: m.id,
      x: width * (index + 1) / (siblings.length + 1),
      y: 55 + row * 112,
      ...(m.parentId ? { parentId: m.parentId } : {}),
      state: m.state,
    }));
  });
}
