import {api,session,download} from '/shared/api.js';
import {esc,date,list,badge,icon,empty,notify,modal,fields,activityLabel} from '/shared/ui.js';
import {consultationPending} from './consultation.js';
import {humanText,structuredHtml} from '/shared/structured.js';

const active = run => ['queued','running','pending','processing'].includes(run?.status);
const statusNames = {queued:'실행 대기',running:'검토 중',processing:'처리 중',needs_review:'검토할 제안 있음',rulebook_only:'규칙 검사 완료 · AI 생성 없음',manual_review:'담당자 직접 검토 필요',partial:'일부 처리 · 확인 필요',failed:'실행 실패',stale:'자료 변경 · 재검토 필요',cancelled:'실행 취소',completed:'처리 완료'};
Object.assign(statusNames,{waiting:'검토 대기',lawyer_review:'변호사 검토 대기',reviewed:'변호사 검토 완료',changes_requested:'변호사 수정 요청',collecting:'자료 수집 중',draft_ready:'1차 초안 준비됨',drafting:'초안 작성 중',needs_documents:'자료 보완 필요'});
const reviewNames = {pending:'검토 전',candidate:'추출 후보',proposed:'추출 후보',applied:'업무에 반영됨',dismissed:'반려됨',accepted:'검토 완료',corrected:'정정됨',rejected:'반려됨',confirmed:'확정',approved:'변호사 검토 완료',reviewed:'변호사 검토 완료',changes_requested:'수정 요청',review_required:'검토 필요',draft:'검토 전 초안'};
Object.assign(reviewNames,{superseded:'이전 추출',quarantined:'원문 격리',automatically_verified:'자동 검증 완료',verification_required:'작성 내용 확인 필요'});
const kindNames = {statute:'법령',court_rule:'법원 실무준칙',court_guidance:'법원 안내',government_service:'정부 서비스',official_law:'공식 법령',law:'법령',court:'법원 안내',government:'정부 발급 안내',case_document:'사건 원문',local_reference:'참조 원본',reference:'참조 원본',workflow_rule:'검토 규칙',rulebook:'업무 규칙',case_record:'사건 기록',party_statement:'고객 진술',local_correction:'참조 보정권고',local_rulebook:'참조 업무 규칙'};
Object.assign(kindNames,{government_guide:'정부 법률 안내',court_guide:'법원 절차 안내',court_jurisdiction:'법원 관할 안내',court_form:'법원 서식'});
const isModelFinding = finding => ['llama3','deepseek','model','llm'].includes(finding.origin);
const modelFindingLabel = finding => isModelFinding(finding)?'AI 판독결과':'규칙 검사';
const actionNames = {document_request:'자료 요청 등록',review_task:'검토 작업 등록',correction_draft:'보정 답변 초안 반영'};
const triggerNames = {manual:'담당자 실행',document_uploaded:'새 자료 수신',document_received:'새 자료 수신',upload:'새 자료 수신',client_message:'고객 회신 수신',client_reply:'고객 회신 수신',message_received:'고객 회신 수신',intake:'상담 회의록 접수'};
const asText = value => value==null?'':humanText(value);
const safeURL = url => {try{const value=new URL(url);return ['http:','https:'].includes(value.protocol)?value.href:null;}catch{return null;}};
const link = (url,title='공식 원문') => safeURL(url)?`<a class="source-link" href="${esc(safeURL(url))}" target="_blank" rel="noopener noreferrer">${esc(title)} ${icon('arrow')}</a>`:'';
const runBadge = run => badge(run.status,statusNames[run.status]||run.status);
const runDate = run => date(run.finished_at||run.completed_at||run.created_at||run.started_at,true);

