// A dialog is one step above its page. Only an opaque token and scroll
// coordinates enter browser history; document/form contents remain in the DOM.
// React's bundle and the plain JS screens share this one browser-owned instance.
const instanceKey=Symbol.for('debtoff.dialogHistory');
const marker='debtoffDialog';

function createController(){
  let active=null,sequence=0;
  const clean=state=>{const next={...(state||{})};delete next[marker];return next;};
  const samePage=(record,event)=>location.href===record.url&&
    (!record.parent.officeNavigation?.id||event.state?.officeNavigation?.id===record.parent.officeNavigation.id)&&
    (!record.parent.portal?.id||event.state?.portal?.id===record.parent.portal.id);
  function dismiss(record){
    record.silent=true;
    if(record.element.open)record.close();
    record.element.remove();
    if(active===record)active=null;
  }
  function replaceActive(){
    const record=active;
    if(!record)return null;
    dismiss(record);
    return history.state?.[marker]?.id===record.id?record:null;
  }
  function beforeNavigate(event){
    const record=active;
    if(!record)return;
    const current=history.state?.[marker]?.id===record.id;
    dismiss(record);
    if(current){
      history.replaceState(clean(history.state),'',location.href);
      if(event.detail)event.detail.replaceCurrent=true;
    }
  }
  window.addEventListener('office:before-navigate',beforeNavigate);
  window.addEventListener('portal:before-navigate',beforeNavigate);
  window.addEventListener('session-expired',()=>{
    if(active)dismiss(active);
    if(history.state?.[marker])history.replaceState(clean(history.state),'',location.href);
  });
  window.addEventListener('popstate',event=>{
    const record=active;
    if(record&&event.state?.[marker]?.id!==record.id){
      const unchanged=samePage(record,event);
      dismiss(record);
      if(unchanged){
        event.debtoffDialogHandled=true;
        requestAnimationFrame(()=>window.scrollTo({left:record.scroll.x,top:record.scroll.y,behavior:'instant'}));
      }
    }
    // An old editing/upload dialog is never replayed after it has closed or a
    // session has reloaded. Its page remains addressable without repeating work.
    if(event.state?.[marker]&&(!active||active.id!==event.state[marker].id)){
      history.replaceState(clean(history.state),'',location.href);
    }
  },true);
  function track(element,replaced,scroll){
    const parent=replaced?.parent||clean(history.state),id=`dialog-${Date.now()}-${++sequence}`;
    const record={id,element,parent,url:location.href,scroll:replaced?.scroll||scroll,silent:false,
      close:element.close.bind(element)};
    active=record;
    const next={...history.state,[marker]:{id}};
    history[replaced?'replaceState':'pushState'](next,'',location.href);
    // Keep native cancel semantics: an in-flight upload can prevent Escape.
    // A browser-initiated native close still consumes its history entry.
    const returnToPage=()=>queueMicrotask(()=>{
        if(!record.silent&&!record.returning&&active===record&&history.state?.[marker]?.id===id){record.returning=true;history.back();}
    });
    element.close=(...args)=>{
      record.close(...args);
      // A close followed immediately by a link navigation must not later take
      // the browser back from its new destination. Navigation consumes this step.
      returnToPage();
    };
    element.addEventListener('close',returnToPage);
  }
  return {replaceActive,track};
}

const controller=window[instanceKey]||(window[instanceKey]=createController());
export function prepareDialogHistory(){return controller.replaceActive();}
export function trackDialogHistory(element,replaced,scroll){controller.track(element,replaced,scroll);}
