/* BrainstO. : tests de la COQUILLE du backend Apps Script (apps-script/Code.gs,
 * à partir du commentaire « Hachage ») : codes de réponse, fichiers Drive
 * homonymes, diagnostic, sauvegarde et restauration (SPEC §21, §22, §23).
 *
 * Exécution (aucune dépendance, aucun package.json) :
 *     node tests/backend-shell.test.js
 *
 * Même recette que tests/parity.test.js : Code.gs est chargé dans un contexte
 * vm isolé, avec des doublures en mémoire de DriveApp, LockService,
 * PropertiesService, ContentService et Logger. Une panne Drive s'injecte appel
 * par appel : drive.faults.<méthode> = nombre d'échecs à produire.
 *
 * Contrat vérifié (additif : un ancien client ignore `code`) :
 *   - code "invalid" : action rejetée par la validation, définitif ;
 *   - code "retry"   : rien n'a été appliqué (verrou, Drive, corps illisible,
 *                      exception), l'action doit rester en file ;
 *   - code "auth"    : inchangé.
 */
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");
const crypto = require("crypto");

const SOURCE = fs.readFileSync(path.join(__dirname, "..", "apps-script", "Code.gs"), "utf8");
const FILE_NAME = "brainsto-data.json";

let passed = 0;
const failures = [];

function check(name, fn) {
  try { fn(); passed += 1; }
  catch (error) { failures.push(name + " → " + (error && error.message)); }
}

function assert(condition, message) {
  if (!condition) { throw new Error(message || "assertion fausse"); }
}

function equal(actual, expected, message) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) { throw new Error((message || "valeurs différentes") + " : obtenu " + a + ", attendu " + e); }
}

/* ------------------------------------------------------------ Doublures --- */

function makeDrive() {
  const drive = {
    files: new Map(), folders: new Map(), seq: 0, faults: {}, reverse: false,
    calls: { getBlob: 0, setContent: 0, createFile: 0, setName: 0, setTrashed: 0 }
  };
  function fail(kind) {
    if (drive.faults[kind] > 0) {
      drive.faults[kind] -= 1;
      throw new Error("Service error: Drive (" + kind + ")");
    }
  }
  function iterator(list) {
    let i = 0;
    return { hasNext: () => i < list.length, next: () => list[i++] };
  }
  function blob(name, content) {
    let blobName = name;
    const b = { getDataAsString: () => content, getName: () => blobName, setName: (n) => { blobName = n; return b; } };
    return b;
  }
  function addFolder(name) {
    const rec = { id: "folder-" + (++drive.seq), name };
    drive.folders.set(rec.id, rec);
    return rec;
  }
  function addRecord(name, content, folderId) {
    const rec = {
      id: "file-" + (++drive.seq), name, content: String(content), parent: folderId, trashed: false,
      updated: new Date(Date.UTC(2026, 0, 1, 8, 0, drive.seq))
    };
    drive.files.set(rec.id, rec);
    return rec;
  }
  function folderObject(rec) {
    return {
      getId: () => rec.id,
      getName: () => rec.name,
      createFile: (a, b) => {
        drive.calls.createFile += 1;
        fail("createFile");
        /* Comme Apps Script : createFile(blob) nomme le fichier d'après le blob. */
        if (typeof a === "string") { return fileObject(addRecord(a, b, rec.id)); }
        return fileObject(addRecord(a.getName(), a.getDataAsString(), rec.id));
      }
    };
  }
  function fileObject(rec) {
    const f = {
      getId: () => rec.id,
      getName: () => rec.name,
      setName: (n) => { drive.calls.setName += 1; fail("setName"); rec.name = n; return f; },
      getBlob: () => { drive.calls.getBlob += 1; fail("getBlob"); return blob(rec.name, rec.content); },
      setContent: (c) => {
        drive.calls.setContent += 1;
        fail("setContent");
        rec.content = String(c);
        rec.updated = new Date();
        return f;
      },
      getParents: () => iterator([folderObject(drive.folders.get(rec.parent))]),
      getLastUpdated: () => new Date(rec.updated.getTime()),
      getSize: () => Buffer.byteLength(rec.content, "utf8"),
      isTrashed: () => rec.trashed,
      setTrashed: (v) => { drive.calls.setTrashed += 1; rec.trashed = !!v; return f; }
    };
    return f;
  }
  const root = addFolder("Mon Drive");
  drive.api = {
    getFileById: (id) => {
      const rec = drive.files.get(String(id));
      if (!rec) { throw new Error("Exception: No item with the given ID could be found."); }
      return fileObject(rec);
    },
    /* ⚠️ Comme Drive : la recherche par nom renvoie AUSSI les fichiers à la
     * corbeille, dans un ordre non documenté (drive.reverse l'inverse). */
    getFilesByName: (n) => {
      const list = Array.from(drive.files.values()).filter((r) => r.name === n).map(fileObject);
      return iterator(drive.reverse ? list.reverse() : list);
    },
    getFoldersByName: (n) => iterator(Array.from(drive.folders.values()).filter((r) => r.name === n).map(folderObject)),
    createFolder: (n) => folderObject(addFolder(n)),
    getRootFolder: () => folderObject(root)
  };
  /* Aides de scénario (hors API Google). */
  drive.add = (name, content, folderName) => {
    const folder = Array.from(drive.folders.values()).find((r) => r.name === (folderName || "Mon Drive")) ||
      addFolder(folderName);
    return addRecord(name, typeof content === "string" ? content : JSON.stringify(content), folder.id);
  };
  drive.named = (n) => Array.from(drive.files.values()).filter((r) => r.name === n);
  drive.matching = (re) => Array.from(drive.files.values()).filter((r) => re.test(r.name));
  drive.snapshot = () => JSON.stringify(Array.from(drive.files.values()).map((r) => [r.id, r.name, r.content, r.trashed]));
  return drive;
}

