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

/* ------------------------------------- Fichier absent : l'espace se recrée --- */

check("nouvelle équipe, aucun fichier : la lecture rend un espace vide sans rien créer, la 1re action crée le fichier", () => {
  const be = loadBackend();
  const r = be.get({});
  assert(r.ok && r.state && r.state.topics.length === 0, "lecture d'un espace vide : " + JSON.stringify(r));
  equal(be.drive.calls.createFile, 0, "une lecture ne crée rien");
  const w = be.post(topic("a1", 1));
  assert(w.ok, "la première action passe : " + JSON.stringify(w));
  const files = be.drive.named(FILE_NAME);
  equal(files.length, 1, "un seul fichier créé");
  equal(be.props.store.BRAINSTO_FILE_ID, files[0].id, "et rattaché");
  equal(be.data().topics.map((t) => t.id), ["t1"], "l'action y est écrite");
  assert(be.data().revision > 1000000000, "révision de départ = horodatage (jamais un numéro déjà vu) : " + be.data().revision);
  equal(be.drive.matching(/\.avant-/).length, 0, "pas de copie « avant-version » d'un fichier neuf");
});

check("fichier supprimé (rattaché, ou désigné par DATA_FILE_ID) : rattachement oublié, espace neuf à la 1re action", () => {
  ["propriété", "corbeille", "DATA_FILE_ID"].forEach((how) => {
    const be = fresh();
    be.post(topic("a1", 1));
    const old = be.dataRec();
    if (how === "corbeille") { old.trashed = true; } else { be.drive.files.delete(old.id); }
    if (how === "DATA_FILE_ID") { be.ctx.DATA_FILE_ID = old.id; }
    const r = be.get({});
    assert(r.ok && r.state.topics.length === 0, how + " : lecture d'un espace vide : " + JSON.stringify(r));
    const w = be.post(topic("b1", 2));
    assert(w.ok, how + " : écriture acceptée : " + JSON.stringify(w));
    const live = be.drive.named(FILE_NAME).filter((f) => !f.trashed);
    equal(live.length, 1, how + " : un fichier neuf");
    assert(live[0].id !== old.id && be.props.store.BRAINSTO_FILE_ID === live[0].id, how + " : nouveau rattachement");
    equal(JSON.parse(live[0].content).topics.map((t) => t.id), ["t2"], how + " : seule la nouvelle action y figure");
  });
});

check("panne passagère de Drive sur le fichier rattaché : code retry, jamais d'espace neuf", () => {
  const be = fresh();
  be.post(topic("a1", 1));
  const real = be.drive.api.getFileById;
  be.drive.api.getFileById = () => { throw new Error("Service error: Drive"); };
  equal(be.post(topic("b1", 2)).code, "retry", "retry");
  equal(be.drive.named(FILE_NAME).length, 1, "aucun fichier créé");
  be.drive.api.getFileById = real;
  equal(be.data().topics.map((t) => t.id), ["t1"], "l'espace d'origine est intact");
});

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

