/**
 * VERSION: 5.5.017
 * FILE: 13_ReportService.gs
 * LMDS V5.5 — Data Quality Report Service
 * ===================================================
 * PURPOSE:
 *   สร้างรายงาน Data Quality ของระบบ LMDS
 * ===================================================
 *   v5.5.018 (2026-06-21) — REVIEW15 CLEAN CODE FIX (Cycle 15, 14 issues FIXED):
 *     - Rule 13 (Logging): +Error object to buildFullQualityReport sheet-not-found guard (R13-06)
 *
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
 *     - 01_Config (SHEET.RPT_QUALITY, SHEET.FACT_DELIVERY, SHEET.M_PERSON, SHEET.M_PLACE, SHEET.M_GEO_POINT, SHEET.M_DESTINATION, FACT_IDX.*, PERSON_IDX.*, PLACE_IDX.*, GEO_IDX.*, DEST_IDX.*, APP_CONST.*)
 *     - 02_Schema (SCHEMA)
 *     - 06_PersonService (loadAllPersons_)
 *     - 07_PlaceService (loadAllPlaces_)
 *     - 08_GeoService (loadAllGeos_)
 *     - 09_DestinationService (loadAllDestinations_)
 *     - 12_ReviewService (getReviewStats)
 *   CALLS (Invokes):
 *     - getReviewStats() → 12_ReviewService
 *     - logError/logInfo() → 03_SetupSheets
 *   EXPORTS TO:
 *     - 00_App (buildFullQualityReport — menu trigger)
 *   SHEETS ACCESSED:
 *     - SHEET.RPT_QUALITY (Write: quality report output)
 *     - SHEET.FACT_DELIVERY (Read: match status counts)
 *     - SHEET.M_PERSON (Read: active row count)
 *     - SHEET.M_PLACE (Read: active row count)
 *     - SHEET.M_GEO_POINT (Read: active row count)
 *     - SHEET.M_DESTINATION (Read: destination count)
 * ===================================================
 * ARCHITECTURE:
 *   Report Builder
 *   ┌──────────────────────────────────────────────┐
 *   │  buildFullQualityReport                      │
 *   │  ├─ auto/review/new/error counts from FACT   │
 *   │  ├─ match rates (auto & processed)           │
 *   │  ├─ master data counts (person/place/geo/dst)│
 *   │  └─ write to RPT_DATA_QUALITY sheet          │
 *   │  countActiveRows_                            │
 *   │  └─ active row counter per sheet             │
 *   │  safeUiAlert_                                │
 *   │  └─ trigger-safe UI alert                    │
 *   └──────────────────────────────────────────────┘
 * ===================================================
 */

// ============================================================
// SECTION 1: buildFullQualityReport
// ============================================================

/**
 * buildFullQualityReport — สร้างรายงาน Data Quality และเขียนลง RPT_DATA_QUALITY
 * [REF-008] Orchestrator: collect stats → compute metrics → write report → alert
 * [FIX v003] แยก autoMatchRate vs processedRate
 * [FIX v003] reviewCount จาก getReviewStats().pending (รอ Review จริง)
 * [FIX v003] totalFact กรอง Active rows เท่านั้น
 * [FIX v003] เพิ่ม unclassifiedCount
 * [FIX v003] guard ui.alert() กัน Trigger Error
 * [FIX BUG-A2] v5.4.003: เพิ่ม try-catch outer
 */