function makeProps() {
  const store = {};
  return {
    store,
    api: {
      getProperty: (k) => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null),
      setProperty: (k, v) => { store[k] = String(v); },
      deleteProperty: (k) => { delete store[k]; }
    }
  };
}

function makeLock() {
  const lock = { busy: false, held: false, waits: 0, releases: 0 };
  lock.api = {
    waitLock: () => {
      lock.waits += 1;
      if (lock.busy) { throw new Error("Lock timeout: another process was holding the lock for too long."); }
      lock.held = true;
    },
    releaseLock: () => { lock.releases += 1; lock.held = false; }
  };
  return lock;
}

function loadBackend(drive, props) {
  drive = drive || makeDrive();
  props = props || makeProps();
  const lock = makeLock();
  const logs = [];
  const ctx = {
    Logger: { log: (m) => { logs.push(String(m)); } },
    Utilities: {
      DigestAlgorithm: { SHA_256: "SHA_256" },
      Charset: { UTF_8: "UTF_8" },
      computeDigest: (algo, text) => Array.from(
        crypto.createHash("sha256").update(String(text), "utf8").digest()
      ).map((b) => (b > 127 ? b - 256 : b))
    },
    PropertiesService: { getScriptProperties: () => props.api },
    LockService: { getScriptLock: () => lock.api },
    DriveApp: drive.api,
    ContentService: {
      MimeType: { JSON: "application/json" },
      createTextOutput: (text) => {
        const out = { getContent: () => String(text) };
        out.setMimeType = () => out;
        return out;
      }
    }
  };
  vm.createContext(ctx);
  vm.runInContext(SOURCE, ctx, { filename: "Code.gs" });
  const be = { ctx, drive, props, lock, logs };
  be.post = (body, raw) => JSON.parse(ctx.doPost({
    parameter: {}, postData: { contents: raw ? body : JSON.stringify(body) }
  }).getContent());
  be.get = (params) => JSON.parse(ctx.doGet({ parameter: params || {} }).getContent());
  be.dataRec = () => drive.files.get(props.store.BRAINSTO_FILE_ID);
  be.data = () => JSON.parse(be.dataRec().content);
  return be;
}

