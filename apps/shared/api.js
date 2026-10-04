import {esc, brand, icon, notify} from './ui.js';

const origin = window.DEBTOFF_API_ORIGIN || (['localhost','127.0.0.1'].includes(location.hostname) ? 'http://localhost:8000' : location.origin);
export const API_BASE = origin.replace(/\/$/, '') + '/api';
export const session = {token:sessionStorage.getItem('debtoff-token'), user:null};
async function authConfig(){
  let config={};try{config=await api('/auth/config');}catch{}
  if(!('demo_mode' in config)){try{config=await api('/health');}catch{}}
  session.authConfig=config;return config;
}
export async function api(path, options = {}) {
  const headers = new Headers(options.headers || {});
  if (session.token) headers.set('Authorization', `Bearer ${session.token}`);
  let body = options.body;
  if (body && !(body instanceof FormData)) { headers.set('Content-Type','application/json'); body = JSON.stringify(body); }
  let response;
  try { response = await fetch(API_BASE + path, {...options, headers, body, signal: options.signal || AbortSignal.timeout(body instanceof FormData?210000:120000)}); }
  catch (error) { throw new Error(error.name === 'TimeoutError' ? '서버 응답 시간이 초과되었습니다. 상태를 새로고침한 후 다시 시도하세요.' : '서버에 연결할 수 없습니다. 백엔드 실행 상태와 연결 주소를 확인하세요.'); }
  if (!response.ok) {
    let detail; try { detail = await response.json(); } catch { detail = {}; }
    const info = detail.detail || detail.error || detail;
    const message = typeof info === 'string' ? info : info.message || (Array.isArray(info) ? info.map(x=>x.msg).join(', ') : `요청이 거절되었습니다 (${response.status}).`);
    const error = new Error(message); error.status=response.status; error.detail=detail;
    if(response.status===401 && path!=='/auth/login') {sessionStorage.removeItem('debtoff-token');session.token=null;window.dispatchEvent(new Event('session-expired'));}
    throw error;
  }
  if(options.download){
    const blob=await response.blob();
    if(options.download==='file')return {blob,disposition:response.headers.get('Content-Disposition')||''};
    return blob;
  }
  if(response.status===204)return null;
  return response.json();
}
export function responseFilename(disposition,fallback='문서.pdf') {
  let name='';
  const encoded=/filename\*=UTF-8''([^;]+)/i.exec(disposition);
  const plain=/filename="([^"]+)"|filename=([^;]+)/i.exec(disposition);
  try{name=encoded?decodeURIComponent(encoded[1]):plain?(plain[1]||plain[2]).trim():fallback;}catch{name=fallback;}
  return String(name||fallback).replace(/[\x00-\x1f\x7f<>:"/\\|?*]/g,'_').replace(/[. ]+$/g,'').slice(0,220)||'문서.pdf';
}
export async function download(path, filename) { const {blob,disposition}=await api(path,{download:'file'}); const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=responseFilename(disposition,filename);document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000); }
export async function logout() {try{await api('/auth/logout',{method:'POST'});}catch(error){notify(error.message,'error');}finally{sessionStorage.removeItem('debtoff-token');session.token=null;session.user=null;}}
export async function authenticate(kind, onReady) {
  if(session.token) { try { const result=await api('/auth/me'); session.user=result.user||result; if(kind==='portal' && session.user.role!=='client') throw new Error('고객 계정으로 로그인하세요.'); if(kind==='office' && session.user.role==='client') throw new Error('사무소 계정으로 로그인하세요.'); await authConfig();await onReady();return; } catch(error){session.token=null;sessionStorage.removeItem('debtoff-token');notify(error.message,'error');} }
  const office=kind==='office';
  const config=await authConfig();
  const fresh=config.start_profile==='fresh'&&config.local_test_accounts===true;
  const isDemo=fresh||Boolean(config.allow_demo_shortcuts??config.demo_mode);
  document.querySelector('#app').innerHTML=`<main class="auth-shell"><section class="auth-hero"><div class="brand">${brand()}</div><div><div class="eyebrow">${office?'YOUR WORK, WITH CLARITY':'A NEW CHAPTER BEGINS'}</div><h1>${office?'복잡한 사건의 흐름을,<br>명확한 다음 단계로.':'새로운 시작을 향해,<br>한 걸음씩 함께.'}</h1><p>${office?'자료와 근거를 연결하고, 필요한 판단에 집중하세요. 개인회생 사건의 접수부터 보정까지 이어지는 업무공간입니다.':'내 사건이 어디까지 진행되었는지, 어떤 서류가 필요한지. 이제 한곳에서 편하게 확인하세요.'}</p></div><p class="small">빚오프 · ${office?'사무소 업무공간':'고객 전용 포털'}</p></section><section class="auth-side"><div class="auth-form"><div class="eyebrow">${office?'OFFICE WORKSPACE':'CLIENT PORTAL'}</div><h2>${office?'업무공간 로그인':'내 사건 확인하기'}</h2><p>${office?'직원과 변호사를 위한 사건 관리 공간입니다.':'사무소에서 안내받은 계정으로 로그인해 주세요.'}</p><form id="login-form"><label class="field"><span>아이디</span><input name="username" autocomplete="username" required placeholder="아이디를 입력해 주세요"></label><label class="field"><span>비밀번호</span><input name="password" type="password" autocomplete="current-password" required placeholder="비밀번호를 입력해 주세요"></label><div id="login-error" class="small" role="alert" style="color:#a94d2d;margin-bottom:14px"></div><button class="button wide" type="submit">로그인 ${icon('arrow')}</button></form><div class="auth-note ${isDemo?'':'hidden'}"><strong>로컬 시연 계정</strong><p style="margin:5px 0 12px">합성 사건으로 업무 흐름을 확인할 수 있습니다.</p><div class="demo-accounts">${office?'<button data-demo="staff">직원으로 확인</button><button data-demo="lawyer">변호사로 확인</button>':'<button data-demo="client">고객으로 확인</button>'}</div><span>${icon('shield')} 사건별 접근 권한이 적용됩니다.</span></div></div></section></main>`;
  if(fresh){const note=document.querySelector('.auth-note');note.querySelector('strong').textContent='로컬 테스트 계정';note.querySelector('p').textContent='새 업무공간에서 직원·변호사 역할을 확인합니다.';}
  document.querySelectorAll('[data-demo]').forEach(btn=>btn.onclick=()=>{const form=document.querySelector('#login-form');const role=btn.dataset.demo;form.elements.username.value=fresh?(role==='client'?'customer':role):'demo-'+role;form.elements.password.value=fresh?(role==='client'?'customer':role):'debtoff-demo';form.requestSubmit();});
  document.querySelector('#login-form').onsubmit=async(event)=>{event.preventDefault();const form=event.target;const btn=form.querySelector('[type=submit]');btn.disabled=true;document.querySelector('#login-error').textContent='';try{const data=await api('/auth/login',{method:'POST',body:Object.fromEntries(new FormData(form))});if(office && data.user.role==='client' || !office && data.user.role!=='client') throw new Error(office?'사무소 계정으로 로그인하세요.':'고객 계정으로 로그인하세요.');session.token=data.token;session.user=data.user;sessionStorage.setItem('debtoff-token',data.token);await onReady();}catch(error){document.querySelector('#login-error')?.append(document.createTextNode(error.message));}finally{btn.disabled=false;}};
}
