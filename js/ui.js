/**
 * Rendu de l'interface.
 *
 * Principes :
 *  - Aucun contenu utilisateur n'est inséré via innerHTML (texte brut only).
 *  - Le rendu complet de la vue est reconstruit quand les données changent,
 *    mais les textes en cours de saisie (attribut data-draft) et l'élément
 *    actif sont préservés : on ne perd jamais un texte rédigé.
 */
const UI = (function () {
  const el = Utils.el;
  let root, header, viewEl, badgeEl, toastEl;

  // État éphémère de l'interface (non persisté).
  const openEditors = new Set(); // clés "kind:id"
  const listState = { search: "", status: "all", sort: "recent" };
  const meetingState = { filter: "all" };
  let lastSignature = null;
  let lastRoute = null;
  let updateAvailable = false;

  // --- Montage --------------------------------------------------------------

  function mount(container) {
    root = container;
    Utils.clear(root);

    header = el("header", { class: "app-header" }, [
      el("button", { class: "brand", onclick: function () { App.navigate("#/"); } }, "TeamKrys"),
      el("nav", { class: "app-nav" }, [
        navLink("#/", "Sujets"),
        navLink("#/meeting", "Réunion"),
        navLink("#/settings", "Paramètres"),
      ]),
    ]);

    badgeEl = el("button", {
      class: "sync-badge",
      title: "Synchroniser maintenant",
      onclick: function () { Sync.syncNow(); },
    });
    const badgeWrap = el("div", { class: "sync-bar" }, [badgeEl]);

    viewEl = el("main", { id: "view", class: "view" });
    toastEl = el("div", { class: "toast-root", "aria-live": "polite" });

    root.appendChild(header);
    root.appendChild(badgeWrap);
    root.appendChild(viewEl);
    root.appendChild(toastEl);
  }

  function navLink(hash, label) {
    return el("a", {
      href: hash,
      class: "nav-link",
      onclick: function (e) {
        e.preventDefault();
        App.navigate(hash);
      },
    }, label);
  }

  // --- Préservation des saisies --------------------------------------------

  function captureDrafts() {
    const map = {};
    let active = null;
    root.querySelectorAll("[data-draft]").forEach(function (node) {
      map[node.getAttribute("data-draft")] = node.value;
      if (node === document.activeElement) {
        active = {
          key: node.getAttribute("data-draft"),
          start: node.selectionStart,
          end: node.selectionEnd,
        };
      }
    });
    return { map: map, active: active };
  }

  function restoreDrafts(snapshot) {
    root.querySelectorAll("[data-draft]").forEach(function (node) {
      const key = node.getAttribute("data-draft");
      if (Object.prototype.hasOwnProperty.call(snapshot.map, key)) {
        const val = snapshot.map[key];
        // On ne restaure que si le champ neuf est vide (évite d'écraser une
        // valeur pré-remplie légitime).
        if (node.value === "" && val) node.value = val;
      }
    });
    if (snapshot.active) {
      const target = root.querySelector('[data-draft="' + cssEscape(snapshot.active.key) + '"]');
      if (target) {
        target.focus();
        try {
          target.setSelectionRange(snapshot.active.start, snapshot.active.end);
        } catch (e) { /* champ non textuel */ }
      }
    }
  }

  function cssEscape(s) {
    return String(s).replace(/["\\]/g, "\\$&");
  }

  // --- Rendu principal ------------------------------------------------------

  function renderData(data) {
    const route = App.route;
    const signature = route.name + "|" + route.id + "|" + JSON.stringify(listState) +
      "|" + JSON.stringify(meetingState) + "|" + serialize(openEditors) +
      "|" + (data.updatedAt || "") + "|" + (data.revision || 0) + "|" + dataSignature(data, route);

    if (signature === lastSignature && route.name === lastRoute) return;
    lastSignature = signature;
    lastRoute = route.name;

    const snap = captureDrafts();
    Utils.clear(viewEl);
    highlightNav(route.name);

    let content;
    if (route.name === "topic") content = renderTopic(data, route.id);
    else if (route.name === "meeting") content = renderMeeting(data);
    else if (route.name === "settings") content = renderSettings(data);
    else content = renderHome(data);

    if (content) viewEl.appendChild(content);
    restoreDrafts(snap);
  }

  function serialize(set) {
    return Array.from(set).sort().join(",");
  }

  // Signature minimale des données pertinentes pour la route (évite les
  // rendus inutiles tout en captant les changements visibles).
  function dataSignature(data, route) {
    if (route.name === "topic") {
      const t = State.findTopic(data, route.id);
      return t ? JSON.stringify(t) : "none";
    }
    // Vue liste / réunion : titres, statuts, activité, votes agrégés.
    return data.topics
      .map(function (t) {
        return (
          t.id + t.status + t.updatedAt + t.title + t.messages.length +
          t.proposals.map(function (p) {
            return p.status + Object.keys(p.votes).length;
          }).join("")
        );
      })
      .join("|");
  }

  function highlightNav(name) {
    const map = { home: "#/", topic: "#/", meeting: "#/meeting", settings: "#/settings" };
    header.querySelectorAll(".nav-link").forEach(function (a) {
      a.classList.toggle("active", a.getAttribute("href") === map[name]);
    });
  }

  // --- Badge de synchronisation --------------------------------------------

  function renderStatus(status) {
    if (!badgeEl) return;
    badgeEl.className = "sync-badge status-" + status.key;
    Utils.clear(badgeEl);
    badgeEl.appendChild(el("span", { class: "dot" }));
    let text = status.label;
    if (status.pendingCount > 0) text += " (" + status.pendingCount + ")";
    badgeEl.appendChild(el("span", { text: text }));

    // Met à jour le diagnostic si la vue Paramètres est ouverte.
    updateDiagnostics(status);
  }

  function setUpdateAvailable(v) {
    updateAvailable = v;
    forceRerender();
  }

  function forceRerender() {
    lastSignature = null;
    renderData(Sync.getData());
  }

  // ==========================================================================
  //  VUE : Accueil / liste des sujets
  // ==========================================================================

  function renderHome(data) {
    const wrap = el("section", { class: "page" });

    wrap.appendChild(
      el("div", { class: "page-head" }, [
        el("h1", { text: "Sujets à préparer" }),
        el("button", { class: "btn btn-primary", onclick: showNewTopic }, "+ Nouveau sujet"),
      ])
    );

    if (updateAvailable) wrap.appendChild(updateBanner());

    // Filtres
    const controls = el("div", { class: "controls" });
    controls.appendChild(
      el("input", {
        type: "search",
        class: "input",
        placeholder: "Rechercher un sujet…",
        "aria-label": "Rechercher un sujet",
        value: listState.search,
        "data-draft": "home-search",
        oninput: function (e) {
          listState.search = e.target.value;
          forceRerender();
        },
      })
    );
    const statusSel = el("select", {
      class: "select",
      "aria-label": "Filtrer par statut",
      onchange: function (e) {
        listState.status = e.target.value;
        forceRerender();
      },
    }, [
      option("all", "Tous les statuts", listState.status),
      option("open", "Ouverts", listState.status),
      option("ready", "Prêts", listState.status),
      option("closed", "Traités", listState.status),
      option("archived", "Archivés", listState.status),
    ]);
    const sortSel = el("select", {
      class: "select",
      "aria-label": "Trier les sujets",
      onchange: function (e) {
        listState.sort = e.target.value;
        forceRerender();
      },
    }, [
      option("recent", "Activité récente", listState.sort),
      option("created", "Date de création", listState.sort),
      option("title", "Titre", listState.sort),
    ]);
    controls.appendChild(statusSel);
    controls.appendChild(sortSel);
    wrap.appendChild(controls);

    // Liste filtrée
    let topics = data.topics.slice();
    const q = Utils.clean(listState.search).toLowerCase();
    if (q) {
      topics = topics.filter(function (t) {
        return (
          (t.title || "").toLowerCase().indexOf(q) !== -1 ||
          (t.description || "").toLowerCase().indexOf(q) !== -1
        );
      });
    }
    if (listState.status !== "all") {
      topics = topics.filter(function (t) {
        return t.status === listState.status;
      });
    } else {
      // Par défaut, on masque les archivés dans la liste "Tous".
      topics = topics.filter(function (t) {
        return t.status !== "archived";
      });
    }
    topics.sort(sorter(listState.sort));

    if (topics.length === 0) {
      wrap.appendChild(emptyState("Aucun sujet à afficher. Créez le premier sujet de la réunion."));
    } else {
      const list = el("div", { class: "topic-list" });
      topics.forEach(function (t) {
        list.appendChild(topicCard(t));
      });
      wrap.appendChild(list);
    }
    return wrap;
  }

  function sorter(mode) {
    if (mode === "created")
      return function (a, b) {
        return (b.createdAt || "").localeCompare(a.createdAt || "");
      };
    if (mode === "title")
      return function (a, b) {
        return (a.title || "").localeCompare(b.title || "", "fr");
      };
    return function (a, b) {
      return (b.updatedAt || "").localeCompare(a.updatedAt || "");
    };
  }

  function topicCard(t) {
    const tallies = t.proposals.map(State.tally);
    const nbVoting = t.proposals.filter(function (p) { return p.status === "voting"; }).length;
    return el("button", {
      class: "card topic-card",
      onclick: function () { App.navigate("#/topic/" + t.id); },
    }, [
      el("div", { class: "card-top" }, [
        el("h2", { class: "card-title", text: t.title }),
        topicBadge(t.status),
      ]),
      t.description ? el("p", { class: "card-desc", text: shorten(t.description, 160) }) : null,
      el("div", { class: "card-meta" }, [
        metaItem("💬", t.messages.length + " message" + plural(t.messages.length)),
        metaItem("💡", t.proposals.length + " proposition" + plural(t.proposals.length)),
        nbVoting ? metaItem("🗳️", nbVoting + " en vote") : null,
        el("span", { class: "meta-author", text: "par " + t.createdBy.name }),
      ]),
    ]);
  }

  // ==========================================================================
  //  VUE : Détail d'un sujet
  // ==========================================================================

  function renderTopic(data, topicId) {
    const t = State.findTopic(data, topicId);
    if (!t) {
      return el("section", { class: "page" }, [
        el("p", { class: "empty", text: "Sujet introuvable." }),
        el("button", { class: "btn", onclick: function () { App.navigate("#/"); } }, "← Retour"),
      ]);
    }

    const wrap = el("section", { class: "page topic-detail" });
    wrap.appendChild(
      el("div", { class: "back-row" }, [
        el("button", { class: "btn btn-ghost", onclick: function () { App.navigate("#/"); } }, "← Sujets"),
        topicBadge(t.status),
      ])
    );

    // 1. Titre + description (+ édition)
    wrap.appendChild(renderTopicHeader(t));

    // Actions de statut
    wrap.appendChild(renderStatusActions(t));

    // 2. Discussion
    wrap.appendChild(sectionTitle("Discussion"));
    wrap.appendChild(renderMessages(t));

    // 3. Propositions + 4. Votes
    wrap.appendChild(sectionTitle("Propositions"));
    wrap.appendChild(renderProposals(t));

    // 5. Conclusion
    wrap.appendChild(sectionTitle("Conclusion"));
    wrap.appendChild(renderConclusion(t));

    return wrap;
  }

  function renderTopicHeader(t) {
    const key = "topic:" + t.id;
    if (openEditors.has(key)) {
      const titleInput = el("input", {
        class: "input", type: "text", maxlength: Utils.LIMITS.topicTitle,
        value: t.title, "data-draft": "edit-topic-title-" + t.id,
      });
      const descInput = el("textarea", {
        class: "textarea", rows: 4, maxlength: Utils.LIMITS.topicDescription,
        "data-draft": "edit-topic-desc-" + t.id,
      });
      descInput.value = t.description || "";
      return el("div", { class: "card" }, [
        field("Titre", titleInput),
        field("Description", descInput),
        el("div", { class: "row-actions" }, [
          el("button", { class: "btn btn-primary", onclick: function () {
            const title = Utils.clean(titleInput.value);
            if (Utils.isBlank(title)) return markInvalid(titleInput, "Le titre est obligatoire.");
            App.actions.updateTopic(t.id, title, Utils.clean(descInput.value));
            openEditors.delete(key);
            forceRerender();
          } }, "Enregistrer"),
          el("button", { class: "btn btn-ghost", onclick: function () {
            openEditors.delete(key);
            forceRerender();
          } }, "Annuler"),
        ]),
      ]);
    }
    return el("div", { class: "card" }, [
      el("div", { class: "card-top" }, [
        el("h1", { class: "topic-title", text: t.title }),
        el("button", { class: "btn btn-ghost btn-sm", onclick: function () {
          openEditors.add(key);
          forceRerender();
        } }, "Modifier"),
      ]),
      t.description
        ? el("p", { class: "topic-desc pre", text: t.description })
        : el("p", { class: "muted", text: "Aucune description." }),
      el("p", { class: "byline", text: "Créé par " + t.createdBy.name + " · " + Utils.formatDate(t.createdAt) }),
    ]);
  }

  function renderStatusActions(t) {
    const row = el("div", { class: "status-actions" });
    const options = [
      { s: "open", label: "Rouvrir" },
      { s: "ready", label: "Prêt pour la réunion" },
      { s: "closed", label: "Marquer traité" },
      { s: "archived", label: "Archiver" },
    ];
    options.forEach(function (o) {
      if (t.status === o.s) return;
      row.appendChild(
        el("button", { class: "btn btn-sm", onclick: function () {
          App.actions.changeTopicStatus(t.id, o.s);
        } }, o.label)
      );
    });
    return row;
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
      .forEach(function (m) {
        box.appendChild(messageItem(t, m));
      });
    box.appendChild(newMessageForm(t));
    return box;
  }

  function messageItem(t, m) {
    const key = "msg:" + m.id;
    const isMine = m.authorId === App.profile.id;
    if (openEditors.has(key) && isMine) {
      const ta = el("textarea", {
        class: "textarea", rows: 3, maxlength: Utils.LIMITS.message,
        "aria-label": "Modifier le message", "data-draft": "edit-msg-" + m.id,
      });
      ta.value = m.text;
      return el("div", { class: "message editing" }, [
        ta,
        el("div", { class: "row-actions" }, [
          el("button", { class: "btn btn-sm btn-primary", onclick: function () {
            const text = Utils.clean(ta.value);
            if (Utils.isBlank(text)) return markInvalid(ta, "Le message est vide.");
            App.actions.updateMessage(t.id, m.id, text);
            openEditors.delete(key);
            forceRerender();
          } }, "Enregistrer"),
          el("button", { class: "btn btn-sm btn-ghost", onclick: function () {
            openEditors.delete(key);
            forceRerender();
          } }, "Annuler"),
        ]),
      ]);
    }
    return el("div", { class: "message" }, [
      el("div", { class: "message-head" }, [
        el("span", { class: "author", text: m.authorName }),
        el("span", { class: "date", text: Utils.formatDate(m.createdAt) + (m.updatedAt ? " · modifié" : "") }),
      ]),
      el("div", { class: "message-body pre", text: m.text }),
      el("div", { class: "message-actions" }, [
        el("button", { class: "link-btn", onclick: function () {
          showNewProposal(t.id, m.text);
        } }, "Créer une proposition"),
        isMine
          ? el("button", { class: "link-btn", onclick: function () {
              openEditors.add(key);
              forceRerender();
            } }, "Modifier")
          : null,
      ]),
    ]);
  }

  function newMessageForm(t) {
    const ta = el("textarea", {
      class: "textarea", rows: 2, placeholder: "Écrire un message…",
      "aria-label": "Nouveau message", maxlength: Utils.LIMITS.message, "data-draft": "new-msg-" + t.id,
    });
    return el("div", { class: "new-message" }, [
      ta,
      el("button", { class: "btn btn-primary", onclick: function () {
        const text = Utils.clean(ta.value);
        if (Utils.isBlank(text)) return markInvalid(ta, "Le message est vide.");
        App.actions.createMessage(t.id, text);
        ta.value = "";
        forceRerender();
      } }, "Publier"),
    ]);
  }

  // --- Propositions & votes -------------------------------------------------

  function renderProposals(t) {
    const box = el("div", { class: "proposals" });
    box.appendChild(
      el("button", { class: "btn btn-outline", onclick: function () { showNewProposal(t.id, ""); } }, "+ Nouvelle proposition")
    );
    if (t.proposals.length === 0) {
      box.appendChild(el("p", { class: "muted", text: "Aucune proposition." }));
    }
    t.proposals.forEach(function (p) {
      box.appendChild(proposalCard(t, p));
    });
    return box;
  }

  function proposalCard(t, p) {
    const key = "prop:" + p.id;
    const card = el("div", { class: "card proposal" });

    if (openEditors.has(key)) {
      const titleInput = el("input", {
        class: "input", type: "text", value: p.title,
        maxlength: Utils.LIMITS.proposalTitle, "data-draft": "edit-prop-title-" + p.id,
      });
      const descInput = el("textarea", {
        class: "textarea", rows: 3, maxlength: Utils.LIMITS.proposalDescription,
        "data-draft": "edit-prop-desc-" + p.id,
      });
      descInput.value = p.description || "";
      field("Titre", titleInput).forEach(function (n) { card.appendChild(n); });
      field("Description", descInput).forEach(function (n) { card.appendChild(n); });
      card.appendChild(el("div", { class: "row-actions" }, [
        el("button", { class: "btn btn-sm btn-primary", onclick: function () {
          const title = Utils.clean(titleInput.value);
          if (Utils.isBlank(title)) return markInvalid(titleInput, "Le titre est obligatoire.");
          App.actions.updateProposal(t.id, p.id, title, Utils.clean(descInput.value));
          openEditors.delete(key);
          forceRerender();
        } }, "Enregistrer"),
        el("button", { class: "btn btn-sm btn-ghost", onclick: function () {
          openEditors.delete(key);
          forceRerender();
        } }, "Annuler"),
      ]));
      return card;
    }

    card.appendChild(el("div", { class: "card-top" }, [
      el("h3", { class: "proposal-title", text: p.title }),
      proposalBadge(p.status),
    ]));
    if (p.description) card.appendChild(el("p", { class: "proposal-desc pre", text: p.description }));
    card.appendChild(el("p", { class: "byline", text: "Proposé par " + p.authorName + " · " + Utils.formatDate(p.createdAt) }));

    // Votes
    card.appendChild(voteBlock(t, p));

    // Statut de la proposition (modifiable par tous)
    card.appendChild(el("div", { class: "proposal-footer" }, [
      el("label", { class: "field-label inline", text: "Statut :" }),
      proposalStatusSelect(t, p),
      el("button", { class: "btn btn-ghost btn-sm", onclick: function () {
        openEditors.add(key);
        forceRerender();
      } }, "Modifier"),
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
      myVote
        ? el("button", { class: "btn btn-sm btn-ghost", onclick: function () {
            App.actions.removeVote(t.id, p.id);
          } }, "Retirer mon vote")
        : null,
    ]);

    return el("div", { class: "vote-block" }, [
      bar,
      el("div", { class: "vote-stats" }, [
        el("span", { class: "v-for", text: "Pour : " + s.for }),
        el("span", { class: "v-against", text: "Contre : " + s.against }),
        el("span", { class: "v-abstain", text: "Abstentions : " + s.abstain }),
        el("span", { class: "v-total", text: "Votants : " + s.total }),
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
    const sel = el("select", {
      class: "select select-sm",
      "aria-label": "Statut de la proposition",
      onchange: function (e) { App.actions.changeProposalStatus(t.id, p.id, e.target.value); },
    });
    Utils.PROPOSAL_STATUSES.forEach(function (st) {
      sel.appendChild(option(st, State.PROPOSAL_STATUS_LABELS[st], p.status));
    });
    return sel;
  }

  // --- Conclusion -----------------------------------------------------------

  function renderConclusion(t) {
    const ta = el("textarea", {
      class: "textarea", rows: 5, maxlength: Utils.LIMITS.conclusion,
      placeholder: "Résumé des discussions, décisions attendues, actions…",
      "aria-label": "Conclusion du sujet",
      "data-draft": "conclusion-" + t.id,
    });
    ta.value = t.conclusion || "";
    const info = t.conclusionUpdatedAt
      ? "Dernière modification par " + (t.conclusionUpdatedBy ? t.conclusionUpdatedBy.name : "?") +
        " · " + Utils.formatDate(t.conclusionUpdatedAt)
      : "Aucune conclusion pour l'instant.";
    return el("div", { class: "card conclusion" }, [
      ta,
      el("p", { class: "byline", text: info }),
      el("div", { class: "row-actions" }, [
        el("button", { class: "btn btn-primary", onclick: function () {
          App.actions.updateConclusion(t.id, Utils.clean(ta.value));
          toast("Conclusion enregistrée.", "ok");
        } }, "Enregistrer la conclusion"),
        t.status !== "ready"
          ? el("button", { class: "btn btn-outline", onclick: function () {
              App.actions.changeTopicStatus(t.id, "ready");
            } }, "Marquer prêt pour la réunion")
          : null,
      ]),
    ]);
  }

  // ==========================================================================
  //  VUE : Synthèse de réunion
  // ==========================================================================

  function renderMeeting(data) {
    const wrap = el("section", { class: "page meeting" });
    wrap.appendChild(el("div", { class: "page-head" }, [
      el("h1", { text: "Préparation de la réunion" }),
      el("button", { class: "btn btn-primary no-print", onclick: function () { window.print(); } }, "Imprimer la synthèse"),
    ]));

    const filters = [
      ["all", "Tout"],
      ["open", "Sujets ouverts"],
      ["ready", "Sujets prêts"],
      ["closed", "Sujets clôturés"],
      ["selected", "Propositions retenues"],
      ["debate", "Propositions à débattre"],
      ["novote", "Propositions sans vote"],
    ];
    const fbar = el("div", { class: "controls no-print" });
    filters.forEach(function (f) {
      fbar.appendChild(el("button", {
        class: "chip" + (meetingState.filter === f[0] ? " active" : ""),
        onclick: function () { meetingState.filter = f[0]; forceRerender(); },
      }, f[1]));
    });
    wrap.appendChild(fbar);

    let topics = data.topics.filter(function (t) { return t.status !== "archived"; });
    const f = meetingState.filter;
    if (f === "open" || f === "ready" || f === "closed") {
      topics = topics.filter(function (t) { return t.status === f; });
    }
    topics.sort(sorter("recent"));

    if (topics.length === 0) {
      wrap.appendChild(emptyState("Aucun sujet à synthétiser."));
      return wrap;
    }

    topics.forEach(function (t) {
      const block = meetingBlock(t, f);
      if (block) wrap.appendChild(block);
    });
    return wrap;
  }

  function meetingBlock(t, filter) {
    const selected = t.proposals.filter(function (p) { return p.status === "selected"; });
    const debate = t.proposals.filter(function (p) { return p.status === "debate"; });
    const implement = t.proposals.filter(function (p) { return p.status === "implemented"; });
    const noVote = t.proposals.filter(function (p) { return Object.keys(p.votes).length === 0; });

    if (filter === "selected" && selected.length === 0) return null;
    if (filter === "debate" && debate.length === 0) return null;
    if (filter === "novote" && noVote.length === 0) return null;

    const block = el("article", { class: "card meeting-block" });
    block.appendChild(el("div", { class: "card-top" }, [
      el("h2", { class: "card-title", text: t.title }),
      topicBadge(t.status),
    ]));
    if (t.description) block.appendChild(el("p", { class: "card-desc", text: shorten(t.description, 220) }));

    block.appendChild(el("h4", { class: "mini-title", text: "Conclusion" }));
    block.appendChild(
      t.conclusion
        ? el("p", { class: "pre", text: t.conclusion })
        : el("p", { class: "muted", text: "— (à rédiger)" })
    );

    block.appendChild(proposalSummary("Solutions retenues", selected));
    block.appendChild(proposalSummary("À débattre en réunion", debate));
    block.appendChild(proposalSummary("À mettre en œuvre", implement));

    // Points encore sans décision : propositions en vote.
    const undecided = t.proposals.filter(function (p) { return p.status === "voting"; });
    if (undecided.length) {
      block.appendChild(proposalSummary("Points encore sans décision", undecided));
    }
    if (noVote.length) {
      block.appendChild(el("p", { class: "muted small", text: noVote.length + " proposition(s) sans vote." }));
    }
    return block;
  }

  function proposalSummary(title, list) {
    if (!list.length) return el("span");
    const box = el("div", { class: "prop-summary" }, [el("h4", { class: "mini-title", text: title })]);
    list.forEach(function (p) {
      const s = State.tally(p);
      box.appendChild(el("div", { class: "prop-line" }, [
        el("span", { class: "prop-line-title", text: p.title }),
        el("span", { class: "prop-line-votes", text:
          "Pour " + s.for + " · Contre " + s.against + " · Abst. " + s.abstain +
          (s.expressed ? " · " + s.favorablePct + "%" : "") }),
        el("span", { class: "prop-line-ind ind-" + s.indicator.key, text: s.indicator.label }),
      ]));
    });
    return box;
  }

  // ==========================================================================
  //  VUE : Paramètres & diagnostic
  // ==========================================================================

  function renderSettings(data) {
    const wrap = el("section", { class: "page settings" });
    wrap.appendChild(el("h1", { text: "Paramètres" }));

    if (updateAvailable) wrap.appendChild(updateBanner());

    // Profil
    const nameInput = el("input", {
      class: "input", type: "text", maxlength: Utils.LIMITS.name,
      value: App.profile.name, "data-draft": "settings-name",
    });
    wrap.appendChild(el("div", { class: "card" }, [
      el("h2", { text: "Votre identité" }),
      field("Prénom", nameInput),
      el("div", { class: "row-actions" }, [
        el("button", { class: "btn btn-primary", onclick: function () {
          const name = Utils.clean(nameInput.value);
          if (Utils.isBlank(name)) return markInvalid(nameInput, "Le prénom est obligatoire.");
          App.updateProfileName(name);
          toast("Prénom mis à jour.", "ok");
        } }, "Enregistrer"),
      ]),
      el("p", { class: "muted small", text: "Identifiant local : " + App.profile.id }),
    ]));

    // Synchronisation
    const status = Sync.getStatus();
    wrap.appendChild(el("div", { class: "card" }, [
      el("h2", { text: "Synchronisation" }),
      el("div", { class: "row-actions" }, [
        el("button", { class: "btn btn-primary", onclick: function () { Sync.syncNow(); } }, "Synchroniser maintenant"),
      ]),
      diagnosticsBlock(status),
    ]));

    // À propos
    wrap.appendChild(el("div", { class: "card" }, [
      el("h2", { text: "À propos" }),
      el("p", { text: "TeamKrys — outil interne de préparation de réunion." }),
      el("p", { class: "muted small", text: "Version " + APP_VERSION }),
      el("p", { class: "muted small", text: CONFIG.isConfigured()
        ? "API configurée." : "API non configurée : mode local uniquement (voir README)." }),
    ]));
    return wrap;
  }

  function diagnosticsBlock(status) {
    return el("div", { class: "diagnostics", id: "diagnostics" }, [
      diagRow("Version", APP_VERSION),
      diagRow("Statut réseau", status.online ? "En ligne" : "Hors connexion", "diag-online"),
      diagRow("État", status.label, "diag-state"),
      diagRow("Dernière synchronisation", status.lastSyncAt ? Utils.formatDate(status.lastSyncAt) : "—", "diag-sync"),
      diagRow("Révision locale", String(status.localRevision), "diag-localrev"),
      diagRow("Révision distante", String(status.remoteRevision), "diag-remoterev"),
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
    const set = function (id, val) {
      const n = root.querySelector("#" + id);
      if (n) n.textContent = val;
    };
    set("diag-online", status.online ? "En ligne" : "Hors connexion");
    set("diag-state", status.label);
    set("diag-sync", status.lastSyncAt ? Utils.formatDate(status.lastSyncAt) : "—");
    set("diag-localrev", String(status.localRevision));
    set("diag-remoterev", String(status.remoteRevision));
    set("diag-pending", String(status.pendingCount));
    set("diag-error", status.lastError ? status.lastError.message : "Aucune");
  }

  function updateBanner() {
    return el("div", { class: "banner no-print" }, [
      el("span", { text: "Une nouvelle version de TeamKrys est disponible." }),
      el("button", { class: "btn btn-sm btn-primary", onclick: function () { App.applyUpdate(); } }, "Mettre à jour"),
    ]);
  }

  // ==========================================================================
  //  Modales (nouveau sujet / nouvelle proposition) & profil initial
  // ==========================================================================

  function showNewTopic() {
    const titleInput = el("input", { class: "input", type: "text", maxlength: Utils.LIMITS.topicTitle, placeholder: "Titre du sujet" });
    const descInput = el("textarea", { class: "textarea", rows: 4, maxlength: Utils.LIMITS.topicDescription, placeholder: "Décrivez le problème, l'idée ou la question…" });
    modal("Nouveau sujet", [
      field("Titre", titleInput),
      field("Description", descInput),
    ], function () {
      const title = Utils.clean(titleInput.value);
      if (Utils.isBlank(title)) return markInvalid(titleInput, "Le titre est obligatoire.");
      const id = App.actions.createTopic(title, Utils.clean(descInput.value));
      App.navigate("#/topic/" + id);
      return true;
    });
    setTimeout(function () { titleInput.focus(); }, 30);
  }

  function showNewProposal(topicId, prefillDesc) {
    const titleInput = el("input", { class: "input", type: "text", maxlength: Utils.LIMITS.proposalTitle, placeholder: "Titre de la proposition" });
    const descInput = el("textarea", { class: "textarea", rows: 4, maxlength: Utils.LIMITS.proposalDescription, placeholder: "Décrivez la solution…" });
    if (prefillDesc) descInput.value = prefillDesc;
    modal("Nouvelle proposition", [
      field("Titre", titleInput),
      field("Description", descInput),
    ], function () {
      const title = Utils.clean(titleInput.value);
      if (Utils.isBlank(title)) return markInvalid(titleInput, "Le titre est obligatoire.");
      App.actions.createProposal(topicId, title, Utils.clean(descInput.value));
      forceRerender();
      return true;
    });
    setTimeout(function () { titleInput.focus(); }, 30);
  }

  function askProfileName(onDone) {
    const input = el("input", { class: "input", type: "text", maxlength: Utils.LIMITS.name, placeholder: "Votre prénom", "aria-label": "Votre prénom" });
    const overlay = el("div", { class: "modal-overlay" }, [
      el("div", { class: "modal" }, [
        el("h2", { text: "Bienvenue sur TeamKrys" }),
        el("p", { text: "Quel est votre prénom ?" }),
        input,
        el("div", { class: "row-actions" }, [
          el("button", { class: "btn btn-primary", onclick: function () {
            const name = Utils.clean(input.value);
            if (Utils.isBlank(name)) return markInvalid(input, "Merci d'indiquer un prénom.");
            document.body.removeChild(overlay);
            onDone(name);
          } }, "Commencer"),
        ]),
      ]),
    ]);
    document.body.appendChild(overlay);
    setTimeout(function () { input.focus(); }, 30);
    input.addEventListener("keydown", function (e) {
      if (e.key === "Enter") overlay.querySelector(".btn-primary").click();
    });
  }

  function modal(title, body, onConfirm) {
    const overlay = el("div", { class: "modal-overlay" });
    const close = function () { if (overlay.parentNode) document.body.removeChild(overlay); };
    const box = el("div", { class: "modal" }, [
      el("h2", { text: title }),
      el("div", { class: "modal-body" }, body),
      el("div", { class: "row-actions" }, [
        el("button", { class: "btn btn-primary", onclick: function () {
          if (onConfirm() !== false) close();
        } }, "Valider"),
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
    setTimeout(function () {
      t.classList.add("show");
    }, 10);
    setTimeout(function () {
      t.classList.remove("show");
      setTimeout(function () { if (t.parentNode) toastEl.removeChild(t); }, 300);
    }, 3200);
  }

  // --- Petits composants ----------------------------------------------------

  // Associe un <label> à son champ (attributs for/id) pour l'accessibilité.
  let fieldSeq = 0;
  function field(labelText, inputNode) {
    if (!inputNode.id) inputNode.id = "fld-" + (++fieldSeq);
    return [el("label", { class: "field-label", for: inputNode.id, text: labelText }), inputNode];
  }

  // Signale un champ invalide : message inline sous le champ (pas de toast
  // trompeur), attributs ARIA, focus, effacement à la prochaine saisie.
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

  function topicBadge(status) {
    return el("span", { class: "badge badge-topic badge-" + status, text: State.TOPIC_STATUS_LABELS[status] || status });
  }
  function proposalBadge(status) {
    return el("span", { class: "badge badge-prop badge-" + status, text: State.PROPOSAL_STATUS_LABELS[status] || status });
  }
  function sectionTitle(text) {
    return el("h2", { class: "section-title", text: text });
  }
  function metaItem(icon, text) {
    return el("span", { class: "meta-item", text: icon + " " + text });
  }
  function emptyState(text) {
    return el("div", { class: "empty", text: text });
  }
  function shorten(s, n) {
    s = String(s || "");
    return s.length > n ? s.slice(0, n - 1) + "…" : s;
  }
  function plural(n) { return n > 1 ? "s" : ""; }

  return {
    mount: mount,
    renderData: renderData,
    renderStatus: renderStatus,
    setUpdateAvailable: setUpdateAvailable,
    forceRerender: forceRerender,
    askProfileName: askProfileName,
    toast: toast,
  };
})();
