import React from 'react';
import LegalUpdates from './LegalUpdates.jsx';
import ApprovalEstimate from './ApprovalEstimate.jsx';
import CaseDashboard,{dashboardSelectionDescriptor,resolveDashboardSelection} from './CaseDashboard.jsx';
import CaseLegalReview from './CaseLegalReview.jsx';
import {createRoot} from 'react-dom/client';
import {flushSync} from 'react-dom';
import {icon,brand,date,list,legalBasisLabel,readableText} from '../../shared/ui.js';
import {humanText} from '../../shared/structured.js';
import {calculationBlockerTitle} from '../../shared/legal-labels.js';
import {requestWithdrawn,requestNeedsUpload,requestScope,requestOptions,requestFeedback} from '../../shared/requests.js';

const stageNames={consultation:'세부 상담',consultation_waiting:'세부 상담 대기',collecting:'서류 준비·보완',extraction:'상담·서류 내용 추출',validation:'제출 자료 검증',ocr_verification:'추출값 검증',verification_waiting:'검증 재시도 필요',legal_analysis:'쟁점·계산 분석',lawyer_review:'변호사 검토 필요',drafting:'1차 문서 자동 작성',document_verification:'AI 문서 검토',human_review:'담당자 보완·승인',submission_ready:'제출 준비',submitted:'법원 제출 기록 완료',completed:'자동 검토 완료'};
const stepNames={waiting:'대기',running:'진행 중',completed:'완료',blocked:'보완 필요',review_required:'담당자 확인 필요',failed:'재확인 필요'};
const requestNames={fulfilled:'확인 완료',received:'제출 확인 중',validating:'제출 확인 중',processing:'제출 확인 중',requested:'제출 필요',missing:'제출 필요',needs_review:'추가 확인',needs_more:'다시 제출 필요',rejected:'다시 제출 필요',withdrawn:'요청 철회',cancelled:'요청 철회',superseded:'새 요청으로 변경'};
const roots=new Map();
let pipelineRoots=[];
const explanation=value=>humanText(typeof value==='string'?value:value?.message||value?.description||value?.reason||value?.title||'');
const safeURL=url=>{try{const u=new URL(url);return ['https:','http:'].includes(u.protocol)?u.href:null;}catch{return null;}};
function Html({html,className='',as:Tag='span'}){return <Tag className={className} dangerouslySetInnerHTML={{__html:html}}/>;}
function Icon({name}){return <Html html={icon(name)} className="react-icon"/>;}
function Button({children,action,tab,secondary=false,...props}){return <button className={`button ${secondary?'secondary':''}`} data-action={action} data-tab={tab} {...props}>{children}</button>;}
function Pill({status,children}){const color=['fulfilled','completed','verified'].includes(status)?'green':['rejected','needs_more','blocked','lawyer_review','verification_waiting'].includes(status)?'orange':status==='running'?'blue':'gray';return <span className={`badge ${color}`}>{children}</span>;}
function Empty({title,detail}){return <div className="empty-state"><Icon name="check"/><strong>{title}</strong><p>{detail}</p></div>;}
function SourceLinks({sources}){return <div className="react-source-links">{list(sources).map((s,i)=>safeURL(s.url||s.source_url)?<a key={i} href={safeURL(s.url||s.source_url)} target="_blank" rel="noopener noreferrer">{s.title||s.locator||'공식 근거'} <Icon name="arrow"/></a>:null)}</div>;}