/* Espace prêt à l'emploi : setupProject() exécuté une fois. */
function fresh() {
  const be = loadBackend();
  be.ctx.setupProject();
  return be;
}

function act(id, type, payload) { return { id, type, actorId: "u1", actorName: "Alice", payload }; }
function topic(id, n) { return act(id, "CREATE_TOPIC", { topicId: "t" + n, title: "Sujet " + n }); }
function plain(value) { return JSON.parse(JSON.stringify(value)); }
function thrown(fn) { try { fn(); } catch (error) { return String(error && error.message); } return null; }

/* ------------------------------------------- Codes de réponse (BL-001) --- */

check("verrou dépassé : code retry, rien d'écrit, l'action repart ensuite une seule fois", () => {
  const be = fresh();
  const before = be.drive.snapshot();
  be.lock.busy = true;
  const r = be.post(topic("a1", 1));
  equal([r.ok, r.code], [false, "retry"], "réponse au verrou dépassé");
  assert(/Lock timeout/.test(r.error), "le message d'origine est gardé : " + r.error);
  equal(be.drive.snapshot(), before, "rien ne doit être écrit");
  assert(!be.lock.held, "le verrou doit être relâché");
  be.lock.busy = false;
  const again = be.post(topic("a1", 1));
  equal([again.ok, again.revision], [true, 1], "la retransmission s'applique");
  const dup = be.post(topic("a1", 1));
  equal([dup.ok, dup.duplicate, dup.revision], [true, true, 1], "puis elle est reconnue comme doublon");
});

check("Drive en lecture : code retry, rien d'écrit", () => {
  const be = fresh();
  const before = be.drive.snapshot();
  be.drive.faults.getBlob = 1;
  const r = be.post(topic("a1", 1));
  equal([r.ok, r.code], [false, "retry"]);
  equal(be.drive.snapshot(), before, "rien ne doit être écrit");
  equal(be.post(topic("a1", 1)).revision, 1, "la retransmission s'applique");
});

check("Drive en écriture : code retry, fichier inchangé, journal non persisté sans l'état", () => {
  const be = fresh();
  be.post(topic("a0", 0));
  const before = be.dataRec().content;
  be.drive.faults.setContent = 1;
  const r = be.post([topic("a1", 1), topic("a2", 2), topic("a3", 3)]);
  equal([r.ok, r.code], [false, "retry"]);
  equal(be.dataRec().content, before, "aucune écriture partielle");
  const again = be.post([topic("a1", 1), topic("a2", 2), topic("a3", 3)]);
  equal(again.results.map((x) => [x.id, x.ok, !!x.duplicate]),
    [["a1", true, false], ["a2", true, false], ["a3", true, false]], "le lot renvoyé s'applique en entier");
  equal([be.data().revision, be.data().topics.length], [4, 4], "chaque action appliquée une seule fois");
});

check("sauvegarde automatique impossible (Drive plein) : code retry, rien d'écrit", () => {
  const be = fresh();
  const before = be.drive.snapshot();
  be.drive.faults.createFile = 1;
  const r = be.post(topic("a1", 1));
  equal([r.ok, r.code], [false, "retry"]);
  equal(be.drive.snapshot(), before, "rien ne doit être écrit");
});

check("corps illisible, vide, lot vide ou trop gros : code retry, jamais invalid", () => {
  const be = fresh();
  const before = be.drive.snapshot();
  const cases = {
    tronque: be.post('{"id":"a1","type":"CREATE_TO', true),
    vide: be.post("", true),
    sansCorps: JSON.parse(be.ctx.doPost({ parameter: {} }).getContent()),
    lotVide: be.post([]),
    tropGros: be.post(Array.from({ length: 21 }, (_, i) => topic("b" + i, i)))
  };
  Object.keys(cases).forEach((k) => {
    equal([cases[k].ok, cases[k].code], [false, "retry"], "cas " + k);
    assert(typeof cases[k].error === "string" && cases[k].error, "message présent (" + k + ")");
  });
  equal(be.drive.snapshot(), before, "rien ne doit être écrit");
});

