// ==UserScript==
// @name         SalesDrive — Допродажі + База знань (ТЕСТ)
// @namespace    lartek-komplektom
// @version      2.78
// @description  Підказки допродажу в заявці SalesDrive (додавання супутнього товару одним кліком) + База знань з відповідями клієнтам. Дані з Google-таблиць. Автооновлення.
// @author       Vasyl
// @match        https://*.salesdrive.me/*
// @run-at       document-idle
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @connect      docs.google.com
// @connect      railway.app
// @grant        GM_setClipboard
// @updateURL    https://raw.githubusercontent.com/vasilkucherlv-del/salesdrive-userscript/main/salesdrive.dev.user.js
// @downloadURL  https://raw.githubusercontent.com/vasilkucherlv-del/salesdrive-userscript/main/salesdrive.dev.user.js
// ==/UserScript==

/* ╔══════════════════════ КАРТА МОДУЛІВ (TOC) ══════════════════════╗
   Кожен модуль обгорнуто рамкою «МОДУЛЬ-START … МОДУЛЬ-END • <id>».
   Правити код модуля ТІЛЬКИ в межах його рамок, щоб не зачепити інші.
   Список (зверху вниз):
     • lkDomTick       — спільний «пульс» DOM (подія 'lkdom') для всіх модулів
     • core            — ядро: шина, дані з таблиць, стилі, content.js, База знань
     • lkNaboryInline  — позначка «входить у набори» в рядках заявки
     • lkAnalogInline  — інлайн-значок «🔁 аналог» у рядку товару
     • lkModalKits     — рядок «Входить у набори» в картці товару (модалка)
     • lkComplectPrice — роздрібна ціна біля товару в таблиці «Товари в комплекті»
     • lkUpsellRedesign— компактний вигляд картки допродажу
     • lkStockPayWarn  — попередження: передоплата + малий залишок
     • lkBundleFix     — 🧹 «Разом дешевше»: прибрати NEW PRODUCT, ціни товарів → сума акції
     • lkChatFailWarn  — ⛔ чат: повідомлення НЕ доставлено (нема Viber/Telegram на номері)
     • lkPayRequired   — ⛔ заборона зберігати заявку без «Способу оплати»
     • lkArrivalCount  — 📦 к-ть позицій та одиниць біля заголовка «Надходження товарів»
     • lkArrivalOpt    — 💰 опт-ціни товарів (×1.2/×1.25/×1.3↑5) із собівартості накладної
     • lkRoundPickup   — 🔟 заокруглення суми самовивозу вгору до 10 ₴ (99→100, 108→110)
     • lkStockWhere    — 🔎 «Де товар»: у яких заявках висить код (з урахуванням комплектів)
     • lkRozCommission — ⚖ комісія Rozetka для товарів, дописаних менеджером
     • lkCatalogKits   — позначка «входить у набори» в каталозі Товари/Послуги + на сторінці товару
     • lkTtnPrintGuard — 🖨 попередження про повторний друк ТТН Укрпошти
     • lkCashRegister  — 💰 Каса самовивозу
     • lkPickList      — 📋 зведений лист комплектації (сума товарів по заявках статусу)
     • lkUkrPromList   — 📮 лист «Пром-оплата + Укрпошта» (відправник/отримувач/індекс/ТТН, друк)
     • lkSideMenu      — пункти скрипта (💰Каса/📋Склад/📮Укрпошта) у лівому штатному меню
     • lkQuickPickup   — ➕ нова заявка самовивозу + 📋 список усіх самовивозів
     • lkAutoOrgByPayment — організація: самовивіз→Кучер Василь, інакше→ФОП з платежу
     • lkCheckCashbox   — підстановка «каса самовивозу» у формі чека (оплата готівка/термінал)
     • lkCheckButton    — 🧾 кнопки «Чек · <касир>»: форма чека + оплата + каса + касир, тоді авто-«Зберегти»
     • lkCopyNoGoods    — кнопка «🗐 без товарів» (копія заявки без товарних рядків)
     • lkSenderBySource — відправник СМС за джерелом замовлення (FIXLAND/Refort/lartek/Сайт/mobile_catalog_app/Bigl)
   ╚══════════════════════════════════════════════════════════════════╝ */

/* ▼▼▼ МОДУЛЬ-START • core — ЯДРО — шина подій, дані з Google-таблиць, стилі; містить content.js (підказки/ціни/рейтинг/ТТН) і Базу знань ▼▼▼ */
/* ▼▼▼ МОДУЛЬ-START • lkDomTick — спільний «пульс» DOM для всіх модулів ▼▼▼ */
/* Один MutationObserver на сторінку замість окремого в кожному модулі.
   Розсилає подію 'lkdom' (дебаунс 250мс) + страховий пульс кожні 2с. */
try{ // SD-ізоляція: помилка цього модуля не зупинить решту
(function lkDomTick(){
  'use strict';
  var t=null;
  function fire(){ try{ window.dispatchEvent(new Event('lkdom')); }catch(e){} }
  function soon(){ clearTimeout(t); t=setTimeout(fire,250); }
  function arm(){
    try{ new MutationObserver(soon).observe(document.body,{childList:true,subtree:true}); }
    catch(e){ setTimeout(arm,500); return; }
    fire();
  }
  if(document.body) arm(); else document.addEventListener('DOMContentLoaded', arm);
  setInterval(fire, 2000); // страховий пульс: зміни без DOM-мутацій теж підхопляться
})();
}catch(e){ try{ console.warn("[SD] модуль «lkDomTick» не запустився:", e); }catch(_){} }
/* ▲▲▲ МОДУЛЬ-END • lkDomTick ▲▲▲ */

/* ▼▼▼ МОДУЛЬ-START • lkApiBudget — спільний облік і захист ліміту API SalesDrive ▼▼▼ */
/* СРМ дає лише 100 запитів НА ГОДИНУ до /api/order/list/ — і цей ліміт СПІЛЬНИЙ
   на весь акаунт (усі менеджери, усі вкладки). Перевищення → HTTP 400
   {"status":"error","message":"API limit reached ... API period: 1 hour. API limit: 100."}
   Тут один шлюз для всіх модулів:
     • лічильник витрат за годину (спільний через localStorage — видно з усіх вкладок);
     • «стоп-кран»: після відмови ніхто не стукає ще 10 хв (раніше кожен модуль
       повторював запит щохвилини й тримав ліміт вичерпаним постійно);
     • резерв: останні 15 запитів години лишаємо для ручних дій (кнопки),
       фонові оновлення туди не лізуть.
   Використання: window.sdApi.fetch(url, {headers:…, bg:true}) → Promise(Response),
   відмова = Error з .limit=true і .waitMs. */
try{ // SD-ізоляція: помилка цього модуля не зупинить решту
(function lkApiBudget(){
  'use strict';
  var LIMIT=100, RESERVE=15, BLOCK_MS=10*60*1000;
  var KS='lk_api_stat_v1', KB='lk_api_block_v1';

  function hourKey(){ return Math.floor(Date.now()/3600000); }
  function stat(){
    var s=null; try{ s=JSON.parse(localStorage.getItem(KS)); }catch(e){}
    if(!s || s.h!==hourKey()) s={h:hourKey(), n:0};
    return s;
  }
  function bump(){ var s=stat(); s.n++; try{ localStorage.setItem(KS, JSON.stringify(s)); }catch(e){} return s.n; }
  function blockedUntil(){ var v=0; try{ v=Number(localStorage.getItem(KB))||0; }catch(e){} return v; }
  function block(ms){ try{ localStorage.setItem(KB, String(Date.now()+ms)); }catch(e){} }

  function err(msg, waitMs){ var e=new Error(msg); e.limit=true; e.waitMs=waitMs||0; return e; }

  var api={
    LIMIT: LIMIT,
    // ── ВНУТРІШНІЙ список заявок СРМ (той самий запит, що робить сама СРМ на
    //    сторінці списку) — cookie-авторизація, БЕЗ API-ключа і БЕЗ годинного ліміту.
    //    Дає statusId, payment_method, paymentDate, paymentAmount/restPay,
    //    document_ord_check, contacts, ord_delivery_data (з isPrinted) —
    //    усе, крім sku товарів (там лише productId).
    orders: function(qs, page){
      var u='/orders/?formId=1&mobileMode=0&mode=orderList&page='+(page||1)+(qs?('&'+qs):'');
      return fetch(u,{credentials:'include',headers:{'Accept':'application/json, text/plain, */*'}})
        .then(function(r){ if(!r.ok) throw new Error('HTTP '+r.status); return r.json(); })
        .then(function(j){
          var b=(j&&(j.response||j))||{};
          return { rows: b.data||b.orders||[], pageCount: ((b.pagination||{}).pageCount)||1, meta: b.meta||{} };
        });
    },
    used: function(){ return stat().n; },
    left: function(){ return Math.max(0, LIMIT-stat().n); },
    // скільки ще чекати (мс), 0 — можна
    waitMs: function(){ return Math.max(0, blockedUntil()-Date.now()); },
    // людський текст для плашок
    note: function(){
      var w=api.waitMs();
      if(w>0) return 'Ліміт API SalesDrive вичерпано (100 запитів на годину на весь акаунт). '
                    +'Спробуйте через '+Math.ceil(w/60000)+' хв.';
      return 'Витрачено '+api.used()+' зі 100 запитів API за цю годину.';
    },
    fetch: function(url, opts){
      opts=opts||{};
      var w=api.waitMs();
      if(w>0) return Promise.reject(err('api-limit', w));
      if(opts.bg && api.left()<=RESERVE) return Promise.reject(err('api-reserve', 60000));
      if(api.left()<=0){ block(BLOCK_MS); return Promise.reject(err('api-limit', BLOCK_MS)); }
      bump();
      return fetch(url, opts).then(function(r){
        if(r.status!==400) return r;
        // 400 буває і не через ліміт — дивимось текст помилки, щоб не блокувати дарма
        return r.clone().text().then(function(t){ return t; }, function(){ return ''; })
          .then(function(t){
            if(/limit/i.test(t||'')){ block(BLOCK_MS); throw err('api-limit', BLOCK_MS); }
            return r;
          });
      });
    }
  };
  try{ window.sdApi=api; }catch(e){}
})();
}catch(e){ try{ console.warn("[SD] модуль «lkApiBudget» не запустився:", e); }catch(_){} }
/* ▲▲▲ МОДУЛЬ-END • lkApiBudget ▲▲▲ */

/* ▼▼▼ МОДУЛЬ-START • lkProdLink — посилання «код товару → його картка» ▼▼▼ */
/* Раніше код у списку наборів вів у ПОШУК по каталогу — доводилось клікати ще раз.
   Тут перекладаємо код у productId внутрішнім довідником СРМ (без API-ключа,
   без годинного ліміту) і підміняємо посилання на картку товару.
   Кеш у localStorage на добу. Один код може мати кілька товарів (напр. 069 —
   і звичайний товар, і комплект): для наборів беремо саме комплект.
   Використання: <a data-sd-sku="017" data-sd-kit="1" href="...">017</a>
   — href підміниться сам, щойно ID стане відомий. */
try{ // SD-ізоляція: помилка цього модуля не зупинить решту
(function lkProdLink(){
  'use strict';
  var KEY='lk_prodid_v1', TTL=24*60*60*1000, MISS_TTL=10*60*1000;
  var mem=null, busy={};
  function load(){ if(mem) return mem; try{ mem=JSON.parse(localStorage.getItem(KEY))||{}; }catch(e){ mem={}; } return mem; }
  function save(){ try{ localStorage.setItem(KEY, JSON.stringify(mem||{})); }catch(e){} }
  function card(id){ return '/ua/index.html?formId=1#/product/update/'+id; }
  function search(sku){ return '/ua/index.html?formId=1#/product/index?filter%5Bsku%5D='+encodeURIComponent(sku); }
  function pick(rec, preferKit){
    if(!rec) return 0;
    return (preferKit && rec.kit) ? rec.kit : (rec.id || rec.kit || 0);
  }
  function fresh(rec){
    if(!rec) return false;
    var age=Date.now()-(rec.t||0);
    return (rec.id||rec.kit) ? age<TTL : age<MISS_TTL;   // невдачу теж памʼятаємо, щоб не довбати
  }
  function resolve(sku){
    sku=String(sku||'').trim(); if(!sku || busy[sku]) return;
    var c=load(); if(fresh(c[sku])) return;
    busy[sku]=1;
    fetch('/products/data/?active=1&filter[sku]='+encodeURIComponent(sku)+'&formId=1',
          {credentials:'include',headers:{'accept':'application/json, text/plain, */*','when':'product/index'}})
      .then(function(r){ return r.ok?r.json():null; })
      .then(function(j){
        var arr=(((((j||{}).response||{}).meta||{}).option||{}).option)||[];
        var kit=0, plain=0;
        arr.forEach(function(x){
          if(String(x.sku).trim()!==sku) return;
          if(Number(x.isComplect)===1){ if(!kit) kit=Number(x.id)||0; }
          else if(!plain) plain=Number(x.id)||0;
        });
        var cc=load(); cc[sku]={ t:Date.now(), id:plain, kit:kit }; save();
        paint();
      })
      .catch(function(){ var cc=load(); cc[sku]={ t:Date.now(), id:0, kit:0 }; save(); })
      .then(function(){ busy[sku]=0; });
  }
  function url(sku, preferKit){
    sku=String(sku||'').trim();
    var rec=load()[sku], id=pick(rec, preferKit);
    if(!fresh(rec)) resolve(sku);
    return id ? card(id) : search(sku);
  }
  // код із «старого» посилання-пошуку: …#/product/index?filter%5Bsku%5D=017
  function skuFromHref(href){
    var m=String(href||'').match(/filter(?:%5B|\[)sku(?:%5D|\])=([^&]+)/i);
    try{ return m?decodeURIComponent(m[1]):''; }catch(e){ return m?m[1]:''; }
  }
  // наші плашки наборів (у т.ч. намальовані ІНШОЮ копією скрипта — стабільною)
  var KIT_BOXES='.lkck-exp,.lknb-exp,.lkmk-exp';
  function kitLinks(){
    var out=[];
    [].forEach.call(document.querySelectorAll('a[data-sd-sku]'), function(a){ out.push(a); });
    [].forEach.call(document.querySelectorAll(KIT_BOXES), function(box){
      [].forEach.call(box.querySelectorAll('a[href]'), function(a){
        if(!a.hasAttribute('data-sd-sku') && skuFromHref(a.getAttribute('href'))) out.push(a);
      });
    });
    return out;
  }
  function skuOfLink(a){
    return a.getAttribute('data-sd-sku') || skuFromHref(a.getAttribute('href')) || '';
  }
  // підміняємо href у вже намальованих посиланнях (пишемо лише коли реально інше)
  function paint(){
    try{
      kitLinks().forEach(function(a){
        var sku=skuOfLink(a); if(!sku) return;
        var u=url(sku, a.getAttribute('data-sd-kit')!=='0');
        if(a.getAttribute('href')!==u) a.setAttribute('href', u);
      });
    }catch(e){}
  }
  // Страхувальник: навіть якщо href не встиг оновитись (або плашку намалювала
  // інша копія скрипта) — клік по коду веде на картку набору.
  document.addEventListener('click', function(e){
    try{
      var a=e.target && e.target.closest ? e.target.closest('a[href]') : null;
      if(!a) return;
      if(!a.hasAttribute('data-sd-sku') && !(a.closest(KIT_BOXES))) return;
      var sku=skuOfLink(a); if(!sku) return;
      var rec=load()[sku], id=pick(rec, a.getAttribute('data-sd-kit')!=='0');
      if(id){                       // ID відомий — ведемо на картку
        var u=card(id);
        if(a.getAttribute('href')!==u) a.setAttribute('href', u);
        return;                     // далі клік іде як звичайний перехід
      }
      resolve(sku);                 // ще не знаємо — цього разу відкриється пошук
    }catch(err){}
  }, true);
  try{ window.sdProdLink={ url:url, paint:paint, resolve:resolve }; }catch(e){}
  window.addEventListener('lkdom', paint);
  setTimeout(paint, 1500); setTimeout(paint, 4000);   // якщо пульсу ще не було
})();
}catch(e){ try{ console.warn("[SD] модуль «lkProdLink» не запустився:", e); }catch(_){} }
/* ▲▲▲ МОДУЛЬ-END • lkProdLink ▲▲▲ */

try{ // SD-ізоляція: помилка цього модуля не зупинить решту
(function () {
  "use strict";

  // Спільна шина подій між цим (пісочниця Tampermonkey) і вкрапленим page-кодом
  // (контекст сторінки). Обидва боки мусять користуватись ОДНИМ window сторінки.
  var BUS = (typeof unsafeWindow !== "undefined" && unsafeWindow) ? unsafeWindow : window;

  // ---- GM-сховище ----
  function gmGet(key, def) { try { var v = GM_getValue(key, def); return v; } catch (e) { return def; } }
  function gmSet(key, val) { try { GM_setValue(key, val); } catch (e) {} }
  function gmGetJSON(key) {
    try { var s = GM_getValue(key, null); if (s == null) return null; return (typeof s === "string") ? JSON.parse(s) : s; }
    catch (e) { return null; }
  }
  function gmSetJSON(key, val) { try { GM_setValue(key, JSON.stringify(val)); } catch (e) {} }

  // ---- завантаження таблиць через GM_xmlhttpRequest (без CORS) ----
  var SHEET_ID = "1sx212HcKUols-fHREq6ktjmqaJdory-M7SO40w9F5zc"; // допродажі
  var GID = "0";
  var KB_SHEET_ID = "1ji2p3Nk0qcOy58vMu1312kO1LBrDqa7Ha5c8QvQvW7c"; // база знань
  var KB_GID = "0";
  // Аналоги (якір + аналоги-заміни). ОКРЕМА таблиця — встав сюди її ID.
  // Колонки такі ж, як у допродажів: 0=код якоря, 1=назва якоря, 2=код аналога, 3=назва аналога, 4=примітка.
  // Поки ID порожній — функція аналогів просто не показується (без помилок).
  // Аналоги більше НЕ з Google-таблиці, а прямо з models-api (єдине джерело —
  // /admin на сайті). Причина: IMPORTDATA/Таблиці зʼїдають провідні нулі —
  // 01082 стає 1082, 0485 стає 485, і код перестає збігатися з СРМ.
  // Сервер віддає коди текстом, тому нулі зберігаються.
  var ANALOG_API_URL = "https://models-api-production-4d71.up.railway.app/api/analogs.csv?sep=,";
  var TTL_MS = 60 * 1000;

  function gvizUrl(id, gid) {
    return "https://docs.google.com/spreadsheets/d/" + id + "/gviz/tq?tqx=out:json&headers=1&gid=" + gid;
  }

  function gmFetch(url) {
    return new Promise(function (resolve, reject) {
      try {
        GM_xmlhttpRequest({
          method: "GET",
          url: url,
          onload: function (r) {
            if (r.status >= 200 && r.status < 300) resolve(r.responseText);
            else reject(new Error("HTTP " + r.status));
          },
          onerror: function () { reject(new Error("network")); },
          ontimeout: function () { reject(new Error("timeout")); }
        });
      } catch (e) { reject(e); }
    });
  }

  // Беремо відображене значення (f) — там коди з нулями; інакше сире (v).
  function cellText(c) {
    if (!c) return "";
    if (c.f != null && String(c.f) !== "") return String(c.f).trim();
    if (c.v != null) return String(c.v).trim();
    return "";
  }

  function parseGviz(text) {
    var s = text.indexOf("{");
    var e = text.lastIndexOf("}");
    if (s < 0 || e < 0) throw new Error("несподіваний формат відповіді");
    var json = JSON.parse(text.slice(s, e + 1));
    var rows = (json.table && json.table.rows) || [];
    var out = [];
    for (var i = 0; i < rows.length; i++) {
      var c = rows[i].c || [];
      // колонки: 0=код якоря, 1=назва якоря, 2=код супутнього, 3=назва супутнього, 4=скрипт
      var anchorName = cellText(c[1]);
      var compCode = cellText(c[2]);
      var compName = cellText(c[3]);
      var script = cellText(c[4]);
      if (!anchorName || !compCode) continue;
      out.push({ a: anchorName, sku: compCode, c: compName, s: script });
    }
    return out;
  }

  // Аналоги: та сама структура, що й допродажі (анкер + заміна).
  // Розбір CSV з /api/analogs.csv: колонки ті самі, що були в таблиці —
  // 0=код якоря, 1=назва якоря, 2=код аналога, 3=назва аналога, 4=примітка.
  // Свій розбірник, бо в назвах трапляються коми ("Karcher Puzzi 100,200").
  function csvRows(text) {
    var t = String(text || "").replace(/^\ufeff/, "");
    var rows = [], row = [], cell = "", q = false;
    for (var i = 0; i < t.length; i++) {
      var c = t.charAt(i);
      if (q) {
        if (c === '"') { if (t.charAt(i + 1) === '"') { cell += '"'; i++; } else q = false; }
        else cell += c;
      } else if (c === '"') q = true;
      else if (c === ",") { row.push(cell); cell = ""; }
      else if (c === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; }
      else if (c !== "\r") cell += c;
    }
    if (cell.length || row.length) { row.push(cell); rows.push(row); }
    return rows;
  }
  function parseAnalogCsv(text) {
    var rows = csvRows(text), out = [];
    for (var i = 1; i < rows.length; i++) {           // рядок 0 — заголовки
      var r = rows[i] || [];
      var anchorCode = String(r[0] || "").trim();
      var anchorName = String(r[1] || "").trim();
      var compCode = String(r[2] || "").trim();
      var compName = String(r[3] || "").trim();
      var script = String(r[4] || "").trim();
      if (!anchorName || !compCode) continue;
      out.push({ ak: anchorCode, a: anchorName, sku: compCode, c: compName, s: script });
    }
    return out;
  }
  function parseAnalog(text) {
    var s = text.indexOf("{");
    var e = text.lastIndexOf("}");
    if (s < 0 || e < 0) throw new Error("несподіваний формат відповіді");
    var json = JSON.parse(text.slice(s, e + 1));
    var rows = (json.table && json.table.rows) || [];
    var out = [];
    for (var i = 0; i < rows.length; i++) {
      var c = rows[i].c || [];
      // колонки: 0=код якоря, 1=назва якоря, 2=код аналога, 3=назва аналога, 4=примітка
      var anchorCode = cellText(c[0]);
      var anchorName = cellText(c[1]);
      var compCode = cellText(c[2]);
      var compName = cellText(c[3]);
      var script = cellText(c[4]);
      if (!anchorName || !compCode) continue;
      out.push({ ak: anchorCode, a: anchorName, sku: compCode, c: compName, s: script });
    }
    return out;
  }

  function parseKb(text) {
    var s = text.indexOf("{");
    var e = text.lastIndexOf("}");
    if (s < 0 || e < 0) throw new Error("несподіваний формат відповіді");
    var json = JSON.parse(text.slice(s, e + 1));
    var rows = (json.table && json.table.rows) || [];
    var out = [];
    for (var i = 0; i < rows.length; i++) {
      var c = rows[i].c || [];
      // колонки: 0=категорія, 1=заголовок, 2=текст, 3=ключові слова
      var cat = cellText(c[0]);
      var title = cellText(c[1]);
      var txt = cellText(c[2]);
      var kw = cellText(c[3]);
      if (!title) continue;
      if (cat.toLowerCase() === "категорія" && title.toLowerCase() === "заголовок") continue;
      out.push({ cat: cat, title: title, text: txt, kw: kw });
    }
    return out;
  }

  // ---- stale-while-revalidate для Google-таблиць ----
  // Якщо кеш існує — віддаємо його МИТТЄВО (навіть застарілий), а коли він
  // старший за TTL — тихо оновлюємо у фоні. Тож відкриття заявки ніколи не
  // чекає на docs.google.com; свіжі дані підтягнуться до наступного разу.
  var _swrBusy = {};
  function swrGet(cacheKey, listField, fetchFresh, force) {
    var now = Date.now();
    var cached = gmGetJSON(cacheKey);
    var has = cached && cached[listField] && cached[listField].length;
    if (!force && has) {
      if (now - cached.ts >= TTL_MS && !_swrBusy[cacheKey]) {
        _swrBusy[cacheKey] = 1;
        fetchFresh().then(function () { _swrBusy[cacheKey] = 0; },
                          function () { _swrBusy[cacheKey] = 0; });
      }
      var out = { source: (now - cached.ts < TTL_MS) ? "cache" : "cache-stale" };
      out[listField] = cached[listField];
      return Promise.resolve(out);
    }
    return fetchFresh().catch(function (err) {
      if (has) { var o = { source: "cache-after-error", error: String(err) }; o[listField] = cached[listField]; return o; }
      var e = { source: "error", error: String(err) }; e[listField] = []; return e;
    });
  }

  function fetchMapFresh() {
    return gmFetch(gvizUrl(SHEET_ID, GID)).then(function (txt) {
      var pairs = parseGviz(txt);
      if (!pairs.length) throw new Error("у таблиці 0 придатних рядків");
      gmSetJSON("sd_upsell_cache_v1", { ts: Date.now(), pairs: pairs });
      return { pairs: pairs, source: "sheet" };
    });
  }
  function getMap(force) { return swrGet("sd_upsell_cache_v1", "pairs", fetchMapFresh, force); }

  function fetchAnalogFresh() {
    return gmFetch(ANALOG_API_URL).then(function (txt) {
      var pairs = parseAnalogCsv(txt);
      if (!pairs.length) throw new Error("у таблиці 0 придатних рядків");
      gmSetJSON("sd_analog_cache_v1", { ts: Date.now(), pairs: pairs });
      return { pairs: pairs, source: "sheet" };
    });
  }
  function getAnalog(force) {
    // не налаштовано — мовчки повертаємо порожньо (банер аналогів не зʼявиться)
    if (!ANALOG_API_URL) return Promise.resolve({ pairs: [], source: "disabled" });
    return swrGet("sd_analog_cache_v1", "pairs", fetchAnalogFresh, force);
  }

  function fetchKbFresh() {
    return gmFetch(gvizUrl(KB_SHEET_ID, KB_GID)).then(function (txt) {
      var rows = parseKb(txt);
      if (!rows.length) throw new Error("у таблиці 0 придатних рядків");
      gmSetJSON("sd_kb_cache_v1", { ts: Date.now(), rows: rows });
      return { rows: rows, source: "sheet" };
    });
  }
  function getKb(force) { return swrGet("sd_kb_cache_v1", "rows", fetchKbFresh, force); }

  // ---- шим chrome.* — щоб перенесений код content.js/kb.js працював без змін ----
  var chrome = {
    runtime: {
      lastError: null,
      sendMessage: function (msg, cb) {
        if (!msg) return;
        if (msg.type === "sdGetUpsellMap") { getMap(!!msg.force).then(function (r) { if (cb) cb(r); }); return; }
        if (msg.type === "sdGetAnalogs") { getAnalog(!!msg.force).then(function (r) { if (cb) cb(r); }); return; }
        if (msg.type === "sdGetKb") { getKb(!!msg.force).then(function (r) { if (cb) cb(r); }); return; }
      }
    },
    storage: {
      local: {
        get: function (keys, cb) {
          var out = {};
          try {
            var arr = (typeof keys === "string") ? [keys] : (Array.isArray(keys) ? keys : Object.keys(keys || {}));
            arr.forEach(function (k) { var v = gmGet("ls_" + k, undefined); if (v !== undefined) out[k] = v; });
          } catch (e) {}
          if (cb) cb(out);
        },
        set: function (obj, cb) {
          try { Object.keys(obj || {}).forEach(function (k) { gmSet("ls_" + k, obj[k]); }); } catch (e) {}
          if (cb) cb();
        }
      }
    }
  };

  // ====== далі — перенесені без змін модулі (карта-запас, content.js, kb.js)
  // ====== і page-міст, що вкраплюється в контекст сторінки ======


  // ====== СТИЛІ (hint.css + kb.css) — у userscript треба вкладати вручну ======
  (function () {
    try {
      var __sdStyle = document.createElement("style");
      __sdStyle.textContent = "/* hint.css */\n#sd-upsell-hint{\n  position:relative; box-sizing:border-box;\n  width:100%; min-width:min(560px, 100%); max-width:980px;\n  margin:10px 0 14px 0; padding:14px 44px 16px 18px;\n  background:#FFF8E1; border:2px solid #F0A800; border-left:7px solid #F0A800;\n  border-radius:10px; font-family:Arial, sans-serif; color:#4a3700;\n  box-shadow:0 3px 12px rgba(0,0,0,.15); z-index:9999;\n  animation:sdpop .18s ease-out;\n}\n@keyframes sdpop{from{transform:scale(.99);opacity:.3}to{transform:scale(1);opacity:1}}\n\n#sd-upsell-hint .sd-top{font-size:13px; opacity:.75; font-weight:600; margin-bottom:6px}\n\n/* блок одного супутнього: скрипт + кнопка */\n#sd-upsell-hint .sd-item{\n  display:flex; flex-wrap:wrap; align-items:flex-start; gap:12px 14px;\n  padding:12px 0 2px 0; margin-top:12px;\n  border-top:1px dashed rgba(240,168,0,.55);\n}\n#sd-upsell-hint .sd-item:first-of-type{border-top:none; margin-top:0; padding-top:0}\n\n/* середня колонка: назва + причина + наявність */\n#sd-upsell-hint .sd-main{\n  flex:1 1 300px; min-width:0;\n  display:flex; flex-direction:column; align-items:flex-start; gap:6px;\n}\n#sd-upsell-hint .sd-name{\n  font-size:15px; font-weight:700; line-height:1.3; color:#3a2c00;\n  overflow-wrap:anywhere;\n}\n#sd-upsell-hint .sd-script{\n  font-size:14px; font-weight:400; line-height:1.5; color:#5a4a14;\n  overflow-wrap:anywhere;\n}\n\n/* права колонка: ціна + кнопка */\n#sd-upsell-hint .sd-action{\n  flex:0 0 auto; width:150px; max-width:100%;\n  display:flex; flex-direction:column; align-items:stretch; gap:8px;\n}\n#sd-upsell-hint .sd-add{\n  width:100%; box-sizing:border-box;\n  white-space:normal; word-break:break-word; text-align:center;\n  padding:11px 14px; background:#2E7D32; color:#fff;\n  border:none; border-radius:7px;\n  font-size:15px; font-weight:bold; cursor:pointer; font-family:Arial, sans-serif;\n}\n#sd-upsell-hint .sd-add:hover{background:#256628}\n#sd-upsell-hint .sd-add:active{transform:translateY(1px)}\n#sd-upsell-hint .sd-add.sd-done{background:#9e9e9e; cursor:default}\n#sd-upsell-hint .sd-add.sd-done:hover{background:#9e9e9e}\n#sd-upsell-hint .sd-sku{background:rgba(255,255,255,.25); padding:2px 8px; border-radius:4px; font-size:13px; margin-left:6px}\n\n#sd-upsell-hint .sd-x{position:absolute; top:8px; right:12px; cursor:pointer; font-size:22px; line-height:1; color:#a07800; border:none; background:none}\n#sd-upsell-hint .sd-x:hover{color:#4a3700}\n\n/* бейдж залишку супутнього */\n#sd-upsell-hint .sd-stock{flex:0 0 auto; max-width:100%; font-size:13px; font-weight:700; padding:5px 10px; border-radius:6px; white-space:normal; overflow-wrap:anywhere}\n#sd-upsell-hint .sd-stock-wait{background:#eee; color:#777; font-weight:normal}\n#sd-upsell-hint .sd-stock-yes{background:#E6F4EA; color:#1B5E20; border:1px solid #A5D6A7}\n#sd-upsell-hint .sd-stock-no{background:#FDECEA; color:#B71C1C; border:1px solid #F5B7B1}\n#sd-upsell-hint .sd-stock-unk{background:#f0f0f0; color:#777; font-weight:normal}\n\n/* мініатюри товарів у пошуку SalesDrive */\nli.sd-has-img{display:flex !important; align-items:center; gap:8px}\nli.sd-has-img > a{flex:1 1 auto; min-width:0}\nimg.sd-opt-img{width:34px; height:34px; flex:0 0 34px; object-fit:contain; border:1px solid #eee; border-radius:4px; background:#fff}\n\n/* фото супутнього у підказці допродажу */\n#sd-upsell-hint .sd-comp-img{flex:0 0 auto; width:48px; height:48px; object-fit:contain; border:1px solid #e0d4a8; border-radius:6px; background:#fff}\n\n/* кнопка діагностики фото (зʼявляється лише якщо фото не знайдено) */\n\n/* ---- Передупередження про ціну ROZETKA ---- */\n#sd-price-warn {\n  position: relative;\n  margin: 10px 0;\n  padding: 10px 34px 10px 12px;\n  border: 1px solid #e0b4b4;\n  border-left: 4px solid #d9534f;\n  background: #fdf3f3;\n  border-radius: 6px;\n  font: 13px/1.45 -apple-system, \"Segoe UI\", Roboto, Arial, sans-serif;\n  color: #7a1f1f;\n  max-width: 980px;\n  box-sizing: border-box;\n}\n#sd-price-warn .sd-x {\n  position: absolute; top: 6px; right: 8px;\n  border: none; background: transparent; cursor: pointer;\n  font-size: 18px; line-height: 1; color: #a05; opacity: .6;\n}\n#sd-price-warn .sd-x:hover { opacity: 1; }\n#sd-price-warn .sd-pw-top { font-weight: 600; margin-bottom: 6px; color: #c0392b; }\n#sd-price-warn .sd-pw-row {\n  display: flex; flex-wrap: wrap; gap: 4px 12px;\n  padding: 4px 0; border-top: 1px dashed #ecc9c9;\n}\n#sd-price-warn .sd-pw-name { flex: 1 1 280px; min-width: 0; }\n#sd-price-warn .sd-pw-info { white-space: nowrap; font-weight: 600; }\n#sd-price-warn .sd-pw-below .sd-pw-info { color: #c0392b; }\n\n/* ---- Передупередження про низький рейтинг клієнта ---- */\n#sd-rating-warn {\n  position: relative;\n  margin: 12px 0 14px;\n  padding: 14px 40px 15px 17px;\n  border: 1px solid #dfa72a;\n  border-left: 7px solid #e59400;\n  background: #fff6df;\n  border-radius: 9px;\n  box-shadow: 0 2px 10px rgba(170,115,0,.14);\n  font: 13.5px/1.55 -apple-system, \"Segoe UI\", Roboto, Arial, sans-serif;\n  color: #5a4400;\n  max-width: 980px;\n  box-sizing: border-box;\n}\n#sd-rating-warn .sd-x {\n  position: absolute; top: 6px; right: 8px;\n  border: none; background: transparent; cursor: pointer;\n  font-size: 18px; line-height: 1; color: #8a6d00; opacity: .6;\n}\n#sd-rating-warn .sd-x:hover { opacity: 1; }\n#sd-rating-warn .sd-rw-top { font-weight: 800; font-size: 15.5px; line-height: 1.35; color: #9a5500; letter-spacing: .2px; }\n\n/* ---- Скрипт у банері ризикового клієнта ---- */\n#sd-rating-warn .sd-rw-script { margin-top: 10px; }\n#sd-rating-warn .sd-rw-block { padding: 8px 0; border-top: 1px solid rgba(200,150,40,.35); }\n#sd-rating-warn .sd-rw-label {\n  display: flex; align-items: center; gap: 8px; flex-wrap: wrap;\n  font-weight: 700; color: #7d4f00; margin-bottom: 3px;\n}\n#sd-rating-warn .sd-rw-copy {\n  border: 1px solid #d9a83a; background: #fffdf6; color: #7d4f00; font-weight: 600;\n  border-radius: 5px; padding: 2px 9px; font-size: 11.5px; cursor: pointer; line-height: 1.55;\n}\n#sd-rating-warn .sd-rw-copy:hover { background: #ffeec2; }\n#sd-rating-warn .sd-rw-text { color: #4d3b00; }\n\n/* ---- Ціна супутнього (блок у правій колонці, за джерелом заявки) ---- */\n#sd-upsell-hint .sd-price{\n  background:#E8F0FE; border:1px solid #BBD3F5; border-radius:8px;\n  text-align:center; padding:6px 8px; box-sizing:border-box;\n}\n#sd-upsell-hint .sd-price-lab{ font-size:11px; color:#4d6285; line-height:1.25; }\n#sd-upsell-hint .sd-price-val{ font-size:21px; font-weight:800; color:#14418f; line-height:1.15; white-space:nowrap; }\n\n/* ---- Сховати наші банери, поки відкрите модальне вікно ---- */\nhtml.sd-modal-open #sd-upsell-hint,\nhtml.sd-modal-open #sd-price-warn,\nhtml.sd-modal-open #sd-rating-warn,\nhtml.sd-modal-open .sd-ttn-box { display: none !important; }\n\n/* ---- Банер «ТТН змінено» (Rozetka/Refort) ---- */\n.sd-ttn-box {\n  position: relative;\n  margin: 10px 0;\n  padding: 10px 34px 10px 12px;\n  border: 1px solid #e67e22;\n  border-left: 4px solid #d35400;\n  background: #fff3e0;\n  border-radius: 6px;\n  font: 13px/1.45 -apple-system, \"Segoe UI\", Roboto, Arial, sans-serif;\n  color: #7a3d00;\n  max-width: 980px;\n  box-sizing: border-box;\n}\n.sd-ttn-box .sd-x {\n  position: absolute; top: 6px; right: 8px;\n  border: none; background: transparent; cursor: pointer;\n  font-size: 18px; line-height: 1; color: #b35900; opacity: .6;\n}\n.sd-ttn-box .sd-x:hover { opacity: 1; }\n.sd-ttn-box .sd-tw-top { font-weight: 700; color: #c0392b; margin-bottom: 4px; }\n.sd-ttn-box .sd-tw-info {\n  font-weight: 600; margin-bottom: 3px;\n  font-family: ui-monospace, \"SFMono-Regular\", Menlo, Consolas, monospace;\n}\n.sd-ttn-box .sd-tw-why { color: #8a5a2b; margin-bottom: 8px; }\n.sd-ttn-box .sd-tw-ack {\n  cursor: pointer; border: 1px solid #d35400; background: #fff;\n  color: #c0392b; font-weight: 600; padding: 5px 12px; border-radius: 5px; font-size: 12px;\n}\n.sd-ttn-box .sd-tw-ack:hover { background: #fde9d6; }\n\n/* kb.css */\n/* База знань — плаваюча кнопка + панель */\n#sd-kb-btn{\n  position:fixed; right:20px; bottom:20px; z-index:2147483600;\n  padding:11px 16px; border:none; border-radius:24px;\n  background:#1565C0; color:#fff; font-family:Arial, sans-serif;\n  font-size:14px; font-weight:700; cursor:pointer;\n  box-shadow:0 3px 12px rgba(0,0,0,.28);\n}\n#sd-kb-btn:hover{background:#0D47A1}\n#sd-kb-btn:active{transform:translateY(1px)}\n\n#sd-kb-panel{\n  position:fixed; right:20px; bottom:74px; z-index:2147483601;\n  width:400px; max-width:calc(100vw - 40px); max-height:72vh;\n  display:flex; flex-direction:column;\n  background:#fff; border:1px solid #d9d9d9; border-radius:12px;\n  box-shadow:0 10px 34px rgba(0,0,0,.30);\n  font-family:Arial, sans-serif; color:#222; overflow:hidden;\n  animation:sdkbpop .16s ease-out;\n}\n@keyframes sdkbpop{from{transform:translateY(8px);opacity:.4}to{transform:translateY(0);opacity:1}}\n\n#sd-kb-panel .sd-kb-head{\n  display:flex; align-items:center; justify-content:space-between;\n  padding:12px 14px; background:#1565C0; color:#fff;\n}\n#sd-kb-panel .sd-kb-title{font-size:15px; font-weight:700}\n#sd-kb-panel .sd-kb-x{\n  border:none; background:none; color:#fff; font-size:24px; line-height:1;\n  cursor:pointer; padding:0 4px;\n}\n#sd-kb-panel .sd-kb-x:hover{opacity:.8}\n\n#sd-kb-search{\n  margin:10px 12px 6px 12px; padding:9px 12px; box-sizing:border-box;\n  border:1px solid #cfcfcf; border-radius:8px; font-size:14px;\n  font-family:Arial, sans-serif; outline:none;\n}\n#sd-kb-search:focus{border-color:#1565C0}\n\n#sd-kb-list{\n  flex:1 1 auto; overflow-y:auto; padding:4px 12px 14px 12px;\n}\n\n#sd-kb-list .sd-kb-cat{\n  font-size:12px; font-weight:700; text-transform:uppercase;\n  letter-spacing:.4px; color:#1565C0; margin:14px 2px 6px 2px;\n}\n#sd-kb-list .sd-kb-cat:first-child{margin-top:6px}\n\n#sd-kb-list .sd-kb-card{\n  border:1px solid #e6e6e6; border-radius:9px; margin-bottom:8px;\n  overflow:hidden; background:#fafafa;\n}\n#sd-kb-list .sd-kb-card-head{\n  display:flex; align-items:center; justify-content:space-between;\n  gap:10px; padding:10px 12px; cursor:pointer;\n}\n#sd-kb-list .sd-kb-card-head:hover{background:#f0f4fb}\n#sd-kb-list .sd-kb-card-title{font-size:14px; font-weight:600; color:#222; line-height:1.35}\n#sd-kb-list .sd-kb-caret{color:#888; font-size:13px; flex:0 0 auto}\n\n#sd-kb-list .sd-kb-card-body{padding:0 12px 12px 12px}\n#sd-kb-list .sd-kb-card-text{\n  font-size:14px; line-height:1.55; color:#333; white-space:pre-wrap;\n  overflow-wrap:anywhere; margin-bottom:10px;\n}\n#sd-kb-list .sd-kb-copy{\n  padding:8px 14px; border:none; border-radius:7px;\n  background:#2E7D32; color:#fff; font-size:13px; font-weight:700;\n  cursor:pointer; font-family:Arial, sans-serif;\n}\n#sd-kb-list .sd-kb-copy:hover{background:#256628}\n#sd-kb-list .sd-kb-copy:active{transform:translateY(1px)}\n#sd-kb-list .sd-kb-copy.sd-kb-copied{background:#9e9e9e}\n\n#sd-kb-list .sd-kb-msg{font-size:14px; color:#666; padding:14px 4px; line-height:1.5}\n#sd-kb-list .sd-kb-err{color:#b00020}\n#sd-kb-list .sd-kb-retry{\n  display:inline-block; margin-left:4px; padding:5px 10px; border:1px solid #b00020;\n  background:#fff; color:#b00020; border-radius:6px; font-size:13px; cursor:pointer;\n  font-family:Arial, sans-serif;\n}\n";
      (document.head || document.documentElement).appendChild(__sdStyle);
    } catch (e) { console.log("[SalesDrive] не вдалося додати стилі:", e); }
  })();


  // ====== карта-запас (вбудована, як у upsell_map.js) ======

var UPSELL_MAP_DATA = []; // вбудований запас прибрано: дані миттєво приходять із кешу таблиці (SWR)


  // ====== content.js (підказки/ціни/рейтинг/ТТН) ======

(function () {
  "use strict";

  var DEBUG = false; // увімкни true, щоб бачити детальні логи в консолі
  function dbg() { if (DEBUG) console.log.apply(console, ["[SD Допродаж]"].concat([].slice.call(arguments))); }

  function norm(s) {
    return (s || "").toString().toLowerCase()
      // Прибираємо апострофи ЗОВСІМ: одне й те саме слово в SalesDrive і в таблиці
      // часто пишуть по-різному («м'ясорубки» / «мясорубки», «п'ять» / «пять»),
      // тож апостроф не має заважати збігу якоря.
      .replace(/[\u02bc\u2019\u2018\u0027\u00b4`]/g, "")
      .replace(/\s+/g, " ").trim();
  }

  // ---- побудова груп: один якір -> кілька супутніх ----
  // вхід: масив пар {a, sku, c, s}; вихід: масив {key, a, items:[{sku,c,s}]}
  function buildGroups(pairs) {
    var byKey = {};
    (pairs || []).forEach(function (p) {
      var a = (p && p.a || "").toString();
      var key = norm(a).slice(0, 40);
      if (key.length < 4) return;
      var sku = String((p && p.sku) || "").trim();
      if (!sku) return;
      if (!byKey[key]) byKey[key] = { key: key, a: a, items: [] };
      // не дублювати той самий супутній код у межах якоря
      if (byKey[key].items.some(function (it) { return it.sku === sku; })) return;
      byKey[key].items.push({
        sku: sku,
        c: (p.c || "").toString(),
        s: (p.s || "").toString().trim()
      });
    });
    var arr = Object.keys(byKey).map(function (k) { return byKey[k]; });
    // довші ключі першими — щоб специфічніший якір мав пріоритет
    arr.sort(function (x, y) { return y.key.length - x.key.length; });
    return arr;
  }

  // вбудована карта як запас (стара структура UPSELL_MAP_DATA)
  function bundledPairs() {
    return (UPSELL_MAP_DATA || []).map(function (e) {
      return { a: e.a, sku: e.sku, c: e.c, s: e.s };
    });
  }

  var GROUPS = buildGroups(bundledPairs()); // миттєвий запас, поки вантажиться таблиця

  // ---- завантаження карти з таблиці (через фоновий скрипт) ----
  function requestSheet(force) {
    try {
      chrome.runtime.sendMessage(
        { type: "sdGetUpsellMap", force: !!force },
        function (resp) {
          if (chrome.runtime.lastError) return;
          if (resp && resp.pairs && resp.pairs.length) {
            GROUPS = buildGroups(resp.pairs);
            console.log(
              "[SalesDrive Допродаж] карта з таблиці:",
              resp.pairs.length, "пар,",
              GROUPS.length, "товарів-якорів (джерело:", resp.source + ")"
            );
          } else if (resp && resp.error) {
            console.log(
              "[SalesDrive Допродаж] таблиця недоступна (",
              resp.error, ") — працюю з вбудованою картою:",
              GROUPS.length, "якорів"
            );
          }
        }
      );
    } catch (e) {}
  }

  // ---- аналоги (окрема таблиця): якір -> список товарів-замін ----
  // карта «код товару -> [аналоги]» (ВЗАЄМНА) для інлайн-значка в рядку товару
  function buildAnalogBySku(pairs) {
    var m = {};
    function add(key, item) {
      key = String(key || "").trim();
      if (!key || !item.sku) return;
      if (!m[key]) m[key] = [];
      if (m[key].some(function (it) { return it.sku === item.sku; })) return;
      m[key].push(item);
    }
    (pairs || []).forEach(function (p) {
      var ak = String((p && p.ak) || "").trim();   // код якоря
      var sku = String((p && p.sku) || "").trim(); // код аналога
      if (!ak || !sku) return;
      // взаємно: на якорі показуємо аналог, на аналозі — якір
      add(ak, { sku: sku, c: String(p.c || ""), s: String(p.s || "") });
      add(sku, { sku: ak, c: String(p.a || ""), s: String(p.s || "") });
    });
    return m;
  }
  function requestAnalogSheet(force) {
    try {
      chrome.runtime.sendMessage(
        { type: "sdGetAnalogs", force: !!force },
        function (resp) {
          if (chrome.runtime.lastError) return;
          if (resp && resp.pairs && resp.pairs.length) {
            // міст для інлайн-модуля: карта код якоря -> аналоги
            try {
              BUS.__sdAnalogBySku = buildAnalogBySku(resp.pairs);
              BUS.dispatchEvent(new Event("sdAnalogReady"));
            } catch (e) {}
            console.debug(
              "[SalesDrive Аналоги] карта з таблиці:",
              resp.pairs.length, "пар (джерело:", resp.source + ")"
            );
          }
        }
      );
    } catch (e) {}
  }

  function cleanLabel(a) {
    var clone = a.cloneNode(true);
    clone
      .querySelectorAll(".autocomplete-product-highlight, .pull-right")
      .forEach(function (n) { n.remove(); });
    return clone.textContent;
  }

  function matchGroup(label) {
    var t = norm(label);
    if (t.length < 4) return null;
    for (var i = 0; i < GROUPS.length; i++) {
      if (t.indexOf(GROUPS[i].key) !== -1) return GROUPS[i];
    }
    return null;
  }

  var hideTimer = null;
  var busy = false; // серіалізуємо додавання, щоб кліки не змішувались
  var lastTypeahead = 0;          // коли востаннє працювали з пошуком
  var existingShownSig = null;    // підпис набору, показаного для товарів у заявці
  var existingDismissedKey = null;// заявка, для якої авто-підказку закрили
  var lastOrderKey = "";          // поточна заявка (щоб ловити перехід)

  function removeHint() {
    var old = document.getElementById("sd-upsell-hint");
    if (old) old.remove();
    if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
  }
  function armHideTimer() {
    if (hideTimer) clearTimeout(hideTimer);
    hideTimer = setTimeout(removeHint, 45000);
  }

  function truncate(s, n) {
    s = (s || "").trim();
    return s.length > n ? s.slice(0, n - 1) + "…" : s;
  }

  function showHint(items, headerText, opts) {
    if (/\/document\/arrival-product\//.test(location.hash || "")) { removeHint(); return; }
    opts = opts || {};
    removeHint();
    if (!opts.existing) existingShownSig = null;

    var box = document.createElement("div");
    box.id = "sd-upsell-hint";

    var x = document.createElement("button");
    x.className = "sd-x";
    x.textContent = "\u00d7";
    x.title = "Сховати";
    x.addEventListener("click", function () { removeHint(); if (opts.onClose) opts.onClose(); });
    box.appendChild(x);

    // верхній рядок-заголовок прибрано — одразу йдуть товари

    var slots = {}; // код -> { badge, img }
    items.forEach(function (it) {
      var item = document.createElement("div");
      item.className = "sd-item";

      // 1) фото супутнього (сховане, поки не завантажиться).
      // ВАЖЛИВО: без loading="lazy" — інакше браузер не вантажить приховану картинку
      var cimg = document.createElement("img");
      cimg.className = "sd-comp-img";
      cimg.alt = "";
      cimg.loading = "eager";
      cimg.style.display = "none";
      cimg.onerror = function () { cimg.style.display = "none"; };
      item.appendChild(cimg);

      // 2) середня колонка: назва + причина + наявність
      var main = document.createElement("div");
      main.className = "sd-main";

      if (it.c) {
        var nameEl = document.createElement("div");
        nameEl.className = "sd-name";
        nameEl.textContent = it.c;
        main.appendChild(nameEl);
      }

      var say = document.createElement("div");
      say.className = "sd-say";
      say.textContent = "Скажіть клієнту";
      main.appendChild(say);

      var script = document.createElement("div");
      script.className = "sd-script";
      // назву показуємо окремим рядком, тож типова причина — без повтору назви
      script.textContent = it.s || "Зазвичай беруть разом — щоб не замовляти окремо й не платити ще раз за доставку.";
      main.appendChild(script);

      var stock = null;
      if (it.sku) {
        stock = document.createElement("span");
        stock.className = "sd-stock sd-stock-wait";
        stock.textContent = "перевіряю залишок…";
        main.appendChild(stock);
      }
      item.appendChild(main);

      // 3) права колонка: блок ціни + кнопка
      var action = document.createElement("div");
      action.className = "sd-action";

      var priceEl = null, priceLab = null, priceVal = null;
      if (it.sku) {
        priceEl = document.createElement("div");
        priceEl.className = "sd-price";
        priceEl.style.display = "none"; // показуємо лише коли є ціна
        priceLab = document.createElement("div");
        priceLab.className = "sd-price-lab";
        priceVal = document.createElement("div");
        priceVal.className = "sd-price-val";
        priceEl.appendChild(priceLab);
        priceEl.appendChild(priceVal);
        action.appendChild(priceEl);
      }

      var addBtn = document.createElement("button");
      addBtn.className = "sd-add";
      addBtn.type = "button";
      addBtn.appendChild(document.createTextNode("➕ Додати"));
      if (it.sku) {
        var sku = document.createElement("span");
        sku.className = "sd-sku";
        sku.textContent = "код " + it.sku;
        addBtn.appendChild(document.createTextNode("  "));
        addBtn.appendChild(sku);
      }
      addBtn.addEventListener("click", function () {
        addCompanion(it.sku, addBtn);
      });
      action.appendChild(addBtn);

      item.appendChild(action);

      if (it.sku) {
        slots[it.sku] = { badge: stock, img: cimg, item: item,
          price: priceEl, priceLab: priceLab, priceVal: priceVal };
      }

      box.appendChild(item);
    });

    var spot = findInsertPoint();
    if (spot && spot.parent) {
      spot.parent.insertBefore(box, spot.ref ? spot.ref.nextSibling : null);
    } else {
      box.style.position = "fixed";
      box.style.bottom = "20px";
      box.style.left = "50%";
      box.style.transform = "translateX(-50%)";
      box.style.maxWidth = "820px";
      box.style.width = "90%";
      document.body.appendChild(box);
    }

    if (opts.scrollIntoView) { try { box.scrollIntoView({ block: "nearest", behavior: "smooth" }); } catch (e) {} }
    requestStock(slots);
    if (!opts.existing) armHideTimer();
  }


  function fmtQty(n) {
    if (n == null) return "";
    return (Math.abs(n - Math.round(n)) < 1e-9) ? String(Math.round(n)) : String(n);
  }

  function applyStockBadge(b, r) {
    if (!b) return;
    b.classList.remove("sd-stock-wait");
    if (!r || r.found === false) {
      b.className = "sd-stock sd-stock-no";
      b.textContent = "⚠ нема в каталозі (перевір код)";
      dbg("товар не знайдено, код:", r && r.code, r);
      return;
    }
    if (r.qty == null) {
      b.className = "sd-stock sd-stock-unk";
      b.textContent = "залишок невідомий";
      dbg("поле залишку не знайдено для коду", r.code, "— товар:", r.dump);
      return;
    }
    if (r.qty > 0) {
      b.className = "sd-stock sd-stock-yes";
      b.textContent = "✓ В наявності: " + fmtQty(r.qty) + " шт";
    } else {
      b.className = "sd-stock sd-stock-no";
      b.textContent = "✗ Немає в наявності";
    }
  }

  // застосувати результат до блоку супутнього: залишок + картинка
  function applyResult(slot, r) {
    if (!slot) return;
    applyStockBadge(slot.badge, r);
    if (slot.price) {
      if (r && r.found !== false && r.price && r.price.value != null) {
        slot.priceLab.textContent = (r.price.label === "Rozetka") ? "Ціна Rozetka" : "Ціна";
        slot.priceVal.textContent = pwMoney(r.price.value) + " ₴";
        slot.price.style.display = "";
      } else {
        slot.price.style.display = "none";
      }
    }
    if (!slot.img || !r) return;
    if (r.img) {
      slot.img.onload = function () { slot.img.style.display = ""; };
      slot.img.onerror = function () { slot.img.style.display = "none"; };
      slot.img.src = r.img;
    } else {
      slot.img.style.display = "none";
    }
  }

  // Переставити блоки супутніх за наявністю:
  // спочатку ті, яких найбільше (qty більше — вище), потім менше,
  // далі з невідомим залишком, а яких немає / нема в каталозі — в кінці.
  function reorderByStock(box, slots, results) {
    if (!box) return;
    var info = {};
    (results || []).forEach(function (r) { if (r && r.code != null) info[r.code] = r; });
    var entries = Object.keys(slots).map(function (code) {
      var r = info[code] || {};
      var group, qty = 0;
      if (r.found !== false && r.qty != null && Number(r.qty) > 0) {
        group = 0; qty = Number(r.qty);              // в наявності — сортуємо за кількістю
      } else if (r.found !== false && r.qty == null && info[code]) {
        group = 1;                                   // знайдено, але залишок невідомий
      } else {
        group = 2;                                   // немає в наявності або нема в каталозі
      }
      return { item: slots[code].item, group: group, qty: qty };
    });
    // стабільне сортування: спершу за групою, всередині групи «в наявності» — за кількістю вниз
    entries.sort(function (a, b) {
      if (a.group !== b.group) return a.group - b.group;
      return b.qty - a.qty;
    });
    entries.forEach(function (e) {
      if (e.item && e.item.parentNode === box) box.appendChild(e.item);
    });
  }

  // запит залишків + фото у page-context для всіх супутніх одразу
  function requestStock(slots, boxId) {
    boxId = boxId || "sd-upsell-hint";
    var codes = Object.keys(slots || {});
    if (!codes.length) return;
    var token = String(Date.now()) + "_" + Math.random().toString(36).slice(2);

    function onRes() {
      var raw = document.documentElement.getAttribute("data-sd-stock-result");
      if (!raw) return;
      var data;
      try { data = JSON.parse(raw); } catch (e) { return; }
      if (!data || data.token !== token) return;
      BUS.removeEventListener("sdUpsellStockResult", onRes);
      (data.results || []).forEach(function (r) { applyResult(slots[r.code], r); });
      reorderByStock(document.getElementById(boxId), slots, data.results);
    }

    BUS.addEventListener("sdUpsellStockResult", onRes);
    document.documentElement.setAttribute("data-sd-stock-codes", JSON.stringify(codes));
    document.documentElement.setAttribute("data-sd-stock-token", token);
    document.documentElement.removeAttribute("data-sd-stock-result");
    BUS.dispatchEvent(new Event("sdUpsellStock"));

    setTimeout(function () {
      BUS.removeEventListener("sdUpsellStockResult", onRes);
      codes.forEach(function (c) {
        var b = slots[c] && slots[c].badge;
        if (b && b.classList.contains("sd-stock-wait")) {
          b.className = "sd-stock sd-stock-unk";
          b.textContent = "залишок: —";
        }
      });
    }, 4000);
  }

  function findInsertPoint() {
    // точно: кнопка "+ Додати" має ng-click="viewModel.addOption()"
    var ref = null;
    var clicky = document.querySelectorAll('[ng-click]');
    for (var i = 0; i < clicky.length; i++) {
      var v = (clicky[i].getAttribute("ng-click") || "").replace(/\s+/g, "");
      if (v === "viewModel.addOption()") { ref = clicky[i]; break; }
    }
    if (!ref) ref = document.getElementById("addCompleteProduct");
    if (!ref) return null;

    // КЛЮЧОВЕ: кнопка лежить у таблиці товарів. Якщо вставити банер у <tr>,
    // таблиця сплющить його у вузький стовпчик. Тому ставимо банер ПІСЛЯ таблиці.
    var tbl = ref.closest("table");
    if (tbl && tbl.parentElement && tbl.parentElement !== document.body) {
      return { parent: tbl.parentElement, ref: tbl };
    }

    // запас: найближчий блочний (НЕ табличний) контейнер достатньої ширини
    var need = Math.min(700, Math.max(380, Math.round((window.innerWidth || 1000) * 0.55)));
    var TABLEISH = { "table": 1, "table-row": 1, "table-row-group": 1, "table-cell": 1,
      "table-header-group": 1, "table-footer-group": 1, "inline-table": 1 };
    var wide = ref.parentElement;
    while (wide && wide !== document.body) {
      var disp = "";
      try { disp = getComputedStyle(wide).display; } catch (e) {}
      if (!TABLEISH[disp] && wide.offsetWidth >= need) break;
      wide = wide.parentElement;
    }
    if (!wide || wide === document.body) wide = ref.parentElement;

    var child = ref;
    while (child && child.parentElement !== wide) child = child.parentElement;

    return { parent: wide, ref: child };
  }

  function handleLabel(label) {
    if (!label) return;
    lastTypeahead = Date.now();
    var group = matchGroup(label);
    if (group) {
      var many = group.items.length > 1;
      showHint(group.items, "💡 Допродаж до: " + truncate(group.a, 52) +
        (many ? "  (" + group.items.length + " варіанти)" : ""));
    }
  }

  function setNativeValue(el, value) {
    var proto = window.HTMLInputElement.prototype;
    var setter = Object.getOwnPropertyDescriptor(proto, "value").set;
    setter.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function fillFallback(code) {
    var inp = document.getElementById("addCompleteProduct");
    if (!inp) {
      var c = document.querySelectorAll(
        'input[ng-model*="newName"], input[id^="addCompleteProduct"]'
      );
      inp = c[c.length - 1];
    }
    if (!inp) return;
    inp.focus();
    setNativeValue(inp, String(code));
  }

  function markAdded(btn) {
    if (!btn) return;
    btn.classList.add("sd-done");
    btn.disabled = true;
    btn.textContent = "✓ Додано";
  }

  // один клік: просимо page-context додати через рідний Angular-метод SalesDrive;
  // якщо не вдалось — просто вписуємо код у поле.
  function addCompanion(code, btn) {
    if (!code) return;
    if (busy) return;
    busy = true;
    var done = false;

    function finish(ok) {
      if (done) return;
      done = true;
      busy = false;
      BUS.removeEventListener("sdUpsellAddResult", onResult);
      if (ok) { markAdded(btn); armHideTimer(); }
      else { fillFallback(code); }
    }
    function onResult() {
      var ok = document.documentElement.getAttribute("data-sd-upsell-result") === "ok";
      finish(ok);
    }

    BUS.addEventListener("sdUpsellAddResult", onResult);
    document.documentElement.setAttribute("data-sd-upsell-code", String(code));
    document.documentElement.removeAttribute("data-sd-upsell-result");
    BUS.dispatchEvent(new Event("sdUpsellAdd"));

    setTimeout(function () { if (!done) finish(false); }, 2500);
  }

  // 1) клік/тап по пункту випадного списку
  document.addEventListener(
    "mousedown",
    function (e) {
      var a = e.target.closest(
        'a[ng-bind-html*="match.label"], ul[id^="typeahead-"] a, .dropdown-menu a, [role="option"]'
      );
      if (a) handleLabel(cleanLabel(a));
    },
    true
  );

  // 2) вибір клавіатурою (Enter на підсвіченому пункті)
  document.addEventListener(
    "keydown",
    function (e) {
      if (e.key !== "Enter") return;
      var active = document.querySelector(
        'ul[id^="typeahead-"] li.active a, .dropdown-menu li.active a, .dropdown-menu .active a, li.active a[ng-bind-html*="match.label"]'
      );
      if (active) {
        handleLabel(cleanLabel(active));
      } else {
        var inp = document.getElementById("addCompleteProduct");
        if (inp && inp.value) setTimeout(function () { handleLabel(inp.value); }, 50);
      }
    },
    true
  );

  // ---- підказка за товарами, що ВЖЕ є у відкритій заявці ----
  function orderKey() {
    var m = (location.hash || "").match(/order\/\w+\/(\d+)/);
    return m ? m[1] : (location.hash || "");
  }

  function onOrderItems() {
    var key = orderKey();
    if (key !== lastOrderKey) { // перейшли в іншу заявку — скидаємо стани
      lastOrderKey = key;
      existingDismissedKey = null;
      existingShownSig = null;
    }
    // якщо менеджер щойно вибирав товар у пошуку — не перебиваємо його підказку
    if (Date.now() - lastTypeahead < 3000) return;

    var items = [];
    try { items = JSON.parse(document.documentElement.getAttribute("data-sd-order-items")) || []; }
    catch (e) { return; }
    if (!items.length) return;

    // що вже є в заявці (щоб не пропонувати наявне)
    var presentCodes = {}, presentNames = [];
    items.forEach(function (it) {
      (it.codes || []).forEach(function (c) { presentCodes[String(c).toLowerCase()] = 1; });
      if (it.name) presentNames.push(norm(it.name));
    });
    function alreadyInOrder(comp) {
      if (presentCodes[String(comp.sku).toLowerCase()]) return true;
      // За назвою вважаємо «наявним» ЛИШЕ при повному збігу назви супутнього з
      // товаром заявки (а не за спільним початком). Інакше різні товари з однаковим
      // початком назви («Амортизатори для пральної машини …», «Мішок для пилососа …»)
      // помилково ховались як «уже в заявці», коли в заявці був інший товар тієї ж родини.
      var cn = norm(comp.c);
      if (cn.length > 10) {
        for (var i = 0; i < presentNames.length; i++) {
          if (presentNames[i].indexOf(cn) !== -1) return true;
        }
      }
      return false;
    }

    // знайти якорі серед товарів заявки і зібрати супутні
    var seenAnchor = {}, seenComp = {}, companions = [];
    items.forEach(function (it) {
      var g = matchGroup(it.name || "");
      if (!g || seenAnchor[g.key]) return;
      seenAnchor[g.key] = 1;
      g.items.forEach(function (ci) {
        if (seenComp[ci.sku] || alreadyInOrder(ci)) return;
        seenComp[ci.sku] = 1;
        companions.push({ sku: ci.sku, c: ci.c, s: ci.s, anchor: g.a });
      });
    });

    if (!companions.length) { // нема чого пропонувати — прибрати, якщо це наша авто-підказка
      if (existingShownSig !== null) { removeHint(); existingShownSig = null; }
      return;
    }
    if (existingDismissedKey === key) return; // закрито для цієї заявки

    var sig = companions.map(function (c) { return c.sku; }).sort().join(",");
    if (existingShownSig === sig && document.getElementById("sd-upsell-hint")) return; // вже показано

    var anchors = {};
    companions.forEach(function (c) { anchors[c.anchor] = 1; });
    var names = Object.keys(anchors);
    var header = names.length === 1
      ? "💡 У заявці є «" + truncate(names[0], 46) + "» — допродаж:"
      : "💡 Можливий допродаж до товарів заявки:";

    showHint(companions, header, {
      existing: true,
      scrollIntoView: true,
      onClose: function () { existingDismissedKey = key; existingShownSig = null; }
    });
    existingShownSig = sig;
  }

  BUS.addEventListener("sdOrderItems", onOrderItems);

  // ---------- ПЕРЕДУПЕРЕДЖЕННЯ ПРО ЦІНУ ROZETKA ----------
  function pwMoney(n) {
    n = Math.round(Number(n) * 100) / 100;
    var s = (n % 1 === 0) ? String(n) : n.toFixed(2);
    return s.replace(".", ",");
  }
  function removePriceWarn() {
    var old = document.getElementById("sd-price-warn");
    if (old) old.remove();
  }
  function showPriceWarn(problems) {
    removePriceWarn();
    var box = document.createElement("div");
    box.id = "sd-price-warn";

    var x = document.createElement("button");
    x.className = "sd-x";
    x.textContent = "\u00d7";
    x.title = "Сховати";
    x.addEventListener("click", function () { removePriceWarn(); });
    box.appendChild(x);

    var top = document.createElement("div");
    top.className = "sd-pw-top";
    top.textContent = "⚠️ Замовлення Rozetka, але ціни не за прайсом ROZETKA:";
    box.appendChild(top);

    problems.forEach(function (p) {
      var row = document.createElement("div");
      row.className = "sd-pw-row" + (p.below ? " sd-pw-below" : "");
      var nm = document.createElement("span");
      nm.className = "sd-pw-name";
      nm.textContent = p.name + (p.sku ? " (" + p.sku + ")" : "");
      var info = document.createElement("span");
      info.className = "sd-pw-info";
      info.textContent = "стоїть " + pwMoney(p.charged) + " ₴ → прайс ROZETKA " + pwMoney(p.target) + " ₴";
      row.appendChild(nm);
      row.appendChild(info);
      box.appendChild(row);
    });

    var spot = findInsertPoint();
    if (spot && spot.parent) {
      spot.parent.insertBefore(box, spot.ref || null); // ПЕРЕД таблицею — зверху
    } else {
      document.body.appendChild(box);
    }
  }
  function removeRatingWarn() {
    var old = document.getElementById("sd-rating-warn");
    if (old) old.remove();
  }
  // Скрипт менеджеру при ризиковому клієнті (редагується тут)
  var RISK_SCRIPT = [
    { label: "Клієнту:", text: "Доброго дня! Замовлення можемо відправити, але по ньому потрібно внести передоплату." },
    { label: "Якщо питає «Чому передоплата?»:", text: "Умови визначаються системою автоматично для окремих замовлень. Це правило діє, щоб зменшити кількість невикуплених відправок." },
    { label: "Якщо вагається (дотиснути):", text: "Ми працюємо з післяплатою, але для деяких замовлень потрібна невелика передоплата як підтвердження. Це стандартна практика — щоб не затримувати інші замовлення і швидше відправити ваш товар." }
  ];
  function showRatingWarn(rating) {
    removeRatingWarn();
    var box = document.createElement("div");
    box.id = "sd-rating-warn";

    var x = document.createElement("button");
    x.className = "sd-x";
    x.textContent = "\u00d7";
    x.title = "Сховати";
    x.addEventListener("click", function () { removeRatingWarn(); });
    box.appendChild(x);

    var t = document.createElement("div");
    t.className = "sd-rw-top";
    var who = rating.name ? (" — " + rating.name) : "";
    t.textContent = "⚠️ Ризиковий клієнт" + who + " · викуп " + (rating.value || "—") + " — потрібна передоплата";
    box.appendChild(t);

    var script = document.createElement("div");
    script.className = "sd-rw-script";
    RISK_SCRIPT.forEach(function (s) {
      var block = document.createElement("div");
      block.className = "sd-rw-block";

      var head = document.createElement("div");
      head.className = "sd-rw-label";
      var lab = document.createElement("span");
      lab.textContent = s.label;
      head.appendChild(lab);

      var copyBtn = document.createElement("button");
      copyBtn.className = "sd-rw-copy";
      copyBtn.type = "button";
      copyBtn.textContent = "копіювати";
      copyBtn.title = "Скопіювати текст";
      copyBtn.addEventListener("click", function () {
        try {
          navigator.clipboard.writeText(s.text).then(function () {
            copyBtn.textContent = "скопійовано ✓";
            setTimeout(function () { copyBtn.textContent = "копіювати"; }, 1500);
          }, function () {});
        } catch (e) {}
      });
      head.appendChild(copyBtn);

      var body = document.createElement("div");
      body.className = "sd-rw-text";
      body.textContent = s.text;

      block.appendChild(head);
      block.appendChild(body);
      script.appendChild(block);
    });
    box.appendChild(script);

    var spot = findInsertPoint();
    if (spot && spot.parent) {
      var anchor = document.getElementById("sd-price-warn") || spot.ref || null;
      spot.parent.insertBefore(box, anchor); // над банером цін / над таблицею
    } else {
      document.body.appendChild(box);
    }
  }
  // ---------- БАНЕР: ТТН ЗМІНЕНО на Rozetka/Refort-заявці ----------
  function removeTtnWarn() {
    var old = document.getElementById("sd-ttn-warn");
    if (old) old.remove();
  }
  function showTtnWarn(oldTtn, curTtn, key) {
    removeTtnWarn();
    var box = document.createElement("div");
    box.id = "sd-ttn-warn";
    box.className = "sd-ttn-box";

    var x = document.createElement("button");
    x.className = "sd-x";
    x.textContent = "\u00d7";
    x.title = "Сховати";
    x.addEventListener("click", function () { removeTtnWarn(); });
    box.appendChild(x);

    var t = document.createElement("div");
    t.className = "sd-tw-top";
    t.textContent = curTtn
      ? "⚠️ На цій заявці міняли ТТН — перевір, що на Rozetka стоїть актуальний номер"
      : "⚠️ ТТН видалили й не створили новий — зроби новий і онови на Rozetka";
    box.appendChild(t);

    var info = document.createElement("div");
    info.className = "sd-tw-info";
    info.textContent = curTtn
      ? ("Старі: " + oldTtn + "   →   поточний: " + curTtn)
      : ("Був: " + oldTtn + "   →   зараз ТТН немає");
    box.appendChild(info);

    var why = document.createElement("div");
    why.className = "sd-tw-why";
    why.textContent = "Інакше покупець відстежуватиме старий (недійсний) номер.";
    box.appendChild(why);

    var ack = document.createElement("button");
    ack.className = "sd-tw-ack";
    ack.type = "button";
    ack.textContent = "✓ Оновив на Rozetka — більше не показувати";
    ack.addEventListener("click", function () {
      try { var o = {}; o[key] = curTtn; chrome.storage.local.set(o); } catch (e) {}
      removeTtnWarn();
    });
    box.appendChild(ack);

    var spot = findInsertPoint();
    if (spot && spot.parent) {
      // найвищий банер: над рейтингом/цінами/таблицею
      var anchor = document.getElementById("sd-rating-warn")
        || document.getElementById("sd-price-warn")
        || spot.ref || null;
      spot.parent.insertBefore(box, anchor);
    } else {
      document.body.appendChild(box);
    }
  }
  // Банер «на заявці 2+ ТТН одночасно» — поточний стан, без історії, спрацьовує миттєво.
  function removeTtnMulti() {
    var old = document.getElementById("sd-ttn-multi");
    if (old) old.remove();
  }
  function showTtnMulti(ens) {
    removeTtnMulti();
    var box = document.createElement("div");
    box.id = "sd-ttn-multi";
    box.className = "sd-ttn-box";

    var x = document.createElement("button");
    x.className = "sd-x";
    x.textContent = "\u00d7";
    x.title = "Сховати";
    x.addEventListener("click", function () { removeTtnMulti(); });
    box.appendChild(x);

    var t = document.createElement("div");
    t.className = "sd-tw-top";
    t.textContent = "⚠️ На заявці " + ens.length + " ТТН одночасно — лиши одну й онови на Rozetka";
    box.appendChild(t);

    var info = document.createElement("div");
    info.className = "sd-tw-info";
    info.textContent = ens.join("   ·   ");
    box.appendChild(info);

    var why = document.createElement("div");
    why.className = "sd-tw-why";
    why.textContent = "Дві накладні на одне замовлення — зайва ТТН і плутанина з відстеженням.";
    box.appendChild(why);

    var spot = findInsertPoint();
    if (spot && spot.parent) {
      var anchor = document.getElementById("sd-ttn-warn")
        || document.getElementById("sd-rating-warn")
        || document.getElementById("sd-price-warn")
        || spot.ref || null;
      spot.parent.insertBefore(box, anchor);
    } else {
      document.body.appendChild(box);
    }
  }
  // Порівнюємо поточний ТТН із збереженим по цій заявці.
  // 1) Якщо ЗАРАЗ 2+ ТТН одночасно -> миттєвий банер (без історії).
  // 2) Якщо один ТТН і він став ІНШИМ, ніж був раніше -> банер заміни.
  // Перша поява заявки = базова лінія. Кнопка «оновив» підтверджує новий ТТН.
  function handleTtn(info) {
    if (!info || !info.orderId) { removeTtnWarn(); removeTtnMulti(); return; }
    var ens = info.ens || [];
    var oldTtns = info.oldTtns || [];
    // 1) 2+ ТТН одночасно — показуємо одразу
    if (ens.length >= 2) { removeTtnWarn(); showTtnMulti(ens); return; }
    removeTtnMulti();
    // 2) історія каже, що ТТН міняли (є старі номери, відмінні від поточного)
    if (!oldTtns.length) { removeTtnWarn(); return; }
    var key = "sd_ttn_" + info.orderId;
    var current = ens.length === 1 ? ens[0] : "";
    try {
      chrome.storage.local.get(key, function (data) {
        var ack = data ? data[key] : undefined;
        // якщо менеджер уже підтвердив саме цей поточний ТТН — не нагадуємо
        if (ack === current && current !== "") { removeTtnWarn(); return; }
        showTtnWarn(oldTtns.join(", "), current, key);
      });
    } catch (e) {}
  }
  function onPriceWarn() {
    var res;
    try { res = JSON.parse(document.documentElement.getAttribute("data-sd-price-warn")) || {}; }
    catch (e) { return; }
    // ціни (банер під рейтингом)
    if (res.rozetka && res.problems && res.problems.length) showPriceWarn(res.problems);
    else removePriceWarn();
    // рейтинг (банер зверху)
    if (res.rating && res.rating.low) showRatingWarn(res.rating);
    else removeRatingWarn();
    // ТТН (найвищий банер) — порівняння з пам'яттю по заявці
    handleTtn(res.ttn);
  }
  BUS.addEventListener("sdPriceWarn", onPriceWarn);

  // ---------- ХОВАЄМО ПІДКАЗКУ, КОЛИ ВІДКРИТЕ МОДАЛЬНЕ ВІКНО ----------
  // (напр. характеристики товару — Bootstrap .modal + .modal-backdrop).
  // Поки вікно відкрите — підказка схована; закрив — знову зʼявляється.
  function elVisible(el) {
    if (!el) return false;
    var cs;
    try { cs = getComputedStyle(el); } catch (e) { return false; }
    if (cs.display === "none" || cs.visibility === "hidden") return false;
    var r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }
  function anyModalOpen() {
    if (elVisible(document.querySelector(".modal-backdrop"))) return true;
    var ms = document.querySelectorAll(".modal");
    for (var i = 0; i < ms.length; i++) if (elVisible(ms[i])) return true;
    return false;
  }
  // Випадаючий список пошуку товару (Select2-стиль у .form-group-autocomplete /
  // .change-products). Коли він відкритий — перекриває підказку, тому ховаємо її
  // так само, як на модалці. Ознака «список випав»: усередині поля зʼявився
  // видимий елемент, вищий за саме поле (>60px) і з кількома текстовими рядками.
  function autocompleteOpen() {
    var wraps = document.querySelectorAll(".form-group-autocomplete, .change-products");
    for (var i = 0; i < wraps.length; i++) {
      var kids = wraps[i].querySelectorAll("ul, ol, div, table");
      for (var j = 0; j < kids.length; j++) {
        var el = kids[j];
        if (!elVisible(el)) continue;
        var r = el.getBoundingClientRect();
        if (r.height > 60 && r.width > 100) {
          var rows = el.querySelectorAll("li, a, tr, div");
          var n = 0;
          for (var k = 0; k < rows.length && n < 2; k++) {
            if ((rows[k].textContent || "").trim().length > 2) n++;
          }
          if (n >= 2) return true;
        }
      }
    }
    return false;
  }
  var _modalState = null;
  function syncModalClass() {
    var open = anyModalOpen() || autocompleteOpen();
    if (open === _modalState) return;
    _modalState = open;
    document.documentElement.classList.toggle("sd-modal-open", open);
  }
  try {
    if (document.body) new MutationObserver(syncModalClass).observe(document.body, { childList: true });
  } catch (e) {}
  // миттєва реакція: коли друкуєш у пошуку або фокус заходить/виходить із поля
  ["input", "focusin", "focusout", "click"].forEach(function (ev) {
    document.addEventListener(ev, function () { setTimeout(syncModalClass, 0); }, true);
  });
  setInterval(syncModalClass, 2000);
  syncModalClass();

  // тягнемо карту з таблиці при завантаженні сторінки
  requestSheet(false);
  requestAnalogSheet(false); // аналоги — окрема таблиця (якщо налаштовано ANALOG_SHEET_ID)

  console.debug("[SalesDrive Допродаж] активний. Якорів у вбудованій карті:", GROUPS.length);
})();


  // ====== kb.js (база знань) ======

// База знань для SalesDrive: плаваюча кнопка «📖 База знань» + панель із пошуком.
// Контент береться з Google-таблиці через фоновий скрипт (повідомлення "sdGetKb").
// Колонки таблиці: Категорія | Заголовок | Текст | Ключові слова
(function () {
  "use strict";

  var BTN_ID = "sd-kb-btn";
  var PANEL_ID = "sd-kb-panel";

  var rows = [];        // [{cat, title, text, kw}]
  var loaded = false;   // дані успішно прийшли
  var loadError = "";   // текст помилки, якщо не вийшло

  function norm(s) {
    return (s || "")
      .toLowerCase()
      .replace(/[\u02bc\u2019\u2018\u0027\u00b4`]/g, "") // прибрати апострофи
      .replace(/\s+/g, " ")
      .trim();
  }

  // ---- запит таблиці через фоновий скрипт ----
  function requestKb(force) {
    try {
      chrome.runtime.sendMessage({ type: "sdGetKb", force: !!force }, function (resp) {
        if (chrome.runtime.lastError) { loadError = "ext"; renderList(); return; }
        if (resp && resp.rows && resp.rows.length) {
          rows = resp.rows;
          loaded = true;
          loadError = "";
          console.debug("[SalesDrive База знань] записів:", rows.length, "(джерело:", resp.source + ")");
        } else {
          loadError = (resp && resp.error) ? resp.error : "empty";
          console.log("[SalesDrive База знань] таблиця недоступна:", loadError);
        }
        renderList();
      });
    } catch (e) { loadError = String(e); renderList(); }
  }

  // ---- копіювання у буфер ----
  function fallbackCopy(text) {
    try {
      var ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    } catch (e) {}
  }
  function copyText(text, btn) {
    function ok() {
      var old = btn.textContent;
      btn.textContent = "✓ Скопійовано";
      btn.classList.add("sd-kb-copied");
      setTimeout(function () { btn.textContent = old; btn.classList.remove("sd-kb-copied"); }, 1400);
    }
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(ok, function () { fallbackCopy(text); ok(); });
        return;
      }
    } catch (e) {}
    fallbackCopy(text); ok();
  }

  // ---- побудова панелі (один раз) ----
  function buildPanel() {
    if (document.getElementById(BTN_ID)) return;

    var btn = document.createElement("button");
    btn.id = BTN_ID;
    btn.type = "button";
    btn.textContent = "📖 База знань";
    btn.addEventListener("click", function (e) {
      e.stopPropagation();
      togglePanel();
    });
    document.body.appendChild(btn);

    var panel = document.createElement("div");
    panel.id = PANEL_ID;
    panel.style.display = "none";
    panel.addEventListener("click", function (e) { e.stopPropagation(); });

    var head = document.createElement("div");
    head.className = "sd-kb-head";
    var title = document.createElement("div");
    title.className = "sd-kb-title";
    title.textContent = "База знань";
    head.appendChild(title);
    var x = document.createElement("button");
    x.className = "sd-kb-x";
    x.type = "button";
    x.textContent = "×";
    x.addEventListener("click", function () { closePanel(); });
    head.appendChild(x);
    panel.appendChild(head);

    var search = document.createElement("input");
    search.id = "sd-kb-search";
    search.type = "text";
    search.placeholder = "Пошук… (напр. приват, коли повернення)";
    search.addEventListener("input", function () { renderList(); });
    panel.appendChild(search);

    var list = document.createElement("div");
    list.id = "sd-kb-list";
    panel.appendChild(list);

    document.body.appendChild(panel);

    // клік поза панеллю — закрити
    document.addEventListener("click", function (e) {
      var p = document.getElementById(PANEL_ID);
      if (!p || p.style.display === "none") return;
      if (p.contains(e.target)) return;
      var b = document.getElementById(BTN_ID);
      if (b && b.contains(e.target)) return;
      closePanel();
    });
    // Esc — закрити
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") closePanel();
    });
  }

  function togglePanel() {
    var p = document.getElementById(PANEL_ID);
    if (!p) return;
    if (p.style.display === "none") openPanel();
    else closePanel();
  }
  function openPanel() {
    var p = document.getElementById(PANEL_ID);
    if (!p) return;
    p.style.display = "flex";
    if (!loaded) requestKb(false);
    renderList();
    var s = document.getElementById("sd-kb-search");
    if (s) setTimeout(function () { s.focus(); }, 30);
  }
  function closePanel() {
    var p = document.getElementById(PANEL_ID);
    if (p) p.style.display = "none";
  }

  // ---- рендер списку (з урахуванням пошуку) ----
  function renderList() {
    var list = document.getElementById("sd-kb-list");
    if (!list) return;
    list.textContent = "";

    if (!loaded && !loadError) {
      var w = document.createElement("div");
      w.className = "sd-kb-msg";
      w.textContent = "Завантаження…";
      list.appendChild(w);
      return;
    }
    if (loadError) {
      var er = document.createElement("div");
      er.className = "sd-kb-msg sd-kb-err";
      er.textContent = "Не вдалося завантажити базу. Перевір, що таблиця відкрита «за посиланням». ";
      var rt = document.createElement("button");
      rt.type = "button";
      rt.className = "sd-kb-retry";
      rt.textContent = "Спробувати ще";
      rt.addEventListener("click", function () { loadError = ""; renderList(); requestKb(true); });
      er.appendChild(rt);
      list.appendChild(er);
      return;
    }

    var searchEl = document.getElementById("sd-kb-search");
    var q = norm(searchEl ? searchEl.value : "");

    var filtered = rows.filter(function (r) {
      if (!q) return true;
      return norm(r.title + " " + r.text + " " + r.kw + " " + r.cat).indexOf(q) !== -1;
    });

    if (!filtered.length) {
      var nf = document.createElement("div");
      nf.className = "sd-kb-msg";
      nf.textContent = "Нічого не знайдено.";
      list.appendChild(nf);
      return;
    }

    // групуємо за категорією, зберігаючи порядок появи
    var order = [];
    var byCat = {};
    filtered.forEach(function (r) {
      var c = r.cat || "Інше";
      if (!byCat[c]) { byCat[c] = []; order.push(c); }
      byCat[c].push(r);
    });

    order.forEach(function (cat) {
      var ch = document.createElement("div");
      ch.className = "sd-kb-cat";
      ch.textContent = cat;
      list.appendChild(ch);

      byCat[cat].forEach(function (r) {
        var card = document.createElement("div");
        card.className = "sd-kb-card";

        var head = document.createElement("div");
        head.className = "sd-kb-card-head";
        var t = document.createElement("div");
        t.className = "sd-kb-card-title";
        t.textContent = r.title;
        head.appendChild(t);
        var caret = document.createElement("span");
        caret.className = "sd-kb-caret";
        head.appendChild(caret);
        card.appendChild(head);

        var body = document.createElement("div");
        body.className = "sd-kb-card-body";
        var expanded = !!q; // під час пошуку картки одразу розгорнуті
        body.style.display = expanded ? "block" : "none";
        caret.textContent = expanded ? "▾" : "▸";

        var txt = document.createElement("div");
        txt.className = "sd-kb-card-text";
        txt.textContent = r.text;
        body.appendChild(txt);

        var copy = document.createElement("button");
        copy.type = "button";
        copy.className = "sd-kb-copy";
        copy.textContent = "Копіювати";
        copy.addEventListener("click", function (e) {
          e.stopPropagation();
          copyText(r.text, copy);
        });
        body.appendChild(copy);

        card.appendChild(body);

        head.addEventListener("click", function () {
          var open = body.style.display !== "none";
          body.style.display = open ? "none" : "block";
          caret.textContent = open ? "▸" : "▾";
        });

        list.appendChild(card);
      });
    });
  }

  // ---- старт ----
  function start() {
    buildPanel();
    requestKb(false); // підвантажуємо одразу, щоб пошук був готовий ще до відкриття
  }
  if (document.body) start();
  else document.addEventListener("DOMContentLoaded", start);
})();


  // ====== page-міст (визначення; вкраплюється у сторінку нижче) ======

// Runs in the PAGE context (has access to window.angular and SalesDrive's scope).
// Listens for "sdUpsellAdd", reads the code from a DOM attribute, and adds the
// product by calling SalesDrive's own typeahead-select handler.
function __sdPageMain() {
  "use strict";

  var DEBUG = false; // увімкни true, щоб бачити детальні логи в консолі

  function log() {
    var a = ["[SD Допродаж]"].concat([].slice.call(arguments));
    console.log.apply(console, a);
  }
  function dbg() { if (DEBUG) log.apply(null, [].slice.call(arguments)); }

  function findInput() {
    return (
      document.getElementById("addCompleteProduct") ||
      document.querySelector('input[ng-model*="newName"]')
    );
  }

  function getVM(el) {
    if (!window.angular) return null;
    try {
      var s = window.angular.element(el).scope();
      while (s && !s.viewModel) s = s.$parent;
      if (s && s.viewModel) return { scope: s, vm: s.viewModel };
    } catch (e) {}
    return null;
  }

  // кешований доступ до viewModel — щоб не шукати його щоразу заново
  var _vmCache = null;
  function getVMcached() {
    if (_vmCache && _vmCache.scope && !_vmCache.scope.$$destroyed && _vmCache.scope.viewModel) {
      return _vmCache;
    }
    var host = findBtnByClick("viewModel.addOption(true)") ||
      findBtnByClick("viewModel.addOption()") || findInput();
    var got = host && getVM(host);
    _vmCache = got || null;
    return _vmCache;
  }

  function asString(v) {
    return v == null ? "" : String(v).toLowerCase();
  }

  function stripZeros(s) { return String(s == null ? "" : s).replace(/^0+/, ""); }

  // choose the autocomplete item that matches the code we want to add
  function pickItem(items, code) {
    if (!items || !items.length) return null;
    code = asString(code).trim();

    var skuFields = ["sku", "SKU", "article", "code", "vendorCode", "id"];
    var exact = items.filter(function (it) {
      return skuFields.some(function (f) {
        return it && it[f] != null && asString(it[f]) === code;
      });
    });
    if (exact.length === 1) return exact[0];
    if (exact.length > 1) return exact[0];

    // співпадіння без урахування провідних нулів (Google Sheets іноді зрізає "0")
    var zc = stripZeros(code);
    if (zc) {
      var zexact = items.filter(function (it) {
        return skuFields.some(function (f) {
          return it && it[f] != null && stripZeros(asString(it[f])) === zc;
        });
      });
      if (zexact.length === 1) return zexact[0];
      if (zexact.length > 1) return zexact[0];
    }

    var contains = items.filter(function (it) {
      if (!it) return false;
      var hay = [it.sku, it.code, it.article, it.name, it.label, it.title, it.text]
        .map(asString)
        .join(" | ");
      return hay.indexOf(code) !== -1;
    });
    if (contains.length === 1) return contains[0];
    if (items.length === 1) return items[0];
    return null;
  }

  // знайти товар за кодом, стійко до загублених провідних нулів:
  // пробуємо код як є, потім з відновленими "0" попереду
  function getItemByCode(vm, code) {
    var tries = [String(code)];
    var zc = stripZeros(code);
    if (zc === String(code)) { tries.push("0" + code); tries.push("00" + code); } // не було нулів — спробувати додати
    function attempt(i) {
      if (i >= tries.length) return Promise.resolve({ item: null, code: String(code) });
      var c = tries[i];
      return Promise.resolve(vm.getAutocomplete(c)).then(function (items) {
        var it = pickItem(items, c);
        if (it) return { item: it, code: c };
        return attempt(i + 1);
      }, function () { return attempt(i + 1); });
    }
    return attempt(0);
  }

  function safeApply(scope, fn) {
    var root = scope.$root || scope;
    if (root.$$phase || scope.$$phase) {
      fn();
    } else {
      scope.$apply(fn);
    }
  }

  function setResult(ok, reason) {
    document.documentElement.setAttribute(
      "data-sd-upsell-result",
      ok ? "ok" : "fail"
    );
    window.dispatchEvent(new Event("sdUpsellAddResult"));
    log(ok ? "додано ✓" : "не вдалось ✗", reason || "");
  }

  // find a button by its exact ng-click expression (whitespace-insensitive)
  function findBtnByClick(exact) {
    var bs = document.querySelectorAll("button[ng-click], a[ng-click]");
    for (var i = 0; i < bs.length; i++) {
      var v = (bs[i].getAttribute("ng-click") || "").replace(/\s+/g, "");
      if (v === exact) return bs[i];
    }
    return null;
  }

  // строгий збіг товару за артикулом (точний або без провідних нулів) — без "контейнс"/"перший-ліпший"
  function _strictPick(items, code) {
    if (!items || !items.length) return null;
    var c = String(code).toLowerCase().trim(), zc = stripZeros(c);
    var fields = ["sku", "SKU", "article", "code", "vendorCode"];
    for (var i = 0; i < items.length; i++) { var it = items[i]; if (!it) continue;
      for (var j = 0; j < fields.length; j++) { var v = it[fields[j]]; if (v != null && String(v).toLowerCase().trim() === c) return it; } }
    if (zc) for (var i2 = 0; i2 < items.length; i2++) { var it2 = items[i2]; if (!it2) continue;
      for (var j2 = 0; j2 < fields.length; j2++) { var v2 = it2[fields[j2]]; if (v2 != null && stripZeros(String(v2).toLowerCase().trim()) === zc) return it2; } }
    return null;
  }

  function _resolveOpenItem(acFn, code) {
    var queries = [String(code)];
    var z = stripZeros(code);
    if (z && z !== String(code)) queries.push(z);
    var counts = [];
    function attempt(i) {
      if (i >= queries.length) { log("sdOpenProduct: точного збігу нема для", code, "| queries:", queries.join(","), "| counts:", counts.join(",")); return Promise.resolve(null); }
      return Promise.resolve(acFn(queries[i])).then(function (items) {
        counts.push((items && items.length) || 0);
        var it = _strictPick(items, code);
        return it || attempt(i + 1);
      }, function () { counts.push("err"); return attempt(i + 1); });
    }
    return attempt(0);
  }

  // резолв внутрішнього id товару напряму з продуктового API SalesDrive
  // (autocomplete не повертає товари-комплекти, тому беремо id з /products/data)
  function _findRowBySku(rows, code) {
    if (!rows || !rows.length) return null;
    var c = String(code).trim();
    for (var i = 0; i < rows.length; i++) { if (rows[i] && String(rows[i].sku).trim() === c) return rows[i]; }
    var zc = stripZeros(c);
    if (zc) for (var k = 0; k < rows.length; k++) { if (rows[k] && stripZeros(String(rows[k].sku).trim()) === zc) return rows[k]; }
    return null;
  }
  function _resolveIdViaApi(code) {
    var url = "/products/data/?active=1&filter[sku]=" + encodeURIComponent(code) + "&formId=1";
    // заголовок "when" обовʼязковий — інакше СРМ віддає 200, але порожній список
    return fetch(url, { credentials: "include", headers: { "accept": "application/json, text/plain, */*", "when": "product/index" } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) {
        try {
          // товари лежать у response.meta.option.option[]
          var rows = j && j.response && j.response.meta && j.response.meta.option && j.response.meta.option.option;
          var row = _findRowBySku(rows || [], code);
          return row && row.id != null ? row.id : null;
        } catch (e) { return null; }
      })
      .catch(function () { return null; });
  }

  window.addEventListener("sdOpenProduct", function () {
    var code = document.documentElement.getAttribute("data-sd-open-sku");
    if (!code) return;
    var got = getVMcached();
    if (!got || !got.vm) { log("sdOpenProduct: no viewModel"); return; }
    var vm = got.vm, scope = got.scope;
    var showItemFn = (vm && typeof vm.showItem === "function") ? vm.showItem.bind(vm)
      : (scope && typeof scope.showItem === "function") ? scope.showItem.bind(scope) : null;
    if (!showItemFn) { log("sdOpenProduct: showItem недоступний"); return; }
    _resolveIdViaApi(code).then(function (pid) {
      if (pid == null) { log("sdOpenProduct: id не знайдено для", code); return; }
      var fakeEvt = { preventDefault: function () {}, stopPropagation: function () {} };
      try { safeApply(scope, function () { showItemFn(pid, fakeEvt); }); }
      catch (e) { log("sdOpenProduct showItem err", e); }
    });
  });

  window.addEventListener("sdUpsellAdd", function () {
    var code = document.documentElement.getAttribute("data-sd-upsell-code");
    if (!code) return setResult(false, "no-code");

    // режим додавання: 'regular' → звичайний товар (аналог), інакше → допродаж (банер).
    // Атрибут знімаємо ОДРАЗУ, щоб він не «протік» на наступний виклик.
    var asRegular = document.documentElement.getAttribute("data-sd-upsell-mode") === "regular";
    document.documentElement.removeAttribute("data-sd-upsell-mode");

    var got = getVMcached();
    if (!got || !got.vm) return setResult(false, "no-viewModel");

    var vm = got.vm,
      scope = got.scope;
    dbg("preSale=", vm.preSale, "| hasAddOption=", typeof vm.addOption);

    if (
      typeof vm.getAutocomplete !== "function" ||
      typeof vm.addItemChangeAutoComplete !== "function"
    ) {
      return setResult(false, "no-method");
    }

    try {
      getItemByCode(vm, code).then(
        function (res) {
          var item = res.item;
          if (!item) return setResult(false, "no-item-match");
          var label =
            typeof vm.showAutocompleteItem === "function"
              ? vm.showAutocompleteItem(item)
              : "";

          function pidOf(o) {
            if (!o) return "";
            return String(o.productId != null ? o.productId
              : (o.id != null ? o.id : (o.value != null ? o.value : "")));
          }
          var ourPid = pidOf(item);

          // Rozetka-заявка: ціна супутнього має бути ROZETKA (зі знижкою), а не базова.
          // Підміняємо ДО додавання, щоб рядок одразу створився з правильною ціною.
          var rozPrice = null;
          try {
            if (isRozetkaOrder(vm)) {
              rozPrice = rozetkaPriceOf(priceSource(item));
              if (rozPrice != null) {
                item.defaultPrice = rozPrice;
                if (item.price != null) item.price = rozPrice.toFixed(2).replace(".", ",");
              }
            }
          } catch (e) {}
          // підстрахування: проставити ROZETKA-ціну й перерахувати суму на доданому рядку
          function fixRozPrice(newItem) {
            if (rozPrice == null || !newItem) return;
            try {
              var s = rozPrice.toFixed(2).replace(".", ",");
              newItem.defaultPrice = rozPrice;
              newItem.price = s;
              newItem.newDefaultPrice = s;
              if (typeof vm.itemChange === "function") vm.itemChange(newItem, newItem.index);
              else if (typeof vm.updateItems === "function") vm.updateItems();
            } catch (e) {
              try { if (typeof vm.updateItems === "function") vm.updateItems(); } catch (e2) {}
            }
          }

          // "розігріваємо" рядок додавання (у відкритій заявці він холодний)
          try { var inp = findInput(); if (inp) inp.focus(); } catch (e) {}

          // одна спроба додати супутній; true — якщо зʼявився новий рядок
          function attemptAdd() {
            var added = false;
            try {
              safeApply(scope, function () {
                // якщо в рядку додавання лежить САМЕ наш товар (залишок з минулої спроби) —
                // просто фіксуємо його як допродаж, БЕЗ повторного додавання (захист від задвоєння)
                if (vm.addAttribute && ourPid && pidOf(vm.addAttribute) === ourPid) {
                  var b0 = (vm.items || []).length;
                  vm.addOption(!asRegular);
                  var a0 = (vm.items || []).length;
                  if (a0 > b0) { vm.items[a0 - 1].preSale = asRegular ? 0 : 1; fixRozPrice(vm.items[a0 - 1]); added = true; return; }
                  try { vm.addAttribute = {}; } catch (e) {} // не зафіксувати "хвіст" нижче
                }
                // якщо лежить ІНШИЙ товар (якір із пошуку) — зафіксувати його нормально
                if (vm.addAttribute && vm.addAttribute.productId) vm.addOption();

                var before = (vm.items || []).length;
                vm.addItemChangeAutoComplete(item, item, label);
                if (!vm.addAttribute || !vm.addAttribute.productId) vm.addAttribute = item;
                vm.addOption(!asRegular);
                var after = (vm.items || []).length;
                if (after > before) { vm.items[after - 1].preSale = asRegular ? 0 : 1; fixRozPrice(vm.items[after - 1]); added = true; }
              });
            } catch (e) {}
            return added;
          }

          // після успішного додавання — прибрати порожній рядок-редактор, який лишається
          // від «розігріву» (фокус + autocomplete). Для ВСІХ шляхів додавання:
          // і аналог, і жовтий банер допродажу (обидва йдуть через цей обробник).
          function cleanupAddRow() {
            setTimeout(function () {
              try {
                safeApply(scope, function () {
                  try { vm.addAttribute = {}; } catch (e) {}
                  try { if ("newName" in vm) vm.newName = ""; } catch (e) {}
                });
                var inp = findInput();
                if (inp) { try { inp.value = ""; inp.blur(); } catch (e) {} }
              } catch (e) {}
            }, 30);
          }
          function ok(reason) { cleanupAddRow(); return setResult(true, reason); }

          // перша спроба одразу; якщо холодний рядок не додав — ще кілька спроб із паузою,
          // щоб користувачу вистачало ОДНОГО кліку (розігрів робимо самі)
          if (attemptAdd()) return ok("ok-1");
          var tries = [90, 200, 350];
          (function next(i) {
            if (i >= tries.length) {
              try {
                var methods = [];
                for (var k in vm) { try { if (typeof vm[k] === "function" && /add|item|option|product|preSale/i.test(k)) methods.push(k); } catch (e) {} }
                log("ДОПРОДАЖ не додав після кількох спроб. Скинь це Клоду:",
                  "| addAttribute:", safeDump(vm.addAttribute),
                  "| товарів:", (vm.items || []).length,
                  "| методи:", methods.join(", "));
              } catch (e) {}
              return setResult(false, "not-added");
            }
            setTimeout(function () {
              if (attemptAdd()) return ok("ok-" + (i + 2));
              next(i + 1);
            }, tries[i]);
          })(0);
        },
        function (err) {
          setResult(false, "autocomplete-rejected: " + err);
        }
      );
    } catch (e) {
      setResult(false, "getAutocomplete-threw: " + e);
    }
  });

  // ---------- ЗАЛИШКИ супутніх товарів ----------
  function toNum(v) {
    if (typeof v === "number") return v;
    if (typeof v === "string") {
      var n = parseFloat(v.replace(/\s/g, "").replace(",", "."));
      return isNaN(n) ? null : n;
    }
    return null;
  }

  // чи схожа назва поля на "залишок"
  function looksLikeStockKey(k) {
    return /(balance|stock|rest|remain|ostat|quant|qty|amount|count|nalich|availab|sklad|залиш|склад|наявн|остат|кільк)/i.test(k || "");
  }
  function keyScore(k) {
    k = (k || "").toLowerCase();
    if (/balance/.test(k)) return 6;
    if (/(rest|remain|ostat|остат|залиш)/.test(k)) return 5;
    if (/(quant|кільк|count|amount)/.test(k)) return 4;
    if (/(qty|nalich|наявн|availab)/.test(k)) return 3;
    if (/(stock|sklad|склад)/.test(k)) return 2;
    return 1;
  }
  function sumNumeric(v) {
    var n = toNum(v);
    if (n != null) return n;
    if (Array.isArray(v)) {
      var s = 0, f = false;
      for (var i = 0; i < v.length; i++) {
        var x = v[i];
        var xn = (x && typeof x === "object")
          ? toNum(x.balance != null ? x.balance : (x.quantity != null ? x.quantity : (x.rest != null ? x.rest : (x.count != null ? x.count : x.value))))
          : toNum(x);
        if (xn != null) { s += xn; f = true; }
      }
      return f ? s : null;
    }
    if (v && typeof v === "object") {
      var s2 = 0, f2 = false;
      for (var k in v) { var kn = toNum(v[k]); if (kn != null) { s2 += kn; f2 = true; } }
      return f2 ? s2 : null;
    }
    return null;
  }

  // рекурсивно шукаємо в обʼєкті товару поле, схоже на "залишок", із числом
  function findStock(it) {
    if (!it || typeof it !== "object") return { qty: null };
    var best = null, seen = [];
    function walk(o, path, depth) {
      if (o == null || typeof o !== "object" || depth > 4) return;
      if (seen.indexOf(o) !== -1) return; seen.push(o);
      for (var k in o) {
        var v; try { v = o[k]; } catch (e) { continue; }
        if (typeof v === "function") continue;
        var p = path ? path + "." + k : k;
        if (looksLikeStockKey(k)) {
          var n = sumNumeric(v);
          if (n != null) {
            var composite = (v && typeof v === "object"); // масив/обʼєкт складів — це вже сума
            var sc = keyScore(k) - depth * 0.1 + (composite ? 0.5 : 0);
            if (!best || sc > best.score) best = { qty: n, field: p, score: sc };
            if (composite) continue; // не спускатися всередину складів — сума вже врахована
          }
        }
        if (v && typeof v === "object") walk(v, p, depth + 1);
      }
    }
    walk(it, "", 0);
    return best || { qty: null };
  }

  // безпечний дамп товару (для діагностики, з обмеженням глибини/розміру)
  function safeDump(o, maxDepth) {
    maxDepth = maxDepth == null ? 3 : maxDepth;
    var seen = [];
    function rec(v, d) {
      if (v == null) return v;
      var t = typeof v;
      if (t === "number" || t === "boolean") return v;
      if (t === "string") return v.length > 40 ? v.slice(0, 40) + "…" : v;
      if (t === "function") return undefined;
      if (t === "object") {
        if (seen.indexOf(v) !== -1) return "[cyc]";
        if (d >= maxDepth) return Array.isArray(v) ? "[array:" + v.length + "]" : "[object]";
        seen.push(v);
        if (Array.isArray(v)) return v.slice(0, 5).map(function (x) { return rec(x, d + 1); });
        var out = {}, c = 0;
        for (var k in v) {
          if (c >= 30) break;
          var val; try { val = v[k]; } catch (e) { continue; }
          if (typeof val === "function") continue;
          out[k] = rec(val, d + 1); c++;
        }
        return out;
      }
      return undefined;
    }
    try { return rec(o, 0); } catch (e) { return { dumpError: String(e) }; }
  }

  // короткий кеш залишку/фото за кодом (щоб не смикати SalesDrive при перемальовуванні)
  var stockCache = {};
  var STOCK_TTL = 30000;

  window.addEventListener("sdUpsellStock", function () {
    var token = document.documentElement.getAttribute("data-sd-stock-token");
    var codes = [];
    try { codes = JSON.parse(document.documentElement.getAttribute("data-sd-stock-codes")) || []; } catch (e) {}

    function respond(results) {
      document.documentElement.setAttribute(
        "data-sd-stock-result",
        JSON.stringify({ token: token, results: results })
      );
      window.dispatchEvent(new Event("sdUpsellStockResult"));
    }

    var got = getVMcached();
    if (!got || !got.vm || typeof got.vm.getAutocomplete !== "function") {
      return respond(codes.map(function (c) { return { code: c, found: false, qty: null }; }));
    }
    var vm = got.vm, now = Date.now();
    var roz = isRozetkaOrder(vm);

    Promise.all(codes.map(function (code) {
      var ck = code + (roz ? "#r" : "#n");      // ціна залежить від джерела заявки
      var cached = stockCache[ck];
      if (cached && now - cached.t < STOCK_TTL) return Promise.resolve(cached.r);
      return getItemByCode(vm, code).then(function (res) {
        var r, it = res.item;
        if (!it) {
          r = { code: code, found: false, qty: null, img: getCachedImg(code) || null };
        } else {
          var st = findStock(it);
          var img = findImageUrl(it) || getCachedImg(code) || buildFromTemplate(it) || null;
          r = { code: code, found: true, qty: st.qty, field: st.field || null, img: img,
                price: companionPrice(roz, it) };
        }
        stockCache[ck] = { t: Date.now(), r: r };
        return r;
      }).catch(function (e) {
        return { code: code, found: false, qty: null, err: String(e) };
      });
    })).then(respond).catch(function () {
      respond(codes.map(function (c) { return { code: c, found: false, qty: null }; }));
    });
  });

  // ---------- «РАЗОМ ДЕШЕВШЕ»: прибрати NEW PRODUCT і перерахувати ціни ----------
  // Маркетплейс кладе в заявку службові рядки NEW PRODUCT: один із ціною акції
  // («Разом дешевше», напр. 749), другий DISCOUNT зі знижкою на суму товарів.
  // Кнопка модуля lkBundleFix шле подію sdBundleFix: тут видаляємо службові рядки
  // і пропорційно масштабуємо ціни справжніх товарів так, щоб разом = ціна акції
  // (останній рядок добирає копійки — сума сходиться до копійки).
  window.addEventListener("sdBundleFix", function () {
    var token = document.documentElement.getAttribute("data-sd-bundle-token") || "";
    function respond(o) {
      o.token = token;
      document.documentElement.setAttribute("data-sd-bundle-result", JSON.stringify(o));
      window.dispatchEvent(new Event("sdBundleFixResult"));
    }
    var got = getVMcached();
    if (!got || !got.vm) return respond({ ok: false, err: "no-viewModel" });
    var vm = got.vm, scope = got.scope, items = vm.items || [];

    function num(v) {
      var n = parseFloat(String(v == null ? "" : v).replace(/\s/g, "").replace(",", "."));
      return isNaN(n) ? 0 : n;
    }
    function qtyOf(x) {
      var q = num(x.count != null ? x.count : (x.amount != null ? x.amount : x.quantity));
      return q > 0 ? q : 1;
    }
    function isNP(x) {
      return /new\s*product/i.test(String((x && (x.name || x.documentName)) || ""));
    }

    var pseudo = items.filter(isNP);
    if (!pseudo.length) return respond({ ok: false, err: "NEW PRODUCT не знайдено" });

    // ціль = ТІЛЬКИ рядок акції («Разом/Вместе дешевле»), БЕЗ DISCOUNT-рядка:
    // маркетплейс інколи кладе в DISCOUNT теж додатню ціну (напр., 8,00) — її не рахуємо
    function hasDiscountStr(o) {
      try {
        for (var k in o) {
          if (typeof o[k] === "string" && /discount/i.test(o[k])) return true;
        }
      } catch (e) {}
      return false;
    }
    function isDiscountRow(x) {
      return hasDiscountStr(x) || (x && x.product && hasDiscountStr(x.product));
    }

    // ціль = НАЙБІЛЬШИЙ не-DISCOUNT рядок NEW PRODUCT (НЕ сума всіх!):
    // рядок акції завжди несе повну суму замовлення (749; 412), а DISCOUNT-довісок —
    // меншу (0; 8), тож максимум дає правильну ціль незалежно від формату полів
    var target = 0;
    pseudo.forEach(function (x) {
      if (isDiscountRow(x)) return;
      var p = num(x.price) * qtyOf(x);
      if (p > target) target = p;
    });
    // фолбек: якщо не-DISCOUNT рядків із ціною не знайшлось — максимум серед усіх
    if (!(target > 0)) {
      pseudo.forEach(function (x) { var p = num(x.price) * qtyOf(x); if (p > target) target = p; });
    }
    target = Math.round(target * 100) / 100;
    if (!(target > 0)) return respond({ ok: false, err: "у NEW PRODUCT нема ціни «Разом дешевше»" });

    var real = items.filter(function (x) { return !isNP(x); });
    if (!real.length) return respond({ ok: false, err: "нема звичайних товарів" });
    var base = 0;
    real.forEach(function (x) { base += num(x.price) * qtyOf(x); });
    if (!(base > 0)) return respond({ ok: false, err: "сума товарів = 0" });

    // планування нових цін ДО застосування (щоб відмовитись цілком, якщо щось не сходиться)
    var plan = [], acc = 0, i, x, q, p;
    for (i = 0; i < real.length; i++) {
      x = real[i]; q = qtyOf(x);
      if (i < real.length - 1) { p = Math.round(num(x.price) * target / base * 100) / 100; acc += p * q; }
      else { p = Math.round((target - acc) / q * 100) / 100; }
      if (!(p > 0)) return respond({ ok: false, err: "нова ціна ≤ 0 — не застосовую" });
      plan.push(p);
    }

    // Видалення НАСАМПЕРЕД через штатну кнопку ⊗ рядка: тоді SalesDrive сам
    // перераховує оплату/післяплату/оголошену вартість (важливо для ТТН Укрпошти).
    // Фолбек — splice, якщо кнопки не знайшлися.
    function npDeleteButtons() {
      var out = [], trs = document.querySelectorAll("tr");
      for (var i = 0; i < trs.length; i++) {
        var tr = trs[i];
        if (!/NEW\s*PRODUCT/i.test(tr.textContent || "")) continue;
        if (tr.querySelector("tr")) continue;   // беремо найглибший tr, не батьківські
        var del = tr.querySelector('[ng-click*="elete"],[ng-click*="emove"]');
        if (del) out.push(del);
      }
      return out;
    }

    function applyPrices() {
      safeApply(scope, function () {
        for (var k = 0; k < real.length; k++) {
          var s = plan[k].toFixed(2).replace(".", ",");
          real[k].defaultPrice = plan[k];
          real[k].price = s;
          real[k].newDefaultPrice = s;
        }
        if (typeof vm.itemChange === "function") {
          real.forEach(function (r, idx) {
            try { vm.itemChange(r, r.index != null ? r.index : idx); } catch (e) {}
          });
        }
        try { if (typeof vm.updateItems === "function") vm.updateItems(); } catch (e) {}
      });
    }

    function npCountVM() { return (vm.items || []).filter(isNP).length; }

    // якщо після кліку ⊗ SalesDrive показує модалку підтвердження — тиснемо «Так» самі
    function autoConfirm() {
      try {
        var btns = document.querySelectorAll('.modal button, .modal a.btn, .sweet-alert button, .swal2-container button, .bootbox button');
        for (var i = 0; i < btns.length; i++) {
          var b = btns[i];
          if (!b.offsetParent) continue;                    // невидима кнопка
          var t = (b.textContent || "").trim();
          if (/^(так|да|видалити|удалить|ok|yes|підтвердити|подтвердить)$/i.test(t)) { b.click(); return true; }
        }
      } catch (e) {}
      return false;
    }

    // фінал: (добити splice-ом, якщо щось лишилось) → ціни → контроль суми → звіт
    function finishApply(warn) {
      try {
        if (npCountVM() > 0) {
          safeApply(scope, function () {
            for (var j = (vm.items || []).length - 1; j >= 0; j--) if (isNP(vm.items[j])) vm.items.splice(j, 1);
          });
        }
        applyPrices();
        var sum = 0;
        (vm.items || []).forEach(function (x) { if (!isNP(x)) sum += num(x.price) * qtyOf(x); });
        sum = Math.round(sum * 100) / 100;
        var out = { ok: true, target: target, sum: sum, removed: pseudo.length,
                    method: native ? "native" : "splice", warn: warn || null,
                    diag: { base: base, plan: plan } };
        try { console.log("[SD-РазомДешевше]", JSON.stringify(out)); } catch (e) {}
        respond(out);
      } catch (e) { respond({ ok: false, err: String(e) }); }
    }

    var dels = npDeleteButtons();
    var native = dels.length === pseudo.length;   // кнопки знайдено для КОЖНОГО рядка
    try {
      if (!native) { finishApply(); }
      else {
        dels.forEach(function (d) { try { d.click(); } catch (e) {} });
        // ціни застосовуємо ЛИШЕ коли рядки СПРАВДІ зникли з vm.items
        // (а не за фіксовану паузу — модалка могла тримати видалення)
        var t0 = Date.now();
        (function waitGone() {
          autoConfirm();
          if (npCountVM() === 0) return finishApply();
          if (Date.now() - t0 > 12000)
            return finishApply("рядки не видалились штатно — прибрав напряму; перевір суми уважно");
          setTimeout(waitGone, 200);
        })();
      }
    } catch (e) {
      respond({ ok: false, err: String(e) });
    }
  });

  // ---------- ПІДСТАНОВКА СУМИ КОМПЛЕКТУ В ЦІНУ ТОВАРУ ----------
  // Чипи модуля lkComplectPrice («Великий опт 251 ₴» тощо) шлють подію sdSetPrice:
  // пишемо суму в потрібний тип ціни картки товару. Якщо такого рядка ще немає —
  // додаємо його штатною кнопкою vm.addProductPrice() і заповнюємо.
  // НІЧОГО не зберігаємо: значення лягає у форму, менеджер тисне «Зберегти» сам.
  window.addEventListener("sdSetPrice", function () {
    var req = {};
    try { req = JSON.parse(document.documentElement.getAttribute("data-sd-setprice") || "{}") || {}; } catch (e) {}
    function respond(o) {
      o.token = req.token || "";
      document.documentElement.setAttribute("data-sd-setprice-result", JSON.stringify(o));
      window.dispatchEvent(new Event("sdSetPriceResult"));
    }
    function money(n) { return (Math.round(Number(n) * 100) / 100).toFixed(2).replace(".", ","); }
    try {
      var val = Number(req.value);
      if (!(val > 0)) return respond({ ok: false, err: "порожня сума" });

      // scope картки товару (там, де поле роздрібної ціни)
      var el = document.querySelector('[ng-model="viewModel.item.defaultPrice"]');
      var sc = el && window.angular ? window.angular.element(el).scope() : null;
      var vm = sc && (sc.viewModel || sc.vm);
      if (!vm || !vm.item) return respond({ ok: false, err: "картка товару не знайдена" });

      var created = false, name = "", eff = 0;
      safeApply(sc, function () {
        if (String(req.tier) === "retail") {
          vm.item.defaultPrice = money(val);
          name = "Роздрібна";
          return;
        }
        var list = vm.item.priceTypes;
        if (!Array.isArray(list)) list = vm.item.priceTypes = [];
        var row = null;
        for (var i = 0; i < list.length; i++)
          if (String(list[i].priceTypeId) === String(req.tier)) { row = list[i]; break; }
        if (!row) {
          if (typeof vm.addProductPrice === "function") vm.addProductPrice();
          list = vm.item.priceTypes || [];
          row = list[list.length - 1];
          if (!row) { row = { priceTypeId: String(req.tier) }; list.push(row); }
          row.priceTypeId = String(req.tier);
          if (row.currencyId == null) row.currencyId = 0;
          created = true;
        }
        row.price = money(val);
        row.defaultPrice = Math.round(val * 100) / 100;
        // знижку рядка НЕ чіпаємо (може бути виставлена свідомо), але повідомимо про неї
        var d = parseFloat(String(row.discount == null ? "" : row.discount).replace(",", ".")) || 0;
        var pd = Number(row.percentDiscount) || 0;
        eff = pd > 0 ? Math.round(val * (1 - pd / 100) * 100) / 100 : (d > 0 ? Math.round((val - d) * 100) / 100 : 0);
        try { name = ((vm.meta || {}).priceTypes || {})[String(req.tier)] || ("тип " + req.tier); } catch (e2) {}
      });
      respond({ ok: true, created: created, name: name, value: money(val), eff: eff });
    } catch (e) {
      respond({ ok: false, err: String(e) });
    }
  });

  // ---------- ОПТ-ЦІНИ З ПРИХІДНОЇ НАКЛАДНОЇ ----------
  // Кнопка модуля lkArrivalOpt шле подію sdArrivalOpt: для кожного рядка накладної
  // беремо собівартість (ціну закупки рядка) і пишемо в картку товару ціни
  // Великий опт (pt2) = ×1.2 (до цілого), середній опт (pt5) = ×1.25 (до цілого),
  // майстри (pt7) = ×1.3 (вгору до кратного 5) — правила Василя.
  // Запис — тим самим PUT /products/{id}/, що й сама СРМ (звірено з реальним
  // запитом при збереженні картки товару; CSRF — через Angular CsrfService).
  window.addEventListener("sdArrivalOpt", function () {
    var token = document.documentElement.getAttribute("data-sd-arropt-token") || "";
    // 'preview' — лише прочитати й порахувати (НІЧОГО не пише); 'apply' — записати
    var mode = document.documentElement.getAttribute("data-sd-arropt-mode") || "preview";
    function respond(o) {
      o.token = token; o.mode = mode;
      document.documentElement.setAttribute("data-sd-arropt-result", JSON.stringify(o));
      window.dispatchEvent(new Event("sdArrivalOptResult"));
    }
    function num(v) { var n = parseFloat(String(v == null ? "" : v).replace(/\s/g, "").replace(",", ".")); return isNaN(n) ? 0 : n; }
    function money(n) { n = Math.round(Number(n) * 100) / 100; return n.toFixed(2).replace(".", ","); }

    // viewModel прихідної накладної
    var vm = null;
    try {
      var els = document.querySelectorAll("[ng-click]");
      for (var i = 0; i < els.length; i++) {
        try {
          var s = window.angular.element(els[i]).scope();
          while (s && !s.viewModel) s = s.$parent;
          if (s && s.viewModel && s.viewModel.item && s.viewModel.item.documentItems) { vm = s.viewModel; break; }
        } catch (e) {}
      }
    } catch (e) {}
    if (!vm) return respond({ ok: false, err: "накладну не знайдено (viewModel)" });

    function csrfHead() {
      var host = document.querySelector("[ng-app],[data-ng-app]") || document.querySelector(".ng-scope") || document.body;
      var inj = window.angular.element(host).injector() || window.angular.element(document.documentElement).injector();
      var cs = inj.get("CsrfService");
      var H = { "Content-Type": "application/json;charset=utf-8", "Accept": "application/json" };
      H[cs.getHeaderKey()] = cs.getCsrfToken();
      return H;
    }

    // GET-item → форма, яку СРМ реально шле у PUT (звірено з перехопленим запитом)
    function toPut(it) {
      var o = JSON.parse(JSON.stringify(it));
      delete o.restCount;
      o.balances = Array.isArray(o.balances) ? o.balances : [];
      if (o.price == null) o.price = "";
      if (o.volume == null) o.volume = "";
      else if (typeof o.volume === "number") o.volume = String(o.volume);
      if (typeof o.discount === "number") o.discount = money(o.discount);
      (o.priceTypes || []).forEach(function (p) {
        p.priceTypeId = String(p.priceTypeId);
        p.price = money(p.price);
        if (typeof p.discount === "number") p.discount = money(p.discount);
      });
      return o;
    }

    // правила опту (lartek): 1.2 / 1.25 / 1.3-вгору-до-5
    function tiers(b) {
      return {
        p2: Math.round(b * 1.2),
        p5: Math.round(b * 1.25),
        p7: Math.ceil((b * 1.3 - 1) / 5) * 5
      };
    }

    // ВАЛЮТА накладної: ціна рядка може бути в €/$ — собівартість у грн = ціна × курс
    // (vm.item.currencyRate; для гривневої накладної курсу нема → 1)
    var rate = num(vm.item.currencyRate) || 1;
    var items = (vm.item.documentItems || []).map(function (di) {
      return {
        pid: di.productId,
        base: Math.round(num(di.price) * rate * 100) / 100,
        name: String((di.product && (di.product.nameTranslate || di.product.name)) || di.productNewName || "").slice(0, 60),
        sku: String((di.product && di.product.sku) || "")
      };
    }).filter(function (x) { return x.pid; });
    if (!items.length) return respond({ ok: false, err: "у накладній нема товарів" });

    function ptOf(item, id) {
      var v = null;
      (item.priceTypes || []).forEach(function (p) { if (Number(p.priceTypeId) === id) v = num(p.price); });
      return v;   // null = типу ціни в картці немає
    }

    // товари БЕЗ галочки (pid-и), які при записі треба пропустити
    var skip = {};
    try {
      var rawSkip = document.documentElement.getAttribute("data-sd-arropt-skip");
      document.documentElement.removeAttribute("data-sd-arropt-skip");
      (JSON.parse(rawSkip || "[]") || []).forEach(function (p) { skip[String(p)] = 1; });
    } catch (e) {}

    var results = [], idx = 0;
    function progress() {
      document.documentElement.setAttribute("data-sd-arropt-progress", idx + "/" + items.length);
      window.dispatchEvent(new Event("sdArrivalOptProgress"));
    }
    function step() {
      progress();
      if (idx >= items.length) return respond({ ok: true, rate: rate, rows: results });
      var x = items[idx++];
      if (mode === "apply" && skip[String(x.pid)]) {
        results.push({ pid: x.pid, sku: x.sku || String(x.pid), name: x.name, base: x.base, skipped: true });
        return step();
      }
      if (!(x.base > 0)) { results.push({ sku: x.sku, name: x.name, err: "ціна закупки порожня" }); return step(); }
      var t = tiers(x.base);
      fetch("/products/" + x.pid + "/?formId=1", { credentials: "include", headers: { "Accept": "application/json" } })
        .then(function (r) { return r.json(); })
        .then(function (j) {
          var item = j.response && j.response.item;
          if (!item) throw new Error("картка товару недоступна");
          var row = { pid: x.pid, sku: x.sku || String(x.pid), name: x.name, base: x.base,
                      o2: ptOf(item, 2), o5: ptOf(item, 5), o7: ptOf(item, 7),
                      p2: t.p2, p5: t.p5, p7: t.p7 };
          if (mode !== "apply") { results.push(row); return; }   // preview: тільки читаємо

          var o = toPut(item), created = [];
          [[2, t.p2], [5, t.p5], [7, t.p7]].forEach(function (pair) {
            var pr = null;
            (o.priceTypes || []).forEach(function (p) { if (Number(p.priceTypeId) === pair[0]) pr = p; });
            if (pr) { pr.price = money(pair[1]); pr.defaultPrice = pair[1]; }
            else {
              // типу ціни в картці нема — створюємо рядок (без id, як робить сама СРМ для нових)
              if (!o.priceTypes) o.priceTypes = [];
              o.priceTypes.push({ productId: o.id, priceTypeId: String(pair[0]), price: money(pair[1]),
                                  currencyId: 0, discount: "0,00", percentDiscount: 0, defaultPrice: pair[1] });
              created.push(pair[0]);
            }
          });
          return fetch("/products/" + o.id + "/?formId=" + o.formId,
            { method: "PUT", credentials: "include", headers: csrfHead(), body: JSON.stringify(o) })
            .then(function (pr) {
              if (pr.status !== 200) throw new Error("HTTP " + pr.status);
              row.created = created;
              results.push(row);
            });
        })
        .catch(function (e) {
          results.push({ pid: x.pid, sku: x.sku || String(x.pid), name: x.name, base: x.base, err: String((e && e.message) || e) });
        })
        .then(function () { setTimeout(step, mode === "apply" ? 250 : 120); });   // не гатимо сервер
    }
    step();
  });

  // ---------- КОМІСІЯ ROZETKA для дописаних товарів ----------
  // У Rozetka-замовленні комісія лежить у полі рядка як ВІДСОТОК (commission=14.04,
  // percentCommission=1; у полі редагування — «14,04%»). Товари, які менеджер додає
  // руками, приходять із нульовою комісією → підсумок комісії занижується.
  // Обробник бере відсоток із рядків, що приїхали з Rozetka, і проставляє його
  // рядкам без комісії — штатним шляхом (editComment → newCommission → updateComment),
  // інакше «Зберегти» не зафіксує зміну.
  window.addEventListener("sdRozCommission", function () {
    var token = document.documentElement.getAttribute("data-sd-rozcomm-token") || "";
    function respond(o) {
      o.token = token;
      document.documentElement.setAttribute("data-sd-rozcomm-result", JSON.stringify(o));
      window.dispatchEvent(new Event("sdRozCommissionResult"));
    }
    function num(v) { var n = parseFloat(String(v == null ? "" : v).replace(/\s|%/g, "").replace(",", ".")); return isNaN(n) ? 0 : n; }

    var got = getVMcached();
    if (!got || !got.vm) return respond({ ok: false, err: "no-viewModel" });
    var vm = got.vm, scope = got.scope, items = vm.items || [];
    if (!isRozetkaOrder(vm)) return respond({ ok: false, err: "не Rozetka" });
    if (!items.length) return respond({ ok: false, err: "нема товарів" });

    // еталонний відсоток: найчастіший ненульовий серед рядків із відсотковою комісією
    var counts = {}, ref = 0;
    items.forEach(function (x) {
      var c = num(x.commission);
      if (c > 0 && Number(x.percentCommission) === 1) counts[c] = (counts[c] || 0) + 1;
    });
    Object.keys(counts).forEach(function (c) {
      if (!ref || counts[c] > counts[ref] || (counts[c] === counts[ref] && Number(c) > ref)) ref = Number(c);
    });
    // якщо жодного оригінального рядка з комісією немає (усе дописано вручну) —
    // беремо запасний відсоток 19,44% (домовленість Василя)
    var fallback = false;
    if (!(ref > 0)) { ref = 19.44; fallback = true; }

    var targets = items.filter(function (x) { return !(num(x.commission) > 0); });
    if (!targets.length) return respond({ ok: true, none: true, ref: ref, fallback: fallback });

    var txt = String(ref).replace(".", ",") + "%";
    var done = [];
    try {
      var fakeEvt = { preventDefault: function () {}, stopPropagation: function () {} };
      safeApply(scope, function () {
        targets.forEach(function (it) {
          try {
            if (typeof vm.editComment === "function" && typeof vm.updateComment === "function") {
              vm.editComment(it, it.index, fakeEvt);
              it.percentCommission = 1;
              it.newCommission = txt;
              vm.updateComment(it, it.index);
            } else {
              it.commission = ref; it.percentCommission = 1;
            }
            done.push(String(it.name || it.documentName || "").slice(0, 40));
          } catch (e) {}
        });
        try { if (typeof vm.updateItems === "function") vm.updateItems(); } catch (e) {}
      });
      respond({ ok: true, ref: ref, n: done.length, names: done, fallback: fallback });
    } catch (e) {
      respond({ ok: false, err: String(e) });
    }
  });

  // ---------- ПЕРЕРАХУНОК ЦІН ЗАЯВКИ ЗА ТИПОМ ЦІНИ (опт/майстри/роздріб) ----------
  // Кнопка модуля lkOrderTier шле подію sdTierPrice: кожному рядку ставимо ціну
  // з його ж прайсу (рядки заявки вже несуть priceTypes — запити не потрібні).
  // mode='list'    — які типи цін узагалі доступні в цій заявці;
  // mode='preview' — що зміниться (нічого не чіпаємо);
  // mode='apply'   — записати ціни у рядки (зберігає менеджер вручну).
  window.addEventListener("sdTierPrice", function () {
    var req = {};
    try { req = JSON.parse(document.documentElement.getAttribute("data-sd-tier") || "{}") || {}; } catch (e) {}
    function respond(o) {
      o.token = req.token || "";
      document.documentElement.setAttribute("data-sd-tier-result", JSON.stringify(o));
      window.dispatchEvent(new Event("sdTierPriceResult"));
    }
    function num(v) { var n = parseFloat(String(v == null ? "" : v).replace(/\s/g, "").replace(",", ".")); return isNaN(n) ? 0 : n; }
    function r2(n) { return Math.round(n * 100) / 100; }
    function qty(x) { var q = num(x.count != null ? x.count : (x.amount != null ? x.amount : x.quantity)); return q > 0 ? q : 1; }
    // ціна типу з урахуванням знижки самого типу ціни
    function tierEff(pt) {
      var base = Number(pt.price != null ? pt.price : pt.defaultPrice);
      if (!isFinite(base)) return null;
      var pd = Number(pt.percentDiscount) || 0, d = Number(pt.discount) || 0;
      var eff = pd > 0 ? base * (1 - pd / 100) : (d > 0 ? base - d : base);
      return r2(eff);
    }
    function tiersOf(it) {
      var src = priceSource(it);
      return (src && Array.isArray(src.priceTypes)) ? src.priceTypes : [];
    }
    function priceForTier(it, tier) {
      if (tier === "retail") {
        var src = priceSource(it);
        var dp = Number(src && (src.defaultPrice != null ? src.defaultPrice : src.price));
        return isFinite(dp) ? r2(dp) : null;
      }
      var list = tiersOf(it);
      for (var i = 0; i < list.length; i++)
        if (normName(list[i].name) === normName(tier)) return tierEff(list[i]);
      return null;
    }

    try {
      var got = getVMcached();
      if (!got || !got.vm) return respond({ ok: false, err: "no-viewModel" });
      var vm = got.vm, scope = got.scope, items = vm.items || [];
      if (!items.length) return respond({ ok: false, err: "нема товарів" });

      // які типи цін доступні (є хоч в одного рядка) + скільки рядків їх мають
      if (req.mode === "list") {
        var seen = {};
        items.forEach(function (it) {
          tiersOf(it).forEach(function (pt) {
            var n = String(pt.name || "").trim(); if (!n) return;
            seen[n] = (seen[n] || 0) + 1;
          });
        });
        return respond({ ok: true, tiers: Object.keys(seen).map(function (n) { return { name: n, n: seen[n] }; }),
                         items: items.length });
      }

      var tier = String(req.tier || "");
      if (!tier) return respond({ ok: false, err: "не вказано тип ціни" });

      var rows = [], oldTotal = 0, newTotal = 0, miss = 0;
      items.forEach(function (it) {
        var cur = r2(num(it.price)), q = qty(it);
        var np = priceForTier(it, tier);
        oldTotal += cur * q;
        if (np == null || !(np > 0)) { miss++; newTotal += cur * q;
          rows.push({ name: String(it.text || it.documentName || it.name || "").slice(0, 40),
                      sku: String(it.sku || ""), old: cur, "new": null }); return; }
        newTotal += np * q;
        rows.push({ name: String(it.text || it.documentName || it.name || "").slice(0, 40),
                    sku: String(it.sku || ""), old: cur, "new": np, same: np === cur });
      });
      oldTotal = r2(oldTotal); newTotal = r2(newTotal);

      if (req.mode !== "apply")
        return respond({ ok: true, mode: "preview", tier: tier, rows: rows, miss: miss,
                         oldTotal: oldTotal, newTotal: newTotal });

      var done = 0;
      var fakeEvt = { preventDefault: function () {}, stopPropagation: function () {} };
      safeApply(scope, function () {
        items.forEach(function (it) {
          try {
            var np = priceForTier(it, tier);
            if (np == null || !(np > 0)) return;
            if (r2(num(it.price)) === np) return;               // уже така ціна
            // ШТАТНИЙ шлях (інакше «Зберегти» не зафіксує зміну)
            if (typeof vm.editComment === "function" && typeof vm.updateComment === "function") {
              vm.editComment(it, it.index, fakeEvt);
              it.newDefaultPrice = String(np.toFixed(2)).replace(".", ",");
              vm.updateComment(it, it.index);
            } else { it.price = np; }
            done++;
          } catch (e) {}
        });
        try { if (typeof vm.updateItems === "function") vm.updateItems(); } catch (e) {}
      });
      respond({ ok: true, mode: "apply", tier: tier, n: done, miss: miss,
                oldTotal: oldTotal, newTotal: newTotal });
    } catch (e) {
      respond({ ok: false, err: String(e) });
    }
  });

  // ---------- ЗАОКРУГЛЕННЯ СУМИ САМОВИВОЗУ (вгору до кратного 10) ----------
  // Кнопка модуля lkRoundPickup шле подію sdRoundPickup: суму заявки доводимо до
  // круглої (99→100, 108→110) корекцією ціни ОДНОГО рядка: беремо рядок із к-тю 1
  // (найдорожчий), інакше — де різниця ділиться на к-ть без копійок, інакше —
  // найдорожчий (можлива похибка в копійки — чесно скажемо).
  window.addEventListener("sdRoundPickup", function () {
    var token = document.documentElement.getAttribute("data-sd-round-token") || "";
    function respond(o) {
      o.token = token;
      document.documentElement.setAttribute("data-sd-round-result", JSON.stringify(o));
      window.dispatchEvent(new Event("sdRoundPickupResult"));
    }
    function num(v) { var n = parseFloat(String(v == null ? "" : v).replace(/\s/g, "").replace(",", ".")); return isNaN(n) ? 0 : n; }
    function r2(n) { return Math.round(n * 100) / 100; }
    function qty(x) { var q = num(x.count != null ? x.count : (x.amount != null ? x.amount : x.quantity)); return q > 0 ? q : 1; }

    var got = getVMcached();
    if (!got || !got.vm) return respond({ ok: false, err: "no-viewModel" });
    var vm = got.vm, scope = got.scope, items = vm.items || [];
    if (!items.length) return respond({ ok: false, err: "нема товарів" });
    // самовивіз = спосіб доставки 43 (якщо поле є)
    try {
      var sm = vm.order && vm.order.shipping_method;
      if (sm != null && Number(sm) !== 43) return respond({ ok: false, err: "не самовивіз" });
    } catch (e) {}

    var total = 0;
    items.forEach(function (x) { total += num(x.price) * qty(x) - num(x.discount); });
    total = r2(total);

    // режим 'calc' — лише порахувати суму (для меню вибору цілі), нічого не міняти
    var tgtAttr = document.documentElement.getAttribute("data-sd-round-target") || "";
    if (tgtAttr === "calc") return respond({ ok: true, calc: true, total: total });

    // ціль: задана користувачем або (за замовчуванням) вгору до кратного 10
    var target = num(tgtAttr);
    if (!(target > 0)) target = Math.ceil(total / 10) * 10;
    var delta = r2(target - total);   // може бути й відʼємною (заокруглення вниз)
    if (delta === 0) return respond({ ok: true, same: true, total: total });

    // вибір рядка для корекції
    var pick = null, cents = Math.round(delta * 100);
    function best(f) {
      var b = null;
      items.forEach(function (x) { if (f(x) && (!b || num(x.price) > num(b.price))) b = x; });
      return b;
    }
    pick = best(function (x) { return qty(x) === 1; });
    if (!pick) pick = best(function (x) { return cents % qty(x) === 0; });
    if (!pick) pick = best(function () { return true; });
    if (!pick) return respond({ ok: false, err: "нема рядка для корекції" });

    var q = qty(pick), add = r2(delta / q);
    var newPrice = r2(num(pick.price) + add);
    if (!(newPrice > 0)) return respond({ ok: false, err: "нова ціна рядка ≤ 0 — обери більшу ціль" });
    try {
      // ШТАТНИЙ шлях зміни ціни рядка (інакше «Зберегти» не фіксує зміну!):
      // editComment(рядок) → item.newDefaultPrice → updateComment(рядок)
      var fakeEvt = { preventDefault: function () {}, stopPropagation: function () {} };
      safeApply(scope, function () {
        var s = newPrice.toFixed(2).replace(".", ",");
        if (typeof vm.editComment === "function" && typeof vm.updateComment === "function") {
          vm.editComment(pick, pick.index, fakeEvt);
          pick.newDefaultPrice = s;
          vm.updateComment(pick, pick.index);
        } else {
          // фолбек — старий прямий спосіб
          pick.defaultPrice = newPrice;
          pick.price = s;
          pick.newDefaultPrice = s;
          try { if (typeof vm.itemChange === "function") vm.itemChange(pick, pick.index); } catch (e) {}
          try { if (typeof vm.updateItems === "function") vm.updateItems(); } catch (e) {}
        }
      });
      var total2 = 0;
      items.forEach(function (x) { total2 += num(x.price) * qty(x) - num(x.discount); });
      total2 = r2(total2);
      respond({ ok: true, from: total, to: total2, target: target,
                exact: Math.abs(total2 - target) < 0.005,
                row: { name: String(pick.name || pick.documentName || "").slice(0, 50),
                       sku: String(pick.sku || ""), newPrice: newPrice } });
    } catch (e) {
      respond({ ok: false, err: String(e) });
    }
  });

  // ---------- МАЛЕНЬКІ КАРТИНКИ ТОВАРІВ У ВИПАДНОМУ СПИСКУ ----------
  function imgToUrl(s) {
    if (typeof s !== "string") return null;
    s = s.trim();
    if (!s) return null;
    if (/^data:image\//i.test(s)) return s;
    if (/^https?:\/\//i.test(s)) return s;
    if (/^\/\//.test(s)) return location.protocol + s;
    if (/^\//.test(s)) return location.origin + s;
    if (/\.(jpe?g|png|webp|gif|bmp)(\?|$)/i.test(s)) return location.origin + "/" + s.replace(/^\.?\//, "");
    return null;
  }
  function isImgKey(k) {
    return /(image|img|photo|picture|thumb|preview|foto|зобр|картин|фото)/i.test(k || "");
  }
  // шукаємо посилання на фото в обʼєкті товару (поле наперед невідоме)
  function findImageUrl(model) {
    if (!model || typeof model !== "object") return null;
    var seen = [], found = null;
    function pick(v) {
      if (typeof v === "string") return imgToUrl(v);
      if (Array.isArray(v)) {
        for (var i = 0; i < v.length; i++) {
          var x = v[i];
          var s = (typeof x === "string") ? x : (x && (x.url || x.src || x.path || x.image || x.thumb || x.thumbnail || x.preview));
          var u = imgToUrl(s);
          if (u) return u;
        }
      } else if (v && typeof v === "object") {
        return imgToUrl(v.url || v.src || v.path || v.thumb || v.thumbnail || v.preview || v.image);
      }
      return null;
    }
    function walk(o, depth) {
      if (found || o == null || typeof o !== "object" || depth > 3) return;
      if (seen.indexOf(o) !== -1) return; seen.push(o);
      for (var k in o) {
        if (found) return;
        var v; try { v = o[k]; } catch (e) { continue; }
        if (typeof v === "function") continue;
        if (isImgKey(k)) { var u = pick(v); if (u) { found = u; return; } }
        if (v && typeof v === "object") walk(v, depth + 1);
      }
    }
    walk(model, 0);
    return found;
  }
  function imgDebug(model) {
    var out = {}, c = 0, seen = [];
    function consider(prefix, o, depth) {
      if (!o || typeof o !== "object" || depth > 2 || c >= 60) return;
      if (seen.indexOf(o) !== -1) return; seen.push(o);
      for (var k in o) {
        if (c >= 60) break;
        var v; try { v = o[k]; } catch (e) { continue; }
        var key = prefix ? prefix + "." + k : k;
        if (typeof v === "string") {
          var looksUrl = /\.(jpe?g|png|webp|gif|bmp)(\?|$)/i.test(v) || /^(https?:|\/\/|\/)/.test(v);
          var keyHint = /(image|img|photo|picture|thumb|preview|foto|фото|зобр|картин|url|src|path|file|pic)/i.test(k);
          if (looksUrl || keyHint) { out[key] = v.length > 200 ? v.slice(0, 200) + "…" : v; c++; }
        } else if (Array.isArray(v) && v.length) {
          out[key] = "[array:" + v.length + "] " + (typeof v[0] === "string" ? v[0] : JSON.stringify(v[0]).slice(0, 120));
          c++;
          consider(key + "[0]", v[0], depth + 1);
        } else if (v && typeof v === "object") {
          consider(key, v, depth + 1);
        }
      }
    }
    consider("", model, 0);
    return out;
  }

  // кеш фото за кодом товару (наповнюється з робочого списку пошуку,
  // використовується і в попапі допродажу)
  var imgCache = {};
  var imgTemplate = null; // вивчений шаблон URL: {field, tpl з плейсхолдером}
  var CODE_FIELDS = ["sku", "SKU", "id", "productId", "article", "code", "vendorCode"];

  function cacheImg(model, url) {
    if (!model || !url) return;
    CODE_FIELDS.forEach(function (f) {
      if (model[f] != null) imgCache[asString(model[f])] = url;
    });
    learnTemplate(model, url);
  }
  function getCachedImg(code) { return imgCache[asString(code)] || null; }

  // вивчаємо, де в робочому URL стоїть код товару, щоб будувати URL для інших
  function learnTemplate(model, url) {
    if (imgTemplate) return;
    for (var i = 0; i < CODE_FIELDS.length; i++) {
      var f = CODE_FIELDS[i], val = model[f];
      if (val == null) continue;
      val = String(val);
      if (val.length >= 2 && url.indexOf(val) !== -1) {
        imgTemplate = { field: f, tpl: url.split(val).join("\u0000") };
        dbg("вивчено шаблон фото за полем '" + f + "':", url);
        return;
      }
    }
  }
  function buildFromTemplate(item) {
    if (!imgTemplate || !item) return null;
    var val = item[imgTemplate.field];
    if (val == null) return null;
    return imgTemplate.tpl.split("\u0000").join(String(val));
  }

  function modelFromScope(a) {
    var scope; try { scope = window.angular.element(a).scope(); } catch (e) { return null; }
    if (!scope) return null;
    if (scope.match) return scope.match.model != null ? scope.match.model : scope.match;
    return scope.product || scope.item || scope.row || null;
  }

  // синхронізуємо картинку рядка з ПОТОЧНИМ товаром (li перевикористовуються
  // при наборі, тож не можна ставити фото один раз — треба оновлювати)
  function syncOption(a) {
    if (!a || !window.angular) return;
    var li = a.closest("li") || a.parentNode;
    if (!li) return;

    var model = modelFromScope(a);
    var url = model ? findImageUrl(model) : null;
    if (url && model) cacheImg(model, url); // запамʼятовуємо для попапа
    var img = li.querySelector(":scope > img.sd-opt-img");

    if (url) {
      if (!img) {
        img = document.createElement("img");
        img.className = "sd-opt-img";
        img.loading = "lazy";
        img.alt = "";
        img.onerror = function () { img.style.visibility = "hidden"; };
        li.classList.add("sd-has-img");
        li.insertBefore(img, li.firstChild);
      }
      if (img.getAttribute("data-src") !== url) {
        img.setAttribute("data-src", url); // оновлюємо src лише коли реально змінився
        img.style.visibility = "";
        img.src = url;
      }
    } else {
      if (img) img.remove();
      li.classList.remove("sd-has-img");
      if (model && !window.__sdImgLogged) {
        window.__sdImgLogged = true;
        log("фото не знайдено в товарі. Рядкові поля:", imgDebug(model),
          "| весь товар (скинь Клоду):", safeDump(model));
      }
    }
  }

  function decorateAll() {
    if (!window.angular) return;
    var opts = document.querySelectorAll(
      'ul[id^="typeahead-"] a[ng-bind-html*="match.label"], ul[id^="typeahead-"] li > a, .dropdown-menu li a[ng-bind-html*="match.label"]'
    );
    for (var i = 0; i < opts.length; i++) syncOption(opts[i]);
  }

  // чи додано у DOM саме випадний список (дешево, без closest по всьому застосунку)
  function mutationAddsDropdown(m) {
    for (var i = 0; i < m.addedNodes.length; i++) {
      var n = m.addedNodes[i];
      if (n.nodeType !== 1) continue;
      if ((n.id && /^typeahead-/.test(n.id)) || /dropdown-menu/.test(n.className || "")) return true;
      if (n.querySelector && n.querySelector('ul[id^="typeahead-"], a[ng-bind-html*="match.label"]')) return true;
    }
    return false;
  }

  var imgTimer = null;
  function scheduleDecorate() {
    if (imgTimer) return;
    imgTimer = setTimeout(function () { imgTimer = null; try { decorateAll(); } catch (e) {} }, 80);
  }
  try {
    new MutationObserver(function (muts) {
      for (var i = 0; i < muts.length; i++) {
        if (mutationAddsDropdown(muts[i])) { scheduleDecorate(); return; }
      }
    }).observe(document.documentElement, { childList: true, subtree: true });
  } catch (e) {}

  // ---------- ТОВАРИ, ЩО ВЖЕ В ЗАЯВЦІ (для підказки при відкритті) ----------
  function onOrderPage() { return /\/order\//.test(location.hash || ""); }

  function collectOrder() {
    var got = getVMcached();
    if (!got || !got.vm) return null;
    var items = got.vm.items;
    if (!Array.isArray(items)) return null;
    var out = [];
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      if (!it) continue;
      var codes = [];
      // лише поля-коди ТОВАРУ (без id рядка, щоб не виключити зайве)
      ["sku", "SKU", "article", "vendorCode", "productCode", "productId"].forEach(function (f) {
        if (it[f] != null) codes.push(String(it[f]));
      });
      var name = it.name || it.productName || it.title || it.text || "";
      var rest = null;
      var prod = it.product || null;
      if (prod && prod.restCountInitial != null) rest = Number(prod.restCountInitial);
      else if (it.restCountInitial != null) rest = Number(it.restCountInitial);
      if (name || codes.length) out.push({ name: String(name), codes: codes, rest: rest });
    }
    return out;
  }

  var lastOrderSig = "";
  function pushOrder() {
    if (!onOrderPage()) { lastOrderSig = ""; return; } // працюємо тільки на сторінці заявки
    var snap = collectOrder();
    if (!snap) return;
    var sig = JSON.stringify(snap);
    if (sig === lastOrderSig) return;
    lastOrderSig = sig;
    document.documentElement.setAttribute("data-sd-order-items", sig);
    window.dispatchEvent(new Event("sdOrderItems"));
  }
  // ---------- ПЕРЕВІРКА ЦІН ROZETKA ----------
  function normName(s) { return String(s == null ? "" : s).trim().toLowerCase(); }
  function effPrice(pt) {
    var base = Number(pt.defaultPrice);
    if (!isFinite(base)) return null;
    var pd = Number(pt.percentDiscount) || 0;   // відсоткова знижка типу ціни
    var d = Number(pt.discount) || 0;           // абсолютна знижка типу ціни
    var eff = base;
    if (pd > 0) eff = base * (1 - pd / 100);
    else if (d > 0) eff = base - d;
    return Math.round(eff * 100) / 100;
  }
  function rozetkaPriceOf(prod) {
    if (!prod || !Array.isArray(prod.priceTypes)) return null;
    for (var i = 0; i < prod.priceTypes.length; i++) {
      var n = normName(prod.priceTypes[i].name);
      if (n === "rozetka" || n === "розетка") return effPrice(prod.priceTypes[i]);
    }
    return null;
  }
  // де лежать прайси товару: на самому об'єкті чи в .product
  function priceSource(it) {
    if (it && Array.isArray(it.priceTypes)) return it;
    if (it && it.product && Array.isArray(it.product.priceTypes)) return it.product;
    return it;
  }
  function regularPriceOf(src) {
    if (!src) return null;
    var dp = Number(src.defaultPrice != null ? src.defaultPrice : src.price);
    return isFinite(dp) ? Math.round(dp * 100) / 100 : null;
  }
  function isRozetkaOrder(vm) {
    var o = vm && vm.order; if (!o) return false;
    return normName(o.integrationType) === "rozetka" || normName(o.utmCampaign) === "rozetka";
  }
  // ціна супутнього, що відповідає джерелу заявки:
  // Rozetka -> ціна ROZETKA (зі знижкою); інакше -> звичайна
  function companionPrice(roz, it) {
    var src = priceSource(it);
    if (roz) {
      var rp = rozetkaPriceOf(src);
      return rp != null ? { label: "Rozetka", value: rp } : null;
    }
    var reg = regularPriceOf(src);
    return reg != null ? { label: "Ціна", value: reg } : null;
  }
  function checkPrices(vm) {
    var order = vm && vm.order;
    if (!order) return { rozetka: false, problems: [] };
    var isRoz = normName(order.integrationType) === "rozetka" ||
                normName(order.utmCampaign) === "rozetka";
    if (!isRoz) return { rozetka: false, problems: [] };
    var probs = [], items = vm.items || [];
    for (var i = 0; i < items.length; i++) {
      var x = items[i]; if (!x) continue;
      var target = rozetkaPriceOf(x.product);
      if (target == null) continue;            // нема ROZETKA-ціни на товарі — не перевіряємо
      var charged = Number(x.price);
      if (!isFinite(charged)) continue;
      if (Math.abs(charged - target) >= 0.01) {
        probs.push({
          name: String(x.name || x.documentName || ""),
          sku: String(x.sku || ""),
          charged: charged, target: target, below: charged < target
        });
      }
    }
    return { rozetka: true, problems: probs };
  }

  // ризиковий клієнт: 0 < відсоток викупу <= порога.
  // 0% = новий клієнт без історії викупу -> НЕ ризик (передоплата не потрібна).
  var RISK_BUYOUT_MAX = 59;
  function checkRating(vm) {
    var order = vm && vm.order;
    var c = order && order.contacts && order.contacts[0];
    if (!c) return { low: false };
    var cr = c.clientRating;
    var pct = cr ? Number(cr.buyoutPercent) : NaN;
    if (!isFinite(pct)) return { low: false };   // нема даних викупу — не чіпаємо
    var name = [c.lName, c.fName].filter(Boolean).join(" ").trim();
    return { low: pct > 0 && pct <= RISK_BUYOUT_MAX, value: pct + "%", name: name };
  }

  var lastWarnSig = "";
  // ТТН (номер НП) для Rozetka/Refort-заявок — щоб ловити заміну ТТН.
  // EN лежить у ord_novaposhta[0].EN; integrationType="rozetka" покриває і Rozetka, і Refort.
  function ttnInfo(vm) {
    var o = vm && vm.order;
    if (!o) return null;
    var isRoz = normName(o.integrationType) === "rozetka" || normName(o.utmCampaign) === "rozetka";
    if (!isRoz) return null;
    var id = (o.id != null) ? String(o.id) : "";
    if (!id) return null;
    var np = o.ord_novaposhta;
    var arr = Array.isArray(np) ? np : (np ? [np] : []);
    var ens = [];
    for (var i = 0; i < arr.length; i++) {
      var d = arr[i];
      var en = (d && d.EN != null) ? String(d.EN).trim() : "";
      if (en && ens.indexOf(en) === -1) ens.push(en);
    }
    // Історія дій з ТТН зі стрічки коментарів: "Створена/Видалена ТТН <номер>".
    // Дає змогу побачити заміну ретроспективно, незалежно від того, хто й коли міняв.
    // розрізняємо створення і видалення ТТН (важливо для не-НП перевізників)
    var created = [], deleted = [];
    function addFrom(text) {
      var re = /(Створена|Видалена)\s+ТТН\s*(\d{6,})/gi, m;
      while ((m = re.exec(text)) !== null) {
        var num = m[2], bucket = /Видален/i.test(m[1]) ? deleted : created;
        if (bucket.indexOf(num) === -1) bucket.push(num);
      }
    }
    var cm = vm.comments;
    if (Array.isArray(cm) && cm.length) {
      for (var k = 0; k < cm.length; k++) addFrom((cm[k] && cm[k].body != null) ? String(cm[k].body) : "");
    } else {
      try {
        var nodes = document.querySelectorAll(".comment-body");
        for (var n = 0; n < nodes.length; n++) addFrom(nodes[n].textContent || "");
      } catch (e) {}
    }
    // активні з історії = створені й не видалені (покриває Укрпошту: номер не в НП-полі, але чинний)
    var activeHist = [];
    for (var a = 0; a < created.length; a++) {
      if (deleted.indexOf(created[a]) === -1 && activeHist.indexOf(created[a]) === -1) activeHist.push(created[a]);
    }
    // поточні (effective) = НП-ТТН + активні з історії
    var effective = ens.slice();
    for (var e = 0; e < activeHist.length; e++) {
      if (effective.indexOf(activeHist[e]) === -1) effective.push(activeHist[e]);
    }
    // старі = реально видалені, яких немає серед поточних -> ознака заміни/видалення
    var oldTtns = [];
    for (var d = 0; d < deleted.length; d++) {
      if (effective.indexOf(deleted[d]) === -1 && oldTtns.indexOf(deleted[d]) === -1) oldTtns.push(deleted[d]);
    }
    return { orderId: id, ens: effective, oldTtns: oldTtns };
  }
  function pushWarn() {
    if (!onOrderPage()) { lastWarnSig = ""; return; }
    var got = getVMcached();
    if (!got || !got.vm) return;
    var price = checkPrices(got.vm);
    var rating = checkRating(got.vm);
    var res = { rozetka: price.rozetka, problems: price.problems, rating: rating, ttn: ttnInfo(got.vm) };
    var sig = JSON.stringify(res);
    if (sig === lastWarnSig) return;           // міняємо банер лише коли щось змінилось
    lastWarnSig = sig;
    document.documentElement.setAttribute("data-sd-price-warn", sig);
    window.dispatchEvent(new Event("sdPriceWarn"));
  }

  /* ---- Укрпошта: ТТН + прапорець друку ПРЯМО зі сторінки (без запитів до API) ----
     Дані вже є в scope доставки: viewModel.ukrposhta.barcode / .isPrinted.
     Раніше сторож повторного друку тягнув їх через /api/order/list/ на КОЖНУ відкриту
     заявку — це зʼїдало годинний ліміт API (100 запитів/год на весь акаунт). */
  var lastUkrSig = "";
  var UKR_SEL = '[ng-model^="viewModel.ukrposhta"],[ng-click*="ukrposhta"],[ng-if*="ukrposhta"],[ng-show*="ukrposhta"],[ng-class*="ukrposhta"]';
  function ukrInfo() {
    try {
      if (!window.angular) return null;
      var els = document.querySelectorAll(UKR_SEL);
      for (var i = 0; i < els.length; i++) {
        var sc; try { sc = window.angular.element(els[i]).scope(); } catch (e) { continue; }
        var vm = sc && (sc.viewModel || sc.vm), u = vm && vm.ukrposhta;
        if (u && (u.barcode != null || u.isPrinted != null))
          return { ttn: String(u.barcode == null ? "" : u.barcode), printed: !!Number(u.isPrinted) };
      }
    } catch (e) {}
    return null;
  }
  function pushUkr() {
    if (!onOrderPage()) { lastUkrSig = ""; return; }
    var m = (location.hash || "").match(/#\/order\/(?:update|create)\/(\d+)/);
    var u = ukrInfo();
    if (!m || !u) return;
    var sig = JSON.stringify({ id: m[1], ttn: u.ttn, printed: u.printed });
    if (sig === lastUkrSig) return;
    lastUkrSig = sig;
    document.documentElement.setAttribute("data-sd-ukr", sig);
    window.dispatchEvent(new Event("sdUkrInfo"));
  }

  setInterval(function () { pushOrder(); pushWarn(); pushUkr(); }, 2000);
  setTimeout(function () { pushOrder(); pushWarn(); pushUkr(); }, 800);
  window.addEventListener("hashchange", function () {
    _vmCache = null;        // інша заявка — viewModel може бути інший
    lastOrderSig = "";      // примусово переоцінити склад заявки
    lastWarnSig = "";
    lastUkrSig = "";
    setTimeout(function () { pushOrder(); pushWarn(); pushUkr(); }, 500);
    setTimeout(function () { pushOrder(); pushWarn(); pushUkr(); }, 1200);
  });

  log("page-міст активний (angular:", !!window.angular, ")");
}


  // ---- вкраплюємо page-міст у контекст сторінки (доступ до Angular) ----
  try {
    var __sdScript = document.createElement("script");
    __sdScript.textContent = "(" + __sdPageMain.toString() + ")();";
    (document.head || document.documentElement).appendChild(__sdScript);
    if (__sdScript.parentNode) __sdScript.parentNode.removeChild(__sdScript);
  } catch (e) {
    console.log("[SalesDrive] не вдалося вкрапити page-міст:", e);
  }

})();
}catch(e){ try{ console.warn("[SD] модуль «core» не запустився:", e); }catch(_){} }
/* ▲▲▲ МОДУЛЬ-END • core ▲▲▲ */

/* ▼▼▼ МОДУЛЬ-START • lkNaboryInline — Набори: позначка «входить у набори» в рядках заявки ▼▼▼ */
/* ===== Набори: позначка «входить у набори» в рядках заявки (джерело: баркод) ===== */
try{ // SD-ізоляція: помилка цього модуля не зупинить решту
(function lkNaboryInline() {
  'use strict';

  // ---------- НАЛАШТУВАННЯ ----------
  const APP_URL = 'https://barcode-printer-production-2b32.up.railway.app';
  const TOKEN   = 'nab_8Kx2pQ7mLr4tW9vZ';
  const TTL_MS  = 6 * 60 * 60 * 1000;
  // картка товару в SalesDrive за внутрішнім ID:
  const CAT_URL = sku => 'https://komplektom.salesdrive.me/ua/index.html?formId=1#/product/index?filter%5Bsku%5D=' + encodeURIComponent(sku);
  // ----------------------------------
  const PAGE = (typeof unsafeWindow !== 'undefined' && unsafeWindow) || window;
  function openProduct(sku) {
    try { document.documentElement.setAttribute('data-sd-open-sku', String(sku)); PAGE.dispatchEvent(new Event('sdOpenProduct')); } catch (_) {}
  }

  let comp2kits = null, loading = false;
  const norm = s => String(s == null ? '' : s).trim();
  const esc = s => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  function build(kitsObj) {
    const m = new Map();
    for (const kitSku of Object.keys(kitsObj || {})) {
      const info = kitsObj[kitSku] || {};
      for (const c of (info.comps || [])) {
        const cs = norm(c.sku);
        if (!m.has(cs)) m.set(cs, []);
        m.get(cs).push({ code: kitSku, name: info.name || '', qty: c.qty || 1, id: info.id || '' });
      }
    }
    return m;
  }

  function fetchKits() {
    const url = APP_URL.replace(/\/+$/, '') + '/api/kits?token=' + encodeURIComponent(TOKEN);
    return new Promise((resolve, reject) => {
      const done = t => { try { const d = JSON.parse(t); d.ok ? resolve(d.kits || {}) : reject(new Error(d.error || 'no')); } catch (e) { reject(e); } };
      if (typeof GM_xmlhttpRequest !== 'undefined') {
        GM_xmlhttpRequest({
          method: 'GET', url,
          onload: r => (r.status >= 200 && r.status < 300) ? done(r.responseText) : reject(new Error('HTTP ' + r.status)),
          onerror: () => reject(new Error('net'))
        });
      } else { fetch(url).then(r => r.text()).then(done).catch(reject); }
    });
  }

  // кеш віддаємо миттєво, але якщо він старший за SOFT_MS — тихо оновлюємо у фоні
  // (інакше нові комплекти не видно до 6 год: саме через це бракувало позначок)
  const SOFT_MS = 30 * 60 * 1000;
  function refreshKitsBg() {
    if (loading) return;
    loading = true;
    fetchKits()
      .then(kits => {
        comp2kits = build(kits);
        try { GM_setValue('lknb_cache2', JSON.stringify({ ts: Date.now(), kits })); } catch (_) {}
        try { scan(); } catch (_) {}
      })
      .catch(() => {})
      .then(() => { loading = false; });
  }
  async function ensureData() {
    if (comp2kits || loading) return;
    let ts = 0;
    try { const c = GM_getValue('lknb_cache2', null); if (c) { const o = JSON.parse(c); if (Date.now() - o.ts < TTL_MS && o.kits) { comp2kits = build(o.kits); ts = o.ts; } } } catch (_) {}
    if (comp2kits) { if (Date.now() - ts > SOFT_MS) refreshKitsBg(); return; }
    loading = true;
    try { const kits = await fetchKits(); comp2kits = build(kits); try { GM_setValue('lknb_cache2', JSON.stringify({ ts: Date.now(), kits })); } catch (_) {} }
    catch (e) { /* мовчки — спробуємо при наступному скані */ }
    finally { loading = false; }
  }

  const css = `
  .lknb-plus{display:inline-flex;align-items:center;justify-content:center;width:16px;height:16px;
    margin-left:6px;border-radius:50%;background:#ef8a1f;color:#fff;font:700 12px/1 sans-serif;
    cursor:pointer;vertical-align:middle;user-select:none}
  .lknb-plus:hover{background:#d97a12}
  .lknb-exp{margin:4px 0 2px;padding:6px 9px;border-left:3px solid #ef8a1f;background:#fff7ec;
    border-radius:4px;font:12px/1.45 -apple-system,Segoe UI,Roboto,sans-serif;color:#333}
  .lknb-exp .h{color:#8a5a12;font-weight:600;margin-bottom:3px}
  .lknb-exp .r{padding:1px 0;font-family:ui-monospace,Menlo,Consolas,monospace}
  .lknb-exp .r b{color:#c8730f}
  .lknb-exp .r a.lk{color:#0a58ca;text-decoration:underline;font-weight:700;cursor:pointer}
  .lknb-exp .r a.lk:hover{color:#0843a0}
  .lknb-exp .r .nm{color:#888;font-family:-apple-system,Segoe UI,Roboto,sans-serif}`;
  const st = document.createElement('style'); st.textContent = css;
  (document.head || document.documentElement).appendChild(st);

  function extractSku(cell) {
    let sku = '';
    cell.querySelectorAll('span').forEach(sp => {
      const m = sp.textContent.trim().match(/^\(([\w\-]+)\)$/);
      if (m) sku = m[1];
    });
    return sku;
  }

  function buildExp(sku) {
    const list = comp2kits.get(sku) || [];
    let h = '<div class="h">Входить у набори:</div>';
    for (const k of list) {
      // посилання веде НА КАРТКУ набору (код → productId, модуль lkProdLink);
      // поки ID невідомий — тимчасово пошук по коду, href підміниться сам
      const kitHref = (window.sdProdLink ? window.sdProdLink.url(k.code, true) : CAT_URL(k.code));
      const codeHtml = '<a class="lk" data-sku="' + esc(k.code) + '" data-sd-sku="' + esc(k.code) + '" data-sd-kit="1"'
        + ' href="' + kitHref + '" target="_blank" rel="noopener" title="Відкрити картку набору">' + esc(k.code) + '</a>';
      h += '<div class="r">' + codeHtml + ' · <span class="nm">' + esc(k.name) + '</span> ×' + k.qty + '</div>';
    }
    return h;
  }

  function inject(cell, sku) {
    const skuSpan = [...cell.querySelectorAll('span')].reverse()
      .find(sp => /^\([\w\-]+\)$/.test(sp.textContent.trim()));
    const plus = document.createElement('span');
    plus.className = 'lknb-plus'; plus.textContent = '+'; plus.title = 'Показати набори';
    const exp = document.createElement('div');
    exp.className = 'lknb-exp'; exp.style.display = 'none'; exp.innerHTML = buildExp(sku);
    plus.addEventListener('click', e => {
      e.preventDefault(); e.stopPropagation();
      const open = exp.style.display !== 'none';
      exp.style.display = open ? 'none' : 'block';
      plus.textContent = open ? '+' : '–';
    });
    // клік по коду набору: відкрити картку товару в SalesDrive (модал), не чіпаючи заявку
    exp.addEventListener('click', e => {
      const a = e.target.closest('a.lk'); if (!a) return;
      e.stopPropagation();
      const sku = a.getAttribute('data-sku');
      if (sku) { e.preventDefault(); openProduct(sku); }
    });
    if (skuSpan) skuSpan.insertAdjacentElement('afterend', plus);
    else cell.appendChild(plus);
    cell.appendChild(exp);
  }

  function processCell(cell) {
    if (!comp2kits) return;
    const sku = extractSku(cell);
    const prev = cell.getAttribute('data-lknb');
    const should = !!(sku && comp2kits.has(sku));
    const hasPlus = !!cell.querySelector('.lknb-plus');
    if (prev === (sku || '') && hasPlus === should) return;
    cell.querySelectorAll('.lknb-plus,.lknb-exp').forEach(n => n.remove());
    cell.setAttribute('data-lknb', sku || '');
    if (should) inject(cell, sku);
  }

  function scan() {
    if (!comp2kits) return;
    document.querySelectorAll('a.link-product-field').forEach(a => {
      const cell = a.closest('.editing-hide') || a.parentElement;
      if (cell) processCell(cell);
    });
  }

  let t = null;
  function scanSoon() { clearTimeout(t); t = setTimeout(scan, 250); }

  (async function init() {
    await ensureData();
    scan();
    window.addEventListener('lkdom', scanSoon);
  })();
})();
}catch(e){ try{ console.warn("[SD] модуль «lkNaboryInline» не запустився:", e); }catch(_){} }
/* ▲▲▲ МОДУЛЬ-END • lkNaboryInline ▲▲▲ */


/* ▼▼▼ МОДУЛЬ-START • lkComplectPrice — роздрібна ціна товару в таблиці «Товари в комплекті» ▼▼▼ */
/* ===== Показує роздрібну ціну (defaultPrice) біля кожного товару-складника
   у таблиці комплекту на картці товару. Джерело — той самий домен
   (/products/data/?filter[sku]=…), тож звичайний fetch (працює і без TM). ===== */
try{ // SD-ізоляція: помилка цього модуля не зупинить решту
(function lkComplectPrice(){
  'use strict';
  var css=''
    +'.lkcp{display:inline-block;margin-left:8px;padding:1px 8px;border-radius:8px;'
    +'  background:#eef3ff;border:1px solid #c5d6f7;color:#14418f;'
    +'  font:700 11.5px/1.6 sans-serif;vertical-align:middle;white-space:nowrap}'
    +'.lkcp.wait{background:#f1f1f1;border-color:#e2e2e2;color:#999;font-weight:400}'
    +'.lkcp-sum{display:inline-block;margin-left:12px;padding:2px 12px;border-radius:9px;'
    +'  background:#e6f4ea;border:1px solid #a5d6a7;color:#1b5e20;'
    +'  font:800 14px/1.5 sans-serif;vertical-align:middle;white-space:nowrap}'
    +'.lkcp-sum.wait{background:#f1f1f1;border-color:#e2e2e2;color:#999;font-weight:600}'
    +'.lkcp-tiers{display:flex;flex-wrap:wrap;gap:6px;margin:6px 0 4px}'
    +'.lkcp-chip{display:inline-flex;align-items:center;gap:6px;padding:2px 10px;border-radius:8px;'
    +'  background:#f4f6fb;border:1px solid #d6ddef;color:#2a3b63;'
    +'  font:600 12.5px/1.5 sans-serif;white-space:nowrap}'
    +'.lkcp-chip .l{color:#7a869f;font-weight:700}'
    +'.lkcp-sum,.lkcp-chip{cursor:pointer}'
    +'.lkcp-sum:hover,.lkcp-chip:hover{filter:brightness(.97)}'
    +'.lkcp-sum.lkcp-copied,.lkcp-chip.lkcp-copied{outline:2px solid #2e7d32;background:#d7f0dc}'
    +'.lkcp-copied::after{content:" ✓";color:#2e7d32;font-weight:800}'
    +'.lkcp-sum.lkcp-err,.lkcp-chip.lkcp-err{outline:2px solid #c62828;background:#fdecea}'
    +'.lkcp-note{margin:2px 0 6px;font:600 12px/1.5 sans-serif;color:#1b5e20}'
    +'.lkcp-note.bad{color:#b71c1c}';
  var st=document.createElement('style'); st.textContent=css;
  (document.head||document.documentElement).appendChild(st);

  // ===== кеш цін (SWR): миттєво з памʼяті/сховища, у фоні тихо оновлюємо =====
  var cache=Object.create(null);     // sku -> {retail, pt} | null (розвʼязані значення)
  var tsMap=Object.create(null);     // sku -> час кешування
  var listeners=Object.create(null); // sku -> [fn(info)]
  var inflight=Object.create(null);
  var TIER_NAMES=null, tierBusy=false;
  var TTL=2*60*60*1000;              // 2 год «свіжо» (старіше — тихо оновлюємо у фоні)
  var PKEY='lkcp_prices_v1', NKEY='lkcp_tiernames_v1';

  function esc(s){ return String(s).replace(/[&<>"]/g,function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); }
  function gGet(k){ try{ var s=GM_getValue(k,null); return s?((typeof s==='string')?JSON.parse(s):s):null; }catch(e){ return null; } }
  function gSet(k,v){ try{ GM_setValue(k, JSON.stringify(v)); }catch(e){} }

  // одразу підвантажити збережені ціни/назви — щоб повторне відкриття було миттєвим
  (function preload(){
    var o=gGet(PKEY);
    if(o) Object.keys(o).forEach(function(sku){ var e=o[sku]; if(e){ cache[sku]=e.i; tsMap[sku]=e.ts||0; } });
    var n=gGet(NKEY); if(n && Object.keys(n).length) TIER_NAMES=n;
  })();
  var saveT=null;
  function savePricesSoon(){ clearTimeout(saveT); saveT=setTimeout(function(){
    var o={}; Object.keys(cache).forEach(function(sku){ o[sku]={i:cache[sku], ts:tsMap[sku]||0}; }); gSet(PKEY,o);
  }, 600); }

  function notify(sku){ (listeners[sku]||[]).forEach(function(fn){ try{ fn(cache[sku]); }catch(e){} }); }

  function fetchPrice(sku){
    var url='/products/data/?active=1&filter[sku]='+encodeURIComponent(sku)+'&formId=1';
    return fetch(url,{credentials:'include',headers:{'accept':'application/json, text/plain, */*','when':'product/index'}})
      .then(function(r){ return r.ok?r.json():null; })
      .then(function(j){
        var rows=j&&j.response&&j.response.meta&&j.response.meta.option&&j.response.meta.option.option;
        var row=null, c=String(sku).trim();
        if(rows) for(var i=0;i<rows.length;i++){ if(String(rows[i].sku).trim()===c){ row=rows[i]; break; } }
        if(!row && rows && rows.length) row=rows[0];
        return row ? { retail:(row.defaultPrice!=null?Number(row.defaultPrice):null), pt:(row.priceType||{}) } : null;
      })
      .catch(function(){ return null; });
  }
  // гарантувати ціну: свіжу лишаємо; стару/відсутню тихо тягнемо у фоні
  function ensurePrice(sku){
    var fresh=(sku in cache) && (Date.now()-(tsMap[sku]||0) < TTL);
    if(fresh || inflight[sku]) return;
    inflight[sku]=1;
    fetchPrice(sku).then(function(info){
      inflight[sku]=0;
      cache[sku]=info; tsMap[sku]=Date.now(); savePricesSoon();
      notify(sku); updateTotals();
    });
  }
  // підписка рядка на ціну: миттєво віддаємо з кешу, паралельно ревалідуємо
  function onPrice(sku, fn){
    (listeners[sku]=listeners[sku]||[]).push(fn);
    if(sku in cache){ try{ fn(cache[sku]); }catch(e){} }
    ensurePrice(sku);
  }

  // назви типів цін (Великий опт / середній опт / майстри / …) — з поточного товару,
  // кешуються у сховищі (майже не міняються), тож фетчимо лише коли їх ще немає
  function ensureTierNames(){
    if(TIER_NAMES || tierBusy) return;
    var m=(location.hash||'').match(/\/product\/update\/(\d+)/); if(!m) return;
    tierBusy=true;
    fetch('/products/'+m[1]+'/?formId=1',{credentials:'include',headers:{'accept':'application/json, text/plain, */*','when':'product/index'}})
      .then(function(r){ return r.ok?r.json():null; })
      .then(function(j){ var pt=j&&j.response&&j.response.meta&&j.response.meta.priceTypes;
        if(pt && typeof pt==='object' && Object.keys(pt).length){ TIER_NAMES=pt; gSet(NKEY,pt); updateTotals(); } })
      .catch(function(){})
      .then(function(){ tierBusy=false; });
  }

  // код товару з рядка — спан «(NNNN)», ігноруючи наші розгорнуті блоки
  function skuOf(cell){
    var sku='';
    cell.querySelectorAll('span').forEach(function(sp){
      if(sp.closest('.lkan-exp,.lknb-exp,.lkmk-exp,.lkcp')) return;
      var m=(sp.textContent||'').trim().match(/^\(([\w\-]+)\)$/);
      if(m) sku=m[1];
    });
    return sku;
  }
  function fmt(n){ return (Math.round(n*100)/100).toString().replace(/\.00$/,'').replace('.',',')+' ₴'; }
  function fmtInt(n){ return Math.round(Number(n)||0)+' ₴'; } // підсумки — до цілих
  // порядок чипів: великий опт → середній опт → майстри → решта
  function tierRank(name){
    var n=(name||'').toLowerCase();
    if(/велик/.test(n)) return 1;
    if(/серед/.test(n)) return 2;
    if(/майст/.test(n)) return 3;
    return 9;
  }

  // копіювання суми в буфер (запасний варіант, якщо підставити не вийшло)
  function doCopy(text){
    try{ if(typeof GM_setClipboard==='function'){ GM_setClipboard(String(text)); return true; } }catch(e){}
    try{ navigator.clipboard.writeText(String(text)); return true; }catch(e){}
    return false;
  }
  function flashCopied(el){
    el.classList.add('lkcp-copied');
    setTimeout(function(){ try{ el.classList.remove('lkcp-copied'); }catch(e){} }, 1000);
  }
  function flashErr(el, msg){
    var old=el.getAttribute('title')||'';
    el.classList.add('lkcp-err'); el.setAttribute('title', msg||'не вдалося підставити');
    setTimeout(function(){ try{ el.classList.remove('lkcp-err'); el.setAttribute('title', old); }catch(e){} }, 2500);
  }
  // коротке повідомлення під заголовком: що саме підставили
  function note(box, txt, bad){
    if(!box) return;
    var n=box.parentNode && box.parentNode.querySelector('.lkcp-note');
    if(!n){ n=document.createElement('div'); n.className='lkcp-note'; box.insertAdjacentElement('afterend', n); }
    n.className='lkcp-note'+(bad?' bad':'');
    n.textContent=txt;
    clearTimeout(n._t); n._t=setTimeout(function(){ try{ n.remove(); }catch(e){} }, 6000);
  }

  // ---- підстановка суми в ціну товару ----
  // ГОЛОВНИЙ шлях — прямо у поля форми (як це робить руками менеджер): працює
  // й у пісочниці Tampermonkey, бо не залежить від містка «модуль ↔ сторінка».
  // Якщо блок цін не знайдено — пробуємо міст до ядра (sdSetPrice).
  var PAGEW=(typeof unsafeWindow!=='undefined'&&unsafeWindow)||window;
  function money2(n){ return (Math.round(Number(n)*100)/100).toFixed(2).replace('.',','); }
  // запис у поле так, щоб Angular побачив зміну
  function setInput(inp, txt){
    try{
      var d=Object.getOwnPropertyDescriptor(Object.getPrototypeOf(inp),'value');
      if(d && d.set) d.set.call(inp, txt); else inp.value=txt;
    }catch(e){ inp.value=txt; }
    inp.dispatchEvent(new Event('input',{bubbles:true}));
    inp.dispatchEvent(new Event('change',{bubbles:true}));
  }
  // Рядок ціни = контейнер ng-repeat="priceType in viewModel.item.priceTypes".
  // Важливо брати саме його: у сусідніх обгортках лежать поля ІНШОГО рядка,
  // і сума потрапляла не в той тип ціни.
  function priceRows(){
    var out=[];
    [].forEach.call(document.querySelectorAll('[ng-repeat^="priceType in"]'), function(box){
      var sel=box.querySelector('select[ng-model="priceType.priceTypeId"]');
      var price=box.querySelector('input[ng-model="priceType.price"]');
      if(sel && price) out.push({ sel:sel, box:box, price:price,
                                  disc:box.querySelector('input[ng-model="priceType.discount"]') });
    });
    return out;
  }
  function tierOfSelect(sel){
    var v=String(sel.value||'');                        // буває "string:2" або "2"
    var m=v.match(/(\d+)\s*$/); return m?m[1]:'';
  }
  function optionFor(sel, tier){
    for(var i=0;i<sel.options.length;i++){
      var v=String(sel.options[i].value||''), m=v.match(/(\d+)\s*$/);
      if(m && m[1]===String(tier)) return sel.options[i];
    }
    return null;
  }
  function tierNameOf(tier){ return (TIER_NAMES&&TIER_NAMES[tier])||('тип '+tier); }
  // фактична ціна з урахуванням знижки рядка (щоб чесно попередити)
  function effOf(row, val){
    var d=parseFloat(String((row.disc&&row.disc.value)||'').replace(',','.'))||0;
    return d>0 ? Math.round((val-d)*100)/100 : 0;
  }

  function setPriceDom(tier, val, cb){
    // роздрібна ціна — окреме поле картки
    if(String(tier)==='retail'){
      var ri=document.querySelector('input[ng-model="viewModel.item.defaultPrice"]');
      if(!ri) return cb(null);
      setInput(ri, money2(val));
      return cb({ ok:true, name:'Роздрібна', created:false, eff:0 });
    }
    // рядок потрібного типу шукаємо ЩОРАЗУ заново: ng-repeat перебудовує DOM,
    // тож збережене посилання на поле може вказувати вже на інший рядок
    function rowOf(t){
      var rr=priceRows();
      for(var i=0;i<rr.length;i++) if(tierOfSelect(rr[i].sel)===String(t)) return rr[i];
      return null;
    }
    var have=rowOf(tier);
    if(have){                                            // рядок уже є — переписуємо
      setInput(have.price, money2(val));
      var again=rowOf(tier)||have;
      return cb({ ok:true, name:tierNameOf(tier), created:false, eff:effOf(again, val) });
    }
    // рядка немає — додаємо штатною кнопкою СРМ
    var add=[].slice.call(document.querySelectorAll('[ng-click]')).filter(function(b){
      return /addProductPrice/i.test(b.getAttribute('ng-click')||'') && b.offsetParent;
    })[0];
    if(!add) return cb(null);
    var before=priceRows().length;
    add.click();
    var t0=Date.now();
    (function wait(){
      var now=priceRows();
      if(now.length>before){
        var fresh=rowOf(tier);                           // раптом новий рядок уже цього типу
        if(!fresh){
          var row=now[now.length-1];
          var opt=optionFor(row.sel, tier);
          if(!opt) return cb({ ok:false, err:'тип ціни «'+tierNameOf(tier)+'» недоступний' });
          row.sel.value=opt.value;
          row.sel.dispatchEvent(new Event('change',{bubbles:true}));
        }
        // після зміни типу даємо Angular перемалювати і ЗНОВУ шукаємо рядок
        setTimeout(function(){
          var r=rowOf(tier);
          if(!r) return cb(null);
          setInput(r.price, money2(val));
          var r2=rowOf(tier)||r;
          cb({ ok:true, name:tierNameOf(tier), created:true, eff:effOf(r2, val) });
        }, 120);
        return;
      }
      if(Date.now()-t0>3000) return cb(null);
      setTimeout(wait, 60);
    })();
  }

  // запасний шлях: через ядро (page-context + Angular)
  function setPriceBridge(tier, value, cb){
    var token=String(Date.now())+'_'+Math.random().toString(36).slice(2);
    function done(d){ PAGEW.removeEventListener('sdSetPriceResult', onRes); clearTimeout(tm); cb(d); }
    function onRes(){
      var raw=document.documentElement.getAttribute('data-sd-setprice-result'); if(!raw) return;
      var d; try{ d=JSON.parse(raw); }catch(e){ return; }
      if(!d || d.token!==token) return;
      done(d);
    }
    PAGEW.addEventListener('sdSetPriceResult', onRes);
    document.documentElement.removeAttribute('data-sd-setprice-result');
    document.documentElement.setAttribute('data-sd-setprice', JSON.stringify({token:token, tier:String(tier), value:value}));
    PAGEW.dispatchEvent(new Event('sdSetPrice'));
    // якщо ядро мовчить (інший контекст/стара версія) — просто перевіряємо атрибут
    var tm=setTimeout(function(){ onRes(); done(null); }, 4000);
  }

  function setPrice(tier, value, cb){
    var fired=false;
    function once(d){ if(fired) return; fired=true; cb(d); }
    try{
      setPriceDom(tier, value, function(d){
        if(d) return once(d);
        setPriceBridge(tier, value, once);     // поля не знайшли — пробуємо ядро
      });
    }catch(e){ setPriceBridge(tier, value, once); }
  }

  // делегований клік по чипу/бейджу: підставляє суму в потрібний тип ціни товару
  function onChipClick(e){
    var el=e.target.closest('[data-copy]'); if(!el) return;
    e.preventDefault(); e.stopPropagation();
    var tier=el.getAttribute('data-tier')||'retail';
    var val=Number(el.getAttribute('data-copy'))||0;
    if(!(val>0)) return;
    var box=el.closest('.lkcp-tiers')||el;
    setPrice(tier, val, function(d){
      if(d && d.ok){
        flashCopied(el);
        note(box, '✓ ' + (d.name||'ціну') + ' → ' + val + ' ₴'
          + (d.created?' (рядок ціни створено)':'')
          + (d.eff>0 ? ' ⚠ у рядку є знижка — фактично '+d.eff+' ₴' : '')
          + '. Не забудь «Зберегти».');
      } else {
        doCopy(String(val));          // не вийшло підставити — хоч у буфер
        flashErr(el, (d&&d.err)||'не вдалося підставити');
        note(box, '✗ Не вдалося підставити ('+((d&&d.err)||'немає відповіді')+'). Суму '+val+' ₴ скопійовано в буфер.', true);
      }
    });
  }

  // кількість складника з рядка; надійно — з Angular-моделі (item.amount),
  // бо колонка «К-ть» у режимі перегляду не має .editing-hide і поруч є «Склад».
  function qtyOf(tr){
    try{
      var W=(typeof unsafeWindow!=='undefined'&&unsafeWindow)||window;
      var sc=W.angular && W.angular.element(tr).scope();
      if(sc && sc.item && sc.item.amount!=null){ var q=parseFloat(sc.item.amount); if(q>0) return q; }
    }catch(e){}
    var c=tr.querySelector('.td-amount .editing-hide');
    var v=c && parseFloat((c.textContent||'').replace(',','.').replace(/\s+/g,''));
    return (v && v>0) ? v : 1;
  }
  // усі таблиці комплекту на сторінці (і режим редагування, і перегляду)
  function kitTables(){
    var out=[];
    document.querySelectorAll('table.products-complect-table, div[ng-show*="isComplect"] table').forEach(function(tb){
      if(out.indexOf(tb)<0 && tb.querySelector('a.link-product-field')) out.push(tb);
    });
    return out;
  }
  // ціна складника за типом; якщо тип не заданий (0/нема) — беремо роздрібну
  function tierValue(info, tierId){
    if(!info) return 0;
    var p = (tierId==='retail') ? info.retail : (info.pt && info.pt[tierId]);
    if(!(p>0)) p = info.retail;
    return (p>0) ? Number(p) : 0;
  }

  function decorate(cell){
    if(cell.querySelector('.lkcp')) return;          // вже додано
    var sku=skuOf(cell); if(!sku) return;
    var badge=document.createElement('span'); badge.className='lkcp wait'; badge.textContent='роздріб…';
    var codeSpan=[].slice.call(cell.querySelectorAll('span')).reverse().filter(function(sp){ return !sp.closest('.lkan-exp,.lknb-exp,.lkmk-exp'); })
      .find(function(sp){ return /^\([\w\-]+\)$/.test((sp.textContent||'').trim()); });
    if(codeSpan && codeSpan.parentNode) codeSpan.insertAdjacentElement('afterend', badge);
    else { var a=cell.querySelector('a.link-product-field'); if(a) a.insertAdjacentElement('afterend', badge); else cell.appendChild(badge); }
    onPrice(sku, function(info){
      var p=info && info.retail;
      if(!(p>0)){ badge.style.display='none'; }
      else { badge.style.display=''; badge.className='lkcp'; badge.textContent='Роздріб: '+fmt(p); }
    });
  }

  function h3For(table){
    var box=table.closest('div[ng-show*="isComplect"]') || table.parentElement && table.parentElement.parentElement;
    var h=box && box.querySelector('h3');
    if(h) return h;
    var all=document.querySelectorAll('h3');
    for(var i=0;i<all.length;i++){ if(/Товари в комплект/i.test(all[i].textContent||'')) return all[i]; }
    return null;
  }
  // підсумки в заголовку «Товари в комплекті»: роздрібна сума + суми за типами цін
  function updateTotals(){
    ensureTierNames();
    kitTables().forEach(function(table){
      // чипи опт/майстри — лише в режимі редагування картки товару;
      // у режимі перегляду (без products-complect-table) — тільки роздрібна сума.
      var showTiers=table.classList.contains('products-complect-table');
      var h=h3For(table); if(!h) return;
      var items=[];
      table.querySelectorAll('tbody tr').forEach(function(tr){
        var a=tr.querySelector('a.link-product-field'); if(!a) return;
        var cell=a.closest('.editing-hide')||a.parentElement;
        var sku=skuOf(cell); if(!sku) return;
        items.push({ sku:sku, qty:qtyOf(tr) });
      });
      var box=h.parentNode && h.parentNode.querySelector('.lkcp-tiers');
      if(!items.length){ var b0=h.querySelector('.lkcp-sum'); if(b0) b0.remove(); if(box) box.remove(); return; }
      // скільки складників уже мають ціну (у кеші)
      var known=0;
      items.forEach(function(it){ if(it.sku in cache) known++; });
      var pend=(known<items.length);
      function sumFor(tierId){ var s=0; items.forEach(function(it){ if(it.sku in cache) s+=tierValue(cache[it.sku],tierId)*it.qty; }); return s; }
      // роздрібна — головний зелений бейдж (клік копіює суму)
      var retail=sumFor('retail');
      var badge=h.querySelector('.lkcp-sum');
      if(!badge){ badge=document.createElement('span'); badge.className='lkcp-sum';
        badge.title='Натисніть, щоб підставити суму в роздрібну ціну товару';
        badge.setAttribute('data-tier','retail');
        badge.addEventListener('click', onChipClick); h.appendChild(badge); }
      // пишемо, лише коли справді змінилось — інакше блимає на кожен пульс DOM
      var bCls='lkcp-sum'+(pend?' wait':'');
      var bTxt='Сума за роздрібом: '+fmtInt(retail)+(pend?' …':'');
      if(badge.className!==bCls) badge.className=bCls;
      if(badge.getAttribute('data-copy')!==String(Math.round(retail))) badge.setAttribute('data-copy', String(Math.round(retail)));
      if(badge.textContent!==bTxt) badge.textContent=bTxt;
      // типи цін — чипи під заголовком (клік по чипу копіює його суму)
      if(TIER_NAMES && showTiers){
        if(!box){ box=document.createElement('div'); box.className='lkcp-tiers'; box.addEventListener('click', onChipClick); h.insertAdjacentElement('afterend', box); }
        var ids=Object.keys(TIER_NAMES).sort(function(a,b){
          var ra=tierRank(TIER_NAMES[a]), rb=tierRank(TIER_NAMES[b]);
          return ra!==rb ? ra-rb : Number(a)-Number(b);
        });
        var html='';
        ids.forEach(function(id){
          var s=sumFor(id);
          html+='<span class="lkcp-chip" data-copy="'+Math.round(s)+'" data-tier="'+esc(id)+'"'
             +' title="Натисніть, щоб підставити суму в ціну «'+esc(TIER_NAMES[id])+'» цього товару">'
             +'<span class="l">'+esc(TIER_NAMES[id])+'</span>'+fmtInt(s)+(pend?' …':'')+'</span>';
        });
        if(box.getAttribute('data-sig')!==html){ box.setAttribute('data-sig', html); box.innerHTML=html; }
      } else if(box){ box.remove(); }   // режим перегляду — без чипів опт/майстри
    });
  }

  // таблиці комплекту (режим редагування + режим перегляду), не чіпаючи рядки заявки
  function scan(){
    kitTables().forEach(function(table){
      table.querySelectorAll('a.link-product-field').forEach(function(a){
        var cell=a.closest('.editing-hide')||a.parentElement;
        if(cell) decorate(cell);
      });
    });
    updateTotals();
  }
  var t=null; function scanSoon(){ clearTimeout(t); t=setTimeout(scan,300); }
  window.addEventListener('lkdom', scanSoon);
  scan();
})();
}catch(e){ try{ console.warn("[SD] модуль «lkComplectPrice» не запустився:", e); }catch(_){} }
/* ▲▲▲ МОДУЛЬ-END • lkComplectPrice ▲▲▲ */


/* ▼▼▼ МОДУЛЬ-START • lkAnalogInline — Інлайн-значок «🔁 аналог» у рядку товару ▼▼▼ */
/* ===== Інлайн-значок «🔁 аналог» у рядку товару (праворуч від «+» комплектів) ===== */
try{ // SD-ізоляція: помилка цього модуля не зупинить решту
(function lkAnalogInline() {
  'use strict';
  var PAGE = (typeof unsafeWindow !== 'undefined' && unsafeWindow) || window;

  var css = ''
    + '.lkan-plus{display:inline-flex;align-items:center;justify-content:center;height:17px;'
    + '  margin-left:8px;padding:0 7px;border-radius:9px;background:#00897B;color:#fff;'
    + '  font:700 11px/1 sans-serif;cursor:pointer;vertical-align:middle;user-select:none;white-space:nowrap}'
    + '.lkan-plus:hover{background:#00695C}'
    // список аналогів — таблиця-сітка з суцільною рамкою й лініями (назва | код | кнопка)
    + '.lkan-exp{margin:5px 0 3px;background:#f2fbfa;border:1px solid #00897B;border-radius:6px;'
    + '  overflow:hidden;font:12px/1.5 -apple-system,Segoe UI,Roboto,sans-serif;color:#0f3d39}'
    + '.lkan-exp .h{color:#00695c;font-weight:700;padding:6px 9px;border-bottom:1px solid #00897B;'
    + '  text-transform:uppercase;letter-spacing:.3px;font-size:11px;background:#e3f4f2}'
    + '.lkan-exp .r{display:grid;grid-template-columns:auto 1fr auto auto;align-items:stretch}'
    // колонка з фото товару (як у допродаж-банері) — щоб аналог було видно в обличчя
    + '.lkan-exp .r .phb{display:flex;align-items:center;justify-content:center;width:46px;'
    + '  background:#fff;border-right:1px solid rgba(0,137,123,.45);cursor:pointer}'
    + '.lkan-exp .r .phb img{max-width:40px;max-height:40px;object-fit:contain;display:none}'
    + '.lkan-exp .r .phb .no{color:#cfe0de;font-size:15px;line-height:1}'
    + '.lkan-exp .r+.r{border-top:1px solid rgba(0,137,123,.45)}'
    + '.lkan-exp .r .nm{color:#0f2b29;font-weight:600;min-width:0;padding:6px 9px;cursor:pointer;'
    + '  display:flex;flex-direction:column;justify-content:center;gap:2px;overflow-wrap:anywhere}'
    + '.lkan-exp .r .nm:hover .nmt{text-decoration:underline;color:#00695c}'
    + '.lkan-exp .r .nm .code{color:#00787a;font:600 10.5px/1.2 ui-monospace,Menlo,Consolas,monospace;'
    + '  opacity:.85;white-space:nowrap}'
    // колонка «наявність + ціна за джерелом заявки» (як у допродаж-банері)
    + '.lkan-exp .r .info{display:flex;flex-direction:column;justify-content:center;align-items:flex-end;'
    + '  gap:3px;padding:6px 9px;border-left:1px solid rgba(0,137,123,.45);white-space:nowrap;text-align:right}'
    + '.lkan-exp .r .info .stk{font:600 10.5px/1.1 sans-serif;padding:2px 6px;border-radius:999px;'
    + '  background:#eef4f3;color:#5a726f}'
    + '.lkan-exp .r .info .stk.yes{background:#E6F4EA;color:#1B5E20}'
    + '.lkan-exp .r .info .stk.no{background:#FDECEA;color:#B71C1C}'
    + '.lkan-exp .r .info .pr{font:800 13px/1.1 sans-serif;color:#14418f}'
    + '.lkan-exp .r .info .pr.dim{color:#9aa6a4;font-weight:600}'
    + '.lkan-exp .r .s{grid-column:1 / -1;color:#3a5e5a;font-style:italic;font-size:11.5px;'
    + '  padding:5px 9px;border-top:1px dashed rgba(0,137,123,.35)}'
    + '.lkan-add{border:none;border-left:1px solid rgba(0,137,123,.45);border-radius:0;'
    + '  background:#00897B;color:#fff;font:700 11px/1 sans-serif;padding:0 12px;cursor:pointer;'
    + '  white-space:nowrap}'
    + '.lkan-add:hover{background:#00695c}'
    + '.lkan-add.done{background:#9e9e9e;cursor:default}';
  var st = document.createElement('style'); st.textContent = css;
  (document.head || document.documentElement).appendChild(st);

  var BYSKU = PAGE.__sdAnalogBySku || null;
  PAGE.addEventListener('sdAnalogReady', function () {
    BYSKU = PAGE.__sdAnalogBySku || BYSKU;
    scanSoon();
  });

  function extractSku(cell) {
    var sku = '';
    cell.querySelectorAll('span').forEach(function (sp) {
      // ігноруємо коди всередині розгорнутих блоків (наші та комплектів),
      // інакше зчитаємо код аналога/набору замість коду товару в рядку
      if (sp.closest('.lkan-exp,.lknb-exp,.lkmk-exp')) return;
      var m = sp.textContent.trim().match(/^\(([\w\-]+)\)$/);
      if (m) sku = m[1];
    });
    return sku;
  }

  function addAnalog(code, btn) {
    if (!code || btn.classList.contains('done')) return;
    try {
      document.documentElement.setAttribute('data-sd-upsell-code', String(code));
      // аналог додаємо як ЗВИЧАЙНИЙ товар, а не допродаж (банер цей атрибут не ставить)
      document.documentElement.setAttribute('data-sd-upsell-mode', 'regular');
      document.documentElement.removeAttribute('data-sd-upsell-result');
      PAGE.dispatchEvent(new Event('sdUpsellAdd'));
    } catch (e) {}
    btn.classList.add('done');
    btn.textContent = '✓ Додано';
  }

  // відкрити картку товару в SalesDrive за кодом (той самий міст, що в комплектів)
  function openProduct(sku) {
    try {
      document.documentElement.setAttribute('data-sd-open-sku', String(sku));
      PAGE.dispatchEvent(new Event('sdOpenProduct'));
    } catch (e) {}
  }

  // формат грошей (окремий IIFE — pwMoney банера недоступний)
  function money(n) {
    n = Math.round(Number(n) * 100) / 100;
    if (!isFinite(n)) return '';
    var s = (n % 1 === 0) ? String(n) : n.toFixed(2);
    return s.replace('.', ',') + ' ₴';
  }
  function fmtQty(n) {
    n = Number(n);
    return (Math.abs(n - Math.round(n)) < 1e-9) ? String(Math.round(n)) : String(n);
  }

  // застосувати залишок+ціну до рядка аналога (slot: {stk, pr})
  function applyOne(slot, r) {
    if (!slot) return;
    var stk = slot.stk;
    stk.classList.remove('yes', 'no');
    if (!r || r.found === false) { stk.classList.add('no'); stk.textContent = '⚠ нема в каталозі'; }
    else if (r.qty == null) { stk.textContent = 'залишок —'; }
    else if (Number(r.qty) > 0) { stk.classList.add('yes'); stk.textContent = '✓ ' + fmtQty(r.qty) + ' шт'; }
    else { stk.classList.add('no'); stk.textContent = '✗ немає'; }

    // фото ставимо лише коли товар справді знайдено в каталозі —
    // для ненайденого коду картинка може бути чужою і збити з пантелику
    if (slot.ph && r && r.found !== false && r.img && slot.ph.getAttribute('src') !== r.img) slot.ph.src = r.img;

    var pr = slot.pr;
    if (r && r.found !== false && r.price && r.price.value != null) {
      pr.classList.remove('dim');
      pr.textContent = money(r.price.value);   // ціна за джерелом заявки (як при додаванні)
    } else {
      pr.classList.add('dim');
      pr.textContent = '—';
    }
  }

  // переставити рядки за наявністю (та сама логіка груп, що reorderByStock банера):
  // 0 — в наявності (за кількістю вниз), 1 — залишок невідомий, 2 — немає / нема в каталозі.
  function reorder(exp, rowsByCode, results) {
    var info = {};
    (results || []).forEach(function (r) { if (r && r.code != null) info[String(r.code)] = r; });
    var entries = Object.keys(rowsByCode).map(function (code) {
      var r = info[code] || {}, group, qty = 0;
      if (r.found !== false && r.qty != null && Number(r.qty) > 0) { group = 0; qty = Number(r.qty); }
      else if (r.found !== false && r.qty == null && info[code]) { group = 1; }
      else { group = 2; }
      return { row: rowsByCode[code].row, group: group, qty: qty };
    });
    entries.sort(function (a, b) {
      if (a.group !== b.group) return a.group - b.group;
      return b.qty - a.qty;
    });
    // .h лишається першим (його не чіпаємо); appendChild лише пересуває рядки .r після шапки
    entries.forEach(function (e) { if (e.row && e.row.parentNode === exp) exp.appendChild(e.row); });
  }

  // лінивий запит залишків+ціни через ТОЙ САМИЙ міст, що й допродаж-банер
  // (data-sd-stock-codes/token → подія sdUpsellStock → data-sd-stock-result/sdUpsellStockResult).
  function requestStock(exp, rowsByCode) {
    var codes = Object.keys(rowsByCode);
    if (!codes.length) return;
    var token = String(Date.now()) + '_' + Math.random().toString(36).slice(2);
    var tm = null, done = false;
    function finish() { if (done) return; done = true; PAGE.removeEventListener('sdUpsellStockResult', onRes); clearTimeout(tm); }
    function onRes() {
      var raw = document.documentElement.getAttribute('data-sd-stock-result');
      if (!raw) return;
      var data; try { data = JSON.parse(raw); } catch (e) { return; }
      if (!data || data.token !== token) return;   // чужа відповідь (напр., банера) — ігноруємо
      finish();
      (data.results || []).forEach(function (r) { applyOne(rowsByCode[String(r.code)], r); });
      reorder(exp, rowsByCode, data.results);
    }
    PAGE.addEventListener('sdUpsellStockResult', onRes);
    document.documentElement.setAttribute('data-sd-stock-codes', JSON.stringify(codes));
    document.documentElement.setAttribute('data-sd-stock-token', token);
    document.documentElement.removeAttribute('data-sd-stock-result');
    PAGE.dispatchEvent(new Event('sdUpsellStock'));
    tm = setTimeout(function () {
      finish();
      codes.forEach(function (c) {
        var slot = rowsByCode[c];
        if (slot && slot.pr.textContent === '…') { slot.pr.classList.add('dim'); slot.pr.textContent = '—'; }
        if (slot && slot.stk.textContent === '…') { slot.stk.textContent = 'залишок —'; }
      });
    }, 6000);
  }

  function inject(cell, list) {
    var skuSpan = [].slice.call(cell.querySelectorAll('span')).reverse()
      .find(function (sp) { return /^\([\w\-]+\)$/.test(sp.textContent.trim()); });

    var plus = document.createElement('span');
    plus.className = 'lkan-plus';
    plus.textContent = '🔁 аналоги';
    plus.title = 'Показати аналоги-заміну';

    var exp = document.createElement('div');
    exp.className = 'lkan-exp';
    exp.style.display = 'none';

    var head = document.createElement('div');
    head.className = 'h';
    head.textContent = 'Аналог / заміна:';
    exp.appendChild(head);

    var rowsByCode = {};   // код аналога -> {row, stk, pr} для залишків/ціни/сортування
    list.forEach(function (it) {
      var r = document.createElement('div');
      r.className = 'r';

      // фото товару (URL приходить тим самим мостом, що й залишок із ціною)
      var phb = document.createElement('span');
      phb.className = 'phb';
      phb.title = 'Відкрити картку товару';
      var ph = document.createElement('img');
      ph.alt = ''; ph.loading = 'eager';   // список короткий; lazy не вантажиться, поки рядок поза екраном
      ph.onerror = function () { ph.style.display = 'none'; noph.style.display = ''; };
      ph.onload = function () { ph.style.display = 'block'; noph.style.display = 'none'; };
      var noph = document.createElement('span');
      noph.className = 'no'; noph.textContent = '—';   // нейтральна позначка «фото немає»
      phb.appendChild(ph); phb.appendChild(noph);
      phb.addEventListener('click', function (e) {
        e.preventDefault(); e.stopPropagation();
        openProduct(it.sku);
      });
      r.appendChild(phb);

      var nm = document.createElement('span');
      nm.className = 'nm';
      nm.title = 'Відкрити картку товару';
      var nmT = document.createElement('span');
      nmT.className = 'nmt';
      nmT.textContent = it.c || ('код ' + it.sku);
      nm.appendChild(nmT);
      var code = document.createElement('span');
      code.className = 'code';
      code.textContent = 'код ' + it.sku;
      nm.appendChild(code);
      nm.addEventListener('click', function (e) {
        e.preventDefault(); e.stopPropagation();
        openProduct(it.sku);
      });
      r.appendChild(nm);

      // колонка наявності + ціни (заповнюється лениво при відкритті)
      var info = document.createElement('span');
      info.className = 'info';
      var stk = document.createElement('span');
      stk.className = 'stk';
      stk.textContent = '…';
      var pr = document.createElement('span');
      pr.className = 'pr dim';
      pr.textContent = '…';
      info.appendChild(stk);
      info.appendChild(pr);
      r.appendChild(info);

      var add = document.createElement('button');
      add.className = 'lkan-add';
      add.type = 'button';
      add.textContent = '➕ Додати';
      add.addEventListener('click', function (e) {
        e.preventDefault(); e.stopPropagation();
        addAnalog(it.sku, add);
      });
      r.appendChild(add);

      if (it.s) {
        var s = document.createElement('span');
        s.className = 's';
        s.textContent = it.s;
        r.appendChild(s);
      }
      exp.appendChild(r);
      rowsByCode[String(it.sku)] = { row: r, stk: stk, pr: pr, ph: ph };
    });

    var stockLoaded = false;
    plus.addEventListener('click', function (e) {
      e.preventDefault(); e.stopPropagation();
      var open = exp.style.display !== 'none';
      exp.style.display = open ? 'none' : 'block';
      // при першому розкритті — підтягнути залишок+ціну й відсортувати за наявністю
      if (!open && !stockLoaded) { stockLoaded = true; requestStock(exp, rowsByCode); }
    });

    // ставимо одразу ПРАВОРУЧ від помаранчевого «+» комплектів (якщо є), інакше — після коду
    var orange = cell.querySelector('.lknb-plus');
    if (orange) orange.insertAdjacentElement('afterend', plus);
    else if (skuSpan) skuSpan.insertAdjacentElement('afterend', plus);
    else cell.appendChild(plus);
    cell.appendChild(exp);
  }

  function processCell(cell) {
    if (!BYSKU) return;
    var sku = extractSku(cell);
    var list = sku ? BYSKU[sku] : null;
    var should = !!(list && list.length);
    var hasPlus = !!cell.querySelector('.lkan-plus');
    var prev = cell.getAttribute('data-lkan');
    if (prev === (sku || '') && hasPlus === should) return;
    cell.querySelectorAll('.lkan-plus,.lkan-exp').forEach(function (n) { n.remove(); });
    cell.setAttribute('data-lkan', sku || '');
    if (should) inject(cell, list);
  }

  function scan() {
    if (!BYSKU) return;
    document.querySelectorAll('a.link-product-field').forEach(function (a) {
      var cell = a.closest('.editing-hide') || a.parentElement;
      if (cell) processCell(cell);
    });
  }

  var t = null;
  function scanSoon() { clearTimeout(t); t = setTimeout(scan, 250); }

  scan();
  window.addEventListener('lkdom', scanSoon);
})();
}catch(e){ try{ console.warn("[SD] модуль «lkAnalogInline» не запустився:", e); }catch(_){} }
/* ▲▲▲ МОДУЛЬ-END • lkAnalogInline ▲▲▲ */


/* ▼▼▼ МОДУЛЬ-START • lkModalKits — Картка товару (модалка): рядок «Входить у набори» ▼▼▼ */
/* ===== Картка товару (модалка): рядок «Входить у набори» (джерело: баркод, ключ — ID) ===== */
try{ // SD-ізоляція: помилка цього модуля не зупинить решту
(function lkModalKits() {
  'use strict';

  // ---------- НАЛАШТУВАННЯ ----------
  const APP_URL   = 'https://barcode-printer-production-2b32.up.railway.app';
  const TOKEN     = 'nab_8Kx2pQ7mLr4tW9vZ';
  const TTL_MS    = 6 * 60 * 60 * 1000;
  const CACHE_KEY = 'lknb_cache2'; // спільний кеш із модулем «в рядках заявки» — не качаємо двічі
  // картка набору в SalesDrive за SKU (той самий шлях, що в рядках заявки):
  const CAT_URL = sku => 'https://komplektom.salesdrive.me/ua/index.html?formId=1#/product/index?filter%5Bsku%5D=' + encodeURIComponent(sku);
  // ----------------------------------

  const PAGE = (typeof unsafeWindow !== 'undefined' && unsafeWindow) || window;
  function openProduct(sku) {
    try { document.documentElement.setAttribute('data-sd-open-sku', String(sku)); PAGE.dispatchEvent(new Event('sdOpenProduct')); } catch (_) {}
  }

  const norm = s => String(s == null ? '' : s).replace(/\u00A0/g, ' ').trim();
  const esc  = s => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  let id2kits = null, loading = false;

  // мапа: ID складової -> [набори, в які вона входить]
  // індексуємо І за внутрішнім id, І за кодом (sku): у даних наборів id не завжди
  // збігається з ID у СРМ — через це в частини товарів рядок не зʼявлявся
  let sku2kits = new Map();
  function build(kitsObj) {
    const m = new Map();
    const ms = new Map();
    for (const kitSku of Object.keys(kitsObj || {})) {
      const info = kitsObj[kitSku] || {};
      for (const c of (info.comps || [])) {
        const rec = { code: kitSku, name: info.name || '', id: info.id || '' };
        const cid = norm(c.id);
        if (cid) { if (!m.has(cid)) m.set(cid, []); m.get(cid).push(rec); }
        const cs = norm(c.sku);
        if (cs) { if (!ms.has(cs)) ms.set(cs, []); ms.get(cs).push(rec); }
      }
    }
    sku2kits = ms;
    return m;
  }

  function fetchKits() {
    const url = APP_URL.replace(/\/+$/, '') + '/api/kits?token=' + encodeURIComponent(TOKEN);
    return new Promise((resolve, reject) => {
      const done = t => { try { const d = JSON.parse(t); d.ok ? resolve(d.kits || {}) : reject(new Error(d.error || 'no')); } catch (e) { reject(e); } };
      if (typeof GM_xmlhttpRequest !== 'undefined') {
        GM_xmlhttpRequest({
          method: 'GET', url,
          onload: r => (r.status >= 200 && r.status < 300) ? done(r.responseText) : reject(new Error('HTTP ' + r.status)),
          onerror: () => reject(new Error('net'))
        });
      } else { fetch(url).then(r => r.text()).then(done).catch(reject); }
    });
  }

  // як і в lkNaboryInline: кеш миттєво, старший за SOFT_MS — фонове оновлення
  const SOFT_MS = 30 * 60 * 1000;
  function refreshKitsBg() {
    if (loading) return;
    loading = true;
    fetchKits()
      .then(kits => {
        id2kits = build(kits);
        try { GM_setValue(CACHE_KEY, JSON.stringify({ ts: Date.now(), kits })); } catch (_) {}
        try { process(); } catch (_) {}
      })
      .catch(() => {})
      .then(() => { loading = false; });
  }
  async function ensureData() {
    if (id2kits || loading) return;
    let ts = 0;
    try { const c = GM_getValue(CACHE_KEY, null); if (c) { const o = JSON.parse(c); if (Date.now() - o.ts < TTL_MS && o.kits) { id2kits = build(o.kits); ts = o.ts; } } } catch (_) {}
    if (id2kits) { if (Date.now() - ts > SOFT_MS) refreshKitsBg(); return; }
    loading = true;
    try { const kits = await fetchKits(); id2kits = build(kits); try { GM_setValue(CACHE_KEY, JSON.stringify({ ts: Date.now(), kits })); } catch (_) {} }
    catch (e) { /* мовчки — спробуємо при наступному скані */ }
    finally { loading = false; }
  }

  // ---------- стилі (незалежні, з префіксом lkmk-) ----------
  const css = `
  .lkmk-plus{display:inline-flex;align-items:center;justify-content:center;width:16px;height:16px;
    border-radius:50%;background:#ef8a1f;color:#fff;font:700 12px/1 sans-serif;
    cursor:pointer;vertical-align:middle;user-select:none}
  .lkmk-plus:hover{background:#d97a12}
  .lkmk-cnt{margin-left:6px;color:#8a5a12;font:600 12px/1 -apple-system,Segoe UI,Roboto,sans-serif;vertical-align:middle}
  .lkmk-val{position:relative}
  .lkmk-exp{position:absolute;top:100%;left:0;margin-top:4px;z-index:9999;display:none;
    box-sizing:border-box;width:560px;max-width:72vw;columns:200px;column-gap:20px;
    padding:10px 14px;border:1px solid #f0c98a;border-left:3px solid #ef8a1f;background:#fffdf8;
    border-radius:6px;box-shadow:0 8px 22px rgba(0,0,0,.13);
    font:13px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif;color:#222;
    -webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility}
  .lkmk-exp .r{break-inside:avoid;-webkit-column-break-inside:avoid;padding:4px 0;margin-bottom:2px}
  .lkmk-exp .r a.lk{color:#0a58ca;text-decoration:none;font-weight:700;cursor:pointer}
  .lkmk-exp .r a.lk:hover{color:#0843a0;text-decoration:underline}
  .lkmk-exp .r .nm{color:#444}
  .lkmk-exp .r a.led{color:#6b8e23;margin:0 2px 0 5px;text-decoration:none;font-weight:400}
  .lkmk-exp .r a.led:hover{color:#ef8a1f}`;
  const st = document.createElement('style'); st.textContent = css;
  (document.head || document.documentElement).appendChild(st);

  // ---------- пошук модалки товару та поля ID ----------
  function findModalInfo() {
    const incs = document.querySelectorAll('[ng-include]');
    for (const el of incs) {
      if ((el.getAttribute('ng-include') || '').indexOf('product-view-info') !== -1) return el;
    }
    return null;
  }

  function findIdRow(root) {
    const labels = root.querySelectorAll('label.control-label-24');
    for (const lb of labels) {
      if (norm(lb.textContent) === 'ID') {
        const valDiv = lb.parentElement ? lb.parentElement.querySelector('.width-200px-important') : null;
        const outer  = lb.closest('.left.p-right10') || lb.closest('.p-right10');
        return { valDiv, outer };
      }
    }
    return null;
  }

  function buildExp(kits) {
    let h = '';
    for (const k of kits) {
      const eid = String(k.id || '').replace(/^id_/, '');
      const edit = eid ? ' <a class="led" href="#/product/update/' + esc(eid) + '" title="Редагувати товар"><i class="fa fa-pencil"></i></a>' : '';
      const kitHref = (window.sdProdLink ? window.sdProdLink.url(k.code, true) : CAT_URL(k.code));
      h += '<div class="r"><a class="lk" data-sku="' + esc(k.code) + '" data-sd-sku="' + esc(k.code) + '" data-sd-kit="1" href="' + kitHref +
           '" target="_blank" rel="noopener" title="Відкрити картку набору">' + esc(k.code) + '</a>' + edit +
           ' · <span class="nm">' + esc(k.name) + '</span></div>';
    }
    return h;
  }

  function buildRow(kits, id) {
    const outer = document.createElement('div');
    outer.className = 'left p-right10 width-350 lkmk-row';
    outer.setAttribute('data-id', id);

    const fg = document.createElement('div');
    fg.className = 'form-group m-bot0 m-top0';

    const label = document.createElement('label');
    label.className = 'left text-right m-right7 control-label control-label-24 m-top5';
    label.innerHTML = 'Входить у набори&nbsp;';

    const val = document.createElement('div');
    val.className = 'left width-200px-important m-top7 lkmk-val';

    const plus = document.createElement('span');
    plus.className = 'lkmk-plus'; plus.textContent = '+'; plus.title = 'Показати набори';

    const cnt = document.createElement('span');
    cnt.className = 'lkmk-cnt'; cnt.textContent = kits.length;

    const exp = document.createElement('div');
    exp.className = 'lkmk-exp'; exp.innerHTML = buildExp(kits);

    plus.addEventListener('click', e => {
      e.preventDefault(); e.stopPropagation();
      const open = exp.style.display === 'block';
      exp.style.display = open ? 'none' : 'block';
      plus.textContent = open ? '+' : '–';
    });
    // клік по коду набору — відкрити картку набору в SalesDrive (той самий міст, що в рядках заявки)
    exp.addEventListener('click', e => {
      const a = e.target.closest('a.lk'); if (!a) return;
      e.stopPropagation();
      const sku = a.getAttribute('data-sku');
      if (sku) { e.preventDefault(); openProduct(sku); }
    });

    val.appendChild(plus); val.appendChild(cnt); val.appendChild(exp);
    fg.appendChild(label); fg.appendChild(val);
    outer.appendChild(fg);
    return outer;
  }

  function process() {
    if (!id2kits) return;
    const root = findModalInfo();
    if (!root) return;
    const idRow = findIdRow(root);
    if (!idRow || !idRow.outer || !idRow.valDiv) return;
    const id = norm(idRow.valDiv.textContent);
    if (!id) return;

    const existing = root.querySelector('.lkmk-row');
    if (existing && existing.getAttribute('data-id') === id) return; // вже стоїть для цього товару
    root.querySelectorAll('.lkmk-row').forEach(n => n.remove());     // інший товар / дубль — прибрати

    let kits = id2kits.get(id) || [];
    if (!kits.length) {
      // фолбек за кодом: беремо значення рядка «SKU» у картці
      let sku = '';
      root.querySelectorAll('label').forEach(l => {
        if (sku) return;
        if (/^SKU$/i.test(norm(l.textContent))) {
          const outer = l.parentElement;
          if (outer) sku = norm(String(outer.textContent || '').replace(norm(l.textContent), ''));
        }
      });
      if (sku) kits = sku2kits.get(sku) || [];
    }
    if (!kits.length) return;                                        // не входить у жоден набір — рядка немає

    idRow.outer.insertAdjacentElement('afterend', buildRow(kits, id));
  }

  let t = null;
  function scanSoon() { clearTimeout(t); t = setTimeout(process, 200); }

  (async function init() {
    await ensureData();
    process();
    window.addEventListener('lkdom', scanSoon);
  })();
})();
}catch(e){ try{ console.warn("[SD] модуль «lkModalKits» не запустився:", e); }catch(_){} }
/* ▲▲▲ МОДУЛЬ-END • lkModalKits ▲▲▲ */

/* ▼▼▼ МОДУЛЬ-START • lkUpsellRedesign — Компактний вигляд картки допродажу ▼▼▼ */
/* ===== Компактна картка допродажу в спокійних сіро-синіх тонах.
   Рядок товару — сітка з ФІКСОВАНИМИ колонками, тож артикул, наявність, ціна
   й кнопка стоять рівно одне під одним у всіх рядках (як таблиця).
   Артикул виносимо з кнопки в окрему колонку — інакше він «плаває».
   На вузькому екрані сітка згортається у два рядки. ===== */
try{ // SD-ізоляція: помилка цього модуля не зупинить решту
(function lkUpsellRedesign() {
  'use strict';
  var css = ''
    // ── контейнер
    + '#sd-upsell-hint{padding:8px 34px 9px 13px;max-width:none;width:100%;margin:10px 0 6px 0;'
    + '  background:#F7F9FC;border:1px solid #DCE3EC;border-left:5px solid #4B7BB0;'
    + '  border-radius:11px;box-shadow:0 2px 10px rgba(40,70,110,.10);'
    + '  font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif;color:#1E3350}'
    + '#sd-upsell-hint .sd-x{top:7px;right:11px;font-size:20px;color:#6B7E96}'
    + '#sd-upsell-hint .sd-x:hover{color:#2E4A69}'
    // ── рядок товару = сітка: фото | назва+скрипт | артикул | наявність | ціна | кнопка
    + '#sd-upsell-hint .sd-item{display:grid;align-items:center;gap:2px 12px;padding:7px 0;margin-top:0;'
    + '  border-top:1px solid #E7EDF4;'
    // Колонку назви НЕ розтягуємо на всю ширину (було 1fr) — інакше при короткій
    // назві наявність/ціна/кнопка тікають аж на правий край і між ними діра.
    // Назва росте лише до 520px, а зайва ширина йде в порожню колонку в кінці;
    // рядок скрипта займає всю ширину, тож праворуч не лишається пустки.
    + '  grid-template-columns:38px minmax(200px,520px) 138px 112px 124px 1fr;'
    + '  grid-template-areas:"img name stock price add ." "img script script script script script"}'
    + '#sd-upsell-hint .sd-item:first-of-type{border-top:none}'
    // display:contents — щоб діти .sd-main і .sd-action стали клітинками спільної сітки
    + '#sd-upsell-hint .sd-main{display:contents}'
    + '#sd-upsell-hint .sd-action{display:contents}'
    // ── фото
    + '#sd-upsell-hint .sd-comp-img{grid-area:img;width:38px;height:38px;border-radius:8px;'
    + '  border:1px solid #DEE5EE;background:#fff}'
    // ── назва + скрипт
    + '#sd-upsell-hint .sd-name{grid-area:name;font-size:13px;font-weight:700;letter-spacing:.2px;'
    + '  color:#1D3E68;line-height:1.3;margin:0;text-transform:uppercase;overflow-wrap:anywhere}'
    + '#sd-upsell-hint .sd-say{display:none}'
    + '#sd-upsell-hint .sd-script{grid-area:script;font-size:13.5px;font-weight:500;line-height:1.45;'
    + '  color:#3E4F66;background:transparent;border:none;padding:2px 0 0;margin:0;'
    + '  overflow-wrap:anywhere;box-shadow:none}'
    // ── артикул окремою колонкою (переносимо його з кнопки, див. нижче)
    // артикул — одразу за назвою (як у таблиці товарів СРМ), щоб не було
    // порожньої смуги між короткою назвою і колонками праворуч
    + '#sd-upsell-hint .sd-code{display:inline-block;vertical-align:middle;margin-left:8px;white-space:nowrap;'
    + '  font:700 12px/1.4 ui-monospace,Menlo,Consolas,monospace;color:#34485F;'
    + '  background:#E7EEF8;border:1px solid #CBD9EA;border-radius:5px;padding:1px 6px;'
    + '  text-transform:none;letter-spacing:0}'
    // ── назва-посилання на картку товару (артикул усередині нього ж).
    // Підкреслення не переходить на артикул: він inline-block.
    + '#sd-upsell-hint .sd-nlink{color:inherit;text-decoration:none;cursor:pointer}'
    + '#sd-upsell-hint .sd-nlink:hover{color:#0F5FA8;text-decoration:underline}'
    + '#sd-upsell-hint .sd-nlink:hover .sd-code{background:#DCE8F7;border-color:#A9C4E4;color:#1A4F86}'
    // ── наявність
    + '#sd-upsell-hint .sd-stock{grid-area:stock;justify-self:start;font-size:12px;font-weight:700;'
    + '  padding:3px 9px;border-radius:999px;white-space:nowrap}'
    + '#sd-upsell-hint .sd-stock-yes{background:#E6F2EA;color:#1F5936;border:1px solid #BFDBC9}'
    + '#sd-upsell-hint .sd-stock-no{background:#FAE9E6;color:#8B2C23;border:1px solid #E7C4BE}'
    + '#sd-upsell-hint .sd-stock-wait,#sd-upsell-hint .sd-stock-unk{background:#EDF0F5;color:#4E5C6E;'
    + '  border:1px solid #DBE1EA;font-weight:600}'
    // ── ціна
    + '#sd-upsell-hint .sd-price{grid-area:price;justify-self:stretch;display:flex;align-items:baseline;'
    + '  justify-content:center;gap:5px;padding:3px 8px;border-radius:8px;'
    + '  background:#E7EEF8;border:1px solid #CBD9EA}'
    + '#sd-upsell-hint .sd-price-lab{font-size:11px;font-weight:600;color:#51637D}'
    + '#sd-upsell-hint .sd-price-val{font-size:17px;font-weight:800;color:#14335A}'
    // ── кнопка
    + '#sd-upsell-hint .sd-add{grid-area:add;width:100%;padding:8px 10px;font-size:13.5px;font-weight:700;'
    + '  border-radius:9px;background:#3D7A52;display:flex;align-items:center;justify-content:center;'
    + '  gap:5px;line-height:1.2;white-space:nowrap}'
    + '#sd-upsell-hint .sd-add:hover{background:#336646}'
    + '#sd-upsell-hint .sd-add.sd-done{background:#9AA6B2}'
    + '#sd-upsell-hint .sd-sku{display:none}'   // код тепер в окремій колонці
    // ── Поки відкрита картка товару (чи випадайка пошуку) банер НЕ ховаємо —
    // менеджер бачить його під вікном. Ядро ховало банер лише тому, що в нього
    // z-index:9999 і він перекривав би модалку; опускаємо z-index — і модалка
    // лягає зверху сама. Селектор із body — щоб перебити правило ядра.
    + 'html.sd-modal-open body #sd-upsell-hint{display:block !important;z-index:0 !important}'
    // ── СПІЛЬНА сітка на весь банер (subgrid): колонка назви шириною рівно
    // під найдовшу назву в банері, тож наявність/ціна/кнопка стоять одразу за
    // назвами і водночас рівно одна під одною в усіх рядках.
    // Базовий варіант вище (фіксовані 520px) лишається як запас для старих
    // браузерів без subgrid — там просто трохи ширша колонка назви.
    + '@media (min-width:1101px){@supports (grid-template-columns:subgrid){'
    + '  #sd-upsell-hint{display:grid;column-gap:12px;row-gap:0;'
    + '    grid-template-columns:38px minmax(200px,max-content) 138px 112px 124px 1fr}'
    + '  #sd-upsell-hint .sd-item{grid-column:1/-1;display:grid;grid-template-columns:subgrid;'
    + '    grid-template-rows:auto auto;column-gap:12px;row-gap:2px}'
    + '  #sd-upsell-hint .sd-comp-img{grid-column:1;grid-row:1/3;align-self:center}'
    + '  #sd-upsell-hint .sd-name{grid-column:2;grid-row:1}'
    + '  #sd-upsell-hint .sd-stock{grid-column:3;grid-row:1}'
    + '  #sd-upsell-hint .sd-price{grid-column:4;grid-row:1}'
    + '  #sd-upsell-hint .sd-add{grid-column:5;grid-row:1}'
    + '  #sd-upsell-hint .sd-script{grid-column:2/-1;grid-row:2}'
    // під модалкою лишаємо ту саму сітку, лише опущений z-index (див. вище)
    + '  html.sd-modal-open body #sd-upsell-hint{display:grid !important}'
    + '}}'
    // ── вузький екран: колонки згортаються у другий рядок
    + '@media (max-width:1100px){'
    + '  #sd-upsell-hint .sd-item{grid-template-columns:38px 1fr auto auto;'
    + '    grid-template-areas:"img name name name" "img script script script" "img stock price price" "img add add add";'
    + '    row-gap:5px}'
    + '  #sd-upsell-hint .sd-add{justify-self:start;width:auto;padding:7px 14px}'
    + '}';
  var st = document.createElement('style');
  st.textContent = css;
  (document.head || document.documentElement).appendChild(st);

  var PAGE = (typeof unsafeWindow !== 'undefined' && unsafeWindow) ? unsafeWindow : window;

  // Клік по назві відкриває ТУ САМУ модалку-картку товару, що й клік по товару
  // в рядку заявки (viewModel.showItem) — міст sdOpenProduct у ядрі.
  // Заявка при цьому лишається відкритою, нічого не втрачається.
  function openProduct(sku) {
    try {
      document.documentElement.setAttribute('data-sd-open-sku', String(sku));
      PAGE.dispatchEvent(new Event('sdOpenProduct'));
    } catch (e) {}
  }

  // Запасний шлях (Ctrl/⌘/середня кнопка — «відкрити в новій вкладці»):
  // ID товару за кодом дістає модуль lkProdLink (внутрішній довідник СРМ, кеш
  // на добу); поки ID невідомий — веде в каталог, відфільтрований по цьому коду.
  function prodHref(sku) {
    try { if (window.sdProdLink && window.sdProdLink.url) return window.sdProdLink.url(sku, false); } catch (e) {}
    return '/ua/index.html?formId=1#/product/index?filter%5Bsku%5D=' + encodeURIComponent(sku);
  }
  // Артикул із кнопки «➕ Додати» переносимо до назви, а саму назву загортаємо
  // в посилання. Робимо це на пульс DOM, ідемпотентно.
  function decorate() {
    var box = document.getElementById('sd-upsell-hint'); if (!box) return;
    [].forEach.call(box.querySelectorAll('.sd-item'), function (item) {
      if (item.querySelector('.sd-nlink')) return;
      var skuEl = item.querySelector('.sd-add .sd-sku'); if (!skuEl) return;
      var sku = String(skuEl.textContent || '').replace(/^код\s*/i, '').trim();
      var nameEl = item.querySelector('.sd-name'); if (!nameEl || !sku) return;
      var a = document.createElement('a');
      a.className = 'sd-nlink';
      a.setAttribute('data-sd-sku', sku);
      a.setAttribute('data-sd-kit', '0');      // супутній — звичайний товар, не набір
      a.setAttribute('href', prodHref(sku));
      a.setAttribute('target', '_blank');
      a.setAttribute('rel', 'noopener');
      a.title = 'Відкрити картку товару (Ctrl+клік — у новій вкладці)';
      a.addEventListener('click', function (e) {
        if (e.ctrlKey || e.metaKey || e.shiftKey || e.button === 1) return; // хай браузер відкриє вкладку
        e.preventDefault();
        openProduct(sku);
      });
      while (nameEl.firstChild) a.appendChild(nameEl.firstChild);
      var code = document.createElement('span');
      code.className = 'sd-code';
      code.textContent = sku;
      a.appendChild(code);
      nameEl.appendChild(a);
    });
    try { if (window.sdProdLink && window.sdProdLink.paint) window.sdProdLink.paint(); } catch (e) {}
  }
  decorate();
  window.addEventListener('lkdom', decorate);
})();
}catch(e){ try{ console.warn("[SD] модуль «lkUpsellRedesign» не запустився:", e); }catch(_){} }
/* ▲▲▲ МОДУЛЬ-END • lkUpsellRedesign ▲▲▲ */

/* ▼▼▼ МОДУЛЬ-START • lkStockPayWarn — Банер: передоплата + малий залишок → перевір склад ▼▼▼ */
/* ===== Банер: передоплатна оплата + малий залишок → перевір склад ===== */
try{ // SD-ізоляція: помилка цього модуля не зупинить решту
(function lkStockPayWarn() {
  'use strict';

  var THRESHOLD = 2; // залишок ≤2 (0 і мінус теж) = сигнал
  // ID способів оплати (number:XX). Передоплата/гроші наперед → показуємо банер:
  var WARN_IDS = { 88:1, 62:1, 132:1, 18:1, 58:1, 42:1, 20:1, 84:1, 28:1, 136:1 };
  // Оплата при отриманні / самовивіз / накладений платіж → банер НЕ потрібен:
  var SAFE_IDS = { 96:1, 100:1, 44:1, 21:1, 26:1, 81:1 };

  function norm(s){ return String(s==null?'':s).replace(/\u00A0/g,' ').trim(); }
  function onOrderPage(){ return /\/order\/\w+\/\d+/.test(location.hash||''); } // лише картка заявки з ID, не список
  function orderKey(){ var m=(location.hash||'').match(/order\/\w+\/(\d+)/); return m?m[1]:(location.hash||''); }

  function paymentId(){
    var sel=document.getElementById('payment_method-wk');
    if(sel && 'value' in sel){ var m=String(sel.value||'').match(/(\d+)/); if(m) return parseInt(m[1],10); }
    var alt=document.querySelector('select[id*="payment_method"],select[name*="payment"]');
    if(alt && 'value' in alt){ var m2=String(alt.value||'').match(/(\d+)/); if(m2) return parseInt(m2[1],10); }
    return null;
  }
  function paymentText(){
    var c=document.getElementById('select2-payment_method-wk-container')
        || document.querySelector('[id^="select2-payment_method"][id$="-container"]');
    return c ? norm(c.getAttribute('title')||c.textContent) : '';
  }
  function isWarnPayment(){
    var id=paymentId();
    if(id!=null){ if(WARN_IDS[id]) return true; if(SAFE_IDS[id]) return false; }
    var t=paymentText().toLowerCase();
    if(!t || t==='---') return false;
    var SAFE_RE=[/при отриманн/,/наложен/,/готівк/,/термінал/,/зворотн/,/самовив/];
    for(var i=0;i<SAFE_RE.length;i++){ if(SAFE_RE[i].test(t)) return false; }
    var WARN_RE=[/розрахунков/,/передоплат/,/частинами|частями/,/приват/,/monobank|моно/,/олх/,/пром-?оплат/,/liqpay/,/wayforpay/,/googlepay|apple ?pay/];
    for(var j=0;j<WARN_RE.length;j++){ if(WARN_RE[j].test(t)) return true; }
    return false;
  }

  function lowStock(){
    var items;
    try{ items=JSON.parse(document.documentElement.getAttribute('data-sd-order-items'))||[]; }
    catch(e){ return null; }
    var low=[];
    items.forEach(function(it){
      if(!it) return;
      var r=it.rest;
      if(r==null || isNaN(r)) return;     // невідомий залишок — не чіпаємо
      if(r<=THRESHOLD) low.push({ name: it.name||'', rest: r });
    });
    return low;
  }

  // ---- стиль (жовто-помаранчевий банер угорі, як про рейтинг) ----
  var css = ''
    + '#sd-stockpay-warn{position:relative;margin:10px 0;padding:11px 34px 11px 12px;'
    + '  border:1px solid #e0a500;border-left:4px solid #e07b00;background:#fff6e6;border-radius:6px;'
    + '  font:13px/1.5 -apple-system,"Segoe UI",Roboto,Arial,sans-serif;color:#6b3e00;max-width:980px;box-sizing:border-box}'
    + '#sd-stockpay-warn .sd-x{position:absolute;top:6px;right:8px;border:none;background:transparent;cursor:pointer;'
    + '  font-size:18px;line-height:1;color:#a05a00;opacity:.6}'
    + '#sd-stockpay-warn .sd-x:hover{opacity:1}'
    + '#sd-stockpay-warn .sp-top{font-weight:800;font-size:14.5px;color:#c0392b;margin-bottom:3px}'
    + '#sd-stockpay-warn .sp-why{margin-bottom:7px;color:#7a4a00}'
    + '#sd-stockpay-warn .sp-row{padding:3px 0;border-top:1px dashed #eccf9a;display:flex;flex-wrap:wrap;gap:2px 10px}'
    + '#sd-stockpay-warn .sp-name{flex:1 1 280px;min-width:0;font-weight:600}'
    + '#sd-stockpay-warn .sp-rest{white-space:nowrap;font-weight:800;color:#c0392b}'
    + '#sd-stockpay-warn .sp-esc{font-weight:800;color:#b71c1c;background:#fdecea;border:1px solid #f5b7b1;'
    + '  border-radius:5px;padding:5px 9px;margin-bottom:7px}'
    + 'html.sd-modal-open #sd-stockpay-warn{display:none !important}';
  var st=document.createElement('style'); st.textContent=css;
  (document.head||document.documentElement).appendChild(st);

  function removeWarn(){ var o=document.getElementById('sd-stockpay-warn'); if(o) o.remove(); }

  function insertPoint(){
    var btn=null, all=document.querySelectorAll('[ng-click]');
    for(var i=0;i<all.length;i++){
      if((all[i].getAttribute('ng-click')||'').replace(/\s+/g,'')==='viewModel.addOption()'){ btn=all[i]; break; }
    }
    if(!btn) btn=document.getElementById('addCompleteProduct');
    if(!btn) return null;
    var tbl=btn.closest('table');
    if(tbl && tbl.parentElement && tbl.parentElement!==document.body) return { parent: tbl.parentElement, ref: tbl };
    return null;
  }

  function fmtRest(r){ return (Math.abs(r-Math.round(r))<1e-9 ? String(Math.round(r)) : String(r)); }

  function curSig(){
    return orderKey()+'|'+(isWarnPayment()?'1':'0')+'|'+(document.documentElement.getAttribute('data-sd-order-items')||'');
  }

  function render(low, sp){
    var sig=curSig();
    var existing=document.getElementById('sd-stockpay-warn');
    if(existing && existing.getAttribute('data-sig')===sig) return; // вже намальовано для цього стану
    removeWarn();

    var box=document.createElement('div');
    box.id='sd-stockpay-warn';
    box.setAttribute('data-sig',sig);

    var top=document.createElement('div');
    top.className='sp-top';
    top.textContent='📦 Перевір фізичну наявність на складі!';
    box.appendChild(top);

    var why=document.createElement('div');
    why.className='sp-why';
    why.textContent='У замовленні є товар із малим залишком. Переконайся, що він реально є на складі — особливо якщо оплата передоплатна (на рахунок, карта, онлайн).';
    box.appendChild(why);

    if(isWarnPayment()){
      var esc=document.createElement('div');
      esc.className='sp-esc';
      esc.textContent='⚠️ Зараз обрана передоплатна оплата — перевір склад обовʼязково.';
      box.appendChild(esc);
    }

    low.forEach(function(p){
      var row=document.createElement('div'); row.className='sp-row';
      var nm=document.createElement('span'); nm.className='sp-name'; nm.textContent=p.name;
      var rs=document.createElement('span'); rs.className='sp-rest'; rs.textContent='залишок: '+fmtRest(p.rest)+' шт';
      row.appendChild(nm); row.appendChild(rs);
      box.appendChild(row);
    });

    var anchor=document.getElementById('sd-rating-warn')||document.getElementById('sd-price-warn')||sp.ref;
    sp.parent.insertBefore(box, anchor); // найвище — над іншими банерами/таблицею
  }

  function evaluate(){
    if(document.documentElement.classList.contains('sd-modal-open')) return; // не заважаємо модалці товару
    var sp=insertPoint();              // якір — таблиця товарів картки заявки (як у допродажах)
    if(!sp || !onOrderPage()){ removeWarn(); return; } // нема картки заявки → банера нема (і на списку теж)
    var low=lowStock();
    if(low===null) return;            // даних ще нема
    if(!low.length){ removeWarn(); return; }
    render(low, sp);                   // показуємо завжди, коли є малий залишок (стало)
  }

  var BUS=(typeof unsafeWindow!=='undefined' && unsafeWindow) ? unsafeWindow : window;
  BUS.addEventListener('sdOrderItems', evaluate);
  window.addEventListener('hashchange', evaluate); // миттєво прибрати при виході із заявки
  setInterval(evaluate, 2500);        // ловить зміну способу оплати
  setTimeout(evaluate, 800);
})();
}catch(e){ try{ console.warn("[SD] модуль «lkStockPayWarn» не запустився:", e); }catch(_){} }
/* ▲▲▲ МОДУЛЬ-END • lkStockPayWarn ▲▲▲ */

/* ▼▼▼ МОДУЛЬ-START • lkBundleFix — 🧹 «Разом дешевше»: прибрати NEW PRODUCT і перерахувати ціни ▼▼▼ */
/* ===== Кнопка в заявці з NEW PRODUCT: видалити службові рядки, ціни товарів → сума акції ===== */
try{ // SD-ізоляція: помилка цього модуля не зупинить решту
(function lkBundleFix(){
  'use strict';
  var PAGE=(typeof unsafeWindow!=='undefined'&&unsafeWindow)||window;

  var css=''
    +'#sd-bundle-fix{position:relative;margin:10px 0;padding:10px 34px 10px 12px;'
    +'  border:1px solid #7bb3a9;border-left:4px solid #00897B;background:#eef8f6;border-radius:6px;'
    +'  font:13px/1.5 -apple-system,"Segoe UI",Roboto,Arial,sans-serif;color:#0f3d39;max-width:980px;box-sizing:border-box}'
    +'#sd-bundle-fix .bf-top{font-weight:700;color:#00695c;margin-bottom:6px}'
    +'#sd-bundle-fix .bf-btn{cursor:pointer;border:none;background:#00897B;color:#fff;font-weight:700;'
    +'  padding:7px 14px;border-radius:6px;font-size:13px}'
    +'#sd-bundle-fix .bf-btn:hover{background:#00695c}'
    +'#sd-bundle-fix .bf-btn[disabled]{background:#9e9e9e;cursor:default}'
    +'#sd-bundle-fix .bf-res{margin-left:10px;font-weight:700}'
    +'#sd-bundle-fix .bf-res.ok{color:#1B5E20}'
    +'#sd-bundle-fix .bf-res.er{color:#B71C1C}'
    +'html.sd-modal-open #sd-bundle-fix{display:none !important}';
  var st=document.createElement('style'); st.textContent=css;
  (document.head||document.documentElement).appendChild(st);

  // місце вставки — перед таблицею товарів (як у lkStockPayWarn: якір — кнопка «+ Додати»)
  function findSpot(){
    var btn=null, all=document.querySelectorAll('[ng-click]');
    for(var i=0;i<all.length;i++){
      if((all[i].getAttribute('ng-click')||'').replace(/\s+/g,'')==='viewModel.addOption()'){ btn=all[i]; break; }
    }
    if(!btn) btn=document.getElementById('addCompleteProduct');
    if(!btn) return null;
    var tbl=btn.closest('table');
    if(tbl && tbl.parentElement && tbl.parentElement!==document.body) return { parent: tbl.parentElement, ref: tbl };
    return null;
  }

  function runFix(box){
    var b=box.querySelector('.bf-btn'), res=box.querySelector('.bf-res');
    b.disabled=true; res.textContent='працюю…'; res.className='bf-res';
    var token=String(Date.now())+'_'+Math.random().toString(36).slice(2);
    // fin: ядро відповідає СИНХРОННО під час dispatchEvent, тобто ще до того, як
    // нижче призначиться tm — тоді clearTimeout(null) нічого не чистить і «мертвий»
    // таймер потім затирає готовий результат написом «нема відповіді».
    var tm=null, fin=false;
    function onRes(){
      var raw=document.documentElement.getAttribute('data-sd-bundle-result');
      if(!raw) return;
      var d; try{ d=JSON.parse(raw); }catch(e){ return; }
      if(!d || d.token!==token) return;
      fin=true;
      PAGE.removeEventListener('sdBundleFixResult', onRes); clearTimeout(tm);
      if(d.ok){
        box.setAttribute('data-done','1');
        var s=(d.sum!=null?d.sum:d.target);
        var mism=(d.sum!=null && Math.abs(d.sum-d.target)>=0.01);
        box.innerHTML='<div class="bf-top">✓ Рядків NEW PRODUCT видалено: '+d.removed
          +'. Разом тепер '+String(s.toFixed(2)).replace('.',',')+' ₴ (ціль акції '
          +String(d.target.toFixed(2)).replace('.',',')+' ₴).'
          +(mism?' ⚠ СУМИ НЕ ЗБІГЛИСЬ — не зберігай, напиши Клоду!':'')
          +(d.warn?' ⚠ '+d.warn+'.':'')
          +' Спершу «Зберегти», потім ТТН.</div>';
        setTimeout(function(){ try{ box.remove(); }catch(e){} }, mism?60000:15000);
      }else{
        b.disabled=false; res.className='bf-res er'; res.textContent='✗ '+(d.err||'не вийшло');
      }
    }
    PAGE.addEventListener('sdBundleFixResult', onRes);
    document.documentElement.setAttribute('data-sd-bundle-token', token);
    document.documentElement.removeAttribute('data-sd-bundle-result');
    PAGE.dispatchEvent(new Event('sdBundleFix'));
    tm=setTimeout(function(){
      if(fin) return;
      PAGE.removeEventListener('sdBundleFixResult', onRes);
      b.disabled=false; res.className='bf-res er'; res.textContent='✗ нема відповіді';
    },20000);
  }

  function build(){
    var box=document.createElement('div'); box.id='sd-bundle-fix';
    var top=document.createElement('div'); top.className='bf-top';
    var ver=''; try{ if(typeof GM_info!=='undefined'&&GM_info.script&&GM_info.script.version) ver=' · v'+GM_info.script.version; }catch(e){}
    top.textContent='🧹 Замовлення «Разом дешевше»: є службові рядки NEW PRODUCT'+ver+'.';
    var b=document.createElement('button'); b.type='button'; b.className='bf-btn';
    b.textContent='Прибрати NEW PRODUCT і перерахувати ціни';
    var res=document.createElement('span'); res.className='bf-res';
    b.addEventListener('click', function(e){ e.preventDefault(); e.stopPropagation(); runFix(box); });
    box.appendChild(top); box.appendChild(b); box.appendChild(res);
    return box;
  }

  function sync(){
    var old=document.getElementById('sd-bundle-fix');
    if(old && old.getAttribute('data-done')) return;   // показуємо результат — не чіпаємо
    var spot=findSpot();
    var need=!!(spot && /NEW\s*PRODUCT/i.test(spot.ref.textContent||''));
    if(!need){ if(old) old.remove(); return; }
    if(old) return;
    spot.parent.insertBefore(build(), spot.ref);
  }

  var t=null;
  function syncSoon(){ clearTimeout(t); t=setTimeout(sync,350); }
  sync();
  window.addEventListener('lkdom', syncSoon);
})();
}catch(e){ try{ console.warn("[SD] модуль «lkBundleFix» не запустився:", e); }catch(_){} }
/* ▲▲▲ МОДУЛЬ-END • lkBundleFix ▲▲▲ */

/* ▼▼▼ МОДУЛЬ-START • lkChatFailWarn — ⛔ чат: повідомлення НЕ доставлено (нема Viber/Telegram) ▼▼▼ */
/* ===== Менеджер пише у Viber/Telegram, а в клієнта їх нема на номері — СРМ показує лише
   крихітну сіру іконку, менеджер не бачить і дарма чекає відповіді. Робимо це помітним:
   підсвітка рядка + бейдж «НЕ ДОСТАВЛЕНО» + червоний банер над чатом із причиною. ===== */
try{ // SD-ізоляція: помилка цього модуля не зупинить решту
(function lkChatFailWarn(){
  'use strict';

  var css=''
    // сам невдалий рядок у чаті — червона підсвітка + помітна іконка
    +'tr.message-status-failed td{background:#fdecea!important}'
    +'tr.message-status-failed .fa-exclamation-circle{color:#c0392b;font-size:15px}'
    +'.sd-cf-badge{display:inline-block;margin-left:8px;padding:1px 8px;border-radius:10px;'
    +'  background:#c0392b;color:#fff;font:700 11px/1.7 Arial,sans-serif;white-space:nowrap;vertical-align:middle}'
    // банер над чатом
    +'#sd-chatfail-warn{position:relative;margin:8px 0;padding:10px 12px;'
    +'  border:1px solid #e0b4b4;border-left:5px solid #c0392b;background:#fdf3f3;border-radius:6px;'
    +'  font:13px/1.5 -apple-system,"Segoe UI",Roboto,Arial,sans-serif;color:#7a1f1f;box-sizing:border-box}'
    +'#sd-chatfail-warn .cf-top{font-weight:800;color:#c0392b;font-size:14px}'
    +'#sd-chatfail-warn .cf-why{margin-top:3px}'
    // липкі сповіщення (видно на БУДЬ-ЯКІЙ сторінці СРМ, поки не натиснуто OK)
    +'#sd-cf-toasts{position:fixed;right:18px;bottom:84px;z-index:2147483599;display:flex;'
    +'  flex-direction:column;gap:8px;max-width:360px}'
    +'.sd-cf-toast{background:#fdf3f3;border:1px solid #e0b4b4;border-left:5px solid #c0392b;'
    +'  border-radius:8px;padding:9px 11px;box-shadow:0 4px 14px rgba(0,0,0,.25);'
    +'  font:13px/1.45 Arial,sans-serif;color:#7a1f1f}'
    +'.sd-cf-toast .t{font-weight:800;color:#c0392b;margin-bottom:2px}'
    // кнопки великі — щоб легко влучити мишею
    +'.sd-cf-toast .a{margin-top:10px;display:flex;gap:10px;align-items:stretch}'
    +'.sd-cf-toast .a a{flex:1 1 auto;display:flex;align-items:center;justify-content:center;'
    +'  min-height:42px;background:#c0392b;color:#fff;font-weight:800;'
    +'  padding:10px 16px;border-radius:7px;text-decoration:none;font-size:14px;text-align:center}'
    +'.sd-cf-toast .a a:hover{background:#a93226}'
    +'.sd-cf-toast .a button{flex:1 1 auto;min-height:42px;border:2px solid #c0392b;background:#fff;'
    +'  color:#c0392b;font-weight:800;padding:10px 16px;border-radius:7px;cursor:pointer;font-size:14px}'
    +'.sd-cf-toast .a button:hover{background:#fde9e7}'
    +'.sd-cf-toast .a button:active{transform:translateY(1px)}'
    // зведення ЗВЕРХУ на сторінці списку заявок (будь-який фільтр менеджера)
    +'#sd-cf-topbar{position:fixed;top:56px;left:50%;transform:translateX(-50%);z-index:2147483599;'
    +'  background:#fdf3f3;border:1px solid #e0b4b4;border-left:5px solid #c0392b;border-radius:8px;'
    +'  padding:8px 12px;box-shadow:0 4px 14px rgba(0,0,0,.28);font:13px/1.5 Arial,sans-serif;'
    +'  color:#7a1f1f;max-width:min(920px,94vw);display:flex;flex-wrap:wrap;gap:6px 10px;align-items:center}'
    +'#sd-cf-topbar .lb{font-weight:800;color:#c0392b}'
    +'#sd-cf-topbar .chip{display:inline-flex;align-items:stretch;gap:0;background:#fff;'
    +'  border:1px solid #e0b4b4;border-radius:8px;overflow:hidden}'
    +'#sd-cf-topbar .chip a{display:flex;align-items:center;color:#c0392b;font-weight:800;'
    +'  text-decoration:none;padding:9px 14px;font-size:14px}'
    +'#sd-cf-topbar .chip a:hover{background:#fdf3f3;text-decoration:underline}'
    // «OK» — велика кнопка з підписом, а не крихітний хрестик
    +'#sd-cf-topbar .chip button{border:none;border-left:1px solid #e0b4b4;background:#f7eceb;'
    +'  color:#c0392b;font-weight:800;cursor:pointer;padding:9px 14px;font-size:13px;'
    +'  min-width:74px;white-space:nowrap}'
    +'#sd-cf-topbar .chip button:hover{background:#c0392b;color:#fff}'
    +'#sd-cf-topbar .chip button:active{transform:translateY(1px)}';
  var st=document.createElement('style'); st.textContent=css;
  (document.head||document.documentElement).appendChild(st);

  function reasonOf(row){
    var ic=row.querySelector('[uib-tooltip]');
    var t=(ic&&ic.getAttribute('uib-tooltip'))||'';
    if(/viber/i.test(t))    return 'на номері немає Viber';
    if(/telegram/i.test(t)) return 'на номері немає Telegram';
    return t||'повідомлення не доставлено';
  }
  function pl(n){
    var d=n%10, h=n%100;
    return (d===1&&h!==11)?'повідомлення':((d>=2&&d<=4&&(h<12||h>14))?'повідомлення':'повідомлень');
  }

  // ---- памʼять «недоставлено у заявці #N» (localStorage): плашка висить на всіх
  // сторінках СРМ, поки менеджер не натисне OK. Підпис (sig) = к-ть + час останнього
  // невдалого — та сама стара помилка після OK не турбує, нова — турбує знову.
  var LS='lk_chatfail_v1';
  function loadAll(){ try{ return JSON.parse(localStorage.getItem(LS))||{}; }catch(e){ return {}; } }
  function saveAll(o){ try{ localStorage.setItem(LS, JSON.stringify(o)); }catch(e){} }
  // номер заявки — БЕЗ сканування тексту сторінки!
  // Раніше фолбек по body.innerText ловив номер із НАШОЇ Ж плашки («Заявка #N: …»),
  // через це плашка ховалась → текст зникав → плашка поверталась → миготіння.
  function curOrderNum(){
    var m=(location.hash||'').match(/#\/order\/(?:update|create)\/(\d+)/);
    if(m) return m[1];
    m=(document.title||'').match(/#\s*(\d{4,})/);
    if(m) return m[1];
    var el=document.querySelector('h1,h2,.page-title,.page-header');
    m=el && String(el.textContent||'').match(/Заявка\s*#\s*(\d+)/);
    return m?m[1]:null;
  }
  function sigOf(rows){
    var last=rows[rows.length-1], t=last.querySelector('span[title]');
    return rows.length+'|'+((t&&t.getAttribute('title'))||'');
  }

  // ---- відстеження ЩОЙНО надісланих повідомлень ----
  // Менеджер може закрити заявку одразу після відправки й не побачити «не доставлено».
  // Тому в момент появи нового ВИХІДНОГО повідомлення в чаті створюємо запис
  // «⏳ доставка не підтверджена» (kind:pending). Якщо менеджер лишився — за ~8с
  // статус зʼясовується: ok → запис тихо знімається; failed → стане ⛔ (alert-логіка).
  // Якщо закрив — ⏳ висить у зведенні, доки заявку не відкриють знову.
  var seedHash=null, seeded=false, emptySyncs=0, seen={}, watch={};
  function cellsAll(){ return document.querySelectorAll('td.comment-cell'); }
  function sigCell(c){
    var t=c.querySelector('.comment-title span[title]');
    var b=c.querySelector('.comment-body');
    return ((t&&t.getAttribute('title'))||'')+'|'+String(b?b.textContent:'').trim().slice(0,60);
  }
  function isOut(c){ return !!c.querySelector('.comment-body i.fa-arrow-right'); }
  function isFailCell(c){ return !!c.querySelector('tr.message-status-failed'); }

  function trackNewSends(){
    var now=Date.now();
    if(location.hash!==seedHash){ seedHash=location.hash; seeded=false; emptySyncs=0; watch={}; }
    var cells=cellsAll();
    if(!seeded){
      // засіваємо історію чату (або визнаємо чат порожнім після 3 тиків), нових не чіпаємо
      if(cells.length || emptySyncs>=3){
        [].forEach.call(cells,function(c){ seen[sigCell(c)]=1; });
        seeded=true;
      } else { emptySyncs++; }
      return;
    }
    [].forEach.call(cells,function(c){
      var s=sigCell(c);
      if(seen[s]) return;
      seen[s]=1;
      if(!isOut(c)) return;               // вхідні (від клієнта) не цікавлять
      watch[s]={first:now};
      var num=curOrderNum();
      if(num){
        var all=loadAll(), rec=all[num];
        // не перекриваємо активний ⛔; інакше — ставимо/оновлюємо ⏳
        if(!rec || rec.ack || rec.kind==='watch'){
          all[num]={num:num, sig:'p:'+s, url:location.href, t:now, kind:'watch',
                    reason:'', ack:0};
          saveAll(all);
        }
      }
    });
    // ведемо відправлені під наглядом до розвʼязки
    Object.keys(watch).forEach(function(s){
      var found=null;
      [].some.call(cellsAll(),function(c){ if(sigCell(c)===s){ found=c; return true; } return false; });
      if(!found) return;                  // чат перемальовується — глянемо наступного тику
      var num=curOrderNum(), all;
      if(isFailCell(found)){
        delete watch[s];
        // прибрати ⏳ — alert-логіка нижче одразу запише ⛔ по цій заявці
        if(num){ all=loadAll(); if(all[num]&&all[num].kind==='watch'){ delete all[num]; saveAll(all); } }
      } else if(Date.now()-watch[s].first>8000){
        delete watch[s];                  // 8с без failed → доставлено, знімаємо ⏳
        if(num){ all=loadAll();
          if(all[num]&&all[num].kind==='watch'&&all[num].sig==='p:'+s){ delete all[num]; saveAll(all); } }
      }
    });
  }

  // ---- ФОНОВА перевірка доставки через дані СРМ ----
  // Замість плашки «⏳ перевір доставку» (менеджери скаржились: спрацьовує майже
  // завжди, бо вони одразу йдуть із заявки) — тихо перевіряємо статус самі:
  // /comments/?orderId=N дає messages[].direction + .status ('failed') + errorDescription.
  var WATCH_MAX=2*60*60*1000;    // довше 2 год не тримаємо
  var WATCH_OK=15*60*1000;       // за 15 хв без невдачі — знімаємо тихо, нічого не показуючи
  var vwBusy=false;

  function reasonFromApi(m, chat){
    var d=String((m&&m.errorDescription)||'');
    if(/viber/i.test(d)) return 'на номері немає Viber';
    if(/telegram/i.test(d)) return 'на номері немає Telegram';
    var tp=String(((chat||{}).messenger||{}).type||'');
    if(/viber/i.test(tp)) return 'не доставлено у Viber';
    if(/telegram/i.test(tp)) return 'не доставлено у Telegram';
    return d||'повідомлення не доставлено';
  }

  function verifyWatch(){
    if(vwBusy) return;
    var all=loadAll();
    var keys=Object.keys(all).filter(function(k){ return all[k] && all[k].kind==='watch' && !all[k].ack; });
    if(!keys.length) return;
    vwBusy=true;
    var i=0;
    function next(){
      if(i>=keys.length){ vwBusy=false; renderToasts(); return; }
      var k=keys[i++], cur=loadAll()[k];
      if(!cur || cur.kind!=='watch'){ return next(); }
      var age=Date.now()-(cur.t||0);
      if(age>WATCH_MAX){ var m0=loadAll(); delete m0[k]; saveAll(m0); return next(); }
      fetch('/comments/?formId=1&orderId='+encodeURIComponent(cur.num),
            { credentials:'include', headers:{'Accept':'application/json'} })
        .then(function(r){ return r.ok?r.json():null; })
        .then(function(j){
          if(!j) return;
          var arr=((j.response||j).data)||[], fail=null;
          arr.forEach(function(c){
            (c.messages||[]).forEach(function(m){
              if(!m || m.direction!=='outcoming' || String(m.status)!=='failed') return;
              var t=Date.parse(String(m.date||'').replace(' ','T')+'Z')||0;
              if(t >= (cur.t||0)-10*60*1000) fail={ m:m, chat:c.chat };
            });
          });
          var mm=loadAll();
          if(!mm[k]) return;
          if(fail){
            mm[k].kind='alert';
            mm[k].sig='api:'+fail.m.id;
            mm[k].reason=reasonFromApi(fail.m, fail.chat);
            mm[k].t=Date.now();
            saveAll(mm);
          } else if(age>WATCH_OK){
            delete mm[k]; saveAll(mm);      // доставлено — прибираємо мовчки
          }
        })
        .catch(function(){})
        .then(function(){ setTimeout(next, 200); });
    }
    next();
  }

  // міграція: старі видимі ⏳ стають невидимими watch-записами
  (function migratePending(){
    try{
      var all=loadAll(), ch=false;
      Object.keys(all).forEach(function(k){
        if(all[k] && all[k].kind==='pending'){ all[k].kind='watch'; all[k].reason=''; ch=true; }
      });
      if(ch) saveAll(all);
    }catch(e){}
  })();
  function ackKey(k){
    var m=loadAll(); if(m[k]){ m[k].ack=1; saveAll(m); }
    renderToasts();
  }

  // зведення зверху на списку заявок: ⛔ не доставлено + ⏳ доставка не підтверджена
  function renderTopbar(all, keys){
    var bar=document.getElementById('sd-cf-topbar');
    // перемальовуємо ЛИШЕ коли перелік/причини змінились — інакше зведення мигтіло:
    // rebuild ішов на кожен пульс DOM (~3 рази на секунду)
    var sig=keys.map(function(k){
      var r=all[k]||{};
      return k+':'+(r.kind||'alert')+':'+(r.reason||'');
    }).join('|');
    if(bar && bar.getAttribute('data-sig')===sig) return;
    if(!bar){
      bar=document.createElement('div'); bar.id='sd-cf-topbar';
      document.body.appendChild(bar);
    }
    bar.setAttribute('data-sig', sig);
    bar.innerHTML='';
    function addGroup(label, ks){
      if(!ks.length) return;
      var lab=document.createElement('span'); lab.className='lb'; lab.textContent=label;
      bar.appendChild(lab);
      ks.forEach(function(k){
        var r=all[k];
        var c=document.createElement('span'); c.className='chip';
        var a=document.createElement('a'); a.href=r.url||'#';
        a.textContent='#'+r.num;
        a.title=(r.reason||'повідомлення не доставлено')+' — відкрити заявку';
        var x=document.createElement('button'); x.type='button'; x.textContent='✓ OK';
        x.title='OK, зрозумів — прибрати з переліку';
        x.addEventListener('click',function(e){ e.preventDefault(); e.stopPropagation(); ackKey(k); });
        c.appendChild(a); c.appendChild(x); bar.appendChild(c);
      });
    }
    addGroup('⛔ Клієнт НЕ отримав повідомлення:',
      keys.filter(function(k){ return (all[k].kind||'alert')==='alert'; }));
    addGroup('🖨 ТТН друковано повторно:',
      keys.filter(function(k){ return all[k].kind==='ttn'; }));
  }

  function renderToasts(){
    var all=loadAll(), now=Date.now(), changed=false;
    Object.keys(all).forEach(function(k){
      if(now-(all[k].t||0)>5*24*3600*1000){ delete all[k]; changed=true; }  // чистка старших за 5 днів
    });
    if(changed) saveAll(all);
    var keys=Object.keys(all).filter(function(k){
      var kd=(all[k].kind||'alert');
      return !all[k].ack && (kd==='alert' || kd==='ttn');
    });
    var box=document.getElementById('sd-cf-toasts');
    var bar=document.getElementById('sd-cf-topbar');
    var onList=/\/order\/index/.test(location.hash||'');   // список заявок (будь-які фільтри менеджера)

    if(!onList && keys.length){
      var cur=curOrderNum();   // чат-алерт на своїй заявці не дублюємо (там банер над чатом),
      keys=keys.filter(function(k){        // а ТТН-повідомлення показуємо і тут — банера немає
        return !((all[k].kind||'alert')==='alert' && all[k].num===cur);
      });
    }
    if(!keys.length){ if(box) box.remove(); if(bar) bar.remove(); return; }

    if(onList){
      if(box) box.remove();
      renderTopbar(all, keys);
      return;
    }
    if(bar) bar.remove();
    if(!box){ box=document.createElement('div'); box.id='sd-cf-toasts'; document.body.appendChild(box); }
    keys.forEach(function(k){
      var r=all[k];
      if(box.querySelector('[data-k="'+k+'"]')) return;
      var d=document.createElement('div'); d.className='sd-cf-toast'; d.setAttribute('data-k',k);
      var t=document.createElement('div'); t.className='t';
      var isTtn=(r.kind==='ttn');
      t.textContent=isTtn
        ? '🖨 Заявка #'+r.num+': ТТН друковано ПОВТОРНО'
        : '⛔ Заявка #'+r.num+': повідомлення НЕ доставлено';
      var w=document.createElement('div');
      w.textContent=isTtn
        ? ('ТТН '+(r.ttn||'')+' — '+(r.reason||'')+'. Перевір, чи не наклеїли дві етикетки.')
        : ((r.reason||'')+'. Клієнт його не бачив — подзвони або SMS.');
      var a=document.createElement('div'); a.className='a';
      var op=document.createElement('a'); op.textContent='Відкрити заявку'; op.href=r.url||'#';
      var ok=document.createElement('button'); ok.type='button'; ok.textContent='OK, зрозумів';
      ok.addEventListener('click',function(){ ackKey(k); });
      a.appendChild(op); a.appendChild(ok);
      d.appendChild(t); d.appendChild(w); d.appendChild(a);
      box.appendChild(d);
    });
    // прибрати плашки, яких уже нема (напр., OK в іншій вкладці)
    [].forEach.call(box.querySelectorAll('[data-k]'),function(d){
      if(keys.indexOf(d.getAttribute('data-k'))<0) d.remove();
    });
    if(!box.children.length) box.remove();
  }

  function sync(){
    trackNewSends();
    var rows=document.querySelectorAll('tr.message-status-failed');
    var old=document.getElementById('sd-chatfail-warn');
    if(!rows.length){ if(old) old.remove(); renderToasts(); return; }

    var reasons={};
    [].forEach.call(rows,function(r){
      reasons[reasonOf(r)]=1;
      // бейдж у сам рядок (один раз)
      if(!r.getAttribute('data-sdcf')){
        r.setAttribute('data-sdcf','1');
        var td=r.querySelector('td.allow-word-wrap')||r.querySelector('td:nth-child(2)');
        if(td){
          var b=document.createElement('span'); b.className='sd-cf-badge';
          b.textContent='⛔ НЕ ДОСТАВЛЕНО'; b.title=reasonOf(r);
          td.appendChild(b);
        }
      }
    });

    // банер над списком повідомлень (якорем — зовнішня таблиця чату)
    var cell=rows[0].closest('td.comment-cell');
    var outer=cell?cell.closest('table'):null;
    var host=outer&&outer.parentElement?outer.parentElement:null;
    if(!host){ if(old) old.remove(); return; }
    if(!old){
      old=document.createElement('div'); old.id='sd-chatfail-warn';
      var top=document.createElement('div'); top.className='cf-top';
      var why=document.createElement('div'); why.className='cf-why';
      why.textContent='Клієнт цього НЕ бачив — звʼяжися інакше: 📞 подзвони або надішли SMS.';
      old.appendChild(top); old.appendChild(why);
    }
    if(old.parentElement!==host || old.nextSibling!==outer) host.insertBefore(old, outer);
    old.querySelector('.cf-top').textContent=
      '⛔ У чаті '+rows.length+' '+pl(rows.length)+' НЕ доставлено: '+Object.keys(reasons).join('; ')+'.';

    // запамʼятати для липкої плашки на інших сторінках (щоб не загубилось після закриття заявки)
    var num=curOrderNum();
    if(num){
      var all=loadAll(), sig=sigOf(rows), rec=all[num];
      if(!rec || rec.sig!==sig || rec.kind==='watch'){
        all[num]={ num:num, sig:sig, url:location.href, t:Date.now(), kind:'alert',
                   reason:Object.keys(reasons).join('; '), ack:0 };
        saveAll(all);
      }
    }
    renderToasts();
  }

  var t=null;
  function syncSoon(){ clearTimeout(t); t=setTimeout(sync,400); }
  sync();
  window.addEventListener('lkdom', syncSoon);
  window.addEventListener('hashchange', syncSoon);   // перехід список↔заявка в SPA
  setTimeout(verifyWatch, 15000);
  setInterval(verifyWatch, 90000);

  // МИТТЄВА реакція на появу нового повідомлення в чаті (не чекаємо lkdom-пульс ~0.4-1с):
  // щойно СРМ домальовує відправлене повідомлення — одразу пишемо ⏳ у память,
  // навіть якщо менеджер закриє заявку за мить після відправки.
  var moT=null;
  try{
    var mo=new MutationObserver(function(muts){
      for(var i=0;i<muts.length;i++){
        var ad=muts[i].addedNodes;
        for(var j=0;j<ad.length;j++){
          var n=ad[j];
          if(n && n.nodeType===1 &&
             ((n.matches && n.matches('td.comment-cell')) ||
              (n.querySelector && n.querySelector('td.comment-cell')))){
            clearTimeout(moT);
            moT=setTimeout(function(){ trackNewSends(); renderToasts(); },30);
            return;
          }
        }
      }
    });
    mo.observe(document.body||document.documentElement,{childList:true,subtree:true});
  }catch(e){}
})();
}catch(e){ try{ console.warn("[SD] модуль «lkChatFailWarn» не запустився:", e); }catch(_){} }
/* ▲▲▲ МОДУЛЬ-END • lkChatFailWarn ▲▲▲ */

/* ▼▼▼ МОДУЛЬ-START • lkPayRequired — ⛔ заборона зберігати заявку без способу оплати ▼▼▼ */
/* ===== Менеджер тисне «Зберегти» на картці заявки, а «Спосіб оплати» порожній →
   блокуємо збереження, підсвічуємо поле червоним і показуємо попередження. ===== */
try{ // SD-ізоляція: помилка цього модуля не зупинить решту
(function lkPayRequired(){
  'use strict';

  var css=''
    +'#sd-payreq-warn{position:fixed;top:56px;left:50%;transform:translateX(-50%);z-index:2147483600;'
    +'  background:#fdf3f3;border:1px solid #e0b4b4;border-left:5px solid #c0392b;border-radius:8px;'
    +'  padding:10px 16px;box-shadow:0 4px 14px rgba(0,0,0,.3);font:700 14px/1.4 Arial,sans-serif;color:#c0392b}'
    +'.sd-payreq-hl{box-shadow:0 0 0 3px #c0392b !important;border-radius:4px}';
  var st=document.createElement('style'); st.textContent=css;
  (document.head||document.documentElement).appendChild(st);

  function norm(s){ return String(s==null?'':s).replace(/ /g,' ').trim(); }
  function onOrderPage(){ return /#\/order\/(update|create)/.test(location.hash||''); }

  // порожній спосіб оплати? (той самий селект, що читає lkStockPayWarn)
  function payEmpty(){
    var sel=document.getElementById('payment_method-wk');
    if(sel && 'value' in sel){
      return !/\d/.test(String(sel.value||''));   // value без цифри (порожнє/`?`) = не вибрано
    }
    var cont=document.getElementById('select2-payment_method-wk-container')
        || document.querySelector('[id^="select2-payment_method"][id$="-container"]');
    if(cont){
      var t=norm(cont.getAttribute('title')||cont.textContent);
      return !t || t==='---' || t==='…' || t==='...';
    }
    return false;   // поля взагалі нема (режим перегляду) — не втручаємось
  }

  function payBox(){
    return document.getElementById('select2-payment_method-wk-container')
      ? (document.getElementById('select2-payment_method-wk-container').closest('.select2')
         || document.getElementById('select2-payment_method-wk-container'))
      : document.getElementById('payment_method-wk');
  }

  var wt=null;
  function warn(){
    var w=document.getElementById('sd-payreq-warn');
    if(!w){
      w=document.createElement('div'); w.id='sd-payreq-warn';
      w.textContent='⛔ Заявку НЕ збережено — вкажи «Спосіб оплати»!';
      document.body.appendChild(w);
    }
    clearTimeout(wt); wt=setTimeout(function(){ try{ w.remove(); }catch(e){} },6000);
    var box=payBox();
    if(box){
      box.classList.add('sd-payreq-hl');
      try{ box.scrollIntoView({block:'center',behavior:'smooth'}); }catch(e){}
      setTimeout(function(){ try{ box.classList.remove('sd-payreq-hl'); }catch(e){} },6000);
    }
  }

  // capture-фаза: перехоплюємо раніше за Angular; модалки (форма чека тощо) не чіпаємо
  document.addEventListener('click', function(e){
    try{
      if(!onOrderPage()) return;
      var t=e.target && e.target.closest ? e.target.closest('button,a,input[type=submit]') : null;
      if(!t) return;
      if(t.closest('.modal')) return;
      var txt=norm(t.textContent||t.value);
      if(!/^зберегти$/i.test(txt)) return;
      if(!payEmpty()) return;
      e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
      warn();
    }catch(err){}
  }, true);
})();
}catch(e){ try{ console.warn("[SD] модуль «lkPayRequired» не запустився:", e); }catch(_){} }
/* ▲▲▲ МОДУЛЬ-END • lkPayRequired ▲▲▲ */

/* ▼▼▼ МОДУЛЬ-START • lkArrivalCount — 📦 к-ть позицій та одиниць у «Надходженні товарів» ▼▼▼ */
/* ===== Бейдж біля заголовка прихідної накладної: скільки позицій (рядків) і одиниць разом ===== */
try{ // SD-ізоляція: помилка цього модуля не зупинить решту
(function lkArrivalCount(){
  'use strict';
  var css='.lk-arrcnt{display:inline-block;margin-left:12px;padding:3px 12px;border-radius:14px;'
    +'background:#e3f4f2;color:#00695c;font:700 13px/1.5 Arial,sans-serif;vertical-align:middle;white-space:nowrap}';
  var st=document.createElement('style'); st.textContent=css;
  (document.head||document.documentElement).appendChild(st);

  function onPage(){ return /#\/document\/arrival-product\//.test(location.hash||''); }
  function num(v){ var n=parseFloat(String(v==null?'':v).replace(/\s| /g,'').replace(',','.')); return isNaN(n)?0:n; }
  function fmt(n){ n=Math.round(n*100)/100; return String(n%1===0?n:n.toFixed(2)).replace('.',','); }

  function sync(){
    var badge=document.querySelector('.lk-arrcnt');
    if(!onPage()){ if(badge) badge.remove(); return; }
    // рядки товарів у накладній (ng-repeat="invoiceItem in viewModel.item.documentItems…")
    var rows=document.querySelectorAll('tr[ng-repeat^="invoiceItem"]');
    if(!rows.length){ if(badge) badge.remove(); return; }
    var units=0;
    [].forEach.call(rows,function(r){
      var td=r.cells&&r.cells[2];        // колонка «К-ть»
      if(!td) return;
      var v=num(td.textContent);
      if(!v){ var inp=td.querySelector('input'); if(inp) v=num(inp.value); }  // рядок у режимі редагування
      units+=v;
    });
    if(!badge){
      var h=null, hs=document.querySelectorAll('h1,h2,h3');
      for(var i=0;i<hs.length;i++){
        if(/^Надходження товарів №/.test((hs[i].textContent||'').trim())){ h=hs[i]; break; }
      }
      badge=document.createElement('span'); badge.className='lk-arrcnt';
      if(h) h.appendChild(badge);
      else{
        var t=document.querySelector('table.document-invoice-products');
        if(t&&t.parentElement) t.parentElement.insertBefore(badge,t); else return;
      }
    }
    // пишемо лише при зміні — інакше бейдж переписувався на кожен пульс DOM (мигтів)
    var txt='📦 Позицій: '+rows.length+' · Одиниць: '+fmt(units);
    if(badge.textContent!==txt) badge.textContent=txt;
  }

  var t=null;
  function syncSoon(){ clearTimeout(t); t=setTimeout(sync,300); }
  sync();
  window.addEventListener('lkdom', syncSoon);
  window.addEventListener('hashchange', syncSoon);
})();
}catch(e){ try{ console.warn("[SD] модуль «lkArrivalCount» не запустився:", e); }catch(_){} }
/* ▲▲▲ МОДУЛЬ-END • lkArrivalCount ▲▲▲ */

/* ▼▼▼ МОДУЛЬ-START • lkArrivalOpt — 💰 опт-ціни товарів із собівартості накладної ▼▼▼ */
/* ===== Кнопка на «Надходженні товарів»: рахує з собівартості (ціна закупки × курс
   валюти накладної) ціни Великий опт (×1.2), середній опт (×1.25), майстри (×1.3
   вгору до 5) і показує їх КОЛОНКОЮ прямо біля кожного товару (нові жирним, «було»
   дрібним). Запис у картки товарів — лише після «✅ Записати». Core: sdArrivalOpt. ===== */
try{ // SD-ізоляція: помилка цього модуля не зупинить решту
(function lkArrivalOpt(){
  'use strict';
  var PAGE=(typeof unsafeWindow!=='undefined'&&unsafeWindow)||window;

  var css=''
    +'.lk-arropt-btn{display:inline-block;margin-left:10px;padding:4px 14px;border:none;border-radius:14px;'
    +'  background:#00897B;color:#fff;font:700 13px/1.5 Arial,sans-serif;cursor:pointer;vertical-align:middle;white-space:nowrap}'
    +'.lk-arropt-btn:hover{background:#00695c}'
    +'.lk-arropt-btn[disabled]{background:#9e9e9e;cursor:default}'
    // компактна панель дій над таблицею
    +'#lk-arropt-res{margin:8px 0;padding:9px 12px;border:1px solid #7bb3a9;border-left:4px solid #00897B;'
    +'  background:#eef8f6;border-radius:6px;font:13px/1.6 Arial,sans-serif;color:#0f3d39;'
    +'  max-width:980px;box-sizing:border-box;position:relative}'
    +'#lk-arropt-res .h{font-weight:700;color:#00695c;margin-bottom:4px}'
    +'#lk-arropt-res .er{color:#B71C1C;font-weight:700;font-size:12px}'
    +'#lk-arropt-res .x{position:absolute;top:5px;right:9px;border:none;background:none;cursor:pointer;'
    +'  font-size:17px;color:#00695c}'
    // колонка «Опт» у таблиці накладної — великий читабельний шрифт
    +'td.lk-arropt-td{font:14px/1.5 ui-monospace,Menlo,Consolas,monospace;color:#0f3d39;white-space:nowrap;'
    +'  padding:8px 16px;border-left:3px solid #00897B;background:#f2fbfa;vertical-align:middle}'
    +'td.lk-arropt-td .nw{font-weight:800;color:#00695c;font-size:17px;letter-spacing:.3px}'
    +'td.lk-arropt-td .od{color:#7d8f8c;font-size:12.5px;margin-top:2px}'
    +'td.lk-arropt-td.er{color:#B71C1C;font-weight:700;font-size:13px;white-space:normal}'
    +'td.lk-arropt-td.blank{background:transparent;border-left:none}'
    +'th.lk-arropt-td{font:700 13px/1.5 Arial,sans-serif;background:#e3f4f2;color:#00695c;'
    +'  padding:8px 16px;border-left:3px solid #00897B;white-space:nowrap}'
    +'td.lk-arropt-td .nw{display:flex;align-items:center}'
    +'.lk-arropt-chk{width:17px;height:17px;margin-right:9px;cursor:pointer;accent-color:#00897B;flex:0 0 auto}';
  var st=document.createElement('style'); st.textContent=css;
  (document.head||document.documentElement).appendChild(st);

  function onPage(){ return /#\/document\/arrival-product\/update\//.test(location.hash||''); }
  function rowsCount(){ return document.querySelectorAll('tr[ng-repeat^="invoiceItem"]').length; }
  var fmtN=function(n){ return String(n==null?'—':n).replace('.',','); };

  // поточний прогноз/результат: {list, bySku, applied, rate}
  var view=null;

  function skuOfRow(tr){
    var m=String((tr.cells&&tr.cells[1]?tr.cells[1].textContent:'')||'').match(/\(([\w\-]+)\)/g);
    return m?m[m.length-1].replace(/[()]/g,''):null;
  }

  // домалювати колонку «Опт» у таблицю (перемальовується на кожен lkdom-пульс, поки view активний)
  function renderColumn(){
    if(!view) return;
    var t=document.querySelector('table.document-invoice-products'); if(!t) return;
    var headRow=t.querySelector('thead tr')||t.querySelector('tr');
    if(headRow && !headRow.querySelector('th.lk-arropt-td')){
      var th=document.createElement('th'); th.className='lk-arropt-td';
      th.textContent='Опт: Вел / Сер / Май';
      headRow.appendChild(th);
    }
    var i=0;
    [].forEach.call(t.querySelectorAll('tr[ng-repeat^="invoiceItem"]'),function(tr){
      var sku=skuOfRow(tr);
      var r=(sku&&view.bySku[sku])||view.list[i]; i++;
      var td=tr.querySelector('td.lk-arropt-td');
      if(!td){ td=document.createElement('td'); td.className='lk-arropt-td'; tr.appendChild(td); }
      // перемальовуємо ЛИШЕ коли дані клітинки справді змінились — інакше колонка
      // мигтіла: рендер ішов на кожен пульс DOM (~сотні разів на хвилину)
      var sig=[view.applied?1:0, (r&&r.err)||'', (r&&r.skipped)?1:0, (r&&r.skip)?1:0,
               r?r.p2:'', r?r.p5:'', r?r.p7:'', r?r.o2:'', r?r.o5:'', r?r.o7:''].join('|');
      if(td.getAttribute('data-sig')===sig) return;
      td.setAttribute('data-sig', sig);
      td.classList.remove('er');
      if(!r){ td.textContent=''; return; }
      if(r.err){ td.classList.add('er'); td.textContent='✗ '+r.err; td.title=r.name||''; return; }
      td.innerHTML='';
      if(r.skipped){
        var sk=document.createElement('div'); sk.className='od'; sk.textContent='⏭ пропущено (без галочки)';
        td.appendChild(sk); td.title=r.name||''; return;
      }
      var changed=(Number(r.o2)!==Number(r.p2))||(Number(r.o5)!==Number(r.p5))||(Number(r.o7)!==Number(r.p7));
      var l1=document.createElement('div'); l1.className='nw';
      // галочка «оновлювати цей товар» (за замовчуванням увімкнена) — лише в перегляді
      if(!view.applied){
        var cb=document.createElement('input'); cb.type='checkbox'; cb.className='lk-arropt-chk';
        cb.checked=!r.skip;
        cb.title='Оновлювати опт-ціни цього товару (зніми, щоб пропустити)';
        cb.addEventListener('change',function(){
          r.skip=!cb.checked;
          td.style.opacity=r.skip?'0.45':'';
          updateApplyLabel();
        });
        l1.appendChild(cb);
        td.style.opacity=r.skip?'0.45':'';
      }
      var l1t=document.createElement('span');
      l1t.textContent=(view.applied?'✓ ':'')+r.p2+' / '+r.p5+' / '+r.p7;
      l1.appendChild(l1t);
      var l2=document.createElement('div'); l2.className='od';
      l2.textContent=r.o2==null&&r.o5==null&&r.o7==null
        ? 'типів цін не було — нові'
        : (changed?('було: '+fmtN(r.o2)+' / '+fmtN(r.o5)+' / '+fmtN(r.o7)):'без змін');
      td.appendChild(l1); td.appendChild(l2);
      td.title=(r.name||'')+(r.created&&r.created.length?(' · створено типи: '+r.created.join(',')):'');
    });
    // не-товарні рядки (підсумок тощо) — порожня клітинка, щоб сітка не зʼїхала
    [].forEach.call(t.querySelectorAll('tr'),function(tr){
      if(tr.getAttribute('ng-repeat')) return;
      if(tr.querySelector('.lk-arropt-td')) return;
      if(tr.querySelector('th')) return;
      if(!tr.cells || tr.cells.length<3) return;
      var td=document.createElement('td'); td.className='lk-arropt-td blank';
      tr.appendChild(td);
    });
  }
  function clearView(){
    view=null;
    [].forEach.call(document.querySelectorAll('.lk-arropt-td'),function(n){ n.remove(); });
    var r=document.getElementById('lk-arropt-res'); if(r) r.remove();
  }
  function setView(rows, applied, rate){
    var bySku={};
    (rows||[]).forEach(function(r){ if(r.sku) bySku[r.sku]=r; });
    view={ list:rows||[], bySku:bySku, applied:!!applied, rate:rate };
    renderColumn();
  }

  // запуск core-обробника: mode='preview' (лише читає) або 'apply' (пише)
  function invoke(mode, onDone, onProgTxt){
    var token=String(Date.now())+'_'+Math.random().toString(36).slice(2);
    var tm=null;
    function onProg(){
      if(onProgTxt) onProgTxt(document.documentElement.getAttribute('data-sd-arropt-progress')||'');
    }
    var fin=false;
    function cleanup(){
      fin=true;
      PAGE.removeEventListener('sdArrivalOptResult', onRes);
      PAGE.removeEventListener('sdArrivalOptProgress', onProg);
      clearTimeout(tm);
    }
    function onRes(){
      var raw=document.documentElement.getAttribute('data-sd-arropt-result');
      if(!raw) return;
      var d; try{ d=JSON.parse(raw); }catch(e){ return; }
      if(!d || d.token!==token) return;
      cleanup(); onDone(d);
    }
    PAGE.addEventListener('sdArrivalOptResult', onRes);
    PAGE.addEventListener('sdArrivalOptProgress', onProg);
    document.documentElement.setAttribute('data-sd-arropt-token', token);
    document.documentElement.setAttribute('data-sd-arropt-mode', mode);
    document.documentElement.removeAttribute('data-sd-arropt-result');
    PAGE.dispatchEvent(new Event('sdArrivalOpt'));
    tm=setTimeout(function(){ if(fin) return; cleanup(); onDone(null); }, 180000);
  }

  function updateApplyLabel(){
    var b=document.getElementById('lk-arropt-apply');
    if(!b || !view) return;
    var total=0, sel=0;
    view.list.forEach(function(r){ if(r.err) return; total++; if(!r.skip) sel++; });
    b.textContent='✅ Записати вибрані ('+sel+' із '+total+')';
    b.disabled=(sel===0);
  }

  function bar(){
    var old=document.getElementById('lk-arropt-res'); if(old) old.remove();
    var box=document.createElement('div'); box.id='lk-arropt-res';
    var x=document.createElement('button'); x.className='x'; x.textContent='✕';
    x.addEventListener('click',function(){ clearView(); });
    box.appendChild(x);
    var t=document.querySelector('table.document-invoice-products');
    if(t&&t.parentElement) t.parentElement.insertBefore(box,t);
    else document.body.appendChild(box);
    return box;
  }
  function errLines(box, rows){
    (rows||[]).forEach(function(r){
      if(!r.err) return;
      var e=document.createElement('div'); e.className='er';
      e.textContent='✗ '+(r.name||r.sku||'')+' — '+r.err;
      box.appendChild(e);
    });
  }

  // крок 1: ПЕРЕГЛЯД — нічого не пише; ціни зʼявляються колонкою біля товарів
  function run(btn){
    if(!rowsCount()) return;
    btn.disabled=true; var orig=btn.textContent; btn.textContent='💰 Читаю…';
    invoke('preview', function(d){
      btn.disabled=false; btn.textContent=orig;
      if(!d || !d.ok){
        var b0=bar(); var h0=document.createElement('div'); h0.className='h';
        h0.textContent='✗ Не вийшло: '+((d&&d.err)||'нема відповіді'); b0.appendChild(h0); return;
      }
      var rows=d.rows||[], chg=0, erN=0;
      rows.forEach(function(r){
        if(r.err){ erN++; return; }
        if(Number(r.o2)!==Number(r.p2)||Number(r.o5)!==Number(r.p5)||Number(r.o7)!==Number(r.p7)) chg++;
      });
      setView(rows, false, d.rate);
      var box=bar();
      var h=document.createElement('div'); h.className='h';
      h.textContent='👀 ПЕРЕГЛЯД: нові ціни — у колонці «Опт» біля товарів (нічого ще не записано). '
        +'Курс: '+fmtN(d.rate)+' · зміниться: '+chg+' із '+rows.length+(erN?(' · помилок: '+erN):'');
      box.appendChild(h);
      errLines(box, rows);
      var ap=document.createElement('button'); ap.className='lk-arropt-btn'; ap.style.marginLeft='0';
      ap.id='lk-arropt-apply';
      ap.textContent='✅ Записати вибрані';
      ap.addEventListener('click',function(){
        var sel=0, skips=[];
        view.list.forEach(function(r){
          if(r.err) return;
          if(r.skip){ if(r.pid!=null) skips.push(r.pid); }
          else sel++;
        });
        if(!sel) return;
        if(!confirm('Записати нові опт-ціни у '+sel+' товарів'
          +(skips.length?(' (пропустити без галочки: '+skips.length+')'):'')+'?')) return;
        document.documentElement.setAttribute('data-sd-arropt-skip', JSON.stringify(skips));
        ap.disabled=true;
        invoke('apply', function(d2){
          if(!d2 || !d2.ok){
            ap.disabled=false; ap.textContent='✗ не вдалось — ще раз';
            return;
          }
          var ok2=0, er2=0, sk2=0;
          (d2.rows||[]).forEach(function(r){ if(r.err) er2++; else if(r.skipped) sk2++; else ok2++; });
          setView(d2.rows, true, d2.rate);
          var box2=bar();
          var h2=document.createElement('div'); h2.className='h';
          h2.textContent='💰 ЗАПИСАНО: '+ok2+' товарів'+(sk2?(' · пропущено: '+sk2):'')
            +(er2?(' · помилок: '+er2):'')+'. Колонка «Опт» — що тепер у картках.';
          box2.appendChild(h2);
          errLines(box2, d2.rows);
        }, function(p){ ap.textContent='✅ Пишу '+p+'…'; });
      });
      var cl=document.createElement('button'); cl.className='lk-arropt-btn';
      cl.style.background='#9e9e9e'; cl.textContent='✕ Прибрати';
      cl.addEventListener('click',function(){ clearView(); });
      box.appendChild(ap); box.appendChild(cl);
      updateApplyLabel();
    }, function(p){ btn.textContent='💰 Читаю '+p+'…'; });
  }

  function sync(){
    var btn=document.querySelector('.lk-arropt-btn-main');
    if(!onPage()){ if(btn) btn.remove(); clearViewIfAny(); return; }
    if(view) renderColumn();   // Angular перемалював рядки — повертаємо колонку
    if(!rowsCount()){ if(btn) btn.remove(); return; }
    if(btn) return;
    var host=null, hs=document.querySelectorAll('h1,h2,h3');
    for(var i=0;i<hs.length;i++){ if(/^Надходження товарів №/.test((hs[i].textContent||'').trim())){ host=hs[i]; break; } }
    btn=document.createElement('button'); btn.type='button'; btn.className='lk-arropt-btn lk-arropt-btn-main';
    btn.textContent='💰 Опт-ціни з собівартості';
    btn.title='Показати нові ціни (Великий ×1.2, середній ×1.25, майстри ×1.3↑5) колонкою біля товарів; запис — окремою кнопкою';
    btn.addEventListener('click',function(e){ e.preventDefault(); e.stopPropagation(); run(btn); });
    if(host) host.appendChild(btn);
    else{ var t=document.querySelector('table.document-invoice-products'); if(t&&t.parentElement) t.parentElement.insertBefore(btn,t); }
  }
  function clearViewIfAny(){ if(view||document.getElementById('lk-arropt-res')) clearView(); }

  var t=null;
  function syncSoon(){ clearTimeout(t); t=setTimeout(sync,300); }
  sync();
  window.addEventListener('lkdom', syncSoon);
  window.addEventListener('hashchange', syncSoon);
})();
}catch(e){ try{ console.warn("[SD] модуль «lkArrivalOpt» не запустився:", e); }catch(_){} }
/* ▲▲▲ МОДУЛЬ-END • lkArrivalOpt ▲▲▲ */

/* ▼▼▼ МОДУЛЬ-START • lkRoundPickup — 🔟 заокруглення суми самовивозу вгору до 10 ₴ ▼▼▼ */
/* ===== На картці заявки з доставкою «Самовивіз»: кнопка під таблицею товарів доводить
   суму до круглої (99→100, 108→110) корекцією ціни одного рядка. Core: sdRoundPickup. ===== */
try{ // SD-ізоляція: помилка цього модуля не зупинить решту
(function lkRoundPickup(){
  'use strict';
  var PAGE=(typeof unsafeWindow!=='undefined'&&unsafeWindow)||window;

  var css=''
    +'#lk-round-btn{display:inline-block;margin:6px 0 2px;padding:6px 16px;border:none;border-radius:7px;'
    +'  background:#1565C0;color:#fff;font:700 13px/1.5 Arial,sans-serif;cursor:pointer;white-space:nowrap}'
    +'#lk-round-btn:hover{background:#0D47A1}'
    +'#lk-round-btn[disabled]{background:#9e9e9e;cursor:default}'
    +'#lk-round-res{display:inline-block;margin-left:10px;font:700 13px/1.5 Arial,sans-serif;vertical-align:middle}'
    +'#lk-round-res.ok{color:#1B5E20}'
    +'#lk-round-res.er{color:#B71C1C}'
    +'.lk-round-opt{margin-left:6px;padding:5px 13px;border:none;border-radius:6px;background:#1565C0;'
    +'  color:#fff;font:700 13px/1.4 Arial,sans-serif;cursor:pointer}'
    +'.lk-round-opt:hover{background:#0D47A1}'
    +'.lk-round-inp{margin-left:10px;width:64px;padding:4px 8px;border:1px solid #90a4ae;border-radius:6px;'
    +'  font:700 13px/1.4 Arial,sans-serif;text-align:center}';
  var st=document.createElement('style'); st.textContent=css;
  (document.head||document.documentElement).appendChild(st);

  function onOrderPage(){ return /#\/order\/(update|create)/.test(location.hash||''); }

  // самовивіз? — кілька способів, від точних до загального:
  // 1) поле [attr-field-name="shipping_method"] (як у lkQuickPickup);
  // 2) селект/select2 (значення 43 або текст);
  // 3) рядок «Спосіб доставки: …» у «Даних заявки» (текст містить «самовив»)
  function isPickup(){
    var f=document.querySelector('[attr-field-name="shipping_method"]');
    if(f && /самовив/i.test((f.textContent||''))) return true;
    var sel=document.getElementById('shipping_method-wk');
    if(sel && 'value' in sel && /\d/.test(String(sel.value||''))){
      if(/(^|:)43$/.test(String(sel.value))||/\b43\b/.test(String(sel.value))) return true;
    }
    var c=document.querySelector('[id^="select2-shipping_method"][id$="-container"]');
    if(c && /самовив/i.test(c.getAttribute('title')||c.textContent||'')) return true;
    // фолбек: підпис «Спосіб доставки» → його рядок/контейнер
    var els=document.querySelectorAll('label,td,div,span');
    for(var i=0;i<els.length;i++){
      var t=(els[i].textContent||'').replace(/\s+/g,' ').trim();
      if(!/^Спосіб\s*доставки$/i.test(t)) continue;
      var row=els[i].closest('tr')||els[i].parentElement;
      for(var up=0; row && up<3; up++){
        var rt=(row.textContent||'');
        if(rt.length<200 && /самовив/i.test(rt)) return true;
        row=row.parentElement;
      }
    }
    return false;
  }

  // діагностика: чому кнопки нема (видно у консолі F12 як [SD-Округлення])
  var lastDbg='';
  function dbg(m){
    if(m===lastDbg) return;
    lastDbg=m;
    try{
      var v=(typeof GM_info!=='undefined'&&GM_info.script)?GM_info.script.version:'?';
      console.debug('[SD-Округлення v'+v+']', m);
    }catch(e){}
  }

  // місце: одразу ПІСЛЯ таблиці товарів (якір — кнопка «+ Додати»)
  function findSpot(){
    var btn=null, all=document.querySelectorAll('[ng-click]');
    for(var i=0;i<all.length;i++){
      if((all[i].getAttribute('ng-click')||'').replace(/\s+/g,'')==='viewModel.addOption()'){ btn=all[i]; break; }
    }
    if(!btn) btn=document.getElementById('addCompleteProduct');
    if(!btn) return null;
    var tbl=btn.closest('table');
    return (tbl && tbl.parentElement) ? tbl : null;
  }

  var fN=function(n){ return String(Number(n).toFixed(2)).replace('.',','); };

  // виклик core-обробника: target = 'calc' (лише сума) або число (ціль)
  function invoke(target, cb){
    var token=String(Date.now())+'_'+Math.random().toString(36).slice(2);
    var tm=null, fin=false;
    function done(){ fin=true; PAGE.removeEventListener('sdRoundPickupResult', onRes); clearTimeout(tm); }
    function onRes(){
      var raw=document.documentElement.getAttribute('data-sd-round-result');
      if(!raw) return;
      var d; try{ d=JSON.parse(raw); }catch(e){ return; }
      if(!d || d.token!==token) return;
      done(); cb(d);
    }
    PAGE.addEventListener('sdRoundPickupResult', onRes);
    document.documentElement.setAttribute('data-sd-round-token', token);
    document.documentElement.setAttribute('data-sd-round-target', String(target));
    document.documentElement.removeAttribute('data-sd-round-result');
    PAGE.dispatchEvent(new Event('sdRoundPickup'));
    tm=setTimeout(function(){ if(fin) return; done(); cb(null); },8000);
  }

  // видима кнопка «Зберегти» самої заявки (не в модалці)
  function orderSaveBtn(){
    var bs=document.querySelectorAll('button,a,input[type=submit]');
    for(var i=0;i<bs.length;i++){
      var b=bs[i];
      if(!b.offsetParent) continue;
      if(b.closest('.modal')) continue;
      if(/^зберегти$/i.test((b.textContent||b.value||'').trim())) return b;
    }
    return null;
  }

  function applyTarget(v, btn, res){
    btn.disabled=true; res.className=''; res.textContent='…';
    invoke(v, function(d){
      btn.disabled=false;
      if(!d || !d.ok){ res.className='er'; res.textContent='✗ '+((d&&d.err)||'нема відповіді'); return; }
      if(d.same){ res.className='ok'; res.textContent='✓ сума вже '+fN(d.total); return; }
      var base='✓ '+fN(d.from)+' → '+fN(d.to)
        +' ('+(d.row&&d.row.name?d.row.name:'')+': нова ціна '+fN(d.row.newPrice)+')'
        +(d.exact?'':' ⚠ не рівно '+d.target+' — перевір');
      res.className=d.exact?'ok':'er';
      res.textContent=base+' · зберігаю…';
      // авто-«Зберегти» через паузу (дати Angular домалювати суму)
      setTimeout(function(){
        var sb=orderSaveBtn();
        if(!sb){ res.textContent=base+' ⚠ кнопку «Зберегти» не знайшов — збережи вручну'; return; }
        sb.click();
        setTimeout(function(){ res.textContent=base+' · ✓ збережено'; },1500);
      },400);
    });
  }

  // крок 1: порахувати суму й показати ВИБІР цілі: [вниз до 10] [вгору до 5] [вгору до 10] [своя]
  function run(btn,res){
    btn.disabled=true; res.className=''; res.textContent='…';
    invoke('calc', function(d){
      btn.disabled=false;
      if(!d || !d.ok){ res.className='er'; res.textContent='✗ '+((d&&d.err)||'нема відповіді'); return; }
      var total=d.total;
      res.textContent=''; res.className='';
      var lbl=document.createElement('span'); lbl.textContent='Зараз '+fN(total)+' → ';
      res.appendChild(lbl);
      var f10=Math.floor(total/10)*10, c5=Math.ceil(total/5)*5, c10=Math.ceil(total/10)*10;
      var opts=[];
      if(f10>0 && f10<total) opts.push(f10);
      if(c5>total) opts.push(c5);
      if(c10>total && opts.indexOf(c10)<0) opts.push(c10);
      if(!opts.length){ res.className='ok'; res.textContent='✓ сума вже кругла: '+fN(total); return; }
      opts.forEach(function(v){
        var b=document.createElement('button'); b.type='button'; b.className='lk-round-opt';
        b.textContent=String(v);
        b.title=(v<total?'заокруглити ВНИЗ':'заокруглити вгору');
        b.addEventListener('click',function(e){ e.preventDefault(); e.stopPropagation(); applyTarget(v,btn,res); });
        res.appendChild(b);
      });
      var inp=document.createElement('input'); inp.type='text'; inp.className='lk-round-inp';
      inp.placeholder='своя'; inp.title='введи власну суму і натисни OK';
      var ok=document.createElement('button'); ok.type='button'; ok.className='lk-round-opt'; ok.textContent='OK';
      function go(){
        var v=parseFloat(String(inp.value).replace(/\s/g,'').replace(',','.'));
        if(!(v>0)){ inp.style.borderColor='#c0392b'; return; }
        applyTarget(v,btn,res);
      }
      ok.addEventListener('click',function(e){ e.preventDefault(); e.stopPropagation(); go(); });
      inp.addEventListener('keydown',function(e){ if(e.key==='Enter'){ e.preventDefault(); go(); } });
      res.appendChild(inp); res.appendChild(ok);
    });
  }

  function sync(){
    var btn=document.getElementById('lk-round-btn');
    if(!onOrderPage()){ if(btn){ btn.remove(); var r1=document.getElementById('lk-round-res'); if(r1) r1.remove(); } return; }
    if(!isPickup()){
      dbg('кнопки нема: самовивіз не визначено на цій сторінці');
      if(btn){ btn.remove(); var r0=document.getElementById('lk-round-res'); if(r0) r0.remove(); }
      return;
    }
    var tbl=findSpot();
    if(!tbl){ dbg('кнопки нема: не знайдено таблицю товарів (режим перегляду?)'); if(btn) btn.remove(); return; }
    dbg('кнопка показана');
    if(btn) return;
    btn=document.createElement('button'); btn.type='button'; btn.id='lk-round-btn';
    btn.textContent='🔟 Заокруглити суму (вгору до 10 ₴)';
    btn.title='99 → 100, 108 → 110: корекція ціни одного рядка, потім «Зберегти»';
    var res=document.createElement('span'); res.id='lk-round-res';
    btn.addEventListener('click',function(e){ e.preventDefault(); e.stopPropagation(); run(btn,res); });
    tbl.insertAdjacentElement('afterend', btn);
    btn.insertAdjacentElement('afterend', res);
  }

  var t=null;
  function syncSoon(){ clearTimeout(t); t=setTimeout(sync,400); }
  sync();
  window.addEventListener('lkdom', syncSoon);
  window.addEventListener('hashchange', syncSoon);
})();
}catch(e){ try{ console.warn("[SD] модуль «lkRoundPickup» не запустився:", e); }catch(_){} }
/* ▲▲▲ МОДУЛЬ-END • lkRoundPickup ▲▲▲ */

/* ▼▼▼ МОДУЛЬ-START • lkOrderTier — 💱 перерахунок цін заявки за типом ціни (опт/майстри) ▼▼▼ */
/* ===== Кнопка під таблицею товарів: одним кліком ставить усім рядкам ціну
   «Великий опт» / «середній опт» / «майстри» / ROZETKA / роздріб — з прайсу самого
   товару (рядки заявки вже несуть priceTypes, запити не потрібні). Спершу показує,
   що зміниться (стара сума → нова), і лише потім записує. Core: sdTierPrice.
   Зберігає менеджер — «Зберегти» самі не тиснемо. ===== */
try{ // SD-ізоляція: помилка цього модуля не зупинить решту
(function lkOrderTier(){
  'use strict';
  var PAGE=(typeof unsafeWindow!=='undefined'&&unsafeWindow)||window;

  var css=''
    +'#lk-tier-wrap{margin:6px 0 2px;font:13px/1.5 Arial,sans-serif}'
    +'#lk-tier-btn{display:inline-block;padding:6px 16px;border:none;border-radius:7px;'
    +'  background:#00796B;color:#fff;font:700 13px/1.5 Arial,sans-serif;cursor:pointer;white-space:nowrap}'
    +'#lk-tier-btn:hover{background:#00594f}'
    +'#lk-tier-btn[disabled]{background:#9e9e9e;cursor:default}'
    +'.lk-tier-opt{margin-left:6px;padding:5px 13px;border:none;border-radius:6px;background:#00796B;'
    +'  color:#fff;font:700 13px/1.4 Arial,sans-serif;cursor:pointer}'
    +'.lk-tier-opt:hover{background:#00594f}'
    +'.lk-tier-opt.go{background:#2E7D32}'
    +'.lk-tier-opt.go:hover{background:#256628}'
    +'.lk-tier-opt.no{background:#9e9e9e}'
    +'#lk-tier-res{display:inline-block;margin-left:10px;vertical-align:middle;font-weight:700}'
    +'#lk-tier-res.ok{color:#1B5E20}'
    +'#lk-tier-res.er{color:#B71C1C}'
    +'#lk-tier-prev{margin:6px 0 0;padding:7px 10px;border-left:3px solid #00796B;background:#e9f5f3;'
    +'  border-radius:5px;max-width:760px}'
    +'#lk-tier-prev table{border-collapse:collapse;font:12.5px/1.45 Arial,sans-serif}'
    +'#lk-tier-prev td{padding:2px 10px 2px 0;white-space:nowrap}'
    +'#lk-tier-prev td.nm{white-space:normal;max-width:340px}'
    +'#lk-tier-prev .up{color:#B71C1C;font-weight:700}'
    +'#lk-tier-prev .dn{color:#1B5E20;font-weight:700}'
    +'#lk-tier-prev .miss{color:#8a6d00}';
  var st=document.createElement('style'); st.textContent=css;
  (document.head||document.documentElement).appendChild(st);

  function onOrderPage(){ return /#\/order\/(update|create)/.test(location.hash||''); }
  function fN(n){ return String(Number(n).toFixed(2)).replace('.',','); }
  function esc(s){ return String(s==null?'':s).replace(/[&<>"]/g,function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); }

  // місце: одразу ПІСЛЯ таблиці товарів (той самий якір, що в заокругленні)
  function findSpot(){
    var btn=null, all=document.querySelectorAll('[ng-click]');
    for(var i=0;i<all.length;i++){
      if((all[i].getAttribute('ng-click')||'').replace(/\s+/g,'')==='viewModel.addOption()'){ btn=all[i]; break; }
    }
    if(!btn) btn=document.getElementById('addCompleteProduct');
    if(!btn) return null;
    var tbl=btn.closest('table');
    return (tbl && tbl.parentElement) ? tbl : null;
  }

  function invoke(payload, cb){
    var token=String(Date.now())+'_'+Math.random().toString(36).slice(2);
    var tm=null, fin=false;
    function done(){ fin=true; PAGE.removeEventListener('sdTierPriceResult', onRes); clearTimeout(tm); }
    function onRes(){
      var raw=document.documentElement.getAttribute('data-sd-tier-result'); if(!raw) return;
      var d; try{ d=JSON.parse(raw); }catch(e){ return; }
      if(!d || d.token!==token) return;
      done(); cb(d);
    }
    payload.token=token;
    PAGE.addEventListener('sdTierPriceResult', onRes);
    document.documentElement.removeAttribute('data-sd-tier-result');
    document.documentElement.setAttribute('data-sd-tier', JSON.stringify(payload));
    PAGE.dispatchEvent(new Event('sdTierPrice'));
    tm=setTimeout(function(){ if(fin) return; done(); cb(null); }, 8000);
  }

  // порядок кнопок: великий опт → середній → майстри → решта
  function rank(n){
    n=String(n||'').toLowerCase();
    if(/велик/.test(n)) return 1;
    if(/серед/.test(n)) return 2;
    if(/майст/.test(n)) return 3;
    return 9;
  }

  function clearPrev(){ var p=document.getElementById('lk-tier-prev'); if(p) p.remove(); }

  function showPreview(d, wrap, res){
    clearPrev();
    var box=document.createElement('div'); box.id='lk-tier-prev';
    var chg=(d.rows||[]).filter(function(r){ return r['new']!=null && !r.same; });
    var head='<div><b>'+esc(d.tier)+'</b>: сума '+fN(d.oldTotal)+' → <b>'+fN(d.newTotal)+' ₴</b>'
      +' · змінюється рядків: '+chg.length+'/'+(d.rows||[]).length
      +(d.miss?(' · <span class="miss">без цієї ціни: '+d.miss+'</span>'):'')+'</div>';
    var rowsHtml=(d.rows||[]).map(function(r){
      var right;
      if(r['new']==null) right='<td colspan="2" class="miss">немає такої ціни — лишиться '+fN(r.old)+'</td>';
      else if(r.same) right='<td>'+fN(r.old)+'</td><td>= без змін</td>';
      else right='<td>'+fN(r.old)+'</td><td class="'+(r['new']>r.old?'up':'dn')+'">→ '+fN(r['new'])+'</td>';
      return '<tr><td class="nm">'+esc(r.name)+(r.sku?(' <span style="color:#888">('+esc(r.sku)+')</span>'):'')+'</td>'+right+'</tr>';
    }).join('');
    box.innerHTML=head+'<table>'+rowsHtml+'</table>';
    var go=document.createElement('button'); go.type='button'; go.className='lk-tier-opt go';
    go.textContent='✅ Записати ціни ('+chg.length+')';
    go.disabled=!chg.length;
    var no=document.createElement('button'); no.type='button'; no.className='lk-tier-opt no'; no.textContent='Скасувати';
    var act=document.createElement('div'); act.style.marginTop='6px';
    act.appendChild(go); act.appendChild(no);
    box.appendChild(act);
    wrap.appendChild(box);
    no.addEventListener('click',function(e){ e.preventDefault(); e.stopPropagation(); clearPrev(); res.textContent=''; });
    go.addEventListener('click',function(e){
      e.preventDefault(); e.stopPropagation();
      go.disabled=true; go.textContent='записую…';
      invoke({mode:'apply', tier:d.tier}, function(a){
        clearPrev();
        if(!a || !a.ok){ res.className='er'; res.textContent='✗ '+((a&&a.err)||'нема відповіді'); return; }
        res.className='ok';
        res.textContent='✓ '+a.tier+': перераховано рядків '+a.n
          +(a.miss?(' (без цієї ціни: '+a.miss+')'):'')
          +' · сума '+fN(a.oldTotal)+' → '+fN(a.newTotal)+' ₴ — тепер натисни «Зберегти»';
      });
    });
  }

  function run(btn, res, wrap){
    clearPrev();
    btn.disabled=true; res.className=''; res.textContent='…';
    invoke({mode:'list'}, function(d){
      btn.disabled=false;
      if(!d || !d.ok){ res.className='er'; res.textContent='✗ '+((d&&d.err)||'нема відповіді'); return; }
      var tiers=(d.tiers||[]).slice().sort(function(a,b){
        var ra=rank(a.name), rb=rank(b.name);
        return ra!==rb ? ra-rb : a.name.localeCompare(b.name,'uk');
      });
      res.className=''; res.textContent='';
      if(!tiers.length){ res.className='er'; res.textContent='у товарів заявки немає додаткових цін'; return; }
      var lbl=document.createElement('span'); lbl.style.fontWeight='400';
      lbl.textContent='Поставити ціни: ';
      res.appendChild(lbl);
      tiers.forEach(function(t){
        var b=document.createElement('button'); b.type='button'; b.className='lk-tier-opt';
        b.textContent=t.name;
        b.title=t.name+' — є у '+t.n+' з '+d.items+' рядків';
        b.addEventListener('click',function(e){
          e.preventDefault(); e.stopPropagation();
          res.textContent='рахую…';
          invoke({mode:'preview', tier:t.name}, function(p){
            if(!p || !p.ok){ res.className='er'; res.textContent='✗ '+((p&&p.err)||'нема відповіді'); return; }
            res.textContent='';
            showPreview(p, wrap, res);
          });
        });
        res.appendChild(b);
      });
      var rb=document.createElement('button'); rb.type='button'; rb.className='lk-tier-opt';
      rb.textContent='роздріб'; rb.title='повернути звичайну (роздрібну) ціну товарів';
      rb.addEventListener('click',function(e){
        e.preventDefault(); e.stopPropagation();
        res.textContent='рахую…';
        invoke({mode:'preview', tier:'retail'}, function(p){
          if(!p || !p.ok){ res.className='er'; res.textContent='✗ '+((p&&p.err)||'нема відповіді'); return; }
          res.textContent=''; showPreview(p, wrap, res);
        });
      });
      res.appendChild(rb);
    });
  }

  function mount(){
    if(!onOrderPage()){ var old=document.getElementById('lk-tier-wrap'); if(old) old.remove(); return; }
    if(document.getElementById('lk-tier-wrap')) return;
    var tbl=findSpot(); if(!tbl) return;
    var wrap=document.createElement('div'); wrap.id='lk-tier-wrap';
    var btn=document.createElement('button'); btn.type='button'; btn.id='lk-tier-btn';
    btn.textContent='💱 Ціни за типом (опт / майстри)';
    var res=document.createElement('span'); res.id='lk-tier-res';
    var line=document.createElement('div');
    line.appendChild(btn); line.appendChild(res);
    wrap.appendChild(line);
    btn.addEventListener('click',function(e){ e.preventDefault(); e.stopPropagation(); run(btn,res,wrap); });
    tbl.parentElement.insertBefore(wrap, tbl.nextSibling);
  }

  var t=null;
  function soon(){ clearTimeout(t); t=setTimeout(mount,300); }
  soon();
  window.addEventListener('lkdom', soon);
  window.addEventListener('hashchange', function(){ clearPrev(); soon(); });
})();
}catch(e){ try{ console.warn("[SD] модуль «lkOrderTier» не запустився:", e); }catch(_){} }
/* ▲▲▲ МОДУЛЬ-END • lkOrderTier ▲▲▲ */

/* ▼▼▼ МОДУЛЬ-START • lkNpDescr — 📋 шаблони опису у формі ТТН Нової пошти ▼▼▼ */
/* ===== У формі «Сформувати ТТН» поле «Опис» СРМ заповнює переліком усіх товарів —
   це майже завжди більше за ліміт у 100 символів, і менеджер стирає його руками.
   Даємо кнопки-шаблони (один клік — і поле готове) та лічильник символів.
   Список шаблонів редагує сам менеджер («✎ шаблони»), зберігається в браузері.
   Нічого не зберігаємо і ТТН не створюємо — це робить менеджер. ===== */
try{ // SD-ізоляція: помилка цього модуля не зупинить решту
(function lkNpDescr(){
  'use strict';
  var KEY='lk_npdescr_tpl_v1';
  var DEF=['запчастини'];             // шаблон за замовчуванням
  var MAX=100;                        // ліміт опису в Новій пошті

  var css=''
    +'.lk-npd{margin:4px 0 2px;display:flex;align-items:center;gap:8px;flex-wrap:wrap;'
    +'  font:12.5px/1.5 -apple-system,Segoe UI,Roboto,Arial,sans-serif}'
    +'.lk-npd button{padding:4px 12px;border:1px solid #1565C0;border-radius:6px;background:#e8f0fe;'
    +'  color:#0d47a1;font:700 12.5px/1.4 Arial,sans-serif;cursor:pointer}'
    +'.lk-npd button:hover{background:#d4e4fd}'
    +'.lk-npd button.edit{border-color:#90a4ae;background:#f4f6f8;color:#455a64;font-weight:600}'
    +'.lk-npd .cnt{color:#777}'
    +'.lk-npd .cnt.bad{color:#B71C1C;font-weight:700}'
    +'.lk-npd-ed{margin:4px 0 6px;padding:8px 10px;border-left:3px solid #1565C0;background:#f2f7ff;'
    +'  border-radius:5px;font:12.5px/1.5 -apple-system,Segoe UI,Roboto,Arial,sans-serif}'
    +'.lk-npd-ed textarea{width:100%;box-sizing:border-box;min-height:78px;padding:6px 8px;'
    +'  border:1px solid #b0bec5;border-radius:5px;font:13px/1.5 Arial,sans-serif;resize:vertical}'
    +'.lk-npd-ed .hint{color:#607d8b;margin-bottom:4px}'
    +'.lk-npd-ed .act{margin-top:6px;display:flex;gap:8px;align-items:center}'
    +'.lk-npd-ed .act button{padding:4px 14px}'
    +'.lk-npd-ed .act .save{background:#2E7D32;border-color:#2E7D32;color:#fff}'
    +'.lk-npd-ed .act .save:hover{background:#256628}'
    +'.lk-npd-ed .warn{color:#B71C1C;font-weight:700}';
  var st=document.createElement('style'); st.textContent=css;
  (document.head||document.documentElement).appendChild(st);

  function load(){
    try{
      var a=JSON.parse(localStorage.getItem(KEY));
      if(Array.isArray(a) && a.length) return a.filter(function(x){ return String(x||'').trim(); });
    }catch(e){}
    return DEF.slice();
  }
  function save(list){ try{ localStorage.setItem(KEY, JSON.stringify(list)); }catch(e){} }

  // запис у поле так, щоб Angular побачив зміну (ng-model)
  function setVal(el, txt){
    try{
      var d=Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el),'value');
      if(d && d.set) d.set.call(el, txt); else el.value=txt;
    }catch(e){ el.value=txt; }
    el.dispatchEvent(new Event('input',{bubbles:true}));
    el.dispatchEvent(new Event('change',{bubbles:true}));
  }

  function mount(){
    var ta=document.getElementById('descriptionNovaPoshta');
    if(!ta){                                   // форму закрили — прибираємо панель
      [].forEach.call(document.querySelectorAll('.lk-npd,.lk-npd-ed'), function(n){ n.remove(); });
      return;
    }
    var box=ta.closest('.form-group')||ta.parentElement;
    var bar=box.querySelector('.lk-npd');
    if(!bar){
      bar=document.createElement('div'); bar.className='lk-npd';
      ta.insertAdjacentElement('afterend', bar);
    }

    function count(){
      var n=String(ta.value||'').length;
      var cn=bar.querySelector('.cnt'); if(!cn) return;
      var txt=n+' / '+MAX+(n>MAX?' — задовго, ТТН не сформується':'');
      var cls='cnt'+(n>MAX?' bad':'');
      if(cn.textContent!==txt) cn.textContent=txt;
      if(cn.className!==cls) cn.className=cls;
    }

    // перемальовуємо кнопки лише коли список шаблонів справді змінився
    function draw(){
      var list=load();
      var sig=JSON.stringify(list);
      if(bar.getAttribute('data-sig')!==sig){
        bar.setAttribute('data-sig', sig);
        bar.innerHTML='';
        list.forEach(function(t){
          var b=document.createElement('button'); b.type='button';
          b.textContent=t.length>28?(t.slice(0,26)+'…'):t;
          b.title='Підставити в опис: «'+t+'»'+(t.length>MAX?' ⚠ довше за '+MAX+' символів':'');
          b.addEventListener('click',function(e){
            e.preventDefault(); e.stopPropagation();
            setVal(ta, t); count();
            try{ ta.focus(); }catch(err){}
          });
          bar.appendChild(b);
        });
        var ed=document.createElement('button'); ed.type='button'; ed.className='edit';
        ed.textContent='✎ шаблони'; ed.title='Додати / змінити свої шаблони опису';
        ed.addEventListener('click',function(e){ e.preventDefault(); e.stopPropagation(); editor(); });
        bar.appendChild(ed);
        var cnt=document.createElement('span'); cnt.className='cnt';
        bar.appendChild(cnt);
      }
      count();
    }

    function editor(){
      var old=box.querySelector('.lk-npd-ed');
      if(old){ old.remove(); return; }                 // друге натискання — закрити
      var wrap=document.createElement('div'); wrap.className='lk-npd-ed';
      var hint=document.createElement('div'); hint.className='hint';
      hint.textContent='Один шаблон — один рядок (ліміт Нової пошти: '+MAX+' символів).';
      var area=document.createElement('textarea');
      area.value=load().join('\n');
      var act=document.createElement('div'); act.className='act';
      var sv=document.createElement('button'); sv.type='button'; sv.className='save'; sv.textContent='Зберегти';
      var cl=document.createElement('button'); cl.type='button'; cl.textContent='Скасувати';
      var msg=document.createElement('span');
      act.appendChild(sv); act.appendChild(cl); act.appendChild(msg);
      wrap.appendChild(hint); wrap.appendChild(area); wrap.appendChild(act);
      bar.insertAdjacentElement('afterend', wrap);
      area.focus();
      cl.addEventListener('click',function(e){ e.preventDefault(); e.stopPropagation(); wrap.remove(); });
      sv.addEventListener('click',function(e){
        e.preventDefault(); e.stopPropagation();
        var list=[], seen={};
        String(area.value||'').split('\n').forEach(function(ln){
          var t=ln.replace(/\s+/g,' ').trim();
          if(!t || seen[t]) return;
          seen[t]=1; list.push(t);
        });
        if(!list.length){ msg.className='warn'; msg.textContent='порожньо — лишаю як було'; return; }
        var longs=list.filter(function(t){ return t.length>MAX; });
        save(list);
        draw();
        wrap.remove();
        if(longs.length){
          var c=bar.querySelector('.cnt');
          if(c){ c.className='cnt bad'; c.textContent='⚠ довші за '+MAX+' символів: '+longs.length; }
        }
      });
    }

    draw();
    if(!ta.getAttribute('data-lk-npd')){
      ta.setAttribute('data-lk-npd','1');
      ta.addEventListener('input', count);
      ta.addEventListener('keyup', count);
    }
  }

  var t=null;
  function soon(){ clearTimeout(t); t=setTimeout(mount,250); }
  soon();
  window.addEventListener('lkdom', soon);
})();
}catch(e){ try{ console.warn("[SD] модуль «lkNpDescr» не запустився:", e); }catch(_){} }
/* ▲▲▲ МОДУЛЬ-END • lkNpDescr ▲▲▲ */

/* ▼▼▼ МОДУЛЬ-START • lkRozCommission — ⚖ комісія Rozetka для дописаних товарів ▼▼▼ */
/* ===== У Rozetka-замовленні товар, доданий менеджером, приходить із нульовою
   комісією. Модуль помічає появу нових рядків і проставляє їм той самий відсоток
   комісії, що був у товарів, які приїхали в замовленні спочатку. Core: sdRozCommission. ===== */
try{ // SD-ізоляція: помилка цього модуля не зупинить решту
(function lkRozCommission(){
  'use strict';
  var PAGE=(typeof unsafeWindow!=='undefined'&&unsafeWindow)||window;

  var css=''
    +'#lk-rozcomm{margin:6px 0 2px;padding:8px 12px;border:1px solid #BBD3F5;border-left:4px solid #1565C0;'
    +'  background:#E8F0FE;border-radius:6px;font:13px/1.5 Arial,sans-serif;color:#14418f;'
    +'  max-width:980px;box-sizing:border-box;position:relative}'
    +'#lk-rozcomm b{font-weight:800}'
    +'#lk-rozcomm .x{position:absolute;top:4px;right:8px;border:none;background:none;cursor:pointer;'
    +'  font-size:16px;color:#14418f;opacity:.6}'
    +'#lk-rozcomm .x:hover{opacity:1}';
  var st=document.createElement('style'); st.textContent=css;
  (document.head||document.documentElement).appendChild(st);

  function onOrderPage(){ return /#\/order\/(update|create)/.test(location.hash||''); }
  function orderKey(){ var m=(location.hash||'').match(/#\/order\/\w+\/(\d+)/); return m?m[1]:''; }
  function rows(){ return document.querySelectorAll('tr[ng-repeat^="item in viewModel.items"]').length; }
  function itemsTable(){
    var btn=null, all=document.querySelectorAll('[ng-click]');
    for(var i=0;i<all.length;i++){
      if((all[i].getAttribute('ng-click')||'').replace(/\s+/g,'')==='viewModel.addOption()'){ btn=all[i]; break; }
    }
    return btn?btn.closest('table'):null;
  }

  function notice(text){
    var old=document.getElementById('lk-rozcomm'); if(old) old.remove();
    var tbl=itemsTable(); if(!tbl||!tbl.parentElement) return;
    var box=document.createElement('div'); box.id='lk-rozcomm';
    box.innerHTML='<b>⚖ '+text+'</b>';
    var x=document.createElement('button'); x.className='x'; x.textContent='×';
    x.addEventListener('click',function(){ box.remove(); });
    box.appendChild(x);
    tbl.insertAdjacentElement('afterend', box);
    setTimeout(function(){ try{ box.remove(); }catch(e){} }, 25000);
  }

  var busy=false;
  function fill(){
    if(busy) return;
    busy=true;
    var token=String(Date.now())+'_'+Math.random().toString(36).slice(2);
    var tm=null;
    function done(){ PAGE.removeEventListener('sdRozCommissionResult', onRes); clearTimeout(tm); busy=false; }
    function onRes(){
      var raw=document.documentElement.getAttribute('data-sd-rozcomm-result');
      if(!raw) return;
      var d; try{ d=JSON.parse(raw); }catch(e){ return; }
      if(!d || d.token!==token) return;
      done();
      if(!d.ok || d.none) return;                       // не Rozetka / нема чого робити — мовчимо
      var pct=String(d.ref).replace('.',',')+'%';
      notice('Комісія Rozetka '+pct+(d.fallback?' (за замовчуванням — у замовленні не було товару з комісією)':'')
        +' проставлена '+d.n+' '+(d.n===1?'товару':'товарам')
        +' без комісії. Перевір і натисни «Зберегти».');
    }
    PAGE.addEventListener('sdRozCommissionResult', onRes);
    document.documentElement.setAttribute('data-sd-rozcomm-token', token);
    document.documentElement.removeAttribute('data-sd-rozcomm-result');
    PAGE.dispatchEvent(new Event('sdRozCommission'));
    tm=setTimeout(function(){ done(); }, 8000);
  }

  // стежимо за появою нових рядків товарів; спрацьовуємо із затримкою,
  // щоб не лізти, поки менеджер ще друкує в рядку
  var lastKey='', lastRows=-1, t=null;
  function check(){
    if(!onOrderPage()){ lastKey=''; lastRows=-1; return; }
    var key=orderKey(), n=rows();
    if(!n) return;
    if(key!==lastKey){ lastKey=key; lastRows=n; clearTimeout(t); t=setTimeout(fill, 2500); return; }
    if(n!==lastRows){ lastRows=n; clearTimeout(t); t=setTimeout(fill, 2500); }
  }

  var ct=null;
  function checkSoon(){ clearTimeout(ct); ct=setTimeout(check,400); }
  checkSoon();
  window.addEventListener('lkdom', checkSoon);
  window.addEventListener('hashchange', checkSoon);
})();
}catch(e){ try{ console.warn("[SD] модуль «lkRozCommission» не запустився:", e); }catch(_){} }
/* ▲▲▲ МОДУЛЬ-END • lkRozCommission ▲▲▲ */

/* ▼▼▼ МОДУЛЬ-START • lkStockWhere — 🔎 «Де товар»: у яких заявках висить код ▼▼▼ */
/* ===== Вставляєш код товару — показує, у яких заявках він «висить» у робочих
   (не кінцевих) статусах і по скільки штук. Враховує комплекти: код може входити
   складовою в набір (напр. 122 → набір 069), такі заявки теж показуються. ===== */
try{ // SD-ізоляція: помилка цього модуля не зупинить решту
(function lkStockWhere(){
  'use strict';
  var KITS_URL='https://barcode-printer-production-2b32.up.railway.app/api/kits?token=nab_8Kx2pQ7mLr4tW9vZ';
  // робочі статуси = товар ще «висить» за заявкою (не кінцевий продаж, не відмова)
  var WORK=[1,2,9,15,21,36];
  var TTL=10*60*1000, KITS_TTL=6*60*60*1000;
  // спільний шлюз ліміту API + внутрішній список заявок (модуль lkApiBudget)
  function sdApiFetch(u,o){ return (window.sdApi? window.sdApi.fetch(u,o) : fetch(u,o)); }
  function sdOrders(qs,page){ return window.sdApi.orders(qs,page); }
  function apiNote(){ return window.sdApi? window.sdApi.note() : 'Ліміт API SalesDrive вичерпано.'; }

  var css=''
    +'#lk-where-btn{position:fixed;left:18px;bottom:204px;z-index:99998;width:52px;height:52px;border-radius:50%;'
    +'  background:#5E35B1;color:#fff;border:none;font-size:22px;cursor:pointer;box-shadow:0 3px 10px rgba(0,0,0,.3)}'
    +'#lk-where-btn:hover{filter:brightness(1.1)}'
    +'#lk-where-ov{position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.4);display:flex;'
    +'  align-items:flex-start;justify-content:center}'
    +'#lk-where-box{background:#fff;border-radius:10px;margin-top:60px;width:820px;max-width:94vw;'
    +'  max-height:80vh;display:flex;flex-direction:column;overflow:hidden;'
    +'  font:14px/1.5 -apple-system,"Segoe UI",Roboto,Arial,sans-serif;box-shadow:0 10px 40px rgba(0,0,0,.35)}'
    +'#lk-where-box .h{display:flex;align-items:center;justify-content:space-between;gap:10px;'
    +'  padding:12px 16px;background:#5E35B1;color:#fff;font-weight:700}'
    +'#lk-where-box .h .x{border:none;background:none;color:#fff;font-size:24px;line-height:1;cursor:pointer}'
    +'#lk-where-box .f{display:flex;gap:8px;padding:12px 16px;border-bottom:1px solid #e6e6e6;align-items:center}'
    +'#lk-where-box .f input{flex:1 1 auto;padding:9px 12px;border:1px solid #cfcfcf;border-radius:7px;font-size:15px}'
    +'#lk-where-box .f button{padding:9px 18px;border:none;border-radius:7px;background:#5E35B1;color:#fff;'
    +'  font-weight:700;font-size:14px;cursor:pointer}'
    +'#lk-where-box .f button[disabled]{background:#9e9e9e;cursor:default}'
    +'#lk-where-box .c{flex:1 1 auto;overflow-y:auto;padding:12px 16px}'
    +'#lk-where-box .sum{font-weight:800;font-size:15px;color:#311B92;margin-bottom:4px}'
    +'#lk-where-box .sub{color:#666;font-size:12.5px;margin-bottom:10px}'
    +'#lk-where-box table{width:100%;border-collapse:collapse}'
    +'#lk-where-box th{text-align:left;font-size:12px;color:#5E35B1;border-bottom:2px solid #d1c4e9;padding:5px 7px}'
    +'#lk-where-box td{border-bottom:1px solid #eee;padding:6px 7px;font-size:13.5px;vertical-align:top}'
    +'#lk-where-box td.q{font-weight:800;white-space:nowrap;text-align:right}'
    +'#lk-where-box td.st{white-space:nowrap}'
    +'#lk-where-box .kit{display:inline-block;margin-left:6px;padding:1px 7px;border-radius:9px;'
    +'  background:#ede7f6;color:#4527A0;font-size:11px;font-weight:700;white-space:nowrap}'
    +'#lk-where-box .msg{color:#666;padding:14px 2px}'
    +'#lk-where-box .err{color:#b00020;font-weight:700}';
  var st=document.createElement('style'); st.textContent=css;
  (document.head||document.documentElement).appendChild(st);

  function esc(s){ return String(s==null?'':s).replace(/[&<>"]/g,function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); }
  function gGet(k){ try{ var s=GM_getValue(k,null); return s?((typeof s==='string')?JSON.parse(s):s):null; }catch(e){ return null; } }
  function gSet(k,v){ try{ GM_setValue(k, JSON.stringify(v)); }catch(e){} }

  // ---- комплекти: код-складова -> [{kit, qty, name}] (кеш спільний із модулем наборів)
  var comp2kits=null;
  function buildComp(kits){
    var m={};
    Object.keys(kits||{}).forEach(function(kitSku){
      var info=kits[kitSku]||{};
      (info.comps||[]).forEach(function(c){
        var cs=String(c.sku==null?'':c.sku).trim();
        if(!cs) return;
        (m[cs]=m[cs]||[]).push({ kit:String(kitSku), qty:Number(c.qty)||1, name:info.name||'' });
      });
    });
    return m;
  }
  function loadKits(){
    if(comp2kits) return Promise.resolve(comp2kits);
    var c=gGet('lknb_cache2');
    // свіжий кеш (до 30 хв) — беремо одразу; старіший — перечитуємо, щоб нові набори враховувались
    if(c && c.kits && Date.now()-c.ts<30*60*1000){ comp2kits=buildComp(c.kits); return Promise.resolve(comp2kits); }
    if(c && c.kits && Date.now()-c.ts<KITS_TTL) comp2kits=buildComp(c.kits);   // запас, якщо мережа впаде
    return new Promise(function(resolve){
      function done(txt){
        try{ var d=JSON.parse(txt); if(d.ok&&d.kits){ gSet('lknb_cache2',{ts:Date.now(),kits:d.kits}); comp2kits=buildComp(d.kits); } }catch(e){}
        resolve(comp2kits||{});
      }
      try{
        if(typeof GM_xmlhttpRequest!=='undefined'){
          GM_xmlhttpRequest({ method:'GET', url:KITS_URL,
            onload:function(r){ done(r.responseText); }, onerror:function(){ resolve(comp2kits||{}); } });
        } else { fetch(KITS_URL).then(function(r){return r.text();}).then(done).catch(function(){ resolve(comp2kits||{}); }); }
      }catch(e){ resolve(comp2kits||{}); }
    });
  }

  // ---- заявки в робочих статусах (кеш 10 хв, СПІЛЬНИЙ для всіх вкладок) ----
  // Кеш у localStorage: друга вкладка/повторний пошук не витрачають годинний ліміт API.
  var CKEY='lksw_cache_v1';
  var cache=null, statusMap={}, staleNote='';
  function readCache(){
    if(cache) return cache;
    try{
      var c=JSON.parse(localStorage.getItem(CKEY));
      if(c && c.rows){ cache=c; if(c.st) statusMap=c.st; }
    }catch(e){}
    return cache;
  }
  function saveCache(rows){
    cache={ t:Date.now(), rows:rows, st:statusMap };
    try{ localStorage.setItem(CKEY, JSON.stringify(cache)); }catch(e){}
  }
  // Заявки тягнемо ВНУТРІШНІМ запитом СРМ (як сама СРМ на сторінці списку) —
  // без API-ключа і без годинного ліміту. Там у товарах немає sku, лише productId,
  // тому шуканий код спершу перекладаємо в productId (довідник — теж внутрішній).
  function loadOrders(onProg){
    var old=readCache();
    if(old && Date.now()-old.t<TTL){ staleNote=''; return Promise.resolve(old.rows); }
    var q=WORK.map(function(s){ return 'filter[statusId][]='+s; }).join('&');
    var all=[], page=1, pages=1;
    function next(){
      if(onProg) onProg(page, pages);
      return sdOrders(q, page).then(function(res){
        (res.rows||[]).forEach(function(o){
          all.push({ id:o.id, st:o.statusId, prods:(o.products||[]).map(function(p){
            return { pid:Number(p.productId)||0, amt:Number(p.amount)||0 };
          }) });
        });
        try{
          var opts=(((res.meta||{}).fields||{}).statusId||{}).options
                 || (res.meta||{}).statuses || [];
          opts.forEach(function(o){ statusMap[o.value]=String(o.text||'').replace(/\s+/g,' ').trim(); });
        }catch(e){}
        pages=res.pageCount||1;
        page++;
        if(page<=pages && page<=12) return next();
        saveCache(all); staleNote='';
        return all;
      });
    }
    return next().catch(function(e){
      if(old && old.rows){                       // мережа впала — краще старе, ніж нічого
        staleNote='Дані з кешу ('+Math.round((Date.now()-old.t)/60000)+' хв тому)';
        return old.rows;
      }
      throw e;
    });
  }

  // ---- код товару → productId (внутрішній довідник, кеш 24 год) ----
  // Один код може мати кілька товарів (напр. 069 — і окремий товар, і комплект).
  var PKEY='lksw_pid_v1', PTTL=24*60*60*1000;
  function pidCache(){ try{ return JSON.parse(localStorage.getItem(PKEY))||{}; }catch(e){ return {}; } }
  function resolveSku(sku){
    sku=String(sku).trim();
    var c=pidCache(), rec=c[sku];
    if(rec && Date.now()-rec.t<PTTL) return Promise.resolve(rec.v);
    return fetch('/products/data/?active=1&filter[sku]='+encodeURIComponent(sku)+'&formId=1',
                 {credentials:'include',headers:{'accept':'application/json, text/plain, */*','when':'product/index'}})
      .then(function(r){ return r.ok?r.json():null; })
      .then(function(j){
        var arr=(((((j||{}).response||{}).meta||{}).option||{}).option)||[];
        var v=arr.filter(function(x){ return String(x.sku).trim()===sku; })
                 .map(function(x){ return { id:Number(x.id)||0, name:String(x.documentName||x.name||'').slice(0,70) }; });
        var cc=pidCache(); cc[sku]={t:Date.now(), v:v};
        try{ localStorage.setItem(PKEY, JSON.stringify(cc)); }catch(e){}
        return v;
      })
      .catch(function(){ return (rec&&rec.v)||[]; });
  }

  // шукаємо за productId: сам товар + ті самі комплекти, у які він входить
  function search(rows, sku, idMap){
    var kitsOf=(comp2kits||{})[String(sku).trim()]||[];
    var hits=[];
    rows.forEach(function(o){
      o.prods.forEach(function(p){
        var m=idMap[p.pid]; if(!m) return;
        hits.push({ id:o.id, st:o.st, qty:p.amt*(m.qty||1), name:m.name||'', via:m.via||null });
      });
    });
    hits.sort(function(a,b){ return (a.st-b.st)||(b.id-a.id); });
    return { hits:hits, kits:kitsOf };
  }

  function render(box, sku, res){
    var c=box.querySelector('.c');
    var total=0, byStatus={};
    res.hits.forEach(function(h){
      total+=h.qty;
      byStatus[h.st]=(byStatus[h.st]||0)+h.qty;
    });
    var stale=staleNote?('<div class="sub">⏳ '+esc(staleNote)+'</div>'):'';
    if(!res.hits.length){
      c.innerHTML='<div class="msg">Код <b>'+esc(sku)+'</b> у жодній заявці в роботі не знайдено.<br>'
        +'Отже, залишок не «висить» у заявках — причина в чомусь іншому (не оприбутковано, списання, помилка обліку).</div>'+stale;
      return;
    }
    var head='<div class="sum">Код '+esc(sku)+': у роботі '+total+' шт (позицій: '+res.hits.length+')</div>'+stale;
    var byTxt=Object.keys(byStatus).map(function(s){ return (statusMap[s]||('статус '+s))+' — '+byStatus[s]+' шт'; }).join(' · ');
    head+='<div class="sub">'+esc(byTxt)+'</div>';
    if(res.kits.length){
      head+='<div class="sub">Входить у комплекти: '
        +res.kits.map(function(k){ return esc(k.kit)+' ('+esc(k.name)+', ×'+k.qty+')'; }).join(', ')
        +' — заявки з ними теж враховано.</div>';
    }
    var rows=res.hits.map(function(h){
      return '<tr>'
        +'<td><a href="/ua/index.html?formId=1#/order/update/'+h.id+'" target="_blank" rel="noopener">№'+h.id+'</a></td>'
        +'<td class="st">'+esc(statusMap[h.st]||('статус '+h.st))+'</td>'
        +'<td>'+esc(h.name||'')+(h.via?('<span class="kit">у складі '+esc(h.via)+'</span>'):'')+'</td>'
        +'<td class="q">'+h.qty+' шт</td>'
      +'</tr>';
    }).join('');
    c.innerHTML=head+'<table><thead><tr><th>Заявка</th><th>Статус</th><th>Позиція</th><th style="text-align:right">К-ть</th></tr></thead><tbody>'+rows+'</tbody></table>';
  }

  function doSearch(box){
    var inp=box.querySelector('input'), btn=box.querySelector('.f button'), c=box.querySelector('.c');
    var sku=String(inp.value||'').trim();
    if(!sku){ inp.focus(); return; }
    btn.disabled=true; c.innerHTML='<div class="msg">Шукаю…</div>';
    var idMap={};
    loadKits()
      .then(function(){
        // сам товар + комплекти, до складу яких він входить → усі їхні productId
        var kitsOf=(comp2kits||{})[sku]||[];
        var jobs=[ resolveSku(sku).then(function(list){
          list.forEach(function(p){ idMap[p.id]={ qty:1, name:p.name, via:null }; });
        }) ];
        kitsOf.forEach(function(k){
          jobs.push(resolveSku(k.kit).then(function(list){
            list.forEach(function(p){
              if(idMap[p.id]) return;                       // сам товар важливіший за комплект
              idMap[p.id]={ qty:k.qty||1, name:p.name||k.name, via:k.kit };
            });
          }));
        });
        return Promise.all(jobs);
      })
      .then(function(){ return loadOrders(function(p,t){ c.innerHTML='<div class="msg">Читаю заявки… сторінка '+p+(t>1?(' з '+t):'')+'</div>'; }); })
      .then(function(rows){ render(box, sku, search(rows, sku, idMap)); })
      .catch(function(e){
        c.innerHTML='<div class="msg err">'
          + (e&&e.limit ? '⏳ '+esc(apiNote()) : 'Не вдалося: '+esc(String(e&&e.message||e)))
          + '</div>';
      })
      .then(function(){ btn.disabled=false; });
  }

  function open(){
    if(document.getElementById('lk-where-ov')) return;
    var ov=document.createElement('div'); ov.id='lk-where-ov';
    ov.addEventListener('click',function(e){ if(e.target===ov) ov.remove(); });
    var box=document.createElement('div'); box.id='lk-where-box';
    box.innerHTML=''
      +'<div class="h"><span>🔎 Де товар: у яких заявках висить</span><button class="x" title="Закрити">&times;</button></div>'
      +'<div class="f"><input type="text" placeholder="код товару (напр. 122)" autocomplete="off"><button type="button">Шукати</button></div>'
      +'<div class="c"><div class="msg">Введи код товару і натисни «Шукати».<br>'
      +'Дивимось заявки в робочих статусах (Новий, Прийнято, На відправку, СПАКОВАНО, Предзамовлення, Сплата в інтернеті) — '
      +'тобто там, де товар ще не проданий остаточно. Комплекти враховуються.</div></div>';
    ov.appendChild(box); document.body.appendChild(ov);
    box.querySelector('.x').addEventListener('click',function(){ ov.remove(); });
    box.querySelector('.f button').addEventListener('click',function(){ doSearch(box); });
    var inp=box.querySelector('input');
    inp.addEventListener('keydown',function(e){ if(e.key==='Enter'){ e.preventDefault(); doSearch(box); } });
    setTimeout(function(){ try{ inp.focus(); }catch(e){} },50);
  }

  function addBtn(){
    if(document.getElementById('lk-where-btn')) return;
    var b=document.createElement('button'); b.id='lk-where-btn'; b.type='button';
    b.textContent='🔎'; b.title='Де товар: у яких заявках висить код';
    b.addEventListener('click',function(e){ e.preventDefault(); e.stopPropagation(); open(); });
    document.body.appendChild(b);
  }

  addBtn();
  window.addEventListener('lkdom', addBtn);
  // при переході на іншу сторінку панель має закриватись, а не висіти поверх вмісту
  window.addEventListener('hashchange', function(){
    var ov=document.getElementById('lk-where-ov'); if(ov) ov.remove();
  });
})();
}catch(e){ try{ console.warn("[SD] модуль «lkStockWhere» не запустився:", e); }catch(_){} }
/* ▲▲▲ МОДУЛЬ-END • lkStockWhere ▲▲▲ */

/* ▼▼▼ МОДУЛЬ-START • lkCatalogKits — Набори: позначка в каталозі «Товари» ▼▼▼ */
/* ===== У списку Товари/Послуги біля SKU показуємо, що товар входить у набори
   (у рядках заявки та в картці це вже було, у каталозі — бракувало). ===== */
try{ // SD-ізоляція: помилка цього модуля не зупинить решту
(function lkCatalogKits(){
  'use strict';
  var PAGE=(typeof unsafeWindow!=='undefined'&&unsafeWindow)||window;
  var KITS_URL='https://barcode-printer-production-2b32.up.railway.app/api/kits?token=nab_8Kx2pQ7mLr4tW9vZ';
  var CACHE='lknb_cache2', HARD=6*60*60*1000, SOFT=30*60*1000;
  var CAT=function(sku){ return '/ua/index.html?formId=1#/product/index?filter%5Bsku%5D='+encodeURIComponent(sku); };

  var css=''
    +'.lkck-plus{display:inline-flex;align-items:center;justify-content:center;width:16px;height:16px;'
    +'  margin-left:6px;border-radius:50%;background:#ef8a1f;color:#fff;font:700 12px/1 sans-serif;'
    +'  cursor:pointer;vertical-align:middle;user-select:none}'
    +'.lkck-plus:hover{background:#d97a12}'
    +'.lkck-exp{margin:4px 0 2px;padding:6px 9px;border-left:3px solid #ef8a1f;background:#fff7ec;'
    +'  border-radius:4px;font:12px/1.45 -apple-system,Segoe UI,Roboto,sans-serif;color:#333;'
    +'  white-space:normal;min-width:230px}'
    +'.lkck-exp .h{color:#8a5a12;font-weight:600;margin-bottom:3px}'
    +'.lkck-exp .r{padding:1px 0;font-family:ui-monospace,Menlo,Consolas,monospace}'
    +'.lkck-exp .r a{color:#0a58ca;text-decoration:underline;font-weight:700}'
    +'.lkck-exp .r .nm{color:#888;font-family:-apple-system,Segoe UI,Roboto,sans-serif}';
  var st=document.createElement('style'); st.textContent=css;
  (document.head||document.documentElement).appendChild(st);

  function esc(s){ return String(s==null?'':s).replace(/[&<>"]/g,function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); }
  function gGet(k){ try{ var v=GM_getValue(k,null); return v?((typeof v==='string')?JSON.parse(v):v):null; }catch(e){ return null; } }
  function gSet(k,v){ try{ GM_setValue(k, JSON.stringify(v)); }catch(e){} }

  var comp2kits=null, loading=false;
  function build(kits){
    var m={};
    Object.keys(kits||{}).forEach(function(kitSku){
      var info=kits[kitSku]||{};
      (info.comps||[]).forEach(function(c){
        var cs=String(c.sku==null?'':c.sku).trim();
        if(!cs) return;
        (m[cs]=m[cs]||[]).push({ kit:String(kitSku), qty:Number(c.qty)||1, name:info.name||'' });
      });
    });
    return m;
  }
  function fetchKits(){
    return new Promise(function(resolve,reject){
      function done(t){ try{ var d=JSON.parse(t); d.ok&&d.kits?resolve(d.kits):reject(new Error('no')); }catch(e){ reject(e); } }
      try{
        if(typeof GM_xmlhttpRequest!=='undefined'){
          GM_xmlhttpRequest({ method:'GET', url:KITS_URL,
            onload:function(r){ (r.status>=200&&r.status<300)?done(r.responseText):reject(new Error('HTTP '+r.status)); },
            onerror:function(){ reject(new Error('net')); } });
        } else { fetch(KITS_URL).then(function(r){return r.text();}).then(done).catch(reject); }
      }catch(e){ reject(e); }
    });
  }
  function refreshBg(){
    if(loading) return;
    loading=true;
    fetchKits().then(function(kits){
      comp2kits=build(kits); gSet(CACHE,{ts:Date.now(),kits:kits});
      try{ scan(); }catch(e){}
    }).catch(function(){}).then(function(){ loading=false; });
  }
  function ensureData(){
    if(comp2kits||loading) return;
    var c=gGet(CACHE), ts=0;
    if(c && c.kits && Date.now()-c.ts<HARD){ comp2kits=build(c.kits); ts=c.ts; }
    if(comp2kits){ if(Date.now()-ts>SOFT) refreshBg(); return; }
    refreshBg();
  }

  function onPage(){ return /#\/product\/index/.test(location.hash||''); }
  function onProductPage(){ return /#\/product\/update\/\d+/.test(location.hash||''); }

  // код товару рядка — з Angular-scope (надійніше за вгадування колонки)
  function rowSku(tr){
    try{
      var ng=PAGE.angular||window.angular;
      var sc=ng&&ng.element(tr).scope();
      var o=sc&&(sc.option||sc.item||sc.product);
      if(o&&o.sku!=null) return String(o.sku).trim();
    }catch(e){}
    return null;
  }
  // комірка, де надрукований цей код
  function skuCell(tr,sku){
    for(var i=0;i<tr.cells.length;i++){
      if(String(tr.cells[i].textContent||'').trim()===sku) return tr.cells[i];
    }
    return null;
  }

  function inject(cell,sku,list){
    var plus=document.createElement('span');
    plus.className='lkck-plus'; plus.textContent='+';
    plus.title='Входить у набори ('+list.length+')';
    var exp=document.createElement('div');
    exp.className='lkck-exp'; exp.style.display='none';
    exp.innerHTML='<div class="h">Входить у набори:</div>'+list.map(function(k){
      var kitHref=(window.sdProdLink? window.sdProdLink.url(k.kit, true) : CAT(k.kit));
      return '<div class="r"><a data-sd-sku="'+esc(k.kit)+'" data-sd-kit="1" href="'+kitHref
        +'" target="_blank" rel="noopener" title="Відкрити картку набору">'+esc(k.kit)+'</a>'
        +' · <span class="nm">'+esc(k.name)+'</span> ×'+k.qty+'</div>';
    }).join('');
    plus.addEventListener('click',function(e){
      e.preventDefault(); e.stopPropagation();
      var open=exp.style.display!=='none';
      exp.style.display=open?'none':'block';
      plus.textContent=open?'+':'–';
    });
    exp.addEventListener('click',function(e){ e.stopPropagation(); });
    cell.appendChild(plus); cell.appendChild(exp);
  }

  // окрема СТОРІНКА товару (#/product/update/ID): позначка одразу біля поля SKU
  function scanProductPage(){
    if(!comp2kits || !onProductPage()) return;
    var inp=document.querySelector('input[ng-model="viewModel.item.sku"]')
         || document.querySelector('input[ng-model$=".sku"]');
    if(!inp) return;
    var sku=String(inp.value==null?'':inp.value).trim();
    var host=inp.parentElement; if(!host) return;
    var list=comp2kits[sku];
    var should=!!(list&&list.length);
    var prev=host.getAttribute('data-lkck');
    var has=!!host.querySelector('.lkck-plus');
    if(prev===(sku||'') && has===should) return;
    var old=host.querySelectorAll('.lkck-plus,.lkck-exp');
    for(var i=0;i<old.length;i++) old[i].remove();
    host.setAttribute('data-lkck', sku||'');
    if(should) inject(host, sku, list);
  }

  function scan(){
    scanProductPage();
    if(!comp2kits || !onPage()) return;
    var trs=document.querySelectorAll('tr');
    for(var i=0;i<trs.length;i++){
      var tr=trs[i];
      if(!tr.cells || tr.cells.length<3) continue;
      var sku=rowSku(tr);
      if(sku==null) continue;
      var list=comp2kits[sku];
      var should=!!(list&&list.length);
      var prev=tr.getAttribute('data-lkck');
      var has=!!tr.querySelector('.lkck-plus');
      if(prev===(sku||'') && has===should) continue;
      var old=tr.querySelectorAll('.lkck-plus,.lkck-exp');
      for(var k=0;k<old.length;k++) old[k].remove();
      tr.setAttribute('data-lkck', sku||'');
      if(should){
        var cell=skuCell(tr,sku);
        if(cell) inject(cell,sku,list);
      }
    }
  }

  var t=null;
  function scanSoon(){ clearTimeout(t); t=setTimeout(function(){ ensureData(); scan(); },300); }
  ensureData(); scanSoon();
  window.addEventListener('lkdom', scanSoon);
  window.addEventListener('hashchange', scanSoon);
})();
}catch(e){ try{ console.warn("[SD] модуль «lkCatalogKits» не запустився:", e); }catch(_){} }
/* ▲▲▲ МОДУЛЬ-END • lkCatalogKits ▲▲▲ */

/* ▼▼▼ МОДУЛЬ-START • lkTtnPrintGuard — 🖨 попередження про ПОВТОРНИЙ друк ТТН Укрпошти ▼▼▼ */
/* ===== СРМ має серверний прапорець isPrinted (спільний для всіх менеджерів) — якщо ТТН
   уже друкували, попереджаємо перед повторним друком і показуємо бейдж біля ТТН.
   Додатково рахуємо друки на цьому ПК (точна кількість разів). ===== */
try{ // SD-ізоляція: помилка цього модуля не зупинить решту
(function lkTtnPrintGuard(){
  'use strict';
  var LKEY='lk_ttnprint_v1';


  function orderId(){ var m=(location.hash||'').match(/#\/order\/update\/(\d+)/); return m?m[1]:null; }
  function load(){ try{ return JSON.parse(localStorage.getItem(LKEY))||{}; }catch(e){ return {}; } }
  function save(o){ try{ localStorage.setItem(LKEY, JSON.stringify(o)); }catch(e){} }
  function fmtDate(t){
    try{ var d=new Date(t), p=function(n){ return (n<10?'0':'')+n; };
      return p(d.getDate())+'.'+p(d.getMonth()+1)+'.'+d.getFullYear()+' '+p(d.getHours())+':'+p(d.getMinutes());
    }catch(e){ return ''; }
  }

  // Стан заявки БЕЗ запитів до API: ядро кладе ТТН і прапорець друку Укрпошти
  // в data-sd-ukr (читає viewModel.ukrposhta прямо зі сторінки).
  var state={};   // orderId -> {ready, ttn, srvPrinted}
  function readState(){
    try{
      var raw=document.documentElement.getAttribute('data-sd-ukr'); if(!raw) return;
      var u=JSON.parse(raw); if(!u || !u.id) return;
      var prev=state[u.id];
      // локальну позначку «щойно надрукував» не збиваємо назад у false
      state[u.id]={ ready:true, ttn:String(u.ttn||''),
                    srvPrinted: !!u.printed || !!(prev&&prev.srvPrinted) };
    }catch(e){}
  }

  function localRec(ttn){ return ttn ? (load()[ttn]||null) : null; }

  // повідомлення про ПОВТОРНИЙ друк — у спільне зведення зверху (як недоставлені чати)
  function notifyRepeat(id, ttn, n){
    try{
      var LS='lk_chatfail_v1', all={};
      try{ all=JSON.parse(localStorage.getItem(LS))||{}; }catch(e){}
      all['ttn:'+ttn]={ num:String(id), ttn:String(ttn), kind:'ttn', n:n,
        sig:'ttn:'+ttn+':'+n, url:location.href, t:Date.now(), ack:0,
        reason:(n>1?('друковано '+n+'× на цьому ПК'):'у СРМ уже позначена як роздрукована') };
      localStorage.setItem(LS, JSON.stringify(all));
    }catch(e){}
  }

  // перехоплення кліку по кнопках друку ТТН (у СРМ: ng-click="viewModel.setIsPrinted(viewModel.ukrposhta)")
  document.addEventListener('click', function(e){
    try{
      var id=orderId(); if(!id) return;
      var t=e.target&&e.target.closest?e.target.closest('[ng-click]'):null;
      if(!t) return;
      var ng=t.getAttribute('ng-click')||'';
      if(!/setIsPrinted/i.test(ng)) return;
      if(!/ukrposhta/i.test(ng)) return;            // сторожа лише для Укрпошти
      var s=state[id];
      if(!s || !s.ready || !s.ttn) return;          // стан невідомий — не заважаємо
      var rec=localRec(s.ttn);
      var wasPrinted=!!(s.srvPrinted || rec);
      if(wasPrinted){
        var msg='⚠ ПОВТОРНИЙ ДРУК ТТН!\n\nТТН '+s.ttn+' (заявка №'+id+') уже друкували';
        if(rec) msg+='\n• на цьому ПК: '+rec.n+'× , останній раз '+fmtDate(rec.t);
        if(s.srvPrinted) msg+='\n• у СРМ позначена як роздрукована (міг друкувати інший менеджер)';
        msg+='\n\nДрукувати ще раз?';
        if(!confirm(msg)){ e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation(); return; }
      }
      var m=load(), now=Date.now();
      var cur=m[s.ttn]||{n:0};
      cur.n=(cur.n||0)+1; cur.t=now; cur.id=id;
      m[s.ttn]=cur;
      var lim=now-120*24*3600*1000;                 // чистка старших за 120 днів
      Object.keys(m).forEach(function(k){ if((m[k].t||0)<lim) delete m[k]; });
      save(m);
      s.srvPrinted=true;
      if(wasPrinted) notifyRepeat(id, s.ttn, cur.n);   // зверху зʼявиться «ТТН друковано повторно»
    }catch(err){}
  }, true);

  readState();
  window.addEventListener('sdUkrInfo', readState);   // ядро оновило дані Укрпошти
  window.addEventListener('lkdom', readState);       // підстраховка, якщо подію проґавили
  window.addEventListener('hashchange', function(){ state={}; setTimeout(readState, 600); });
})();
}catch(e){ try{ console.warn("[SD] модуль «lkTtnPrintGuard» не запустився:", e); }catch(_){} }
/* ▲▲▲ МОДУЛЬ-END • lkTtnPrintGuard ▲▲▲ */

/* ▼▼▼ МОДУЛЬ-START • lkCashRegister — 💰 Каса самовивозу (день/тиждень/місяць/період) ▼▼▼ */
/* ===== 💰 Каса самовивозу — день / тиждень / місяць / період ===== */
try{ // SD-ізоляція: помилка цього модуля не зупинить решту
(function lkCashRegister(){
  'use strict';

  var CASHORD   = '/document-cash-order/index/';
  var STATUS_ID = 5;     // Оплачено САМОВИВІЗ
  var CASH_ID   = 44;    // Готівкою 💵
  var CARD_ID   = 100;   // Термінал 💳
  var BARCODE_URL   = 'https://barcode-printer-production-2b32.up.railway.app';
  var BARCODE_TOKEN = 'nab_8Kx2pQ7mLr4tW9vZ';
  // фіскальні чеки — для розрізнення «фіскалізований» vs «чернетка»
  var CHECKS    = '/api/check/list/';
  var CHECK_KEY = 'Bfmy2OEwDnw022CI7GACrjwHOTLgyyZomtZOnTg-zLv3x_lsPTxiGSs6rFxQwAiWHWVqyYvH0JJYNgV2gJ2u14nnZMx8yMlBEI7E';

  function pad(n){ return n<10?'0'+n:''+n; }
  function ymd(d){ return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate()); }
  // дата+час локально (для стартової точки каси), формат "YYYY-MM-DD HH:MM:SS"
  function ymdhms(d){ return ymd(d)+' '+pad(d.getHours())+':'+pad(d.getMinutes())+':'+pad(d.getSeconds()); }
  // нормалізуємо будь-який рядок дати до порівнюваного "YYYY-MM-DD HH:MM:SS"
  // (дата без часу → початок дня, щоб старі baseline без часу не ламались)
  function dtnorm(s){ s=String(s==null?'':s).replace('T',' ').trim(); return s.length<=10 ? (s+' 00:00:00') : s.slice(0,19); }
  function fmt(n){ return Number(n||0).toLocaleString('uk-UA',{minimumFractionDigits:2,maximumFractionDigits:2})+' ₴'; }
  function num(v){ var m=String(v==null?'':v).replace(',','.').match(/-?[\d.]+/); return m?parseFloat(m[0]):0; }
  function sleep(ms){ return new Promise(function(r){ setTimeout(r,ms); }); }
  // спільний шлюз ліміту API + внутрішній список заявок (модуль lkApiBudget)
  function sdApiFetch(u,o){ return (window.sdApi? window.sdApi.fetch(u,o) : fetch(u,o)); }
  function sdOrders(qs,page){ return window.sdApi.orders(qs,page); }
  function apiNote(){ return window.sdApi? window.sdApi.note() : 'Ліміт API SalesDrive вичерпано.'; }
  function dstr(d){ return d.split('-').reverse().join('.'); }
  function startOfDay(d){ var x=new Date(d); x.setHours(0,0,0,0); return x; }

  // режим: 'day' | 'week' | 'month' | 'range'
  var mode='day';
  var renderSeq=0;                 // для скасування застарілих перемальовувань
  var anchor=new Date();           // опорна дата для day/week/month
  var rangeFrom=null, rangeTo=null;// для 'range' (рядки ymd)
  var _rangeCache=null;            // Рівень-1 кеш orders+видатків {key,t,data}; 90с
  var _checksCache=null;           // кеш мапи чеків {key, map}; живе до зміни періоду

  /* ---- журнал коригувань каси (стартових точок) ---- */
  // Зберігається у браузері (GM-сховище). Коригування з ІНШОГО компʼютера теж
  // потрапляють у журнал: adjLogSync() порівнює стартову точку з сервера з
  // останніми записами і додає відсутню з позначкою «інший ПК».
  var ADJLOG_KEY='lk_cash_adjlog_v1';
  function adjLogRead(){ try{ var s=GM_getValue(ADJLOG_KEY,null); var a=s?JSON.parse(s):[]; return Array.isArray(a)?a:[]; }catch(e){ return []; } }
  function adjLogWrite(a){ try{ GM_setValue(ADJLOG_KEY, JSON.stringify(a.slice(-50))); }catch(e){} }
  function adjLogAdd(e){ var a=adjLogRead(); a.push(e); adjLogWrite(a); }
  function adjLogSync(base){
    if(!base) return;
    var ts=dtnorm(base.ts||base.date);
    var a=adjLogRead();
    for(var i=a.length-1;i>=0;i--){ if(a[i].ts===ts) return; } // вже є в журналі
    a.push({ts:ts, open:num(base.amount), src:'remote'});
    adjLogWrite(a);
  }
  function adjLogHtml(){
    var a=adjLogRead();
    if(!a.length) return '';
    var items=a.slice().reverse().map(function(e){
      var d=String(e.ts||'').slice(0,10), tm=String(e.ts||'').slice(11,16);
      var what=(e.entered!=null)
        ? 'внесено <b>'+fmt(e.entered)+'</b> <span class="op">(опорний '+fmt(e.open)+')</span>'
        : 'опорний <b>'+fmt(e.open)+'</b> <span class="op">(інший ПК)</span>';
      return '<div class="it"><span class="dt">'+dstr(d)+' '+tm+'</span> — '+what+'</div>';
    }).join('');
    return '<div id="lk-cash-adjlog-t">🗒 Історія коригувань ('+a.length+') ▾</div>'
         + '<div id="lk-cash-adjlog" style="display:none">'+items+'</div>';
  }
  var _checksLoading=null;         // ключ періоду, для якого чеки вже вантажаться
  // фонове завантаження чеків: НЕ блокує відкриття каси; коли готово — перемальовує
  function loadChecksBg(okey, from, to, seqAtStart){
    if(_checksLoading===okey) return;   // вже вантажиться для цього періоду
    _checksLoading=okey;
    fetchChecks(from,to).catch(function(){ return {}; }).then(function(map){
      _checksLoading=null;
      _checksCache={key:okey, map:map||{}};
      // якщо користувач досі на тому ж рендері — оновлюємо бейджі перемальовкою
      if(seqAtStart===renderSeq && document.getElementById('lk-cash-box')) render();
    });
  }

  // Поточний понеділок тижня опорної дати
  function weekBounds(d){
    var x=startOfDay(d); var wd=(x.getDay()+6)%7; // 0=Пн
    var mon=new Date(x); mon.setDate(x.getDate()-wd);
    var sun=new Date(mon); sun.setDate(mon.getDate()+6);
    return [mon,sun];
  }
  function monthBounds(d){
    var first=new Date(d.getFullYear(),d.getMonth(),1);
    var last=new Date(d.getFullYear(),d.getMonth()+1,0);
    return [first,last];
  }
  // повертає {from,to,label} у форматі ymd
  function currentSpan(){
    if(mode==='range' && rangeFrom && rangeTo){
      var a=rangeFrom, b=rangeTo; if(a>b){ var t=a;a=b;b=t; }
      return {from:a,to:b,label:dstr(a)+' — '+dstr(b)};
    }
    if(mode==='week'){
      var w=weekBounds(anchor);
      return {from:ymd(w[0]),to:ymd(w[1]),label:'тиждень '+dstr(ymd(w[0]))+' — '+dstr(ymd(w[1]))};
    }
    if(mode==='month'){
      var m=monthBounds(anchor);
      var nm=anchor.toLocaleDateString('uk-UA',{month:'long',year:'numeric'});
      return {from:ymd(m[0]),to:ymd(m[1]),label:nm};
    }
    var s=ymd(anchor);
    return {from:s,to:s,label:dstr(s)};
  }
  function shift(dir){
    if(mode==='day')   anchor.setDate(anchor.getDate()+dir);
    else if(mode==='week')  anchor.setDate(anchor.getDate()+7*dir);
    else if(mode==='month') anchor.setMonth(anchor.getMonth()+dir);
    // range стрілками не листаємо
  }

  /* ---- стартовий залишок (barcode-app) ---- */
  function gmGet(url){
    return new Promise(function(res,rej){
      if(typeof GM_xmlhttpRequest!=='undefined'){
        GM_xmlhttpRequest({method:'GET',url:url,
          onload:function(r){ (r.status>=200&&r.status<300)?res(r.responseText):rej(new Error('HTTP '+r.status)); },
          onerror:function(){ rej(new Error('net')); }});
      } else { fetch(url).then(function(r){return r.text();}).then(res).catch(rej); }
    });
  }
  function gmPost(url,body){
    return new Promise(function(res,rej){
      if(typeof GM_xmlhttpRequest!=='undefined'){
        GM_xmlhttpRequest({method:'POST',url:url,headers:{'Content-Type':'application/json'},
          data:JSON.stringify(body),
          onload:function(r){ (r.status>=200&&r.status<300)?res(r.responseText):rej(new Error('HTTP '+r.status)); },
          onerror:function(){ rej(new Error('net')); }});
      } else {
        fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})
          .then(function(r){return r.text();}).then(res).catch(rej);
      }
    });
  }
  // SWR-кеш опорного залишку: каса показує його МИТТЄВО з кешу, а звіряння з
  // Railway (США) йде у фоні — тож відкриття/перемикання періодів не чекає мережу.
  var _baseCache=null; // {baseline, ts}
  try{ var _bs=GM_getValue('lk_cash_base_v1',null); if(_bs){ _baseCache=(typeof _bs==='string')?JSON.parse(_bs):_bs; } }catch(e){}
  function saveBase(){ try{ GM_setValue('lk_cash_base_v1', JSON.stringify(_baseCache)); }catch(e){} }
  function fetchBaselineNet(){
    return gmGet(BARCODE_URL+'/api/cash-baseline?token='+encodeURIComponent(BARCODE_TOKEN))
      .then(function(t){ var d=JSON.parse(t); return (d&&d.ok)?d.baseline:null; })
      .catch(function(){ return null; });
  }
  var _baseRevBusy=false;
  function revalidateBaseline(){
    if(_baseRevBusy) return; _baseRevBusy=true;
    fetchBaselineNet().then(function(b){
      _baseRevBusy=false;
      if(b==null) return;
      var changed = !_baseCache || JSON.stringify(_baseCache.baseline)!==JSON.stringify(b);
      _baseCache={baseline:b, ts:Date.now()}; saveBase();
      if(changed && document.getElementById('lk-cash-box')) render(); // дані змінились — перемалювати
    });
  }
  async function getBaseline(){
    if(_baseCache && _baseCache.baseline!=null){
      if(Date.now()-(_baseCache.ts||0) >= 20000) revalidateBaseline(); // застаріле — звіряємо у фоні
      return _baseCache.baseline;                                       // але віддаємо одразу
    }
    var b=await fetchBaselineNet();                                     // перший раз — чекаємо мережу
    if(b!=null){ _baseCache={baseline:b, ts:Date.now()}; saveBase(); }
    return b;
  }
  async function setBaseline(amount,pin){
    // amount = ОПОРНИЙ залишок на початок дня перерахунку (вже за мінусом сьогоднішніх
    // продажів і плюс сьогоднішні видатки) — рахується у adjust(). date+час для запису.
    var nowStr=ymdhms(new Date());
    var body={amount:amount,date:nowStr,ts:nowStr,by:'',pin:pin};
    var t=await gmPost(BARCODE_URL+'/api/cash-baseline?token='+encodeURIComponent(BARCODE_TOKEN),body);
    var d=JSON.parse(t); if(!d.ok) throw new Error(d.error||'err');
    _baseCache={baseline:d.baseline, ts:Date.now()}; saveBase(); // одразу в кеш — без зайвого запиту
    return d.baseline;
  }

  /* ---- продажі ---- */
  function payId(o){ var v=o.payment_method!=null?o.payment_method:(o.paymentMethod!=null?o.paymentMethod:o.payment_method_id);
    var m=String(v==null?'':v).match(/(\d+)/); return m?parseInt(m[1],10):null; }
  // Чи є фіскальний чек — прямо із замовлення (document_ord_check: 1=є, null/0=нема).
  function hasCheck(o){
    var v=o.document_ord_check!=null?o.document_ord_check:o.cek;
    return v!=null && v!==0 && v!=='0' && v!=='';
  }
  // Сума замовлення (готівка, що надходить у касу).
  // Якщо paymentAmount заповнено — це сума замовлення (беремо її).
  // Якщо ні — беремо |restPay| (там сума буває відʼємною, коли оплату сумою не внесено).
  function amount(o){
    var pa=o.paymentAmount;
    if(pa!=null && String(pa).trim()!=='') return num(pa);
    return Math.abs(num(o.restPay));
  }
  function payDate(o){ return String(o.paymentDate||'').slice(0,10); }
  function clientName(o){ var c=(o.contacts&&o.contacts[0])||o;
    var n=[c.lName||c.lname||'',c.fName||c.fname||''].join(' ').trim(); return n||('№'+o.id); }
  function ordUrl(pm,from,to){
    return '/ua/index.html?formId=1#/order/index?'
      +'filter%5BstatusId%5D%5B%5D='+STATUS_ID
      +'&filter%5Bpayment_method%5D%5B%5D='+pm
      +'&filter%5BpaymentDate%5D%5Bfrom%5D='+from
      +'&filter%5BpaymentDate%5D%5Bto%5D='+to;
  }
  // список за обидва способи оплати разом (готівка + термінал)
  function ordUrl2(from,to){
    return '/ua/index.html?formId=1#/order/index?'
      +'filter%5BstatusId%5D%5B%5D='+STATUS_ID
      +'&filter%5Bpayment_method%5D%5B%5D='+CASH_ID
      +'&filter%5Bpayment_method%5D%5B%5D='+CARD_ID
      +'&filter%5BpaymentDate%5D%5Bfrom%5D='+from
      +'&filter%5BpaymentDate%5D%5Bto%5D='+to;
  }
  var OUTC_URL='/ua/index.html?formId=1#/document/cash-order/outcoming';

  // Заявки беремо ВНУТРІШНІМ запитом СРМ (як сама СРМ на сторінці списку) —
  // без API-ключа й без годинного ліміту 100 запитів.
  async function fetchOrders(from,to){
    var page=1, pages=1, all=[];
    var qs='filter[statusId][]='+STATUS_ID
      +'&filter[paymentDate][from]='+from+'&filter[paymentDate][to]='+to;
    while(page<=pages && page<=40){
      var res;
      try{ res=await sdOrders(qs,page); }catch(e){ break; }
      all=all.concat(res.rows||[]);
      pages=res.pageCount||1; page++;
      if(page<=pages) await sleep(200);
    }
    return all;
  }

  // Мапа orderId → fiscalizationStatus ('done' | 'draft' | 'err' | ...).
  // Потрібна щоб розрізняти справжній чек від чернетки (нефіскалізованого).
  async function fetchChecks(from,to){
    var byOrder={}, page=1, guard=0;
    var ff=from+' 00:00:00', tt=to+' 23:59:59';
    while(guard++<10){
      var url=CHECKS+'?page='+page+'&limit=100'
        +'&filter[date][from]='+encodeURIComponent(ff)
        +'&filter[date][to]='+encodeURIComponent(tt);
      var r;
      try{ r=await sdApiFetch(url,{headers:{'X-Api-Key':CHECK_KEY,'Accept':'application/json'}}); }
      catch(e){ break; }   // ліміт — просто без чеків (сума каси від цього не залежить)
      var j=await r.json().catch(function(){return {};});
      var arr=j.data||[];
      arr.forEach(function(c){
        var oid=c.order&&c.order.id; if(!oid) return;
        var st=String(c.fiscalizationStatus||'').toLowerCase();
        // якщо для одного замовлення кілька чеків — 'done' у пріоритеті
        var prev=byOrder[oid];
        if(prev==='done') return;
        byOrder[oid]=st;
      });
      var pg=j.pagination||{};
      if(arr.length<100) break;
      if(pg.currentPage && pg.pageCount && pg.currentPage>=pg.pageCount) break;
      page++; await sleep(400);
    }
    return byOrder;
  }

  /* ---- заявки «Оплачено САМОВИВІЗ», але БЕЗ обраного способу оплати ---- */
  // дивимось останні 100 заявок статусу 5 (забута оплата — завжди серед свіжих),
  // лишаємо ті, де payId(o)===null (спосіб оплати порожній).
  var unpaidCache=null, unpaidBusy=false;
  async function fetchUnpaidPickup(){
    var out=[];
    var res;
    try{ res=await sdOrders('filter[statusId][]='+STATUS_ID, 1); }catch(e){ return out; }
    (res.rows||[]).forEach(function(o){ if(payId(o)===null) out.push({id:o.id,amount:amount(o),date:payDate(o),name:clientName(o)}); });
    return out;
  }
  async function loadUnpaid(force){
    if(unpaidBusy) return;
    if(unpaidCache && !force){ renderUnpaid(); return; }
    unpaidBusy=true; renderUnpaid('loading');
    try{ unpaidCache=await fetchUnpaidPickup(); }catch(e){ /* лишаємо попередній кеш */ }
    unpaidBusy=false; renderUnpaid();
  }
  function renderUnpaid(state){
    var el=document.getElementById('lk-cash-unpaid'); if(!el) return;
    if(state==='loading' && !unpaidCache){
      el.style.display='block';
      el.innerHTML='<div class="lk-unpaid-load">Перевіряю заявки без способу оплати…</div>';
      return;
    }
    var list=unpaidCache||[];
    if(!list.length){ el.style.display='none'; el.innerHTML=''; return; }
    var sum=0; list.forEach(function(x){ sum+=x.amount; });
    el.style.display='block';
    el.innerHTML='<div class="lk-unpaid-ttl">⚠️ Оплачено, але не вказано спосіб оплати: '+list.length+' зам. на '+fmt(sum)+'</div>'
      +'<div class="lk-unpaid-list">'+list.map(function(x){
        return '<a href="/ua/index.html?formId=1#/order/update/'+x.id+'" title="Відкрити заявку"><span class="nm">№'+x.id+' · '+x.name+(x.date?' · '+dstr(x.date):'')+'</span><span class="am">'+fmt(x.amount)+'</span></a>';
      }).join('')+'</div>'
      +'<div class="lk-unpaid-hint">Відкрийте заявку та проставте спосіб оплати — після цього вона зайде в касу.</div>';
  }

  /* ---- видаткові касові ордери: newest-first, стоп на from ---- */
  async function fetchOutcoming(from,to){
    var page=1,items=[],sum=0,guard=0,stop=false;
    while(guard++<80 && !stop){
      var url=CASHORD+'?active=1&formId=1&type=outcoming&page='+page;
      var r; try{ r=await fetch(url,{headers:{'Accept':'application/json'},credentials:'same-origin'}); }catch(e){ break; }
      var j=await r.json().catch(function(){return {};});
      var arr=j.data||[]; if(!arr.length) break;
      for(var i=0;i<arr.length;i++){
        var o=arr[i], dt=String(o.date||'').slice(0,10); if(!dt) continue;
        if(dt<from){ stop=true; break; }
        if(dt>to) continue;
        var a=num(o.totalSum); sum+=a;
        items.push({id:o.id,date:dt,ts:String(o.date||''),amount:a,comment:String(o.comment||'').trim(),number:o.number});
      }
      var pg=j.pagination||{}; if(pg.currentPage>=pg.pageCount) break;
      page++; await sleep(300);
    }
    return {sum:sum,items:items};
  }

  function ensureStyles(){
    if(document.getElementById('lk-cash-css')) return;
    var s=document.createElement('style'); s.id='lk-cash-css';
    s.textContent=''
    +'#lk-cash-btn{position:fixed;left:18px;bottom:18px;z-index:99998;width:52px;height:52px;border-radius:50%;'
    +'background:#ad2fb6;color:#fff;border:none;font-size:24px;cursor:pointer;box-shadow:0 3px 10px rgba(0,0,0,.3)}'
    +'#lk-cash-btn:hover{filter:brightness(1.08)}'
    +'#lk-cash-ov{position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.4);display:flex;align-items:center;justify-content:center}'
    +'#lk-cash-box{background:#fff;width:460px;max-width:94vw;max-height:90vh;overflow:auto;border-radius:12px;'
    +'font-family:system-ui,Arial,sans-serif;box-shadow:0 10px 40px rgba(0,0,0,.3)}'
    +'#lk-cash-box .h{display:flex;align-items:center;justify-content:space-between;padding:14px 16px;border-bottom:1px solid #eee}'
    +'#lk-cash-box .h b{font-size:17px}'
    +'#lk-cash-box .x{border:none;background:none;font-size:22px;cursor:pointer;color:#888;line-height:1}'
    +'#lk-cash-modes{display:flex;gap:6px;padding:11px 16px 4px;flex-wrap:wrap}'
    +'#lk-cash-modes button{border:1px solid #ddd;background:#fafafa;border-radius:7px;padding:5px 12px;cursor:pointer;font-size:13px;color:#555}'
    +'#lk-cash-modes button.on{background:#ad2fb6;border-color:#ad2fb6;color:#fff;font-weight:700}'
    +'#lk-cash-range{display:none;gap:8px;align-items:center;padding:4px 16px 2px;font-size:13px;color:#555}'
    +'#lk-cash-range.show{display:flex}'
    +'#lk-cash-range input{border:1px solid #ccc;border-radius:6px;padding:4px 6px;font-size:13px}'
    +'#lk-cash-range button{border:1px solid #ad2fb6;background:#ad2fb6;color:#fff;border-radius:6px;padding:5px 10px;cursor:pointer;font-size:13px}'
    +'#lk-cash-nav{display:flex;align-items:center;justify-content:center;gap:12px;padding:8px;font-size:14px;font-weight:600}'
    +'#lk-cash-nav button{border:1px solid #ddd;background:#fafafa;border-radius:7px;width:32px;height:32px;cursor:pointer;font-size:18px}'
    +'#lk-cash-nav .today{font-size:12px;color:#ad2fb6;cursor:pointer;text-decoration:underline;width:auto;height:auto;border:none;background:none}'
    +'#lk-cash-nav #lk-cash-span{min-width:150px;text-align:center;color:#333}'
    +'#lk-cash-bal{margin:2px 16px 6px;padding:15px 16px;border-radius:11px;background:#fbeffc;border:1px solid #e8b9ed;display:flex;justify-content:space-between;align-items:baseline}'
    +'#lk-cash-bal .l{font-size:14px;color:#7a2a80;font-weight:600}'
    +'#lk-cash-bal .v{font-size:24px;font-weight:800;color:#7a2a80}'
    +'#lk-cash-bal .sub{font-size:11px;color:#a06aa6;font-weight:400}'
    +'#lk-cash-day-sum{padding:2px 16px 6px}'
    +'#lk-cash-day-sum .row{display:flex;justify-content:space-between;align-items:baseline;padding:9px 14px;border-radius:9px;margin-bottom:7px}'
    +'#lk-cash-day-sum .cash{background:#eafaf1;border:1px solid #abebc6}'
    +'#lk-cash-day-sum .card{background:#eef4fd;border:1px solid #aed0f5}'
    +'#lk-cash-day-sum .out{background:#fdeeea;border:1px solid #f5b7a8}'
    +'#lk-cash-day-sum .total{background:#f3ecfb;border:1px solid #d6c3ef;padding:7px 14px;margin-top:-2px}'
    +'#lk-cash-day-sum .total .lbl{font-weight:600;color:#5b3d8a}'
    +'#lk-cash-day-sum .total .val{font-size:16px;color:#5b3d8a}'
    +'#lk-cash-day-sum .lbl{font-size:13px;color:#444}'
    +'#lk-cash-day-sum .val{font-size:18px;font-weight:800}'
    +'#lk-cash-day-sum .cnt{font-size:11px;color:#888;font-weight:400}'
    +'#lk-cash-out-list{padding:0 16px}'
    +'#lk-cash-out-list .it{display:flex;justify-content:space-between;gap:8px;padding:6px 12px;font-size:13px;border-bottom:1px dashed #f0d4cc}'
    +'#lk-cash-out-list a.it{text-decoration:none;color:#a8432a;cursor:pointer}'
    +'#lk-cash-out-list a.it:hover{background:#fdeeea}'
    +'#lk-cash-out-list .cm{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#7a3b28}'
    +'#lk-cash-out-list .dt{color:#b08;font-size:11px;margin-right:4px}'
    +'#lk-cash-out-list .am{white-space:nowrap;font-weight:700;color:#a8432a}'
    +'#lk-cash-list{padding:8px 16px 16px}'
    +'#lk-cash-list .ttl{font-size:12px;color:#999;text-transform:uppercase;letter-spacing:.5px;margin:8px 0 6px}'
    +'#lk-cash-list a{display:flex;justify-content:space-between;gap:8px;padding:7px 10px;border-bottom:1px solid #f1f1f1;text-decoration:none;color:#222;font-size:13px}'
    +'#lk-cash-list a:hover{background:#faf5fb}'
    +'#lk-cash-list .nm{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}'
    +'#lk-cash-list .dt{color:#aaa;font-size:11px;margin-right:4px}'
    +'#lk-cash-list .am{white-space:nowrap;font-weight:700}'
    +'#lk-cash-list .chk.ok{font-size:12px}'
    +'#lk-cash-list .chk.no{font-size:11px;color:#c0392b;font-weight:700;background:#fdecea;border:1px solid #f5b7a8;border-radius:4px;padding:0 4px;margin-left:4px}'
    +'#lk-cash-list .chk.draft{font-size:11px;color:#8a5a00;font-weight:700;background:#fff3d6;border:1px solid #ecd9a0;border-radius:4px;padding:0 4px;margin-left:4px}'
    +'#lk-cash-day-sum .row.card.warn{background:#fff7e6;border-color:#f0c36d}'
    +'#lk-cash-day-sum .nochk{color:#b9770e}'
    +'#lk-cash-day-sum a.row{text-decoration:none;color:inherit;cursor:pointer;transition:filter .1s}'
    +'#lk-cash-day-sum a.row:hover{filter:brightness(.97)}'
    +'#lk-cash-day-sum a.row .val{white-space:nowrap}'
    +'#lk-cash-adj{margin:4px 16px 4px;padding:9px;border:1px dashed #ccc;border-radius:9px;text-align:center;font-size:13px;color:#666;cursor:pointer}'
    +'#lk-cash-adj:hover{background:#fafafa}'
    +'#lk-cash-adjlog-t{margin:0 16px 14px;padding:4px 9px;text-align:center;font-size:12px;color:#999;cursor:pointer;user-select:none}'
    +'#lk-cash-adjlog-t:hover{color:#666}'
    +'#lk-cash-adjlog{margin:0 16px 16px;padding:6px 12px;border:1px solid #eee;border-radius:9px;background:#fcfcfc;font-size:12px;color:#555;max-height:180px;overflow-y:auto}'
    +'#lk-cash-adjlog .it{padding:4px 0;border-bottom:1px dashed #f0f0f0}'
    +'#lk-cash-adjlog .it:last-child{border-bottom:none}'
    +'#lk-cash-adjlog .dt{color:#999;font-size:11px}'
    +'#lk-cash-adjlog .op{color:#aaa;font-size:11px}'
    +'#lk-cash-unpaid{margin:2px 16px 8px;border:1px solid #f0b8a8;background:#fdeeea;border-radius:11px;overflow:hidden}'
    +'#lk-cash-unpaid .lk-unpaid-ttl{padding:10px 14px;font-size:13px;font-weight:800;color:#b2391c;background:#fbe2da}'
    +'#lk-cash-unpaid .lk-unpaid-list a{display:flex;justify-content:space-between;gap:8px;padding:7px 14px;text-decoration:none;color:#7a3b28;font-size:13px;border-top:1px solid #f3d3c9}'
    +'#lk-cash-unpaid .lk-unpaid-list a:hover{background:#fbe2da}'
    +'#lk-cash-unpaid .lk-unpaid-list .nm{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}'
    +'#lk-cash-unpaid .lk-unpaid-list .am{white-space:nowrap;font-weight:700}'
    +'#lk-cash-unpaid .lk-unpaid-hint{padding:7px 14px;font-size:11px;color:#9c5a48;background:#fff}'
    +'#lk-cash-unpaid .lk-unpaid-load{padding:9px 14px;font-size:12px;color:#999}'
    +'#lk-cash-load{padding:24px;text-align:center;color:#999}';
    document.head.appendChild(s);
  }

  function syncModeUI(){
    var box=document.getElementById('lk-cash-box'); if(!box) return;
    box.querySelectorAll('#lk-cash-modes button').forEach(function(b){
      b.classList.toggle('on', b.getAttribute('data-m')===mode);
    });
    box.querySelector('#lk-cash-range').classList.toggle('show', mode==='range');
    box.querySelector('#lk-cash-nav').style.display = (mode==='range')?'none':'flex';
  }

  function cashNote(msg){
    var el=document.getElementById('lk-cash-load');
    if(el) el.innerHTML=msg;
  }

  async function render(){
    var box=document.getElementById('lk-cash-box'); if(!box) return;
    var myseq=++renderSeq;
    syncModeUI();
    if(mode==='range' && !(rangeFrom&&rangeTo)){
      box.querySelector('#lk-cash-body').innerHTML='<div style="padding:18px 16px;color:#888;font-size:14px">Оберіть дати «від» і «до» та натисніть «Показати».</div>';
      return;
    }
    var span=currentSpan();
    box.querySelector('#lk-cash-span').textContent=span.label;
    box.querySelector('#lk-cash-body').innerHTML='<div id="lk-cash-load">Рахую…</div>';

    var base=await getBaseline();
    if(myseq!==renderSeq) return;
    if(!base){
      box.querySelector('#lk-cash-body').innerHTML=
        '<div style="padding:18px 16px;color:#555;font-size:14px;line-height:1.5">Стартовий залишок каси ще не задано.<br>Порахуйте готівку в коробці й натисніть нижче.</div>'
        +'<div id="lk-cash-adj">➕ Задати поточний залишок каси</div>';
      box.querySelector('#lk-cash-adj').onclick=adjust; return;
    }
    var bdate=String(base.date).slice(0,10);

    // ── Один запит на обʼєднаний діапазон, далі рахуємо і залишок, і період ──
    var hasBal=(span.to>=bdate);
    var uFrom=hasBal?(bdate<span.from?bdate:span.from):span.from;
    var uTo=span.to;
    // Кеш orders+видатків (Рівень 1, 90с). Каса рендериться ОДРАЗУ (як у 1.59),
    // а чеки (для «📝 чернетка») довантажуються У ФОНІ й оновлюють бейджі потім —
    // тож відкриття не гальмує ні повільне API чеків, ні його rate-limit.
    var okey=uFrom+'|'+uTo;
    var od;
    if(_rangeCache && _rangeCache.key===okey && (Date.now()-_rangeCache.t)<90000){
      od=_rangeCache.data;
    } else {
      try{ od=await Promise.all([ fetchOrders(uFrom,uTo), fetchOutcoming(uFrom,uTo) ]); }
      catch(e){
        if(!(e&&e.limit)) throw e;
        if(myseq!==renderSeq) return;
        box.querySelector('#lk-cash-body').innerHTML=
          '<div style="padding:18px 16px;color:#8a4a00;font-size:14px;line-height:1.55">⏳ '+apiNote()
          +'<br><span style="color:#999;font-size:12.5px">Ліміт спільний на весь акаунт — його міг вичерпати інший менеджер. '
          +'Каса порахується, щойно ліміт відновиться.</span></div>';
        return;
      }
      if(myseq!==renderSeq) return;
      _rangeCache={key:okey, t:Date.now(), data:od};
    }
    if(myseq!==renderSeq) return;
    var allOrders=od[0], allOut=od[1];
    // чеки: беремо з фонового кешу, якщо вже є; інакше стартуємо фонове завантаження
    var checkStatus = (_checksCache && _checksCache.key===okey) ? (_checksCache.map||{}) : {};
    if(!(_checksCache && _checksCache.key===okey)) loadChecksBg(okey, uFrom, uTo, myseq);

    function inPeriod(d){ return d>=span.from && d<=span.to; }

    // Залишок: уся готівка з продажів від стартової точки − видаткові ордери від стартової точки
    var balanceTxt;
    if(!hasBal){
      balanceTxt='<div style="padding:2px 16px 8px;color:#999;font-size:13px">Період раніше за стартову точку каси ('+dstr(bdate)+') — залишок не рахується.</div>';
    } else {
      // залишок = опорний (на початок дня перерахунку) + готівкові продажі − видатки,
      // від дати перерахунку. Опорний уже враховує сьогоднішні до-перерахункові операції,
      // тож подвійного рахунку немає, а нові продажі одразу збільшують залишок.
      var cashCum=0; allOrders.forEach(function(o){ if(payId(o)===CASH_ID && payDate(o)>=bdate) cashCum+=amount(o); });
      var outCum=0; allOut.items.forEach(function(x){ if(x.date>=bdate) outCum+=x.amount; });
      var balance=num(base.amount)+cashCum-outCum;
      balanceTxt='<div id="lk-cash-bal"><span class="l">💰 Готівка в касі<br><span class="sub">станом на '+dstr(span.to)+'</span></span><span class="v">'+fmt(balance)+'</span></div>';
    }

    // Обороти за вибраний період (з того самого набору)
    var orders=allOrders.filter(function(o){ return inPeriod(payDate(o)); });
    var outItems=allOut.items.filter(function(x){ return inPeriod(x.date); });
    var outSum=0; outItems.forEach(function(x){ outSum+=x.amount; });
    var out={sum:outSum,items:outItems};
    // Якщо мапа чеків порожня (fetchChecks впав / timeout / 401) —
    // повертаємось до старої поведінки (hasCheck → ✅ або ⚠️ без чека),
    // щоб каса виглядала як раніше і не фарбувала все у «чернетка».
    var checksAvailable = Object.keys(checkStatus).length>0;
    var pCash=0,pCashN=0,pCard=0,pCardN=0,rows=[],noCheckN=0,draftN=0;
    orders.forEach(function(o){
      var p=payId(o), a=amount(o), d=payDate(o);
      if(p===CASH_ID){ pCash+=a; pCashN++; } else if(p===CARD_ID){ pCard+=a; pCardN++; } else return;
      var ic=p===CASH_ID?'💵':'💳';
      var dd=(span.from!==span.to)?'<span class="dt">'+dstr(d)+'</span>':'';
      var badge='';
      if(p===CARD_ID){
        if(!checksAvailable){
          // fallback: як у 1.59 — просто чек є / чека немає
          if(hasCheck(o)){ badge=' <span class="chk ok" title="Чек є">✅</span>'; }
          else { badge=' <span class="chk no">⚠️ без чека</span>'; noCheckN++; }
        } else {
          var st=checkStatus[String(o.id)]; // fiscalizationStatus | undefined
          if(st==='done'){ badge=' <span class="chk ok" title="Чек фіскалізовано">✅</span>'; }
          else if(st){ badge=' <span class="chk draft" title="Чек є, але це чернетка (не фіскалізовано, статус: '+st+')">📝 чернетка</span>'; draftN++; }
          else if(hasCheck(o)){ badge=' <span class="chk draft" title="Чек прив`язано до заявки, але у списку чеків не знайдено підтвердження фіскалізації">📝 чернетка</span>'; draftN++; }
          else { badge=' <span class="chk no">⚠️ без чека</span>'; noCheckN++; }
        }
      }
      rows.push('<a href="/ua/index.html?formId=1#/order/update/'+o.id+'"><span class="nm">'+dd+ic+' №'+o.id+' · '+clientName(o)+badge+'</span><span class="am">'+fmt(a)+'</span></a>');
    });
    var multi=(span.from!==span.to);
    var outHtml='';
    if(out.items.length){
      outHtml='<div id="lk-cash-out-list">'+out.items.map(function(x){
        var dd=multi?'<span class="dt">'+dstr(x.date)+'</span>':'';
        return '<a class="it" href="/ua/index.html?formId=1#/document/cash-order/update/'+x.id+'" target="_blank" title="Відкрити касовий ордер"><span class="cm">'+dd+'📤 '+(x.comment||'видаток №'+x.number)+'</span><span class="am">−'+fmt(x.amount)+' ↗</span></a>';
      }).join('')+'</div>';
    }

    box.querySelector('#lk-cash-body').innerHTML=
      balanceTxt
      +'<div id="lk-cash-day-sum">'
      +' <a class="row cash" href="'+ordUrl(CASH_ID,span.from,span.to)+'" target="_blank" title="Відкрити у SalesDrive"><span class="lbl">💵 Готівка продажі <span class="cnt">'+pCashN+' зам.</span></span><span class="val">'+fmt(pCash)+' ↗</span></a>'
      +' <a class="row card'+((noCheckN||draftN)?' warn':'')+'" href="'+ordUrl(CARD_ID,span.from,span.to)+'" target="_blank" title="Відкрити у SalesDrive"><span class="lbl">💳 Термінал <span class="cnt">'+pCardN+' зам.'
        +(draftN?' · <b class="nochk">📝 чернеток: '+draftN+'</b>':'')
        +(noCheckN?' · <b class="nochk">⚠️ без чека: '+noCheckN+'</b>':'')
      +'</span></span><span class="val">'+fmt(pCard)+' ↗</span></a>'
      +' <a class="row total" href="'+ordUrl2(span.from,span.to)+'" target="_blank" title="Готівка + Термінал разом за період"><span class="lbl">🧮 Готівка + Термінал <span class="cnt">'+(pCashN+pCardN)+' зам.</span></span><span class="val">'+fmt(pCash+pCard)+' ↗</span></a>'
      +(out.items.length?' <div class="row out"><span class="lbl">📤 Видатки <span class="cnt">'+out.items.length+' шт.</span></span><span class="val">−'+fmt(out.sum)+'</span></div>':'')
      +'</div>'
      +outHtml
      +'<div id="lk-cash-list"><div class="ttl">Замовлення за період ('+(pCashN+pCardN)+')</div>'+(rows.join('')||'<div style="color:#999;padding:6px 0">Немає</div>')+'</div>'
      +'<div id="lk-cash-adj">⚙️ Задати стартовий залишок каси (під PIN)</div>'
      +adjLogHtml();
    box.querySelector('#lk-cash-adj').onclick=adjust;
    adjLogSync(base); // коригування з іншого ПК → у журнал
    var lt=box.querySelector('#lk-cash-adjlog-t');
    if(lt) lt.onclick=function(){
      var l=box.querySelector('#lk-cash-adjlog'); if(!l) return;
      var open=l.style.display!=='none';
      l.style.display=open?'none':'block';
      lt.textContent=lt.textContent.replace(open?'▴':'▾', open?'▾':'▴');
    };
  }

  async function adjust(){
    var v=prompt('Скільки готівки ЗАРАЗ фізично в касі (₴)?\nЦе стане новою стартовою точкою на сьогодні.');
    if(v==null) return;
    var n=parseFloat(String(v).replace(',','.').replace(/\s/g,''));
    if(isNaN(n)){ alert('Введіть число.'); return; }
    var pin=prompt('Введіть PIN для коригування каси:');
    if(pin==null) return;
    var box=document.getElementById('lk-cash-box');
    if(box) box.querySelector('#lk-cash-body').innerHTML='<div id="lk-cash-load">Зберігаю…</div>';
    try{
      // у момент перерахунку рахуємо сьогоднішні готівкові продажі та видатки,
      // щоб зберегти ОПОРНИЙ залишок на початок дня (факт − продажі + видатки).
      // Тоді формула «залишок = опорний + продажі − видатки» одразу дає введену
      // суму і коректно росте з кожним новим продажем (без залежності від часу).
      var today=ymd(new Date());
      var wm=await Promise.all([fetchOrders(today,today), fetchOutcoming(today,today)]);
      var sCash=0; wm[0].forEach(function(o){ if(payId(o)===CASH_ID) sCash+=amount(o); });
      var sOut=0;  wm[1].items.forEach(function(x){ sOut+=x.amount; });
      var openFloat=Math.round((n - sCash + sOut)*100)/100;
      var nb=await setBaseline(openFloat,pin);
      // журнал: локальний запис (введена сума + опорний залишок + момент)
      adjLogAdd({ ts: dtnorm((nb&&(nb.ts||nb.date))||ymdhms(new Date())), entered:n, open:openFloat, src:'local' });
      _rangeCache=null; mode='day'; anchor=new Date(); await render();
    }
    catch(e){
      if(/HTTP 403|bad pin/.test(e.message)) alert('Невірний PIN — залишок не змінено.');
      else if(e && e.limit) alert('⏳ '+apiNote()+'\n\nЗалишок НЕ змінено — спробуйте пізніше.');
      else alert('Не вдалося зберегти: '+e.message);
      render();
    }
  }

  function setMode(m){
    mode=m;
    if(m!=='range'){ anchor=new Date(); }
    render();
  }

  function open(){
    ensureStyles();
    if(document.getElementById('lk-cash-ov')) return;
    var today=ymd(new Date());
    var ov=document.createElement('div'); ov.id='lk-cash-ov';
    ov.innerHTML=''
     +'<div id="lk-cash-box">'
     +' <div class="h"><b>💰 Каса самовивозу</b><div><button class="rf" title="Оновити" style="border:none;background:none;font-size:18px;cursor:pointer;color:#888;margin-right:6px">🔄</button><button class="x">&times;</button></div></div>'
     +' <div id="lk-cash-modes">'
     +'   <button data-m="day">День</button><button data-m="week">Тиждень</button>'
     +'   <button data-m="month">Місяць</button><button data-m="range">Період</button>'
     +' </div>'
     +' <div id="lk-cash-range"><label>від <input type="date" id="lk-rf" value="'+today+'"></label><label>до <input type="date" id="lk-rt" value="'+today+'"></label><button class="go">Показати</button></div>'
     +' <div id="lk-cash-nav"><button class="prev">‹</button><span id="lk-cash-span"></span><button class="next">›</button><button class="today">зараз</button></div>'
     +' <div id="lk-cash-unpaid" style="display:none"></div>'
     +' <div id="lk-cash-body"></div>'
     +'</div>';
    document.body.appendChild(ov);
    ov.addEventListener('click',function(e){ if(e.target===ov) ov.remove(); });
    ov.querySelector('.x').onclick=function(){ ov.remove(); };
    ov.querySelector('.rf').onclick=function(){ _rangeCache=null; _checksCache=null; render(); loadUnpaid(true); };
    ov.querySelectorAll('#lk-cash-modes button').forEach(function(b){
      b.onclick=function(){ setMode(b.getAttribute('data-m')); };
    });
    ov.querySelector('.go').onclick=function(){
      rangeFrom=ov.querySelector('#lk-rf').value; rangeTo=ov.querySelector('#lk-rt').value;
      if(!rangeFrom||!rangeTo){ alert('Оберіть обидві дати.'); return; }
      render();
    };
    ov.querySelector('.prev').onclick=function(){ shift(-1); render(); };
    ov.querySelector('.next').onclick=function(){ shift(1); render(); };
    ov.querySelector('.today').onclick=function(){ anchor=new Date(); render(); };
    render();
    loadUnpaid();
  }

  function addBtn(){
    if(document.getElementById('lk-cash-btn')) return;
    ensureStyles();
    var b=document.createElement('button'); b.id='lk-cash-btn'; b.textContent='💰'; b.title='Каса самовивозу';
    b.onclick=function(){ mode='day'; anchor=new Date(); open(); };
    document.body.appendChild(b);
  }
  window.addEventListener('lkdom', addBtn); addBtn();
})();
}catch(e){ try{ console.warn("[SD] модуль «lkCashRegister» не запустився:", e); }catch(_){} }
/* ▲▲▲ МОДУЛЬ-END • lkCashRegister ▲▲▲ */


/* ▼▼▼ МОДУЛЬ-START • lkPickList — 📋 Зведений лист комплектації (склад) ▼▼▼ */
/* ===== По заявках у вибраних статусах (пакувальник фільтрує список за статусом,
   напр. «на відправку» + «сплачено в інтернеті») збирає СУМАРНУ кількість кожного
   товару. Набори розкладаються на складники через карту комплектів (спільний кеш
   lknb_cache2). Плаваюча кнопка 📋 на сторінці списку заявок → панель + друк. ===== */
try{ // SD-ізоляція: помилка цього модуля не зупинить решту
(function lkPickList(){
  'use strict';
  // публічний API — єдине джерело, де в товарах заявки є sku (внутрішній список
  // віддає лише productId, а лист комплектації агрегує саме за кодами)
  var API_KEY  = '9yC3JYj4MlYitQ8J3KUf-uy_qPDYkFzwoITQSUeiWEDMZntbQ4uj0NxNcHrqAg8VAB6wDmkdXJZ1LMFgnQbuivTSrzutQbVB66wN';
  var ORDERS   = '/api/order/list/';
  var APP_URL  = 'https://barcode-printer-production-2b32.up.railway.app';
  var TOKEN    = 'nab_8Kx2pQ7mLr4tW9vZ';
  var KIT_CACHE='lknb_cache2', KIT_TTL=6*60*60*1000; // спільний із lkNaboryInline
  var NAME_KEY ='lkpick_names_v1';
  var CACHE_MS =150000; // результат кешуємо 2.5 хв

  function onListPage(){ return /#\/order\/index/.test(location.hash||''); }
  function sleep(ms){ return new Promise(function(r){ setTimeout(r,ms); }); }
  // спільний шлюз ліміту API (модуль lkApiBudget)
  function sdApiFetch(u,o){ return (window.sdApi? window.sdApi.fetch(u,o) : fetch(u,o)); }
  function apiNote(){ return window.sdApi? window.sdApi.note() : 'Ліміт API SalesDrive вичерпано.'; }
  function esc(s){ return String(s==null?'':s).replace(/[&<>"]/g,function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); }
  function gGet(k){ try{ var s=GM_getValue(k,null); return s?((typeof s==='string')?JSON.parse(s):s):null; }catch(e){ return null; } }
  function gSet(k,v){ try{ GM_setValue(k, JSON.stringify(v)); }catch(e){} }

  // статуси — з URL-фільтра списку (filter[statusId][]=NN)
  function selectedStatuses(){
    var out=[], dec=decodeURIComponent(location.hash||''), re=/filter\[statusId\]\[\]=([^&]+)/g, m;
    while((m=re.exec(dec))){ if(/^\d+$/.test(m[1])) out.push(m[1]); }
    return out;
  }

  // карта комплектів (kitSku -> {name,id,comps:[{sku,qty}]})
  var kits=null;
  function fetchKits(){
    var url=APP_URL.replace(/\/+$/,'')+'/api/kits?token='+encodeURIComponent(TOKEN);
    return new Promise(function(res,rej){
      var done=function(t){ try{ var d=JSON.parse(t); d.ok?res(d.kits||{}):rej(new Error('no')); }catch(e){ rej(e); } };
      if(typeof GM_xmlhttpRequest!=='undefined'){ GM_xmlhttpRequest({method:'GET',url:url,
        onload:function(r){ (r.status>=200&&r.status<300)?done(r.responseText):rej(new Error('HTTP '+r.status)); },
        onerror:function(){ rej(new Error('net')); }}); }
      else { fetch(url).then(function(r){return r.text();}).then(done).catch(rej); }
    });
  }
  function loadKits(){
    if(kits) return Promise.resolve(kits);
    var c=gGet(KIT_CACHE);
    if(c && c.kits && (Date.now()-(c.ts||0)<KIT_TTL)){ kits=c.kits; return Promise.resolve(kits); }
    return fetchKits().then(function(k){ kits=k||{}; gSet(KIT_CACHE,{ts:Date.now(),kits:kits}); return kits; })
      .catch(function(){ kits=(c&&c.kits)||{}; return kits; });
  }

  // назви SKU: харвест із рядків заявок + резолв відсутніх через products API (кеш)
  var nameMap=gGet(NAME_KEY)||{};
  function remember(sku,name){ if(sku && name && !nameMap[sku]) nameMap[sku]=name; }
  var resolving={};
  function resolveName(sku, cb){
    if(nameMap[sku]){ return; }
    if(resolving[sku]) return; resolving[sku]=1;
    fetch('/products/data/?active=1&filter[sku]='+encodeURIComponent(sku)+'&formId=1',
      {credentials:'include',headers:{'accept':'application/json, text/plain, */*','when':'product/index'}})
      .then(function(r){ return r.ok?r.json():null; })
      .then(function(j){ var rows=j&&j.response&&j.response.meta&&j.response.meta.option&&j.response.meta.option.option;
        var row=null,c=String(sku).trim();
        if(rows) for(var i=0;i<rows.length;i++){ if(String(rows[i].sku).trim()===c){ row=rows[i]; break; } }
        if(!row && rows && rows.length) row=rows[0];
        if(row){ nameMap[sku]=row.documentName||row.name||sku; gSet(NAME_KEY,nameMap); if(cb) cb(); }
      }).catch(function(){});
  }

  // фетч заявок за статусами (пагінація; ліміт API — через спільний шлюз)
  function fetchOrders(statusIds){
    var qs=statusIds.map(function(s){ return 'filter%5BstatusId%5D%5B%5D='+s; }).join('&');
    var page=1, all=[], guard=0;
    function next(){
      if(guard++>=40) return Promise.resolve(all);
      var url=ORDERS+'?page='+page+'&limit=100'+(qs?'&'+qs:'');
      return sdApiFetch(url,{headers:{'Form-Api-Key':API_KEY,'Accept':'application/json'}})
        .then(function(r){
          return r.json().catch(function(){return {};}).then(function(j){
            var arr=j.data||[]; all=all.concat(arr);
            if(arr.length<100) return all;
            page++; return sleep(400).then(next);
          });
        }).catch(function(e){
          // ліміт API — краще чесно сказати, ніж віддати НЕПОВНИЙ лист комплектації
          if(e && e.limit) throw e;
          return all;
        });
    }
    return next();
  }

  // агрегація: розклад наборів + сума кількостей за SKU
  function aggregate(orders){
    var agg={};
    function add(sku,name,qty,oid){
      sku=String(sku==null?'':sku).trim(); if(!sku||!(qty>0)) return;
      remember(sku,name);
      var e=agg[sku]||(agg[sku]={sku:sku,qty:0,ord:{}});
      e.qty+=qty; e.ord[oid]=1;
    }
    orders.forEach(function(o){
      (o.products||[]).forEach(function(p){
        var sku=String(p.sku==null?'':p.sku).trim(); var amt=Number(p.amount)||0;
        if(!sku||amt<=0) return;
        var nm=p.documentName||p.text||''; remember(sku,nm);
        var kit=kits && kits[sku];
        if(kit && kit.comps && kit.comps.length){ kit.comps.forEach(function(c){ add(c.sku,'',amt*(Number(c.qty)||1),o.id); }); }
        else { add(sku,nm,amt,o.id); }
      });
    });
    gSet(NAME_KEY,nameMap);
    return Object.keys(agg).map(function(sku){ var e=agg[sku]; var ids=Object.keys(e.ord).sort(function(a,b){ return a-b; }); return {sku:sku,name:nameMap[sku]||'',qty:e.qty,orders:ids.length,orderIds:ids}; });
  }

  /* ---------- UI ---------- */
  function ensureStyles(){
    if(document.getElementById('lk-pick-css')) return;
    var s=document.createElement('style'); s.id='lk-pick-css';
    s.textContent=''
    +'#lk-pick-btn{position:fixed;left:18px;bottom:80px;z-index:99998;width:52px;height:52px;border-radius:50%;background:#00695c;color:#fff;border:none;font-size:23px;cursor:pointer;box-shadow:0 3px 10px rgba(0,0,0,.3)}'
    +'#lk-pick-ov{position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.4);display:flex;align-items:flex-start;justify-content:center}'
    +'#lk-pick-box{background:#fff;width:640px;max-width:96vw;max-height:92vh;margin-top:3vh;overflow:auto;border-radius:12px;box-shadow:0 12px 40px rgba(0,0,0,.35);font:13px/1.5 Arial,sans-serif;color:#222}'
    +'#lk-pick-box .hd{position:sticky;top:0;background:#00695c;color:#fff;padding:12px 16px;display:flex;align-items:center;justify-content:space-between}'
    +'#lk-pick-box .hd b{font-size:16px}'
    +'#lk-pick-box .hd button{background:rgba(255,255,255,.2);border:none;color:#fff;border-radius:6px;cursor:pointer;font-size:14px;padding:4px 8px;margin-left:6px}'
    +'#lk-pick-box .sub{padding:8px 16px;color:#555;background:#f4faf9;border-bottom:1px solid #d6ece8}'
    +'#lk-pick-box .tools{padding:8px 16px;display:flex;gap:8px;flex-wrap:wrap;align-items:center}'
    +'#lk-pick-box .tools button{border:1px solid #00695c;background:#fff;color:#00695c;border-radius:7px;padding:6px 12px;cursor:pointer;font-weight:700}'
    +'#lk-pick-box .tools button:hover{background:#e6f4f1}'
    +'#lk-pick-tbl{width:100%;border-collapse:collapse}'
    +'#lk-pick-tbl th,#lk-pick-tbl td{border-bottom:1px solid #eee;padding:7px 16px;text-align:left;vertical-align:top}'
    +'#lk-pick-tbl th{background:#f7f7f7;position:sticky;top:0;cursor:pointer;font-size:12px;color:#555}'
    +'#lk-pick-tbl td.q{text-align:center;font-weight:800;font-size:15px;color:#00695c;white-space:nowrap}'
    +'#lk-pick-tbl td.sku{font-family:ui-monospace,Menlo,Consolas,monospace;color:#333;white-space:nowrap}'
    +'#lk-pick-tbl td.cnt{text-align:center;color:#999;font-size:12px}'
    +'#lk-pick-tbl td.ord{font-size:12px;line-height:1.9}'
    +'#lk-pick-tbl td.ord a{color:#0a58ca;text-decoration:none;margin-right:8px;white-space:nowrap}'
    +'#lk-pick-tbl td.ord a:hover{text-decoration:underline}'
    +'#lk-pick-msg{padding:20px 16px;color:#777;font-size:14px;line-height:1.6}'
    +'#lk-pick-print{display:none}'
    +'@media print{ body>*{display:none !important} #lk-pick-print{display:block !important;font:12px Arial} #lk-pick-print h2{font-size:16px} #lk-pick-print table{width:100%;border-collapse:collapse} #lk-pick-print th,#lk-pick-print td{border:1px solid #999;padding:4px 6px;text-align:left} #lk-pick-print td.q{text-align:center;font-weight:bold} }';
    (document.head||document.documentElement).appendChild(s);
    if(!document.getElementById('lk-pick-print')){ var pr=document.createElement('div'); pr.id='lk-pick-print'; document.body.appendChild(pr); }
  }

  var cache=null, busy=false, sortBy='qty';

  function open(){
    ensureStyles();
    if(document.getElementById('lk-pick-ov')) return;
    var ov=document.createElement('div'); ov.id='lk-pick-ov';
    ov.innerHTML='<div id="lk-pick-box">'
      +'<div class="hd"><b>📋 Лист комплектації</b><span><button class="rf" title="Оновити">🔄</button><button class="x" title="Закрити">✕</button></span></div>'
      +'<div class="sub" id="lk-pick-sub">…</div>'
      +'<div class="tools"><button class="pr">🖨 Друк</button><button class="cp">Копіювати</button><button class="so">Сортувати: к-сть</button></div>'
      +'<div id="lk-pick-content"><div id="lk-pick-msg">Рахую…</div></div></div>';
    document.body.appendChild(ov);
    ov.addEventListener('click', function(e){ if(e.target===ov) ov.remove(); });
    ov.querySelector('.x').onclick=function(){ ov.remove(); };
    ov.querySelector('.rf').onclick=function(){ cache=null; run(true); };
    ov.querySelector('.pr').onclick=doPrint;
    ov.querySelector('.cp').onclick=doCopy;
    ov.querySelector('.so').onclick=function(){ sortBy=(sortBy==='qty')?'name':'qty'; this.textContent='Сортувати: '+(sortBy==='qty'?'к-сть':'назва'); render(); };
    run(false);
  }

  // «не роздруковано» = ТТН ще не роздрукована (isPrinted!=1); заявки без ТТН теж рахуємо
  function notPrinted(o){ var d=(o.ord_delivery_data||[])[0]||{}; return Number(d.isPrinted)!==1; }

  function run(force){
    var box=document.getElementById('lk-pick-box'); if(!box) return;
    var st=selectedStatuses();
    var sub=document.getElementById('lk-pick-sub');
    if(!st.length){ document.getElementById('lk-pick-content').innerHTML='<div id="lk-pick-msg">Спочатку відфільтруй список заявок за потрібним статусом (напр. «на відправку», «сплачено в інтернеті») — і знову відкрий лист. Тоді покажу сумарну кількість товарів для комплектації.</div>'; if(sub) sub.textContent='Статуси не вибрано'; return; }
    var key=st.slice().sort().join(',');
    if(cache && !force && cache.key===key && (Date.now()-cache.t)<CACHE_MS){ render(); return; }
    if(busy) return; busy=true;
    if(sub) sub.textContent='Статуси: '+st.join(', ')+' · рахую…';
    document.getElementById('lk-pick-content').innerHTML='<div id="lk-pick-msg">Рахую… (тягну заявки й розкладаю набори)</div>';
    loadKits().then(function(){ return fetchOrders(st); }).then(function(orders){
      var pending=orders.filter(notPrinted);   // лише заявки, де ТТН ще НЕ роздруковано (ще треба зібрати)
      var rows=aggregate(pending);
      cache={key:key, t:Date.now(), rows:rows, ordersCount:pending.length, statuses:st};
      busy=false; render();
    }).catch(function(e){
      busy=false;
      document.getElementById('lk-pick-content').innerHTML='<div id="lk-pick-msg">'
        + (e&&e.limit ? '⏳ '+apiNote()+'<br>Ліміт спільний на весь акаунт (усі менеджери разом).'
                      : 'Не вдалося порахувати. Натисни 🔄.')
        + '</div>';
    });
  }

  function sortedRows(){
    var rows=(cache&&cache.rows)||[];
    return rows.slice().sort(function(a,b){
      if(sortBy==='name'){ return (a.name||a.sku).localeCompare(b.name||b.sku,'uk'); }
      return b.qty-a.qty || (a.name||a.sku).localeCompare(b.name||b.sku,'uk');
    });
  }
  function render(){
    if(!document.getElementById('lk-pick-box')) return;
    var sub=document.getElementById('lk-pick-sub');
    if(sub && cache) sub.textContent='Статуси: '+cache.statuses.join(', ')+' · заявок (не роздрук.): '+cache.ordersCount+' · позицій: '+cache.rows.length;
    var rows=sortedRows();
    if(!rows.length){ document.getElementById('lk-pick-content').innerHTML='<div id="lk-pick-msg">Немає заявок до комплектації (усі в цих статусах уже роздруковані).</div>'; return; }
    var missing=[];
    var html='<table id="lk-pick-tbl"><thead><tr><th>Код</th><th>Назва</th><th style="text-align:center">Шт</th><th>Заявки</th></tr></thead><tbody>';
    rows.forEach(function(r){
      if(!r.name){ missing.push(r.sku); }
      var links=(r.orderIds||[]).map(function(id){ return '<a href="/ua/index.html?formId=1#/order/update/'+id+'" target="_blank" rel="noopener">№'+id+'</a>'; }).join(' ');
      html+='<tr><td class="sku">'+esc(r.sku)+'</td><td data-sku="'+esc(r.sku)+'">'+esc(r.name||'—')+'</td><td class="q">'+r.qty+'</td><td class="ord">'+links+'</td></tr>';
    });
    html+='</tbody></table>';
    document.getElementById('lk-pick-content').innerHTML=html;
    // дорезолвити відсутні назви (обмежено), потім оновити клітинки
    missing.slice(0,40).forEach(function(sku){ resolveName(sku, function(){
      var td=document.querySelector('#lk-pick-tbl td[data-sku="'+CSS.escape(sku)+'"]');
      if(td && nameMap[sku]){ td.textContent=nameMap[sku]; }
      var r=(cache.rows||[]).filter(function(x){return x.sku===sku;})[0]; if(r) r.name=nameMap[sku]||'';
    }); });
  }

  function textDump(){
    var rows=sortedRows();
    var lines=['Код\tНазва\tШт\tЗаявки'];
    rows.forEach(function(r){ lines.push(r.sku+'\t'+(r.name||'')+'\t'+r.qty+'\t'+(r.orderIds||[]).map(function(id){ return '№'+id; }).join(' ')); });
    return lines.join('\n');
  }
  function doCopy(){
    var t=textDump();
    try{ if(typeof GM_setClipboard==='function'){ GM_setClipboard(t); } else { navigator.clipboard.writeText(t); } }catch(e){ try{ navigator.clipboard.writeText(t); }catch(e2){} }
    var b=document.querySelector('#lk-pick-box .cp'); if(b){ var o=b.textContent; b.textContent='✓ Скопійовано'; setTimeout(function(){ b.textContent=o; },1200); }
  }
  function doPrint(){
    var pr=document.getElementById('lk-pick-print'); if(!pr||!cache) return;
    var rows=sortedRows();
    var html='<h2>📋 Лист комплектації — статуси '+esc(cache.statuses.join(', '))+' (заявок: '+cache.ordersCount+')</h2>'
      +'<table><thead><tr><th>Код</th><th>Назва</th><th>Шт</th><th>Заявки</th></tr></thead><tbody>';
    rows.forEach(function(r){ html+='<tr><td>'+esc(r.sku)+'</td><td>'+esc(r.name||'')+'</td><td class="q">'+r.qty+'</td><td>'+(r.orderIds||[]).map(function(id){ return '№'+id; }).join(', ')+'</td></tr>'; });
    html+='</tbody></table>';
    pr.innerHTML=html;
    window.print();
  }

  function addBtn(){
    if(!onListPage()){ var b0=document.getElementById('lk-pick-btn'); if(b0) b0.remove(); var ov=document.getElementById('lk-pick-ov'); if(ov) ov.remove(); return; }
    if(document.getElementById('lk-pick-btn')) return;
    ensureStyles();
    var b=document.createElement('button'); b.id='lk-pick-btn'; b.textContent='📋'; b.title='Зведений лист комплектації';
    b.onclick=open;
    document.body.appendChild(b);
  }
  window.addEventListener('lkdom', addBtn);
  window.addEventListener('hashchange', function(){ setTimeout(addBtn,150); });
  addBtn();
})();
}catch(e){ try{ console.warn("[SD] модуль «lkPickList» не запустився:", e); }catch(_){} }
/* ▲▲▲ МОДУЛЬ-END • lkPickList ▲▲▲ */


/* ▼▼▼ МОДУЛЬ-START • lkUkrPromList — 📮 Лист «Пром-оплата + Укрпошта» ▼▼▼ */
/* ===== У статусі «Спаковано» (statusId=15 — ті, що віддаються курʼєру) показує
   заявки з Пром-оплатою (payment_method=20) і доставкою Укрпошта (shipping_method=30):
   відправник-ФОП, отримувач (ПІБ+тел), індекс+адреса, ТТН. Щоб пакувальник не
   переписував їх вручну. Кнопка 📮 на списку заявок → вікно + друк + копія. ===== */
try{ // SD-ізоляція: помилка цього модуля не зупинить решту
(function lkUkrPromList(){
  'use strict';
  var PROM_PM  = 20;   // спосіб оплати «Пром-оплата» (підтверджено на #305175)
  var UKR_SM   = 30;   // доставка Укрпошта
  var PACKED_STATUS = 15; // статус «Спаковано» (ті, що віддаються курʼєру) — підтверджено на #305175
  var CACHE_MS = 150000;
  // organizationId → назва ФОП (фолбек «ФОП #id»). org 1 = відправник пром+укрпошти.
  var ORG_NAMES = { 1:'ФОП Кучер Василь Богданович' };

  function onListPage(){ return /#\/order\/index/.test(location.hash||''); }
  function sleep(ms){ return new Promise(function(r){ setTimeout(r,ms); }); }
  // спільний шлюз ліміту API + внутрішній список заявок (модуль lkApiBudget)
  function sdApiFetch(u,o){ return (window.sdApi? window.sdApi.fetch(u,o) : fetch(u,o)); }
  function sdOrders(qs,page){ return window.sdApi.orders(qs,page); }
  function apiNote(){ return window.sdApi? window.sdApi.note() : 'Ліміт API SalesDrive вичерпано.'; }
  function esc(s){ return String(s==null?'':s).replace(/[&<>"]/g,function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); }

  // Заявки у статусі «Спаковано» — ВНУТРІШНІМ запитом СРМ (без API-ключа
  // й без годинного ліміту); далі клієнтом лишаємо пром+укрпошта.
  function fetchOrders(){
    var page=1, pages=1, all=[], guard=0;
    function next(){
      if(guard++>=40 || page>pages) return Promise.resolve({orders:all, limited:false});
      return sdOrders('filter[statusId][]='+PACKED_STATUS, page)
        .then(function(res){
          all=all.concat(res.rows||[]); pages=res.pageCount||1; page++;
          if(page>pages) return {orders:all, limited:false};
          return sleep(200).then(next);
        })
        .catch(function(){ return {orders:all, limited:false}; });
    }
    return next();
  }

  function orgName(id){ return ORG_NAMES[id] || ('ФОП #'+(id==null?'?':id)); }
  function phoneOf(c){ var p=c&&c.phone; if(Array.isArray(p)) return p[0]||''; return p||''; }
  function fullName(c){ if(!c) return ''; return [c.lName,c.fName,c.mName].filter(Boolean).join(' ').trim(); }
  function addrOf(d){
    if(!d) return '';
    if(d.address) return d.address; // відділення, напр. «відділення № 64660»
    return [d.streetName, d.house?('буд.'+d.house):'', d.flat?('кв.'+d.flat):''].filter(Boolean).join(' ');
  }
  function isTarget(o){
    if(Number(o.payment_method)!==PROM_PM) return false;
    var d=(o.ord_delivery_data||[])[0]||{};
    return Number(o.shipping_method)===UKR_SM || d.provider==='ukrposhta';
  }
  function mapRow(o){
    var d=(o.ord_delivery_data||[])[0]||{}, c=(o.contacts||[])[0]||{};
    return { id:o.id, org:orgName(o.organizationId), name:fullName(c), phone:phoneOf(c),
      index:d.branchNumber||'', city:[d.cityName,d.areaName].filter(Boolean).join(', '),
      addr:addrOf(d), ttn:d.trackingNumber||'' };
  }

  // постійний кеш (SWR): миттєве відкриття + фонове оновлення, менше запитів до API
  var PKEY='lkukp_cache_v1', TTL=5*60*1000;
  function gGet(k){ try{ var s=GM_getValue(k,null); return s?((typeof s==='string')?JSON.parse(s):s):null; }catch(e){ return null; } }
  function gSet(k,v){ try{ GM_setValue(k, JSON.stringify(v)); }catch(e){} }
  var cache=gGet(PKEY)||null, busy=false;

  function ensureStyles(){
    if(document.getElementById('lk-ukp-css')) return;
    var s=document.createElement('style'); s.id='lk-ukp-css';
    s.textContent=''
    +'#lk-ukp-btn{position:fixed;left:18px;bottom:142px;z-index:99998;width:52px;height:52px;border-radius:50%;background:#c0392b;color:#fff;border:none;font-size:22px;cursor:pointer;box-shadow:0 3px 10px rgba(0,0,0,.3)}'
    +'#lk-ukp-ov{position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.4);display:flex;align-items:flex-start;justify-content:center}'
    +'#lk-ukp-box{background:#fff;width:920px;max-width:97vw;max-height:92vh;margin-top:3vh;overflow:auto;border-radius:12px;box-shadow:0 12px 40px rgba(0,0,0,.35);font:13px/1.5 Arial,sans-serif;color:#222}'
    +'#lk-ukp-box .hd{position:sticky;top:0;background:#c0392b;color:#fff;padding:12px 16px;display:flex;align-items:center;justify-content:space-between}'
    +'#lk-ukp-box .hd b{font-size:16px}'
    +'#lk-ukp-box .hd button{background:rgba(255,255,255,.2);border:none;color:#fff;border-radius:6px;cursor:pointer;font-size:14px;padding:4px 8px;margin-left:6px}'
    +'#lk-ukp-box .sub{padding:8px 16px;color:#555;background:#fdf0ee;border-bottom:1px solid #f2cfc9}'
    +'#lk-ukp-box .tools{padding:8px 16px;display:flex;gap:8px;flex-wrap:wrap}'
    +'#lk-ukp-box .tools button{border:1px solid #c0392b;background:#fff;color:#c0392b;border-radius:7px;padding:6px 12px;cursor:pointer;font-weight:700}'
    +'#lk-ukp-box .tools button:hover{background:#fbeae7}'
    +'#lk-ukp-tbl{width:100%;border-collapse:collapse}'
    +'#lk-ukp-tbl th,#lk-ukp-tbl td{border-bottom:1px solid #eee;padding:7px 12px;text-align:left;vertical-align:top;font-size:12.5px}'
    +'#lk-ukp-tbl th{background:#f7f7f7;position:sticky;top:0;font-size:12px;color:#555}'
    +'#lk-ukp-tbl td.no a{color:#0a58ca;text-decoration:none;font-weight:700}'
    +'#lk-ukp-tbl td.idx{font-family:ui-monospace,Menlo,Consolas,monospace;font-weight:700;white-space:nowrap}'
    +'#lk-ukp-tbl td.ttn{font-family:ui-monospace,Menlo,Consolas,monospace;white-space:nowrap}'
    +'#lk-ukp-tbl td.ttn.no-ttn{color:#c0392b;font-weight:700}'
    +'#lk-ukp-msg{padding:20px 16px;color:#777;font-size:14px;line-height:1.6}'
    +'#lk-ukp-print{display:none}'
    +'@media print{ body>*{display:none !important} #lk-ukp-print{display:block !important;font:12px Arial} #lk-ukp-print h2{font-size:15px} #lk-ukp-print table{width:100%;border-collapse:collapse} #lk-ukp-print th,#lk-ukp-print td{border:1px solid #999;padding:4px 6px;text-align:left;font-size:11px} }';
    (document.head||document.documentElement).appendChild(s);
    if(!document.getElementById('lk-ukp-print')){ var pr=document.createElement('div'); pr.id='lk-ukp-print'; document.body.appendChild(pr); }
  }

  function open(){
    ensureStyles();
    if(document.getElementById('lk-ukp-ov')) return;
    var ov=document.createElement('div'); ov.id='lk-ukp-ov';
    ov.innerHTML='<div id="lk-ukp-box">'
      +'<div class="hd"><b>📮 Пром-оплата + Укрпошта</b><span><button class="rf" title="Оновити">🔄</button><button class="x" title="Закрити">✕</button></span></div>'
      +'<div class="sub" id="lk-ukp-sub">…</div>'
      +'<div class="tools"><button class="pr">🖨 Друк</button><button class="cp">Копіювати</button></div>'
      +'<div id="lk-ukp-content"><div id="lk-ukp-msg">Шукаю…</div></div></div>';
    document.body.appendChild(ov);
    ov.addEventListener('click', function(e){ if(e.target===ov) ov.remove(); });
    ov.querySelector('.x').onclick=function(){ ov.remove(); };
    ov.querySelector('.rf').onclick=function(){ cache=null; run(true); };
    ov.querySelector('.pr').onclick=doPrint;
    ov.querySelector('.cp').onclick=doCopy;
    run(false);
  }

  function run(force){
    var box=document.getElementById('lk-ukp-box'); if(!box) return;
    var sub=document.getElementById('lk-ukp-sub');
    var have=cache && cache.rows;
    if(have) render();                                  // збережене — миттєво
    if(have && !force && (Date.now()-cache.t)<TTL){ return; } // свіже (<5хв) — API не смикаємо
    if(busy) return; busy=true;
    if(sub) sub.textContent = have ? 'Оновлюю…' : 'Шукаю у статусі «Спаковано»…';
    if(!have) document.getElementById('lk-ukp-content').innerHTML='<div id="lk-ukp-msg">Тягну заявки…</div>';
    fetchOrders().then(function(res){
      busy=false;
      if(res.limited){                                  // ліміт API — не оновлюємо частковим, лишаємо кеш
        if(sub) sub.textContent='⏳ '+apiNote()+(have?' Показано збережене.':'');
        if(!have) document.getElementById('lk-ukp-content').innerHTML='<div id="lk-ukp-msg">⏳ '+apiNote()
          +'<br>Ліміт спільний на весь акаунт (усі менеджери разом) — оновиться протягом години.</div>';
        return;
      }
      var rows=(res.orders||[]).filter(isTarget).map(mapRow).sort(function(a,b){ return b.id-a.id; });
      cache={t:Date.now(), rows:rows, scanned:(res.orders||[]).length}; gSet(PKEY,cache);
      render();
    }).catch(function(){ busy=false; if(!have) document.getElementById('lk-ukp-content').innerHTML='<div id="lk-ukp-msg">Не вдалося. Натисни 🔄.</div>'; });
  }

  function render(){
    if(!document.getElementById('lk-ukp-box')) return;
    var sub=document.getElementById('lk-ukp-sub');
    if(sub && cache) sub.textContent='Спаковано · Пром-оплата + Укрпошта: '+cache.rows.length+' заявок (у статусі: '+cache.scanned+')';
    var rows=(cache&&cache.rows)||[];
    if(!rows.length){ document.getElementById('lk-ukp-content').innerHTML='<div id="lk-ukp-msg">У статусі «Спаковано» немає заявок «Пром-оплата + Укрпошта».</div>'; return; }
    var html='<table id="lk-ukp-tbl"><thead><tr><th>№</th><th>Відправник</th><th>Отримувач</th><th>Телефон</th><th>Індекс</th><th>Місто / Адреса</th><th>ТТН</th></tr></thead><tbody>';
    rows.forEach(function(r){
      html+='<tr>'
        +'<td class="no"><a href="/ua/index.html?formId=1#/order/update/'+r.id+'" target="_blank" rel="noopener">№'+r.id+'</a></td>'
        +'<td>'+esc(r.org)+'</td>'
        +'<td>'+esc(r.name||'—')+'</td>'
        +'<td>'+esc(r.phone||'—')+'</td>'
        +'<td class="idx">'+esc(r.index||'—')+'</td>'
        +'<td>'+esc([r.city, r.addr].filter(Boolean).join(' · ')||'—')+'</td>'
        +'<td class="ttn'+(r.ttn?'':' no-ttn')+'">'+esc(r.ttn||'нема ТТН')+'</td>'
      +'</tr>';
    });
    html+='</tbody></table>';
    document.getElementById('lk-ukp-content').innerHTML=html;
  }

  function textDump(){
    var rows=(cache&&cache.rows)||[];
    var lines=['№\tВідправник\tОтримувач\tТелефон\tІндекс\tМісто/Адреса\tТТН'];
    rows.forEach(function(r){ lines.push('№'+r.id+'\t'+r.org+'\t'+(r.name||'')+'\t'+(r.phone||'')+'\t'+(r.index||'')+'\t'+[r.city,r.addr].filter(Boolean).join(' ')+'\t'+(r.ttn||'')); });
    return lines.join('\n');
  }
  function doCopy(){
    var t=textDump();
    try{ if(typeof GM_setClipboard==='function'){ GM_setClipboard(t); } else { navigator.clipboard.writeText(t); } }catch(e){ try{ navigator.clipboard.writeText(t); }catch(e2){} }
    var b=document.querySelector('#lk-ukp-box .cp'); if(b){ var o=b.textContent; b.textContent='✓ Скопійовано'; setTimeout(function(){ b.textContent=o; },1200); }
  }
  function doPrint(){
    var pr=document.getElementById('lk-ukp-print'); if(!pr||!cache) return;
    var rows=cache.rows||[];
    var html='<h2>📮 Пром-оплата + Укрпошта (заявок: '+rows.length+')</h2>'
      +'<table><thead><tr><th>№</th><th>Відправник</th><th>Отримувач</th><th>Телефон</th><th>Індекс</th><th>Місто / Адреса</th><th>ТТН</th></tr></thead><tbody>';
    rows.forEach(function(r){ html+='<tr><td>№'+r.id+'</td><td>'+esc(r.org)+'</td><td>'+esc(r.name||'')+'</td><td>'+esc(r.phone||'')+'</td><td>'+esc(r.index||'')+'</td><td>'+esc([r.city,r.addr].filter(Boolean).join(' '))+'</td><td>'+esc(r.ttn||'')+'</td></tr>'; });
    html+='</tbody></table>';
    pr.innerHTML=html;
    window.print();
  }

  function addBtn(){
    if(!onListPage()){ var b0=document.getElementById('lk-ukp-btn'); if(b0) b0.remove(); var ov=document.getElementById('lk-ukp-ov'); if(ov) ov.remove(); return; }
    if(document.getElementById('lk-ukp-btn')) return;
    ensureStyles();
    var b=document.createElement('button'); b.id='lk-ukp-btn'; b.textContent='📮'; b.title='Пром-оплата + Укрпошта (лист відправлень)';
    b.onclick=open;
    document.body.appendChild(b);
  }
  window.addEventListener('lkdom', addBtn);
  window.addEventListener('hashchange', function(){ setTimeout(addBtn,150); });
  addBtn();
})();
}catch(e){ try{ console.warn("[SD] модуль «lkUkrPromList» не запустився:", e); }catch(_){} }
/* ▲▲▲ МОДУЛЬ-END • lkUkrPromList ▲▲▲ */

/* ▼▼▼ МОДУЛЬ-START • lkSideMenu — кнопки скрипта (Каса/Склад/Укрпошта) у лівому штатному меню ▼▼▼ */
/* ===== Пункти скрипта в лівому меню СРМ (під «Установки») замість плаваючих кружечків ===== */
try{ // SD-ізоляція: помилка цього модуля не зупинить решту
(function lkSideMenu(){
  'use strict';

  // наші пункти: клік просто «натискає» відповідну плаваючу кнопку її модуля.
  // Пункт видно лише коли кнопка існує (📋 і 📮 живуть тільки на сторінці списку заявок).
  var ITEMS = [
    { id:'lk-side-cash', btn:'lk-cash-btn', ico:'💰', lab:'Каса',                      title:'Каса самовивозу' },
    { id:'lk-side-pick', btn:'lk-pick-btn', ico:'📋', lab:'Лист комплектації',         title:'Зведений лист комплектації' },
    { id:'lk-side-ukp',  btn:'lk-ukp-btn',  ico:'📮', lab:'Друк пром-оплата + Укрпошта', title:'Друк: пром-оплата + Укрпошта (лист відправлень)' },
    { id:'lk-side-where',btn:'lk-where-btn',ico:'🔎', lab:'Де товар',                    title:'Де товар: у яких заявках висить код (з комплектами)' }
  ];

  var css = ''
    // метрики як у штатних пунктів меню (висота ~70px, іконка 22px, підпис 11px)
    +'.lk-side-item{display:flex;flex-direction:column;justify-content:center;align-items:center;'
    +'  min-height:70px;box-sizing:border-box;cursor:pointer;text-align:center;'
    +'  padding:10px 5px;user-select:none;list-style:none}'
    +'.lk-side-item:hover{background:rgba(255,255,255,.09)}'
    +'.lk-side-item .ico{display:block;font-size:22px;line-height:1.25}'
    +'.lk-side-item .lab{display:block;font-size:11px;line-height:1.3;color:#cfd8dc;margin-top:4px}'
    +'.lk-side-item:hover .lab{color:#fff}'
    // кружечки ховаємо: і поки шукаємо меню на старті (lk-side-boot), і коли вже вбудовано
    // (lk-side-on) — щоб на завантаженні вони не блимали перед перенесенням у меню
    +'html.lk-side-boot #lk-cash-btn,html.lk-side-boot #lk-pick-btn,html.lk-side-boot #lk-ukp-btn,'
    +'html.lk-side-boot #lk-where-btn,html.lk-side-on #lk-where-btn,'
    +'html.lk-side-on #lk-cash-btn,html.lk-side-on #lk-pick-btn,html.lk-side-on #lk-ukp-btn{display:none!important}';
  var st=document.createElement('style'); st.textContent=css;
  (document.head||document.documentElement).appendChild(st);

  // знайти контейнер лівого меню за штатним пунктом «Установки» (фолбек — «Звіти»):
  // беремо елемент з таким текстом, що реально стоїть біля лівого краю і вузький (це сайдбар,
  // а не слово в контенті сторінки), і повертаємо його пункт меню (li або батька).
  function findMenuEntry(){
    var labels=['Установки','Звіти'];
    for(var L=0; L<labels.length; L++){
      var r;
      try{
        r=document.evaluate('//*[normalize-space(text())="'+labels[L]+'"]',
          document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
      }catch(e){ return null; }
      for(var i=0;i<r.snapshotLength;i++){
        var el=r.snapshotItem(i);
        if(el.closest('.lk-side-item')) continue;
        var entry=el.closest('li')||el.parentElement;
        if(!entry||!entry.parentElement) continue;
        var b=entry.getBoundingClientRect();
        if(b.width>0 && b.width<170 && b.left<120) return entry;
      }
    }
    return null;
  }

  function makeItem(it, refTag){
    var el=document.createElement(refTag||'li');
    el.id=it.id; el.className='lk-side-item'; el.title=it.title;
    var i=document.createElement('span'); i.className='ico'; i.textContent=it.ico;
    var l=document.createElement('span'); l.className='lab'; l.textContent=it.lab;
    el.appendChild(i); el.appendChild(l);
    el.addEventListener('click', function(e){
      e.preventDefault(); e.stopPropagation();
      var b=document.getElementById(it.btn); if(b) b.click();
    });
    return el;
  }

  function sync(){
    // швидкий шлях: пункти вже в DOM — лише оновити видимість, без XPath-пошуку меню
    var first=document.getElementById(ITEMS[0].id);
    if(first && first.parentElement){
      ITEMS.forEach(function(it){
        var el=document.getElementById(it.id);
        if(el) el.style.display = document.getElementById(it.btn) ? '' : 'none';
      });
      document.documentElement.classList.add('lk-side-on');
      return;
    }
    var entry=findMenuEntry();
    if(!entry){ document.documentElement.classList.remove('lk-side-on'); return; }
    var box=entry.parentElement;
    ITEMS.forEach(function(it){
      var el=document.getElementById(it.id);
      if(!el){ el=makeItem(it, entry.tagName); box.appendChild(el); }
      else if(el.parentElement!==box) box.appendChild(el);   // меню перемалювалось — повертаємо
      el.style.display = document.getElementById(it.btn) ? '' : 'none';
    });
    document.documentElement.classList.add('lk-side-on');
  }

  var t=null;
  function syncSoon(){ clearTimeout(t); t=setTimeout(sync,300); }

  // старт: одразу ховаємо кружечки (lk-side-boot) і активно шукаємо меню до ~6с;
  // знайшли — sync() поставить lk-side-on; ні — знімаємо boot, кружечки повертаються
  document.documentElement.classList.add('lk-side-boot');
  var tries=0, boot=setInterval(function(){
    sync();
    tries++;
    var ok=document.documentElement.classList.contains('lk-side-on');
    if(ok || tries>=30){
      clearInterval(boot);
      document.documentElement.classList.remove('lk-side-boot');
    }
  },200);

  sync();
  window.addEventListener('lkdom', syncSoon);
})();
}catch(e){ try{ console.warn("[SD] модуль «lkSideMenu» не запустився:", e); }catch(_){} }
/* ▲▲▲ МОДУЛЬ-END • lkSideMenu ▲▲▲ */

/* ▼▼▼ МОДУЛЬ-START • lkQuickPickup — ➕ Швидка кнопка: нова заявка із самовивозом ▼▼▼ */
/* ===== ➕ Швидка кнопка: нова заявка із самовивозом ===== */
try{ // SD-ізоляція: помилка цього модуля не зупинить решту
(function lkQuickPickup(){
  'use strict';
  var SHIP_PICKUP = 43; // id способу доставки «Самовивіз»
  // нативний список УСІХ заявок самовивозу (будь-який спосіб оплати).
  // filter[statusId][]=__NOTDELETED__ — це пункт «[все]» у фільтрі статусів
  // (інакше список за замовчуванням показує лише статуси «у процесі»).
  var PICKUP_LIST_URL = '/ua/index.html?formId=1#/order/index?'
    + 'filter%5BstatusId%5D%5B%5D=__NOTDELETED__'
    + '&filter%5Bshipping_method%5D%5B%5D=' + SHIP_PICKUP;
  // нативний список УСІХ заявок (усі статуси, будь-яка доставка)
  var ALL_ORDERS_URL = '/ua/index.html?formId=1#/order/index?filter%5BstatusId%5D%5B%5D=__NOTDELETED__';
  // організація за замовчуванням для швидкого самовивозу: ФОП Кучер Василь Богданович

  function setShipping(sel, val){
    try{
      if(window.jQuery){ window.jQuery(sel).val(val).trigger('change'); }
      else { sel.value = val; sel.dispatchEvent(new Event('change', {bubbles:true})); }
    }catch(e){}
  }
  // справжній клік-емулятор (Angular ng-click та select2 реагують на ці події).
  // ВАЖЛИВО: без view:window — у пісочниці Tampermonkey window обгорнутий у Proxy
  // і MouseEvent його не приймає (помилка "Failed to convert value to 'Window'").
  var REALWIN = (typeof unsafeWindow!=='undefined' && unsafeWindow) ? unsafeWindow : window;
  function clickIt(el){
    ['mouseenter','mousedown','mouseup','click'].forEach(function(t){
      var ev;
      try{ ev=new MouseEvent(t, {bubbles:true, cancelable:true, view:REALWIN}); }
      catch(e){ ev=new MouseEvent(t, {bubbles:true, cancelable:true}); }
      el.dispatchEvent(ev);
    });
  }
  function waitFor(getter, maxTries, cb){
    var n=0;
    var iv=setInterval(function(){
      n++;
      var el=getter();
      if(el){ clearInterval(iv); cb(el); return; }
      if(n>=maxTries){ clearInterval(iv); cb(null); }
    }, 90);
  }
  // поле доставки (кастомний select2 div), напр. <div class="stylized-select" attr-field-name="shipping_method">
  function shipField(){
    return document.querySelector('[attr-field-name="shipping_method"]');
  }
  // пункт «Самовивіз» у відкритому select2-попапі (number:43 або текст)
  function pickupOption(){
    var lis=document.querySelectorAll('li.select2-results__option');
    for(var i=0;i<lis.length;i++){
      var id=lis[i].id||'';
      if(id.slice(-9)==='number:'+SHIP_PICKUP) return lis[i];
      if(/самови/i.test(lis[i].textContent||'')) return lis[i];
    }
    return null;
  }
  function optionsVisible(){
    return document.querySelectorAll('li.select2-results__option').length>0;
  }
  // поле вважаємо ГОТОВИМ, коли воно домальоване: текст короткий (обраний спосіб
  // або «---»), а не весь список варіантів злитий докупи (ознака сирої форми).
  function shipFieldReady(){
    var f=shipField();
    if(!f) return null;
    var t=(f.textContent||'').replace(/\s+/g,' ').trim();
    if(t.length>40) return null;          // ще будується — чекаємо
    return f;
  }
  // відкрити поле доставки → дочекатись попапа → клікнути «Самовивіз»
  function applyPickup(done){
    function fin(){ if(done){ var d=done; done=null; d(); } } // викликаємо далі (організація) лише раз
    console.log('[pickup] старт, чекаю готовності поля доставки');
    waitFor(shipFieldReady, 150, function(field){
      if(!field){ console.log('[pickup] ❌ поле так і не стало готовим'); fin(); return; }
      if(/самови/i.test(field.textContent||'')){ console.log('[pickup] вже самовивіз'); fin(); return; }
      // відкриваємо попап один раз; повторний клік — лише зрідка, щоб не миготіло
      var openTries=0;
      var ivOpen=setInterval(function(){
        openTries++;
        if(optionsVisible()){
          clearInterval(ivOpen);
          waitFor(pickupOption, 40, function(opt){
            if(!opt){ console.log('[pickup] ❌ пункт самовивозу не знайдено'); fin(); return; }
            setTimeout(function(){
              clickIt(opt.querySelector('span') || opt);
              console.log('[pickup] клікнув самовивіз');
              setTimeout(fin, 200); // одразу далі — організація
            }, 50);
          });
          return;
        }
        if(openTries===1 || openTries%5===0) clickIt(field); // відкрити (без зайвого миготіння)
        if(openTries>30){ clearInterval(ivOpen); console.log('[pickup] ❌ попап доставки не відкрився'); fin(); }
      }, 110);
    });
  }
  // виставити організацію за замовчуванням (ФОП Кучер Василь Богданович),
  // ПРИМІТКА: організацію для самовивозу задає модуль lkAutoOrgByPayment
  // (єдиний сеттер організації → без подвійного виставлення й конфлікту select2).
  function openPickupOrder(){
    if((location.hash||'').indexOf('/order/create') < 0){
      location.hash = '#/order/create';
    }
    applyPickup(); // лише доставка; організацію підхопить lkAutoOrgByPayment
  }
  function addBtn(){
    var anchor = document.querySelector('span.btn-check');
    if(!anchor || !anchor.parentNode) return;
    // ➕ швидка нова заявка самовивозу
    if(!document.getElementById('lk-pickup-btn')){
      var b = document.createElement('span');
      b.id = 'lk-pickup-btn';
      b.className = 'btn btn-primary-alt cursor-pointer';
      b.title = 'Швидко: нова заявка із самовивозом';
      b.style.marginLeft = '6px';
      b.textContent = '➕ Самовивіз';
      b.onclick = openPickupOrder;
      anchor.parentNode.insertBefore(b, anchor.nextSibling);
    }
    // 📋 перегляд УСІХ заявок самовивозу — справжнє посилання <a target=_blank>,
    // щоб працювали і звичайний клік, і колесико (середня кнопка), і Ctrl+клік.
    if(!document.getElementById('lk-pickup-list-btn')){
      var prev = document.getElementById('lk-pickup-btn') || anchor;
      var l = document.createElement('a');
      l.id = 'lk-pickup-list-btn';
      l.className = 'btn btn-default cursor-pointer';
      l.title = 'Показати всі заявки із самовивозом (будь-який спосіб оплати)';
      l.style.marginLeft = '6px';
      l.textContent = '📋 Самовивози';
      l.href = PICKUP_LIST_URL; l.target = '_blank'; l.rel = 'noopener';
      prev.parentNode.insertBefore(l, prev.nextSibling);
    }
    // 📋 перегляд УСІХ заявок (усі статуси) — так само <a target=_blank>
    if(!document.getElementById('lk-all-orders-btn')){
      var prev2 = document.getElementById('lk-pickup-list-btn') || document.getElementById('lk-pickup-btn') || anchor;
      var a = document.createElement('a');
      a.id = 'lk-all-orders-btn';
      a.className = 'btn btn-default cursor-pointer';
      a.title = 'Показати всі заявки (усі статуси)';
      a.style.marginLeft = '6px';
      a.textContent = '📋 Усі заявки';
      a.href = ALL_ORDERS_URL; a.target = '_blank'; a.rel = 'noopener';
      prev2.parentNode.insertBefore(a, prev2.nextSibling);
    }
  }
  window.addEventListener('lkdom', addBtn); addBtn();

  /* ---- дві плитки швидкої оплати (готівка / термінал) для самовивозу ---- */
  // знайти пункт у відкритому select2-попапі: спершу за точним значенням number:NN, далі за текстом
  function findOption(numVal, textRe){
    var lis=document.querySelectorAll('li.select2-results__option');
    var suffix='number:'+numVal;
    for(var i=0;i<lis.length;i++){ if((lis[i].id||'').slice(-suffix.length)===suffix) return lis[i]; }
    for(var j=0;j<lis.length;j++){ if(textRe && textRe.test(lis[j].textContent||'')) return lis[j]; }
    return null;
  }
  // СЕРІАЛІЗАЦІЯ роботи з select2-попапами: усі вибори йдуть ПО ЧЕРЗІ,
  // щоб паралельні (напр. організація + швидкий «Термінал») не збивали один одного
  var _selBusy=false, _selQ=[];
  function selRun(task){ _selQ.push(task); selPump(); }
  function selPump(){
    if(_selBusy || !_selQ.length) return;
    _selBusy=true;
    var task=_selQ.shift();
    var fin=function(){ _selBusy=false; setTimeout(selPump,120); };
    try{ task(fin); }catch(e){ fin(); }
  }
  // вибрати значення у кастомному p-editable полі (оплата/доставка/організація) — через чергу
  function chooseInField(fieldAttr, numVal, textRe){
    selRun(function(done){
      var field=document.querySelector('[attr-field-name="'+fieldAttr+'"]');
      if(!field){ done(); return; }
      var tries=0;
      var iv=setInterval(function(){
        tries++;
        if(optionsVisible()){
          clearInterval(iv);
          waitFor(function(){ return findOption(numVal, textRe); }, 40, function(opt){
            if(opt) clickIt(opt.querySelector('span') || opt);
            setTimeout(done, 60);
          });
          return;
        }
        if(tries===1 || tries%5===0) clickIt(field); // відкрити попап (без зайвого миготіння)
        if(tries>30){ clearInterval(iv); done(); }
      }, 110);
    });
  }
  // текст готового (домальованого) поля; null якщо поле сире або відсутнє
  function readyFieldText(attr){
    var f=document.querySelector('[attr-field-name="'+attr+'"]');
    if(!f) return null;
    var t=(f.textContent||'').replace(/\s+/g,' ').trim();
    return t.length>40 ? null : t;          // довгий текст = ще будується
  }
  function ensurePayTiles(){
    if(document.getElementById('lk-pay-tiles')) return;
    var st=document.createElement('style');
    st.textContent=''
      +'#lk-pay-tiles{position:fixed;left:50%;bottom:26px;transform:translateX(-50%);z-index:99997;display:none;gap:16px}'
      +'#lk-pay-tiles.show{display:flex}'
      +'#lk-pay-tiles .lk-pt{width:160px;height:96px;border-radius:16px;display:flex;flex-direction:column;align-items:center;justify-content:center;font-size:21px;font-weight:800;color:#fff;cursor:pointer;box-shadow:0 8px 24px rgba(0,0,0,.32);line-height:1.3;text-align:center;user-select:none;font-family:system-ui,Arial,sans-serif}'
      +'#lk-pay-tiles .lk-pt .ic{font-size:30px;margin-bottom:2px}'
      +'#lk-pay-tiles .lk-pt[data-pay="cash"]{background:#2e9e5b}'
      +'#lk-pay-tiles .lk-pt[data-pay="card"]{background:#2b6fd0}'
      +'#lk-pay-tiles .lk-pt:hover{filter:brightness(1.08)}'
      +'#lk-pay-tiles .lk-pt:active{transform:translateY(2px)}';
    document.head.appendChild(st);
    var wrap=document.createElement('div'); wrap.id='lk-pay-tiles';
    wrap.innerHTML=''
      +'<div class="lk-pt" data-pay="cash"><span class="ic">💵</span>Готівка</div>'
      +'<div class="lk-pt" data-pay="card"><span class="ic">💳</span>Термінал</div>';
    document.body.appendChild(wrap);
    wrap.querySelector('[data-pay="cash"]').onclick=function(){ chooseInField('payment_method', 44, /готівк/i); };
    wrap.querySelector('[data-pay="card"]').onclick=function(){ chooseInField('payment_method', 100, /термінал/i); };
  }
  // показуємо плитки лише на картці заявки, коли доставка = самовивіз і оплата ще НЕ обрана
  function updatePayTiles(){
    ensurePayTiles();
    var wrap=document.getElementById('lk-pay-tiles');
    var onCard=/\/order\/(create|update)/.test(location.hash||'');
    if(!onCard){ wrap.classList.remove('show'); return; }
    var ship=readyFieldText('shipping_method');
    var pay=readyFieldText('payment_method');
    if(ship===null || pay===null){ wrap.classList.remove('show'); return; } // поля ще не готові
    var isPickup=/самови/i.test(ship);
    // оплата вважається ОБРАНОЮ, якщо в полі є конкретний спосіб
    var paySet=/готівк|термінал|приват|monobank|моно|накладен|при отриман|розрахунк|wayforpay|liqpay|олх|пром/i.test(pay);
    if(isPickup && !paySet) wrap.classList.add('show');
    else wrap.classList.remove('show');
  }
  window.addEventListener('lkdom', updatePayTiles); updatePayTiles();
})();
}catch(e){ try{ console.warn("[SD] модуль «lkQuickPickup» не запустився:", e); }catch(_){} }
/* ▲▲▲ МОДУЛЬ-END • lkQuickPickup ▲▲▲ */


/* ╔════════════════════════════════════════════════════════════════════════╗
   ║ ▼▼▼  МОДУЛЬ-START • lkAutoOrgByPayment                                   ║
   ║ Автопідстановка організації (відправника) під вхідний платіж.            ║
   ║ САМОДОСТАТНІЙ — не залежить від інших модулів і нічого з них не вживає.   ║
   ║ Правити ТІЛЬКИ в межах рамок START…END, щоб не зачепити сусідні модулі.   ║
   ╚════════════════════════════════════════════════════════════════════════╝ */
try{ // SD-ізоляція: помилка цього модуля не зупинить решту
(function lkAutoOrgByPayment(){
  'use strict';
  // картка заявки З номером АБО сторінка СТВОРЕННЯ (#/order/create) — на створенні
  // організацію для самовивозу теж треба ставити (кнопка «➕ Самовивіз»)
  function onOrderPage(){ var h=location.hash||''; return /\/order\/create/.test(h) || /\/order\/\w+\/\d+/.test(h); }
  // організація САМОЇ заявки — виключаємо поле у формі чека (.invoice-form-containers),
  // бо там теж є attr-field-name="organizationId" і воно збиває вибір
  function orgField(){
    var all=document.querySelectorAll('.stylized-select[attr-field-name="organizationId"]');
    for(var i=0;i<all.length;i++){ if(!all[i].closest('.invoice-form-containers')) return all[i]; }
    return null;
  }
  function norm(s){ return String(s==null?'':s).replace(/ /g,' ').replace(/\s+/g,' ').trim().toLowerCase(); }

  // ФОП із найновішого вхідного платежу (рядок коментаря з посиланням incoming-payment)
  function paymentFop(){
    var links=document.querySelectorAll('a[href*="incoming-payment"]');
    for(var i=0;i<links.length;i++){
      var row=links[i].closest('tr')||links[i].closest('.comment-to-order');
      if(!row) continue;
      var t=row.querySelector('.comment-title-inner'); if(!t) continue;
      var parts=String(t.textContent||'').split('|');
      for(var j=parts.length-1;j>=0;j--){
        var seg=parts[j].trim();
        if(/^ФОП/i.test(seg)) return seg;
      }
    }
    return '';
  }

  var css=''
    +'.sd-org-locked{position:relative;cursor:pointer !important;background:#f6f6f6 !important;'
    +'  border:1px solid #e0b4b4 !important;border-radius:5px;opacity:.92;padding-right:20px !important}'
    +'.sd-org-locked::after{content:"🔒";position:absolute;right:5px;top:50%;transform:translateY(-50%);'
    +'  font-size:12px;pointer-events:none}'
    +'#sd-org-tip{position:fixed;z-index:2147483600;max-width:300px;background:#243b53;color:#fff;'
    +'  font:12px/1.4 -apple-system,"Segoe UI",Roboto,Arial,sans-serif;padding:8px 11px;border-radius:7px;'
    +'  box-shadow:0 6px 18px rgba(0,0,0,.25);pointer-events:none;opacity:0;transition:opacity .12s}'
    +'#sd-org-tip.show{opacity:1}';
  var st=document.createElement('style'); st.textContent=css; (document.head||document.documentElement).appendChild(st);

  var tipEl=null,tipT=null;
  function tip(x,y,msg){
    if(!tipEl){ tipEl=document.createElement('div'); tipEl.id='sd-org-tip'; document.body.appendChild(tipEl); }
    tipEl.textContent=msg;
    tipEl.style.left=Math.min(x+12,(window.innerWidth-320))+'px';
    tipEl.style.top=(y+14)+'px';
    tipEl.classList.add('show');
    if(tipT) clearTimeout(tipT);
    tipT=setTimeout(function(){ if(tipEl) tipEl.classList.remove('show'); },2600);
  }

  // мʼяке блокування: змінити можна, але лише після підтвердження
  function blocker(e){
    var f=orgField(); if(!f) return;
    if(!(f===e.target||f.contains(e.target))) return;
    if(!f.classList.contains('sd-org-locked')) return;
    e.preventDefault(); e.stopImmediatePropagation();
    if(e.type!=='click') return; // запит показуємо лише раз — на click
    var ok=false;
    try{ ok=confirm('Організацію підставлено автоматично.\n\nТочно потрібна ручна зміна?'); }catch(_){ ok=true; }
    if(ok){
      override[location.hash]=true;            // далі цю заявку автоматично не чіпаємо
      f.classList.remove('sd-org-locked');
      setTimeout(function(){ var ff=orgField(); if(ff) openEditor(ff); },0); // відкрити вибір
    }
  }
  document.addEventListener('mousedown',blocker,true);
  document.addEventListener('click',blocker,true);

  var DEBUG=false; // true → діагностика автопідстановки в консолі ([SD-Орг])
  function dbg(){ if(!DEBUG) return; try{ console.log.apply(console,['[SD-Орг]'].concat([].slice.call(arguments))); }catch(e){} }

  var busy=false, attempts={}, override={};
  function openEditor(f){
    ['mousedown','mouseup','click'].forEach(function(ev){
      f.dispatchEvent(new MouseEvent(ev,{bubbles:true,cancelable:true}));
    });
  }
  function setOrg(fopName){
    var f=orgField(); if(!f) return;
    busy=true;
    dbg('відкриваю редактор організації, ціль =', fopName);
    openEditor(f);
    var tries=0;
    var iv=setInterval(function(){
      tries++;
      // шукаємо список select2 будь-де (id або клас), бо id може відрізнятись
      var ul=document.getElementById('select2-organizationId-pk-results')
           || document.querySelector('ul.select2-results__options[id*="organizationId"]')
           || document.querySelector('.select2-container--open ul.select2-results__options');
      if(ul){
        var opts=ul.querySelectorAll('li.select2-results__option');
        dbg('список зʼявився (спроба '+tries+'), варіантів:', opts.length);
        var hit=null, names=[];
        opts.forEach(function(li){
          var sp=li.querySelector('span')||li;
          names.push(sp.textContent.trim());
          if(norm(sp.textContent)===norm(fopName)) hit=li;
        });
        if(hit){
          dbg('знайшов потрібний пункт, клікаю:', fopName);
          ['mousedown','mouseup','click'].forEach(function(ev){
            hit.dispatchEvent(new MouseEvent(ev,{bubbles:true,cancelable:true}));
          });
          setTimeout(function(){
            var sub=document.querySelector('.editableform [type="submit"], .editable-buttons [type="submit"], .editable-submit');
            if(sub){ dbg('тисну кнопку збереження'); try{ sub.click(); }catch(e){} }
            busy=false;
          },140);
        } else { dbg('НЕ знайшов пункт «'+fopName+'» у списку. Доступні:', names); busy=false; }
        clearInterval(iv);
      } else if(tries>25){ dbg('список select2 так і не зʼявився (редактор не відкрився синтетичним кліком)'); clearInterval(iv); busy=false; }
    },100);
  }

  // ЄДИНА логіка організації (щоб не було гонки кількох модулів):
  //   • доставка = Самовивіз → ФОП Кучер Василь Богданович (ПРІОРИТЕТ);
  //   • інакше є вхідний платіж → ФОП із платежу.
  var PICKUP_ORG='ФОП Кучер Василь Богданович';
  function isPickupShip(){ var s=document.querySelector('[attr-field-name="shipping_method"]'); return !!(s && /самовив/i.test(s.textContent||'')); }
  function anyPopupOpen(){ return document.querySelectorAll('li.select2-results__option').length>0; }
  function targetOrg(){ if(isPickupShip()) return PICKUP_ORG; return paymentFop()||''; }
  var lastState='';
  function tick(){
    if(busy) return;
    if(!onOrderPage()) return;
    var f=orgField();
    var want=targetOrg();
    var cur=f?norm(f.textContent):'(поля немає)';
    var target=norm(want);
    var state=(f?'field+':'field-')+'|'+target+'|'+cur;
    if(state!==lastState){ lastState=state;
      dbg('перевірка: поле =', !!f, '| ціль =', want||'(немає)', '| зараз =', f?f.textContent.trim():'—');
    }
    if(!f) return;
    if(!want){ f.classList.remove('sd-org-locked'); return; }           // ні самовивозу, ні платежу
    if(override[location.hash]){ f.classList.remove('sd-org-locked'); return; } // ручну зміну підтверджено
    if(cur===target){ f.classList.add('sd-org-locked'); return; }       // вже правильно → фіксуємо
    if(anyPopupOpen()){ dbg('відкритий інший попап — чекаю'); return; }  // не збивати оплату/інші select2
    var key=location.hash+'|'+target;
    attempts[key]=(attempts[key]||0)+1;
    if(attempts[key]>12){ dbg('вичерпано спроби автозаміни'); return; }
    setOrg(want);
  }

  var t=null; function soon(){ clearTimeout(t); t=setTimeout(tick,500); }
  window.addEventListener('lkdom', soon);
  window.addEventListener('hashchange',function(){ attempts={}; override={}; lastState=''; soon(); });
  dbg('модуль автопідстановки організації завантажено');
  soon();
})();
}catch(e){ try{ console.warn("[SD] модуль «lkAutoOrgByPayment» не запустився:", e); }catch(_){} }
/* ╚════ ▲▲▲ МОДУЛЬ-END • lkAutoOrgByPayment ════════════════════════════════╝ */


/* ▼▼▼ МОДУЛЬ-START • lkCheckCashbox — підстановка «каса самовивозу» у формі чека (оплата готівка/термінал) ▼▼▼ */
try{ // SD-ізоляція: помилка цього модуля не зупинить решту
(function lkCheckCashbox(){
  'use strict';
  var DEBUG=false; // true → логи [SD-Каса-чек] у консоль
  function dbg(){ if(!DEBUG) return; try{ console.log.apply(console,['[SD-Каса-чек]'].concat([].slice.call(arguments))); }catch(e){} }

  var CASH_NUM = 3;            // number:3 = «каса самовивозу» у списку cashRegisterId
  var CASH_RE  = /самовив/i;   // запасний пошук за назвою

  var REALWIN=(typeof unsafeWindow!=='undefined'&&unsafeWindow)?unsafeWindow:window;
  function clickIt(el){
    ['mousedown','mouseup','click'].forEach(function(t){
      var ev; try{ ev=new MouseEvent(t,{bubbles:true,cancelable:true,view:REALWIN}); }
      catch(e){ ev=new MouseEvent(t,{bubbles:true,cancelable:true}); }
      el.dispatchEvent(ev);
    });
  }
  function cashField(){ return document.querySelector('.stylized-select[attr-field-name="cashRegisterId"]'); }
  // умова: спосіб оплати в самому чеку = Готівка або Термінал
  function payCashOrCard(){
    var f=document.querySelector('[attr-field-name="documentPaymentTypeId"]');
    return !!(f && /готівк|термінал/i.test(f.textContent||''));
  }
  function txt(f){ return (f.textContent||'').replace(/\s+/g,' ').trim(); }
  function isEmpty(f){ var t=txt(f); return (!t || t==='---' || /ph-is-empty/.test(f.innerHTML)); }
  function optionsVisible(){ return document.querySelectorAll('li.select2-results__option').length>0; }
  function findOption(){
    var lis=document.querySelectorAll('li.select2-results__option');
    var suf='number:'+CASH_NUM;
    for(var i=0;i<lis.length;i++){ if((lis[i].id||'').slice(-suf.length)===suf) return lis[i]; }
    for(var j=0;j<lis.length;j++){ if(CASH_RE.test(lis[j].textContent||'')) return lis[j]; }
    return null;
  }

  var busy=false;
  function trySet(){
    if(busy) return;
    // якщо касу зараз ставить кнопка «🧾 Чек» — не втручаємось (без гонки за поле cashRegisterId)
    if(REALWIN.__lkChkBusy && (Date.now()-REALWIN.__lkChkBusy)<15000){ dbg('кнопка чека керує — пропускаю'); return; }
    var f=cashField(); if(!f) return;            // форми чека немає
    if(!payCashOrCard()){ dbg('оплата не готівка/термінал — пропускаю'); return; }
    if(!isEmpty(f)) return;                       // вже щось обрано — не чіпаємо
    dbg('ставлю «касу самовивозу»');
    busy=true;
    clickIt(f);
    var tries=0;
    var iv=setInterval(function(){
      tries++;
      if(optionsVisible()){
        clearInterval(iv);
        var s=0;
        var iv2=setInterval(function(){
          s++;
          var opt=findOption();
          if(opt){ clearInterval(iv2); clickIt(opt.querySelector('span')||opt); dbg('обрано'); setTimeout(function(){ busy=false; },250); }
          else if(s>30){ clearInterval(iv2); busy=false; dbg('пункт каси не знайдено'); }
        },90);
        return;
      }
      if(tries===1||tries%5===0) clickIt(f);
      if(tries>30){ clearInterval(iv); busy=false; dbg('попап каси не відкрився'); }
    },110);
  }

  var t=null; function soon(){ clearTimeout(t); t=setTimeout(trySet,400); }
  window.addEventListener('lkdom', soon);
  window.addEventListener('hashchange', soon);
  soon();
})();
}catch(e){ try{ console.warn("[SD] модуль «lkCheckCashbox» не запустився:", e); }catch(_){} }
/* ▲▲▲ МОДУЛЬ-END • lkCheckCashbox ▲▲▲ */


/* ▼▼▼ МОДУЛЬ-START • lkCheckButton — 🧾 кнопка «Чек»: відкрити форму чека самовивозу + підставити спосіб оплати ▼▼▼ */
try{ // SD-ізоляція: помилка цього модуля не зупинить решту
(function lkCheckButton(){
  'use strict';
  // DEBUG=true → логи [SD-Чек-кнопка] у консоль (для розвідки селекторів меню/полів).
  // Перед переносом у СТАБІЛЬНУ версію поставити false.
  var DEBUG=false;
  function dbg(){ if(!DEBUG) return; try{ console.log.apply(console,['[SD-Чек-кнопка]'].concat([].slice.call(arguments))); }catch(e){} }

  var REALWIN=(typeof unsafeWindow!=='undefined'&&unsafeWindow)?unsafeWindow:window;
  function clickIt(el){
    if(!el) return;
    // mouseenter/mousedown/mouseup/click з view:REALWIN — щоб select2/Angular прийняли синтетичний клік
    ['mouseenter','mousedown','mouseup','click'].forEach(function(t){
      var ev; try{ ev=new MouseEvent(t,{bubbles:true,cancelable:true,view:REALWIN}); }
      catch(e){ ev=new MouseEvent(t,{bubbles:true,cancelable:true}); }
      el.dispatchEvent(ev);
    });
  }
  function norm(s){ return String(s==null?'':s).replace(/\s+/g,' ').trim(); }

  // ── КАСИРИ ──────────────────────────────────────────────────────────────
  // По кнопці на кожного касира. На самовивіз — лише 2 касири (один ФОП: Кучер Василь).
  // Поле касира у формі чека = select2 attr-field-name="cashierId"; опції мають id
  // «…number:<num>» — тож найнадійніше ставимо касира за num (як каса number:3),
  // із запасним збігом за іменем.
  var CASHIER_ATTR = 'cashierId';
  var CASHIERS = [
    { name:'Кисунька Вікторія', label:'Вікторія', num:15 },
    { name:'yura_dmitrishun',   label:'Юра',      num:10 }
  ];
  // Після заповнення полів САМІ тиснемо «Зберегти» (створюємо/фіскалізуємо чек).
  // true = авто-збереження (за рішенням користувача); false = лишити збереження менеджеру.
  var AUTO_SAVE = true;

  // matcher опції касира: спершу за id опції (…number:<num>), далі за словами імені
  function nameMatcher(cashier){
    var base=(cashier.match||cashier.name||'').toLowerCase();
    var words=base.split(/\s+/).filter(function(w){ return w.length>1; });
    var suf=cashier.num!=null?('number:'+cashier.num):null;
    return function(text, li){
      if(suf && li && (li.id||'').slice(-suf.length)===suf) return true;
      if(!words.length) return false;
      var t=norm(text).toLowerCase();
      return words.every(function(w){ return t.indexOf(w)>=0; });
    };
  }

  // текст готового (домальованого) поля заявки; null якщо сире/довге (ще будується)
  function readyFieldText(attr){
    var f=document.querySelector('[attr-field-name="'+attr+'"]');
    if(!f) return null;
    var t=norm(f.textContent);
    return t.length>40 ? null : t;
  }
  function fieldEmpty(f){
    if(!f) return true;
    var t=norm(f.textContent);
    return (!t || t==='---' || /ph-is-empty/.test(f.innerHTML||''));
  }
  function optsVisible(){ return document.querySelectorAll('li.select2-results__option').length>0; }
  function findOptBy(matchFn){
    var lis=document.querySelectorAll('li.select2-results__option');
    for(var i=0;i<lis.length;i++){ if(matchFn(lis[i].textContent||'', lis[i])) return lis[i]; }
    return null;
  }
  // Відкрити select2-поле й клікнути пункт за matchFn; done() — коли ЗАКРИВСЯ попап.
  // За вимірами: список готовий ~170 мс, закривається ~25 мс. Тому опитуємо ЧАСТО (30 мс),
  // але поле клікаємо ЛИШЕ раз (клік по відкритому select2 його закриває → блимання).
  // Реоупен лише один раз, якщо за ~1 с списку так і не з'явилось.
  var TICK=30, T_FIND=90 /*~2.7с*/, T_CLOSE=30 /*~0.9с*/, T_REOPEN=33 /*~1с*/;
  function openAndPick(fieldEl, matchFn, tag, done){
    tag=tag||'поле'; done=done||function(){};
    var s=0, picked=false, finished=false, reopened=false;
    function fin(){ if(finished) return; finished=true; try{ clearInterval(iv); }catch(e){} done(); }
    clickIt(fieldEl); // відкрити один раз
    var iv=setInterval(function(){
      s++;
      if(!picked){
        if(optsVisible()){
          var opt=findOptBy(matchFn);
          if(opt){ clickIt(opt.querySelector('span')||opt); picked=true; s=0; dbg('обрано:', tag); return; }
          // список видимий, але потрібного пункту ще нема — чекаємо (НЕ реклікаємо)
        } else if(!reopened && s>=T_REOPEN){
          reopened=true; s=0; clickIt(fieldEl); // список так і не з'явився — один обережний реоупен
        }
        if(s>T_FIND){ dbg('пункт не встановлено:', tag); fin(); }
      } else {
        // вибір зроблено — чекаємо, поки select2 закриє попап, тоді done()
        if(!optsVisible() || s>T_CLOSE){ fin(); }
      }
    },TICK);
  }
  // select2-поле за attr-field-name, обрати за регексом — ЛИШЕ якщо порожнє
  function pickInField(attr, re, done){
    done=done||function(){};
    var f=document.querySelector('[attr-field-name="'+attr+'"]');
    if(!f){ dbg('поле',attr,'не знайдено'); done(); return; }
    if(!fieldEmpty(f)){ dbg('поле',attr,'вже заповнене — не чіпаю'); done(); return; }
    openAndPick(f, function(t){ return re.test(t); }, attr, done);
  }
  // select2-поле, обрати опцію за id «…number:<num>» — ЛИШЕ якщо порожнє (напр. каса number:3)
  function pickInFieldNum(attr, num, done){
    done=done||function(){};
    var f=document.querySelector('[attr-field-name="'+attr+'"]');
    if(!f){ dbg('поле',attr,'не знайдено'); done(); return; }
    if(!fieldEmpty(f)){ dbg('поле',attr,'вже заповнене — не чіпаю'); done(); return; }
    var suf='number:'+num;
    openAndPick(f, function(t, li){ return !!(li && (li.id||'').slice(-suf.length)===suf); }, attr+'#'+num, done);
  }

  // знайти поле касира у формі чека: за CASHIER_ATTR або за підписом «касир»
  function cashierField(){
    if(CASHIER_ATTR){ var f=document.querySelector('[attr-field-name="'+CASHIER_ATTR+'"]'); if(f) return f; }
    var labels=document.querySelectorAll('label,.control-label,.text-right');
    for(var i=0;i<labels.length;i++){
      if(/касир/i.test(labels[i].textContent||'')){
        var g=(labels[i].closest&&labels[i].closest('.form-group'))||labels[i].parentNode;
        if(g){ var el=g.querySelector('[attr-field-name]')||g.querySelector('.stylized-select')||g.querySelector('select'); if(el) return el; }
      }
    }
    return null;
  }
  // підставити касира: ЗАВЖДИ перезаписуємо (у формі стоїть касир за замовчуванням,
  // а кнопка = явний вибір). Підтримуємо і select2 (як каса), і звичайний <select>.
  function setCashier(cashier, done){
    done=done||function(){};
    var f=cashierField();
    if(!f){ dbg('поле касира не знайдено — оберіть касира вручну'); done(); return; }
    var match=nameMatcher(cashier);
    // ЛИШЕ якщо поле — справжній нативний <select> (не select2-віджет SalesDrive).
    // Поле cashierId у CRM — select2 (як каса), тож піде гілка openAndPick нижче.
    var sel=(f.tagName==='SELECT')?f:null;
    if(sel && sel.options && sel.options.length){
      for(var i=0;i<sel.options.length;i++){
        if(match(sel.options[i].textContent, sel.options[i])){
          if(sel.selectedIndex===i){ dbg('касир уже цей — ок:', cashier.label||cashier.name); done(); return; }
          sel.value=sel.options[i].value; sel.selectedIndex=i;
          ['input','change'].forEach(function(t){ try{ sel.dispatchEvent(new Event(t,{bubbles:true})); }catch(e){} });
          try{ if(REALWIN.angular) REALWIN.angular.element(sel).triggerHandler('change'); }catch(e){}
          dbg('касир (select) обрано:', cashier.label||cashier.name); done(); return;
        }
      }
      dbg('касир не знайдений у списку (select):', cashier.name); done(); return;
    }
    // інакше select2 — відкрити й клікнути потрібний пункт (перезапис поточного)
    openAndPick(f, match, 'касир:'+(cashier.label||cashier.name), done);
  }
  // DEBUG: перелік видимих полів форми чека (щоб знайти поле касира)
  function dumpFields(){
    if(!DEBUG) return;
    try{
      var flds=[];
      document.querySelectorAll('[attr-field-name]').forEach(function(f){
        if(f.offsetWidth||f.offsetHeight) flds.push(f.getAttribute('attr-field-name')+'="'+norm(f.textContent).slice(0,30)+'"');
      });
      dbg('поля форми чека:', flds.join(' | '));
    }catch(e){}
  }

  // Створення чека в SalesDrive — окрема сторінка #/document/check/create/order/<id>
  // (той самий шаблон, що «Прибутковий касовий ордер» → #/document/cash-order/create/order/<id>;
  // перевірено на живій CRM). Якщо в меню «+ Документ» є готовий лінк на створення чека —
  // беремо його href (найточніше), інакше будуємо URL самі.
  function checkCreateHash(orderId){
    var a=document.querySelector('a[href*="document/check/create"]');
    if(a){
      var h=a.getAttribute('href')||'';
      var i=h.indexOf('#');
      if(i>=0){ dbg('лінк створення чека з меню:', h); return h.slice(i); }
    }
    return '#/document/check/create/order/'+orderId;
  }
  // дочекатися появи форми чека (поле documentPaymentTypeId), тоді cb()
  function waitForm(cb){
    var n=0;
    var iv=setInterval(function(){
      n++;
      if(document.querySelector('[attr-field-name="documentPaymentTypeId"]')){ clearInterval(iv); dbg('форма чека зʼявилась'); if(cb) cb(); return; }
      if(n>150){ clearInterval(iv); dbg('форма чека не зʼявилась'); }
    },50);
  }
  // виконати кроки послідовно: кожен наступний стартує щойно попередній завершив (done);
  // onDone() — після останнього кроку (усі опції вже клікнуті)
  function runSeq(steps, onDone){
    var i=0;
    (function nextStep(){
      if(i>=steps.length){ if(onDone) onDone(); return; }
      var step=steps[i++];
      try{ step(function(){ setTimeout(nextStep, 90); }); }catch(e){ dbg('крок впав:', e&&e.message); setTimeout(nextStep, 90); }
    })();
  }
  // кнопка збереження документа (чека) — «Зберегти», перша видима
  function saveBtn(){
    var bs=document.querySelectorAll('button[ng-click="saveItem();"]');
    for(var i=0;i<bs.length;i++){ if(bs[i].offsetWidth||bs[i].offsetHeight) return bs[i]; }
    return bs[0]||null;
  }

  // головна дія кнопки: відкрити сторінку створення чека, підставити спосіб оплати + касира
  function openAndFill(cashier){
    var m=(location.hash||'').match(/\/order\/update\/(\d+)/);
    var orderId=m?m[1]:null;
    if(!orderId){ dbg('не бачу id заявки в URL'); return; }
    // зафіксувати оплату ЗАЯВКИ до переходу (на сторінці чека цього поля вже не буде)
    var pay=readyFieldText('payment_method')||'';
    var wantCash=/готівк/i.test(pay);
    var wantCard=/термінал/i.test(pay);
    dbg('заявка', orderId, '| касир:', cashier&&(cashier.label||cashier.name), '| оплата:', pay);
    var target=checkCreateHash(orderId);
    dbg('відкриваю', target);
    location.hash=target;
    // поки кнопка чека керує формою — lkCheckCashbox не чіпає касу (без гонки за поле)
    REALWIN.__lkChkBusy = Date.now();
    waitForm(function(){
      // Послідовний ланцюжок, кожен крок чекає закриття свого попапа перед наступним:
      // 1) спосіб оплати за заявкою; 2) каса самовивозу (number:3) — ставимо САМІ;
      // 3) касир (перезапис). Потім — авто-«Зберегти».
      var payRe = wantCash?/готівк/i : (wantCard?/термінал|картк/i : null);
      var steps=[];
      if(payRe) steps.push(function(next){ pickInField('documentPaymentTypeId', payRe, next); });
      steps.push(function(next){ pickInFieldNum('cashRegisterId', 3, next); }); // каса самовивозу
      if(cashier) steps.push(function(next){ setCashier(cashier, next); });
      runSeq(steps, function(){
        if(DEBUG) dumpFields();
        if(!AUTO_SAVE){ REALWIN.__lkChkBusy=0; return; }
        // пауза — щоб Angular зафіксував останній select2-вибір перед збереженням
        setTimeout(function(){
          REALWIN.__lkChkBusy=0;
          if(!/document\/check/.test(location.hash||'')){ dbg('не на сторінці чека — не зберігаю'); return; }
          var sb=saveBtn();
          if(!sb){ dbg('кнопку «Зберегти» не знайдено'); return; }
          dbg('тисну «Зберегти»');
          clickIt(sb);
        }, 250);
      });
    });
  }

  // показувати кнопку лише на картці заявки, коли доставка самовивіз і оплата готівка/термінал
  function gateOK(){
    if(!/\/order\/update/.test(location.hash||'')) return false;
    var ship=readyFieldText('shipping_method');
    var pay=readyFieldText('payment_method');
    if(ship===null||pay===null) return false;      // поля ще будуються
    return /самови/i.test(ship) && /готівк|термінал/i.test(pay);
  }
  function ensureBtns(){
    // якір — тулбар КАРТКИ заявки: рідна кнопка копіювання (біля неї стоїть «🗐 без товарів»)
    var anchor=document.querySelector('button[ng-click="viewModel.copyOrder($event)"]');
    if(!anchor||!anchor.parentNode) return false;
    // вставляти праворуч від «🗐 без товарів» (або від останньої вже доданої нашої кнопки)
    var prev=document.getElementById('lk-copy-ng')||anchor;
    for(var k=CASHIERS.length-1;k>=0;k--){ var last=document.getElementById('lk-check-btn-'+k); if(last){ prev=last; break; } }
    CASHIERS.forEach(function(cashier, idx){
      var id='lk-check-btn-'+idx;
      if(document.getElementById(id)) return;
      var b=document.createElement('button');
      b.id=id; b.type='button'; b.className='btn btn-default';
      b.title='Створити чек для цієї заявки, касир: '+(cashier.name||'')+'. Спосіб оплати й касу підставимо; «Створити чек» тисніть вручну.';
      b.style.marginLeft='4px'; b.style.display='none';
      b.textContent='🧾 Чек · '+(cashier.label||cashier.name||('#'+idx));
      b.addEventListener('click', (function(c){ return function(e){ e.preventDefault(); openAndFill(c); }; })(cashier));
      prev.parentNode.insertBefore(b, prev.nextSibling);
      prev=b;
    });
    return true;
  }
  function tick(){
    if(!ensureBtns()) return;
    var show=gateOK();
    CASHIERS.forEach(function(_, idx){
      var b=document.getElementById('lk-check-btn-'+idx);
      if(b) b.style.display = show ? 'inline-block' : 'none';
    });
  }
  window.addEventListener('lkdom', tick);
  window.addEventListener('hashchange', tick);
  tick();
})();
}catch(e){ try{ console.warn("[SD] модуль «lkCheckButton» не запустився:", e); }catch(_){} }
/* ▲▲▲ МОДУЛЬ-END • lkCheckButton ▲▲▲ */


/* ▼▼▼ МОДУЛЬ-START • lkSenderBySource — відправник у формі СМС за джерелом замовлення ▼▼▼ */
try{ // SD-ізоляція: помилка цього модуля не зупинить решту
(function lkSenderBySource(){
  'use strict';
  var DEBUG=false; // true → логи [SD-Відправник]
  function dbg(){ if(!DEBUG) return; try{ console.log.apply(console,['[SD-Відправник]'].concat([].slice.call(arguments))); }catch(e){} }

  // Мапа «нормалізоване джерело → значення option у select СМС»
  // Значення option такі: string:Fixland | string:KOMPLEKTOM | string:Lartek | string:MAGAZIN | string:Refort
  var MAP={
    'fixland'            : 'string:Fixland',
    'refort'             : 'string:Refort',
    'lartek.com.ua'      : 'string:Lartek',
    'сайт'               : 'string:KOMPLEKTOM',
    'mobile_catalog_app' : 'string:KOMPLEKTOM',
    'bigl'               : 'string:KOMPLEKTOM'
    // інші джерела — не чіпаємо (менеджер обирає сам)
  };

  function norm(s){ return String(s==null?'':s).replace(/\s+/g,' ').trim().toLowerCase(); }
  function txt(f){ return (f?f.textContent:'').replace(/\s+/g,' ').trim(); }
  function onOrderPage(){ return /\/order\/\w+\/\d+/.test(location.hash||''); }

  function sourceField(){ return document.querySelector('.stylized-select[attr-field-name="dzereloZamovlenna"]'); }
  function smsSelect(){ return document.querySelector('select[ng-model="viewModel.smsSender"]'); }

  var REALWIN=(typeof unsafeWindow!=='undefined'&&unsafeWindow)?unsafeWindow:window;

  function setSelect(sel, value){
    // 1) Пряма зміна value + Angular/Change event — це те, що робить сам SalesDrive
    try{
      sel.value=value;
      sel.dispatchEvent(new Event('change',{bubbles:true}));
    }catch(e){}
    // 2) Дублювати через jQuery+select2 (SalesDrive використовує jQuery)
    try{
      var jq = REALWIN.jQuery || REALWIN.$;
      if(jq){ jq(sel).val(value).trigger('change'); }
    }catch(e){}
  }

  var appliedFor=null; // ключ = hash+джерело+ціль, щоб не робити двічі підряд
  function tryApply(){
    if(!onOrderPage()) return;
    var sel=smsSelect(); if(!sel) return;   // форма СМС ще не відкрита
    var src=sourceField(); if(!src) return; // немає джерела в картці
    var target=MAP[norm(txt(src))];
    if(!target){ dbg('джерело =', txt(src), '→ немає в мапі, не чіпаю'); return; }
    if(sel.value===target){ return; }        // вже правильно
    // Якщо вже щось не-порожнє обране (менеджер вручну поміняв) — не перезаписуємо
    if(sel.value && sel.value!=='' && sel.value!=='?' && sel.value!==null){
      // виняток: якщо порожнє значення (---), value буде '' або 'null' — тоді підставляємо
      // інакше — не чіпаємо
      var cur=String(sel.value);
      if(cur!=='' && cur!=='null' && cur!=='?'){
        dbg('відправник вже обрано (', cur, ') — не перезаписую');
        return;
      }
    }
    var key=location.hash+'|'+txt(src)+'|'+target;
    if(appliedFor===key) return;
    appliedFor=key;
    dbg('джерело =', txt(src), '→ виставляю відправника:', target);
    setSelect(sel, target);
  }

  var t=null;
  function soon(){ clearTimeout(t); t=setTimeout(tryApply,150); }
  window.addEventListener('lkdom', soon);
  window.addEventListener('hashchange', function(){ appliedFor=null; soon(); });
  dbg('модуль завантажено');
  soon();
})();
}catch(e){ try{ console.warn("[SD] модуль «lkSenderBySource» не запустився:", e); }catch(_){} }
/* ▲▲▲ МОДУЛЬ-END • lkSenderBySource ▲▲▲ */


/* ▼▼▼ МОДУЛЬ-START • lkCopyNoGoods — кнопка «Копіювати заявку БЕЗ товарів» ▼▼▼ */
try{ // SD-ізоляція: помилка цього модуля не зупинить решту
(function lkCopyNoGoods(){
  'use strict';
  var FLAG = 'lk_copy_nogoods'; // sessionStorage: {src, ts, srcRows}
  var W = (typeof unsafeWindow!=='undefined' && unsafeWindow) ? unsafeWindow : window;

  function curOrderId(){ var m=(location.hash||'').match(/\/order\/update\/(\d+)/); return m?m[1]:null; }
  function nativeCopyBtn(){ return document.querySelector('button[ng-click="viewModel.copyOrder($event)"]'); }
  function scopeOf(el){ try{ return el && W.angular && W.angular.element(el).scope(); }catch(e){ return null; } }
  // товарні рядки: a.link-product-field трапляється і в стрічці історії
  // (запис «Видалено: …») — рядки .comment-to-order виключаємо.
  function productRows(){
    var out=[];
    document.querySelectorAll('a.link-product-field').forEach(function(a){
      var tr=a.closest('tr');
      if(tr && !tr.classList.contains('comment-to-order')) out.push(tr);
    });
    return out;
  }

  function addBtn(){
    if(document.getElementById('lk-copy-ng')) return;
    var nb=nativeCopyBtn(); if(!nb || !nb.parentNode) return;
    var b=document.createElement('button');
    b.id='lk-copy-ng'; b.type='button';
    b.className='btn btn-default';
    b.title='Копіювати заявку БЕЗ товарів (клієнт/доставка/дані — так, товари — ні)';
    b.textContent='🗐 без товарів';
    b.style.marginLeft='4px';
    b.addEventListener('click', function(e){
      e.preventDefault();
      var src=curOrderId(); if(!src) return;
      try{ sessionStorage.setItem(FLAG, JSON.stringify({ src:src, ts:Date.now(), srcRows: productRows().length })); }catch(_){}
      nb.click(); // рідне копіювання SalesDrive
    });
    nb.parentNode.insertBefore(b, nb.nextSibling);
  }

  var DBG=false; // замір у консоль (тег [SD-Копія]); вимкнути після налагодження
  function log(){ if(!DBG) return; try{ var a=['%c[SD-Копія]','color:#c0392b;font-weight:bold'].concat([].slice.call(arguments)); console.log.apply(console,a); }catch(_){}}

  // Модель СКОПІЙОВАНОЇ заявки шукаємо СТРОГО за id з URL. Під час копіювання в
  // DOM якусь мить існують ОБИДВІ заявки — глобальний селектор може зачепити
  // ПЕРВИННУ. Тому беремо лише ту viewModel, у якої order.id === id копії.
  function copyVM(copyId){
    var want=String(copyId), found=null;
    function consider(sc){
      if(found||!sc) return;
      var s=sc, g=0;
      while(s && !s.viewModel && g++<12) s=s.$parent;
      var vm=s && s.viewModel;
      if(vm && vm.order && String(vm.order.id)===want && typeof vm.updateOrder==='function') found={vm:vm, sc:s};
    }
    document.querySelectorAll('button[ng-click*="updateOrder"]').forEach(function(b){ consider(scopeOf(b)); });
    if(!found) productRows().forEach(function(tr){ consider(scopeOf(tr)); });
    return found;
  }

  // Чистка: спорожняємо масив товарів у моделі КОПІЇ й робимо ОДИН updateOrder
  // (deleteComment по кожному товару НЕ використовуємо — SalesDrive на кожен
  // виклик робить окрему важку операцію → повільно).
  function cleanNow(copyId, srcId, clickTs){
    var t0=Date.now();
    if(String(copyId)===String(srcId)){ log('ЗАХИСТ: id копії == id первинної — пропускаю'); return false; }
    var c=copyVM(copyId);
    if(!c){ log('модель копії', copyId, 'ще не готова'); return false; }
    var ord=c.vm.order;
    // потрійний запобіжник: чистимо ЛИШЕ модель копії, ніколи не первинну
    if(!ord || String(ord.id)!==String(copyId) || String(ord.id)===String(srcId)){ log('ЗАХИСТ: модель не відповідає копії', copyId); return false; }
    var before=(ord.products&&ord.products.length)||0;
    try{
      if(Array.isArray(ord.products)) ord.products.length=0;
      else if(ord.products && typeof ord.products==='object'){ Object.keys(ord.products).forEach(function(k){ delete ord.products[k]; }); }
      else { log('немає order.products'); return false; }
      var tSave=Date.now();
      c.vm.updateOrder(ord);
      if(c.sc && typeof c.sc.$applyAsync==='function') c.sc.$applyAsync();
      var now=Date.now();
      log('копія', copyId, '— очищено', before, 'товарів | від кліку:', (clickTs?(now-clickTs):'?')+'мс | чистка+save:', (now-t0)+'мс (save:', (now-tSave)+'мс)');
      var poll0=Date.now(), tries=0;
      (function watch(){ tries++; var left=productRows().length;
        if(left===0){ log('DOM: товари зникли за', (Date.now()-poll0)+'мс після save'); return; }
        if(tries>100){ log('DOM: лишилось', left, 'рядків через', (Date.now()-poll0)+'мс'); return; }
        setTimeout(watch, 100);
      })();
      return true;
    }catch(e){ log('помилка чистки:', e.message); return false; }
  }

  var busy=false, fastT=null, copyArrivedTs=0;
  function soonFast(){ clearTimeout(fastT); fastT=setTimeout(tick, 100); } // швидке дожидання копії
  function tick(){
    addBtn();
    if(busy) return;
    var raw=null; try{ raw=sessionStorage.getItem(FLAG); }catch(_){}
    if(!raw){ copyArrivedTs=0; return; }
    var f=null; try{ f=JSON.parse(raw); }catch(_){}
    if(!f || (Date.now()-f.ts)>40000){ try{ sessionStorage.removeItem(FLAG); }catch(_){} copyArrivedTs=0; return; }
    var id=curOrderId();
    if(!id || id===String(f.src)){ copyArrivedTs=0; soonFast(); return; }   // ще на джерелі / триває перехід
    // чекаємо, поки МОДЕЛЬ саме копії (за збігом id) завантажить свої товари
    var c=copyVM(id);
    if(!c || !c.vm.order || !c.vm.order.products){ soonFast(); return; }
    if(!copyArrivedTs) copyArrivedTs=Date.now();
    var have=c.vm.order.products.length, need=f.srcRows||1;
    // готово, коли товарів стільки ж, як у джерелі; або є хоч якісь і минуло >4с
    if(have<need && !(have>0 && (Date.now()-copyArrivedTs)>4000)){ soonFast(); return; }
    busy=true;
    log('копія відкрилась (', id, '), товарів у моделі:', have, '| перехід:', (Date.now()-f.ts)+'мс');
    var ok=cleanNow(id, f.src, f.ts);
    if(ok){ try{ sessionStorage.removeItem(FLAG); }catch(_){} copyArrivedTs=0; }
    else soonFast();
    busy=false;
  }
  window.addEventListener('lkdom', function(){ setTimeout(tick, 40); });
  window.addEventListener('hashchange', soonFast);
  log('модуль активний (v1.74)');
  tick();
})();
}catch(e){ try{ console.warn("[SD] модуль «lkCopyNoGoods» не запустився:", e); }catch(_){} }
/* ▲▲▲ МОДУЛЬ-END • lkCopyNoGoods ▲▲▲ */
