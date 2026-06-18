/**
 * VERSION: 5.5.009
 * FILE: 06_PersonService.gs
 * LMDS V5.5 — Person Master Service
 * ===================================================
 * PURPOSE:
 *   จัดการ Master Person — ฐานข้อมูลชื่อลูกค้า/ผู้รับสินค้า
 *   เป็น Single Source of Truth สำหรับข้อมูลบุคคล
 * ===================================================
 *   v5.5.009 (2026-06-18) — DOC SYNC:
 *     - [DOC] อัปเดต DEPENDENCIES section ใน 12 ไฟล์ให้สะท้อน V5.5.007/V5.5.008 cache changes
 *     - [DOC] อัปเดต ARCHITECTURE section ใน 12 ไฟล์ให้สะท้อน cache architecture ใหม่
 *     - [DOC] อัปเดตเอกสาร .md ทั้ง 23 ไฟล์ให้เป็น V5.5.008 (post-CACHE-CLEANUP)
 *     - [DOC] เพิ่ม audit cycle 6-8 ใน README/BLUEPRINT history tables
 *     - [DOC] เพิ่ม section "V5.5.007 + V5.5.008 — CACHE FIX & CLEANUP (15 issues)" ใน README
 *     - [SYNC] Canonical values: 8 audit cycles, 68 issues fixed, 196 helper functions
 *   v5.5.008 (2026-06-18) — CACHE CLEANUP (P2):
 *     - [FIX P2 #10] clearMapsCache flush _MAPS_SHEET_HIT_DIRTY ก่อนล้าง (รักษา analytics)
 *     - [FIX P2 #11] เพิ่ม flushLogBuffer_() ใน finally ของ 5 entry points
 *       (runLoadSource, buildGeoDictionary, MIGRATION_HybridAliasSystem, populateGeoMetadata, runPreflightAudit)
 *     - [FIX P2 #12] ลบ redundant manual cache nulling ใน populateGeoMetadata ใช้ invalidate*Cache_* แทน
 *     - [FIX P2 #13] saveChunkedCache_ ล้าง orphaned chunks เมื่อขนาดข้อมูลลดลง (large→small)
 *     - [FIX P2 #14] getCachedDistricts_ write-back to cache on miss (consistent with getCachedProvinces_)
 *     - [CONFIRM P2 #15] TH_GEO_POSTCODE chunk size byte-based ใน primary path (V5.5.007 แก้แล้ว)
 *   v5.5.007 (2026-06-18) — CACHE FIX (P0 + P1):
 *     - [FIX P0 #1] invalidateAllGlobalCaches() ล้าง RAM cache ครบ 11 ตัว (เดิม 6/11)
 *     - [FIX P0 #2] invalidateGeoDictCache() ล้าง _GLOBAL_GEO_DICT_SEARCH_KEY_INDEX
 *     - [FIX P0 #3] applyAllPendingDecisions เพิ่ม invalidateSameDayDestCache_ + autoEnrichAliases
 *     - [FIX P0 #4] migrateStep1_AssignUuid_ ใช้ invalidateChunkedCache_ แทน raw removeAll
 *     - [ADD P1 #5] invalidateGeoLatLngCache_ ใน TransactionService + เรียกจาก GeoService
 *     - [FIX P1 #6] M_PLACE_ALL/M_PLACE_ALIAS_ALL แปลงเป็น chunked cache (saveChunkedCache_)
 *     - [FIX P1 #7] 4 chunked writers ใช้ centralized saveChunkedCache_ (putAll 5-10× เร็วขึ้น)
 *     - [ADD P1 #8] CACHE_KEY ขยายจาก 2 → 13 keys (Single Source of Truth)
 *     - [ADD P1 #9] safeCacheGet_/safeCachePut_/safeCacheRemoveAll_ helpers ใน 14_Utils
 *   v5.5.006 (2026-06-18) — Consistency Sync:
 *     - [SYNC] All 22 files version bump 5.5.004 → 5.5.006 (12_ReviewService from 5.5.005)
 *     - [SYNC] Documentation consistency: line count 13,831, function count 310
 *     - [SYNC] Standardized all metadata claims across .gs and .md files (53 issues fixed)
 *   v5.5.004 (2026-06-15) — full sync cycle:
 *     - [SYNC] All 22 files version bump 5.5.003 → 5.5.004
 *     - [SYNC] Documentation audit: 28 inconsistencies fixed
 *   v5.5.003 (2026-06-12) — post-REFACTOR sync:
 *     - [SYNC] Version header V5.4 → V5.5, VERSION → 5.5.003
 *     - [SYNC] CHANGELOG entries added for 5 Audit Cycles
 *   v5.5.002 (2026-06-11) — CRITICAL Fix Cycle (8 issues):
 *     - [FIX] CRIT-001 through CRIT-008 — see CRITICAL audit report
 *     - [FIX] RAM Cache, Safe Batching, Checkpoint+Resume enhancements
 *   v5.5.001 (2026-06-04) — 22-file bug fix + RAM Cache:
 *     - [FIX] 22 files updated — bug fixes per CRITICAL/PERFORMANCE audits
 *     - [ADD] RAM Cache layer (_SOURCE_ROWS_RAM_CACHE, _MAPS_SHEET_CACHE)
 *     - [ADD] SearchKey, safeUiAlert_, JSON.parse guard
 *   v5.4.001 (2026-05-24) — Single Writer Pattern:
 *     - [REMOVE] createPerson: ลบ createGlobalAlias() — M_ALIAS เขียนที่ autoEnrich เท่านั้น
 *     - [REMOVE] createPersonAlias: ลบ createGlobalAlias() — ไม่ต้อง sync ย้อนไป M_ALIAS
 *     - [KEEP] mergePersonRecords: ยังเรียก createGlobalAlias() (ADMIN_MERGE_ACT — Admin Action)
 *   v5.4.000 (2026-05-23):
 *     - [ADD] Comprehensive header documentation
 *     - [ADD] DEPENDENCIES section with module relationships
 *   v5.2.001 (PH2 Hardening):
 *     - [FIX] createPerson: เก็บ note แบบ join(",") ตามคำสั่ง
 * ===================================================
 * DEPENDENCIES:
 *   REQUIRES (Load Order):
 *     - 01_Config.gs          (SHEET.M_PERSON, PERSON_IDX.*, AI_CONFIG)
 *     - 02_Schema.gs          (SCHEMA[SHEET.M_PERSON], SCHEMA[SHEET.M_PERSON_ALIAS])
 *     - 03_SetupSheets.gs     (logDebug, logWarn, logError)
 *     - 05_NormalizeService.gs (normalizePersonNameFull, normalizeForCompare)
 *     - 14_Utils.gs           (generateShortId, generateUUID, diceCoefficient, levenshteinDistance)
 *   CALLS (Invokes):
 *     - resolveMasterUuidViaGlobalAlias() → 21_AliasService.gs (findPersonCandidates)
 *     - convertUuidToPersonId()           → 21_AliasService.gs (findPersonCandidates)
 *     - createGlobalAlias()               → 21_AliasService.gs (mergePersonRecords ONLY — Admin Action)
 *   EXPORTS TO:
 *     - 10_MatchEngine.gs     (resolvePerson, createPerson, updatePersonStats, loadAllPersons_)
 *     - 11_TransactionService.gs (loadAllPersons_)
 *     - 17_SearchService.gs   (loadAllPersons_)
 *     - 19_Hardening.gs       (loadAllPersons_)
 *     - 21_AliasService.gs    (loadAllPersons_ — UUID converters)
 *   SHEETS ACCESSED:
 *     - SHEET.M_PERSON        (Read+Write: CRUD, Stats update)
 *     - SHEET.M_PERSON_ALIAS  (Read+Write: Alias lookup, createPersonAlias)
 * ===================================================
 * ARCHITECTURE:
 *   ┌─────────────────────────────────────────────────────────────┐
 *   │  06_PersonService.gs (Person Master Hub)                   │
 *   │  ├── resolvePerson()        — Match/resolve person        │
 *   │  ├── findPersonCandidates() — Multi-strategy search       │
 *   │  │   ├── M_ALIAS Fast Path (resolveMasterUuidViaGlobalAlias)│
 *   │  │   ├── Phone Match                                       │
 *   │  │   ├── Alias Match (M_PERSON_ALIAS)                      │
 *   │  │   ├── Phonetic / Name Match                             │
 *   │  │   └── Note Search (Deep Match)                          │
 *   │  ├── scorePersonCandidate() — Score calculation            │
 *   │  ├── createPerson()         — Create new person record    │
 *   │  ├── createPersonAlias()    — Add alternate name          │
 *   │  ├── mergePersonRecords()   — Merge duplicates (Admin)    │
 *   │  ├── updatePersonStats()    — Update usage statistics     │
 *   │  └── loadAllPersons_()      — Load all persons (cached)   │
 *   └─────────────────────────────────────────────────────────────┘
 * ===================================================
 */

