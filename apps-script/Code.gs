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
var PROP_PWHASH = "TEAMKRYS_PWHASH";
var PW_SALT = "teamkrys-v1"; // sel public (identique côté application)
var MAX_PROCESSED = 500;

// ============================ CODE D'ACCÈS (votre « .env ») =================
// Mettez ici le code que l'équipe devra saisir dans l'application (ex. "votre-code").
// Laissez "" pour un accès libre (sans code).
// Ce fichier vit dans VOTRE projet Apps Script privé. Ne le committez JAMAIS
// avec un code en clair dans un dépôt public.
var ACCESS_CODE = "";
// ===========================================================================

var TOPIC_STATUSES = ["open", "ready", "closed", "archived"];
var PROPOSAL_STATUSES = ["voting", "selected", "debate", "implemented", "rejected"];
var VOTES = ["for", "against", "abstain"];
var REACTIONS = ["👌", "💪", "🤞", "🤏", "👎", "💩"];

/* --------------------------------------------------------- Mot de passe

   Protège l'accès aux données : si un mot de passe est configuré, chaque
   requête doit fournir le bon jeton (auth). Le mot de passe n'est jamais
   stocké en clair : seul son hachage l'est.

   Le plus simple : renseignez la variable ACCESS_CODE tout en haut du fichier.
   Alternative (sans code en clair dans le fichier) : renseignez PASSWORD dans
   setPassword(), exécutez-la une fois, puis remettez PASSWORD à "" (le hachage
   est enregistré dans les propriétés du script). Pour la retirer : clearPassword().
*/

function setPassword() {
  var PASSWORD = ""; // <-- mettez votre code/mot de passe ici, exécutez, puis remettez ""
  if (!PASSWORD) {
    return logResult("Renseignez PASSWORD dans setPassword(), exécutez, puis remettez \"\".");
  }
  var hash = sha256Hex("srv|" + PW_SALT + "|" + PASSWORD);
  PropertiesService.getScriptProperties().setProperty(PROP_PWHASH, hash);
  return logResult("Mot de passe enregistré. Retirez maintenant la valeur de PASSWORD dans le code.");
}

function clearPassword() {
  PropertiesService.getScriptProperties().deleteProperty(PROP_PWHASH);
  return logResult("Mot de passe supprimé : l'accès ne demande plus de code.");
}

// Vérifie le jeton d'authentification s'il y a un code d'accès configuré.
// Priorité au code défini dans ACCESS_CODE ; sinon, hachage via setPassword().
function requireAuth(e) {
  var expected = ACCESS_CODE
    ? sha256Hex("srv|" + PW_SALT + "|" + ACCESS_CODE)
    : PropertiesService.getScriptProperties().getProperty(PROP_PWHASH);
  if (!expected) return { ok: true }; // pas de code : accès libre
  var token = (e && e.parameter && e.parameter.auth) || "";
  if (token && token === expected) return { ok: true };
  return { ok: false, error: "Code d'accès requis ou incorrect.", code: "auth" };
}

// SHA-256 en hexadécimal minuscule (identique à Utils.sha256Hex côté client).
function sha256Hex(str) {
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, str, Utilities.Charset.UTF_8);
  var out = "";
  for (var i = 0; i < bytes.length; i++) {
    var v = bytes[i] < 0 ? bytes[i] + 256 : bytes[i];
    out += ("0" + v.toString(16)).slice(-2);
  }
  return out;
}

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
    var auth = requireAuth(e);
    if (!auth.ok) return createJsonResponse(auth);
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
    var auth = requireAuth(e);
    if (!auth.ok) return createJsonResponse(auth);
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
  for (var i = 0; i < data.topics.length; i++) ensureTopicShape(data.topics[i]);
}

