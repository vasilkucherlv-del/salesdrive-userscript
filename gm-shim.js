/* ▼▼▼ МОДУЛЬ-START • gm-shim — прошарок GM_* для збірки-розширення ▼▼▼
   Підміняє API Tampermonkey, щоб salesdrive.user.js працював як звичайний
   content script БЕЗ ЖОДНИХ змін у самому файлі скрипта.
   Вантажиться ПЕРШИМ (див. manifest.json → content_scripts.js).            */
'use strict';

/* unsafeWindow: у content script окремий JS-світ, але DOM (події, атрибути)
   спільний зі сторінкою — саме через них скрипт і спілкується з page-мостом,
   тож window контент-скрипта тут повністю достатній. */
var unsafeWindow = window;

/* GM_setValue/GM_getValue → localStorage домену salesdrive.me (синхронно, як
   у Tampermonkey). Префікс, щоб не зіткнутися з ключами самої CRM.
   JSON-обгортка зберігає типи (число/обʼєкт/рядок) так само, як GM-сховище. */
function GM_setValue(key, value){
  try{ localStorage.setItem('lkgm_' + key, JSON.stringify(value)); }catch(e){}
}
function GM_getValue(key, def){
  try{
    var v = localStorage.getItem('lkgm_' + key);
    return v == null ? def : JSON.parse(v);
  }catch(e){ return def; }
}

/* GM_setClipboard → Clipboard API (викликається з кліків, тож дозволено) */
function GM_setClipboard(text){
  try{ navigator.clipboard.writeText(String(text)); }catch(e){}
}

/* GM_xmlhttpRequest → повідомлення у background service worker, який робить
   крос-доменний fetch (docs.google.com, railway.app — див. host_permissions). */
function GM_xmlhttpRequest(opts){
  opts = opts || {};
  try{
    chrome.runtime.sendMessage(
      { type: 'lk-xhr', url: opts.url, method: opts.method || 'GET',
        headers: opts.headers || null, data: opts.data || null },
      function(resp){
        if(chrome.runtime.lastError || !resp){
          if(opts.onerror) opts.onerror(new Error('net'));
          return;
        }
        if(resp.ok){
          if(opts.onload) opts.onload({ status: resp.status, responseText: resp.text });
        } else {
          if(opts.onerror) opts.onerror(new Error(resp.error || 'net'));
        }
      }
    );
  }catch(e){ if(opts.onerror) opts.onerror(e); }
}
/* ▲▲▲ МОДУЛЬ-END • gm-shim ▲▲▲ */
