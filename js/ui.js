/**
 * Rendu de l'interface — style épuré (inspiration Apple / Tesla).
 *
 * Principes :
 *  - Aucun contenu utilisateur n'est inséré via innerHTML (texte brut only).
 *  - Le rendu complet de la vue est reconstruit quand les données changent,
 *    mais les textes en cours de saisie (attribut data-draft) et l'élément
 *    actif sont préservés : on ne perd jamais un texte rédigé.
 *
 * Parcours :
 *   Accueil (coller l'URL) → nom d'utilisateur → liste des sujets
 *   → écran « débat » d'un sujet → Résumé (Gemini) / Conclusion (Gemini).
 */
const UI = (function () {
  const el = Utils.el;
  let root, barLeft, barTitle, barRight, viewEl, badgeEl, toastEl;

  // État éphémère de l'interface (non persisté).
  const openEditors = new Set(); // clés "kind:id"
  const aiBusy = new Set(); // clés "kind:op" en cours (résumé/conclusion)
  const listState = { search: "", showArchived: false };
  const meetingState = { filter: "all" };
  let lastSignature = null;
  let lastRoute = null;
  let updateAvailable = false;

  // --- Montage --------------------------------------------------------------

  function mount(container) {
    root = container;
    Utils.clear(root);
    root.classList.add("pre-start");

    barLeft = el("div", { class: "bar-left" });
    barTitle = el("h1", { class: "bar-title" });
    barRight = el("div", { class: "bar-right" });

    const header = el("header", { class: "app-bar" }, [barLeft, barTitle, barRight]);

    badgeEl = el("button", {
      class: "sync-badge",
      title: "Synchroniser maintenant",
      "aria-label": "État de synchronisation",
      onclick: function () { Sync.syncNow(); },
    });

    viewEl = el("main", { id: "view", class: "view" });
    toastEl = el("div", { class: "toast-root", "aria-live": "polite" });

    root.appendChild(header);
    root.appendChild(viewEl);
    root.appendChild(toastEl);
  }

  // Quitte le mode « pré-démarrage » (onboarding terminé) : la barre du haut
  // et l'interface principale deviennent visibles.
  function reveal() {
    if (root) root.classList.remove("pre-start");
  }

  // --- Barre supérieure contextuelle ---------------------------------------

  function renderChrome(route) {
    Utils.clear(barLeft);
    Utils.clear(barTitle);
    Utils.clear(barRight);

    const backTo = function (hash, label) {
      return el("button", { class: "icon-btn back-btn", "aria-label": label || "Retour", onclick: function () { App.navigate(hash); } }, [
        el("span", { class: "chev", text: "‹" }),
      ]);
    };

    let title = "Sujets";
    if (route.name === "topic") { barLeft.appendChild(backTo("#/", "Retour aux sujets")); title = topicTitleFor(route.id); }
    else if (route.name === "summary") { barLeft.appendChild(backTo("#/topic/" + route.id, "Retour au débat")); title = "Résumé"; }
    else if (route.name === "conclusion") { barLeft.appendChild(backTo("#/topic/" + route.id, "Retour au débat")); title = "Conclusion"; }
    else if (route.name === "meeting") { barLeft.appendChild(backTo("#/", "Retour")); title = "Réunion"; }
    else if (route.name === "settings") { barLeft.appendChild(backTo("#/", "Retour")); title = "Réglages"; }
    else {
      // Accueil : marque discrète.
      barLeft.appendChild(el("span", { class: "brand", text: "TeamKrys" }));
      title = "";
    }

    if (title) barTitle.appendChild(document.createTextNode(title));

    // À droite : badge de synchro + accès aux réglages (sauf en réglages).
    barRight.appendChild(badgeEl);
    if (route.name !== "settings") {
      barRight.appendChild(el("button", {
        class: "icon-btn", "aria-label": "Réglages", title: "Réglages",
        onclick: function () { App.navigate("#/settings"); },
      }, [el("span", { class: "gear", text: "⚙" })]));
    }
  }

  function topicTitleFor(id) {
    const t = State.findTopic(Sync.getData(), id);
    return t ? t.title : "Sujet";
  }

  // --- Préservation des saisies --------------------------------------------

  function captureDrafts() {
    const map = {};
    let active = null;
    root.querySelectorAll("[data-draft]").forEach(function (node) {
      map[node.getAttribute("data-draft")] = node.value;
      if (node === document.activeElement) {
        active = { key: node.getAttribute("data-draft"), start: node.selectionStart, end: node.selectionEnd };
      }
    });
    return { map: map, active: active };
  }

  function restoreDrafts(snapshot) {
    root.querySelectorAll("[data-draft]").forEach(function (node) {
      const key = node.getAttribute("data-draft");
      if (Object.prototype.hasOwnProperty.call(snapshot.map, key)) {
        const val = snapshot.map[key];
        if (node.value === "" && val) node.value = val;
      }
    });
    if (snapshot.active) {
      const target = root.querySelector('[data-draft="' + cssEscape(snapshot.active.key) + '"]');
      if (target) {
        target.focus();
        try { target.setSelectionRange(snapshot.active.start, snapshot.active.end); } catch (e) { /* champ non textuel */ }
      }
    }
  }

  function cssEscape(s) { return String(s).replace(/["\\]/g, "\\$&"); }

  // --- Rendu principal ------------------------------------------------------

  function renderData(data) {
    const route = App.route;
    const signature = route.name + "|" + route.id + "|" + JSON.stringify(listState) +
      "|" + JSON.stringify(meetingState) + "|" + serialize(openEditors) + "|" + serialize(aiBusy) +
      "|" + updateAvailable + "|" + (data.updatedAt || "") + "|" + (data.revision || 0) + "|" + dataSignature(data, route);

    if (signature === lastSignature && route.name === lastRoute) return;
    lastSignature = signature;
    lastRoute = route.name;

    const snap = captureDrafts();
    Utils.clear(viewEl);
    renderChrome(route);

    let content;
    if (route.name === "topic") content = renderTopic(data, route.id);
    else if (route.name === "summary") content = renderSummary(data, route.id);
    else if (route.name === "conclusion") content = renderConclusion(data, route.id);
    else if (route.name === "meeting") content = renderMeeting(data);
    else if (route.name === "settings") content = renderSettings(data);
    else content = renderHome(data);

    if (content) viewEl.appendChild(content);
    restoreDrafts(snap);
  }

  function serialize(set) { return Array.from(set).sort().join(","); }

  function dataSignature(data, route) {
    if (route.name === "topic" || route.name === "summary" || route.name === "conclusion") {
      const t = State.findTopic(data, route.id);
      return t ? JSON.stringify(t) : "none";
    }
    return data.topics
      .map(function (t) {
        return t.id + t.status + t.updatedAt + t.title + t.messages.length +
          t.proposals.map(function (p) { return p.status + Object.keys(p.votes).length; }).join("");
      })
      .join("|");
  }

  // --- Badge de synchronisation --------------------------------------------

  function renderStatus(status) {
    if (!badgeEl) return;
    badgeEl.className = "sync-badge status-" + status.key;
    Utils.clear(badgeEl);
    badgeEl.appendChild(el("span", { class: "dot" }));
    let text = shortStatus(status);
    if (status.pendingCount > 0) text += " · " + status.pendingCount;
    badgeEl.appendChild(el("span", { class: "sync-text", text: text }));
    updateDiagnostics(status);
  }

  function shortStatus(status) {
    switch (status.key) {
      case "up-to-date": return "À jour";
      case "syncing": return "Sync…";
      case "pending": return "En attente";
      case "offline": return "Hors ligne";
      case "error": return "Erreur";
      case "local": return "Local";
      default: return status.label;
    }
  }

  function setUpdateAvailable(v) { updateAvailable = v; forceRerender(); }

  function forceRerender() {
    lastSignature = null;
    renderData(Sync.getData());
  }

  // ==========================================================================
  //  ONBOARDING — 1) URL du script   2) nom d'utilisateur
  // ==========================================================================

  function showOnboardingUrl(handlers) {
    const urlInput = el("input", {
      class: "input input-lg", type: "url", inputmode: "url", autocomplete: "off",
      placeholder: "https://script.google.com/…/exec",
      "aria-label": "URL du script Google Apps Script",
    });
    const statusLine = el("p", { class: "onb-status" });

    const saveBtn = el("button", { class: "btn btn-primary btn-block btn-lg" }, "Enregistrer et continuer");
    saveBtn.addEventListener("click", function () {
      const url = Utils.clean(urlInput.value);
      if (Utils.isBlank(url) || url.slice(0, 4) !== "http") {
        return markInvalid(urlInput, "Collez l'URL du script (elle commence par https:// et finit par /exec).");
      }
      saveBtn.disabled = true;
      statusLine.className = "onb-status";
      statusLine.textContent = "Connexion en cours…";
      App.setApiUrl(url)
        .then(function () { return Api.getRevision(); })
        .then(function () {
          removeOverlay(overlay);
          if (handlers && handlers.onSaved) handlers.onSaved();
        })
        .catch(function (e) {
          saveBtn.disabled = false;
          statusLine.className = "onb-status err";
          statusLine.textContent = "Échec : " + ((e && e.message) || "vérifiez l'URL et le déploiement.");
        });
    });

    const overlay = el("div", { class: "onboarding" }, [
      el("div", { class: "onb-card" }, [
        el("div", { class: "onb-logo", text: "TeamKrys" }),
        el("h2", { class: "onb-title", text: "Connexion à l'équipe" }),
        el("p", { class: "onb-sub", text: "Collez l'URL du script Google Apps Script de votre équipe pour partager les sujets. Elle se termine par « /exec »." }),
        urlInput,
        statusLine,
        saveBtn,
        el("button", { class: "btn btn-text btn-block", onclick: function () {
          removeOverlay(overlay);
          if (handlers && handlers.onLocal) handlers.onLocal();
        } }, "Continuer sans connexion (mode local)"),
      ]),
    ]);
    document.body.appendChild(overlay);
    setTimeout(function () { urlInput.focus(); }, 40);
    urlInput.addEventListener("keydown", function (e) { if (e.key === "Enter") saveBtn.click(); });
  }

  function showOnboardingName(onDone) {
    const input = el("input", {
      class: "input input-lg", type: "text", maxlength: Utils.LIMITS.name,
      placeholder: "Votre prénom", "aria-label": "Votre prénom",
    });
    const confirm = el("button", { class: "btn btn-primary btn-block btn-lg" }, "Commencer");
    confirm.addEventListener("click", function () {
      const name = Utils.clean(input.value);
      if (Utils.isBlank(name)) return markInvalid(input, "Merci d'indiquer un prénom.");
      removeOverlay(overlay);
      onDone(name);
    });
    const overlay = el("div", { class: "onboarding" }, [
      el("div", { class: "onb-card" }, [
        el("div", { class: "onb-logo", text: "TeamKrys" }),
        el("h2", { class: "onb-title", text: "Bienvenue" }),
        el("p", { class: "onb-sub", text: "Quel nom souhaitez-vous utiliser dans l'application ?" }),
        input,
        confirm,
      ]),
    ]);
    document.body.appendChild(overlay);
    setTimeout(function () { input.focus(); }, 40);
    input.addEventListener("keydown", function (e) { if (e.key === "Enter") confirm.click(); });
  }

  function removeOverlay(node) { if (node && node.parentNode) node.parentNode.removeChild(node); }

  // ==========================================================================
  //  VUE : Accueil / liste des sujets
  // ==========================================================================

  function renderHome(data) {
    const wrap = el("section", { class: "page home" });

    if (updateAvailable) wrap.appendChild(updateBanner());
    if (!CONFIG.isConfigured()) wrap.appendChild(connectBanner());

    const visible = data.topics.filter(function (t) {
      return listState.showArchived ? true : t.status !== "archived";
    });

    // Aucun sujet : bouton d'ajout centré au milieu de l'écran.
    if (data.topics.length === 0) {
      wrap.appendChild(el("div", { class: "empty-hero" }, [
        el("h2", { class: "hero-title", text: "Aucun sujet" }),
        el("p", { class: "hero-sub", text: "Créez le premier sujet à préparer avec l'équipe." }),
        el("button", { class: "btn btn-primary btn-lg", onclick: showNewTopic }, [plusGlyph(), " Ajouter un sujet"]),
      ]));
      return wrap;
    }

    // Recherche discrète lorsqu'il y a beaucoup de sujets.
    if (data.topics.length > 6) {
      wrap.appendChild(el("input", {
        type: "search", class: "input search-field", placeholder: "Rechercher un sujet…",
        "aria-label": "Rechercher un sujet", value: listState.search, "data-draft": "home-search",
        oninput: function (e) { listState.search = e.target.value; forceRerender(); },
      }));
    }

    let topics = visible.slice();
    const q = Utils.clean(listState.search).toLowerCase();
    if (q) {
      topics = topics.filter(function (t) {
        return (t.title || "").toLowerCase().indexOf(q) !== -1 || (t.description || "").toLowerCase().indexOf(q) !== -1;
      });
    }
    topics.sort(function (a, b) { return (b.updatedAt || "").localeCompare(a.updatedAt || ""); });

    if (topics.length === 0) {
      wrap.appendChild(emptyState("Aucun sujet ne correspond."));
    } else {
      const list = el("div", { class: "topic-list" });
      topics.forEach(function (t) { list.appendChild(topicCard(t)); });
      wrap.appendChild(list);
    }

    const archivedCount = data.topics.filter(function (t) { return t.status === "archived"; }).length;
    if (archivedCount > 0) {
      wrap.appendChild(el("button", { class: "btn btn-text btn-block", onclick: function () {
        listState.showArchived = !listState.showArchived; forceRerender();
      } }, listState.showArchived ? "Masquer les archivés" : (archivedCount + " sujet(s) archivé(s)")));
    }

    // Bouton rond « + » en bas à droite.
    wrap.appendChild(el("button", { class: "fab", "aria-label": "Ajouter un sujet", onclick: showNewTopic }, [plusGlyph()]));
    return wrap;
  }

  function topicCard(t) {
    const nbVoting = t.proposals.filter(function (p) { return p.status === "voting"; }).length;
    return el("button", {
      class: "card topic-card",
      onclick: function () { App.navigate("#/topic/" + t.id); },
    }, [
      el("div", { class: "card-top" }, [
        el("h2", { class: "card-title", text: t.title }),
        topicBadge(t.status),
      ]),
      t.description ? el("p", { class: "card-desc", text: shorten(t.description, 140) }) : null,
      el("div", { class: "card-meta" }, [
        metaItem(t.messages.length + " message" + plural(t.messages.length)),
        metaItem(t.proposals.length + " proposition" + plural(t.proposals.length)),
        nbVoting ? metaItem(nbVoting + " en vote") : null,
        el("span", { class: "meta-author", text: t.createdBy.name }),
      ]),
    ]);
  }

  // ==========================================================================
  //  VUE : Débat (détail d'un sujet)
  // ==========================================================================

  function renderTopic(data, topicId) {
    const t = State.ensureTopicShape(State.findTopic(data, topicId));
    if (!t) {
      return el("section", { class: "page" }, [
        el("p", { class: "empty", text: "Sujet introuvable." }),
        el("button", { class: "btn", onclick: function () { App.navigate("#/"); } }, "← Retour"),
      ]);
    }

    const wrap = el("section", { class: "page topic-detail" });

    // En-tête : description + méta + édition.
    wrap.appendChild(renderTopicHeader(t));

    // Accès Résumé / Conclusion (Gemini).
    wrap.appendChild(el("div", { class: "gemini-nav" }, [
      geminiNavBtn("Résumé", "Points de vue des collaborateurs", "#/topic/" + t.id + "/summary"),
      geminiNavBtn("Conclusion", "Propositions regroupées & vote", "#/topic/" + t.id + "/conclusion"),
    ]));

    // Discussion.
    wrap.appendChild(sectionTitle("Discussion"));
    wrap.appendChild(renderMessages(t));

    // Propositions & votes (matière première des conclusions).
    wrap.appendChild(sectionTitle("Propositions"));
    wrap.appendChild(renderProposals(t));

    return wrap;
  }

  function geminiNavBtn(title, sub, hash) {
    return el("button", { class: "gemini-btn", onclick: function () { App.navigate(hash); } }, [
      el("span", { class: "gemini-spark", text: "✦" }),
      el("span", { class: "gemini-texts" }, [
        el("span", { class: "gemini-title", text: title }),
        el("span", { class: "gemini-sub", text: sub }),
      ]),
      el("span", { class: "chev", text: "›" }),
    ]);
  }

  function renderTopicHeader(t) {
    const key = "topic:" + t.id;
    if (openEditors.has(key)) {
      const titleInput = el("input", { class: "input", type: "text", maxlength: Utils.LIMITS.topicTitle, value: t.title, "data-draft": "edit-topic-title-" + t.id });
      const descInput = el("textarea", { class: "textarea", rows: 4, maxlength: Utils.LIMITS.topicDescription, "data-draft": "edit-topic-desc-" + t.id });
      descInput.value = t.description || "";
      return el("div", { class: "card" }, [
        field("Titre", titleInput),
        field("Description", descInput),
        el("div", { class: "row-actions" }, [
          el("button", { class: "btn btn-primary", onclick: function () {
            const title = Utils.clean(titleInput.value);
            if (Utils.isBlank(title)) return markInvalid(titleInput, "Le titre est obligatoire.");
            App.actions.updateTopic(t.id, title, Utils.clean(descInput.value));
            openEditors.delete(key); forceRerender();
          } }, "Enregistrer"),
          el("button", { class: "btn btn-ghost", onclick: function () { openEditors.delete(key); forceRerender(); } }, "Annuler"),
        ]),
      ]);
    }
    return el("div", { class: "card topic-head-card" }, [
      t.description
        ? el("p", { class: "topic-desc pre", text: t.description })
        : el("p", { class: "muted", text: "Aucune description." }),
      el("div", { class: "topic-head-foot" }, [
        el("span", { class: "byline", text: "Créé par " + t.createdBy.name + " · " + Utils.formatDate(t.createdAt) }),
        topicBadge(t.status),
      ]),
      el("div", { class: "row-actions" }, [
        el("button", { class: "btn btn-ghost btn-sm", onclick: function () { openEditors.add(key); forceRerender(); } }, "Modifier"),
        statusMenuBtn(t),
      ]),
    ]);
  }

  function statusMenuBtn(t) {
    const options = [
      { s: "open", label: "Rouvrir" },
      { s: "ready", label: "Prêt pour la réunion" },
      { s: "closed", label: "Marquer traité" },
      { s: "archived", label: "Archiver" },
    ];
    const sel = el("select", { class: "select select-sm", "aria-label": "Changer le statut", onchange: function (e) {
      if (e.target.value) { App.actions.changeTopicStatus(t.id, e.target.value); }
    } });
    sel.appendChild(el("option", { value: "", text: "Changer le statut…" }));
    options.forEach(function (o) { if (t.status !== o.s) sel.appendChild(el("option", { value: o.s, text: o.label })); });
    return sel;
  }

  // --- Messages -------------------------------------------------------------

  function renderMessages(t) {
    const box = el("div", { class: "messages" });
    if (t.messages.length === 0) {
      box.appendChild(el("p", { class: "muted", text: "Aucun message pour le moment." }));
    }
    t.messages
      .slice()
      .sort(function (a, b) { return (a.createdAt || "").localeCompare(b.createdAt || ""); })
      .forEach(function (m) { box.appendChild(messageItem(t, m)); });
    box.appendChild(newMessageForm(t));
    return box;
  }

  function messageItem(t, m) {
    const key = "msg:" + m.id;
    const isMine = m.authorId === App.profile.id;
    if (openEditors.has(key) && isMine) {
      const ta = el("textarea", { class: "textarea", rows: 3, maxlength: Utils.LIMITS.message, "aria-label": "Modifier le message", "data-draft": "edit-msg-" + m.id });
      ta.value = m.text;
      return el("div", { class: "message editing" }, [
        ta,
        el("div", { class: "row-actions" }, [
          el("button", { class: "btn btn-sm btn-primary", onclick: function () {
            const text = Utils.clean(ta.value);
            if (Utils.isBlank(text)) return markInvalid(ta, "Le message est vide.");
            App.actions.updateMessage(t.id, m.id, text);
            openEditors.delete(key); forceRerender();
          } }, "Enregistrer"),
          el("button", { class: "btn btn-sm btn-ghost", onclick: function () { openEditors.delete(key); forceRerender(); } }, "Annuler"),
        ]),
      ]);
    }
    return el("div", { class: "message" + (isMine ? " mine" : "") }, [
      el("div", { class: "message-head" }, [
        el("span", { class: "author", text: m.authorName }),
        el("span", { class: "date", text: Utils.formatDate(m.createdAt) + (m.updatedAt ? " · modifié" : "") }),
      ]),
      el("div", { class: "message-body pre", text: m.text }),
      el("div", { class: "message-actions" }, [
        el("button", { class: "link-btn", onclick: function () { showNewProposal(t.id, m.text); } }, "Créer une proposition"),
        isMine ? el("button", { class: "link-btn", onclick: function () { openEditors.add(key); forceRerender(); } }, "Modifier") : null,
      ]),
    ]);
  }

  function newMessageForm(t) {
    const ta = el("textarea", { class: "textarea", rows: 2, placeholder: "Écrire un message…", "aria-label": "Nouveau message", maxlength: Utils.LIMITS.message, "data-draft": "new-msg-" + t.id });
    return el("div", { class: "new-message" }, [
      ta,
      el("button", { class: "btn btn-primary", onclick: function () {
        const text = Utils.clean(ta.value);
        if (Utils.isBlank(text)) return markInvalid(ta, "Le message est vide.");
        // Vide le champ AVANT le dispatch : le dispatch déclenche un rendu
        // synchrone, et la préservation des brouillons ne doit pas restaurer
        // le message déjà publié dans le composeur.
        ta.value = "";
        App.actions.createMessage(t.id, text);
        forceRerender();
      } }, "Publier"),
    ]);
  }

  // --- Propositions & votes -------------------------------------------------

  function renderProposals(t) {
    const box = el("div", { class: "proposals" });
    box.appendChild(el("button", { class: "btn btn-outline", onclick: function () { showNewProposal(t.id, ""); } }, [plusGlyph(), " Nouvelle proposition"]));
    if (t.proposals.length === 0) box.appendChild(el("p", { class: "muted", text: "Aucune proposition." }));
    t.proposals.forEach(function (p) { box.appendChild(proposalCard(t, p)); });
    return box;
  }

  function proposalCard(t, p) {
    const key = "prop:" + p.id;
    const card = el("div", { class: "card proposal" });
    if (openEditors.has(key)) {
      const titleInput = el("input", { class: "input", type: "text", value: p.title, maxlength: Utils.LIMITS.proposalTitle, "data-draft": "edit-prop-title-" + p.id });
      const descInput = el("textarea", { class: "textarea", rows: 3, maxlength: Utils.LIMITS.proposalDescription, "data-draft": "edit-prop-desc-" + p.id });
      descInput.value = p.description || "";
      field("Titre", titleInput).forEach(function (n) { card.appendChild(n); });
      field("Description", descInput).forEach(function (n) { card.appendChild(n); });
      card.appendChild(el("div", { class: "row-actions" }, [
        el("button", { class: "btn btn-sm btn-primary", onclick: function () {
          const title = Utils.clean(titleInput.value);
          if (Utils.isBlank(title)) return markInvalid(titleInput, "Le titre est obligatoire.");
          App.actions.updateProposal(t.id, p.id, title, Utils.clean(descInput.value));
          openEditors.delete(key); forceRerender();
        } }, "Enregistrer"),
        el("button", { class: "btn btn-sm btn-ghost", onclick: function () { openEditors.delete(key); forceRerender(); } }, "Annuler"),
      ]));
      return card;
    }

    card.appendChild(el("div", { class: "card-top" }, [
      el("h3", { class: "proposal-title", text: p.title }),
      proposalBadge(p.status),
    ]));
    if (p.description) card.appendChild(el("p", { class: "proposal-desc pre", text: p.description }));
    card.appendChild(el("p", { class: "byline", text: "Proposé par " + p.authorName + " · " + Utils.formatDate(p.createdAt) }));
    card.appendChild(voteBlock(t, p));
    card.appendChild(el("div", { class: "proposal-footer" }, [
      el("label", { class: "field-label inline", text: "Statut :" }),
      proposalStatusSelect(t, p),
      el("button", { class: "btn btn-ghost btn-sm", onclick: function () { openEditors.add(key); forceRerender(); } }, "Modifier"),
    ]));
    return card;
  }

  function voteBlock(t, p) {
    const s = State.tally(p);
    const myVote = p.votes[App.profile.id] || null;
    const bar = el("div", { class: "vote-bar" }, [
      s.total ? el("span", { class: "seg seg-for", style: "flex:" + s.for }) : null,
      s.total ? el("span", { class: "seg seg-against", style: "flex:" + s.against }) : null,
      s.total ? el("span", { class: "seg seg-abstain", style: "flex:" + s.abstain }) : null,
    ]);
    const buttons = el("div", { class: "vote-buttons" }, [
      voteBtn("Pour", "for", myVote, t, p),
      voteBtn("Contre", "against", myVote, t, p),
      voteBtn("Abstention", "abstain", myVote, t, p),
      myVote ? el("button", { class: "btn btn-sm btn-ghost", onclick: function () { App.actions.removeVote(t.id, p.id); } }, "Retirer") : null,
    ]);
    return el("div", { class: "vote-block" }, [
      bar,
      el("div", { class: "vote-stats" }, [
        el("span", { class: "v-for", text: "Pour " + s.for }),
        el("span", { class: "v-against", text: "Contre " + s.against }),
        el("span", { class: "v-abstain", text: "Abst. " + s.abstain }),
        el("span", { class: "v-pct", text: s.expressed ? s.favorablePct + "% favorables" : "" }),
      ]),
      el("div", { class: "vote-indicator ind-" + s.indicator.key, text: s.indicator.label }),
      buttons,
    ]);
  }

  function voteBtn(label, value, myVote, t, p) {
    return el("button", {
      class: "btn btn-sm vote-btn" + (myVote === value ? " active vote-" + value : ""),
      onclick: function () {
        if (myVote === value) App.actions.removeVote(t.id, p.id);
        else App.actions.setVote(t.id, p.id, value);
      },
    }, label);
  }

  function proposalStatusSelect(t, p) {
    const sel = el("select", { class: "select select-sm", "aria-label": "Statut de la proposition", onchange: function (e) { App.actions.changeProposalStatus(t.id, p.id, e.target.value); } });
    Utils.PROPOSAL_STATUSES.forEach(function (st) { sel.appendChild(option(st, State.PROPOSAL_STATUS_LABELS[st], p.status)); });
    return sel;
  }

  // ==========================================================================
  //  VUE : Résumé (Gemini) — point de vue de chaque collaborateur
  // ==========================================================================

  function renderSummary(data, topicId) {
    const t = State.ensureTopicShape(State.findTopic(data, topicId));
    if (!t) return notFound();
    const wrap = el("section", { class: "page ai-page" });

    wrap.appendChild(el("p", { class: "ai-topic-name", text: t.title }));
    wrap.appendChild(el("p", { class: "ai-lead", text: "Gemini résume, dans votre feuille Google Sheet, le point de vue de chaque collaborateur à partir de ses messages." }));

    wrap.appendChild(aiControls(t, "summary"));

    const summaries = t.summaries || [];
    if (summaries.length === 0) {
      wrap.appendChild(emptyState(t.ai.summary.status === "pending"
        ? "Gemini travaille. Cliquez « Rafraîchir » dans quelques instants."
        : "Aucun résumé pour l'instant. Cliquez « Générer avec Gemini »."));
    } else {
      const list = el("div", { class: "summary-list" });
      summaries.forEach(function (sm) {
        list.appendChild(el("div", { class: "card summary-card" }, [
          el("div", { class: "summary-head" }, [
            el("span", { class: "avatar", text: initial(sm.name) }),
            el("span", { class: "summary-name", text: sm.name }),
          ]),
          el("p", { class: "summary-text pre", text: sm.text }),
        ]));
      });
      wrap.appendChild(list);
    }
    return wrap;
  }

  // ==========================================================================
  //  VUE : Conclusion (Gemini) — regroupement + vote + ajout manuel
  // ==========================================================================

  function renderConclusion(data, topicId) {
    const t = State.ensureTopicShape(State.findTopic(data, topicId));
    if (!t) return notFound();
    const wrap = el("section", { class: "page ai-page" });

    wrap.appendChild(el("p", { class: "ai-topic-name", text: t.title }));
    wrap.appendChild(el("p", { class: "ai-lead", text: "Gemini regroupe et reformule les propositions du débat en conclusions. Votez pour celle que vous préférez, ou ajoutez la vôtre." }));

    wrap.appendChild(aiControls(t, "conclusion"));

    wrap.appendChild(el("button", { class: "btn btn-outline btn-block", onclick: function () { showAddConclusion(t.id); } }, [plusGlyph(), " Ajouter une conclusion"]));

    const list = t.conclusions || [];
    const leading = State.leadingConclusion(t);
    const myVote = t.conclusionVotes[App.profile.id] || null;

    if (list.length === 0) {
      wrap.appendChild(emptyState(t.ai.conclusion.status === "pending"
        ? "Gemini travaille. Cliquez « Rafraîchir » dans quelques instants."
        : "Aucune conclusion pour l'instant."));
    } else {
      const box = el("div", { class: "conclusion-list" });
      list.forEach(function (c) { box.appendChild(conclusionCard(t, c, myVote, leading)); });
      wrap.appendChild(box);
    }
    return wrap;
  }

  function conclusionCard(t, c, myVote, leading) {
    const key = "concl:" + c.id;
    const tally = State.conclusionTally(t, c.id);
    const mine = myVote === c.id;
    const isAi = c.source === "ai";
    const canEdit = !isAi && c.authorId === App.profile.id;

    if (openEditors.has(key) && canEdit) {
      const ta = el("textarea", { class: "textarea", rows: 3, maxlength: Utils.LIMITS.conclusion, "data-draft": "edit-concl-" + c.id });
      ta.value = c.text;
      return el("div", { class: "card conclusion-card" }, [
        ta,
        el("div", { class: "row-actions" }, [
          el("button", { class: "btn btn-sm btn-primary", onclick: function () {
            const text = Utils.clean(ta.value);
            if (Utils.isBlank(text)) return markInvalid(ta, "La conclusion est vide.");
            App.actions.updateConclusionItem(t.id, c.id, text);
            openEditors.delete(key); forceRerender();
          } }, "Enregistrer"),
          el("button", { class: "btn btn-sm btn-ghost", onclick: function () { openEditors.delete(key); forceRerender(); } }, "Annuler"),
        ]),
      ]);
    }

    return el("div", { class: "card conclusion-card" + (mine ? " chosen" : "") }, [
      el("div", { class: "conclusion-top" }, [
        el("span", { class: "src-badge " + (isAi ? "src-ai" : "src-manual"), text: isAi ? "✦ Gemini" : (c.authorName || "Manuel") }),
        leading && leading.id === c.id && tally.count > 0 ? el("span", { class: "lead-badge", text: "En tête" }) : null,
      ]),
      el("p", { class: "conclusion-text pre", text: c.text }),
      el("div", { class: "conclusion-foot" }, [
        el("button", { class: "btn btn-sm vote-choice" + (mine ? " active" : ""), onclick: function () {
          if (mine) App.actions.removeConclusionVote(t.id);
          else App.actions.setConclusionVote(t.id, c.id);
        } }, mine ? "✓ Votre choix" : "Voter"),
        el("span", { class: "vote-count", text: tally.count + " voix" + (tally.total ? " · " + tally.pct + "%" : "") }),
        canEdit ? el("button", { class: "link-btn", onclick: function () { openEditors.add(key); forceRerender(); } }, "Modifier") : null,
        canEdit ? el("button", { class: "link-btn danger", onclick: function () { App.actions.deleteConclusion(t.id, c.id); forceRerender(); } }, "Supprimer") : null,
      ]),
    ]);
  }

  // --- Contrôles IA communs (Générer / Rafraîchir + statut) -----------------

  function aiControls(t, kind) {
    const aiState = t.ai[kind] || { status: "idle" };
    const genKey = kind + ":generate";
    const refKey = kind + ":refresh";
    const busyGen = aiBusy.has(genKey);
    const busyRef = aiBusy.has(refKey);
    const configured = CONFIG.isConfigured();

    const genBtn = el("button", {
      class: "btn btn-primary", disabled: (busyGen || !configured) ? true : false,
      onclick: function () { runAi(t.id, kind, "generate"); },
    }, busyGen ? "Envoi…" : "Générer avec Gemini");

    const refBtn = el("button", {
      class: "btn", disabled: (busyRef || !configured) ? true : false,
      onclick: function () { runAi(t.id, kind, "refresh"); },
    }, busyRef ? "Lecture…" : "↻ Rafraîchir");

    const rows = [el("div", { class: "row-actions ai-actions" }, [genBtn, refBtn])];

    if (!configured) {
      rows.push(el("p", { class: "ai-status warn", text: "Connectez l'application à l'équipe (Réglages) pour utiliser Gemini." }));
    } else {
      rows.push(el("div", { class: "ai-status ai-" + aiState.status }, [
        el("span", { class: "ai-dot" }),
        el("span", { text: aiStatusText(aiState) }),
      ]));
    }
    return el("div", { class: "card ai-controls" }, rows);
  }

  function aiStatusText(aiState) {
    const base = State.AI_STATUS_LABELS[aiState.status] || aiState.status;
    if (aiState.status === "pending") return base + " Cliquez « Rafraîchir » pour relire.";
    if ((aiState.status === "ready" || aiState.status === "partial") && aiState.updatedAt) {
      return base + " · " + Utils.formatTime(aiState.updatedAt) + (aiState.message ? " — " + aiState.message : "");
    }
    return aiState.message ? base + " — " + aiState.message : base;
  }

  function runAi(topicId, kind, op) {
    const k = kind + ":" + op;
    if (aiBusy.has(k)) return;
    aiBusy.add(k);
    forceRerender();
    const call = op === "generate" ? App.ai.generate(topicId, kind) : App.ai.refresh(topicId, kind);
    call.then(function (res) {
      aiBusy.delete(k);
      if (!res || !res.ok) {
        const msg = (res && res.error) === "not-configured"
          ? "Connectez l'application à l'équipe pour utiliser Gemini."
          : "Gemini : " + ((res && res.error) || "échec.");
        toast(msg, "error");
      } else if (op === "generate") {
        toast("Demande envoyée à Gemini. Rafraîchissez dans quelques instants.", "ok");
      } else {
        const ai = res.ai || {};
        if (ai.status === "pending") toast("Gemini n'a pas encore fini. Réessayez le rafraîchissement.", "info");
        else toast("Résultats mis à jour.", "ok");
      }
      forceRerender();
    });
  }

  // ==========================================================================
  //  VUE : Synthèse de réunion (conservée, accessible depuis les Réglages)
  // ==========================================================================

  function renderMeeting(data) {
    const wrap = el("section", { class: "page meeting" });
    wrap.appendChild(el("div", { class: "page-head" }, [
      el("h2", { text: "Préparation de la réunion" }),
      el("button", { class: "btn btn-primary no-print", onclick: function () { window.print(); } }, "Imprimer"),
    ]));

    const filters = [["all", "Tout"], ["open", "Ouverts"], ["ready", "Prêts"], ["closed", "Clôturés"]];
    const fbar = el("div", { class: "controls no-print" });
    filters.forEach(function (f) {
      fbar.appendChild(el("button", { class: "chip" + (meetingState.filter === f[0] ? " active" : ""), onclick: function () { meetingState.filter = f[0]; forceRerender(); } }, f[1]));
    });
    wrap.appendChild(fbar);

    let topics = data.topics.filter(function (t) { return t.status !== "archived"; });
    const f = meetingState.filter;
    if (f === "open" || f === "ready" || f === "closed") topics = topics.filter(function (t) { return t.status === f; });
    topics.sort(function (a, b) { return (b.updatedAt || "").localeCompare(a.updatedAt || ""); });

    if (topics.length === 0) { wrap.appendChild(emptyState("Aucun sujet à synthétiser.")); return wrap; }
    topics.forEach(function (t) { wrap.appendChild(meetingBlock(State.ensureTopicShape(t))); });
    return wrap;
  }

  function meetingBlock(t) {
    const selected = t.proposals.filter(function (p) { return p.status === "selected"; });
    const debate = t.proposals.filter(function (p) { return p.status === "debate"; });
    const block = el("article", { class: "card meeting-block" });
    block.appendChild(el("div", { class: "card-top" }, [el("h3", { class: "card-title", text: t.title }), topicBadge(t.status)]));
    if (t.description) block.appendChild(el("p", { class: "card-desc", text: shorten(t.description, 220) }));

    const leading = State.leadingConclusion(t);
    block.appendChild(el("h4", { class: "mini-title", text: "Conclusion" }));
    if (leading) {
      const tally = State.conclusionTally(t, leading.id);
      block.appendChild(el("p", { class: "pre", text: leading.text }));
      block.appendChild(el("p", { class: "byline", text: (leading.source === "ai" ? "Gemini" : leading.authorName) + " · " + tally.count + " voix" }));
    } else if (t.conclusion) {
      block.appendChild(el("p", { class: "pre", text: t.conclusion }));
    } else {
      block.appendChild(el("p", { class: "muted", text: "— (à rédiger)" }));
    }

    block.appendChild(proposalSummary("Solutions retenues", selected));
    block.appendChild(proposalSummary("À débattre en réunion", debate));
    return block;
  }

  function proposalSummary(title, list) {
    if (!list.length) return el("span");
    const box = el("div", { class: "prop-summary" }, [el("h4", { class: "mini-title", text: title })]);
    list.forEach(function (p) {
      const s = State.tally(p);
      box.appendChild(el("div", { class: "prop-line" }, [
        el("span", { class: "prop-line-title", text: p.title }),
        el("span", { class: "prop-line-votes", text: "Pour " + s.for + " · Contre " + s.against + (s.expressed ? " · " + s.favorablePct + "%" : "") }),
      ]));
    });
    return box;
  }

  // ==========================================================================
  //  VUE : Réglages & diagnostic
  // ==========================================================================

  function renderSettings(data) {
    const wrap = el("section", { class: "page settings" });
    if (updateAvailable) wrap.appendChild(updateBanner());

    wrap.appendChild(renderApiSettings());

    const nameInput = el("input", { class: "input", type: "text", maxlength: Utils.LIMITS.name, value: App.profile.name, "data-draft": "settings-name" });
    wrap.appendChild(el("div", { class: "card" }, [
      el("h2", { text: "Votre identité" }),
      field("Nom d'utilisateur", nameInput),
      el("div", { class: "row-actions" }, [
        el("button", { class: "btn btn-primary", onclick: function () {
          const name = Utils.clean(nameInput.value);
          if (Utils.isBlank(name)) return markInvalid(nameInput, "Le nom est obligatoire.");
          App.updateProfileName(name); toast("Nom mis à jour.", "ok");
        } }, "Enregistrer"),
      ]),
    ]));

    wrap.appendChild(el("div", { class: "card" }, [
      el("h2", { text: "Réunion" }),
      el("p", { class: "muted small", text: "Synthèse imprimable de tous les sujets." }),
      el("button", { class: "btn btn-outline", onclick: function () { App.navigate("#/meeting"); } }, "Ouvrir la préparation de réunion"),
    ]));

    const status = Sync.getStatus();
    wrap.appendChild(el("div", { class: "card" }, [
      el("h2", { text: "Synchronisation" }),
      el("div", { class: "row-actions" }, [el("button", { class: "btn btn-primary", onclick: function () { Sync.syncNow(); } }, "Synchroniser maintenant")]),
      diagnosticsBlock(status),
    ]));

    wrap.appendChild(el("div", { class: "card" }, [
      el("h2", { text: "À propos" }),
      el("p", { text: "TeamKrys — préparation de réunion, avec résumés et conclusions générés par Gemini dans Google Sheets." }),
      el("p", { class: "muted small", text: "Version " + APP_VERSION }),
    ]));
    return wrap;
  }

  function renderApiSettings() {
    const urlInput = el("input", {
      class: "input", type: "url", inputmode: "url", autocomplete: "off",
      placeholder: "https://script.google.com/…/exec", "aria-label": "URL du script Google Apps Script",
      value: CONFIG.API_URL || "", "data-draft": "api-url",
    });
    const st = Sync.getStatus();
    let cls = "conn-status", txt;
    if (!CONFIG.isConfigured()) txt = "Non connecté (mode local).";
    else if (st.key === "up-to-date") { cls += " conn-ok"; txt = "Connecté ✓ — synchronisé."; }
    else if (st.key === "syncing" || st.key === "pending") { cls += " conn-ok"; txt = "Connecté — synchronisation…"; }
    else if (st.key === "error") { cls += " conn-err"; txt = "Erreur de connexion — vérifiez l'URL et le déploiement."; }
    else if (st.key === "offline") txt = "URL enregistrée — hors connexion.";
    else txt = "URL enregistrée.";
    const statusLine = el("p", { class: cls, text: txt });

    function save() {
      const url = Utils.clean(urlInput.value);
      if (Utils.isBlank(url) || url.slice(0, 4) !== "http") return markInvalid(urlInput, "Collez l'URL du script (https:// … /exec).");
      statusLine.className = "conn-status";
      statusLine.textContent = "Connexion en cours…";
      App.setApiUrl(url)
        .then(function () { return Api.getRevision(); })
        .then(function (info) { toast("Connecté ✓ (révision " + (info && info.revision != null ? info.revision : "?") + ").", "ok"); })
        .catch(function (e) { toast("Échec : " + ((e && e.message) || "vérifiez l'URL."), "error"); })
        .then(function () { forceRerender(); });
    }

    return el("div", { class: "card api-card" }, [
      el("h2", { text: "Connexion à l'équipe" }),
      el("p", { class: "muted small", text: "URL du script Google Apps Script (déployé en application Web, terminant par « /exec »). Conservée uniquement sur cet appareil." }),
      field("URL du script", urlInput),
      statusLine,
      el("div", { class: "row-actions" }, [
        el("button", { class: "btn btn-primary", onclick: save }, "Enregistrer et connecter"),
        CONFIG.isConfigured() ? el("button", { class: "btn btn-ghost", onclick: function () {
          App.clearApiUrl().then(function () { toast("Connexion retirée (mode local).", "ok"); forceRerender(); });
        } }, "Retirer") : null,
      ]),
    ]);
  }

  function diagnosticsBlock(status) {
    return el("div", { class: "diagnostics", id: "diagnostics" }, [
      diagRow("Version", APP_VERSION),
      diagRow("Statut réseau", status.online ? "En ligne" : "Hors connexion", "diag-online"),
      diagRow("État", status.label, "diag-state"),
      diagRow("Dernière synchronisation", status.lastSyncAt ? Utils.formatDate(status.lastSyncAt) : "—", "diag-sync"),
      diagRow("Révision", String(status.localRevision), "diag-localrev"),
      diagRow("Actions en attente", String(status.pendingCount), "diag-pending"),
      diagRow("Dernière erreur", status.lastError ? status.lastError.message : "Aucune", "diag-error"),
    ]);
  }

  function diagRow(label, value, id) {
    return el("div", { class: "diag-row" }, [
      el("span", { class: "diag-label", text: label }),
      el("span", { class: "diag-value", id: id || null, text: value }),
    ]);
  }

  function updateDiagnostics(status) {
    if (!root) return;
    const set = function (id, val) { const n = root.querySelector("#" + id); if (n) n.textContent = val; };
    set("diag-online", status.online ? "En ligne" : "Hors connexion");
    set("diag-state", status.label);
    set("diag-sync", status.lastSyncAt ? Utils.formatDate(status.lastSyncAt) : "—");
    set("diag-localrev", String(status.localRevision));
    set("diag-pending", String(status.pendingCount));
    set("diag-error", status.lastError ? status.lastError.message : "Aucune");
  }

  function updateBanner() {
    return el("div", { class: "banner no-print" }, [
      el("span", { text: "Une nouvelle version est disponible." }),
      el("button", { class: "btn btn-sm btn-primary", onclick: function () { App.applyUpdate(); } }, "Mettre à jour"),
    ]);
  }

  function connectBanner() {
    return el("div", { class: "banner banner-warn no-print" }, [
      el("span", { text: "Mode local (non connecté à l'équipe)." }),
      el("button", { class: "btn btn-sm btn-primary", onclick: function () { App.navigate("#/settings"); } }, "Connecter"),
    ]);
  }

  // ==========================================================================
  //  Modales
  // ==========================================================================

  function showNewTopic() {
    const titleInput = el("input", { class: "input", type: "text", maxlength: Utils.LIMITS.topicTitle, placeholder: "Titre du sujet" });
    const descInput = el("textarea", { class: "textarea", rows: 4, maxlength: Utils.LIMITS.topicDescription, placeholder: "Description (facultative)" });
    const nameInput = el("input", { class: "input", type: "text", maxlength: Utils.LIMITS.name, placeholder: "Anonyme" });
    nameInput.value = App.profile ? App.profile.name : "";
    modal("Nouveau sujet", [
      field("Titre *", titleInput),
      field("Description", descInput),
      field("Nom (laisser vide = Anonyme)", nameInput),
    ], function () {
      const title = Utils.clean(titleInput.value);
      if (Utils.isBlank(title)) return markInvalid(titleInput, "Le titre est obligatoire.");
      const author = Utils.clean(nameInput.value) || "Anonyme";
      const id = App.actions.createTopic(title, Utils.clean(descInput.value), author);
      App.navigate("#/topic/" + id);
      return true;
    });
    setTimeout(function () { titleInput.focus(); }, 30);
  }

  function showNewProposal(topicId, prefillDesc) {
    const titleInput = el("input", { class: "input", type: "text", maxlength: Utils.LIMITS.proposalTitle, placeholder: "Titre de la proposition" });
    const descInput = el("textarea", { class: "textarea", rows: 4, maxlength: Utils.LIMITS.proposalDescription, placeholder: "Décrivez la solution…" });
    if (prefillDesc) descInput.value = prefillDesc;
    modal("Nouvelle proposition", [field("Titre *", titleInput), field("Description", descInput)], function () {
      const title = Utils.clean(titleInput.value);
      if (Utils.isBlank(title)) return markInvalid(titleInput, "Le titre est obligatoire.");
      App.actions.createProposal(topicId, title, Utils.clean(descInput.value));
      forceRerender();
      return true;
    });
    setTimeout(function () { titleInput.focus(); }, 30);
  }

  function showAddConclusion(topicId) {
    const ta = el("textarea", { class: "textarea", rows: 4, maxlength: Utils.LIMITS.conclusion, placeholder: "Votre conclusion…" });
    modal("Ajouter une conclusion", [field("Conclusion", ta)], function () {
      const text = Utils.clean(ta.value);
      if (Utils.isBlank(text)) return markInvalid(ta, "La conclusion est vide.");
      App.actions.addConclusion(topicId, text);
      forceRerender();
      return true;
    });
    setTimeout(function () { ta.focus(); }, 30);
  }

  function modal(title, body, onConfirm) {
    const overlay = el("div", { class: "modal-overlay" });
    const close = function () { if (overlay.parentNode) document.body.removeChild(overlay); };
    const box = el("div", { class: "modal" }, [
      el("h2", { text: title }),
      el("div", { class: "modal-body" }, body),
      el("div", { class: "row-actions" }, [
        el("button", { class: "btn btn-primary", onclick: function () { if (onConfirm() !== false) close(); } }, "Valider"),
        el("button", { class: "btn btn-ghost", onclick: close }, "Annuler"),
      ]),
    ]);
    overlay.appendChild(box);
    overlay.addEventListener("click", function (e) { if (e.target === overlay) close(); });
    document.body.appendChild(overlay);
  }

  // --- Toasts ---------------------------------------------------------------

  function toast(message, kind) {
    const t = el("div", { class: "toast toast-" + (kind || "info"), text: message });
    toastEl.appendChild(t);
    setTimeout(function () { t.classList.add("show"); }, 10);
    setTimeout(function () {
      t.classList.remove("show");
      setTimeout(function () { if (t.parentNode) toastEl.removeChild(t); }, 300);
    }, 3600);
  }

  // --- Petits composants ----------------------------------------------------

  let fieldSeq = 0;
  function field(labelText, inputNode) {
    if (!inputNode.id) inputNode.id = "fld-" + (++fieldSeq);
    return [el("label", { class: "field-label", for: inputNode.id, text: labelText }), inputNode];
  }

  function markInvalid(input, message) {
    if (!input.id) input.id = "fld-" + (++fieldSeq);
    input.classList.add("invalid");
    input.setAttribute("aria-invalid", "true");
    input.setAttribute("aria-describedby", input.id + "-err");
    let err = input.nextSibling && input.nextSibling.className === "field-error" ? input.nextSibling : null;
    if (!err) {
      err = el("span", { class: "field-error", id: input.id + "-err", role: "alert" });
      if (input.parentNode) input.parentNode.insertBefore(err, input.nextSibling);
    }
    err.textContent = message;
    input.focus();
    input.addEventListener("input", function clearInvalid() {
      input.classList.remove("invalid");
      input.removeAttribute("aria-invalid");
      if (err) err.textContent = "";
      input.removeEventListener("input", clearInvalid);
    });
    return false;
  }

  function option(value, label, current) {
    const o = el("option", { value: value, text: label });
    if (value === current) o.selected = true;
    return o;
  }

  function plusGlyph() { return el("span", { class: "plus-glyph", text: "+" }); }
  function initial(name) { return (String(name || "?").trim().charAt(0) || "?").toUpperCase(); }
  function notFound() {
    return el("section", { class: "page" }, [
      el("p", { class: "empty", text: "Sujet introuvable." }),
      el("button", { class: "btn", onclick: function () { App.navigate("#/"); } }, "← Retour"),
    ]);
  }
  function topicBadge(status) { return el("span", { class: "badge badge-topic badge-" + status, text: State.TOPIC_STATUS_LABELS[status] || status }); }
  function proposalBadge(status) { return el("span", { class: "badge badge-prop badge-" + status, text: State.PROPOSAL_STATUS_LABELS[status] || status }); }
  function sectionTitle(text) { return el("h2", { class: "section-title", text: text }); }
  function metaItem(text) { return el("span", { class: "meta-item", text: text }); }
  function emptyState(text) { return el("div", { class: "empty", text: text }); }
  function shorten(s, n) { s = String(s || ""); return s.length > n ? s.slice(0, n - 1) + "…" : s; }
  function plural(n) { return n > 1 ? "s" : ""; }

  return {
    mount: mount,
    reveal: reveal,
    renderData: renderData,
    renderStatus: renderStatus,
    setUpdateAvailable: setUpdateAvailable,
    forceRerender: forceRerender,
    showOnboardingUrl: showOnboardingUrl,
    showOnboardingName: showOnboardingName,
    toast: toast,
  };
})();