function ensureTopicShape(t) {
  if (!t.messages) t.messages = [];
  if (!t.proposals) t.proposals = [];
  if (!t.conclusions) t.conclusions = [];
  if (!t.conclusionVotes) t.conclusionVotes = {};
  return t;
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
    case "CREATE_MESSAGE": {
      var tcm = findTopic(data, p.topicId);
      if (!tcm) return fail("Sujet introuvable.");
      if (!p.messageId) return fail("Identifiant de message manquant.");
      if (isBlank(p.text)) return fail("Message vide.");
      if (p.quoteId && !findMessage(tcm, p.quoteId)) return fail("Message cité introuvable.");
      break;
    }
    case "SET_MESSAGE_SIGNATURE": {
      var tms = findTopic(data, p.topicId);
      if (!tms) return fail("Sujet introuvable.");
      if (!findMessage(tms, p.messageId)) return fail("Message introuvable.");
      break;
    }
    case "UPDATE_MESSAGE": {
      var tm = findTopic(data, p.topicId);
      if (!tm) return fail("Sujet introuvable.");
      if (!findMessage(tm, p.messageId)) return fail("Message introuvable.");
      if (isBlank(p.text)) return fail("Message vide.");
      break;
    }
    case "SET_REACTION": {
      var tsr = findTopic(data, p.topicId);
      if (!tsr) return fail("Sujet introuvable.");
      if (!findMessage(tsr, p.messageId)) return fail("Message introuvable.");
      if (REACTIONS.indexOf(p.emoji) === -1) return fail("Réaction inconnue.");
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
    case "ADD_CONCLUSION": {
      var tac = findTopic(data, p.topicId);
      if (!tac) return fail("Sujet introuvable.");
      if (!p.conclusionId) return fail("Identifiant de conclusion manquant.");
      if (isBlank(p.text)) return fail("Conclusion vide.");
      break;
    }
    case "UPDATE_CONCLUSION_ITEM": {
      var tuc = findTopic(data, p.topicId);
      if (!tuc) return fail("Sujet introuvable.");
      if (!findConclusion(tuc, p.conclusionId)) return fail("Conclusion introuvable.");
      if (isBlank(p.text)) return fail("Conclusion vide.");
      break;
    }
    case "DELETE_CONCLUSION": {
      var tdc = findTopic(data, p.topicId);
      if (!tdc) return fail("Sujet introuvable.");
      if (!findConclusion(tdc, p.conclusionId)) return fail("Conclusion introuvable.");
      break;
    }
    case "SET_CONCLUSION_VOTE": {
      var tsc = findTopic(data, p.topicId);
      if (!tsc) return fail("Sujet introuvable.");
      if (!findConclusion(tsc, p.conclusionId)) return fail("Conclusion introuvable.");
      break;
    }
    case "REMOVE_CONCLUSION_VOTE": {
      var trc = findTopic(data, p.topicId);
      if (!trc) return fail("Sujet introuvable.");
      break;
    }
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
  var t, m, pr, c;

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
      data.topics.push(ensureTopicShape({
        id: p.topicId, title: p.title, description: p.description || "",
        status: "open",
        createdBy: p.anon ? { id: "", name: "Anonyme" } : { id: author.id, name: p.authorName ? p.authorName : author.name },
        createdAt: at, updatedAt: at,
        messages: [], proposals: [], conclusions: [],
        conclusionVotes: {},
        conclusion: "", conclusionUpdatedAt: null, conclusionUpdatedBy: null
      }));
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
        text: p.text, createdAt: at, updatedAt: null, reactions: {},
        anon: false, quoteId: p.quoteId || null
      });
      t.updatedAt = at;
      break;
    case "UPDATE_MESSAGE":
      t = findTopic(data, p.topicId);
      m = findMessage(t, p.messageId);
      m.text = p.text; m.updatedAt = at; t.updatedAt = at;
      break;
    case "SET_MESSAGE_SIGNATURE":
      t = findTopic(data, p.topicId);
      m = findMessage(t, p.messageId);
      if (p.anon) {
        m.anon = true; m.authorName = "Anonyme"; m.authorId = "";
      } else {
        m.anon = false; m.authorName = author.name; m.authorId = author.id;
      }
      t.updatedAt = at;
      break;
    case "SET_REACTION":
      t = findTopic(data, p.topicId);
      m = findMessage(t, p.messageId);
      if (!m.reactions) m.reactions = {};
      if (m.reactions[author.id] === p.emoji) delete m.reactions[author.id];
      else m.reactions[author.id] = p.emoji;
      t.updatedAt = at;
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
    case "ADD_CONCLUSION":
      t = ensureTopicShape(findTopic(data, p.topicId));
      t.conclusions.push({
        id: p.conclusionId, text: p.text, source: "manual",
        authorId: author.id, authorName: author.name, createdAt: at, updatedAt: null
      });
      t.updatedAt = at;
      break;
    case "UPDATE_CONCLUSION_ITEM":
      t = ensureTopicShape(findTopic(data, p.topicId));
      c = findConclusion(t, p.conclusionId);
      c.text = p.text; c.updatedAt = at; t.updatedAt = at;
      break;
    case "DELETE_CONCLUSION":
      t = ensureTopicShape(findTopic(data, p.topicId));
      t.conclusions = t.conclusions.filter(function (x) { return x.id !== p.conclusionId; });
      Object.keys(t.conclusionVotes).forEach(function (pid) {
        if (t.conclusionVotes[pid] === p.conclusionId) delete t.conclusionVotes[pid];
      });
      t.updatedAt = at;
      break;
    case "SET_CONCLUSION_VOTE":
      t = ensureTopicShape(findTopic(data, p.topicId));
      t.conclusionVotes[author.id] = p.conclusionId; t.updatedAt = at;
      break;
    case "REMOVE_CONCLUSION_VOTE":
      t = ensureTopicShape(findTopic(data, p.topicId));
      delete t.conclusionVotes[author.id]; t.updatedAt = at;
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
function findConclusion(topic, id) {
  var list = topic.conclusions || [];
  for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
  return null;
}
function isBlank(v) { return v === undefined || v === null || String(v).trim().length === 0; }

function createJsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
