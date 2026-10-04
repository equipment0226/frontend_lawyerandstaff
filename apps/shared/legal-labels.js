// Presentation only: labels never supply or approve a calculation input.
export const calculationDecisionLabels=Object.freeze({
  household_reason:'인정 가구원 판단',
  living_cost_reason:'생계비 인정 근거',
  asset_reason:'재산 평가·공제 근거',
  debt_reason:'채권 분류·잔액 근거',
  fee_reason:'회생위원 보수 근거',
  objection_reason:'이의 여부 확인',
  period_reason:'변제기간·적립 회차 근거',
  discount_reason:'현가 할인율 적용 근거',
});

const fieldLabels={
  as_of:'계산 기준일',policy_id:'적용 계산 기준',
  'income.kind':'소득 유형','income.basis':'세전·세후 소득 기준',
  'income.monthly_amount':'월 소득','income.taxes_and_social_insurance':'세금·사회보험료 공제액',
  'income.business_expenses':'사업 필요경비','income.period':'월평균 소득 산정기간',
  'income.evidence_ids':'소득 근거 서류',income:'소득 자료',
  recognized_household_size:'검토할 인정 가구원 수',additional_living_cost:'추가 인정 생계비',
  living_cost_mode:'기본 생계비 기준',base_living_cost:'개별 인정 기본 생계비',
  annual_discount_rate:'현재가치 계산 할인율',months:'변제 회차',prepaid_months:'인가 전 적립 회차',
  monthly_trustee_fee:'월 회생위원 보수',preapproval_costs_paid:'인가 전 비용 납부 여부',
  objection:'채권자·회생위원 이의 여부',period_exception:'변제기간 변경 사유',
  period_order:'기간 변경 법원 결정',period_order_evidence_ids:'기간 변경 결정 근거 서류',
  asset_evidence_ids:'재산 보유 여부 근거 서류',assets:'재산 목록',creditors:'채권자 목록',
  objecting_creditor_ids:'이의를 제기한 채권자',
  'decisions.period_exception_reason':'변제기간 변경 근거',
};
const entityFields={
  assets:{id:'항목 구분',label:'재산명',owned_value:'소유지분 평가액',secured_deduction:'담보 공제',
    exempt_deduction:'면제재산 공제',disposal_cost:'환가비용',evidence_ids:'근거 서류'},
  creditors:{id:'항목 구분',name:'채권자명',kind:'채권 구분',principal:'원금',interest:'이자',
    bankruptcy_dividend:'파산 예상배당액',evidence_ids:'근거 서류'},
};
const blockerLabels={
  LEGAL_INPUT_REASON_REQUIRED:'사건별 판단 근거',INVALID_MONEY:'확인할 금액',INVALID_INTEGER:'인원·기간 확인',
  BOOLEAN_REQUIRED:'여부 확인',EVIDENCE_REQUIRED:'근거 서류 연결',EVIDENCE_NOT_VERIFIED:'근거 서류 검증',
  UNRESOLVED_LEGAL_ISSUE:'미결 법률 쟁점',PREAPPROVAL_COSTS_UNPAID:'인가 전 비용 납부 확인',
  DEBT_LIMIT_EXCEEDED:'채무한도 검토',NO_POSITIVE_REPAYMENT_CAPACITY:'월 변제 여력 확인',
  LIQUIDATION_SHORTFALL:'청산가치 보완',STRATEGY_VERIFICATION:'쟁점·전략 검증',
  OCR_VERIFICATION:'추출값 원문 대조',CALCULATION_MAPPING_VERIFICATION:'계산 항목 원문 대조',
};

export function calculationFieldLabel(field){
  if(typeof field!=='string'||!field)return '';
  if(field.startsWith('decisions.'))return calculationDecisionLabels[field.slice(10)]||fieldLabels[field]||'사건별 판단 근거';
  if(fieldLabels[field])return fieldLabels[field];
  const entity=field.match(/^(assets|creditors)(?:\.(\d+)|\[(\d+)\])(?:\.([a-z_]+))?\.?$/);
  if(entity){
    const group=entity[1],index=Number(entity[2]??entity[3])+1;
    const label=entityFields[group][entity[4]];
    return `${group==='assets'?'재산':'채권자'} ${index}${label?' · '+label:''}`;
  }
  return '추가 확인 항목';
}

export function calculationBlockerTitle(blocker){
  if(!blocker||typeof blocker!=='object')return '확인 사항';
  const field=calculationFieldLabel(blocker.field);
  if(field&&field!=='추가 확인 항목')return field;
  if(typeof blocker.title==='string'&&blocker.title.trim()&&!/^[A-Z0-9_]+$/.test(blocker.title))return blocker.title;
  return blockerLabels[blocker.code]||field||'확인 사항';
}
