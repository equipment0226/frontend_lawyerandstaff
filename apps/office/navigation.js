const views=new Set(['cases','case','registry','knowledge','agent','system']);
const tabs=new Set(['overview','consultation','verify','issues','calculate','court_forms','bundles','corrections','messages']);
const key='officeNavigation';
let serial=0;
const uid=()=>`${Date.now().toString(36)}-${++serial}`;

// History stores navigation only, never a copy of a customer's case or form values.
export function officeRoute(input={}){
  const view=views.has(input.view)?input.view:input.caseId?'case':'cases';
  const caseId=['case','agent'].includes(view)?String(input.caseId||''):'';
  return {view:view==='case'&&!caseId?'cases':view,caseId,tab:tabs.has(input.tab)?input.tab:'overview',
    query:String(input.query||''),filter:String(input.filter||'all'),offset:Math.max(0,Math.floor((Number(input.offset)||0)/25)*25),
    legalQuery:String(input.legalQuery||''),legalTarget:input.legalTarget==='prec'?'prec':'law',
    knowledgeTab:input.knowledgeTab==='rules'?'rules':'sources',knowledgeQuery:String(input.knowledgeQuery||''),knowledgeCourt:String(input.knowledgeCourt||''),
    detailKind:view==='case'?String(input.detailKind||''):'',detailId:view==='case'?String(input.detailId||''):''};
}
function fromURL(){
  const p=new URLSearchParams(location.search),view=p.get('view')||(p.get('case')?'case':'cases');
  return officeRoute({view,caseId:p.get('case'),tab:p.get('tab'),query:p.get('q'),filter:p.get('filter'),offset:(Math.max(1,Number(p.get('page'))||1)-1)*25,
    legalQuery:p.get('legal_q'),legalTarget:p.get('legal_type'),knowledgeTab:p.get('section'),knowledgeQuery:p.get('knowledge_q'),knowledgeCourt:p.get('court'),detailKind:p.get('detail'),detailId:p.get('item')});
}
function routeURL(route){
  const url=new URL(location.href);
  for(const name of ['view','case','tab','q','filter','page','legal_q','legal_type','section','knowledge_q','court','detail','item'])url.searchParams.delete(name);
  url.searchParams.set('view',route.view);
  if(route.caseId){url.searchParams.set('case',route.caseId);if(route.view==='case')url.searchParams.set('tab',route.tab);}
  if(route.detailKind){url.searchParams.set('detail',route.detailKind);if(route.detailId)url.searchParams.set('item',route.detailId);}
  if(route.view==='cases'){
    if(route.query)url.searchParams.set('q',route.query);
    if(route.filter!=='all')url.searchParams.set('filter',route.filter);
    if(route.offset)url.searchParams.set('page',String(route.offset/25+1));
  }
  if(route.view==='registry'&&route.legalQuery){url.searchParams.set('legal_q',route.legalQuery);url.searchParams.set('legal_type',route.legalTarget);}
  if(route.view==='knowledge'){
    if(route.knowledgeTab!=='sources')url.searchParams.set('section',route.knowledgeTab);
    if(route.knowledgeQuery)url.searchParams.set('knowledge_q',route.knowledgeQuery);
    if(route.knowledgeCourt)url.searchParams.set('court',route.knowledgeCourt);
  }
  return url;
}
const pageDetails=()=>Array.from(document.querySelectorAll('main details')).filter(node=>!node.closest('dialog'));
const details=()=>pageDetails().map((node,index)=>node.open?index:null).filter(index=>index!==null);
export function createOfficeNavigation({getRoute,apply,enabled}){
  let active=null,started=false,restoring=false,epoch=0,scrollTimer;
  const valid=()=>started&&enabled();
  const save=()=>{
    if(!valid()||restoring||history.state?.[key]?.id!==active)return;
    const entry={...history.state[key],route:officeRoute(getRoute()),scroll:{x:window.scrollX,y:window.scrollY},details:details()};
    history.replaceState({...history.state,[key]:entry},'',routeURL(entry.route));
  };
  async function activate(entry){
    active=entry.id;restoring=true;const turn=++epoch;
    try{await apply(entry.route,turn);}finally{
      if(turn!==epoch)return;
      await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
      if(turn!==epoch)return;
      const opened=new Set(entry.details||[]);
      pageDetails().forEach((node,index)=>{node.open=opened.has(index);});
      window.scrollTo({left:entry.scroll?.x||0,top:entry.scroll?.y||0,behavior:'instant'});
      restoring=false;
    }
  }
  async function navigate(patch,{replace=false,keepScroll=false}={}){
    if(!valid())return;
    const route=officeRoute({...getRoute(),...patch});
    if(!replace&&JSON.stringify(route)===JSON.stringify(officeRoute(getRoute())))return;
    save();const before={replaceCurrent:false};window.dispatchEvent(new CustomEvent('office:before-navigate',{detail:before}));
    const previous=officeRoute(getRoute()),detailEntry=Boolean(route.detailKind&&!previous.detailKind&&previous.caseId===route.caseId&&previous.tab===route.tab);
    const entry={id:uid(),route,detailEntry,scroll:keepScroll?{x:window.scrollX,y:window.scrollY}:{x:0,y:0},details:keepScroll?details():[]};
    history[replace||before.replaceCurrent?'replaceState':'pushState']({...history.state,[key]:entry},'',routeURL(route));
    await activate(entry);
  }
  async function start(){
    started=true;
    // URL is authoritative for direct links; history adds list preferences on return.
    const saved=history.state?.[key],route=officeRoute({...saved?.route,...fromURL()});
    const sameSavedPage=saved&&['view','caseId','tab','detailKind','detailId'].every(name=>saved.route?.[name]===route[name]);
    const entry={id:saved?.id||uid(),route,detailEntry:Boolean(sameSavedPage&&saved.detailEntry),scroll:saved?.scroll||{x:0,y:0},details:saved?.details||[]};
    history.scrollRestoration='manual';history.replaceState({...history.state,[key]:entry},'',routeURL(route));
    await activate(entry);
  }
  window.addEventListener('popstate',event=>{
    if(!valid()||event.debtoffDialogHandled)return;
    const entry=history.state?.[key]||{id:uid(),route:fromURL(),scroll:{x:0,y:0},details:[]};
    if(entry.id===active)return; // A nested dialog entry belongs to the same page.
    void activate(entry);
  });
  window.addEventListener('scroll',()=>{clearTimeout(scrollTimer);scrollTimer=setTimeout(save,120);},{passive:true});
  window.addEventListener('pagehide',save);
  return {start,navigate,remember:save,current:()=>epoch,isCurrent:turn=>turn===epoch,closeDetail:()=>history.state?.[key]?.detailEntry?history.back():navigate({detailKind:'',detailId:''},{replace:true,keepScroll:true}),stop:()=>{started=false;epoch++;}};
}
