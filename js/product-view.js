/* BrainstO. — règles pures de présentation produit.
 *
 * Ce module ne modifie ni l'état partagé ni le protocole d'actions. Il centralise
 * des décisions de présentation qui doivent rester testables sans DOM : ordre de
 * maturité des sujets et lecture de la participation aux votes.
 */
(function (root) {
  "use strict";

  var ProductView = {};

  function arr(value) { return Array.isArray(value) ? value : []; }

  function recentFirst(a, b) {
    return String((b && b.updatedAt) || "").localeCompare(String((a && a.updatedAt) || ""));
  }

  /*
   * L'accueil doit montrer la maturité avant l'activité :
   *   ready → open → closed → archived.
   *
   * Le tri par activité récente reste pertinent À L'INTÉRIEUR de chaque groupe.
   * Les statuts inattendus sont rabattus sur « open » : l'état normalisé ne doit
   * normalement jamais en produire, mais une ancienne donnée ne doit pas disparaître.
   */
  ProductView.groupTopics = function (topics) {
    var groups = { ready: [], open: [], closed: [], archived: [] };

    arr(topics).forEach(function (topic) {
      if (!topic || typeof topic !== "object") { return; }
      var status = topic.status;
      if (!Object.prototype.hasOwnProperty.call(groups, status)) { status = "open"; }
      groups[status].push(topic);
    });

    Object.keys(groups).forEach(function (status) {
      groups[status] = groups[status].slice().sort(recentFirst);
    });

    return groups;
  };

  /*
   * Un résultat de vote n'est interprétable qu'avec sa participation.
   * `participants` accepte soit le tableau de participants connus, soit directement
   * un nombre afin de garder la fonction simple à tester et réutiliser.
   */
  ProductView.voteParticipation = function (proposal, participants) {
    var votes = proposal && proposal.votes && typeof proposal.votes === "object"
      ? proposal.votes : {};
    var voters = Object.keys(votes).length;
    var total = Array.isArray(participants)
      ? participants.length
      : (typeof participants === "number" && isFinite(participants) ? Math.max(0, Math.floor(participants)) : 0);

    return {
      voters: voters,
      total: total,
      percent: total > 0 ? Math.round((voters / total) * 100) : null,
      complete: total > 0 && voters >= total
    };
  };

  root.ProductView = ProductView;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = ProductView;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
