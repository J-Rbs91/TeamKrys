/**
 * TeamKrys — backend Google Apps Script.
 *
 * Rôle : lire et écrire le fichier "teamkrys-data.json" stocké dans Google
 * Drive, en appliquant des actions précises (jamais un remplacement complet).
 *
 * Nouveauté « IA / Gemini dans Google Sheets » :
 *  - Un classeur Google Sheets ("TeamKrys — IA") sert d'atelier à Gemini.
 *  - Quand un utilisateur demande un résumé ou une conclusion pour un sujet,
 *    le backend recopie les données du sujet (messages, propositions) dans un
 *    onglet dédié du classeur et y insère des formules « =AI(...) » (la
 *    fonction Gemini de Google Sheets).
 *  - Google Sheets calcule les réponses de Gemini de son côté (ce n'est pas
 *    instantané).
 *  - Un bouton « Rafraîchir » relit les cellules calculées et réinjecte les
 *    résultats dans le JSON (résumés par collaborateur, conclusions votables).
 *
 * Points clés :
 *  - LockService évite les écritures simultanées concurrentes.
 *  - processedActionIds évite d'appliquer deux fois la même action.
 *  - revision augmente à chaque modification.
 *
 * Déploiement : voir docs/INSTALLATION.md. Exécutez setupProject() une fois,
 * puis déployez en tant qu'application Web (accès : « Tout le monde »).
 */

var FILE_NAME = "teamkrys-data.json";
var FOLDER_NAME = "TeamKrys";
var PROP_FILE_ID = "TEAMKRYS_FILE_ID";
var PROP_SHEET_ID = "TEAMKRYS_SHEET_ID";
var SHEET_TITLE = "TeamKrys — IA (Gemini)";
var MAX_PROCESSED = 500;
var MAX_TOPIC_TABS = 40; // au-delà, on recycle les onglets les plus anciens

var TOPIC_STATUSES = ["open", "ready", "closed", "archived"];
var PROPOSAL_STATUSES = ["voting", "selected", "debate", "implemented", "rejected"];
var VOTES = ["for", "against", "abstain"];

/* ------------------------------------------------------------------ Setup */

/**
 * Crée le dossier, le fichier de données et le classeur IA s'ils n'existent
 * pas. N'écrase JAMAIS un fichier existant. À exécuter une seule fois.
 */
function setupProject() {
  var props = PropertiesService.getScriptProperties();
  var messages = [];

  // 1) Fichier JSON de données.
  var existingId = props.getProperty(PROP_FILE_ID);
  var fileOk = false;
  if (existingId) {
    try {
      var f = DriveApp.getFileById(existingId);
      messages.push("Fichier déjà configuré : " + f.getName() + " (" + existingId + ")");
      fileOk = true;
    } catch (e) {
      // identifiant enregistré invalide : on recrée plus bas.
    }
  }
  if (!fileOk) {
    var found = DriveApp.getFilesByName(FILE_NAME);
    if (found.hasNext()) {
      var file = found.next();
      props.setProperty(PROP_FILE_ID, file.getId());
      messages.push("Fichier existant réutilisé : " + file.getId());
    } else {
      var folder = getOrCreateFolder();
      var created = folder.createFile(FILE_NAME, JSON.stringify(emptyData(), null, 2), "application/json");
      props.setProperty(PROP_FILE_ID, created.getId());
      messages.push("Fichier créé : " + created.getId());
    }
  }

  // 2) Classeur Google Sheets pour Gemini.
  var ss = getOrCreateSpreadsheet();
  messages.push("Classeur IA : " + ss.getUrl());

  return logResult(messages.join("\n"));
}

function getOrCreateFolder() {
  var it = DriveApp.getFoldersByName(FOLDER_NAME);
  if (it.hasNext()) return it.next();
  return DriveApp.createFolder(FOLDER_NAME);
}