export function createAX(context){
  const {getState,render,load,openCase,openForm,pipelineView}=context;
  const local={knowledge:null,knowledgeError:null,rulebook:null,knowledgeTab:'sources',query:'',court:'',results:null,searching:false,intakeText:'',intake:null,intakeError:null,ingestion:null,polling:false,pollTick:0};
  const current = () => getState().current;
  const activeCandidates = () => list(current()?.extraction_candidates).filter(candidate=>!['superseded','quarantined','rejected'].includes(candidate.status));
  const cpath = suffix => `/cases/${encodeURIComponent(current().id)}${suffix}`;
  const allRuns = () => list(current()?.ax_runs).slice().sort((a,b)=>String(b.created_at||b.started_at||'').localeCompare(String(a.created_at||a.started_at||'')));
  const canRender = () => !document.querySelector('dialog[open]')&&!document.querySelector('form[data-dirty=true]')&&!document.activeElement?.matches('input,textarea,select')&&!document.querySelector('#ax-intake-form input[type=file]')?.files?.length;
  const repaint = () => {if(canRender()){local.renderPending=false;render();}else local.renderPending=true;};
  const getStats = () => {
    const k=local.knowledge||{},s=k.stats||{},sources=list(k.sources);
    return {count:s.collected_count??s.source_count??s.total_sources??sources.filter(x=>x.status==='collected'||x.chunk_count>0).length,chunks:s.chunk_count??s.total_chunks??sources.reduce((a,x)=>a+(x.chunk_count||0),0),official:s.official_source_count??s.official_count??sources.filter(x=>(x.status==='collected'||x.chunk_count>0)&&(x.source_url||x.url)).length,last:s.last_fetched_at??s.last_collected_at??s.last_ingested_at??s.latest_collected_at??sources.map(x=>x.collected_at||x.fetched_at).filter(Boolean).sort().at(-1)};
  };

  async function loadKnowledge(){
    try{local.knowledge=await api('/knowledge/sources');local.knowledgeError=null;}
    catch(error){local.knowledgeError=error.message;}
  }
  async function loadRulebook(){try{local.rulebook=await api('/rulebook');}catch(error){local.rulebookError=error.message;}}
  async function init(){await Promise.all([loadKnowledge().then(repaint),loadRulebook()]);repaint();if(!local.timer)local.timer=setInterval(poll,4500);}
  async function poll(){
    if(local.polling||!session.user||document.hidden)return;
    local.polling=true;
    try{
      const state=getState();let changed=false;
      if(current()&&['case','agent'].includes(state.view)){
        const caseId=current().id;
        const fresh=await api('/cases/'+encodeURIComponent(caseId));
        if(current()?.id===caseId&&JSON.stringify(current())!==JSON.stringify(fresh)){
          // Keep the version the user started editing; the API must detect a
          // conflicting update instead of silently saving against a newer one.
          if(canRender()){state.current=fresh;changed=true;}else local.renderPending=true;
        }
      }
      if(state.view==='cases'&&++local.pollTick%2===0){
        const result=await api(`/cases?limit=25&offset=${state.offset}`);
        const cases=list(result.cases||result);
        if(JSON.stringify(cases)!==JSON.stringify(state.cases)){state.cases=cases;state.total=result.total??cases.length;changed=true;}
      }
      if(local.intake&&active(local.intake)){
        local.intake=await api('/intake-runs/'+encodeURIComponent(local.intake.id||local.intake.run_id));changed=true;
        const caseId=local.intake.result?.case_id||local.intake.case_id;
        if(!active(local.intake)&&caseId){notify('상담 분석과 첫 검토본이 준비되었습니다. 확인할 항목을 검토하세요.');const waiting=state.view==='cases';await load();if(waiting)await openCase(caseId);}
      }
      if(local.ingestion&&active(local.ingestion)){
        local.ingestion=await api('/knowledge/runs/'+encodeURIComponent(local.ingestion.id||local.ingestion.run_id));changed=true;
        if(!active(local.ingestion)){
          await loadKnowledge();notify(local.ingestion.status==='failed'?'자료 수집 결과를 확인하세요.':'자료 수집을 마쳤습니다. 원문과 수집 결과를 확인하세요.',local.ingestion.status==='failed'?'error':'success');
          const sourceId=local.refreshSourceId;local.refreshSourceId=null;
          if(sourceId&&document.querySelector('dialog[open]')?.dataset.sourceId===sourceId)await showSource(sourceId);
        }
      }
      if(changed||local.renderPending)repaint();
    }catch(error){local.pollError=error.message;}finally{local.polling=false;}
  }

  function intakePanel(){
    const run=local.intake;
    return `<section class="ax-intake card" aria-label="상담 회의록으로 사건 시작"><div class="ax-intake-intro"><span class="ax-symbol">${icon('spark')}</span><div><div class="eyebrow">FROM CONSULTATION TO FIRST DRAFT</div><h2>상담 회의록으로 사건 시작</h2><p>회의록을 넣으면 사건 정보와 필요 서류를 정리하고, 확인할 값과 첫 초안을 준비합니다.</p></div></div><form id="ax-intake-form"><label class="field"><span>상담 회의록</span><textarea name="text" id="intake-text" minlength="20" maxlength="50000" placeholder="상담자의 이름, 거주 지역, 소득·채무·재산과 상담 내용을 그대로 붙여 넣으세요. 확인되지 않은 항목은 미확인으로 남깁니다." ${active(run)?'disabled':''}>${esc(local.intakeText)}</textarea></label><div class="ax-intake-footer"><label class="ax-file-choice">${icon('upload')}<span>또는 회의록 파일</span><input type="file" name="file" accept=".txt,.docx,.pdf" ${active(run)?'disabled':''}></label><button class="button" type="submit" ${active(run)?'disabled':''}>${icon('spark')}${active(run)?'상담 내용을 처리하고 있습니다':'상담 분석 · 사건 만들기'}</button></div><p class="ax-form-note">TXT · DOCX · PDF 중 하나를 올리거나 내용을 붙여 넣으세요. 진행 이력을 확인하고 검토 요청이 온 항목만 보완하세요.</p></form>${local.intakeError?`<div class="callout warning" role="alert">${esc(local.intakeError)}</div>`:''}${run?`<div class="ax-intake-status" aria-live="polite"><div class="row between"><strong>${active(run)?'실제 처리 상태':'상담 분석 결과'}</strong>${runBadge(run)}</div>${stepsView(run.steps)}${errorView(run.error)}${run.result?.case_id?`<button class="button secondary small" data-case="${esc(run.result.case_id)}">생성된 사건 열기 ${icon('arrow')}</button>`:''}</div>`:''}</section>`;
  }

  function dashboard(){
    const cases=getState().cases, reviewed=cases.filter(c=>c.ax_status),pending=cases.reduce((n,c)=>n+(Number(c.ax_finding_count)||0),0),s=getStats();
    return `${completedConsultationPanel()}<section class="ax-overview-strip" aria-label="자동 검토와 수집 현황"><div><div class="eyebrow">CONNECTED WORK</div><strong>새 자료가 들어오면, 다음 작업까지 이어집니다.</strong><p>서류 요청 → 제출 검증·보완 → 추출 검증 → 쟁점·계산 → 문서 작성</p></div><button class="ax-mini-stat" data-nav="agent"><strong>${pending}<span>건</span></strong><span>현재 목록의 검토 제안</span></button><button class="ax-mini-stat" data-nav="knowledge"><strong>${local.knowledge?s.count:'—'}<span>개</span></strong><span>수집해 읽을 수 있는 원문</span></button></section>${reviewed.length?`<section class="card ax-queue"><div class="card-head"><div><div class="overline">RECEIVED → REVIEW → ACTION</div><h2>사건별 자동 검토 현황</h2></div><button class="button subtle small" data-nav="agent">검토 작업실 ${icon('arrow')}</button></div><div class="ax-queue-list">${reviewed.slice(0,4).map(c=>`<button class="ax-queue-row" data-case="${esc(c.id)}"><span class="avatar">${esc(c.client_name?.slice(0,1))}</span><span class="ax-queue-person"><strong>${esc(c.client_name)}</strong><small>${esc(c.court_name)} · ${c.ax_last_at?date(c.ax_last_at,true):'검토 기록 있음'}</small></span><span class="ax-queue-status">${runBadge({status:c.ax_status})}<small>${Number(c.ax_finding_count)||0}건 확인 필요</small></span>${icon('chevron')}</button>`).join('')}</div></section>`:''}`;
  }

  function completedConsultationPanel(){
    return `<details class="card consultation-import"><summary>이미 완료한 세부 상담 기록으로 사건 등록</summary><p class="small muted">고객의 신규 신청은 아래 사건 목록에서 세부 상담을 요청하세요. 이 메뉴는 담당자가 이미 진행한 전화·대면 상담의 기록을 등록할 때 사용합니다.</p>${intakePanel()}</details>`;
  }

  function stepsView(steps){
    return list(steps).length?`<ol class="ax-run-steps">${steps.map((step,index)=>{const value=typeof step==='string'?{title:step}:step;const name=value.title||value.label||value.name||value.step||value.id;return `<li class="${['completed','done','success'].includes(value.status)?'done':active(value)?'current':''}"><span>${['completed','done','success'].includes(value.status)?icon('check'):index+1}</span><div>${esc(name)}${value.detail||value.message?`<small>${esc(value.detail||value.message)}</small>`:''}</div>${value.status?`<small>${esc(statusNames[value.status]||({done:'완료',success:'완료',skipped:'미실행',blocked:'확인 필요'})[value.status]||value.status)}</small>`:''}</li>`;}).join('')}</ol>`:'';
  }
  function errorView(error){const message=typeof error==='string'?error:error?.message;return message?`<div class="callout warning ax-gap">${icon('info')}<div>${esc(message)}</div></div>`:'';}

  function pipeline(){
    const c=current();if(!c)return '';
    if((c.ax_pipeline||consultationPending(c))&&pipelineView)return pipelineView();
    const a=c.automation||{},drafts=list(c.drafts),candidates=activeCandidates(),docs=list(c.documents),latest=drafts.at(-1);
    const info=[['상담 분석',c.consultation?.notes||c.consultation?.answers||a.intake_run_id?'기록 있음':'회의록 확인'],['서류 준비',`${list(c.requests).length}건 요청`],['수집 검사',`${docs.length}개 수신`],['추출값 검토',`${candidates.length}개 후보`],['초안 생성',`${drafts.length}개 검토본`],['변호사 검토',['approved','reviewed'].includes(latest?.status)?'검토 완료':'검토 대기']];
    return `<section class="card ax-pipeline-card"><div class="card-head"><div><div class="overline">CASE AUTOMATION</div><h2>상담에서 변호사 검토까지</h2><p class="small muted ax-gap">${esc(c.client_name)} · ${esc(c.region||'거주지역 확인 필요')} · ${esc(c.case_type_label||'사건유형 확인 필요')}</p></div><div class="row wrap"><button class="button secondary small" data-action="ax-intake-review">사건 분류 확인·수정</button>${a.stage?badge('pending',a.label||({intake:'상담 분석',collecting:'자료 수집',review:'담당자 검토',draft:'초안 준비',lawyer_review:'변호사 검토',needs_review:'담당자 검토'})[a.stage]||a.stage):badge('pending','담당자 검토')}</div></div><ol class="ax-pipeline">${info.map(([title,detail],i)=>`<li><span>${i+1}</span><strong>${title}</strong><small>${esc(detail)}</small></li>`).join('')}</ol>${a.summary?`<p class="small muted ax-pipeline-summary">${esc(a.summary)}</p>`:''}${c.intake_analysis?`<div class="ax-pipeline-summary"><div class="row wrap"><strong class="small">상담 회의록 분석</strong>${runBadge(c.intake_analysis)}</div>${modelLine(c.intake_analysis)}${errorView(c.intake_analysis.error)}</div>`:''}</section>`;
  }

  function targetName(key){return current()?.rule_evaluation?.draft_targets?.[key]||local.rulebook?.document_targets?.[key]||key;}
  function factorName(key){return list(current()?.rule_evaluation?.factor_definitions||local.rulebook?.factors).find(f=>f.key===key)?.label||key;}
  function ruleCard(rule,matched=false){
    const refs=list(rule.trigger_refs),condition=rule.condition||{};
    return `<article class="ax-rule-card"><span class="badge gray">${esc(rule.id)} · ${matched?'이번 사건에 적용':'서류 준비 규칙'}</span><h3>${esc(rule.title)}</h3>${refs.length?`<blockquote class="ax-evidence"><strong>판단에 사용한 상담·자료 내용</strong><p>“${esc(refs[0].quote)}”</p></blockquote>`:condition.always?'<p class="small muted">모든 사건의 기본 확인 항목</p>':`<p class="small muted">확인 조건 · ${list(condition.any_keywords).map(esc).join(', ')}</p>`}<dl class="ax-gap"><dt>필요 서류</dt><dd>${list(rule.required_documents).map(d=>esc(typeof d==='string'?d:d.name||d.title||d.catalog_id)).join(' · ')||'개별 확인'}</dd><dt>추출할 값</dt><dd>${list(rule.required_factors).map(key=>esc(factorName(key))).join(' · ')}</dd><dt>초안 반영</dt><dd>${list(rule.draft_targets).map(key=>esc(targetName(key))).join(' → ')}</dd></dl>${rule.reason?`<p class="small muted ax-gap">${esc(rule.reason)}</p>`:''}${list(rule.missing_factors).length?`<p class="ax-missing-fields">미확인 · ${list(rule.missing_factors).map(key=>esc(factorName(key))).join(' · ')}</p>`:''}</article>`;
  }
  function matchedRules(){
    const rules=list(current()?.rule_evaluation?.matched_rules);if(!rules.length)return '';
    return `<section class="card ax-section-gap" style="margin-bottom:20px"><div class="card-head"><div><div class="overline">SITUATION → DOCUMENT → FACTOR → DRAFT</div><h2>이번 사건에 적용된 업무 규칙</h2></div>${badge('pending',`${rules.length}개 조건`)}</div><div class="card-body"><div class="ax-rule-grid">${rules.slice(0,2).map(rule=>ruleCard(rule,true)).join('')}</div>${rules.length>2?`<details class="ax-source-details"><summary>나머지 ${rules.length-2}개 규칙과 근거 보기</summary><div class="ax-rule-grid ax-gap">${rules.slice(2).map(rule=>ruleCard(rule,true)).join('')}</div></details>`:''}<p class="small muted ax-gap">상황별 서류 준비·초안 구성 규칙입니다. 법률상 결론과 인정 여부는 변호사가 검토합니다.</p></div></section>`;
  }
  function extractionTarget(item){
    const rules=list(current()?.rule_evaluation?.matched_rules).filter(r=>list(r.required_factors).includes(item.key));
    const targets=[...new Set(rules.flatMap(r=>list(r.draft_targets)))];
    return rules.length?`<small class="cell-sub">${rules.map(r=>esc(r.id)).join(' · ')}<br>${targets.map(key=>esc(targetName(key))).join(' · ')}</small>`:'';
  }
  function factorValue(item){
    if(typeof item.value==='boolean'){
      const subject=['real_estate_ownership','vehicle_ownership','housing_ownership'].includes(item.key)?'소유':item.key==='insurance_contracts'?'보험계약':item.key==='pension_membership'?'가입':'해당';
      return `${subject} 기재 ${item.value?'있음':'없음'}`;
    }
    if(typeof item.value!=='number')return asText(item.value);
    const amountKeys=['monthly_income','total_debt','living_expenses','assets_total','housing_cost','housing_deposit','business_revenue','business_expenses','remaining_debt','tax_arrears','insurance_surrender'];
    return item.value.toLocaleString('ko-KR')+(item.unit==='KRW'||amountKeys.includes(item.key)?'원':['household_size','dependent_count','children_count'].includes(item.key)?'명':'');
  }
  function factorContext(item){
    const frequency={annual:'연간 합계',monthly:'월 기준',period:'기간 합계',transaction:'개별 거래',as_of:'기준일 잔액'}[item.frequency];
    const basis={gross:'공제 전',net:'실수령',deductions:'공제 합계',deduction:'공제 항목',transaction:'거래 내역',balance:'잔액'}[item.basis||item.amount_basis];
    const period=item.period_start||item.period_end?`${item.period_start||'시작일 미확인'} ~ ${item.period_end||'종료일 미확인'}`:'';
    const details=[frequency,basis,period].filter(Boolean);
    return details.length?`<small class="cell-sub">${details.map(esc).join(' · ')}</small>`:'';
  }
  function factorLocation(item){
    const start=Number(item.line_start),end=Number(item.line_end);
    return Number.isInteger(start)&&start>0?` · ${start}${Number.isInteger(end)&&end>start?'–'+end:''}행`:'';
  }
  function knowledgeTabs(){return `<nav class="ax-knowledge-tabs" aria-label="지식함 종류"><button class="button secondary small ${local.knowledgeTab==='sources'?'active':''}" data-action="ax-knowledge-tab" data-tabid="sources">${icon('file')} 수집 원문</button><button class="button secondary small ${local.knowledgeTab==='rules'?'active':''}" data-action="ax-knowledge-tab" data-tabid="rules">${icon('check')} 실행 업무 규칙 ${local.rulebook?list(local.rulebook.rules).length:''}</button></nav>`;}
  function rulebookView(){
    const book=local.rulebook;
    return `<div class="page-heading"><div><div class="eyebrow">EXECUTABLE WORKFLOW RULEBOOK</div><h1>수집 지식함</h1><p class="page-subtitle">상황에 따라 요청할 서류, 읽어낼 값과 초안에 반영할 항목을 연결합니다.</p></div></div>${knowledgeTabs()}${book?`<section class="card"><div class="card-head"><h2>실행되는 판단 기준</h2>${badge('pending',`${list(book.rules).length}개 규칙 · ${list(book.factors).length}개 추출 항목`)}</div><div class="card-body"><div class="callout neutral">상담과 원문의 조건을 확인해 서류와 확인할 값을 준비합니다. 완료된 자료로 쟁점과 변제액을 분석하고, 추가 판단이 필요한 항목은 변호사 검토로 연결합니다.</div><div class="ax-rule-grid ax-section-gap">${list(book.rules).map(rule=>ruleCard(rule)).join('')}</div></div></section>`:empty('업무 규칙을 불러오지 못했습니다',local.rulebookError||'다시 확인해 주세요.')}`;
  }

  function caseReview(){
    if(consultationPending(current()))return pipeline();
    const runs=allRuns(),run=runs.find(item=>['running','processing'].includes(item.status))||runs.find(active)||runs[0];
    return `${pipeline()}${draftsView(true)}${appliedWork()}${matchedRules()}${documentChecks()}${extractions(true)}<section class="card ax-case-review"><div class="card-head"><div><div class="overline">EVIDENCE → RECOMMENDATION → ACTION</div><h2>자동으로 찾은 확인 사항</h2></div><button class="button secondary small" data-action="run-agent" data-kind="case_review" ${active(run)?'disabled':''}>${icon('spark')}${active(run)?'검토 중':'지금 검토'}</button></div><div class="card-body">${run?runView(run,true):`<div class="ax-review-empty"><span class="ax-symbol">${icon('spark')}</span><div><strong>새 자료와 고객 회신을 검토 작업으로 연결합니다.</strong><p>자료를 받으면 자동 검토가 시작됩니다. 기존 사건은 ‘지금 검토’로 누락 자료와 확인할 쟁점을 살펴보세요.</p><button class="button subtle small" data-nav="knowledge">수집된 근거 확인 ${icon('arrow')}</button></div></div>`}</div></section>`;
  }

  function extractions(compact=false){
    const items=activeCandidates();if(!items.length)return '';
    return `<section class="card ax-extractions"><div class="card-head"><div><div class="overline">EXTRACTED FROM YOUR DOCUMENTS</div><h2>읽어낸 값과 확인할 근거</h2></div>${badge('needs_review',`${items.length}개 추출 후보`)}</div><div class="table-wrap"><table><thead><tr><th>항목</th><th>추출한 값</th><th>원문 근거</th><th>확인 상태</th></tr></thead><tbody>${(compact?items.slice(0,5):items).map(item=>`<tr><td><strong>${esc(item.label||item.key)}</strong>${extractionTarget(item)}</td><td class="ax-extracted-value">${esc(factorValue(item))}${factorContext(item)}<small class="cell-sub">${isModelFinding(item)?esc(modelFindingLabel(item)):item.origin==='human_correction'?'담당자 정정':'규칙·원문 추출'}</small></td><td class="ax-extracted-quote">${item.quote?`<q>${esc(item.quote)}</q>`:'인용 근거 확인 필요'}<small>${esc(current()?.documents?.find(d=>d.id===item.document_id)?.filename||kindNames[item.source_type]||item.source_type||'상담 원문')}${factorLocation(item)}${item.page?` · ${esc(item.page)}쪽`:''}</small>${item.document_id?`<button class="button subtle small" data-action="download-doc" data-id="${esc(item.document_id)}">원문 확인 ${icon('download')}</button>`:''}</td><td>${badge(item.status||'pending',reviewNames[item.status]||'확인 전 후보')}${!item.status||item.status==='pending'||item.status==='proposed'||item.status==='candidate'?`<button class="button subtle small" data-action="ax-confirm-extraction" data-id="${esc(item.id)}">근거 검토</button>`:''}</td></tr>`).join('')}</tbody></table></div><p class="small muted ax-table-note">${compact&&items.length>5?`<button class="button subtle small" data-tab="verify">${items.length}개 추출값 전체 보기 ${icon('arrow')}</button><br>`:''}추출값은 원문을 대조한 후 확정합니다. 미확인 값은 초안에서도 검토 대상으로 표시됩니다.${list(current()?.extraction_candidates).length>items.length?` 이전 추출·반려·격리된 ${list(current()?.extraction_candidates).length-items.length}개 항목은 이 목록에서 제외했습니다.`:''}</p></section>`;
  }

  function documentCheck(document){
    const check=document.automated_check;
    const ocr=document.ocr_summary?.ocr_pages?.length?`<div class="ax-document-check"><strong>한국어 스캔 OCR · ${document.ocr_summary.ocr_pages.length}쪽</strong><p>${document.ocr_summary.review_required?'일부 판독 행은 직접 확인이 필요합니다.':'텍스트 판독 완료 · 원문 대조 전입니다.'}${list(document.ocr_summary.unreadable_pages).length?' 미판독: '+document.ocr_summary.unreadable_pages.join(', ')+'쪽':''}</p><button class="button subtle small" data-action="ocr-detail" data-id="${esc(document.id)}">쪽별 텍스트·신뢰도 확인</button></div>`:'';
    const states={sufficient_candidate:'요구 범위 충족 후보 · 검증 전',needs_more:'추가 확인 필요',needs_ocr:'본문 판독 필요',unreadable:'본문 판독 필요',mismatch:'인물·범위 불일치',manual_review:'직접 검토 필요',not_applicable:'참조 자료'};
    const previous=`${ocr}${check?`<div class="ax-document-check"><div class="row between wrap"><strong>${icon('check')} ${esc(check.classification||'자료 종류 확인')}</strong>${badge(check.coverage_status==='sufficient_candidate'?'needs_review':'missing',states[check.coverage_status]||check.coverage_status||'확인 필요')}</div><p>${esc(check.reason)}</p>${list(check.missing).length?`<small>남은 확인 · ${list(check.missing).map(esc).join(' · ')}</small>`:''}${check.classification_quote?`<small>분류 근거 · “${esc(check.classification_quote)}”</small>`:''}<small>규칙 검사 결과 · 최종 원문 대조 전</small></div>`:''}`;
    if(document.status==='verified'&&document.verified_by&&document.auto_verified!==true)return `<div class="ax-document-check ax-manual-check"><strong>${icon('check')} 담당자 원문 확인 완료</strong><p>담당자가 제출 원문을 확인한 상태입니다.${document.verified_at?' · '+date(document.verified_at,true):''}</p></div>${previous?`<details class="ax-check-history"><summary>이전 자동 판독·규칙 검사 이력</summary>${previous}</details>`:''}`;
    return previous;
  }
  function documentChecks(){
    const docs=list(current()?.documents).filter(d=>d.automated_check);if(!docs.length)return '';
    return `<section class="card ax-section-gap" style="margin-bottom:20px"><div class="card-head"><div><div class="overline">RECEIVED DOCUMENT CHECK</div><h2>제출 자료의 범위 확인</h2></div><button class="button subtle small" data-tab="verify">자료 검증 ${icon('arrow')}</button></div><div class="card-body">${docs.slice(-2).reverse().map(d=>`<div class="list-item"><strong class="small">${esc(d.filename||d.name)}</strong>${documentCheck(d)}</div>`).join('')}${docs.length>2?`<p class="small muted ax-gap">총 ${docs.length}개 파일을 검사했습니다. 자료 검증에서 전체 결과를 확인하세요.</p>`:''}</div></section>`;
  }
  function appliedWork(){
    const tasks=list(current()?.tasks),history=list(current()?.automation_history).slice(-4).reverse();
    if(!tasks.length&&!history.length)return '';
    return `<section class="card ax-section-gap" style="margin-bottom:20px"><div class="card-head"><div><div class="overline">CHANGES IN YOUR WORKSPACE</div><h2>실제로 반영된 업무</h2></div>${badge('pending',`${tasks.filter(t=>!['completed','closed','resolved'].includes(t.status)).length}개 검토 작업`)}</div><div class="card-body">${tasks.length?tasks.slice(-6).reverse().map(task=>`<div class="task-row"><div class="task-icon">${icon('check')}</div><div><strong>${esc(task.title)}</strong><p>${esc(task.description||'자료와 상황을 확인하고 담당자 판단을 기록하세요.')}</p><p>${esc(task.assigned_to||'담당 직원')} · ${esc(reviewNames[task.status]||({open:'확인 필요',completed:'완료',closed:'완료',resolved:'검토 완료'})[task.status]||task.status||'확인 필요')}</p></div><button class="button secondary small" data-tab="verify">근거 확인</button></div>`).join(''):''}${history.length?`<div class="ax-gap"><div class="eyebrow">자동화 · 검토 이력</div>${history.map(event=>`<div class="timeline-row"><span class="timeline-dot"></span><div><strong>${esc(activityLabel(event.trigger||event.action))}</strong><p>${date(event.at||event.created_at,true)}${event.actor?' · '+esc(event.actor):''}${event.reason?' · '+esc(event.reason):''}</p></div></div>`).join('')}</div>`:''}</div></section>`;
  }

  function draftReviewStatus(d){
    const review=d.ai_review||{},pending=list(d.review_pending);
    return `<div class="ax-gap"><p class="small muted">${review.passed?'AI 문서 대조 완료 · 담당자 보완·승인 필요':review.status==='pending'?'AI 문서 검토 대기':'AI 검토 결과와 미확정 항목을 확인해 주세요.'}</p>${pending.length?`<ul class="ax-review-reasons">${pending.map(item=>`<li>${esc(humanText(item.reason||item.message||'작성 근거를 추가 확인해 주세요.'))}</li>`).join('')}</ul>`:''}${d.human_review_required?'<p class="small muted">1차 작성본입니다. 최종 승인 전에는 제출 준비 완료로 처리되지 않습니다.</p>':''}</div>`;
  }
  function draftsView(compact=false){
    const drafts=list(current()?.drafts);if(!drafts.length)return '';
    return `<section class="card ax-drafts"><div class="card-head"><div><div class="overline">FIRST DRAFT · HUMAN REVIEW</div><h2>준비된 1차 검토 문서</h2></div>${compact&&drafts.length>1?`<button class="button subtle small" data-tab="bundles">작성 이력 ${drafts.length}개 ${icon('arrow')}</button>`:badge('draft',`${drafts.length}개`)}</div><div class="card-body">${drafts.slice(compact?-1:-3).reverse().map(d=>`<article class="ax-draft"><div class="row between wrap"><div><h3>${esc(d.title||'개인회생 검토 초안')}</h3><p class="small muted">${date(d.created_at,true)} · ${d.version?`문서 버전 ${esc(d.version)}`:'원문과 추출 후보로 작성'}</p></div>${badge(d.status||'draft',d.stale?'자료 변경 · 재작성 필요':reviewNames[d.status]||'검토 전 초안')}</div>${draftReviewStatus(d)}${list(d.missing_fields).length?`<p class="ax-missing-fields">확인할 항목 · ${list(d.missing_fields).map(x=>esc(typeof x==='string'?x:x.label||x.key)).join(' · ')}</p>`:''}<div class="row wrap ax-gap"><button class="button secondary small" data-action="ax-view-draft" data-id="${esc(d.id)}">${icon('file')} 초안 펼쳐보기</button><button class="button secondary small" data-action="ax-download-draft" data-id="${esc(d.id)}">${icon('download')} Word 다운로드</button>${session.user?.role==='lawyer'?`<button class="button small" data-action="ax-review-draft" data-id="${esc(d.id)}" ${d.stale?'disabled':''}>${icon('scale')} 변호사 검토</button>`:'<span class="small muted">작성·검토 이력에서 확인할 수 있습니다.</span>'}</div>${d.review_reason||d.review?.reason?`<p class="small muted ax-gap">검토 기록 · ${esc(d.review_reason||d.review.reason)}</p>`:''}</article>`).join('')}</div></section>`;
  }

  function evidenceView(ref,run){
    const source=list(run.retrieved_sources).find(s=>s.id===ref.source_id||s.source_id===ref.source_id)||{};
    const corpusId=ref.corpus_source_id||source.corpus_source_id||source.source_id||ref.source_id;
    const corpusSource=list(local.knowledge?.sources).find(s=>s.id===corpusId);
    const doc=current()?.documents?.find(d=>d.id===ref.document_id);
    return `<blockquote class="ax-evidence"><div><strong>${esc(ref.title||source.title||doc?.filename||ref.source_id||'원문 근거')}</strong>${ref.page||source.page?`<small>${esc(ref.page||source.page)}쪽</small>`:''}</div>${ref.quote?`<p>“${esc(ref.quote)}”</p>`:''}<div class="row wrap">${ref.document_id?`<button class="button subtle small" data-action="download-doc" data-id="${esc(ref.document_id)}">사건 원문 확인 ${icon('download')}</button>`:''}${corpusSource&&!ref.document_id?`<button class="button subtle small" data-action="ax-source" data-id="${esc(corpusId)}">근거 내용 보기 ${icon('arrow')}</button>`:''}${link(ref.url||ref.source_url||source.source_url||source.url)}</div></blockquote>`;
  }
  function findingView(f,run){
    const action=f.action||{},review=f.review_status||'pending',pending=review==='pending',stale=run.status==='stale'||run.stale;
    const refs=list(f.evidence_refs||f.citations),official=list(f.official_refs);
    return `<article class="ax-finding" data-finding="${esc(f.id)}"><div class="row between wrap"><div class="row wrap"><span class="badge ${isModelFinding(f)?'blue':'gray'}">${modelFindingLabel(f)}</span>${f.severity==='high'||f.severity==='critical'?badge('missing','우선 확인'):''}</div>${badge(review==='applied'?'verified':review==='dismissed'?'pending':'needs_review',reviewNames[review]||review)}</div><h3>${esc(f.title)}</h3>${f.extracted_fact?`<div class="ax-finding-value"><strong>${esc(factorValue(f.extracted_fact))}</strong><span>추출 후보 · 근거 검토 전</span></div>`:''}<p class="ax-observation">${esc(f.observation)}</p>${refs.map(ref=>evidenceView(ref,run)).join('')}${official.length?`<details class="ax-official-refs"><summary>함께 검색된 공식 자료 ${official.length}개</summary>${official.map(ref=>typeof ref==='string'?`<button class="button subtle small" data-action="ax-source" data-id="${esc(ref)}">${esc(ref)}</button>`:evidenceView(ref,run)).join('')}</details>`:''}${action.type?`<div class="ax-proposed-action"><span>${icon(action.type==='document_request'?'file':action.type==='correction_draft'?'message':'check')}</span><div><strong>${esc(actionNames[action.type]||'검토 작업')}</strong><p>${esc(action.reason||action.title||'제안 내용을 검토한 뒤 업무에 반영합니다.')}</p>${action.period?`<small>기간·범위 · ${esc(action.period)}</small>`:''}</div></div>`:''}${f.review_reason||f.review?.reason?`<p class="small muted ax-gap">검토 사유 · ${esc(f.review_reason||f.review.reason)}</p>`:''}<div class="row wrap ax-finding-actions">${pending?`<button class="button small" data-action="ax-apply" data-run="${esc(run.id)}" data-id="${esc(f.id)}" ${stale||!action.type?'disabled':''}>${icon('check')}${esc(actionNames[action.type]||'업무에 반영')}</button><button class="button subtle small" data-action="ax-dismiss" data-run="${esc(run.id)}" data-id="${esc(f.id)}" ${stale?'disabled':''}>반려</button>`:`<span class="small muted">${review==='applied'?'업무 목록과 검토 이력에 반영되었습니다.':'반려 사유가 검토 이력에 남았습니다.'}</span>`}${stale?'<span class="small muted">최신 자료로 다시 검토하세요.</span>':''}</div></article>`;
  }
  function modelLine(run){
    const metrics=run.metrics||{};
    return metrics.partial_output?'<p class="small muted ax-gap">근거를 확인한 항목만 반영했습니다. 나머지 항목은 원문 확인이 필요합니다.</p>':'';
  }
  function runView(run,compact=false){
    const findings=list(run.findings).slice().sort((a,b)=>Number(isModelFinding(b))-Number(isModelFinding(a))),sources=list(run.retrieved_sources),visible=compact?findings.slice(0,3):findings;
    return `<div class="ax-run" data-run-id="${esc(run.id)}"><div class="row between wrap"><div><strong>${run.kind==='correction'?'보정 요구와 제출 자료 대조':'사건 자료와 필요한 다음 작업'}</strong><p class="small muted">${runDate(run)} · ${esc(triggerNames[run.trigger]||activityLabel(run.trigger)||'담당자 실행')}${run.input_revision?` · 입력 ${esc(run.input_revision)}`:''}</p></div>${runBadge(run)}</div>${modelLine(run)}${run.summary?`<div class="ax-run-summary">${structuredHtml(run.summary)}</div>`:''}${active(run)?`<div class="ax-live-status" role="status"><span class="spinner"></span><span>서버에서 검토하고 있습니다. 완료되면 이 화면에 결과가 표시됩니다.</span></div>`:''}${stepsView(run.steps)}${errorView(run.error)}${run.status==='rulebook_only'?'<div class="callout neutral ax-gap">현재 결과는 문서·업무 규칙으로 찾은 항목입니다. 모델의 검증을 통과한 제안은 없습니다.</div>':''}${run.status==='stale'?'<div class="callout warning ax-gap">검토 이후 사건 자료가 변경되었습니다. 현재 자료로 검토를 다시 실행하세요.</div>':''}<div class="ax-findings">${visible.map(f=>findingView(f,run)).join('')}</div>${!findings.length&&!active(run)?'<p class="small muted ax-gap">검토를 통과한 제안이 없습니다. 원문과 실행 상태를 확인하세요.</p>':''}${compact&&findings.length>3?`<button class="button secondary small ax-gap" data-nav="agent">제안 ${findings.length}건 모두 검토 ${icon('arrow')}</button>`:''}${sources.length?`<details class="ax-source-details"><summary>이번 검토에서 검색한 근거 ${sources.length}개</summary><div class="ax-source-list">${sources.map(source=>`<article><strong>${esc(source.title||source.id)}</strong><small>${esc(kindNames[source.kind]||source.kind||'사건 근거')}${source.page?` · ${esc(source.page)}쪽`:''}</small><p>${esc(source.text||source.quote||source.excerpt||'')}</p>${link(source.source_url||source.url)}${source.source_id||source.corpus_source_id?`<button class="button subtle small" data-action="ax-source" data-id="${esc(source.source_id||source.corpus_source_id)}">수집 원문 보기</button>`:''}</article>`).join('')}</div></details>`:''}${list(run.limitations).length?`<p class="small muted ax-gap">${list(run.limitations).map(esc).join(' ')}</p>`:''}</div>`;
  }

  function agentView(){
    const c=current(),runs=allRuns();
    return `<div class="page-heading"><div><div class="eyebrow">AI · EVIDENCE · ACTION</div><h1>검토 결과를 실제 다음 작업으로</h1><p class="page-subtitle">규칙 검사와 AI 제안을 구분하고, 원문을 확인한 항목을 업무에 반영합니다.</p></div><button class="button secondary small" data-nav="knowledge">${icon('search')} 수집 지식함</button></div>
      <section class="card"><div class="card-body ax-agent-controls"><label class="field"><span>검토할 사건</span><select id="agent-case"><option value="">사건 선택</option>${getState().cases.map(x=>`<option value="${esc(x.id)}" ${c?.id===x.id?'selected':''}>${esc(x.client_name)} · ${esc(x.court_name)}</option>`).join('')}</select></label><button class="button" data-action="run-agent" data-kind="case_review" ${!c||active(runs[0])?'disabled':''}>${icon('spark')} 사건 검토 실행</button><button class="button secondary" data-action="run-agent" data-kind="correction" ${!c||active(runs[0])?'disabled':''}>보정 검토 실행</button></div></section>
      ${c?`<section class="card ax-section-gap"><div class="card-head"><h2>실행 기록과 검토 제안</h2><div class="row wrap"><button class="button secondary small" data-action="refresh">${icon('refresh')} 새로고침</button><button class="button subtle small" data-case="${esc(c.id)}">사건으로 돌아가기 ${icon('arrow')}</button></div></div><div class="card-body">${runs.length?runView(runs[0])+ (runs.length>1?`<details class="ax-source-details"><summary>이전 실행 기록 ${runs.length-1}개</summary>${runs.slice(1,5).map(r=>runView(r)).join('')}</details>`:''):empty('아직 자동 검토 기록이 없습니다','검토 실행으로 사건 근거와 수집된 공식 자료를 대조할 수 있습니다.')}</div></section>
      <details class="ax-section-gap ax-context-details"><summary>사건의 초안·업무 규칙·추출값 확인</summary><div class="ax-section-gap">${pipeline()}${draftsView(true)}${appliedWork()}${matchedRules()}${documentChecks()}${extractions(true)}</div></details>`:empty('검토할 사건을 선택하세요','상담 회의록으로 사건을 만들거나 기존 사건을 선택해 주세요.')}`;
  }

  function knowledgeView(){
    if(local.knowledgeTab==='rules')return rulebookView();
    const k=local.knowledge,s=getStats(),sources=list(k?.sources),results=local.results,courts=getState().registry?.courts||[];
    return `<div class="page-heading"><div><div class="eyebrow">COLLECTED & SEARCHABLE SOURCES</div><h1>수집 지식함</h1><p class="page-subtitle">실제 저장한 본문을 검색하고, 출처와 수집 시각을 확인합니다.</p></div><button class="button secondary small" data-action="ax-ingest" ${active(local.ingestion)?'disabled':''}>${icon('refresh')}${active(local.ingestion)?'원문 수집 중':'공식 자료 수집'}</button></div>${knowledgeTabs()}${local.knowledgeError?`<div class="callout warning ax-gap" role="alert">${esc(local.knowledgeError)}<button class="button secondary small" data-action="ax-reload-knowledge">다시 확인</button></div>`:''}<div class="ax-knowledge-stats"><div><strong>${k?s.count:'—'}<small>개 원문</small></strong><span>저장된 자료</span></div><div><strong>${k?s.chunks:'—'}<small>개 구간</small></strong><span>본문 검색 대상</span></div><div><strong>${k?s.official:'—'}<small>개</small></strong><span>공식 출처 자료</span></div><div><strong class="ax-stat-date">${s.last?date(s.last,true):'수집 기록 없음'}</strong><span>마지막 수집</span></div></div>${local.ingestion?`<section class="card ax-section-gap"><div class="card-body"><div class="row between"><strong>자료 수집 결과</strong>${runBadge(local.ingestion)}</div>${stepsView(local.ingestion.steps)}${errorView(local.ingestion.error)}${local.ingestion.result?`<details class="ax-source-details"><summary>자료별 수집 결과</summary>${structuredHtml(local.ingestion.result)}</details>`:''}</div></section>`:''}<section class="card ax-section-gap"><div class="card-body"><form id="ax-knowledge-search" class="ax-search-form"><label class="field"><span>수집된 원문 검색</span><input name="q" type="search" value="${esc(local.query)}" placeholder="예: 개인회생 신청서, 급여, 보정, 채권자목록" required maxlength="200"></label><label class="field"><span>적용 법원</span><select name="court_id"><option value="">전국 · 모든 법원</option>${list(courts).map(c=>`<option value="${esc(c.id)}" ${local.court===c.id?'selected':''}>${esc(c.name)}</option>`).join('')}</select></label><button class="button" type="submit" ${local.searching?'disabled':''}>${icon('search')} 본문 검색</button></form><p class="small muted">검색 결과의 기관·관할·시행일을 확인해 사건에 적용하세요. 참조 사례의 개별 조건은 전국 공통 기준이 아닙니다.</p></div></section>${results?`<section class="card ax-section-gap"><div class="card-head"><h2>본문 검색 결과</h2>${badge('pending',`${list(results.results||results).length}개`)}</div><div class="card-body">${list(results.results||results).map(result=>sourceCard(result,true)).join('')||empty('일치하는 본문이 없습니다','다른 검색어 또는 법원 범위를 선택해 주세요.')}</div></section>`:''}<section class="card ax-section-gap"><div class="card-head"><h2>수집 대상과 저장 결과</h2><span class="small muted">${sources.length}개</span></div><div class="card-body">${sources.map(source=>sourceCard(source)).join('')||empty('아직 저장된 원문이 없습니다','공식 자료 수집을 실행하면 실제 본문이 저장됩니다.')}</div></section>`;
  }
  function sourceCard(source,search=false){
    const id=source.source_id||source.id,url=source.source_url||source.url;
    const readable=search||Number(source.chunk_count)>0||['collected','stale'].includes(source.status);
    return `<article class="ax-source-card"><div class="row between wrap"><div class="row wrap"><span class="badge ${url?'green':'gray'}">${esc(kindNames[source.kind]||kindNames[source.source_kind]||kindNames[source.source_type]||source.kind||source.source_kind||source.source_type||'참조 자료')}</span>${source.court_name||source.court_id?badge('pending',source.court_name||source.court_id):''}</div><small class="muted">${source.status==='failed'?'수집 실패 · ':source.status==='pending'?'수집 대기 · ':source.status==='stale'?'이전 수집본 · ':''}${source.collected_at||source.fetched_at?date(source.collected_at||source.fetched_at,true):'수집 시각은 상세 원문에서 확인'}</small></div><h3>${esc(source.title||source.name||id)}</h3>${search?`<p class="ax-source-excerpt">${esc(source.text||source.excerpt||source.snippet||source.quote||'')}</p>`:''}<p class="small muted">${source.page?`${esc(source.page)}쪽 · `:''}${source.page_count!=null?`${esc(source.page_count)}쪽 · `:''}${source.chunk_count!=null?`${esc(source.chunk_count)}개 검색 구간 · `:''}${esc(source.publisher||source.authority||source.institution||'출처와 적용 범위 확인')}</p><div class="row wrap ax-gap"><button class="button secondary small" data-action="ax-source" data-id="${esc(id)}">${icon('file')} ${readable?'저장된 본문 읽기':source.status==='failed'?'수집 상태·오류 확인':'수집 상태 확인'}</button>${link(url)}</div>${source.warning||source.limitation?`<p class="small muted ax-gap">${esc(source.warning||source.limitation)}</p>`:''}${source.error?`<p class="small muted ax-gap">수집 오류 · ${esc(source.error)}</p>`:''}</article>`;
  }

  async function showSource(id){
    const el=modal('저장된 원문 확인',`<div class="loading" role="status"><span class="spinner"></span><p>저장된 본문을 불러오고 있습니다.</p></div>`);
    el.classList.add('ax-source-dialog');
    el.dataset.sourceId=id;
    const container=el.querySelector('.dialog-body');
    try{
      const result=await api('/knowledge/sources/'+encodeURIComponent(id));
      if(!el.isConnected)return;
      const source=result.source||result;
      const textOf=item=>typeof item==='string'?item:typeof item?.text==='string'?item.text:typeof item?.content==='string'?item.content:'';
      const pages=list(source.pages||result.pages).filter(p=>textOf(p).trim()),chunks=list(source.chunks||result.chunks).filter(p=>textOf(p).trim());
      const full=[source.full_text,source.body_text,source.text,source.content,result.full_text,result.text].find(value=>typeof value==='string'&&value.trim());
      const sections=pages.length?pages:full?[{text:full}]:chunks;
      const hasBody=sections.length>0;
      const header=el.querySelector('h2');if(header)header.textContent=source.title||'수집 원문';
      container.innerHTML=`<div class="ax-source-reader"><div class="row wrap">${badge(hasBody?'verified':'missing',hasBody?source.status==='stale'?'이전 저장 본문':'본문 저장됨':'본문 미확보')}${badge('pending',kindNames[source.kind]||kindNames[source.source_type]||'공식 원문')}${link(source.source_url||source.url)}</div><dl class="kv ax-gap"><dt>수집 시각</dt><dd>${source.collected_at||source.fetched_at?date(source.collected_at||source.fetched_at,true):'아직 수집되지 않았습니다.'}</dd><dt>시행·기준일</dt><dd>${esc(source.effective_date||'미확인')} · 사건 적용 시점 확인 필요</dd><dt>적용 범위</dt><dd>${esc(source.court_name||source.court_id||source.scope||'전국 자료 · 사건별 적용 확인')}</dd></dl>${source.error?`<div class="callout warning ax-gap" role="alert"><div><strong>${hasBody?'최근 수집에 실패하여 이전 본문을 표시합니다.':'공식 본문을 아직 저장하지 못했습니다.'}</strong><p>${esc(source.error)}</p></div></div>`:''}${source.warning||source.limitation||source.limitations?`<div class="callout neutral ax-gap">${esc(asText(source.warning||source.limitation||source.limitations))}</div>`:''}${hasBody?`<div class="ax-reader-tools"><h3>저장된 본문</h3><label class="field"><span>본문에서 찾기</span><input type="search" data-source-find placeholder="조문 번호나 검색어를 입력하세요"></label><p class="small muted" data-source-count>${sections.length}개 ${pages.length?'페이지':'본문 구간'} · 전체 내용을 표시합니다.</p></div><div class="ax-reader-text">${sections.map((part,i)=>`<section data-source-section><h3>${part.page||part.page_number?`${esc(part.page||part.page_number)}쪽`:sections.length>1?`본문 구간 ${i+1}`:'공식 법률·법원 자료'}</h3><p>${esc(textOf(part))}</p></section>`).join('')}</div><p class="small muted ax-gap hidden" data-source-no-match>일치하는 본문이 없습니다. 검색어를 바꾸거나 지워 전체 원문을 확인하세요.</p>`:`<div class="ax-source-unavailable"><h3>읽을 수 있는 본문이 없습니다.</h3><p>목록의 출처 정보만 등록된 상태입니다. 공식 자료를 수집한 뒤 본문을 확인할 수 있습니다.</p><button class="button secondary small" data-action="ax-source-refresh" data-id="${esc(id)}">${icon('refresh')} 이 원문 다시 수집</button></div>`}${source.sha256?`<details class="ax-source-details"><summary>저장 원문 식별 정보</summary><p class="ax-hash">${esc(source.sha256)}</p></details>`:''}</div>`;
      const input=container.querySelector('[data-source-find]');
      if(input)input.addEventListener('input',()=>{
        const query=input.value.trim().toLocaleLowerCase('ko-KR');let count=0;
        container.querySelectorAll('[data-source-section]').forEach(section=>{const visible=section.textContent.toLocaleLowerCase('ko-KR').includes(query);section.hidden=!visible;if(visible)count++;});
        container.querySelector('[data-source-count]').textContent=query?`${sections.length}개 중 ${count}개 본문 구간이 검색되었습니다.`:`${sections.length}개 ${pages.length?'페이지':'본문 구간'} · 전체 내용을 표시합니다.`;
        container.querySelector('[data-source-no-match]').classList.toggle('hidden',count!==0);
      });
    }catch(error){if(el.isConnected)container.innerHTML=`<div class="callout warning" role="alert"><div><strong>저장된 원문을 불러오지 못했습니다.</strong><p>${esc(error.message)}</p><button class="button secondary small" data-action="ax-source" data-id="${esc(id)}">다시 불러오기</button></div></div>`;}
  }
  async function start(kind){
    if(consultationPending(current())){await openCase(current().id,'consultation');return;}
    const response=await api(cpath('/ax-runs'),{method:'POST',body:{kind,expected_version:current().version}});
    notify('사건 근거를 검색하고 검토를 시작했습니다. 실제 결과가 준비되면 표시합니다.');
    await load();
    if(getState().view==='case')getState().tab='overview';render();
    return response;
  }
  function findFinding(data){const run=allRuns().find(r=>r.id===data.run);const finding=list(run?.findings).find(f=>f.id===data.id);if(!finding)throw new Error('검토 항목을 다시 불러와 주세요.');return {run,finding};}
  function reviewFinding(data,apply){
    const {run,finding}=findFinding(data),action=finding.action||{};
    openForm(apply?actionNames[action.type]||'검토 작업 반영':'제안 반려',`<div class="callout neutral"><div><strong>${esc(finding.title)}</strong><p>${esc(finding.observation)}</p></div></div>${action.type==='document_request'&&apply?'<p class="small muted ax-gap">등록하면 고객 포털의 준비할 서류에 표시됩니다.</p>':''}<div class="ax-gap">${apply&&action.type==='document_request'?fields([['period','필요한 기간·범위','text',action.period||'',true]]):''}${fields([['reason',apply?'원문을 대조한 결과와 적용 이유':'반려 사유','textarea','',true]])}</div>`,apply?'검토 후 업무에 반영':'반려 사유 기록',async body=>{const result=await api(cpath(`/ax-runs/${encodeURIComponent(run.id)}/findings/${encodeURIComponent(finding.id)}/${apply?'apply':'dismiss'}`),{method:'POST',body});getState().current=result.case||result;notify(apply?'검토한 제안을 실제 업무에 반영했습니다.':'반려 사유를 기록했습니다.');await load();});
  }
  function viewDraft(id){
    const draft=list(current()?.drafts).find(d=>d.id===id);if(!draft)return;
    const sections=Array.isArray(draft.sections)?draft.sections:Object.entries(draft.sections||{}).map(([title,content])=>({title,content}));
    const el=modal(draft.title||'1차 검토 문서',`<div class="callout neutral">추출 후보와 확인된 근거로 작성한 검토용 초안입니다. 미확인 값과 누락 자료를 확인하세요.</div><div class="ax-reader-text">${sections.map(section=>`<section><h3>${esc(section.title||section.label||section.heading)}</h3>${structuredHtml(section.content??section.text??section.body??'')}${list(section.fields).length?`<div class="table-wrap"><table><thead><tr><th>확인 항목</th><th>사건에서 확인한 내용</th><th>검토 상태</th></tr></thead><tbody>${section.fields.map(f=>`<tr><td>${esc(f.label||f.title||'확인 항목')}</td><td>${structuredHtml(f.value)}</td><td>${badge(f.status||'unknown',reviewNames[f.status]||({'unknown':'미확인',conflict:'근거 상충'})[f.status]||'확인 필요')}</td></tr>`).join('')}</tbody></table></div>`:''}</section>`).join('')||structuredHtml(draft.content||draft.text||'다운로드 파일에서 내용을 확인하세요.')}</div>`);el.classList.add('ax-source-dialog');
  }

  const actions={
    'ax-intake-review':async()=>{
      const c=current(),registry=getState().registry||await api('/registry');getState().registry=registry;
      openForm('상담 원문과 사건 분류 확인',fields([['client_name','내담자 성명','text',c.client_name||'',true],['region','실제 거주지역·주소','text',c.region||'',true]])+`<label class="field"><span>관할 법원 후보</span><select name="court_id"><option value="unknown">관할 확인 필요</option>${list(registry.courts).map(court=>`<option value="${esc(court.id)}" ${court.id===c.court_id?'selected':''}>${esc(court.name)}</option>`).join('')}</select></label><label class="field"><span>사건 유형</span><select name="case_type">${[['personal_rehabilitation','개인회생'],['bankruptcy_review','파산 검토'],['other','기타 사건'],['unknown','유형 확인 필요']].map(([value,title])=>`<option value="${value}" ${c.case_type===value?'selected':''}>${title}</option>`).join('')}</select></label>`+fields([['reason','원문을 확인한 내용과 정정 이유','textarea','',true]]),'사건 정보와 초안 갱신',async body=>{const response=await api(cpath('/intake-review'),{method:'POST',body});getState().current=response.case||response;notify('사건 분류와 문서 초안을 갱신했습니다.');await load();});
    },
    'ax-source':data=>showSource(data.id),
    'ax-source-refresh':async data=>{
      if(active(local.ingestion)){notify('이미 공식 자료를 수집하고 있습니다. 완료 후 다시 확인해 주세요.');return;}
      local.ingestion=await api('/knowledge/sources/'+encodeURIComponent(data.id)+'/refresh',{method:'POST'});
      local.refreshSourceId=data.id;
      const el=document.querySelector('dialog[open]');
      if(el?.dataset.sourceId===data.id)el.querySelector('.dialog-body').innerHTML=`<div class="loading" role="status"><span class="spinner"></span><p>이 출처의 공식 본문을 수집하고 있습니다. 완료되면 저장된 내용을 표시합니다.</p></div>`;
      notify('선택한 출처의 본문 수집을 요청했습니다.');
    },
    'ax-knowledge-tab':async data=>{local.knowledgeTab=data.tabid;if(data.tabid==='rules'&&!local.rulebook)await loadRulebook();render();},
    'ax-apply':data=>reviewFinding(data,true),
    'ax-dismiss':data=>reviewFinding(data,false),
    'ax-reload-knowledge':async()=>{await loadKnowledge();render();},
    'ax-ingest':async()=>{local.ingestion=await api('/knowledge/ingest',{method:'POST',body:{}});notify('공식 자료 수집을 시작했습니다. 결과와 실패한 출처를 확인할 수 있습니다.');await loadKnowledge();render();},
    'ax-view-draft':data=>viewDraft(data.id),
    'ax-download-draft':data=>download(cpath('/drafts/'+encodeURIComponent(data.id)+'/download?format=docx'),`빚오프_1차검토본_${current().id}.docx`),
    'ax-review-draft':data=>openForm('1차 문서 변호사 검토',`<label class="field"><span>검토 결과</span><select name="decision"><option value="approve">검토 승인</option><option value="request_changes">수정 요청</option></select></label>`+fields([['reason','검토 범위와 사유','textarea','',true]]),'변호사 검토 기록',async body=>{const response=await api(cpath('/drafts/'+encodeURIComponent(data.id)+'/review'),{method:'POST',body});getState().current=response.case||response;notify('변호사 검토 결과를 기록했습니다.');await load();}),
    'ax-confirm-extraction':data=>{const item=list(current()?.extraction_candidates).find(x=>x.id===data.id);openForm('추출값 원문 검토',`<div class="callout neutral"><div><strong>${esc(item.label||item.key)} · ${esc(asText(item.value))}</strong><p>${esc(item.quote||'원문에서 값을 확인하세요.')}</p></div></div><p class="small muted ax-gap">원문을 열어 인물·기간·금액이 맞는지 확인하고 판단 사유를 남기세요.</p>`+`<label class="field ax-gap"><span>검토 결과</span><select name="decision"><option value="accept">추출값 수용</option><option value="correct">값 정정</option><option value="reject">후보 반려</option></select></label>`+fields([['value','정정할 값 (값 정정 선택 시)','text',asText(item.value)],['reason','원문을 대조한 확인 내용','textarea','',true]]),'추출값 확인 기록',async body=>{const response=await api(cpath('/extraction-candidates/'+encodeURIComponent(data.id)+'/review'),{method:'POST',body:{...body,...(body.decision==='correct'&&typeof item.value==='number'?{value:Number(body.value)}:{})}});getState().current=response.case||response;notify('추출 후보의 검토 결과를 기록했습니다.');await load();});}
  };

  const markDirty=event=>{const form=event.target.closest('form');if(form)form.dataset.dirty='true';};
  document.addEventListener('input',markDirty);
  document.addEventListener('change',markDirty);
  document.addEventListener('input',event=>{if(event.target.id==='intake-text')local.intakeText=event.target.value;});
  document.addEventListener('submit',async event=>{
    if(!['ax-intake-form','ax-knowledge-search'].includes(event.target.id))return;
    event.preventDefault();const form=event.target,button=form.querySelector('[type=submit]');button.disabled=true;
    try{
      const data=new FormData(form);
      if(form.id==='ax-intake-form'){
        const file=data.get('file'),text=String(data.get('text')||'').trim();
        if(!file?.size&&!text)throw new Error('회의록 파일 또는 상담 내용을 입력해 주세요.');
        if(file?.size&&text)throw new Error('상담 내용과 파일 중 이번에 분석할 자료 하나만 남겨 주세요.');
        local.intakeError=null;
        local.intake=file?.size?await api('/intake-runs/upload',{method:'POST',body:data}):await api('/intake-runs',{method:'POST',body:{text}});
        local.intakeText='';notify('상담 회의록을 받았습니다. 실제 분석 상태를 표시합니다.');render();
      }else{
        local.query=String(data.get('q')||'');local.court=String(data.get('court_id')||'');local.searching=true;
        local.results=await api('/knowledge/search?q='+encodeURIComponent(local.query)+(local.court?'&court_id='+encodeURIComponent(local.court):''));local.searching=false;render();
      }
    }catch(error){if(form.id==='ax-intake-form')local.intakeError=error.message;local.searching=false;notify(error.message,'error');}finally{button.disabled=false;}
  });
  return {init,repaint,loadKnowledge,dashboard,caseReview,agentView,knowledgeView,start,actions,extractions,draftsView,documentCheck};
}
