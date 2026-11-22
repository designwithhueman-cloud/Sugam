import {readFileSync} from 'node:fs';
import {compareHero} from './hero/detector.mjs';
const read = file => JSON.parse(readFileSync(new URL(file,import.meta.url)));
const rules = read('./rules.json');
const note = (status, reason, evidence=[]) => ({status,reason,evidence});
const skip = reason => note('not-run',reason);
const observed = (reason,evidence) => note('observed',reason,evidence);
const review = (reason,evidence) => note('needs-review',reason,evidence);

// Longest common subsequence preserves order and accounts for insertions.
function sequenceMatch(left,right) {
  let previous = Array(right.length+1).fill(0);
  for (const item of left) {
    const next = [0];
    right.forEach((value,i) => next.push(item===value ? previous[i]+1 : Math.max(previous[i+1],next[i])));
    previous=next;
  }
  return previous.at(-1);
}
function compare(snapshot, refs, p, mode) {
  const matches=[];
  for (const ref of refs) {
    const other=ref.snapshot;
    if (!ref.id || !ref.version || !ref.rights || !ref.origin || !other ||
      !snapshot.pageType || other.pageType!==snapshot.pageType ||
      !other.viewport?.every((v,i)=>v===snapshot.viewport[i]) || other.viewport.length!==2) continue;
    let matched, total, detail;
    if (mode==='tokens') {
      const roles=Object.keys(snapshot.tokens??{}).filter(role=>other.tokens?.[role]);
      if (roles.length<p.minimum) continue;
      detail=roles.map(role=>({role,page:snapshot.tokens[role],reference:other.tokens[role]}));
      matched=detail.filter(x=>JSON.stringify(x.page)===JSON.stringify(x.reference)).length;
      total=roles.length;
    } else {
      const keys=s=>(s.sections??[]).map(x=>mode==='dashboard'?x.kind+'|'+x.layout:x.kind);
      const a=keys(snapshot), b=keys(other);
      if (Math.min(a.length,b.length)<p.minimum) continue;
      matched=sequenceMatch(a,b); total=Math.max(a.length,b.length); detail={page:a,reference:b};
    }
    matches.push({reference:ref.id,version:ref.version,matched,total,detail});
  }
  matches.sort((a,b)=>b.matched/b.total-a.matched/a.total || a.reference.localeCompare(b.reference));
  if (!matches.length) return skip('No comparable documented reference');
  const best=matches[0];
  const referenceMatch=best.matched/best.total>=p.threshold;
  return {...observed(referenceMatch?'Similar to this reference':'Below the configured similarity threshold',[best]),referenceMatch};
}
const checks={
  template:(s,r,p)=>compare(s,r,p,'sequence'),
  hero:(s,r)=>{
    const result=compareHero(s.hero,r.filter(x=>x.version && x.snapshot?.pageType===s.pageType && s.pageType && x.snapshot.hero).map(x=>({...x.snapshot.hero,...{id:x.id+'@'+x.version,rights:x.rights,origin:x.origin}})));
    return result.candidates?observed('Hero geometry comparison',result.candidates.slice(0,1)):skip(result.reason);
  },
  brand:s=>note('needs-person','Test unaided recall with intended visitors',s.brandCues??[]),
  dashboard:(s,r,p)=>s.pageType==='dashboard'?compare(s,r,p,'dashboard'):
    s.pageType?note('not-applicable','Page classified as '+s.pageType):skip('Page type missing'),
  layout:(s,r,p)=>{
    if ((s.sections?.length??0)<p.minimum) return skip('Too few mapped sections');
    const groups=Object.groupBy(s.sections,x=>x.layout);
    const largest=Object.values(groups).sort((a,b)=>b.length-a.length)[0];
    return observed('Most frequent mapped layout occurs in '+largest.length+' of '+s.sections.length+' sections',largest);
  },
  system:(s,r,p)=>compare(s,r,p,'tokens'),
  hierarchy:(s,r,p)=>{
    if(s.goals?.length!==1 || !s.alternatives?.length) return skip('Requires one visible mapped goal and a comparable alternative');
    const goal=s.goals[0];
    const alternatives=s.alternatives.filter(a=>a.selector!==goal.selector && a.y<goal.bottom && a.bottom>goal.y);
    if(!alternatives.length) return skip('No comparable action on the same row');
    const larger=alternatives.filter(a=>a.width*a.height>=p.ratio*goal.width*goal.height);
    return larger.length?review('Another action on this row occupies more space',[goal,...larger]):observed('Compared action areas',[goal,...alternatives]);
  },
  trust:(s,r,p)=>{
    if(!s.claims?.length || !s.proofMapped) return skip('Requires a mapped claim and supporting-evidence selector');
    const pairs=s.claims.map(claim=>{
      const nearest=(s.proof??[]).map(proof=>({proof,gap:Math.max(0,proof.y-claim.bottom,claim.y-proof.bottom)})).sort((a,b)=>a.gap-b.gap)[0];
      return {claim,nearest:nearest??null};
    });
    const distant=pairs.filter(x=>!x.nearest || x.nearest.gap>s.viewport[1]*p.viewportGap);
    return distant.length?review('Check whether the mapped claim has supporting evidence nearby',distant):observed('Mapped supporting element is nearby',pairs);
  },
  grids:(s,r,p)=>{
    if(!s.sections?.length) return skip('Section inventory missing');
    const grids=s.sections.filter(x=>x.kind==='features' && x.cards>=p.minimumCards);
    return grids.length>=p.minimumSections && grids.length/s.sections.length>=p.share?
      review('Repeated feature-card sections occupy a large share of the mapped page',grids):
      observed('Feature-card inventory',[{grids:grids.length,sections:s.sections.length}]);
  }
};
export function evaluate(snapshot, references=[]) {
  const valid=Array.isArray(snapshot?.viewport) && snapshot.viewport.length===2 && snapshot.viewport.every(v=>Number.isInteger(v)&&v>0);
  return rules.map(rule=>({ruleId:rule.ruleId,version:rule.version,scoreEligible:false,weight:0,
    ...(!valid?skip('Missing viewport capture'):checks[rule.method](snapshot,references,rule.parameters))}));
}
