import {esc,list,date,badge,icon,empty,modal,notify} from '/shared/ui.js';
import {api} from '/shared/api.js';
import {requestWithdrawn,requestScope} from '/shared/requests.js';
import {structuredHtml} from '/shared/structured.js';

const warnings={
  timeout:'처리 시간이 초과되어 남은 부분을 확인해야 합니다.',page_limit:'자동 판독 쪽수 제한을 넘어 원문 확인이 필요합니다.',
  queue_busy:'다른 자료를 처리 중입니다.',engine_unavailable:'현재 자동 판독을 사용할 수 없습니다.',worker_failed:'자동 판독을 완료하지 못했습니다.',
  page_error:'이 페이지를 읽지 못했습니다.',no_text:'읽어낸 본문이 없습니다.',no_reliable_text:'신뢰할 수 있는 본문을 확정하지 못했습니다.',
  low_confidence_lines_excluded:'불확실한 줄은 추출값에 사용하지 않았습니다.',uncertain_lines_excluded:'확인이 필요한 줄은 추출값에 사용하지 않았습니다.',
  recognition_disagreement:'같은 부분의 판독이 서로 다릅니다. 아래 대안과 원문을 확인하세요.',
  native_ocr_disagreement:'PDF 본문과 이미지의 판독이 다릅니다.',mixed_layout_unresolved:'PDF 본문과 스캔의 읽기 순서를 확인해야 합니다.',
  line_retry_limit:'일부 줄의 추가 판독을 보류했습니다.',line_retry_failed:'일부 줄의 추가 판독을 완료하지 못했습니다.',
};
const confidence=value=>typeof value==='number'&&Number.isFinite(value)?Math.round(value*100)+'%':'원문 텍스트';
const pointText=box=>list(box).map(point=>list(point).map(value=>Number.isFinite(Number(value))?Math.round(Number(value)):'?').join(', ')).join(' / ');
const candidates=line=>list(line.recognition_candidates).length?`<details><summary>최초·추가 판독 비교</summary>${line.recognition_candidates.map(candidate=>`<p class="small"><strong>${candidate.method==='upright_crop'?'원래 방향 재판독':'최초 판독'} · ${esc(confidence(candidate.confidence))}</strong><br>${esc(candidate.text)}</p>`).join('')}</details>`:'';

export function ocrDetail(document){
  return list(document?.page_texts).map(page=>{
    const notes=[...new Set(list(page.warnings).map(code=>warnings[code]||'추가 원문 확인이 필요합니다.'))];
    return `<section class="section-spacer"><h3>${esc(page.page)}쪽 · ${page.extraction_method==='ocr'?'스캔 판독':'본문 텍스트'}</h3>
      <p class="small muted">${typeof page.confidence==='number'?'평균 판독 신뢰도 '+esc(confidence(page.confidence))+' · ':''}${notes.map(esc).join(' ')}</p>
      <pre class="code-block">${esc(page.text||'확정할 수 있는 본문이 없습니다. 아래 판독 후보와 원문을 확인하세요.')}</pre>
      ${list(page.lines).length?`<details><summary>행별 판독·신뢰도·원문 위치</summary><div class="table-wrap"><table><thead><tr><th>판독 행</th><th>신뢰도</th><th>확인</th></tr></thead><tbody>${page.lines.map(line=>`<tr><td>${esc(line.text)}${candidates(line)}<small class="cell-sub">원문 위치 · ${esc(pointText(line.bbox))}${line.coordinate_space==='pdf_points'?' (PDF 좌표)':' (이미지 좌표)'}</small></td><td>${esc(confidence(line.confidence))}</td><td>${line.requires_review?'추출에서 제외 · 원문 확인 필요':line.source==='native_text'?'PDF 원문 보존':'본문에 반영 · 대조 필요'}</td></tr>`).join('')}</tbody></table></div></details>`:''}
    </section>`;
  }).join('')||'<p class="muted">아직 쪽별 판독 기록이 없습니다.</p>';
}

