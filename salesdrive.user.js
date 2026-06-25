// ==UserScript==
// @name         SalesDrive — Допродажі + База знань
// @namespace    lartek-komplektom
// @version      0.91
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
// @updateURL    https://raw.githubusercontent.com/vasilkucherlv-del/salesdrive-userscript/main/salesdrive.user.js
// @downloadURL  https://raw.githubusercontent.com/vasilkucherlv-del/salesdrive-userscript/main/salesdrive.user.js
// ==/UserScript==

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

  function getMap(force) {
    var now = Date.now();
    var cached = gmGetJSON("sd_upsell_cache_v1");
    if (!force && cached && cached.pairs && cached.pairs.length && now - cached.ts < TTL_MS) {
      return Promise.resolve({ pairs: cached.pairs, source: "cache" });
    }
    return gmFetch(gvizUrl(SHEET_ID, GID)).then(function (txt) {
      var pairs = parseGviz(txt);
      if (!pairs.length) throw new Error("у таблиці 0 придатних рядків");
      gmSetJSON("sd_upsell_cache_v1", { ts: now, pairs: pairs });
      return { pairs: pairs, source: "sheet" };
    }).catch(function (err) {
      if (cached && cached.pairs && cached.pairs.length) {
        return { pairs: cached.pairs, source: "cache-after-error", error: String(err) };
      }
      return { pairs: [], source: "error", error: String(err) };
    });
  }

  function getKb(force) {
    var now = Date.now();
    var cached = gmGetJSON("sd_kb_cache_v1");
    if (!force && cached && cached.rows && cached.rows.length && now - cached.ts < TTL_MS) {
      return Promise.resolve({ rows: cached.rows, source: "cache" });
    }
    return gmFetch(gvizUrl(KB_SHEET_ID, KB_GID)).then(function (txt) {
      var rows = parseKb(txt);
      if (!rows.length) throw new Error("у таблиці 0 придатних рядків");
      gmSetJSON("sd_kb_cache_v1", { ts: now, rows: rows });
      return { rows: rows, source: "sheet" };
    }).catch(function (err) {
      if (cached && cached.rows && cached.rows.length) {
        return { rows: cached.rows, source: "cache-after-error", error: String(err) };
      }
      return { rows: [], source: "error", error: String(err) };
    });
  }

  // ---- шим chrome.* — щоб перенесений код content.js/kb.js працював без змін ----
  var chrome = {
    runtime: {
      lastError: null,
      sendMessage: function (msg, cb) {
        if (!msg) return;
        if (msg.type === "sdGetUpsellMap") { getMap(!!msg.force).then(function (r) { if (cb) cb(r); }); return; }
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
      __sdStyle.textContent = "/* hint.css */\n#sd-upsell-hint{\n  position:relative; box-sizing:border-box;\n  width:100%; min-width:min(560px, 100%); max-width:980px;\n  margin:10px 0 14px 0; padding:14px 44px 16px 18px;\n  background:#FFF8E1; border:2px solid #F0A800; border-left:7px solid #F0A800;\n  border-radius:10px; font-family:Arial, sans-serif; color:#4a3700;\n  box-shadow:0 3px 12px rgba(0,0,0,.15); z-index:9999;\n  animation:sdpop .18s ease-out;\n}\n@keyframes sdpop{from{transform:scale(.99);opacity:.3}to{transform:scale(1);opacity:1}}\n\n#sd-upsell-hint .sd-top{font-size:13px; opacity:.75; font-weight:600; margin-bottom:6px}\n\n/* блок одного супутнього: скрипт + кнопка */\n#sd-upsell-hint .sd-item{\n  display:flex; flex-wrap:wrap; align-items:flex-start; gap:12px 14px;\n  padding:12px 0 2px 0; margin-top:12px;\n  border-top:1px dashed rgba(240,168,0,.55);\n}\n#sd-upsell-hint .sd-item:first-of-type{border-top:none; margin-top:0; padding-top:0}\n\n/* середня колонка: назва + причина + наявність */\n#sd-upsell-hint .sd-main{\n  flex:1 1 300px; min-width:0;\n  display:flex; flex-direction:column; align-items:flex-start; gap:6px;\n}\n#sd-upsell-hint .sd-name{\n  font-size:15px; font-weight:700; line-height:1.3; color:#3a2c00;\n  overflow-wrap:anywhere;\n}\n#sd-upsell-hint .sd-script{\n  font-size:14px; font-weight:400; line-height:1.5; color:#5a4a14;\n  overflow-wrap:anywhere;\n}\n\n/* права колонка: ціна + кнопка */\n#sd-upsell-hint .sd-action{\n  flex:0 0 auto; width:150px; max-width:100%;\n  display:flex; flex-direction:column; align-items:stretch; gap:8px;\n}\n#sd-upsell-hint .sd-add{\n  width:100%; box-sizing:border-box;\n  white-space:normal; word-break:break-word; text-align:center;\n  padding:11px 14px; background:#2E7D32; color:#fff;\n  border:none; border-radius:7px;\n  font-size:15px; font-weight:bold; cursor:pointer; font-family:Arial, sans-serif;\n}\n#sd-upsell-hint .sd-add:hover{background:#256628}\n#sd-upsell-hint .sd-add:active{transform:translateY(1px)}\n#sd-upsell-hint .sd-add.sd-done{background:#9e9e9e; cursor:default}\n#sd-upsell-hint .sd-add.sd-done:hover{background:#9e9e9e}\n#sd-upsell-hint .sd-sku{background:rgba(255,255,255,.25); padding:2px 8px; border-radius:4px; font-size:13px; margin-left:6px}\n\n#sd-upsell-hint .sd-x{position:absolute; top:8px; right:12px; cursor:pointer; font-size:22px; line-height:1; color:#a07800; border:none; background:none}\n#sd-upsell-hint .sd-x:hover{color:#4a3700}\n\n/* бейдж залишку супутнього */\n#sd-upsell-hint .sd-stock{flex:0 0 auto; max-width:100%; font-size:13px; font-weight:700; padding:5px 10px; border-radius:6px; white-space:normal; overflow-wrap:anywhere}\n#sd-upsell-hint .sd-stock-wait{background:#eee; color:#777; font-weight:normal}\n#sd-upsell-hint .sd-stock-yes{background:#E6F4EA; color:#1B5E20; border:1px solid #A5D6A7}\n#sd-upsell-hint .sd-stock-no{background:#FDECEA; color:#B71C1C; border:1px solid #F5B7B1}\n#sd-upsell-hint .sd-stock-unk{background:#f0f0f0; color:#777; font-weight:normal}\n\n/* мініатюри товарів у пошуку SalesDrive */\nli.sd-has-img{display:flex !important; align-items:center; gap:8px}\nli.sd-has-img > a{flex:1 1 auto; min-width:0}\nimg.sd-opt-img{width:34px; height:34px; flex:0 0 34px; object-fit:contain; border:1px solid #eee; border-radius:4px; background:#fff}\n\n/* фото супутнього у підказці допродажу */\n#sd-upsell-hint .sd-comp-img{flex:0 0 auto; width:48px; height:48px; object-fit:contain; border:1px solid #e0d4a8; border-radius:6px; background:#fff}\n\n/* кнопка діагностики фото (зʼявляється лише якщо фото не знайдено) */\n\n/* ---- Передупередження про ціну ROZETKA ---- */\n#sd-price-warn {\n  position: relative;\n  margin: 10px 0;\n  padding: 10px 34px 10px 12px;\n  border: 1px solid #e0b4b4;\n  border-left: 4px solid #d9534f;\n  background: #fdf3f3;\n  border-radius: 6px;\n  font: 13px/1.45 -apple-system, \"Segoe UI\", Roboto, Arial, sans-serif;\n  color: #7a1f1f;\n  max-width: 980px;\n  box-sizing: border-box;\n}\n#sd-price-warn .sd-x {\n  position: absolute; top: 6px; right: 8px;\n  border: none; background: transparent; cursor: pointer;\n  font-size: 18px; line-height: 1; color: #a05; opacity: .6;\n}\n#sd-price-warn .sd-x:hover { opacity: 1; }\n#sd-price-warn .sd-pw-top { font-weight: 600; margin-bottom: 6px; color: #c0392b; }\n#sd-price-warn .sd-pw-row {\n  display: flex; flex-wrap: wrap; gap: 4px 12px;\n  padding: 4px 0; border-top: 1px dashed #ecc9c9;\n}\n#sd-price-warn .sd-pw-name { flex: 1 1 280px; min-width: 0; }\n#sd-price-warn .sd-pw-info { white-space: nowrap; font-weight: 600; }\n#sd-price-warn .sd-pw-below .sd-pw-info { color: #c0392b; }\n\n/* ---- Передупередження про низький рейтинг клієнта ---- */\n#sd-rating-warn {\n  position: relative;\n  margin: 10px 0;\n  padding: 10px 34px 10px 12px;\n  border: 1px solid #e6c200;\n  border-left: 4px solid #e6a700;\n  background: #fff8e1;\n  border-radius: 6px;\n  font: 13px/1.45 -apple-system, \"Segoe UI\", Roboto, Arial, sans-serif;\n  color: #6b4e00;\n  max-width: 980px;\n  box-sizing: border-box;\n}\n#sd-rating-warn .sd-x {\n  position: absolute; top: 6px; right: 8px;\n  border: none; background: transparent; cursor: pointer;\n  font-size: 18px; line-height: 1; color: #8a6d00; opacity: .6;\n}\n#sd-rating-warn .sd-x:hover { opacity: 1; }\n#sd-rating-warn .sd-rw-top { font-weight: 600; color: #b36b00; }\n\n/* ---- Скрипт у банері ризикового клієнта ---- */\n#sd-rating-warn .sd-rw-script { margin-top: 8px; }\n#sd-rating-warn .sd-rw-block { padding: 6px 0; border-top: 1px dashed #ecd9a0; }\n#sd-rating-warn .sd-rw-label {\n  display: flex; align-items: center; gap: 8px; flex-wrap: wrap;\n  font-weight: 600; color: #8a5a00; margin-bottom: 2px;\n}\n#sd-rating-warn .sd-rw-copy {\n  border: 1px solid #d9b85a; background: #fff; color: #8a5a00;\n  border-radius: 4px; padding: 1px 7px; font-size: 11px; cursor: pointer; line-height: 1.5;\n}\n#sd-rating-warn .sd-rw-copy:hover { background: #fff3d6; }\n#sd-rating-warn .sd-rw-text { color: #5a4400; }\n\n/* ---- Ціна супутнього (блок у правій колонці, за джерелом заявки) ---- */\n#sd-upsell-hint .sd-price{\n  background:#E8F0FE; border:1px solid #BBD3F5; border-radius:8px;\n  text-align:center; padding:6px 8px; box-sizing:border-box;\n}\n#sd-upsell-hint .sd-price-lab{ font-size:11px; color:#4d6285; line-height:1.25; }\n#sd-upsell-hint .sd-price-val{ font-size:21px; font-weight:800; color:#14418f; line-height:1.15; white-space:nowrap; }\n\n/* ---- Сховати наші банери, поки відкрите модальне вікно ---- */\nhtml.sd-modal-open #sd-upsell-hint,\nhtml.sd-modal-open #sd-price-warn,\nhtml.sd-modal-open #sd-rating-warn,\nhtml.sd-modal-open .sd-ttn-box { display: none !important; }\n\n/* ---- Банер «ТТН змінено» (Rozetka/Refort) ---- */\n.sd-ttn-box {\n  position: relative;\n  margin: 10px 0;\n  padding: 10px 34px 10px 12px;\n  border: 1px solid #e67e22;\n  border-left: 4px solid #d35400;\n  background: #fff3e0;\n  border-radius: 6px;\n  font: 13px/1.45 -apple-system, \"Segoe UI\", Roboto, Arial, sans-serif;\n  color: #7a3d00;\n  max-width: 980px;\n  box-sizing: border-box;\n}\n.sd-ttn-box .sd-x {\n  position: absolute; top: 6px; right: 8px;\n  border: none; background: transparent; cursor: pointer;\n  font-size: 18px; line-height: 1; color: #b35900; opacity: .6;\n}\n.sd-ttn-box .sd-x:hover { opacity: 1; }\n.sd-ttn-box .sd-tw-top { font-weight: 700; color: #c0392b; margin-bottom: 4px; }\n.sd-ttn-box .sd-tw-info {\n  font-weight: 600; margin-bottom: 3px;\n  font-family: ui-monospace, \"SFMono-Regular\", Menlo, Consolas, monospace;\n}\n.sd-ttn-box .sd-tw-why { color: #8a5a2b; margin-bottom: 8px; }\n.sd-ttn-box .sd-tw-ack {\n  cursor: pointer; border: 1px solid #d35400; background: #fff;\n  color: #c0392b; font-weight: 600; padding: 5px 12px; border-radius: 5px; font-size: 12px;\n}\n.sd-ttn-box .sd-tw-ack:hover { background: #fde9d6; }\n\n/* kb.css */\n/* База знань — плаваюча кнопка + панель */\n#sd-kb-btn{\n  position:fixed; right:20px; bottom:20px; z-index:2147483600;\n  padding:11px 16px; border:none; border-radius:24px;\n  background:#1565C0; color:#fff; font-family:Arial, sans-serif;\n  font-size:14px; font-weight:700; cursor:pointer;\n  box-shadow:0 3px 12px rgba(0,0,0,.28);\n}\n#sd-kb-btn:hover{background:#0D47A1}\n#sd-kb-btn:active{transform:translateY(1px)}\n\n#sd-kb-panel{\n  position:fixed; right:20px; bottom:74px; z-index:2147483601;\n  width:400px; max-width:calc(100vw - 40px); max-height:72vh;\n  display:flex; flex-direction:column;\n  background:#fff; border:1px solid #d9d9d9; border-radius:12px;\n  box-shadow:0 10px 34px rgba(0,0,0,.30);\n  font-family:Arial, sans-serif; color:#222; overflow:hidden;\n  animation:sdkbpop .16s ease-out;\n}\n@keyframes sdkbpop{from{transform:translateY(8px);opacity:.4}to{transform:translateY(0);opacity:1}}\n\n#sd-kb-panel .sd-kb-head{\n  display:flex; align-items:center; justify-content:space-between;\n  padding:12px 14px; background:#1565C0; color:#fff;\n}\n#sd-kb-panel .sd-kb-title{font-size:15px; font-weight:700}\n#sd-kb-panel .sd-kb-x{\n  border:none; background:none; color:#fff; font-size:24px; line-height:1;\n  cursor:pointer; padding:0 4px;\n}\n#sd-kb-panel .sd-kb-x:hover{opacity:.8}\n\n#sd-kb-search{\n  margin:10px 12px 6px 12px; padding:9px 12px; box-sizing:border-box;\n  border:1px solid #cfcfcf; border-radius:8px; font-size:14px;\n  font-family:Arial, sans-serif; outline:none;\n}\n#sd-kb-search:focus{border-color:#1565C0}\n\n#sd-kb-list{\n  flex:1 1 auto; overflow-y:auto; padding:4px 12px 14px 12px;\n}\n\n#sd-kb-list .sd-kb-cat{\n  font-size:12px; font-weight:700; text-transform:uppercase;\n  letter-spacing:.4px; color:#1565C0; margin:14px 2px 6px 2px;\n}\n#sd-kb-list .sd-kb-cat:first-child{margin-top:6px}\n\n#sd-kb-list .sd-kb-card{\n  border:1px solid #e6e6e6; border-radius:9px; margin-bottom:8px;\n  overflow:hidden; background:#fafafa;\n}\n#sd-kb-list .sd-kb-card-head{\n  display:flex; align-items:center; justify-content:space-between;\n  gap:10px; padding:10px 12px; cursor:pointer;\n}\n#sd-kb-list .sd-kb-card-head:hover{background:#f0f4fb}\n#sd-kb-list .sd-kb-card-title{font-size:14px; font-weight:600; color:#222; line-height:1.35}\n#sd-kb-list .sd-kb-caret{color:#888; font-size:13px; flex:0 0 auto}\n\n#sd-kb-list .sd-kb-card-body{padding:0 12px 12px 12px}\n#sd-kb-list .sd-kb-card-text{\n  font-size:14px; line-height:1.55; color:#333; white-space:pre-wrap;\n  overflow-wrap:anywhere; margin-bottom:10px;\n}\n#sd-kb-list .sd-kb-copy{\n  padding:8px 14px; border:none; border-radius:7px;\n  background:#2E7D32; color:#fff; font-size:13px; font-weight:700;\n  cursor:pointer; font-family:Arial, sans-serif;\n}\n#sd-kb-list .sd-kb-copy:hover{background:#256628}\n#sd-kb-list .sd-kb-copy:active{transform:translateY(1px)}\n#sd-kb-list .sd-kb-copy.sd-kb-copied{background:#9e9e9e}\n\n#sd-kb-list .sd-kb-msg{font-size:14px; color:#666; padding:14px 4px; line-height:1.5}\n#sd-kb-list .sd-kb-err{color:#b00020}\n#sd-kb-list .sd-kb-retry{\n  display:inline-block; margin-left:4px; padding:5px 10px; border:1px solid #b00020;\n  background:#fff; color:#b00020; border-radius:6px; font-size:13px; cursor:pointer;\n  font-family:Arial, sans-serif;\n}\n";
      (document.head || document.documentElement).appendChild(__sdStyle);
    } catch (e) { console.log("[SalesDrive] не вдалося додати стилі:", e); }
  })();


  // ====== карта-запас (вбудована, як у upsell_map.js) ======