// [PERF-010] Note Inverted Index — Map: word → Set<personId> สำหรับค้นหา Note แบบ O(1)
var _PERSON_NOTE_INVERTED_INDEX = null;

// ============================================================
// SECTION 1: resolvePerson
// ============================================================

/**
 * resolvePerson — ค้นหาหรือประเมินบุคคลจากชื่อดิบ
 */
function resolvePerson(rawName) {
  const normResult = normalizePersonNameFull(rawName);
  const cleanName  = normResult.cleanName;

  if (!cleanName || cleanName.length < 2) {
    return { personId: null, status: 'LOW_QUALITY', confidence: 0, normResult };
  }

  const candidates = findPersonCandidates(cleanName, normResult.extractedPhone);

  if (candidates.length === 0) {
    return { personId: null, status: 'NOT_FOUND', confidence: 0, normResult };
  }

  let bestPerson = null;
  let bestScore  = 0;

  candidates.forEach(candidate => {
    // [UPGRADE v5.1.001] ส่งข้อมูลว่า match ด้วยเบอร์โทรหรือไม่
    const score = scorePersonCandidate(cleanName, candidate, normResult.extractedPhone);
    if (score > bestScore) {
      bestScore  = score;
      bestPerson = candidate;
    }
  });

  if (bestScore >= AI_CONFIG.THRESHOLD_AUTO) {
    return { personId: bestPerson.personId, status: 'FOUND',
             confidence: bestScore, normResult };
  }
  if (bestScore >= AI_CONFIG.THRESHOLD_REVIEW) {
    return { personId: bestPerson.personId, status: 'NEEDS_REVIEW',
             confidence: bestScore, normResult };
  }
  return { personId: null, status: 'NOT_FOUND', confidence: bestScore, normResult };
}

