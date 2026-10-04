import React,{useEffect,useState} from 'react';
import {icon,list} from '../../shared/ui.js';

const statusNames={idle:'확인 대기',running:'변경사항 확인 중',completed:'확인 완료',failed:'다시 확인 필요',ready:'확인 준비',review_required:'적용 검토 필요',warning:'일부 근거 확인 필요',disabled:'정기 확인 꺼짐',already_running:'변경사항 확인 중',not_due:'다음 확인 대기'};
const changeNames={baseline:'기준 원문 보관',unchanged:'변경 없음',active:'적용 중',staged:'시행 대기',review_required:'적용 검토 필요',failed:'확인 실패',changed:'변경 감지',updated:'변경 감지',new:'새 근거',added:'새 근거'};
const urlFor=value=>{try{const url=new URL(value);return ['https:','http:'].includes(url.protocol)?url.href:null;}catch{return null;}};
const formatDate=(value,time=false)=>{if(!value)return '예정 없음';const d=new Date(value);return Number.isNaN(d.getTime())?String(value):new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',year:'numeric',month:'long',day:'numeric',...(time?{hour:'2-digit',minute:'2-digit'}:{})}).format(d);};
const idFor=source=>source.id||source.source_id;
const Icon=({name})=><span className="react-icon" dangerouslySetInnerHTML={{__html:icon(name)}}/>;
const toDraft=data=>({enabled:data.enabled!==false,interval_hours:data.interval_hours||24,max_sources:Math.min(20,data.max_sources||20),daily_reasoning_limit:data.daily_reasoning_limit||data.budget?.daily_limit||20,source_ids:Array.isArray(data.source_ids)?data.source_ids:list(data.sources).filter(s=>s.enabled!==false).map(idFor).filter(Boolean)});

export default function LegalUpdates({request,role}){
  const [data,setData]=useState(null),[error,setError]=useState(''),[working,setWorking]=useState(''),[editing,setEditing]=useState(false),[draft,setDraft]=useState(null),[message,setMessage]=useState('');
  useEffect(()=>{
    let cancelled=false,busy=false;
    async function refresh(){
      if(busy||document.hidden)return;
      busy=true;
      try{const snapshot=await request('/legal-watch');if(!cancelled){setData(snapshot);setError('');}}
      catch(error){if(!cancelled)setError(error.message);}
      finally{busy=false;}
    }
    void refresh();const timer=setInterval(refresh,15000);
    return ()=>{cancelled=true;clearInterval(timer);};
  },[request]);
  async function run(){
    setWorking('run');setError('');setMessage('');
    try{await request('/legal-watch/run',{method:'POST'});setData(await request('/legal-watch'));setMessage('공식 근거의 변경사항을 확인합니다. 결과가 이 화면에 갱신됩니다.');}
    catch(error){setError(error.message);}finally{setWorking('');}
  }
  async function save(event){
    event.preventDefault();setError('');setMessage('');
    if(draft.enabled&&!draft.source_ids.length){setError('자동 확인할 공식 출처를 하나 이상 선택해 주세요.');return;}
    setWorking('policy');
    try{await request('/legal-watch/policy',{method:'POST',body:{enabled:draft.enabled,interval_hours:Number(draft.interval_hours),max_sources:Number(draft.max_sources),source_ids:draft.source_ids,daily_reasoning_limit:Number(draft.daily_reasoning_limit)}});setData(await request('/legal-watch'));setEditing(false);setMessage('확인할 근거의 범위와 하루 검증 한도를 저장했습니다.');}
    catch(error){setError(error.message);}finally{setWorking('');}
  }
  const budget=data?.budget||{},sources=list(data?.sources),changes=list(data?.changes),status=data?.status||'idle',canEdit=role==='lawyer';
  const automaticEnabled=data?.enabled&&data?.scheduler_enabled!==false;
  const combined=[...changes,...list(data?.review_required),...list(data?.staged),...sources.filter(s=>s.state==='failed'||s.index_error)];
  const important=combined.filter((c,i,all)=>!['baseline','unchanged'].includes(c.state||c.status||c.change_type)&&all.findIndex(x=>(x.source_id||x.id)===(c.source_id||c.id))===i);
  const visible=important.length?important:changes.slice(0,5);
  return <section className="card legal-updates" data-react-component="LegalUpdates" aria-label="법령·법원 기준 변경 확인">
    <div className="legal-updates-heading"><div><div className="eyebrow">LEGAL UPDATES</div><h2>법령과 법원 기준의 변화를 확인합니다.</h2><p>변경된 근거만 검토해 불필요한 재작성을 줄입니다.</p></div><div className="row wrap"><span className={`badge ${['failed','warning','review_required'].includes(status)?'orange':['running','already_running'].includes(status)?'blue':'gray'}`}>{data?statusNames[status]||'상태 확인':'불러오는 중'}</span><button className="button secondary small" onClick={run} disabled={!data||data.enabled===false||Boolean(working)||['running','already_running'].includes(status)}><Icon name="refresh"/>{working==='run'?'확인 요청 중':'지금 확인'}</button></div></div>
    {error&&<div className="callout warning legal-watch-feedback" role="alert"><Icon name="info"/><p>{error}</p></div>}
    {message&&<p className="legal-watch-feedback small" role="status">{message}</p>}
    {data&&<><div className="legal-watch-metrics"><div><span>자동 확인</span><strong>{automaticEnabled?'진행 중':'꺼짐'}</strong><small>{automaticEnabled?`${data.interval_hours||24}시간마다 · 하루 최대 ${data.max_sources||20}개 출처`:data.enabled?'서버의 정기 확인이 꺼져 있습니다.':'정기 확인 설정이 꺼져 있습니다.'}</small></div><div><span>최근 확인</span><strong>{data.last_checked_at?formatDate(data.last_checked_at,true):'아직 확인 전'}</strong><small>다음 확인 {automaticEnabled&&(data.next_check_at||data.next_due)?formatDate(data.next_check_at||data.next_due,true):'예정 없음'}</small></div><div><span>오늘 검증</span><strong>{budget.used??'—'} / {budget.daily_limit??data.daily_reasoning_limit??'—'}</strong><small>재사용 {budget.cached??'—'}건 · 확인한 출처 {budget.sources_checked??0}개</small></div></div>
      {data.active_overlay_version&&<p className="legal-watch-version">현재 확인된 법률 기준 적용{data.last_checked_at?' · 최근 확인 '+formatDate(data.last_checked_at,true):''}</p>}
      <div className="legal-change-list">{visible.length?visible.map((change,i)=>{
        const state=change.state||change.status||change.change_type;const url=urlFor(change.url||sources.find(s=>idFor(s)===(change.source_id||change.id))?.url);
        return <article className="legal-change" key={`${change.source_id||change.id||i}:${i}`}><div className="row between wrap"><strong>{change.title||change.source_id||'공식 근거'}</strong><span className={`badge ${['review_required','failed'].includes(state)?'orange':state==='active'?'green':'gray'}`}>{changeNames[state]||'확인됨'}</span></div>{change.message&&<p>{change.message}</p>}<div className="legal-change-meta"><span>{change.effective_date?'시행 '+formatDate(change.effective_date):'시행일 확인 대상'}</span>{change.checked_at&&<span>확인 {formatDate(change.checked_at,true)}</span>}{url&&<a href={url} target="_blank" rel="noopener noreferrer">공식 원문 <Icon name="arrow"/></a>}</div></article>;
      }):<p className="small muted">아직 기록된 변경사항이 없습니다. 확인 대상의 원문과 시행일을 정기적으로 살펴봅니다.</p>}</div>
      <div className="legal-watch-footer"><span>공식 출처 {sources.length}개 · 사건에 해당하는 변경만 반영합니다.</span>{canEdit&&<button className="button secondary small" onClick={()=>{setDraft(toDraft(data));setEditing(!editing);setError('');}}>{editing?'설정 닫기':'확인 범위·검증 한도'}</button>}</div>
      {editing&&draft&&<form className="legal-watch-policy" onSubmit={save}><label className="row small"><input type="checkbox" checked={draft.enabled} onChange={e=>setDraft({...draft,enabled:e.target.checked})}/>공식 근거를 정기적으로 확인합니다.</label><div className="field-grid"><label className="field"><span>확인 주기 (시간)</span><input name="watch_interval_hours" type="number" min="24" max="720" required value={draft.interval_hours} onChange={e=>setDraft({...draft,interval_hours:e.target.value})}/><small>24시간 이상의 간격으로 확인합니다.</small></label><label className="field"><span>하루 확인할 출처 수</span><input name="watch_max_sources" type="number" min="1" max="20" required value={draft.max_sources} onChange={e=>setDraft({...draft,max_sources:e.target.value})}/></label><label className="field"><span>하루 검증 한도</span><input name="watch_daily_limit" type="number" min="1" max="100" required value={draft.daily_reasoning_limit} onChange={e=>setDraft({...draft,daily_reasoning_limit:e.target.value})}/><small>변경이 없는 근거와 이미 확인한 결과는 재사용합니다.</small></label></div><fieldset className="legal-watch-sources"><legend>확인할 공식 출처</legend>{sources.length?sources.map((source,i)=>{const id=idFor(source);return id&&<label className="row small" key={id||i}><input type="checkbox" name="watch_source_id" value={id} checked={draft.source_ids.includes(id)} onChange={e=>setDraft({...draft,source_ids:e.target.checked?[...draft.source_ids,id]:draft.source_ids.filter(x=>x!==id)})}/><span>{source.title||id}</span></label>;}):<p className="small muted">선택할 공식 출처 목록을 불러오지 못했습니다.</p>}</fieldset><div className="form-footer"><button className="button" type="submit" disabled={Boolean(working)}>{working==='policy'?'저장 중':'범위와 한도 저장'}</button></div></form>}
    </>}
  </section>;
}
