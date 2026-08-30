/* BrainstO. — règles pures de présentation produit.
 *
 * Ce module ne modifie ni l'état partagé ni le protocole d'actions. Il centralise
 * les décisions de présentation qui doivent rester testables sans DOM : ordre de
 * maturité des sujets, participation aux votes, activité non lue et statuts de
 * proposition encore autorisés par la doctrine produit.
 */
(function (root) {
  "use strict";

  var ProductView = {};

  function arr(value) { return Array.isArray(value) ? value : []; }
  function obj(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }

  function recentFirst(a, b) {
    return String((b && b.updatedAt) || "").localeCompare(String((a && a.updatedAt) || ""));
  }

  ProductView.TOPIC_GROUP_ORDER = ["ready", "open", "closed", "archived"];
  ProductView.TOPIC_GROUP_LABELS = {
    ready: "Prêts pour la réunion",
    open: "En discussion",
    closed: "Clôturés",
    archived: "Archivés"
  };

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

  ProductView.visibleTopics = function (topics, query, showArchived) {
    var normalized = String(query || "").trim().toLowerCase();
    return arr(topics)
      .slice()
      .sort(recentFirst)
      .filter(function (topic) { return showArchived || topic.status !== "archived"; })
      .filter(function (topic) {
        if (!normalized) { return true; }
        return String((topic.title || "") + " " + (topic.description || ""))
          .toLowerCase().indexOf(normalized) >= 0;
      });
  };

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

  ProductView.voteCounts = function (proposal) {
    var votes = obj(proposal && proposal.votes);
    var counts = { for: 0, against: 0, abstain: 0 };
    Object.keys(votes).forEach(function (participantId) {
      var value = votes[participantId];
      if (Object.prototype.hasOwnProperty.call(counts, value)) { counts[value] += 1; }
    });
    counts.total = counts.for + counts.against + counts.abstain;
    counts.expressed = counts.for + counts.against;
    counts.favorablePercent = counts.expressed
      ? Math.round((counts.for / counts.expressed) * 100)
      : 0;
    return counts;
  };

  /* Le mot « Consensus » est réservé à l'étape dédiée. */
  ProductView.voteLabel = function (proposal) {
    var counts = ProductView.voteCounts(proposal);
    if (!counts.total) { return "Aucun vote"; }
    if (!counts.expressed) { return "Abstentions uniquement"; }
    if (!counts.against) { return "Avis exprimés favorables"; }
    if (counts.for === counts.against) { return "Avis partagés"; }
    if (counts.for > counts.against) { return "Avis exprimés plutôt favorables"; }
    return "Avis exprimés plutôt défavorables";
  };

  ProductView.voteAriaLabel = function (proposal, participants) {
    var counts = ProductView.voteCounts(proposal);
    var participation = ProductView.voteParticipation(proposal, participants);
    var bits = [
      counts.for + " pour",
      counts.against + " contre",
      counts.abstain + " abstention" + (counts.abstain > 1 ? "s" : "")
    ];
    if (participation.total > 0) {
      bits.push(participation.voters + " sur " + participation.total + " participants ont voté");
    }
    if (counts.expressed > 0) {
      bits.push(counts.favorablePercent + " % des avis exprimés favorables");
    }
    return ProductView.voteLabel(proposal) + ". " + bits.join(". ") + ".";
  };

  ProductView.topicFingerprint = function (topic) {
    var proposals = arr(topic && topic.proposals);
    var proposalVotes = 0;
    proposals.forEach(function (proposal) {
      proposalVotes += Object.keys(obj(proposal && proposal.votes)).length;
    });
    return {
      updatedAt: String((topic && topic.updatedAt) || ""),
      status: String((topic && topic.status) || ""),
      messages: arr(topic && topic.messages).length,
      proposals: proposals.length,
      proposalVotes: proposalVotes,
      consensus: arr(topic && topic.conclusions).length,
      consensusVotes: Object.keys(obj(topic && topic.conclusionVotes)).length
    };
  };

  /* `baselineExists` distingue un appareil qui vient d'activer la fonctionnalité
   * d'un appareil déjà initialisé sur lequel un collègue crée ensuite un nouveau sujet. */
  ProductView.topicActivity = function (topic, seen, baselineExists) {
    var current = ProductView.topicFingerprint(topic);
    var previous = seen && typeof seen === "object" ? seen : null;
    if (!previous) {
      return baselineExists
        ? { changed: true, label: "Nouveau sujet", current: current }
        : { changed: false, label: null, current: current };
    }

    var messageDelta = current.messages - (Number(previous.messages) || 0);
    var proposalDelta = current.proposals - (Number(previous.proposals) || 0);
    var consensusDelta = current.consensus - (Number(previous.consensus) || 0);
    var votesChanged = current.proposalVotes !== (Number(previous.proposalVotes) || 0);
    var consensusVotesChanged = current.consensusVotes !== (Number(previous.consensusVotes) || 0);
    var updated = current.updatedAt !== String(previous.updatedAt || "") || current.status !== String(previous.status || "");

    if (messageDelta > 0) {
      return { changed: true, label: "+" + messageDelta + " message" + (messageDelta > 1 ? "s" : ""), current: current };
    }
    if (proposalDelta > 0) {
      return { changed: true, label: "+" + proposalDelta + " proposition" + (proposalDelta > 1 ? "s" : ""), current: current };
    }
    if (consensusDelta > 0 || consensusVotesChanged) {
      return { changed: true, label: "Consensus mis à jour", current: current };
    }
    if (votesChanged) {
      return { changed: true, label: "Votes mis à jour", current: current };
    }
    if (updated) {
      return { changed: true, label: "Mis à jour", current: current };
    }
    return { changed: false, label: null, current: current };
  };

  ProductView.PROPOSAL_STATUS_SELECTABLE = ["voting", "debate", "rejected"];
  ProductView.PROPOSAL_LEGACY_LABELS = {
    selected: "Retenue (ancien statut)",
    implemented: "Mise en place (ancien statut)"
  };

  ProductView.isProposalStatusSelectable = function (status) {
    return ProductView.PROPOSAL_STATUS_SELECTABLE.indexOf(status) >= 0;
  };

  root.ProductView = ProductView;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = ProductView;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
