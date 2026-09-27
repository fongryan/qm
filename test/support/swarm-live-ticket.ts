/** Local demo worker port. The model returns only a draft, never sends or refunds. */
export interface LiveTicket {id:string;customer:string;subject:string;detail:string}
export interface TeamPolicy {id:string;fact:string;source:string}
export interface Draft {text:string;policyId:string;needsReview:boolean;model:string}
export interface DraftModel {draft(ticket:LiveTicket,policies:readonly TeamPolicy[]):Promise<Draft>}
export function validateTicket(input:LiveTicket):LiveTicket {
 for (const key of ["id","customer","subject","detail"] as const){
  if (typeof input[key]!=="string" || !input[key].trim() || input[key].length> (key==="detail"?1200:120)) throw new Error(`Invalid ${key}`);
 }
 return input;
}
export function validateDraft(result:Draft,policies:readonly TeamPolicy[]):Draft {
 if (!result.text?.trim() || result.text.length>1800) throw new Error("Invalid draft");
 if (!policies.some((p)=>p.id===result.policyId)) throw new Error("Draft cites no verified team policy");
 if (typeof result.needsReview!=="boolean" || !result.model) throw new Error("Incomplete model result");
 return result;
}