check("validation : action unitaire rejetée → code invalid, rien d'écrit", () => {
  const be = fresh();
  const before = be.drive.snapshot();
  const r = be.post(act("x1", "TYPE_INCONNU", {}));
  equal([r.ok, r.code], [false, "invalid"]);
  assert(typeof r.error === "string" && r.error, "le motif du rejet est donné");
  equal(be.drive.snapshot(), before, "rien ne doit être écrit");
});

check("lot : results complets, dans l'ordre, invalid par entrée, doublon reconnu", () => {
  const be = fresh();
  const writesBefore = be.drive.calls.setContent;
  const r = be.post([topic("a1", 1), act("x1", "TYPE_INCONNU", {}), topic("a2", 2), topic("a1", 1)]);
  assert(r.ok === true && Array.isArray(r.results), "ok:true avec results");
  equal(r.results.map((x) => x.id), ["a1", "x1", "a2", "a1"], "une entrée par action reçue, dans l'ordre");
  equal(r.results.map((x) => [x.ok, x.code || null, !!x.duplicate]),
    [[true, null, false], [false, "invalid", false], [true, null, false], [true, null, true]]);
  equal(r.revision, 2, "deux actions appliquées");
  equal(be.drive.calls.setContent - writesBefore, 1, "une seule écriture pour le lot");
  const rejected = be.post([act("x2", "TYPE_INCONNU", {})]);
  equal([rejected.ok, rejected.results.length, rejected.results[0].code], [true, 1, "invalid"],
    "un lot entièrement rejeté garde ses results");
});

check("compatibilité : réponses de succès et refus d'accès inchangés", () => {
  const be = fresh();
  const r = be.post(topic("a1", 1));
  assert(r.ok === true && r.revision === 1 && r.state && r.code === undefined, "succès unitaire inchangé");
  assert(Array.isArray(r.features) && typeof r.backendVersion === "string", "enveloppe inchangée");
  assert(r.duplicate === undefined && be.post(topic("a1", 1)).duplicate === true, "doublon unitaire inchangé");
  be.ctx.ACCESS_CODE = "code-equipe";
  equal(plain(be.post(topic("a2", 2))), { ok: false, code: "auth", error: "Accès refusé par le serveur." });
  equal(be.get({ mode: "revision" }).code, "auth");
  be.ctx.ACCESS_CODE = "";
});

check("lecture (doGet) : une exception renvoie code retry", () => {
  const be = fresh();
  be.drive.faults.getBlob = 1;
  const r = be.get({ mode: "revision" });
  equal([r.ok, r.code], [false, "retry"]);
  equal(be.get({ mode: "revision" }).revision, 0, "la lecture suivante réussit");
});

/* ------------------------------------------ Fichiers homonymes (BL-017) --- */

function twoHomonyms() {
  const drive = makeDrive();
  const real = drive.add(FILE_NAME, { revision: 812, topics: [], participants: [] }, "BrainstO.");
  const stale = drive.add(FILE_NAME, { revision: 4, topics: [], participants: [] }, "Essai");
  const trashed = drive.add(FILE_NAME, { revision: 2, topics: [], participants: [] }, "BrainstO.");
  trashed.trashed = true;
  return { drive, real, stale, trashed };
}

