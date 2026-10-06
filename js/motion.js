/* BrainstO. — continuité du mouvement.
 *
 * LE PROBLÈME. UI.render détruit et reconstruit l'écran ET le calque à chaque appel (js/ui.js). Un nœud neuf naît
 * dans son état final : aucune transition CSS ne se joue sur un changement d'état, et ce qui disparaît disparaît
 * d'un coup. Deux défauts en découlaient :
 *   - une feuille ou une fenêtre ouverte REJOUAIT son entrée à chaque rendu de données (un vote reçu, une
 *     synchronisation) : elle remontait sous les yeux sans que personne l'ait rouverte ;
 *   - un message reçu, une réaction, un vote, une carte retirée SAUTAIENT d'un état à l'autre, et l'œil perdait ce
 *     qui venait de se passer.
 *
 * LE PRINCIPE. Relever l'avant juste avant le rendu (positions, largeurs, états enfoncés, calque ouvert), laisser le
 * rendu se faire, puis rejouer la différence sur les nœuds neufs : FLIP pour ce qui s'est déplacé, une classe
 * « depuis l'ancien état » pour le reste. C'est le motif `is-flip` de l'interrupteur de signature, généralisé.
 *
 * CE QUE CETTE COUCHE NE FAIT PAS. Elle ne touche ni l'état, ni les actions, ni le focus, ni l'ordre du DOM. Elle
 * n'anime jamais l'arrivée sur un écran (js/ui.js et css/uxer.css s'en chargent), ni un rendu qui apporte beaucoup
 * de nouveautés d'un coup : une reconnexion n'est pas un feu d'artifice. Retirée, BrainstO. fonctionne à
 * l'identique, sans mouvement de continuité.
 *
 * ORDRE DE CHARGEMENT. Après js/product-ui.js, qui range les cartes de l'accueil en groupes avant la mesure ; avant
 * js/uxer-ui.js, dont View Transitions appelle ce rendu dans sa fonction de mise à jour (l'avant se relève donc sur
 * l'ancien DOM). La reprise attend la fin des couches synchrones (micro-tâche) : js/uxer-ui.js insère encore le
 * parcours du sujet sous la barre du haut, ce qui déplace tout le contenu d'un sujet.
 *
 * MOUVEMENT RÉDUIT. Rien de ce fichier ne se joue, sauf deux choses qui ne bougent pas : le maintien du calque
 * ouvert (il SUPPRIME un mouvement) et la désignation du message dont la feuille est ouverte (un état, pas un geste).
 *
 * Valeurs : les jetons de css/app.css (« Mouvement »), relus une fois. Raisons et carte complète : docs/MOUVEMENT.md.
 */
