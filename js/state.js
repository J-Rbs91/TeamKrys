/**
 * État applicatif et logique métier (réducteur d'actions).
 *
 * Le réducteur `applyAction` est volontairement identique, dans sa logique,
 * à celui du backend Google Apps Script (apps-script/Code.gs). Le frontend
 * l'utilise pour appliquer les actions de manière optimiste ; le serveur
 * fait autorité.
 */
const State = (function () {
  // Libellés français des statuts.
  const TOPIC_STATUS_LABELS = {
    open: "Ouvert",
    ready: "Prêt pour la réunion",
    closed: "Traité",
    archived: "Archivé",
  };

  const PROPOSAL_STATUS_LABELS = {
    voting: "Vote en cours",
    selected: "Solution retenue",
    debate: "À débattre en réunion",
    implemented: "À mettre en œuvre",
    rejected: "Solution écartée",
  };

  const VOTE_LABELS = {
    for: "Pour",
    against: "Contre",
    abstain: "Abstention",
  };

  function emptyData() {
    return {
      revision: 0,
      updatedAt: null,
      participants: [],
      topics: [],
    };
  }

  // --- Recherche ------------------------------------------------------------

  function findTopic(data, topicId) {
    return data.topics.find(function (t) {
      return t.id === topicId;
    });
  }

  function findProposal(topic, proposalId) {
    return topic.proposals.find(function (p) {
      return p.id === proposalId;
    });
  }

  function findMessage(topic, messageId) {
    return topic.messages.find(function (m) {
      return m.id === messageId;
    });
  }

  // --- Validation -----------------------------------------------------------

  /**
   * Valide une action contre l'état courant.
   * Renvoie { ok:true } ou { ok:false, error:"message" }.
   */
  function validateAction(action, data) {
    if (!action || !action.actionId) return err("Action sans identifiant.");
    if (!action.type) return err("Action sans type.");
    if (!action.participant || !action.participant.id) return err("Action sans auteur.");

    const p = action.payload || {};

    switch (action.type) {
      case "REGISTER_PARTICIPANT":
        if (Utils.isBlank(action.participant.name)) return err("Prénom vide.");
        break;
      case "UPDATE_PARTICIPANT":
        if (Utils.isBlank(action.participant.name)) return err("Prénom vide.");
        break;
      case "CREATE_TOPIC":
        if (!p.topicId) return err("Identifiant de sujet manquant.");
        if (Utils.isBlank(p.title)) return err("Le titre du sujet est obligatoire.");
        break;
      case "UPDATE_TOPIC":
        if (!findTopic(data, p.topicId)) return err("Sujet introuvable.");
        if (Utils.isBlank(p.title)) return err("Le titre du sujet est obligatoire.");
        break;
      case "CHANGE_TOPIC_STATUS":
        if (!findTopic(data, p.topicId)) return err("Sujet introuvable.");
        if (Utils.TOPIC_STATUSES.indexOf(p.status) === -1) return err("Statut de sujet inconnu.");
        break;
      case "CREATE_MESSAGE":
        if (!findTopic(data, p.topicId)) return err("Sujet introuvable.");
        if (!p.messageId) return err("Identifiant de message manquant.");
        if (Utils.isBlank(p.text)) return err("Le message est vide.");
        break;
      case "UPDATE_MESSAGE": {
        const t = findTopic(data, p.topicId);
        if (!t) return err("Sujet introuvable.");
        if (!findMessage(t, p.messageId)) return err("Message introuvable.");
        if (Utils.isBlank(p.text)) return err("Le message est vide.");
        break;
      }
      case "CREATE_PROPOSAL":
        if (!findTopic(data, p.topicId)) return err("Sujet introuvable.");
        if (!p.proposalId) return err("Identifiant de proposition manquant.");
        if (Utils.isBlank(p.title)) return err("Le titre de la proposition est obligatoire.");
        break;
      case "UPDATE_PROPOSAL": {
        const t = findTopic(data, p.topicId);
        if (!t) return err("Sujet introuvable.");
        if (!findProposal(t, p.proposalId)) return err("Proposition introuvable.");
        if (Utils.isBlank(p.title)) return err("Le titre de la proposition est obligatoire.");
        break;
      }
      case "CHANGE_PROPOSAL_STATUS": {
        const t = findTopic(data, p.topicId);
        if (!t) return err("Sujet introuvable.");
        if (!findProposal(t, p.proposalId)) return err("Proposition introuvable.");
        if (Utils.PROPOSAL_STATUSES.indexOf(p.status) === -1) return err("Statut de proposition inconnu.");
        break;
      }
      case "SET_VOTE": {
        const t = findTopic(data, p.topicId);
        if (!t) return err("Sujet introuvable.");
        if (!findProposal(t, p.proposalId)) return err("Proposition introuvable.");
        if (Utils.VOTES.indexOf(p.vote) === -1) return err("Vote inconnu.");
        break;
      }
      case "REMOVE_VOTE": {
        const t = findTopic(data, p.topicId);
        if (!t) return err("Sujet introuvable.");
        if (!findProposal(t, p.proposalId)) return err("Proposition introuvable.");
        break;
      }
      case "UPDATE_CONCLUSION":
        if (!findTopic(data, p.topicId)) return err("Sujet introuvable.");
        break;
      default:
        return err("Type d'action inconnu : " + action.type);
    }
    return { ok: true };
  }

  function err(message) {
    return { ok: false, error: message };
  }

  // --- Réducteur ------------------------------------------------------------

  /**
   * Applique une action sur `data` (mutation en place).
   * `data` doit être une copie que l'appelant peut modifier.
   * Suppose que l'action a déjà été validée.
   */
  function applyAction(data, action) {
    const p = action.payload || {};
    const author = { id: action.participant.id, name: action.participant.name };
    const at = action.createdAt || Utils.nowIso();

    switch (action.type) {
      case "REGISTER_PARTICIPANT":
      case "UPDATE_PARTICIPANT": {
        const existing = data.participants.find(function (x) {
          return x.id === author.id;
        });
        if (existing) existing.name = author.name;
        else data.participants.push({ id: author.id, name: author.name });
        break;
      }
      case "CREATE_TOPIC":
        data.topics.push({
          id: p.topicId,
          title: p.title,
          description: p.description || "",
          status: "open",
          createdBy: author,
          createdAt: at,
          updatedAt: at,
          messages: [],
          proposals: [],
          conclusion: "",
          conclusionUpdatedAt: null,
          conclusionUpdatedBy: null,
        });
        break;
      case "UPDATE_TOPIC": {
        const t = findTopic(data, p.topicId);
        t.title = p.title;
        t.description = p.description || "";
        t.updatedAt = at;
        break;
      }
      case "CHANGE_TOPIC_STATUS": {
        const t = findTopic(data, p.topicId);
        t.status = p.status;
        t.updatedAt = at;
        break;
      }
      case "CREATE_MESSAGE": {
        const t = findTopic(data, p.topicId);
        t.messages.push({
          id: p.messageId,
          authorId: author.id,
          authorName: author.name,
          text: p.text,
          createdAt: at,
          updatedAt: null,
        });
        t.updatedAt = at;
        break;
      }
      case "UPDATE_MESSAGE": {
        const t = findTopic(data, p.topicId);
        const m = findMessage(t, p.messageId);
        m.text = p.text;
        m.updatedAt = at;
        t.updatedAt = at;
        break;
      }
      case "CREATE_PROPOSAL": {
        const t = findTopic(data, p.topicId);
        t.proposals.push({
          id: p.proposalId,
          title: p.title,
          description: p.description || "",
          authorId: author.id,
          authorName: author.name,
          createdAt: at,
          status: "voting",
          votes: {},
        });
        t.updatedAt = at;
        break;
      }
      case "UPDATE_PROPOSAL": {
        const t = findTopic(data, p.topicId);
        const pr = findProposal(t, p.proposalId);
        pr.title = p.title;
        pr.description = p.description || "";
        t.updatedAt = at;
        break;
      }
      case "CHANGE_PROPOSAL_STATUS": {
        const t = findTopic(data, p.topicId);
        const pr = findProposal(t, p.proposalId);
        pr.status = p.status;
        t.updatedAt = at;
        break;
      }
      case "SET_VOTE": {
        const t = findTopic(data, p.topicId);
        const pr = findProposal(t, p.proposalId);
        pr.votes[author.id] = p.vote;
        t.updatedAt = at;
        break;
      }
      case "REMOVE_VOTE": {
        const t = findTopic(data, p.topicId);
        const pr = findProposal(t, p.proposalId);
        delete pr.votes[author.id];
        t.updatedAt = at;
        break;
      }
      case "UPDATE_CONCLUSION": {
        const t = findTopic(data, p.topicId);
        t.conclusion = p.conclusion || "";
        t.conclusionUpdatedAt = at;
        t.conclusionUpdatedBy = author;
        t.updatedAt = at;
        break;
      }
    }
    data.updatedAt = at;
    return data;
  }

  // --- Analyse des votes ----------------------------------------------------

  function tally(proposal) {
    const votes = proposal.votes || {};
    let forCount = 0,
      against = 0,
      abstain = 0;
    Object.keys(votes).forEach(function (id) {
      if (votes[id] === "for") forCount++;
      else if (votes[id] === "against") against++;
      else if (votes[id] === "abstain") abstain++;
    });
    const total = forCount + against + abstain;
    const expressed = forCount + against; // hors abstentions
    const favorablePct = expressed > 0 ? Math.round((forCount / expressed) * 100) : 0;
    return {
      for: forCount,
      against: against,
      abstain: abstain,
      total: total,
      expressed: expressed,
      favorablePct: favorablePct,
      indicator: indicator(forCount, against, total),
    };
  }

  function indicator(forCount, against, total) {
    if (total === 0) return { key: "none", label: "Aucun vote" };
    if (against === 0 && forCount > 0) return { key: "consensus", label: "Consensus favorable" };
    if (forCount > against && Math.abs(forCount - against) > 1)
      return { key: "majority-for", label: "Majorité favorable" };
    if (against > forCount && Math.abs(against - forCount) > 1)
      return { key: "majority-against", label: "Majorité défavorable" };
    return { key: "split", label: "Avis partagés" };
  }

  return {
    TOPIC_STATUS_LABELS: TOPIC_STATUS_LABELS,
    PROPOSAL_STATUS_LABELS: PROPOSAL_STATUS_LABELS,
    VOTE_LABELS: VOTE_LABELS,
    emptyData: emptyData,
    findTopic: findTopic,
    findProposal: findProposal,
    findMessage: findMessage,
    validateAction: validateAction,
    applyAction: applyAction,
    tally: tally,
  };
})();
