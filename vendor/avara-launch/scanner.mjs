import {readFileSync} from 'node:fs';
import {capture as captureDesign} from './capture.mjs';
import {captureHero} from './hero/capture.mjs';
import {evaluate} from './engine.mjs';
import {captureLaunch,captureLcpCandidate} from './launch/capture.mjs';
import {describeLayoutPattern} from './launch/pattern.mjs';
import {evaluateLaunch} from './launch/evaluate.mjs';
const load=file=>JSON.parse(readFileSync(new URL(file,import.meta.url)));
const defaults=load('./launch/capture.json');
const designRules=load('./rules.json');
const structureRules=new Set(['DIFF-001','DIFF-004','DIFF-005','DIFF-009']);
function unknown(row,reason){return {...row,status:'not-run',reason,evidence:[]}}
export function reviewSnapshot({snapshot,designComplete=false,referencePageId,refs=[],task,launch={}}={}) {
  // A scan identifier changes on rescan. Use a stable page identity to exclude self.
  const comparable=refs.filter(ref=>referencePageId && ref.pageId && ref.pageId!==referencePageId &&
    ref.id && ref.version && ref.origin && ref.rights && ref.snapshot?.viewport?.length===2 &&
    ref.snapshot.viewport.every((n,i)=>n===snapshot?.viewport?.[i]) &&
    (snapshot?.pageType!=='dashboard' || (task && ref.task===task)));
  const completeRefs=comparable.filter(ref=>ref.designComplete===true);
  const completeRows=completeRefs.length===comparable.length?null:evaluate(snapshot,completeRefs);
  const rows=evaluate(snapshot,comparable).map((row,i)=>{
    const rule=designRules[i];
    const enriched={...row,detectorId:'launch/'+rule.method,sources:rule.guidance,sourceIds:rule.sourceIds,recommendationTemplate:rule.recommendationTemplate};
    if(structureRules.has(row.ruleId) && !designComplete && row.status!=='not-applicable')return unknown(enriched,'Section inventory needs a complete host mapping');
    if(['DIFF-001','DIFF-004'].includes(row.ruleId) && designComplete && snapshot){
      const compared=completeRows?.[i]??row;
      return {...enriched,...compared};
    }
    if(row.ruleId==='DIFF-008' && snapshot?.claims?.length>1)return unknown(enriched,'Map supporting evidence to one claim at a time');
    return enriched;
  });
  return [...rows,...evaluateLaunch(launch)];
}
// Pass an already navigated, settled page. This adapter does not open URLs, click,
// submit forms, start Lighthouse, send content to a model, or write customer data.
export async function inspectPage(page,options={}) {
  const diagnostics=[];
  async function collect(stage,fn){
    try{return await fn()}catch{diagnostics.push({stage,reason:'Capture unsuccessful'});return null}
  }
  const capture=await collect('visible-evidence',()=>page.evaluate(captureLaunch,{
    ...defaults,goalSelector:options.mapping?.goal,headingSelector:options.headingSelector,errorSelector:options.errorSelector
  }));
  const mapping={...options.mapping,sections:options.mapping?.sections??capture?.entries??[]};
  const snapshot=await collect('design',()=>page.evaluate(captureDesign,mapping));
  if(snapshot && options.hero) snapshot.hero=await collect('hero',()=>page.evaluate(captureHero,options.hero));
  const lcpCandidate=await collect('lcp',()=>page.evaluate(captureLcpCandidate));
  const inventoryReady=Array.isArray(options.mapping?.sections)?options.completeSections===true:capture?.recognizedInventory;
  const designComplete=inventoryReady &&
    Boolean(snapshot?.sections.length) && snapshot.sections.every(s=>s.kind && s.kind!=='unknown');
  const rows=reviewSnapshot({snapshot,designComplete,referencePageId:options.pageId,refs:options.references,
    task:options.task,launch:{capture,brief:options.brief,axe:options.axe,lcpCandidate}});
  return {viewport:capture?.viewport??snapshot?.viewport??null,diagnostics,rows,pattern:describeLayoutPattern(rows)};
}
