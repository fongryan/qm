/** Optional, externally verified memory receipt. QM's inspect/read API has no memory event. */
export interface MemoryReceipt {
  source: "local GBrain PGLite";
  status: "written" | "recalled" | "failed";
  factId?: string;
  fact?: string;
  writer?: string;
  reader?: string;
  provenance?: string;
  note: string;
  facts?: Array<{id:string;fact:string;topic:string;tags:string[];source:string}>;
}
export function verifiedMemoryLink(receipt: MemoryReceipt | null, memberIds: readonly string[]): {from:string;to:string;factId:string}|null {
  if (!receipt || receipt.status !== "recalled" || !receipt.factId || !receipt.fact || !receipt.provenance || !receipt.writer || !receipt.reader) return null;
  if (receipt.writer === receipt.reader || !memberIds.includes(receipt.writer) || !memberIds.includes(receipt.reader)) return null;
  return {from:receipt.writer,to:receipt.reader,factId:receipt.factId};
}
