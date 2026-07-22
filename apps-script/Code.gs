/**
 * TeamKrys — backend Google Apps Script.
 *
 * Rôle : lire et écrire le fichier "teamkrys-data.json" stocké dans Google
 * Drive, en appliquant des actions précises (jamais un remplacement complet).
 *
 * Points clés :
 *  - LockService évite les écritures simultanées concurrentes.
 *  - processedActionIds évite d'appliquer deux fois la même action (doublon
 *    après une coupure réseau).
 *  - revision augmente à chaque modification.
 *
 * Déploiement : voir docs/INSTALLATION.md. Exécutez setupProject() une fois,
 * puis déployez en tant qu'application Web (accès : « Tout le monde »).
 */

var FILE_NAME = "teamkrys-data.json";
var FOLDER_NAME = "TeamKrys";
var PROP_FILE_ID = "TEAMKRYS_FILE_ID";
var MAX_PROCESSED = 500;

var TOPIC_STATUSES = ["open", "ready", "closed", "archived"];
var PROPOSAL_STATUSES = ["voting", "selected", "debate", "implemented", "rejected"];
var VOTES = ["for", "against", "abstain"];

/* ------------------------------------------------------------------ Setup */

/**
 * Crée le dossier et le fichier de données s'ils n'existent pas.
 * N'écrase JAMAIS un fichier existant. À exécuter une seule fois.
 */
function setupProject() {
  var props = PropertiesService.getScriptProperties();
  var existingId = props.getProperty(PROP_FILE_ID);
  if (existingId) {
    try {
      var f = DriveApp.getFileById(existingId);
      return logResult("Fichier déjà configuré : " + f.getName() + " (" + existingId + ")");
    } catch (e) {
      // L'identifiant enregistré n'est plus valide : on le recrée.
    }
  }

  // Cherche un fichier existant portant ce nom (évite les doublons).
  var found = DriveApp.getFilesByName(FILE_NAME);
  if (found.hasNext()) {
    var file = found.next();
    props.setProperty(PROP_FILE_ID, file.getId());
    return logResult("Fichier existant réutilisé : " + file.getId());
  }

  var folder = getOrCreateFolder();
  var initial = emptyData();
  var created = folder.createFile(FILE_NAME, JSON.stringify(initial, null, 2), "application/json");
  props.setProperty(PROP_FILE_ID, created.getId());
  return logResult("Fichier créé : " + created.getId());
}

function getOrCreateFolder() {
  var it = DriveApp.getFoldersByName(FOLDER_NAME);
  if (it.hasNext()) return it.next();
  return DriveApp.createFolder(FOLDER_NAME);
}

function logResult(message) {
  Logger.log(message);
  return message;
}

function emptyData() {
  return {
    revision: 0,
    updatedAt: new Date().toISOString(),
    participants: [],
    topics: [],
    processedActionIds: []
  };
}

/* --------------------------------------------------------------- Endpoints */

function doGet(e) {
  try {
    var mode = (e && e.parameter && e.parameter.mode) || "state";
    if (mode === "revision") {
      return createJsonResponse(getRevision());
    }
    return createJsonResponse(getState());
  } catch (err) {
    return createJsonResponse({ ok: false, error: String(err) });
  }
}

function doPost(e) {
  try {
    var body = e && e.postData && e.postData.contents ? e.postData.contents : "{}";
    var action = JSON.parse(body);
    return createJsonResponse(applyAction(action));
  } catch (err) {
    return createJsonResponse({ ok: false, error: "Requête invalide." });
  }
}

/* -------------------------------------------------------------- Lecture */

function getRevision() {
  var data = readDataFile();
  return { revision: data.revision || 0, updatedAt: data.updatedAt || null };
}

function getState() {
  return publicState(readDataFile());
}

/** Retire les champs internes avant envoi au client. */
function publicState(data) {
  return {
    revision: data.revision || 0,
    updatedAt: data.updatedAt || null,
    participants: data.participants || [],
    topics: data.topics || []
  };
}

/* --------------------------------------------------------------- Écriture */

