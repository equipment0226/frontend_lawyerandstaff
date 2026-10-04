import {esc,list} from '/shared/ui.js';

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
