/**
 * TeamKrys — Backend Google Apps Script
 * =====================================
 * Rôle : servir l'application web et gérer un fichier chiffré privé sur Google
 * Drive. Le chiffrement/déchiffrement se fait CÔTÉ NAVIGATEUR (Web Crypto) ;
 * le serveur ne manipule que des enveloppes chiffrées et des métadonnées.
 *
 * Toutes les fonctions exposées renvoient un objet structuré :
 *   succès : { ok: true,  data: {...} }
 *   erreur : { ok: false, code: "ERROR_CODE", message: "Message utilisateur" }
 *
 * Contrôle d'accès : voir docs/deployment.md (choix du déploiement Web App).
 * La clé AES est publique (docs/security-limits.md) ; ce fichier ne contient
 * PAS le véritable identifiant du fichier Drive (stocké dans PropertiesService).
 */

// ---------------------------------------------------------------------------
// Constantes
// ---------------------------------------------------------------------------

var TK_FILE_NAME = 'teamkrys-data.enc.json';
var TK_FOLDER_NAME = 'TeamKrys';
var TK_BACKUP_FOLDER_NAME = 'TeamKrys-backups';
var TK_SCHEMA_VERSION = 1;
var TK_ENVELOPE_VERSION = 1;

// Clés PropertiesService.
var PROP_FOLDER_ID = 'TEAMKRYS_FOLDER_ID';
var PROP_BACKUP_FOLDER_ID = 'TEAMKRYS_BACKUP_FOLDER_ID';
var PROP_FILE_ID = 'TEAMKRYS_FILE_ID';
var PROP_SCHEMA_VERSION = 'TEAMKRYS_SCHEMA_VERSION';

var TK_MAX_BACKUPS = 30;
var TK_LOCK_TIMEOUT_MS = 20000;

/**
 * Enveloppe initiale : état vide déjà chiffré avec la clé commune.
 * Précalculée hors ligne (le runtime Apps Script V8 n'a pas Web Crypto/AES-GCM).
 * Le contenu est régénérable via scripts/gen-initial-envelope.js.
 */
var TK_INITIAL_ENVELOPE = {
  format: 'teamkrys-encrypted-state',
  envelopeVersion: 1,
  schemaVersion: 1,
  revision: 0,
  updatedAt: '2026-01-01T00:00:00.000Z',
  encryption: {
    algorithm: 'AES-GCM',
    iv: 'oemwpM7iExFLvd74',
    ciphertext: 'cZre2svGtFcUHo1gqWzGp8UIivRqSUewkzxCWDXcH35QLtlTkFVj628rKZTU9m19EDFJapuDkYiUFxC+0c5oIA7LhHDQUHbBo+ViUnePIENU6eBDVGsowhdd7gGVyggFZWuaSvFwG7Ra38CNAb3vXTLtHTOY'
  }
};

// ---------------------------------------------------------------------------
// Helpers de réponse
// ---------------------------------------------------------------------------

function tkOk(data) {
  return { ok: true, data: data || {} };
}

function tkErr(code, message) {
  return { ok: false, code: code, message: message };
}

function tkProps() {
  return PropertiesService.getScriptProperties();
}

// ---------------------------------------------------------------------------
// doGet / include
// ---------------------------------------------------------------------------

function doGet() {
  var template = HtmlService.createTemplateFromFile('index');
  return template.evaluate()
    .setTitle('TeamKrys')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.DEFAULT);
}

/** Inline un fichier HTML (utilisé par les templates <?!= include('x') ?>). */
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

// ---------------------------------------------------------------------------
// Initialisation
// ---------------------------------------------------------------------------

function tkGetFolderById(id) {
  try { return DriveApp.getFolderById(id); } catch (e) { return null; }
}
function tkGetFileById(id) {
  try { return DriveApp.getFileById(id); } catch (e) { return null; }
}

