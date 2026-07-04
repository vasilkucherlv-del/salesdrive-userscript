/* ============================================================================
   mobile-loader.js — завантажувач юзерскрипта для браузерів БЕЗ Tampermonkey
   (Chrome на телефоні тощо). Викликається закладкою-bookmarklet, працює в
   контексті сторінки SalesDrive, підставляє прошарок GM_* через fetch і
   підвантажує сам salesdrive.user.js із GitHub.

   Обмеження: крос-доменні запити (Google-таблиці) залежать від CORS — якщо
   Google не віддасть заголовки, підказки/аналоги/база не завантажаться, але
   кнопки/каса/автоорганізація (усе, що працює через Angular) — так.
   ========================================================================= */
(function(){
  'use strict';
  var W = window;
  if(W.__lkMobileLoaded){ try{ alert('SalesDrive-скрипт уже завантажено на цій сторінці'); }catch(e){} return; }

  /* ---- прошарок GM_* прямо в контексті сторінки ---- */
  W.unsafeWindow = W;
  if(typeof W.GM_setValue!=='function')
    W.GM_setValue = function(k,v){ try{ localStorage.setItem('lkgm_'+k, JSON.stringify(v)); }catch(e){} };
  if(typeof W.GM_getValue!=='function')
    W.GM_getValue = function(k,d){ try{ var v=localStorage.getItem('lkgm_'+k); return v==null?d:JSON.parse(v); }catch(e){ return d; } };
  if(typeof W.GM_setClipboard!=='function')
    W.GM_setClipboard = function(t){ try{ navigator.clipboard.writeText(String(t)); }catch(e){} };
  if(typeof W.GM_xmlhttpRequest!=='function')
    W.GM_xmlhttpRequest = function(o){
      o = o || {};
      fetch(o.url, { method:o.method||'GET', headers:o.headers||undefined, body:o.data||undefined, credentials:'omit' })
        .then(function(r){ return r.text().then(function(t){ if(o.onload) o.onload({ status:r.status, responseText:t, finalUrl:r.url, responseHeaders:'' }); }); })
        .catch(function(e){ if(o.onerror) o.onerror(e); });
    };

  function toast(msg, color){
    try{
      var b=document.createElement('div');
      b.textContent=msg;
      b.style.cssText='position:fixed;bottom:10px;left:10px;z-index:2147483647;background:'+(color||'#2ecc71')+';color:#fff;padding:6px 10px;border-radius:8px;font:13px/1.2 sans-serif;box-shadow:0 2px 8px rgba(0,0,0,.3)';
      (document.body||document.documentElement).appendChild(b);
      setTimeout(function(){ try{b.remove();}catch(e){} }, 3500);
    }catch(e){}
  }

  /* ---- підвантажити сам скрипт із GitHub і виконати в контексті сторінки ---- */
  var RAW='https://raw.githubusercontent.com/vasilkucherlv-del/salesdrive-userscript/main/salesdrive.user.js?_='+(+new Date());
  fetch(RAW).then(function(r){ return r.text(); }).then(function(src){
    try{
      var s=document.createElement('script');
      s.textContent=src;
      (document.head||document.documentElement).appendChild(s);
      s.remove();
      W.__lkMobileLoaded=true;
      toast('✅ SalesDrive-скрипт завантажено');
    }catch(e){
      toast('⚠️ Не вдалось запустити (можливо, CSP): '+e.message, '#e67e22');
    }
  }).catch(function(e){
    toast('❌ Не завантажився скрипт: '+e.message, '#e74c3c');
  });
})();
