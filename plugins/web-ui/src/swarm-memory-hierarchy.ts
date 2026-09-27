/** A bounded, deterministic grouping prototype over already verified facts.
 * Topics/tags must come from the caller's source-bound evidence, not inferred
 * from hidden message text or QM's inspect response. No split for one fact.
 */
export interface LearnedFact { id: string; topic: string; tags: string[]; source: string; text: string }
export type MemoryTree = { kind: "leaf"; facts: LearnedFact[] } | {
  kind: "split"; tag: string; gain: number; matches: MemoryTree; other: MemoryTree;
};
function entropy(facts: readonly LearnedFact[]): number {
  const counts = new Map<string,number>();
  for(const fact of facts) counts.set(fact.topic,(counts.get(fact.topic)??0)+1);
  return [...counts.values()].reduce((sum,count)=>{const p=count/facts.length;return sum-p*Math.log2(p)},0);
}
export function groupVerifiedFacts(facts: readonly LearnedFact[], depth=0, used: readonly string[]=[]): MemoryTree {
  const input = [...facts].sort((a,b)=>a.id.localeCompare(b.id));
  if(input.length<2 || depth>=4) return {kind:"leaf",facts:input};
  const parent=entropy(input);
  const tags=[...new Set(input.flatMap((fact)=>fact.tags))].filter((tag)=>tag && !used.includes(tag)).sort();
  let best: {tag:string;gain:number;yes:LearnedFact[];no:LearnedFact[]}|null=null;
  for(const tag of tags){
    const yes=input.filter((fact)=>fact.tags.includes(tag));
    const no=input.filter((fact)=>!fact.tags.includes(tag));
    if(!yes.length||!no.length)continue;
    const gain=parent-(yes.length/input.length)*entropy(yes)-(no.length/input.length)*entropy(no);
    if(gain>1e-9 && (!best||gain>best.gain+1e-9))best={tag,gain,yes,no};
  }
  if(!best)return {kind:"leaf",facts:input};
  return {kind:"split",tag:best.tag,gain:best.gain,
    matches:groupVerifiedFacts(best.yes,depth+1,[...used,best.tag]),
    other:groupVerifiedFacts(best.no,depth+1,[...used,best.tag])};
}
