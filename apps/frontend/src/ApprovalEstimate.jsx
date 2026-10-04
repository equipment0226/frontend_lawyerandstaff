import React from 'react';
import {date, list} from '../../shared/ui.js';

const validPercentage=value=>typeof value==='number'&&Number.isFinite(value)&&value>=0&&value<=100;
const count=value=>Number.isInteger(value)&&value>=0?value:0;
const percent=value=>new Intl.NumberFormat('ko-KR',{maximumFractionDigits:1}).format(value)+'%';

export default function ApprovalEstimate({caseData}){
  const estimate=caseData.approval_estimate||[...list(caseData.strategy_analyses)].reverse().find(item=>!item.stale&&item.input_revision===caseData.input_revision&&item.approval_estimate)?.approval_estimate||{};
  const observed=estimate.observed_rate||{},distribution=estimate.distribution||{},cohort=estimate.cohort||{};
  const sample=count(estimate.evidence_count),minimum=count(estimate.minimum_sample_size)||30;
  const available=estimate.status==='observed_rate_available'&&sample>=minimum&&validPercentage(observed.percentage);
  const interval=observed.confidence_interval;
  const showInterval=available&&interval?.level===0.95&&validPercentage(interval.lower)&&validPercentage(interval.upper)&&interval.lower<=interval.upper;
  const reasons=list(estimate.reasons).map(reason=>typeof reason==='string'?reason:reason.message).filter(Boolean);
  return <section className="approval-estimate" aria-label="인가 가능성 참고 지표" data-react-component="ApprovalEstimate">
    <div className="approval-heading"><div><span className="eyebrow">OUTCOME EVIDENCE</span><h3>인가 가능성 참고 지표</h3></div><span className="approval-basis-tag">확인된 법원 결과 기준</span></div>
    <div className="approval-metrics">
      <div className="approval-prediction"><span>이 사건의 인가 예측</span><strong>예측 보류</strong><p>{estimate.prediction?.reason||'개별 사건 예측을 검증할 자료가 아직 충분하지 않습니다.'}</p></div>
      <div className={`approval-observed ${available?'has-observations':''}`}><span>유사 사건 관측 인가비율</span><strong data-observed-rate>{available?percent(observed.percentage):'—'}</strong><p>{available?`검증된 종결 결과 ${sample.toLocaleString('ko-KR')}건 기준`:'결과 표본 부족'}{!available&&<small>검증된 종결 결과 {sample.toLocaleString('ko-KR')} / 최소 {minimum.toLocaleString('ko-KR')}건</small>}</p>{showInterval&&<small>95% 신뢰구간 {percent(interval.lower)}–{percent(interval.upper)}</small>}</div>
    </div>
    <p className="approval-interpretation">{available?'유사 사건에서 확인한 과거 결과의 비율입니다. 이 사건의 결과는 개별 심사에 따라 달라집니다.':'검증된 실제 결과가 쌓이면 유사 사건의 관측 비율을 표시합니다.'}</p>
    <div className="approval-distribution" aria-label="확인된 결과 분포"><span>인가 <b>{count(distribution.approved)}</b></span><span>불인가·기각 <b>{count(distribution.rejected)}</b></span><span>보정 <b>{count(distribution.correction)}</b></span></div>
    <details className="approval-details"><summary>산정 근거와 현재 제약</summary><p>{observed.scope||'같은 사무소·법원·사건유형과 유사한 사전 위험분류의 실제 결과를 비교합니다.'}</p><p>{estimate.outcome_definition||'검증된 법원 원문과 결정 유형이 연결된 최종 결과를 집계하며 보정은 종결 비율에서 제외합니다.'}</p>{reasons.length>0&&<ul>{reasons.map((reason,index)=><li key={index}>{reason}</li>)}</ul>}<p className="approval-as-of">{caseData.court_name||'현재 관할'}{cohort.lookback_start?' · '+date(cohort.lookback_start)+' 이후 결과':''}{(estimate.as_of||cohort.as_of)?' · 확인 '+date(estimate.as_of||cohort.as_of):''}</p></details>
  </section>;
}
