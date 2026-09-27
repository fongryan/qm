/** Source-bound swarm memory, kept separate from the storage engine and model runtime.
 * Callers provide the official GBrain remember/recall transport. No invented recall
 * is accepted: every stored ID, text, and source must be read back independently.
 */
export interface SwarmFinding { fact:string; topic:string; tags:string[] }
export interface StoredFinding extends SwarmFinding { id:string; source:string; writer:string }
export type Group = {kind:'leaf'; facts:StoredFinding[]} | {kind:'split';tag:string;gain:number;matches:Group;other:Group};
export interface SwarmMemoryPort {
 remember(fact:string, entity:string, source:string):{state:string;id?:string|number};
 recall(entity:string):{facts?:Array<{id:string|number;fact:string;source:string}>};
}
export function createSwarmMemory(port:SwarmMemoryPort){
 return {
  write(entity:string,writer:string,source:string,findings:readonly SwarmFinding[]):StoredFinding[]{
   if(!entity||!writer||!source||!findings.length)throw new Error('Entity, writer, source and findings are required');
   return findings.map((f)=>{
    if(!f.fact.trim()||!f.topic.trim())throw new Error('Fact text and topic are required');
    const result=port.remember(f.fact,entity,source);
    if(result.state!=='committed'||result.id==null)throw new Error('GBrain write not committed');
    return {...f,tags:[...f.tags],id:String(result.id),source,writer};
   });
  },
  recall(entity:string,reader:string,written:readonly StoredFinding[]):{facts:StoredFinding[];group:Group}{
   if(!reader||written.some((fact)=>fact.writer===reader))throw new Error('Independent reader required');
   const rows=port.recall(entity).facts??[];
   const verified=written.map((fact)=>{
    if(!rows.some((row)=>String(row.id)===fact.id&&row.fact===fact.fact&&row.source===fact.source))
     throw new Error(`GBrain recall mismatch for #${fact.id}`);
    return {...fact,tags:[...fact.tags]};
   });
   return {facts:verified,group:groupSourceBoundFacts(verified)};
  }
 };
}
function entropy(facts:readonly StoredFinding[]):number{
 const counts=new Map<string,number>();for(const f of facts)counts.set(f.topic,(counts.get(f.topic)??0)+1);
 return [...counts.values()].reduce((sum,n)=>{const p=n/facts.length;return sum-p*Math.log2(p)},0);
}
export function groupSourceBoundFacts(facts:readonly StoredFinding[],depth=0,used:readonly string[]=[]):Group{
 const input=[...facts].sort((a,b)=>a.id.localeCompare(b.id));
 if(input.length<2||depth>=4)return {kind:'leaf',facts:input};
 const parent=entropy(input),tags=[...new Set(input.flatMap((f)=>f.tags))].filter((tag)=>tag&&!used.includes(tag)).sort();
 let best:{tag:string;gain:number;yes:StoredFinding[];no:StoredFinding[]}|null=null;
 for(const tag of tags){
  const yes=input.filter((f)=>f.tags.includes(tag)),no=input.filter((f)=>!f.tags.includes(tag));
  if(!yes.length||!no.length)continue;
  const gain=parent-(yes.length/input.length)*entropy(yes)-(no.length/input.length)*entropy(no);
  if(gain>1e-9&&(!best||gain>best.gain+1e-9))best={tag,gain,yes,no};
 }
 if(!best)return {kind:'leaf',facts:input};
 return {kind:'split',tag:best.tag,gain:best.gain,matches:groupSourceBoundFacts(best.yes,depth+1,[...used,best.tag]),other:groupSourceBoundFacts(best.no,depth+1,[...used,best.tag])};
}