// ============================================================
// SECTION 2: findPersonCandidates
// ============================================================

/**
 * findPersonCandidates — ค้นหา Candidate จาก M_PERSON
 * [FIX v003] Object reference bug: includes → .some(p => p.personId===)
 * [FIX v003] Phone match > 1 → ไปต่อ scoring แทน return ทันที
 * [FIX v003] Phonetic fallback substring(0,2) → (0,3)
 */
function findPersonCandidates(cleanName, phone) {
  const allPersons = loadAllPersons_();
  const results    = [];

  const aliasResolve = typeof resolveMasterUuidViaGlobalAlias === 'function' ? resolveMasterUuidViaGlobalAlias(cleanName, 'PERSON') : null;
  if (aliasResolve && aliasResolve.masterUuid && aliasResolve.score >= 95) {
    const ownerId = convertUuidToPersonId(aliasResolve.masterUuid);
    const perfect = allPersons.find(p => p.personId === ownerId);
    if (perfect) return [perfect];
  }

  // --- 1. Phone Match ---
  if (phone) {
    const cleanPhone = phone.replace(/[^0-9]/g, '');
    const byPhone    = allPersons.filter(p => {
      const stored = String(p.phone || '').replace(/[^0-9]/g, '');
      return stored === cleanPhone && stored.length >= 9;
    });

    if (byPhone.length === 1) {
      // [FIX v003] เจอ 1 คน → return เลย (confident)
      return byPhone;
    }
    if (byPhone.length > 1) {
      // [FIX v003] เจอหลายคน → เพิ่มเข้า results แล้วไปต่อ scoring
      byPhone.forEach(p => {
        if (!results.some(r => r.personId === p.personId)) results.push(p);
      });
    }
  }

  // --- 2. Alias Match ---
  const aliasMatches = findByAlias_(cleanName);
  aliasMatches.forEach(personId => {
    const found = allPersons.find(p => p.personId === personId);
    // [FIX v003] ใช้ .some() แทน .includes() กัน object reference bug
    if (found && !results.some(r => r.personId === found.personId)) {
      results.push(found);
    }
  });

  // --- 3. Phonetic / Name Match ---
  const searchKey = buildThaiPhoneticKey(cleanName);
  allPersons.forEach(person => {
    if (results.some(r => r.personId === person.personId)) return;
    const personKey = buildThaiPhoneticKey(person.normalized);

    if (searchKey && personKey && searchKey === personKey) {
      results.push(person);
    } else {
      // [FIX v003] Fallback 3 ตัวอักษร แทน 2 (ลด false positive)
      const normA = normalizeForCompare(cleanName);
      const normB = normalizeForCompare(person.normalized);
      if (normA.length >= 3 && normB.length >= 3 &&
          normB.startsWith(normA.substring(0, 3))) {
        results.push(person);
      }
    }
  });

  // --- 4. Note Search (Deep Match) — [PERF-010] ใช้ Inverted Index แทน O(N×M) scan ---
  if (results.length === 0) {
    var queryParts = cleanName.split(/\s+/).filter(function(p) { return p.length >= 2; });
    // ใช้ _PERSON_NOTE_INVERTED_INDEX ถ้ามี — ลดจาก O(N×M) เหลือ O(M)
    if (_PERSON_NOTE_INVERTED_INDEX && Object.keys(_PERSON_NOTE_INVERTED_INDEX).length > 0) {
      var matchingPersonIds = new Set();
      queryParts.forEach(function(part) {
        var key = part.toLowerCase();
        var personIdSet = _PERSON_NOTE_INVERTED_INDEX[key];
        if (personIdSet) {
          personIdSet.forEach(function(pid) { matchingPersonIds.add(pid); });
        }
      });
      matchingPersonIds.forEach(function(pid) {
        var found = allPersons.find(function(p) { return p.personId === pid; });
        if (found) results.push(found);
      });
    } else {
      // Fallback: ถ้ายังไม่มี index ใช้วิธีเดิม
      allPersons.forEach(function(person) {
        var noteStr = String(person.note || '');
        if (!noteStr) return;
        var isMatch = queryParts.some(function(part) { return noteStr.includes(part); });
        if (isMatch) results.push(person);
      });
    }
  }

  return results;
}

