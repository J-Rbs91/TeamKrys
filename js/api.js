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
  // Jeton d'authentification (hachage du mot de passe), gardé UNIQUEMENT en
  // mémoire vive : jamais persisté, effacé au verrouillage / rechargement.
  let authToken = null;
  let onAuthErr = null;

  function setAuthToken(token) { authToken = token || null; }
  function clearAuthToken() { authToken = null; }
  function hasToken() { return !!authToken; }
  function onAuthError(fn) { onAuthErr = fn; }

  function isConfigured() {
    return CONFIG.isConfigured();
  }

  // Ajoute le paramètre d'authentification à une URL si un jeton est présent.
  function withAuth(url) {
    if (!authToken) return url;
    return url + (url.indexOf("?") === -1 ? "?" : "&") + "auth=" + encodeURIComponent(authToken);
  }

  function withMode(mode) {
    const url = CONFIG.API_URL.trim();
    return withAuth(url + (url.indexOf("?") === -1 ? "?" : "&") + "mode=" + mode);
  }

  function getRevision() {
    return request(withMode("revision"), { method: "GET" });
  }

  function getState() {
    return request(withMode("state"), { method: "GET" });
  }

  function postAction(action) {
    return request(withAuth(CONFIG.API_URL.trim()), {
      method: "POST",
      body: JSON.stringify(action),
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
          // Mot de passe requis/incorrect : on prévient l'application pour
          // qu'elle réaffiche l'écran de déverrouillage.
          if (json.code === "auth" && typeof onAuthErr === "function") {
            try { onAuthErr(); } catch (e) { /* pas bloquant */ }
          }
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
    setAuthToken: setAuthToken,
    clearAuthToken: clearAuthToken,
    hasToken: hasToken,
    onAuthError: onAuthError,
  };
})();
