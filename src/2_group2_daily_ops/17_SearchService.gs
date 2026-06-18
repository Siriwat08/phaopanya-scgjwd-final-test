/**
 * VERSION: 5.5.007
 * FILE: 17_SearchService.gs
 * LMDS V5.5 — Search Service (The Bridger — Group 2)
 * ===================================================
 * PURPOSE:
 *   สะพานเชื่อม Group 2 (ตารางงานประจำวัน) → Group 1 (Master Data)
 *   รับ ShipToName → ค้นหาพิกัดที่ดีที่สุด → เขียน LatLong_Actual
 *   [REDESIGN v5.4.003] ShipToName-Only Policy:
 *     - ShipToAddress ถูกลบออกจาก logic ทั้งหมด (ไม่น่าเชื่อถือ)
 *     - LatLong_SCG ถูกลบออกจาก logic ทั้งหมด (อิงจาก ShipToAddress)
 *     - AI Reasoning ถูกลบออก (ไม่เหมาะกับ production)
 *     - ถ้าหาไม่เจอ → คืน NOT_FOUND เว้นว่าง ไม่ fallback ใดๆ
 * ===================================================
 *   v5.5.007 (2026-06-18) — CACHE FIX (P0 + P1):
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
 *   v5.5.001 (2026-06-05) — Try-Catch + logDebug:
 *     - [FIX] runLookupEnrichment: เพิ่ม try-catch + flush progress เมื่อเกิด error
 *     - [FIX] lookupSingleRow: เปลี่ยน console.log → logDebug
 *   v5.4.003 (2026-06-04) — ShipToName-Only Policy:
 *     - [REDESIGN] findBestGeoByPersonPlace: signature (rawPerson, rawPlace, scgLatLng) → (rawPerson)
 *     - [REMOVE] Tier A (Person+Place) — ShipToAddress ไม่น่าเชื่อถือ
 *     - [REMOVE] Tier B (Place only) — ไม่ใช้ ShipToAddress
 *     - [REMOVE] Tier D (SCG API Fallback) — ใช้ ShipToAddress โดยอ้อม
 *     - [REMOVE] Tier E (AI Reasoning) — ไม่เหมาะ production
 *     - [KEEP] Tier 0: M_ALIAS Fast Track (fastLookupByShipToName)
 *     - [KEEP] Tier 1: resolvePerson → getDestsByPersonId (usage-dominant)
 *     - [REDESIGN] runLookupEnrichment: อ่านแค่ ShipToName
 *     - [REMOVE] countFallback, countScg — เหลือแค่ countFound/NotFound/Skipped
 *     - [REMOVE] lookupSingleRow: ลบ rawPlace, scgLatLng params
 *     - [REMOVE] callGeminiReasoning_ — ไม่ใช้แล้ว
 *   v5.4.001 (2026-05-24) — Single Writer Pattern:
 *     - [ADD] Tier 0 Fast Track via M_ALIAS (fastLookupByShipToName)
 *   v5.4.000 (2026-05-23):
 *     - [ADD] fastLookupByShipToName integration
 *   v5.2.012:
 *     - [ELEVATE] ยกระดับ personId (ShipToName) เป็นสมอหลักสูงสุด
 * ===================================================
 * DEPENDENCIES:
 *   REQUIRES (Load Order):
 *     - 01_Config.gs          (SHEET.DAILY_JOB, DATA_IDX.*, AI_CONFIG, APP_CONST)
 *     - 02_Schema.gs          (SCHEMA[SHEET.DAILY_JOB])
 *     - 05_NormalizeService.gs (normalizePersonNameFull)
 *     - 14_Utils.gs           (isValidLatLng, parseLatLng)
 *   CALLS (Invokes):
 *     - fastLookupByShipToName()          → 21_AliasService.gs (Tier 0 Fast Track)
 *     - resolvePerson()                   → 06_PersonService.gs
 *     - getDestsByPersonId()              → 09_DestinationService.gs
 *   EXPORTS TO:
 *     - 18_ServiceSCG.gs      (findBestGeoByPersonPlace, runLookupEnrichment)
 *   SHEETS ACCESSED:
 *     - SHEET.DAILY_JOB       (Read+Write: ShipToName→LatLong_Actual + color coding)
 *     - SHEET.M_ALIAS         (Read: Tier 0 Fast Track via fastLookupByShipToName)
 * ===================================================
 * ARCHITECTURE:
 *   ┌─────────────────────────────────────────────────────────────┐
 *   │  17_SearchService.gs (Group 2 Bridge — Coordinate Finder)   │
 *   │  ├── findBestGeoByPersonPlace(rawPerson) — ShipToName Only  │
 *   │  │   ├── Tier 0: M_ALIAS Fast Track                         │
 *   │  │   │   └── fastLookupByShipToName() → 21_AliasService     │
 *   │  │   ├── Tier 1: resolvePerson → getDestsByPersonId         │
 *   │  │   └── NOT_FOUND: เว้นว่าง — ไม่มี fallback               │
 *   │  ├── runLookupEnrichment() — Batch process daily job        │
 *   │  │   └── Color: Green #b6d7a8 / Red #f4cccc                 │
 *   │  └── lookupSingleRow() — Debug helper                       │
 *   └─────────────────────────────────────────────────────────────┘
 * ===================================================
 */