/**
 * findByAlias_ — ค้นหา Person ID จาก M_PERSON_ALIAS
 * [FIX v003] ใช้ Set กัน duplicate
 */
function findByAlias_(cleanName) {
  const allAliases = loadAllAliases_();
  const targetNorm = normalizeForCompare(cleanName);
  const foundSet   = new Set();

  allAliases.forEach(alias => {
    if (!alias[PERSON_ALIAS_IDX.ACTIVE_FLAG]) return;
    const aliasNorm = normalizeForCompare(alias[PERSON_ALIAS_IDX.ALIAS_NAME]);
    if (aliasNorm === targetNorm && aliasNorm.length > 0) {
      foundSet.add(String(alias[PERSON_ALIAS_IDX.PERSON_ID]));
    }
  });

  return [...foundSet];
}

// ============================================================
// SECTION 3: Scoring
// ============================================================

/**
 * scorePersonCandidate — คำนวณคะแนน Match
 * [UPGRADE v5.1.001] เพิ่ม Phone Match Bonus = 95
 */
function scorePersonCandidate(queryName, candidate, queryPhone) {
  // 1. ตรวจสอบ Phone Match ก่อน (โบนัส 95 คะแนน)
  if (queryPhone && candidate.phone) {
    const p1 = String(queryPhone).replace(/[^0-9]/g, '');
    const p2 = String(candidate.phone).replace(/[^0-9]/g, '');
    if (p1 === p2 && p1.length >= 9) return 95;
  }

  const nameA = normalizeForCompare(queryName);
  const nameB = normalizeForCompare(candidate.normalized || candidate.canonical);

  if (!nameA || !nameB) return 0;

  const levDist   = levenshteinDistance(nameA, nameB);
  const maxLen    = Math.max(nameA.length, nameB.length);
  const levScore  = maxLen > 0 ? Math.max(0, (1 - levDist / maxLen) * 100) : 0;
  const diceScore = diceCoefficient(nameA, nameB) * 100;
  const ratioScore = nameA === nameB ? 100 :
    (nameA.includes(nameB) || nameB.includes(nameA)) ? 80 : 0;

  let finalScore;
  if (nameA.length < 4) {
    finalScore = levScore * 0.6 + diceScore * 0.2 + ratioScore * 0.2;
  } else {
    finalScore = diceScore * 0.5 + levScore * 0.3 + ratioScore * 0.2;
  }

  // [FIX v003] ใช้ Config แทน hardcode 60
  return finalScore < AI_CONFIG.SCORE_MIN_THRESHOLD ? 0 : Math.round(finalScore);
}

