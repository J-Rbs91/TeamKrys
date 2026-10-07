/* BrainstO. — rendu de l'interface.
 *
 * Trois règles structurantes :
 *  1. Le contenu utilisateur est inséré en TEXTE BRUT (helper el / textContent).
 *  2. Le rendu est recalculé seulement si la « signature » de l'écran change,
 *     sinon la frappe devient saccadée.
 *  3. Toute saisie en cours (attribut data-draft) est capturée avant le rendu
 *     et restaurée après, curseur compris : aucun texte ne doit être perdu.
 */
(function (root) {
  "use strict";

  var el = Utils.el;
  var icon = Utils.icon;
  var UI = {};

  /* Teinte associée à chaque statut : le fond pâle + la couleur saturée
   * donnent l'état avant même la lecture du mot (cf. app.css, .tone-*).
   *
   * Ces deux tables sont la couche de DÉLIBÉRATION, et elles n'emploient donc
   * que les deux voix : `tone-accord` pour ce sur quoi l'équipe a convergé,
   * `tone-voix` pour ce qui diverge encore. Le vert, le carmin et l'ocre
   * appartiennent à la couche technique — synchronisation, erreur, action
   * destructive — et n'ont rien à faire ici. Une proposition écartée n'est pas
   * une erreur : elle est neutre, pas rouge. Voir docs/IDENTITE_VISUELLE.md.
   *
   * Règle inchangée : l'état PAR DÉFAUT reste neutre. « En discussion » et
   * « En vote » concernent la quasi-totalité des éléments ; les teinter
   * saturerait toute la liste et plus rien ne ressortirait — et la divergence
   * y est déjà portée, une fois, par la barre de vote. */
  var TOPIC_TONES = {
    open: "tone-neutral",
    ready: "tone-accord",
    closed: "tone-neutral",
    archived: "tone-neutral"
  };

  var PROPOSAL_TONES = {
    voting: "tone-neutral",
    selected: "tone-accord",
    debate: "tone-voix",
    implemented: "tone-accord",
    rejected: "tone-neutral"
  };

  /* Consensus d'une proposition (Core.proposalConsensus) : "for" (acceptée par toute l'équipe), "against" (rejetée
   * par toute l'équipe) ou "". Une proposition en consensus quitte Propositions pour l'onglet Consensus. */
  function consensusOf(proposal) {
    return typeof Core.proposalConsensus === "function" ? Core.proposalConsensus(proposal, Store.view.participants) : "";
  }

  function openProposals(topic) { return topic.proposals.filter(function (p) { return !consensusOf(p); }); }
  function agreedProposals(topic) { return topic.proposals.filter(function (p) { return !!consensusOf(p); }); }

  function toneBadge(label, tone, extra) {
    return el("span", { class: "badge " + (tone || "tone-neutral") + (extra ? " " + extra : "") }, [
      el("span", { class: "dot", "aria-hidden": "true" }),
      el("span", { text: label })
    ]);
  }

  /* Surtitre de section : 11 px, capitales, très interlettré, précédé d'une
   * icône. C'est le repère de lecture verticale des écrans de réglages. */
  function sectionTitle(name, label) {
    return el("div", { class: "section-title" }, [icon(name, 14), el("span", { text: label })]);
  }

  /* Marque la position d'une carte dans sa liste : l'animation d'entrée se
   * décale de 45 ms par cran (variable --reveal-index lue par app.css). */
  function reveal(node, index) {
    node.classList.add("reveal");
    node.style.setProperty("--reveal-index", String(index));
    return node;
  }

  /* État vide : une icône, un titre, une phrase, au plus une action. Plus de ligne « Ensuite : … » (épure) : la
   * présentation initiale enseigne le cycle, l'écran ne dit que quoi faire maintenant. */
  function emptyState(iconName, title, text, action) {
    return el("div", { class: "empty" }, [
      el("div", { class: "empty-art" }, [icon(iconName, 32)]),
      el("div", { class: "empty-title", text: title }),
      text ? el("div", { class: "empty-text", text: text }) : null,
      action || null
    ]);
  }

  /* Logotype. Il monte d'un seul tenant (cf. app.css) : c'est du texte, pas une
   * suite de <span> — inutile d'en fabriquer neuf pour animer un bloc. */
  function wordmark(text, asTitle) {
    return el("div", {
      class: "wordmark", text: text,
      role: asTitle ? "heading" : null, "aria-level": asTitle ? "1" : null
    });
  }

  /* `asTitle` : l'écran n'a pas de barre du haut (première connexion, verrou) ; le nom de
   * l'application y tient lieu de titre de niveau 1 (A11-015). */
  function heroBlock(tagline, asTitle) {
    return el("div", { class: "hero" }, [
      Utils.logoMark(52),
      wordmark(CONFIG.APP_NAME, asTitle),
      el("div", { class: "tagline", text: tagline })
    ]);
  }

  /* Menu déroulant natif + chevron dessiné : le natif reste le plus fiable au
   * doigt, on lui rend seulement une flèche cohérente avec le reste. */
  function selectWrap(select, block) {
    return el("div", { class: "select-wrap" + (block ? " select-block" : "") }, [select, icon("down", 18)]);
  }

  var appRoot = null;
  var overlayRoot = null;
  var toastRoot = null;
  var onboardRoot = null;
  var lastSignature = null;
  var lastPlace = null;
  var forceNext = false;
  /* Instant de la dernière entrée sur un écran, et durée pendant laquelle un
   * rendu qui retombe au même endroit doit REPRENDRE l'animation au lieu de la
   * perdre. 1400 ms couvre la séquence la plus longue du thème — l'accueil,
   * dont la signature se pose à 1060 ms — avec de la marge. Au-delà, l'entrée est finie : un rendu tardif
   * ne doit surtout rien rejouer. */
  var enterAt = 0;
  var ENTER_WINDOW_MS = 1400;

  /* État d'interface local (jamais partagé). */
  UI.local = {
    version: 0,
    sheet: null,        // {type:…}
    modal: null,        // {type:…}
    quote: null,        // {topicId, messageId}
    search: "",
    showArchived: false,
    flashMessageId: null,
    composerAnon: false,
    scrollToBottom: false
  };

  /* Une feuille du bas et une modale sont des COUCHES posées sur l'écran, pas
   * des écrans : elles comptent chacune pour un niveau de profondeur en plus.
   * Toute ouverture empile donc une entrée d'historique et toute fermeture la
   * consomme, quel que soit le geste — bouton « Fermer », Échap, clic sur le
   * fond, ou bouton retour du téléphone. Sans cela, un appui sur retour
   * pendant qu'une modale est ouverte quitte l'écran au lieu de refermer la
   * modale, et la saisie en cours part avec.
   *
   * Le point d'interception est ici et nulle part ailleurs : les couches se
   * déclarent par l'état, et il n'existe qu'un endroit où cet état change. Le
   * contrat complet est en tête de js/app.js. */
  function couchesDe(etat) {
    return (etat.sheet ? 1 : 0) + (etat.modal ? 1 : 0);
  }

  UI.set = function (patch) {
    var avant = couchesDe(UI.local);
    Object.assign(UI.local, patch || {});
    var apres = couchesDe(UI.local);
    if (avant !== apres) { App.ajusterCouches(avant, apres); }
    UI.local.version += 1;
    UI.render();
  };

  UI.force = function () { forceNext = true; UI.render(); };

  UI.init = function () {
    appRoot = document.getElementById("app");
    overlayRoot = document.getElementById("overlay-root");
    toastRoot = document.getElementById("toast-root");
    onboardRoot = document.getElementById("onboarding-root");
    /* Zone principale : index.html (coquille précachée) n'a pas de <main> ; le rôle donne le même
     * repère au lecteur d'écran, sans toucher à la mise en page (A11-015). */
    if (appRoot && appRoot.setAttribute) { appRoot.setAttribute("role", "main"); }

    /* En capture, sur le document : les champs sont détruits et recréés à chaque rendu,
     * un écouteur par champ ne survivrait pas. `input` seulement — `change` arrive trop
     * tard, et `keydown` déclencherait sur une flèche. */
    document.addEventListener("input", function (event) {
      var node = event.target;
      if (!node || !node.getAttribute) { return; }
      var key = node.getAttribute("data-draft");
      if (key) { touchedDrafts[key] = true; }
      if (storedDraft(key)) { stageDraft(key, node.value); }
    }, true);
    /* Brouillons durables : relus de l'appareil, restaurés au premier rendu du composeur (BL-059). */
    composerDrafts = readStoredDrafts();
    anonDrafts = readStoredAnon(composerDrafts);
    draftNote = {};
    Object.keys(composerDrafts).forEach(function (key) { draftNote[key] = anonDrafts[key] ? "anon" : "check"; });

    bindViewport();
    bindBubbleGestures();
    document.addEventListener("focusin", onTypingFocus);
    document.addEventListener("focusout", onTypingFocus);
  };

  /* ------------------------------------------------------------ Brouillons --- */

  /* Avant ce relais, les brouillons ne vivaient que dans le DOM, et l'instantané ne franchit pas un
   * rendu : au reverrouillage (une heure sans interaction, CONFIG.LOCK_IDLE_MS), l'écran de verrou ne
   * contient aucun champ « composer:… », la valeur est donc jetée et le message
   * en cours d'écriture est perdu — ce que la recette annonce pourtant intact.
   * Ce relais garde les seuls brouillons de composeur d'un rendu à l'autre. */
  var composerDrafts = {};

  /* ⚠️ Choix Anonyme/Signé d'un brouillon (REC-RUI-001, arbitrage WP-22 : il REMPLACE l'ancienne règle « jamais stocké »).
   * Le choix est global et en mémoire (UI.local.composerAnon), les brouillons sont par sujet et durables : le texte voulu
   * anonyme revenait après un rechargement prêt à partir SIGNÉ, nom publié, irrattrapable. Règle asymétrique : on ne
   * convertit JAMAIS implicitement l'anonyme en signé. Un brouillon rédigé en anonyme garde ce choix sur l'appareil
   * (clé dans la liste `anon` de DRAFTS_KEY, écrite seulement s'il y en a ; absence = signé, donc les brouillons d'avant
   * restent lisibles) et revient anonyme. Rien d'autre d'identitaire n'y entre. Un brouillon retrouvé s'accompagne d'une
   * note près du composeur ; l'envoi, la bascule ou le champ vidé la retirent. */
  var DRAFTS_ANON = "anon";
  var anonDrafts = {};   // clé -> true : brouillon rédigé en mode anonyme (absent = signé)
  var draftNote = {};    // clé -> "anon" | "check" : brouillon retrouvé sur l'appareil, note à garder près du composeur
  var noteSaid = {};     // clés dont la note a déjà été annoncée (role=status) : pas de ré-annonce à chaque rendu

  /* ⚠️ Brouillons DURABLES (BL-059). Le relais ci-dessus mourait avec la page : « Mettre à jour » (rechargement),
   * l'éviction de la page par iOS ou la restauration d'un onglet Android emportaient le message en cours
   * d'écriture. Il est donc relu de l'appareil au démarrage (UI.init) et recopié dans localStorage à chaque
   * saisie, après un court silence, puis tout de suite avant ce qui peut tuer la page (UI.flushDrafts, appelée
   * par js/app.js). Il n'existe QUE sur cet appareil : aucune requête ne le porte, et la clé n'est pas dans
   * config.js. Seul le composeur de chaque sujet est conservé (clé « composer:<sujet> », donc jamais restauré
   * dans un autre sujet) : ni champ de connexion, de code ou de nom, ni fenêtre « Modifier » (un texte
   * d'édition abandonné ne doit pas ressurgir, et le préremplissage doit toujours l'emporter à l'ouverture),
   * ni aucune identité. Le choix ANONYME (et lui seul) suit le brouillon : voir `anonDrafts` (REC-RUI-001). */
  var DRAFTS_KEY = "brainsto.drafts.v1";
  var DRAFTS_MAX_ENTRIES = 50;      // un brouillon par sujet
  var DRAFTS_MAX_CHARS = 20000;     // taille totale écrite : les plus anciens partent d'abord
  var DRAFTS_MAX_VALUE = 4000;      // un seul brouillon (le champ est déjà limité à Core.LIMITS.message)
  var DRAFTS_DELAY_MS = 500;        // silence avant l'écriture
  var draftsPending = {};           // saisies pas encore écrites : clé -> texte ("" = à retirer)
  var draftsTimer = 0;

  /* Seul le composeur d'un sujet est conservé sur l'appareil. */
  function storedDraft(key) {
    return typeof key === "string" && key.indexOf("composer:") === 0 && key.length > 9;
  }

  function clipDraft(value) {
    var text = value === null || value === undefined ? "" : String(value);
    return text.length > DRAFTS_MAX_VALUE ? Utils.limit(text, DRAFTS_MAX_VALUE) : text;
  }

  /* Lecture tolérante : stockage refusé, JSON abîmé, forme inattendue ou clé étrangère = rien. */
  function readStoredDrafts() {
    var found = Utils.storage.get(DRAFTS_KEY, null);
    var out = {};
    if (!found || typeof found !== "object" || Array.isArray(found)) { return out; }
    var keys = Object.keys(found);
    for (var i = 0; i < keys.length; i++) {
      var value = found[keys[i]];
      if (storedDraft(keys[i]) && typeof value === "string" && value) { out[keys[i]] = clipDraft(value); }
    }
    return out;
  }

  /* Brouillons rédigés en anonyme : liste de clés « composer:<sujet> » sous la propriété réservée `anon` (jamais un nom ni
   * un identifiant). Lecture tolérante comme la précédente : forme inattendue, clé étrangère ou sans texte = ignorée. */
  function readStoredAnon(texts) {
    var found = Utils.storage.get(DRAFTS_KEY, null);
    var list = found && typeof found === "object" && !Array.isArray(found) ? found[DRAFTS_ANON] : null;
    var out = {};
    if (!Array.isArray(list)) { return out; }
    for (var i = 0; i < list.length; i++) {
      if (typeof list[i] === "string" && storedDraft(list[i]) && texts[list[i]]) { out[list[i]] = true; }
    }
    return out;
  }

  /* Écriture bornée : au plus DRAFTS_MAX_ENTRIES brouillons et DRAFTS_MAX_CHARS caractères, les plus anciens
   * (les premiers de l'objet) partent d'abord. Stockage refusé : comportement d'avant, sans erreur. */
  function writeStoredDrafts(drafts, anon) {
    var keys = Object.keys(drafts);
    /* Les textes, puis (seulement s'il y en a) la liste des brouillons anonymes : un indicateur ne survit jamais à son texte. */
    function payload() {
      var out = {};
      var flagged = [];
      for (var i = 0; i < keys.length; i++) {
        out[keys[i]] = drafts[keys[i]];
        if (anon && anon[keys[i]] === true) { flagged.push(keys[i]); }
      }
      if (flagged.length) { out[DRAFTS_ANON] = flagged; }
      return out;
    }
    while (keys.length > DRAFTS_MAX_ENTRIES || (keys.length && JSON.stringify(payload()).length > DRAFTS_MAX_CHARS)) {
      delete drafts[keys.shift()];
    }
    if (keys.length) { Utils.storage.set(DRAFTS_KEY, payload()); }
    else { Utils.storage.remove(DRAFTS_KEY); }
  }

  /* Saisie : relais tout de suite, écriture après un court silence. */
  function stageDraft(key, value, anon) {
    if (value) { composerDrafts[key] = value; } else { delete composerDrafts[key]; dismissNote(key); }
    /* Le choix suit le texte : noté « anonyme » seulement si c'est le choix au moment de la frappe (ou du geste explicite). */
    if (value && (anon === undefined ? UI.local.composerAnon === true : anon === true)) { anonDrafts[key] = true; }
    else { delete anonDrafts[key]; }
    draftsPending[key] = clipDraft(value);
    if (draftsTimer) { clearTimeout(draftsTimer); }
    draftsTimer = setTimeout(flushDrafts, DRAFTS_DELAY_MS);
  }

  function flushDrafts() {
    if (draftsTimer) { clearTimeout(draftsTimer); draftsTimer = 0; }
    var keys = Object.keys(draftsPending);
    if (!keys.length) { return; }
    var stored = readStoredDrafts();
    var storedAnon = readStoredAnon(stored);
    for (var i = 0; i < keys.length; i++) {
      delete stored[keys[i]];                  // la clé repasse en dernier : c'est la plus récente
      delete storedAnon[keys[i]];
      if (draftsPending[keys[i]]) {
        stored[keys[i]] = draftsPending[keys[i]];
        if (anonDrafts[keys[i]]) { storedAnon[keys[i]] = true; }
      }
    }
    draftsPending = {};
    writeStoredDrafts(stored, storedAnon);
  }

  /* La publication est partie en file : son brouillon disparaît, sauf si un texte PLUS RÉCENT a été saisi depuis. */
  function dropDraft(key, sent) {
    var latest = Object.prototype.hasOwnProperty.call(draftsPending, key) ? draftsPending[key] : readStoredDrafts()[key];
    if (latest && latest !== clipDraft(sent)) { return; }
    delete anonDrafts[key];
    draftsPending[key] = "";
    flushDrafts();
  }

  /* Refus local de la publication : le message d'erreur est déjà à l'écran (Sync.dispatch) ; le texte revient dans
   * le champ et, tout de suite, dans le brouillon durable. Jamais par-dessus une saisie plus récente. */
  function keepRefused(key, text) {
    var node = findDraftNode(key);
    touchedDrafts[key] = true;
    if (node && !node.value) { node.value = text; autoGrow(node); }
    stageDraft(key, node && node.value ? node.value : text);
    flushDrafts();
  }

  /* La note « brouillon retrouvé » s'en va : envoi, appui sur la bascule, champ vidé (REC-RUI-001). */
  function dismissNote(key) {
    if (!draftNote[key]) { return; }
    delete draftNote[key];
    delete noteSaid[key];
    var note = document.getElementById("composer-restored");
    if (note && note.parentNode) { note.parentNode.removeChild(note); }
    var field = findDraftNode(key);
    if (field && field.removeAttribute) { field.removeAttribute("aria-describedby"); }
  }

  /* Appelés par js/app.js : écriture immédiate avant ce qui peut tuer la page (pagehide, arrière-plan, rechargement
   * d'une mise à jour) et effacement complet à la déconnexion (relais, champs à l'écran et appareil). */
  UI.flushDrafts = function () { flushDrafts(); };

  UI.clearDrafts = function () {
    if (draftsTimer) { clearTimeout(draftsTimer); draftsTimer = 0; }
    Object.keys(draftNote).forEach(dismissNote);
    draftsPending = {};
    composerDrafts = {};
    anonDrafts = {};
    draftNote = {};
    noteSaid = {};
    touchedDrafts = {};
    var nodes = document.querySelectorAll("[data-draft]");
    for (var i = 0; i < nodes.length; i++) {
      if (storedDraft(nodes[i].getAttribute("data-draft")) && nodes[i].value) { nodes[i].value = ""; autoGrow(nodes[i]); }
    }
    Utils.storage.remove(DRAFTS_KEY);
  };

  /* ⚠️ Champs ÉDITÉS depuis leur dernière alimentation par le rendu.
   *
   * L'ancien critère était « le champ reconstruit est-il vide ? », au motif qu'une
   * valeur fournie par le rendu devait rester prioritaire. Conséquence : le champ
   * « Votre nom » des réglages étant pré-rempli, toute réception de message effaçait
   * une saisie en cours — un message d'un collègue suffisait.
   *
   * Le bon critère n'est pas la vacuité, c'est l'édition : c'est d'ailleurs la règle de
   * la plateforme elle-même pour les valeurs déclaratives, qui ne s'appliquent que tant
   * que le champ n'a pas été touché. Un champ vidé exprès mérite la même protection
   * qu'un champ rempli.
   *
   * On tient ce marqueur nous-mêmes : le drapeau natif du navigateur est levé aussi
   * par une écriture programmatique, donc il ne distingue pas la frappe de la
   * reconstruction — s'y fier reconstruirait le défaut. */
  var touchedDrafts = {};

  function captureDrafts() {
    var snapshot = { values: {}, active: null };
    var nodes = document.querySelectorAll("[data-draft]");
    for (var i = 0; i < nodes.length; i++) {
      var node = nodes[i];
      var key = node.getAttribute("data-draft");
      snapshot.values[key] = node.value;
      if (key.indexOf("composer:") === 0) {
        if (node.value) { composerDrafts[key] = node.value; }
        else { delete composerDrafts[key]; }
      }
      if (document.activeElement === node) {
        snapshot.active = {
          key: key,
          start: node.selectionStart,
          end: node.selectionEnd
        };
      }
    }
    return snapshot;
  }

  function findDraftNode(key) {
    var nodes = document.querySelectorAll("[data-draft]");
    for (var i = 0; i < nodes.length; i++) {
      if (nodes[i].getAttribute("data-draft") === key) { return nodes[i]; }
    }
    return null;
  }

  /* Le champ garde son texte au rendu, mais son compteur est recréé à « 0 / max » : on le recale (REC-RUI-008). */
  function refreshCounter(key, node) {
    /* Comparaison d'attribut, pas de sélecteur construit avec la clé : une clé étrange ne doit jamais casser le rendu. */
    var counters = document.querySelectorAll("[data-counter]");
    for (var i = 0; i < counters.length; i++) {
      if (counters[i].getAttribute("data-counter") !== key) { continue; }
      var max = Number(counters[i].textContent.split(" / ")[1]);
      if (max) { setCounter(counters[i], node.value.length, max); }
    }
  }

  function restoreDrafts(snapshot) {
    var nodes = document.querySelectorAll("[data-draft]");
    for (var i = 0; i < nodes.length; i++) {
      var node = nodes[i];
      var key = node.getAttribute("data-draft");
      var saved = snapshot.values[key];
      /* Repli sur le relais quand l'instantané ne connaît pas la clé : c'est le
       * cas au retour de l'écran de verrou, qui n'a rendu aucun composeur. */
      if (saved === undefined) { saved = composerDrafts[key]; }
      /* Un champ ÉDITÉ gagne toujours, même contre une valeur pré-remplie, et même
       * s'il a été vidé — c'est encore une intention. Un champ jamais touché suit
       * l'ancienne règle : le rendu a la priorité, et le relais ne sert qu'à remplir
       * un champ neuf resté vide. */
      if (touchedDrafts[key] && saved !== undefined) { node.value = saved; }
      else if (saved !== undefined && saved !== "" && !node.value) { node.value = saved; }
      autoGrow(node);
      refreshCounter(key, node);
    }
    if (snapshot.active) {
      var target = findDraftNode(snapshot.active.key);
      if (target) {
        try {
          target.focus({ preventScroll: true });
          if (target.setSelectionRange && snapshot.active.start !== null) {
            target.setSelectionRange(snapshot.active.start, snapshot.active.end);
          }
        } catch (e) { /* champ non focalisable */ }
      }
    }
  }

  /* ------------------------------------------------------------- Focus --- */

  /* ⚠️ Le rendu DÉTRUIT et reconstruit #app et le calque : l'élément qui avait le
   * focus disparaissait avec eux, et le focus retombait sur <body> après chaque
   * vote, réaction ou message reçu. Le clavier repartait du haut de la page et
   * le lecteur d'écran perdait sa place. Les commandes portent donc une clé
   * stable (`data-key` ; la bulle garde son `data-message-id`), relevée avant le
   * rendu et retrouvée après. Les champs de saisie restent l'affaire des
   * brouillons : une saisie en cours n'est jamais dérangée. */
  var KEYED = "[data-key], [data-message-id]";

  function keyOf(node) {
    if (!node || !node.getAttribute) { return null; }
    var key = node.getAttribute("data-key");
    if (key) { return key; }
    var messageId = node.getAttribute("data-message-id");
    if (messageId) { return "msg-" + messageId; }
    return node.id ? "#" + node.id : null;
  }

  /* Relevé AVANT le rendu. Une clé peut se répéter (« reaction-… » existe sous
   * chaque bulle) : `anchor` et `limit`, les plus proches clés UNIQUES avant et
   * après l'élément, la situent. `anchor` sert aussi de repli quand l'élément
   * disparaît : une réaction retirée rend le focus à sa bulle, « Retirer mon
   * vote » au dernier bouton de vote. */
  function captureFocus() {
    var node = document.activeElement;
    var inLayer = !!node && overlayRoot.contains(node);
    if (!node || !(inLayer || appRoot.contains(node)) || node.hasAttribute("data-draft")) { return null; }
    var key = keyOf(node);
    var saved = { key: key, unique: true, anchor: null, limit: null, inLayer: inLayer };
    if (!key || key.charAt(0) === "#") { return saved; }
    var nodes = (inLayer ? overlayRoot : appRoot).querySelectorAll(KEYED);
    var count = {};
    var i;
    for (i = 0; i < nodes.length; i++) { count["k" + keyOf(nodes[i])] = (count["k" + keyOf(nodes[i])] || 0) + 1; }
    saved.unique = count["k" + key] === 1;
    var after = false;
    for (i = 0; i < nodes.length; i++) {
      if (nodes[i] === node) { after = true; continue; }
      if (count["k" + keyOf(nodes[i])] !== 1) { continue; }
      if (!after) { saved.anchor = keyOf(nodes[i]); } else { saved.limit = keyOf(nodes[i]); break; }
    }
    return saved;
  }

  function findFocus(saved) {
    if (!saved || !saved.key) { return null; }
    if (saved.key.charAt(0) === "#") { return document.getElementById(saved.key.slice(1)); }
    var nodes = (saved.inLayer ? overlayRoot : appRoot).querySelectorAll(KEYED);
    var anchor = null;
    for (var i = 0; i < nodes.length; i++) {
      var key = keyOf(nodes[i]);
      if (saved.unique ? key === saved.key : (anchor && key === saved.key)) { return nodes[i]; }
      if (anchor && !saved.unique && key === saved.limit) { break; }
      if (!anchor && key === saved.anchor) { anchor = nodes[i]; }
    }
    return anchor;
  }

  function focusNode(node, scroll) {
    try { node.focus(scroll ? undefined : { preventScroll: true }); } catch (e) { /* non focalisable */ }
  }

  /* Feuilles et fenêtres. Le calque est rendu comme le reste, son focus se règle
   * donc ici, APRÈS le rendu : à l'ouverture on retient le déclencheur et on
   * entre dans le calque (le dialogue lui-même, nommé par son titre) ; tant
   * qu'il est ouvert, le fond est inerte (`inert`, à défaut `aria-hidden`) et le
   * document ne défile plus (classe `has-layer`, cf. app.css) ; à la fermeture,
   * quel que soit le geste (Fermer, Échap, fond, retour du système : tous passent
   * par UI.set), le focus revient au déclencheur. Pas de <dialog> : sa fermeture
   * native divergerait du contrat du geste retour (tête de js/app.js). */
  var INERT = typeof HTMLElement !== "undefined" && "inert" in HTMLElement.prototype;
  var inertNodes = [];      // nœuds rendus inertes ICI, et seulement eux
  var layerSpec = null;     // calque à l'écran au rendu précédent
  var layerReturn = null;   // relevé du déclencheur, rendu à la fermeture

  function setBackground(open) {
    var html = document.documentElement;
    if (!open) {
      html.classList.remove("has-layer");
      inertNodes.forEach(function (node) {
        if (INERT) { node.inert = false; } else { node.removeAttribute("aria-hidden"); }
      });
      inertNodes = [];
      return;
    }
    html.classList.add("has-layer");
    /* Les frères du calque, sauf les toasts (leur région doit encore annoncer) et
     * la présentation, qui tient elle-même son calque. */
    var siblings = document.body.children;
    for (var i = 0; i < siblings.length; i++) {
      var node = siblings[i];
      if (node === overlayRoot || node === toastRoot || node === onboardRoot || inertNodes.indexOf(node) >= 0 ||
          /^(SCRIPT|NOSCRIPT|STYLE|TEMPLATE)$/.test(node.tagName)) { continue; }
      if (INERT ? node.inert : node.getAttribute("aria-hidden") === "true") { continue; }
      if (INERT) { node.inert = true; } else { node.setAttribute("aria-hidden", "true"); }
      inertNodes.push(node);
    }
  }

  function settleFocus(saved, samePlace) {
    var dialog = overlayRoot.querySelector("[role=dialog]");
    var spec = dialog ? (UI.local.sheet || UI.local.modal) : null;
    var opened = !!spec && spec !== layerSpec;
    if (spec && !layerSpec) { layerReturn = saved; }
    if (!spec && layerSpec) { saved = layerReturn; layerReturn = null; samePlace = true; }
    layerSpec = spec;
    setBackground(!!spec);
    var active = document.activeElement;
    if (opened) {
      if (!dialog.contains(active)) { focusNode(dialog); }
      return;
    }
    /* Un focus resté en place (saisie restaurée par les brouillons, focus posé
     * ailleurs) ne se déplace jamais ; un changement d'écran non plus. */
    if (active && active !== document.body && active !== document.documentElement) { return; }
    if (!spec && !samePlace) { return; }
    var target = findFocus(saved);
    if (spec && (!target || !dialog.contains(target))) { target = dialog; }
    if (target) { focusNode(target); }
  }

  /* Tab ne sort pas du calque : après sa dernière commande il revient à la
   * première, et l'inverse. Le fond inerte ne suffit pas : au-delà de la
   * dernière commande, le navigateur sortirait de la page. */
  function keepTabInside(event) {
    if (event.key !== "Tab") { return; }
    var dialog = overlayRoot.querySelector("[role=dialog]");
    if (!dialog) { return; }
    var all = dialog.querySelectorAll("button, input, select, textarea, a[href], [tabindex]");
    var items = [];
    for (var i = 0; i < all.length; i++) {
      if (!all[i].disabled && all[i].getAttribute("tabindex") !== "-1") { items.push(all[i]); }
    }
    var active = document.activeElement;
    if (!items.length) { event.preventDefault(); return; }
    if (event.shiftKey && (active === items[0] || active === dialog)) {
      event.preventDefault(); focusNode(items[items.length - 1], true);
    } else if (!event.shiftKey && active === items[items.length - 1]) {
      event.preventDefault(); focusNode(items[0], true);
    }
  }

  function autoGrow(node) {
    if (!node || node.tagName !== "TEXTAREA" || !node.classList.contains("grow")) { return; }
    var before = node.style.height;
    node.style.height = "auto";
    /* +2 : box-sizing est border-box, mais scrollHeight ne compte pas les deux
       pixels de bordure. Sans eux, la dernière ligne saisie est rognée par le
       bas. Le plafond de 140 px doit rester égal au max-height de
       .composer .textarea (css/app.css). */
    node.style.height = Math.min(node.scrollHeight + 2, 140) + "px";
    /* Chaque ligne gagnée par le champ est une ligne perdue en bas du fil : le
     * dernier message glisse sous le composeur sans que rien ne le signale. On
     * ne mesure que si la hauteur a réellement changé — sinon c'est un calcul
     * de mise en page forcé à chaque frappe, sur des téléphones qui ne l'ont
     * pas. */
    if (node.style.height !== before) { keepThreadAtBottom(); }
  }

  /* --------------------------------------------------------- Clavier virtuel --- */

  /* Deux régimes opposés, dont aucun ne se règle en CSS :
   *  - là où le clavier REDIMENSIONNE la fenêtre (Chromium avant 108, encore
   *    embarqué chez plusieurs constructeurs), le fil rétrécit mais garde son
   *    scrollTop : le bas du fil sort de l'écran en silence ;
   *  - là où il RECOUVRE (iOS, et Chrome Android 108+ par défaut), rien ne
   *    rétrécit : le moteur décale le viewport visuel pour révéler le champ.
   *    Rien à recaler pendant la saisie, mais le décalage doit être rendu à la
   *    fermeture — sur l'écran de discussion la page ne défile pas, et en
   *    application installée la barre du haut porte l'unique sortie.
   *
   * visualViewport.scroll n'est délibérément pas écouté : suivre le viewport
   * image par image imposerait de transformer un écran qui empile une dizaine
   * de surfaces floutées, ce qui coûte plus cher que le défaut corrigé. */

  var lastThreadHeight = 0;
  var keyboardCovered = false;

  /* C'est le rétrécissement du FIL qui déclenche le rattrapage, jamais celui de
   * la fenêtre : un seul test couvre le composeur qui grandit, l'aperçu « en
   * réponse à … » qui s'ouvre, la rotation et le clavier qui redimensionne — et
   * il reste sans effet là où rien ne rétrécit. */
  function keepThreadAtBottom() {
    var thread = document.querySelector(".thread");
    if (!thread) { lastThreadHeight = 0; return; }
    var height = thread.clientHeight;
    var shrink = lastThreadHeight - height;
    lastThreadHeight = height;
    if (shrink <= 0) { return; }
    /* La distance au bas vient d'augmenter d'exactement « shrink » : qui lisait
     * le bas s'y trouve encore, à « shrink » près. Même tolérance de 80 px que
     * le rendu — on ne ramène jamais en bas quelqu'un qui relisait plus haut. */
    if (thread.scrollHeight - thread.scrollTop - height <= shrink + 80) {
      thread.scrollTop = thread.scrollHeight;
    }
  }

  /* Sortie de secours, pas un réglage : l'écran de discussion ne défile pas,
   * donc un décalage laissé par le moteur après la fermeture du clavier n'y est
   * rattrapable par aucun geste, et la barre du haut — seule sortie en
   * application installée — resterait hors de l'écran. Partout ailleurs la page
   * défile normalement et on n'y touche pas. */
  function resetChatPageScroll() {
    if (!document.querySelector(".screen.chat")) { return; }
    var offset = window.pageYOffset || document.documentElement.scrollTop || 0;
    if (offset > 0) { window.scrollTo(0, 0); }
  }

  function onViewportResize() {
    keepThreadAtBottom();
    var view = window.visualViewport;
    if (!view) { return; }
    /* Hauteur cachée par le clavier. Nulle là où la fenêtre a été redimensionnée
     * — il n'y a alors rien à rendre. 120 px : au-dessus d'une barre d'URL qui
     * se replie, très en dessous du plus petit clavier. Tant que le clavier
     * couvre, on ne touche à rien : corriger le défilement pendant la saisie
     * masquerait le champ que le moteur vient de révéler. */
    if (window.innerHeight - view.height > 120) { keyboardCovered = true; return; }
    if (keyboardCovered) { keyboardCovered = false; resetChatPageScroll(); }
  }

  function bindViewport() {
    if (window.visualViewport && window.visualViewport.addEventListener) {
      window.visualViewport.addEventListener("resize", onViewportResize);
    } else {
      /* Sans visualViewport, seul un redimensionnement de fenêtre est
       * observable — c'est justement le cas qui a besoin du rattrapage. */
      window.addEventListener("resize", onViewportResize);
    }
  }

  /* --------------------------------------------------------------- Toasts --- */

  UI.toast = function (text, kind) {
    /* Voir UI.holdToast : en modal, un toast serait recouvert par le calque supérieur
     * et retiré de l'arbre d'accessibilité avec l'arrière-plan inerte. */
    if (UI.onboardingHoldsToasts && UI.onboardingHoldsToasts()) {
      UI.holdToast(text, kind);
      return;
    }
    if (!toastRoot) { return; }
    /* Un élément fixe reste accroché au viewport de MISE EN PAGE : clavier
     * ouvert, le moteur décale le viewport visuel et le toast s'afficherait
     * au-dessus du bord de l'écran — invisible, alors que c'est justement
     * pendant la saisie que tombent « Action refusée » et le reverrouillage.
     * Mesuré ici, à l'affichage : exact, et sans écoute continue du
     * défilement, qui coûterait cher sur un écran empilant autant de surfaces
     * floutées. */
    var view = window.visualViewport;
    if (view) {
      document.documentElement.style.setProperty("--vv-top", Math.round(view.offsetTop) + "px");
    }
    var node = el("div", { class: "toast" + (kind === "error" ? " error" : ""), text: text });
    toastRoot.appendChild(node);
    setTimeout(function () {
      if (!node.parentNode) { return; }
      /* Il repart par où il est arrivé (css/motion.css, « Toasts »), puis quitte l'arbre. Mouvement réduit : tout de
       * suite, la feuille ne joue rien et le délai ne ferait que le retenir. */
      if (motionReduced()) { node.parentNode.removeChild(node); return; }
      node.classList.add("is-leaving");
      setTimeout(function () { if (node.parentNode) { node.parentNode.removeChild(node); } }, 200);
    }, kind === "error" ? 5200 : 2800);
  };

  /* ------------------------------------------------------ Blocs réutilisables --- */

  /* Libellé LONG de la pastille : les six mots de §12, suivis du nombre d'actions
   * en attente quand il y en a. Le libellé COURT reste Sync.status().label
   * (« Sync… », « Local ») : c'est lui qui tient sur un téléphone (cf. app.css).
   * Un code inconnu (sync.js plus récent que ce fichier) garde le libellé court. */
  function statusLongLabel(status) {
    var count = status.pending ? " (" + status.pending + ")" : "";
    if (status.code === "idle") { return "À jour"; }
    if (status.code === "syncing") { return "Synchronisation"; }
    if (status.code === "pending") { return "En attente" + count; }
    if (status.code === "offline") { return "Hors ligne" + count; }
    if (status.code === "error") { return "Erreur" + count; }
    if (status.code === "local") { return "Mode local"; }
    return status.label;
  }

  /* ⚠️ La région d'annonce dit le libellé long du dernier état UTILE, pas l'état
   * courant. Les sondages font alterner « À jour » et « Synchronisation » toutes
   * les deux secondes : les annoncer, c'était 22 interruptions en 20 s pour le
   * lecteur d'écran. L'annonce ne change donc qu'en entrant en attente, hors
   * ligne, en erreur ou en mode local (ou quand leur nombre d'actions change), et
   * au retour à « À jour » après l'un d'eux ; la toute première synchronisation
   * dit aussi sa fin, une fois. L'état vit ici, hors du DOM : la pastille est
   * recréée à chaque rendu d'écran, l'annonce ne doit pas repartir de zéro. */
  var announcedCode = null;
  var announcedText = "";

  function statusAnnouncement(status) {
    var text = statusLongLabel(status);
    if (announcedCode === null) {
      announcedCode = status.code; announcedText = text;
    } else if (status.code === "idle") {
      if (announcedCode !== "idle") { announcedCode = "idle"; announcedText = text; }
    } else if (status.code !== "syncing" && text !== announcedText) {
      announcedCode = status.code; announcedText = text;
    }
    return announcedText;
  }

  /* Réécrire un texte identique n'est pas neutre : un lecteur d'écran peut relire
   * une région dont le nœud texte a été remplacé. */
  function setStatusText(node, text) {
    if (node && node.textContent !== text) { node.textContent = text; }
  }

  function statusPill(secondary) {
    var status = Sync.status();
    /* `role="status"` : « En attente (3) » devenait « À jour » sans que rien ne le
     * dise. C'est la seule information de l'écran qui change SEULE, sans geste — donc
     * exactement le cas d'une région d'annonce. `polite` par défaut avec ce rôle, et
     * c'est ce qu'il faut : la synchronisation n'a pas à couper la lecture en cours.
     * La pastille est mise à jour en place par UI.refreshStatus, jamais recréée : la
     * région préexiste donc à son contenu, condition pour qu'elle annonce. */
    /* Libellés visibles (court et long, l'un ou l'autre selon la largeur) en
     * aria-hidden : le lecteur d'écran n'entend que `.status-announce`.
     * `secondary` : seconde pastille d'un même écran (Réglages). Une seule région
     * role=status par écran : celle-ci n'a ni rôle ni annonce, et ses libellés se
     * lisent comme un texte ordinaire (aucun n'y est aria-hidden : à 430 px et
     * moins le long est masqué par app.css, le court est alors son seul texte). */
    /* `status-main` : la pastille de la barre, qui porte la région d'annonce. À jour ou en synchronisation, elle se réduit au point (voir
     * app.css) ; la seconde (carte Synchronisation de Système) garde ses mots, c'est son rôle. */
    var pill = el("div", {
      class: "status-pill status-" + status.code + (secondary ? "" : " status-main"), title: status.error || "",
      role: secondary ? null : "status"
    }, [
      el("span", { class: "status-dot", "aria-hidden": "true" }),
      el("span", { class: "status-short", "aria-hidden": secondary ? null : "true", text: status.label }),
      el("span", { class: "status-label status-long", "aria-hidden": secondary ? null : "true", text: statusLongLabel(status) }),
      secondary ? null : el("span", { class: "visually-hidden status-announce", text: statusAnnouncement(status) })
    ]);
    return pill;
  }

  UI.refreshStatus = function () {
    var status = Sync.status();
    var long = statusLongLabel(status);
    var said = statusAnnouncement(status);
    var nodes = document.querySelectorAll(".status-pill");
    for (var i = 0; i < nodes.length; i++) {
      nodes[i].className = "status-pill status-" + status.code + (nodes[i].classList.contains("status-main") ? " status-main" : "");
      nodes[i].setAttribute("title", status.error || "");
      setStatusText(nodes[i].querySelector(".status-short"), status.label);
      setStatusText(nodes[i].querySelector(".status-long"), long);
      setStatusText(nodes[i].querySelector(".status-announce"), said);
    }
  };

  function topbar(options) {
    var left = [];
    if (options.back) {
      /* Bouton retour visible sur CHAQUE écran secondaire (iPhone sans retour matériel). */
      var backLabel = options.backLabel || "Retour";
      left.push(el("button", {
        class: "btn-back", type: "button", "data-key": "back",
        "aria-label": backLabel === "Retour" ? "Retour" : "Retour vers " + backLabel,
        onclick: options.back
      }, [icon("back", 20), el("span", { text: backLabel })]));
    }
    /* Titre d'écran, niveau 1. Le rôle est posé sur le conteneur et non sur un <h1> : sur l'écran
     * de discussion le titre vit dans un bouton (un titre ne peut pas s'y loger), et la mise en
     * forme existante reste intacte. `heading: false` quand l'écran porte déjà son propre h1. */
    var titles = el("div", {
      class: "topbar-titles",
      role: options.heading === false ? null : "heading",
      "aria-level": options.heading === false ? null : "1"
    });
    if (options.onTitle) {
      var titleBtn = el("button", {
        class: "btn-ghost", type: "button",
        style: { padding: "0", textAlign: "left", width: "100%", minHeight: "auto", background: "transparent", border: "0", cursor: "pointer" },
        "data-key": "topic-info", "aria-describedby": "topic-info-description", onclick: options.onTitle
      }, [
        el("div", { class: "topbar-title topbar-title-action" }, [el("span", { text: options.title }), icon("down", 14)])
      ]);
      titles.appendChild(titleBtn);
    } else {
      titles.appendChild(el("div", { class: "topbar-title", text: options.title }));
      if (options.sub) {
        titles.appendChild(el("div", { class: "topbar-sub" }, [el("span", { text: options.sub })]));
      }
    }
    /* La consigne du bouton-titre est sa description, pas son nom : le nom reste le texte visible
     * (le titre du sujet), et la description est posée HORS du titre pour ne pas s'y ajouter. */
    return el("header", { class: "topbar" }, [
      left, titles, el("div", { class: "topbar-actions" }, options.actions || []),
      options.onTitle ? el("span", { class: "visually-hidden", id: "topic-info-description", text: "Voir les détails du sujet" }) : null
    ]);
  }

  /* ⚠️ Un libellé qui n'est pas RELIÉ à son champ ne le nomme pas : le champ restait sans nom,
   * ou nommé par son seul placeholder, qui disparaît dès la première frappe. Chaque champ reçoit
   * donc un identifiant et son libellé un `for`. L'indication devient la description du champ :
   * « Votre nom » annonce ainsi son effet (publier en anonyme, §5) à qui ne voit pas l'écran.
   * L'identifiant dérive de la clé de brouillon : stable d'un rendu à l'autre et unique par
   * écran ; à défaut de clé, un compteur. */
  var fieldSeq = 0;

  function controlIn(node) {
    if (!node) { return null; }
    if (/^(INPUT|SELECT|TEXTAREA)$/.test(node.tagName)) { return node; }
    return node.querySelector ? node.querySelector("input, select, textarea") : null;
  }

  function fieldId(control) {
    var id = control.getAttribute("id");
    if (id) { return id; }
    var key = control.getAttribute("data-draft") || control.getAttribute("data-key");
    if (key) { return "f-" + String(key).replace(/[^A-Za-z0-9_-]/g, "-"); }
    fieldSeq += 1;
    return "f-" + fieldSeq;
  }

  function field(label, control, hint) {
    var target = controlIn(control);
    var id = target ? fieldId(target) : null;
    if (target) { target.setAttribute("id", id); }
    var hintNode = hint ? el("div", { class: "hint", text: hint, id: id ? id + "-hint" : null }) : null;
    if (target && hintNode) { target.setAttribute("aria-describedby", id + "-hint"); }
    return el("div", { class: "field" }, [
      label ? el("label", { class: "label", text: label, "for": id }) : null,
      control,
      hintNode
    ]);
  }

  function draftValue(key) {
    var node = findDraftNode(key);
    return node ? node.value : "";
  }

  UI.draftValue = draftValue;

  /* Erreur de saisie reliée au champ (A11-017). Un toast seul disparaît en quelques secondes et
   * ne dit pas QUEL champ est en cause : le champ reçoit aria-invalid et une description (message
   * visible sous lui, lu avec son nom) jusqu'à la frappe suivante, et le focus l'y conduit. Le
   * message n'existe que dans le DOM : un rendu l'efface avec l'état du champ. */
  function clearInvalid(node) {
    var errorId = (node.getAttribute("id") || "") + "-error";
    var message = document.getElementById(errorId);
    if (message && message.parentNode) { message.parentNode.removeChild(message); }
    node.removeAttribute("aria-invalid");
    var rest = (node.getAttribute("aria-describedby") || "").split(" ").filter(function (part) {
      return part && part !== errorId;
    }).join(" ");
    if (rest) { node.setAttribute("aria-describedby", rest); } else { node.removeAttribute("aria-describedby"); }
  }

  function markInvalid(node, text) {
    if (!node || !node.parentNode) { return; }
    var id = node.getAttribute("id");
    if (!id) { id = fieldId(node); node.setAttribute("id", id); }
    clearInvalid(node);
    node.parentNode.insertBefore(el("div", { class: "hint field-error", id: id + "-error", text: text }), node.nextSibling);
    node.setAttribute("aria-invalid", "true");
    node.setAttribute("aria-describedby", ((node.getAttribute("aria-describedby") || "") + " " + id + "-error").trim());
    var onInput = function () { clearInvalid(node); node.removeEventListener("input", onInput); };
    node.addEventListener("input", onInput);
    try { node.focus(); } catch (e) { /* champ non focalisable */ }
  }

  /* Refus de saisie dans ce fichier : message relié au champ ET toast (annonce immédiate). */
  function invalid(node, text) { markInvalid(node, text); UI.toast(text, "error"); }

  /* Pour js/app.js, qui valide l'adresse, le code et le nom : la clé est celle du brouillon. */
  UI.fieldError = function (key, text) { markInvalid(findDraftNode(key), text); };

  function closeOverlay() { UI.set({ sheet: null, modal: null }); }

  /* Identifiant du titre d'un calque. Un seul calque existe à la fois —
   * `renderOverlay` vide sa racine avant de rendre —, donc une valeur fixe ne peut pas
   * entrer en collision, et elle évite de fabriquer un compteur pour rien. */
  var OVERLAY_TITLE_ID = "overlay-title";

  /* Le nom accessible d'un dialogue vient de son titre VISIBLE, comme l'ARIA APG le
   * prescrit. Sans lui, les feuilles et les fenêtres de cette application
   * s'annonçaient « boîte de dialogue », et rien de plus. */
  function overlayTitle(title, className) {
    if (!title) { return null; }
    if (title instanceof Node) {
      title.id = OVERLAY_TITLE_ID;
      return title;
    }
    return el("div", { class: className, id: OVERLAY_TITLE_ID, text: title });
  }

  function sheet(title, children) {
    var titleNode = overlayTitle(title, "sheet-title");
    return el("div", {
      class: "overlay bottom",
      onclick: function (e) { if (e.target === e.currentTarget) { closeOverlay(); } }
    }, [
      el("div", {
        class: "sheet", role: "dialog", "aria-modal": "true", tabindex: "-1",
        /* Pointer un nœud absent vaut moins que ne rien pointer. */
        "aria-labelledby": titleNode ? OVERLAY_TITLE_ID : null
      }, [
        el("div", { class: "sheet-handle", "aria-hidden": "true" }),
        titleNode,
        children,
        el("button", { class: "btn btn-block btn-outline", type: "button", text: "Fermer", style: { marginTop: "14px" }, onclick: closeOverlay })
      ])
    ]);
  }

  function modal(title, children, actions) {
    return el("div", {
      class: "overlay center",
      onclick: function (e) { if (e.target === e.currentTarget) { closeOverlay(); } }
    }, [
      el("div", {
        class: "modal", role: "dialog", "aria-modal": "true", tabindex: "-1",
        "aria-labelledby": title ? OVERLAY_TITLE_ID : null
      }, [
        overlayTitle(title, "modal-title"),
        children,
        el("div", { class: "modal-actions" }, actions)
      ])
    ]);
  }

  function sheetAction(iconName, label, onclick, options) {
    options = options || {};
    return el("button", {
      class: "sheet-action" + (options.danger ? " danger" : ""), "data-key": "action-" + iconName,
      type: "button",
      disabled: options.disabled,
      onclick: onclick
    }, [icon(iconName, 20), el("span", { text: label })]);
  }

  /* Compteur de caractères : il ne paraît qu'à l'approche de la limite (90 %). Plus tôt, il ne dit rien d'utile et
   * charge l'écran ; la limite elle-même reste tenue par `maxlength`. */
  var COUNTER_SHOW_RATIO = 0.9;

  function setCounter(node, length, max) {
    node.textContent = length + " / " + max;
    node.hidden = length < max * COUNTER_SHOW_RATIO;
  }

  function counterFor(key, max) {
    var node = el("div", { class: "counter", dataset: { counter: key } });
    setCounter(node, 0, max);
    return node;
  }

  function bindCounter(input, key, max) {
    input.addEventListener("input", function () {
      var nodes = document.querySelectorAll('[data-counter="' + key + '"]');
      for (var i = 0; i < nodes.length; i++) { setCounter(nodes[i], input.value.length, max); }
    });
    return input;
  }

  /* =========================================================== ÉCRANS ==== */

  /* ---------------------------------------------------- Accueil : connexion --- */

  /* Stockage refusé par le navigateur (js/app.js, STORAGE_REFUSED) : le toast du démarrage
   * disparaît, cette ligne reste tant que l'écran de connexion est là. Le texte vient d'App et
   * n'est jamais recopié ici ; un js/app.js plus ancien en cache n'exporte rien : aucune ligne. */
  function storageNote() {
    var text = typeof App.storageMessage === "function" ? App.storageMessage() : "";
    if (typeof text !== "string" || !text) { return null; }
    return el("div", { class: "note" }, [icon("info", 14), el("span", { text: text })]);
  }

  /* ---------------------------------------------------- Accueil : invitation --- */

  /* Téléphone et mode d'ouverture : seulement pour adapter les consignes d'installation, jamais pour décider d'un
   * droit. Une détection fausse ne coûte qu'une consigne moins précise. */
  function devicePlatform() {
    var ua = String((navigator && navigator.userAgent) || "");
    if (/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) { return "ios"; }
    if (/Android/.test(ua)) { return "android"; }
    return "other";
  }

  function isInstalledApp() {
    try {
      if (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) { return true; }
    } catch (e) { /* requête média refusée : on suppose le navigateur */ }
    return navigator.standalone === true;
  }

  /* Fenêtre intégrée à une application (Instagram, Facebook, LinkedIn…) : rien n'y est gardé durablement. */
  function inAppBrowser() {
    return /FBAN|FBAV|FB_IAB|Instagram|LinkedInApp|Snapchat|Line\/|MicroMessenger|WhatsApp/.test(String(navigator.userAgent || ""));
  }

  /* L'invitation reçue, depuis le presse-papiers. Sur iPhone, l'application installée ne voit rien de ce que Safari
   * a ouvert : coller l'invitation est le seul pont. Sans accès au presse-papiers, l'appui long dans le champ
   * d'adresse fait la même chose (le champ accepte le lien entier). */
  function canPaste() {
    try { return !!(navigator.clipboard && navigator.clipboard.readText); } catch (e) { return false; }
  }

  function pasteInvitation() {
    var fail = function () {
      UI.toast("Aucune invitation trouvée. Copiez le lien reçu, ou collez-le dans le champ « Adresse de l'équipe ».", "error");
    };
    try {
      navigator.clipboard.readText().then(function (text) {
        var token = Utils.inviteTokenIn(text);
        if (token) { App.go("#/invitation/" + token); return; }
        var direct = Utils.inviteTarget(Utils.trim(text));
        var node = direct ? findDraftNode("setup:url") : null;
        if (node) { node.value = direct; UI.toast("Adresse collée : saisissez le code, puis « Enregistrer et continuer »."); return; }
        fail();
      }, fail);
    } catch (e) { fail(); }
  }

  /* ------------------------------------------------- Installer l'application --- */

  /* Un seul bouton pour tous les téléphones (Réglages). Là où le navigateur sait installer de lui-même (Chrome, Edge,
   * Samsung Internet sur Android, Chrome sur ordinateur), il annonce `beforeinstallprompt` : on garde l'événement, et le
   * bouton ouvre directement la fenêtre d'installation du système. Ailleurs (Safari sur iPhone, Firefox…), aucun site ne
   * peut installer lui-même : le bouton ouvre une feuille qui montre les deux gestes à faire. */
  var installPrompt = null;

  UI.installPromptReady = function (event) {
    if (event && typeof event.preventDefault === "function") { event.preventDefault(); }
    installPrompt = event || null;
    if (App.route && App.route.name === "settings") { UI.force(); }
  };

  if (typeof window !== "undefined" && window.addEventListener) {
    window.addEventListener("beforeinstallprompt", UI.installPromptReady);
    window.addEventListener("appinstalled", function () {
      installPrompt = null;
      UI.toast("Application installée : ouvrez-la depuis son icône.");
    });
  }

  function installApp() {
    var prompt = installPrompt;
    if (prompt && typeof prompt.prompt === "function") {
      installPrompt = null;   // un événement ne sert qu'une fois
      try {
        prompt.prompt();
        if (prompt.userChoice && typeof prompt.userChoice.then === "function") {
          prompt.userChoice.then(function () { UI.force(); }, function () { UI.force(); });
        }
        return;
      } catch (e) { /* fenêtre refusée : la feuille prend le relais */ }
    }
    UI.set({ sheet: { type: "install" } });
  }

  function installSheet() {
    var platform = devicePlatform();
    var steps;
    if (inAppBrowser()) {
      steps = [
        ["share", "Ouvrez cette page dans Safari ou Chrome : menu ⋯, puis « Ouvrir dans le navigateur »."],
        ["download", "Revenez dans Réglages et touchez « Installer l'application »."]
      ];
    } else if (platform === "ios") {
      steps = [
        ["share", "Touchez Partager, en bas de Safari."],
        ["addSquare", "Choisissez « Sur l'écran d'accueil », puis « Ajouter »."]
      ];
    } else {
      steps = [
        ["down", "Ouvrez le menu ⋮ du navigateur."],
        ["addSquare", "Touchez « Installer l'application » ou « Ajouter à l'écran d'accueil »."]
      ];
    }
    /* ⚠️ Sur iPhone, l'application installée ne voit rien de ce que Safari a gardé : elle redemande l'équipe. Copier
     * l'invitation AVANT d'installer permet de la coller à la première ouverture (« Coller l'invitation »). */
    var connected = !(Sync.connection.localMode || !Sync.connection.url);
    var invite = platform === "ios" && connected && typeof App.inviteLink === "function" ? App.inviteLink() : "";
    return sheet("Installer l'application", el("div", { class: "stack" }, [
      el("ol", { class: "install-guide" }, steps.map(function (step) {
        return el("li", {}, [el("span", { class: "install-guide-icon", "aria-hidden": "true" }, [icon(step[0], 20)]),
          el("span", { text: step[1] })]);
      })),
      invite ? el("p", { class: "hint", text: "L'application installée vous redemandera l'équipe : copiez l'invitation avant, vous la collerez à l'ouverture." }) : null,
      invite ? el("button", { class: "btn btn-outline btn-block", type: "button", "data-key": "install-copy-invite",
        onclick: function () { copyText(invite, "Invitation copiée."); } }, [icon("copy", 16), el("span", { text: "Copier l'invitation" })]) : null
    ]));
  }

  function installCard(platform) {
    var steps = platform === "ios" ? [
      "Dans Safari, touchez Partager, puis « Sur l'écran d'accueil ».",
      "Ouvrez BrainstO. depuis la nouvelle icône.",
      "Touchez « Coller l'invitation », puis saisissez le code."
    ] : platform === "android" ? [
      "Rejoignez d'abord l'équipe ci-dessus.",
      "Puis, dans le menu ⋮ du navigateur, touchez « Installer l'application » ou « Ajouter à l'écran d'accueil ».",
      "L'application installée reste normalement réglée. Si elle redemande l'adresse : copiez le lien reçu, puis touchez « Coller l'invitation »."
    ] : [
      "Sur ordinateur, rien à installer : rejoignez l'équipe ci-dessus.",
      "Sur téléphone, ouvrez ce même lien dans Safari (iPhone) ou Chrome (Android)."
    ];
    return el("div", { class: "card card-static stack", "data-key": "invite-install" }, [
      sectionTitle("inbox", "Installer sur votre téléphone"),
      inAppBrowser() ? el("div", { class: "note" }, [icon("warning", 14), el("span", { class: "note-body",
        text: "Ce lien s'est ouvert dans une application. Ouvrez-le dans Safari ou Chrome (menu ⋯, puis « Ouvrir dans le navigateur ») : ici, rien ne serait gardé." })]) : null,
      el("ol", { class: "install-steps" }, steps.map(function (step) { return el("li", { text: step }); })),
      platform === "ios" ? el("div", { class: "note" }, [icon("info", 14), el("span", { class: "note-body",
        text: "Sur iPhone, l'application installée ne garde rien de ce que vous faites dans Safari. Copiez l'invitation avant d'installer : vous la collerez dans l'application." })]) : null,
      platform === "ios" ? el("button", { class: "btn btn-outline btn-block", type: "button", "data-key": "invite-copy",
        onclick: function () { copyText(window.location.href, "Invitation copiée : collez-la dans l'application installée."); } },
      [icon("copy", 16), el("span", { text: "Copier l'invitation" })]) : null
    ]);
  }

  /* Page d'arrivée d'un lien d'invitation : l'adresse vient du lien, il ne reste que le code. Sur un appareil déjà
   * réglé sur une AUTRE équipe, rejoindre remplace l'équipe actuelle, et l'écran le dit avant. */
  function screenInvitation(invitation) {
    var configured = App.connectionConfigured();
    var codeInput = el("input", {
      class: "input", type: "password", autocomplete: "off", inputmode: "text",
      placeholder: "Code d'accès reçu avec le lien", "data-draft": "setup:code"
    });
    var join = function () { App.saveConnection(invitation.url, codeInput.value); };
    return el("div", { class: "screen" }, [
      configured ? topbar({ title: "Invitation", back: App.remonter, backLabel: "Retour" }) : null,
      el("div", { class: "content stack-lg" }, [
        heroBlock("Préparer les réunions de l'équipe, ensemble.", !configured),
        /* Épure : le champ du code et le bouton. Seule reste la conséquence qui compte : rejoindre une autre équipe
         * remplace l'actuelle. */
        reveal(el("div", { class: "stack", "data-key": "invite-card" }, [
          storageNote(),
          configured ? el("p", { text: "Rejoindre cette équipe remplace votre équipe actuelle sur ce téléphone." }) : null,
          field("Code d'accès", codeInput),
          el("button", { class: "btn btn-primary btn-block", type: "button", "data-key": "invite-join", onclick: join },
            [el("span", { text: configured ? "Changer d'équipe" : "Rejoindre l'équipe" }), icon("forward", 18)])
        ]), 1),
        isInstalledApp() ? null : reveal(installCard(devicePlatform()), 2),
        reveal(el("button", {
          class: "btn btn-ghost btn-block", type: "button", "data-key": "invite-dismiss",
          text: configured ? "Garder mon équipe actuelle" : "Saisir l'adresse à la main",
          onclick: function () { App.go("#/"); }
        }), 3)
      ])
    ]);
  }

  function screenConnection() {
    var invitation = typeof App.invitation === "function" ? App.invitation() : null;
    if (invitation && invitation.url) { return screenInvitation(invitation); }
    var urlInput = el("input", {
      class: "input", type: "url", inputmode: "url", autocomplete: "off",
      autocapitalize: "off", spellcheck: "false",
      placeholder: "Collez ici l'adresse ou le lien d'invitation", "aria-required": "true",
      "data-draft": "setup:url",
      value: Sync.connection.url || ""
    });
    var codeInput = el("input", {
      class: "input", type: "password", autocomplete: "off", inputmode: "text",
      placeholder: "Code d'accès (si l'équipe en a défini un)",
      "data-draft": "setup:code"
    });

    var submit = function () {
      App.saveConnection(Utils.trim(urlInput.value), codeInput.value);
    };

    return el("div", { class: "screen" }, [
      /* Écran secondaire lorsqu'on revient modifier la connexion : bouton retour. */
      App.connectionConfigured() ? topbar({
        title: "Connexion",
        back: function () { App.editingConnection = false; UI.force(); },
        backLabel: "Retour"
      }) : null,
      el("div", { class: "content stack-lg" }, [
        heroBlock("Préparer les réunions de l'équipe, ensemble.", !App.connectionConfigured()),
        /* Épure : plus de carte, de surtitre ni de paragraphes d'aide. Les indications des champs disent ce qu'on y
         * met ; le code n'est jamais enregistré, l'adresse reste sur l'appareil (docs/GUIDE_UTILISATEUR.md). */
        reveal(el("div", { class: "stack" }, [
          storageNote(),
          invitation ? el("div", { class: "note", "data-key": "invite-broken" }, [icon("warning", 14), el("span", { class: "note-body",
            text: "Ce lien d'invitation est incomplet : demandez-en un nouveau, ou saisissez l'adresse." })]) : null,
          canPaste() ? el("button", { class: "btn btn-outline btn-block", type: "button", "data-key": "invite-paste",
            onclick: pasteInvitation }, [icon("copy", 16), el("span", { text: "Coller l'invitation" })]) : null,
          field("Adresse de l'équipe", urlInput),
          field("Code d'accès", codeInput),
          el("button", { class: "btn btn-primary btn-block", type: "button", onclick: submit },
            [el("span", { text: "Enregistrer et continuer" }), icon("forward", 18)])
        ]), 1),
        reveal(el("button", {
          class: "btn btn-ghost btn-block", type: "button",
          text: "Continuer sans connexion (mode local)",
          onclick: function () { App.useLocalMode(); }
        }), 2)
      ])
    ]);
  }

  /* --------------------------------------------------------- Accueil : nom --- */

  function screenName() {
    var nameInput = bindCounter(el("input", {
      class: "input", type: "text", maxlength: Core.LIMITS.name,
      autocomplete: "name", placeholder: "Votre prénom", "aria-required": "true",
      "aria-labelledby": "setup-name-question",
      "data-draft": "setup:name",
      value: App.user.name || ""
    }), "setup:name", Core.LIMITS.name);

    /* Épure : une question, un champ, un bouton. La barre ne garde que le retour, sans titre qui doublerait la
     * question. */
    return el("div", { class: "screen" }, [
      App.connectionConfigured() ? topbar({
        title: "", heading: false,
        back: function () { App.editConnection(); },
        backLabel: "Connexion"
      }) : null,
      el("div", { class: "content stack-lg" }, [
        reveal(el("div", { class: "stack" }, [
          el("h1", { class: "setup-question", id: "setup-name-question", text: "Comment vous appelez-vous ?" }),
          nameInput,
          counterFor("setup:name", Core.LIMITS.name),
          el("button", {
            class: "btn btn-primary btn-block", type: "button",
            onclick: function () { App.saveName(nameInput.value); }
          }, [el("span", { text: "Commencer" }), icon("forward", 18)])
        ]), 0)
      ])
    ]);
  }

  /* ------------------------------------------------------------- Verrou --- */

  function screenLock() {
    var codeInput = el("input", {
      class: "input", type: "password", inputmode: "text", autocomplete: "off",
      placeholder: "Code d'accès", "aria-label": "Code d'accès", "aria-required": "true", "data-draft": "lock:code",
      onkeydown: function (e) { if (e.key === "Enter") { App.unlock(codeInput.value); } }
    });

    /* Épure : le logo, une ligne, le champ, le bouton. Où le code est gardé et combien de temps l'accès reste
     * ouvert ne servent pas à déverrouiller (docs/GUIDE_UTILISATEUR.md le dit). */
    return el("div", { class: "screen" }, [
      el("div", { class: "content stack-lg" }, [
        heroBlock("Espace verrouillé", true),
        reveal(el("div", { class: "stack" }, [
          codeInput,
          el("button", {
            class: "btn btn-primary btn-block", type: "button",
            onclick: function () { App.unlock(codeInput.value); }
          }, [icon("unlock", 18), el("span", { text: "Déverrouiller" })])
        ]), 1),
        reveal(el("button", {
          class: "btn btn-ghost btn-block", type: "button", text: "Se déconnecter de l'équipe", "data-key": "logout",
          onclick: function () { UI.set({ modal: { type: "logout" } }); }
        }), 2)
      ])
    ]);
  }

  /* -------------------------------------------------------- Liste des sujets --- */

  /* Dernière activité du sujet (§3), en relatif court : « Actif il y a 2 h ». La date exacte est
   * dans la feuille d'informations (« Dernière activité le … »). Une date illisible ne dit rien ;
   * une date dans le futur (horloges décalées) se lit « à l'instant ». */
  function activityText(iso) {
    if (!iso) { return ""; }
    var time = new Date(iso).getTime();
    if (isNaN(time)) { return ""; }
    var elapsed = Date.now() - time;
    if (elapsed < 60000) { return "Actif à l'instant"; }
    if (elapsed < 3600000) { return "Actif il y a " + Math.floor(elapsed / 60000) + " min"; }
    if (elapsed < 86400000) { return "Actif il y a " + Math.floor(elapsed / 3600000) + " h"; }
    var days = Math.floor(elapsed / 86400000);
    if (days < 7) { return "Actif il y a " + (days === 1 ? "1 jour" : days + " jours"); }
    var date = new Date(time);
    return "Actif le " + ("0" + date.getDate()).slice(-2) + "/" + ("0" + (date.getMonth() + 1)).slice(-2) +
      "/" + date.getFullYear();
  }

  function activityNote(topic) {
    var text = activityText(topic.updatedAt);
    return text ? el("div", { class: "card-meta card-activity", text: text }) : null;
  }

  /* Carte de sujet, à la façon d'une liste de conversations : le titre et sa dernière activité. Compteurs,
   * extrait, auteur et flèche sont retirés (épure) : ils se lisent dans le sujet lui-même. Le badge de statut reste
   * posé ici pour les couches produit (groupes de l'accueil), qui le retirent d'elles-mêmes. */
  function topicCard(topic) {
    return el("button", {
      class: "card", type: "button", "data-key": "topic-" + topic.id, "data-motion-key": "t:" + topic.id,
      onclick: function () { App.go("#/topic/" + topic.id); }
    }, [
      el("div", { class: "row", style: { gap: "10px", alignItems: "flex-start" } }, [
        el("div", { class: "card-title", style: { flex: "1" }, text: topic.title }),
        toneBadge(Core.TOPIC_STATUS_LABELS[topic.status], TOPIC_TONES[topic.status])
      ]),
      /* Le pied ne porte plus que l'activité ; js/product-ui.js y glisse « Nouveau : … » quand il y a du neuf. */
      el("div", { class: "card-foot" }, [el("div", { class: "row-wrap", style: { gap: "6px" } }, [activityNote(topic)])])
    ]);
  }

  function screenTopics() {
    var state = Store.view;
    /* ⚠️ Ordre et recherche viennent de ProductView.visibleTopics : js/product-ui.js appelle la
     * MÊME fonction pour ranger les cartes par groupe (une carte par sujet, dans cet ordre). Deux
     * règles copiées finiraient par diverger, et le regroupement serait alors abandonné. Les
     * comptes ci-dessous ne dépendent pas de l'ordre (BL-060, BL-061). Sans ProductView (contexte
     * isolé, jamais en production : index.html le charge avant ce fichier), ni tri ni recherche. */
    var all = state.topics;
    var visible = typeof ProductView !== "undefined"
      ? ProductView.visibleTopics(state.topics, UI.local.search, UI.local.showArchived)
      : state.topics.filter(function (t) { return UI.local.showArchived || t.status !== "archived"; });
    var archivedCount = all.length - all.filter(function (t) { return t.status !== "archived"; }).length;

    var query = Utils.trim(UI.local.search);

    var body;
    /* Rien reçu encore en mode connecté (révision 0, aucun échange réussi depuis
     * l'ouverture) : l'équipe a peut-être cinquante sujets, inviter à créer « un
     * premier sujet » serait faux. Une équipe vide confirmée par le serveur
     * (échange réussi) et le mode local gardent l'invitation. */
    if (!all.length && awaitingFirstData()) {
      body = emptyState("sync", "Pas encore de données sur cet appareil",
        "Elles s'afficheront à la prochaine connexion.");
    } else if (!all.length) {
      body = emptyState("message", "Aucun sujet pour l'instant",
        "Lancez la préparation de la prochaine réunion en ajoutant un premier sujet.",
        el("button", {
          class: "btn btn-primary", type: "button", "data-key": "create-topic-first",
          onclick: function () { UI.set({ modal: { type: "createTopic" } }); }
        }, [icon("plus", 18), el("span", { text: "Ajouter un sujet" })]));
    } else {
      var list = el("div", { class: "stack topics-grid" });
      var index = 0;
      if (all.length > CONFIG.SEARCH_THRESHOLD) {
        var search = el("input", {
          class: "input", type: "search", placeholder: "Rechercher un sujet", "aria-label": "Rechercher un sujet",
          "data-draft": "topics:search", value: UI.local.search,
          oninput: Utils.debounce(function (e) { UI.set({ search: e.target.value }); }, 180)
        });
        list.appendChild(el("div", { class: "search-wrap" }, [
          el("span", { class: "search-icon" }, [icon("search", 19)]), search
        ]));
      }
      if (!visible.length) {
        /* Un filtre sans résultat n'est PAS un premier usage : l'utilisateur pense
         * « j'ai mal cherché », pas « je ne sais pas démarrer ». La réponse est donc
         * un rappel du filtre actif et une sortie qui l'élargit réellement — un
         * texte seul laissait l'écran sans issue.
         *
         * ⚠️ Seulement s'il Y A une recherche : la liste peut aussi être vide parce
         * que tous les sujets sont archivés, et on afficherait alors des guillemets
         * vides avec un bouton sans effet. */
        if (query) {
          /* Le terme est écourté : il est déjà visible dans le champ juste au-dessus,
           * et une URL collée pousserait la carte au-delà de la largeur de l'écran. */
          var shown = Utils.limit(Utils.trim(UI.local.search), 28);
          if (shown.length < Utils.trim(UI.local.search).length) { shown += "…"; }
          list.appendChild(el("div", { class: "note" }, [
            icon("search", 16),
            el("div", { class: "note-body" }, [
              el("div", { text: "Aucun sujet ne correspond à « " + shown + " »." }),
              el("button", {
                class: "btn btn-sm btn-ghost", type: "button",
                style: { marginTop: "8px" },
                onclick: function () {
                  /* Le champ est vidé AVANT le rendu : `captureDrafts` lit le DOM au
                   * début du rendu, et `restoreDrafts` réinjecterait sinon l'ancien
                   * terme dans le champ reconstruit — liste élargie, champ inchangé. */
                  var field = document.querySelector('[data-draft="topics:search"]');
                  if (field) { field.value = ""; }
                  UI.set({ search: "" });
                }
              }, [icon("close", 15), el("span", { text: "Effacer la recherche" })])
            ])
          ]));
        } else {
          list.appendChild(el("p", { class: "hint", text: "Tous les sujets sont archivés." }));
        }
      }
      visible.forEach(function (topic) { list.appendChild(reveal(topicCard(topic), index++)); });
      if (archivedCount > 0) {
        list.appendChild(el("button", {
          class: "btn btn-ghost btn-block", type: "button", "data-key": "show-archived",
          onclick: function () {
            Utils.storage.set(CONFIG.KEYS.showArchived, !UI.local.showArchived);
            UI.set({ showArchived: !UI.local.showArchived });
          }
        }, [
          icon(UI.local.showArchived ? "eye" : "archive", 16),
          el("span", {
            text: UI.local.showArchived
              ? "Masquer les sujets archivés"
              : "Afficher les sujets archivés (" + archivedCount + ")"
          })
        ]));
      }
      body = list;
    }

    var screen = el("div", { class: "screen" }, [
      topbar({
        title: CONFIG.APP_NAME,
        sub: App.user.name ? "Bonjour " + App.user.name : null,
        actions: [statusPill()]
      }),
      el("div", { class: "content" }, [body])
    ]);

    if (all.length) {
      screen.appendChild(el("button", {
        class: "fab", type: "button", "data-key": "create-topic",
        onclick: function () { UI.set({ modal: { type: "createTopic" } }); }
      }, [icon("plus", 20), el("span", { text: "Nouveau sujet" })]));
    }
    return screen;
  }

  /* ------------------------------------------------------- Écran débat --- */

  /* Deux messages anonymes ne se regroupent JAMAIS, même consécutifs : les
   * empiler laisserait entendre qu'ils viennent de la même personne. */
  function messageGroupKey(message) {
    if (message.anon) { return "anon:" + message.id; }
    return "id:" + (message.authorId || message.authorName);
  }

  /* La citation n'est plus un contrôle. Un bouton dans un bouton est un arbre
   * invalide, et le stopPropagation ne masquait le symptôme qu'à la souris :
   * pour un lecteur d'écran un bouton est une feuille, la citation devenait
   * soit inatteignable, soit absorbée dans le nom du bouton parent — où le nom
   * de la personne CITÉE passait en tête, attribuant le message à la mauvaise
   * personne. Au doigt, c'était une cible non signalée logée dans une cible
   * plus grande, avec une action radicalement différente.
   * Le dessin ne bouge pas. L'action « aller au message cité » n'est pas
   * perdue : elle passe dans la feuille du message, où elle gagne un libellé
   * et une cible pleine au lieu d'une bande muette. */
  function quoteBlock(topic, message) {
    var quoted = Core.findMessage(topic, message.quoteId);
    if (!quoted) { return null; }
    return el("div", { class: "quote" }, [
      el("span", { class: "visually-hidden", text: "En réponse à " }),
      el("div", { class: "quote-author", text: quoted.authorName }),
      el("div", { class: "quote-text", text: quoted.text })
    ]);
  }

  /* Réactions PROPOSÉES. « Je m'engage » (💪) est retirée de l'interface : elle n'est plus proposée, et celles déjà
   * posées ne s'affichent plus. Elle reste dans Core.REACTIONS, que le serveur valide aussi : la retirer de cette
   * liste obligerait à redéployer le backend et rendrait invalides les données existantes. */
  var RETIRED_REACTIONS = ["💪"];
  var OFFERED_REACTIONS = Core.REACTIONS.filter(function (emoji) { return RETIRED_REACTIONS.indexOf(emoji) < 0; });

  function reactionsRow(topic, message) {
    var keys = Object.keys(message.reactions);
    if (!keys.length) { return null; }
    var byEmoji = {};
    keys.forEach(function (pid) {
      var emoji = message.reactions[pid];
      if (!byEmoji[emoji]) { byEmoji[emoji] = { count: 0, mine: false }; }
      byEmoji[emoji].count += 1;
      if (pid === App.user.id) { byEmoji[emoji].mine = true; }
    });
    var row = el("div", { class: "reactions" });
    OFFERED_REACTIONS.forEach(function (emoji) {
      var info = byEmoji[emoji];
      if (!info) { return; }
      var label = Utils.reactionLabel(emoji);
      row.appendChild(el("button", {
        class: "reaction" + (info.mine ? " mine" : ""), type: "button", "data-key": "reaction-" + emoji,
        title: label + " · " + Utils.plural(info.count, "personne", "personnes"),
        "aria-label": label + " (" + Utils.plural(info.count, "personne", "personnes") + ")",
        "aria-pressed": info.mine ? "true" : "false",
        onclick: function (e) { e.stopPropagation(); App.actions.setReaction(topic.id, message.id, emoji); }
      }, [
        Utils.reactionMark(emoji, 17),
        info.count > 1 ? el("span", { class: "reaction-count", text: String(info.count) }) : null
      ]));
    });
    return row.childNodes.length ? row : null;
  }

  /* ================================================ Gestes sur les bulles ==== */

  /* ⚠️ Au doigt, toucher une bulle ne fait rien : ouvrir des actions en faisant défiler le fil était le défaut le
   * plus fréquent. Deux gestes les remplacent, comme dans les messageries :
   *   - APPUI LONG (LONG_PRESS_MS) : la feuille d'actions du message ;
   *   - GLISSER VERS LA DROITE (au-delà de SWIPE_QUOTE_PX) : la citation, comme « Citer ».
   * Les écouteurs vivent sur le document, en délégation : le rendu détruit et recrée les bulles, un écouteur par bulle
   * ne survivrait pas. Le geste ne tient que des identifiants, jamais un nœud dont il aurait besoin après coup.
   * Seul le toucher (et le stylet) passe par ici. La souris garde le clic, et le clic droit ouvre aussi la feuille ;
   * le clavier et les lecteurs d'écran gardent Entrée et le double toucher, qui produisent un clic sans geste.
   * `touch-action: pan-y` (app.css) laisse le défilement vertical au navigateur : un geste qui part en vertical est
   * abandonné, et le navigateur l'annonce par `pointercancel`. Un départ au bord gauche de l'écran (EDGE_PX) est
   * laissé au système : c'est le geste « retour » d'iOS et d'Android. */
  var LONG_PRESS_MS = 450;
  var MOVE_TOLERANCE_PX = 10;
  var SWIPE_QUOTE_PX = 64;
  var SWIPE_MAX_PX = 88;
  var EDGE_PX = 24;
  var gesture = null;
  var touchClickIgnoredUntil = 0;
  var swallowClickUntil = 0;

  function onClickAfterLongPress(e) {
    if (Utils.now() >= swallowClickUntil) { return; }
    swallowClickUntil = 0;
    e.preventDefault();
    e.stopPropagation();
  }

  function openMessageSheet(topicId, messageId) {
    UI.set({ sheet: { type: "message", topicId: topicId, messageId: messageId } });
  }

  /* Citer : la même chose que l'action « Citer » de la feuille. Le focus va au champ, le clavier s'ouvre.
   * La citation appartient au fil OÙ l'on est (fil principal, ou exploration d'un message) : elle n'apparaît que dans
   * le composeur de ce fil, et toute navigation l'efface (js/app.js, appliquer). */
  function quoteMessage(topicId, messageId) {
    var root = viewBranchRoot(topicId);
    UI.set({ sheet: null, quote: { topicId: topicId, messageId: messageId, branchRootId: root } });
    var node = findDraftNode(composerKey(topicId, root));
    if (node) { try { node.focus(); } catch (e) { /* champ absent */ } }
  }

  /* --------------------------------------------------------------- Explorer --- */

  /* Une exploration n'est PAS un objet : c'est l'ensemble des messages dont `branchRootId` désigne un message du fil
   * principal (js/state.js). Ouvrir une exploration n'écrit rien ; elle existe dès son premier message. */

  /* Message source de l'exploration affichée, ou null dans le fil principal (et partout ailleurs). */
  function viewBranchRoot(topicId) {
    var route = App.route || {};
    return route.name === "branch" && route.topicId === topicId ? route.messageId : null;
  }

  /* Clé de brouillon du composeur : un brouillon par fil, jamais partagé entre le fil principal et une exploration, ni
   * entre deux explorations. Le préfixe `composer:` est celui que l'appareil conserve (storedDraft). */
  function composerKey(topicId, branchRootId) {
    return "composer:" + topicId + (branchRootId ? ":branch:" + branchRootId : "");
  }

  function openBranch(topicId, messageId) {
    App.go("#/topic/" + topicId + "/branch/" + messageId);
  }

  /* Réponses par message source, en UNE passe sur le fil : jamais un parcours complet par bulle. Index de rendu, rien
   * de partagé ni de stocké. */
  function branchCounts(topic) {
    var counts = Object.create(null);
    topic.messages.forEach(function (m) {
      if (m.branchRootId) { counts[m.branchRootId] = (counts[m.branchRootId] || 0) + 1; }
    });
    return counts;
  }

  /* Pourquoi « Explorer » n'est pas disponible, ou "" s'il l'est. Jamais un masquage : comme l'épingle, la commande
   * reste visible et dit ce qui manque (le serveur ne sait pas encore ranger une réponse d'exploration). */
  function branchesUnavailableReason() {
    if (typeof App.branchesAvailable !== "function" || App.branchesAvailable()) { return ""; }
    return App.branchesOutdatedServer && App.branchesOutdatedServer()
      ? "le serveur de l'équipe doit être mis à jour"
      : "disponible à la prochaine connexion au serveur de l'équipe";
  }

  /* « 3 réponses » sous un message du fil principal : un bouton FRÈRE de la rangée, jamais dans la bulle (qui est déjà
   * un bouton). Aligné du même côté que la bulle, d'après la même règle (un message anonyme se pose toujours à gauche). */
  function branchLink(topic, message, count) {
    var mine = App.ownsMessage(message) && !message.anon;
    var label = Utils.plural(count, "réponse", "réponses");
    return el("div", { class: "branch-row" + (mine ? " mine" : ""), "data-motion-key": "x:" + message.id }, [
      el("button", {
        class: "branch-link", type: "button", "data-key": "branch-" + message.id,
        "aria-label": label + " : explorer cette idée",
        onclick: function () { openBranch(topic.id, message.id); }
      }, [icon("explore", 15), el("span", { text: label })])
    ]);
  }

  /* Rangées d'un fil (séparateurs de jour, regroupement par auteur), partagées par le fil principal et l'exploration.
   * `after(message)` peut rendre un nœud posé juste sous la rangée (le lien d'exploration) : il interrompt alors le
   * regroupement, le message suivant reprend son auteur. */
  function appendThreadRows(container, topic, messages, after) {
    var previous = null;
    var lastDay = null;
    messages.forEach(function (message) {
      if (!lastDay || !Utils.sameDay(lastDay, message.createdAt)) {
        container.appendChild(el("div", { class: "day-sep", text: Utils.relativeDay(message.createdAt) }));
        lastDay = message.createdAt;
        previous = null;
      }
      container.appendChild(messageRow(topic, message, previous));
      previous = message;
      var extra = after ? after(message) : null;
      if (extra) { container.appendChild(extra); previous = null; }
    });
  }

  /* Presse-papiers : l'API moderne d'abord, puis l'ancienne commande pour les navigateurs qui ne l'ont pas. */
  function copyText(text, doneMessage) {
    var done = function () { UI.toast(doneMessage || "Texte copié."); };
    var failed = function () { UI.toast("Copie impossible sur cet appareil.", "error"); };
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(done, function () { legacyCopy(text) ? done() : failed(); });
        return;
      }
    } catch (e) { /* repli ci-dessous */ }
    if (legacyCopy(text)) { done(); } else { failed(); }
  }

  function legacyCopy(text) {
    var area = el("textarea", { class: "visually-hidden", readonly: true, "aria-hidden": "true" });
    area.value = text;
    document.body.appendChild(area);
    var ok = false;
    try { area.select(); ok = !!(document.execCommand && document.execCommand("copy")); } catch (e) { ok = false; }
    document.body.removeChild(area);
    return ok;
  }

  function buzz(ms) {
    // qa-allow: js-vibrate — bonus haptique facultatif, détecté avant usage et sous try : sans lui (iOS), le geste fonctionne pareil.
    try { if (navigator.vibrate) { navigator.vibrate(ms); } } catch (e) { /* refusé : sans effet */ }
  }

  /* Le sujet se lit sur le fil, jamais sur la bulle : deux bulles anonymes doivent rester identiques (BL-013). */
  function topicOfBubble(bubble) {
    var thread = bubble.closest ? bubble.closest("[data-thread]") : null;
    return thread ? thread.getAttribute("data-thread") : null;
  }

  function gestureBubble(target) {
    var node = target && target.closest ? target.closest(".bubble[data-message-id]") : null;
    return node && appRoot && appRoot.contains(node) ? node : null;
  }

  function resetGesture() {
    if (!gesture) { return; }
    if (gesture.timer) { clearTimeout(gesture.timer); }
    var col = gesture.col;
    if (col) {
      col.classList.remove("is-swiping");
      col.style.transform = "";
    }
    if (gesture.bubble) { gesture.bubble.classList.remove("is-pressing"); }
    if (gesture.cue && gesture.cue.parentNode) { gesture.cue.parentNode.removeChild(gesture.cue); }
    gesture = null;
  }

  function onBubblePointerDown(e) {
    if (e.pointerType === "mouse" || e.isPrimary === false) { return; }
    var bubble = gestureBubble(e.target);
    if (!bubble) { return; }
    resetGesture();
    var g = gesture = {
      id: e.pointerId, x0: e.clientX, y0: e.clientY, dx: 0, mode: "pending",
      bubble: bubble, col: bubble.parentNode, cue: null, armed: false,
      topicId: topicOfBubble(bubble), messageId: bubble.getAttribute("data-message-id"), timer: 0
    };
    bubble.classList.add("is-pressing");
    g.timer = setTimeout(function () {
      if (gesture !== g || g.mode !== "pending") { return; }
      /* Le geste reste suivi jusqu'au relâcher (mode "done") : le doigt est encore posé, et le clic que le
       * navigateur émettra en le levant tomberait sur le fond de la feuille qui vient de s'ouvrir — et la fermerait. */
      g.mode = "done";
      g.timer = 0;
      g.bubble.classList.remove("is-pressing");
      buzz(12);
      openMessageSheet(g.topicId, g.messageId);
    }, LONG_PRESS_MS);
  }

  function onBubblePointerMove(e) {
    var g = gesture;
    if (!g || e.pointerId !== g.id || g.mode === "done") { return; }
    var dx = e.clientX - g.x0;
    var dy = e.clientY - g.y0;
    if (g.mode === "pending") {
      if (Math.abs(dx) < MOVE_TOLERANCE_PX && Math.abs(dy) < MOVE_TOLERANCE_PX) { return; }
      clearTimeout(g.timer);
      g.timer = 0;
      g.bubble.classList.remove("is-pressing");
      if (dx > 0 && Math.abs(dx) > Math.abs(dy) * 1.5 && g.x0 > EDGE_PX) {
        g.mode = "swipe";
        g.col.classList.add("is-swiping");
        g.cue = el("span", { class: "swipe-cue", "aria-hidden": "true" }, [icon("quote", 18)]);
        g.col.parentNode.insertBefore(g.cue, g.col.parentNode.firstChild);
      } else {
        g.mode = "cancel";
        return;
      }
    }
    if (g.mode !== "swipe") { return; }
    if (e.cancelable) { e.preventDefault(); }
    /* Au-delà du seuil, la bulle résiste : on sent que le geste est « pris » sans qu'elle file hors de l'écran. */
    var shift = dx <= 0 ? 0 : dx <= SWIPE_QUOTE_PX ? dx : SWIPE_QUOTE_PX + (dx - SWIPE_QUOTE_PX) * 0.3;
    g.dx = dx;
    g.col.style.transform = "translateX(" + Math.min(shift, SWIPE_MAX_PX) + "px)";
    var armed = dx >= SWIPE_QUOTE_PX;
    if (armed !== g.armed) {
      g.armed = armed;
      g.cue.classList.toggle("is-armed", armed);
      if (armed) { buzz(10); }
    }
    g.cue.style.opacity = String(Math.min(1, dx / SWIPE_QUOTE_PX));
  }

  function onBubblePointerEnd(e) {
    var g = gesture;
    if (!g || e.pointerId !== g.id) { return; }
    var cancelled = e.type === "pointercancel";
    /* Quel que soit le geste, le clic qui le suit n'ouvre rien : c'est ce qui fait qu'un toucher « ne fait rien ». */
    touchClickIgnoredUntil = Utils.now() + 800;
    /* Après un appui long, ce clic-là n'atteint RIEN : ni le fond de la feuille (qui la fermerait), ni une action. */
    if (g.mode === "done") { swallowClickUntil = Utils.now() + 400; }
    var quote = !cancelled && g.mode === "swipe" && g.dx >= SWIPE_QUOTE_PX;
    resetGesture();
    if (quote) { quoteMessage(g.topicId, g.messageId); }
  }

  /* Android déclenche le menu contextuel sur un appui long, et iOS sa loupe : le geste est à nous. À la souris, le
   * clic droit ouvre la feuille d'actions, l'équivalent de bureau de l'appui long. */
  function onBubbleContextMenu(e) {
    var bubble = gestureBubble(e.target);
    if (!bubble) { return; }
    e.preventDefault();
    if (gesture) { return; }
    var topicId = topicOfBubble(bubble);
    if (topicId) { openMessageSheet(topicId, bubble.getAttribute("data-message-id")); }
  }

  function bindBubbleGestures() {
    if (!document.addEventListener) { return; }
    document.addEventListener("pointerdown", onBubblePointerDown, true);
    document.addEventListener("pointermove", onBubblePointerMove, { capture: true, passive: false });
    document.addEventListener("pointerup", onBubblePointerEnd, true);
    document.addEventListener("pointercancel", onBubblePointerEnd, true);
    document.addEventListener("contextmenu", onBubbleContextMenu, true);
    document.addEventListener("click", onClickAfterLongPress, true);
  }

  function messageRow(topic, message, previous) {
    /* Deux notions distinctes, à ne pas confondre :
     *   `owns`  — mes droits sur le message (modifier, signer / anonymiser) ;
     *   `mine`  — le CÔTÉ où la bulle se pose et sa couleur.
     * Un message publié en anonyme se présente toujours comme celui d'un
     * autre : à gauche, en neutre, pastille « ? ». Sinon un regard par-dessus
     * l'épaule suffirait à désigner l'auteur, et l'anonymat ne tiendrait que
     * sur les appareils des autres. Mes droits, eux, ne changent pas. */
    var owns = App.ownsMessage(message);
    var mine = owns && !message.anon;
    var grouped = false;
    if (previous) {
      var samePerson = messageGroupKey(previous) === messageGroupKey(message);
      var sameDay = Utils.sameDay(previous.createdAt, message.createdAt);
      grouped = samePerson && sameDay;
    }

    var reactions = reactionsRow(topic, message);
    var classes = "msg-row" + (mine ? " mine" : "") + (grouped ? " grouped" : " first") +
      (reactions ? " has-reactions" : "");
    var col = el("div", { class: "msg-col" });

    if (!grouped && !mine) {
      /* Repris dans le nom accessible de la bulle : le laisser lisible ici le
       * ferait annoncer deux fois. */
      col.appendChild(el("div", { class: "msg-author", "aria-hidden": "true", text: message.authorName }));
    }

    /* Cadenas sur un message SIGNÉ seulement : sur un anonyme il ne paraîtrait
     * que chez son auteur, et le désignerait à qui regarde l'écran (§5). Le
     * verrou d'un anonyme s'explique dans sa feuille (« Modifier » désactivé). */
    var locked = mine && Core.isMessageLocked(message, App.user.id);

    /* Un message encore en file n'existe que sur cet appareil. Afficher son
     * heure serait deux fois trompeur : elle laisse croire qu'il est parti, et
     * ce n'est même pas l'heure que les autres verront, puisque c'est le serveur
     * qui l'attribue en appliquant l'action. On annonce donc l'état réel — un
     * état, pas une alerte : il dure le temps d'un aller-retour, et ne se
     * remarque que le jour où quelque chose coince. */
    var sending = Store.pendingMessageIds()[message.id] === true;
    var metaBits = [sending ? "envoi…" : Utils.formatTime(message.createdAt)];
    if (!sending && message.updatedAt && message.updatedAt !== message.createdAt) { metaBits.push("modifié"); }

    /* L'auteur figure TOUJOURS dans le nom accessible : le regroupement est une
     * économie visuelle, pas une raison de priver le lecteur d'écran de
     * l'attribution. Sans lui, un message groupé s'annonce « d'accord aussi,
     * 14:33, bouton » sans dire de qui, et mes propres messages n'ont jamais
     * d'auteur du tout. Le cadenas, lui, est un SVG masqué : sans la mention
     * explicite, l'état verrouillé n'existe que pour l'œil. */
    /* Toucher la bulle ne fait plus rien : les actions s'ouvrent par un APPUI LONG, la citation par un GLISSER
     * vers la droite (voir « Gestes sur les bulles »). Le clic reste la voie du clavier (Entrée, Espace), des
     * lecteurs d'écran et de la souris : un clic qui suit un geste tactile est ignoré. */
    var bubble = el("button", {
      class: "bubble", type: "button", dataset: { messageId: message.id },
      onclick: function () {
        if (Utils.now() < touchClickIgnoredUntil) { return; }
        openMessageSheet(topic.id, message.id);
      }
    }, [
      el("span", { class: "visually-hidden", text: (mine ? "Vous" : message.authorName) + ". " }),
      message.quoteId ? quoteBlock(topic, message) : null,
      el("div", { class: "bubble-text", text: message.text }),
      /* Épure : l'heure n'est plus posée sur chaque bulle (elle est dans la feuille du message, à l'appui long, et
       * reste lue au lecteur d'écran). Ne s'affichent que les états qui changent la lecture : « envoi… », « modifié ». */
      sending || metaBits.length > 1 || locked
        ? el("div", { class: "bubble-meta" }, [
          sending || metaBits.length > 1 ? el("span", { text: sending ? "envoi…" : "modifié" }) : null,
          locked ? icon("lock", 12) : null
        ])
        : null,
      sending ? null : el("span", { class: "visually-hidden", text: ", " + metaBits[0] }),
      locked ? el("span", { class: "visually-hidden", text: ", verrouillé" }) : null,
      el("span", { class: "visually-hidden", text: ". Actions du message." })
    ]);

    col.appendChild(bubble);
    if (reactions) { col.appendChild(reactions); }

    /* Pastille d'initiales à gauche des messages des autres : elle n'apparaît
     * qu'en tête de groupe, et laisse une place vide (avatar-ghost) sur les
     * messages suivants pour que les bulles restent alignées. */
    var children = [col];
    if (!mine) {
      var avatarClass = "avatar" +
        (message.anon ? " avatar-anon" : "") +
        (grouped ? " avatar-ghost" : "");
      children = [
        el("div", { class: avatarClass, "aria-hidden": "true", text: message.anon ? "?" : Utils.initials(message.authorName) }),
        col
      ];
    }

    return el("div", { class: classes }, children);
  }

  /* Mouvement réduit : `behavior: "smooth"` passé à scrollIntoView l'emporte sur `scroll-behavior`
   * du CSS (A11-014). "auto" rend la main à la feuille de style, qui défile sans animation. */
  function motionReduced() {
    try { return !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches); }
    catch (e) { return false; }
  }

  UI.scrollToMessage = function (messageId) {
    var nodes = document.querySelectorAll("[data-message-id]");
    for (var i = 0; i < nodes.length; i++) {
      if (nodes[i].getAttribute("data-message-id") === messageId) {
        nodes[i].scrollIntoView({ block: "center", behavior: motionReduced() ? "auto" : "smooth" });
        /* Le clignotement ne dit rien à qui ne voit pas l'écran : sans
         * déplacement du focus, le lecteur d'écran reste là où la feuille s'est
         * fermée et rien n'indique qu'on a été emmené ailleurs dans le fil. */
        try { nodes[i].focus({ preventScroll: true }); } catch (e) { /* non focalisable */ }
        nodes[i].classList.add("flash");
        (function (node) {
          setTimeout(function () { node.classList.remove("flash"); }, 1200);
        })(nodes[i]);
        return;
      }
    }
  };

  /* ⚠️ Le rendu DÉTRUIT et reconstruit le composeur (voir UI.render) : une transition CSS ne se joue donc jamais, le
   * nœud neuf naît déjà dans son état final. Le geste de bascule lève ce drapeau ; le rendu qu'il provoque le consomme
   * UNE fois et pose `is-flip`, que app.css traduit en animation depuis l'ancien état. Un rendu ultérieur (données
   * reçues) ne rejoue rien : le drapeau est retombé. Il porte la clé de l'interrupteur actionné : celui du composeur
   * et celui de « Nouveau sujet » ne s'animent jamais l'un pour l'autre. */
  var signatureFlip = null;

  /* ⚠️ Toucher un bouton lui donne le focus : le champ en cours de frappe le perd, et le téléphone range le clavier
   * au milieu de la phrase. Les commandes qui accompagnent la frappe (interrupteur de signature, Envoyer, Annuler la
   * citation) refusent donc de PRENDRE le focus quand un champ de saisie l'a. Le clic n'est pas annulé, seul le
   * transfert de focus l'est (défaut de `mousedown`, émis aussi après un toucher sur iOS et Android) : le clavier
   * reste ouvert, et le rendu qui suit rend le focus au champ, curseur compris (restoreDrafts). Au clavier physique,
   * rien ne change : Tab donne le focus à la commande, Espace l'actionne, et le focus y reste. */
  function keepTypingFocus(e) {
    var active = document.activeElement;
    if (active && active.hasAttribute && active.hasAttribute("data-draft")) { e.preventDefault(); }
  }

  /* Interrupteur signé / anonyme, partagé par le composeur et « Nouveau sujet » : la même décision a le même geste et
   * les mêmes mots partout. Son libellé est STABLE (« Publier en anonyme ») : c'est son état, pas son texte, qui
   * change — un bouton dont le libellé alternait entre l'action et l'état se lisait dans les deux sens. Le nom affiché
   * à gauche est celui que les autres verront ; la description du contrôle le reprend. Après la bascule, le focus
   * revient sur lui (même clé) et le lecteur d'écran annonce le nouvel état (aria-checked).
   * o : { anon, key (data-key), whoId, whoText, onToggle, describedBy (facultatif : ids ajoutés à la description) } */
  function signatureRow(o) {
    var flip = signatureFlip === o.key;
    if (flip) { signatureFlip = null; }
    return el("div", { class: "signature-toggle" + (o.anon ? " is-anon" : "") + (flip ? " is-flip" : "") }, [
      el("span", { class: "who" }, [
        icon(o.anon ? "mask" : "user", 15),
        el("span", { class: "who-name", id: o.whoId, text: o.whoText })
      ]),
      el("button", {
        class: "sig-switch", type: "button", role: "switch", "aria-checked": o.anon ? "true" : "false",
        "data-key": o.key, "aria-describedby": o.whoId + (o.describedBy ? " " + o.describedBy : ""),
        onmousedown: keepTypingFocus,
        onclick: function () { signatureFlip = o.key; o.onToggle(); }
      }, [
        el("span", { class: "sig-label", text: "Publier en anonyme" }),
        el("span", { class: "sig-track", "aria-hidden": "true" }, [
          el("span", { class: "sig-thumb" }, [icon(o.anon ? "mask" : "user", 11)])
        ])
      ])
    ]);
  }

  /* La citation en cours, si elle appartient à CE fil (même sujet, même exploration ou fil principal). */
  function quoteHere(topic, branchRootId) {
    var q = UI.local.quote;
    return q && q.topicId === topic.id && (q.branchRootId || null) === (branchRootId || null) ? q : null;
  }

  /* `branchRootId` : le composeur publie dans l'exploration de ce message (null : fil principal). Même champ, même
   * anonymat, même envoi ; seuls la clé de brouillon et le rattachement changent. */
  function composer(topic, branchRootId) {
    branchRootId = branchRootId || null;
    var draftKey = composerKey(topic.id, branchRootId);
    var blocked = branchRootId ? branchesUnavailableReason() : "";
    var textarea = el("textarea", {
      class: "textarea grow", rows: "1", placeholder: "Votre message…", "aria-label": "Votre message",
      maxlength: Core.LIMITS.message, "data-draft": draftKey,
      oninput: function (e) { autoGrow(e.target); },
      onkeydown: function (e) {
        if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); send(); }
      }
    });

    function send() {
      var typed = textarea.value;
      var text = Utils.trim(typed);
      if (!text) { return; }
      dismissNote(draftKey);
      var quote = quoteHere(topic, branchRootId);
      var quoteId = quote ? quote.messageId : null;
      /* ⚠️ On vide le champ AVANT de déclencher l'action : le dispatch provoque
       * un rendu synchrone et la restauration des brouillons réinjecterait le
       * message déjà publié. */
      textarea.value = "";
      /* Le relais de brouillons doit être purgé ici aussi : sinon il réinjecte
       * au rendu suivant le message que l'on vient de publier — exactement le
       * piège que l'ordre ci-dessus évite pour l'instantané. */
      delete composerDrafts[draftKey];
      autoGrow(textarea);
      UI.local.quote = null;
      UI.local.scrollToBottom = true;
      /* Le champ est vidé tout de suite (ci-dessus), mais le texte lui revient si la publication est refusée EN LOCAL
       * (sujet supprimé entre-temps, texte refusé par le noyau) : le message d'erreur est déjà à l'écran, le texte
       * reste dans le champ et dans le brouillon durable. Une publication acceptée en file efface ce brouillon.
       * Issue inconnue (js/app.js d'avant, en cache, qui ne rend rien) : comportement d'avant, le texte est parti. */
      var sent = App.actions.createMessage(topic.id, text, quoteId, UI.local.composerAnon, branchRootId);
      if (!sent || typeof sent.then !== "function") { dropDraft(draftKey, typed); return; }
      sent.then(function (result) {
        if (result && result.ok === false) {
          keepRefused(draftKey, typed);
          if (quote && !UI.local.quote) { UI.set({ quote: quote }); }
        } else {
          dropDraft(draftKey, typed);
        }
      }, function () { /* issue inconnue : le brouillon durable reste, rien ne se perd */ });
    }

    var sendBtn = el("button", {
      class: "send-btn", type: "button", "aria-label": "Envoyer", "data-key": "send",
      /* Comme dans toute messagerie, le clavier reste ouvert après l'envoi : on enchaîne le message suivant. */
      onmousedown: keepTypingFocus, onclick: send
    }, [icon("send", 20)]);

    /* ⚠️ Un brouillon rédigé en anonyme n'est jamais affiché « Signé » par déduction (REC-RUI-001) : le choix est global, le
     * brouillon est par sujet. Le geste explicite de la personne (la bascule) retire l'indicateur AVANT ce rendu. */
    var note = draftNote[draftKey];
    if (note && !composerDrafts[draftKey]) { delete draftNote[draftKey]; delete noteSaid[draftKey]; note = undefined; }
    if (composerDrafts[draftKey] && anonDrafts[draftKey] && !UI.local.composerAnon) {
      UI.local.composerAnon = true;
      if (!note) { note = draftNote[draftKey] = "anon"; }
    }

    var parts = [];
    if (blocked) {
      parts.push(el("div", { class: "note", id: "composer-blocked" }, [
        icon("info", 14),
        el("span", { class: "note-body", text: "Écrire ici est momentanément impossible : " + blocked + "." })
      ]));
      textarea.disabled = true;
      textarea.setAttribute("aria-describedby", "composer-blocked");
      sendBtn.disabled = true;
    }
    if (quoteHere(topic, branchRootId)) {
      var quoted = Core.findMessage(topic, UI.local.quote.messageId);
      if (quoted) {
        parts.push(el("div", { class: "quote-preview" }, [
          el("div", { class: "quote-body" }, [
            el("div", { class: "quote-author", text: "En réponse à " + quoted.authorName }),
            el("div", { class: "quote-text", text: quoted.text })
          ]),
          el("button", { class: "btn-icon", type: "button", "aria-label": "Annuler la citation",
            onmousedown: keepTypingFocus, onclick: function () { UI.set({ quote: null }); } }, [icon("close", 18)])
        ]));
      }
    }

    if (note) {
      var said = !noteSaid[draftKey];
      noteSaid[draftKey] = true;
      var noteNode = el("div", { class: "note", id: "composer-restored" }, [
        icon("info", 14),
        el("span", { class: "note-body", text: note === "anon"
          ? "Brouillon retrouvé sur cet appareil. Il sera publié en anonyme : vérifiez avant d'envoyer."
          : "Brouillon retrouvé sur cet appareil. Vérifiez « Signé » ou « Anonyme » avant d'envoyer." })
      ]);
      /* Annoncée une seule fois (role=status) : un rendu de plus ne la relit pas ; le champ la porte en description. */
      if (said) { noteNode.setAttribute("role", "status"); }
      textarea.setAttribute("aria-describedby", "composer-restored");
      parts.push(noteNode);
    }

    /* L'état est lu ICI, après le rétablissement d'un brouillon anonyme (plus haut) : c'est lui qui décide de tout ce
     * qui suit — l'interrupteur, le nom, et les repères de la zone d'écriture. */
    var anon = UI.local.composerAnon === true;

    /* Repères d'anonymat DANS la zone d'écriture : on regarde le champ en tapant, pas la ligne du dessus. Jamais la
     * teinte seule — une icône, un texte (indication du champ, nom de l'envoi) et un trait en tirets le disent aussi. */
    if (anon) {
      textarea.setAttribute("placeholder", "Message anonyme…");
      textarea.setAttribute("aria-label", "Votre message anonyme");
      sendBtn.setAttribute("aria-label", "Envoyer en anonyme");
      sendBtn.classList.add("is-anon");
      sendBtn.appendChild(el("span", { class: "send-mark", "aria-hidden": "true" }, [icon("mask", 11)]));
    }

    /* Bascule signé / anonyme : un bouton masque dans la ligne d'écriture, comme les boutons d'outil d'une messagerie
     * IA. Plus de ligne « Signé : … » au-dessus du champ : l'état se lit dans le champ (masque, tirets, « Message
     * anonyme… ») et sur l'envoi, là où le regard est pendant la frappe. Libellé stable, état porté par aria-checked. */
    var anonBtn = el("button", {
      class: "anon-btn" + (anon ? " is-anon" : ""), type: "button", role: "switch", "aria-checked": anon ? "true" : "false",
      "aria-label": "Publier en anonyme", "data-key": "composer-anon", "aria-describedby": "composer-who",
      onmousedown: keepTypingFocus,
      onclick: function () {
        var next = !UI.local.composerAnon;
        dismissNote(draftKey);
        /* Geste explicite : le choix du brouillon suit (sinon un rechargement le rétablirait ou le perdrait). */
        if (composerDrafts[draftKey]) { stageDraft(draftKey, composerDrafts[draftKey], next); }
        UI.set({ composerAnon: next });
      }
    }, [icon("mask", 20), el("span", { class: "visually-hidden", id: "composer-who", text: anon ? "Anonyme" : "Signé : " + (App.user.name || "moi") })]);

    /* Le champ est enveloppé pour porter son repère à côté de lui (frère du <textarea>) : le champ garde sa clé de
     * brouillon et son rôle, et l'icône ne reçoit ni focus ni saisie (aria-hidden, pointer-events: none). */
    parts.push(el("div", { class: "composer-inner" }, [
      anonBtn,
      el("div", { class: "composer-field" }, [
        textarea,
        anon ? el("span", { class: "field-mark", "aria-hidden": "true" }, [icon("mask", 16)]) : null
      ]),
      sendBtn
    ]));

    return el("div", { class: "composer" + (anon ? " is-anon" : "") }, parts);
  }

  function screenTopic(topicId) {
    var topic = Core.findTopic(Store.view, topicId);
    if (!topic) { return screenMissing(); }

    /* Le fil principal ne montre que SES messages ; les réponses d'une exploration se signalent sous leur message
     * source (« 3 réponses »), sans encombrer le fil. */
    var threadInner = el("div", { class: "thread-inner" });
    var replies = branchCounts(topic);
    var main = topic.messages.filter(function (m) { return !m.branchRootId; });
    appendThreadRows(threadInner, topic, main, function (message) {
      return replies[message.id] ? branchLink(topic, message, replies[message.id]) : null;
    });

    if (!main.length) {
      threadInner.appendChild(emptyState("message", "La discussion démarre ici",
        "Partagez un constat, une idée, une question. Chacun peut réagir, citer et proposer."));
    }

    var thread = el("div", { class: "thread", dataset: { thread: topic.id } }, [threadInner]);

    return el("div", { class: "screen chat" }, [
      topbar({
        title: topic.title,
        back: App.remonter,
        backLabel: "Sujets",
        onTitle: function () { UI.set({ sheet: { type: "topicInfo", topicId: topic.id } }); },
        actions: [statusPill()]
      }),
      el("nav", { class: "quickbar" }, [
        el("button", {
          class: "btn", type: "button",
          onclick: function () { App.go("#/topic/" + topic.id + "/proposals"); }
        }, [
          icon("idea", 17),
          el("span", { text: "Propositions" }),
          topic.proposals.length ? el("span", { class: "badge tone-neutral", text: String(topic.proposals.length) }) : null
        ]),
        el("button", {
          class: "btn", type: "button",
          onclick: function () { App.go("#/topic/" + topic.id + "/conclusion"); }
        }, [
          icon("checkCircle", 17),
          el("span", { text: "Conclusion" }),
          agreedProposals(topic).length ? el("span", { class: "badge tone-neutral", text: String(agreedProposals(topic).length) }) : null
        ])
      ]),
      thread,
      composer(topic, null)
    ]);
  }

  /* Exploration d'un message : le message source en tête, un trait, puis les réponses et le composeur. L'adresse
   * (#/topic/{sujet}/branch/{message}) n'écrit rien : l'exploration n'existe qu'à son premier message. */
  function screenBranch(topicId, rootId) {
    var topic = Core.findTopic(Store.view, topicId);
    var root = topic ? Core.findMessage(topic, rootId) : null;
    /* Message absent, ou réponse d'une exploration (on n'explore pas une réponse) : « introuvable », retour vers la
     * discussion du sujet quand il existe. */
    if (!topic) { return screenMissing(); }
    if (!root || root.branchRootId) { return screenMissing("Discussion"); }

    var replies = topic.messages.filter(function (m) { return m.branchRootId === root.id; });
    /* Même côté que la bulle source (même règle que messageRow : un message anonyme se pose toujours à gauche). */
    var side = App.ownsMessage(root) && !root.anon ? " mine" : "";
    var inner = el("div", { class: "thread-inner" }, [
      el("section", { class: "branch-origin" + side, "aria-label": "Message d'origine" }, [
        el("div", { class: "branch-eyebrow" }, [icon("explore", 14), el("span", { text: "À partir de cette idée" })]),
        messageRow(topic, root, null)
      ]),
      el("div", { class: "branch-connector" + side, "aria-hidden": "true" })
    ]);
    if (replies.length) {
      var list = el("div", { class: "branch-replies" });
      appendThreadRows(list, topic, replies, null);
      inner.appendChild(list);
    } else {
      inner.appendChild(emptyState("explore", "Explorez cette idée",
        "Ce qui s'écrit ici reste attaché à ce message, sans encombrer la discussion du sujet."));
    }

    return el("div", { class: "screen chat branch" }, [
      /* « Exploration » et non « Explorer cette idée » : le titre doit tenir à côté de la pastille d'état à 320 px. */
      topbar({
        title: "Exploration",
        sub: topic.title,
        back: App.remonter,
        backLabel: "Discussion",
        actions: [statusPill()]
      }),
      el("div", { class: "thread thread-branch", dataset: { thread: topic.id, branch: root.id } }, [inner]),
      composer(topic, root.id)
    ]);
  }

  /* ⚠️ Appareil connecté qui n'a encore rien reçu (révision 0, aucun échange réussi depuis
   * l'ouverture) : après un rechargement sans copie locale, le contenu n'est pas « supprimé », il
   * n'est simplement pas encore là. Même règle pour l'accueil, l'écran manquant et le titre. */
  function awaitingFirstData() {
    var status = Sync.status();
    return !!status && status.code !== "local" && !status.revision && !status.lastSyncAt;
  }

  /* `backLabel` : le parent réel de l'écran demandé (« Discussion » pour une exploration dont le sujet existe). */
  function screenMissing(backLabel) {
    var waiting = awaitingFirstData();
    var back = el("button", { class: "btn btn-primary", type: "button", text: "Revenir aux sujets",
      onclick: function () { App.go("#/"); } });
    return el("div", { class: "screen" }, [
      topbar({ title: waiting ? "Pas encore disponible" : "Introuvable", back: App.remonter, backLabel: backLabel || "Sujets" }),
      el("div", { class: "content" }, [
        waiting
          ? emptyState("sync", "Contenu pas encore disponible sur cet appareil",
            "Il s'affichera à la prochaine connexion.", back)
          : emptyState("warning", "Ce contenu n'existe plus",
            "Il a peut-être été supprimé ou archivé par un autre membre de l'équipe.", back)
      ])
    ]);
  }

  /* ------------------------------------------------------- Propositions --- */

  function proposalCard(topic, proposal) {
    var summary = Core.voteSummary(proposal);
    /* Textes de vote (§8) : le même calcul que la synthèse et le nom de la barre. */
    var reading = ProductView.voteReading(proposal, Store.view.participants);
    var myVote = proposal.votes[App.user.id] || null;
    var total = summary.total || 1;

    /* Le titre entre dans le nom : dans une liste de propositions, cinq
     * contrôles nommés « Statut de la proposition » sont indiscernables au
     * balayage, et on change le statut de la mauvaise. Le changement part vers
     * toute l'équipe : il est annoncé, et « Écartée » se confirme d'abord. */
    var statusSelect = el("select", {
      class: "select", "aria-label": "Statut de la proposition : " + proposal.title, "data-key": "proposal-" + proposal.id + "-status",
      onchange: function (e) {
        var status = e.target.value;
        /* « Écartée » sort la proposition du jeu pour tout le monde, et rien ne dit qui l'a fait : confirmé
         * AVANT. Le menu revient tout de suite à l'état réel, l'annulation n'a donc rien à défaire. */
        if (status === "rejected") {
          e.target.value = proposal.status;
          UI.set({ modal: { type: "confirmStatus", kind: "proposal", topicId: topic.id, proposalId: proposal.id, status: status } });
          return;
        }
        applyProposalStatus(topic, proposal, status);
      }
    });
    Core.PROPOSAL_STATUSES.forEach(function (status) {
      statusSelect.appendChild(el("option", { value: status, selected: proposal.status === status, text: Core.PROPOSAL_STATUS_LABELS[status] }));
    });

    var VOTE_ICONS = { for: "check", against: "close", abstain: "flag" };
    var voteButtons = el("div", { class: "vote-actions" });
    Core.VOTE_VALUES.forEach(function (value) {
      voteButtons.appendChild(el("button", {
        class: "btn btn-sm btn-outline" + (myVote === value ? " active" : ""), type: "button",
        /* Le bouton porte la valeur qu'il exprime : c'est elle qui décide de sa
         * couleur une fois choisi (cf. app.css, .vote-actions .btn.active). */
        "data-vote": value, "data-key": "vote-" + proposal.id + "-" + value,
        "aria-pressed": myVote === value ? "true" : "false",
        onclick: function () {
          App.actions.setVote(topic.id, proposal.id, value);
          /* Le vote qui fait l'unanimité fait disparaître la carte : on dit où elle est allée. */
          var now = Core.findProposal(Core.findTopic(Store.view, topic.id), proposal.id);
          var reached = consensusOf(now);
          if (reached) {
            UI.toast(reached === "for" ? "Toute l'équipe est pour : la proposition passe en Consensus."
              : "Toute l'équipe est contre : la proposition passe en Consensus.");
          }
        }
      }, [icon(VOTE_ICONS[value], 15), el("span", { text: Core.VOTE_LABELS[value] })]));
    });

    /* Légende sous la barre : chaque couleur est nommée et chiffrée. Une barre
     * seule oblige à deviner ce que veut dire le chaud, et la teinte ne doit
     * jamais porter l'information toute seule. */
    var legend = el("div", { class: "vote-legend" }, [
      el("span", { class: "legend-chip legend-for" }, [el("span", { class: "swatch" }), el("span", { text: reading.positions[0] })]),
      el("span", { class: "legend-chip legend-against" }, [el("span", { class: "swatch" }), el("span", { text: reading.positions[1] })]),
      el("span", { class: "legend-chip legend-abstain" }, [el("span", { class: "swatch" }), el("span", { text: reading.positions[2] })])
    ]);
    /* Épure : le pourcentage favorable, la participation, l'auteur et la date ne servent pas à voter. Ils vivent
     * dans le volet « ⋯ », avec le statut et les actions rares. */
    var details = el("div", { class: "hint proposal-facts" }, [
      reading.favorable ? el("div", { text: reading.favorable }) : null,
      reading.participation ? el("div", { class: "product-participation", text: reading.participation }) : null,
      el("div", { text: "Proposée par " + proposal.authorName + (Utils.formatDateTime(proposal.createdAt) ? ", le " + Utils.formatDateTime(proposal.createdAt) : "") })
    ]);

    /* Statut, « Modifier » et « Retirer mon vote » se replient sous « Statut et actions » (refonte B) : on vote
     * souvent, on change un statut rarement. Le volet ouvert le reste quand un vote d'un collègue redessine
     * l'écran (rendu complet à chaque changement) : son état est retenu ici, par proposition. */
    var more = el("details", {
      class: "proposal-more", open: openProposalMore[proposal.id] === true,
      ontoggle: function (e) { openProposalMore[proposal.id] = e.target.open === true; }
    }, [
      /* Un identifiant, pas une clé de repère : le focus posé ici survit au rendu (keyOf lit l'id), sans que le
       * volet devienne l'ancre de repli de « Retirer mon vote » (BL-012 : le focus revient au dernier vote). */
      el("summary", { class: "proposal-more-summary", id: "proposal-" + proposal.id + "-more" }, [
        el("span", { class: "visually-hidden", text: "Statut et actions" }),
        el("span", { class: "proposal-more-dots", "aria-hidden": "true", text: "•••" })
      ])
    ]);

    return el("article", { class: "card card-static stack proposal-card", "data-motion-key": "p:" + proposal.id }, [
      el("div", { class: "row", style: { alignItems: "flex-start", gap: "10px" } }, [
        el("div", { class: "card-title", style: { flex: "1" }, text: proposal.title }),
        /* « En vote » est l'état normal : il ne se signale pas. Les autres états changent la lecture. */
        proposal.status !== "voting" ? toneBadge(Core.PROPOSAL_STATUS_LABELS[proposal.status], PROPOSAL_TONES[proposal.status]) : null
      ]),
      proposal.description ? el("div", { class: "pre-wrap", style: { fontSize: "14px", color: "var(--muted)" }, text: proposal.description }) : null,
      el("div", {}, [
        el("div", { class: "vote-bar", role: "img", "aria-label": reading.aria }, [
          el("span", { class: "vote-for", style: { width: (summary.counts.for / total * 100) + "%" } }),
          el("span", { class: "vote-against", style: { width: (summary.counts.against / total * 100) + "%" } }),
          el("span", { class: "vote-abstain", style: { width: (summary.counts.abstain / total * 100) + "%" } })
        ]),
        legend
      ]),
      voteButtons,
      Utils.append(more, [details, el("div", { class: "card-foot row-wrap" }, [
        myVote ? el("button", { class: "btn btn-sm btn-ghost", type: "button", "data-key": "vote-" + proposal.id + "-remove",
          onclick: function () { App.actions.removeVote(topic.id, proposal.id); } },
        [icon("close", 15), el("span", { text: "Retirer mon vote" })]) : null,
        App.ownsItem(proposal.id, proposal.authorId)
          ? el("button", { class: "btn btn-sm btn-ghost", type: "button",
            "data-key": "proposal-" + proposal.id + "-edit", onclick: function () { UI.set({ modal: { type: "editProposal", topicId: topic.id, proposalId: proposal.id } }); } },
          [icon("edit", 15), el("span", { text: "Modifier" })])
          : null,
        el("div", { class: "spacer" }),
        selectWrap(statusSelect)
      ])])
    ]);
  }

  /* Volets « Statut et actions » ouverts, par identifiant de proposition (voir proposalCard). */
  var openProposalMore = {};

  function screenProposals(topicId) {
    var topic = Core.findTopic(Store.view, topicId);
    if (!topic) { return screenMissing(); }

    var open = openProposals(topic);
    var list = el("div", { class: "stack" });
    if (!open.length) {
      list.appendChild(emptyState("idea", "Aucune proposition",
        "Transformez les idées de la discussion en propositions concrètes à soumettre au vote.",
        el("button", { class: "btn btn-primary", type: "button",
          "data-key": "create-proposal-first", onclick: function () { UI.set({ modal: { type: "createProposal", topicId: topic.id } }); } },
        [icon("plus", 18), el("span", { text: "Ajouter une proposition" })])));
    } else {
      open.forEach(function (proposal, i) { list.appendChild(reveal(proposalCard(topic, proposal), i)); });
    }

    var screen = el("div", { class: "screen" }, [
      topbar({
        title: "Propositions",
        sub: topic.title,
        back: App.remonter,
        backLabel: "Discussion",
        actions: [statusPill()]
      }),
      el("div", { class: "content" }, [list])
    ]);

    if (open.length) {
      screen.appendChild(el("button", {
        class: "fab", type: "button", "aria-label": "Ajouter une proposition", "data-key": "create-proposal",
        onclick: function () { UI.set({ modal: { type: "createProposal", topicId: topic.id } }); }
      }, [icon("plus", 20), el("span", { text: "Proposition" })]));
    }
    return screen;
  }

  /* ---------------------------------------------------------- Consensus --- */

  /* Consensus (route « conclusion », nom historique) : les propositions sur lesquelles TOUTE l'équipe a voté la même
   * chose, pour ou contre (Core.unanimousVote). Elles y arrivent seules, au vote qui fait l'unanimité, et y restent
   * figées : on ne vote pas ici. Les anciennes « formulations » libres ne s'affichent plus (données conservées). */
  function screenConclusion(topicId) {
    var topic = Core.findTopic(Store.view, topicId);
    if (!topic) { return screenMissing(); }

    var agreed = agreedProposals(topic);
    var list = el("div", { class: "stack" });
    agreed.forEach(function (proposal, i) {
      var accepted = consensusOf(proposal) === "for";
      var count = Object.keys(proposal.votes || {}).length;
      list.appendChild(reveal(el("article", { class: "card card-static stack consensus-card", "data-motion-key": "k:" + proposal.id,
        "data-consensus": accepted ? "for" : "against" }, [
        el("div", { class: "row", style: { alignItems: "flex-start", gap: "10px" } }, [
          el("div", { class: "card-title", style: { flex: "1" }, text: proposal.title }),
          toneBadge(accepted ? "Acceptée" : "Rejetée", accepted ? "tone-accord" : "tone-voix")
        ]),
        proposal.description ? el("div", { class: "pre-wrap", style: { fontSize: "14px", color: "var(--muted)" }, text: proposal.description }) : null,
        el("div", { class: "hint", text: (accepted ? "Toute l'équipe est pour" : "Toute l'équipe est contre")
          + (count ? " (" + Utils.plural(count, "vote", "votes") + ")" : "") + "." })
      ]), i));
    });

    if (!agreed.length) {
      list.appendChild(emptyState("checkCircle", "Pas encore de consensus",
        "Une proposition arrive ici quand toute l'équipe a voté la même chose, pour ou contre."));
    }

    return el("div", { class: "screen" }, [
      topbar({
        title: "Consensus",
        sub: topic.title,
        back: App.remonter,
        backLabel: "Discussion",
        actions: [statusPill()]
      }),
      el("div", { class: "content" }, [list])
    ]);
  }

  /* ------------------------------------------------------------ Réunion --- */

  var PRINT_UNAVAILABLE = "Impression indisponible ici : affichez la synthèse à l'écran ou ouvrez-la dans votre navigateur.";

  /* ⚠️ Une WebView peut ne pas fournir window.print, ou le refuser : sans garde, l'appui ne faisait
   * rien, ou levait une erreur que personne ne voyait (BL-064). Une impression lancée mais sans
   * effet, sans erreur ni événement, ne se distingue pas d'une impression réussie : elle n'est pas
   * annoncée (un faux message sur un navigateur qui imprime serait pire). */
  function printMeeting() {
    var printed = false;
    try {
      if (typeof window.print === "function") { window.print(); printed = true; }
    } catch (error) { printed = false; }
    if (!printed) { UI.toast(PRINT_UNAVAILABLE, "error"); }
  }

  /* ================================================================ Pandore ==== */

  /* Pandore : l'espace anonyme où l'équipe dépose ce qu'elle veut dire (idées, plaintes, questions, remarques).
   * ⚠️ Deux circuits, jamais mélangés :
   *   - DÉPÔT : le texte part par la file d'actions (SUBMIT_IDEA, nom technique d'avant Pandore), toujours anonyme, et
   *     n'entre jamais dans l'état partagé. Personne ne le relit dans l'application, pas même son auteur ;
   *   - LECTURE : la SYNTHÈSE AUTOMATIQUE écrite par l'IA, publiée dans le dépôt Git (pandore/synthese.json) et servie
   *     par GitHub Pages à côté de l'application. Affichée en TEXTE seulement : rien n'y est interprété comme du HTML.
   *     Chaque synthèse remplace la précédente. Une remise à zéro la laisse affichée telle quelle, et la date
   *     (`remiseAZero`) pour dire que ce qui a été déposé depuis viendra dans la suivante.
   *   - CLASSEMENT : l'IA choisit l'axe (`classement`) et les catégories (`categorie` de chaque point). L'écran montre
   *     les catégories dans l'ordre du fichier, sans les réinterpréter ; l'axe lui-même n'est pas affiché (épure).
   * Le fichier est relu en arrivant sur l'écran, puis au plus toutes les deux minutes (le service worker le prend sur
   * le réseau d'abord, avec repli hors ligne). */
  var PANDORE_URL = "pandore/synthese.json";
  var PANDORE_STALE_MS = 2 * 60 * 1000;
  var pandoreFeed = { status: "idle", points: [], date: "", resetOn: "", resume: "", loadedAt: 0 };

  function isDay(value) { return /^\d{4}-\d{2}-\d{2}$/.test(String(value || "")); }

  function cleanPoint(raw) {
    if (!raw || typeof raw !== "object") { return null; }
    var titre = Utils.trim(raw.titre);
    var texte = Utils.trim(raw.texte);
    if (!titre || !texte) { return null; }
    return {
      titre: Utils.limit(titre, 120), texte: Utils.limit(texte, 1500), categorie: Utils.limit(Utils.trim(raw.categorie), 40),
      sources: Array.isArray(raw.sources) ? raw.sources.length : 0
    };
  }

  function loadSynthesis() {
    if (pandoreFeed.status === "loading") { return; }
    if (typeof fetch !== "function") { pandoreFeed.status = "error"; return; }
    pandoreFeed.status = "loading";
    var done = function () { if (App.route && App.route.name === "pandoreSynthesis") { UI.force(); } };
    fetch(PANDORE_URL, { cache: "no-store" }).then(function (response) {
      if (!response.ok) { throw new Error("HTTP " + response.status); }
      return response.json();
    }).then(function (data) {
      data = data && typeof data === "object" ? data : {};
      pandoreFeed = {
        status: "ok",
        points: (Array.isArray(data.points) ? data.points : []).map(cleanPoint).filter(Boolean),
        date: isDay(data.date) ? data.date : "",
        resetOn: isDay(data.remiseAZero) ? data.remiseAZero : "",
        resume: Utils.limit(Utils.trim(data.resume), 1500),
        loadedAt: Utils.now()
      };
      done();
    }, function () {
      pandoreFeed.status = "error";
      pandoreFeed.loadedAt = Utils.now();
      done();
    });
  }

  function dayLabel(day) {
    var parts = String(day || "").split("-");
    return parts.length === 3 ? parts[2] + "/" + parts[1] + "/" + parts[0] : "";
  }

  /* Groupes dans l'ordre où l'IA les a écrits : une catégorie apparaît là où apparaît son premier point. */
  function groupPoints(points) {
    var groups = [];
    var byLabel = {};
    points.forEach(function (point) {
      var key = "c:" + point.categorie;
      if (!byLabel[key]) { byLabel[key] = { label: point.categorie, points: [] }; groups.push(byLabel[key]); }
      byLabel[key].points.push(point);
    });
    return groups;
  }

  /* Disponibilité du dépôt : en mode local, aucun serveur ne recevrait le texte ; un serveur qui répond sans annoncer
   * « ideas » (backend d'avant 1.2.0) le refuserait. Tant que le serveur n'a jamais répondu, on ne présume rien. */
  function pandoreUnavailableReason() {
    if (Sync.connection && (Sync.connection.localMode || !Sync.connection.url)) {
      return "Pandore a besoin de l'espace de l'équipe : en mode local, aucun serveur ne recevrait votre dépôt.";
    }
    if (Sync.supports && Sync.supports("since") && !Sync.supports("ideas")) {
      return "Pandore est indisponible : le serveur de l'équipe doit être mis à jour.";
    }
    return null;
  }

  function screenPandore() {
    var unavailable = pandoreUnavailableReason();
    /* Composeur à la façon d'une messagerie IA : un seul champ, l'envoi dans son coin, une seule ligne dessous.
     * Le principe vit dans la feuille « i » de la barre du haut (pandoreInfoSheet) : rien d'autre ne s'explique à
     * l'écran. */
    var area = bindCounter(el("textarea", {
      class: "textarea", maxlength: Core.LIMITS.idea, placeholder: "Une idée, une plainte, une question…", "aria-required": "true",
      "aria-label": "Ce que vous voulez dire", rows: "3", "data-draft": "pandore:new", disabled: !!unavailable
    }), "pandore:new", Core.LIMITS.idea);
    var counter = counterFor("pandore:new", Core.LIMITS.idea);

    function submit() {
      var text = Utils.trim(area.value);
      if (!text) { invalid(area, "Écrivez quelque chose avant de déposer."); return; }
      var typed = area.value;
      /* Vidé AVANT l'envoi : le rendu qui suit réinjecterait sinon le texte déjà parti (même piège que le composeur). */
      area.value = "";
      setCounter(counter, 0, Core.LIMITS.idea);
      var sent = App.actions.submitIdea(text);
      var settle = function (result) {
        if (result && result.ok === false) {
          var node = findDraftNode("pandore:new");
          if (node) { node.value = typed; }
          return;
        }
        UI.toast("Déposé anonymement.");
      };
      if (sent && typeof sent.then === "function") { sent.then(settle, function () { settle(null); }); } else { settle(sent); }
    }

    var deposit = el("div", { class: "pandore-deposit" }, [
      el("div", { class: "inline-composer" }, [
        area,
        el("div", { class: "inline-composer-bar" }, [
          counter,
          el("div", { class: "spacer" }),
          el("button", { class: "send-btn", type: "button", "aria-label": "Déposer anonymement", "data-key": "pandore-submit",
            disabled: !!unavailable, onclick: submit }, [icon("send", 20)])
        ])
      ]),
      el("p", { class: "pandore-notice" }, [
        icon(unavailable ? "warning" : "lock", 13),
        el("span", { text: unavailable || "Message anonyme non modifiable." })
      ])
    ]);

    return el("div", { class: "screen" }, [
      topbar({ title: "Pandore", sub: "Dites ce que vous avez à dire", actions: [
        el("button", { class: "btn-icon", type: "button", "aria-label": "Comment fonctionne Pandore", "aria-haspopup": "dialog",
          "data-key": "pandore-info", onclick: function () { UI.set({ sheet: { type: "pandoreInfo" } }); } }, [icon("info", 20)])
      ] }),
      el("div", { class: "content stack-lg" }, [
        reveal(deposit, 0),
        el("button", { class: "btn btn-outline btn-block", type: "button", "data-key": "pandore-open-synthesis",
          onclick: function () { App.go("#/pandore/synthese"); } }, [el("span", { text: "Voir la synthèse" }), icon("forward", 16)])
      ])
    ]);
  }

  /* La synthèse, sur un écran à elle (#/pandore/synthese). Le fichier n'est lu qu'ici. */
  function screenPandoreSynthesis() {
    if (pandoreFeed.status === "idle" || (pandoreFeed.status !== "loading" && Utils.now() - pandoreFeed.loadedAt > PANDORE_STALE_MS)) {
      loadSynthesis();
    }
    var feed = pandoreFeed;
    var filled = feed.points.length > 0 || !!feed.resume;
    var body;
    if (feed.status === "loading" && !filled) {
      /* Un bloc à la forme du bloc de synthèse : à l'arrivée du contenu, rien ne saute. Il chatoie lentement tant
       * que dure le chargement, et disparaît avec lui (css/motion.css). « Chargement… » reste le seul texte lu. */
      body = el("div", { class: "stack" }, [
        el("p", { class: "hint", text: "Chargement…" }),
        el("div", { class: "card card-static stack skeleton-card", "aria-hidden": "true" }, [
          el("span", { class: "skeleton-line" }),
          el("span", { class: "skeleton-line" }),
          el("span", { class: "skeleton-line skeleton-short" }),
          el("span", { class: "skeleton-line skeleton-title" }),
          el("span", { class: "skeleton-line" }),
          el("span", { class: "skeleton-line skeleton-short" })
        ])
      ]);
    } else if (feed.status === "error" && !filled) {
      body = el("div", { class: "note" }, [
        icon("warning", 14),
        el("div", { class: "note-body" }, [
          el("div", { text: "Impossible de charger la synthèse." }),
          el("button", { class: "btn btn-sm btn-ghost", type: "button", "data-key": "pandore-retry",
            onclick: function () { pandoreFeed.status = "idle"; UI.force(); } }, [icon("sync", 15), el("span", { text: "Réessayer" })])
        ])
      ]);
    } else if (!filled) {
      body = el("p", { class: "hint", text: "Pas encore de synthèse." });
    } else {
      /* Un seul bloc de texte : le résumé, puis chaque catégorie et ses points, à la suite. Pas une carte par point. */
      var parts = [feed.resume ? el("p", { class: "pre-wrap", text: feed.resume }) : null];
      groupPoints(feed.points).forEach(function (group) {
        if (group.label) { parts.push(el("h2", { class: "pandore-group", text: group.label })); }
        group.points.forEach(function (point) {
          parts.push(el("div", { class: "pandore-point" }, [
            el("h3", { class: "pandore-point-title", text: point.titre }),
            el("p", { class: "pre-wrap", text: point.texte })
          ]));
        });
      });
      body = reveal(el("article", { class: "card card-static pandore-card" }, parts), 0);
    }

    return el("div", { class: "screen" }, [
      topbar({ title: "Synthèse", sub: feed.date ? "Du " + dayLabel(feed.date) : null, back: App.remonter, backLabel: "Pandore" }),
      el("div", { class: "content stack" }, [
        feed.resetOn ? el("p", { class: "hint", "data-key": "pandore-reset-note",
          text: "Remise à zéro le " + dayLabel(feed.resetOn) + ". Les nouveaux dépôts iront dans la prochaine synthèse." }) : null,
        body
      ])
    ]);
  }

  /* Le principe de Pandore, à la demande. Aucun mot sur la façon dont la synthèse est écrite : seulement ce qu'il
   * faut savoir pour déposer sans regret. */
  function pandoreInfoSheet() {
    return sheet("Comment ça marche", el("div", { class: "stack" }, [
      el("p", { text: "Une idée, une plainte, une question, une remarque : déposez-la ici." }),
      el("p", { text: "Votre message part sans nom. Une fois envoyé, il ne peut être ni modifié ni retiré." })
    ]));
  }

  function screenMeeting() {
    var state = Store.view;
    /* Même ordre de maturité que l'accueil (prêts, en discussion, clôturés), archivés exclus. */
    var topics = ProductView.meetingTopics(state.topics);

    /* Épure : un titre, puis les sujets. La date d'édition ne sert que sur papier (print-only). */
    var doc = el("div", { class: "print-doc stack" }, [
      el("div", { class: "stack", style: { gap: "6px", marginBottom: "10px" } }, [
        el("h1", { class: "print-h1", text: "Préparation de réunion" }),
        el("p", { class: "hint print-only", text: "Édité le " + Utils.formatDateTime(Utils.nowISO()) })
      ])
    ]);

    if (!topics.length) {
      doc.appendChild(el("p", { class: "hint", text: "Aucun sujet à présenter." }));
    }

    topics.forEach(function (topic, i) {
      var block = reveal(el("section", { class: "print-topic" }, [
        el("h2", { class: "print-h2", text: topic.title })
      ]), i);

      var open = openProposals(topic);
      if (open.length) {
        block.appendChild(el("h3", { class: "print-h3", text: "Propositions" }));
        var pl = el("ul", { class: "print-list" });
        open.forEach(function (proposal) {
          /* Lecture de la carte (§8), réduite aux positions : « 3 pour, 1 contre » (l'abstention si elle existe). Le
           * statut ne se dit que s'il n'est pas l'état normal « En vote ». */
          var reading = ProductView.voteReading(proposal, state.participants);
          var positions = reading.positions.slice(0, reading.counts.abstain ? 3 : 2).join(", ");
          pl.appendChild(el("li", {}, [
            el("strong", { text: proposal.title }),
            el("span", { text: " : " + positions + (proposal.status !== "voting" ? " (" + Core.PROPOSAL_STATUS_LABELS[proposal.status] + ")" : "") })
          ]));
        });
        block.appendChild(pl);
      }

      /* Consensus : ce que toute l'équipe a accepté ou rejeté, à l'unanimité. */
      var agreed = agreedProposals(topic);
      if (agreed.length) {
        block.appendChild(el("h3", { class: "print-h3", text: "Consensus" }));
        var cl = el("ul", { class: "print-list" });
        agreed.forEach(function (proposal) {
          cl.appendChild(el("li", {}, [
            el("strong", { text: proposal.title }),
            el("span", { text: consensusOf(proposal) === "for" ? " : acceptée par toute l'équipe" : " : rejetée par toute l'équipe" })
          ]));
        });
        block.appendChild(cl);
      }

      doc.appendChild(block);
    });

    return el("div", { class: "screen" }, [
      topbar({
        title: "Réunion",
        heading: false,   // le h1 de la synthèse est celui du document imprimable
        actions: [el("button", { class: "btn btn-sm btn-outline no-print", type: "button",
          onclick: printMeeting }, [icon("print", 16), el("span", { text: "Imprimer" })])]
      }),
      el("div", { class: "content" }, [
        /* ⚠️ La pastille d'état (BL-066) est dans le contenu et non dans la barre : celle-ci porte déjà
         * « Imprimer », et mesurée à 390 px une pastille de plus réduisait le titre à « Ré… ».
         * `no-print` la retire de la page imprimée, comme la barre. */
        el("div", { class: "no-print", style: { display: "flex", justifyContent: "flex-end", marginBottom: "6px" } }, [statusPill()]),
        doc
      ])
    ]);
  }

  /* ------------------------------------------------------------ Réglages --- */

  /* Réglages sur DEUX niveaux, pour éviter les mauvaises manipulations :
   *   - niveau 1, « Réglages » (onglet) : ce qui sert à chacun, sans risque. Le nom, l'invitation, la présentation.
   *     Rien n'y coupe l'appareil de l'équipe ;
   *   - niveau 2, « Système » (#/settings/system) : la connexion et la synchronisation. Sans mot de passe, mais CHAQUE
   *     action y demande confirmation (SYSTEM_ACTIONS, fenêtre « confirmSystem » ; la déconnexion garde la sienne).
   *     Ouvrir le diagnostic replié n'est pas une action : il ne change rien. */
  function screenSettings() {
    var nameInput = el("input", {
      class: "input", type: "text", maxlength: Core.LIMITS.name,
      "aria-label": "Votre nom", "aria-required": "true",
      value: App.user.name || "", "data-draft": "settings:name"
    });
    var connected = !(Sync.connection.localMode || !Sync.connection.url);

    /* Inviter : un lien qui ouvre l'application déjà réglée sur l'équipe (Utils.inviteLink). Un seul bouton : la
     * feuille de partage du téléphone propose d'elle-même toutes les applications (SMS, mail, WhatsApp…). Sans
     * feuille de partage (ordinateur, certaines fenêtres intégrées), le message est copié. Le code d'accès n'est
     * jamais gardé par l'application : le message se termine par « Code d'accès : », à compléter avant l'envoi. */
    var inviteLink = connected && typeof App.inviteLink === "function" ? App.inviteLink() : "";
    var withCode = !!inviteLink && typeof App.teamHasCode === "function" && App.teamHasCode();

    /* Actions de plus de 30 jours retenues (BL-004) : le message de démarrage renvoie ici. Le bouton qui les
     * envoie est au niveau Système ; la ligne Système le signale seulement. */
    var staleCount = typeof Sync.staleCount === "function" ? Number(Sync.staleCount()) || 0 : 0;

    /* Épure : une liste de lignes, comme les réglages d'une messagerie IA. Plus de cartes, de surtitres ni de
     * paragraphes ; la synthèse de réunion a son onglet et n'est plus doublée ici. */
    return el("div", { class: "screen" }, [
      topbar({ title: "Réglages", actions: [statusPill()] }),
      el("div", { class: "content stack-lg" }, [
        reveal(field("Votre nom", el("div", { class: "settings-name" }, [
          nameInput,
          el("button", { class: "btn btn-primary", type: "button", text: "Enregistrer",
            "data-key": "save-name", onclick: function () { App.saveName(nameInput.value, true); } })
        ])), 0),
        reveal(el("div", { class: "settings-list" }, [
          /* Rien à installer quand l'application est déjà ouverte depuis son icône. */
          isInstalledApp() ? null : settingsRow("download", "Installer l'application", "install-app", installApp),
          inviteLink ? el("div", { "data-key": "invite-settings" }, [
            settingsRow("share", "Inviter des collaborateurs", "invite-share", function () { shareInvitation(inviteLink, withCode); },
              withCode ? "Ajoutez le code d'accès à la fin du message." : null)
          ]) : null,
          settingsRow("info", "Revoir la présentation", "replay-onboarding", function () {
            /* Garde de chargement mixte : avec un `js/app.js` de cache ancien, cette fonction n'existe pas. */
            if (typeof App.replayOnboarding === "function") { App.replayOnboarding(); }
          }),
          /* L'entrée du niveau Système, en dernier : on n'y va que pour dépanner. */
          el("div", { "data-key": "system-entry" }, [
            settingsRow("settings", "Système", "open-system", function () { App.go("#/settings/system"); },
              staleCount > 0 ? Utils.plural(staleCount, "action de plus de 30 jours en attente", "actions de plus de 30 jours en attente") : null, true)
          ])
        ]), 1)
      ])
    ]);
  }

  /* Ligne de réglage : icône, libellé, une précision facultative dessous, chevron si elle mène à un autre écran. */
  function settingsRow(iconName, label, key, onclick, detail, chevron) {
    return el("button", { class: "settings-row", type: "button", "data-key": key, onclick: onclick }, [
      icon(iconName, 18),
      el("span", { class: "settings-row-text" }, [
        el("span", { text: label }),
        detail ? el("span", { class: "hint", text: detail }) : null
      ]),
      chevron ? icon("forward", 16) : null
    ]);
  }

  function diagRow(label, value, danger) {
    return el("div", { class: "diag-row" }, [
      el("span", { class: "diag-label", text: label }),
      el("span", { class: "diag-value" + (danger ? " is-danger" : ""), text: value })
    ]);
  }

  function releaseStaleActions() {
    var say = function (text, kind) { UI.toast(text, kind); UI.force(); };
    var refused = "L'envoi n'a pas pu être lancé : vos actions restent sur cet appareil.";
    var pending;
    try { pending = Sync.releaseStale(); } catch (error) { pending = null; }
    if (!pending || typeof pending.then !== "function") { say(refused, "error"); return; }
    pending.then(function (count) {
      count = Number(count) || 0;
      say(count === 0 ? "Plus aucune action n'attend."
        : count === 1 ? "1 action va partir." : count + " actions vont partir.");
    }, function () { say(refused, "error"); });
  }

  /* Niveau Système : chaque action passe par une confirmation qui dit son effet. */
  var SYSTEM_ACTIONS = {
    sync: {
      title: "Synchroniser maintenant",
      text: "L'application envoie ce qui attend sur cet appareil et relit l'espace de l'équipe.",
      confirm: "Synchroniser",
      run: function () { Sync.now(); UI.toast("Synchronisation lancée."); }
    },
    connection: {
      title: "Modifier l'adresse ou le code",
      text: "Vous allez changer l'équipe ou le code utilisés par cet appareil. Une adresse fausse le coupe de l'équipe jusqu'à ce qu'elle soit corrigée.",
      confirm: "Modifier",
      run: function () { App.editConnection(); }
    },
    release: {
      title: "Envoyer les actions retenues",
      text: "Ces actions ont plus de 30 jours. Envoyées maintenant, elles peuvent défaire un choix plus récent de l'équipe.",
      confirm: "Envoyer quand même",
      run: releaseStaleActions
    }
  };

  function confirmSystem(key) { UI.set({ modal: { type: "confirmSystem", action: key } }); }

  function confirmSystemModal(m) {
    var spec = SYSTEM_ACTIONS[m.action];
    if (!spec) { return null; }
    return modal(spec.title, el("p", { class: "hint", text: spec.text }), [
      el("button", { class: "btn btn-outline", type: "button", text: "Annuler", onclick: closeOverlay }),
      el("button", { class: "btn btn-primary", type: "button", text: spec.confirm, "data-key": "confirm-system",
        onclick: function () { closeOverlay(); spec.run(); } })
    ]);
  }

  function screenSystem() {
    var diagnostics = Sync.diagnostics();
    var connected = !(Sync.connection.localMode || !Sync.connection.url);

    var connectionRows = el("div", { class: "card card-static stack" }, [
      /* Épure : plus de pastille « Équipe / Local » ici, la phrase dessous le dit déjà. */
      sectionTitle("link", "Connexion"),
      el("div", { class: "hint", text: connected
        ? "Connecté à l'espace de l'équipe."
        : "Mode local : rien n'est partagé avec l'équipe." }),
      /* Le code d'espace se compare à l'œil d'un téléphone à l'autre : deux codes différents = deux scripts
       * différents, et c'est la première explication à « je ne vois pas les messages des autres ». */
      connected ? el("div", { class: "diag" }, [diagRow("Code d'espace", Utils.fingerprint(Sync.connection.url))]) : null,
      el("button", { class: "btn btn-outline btn-block", type: "button", "data-key": "edit-connection",
        onclick: function () { confirmSystem("connection"); } },
      [icon("edit", 16), el("span", { text: "Modifier l'adresse ou le code" })]),
      el("button", { class: "btn btn-danger btn-block", type: "button",
        "data-key": "logout", onclick: function () { UI.set({ modal: { type: "logout" } }); } },
      [icon("logout", 16), el("span", { text: "Se déconnecter de l'équipe" })])
    ]);

    /* Actions de plus de 30 jours en file (BL-004) : sync.js les retient au lieu de les renvoyer en silence (un
     * rejeu tardif pourrait défaire un choix plus récent). Bloc absent à zéro ; jamais de contenu d'action ni
     * d'auteur, seulement le compte. Gardé pour un ancien sync.js en cache, qui n'a pas staleCount. */
    var staleCount = typeof Sync.staleCount === "function" ? Number(Sync.staleCount()) || 0 : 0;
    var staleBlock = null;
    if (staleCount > 0 && typeof Sync.releaseStale === "function") {
      var oneStale = staleCount === 1;
      staleBlock = el("div", { class: "stack" }, [
        el("div", { class: "note" }, [
          icon("info", 14),
          el("span", { text: oneStale
            ? "1 action de plus de 30 jours attend sur cet appareil."
            : staleCount + " actions de plus de 30 jours attendent sur cet appareil." })
        ]),
        el("button", {
          class: "btn btn-outline btn-block", type: "button", "data-key": "release-stale",
          "aria-label": oneStale ? "Envoyer quand même l'action de plus de 30 jours"
            : "Envoyer quand même les actions de plus de 30 jours",
          onclick: function () { confirmSystem("release"); }
        }, [icon("send", 16), el("span", { text: "Envoyer quand même" })])
      ]);
    }

    var syncCard = el("div", { class: "card card-static stack" }, [
      el("div", { class: "row" }, [
        sectionTitle("sync", "Synchronisation"),
        el("div", { class: "spacer" }),
        statusPill(true)
      ]),
      el("button", { class: "btn btn-outline btn-block", type: "button",
        "data-key": "sync-now", onclick: function () { confirmSystem("sync"); } },
      [icon("sync", 16), el("span", { text: "Synchroniser maintenant" })]),
      staleBlock,
      /* Ce qui sert à tous reste visible : ce qui attend, et la dernière erreur quand il y en a une. */
      el("div", { class: "diag" }, [
        /* Rien en attente : rien à dire (épure). */
        diagnostics.pending.length ? diagRow("Actions en attente", String(diagnostics.pending.length) +
          " (" + diagnostics.pending.map(function (p) { return p.type; }).join(", ") + ")") : null,
        diagnostics.status.error ? diagRow("Dernière erreur", diagnostics.status.error, true) : null
      ]),
      /* Le reste ne sert qu'au dépannage : replié, retenu ouvert d'un rendu à l'autre. */
      el("details", {
        class: "diag-more", open: diagMoreOpen === true,
        ontoggle: function (e) { diagMoreOpen = e.target.open === true; }
      }, [
        el("summary", { class: "proposal-more-summary", id: "settings-diag-more" }, [
          el("span", { text: "Diagnostic technique" }), icon("down", 15)
        ]),
        el("div", { class: "diag" }, [
          diagRow("Révision", String(diagnostics.revision)),
          diagRow("Dernière mise à jour", diagnostics.updatedAt ? Utils.formatDateTime(diagnostics.updatedAt) : "-"),
          connected ? diagRow("Dernier échange",
            diagnostics.lastSyncAt ? Utils.formatDateTime(diagnostics.lastSyncAt) : "aucun",
            !diagnostics.lastSyncAt) : null,
          /* Trace des envois rattrapés au moment où la page disparaissait : c'est ce qui distingue « tout va
           * bien » d'un appareil qui ne réussit à poster qu'in extremis, à chaque fois. */
          connected && diagnostics.lastFlushAt
            ? diagRow("Dernier envoi de secours", Utils.formatDateTime(diagnostics.lastFlushAt))
            : null,
          connected ? diagRow("Rythme actuel",
            (diagnostics.intervalMs / 1000).toFixed(1).replace(".", ",") + " s" +
            (diagnostics.failures ? " (recul, " + diagnostics.failures + " échec(s))" : "")) : null,
          /* « IndexedDB » seul se lisait comme une garantie de durabilité qui n'était pas faite : l'éviction est
           * totale et muette. On dit donc les deux états, disponible, et durable ou non. */
          diagRow("Stockage local", diagnostics.persistent
            ? ("IndexedDB : " + diagnostics.durability)
            : "mémoire : non persistant",
          !diagnostics.persistent || diagnostics.durability === "évinçable"),
          diagRow("Version", CONFIG.APP_VERSION)
        ])
      ])
    ]);

    return el("div", { class: "screen" }, [
      topbar({ title: "Système", back: App.remonter, backLabel: "Réglages",
        actions: [statusPill()] }),
      el("div", { class: "content stack-lg" }, [
        reveal(connectionRows, 0),
        reveal(syncCard, 1)
      ])
    ]);
  }

  function invitationMessage(link, withCode) {
    return [
      "Bonjour,",
      "Voici le lien pour rejoindre l'équipe sur BrainstO., l'outil qui nous sert à préparer les réunions :",
      link,
      "Ouvrez-le dans Safari (iPhone) ou Chrome (Android)."
    ].concat(withCode ? ["Code d'accès : "] : []).join("\n");
  }

  /* La feuille de partage du système, appelée dans le geste (elle l'exige). Annulée par la personne : rien. Absente
   * ou refusée : le message part dans le presse-papiers, pour être collé dans n'importe quelle application. */
  function shareInvitation(link, withCode) {
    var message = invitationMessage(link, withCode);
    var copy = function () { copyText(message, "Message d'invitation copié : collez-le où vous voulez."); };
    var share = null;
    try {
      // qa-allow: js-navigator-share — détectée avant usage et sous try ; sans elle (Firefox Android), le message est copié.
      share = navigator.share ? navigator.share({ title: "Invitation à BrainstO.", text: message }) : null;
    } catch (e) { share = null; }
    if (!share || typeof share.then !== "function") { copy(); return; }
    share.then(null, function (error) { if (!error || error.name !== "AbortError") { copy(); } });
  }

  /* Volet « Diagnostic technique » des Réglages ouvert ou non, retenu d'un rendu à l'autre. */
  var diagMoreOpen = false;

  /* ========================================================= OVERLAYS ==== */

  function messageSheet(spec) {
    var topic = Core.findTopic(Store.view, spec.topicId);
    var message = topic ? Core.findMessage(topic, spec.messageId) : null;
    if (!message) { return null; }

    var mine = App.ownsMessage(message);
    var locked = Core.isMessageLocked(message, App.user.id);

    /* Le sélecteur de réaction nomme chaque marque : dessinée, elle n'est pas
     * toujours devinable au premier passage, et l'apprentissage se fait une
     * seule fois.
     * Aucune réaction sur MON message anonyme : la clé d'une réaction est
     * l'identifiant de qui réagit, elle relierait le message à son auteur dans
     * les données partagées (§5). La liste reste la même pour tous les anonymes. */
    var emojiRow = mine && message.anon ? null : el("div", { class: "emoji-row" });
    (emojiRow ? OFFERED_REACTIONS : []).forEach(function (emoji) {
      var isMine = message.reactions[App.user.id] === emoji;
      var label = Utils.reactionLabel(emoji);
      emojiRow.appendChild(el("button", {
        class: "emoji-btn" + (isMine ? " mine" : ""), type: "button", "data-key": "emoji-" + emoji,
        "aria-label": label, "aria-pressed": isMine ? "true" : "false",
        onclick: function () {
          App.actions.setReaction(topic.id, message.id, emoji);
          UI.set({ sheet: null });
        }
      }, [
        Utils.reactionMark(emoji, 24),
        el("span", { class: "emoji-label", text: label })
      ]));
    });

    /* Le fil affiché : le fil principal, ou l'exploration d'un message (son message source compris). */
    var viewRoot = viewBranchRoot(topic.id);
    var inView = function (m) { return viewRoot ? (m.id === viewRoot || m.branchRootId === viewRoot) : !m.branchRootId; };
    var quotedMessage = message.quoteId ? Core.findMessage(topic, message.quoteId) : null;
    /* Explorer : depuis le fil principal, sur un message du fil principal (une seule profondeur). */
    var explorable = !viewRoot && !message.branchRootId;
    var exploreBlocked = explorable ? branchesUnavailableReason() : "";

    var actions = el("div", { class: "sheet-actions" }, [
      /* Reprise de l'action que portait la citation elle-même. En tête : elle
       * concerne le contexte du message, pas ce qu'on va en faire. Seulement si le
       * message cité est dans CE fil : en V1, on ne saute pas d'un fil à l'autre. */
      quotedMessage && inView(quotedMessage)
        ? sheetAction("up", "Aller au message cité", function () {
          UI.set({ sheet: null });
          UI.scrollToMessage(message.quoteId);
        })
        : null,
      sheetAction("quote", "Citer", function () { quoteMessage(topic.id, message.id); }),
      explorable
        ? sheetAction("explore", exploreBlocked ? "Explorer cette idée (" + exploreBlocked + ")" : "Explorer cette idée",
          function () { if (!exploreBlocked) { openBranch(topic.id, message.id); } }, { disabled: !!exploreBlocked })
        : null,
      /* Faire avancer l'idée : la citer, l'explorer, en faire une proposition — dans cet ordre, du plus léger au plus
       * engageant. Les utilitaires (copier, modifier, signature) viennent ensuite. */
      sheetAction("idea", "Créer une proposition", function () {
        UI.set({ sheet: null, modal: { type: "createProposal", topicId: topic.id, fromText: message.text } });
      }),
      /* L'appui long ouvre cette feuille au lieu de sélectionner le texte (app.css) : la copie passe donc par ici. */
      sheetAction("doc", "Copier le texte", function () {
        UI.set({ sheet: null });
        copyText(message.text);
      }),
      /* Verrouillé : désactivé, la raison dans le libellé (le toast reste en
       * garde, mais un bouton désactivé ne le déclenche plus). */
      mine ? sheetAction(locked ? "lock" : "edit", locked ? "Modifier (verrouillé : quelqu'un y a déjà réagi)" : "Modifier", function () {
        if (locked) { UI.toast("Message verrouillé : quelqu'un y a déjà réagi.", "error"); return; }
        UI.set({ sheet: null, modal: { type: "editMessage", topicId: topic.id, messageId: message.id } });
      }, { disabled: locked }) : null,
      /* ⚠️ Règle asymétrique (même principe que REC-RUI-001) : lever l'anonymat expose le nom à toute
       * l'équipe et ce qui a été vu ne se reprend pas, donc il se confirme AVANT. Rendre anonyme protège
       * et se défait depuis ce téléphone : pas de question, un bandeau dit ce qui s'est passé. */
      mine ? sheetAction(message.anon ? "user" : "mask", message.anon ? "Signer avec mon nom" : "Rendre anonyme", function () {
        if (message.anon) {
          UI.set({ sheet: null, modal: { type: "signMessage", topicId: topic.id, messageId: message.id } });
          return;
        }
        App.actions.setMessageSignature(topic.id, message.id, true);
        UI.set({ sheet: null });
        UI.toast("Message rendu anonyme.");
      }) : null
    ]);

    var info = [];
    info.push(message.authorName);
    info.push(Utils.formatDateTime(message.createdAt));
    if (locked) { info.push("verrouillé"); }

    /* Surtitre plutôt que titre : la feuille porte sur un message précis, mais
     * ce sont les actions qui doivent capter l'œil, pas l'horodatage. */
    var header = el("div", { class: "sheet-eyebrow" }, [
      locked ? icon("lock", 13) : icon("user", 13),
      el("span", { text: info.join(" · ") })
    ]);

    return sheet(header, el("div", {}, [emojiRow, actions]));
  }

  function topicInfoSheet(spec) {
    var topic = Core.findTopic(Store.view, spec.topicId);
    if (!topic) { return null; }

    var statusSelect = el("select", { class: "select", "aria-label": "Statut du sujet", "data-key": "topic-status",
      onchange: function (e) {
        var status = e.target.value;
        /* Clôturer ou archiver retire le sujet de la discussion pour toute l'équipe : confirmé AVANT (voir
         * la proposition « Écartée »). La feuille cède sa place à la fenêtre de confirmation. */
        if (status === "closed" || status === "archived") {
          e.target.value = topic.status;
          UI.set({ sheet: null, modal: { type: "confirmStatus", kind: "topic", topicId: topic.id, status: status } });
          return;
        }
        applyTopicStatus(topic, status);
      }
    });
    Core.TOPIC_STATUSES.forEach(function (status) {
      statusSelect.appendChild(el("option", { value: status, selected: topic.status === status, text: Core.TOPIC_STATUS_LABELS[status] }));
    });

    return sheet(topic.title, el("div", { class: "stack" }, [
      el("div", { class: "card-meta" }, [
        toneBadge(Core.TOPIC_STATUS_LABELS[topic.status], TOPIC_TONES[topic.status]),
        icon("user", 13),
        el("span", { text: topic.createdBy.name })
      ]),
      el("div", { class: "hint" }, [
        topic.createdAt && Utils.formatDateTime(topic.createdAt) ? el("div", { text: "Créé le " + Utils.formatDateTime(topic.createdAt) }) : null,
        topic.updatedAt && Utils.formatDateTime(topic.updatedAt) ? el("div", { text: "Dernière activité le " + Utils.formatDateTime(topic.updatedAt) }) : null
      ]),
      topic.description
        ? el("div", { class: "pre-wrap", style: { fontSize: "var(--fs-sm)" }, text: topic.description })
        : null,
      field("Statut", selectWrap(statusSelect, true)),
      pinControl(topic),
      el("button", { class: "btn btn-outline btn-block", type: "button",
        onclick: function () { UI.set({ sheet: null, modal: { type: "editTopic", topicId: topic.id } }); } },
      [icon("edit", 16), el("span", { text: "Modifier le sujet" })]),
      /* Le mode d'emploi des bulles vit ici, à la demande, et plus au-dessus du fil. */
      el("p", { class: "hint", "data-key": "gesture-help", text: "Appui long sur un message : réagir, citer, explorer l'idée, modifier. Glissez-le vers la droite pour le citer." })
    ]));
  }

  /* ⚠️ Épingler vaut pour TOUTE l'équipe : le libellé le dit, et le bandeau le confirme. Un serveur qui n'annonce pas
   * « pins » (backend d'avant 1.2.0) refuserait l'action : la commande est alors désactivée, avec sa raison, plutôt
   * que de laisser partir une action vouée au refus. Tant que le serveur n'a jamais répondu (aucun drapeau connu), on
   * ne présume rien. Le mode local n'a pas de serveur : toujours disponible. */
  function pinControl(topic) {
    var known = Sync.supports && Sync.supports("since");
    var available = (Sync.connection && Sync.connection.localMode) || !known || Sync.supports("pins");
    var pinned = topic.pinned === true;
    var button = el("button", {
      class: "btn btn-outline btn-block", type: "button", "data-key": "topic-pin",
      "aria-pressed": pinned ? "true" : "false", disabled: !available,
      onclick: function () {
        App.actions.setTopicPin(topic.id, !pinned);
        UI.toast(pinned ? "Sujet désépinglé pour toute l'équipe." : "Sujet épinglé en tête de l'accueil, pour toute l'équipe.");
      }
    }, [icon("pin", 16), el("span", { text: pinned ? "Désépingler" : "Épingler pour toute l'équipe" })]);
    if (available) { return button; }
    return el("div", { class: "stack" }, [
      button,
      el("p", { class: "hint", text: "Épinglage indisponible : le serveur de l'équipe doit être mis à jour." })
    ]);
  }

  /* ⚠️ L'anonymat d'un sujet se décide avec le MÊME interrupteur que dans le composeur. Il se déduisait d'un champ
   * « Votre nom » vidé : un geste invisible, qu'on pouvait faire sans le vouloir. Le choix vit dans la couche
   * (`spec.anon`) ; le champ nom reste dans l'arbre, masqué, pour que ce qui y a été tapé revienne à l'extinction. Un
   * nom vide sans l'interrupteur est refusé : il ne vaut jamais anonymat. */
  function createTopicModal(spec) {
    var anon = spec.anon === true;
    var titleInput = bindCounter(el("input", {
      class: "input", type: "text", maxlength: Core.LIMITS.topicTitle,
      placeholder: "Titre du sujet", "aria-required": "true", "data-draft": "newTopic:title"
    }), "newTopic:title", Core.LIMITS.topicTitle);

    var descInput = el("textarea", {
      class: "textarea", maxlength: Core.LIMITS.topicDescription,
      placeholder: "Description (facultative)", "data-draft": "newTopic:desc"
    });

    /* Épure : plus de champ « Votre nom » (le nom est connu, il se change dans Réglages) ni de « (obligatoire) ».
     * Reste le choix signé / anonyme, dit avec le nom qui sera affiché. */
    return modal("Nouveau sujet", el("div", { class: "stack" }, [
      field("Titre", titleInput),
      counterFor("newTopic:title", Core.LIMITS.topicTitle),
      field("Description", descInput),
      signatureRow({
        anon: anon, key: "newTopic-anon", whoId: "newTopic-who", whoText: anon ? "Anonyme" : "Signé : " + (App.user.name || "moi"),
        onToggle: function () { UI.set({ modal: Object.assign({}, spec, { anon: !anon }) }); }
      })
    ]), [
      el("button", { class: "btn btn-outline", type: "button", text: "Annuler", onclick: closeOverlay }),
      el("button", {
        class: "btn btn-primary", type: "button", text: "Créer",
        onclick: function () {
          var title = Utils.trim(titleInput.value);
          if (!title) { invalid(titleInput, "Le titre du sujet est obligatoire."); return; }
          /* ⚠️ Un nom vide vaut anonymat pour createTopic : signé sans nom connu, on refuse plutôt que de publier en
           * anonyme par accident. */
          var name = anon ? "" : Utils.trim(App.user.name || "");
          if (!anon && !name) { UI.toast("Indiquez votre nom dans Réglages, ou allumez « Publier en anonyme ».", "error"); return; }
          App.actions.createTopic(title, descInput.value, name);
        }
      })
    ]);
  }

  function editTopicModal(spec) {
    var topic = Core.findTopic(Store.view, spec.topicId);
    if (!topic) { return null; }
    var titleInput = el("input", {
      class: "input", type: "text", maxlength: Core.LIMITS.topicTitle,
      "aria-required": "true", value: topic.title, "data-draft": "editTopic:title:" + topic.id
    });
    var descInput = el("textarea", {
      class: "textarea", maxlength: Core.LIMITS.topicDescription,
      value: topic.description, "data-draft": "editTopic:desc:" + topic.id
    });
    return modal("Modifier le sujet", el("div", { class: "stack" }, [
      field("Titre", titleInput),
      field("Description", descInput)
    ]), [
      el("button", { class: "btn btn-outline", type: "button", text: "Annuler", onclick: closeOverlay }),
      el("button", {
        class: "btn btn-primary", type: "button", text: "Enregistrer",
        onclick: function () {
          var title = Utils.trim(titleInput.value);
          if (!title) { invalid(titleInput, "Le titre du sujet est obligatoire."); return; }
          App.actions.updateTopic(topic.id, title, descInput.value);
        }
      })
    ]);
  }

  function editMessageModal(spec) {
    var topic = Core.findTopic(Store.view, spec.topicId);
    var message = topic ? Core.findMessage(topic, spec.messageId) : null;
    if (!message) { return null; }
    var textarea = el("textarea", {
      class: "textarea", maxlength: Core.LIMITS.message,
      "aria-label": "Texte du message", "aria-required": "true",
      value: message.text, "data-draft": "editMessage:" + message.id
    });
    return modal("Modifier le message", el("div", { class: "stack" }, [textarea]), [
      el("button", { class: "btn btn-outline", type: "button", text: "Annuler", onclick: closeOverlay }),
      el("button", {
        class: "btn btn-primary", type: "button", text: "Enregistrer",
        onclick: function () {
          var text = Utils.trim(textarea.value);
          if (!text) { invalid(textarea, "Le message est vide."); return; }
          App.actions.updateMessage(topic.id, message.id, text);
        }
      })
    ]);
  }

  /* Titre d'une proposition tirée d'un message (BL-062). Le titre tient sur une ligne : sauts de
   * ligne et espaces multiples deviennent une espace. Trop long, il est coupé à la dernière
   * frontière de mot qui laisse la place de « … » (200 caractères au plus, « … » compris) ; un
   * seul mot géant est coupé net. Quand le titre ne reprend pas tout le message, la description
   * garde le texte COMPLET : rien n'est perdu. */
  function titleFromText(text, max) {
    var full = Utils.trim(text);
    var flat = full.replace(/\s+/g, " ");
    var title = flat;
    if (flat.length > max) {
      var room = max - 1;
      var space = flat.charAt(room) === " " ? room : flat.lastIndexOf(" ", room - 1);
      title = Utils.limit(space > 0 ? flat.slice(0, space) : flat, room).replace(/[\s,;:]+$/, "") + "…";
    }
    return { title: title, description: title === full ? "" : Utils.limit(full, Core.LIMITS.proposalDescription) };
  }

  function proposalModal(spec) {
    var topic = Core.findTopic(Store.view, spec.topicId);
    if (!topic) { return null; }
    var existing = spec.proposalId ? Core.findProposal(topic, spec.proposalId) : null;
    var keyBase = existing ? "editProposal:" + existing.id : "newProposal:" + topic.id;

    var fromMessage = existing ? null : titleFromText(spec.fromText || "", Core.LIMITS.proposalTitle);
    var initialTitle = existing ? existing.title : fromMessage.title;
    var initialDesc = existing ? existing.description : fromMessage.description;

    var titleInput = el("input", {
      class: "input", type: "text", maxlength: Core.LIMITS.proposalTitle,
      placeholder: "Titre de la proposition", "aria-required": "true", value: initialTitle, "data-draft": keyBase + ":title"
    });
    var descInput = el("textarea", {
      class: "textarea", maxlength: Core.LIMITS.proposalDescription,
      placeholder: "Description (facultative)", "data-draft": keyBase + ":desc"
    });
    /* ⚠️ Un textarea n'a pas d'attribut `value` : poser `value:` à la création laissait le champ vide
     * dans un vrai navigateur (la description complète d'un message citée ci-dessus s'y perdait). */
    descInput.value = initialDesc;

    return modal(existing ? "Modifier la proposition" : "Nouvelle proposition", el("div", { class: "stack" }, [
      field("Titre", titleInput),
      field("Description", descInput)
    ]), [
      el("button", { class: "btn btn-outline", type: "button", text: "Annuler", onclick: closeOverlay }),
      el("button", {
        class: "btn btn-primary", type: "button", text: existing ? "Enregistrer" : "Créer",
        onclick: function () {
          var title = Utils.trim(titleInput.value);
          if (!title) { invalid(titleInput, "Le titre de la proposition est obligatoire."); return; }
          if (existing) { App.actions.updateProposal(topic.id, existing.id, title, descInput.value); }
          else { App.actions.createProposal(topic.id, title, descInput.value); }
        }
      })
    ]);
  }

  /* Un changement de statut part vers toute l'équipe : il est toujours annoncé. Le libellé est lu AVANT
   * l'envoi, qui provoque un rendu détruisant le menu. */
  function applyProposalStatus(topic, proposal, status) {
    var label = Core.PROPOSAL_STATUS_LABELS[status];
    App.actions.changeProposalStatus(topic.id, proposal.id, status);
    UI.toast(proposal.title + " : " + label + ".");
  }

  function applyTopicStatus(topic, status) {
    var label = Core.TOPIC_STATUS_LABELS[status];
    App.actions.changeTopicStatus(topic.id, status);
    UI.toast(topic.title + " : " + label + ".");
  }

  /* Confirmation d'un statut qui sort un contenu du jeu pour toute l'équipe (Écartée, Clôturé, Archivé).
   * Le texte dit l'effet ET qu'il se rattrape : la fenêtre protège d'un mauvais toucher, elle ne doit pas
   * faire croire à une perte. Contenu disparu entre-temps : rien à confirmer. */
  function confirmStatusModal(m) {
    var topic = Core.findTopic(Store.view, m.topicId);
    if (!topic) { return null; }
    if (m.kind === "proposal") {
      var proposal = Core.findProposal(topic, m.proposalId);
      if (!proposal) { return null; }
      return confirmModal("Écarter la proposition",
        "« " + proposal.title + " » passera en « Écartée » pour toute l'équipe. Vous pourrez rétablir son statut ensuite.",
        "Écarter", function () { closeOverlay(); applyProposalStatus(topic, proposal, m.status); });
    }
    var archived = m.status === "archived";
    return confirmModal(archived ? "Archiver le sujet" : "Clôturer le sujet",
      archived
        ? "« " + topic.title + " » quittera la liste des sujets pour toute l'équipe. Il restera dans « Afficher les sujets archivés »."
        : "« " + topic.title + " » passera en « Clôturé » pour toute l'équipe. Vous pourrez rétablir son statut ensuite.",
      archived ? "Archiver" : "Clôturer", function () { closeOverlay(); applyTopicStatus(topic, m.status); });
  }

  /* Lever l'anonymat d'un de MES messages : seul ce sens se confirme (voir la feuille du message). */
  function signMessageModal(m) {
    var topic = Core.findTopic(Store.view, m.topicId);
    var message = topic ? Core.findMessage(topic, m.messageId) : null;
    if (!message || !message.anon) { return null; }
    return confirmModal("Signer avec mon nom",
      "Votre nom s'affichera sur ce message pour toute l'équipe. Ceux qui l'auront vu le sauront, même si vous le rendez anonyme ensuite.",
      "Signer", function () { closeOverlay(); App.actions.setMessageSignature(m.topicId, m.messageId, false); });
  }

  function confirmModal(title, text, confirmLabel, onConfirm) {
    return modal(title, el("p", { class: "hint", text: text }), [
      el("button", { class: "btn btn-outline", type: "button", text: "Annuler", onclick: closeOverlay }),
      el("button", { class: "btn btn-danger", type: "button", text: confirmLabel, onclick: onConfirm })
    ]);
  }

  function renderOverlay() {
    Utils.clear(overlayRoot);
    var spec = UI.local.sheet;
    var node = null;

    if (spec) {
      if (spec.type === "message") { node = messageSheet(spec); }
      else if (spec.type === "topicInfo") { node = topicInfoSheet(spec); }
      else if (spec.type === "pandoreInfo") { node = pandoreInfoSheet(); }
      else if (spec.type === "install") { node = installSheet(); }
    } else if (UI.local.modal) {
      var m = UI.local.modal;
      if (m.type === "createTopic") { node = createTopicModal(m); }
      else if (m.type === "confirmStatus") { node = confirmStatusModal(m); }
      else if (m.type === "confirmSystem") { node = confirmSystemModal(m); }
      else if (m.type === "signMessage") { node = signMessageModal(m); }
      else if (m.type === "editTopic") { node = editTopicModal(m); }
      else if (m.type === "editMessage") { node = editMessageModal(m); }
      else if (m.type === "createProposal" || m.type === "editProposal") { node = proposalModal(m); }
      else if (m.type === "logout") {
        /* Une perte irréversible et invisible se confirme AVANT, elle ne s'explique pas
         * après. On nomme donc les trois conséquences, et on compte ce qui attend
         * d'être envoyé — c'est la seule qui détruit du travail. */
        var waiting = Sync.diagnostics().pending.length;
        node = confirmModal("Se déconnecter de l'équipe",
          "Votre nom et l'accès à l'équipe seront oubliés sur ce téléphone. Vous ne "
          + "pourrez plus modifier vos messages anonymes."
          + (waiting
            ? " ⚠️ " + waiting + (waiting > 1 ? " actions attendent" : " action attend")
              + " d'être envoyée" + (waiting > 1 ? "s" : "") + (waiting > 1 ? " et seront" : " et sera")
              + " perdue" + (waiting > 1 ? "s" : "") + "."
            : ""),
          "Se déconnecter", function () { App.logout(); });
      }
    }

    if (node) {
      node.addEventListener("keydown", keepTabInside);
      overlayRoot.appendChild(node);
    }
  }

  /* ============================================================ RENDU ==== */

  function currentScreen() {
    var gate = App.gate();
    if (gate === "connection") { return screenConnection(); }
    if (gate === "name") { return screenName(); }
    if (gate === "lock") { return screenLock(); }

    var route = App.route;
    if (route.name === "topic") { return screenTopic(route.topicId); }
    if (route.name === "proposals") { return screenProposals(route.topicId); }
    if (route.name === "conclusion") { return screenConclusion(route.topicId); }
    if (route.name === "branch") { return screenBranch(route.topicId, route.messageId); }
    if (route.name === "system") { return screenSystem(); }
    if (route.name === "pandoreSynthesis") { return screenPandoreSynthesis(); }
    var screen = route.name === "settings" ? screenSettings()
      : route.name === "meeting" ? screenMeeting()
      : route.name === "pandore" ? screenPandore()
      : screenTopics();
    screen.classList.add("has-tabbar");
    screen.appendChild(tabBar(TAB_OF[route.name] || "topics"));
    return screen;
  }

  /* ================================================== Barre de navigation ==== */

  /* Quatre destinations, toujours visibles sur les écrans de premier niveau : Sujets, Réunion, Pandore, Réglages.
   * Pandore y a sa place à part entière : ce n'est pas un espace de discussion mais une zone d'expression libre et
   * anonyme, qui ne dépend d'aucun sujet. Dans un sujet (discussion, propositions, consensus), la barre disparaît :
   * l'écran appartient au sujet, et le bouton retour ramène à la liste.
   *
   * Sujets reste la SEULE racine (voir PARENT dans js/app.js) : les trois autres onglets en sont des enfants directs.
   * Passer de l'un à l'autre remplace l'entrée d'historique (même profondeur) ; le geste retour du système ramène
   * donc toujours à Sujets, puis sort de l'application. C'est la convention d'Android, et elle ne demande aucune
   * interception. */
  var TABS = [
    { name: "topics", hash: "#/", icon: "message", label: "Sujets" },
    { name: "meeting", hash: "#/meeting", icon: "doc", label: "Réunion" },
    { name: "pandore", hash: "#/pandore", icon: "inbox", label: "Pandore" },
    { name: "settings", hash: "#/settings", icon: "settings", label: "Réglages" }
  ];
  var TAB_OF = { topics: "topics", meeting: "meeting", pandore: "pandore", settings: "settings" };

  function tabBar(current) {
    return el("nav", { class: "tabbar no-print", "aria-label": "Navigation principale" }, [
      el("div", { class: "tabbar-inner" }, TABS.map(function (tab) {
        var here = tab.name === current;
        return el("button", {
          class: "tabbar-item" + (here ? " is-current" : ""), type: "button", "data-key": "tab-" + tab.name,
          "aria-current": here ? "page" : null,
          onclick: function () { if (!here) { App.go(tab.hash); } }
        }, [
          /* Le trait de l'onglet courant est un élément, pas un ::before : View Transitions le fait glisser d'un
           * onglet à l'autre (css/uxer.css). Décoratif : aria-current porte l'information. */
          here ? el("span", { class: "tabbar-mark", "aria-hidden": "true" }) : null,
          icon(tab.icon, 22), el("span", { class: "tabbar-label", text: tab.label })
        ]);
      }))
    ]);
  }

  /* Pendant la saisie, la barre s'efface : sur iPhone elle resterait accrochée au bas de la page, derrière ou
   * au-dessus du clavier, et sur Android elle mangerait la hauteur laissée au champ. */
  function onTypingFocus(e) {
    var t = e.target;
    var typing = !!t && (t.tagName === "TEXTAREA" || t.tagName === "SELECT" ||
      (t.tagName === "INPUT" && !/^(button|submit|checkbox|radio|range|color|file|reset|image)$/i.test(t.type || "")));
    document.documentElement.classList.toggle("is-typing", e.type === "focusin" && typing);
  }

  function signature() {
    /* Le statut de synchronisation est volontairement EXCLU : il est rafraîchi
     * en place (UI.refreshStatus) pour ne pas re-rendre pendant la frappe. */
    return [
      App.gate() || "",
      App.route.raw,
      Store.version,
      UI.local.version,
      App.user.id,
      App.user.name
    ].join("|");
  }

  /* Titre du document, un par écran : « Titre du sujet - BrainstO. ». Il est annoncé à chaque
   * changement de page et tient lieu d'intitulé d'onglet et d'historique (A11-015). Le focus, lui,
   * ne bouge pas à la navigation (ORCH A11-008). */
  function pageTitle() {
    var tail = " - " + CONFIG.APP_NAME;
    var gate = App.gate();
    if (gate === "connection") { return "Connexion" + tail; }
    if (gate === "name") { return "Votre nom" + tail; }
    if (gate === "lock") { return "Espace verrouillé" + tail; }
    var route = App.route;
    var topic = route.topicId ? Core.findTopic(Store.view, route.topicId) : null;
    if (route.name === "topic") {
      return (topic ? topic.title : (awaitingFirstData() ? "Pas encore disponible" : "Introuvable")) + tail;
    }
    if (route.name === "proposals") { return "Propositions" + (topic ? " : " + topic.title : "") + tail; }
    if (route.name === "conclusion") { return "Consensus" + (topic ? " : " + topic.title : "") + tail; }
    if (route.name === "branch") {
      /* Même règle que l'écran : message source absent, ou réponse d'une exploration → introuvable. */
      var root = topic ? Core.findMessage(topic, route.messageId) : null;
      if (!root || root.branchRootId) { return (awaitingFirstData() ? "Pas encore disponible" : "Introuvable") + tail; }
      return "Exploration : " + topic.title + tail;
    }
    if (route.name === "settings") { return "Réglages" + tail; }
    if (route.name === "meeting") { return "Synthèse de réunion" + tail; }
    if (route.name === "system") { return "Système" + tail; }
    if (route.name === "pandore") { return "Pandore" + tail; }
    if (route.name === "pandoreSynthesis") { return "Synthèse de Pandore" + tail; }
    return "Sujets" + tail;
  }

  function setPageTitle() {
    var title = pageTitle();
    if (document.title !== title) { document.title = title; }
  }

  function threadIdentity(node) {
    return node.getAttribute("data-thread") + "|" + (node.getAttribute("data-branch") || "");
  }

  /* Bulle du message source quand on revient d'une de ses explorations vers le fil principal du MÊME sujet. */
  function returningFromBranch(previousKey, newThread) {
    if (!previousKey || newThread.getAttribute("data-branch")) { return null; }
    var parts = previousKey.split("|");
    if (parts[0] !== newThread.getAttribute("data-thread") || !parts[1]) { return null; }
    var bubbles = newThread.querySelectorAll(".bubble[data-message-id]");
    for (var i = 0; i < bubbles.length; i++) {
      if (bubbles[i].getAttribute("data-message-id") === parts[1]) { return bubbles[i]; }
    }
    return null;
  }

  function centerInThread(thread, node) {
    var box = thread.getBoundingClientRect();
    var r = node.getBoundingClientRect();
    thread.scrollTop = Math.max(0, thread.scrollTop + (r.top - box.top) - (thread.clientHeight - r.height) / 2);
  }

  UI.render = function () {
    if (!appRoot) { return; }
    var sig = signature();
    if (!forceNext && sig === lastSignature) { return; }
    forceNext = false;
    lastSignature = sig;

    /* Les animations d'entrée ne se jouent qu'en ARRIVANT sur un écran. Une
     * mise à jour de données (message reçu, vote) ne doit pas relancer la
     * cascade : une animation d'entrée qui se répète devient du clignotement.
     *
     * Mais le rendu DÉTRUIT et reconstruit le nœud à chaque appel. Une entrée
     * suivie d'un second rendu perdait donc son animation en cours de route —
     * et c'était le cas systématiquement au démarrage : `Sync.boot()` résout,
     * appelle `UI.force()`, et le deuxième rendu arrivait une milliseconde
     * après le premier. L'animation d'accueil vivait une milliseconde, puis son
     * nœud disparaissait. Aucune animation d'entrée n'a donc jamais été visible
     * sur l'écran de connexion.
     *
     * On mémorise l'INSTANT de l'entrée, pas seulement le fait qu'elle a eu
     * lieu. Tant que la fenêtre d'entrée est ouverte, un rendu qui retombe au
     * même endroit repose la classe ET publie le temps déjà écoulé
     * (`--enter-elapsed`), que app.css retranche de chaque délai. Un délai
     * négatif démarre l'animation en cours de route : elle REPREND où elle en
     * était au lieu de recommencer — ce qui serait un clignotement, et de
     * disparaître — ce qui était le défaut. */
    var place = (App.gate() || "") + "|" + App.route.raw;
    var entering = place !== lastPlace;
    var samePlace = !entering;
    /* Changer d'écran clôt le contexte d'édition : sans cette remise à zéro, un
     * brouillon abandonné battrait indéfiniment une valeur légitimement mise à jour. */
    if (entering) { touchedDrafts = {}; }
    lastPlace = place;

    var elapsed = 0;
    if (entering) {
      enterAt = Utils.now();
    } else if (enterAt !== 0) {
      elapsed = Utils.now() - enterAt;
      if (elapsed < ENTER_WINDOW_MS) { entering = true; } else { enterAt = 0; elapsed = 0; }
    }

    var drafts = captureDrafts();
    var focus = captureFocus();

    /* Position de défilement du fil de discussion. Le fil principal et l'exploration d'un message partagent le même
     * sujet (`data-thread`) : c'est `data-branch` qui les distingue. */
    var thread = document.querySelector(".thread");
    var scrollTop = thread ? thread.scrollTop : 0;
    var threadKey = thread ? threadIdentity(thread) : null;
    var atBottom = thread ? (thread.scrollHeight - thread.scrollTop - thread.clientHeight) < 80 : true;

    Utils.clear(appRoot);
    var screen = currentScreen();
    if (entering) {
      screen.classList.add("screen--enter");
      screen.style.setProperty("--enter-elapsed", elapsed + "ms");
    }
    appRoot.appendChild(screen);
    renderOverlay();
    restoreDrafts(drafts);
    setPageTitle();

    var newThread = document.querySelector(".thread");
    if (newThread) {
      var sameThread = threadIdentity(newThread) === threadKey;
      var returnTo = !sameThread ? returningFromBranch(threadKey, newThread) : null;
      if (returnTo) {
        /* Retour d'une exploration : le fil principal se rouvre SUR son message source, pas en bas — on revient là
         * d'où l'on est parti. */
        centerInThread(newThread, returnTo);
      } else if (!sameThread && newThread.getAttribute("data-branch") && !UI.local.scrollToBottom) {
        /* Arrivée dans une exploration : le message d'origine en tête, c'est lui qui donne le contexte. */
        newThread.scrollTop = 0;
      } else if (!sameThread || UI.local.scrollToBottom || atBottom) {
        newThread.scrollTop = newThread.scrollHeight;
      } else {
        newThread.scrollTop = scrollTop;
      }
      UI.local.scrollToBottom = false;
      /* Hauteur de référence du rattrapage : le nœud est recréé à chaque rendu,
       * la mesure doit l'être aussi. */
      lastThreadHeight = newThread.clientHeight;
    } else {
      lastThreadHeight = 0;
    }

    settleFocus(focus, samePlace);
    UI.refreshStatus();

    /* La présentation est décidée APRÈS le rendu, et depuis l'extérieur de son
     * cycle : elle ne participe ni à `signature()` ni à `place`, donc changer
     * d'étape ne reconstruit pas l'écran. */
    var gate = App.gate();
    onboardSyncWithGate(gate);
    if (!gate) { onboardMaybeStart(elapsed); }
  };

  /* ================================================ Présentation initiale ==== */

  /* ⚠️ Ce calque vit HORS du cycle de UI.render, et c'est la décision qui tient
   * tout le reste. Si l'étape courante entrait dans UI.local, chaque « Suivant »
   * incrémenterait UI.local.version, donc la signature, donc reconstruirait #app :
   * le focus serait perdu — seuls les [data-draft] sont restaurés — et la région
   * d'annonce serait recréée AVEC son contenu, or une région live insérée en même
   * temps que son texte n'annonce rien.
   *
   * Il mute donc son propre sous-arbre, sur le modèle de UI.refreshStatus. Les
   * nœuds de commande ne sont jamais recréés : seuls leurs libellés changent, ce
   * qui garde le focus stable d'une étape à l'autre.
   *
   * Corollaire à assumer : ouvert par showModal(), le dialogue passe dans le
   * calque supérieur, donc AU-DESSUS des toasts. Pendant la trentaine de secondes
   * de la présentation, un toast d'erreur de synchronisation serait masqué. Le
   * bandeau de nouvelle version, lui, est ajourné explicitement (voir plus bas)
   * parce qu'il porte un bouton focusable et qu'il est le seul chemin de mise à
   * jour chez quelqu'un qui ne peut pas vider son cache. */

  var onboard = null;         // { panels, step, segment, nodes… } quand la présentation est à l'écran
  var onboardPaused = null;   // le même objet, mis de côté quand un gate reprend la main
  var pendingUpdate = null;   // rappel du bandeau de version, ajourné
  var bannerUpdate = null;    // rappel d'un bandeau DÉJÀ posé, à reprendre si le calque monte
  var onboardTimer = 0;

  /* Attente avant de poser le calque, comptée depuis l'arrivée sur l'écran. Ce
   * n'est pas ENTER_WINDOW_MS (1400 ms) : cette constante-là borne la REPRISE
   * d'une animation, pas sa durée. Ce qu'il faut laisser finir, c'est la cascade
   * de révélation des cartes — --reveal-duration (220 ms) plus six crans de
   * --reveal-stagger (18 ms), soit 328 ms. Arrondi à 360. Au-delà, on ferait
   * attendre pour rien ; en dessous, deux choses bougeraient en même temps. */
  var ONBOARD_DELAY_MS = 360;

  /* Les cinq parties de l'application, dans l'ordre où on les traverse. Ce ne sont
   * pas des panneaux choisis : la liste EST le cycle réel.
   *
   * Les icônes sont celles de l'interface, à l'identique — `message` sur les cartes
   * de sujet, `users` pour les participants, `idea` et `checkCircle` dans la
   * quickbar, `print` sur « Ouvrir la synthèse ». C'est le vrai levier du « ça a
   * toujours fait partie de l'application » : le signe vu dans le panneau est celui
   * qu'on retrouvera dans la barre.
   *
   * `textLocal` et `textJoining` remplacent le corps quand le segment le demande :
   * on ne promet pas un collectif absent à quelqu'un qui est seul, et on n'explique
   * pas comment créer le premier sujet à quelqu'un qui arrive sur un espace déjà
   * actif. */
  var ONBOARD_TEXT = {
    topics: {
      icon: "message",
      eyebrow: "Les sujets",
      title: "Un sujet par point à traiter",
      text: "« Nouveau sujet » en ajoute un, signé ou anonyme. Épinglez les plus "
        + "importants : ils restent en tête, pour tous.",
      textLocal: "En mode local, rien n'est partagé avec l'équipe. Le vote et les "
        + "réactions prennent leur sens à plusieurs."
    },
    debate: {
      icon: "users",
      eyebrow: "Le débat",
      title: "On en discute, chacun à son rythme",
      text: "Appui long sur une bulle : réagir, citer, en tirer une proposition. "
        + "Le masque, à gauche du champ, publie en anonyme.",
      textJoining: "L'équipe a déjà lancé des sujets : ouvrez-en un pour lire la "
        + "discussion. Appui long sur une bulle pour réagir ou en tirer une "
        + "proposition."
    },
    proposals: {
      icon: "idea",
      eyebrow: "Propositions",
      title: "Les idées deviennent des propositions",
      text: "Chacun vote pour, contre ou abstention. La barre montre où en est "
        + "l'équipe.",
      extra: "votebar"
    },
    conclusion: {
      icon: "checkCircle",
      eyebrow: "Le consensus",
      title: "Quand toute l'équipe est d'accord",
      text: "Si toute l'équipe vote la même chose, pour ou contre, la proposition "
        + "passe dans Consensus. L'onglet Réunion rassemble tout sur une page."
    },
    pandore: {
      icon: "inbox",
      eyebrow: "Pandore",
      title: "Ce qui ne se dit pas en réunion",
      text: "Une idée, une plainte, une question : déposez-la, anonymement. Un message "
        + "déposé ne se modifie plus. Ce qui en ressort est regroupé dans une "
        + "synthèse. Cette présentation se revoit depuis les Réglages.",
      extra: "logo"
    }
  };

  function onboardPanel(id) {
    return ONBOARD_TEXT[id] || ONBOARD_TEXT.topics;
  }

  function onboardBody(spec, segment) {
    if (segment === "local" && spec.textLocal) { return spec.textLocal; }
    if (segment === "joining" && spec.textJoining) { return spec.textJoining; }
    return spec.text;
  }

  /* Appui visuel, jamais une flèche vers l'écran : on montre la forme réelle de
   * l'objet dont on parle, en miniature, dans le panneau. La barre de vote est
   * reprise telle quelle — mêmes classes, donc mêmes couleurs sémantiques — avec
   * des proportions d'exemple. `aria-hidden` : le corps du panneau dit déjà les
   * trois voix, le lecteur d'écran n'a pas à entendre une décoration. */
  function onboardExtra(kind) {
    if (kind === "votebar") {
      return el("div", { class: "note onboard-extra", "aria-hidden": "true" }, [
        el("div", { class: "vote-bar", style: { margin: "0", flex: "1" } }, [
          el("span", { class: "vote-for", style: { width: "55%" } }),
          el("span", { class: "vote-against", style: { width: "27%" } }),
          el("span", { class: "vote-abstain", style: { width: "18%" } })
        ])
      ]);
    }
    if (kind === "logo") {
      /* Le monogramme AU REPOS — anneau et point, sans animation. La séquence
       * d'accueil ne se rejoue pas ici : deux gestes expressifs à la suite en
       * feraient un diaporama. */
      return el("div", { class: "onboard-extra onboard-mark", "aria-hidden": "true" },
        [Utils.logoMark(40)]);
    }
    return null;
  }

  /* Le libellé de la sortie dit ce qui se passe ensuite : « Suivant » tant qu'il
   * reste une étape, « Commencer » sur la dernière. Jamais « Fermer », qui
   * n'annonce rien. */
  /* PEINDRE seulement. Voir onboardAnnounce pour la raison de la séparation. */
  function onboardPaint() {
    if (!onboard) { return; }
    var total = onboard.panels.length;
    var index = onboard.step;
    var last = index >= total - 1;
    var spec = onboardPanel(onboard.panels[index]);

    Utils.clear(onboard.eyebrow);
    onboard.eyebrow.appendChild(icon(spec.icon, 14));
    onboard.eyebrow.appendChild(el("span", { text: spec.eyebrow }));
    onboard.eyebrow.appendChild(el("span", { class: "spacer" }));
    onboard.eyebrow.appendChild(el("span", {
      class: "counter", text: (index + 1) + " / " + total
    }));

    onboard.title.textContent = spec.title;
    onboard.text.textContent = onboardBody(spec, onboard.segment);

    /* L'appui visuel est le seul nœud recréé d'une étape à l'autre : il n'est
     * jamais focusable, donc le focus n'en dépend pas. */
    Utils.clear(onboard.extra);
    Utils.append(onboard.extra, onboardExtra(spec.extra));
    onboard.extra.hidden = !spec.extra;

    onboard.prev.hidden = index === 0;
    onboard.skip.hidden = last;
    Utils.clear(onboard.next);
    onboard.next.appendChild(el("span", { text: last ? "Commencer" : "Suivant" }));
    if (!last) { onboard.next.appendChild(icon("forward", 18)); }

    /* Fondu du contenu à chaque changement d'étape — jamais au premier affichage,
     * qui a son propre geste d'arrivée. Relancer une animation CSS exige de retirer
     * la classe, de forcer un recalcul, puis de la reposer : sans le recalcul, le
     * navigateur regroupe les deux mutations et ne voit aucun changement. */
    if (onboard.applied) {
      onboard.card.classList.remove("is-step");
      void onboard.card.offsetWidth;
      onboard.card.classList.add("is-step");
    }
  }

  /* ANNONCER, et placer le focus. Séparé de la peinture, et appelé APRÈS l'ouverture :
   * `showModal()` déplace le focus et déclenche l'annonce du dialogue, donc le titre
   * doit déjà être écrit à cet instant — sinon `aria-labelledby` pointe une chaîne
   * vide et le dialogue s'annonce sans nom.
   *
   * Le focus va sur le TITRE, pas sur le conteneur : un conteneur générique sans nom
   * ni rôle est lu soit intégralement — surtitre, compteur, titre, texte et trois
   * boutons d'un coup — soit pas du tout, selon le lecteur d'écran. Un `h2` a une
   * annonce courte, déterministe, et une sémantique d'en-tête.
   *
   * La région porte le CORPS du panneau, pas seulement son titre : c'est la charge
   * utile, et `aria-describedby` posé sur le dialogue n'est consommé qu'à l'entrée,
   * pas à chaque changement d'étape.
   *
   * Et on n'y écrit RIEN à la première peinture : l'annonce d'ouverture du dialogue
   * porte déjà le titre, l'y répéter le ferait lire deux fois. */
  function onboardAnnounce() {
    if (!onboard) { return; }
    var index = onboard.step;
    var spec = onboardPanel(onboard.panels[index]);

    onboard.title.focus();

    if (onboard.applied) {
      onboard.live.textContent = "Étape " + (index + 1) + " sur " + onboard.panels.length
        + ". " + spec.title + ". " + onboardBody(spec, onboard.segment);
    }
    onboard.applied = true;
  }

  function onboardApply() {
    onboardPaint();
    onboardAnnounce();
  }

  function onboardBuild() {
    var live = el("div", { class: "onboard-live", role: "status", "aria-live": "polite" });
    var eyebrow = el("div", { class: "section-title onboard-eyebrow" });
    var title = el("h2", {
      class: "onboard-title", id: "onboard-title", text: "", tabindex: "-1"
    });
    var text = el("p", { class: "hint onboard-text", id: "onboard-text", text: "" });

    var skip = el("button", {
      /* Le libellé visible reste court ; le nom accessible, lui, est entendu hors de
       * tout contexte visuel — « Passer » seul n'y dit pas quoi. */
      class: "btn btn-ghost onboard-skip", type: "button", text: "Passer",
      "aria-label": "Passer la présentation",
      onclick: function () { UI.closeOnboarding(true); }
    });
    var prev = el("button", {
      class: "btn btn-outline onboard-prev", type: "button",
      "aria-label": "Étape précédente",
      onclick: function () { UI.onboardingGo(-1); }
    }, [icon("back", 18)]);
    var next = el("button", {
      class: "btn btn-primary onboard-next", type: "button",
      onclick: function () { UI.onboardingGo(1); }
    });

    /* « Passer » est DERNIER dans le DOM et premier à l'écran (`order` en CSS) :
     * c'est une sortie, pas une action principale — elle ne doit pas précéder les
     * commandes dans l'ordre de tabulation. */
    var extra = el("div", { class: "onboard-extra-slot" });
    var foot = el("div", { class: "onboard-foot" }, [prev, next, skip]);
    /* Le pied est SŒUR du corps, pas son enfant : c'est ce qui le garde visible quand
     * le corps déborde. Un pied collant obtiendrait le même effet visuel, mais le
     * contenu extrait du flux est justement ce que les critères de grossissement
     * reprochent — il masque le focus et rend la lecture difficile. Une colonne
     * flexible n'a pas ce défaut. */
    var card = el("div", { class: "onboard-card" }, [eyebrow, title, text, extra]);
    var dialog = el("dialog", {
      class: "onboard",
      "aria-labelledby": "onboard-title",
      "aria-describedby": "onboard-text"
    }, [live, card, foot]);

    return {
      dialog: dialog, card: card, live: live, eyebrow: eyebrow,
      title: title, text: text, extra: extra, skip: skip, prev: prev, next: next
    };
  }

  function onboardMount(plan) {
    if (!onboardRoot || onboard) { return; }
    var nodes = onboardBuild();
    onboard = {
      panels: plan.panels.slice(),
      step: Math.max(0, Math.min(plan.step || 0, plan.panels.length - 1)),
      segment: plan.segment,
      returnFocus: document.activeElement,
      dialog: nodes.dialog, card: nodes.card, live: nodes.live,
      eyebrow: nodes.eyebrow, title: nodes.title, text: nodes.text,
      extra: nodes.extra, skip: nodes.skip, prev: nodes.prev, next: nodes.next
    };

    /* ⚠️ Report dans l'AUTRE sens, et il est indispensable : `showUpdateBanner` est
     * appelé à la résolution de `register()`, donc bien avant que le calque ne se
     * monte. Le cas fréquent n'est pas « le bandeau arrive pendant la séquence »,
     * c'est « la séquence monte au-dessus d'un bandeau déjà là ». Or le bandeau est
     * à `--z-banner` (70) contre `--z-onboard` (65), au même ancrage bas : sur le
     * chemin de repli, où il n'y a ni calque supérieur ni inertie, il RECOUVRE les
     * commandes du panneau. On le retire et on garde son rappel. */
    if (bannerUpdate) {
      pendingUpdate = bannerUpdate;
      bannerUpdate = null;
      var posed = document.querySelector(".update-banner");
      if (posed && posed.parentNode) { posed.parentNode.removeChild(posed); }
    }

    /* Un clavier ouvert derrière le calque n'a plus d'objet : aucune étape ne
     * contient de champ de saisie. */
    if (document.activeElement && document.activeElement.blur) { document.activeElement.blur(); }

    /* Peint AVANT d'être posé et ouvert : à l'ouverture, le titre doit exister. */
    onboardPaint();
    onboardRoot.appendChild(nodes.dialog);

    /* ⚠️ showModal() donne d'un coup le piège de focus, le calque supérieur et
     * l'inertie réelle de l'arrière-plan — donc les exigences d'un dialogue modal
     * sans une ligne de gestion manuelle du focus.
     *
     * Mais tests/qa/feature-baseline.json lui donne un plancher WebKit 15.4, un
     * mode d'échec « throws » et une sévérité haute, et browser-matrix.json classe
     * iOS 15.0 → 15.3 en tier B, où une dégradation cosmétique est tolérée mais
     * JAMAIS une perte de fonction. Un appel non gardé y lèverait une exception et
     * emporterait la séquence. D'où la garde, et le repli : carte non modale, sans
     * voile, qui laisse l'application accessible derrière. */
    var modal = typeof nodes.dialog.showModal === "function";
    if (modal) {
      /* Gardé par le `typeof` ci-dessus ET par ce try/catch. Sur les moteurs sans
         <dialog> — Safari iOS 15.0 → 15.3, la sonde tier B — on retombe sur
         `.onboard--flat` : carte non modale, sans voile, application accessible
         derrière. Dégradation cosmétique documentée, pas perte de fonction. */
      /* qa-allow: js-dialog-showmodal — appel gardé, repli .onboard--flat. */
      try { nodes.dialog.showModal(); }
      catch (error) { modal = false; }
    }
    if (!modal) {
      nodes.dialog.classList.add("onboard--flat");
      nodes.dialog.setAttribute("open", "");
      nodes.dialog.setAttribute("role", "dialog");
    }
    onboard.modal = modal;

    /* La classe d'arrivée porte le seul geste un peu dépensier de la séquence, et
     * elle est retirée quand il est fini : sans cela, l'animation d'entrée du
     * panneau et le fondu de changement d'étape se disputeraient la propriété
     * `animation` de la même carte. */
    nodes.dialog.classList.add("onboard--enter");
    setTimeout(function () {
      if (onboard && onboard.dialog === nodes.dialog) {
        nodes.dialog.classList.remove("onboard--enter");
      }
    }, 420);

    /* Échap : servi nativement en modal, à câbler sur le chemin de repli. Le
     * gestionnaire global de js/app.js le connaît aussi, pour ne pas déclencher
     * un rendu complet de l'écran de fond à chaque appui. */
    nodes.dialog.addEventListener("cancel", function (event) {
      event.preventDefault();
      UI.closeOnboarding(true);
    });

    /* ⚠️ Le geste de retour d'Android n'est intercepté par un `<dialog>` modal que
     * depuis Chromium 120. En dessous — le plancher du tier A est 108 —, il navigue
     * SANS que `cancel` ne parte : on se retrouvait alors avec une navigation
     * effectuée ET le panneau toujours ouvert, posé sur un autre écran, annonçant
     * « Étape 2 / 5 » de quelque chose qu'on a quitté.
     *
     * Une navigation vaut donc sortie, sur tous les moteurs : c'est exactement ce que
     * `CloseWatcher` fait au-dessus de 120, où `cancel` a déjà fermé avant que ce
     * gestionnaire ne puisse partir. La séquence, elle, ne navigue jamais d'elle-même
     * — il n'y a pas de faux positif à craindre. */
    onboard.onNavigate = function () { UI.closeOnboarding(true); };
    window.addEventListener("hashchange", onboard.onNavigate);

    onboardAnnounce();
  }

  function onboardUnmount(pausing) {
    if (!onboard) { return null; }
    var kept = { panels: onboard.panels, step: onboard.step, segment: onboard.segment };
    var focus = onboard.returnFocus;
    if (onboard.onNavigate) { window.removeEventListener("hashchange", onboard.onNavigate); }
    if (onboard.modal && typeof onboard.dialog.close === "function") {
      try { onboard.dialog.close(); } catch (error) { /* déjà fermé */ }
    }
    if (onboard.dialog.parentNode) { onboard.dialog.parentNode.removeChild(onboard.dialog); }
    onboard = null;

    /* Rendre le focus. À la première connexion l'élément déclencheur n'existe pas :
     * on prend alors le premier élément interactif de l'écran réel. Jamais
     * document.body, qui renvoie le lecteur d'écran en haut du document sans le
     * dire. */
    var target = (focus && focus.isConnected && focus !== document.body) ? focus : null;
    if (!target && appRoot) { target = appRoot.querySelector("button, [href], input, select, textarea"); }
    if (target && target.focus) { target.focus(); }

    /* Sur une PAUSE — un gate a reprix la main —, le bandeau reste ajourné : le
     * ressortir le poserait sur l'écran de verrou, puis il se retrouverait derrière
     * le calque remonté, avec un bouton focusable hors du piège de focus. C'est
     * exactement l'état que le report cherche à éviter. */
    if (heldToasts.length && pausing !== true) {
      var held = heldToasts;
      heldToasts = [];
      held.forEach(function (item) { UI.toast(item.text, item.kind); });
    }

    if (pendingUpdate && pausing !== true) {
      var resume = pendingUpdate;
      pendingUpdate = null;
      UI.showUpdateBanner(resume);
    }
    return kept;
  }

  UI.onboardingActive = function () { return !!onboard; };

  /* Un toast levé pendant la séquence est-il perdu ? Oui, et seulement en modal :
   * `showModal()` place le dialogue dans le calque supérieur, donc au-dessus des
   * toasts malgré `--z-toast`, et l'arrière-plan étant inerte sa région `aria-live`
   * est retirée de l'arbre d'accessibilité — ni vu, ni entendu. Sur le chemin de
   * repli, il n'y a ni calque supérieur ni inertie : le toast se voit, on n'y touche
   * pas.
   *
   * Les messages sont donc mis de côté et dits au démontage. Plafonné à trois : après
   * une trentaine de secondes, une rafale de dix n'apprendrait rien de plus, et la
   * première erreur est celle qui compte. */
  var heldToasts = [];

  UI.onboardingHoldsToasts = function () { return !!onboard && onboard.modal === true; };

  UI.holdToast = function (text, kind) {
    if (heldToasts.length >= 3) { return; }
    heldToasts.push({ text: text, kind: kind });
  };

  UI.startOnboarding = function (plan) {
    if (!plan || !plan.panels || !plan.panels.length) { return; }
    onboardPaused = null;
    onboardMount(plan);
  };

  /* Rejeu depuis les réglages. Il monte le calque DIRECTEMENT, sans passer par un
   * rendu, et c'est délibéré : `restoreDrafts` ne restaure un brouillon que si le
   * champ reconstruit est vide (voir plus haut), or le champ « Votre nom » des
   * réglages est pré-rempli. Un rendu effacerait donc un prénom en cours de saisie.
   * Le défaut est général et préexistant — n'importe quel rendu le produit — mais ce
   * chantier n'a pas à l'aggraver. */
  UI.replayOnboarding = function () {
    if (onboardTimer) { clearTimeout(onboardTimer); onboardTimer = 0; }
    if (onboard) { onboardUnmount(); }
    onboardPaused = null;
    if (App.gate()) { return; }
    var plan = App.onboardingPlan();
    if (!plan) { return; }
    App.markOnboardingShown();
    onboardMount(plan);
  };

  UI.onboardingGo = function (delta) {
    if (!onboard) { return; }
    var next = onboard.step + delta;
    if (next < 0) { return; }
    if (next >= onboard.panels.length) { UI.closeOnboarding(false); return; }
    onboard.step = next;
    App.noteOnboardingStep(next);
    onboardApply();
  };

  UI.closeOnboarding = function (skipped) {
    if (!onboard) { return; }
    onboardUnmount();
    onboardPaused = null;
    App.finishOnboarding(skipped === true);
  };

  /* Un gate qui réapparaît — reverrouillage après une heure, retour sur la
   * connexion — PRIME sur la présentation : le calque disparaît, l'étape est
   * conservée, et la séquence reprend une fois le gate franchi. */
  function onboardSyncWithGate(gate) {
    if (gate) {
      if (onboardTimer) { clearTimeout(onboardTimer); onboardTimer = 0; }
      if (onboard) { onboardPaused = onboardUnmount(true); }
      return;
    }
    if (onboardPaused && !onboard) {
      var resume = onboardPaused;
      onboardPaused = null;
      onboardMount(resume);
    }
  }

  /* Décidée à chaque rendu, mais armée une seule fois : le calque ne se pose que
   * lorsque plus aucun gate ne réclame l'écran et que la cascade d'entrée est
   * finie. */
  function onboardMaybeStart(elapsed) {
    if (onboard || onboardPaused || onboardTimer) { return; }
    if (App.gate()) { return; }
    if (!App.onboardingWanted || !App.onboardingWanted()) { return; }
    var wait = Math.max(0, ONBOARD_DELAY_MS - (elapsed || 0));
    onboardTimer = setTimeout(function () {
      onboardTimer = 0;
      if (onboard || App.gate() || !App.onboardingWanted()) { return; }
      var plan = App.onboardingPlan();
      if (!plan) { return; }
      App.markOnboardingShown();
      UI.startOnboarding(plan);
    }, wait);
  }

  /* -------------------------------------------------- Bandeau nouvelle version --- */

  var UPDATE_BANNER_TEXT = "Une nouvelle version est disponible.";
  var bannerSaid = false;   // le bandeau posé a déjà été annoncé : une seule annonce par apparition

  /* ⚠️ REC-UI-052 (WCAG 4.1.3) : le bandeau est un bloc posé sur <body>, sans rôle ni aria-live ; aucun
   * lecteur d'écran n'apprenait donc qu'une mise à jour attendait. Son apparition est ANNONCÉE UNE FOIS par la
   * région vive qui existe déjà, #toast-root (role="status", aria-live="polite", présente dès le chargement :
   * une région insérée avec son contenu n'annonce rien), dans un nœud masqué à l'écran : aucun toast visible
   * en doublon du bandeau. Jamais de second role="status" ni d'aria-live sur le bandeau lui-même : une seule
   * région d'état par écran (WP-03). Le nœud est retiré au bout de quelques secondes, comme un toast ; le
   * bandeau, lui, reste atteignable au clavier (« Mettre à jour », « Plus tard »). */
  function announceUpdateBanner() {
    if (bannerSaid || !toastRoot) { return; }
    bannerSaid = true;
    var said = el("div", { class: "visually-hidden", text: UPDATE_BANNER_TEXT });
    toastRoot.appendChild(said);
    setTimeout(function () {
      if (said.parentNode) { said.parentNode.removeChild(said); }
    }, 5200);
  }

  UI.showUpdateBanner = function (onUpdate) {
    /* Ajourné pendant la présentation : son bouton est focusable, il vit sur
     * document.body — donc hors du piège de focus — et il se poserait exactement
     * sous les commandes du calque. Il apparaît dès le démontage. */
    if (onboard) { pendingUpdate = onUpdate; return; }
    if (document.querySelector(".update-banner")) { return; }
    bannerUpdate = onUpdate;
    var banner = el("div", { class: "update-banner" }, [
      icon("sync", 17),
      el("span", { style: { flex: "1" }, text: UPDATE_BANNER_TEXT }),
      el("button", {
        class: "btn btn-sm btn-primary", type: "button", text: "Mettre à jour",
        onclick: function () { bannerUpdate = null; bannerSaid = false; banner.remove(); onUpdate(); }
      }),
      el("button", { class: "btn-icon", type: "button", "aria-label": "Plus tard",
        onclick: function () { bannerUpdate = null; bannerSaid = false; banner.remove(); } }, [icon("close", 18)])
    ]);
    document.body.appendChild(banner);
    announceUpdateBanner();
  };

  root.UI = UI;
})(typeof globalThis !== "undefined" ? globalThis : this);
