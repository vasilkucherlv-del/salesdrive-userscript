window.unsafeWindow = window;
window.GM_getValue = function(k,d){ try{var v=localStorage.getItem('lkgm_'+k); return v==null?d:JSON.parse(v);}catch(e){return d;} };
window.GM_setValue = function(k,v){ try{localStorage.setItem('lkgm_'+k, JSON.stringify(v));}catch(e){} };
window.GM_setClipboard = function(){};
window.GM_xmlhttpRequest = function(o){ fetch(o.url,{method:o.method||'GET',headers:o.headers||undefined,body:o.data||undefined})
  .then(r=>r.text().then(t=>{ o.onload && o.onload({status:r.status,responseText:t}); }))
  .catch(e=>{ o.onerror && o.onerror(e); }); };