check("homonymes sans rattachement : erreur qui liste chaque fichier, aucun choix, rien d'écrit", () => {
  [false, true].forEach((reverse) => {
    const h = twoHomonyms();
    h.drive.reverse = reverse;
    const be = loadBackend(h.drive);
    const before = be.drive.snapshot();
    const r = be.get({ mode: "revision" });
    equal([r.ok, r.code], [false, "retry"], "lecture refusée sans choisir (ordre inversé=" + reverse + ")");
    [h.real.id, h.stale.id, "BrainstO.", "Essai", "octets", "DATA_FILE_ID", "setupProject"].forEach((needle) => {
      assert(r.error.indexOf(needle) >= 0, "le message doit citer « " + needle + " » : " + r.error);
    });
    assert(r.error.indexOf(h.trashed.id) < 0, "un fichier à la corbeille n'est pas un candidat");
    equal([be.post(topic("a1", 1)).code], ["retry"], "écriture refusée en retry");
    const out = String(be.ctx.setupProject());
    assert(out.indexOf(h.real.id) >= 0 && out.indexOf(h.stale.id) >= 0, "setupProject liste les fichiers : " + out);
    assert(be.props.store.BRAINSTO_FILE_ID === undefined, "setupProject ne rattache rien en silence");
    equal(be.drive.snapshot(), before, "aucun fichier créé ni modifié");
    assert(be.logs.some((l) => l.indexOf(h.real.id) >= 0), "le message est journalisé");
  });
});

check("un seul fichier hors corbeille : rattaché et journalisé (id, dossier)", () => {
  const drive = makeDrive();
  const trashed = drive.add(FILE_NAME, { revision: 2, topics: [], participants: [] }, "Corbeille");
  trashed.trashed = true;
  const good = drive.add(FILE_NAME, { revision: 500, topics: [], participants: [] }, "BrainstO.");
  const be = loadBackend(drive);
  const out = String(be.ctx.setupProject());
  equal(be.props.store.BRAINSTO_FILE_ID, good.id, "le fichier hors corbeille est rattaché");
  assert(out.indexOf(good.id) >= 0 && out.indexOf("BrainstO.") >= 0, "journal avec id et dossier : " + out);
  equal(be.get({ mode: "revision" }).revision, 500);
});

check("rattachement explicite : l'emporte sur les homonymes", () => {
  const h = twoHomonyms();
  const be = loadBackend(h.drive);
  be.props.store.BRAINSTO_FILE_ID = h.stale.id;
  equal(be.get({ mode: "revision" }).revision, 4, "la propriété désigne le fichier");
  be.ctx.DATA_FILE_ID = h.real.id;
  equal(be.get({ mode: "revision" }).revision, 812, "DATA_FILE_ID l'emporte sur la propriété");
  equal(String(be.ctx.setupProject()).indexOf("Fichier déjà configuré"), 0, "setupProject relancé ne change rien");
});

check("diagnoseStorage : fichier retenu, chaque candidat complet, alerte homonymes, aucune écriture", () => {
  const be = fresh();
  be.post(topic("a1", 1));
  const attached = be.props.store.BRAINSTO_FILE_ID;
  const old = be.drive.add(FILE_NAME, { revision: 3, topics: [], participants: [] }, "Ancien dossier");
  const bin = be.drive.add(FILE_NAME, { revision: 1, topics: [], participants: [] }, "Ancien dossier");
  bin.trashed = true;
  const before = be.drive.snapshot();
  const propsBefore = JSON.stringify(be.props.store);
  const d = plain(be.ctx.diagnoseStorage());
  equal(be.drive.snapshot(), before, "diagnoseStorage n'écrit rien sur Drive");
  equal(JSON.stringify(be.props.store), propsBefore, "ni dans les propriétés");
  equal([d.configuredId, d.property, d.used && d.used.id], [attached, attached, attached], "fichier réellement retenu");
  equal(d.candidates.map((c) => c.id).sort(), [attached, old.id, bin.id].sort(), "tous les homonymes, corbeille comprise");
  d.candidates.forEach((c) => {
    ["id", "name", "size", "folder", "trashed", "updatedAt", "revision", "topics", "participants", "messages", "used"]
      .forEach((k) => assert(c[k] !== undefined, "champ « " + k + " » absent pour " + c.id));
  });
  const byId = {};
  d.candidates.forEach((c) => { byId[c.id] = c; });
  equal([byId[old.id].folder, byId[old.id].revision, byId[bin.id].trashed, byId[attached].used, byId[old.id].used],
    ["Ancien dossier", 3, true, true, false]);
  assert(byId[old.id].size === Buffer.byteLength(old.content, "utf8"), "taille en octets");
  assert(typeof d.warning === "string" && d.warning.indexOf(attached) >= 0, "alerte explicite sur les homonymes : " + d.warning);
  /* rattaché par DATA_FILE_ID sous un autre nom (copie restaurée par identifiant) */
  const other = be.drive.add(FILE_NAME + ".manuel.2026-09-01T08-00-00-000Z",
    { revision: 42, topics: [{ id: "x", title: "restauré" }], participants: [] }, "BrainstO.");
  be.ctx.DATA_FILE_ID = other.id;
  const d2 = plain(be.ctx.diagnoseStorage());
  equal([d2.dataFileId, d2.used.id, d2.used.revision, d2.used.topics], [other.id, other.id, 42, 1]);
  assert(d2.candidates.some((c) => c.id === other.id && c.used), "le fichier rattaché sous un autre nom est décrit aussi");
  be.ctx.DATA_FILE_ID = "";
  /* sans rattachement : l'erreur est donnée, rien n'est retenu */
  delete be.props.store.BRAINSTO_FILE_ID;
  const d3 = plain(be.ctx.diagnoseStorage());
  assert(d3.used === null && /Plusieurs fichiers/.test(d3.usedError) && typeof d3.warning === "string",
    "sans rattachement, le diagnostic dit qu'aucun fichier n'est retenu : " + JSON.stringify(d3.usedError));
});