export function CaseAutomation({caseData:c}){
  const p=c?.ax_pipeline;if(!p)return null;
  const steps=list(p.steps),done=steps.filter(s=>s.status==='completed').length;
  const stageStep=({human_review:'human_review',submission_ready:'submission',submitted:'submission'})[p.stage];
  const current=steps.find(s=>s.id===stageStep)||steps.find(s=>s.status==='running')||steps.find(s=>['blocked','failed','review_required'].includes(s.status))||steps.find(s=>s.status!=='completed');
  const queued=p.queued_update?.status==='queued',running=p.active_run?.status==='running'||p.status==='running';
  const progress=p.progress,total=Number(progress?.total),completed=Math.max(0,Math.min(total,Number(progress?.completed)));
  const hasProgress=Boolean(progress&&Number.isFinite(total)&&total>0&&Number.isFinite(completed));
  const reasons=list(p.reasons||c.legal_analysis?.reasons),strategies=list(p.strategies||c.legal_analysis?.strategies);
  const triggerNames={manual:'담당자 확인 요청',document_uploaded:'새 서류 수신',document_received:'새 서류 수신',client_message:'고객 답변 수신',intake:'상담 내용 접수',legal_update:'적용 법률 변경'};
  const checkNames={document_selection:'서류 선정·범위 검증',ocr:'추출값 원문 검증',calculation_mapping:'계산 입력값 검증',document:'작성 문서 검증',artifact:'출력 파일 검증'};
  const stageTitles=Object.fromEntries(steps.map(step=>[step.id,step.title]));
  const checkpoints=list(c.workflow_checkpoints).map((entry,index)=>({...entry,id:`checkpoint-${index}`,checkpoint:true,title:stageTitles[entry.current_step]||stageNames[entry.stage]||'진행 조건 확인',description:`${stepNames[entry.status]||'상태 확인'}${entry.input_revision?' · 자료 '+entry.input_revision+'차':''} · ${list(entry.completed_steps).length}단계 완료`}));
  const history=[...checkpoints,...list(p.history),...list(c.ax_pipeline_history),...list(c.automation_history),...list(c.verification_runs).map(run=>({id:run.id,at:run.created_at,title:checkNames[run.kind]||'자료 검증',description:run.passed?'근거 대조를 완료했습니다.':run.status==='unavailable'?'검증 연결을 확인한 뒤 다시 진행합니다.':'대조 결과에 추가 확인이 필요합니다.'})),...list(c.strategy_analyses).map(run=>({id:run.id,at:run.created_at,title:'법률 쟁점·전략 확인',description:run.verification?.passed?'계산과 적용 근거를 함께 확인했습니다.':'적용 근거와 대응안의 검토가 필요합니다.'}))].filter((h,i,all)=>all.findIndex(x=>(x.id||x.run_id||'')===(h.id||h.run_id||'')&&(x.at||x.created_at)===(h.at||h.created_at)&&(x.stage||x.title||x.trigger)===(h.stage||h.title||h.trigger))===i).sort((a,b)=>String(a.at||a.created_at||'').localeCompare(String(b.at||b.created_at||'')));
  return <div className="case-process-history" data-react-component="CaseHistory">
    <details className="automation-history"><summary>단계별 이력과 처리 근거 <span>{history.length}건</span></summary>{current?.gate&&<div className="automation-current-gate"><strong>다음 단계로 진행하는 조건</strong><p>{current.gate}</p>{current.on_failure&&<small>조건이 충족되지 않으면 · {current.on_failure}</small>}</div>}<div className="automation-stage-contracts">{steps.filter(step=>step.gate||list(step.inputs).length||list(step.outputs).length).map((step,index)=><details key={step.id||index}><summary>{step.title} <span>{stepNames[step.status]||'대기'}</span></summary><dl><dt>확인 자료</dt><dd>{list(step.inputs).join(' · ')||'현재 사건 자료'}</dd><dt>처리 결과</dt><dd>{list(step.outputs).join(' · ')||'확인 중'}</dd><dt>진행 조건</dt><dd>{step.gate||'근거 확인'}</dd><dt>보완 방법</dt><dd>{step.on_failure||'담당자 확인'}</dd></dl></details>)}</div>{history.length?history.slice().reverse().map((h,i)=><div className="timeline-row" key={`${h.id||h.run_id||'event'}:${i}`}><span className="timeline-dot"/><div><strong>{stageNames[h.stage]||h.title||'진행 상태 변경'}</strong><p>{date(h.at||h.created_at,true)} · {h.reason||h.description||triggerNames[h.trigger]||'처리 상태를 기록했습니다.'}</p>{h.checkpoint&&h.gate&&<p>진행 조건 · {h.gate}</p>}{h.checkpoint&&list(h.completed_steps).length>0&&<p>확인 완료 · {h.completed_steps.map(id=>stageTitles[id]).filter(Boolean).join(' · ')||list(h.completed_steps).length+'단계'}</p>}</div></div>):<p className="small muted">현재 처리 상태가 위 단계에 표시됩니다. 다음 상태 변경부터 이력을 함께 확인할 수 있습니다.</p>}</details>
    {p.legal_update&&<div className="automation-legal-basis"><Icon name="scale"/><div><strong>적용 법률 기준</strong><p>{legalBasisLabel(p.legal_update)}</p>{p.legal_update.summary&&<p>{explanation(p.legal_update.summary)}</p>}</div><button className="button subtle small" data-nav="knowledge">변경 이력</button></div>}
  </div>;
}

