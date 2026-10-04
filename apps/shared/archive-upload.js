import {api,session} from './api.js';
import {esc,icon,list,modal,notify} from './ui.js';

const stages={queued:'접수 순서 대기',reading:'압축을 풀고 원문을 읽고 있습니다',classifying:'내용에 맞는 요청을 찾고 있습니다',saving:'원본과 분류 결과를 저장하고 있습니다',completed:'자료 접수 완료',failed:'접수 내용을 확인해 주세요'};
const classification={matched:'요청에 연결',unmatched:'담당자 분류 확인',ambiguous:'연결할 요청 확인',identity_review:'서류 명의 확인'};
const amount=value=>Number.isFinite(Number(value))?Math.max(0,Number(value)):0;
const storageKey=c=>`debtoff-archive:${session.user?.id||session.user?.role||'user'}:${c.id}`;
const readJob=key=>{try{return JSON.parse(sessionStorage.getItem(key)||'null');}catch{return null;}};

/** Resumable display of one server-owned atomic ZIP import; raw data stays local. */
export function openArchiveUpload({caseData:c,onComplete,isCurrent=()=>true}){
  if(!document.querySelector('link[data-batch-upload-style]')){const style=document.createElement('link');style.rel='stylesheet';style.href='/shared/upload-batch.css';style.dataset.batchUploadStyle='';document.head.append(style);}
  const key=storageKey(c),base=`/cases/${encodeURIComponent(c.id)}/document-imports`;
  const el=modal('자료 한 번에 넣기',`<form data-archive-upload>
    <p class="archive-intro">ZIP 안의 서류를 읽고, 내용이 맞는 요청에 연결합니다. 파일 이름을 바꾸거나 요청별로 나누지 않아도 됩니다.</p>
    <label class="batch-upload-zone archive-select">${icon('folder')}<strong>서류를 담은 ZIP 파일을 선택해 주세요.</strong><span>압축파일 50 MB · 안의 파일 최대 100개</span><input type="file" name="archive" accept=".zip,application/zip" required></label>
    <p class="small muted" data-archive-limits>압축 안의 파일은 각각 10 MB, 합계 100 MB까지 받습니다. PDF·이미지·TXT·CSV·DOCX 원본을 넣어 주세요. ALZ·EGG는 알집에서 ZIP 형식으로 다시 압축해 주세요.</p>
    <div class="callout neutral archive-guidance"><div><strong>기존 원본은 그대로 보관합니다.</strong><p>명확히 분류된 자료만 요청에 연결합니다. 종류나 명의가 불명확하면 별도 확인 자료로 접수해 담당자가 살펴봅니다.</p></div></div>
    <div data-archive-progress class="archive-progress" role="status" aria-live="polite" hidden><div class="archive-progress-heading"><span class="spinner"></span><div><strong data-archive-stage></strong><small data-archive-detail></small></div><span data-archive-count></span></div><progress hidden></progress></div>
    <div data-archive-result class="archive-result" role="status" aria-live="polite"></div>
    <p data-archive-warning class="batch-error" role="status" hidden></p>
    <ul class="archive-file-list" data-archive-files aria-label="압축 안의 파일별 처리 결과"></ul>
    <p data-archive-background class="small muted" hidden>창을 닫아도 서버의 접수 작업은 계속됩니다. ‘한 번에 넣기’를 다시 열면 진행 상황을 이어서 확인할 수 있습니다.</p>
    <div data-archive-error class="batch-error" role="alert"></div>
    <div class="form-footer"><button type="button" class="button secondary" data-archive-close>닫기</button><button type="button" class="button secondary" data-archive-retry hidden>진행 상태 다시 확인</button><button type="submit" class="button" data-archive-submit>${icon('upload')}압축파일 접수 시작</button></div>
  </form>`);
  el.classList.add('archive-dialog');
  const form=el.querySelector('form'),input=form.querySelector('[name=archive]'),submit=form.querySelector('[data-archive-submit]'),retry=form.querySelector('[data-archive-retry]'),error=form.querySelector('[data-archive-error]'),progress=form.querySelector('[data-archive-progress]'),result=form.querySelector('[data-archive-result]');
  let job=readJob(key),busy=false,timer=null,closed=false,finished=false,resubmitAllowed=false;
  const remember=()=>{if(job?.id||job?.client_token)sessionStorage.setItem(key,JSON.stringify({id:job.id,client_token:job.client_token,status:job.status,file_sha256:job.file_sha256}));};
  const hideInput=()=>{form.querySelector('.archive-select').hidden=true;form.querySelector('[data-archive-limits]').hidden=true;submit.hidden=true;};
  function render(value){
    job=value;resubmitAllowed=false;remember();hideInput();progress.hidden=false;error.textContent='';retry.hidden=true;
    const warning=form.querySelector('[data-archive-warning]');warning.textContent=value.warning||'';warning.hidden=!value.warning;
    const terminal=['completed','failed'].includes(value.status),total=amount(value.progress?.total),completed=Math.min(total,amount(value.progress?.completed));
    form.querySelector('[data-archive-stage]').textContent=stages[value.status]||'처리 상태 확인 중';
    form.querySelector('[data-archive-detail]').textContent=value.progress?.label||'서류의 원문과 필요한 범위를 확인합니다.';
    form.querySelector('[data-archive-count]').textContent=total?`${completed} / ${total}`:'';
    const bar=progress.querySelector('progress');bar.hidden=!total;bar.max=total||1;bar.value=completed;
    progress.querySelector('.spinner').hidden=terminal;
    form.querySelector('[data-archive-background]').hidden=terminal;
    form.querySelector('[data-archive-files]').innerHTML=list(value.files).map(file=>{
      const skipped=file.status==='skipped',saved=!skipped&&(value.status==='completed'||file.status==='saved'),failed=value.status==='failed';
      const status=skipped?'접수 제외':failed?'미접수':saved?'접수 완료':file.status==='classified'?'분류 완료':file.status==='read'?'원문 확인 완료':file.status==='reading'?'원문 확인 중':'확인 대기';
      return `<li class="archive-file ${failed?'failed':saved?'saved':''}"><span class="archive-file-symbol">${icon(saved?'check':'file')}</span><div><strong>${esc(file.filename||'서류')}</strong><span class="archive-file-destination">${esc(skipped?'처리 대상에서 제외':file.request_title||classification[file.classification_status]||'내용에서 연결할 요청을 확인합니다.')}</span>${file.reason?`<small>${esc(file.reason)}</small>`:''}</div><span class="archive-file-status">${esc(status)}</span></li>`;
    }).join('');
    if(value.status==='completed')result.innerHTML=`<strong>${amount(value.imported_count)}개 파일을 접수했습니다.</strong><p>요청 연결 ${amount(value.matched_count)}개 · 담당자 분류 확인 ${amount(value.review_count)}개${amount(value.skipped_count)?' · 접수 제외 '+amount(value.skipped_count)+'개':''}</p><p>파일 접수와 서류 검토 완료는 다릅니다. 자료 검토 결과와 보완 요청은 내 사건에서 확인해 주세요.</p>`;
    if(value.status==='failed'){result.textContent='이번 압축파일의 자료는 접수되지 않았습니다.';error.textContent=value.error?.message||'압축파일과 사건의 최신 상태를 확인한 뒤 다시 접수해 주세요.';sessionStorage.removeItem(key);}
    if(terminal)el.querySelector('.dialog-body').scrollTop=0;
  }
  async function complete(){
    if(finished||closed)return;finished=true;
    try{const updated=await api(`/cases/${encodeURIComponent(c.id)}`);if(isCurrent())await onComplete?.(updated.case||updated);}catch{notify('자료가 접수되었습니다. 사건을 새로고침해 결과를 확인해 주세요.','error');}
    sessionStorage.removeItem(key);
  }
  async function poll(){
    if(closed||!job||!isCurrent())return;
    retry.disabled=true;retry.hidden=true;
    try{
      if(!job.id){
        const response=await api(base,{signal:AbortSignal.timeout(30000)});
        const found=list(response.jobs).find(row=>row.client_token===job.client_token);
        if(closed||!isCurrent())return;
        if(!found){
          resubmitAllowed=true;busy=false;input.disabled=false;
          form.querySelector('.archive-select').hidden=false;form.querySelector('[data-archive-limits]').hidden=false;
          submit.hidden=false;submit.textContent='같은 파일 다시 접수';submit.disabled=!input.files?.length;
          error.textContent='서버 목록에서 이 접수 작업을 찾지 못했습니다. 처음 선택한 ZIP 파일을 다시 선택해 접수해 주세요. 같은 접수번호를 사용하므로 이미 도착한 자료가 중복 저장되지 않습니다.';
          retry.hidden=false;retry.disabled=false;progress.querySelector('.spinner').hidden=true;return;
        }
        job=found;remember();
      }
      const value=await api(`${base}/${encodeURIComponent(job.id)}`,{signal:AbortSignal.timeout(30000)});
      if(closed||!isCurrent())return;render(value);
      if(value.status==='completed'){await complete();return;}
      if(value.status==='failed')return;
      timer=setTimeout(poll,1600);
    }catch(failure){if(closed||!isCurrent())return;progress.querySelector('.spinner').hidden=true;error.textContent=`${failure.message} 같은 접수 작업의 진행 상태를 다시 확인해 주세요. 새 압축파일을 중복 제출하지 마세요.`;retry.hidden=false;retry.disabled=false;}
  }
  input.onchange=()=>{error.textContent='';const file=input.files?.[0];submit.disabled=!file;if(file&&!/\.zip$/i.test(file.name)){error.textContent='ZIP 파일만 접수할 수 있습니다. ALZ·EGG 파일은 알집에서 ZIP 형식으로 다시 압축해 주세요.';submit.disabled=true;}else if(file?.size>50_000_000){error.textContent='압축파일은 50 MB까지 접수할 수 있습니다. 자료를 나누어 ZIP으로 압축해 주세요.';submit.disabled=true;}};
  retry.onclick=()=>{error.textContent='';void poll();};
  form.querySelector('[data-archive-close]').onclick=()=>el.close();
  const sessionClosed=()=>el.close();window.addEventListener('session-expired',sessionClosed);
  el.addEventListener('close',()=>{closed=true;if(timer)clearTimeout(timer);window.removeEventListener('session-expired',sessionClosed);});
  form.onsubmit=async event=>{
    event.preventDefault();if(busy||job?.id||(job?.client_token&&!resubmitAllowed))return;const file=input.files?.[0];if(!file||!/^.*\.zip$/i.test(file.name)||file.size>50_000_000)return;
    busy=true;input.disabled=true;submit.disabled=true;retry.hidden=true;error.textContent='';progress.hidden=false;progress.querySelector('.spinner').hidden=false;form.querySelector('[data-archive-stage]').textContent='압축파일을 전송하고 있습니다';form.querySelector('[data-archive-detail]').textContent='접수 작업이 생성되면 파일별 진행 상황을 보여드립니다.';
    try{
      const digest=await crypto.subtle.digest('SHA-256',await file.arrayBuffer());
      const fileHash=Array.from(new Uint8Array(digest),n=>n.toString(16).padStart(2,'0')).join('');
      if(job?.file_sha256&&job.file_sha256!==fileHash){busy=false;input.disabled=false;submit.disabled=false;progress.hidden=true;error.textContent='처음 접수한 ZIP 파일과 내용이 다릅니다. 같은 파일을 선택해 다시 접수해 주세요.';return;}
      job={client_token:job?.client_token||crypto.randomUUID(),file_sha256:fileHash,status:'sending'};remember();resubmitAllowed=false;
      const data=new FormData();data.append('archive',file,file.name);data.set('expected_version',String(c.version));data.set('client_token',job.client_token);
      const value=await api(base,{method:'POST',body:data,signal:AbortSignal.timeout(180000)});
      if(!isCurrent())return;job=value;remember();if(closed)return;render(value);void poll();
    }catch(failure){if(closed||!isCurrent())return;busy=false;progress.hidden=true;error.textContent=failure.message;
      if(!failure.status||failure.status>=500){hideInput();error.textContent+=' 접수 여부를 먼저 확인해 주세요. 중복 접수를 막기 위해 다시 전송하지 않습니다.';retry.hidden=false;retry.disabled=false;}
      else{sessionStorage.removeItem(key);job=null;if(failure.status===409){error.textContent+=' 최신 사건 상태와 진행 중인 접수를 확인한 뒤 다시 열어 주세요.';}else{input.disabled=false;submit.disabled=false;}if(failure.status===404||failure.status===405)error.textContent='현재 서버에서 압축파일 접수를 사용할 수 없습니다. ZIP을 푼 뒤 요청 카드에서 여러 파일을 함께 제출해 주세요.';}
    }
  };
  submit.disabled=true;
  if(job?.id||job?.client_token){hideInput();progress.hidden=false;form.querySelector('[data-archive-stage]').textContent='이전 접수 작업을 확인하고 있습니다';void poll();}
  return el;
}