// ============================================================
// SECTION 4: CRUD
// ============================================================

/**
 * createPerson — สร้างบุคคลใหม่ใน M_PERSON
 */
function createPerson(normResult) {
  try {
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET.M_PERSON);
  const now   = new Date();
  const newId = generateShortId('P');

  const phoneStr = normResult.extractedPhone
    ? "'" + normResult.extractedPhone : '';

  // [FIX v5.2.002] รวบรวม Note ทั้งหมด (Phone, Doc, Prefix)
  const allNotes = normResult.deliveryNotes || [];

  const universalMasterId = typeof generateUUID === 'function' ? generateUUID() : generateShortId('UID');

  const newRow = [
    newId,
    normResult.cleanName,
    normalizeForCompare(normResult.cleanName),
    phoneStr,
    now, now, 1,
    APP_CONST.STATUS_ACTIVE,
    allNotes.join(','),
    universalMasterId,
  ];

  // [FIX-05 v5.4.003] ใช้ getRange+setValues แทน appendRow เพื่อความเสถียร
  const lastRow = sheet.getLastRow();
  sheet.getRange(lastRow + 1, 1, 1, newRow.length).setValues([newRow]);
  invalidatePersonCache_();
  logDebug('PersonService', `createPerson: ${newId} — ${normResult.cleanName}`);

  // [REMOVED v5.4.001] ไม่เรียก createGlobalAlias() — M_ALIAS เขียนที่ autoEnrich เท่านั้น (Single Writer)
  // autoEnrichAliasesFromFactBatch_() จะเขียน canonical+variant เข้า M_ALIAS เอง

  return newId;
  } catch (err) {
    // [FIX B3 v5.5.002] เพิ่ม try-catch ตาม Rule 12
    logError('PersonService', `createPerson ล้มเหลว: ${err.message}`, err);
    return null;
  }
}

/**
 * createPersonAlias — เพิ่มชื่อสำรองให้บุคคล
 */
function createPersonAlias(personId, aliasName, matchScore) {
  try {
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET.M_PERSON_ALIAS);
  const newId = generateShortId('PA');

  // [FIX-05 v5.4.003] ใช้ getRange+setValues แทน appendRow
  const aliasRow = [newId, personId, aliasName, matchScore || 0, new Date(), true];
  const aliasLastRow = sheet.getLastRow();
  sheet.getRange(aliasLastRow + 1, 1, 1, aliasRow.length).setValues([aliasRow]);
  invalidateAliasCache_();
  logDebug('PersonService', `createPersonAlias: ${aliasName} → ${personId}`);

  // [REMOVED v5.4.001] ไม่เรียก createGlobalAlias() — M_ALIAS เขียนที่ autoEnrich เท่านั้น (Single Writer)
  } catch (err) {
    // [FIX B3 v5.5.002] เพิ่ม try-catch ตาม Rule 12
    logError('PersonService', `createPersonAlias ล้มเหลว: ${err.message}`, err);
  }
}

/**
 * updatePersonStats — อัปเดต last_seen และ usage_count
 * [FIX v003] โหลดเฉพาะ person_id column + guard idCol === -1
 */
function updatePersonStats(personId) {
  if (!personId) return;
  try {
    const ss      = SpreadsheetApp.getActiveSpreadsheet();
    const sheet   = ss.getSheetByName(SHEET.M_PERSON);
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return;

    // [FIX v003] โหลดเฉพาะคอลัมน์ person_id (col 1) แทนทั้งชีต
    const idCol      = PERSON_IDX.PERSON_ID + 1;
    const idData     = sheet.getRange(2, idCol, lastRow - 1, 1).getValues();
    let targetRow    = -1;

    for (let i = 0; i < idData.length; i++) {
      if (String(idData[i][0]).trim() === personId) {
        targetRow = i + 2;
        break;
      }
    }

    if (targetRow === -1) {
      logWarn('PersonService', `updatePersonStats: ไม่พบ personId ${personId}`);
      return;
    }

    const lastSeenCol   = PERSON_IDX.LAST_SEEN   + 1;
    const usageCountCol = PERSON_IDX.USAGE_COUNT  + 1;

    // [FIX v5.4.003] Batch write: อ่านทั้ง 2 คอลัมน์ → แก้ใน RAM → เขียนทีเดียว
    // ลดจาก 3 API calls เหลือ 1+1 = 2 API calls
    const statsRange = sheet.getRange(targetRow, lastSeenCol, 1, 2);
    const statsVals  = statsRange.getValues();
    const currCount  = Number(statsVals[0][1]) || 0;
    statsVals[0][0] = new Date();
    statsVals[0][1] = currCount + 1;
    statsRange.setValues(statsVals);
    invalidatePersonCache_();

  } catch (err) {
    // [FIX LAW-13 v5.4.003] ส่ง err object เพื่อให้ stack trace เข้า SYS_LOG
    logError('PersonService', `updatePersonStats ล้มเหลว: ${err.message}`, err);
  }
}

