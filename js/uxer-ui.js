/* BrainstO. — couche UXER : affordance, orientation et mouvement.
 *
 * Cette couche est volontairement progressive : elle ne modifie ni le modèle,
 * ni la synchronisation, ni la pile de navigation. Elle enrichit le DOM après
 * le rendu historique et utilise View Transitions uniquement quand la plateforme
 * les expose. Sans ce fichier, BrainstO reste entièrement fonctionnel.
 */
(function (root) {
  "use strict";

  if (!root.UI || !root.Utils) { return; }

  var UI = root.UI;
  var originalRender = UI.render;
  var lastPlace = null;
  var lastDepth = 0;
  var transitionRunning = false;
  var fallbackTimer = 0;

  function app() { return root.App || null; }
  function store() { return root.Store || null; }

  function currentPlace() {
    var currentApp = app();
    if (!currentApp) { return "boot"; }
    var gate = typeof currentApp.gate === "function" ? currentApp.gate() : null;
    if (gate) { return "gate:" + gate; }
    var route = currentApp.route || {};
    var place = "route:" + (route.name || "topics") + ":" + (route.topicId || "");
    /* Deux explorations d'un même sujet sont deux endroits distincts. */
    return route.name === "branch" ? place + ":" + (route.messageId || "") : place;
  }

  function currentDepth() {
    var currentApp = app();
    if (!currentApp) { return 0; }
    if (typeof currentApp.gate === "function" && currentApp.gate()) { return 0; }
    var name = currentApp.route && currentApp.route.name;
    if (name === "proposals" || name === "conclusion" || name === "branch") { return 2; }
    if (name === "topic" || name === "settings" || name === "meeting" || name === "pandore") { return 1; }
    if (name === "system" || name === "pandoreSynthesis") { return 2; }
    return 0;
  }

  function motionReduced() {
    return !!(root.matchMedia && root.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }

  /* Les quatre onglets sont des pairs à l'écran, même si Sujets reste la racine de la pile (js/app.js, PARENT) : passer
   * de Sujets à Réunion ne « pousse » pas un écran plus profond, cela change de rubrique. Le mouvement suit ce que l'on
   * voit — la barre d'onglets —, pas la profondeur d'historique. */
  var TAB_PLACES = ["route:topics:", "route:meeting:", "route:pandore:", "route:settings:"];

  /* Message source d'une exploration (« route:branch:<sujet>:<message> »), sinon null. */
  function branchSource(place) {
    var match = /^route:branch:([^:]*):(.+)$/.exec(place || "");
    return match ? { topicId: match[1], messageId: match[2] } : null;
  }

  function transitionDirection(previousDepth, nextDepth, previousPlace, nextPlace) {
    if (TAB_PLACES.indexOf(previousPlace) >= 0 && TAB_PLACES.indexOf(nextPlace) >= 0) { return "lateral"; }
    /* Entrer dans l'exploration d'un message, et en revenir : rien ne glisse de côté. Le message source passe de sa
     * place dans le fil à la tête de l'exploration (et retour), le reste s'efface et revient sur place. Le mouvement
     * raconte « cette discussion vient de ce message », pas « on est allé ailleurs ». */
    var into = branchSource(nextPlace);
    if (into && previousPlace === "route:topic:" + into.topicId) { return "branch-in"; }
    var from = branchSource(previousPlace);
    if (from && nextPlace === "route:topic:" + from.topicId) { return "branch-out"; }
    if (nextDepth > previousDepth) { return "forward"; }
    if (nextDepth < previousDepth) { return "back"; }
    if (previousPlace !== nextPlace) { return "lateral"; }
    return "none";
  }

  /* Pose la marque d'élément partagé sur la bulle du message source (une seule à la fois : un nom de View Transition
   * en double annulerait la transition), ou la retire partout. */
  function markShared(source) {
    var marked = document.querySelectorAll(".ux-vt-source");
    for (var i = 0; i < marked.length; i++) { marked[i].classList.remove("ux-vt-source"); }
    if (!source) { return; }
    var bubbles = document.querySelectorAll("#app .bubble[data-message-id]");
    for (var j = 0; j < bubbles.length; j++) {
      if (bubbles[j].getAttribute("data-message-id") === source.messageId) { bubbles[j].classList.add("ux-vt-source"); return; }
    }
  }

  function make(tag, className, text) {
    var node = document.createElement(tag);
    if (className) { node.className = className; }
    if (text != null) { node.textContent = text; }
    return node;
  }

  function topicForRoute() {
    var currentApp = app();
    var currentStore = store();
    if (!currentApp || !currentStore || !currentStore.view || !root.Core || !root.Core.findTopic) { return null; }
    var route = currentApp.route || {};
    if (!route.topicId) { return null; }
    return root.Core.findTopic(currentStore.view, route.topicId);
  }

  function flowStep(label, iconName, href, current, count) {
    var button = make("button", "ux-flow-step" + (current ? " is-current" : ""));
    button.type = "button";
    if (current) {
      button.disabled = true;
      button.setAttribute("aria-current", "page");
      button.setAttribute("aria-label", label + ", étape actuelle");
    } else {
      button.setAttribute("aria-label", "Aller à " + label);
      button.addEventListener("click", function () {
        var currentApp = app();
        if (currentApp && typeof currentApp.go === "function") { currentApp.go(href); }
      });
    }

    button.appendChild(root.Utils.icon(iconName, 16));
    button.appendChild(make("span", "ux-flow-label", label));
    if (count > 0) { button.appendChild(make("span", "ux-flow-count", String(count))); }
    /* Le trait de l'étape courante : un élément à part, pour que View Transitions le fasse glisser d'une étape à
     * l'autre (css/uxer.css). Décoratif, l'étape est déjà annoncée par aria-current. */
    if (current) {
      var mark = make("span", "ux-flow-mark");
      mark.setAttribute("aria-hidden", "true");
      button.appendChild(mark);
    }
    return button;
  }

  function enhanceFlow() {
    var currentApp = app();
    if (!currentApp || !currentApp.route) { return; }
    var route = currentApp.route;
    if (["topic", "proposals", "conclusion"].indexOf(route.name) < 0) { return; }

    var screen = document.querySelector("#app > .screen");
    if (!screen || screen.querySelector(".ux-flow")) { return; }
    var topbar = screen.querySelector(".topbar");
    if (!topbar || !topbar.parentNode) { return; }

    var topic = topicForRoute();
    if (!topic) { return; }

    var nav = make("nav", "ux-flow");
    nav.setAttribute("aria-label", "Parcours du sujet");
    nav.appendChild(flowStep("Discussion", "message", "#/topic/" + topic.id, route.name === "topic", topic.messages.length));
    /* Une proposition en consensus (toute l'équipe a voté la même chose) quitte Propositions pour Consensus. */
    var participants = (store() && store().view && store().view.participants) || [];
    var agreed = topic.proposals.filter(function (p) {
      return root.Core.proposalConsensus ? !!root.Core.proposalConsensus(p, participants) : false;
    }).length;
    nav.appendChild(flowStep("Propositions", "idea", "#/topic/" + topic.id + "/proposals", route.name === "proposals", topic.proposals.length - agreed));
    nav.appendChild(flowStep("Consensus", "checkCircle", "#/topic/" + topic.id + "/conclusion", route.name === "conclusion", agreed));
    topbar.parentNode.insertBefore(nav, topbar.nextSibling);

    /* L'ancienne quickbar ne couvre que deux étapes et uniquement l'écran de
     * discussion. Une seule navigation persistante évite deux grammaires
     * concurrentes pour la même action. */
    var legacy = screen.querySelector(".quickbar");
    if (legacy) {
      legacy.hidden = true;
      legacy.setAttribute("aria-hidden", "true");
    }
  }

  function enhanceTopicCards() {
    var cards = document.querySelectorAll(".topics-grid button.card");
    for (var i = 0; i < cards.length; i++) {
      var card = cards[i];
      if (card.classList.contains("ux-topic-card")) { continue; }
      card.classList.add("ux-topic-card");
      /* Plus de repère « Ouvrir › » : une carte de liste se touche, comme une conversation (épure). */
    }
  }

  function enhanceTopicTitle() {
    var currentApp = app();
    if (!currentApp || !currentApp.route || currentApp.route.name !== "topic") { return; }
    var button = document.querySelector(".topbar-titles > button");
    if (!button || button.classList.contains("ux-topic-title-action")) { return; }
    button.classList.add("ux-topic-title-action");
    /* Pas d'aria-label : il remplaçait le titre visible par « Voir les détails du sujet » et le
     * titre n'était lu nulle part (A11-008). Le nom est le texte visible ; la consigne est la description
     * (aria-describedby posé par js/ui.js, hors du titre). Plus de mention « Détails » : le chevron suffit (épure). */
  }

  /* Le repère « ••• » des bulles est retiré : il invitait à TOUCHER, et au doigt les actions d'un message s'ouvrent
   * désormais par un appui long (js/ui.js, « Gestes sur les bulles »). Un repère qui promet le mauvais geste est
   * pire que pas de repère ; le mode d'emploi est dans la feuille de détails du sujet. */

  function enhanceProposals() {
    var currentApp = app();
    if (!currentApp || !currentApp.route || currentApp.route.name !== "proposals") { return; }
    var cards = document.querySelectorAll("article.card.card-static");
    for (var i = 0; i < cards.length; i++) {
      var card = cards[i];
      card.classList.add("ux-proposal-card");

      var voteActions = card.querySelector(".vote-actions");
      /* Plus de libellé « Votre vote » au-dessus des boutons : Pour / Contre / Abstention se lisent seuls (épure). */
      if (voteActions && voteActions.querySelector('[aria-pressed="true"]')) {
        card.classList.add("ux-has-my-vote");
      }

      var selectWrap = card.querySelector(".select-wrap");
      if (selectWrap && !selectWrap.parentNode.classList.contains("ux-status-control")) {
        var parent = selectWrap.parentNode;
        var statusControl = make("div", "ux-status-control");
        statusControl.appendChild(make("span", "ux-control-label", "Statut"));
        parent.insertBefore(statusControl, selectWrap);
        statusControl.appendChild(selectWrap);
      }
    }
  }

  function enhancePressedState() {
    var pressed = document.querySelectorAll('[aria-pressed="true"]');
    for (var i = 0; i < pressed.length; i++) { pressed[i].classList.add("ux-pressed"); }
  }

  /* ⚠️ Un élément qui a le focus et que l'on DÉPLACE dans le DOM le perd : le focus retombe sur <body>. js/ui.js venait de le
   * rendre (settleFocus, BL-012) ; cette couche range ensuite des nœuds dans de nouveaux conteneurs. Elle rend donc le focus au
   * nœud qu'elle a déplacé, et à lui seul : jamais quand le focus était déjà sur <body> (changement d'écran), jamais par-dessus
   * un autre champ en cours de saisie (REC-RUI-003, REC-RUI-004). */
  function restoreFocus(focused) {
    var now = document.activeElement;
    if (!focused || focused === document.body || focused === document.documentElement || focused === now) { return; }
    if (now && now !== document.body && now !== document.documentElement) { return; }
    if (!document.documentElement.contains(focused)) { return; }
    try { focused.focus({ preventScroll: true }); } catch (error) { /* non focalisable */ }
  }

  function enhance() {
    var currentApp = app();
    if (!currentApp) { return; }
    var focused = document.activeElement;
    document.documentElement.classList.add("uxer-ready");
    enhanceFlow();
    enhanceTopicCards();
    enhanceTopicTitle();
    enhanceProposals();
    enhancePressedState();
    restoreFocus(focused);
  }

  function commitPlace() {
    lastPlace = currentPlace();
    lastDepth = currentDepth();
  }

  function clearFallback(html) {
    if (fallbackTimer) { root.clearTimeout(fallbackTimer); fallbackTimer = 0; }
    html.classList.remove("ux-route-fallback");
    html.removeAttribute("data-ux-direction");
  }

  function renderFallback(args, direction) {
    var html = document.documentElement;
    clearFallback(html);
    html.setAttribute("data-ux-direction", direction);
    html.classList.add("ux-route-fallback");
    var result = originalRender.apply(UI, args);
    enhance();
    commitPlace();
    fallbackTimer = root.setTimeout(function () { clearFallback(html); }, 280);
    return result;
  }

  UI.render = function () {
    var nextPlace = currentPlace();
    var nextDepth = currentDepth();
    var changed = lastPlace !== null && nextPlace !== lastPlace;
    var reduced = motionReduced();
    var direction = changed
      ? transitionDirection(lastDepth, nextDepth, lastPlace, nextPlace)
      : "none";
    var canTransition = changed && !transitionRunning && !reduced &&
      document.startViewTransition && typeof document.startViewTransition === "function";

    if (!canTransition) {
      if (changed && !reduced && !transitionRunning) { return renderFallback(arguments, direction); }
      var result = originalRender.apply(UI, arguments);
      enhance();
      commitPlace();
      return result;
    }

    var args = arguments;
    var html = document.documentElement;
    clearFallback(html);
    html.setAttribute("data-ux-direction", direction);
    html.classList.add("ux-vt");
    transitionRunning = true;
    /* Élément partagé : la bulle du message source, désignée dans l'ancien écran AVANT la capture, puis dans le
     * nouveau juste après le rendu. Sans elle (adresse ouverte directement), la transition reste un fondu. */
    var shared = direction === "branch-in" ? branchSource(nextPlace)
      : direction === "branch-out" ? branchSource(lastPlace) : null;
    markShared(shared);

    try {
      var transition = document.startViewTransition(function () {
        var result = originalRender.apply(UI, args);
        enhance();
        markShared(shared);
        commitPlace();
        return result;
      });

      var cleanup = function () {
        transitionRunning = false;
        markShared(null);
        html.classList.remove("ux-vt");
        html.removeAttribute("data-ux-direction");
      };
      transition.finished.then(cleanup, cleanup);
      return transition;
    } catch (error) {
      transitionRunning = false;
      markShared(null);
      html.classList.remove("ux-vt");
      html.removeAttribute("data-ux-direction");
      return renderFallback(args, direction);
    }
  };

  /* Le script est chargé avant App.start. Ce rappel rend néanmoins la couche
   * robuste à un chargement différé ou à une injection de développement. */
  if (document.readyState !== "loading") { root.setTimeout(enhance, 0); }

  root.UXERUI = { enhance: enhance };
})(typeof globalThis !== "undefined" ? globalThis : this);
