import {api} from '/shared/api.js';
import {esc,icon,modal} from '/shared/ui.js';

// The stored PDF is fetched with the current session and never sent to a viewer
// service. Only a temporary, local blob URL enters the browser's PDF renderer.
export function previewCourtDocument(caseData,document){
  const title=document.title||document.template_title||document.preview?.template?.title||'사건 작성 문서';
  const path=`/cases/${encodeURIComponent(caseData.id)}/court-documents/${encodeURIComponent(document.id)}/download`;
  const dialog=modal(`${title} · 미리보기`,`<div class="court-preview-toolbar"><div><strong>${esc(title)}</strong><p>${document.stale?'이전 작성본입니다. 현재 자료를 반영한 문서인지 확인해 주세요.':'저장된 작성본의 모든 쪽과 별지를 확인합니다.'}${document.version?' · '+esc(document.version)+'차 작성':''}</p></div><button class="button secondary small" data-action="legal-download-court-form" data-id="${esc(document.id)}" disabled>${icon('download')} PDF 내려받기</button></div><div class="court-preview-content" data-court-preview aria-busy="true"></div><p class="court-preview-note">뷰어의 쪽 이동·확대 기능으로 확인하세요. 표시되지 않는 브라우저에서는 PDF를 내려받아 열 수 있습니다.</p>`);
  dialog.classList.add('court-preview-dialog');
  const pane=dialog.querySelector('[data-court-preview]'),download=dialog.querySelector('[data-action="legal-download-court-form"]');
  let request=null,objectURL=null,disposed=false;
  const clearURL=()=>{if(objectURL){URL.revokeObjectURL(objectURL);objectURL=null;}};
  const dispose=()=>{if(disposed)return;disposed=true;request?.abort();clearURL();observer.disconnect();};
  const observer=new MutationObserver(()=>{if(!dialog.isConnected)dispose();});
  observer.observe(window.document.body,{childList:true});
  dialog.addEventListener('close',dispose,{once:true});
  async function load(){
    request?.abort();clearURL();request=new AbortController();const attempt=request;
    download.disabled=true;pane.setAttribute('aria-busy','true');
    pane.innerHTML='<div class="court-preview-status" role="status"><span class="spinner" aria-hidden="true"></span><strong>작성본을 불러오고 있습니다.</strong></div>';
    try{
      const blob=await api(path,{download:true,signal:AbortSignal.any([attempt.signal,AbortSignal.timeout(120000)])});
      if(disposed||attempt.signal.aborted||!dialog.isConnected)return;
      if(blob.type.split(';',1)[0]!=='application/pdf'||await blob.slice(0,5).text()!=='%PDF-')throw new Error('invalid-pdf');
      if(disposed||attempt.signal.aborted||!dialog.isConnected)return;
      objectURL=URL.createObjectURL(new Blob([blob],{type:'application/pdf'}));
      const frame=window.document.createElement('iframe');
      frame.title=`${title} PDF 미리보기`;frame.referrerPolicy='no-referrer';
      frame.src=objectURL+'#toolbar=1&navpanes=1&view=FitH';
      pane.replaceChildren(frame);pane.setAttribute('aria-busy','false');download.disabled=false;
    }catch(error){
      if(disposed||attempt.signal.aborted||!dialog.isConnected)return;
      const message=error.status===401?'로그인이 만료되었습니다. 다시 로그인한 뒤 작성본을 열어 주세요.':error.status===403?'이 작성본을 열람할 권한이 없습니다. 담당 사건과 로그인 계정을 확인해 주세요.':error.status===404?'작성본 파일을 찾을 수 없습니다. 창을 닫고 목록을 새로고침해 주세요.':error.message==='invalid-pdf'?'작성본을 PDF로 확인할 수 없습니다. 목록을 새로고침하거나 담당자에게 확인해 주세요.':'작성본을 불러오지 못했습니다. 연결을 확인한 뒤 다시 시도해 주세요.';
      pane.setAttribute('aria-busy','false');
      pane.innerHTML=`<div class="court-preview-status" role="alert"><strong>${esc(message)}</strong>${![401,403].includes(error.status)?'<button class="button secondary small" data-preview-retry>다시 불러오기</button>':''}</div>`;
      pane.querySelector('[data-preview-retry]')?.addEventListener('click',load);
    }
  }
  void load();
  return dialog;
}
