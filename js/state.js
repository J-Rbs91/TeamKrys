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
    conclusion: 5000
  };

  Core.REACTIONS = ["👌", "💪", "🤞", "🤏", "👎", "💩"];

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
    "SET_CONCLUSION_VOTE", "REMOVE_CONCLUSION_VOTE"
  ];

  /* ------------------------------------------------------------- Outils --- */

  function str(value) { return value === null || value === undefined ? "" : String(value); }
  function trim(value) { return str(value).trim(); }
  function cut(value, max) { return trim(value).slice(0, max); }
  function isObject(value) { return !!value && typeof value === "object" && !Array.isArray(value); }
  function arr(value) { return Array.isArray(value) ? value : []; }
  function oneOf(value, list, fallback) { return list.indexOf(value) >= 0 ? value : fallback; }

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
          quoteId: trim(m.quoteId) || null
        });
      });

      /* Une citation qui pointe vers un message disparu est neutralisée. */
      var messageIds = {};
      topic.messages.forEach(function (m) { messageIds[m.id] = true; });
      topic.messages.forEach(function (m) {
        if (m.quoteId && (!messageIds[m.quoteId] || m.quoteId === m.id)) { m.quoteId = null; }
      });

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
          votes: votes
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

      var conclusionIds = {};
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
    var scores = {};
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

    function needTopic() {
      topic = Core.findTopic(state, trim(p.topicId));
      return topic ? null : fail("Ce sujet n'existe plus.");
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

      case "CREATE_MESSAGE": {
        var e3 = needTopic(); if (e3) { return e3; }
        if (!trim(p.messageId)) { return fail("Message sans identifiant."); }
        if (!trim(p.text)) { return fail("Le message est vide."); }
        if (Core.findMessage(topic, trim(p.messageId))) { return fail("Ce message existe déjà."); }
        if (trim(p.quoteId) && !Core.findMessage(topic, trim(p.quoteId))) {
          return fail("Le message cité n'existe plus.");
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
        if (Core.REACTIONS.indexOf(trim(p.emoji)) < 0) { return fail("Réaction non autorisée."); }
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
        if (!trim(p.title)) { return fail("Le titre de la proposition est obligatoire."); }
        return OK;
      }

      case "CHANGE_PROPOSAL_STATUS": {
        var e9 = needTopic(); if (e9) { return e9; }
        if (!Core.findProposal(topic, trim(p.proposalId))) { return fail("Cette proposition n'existe plus."); }
        if (Core.PROPOSAL_STATUSES.indexOf(trim(p.status)) < 0) { return fail("Statut de proposition invalide."); }
        return OK;
      }

      case "SET_VOTE": {
        var e10 = needTopic(); if (e10) { return e10; }
        if (!Core.findProposal(topic, trim(p.proposalId))) { return fail("Cette proposition n'existe plus."); }
        if (!trim(action.actorId)) { return fail("Vote sans participant."); }
        if (Core.VOTE_VALUES.indexOf(trim(p.value)) < 0) { return fail("Vote invalide."); }
        return OK;
      }

      case "REMOVE_VOTE": {
        var e11 = needTopic(); if (e11) { return e11; }
        if (!Core.findProposal(topic, trim(p.proposalId))) { return fail("Cette proposition n'existe plus."); }
        if (!trim(action.actorId)) { return fail("Vote sans participant."); }
        return OK;
      }

      case "ADD_CONCLUSION": {
        var e12 = needTopic(); if (e12) { return e12; }
        if (!trim(p.conclusionId)) { return fail("Conclusion sans identifiant."); }
        if (!trim(p.text)) { return fail("La conclusion est vide."); }
        if (Core.findConclusion(topic, trim(p.conclusionId))) { return fail("Cette conclusion existe déjà."); }
        return OK;
      }

      case "UPDATE_CONCLUSION_ITEM": {
        var e13 = needTopic(); if (e13) { return e13; }
        if (!Core.findConclusion(topic, trim(p.conclusionId))) { return fail("Cette conclusion n'existe plus."); }
        if (!trim(p.text)) { return fail("La conclusion est vide."); }
        return OK;
      }

      case "DELETE_CONCLUSION": {
        var e14 = needTopic(); if (e14) { return e14; }
        if (!Core.findConclusion(topic, trim(p.conclusionId))) { return fail("Cette conclusion n'existe plus."); }
        return OK;
      }

      case "SET_CONCLUSION_VOTE": {
        var e15 = needTopic(); if (e15) { return e15; }
        if (!Core.findConclusion(topic, trim(p.conclusionId))) { return fail("Cette conclusion n'existe plus."); }
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
          quoteId: trim(p.quoteId) || null
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
          /* L'anonymat EFFACE l'identité du JSON partagé. */
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
        if (mr.reactions[actor] === emoji) { delete mr.reactions[actor]; }
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
          votes: {}
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
        /* Un vote par personne ; re-cliquer le même vote le retire. */
        if (pv.votes[voter] === value) { delete pv.votes[voter]; }
        else { pv.votes[voter] = value; }
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
        /* Choix unique : re-cliquer retire, voter ailleurs déplace le vote. */
        if (topic.conclusionVotes[cv] === target) { delete topic.conclusionVotes[cv]; }
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
    version: 0
  };

  Store.bump = function () { Store.version += 1; };

  Store.setBase = function (state) {
    Store.base = Core.ensureShape(state);
    Store.rebuild();
  };

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

  /* Recalcule la vue : état serveur + rejeu des actions en attente. */
  Store.rebuild = function () {
    var view = Core.ensureShape(JSON.parse(JSON.stringify(Store.base)));
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