// ============================================================
// SECTION 1: findBestGeoByPersonPlace — ShipToName Only
// ============================================================

/**
 * findBestGeoByPersonPlace — ค้นหาพิกัดจาก ShipToName เท่านั้น
 * [REDESIGN v5.4.003] ShipToName-Only Policy:
 *   - ShipToAddress ถูกลบออกจาก logic ทั้งหมด (ไม่น่าเชื่อถือ)
 *   - LatLong_SCG ถูกลบออกจาก logic ทั้งหมด
 *   - ถ้าหาไม่เจอ → คืน NOT_FOUND เว้นว่าง ไม่ fallback ใดๆ
 *
 * Tier 0: ShipToName → M_ALIAS → masterUuid → dest → lat,lng (เร็วสุด)
 * Tier 1: ShipToName → resolvePerson() → getDestsByPersonId() (usage-dominant)
 * NOT_FOUND: เว้นว่าง LatLong_Actual
 *
 * @param {string} rawPerson - ShipToName จาก ตารางงานประจำวัน
 */
function findBestGeoByPersonPlace(rawPerson) {
  // Guard: ชื่อว่างหรือสั้นเกิน → NOT_FOUND ทันที
  if (!rawPerson || String(rawPerson).trim().length < 2) {
    return buildSearchResult_(null, null, 'NOT_FOUND', 0, null,
      'ShipToName ว่างหรือสั้นเกิน');
  }

  const cleanName = String(rawPerson).trim();

  // ─── Tier 0: M_ALIAS Fast Track ───────────────────────────────────
  // ShipToName → normalize → M_ALIAS reverse index → masterUuid → dest
  if (typeof fastLookupByShipToName === 'function') {
    const fastResult = fastLookupByShipToName(cleanName);
    if (fastResult && fastResult.lat != null && fastResult.lng != null) {
      return buildSearchResult_(
        fastResult.lat, fastResult.lng,
        'FOUND_ALIAS_FAST', fastResult.confidence, fastResult.destId,
        `M_ALIAS Fast Track: "${cleanName}"`
      );
    }
  }

  // ─── Tier 1: resolvePerson → M_DESTINATION ────────────────────────
  // ShipToName → normalize → M_PERSON candidate → usage-dominant dest
  const personResult = resolvePerson(cleanName);
  const personId     = personResult ? personResult.personId : null;

  if (personId) {
    const dests = getDestsByPersonId(personId)
      .sort((a, b) => (b.usageCount || 0) - (a.usageCount || 0));

    if (dests.length > 0) {
      const top = dests[0];
      return buildSearchResult_(
        top.lat, top.lng,
        'FOUND_DOMINANT', 90, top.destId,
        `Person match: "${cleanName}" → usageCount:${top.usageCount}`
      );
    }
  }

  // ไม่พบ — เว้นว่าง LatLong_Actual
  return buildSearchResult_(
    null, null,
    'NOT_FOUND', 0, null,
    `ไม่พบข้อมูล — ShipToName:"${cleanName}"`
  );
}