(function (root) {
  "use strict";

  var doc = root.document;
  if (!root.UI || !doc || typeof root.UI.render !== "function") { return; }

  var UI = root.UI;
  var innerRender = UI.render;
  var CAN_ANIMATE = typeof root.Element === "function" && !!root.Element.prototype &&
    typeof root.Element.prototype.animate === "function";

  /* Bornes. Au-delà, ce n'est plus une action qu'on suit des yeux, c'est un chargement : rien ne s'anime. */
  var MAX_NEW = 3;            // nouveautés animées dans un même rendu
  var MAX_BUMPS = 4;          // réactions, votes, repères qui « répondent » dans un même rendu
  var MAX_MOVED = 40;         // éléments visibles déplacés dans un même rendu
  var MAX_MEASURED = 600;     // éléments mesurés avant un rendu
  var ENTER_SETTLE_MS = 450;  // fin de la cascade d'arrivée sur un écran (220 ms + 6 crans de 18 ms, avec marge)
  var EXPECT_TTL_MS = 10000;  // une annonce (Motion.expect) non suivie d'effet s'oublie

  /* Identité d'un bloc d'un rendu à l'autre : `data-motion-key` sur les cartes (js/ui.js), l'identifiant déjà porté par
   * la bulle pour un message — la rangée n'en reçoit aucun de plus, deux bulles anonymes doivent rester identiques
   * (BL-013) —, le statut du groupe pour un titre de groupe de l'accueil (js/product-ui.js). */
  var ITEM_SELECTOR = "[data-motion-key], .msg-row, .product-topic-group > .product-topic-group-title";
  /* Seuls les blocs d'une liste laissent une trace en partant. Un message ne se supprime pas. */
  var GHOST_KINDS = { t: true, p: true, c: true, g: true };

  var lastPlace = null;
  var lastSignature = null;
  var renderedSpec = null;    // calque à l'écran au rendu précédent (identité de UI.local.sheet / UI.local.modal)
  var renderedTarget = null;  // message désigné par la feuille ouverte au rendu précédent
  var expected = [];          // annonces : { key, at }
  var pending = null;         // relevé en attente de reprise (plusieurs rendus dans une même tâche)
  var unfolding = null;       // <details> que la personne vient d'ouvrir
  var tokens = null;

  /* ------------------------------------------------------------- Lecture --- */

  function now() { return Date.now(); }

  function reduced() {
    try { return !!(root.matchMedia && root.matchMedia("(prefers-reduced-motion: reduce)").matches); }
    catch (e) { return false; }
  }

  function readTokens() {
    if (tokens) { return tokens; }
    var style = null;
    try { style = root.getComputedStyle ? root.getComputedStyle(doc.documentElement) : null; } catch (e) { style = null; }
    function get(name, fallback) {
      var value = style ? String(style.getPropertyValue(name) || "").trim() : "";
      return value || fallback;
    }
    function ms(name, fallback) {
      var value = get(name, "");
      var number = parseFloat(value);
      if (!isFinite(number)) { return fallback; }
      return /ms$/.test(value) ? number : number * 1000;
    }
    tokens = {
      easeOut: get("--ease-out", "cubic-bezier(0.23, 1, 0.32, 1)"),
      easeMove: get("--ease-move", "cubic-bezier(0.4, 0, 0.2, 1)"),
      base: ms("--dur-base", 160),
      exit: ms("--dur-exit", 140),
      move: ms("--dur-move", 220),
      slow: ms("--dur-slow", 240),
      highlight: ms("--dur-highlight", 1200)
    };
    return tokens;
  }

  function placeNow() {
    var app = root.App;
    if (!app || !app.route) { return null; }
    var gate = typeof app.gate === "function" ? app.gate() : null;
    return (gate || "") + "|" + app.route.raw;
  }

  /* La même signature que js/ui.js : un rendu qu'elle déclare inchangé est sauté, il n'y a rien à mesurer. */
  function signatureNow() {
    var app = root.App;
    var store = root.Store;
    var local = UI.local || {};
    if (!app || !store) { return null; }
    var gate = typeof app.gate === "function" ? app.gate() : "";
    var user = app.user || {};
    return [gate || "", app.route && app.route.raw, store.version, local.version, user.id, user.name].join("|");
  }

  function filterNow() {
    var local = UI.local || {};
    return String(local.search || "") + "|" + (local.showArchived ? "1" : "0");
  }

  function layerSpec() {
    var local = UI.local || {};
    return local.sheet || local.modal || null;
  }

  function keyOf(node) {
    var key = node.getAttribute("data-motion-key");
    if (key) { return key; }
    if (node.classList.contains("msg-row")) {
      var bubble = node.querySelector(".bubble[data-message-id]");
      return bubble ? "m:" + bubble.getAttribute("data-message-id") : null;
    }
    var section = node.parentNode;
    var status = section && section.getAttribute ? section.getAttribute("data-topic-status") : null;
    return status ? "g:" + status : null;
  }

  function ownerKey(node) {
    var owner = node.closest ? node.closest("[data-motion-key], .msg-row") : null;
    return owner ? (keyOf(owner) || "") : "";
  }

  function rectOf(node) {
    var r = node.getBoundingClientRect();
    return { top: r.top, left: r.left, width: r.width, height: r.height, bottom: r.bottom };
  }

  /* -------------------------------------------------------------- Relevé --- */

  function capture() {
    var appRoot = doc.getElementById("app");
    var overlayRoot = doc.getElementById("overlay-root");
    var signature = signatureNow();
    var snap = {
      place: lastPlace,
      filter: filterNow(),
      layer: overlayRoot ? overlayRoot.firstElementChild : null,
      layerShown: null,
      measured: false,
      items: {}, pressed: {}, chips: {}, marks: {}, bars: {},
      quote: false, skeleton: false
    };
    /* Ce que le calque AFFICHE à cet instant (voile, position de la feuille) : refermé pendant son entrée, il repart
     * de là au lieu de sauter d'abord en position ouverte. Une transition se recible ; un fantôme doit faire pareil. */
    if (snap.layer && !reduced()) { snap.layerShown = shownState(snap.layer); }
    var unchanged = signature !== null && signature === lastSignature;
    lastSignature = signature;
    /* Relevé même quand la signature ne bouge pas : la synthèse de Pandore arrive par UI.force, hors signature. */
    snap.skeleton = !!(appRoot && appRoot.querySelector(".skeleton-card"));
    /* Rien à relever : changement d'écran (js/ui.js et css/uxer.css le portent), rendu sauté, ou mouvement réduit. */
    if (!appRoot || unchanged || reduced() || placeNow() !== lastPlace) { return snap; }

    var nodes = appRoot.querySelectorAll(ITEM_SELECTOR);
    if (nodes.length > MAX_MEASURED) { return snap; }
    for (var i = 0; i < nodes.length; i++) {
      var key = keyOf(nodes[i]);
      if (key) { snap.items[key] = { node: nodes[i], rect: rectOf(nodes[i]) }; }
    }
    snap.measured = true;

    var pressed = appRoot.querySelectorAll("[aria-pressed='true'][data-key]");
    for (i = 0; i < pressed.length; i++) { snap.pressed[ownerKey(pressed[i]) + "|" + pressed[i].getAttribute("data-key")] = true; }

    var chips = appRoot.querySelectorAll(".reaction[data-key]");
    for (i = 0; i < chips.length; i++) { snap.chips[ownerKey(chips[i]) + "|" + chips[i].getAttribute("data-key")] = chipState(chips[i]); }

    var marks = appRoot.querySelectorAll(".badge.lead, .product-unread");
    for (i = 0; i < marks.length; i++) { snap.marks[markKey(marks[i])] = true; }

    var bars = appRoot.querySelectorAll(".vote-bar");
    for (i = 0; i < bars.length; i++) { snap.bars[ownerKey(bars[i])] = barWidths(bars[i]); }

    snap.quote = !!appRoot.querySelector(".quote-preview");
    return snap;
  }

  function shownState(layer) {
    if (!root.getComputedStyle) { return null; }
    var panel = layer.querySelector(".sheet, .modal");
    var scrim = root.getComputedStyle(layer);
    var shown = panel ? root.getComputedStyle(panel) : null;
    return {
      background: scrim.backgroundColor,
      transform: shown ? shown.transform : "",
      opacity: shown ? shown.opacity : ""
    };
  }

  function chipState(chip) {
    var count = chip.querySelector(".reaction-count");
    return (chip.classList.contains("mine") ? "1" : "0") + "/" + (count ? count.textContent : "1");
  }

  function markKey(mark) {
    return ownerKey(mark) + "|" + (mark.classList.contains("lead") ? "lead" : "unread");
  }

  function barWidths(bar) {
    var out = [];
    for (var i = 0; i < bar.children.length; i++) { out.push(bar.children[i].style.width || "0%"); }
    return out;
  }

  /* ------------------------------------------------------------- Reprise --- */

  function settle(snap) {
    var appRoot = doc.getElementById("app");
    var overlayRoot = doc.getElementById("overlay-root");
    var place = placeNow();
    var calm = reduced() || !CAN_ANIMATE;
    var arrived = snap.place !== place;

    /* Un calque fermé PAR un changement d'écran part avec l'ancien écran, dans la capture de View Transitions : un
     * fantôme posé maintenant serait figé dans l'image du nouvel écran. */
    settleLayer(snap, overlayRoot, calm || arrived);
    if (appRoot) { settleTarget(appRoot, calm); }

    if (appRoot) {
      if (!calm && !arrived && snap.measured && snap.filter === filterNow() && !entering(appRoot)) { continuity(snap, appRoot); }
      if (!calm && !arrived) { settleSkeleton(snap, appRoot); }
      /* Le repère d'un élément créé est une information (où il a atterri) : il reste en mouvement réduit, immobile
       * (css/motion.css, « Repère »). */
      settleExpected(appRoot, arrived);
    }
    lastPlace = place;
  }

  /* Pendant la cascade d'arrivée sur un écran, les cartes portent déjà leur animation d'entrée : un second mouvement
   * par-dessus serait un tremblement. Au-delà, l'écran est posé et ses changements se rejouent normalement. */
  function entering(appRoot) {
    var screen = appRoot.firstElementChild;
    if (!screen || !screen.classList.contains("screen--enter")) { return false; }
    var elapsed = parseFloat(screen.style.getPropertyValue("--enter-elapsed")) || 0;
    return elapsed < ENTER_SETTLE_MS;
  }

  function continuity(snap, appRoot) {
    var t = readTokens();
    var vh = root.innerHeight || doc.documentElement.clientHeight || 0;
    var nodes = appRoot.querySelectorAll(ITEM_SELECTOR);
    var seen = {};
    var byKey = {};
    var fresh = [];
    var moved = [];
    var i;

    /* Toutes les mesures d'abord, toutes les animations ensuite : une animation lancée déplace le rectangle que la
     * mesure suivante lirait. */
    for (i = 0; i < nodes.length; i++) {
      var node = nodes[i];
      var key = keyOf(node);
      if (!key) { continue; }
      seen[key] = true;
      byKey[key] = node;
      var before = snap.items[key];
      if (!before) { fresh.push(node); continue; }
      var after = rectOf(node);
      var dx = before.rect.left - after.left;
      var dy = before.rect.top - after.top;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) { continue; }
      /* Hors de l'écran avant ET après : personne ne le voit bouger. */
      var outside = (before.rect.bottom < 0 && after.bottom < 0) || (before.rect.top > vh && after.top > vh);
      if (!outside) { moved.push({ node: node, key: key, dx: dx, dy: dy }); }
    }

    var gone = [];
    Object.keys(snap.items).forEach(function (key) {
      if (!seen[key] && GHOST_KINDS[key.charAt(0)]) { gone.push(snap.items[key]); }
    });

    /* Le fil qui remonte : le décalage du dernier message déplacé est celui de tout le fil. Un message arrivé en bas
     * part de là, avec les autres, au lieu d'apparaître par-dessus celui qui glisse. */
    var threadShift = 0;
    for (i = 0; i < moved.length; i++) {
      if (moved[i].key.charAt(0) === "m" && moved[i].dy > 0) { threadShift = moved[i].dy; }
    }

    if (moved.length <= MAX_MOVED) {
      moved.forEach(function (m) { flip(m.node, m.dx, m.dy, t); });
    }
    if (gone.length <= MAX_NEW) {
      gone.forEach(function (item) { ghostItem(item); });
    }
    if (fresh.length <= MAX_NEW) {
      fresh.forEach(function (node) { enter(node, threadShift, t); });
    }

    settleBars(snap, byKey, t);
    settleBumps(snap, appRoot, fresh);
    settleComposer(snap, appRoot);
  }

  function flip(node, dx, dy, t) {
    node.animate(
      [{ transform: "translate(" + dx + "px, " + dy + "px)" }, { transform: "none" }],
      { duration: t.move, easing: t.easeMove }
    );
  }

  function enter(node, threadShift, t) {
    var key = keyOf(node) || "";
    if (key.charAt(0) === "m" && threadShift > 0) {
      /* Deux animations, deux propriétés : le déplacement suit le fil, le fondu finit plus tôt. */
      node.animate([{ transform: "translateY(" + threadShift + "px)" }, { transform: "none" }],
        { duration: t.move, easing: t.easeMove });
      node.animate([{ opacity: 0 }, { opacity: 1 }], { duration: t.base, easing: t.easeOut });
      return;
    }
    node.classList.add("motion-enter");
  }

  /* Barres de vote : la répartition glisse de l'ancienne à la nouvelle. C'est le seul endroit du produit où la
   * divergence est une quantité (docs/IDENTITE_VISUELLE.md) ; la voir se déplacer, c'est voir l'accord bouger.
   * La largeur est animée, faute d'équivalent en déplacement : trois segments de 10 px de haut, une carte à la fois. */
  function settleBars(snap, byKey, t) {
    Object.keys(snap.bars).forEach(function (key) {
      var owner = byKey[key];
      var bar = owner ? owner.querySelector(".vote-bar") : null;
      if (!bar) { return; }
      var before = snap.bars[key];
      for (var i = 0; i < bar.children.length && i < before.length; i++) {
        var span = bar.children[i];
        var width = span.style.width || "0%";
        if (width !== before[i]) {
          span.animate([{ width: before[i] }, { width: width }], { duration: t.move, easing: t.easeOut });
        }
      }
    });
  }

  /* Ce qui RÉPOND à une action : le bouton de vote ou de choix qui vient d'être enfoncé, la réaction posée ou comptée,
   * le repère « En tête » ou « Nouveau » qui apparaît. Jamais sur un élément qui vient lui-même d'arriver : son entrée
   * suffit. */
  function settleBumps(snap, appRoot, fresh) {
    var budget = MAX_BUMPS;
    var isFresh = function (node) {
      for (var i = 0; i < fresh.length; i++) { if (fresh[i].contains(node)) { return true; } }
      return false;
    };
    var bump = function (node, className) {
      if (budget <= 0 || isFresh(node)) { return; }
      budget -= 1;
      node.classList.add(className);
    };
    var i;
    var pressed = appRoot.querySelectorAll("[aria-pressed='true'][data-key]");
    for (i = 0; i < pressed.length; i++) {
      if (!snap.pressed[ownerKey(pressed[i]) + "|" + pressed[i].getAttribute("data-key")] &&
          !pressed[i].classList.contains("reaction")) { bump(pressed[i], "motion-press-in"); }
    }
    var chips = appRoot.querySelectorAll(".reaction[data-key]");
    for (i = 0; i < chips.length; i++) {
      var was = snap.chips[ownerKey(chips[i]) + "|" + chips[i].getAttribute("data-key")];
      if (was !== chipState(chips[i])) { bump(chips[i], "motion-bump"); }
    }
    var marks = appRoot.querySelectorAll(".badge.lead, .product-unread");
    for (i = 0; i < marks.length; i++) {
      if (!snap.marks[markKey(marks[i])]) { bump(marks[i], "motion-mark-in"); }
    }
  }

  /* La citation qui se pose au-dessus du champ : elle vient d'un geste (glisser, ou « Citer »), elle arrive. */
  function settleComposer(snap, appRoot) {
    var quote = appRoot.querySelector(".quote-preview");
    if (quote && !snap.quote) { quote.classList.add("motion-enter"); }
  }

  /* Le squelette de la synthèse a laissé place au contenu : le bloc arrive à la place exacte du bloc gris. C'est la seule arrivée groupée que cette couche anime : elle remplace une attente, elle ne
   * s'ajoute pas à une lecture. */
  function settleSkeleton(snap, appRoot) {
    if (!snap.skeleton || appRoot.querySelector(".skeleton-card")) { return; }
    var cards = appRoot.querySelectorAll(".pandore-card");
    for (var i = 0; i < cards.length; i++) {
      cards[i].style.setProperty("--motion-index", String(i));
      cards[i].classList.add("motion-enter");
    }
  }

  /* -------------------------------------------------------------- Calques --- */

  /* Trois cas, et un seul qui manquait vraiment :
   *   - même calque qu'au rendu précédent (données reçues pendant qu'il est ouvert) : il ne rejoue PAS son entrée ;
   *   - calque fermé : il repart par où il est venu au lieu de disparaître ;
   *   - calque remplacé (feuille → fenêtre) : l'ancien part, le voile reste, le nouveau arrive. */
  function settleLayer(snap, overlayRoot, calm) {
    if (!overlayRoot) { return; }
    var spec = layerSpec();
    var node = overlayRoot.firstElementChild;
    var previous = snap.layer;
    if (previous && previous === node) { return; }
    if (node && spec && spec === renderedSpec) {
      node.classList.add("is-settled");
    } else if (previous && !calm) {
      ghostLayer(previous, !!node, snap.layerShown);
      if (node) { node.classList.add("is-continued"); }
    }
    renderedSpec = node ? spec : null;
  }

  function ghostLayer(node, handoff, shown) {
    strip(node);
    node.classList.remove("is-settled", "is-continued");
    /* Les animations de sortie n'ont qu'une image d'arrivée : leur départ est la valeur posée ici. */
    if (shown) {
      var panel = node.querySelector(".sheet, .modal");
      if (!handoff && shown.background) { node.style.backgroundColor = shown.background; }
      if (panel && shown.transform && shown.transform !== "none") { panel.style.transform = shown.transform; }
      if (panel && shown.opacity) { panel.style.opacity = shown.opacity; }
    }
    node.classList.add("is-leaving");
    if (handoff) { node.classList.add("is-handoff"); }
    /* Juste AVANT #overlay-root : même rang d'empilement que le calque, donc peint sous le nouveau. */
    host("motion-layer-ghost", doc.getElementById("overlay-root")).appendChild(node);
    dispose(node, readTokens().slow + 400);
  }

  /* Une carte retirée d'une liste (consensus supprimé, sujet archivé ailleurs) s'efface à sa place pendant que les
   * autres reprennent l'espace. Fixée à son ancien rectangle : le défilement n'a pas bougé entre-temps. */
  function ghostItem(item) {
    var node = item.node;
    var r = item.rect;
    if (!node || !r || r.bottom < 0 || r.top > (root.innerHeight || 0)) { return; }
    if (typeof node.getAnimations === "function") {
      node.getAnimations().forEach(function (a) { try { a.cancel(); } catch (e) { /* déjà fini */ } });
    }
    strip(node);
    var style = node.style;
    style.position = "fixed";
    style.top = r.top + "px";
    style.left = r.left + "px";
    style.width = r.width + "px";
    style.height = r.height + "px";
    style.margin = "0";
    style.boxSizing = "border-box";
    style.zIndex = "1";
    node.classList.add("motion-leaving");
    host("motion-ghosts", doc.getElementById("overlay-root")).appendChild(node);
    dispose(node, readTokens().exit + 400);
  }

  /* Un fantôme ne doit être trouvé par AUCUNE requête de l'application : ni comme brouillon, ni comme message, ni
   * comme calque, ni comme cible de focus. Il garde son apparence, il perd son identité. */
  var STRIPPED = ["id", "role", "aria-modal", "aria-labelledby", "aria-describedby", "tabindex", "data-key", "data-draft",
    "data-message-id", "data-motion-key", "data-counter", "data-thread", "aria-live"];

  function strip(node) {
    var all = [node];
    var inner = node.querySelectorAll("*");
    for (var i = 0; i < inner.length; i++) { all.push(inner[i]); }
    all.forEach(function (n) {
      STRIPPED.forEach(function (name) { if (n.hasAttribute(name)) { n.removeAttribute(name); } });
    });
    node.setAttribute("aria-hidden", "true");
    node.setAttribute("inert", "");
    node.style.pointerEvents = "none";
  }

  function host(id, before) {
    var node = doc.getElementById(id);
    if (node) { return node; }
    node = doc.createElement("div");
    node.id = id;
    node.className = "motion-ghosts";
    node.setAttribute("aria-hidden", "true");
    /* Inerte d'avance : la gestion des calques (js/ui.js, setBackground) saute un nœud déjà inerte, elle ne le
     * comptera donc jamais parmi ceux qu'elle doit rendre à la fermeture. */
    node.setAttribute("inert", "");
    if (before && before.parentNode) { before.parentNode.insertBefore(node, before); } else { doc.body.appendChild(node); }
    return node;
  }

  /* Retiré à la fin de SA sortie (la dernière animation du fantôme ou de ses enfants), avec un plafond : un moteur
   * qui ne joue rien n'émet aucun `animationend`, et le fantôme ne doit jamais rester. */
  function dispose(node, ceiling) {
    var done = function () {
      node.removeEventListener("animationend", onEnd);
      if (node.parentNode) { node.parentNode.removeChild(node); }
    };
    var onEnd = function () {
      var running = typeof node.getAnimations === "function"
        ? node.getAnimations({ subtree: true }).filter(function (a) { return a.playState === "running"; }).length
        : 0;
      if (!running) { done(); }
    };
    node.addEventListener("animationend", onEnd);
    root.setTimeout(done, ceiling);
  }

  /* --------------------------------------------------- Message désigné --- */

  /* La feuille d'actions porte sur UN message : il le reste visiblement tant qu'elle est ouverte, et relâche sa
   * désignation en douceur quand elle se ferme. Le geste d'appui long continue ainsi jusqu'au bout au lieu de se
   * rompre à l'ouverture. */
  function settleTarget(appRoot, calm) {
    var spec = UI.local && UI.local.sheet;
    var id = spec && spec.type === "message" ? spec.messageId : null;
    var bubble = id ? findBubble(appRoot, id) : null;
    if (bubble) {
      bubble.classList.add("is-targeted");
      if (id !== renderedTarget && !calm) { bubble.classList.add("motion-target-in"); }
    } else if (renderedTarget && !calm) {
      var released = findBubble(appRoot, renderedTarget);
      if (released) { released.classList.add("motion-target-out"); }
    }
    renderedTarget = bubble ? id : null;
  }

  function findBubble(appRoot, id) {
    var bubbles = appRoot.querySelectorAll(".bubble[data-message-id]");
    for (var i = 0; i < bubbles.length; i++) {
      if (bubbles[i].getAttribute("data-message-id") === id) { return bubbles[i]; }
    }
    return null;
  }

  /* ----------------------------------------------------------- Annonces --- */

  /* Une action qui fait apparaître un élément AILLEURS (une proposition tirée d'un message s'ouvre sur l'écran des
   * propositions) l'annonce par Motion.expect. À l'arrivée, l'élément est désigné une fois — après la transition
   * d'écran, et ramené dans la vue s'il est plus bas. L'information n'a pas été copiée dans un endroit inconnu. */
  function settleExpected(appRoot, arrived) {
    if (!expected.length) { return; }
    var t = readTokens();
    var limit = now() - EXPECT_TTL_MS;
    expected = expected.filter(function (item) { return item.at >= limit; });
    expected = expected.filter(function (item) {
      var node = appRoot.querySelector('[data-motion-key="' + item.key.replace(/["\\]/g, "") + '"]');
      if (!node) { return true; }
      root.setTimeout(function () { highlight(node, t); }, arrived ? t.slow : 0);
      return false;
    });
  }

  function highlight(node, t) {
    if (!doc.documentElement.contains(node)) { return; }
    var r = node.getBoundingClientRect();
    var vh = root.innerHeight || 0;
    if (r.top < 0 || r.bottom > vh) {
      try { node.scrollIntoView({ block: "center", behavior: reduced() ? "auto" : "smooth" }); } catch (e) { /* ancien moteur */ }
    }
    node.classList.add("motion-highlight");
    dropClass(node, "motion-highlight", t.highlight + 100);
  }

  /* Le repère anime le contour (outline) : la classe ne doit pas survivre à l'animation, sinon elle masquerait
   * l'anneau de focus du même élément. */
  function dropClass(node, className, delay) {
    root.setTimeout(function () { node.classList.remove(className); }, delay);
  }

  /* --------------------------------------------------------- Volets --- */

  /* « Statut et actions », « Diagnostic » : le contenu d'un volet qu'on ouvre se pose au lieu d'apparaître. Seulement
   * sur le geste de la personne — un volet RECONSTRUIT ouvert par le rendu émet aussi `toggle`, et ne doit rien
   * rejouer. */
  doc.addEventListener("click", function (event) {
    var summary = event.target && event.target.closest ? event.target.closest("summary") : null;
    unfolding = summary ? summary.parentNode : null;
  }, true);

  doc.addEventListener("toggle", function (event) {
    var node = event.target;
    if (!node || node !== unfolding || !node.open || reduced()) { return; }
    unfolding = null;
    node.classList.remove("motion-unfold");
    void node.offsetWidth;
    node.classList.add("motion-unfold");
  }, true);

  /* ------------------------------------------------------------ Rendu --- */

  UI.render = function () {
    /* Plusieurs rendus dans la même tâche (UI.set puis UI.force) : on compare l'état d'AVANT le premier à l'état
     * final, une seule fois. Relever entre les deux ferait jouer deux fois la même sortie. */
    var first = !pending;
    if (first) {
      try { pending = capture(); } catch (e) { pending = null; }
    }
    var snap = first ? pending : null;
    try {
      return innerRender.apply(UI, arguments);
    } finally {
      if (snap) {
        Promise.resolve().then(function () {
          pending = null;
          try { settle(snap); } catch (e) { /* le mouvement ne casse jamais un rendu */ }
        });
      }
    }
  };

  root.Motion = {
    /* Annonce l'élément (sa `data-motion-key`) qu'une action va faire apparaître, éventuellement sur un autre écran. */
    expect: function (key) {
      if (!key) { return; }
      expected.push({ key: String(key), at: now() });
    }
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
