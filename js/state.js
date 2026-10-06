/* BrainstO. — modèle de données, validation et réduction des actions.
 *
 * ⚠️ PARITÉ : ce fichier doit rester STRICTEMENT équivalent au backend Google
 * Apps Script (ensureShape / validateAction / applyAction). Toute modification
 * ici doit être répercutée dans le script, et inversement.
 * Les tests de tests/parity.test.js vérifient les cas action par action.
 */
(function (root) {
  "use strict";

  var Core = {};

  Core.ANON_NAME = "Anonyme";

  Core.LIMITS = {
    name: 50,
    topicTitle: 150,
    topicDescription: 3000,
    message: 3000,
    proposalTitle: 200,
    proposalDescription: 3000,
    conclusion: 5000,
    idea: 2000
  };

  /* ⚠️ Liste partagée avec le backend : toute modification doit être reportée
   * dans le script Apps Script, sans quoi les deux côtés ne valideront pas les
   * mêmes réactions. Une réaction retirée d'ici disparaît à la lecture (voir
   * la normalisation plus bas) : les anciennes valeurs sont ignorées, pas
   * converties. */
  Core.REACTIONS = ["👌", "💪", "🤏", "👎", "💩"];

  Core.TOPIC_STATUSES = ["open", "ready", "closed", "archived"];
  Core.PROPOSAL_STATUSES = ["voting", "selected", "debate", "implemented", "rejected"];
  Core.VOTE_VALUES = ["for", "against", "abstain"];

  Core.TOPIC_STATUS_LABELS = {
    open: "En discussion",
    ready: "Prêt pour la réunion",
    closed: "Clôturé",
    archived: "Archivé"
  };

  Core.PROPOSAL_STATUS_LABELS = {
    voting: "En vote",
    selected: "Retenue",
    debate: "À débattre",
    implemented: "Mise en place",
    rejected: "Écartée"
  };

  Core.VOTE_LABELS = { for: "Pour", against: "Contre", abstain: "Abstention" };

  Core.ACTION_TYPES = [
    "REGISTER_PARTICIPANT", "UPDATE_PARTICIPANT",
    "CREATE_TOPIC", "UPDATE_TOPIC", "CHANGE_TOPIC_STATUS",
    "CREATE_MESSAGE", "UPDATE_MESSAGE", "SET_MESSAGE_SIGNATURE", "SET_REACTION",
    "CREATE_PROPOSAL", "UPDATE_PROPOSAL", "CHANGE_PROPOSAL_STATUS", "SET_VOTE", "REMOVE_VOTE",
    "ADD_CONCLUSION", "UPDATE_CONCLUSION_ITEM", "DELETE_CONCLUSION",
    "SET_CONCLUSION_VOTE", "REMOVE_CONCLUSION_VOTE",
    "SET_TOPIC_PIN", "SUBMIT_IDEA"
  ];

  /* ------------------------------------------------------------- Outils --- */

  function str(value) { return value === null || value === undefined ? "" : String(value); }
  function trim(value) { return str(value).trim(); }
  /* ⚠️ Une coupe ne laisse jamais une moitié de paire UTF-16 (emoji tranché, « � » à
   * l'écran) : un demi-caractère haut final est retiré. Utils.limit doit suivre la même règle. */
  function cut(value, max) {
    var text = trim(value).slice(0, max);
    var last = text.charCodeAt(text.length - 1);
    return last >= 0xD800 && last <= 0xDBFF ? text.slice(0, -1) : text;
  }
  function isObject(value) { return !!value && typeof value === "object" && !Array.isArray(value); }
  function arr(value) { return Array.isArray(value) ? value : []; }
  function oneOf(value, list, fallback) { return list.indexOf(value) >= 0 ? value : fallback; }
  /* Valeur PROPRE d'une clé (jamais celle héritée d'Object.prototype : « toString »…). */
  function ownValue(obj, key) { return Object.prototype.hasOwnProperty.call(obj, key) ? obj[key] : undefined; }

  /* ⚠️ Un identifiant devient une clé (votes, réactions, soutiens) ou reste dans le journal
   * de déduplication : 120 caractères au plus, et jamais un nom hérité d'Object.prototype
   * (perdu, compté faux ou pris pour existant). Liste partagée avec le backend. */
  Core.ID_MAX_LENGTH = 120;
  Core.RESERVED_IDS = ["__proto__", "constructor", "prototype", "hasOwnProperty", "toString", "valueOf",
    "toLocaleString", "isPrototypeOf", "propertyIsEnumerable", "__defineGetter__", "__defineSetter__",
    "__lookupGetter__", "__lookupSetter__"];
  function badId(value) {
    return str(value).length > Core.ID_MAX_LENGTH || Core.RESERVED_IDS.indexOf(trim(value)) >= 0;
  }

  Core.cut = cut;
  Core.trim = trim;

  /* --------------------------------------------------------- ensureShape --- */

  Core.emptyState = function () {
    return {
      revision: 0,
      updatedAt: new Date(0).toISOString(),
      participants: [],
      topics: [],
      processedActionIds: []
    };
  };

  /* Migration douce : recrée les champs manquants sans jamais planter sur un
   * JSON produit par une version antérieure. */
  Core.ensureShape = function (input) {
    var data = isObject(input) ? input : {};
    var state = {
      revision: typeof data.revision === "number" && isFinite(data.revision) ? data.revision : 0,
      updatedAt: trim(data.updatedAt) || new Date(0).toISOString(),
      participants: [],
      topics: [],
      processedActionIds: []
    };

    arr(data.participants).forEach(function (p) {
      if (!isObject(p) || !trim(p.id)) { return; }
      state.participants.push({ id: trim(p.id), name: cut(p.name, Core.LIMITS.name) || Core.ANON_NAME });
    });

    arr(data.topics).forEach(function (t) {
      if (!isObject(t) || !trim(t.id)) { return; }
      var createdBy = isObject(t.createdBy) ? t.createdBy : {};
      var topic = {
        id: trim(t.id),
        title: cut(t.title, Core.LIMITS.topicTitle) || "Sujet sans titre",
        description: cut(t.description, Core.LIMITS.topicDescription),
        status: oneOf(trim(t.status), Core.TOPIC_STATUSES, "open"),
        /* Épinglé pour toute l'équipe : remonte en tête de l'accueil. Absent = non épinglé (données d'avant). */
        pinned: t.pinned === true,
        createdBy: {
          id: trim(createdBy.id),
          name: cut(createdBy.name, Core.LIMITS.name) || Core.ANON_NAME
        },
        createdAt: trim(t.createdAt) || state.updatedAt,
        updatedAt: trim(t.updatedAt) || trim(t.createdAt) || state.updatedAt,
        messages: [],
        proposals: [],
        conclusions: [],
        conclusionVotes: {}
      };

      arr(t.messages).forEach(function (m) {
        if (!isObject(m) || !trim(m.id)) { return; }
        var anon = m.anon === true;
        var reactions = {};
        if (isObject(m.reactions)) {
          Object.keys(m.reactions).forEach(function (pid) {
            var emoji = trim(m.reactions[pid]);
            if (trim(pid) && Core.REACTIONS.indexOf(emoji) >= 0) { reactions[trim(pid)] = emoji; }
          });
        }
        topic.messages.push({
          id: trim(m.id),
          authorId: anon ? "" : trim(m.authorId),
          authorName: anon ? Core.ANON_NAME : (cut(m.authorName, Core.LIMITS.name) || Core.ANON_NAME),
          text: cut(m.text, Core.LIMITS.message),
          createdAt: trim(m.createdAt) || topic.createdAt,
          updatedAt: trim(m.updatedAt) || trim(m.createdAt) || topic.createdAt,
          reactions: reactions,
          anon: anon,
          quoteId: trim(m.quoteId) || null,
          /* Exploration : le message appartient au sous-fil ouvert depuis ce message source (null = fil principal).
           * Un lien de message à message, jamais vers une personne. Distinct de quoteId (citer n'est pas explorer). */
          branchRootId: trim(m.branchRootId) || null
        });
      });

      /* Une citation qui pointe vers un message disparu est neutralisée. Tables sans
       * prototype : « constructor » ou « toString » n'y existent que s'ils sont réels. */
      var messageIds = Object.create(null);
      topic.messages.forEach(function (m) { messageIds[m.id] = true; });
      topic.messages.forEach(function (m) {
        if (m.quoteId && (!messageIds[m.quoteId] || m.quoteId === m.id)) { m.quoteId = null; }
      });
      normalizeBranches(topic.messages, messageIds);

      arr(t.proposals).forEach(function (p) {
        if (!isObject(p) || !trim(p.id)) { return; }
        var votes = {};
        if (isObject(p.votes)) {
          Object.keys(p.votes).forEach(function (pid) {
            var value = trim(p.votes[pid]);
            if (trim(pid) && Core.VOTE_VALUES.indexOf(value) >= 0) { votes[trim(pid)] = value; }
          });
        }
        topic.proposals.push({
          id: trim(p.id),
          title: cut(p.title, Core.LIMITS.proposalTitle) || "Proposition",
          description: cut(p.description, Core.LIMITS.proposalDescription),
          authorId: trim(p.authorId),
          authorName: cut(p.authorName, Core.LIMITS.name) || Core.ANON_NAME,
          createdAt: trim(p.createdAt) || topic.createdAt,
          status: oneOf(trim(p.status), Core.PROPOSAL_STATUSES, "voting"),
          votes: votes,
          consensus: oneOf(trim(p.consensus), ["for", "against"], ""),
          consensusAt: oneOf(trim(p.consensus), ["for", "against"], "") ? trim(p.consensusAt) : ""
        });
      });

      arr(t.conclusions).forEach(function (c) {
        if (!isObject(c) || !trim(c.id)) { return; }
        topic.conclusions.push({
          id: trim(c.id),
          text: cut(c.text, Core.LIMITS.conclusion),
          source: "manual",
          authorId: trim(c.authorId),
          authorName: cut(c.authorName, Core.LIMITS.name) || Core.ANON_NAME,
          createdAt: trim(c.createdAt) || topic.createdAt,
          updatedAt: trim(c.updatedAt) || trim(c.createdAt) || topic.createdAt
        });
      });

      /* TeamKrys v1/v2 (d1823d6, af0500a) : le texte unique « conclusion » devient UNE
       * formulation sans auteur, d'id déterministe ; rien n'est écrasé, et relire ne
       * l'ajoute pas deux fois (l'état normalisé ne garde pas « conclusion »). */
      var legacyText = typeof t.conclusion === "string" ? cut(t.conclusion, Core.LIMITS.conclusion) : "";
      if (legacyText && !Core.findConclusion(topic, "legacy-" + topic.id) &&
        !topic.conclusions.some(function (c) { return c.text === legacyText; })) {
        topic.conclusions.push({
          id: "legacy-" + topic.id,
          text: legacyText,
          source: "manual",
          authorId: "",
          authorName: Core.ANON_NAME,
          createdAt: trim(t.conclusionUpdatedAt) || topic.createdAt,
          updatedAt: trim(t.conclusionUpdatedAt) || topic.createdAt
        });
      }

      var conclusionIds = Object.create(null);
      topic.conclusions.forEach(function (c) { conclusionIds[c.id] = true; });
      if (isObject(t.conclusionVotes)) {
        Object.keys(t.conclusionVotes).forEach(function (pid) {
          var cid = trim(t.conclusionVotes[pid]);
          if (trim(pid) && conclusionIds[cid]) { topic.conclusionVotes[trim(pid)] = cid; }
        });
      }

      state.topics.push(topic);
    });

    arr(data.processedActionIds).forEach(function (id) {
      if (trim(id)) { state.processedActionIds.push(trim(id)); }
    });

    return state;
  };

  /* ⚠️ Exploration : une seule profondeur. Deux passes, pour que le résultat ne dépende JAMAIS de l'ordre des
   * messages (le serveur et chaque téléphone doivent aboutir au même état) :
   *   1. une racine absente du sujet, ou égale au message lui-même, est neutralisée ;
   *   2. une racine qui, À L'ISSUE de la passe 1, appartient elle-même à une exploration est neutralisée — lue sur
   *      l'instantané de la passe 1, pas au fil de la boucle, sinon A→B→C donnerait deux résultats selon l'ordre.
   * Une valeur neutralisée ne redevient jamais valide : la sortie est stable (relire ne change rien). */
  function normalizeBranches(messages, messageIds) {
    messages.forEach(function (m) {
      if (m.branchRootId && (!messageIds[m.branchRootId] || m.branchRootId === m.id)) { m.branchRootId = null; }
    });
    var nested = Object.create(null);
    messages.forEach(function (m) { if (m.branchRootId) { nested[m.id] = true; } });
    messages.forEach(function (m) {
      if (m.branchRootId && nested[m.branchRootId]) { m.branchRootId = null; }
    });
  }

  /* ------------------------------------------------------------ Accès --- */

  Core.findTopic = function (state, topicId) {
    var topics = arr(state && state.topics);
    for (var i = 0; i < topics.length; i++) { if (topics[i].id === topicId) { return topics[i]; } }
    return null;
  };

  function findIn(list, id) {
    for (var i = 0; i < list.length; i++) { if (list[i].id === id) { return list[i]; } }
    return null;
  }

  Core.findMessage = function (topic, id) { return topic ? findIn(arr(topic.messages), id) : null; };
  Core.findProposal = function (topic, id) { return topic ? findIn(arr(topic.proposals), id) : null; };

  /* CONSENSUS : toute l'équipe (chaque participant inscrit) a voté, et tout le monde la même chose, « pour » ou
   * « contre ». Une abstention n'est pas un accord : elle empêche le consensus. Renvoie "for", "against" ou "".
   * ⚠️ Même code dans apps-script/Code.gs (tests/parity.test.js). */
  Core.unanimousVote = function (proposal, participants) {
    if (!proposal || !isObject(proposal.votes) || !Array.isArray(participants) || !participants.length) { return ""; }
    var value = "";
    for (var i = 0; i < participants.length; i++) {
      var v = ownValue(proposal.votes, trim(participants[i] && participants[i].id));
      if (v !== "for" && v !== "against") { return ""; }
      if (!value) { value = v; } else if (v !== value) { return ""; }
    }
    var keys = Object.keys(proposal.votes);
    for (var k = 0; k < keys.length; k++) { if (proposal.votes[keys[k]] !== value) { return ""; } }
    return value;
  };

  /* Consensus d'une proposition : celui qui a été FIGÉ au vote qui l'a fait naître (`consensus`), sinon l'unanimité
   * constatée maintenant (propositions déjà unanimes avant que le consensus ne soit enregistré). */
  Core.proposalConsensus = function (proposal, participants) {
    if (!proposal) { return ""; }
    if (proposal.consensus === "for" || proposal.consensus === "against") { return proposal.consensus; }
    return Core.unanimousVote(proposal, participants);
  };
  Core.findConclusion = function (topic, id) { return topic ? findIn(arr(topic.conclusions), id) : null; };

  /* Un message n'est plus modifiable dès qu'une AUTRE personne y a réagi.
   * La signature (anonyme / signé), elle, reste toujours modifiable. */
  Core.isMessageLocked = function (message, participantId) {
    if (!message || !isObject(message.reactions)) { return false; }
    var keys = Object.keys(message.reactions);
    for (var i = 0; i < keys.length; i++) { if (keys[i] !== participantId) { return true; } }
    return false;
  };

  /* -------------------------------------------------------- Indicateurs --- */

  Core.voteSummary = function (proposal) {
    var votes = proposal && isObject(proposal.votes) ? proposal.votes : {};
    var counts = { for: 0, against: 0, abstain: 0 };
    Object.keys(votes).forEach(function (pid) {
      if (counts[votes[pid]] !== undefined) { counts[votes[pid]] += 1; }
    });
    var total = counts.for + counts.against + counts.abstain;
    var expressed = counts.for + counts.against;
    var label;
    if (total === 0) { label = "Aucun vote"; }
    else if (expressed === 0) { label = "Avis partagés"; }
    else if (counts.against === 0) { label = "Consensus favorable"; }
    else if (counts.for === counts.against) { label = "Avis partagés"; }
    else if (counts.for > counts.against) { label = "Majorité favorable"; }
    else { label = "Majorité défavorable"; }
    return {
      counts: counts,
      total: total,
      expressed: expressed,
      /* Pourcentage favorable calculé HORS abstentions. */
      favorablePercent: expressed === 0 ? 0 : Math.round((counts.for / expressed) * 100),
      label: label
    };
  };

  Core.conclusionScores = function (topic) {
    /* Table sans prototype : « toString » n'y est jamais compté, « __proto__ » réel l'est. */
    var scores = Object.create(null);
    arr(topic && topic.conclusions).forEach(function (c) { scores[c.id] = 0; });
    var votes = topic && isObject(topic.conclusionVotes) ? topic.conclusionVotes : {};
    Object.keys(votes).forEach(function (pid) {
      var cid = votes[pid];
      if (scores[cid] !== undefined) { scores[cid] += 1; }
    });
    var best = 0;
    Object.keys(scores).forEach(function (cid) { if (scores[cid] > best) { best = scores[cid]; } });
    return { scores: scores, best: best };
  };

  /* --------------------------------------------------------- Validation --- */

  function fail(message) { return { ok: false, error: message }; }
  var OK = { ok: true, error: null };

  /* Renvoie {ok:true} ou {ok:false, error:"…"} — erreur MÉTIER (l'action ne
   * doit pas être rejouée indéfiniment : le client la retire de sa file). */
  Core.validateAction = function (state, action) {
    if (!isObject(action)) { return fail("Action illisible."); }
    var type = trim(action.type);
    if (Core.ACTION_TYPES.indexOf(type) < 0) { return fail("Action inconnue : " + type); }
    if (!trim(action.id)) { return fail("Action sans identifiant."); }
    var p = isObject(action.payload) ? action.payload : {};
    var topic = null;
    if ([action.id, action.actorId, p.participantId, p.topicId, p.messageId, p.proposalId,
      p.conclusionId, p.quoteId, p.ideaId, p.branchRootId].some(badId)) { return fail("Identifiant invalide."); }

    function needTopic() {
      topic = Core.findTopic(state, trim(p.topicId));
      return topic ? null : fail("Ce sujet n'existe plus.");
    }

    /* Une proposition en Consensus est figée : plus de vote, de retrait, de modification ni de statut. */
    function locked() {
      return !!Core.proposalConsensus(Core.findProposal(topic, trim(p.proposalId)), state.participants);
    }

    switch (type) {
      case "REGISTER_PARTICIPANT":
      case "UPDATE_PARTICIPANT":
        if (!trim(p.participantId)) { return fail("Participant inconnu."); }
        if (!trim(p.name)) { return fail("Le nom est obligatoire."); }
        return OK;

      case "CREATE_TOPIC":
        if (!trim(p.topicId)) { return fail("Sujet sans identifiant."); }
        if (!trim(p.title)) { return fail("Le titre du sujet est obligatoire."); }
        if (Core.findTopic(state, trim(p.topicId))) { return fail("Ce sujet existe déjà."); }
        return OK;

      case "UPDATE_TOPIC": {
        var e1 = needTopic(); if (e1) { return e1; }
        if (!trim(p.title)) { return fail("Le titre du sujet est obligatoire."); }
        return OK;
      }

      case "CHANGE_TOPIC_STATUS": {
        var e2 = needTopic(); if (e2) { return e2; }
        if (Core.TOPIC_STATUSES.indexOf(trim(p.status)) < 0) { return fail("Statut de sujet invalide."); }
        return OK;
      }

      case "SET_TOPIC_PIN": {
        var ePin = needTopic(); if (ePin) { return ePin; }
        return OK;
      }

      /* ⚠️ Une idée est TOUJOURS anonyme : une action qui porte un auteur est refusée, des deux côtés. Même un client
       * défaillant ne peut pas attacher une identité à une idée. */
      case "SUBMIT_IDEA":
        if (!trim(p.ideaId)) { return fail("Idée sans identifiant."); }
        if (trim(action.actorId)) { return fail("Une idée est toujours anonyme."); }
        if (!trim(p.text)) { return fail("L'idée est vide."); }
        return OK;

      case "CREATE_MESSAGE": {
        var e3 = needTopic(); if (e3) { return e3; }
        if (!trim(p.messageId)) { return fail("Message sans identifiant."); }
        if (!trim(p.text)) { return fail("Le message est vide."); }
        if (Core.findMessage(topic, trim(p.messageId))) { return fail("Ce message existe déjà."); }
        if (trim(p.quoteId) && !Core.findMessage(topic, trim(p.quoteId))) {
          return fail("Le message cité n'existe plus.");
        }
        /* Exploration (facultatif : absent = fil principal). La source est un message du fil principal de CE sujet.
         * La citation, elle, garde sa règle : citer n'importe quel message du sujet reste permis. */
        if (trim(p.branchRootId)) {
          if (trim(p.branchRootId) === trim(p.messageId)) { return fail("Un message ne peut pas être sa propre origine."); }
          var root = Core.findMessage(topic, trim(p.branchRootId));
          if (!root) { return fail("Le message d'origine n'existe plus."); }
          if (root.branchRootId) { return fail("On n'explore pas une réponse : explorez le message d'origine."); }
        }
        return OK;
      }

      case "UPDATE_MESSAGE": {
        var e4 = needTopic(); if (e4) { return e4; }
        var m4 = Core.findMessage(topic, trim(p.messageId));
        if (!m4) { return fail("Ce message n'existe plus."); }
        if (!trim(p.text)) { return fail("Le message est vide."); }
        if (Core.isMessageLocked(m4, trim(action.actorId))) {
          return fail("Message verrouillé : quelqu'un y a déjà réagi.");
        }
        return OK;
      }

      case "SET_MESSAGE_SIGNATURE": {
        var e5 = needTopic(); if (e5) { return e5; }
        if (!Core.findMessage(topic, trim(p.messageId))) { return fail("Ce message n'existe plus."); }
        return OK;
      }

      case "SET_REACTION": {
        var e6 = needTopic(); if (e6) { return e6; }
        if (!Core.findMessage(topic, trim(p.messageId))) { return fail("Ce message n'existe plus."); }
        if (!trim(action.actorId)) { return fail("Réaction sans participant."); }
        /* emoji "" = retrait, admis seulement dans une action marquée (set:true). */
        if (Core.REACTIONS.indexOf(trim(p.emoji)) < 0 && !(p.set === true && trim(p.emoji) === "")) {
          return fail("Réaction non autorisée.");
        }
        return OK;
      }

      case "CREATE_PROPOSAL": {
        var e7 = needTopic(); if (e7) { return e7; }
        if (!trim(p.proposalId)) { return fail("Proposition sans identifiant."); }
        if (!trim(p.title)) { return fail("Le titre de la proposition est obligatoire."); }
        if (Core.findProposal(topic, trim(p.proposalId))) { return fail("Cette proposition existe déjà."); }
        return OK;
      }

      case "UPDATE_PROPOSAL": {
        var e8 = needTopic(); if (e8) { return e8; }
        if (!Core.findProposal(topic, trim(p.proposalId))) { return fail("Cette proposition n'existe plus."); }
        if (locked()) { return fail("Toute l'équipe s'est prononcée : cette proposition est en Consensus et ne se modifie plus."); }
        if (!trim(p.title)) { return fail("Le titre de la proposition est obligatoire."); }
        return OK;
      }

      case "CHANGE_PROPOSAL_STATUS": {
        var e9 = needTopic(); if (e9) { return e9; }
        if (!Core.findProposal(topic, trim(p.proposalId))) { return fail("Cette proposition n'existe plus."); }
        if (locked()) { return fail("Toute l'équipe s'est prononcée : cette proposition est en Consensus et ne se modifie plus."); }
        if (Core.PROPOSAL_STATUSES.indexOf(trim(p.status)) < 0) { return fail("Statut de proposition invalide."); }
        return OK;
      }

      case "SET_VOTE": {
        var e10 = needTopic(); if (e10) { return e10; }
        if (!Core.findProposal(topic, trim(p.proposalId))) { return fail("Cette proposition n'existe plus."); }
        if (locked()) { return fail("Toute l'équipe s'est prononcée : cette proposition est en Consensus et ne se modifie plus."); }
        if (!trim(action.actorId)) { return fail("Vote sans participant."); }
        if (Core.VOTE_VALUES.indexOf(trim(p.value)) < 0) { return fail("Vote invalide."); }
        return OK;
      }

      case "REMOVE_VOTE": {
        var e11 = needTopic(); if (e11) { return e11; }
        if (!Core.findProposal(topic, trim(p.proposalId))) { return fail("Cette proposition n'existe plus."); }
        if (locked()) { return fail("Toute l'équipe s'est prononcée : cette proposition est en Consensus et ne se modifie plus."); }
        if (!trim(action.actorId)) { return fail("Vote sans participant."); }
        return OK;
      }

      case "ADD_CONCLUSION": {
        var e12 = needTopic(); if (e12) { return e12; }
        if (!trim(p.conclusionId)) { return fail("Formulation du consensus sans identifiant."); }
        if (!trim(p.text)) { return fail("La formulation du consensus est vide."); }
        if (Core.findConclusion(topic, trim(p.conclusionId))) { return fail("Cette formulation du consensus existe déjà."); }
        return OK;
      }

      case "UPDATE_CONCLUSION_ITEM": {
        var e13 = needTopic(); if (e13) { return e13; }
        if (!Core.findConclusion(topic, trim(p.conclusionId))) { return fail("Cette formulation du consensus n'existe plus."); }
        if (!trim(p.text)) { return fail("La formulation du consensus est vide."); }
        return OK;
      }

      case "DELETE_CONCLUSION": {
        var e14 = needTopic(); if (e14) { return e14; }
        if (!Core.findConclusion(topic, trim(p.conclusionId))) { return fail("Cette formulation du consensus n'existe plus."); }
        return OK;
      }

      case "SET_CONCLUSION_VOTE": {
        var e15 = needTopic(); if (e15) { return e15; }
        if (!Core.findConclusion(topic, trim(p.conclusionId))) { return fail("Cette formulation du consensus n'existe plus."); }
        if (!trim(action.actorId)) { return fail("Vote sans participant."); }
        return OK;
      }

      case "REMOVE_CONCLUSION_VOTE": {
        var e16 = needTopic(); if (e16) { return e16; }
        if (!trim(action.actorId)) { return fail("Vote sans participant."); }
        return OK;
      }

      default:
        return fail("Action non gérée : " + type);
    }
  };

  /* --------------------------------------------------------- Réduction --- */

  function author(action, anon) {
    if (anon) { return { id: "", name: Core.ANON_NAME }; }
    return {
      id: trim(action.actorId),
      name: cut(action.actorName, Core.LIMITS.name) || Core.ANON_NAME
    };
  }

  function touch(state, topic, now) {
    state.updatedAt = now;
    if (topic) { topic.updatedAt = now; }
  }

  function upsertParticipant(state, id, name) {
    var existing = null;
    state.participants.forEach(function (p) { if (p.id === id) { existing = p; } });
    if (existing) { existing.name = name; return existing; }
    var created = { id: id, name: name };
    state.participants.push(created);
    return created;
  }

  /* Applique une action VALIDE sur l'état (mutation en place). */
  Core.applyAction = function (state, action, now) {
    var p = isObject(action.payload) ? action.payload : {};
    var type = trim(action.type);
    var topic = Core.findTopic(state, trim(p.topicId));

    switch (type) {
      case "REGISTER_PARTICIPANT":
      case "UPDATE_PARTICIPANT": {
        var pid = trim(p.participantId);
        var name = cut(p.name, Core.LIMITS.name);
        upsertParticipant(state, pid, name);
        /* Le renommage se propage aux contenus signés (jamais aux anonymes). */
        state.topics.forEach(function (t) {
          if (t.createdBy && t.createdBy.id === pid) { t.createdBy.name = name; }
          t.messages.forEach(function (m) { if (!m.anon && m.authorId === pid) { m.authorName = name; } });
          t.proposals.forEach(function (x) { if (x.authorId === pid) { x.authorName = name; } });
          t.conclusions.forEach(function (c) { if (c.authorId === pid) { c.authorName = name; } });
        });
        touch(state, null, now);
        return;
      }

      case "CREATE_TOPIC": {
        var who = author(action, p.anon === true);
        state.topics.push({
          id: trim(p.topicId),
          title: cut(p.title, Core.LIMITS.topicTitle),
          description: cut(p.description, Core.LIMITS.topicDescription),
          status: "open",
          pinned: false,
          createdBy: who,
          createdAt: now,
          updatedAt: now,
          messages: [],
          proposals: [],
          conclusions: [],
          conclusionVotes: {}
        });
        touch(state, null, now);
        return;
      }

      case "UPDATE_TOPIC":
        topic.title = cut(p.title, Core.LIMITS.topicTitle);
        topic.description = cut(p.description, Core.LIMITS.topicDescription);
        touch(state, topic, now);
        return;

      case "CHANGE_TOPIC_STATUS":
        topic.status = trim(p.status);
        touch(state, topic, now);
        return;

      /* Épingler n'est pas une activité du débat : la date du sujet ne bouge pas (sinon il remonterait « actif à
       * l'instant » et serait signalé comme nouveau). Seul l'état change. Affectation, donc rejouable sans effet. */
      case "SET_TOPIC_PIN":
        topic.pinned = p.pinned === true;
        state.updatedAt = now;
        return;

      /* L'idée n'entre JAMAIS dans l'état partagé : le serveur la range à part (boîte à idées, Code.gs), et aucun
       * téléphone ne la reçoit. Ici, rien à appliquer. */
      case "SUBMIT_IDEA":
        return;

      case "CREATE_MESSAGE": {
        var mWho = author(action, p.anon === true);
        topic.messages.push({
          id: trim(p.messageId),
          authorId: mWho.id,
          authorName: mWho.name,
          text: cut(p.text, Core.LIMITS.message),
          createdAt: now,
          updatedAt: now,
          reactions: {},
          anon: p.anon === true,
          quoteId: trim(p.quoteId) || null,
          branchRootId: trim(p.branchRootId) || null
        });
        touch(state, topic, now);
        return;
      }

      case "UPDATE_MESSAGE": {
        var m = Core.findMessage(topic, trim(p.messageId));
        m.text = cut(p.text, Core.LIMITS.message);
        m.updatedAt = now;
        touch(state, topic, now);
        return;
      }

      case "SET_MESSAGE_SIGNATURE": {
        var ms = Core.findMessage(topic, trim(p.messageId));
        var anon = p.anon === true;
        ms.anon = anon;
        if (anon) {
          /* L'anonymat EFFACE l'identité du JSON partagé, y compris comme clé de
           * réaction : celle de l'auteur et celle de qui anonymise (§5). */
          if (ms.authorId) { delete ms.reactions[ms.authorId]; }
          if (trim(action.actorId)) { delete ms.reactions[trim(action.actorId)]; }
          ms.authorId = "";
          ms.authorName = Core.ANON_NAME;
        } else {
          var signed = author(action, false);
          ms.authorId = signed.id;
          ms.authorName = signed.name;
        }
        ms.updatedAt = now;
        touch(state, topic, now);
        return;
      }

      case "SET_REACTION": {
        var mr = Core.findMessage(topic, trim(p.messageId));
        var actor = trim(action.actorId);
        var emoji = trim(p.emoji);
        /* ⚠️ Action marquée set:true (FEATURES "idempotent") : elle AFFECTE, "" retire ;
         * rejouée, elle ne change rien, pas même la date d'activité. Sans marqueur :
         * bascule historique, gardée pour les appareils restés sur l'ancienne version. */
        if (p.set === true) {
          var had = ownValue(mr.reactions, actor);
          if (emoji) { mr.reactions[actor] = emoji; } else { delete mr.reactions[actor]; }
          if (ownValue(mr.reactions, actor) === had) { return; }
        }
        else if (ownValue(mr.reactions, actor) === emoji) { delete mr.reactions[actor]; }
        else { mr.reactions[actor] = emoji; }
        touch(state, topic, now);
        return;
      }

      case "CREATE_PROPOSAL": {
        var pWho = author(action, false);
        topic.proposals.push({
          id: trim(p.proposalId),
          title: cut(p.title, Core.LIMITS.proposalTitle),
          description: cut(p.description, Core.LIMITS.proposalDescription),
          authorId: pWho.id,
          authorName: pWho.name,
          createdAt: now,
          status: "voting",
          votes: {},
          consensus: "",
          consensusAt: ""
        });
        touch(state, topic, now);
        return;
      }

      case "UPDATE_PROPOSAL": {
        var pr = Core.findProposal(topic, trim(p.proposalId));
        pr.title = cut(p.title, Core.LIMITS.proposalTitle);
        pr.description = cut(p.description, Core.LIMITS.proposalDescription);
        touch(state, topic, now);
        return;
      }

      case "CHANGE_PROPOSAL_STATUS":
        Core.findProposal(topic, trim(p.proposalId)).status = trim(p.status);
        touch(state, topic, now);
        return;

      case "SET_VOTE": {
        var pv = Core.findProposal(topic, trim(p.proposalId));
        var voter = trim(action.actorId);
        var value = trim(p.value);
        if (p.set === true) {
          /* Action marquée : AFFECTE ; rejouée, elle ne change rien. */
          var was = ownValue(pv.votes, voter);
          pv.votes[voter] = value;
          if (ownValue(pv.votes, voter) === was) { return; }
        }
        /* Un vote par personne ; re-cliquer le même vote le retire. */
        else if (ownValue(pv.votes, voter) === value) { delete pv.votes[voter]; }
        else { pv.votes[voter] = value; }
        /* Le vote qui fait l'unanimité de toute l'équipe fige la proposition en Consensus. */
        var reached = Core.unanimousVote(pv, state.participants);
        if (reached && !pv.consensus) { pv.consensus = reached; pv.consensusAt = now; }
        touch(state, topic, now);
        return;
      }

      case "REMOVE_VOTE":
        delete Core.findProposal(topic, trim(p.proposalId)).votes[trim(action.actorId)];
        touch(state, topic, now);
        return;

      case "ADD_CONCLUSION": {
        var cWho = author(action, false);
        topic.conclusions.push({
          id: trim(p.conclusionId),
          text: cut(p.text, Core.LIMITS.conclusion),
          source: "manual",
          authorId: cWho.id,
          authorName: cWho.name,
          createdAt: now,
          updatedAt: now
        });
        touch(state, topic, now);
        return;
      }

      case "UPDATE_CONCLUSION_ITEM": {
        var ci = Core.findConclusion(topic, trim(p.conclusionId));
        ci.text = cut(p.text, Core.LIMITS.conclusion);
        ci.updatedAt = now;
        touch(state, topic, now);
        return;
      }

      case "DELETE_CONCLUSION": {
        var cid = trim(p.conclusionId);
        topic.conclusions = topic.conclusions.filter(function (c) { return c.id !== cid; });
        /* Supprimer une conclusion retire aussi les votes qui la visaient. */
        Object.keys(topic.conclusionVotes).forEach(function (voterId) {
          if (topic.conclusionVotes[voterId] === cid) { delete topic.conclusionVotes[voterId]; }
        });
        touch(state, topic, now);
        return;
      }

      case "SET_CONCLUSION_VOTE": {
        var cv = trim(action.actorId);
        var target = trim(p.conclusionId);
        if (p.set === true) {
          /* Action marquée : AFFECTE (déplace le choix) ; rejouée, elle ne change rien. */
          var prev = ownValue(topic.conclusionVotes, cv);
          topic.conclusionVotes[cv] = target;
          if (ownValue(topic.conclusionVotes, cv) === prev) { return; }
        }
        /* Choix unique : re-cliquer retire, voter ailleurs déplace le vote. */
        else if (ownValue(topic.conclusionVotes, cv) === target) { delete topic.conclusionVotes[cv]; }
        else { topic.conclusionVotes[cv] = target; }
        touch(state, topic, now);
        return;
      }

      case "REMOVE_CONCLUSION_VOTE":
        delete topic.conclusionVotes[trim(action.actorId)];
        touch(state, topic, now);
        return;
    }
  };

  /* Valide puis applique. Renvoie {ok, error}. N'incrémente PAS la révision :
   * c'est le serveur qui en est responsable. */
  Core.reduce = function (state, action, now) {
    var check = Core.validateAction(state, action);
    if (!check.ok) { return check; }
    Core.applyAction(state, action, now || new Date().toISOString());
    return { ok: true, error: null };
  };

  /* ------------------------------------------------------------- Store --- */
  /* Uniquement côté application (le backend n'en a pas besoin). */

  var Store = {
    /* Dernier état connu du serveur. */
    base: Core.emptyState(),
    /* base + actions encore en attente d'envoi (vue optimiste). */
    view: Core.emptyState(),
    /* File locale [{seq, action}] issue d'IndexedDB. */
    queue: [],
    /* Compteur bumpé à chaque changement : sert de signature de rendu. */
    version: 0,
    /* Incrémenté à CHAQUE état serveur réellement adopté. Sert à repérer qu'un
     * état plus frais s'est installé pendant qu'une lecture était en vol —
     * voir Sync.pull. */
    epoch: 0
  };

  Store.bump = function () { Store.version += 1; };

  /* Signature bon marché d'un état. La révision est incrémentée par le serveur
   * à CHAQUE écriture : deux états de même révision sont le même état. Les deux
   * longueurs ne servent qu'à couvrir le cas d'un état local remis à zéro
   * (déconnexion) qui garderait par hasard la même révision. */
  function baseKey(state) {
    return state.revision + "|" + state.updatedAt + "|" +
      state.topics.length + "|" + state.participants.length;
  }

  var lastBaseKey = null;

  /* Renvoie true si l'état a RÉELLEMENT changé.
   * Republier un état identique coûtait un rebuild complet suivi d'un rendu
   * intégral du DOM : c'est ce qui faisait clignoter l'écran et perdre le
   * défilement à chaque « Synchroniser maintenant » ou retour d'onglet. */
  Store.setBase = function (state) {
    var next = Core.ensureShape(state);
    var key = baseKey(next);
    if (lastBaseKey !== null && key === lastBaseKey) { return false; }
    lastBaseKey = key;
    Store.base = next;
    Store.epoch += 1;
    Store.rebuild();
    return true;
  };

  /* Le mode local mute Store.base en place : la signature doit suivre. */
  Store.touchBase = function () { lastBaseKey = baseKey(Store.base); };

  Store.setQueue = function (entries) {
    Store.queue = Array.isArray(entries) ? entries.slice() : [];
    Store.rebuild();
  };

  Store.addToQueue = function (entry) {
    Store.queue.push(entry);
    Store.rebuild();
  };

  Store.removeFromQueue = function (seq) {
    Store.queue = Store.queue.filter(function (e) { return e.seq !== seq; });
    Store.rebuild();
  };

  /* Retrait par identité : une entrée dont la clé n'a jamais été attribuée vaut
   * « seq: null », et filtrer sur null emporterait toutes ses voisines. */
  Store.removeEntry = function (entry) {
    Store.queue = Store.queue.filter(function (e) { return e !== entry; });
    Store.rebuild();
  };

  var pendingIds = { version: -1, ids: {} };

  /* Identifiants des messages encore en file d'envoi, c'est-à-dire visibles chez
   * leur auteur et chez personne d'autre. L'interface s'en sert pour ne pas
   * afficher une heure qui n'est pas encore la bonne. */
  Store.pendingMessageIds = function () {
    /* Appelée une fois PAR BULLE : sur un fil de deux cents messages, la
     * recalculer à chaque appel serait payer la file deux cents fois. Elle ne
     * change qu'avec la vue, dont « version » est la signature. */
    if (pendingIds.version === Store.version) { return pendingIds.ids; }
    var ids = {};
    Store.queue.forEach(function (entry) {
      var action = entry.action;
      if (action && action.type === "CREATE_MESSAGE" && action.payload && action.payload.messageId) {
        ids[action.payload.messageId] = true;
      }
    });
    pendingIds = { version: Store.version, ids: ids };
    return ids;
  };

  /* Recalcule la vue : état serveur + rejeu des actions en attente. */
  Store.rebuild = function () {
    /* ensureShape reconstruit déjà chaque objet et chaque tableau à neuf (rien
     * de l'entrée n'est partagé avec la sortie) : le JSON.parse(JSON.stringify())
     * qui le précédait sérialisait puis reparsait tout l'état pour rien, à
     * chaque changement — sur un sujet de 200 messages, deux fois le travail. */
    var view = Core.ensureShape(Store.base);
    Store.queue.forEach(function (entry) {
      try { Core.reduce(view, entry.action, entry.action.ts); } catch (e) { /* action obsolète : ignorée */ }
    });
    Store.view = view;
    Store.bump();
  };

  root.Core = Core;
  root.Store = Store;
  if (typeof module !== "undefined" && module.exports) { module.exports = { Core: Core, Store: Store }; }
})(typeof globalThis !== "undefined" ? globalThis : this);
