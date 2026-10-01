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

  /* Empreinte courte (32 bits) : le marqueur local garde de quoi voir qu'une chose a
   * changé, jamais un texte de message, un nom ni un identifiant d'auteur. */
  function shortHash(text) {
    var h = 5381;
    for (var i = 0; i < text.length; i++) { h = ((h << 5) + h + text.charCodeAt(i)) | 0; }
    return (h >>> 0).toString(36);
  }

  function txt(value) { return String(value == null ? "" : value); }

  /* Ce que LES AUTRES ont fait dans le sujet : les mêmes compteurs que l'empreinte
   * historique, plus une signature de tout le reste (valeur des votes, réactions,
   * modifications, statut des propositions, titre). Rien de ce qui vient de cet appareil
   * n'y entre : ni mes messages, propositions et formulations (auteur == moi, ou
   * identifiant dans la preuve locale pour un contenu anonyme), ni mes votes, réactions
   * et soutiens (clé == mon identifiant). Les horodatages que le serveur pose à la
   * confirmation de mes actions ne comptent donc jamais (§11, ROADMAP P3.1). */
  function withoutMine(topic, mine) {
    var me = txt(mine.id);
    function mineItem(item) {
      var authorId = item && item.authorId;
      return authorId ? authorId === me : mine.owns(item && item.id, "") === true;
    }
    function others(map) {
      var out = [];
      Object.keys(obj(map)).sort().forEach(function (key) {
        if (key !== me) { out.push(key + "=" + map[key]); }
      });
      return out;
    }

    var counts = { messages: 0, proposals: 0, proposalVotes: 0, consensus: 0, consensusVotes: 0 };
    var parts = [txt(topic && topic.title), txt(topic && topic.description)];

    arr(topic && topic.messages).forEach(function (message) {
      if (!mineItem(message)) {
        counts.messages += 1;
        parts.push("m" + txt(message && message.id) + "@" + txt(message && message.updatedAt));
      }
      var reacted = others(message && message.reactions);
      if (reacted.length) { parts.push("r" + txt(message && message.id) + ":" + reacted.join(",")); }
    });
    arr(topic && topic.proposals).forEach(function (proposal) {
      var votes = others(proposal && proposal.votes);
      var status = txt(proposal && proposal.status);
      var own = mineItem(proposal);
      counts.proposalVotes += votes.length;
      if (!own) {
        counts.proposals += 1;
        parts.push("p" + txt(proposal && proposal.id) + ":" + txt(proposal && proposal.title) + "\n" + txt(proposal && proposal.description));
      }
      /* Ma proposition ne laisse de trace que si d'autres la font évoluer (votes, statut) :
       * la voir apparaître ne doit pas changer la signature. */
      if (!own || votes.length || status !== "voting") {
        parts.push("v" + txt(proposal && proposal.id) + ":" + status + ":" + votes.join(","));
      }
    });
    arr(topic && topic.conclusions).forEach(function (conclusion) {
      if (!mineItem(conclusion)) {
        counts.consensus += 1;
        parts.push("c" + txt(conclusion && conclusion.id) + "@" + txt(conclusion && conclusion.updatedAt));
      }
    });
    var supports = others(topic && topic.conclusionVotes);
    counts.consensusVotes = supports.length;
    parts.push("s" + supports.join(","));

    counts.sig = shortHash(parts.join("|"));
    return counts;
  }

  /* `mine` (facultatif) = { id, owns(id, authorId) } : la preuve locale de cet appareil,
   * lue dans app.js et strictement locale (§11). Avec lui l'empreinte porte aussi `o`, le
   * point de vue « sans moi », et `by`, l'identité qui l'a calculé. Sans lui : la forme
   * historique, inchangée. */
  ProductView.topicFingerprint = function (topic, mine) {
    var proposals = arr(topic && topic.proposals);
    var proposalVotes = 0;
    proposals.forEach(function (proposal) {
      proposalVotes += Object.keys(obj(proposal && proposal.votes)).length;
    });
    var fingerprint = {
      updatedAt: String((topic && topic.updatedAt) || ""),
      status: String((topic && topic.status) || ""),
      messages: arr(topic && topic.messages).length,
      proposals: proposals.length,
      proposalVotes: proposalVotes,
      consensus: arr(topic && topic.conclusions).length,
      consensusVotes: Object.keys(obj(topic && topic.conclusionVotes)).length
    };
    if (mine && typeof mine.owns === "function") {
      fingerprint.by = shortHash(txt(mine.id));
      fingerprint.o = withoutMine(topic, mine);
    }
    return fingerprint;
  };

  /* `baselineExists` distingue un appareil qui vient d'activer la fonctionnalité
   * d'un appareil déjà initialisé sur lequel un collègue crée ensuite un nouveau sujet. */
  ProductView.topicActivity = function (topic, seen, baselineExists, mine) {
    var current = ProductView.topicFingerprint(topic, mine);
    var previous = seen && typeof seen === "object" ? seen : null;
    if (!previous) {
      return baselineExists
        ? { changed: true, label: "Nouveau sujet", current: current }
        : { changed: false, label: null, current: current };
    }

    /* Point de vue « sans moi » des deux côtés (même appareil, même identité) : seules les
     * actions des autres comptent, et la signature remplace l'horodatage du sujet, que mes
     * propres actions font changer à la confirmation du serveur. Un marqueur plus ancien,
     * ou pris sous une autre identité (reconnexion), se lit comme avant. */
    var scoped = !!(current.o && previous.o && previous.by === current.by);
    var now = scoped ? current.o : current;
    var then = scoped ? previous.o : previous;

    var messageDelta = now.messages - (Number(then.messages) || 0);
    var proposalDelta = now.proposals - (Number(then.proposals) || 0);
    var consensusDelta = now.consensus - (Number(then.consensus) || 0);
    var votesChanged = now.proposalVotes !== (Number(then.proposalVotes) || 0);
    var consensusVotesChanged = now.consensusVotes !== (Number(then.consensusVotes) || 0);
    var updated = (scoped ? now.sig !== then.sig : current.updatedAt !== String(previous.updatedAt || "")) ||
      current.status !== String(previous.status || "");

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