// [REMOVED v5.4.003] callGeminiReasoning_ — ลบแล้วตาม ShipToName-Only Policy
// AI Reasoning ไม่เหมาะกับ production — พิกัดที่ AI คาดเดาไม่น่าเชื่อถือ

/**
 * buildSearchResult_ — สร้าง Object ผลลัพธ์มาตรฐาน
 * [FIX v003] NOT_FOUND คืน lat:null, lng:null แทน 0,0
 */
function buildSearchResult_(lat, lng, status, confidence, destId, reason) {
  return {
    lat:        lat,        // null เมื่อ NOT_FOUND
    lng:        lng,        // null เมื่อ NOT_FOUND
    status:     status,
    confidence: confidence,
    destId:     destId,    // null ถ้าไม่มี Dest
    reason:     reason,
  };
}

// ============================================================
// SECTION 2: runLookupEnrichment — Batch Process (ShipToName Only)
// ============================================================

/**
 * runLookupEnrichment — วนทุกแถวใน ตารางงานประจำวัน
 * [REDESIGN v5.4.003] ShipToName-Only Policy:
 *   - อ่านเฉพาะ ShipToName เป็นหลักในการค้นหาพิกัด
 *   - ShipToAddress และ LatLong_SCG ถูกลบออกทั้งหมด
 *   - ผลลัพธ์: เจอ (เขียว) / ไม่เจอ (แดง) เท่านั้น
 *
 * [FIX v003] setBackground loop → setBackgrounds() Batch ทีเดียว
 * [FIX v003] existingLL check → parseLatLng + isValidLatLng
 * [ADD v003] Time Guard ป้องกัน Timeout
 */
