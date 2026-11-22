// Read-only capture on Avara's already-open Playwright page.
export function captureLaunch(options = {}) {
  function visible(el) {
    const r = el.getBoundingClientRect();
    return el.checkVisibility({checkOpacity:true, checkVisibilityCSS:true}) && r.width>0 && r.height>0 &&
      r.right>0 && r.left<innerWidth;
  }
  const all = (root, query) => query ? [...root.querySelectorAll(query)].filter(visible) : [];
  function locator(el) {
    if (el.id && document.querySelectorAll('#'+CSS.escape(el.id)).length===1) return '#'+CSS.escape(el.id);
    const parts=[];
    for(let node=el;node?.parentElement;node=node.parentElement) {
      const n=[...node.parentElement.children].indexOf(node)+1;
      parts.unshift(node.localName+':nth-child('+n+')');
      if(node.parentElement===document.documentElement) break;
    }
    return parts.join(' > ');
  }
  const excerpt = el => (el.innerText??'').trim().replace(/\s+/g,' ').slice(0,180);
  const main=document.querySelector('main,[role=main]')??document.body;
  const language=document.documentElement.lang.toLowerCase();
  const english=/^en(?:-|$)/.test(language);
  const sections=all(main,'section,[role=region]').filter(el=>!el.parentElement.closest('section,[role=region]') || !main.contains(el.parentElement.closest('section,[role=region]')));
  const entries=sections.map(el=>{
    const heading=all(el,'h1,h2,h3')[0], label=heading?excerpt(heading):'';
    let kind='unknown';
    if(heading?.matches('h1')) kind='hero';
    else if(english) {
      for(const [name,phrases] of Object.entries(options.sectionWords??{})){
        if(phrases.some(word=>(' '+label.toLowerCase().replace(/[^a-z0-9]+/g,' ')+' ').includes(' '+word+' '))) {kind=name;break;}
      }
    }
    // Component markup is evidence of a card only inside a measured grid/flex row.
    const groups=[el,...all(el,'div,ul,ol')].filter(parent=>{
      const s=getComputedStyle(parent);
      return s.display.includes('grid') || (s.display.includes('flex') && s.flexDirection.startsWith('row'));
    }).map(parent=>[...parent.children].filter(child=>visible(child) && child.matches(options.cardSelector)));
    const grid=groups.sort((a,b)=>b.length-a.length)[0]??[];
    return {kind,selector:locator(el),cardSelector:grid.map(locator).join(',') || undefined};
  });
  // Only claim structural coverage for a simple, fully recognized main landmark.
  const direct=[...main.children].filter(el=>visible(el)&&!['SCRIPT','STYLE','TEMPLATE'].includes(el.tagName));
  const recognizedInventory=main!==document.body && sections.length>0 &&
    direct.length===sections.length && direct.every(el=>sections.includes(el)) &&
    entries.every(entry=>entry.kind!=='unknown');
  const headings=all(main,options.headingSelector??'h1').map(el=>({selector:locator(el),font:getComputedStyle(el).fontFamily.split(',')[0].trim().replace(/^["']|["']$/g,'')}));
  const copy=all(main,'h1,h2,h3,p,[role=alert]').filter(el=>!el.closest('blockquote,q,pre,code,textarea,[contenteditable=true]') && !el.querySelector('q,code,blockquote')).map(el=>({selector:locator(el),text:excerpt(el),language:(el.closest('[lang]')?.lang??language).toLowerCase()})).filter(x=>x.text);
  const actions=all(document,options.goalSelector).map(el=>{
    const r=el.getBoundingClientRect();
    let points=0, accessiblePoints=0;
    for(const u of [.25,.5,.75]) for(const v of [.25,.5,.75]){
      const x=r.left+r.width*u, y=r.top+r.height*v;
      if(x<0||x>=innerWidth||y<0||y>=innerHeight) continue;
      points++;
      const target=document.elementFromPoint(x,y);
      if(target && el.contains(target)) accessiblePoints++;
    }
    return {selector:locator(el),text:excerpt(el),points,accessiblePoints,language:(el.closest('[lang]')?.lang??language).toLowerCase()};
  });
  const linked=new Set(all(document,'[aria-invalid="true"]').flatMap(el=>(el.getAttribute('aria-errormessage')??'').split(/\s+/)).filter(Boolean).map(id=>document.getElementById(id)).filter(el=>el&&visible(el)));
  const errors=[...new Set([...linked,...all(document,options.errorSelector)])].map(el=>({selector:locator(el),text:excerpt(el),language:(el.closest('[lang]')?.lang??language).toLowerCase()}));
  return {viewport:[innerWidth,innerHeight],language,entries,recognizedInventory,headings,copy,actions,errors,
    goalMapped:Boolean(options.goalSelector)};
}

// A buffered observer reports an LCP candidate from this document when available.
// Never compare its timing directly with a separate Lighthouse navigation.
export async function captureLcpCandidate() {
  if(!globalThis.PerformanceObserver?.supportedEntryTypes?.includes('largest-contentful-paint')) return null;
  return new Promise(resolve=>{
    let observer;
    const finish=value=>{clearTimeout(timer);observer?.disconnect();resolve(value)};
    const timer=setTimeout(()=>finish(null),100);
    observer=new PerformanceObserver(list=>{
      const entry=list.getEntries().at(-1);
      const el=entry?.element;
      finish(el?{tag:el.localName,loading:el.getAttribute('loading'),candidateMs:Math.round(entry.startTime)}:null);
    });
    observer.observe({type:'largest-contentful-paint',buffered:true});
  });
}