check("sauvegarde : un échec ne laisse jamais un second brainsto-data.json", () => {
  const be = fresh();
  be.post(topic("a1", 1));
  be.drive.faults.setName = 1;
  const error = thrown(() => be.ctx.backupNow());
  be.drive.faults.setName = 0;
  equal(be.drive.named(FILE_NAME).length, 1, "un seul brainsto-data.json après un renommage en échec (" + error + ")");
  const copies = be.drive.matching(/^brainsto-data\.json\.manuel\.\d{4}-\d\d-\d\dT/);
  assert(error === null && copies.length === 1 && copies[0].content === be.dataRec().content,
    "copie créée directement sous son nom final, contenu identique");
  const count = be.drive.files.size;
  be.drive.faults.createFile = 1;
  assert(thrown(() => be.ctx.backupNow()) !== null, "la création en échec est signalée");
  equal([be.drive.files.size, be.drive.named(FILE_NAME).length], [count, 1], "aucun fichier en plus");
});

check("sauvegarde avant mise à niveau : une copie sous son nom final, avant la 1re écriture, jamais sur une lecture", () => {
  const be = fresh();
  be.post(topic("a1", 1));
  const contentBefore = be.dataRec().content;
  be.ctx.BACKEND_VERSION = "brainsto-backend-9.9.9";
  be.get({ mode: "state" });
  const pattern = /^brainsto-data\.json\.avant-brainsto-backend-9\.9\.9\.\d{4}-/;
  equal(be.drive.matching(pattern).length, 0, "aucune copie sur une lecture");
  be.post(topic("a2", 2));
  be.post(topic("a3", 3));
  const copies = be.drive.matching(pattern);
  assert(copies.length === 1 && copies[0].content === contentBefore, "une seule copie, état d'avant la mise à niveau");
  equal([be.drive.named(FILE_NAME).length, be.data().revision], [1, 3], "aucun homonyme, écritures appliquées");
});

/* -------------------------------------------------- Restauration (BL-018) --- */

