import {esc,list,icon} from '/shared/ui.js';

const allowed=new Set(['id','catalog_id','institution','account_number','account_key','account_label','purpose','salary_account','status','name','issuer','period_start','period_end','period_label','issuance_options']);
const groups=[['financial_accounts','은행·계좌'],['document_scopes','서류별 기관·기간'],['creditors','채권자'],['insurance_policies','보험'],['employers','근무처']];
const options=[['certificate_type','증명서 종류'],['address_history','주소 변동 표시'],['person_number_display','주민등록번호 표시 범위'],['tax_scope','세목 범위'],['jurisdiction_scope','조회 관할']];
const copy=value=>JSON.parse(JSON.stringify(value));

export function openScopeEditor({caseData:c,registry,openForm,save}){
  const draft=Object.fromEntries(groups.map(([key])=>[key,copy(list(c[key]))]));
  const locked=new Set(groups.filter(([key])=>draft[key].some(row=>Object.keys(row).some(k=>!allowed.has(k)))).map(([key])=>key));
  const documents=list(registry?.documents);
  const input=(key,title,value='',type='text',attribute='data-scope-key')=>`<label class="field"><span>${esc(title)}</span><input ${attribute}="${esc(key)}" type="${type}" value="${esc(value??'')}"></label>`;
  const rowHtml=(group,row,index)=>`<article class="scope-edit-row" data-scope-row="${index}"><div class="row between"><strong>${group==='financial_accounts'?'계좌':group==='document_scopes'?'서류 범위':'기관'} ${index+1}</strong><button type="button" class="button subtle small" data-scope-remove>${icon('close')} 이 항목 제외</button></div><div class="field-grid">${group==='document_scopes'?`<label class="field"><span>서류 종류</span><select data-scope-key="catalog_id"><option value="">서류를 선택하세요</option>${documents.map(d=>`<option value="${esc(d.id)}" ${row.catalog_id===d.id?'selected':''}>${esc(d.name||d.title||d.id)}</option>`).join('')}${row.catalog_id&&!documents.some(d=>d.id===row.catalog_id)?`<option selected value="${esc(row.catalog_id)}">현재 연결된 서류 (${esc(row.catalog_id)})</option>`:''}</select></label>`:''}${input('institution',group==='employers'?'근무 기관':'기관·발급처',row.institution||row.issuer||'')}${group==='financial_accounts'?input('account_label','계좌 구분 (예: 급여통장 끝 1234)',row.account_label||''):input('name',group==='insurance_policies'?'보험명':group==='employers'?'근무처명':'항목 이름',row.name||'')}${input('period_start','내용 시작일',row.period_start,'date')}${input('period_end','내용 종료일',row.period_end,'date')}${input('period_label','기간에 관한 설명',row.period_label||'')}${input('purpose','확인 목적',row.purpose||'')}</div>${group==='financial_accounts'?`<label class="row small"><input type="checkbox" data-scope-key="salary_account" ${row.salary_account?'checked':''}>급여를 받는 계좌입니다.</label>`:''}<details class="scope-issuance"><summary>발급 옵션</summary><div class="field-grid">${options.map(([key,title])=>input(key,title,row.issuance_options?.[key]||'','text','data-scope-option')).join('')}<label class="field"><span>최근 발급분</span><select data-scope-option="freshness_months"><option value="">법원 기본 기준 사용</option><option value="1" ${row.issuance_options?.freshness_months===1?'selected':''}>1개월 이내</option><option value="2" ${row.issuance_options?.freshness_months===2?'selected':''}>2개월 이내</option></select></label></div><label class="row small"><input type="checkbox" data-scope-option="include_closed_accounts" ${row.issuance_options?.include_closed_accounts?'checked':''}>해지 계좌도 포함합니다.</label></details></article>`;
  const html=`<p class="small muted">확인된 기관과 계좌를 항목별로 입력하세요. 변경하면 기간과 발급 조건에 맞춰 필요한 자료를 다시 정리합니다.</p><label class="field scope-application-date"><span>신청 기준일</span><input type="date" name="application_date" value="${esc(c.application_date||'')}"></label>${groups.map(([key,title])=>`<details class="scope-edit-group" data-scope-group="${key}" ${key==='financial_accounts'?'open':''}><summary>${title} <span class="muted">${draft[key].length}개</span></summary>${locked.has(key)?'<p class="small muted">상세 계산 정보와 연결된 항목입니다. 법률 계산에서 내용을 수정하거나 서류별 기관·기간에 보완 범위를 추가하세요.</p>':`<div data-scope-rows>${draft[key].map((row,index)=>rowHtml(key,row,index)).join('')}</div><button type="button" class="button secondary small" data-scope-add="${key}">${icon('plus')} ${title} 추가</button>`}</details>`).join('')}`;
  const dialog=openForm('기관·계좌·기간 수정',html,'범위 저장·요청 다시 정리',async body=>{
    const data={expected_version:body.expected_version};
    for(const [key,title] of groups){
      if(locked.has(key))continue;
      const rows=[...dialog.querySelectorAll(`[data-scope-group="${key}"] [data-scope-row]`)].map(element=>{
        const original=draft[key][Number(element.dataset.scopeRow)],row=copy(original);
        for(const field of element.querySelectorAll('[data-scope-key]')){
          const name=field.dataset.scopeKey,value=field.type==='checkbox'?field.checked:field.value.trim();
          const previous=name==='institution'?(original.institution||original.issuer||''):original[name]??(field.type==='checkbox'?false:'');
          if(value!==previous){if(value===''||value===false)delete row[name];else row[name]=value;}
        }
        const issuance=copy(original.issuance_options||{});
        for(const field of element.querySelectorAll('[data-scope-option]')){
          const name=field.dataset.scopeOption;let value=field.type==='checkbox'?field.checked:field.value.trim();
          if(name==='freshness_months'&&value!=='')value=Number(value);
          const previous=original.issuance_options?.[name]??(field.type==='checkbox'?false:'');
          if(value!==previous){if(value===''||value===false)delete issuance[name];else issuance[name]=value;}
        }
        if(Object.keys(issuance).length)row.issuance_options=issuance;else delete row.issuance_options;
        if((row.period_start&&!row.period_end)||(!row.period_start&&row.period_end)||row.period_start>row.period_end)throw new Error(`${title}의 시작일과 종료일을 함께 확인해 주세요.`);
        if(key==='document_scopes'&&!row.catalog_id)throw new Error('기관·기간을 지정할 서류 종류를 선택해 주세요.');
        if(!row.institution&&!row.issuer&&!row.name&&!row.account_label&&!row.catalog_id)throw new Error(`${title}의 기관 또는 항목 이름을 입력해 주세요.`);
        return row;
      });
      if(JSON.stringify(rows)!==JSON.stringify(list(c[key])))data[key]=rows;
    }
    if(body.application_date!==(c.application_date||''))data.application_date=body.application_date||null;
    if(Object.keys(data).length===1)throw new Error('변경할 기관·계좌·기간을 입력해 주세요.');
    await save(data);
  });
  dialog.addEventListener('click',event=>{
    const add=event.target.closest('[data-scope-add]'),remove=event.target.closest('[data-scope-remove]');
    if(remove){event.preventDefault();remove.closest('[data-scope-row]').remove();}
    if(add){event.preventDefault();const key=add.dataset.scopeAdd;const row=key==='financial_accounts'?{account_key:'account-'+crypto.randomUUID()}:{};const index=draft[key].push(row)-1;add.closest('[data-scope-group]').querySelector('[data-scope-rows]').insertAdjacentHTML('beforeend',rowHtml(key,row,index));}
  });
  return dialog;
}