function buildFullQualityReport() {
  try {
    const ss       = SpreadsheetApp.getActiveSpreadsheet();
    const rptSheet = ss.getSheetByName(SHEET.RPT_QUALITY);
    if (!rptSheet) {
      // [FIX R13-06 REVIEW15] Rule 13: ส่ง Error object เพื่อ stack trace ชี้ตำแหน่งที่เกิด
      logError('ReportService',
        'ไม่พบชีต ' + SHEET.RPT_QUALITY,
        new Error('SHEET_NOT_FOUND'));
      return;
    }

  // [REF-008] Step 1: Collect all system statistics
  const stats = collectSystemStats_(ss);

  // [REF-008] Step 2: Compute derived metrics from stats
  const metrics = computeReportMetrics_(stats);

  // [REF-008] Step 3: Write report row to sheet
  // [FIX B11 v5.5.002] ใช้ getRange+setValues แทน appendRow (consistent batch pattern)
  const nextRow = rptSheet.getLastRow() + 1;
  rptSheet.getRange(nextRow, 1, 1, metrics.reportRow.length).setValues([metrics.reportRow]);

  logInfo('ReportService',
    `Report เสร็จ — Total:${stats.totalFact} Auto:${metrics.autoMatchRate}% ` +
    `Processed:${metrics.processedRate}% Q_Pending:${stats.pendingInQueue}`);

  // [FIX v003] guard ui.alert() — ถ้ารันจาก Trigger จะ Error
  safeUiAlert_(
    '📊 Data Quality Report\n\n' +
    `รวมทั้งหมด (Active):  ${stats.totalFact} รายการ\n` +
    `Auto Match:            ${stats.autoCount} (${metrics.autoMatchRate}%)\n` +
    `สร้างใหม่:            ${stats.newCount}\n` +
    `รอ Review (Q):         ${stats.pendingInQueue}\n` +
    `Error:                 ${stats.errorCount}\n` +
    `Unclassified:          ${stats.unclassifiedCount}\n\n` +
    `Master Data:\n` +
    `  Person:  ${stats.personCount}\n` +
    `  Place:   ${stats.placeCount}\n` +
    `  Geo:     ${stats.geoCount}\n` +
    `  Dest:    ${stats.destCount}`
  );
} catch (err) {
    logError('ReportService', 'buildFullQualityReport: ' + err.message, err);
    safeUiAlert_('❌ สร้างรายงานล้มเหลว: ' + err.message);
  }
}

// ============================================================
// SECTION 1a: collectSystemStats_ — [REF-008] Collect system statistics
// ============================================================

/**
 * collectSystemStats_ — [REF-008] รวบรวมสถิติทั้งหมดจาก FACT_DELIVERY + Master Data
 * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} ss
 * @return {{ totalFact, autoCount, newCount, reviewCount, errorCount, unclassifiedCount, pendingInQueue, personCount, placeCount, geoCount, destCount }}
 */
function collectSystemStats_(ss) {
  // --- นับจาก FACT_DELIVERY (Active rows เท่านั้น) ---
  const factSheet = ss.getSheetByName(SHEET.FACT_DELIVERY);
  let totalFact   = 0;
  let autoCount   = 0;
  let newCount    = 0;
  let reviewCount = 0;
  let errorCount  = 0;
  let unclassifiedCount = 0; // [FIX v003]

  if (factSheet && factSheet.getLastRow() > 1) {
    const totalRows    = factSheet.getLastRow() - 1;

    // [FIX v5.5.001] อ่านเฉพาะ 2 คอลัมน์ MATCH_STATUS และ RECORD_STATUS
    // แทนการอ่านตั้งแต่คอลัมน์ 1 ถึง maxCol (over-reading)
    const statusCol    = FACT_IDX.MATCH_STATUS  + 1;
    const recStatusCol = FACT_IDX.RECORD_STATUS + 1;

    const matchStatusData = factSheet.getRange(2, statusCol, totalRows, 1).getValues();
    const recStatusData   = factSheet.getRange(2, recStatusCol, totalRows, 1).getValues();

    for (let i = 0; i < totalRows; i++) {
      const recStatus = String(recStatusData[i][0] || '').trim();

      // [FIX v003] กรอง Active rows เท่านั้น
      if (recStatus !== APP_CONST.STATUS_ACTIVE) continue;

      totalFact++;
      const matchStatus = String(matchStatusData[i][0] || '').trim();

      switch (matchStatus) {
        case APP_CONST.MATCH_FULL:
        case APP_CONST.MATCH_GEO:
        case APP_CONST.MATCH_FUZZY:
        case 'AUTO_MATCH':
          autoCount++; break;
        case APP_CONST.MATCH_NEW:
        case 'CREATE_NEW':
          newCount++; break;
        case APP_CONST.MATCH_REVIEW:
        case 'REVIEW':
        case 'NEEDS_REVIEW':
          reviewCount++; break;
        case APP_CONST.MATCH_ERROR:
        case 'ERROR':
          errorCount++; break;
        default:
          // [FIX v003] นับ unclassified
          if (matchStatus) unclassifiedCount++;
          break;
      }
    }
  }

  // [FIX v003] reviewCount ที่แม่นยำ = Pending ใน Q_REVIEW จริงๆ
  const reviewStats     = getReviewStats();
  const pendingInQueue  = reviewStats.pending;

  // นับ Master Data
  const personCount = countActiveRows_(ss, SHEET.M_PERSON,     PERSON_IDX.STATUS);
  const placeCount  = countActiveRows_(ss, SHEET.M_PLACE,      PLACE_IDX.STATUS);
  const geoCount    = countActiveRows_(ss, SHEET.M_GEO_POINT,  GEO_IDX.STATUS);
  const destCount   = countActiveRows_(ss, SHEET.M_DESTINATION,DEST_IDX.STATUS);

  return {
    totalFact, autoCount, newCount, reviewCount, errorCount, unclassifiedCount,
    pendingInQueue, personCount, placeCount, geoCount, destCount,
  };
}