/**
 * mergePersonRecords — Merge บุคคล 2 คนให้เป็น 1
 * [FIX v003] aliasName ใช้ canonical name ของ sourceId ไม่ใช่ sourceId เอง
 * [FIX v003] เพิ่ม guard idCol === -1
 * [FIX v003] comment "ห้ามลบ" แก้จาก "ห้างลบ"
 */
function mergePersonRecords(sourceId, targetId) {
  try {
    const ss    = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(SHEET.M_PERSON);
    // [FIX B1 v5.5.002] Math.min guard: ป้องกัน Range error ถ้า sheet มีคอลัมน์น้อยกว่า SCHEMA
    const colsToRead = Math.min(SCHEMA[SHEET.M_PERSON].length, sheet.getLastColumn());
    const data  = sheet.getRange(1, 1, sheet.getLastRow(), colsToRead).getValues();
    // [FIX v5.5.001] Use PERSON_IDX constants consistently instead of headers.indexOf()
    const idCol   = PERSON_IDX.PERSON_ID;
    const statCol = PERSON_IDX.STATUS;
    const noteCol = PERSON_IDX.NOTE;
    const canCol  = PERSON_IDX.CANONICAL;

    let sourceCanonical = sourceId; // fallback
    let targetMasterUuid = '';

    for (let i = 1; i < data.length; i++) {
      const rowPersonId = String(data[i][idCol]);
      if (rowPersonId === targetId && PERSON_IDX.MASTER_UUID < data[i].length) {
        targetMasterUuid = String(data[i][PERSON_IDX.MASTER_UUID] || '');
      }
      if (rowPersonId !== sourceId) continue;

      const targetRow = i + 1;

      // [FIX v003] ดึง canonical_name ของ source ก่อน merge
      if (data[i][canCol]) {
        sourceCanonical = String(data[i][canCol]);
      }

      // [FIX v003] ห้ามลบ — เปลี่ยน Status เป็น Merged แทน
      // [FIX S5 v5.5.002] Batch write: 2x setValue → 1x setValues (Rule 11)
      const mergeRange = sheet.getRange(targetRow, statCol + 1, 1, 2);
      const mergeNote = `Merged → ${targetId} on ${toThaiDateStr(new Date())}`;
      mergeRange.setValues([[APP_CONST.STATUS_MERGED, mergeNote]]);
      break;
    }

    // [FIX v003] สร้าง Alias ด้วย canonical_name ของ source ไม่ใช่ sourceId
    createPersonAlias(targetId, sourceCanonical, 100);
    if (typeof createGlobalAlias === 'function' && targetMasterUuid) {
      createGlobalAlias(targetMasterUuid, sourceCanonical, 'PERSON', 100, 'ADMIN_MERGE_ACT');
    }
    invalidatePersonCache_();
    logInfo('PersonService', `mergePersonRecords: ${sourceId} → ${targetId}`);

  } catch (err) {
    logError('PersonService', `mergePersonRecords ล้มเหลว: ${err.message}`, err);
    throw err;
  }
}

// ============================================================
// SECTION 5: Data Loaders (with Cache)
// ============================================================