const inactiveCandidates=new Set(['rejected','superseded','quarantined']);
const inactiveDocuments=new Set(['rejected','superseded','quarantined']);
const candidateNames={accepted:'검토 완료',corrected:'정정 완료',rejected:'반려 이력',superseded:'이전 추출',quarantined:'격리된 항목'};
const documentNames={verified:'서류 검증 완료',received:'제출됨 · 검토 대기',needs_more:'자료 보완 필요',quarantined:'인물 확인 필요',rejected:'반려 자료',superseded:'이전 제출본'};
const documentCandidates=(caseData,documentId)=>list(caseData.extraction_candidates).filter(row=>row.document_id===documentId);
const currentCandidates=(caseData,documentId)=>documentCandidates(caseData,documentId).filter(row=>!inactiveCandidates.has(row.status));
const extractionState=doc=>doc.extraction_state||{status:'pending',can_review:false,message:'서류별 추출 완료 여부를 확인하고 있습니다.'};
function extractionStatus(doc){
  const state=extractionState(doc),names={pending:'추출 대기',running:'내용 추출 중',completed:'추출 완료',failed:'추출 오류 · 재확인 필요'};
  const count=Number.isInteger(state.parsed_pages)&&Number.isInteger(state.total_pages)?`${state.parsed_pages} / ${state.total_pages}쪽`:'';
  return `<div class="document-extraction-state is-${esc(state.status)}" data-extraction-status="${esc(state.status)}"><div class="row wrap">${state.status==='running'?'<span class="document-mini-spinner" aria-hidden="true"></span>':icon(state.status==='completed'?'check':state.status==='failed'?'info':'clock')}<strong>${names[state.status]||names.pending}</strong>${count?`<span>${count}</span>`:''}</div>${state.message?`<p>${esc(state.message)}</p>`:''}</div>`;
}

export function documentReviewWorkspace(caseData,{requestsHtml='',documentCheck=()=>''}={}){
  const docs=list(caseData.documents),activeRequests=list(caseData.requests).filter(row=>!requestWithdrawn(row)&&!row.no_longer_required);
  const linked=request=>docs.filter(doc=>!inactiveDocuments.has(doc.status)&&(doc.request_id===request.id||list(request.document_ids).includes(doc.id)));
  const received=activeRequests.filter(request=>linked(request).length).length;
  const fulfilled=activeRequests.filter(request=>request.status==='fulfilled').length;
  const verified=docs.filter(doc=>doc.status==='verified').length;
  const scope=requestScope;
  const rows=activeRequests.map(request=>{
    const submitted=linked(request),checked=submitted.filter(doc=>doc.status==='verified').length;
    return `<tr><td><strong>${esc(request.title)}</strong><small class="cell-sub">${esc(scope(request))}</small></td><td>${submitted.length?`${submitted.length}개 제출`:'미제출'}</td><td>${request.status==='fulfilled'?badge('fulfilled','요청 충족'):request.status==='needs_more'?badge('needs_more','보완 요청'):checked?badge('pending',`${checked}개 검증 · 범위 확인 중`):badge('pending','검토 대기')}</td></tr>`;
  }).join('');
  return `<section class="card document-request-status" data-document-request-status><div class="card-head"><div><h2>요청 서류와 제출·검증 현황</h2><p class="small muted">필요한 서류를 먼저 확인하고, 받은 서류에서 원문과 추출값을 함께 검토하세요.</p></div><div class="row wrap"><button class="button secondary small" data-action="automation-scopes">기관·계좌·기간</button><button class="button secondary small" data-action="request">${icon('plus')} 자료 요청</button></div></div><div class="card-body"><div class="metrics document-review-metrics"><div class="metric"><span>필요한 요청 서류</span><strong>${activeRequests.length}<small>건</small></strong></div><div class="metric"><span>자료가 제출된 요청</span><strong>${received}<small> / ${activeRequests.length}건</small></strong></div><div class="metric"><span>요청 범위 충족</span><strong>${fulfilled}<small> / ${activeRequests.length}건</small></strong></div><div class="metric"><span>받은 서류 검증 완료</span><strong>${verified}<small> / ${docs.length}개</small></strong></div></div>${rows?`<div class="table-wrap"><table><thead><tr><th>요청 서류·기관·기간</th><th>제출 현황</th><th>서류 검증</th></tr></thead><tbody>${rows}</tbody></table></div>`:empty('현재 요청 중인 서류가 없습니다','세부 상담과 사건 조건에 따라 필요한 서류가 정해집니다.')}<details class="request-detail-history"><summary>요청 조건·근거와 철회 이력 보기</summary>${requestsHtml}</details></div></section><section class="card received-document-workspace" data-received-documents><div class="card-head"><div><h2>받은 서류 <span class="small muted">${docs.length}개</span></h2><p class="small muted">서류별로 내용을 확인한 뒤 검토 완료를 한 번만 저장합니다.</p></div><div class="row wrap"><button class="button secondary small" data-action="sample-bundle">가상자료 ZIP</button><button class="button small" data-action="upload">${icon('upload')} 자료 추가</button></div></div><div class="card-body received-document-grid">${docs.map(doc=>{
    const candidates=currentCandidates(caseData,doc.id),accepted=candidates.filter(row=>row.status==='accepted'||row.status==='corrected').length;
    const request=activeRequests.find(row=>row.id===doc.request_id||list(row.document_ids).includes(doc.id));
    const statusText=documentNames[doc.status]||'검토 대기';
    return `<article class="received-document-card" data-received-document="${esc(doc.id)}"><div class="row between wrap"><span class="document-file-symbol">${icon('file')}</span>${badge(doc.status,statusText)}</div><h3>${esc(doc.filename||doc.name||'제출 자료')}</h3><p class="small muted">${esc(request?.title||'별도 제출·참고 자료')} · ${date(doc.created_at||doc.uploaded_at,true)}</p>${extractionStatus(doc)}<div class="document-extraction-count"><strong>추출 항목 ${candidates.length}개</strong><span>${accepted}개 검토 완료${candidates.length-accepted?` · ${candidates.length-accepted}개 확인 필요`:''}</span></div>${doc.status==='quarantined'?'<p class="small muted">사건 당사자와 자료의 인물을 먼저 확인해 주세요.</p>':''}<div class="document-review-actions"><button class="button" data-action="document-extractions" data-id="${esc(doc.id)}">이 서류의 추출내용 보기 ${icon('arrow')}</button><div class="row wrap"><button class="button secondary small" data-action="download-doc" data-id="${esc(doc.id)}">${icon('download')} 원문 다운로드</button><button class="button subtle small" data-action="automation-metadata" data-id="${esc(doc.id)}">기관·기간 정정</button></div></div>${documentCheck(doc)?`<details class="document-check-details"><summary>서류 검증·판독 이력</summary>${documentCheck(doc)}</details>`:''}</article>`;
  }).join('')||empty('아직 받은 서류가 없습니다','고객이 제출하면 이곳에 표시됩니다. 담당자가 직접 추가할 수도 있습니다.')}</div></section>`;
}