check("restoreFromBackup : révision max+1, sauvegarde de sécurité, rien supprimé, rattachement inchangé", () => {
  const be = fresh();
  for (let i = 0; i < 5; i++) { be.post(topic("g" + i, i)); }
  be.ctx.backupNow();
  const backup = be.drive.matching(/\.manuel\./)[0];
  be.post(act("bad", "CREATE_TOPIC", { topicId: "tz", title: "état abîmé" }));
  const attached = be.props.store.BRAINSTO_FILE_ID;
  const replaced = be.dataRec().content;
  const idsBefore = Array.from(be.drive.files.keys());
  const waits = be.lock.waits;
  const out = String(be.ctx.restoreFromBackup(backup.id));
  const data = be.data();
  equal(be.props.store.BRAINSTO_FILE_ID, attached, "rattachement inchangé");
  equal(data.revision, 7, "révision = max(6, 5) + 1");
  equal(data.topics.map((t) => t.id), ["t0", "t1", "t2", "t3", "t4"], "contenu de la copie");
  assert(data.processedActionIds.indexOf("bad") >= 0 && data.processedActionIds.indexOf("g0") >= 0,
    "journal de déduplication = union");
  idsBefore.forEach((id) => assert(be.drive.files.has(id) && !be.drive.files.get(id).trashed, "rien n'est supprimé : " + id));
  const safety = be.drive.matching(/^brainsto-data\.json\.avant-restauration\./);
  assert(safety.length === 1 && safety[0].content === replaced, "sauvegarde de sécurité de l'état remplacé");
  equal(be.drive.files.size, idsBefore.length + 1, "un seul fichier créé : la sauvegarde de sécurité");
  equal(be.drive.calls.setTrashed, 0, "aucune mise à la corbeille");
  assert(be.lock.waits === waits + 1 && !be.lock.held, "sous verrou, relâché ensuite");
  assert(out.indexOf(backup.id) >= 0 && out.indexOf(safety[0].id) >= 0, "journal lisible : " + out);
  assert(be.get({ since: "6" }).state && be.get({ since: "5" }).state, "un appareil en révision 5 ou 6 recharge l'état");
  equal(be.get({ since: "7" }).unchanged, true);
  equal(be.post(act("bad", "CREATE_TOPIC", { topicId: "tz", title: "état abîmé" })).duplicate, true,
    "une action annulée par la restauration n'est pas réappliquée");
  equal(be.post(topic("n1", 9)).revision, 8, "les écritures reprennent après la restauration");
});

check("restoreFromBackup : copie plus récente, journal borné aux plus récents", () => {
  const be = fresh();
  be.post(topic("a1", 1));
  be.ctx.MAX_PROCESSED = 5;
  const rec = be.dataRec();
  const current = JSON.parse(rec.content);
  current.processedActionIds = ["b", "c", "d", "e", "f"];
  rec.content = JSON.stringify(current);
  const copy = be.drive.add("copie.json",
    { revision: 50, topics: [], participants: [], processedActionIds: ["a", "b", "c"] }, "BrainstO.");
  be.ctx.restoreFromBackup(copy.id);
  equal([be.data().revision, be.data().processedActionIds], [51, ["b", "c", "d", "e", "f"]]);
});

check("restoreFromBackup : refus explicite sans rien écrire", () => {
  const be = fresh();
  be.post(topic("a1", 1));
  const broken = be.drive.add("illisible.json", "pas du json", "BrainstO.");
  const before = be.drive.snapshot();
  [undefined, "", broken.id, be.props.store.BRAINSTO_FILE_ID, "inconnu"].forEach((id) => {
    assert(thrown(() => be.ctx.restoreFromBackup(id)) !== null, "refus attendu pour " + JSON.stringify(id));
    equal(be.drive.snapshot(), before, "rien n'est écrit pour " + JSON.stringify(id));
  });
  be.lock.busy = true;
  assert(/Lock timeout/.test(thrown(() => be.ctx.restoreFromBackup(be.drive.matching(/\.avant-/)[0].id))),
    "verrou dépassé : refus");
  equal(be.drive.snapshot(), before, "rien n'est écrit sans le verrou");
});

/* ------------------------------------------------------------ Exécution --- */

const total = passed + failures.length;
if (failures.length) {
  console.error("\n" + failures.length + " test(s) en échec sur " + total + " :\n");
  failures.forEach((f) => console.error("  ✗ " + f));
  process.exit(1);
}
console.log("✓ " + passed + " tests réussis sur " + total + ".");