/**
 * Initialise le projet. Idempotente : ne recrée pas ni n'écrase ce qui existe.
 *
 * 1. vérifie si déjà initialisé ;
 * 2. crée un dossier Drive privé ;
 * 3. crée le fichier teamkrys-data.enc.json ;
 * 4. y écrit un état initial vide déjà chiffré ;
 * 5. enregistre l'id du dossier dans PropertiesService ;
 * 6. enregistre l'id du fichier dans PropertiesService ;
 * 7. enregistre la version du schéma ;
 * 8. n'écrase jamais un fichier existant sans confirmation explicite.
 *
 * @param {{force?: boolean}=} options force=true ré-écrit l'enveloppe initiale
 *   (confirmation explicite requise ; à n'utiliser que sur un projet vierge).
 */
function setupProject(options) {
  options = options || {};
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(TK_LOCK_TIMEOUT_MS);
  } catch (e) {
    return tkErr('LOCK_TIMEOUT', 'Le projet est occupé, réessayez.');
  }
  try {
    var props = tkProps();
    var existingFileId = props.getProperty(PROP_FILE_ID);
    var existingFile = existingFileId ? tkGetFileById(existingFileId) : null;

    if (existingFile && !options.force) {
      // Déjà initialisé : idempotent, on ne touche à rien.
      return tkOk({
        initialized: true,
        alreadyExisted: true,
        fileId: existingFileId,
        folderId: props.getProperty(PROP_FOLDER_ID),
        schemaVersion: Number(props.getProperty(PROP_SCHEMA_VERSION)) || TK_SCHEMA_VERSION
      });
    }

    // Dossier principal.
    var folderId = props.getProperty(PROP_FOLDER_ID);
    var folder = folderId ? tkGetFolderById(folderId) : null;
    if (!folder) {
      folder = DriveApp.createFolder(TK_FOLDER_NAME);
      folderId = folder.getId();
      props.setProperty(PROP_FOLDER_ID, folderId);
    }

    // Dossier de sauvegardes.
    var backupFolderId = props.getProperty(PROP_BACKUP_FOLDER_ID);
    var backupFolder = backupFolderId ? tkGetFolderById(backupFolderId) : null;
    if (!backupFolder) {
      backupFolder = folder.createFolder(TK_BACKUP_FOLDER_NAME);
      props.setProperty(PROP_BACKUP_FOLDER_ID, backupFolder.getId());
    }

    // Fichier chiffré.
    var content = JSON.stringify(TK_INITIAL_ENVELOPE);
    var file;
    if (existingFile && options.force) {
      existingFile.setContent(content);
      file = existingFile;
    } else {
      file = folder.createFile(TK_FILE_NAME, content, 'application/json');
      props.setProperty(PROP_FILE_ID, file.getId());
    }

    props.setProperty(PROP_SCHEMA_VERSION, String(TK_SCHEMA_VERSION));

    return tkOk({
      initialized: true,
      alreadyExisted: false,
      forced: !!(existingFile && options.force),
      fileId: file.getId(),
      folderId: folderId,
      schemaVersion: TK_SCHEMA_VERSION
    });
  } catch (e) {
    return tkErr('SETUP_FAILED', 'Échec de l\'initialisation : ' + e.message);
  } finally {
    lock.releaseLock();
  }
}

// ---------------------------------------------------------------------------
// Statut / santé
// ---------------------------------------------------------------------------

function getApplicationStatus() {
  var props = tkProps();
  var fileId = props.getProperty(PROP_FILE_ID);
  var file = fileId ? tkGetFileById(fileId) : null;
  var revision = null;
  if (file) {
    try {
      var env = JSON.parse(file.getBlob().getDataAsString());
      revision = env.revision;
    } catch (e) { revision = null; }
  }
  return tkOk({
    initialized: !!file,
    schemaVersion: Number(props.getProperty(PROP_SCHEMA_VERSION)) || null,
    envelopeVersion: TK_ENVELOPE_VERSION,
    revision: revision,
    hasBackupFolder: !!props.getProperty(PROP_BACKUP_FOLDER_ID)
  });
}

function healthCheck() {
  var props = tkProps();
  var fileId = props.getProperty(PROP_FILE_ID);
  var file = fileId ? tkGetFileById(fileId) : null;
  var readable = false;
  if (file) {
    try { file.getBlob().getDataAsString(); readable = true; } catch (e) { readable = false; }
  }
  return tkOk({
    status: file && readable ? 'healthy' : (file ? 'degraded' : 'uninitialized'),
    initialized: !!file,
    fileReadable: readable,
    time: new Date().toISOString()
  });
}

