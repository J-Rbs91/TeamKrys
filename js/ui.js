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
  var UI = {};

  var appRoot = null;
  var overlayRoot = null;
  var toastRoot = null;
  var lastSignature = null;
  var forceNext = false;

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

  UI.set = function (patch) {
    Object.assign(UI.local, patch || {});
    UI.local.version += 1;
    UI.render();
  };

  UI.force = function () { forceNext = true; UI.render(); };

  UI.init = function () {
    appRoot = document.getElementById("app");
    overlayRoot = document.getElementById("overlay-root");
    toastRoot = document.getElementById("toast-root");
  };

  /* ------------------------------------------------------------ Brouillons --- */

  function captureDrafts() {
    var snapshot = { values: {}, active: null };
    var nodes = document.querySelectorAll("[data-draft]");
    for (var i = 0; i < nodes.length; i++) {
      var node = nodes[i];
      var key = node.getAttribute("data-draft");
      snapshot.values[key] = node.value;
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

  function restoreDrafts(snapshot) {
    var nodes = document.querySelectorAll("[data-draft]");
    for (var i = 0; i < nodes.length; i++) {
      var node = nodes[i];
      var key = node.getAttribute("data-draft");
      var saved = snapshot.values[key];
      /* On ne restaure que si le champ neuf est vide : une valeur fournie par
       * le rendu (édition pré-remplie) reste prioritaire. */
      if (saved !== undefined && saved !== "" && !node.value) { node.value = saved; }
      autoGrow(node);
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

  function autoGrow(node) {
    if (!node || node.tagName !== "TEXTAREA" || !node.classList.contains("grow")) { return; }
    node.style.height = "auto";
    node.style.height = Math.min(node.scrollHeight, 140) + "px";
  }

  /* --------------------------------------------------------------- Toasts --- */

  UI.toast = function (text, kind) {
    if (!toastRoot) { return; }
    var node = el("div", { class: "toast" + (kind === "error" ? " error" : ""), text: text });
    toastRoot.appendChild(node);
    setTimeout(function () {
      if (node.parentNode) { node.parentNode.removeChild(node); }
    }, kind === "error" ? 5200 : 2800);
  };

  /* ------------------------------------------------------ Blocs réutilisables --- */

  function statusPill() {
    var status = Sync.status();
    var pill = el("div", { class: "status-pill status-" + status.code, title: status.error || "" }, [
      el("span", { class: "status-dot" }),
      el("span", { class: "status-label", text: status.label })
    ]);
    return pill;
  }

  UI.refreshStatus = function () {
    var status = Sync.status();
    var nodes = document.querySelectorAll(".status-pill");
    for (var i = 0; i < nodes.length; i++) {
      nodes[i].className = "status-pill status-" + status.code;
      nodes[i].setAttribute("title", status.error || "");
      var label = nodes[i].querySelector(".status-label");
      if (label) { label.textContent = status.label; }
    }
  };

  function topbar(options) {
    var left = [];
    if (options.back) {
      /* Bouton retour visible sur CHAQUE écran secondaire (iPhone sans retour matériel). */
      var backLabel = options.backLabel || "Retour";
      left.push(el("button", {
        class: "btn-back", type: "button",
        "aria-label": backLabel === "Retour" ? "Retour" : "Retour vers " + backLabel,
        onclick: options.back
      }, [el("span", { class: "chev", "aria-hidden": "true", text: "‹" }), el("span", { text: backLabel })]));
    }
    var titles = el("div", { class: "topbar-titles" });
    if (options.onTitle) {
      var titleBtn = el("button", {
        class: "btn-ghost", type: "button",
        style: { padding: "0", textAlign: "left", width: "100%", minHeight: "auto", background: "transparent", border: "0", cursor: "pointer" },
        onclick: options.onTitle
      }, [
        el("div", { class: "topbar-title", text: options.title }),
        el("div", { class: "topbar-sub", text: (options.sub || "") + " ⓘ" })
      ]);
      titles.appendChild(titleBtn);
    } else {
      titles.appendChild(el("div", { class: "topbar-title", text: options.title }));
      if (options.sub) { titles.appendChild(el("div", { class: "topbar-sub", text: options.sub })); }
    }
    return el("header", { class: "topbar" }, [left, titles, el("div", { class: "topbar-actions" }, options.actions || [])]);
  }

  function field(label, control, hint) {
    return el("div", { class: "field" }, [
      label ? el("label", { class: "label", text: label }) : null,
      control,
      hint ? el("div", { class: "hint", text: hint }) : null
    ]);
  }

  function draftValue(key) {
    var node = findDraftNode(key);
    return node ? node.value : "";
  }

  UI.draftValue = draftValue;

  function closeOverlay() { UI.set({ sheet: null, modal: null }); }

  function sheet(title, children) {
    return el("div", {
      class: "overlay bottom",
      onclick: function (e) { if (e.target === e.currentTarget) { closeOverlay(); } }
    }, [
      el("div", { class: "sheet", role: "dialog", "aria-modal": "true" }, [
        el("div", { class: "sheet-handle" }),
        title ? el("div", { class: "sheet-title", text: title }) : null,
        children,
        el("button", { class: "btn btn-block btn-outline", type: "button", text: "Fermer", style: { marginTop: "12px" }, onclick: closeOverlay })
      ])
    ]);
  }

  function modal(title, children, actions) {
    return el("div", {
      class: "overlay center",
      onclick: function (e) { if (e.target === e.currentTarget) { closeOverlay(); } }
    }, [
      el("div", { class: "modal", role: "dialog", "aria-modal": "true" }, [
        el("div", { class: "modal-title", text: title }),
        children,
        el("div", { class: "modal-actions" }, actions)
      ])
    ]);
  }

  function sheetAction(icon, label, onclick, options) {
    options = options || {};
    return el("button", {
      class: "sheet-action" + (options.danger ? " danger" : ""),
      type: "button",
      disabled: options.disabled,
      onclick: onclick
    }, [el("span", { class: "icon", text: icon }), el("span", { text: label })]);
  }

  function counterFor(key, max) {
    return el("div", { class: "counter", dataset: { counter: key }, text: "0 / " + max });
  }

  function bindCounter(input, key, max) {
    input.addEventListener("input", function () {
      var nodes = document.querySelectorAll('[data-counter="' + key + '"]');
      for (var i = 0; i < nodes.length; i++) {
        nodes[i].textContent = input.value.length + " / " + max;
      }
    });
    return input;
  }

  /* =========================================================== ÉCRANS ==== */

  /* ---------------------------------------------------- Accueil : connexion --- */

  function screenConnection() {
    var urlInput = el("input", {
      class: "input", type: "url", inputmode: "url", autocomplete: "off",
      autocapitalize: "off", spellcheck: "false",
      placeholder: "Collez ici l'URL du script (…/exec)",
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
        el("div", { class: "hero" }, [
          el("div", { class: "logo-mark" }, [el("div", { class: "logo-ring" }), el("div", { class: "logo-dot" })]),
          el("div", { class: "wordmark", text: "BrainstO." }),
          el("div", { class: "tagline", text: "Préparer les réunions de l'équipe, ensemble." })
        ]),
        el("div", { class: "stack" }, [
          field("Adresse du script de l'équipe", urlInput,
            "Cette adresse vous est communiquée par la personne qui a installé BrainstO. Elle reste sur cet appareil."),
          field("Code d'accès", codeInput,
            "Laissez vide si aucun code n'a été configuré. Le code n'est jamais enregistré sur l'appareil."),
          el("button", { class: "btn btn-primary btn-block", type: "button", text: "Enregistrer et continuer", onclick: submit }),
          el("button", {
            class: "btn btn-ghost btn-block", type: "button",
            text: "Continuer sans connexion (mode local)",
            onclick: function () { App.useLocalMode(); }
          })
        ])
      ])
    ]);
  }

  /* --------------------------------------------------------- Accueil : nom --- */

  function screenName() {
    var nameInput = bindCounter(el("input", {
      class: "input", type: "text", maxlength: Core.LIMITS.name,
      autocomplete: "name", placeholder: "Votre prénom",
      "data-draft": "setup:name",
      value: App.user.name || ""
    }), "setup:name", Core.LIMITS.name);

    return el("div", { class: "screen" }, [
      topbar({
        title: "Votre nom",
        back: App.connectionConfigured() ? function () { App.editConnection(); } : null,
        backLabel: "Connexion"
      }),
      el("div", { class: "content stack-lg" }, [
        el("div", { class: "stack" }, [
          el("h2", { text: "Comment vous appelez-vous ?" }),
          el("p", { class: "hint", text: "Votre nom apparaît à côté de vos messages. Vous pourrez le changer et publier des messages anonymes à tout moment." }),
          nameInput,
          counterFor("setup:name", Core.LIMITS.name),
          el("button", {
            class: "btn btn-primary btn-block", type: "button", text: "Commencer",
            onclick: function () { App.saveName(nameInput.value); }
          })
        ])
      ])
    ]);
  }

  /* ------------------------------------------------------------- Verrou --- */

  function screenLock() {
    var codeInput = el("input", {
      class: "input", type: "password", inputmode: "text", autocomplete: "off",
      placeholder: "Code d'accès", "data-draft": "lock:code",
      onkeydown: function (e) { if (e.key === "Enter") { App.unlock(codeInput.value); } }
    });

    return el("div", { class: "screen" }, [
      el("div", { class: "content stack-lg" }, [
        el("div", { class: "hero" }, [
          el("div", { class: "logo-mark" }, [el("div", { class: "logo-ring" }), el("div", { class: "logo-dot" })]),
          el("div", { class: "wordmark", text: "BrainstO." }),
          el("div", { class: "tagline", text: "Espace de l'équipe verrouillé" })
        ]),
        el("div", { class: "stack" }, [
          field("Code d'accès", codeInput, "Le code vous est communiqué par l'équipe. Il n'est jamais enregistré sur cet appareil."),
          el("button", {
            class: "btn btn-primary btn-block", type: "button", text: "Déverrouiller",
            onclick: function () { App.unlock(codeInput.value); }
          }),
          el("button", {
            class: "btn btn-ghost btn-block", type: "button", text: "Se déconnecter de l'équipe",
            onclick: function () { UI.set({ modal: { type: "logout" } }); }
          })
        ])
      ])
    ]);
  }

  /* -------------------------------------------------------- Liste des sujets --- */

  function topicCard(topic) {
    var messages = topic.messages.length;
    var proposals = topic.proposals.length;
    var meta = [];
    meta.push(Utils.plural(messages, "message", "messages"));
    if (proposals) { meta.push(Utils.plural(proposals, "proposition", "propositions")); }
    if (topic.conclusions.length) { meta.push(Utils.plural(topic.conclusions.length, "conclusion", "conclusions")); }

    return el("button", {
      class: "card", type: "button",
      onclick: function () { App.go("#/topic/" + topic.id); }
    }, [
      el("div", { class: "row", style: { gap: "8px", alignItems: "flex-start" } }, [
        el("div", { class: "card-title", style: { flex: "1" }, text: topic.title }),
        el("span", { class: "badge" + (topic.status === "ready" ? " badge-ink" : ""), text: Core.TOPIC_STATUS_LABELS[topic.status] })
      ]),
      topic.description ? el("div", { class: "card-desc", text: topic.description }) : null,
      el("div", { class: "card-meta", text: meta.join(" · ") + " · " + topic.createdBy.name })
    ]);
  }

  function screenTopics() {
    var state = Store.view;
    var all = state.topics.slice().sort(function (a, b) {
      return String(b.updatedAt).localeCompare(String(a.updatedAt));
    });
    var visible = all.filter(function (t) { return UI.local.showArchived || t.status !== "archived"; });
    var archivedCount = all.length - all.filter(function (t) { return t.status !== "archived"; }).length;

    var query = Utils.trim(UI.local.search).toLowerCase();
    if (query) {
      visible = visible.filter(function (t) {
        return (t.title + " " + t.description).toLowerCase().indexOf(query) >= 0;
      });
    }

    var body;
    if (!all.length) {
      body = el("div", { class: "empty" }, [
        el("div", { class: "empty-title", text: "Aucun sujet pour l'instant" }),
        el("div", { class: "empty-text", text: "Lancez la préparation de la prochaine réunion en ajoutant un premier sujet." }),
        el("button", {
          class: "btn btn-primary", type: "button", text: "Ajouter un sujet",
          onclick: function () { UI.set({ modal: { type: "createTopic" } }); }
        })
      ]);
    } else {
      var list = el("div", { class: "stack" });
      if (all.length > CONFIG.SEARCH_THRESHOLD) {
        var search = el("input", {
          class: "input", type: "search", placeholder: "Rechercher un sujet",
          "data-draft": "topics:search", value: UI.local.search,
          oninput: Utils.debounce(function (e) { UI.set({ search: e.target.value }); }, 180)
        });
        list.appendChild(el("div", { class: "search-wrap" }, [el("span", { class: "search-icon", text: "⌕" }), search]));
      }
      if (!visible.length) {
        list.appendChild(el("p", { class: "hint", text: "Aucun sujet ne correspond." }));
      }
      visible.forEach(function (topic) { list.appendChild(topicCard(topic)); });
      if (archivedCount > 0) {
        list.appendChild(el("button", {
          class: "btn btn-ghost btn-block", type: "button",
          text: UI.local.showArchived
            ? "Masquer les sujets archivés"
            : "Afficher les sujets archivés (" + archivedCount + ")",
          onclick: function () {
            Utils.storage.set(CONFIG.KEYS.showArchived, !UI.local.showArchived);
            UI.set({ showArchived: !UI.local.showArchived });
          }
        }));
      }
      body = list;
    }

    var screen = el("div", { class: "screen" }, [
      topbar({
        title: "BrainstO.",
        sub: App.user.name ? "Bonjour " + App.user.name : null,
        actions: [
          statusPill(),
          el("button", { class: "btn-icon", type: "button", "aria-label": "Réglages", text: "⚙", onclick: function () { App.go("#/settings"); } })
        ]
      }),
      el("div", { class: "content" }, [body])
    ]);

    if (all.length) {
      screen.appendChild(el("button", {
        class: "fab", type: "button", "aria-label": "Ajouter un sujet", text: "+",
        onclick: function () { UI.set({ modal: { type: "createTopic" } }); }
      }));
    }
    return screen;
  }

  /* ------------------------------------------------------- Écran débat --- */

  function messageGroupKey(message, mine) {
    if (message.anon) { return "anon:" + (mine ? "me:" : "") + message.id; }
    return "id:" + (message.authorId || message.authorName);
  }

  function quoteBlock(topic, message) {
    var quoted = Core.findMessage(topic, message.quoteId);
    if (!quoted) { return null; }
    return el("button", {
      class: "quote", type: "button",
      onclick: function (e) { e.stopPropagation(); UI.scrollToMessage(quoted.id); }
    }, [
      el("div", { class: "quote-author", text: quoted.authorName }),
      el("div", { class: "quote-text", text: quoted.text })
    ]);
  }

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
    Core.REACTIONS.forEach(function (emoji) {
      var info = byEmoji[emoji];
      if (!info) { return; }
      row.appendChild(el("button", {
        class: "reaction" + (info.mine ? " mine" : ""), type: "button",
        "aria-label": "Réaction " + emoji,
        onclick: function (e) { e.stopPropagation(); App.actions.setReaction(topic.id, message.id, emoji); }
      }, [
        el("span", { text: emoji }),
        info.count > 1 ? el("span", { class: "reaction-count", text: String(info.count) }) : null
      ]));
    });
    return row;
  }

  function messageRow(topic, message, previous) {
    var mine = App.ownsMessage(message);
    var grouped = false;
    if (previous) {
      var samePerson = messageGroupKey(previous, App.ownsMessage(previous)) === messageGroupKey(message, mine);
      var sameDay = Utils.sameDay(previous.createdAt, message.createdAt);
      grouped = samePerson && sameDay;
    }

    var classes = "msg-row" + (mine ? " mine" : "") + (grouped ? " grouped" : " first");
    var col = el("div", { class: "msg-col" });

    if (!grouped && !mine) {
      col.appendChild(el("div", { class: "msg-author", text: message.authorName }));
    }

    var metaBits = [];
    if (mine && message.anon) { metaBits.push("Anonyme"); }
    metaBits.push(Utils.formatTime(message.createdAt));
    if (message.updatedAt && message.updatedAt !== message.createdAt) { metaBits.push("modifié"); }
    if (mine && Core.isMessageLocked(message, App.user.id)) { metaBits.push("🔒"); }

    var bubble = el("button", {
      class: "bubble", type: "button", dataset: { messageId: message.id },
      onclick: function () { UI.set({ sheet: { type: "message", topicId: topic.id, messageId: message.id } }); }
    }, [
      message.quoteId ? quoteBlock(topic, message) : null,
      el("div", { class: "bubble-text", text: message.text }),
      el("div", { class: "bubble-meta", text: metaBits.join(" · ") })
    ]);

    col.appendChild(bubble);
    var reactions = reactionsRow(topic, message);
    if (reactions) { col.appendChild(reactions); }

    return el("div", { class: classes }, [col]);
  }

  UI.scrollToMessage = function (messageId) {
    var nodes = document.querySelectorAll("[data-message-id]");
    for (var i = 0; i < nodes.length; i++) {
      if (nodes[i].getAttribute("data-message-id") === messageId) {
        nodes[i].scrollIntoView({ block: "center", behavior: "smooth" });
        nodes[i].classList.add("flash");
        (function (node) {
          setTimeout(function () { node.classList.remove("flash"); }, 1200);
        })(nodes[i]);
        return;
      }
    }
  };

  function composer(topic) {
    var draftKey = "composer:" + topic.id;
    var textarea = el("textarea", {
      class: "textarea grow", rows: "1", placeholder: "Votre message…",
      maxlength: Core.LIMITS.message, "data-draft": draftKey,
      oninput: function (e) { autoGrow(e.target); },
      onkeydown: function (e) {
        if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); send(); }
      }
    });

    function send() {
      var text = Utils.trim(textarea.value);
      if (!text) { return; }
      var quoteId = UI.local.quote && UI.local.quote.topicId === topic.id ? UI.local.quote.messageId : null;
      /* ⚠️ On vide le champ AVANT de déclencher l'action : le dispatch provoque
       * un rendu synchrone et la restauration des brouillons réinjecterait le
       * message déjà publié. */
      textarea.value = "";
      autoGrow(textarea);
      UI.local.quote = null;
      UI.local.scrollToBottom = true;
      App.actions.createMessage(topic.id, text, quoteId, UI.local.composerAnon);
    }

    var sendBtn = el("button", {
      class: "send-btn", type: "button", "aria-label": "Envoyer", text: "↑", onclick: send
    });

    var parts = [];
    if (UI.local.quote && UI.local.quote.topicId === topic.id) {
      var quoted = Core.findMessage(topic, UI.local.quote.messageId);
      if (quoted) {
        parts.push(el("div", { class: "quote-preview" }, [
          el("div", { class: "quote-body" }, [
            el("div", { class: "quote-author", text: "En réponse à " + quoted.authorName }),
            el("div", { class: "quote-text", text: quoted.text })
          ]),
          el("button", { class: "btn-icon", type: "button", "aria-label": "Annuler la citation", text: "✕", onclick: function () { UI.set({ quote: null }); } })
        ]));
      }
    }

    parts.push(el("div", { class: "signature-toggle" }, [
      el("span", { text: UI.local.composerAnon ? "Publier en anonyme" : "Publier signé : " + (App.user.name || "moi") }),
      el("button", {
        class: "btn btn-sm btn-outline", type: "button",
        text: UI.local.composerAnon ? "Signer" : "Anonyme",
        onclick: function () { UI.set({ composerAnon: !UI.local.composerAnon }); }
      })
    ]));

    parts.push(el("div", { class: "composer-inner" }, [textarea, sendBtn]));

    return el("div", { class: "composer" }, parts);
  }

  function screenTopic(topicId) {
    var topic = Core.findTopic(Store.view, topicId);
    if (!topic) { return screenMissing(); }

    var threadInner = el("div", { class: "thread-inner" });
    var previous = null;
    var lastDay = null;
    topic.messages.forEach(function (message) {
      if (!lastDay || !Utils.sameDay(lastDay, message.createdAt)) {
        threadInner.appendChild(el("div", { class: "day-sep", text: Utils.relativeDay(message.createdAt) }));
        lastDay = message.createdAt;
        previous = null;
      }
      threadInner.appendChild(messageRow(topic, message, previous));
      previous = message;
    });

    if (!topic.messages.length) {
      threadInner.appendChild(el("div", { class: "empty" }, [
        el("div", { class: "empty-title", text: "La discussion démarre ici" }),
        el("div", { class: "empty-text", text: "Partagez un constat, une idée, une question. Chacun peut réagir, citer et proposer." })
      ]));
    }

    var thread = el("div", { class: "thread", dataset: { thread: topic.id } }, [threadInner]);

    return el("div", { class: "screen chat" }, [
      topbar({
        title: topic.title,
        sub: Core.TOPIC_STATUS_LABELS[topic.status],
        back: function () { App.go("#/"); },
        backLabel: "Sujets",
        onTitle: function () { UI.set({ sheet: { type: "topicInfo", topicId: topic.id } }); },
        actions: [statusPill()]
      }),
      el("nav", { class: "quickbar" }, [
        el("button", {
          class: "btn", type: "button",
          text: "💡 Propositions" + (topic.proposals.length ? " (" + topic.proposals.length + ")" : ""),
          onclick: function () { App.go("#/topic/" + topic.id + "/proposals"); }
        }),
        el("button", {
          class: "btn", type: "button",
          text: "✓ Conclusion" + (topic.conclusions.length ? " (" + topic.conclusions.length + ")" : ""),
          onclick: function () { App.go("#/topic/" + topic.id + "/conclusion"); }
        })
      ]),
      thread,
      composer(topic)
    ]);
  }

  function screenMissing() {
    return el("div", { class: "screen" }, [
      topbar({ title: "Introuvable", back: function () { App.go("#/"); }, backLabel: "Sujets" }),
      el("div", { class: "content" }, [
        el("div", { class: "empty" }, [
          el("div", { class: "empty-title", text: "Ce contenu n'existe plus" }),
          el("button", { class: "btn btn-primary", type: "button", text: "Revenir aux sujets", onclick: function () { App.go("#/"); } })
        ])
      ])
    ]);
  }

  /* ------------------------------------------------------- Propositions --- */

  function proposalCard(topic, proposal) {
    var summary = Core.voteSummary(proposal);
    var myVote = proposal.votes[App.user.id] || null;
    var total = summary.total || 1;

    var statusSelect = el("select", { class: "select", "aria-label": "Statut de la proposition",
      onchange: function (e) { App.actions.changeProposalStatus(topic.id, proposal.id, e.target.value); }
    });
    Core.PROPOSAL_STATUSES.forEach(function (status) {
      statusSelect.appendChild(el("option", { value: status, selected: proposal.status === status, text: Core.PROPOSAL_STATUS_LABELS[status] }));
    });

    var voteButtons = el("div", { class: "vote-actions" });
    Core.VOTE_VALUES.forEach(function (value) {
      voteButtons.appendChild(el("button", {
        class: "btn btn-sm btn-outline" + (myVote === value ? " active" : ""), type: "button",
        text: Core.VOTE_LABELS[value],
        onclick: function () { App.actions.setVote(topic.id, proposal.id, value); }
      }));
    });

    return el("article", { class: "card card-static stack" }, [
      el("div", { class: "row", style: { alignItems: "flex-start" } }, [
        el("div", { class: "card-title", style: { flex: "1" }, text: proposal.title }),
        el("span", { class: "badge", text: Core.PROPOSAL_STATUS_LABELS[proposal.status] })
      ]),
      proposal.description ? el("div", { class: "pre-wrap", style: { fontSize: "14px" }, text: proposal.description }) : null,
      el("div", { class: "card-meta", text: "Proposé par " + proposal.authorName + " · " + Utils.formatDateTime(proposal.createdAt) }),
      el("div", { class: "vote-bar" }, [
        el("span", { class: "vote-for", style: { width: (summary.counts.for / total * 100) + "%" } }),
        el("span", { class: "vote-against", style: { width: (summary.counts.against / total * 100) + "%" } }),
        el("span", { class: "vote-abstain", style: { width: (summary.counts.abstain / total * 100) + "%" } })
      ]),
      el("div", { class: "card-meta", text: summary.label + " · " + summary.counts.for + " pour · " +
        summary.counts.against + " contre · " + summary.counts.abstain + " abstention" + (summary.counts.abstain > 1 ? "s" : "") +
        (summary.expressed ? " · " + summary.favorablePercent + " % favorables (hors abstentions)" : "") }),
      voteButtons,
      el("div", { class: "row-wrap" }, [
        myVote ? el("button", { class: "btn btn-sm btn-ghost", type: "button", text: "Retirer mon vote",
          onclick: function () { App.actions.removeVote(topic.id, proposal.id); } }) : null,
        App.ownsItem(proposal.id, proposal.authorId)
          ? el("button", { class: "btn btn-sm btn-ghost", type: "button", text: "Modifier",
            onclick: function () { UI.set({ modal: { type: "editProposal", topicId: topic.id, proposalId: proposal.id } }); } })
          : null,
        el("div", { class: "spacer" }),
        statusSelect
      ])
    ]);
  }

  function screenProposals(topicId) {
    var topic = Core.findTopic(Store.view, topicId);
    if (!topic) { return screenMissing(); }

    var list = el("div", { class: "stack" });
    if (!topic.proposals.length) {
      list.appendChild(el("div", { class: "empty" }, [
        el("div", { class: "empty-title", text: "Aucune proposition" }),
        el("div", { class: "empty-text", text: "Transformez les idées de la discussion en propositions concrètes à soumettre au vote." }),
        el("button", { class: "btn btn-primary", type: "button", text: "Ajouter une proposition",
          onclick: function () { UI.set({ modal: { type: "createProposal", topicId: topic.id } }); } })
      ]));
    } else {
      topic.proposals.forEach(function (proposal) { list.appendChild(proposalCard(topic, proposal)); });
    }

    var screen = el("div", { class: "screen" }, [
      topbar({
        title: "Propositions",
        sub: topic.title,
        back: function () { App.go("#/topic/" + topic.id); },
        backLabel: "Discussion",
        actions: [statusPill()]
      }),
      el("div", { class: "content" }, [list])
    ]);

    if (topic.proposals.length) {
      screen.appendChild(el("button", {
        class: "fab", type: "button", "aria-label": "Ajouter une proposition", text: "+",
        onclick: function () { UI.set({ modal: { type: "createProposal", topicId: topic.id } }); }
      }));
    }
    return screen;
  }

  /* --------------------------------------------------------- Conclusion --- */

  function screenConclusion(topicId) {
    var topic = Core.findTopic(Store.view, topicId);
    if (!topic) { return screenMissing(); }

    var scores = Core.conclusionScores(topic);
    var myVote = topic.conclusionVotes[App.user.id] || null;

    var list = el("div", { class: "stack" });

    topic.conclusions.forEach(function (conclusion) {
      var count = scores.scores[conclusion.id] || 0;
      var isLead = scores.best > 0 && count === scores.best;
      var mine = App.ownsItem(conclusion.id, conclusion.authorId);
      list.appendChild(el("article", { class: "card card-static stack" }, [
        el("div", { class: "row", style: { alignItems: "flex-start" } }, [
          el("div", { class: "pre-wrap", style: { flex: "1" }, text: conclusion.text }),
          isLead ? el("span", { class: "badge badge-ink lead", text: "★ En tête" }) : null
        ]),
        el("div", { class: "card-meta", text: conclusion.authorName + " · " + Utils.formatDateTime(conclusion.createdAt) +
          " · " + Utils.plural(count, "vote", "votes") }),
        el("div", { class: "row-wrap" }, [
          el("button", {
            class: "btn btn-sm " + (myVote === conclusion.id ? "btn-primary" : "btn-outline"), type: "button",
            text: myVote === conclusion.id ? "✓ Mon choix" : "Choisir",
            onclick: function () { App.actions.setConclusionVote(topic.id, conclusion.id); }
          }),
          mine ? el("button", { class: "btn btn-sm btn-ghost", type: "button", text: "Modifier",
            onclick: function () { UI.set({ modal: { type: "editConclusion", topicId: topic.id, conclusionId: conclusion.id } }); } }) : null,
          mine ? el("button", { class: "btn btn-sm btn-ghost", type: "button", text: "Supprimer",
            onclick: function () { UI.set({ modal: { type: "deleteConclusion", topicId: topic.id, conclusionId: conclusion.id } }); } }) : null
        ])
      ]));
    });

    if (!topic.conclusions.length) {
      list.appendChild(el("div", { class: "empty" }, [
        el("div", { class: "empty-title", text: "Pas encore de conclusion" }),
        el("div", { class: "empty-text", text: "Rédigez la synthèse à présenter en réunion. Chacun vote ensuite pour sa préférée." })
      ]));
    }

    var textarea = bindCounter(el("textarea", {
      class: "textarea", placeholder: "Nouvelle conclusion…", maxlength: Core.LIMITS.conclusion,
      "data-draft": "conclusion:" + topic.id
    }), "conclusion:" + topic.id, Core.LIMITS.conclusion);

    var addBlock = el("div", { class: "stack" }, [
      el("div", { class: "section-title", text: "Ajouter une conclusion" }),
      textarea,
      counterFor("conclusion:" + topic.id, Core.LIMITS.conclusion),
      el("button", {
        class: "btn btn-primary btn-block", type: "button", text: "Ajouter",
        onclick: function () {
          var text = Utils.trim(textarea.value);
          if (!text) { UI.toast("La conclusion est vide.", "error"); return; }
          textarea.value = "";
          App.actions.addConclusion(topic.id, text);
        }
      })
    ]);

    var myVoteHint = el("p", { class: "hint", text: myVote
      ? "Vous avez choisi une conclusion. Choisir une autre déplace votre vote."
      : "Choix unique : une seule conclusion par personne." });

    return el("div", { class: "screen" }, [
      topbar({
        title: "Conclusion",
        sub: topic.title,
        back: function () { App.go("#/topic/" + topic.id); },
        backLabel: "Discussion",
        actions: [statusPill()]
      }),
      el("div", { class: "content stack-lg" }, [myVoteHint, list, el("hr", { class: "divider" }), addBlock])
    ]);
  }

  /* ------------------------------------------------------------ Réunion --- */

  function screenMeeting() {
    var state = Store.view;
    var topics = state.topics.filter(function (t) { return t.status !== "archived"; });

    var doc = el("div", { class: "print-doc" }, [
      el("h1", { class: "print-h1", text: "BrainstO. — Préparation de réunion" }),
      el("p", { class: "hint", text: "Édité le " + Utils.formatDateTime(Utils.nowISO()) + " · " + Utils.plural(topics.length, "sujet", "sujets") })
    ]);

    if (!topics.length) {
      doc.appendChild(el("p", { class: "hint", text: "Aucun sujet à présenter." }));
    }

    topics.forEach(function (topic) {
      var block = el("section", { class: "print-topic" }, [
        el("h2", { class: "print-h2", text: topic.title }),
        el("div", { class: "card-meta", text: Core.TOPIC_STATUS_LABELS[topic.status] + " · proposé par " + topic.createdBy.name +
          " · " + Utils.plural(topic.messages.length, "message", "messages") })
      ]);
      if (topic.description) {
        block.appendChild(el("p", { class: "pre-wrap", text: topic.description }));
      }

      if (topic.proposals.length) {
        block.appendChild(el("h3", { class: "print-h3", text: "Propositions" }));
        var pl = el("ul", { class: "print-list" });
        topic.proposals.forEach(function (proposal) {
          var summary = Core.voteSummary(proposal);
          pl.appendChild(el("li", {}, [
            el("strong", { text: proposal.title }),
            el("span", { text: " — " + Core.PROPOSAL_STATUS_LABELS[proposal.status] + " · " + summary.label +
              " (" + summary.counts.for + " pour / " + summary.counts.against + " contre / " + summary.counts.abstain + " abst.)" }),
            proposal.description ? el("div", { class: "hint pre-wrap", text: proposal.description }) : null
          ]));
        });
        block.appendChild(pl);
      }

      if (topic.conclusions.length) {
        var scores = Core.conclusionScores(topic);
        block.appendChild(el("h3", { class: "print-h3", text: "Conclusions" }));
        var cl = el("ul", { class: "print-list" });
        topic.conclusions.slice().sort(function (a, b) {
          return (scores.scores[b.id] || 0) - (scores.scores[a.id] || 0);
        }).forEach(function (conclusion) {
          var count = scores.scores[conclusion.id] || 0;
          cl.appendChild(el("li", {}, [
            el("span", { class: "pre-wrap", text: conclusion.text }),
            el("span", { class: "hint", text: " — " + Utils.plural(count, "vote", "votes") +
              (scores.best > 0 && count === scores.best ? " · en tête" : "") })
          ]));
        });
        block.appendChild(cl);
      }

      doc.appendChild(block);
    });

    return el("div", { class: "screen" }, [
      topbar({
        title: "Réunion",
        sub: "Synthèse imprimable",
        back: function () { App.go("#/settings"); },
        backLabel: "Réglages",
        actions: [el("button", { class: "btn btn-sm btn-outline no-print", type: "button", text: "Imprimer", onclick: function () { window.print(); } })]
      }),
      el("div", { class: "content" }, [doc])
    ]);
  }

  /* ------------------------------------------------------------ Réglages --- */

  function screenSettings() {
    var diagnostics = Sync.diagnostics();

    var nameInput = el("input", {
      class: "input", type: "text", maxlength: Core.LIMITS.name,
      value: App.user.name || "", "data-draft": "settings:name"
    });

    var connectionRows = el("div", { class: "stack" }, [
      el("div", { class: "card card-static stack" }, [
        el("div", { class: "section-title", text: "Connexion" }),
        el("div", { class: "hint", text: Sync.connection.localMode || !Sync.connection.url
          ? "Mode local : les données restent sur cet appareil."
          : "Connecté à l'espace de l'équipe." }),
        el("button", { class: "btn btn-outline btn-block", type: "button", text: "Modifier l'adresse ou le code",
          onclick: function () { App.editConnection(); } }),
        el("button", { class: "btn btn-danger btn-block", type: "button", text: "Se déconnecter de l'équipe",
          onclick: function () { UI.set({ modal: { type: "logout" } }); } })
      ])
    ]);

    var diagRows = el("div", { class: "card card-static stack" }, [
      el("div", { class: "section-title", text: "Diagnostic de synchronisation" }),
      el("div", { class: "row" }, [statusPill(), el("div", { class: "spacer" }),
        el("button", { class: "btn btn-sm btn-outline", type: "button", text: "Synchroniser", onclick: function () { Sync.now(); UI.toast("Synchronisation lancée."); } })]),
      el("div", { class: "card-meta", text: "Révision : " + diagnostics.revision }),
      el("div", { class: "card-meta", text: "Dernière mise à jour : " + (diagnostics.updatedAt ? Utils.formatDateTime(diagnostics.updatedAt) : "—") }),
      el("div", { class: "card-meta", text: "Actions en attente : " + diagnostics.pending.length +
        (diagnostics.pending.length ? " (" + diagnostics.pending.map(function (p) { return p.type; }).join(", ") + ")" : "") }),
      el("div", { class: "card-meta", text: "Stockage local : " + (diagnostics.persistent ? "IndexedDB" : "mémoire (non persistant)") }),
      diagnostics.status.error ? el("div", { class: "card-meta", style: { color: "var(--danger)" }, text: "Dernière erreur : " + diagnostics.status.error }) : null,
      el("div", { class: "card-meta", text: "Version de l'application : " + CONFIG.APP_VERSION })
    ]);

    return el("div", { class: "screen" }, [
      topbar({ title: "Réglages", back: function () { App.go("#/"); }, backLabel: "Sujets", actions: [statusPill()] }),
      el("div", { class: "content stack-lg" }, [
        el("div", { class: "card card-static stack" }, [
          el("div", { class: "section-title", text: "Votre nom" }),
          nameInput,
          el("button", { class: "btn btn-primary btn-block", type: "button", text: "Enregistrer",
            onclick: function () { App.saveName(nameInput.value, true); } })
        ]),
        connectionRows,
        el("div", { class: "card card-static stack" }, [
          el("div", { class: "section-title", text: "Réunion" }),
          el("div", { class: "hint", text: "Synthèse de tous les sujets, prête à imprimer ou à projeter." }),
          el("button", { class: "btn btn-outline btn-block", type: "button", text: "Ouvrir la synthèse",
            onclick: function () { App.go("#/meeting"); } })
        ]),
        diagRows
      ])
    ]);
  }

  /* ========================================================= OVERLAYS ==== */

  function messageSheet(spec) {
    var topic = Core.findTopic(Store.view, spec.topicId);
    var message = topic ? Core.findMessage(topic, spec.messageId) : null;
    if (!message) { return null; }

    var mine = App.ownsMessage(message);
    var locked = Core.isMessageLocked(message, App.user.id);

    var emojiRow = el("div", { class: "emoji-row" });
    Core.REACTIONS.forEach(function (emoji) {
      var isMine = message.reactions[App.user.id] === emoji;
      emojiRow.appendChild(el("button", {
        class: "emoji-btn" + (isMine ? " mine" : ""), type: "button", "aria-label": "Réagir " + emoji, text: emoji,
        onclick: function () {
          App.actions.setReaction(topic.id, message.id, emoji);
          UI.set({ sheet: null });
        }
      }));
    });

    var actions = el("div", { class: "sheet-actions" }, [
      sheetAction("❝", "Citer", function () {
        UI.set({ sheet: null, quote: { topicId: topic.id, messageId: message.id } });
        var node = findDraftNode("composer:" + topic.id);
        if (node) { node.focus(); }
      }),
      sheetAction("💡", "Créer une proposition", function () {
        UI.set({ sheet: null, modal: { type: "createProposal", topicId: topic.id, fromText: message.text } });
      }),
      mine ? sheetAction("✎", locked ? "Modifier (verrouillé 🔒)" : "Modifier", function () {
        if (locked) { UI.toast("Message verrouillé : quelqu'un y a déjà réagi.", "error"); return; }
        UI.set({ sheet: null, modal: { type: "editMessage", topicId: topic.id, messageId: message.id } });
      }, { disabled: false }) : null,
      mine ? sheetAction(message.anon ? "🙂" : "🎭", message.anon ? "Signer avec mon nom" : "Rendre anonyme", function () {
        App.actions.setMessageSignature(topic.id, message.id, !message.anon);
        UI.set({ sheet: null });
      }) : null
    ]);

    var info = [];
    info.push(message.authorName);
    info.push(Utils.formatDateTime(message.createdAt));
    if (locked) { info.push("verrouillé"); }

    return sheet(info.join(" · "), el("div", {}, [emojiRow, actions]));
  }

  function topicInfoSheet(spec) {
    var topic = Core.findTopic(Store.view, spec.topicId);
    if (!topic) { return null; }

    var statusSelect = el("select", { class: "select", "aria-label": "Statut du sujet",
      onchange: function (e) { App.actions.changeTopicStatus(topic.id, e.target.value); }
    });
    Core.TOPIC_STATUSES.forEach(function (status) {
      statusSelect.appendChild(el("option", { value: status, selected: topic.status === status, text: Core.TOPIC_STATUS_LABELS[status] }));
    });

    return sheet(topic.title, el("div", { class: "stack" }, [
      el("div", { class: "card-meta", text: "Proposé par " + topic.createdBy.name + " · " + Utils.formatDateTime(topic.createdAt) }),
      topic.description
        ? el("div", { class: "pre-wrap", text: topic.description })
        : el("div", { class: "hint", text: "Aucune description." }),
      field("Statut", statusSelect),
      el("button", { class: "btn btn-outline btn-block", type: "button", text: "Modifier le sujet",
        onclick: function () { UI.set({ sheet: null, modal: { type: "editTopic", topicId: topic.id } }); } })
    ]));
  }

  function createTopicModal() {
    var titleInput = bindCounter(el("input", {
      class: "input", type: "text", maxlength: Core.LIMITS.topicTitle,
      placeholder: "Titre du sujet", "data-draft": "newTopic:title"
    }), "newTopic:title", Core.LIMITS.topicTitle);

    var descInput = el("textarea", {
      class: "textarea", maxlength: Core.LIMITS.topicDescription,
      placeholder: "Description (facultative)", "data-draft": "newTopic:desc"
    });

    var nameInput = el("input", {
      class: "input", type: "text", maxlength: Core.LIMITS.name,
      value: App.user.name || "", "data-draft": "newTopic:name"
    });

    return modal("Nouveau sujet", el("div", { class: "stack" }, [
      field("Titre (obligatoire)", titleInput),
      counterFor("newTopic:title", Core.LIMITS.topicTitle),
      field("Description", descInput),
      field("Votre nom", nameInput, "Laissez vide pour publier ce sujet en anonyme : aucune identité ne sera enregistrée.")
    ]), [
      el("button", { class: "btn btn-outline", type: "button", text: "Annuler", onclick: closeOverlay }),
      el("button", {
        class: "btn btn-primary", type: "button", text: "Créer",
        onclick: function () {
          var title = Utils.trim(titleInput.value);
          if (!title) { UI.toast("Le titre du sujet est obligatoire.", "error"); return; }
          App.actions.createTopic(title, descInput.value, Utils.trim(nameInput.value));
        }
      })
    ]);
  }

  function editTopicModal(spec) {
    var topic = Core.findTopic(Store.view, spec.topicId);
    if (!topic) { return null; }
    var titleInput = el("input", {
      class: "input", type: "text", maxlength: Core.LIMITS.topicTitle,
      value: topic.title, "data-draft": "editTopic:title:" + topic.id
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
          if (!title) { UI.toast("Le titre du sujet est obligatoire.", "error"); return; }
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
      value: message.text, "data-draft": "editMessage:" + message.id
    });
    return modal("Modifier le message", el("div", { class: "stack" }, [textarea]), [
      el("button", { class: "btn btn-outline", type: "button", text: "Annuler", onclick: closeOverlay }),
      el("button", {
        class: "btn btn-primary", type: "button", text: "Enregistrer",
        onclick: function () {
          var text = Utils.trim(textarea.value);
          if (!text) { UI.toast("Le message est vide.", "error"); return; }
          App.actions.updateMessage(topic.id, message.id, text);
        }
      })
    ]);
  }

  function proposalModal(spec) {
    var topic = Core.findTopic(Store.view, spec.topicId);
    if (!topic) { return null; }
    var existing = spec.proposalId ? Core.findProposal(topic, spec.proposalId) : null;
    var keyBase = existing ? "editProposal:" + existing.id : "newProposal:" + topic.id;

    var initialTitle = existing ? existing.title : Utils.limit(spec.fromText || "", Core.LIMITS.proposalTitle);
    var initialDesc = existing ? existing.description : "";

    var titleInput = el("input", {
      class: "input", type: "text", maxlength: Core.LIMITS.proposalTitle,
      placeholder: "Titre de la proposition", value: initialTitle, "data-draft": keyBase + ":title"
    });
    var descInput = el("textarea", {
      class: "textarea", maxlength: Core.LIMITS.proposalDescription,
      placeholder: "Description (facultative)", value: initialDesc, "data-draft": keyBase + ":desc"
    });

    return modal(existing ? "Modifier la proposition" : "Nouvelle proposition", el("div", { class: "stack" }, [
      field("Titre", titleInput),
      field("Description", descInput)
    ]), [
      el("button", { class: "btn btn-outline", type: "button", text: "Annuler", onclick: closeOverlay }),
      el("button", {
        class: "btn btn-primary", type: "button", text: existing ? "Enregistrer" : "Créer",
        onclick: function () {
          var title = Utils.trim(titleInput.value);
          if (!title) { UI.toast("Le titre de la proposition est obligatoire.", "error"); return; }
          if (existing) { App.actions.updateProposal(topic.id, existing.id, title, descInput.value); }
          else { App.actions.createProposal(topic.id, title, descInput.value); }
        }
      })
    ]);
  }

  function editConclusionModal(spec) {
    var topic = Core.findTopic(Store.view, spec.topicId);
    var conclusion = topic ? Core.findConclusion(topic, spec.conclusionId) : null;
    if (!conclusion) { return null; }
    var textarea = el("textarea", {
      class: "textarea", maxlength: Core.LIMITS.conclusion,
      value: conclusion.text, "data-draft": "editConclusion:" + conclusion.id
    });
    return modal("Modifier la conclusion", el("div", { class: "stack" }, [textarea]), [
      el("button", { class: "btn btn-outline", type: "button", text: "Annuler", onclick: closeOverlay }),
      el("button", {
        class: "btn btn-primary", type: "button", text: "Enregistrer",
        onclick: function () {
          var text = Utils.trim(textarea.value);
          if (!text) { UI.toast("La conclusion est vide.", "error"); return; }
          App.actions.updateConclusion(topic.id, conclusion.id, text);
        }
      })
    ]);
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
    } else if (UI.local.modal) {
      var m = UI.local.modal;
      if (m.type === "createTopic") { node = createTopicModal(); }
      else if (m.type === "editTopic") { node = editTopicModal(m); }
      else if (m.type === "editMessage") { node = editMessageModal(m); }
      else if (m.type === "createProposal" || m.type === "editProposal") { node = proposalModal(m); }
      else if (m.type === "editConclusion") { node = editConclusionModal(m); }
      else if (m.type === "deleteConclusion") {
        node = confirmModal("Supprimer la conclusion",
          "La conclusion et les votes qui la visaient seront supprimés.",
          "Supprimer", function () { App.actions.deleteConclusion(m.topicId, m.conclusionId); });
      } else if (m.type === "logout") {
        node = confirmModal("Se déconnecter de l'équipe",
          "L'adresse du script et le déverrouillage seront oubliés sur cet appareil. Les données de l'équipe restent sur Google Drive.",
          "Se déconnecter", function () { App.logout(); });
      }
    }

    if (node) { overlayRoot.appendChild(node); }
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
    if (route.name === "settings") { return screenSettings(); }
    if (route.name === "meeting") { return screenMeeting(); }
    return screenTopics();
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

  UI.render = function () {
    if (!appRoot) { return; }
    var sig = signature();
    if (!forceNext && sig === lastSignature) { return; }
    forceNext = false;
    lastSignature = sig;

    var drafts = captureDrafts();

    /* Position de défilement du fil de discussion. */
    var thread = document.querySelector(".thread");
    var scrollTop = thread ? thread.scrollTop : 0;
    var threadKey = thread ? thread.getAttribute("data-thread") : null;
    var atBottom = thread ? (thread.scrollHeight - thread.scrollTop - thread.clientHeight) < 80 : true;

    Utils.clear(appRoot);
    appRoot.appendChild(currentScreen());
    renderOverlay();
    restoreDrafts(drafts);

    var newThread = document.querySelector(".thread");
    if (newThread) {
      var sameThread = newThread.getAttribute("data-thread") === threadKey;
      if (!sameThread || UI.local.scrollToBottom || atBottom) {
        newThread.scrollTop = newThread.scrollHeight;
      } else {
        newThread.scrollTop = scrollTop;
      }
      UI.local.scrollToBottom = false;
    }

    UI.refreshStatus();
  };

  /* -------------------------------------------------- Bandeau nouvelle version --- */

  UI.showUpdateBanner = function (onUpdate) {
    if (document.querySelector(".update-banner")) { return; }
    var banner = el("div", { class: "update-banner" }, [
      el("span", { style: { flex: "1" }, text: "Une nouvelle version est disponible." }),
      el("button", {
        class: "btn btn-sm btn-primary", type: "button", text: "Mettre à jour",
        onclick: function () { banner.remove(); onUpdate(); }
      }),
      el("button", { class: "btn-icon", type: "button", "aria-label": "Plus tard", text: "✕", onclick: function () { banner.remove(); } })
    ]);
    document.body.appendChild(banner);
  };

  root.UI = UI;
})(typeof globalThis !== "undefined" ? globalThis : this);