/** Renvoie le classeur Google Sheets de l'atelier IA (le crée si besoin). */
function getOrCreateSpreadsheet() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty(PROP_SHEET_ID);
  if (id) {
    try {
      return SpreadsheetApp.openById(id);
    } catch (e) {
      // identifiant invalide : recréation ci-dessous.
    }
  }
  var ss = SpreadsheetApp.create(SHEET_TITLE);
  props.setProperty(PROP_SHEET_ID, ss.getId());
  // Range le classeur dans le dossier TeamKrys pour le retrouver facilement.
  try {
    var folder = getOrCreateFolder();
    var file = DriveApp.getFileById(ss.getId());
    folder.addFile(file);
  } catch (e) { /* déplacement non bloquant */ }
  return ss;
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
    var mode = e && e.parameter && e.parameter.mode;
    var body = e && e.postData && e.postData.contents ? e.postData.contents : "{}";
    var payload = JSON.parse(body);
    if (mode === "ai") {
      return createJsonResponse(handleAi(payload));
    }
    return createJsonResponse(applyAction(payload));
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
  if (!t.summaries) t.summaries = [];
  if (!t.conclusions) t.conclusions = [];
  if (!t.conclusionVotes) t.conclusionVotes = {};
  if (!t.ai) t.ai = { summary: emptyAiState(), conclusion: emptyAiState() };
  if (!t.ai.summary) t.ai.summary = emptyAiState();
  if (!t.ai.conclusion) t.ai.conclusion = emptyAiState();
  return t;
}