function applyAction(action) {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var data = readDataFile();
    ensureShape(data);

    // Doublon : action déjà appliquée (renvoi de l'état courant, sans erreur).
    if (action && action.actionId && data.processedActionIds.indexOf(action.actionId) !== -1) {
      return { ok: true, duplicate: true, revision: data.revision, state: publicState(data) };
    }

    var check = validateAction(action, data);
    if (!check.ok) {
      return { ok: false, error: check.error };
    }

    reduce(data, action);

    data.revision = (data.revision || 0) + 1;
    data.updatedAt = new Date().toISOString();
    data.processedActionIds.push(action.actionId);
    if (data.processedActionIds.length > MAX_PROCESSED) {
      data.processedActionIds = data.processedActionIds.slice(-MAX_PROCESSED);
    }

    writeDataFile(data);
    return { ok: true, revision: data.revision, state: publicState(data) };
  } finally {
    lock.releaseLock();
  }
}

function ensureShape(data) {
  if (!data.participants) data.participants = [];
  if (!data.topics) data.topics = [];
  if (!data.processedActionIds) data.processedActionIds = [];
  if (typeof data.revision !== "number") data.revision = 0;
}

function readDataFile() {
  var file = getDataFile();
  var content = file.getBlob().getDataAsString("UTF-8");
  var data = content ? JSON.parse(content) : emptyData();
  ensureShape(data);
  return data;
}

function writeDataFile(data) {
  var file = getDataFile();
  file.setContent(JSON.stringify(data, null, 2));
}

function getDataFile() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty(PROP_FILE_ID);
  if (!id) throw new Error("Projet non initialisé : exécutez setupProject().");
  return DriveApp.getFileById(id);
}

/* ------------------------------------------------------------ Validation */

function validateAction(action, data) {
  if (!action || !action.actionId) return fail("Action sans identifiant.");
  if (!action.type) return fail("Action sans type.");
  if (!action.participant || !action.participant.id) return fail("Action sans auteur.");
  var p = action.payload || {};

  switch (action.type) {
    case "REGISTER_PARTICIPANT":
    case "UPDATE_PARTICIPANT":
      if (isBlank(action.participant.name)) return fail("Prénom vide.");
      break;
    case "CREATE_TOPIC":
      if (!p.topicId) return fail("Identifiant de sujet manquant.");
      if (isBlank(p.title)) return fail("Titre de sujet obligatoire.");
      break;
    case "UPDATE_TOPIC":
      if (!findTopic(data, p.topicId)) return fail("Sujet introuvable.");
      if (isBlank(p.title)) return fail("Titre de sujet obligatoire.");
      break;
    case "CHANGE_TOPIC_STATUS":
      if (!findTopic(data, p.topicId)) return fail("Sujet introuvable.");
      if (TOPIC_STATUSES.indexOf(p.status) === -1) return fail("Statut de sujet inconnu.");
      break;
    case "CREATE_MESSAGE":
      if (!findTopic(data, p.topicId)) return fail("Sujet introuvable.");
      if (!p.messageId) return fail("Identifiant de message manquant.");
      if (isBlank(p.text)) return fail("Message vide.");
      break;
    case "UPDATE_MESSAGE": {
      var tm = findTopic(data, p.topicId);
      if (!tm) return fail("Sujet introuvable.");
      if (!findMessage(tm, p.messageId)) return fail("Message introuvable.");
      if (isBlank(p.text)) return fail("Message vide.");
      break;
    }
    case "CREATE_PROPOSAL":
      if (!findTopic(data, p.topicId)) return fail("Sujet introuvable.");
      if (!p.proposalId) return fail("Identifiant de proposition manquant.");
      if (isBlank(p.title)) return fail("Titre de proposition obligatoire.");
      break;
    case "UPDATE_PROPOSAL": {
      var tp = findTopic(data, p.topicId);
      if (!tp) return fail("Sujet introuvable.");
      if (!findProposal(tp, p.proposalId)) return fail("Proposition introuvable.");
      if (isBlank(p.title)) return fail("Titre de proposition obligatoire.");
      break;
    }
    case "CHANGE_PROPOSAL_STATUS": {
      var ts = findTopic(data, p.topicId);
      if (!ts) return fail("Sujet introuvable.");
      if (!findProposal(ts, p.proposalId)) return fail("Proposition introuvable.");
      if (PROPOSAL_STATUSES.indexOf(p.status) === -1) return fail("Statut de proposition inconnu.");
      break;
    }
    case "SET_VOTE": {
      var tv = findTopic(data, p.topicId);
      if (!tv) return fail("Sujet introuvable.");
      if (!findProposal(tv, p.proposalId)) return fail("Proposition introuvable.");
      if (VOTES.indexOf(p.vote) === -1) return fail("Vote inconnu.");
      break;
    }
    case "REMOVE_VOTE": {
      var tr = findTopic(data, p.topicId);
      if (!tr) return fail("Sujet introuvable.");
      if (!findProposal(tr, p.proposalId)) return fail("Proposition introuvable.");
      break;
    }
    case "UPDATE_CONCLUSION":
      if (!findTopic(data, p.topicId)) return fail("Sujet introuvable.");
      break;
    default:
      return fail("Type d'action inconnu : " + action.type);
  }
  return { ok: true };
}

