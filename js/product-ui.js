/* BrainstO. — adaptation du rendu à la doctrine produit.
 *
 * Cette couche ne modifie jamais l'état partagé ni les actions envoyées au serveur.
 * Elle enrichit le DOM produit après le rendu historique : maturité sur l'accueil,
 * participation aux votes, statuts de proposition hérités, vocabulaire Consensus et
 * nouveautés locales depuis la dernière consultation.
 */
(function (root) {
  "use strict";

  if (!root.UI || !root.ProductView) { return; }

  var UI = root.UI;
  var ProductView = root.ProductView;
  var originalRender = UI.render;
  var SEEN_KEY = "brainsto.seenTopics.v1";

  function app() { return root.App || null; }
  function store() { return root.Store || null; }
  function text(node, value) { if (node) { node.textContent = value; } }
  function exact(node, before, after) {
    if (node && node.textContent === before) { node.textContent = after; }
  }

  function loadSeen() {
    try {
      var saved = root.Utils && root.Utils.storage
        ? root.Utils.storage.get(SEEN_KEY, null)
        : null;
      if (!saved || typeof saved !== "object" || saved.v !== 1 || !saved.topics || typeof saved.topics !== "object") {
        return null;
      }
      return saved;
    } catch (error) { return null; }
  }

  function saveSeen(record) {
    try {
      if (!root.Utils || !root.Utils.storage) { return false; }
      return root.Utils.storage.set(SEEN_KEY, record) === true;
    } catch (error) { return false; }
  }

  /* Au déploiement de la fonctionnalité, l'état déjà visible devient la baseline,
   * y compris quand l'espace est vide. Ainsi le premier sujet créé plus tard par
   * un collègue est bien détecté comme nouveau, sans transformer le déploiement
   * lui-même en avalanche de fausses nouveautés. */
  function seenRecord(state) {
    var record = loadSeen();
    if (record) { return record; }
    var topics = state && Array.isArray(state.topics) ? state.topics : [];
    record = { v: 1, initialized: true, topics: {} };
    topics.forEach(function (topic) {
      record.topics[topic.id] = ProductView.topicFingerprint(topic);
    });
    saveSeen(record);
    return record;
  }

  function markTopicSeen(topic, state) {
    if (!topic) { return; }
    var record = seenRecord(state);
    record.topics[topic.id] = ProductView.topicFingerprint(topic);
    saveSeen(record);
  }

  function directCards(container) {
    var cards = [];
    if (!container) { return cards; }
    for (var i = 0; i < container.children.length; i++) {
      var child = container.children[i];
      if (child.classList && child.classList.contains("card") && child.tagName === "BUTTON") {
        cards.push(child);
      }
    }
    return cards;
  }

  function groupTitle(label) {
    var node = document.createElement("div");
    node.className = "section-title product-topic-group-title";
    var span = document.createElement("span");
    span.textContent = label;
    node.appendChild(span);
    return node;
  }

  function unreadBadge(label) {
    var badge = document.createElement("span");
    badge.className = "badge tone-info product-unread";
    badge.textContent = label;
    badge.setAttribute("aria-label", "Nouveau : " + label);
    return badge;
  }

  function enhanceTopics(state, route) {
    if (!route || route.name !== "topics") { return; }
    var container = document.querySelector(".topics-grid");
    if (!container || container.querySelector(".product-topic-group")) { return; }

    var currentApp = app();
    var visible = ProductView.visibleTopics(
      state.topics,
      UI.local && UI.local.search,
      UI.local && UI.local.showArchived
    );
    var cards = directCards(container);
    if (!visible.length || cards.length !== visible.length) {
      /* Même une liste vide consultée est un état vu. */
      seenRecord(state);
      return;
    }

    var byId = {};
    for (var i = 0; i < visible.length; i++) { byId[visible[i].id] = cards[i]; }

    var seen = seenRecord(state);
    var seenDirty = false;
    var groups = ProductView.groupTopics(visible);
    var insertionPoint = null;
    for (var j = container.children.length - 1; j >= 0; j--) {
      var candidate = container.children[j];
      if (candidate.tagName === "BUTTON" && candidate.classList.contains("btn-block")) {
        insertionPoint = candidate;
        break;
      }
    }

    ProductView.TOPIC_GROUP_ORDER.forEach(function (status) {
      var topics = groups[status] || [];
      if (!topics.length) { return; }
      var section = document.createElement("section");
      section.className = "stack product-topic-group";
      section.setAttribute("data-topic-status", status);
      section.appendChild(groupTitle(ProductView.TOPIC_GROUP_LABELS[status]));

      topics.forEach(function (topic) {
        var card = byId[topic.id];
        if (!card) { return; }

        /* Un élément créé sur cet appareil vient d'être vu au moment de sa création.
         * ownItems couvre aussi le cas anonyme où createdBy.id est volontairement vide. */
        if (!seen.topics[topic.id] && seen.initialized && currentApp &&
            typeof currentApp.ownsItem === "function" && currentApp.ownsItem(topic.id, topic.createdBy && topic.createdBy.id)) {
          seen.topics[topic.id] = ProductView.topicFingerprint(topic);
          seenDirty = true;
        }

        var activity = ProductView.topicActivity(topic, seen.topics[topic.id], seen.initialized === true);
        if (activity.changed && !card.querySelector(".product-unread")) {
          var counts = card.querySelector(".card-foot .row-wrap");
          if (counts) { counts.insertBefore(unreadBadge(activity.label), counts.firstChild); }
        }
        section.appendChild(card);
      });

      container.insertBefore(section, insertionPoint);
    });

    if (seenDirty) { saveSeen(seen); }
  }

  function participationLabel(participation) {
    if (!participation.total) { return null; }
    return participation.voters + " / " + participation.total + " participant" +
      (participation.total > 1 ? "s" : "") + " " +
      (participation.voters > 1 ? "ont" : "a") + " voté";
  }

  function enhanceProposalStatus(select, proposal) {
    if (!select || !proposal) { return; }
    var options = Array.prototype.slice.call(select.options || []);
    options.forEach(function (option) {
      var status = option.value;
      if (ProductView.isProposalStatusSelectable(status)) { return; }
      if (status === proposal.status) {
        option.textContent = ProductView.PROPOSAL_LEGACY_LABELS[status] || option.textContent;
        option.disabled = true;
        return;
      }
      if (option.parentNode) { option.parentNode.removeChild(option); }
    });
  }

  function enhanceProposals(state, route) {
    if (!route || route.name !== "proposals") { return; }
    var topic = root.Core && root.Core.findTopic ? root.Core.findTopic(state, route.topicId) : null;
    if (!topic) { return; }

    var content = document.querySelector(".screen .content");
    if (!content) { return; }
    var cards = content.querySelectorAll("article.card.card-static");
    if (cards.length !== topic.proposals.length) { return; }

    for (var i = 0; i < cards.length; i++) {
      var card = cards[i];
      var proposal = topic.proposals[i];
      var participation = ProductView.voteParticipation(proposal, state.participants || []);
      var label = participationLabel(participation);
      var legend = card.querySelector(".vote-legend");
      if (legend && label && !legend.querySelector(".product-participation")) {
        var chip = document.createElement("span");
        chip.className = "legend-chip product-participation";
        chip.textContent = label;
        legend.appendChild(chip);
      }

      var voteBar = card.querySelector('.vote-bar[role="img"]');
      if (voteBar) {
        voteBar.setAttribute("aria-label", ProductView.voteAriaLabel(proposal, state.participants || []));
      }

      enhanceProposalStatus(card.querySelector("select"), proposal);

      var statusBadge = card.querySelector(".badge");
      if (statusBadge && ProductView.PROPOSAL_LEGACY_LABELS[proposal.status]) {
        var badgeText = statusBadge.querySelector("span:last-child") || statusBadge;
        text(badgeText, ProductView.PROPOSAL_LEGACY_LABELS[proposal.status]);
      }
    }
  }

  function renameQuickbar() {
    var buttons = document.querySelectorAll(".quickbar button");
    for (var i = 0; i < buttons.length; i++) {
      var spans = buttons[i].querySelectorAll("span");
      for (var j = 0; j < spans.length; j++) { exact(spans[j], "Conclusion", "Consensus"); }
    }
  }

  function renameConsensusScreen(route) {
    if (!route || route.name !== "conclusion") { return; }
    exact(document.querySelector(".topbar-title"), "Conclusion", "Consensus");
    exact(document.querySelector(".empty-title"), "Pas encore de conclusion", "Pas encore de consensus");
    exact(document.querySelector(".empty-text"),
      "Rédigez la synthèse à présenter en réunion. Chacun vote ensuite pour sa préférée.",
      "Formulez le cap que l'équipe souhaite porter en réunion. Chacun choisit ensuite le consensus qu'il préfère.");
    exact(document.querySelector(".empty-next"),
      "Ensuite : la conclusion retenue part dans la synthèse de réunion.",
      "Ensuite : le consensus en tête porte le cap préparé par l'équipe.");

    var titles = document.querySelectorAll(".section-title span");
    for (var i = 0; i < titles.length; i++) { exact(titles[i], "Ajouter une conclusion", "Ajouter un consensus"); }
    var textarea = document.querySelector('textarea[placeholder="Nouvelle conclusion…"]');
    if (textarea) { textarea.placeholder = "Nouveau consensus…"; }

    var notes = document.querySelectorAll(".note span");
    for (var n = 0; n < notes.length; n++) {
      exact(notes[n],
        "Vous avez choisi une conclusion. Choisir une autre déplace votre vote.",
        "Vous avez choisi un consensus. Choisir un autre déplace votre vote.");
      exact(notes[n], "Choix unique : une seule conclusion par personne.", "Choix unique : un seul consensus par personne.");
    }
  }

  function renameConsensusOverlay() {
    var modal = (UI.local || {}).modal;
    if (!modal) { return; }
    if (modal.type === "editConclusion") {
      exact(document.querySelector(".modal-title"), "Modifier la conclusion", "Modifier le consensus");
    }
    if (modal.type === "deleteConclusion") {
      exact(document.querySelector(".modal-title"), "Supprimer la conclusion", "Supprimer le consensus");
      exact(document.querySelector(".modal .hint"),
        "La conclusion et les votes qui la visaient seront supprimés.",
        "Le consensus et les votes qui le visaient seront supprimés.");
    }
  }

  function replaceGeneratedVoteLanguage(value) {
    return String(value || "")
      .replace("Consensus favorable", "Avis exprimés favorables")
      .replace("Majorité favorable", "Avis exprimés plutôt favorables")
      .replace("Majorité défavorable", "Avis exprimés plutôt défavorables")
      .replace("Retenue ·", "Retenue (ancien statut) ·")
      .replace("Mise en place ·", "Mise en place (ancien statut) ·");
  }

  function renameMeeting(route) {
    if (!route || route.name !== "meeting") { return; }
    var headings = document.querySelectorAll("h3.print-h3");
    for (var i = 0; i < headings.length; i++) { exact(headings[i], "Conclusions", "Consensus"); }

    /* Dans la synthèse, ce span est généré par l'application et ne contient pas le
     * texte libre de la proposition, qui vit dans le <strong> voisin. */
    var generated = document.querySelectorAll(".print-list li > span");
    for (var j = 0; j < generated.length; j++) {
      if (generated[j].classList.contains("pre-wrap")) { continue; }
      generated[j].textContent = replaceGeneratedVoteLanguage(generated[j].textContent);
    }
  }

  function renameOnboarding() {
    var rootNode = document.getElementById("onboarding-root");
    if (!rootNode) { return; }
    var map = {
      "La conclusion": "Le consensus",
      "Ce que vous présenterez": "Le cap que vous porterez",
      "Chaque sujet se referme sur une conclusion. Chacun en choisit une seule ; la mieux votée porte la mention En tête.":
        "Après le débat et les votes, l'équipe formule le cap qu'elle veut porter en réunion. Chacun choisit un consensus ; celui qui arrive en tête sert de repère collectif.",
      "Réglages, puis Ouvrir la synthèse : sujets, votes et conclusions, prêts à projeter. Vous pourrez revoir cette présentation depuis les Réglages.":
        "Réglages, puis Ouvrir la synthèse : sujets, votes et consensus, prêts à projeter. Vous pourrez revoir cette présentation depuis les Réglages."
    };
    var walker = document.createTreeWalker(rootNode, NodeFilter.SHOW_TEXT, null);
    var node;
    while ((node = walker.nextNode())) {
      if (Object.prototype.hasOwnProperty.call(map, node.nodeValue)) { node.nodeValue = map[node.nodeValue]; }
    }
  }

  function markCurrentTopic(state, route) {
    if (!route || ["topic", "proposals", "conclusion"].indexOf(route.name) < 0) { return; }
    if (!root.Core || !root.Core.findTopic) { return; }
    var topic = root.Core.findTopic(state, route.topicId);
    if (topic) { markTopicSeen(topic, state); }
  }

  function enhance() {
    var currentApp = app();
    var currentStore = store();
    if (!currentApp || !currentStore || !currentStore.view) { return; }
    if (typeof currentApp.gate === "function" && currentApp.gate()) {
      renameOnboarding();
      return;
    }

    var state = currentStore.view;
    var route = currentApp.route || {};
    markCurrentTopic(state, route);
    enhanceTopics(state, route);
    enhanceProposals(state, route);
    renameQuickbar();
    renameConsensusScreen(route);
    renameConsensusOverlay();
    renameMeeting(route);
    renameOnboarding();
  }

  UI.render = function () {
    var result = originalRender.apply(UI, arguments);
    enhance();
    return result;
  };

  /* L'onboarding vit hors UI.render et mute son propre sous-arbre. */
  var onboardingRoot = document.getElementById("onboarding-root");
  if (onboardingRoot && root.MutationObserver) {
    new MutationObserver(function () { renameOnboarding(); })
      .observe(onboardingRoot, { childList: true, subtree: true, characterData: true });
  }

  root.ProductUI = { enhance: enhance };
})(typeof globalThis !== "undefined" ? globalThis : this);