function loadAllPersons_() {
  const cacheKey = 'M_PERSON_ALL';
  const cache    = CacheService.getScriptCache();
  // [PERF-004] ลองอ่าน chunked cache ก่อน
  const cachedData = loadChunkedCache_(cache, cacheKey);
  if (cachedData) return cachedData;

  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET.M_PERSON);
  if (!sheet || sheet.getLastRow() < 2) return [];

  // [FIX v5.4.001] ใช้ Math.min เพื่อป้องกัน Range error เมื่อชีตมีคอลัมน์น้อยกว่า SCHEMA
  // (กรณีชีตเก่าที่ยังไม่มี master_uuid column)
  const colsToRead = Math.min(SCHEMA[SHEET.M_PERSON].length, sheet.getLastColumn());
  const rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, colsToRead).getValues();

  const result = rows
    .filter(r => r[PERSON_IDX.PERSON_ID])
    .filter(r => r[PERSON_IDX.STATUS] !== APP_CONST.STATUS_ARCHIVED &&
                 r[PERSON_IDX.STATUS] !== APP_CONST.STATUS_MERGED)
    .map(r => ({
      personId:   String(r[PERSON_IDX.PERSON_ID]),
      canonical:  String(r[PERSON_IDX.CANONICAL]  || ''),
      normalized: String(r[PERSON_IDX.NORMALIZED] || ''),
      phone:      String(r[PERSON_IDX.PHONE]       || '').replace(/^'/, ''),
      usageCount: Number(r[PERSON_IDX.USAGE_COUNT] || 0),
      note: String(r[PERSON_IDX.NOTE] || ''),
      masterUuid: String(r[PERSON_IDX.MASTER_UUID] || ''),
    }));

  // [PERF-010] สร้าง Note Inverted Index — Map: word → Set<personId>
  var noteIndex = {};
  result.forEach(function(p) {
    var noteStr = String(p.note || '').trim();
    if (!noteStr) return;
    // แยกคำจาก note โดยใช้ whitespace + common delimiters
    var words = noteStr.split(/[\s,;|\/\-]+/).filter(function(w) { return w.length >= 2; });
    words.forEach(function(word) {
      var key = word.toLowerCase();
      if (!noteIndex[key]) noteIndex[key] = new Set();
      noteIndex[key].add(p.personId);
    });
  });
  _PERSON_NOTE_INVERTED_INDEX = noteIndex;

  // [PERF-004] Chunked cache — แบ่งข้อมูลเป็น chunk ละ 200 items เพื่อไม่ให้เกิน 100KB limit
  saveChunkedCache_(cache, cacheKey, result);
  return result;
}

function loadAllAliases_() {
  const cacheKey = 'M_PERSON_ALIAS_ALL';
  const cache    = CacheService.getScriptCache();
  // [PERF-004] ลองอ่าน chunked cache ก่อน
  const cachedData = loadChunkedCache_(cache, cacheKey);
  if (cachedData) return cachedData;

  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET.M_PERSON_ALIAS);
  if (!sheet || sheet.getLastRow() < 2) return [];

  // [FIX v5.4.001] ใช้ Math.min เพื่อป้องกัน Range error
  const colsToRead = Math.min(SCHEMA[SHEET.M_PERSON_ALIAS].length, sheet.getLastColumn());
  const rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, colsToRead).getValues();
  // [PERF-004] Chunked cache — แบ่งข้อมูลเป็น chunk ละ 200 items
  saveChunkedCache_(cache, cacheKey, rows);
  return rows;
}

/**
 * batchUpdatePersonStats_ — [PERF-001] [REF-009] Batch stats update สำหรับ Person
 * Delegated to batchUpdateEntityStats_() in 14_Utils.gs — thin wrapper
 * @param {Set<string>} personIds - Set of person IDs to update
 */
function batchUpdatePersonStats_(personIds) {
  batchUpdateEntityStats_(SHEET.M_PERSON, PERSON_IDX, PERSON_IDX.PERSON_ID, PERSON_IDX.USAGE_COUNT, PERSON_IDX.LAST_SEEN, personIds, invalidatePersonCache_);
}

/**
 * invalidatePersonCache_ — [REF-011] Uses centralized invalidateChunkedCache_
 */
function invalidatePersonCache_() {
  invalidateChunkedCache_('M_PERSON_ALL', function() { _PERSON_NOTE_INVERTED_INDEX = null; });
}
/**
 * invalidateAliasCache_ — [REF-011] Uses centralized invalidateChunkedCache_
 */
function invalidateAliasCache_() {
  invalidateChunkedCache_('M_PERSON_ALIAS_ALL');
}

// ============================================================
// SECTION 6: [PERF-004] [REF-010] Chunked Cache Helpers
// MOVED to 14_Utils.gs (saveChunkedCache_, loadChunkedCache_)
// These functions are now centralized in 14_Utils.gs Section 9.
// Callers in this file use saveChunkedCache_() / loadChunkedCache_()
// which resolve to the global functions in 14_Utils.gs.
// ============================================================
