/** A fixture-owned timer, not a QM run-health or generalized stuck-agent detector. */
export interface StallReceipt {source:"local fixture dispatch timer";memberId:string;dispatchedAt:number;thresholdMs:number;elapsedMs:number;hasReply:boolean}
export function measuredNonReply(receipt: StallReceipt|null, memberIds:readonly string[]):{memberId:string;seconds:number;thresholdSeconds:number}|null {
 if(!receipt||receipt.source!=="local fixture dispatch timer"||receipt.hasReply||!memberIds.includes(receipt.memberId))return null;
 if(!Number.isFinite(receipt.elapsedMs)||!Number.isFinite(receipt.thresholdMs)||receipt.thresholdMs<1000||receipt.elapsedMs<receipt.thresholdMs)return null;
 return {memberId:receipt.memberId,seconds:Math.floor(receipt.elapsedMs/1000),thresholdSeconds:Math.ceil(receipt.thresholdMs/1000)};
}