function OfficeShell({state,user,currentName,contentHtml,alarmHtml,roleLabel,api}){
  const navs=[['cases','folder','전체 사건'],...(state.current?[['case','grid','선택한 사건']]:[]),['agent','spark','검토 작업실']];
  const nav=(id,i,title)=><button key={id} className={`nav-link ${state.view===id?'active':''}`} data-nav={id}><Icon name={i}/>{title}{id==='cases'&&<span className="nav-count">{state.total||state.cases.length}</span>}</button>;
  return <div className="office-shell premium-office" data-react-component="OfficeShell"><aside className="sidebar"><div className="brand"><Html html={brand()}/></div><div className="workspace-chip"><span className="dot"/>개인회생 업무공간</div><div className="nav-heading">WORKSPACE</div>{navs.map(n=>nav(...n))}<div className="nav-heading">RESOURCES</div>{[['knowledge','search','수집 지식함'],['registry','building','법원·발급처'],['system','shield','운영 현황']].map(n=>nav(...n))}<div className="sidebar-reassurance"><span>CLARITY. CARE. PROGRESS.</span><p>판단에 집중하고,<br/>과정은 빈틈없이.</p></div><div className="sidebar-bottom"><div className="privacy-line"><Icon name="shield"/>사건별 권한 · 변경 이력 기록</div></div></aside><div className="office-main"><header className="topbar"><button className="icon-button mobile-menu" data-action="menu" aria-label="메뉴 열기"><Icon name="menu"/></button><div className="breadcrumb">업무공간 <Icon name="chevron"/><strong>{currentName}</strong></div><div className="spacer"/><span className="today">{new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',month:'long',day:'numeric',weekday:'short'}).format(new Date())}</span><span className="topbar-divider"/><Html html={alarmHtml}/><span className="avatar">{user.name?.slice(0,1)}</span><div className="user-meta">{user.name}<small>{roleLabel}</small></div><button className="icon-button" data-action="logout" aria-label="로그아웃"><Icon name="logout"/></button></header><main className="content" id="page-content">{["knowledge","system"].includes(state.view)&&<LegalUpdates request={api} role={user.role}/>}<div className="legacy-case-views" dangerouslySetInnerHTML={{__html:contentHtml}}/></main></div></div>;
}

function rootFor(node){if(!roots.has(node))roots.set(node,createRoot(node));return roots.get(node);}
export function clearWorkspace(){pipelineRoots.forEach(r=>r.unmount());pipelineRoots=[];for(const root of roots.values())root.unmount();roots.clear();}
export function renderOffice(props){
  pipelineRoots.forEach(r=>r.unmount());pipelineRoots=[];
  flushSync(()=>rootFor(document.querySelector('#app')).render(<OfficeShell {...props}/>));
  document.querySelectorAll('[data-case-automation]').forEach(node=>{const root=createRoot(node);pipelineRoots.push(root);flushSync(()=>root.render(<CaseAutomation caseData={props.state.current}/>));});
  document.querySelectorAll('[data-case-legal-review]').forEach(node=>{const root=createRoot(node);pipelineRoots.push(root);flushSync(()=>root.render(<CaseLegalReview caseData={props.state.current} role={props.user.role}/>));});
  document.querySelectorAll('[data-case-dashboard]').forEach(node=>{const root=createRoot(node);pipelineRoots.push(root);const c=props.state.current;const selection='dashboardRouteDetail' in props.state?resolveDashboardSelection(c,props.state.dashboardRouteDetail):(props.state.dashboardSelection?.caseId===c?.id?props.state.dashboardSelection.value:null);flushSync(()=>root.render(<CaseDashboard caseData={c} initialSelection={selection} onSelection={value=>{props.state.dashboardSelection={caseId:c.id,value};window.dispatchEvent(new CustomEvent('office:dashboard-detail',{detail:{selection:dashboardSelectionDescriptor(c,value)}}));}}/>));});
}