export function createDocumentReview({getState,load,formatValue,formatContext,formatLocation}){
  async function open(documentId){
    const caseData=getState().current,doc=list(caseData?.documents).find(row=>row.id===documentId);
    if(!doc)return;
    const expectedVersion=caseData.version;
    const candidates=currentCandidates(caseData,doc.id),history=documentCandidates(caseData,doc.id).filter(row=>inactiveCandidates.has(row.status));
    const state=extractionState(doc),unavailable=state.status!=='completed'||state.can_review!==true;
    const readOnly=inactiveDocuments.has(doc.status)||unavailable;
    const request=list(caseData.requests).find(row=>row.id===doc.request_id||list(row.document_ids).includes(doc.id));
    const title=doc.filename||doc.name||'제출 자료';
    const rowHtml=(item,index)=>{
      const scalar=item.value===null||['string','number','boolean'].includes(typeof item.value);
      const valueField=typeof item.value==='boolean'?`<select data-correct-value aria-label="정정할 값"><option value="true" ${item.value?'selected':''}>기재 있음</option><option value="false" ${!item.value?'selected':''}>기재 없음</option></select>`:`<input data-correct-value aria-label="정정할 값" type="${typeof item.value==='number'?'number':'text'}" ${typeof item.value==='number'?'step="any"':''} value="${esc(item.value??'')}" maxlength="10000">`;
      return `<article class="document-candidate-row" data-review-candidate="${esc(item.id)}" data-review-index="${index}"><div class="row between wrap"><h4>${esc(item.label||'추출 항목')}</h4>${badge(item.status,candidateNames[item.status]||'원문 대조 필요')}</div><div class="document-candidate-value">${scalar?esc(formatValue(item)):structuredHtml(item.value)}</div>${formatContext(item)}<blockquote>${esc(item.quote||'연결된 인용문이 없습니다. 원문에서 값을 확인하세요.')}</blockquote><p class="small muted">${item.page?`${esc(item.page)}쪽`:''}${formatLocation(item)}</p>${readOnly?'':`<button class="button subtle small" type="button" data-edit-candidate>${scalar?'값 정정':'잘못된 항목 제외'}</button><div class="document-candidate-controls" data-candidate-editor hidden><label class="field"><span>변경할 내용</span><select data-review-decision aria-label="${esc(item.label||'추출 항목')} 변경 방법">${scalar?'<option value="correct">값 정정</option>':''}<option value="reject">잘못된 추출 · 제외</option></select></label><label class="field" data-correct-field ${scalar?'':'hidden'}><span>정정할 값</span>${valueField}</label><button class="button subtle small" type="button" data-cancel-edit>정정 취소</button></div>`}${item.review?.reason?`<details><summary>이전 확인 내용</summary><p>${esc(item.review.reason)}</p><p class="small muted">${esc(item.review.actor||'담당자')} · ${date(item.review.at,true)}</p></details>`:''}</article>`;
    };
    const dialog=modal('서류 원문·추출값 검토',`<form class="document-review-form" data-document-review-form><div class="document-review-intro"><div><h3>${esc(title)}</h3><p>${esc(request?.title||'별도 제출·참고 자료')}${request?.period?' · '+esc(request.period):''}</p></div>${badge(doc.status,documentNames[doc.status]||'검토 대기')}</div><div class="document-review-layout"><section class="document-original-pane"><div class="row between wrap"><h3>제출 원문</h3><button type="button" class="button secondary small" data-action="download-doc" data-id="${esc(doc.id)}">${icon('download')} 원문 다운로드</button></div><div class="document-original-preview" data-original-preview><p class="small muted">원문을 불러오고 있습니다.</p></div><details class="document-source-text"><summary>읽어낸 원문 텍스트·쪽별 판독 보기</summary>${list(doc.page_texts).length?ocrDetail(doc):`<pre class="code-block">${esc(doc.text||doc.extraction?.text||'아직 판독된 텍스트가 없습니다. 원문 파일을 확인해 주세요.')}</pre>`}</details></section><section class="document-candidates-pane"><div class="row between wrap"><h3>이 서류에서 추출한 내용</h3><span class="badge gray">${candidates.length}개 항목</span></div><p class="small muted">원문과 일치하는 항목은 그대로 두고, 잘못 읽은 값만 정정하거나 제외하세요. 저장할 때 전체 결과가 함께 기록됩니다.</p><div class="document-candidate-list">${candidates.map(rowHtml).join('')||empty('이 서류에 연결된 추출 항목이 없습니다','서류의 인물·범위·내용을 먼저 확인할 수 있습니다. 값이 없다는 뜻이나 추출 완료를 의미하지는 않습니다.')}</div>${history.length?`<details class="document-extraction-history"><summary>이전 추출·제외된 항목 ${history.length}개</summary>${history.map(item=>`<article><strong>${esc(item.label||'추출 항목')}</strong> ${badge(item.status,candidateNames[item.status])}<p>${esc(formatValue(item))}</p><blockquote>${esc(item.quote||'인용 기록 없음')}</blockquote>${item.review?.reason?`<p>${esc(item.review.reason)}</p>`:''}</article>`).join('')}</details>`:''}</section></div>${readOnly?'<div class="callout warning">격리·반려·대체된 원문은 확인용으로 보관합니다. 해당 자료의 인물과 유효성을 먼저 정리한 뒤 검토하세요.</div>':`<fieldset class="document-review-confirmations"><legend>서류와 추출내용을 함께 검토 완료</legend><p class="small muted">서류 검증과 ${candidates.length}개 추출 항목의 검토를 한 번에 저장합니다. 법률 판단과 작성 문서의 최종 승인은 이후 단계에서 진행합니다.</p>${[['person_confirmed','문서의 인물과 사건 당사자가 일치합니다.'],['scope_confirmed','요청한 종류·기간·기관·계좌와 필요한 쪽수가 포함됐습니다.'],['content_confirmed','원문과 위 추출 항목 전체를 확인했고 필요한 정정·제외를 반영했습니다.']].map(([name,label])=>`<label class="document-review-check"><input type="checkbox" name="${name}" required><span>${label}</span></label>`).join('')}<label class="field"><span>확인 내용과 정정 이유</span><textarea name="reason" minlength="5" maxlength="1500" required placeholder="원문에서 확인한 내용과 정정한 항목이 있다면 이유를 적어 주세요."></textarea></label></fieldset>`}<div data-review-error role="alert" class="document-review-error"></div><div class="form-footer"><button class="button secondary" type="button" data-review-close>닫기</button>${readOnly?'':'<button class="button" type="submit">이 서류 검토 완료</button>'}</div></form>`);
    dialog.classList.add('document-review-dialog');
    if(unavailable&&!inactiveDocuments.has(doc.status)){
      const warning=dialog.querySelector('.callout.warning');
      if(warning)warning.innerHTML=`${extractionStatus(doc)}<p>이 서류의 추출이 모두 완료되어야 검토 완료를 저장할 수 있습니다. 진행 상태를 확인한 뒤 최신 자료를 다시 열어 주세요.</p>`;
      const footer=dialog.querySelector('.form-footer'),button=document.createElement('button');
      button.type='button';button.className='button';button.disabled=true;button.textContent='추출 완료 후 검토 가능';footer.append(button);
    }
    const form=dialog.querySelector('form');
    let originalURL;
    dialog.addEventListener('close',()=>{if(originalURL)URL.revokeObjectURL(originalURL);},{once:true});
    dialog.querySelector('[data-review-close]').onclick=()=>dialog.close();
    form.addEventListener('input',()=>{form.dataset.dirty='true';});
    form.addEventListener('click',event=>{
      const edit=event.target.closest('[data-edit-candidate],[data-cancel-edit]');if(!edit)return;
      const row=edit.closest('[data-review-candidate]'),editor=row.querySelector('[data-candidate-editor]');
      editor.hidden=edit.hasAttribute('data-cancel-edit');
      row.querySelector('[data-edit-candidate]').hidden=!editor.hidden;
      const field=row.querySelector('[data-correct-value]');
      field.required=!editor.hidden&&row.querySelector('[data-review-decision]').value==='correct';
      form.dataset.dirty='true';
    });
    form.addEventListener('change',event=>{
      form.dataset.dirty='true';
      if(!event.target.matches('[data-review-decision]'))return;
      const row=event.target.closest('[data-review-candidate]'),field=row.querySelector('[data-correct-field]');
      if(field){field.hidden=event.target.value!=='correct';field.querySelector('[data-correct-value]').required=event.target.value==='correct';}
    });
    form.onsubmit=async event=>{
      event.preventDefault();if(readOnly)return;
      const button=form.querySelector('[type="submit"]'),error=dialog.querySelector('[data-review-error]');
      button.disabled=true;error.textContent='';
      try{
        const fd=new FormData(form);
        const reviews=candidates.flatMap((item,index)=>{
          const row=form.querySelector(`[data-review-index="${index}"]`);
          if(row.querySelector('[data-candidate-editor]').hidden)return [];
          const decision=row.querySelector('[data-review-decision]').value;
          const review={candidate_id:item.id,decision};
          if(decision==='correct'){
            const raw=row.querySelector('[data-correct-value]').value;
            if(typeof item.value==='number'){
              if(raw.trim()===''||!Number.isFinite(Number(raw)))throw new Error('정정할 숫자를 입력해 주세요. 빈 값은 0으로 처리하지 않습니다.');
              review.value=Number(raw);
            }else if(typeof item.value==='boolean')review.value=raw==='true';
            else{if(!raw.trim())throw new Error('정정할 값을 입력하거나 잘못된 추출 항목으로 제외해 주세요.');review.value=raw;}
          }
          return [review];
        });
        const response=await api(`/cases/${encodeURIComponent(caseData.id)}/documents/${encodeURIComponent(doc.id)}/review`,{method:'POST',body:{expected_version:expectedVersion,scope_confirmed:fd.get('scope_confirmed')==='on',content_confirmed:fd.get('content_confirmed')==='on',person_confirmed:fd.get('person_confirmed')==='on',reason:String(fd.get('reason')||'').trim(),candidate_reviews:reviews}});
        getState().current=response.case||response;
        dialog.close();
        notify('서류와 추출내용의 검토를 함께 저장했습니다. 변경된 내용을 다음 분석에 반영합니다.');
        await load();
      }catch(failure){error.textContent=failure.status===409?'다른 작업으로 자료가 변경되었습니다. 입력한 내용은 남아 있습니다. 내용을 확인한 뒤 창을 닫고 최신 자료를 다시 열어 주세요.':failure.message;}
      finally{button.disabled=false;}
    };
    try{
      const blob=await api(`/cases/${encodeURIComponent(caseData.id)}/documents/${encodeURIComponent(doc.id)}/download`,{download:true});
      if(!dialog.isConnected)return;
      const container=dialog.querySelector('[data-original-preview]');
      if(blob.type.includes('pdf')||/\.pdf$/i.test(title)){
        originalURL=URL.createObjectURL(new Blob([blob],{type:'application/pdf'}));
        const frame=document.createElement('iframe');frame.title='제출한 원문 PDF';frame.src=originalURL;container.replaceChildren(frame);
      }else if(/^image\/(png|jpeg|webp)$/.test(blob.type)){
        originalURL=URL.createObjectURL(blob);const image=document.createElement('img');image.alt='제출한 원문 이미지';image.src=originalURL;container.replaceChildren(image);
      }else{
        const pre=document.createElement('pre');pre.className='code-block';pre.textContent=doc.text||doc.extraction?.text||'이 형식은 원문 다운로드로 확인할 수 있습니다.';container.replaceChildren(pre);
      }
    }catch(failure){if(dialog.isConnected)dialog.querySelector('[data-original-preview]').textContent='원문 미리보기를 불러오지 못했습니다. 원문 다운로드로 확인해 주세요.';}
    return dialog;
  }
  return {open};
}
