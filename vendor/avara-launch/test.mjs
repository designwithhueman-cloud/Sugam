import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluate} from './engine.mjs';
const sections=['hero','features','features','pricing'].map((kind,i)=>({kind,layout:'stack',cards:kind==='features'?3:0,y:i*100}));
const viewport=[1280,800];
const hero={viewport,features:{headingX:.2,headingY:.1,actionX:.2,actionY:.6,visualX:.8,visualY:.4,visualWidth:.3,visualHeight:.7}};
const box={y:10,bottom:40,width:100,height:30};
const s={viewport,pageType:'dashboard',sections,hero,tokens:{title:['fontA'],card:['styleX'],button:['styleY']},brandCues:[],goals:[{...box,selector:'#go'}],alternatives:[{...box,width:200,selector:'#other'}],claims:[box],proofMapped:true,proof:[]};
const ref={id:'fixture',origin:'authored fixture',rights:'owned',version:'1',snapshot:s};
const get=(id,page=s,refs=[ref])=>evaluate(page,refs).find(x=>x.ruleId===id);
test('missing capture and policy',()=>{const rows=evaluate(null);assert.equal(new Set(rows.map(x=>x.ruleId)).size,9);assert.ok(rows.every(x=>x.status==='not-run'&&!x.scoreEligible&&x.weight===0))});
for(const [id,mode] of [['DIFF-001','sequence'],['DIFF-002','hero'],['DIFF-004','dashboard'],['DIFF-006','tokens']]){
 test(mode+' comparable reference',()=>assert.equal(get(id).status,'observed'));
 test(mode+' missing and wrong viewport',()=>{assert.equal(get(id,s,[]).status,'not-run');assert.equal(get(id,{...s,viewport:[320,800],hero:{...hero,viewport:[320,800]}}).status,'not-run')});
}
test('same colors with different section order',()=>assert.match(get('DIFF-001',{...s,sections:[...sections].reverse()}).reason,/Below/));
test('dashboard scope',()=>assert.equal(get('DIFF-004',{...s,pageType:'marketing'}).status,'not-applicable'));
test('brand cues require human recall',()=>assert.equal(get('DIFF-003').status,'needs-person'));
test('layout inventory and insufficient sample',()=>{assert.equal(get('DIFF-005').evidence.length,4);assert.equal(get('DIFF-005',{...s,sections:[]}).status,'not-run')});
test('hierarchy comparable actions',()=>{assert.equal(get('DIFF-007').status,'needs-review');assert.equal(get('DIFF-007',{...s,alternatives:[{...box,selector:'#small'}]}).status,'observed');assert.equal(get('DIFF-007',{...s,goals:[]}).status,'not-run')});
test('trust near, missing and unmapped',()=>{assert.equal(get('DIFF-008').status,'needs-review');assert.equal(get('DIFF-008',{...s,proof:[box]}).status,'observed');assert.equal(get('DIFF-008',{...s,proofMapped:false}).status,'not-run')});
test('feature grids and pricing look-alike',()=>{assert.equal(get('DIFF-009').status,'needs-review');assert.equal(get('DIFF-009',{...s,sections:sections.map(x=>({...x,kind:'pricing'}))}).status,'observed')});