function emptyAiState() {
  return { status: "idle", updatedAt: null, message: "" };
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

/* ================================================================ IA / Gemini

   handleAi({ op, kind, topicId })
     op   : "generate" (écrit les formules =AI) ou "refresh" (relit les résultats)
     kind : "summary" (résumé par collaborateur) ou "conclusion" (regroupement)
==============================================================================*/

function handleAi(payload) {
  var op = payload && payload.op;
  var kind = payload && payload.kind;
  var topicId = payload && payload.topicId;

  if (["summary", "conclusion"].indexOf(kind) === -1) {
    return { ok: false, error: "Type de génération inconnu." };
  }
  if (["generate", "refresh"].indexOf(op) === -1) {
    return { ok: false, error: "Opération IA inconnue." };
  }

  var lock = LockService.getScriptLock();
  lock.waitLock(45000);
  try {
    var data = readDataFile();
    ensureShape(data);
    var topic = findTopic(data, topicId);
    if (!topic) return { ok: false, error: "Sujet introuvable." };

    var ss = getOrCreateSpreadsheet();
    var sheet = getOrCreateTopicSheet(ss, topic);

    var result;
    if (op === "generate") {
      result = aiGenerate(sheet, topic, kind);
    } else {
      result = aiRefresh(sheet, topic, kind);
    }

    data.revision = (data.revision || 0) + 1;
    data.updatedAt = new Date().toISOString();
    writeDataFile(data);

    return {
      ok: true,
      revision: data.revision,
      ai: result,
      state: publicState(data)
    };
  } catch (err) {
    return { ok: false, error: "IA : " + String(err) };
  } finally {
    lock.releaseLock();
  }
}

/** Écrit les données du sujet + les formules =AI() et marque le statut « pending ». */
function aiGenerate(sheet, topic, kind) {
  if (kind === "summary") {
    writeSummaryArea(sheet, topic);
    topic.ai.summary = { status: "pending", updatedAt: new Date().toISOString(), message: "" };
    return { kind: kind, status: "pending" };
  }
  writeConclusionArea(sheet, topic);
  topic.ai.conclusion = { status: "pending", updatedAt: new Date().toISOString(), message: "" };
  return { kind: kind, status: "pending" };
}

/** Relit les cellules Gemini et réinjecte les résultats dans le sujet. */
function aiRefresh(sheet, topic, kind) {
  SpreadsheetApp.flush();
  if (kind === "summary") {
    return readSummaryArea(sheet, topic);
  }
  return readConclusionArea(sheet, topic);
}

/* ------------------------------------------------------- Onglet par sujet */

function topicSheetName(topic) {
  var base = "TK " + String(topic.id);
  return base.length > 95 ? base.substring(0, 95) : base;
}

function getOrCreateTopicSheet(ss, topic) {
  var name = topicSheetName(topic);
  var sheet = ss.getSheetByName(name);
  if (sheet) return sheet;

  // Recyclage : si trop d'onglets « TK », on supprime les plus anciens.
  var all = ss.getSheets();
  var tkTabs = all.filter(function (s) { return s.getName().indexOf("TK ") === 0; });
  while (tkTabs.length >= MAX_TOPIC_TABS) {
    var victim = tkTabs.shift();
    if (ss.getSheets().length > 1) ss.deleteSheet(victim);
    else break;
  }
  return ss.insertSheet(name);
}

/* ------------------------------------------------------- Résumés (colonne A-C) */

function writeSummaryArea(sheet, topic) {
  // Nettoie uniquement la zone des résumés (colonnes A à C).
  sheet.getRange(1, 1, Math.max(sheet.getMaxRows(), 4), 3).clearContent();

  sheet.getRange(1, 1).setValue("TeamKrys — sujet");
  sheet.getRange(1, 2).setValue(topic.title || "");
  sheet.getRange(2, 1).setValue("Description");
  sheet.getRange(2, 2).setValue(topic.description || "");
  sheet.getRange(4, 1).setValue("Collaborateur");
  sheet.getRange(4, 2).setValue("Messages (source)");
  sheet.getRange(4, 3).setValue("Résumé Gemini (=AI)");

  var byAuthor = groupMessagesByAuthor(topic);
  var names = Object.keys(byAuthor);
  var startRow = 5;

  for (var i = 0; i < names.length; i++) {
    var row = startRow + i;
    var name = names[i];
    sheet.getRange(row, 1).setValue(name);
    sheet.getRange(row, 2).setValue(byAuthor[name]);
    var prompt =
      '"Tu es un assistant qui synthétise un débat d\'équipe. Résume en 2 ou 3 phrases, ' +
      'en français, de façon neutre et fidèle, le point de vue du collaborateur ' +
      'nommé " & A' + row + ' & " sur le sujet suivant : ' + sheetSafe(topic.title) +
      '. Appuie-toi uniquement sur ses messages ci-dessous. Messages : " & B' + row;
    sheet.getRange(row, 3).setFormula("=AI(" + prompt + ")");
  }

  // Repère le nombre de lignes de résumé pour la relecture.
  sheet.getRange(3, 1).setValue("__SUMMARY_ROWS__");
  sheet.getRange(3, 2).setValue(names.length);
  SpreadsheetApp.flush();
}

function readSummaryArea(sheet, topic) {
  var countCell = sheet.getRange(3, 2).getValue();
  var count = Number(countCell) || 0;
  if (count <= 0) {
    topic.summaries = [];
    topic.ai.summary = { status: "ready", updatedAt: new Date().toISOString(), message: "Aucun message à résumer." };
    return { kind: "summary", status: "ready", ready: 0, pending: 0 };
  }

  var values = sheet.getRange(5, 1, count, 3).getValues();
  var summaries = [];
  var ready = 0;
  var pending = 0;
  for (var i = 0; i < values.length; i++) {
    var name = String(values[i][0] || "").trim();
    if (!name) continue;
    var out = values[i][2];
    if (aiCellReady(out)) {
      summaries.push({ name: name, text: String(out).trim(), updatedAt: new Date().toISOString() });
      ready++;
    } else {
      pending++;
    }
  }

  topic.summaries = summaries;
  var status = pending === 0 ? "ready" : (ready > 0 ? "partial" : "pending");
  topic.ai.summary = {
    status: status,
    updatedAt: new Date().toISOString(),
    message: pending > 0 ? (pending + " résumé(s) encore en cours de génération.") : ""
  };
  return { kind: "summary", status: status, ready: ready, pending: pending };
}

/* --------------------------------------------------- Conclusions (colonnes E-F) */

function writeConclusionArea(sheet, topic) {
  sheet.getRange(1, 5, Math.max(sheet.getMaxRows(), 6), 2).clearContent();

  sheet.getRange(1, 5).setValue("Propositions & échanges (source)");
  sheet.getRange(2, 5).setValue(buildConclusionSource(topic));
  sheet.getRange(4, 5).setValue("Conclusions Gemini (=AI)");

  var prompt =
    '"Voici des propositions et des échanges issus d\'un débat d\'équipe sur le sujet : ' +
    sheetSafe(topic.title) +
    '. Regroupe les idées proches et reformule-les en 2 à 4 conclusions distinctes, ' +
    'claires, concrètes et synthétiques, en français. Réponds UNIQUEMENT par la liste ' +
    'des conclusions, une conclusion par ligne, sans numéro, sans puce et sans titre. ' +
    'Contenu : " & E2';
  sheet.getRange(5, 5).setFormula("=AI(" + prompt + ")");
  SpreadsheetApp.flush();
}

function readConclusionArea(sheet, topic) {
  var out = sheet.getRange(5, 5).getValue();
  var source = String(sheet.getRange(2, 5).getValue() || "").trim();

  if (!source) {
    topic.ai.conclusion = { status: "ready", updatedAt: new Date().toISOString(), message: "Aucune proposition à regrouper." };
    return { kind: "conclusion", status: "ready", added: 0 };
  }
  if (!aiCellReady(out)) {
    topic.ai.conclusion = { status: "pending", updatedAt: new Date().toISOString(), message: "Gemini calcule encore les conclusions." };
    return { kind: "conclusion", status: "pending", added: 0 };
  }

  var lines = String(out).split(/\r?\n/).map(cleanConclusionLine).filter(function (s) { return s.length > 0; });

  // Conserve les conclusions manuelles ; remplace les conclusions IA en
  // réutilisant les identifiants existants (texte identique) pour ne pas
  // perdre les votes déjà exprimés.
  var manual = topic.conclusions.filter(function (c) { return c.source !== "ai"; });
  var oldAi = topic.conclusions.filter(function (c) { return c.source === "ai"; });
  var now = new Date().toISOString();

  var newAi = lines.map(function (text) {
    var match = oldAi.find(function (c) { return normalize(c.text) === normalize(text); });
    return {
      id: match ? match.id : Utilities.getUuid(),
      text: text,
      source: "ai",
      authorName: "Gemini",
      createdAt: match ? match.createdAt : now,
      updatedAt: now
    };
  });

  var keptIds = {};
  newAi.concat(manual).forEach(function (c) { keptIds[c.id] = true; });
  // Nettoie les votes pointant vers des conclusions IA disparues.
  Object.keys(topic.conclusionVotes).forEach(function (pid) {
    if (!keptIds[topic.conclusionVotes[pid]]) delete topic.conclusionVotes[pid];
  });

  topic.conclusions = newAi.concat(manual);
  topic.ai.conclusion = { status: "ready", updatedAt: now, message: "" };
  return { kind: "conclusion", status: "ready", added: newAi.length };
}

/* ---------------------------------------------------------- Helpers IA */

function groupMessagesByAuthor(topic) {
  var map = {};
  (topic.messages || []).forEach(function (m) {
    var name = m.authorName || "Anonyme";
    if (!map[name]) map[name] = [];
    map[name].push(m.text);
  });
  var out = {};
  Object.keys(map).forEach(function (name) {
    out[name] = map[name].join("\n---\n");
  });
  return out;
}

function buildConclusionSource(topic) {
  var parts = [];
  (topic.proposals || []).forEach(function (p) {
    var line = "PROPOSITION : " + (p.title || "");
    if (p.description) line += " — " + p.description;
    parts.push(line);
  });
  (topic.messages || []).forEach(function (m) {
    parts.push("MESSAGE (" + (m.authorName || "?") + ") : " + (m.text || ""));
  });
  return parts.join("\n");
}

/** Échappe une chaîne pour l'insérer littéralement dans une formule Sheets. */
function sheetSafe(s) {
  return '""' + String(s || "").replace(/"/g, "'") + '""';
}

function cleanConclusionLine(s) {
  return String(s || "")
    .replace(/^\s*[-*•\d.)]+\s*/, "") // retire puces / numéros éventuels
    .trim();
}

function normalize(s) {
  return String(s || "").toLowerCase().replace(/\s+/g, " ").trim();
}

/** Une cellule =AI est-elle réellement calculée (pas vide, pas en erreur) ? */
function aiCellReady(v) {
  if (v === null || v === undefined) return false;
  var s = String(v).trim();
  if (s === "") return false;
  if (s.charAt(0) === "#") return false; // #ERROR!, #N/A, #NAME?
  if (s.length < 40 && /loading|calcul|generating|génération|patient/i.test(s)) return false;
  return true;
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
        status: "open", createdBy: { id: author.id, name: p.authorName ? p.authorName : author.name },
        createdAt: at, updatedAt: at,
        messages: [], proposals: [], summaries: [], conclusions: [],
        conclusionVotes: {}, ai: { summary: emptyAiState(), conclusion: emptyAiState() },
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