var UPSELL_MAP_DATA = [
 {
  "k": "мішок для пилососа samsung багат",
  "a": "Мішок для пилососа Samsung багаторазовий VT-50 DJ69-00420B",
  "c": "Передмоторний фільтр для пилососа Samsung SC4180 DJ63-00539A",
  "sku": "104",
  "c2": "Тримач мішка для пилососу Samsung DJ61-00935A",
  "s": "До цього зазвичай беруть «Передмоторний фільтр для пилососа Samsung SC4180 DJ63-00539A». Додати одразу, щоб не замовляти окремо й не платити ще раз за доставку?"
 },
 {
  "k": "набір фільтрів для пилососа thom",
  "a": "Набір фільтрів для пилососа Thomas Twin Tiger T2 T1 Genius Овал (787203)",
  "c": "HEPA фільтр для пилососа Thomas",
  "sku": "106",
  "c2": "Набір фільтрів мотора HEPA (2 шт) для пилососа Thomas",
  "s": "До цього зазвичай беруть «HEPA фільтр для пилососа Thomas». Додати одразу, щоб не замовляти окремо й не платити ще раз за доставку?"
 },
 {
  "k": "ніж для м'ясорубки zelmer №8 дво",
  "a": "Ніж для м'ясорубки Zelmer №8 двосторонній 632543 86.3109 (ZMMA128X)",
  "c": "Муфта, втулка для м'ясорубки Zelmer та Bosch",
  "sku": "061",
  "c2": "Шнек для м'ясорубки Zelmer двостороннього ножа №8",
  "s": "До цього зазвичай беруть «Муфта, втулка для м'ясорубки Zelmer та Bosch». Додати одразу, щоб не замовляти окремо й не платити ще раз за доставку?"
 },
 {
  "k": "муфта, втулка для м'ясорубки zel",
  "a": "Муфта, втулка для м'ясорубки Zelmer та Bosch 86.1203, 00792328 (3шт)",
  "c": "Ніж для м'ясорубки Zelmer №8 двосторонній",
  "sku": "040",
  "c2": "Ніж для м'ясорубки Zelmer #8 двосторонній ZMMA028X (A863109.00)",
  "s": "До цього зазвичай беруть «Ніж для м'ясорубки Zelmer №8 двосторонній». Додати одразу, щоб не замовляти окремо й не платити ще раз за доставку?"
 },
 {
  "k": "фільтр для пилососа karcher 6.41",
  "a": "Фільтр для пилососа Karcher 6.414-552.0",
  "c": "Мішок для пилососа Karcher",
  "sku": "164",
  "c2": "Мішки для пилососу Karcher",
  "s": "До цього зазвичай беруть «Мішок для пилососа Karcher». Додати одразу, щоб не замовляти окремо й не платити ще раз за доставку?"
 },
 {
  "k": "набір фільтрів для пилососа thom",
  "a": "Набір фільтрів для пилососа Thomas XT/XS 787241",
  "c": "HEPA фільтр для пилососа Thomas",
  "sku": "134",
  "c2": "Мішки для пилососу Thomas",
  "s": "До цього зазвичай беруть «HEPA фільтр для пилососа Thomas». Додати одразу, щоб не замовляти окремо й не платити ще раз за доставку?"
 },
 {
  "k": "корпус терок + защолка для м'ясо",
  "a": "Корпус терок + защолка для м'ясорубки Zelmer 986.7001 + 986.7002",
  "c": "Защолка корпусу-тримача терок Zelmer 986.7002",
  "sku": "231",
  "c2": "Барабан-терка для м'ясорубки Zelmer",
  "s": "До цього зазвичай беруть «Защолка корпусу-тримача терок Zelmer». Додати одразу, щоб не замовляти окремо й не платити ще раз за доставку?"
 },
 {
  "k": "щітка для пилососа універсальна ",
  "a": "Щітка для пилососа універсальна паркетна D=30-37 мм",
  "c": "Мішок багаторазовий для пилососа LG",
  "sku": "013",
  "c2": "",
  "s": "До цього зазвичай беруть «Мішок багаторазовий для пилососа LG». Додати одразу, щоб не замовляти окремо й не платити ще раз за доставку?"
 },
 {
  "k": "ріжучий блок і сітка для електро",
  "a": "Ріжучий блок і сітка для електробритв Braun 10B",
  "c": "Бриючий блок і сітка для бритви Braun 32B",
  "sku": "020",
  "c2": "",
  "s": "До цього зазвичай беруть «Бриючий блок і сітка для бритви Braun 32B». Додати одразу, щоб не замовляти окремо й не платити ще раз за доставку?"
 },
 {
  "k": "харчове мастило для кухонної тех",
  "a": "Харчове мастило для кухонної техніки MOL Food Grease 2 (NLGI2) 50 мл",
  "c": "Набір шестерень для м'ясорубок Zelmer (187.0003",
  "sku": "210",
  "c2": "",
  "s": "До цього зазвичай беруть «Набір шестерень для м'ясорубок Zelmer (187.0003». Додати одразу, щоб не замовляти окремо й не платити ще раз за доставку?"
 },
 {
  "k": "мішки для пилососа s-bag clasic ",
  "a": "Мішки для пилососа S-bag Clasic long performance (4шт)",
  "c": "Комплект фільтрів для пилососа Philips",
  "sku": "01583",
  "c2": "Фільтр для пилососа Philips EFS1W",
  "s": "До цього зазвичай беруть «Комплект фільтрів для пилососа Philips». Додати одразу, щоб не замовляти окремо й не платити ще раз за доставку?"
 },
 {
  "k": "мішок багаторазовий для пилососа",
  "a": "Мішок багаторазовий для пилососа LG 5231FI2308C",
  "c": "Мішок для пилососа Samsung багаторазовий VT-50 DJ69-00420B",
  "sku": "122",
  "c2": "Універсальний фільтр для пилососа (200 х 140мм)",
  "s": "До цього зазвичай беруть «Мішок для пилососа Samsung багаторазовий VT-50 DJ69-00420B». Додати одразу, щоб не замовляти окремо й не платити ще раз за доставку?"
 },
 {
  "k": "ніж двосторонній для м'ясорубки ",
  "a": "Ніж двосторонній для м'ясорубки Zelmer №5 86.1009 (нержавіюча сталь)",
  "c": "Шнек для м'ясорубки Zelmer №5",
  "sku": "0287",
  "c2": "Решітка для м'ясорубки Zelmer №5 (середня)",
  "s": "До цього зазвичай беруть «Шнек для м'ясорубки Zelmer №5». Додати одразу, щоб не замовляти окремо й не платити ще раз за доставку?"
 },
 {
  "k": "ручка дверей для холодильника су",
  "a": "Ручка дверей для холодильника сумісна із Liebherr 743067000",
  "c": "Комплект заглушок (накладок) для ручки для холодильника Liebherr",
  "sku": "02595",
  "c2": "",
  "s": "До цього зазвичай беруть «Комплект заглушок (накладок) для ручки для холодильника Liebherr». Додати одразу, щоб не замовляти окремо й не платити ще раз за доставку?"
 },
 {
  "k": "комплект фільтрів для пилососа p",
  "a": "Комплект фільтрів для пилососа Philips 900167768 + 432200039731",
  "c": "Мішок -пилозбірник для пилососа Philips s-bag (многоразовий)",
  "sku": "0691",
  "c2": "Мішки для пилососа S-bag Clasic long performance (4шт)",
  "s": "До цього зазвичай беруть «Мішок -пилозбірник для пилососа Philips s-bag (многоразовий)». Додати одразу, щоб не замовляти окремо й не платити ще раз за доставку?"
 },
 {
  "k": "набір фільтрів для пилососа sams",
  "a": "Набір фільтрів для пилососа Samsung DJ97-00492A+DJ97-01159A",
  "c": "Фільтр двигуна для пилососу Samsung DJ63-00599A SC6500",
  "sku": "146",
  "c2": "Фільтр для пилососу Samsung DJ97-01159A",
  "s": "До цього зазвичай беруть «Фільтр двигуна для пилососу Samsung DJ63-00599A SC6500». Додати одразу, щоб не замовляти окремо й не платити ще раз за доставку?"
 },
 {
  "k": "щітка для пилососа килимова d=32",
  "a": "Щітка для пилососа килимова D=32 mm",
  "c": "Труба телескоп для пилососа Ø 32мм",
  "sku": "206",
  "c2": "",
  "s": "До цього зазвичай беруть «Труба телескоп для пилососа Ø 32мм». Додати одразу, щоб не замовляти окремо й не платити ще раз за доставку?"
 },
 {
  "k": "мішки для пилососу karcher 6.959",
  "a": "Мішки для пилососу Karcher 6.959-130.0 5шт.",
  "c": "Фільтр для пилососа Karcher",
  "sku": "0128",
  "c2": "Мішок для пилососа Karcher",
  "s": "До цього зазвичай беруть «Фільтр для пилососа Karcher». Додати одразу, щоб не замовляти окремо й не платити ще раз за доставку?"
 },
 {
  "k": "комплект підшипників для прально",
  "a": "Комплект підшипників для пральної машини Electrolux Zanussi EBI COD.098 + COD.099 (6203 - 2Z)",
  "c": "Амортизатори для пральної машини Electrolux",
  "sku": "01439",
  "c2": "",
  "s": "До цього зазвичай беруть «Амортизатори для пральної машини Electrolux». Додати одразу, щоб не замовляти окремо й не платити ще раз за доставку?"
 },
 {
  "k": "шнек для м'ясорубки zelmer двост",
  "a": "Шнек для м'ясорубки Zelmer двостороннього ножа №8 86.3140 12000524",
  "c": "Ніж для м'ясорубки Zelmer №8 двосторонній",
  "sku": "040",
  "c2": "",
  "s": "До цього зазвичай беруть «Ніж для м'ясорубки Zelmer №8 двосторонній». Додати одразу, щоб не замовляти окремо й не платити ще раз за доставку?"
 },
 {
  "k": "комплект фільтрів для пилососа s",
  "a": "Комплект фільтрів для пилососа Samsung DJ97-01040C+DJ63-00672D",
  "c": "Вхідний фільтр для пилососа Samsung DJ63-00671A",
  "sku": "0324",
  "c2": "",
  "s": "До цього зазвичай беруть «Вхідний фільтр для пилососа Samsung DJ63-00671A». Додати одразу, щоб не замовляти окремо й не платити ще раз за доставку?"
 }
];


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

  // запит залишків + фото у page-context для всіх супутніх одразу
  function requestStock(slots) {
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
  setInterval(syncModalClass, 300);
  syncModalClass();

  // тягнемо карту з таблиці при завантаженні сторінки
  requestSheet(false);

  console.log("[SalesDrive Допродаж] активний. Якорів у вбудованій карті:", GROUPS.length);
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
          console.log("[SalesDrive База знань] записів:", rows.length, "(джерело:", resp.source + ")");
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
                  vm.addOption(true);
                  var a0 = (vm.items || []).length;
                  if (a0 > b0) { vm.items[a0 - 1].preSale = 1; fixRozPrice(vm.items[a0 - 1]); added = true; return; }
                  try { vm.addAttribute = {}; } catch (e) {} // не зафіксувати "хвіст" нижче
                }
                // якщо лежить ІНШИЙ товар (якір із пошуку) — зафіксувати його нормально
                if (vm.addAttribute && vm.addAttribute.productId) vm.addOption();

                var before = (vm.items || []).length;
                vm.addItemChangeAutoComplete(item, item, label);
                if (!vm.addAttribute || !vm.addAttribute.productId) vm.addAttribute = item;
                vm.addOption(true);
                var after = (vm.items || []).length;
                if (after > before) { vm.items[after - 1].preSale = 1; fixRozPrice(vm.items[after - 1]); added = true; }
              });
            } catch (e) {}
            return added;
          }

          // перша спроба одразу; якщо холодний рядок не додав — ще кілька спроб із паузою,
          // щоб користувачу вистачало ОДНОГО кліку (розігрів робимо самі)
          if (attemptAdd()) return setResult(true, "ok-1");
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
              if (attemptAdd()) return setResult(true, "ok-" + (i + 2));
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

  setInterval(function () { pushOrder(); pushWarn(); }, 2000);
  setTimeout(function () { pushOrder(); pushWarn(); }, 800);
  window.addEventListener("hashchange", function () {
    _vmCache = null;        // інша заявка — viewModel може бути інший
    lastOrderSig = "";      // примусово переоцінити склад заявки
    lastWarnSig = "";
    setTimeout(function () { pushOrder(); pushWarn(); }, 500);
    setTimeout(function () { pushOrder(); pushWarn(); }, 1200);
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

/* ===== Набори: позначка «входить у набори» в рядках заявки (джерело: баркод) ===== */
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

  async function ensureData() {
    if (comp2kits || loading) return;
    try { const c = GM_getValue('lknb_cache2', null); if (c) { const o = JSON.parse(c); if (Date.now() - o.ts < TTL_MS && o.kits) { comp2kits = build(o.kits); return; } } } catch (_) {}
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
      const codeHtml = '<a class="lk" data-sku="' + esc(k.code) + '" href="' + CAT_URL(k.code) + '" target="_blank" rel="noopener">' + esc(k.code) + '</a>';
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
    new MutationObserver(scanSoon).observe(document.body, { childList: true, subtree: true });
  })();
})();


