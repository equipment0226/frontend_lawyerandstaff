import {prepareDialogHistory,trackDialogHistory} from './dialog-history.js';
export const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const money = (value) => value == null ? '—' : Number(value).toLocaleString('ko-KR') + '원';
export const date = (value, time = false) => { if (!value) return '미지정'; const d = new Date(value); return Number.isNaN(d.getTime()) ? esc(value) : new Intl.DateTimeFormat('ko-KR', {timeZone:'Asia/Seoul', month:'long', day:'numeric', ...(time ? {hour:'2-digit',minute:'2-digit'} : {})}).format(d); };
export const list = (value) => Array.isArray(value) ? value : [];
export const caseReference = (caseData) => caseData?.matter_number || caseData?.engagement_number || '수임번호 미등록';
export function activityLabel(action){
  return ({document_uploaded:'자료 제출',document_received:'자료 제출',document_verified:'자료 검증',
    application_received:'새 상담·신청 접수',intake:'상담 접수',manual:'담당자 확인 요청',
    client_message:'고객 문의 수신',client_reply:'고객 답변 수신',customer_handoff:'직원 연결 요청',
    staff_message:'담당자 메시지',notification_read:'알림 확인',message_received:'새 메시지 수신',
    'document.received':'자료 제출','document.verified':'자료 검증','message.created':'고객 연락 기록',
    'notification.read':'알림 확인','notifications.read':'알림 확인','portal.application':'새 상담·신청 접수',
    'portal.application.created':'새 상담·신청 접수','portal.handoff':'직원 연결 요청',
    'request.created':'자료 요청','request.withdrawn':'자료 요청 철회','document.metadata':'서류 발급정보 정정',
    'consultation.updated':'상담 기록 수정','consultation.recorded':'상담 기록 저장','consultation.requested':'세부 상담 요청','consultation.completed':'세부 상담 완료','consultation_completed':'세부 상담 완료',
    'automation.completed':'자동 처리 완료','automation.started':'자동 처리 시작','legal_update':'적용 법률 확인',
    'fact.confirmed':'사실 확인','issue.decided':'쟁점 판단','calculation.created':'계산안 작성',
    'court_document.created':'법원 서식 작성','court_document.approved':'작성본 검토 승인',
    'draft.reviewed':'초안 검토','workflow.changed':'진행 상태 변경'})[action]||'사건 정보 변경';
}
export function readableText(value) {
  return String(value ?? '').replace(/\b(?:llama(?:\s*3(?:[.:_-][\w.-]+)?)?|ollama|deepseek(?:[.:_-][\w.-]+)?)\b/gi,'AI')
    .replace(/\b(?:sha256:)?[a-f0-9]{40,64}\b/gi,'버전 식별값')
    .replace(/\bcase-[A-Za-z0-9_-]+\b/g,'사건 기록')
    .replace(/\b(?:local-grounded-statement|private-verification|legal-watch|legal-overlay)[-:_][A-Za-z0-9_.:-]+\b/g,'현재 기준')
    .replace(/\b(?:undefined|null)\b/g,'미확인')
    .replace(/\bfreshness_(?:exception|exection)\s*:\s*/gi,'')
    .replace(/특별한 사정이 있는 경우 예외 검토/g,'특별 사정이 있으면 예외 검토')
    .replace(/\bAI\s+AI\b/g,'AI');
}
export function legalBasisLabel(value={}) {
  value=value||{};
  const raw=typeof value==='string'?value:value.label||value.title||value.policy_title||value.version||value.policy_version||value.active_overlay_version||'';
  const dateValue=typeof value==='object'?(value.as_of||value.effective_date||value.applied_at):null;
  const matched=String(dateValue||raw).match(/20\d{2}-\d{2}-\d{2}/);
  if(matched)return matched[0].replaceAll('-','.')+' 기준';
  const year=String(raw).match(/(?:^|[-_])((?:19|20)\d{2})(?:[-_]|$)/);
  if(year)return year[1]+'년 적용 기준';
  return /[가-힣]/.test(raw)?readableText(raw):'현재 사건에 적용된 기준';
}
let htmlPresentation=html=>html;
export function setHtmlPresentation(formatter){htmlPresentation=typeof formatter==='function'?formatter:html=>html;}
export const label = (value) => ({withdrawn:'요청 철회',cancelled:'취소',superseded:'변경됨',manual_review:'확인 필요',unknown:'미확인',requested:'자료 요청',needs_more:'추가 확인 필요',decided:'판단 완료',review_required:'재검토 필요',fulfilled:'충족',reviewed:'검토 완료',review_approved:'검토 승인',pending:'확인 대기',received:'수신 완료',verified:'검증 완료',approved:'승인 완료',rejected:'반려',missing:'자료 필요',draft:'초안',open:'검토 필요',resolved:'판단 완료',stale:'재검토 필요',blocked:'진행 대기',running:'실행 중',queued:'실행 대기',completed:'완료',failed:'실패',needs_review:'담당자 확인',needs_human:'사람 검토 필요',unavailable:'연결 안 됨',active:'진행 중',submitted:'제출 등록',client:'고객',staff:'직원',lawyer:'변호사',admin:'관리자',intake:'접수',collecting:'자료 수집',review:'검토',filing:'신청 준비',correction:'보정 대응',confirmed:'확정',proposal:'제안',satisfied:'충족',processing:'처리 중'})[value] || value || '미확인';
export function badge(value, text) { const kind = /approved|verified|completed|resolved|confirmed|satisfied|fulfilled|decided|reviewed/.test(value) ? 'green' : /missing|stale|rejected|failed|blocked|needs_more|manual_review|review_required/.test(value) ? 'orange' : /running|review|proposal|draft/.test(value) ? 'blue' : 'gray'; return `<span class="badge ${kind}">${esc(text || label(value))}</span>`; }
const paths = {bell:'M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4',grid:'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z',folder:'M3 7V5a1 1 0 0 1 1-1h5l2 3h9a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1Z',check:'m5 12 4 4L19 6',file:'M14 2H5a1 1 0 0 0-1 1v18a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V8Z M14 2v6h6 M8 13h8 M8 17h6',scale:'M12 3v18M7 21h10M3 7h18M6 7 2 15h8ZM18 7l-4 8h8Z',calc:'M5 2h14v20H5zM8 6h8M8 11h1M15 11h1M8 15h1M15 15h1M8 19h1M15 19h1',clock:'M12 8v5l3 2M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',spark:'m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5Z',arrow:'M5 12h14m-6-6 6 6-6 6',chevron:'m9 5 7 7-7 7',search:'M21 21l-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0',upload:'M12 16V3m-5 5 5-5 5 5M3 16v5h18v-5',message:'M21 11a9 9 0 0 1-9 9H3l1-5a9 9 0 1 1 17-4Z',building:'M3 10h18M5 10v9m7-9v9m7-9v9M2 22h20M2 7l10-5 10 5Z',logout:'M9 3H3v18h6M10 12h12m-5-5 5 5-5 5',plus:'M12 5v14M5 12h14',refresh:'M20 7a9 9 0 1 0 1 8M20 2v6h-6',shield:'m12 2 9 4v6c0 6-9 10-9 10S3 18 3 12V6ZM8 12l3 3 5-6',info:'M12 11v6M12 7h.01M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',close:'m6 6 12 12M6 18 18 6',download:'M12 3v13m-5-5 5 5 5-5M3 16v5h18v-5',user:'M4 22v-3a8 8 0 0 1 16 0v3M16 6a4 4 0 1 1-8 0 4 4 0 0 1 8 0',menu:'M3 6h18M3 12h18M3 18h18'};
export const icon = (name, cls = '') => `<svg class="icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[name] || paths.file}"/></svg>`;
export const brand = () => `<span class="brand-mark">${icon('check')}</span><span>빚오프<span class="brand-en">DEBT OFF</span></span>`;
export const empty = (title, description = '') => `<div class="empty-state">${icon('folder')}<strong>${esc(title)}</strong><p>${esc(description)}</p></div>`;
export function notify(message, type = 'success') { let el = document.querySelector('#toast'); if (!el) { el = document.createElement('div'); el.id = 'toast'; document.body.append(el); } el.className = `toast ${type}`; el.setAttribute('role', type === 'error' ? 'alert' : 'status'); el.textContent = message; clearTimeout(notify.timer); notify.timer = setTimeout(() => el.classList.add('hidden'), type === 'error' ? 10000 : 5000); }
export function modal(title, html) { const replaced=prepareDialogHistory(),scroll={x:window.scrollX,y:window.scrollY}; document.querySelector('#dialog')?.remove(); const el = document.createElement('dialog'); el.id='dialog'; el.className='dialog'; el.innerHTML=`<div class="dialog-head"><h2>${esc(readableText(title))}</h2><button class="icon-button" type="button" aria-label="닫기" data-close>${icon('close')}</button></div><div class="dialog-body">${htmlPresentation(html)}</div>`; document.body.append(el); trackDialogHistory(el,replaced,scroll); el.querySelector('[data-close]').onclick=()=>el.close(); el.addEventListener('close',()=>el.remove()); el.addEventListener('click',(e)=>{ if(e.target===el)el.close(); }); el.showModal(); return el; }
export function errorPanel(error) { return `<div class="error-panel" role="alert">${icon('info')}<div><strong>작업을 완료하지 못했습니다</strong><p>${esc(error.message || error)}</p><button class="button secondary small" data-action="refresh">다시 불러오기</button></div></div>`; }
export function fields(items) { return items.map(([name,title,type='text',value='',required=false])=>`<label class="field"><span>${esc(title)}${required?' <span class="required">*</span>':''}</span>${type==='textarea'?`<textarea name="${esc(name)}" ${required?'required':''}>${esc(value)}</textarea>`:`<input name="${esc(name)}" type="${esc(type)}" value="${esc(value)}" ${required?'required':''} ${type==='number'?'min="0" step="1"':''}>`}</label>`).join(''); }
