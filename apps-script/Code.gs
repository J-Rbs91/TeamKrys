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
var BACKEND_VERSION = "brainsto-backend-1.0.0";

var FILE_NAME = "brainsto-data.json";
var FOLDER_NAME = "BrainstO.";
var PROP_FILE_ID = "BRAINSTO_FILE_ID";
var PROP_BACKUP_VERSION = "BRAINSTO_BACKUP_VERSION";
var MAX_PROCESSED = 5000;
var MAX_BATCH = 20;
var FEATURES = ["since", "batch", "lean"];

var ANON_NAME = "Anonyme";
var LIMITS = {
  name: 50,
  topicTitle: 150,
  topicDescription: 3000,
  message: 3000,
  proposalTitle: 200,
  proposalDescription: 3000,
  conclusion: 5000
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
  "SET_CONCLUSION_VOTE", "REMOVE_CONCLUSION_VOTE"
];

/* =============================================================== Noyau ==== */

function str(value) { return value === null || value === undefined ? "" : String(value); }
function trim(value) { return str(value).trim(); }
function cut(value, max) { return trim(value).slice(0, max); }
function isObject(value) { return !!value && typeof value === "object" && !Array.isArray(value); }
function arr(value) { return Array.isArray(value) ? value : []; }
function oneOf(value, list, fallback) { return list.indexOf(value) >= 0 ? value : fallback; }

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
      if (REACTIONS.indexOf(trim(p.emoji)) < 0) { return fail("Réaction non autorisée."); }
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
      if (!trim(p.conclusionId)) { return fail("Conclusion sans identifiant."); }
      if (!trim(p.text)) { return fail("La conclusion est vide."); }
      if (findConclusion(topic, trim(p.conclusionId))) { return fail("Cette conclusion existe déjà."); }
      return OK;
    case "UPDATE_CONCLUSION_ITEM":
      if (needTopic()) { return fail("Ce sujet n'existe plus."); }
      if (!findConclusion(topic, trim(p.conclusionId))) { return fail("Cette conclusion n'existe plus."); }
      if (!trim(p.text)) { return fail("La conclusion est vide."); }
      return OK;
    case "DELETE_CONCLUSION":
      if (needTopic()) { return fail("Ce sujet n'existe plus."); }
      if (!findConclusion(topic, trim(p.conclusionId))) { return fail("Cette conclusion n'existe plus."); }
      return OK;
    case "SET_CONCLUSION_VOTE":
      if (needTopic()) { return fail("Ce sujet n'existe plus."); }
      if (!findConclusion(topic, trim(p.conclusionId))) { return fail("Cette conclusion n'existe plus."); }
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
        description: cut(p.description, LIMITS.topicDescription), status: "open",
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
      if (anon) { ms.authorId = ""; ms.authorName = ANON_NAME; }
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
      if (mr.reactions[actor] === emoji) { delete mr.reactions[actor]; }
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
      if (pv.votes[voter] === value) { delete pv.votes[voter]; }
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
      if (topic.conclusionVotes[cv] === target) { delete topic.conclusionVotes[cv]; }
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

function findExistingDataFile() {
  var files = DriveApp.getFilesByName(FILE_NAME);
  return files.hasNext() ? files.next() : null;
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
  var found = findExistingDataFile();
  if (found) {
    props.setProperty(PROP_FILE_ID, found.getId());
    return logResult("Fichier existant réutilisé : " + found.getId());
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
  return folder.createFile(file.getBlob()).setName(name);
}

function backupNow() {
  var backup = createBackup(getDataFile(), "manuel");
  return logResult("Sauvegarde créée : " + backup.getName() + " (" + backup.getId() + ")");
}

function diagnoseStorage() {
  var result = { configuredId: configuredFileId() || null, candidates: [] };
  var files = DriveApp.getFilesByName(FILE_NAME);
  while (files.hasNext()) {
    var f = files.next();
    var entry = { id: f.getId(), name: f.getName(), updatedAt: f.getLastUpdated().toISOString() };
    try {
      var parsed = ensureShape(JSON.parse(f.getBlob().getDataAsString("UTF-8") || "{}"));
      entry.revision = parsed.revision;
      entry.topics = parsed.topics.length;
      entry.participants = parsed.participants.length;
      var messages = 0;
      parsed.topics.forEach(function (topic) { messages += topic.messages.length; });
      entry.messages = messages;
    } catch (error) { entry.error = String(error); }
    result.candidates.push(entry);
  }
  Logger.log(JSON.stringify(result, null, 2));
  return result;
}

function logResult(message) { Logger.log(message); return message; }

/* =============================================================== API ======= */

function envelope(payload) {
  var out = { ok: true, features: FEATURES.slice(), backendVersion: BACKEND_VERSION };
  Object.keys(payload || {}).forEach(function (key) { out[key] = payload[key]; });
  return out;
}

function authFailure() { return { ok: false, code: "auth", error: "Accès refusé par le serveur." }; }

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
    return createJsonResponse({ ok: false, error: String(error && error.message ? error.message : error) });
  }
}

function applyOne(state, action, now) {
  var actionId = trim(action && action.id);
  if (actionId && state.processedActionIds.indexOf(actionId) >= 0) {
    return { id: actionId, ok: true, duplicate: true };
  }
  var verdict = validateAction(state, action);
  if (!verdict.ok) { return { id: actionId, ok: false, error: verdict.error }; }
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
  if (!isAuthorized(e)) { return createJsonResponse(authFailure()); }
  var lock = LockService.getScriptLock();
  try {
    var body = e && e.postData && e.postData.contents ? e.postData.contents : "";
    var parsed = JSON.parse(body || "null");
    var batched = Array.isArray(parsed);
    var actions = batched ? parsed : [parsed];
    if (!actions.length) { return createJsonResponse({ ok: false, error: "Aucune action reçue." }); }
    if (actions.length > MAX_BATCH) { return createJsonResponse({ ok: false, error: "Lot trop volumineux." }); }

    lock.waitLock(45000);
    var state = readDataFile();
    var results = [];
    var changed = false;
    for (var i = 0; i < actions.length; i++) {
      var before = state.revision;
      var result = applyOne(state, actions[i], new Date().toISOString());
      results.push(result);
      if (state.revision !== before) { changed = true; }
      if (!batched && !result.ok) {
        return createJsonResponse({ ok: false, error: result.error });
      }
    }
    if (changed) { writeDataFile(state); }

    var payload = { revision: state.revision, state: leanState(state) };
    if (batched) { payload.results = results; }
    else if (results[0] && results[0].duplicate) { payload.duplicate = true; }
    return createJsonResponse(envelope(payload));
  } catch (error) {
    return createJsonResponse({ ok: false, error: String(error && error.message ? error.message : "Requête invalide.") });
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
