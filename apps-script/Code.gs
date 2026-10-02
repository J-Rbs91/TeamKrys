/* BrainstO. — backend Google Apps Script versionné, sans secret.
 *
 * IMPORTANT : ACCESS_CODE et DATA_FILE_ID restent vides dans Git. Ils peuvent être
 * renseignés uniquement dans l'éditeur Apps Script du déploiement réel.
 *
 * Le noyau métier ci-dessous doit rester strictement équivalent à js/state.js :
 * ensureShape / validateAction / applyAction. tests/parity.test.js charge ce fichier
 * dans un VM Node et compare les deux implémentations action par action.
 */

var ACCESS_CODE = "";
var DATA_FILE_ID = "";
var PW_SALT = "brainsto.v1";
var BACKEND_VERSION = "brainsto-backend-1.2.0";

var FILE_NAME = "brainsto-data.json";
var FOLDER_NAME = "BrainstO.";
var PROP_FILE_ID = "BRAINSTO_FILE_ID";
var PROP_BACKUP_VERSION = "BRAINSTO_BACKUP_VERSION";
/* Boîte à idées : un fichier Drive À PART, jamais envoyé aux téléphones (doGet ne le lit pas), vidé par la collecte
 * quotidienne (GitHub Actions, tools/collect-ideas.js). Le secret de collecte est une propriété du script, jamais
 * dans ce fichier : sans lui (ou trop court), la collecte est désactivée. */
var IDEAS_FILE_NAME = "brainsto-idees.json";
var PROP_IDEAS_FILE_ID = "BRAINSTO_IDEAS_FILE_ID";
var PROP_IDEAS_SECRET = "BRAINSTO_IDEAS_SECRET";
var IDEAS_SECRET_MIN = 24;
var MAX_PROCESSED = 5000;
var MAX_BATCH = 20;
/* "idempotent" : SET_VOTE, SET_REACTION et SET_CONCLUSION_VOTE marquées set:true AFFECTENT
 * au lieu de basculer (voir applyAction) ; le client ne les marque que si ce drapeau est annoncé. */
var FEATURES = ["since", "batch", "lean", "idempotent", "pins", "ideas"];

var ANON_NAME = "Anonyme";
var LIMITS = {
  name: 50,
  topicTitle: 150,
  topicDescription: 3000,
  message: 3000,
  proposalTitle: 200,
  proposalDescription: 3000,
  conclusion: 5000,
  idea: 2000
};
var REACTIONS = ["👌", "💪", "🤏", "👎", "💩"];
var TOPIC_STATUSES = ["open", "ready", "closed", "archived"];
var PROPOSAL_STATUSES = ["voting", "selected", "debate", "implemented", "rejected"];
var VOTE_VALUES = ["for", "against", "abstain"];
var ACTION_TYPES = [
  "REGISTER_PARTICIPANT", "UPDATE_PARTICIPANT",
  "CREATE_TOPIC", "UPDATE_TOPIC", "CHANGE_TOPIC_STATUS",
  "CREATE_MESSAGE", "UPDATE_MESSAGE", "SET_MESSAGE_SIGNATURE", "SET_REACTION",
  "CREATE_PROPOSAL", "UPDATE_PROPOSAL", "CHANGE_PROPOSAL_STATUS", "SET_VOTE", "REMOVE_VOTE",
  "ADD_CONCLUSION", "UPDATE_CONCLUSION_ITEM", "DELETE_CONCLUSION",
  "SET_CONCLUSION_VOTE", "REMOVE_CONCLUSION_VOTE",
  "SET_TOPIC_PIN", "SUBMIT_IDEA"
];

/* =============================================================== Noyau ==== */

function str(value) { return value === null || value === undefined ? "" : String(value); }
function trim(value) { return str(value).trim(); }
/* ⚠️ Jamais une moitié de paire UTF-16 en fin de coupe : demi-caractère haut final retiré. */
function cut(value, max) {
  var text = trim(value).slice(0, max);
  var last = text.charCodeAt(text.length - 1);
  return last >= 0xD800 && last <= 0xDBFF ? text.slice(0, -1) : text;
}
function isObject(value) { return !!value && typeof value === "object" && !Array.isArray(value); }
function arr(value) { return Array.isArray(value) ? value : []; }
function oneOf(value, list, fallback) { return list.indexOf(value) >= 0 ? value : fallback; }
function ownValue(obj, key) { return Object.prototype.hasOwnProperty.call(obj, key) ? obj[key] : undefined; }
/* ⚠️ Identifiant : 120 caractères au plus, jamais un nom hérité d'Object.prototype (clé de vote,
 * réaction ou soutien ; journal de déduplication). Liste partagée avec js/state.js. */
var ID_MAX_LENGTH = 120;
var RESERVED_IDS = ["__proto__", "constructor", "prototype", "hasOwnProperty", "toString", "valueOf",
  "toLocaleString", "isPrototypeOf", "propertyIsEnumerable", "__defineGetter__", "__defineSetter__",
  "__lookupGetter__", "__lookupSetter__"];
function badId(value) { return str(value).length > ID_MAX_LENGTH || RESERVED_IDS.indexOf(trim(value)) >= 0; }

function emptyState() {
  return {
    revision: 0,
    updatedAt: new Date(0).toISOString(),
    participants: [],
    topics: [],
    processedActionIds: []
  };
}