function runLookupEnrichment() {
  const ss        = SpreadsheetApp.getActiveSpreadsheet();
  const sheet     = ss.getSheetByName(SHEET.DAILY_JOB);

  if (!sheet || sheet.getLastRow() < 2) {
    logWarn('SearchService', 'ตารางงานประจำวัน ว่างอยู่');
    return;
  }

  const startTime   = new Date();
  const timeLimit   = AI_CONFIG.TIME_LIMIT_MS || (5 * 60 * 1000);
  const totalRows   = sheet.getLastRow() - 1;
  const schemaLen   = SCHEMA[SHEET.DAILY_JOB].length;
  const allData     = sheet.getRange(2, 1, totalRows, schemaLen).getValues();

  // เตรียม Array สำหรับ Batch Write
  const latActualArr = [];  // [['13.xxx,100.xxx'], [''], ...]
  const bgColorArr   = [];  // [['#b6d7a8'], ['#f4cccc'], ...]

  let countFound    = 0;
  let countNotFound = 0;
  let countSkipped  = 0;
  let timedOut      = false;

  try {
    for (let i = 0; i < allData.length; i++) {
      // Time Guard
      if (new Date() - startTime > timeLimit) {
        logWarn('SearchService',
          `runLookupEnrichment: Time Guard หยุดที่แถว ${i + 1}/${totalRows}`);
        timedOut = true;
        break;
      }

      const r = lookupEnrichOneRow_(allData[i]);
      latActualArr.push(r.latActual);
      bgColorArr.push(r.bgColor);
      countFound    += r.found;
      countNotFound += r.notFound;
      countSkipped  += r.skipped;
    }
  } catch (err) {
    // [FIX v5.5.001] Flush progress ก่อน re-throw เพื่อไม่สูญเสียข้อมูลที่ประมวลผลแล้ว
    logError('SearchService', `runLookupEnrichment error ที่แถว ${latActualArr.length + 1}: ${err.message}`, err);
    // [REF-007] ใช้ flushLookupResults_() ร่วมกับ success path — ลด duplicate flush logic
    flushLookupResults_(sheet, latActualArr, bgColorArr, schemaLen, 'error-flush');
    throw err; // re-throw ให้ caller จัดการต่อ
  }

  // [FIX LAW-05 v5.4.003] ลบ dead padding code — เดิม pad '' แต่ไม่ได้เขียนแถวเกิน processedCount
  // จริงๆ แล้ว padding เหล่านี้ไม่ถูกใช้เพราะ slice(0, processedCount) อยู่
  // แถวที่ timeout ก่อนจะไม่ถูกเขียนทับ — ข้อมูลเดิมยังอยู่ในชีต

  // [REF-007] ใช้ flushLookupResults_() ร่วมกับ error path — ลด duplicate flush logic
  flushLookupResults_(sheet, latActualArr, bgColorArr, schemaLen, 'batch-write');

  const msg =
    `✅ จับคู่พิกัดเสร็จ\n` +
    `เจอ: ${countFound} | ไม่พบ: ${countNotFound} | ข้าม: ${countSkipped}` +
    (timedOut ? '\n⚠️ หยุดก่อนครบเพราะใกล้ Timeout — รันอีกครั้งเพื่อดำเนินการต่อ' : '');

  logInfo('SearchService', msg.replace(/\n/g, ' '));
  ss.toast(msg, APP_NAME, 8);

  // [FIX LAW-05 v5.4.003] ติดตั้ง auto-resume เมื่อ timeout เพื่อให้รันต่ออัตโนมัติ
  if (timedOut && typeof installAutoResume_ === 'function') {
    installAutoResume_('runLookupEnrichment');
  }
}

/**
 * lookupEnrichOneRow_ — processes 1 row for runLookupEnrichment
 * Extracts ShipToName, checks existing coords, calls findBestGeoByPersonPlace
 * @param {Array} row - single row from DAILY_JOB data
 * @return {{ latActual: Array, bgColor: Array, found: number, notFound: number, skipped: number }}
 */
function lookupEnrichOneRow_(row) {
  // [REDESIGN v5.4.003] อ่านเฉพาะ ShipToName — ShipToAddress/LatLong_SCG ไม่ใช้แล้ว
  const rawPerson  = String(row[DATA_IDX.SHIP_TO_NAME]  || '').trim();
  const existingLL = String(row[DATA_IDX.LATLNG_ACTUAL] || '').trim();

  // ตรวจ existingLL — ข้ามแถวที่มีพิกัดดีอยู่แล้ว
  if (existingLL) {
    const parsed = parseLatLng(existingLL);
    if (parsed && isValidLatLng(parsed.lat, parsed.lng)) {
      return { latActual: [existingLL], bgColor: [null], found: 0, notFound: 0, skipped: 1 };
    }
  }

  // ค้นหาพิกัดจาก ShipToName เท่านั้น
  const result   = findBestGeoByPersonPlace(rawPerson);
  let   outputLL = '';
  let   bgColor  = APP_CONST.COLOR_NOT_FOUND;

  switch (result.status) {
    case 'FOUND':
    case 'FOUND_DOMINANT':
    case 'FOUND_ALIAS_FAST':
      // หาเจอ → เติมพิกัด + สีเขียว
      outputLL = (result.lat != null && result.lng != null)
        ? `${result.lat},${result.lng}` : '';
      bgColor  = APP_CONST.COLOR_FOUND;
      return { latActual: [outputLL], bgColor: [bgColor], found: 1, notFound: 0, skipped: 0 };

    case 'NOT_FOUND':
    default:
      // หาไม่เจอ → เว้นว่าง + สีแดง (ให้คนขับเห็นว่ายังไม่มีข้อมูล)
      outputLL = '';
      bgColor  = APP_CONST.COLOR_NOT_FOUND;
      return { latActual: [outputLL], bgColor: [bgColor], found: 0, notFound: 1, skipped: 0 };
  }
}