// ---------------------------------------------------------------------------
// Lecture / écriture de l'enveloppe
// ---------------------------------------------------------------------------

function tkRequireFile() {
  var fileId = tkProps().getProperty(PROP_FILE_ID);
  var file = fileId ? tkGetFileById(fileId) : null;
  if (!file) {
    throw { code: 'NOT_INITIALIZED', message: 'Projet non initialisé. Exécutez setupProject().' };
  }
  return file;
}

function tkReadEnvelope(file) {
  var raw = file.getBlob().getDataAsString();
  var env = JSON.parse(raw);
  if (!env || env.format !== TK_INITIAL_ENVELOPE.format || !env.encryption) {
    throw { code: 'INVALID_ENVELOPE', message: 'Enveloppe stockée invalide.' };
  }
  return env;
}

/** Renvoie l'enveloppe chiffrée telle quelle (le navigateur déchiffrera). */
function loadEncryptedState() {
  try {
    var file = tkRequireFile();
    return tkOk(tkReadEnvelope(file));
  } catch (e) {
    return tkErr(e.code || 'LOAD_FAILED', e.message || 'Lecture impossible.');
  }
}

function getCurrentRevision() {
  try {
    var file = tkRequireFile();
    var env = tkReadEnvelope(file);
    return tkOk({ revision: env.revision });
  } catch (e) {
    return tkErr(e.code || 'LOAD_FAILED', e.message || 'Lecture impossible.');
  }
}

/**
 * Enregistre une nouvelle enveloppe chiffrée fournie par le navigateur.
 * Contrôle de révision obligatoire + verrou pour éviter les écrasements.
 *
 * @param {{expectedRevision:number, schemaVersion:number, iv:string, ciphertext:string}} payload
 */
function saveEncryptedState(payload) {
  if (!payload || typeof payload.iv !== 'string' || typeof payload.ciphertext !== 'string') {
    return tkErr('BAD_REQUEST', 'Enveloppe chiffrée manquante ou invalide.');
  }
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(TK_LOCK_TIMEOUT_MS);
  } catch (e) {
    return tkErr('LOCK_TIMEOUT', 'Enregistrement occupé, réessayez.');
  }
  try {
    var file = tkRequireFile();
    var current = tkReadEnvelope(file);

    // Contrôle de révision : refuse un enregistrement basé sur une version périmée.
    if (typeof payload.expectedRevision === 'number' &&
        payload.expectedRevision !== current.revision) {
      return tkErr('REVISION_CONFLICT',
        'Les données ont changé entre-temps (révision serveur ' + current.revision +
        ', attendue ' + payload.expectedRevision + '). Rechargez avant de réenregistrer.');
    }

    // Sauvegarde de l'ancienne enveloppe avant écrasement.
    tkWriteBackup(current);

    var next = {
      format: current.format,
      envelopeVersion: current.envelopeVersion || TK_ENVELOPE_VERSION,
      schemaVersion: payload.schemaVersion || current.schemaVersion || TK_SCHEMA_VERSION,
      revision: current.revision + 1,
      updatedAt: new Date().toISOString(),
      encryption: {
        algorithm: 'AES-GCM',
        iv: payload.iv,
        ciphertext: payload.ciphertext
      }
    };
    file.setContent(JSON.stringify(next));

    return tkOk({ revision: next.revision, updatedAt: next.updatedAt });
  } catch (e) {
    return tkErr(e.code || 'SAVE_FAILED', e.message || 'Enregistrement impossible.');
  } finally {
    lock.releaseLock();
  }
}

// ---------------------------------------------------------------------------
// Sauvegardes
// ---------------------------------------------------------------------------

function tkBackupFolder() {
  var props = tkProps();
  var id = props.getProperty(PROP_BACKUP_FOLDER_ID);
  var folder = id ? tkGetFolderById(id) : null;
  if (folder) return folder;
  // Crée à la volée si absent (rétro-compat).
  var mainId = props.getProperty(PROP_FOLDER_ID);
  var main = mainId ? tkGetFolderById(mainId) : DriveApp.getRootFolder();
  folder = main.createFolder(TK_BACKUP_FOLDER_NAME);
  props.setProperty(PROP_BACKUP_FOLDER_ID, folder.getId());
  return folder;
}

