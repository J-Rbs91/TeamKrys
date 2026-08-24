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

  function withTimeout(promise, controller, ms) {
    var timer = setTimeout(function () {
      try { controller.abort(); } catch (e) { /* ignoré */ }
    }, ms || CONFIG.REQUEST_TIMEOUT_MS);
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

  function send(url, options, timeoutMs) {
    var controller = new AbortController();
    var request;
    try {
      request = fetch(url, Object.assign({ signal: controller.signal, redirect: "follow" }, options));
    } catch (e) {
      return Promise.reject(apiError("network", "Requête impossible."));
    }
    return withTimeout(request, controller, timeoutMs).then(function (response) {
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

  /* ⚠️ DEUXIÈME PIÈGE APPS SCRIPT : /exec répond par une redirection 302 vers
   * script.googleusercontent.com. Une redirection sans en-tête de cache est
   * mise en cache HEURISTIQUEMENT par les navigateurs — et le client relit
   * alors éternellement la même réponse : la révision ne bouge plus, les
   * messages des autres n'arrivent jamais. « no-store » plus un paramètre
   * jetable rendent chaque appel unique. Le backend ignore les paramètres
   * qu'il ne connaît pas : rien à changer côté script. */
  function nocache(params) {
    params._ = Date.now().toString(36);
    return params;
  }

  /* Léger : appelé en boucle. */
  Api.getRevision = function (baseUrl, token) {
    return send(buildUrl(baseUrl, nocache({ mode: "revision", auth: token || "" })),
      { method: "GET", cache: "no-store" });
  };

  /* Lourd : appelé uniquement quand la révision a changé. */
  Api.getState = function (baseUrl, token) {
    return send(buildUrl(baseUrl, nocache({ mode: "state", auth: token || "" })),
      { method: "GET", cache: "no-store" });
  };

  /* Lecture CONDITIONNELLE : le client annonce la révision qu'il détient et le
   * serveur ne renvoie l'état que si elle a bougé. Un seul aller-retour au lieu
   * de deux — c'est la moitié du délai de réception d'un message. Réservé aux
   * serveurs qui annoncent la capacité « since » (voir Sync.supports). */
  Api.getStateSince = function (baseUrl, token, since) {
    return send(buildUrl(baseUrl, nocache({
      mode: "state", auth: token || "", since: String(since)
    })), { method: "GET", cache: "no-store" });
  };

  Api.postAction = function (baseUrl, token, action) {
    return send(buildUrl(baseUrl, { auth: token || "" }), {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(action)
    }, CONFIG.WRITE_TIMEOUT_MS);
  };

  /* Envoi GROUPÉ : le serveur applique les actions dans l'ordre reçu, sur la
   * même lecture du fichier. Cinq réactions enchaînées coûtaient cinq
   * allers-retours d'environ une seconde chacun ; elles n'en coûtent plus qu'un.
   * Réservé aux serveurs qui annoncent la capacité « batch ». */
  Api.postActions = function (baseUrl, token, actions) {
    return send(buildUrl(baseUrl, { auth: token || "" }), {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(actions)
    }, CONFIG.WRITE_TIMEOUT_MS);
  };

  /* Envoi de DERNIER RECOURS, au moment où la page disparaît.
   *
   * ⚠️ C'est le correctif central. Un `fetch` ordinaire est tué avec l'onglet :
   * écrire un message puis ranger son téléphone dans la seconde suffisait à ce
   * que l'action reste en file — et plus rien ne la rejouait avant la prochaine
   * OUVERTURE de l'application, c'est-à-dire des heures, ou des jours.
   * `sendBeacon` existe exactement pour ça : le navigateur prend la requête en
   * charge et la poste même si la page n'existe plus.
   *
   * Le type « text/plain » est le même que celui des envois ordinaires : c'est
   * un type sûr au sens CORS, donc pas de préflight OPTIONS auquel Apps Script
   * ne saurait pas répondre.
   *
   * On ne saura JAMAIS si le serveur a appliqué l'action — un beacon n'a pas de
   * réponse. L'action reste donc en file et repart au prochain démarrage ; le
   * doublon est absorbé par la déduplication serveur (processedActionIds).
   * Perdre un message coûte cher, le poster deux fois ne coûte rien. */
  Api.beacon = function (baseUrl, token, body) {
    var url, text;
    try {
      url = buildUrl(baseUrl, { auth: token || "" });
      text = JSON.stringify(body);
    } catch (e) { return false; }

    var nav = root.navigator;
    if (nav && typeof nav.sendBeacon === "function" && typeof root.Blob === "function") {
      try {
        if (nav.sendBeacon(url, new root.Blob([text], { type: "text/plain;charset=utf-8" }))) {
          return true;
        }
      } catch (e) { /* file du navigateur pleine ou API refusée : on tente le repli */ }
    }

    /* Repli : « keepalive » demande au navigateur de mener la requête à son
     * terme après la disparition du document. Moins bien supporté que
     * sendBeacon, mais c'est la seule autre voie qui survive à la fermeture. */
    try {
      fetch(url, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: text,
        keepalive: true,
        redirect: "follow"
      }).catch(function () { /* sans issue observable, par construction */ });
      return true;
    } catch (e) { return false; }
  };

  root.Api = Api;
})(typeof globalThis !== "undefined" ? globalThis : this);