// ============================================================
// SECTION 2b: flushLookupResults_ — [REF-007] Unified Flush Helper
// ============================================================

/**
 * flushLookupResults_ — [REF-007] เขียน latActual + backgroundColor ลงชีต
 * ทั้ง success path และ error path ใช้ helper นี้ร่วมกัน
 * ลด duplicate flush logic ที่เคยมีใน 2 ที่ (error catch + normal batch write)
 *
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet - DAILY_JOB sheet
 * @param {Array[]} latActualArr - array of [['lat,lng'], [''], ...]
 * @param {Array[]} bgColorArr - array of [['#color'], [null], ...]
 * @param {number} schemaLen - total columns in schema (for bgMatrix width)
 * @param {string} context - 'batch-write' (normal) or 'error-flush' (catch path)
 */
function flushLookupResults_(sheet, latActualArr, bgColorArr, schemaLen, context) {
  const processedCount = latActualArr.length;
  if (processedCount === 0) return;

  try {
    // Batch Write LatLong_Actual
    const latActualCol = DATA_IDX.LATLNG_ACTUAL + 1;
    sheet.getRange(2, latActualCol, processedCount, 1)
         .setValues(latActualArr.slice(0, processedCount));

    // Batch setBackgrounds
    const fullRowLen = schemaLen;
    const bgMatrix   = bgColorArr.slice(0, processedCount)
      .map(colorRow => {
        if (!colorRow[0]) return Array(fullRowLen).fill(null);
        return Array(fullRowLen).fill(colorRow[0]);
      });

    sheet.getRange(2, 1, processedCount, fullRowLen)
         .setBackgrounds(bgMatrix);

    if (context === 'error-flush') {
      logInfo('SearchService', `Flushed ${processedCount} rows before re-throw`);
    }
  } catch (flushErr) {
    const label = context === 'error-flush' ? 'Flush ล้มเหลว' : 'batch write ล้มเหลว';
    logError('SearchService', `runLookupEnrichment ${label}: ${flushErr.message}`, flushErr);
  }
}

// ============================================================
// SECTION 3: lookupSingleRow — Debug Helper (ShipToName Only)
// ============================================================

/**
 * lookupSingleRow — ค้นหาพิกัดสำหรับ 1 แถว (ทดสอบ)
 * [REDESIGN v5.4.003] ShipToName-Only: ลบ rawPlace, scgLatLng params
 */
function lookupSingleRow(rowNumber) {
  // [FIX R12] เพิ่ม try-catch — entry point ต้องมี error handling
  try {
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET.DAILY_JOB);
  if (!sheet || rowNumber < 2) return null;

  const rowData   = sheet.getRange(rowNumber, 1, 1,
                     SCHEMA[SHEET.DAILY_JOB].length).getValues()[0];
  const rawPerson = String(rowData[DATA_IDX.SHIP_TO_NAME] || '').trim();
  // ShipToAddress และ LatLong_SCG ถูกลบออกตาม ShipToName-Only Policy

  const result = findBestGeoByPersonPlace(rawPerson);

  logDebug('SearchService',
    `Row ${rowNumber} → Status:${result.status} ` +
    `(${result.confidence}%) lat:${result.lat} lng:${result.lng} — ` +
    `Reason: ${result.reason}`
  );

  return result;

  } catch (e) {
    logError('SearchService', 'lookupSingleRow ล้มเหลว: ' + e.message, e);
    return null;
  }
}
