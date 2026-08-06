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
   * Règle : l'état PAR DÉFAUT reste neutre. « En discussion » et « En vote »
   * concernent la quasi-totalité des éléments ; les teinter saturerait toute
   * la liste et plus rien ne ressortirait. La couleur est réservée à ce qui
   * demande une action ou signale une issue. */
  var TOPIC_TONES = {
    open: "tone-neutral",
    ready: "tone-success",
    closed: "tone-info",
    archived: "tone-neutral"
  };

  var PROPOSAL_TONES = {
    voting: "tone-neutral",
    selected: "tone-success",
    debate: "tone-warning",
    implemented: "tone-success",
    rejected: "tone-danger"
  };

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

  function emptyState(iconName, title, text, action) {
    return el("div", { class: "empty" }, [
      el("div", { class: "empty-art" }, [icon(iconName, 32)]),
      el("div", { class: "empty-title", text: title }),
      text ? el("div", { class: "empty-text", text: text }) : null,
      action || null
    ]);
  }

  /* Logotype animé caractère par caractère (écrans vides uniquement). */
  function wordmark(text) {
    var node = el("div", { class: "wordmark", "aria-label": text });
    node.appendChild(Utils.splitChars(text, "wm-char"));
    return node;
  }

  function heroBlock(tagline) {
    return el("div", { class: "hero" }, [
      Utils.logoMark(52),
      wordmark(CONFIG.APP_NAME),
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
  var lastSignature = null;
  var lastPlace = null;
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
    bindViewport();
  };

  /* ------------------------------------------------------------ Brouillons --- */

  /* Les brouillons ne vivent que dans le DOM, et l'instantané ne franchit pas un
   * rendu : au reverrouillage (3 minutes en arrière-plan), l'écran de verrou ne
   * contient aucun champ « composer:… », la valeur est donc jetée et le message
   * en cours d'écriture est perdu — ce que la recette annonce pourtant intact.
   * Ce relais garde les seuls brouillons de composeur d'un rendu à l'autre. */
  var composerDrafts = {};

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

  function restoreDrafts(snapshot) {
    var nodes = document.querySelectorAll("[data-draft]");
    for (var i = 0; i < nodes.length; i++) {
      var node = nodes[i];
      var key = node.getAttribute("data-draft");
      var saved = snapshot.values[key];
      /* Repli sur le relais quand l'instantané ne connaît pas la clé : c'est le
       * cas au retour de l'écran de verrou, qui n'a rendu aucun composeur. */
      if (saved === undefined) { saved = composerDrafts[key]; }
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
      }, [icon("back", 20), el("span", { text: backLabel })]));
    }
    var titles = el("div", { class: "topbar-titles" });
    if (options.onTitle) {
      var titleBtn = el("button", {
        class: "btn-ghost", type: "button",
        style: { padding: "0", textAlign: "left", width: "100%", minHeight: "auto", background: "transparent", border: "0", cursor: "pointer" },
        onclick: options.onTitle
      }, [
        el("div", { class: "topbar-title", text: options.title }),
        el("div", { class: "topbar-sub" }, [el("span", { text: options.sub || "" }), icon("info", 13)])
      ]);
      titles.appendChild(titleBtn);
    } else {
      titles.appendChild(el("div", { class: "topbar-title", text: options.title }));
      if (options.sub) {
        titles.appendChild(el("div", { class: "topbar-sub" }, [el("span", { text: options.sub })]));
      }
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
        title ? (title instanceof Node ? title : el("div", { class: "sheet-title", text: title })) : null,
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
      el("div", { class: "modal", role: "dialog", "aria-modal": "true" }, [
        el("div", { class: "modal-title", text: title }),
        children,
        el("div", { class: "modal-actions" }, actions)
      ])
    ]);
  }

  function sheetAction(iconName, label, onclick, options) {
    options = options || {};
    return el("button", {
      class: "sheet-action" + (options.danger ? " danger" : ""),
      type: "button",
      disabled: options.disabled,
      onclick: onclick
    }, [icon(iconName, 20), el("span", { text: label })]);
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
        heroBlock("Préparer les réunions de l'équipe, ensemble."),
        reveal(el("div", { class: "card card-static stack" }, [
          sectionTitle("link", "Rejoindre l'espace de l'équipe"),
          field("Adresse du script de l'équipe", urlInput,
            "Cette adresse vous est communiquée par la personne qui a installé BrainstO. Elle reste sur cet appareil."),
          field("Code d'accès", codeInput,
            "Laissez vide si aucun code n'a été configuré. Le code n'est jamais enregistré sur l'appareil."),
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
        reveal(el("div", { class: "card card-static stack" }, [
          sectionTitle("user", "Votre identité"),
          el("h2", { text: "Comment vous appelez-vous ?" }),
          el("p", { class: "hint", text: "Votre nom apparaît à côté de vos messages. Vous pourrez le changer et publier des messages anonymes à tout moment." }),
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
      placeholder: "Code d'accès", "data-draft": "lock:code",
      onkeydown: function (e) { if (e.key === "Enter") { App.unlock(codeInput.value); } }
    });

    return el("div", { class: "screen" }, [
      el("div", { class: "content stack-lg" }, [
        heroBlock("Espace de l'équipe verrouillé"),
        reveal(el("div", { class: "card card-static stack" }, [
          sectionTitle("lock", "Verrou de l'équipe"),
          field("Code d'accès", codeInput,
            "Le code vous est communiqué par l'équipe. Il n'est jamais enregistré sur cet appareil. "
            + "Une fois déverrouillé, l'accès reste ouvert : le code n'est redemandé qu'après une "
            + "heure sans activité."),
          el("button", {
            class: "btn btn-primary btn-block", type: "button",
            onclick: function () { App.unlock(codeInput.value); }
          }, [icon("unlock", 18), el("span", { text: "Déverrouiller" })])
        ]), 1),
        reveal(el("button", {
          class: "btn btn-ghost btn-block", type: "button", text: "Se déconnecter de l'équipe",
          onclick: function () { UI.set({ modal: { type: "logout" } }); }
        }), 2)
      ])
    ]);
  }

  /* -------------------------------------------------------- Liste des sujets --- */

  /* Compteur illustré : une icône + un nombre se lisent plus vite qu'une
   * énumération en toutes lettres, et la carte reste calme. */
  function countChip(iconName, count, label) {
    return el("span", { class: "legend-chip", title: Utils.plural(count, label, label + "s") }, [
      icon(iconName, 13),
      el("span", { text: String(count) })
    ]);
  }

  function topicCard(topic) {
    /* Un compteur à zéro n'apprend rien : on ne montre que ce qui existe, et
     * un sujet encore vide le dit avec des mots. */
    var counts = el("div", { class: "row-wrap", style: { gap: "6px" } }, [
      topic.messages.length ? countChip("users", topic.messages.length, "message") : null,
      topic.proposals.length ? countChip("idea", topic.proposals.length, "proposition") : null,
      topic.conclusions.length ? countChip("checkCircle", topic.conclusions.length, "conclusion") : null
    ]);
    if (!counts.childNodes.length) {
      counts.appendChild(el("span", { class: "legend-chip", text: "Rien encore" }));
    }

    return el("button", {
      class: "card", type: "button",
      onclick: function () { App.go("#/topic/" + topic.id); }
    }, [
      el("div", { class: "row", style: { gap: "10px", alignItems: "flex-start" } }, [
        el("div", { class: "card-title", style: { flex: "1" }, text: topic.title }),
        toneBadge(Core.TOPIC_STATUS_LABELS[topic.status], TOPIC_TONES[topic.status])
      ]),
      topic.description ? el("div", { class: "card-desc", text: topic.description }) : null,
      el("div", { class: "card-foot" }, [
        counts,
        el("div", { class: "spacer" }),
        el("span", { class: "card-meta", style: { marginTop: "0" }, text: topic.createdBy.name }),
        icon("forward", 16)
      ])
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
      body = emptyState("sparkle", "Aucun sujet pour l'instant",
        "Lancez la préparation de la prochaine réunion en ajoutant un premier sujet.",
        el("button", {
          class: "btn btn-primary", type: "button",
          onclick: function () { UI.set({ modal: { type: "createTopic" } }); }
        }, [icon("plus", 18), el("span", { text: "Ajouter un sujet" })]));
    } else {
      var list = el("div", { class: "stack topics-grid" });
      var index = 0;
      if (all.length > CONFIG.SEARCH_THRESHOLD) {
        var search = el("input", {
          class: "input", type: "search", placeholder: "Rechercher un sujet",
          "data-draft": "topics:search", value: UI.local.search,
          oninput: Utils.debounce(function (e) { UI.set({ search: e.target.value }); }, 180)
        });
        list.appendChild(el("div", { class: "search-wrap" }, [
          el("span", { class: "search-icon" }, [icon("search", 19)]), search
        ]));
      }
      if (!visible.length) {
        list.appendChild(el("p", { class: "hint", text: "Aucun sujet ne correspond." }));
      }
      visible.forEach(function (topic) { list.appendChild(reveal(topicCard(topic), index++)); });
      if (archivedCount > 0) {
        list.appendChild(el("button", {
          class: "btn btn-ghost btn-block", type: "button",
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
        actions: [
          statusPill(),
          el("button", { class: "btn-icon", type: "button", "aria-label": "Réglages",
            onclick: function () { App.go("#/settings"); } }, [icon("settings", 21)])
        ]
      }),
      el("div", { class: "content" }, [body])
    ]);

    if (all.length) {
      screen.appendChild(el("button", {
        class: "fab", type: "button", "aria-label": "Ajouter un sujet",
        onclick: function () { UI.set({ modal: { type: "createTopic" } }); }
      }, [icon("plus", 20), el("span", { text: "Nouveau sujet" })]));
    }
    return screen;
  }

  /* ------------------------------------------------------- Écran débat --- */

  function messageGroupKey(message, mine) {
    if (message.anon) { return "anon:" + (mine ? "me:" : "") + message.id; }
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
      var label = Utils.reactionLabel(emoji);
      row.appendChild(el("button", {
        class: "reaction" + (info.mine ? " mine" : ""), type: "button",
        title: label + " · " + Utils.plural(info.count, "personne", "personnes"),
        "aria-label": label + " (" + Utils.plural(info.count, "personne", "personnes") + ")",
        "aria-pressed": info.mine ? "true" : "false",
        onclick: function (e) { e.stopPropagation(); App.actions.setReaction(topic.id, message.id, emoji); }
      }, [
        Utils.reactionMark(emoji, 17),
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
      /* Repris dans le nom accessible de la bulle : le laisser lisible ici le
       * ferait annoncer deux fois. */
      col.appendChild(el("div", { class: "msg-author", "aria-hidden": "true", text: message.authorName }));
    }

    var locked = mine && Core.isMessageLocked(message, App.user.id);
    var metaBits = [];
    if (mine && message.anon) { metaBits.push("Anonyme"); }
    metaBits.push(Utils.formatTime(message.createdAt));
    if (message.updatedAt && message.updatedAt !== message.createdAt) { metaBits.push("modifié"); }

    /* L'auteur figure TOUJOURS dans le nom accessible : le regroupement est une
     * économie visuelle, pas une raison de priver le lecteur d'écran de
     * l'attribution. Sans lui, un message groupé s'annonce « d'accord aussi,
     * 14:33, bouton » sans dire de qui, et mes propres messages n'ont jamais
     * d'auteur du tout. Le cadenas, lui, est un SVG masqué : sans la mention
     * explicite, l'état verrouillé n'existe que pour l'œil. */
    var bubble = el("button", {
      class: "bubble", type: "button", dataset: { messageId: message.id },
      onclick: function () { UI.set({ sheet: { type: "message", topicId: topic.id, messageId: message.id } }); }
    }, [
      el("span", { class: "visually-hidden", text: (mine ? "Vous" : message.authorName) + ". " }),
      message.quoteId ? quoteBlock(topic, message) : null,
      el("div", { class: "bubble-text", text: message.text }),
      el("div", { class: "bubble-meta" }, [
        el("span", { text: metaBits.join(" · ") }),
        locked ? icon("lock", 12) : null
      ]),
      locked ? el("span", { class: "visually-hidden", text: ", verrouillé" }) : null,
      el("span", { class: "visually-hidden", text: ". Actions du message." })
    ]);

    col.appendChild(bubble);
    var reactions = reactionsRow(topic, message);
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

  UI.scrollToMessage = function (messageId) {
    var nodes = document.querySelectorAll("[data-message-id]");
    for (var i = 0; i < nodes.length; i++) {
      if (nodes[i].getAttribute("data-message-id") === messageId) {
        nodes[i].scrollIntoView({ block: "center", behavior: "smooth" });
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
      /* Le relais de brouillons doit être purgé ici aussi : sinon il réinjecte
       * au rendu suivant le message que l'on vient de publier — exactement le
       * piège que l'ordre ci-dessus évite pour l'instantané. */
      delete composerDrafts[draftKey];
      autoGrow(textarea);
      UI.local.quote = null;
      UI.local.scrollToBottom = true;
      App.actions.createMessage(topic.id, text, quoteId, UI.local.composerAnon);
    }

    var sendBtn = el("button", {
      class: "send-btn", type: "button", "aria-label": "Envoyer", onclick: send
    }, [icon("send", 20)]);

    var parts = [];
    if (UI.local.quote && UI.local.quote.topicId === topic.id) {
      var quoted = Core.findMessage(topic, UI.local.quote.messageId);
      if (quoted) {
        parts.push(el("div", { class: "quote-preview" }, [
          el("div", { class: "quote-body" }, [
            el("div", { class: "quote-author", text: "En réponse à " + quoted.authorName }),
            el("div", { class: "quote-text", text: quoted.text })
          ]),
          el("button", { class: "btn-icon", type: "button", "aria-label": "Annuler la citation",
            onclick: function () { UI.set({ quote: null }); } }, [icon("close", 18)])
        ]));
      }
    }

    parts.push(el("div", { class: "signature-toggle" }, [
      el("span", { class: "who" }, [
        icon(UI.local.composerAnon ? "mask" : "user", 15),
        el("span", { text: UI.local.composerAnon ? "Publié en anonyme" : "Signé : " + (App.user.name || "moi") })
      ]),
      el("button", {
        class: "btn btn-sm btn-outline", type: "button",
        onclick: function () { UI.set({ composerAnon: !UI.local.composerAnon }); }
      }, [
        icon(UI.local.composerAnon ? "user" : "mask", 15),
        el("span", { text: UI.local.composerAnon ? "Signer" : "Anonyme" })
      ])
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
      threadInner.appendChild(emptyState("users", "La discussion démarre ici",
        "Partagez un constat, une idée, une question. Chacun peut réagir, citer et proposer."));
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
          topic.conclusions.length ? el("span", { class: "badge tone-neutral", text: String(topic.conclusions.length) }) : null
        ])
      ]),
      thread,
      composer(topic)
    ]);
  }

  function screenMissing() {
    return el("div", { class: "screen" }, [
      topbar({ title: "Introuvable", back: function () { App.go("#/"); }, backLabel: "Sujets" }),
      el("div", { class: "content" }, [
        emptyState("warning", "Ce contenu n'existe plus",
          "Il a peut-être été supprimé ou archivé par un autre membre de l'équipe.",
          el("button", { class: "btn btn-primary", type: "button", text: "Revenir aux sujets",
            onclick: function () { App.go("#/"); } }))
      ])
    ]);
  }

  /* ------------------------------------------------------- Propositions --- */

  function proposalCard(topic, proposal) {
    var summary = Core.voteSummary(proposal);
    var myVote = proposal.votes[App.user.id] || null;
    var total = summary.total || 1;

    /* Le titre entre dans le nom : dans une liste de propositions, cinq
     * contrôles nommés « Statut de la proposition » sont indiscernables au
     * balayage, et on change le statut de la mauvaise. Le changement part vers
     * toute l'équipe sans confirmation : il doit au moins être annoncé — le
     * libellé est lu AVANT l'envoi, qui provoque un rendu détruisant ce nœud. */
    var statusSelect = el("select", {
      class: "select", "aria-label": "Statut de la proposition : " + proposal.title,
      onchange: function (e) {
        var label = Core.PROPOSAL_STATUS_LABELS[e.target.value];
        App.actions.changeProposalStatus(topic.id, proposal.id, e.target.value);
        UI.toast(proposal.title + " : " + label + ".");
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
        "aria-pressed": myVote === value ? "true" : "false",
        onclick: function () { App.actions.setVote(topic.id, proposal.id, value); }
      }, [icon(VOTE_ICONS[value], 15), el("span", { text: Core.VOTE_LABELS[value] })]));
    });

    /* Légende sous la barre : chaque couleur est nommée et chiffrée. Une barre
     * seule oblige à deviner ce que veut dire le rouge. */
    var legend = el("div", { class: "vote-legend" }, [
      el("span", { class: "legend-chip legend-for" }, [el("span", { class: "swatch" }), el("span", { text: summary.counts.for + " pour" })]),
      el("span", { class: "legend-chip legend-against" }, [el("span", { class: "swatch" }), el("span", { text: summary.counts.against + " contre" })]),
      el("span", { class: "legend-chip legend-abstain" }, [el("span", { class: "swatch" }),
        el("span", { text: summary.counts.abstain + " abstention" + (summary.counts.abstain > 1 ? "s" : "") })]),
      summary.expressed
        ? el("span", { class: "legend-chip", text: summary.favorablePercent + " % favorables" })
        : null
    ]);

    return el("article", { class: "card card-static stack" }, [
      el("div", { class: "row", style: { alignItems: "flex-start", gap: "10px" } }, [
        el("div", { class: "card-title", style: { flex: "1" }, text: proposal.title }),
        toneBadge(Core.PROPOSAL_STATUS_LABELS[proposal.status], PROPOSAL_TONES[proposal.status])
      ]),
      proposal.description ? el("div", { class: "pre-wrap", style: { fontSize: "14px", color: "var(--muted)" }, text: proposal.description }) : null,
      el("div", { class: "card-meta" }, [
        icon("user", 13),
        el("span", { text: proposal.authorName }),
        el("span", { class: "meta-dot" }),
        el("span", { text: Utils.formatDateTime(proposal.createdAt) })
      ]),
      el("div", {}, [
        el("div", { class: "vote-bar", role: "img", "aria-label": summary.label }, [
          el("span", { class: "vote-for", style: { width: (summary.counts.for / total * 100) + "%" } }),
          el("span", { class: "vote-against", style: { width: (summary.counts.against / total * 100) + "%" } }),
          el("span", { class: "vote-abstain", style: { width: (summary.counts.abstain / total * 100) + "%" } })
        ]),
        legend
      ]),
      voteButtons,
      el("div", { class: "card-foot row-wrap" }, [
        myVote ? el("button", { class: "btn btn-sm btn-ghost", type: "button",
          onclick: function () { App.actions.removeVote(topic.id, proposal.id); } },
        [icon("close", 15), el("span", { text: "Retirer mon vote" })]) : null,
        App.ownsItem(proposal.id, proposal.authorId)
          ? el("button", { class: "btn btn-sm btn-ghost", type: "button",
            onclick: function () { UI.set({ modal: { type: "editProposal", topicId: topic.id, proposalId: proposal.id } }); } },
          [icon("edit", 15), el("span", { text: "Modifier" })])
          : null,
        el("div", { class: "spacer" }),
        selectWrap(statusSelect)
      ])
    ]);
  }

  function screenProposals(topicId) {
    var topic = Core.findTopic(Store.view, topicId);
    if (!topic) { return screenMissing(); }

    var list = el("div", { class: "stack" });
    if (!topic.proposals.length) {
      list.appendChild(emptyState("idea", "Aucune proposition",
        "Transformez les idées de la discussion en propositions concrètes à soumettre au vote.",
        el("button", { class: "btn btn-primary", type: "button",
          onclick: function () { UI.set({ modal: { type: "createProposal", topicId: topic.id } }); } },
        [icon("plus", 18), el("span", { text: "Ajouter une proposition" })])));
    } else {
      topic.proposals.forEach(function (proposal, i) { list.appendChild(reveal(proposalCard(topic, proposal), i)); });
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
        class: "fab", type: "button", "aria-label": "Ajouter une proposition",
        onclick: function () { UI.set({ modal: { type: "createProposal", topicId: topic.id } }); }
      }, [icon("plus", 20), el("span", { text: "Proposition" })]));
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

    topic.conclusions.forEach(function (conclusion, i) {
      var count = scores.scores[conclusion.id] || 0;
      var isLead = scores.best > 0 && count === scores.best;
      var mine = App.ownsItem(conclusion.id, conclusion.authorId);
      var chosen = myVote === conclusion.id;
      list.appendChild(reveal(el("article", { class: "card card-static stack" + (isLead ? " is-lead" : "") }, [
        el("div", { class: "row", style: { alignItems: "flex-start", gap: "10px" } }, [
          el("div", { class: "pre-wrap", style: { flex: "1" }, text: conclusion.text }),
          isLead ? el("span", { class: "badge badge-ink lead" }, [icon("star", 13), el("span", { text: "En tête" })]) : null
        ]),
        el("div", { class: "card-meta" }, [
          icon("user", 13),
          el("span", { text: conclusion.authorName }),
          el("span", { class: "meta-dot" }),
          el("span", { text: Utils.formatDateTime(conclusion.createdAt) }),
          el("span", { class: "meta-dot" }),
          el("span", { text: Utils.plural(count, "vote", "votes") })
        ]),
        el("div", { class: "card-foot row-wrap" }, [
          el("button", {
            class: "btn btn-sm " + (chosen ? "btn-primary" : "btn-outline"), type: "button",
            "aria-pressed": chosen ? "true" : "false",
            onclick: function () { App.actions.setConclusionVote(topic.id, conclusion.id); }
          }, [icon("check", 15), el("span", { text: chosen ? "Mon choix" : "Choisir" })]),
          el("div", { class: "spacer" }),
          mine ? el("button", { class: "btn btn-sm btn-ghost", type: "button", "aria-label": "Modifier la conclusion",
            onclick: function () { UI.set({ modal: { type: "editConclusion", topicId: topic.id, conclusionId: conclusion.id } }); } },
          [icon("edit", 15), el("span", { text: "Modifier" })]) : null,
          mine ? el("button", { class: "btn btn-sm btn-ghost", type: "button", "aria-label": "Supprimer la conclusion",
            onclick: function () { UI.set({ modal: { type: "deleteConclusion", topicId: topic.id, conclusionId: conclusion.id } }); } },
          [icon("trash", 15)]) : null
        ])
      ]), i));
    });

    if (!topic.conclusions.length) {
      list.appendChild(emptyState("checkCircle", "Pas encore de conclusion",
        "Rédigez la synthèse à présenter en réunion. Chacun vote ensuite pour sa préférée."));
    }

    var textarea = bindCounter(el("textarea", {
      class: "textarea", placeholder: "Nouvelle conclusion…", maxlength: Core.LIMITS.conclusion,
      "data-draft": "conclusion:" + topic.id
    }), "conclusion:" + topic.id, Core.LIMITS.conclusion);

    var addBlock = el("div", { class: "card card-static stack" }, [
      sectionTitle("edit", "Ajouter une conclusion"),
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

    var myVoteHint = el("div", { class: "note" }, [
      icon("info", 14),
      el("span", { text: myVote
        ? "Vous avez choisi une conclusion. Choisir une autre déplace votre vote."
        : "Choix unique : une seule conclusion par personne." })
    ]);

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

    var doc = el("div", { class: "print-doc stack" }, [
      el("div", { class: "stack", style: { gap: "6px", marginBottom: "10px" } }, [
        sectionTitle("doc", "Synthèse d'équipe"),
        el("h1", { class: "print-h1", text: CONFIG.APP_NAME + " — Préparation de réunion" }),
        el("p", { class: "hint", text: "Édité le " + Utils.formatDateTime(Utils.nowISO()) + " · " + Utils.plural(topics.length, "sujet", "sujets") })
      ])
    ]);

    if (!topics.length) {
      doc.appendChild(el("p", { class: "hint", text: "Aucun sujet à présenter." }));
    }

    topics.forEach(function (topic, i) {
      var block = reveal(el("section", { class: "print-topic" }, [
        el("h2", { class: "print-h2", text: topic.title }),
        el("div", { class: "card-meta" }, [
          toneBadge(Core.TOPIC_STATUS_LABELS[topic.status], TOPIC_TONES[topic.status]),
          el("span", { text: "proposé par " + topic.createdBy.name }),
          el("span", { class: "meta-dot" }),
          el("span", { text: Utils.plural(topic.messages.length, "message", "messages") })
        ])
      ]), i);
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
        actions: [el("button", { class: "btn btn-sm btn-outline no-print", type: "button",
          onclick: function () { window.print(); } }, [icon("print", 16), el("span", { text: "Imprimer" })])]
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

    var connected = !(Sync.connection.localMode || !Sync.connection.url);

    var connectionRows = el("div", { class: "card card-static stack" }, [
      el("div", { class: "row" }, [
        sectionTitle("link", "Connexion"),
        el("div", { class: "spacer" }),
        toneBadge(connected ? "Équipe" : "Local", connected ? "tone-success" : "tone-info")
      ]),
      el("div", { class: "hint", text: connected
        ? "Connecté à l'espace de l'équipe."
        : "Mode local : les données restent sur cet appareil." }),
      el("button", { class: "btn btn-outline btn-block", type: "button",
        onclick: function () { App.editConnection(); } },
      [icon("edit", 16), el("span", { text: "Modifier l'adresse ou le code" })]),
      el("button", { class: "btn btn-danger btn-block", type: "button",
        onclick: function () { UI.set({ modal: { type: "logout" } }); } },
      [icon("logout", 16), el("span", { text: "Se déconnecter de l'équipe" })])
    ]);

    function diagRow(label, value, danger) {
      return el("div", { class: "diag-row" }, [
        el("span", { class: "diag-label", text: label }),
        el("span", { class: "diag-value" + (danger ? " is-danger" : ""), text: value })
      ]);
    }

    var lockState = App.lockStatus();

    function lockLabel(state) {
      if (!state.enabled) { return "aucun code sur cet espace"; }
      if (!state.remembered) { return "code redemandé à chaque ouverture (rien n'est mémorisé)"; }
      var minutes = Math.round(state.remainingMs / 60000);
      return "ouvert — code redemandé après " + minutes + " min sans activité";
    }

    var diagRows = el("div", { class: "card card-static stack" }, [
      el("div", { class: "row" }, [
        sectionTitle("sync", "Synchronisation"),
        el("div", { class: "spacer" }),
        statusPill()
      ]),
      el("button", { class: "btn btn-outline btn-block", type: "button",
        onclick: function () { Sync.now(); UI.toast("Synchronisation lancée."); } },
      [icon("sync", 16), el("span", { text: "Synchroniser maintenant" })]),
      el("div", { class: "diag" }, [
        /* Le code d'espace se compare à l'œil d'un téléphone à l'autre : deux
         * codes différents = deux scripts différents, et c'est la première
         * explication à « je ne vois pas les messages des autres ». */
        connected ? diagRow("Code d'espace", Utils.fingerprint(Sync.connection.url)) : null,
        diagRow("Révision", String(diagnostics.revision)),
        diagRow("Dernière mise à jour", diagnostics.updatedAt ? Utils.formatDateTime(diagnostics.updatedAt) : "—"),
        connected ? diagRow("Dernier échange",
          diagnostics.lastSyncAt ? Utils.formatDateTime(diagnostics.lastSyncAt) : "aucun",
          !diagnostics.lastSyncAt) : null,
        connected ? diagRow("Rythme actuel",
          (diagnostics.intervalMs / 1000).toFixed(1).replace(".", ",") + " s" +
          (diagnostics.failures ? " (recul, " + diagnostics.failures + " échec(s))" : "")) : null,
        diagRow("Actions en attente", String(diagnostics.pending.length) +
          (diagnostics.pending.length ? " (" + diagnostics.pending.map(function (p) { return p.type; }).join(", ") + ")" : "")),
        diagRow("Stockage local", diagnostics.persistent
          ? "IndexedDB"
          : "mémoire — non persistant", !diagnostics.persistent),
        /* Deux lignes qui répondent d'avance à « pourquoi me redemande-t-il le
         * code ? » — la réponse est toujours l'une des deux. */
        diagRow("Réglages sur l'appareil", lockState.remembered
          ? "mémorisés"
          : "NON mémorisés — navigation privée ou fenêtre in-app", !lockState.remembered),
        diagRow("Verrou", lockLabel(lockState), lockState.enabled && !lockState.remembered),
        diagnostics.status.error ? diagRow("Dernière erreur", diagnostics.status.error, true) : null,
        diagRow("Version", CONFIG.APP_VERSION)
      ])
    ]);

    return el("div", { class: "screen" }, [
      topbar({ title: "Réglages", back: function () { App.go("#/"); }, backLabel: "Sujets", actions: [statusPill()] }),
      el("div", { class: "content stack-lg" }, [
        reveal(el("div", { class: "card card-static stack" }, [
          sectionTitle("user", "Votre nom"),
          nameInput,
          el("button", { class: "btn btn-primary btn-block", type: "button", text: "Enregistrer",
            onclick: function () { App.saveName(nameInput.value, true); } })
        ]), 0),
        reveal(connectionRows, 1),
        reveal(el("div", { class: "card card-static stack" }, [
          sectionTitle("doc", "Réunion"),
          el("div", { class: "hint", text: "Synthèse de tous les sujets, prête à imprimer ou à projeter." }),
          el("button", { class: "btn btn-outline btn-block", type: "button",
            onclick: function () { App.go("#/meeting"); } },
          [icon("print", 16), el("span", { text: "Ouvrir la synthèse" })])
        ]), 2),
        reveal(diagRows, 3)
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

    /* Le sélecteur de réaction nomme chaque marque : dessinée, elle n'est pas
     * toujours devinable au premier passage, et l'apprentissage se fait une
     * seule fois. */
    var emojiRow = el("div", { class: "emoji-row" });
    Core.REACTIONS.forEach(function (emoji) {
      var isMine = message.reactions[App.user.id] === emoji;
      var label = Utils.reactionLabel(emoji);
      emojiRow.appendChild(el("button", {
        class: "emoji-btn" + (isMine ? " mine" : ""), type: "button",
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

    var actions = el("div", { class: "sheet-actions" }, [
      /* Reprise de l'action que portait la citation elle-même. En tête : elle
       * concerne le contexte du message, pas ce qu'on va en faire. */
      message.quoteId && Core.findMessage(topic, message.quoteId)
        ? sheetAction("up", "Aller au message cité", function () {
          UI.set({ sheet: null });
          UI.scrollToMessage(message.quoteId);
        })
        : null,
      sheetAction("quote", "Citer", function () {
        UI.set({ sheet: null, quote: { topicId: topic.id, messageId: message.id } });
        var node = findDraftNode("composer:" + topic.id);
        if (node) { node.focus(); }
      }),
      sheetAction("idea", "Créer une proposition", function () {
        UI.set({ sheet: null, modal: { type: "createProposal", topicId: topic.id, fromText: message.text } });
      }),
      mine ? sheetAction(locked ? "lock" : "edit", locked ? "Modifier (verrouillé)" : "Modifier", function () {
        if (locked) { UI.toast("Message verrouillé : quelqu'un y a déjà réagi.", "error"); return; }
        UI.set({ sheet: null, modal: { type: "editMessage", topicId: topic.id, messageId: message.id } });
      }, { disabled: false }) : null,
      mine ? sheetAction(message.anon ? "user" : "mask", message.anon ? "Signer avec mon nom" : "Rendre anonyme", function () {
        App.actions.setMessageSignature(topic.id, message.id, !message.anon);
        UI.set({ sheet: null });
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

    var statusSelect = el("select", { class: "select", "aria-label": "Statut du sujet",
      onchange: function (e) {
        var label = Core.TOPIC_STATUS_LABELS[e.target.value];
        App.actions.changeTopicStatus(topic.id, e.target.value);
        UI.toast(topic.title + " : " + label + ".");
      }
    });
    Core.TOPIC_STATUSES.forEach(function (status) {
      statusSelect.appendChild(el("option", { value: status, selected: topic.status === status, text: Core.TOPIC_STATUS_LABELS[status] }));
    });

    return sheet(topic.title, el("div", { class: "stack" }, [
      el("div", { class: "card-meta" }, [
        toneBadge(Core.TOPIC_STATUS_LABELS[topic.status], TOPIC_TONES[topic.status]),
        icon("user", 13),
        el("span", { text: topic.createdBy.name }),
        el("span", { class: "meta-dot" }),
        el("span", { text: Utils.formatDateTime(topic.createdAt) })
      ]),
      topic.description
        ? el("div", { class: "pre-wrap", style: { fontSize: "var(--fs-sm)" }, text: topic.description })
        : el("div", { class: "hint", text: "Aucune description." }),
      field("Statut", selectWrap(statusSelect, true)),
      el("button", { class: "btn btn-outline btn-block", type: "button",
        onclick: function () { UI.set({ sheet: null, modal: { type: "editTopic", topicId: topic.id } }); } },
      [icon("edit", 16), el("span", { text: "Modifier le sujet" })])
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

    /* Les animations d'entrée ne se jouent qu'en ARRIVANT sur un écran. Une
     * mise à jour de données (message reçu, vote) ne doit pas relancer la
     * cascade : une animation d'entrée qui se répète devient du clignotement. */
    var place = (App.gate() || "") + "|" + App.route.raw;
    var entering = place !== lastPlace;
    lastPlace = place;

    var drafts = captureDrafts();

    /* Position de défilement du fil de discussion. */
    var thread = document.querySelector(".thread");
    var scrollTop = thread ? thread.scrollTop : 0;
    var threadKey = thread ? thread.getAttribute("data-thread") : null;
    var atBottom = thread ? (thread.scrollHeight - thread.scrollTop - thread.clientHeight) < 80 : true;

    Utils.clear(appRoot);
    var screen = currentScreen();
    if (entering) { screen.classList.add("screen--enter"); }
    appRoot.appendChild(screen);
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
      /* Hauteur de référence du rattrapage : le nœud est recréé à chaque rendu,
       * la mesure doit l'être aussi. */
      lastThreadHeight = newThread.clientHeight;
    } else {
      lastThreadHeight = 0;
    }

    UI.refreshStatus();
  };

  /* -------------------------------------------------- Bandeau nouvelle version --- */

  UI.showUpdateBanner = function (onUpdate) {
    if (document.querySelector(".update-banner")) { return; }
    var banner = el("div", { class: "update-banner" }, [
      icon("sparkle", 17),
      el("span", { style: { flex: "1" }, text: "Une nouvelle version est disponible." }),
      el("button", {
        class: "btn btn-sm btn-primary", type: "button", text: "Mettre à jour",
        onclick: function () { banner.remove(); onUpdate(); }
      }),
      el("button", { class: "btn-icon", type: "button", "aria-label": "Plus tard",
        onclick: function () { banner.remove(); } }, [icon("close", 18)])
    ]);
    document.body.appendChild(banner);
  };

  root.UI = UI;
})(typeof globalThis !== "undefined" ? globalThis : this);