function tkWriteBackup(envelope) {
  var folder = tkBackupFolder();
  var name = 'teamkrys-backup-rev' + envelope.revision + '-' +
    new Date().toISOString().replace(/[:.]/g, '-') + '.enc.json';
  folder.createFile(name, JSON.stringify(envelope), 'application/json');
  tkPruneBackups(folder);
}

function tkPruneBackups(folder) {
  var files = [];
  var it = folder.getFiles();
  while (it.hasNext()) {
    var f = it.next();
    files.push({ id: f.getId(), created: f.getDateCreated().getTime(), file: f });
  }
  if (files.length <= TK_MAX_BACKUPS) return;
  files.sort(function (a, b) { return a.created - b.created; }); // plus ancien d'abord
  var toRemove = files.length - TK_MAX_BACKUPS;
  for (var i = 0; i < toRemove; i++) {
    files[i].file.setTrashed(true);
  }
}

/** Force la création d'une sauvegarde de l'état courant. */
function createBackup() {
  var lock = LockService.getScriptLock();
  try { lock.waitLock(TK_LOCK_TIMEOUT_MS); }
  catch (e) { return tkErr('LOCK_TIMEOUT', 'Occupé, réessayez.'); }
  try {
    var file = tkRequireFile();
    var env = tkReadEnvelope(file);
    tkWriteBackup(env);
    return tkOk({ backedUpRevision: env.revision });
  } catch (e) {
    return tkErr(e.code || 'BACKUP_FAILED', e.message || 'Sauvegarde impossible.');
  } finally {
    lock.releaseLock();
  }
}

/** Liste les métadonnées des sauvegardes (sans le contenu chiffré). */
function listBackupMetadata() {
  try {
    var folder = tkBackupFolder();
    var out = [];
    var it = folder.getFiles();
    while (it.hasNext()) {
      var f = it.next();
      var revision = null;
      var m = f.getName().match(/rev(\d+)/);
      if (m) revision = Number(m[1]);
      out.push({
        id: f.getId(),
        name: f.getName(),
        revision: revision,
        createdAt: f.getDateCreated().toISOString(),
        sizeBytes: f.getSize()
      });
    }
    out.sort(function (a, b) { return b.createdAt < a.createdAt ? -1 : 1; });
    return tkOk({ backups: out });
  } catch (e) {
    return tkErr('LIST_BACKUPS_FAILED', e.message || 'Listing impossible.');
  }
}

/**
 * Restaure une sauvegarde comme état courant (crée d'abord une sauvegarde de
 * l'état existant, puis incrémente la révision).
 * @param {{backupId:string}} arg
 */
function restoreBackup(arg) {
  if (!arg || !arg.backupId) {
    return tkErr('BAD_REQUEST', 'backupId manquant.');
  }
  var lock = LockService.getScriptLock();
  try { lock.waitLock(TK_LOCK_TIMEOUT_MS); }
  catch (e) { return tkErr('LOCK_TIMEOUT', 'Occupé, réessayez.'); }
  try {
    var backupFile = tkGetFileById(arg.backupId);
    if (!backupFile) return tkErr('BACKUP_NOT_FOUND', 'Sauvegarde introuvable.');
    var backupEnv = JSON.parse(backupFile.getBlob().getDataAsString());
    if (!backupEnv || !backupEnv.encryption) {
      return tkErr('INVALID_BACKUP', 'Sauvegarde illisible.');
    }
    var file = tkRequireFile();
    var current = tkReadEnvelope(file);
    tkWriteBackup(current); // protège l'état courant avant restauration.

    var restored = {
      format: current.format,
      envelopeVersion: current.envelopeVersion || TK_ENVELOPE_VERSION,
      schemaVersion: backupEnv.schemaVersion || current.schemaVersion,
      revision: current.revision + 1,
      updatedAt: new Date().toISOString(),
      encryption: backupEnv.encryption
    };
    file.setContent(JSON.stringify(restored));
    return tkOk({ revision: restored.revision, restoredFrom: arg.backupId });
  } catch (e) {
    return tkErr(e.code || 'RESTORE_FAILED', e.message || 'Restauration impossible.');
  } finally {
    lock.releaseLock();
  }
}
