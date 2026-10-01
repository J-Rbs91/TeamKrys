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
    error.kind = kind;     // "network" | "auth" | "server" | "unknown"
    error.code = code || null;
    return error;
  }

  Api.isNetworkError = function (error) { return !!error && error.kind === "network"; };
  Api.isAuthError = function (error) { return !!error && error.kind === "auth"; };

  /* ⚠️ Le délai couvre l'échange ENTIER, lecture du corps comprise : des en-têtes
   * reçus suivis d'un corps qui n'arrive jamais figeaient la boucle (lecture ou
   * envoi en cours pour toujours) jusqu'au rechargement. À l'échéance on abandonne
   * la requête ET on rejette nous-mêmes : un corps sourd à abort() ne retient plus
   * rien. Comme toute coupure, le résultat est inconnu : l'action reste en file. */
  function withTimeout(promise, controller, ms) {
    return new Promise(function (resolve, reject) {
      var timer = setTimeout(function () {
        try { controller.abort(); } catch (e) { /* ignoré */ }
        reject(apiError("network", "Connexion impossible. Vérifiez votre réseau."));
      }, ms || CONFIG.REQUEST_TIMEOUT_MS);
      promise.then(
        function (value) { clearTimeout(timer); resolve(value); },
        function (error) { clearTimeout(timer); reject(error); }
      );
    });
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

  /* ⚠️ Classement des réponses : seul un REFUS (kind « server ») peut faire retirer
   * une action de la file. Contrat de Code.gs : code « invalid » = rejet de
   * validation, définitif ; « retry » = panne passagère (verrou, Drive). Une page
   * HTML, un JSON illisible, « retry » ou un code inconnu ne disent RIEN de
   * l'action (appliquée ou non) : kind « unknown », elle reste en file (§22). Un
   * refus SANS code vient d'un backend d'avant, qui répondait ainsi à une panne
   * comme à un refus : Sync ne le croit qu'après plusieurs essais. */
  function parse(text) {
    var data;
    try { data = JSON.parse(text); } catch (e) { data = null; }
    if (!data || typeof data !== "object") {
      throw apiError("unknown",
        "Réponse illisible du serveur. Vérifiez que l'URL se termine par /exec " +
        "et que le déploiement est accessible à « Tout le monde ».");
    }
    if (data.ok !== true) {
      var message = data.error ? String(data.error) : "Le serveur a refusé la demande.";
      var code = data.code ? String(data.code) : null;
      if (code === "auth") { throw apiError("auth", message, code); }
      var refusal = code === "invalid" || (code === null && data.ok === false);
      throw apiError(refusal ? "server" : "unknown", message, code);
    }
    return data;
  }

  function send(url, options, timeoutMs) {
    var controller = new AbortController();
    var request;
    try {
      request = fetch(url, Object.assign({ signal: controller.signal, redirect: "follow" }, options));
    } catch (e) {
      return Promise.reject(apiError("network", "Requête impossible."));
    }
    var exchange = Promise.resolve(request).then(function (response) {
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          throw apiError("auth", "Accès refusé par le serveur.", "auth");
        }
        throw apiError("network", "Le serveur a répondu " + response.status + ".");
      }
      /* Corps coupé en route : aucune réponse lisible, comme une coupure. */
      return response.text().then(null, function () {
        throw apiError("network", "Connexion impossible. Vérifiez votre réseau.");
      });
    }, function (error) {
      if (error && error.kind) { throw error; }
      throw apiError("network", "Connexion impossible. Vérifiez votre réseau.");
    });
    return withTimeout(exchange, controller, timeoutMs).then(parse);
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
    var blob = null;
    try {
      if (typeof root.Blob === "function") { blob = new root.Blob([text], { type: "text/plain;charset=utf-8" }); }
    } catch (e) { blob = null; }
    /* Au-delà de 64 Kio, sendBeacon comme keepalive refusent : le second en
     * silence. Mieux vaut répondre « rien n'est parti » (Sync.flush borne le corps). */
    if (blob && blob.size > 65536) { return false; }
    if (blob && nav && typeof nav.sendBeacon === "function") {
      try {
        if (nav.sendBeacon(url, blob)) {
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