function fail(message) { return { ok: false, error: message }; }

/* -------------------------------------------------------------- Réducteur */

function reduce(data, action) {
  var p = action.payload || {};
  var author = { id: action.participant.id, name: action.participant.name };
  var at = action.createdAt || new Date().toISOString();
  var t, m, pr;

  switch (action.type) {
    case "REGISTER_PARTICIPANT":
    case "UPDATE_PARTICIPANT":
      var ex = null;
      for (var i = 0; i < data.participants.length; i++) {
        if (data.participants[i].id === author.id) { ex = data.participants[i]; break; }
      }
      if (ex) ex.name = author.name;
      else data.participants.push({ id: author.id, name: author.name });
      break;
    case "CREATE_TOPIC":
      data.topics.push({
        id: p.topicId, title: p.title, description: p.description || "",
        status: "open", createdBy: author, createdAt: at, updatedAt: at,
        messages: [], proposals: [], conclusion: "",
        conclusionUpdatedAt: null, conclusionUpdatedBy: null
      });
      break;
    case "UPDATE_TOPIC":
      t = findTopic(data, p.topicId);
      t.title = p.title; t.description = p.description || ""; t.updatedAt = at;
      break;
    case "CHANGE_TOPIC_STATUS":
      t = findTopic(data, p.topicId);
      t.status = p.status; t.updatedAt = at;
      break;
    case "CREATE_MESSAGE":
      t = findTopic(data, p.topicId);
      t.messages.push({
        id: p.messageId, authorId: author.id, authorName: author.name,
        text: p.text, createdAt: at, updatedAt: null
      });
      t.updatedAt = at;
      break;
    case "UPDATE_MESSAGE":
      t = findTopic(data, p.topicId);
      m = findMessage(t, p.messageId);
      m.text = p.text; m.updatedAt = at; t.updatedAt = at;
      break;
    case "CREATE_PROPOSAL":
      t = findTopic(data, p.topicId);
      t.proposals.push({
        id: p.proposalId, title: p.title, description: p.description || "",
        authorId: author.id, authorName: author.name, createdAt: at,
        status: "voting", votes: {}
      });
      t.updatedAt = at;
      break;
    case "UPDATE_PROPOSAL":
      t = findTopic(data, p.topicId);
      pr = findProposal(t, p.proposalId);
      pr.title = p.title; pr.description = p.description || ""; t.updatedAt = at;
      break;
    case "CHANGE_PROPOSAL_STATUS":
      t = findTopic(data, p.topicId);
      pr = findProposal(t, p.proposalId);
      pr.status = p.status; t.updatedAt = at;
      break;
    case "SET_VOTE":
      t = findTopic(data, p.topicId);
      pr = findProposal(t, p.proposalId);
      pr.votes[author.id] = p.vote; t.updatedAt = at;
      break;
    case "REMOVE_VOTE":
      t = findTopic(data, p.topicId);
      pr = findProposal(t, p.proposalId);
      delete pr.votes[author.id]; t.updatedAt = at;
      break;
    case "UPDATE_CONCLUSION":
      t = findTopic(data, p.topicId);
      t.conclusion = p.conclusion || "";
      t.conclusionUpdatedAt = at; t.conclusionUpdatedBy = author; t.updatedAt = at;
      break;
  }
  return data;
}

/* --------------------------------------------------------------- Helpers */

function findTopic(data, id) {
  for (var i = 0; i < data.topics.length; i++) if (data.topics[i].id === id) return data.topics[i];
  return null;
}
function findProposal(topic, id) {
  for (var i = 0; i < topic.proposals.length; i++) if (topic.proposals[i].id === id) return topic.proposals[i];
  return null;
}
function findMessage(topic, id) {
  for (var i = 0; i < topic.messages.length; i++) if (topic.messages[i].id === id) return topic.messages[i];
  return null;
}
function isBlank(v) { return v === undefined || v === null || String(v).trim().length === 0; }

function createJsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
