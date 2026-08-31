/* BrainstO. — utilitaires génériques (DOM, dates, hachage, stockage). */
(function (root) {
  "use strict";

  var Utils = {};

  /* ---------------------------------------------------------------- DOM --- */

  /* Crée un élément. Le contenu utilisateur passe TOUJOURS par textContent :
   * innerHTML n'est utilisé nulle part dans l'application. */
  Utils.el = function (tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (key) {
        var value = attrs[key];
        if (value === null || value === undefined || value === false) { return; }
        if (key === "class") { node.className = value; return; }
        if (key === "text") { node.textContent = String(value); return; }
        if (key === "dataset") {
          Object.keys(value).forEach(function (k) { node.dataset[k] = value[k]; });
          return;
        }
        if (key === "style" && typeof value === "object") {
          Object.keys(value).forEach(function (k) { node.style[k] = value[k]; });
          return;
        }
        if (key.slice(0, 2) === "on" && typeof value === "function") {
          node.addEventListener(key.slice(2), value);
          return;
        }
        if (value === true) { node.setAttribute(key, ""); return; }
        node.setAttribute(key, String(value));
      });
    }
    Utils.append(node, children);
    return node;
  };

  Utils.append = function (node, children) {
    if (children === null || children === undefined || children === false) { return node; }
    if (Array.isArray(children)) {
      children.forEach(function (child) { Utils.append(node, child); });
      return node;
    }
    if (children instanceof Node) { node.appendChild(children); return node; }
    node.appendChild(document.createTextNode(String(children)));
    return node;
  };

  Utils.clear = function (node) {
    while (node && node.firstChild) { node.removeChild(node.firstChild); }
    return node;
  };

  /* --------------------------------------------------------------- Icônes --- */

  /* Jeu d'icônes dessiné à la main, en trait (1.7 px, bouts arrondis), inséré
   * en SVG dans le document : aucune police d'icônes, aucune requête réseau,
   * et un rendu identique sur iPhone, Android et poste fixe — contrairement
   * aux emoji, dont le dessin change d'un système à l'autre.
   * Le trait hérite de `currentColor` : une icône suit toujours son texte.
   *
   * RÈGLE DU JEU : une icône nomme un objet ou une action du produit. Elle ne
   * qualifie rien, elle ne récompense rien, elle ne promet rien.
   * Sont donc proscrites les trois figures qui ne décrivent aucun objet et se
   * contentent d'un affect — l'étincelle (« c'est magique »), l'étoile (« c'est
   * bien »), l'ampoule (« quelle idée »). Elles étaient ici toutes les trois, et
   * elles sont la signature la plus reconnaissable d'une interface produite par
   * défaut : on les pose quand on n'a pas décidé ce que la chose EST.
   * Une icône sans objet nommable ne s'ajoute pas ; on met le mot seul. */
  var SVG_NS = "http://www.w3.org/2000/svg";

  var ICON_PATHS = {
    back: ["M15 5 8 12l7 7"],
    forward: ["M9 5l7 7-7 7"],
    down: ["M5 9l7 7 7-7"],
    up: ["M5 15l7-7 7 7"],
    close: ["M6 6l12 12", "M18 6 6 18"],
    plus: ["M12 5v14", "M5 12h14"],
    search: ["M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14z", "M16.5 16.5 21 21"],
    send: ["M12 20V5", "M5.5 11.5 12 5l6.5 6.5"],
    settings: ["M4 7h10", "M18 7h2", "M4 12h4", "M12 12h8", "M4 17h9", "M17 17h3",
      "M16 7a2 2 0 1 0 0-.01z", "M10 12a2 2 0 1 0 0-.01z", "M15 17a2 2 0 1 0 0-.01z"],
    /* Une proposition n'est pas une étincelle d'inspiration : c'est une option
     * formulée pour être votée, et le produit s'arrête volontairement là. D'où
     * deux options alignées, à la manière d'un bulletin, et non l'ampoule du
     * brainstorm — qui décrivait le mauvais objet en plus d'être un cliché.
     * Un premier dessin faisait diverger un trait en deux branches : plus juste
     * conceptuellement, illisible à 13 px, où il se lisait comme une flèche. */
    options: ["M4.5 7h3.5v3.5h-3.5z", "M11.5 8.75h8", "M4.5 13.5h3.5V17h-3.5z", "M11.5 15.25h8"],
    check: ["M4.5 12.5 9.5 17.5 19.5 6.5"],
    checkCircle: ["M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z", "M8 12.2l2.8 2.8L16 9.5"],
    message: ["M5.7 4.5h12.6A1.7 1.7 0 0 1 20 6.2v7.6a1.7 1.7 0 0 1-1.7 1.7H10l-3.5 3.3v-3.3h-.8A1.7 1.7 0 0 1 4 13.8V6.2a1.7 1.7 0 0 1 1.7-1.7z"],
    quote: ["M9 6c-2.5 1.3-4 3.6-4 6.4V18h5.5v-5.5H7.4c0-1.8.7-3 2.4-3.9z",
      "M19 6c-2.5 1.3-4 3.6-4 6.4V18h5.5v-5.5h-3.1c0-1.8.7-3 2.4-3.9z"],
    edit: ["M4 20h4L19 9a2.1 2.1 0 0 0-3-3L5 17z", "M14.5 6.5 17.5 9.5"],
    trash: ["M4 7h16", "M9.5 7V4.5h5V7", "M6.5 7l1 12.5h9L17.5 7", "M10 10.5v6", "M14 10.5v6"],
    mask: ["M3 8c3-1.2 6-1.2 9 0 3-1.2 6-1.2 9 0-.3 5.5-2.6 9-5.6 9-1.6 0-2.6-1.2-3.4-2.4C11.2 15.8 10.2 17 8.6 17 5.6 17 3.3 13.5 3 8z"],
    user: ["M12 4a3.6 3.6 0 1 0 0 7.2A3.6 3.6 0 0 0 12 4z", "M4.5 20c.7-3.6 3.7-5.6 7.5-5.6s6.8 2 7.5 5.6"],
    users: ["M9 4.5a3.2 3.2 0 1 0 0 6.4 3.2 3.2 0 0 0 0-6.4z", "M2.5 19.5c.6-3.2 3.2-5 6.5-5s5.9 1.8 6.5 5",
      "M16 5.2a3 3 0 0 1 0 5.8", "M17.5 14.8c2.2.5 3.6 2 4 4.7"],
    lock: ["M6.5 10.5h11V20h-11z", "M9 10.5V7.5a3 3 0 0 1 6 0v3", "M12 14v2.5"],
    unlock: ["M6.5 10.5h11V20h-11z", "M9 10.5V7.5a3 3 0 0 1 5.8-1.1", "M12 14v2.5"],
    link: ["M10 14a4 4 0 0 1 0-5.6l2.2-2.2a4 4 0 0 1 5.6 5.6L16.6 13",
      "M14 10a4 4 0 0 1 0 5.6l-2.2 2.2a4 4 0 0 1-5.6-5.6L7.4 11"],
    sync: ["M20 12a8 8 0 0 1-13.7 5.6", "M4 12a8 8 0 0 1 13.7-5.6", "M17.7 3.4v3.2h-3.2", "M6.3 20.6v-3.2h3.2"],
    print: ["M7 9V4h10v5", "M7 17H4.5v-6a2 2 0 0 1 2-2h11a2 2 0 0 1 2 2v6H17", "M7 14h10v6H7z"],
    archive: ["M3.5 5.5h17V9h-17z", "M5.5 9v10.5h13V9", "M10 12.5h4"],
    /* « En tête » ne se dit pas avec une étoile : une étoile note, met en favori
     * ou récompense, et aucune des trois n'a lieu ici. Ce qui est en tête est
     * ce qui rassemble le plus — donc trois barres décroissantes, qui sont la
     * miniature exacte de la barre de vote du produit. */
    lead: ["M4.5 7h15", "M4.5 12h9", "M4.5 17h4.5"],
    /* Une pile d'écrans qu'on parcourt : c'est exactement ce que la présentation
     * EST, et l'icône décrit donc l'objet au lieu de promettre de la magie.
     * Le premier dessin portait l'indicateur de progression en pastilles sous
     * l'écran ; à 13 et 16 px elles disparaissaient purement et simplement. Un
     * détail qui ne survit pas à la taille d'usage n'est pas un détail. */
    presentation: ["M8 4.5h11.5V16", "M4.5 8h11v11.5h-11z"],
    /* Une mise à jour se télécharge et s'installe. La flèche dans le bac est la
     * forme conventionnelle, et la convention est le bon choix ici : c'est du
     * chrome, et six des sept dimensions du produit restent conventionnelles. */
    update: ["M12 4v9.5", "M8.3 10 12 13.7 15.7 10", "M5 16.5v3h14v-3"],
    doc: ["M6 3.5h8l4 4V20.5H6z", "M14 3.5V8h4", "M9 12.5h6", "M9 16h4"],
    info: ["M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z", "M12 11v5.5", "M12 7.6v.8"],
    warning: ["M12 4.5 21 19.5H3z", "M12 10v4", "M12 16.6v.8"],
    logout: ["M14 5.5H6.5v13H14", "M11 12h9", "M17 8.8l3.2 3.2-3.2 3.2"],
    eye: ["M2.8 12S6.5 6.5 12 6.5 21.2 12 21.2 12 17.5 17.5 12 17.5 2.8 12 2.8 12z", "M12 9.7a2.3 2.3 0 1 0 0 4.6 2.3 2.3 0 0 0 0-4.6z"],
    flag: ["M6 20V4.5", "M6 5.2c3.5-1.6 7-1.6 10.5 0v7c-3.5 1.6-7 1.6-10.5 0z"]
  };

  /* Renvoie un <svg> autonome. `size` en pixels (24 par défaut). */
  Utils.icon = function (name, size) {
    var paths = ICON_PATHS[name] || ICON_PATHS.info;
    var svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("width", String(size || 24));
    svg.setAttribute("height", String(size || 24));
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "1.7");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("focusable", "false");
    svg.setAttribute("class", "icon icon-" + name);
    paths.forEach(function (d) {
      var path = document.createElementNS(SVG_NS, "path");
      path.setAttribute("d", d);
      svg.appendChild(path);
    });
    return svg;
  };

  /* ------------------------------------------------------------ Réactions --- */

  /* Les six réactions sont STOCKÉES sous forme d'emoji (le backend valide cette
   * liste à l'identique) mais elles ne sont plus AFFICHÉES comme telles : chaque
   * système d'exploitation dessine son propre 👌, et le rendu partait dans tous
   * les sens d'un téléphone à l'autre. On les redessine donc en marques
   * géométriques monochromes, dans la même grammaire que le jeu d'icônes —
   * elles prennent la couleur du texte, restent lisibles à 22 px et gardent la
   * même intention. La donnée est inchangée ; seul le rendu l'est.
   *
   * Chaque marque : liste de formes {t: balise, ...attributs}. `fill` par
   * défaut = currentColor, `stroke` = aucun, sauf mention contraire.
   */
  /* Choix de conception : on ne redessine PAS les mains. À 22 px, une main en
   * trait est illisible et une main pleine devient une tache. On traduit donc
   * chaque réaction par le symbole de son INTENTION — même trait, mêmes bouts
   * arrondis que les icônes d'interface, des formes franchement distinctes
   * (✓ ⚡ ≈ ✕ ⊘) reconnaissables du coin de l'œil dans un fil qui défile.
   * Le libellé accompagne la marque partout où on la choisit.
   *
   * Les clés doivent rester alignées sur Core.REACTIONS (js/state.js). Une
   * valeur absente d'ici retombe sur l'emoji brut : c'est le filet de sécurité
   * si un appareil sur une version antérieure a écrit une réaction retirée
   * depuis. */
  var REACTION_MARKS = {
    /* 👌 → coche : l'accord simple. */
    "👌": { label: "D'accord", paths: ["M4.6 12.6 9.9 17.9 19.6 6.6"] },
    /* 💪 → éclair : l'énergie, l'engagement à faire. */
    "💪": { label: "Je m'engage", paths: ["M13.6 3 6.2 13.6h5.2L10.4 21l7.4-10.6h-5.2z"] },
    /* 🤏 → onde : le « bof », l'avis mitigé. Deux chevrons rentrants avaient été
       essayés : à 22 px leurs pointes se rejoignent et redonnent une croix,
       impossible à distinguer du désaccord juste à côté. */
    "🤏": { label: "Mitigé", paths: ["M3.6 14.4c2.4-4.2 4.8-4.2 7.2 0s4.8 4.2 7.2 0", "M3.6 9.2c2.4-4.2 4.8-4.2 7.2 0s4.8 4.2 7.2 0"] },
    /* 👎 → croix : le désaccord franc. */
    "👎": { label: "Pas d'accord", paths: ["M6.6 6.6 17.4 17.4", "M17.4 6.6 6.6 17.4"] },
    /* 💩 → sens interdit : « à écarter ». Le message passe, sans le glyphe
       potache que le jeu d'origine imposait dans un outil de travail. */
    "💩": { label: "À écarter", paths: ["M12 3.8a8.2 8.2 0 1 0 0 16.4 8.2 8.2 0 0 0 0-16.4z", "M6.2 17.8 17.8 6.2"] }
  };

  Utils.reactionLabel = function (emoji) {
    var mark = REACTION_MARKS[emoji];
    return mark ? mark.label : emoji;
  };

  /* Renvoie la marque d'une réaction en <svg>. Repli sur l'emoji brut si la
   * valeur ne fait pas partie du jeu connu (donnée venue d'une autre version). */
  Utils.reactionMark = function (emoji, size) {
    var mark = REACTION_MARKS[emoji];
    if (!mark) { return document.createTextNode(emoji); }
    var svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("width", String(size || 22));
    svg.setAttribute("height", String(size || 22));
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    /* Un peu plus gras que les icônes d'interface (1.7) : une réaction est un
     * signal, pas une commande, elle doit tenir sur un fond encré. */
    svg.setAttribute("stroke-width", "2.1");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("focusable", "false");
    svg.setAttribute("class", "mark");
    mark.paths.forEach(function (d) {
      var path = document.createElementNS(SVG_NS, "path");
      path.setAttribute("d", d);
      svg.appendChild(path);
    });
    return svg;
  };

  /* ------------------------------------------------------------ Monogramme --- */

  /* Le monogramme « O. » en SVG, dessiné aux mêmes proportions que
   * assets/icons/icon.svg — mais sur fond transparent : dans l'application il
   * se pose sur le canvas, pas sur une vignette.
   *
   * Pourquoi du SVG et non deux <div> comme avant : un anneau en `border` ne
   * sait pas se tracer. Le trait, lui, s'anime par `stroke-dashoffset`.
   *
   * Le geste raconte le produit en trois temps : quatre points CONVERGENT vers
   * le centre et s'y fondent (les idées qui arrivent), le cercle se referme
   * pendant qu'ils disparaissent (la discussion les absorbe), puis un point
   * unique apparaît à côté (la décision qui en sort).
   *
   * Les quatre points de convergence n'appartiennent pas à la marque : ils
   * n'existent QUE pendant l'animation. Au repos ils sont à opacité nulle, et
   * leur animation s'y termine aussi — sans mouvement, ils ne s'affichent
   * jamais, et le monogramme reste l'anneau et son point, rien d'autre.
   *
   * Le cercle est tourné de -90° pour que le tracé PARTE DU HAUT : sans cette
   * rotation, un <circle> commence à 3 h et le geste devient illisible.
   *
   * L'animation elle-même vit dans app.css et ne se joue qu'à l'arrivée sur un
   * écran, sous `prefers-reduced-motion: no-preference`. L'état AU REPOS de ce
   * balisage est l'état FINAL : sans animation, le monogramme est complet et
   * bien placé — jamais un cercle à moitié tracé.
   */
  var LOGO = { cx: 43.5, cy: 50, r: 19.44, w: 9.12, dx: 81.78, dy: 67.2, dr: 6.8 };
  /* Périmètre du cercle : longueur du tiret qui sert au tracé. Calculé, pas
   * saisi — un rayon modifié ne doit pas laisser une valeur en dur derrière. */
  var LOGO_C = 2 * Math.PI * LOGO.r;

  Utils.logoMark = function (size) {
    var px = size || 44;
    var svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("viewBox", "0 0 100 100");
    svg.setAttribute("width", String(px));
    svg.setAttribute("height", String(px));
    svg.setAttribute("fill", "none");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("focusable", "false");
    svg.setAttribute("class", "logo-mark");

    /* Positions de départ, en unités du viewBox, relatives au centre de
     * l'anneau. Réparties sur les quatre quadrants et à des distances
     * inégales : quatre points équidistants forment une croix, et une croix se
     * lit comme un motif décoratif, pas comme des idées qui arrivent. */
    var SEMENCES = [[-26, -20], [24, -26], [-30, 14], [10, 26]];
    for (var i = 0; i < SEMENCES.length; i++) {
      var semence = document.createElementNS(SVG_NS, "circle");
      semence.setAttribute("cx", String(LOGO.cx));
      semence.setAttribute("cy", String(LOGO.cy));
      semence.setAttribute("r", "4.2");
      semence.setAttribute("fill", "currentColor");
      semence.setAttribute("class", "logo-seed");
      semence.style.setProperty("--sx", SEMENCES[i][0] + "px");
      semence.style.setProperty("--sy", SEMENCES[i][1] + "px");
      /* Même raison que pour le point : une origine en pourcentage exigerait
       * `transform-box: fill-box`. En unités utilisateur, elle est juste
       * partout, sans propriété supplémentaire. */
      semence.style.transformOrigin = LOGO.cx + "px " + LOGO.cy + "px";
      /* L'état AU REPOS est l'invisibilité : c'est ce qui rend le repli en
       * mouvement réduit correct sans règle dédiée. */
      semence.style.opacity = "0";
      svg.appendChild(semence);
    }

    var ring = document.createElementNS(SVG_NS, "circle");
    ring.setAttribute("cx", String(LOGO.cx));
    ring.setAttribute("cy", String(LOGO.cy));
    ring.setAttribute("r", String(LOGO.r));
    ring.setAttribute("stroke", "currentColor");
    ring.setAttribute("stroke-width", String(LOGO.w));
    /* Bouts DROITS, volontairement — c'est le seul endroit du fichier où l'on
     * s'écarte des bouts arrondis du jeu d'icônes. Le tracé se fait avec un
     * tiret d'exactement une circonférence : avec des bouts arrondis, les deux
     * extrémités se recouvrent d'un demi-trait une fois le cercle refermé et
     * laissent un épaississement visible en haut de l'anneau. Bouts droits,
     * elles se rejoignent au pixel près. */
    ring.setAttribute("class", "logo-ring");
    ring.style.setProperty("--logo-c", LOGO_C.toFixed(2));
    svg.appendChild(ring);

    /* Le point est le seul froid de la marque au repos : l'anneau diverge, le
     * point est ce sur quoi tout converge. C'est là que l'identité se loge —
     * pas dans une couleur répandue sur toute l'interface. */
    var dot = document.createElementNS(SVG_NS, "circle");
    dot.setAttribute("cx", String(LOGO.dx));
    dot.setAttribute("cy", String(LOGO.dy));
    dot.setAttribute("r", String(LOGO.dr));
    dot.setAttribute("fill", "var(--accord)");
    dot.setAttribute("class", "logo-dot");
    /* Origine de transformation en UNITÉS UTILISATEUR, pas en pourcentage.
     * Un `transform-origin: 50% 50%` sur un élément SVG se résout contre le
     * viewBox entier tant que `transform-box: fill-box` n'est pas appliqué —
     * et là où cette propriété manque, le point ne grossirait pas sur
     * lui-même mais depuis le centre du dessin. Des coordonnées absolues n'ont
     * besoin d'aucune propriété supplémentaire pour être justes. */
    dot.style.transformOrigin = LOGO.dx + "px " + LOGO.dy + "px";
    svg.appendChild(dot);

    return svg;
  };

  /* `Utils.splitChars` a été retiré ici. Il découpait le logotype en <span>
   * animables pour la montée caractère par caractère ; le logotype monte
   * désormais d'un seul tenant (cf. app.css, .wordmark). Neuf éléments animés
   * sont redevenus un, et le titre est du texte, pas neuf boîtes en ligne —
   * ce qui rend aussi sa sélection et sa lecture par synthèse vocale plus
   * simples. Aucun autre appelant n'existait.
   */

  /* --------------------------------------------------------------- Dates --- */

  Utils.nowISO = function () { return new Date().toISOString(); };

  /* Horloge MONOTONE, en millisecondes, pour mesurer une durée écoulée.
   * `performance.now()` et non `Date.now()` : l'heure système peut reculer —
   * changement d'heure, synchronisation NTP, utilisateur qui la règle — et un
   * écart négatif ferait passer une animation pour terminée, ou l'inverse.
   * Repli sur Date.now() là où performance manque, ce qui n'arrive plus sur le
   * parc visé mais ne coûte rien à couvrir. */
  Utils.now = function () {
    return (typeof performance !== "undefined" && performance.now)
      ? performance.now()
      : Date.now();
  };

  function pad(n) { return n < 10 ? "0" + n : String(n); }

  Utils.formatTime = function (iso) {
    var d = new Date(iso);
    if (isNaN(d.getTime())) { return ""; }
    return pad(d.getHours()) + ":" + pad(d.getMinutes());
  };

  Utils.formatDate = function (iso) {
    var d = new Date(iso);
    if (isNaN(d.getTime())) { return ""; }
    return d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
  };

  Utils.formatDateTime = function (iso) {
    var d = new Date(iso);
    if (isNaN(d.getTime())) { return ""; }
    return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" }) +
      " à " + pad(d.getHours()) + ":" + pad(d.getMinutes());
  };

  Utils.sameDay = function (a, b) {
    var da = new Date(a), db = new Date(b);
    return da.getFullYear() === db.getFullYear() && da.getMonth() === db.getMonth() && da.getDate() === db.getDate();
  };

  Utils.relativeDay = function (iso) {
    var d = new Date(iso);
    if (isNaN(d.getTime())) { return ""; }
    var today = new Date();
    var yesterday = new Date(today.getTime() - 86400000);
    if (Utils.sameDay(d, today)) { return "Aujourd'hui"; }
    if (Utils.sameDay(d, yesterday)) { return "Hier"; }
    return Utils.formatDate(iso);
  };

  /* ------------------------------------------------------------ Chaînes --- */

  Utils.uid = function () {
    if (root.crypto && typeof root.crypto.randomUUID === "function") {
      return root.crypto.randomUUID();
    }
    var bytes = new Uint8Array(16);
    if (root.crypto && root.crypto.getRandomValues) {
      root.crypto.getRandomValues(bytes);
    } else {
      for (var i = 0; i < 16; i++) { bytes[i] = Math.floor(Math.random() * 256); }
    }
    var hex = "";
    for (var j = 0; j < bytes.length; j++) { hex += (bytes[j] + 0x100).toString(16).slice(1); }
    return hex;
  };

  Utils.trim = function (value) { return String(value == null ? "" : value).trim(); };

  Utils.limit = function (value, max) { return Utils.trim(value).slice(0, max); };

  Utils.initials = function (name) {
    var parts = Utils.trim(name).split(/\s+/).filter(Boolean);
    if (!parts.length) { return "?"; }
    if (parts.length === 1) { return parts[0].slice(0, 2).toUpperCase(); }
    return (parts[0][0] + parts[1][0]).toUpperCase();
  };

  Utils.plural = function (count, singular, plural) {
    return count + " " + (count > 1 ? plural : singular);
  };

  /* ------------------------------------------------------------ Hachage --- */

  function toHex(buffer) {
    var view = new Uint8Array(buffer);
    var out = "";
    for (var i = 0; i < view.length; i++) { out += (view[i] + 0x100).toString(16).slice(1); }
    return out;
  }

  /* SHA-256 hexadécimal minuscule. Le backend Apps Script doit produire
   * exactement la même chaîne (attention aux octets signés côté Google). */
  Utils.sha256Hex = function (text) {
    var subtle = root.crypto && root.crypto.subtle;
    if (subtle) {
      return subtle.digest("SHA-256", new TextEncoder().encode(text)).then(toHex);
    }
    /* Repli Node (tests hors navigateur). */
    var nodeCrypto = require("crypto");
    return Promise.resolve(nodeCrypto.createHash("sha256").update(text, "utf8").digest("hex"));
  };

  /* ---------------------------------------------------------- Stockage --- */

  Utils.storage = {
    get: function (key, fallback) {
      try {
        var raw = root.localStorage.getItem(key);
        if (raw === null) { return fallback; }
        return JSON.parse(raw);
      } catch (e) { return fallback; }
    },
    set: function (key, value) {
      try { root.localStorage.setItem(key, JSON.stringify(value)); return true; }
      catch (e) { return false; }
    },
    remove: function (key) {
      try { root.localStorage.removeItem(key); } catch (e) { /* ignoré */ }
    },

    /* Sonde d'écriture. `set` échoue en SILENCE — navigation privée, quota atteint,
     * stockage cloisonné d'une fenêtre in-app —, et sans sonde l'application ne peut
     * pas dire « cet appareil n'enregistre rien ». Elle affirme alors des choses
     * fausses à la place : « pas encore vue » juste après avoir été vue.
     *
     * On sonde en ÉCRIVANT : sur plusieurs moteurs, lire réussit là où écrire échoue.
     * La clé est retirée aussitôt. */
    available: function () {
      var probe = "brainsto.probe";
      try {
        root.localStorage.setItem(probe, "1");
        root.localStorage.removeItem(probe);
        return true;
      } catch (e) { return false; }
    }
  };

  /* --------------------------------------------------------------- Divers --- */

  /* Empreinte courte et STABLE d'un texte, pour comparer à l'œil deux appareils
   * (« sommes-nous bien sur le même espace d'équipe ? ») sans jamais afficher
   * l'adresse du script. Ce n'est pas un contrôle de sécurité : juste un code de
   * comparaison, calculé sur l'appareil et jamais transmis. */
  Utils.fingerprint = function (text) {
    var value = String(text == null ? "" : text);
    var h1 = 0x811c9dc5;
    var h2 = 0x1000193;
    for (var i = 0; i < value.length; i++) {
      var c = value.charCodeAt(i);
      h1 = (h1 ^ c) >>> 0;
      h1 = Math.imul(h1, 0x01000193) >>> 0;
      h2 = (h2 + Math.imul(c + i, 0x85ebca6b)) >>> 0;
    }
    var hex = ((h1 ^ h2) >>> 0).toString(16).toUpperCase();
    while (hex.length < 8) { hex = "0" + hex; }
    return hex.slice(0, 4) + "-" + hex.slice(4);
  };

  Utils.clone = function (value) {
    return value === undefined ? value : JSON.parse(JSON.stringify(value));
  };

  Utils.debounce = function (fn, delay) {
    var timer = null;
    return function () {
      var args = arguments, self = this;
      if (timer) { clearTimeout(timer); }
      timer = setTimeout(function () { timer = null; fn.apply(self, args); }, delay);
    };
  };

  root.Utils = Utils;
  if (typeof module !== "undefined" && module.exports) { module.exports = Utils; }
})(typeof globalThis !== "undefined" ? globalThis : this);
