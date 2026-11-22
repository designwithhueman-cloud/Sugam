import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {chromium} from 'playwright';
import {inspectPage} from '../scanner.mjs';
const html=readFileSync(new URL('./page.html',import.meta.url),'utf8');
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined});
try{
  for (const width of [1280,320]) for(const flags of [false,true]){
    const page=await browser.newPage({viewport:{width,height:800}});
    await page.setContent(html);
    if(flags)await page.evaluate(()=>{
      document.body.classList.add('flags');document.querySelector('#book').textContent='Click here';
      document.querySelector('#error').textContent='You failed to set a date.';
      document.querySelector('#more h2').textContent='More features';
    });
    const result=await inspectPage(page,{pageId:'fixture',completeSections:true,errorSelector:'#error',
      brief:{headingFonts:['Arial'],locale:'en',avoidPhrases:['unbeatable']},
      mapping:{goal:'.action',pageType:'marketing',sections:[
        {kind:'hero',selector:'#hero'},{kind:'features',selector:'#features',cardSelector:'.card'},
        {kind:flags?'features':'pricing',selector:'#more',cardSelector:'[data-slot=card]'}]}});
    assert.deepEqual(result.diagnostics,[]);
    const state=id=>result.rows.find(x=>x.ruleId===id).status;
    for(const id of ['DIFF-009','UX-017','CONV-001'])assert.equal(state(id),flags?'needs-review':'observed');
    assert.equal(state('MOB-013'),width===1280?'not-applicable':flags?'needs-review':'observed');
    await page.close();
  }
  console.log('Passed desktop and phone capture on triggering and clean pages');
}finally{await browser.close()}
