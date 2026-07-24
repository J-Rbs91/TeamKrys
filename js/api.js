/* BrainstO. — accès au backend Google Apps Script.
 *
 * ⚠️ PIÈGE CORS : le POST part en « text/plain;charset=utf-8 » pour rester une
 * requête SIMPLE. Avec « application/json », le navigateur envoie un préflight
 * OPTIONS auquel Apps Script ne sait pas répondre → la requête échoue.
 * Le jeton d'authentification voyage donc en paramètre d'URL, pas en en-tête.
 */
(function (root) {
  "use strict";

  var Api = {};

  function apiError(kind, message, code) {
    var error = new Error(message);
    error.kind = kind;     // "network" | "auth" | "server"
    error.code = code || null;
    return error;
  }

  Api.isNetworkError = function (error) { return !!error && error.kind === "network"; };
  Api.isAuthError = function (error) { return !!error && error.kind === "auth"; };

  function withTimeout(promise, controller) {
    var timer = setTimeout(function () {
      try { controller.abort(); } catch (e) { /* ignoré */ }
    }, CONFIG.REQUEST_TIMEOUT_MS);
    return promise.then(
      function (value) { clearTimeout(timer); return value; },
      function (error) { clearTimeout(timer); throw error; }
    );
  }

  function buildUrl(baseUrl, params) {
    var url = String(baseUrl || "").trim();
    if (!url) { throw apiError("server", "Aucune URL de script enregistrée."); }
    var parts = [];
    Object.keys(params).forEach(function (key) {
      if (params[key] === null || params[key] === undefined) { return; }
      parts.push(encodeURIComponent(key) + "=" + encodeURIComponent(params[key]));
    });
    return url + (url.indexOf("?") >= 0 ? "&" : "?") + parts.join("&");
  }

  function parse(response) {
    return response.text().then(function (text) {
      var data;
      try { data = JSON.parse(text); }
      catch (e) {
        throw apiError("server",
          "Réponse illisible du serveur. Vérifiez que l'URL se termine par /exec " +
          "et que le déploiement est accessible à « Tout le monde ».");
      }
      if (!data || data.ok !== true) {
        var message = (data && data.error) || "Le serveur a refusé la demande.";
        var code = data && data.code ? data.code : null;
        throw apiError(code === "auth" ? "auth" : "server", message, code);
      }
      return data;
    });
  }

  function send(url, options) {
    var controller = new AbortController();
    var request;
    try {
      request = fetch(url, Object.assign({ signal: controller.signal, redirect: "follow" }, options));
    } catch (e) {
      return Promise.reject(apiError("network", "Requête impossible."));
    }
    return withTimeout(request, controller).then(function (response) {
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          throw apiError("auth", "Accès refusé par le serveur.", "auth");
        }
        throw apiError("network", "Le serveur a répondu " + response.status + ".");
      }
      return parse(response);
    }, function (error) {
      if (error && error.kind) { throw error; }
      throw apiError("network", "Connexion impossible. Vérifiez votre réseau.");
    });
  }

  /* Léger : appelé en boucle. */
  Api.getRevision = function (baseUrl, token) {
    return send(buildUrl(baseUrl, { mode: "revision", auth: token || "" }), { method: "GET" });
  };

  /* Lourd : appelé uniquement quand la révision a changé. */
  Api.getState = function (baseUrl, token) {
    return send(buildUrl(baseUrl, { mode: "state", auth: token || "" }), { method: "GET" });
  };

  Api.postAction = function (baseUrl, token, action) {
    return send(buildUrl(baseUrl, { auth: token || "" }), {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(action)
    });
  };

  root.Api = Api;
})(typeof globalThis !== "undefined" ? globalThis : this);
