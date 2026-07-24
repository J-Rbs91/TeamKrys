/* BrainstO. — utilitaires génériques (DOM, dates, hachage, stockage). */
(function (root) {
  "use strict";

  var Utils = {};

  /* ---------------------------------------------------------------- DOM --- */

  /* Crée un élément. Le contenu utilisateur passe TOUJOURS par textContent :
   * innerHTML n'est utilisé nulle part dans l'application. */
  Utils.el = function (tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (key) {
        var value = attrs[key];
        if (value === null || value === undefined || value === false) { return; }
        if (key === "class") { node.className = value; return; }
        if (key === "text") { node.textContent = String(value); return; }
        if (key === "dataset") {
          Object.keys(value).forEach(function (k) { node.dataset[k] = value[k]; });
          return;
        }
        if (key === "style" && typeof value === "object") {
          Object.keys(value).forEach(function (k) { node.style[k] = value[k]; });
          return;
        }
        if (key.slice(0, 2) === "on" && typeof value === "function") {
          node.addEventListener(key.slice(2), value);
          return;
        }
        if (value === true) { node.setAttribute(key, ""); return; }
        node.setAttribute(key, String(value));
      });
    }
    Utils.append(node, children);
    return node;
  };

  Utils.append = function (node, children) {
    if (children === null || children === undefined || children === false) { return node; }
    if (Array.isArray(children)) {
      children.forEach(function (child) { Utils.append(node, child); });
      return node;
    }
    if (children instanceof Node) { node.appendChild(children); return node; }
    node.appendChild(document.createTextNode(String(children)));
    return node;
  };

  Utils.clear = function (node) {
    while (node && node.firstChild) { node.removeChild(node.firstChild); }
    return node;
  };

  /* --------------------------------------------------------------- Dates --- */

  Utils.nowISO = function () { return new Date().toISOString(); };

  function pad(n) { return n < 10 ? "0" + n : String(n); }

  Utils.formatTime = function (iso) {
    var d = new Date(iso);
    if (isNaN(d.getTime())) { return ""; }
    return pad(d.getHours()) + ":" + pad(d.getMinutes());
  };

  Utils.formatDate = function (iso) {
    var d = new Date(iso);
    if (isNaN(d.getTime())) { return ""; }
    return d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
  };

  Utils.formatDateTime = function (iso) {
    var d = new Date(iso);
    if (isNaN(d.getTime())) { return ""; }
    return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" }) +
      " à " + pad(d.getHours()) + ":" + pad(d.getMinutes());
  };

  Utils.sameDay = function (a, b) {
    var da = new Date(a), db = new Date(b);
    return da.getFullYear() === db.getFullYear() && da.getMonth() === db.getMonth() && da.getDate() === db.getDate();
  };

  Utils.relativeDay = function (iso) {
    var d = new Date(iso);
    if (isNaN(d.getTime())) { return ""; }
    var today = new Date();
    var yesterday = new Date(today.getTime() - 86400000);
    if (Utils.sameDay(d, today)) { return "Aujourd'hui"; }
    if (Utils.sameDay(d, yesterday)) { return "Hier"; }
    return Utils.formatDate(iso);
  };

  /* ------------------------------------------------------------ Chaînes --- */

  Utils.uid = function () {
    if (root.crypto && typeof root.crypto.randomUUID === "function") {
      return root.crypto.randomUUID();
    }
    var bytes = new Uint8Array(16);
    if (root.crypto && root.crypto.getRandomValues) {
      root.crypto.getRandomValues(bytes);
    } else {
      for (var i = 0; i < 16; i++) { bytes[i] = Math.floor(Math.random() * 256); }
    }
    var hex = "";
    for (var j = 0; j < bytes.length; j++) { hex += (bytes[j] + 0x100).toString(16).slice(1); }
    return hex;
  };

  Utils.trim = function (value) { return String(value == null ? "" : value).trim(); };

  Utils.limit = function (value, max) { return Utils.trim(value).slice(0, max); };

  Utils.initials = function (name) {
    var parts = Utils.trim(name).split(/\s+/).filter(Boolean);
    if (!parts.length) { return "?"; }
    if (parts.length === 1) { return parts[0].slice(0, 2).toUpperCase(); }
    return (parts[0][0] + parts[1][0]).toUpperCase();
  };

  Utils.plural = function (count, singular, plural) {
    return count + " " + (count > 1 ? plural : singular);
  };

  /* ------------------------------------------------------------ Hachage --- */

  function toHex(buffer) {
    var view = new Uint8Array(buffer);
    var out = "";
    for (var i = 0; i < view.length; i++) { out += (view[i] + 0x100).toString(16).slice(1); }
    return out;
  }

  /* SHA-256 hexadécimal minuscule. Le backend Apps Script doit produire
   * exactement la même chaîne (attention aux octets signés côté Google). */
  Utils.sha256Hex = function (text) {
    var subtle = root.crypto && root.crypto.subtle;
    if (subtle) {
      return subtle.digest("SHA-256", new TextEncoder().encode(text)).then(toHex);
    }
    /* Repli Node (tests hors navigateur). */
    var nodeCrypto = require("crypto");
    return Promise.resolve(nodeCrypto.createHash("sha256").update(text, "utf8").digest("hex"));
  };

  /* ---------------------------------------------------------- Stockage --- */

  Utils.storage = {
    get: function (key, fallback) {
      try {
        var raw = root.localStorage.getItem(key);
        if (raw === null) { return fallback; }
        return JSON.parse(raw);
      } catch (e) { return fallback; }
    },
    set: function (key, value) {
      try { root.localStorage.setItem(key, JSON.stringify(value)); return true; }
      catch (e) { return false; }
    },
    remove: function (key) {
      try { root.localStorage.removeItem(key); } catch (e) { /* ignoré */ }
    }
  };

  /* --------------------------------------------------------------- Divers --- */

  Utils.clone = function (value) {
    return value === undefined ? value : JSON.parse(JSON.stringify(value));
  };

  Utils.debounce = function (fn, delay) {
    var timer = null;
    return function () {
      var args = arguments, self = this;
      if (timer) { clearTimeout(timer); }
      timer = setTimeout(function () { timer = null; fn.apply(self, args); }, delay);
    };
  };

  root.Utils = Utils;
  if (typeof module !== "undefined" && module.exports) { module.exports = Utils; }
})(typeof globalThis !== "undefined" ? globalThis : this);
