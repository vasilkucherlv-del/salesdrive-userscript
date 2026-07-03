/* ▼▼▼ МОДУЛЬ-START • background — крос-доменні запити для збірки-розширення ▼▼▼
   Service worker (MV3). Приймає {type:'lk-xhr'} від gm-shim.js і виконує fetch
   до дозволених доменів (host_permissions у manifest.json).                   */
'use strict';

chrome.runtime.onMessage.addListener(function(msg, sender, sendResponse){
  if(!msg || msg.type !== 'lk-xhr') return;
  var init = { method: msg.method || 'GET' };
  if(msg.headers) init.headers = msg.headers;
  if(msg.data != null) init.body = msg.data;
  fetch(msg.url, init)
    .then(function(r){ return r.text().then(function(t){ sendResponse({ ok: true, status: r.status, text: t }); }); })
    .catch(function(e){ sendResponse({ ok: false, error: String(e) }); });
  return true; // асинхронна відповідь
});
/* ▲▲▲ МОДУЛЬ-END • background ▲▲▲ */
