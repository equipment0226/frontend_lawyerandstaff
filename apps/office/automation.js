import {openScopeEditor} from './scope-editor.js';
import {consultationPending} from './consultation.js';
import {api,session} from '/shared/api.js';
import {esc,date,list,badge,icon,empty,modal,notify,fields,caseReference} from '/shared/ui.js';
import {structuredHtml,humanText} from '/shared/structured.js';
import {requestStatus,requestDetails,requestWithdrawn,requestScope} from '/shared/requests.js';

const stageNames={collecting:'서류 준비·보완',ocr_verification:'추출값 검증',verification_waiting:'검증 재시도 필요',legal_analysis:'쟁점·계산 분석',lawyer_review:'변호사 검토 필요',drafting:'문서 작성',completed:'문서 준비 완료'};
const outcomeNames={approved:'법원 승인·인가',correction:'보정 요구',rejected:'불인가·기각·반려'};
const decisionTypes={initial_plan_approval:['최초 변제계획 인가','approved'],initial_plan_denial:['변제계획 불인가','rejected'],application_dismissal:['개시신청 기각','rejected'],commencement:['개인회생 개시','approved'],correction_order:['보정명령·권고','correction'],discharge:['면책','approved'],other:['그 밖의 결정',null]};
const text=value=>typeof value==='string'?value:value?.message||value?.description||value?.reason||value?.title||'';
const safeLink=(source)=>{try{const url=new URL(source.url||source.source_url);return ['https:','http:'].includes(url.protocol)?`<a href="${esc(url.href)}" target="_blank" rel="noopener noreferrer">${esc(source.title||source.locator||'공식 근거')}</a>`:'';}catch{return '';}};
const openNotifications=c=>list(c?.notifications).filter(n=>n.audience!=='client'&&!n.read_at&&!n.resolved_at);