function ensureShape(input) {
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
    state.participants.push({ id: trim(p.id), name: cut(p.name, LIMITS.name) || ANON_NAME });
  });

  arr(data.topics).forEach(function (t) {
    if (!isObject(t) || !trim(t.id)) { return; }
    var createdBy = isObject(t.createdBy) ? t.createdBy : {};
    var topic = {
      id: trim(t.id),
      title: cut(t.title, LIMITS.topicTitle) || "Sujet sans titre",
      description: cut(t.description, LIMITS.topicDescription),
      status: oneOf(trim(t.status), TOPIC_STATUSES, "open"),
      pinned: t.pinned === true,
      createdBy: {
        id: trim(createdBy.id),
        name: cut(createdBy.name, LIMITS.name) || ANON_NAME
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
          if (trim(pid) && REACTIONS.indexOf(emoji) >= 0) { reactions[trim(pid)] = emoji; }
        });
      }
      topic.messages.push({
        id: trim(m.id),
        authorId: anon ? "" : trim(m.authorId),
        authorName: anon ? ANON_NAME : (cut(m.authorName, LIMITS.name) || ANON_NAME),
        text: cut(m.text, LIMITS.message),
        createdAt: trim(m.createdAt) || topic.createdAt,
        updatedAt: trim(m.updatedAt) || trim(m.createdAt) || topic.createdAt,
        reactions: reactions,
        anon: anon,
        quoteId: trim(m.quoteId) || null
      });
    });

    var messageIds = Object.create(null);
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
          if (trim(pid) && VOTE_VALUES.indexOf(value) >= 0) { votes[trim(pid)] = value; }
        });
      }
      topic.proposals.push({
        id: trim(p.id),
        title: cut(p.title, LIMITS.proposalTitle) || "Proposition",
        description: cut(p.description, LIMITS.proposalDescription),
        authorId: trim(p.authorId),
        authorName: cut(p.authorName, LIMITS.name) || ANON_NAME,
        createdAt: trim(p.createdAt) || topic.createdAt,
        status: oneOf(trim(p.status), PROPOSAL_STATUSES, "voting"),
        votes: votes
      });
    });

    arr(t.conclusions).forEach(function (c) {
      if (!isObject(c) || !trim(c.id)) { return; }
      topic.conclusions.push({
        id: trim(c.id),
        text: cut(c.text, LIMITS.conclusion),
        source: "manual",
        authorId: trim(c.authorId),
        authorName: cut(c.authorName, LIMITS.name) || ANON_NAME,
        createdAt: trim(c.createdAt) || topic.createdAt,
        updatedAt: trim(c.updatedAt) || trim(c.createdAt) || topic.createdAt
      });
    });

    /* TeamKrys v1/v2 (d1823d6, af0500a) : le texte unique « conclusion » devient UNE
     * formulation sans auteur, d'id déterministe ; rien n'est écrasé, et relire ne
     * l'ajoute pas deux fois (l'état normalisé ne garde pas « conclusion »). */
    var legacyText = typeof t.conclusion === "string" ? cut(t.conclusion, LIMITS.conclusion) : "";
    if (legacyText && !findConclusion(topic, "legacy-" + topic.id) &&
      !topic.conclusions.some(function (c) { return c.text === legacyText; })) {
      topic.conclusions.push({
        id: "legacy-" + topic.id,
        text: legacyText,
        source: "manual",
        authorId: "",
        authorName: ANON_NAME,
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
}

function findTopic(state, topicId) {
  var topics = arr(state && state.topics);
  for (var i = 0; i < topics.length; i++) { if (topics[i].id === topicId) { return topics[i]; } }
  return null;
}

function findIn(list, id) {
  for (var i = 0; i < list.length; i++) { if (list[i].id === id) { return list[i]; } }
  return null;
}
function findMessage(topic, id) { return topic ? findIn(arr(topic.messages), id) : null; }
function findProposal(topic, id) { return topic ? findIn(arr(topic.proposals), id) : null; }
function findConclusion(topic, id) { return topic ? findIn(arr(topic.conclusions), id) : null; }

function isMessageLocked(message, participantId) {
  if (!message || !isObject(message.reactions)) { return false; }
  var keys = Object.keys(message.reactions);
  for (var i = 0; i < keys.length; i++) { if (keys[i] !== participantId) { return true; } }
  return false;
}

function fail(message) { return { ok: false, error: message }; }
var OK = { ok: true, error: null };

function validateAction(state, action) {
  if (!isObject(action)) { return fail("Action illisible."); }
  var type = trim(action.type);
  if (ACTION_TYPES.indexOf(type) < 0) { return fail("Action inconnue : " + type); }
  if (!trim(action.id)) { return fail("Action sans identifiant."); }
  var p = isObject(action.payload) ? action.payload : {};
  var topic = null;
  if ([action.id, action.actorId, p.participantId, p.topicId, p.messageId, p.proposalId,
    p.conclusionId, p.quoteId, p.ideaId].some(badId)) { return fail("Identifiant invalide."); }

  function needTopic() {
    topic = findTopic(state, trim(p.topicId));
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
      if (findTopic(state, trim(p.topicId))) { return fail("Ce sujet existe déjà."); }
      return OK;
    case "UPDATE_TOPIC":
      if (needTopic()) { return fail("Ce sujet n'existe plus."); }
      if (!trim(p.title)) { return fail("Le titre du sujet est obligatoire."); }
      return OK;
    case "CHANGE_TOPIC_STATUS":
      if (needTopic()) { return fail("Ce sujet n'existe plus."); }
      if (TOPIC_STATUSES.indexOf(trim(p.status)) < 0) { return fail("Statut de sujet invalide."); }
      return OK;
    case "SET_TOPIC_PIN":
      if (needTopic()) { return fail("Ce sujet n'existe plus."); }
      return OK;
    /* Une idée est TOUJOURS anonyme : une action qui porte un auteur est refusée. */
    case "SUBMIT_IDEA":
      if (!trim(p.ideaId)) { return fail("Idée sans identifiant."); }
      if (trim(action.actorId)) { return fail("Une idée est toujours anonyme."); }
      if (!trim(p.text)) { return fail("L'idée est vide."); }
      return OK;
    case "CREATE_MESSAGE":
      if (needTopic()) { return fail("Ce sujet n'existe plus."); }
      if (!trim(p.messageId)) { return fail("Message sans identifiant."); }
      if (!trim(p.text)) { return fail("Le message est vide."); }
      if (findMessage(topic, trim(p.messageId))) { return fail("Ce message existe déjà."); }
      if (trim(p.quoteId) && !findMessage(topic, trim(p.quoteId))) { return fail("Le message cité n'existe plus."); }
      return OK;
    case "UPDATE_MESSAGE": {
      if (needTopic()) { return fail("Ce sujet n'existe plus."); }
      var m4 = findMessage(topic, trim(p.messageId));
      if (!m4) { return fail("Ce message n'existe plus."); }
      if (!trim(p.text)) { return fail("Le message est vide."); }
      if (isMessageLocked(m4, trim(action.actorId))) { return fail("Message verrouillé : quelqu'un y a déjà réagi."); }
      return OK;
    }
    case "SET_MESSAGE_SIGNATURE":
      if (needTopic()) { return fail("Ce sujet n'existe plus."); }
      if (!findMessage(topic, trim(p.messageId))) { return fail("Ce message n'existe plus."); }
      return OK;
    case "SET_REACTION":
      if (needTopic()) { return fail("Ce sujet n'existe plus."); }
      if (!findMessage(topic, trim(p.messageId))) { return fail("Ce message n'existe plus."); }
      if (!trim(action.actorId)) { return fail("Réaction sans participant."); }
      /* emoji "" = retrait, admis seulement dans une action marquée (set:true). */
      if (REACTIONS.indexOf(trim(p.emoji)) < 0 && !(p.set === true && trim(p.emoji) === "")) {
        return fail("Réaction non autorisée.");
      }
      return OK;
    case "CREATE_PROPOSAL":
      if (needTopic()) { return fail("Ce sujet n'existe plus."); }
      if (!trim(p.proposalId)) { return fail("Proposition sans identifiant."); }
      if (!trim(p.title)) { return fail("Le titre de la proposition est obligatoire."); }
      if (findProposal(topic, trim(p.proposalId))) { return fail("Cette proposition existe déjà."); }
      return OK;
    case "UPDATE_PROPOSAL":
      if (needTopic()) { return fail("Ce sujet n'existe plus."); }
      if (!findProposal(topic, trim(p.proposalId))) { return fail("Cette proposition n'existe plus."); }
      if (!trim(p.title)) { return fail("Le titre de la proposition est obligatoire."); }
      return OK;
    case "CHANGE_PROPOSAL_STATUS":
      if (needTopic()) { return fail("Ce sujet n'existe plus."); }
      if (!findProposal(topic, trim(p.proposalId))) { return fail("Cette proposition n'existe plus."); }
      if (PROPOSAL_STATUSES.indexOf(trim(p.status)) < 0) { return fail("Statut de proposition invalide."); }
      return OK;
    case "SET_VOTE":
      if (needTopic()) { return fail("Ce sujet n'existe plus."); }
      if (!findProposal(topic, trim(p.proposalId))) { return fail("Cette proposition n'existe plus."); }
      if (!trim(action.actorId)) { return fail("Vote sans participant."); }
      if (VOTE_VALUES.indexOf(trim(p.value)) < 0) { return fail("Vote invalide."); }
      return OK;
    case "REMOVE_VOTE":
      if (needTopic()) { return fail("Ce sujet n'existe plus."); }
      if (!findProposal(topic, trim(p.proposalId))) { return fail("Cette proposition n'existe plus."); }
      if (!trim(action.actorId)) { return fail("Vote sans participant."); }
      return OK;
    case "ADD_CONCLUSION":
      if (needTopic()) { return fail("Ce sujet n'existe plus."); }
      if (!trim(p.conclusionId)) { return fail("Formulation du consensus sans identifiant."); }
      if (!trim(p.text)) { return fail("La formulation du consensus est vide."); }
      if (findConclusion(topic, trim(p.conclusionId))) { return fail("Cette formulation du consensus existe déjà."); }
      return OK;
    case "UPDATE_CONCLUSION_ITEM":
      if (needTopic()) { return fail("Ce sujet n'existe plus."); }
      if (!findConclusion(topic, trim(p.conclusionId))) { return fail("Cette formulation du consensus n'existe plus."); }
      if (!trim(p.text)) { return fail("La formulation du consensus est vide."); }
      return OK;
    case "DELETE_CONCLUSION":
      if (needTopic()) { return fail("Ce sujet n'existe plus."); }
      if (!findConclusion(topic, trim(p.conclusionId))) { return fail("Cette formulation du consensus n'existe plus."); }
      return OK;
    case "SET_CONCLUSION_VOTE":
      if (needTopic()) { return fail("Ce sujet n'existe plus."); }
      if (!findConclusion(topic, trim(p.conclusionId))) { return fail("Cette formulation du consensus n'existe plus."); }
      if (!trim(action.actorId)) { return fail("Vote sans participant."); }
      return OK;
    case "REMOVE_CONCLUSION_VOTE":
      if (needTopic()) { return fail("Ce sujet n'existe plus."); }
      if (!trim(action.actorId)) { return fail("Vote sans participant."); }
      return OK;
    default:
      return fail("Action non gérée : " + type);
  }
}

function author(action, anon) {
  if (anon) { return { id: "", name: ANON_NAME }; }
  return { id: trim(action.actorId), name: cut(action.actorName, LIMITS.name) || ANON_NAME };
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

function applyAction(state, action, now) {
  var p = isObject(action.payload) ? action.payload : {};
  var type = trim(action.type);
  var topic = findTopic(state, trim(p.topicId));

  switch (type) {
    case "REGISTER_PARTICIPANT":
    case "UPDATE_PARTICIPANT": {
      var pid = trim(p.participantId);
      var name = cut(p.name, LIMITS.name);
      upsertParticipant(state, pid, name);
      state.topics.forEach(function (t) {
        if (t.createdBy && t.createdBy.id === pid) { t.createdBy.name = name; }
        t.messages.forEach(function (m) { if (!m.anon && m.authorId === pid) { m.authorName = name; } });
        t.proposals.forEach(function (x) { if (x.authorId === pid) { x.authorName = name; } });
        t.conclusions.forEach(function (c) { if (c.authorId === pid) { c.authorName = name; } });
      });
      touch(state, null, now); return;
    }
    case "CREATE_TOPIC": {
      var who = author(action, p.anon === true);
      state.topics.push({
        id: trim(p.topicId), title: cut(p.title, LIMITS.topicTitle),
        description: cut(p.description, LIMITS.topicDescription), status: "open", pinned: false,
        createdBy: who, createdAt: now, updatedAt: now,
        messages: [], proposals: [], conclusions: [], conclusionVotes: {}
      });
      touch(state, null, now); return;
    }
    case "UPDATE_TOPIC":
      topic.title = cut(p.title, LIMITS.topicTitle);
      topic.description = cut(p.description, LIMITS.topicDescription);
      touch(state, topic, now); return;
    case "CHANGE_TOPIC_STATUS":
      topic.status = trim(p.status); touch(state, topic, now); return;
    /* Épingler n'est pas une activité du débat : la date du sujet ne bouge pas. */
    case "SET_TOPIC_PIN":
      topic.pinned = p.pinned === true; state.updatedAt = now; return;
    /* L'idée n'entre jamais dans l'état partagé : doPost la range dans la boîte à idées (voir plus bas). */
    case "SUBMIT_IDEA":
      return;
    case "CREATE_MESSAGE": {
      var mWho = author(action, p.anon === true);
      topic.messages.push({
        id: trim(p.messageId), authorId: mWho.id, authorName: mWho.name,
        text: cut(p.text, LIMITS.message), createdAt: now, updatedAt: now,
        reactions: {}, anon: p.anon === true, quoteId: trim(p.quoteId) || null
      });
      touch(state, topic, now); return;
    }
    case "UPDATE_MESSAGE": {
      var m = findMessage(topic, trim(p.messageId));
      m.text = cut(p.text, LIMITS.message); m.updatedAt = now;
      touch(state, topic, now); return;
    }
    case "SET_MESSAGE_SIGNATURE": {
      var ms = findMessage(topic, trim(p.messageId));
      var anon = p.anon === true;
      ms.anon = anon;
      if (anon) {
        /* L'anonymat efface aussi l'identité comme clé de réaction : auteur et acteur (§5). */
        if (ms.authorId) { delete ms.reactions[ms.authorId]; }
        if (trim(action.actorId)) { delete ms.reactions[trim(action.actorId)]; }
        ms.authorId = ""; ms.authorName = ANON_NAME;
      }
      else {
        var signed = author(action, false);
        ms.authorId = signed.id; ms.authorName = signed.name;
      }
      ms.updatedAt = now; touch(state, topic, now); return;
    }
    case "SET_REACTION": {
      var mr = findMessage(topic, trim(p.messageId));
      var actor = trim(action.actorId);
      var emoji = trim(p.emoji);
      /* ⚠️ set:true (FEATURES "idempotent") : AFFECTE, "" retire, rejouée = sans effet ;
       * sans marqueur : bascule historique (anciens clients). */
      if (p.set === true) {
        var had = ownValue(mr.reactions, actor);
        if (emoji) { mr.reactions[actor] = emoji; } else { delete mr.reactions[actor]; }
        if (ownValue(mr.reactions, actor) === had) { return; }
      }
      else if (ownValue(mr.reactions, actor) === emoji) { delete mr.reactions[actor]; }
      else { mr.reactions[actor] = emoji; }
      touch(state, topic, now); return;
    }
    case "CREATE_PROPOSAL": {
      var pWho = author(action, false);
      topic.proposals.push({
        id: trim(p.proposalId), title: cut(p.title, LIMITS.proposalTitle),
        description: cut(p.description, LIMITS.proposalDescription),
        authorId: pWho.id, authorName: pWho.name, createdAt: now,
        status: "voting", votes: {}
      });
      touch(state, topic, now); return;
    }
    case "UPDATE_PROPOSAL": {
      var pr = findProposal(topic, trim(p.proposalId));
      pr.title = cut(p.title, LIMITS.proposalTitle);
      pr.description = cut(p.description, LIMITS.proposalDescription);
      touch(state, topic, now); return;
    }
    case "CHANGE_PROPOSAL_STATUS":
      findProposal(topic, trim(p.proposalId)).status = trim(p.status);
      touch(state, topic, now); return;
    case "SET_VOTE": {
      var pv = findProposal(topic, trim(p.proposalId));
      var voter = trim(action.actorId);
      var value = trim(p.value);
      if (p.set === true) {
        var was = ownValue(pv.votes, voter);
        pv.votes[voter] = value;
        if (ownValue(pv.votes, voter) === was) { return; }
      }
      else if (ownValue(pv.votes, voter) === value) { delete pv.votes[voter]; }
      else { pv.votes[voter] = value; }
      touch(state, topic, now); return;
    }
    case "REMOVE_VOTE":
      delete findProposal(topic, trim(p.proposalId)).votes[trim(action.actorId)];
      touch(state, topic, now); return;
    case "ADD_CONCLUSION": {
      var cWho = author(action, false);
      topic.conclusions.push({
        id: trim(p.conclusionId), text: cut(p.text, LIMITS.conclusion), source: "manual",
        authorId: cWho.id, authorName: cWho.name, createdAt: now, updatedAt: now
      });
      touch(state, topic, now); return;
    }
    case "UPDATE_CONCLUSION_ITEM": {
      var ci = findConclusion(topic, trim(p.conclusionId));
      ci.text = cut(p.text, LIMITS.conclusion); ci.updatedAt = now;
      touch(state, topic, now); return;
    }
    case "DELETE_CONCLUSION": {
      var cid = trim(p.conclusionId);
      topic.conclusions = topic.conclusions.filter(function (c) { return c.id !== cid; });
      Object.keys(topic.conclusionVotes).forEach(function (voterId) {
        if (topic.conclusionVotes[voterId] === cid) { delete topic.conclusionVotes[voterId]; }
      });
      touch(state, topic, now); return;
    }
    case "SET_CONCLUSION_VOTE": {
      var cv = trim(action.actorId);
      var target = trim(p.conclusionId);
      if (p.set === true) {
        var prev = ownValue(topic.conclusionVotes, cv);
        topic.conclusionVotes[cv] = target;
        if (ownValue(topic.conclusionVotes, cv) === prev) { return; }
      }
      else if (ownValue(topic.conclusionVotes, cv) === target) { delete topic.conclusionVotes[cv]; }
      else { topic.conclusionVotes[cv] = target; }
      touch(state, topic, now); return;
    }
    case "REMOVE_CONCLUSION_VOTE":
      delete topic.conclusionVotes[trim(action.actorId)];
      touch(state, topic, now); return;
  }
}

function leanState(state) {
  return {
    revision: state.revision,
    updatedAt: state.updatedAt,
    participants: state.participants,
    topics: state.topics
  };
}

/* =============================================================== Hachage === */

function serverTokenInput(code) { return "srv|" + PW_SALT + "|" + String(code == null ? "" : code); }
function verifierInput(code) { return "lock|" + PW_SALT + "|" + String(code == null ? "" : code); }
function sha256Hex(text) {
  var bytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    String(text),
    Utilities.Charset.UTF_8
  );
  return bytes.map(function (value) {
    var unsigned = value < 0 ? value + 256 : value;
    return ("0" + unsigned.toString(16)).slice(-2);
  }).join("");
}
function expectedToken() { return ACCESS_CODE ? sha256Hex(serverTokenInput(ACCESS_CODE)) : ""; }
function isAuthorized(e) {
  var given = e && e.parameter ? str(e.parameter.auth) : "";
  return given === expectedToken();
}

/* =============================================================== Drive ===== */

function getOrCreateFolder() {
  var folders = DriveApp.getFoldersByName(FOLDER_NAME);
  if (folders.hasNext()) { return folders.next(); }
  return DriveApp.createFolder(FOLDER_NAME);
}

function configuredFileId() {
  if (trim(DATA_FILE_ID)) { return trim(DATA_FILE_ID); }
  return PropertiesService.getScriptProperties().getProperty(PROP_FILE_ID) || "";
}

function folderNameOf(file) {
  var parents = file.getParents();
  return parents.hasNext() ? parents.next().getName() : "(aucun dossier)";
}

function describeFile(file) {
  return file.getId() + " (dossier « " + folderNameOf(file) + " », " + file.getSize() +
    " octets, modifié le " + file.getLastUpdated().toISOString() + ")";
}

/* Fichiers « brainsto-data.json » hors corbeille (la recherche par nom renvoie
 * aussi la corbeille, dans un ordre que Google ne documente pas). */
function activeDataFiles() {
  var files = DriveApp.getFilesByName(FILE_NAME);
  var found = [];
  while (files.hasNext()) {
    var file = files.next();
    if (!file.isTrashed()) { found.push(file); }
  }
  return found;
}

function homonymsMessage(files) {
  return "Plusieurs fichiers « " + FILE_NAME + " » existent et aucun n'est rattaché : aucun n'a été choisi. " +
    files.map(function (file, i) { return "Fichier " + (i + 1) + " : " + describeFile(file) + "."; }).join(" ") +
    " Pour rattacher le bon : dans l'éditeur Apps Script, copiez son identifiant dans DATA_FILE_ID en haut du" +
    " script, enregistrez, puis exécutez setupProject() (ou posez la propriété du script " + PROP_FILE_ID + ")." +
    " diagnoseStorage() décrit chaque fichier.";
}

/* ⚠️ Sans rattachement, on ne choisit JAMAIS entre deux homonymes (§23) : erreur
 * explicite, que doGet/doPost renvoient en code "retry" (les actions restent en file). */
function findExistingDataFile() {
  var found = activeDataFiles();
  if (found.length > 1) { throw new Error(homonymsMessage(found)); }
  return found.length ? found[0] : null;
}

function getDataFile() {
  var id = configuredFileId();
  if (id) { return DriveApp.getFileById(id); }
  var found = findExistingDataFile();
  if (found) { return found; }
  throw new Error("Fichier de données introuvable. Exécutez setupProject() pour un espace neuf.");
}

function setupProject() {
  var props = PropertiesService.getScriptProperties();
  var id = configuredFileId();
  if (id) {
    var configured = DriveApp.getFileById(id);
    props.setProperty(PROP_FILE_ID, configured.getId());
    return logResult("Fichier déjà configuré : " + configured.getName() + " (" + configured.getId() + ")");
  }
  var existing = activeDataFiles();
  /* Plusieurs homonymes : rien n'est rattaché, le journal dit lesquels et comment choisir. */
  if (existing.length > 1) { return logResult(homonymsMessage(existing)); }
  if (existing.length) {
    props.setProperty(PROP_FILE_ID, existing[0].getId());
    return logResult("Fichier existant réutilisé : " + describeFile(existing[0]));
  }
  var folder = getOrCreateFolder();
  var created = folder.createFile(FILE_NAME, JSON.stringify(emptyState(), null, 2), "application/json");
  props.setProperty(PROP_FILE_ID, created.getId());
  return logResult("Fichier créé : " + created.getId());
}

function readDataFile() {
  var file = getDataFile();
  var content = file.getBlob().getDataAsString("UTF-8");
  return ensureShape(content ? JSON.parse(content) : emptyState());
}

function maybeBackupBeforeWrite(file) {
  var props = PropertiesService.getScriptProperties();
  if (props.getProperty(PROP_BACKUP_VERSION) === BACKEND_VERSION) { return; }
  createBackup(file, "avant-" + BACKEND_VERSION);
  props.setProperty(PROP_BACKUP_VERSION, BACKEND_VERSION);
}

function writeDataFile(state) {
  var file = getDataFile();
  maybeBackupBeforeWrite(file);
  file.setContent(JSON.stringify(state, null, 2));
}

function createBackup(file, reason) {
  var name = FILE_NAME + "." + reason + "." + new Date().toISOString().replace(/[:.]/g, "-");
  var parents = file.getParents();
  var folder = parents.hasNext() ? parents.next() : DriveApp.getRootFolder();
  /* ⚠️ Le blob porte le nom du fichier source : on le renomme AVANT createFile.
   * Créer puis renommer laissait un second « brainsto-data.json » si le renommage échouait. */
  return folder.createFile(file.getBlob().setName(name));
}

function backupNow() {
  var backup = createBackup(getDataFile(), "manuel");
  return logResult("Sauvegarde créée : " + backup.getName() + " (" + backup.getId() + ")");
}

/* Restauration d'une copie (§23), depuis l'éditeur : restoreFromBackup("identifiant de la copie").
 * Le contenu de la copie est réécrit DANS le fichier rattaché (le rattachement ne change pas),
 * l'état remplacé est d'abord sauvegardé, rien n'est supprimé.
 * ⚠️ revision = max(courante, copie) + 1 : un numéro de révision ne se répète jamais, sinon un
 * appareil resté sur ce numéro garderait l'ancien état sous « À jour » (§21). */
function restoreFromBackup(backupFileId) {
  var backupId = trim(backupFileId);
  if (!backupId) { throw new Error("Indiquez l'identifiant de la copie : restoreFromBackup(\"identifiant\")."); }
  var lock = LockService.getScriptLock();
  lock.waitLock(45000);
  try {
    var file = getDataFile();
    var backup = DriveApp.getFileById(backupId);
    if (backup.getId() === file.getId()) {
      throw new Error("Ce fichier est déjà le fichier de données utilisé : indiquez une copie de sauvegarde.");
    }
    var copy = null;
    try { copy = JSON.parse(backup.getBlob().getDataAsString("UTF-8")); } catch (unreadable) { copy = null; }
    /* Une copie BrainstO porte au moins une liste de sujets (v1, v2 et 1.x compris, même vide) :
     * « {} » ou le JSON d'une autre application viderait les données de l'équipe. */
    if (!isObject(copy) || !Array.isArray(copy.topics)) {
      throw new Error("La copie " + backup.getName() + " n'est pas un fichier de données lisible : rien n'a été modifié.");
    }
    var restored = ensureShape(copy);
    var raw = file.getBlob().getDataAsString("UTF-8");
    var current;
    try { current = ensureShape(raw ? JSON.parse(raw) : emptyState()); }
    catch (damaged) {
      /* Fichier courant abîmé : on garde au moins son numéro de révision. */
      var found = /"revision"\s*:\s*(\d+)/.exec(raw);
      current = { revision: found ? Number(found[1]) : 0, processedActionIds: [] };
    }
    /* §5 : un message rendu anonyme APRÈS la copie reste anonyme une fois la copie restaurée. Le travail
     * est celui du noyau (SET_MESSAGE_SIGNATURE) : mêmes champs vidés, mêmes clés de réaction retirées,
     * même libellé. Fichier courant abîmé : current.topics est absent, rien à reporter. */
    arr(current.topics).forEach(function (ct) {
      var rt = findTopic(restored, ct.id);
      arr(ct.messages).forEach(function (cm) {
        var rm = cm.anon === true && rt ? findMessage(rt, cm.id) : null;
        if (!rm || rm.anon === true) { return; }
        applyAction(restored, {
          type: "SET_MESSAGE_SIGNATURE", actorId: rm.authorId,
          payload: { topicId: rt.id, messageId: rm.id, anon: true }
        }, new Date().toISOString());
      });
    });
    var safety = createBackup(file, "avant-restauration");
    restored.revision = Math.max(current.revision, restored.revision) + 1;
    restored.updatedAt = new Date().toISOString();
    /* Journal de déduplication : union (copie puis courant), les plus récents gardés. */
    var seen = Object.create(null);
    var ids = [];
    restored.processedActionIds.concat(current.processedActionIds).forEach(function (id) {
      if (seen[id] !== true) { seen[id] = true; ids.push(id); }
    });
    restored.processedActionIds = ids.slice(-MAX_PROCESSED);
    file.setContent(JSON.stringify(restored, null, 2));
    return logResult("Copie " + backup.getName() + " (" + backup.getId() + ") restaurée dans " + file.getName() +
      " (" + file.getId() + "), révision " + restored.revision + ". État remplacé sauvegardé : " +
      safety.getName() + " (" + safety.getId() + "). Aucun fichier supprimé.");
  } finally {
    try { lock.releaseLock(); } catch (ignore) { /* verrou non acquis */ }
  }
}

function describeCandidate(f, usedId) {
  var entry = {
    id: f.getId(), name: f.getName(), used: f.getId() === usedId, folder: folderNameOf(f),
    size: f.getSize(), trashed: f.isTrashed(), updatedAt: f.getLastUpdated().toISOString()
  };
  try {
    var parsed = ensureShape(JSON.parse(f.getBlob().getDataAsString("UTF-8") || "{}"));
    entry.revision = parsed.revision;
    entry.topics = parsed.topics.length;
    entry.participants = parsed.participants.length;
    var messages = 0;
    parsed.topics.forEach(function (topic) { messages += topic.messages.length; });
    entry.messages = messages;
  } catch (error) { entry.error = String(error); }
  return entry;
}

/* N'écrit rien. Dit quel fichier le service utilise RÉELLEMENT (ou pourquoi aucun),
 * décrit chaque candidat et alerte sur les homonymes (§23). */
function diagnoseStorage() {
  var result = {
    configuredId: configuredFileId() || null,
    dataFileId: trim(DATA_FILE_ID) || null,
    property: PropertiesService.getScriptProperties().getProperty(PROP_FILE_ID) || null,
    used: null,
    candidates: []
  };
  var usedFile = null;
  try { usedFile = getDataFile(); }
  catch (error) { result.usedError = String(error && error.message ? error.message : error); }
  var usedId = usedFile ? usedFile.getId() : "";
  var active = 0;
  var files = DriveApp.getFilesByName(FILE_NAME);
  while (files.hasNext()) {
    var entry = describeCandidate(files.next(), usedId);
    if (!entry.trashed) { active += 1; }
    if (entry.used) { result.used = entry; }
    result.candidates.push(entry);
  }
  /* Fichier rattaché sous un autre nom (copie restaurée par identifiant) : décrit aussi. */
  if (usedFile && !result.used) {
    result.used = describeCandidate(usedFile, usedId);
    result.candidates.push(result.used);
  }
  var warnings = [];
  if (result.usedError) { warnings.push(result.usedError); }
  else if (active > 1) {
    warnings.push(active + " fichiers « " + FILE_NAME + " » hors corbeille : le service utilise le fichier rattaché " +
      usedId + ", les autres sont ignorés. Ne supprimez rien sans avoir vérifié leur contenu.");
  }
  if (result.used && result.used.trashed) {
    warnings.push("Le fichier utilisé est dans la corbeille de Drive : restaurez-le avant qu'il soit effacé.");
  }
  if (warnings.length) { result.warning = warnings.join(" "); }
  Logger.log(JSON.stringify(result, null, 2));
  return result;
}

function logResult(message) { Logger.log(message); return message; }

/* ======================================================= Boîte à idées ===== */

/* ⚠️ Anonymat par construction : la boîte ne garde QUE la référence et le texte. Ni auteur (l'action en est privée,
 * voir validateAction), ni heure, ni identifiant d'appareil. La référence dérive de l'identifiant d'idée : une
 * action renvoyée après une réponse perdue retombe sur la même référence et n'est pas comptée deux fois. */
function ideaEntry(action) {
  var p = isObject(action && action.payload) ? action.payload : {};
  return { ref: sha256Hex("idea|" + trim(p.ideaId)).slice(0, 12), text: cut(p.text, LIMITS.idea) };
}

function ideasFolder() {
  try {
    var parents = getDataFile().getParents();
    if (parents.hasNext()) { return parents.next(); }
  } catch (ignore) { /* pas encore de fichier de données : dossier par défaut */ }
  return getOrCreateFolder();
}

function ideasFile(create) {
  var props = PropertiesService.getScriptProperties();
  var id = trim(props.getProperty(PROP_IDEAS_FILE_ID));
  if (id) { return DriveApp.getFileById(id); }
  if (!create) { return null; }
  var file = ideasFolder().createFile(IDEAS_FILE_NAME, JSON.stringify({ v: 1, ideas: [] }));
  props.setProperty(PROP_IDEAS_FILE_ID, file.getId());
  return file;
}

function readIdeas(file) {
  var box = { v: 1, ideas: [] };
  if (!file) { return box; }
  var content = file.getBlob().getDataAsString("UTF-8");
  var data = content ? JSON.parse(content) : null;
  arr(isObject(data) ? data.ideas : null).forEach(function (i) {
    if (isObject(i) && trim(i.ref) && trim(i.text)) { box.ideas.push({ ref: trim(i.ref), text: cut(i.text, LIMITS.idea) }); }
  });
  return box;
}

/* Appelé SOUS le verrou de doPost, AVANT l'écriture de l'état : si la boîte ne peut pas être écrite, l'action n'est
 * pas marquée traitée et le client la renverra. L'ordre inverse perdrait l'idée en silence. */
function queueIdeas(entries) {
  if (!entries.length) { return; }
  var file = ideasFile(true);
  var box = readIdeas(file);
  var known = {};
  box.ideas.forEach(function (i) { known[i.ref] = true; });
  var added = 0;
  entries.forEach(function (entry) {
    if (!known[entry.ref]) { box.ideas.push(entry); known[entry.ref] = true; added += 1; }
  });
  if (added) { file.setContent(JSON.stringify(box)); }
}

/* Collecte (GitHub Actions) : POST ?op=ideas-export ou ?op=ideas-ack, corps { secret, refs }. Pas de jeton d'équipe :
 * le secret de collecte le remplace, et il n'ouvre QUE la boîte (jamais l'état). L'acquittement retire ce qui a été
 * publié dans le dépôt ; sans acquittement, la collecte suivante le reverra (le script ignore les doublons). */
function handleIdeasOp(e) {
  var op = str(e.parameter.op);
  var expected = trim(PropertiesService.getScriptProperties().getProperty(PROP_IDEAS_SECRET));
  if (expected.length < IDEAS_SECRET_MIN) {
    return { ok: false, code: "disabled", error: "Collecte désactivée : propriété " + PROP_IDEAS_SECRET +
      " absente ou trop courte (" + IDEAS_SECRET_MIN + " caractères au moins)." };
  }
  var body = null;
  try { body = JSON.parse(e && e.postData && e.postData.contents ? e.postData.contents : "null"); } catch (ignore) { body = null; }
  if (!isObject(body) || str(body.secret) !== expected) { return authFailure(); }
  if (op !== "ideas-export" && op !== "ideas-ack") { return { ok: false, code: "invalid", error: "Opération inconnue." }; }
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(45000);
    var file = ideasFile(false);
    var box = readIdeas(file);
    if (op === "ideas-export") {
      return { ok: true, backendVersion: BACKEND_VERSION, ideas: box.ideas };
    }
    var refs = arr(body.refs).map(trim);
    var keep = box.ideas.filter(function (i) { return refs.indexOf(i.ref) < 0; });
    var removed = box.ideas.length - keep.length;
    if (removed && file) { box.ideas = keep; file.setContent(JSON.stringify(box)); }
    return { ok: true, removed: removed };
  } catch (error) {
    return retryFailure(String(error && error.message ? error.message : error));
  } finally {
    try { lock.releaseLock(); } catch (ignore) { /* verrou non acquis */ }
  }
}

/* =============================================================== API ======= */

function envelope(payload) {
  var out = { ok: true, features: FEATURES.slice(), backendVersion: BACKEND_VERSION };
  Object.keys(payload || {}).forEach(function (key) { out[key] = payload[key]; });
  return out;
}

function authFailure() { return { ok: false, code: "auth", error: "Accès refusé par le serveur." }; }

/* Codes d'échec (additifs : un ancien client ignore `code`) :
 *   "invalid" : action rejetée par la validation, DÉFINITIF (inutile de la renvoyer) ;
 *   "retry"   : rien n'a été appliqué (verrou, Drive, corps illisible, exception) :
 *               l'action doit rester en file et repartir plus tard.
 * ⚠️ Jamais "invalid" pour une exception : le client retirerait une action non appliquée. */
function retryFailure(message) { return { ok: false, code: "retry", error: message }; }

function doGet(e) {
  try {
    if (!isAuthorized(e)) { return createJsonResponse(authFailure()); }
    var mode = e && e.parameter ? str(e.parameter.mode) : "state";
    var state = readDataFile();
    if (mode === "revision") {
      return createJsonResponse(envelope({ revision: state.revision, updatedAt: state.updatedAt }));
    }
    var sinceRaw = e && e.parameter ? e.parameter.since : null;
    if (sinceRaw !== null && sinceRaw !== undefined && sinceRaw !== "") {
      var since = parseInt(sinceRaw, 10);
      if (!isNaN(since) && since === state.revision) {
        return createJsonResponse(envelope({ unchanged: true, revision: state.revision }));
      }
    }
    return createJsonResponse(envelope({ revision: state.revision, state: leanState(state) }));
  } catch (error) {
    return createJsonResponse(retryFailure(String(error && error.message ? error.message : error)));
  }
}

function applyOne(state, action, now) {
  var actionId = trim(action && action.id);
  if (actionId && state.processedActionIds.indexOf(actionId) >= 0) {
    return { id: actionId, ok: true, duplicate: true };
  }
  var verdict = validateAction(state, action);
  if (!verdict.ok) { return { id: actionId, ok: false, code: "invalid", error: verdict.error }; }
  /* Une idée ne laisse AUCUNE trace dans l'état partagé : ni révision, ni date, ni identifiant d'action. Sinon un
   * membre qui voit la révision avancer sans rien de visible saurait à quelle heure une idée a été déposée.
   * Un renvoi est dédupliqué par la référence de l'idée : dans la boîte (queueIdeas), puis dans le dépôt (collecte). */
  if (trim(action && action.type) === "SUBMIT_IDEA") { return { id: actionId, ok: true }; }
  applyAction(state, action, now);
  state.revision += 1;
  state.updatedAt = now;
  state.processedActionIds.push(actionId);
  if (state.processedActionIds.length > MAX_PROCESSED) {
    state.processedActionIds = state.processedActionIds.slice(-MAX_PROCESSED);
  }
  return { id: actionId, ok: true };
}

function doPost(e) {
  if (e && e.parameter && e.parameter.op) { return createJsonResponse(handleIdeasOp(e)); }
  if (!isAuthorized(e)) { return createJsonResponse(authFailure()); }
  var lock = LockService.getScriptLock();
  try {
    var body = e && e.postData && e.postData.contents ? e.postData.contents : "";
    var parsed = JSON.parse(body || "null");
    var batched = Array.isArray(parsed);
    var actions = batched ? parsed : [parsed];
    /* Corps vide : rien de lisible, donc rien d'appliqué (retry, jamais invalid). */
    if (!actions.length || parsed === null) { return createJsonResponse(retryFailure("Aucune action reçue.")); }
    if (actions.length > MAX_BATCH) { return createJsonResponse(retryFailure("Lot trop volumineux.")); }

    lock.waitLock(45000);
    var state = readDataFile();
    var results = [];
    var changed = false;
    var ideas = [];
    for (var i = 0; i < actions.length; i++) {
      var before = state.revision;
      var result = applyOne(state, actions[i], new Date().toISOString());
      results.push(result);
      if (state.revision !== before) { changed = true; }
      if (!batched && !result.ok) {
        return createJsonResponse({ ok: false, code: "invalid", error: result.error });
      }
      if (result.ok && !result.duplicate && trim(actions[i] && actions[i].type) === "SUBMIT_IDEA") {
        ideas.push(ideaEntry(actions[i]));
      }
    }
    /* La boîte d'abord, l'état ensuite (voir queueIdeas). */
    queueIdeas(ideas);
    if (changed) { writeDataFile(state); }

    var payload = { revision: state.revision, state: leanState(state) };
    if (batched) { payload.results = results; }
    else if (results[0] && results[0].duplicate) { payload.duplicate = true; }
    return createJsonResponse(envelope(payload));
  } catch (error) {
    /* Verrou dépassé, Drive en lecture ou en écriture, corps illisible : l'écriture du
     * fichier est la DERNIÈRE opération et porte l'état ET processedActionIds ensemble,
     * donc rien n'est écrit à moitié et le client peut renvoyer sans risque (déduplication). */
    return createJsonResponse(retryFailure(String(error && error.message ? error.message : "Requête invalide.")));
  } finally {
    try { lock.releaseLock(); } catch (ignore) { /* verrou non acquis */ }
  }
}

function createJsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/* =============================================================== Self-test = */

function runSelfTest() {
  var failures = [];
  function assert(condition, label) { if (!condition) { failures.push(label); } }
  assert(sha256Hex("abc") === "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad", "SHA-256 abc");
  assert(sha256Hex("réunion") === "8c85d3fa84b7926e2e0664129cefa7ea17401086243561611c56ee5016908ea1", "SHA-256 UTF-8");
  assert(serverTokenInput("x") !== verifierInput("x"), "séparation token/verifier");

  var state = emptyState();
  var action = {
    id: "self-test", type: "CREATE_TOPIC", actorId: "u1", actorName: "Test",
    payload: { topicId: "t1", title: "Test" }
  };
  var verdict = validateAction(state, action);
  assert(verdict.ok, "validation CREATE_TOPIC");
  if (verdict.ok) { applyAction(state, action, "2026-01-01T00:00:00.000Z"); }
  assert(state.topics.length === 1 && state.topics[0].title === "Test", "réduction CREATE_TOPIC");

  if (failures.length) { throw new Error("Self-test échoué : " + failures.join(", ")); }
  return logResult("BrainstO backend self-test : OK");
}
