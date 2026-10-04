import {esc,date,readableText,caseReference,legalBasisLabel} from './ui.js';
import {requestStatus,requestScope,requestOptions} from './requests.js';

const names={title:'자료명',name:'이름',label:'항목',period:'확인 기간',period_start:'시작일',period_end:'종료일',due_date:'제출 기한',status:'확인 상태',reason:'사유',description:'내용',message:'안내',value:'확인한 값',amount:'금액',principal:'원금',interest:'이자',institution:'기관',account_label:'계좌',account:'계좌',monthly_income:'월 소득',total_debt:'총 채무',assets_total:'재산 합계',living_expenses:'월 지출',actions:'다음 할 일',required_documents:'필요 서류',required_evidence:'추가 근거',requirements:'확인 항목',requests:'요청 자료',documents:'서류',findings:'검토 결과',warnings:'확인할 내용',limitations:'적용 범위',source_refs:'근거',sources:'출처',text:'본문',content:'내용',url:'공식 원문',source_url:'공식 원문',created_at:'작성일',checked_at:'확인일',fetched_at:'수집일',effective_date:'시행일',court_name:'관할 법원',collected_count:'저장 완료',failed_count:'수집 실패',pending_count:'수집 대기',stale_count:'이전 원문 유지',chunk_count:'저장 구간',source_count:'출처 수',total_count:'전체 출처',char_count:'본문 글자 수',bytes:'저장 크기',error:'확인 필요',errors:'확인 필요',count:'항목 수',passed:'검증 결과',summary:'검토 요약'};
const statuses={requested:'제출 필요',missing:'자료 필요',received:'제출 확인 중',fulfilled:'확인 완료',verified:'검증 완료',confirmed:'확정',candidate:'원문 대조 전',unknown:'미확인',pending:'확인 대기',needs_more:'보완 필요',needs_review:'검토 필요',rejected:'다시 확인 필요',withdrawn:'요청 철회',superseded:'이전 이력',approved:'검토 승인',completed:'완료',collected:'저장 완료',failed:'확인 실패',stale:'이전 자료',draft:'검토 초안',automatically_verified:'자동 검증 완료',verification_required:'작성 내용 확인 필요'};
const hidden=new Set(['id','key','version','schema_version','source_id','source_ids','document_id','document_ids','catalog_id','sha256','content_hash','input_revision','provider','model','model_name','prompt_tokens','completion_tokens','tokens','prompt','raw_response','raw_file','policy_hash','input_sha256','output_sha256','input_signature','source_hash','org_id','case_id','read_by','actor_id']);
const useful=([key,value])=>!hidden.has(key)&&!/(?:_hash|_sha256|_signature)$/.test(key)&&value!==undefined;
function decode(value){
  if(typeof value!=='string')return value;
  const text=value.trim().replace(/^```(?:json)?\s*|\s*```$/g,'');if(!/^[\[{"]/.test(text))return value;
  try{const parsed=JSON.parse(text);return parsed&&typeof parsed==='object'?parsed:typeof parsed==='string'&&parsed!==value?decode(parsed):value;}catch{return value;}
}
function fragments(text){
  const parts=[];let start=0;
  for(let i=0;i<text.length;i++){
    if(!['{','['].includes(text[i]))continue;
    let depth=0,quoted=false,escaped=false,end=-1;
    for(let j=i;j<text.length;j++){
      const ch=text[j];if(escaped){escaped=false;continue;}if(quoted&&ch==='\\'){escaped=true;continue;}
      if(ch==='"'){quoted=!quoted;continue;}if(quoted)continue;
      if(ch==='{'||ch==='[')depth++;else if(ch==='}'||ch===']')depth--;
      if(depth===0){end=j+1;break;}
    }
    if(end<0)continue;const candidate=decode(text.slice(i,end));
    if(!candidate||typeof candidate!=='object')continue;
    if(i>start)parts.push(text.slice(start,i));parts.push(candidate);start=end;i=end-1;
  }
  if(!parts.length)return null;if(start<text.length)parts.push(text.slice(start));return parts;
}
const label=key=>names[key]||(/^[A-Za-z_\d]+$/.test(key)?'확인 항목':key);
function scalar(value,key){
  if(value==null||value==='')return key==='due_date'?'기한 미지정':'미확인';
  if(typeof value==='boolean')return value?'확인됨':'아니오';
  if(key==='status')return statuses[value]||'확인 필요';
  if(key.endsWith('_at')||key==='due_date')return date(value,key.endsWith('_at'));
  if(typeof value==='number')return value.toLocaleString('ko-KR')+(/amount|principal|interest|income|debt|expenses|assets/.test(key)?'원':'');
  if(key==='policy_version'||key==='active_overlay_version')return legalBasisLabel(value);
  return readableText(value);
}
export function humanText(input,key='',depth=0){
  const value=decode(input);if(depth>8)return '상세 항목 확인 필요';
  if(Array.isArray(value))return value.map(v=>humanText(v,key,depth+1)).join('\n');
  if(value&&typeof value==='object')return Object.entries(value).filter(useful).map(([k,v])=>`${label(k)}: ${humanText(v,k,depth+1)}`).join('\n');
  if(typeof value==='string'){const parts=fragments(value);if(parts)return parts.map(part=>humanText(part,key,depth+1)).join('\n');}
  return scalar(value,key);
}
export function structuredHtml(input,key='',depth=0){
  const value=decode(input);if(depth>8)return '<p class="small muted">상세 항목 확인 필요</p>';
  if(Array.isArray(value))return `<div class="structured-list">${value.map(item=>structuredHtml(item,key,depth+1)).join('')}</div>`;
  if(value&&typeof value==='object'){
    if(value.title&&('period' in value||'due_date' in value)&&'status' in value){
      const scope=requestScope(value),options=requestOptions(value);
      return `<article class="structured-request"><div class="row between wrap"><strong>${esc(readableText(value.title))}</strong>${requestStatus(value)}</div>${scope?`<p>${esc(readableText(scope))}</p>`:''}<dl><dt>제출 기한</dt><dd>${esc(value.due_date?date(value.due_date):'기한 미지정')}</dd>${value.reason?`<dt>요청 이유</dt><dd>${esc(humanText(value.reason))}</dd>`:''}${options?`<dt>발급 방법</dt><dd>${esc(options)}</dd>`:''}</dl></article>`;
    }
    const title=value.title||value.label||value.name;
    const entries=Object.entries(value).filter(useful).filter(([k])=>!title||!['title','label','name'].includes(k));
    return `<article class="structured-card">${title?`<strong>${esc(humanText(title))}</strong>`:''}<dl class="structured-values">${entries.map(([k,v])=>`<dt>${esc(label(k))}</dt><dd>${v&&typeof decode(v)==='object'?structuredHtml(v,k,depth+1):esc(humanText(v,k,depth+1))}</dd>`).join('')}</dl></article>`;
  }
  if(typeof value==='string'){const parts=fragments(value);if(parts)return parts.map(part=>structuredHtml(part,key,depth+1)).join('');}
  return `<p class="structured-text">${esc(humanText(value,key,depth+1))}</p>`;
}

// Present legacy saved strings without changing their stored values, form inputs,
// transport IDs, links, or the original evidence viewer.
export function officeHtml(html,context={}){
  const template=document.createElement('template');template.innerHTML=html;
  const cases=[context.current,...(context.cases||[])].filter(Boolean);
  const docs=cases.flatMap(c=>c.documents||[]);
  const records=cases.flatMap(c=>[...(c.drafts||[]),...(c.bundles||[]),...(c.court_documents||[])]);
  const references=new Map([...cases.map(c=>[c.id,caseReference(c)]),...docs.map(d=>[d.id,d.filename||d.name||'연결된 원문']),...records.map(d=>[d.id,d.title||d.template_title||'작성 문서'])]);
  const walker=document.createTreeWalker(template.content,NodeFilter.SHOW_TEXT);const nodes=[];while(walker.nextNode())nodes.push(walker.currentNode);
  for(const node of nodes){
    const parent=node.parentElement;if(!parent||parent.closest('script,style,textarea,input,select,option,pre,code,blockquote,q,[contenteditable],[data-original-text]'))continue;
    const raw=node.textContent;if(!raw.trim())continue;let value=raw;
    for(const [id,title] of references)if(id&&value.includes(id))value=value.split(id).join(title);
    const decoded=decode(value),parts=typeof decoded==='string'?fragments(decoded):null;
    if((decoded&&typeof decoded==='object'||parts)&&parent.childNodes.length===1&&['P','DIV','TD','DD','LI'].includes(parent.tagName)){
      if(parent.tagName==='P'){const wrapper=document.createElement('div');wrapper.className=parent.className;wrapper.innerHTML=structuredHtml(decoded);parent.replaceWith(wrapper);}else parent.innerHTML=structuredHtml(decoded);
    }else node.textContent=humanText(value);
  }
  return template.innerHTML;
}
