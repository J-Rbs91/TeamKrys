/**
 * Fonctions utilitaires partagées : identifiants, dates, validation, DOM.
 * Aucune dépendance externe.
 */
const Utils = (function () {
  // --- Identifiants ---------------------------------------------------------

  function uuid() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") {
      return window.crypto.randomUUID();
    }
    // Repli simple (navigateurs anciens)
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
      const r = (Math.random() * 16) | 0;
      const v = c === "x" ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  function nowIso() {
    return new Date().toISOString();
  }

  // --- Dates ----------------------------------------------------------------

  function formatDate(iso) {
    if (!iso) return "";
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleString("fr-FR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function formatTime(iso) {
    if (!iso) return "";
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  }

  // --- Validation -----------------------------------------------------------

  const LIMITS = {
    name: 50,
    topicTitle: 150,
    topicDescription: 3000,
    message: 3000,
    proposalTitle: 200,
    proposalDescription: 3000,
    conclusion: 5000,
  };

  const TOPIC_STATUSES = ["open", "ready", "closed", "archived"];
  const PROPOSAL_STATUSES = ["voting", "selected", "debate", "implemented", "rejected"];
  const VOTES = ["for", "against", "abstain"];

  /** Nettoie une chaîne : trim, et renvoie "" si vide. */
  function clean(value) {
    if (value === undefined || value === null) return "";
    return String(value).trim();
  }

  /** Vrai si la chaîne est vide ou uniquement composée d'espaces. */
  function isBlank(value) {
    return clean(value).length === 0;
  }

  function within(value, max) {
    return clean(value).length <= max;
  }

  // --- DOM (sécurisé, texte brut uniquement) -------------------------------

  /**
   * Crée un élément. Les enfants texte sont insérés via textContent,
   * jamais via innerHTML, afin d'éviter toute injection de contenu.
   */
  function el(tag, attrs, children) {
    const node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (key) {
        const val = attrs[key];
        if (key === "class") node.className = val;
        else if (key === "text") node.textContent = val;
        else if (key === "html") throw new Error("innerHTML interdit");
        else if (key.slice(0, 2) === "on" && typeof val === "function") {
          node.addEventListener(key.slice(2).toLowerCase(), val);
        } else if (val === true) node.setAttribute(key, "");
        else if (val !== false && val !== null && val !== undefined) {
          node.setAttribute(key, val);
        }
      });
    }
    if (children !== undefined && children !== null) {
      appendChildren(node, children);
    }
    return node;
  }

  function appendChildren(node, children) {
    if (Array.isArray(children)) {
      children.forEach(function (c) {
        appendChildren(node, c);
      });
    } else if (children instanceof Node) {
      node.appendChild(children);
    } else if (children !== null && children !== undefined && children !== false) {
      node.appendChild(document.createTextNode(String(children)));
    }
  }

  function clear(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
  }

  return {
    uuid: uuid,
    nowIso: nowIso,
    formatDate: formatDate,
    formatTime: formatTime,
    LIMITS: LIMITS,
    TOPIC_STATUSES: TOPIC_STATUSES,
    PROPOSAL_STATUSES: PROPOSAL_STATUSES,
    VOTES: VOTES,
    clean: clean,
    isBlank: isBlank,
    within: within,
    el: el,
    clear: clear,
  };
})();