/* ===== Картка товару (модалка): рядок «Входить у набори» (джерело: баркод, ключ — ID) ===== */
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
  function build(kitsObj) {
    const m = new Map();
    for (const kitSku of Object.keys(kitsObj || {})) {
      const info = kitsObj[kitSku] || {};
      for (const c of (info.comps || [])) {
        const cid = norm(c.id);
        if (!cid) continue;
        if (!m.has(cid)) m.set(cid, []);
        m.get(cid).push({ code: kitSku, name: info.name || '', id: info.id || '' });
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

  async function ensureData() {
    if (id2kits || loading) return;
    try { const c = GM_getValue(CACHE_KEY, null); if (c) { const o = JSON.parse(c); if (Date.now() - o.ts < TTL_MS && o.kits) { id2kits = build(o.kits); return; } } } catch (_) {}
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
      h += '<div class="r"><a class="lk" data-sku="' + esc(k.code) + '" href="' + CAT_URL(k.code) +
           '" target="_blank" rel="noopener">' + esc(k.code) + '</a>' + edit +
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

    const kits = id2kits.get(id) || [];
    if (!kits.length) return;                                        // не входить у жоден набір — рядка немає

    idRow.outer.insertAdjacentElement('afterend', buildRow(kits, id));
  }

  let t = null;
  function scanSoon() { clearTimeout(t); t = setTimeout(process, 200); }

  (async function init() {
    await ensureData();
    process();
    new MutationObserver(scanSoon).observe(document.body, { childList: true, subtree: true });
  })();
})();

/* ===== Новий вигляд картки допродажу: скрипт-репліка = головний акцент ===== */
(function lkUpsellRedesign() {
  'use strict';
  var css = ''
    + '#sd-upsell-hint{padding-top:30px !important}'
    + '#sd-upsell-hint .sd-item{gap:10px 14px}'
    + '#sd-upsell-hint .sd-name{font-size:12.5px;font-weight:700;letter-spacing:.2px;'
    + '  color:#6b5e2a;line-height:1.3;margin-bottom:0;text-transform:uppercase}'
    + '#sd-upsell-hint .sd-say{display:inline-block;font-size:11px;font-weight:800;'
    + '  letter-spacing:.5px;text-transform:uppercase;color:#2E7D32;margin:2px 0 3px 0}'
    + '#sd-upsell-hint .sd-say::before{content:"💬 "}'
    + '#sd-upsell-hint .sd-script{font-size:16.5px;font-weight:600;line-height:1.5;color:#16240f;'
    + '  background:#ffffff;border:1px solid #bfe0c1;border-left:5px solid #2E7D32;'
    + '  border-radius:9px;padding:11px 14px;overflow-wrap:anywhere;'
    + '  box-shadow:0 1px 4px rgba(46,125,50,.12)}';
  var st = document.createElement('style');
  st.textContent = css;
  (document.head || document.documentElement).appendChild(st);
})();

/* ===== Банер: передоплатна оплата + малий залишок → перевір склад ===== */
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
  setInterval(evaluate, 1500);        // ловить зміну способу оплати
  setTimeout(evaluate, 800);
})();

