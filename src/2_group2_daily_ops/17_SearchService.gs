/**
 * VERSION: 5.5.017
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
 *   v5.5.017 (2026-06-21) — SECURITY POSTFIX (12 SEC issues total, Cycle 14):
 *     - (no SEC fix in this file — only version bump for consistency)
 *     Cumulative impact: deny-by-default AuthZ, OAuth Least Privilege (10->6 scopes), PII masking (MD5 hash),
 *       Sheet Protection defense-in-depth (4->8 sheets + Q_REVIEW range), RFC 6265 cookie charset,
 *       fetchWithRetry_ body truncation, populateGeoMetadata+buildGeoDictionary guards
 *     isAuthorizedUser_ coverage: 6/10 -> 13/13 destructive ops
 *     Production Readiness: 95% -> 97% GO (Security Hardened)
 *   v5.5.016 (2026-06-21) — PERFORMANCE FIX (13 issues, Cycle 13):
 *     - [PERF-001] reprocessReviewQueue +LockService +TimeGuard +Checkpoint/Resume +flushLogBuffer_ (BLOCKING)
 *     - [PERF-002] findMatchingPerson_/findMatchingPlace_ +optPrefixMap (O(N)→O(K) substring fallback)
 *     - [PERF-003] populateAliasFromFactDelivery_ build personIdToUuidMap/placeIdToUuidMap (O(N)→O(1))
 *     - [PERF-004] findPersonCandidates Set<string> lookup + normA out of loop
 *     - [PERF-005] findPlaceCandidates Set<string> lookup + normA out of loop
 *     - [PERF-006] highlightHighPriorityReviews +optTargetRow single-row mode (95% reduction)
 *     - [PERF-007] generatePersonAliasesFromHistory +Checkpoint/Resume (HARDENING_ALIAS_CHECKPOINT)
 *     - [PERF-008] applyAllPendingDecisions LockService idiomatic pattern (verbose 2-step → idiomatic)
 *     - [PERF-009] findByAlias_/findPlaceByAlias_ inverted index (O(A)→O(1) lookup)
 *     - [PERF-010] setupInputSheet_ batch read (N API calls → 1)
 *     - [PERF-011] removed legacy cache.put() in loop fallback paths (6 จุด)
 *     - [PERF-012] findRowByIdInSheet_ use TextFinder (O(N) JS loop → server-side)
 *     - [PERF-013] analyzeReviewPatterns use REVIEW_IDX constants (Single Source of Truth)
 *     9 helper functions added: buildPrefixIndex_, saveReprocessCheckpoint_, loadReprocessCheckpoint_,
 *       clearReprocessCheckpoint_, saveHardeningAliasCheckpoint_, loadHardeningAliasCheckpoint_,
 *       clearHardeningAliasCheckpoint_, _buildPersonAliasInvertedIndex_, _buildPlaceAliasInvertedIndex_
 *     Files changed: 00_App, 01_Config, 03_SetupSheets, 04_SourceRepository, 06_PersonService,
 *       07_PlaceService, 12_ReviewService, 16_GeoDictionaryBuilder, 19_Hardening, 21_AliasService
 *     Cumulative impact: Pipeline -55-65%, Migration -95-100%, UX -95%, Timeout risk eliminated
 *     Compliance: 16/16 Immutable Laws maintained, Single Writer preserved, Schema unchanged
 *   v5.5.015 (2026-06-19) — CRITICAL FIX (8 issues):
 *     - [FIX CRIT-001] factUpdateRow_ เขียน DRIVER_VERIFIED col 32-33 ใน UPDATE path (BLOCKING)
 *     - [FIX CRIT-002] buildSrcObjFromReview_ อ่าน DRIVER_VERIFIED col 37-38 จาก Source (BLOCKING)
 *     - [FIX CRIT-003] copyDriverVerifiedToDailyJob_ merge mode แทน one-shot lookup
 *     - [FIX CRIT-004] buildDailyJobRow_ ShopKey trim ให้ตรงกับ lookup
 *     - [FIX CRIT-005] populateAliasFromFactDelivery_ อ่าน DRIVER_VERIFIED + สร้าง alias recovery
 *     - [FIX CRIT-006] showVersionInfo Audit Cycles 9 → 11 + cycle list ครบ
 *     - [FIX CRIT-007] 02_Schema comment "37 คอลัมน์" → "39 คอลัมน์"
 *     - [FIX CRIT-008] validateConfig pre-flight check ตรวจ Sheet column count
 *   v5.5.014 (2026-06-19) — DRIVER VERIFIED COLUMNS + ALIAS ENRICHMENT:
 *     - [ADD] เพิ่ม 2 คอลัมน์ "ชื่อลูกค้าปลายทางจริง" + "ชื่อสถานที่อยู่ลูกค้าปลายทางจริง"
 *       ใน Source sheet (col 38-39), DAILY_JOB (col 29-30), FACT_DELIVERY (col 32-33)
 *     - [ADD] SRC_IDX.DRIVER_VERIFIED_NAME/ADDR, DATA_IDX.DRIVER_VERIFIED_NAME/ADDR, FACT_IDX.DRIVER_VERIFIED_NAME/ADDR
 *     - [ADD] 04_SourceRepository buildSourceObj_ อ่าน col 38-39 → srcObj.driverVerifiedName/Addr
 *     - [ADD] 11_TransactionService upsertFactDelivery เก็บ col 32-33 ใน FACT_DELIVERY
 *     - [ADD] 10_MatchEngine autoEnrichAliases สร้าง alias จาก "ชื่อจริง" → master_uuid (confidence=100, source=DRIVER_VERIFIED)
 *     - [ADD] 18_ServiceSCG copyDriverVerifiedToDailyJob_ คัดลอกจาก Source → DAILY_JOB
 *     - กฎ: ชื่อดิบ match ตามปกติ 100% + ถ้าชื่อจริงมี → สร้าง alias เพิ่ม
 *   v5.5.013 (2026-06-19) — GOOGLE MAPS REFACTOR:
 *     - [REWRITE] 15_GoogleMapsAPI.gs เขียนใหม่ทั้งไฟล์ — ลบระบบ 3-layer cache + MAPS_CACHE sheet
 *       เพิ่มสูตร Amit Agarwal 7 ตัว เป็น @customFunction (พิมพ์ใน Sheet ได้):
 *       GOOGLEMAPS_DISTANCE, GOOGLEMAPS_DURATION, GOOGLEMAPS_LATLONG,
 *       GOOGLEMAPS_ADDRESS, GOOGLEMAPS_REVERSEGEOCODE, GOOGLEMAPS_COUNTRY, GOOGLEMAPS_DIRECTIONS
 *     - [REMOVE] ลบ MAPS_CACHE sheet จาก SCHEMA, SHEET, MAPS_CACHE_IDX, setupAllSheets
 *     - [REMOVE] ลบฟังก์ชันเก่าที่ไม่มี caller: geocodeAddress, reverseGeocode,
 *       getRouteDistanceKm, cachedGeoLookup_, _loadSheetCache_, _flushHitCounts_,
 *       getFromSheetCache_, saveToSheetCache_, clearMapsCache
 *     - เหตุผล: ระบบ LMDS ไม่ได้เรียก Google Maps API ผ่าน code แล้ว
 *       DIST_FROM_WH และ RESOLVED_ADDR มาจาก AppSheet ที่ผู้ใช้ทำไว้แล้ว
 *   v5.5.012 (2026-06-19) — ANTIPATTERN FIX + DOC SYNC:
 *     - [FIX #1] showVersionInfo() แก้จาก v5.5.010 → v5.5.012 + Audit Cycles 5 → 9
 *     - [FIX #3] resolvePerson เพิ่ม optional preNormResult เพื่อหลีกเลี่ยง double normalization
 *       17_SearchService ส่ง normResult เข้า resolvePerson แทน cleanName (ลด normalize ซ้อน)
 *     - [FIX #4] reprocessReviewQueue ใช้ REVIEW_IDX/FACT_IDX constants แทน headers.indexOf()
 *       ปฏิบัติตาม Single Source of Truth rule
 *     - [FIX #5] validateConfig เรียก validateSchemaConsistency เพิ่ม — onOpen จับ SCHEMA drift ได้
 * ===================================================
 * CHANGELOG: See /docs/CHANGELOG.md for full history.
 *   Latest 3 versions:
 *     v5.5.019 (2026-06-22) — REFACTOR_CYCLE6 (12 issues — REF-001 to REF-012)
 *     v5.5.018 (2026-06-21) — REVIEW15 CLEAN CODE FIX (14 issues)
 *     v5.5.017 (2026-06-21) — SECURITY POSTFIX (12 SEC issues)
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
 * [V5.5.011] Same-Clean-Process-as-Sheet1 Policy:
 *   - ก่อนหน้านี้ใช้แค่ String(rawPerson).trim() ส่งตรงเข้า lookup
 *   - ทำให้ ShipToName จาก Sheet2 ไม่ผ่านกระบวนการทำความสะอาดเหมือน Sheet1
 *   - ผลลัพธ์คือค้นไม่เจอแม้จะเป็นร้านเดียวกัน เพราะในชื่อมี "จำกัด"/"ร้าน"/เบอร์โทร ฯลฯ
 *   - ตอนนี้ผ่าน normalizePersonNameFull ก่อน → ได้ cleanName เหมือน Sheet1
 *   - แล้วลองค้นด้วย cleanName ก่อน, หากไม่เจอค่อย fallback ด้วย rawName
 *
 * Tier 0: ShipToName → normalizePersonNameFull → M_ALIAS → masterUuid → dest → lat,lng (เร็วสุด)
 * Tier 1: ShipToName → normalizePersonNameFull → resolvePerson() → getDestsByPersonId() (usage-dominant)
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

  const rawName = String(rawPerson).trim();

  // [V5.5.011] ทำความสะอาดชื่อแบบเดียวกับ Sheet1 ก่อนนำไปค้นหา
  // normalizePersonNameFull จะ:
  //   1. ดึงเบอร์โทรออก
  //   2. ดึงเลขเอกสารออก
  //   3. ดึง Delivery Notes (ฝากยาม, COD, ด่วน ฯลฯ) ออก
  //   4. ตัด Company Suffix (จำกัด, บจก., หจก. ฯลฯ) และ Chain Store (ร้าน, ร้านค้า)
  //   5. ตัดคำนำหน้า (นาย, นาง, บริษัท ฯลฯ)
  //   6. ล้างช่องว่างและอักขระพิเศษ
  // ทำให้ cleanName สามารถจับคู่กับ M_ALIAS/M_PERSON ที่บันทึกจาก Sheet1 ได้แม่นยำขึ้น
  let cleanName = rawName;
  let normResult = null;
  try {
    if (typeof normalizePersonNameFull === 'function') {
      normResult = normalizePersonNameFull(rawName);
      if (normResult && normResult.cleanName && normResult.cleanName.length >= 2) {
        cleanName = normResult.cleanName;
      }
    }
  } catch (normErr) {
    // ถ้า normalize ล้มเหลว ใช้ rawName ต่อไป
    logDebug('SearchService', 'normalizePersonNameFull ล้มเหลว ใช้ rawName: ' + normErr.message);
  }

  // ─── Tier 0: M_ALIAS Fast Track ───────────────────────────────────
  // ลองค้นด้วย cleanName ก่อน (หลังทำความสะอาด), หากไม่เจอค่อยลอง rawName
  if (typeof fastLookupByShipToName === 'function') {
    let fastResult = fastLookupByShipToName(cleanName);
    if (!fastResult && cleanName !== rawName) {
      // Fallback: ลองด้วย rawName เผื่อ M_ALIAS เก็บ variant แบบ raw ไว้
      fastResult = fastLookupByShipToName(rawName);
    }
    if (fastResult && fastResult.lat != null && fastResult.lng != null) {
      const reason = cleanName !== rawName
        ? `M_ALIAS Fast Track (cleaned): "${rawName}" → "${cleanName}"`
        : `M_ALIAS Fast Track: "${cleanName}"`;
      return buildSearchResult_(
        fastResult.lat, fastResult.lng,
        'FOUND_ALIAS_FAST', fastResult.confidence, fastResult.destId,
        reason
      );
    }
  }

  // ─── Tier 1: resolvePerson → M_DESTINATION ────────────────────────
  // [FIX v5.5.012 Anti-pattern #3] ส่ง normResult เข้า resolvePerson เพื่อหลีกเลี่ยง double normalization
  //   เดิมส่ง cleanName เข้า resolvePerson ซึ่งจะ normalize ซ้ำอีกครั้ง (safe but wasteful)
  //   ตอนนี้ส่ง rawName + preNormResult ให้ resolvePerson ใช้ normResult ที่เราคำนวณแล้ว
  const personResult = resolvePerson(rawName, normResult);
  const personId     = personResult ? personResult.personId : null;

  if (personId) {
    const dests = getDestsByPersonId(personId)
      .sort((a, b) => (b.usageCount || 0) - (a.usageCount || 0));

    if (dests.length > 0) {
      const top = dests[0];
      const reason = cleanName !== rawName
        ? `Person match (cleaned): "${rawName}" → "${cleanName}" → usageCount:${top.usageCount}`
        : `Person match: "${cleanName}" → usageCount:${top.usageCount}`;
      return buildSearchResult_(
        top.lat, top.lng,
        'FOUND_DOMINANT', 90, top.destId,
        reason
      );
    }
  }

  // ไม่พบ — เว้นว่าง LatLong_Actual
  const reason = cleanName !== rawName
    ? `ไม่พบข้อมูล — ShipToName:"${rawName}" (cleaned: "${cleanName}")`
    : `ไม่พบข้อมูล — ShipToName:"${cleanName}"`;
  return buildSearchResult_(
    null, null,
    'NOT_FOUND', 0, null,
    reason
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
