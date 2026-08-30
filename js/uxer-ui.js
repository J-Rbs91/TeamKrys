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

  function app() { return root.App || null; }
  function store() { return root.Store || null; }

  function currentPlace() {
    var currentApp = app();
    if (!currentApp) { return "boot"; }
    var gate = typeof currentApp.gate === "function" ? currentApp.gate() : null;
    if (gate) { return "gate:" + gate; }
    var route = currentApp.route || {};
    return "route:" + (route.name || "topics") + ":" + (route.topicId || "");
  }

  function currentDepth() {
    var currentApp = app();
    if (!currentApp) { return 0; }
    if (typeof currentApp.gate === "function" && currentApp.gate()) { return 0; }
    var name = currentApp.route && currentApp.route.name;
    if (name === "proposals" || name === "conclusion") { return 2; }
    if (name === "topic" || name === "settings" || name === "meeting") { return 1; }
    return 0;
  }

  function motionReduced() {
    return !!(root.matchMedia && root.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }

  function transitionDirection(previousDepth, nextDepth, previousPlace, nextPlace) {
    if (nextDepth > previousDepth) { return "forward"; }
    if (nextDepth < previousDepth) { return "back"; }
    if (previousPlace !== nextPlace) { return "lateral"; }
    return "none";
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
    nav.appendChild(flowStep("Propositions", "idea", "#/topic/" + topic.id + "/proposals", route.name === "proposals", topic.proposals.length));
    nav.appendChild(flowStep("Consensus", "checkCircle", "#/topic/" + topic.id + "/conclusion", route.name === "conclusion", topic.conclusions.length));
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

      var foot = card.querySelector(".card-foot");
      if (!foot) { continue; }
      var icons = foot.querySelectorAll(":scope > .icon");
      if (icons.length) { icons[icons.length - 1].classList.add("ux-legacy-forward"); }

      var cue = make("span", "ux-card-action");
      cue.setAttribute("aria-hidden", "true");
      cue.appendChild(make("span", "", "Ouvrir"));
      cue.appendChild(root.Utils.icon("forward", 15));
      foot.appendChild(cue);
    }
  }

  function enhanceTopicTitle() {
    var currentApp = app();
    if (!currentApp || !currentApp.route || currentApp.route.name !== "topic") { return; }
    var button = document.querySelector(".topbar-titles > button");
    if (!button || button.classList.contains("ux-topic-title-action")) { return; }
    button.classList.add("ux-topic-title-action");
    button.setAttribute("aria-label", "Voir les détails du sujet");

    var sub = button.querySelector(".topbar-sub");
    if (sub) {
      var hint = make("span", "ux-title-hint", "Détails");
      hint.setAttribute("aria-hidden", "true");
      sub.appendChild(hint);
    }
  }

  function enhanceMessageBubbles() {
    var bubbles = document.querySelectorAll(".bubble");
    for (var i = 0; i < bubbles.length; i++) {
      if (bubbles[i].querySelector(".ux-bubble-cue")) { continue; }
      var cue = make("span", "ux-bubble-cue", "•••");
      cue.setAttribute("aria-hidden", "true");
      bubbles[i].appendChild(cue);
    }
  }

  function enhanceProposals() {
    var currentApp = app();
    if (!currentApp || !currentApp.route || currentApp.route.name !== "proposals") { return; }
    var cards = document.querySelectorAll("article.card.card-static");
    for (var i = 0; i < cards.length; i++) {
      var card = cards[i];
      card.classList.add("ux-proposal-card");

      var voteActions = card.querySelector(".vote-actions");
      if (voteActions && !voteActions.previousElementSibling?.classList.contains("ux-vote-label")) {
        voteActions.parentNode.insertBefore(make("div", "ux-vote-label", "Votre vote"), voteActions);
      }
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

  function enhanceConsensus() {
    var currentApp = app();
    if (!currentApp || !currentApp.route || currentApp.route.name !== "conclusion") { return; }

    var cards = document.querySelectorAll("article.card.card-static");
    for (var i = 0; i < cards.length; i++) {
      if (cards[i].querySelector('[aria-pressed="true"]')) { cards[i].classList.add("ux-choice-selected"); }
    }

    var textarea = document.querySelector('textarea[placeholder="Nouveau consensus…"], textarea[placeholder="Nouvelle conclusion…"]');
    if (textarea) {
      var block = textarea.closest ? textarea.closest(".card") : null;
      var button = block ? block.querySelector(".btn-primary") : null;
      if (button && button.textContent.trim() === "Ajouter") { button.textContent = "Ajouter le consensus"; }
    }
  }

  function enhancePressedState() {
    var pressed = document.querySelectorAll('[aria-pressed="true"]');
    for (var i = 0; i < pressed.length; i++) { pressed[i].classList.add("ux-pressed"); }
  }

  function enhance() {
    var currentApp = app();
    if (!currentApp) { return; }
    document.documentElement.classList.add("uxer-ready");
    enhanceFlow();
    enhanceTopicCards();
    enhanceTopicTitle();
    enhanceMessageBubbles();
    enhanceProposals();
    enhanceConsensus();
    enhancePressedState();
  }

  function commitPlace() {
    lastPlace = currentPlace();
    lastDepth = currentDepth();
  }

  UI.render = function () {
    var nextPlace = currentPlace();
    var nextDepth = currentDepth();
    var changed = lastPlace !== null && nextPlace !== lastPlace;
    var canTransition = changed && !transitionRunning && !motionReduced() &&
      document.startViewTransition && typeof document.startViewTransition === "function";

    if (!canTransition) {
      var result = originalRender.apply(UI, arguments);
      enhance();
      commitPlace();
      return result;
    }

    var direction = transitionDirection(lastDepth, nextDepth, lastPlace, nextPlace);
    var args = arguments;
    var html = document.documentElement;
    html.setAttribute("data-ux-direction", direction);
    html.classList.add("ux-vt");
    transitionRunning = true;

    try {
      var transition = document.startViewTransition(function () {
        var result = originalRender.apply(UI, args);
        enhance();
        commitPlace();
        return result;
      });

      var cleanup = function () {
        transitionRunning = false;
        html.classList.remove("ux-vt");
        html.removeAttribute("data-ux-direction");
      };
      transition.finished.then(cleanup, cleanup);
      return transition;
    } catch (error) {
      transitionRunning = false;
      html.classList.remove("ux-vt");
      html.removeAttribute("data-ux-direction");
      var fallback = originalRender.apply(UI, args);
      enhance();
      commitPlace();
      return fallback;
    }
  };

  /* Le script est chargé avant App.start. Ce rappel rend néanmoins la couche
   * robuste à un chargement différé ou à une injection de développement. */
  if (document.readyState !== "loading") { root.setTimeout(enhance, 0); }

  root.UXERUI = { enhance: enhance };
})(typeof globalThis !== "undefined" ? globalThis : this);