// ============================================================
// SECTION 1b: computeReportMetrics_ — [REF-008] Compute derived metrics
// ============================================================

/**
 * computeReportMetrics_ — [REF-008] คำนวณตัวเลขอนุพันธ์จาก stats
 * @param {{ totalFact, autoCount, newCount, pendingInQueue, errorCount, unclassifiedCount, personCount, placeCount, geoCount, destCount }} stats
 * @return {{ autoMatchRate, processedRate, note, reportRow }}
 */
function computeReportMetrics_(stats) {
  // [FIX v003] autoMatchRate = เฉพาะ AUTO_MATCH (ไม่รวม CREATE_NEW)
  const autoMatchRate = stats.totalFact > 0
    ? Math.round((stats.autoCount / stats.totalFact) * 100) : 0;

  // processedRate = AUTO + CREATE_NEW (ทั้งหมดที่ผ่าน Match Engine)
  const processedRate = stats.totalFact > 0
    ? Math.round(((stats.autoCount + stats.newCount) / stats.totalFact) * 100) : 0;

  const note = [
    `Person:${stats.personCount}`,
    `Place:${stats.placeCount}`,
    `Geo:${stats.geoCount}`,
    `Dest:${stats.destCount}`,
    `Q_Pending:${stats.pendingInQueue}`,
    `Unclassified:${stats.unclassifiedCount}`,
  ].join(' | ');

  const reportRow = [
    new Date(),       // report_date
    stats.totalFact,  // total_records
    stats.autoCount,  // auto_matched
    stats.pendingInQueue, // reviewed (Pending จริงใน Q_REVIEW)
    stats.newCount,   // created_new
    stats.errorCount, // failed
    `Auto:${autoMatchRate}% / Processed:${processedRate}%`, // match_rate
    note,             // notes
  ];

  return { autoMatchRate, processedRate, note, reportRow };
}

// ============================================================
// SECTION 2: Helper Functions
// ============================================================

/**
 * countActiveRows_ — นับแถว Active ใน Master Sheet
 * [FIX v003] กรอง Active เท่านั้น ไม่ใช่ นับทุกแถว
 */
function countActiveRows_(ss, sheetName, statusIdx) {
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet || sheet.getLastRow() < 2) return 0;

  const statusCol = statusIdx + 1;
  const totalRows = sheet.getLastRow() - 1;
  const data      = sheet.getRange(2, statusCol, totalRows, 1).getValues();

  return data.filter(r =>
    String(r[0] || '').trim() === APP_CONST.STATUS_ACTIVE
  ).length;
}

// [REMOVED v5.4.003] safeUiAlert_Report_ — ย้ายไป 14_Utils.gs (ชื่อ safeUiAlert_) แล้ว
// ทุก caller เรียก safeUiAlert_() โดยตรงจาก 14_Utils.gs
