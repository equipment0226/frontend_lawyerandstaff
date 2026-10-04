import {esc,list,badge,readableText} from './ui.js';

export const requestClosed = request => Boolean(request.no_longer_required)||['fulfilled','withdrawn','cancelled','superseded'].includes(request.status);
export const requestWithdrawn = request => Boolean(request.no_longer_required)||['withdrawn','cancelled','superseded'].includes(request.status);
export const requestNeedsUpload = request => !requestClosed(request)&&!['received','validating','processing'].includes(request.status);
export const requestStatus = request => request.status==='withdrawn'?badge('withdrawn','제출 제외'):request.no_longer_required?badge('superseded','이전 요청 보관'):badge(request.status,({fulfilled:'확인 완료',received:'제출 확인 중',validating:'제출 확인 중',processing:'제출 확인 중',requested:'제출 필요',missing:'제출 필요',needs_review:'추가 확인',needs_more:'다시 제출 필요',rejected:'다시 제출 필요',cancelled:'요청 철회',superseded:'새 요청으로 변경'})[request.status]||'확인 필요');

// Account identifiers are only shown in masked form, including older requests.
export function maskedAccount(value){
  if(value==null)return '';
  const text=String(value);
  if(text.includes('*')||text.includes('●'))return text;
  const digits=text.replace(/\D/g,'');
  return digits.length>4?'•••• '+digits.slice(-4):'계좌 별도 확인';
}
export function requestScope(request){
  const institution=request.institution_name||request.institution||request.issuer;
  const account=request.account_masked||request.account_label||request.account;
  const period=typeof request.period==='object'?request.period?.label||[request.period?.start,request.period?.end].filter(Boolean).join(' ~ '):request.period;
  return [institution,account?maskedAccount(account):'',period].filter(Boolean).map(String).join(' · ');
}
export function requestOptions(request){
  const options=request.issuance_options||request.issue_options;
  if(!options)return '';
  if(Array.isArray(options))return options.map(x=>typeof x==='string'?x:x.label||x.description||x.value).filter(Boolean).map(readableText).join(' · ');
  if(typeof options==='string')return readableText(options);
  const names={detail:'상세',history:'변동 이력',resident_number:'주민등록번호 표시',person_number_display:'주민등록번호 표시',address_history:'주소 변동',include_closed:'해지 계좌 포함',all_pages:'전체 쪽',issued_within_days:'발급 유효기간(일)',freshness_months:'최근 발급(개월)',certificate_type:'증명서 종류',disclosure:'표시 범위',employer_signature:'사업주 확인',breakdown:'상세 내역',content:'포함 내용',name_changes:'이름 변경',resident_number_changes:'주민등록번호 변경',tax_scope:'세목 범위',jurisdiction_scope:'조회 관할'};
  return Object.entries(options).map(([key,value])=>{
    const text=typeof value==='boolean'?(value?'포함':'제외'):Array.isArray(value)?value.join(', '):String(value);
    if(key==='freshness_exception'||key==='freshness_exection')return readableText(text);
    return `${names[key]||key}: ${text}`;
  }).join(' · ');
}
export function requestFeedback(request){
  const details=request.validation||request.validation_result||{};
  const reasons=[request.public_review_note,request.rejection_reason,request.re_request_reason,request.withdrawal_reason,details.reason,...list(details.missing)].filter(Boolean);
  return [...new Set(reasons.map(x=>typeof x==='string'?x:x.message||x.title||''))].filter(Boolean).join(' · ');
}
export function requestDetails(request){
  const options=requestOptions(request),feedback=requestFeedback(request);
  return `<p class="request-scope">${esc(requestScope(request)||'기간·발급 범위 확인 중')}</p>${options?`<p class="small muted">발급 옵션 · ${esc(options)}</p>`:''}${feedback?`<div class="callout ${['needs_more','rejected','missing'].includes(request.status)?'warning':'neutral'}" style="margin-top:10px"><span>${esc(feedback)}</span></div>`:''}`;
}