check("resetSpace : tout est effacé (sujets, membres), révision +1, journal gardé, sauvegarde réversible, rien supprimé", () => {
  const be = fresh();
  for (let i = 0; i < 3; i++) { be.post(topic("g" + i, i)); }
  const before = be.dataRec().content;
  const idsBefore = Array.from(be.drive.files.keys());
  const out = String(be.ctx.resetSpace());
  const data = be.data();
  equal([data.topics.length, data.participants.length], [0, 0], "espace vide");
  equal(data.revision, 4, "révision = 3 + 1, jamais répétée");
  assert(data.processedActionIds.indexOf("g0") >= 0, "journal de déduplication gardé");
  const safety = be.drive.matching(/^brainsto-data\.json\.avant-remise-a-zero\./);
  assert(safety.length === 1 && safety[0].content === before, "état effacé sauvegardé");
  idsBefore.forEach((id) => assert(be.drive.files.has(id), "rien n'est supprimé : " + id));
  assert(out.indexOf("restoreFromBackup") >= 0 && !be.lock.held, "journal lisible, verrou relâché : " + out);
  assert(be.get({ since: "3" }).state, "un appareil en révision 3 recharge l'état vide");
  equal(be.post(topic("g0", 0)).duplicate, true, "une action déjà appliquée renvoyée par un téléphone ne revient pas");
  be.ctx.restoreFromBackup(safety[0].id);
  equal(be.data().topics.length, 3, "la remise à zéro se défait par restoreFromBackup");
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

/* ------------------- Durcissement de la restauration et de la version (WP-21) --- */

check("restoreFromBackup : un fichier qui n'est pas une copie BrainstO est refusé, sans écriture ni sauvegarde (REC-REV-002)", () => {
  const be = fresh();
  be.post([topic("a1", 1), topic("a2", 2),
    act("a3", "CREATE_MESSAGE", { topicId: "t1", messageId: "m1", text: "Un message important" })]);
  const contentBefore = be.dataRec().content;
  const revisionBefore = be.data().revision;
  const contents = {
    "objet vide": "{}",
    "JSON d'une autre application": JSON.stringify({ name: "x" }),
    "autre application avec des listes": JSON.stringify({ items: [1, 2, 3], participants: [] }),
    "tableau": "[]",
    "texte": JSON.stringify("texte"),
    "nombre": "42",
    "null": "null",
    "sujets null": JSON.stringify({ topics: null }),
    "sujets en objet": JSON.stringify({ topics: {} }),
    "sujets en texte": JSON.stringify({ topics: "t1" })
  };
  Object.keys(contents).forEach((label) => {
    const copy = be.drive.add("copie.json", contents[label], "BrainstO.");
    const snapshot = be.drive.snapshot();
    const writes = [be.drive.calls.setContent, be.drive.calls.createFile];
    const error = thrown(() => be.ctx.restoreFromBackup(copy.id));
    assert(error !== null && error.indexOf("n'est pas un fichier de données lisible") >= 0 &&
      error.indexOf("rien n'a été modifié") >= 0, "refus attendu avec le message d'origine (" + label + ") : " + error);
    equal(be.drive.snapshot(), snapshot, "aucun fichier créé, modifié ni mis à la corbeille (" + label + ")");
    equal([be.drive.calls.setContent, be.drive.calls.createFile], writes, "aucune écriture Drive (" + label + ")");
    assert(!be.lock.held, "le verrou est relâché (" + label + ")");
  });
  equal(be.dataRec().content, contentBefore, "fichier de données inchangé octet pour octet");
  equal([be.data().revision, be.data().topics.length], [revisionBefore, 2], "révision et sujets inchangés");
  equal(be.drive.matching(/avant-restauration/).length, 0, "aucune sauvegarde de sécurité créée avant le refus");
  const later = be.post(act("z1", "CREATE_MESSAGE", { topicId: "t1", messageId: "m2", text: "Action restée en file" }));
  equal([later.ok, later.code, later.revision], [true, undefined, revisionBefore + 1],
    "une action en file sur un sujet existant s'applique toujours (jamais invalid)");
});

check("restoreFromBackup : une copie BrainstO valide est restaurée, même vide ou d'une ancienne version (REC-REV-002)", () => {
  const v2 = { revision: 3, topics: [{ id: "t9", title: "Ancien sujet", conclusion: "Cap : le jeudi" }] };
  [
    ["liste de sujets vide", { topics: [] }, 0, 3],
    ["copie d'un espace neuf", { revision: 2, topics: [], participants: [], processedActionIds: [] }, 0, 3],
    ["sujet d'une version 2", v2, 1, 4]
  ].forEach(([label, content, topics, revision]) => {
    const be = fresh();
    be.post([topic("a1", 1), topic("a2", 2)]);
    const copy = be.drive.add("copie.json", content, "BrainstO.");
    const out = String(be.ctx.restoreFromBackup(copy.id));
    equal([be.data().topics.length, be.data().revision], [topics, revision], "copie restaurée : " + label);
    equal(be.drive.matching(/^brainsto-data\.json\.avant-restauration\./).length, 1, "sauvegarde de sécurité créée : " + label);
    assert(out.indexOf(copy.id) >= 0, "journal lisible : " + out);
    if (topics) { equal(be.data().topics[0].conclusions.map((c) => c.id), ["legacy-t9"], "l'ancien texte de consensus est repris"); }
  });
});

check("restoreFromBackup : une copie antérieure à « Rendre anonyme » ne republie pas l'auteur (REC-REV-003, §5)", () => {
  const be = fresh();
  const emoji = be.ctx.REACTIONS[0];
  be.post([topic("b1", 1),
    act("b2", "CREATE_MESSAGE", { topicId: "t1", messageId: "m1", text: "Avis sensible" }),
    act("b3", "SET_REACTION", { topicId: "t1", messageId: "m1", emoji, set: true }),
    { id: "b4", type: "SET_REACTION", actorId: "u2", actorName: "Bob", payload: { topicId: "t1", messageId: "m1", emoji, set: true } }]);
  be.ctx.backupNow();
  const backup = be.drive.matching(/\.manuel\./)[0];
  const inCopy = JSON.parse(backup.content).topics[0].messages[0];
  equal([inCopy.authorId, inCopy.authorName, inCopy.anon, Object.keys(inCopy.reactions)], ["u1", "Alice", false, ["u1", "u2"]],
    "la copie porte l'auteur et sa clé de réaction");
  be.post(act("b5", "SET_MESSAGE_SIGNATURE", { topicId: "t1", messageId: "m1", anon: true }));
  const live = be.data().topics[0].messages[0];
  equal([live.authorId, live.authorName, live.anon, Object.keys(live.reactions)], ["", "Anonyme", true, ["u2"]],
    "avant la restauration : anonyme, clé de l'auteur retirée");
  be.ctx.restoreFromBackup(backup.id);
  const m = be.data().topics[0].messages[0];
  equal([m.authorId, m.authorName, m.anon], ["", "Anonyme", true], "après la restauration : toujours anonyme");
  equal(Object.keys(m.reactions), ["u2"], "aucune clé de réaction ne porte l'ancien identifiant, celle d'une autre personne reste");
  assert(JSON.stringify(m).indexOf("Alice") < 0 && JSON.stringify(m).indexOf('"u1"') < 0,
    "aucune trace de l'auteur dans le message restauré : " + JSON.stringify(m));
  const served = be.get({ mode: "state" }).state.topics[0].messages[0];
  equal([served.authorId, served.authorName, served.anon, Object.keys(served.reactions)], ["", "Anonyme", true, ["u2"]],
    "état SERVI aux appareils (doGet) identique");
  equal(be.data().revision, 6, "révision = max(5, 4) + 1 comme avant");
  const safety = be.drive.matching(/^brainsto-data\.json\.avant-restauration\./);
  assert(safety.length === 1 && JSON.parse(safety[0].content).topics[0].messages[0].anon === true,
    "la sauvegarde de sécurité garde l'état anonymisé remplacé");
});

check("restoreFromBackup : signé aux deux dates reste signé, anonyme reste anonyme, rien ne plante sans correspondance (REC-REV-003)", () => {
  const be = fresh();
  be.post([topic("c1", 1),
    act("c2", "CREATE_MESSAGE", { topicId: "t1", messageId: "m1", text: "Signé aux deux dates" }),
    act("c3", "CREATE_MESSAGE", { topicId: "t1", messageId: "m2", text: "Sera rendu anonyme" }),
    act("c4", "CREATE_MESSAGE", { topicId: "t1", messageId: "m5", text: "Anonyme puis resigné", anon: true })]);
  be.ctx.backupNow();
  const backup = be.drive.matching(/\.manuel\./)[0];
  be.post([act("c5", "SET_MESSAGE_SIGNATURE", { topicId: "t1", messageId: "m2", anon: true }),
    act("c6", "SET_MESSAGE_SIGNATURE", { topicId: "t1", messageId: "m5", anon: false }),
    /* postérieurs à la copie : message absent de la copie, puis sujet absent de la copie */
    act("c7", "CREATE_MESSAGE", { topicId: "t1", messageId: "m4", text: "Message récent", anon: true }),
    topic("c8", 2),
    act("c9", "CREATE_MESSAGE", { topicId: "t2", messageId: "m3", text: "Sujet récent", anon: true })]);
  equal(be.data().topics[0].messages.map((m) => [m.id, m.anon]), [["m1", false], ["m2", true], ["m5", false], ["m4", true]],
    "état avant la restauration");
  be.ctx.restoreFromBackup(backup.id);
  const data = be.data();
  equal(data.topics.map((t) => t.id), ["t1"], "ce qui est postérieur à la copie n'est pas ramené");
  equal(data.topics[0].messages.map((m) => [m.id, m.authorId, m.authorName, m.anon]),
    [["m1", "u1", "Alice", false], ["m2", "", "Anonyme", true], ["m5", "", "Anonyme", true]],
    "signé aux deux dates : signé ; anonymisé après la copie : anonyme ; anonyme dans la copie : anonyme");
});

check("restoreFromBackup : fichier courant abîmé, rien à reporter, aucun plantage, copie restaurée (REC-REV-003)", () => {
  const be = fresh();
  be.post([topic("d1", 1), act("d2", "CREATE_MESSAGE", { topicId: "t1", messageId: "m1", text: "Avis" })]);
  be.ctx.backupNow();
  const backup = be.drive.matching(/\.manuel\./)[0];
  be.post(act("d3", "SET_MESSAGE_SIGNATURE", { topicId: "t1", messageId: "m1", anon: true }));
  const damaged = '{"revision": 9, "topics": [{"id": "t1", "messages": [{"id": "m1", "anon": tr';
  be.dataRec().content = damaged;
  const error = thrown(() => be.ctx.restoreFromBackup(backup.id));
  equal(error, null, "la restauration ne plante pas sur un fichier courant illisible");
  equal([be.data().revision, be.data().topics.map((t) => t.id)], [10, ["t1"]], "révision = max(9 lue dans le texte, 2) + 1, copie restaurée");
  const safety = be.drive.matching(/^brainsto-data\.json\.avant-restauration\./);
  assert(safety.length === 1 && safety[0].content === damaged, "le texte abîmé est gardé dans la sauvegarde de sécurité");
  assert(!be.lock.held, "le verrou est relâché");
});

check("BACKEND_VERSION montée : une équipe restée sur la 1.0.0 reçoit UNE copie avant la première écriture (REC-REV-004, §23)", () => {
  const drive = makeDrive();
  const props = makeProps();
  /* Fichier d'une équipe en production : déjà migré par le backend 1.0.0 (propriété posée),
   * sujet v2 portant encore « conclusion » : la première écriture du noyau actuel le réécrit. */
  const v2 = { revision: 41, updatedAt: "2026-05-01T08:00:00.000Z", participants: [{ id: "u1", name: "Alice" }],
    topics: [{ id: "t1", title: "Commandes", status: "open", createdBy: { id: "u1", name: "Alice" },
      createdAt: "2026-04-01T08:00:00.000Z", updatedAt: "2026-05-01T08:00:00.000Z", messages: [], proposals: [],
      conclusions: [], conclusionVotes: {}, conclusion: "Cap : on commande le jeudi",
      conclusionUpdatedAt: "2026-04-20T08:00:00.000Z", conclusionUpdatedBy: "u1" }], processedActionIds: [] };
  const rec = drive.add(FILE_NAME, v2, "BrainstO.");
  props.store.BRAINSTO_FILE_ID = rec.id;
  props.store.BRAINSTO_BACKUP_VERSION = "brainsto-backend-1.0.0";
  const be = loadBackend(drive, props);
  const version = be.ctx.BACKEND_VERSION;
  assert(/^brainsto-backend-\d+\.\d+\.\d+$/.test(version) && version !== "brainsto-backend-1.0.0",
    "la version du backend a changé depuis la 1.0.0 déployée : " + version);
  const contentBefore = rec.content;
  const pattern = new RegExp("^" + FILE_NAME.replace(/\./g, "\\.") + "\\.avant-" + version.replace(/\./g, "\\.") + "\\.\\d{4}-");
  be.get({ mode: "state" });
  equal(drive.matching(pattern).length, 0, "aucune copie sur une lecture");
  const first = be.post(act("e1", "CREATE_MESSAGE", { topicId: "t1", messageId: "m1", text: "bonjour" }));
  equal(first.ok, true, "la première écriture réussit");
  const copies = drive.matching(pattern);
  assert(copies.length === 1 && copies[0].content === contentBefore, "UNE copie « avant-" + version + " », contenu d'avant la mise à niveau");
  const written = JSON.parse(rec.content).topics[0];
  assert(!Object.prototype.hasOwnProperty.call(written, "conclusion") && written.conclusions.map((c) => c.id).join() === "legacy-t1",
    "le fichier réécrit a bien changé (reprise de « conclusion »), la copie est le seul exemplaire d'origine");
  equal(be.post(act("e2", "CREATE_MESSAGE", { topicId: "t1", messageId: "m2", text: "encore" })).ok, true);
  equal(drive.matching(pattern).length, 1, "une seconde écriture n'en crée pas d'autre");
  equal(props.store.BRAINSTO_BACKUP_VERSION, version, "version mémorisée après la copie");
});

/* -------------------------------------------------------- Boîte à idées --- */

const SECRET = "un-secret-de-collecte-assez-long-123";
function idea(id, ideaId, text, actorId) {
  return { id, type: "SUBMIT_IDEA", actorId: actorId || "", actorName: actorId ? "Alice" : "Anonyme", payload: { ideaId, text } };
}
function op(be, name, body) {
  return JSON.parse(be.ctx.doPost({ parameter: { op: name }, postData: { contents: JSON.stringify(body) } }).getContent());
}
function boxOf(be) {
  const rec = be.drive.named("brainsto-idees.json")[0];
  return rec ? JSON.parse(rec.content) : null;
}

check("boîte à idées : l'idée va dans un fichier À PART (référence + texte seulement), jamais dans l'état ni vers les téléphones", () => {
  const be = fresh();
  const r = be.post(idea("a1", "idee-1", "Moins de réunions le lundi"));
  equal(r.ok, true, "dépôt accepté");
  const box = boxOf(be);
  assert(box && box.ideas.length === 1, "la boîte doit contenir l'idée : " + JSON.stringify(box));
  equal(Object.keys(box.ideas[0]).sort(), ["ref", "text"], "rien d'autre que la référence et le texte (ni auteur, ni heure)");
  equal(box.ideas[0].text, "Moins de réunions le lundi");
  assert(JSON.stringify(be.data()).indexOf("Moins de réunions") < 0, "le texte ne doit pas entrer dans l'état partagé");
  assert(JSON.stringify(be.get()).indexOf("Moins de réunions") < 0, "doGet ne doit jamais renvoyer une idée");
  assert(JSON.stringify(r).indexOf("Moins de réunions") < 0, "la réponse au dépôt ne doit pas renvoyer l'idée");
});

check("boîte à idées : une idée signée est refusée ; un renvoi (réponse perdue) n'ajoute rien ; une panne Drive de la boîte laisse l'action en file", () => {
  const be = fresh();
  const signed = be.post(idea("a1", "idee-1", "Signée", "u1"));
  equal([signed.ok, signed.code], [false, "invalid"], "une idée qui porte un auteur");
  equal(boxOf(be), null, "aucune boîte créée pour une idée refusée");
  be.post(idea("a2", "idee-2", "Une idée"));
  be.post(idea("a3", "idee-2", "Une idée"));                  // même idée, autre envoi
  equal(boxOf(be).ideas.length, 1, "même idée renvoyée : comptée une fois");
  be.drive.faults.setContent = 1;
  const r = be.post(idea("a4", "idee-3", "Pendant une panne"));
  equal([r.ok, r.code], [false, "retry"], "boîte non écrite : réessayer");
  equal(be.data().processedActionIds.indexOf("a4"), -1, "l'action ne doit pas être marquée traitée sans son idée");
  equal(be.post(idea("a4", "idee-3", "Pendant une panne")).ok, true, "le renvoi passe");
  equal(boxOf(be).ideas.length, 2, "l'idée est bien là après le renvoi");
});

check("boîte à idées : un dépôt ne laisse aucune trace dans l'état partagé (révision, date, identifiant d'action)", () => {
  const be = fresh();
  const before = be.data();
  const r = be.post(idea("a1", "idee-1", "Rien ne doit bouger"));
  equal(r.ok, true, "dépôt accepté");
  const after = be.data();
  equal([after.revision, after.updatedAt], [before.revision, before.updatedAt], "révision ou date avancée : l'heure du dépôt se lirait");
  equal(after.processedActionIds.indexOf("a1"), -1, "identifiant d'action retenu dans l'état");
  equal(r.revision, before.revision, "la réponse annonce une révision nouvelle");
  const batch = be.post([idea("a2", "idee-2", "En lot"), idea("a3", "idee-2", "En lot")]);
  equal(batch.results.map((x) => x.ok), [true, true], "lot accepté");
  equal(be.data().revision, before.revision, "un lot d'idées seules n'avance pas la révision");
  equal(boxOf(be).ideas.length, 2, "renvoi dans le même lot : compté une fois");
});

check("collecte : désactivée sans secret ; secret faux refusé ; export puis acquittement vident la boîte", () => {
  const be = fresh();
  be.post(idea("a1", "idee-1", "Première"));
  be.post(idea("a2", "idee-2", "Seconde"));
  equal(op(be, "ideas-export", { secret: SECRET }).code, "disabled", "sans propriété, la collecte est fermée");
  be.props.store.BRAINSTO_IDEAS_SECRET = "trop-court";
  equal(op(be, "ideas-export", { secret: "trop-court" }).code, "disabled", "un secret trop court ne l'ouvre pas");
  be.props.store.BRAINSTO_IDEAS_SECRET = SECRET;
  equal(op(be, "ideas-export", { secret: "faux" }).code, "auth", "secret faux");
  equal(op(be, "ideas-export", {}).code, "auth", "sans secret");
  const out = op(be, "ideas-export", { secret: SECRET });
  equal(out.ok, true, "export");
  equal(out.ideas.map((i) => i.text).sort(), ["Première", "Seconde"]);
  equal(op(be, "ideas-ack", { secret: SECRET, refs: [out.ideas[0].ref] }).removed, 1, "acquittement d'une idée");
  equal(op(be, "ideas-export", { secret: SECRET }).ideas.length, 1, "il en reste une");
  equal(op(be, "ideas-ack", { secret: SECRET, refs: ["inconnue"] }).removed, 0, "une référence inconnue ne retire rien");
  equal(op(be, "ideas-dump", { secret: SECRET }).code, "invalid", "opération inconnue");
  assert(JSON.stringify(op(be, "ideas-export", { secret: SECRET })).indexOf("revision") < 0, "la collecte n'expose jamais l'état");
});

/* ------------------------------------------------------------ Exécution --- */

const total = passed + failures.length;
if (failures.length) {
  console.error("\n" + failures.length + " test(s) en échec sur " + total + " :\n");
  failures.forEach((f) => console.error("  ✗ " + f));
  process.exit(1);
}
console.log("✓ " + passed + " tests réussis sur " + total + ".");
