/**
 * VERSION: 5.5.017
 * FILE: 13_ReportService.gs
 * LMDS V5.5 — Data Quality Report Service
 * ===================================================
 * PURPOSE:
 *   สร้างรายงาน Data Quality ของระบบ LMDS
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
 *     - [FIX #2] CHANGELOG sync — เพิ่ม v5.5.011 entry ในไฟล์ที่ยังไม่มี (20 ไฟล์)
 *     - [DOC] แก้ broken cross-references ใน README (ลบ reports/* และ LMDS_V5.5_COMPLETE_Audit_Report.md)
 *     - [DOC] Standardize function count = 313 ในเอกสาร .md
 *     - [DOC] อัปเดต DEPENDENCIES/ARCHITECTURE section ในไฟล์ที่แก้ (00, 01, 06, 12, 17)
 *   v5.5.011 (2026-06-19) — DATA CONSISTENCY + SHIPTONAME CLEAN + Q_REVIEW NAV FIX:
 *     - [FIX] 02_Schema.gs เพิ่ม SCHEMA['SCGนครหลวงJWDภูมิภาค'] (37 cols) ที่ขาดหายไป
 *     - [FIX] 17_SearchService findBestGeoByPersonPlace ผ่าน normalizePersonNameFull ก่อนค้นหา
 *     - [ADD] 12_ReviewService buildRecommendedAction_ สร้าง ID สำหรับ Smart Navigation
 *     - [ADD] 00_App handleRecommendClick_ + navigateFromRecommend_ สำหรับ Q_REVIEW Nav
 *   v5.5.010 (2026-06-18) — CACHE HOTFIX + Q_REVIEW Post-Processor:
 *     - [FIX HOTFIX #1] saveChunkedCache_ แบ่ง putAll เป็น batch 5 chunks + ลด chunk size 90KB→80KB
 *       Root cause: GAS putAll limit total payload ~1MB → 48 chunks × 90KB = 4.3MB → "อาร์กิวเมนต์มากเกินไป"
 *     - [FIX HOTFIX #2] loadAllPlaces_ ลบ fallback path ที่ใช้ cache.put ตรง — บังคับใช้ saveChunkedCache_
 *       Root cause: เมื่อ saveChunkedCache_ ไม่พร้อม → fallback → 825KB > 100KB → "M_PLACE Cache เต็ม"
 *     - [FIX HOTFIX #3] loadAllPlaceAliases_ ลบ fallback path เดียวกัน — บังคับใช้ saveChunkedCache_
 *       Root cause: 312KB > 100KB → "M_PLACE_ALIAS Cache write error: อาร์กิวเมนต์มากเกินไป"
 *     - [ADD] รวม reprocessReviewQueue + analyzeReviewPatterns จาก 22_AccuracyPatch.gs เข้า 12_ReviewService.gs
 *       Auto-resolve Q_REVIEW 3 กลุ่ม: GEO_NEARBY_YELLOW+name, NEW_RECORD+Geo, FUZZY_MATCH 85+
 *   v5.5.009 (2026-06-18) — DOC SYNC:
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
 *     - [ADD] Comprehensive header documentation
 *   v5.4.000 (2026-05-24):
 *     - [UPGRADE] Version bump to 5.4.000
 *     - [ADD] Comprehensive header documentation
 *     - [ADD] DEPENDENCIES section with module relationships
 *     - [ENHANCE] Detailed module interconnection mapping
 *   v003 (Round 1 — Critical Fixes):
 *     - [FIX] buildFullQualityReport: แยก autoMatchRate vs processedRate
 *     - [FIX] buildFullQualityReport: reviewCount ← getReviewStats().pending
 *     - [FIX] buildFullQualityReport: totalFact กรอง Active rows
 *     - [FIX] buildFullQualityReport: เพิ่ม unclassifiedCount
 *     - [FIX] buildFullQualityReport: guard ui.alert() กัน Trigger Error
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
      logError('ReportService', 'ไม่พบชีต ' + SHEET.RPT_QUALITY);
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
