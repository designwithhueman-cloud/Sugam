import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluateLaunch,launchRules} from './evaluate.mjs';
import {reviewSnapshot,inspectPage} from '../scanner.mjs';
const action={selector:'#join',text:'Join now',points:9,accessiblePoints:9,language:'en'};
const capture={viewport:[320,800],headings:[{selector:'h1',font:'Arial'}],errors:[],actions:[action],copy:[],goalMapped:true};
const row=(id,data)=>evaluateLaunch(data).find(x=>x.detectorId==='launch/'+id);
test('all rules skip without capture',()=>assert.ok(evaluateLaunch().every(x=>x.status==='not-run')));
test('no model or score required',()=>assert.ok(reviewSnapshot().every(x=>x.weight===0 && x.scoreEligible===false)));
for(const [key,expected] of Object.entries({violations:'analyzer-finding',passes:'observed',incomplete:'needs-review',inapplicable:'not-applicable'})){
  test('axe '+key,()=>assert.equal(row('button-name',{axe:{[key]:[{id:'button-name',nodes:[{target:['#submit']}]}]}}).status,expected));
}
test('empty axe result is unknown',()=>assert.equal(row('button-name',{axe:{violations:[]}}).status,'not-run'));
test('LCP candidate identity required',()=>{
  for(const [tag,loading,expected] of [['div','lazy','not-applicable'],['img','eager','observed'],['img','lazy','needs-review']])
    assert.equal(row('lcp-image',{lcpCandidate:{tag,loading,candidateMs:3100}}).status,expected);
});
test('font uses supplied brief',()=>{
  for(const [fonts,expected] of [[[],'not-run'],[['Arial'],'observed'],[['Inter'],'needs-review']])
    assert.equal(row('font-role',{capture,brief:{headingFonts:fonts}}).status,expected);
});
test('tone respects phrase boundaries and locale',()=>{
  const brief={locale:'en',avoidPhrases:['next gen']};
  for(const [text,language,state] of [['Next-gen service','en','needs-review'],['Next generation','en','observed'],['Next gen','fr','not-run']])
    assert.equal(row('voice',{brief,capture:{...capture,copy:[{text,language,selector:'h1'}]}}).status,state);
});
test('error wording needs visible mapped English error',()=>{
  for(const [text,language,state] of [['You failed to pay','en','needs-review'],['Enter your email','en','observed'],['You failed to pay','de','not-applicable']])
    assert.equal(row('recovery',{capture:{...capture,errors:[{text,language}]}}).status,state);
});
test('CTA gets exact label evidence',()=>{
  for(const [text,state] of [['Click here','needs-review'],['Book a demo','observed']])
    assert.equal(row('cta',{capture:{...capture,actions:[{...action,text}]}}).status,state);
});
test('mobile equivalent, fully sampled covered CTA, and partially visible CTA',()=>{
  const hiddenBehind={...action,accessiblePoints:0};
  for(const [actions,state] of [[[hiddenBehind,action],'observed'],[[hiddenBehind],'needs-review'],[[{...hiddenBehind,points:4}],'not-run'],[[],'not-run']])
    assert.equal(row('action-hit',{capture:{...capture,actions}}).status,state);
});
test('automatic partial inventory cannot trigger grid warning',()=>{
  const snapshot={viewport:[320,800],sections:Array(3).fill({kind:'features',cards:4})};
  const grid=complete=>reviewSnapshot({snapshot,designComplete:complete}).find(x=>x.ruleId==='DIFF-009');
  assert.equal(grid(false).status,'not-run');assert.equal(grid(true).status,'needs-review');
});
test('self references and incomplete reference inventories excluded',()=>{
  const snapshot={viewport:[320,800],pageType:'marketing',sections:['hero','features','pricing'].map(kind=>({kind,layout:'stack'}))};
  const ref={id:'r',pageId:'r',origin:'owned',rights:'owned',version:1,snapshot};
  const compare=(pageId,designComplete)=>reviewSnapshot({snapshot,designComplete:true,referencePageId:pageId,refs:[{...ref,designComplete}]}).find(x=>x.ruleId==='DIFF-001');
  assert.equal(compare('r',true).status,'not-run');assert.equal(compare('other',false).status,'not-run');assert.equal(compare('other',true).status,'observed');
});
test('broken browser capture preserves independent analyzer evidence',async()=>{
  const result=await inspectPage({evaluate:async()=>{throw Error('unavailable')}},{axe:{passes:[{id:'button-name',nodes:[{target:['#ok']}]}]}});
  assert.equal(result.rows.length,9+launchRules.length);assert.ok(result.diagnostics.length);
  assert.equal(result.rows.find(x=>x.ruleId==='A11Y-003').status,'observed');
});
import {describeLayoutPattern} from './pattern.mjs';
test('named template summary requires both signals and excludes conventional grids alone',()=>{
  const snapshot={viewport:[320,800],pageType:'marketing',sections:['hero','features','features','pricing'].map((kind,i)=>({kind,cards:3,layout:'grid',selector:'#s'+i}))};
  const ref={snapshot,pageId:'studio',id:'Studio fixture',rights:'owned',origin:'fixture',version:1,designComplete:true};
  const run=refs=>describeLayoutPattern(reviewSnapshot({snapshot,designComplete:true,referencePageId:'another-page',refs}));
  assert.equal(run([]),null);
  assert.deepEqual(run([ref]).evidence.sections,['#s1','#s2']);
  assert.equal(run([ref]).weight,0);
});
