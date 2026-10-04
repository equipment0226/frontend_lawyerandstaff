import {api,session,download} from '/shared/api.js';
import {esc,date,list,badge,icon,fields,empty,notify} from '/shared/ui.js';
import {humanText} from '/shared/structured.js';

// Court submission is an explicit human action. This UI records the approved
// artifact set and a separately verified receipt; it never sends to a court.
export function createFilingUI({getState,render,load,openForm}){
  const current=()=>getState().current;
  const path=suffix=>`/cases/${encodeURIComponent(current().id)}${suffix}`;
  let readinessKey='',readiness=null,loading=false,error='';
  const key=()=>[current()?.id,current()?.version,current()?.input_revision,current()?.ax_pipeline?.stage,...list(current()?.court_documents).map(d=>`${d.id}:${d.status}:${d.stale}`)].join('|');
  async function refresh(){
    const requested=key(),caseId=current()?.id;if(!caseId)return;
    readinessKey=requested;loading=true;error='';readiness=null;
    try{const result=await api(`/cases/${encodeURIComponent(caseId)}/filing-readiness`);if(readinessKey===requested)readiness=result;}
    catch(caught){if(readinessKey===requested)error=caught.message;}
    finally{if(readinessKey===requested){loading=false;if(current()?.id===caseId)render();}}
  }
  async function save(suffix,body,message){
    const result=await api(path(suffix),{method:'POST',body});
    getState().current=result.case||result;readinessKey='';await load();notify(message);return result;
  }
  const latestByTemplate=()=>Object.fromEntries(list(current()?.court_documents).map(d=>[d.template_id,d]));
  function packageCurrent(p){
    const latest=latestByTemplate();
    return !p.stale&&p.input_revision===current()?.input_revision&&list(p.document_ids).length>0&&list(p.document_ids).every(id=>{const doc=list(current()?.court_documents).find(d=>d.id===id);return doc&&!doc.stale&&latest[doc.template_id]?.id===id;});
  }
  const packageName=p=>p.title||'법원 제출 패키지';
  function packageCard(p){
    const valid=packageCurrent(p),submissions=list(current()?.submissions).filter(s=>s.bundle_id===p.id||s.filing_package_id===p.id),submitted=p.status==='submitted'||submissions.length>0;
    const approved=p.status==='approved'&&valid;
    const receipts=list(current()?.submission_receipts).filter(r=>(r.package_id||r.filing_package_id)===p.id&&r.status==='verified');
    const state=submitted?'submitted':!valid?'stale':p.status;
    const titles=list(p.document_ids).map(id=>{const doc=list(current()?.court_documents).find(d=>d.id===id);return doc?.title||doc?.template_title||doc?.preview?.template?.title||'공식 작성본';});
    return `<article class="filing-package" data-filing-package="${esc(p.id)}"><div class="row between wrap"><div><h3>${esc(packageName(p))}</h3><p class="small muted">${date(p.created_at,true)} · 공식 작성본 ${titles.length}종</p></div>${badge(state,({prepared:'변호사 최종 승인 대기',approved:'최종 승인 · 외부 제출 대기',submitted:'법원 제출 기록 완료',stale:'자료 변경 · 새 패키지 필요'})[state]||'상태 확인 필요')}</div><p class="filing-document-names">${titles.map(esc).join(' · ')}</p>${!valid&&!submitted?`<p class="generated-document-warning">${esc(p.stale_reason||'입력 자료 또는 작성본이 변경되었습니다. 보완된 문서로 새 제출 패키지를 준비하세요.')}</p>`:''}${p.approval?.reason?`<p class="small muted">최종 승인 기록 · ${esc(p.approval.reason)}</p>`:''}<div class="row wrap ax-gap"><button class="button secondary small" data-tab="court_forms">작성본 확인</button>${valid? `<button class="button secondary small" data-action="filing-download" data-id="${esc(p.id)}">${icon('download')} 제출 문서 ZIP</button>`: ''}${!submitted&&valid&&p.status==='prepared'&&session.user?.role==='lawyer'?`<button class="button" data-action="filing-approve" data-id="${esc(p.id)}">변호사 최종 승인</button>`:''}${!submitted&&valid&&p.status==='prepared'&&session.user?.role!=='lawyer'?'<span class="small muted">담당 변호사가 제출 문서 전체를 확인하고 최종 승인합니다.</span>':''}${approved&&!submitted?`<button class="button secondary small" data-action="filing-receipt" data-id="${esc(p.id)}">외부 제출 후 접수증 등록</button><button class="button" data-action="filing-record" data-id="${esc(p.id)}" ${receipts.length?'':'disabled'}>법원 제출 기록</button>`:''}</div>${receipts.length?`<details class="filing-receipts"><summary>연결한 접수증 ${receipts.length}건</summary>${receipts.map(r=>`<p>${esc(r.filename||'법원 접수증')} · ${esc(r.court_case_number||'사건번호 확인')} <button class="button subtle small" data-action="filing-download-receipt" data-id="${esc(r.id)}">접수증 원문</button></p>`).join('')}</details>`:''}${submissions.map(s=>`<div class="callout neutral ax-gap"><div><strong>${esc(s.court_case_number||'법원 접수 기록')}</strong><p>${date(s.created_at,true)} · 실제 제출 후 접수증을 연결한 기록입니다.</p></div></div>`).join('')}</article>`;
  }
  function view(){
    const c=current();if(!c)return '';
    if(key()!==readinessKey)void refresh();
    const packages=list(c.filing_packages).slice().reverse(),ready=readiness?.ready===true&&!loading;
    const historical=list(c.submissions).filter(s=>!packages.some(p=>p.id===(s.filing_package_id||s.bundle_id)));
    return `<section class="card filing-workspace" data-filing-workspace><div class="card-head"><div><div class="overline">REVIEW · APPROVAL · SUBMISSION</div><h2>보완·최종 승인·제출 처리</h2><p class="small muted">자동 작성본과 AI 검토 결과를 확인하고, 보완한 문서를 제출 패키지로 준비합니다.</p></div><button class="button secondary small" data-action="filing-refresh" ${loading?'disabled':''}>${icon('refresh')} 조건 다시 확인</button></div><div class="card-body"><div class="filing-flow"><div><span>1</span><strong>작성본 보완</strong><small>AI 검토·미확정 항목 확인</small></div><div><span>2</span><strong>변호사 최종 승인</strong><small>문서 전체와 제출요건 확인</small></div><div><span>3</span><strong>제출 처리</strong><small>외부 제출 후 접수증 등록</small></div></div><div class="callout neutral"><p>실제 전자소송 제출은 담당자가 진행합니다. 이 화면은 승인한 문서와 접수증을 연결해 제출 이력을 기록합니다.</p></div>${error?`<p class="generated-document-warning" role="alert">제출 조건을 확인하지 못했습니다. ${esc(error)}</p>`:loading?'<p class="small muted ax-gap" role="status">현재 작성본과 제출 조건을 확인하고 있습니다.</p>':`<div class="filing-readiness">${list(readiness?.required_documents).map(d=>`<div class="filing-readiness-row"><strong>${esc(d.title||'필수 공식 서식')}</strong>${badge(!d.document_id?'missing':d.ai_review_passed?'verified':'needs_review',!d.document_id?'작성 대기':d.status==='stale'?'최신 작성본 필요':d.ai_review_passed?'AI 대조 완료':'AI 검토·보완 필요')}${d.document_id?`<button class="button subtle small" data-action="legal-review-court-form" data-id="${esc(d.document_id)}">내용 확인</button>`:''}</div>`).join('')}</div>${list(readiness?.blockers).length?`<div class="callout warning"><div><strong>제출 패키지 준비 전 확인할 사항</strong><ul>${readiness.blockers.map(b=>`<li>${esc(humanText(b.message||b.reason||'현재 자료와 작성본을 확인해 주세요.'))}</li>`).join('')}</ul></div></div>`:''}`}<div class="row wrap ax-gap"><button class="button secondary" data-tab="court_forms">작성본·AI 검토 확인</button><button class="button" data-action="filing-prepare" ${ready?'':'disabled'}>${icon('file')} 제출 패키지 준비</button></div><p class="small muted ax-gap">미확정 항목을 보완하면 새 버전으로 보관합니다. AI 재검토와 제출 조건 확인 후 패키지를 준비할 수 있습니다.</p>${packages.length?`<div class="filing-package-list">${packages.map(packageCard).join('')}</div>`:empty('아직 준비한 제출 패키지가 없습니다','1차 작성본을 먼저 확인하고, 필요한 보완을 마친 뒤 최종 승인으로 진행하세요.')}${historical.length?`<details class="filing-receipts"><summary>이전 제출 기록 ${historical.length}건</summary>${historical.map(s=>`<p>${esc(s.court_case_number||'법원 접수 기록')} · ${date(s.created_at,true)}</p>`).join('')}</details>`:''}</div></section>`;
  }
  const actions={
    'filing-refresh':refresh,
    'filing-download':data=>download(path('/filing-packages/'+encodeURIComponent(data.id)+'/download'),'제출검토패키지.zip'),
    'filing-download-receipt':data=>download(path('/submission-receipts/'+encodeURIComponent(data.id)+'/download'),'법원접수증'),
    'filing-prepare':()=>{if(!readiness?.ready||loading)return;openForm('법원 제출 패키지 준비',`<p>현재 검증된 공식 작성본 ${list(readiness.document_ids).length}종을 하나의 제출 단위로 고정합니다. 준비 후 변호사의 최종 승인이 필요합니다.</p>`,'제출 패키지 준비',body=>save('/filing-packages',{expected_version:body.expected_version,document_ids:list(readiness.document_ids)},'제출 패키지를 준비했습니다. 변호사 최종 승인을 진행해 주세요.'));},
    'filing-approve':data=>{
      const p=list(current()?.filing_packages).find(p=>p.id===data.id);if(!p||!packageCurrent(p)||session.user?.role!=='lawyer')return;
      openForm('제출 패키지 변호사 최종 승인',`<p>포함된 작성본과 첨부자료 전체를 확인하고 승인합니다. 자료나 문서가 변경되면 새 패키지로 다시 승인해야 합니다.</p><label class="filing-confirm"><input type="checkbox" name="final_checks_confirmed" required><span>서명·날인, 미매핑 빈칸과 별지 전체 행, 법률상 진술·동의 및 최종 제출요건을 확인했습니다.</span></label>${fields([['reason','전체 문서 검토 결과와 승인 근거','textarea','',true]])}`,'최종 승인',body=>save('/filing-packages/'+encodeURIComponent(data.id)+'/approve',{expected_version:body.expected_version,reason:body.reason,final_checks_confirmed:body.final_checks_confirmed==='on'},'변호사 최종 승인을 기록했습니다. 실제 제출 후 접수증을 등록하세요.'));
    },
    'filing-receipt':data=>{
      const p=list(current()?.filing_packages).find(p=>p.id===data.id);if(!p||!packageCurrent(p)||p.status!=='approved')return;
      openForm('외부 제출 후 접수증 등록',`<div class="callout neutral"><p>승인한 패키지를 실제 전자소송에 제출한 후 받은 접수증을 등록합니다. 접수증은 사건 원문과 별도로 보관됩니다.</p></div><label class="field"><span>법원 접수증 파일 · 10MB 이하</span><input type="file" name="file" accept=".pdf,.png,.jpg,.jpeg,.txt" required></label>${fields([['court_case_number','법원 사건번호','text','',true],['reason','접수증 원문 확인 내용','textarea','',true]])}${[['person_confirmed','접수증의 당사자가 이 사건 고객과 일치합니다.'],['case_number_confirmed','법원 사건번호와 관할이 접수증 원문과 일치합니다.'],['receipt_confirmed','선택한 승인본을 제출한 접수증임을 확인했습니다.']].map(([name,title])=>`<label class="filing-confirm"><input type="checkbox" name="${name}" required><span>${title}</span></label>`).join('')}`,'접수증 확인·등록',async(body,formData)=>{
        const payload=new FormData();payload.append('file',formData.get('file'));payload.append('expected_version',body.expected_version);payload.append('court_case_number',body.court_case_number);payload.append('reason',body.reason);
        for(const name of ['person_confirmed','case_number_confirmed','receipt_confirmed'])payload.append(name,String(body[name]==='on'));
        await save('/filing-packages/'+encodeURIComponent(data.id)+'/receipts',payload,'접수증을 보관했습니다. 법원 제출 기록에서 연결해 마무리하세요.');
      });
    },
    'filing-record':data=>{
      const p=list(current()?.filing_packages).find(p=>p.id===data.id);if(!p||!packageCurrent(p)||p.status!=='approved')return;
      const receipts=list(current()?.submission_receipts).filter(r=>(r.package_id||r.filing_package_id)===p.id&&r.status==='verified');if(!receipts.length)return;
      const dialog=openForm('실제 법원 제출 기록',`<p>실제 제출 후 확인한 접수증과 최종 승인 패키지를 연결합니다.</p><label class="field"><span>확인한 접수증</span><select name="receipt_document_id" required>${receipts.map(r=>`<option value="${esc(r.id)}">${esc(r.filename||'법원 접수증')} · ${esc(r.court_case_number||'')}</option>`).join('')}</select></label>${fields([['court_case_number','법원 사건번호','text',receipts[0].court_case_number||'',true]])}`,'법원 제출 기록',body=>save('/submissions',{expected_version:body.expected_version,bundle_id:data.id,receipt_document_id:body.receipt_document_id,court_case_number:body.court_case_number},'법원 제출과 접수증 연결을 기록했습니다.'));
      dialog.querySelector('[name="receipt_document_id"]').addEventListener('change',event=>{dialog.querySelector('[name="court_case_number"]').value=receipts.find(r=>r.id===event.target.value)?.court_case_number||'';});
    }
  };
  return {view,actions};
}
