import {api} from './api.js';
import {esc,icon,list,modal,notify} from './ui.js';
import {requestWithdrawn,requestScope} from './requests.js';

const LIMIT_FILES=20,LIMIT_FILE=10_000_000,LIMIT_TOTAL=50_000_000;
const size=value=>value<1_000_000?`${Math.ceil(value/1000)} KB`:`${(value/1_000_000).toFixed(1)} MB`;
const extension=/\.(pdf|png|jpe?g|txt|csv|docx)$/i;

/** One transaction and version check for all selected originals; no replacement. */
export function openBatchUpload({caseData:c,requestId='',role='client',onComplete,isCurrent=()=>true}){
  if(!document.querySelector('link[data-batch-upload-style]')){const style=document.createElement('link');style.rel='stylesheet';style.href='/shared/upload-batch.css';style.dataset.batchUploadStyle='';document.head.append(style);}
  const request=list(c.requests).find(row=>row.id===requestId);
  if(request&&requestWithdrawn(request)){notify('철회되거나 변경된 요청에는 자료를 추가할 수 없습니다. 현재 요청을 확인해 주세요.','error');return;}
  const title=request?`${request.title} · 자료 제출`:role==='client'?'자료 제출':'사건 자료 추가';
  const expectedVersion=c.version;
  const el=modal(title,`<form id="upload-form" data-batch-upload>
    ${request?`<div class="callout neutral"><div><strong>필요한 기간·범위</strong><p>${esc(requestScope(request)||'요청 안내에 맞는 자료를 선택해 주세요.')}</p></div></div><p class="small muted">기존 제출 자료는 보존됩니다. 새 파일을 추가하면 해당 요청의 검토를 다시 진행합니다.</p>`:`<label class="field"><span>${role==='client'?'어떤 요청에 대한 자료인가요?':'연결할 요청'}</span><select name="request_id"><option value="">별도 참고 자료</option>${list(c.requests).filter(row=>!requestWithdrawn(row)).map(row=>`<option value="${esc(row.id)}">${esc(row.title)}${row.status==='fulfilled'?' · 추가 제출 가능':''}</option>`).join('')}</select></label>`}
    <label class="batch-upload-zone">${icon('upload')}<strong>여러 파일을 한 번에 선택해 주세요.</strong><span>PDF·이미지·TXT·CSV·DOCX · 최대 20개</span><input name="files" type="file" multiple accept=".pdf,.png,.jpg,.jpeg,.txt,.csv,.docx" required></label>
    <p class="small muted">파일마다 10 MB, 한 번에 총 50 MB까지 제출할 수 있습니다. 원본의 모든 페이지와 글자가 잘 보이는지 확인해 주세요.</p>
    <div data-batch-summary class="batch-summary" role="status" aria-live="polite">파일을 선택하면 목록이 표시됩니다.</div>
    <ul data-batch-files class="batch-file-list" aria-label="선택한 제출 파일"></ul>
    <div data-batch-progress class="batch-upload-progress" role="status" aria-live="polite" hidden><span class="spinner"></span><div><strong>자료를 한 번에 접수하고 있습니다.</strong><p>전송과 원문 추출이 끝날 때까지 기다려 주세요. 중복 제출은 잠시 막아 두었습니다.</p></div></div>
    <div id="upload-error" role="alert" class="batch-error"></div>
    <div class="form-footer"><button class="button secondary" type="button" data-batch-close>닫기</button><button class="button" type="submit">${icon('upload')} 선택한 자료 제출</button></div>
  </form>`);
  const form=el.querySelector('form'),input=form.querySelector('[name="files"]'),summary=form.querySelector('[data-batch-summary]'),error=form.querySelector('#upload-error'),progress=form.querySelector('[data-batch-progress]'),submit=form.querySelector('[type="submit"]');
  let busy=false,selected=[],done=false,reloadRequired=false;
  function renderFiles(status='선택됨',kind='pending',completedCase=null){
    form.querySelector('[data-batch-files]').innerHTML=selected.map((file,index)=>{
      const doc=completedCase&&list(completedCase.documents).findLast(row=>row.filename===file.name||row.name===file.name);
      const state=doc?.extraction_state?.status;
      const detail=completedCase?state==='completed'?'접수 완료 · 추출 완료':state==='failed'?'접수 완료 · 추출 재확인':'접수 완료 · 원문 확인 중':status;
      return `<li class="batch-file ${kind}" data-batch-file><span class="batch-file-icon">${icon(kind==='success'?'check':'file')}</span><div><strong>${esc(file.name)}</strong><small>${size(file.size)}</small></div><span class="batch-file-status">${kind==='running'?'<span class="spinner"></span>':''}${esc(detail)}</span>${!busy&&!done?`<button type="button" class="icon-button" data-remove-file="${index}" aria-label="${esc(file.name)} 선택 취소">${icon('close')}</button>`:''}</li>`;
    }).join('');
  }
  function validation(){if(!selected.length)return '제출할 파일을 선택해 주세요.';if(selected.length>LIMIT_FILES)return '한 번에 최대 20개까지 제출할 수 있습니다. 파일을 나누어 선택해 주세요.';if(selected.some(file=>file.size>LIMIT_FILE))return '10 MB를 넘는 파일이 있습니다. 파일 크기를 줄인 뒤 다시 선택해 주세요.';if(selected.reduce((total,file)=>total+file.size,0)>LIMIT_TOTAL)return '선택한 파일의 합계가 50 MB를 넘습니다. 나누어 제출해 주세요.';if(selected.some(file=>!extension.test(file.name)))return 'PDF, 이미지, TXT, CSV, DOCX 파일만 제출할 수 있습니다.';return '';}
  function updateSelection(){if(reloadRequired)return;const total=selected.reduce((n,file)=>n+file.size,0);summary.textContent=`${selected.length}개 선택 · 합계 ${size(total)}`;error.textContent=selected.length?validation():'';renderFiles();submit.disabled=!selected.length||Boolean(validation());}
  input.onchange=()=>{if(reloadRequired)return;selected=Array.from(input.files||[]);done=false;updateSelection();};
  form.addEventListener('click',event=>{const remove=event.target.closest('[data-remove-file]');if(remove&&!busy){selected.splice(Number(remove.dataset.removeFile),1);updateSelection();}if(event.target.closest('[data-batch-close]')&&!busy)el.close();});
  el.addEventListener('cancel',event=>{if(busy)event.preventDefault();});
  // modal's ordinary dismiss controls are disabled only while the atomic call
  // is active. Closing the form must not suggest the upload was cancelled.
  el.addEventListener('click',event=>{if(busy&&event.target===el){event.stopImmediatePropagation();event.preventDefault();}},true);
  form.onsubmit=async event=>{
    event.preventDefault();if(busy||done||reloadRequired)return;const problem=validation();if(problem){error.textContent=problem;return;}
    busy=true;error.textContent='';progress.hidden=false;summary.textContent=`${selected.length}개 파일 처리 중 · 아직 접수 결과를 확인하지 못했습니다.`;
    form.querySelectorAll('input,select,button').forEach(node=>{node.disabled=true;});el.querySelector('[data-close]').disabled=true;renderFiles('일괄 처리 중','running');
    const data=new FormData();for(const file of selected)data.append('files',file,file.name);data.set('expected_version',String(expectedVersion));data.set('request_id',requestId||form.querySelector('[name="request_id"]')?.value||'');
    try{
      const response=await api(`/cases/${encodeURIComponent(c.id)}/documents/batch`,{method:'POST',body:data,signal:AbortSignal.timeout(600000)});
      if(!isCurrent()){el.close();return;}
      const updated=response.case||response;done=true;busy=false;progress.hidden=true;
      summary.textContent=`선택한 ${selected.length}개 파일을 모두 접수했습니다.`;renderFiles('접수 완료','success',updated);
      submit.hidden=true;input.disabled=true;form.querySelector('[data-batch-close]').disabled=false;el.querySelector('[data-close]').disabled=false;
      try{await onComplete?.(updated);}catch{notify('자료는 접수됐습니다. 사건 화면을 새로고침해 확인해 주세요.','error');}
    }catch(failure){
      if(!isCurrent()){el.close();return;}
      busy=false;progress.hidden=true;const ambiguous=!failure.status||failure.status>=500;
      summary.textContent=ambiguous?'접수 결과를 확인하지 못했습니다.':'선택한 파일은 접수되지 않았습니다.';
      renderFiles(ambiguous?'접수 결과 확인 필요':'미접수 · 다시 선택 가능','failed');
      error.textContent=failure.message+(ambiguous?' 중복 제출을 피하려면 먼저 사건을 새로고침하여 접수 여부를 확인해 주세요.':' 오류를 확인한 뒤 다시 제출해 주세요.');
      form.querySelectorAll('input,select,button').forEach(node=>{node.disabled=false;});el.querySelector('[data-close]').disabled=false;
      if(ambiguous||failure.status===409){reloadRequired=true;form.querySelectorAll('input,select,[data-remove-file]').forEach(node=>{node.disabled=true;});submit.disabled=true;error.textContent+=' 최신 사건 상태를 불러온 뒤 제출 창을 다시 열어 주세요.';}
    }
  };
  submit.disabled=true;
  return el;
}