export function createAutomationUI({getState,render,load,openCase,openForm}){
  const seen=new Set();let popupPending=false,refreshing=null,lastAlertCase=null,feedOwner=null;
  const current=()=>getState().current;
  const path=suffix=>`/cases/${encodeURIComponent(current().id)}${suffix}`;
  async function refreshNotifications(){
    const owner=session.user?.id||session.user?.role;if(owner!==feedOwner){feedOwner=owner;getState().notificationFeed=null;getState().notificationError=null;seen.clear();}
    if(refreshing)return refreshing;
    refreshing=(async()=>{try{const data=await api('/notifications?limit=100&unread_only=false');if(Array.isArray(data.notifications)){getState().notificationFeed=data;getState().notificationError=null;}}catch(error){getState().notificationError=error.message;}finally{refreshing=null;}})();
    return refreshing;
  }
  setInterval(()=>{if(session.user&&!document.hidden)void refreshNotifications().then(()=>{if(!document.querySelector('dialog[open],form[data-dirty=true]')&&!document.activeElement?.matches('input,textarea,select'))render();});},15000);
  function alarm(c,topbar=false){
    const count=topbar?(getState().notificationFeed?.unread_count??getState().cases.reduce((n,x)=>n+(Number(x.unread_count??x.review_count)||openNotifications(x).length),0)):Number(c?.unread_count??c?.review_count)||openNotifications(c).length;
    return `<button class="icon-button ax-alarm ${count?'has-alert':''}" data-action="automation-alerts" ${c?.id?`data-id="${esc(c.id)}"`:''} aria-label="미확인 알림 ${count}건" title="문의·서류·접수·검토 알림">${icon('bell')}${count?`<span>${count>99?'99+':count}</span>`:''}</button>`;
  }
  function reviewContent(c){
    const p=c.ax_pipeline||{},analysis=c.legal_analysis||{},reasons=list(p.reasons||analysis.reasons),strategies=list(p.strategies||analysis.strategies);
    return `${reasons.length?`<h3>검토가 필요한 이유</h3><ul class="ax-review-reasons">${reasons.map(r=>`<li><strong>${esc(r.title||r.code||'확인 사항')}</strong><p>${esc(text(r))}</p>${list(r.sources||r.source_refs).map(safeLink).join(' · ')}</li>`).join('')}</ul>`:''}${strategies.length?`<h3>근거에 따른 대응안</h3><ul class="ax-review-reasons">${strategies.map(s=>`<li><strong>${esc(s.title||'검토할 대응')}</strong><p>${esc(text(s))}</p>${s.required_information?`<p>추가 확인 · ${esc(text(s.required_information))}</p>`:''}${list(s.sources||s.source_refs).map(safeLink).join(' · ')}</li>`).join('')}</ul>`:''}`;
  }
  function pipeline(){
    return current()?.ax_pipeline||consultationPending(current())?'<div data-case-automation></div>':'';
  }
  function requests(){
    const requests=list(current()?.requests),active=requests.filter(r=>!requestWithdrawn(r)),withdrawn=requests.filter(requestWithdrawn);
    const item=r=>`<div class="list-item"><div class="row between wrap"><strong class="small">${esc(r.title)}</strong>${requestStatus(r)}</div>${requestDetails(r)}<p>${esc(r.reason)}</p>${r.withdrawn_at?`<p class="small muted">목록에서 제외 · ${date(r.withdrawn_at,true)}</p>`:''}${!requestWithdrawn(r)&&['staff','lawyer'].includes(session.user?.role)?`<button class="button subtle small" data-action="automation-withdraw" data-id="${esc(r.id)}">목록에서 제외</button>`:''}${list(r.source_refs||r.sources).length?`<details class="ax-source-details"><summary>요청 근거</summary>${list(r.source_refs||r.sources).map(s=>`<p class="small">${safeLink(s)||esc(s.title||s.source_id||s)}${s.locator?' · '+esc(s.locator):''}</p>`).join('')}</details>`:''}</div>`;
    return active.map(item).join('')+(withdrawn.length?`<details class="ax-source-details" data-excluded-requests><summary>제외·변경된 요청 ${withdrawn.length}건</summary>${withdrawn.map(item).join('')}</details>`:'')||empty('요청한 자료가 없습니다');
  }
  function outcomes(){
    const c=current(),items=list(c?.court_outcomes);
    return `<section class="card section-spacer"><div class="card-head"><div><h2>법원 결과와 문서 개선 이력</h2><p class="small muted ax-gap">제출한 문서와 법원 결과를 연결해 다음 작성의 근거로 보관합니다.</p></div>${session.user?.role==='lawyer'?'<button class="button secondary small" data-action="automation-outcome">법원 결과 기록</button>':''}</div><div class="card-body">${items.slice().reverse().map(item=>`<div class="list-item"><div class="row between wrap"><strong>${esc(decisionTypes[item.decision_type]?.[0]||outcomeNames[item.outcome]||item.outcome)}</strong><span class="small muted">${date(item.created_at,true)}</span></div><p>${esc(item.reason)}</p>${item.decision_date?`<p class="small muted">법원 결정일 · ${date(item.decision_date)}</p>`:''}<p class="small muted">${item.bundle_id?'문서 '+esc(item.bundle_id)+' · ':''}${item.source_document_id?'법원 결과 원문 연결됨':'근거 원문 확인 필요'}</p>${item.learning_status?badge(item.learning_status,item.learning_status==='eligible'?'비식별 근거 보관':'사례 반영 검토'):''}</div>`).join('')||empty('아직 기록된 법원 결과가 없습니다','인가·보정·기각 결과의 원문과 대상 문서를 연결해 주세요.')}</div></section>`;
  }
  async function alerts(id,summaryOnly=false){
    await refreshNotifications();lastAlertCase=id||null;
    const state=getState(),feed=state.notificationFeed,c=id?(current()?.id===id?current():state.cases.find(item=>item.id===id)):null;
    const fallback=[current(),...state.cases].filter((item,index,items)=>item&&items.findIndex(other=>other?.id===item.id)===index).flatMap(item=>list(item.notifications).filter(n=>n.audience!=='client').map(n=>({...n,case_id:item.id,case_title:item.title||item.client_name,matter_number:item.matter_number,case_version:item.version})));
    const items=list(feed?.notifications||fallback).filter(n=>(!id||n.case_id===id)&&!n.resolved_at).sort((a,b)=>Number(Boolean(a.read_at))-Number(Boolean(b.read_at))||String(b.created_at).localeCompare(String(a.created_at)));
    const kinds={review_request:'검토 요청',customer_handoff:'직원 연결 요청',client_message:'고객 문의',document_received:'서류 제출',application_received:'새 상담·신청',staff_message:'담당자 메시지',document_request:'자료 요청'};
    const tabs={review_request:'issues',customer_handoff:'messages',client_message:'messages',document_received:'verify',application_received:'consultation',staff_message:'messages'};
    const unread=n=>n.unread??!n.read_at;
    modal(id?'이 사건의 알림':'업무 알림',`${state.notificationError?'<p class="callout warning">알림을 새로 불러오지 못했습니다. 마지막 확인 내용을 표시합니다.</p>':''}${c?`<p class="small muted">${esc(caseReference(c))} · ${esc(c.client_name||c.title||'선택한 사건')}</p>`:''}<p class="small muted office-notice-summary">${id?items.filter(unread).length:feed?.unread_count??items.filter(unread).length}건 미확인 · 문의·자료·접수·검토 소식을 확인하세요.</p>${items.length?items.map(n=>`<article class="office-notice ${unread(n)?'is-unread':''}"><div class="row between wrap"><span class="badge gray">${esc(kinds[n.kind]||'업무 안내')}</span>${badge(unread(n)?'review_required':'reviewed',unread(n)?'미확인':'확인함')}</div><h3>${esc(n.title||kinds[n.kind]||'업무 안내')}</h3>${structuredHtml(n.message||n.body||n.reason||'사건에서 내용을 확인하세요.')}<p class="small muted">${esc(caseReference(n))} · ${esc(n.case_title||'담당 사건')} · ${date(n.created_at,true)}</p><div class="row wrap"><button class="button secondary small" data-action="automation-notice-case" data-case-id="${esc(n.case_id)}" data-tab-id="${tabs[n.kind]||'overview'}">사건에서 확인 ${icon('arrow')}</button>${unread(n)?`<button class="button small" data-action="automation-read" data-id="${esc(n.id)}" data-case-id="${esc(n.case_id)}">확인함</button>`:''}</div></article>`).join(''):empty('새로운 업무 알림이 없습니다','고객 문의·서류 제출·새 신청·검토 요청이 이곳에 모입니다.')}${feed?.total>100?'<p class="small muted">최근 알림 100건을 표시합니다. 사건별 전체 이력도 확인할 수 있습니다.</p>':''}${id&&current()?.id===id?reviewContent(current()):''}`);
  }
  function checkAlerts(){
    if(popupPending||document.querySelector('dialog[open]')||document.activeElement?.matches('input,textarea,select'))return;
    const state=getState(),feed=state.notificationFeed;
    if(feed){const latest=list(feed.notifications).find(n=>(n.unread??!n.read_at)&&n.kind==='review_request'&&!seen.has(`${session.user?.id}:${n.case_id}:${n.id}`));if(!latest)return;for(const n of list(feed.notifications))seen.add(`${session.user?.id}:${n.case_id}:${n.id}`);popupPending=true;setTimeout(()=>{void alerts(latest.case_id).catch(error=>notify(error.message,'error')).finally(()=>{popupPending=false;});},0);return;}
    const inCase=state.view==='case'&&current(),cases=inCase?[current()]:state.cases;
    const summaryKey=c=>`${c.id}:review:${Number(c.review_count)||openNotifications(c).length}`;
    const c=cases.find(x=>openNotifications(x).some(n=>['review_request','customer_handoff'].includes(n.kind)&&!seen.has(`${x.id}:${n.id}`))||(Number(x.review_count)>0&&!seen.has(summaryKey(x))));
    if(!c)return;
    for(const item of cases){openNotifications(item).forEach(n=>seen.add(`${item.id}:${n.id}`));seen.add(summaryKey(item));}
    popupPending=true;setTimeout(()=>{void alerts(inCase?c.id:undefined,!inCase).catch(error=>notify(error.message,'error')).finally(()=>{popupPending=false;});},0);
  }
  const actions={
    'automation-scopes':async()=>{
      const registry=getState().registry||await api('/registry');
      getState().registry=registry;
      return openScopeEditor({caseData:current(),registry,openForm,save:async body=>{
        await api(path('/document-scopes'),{method:'POST',body});notify('기관·계좌·기간을 저장하고 요청을 다시 정리했습니다.');await load();
      }});
    },
    'automation-metadata':d=>{
      const doc=list(current()?.documents).find(x=>x.id===d.id);if(!doc)return;
      const m=doc.document_metadata||{};
      const controls=[['institution','발급 기관','text'],['account_key','연결할 계좌 식별값','text'],['period_start','내용 시작일','date'],['period_end','내용 종료일','date'],['issued_at','발급일','date'],['certificate_type','증명서 종류·상세 여부','text'],['address_history','주소 변동 표시','text'],['person_number_display','주민등록번호 표시 범위','text'],['tax_scope','세목 범위','text'],['jurisdiction_scope','조회 관할 범위','text']];
      return openForm('서류의 기관·기간·발급정보 정정',`<p class="small muted" style="margin-bottom:16px">${esc(doc.filename||doc.name)} · 원문에서 확인한 발급정보를 기록하면 해당 요청을 다시 검증합니다.</p><div class="field-grid">${fields(controls.map(([key,title,type])=>[key,title,type,m[key]||'']))}</div><label class="row small" style="margin-bottom:16px"><input type="checkbox" name="covers_all_accounts" ${m.covers_all_accounts?'checked':''}> 해당 기관의 모든 계좌를 포함한 원문입니다.</label>`+fields([['reason','원문 위치와 정정 이유','textarea','',true]]),'정정 이력 저장·다시 검증',async body=>{
        const metadata=Object.fromEntries(controls.map(([key])=>[key,body[key]||'']));metadata.covers_all_accounts=body.covers_all_accounts==='on';
        await api(path('/documents/'+encodeURIComponent(d.id)+'/metadata'),{method:'POST',body:{metadata,reason:body.reason,expected_version:body.expected_version}});notify('서류 발급정보의 정정 이력을 저장했습니다.');await load();
      });
    },
    'automation-withdraw':d=>{
      const c=current(),request=list(c?.requests).find(row=>row.id===d.id);
      if(!request||requestWithdrawn(request)||!['staff','lawyer'].includes(session.user?.role))return;
      const target=`/cases/${encodeURIComponent(c.id)}/requests/${encodeURIComponent(request.id)}/withdraw`;
      return openForm('제출서류 목록에서 제외',`<div class="request-exclusion-summary"><strong>${esc(request.title)}</strong><p class="request-scope">${esc(requestScope(request)||'이 요청에 지정된 범위')}</p></div><div class="callout neutral"><p>이 요청은 고객의 준비 목록과 미제출 집계에서 빠집니다. 제출된 원본과 처리 이력은 보관하며, 같은 종류라도 기관·계좌·기간이 다른 요청은 유지합니다.</p></div><label class="field"><span>제외 사유 <span class="required">*</span></span><textarea name="reason" required minlength="5" maxlength="1500" placeholder="예: 급여소득자로 확인되어 사업자 자료는 필요하지 않음"></textarea></label><p class="small muted">제외 사유는 고객에게도 안내됩니다. 필요한 자료를 다시 요청하려면 목록 상단의 ‘자료 요청’을 이용하세요.</p>`,'목록에서 제외',async body=>{
        body.reason=body.reason.trim();
        if(body.reason.length<5)throw new Error('제외 사유를 5자 이상 입력해 주세요.');
        await api(target,{method:'POST',body});
        notify('제출서류 목록에서 제외했습니다. 사유와 기존 자료는 이력에 보관됩니다.');await load();
      });
    },
    'automation-alerts':d=>alerts(d.id),
    'automation-read':async d=>{const caseId=d.caseId||current()?.id;if(!caseId)return;const c=current()?.id===caseId?current():await api('/cases/'+encodeURIComponent(caseId));await api('/cases/'+encodeURIComponent(caseId)+'/notifications/'+encodeURIComponent(d.id)+'/read',{method:'POST',body:{expected_version:c.version}});const selected=lastAlertCase;document.querySelector('dialog[open]')?.close();await load();await alerts(selected);},
    'automation-notice-case':async d=>{document.querySelector('dialog[open]')?.close();await openCase(d.caseId,d.tabId||'overview');},
    'automation-run':async()=>{if(consultationPending(current())){await openCase(current().id,'consultation');return;}await api(path('/automation/run'),{method:'POST',body:{expected_version:current().version}});notify('현재 자료로 검증과 다음 단계를 다시 확인합니다.');await load();},
    'automation-outcome':()=>{
      const c=current(),bundles=[...list(c.bundles),...list(c.drafts),...list(c.court_documents)];
      const dialog=openForm('법원 결과 기록',`<label class="field"><span>법원 결과</span><select name="outcome">${Object.entries(outcomeNames).map(([key,value])=>`<option value="${key}">${value}</option>`).join('')}</select></label><label class="field"><span>결정의 정확한 유형</span><select name="decision_type"><option value="">분류하지 않고 이력만 기록</option>${Object.entries(decisionTypes).map(([key,[label]])=>`<option value="${key}">${esc(label)}</option>`).join('')}</select></label><p class="small muted" style="margin:-8px 0 18px">유형·결정일·결정 주문이 원문과 확인된 최종 인가·불인가·기각 결과만 관측 비율에 반영합니다. 개시·보정·면책은 별도로 기록합니다.</p><div data-decision-evidence hidden>${fields([['decision_date','법원 결정일','date'],['decision_quote','원문에서 확인한 결정 주문','textarea']])}</div><label class="field"><span>결과가 나온 문서</span><select name="bundle_id" required><option value="">문서 선택</option>${bundles.map(b=>`<option value="${esc(b.id)}">${esc(b.title||b.template_title||b.id)} · ${date(b.created_at)}</option>`).join('')}</select></label><label class="field"><span>법원 결과 원문</span><select name="source_document_id" required><option value="">원문 선택</option>${list(c.documents).map(d=>`<option value="${esc(d.id)}">${esc(d.filename||d.name)}</option>`).join('')}</select></label>`+fields([['reason','결정·보정 사유와 확인한 원문 위치','textarea','',true]]),'결과와 근거 저장',async body=>{if(!body.decision_type){delete body.decision_type;delete body.decision_date;delete body.decision_quote;}await api(path('/court-outcomes'),{method:'POST',body});notify('법원 결과를 문서와 연결해 기록했습니다.');await load();});
      const form=dialog.querySelector('form'),type=form.elements.decision_type,outcome=form.elements.outcome;
      const sync=()=>{const hasType=Boolean(type.value);dialog.querySelector('[data-decision-evidence]').hidden=!hasType;for(const name of ['decision_date','decision_quote']){form.elements[name].disabled=!hasType;form.elements[name].required=hasType;}};
      type.addEventListener('change',()=>{const category=decisionTypes[type.value]?.[1];if(category)outcome.value=category;sync();});
      outcome.addEventListener('change',()=>{const category=decisionTypes[type.value]?.[1];if(category&&category!==outcome.value)type.value='';sync();});
      sync();return dialog;
    }
  };
  return {alarm,pipeline,requests,outcomes,actions,checkAlerts,refreshNotifications};
}
