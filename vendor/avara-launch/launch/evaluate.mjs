import {readFileSync} from 'node:fs';
export const launchRules=JSON.parse(readFileSync(new URL('./rules.json',import.meta.url)));
const result=(status,reason,evidence=[])=>({status,reason,evidence});
const skip=reason=>result('not-run',reason);
const na=reason=>result('not-applicable',reason);
const measured=(hits,sample,why)=>hits.length?result('needs-review',why,hits):result('observed','Checked the recorded sample',sample);
const en=lang=>/^en(?:-|$)/i.test(lang??'');
function words(value) { return String(value).normalize('NFKC').toLowerCase().match(/[\p{L}\p{N}]+/gu)??[] }
function contains(text,phrase) {
  const term=words(phrase).join(' ');
  return term && (' '+words(text).join(' ')+' ').includes(' '+term+' ');
}
const checks={
  'button-name':({axe})=>{
    if(!axe) return skip('No axe result supplied for this viewport');
    for(const [key,status] of [['violations','analyzer-finding'],['incomplete','needs-review'],['passes','observed'],['inapplicable','not-applicable']]){
      const hit=axe[key]?.find(x=>x.id==='button-name');
      if(!hit) continue;
      const evidence=(hit.nodes??[]).map(n=>({target:n.target})).filter(n=>n.target?.length);
      if(status!=='not-applicable'&&!evidence.length) return skip('Analyzer returned no element evidence');
      return result(status,'axe button-name: '+key,evidence);
    }
    return skip('No button-name record in this axe run');
  },
  'lcp-image':({lcpCandidate:c})=>{
    if(!c || !c.tag || !Number.isFinite(c.candidateMs))return skip('No buffered LCP candidate with element evidence');
    if(c.tag!=='img') return na('The sampled candidate is not an image element');
    return measured(c.loading?.toLowerCase()==='lazy'?[c]:[],[c],'The sampled LCP image uses lazy loading');
  },
  'font-role':({capture:c,brief:b})=>{
    if(!c || !b?.headingFonts?.length)return skip('Requires heading capture and an approved font list');
    if(!c.headings.length)return na('No visible heading in scope');
    const approved=b.headingFonts.map(x=>x.toLowerCase().trim());
    return measured(c.headings.filter(x=>!approved.includes(x.font.toLowerCase())),c.headings,'The first declared font family differs from the approved list');
  },
  voice:({capture:c,brief:b})=>{
    if(!c || !b?.avoidPhrases?.length || !b.locale)return skip('Requires copy and an owner-supplied vocabulary and locale');
    const text=c.copy.filter(x=>x.language===b.locale.toLowerCase());
    if(!text.length)return skip('No sampled copy matched the brief locale');
    const hits=text.flatMap(x=>b.avoidPhrases.filter(p=>contains(x.text,p)).map(phrase=>({...x,phrase})));
    return measured(hits,[{sampled:text.length}],'Owner-flagged wording appears in sampled copy');
  },
  recovery:({capture:c},p)=>{
    if(!c)return skip('Missing message capture');
    const messages=c.errors.filter(x=>en(x.language));
    if(!messages.length)return na('No visible English error message in scope');
    return measured(messages.filter(x=>p.phrases.some(word=>contains(x.text,word))),[{sampled:messages.length}],'Review the quoted wording in this error message');
  },
  cta:({capture:c},p)=>{
    if(!c?.goalMapped || !c.actions.length)return skip('No visible mapped goal action');
    const actions=c.actions.filter(x=>en(x.language)&&x.text);
    if(!actions.length)return skip('Requires an English visible action label');
    return measured(actions.filter(x=>p.labels.includes(words(x.text).join(' '))),actions,'Check whether the action label explains the next step in context');
  },
  'action-hit':({capture:c},p)=>{
    if(!c)return skip('No action capture');
    if(c.viewport[0]>p.maxWidth)return na('Phone viewport required');
    if(!c.goalMapped || !c.actions.length)return skip('No visible instance of the mapped action');
    const accessible=c.actions.filter(x=>x.accessiblePoints>0);
    if(accessible.length)return result('observed','A mapped instance receives pointer hits',accessible);
    if(c.actions.some(x=>x.points!==9))return skip('An action is outside the sample area or only partially sampled');
    return result('needs-review','No sampled point on the mapped action received a pointer hit',c.actions);
  }
};
export function evaluateLaunch(input={}) {
  return launchRules.map(rule=>({...rule,...checks[rule.detectorId.slice(7)](input,rule.parameters)}));
}