/* ===== 💰 Каса самовивозу — день / тиждень / місяць / період ===== */
(function lkCashRegister(){
  'use strict';

  var API_KEY   = '9yC3JYj4MlYitQ8J3KUf-uy_qPDYkFzwoITQSUeiWEDMZntbQ4uj0NxNcHrqAg8VAB6wDmkdXJZ1LMFgnQbuivTSrzutQbVB66wN';
  var ORDERS    = '/api/order/list/';
  var CASHORD   = '/document-cash-order/index/';
  var STATUS_ID = 5;     // Оплачено САМОВИВІЗ
  var CASH_ID   = 44;    // Готівкою 💵
  var CARD_ID   = 100;   // Термінал 💳
  var CHECK_KEY = 'Bfmy2OEwDnw022CI7GACrjwHOTLgyyZomtZOnTg-zLv3x_lsPTxiGSs6rFxQwAiWHWVqyYvH0JJYNgV2gJ2u14nnZMx8yMlBEI7E';
  var CHECKS    = '/api/check/list/';   // фіскальні чеки
  var BARCODE_URL   = 'https://barcode-printer-production-2b32.up.railway.app';
  var BARCODE_TOKEN = 'nab_8Kx2pQ7mLr4tW9vZ';

  function pad(n){ return n<10?'0'+n:''+n; }
  function ymd(d){ return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate()); }
  function fmt(n){ return Number(n||0).toLocaleString('uk-UA',{minimumFractionDigits:2,maximumFractionDigits:2})+' ₴'; }
  function num(v){ var m=String(v==null?'':v).replace(',','.').match(/-?[\d.]+/); return m?parseFloat(m[0]):0; }
  function sleep(ms){ return new Promise(function(r){ setTimeout(r,ms); }); }
  function dstr(d){ return d.split('-').reverse().join('.'); }
  function startOfDay(d){ var x=new Date(d); x.setHours(0,0,0,0); return x; }

  // режим: 'day' | 'week' | 'month' | 'range'
  var mode='day';
  var anchor=new Date();           // опорна дата для day/week/month
  var rangeFrom=null, rangeTo=null;// для 'range' (рядки ymd)

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
  async function getBaseline(){
    try{ var t=await gmGet(BARCODE_URL+'/api/cash-baseline?token='+encodeURIComponent(BARCODE_TOKEN));
      var d=JSON.parse(t); return d&&d.ok?d.baseline:null; }catch(e){ return null; }
  }
  async function setBaseline(amount,pin){
    var body={amount:amount,date:ymd(new Date()),by:'',pin:pin};
    var t=await gmPost(BARCODE_URL+'/api/cash-baseline?token='+encodeURIComponent(BARCODE_TOKEN),body);
    var d=JSON.parse(t); if(!d.ok) throw new Error(d.error||'err'); return d.baseline;
  }

  /* ---- продажі ---- */
  function payId(o){ var v=o.payment_method!=null?o.payment_method:(o.paymentMethod!=null?o.paymentMethod:o.payment_method_id);
    var m=String(v==null?'':v).match(/(\d+)/); return m?parseInt(m[1],10):null; }
  function amount(o){ return num(o.paymentAmount!=null?o.paymentAmount:o.restPay); }
  function payDate(o){ return String(o.paymentDate||'').slice(0,10); }
  function clientName(o){ var c=(o.contacts&&o.contacts[0])||o;
    var n=[c.lName||c.lname||'',c.fName||c.fname||''].join(' ').trim(); return n||('№'+o.id); }
  async function fetchOrders(from,to){
    var page=1,all=[],guard=0;
    while(guard++<40){
      var url=ORDERS+'?page='+page+'&limit=100&filter[statusId]='+STATUS_ID
        +'&filter[paymentDate][from]='+from+'&filter[paymentDate][to]='+to;
      var r; try{ r=await fetch(url,{headers:{'Form-Api-Key':API_KEY,'Accept':'application/json'}}); }catch(e){ break; }
      if(r.status===400){ await sleep(65000); continue; }
      var j=await r.json().catch(function(){return {};});
      var arr=j.data||j.orders||[]; all=all.concat(arr);
      if(arr.length<100) break; page++; await sleep(6500);
    }
    return all;
  }

  /* ---- фіскальні чеки за період → множина order.id з чеком (done) ---- */
  async function fetchChecks(from,to){
    var set=new Set(), page=1, guard=0;
    var ff=from+' 00:00:00', tt=to+' 23:59:59';
    while(guard++<10){
      var url=CHECKS+'?page='+page+'&limit=100'
        +'&filter[date][from]='+encodeURIComponent(ff)
        +'&filter[date][to]='+encodeURIComponent(tt);
      var r; try{ r=await fetch(url,{headers:{'Form-Api-Key':CHECK_KEY,'Accept':'application/json'}}); }catch(e){ break; }
      if(r.status===400){ await sleep(65000); continue; }
      var j=await r.json().catch(function(){return {};});
      var arr=j.data||[];
      arr.forEach(function(c){ var oid=c.order&&c.order.id; if(oid && c.fiscalizationStatus==='done') set.add(String(oid)); });
      var pg=j.pagination||{};
      if(arr.length<100) break;
      if(pg.currentPage && pg.pageCount && pg.currentPage>=pg.pageCount) break;
      page++; await sleep(6500);
    }
    return set;
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
        items.push({date:dt,amount:a,comment:String(o.comment||'').trim(),number:o.number});
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
    +'#lk-cash-day-sum .lbl{font-size:13px;color:#444}'
    +'#lk-cash-day-sum .val{font-size:18px;font-weight:800}'
    +'#lk-cash-day-sum .cnt{font-size:11px;color:#888;font-weight:400}'
    +'#lk-cash-out-list{padding:0 16px}'
    +'#lk-cash-out-list .it{display:flex;justify-content:space-between;gap:8px;padding:6px 12px;font-size:13px;border-bottom:1px dashed #f0d4cc}'
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
    +'#lk-cash-day-sum .row.card.warn{background:#fff7e6;border-color:#f0c36d}'
    +'#lk-cash-day-sum .nochk{color:#b9770e}'
    +'#lk-cash-adj{margin:4px 16px 16px;padding:9px;border:1px dashed #ccc;border-radius:9px;text-align:center;font-size:13px;color:#666;cursor:pointer}'
    +'#lk-cash-adj:hover{background:#fafafa}'
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

  async function render(){
    var box=document.getElementById('lk-cash-box'); if(!box) return;
    syncModeUI();
    if(mode==='range' && !(rangeFrom&&rangeTo)){
      box.querySelector('#lk-cash-body').innerHTML='<div style="padding:18px 16px;color:#888;font-size:14px">Оберіть дати «від» і «до» та натисніть «Показати».</div>';
      return;
    }
    var span=currentSpan();
    box.querySelector('#lk-cash-span').textContent=span.label;
    box.querySelector('#lk-cash-body').innerHTML='<div id="lk-cash-load">Рахую…</div>';

    var base=await getBaseline();
    if(!base){
      box.querySelector('#lk-cash-body').innerHTML=
        '<div style="padding:18px 16px;color:#555;font-size:14px;line-height:1.5">Стартовий залишок каси ще не задано.<br>Порахуйте готівку в коробці й натисніть нижче.</div>'
        +'<div id="lk-cash-adj">➕ Задати поточний залишок каси</div>';
      box.querySelector('#lk-cash-adj').onclick=adjust; return;
    }
    var bdate=String(base.date).slice(0,10);

    // Залишок завжди накопичувально від стартової точки до КІНЦЯ періоду
    var balFrom=bdate, balTo=span.to;
    var balanceTxt;
    if(span.to<bdate){
      balanceTxt='<div style="padding:2px 16px 8px;color:#999;font-size:13px">Період раніше за стартову точку каси ('+dstr(bdate)+') — залишок не рахується.</div>';
    } else {
      var balOrders=await fetchOrders(balFrom,balTo);
      var balOut=await fetchOutcoming(balFrom,balTo);
      var cashCum=0; balOrders.forEach(function(o){ if(payId(o)===CASH_ID) cashCum+=amount(o); });
      var balance=num(base.amount)+cashCum-balOut.sum;
      balanceTxt='<div id="lk-cash-bal"><span class="l">💰 Готівка в касі<br><span class="sub">станом на '+dstr(span.to)+'</span></span><span class="v">'+fmt(balance)+'</span></div>';
    }

    // Обороти за вибраний період
    var orders=await fetchOrders(span.from,span.to);
    var out=await fetchOutcoming(span.from,span.to);
    var checks=await fetchChecks(span.from,span.to);
    var pCash=0,pCashN=0,pCard=0,pCardN=0,rows=[],noCheckN=0;
    orders.forEach(function(o){
      var p=payId(o), a=amount(o), d=payDate(o);
      if(p===CASH_ID){ pCash+=a; pCashN++; } else if(p===CARD_ID){ pCard+=a; pCardN++; } else return;
      var ic=p===CASH_ID?'💵':'💳';
      var dd=(span.from!==span.to)?'<span class="dt">'+dstr(d)+'</span>':'';
      var badge='';
      if(p===CARD_ID){ if(checks.has(String(o.id))) badge=' <span class="chk ok" title="Чек є">✅</span>'; else { badge=' <span class="chk no">⚠️ без чека</span>'; noCheckN++; } }
      rows.push('<a href="/ua/index.html?formId=1#/order/update/'+o.id+'"><span class="nm">'+dd+ic+' №'+o.id+' · '+clientName(o)+badge+'</span><span class="am">'+fmt(a)+'</span></a>');
    });
    var multi=(span.from!==span.to);
    var outHtml='';
    if(out.items.length){
      outHtml='<div id="lk-cash-out-list">'+out.items.map(function(x){
        var dd=multi?'<span class="dt">'+dstr(x.date)+'</span>':'';
        return '<div class="it"><span class="cm">'+dd+'📤 '+(x.comment||'видаток №'+x.number)+'</span><span class="am">−'+fmt(x.amount)+'</span></div>';
      }).join('')+'</div>';
    }

    box.querySelector('#lk-cash-body').innerHTML=
      balanceTxt
      +'<div id="lk-cash-day-sum">'
      +' <div class="row cash"><span class="lbl">💵 Готівка продажі <span class="cnt">'+pCashN+' зам.</span></span><span class="val">'+fmt(pCash)+'</span></div>'
      +' <div class="row card'+(noCheckN?' warn':'')+'"><span class="lbl">💳 Термінал <span class="cnt">'+pCardN+' зам.'+(noCheckN?' · <b class="nochk">⚠️ без чека: '+noCheckN+'</b>':'')+'</span></span><span class="val">'+fmt(pCard)+'</span></div>'
      +(out.items.length?' <div class="row out"><span class="lbl">📤 Видатки <span class="cnt">'+out.items.length+' шт.</span></span><span class="val">−'+fmt(out.sum)+'</span></div>':'')
      +'</div>'
      +outHtml
      +'<div id="lk-cash-list"><div class="ttl">Замовлення за період ('+(pCashN+pCardN)+')</div>'+(rows.join('')||'<div style="color:#999;padding:6px 0">Немає</div>')+'</div>'
      +'<div id="lk-cash-adj">⚙️ Скоригувати залишок (зараз '+fmt(base.amount)+' від '+dstr(bdate)+')</div>';
    box.querySelector('#lk-cash-adj').onclick=adjust;
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
    try{ await setBaseline(n,pin); mode='day'; anchor=new Date(); await render(); }
    catch(e){
      if(/HTTP 403|bad pin/.test(e.message)) alert('Невірний PIN — залишок не змінено.');
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
     +' <div id="lk-cash-body"></div>'
     +'</div>';
    document.body.appendChild(ov);
    ov.addEventListener('click',function(e){ if(e.target===ov) ov.remove(); });
    ov.querySelector('.x').onclick=function(){ ov.remove(); };
    ov.querySelector('.rf').onclick=function(){ render(); };
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
  }

  function addBtn(){
    if(document.getElementById('lk-cash-btn')) return;
    ensureStyles();
    var b=document.createElement('button'); b.id='lk-cash-btn'; b.textContent='💰'; b.title='Каса самовивозу';
    b.onclick=function(){ mode='day'; anchor=new Date(); open(); };
    document.body.appendChild(b);
  }
  setInterval(addBtn,1500); addBtn();
})();
