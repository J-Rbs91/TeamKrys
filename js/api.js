/**
 * Communication avec le backend Google Apps Script.
 *
 * - GET  ?mode=revision  -> { revision, updatedAt }
 * - GET  ?mode=state     -> état complet
 * - POST (corps = action) -> { ok, state, revision, duplicate }
 *
 * Les requêtes POST envoient le corps en text/plain pour rester des
 * "requêtes simples" et éviter les pré-vérifications CORS d'Apps Script.
 */
const Api = (function () {
  function isConfigured() {
    return CONFIG.isConfigured();
  }

  function withMode(mode) {
    const url = CONFIG.API_URL.trim();
    return url + (url.indexOf("?") === -1 ? "?" : "&") + "mode=" + mode;
  }

  function getRevision() {
    return request(withMode("revision"), { method: "GET" });
  }

  function getState() {
    return request(withMode("state"), { method: "GET" });
  }

  function postAction(action) {
    return request(CONFIG.API_URL.trim(), {
      method: "POST",
      body: JSON.stringify(action),
      headers: { "Content-Type": "text/plain;charset=utf-8" },
    });
  }

  /**
   * Génération / relecture Gemini (dans la feuille Google Sheet).
   *   op   : "generate" (insère les formules =AI) ou "refresh" (relit)
   *   kind : "summary" ou "conclusion"
   * Renvoie { ok, revision, ai, state }.
   */
  function postAi(op, kind, topicId) {
    return request(withMode("ai"), {
      method: "POST",
      body: JSON.stringify({ op: op, kind: kind, topicId: topicId }),
      headers: { "Content-Type": "text/plain;charset=utf-8" },
    });
  }

  function request(url, options) {
    if (!isConfigured()) {
      return Promise.reject(makeError("not-configured", "API non configurée."));
    }
    return fetch(url, options)
      .then(function (res) {
        if (!res.ok) {
          throw makeError("http", "Réponse serveur : " + res.status);
        }
        return res.text();
      })
      .then(function (text) {
        let json;
        try {
          json = JSON.parse(text);
        } catch (e) {
          throw makeError("parse", "Réponse serveur illisible.");
        }
        if (json && json.ok === false) {
          throw makeError("server", json.error || "Erreur serveur.", json);
        }
        return json;
      })
      .catch(function (e) {
        if (e && e.__apiError) throw e;
        // TypeError de fetch => problème réseau
        throw makeError("network", "Connexion indisponible.");
      });
  }

  function makeError(kind, message, data) {
    const e = new Error(message);
    e.__apiError = true;
    e.kind = kind;
    if (data) e.data = data;
    return e;
  }

  return {
    isConfigured: isConfigured,
    getRevision: getRevision,
    getState: getState,
    postAction: postAction,
    postAi: postAi,
  };
})();
