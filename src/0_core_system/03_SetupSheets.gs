/**
 * VERSION: 5.5.015
 * FILE: 03_SetupSheets.gs
 * LMDS V5.5 — Sheet Setup & Configuration Service
 * ===================================================
 * PURPOSE:
 *   สร้างโครงสร้างชีตเริ่มต้นทั้งหมดในระบบ LMDS
 *   เป็น Single Source of Truth สำหรับโครงสร้าง Spreadsheet
 * ===================================================
 *   v5.5.015 (2026-06-19) — CRITICAL FIX (8 issues):
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
 *     - [ADD] M_ALIAS sheet creation in setupGroupOneSheets_() after M_PLACE_ALIAS
 *   v5.4.000 (2026-05-23):
 *     - [ADD] Comprehensive header documentation
 *   v5.2.014 (PH2):
 *     - [FIX] setupInputSheet_: จัดโครงสร้างชีต Input เป็นฟอร์มแนวตั้ง
 *   v5.2.008 (PH2 Hardening):
 *     - [ADD] Auto-Repair headers if columns are missing
 *     - [FIX] ทุก SCHEMA.xxx → getSheetHeaders(SHEET.xxx)
 * ===================================================
 * DEPENDENCIES:
 *   REQUIRES (Load Order):
 *     - 01_Config.gs     (SHEET.*, REVIEW_IDX, SCHEMA_VERSION)
 *     - 02_Schema.gs     (SCHEMA, getSheetHeaders, validateSheetHeaders)
 *   CALLS (Invokes):
 *     - validateSchemaConsistency() → 02_Schema.gs
 *     - generateShortId()          → 14_Utils.gs
 *   EXPORTS TO:
 *     - 00_App.gs          (setupAllSheets trigger)
 *     - All Service files  (getSheetByName — sheets must exist first)
 *   SHEETS ACCESSED (Write — Creates all sheets):
 *     - SHEET.M_PERSON, M_PERSON_ALIAS, M_PLACE, M_PLACE_ALIAS, M_ALIAS
 *     - SHEET.M_GEO_POINT, M_DESTINATION, FACT_DELIVERY, Q_REVIEW
 *     - SHEET.RPT_QUALITY, MAPS_CACHE
 *     - SHEET.DAILY_JOB, INPUT, EMPLOYEE
 *     - SHEET.OWNER_SUMMARY, SHIPMENT_SUM
 *     - SHEET.SYS_LOG, SYS_CONFIG, SYS_TH_GEO
 *   SHARED FUNCTIONS (Exported):
 *     - logInfo(), logWarn(), logError(), logDebug() — Used by ALL modules
 * ===================================================
 * ARCHITECTURE:
 *   ┌─────────────────────────────────────────────────────────────┐
 *   │  03_SetupSheets.gs (Sheet Bootstrapper + System Logger)    │
 *   │  ├── setupAllSheets()      — Create all required sheets    │
 *   │  │   ├── setupGroupOneSheets_() — Master + Fact + Alias    │
 *   │  │   ├── setupGroupTwoSheets_() — Daily Ops                │
 *   │  │   └── setupSystemSheets_()   — SYS_LOG, SYS_CONFIG     │
 *   │  ├── createSheetIfMissing_() — Create sheet + validate     │
 *   │  ├── setupReviewDropdowns_() — Q_REVIEW dropdowns          │
 *   │  ├── setupInputSheet_()      — Vertical form layout        │
 *   │  └── logInfo/Warn/Error/Debug — System Logger (shared)     │
 *   └─────────────────────────────────────────────────────────────┘
 * ===================================================
 */

// ============================================================
// MODULE-LEVEL GUARD: prevent clearOldLogs_() recursion
// (logInfo → writeLog_ → clearOldLogs_ → logInfo → …)
// ============================================================
let _isClearingOldLogs_ = false;

// [PERF-012] Log Buffer — สะสม log entries ใน RAM แล้ว flush เป็น batch ทุก 50 entries
var _LOG_BUFFER = [];
var _LOG_BUFFER_LIMIT = 50;

// ============================================================
// SECTION 1: setupAllSheets — Entry Point
// ============================================================

/**
 * setupAllSheets — สร้างชีตทั้งหมดที่จำเป็น
 * [ADD v003] LockService กัน setup ซ้ำซ้อน
 */
function setupAllSheets() {
  // [SEC-002] Authorization Guard
  if (typeof isAuthorizedUser_ === 'function' && !isAuthorizedUser_()) {
    safeUiAlert_('🔒 คุณไม่มีสิทธิ์สร้าง/แก้ไขชีต\nกรุณาติดต่อ Admin');
    return;
  }
  const lock = LockService.getScriptLock();

  if (!lock.tryLock(5000)) {
    // [FIX BUG-04 v5.5.001] เปลี่ยน ui.alert() เป็น safeUiAlert_()
    safeUiAlert_('⚠️ Setup กำลังทำงานอยู่แล้ว\nกรุณารอให้เสร็จก่อน');
    return;
  }

  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    ss.toast('🏗️ กำลังตรวจสอบและสร้างชีตทั้งหมด...', APP_NAME, -1);

    setupGroupOneSheets_(ss);
    setupGroupTwoSheets_(ss);
    setupSystemSheets_(ss);

    // ตรวจสอบ Schema หลัง Setup
    try {
      validateSchemaConsistency();
    } catch (e) {
      // [FIX BUG-04 v5.5.001] เปลี่ยน ui.alert() เป็น safeUiAlert_()
      safeUiAlert_(`⚠️ Schema Warning:\n${e.message}`);
    }

    ss.toast('✅ Setup เสร็จสมบูรณ์!', APP_NAME, 5);
    // [FIX BUG-04 v5.5.001] เปลี่ยน ui.alert() เป็น safeUiAlert_()
    safeUiAlert_(
      '✅ Setup เสร็จสมบูรณ์!\n\n' +
      'ชีตที่ถูกสร้าง/ตรวจสอบ:\n' +
      Object.values(SHEET).map(n => `  • ${n}`).join('\n')
    );

  } catch (err) {
    logError('SetupSheets', `setupAllSheets ล้มเหลว: ${err.message}`, err);
    // [FIX BUG-04 v5.5.001] เปลี่ยน ui.alert() เป็น safeUiAlert_()
    safeUiAlert_(`❌ Setup ล้มเหลว:\n${err.message}`);
    throw err;
  } finally {
    lock.releaseLock();
  }
}

// ============================================================
// SECTION 2: Group 1 — Master Data Sheets
// ============================================================

function setupGroupOneSheets_(ss) {
  // [FIX v003] ทุก call ใช้ getSheetHeaders(SHEET.xxx) แทน SCHEMA.xxx
  createSheetIfMissing_(ss, SHEET.M_PERSON,
    getSheetHeaders(SHEET.M_PERSON));

  createSheetIfMissing_(ss, SHEET.M_PERSON_ALIAS,
    getSheetHeaders(SHEET.M_PERSON_ALIAS));

  createSheetIfMissing_(ss, SHEET.M_PLACE,
    getSheetHeaders(SHEET.M_PLACE));

  createSheetIfMissing_(ss, SHEET.M_PLACE_ALIAS,
    getSheetHeaders(SHEET.M_PLACE_ALIAS));

  // [NEW v5.4.000] สร้างชีต M_ALIAS สำหรับ Hybrid Alias Architecture
  createSheetIfMissing_(ss, SHEET.M_ALIAS,
    getSheetHeaders(SHEET.M_ALIAS));

  createSheetIfMissing_(ss, SHEET.M_GEO_POINT,
    getSheetHeaders(SHEET.M_GEO_POINT));

  createSheetIfMissing_(ss, SHEET.M_DESTINATION,
    getSheetHeaders(SHEET.M_DESTINATION));

  createSheetIfMissing_(ss, SHEET.FACT_DELIVERY,
    getSheetHeaders(SHEET.FACT_DELIVERY));

  createSheetIfMissing_(ss, SHEET.Q_REVIEW,
    getSheetHeaders(SHEET.Q_REVIEW));

  createSheetIfMissing_(ss, SHEET.RPT_QUALITY,
    getSheetHeaders(SHEET.RPT_QUALITY));

  // [REMOVE v5.5.013] MAPS_CACHE sheet ไม่ถูกสร้างอีกต่อไป — ไม่ได้ใช้ใน pipeline

  logInfo('SetupSheets', 'Group 1 Sheets เสร็จสิ้น');
}

// ============================================================
// SECTION 3: Group 2 — Daily Ops Sheets
// ============================================================

function setupGroupTwoSheets_(ss) {
  createSheetIfMissing_(ss, SHEET.DAILY_JOB,
    getSheetHeaders(SHEET.DAILY_JOB));

  setupInputSheet_(ss);

  createSheetIfMissing_(ss, SHEET.EMPLOYEE,
    getSheetHeaders(SHEET.EMPLOYEE));

  // [FIX v003] SCHEMA.OWNER_SUMMARY → getSheetHeaders(SHEET.OWNER_SUMMARY)
  createSheetIfMissing_(ss, SHEET.OWNER_SUMMARY,
    getSheetHeaders(SHEET.OWNER_SUMMARY));

  // [FIX v003] SCHEMA.SHIPMENT_SUMMARY → getSheetHeaders(SHEET.SHIPMENT_SUM)
  createSheetIfMissing_(ss, SHEET.SHIPMENT_SUM,
    getSheetHeaders(SHEET.SHIPMENT_SUM));

  logInfo('SetupSheets', 'Group 2 Sheets เสร็จสิ้น');
}

// ============================================================
// SECTION 4: System Sheets
// ============================================================

function setupSystemSheets_(ss) {
  createSheetIfMissing_(ss, SHEET.SYS_LOG,
    getSheetHeaders(SHEET.SYS_LOG));

  createSheetIfMissing_(ss, SHEET.SYS_CONFIG,
    getSheetHeaders(SHEET.SYS_CONFIG));

  // [FIX v003] SYS_TH_GEO ต้องสร้างถ้าไม่มี
  createSheetIfMissing_(ss, SHEET.SYS_TH_GEO,
    getSheetHeaders(SHEET.SYS_TH_GEO));

  // เพิ่มค่า Config เริ่มต้น
  setupDefaultConfig_(ss);

  // ตั้ง Dropdown สำหรับ Q_REVIEW
  setupReviewDropdowns_(ss);

  logInfo('SetupSheets', 'System Sheets เสร็จสิ้น');
}

// ============================================================
// SECTION 5: createSheetIfMissing_
// ============================================================

/**
 * createSheetIfMissing_ — สร้างชีตพร้อม Header ถ้ายังไม่มี
 * [RULE 4] ถ้ามีอยู่แล้วให้ตรวจสอบ Header แทนสร้างใหม่
 *
 * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} ss
 * @param {string} sheetName
 * @param {string[]} headers - Header Array จาก getSheetHeaders()
 */
function createSheetIfMissing_(ss, sheetName, headers) {
  let sheet = ss.getSheetByName(sheetName);

  if (!sheet) {
    // สร้างชีตใหม่
    sheet = ss.insertSheet(sheetName);
    sheet.getRange(1, 1, 1, headers.length)
         .setValues([headers])
         .setFontWeight('bold')
         .setBackground('#4a86e8')
         .setFontColor('#ffffff');
    sheet.setFrozenRows(1);
    sheet.setColumnWidths(1, headers.length, 150);

    logInfo('SetupSheets', `สร้างชีต: ${sheetName} (${headers.length} cols)`);
    return sheet;
  }

  // ชีตมีอยู่แล้ว → ตรวจ Header
  const validation = validateSheetHeaders(sheet, headers);

  if (!validation.isValid) {
    if (validation.missing.length > 0) {
      logWarn('SetupSheets', `${sheetName}: Header หายไป [${validation.missing.join(', ')}] -> กำลังเพิ่มให้อัตโนมัติ...`);

      // [NEW v5.2.008] Auto-Repair: เพิ่มคอลัมน์ที่หายไปต่อท้ายชีต
      const lastCol = sheet.getLastColumn();
      const missingHeaders = validation.missing;

      sheet.getRange(1, lastCol + 1, 1, missingHeaders.length)
           .setValues([missingHeaders])
           .setFontWeight('bold')
           .setBackground('#e06666') // สีแดงอ่อนเพื่อให้รู้ว่าเป็นการ Auto-Repair
           .setFontColor('#ffffff');

      logInfo('SetupSheets', `${sheetName}: เติม ${missingHeaders.length} คอลัมน์เรียบร้อย`);
    }
    if (validation.wrongOrder) {
      logWarn('SetupSheets', `${sheetName}: Header ลำดับผิด (กรุณาตรวจสอบลำดับคอลัมน์ด้วยตนเอง)`);
    }
  }

  return sheet;
}

// ============================================================
// SECTION 6: setupReviewDropdowns_
// ============================================================

/**
 * setupReviewDropdowns_ — ตั้ง Dropdown สำหรับคอลัมน์ใน Q_REVIEW
 * [FIX v003] maxRows = 1000 → sheet.getMaxRows() - 1
 */
function setupReviewDropdowns_(ss) {
  const sheet = ss.getSheetByName(SHEET.Q_REVIEW);
  if (!sheet) return;

  // [FIX v003] ใช้จำนวนแถวจริงจากชีต ไม่ hardcode 1000
  const maxRows = sheet.getMaxRows() - 1;
  if (maxRows <= 0) return;

  const startRow = 2;

  // Dropdown: STATUS
  const statusRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(['Pending', 'In_Review', 'Done', 'Escalated'], true)
    .setAllowInvalid(false)
    .build();
  sheet.getRange(startRow, REVIEW_IDX.STATUS + 1, maxRows, 1)
       .setDataValidation(statusRule);

  // Dropdown: DECISION
  const decisionRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(['CREATE_NEW', 'MERGE_TO_CANDIDATE', 'ESCALATE', 'IGNORE'], true)
    .setAllowInvalid(false)
    .build();
  sheet.getRange(startRow, REVIEW_IDX.DECISION + 1, maxRows, 1)
       .setDataValidation(decisionRule);

  // Dropdown: PRIORITY
  const priorityRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(['1', '2', '3', '4'], true)
    .setAllowInvalid(false)
    .build();
  sheet.getRange(startRow, REVIEW_IDX.PRIORITY + 1, maxRows, 1)
       .setDataValidation(priorityRule);

  logDebug('SetupSheets', `setupReviewDropdowns_: Q_REVIEW ${maxRows} แถว`);
}

// ============================================================
// SECTION 7: setupDefaultConfig_
// ============================================================

function setupDefaultConfig_(ss) {
  const sheet = ss.getSheetByName(SHEET.SYS_CONFIG);
  if (!sheet) return;
  if (sheet.getLastRow() > 1) return; // มีค่าอยู่แล้ว

  const now     = new Date();
  const configs = [
    ['SCHEMA_VERSION',     SCHEMA_VERSION,
     'เวอร์ชัน Schema ของระบบ', now],
    ['GEO_RADIUS_M',       String(AI_CONFIG.GEO_RADIUS_M),
     'รัศมีค้นหา Geo Point (เมตร)', now],
    ['BATCH_SIZE',         String(AI_CONFIG.BATCH_SIZE),
     'จำนวน record ต่อ Batch', now],
    ['THRESHOLD_AUTO',     String(AI_CONFIG.THRESHOLD_AUTO),
     'Score >= นี้ → Auto Match', now],
    ['THRESHOLD_REVIEW',   String(AI_CONFIG.THRESHOLD_REVIEW),
     'Score >= นี้ → ส่ง Review', now],
    ['LAST_SETUP',         now.toISOString(),
     'เวลาที่ Setup ล่าสุด', now],
    ['REVIEWER_CONSENT',   'TRUE',
     'ระบบบันทึกอีเมลผู้ Review (masked) เพื่อ Audit Trail', now],
  ];

  sheet.getRange(2, 1, configs.length,
    getSheetHeaders(SHEET.SYS_CONFIG).length)
    .setValues(configs);

  logInfo('SetupSheets', `setupDefaultConfig_: ${configs.length} ค่า`);
}

// ============================================================
// SECTION 8: Logging Functions (shared scope)
// ============================================================

/**
 * logInfo / logWarn / logError / logDebug
 * เขียน Log ลง SYS_LOG + Console
 */
function logInfo(module, message) {
  writeLog_('INFO', module, message);
  console.log(`[INFO][${module}] ${message}`);
}

function logWarn(module, message) {
  writeLog_('WARN', module, message);
  console.warn(`[WARN][${module}] ${message}`);
}

function logError(module, message, error) {
  // [FIX v5.4.003] เพิ่ม stack trace parameter — กฎข้อ 13 (Logging with Context)
  let stackTrace = '';
  if (error && error.stack) {
    stackTrace = '\n' + error.stack;
  }
  writeLog_('ERROR', module, message + stackTrace);
  console.error(`[ERROR][${module}] ${message}` + stackTrace);
}

function logDebug(module, message) {
  // Debug: เขียนแค่ Console ไม่เขียนลง Sheet (ลด API calls)
  console.log(`[DEBUG][${module}] ${message}`);
}

function writeLog_(level, module, message) {
  try {
    // [PERF-012] สะสม log entries ใน RAM buffer แทน appendRow ทุกครั้ง
    // ลดจาก 1 API call ต่อ log entry เหลือ 1 API call ต่อ 50 entries
    _LOG_BUFFER.push([generateShortId('L'), new Date(), module, level,
      String(message).substring(0, 500), '']);

    if (_LOG_BUFFER.length >= _LOG_BUFFER_LIMIT) {
      flushLogBuffer_();
    }
  } catch (e) {
    // ถ้าเขียน Log ไม่ได้ ไม่ throw
  }
}

/**
 * flushLogBuffer_ — [PERF-012] เขียน log entries ที่สะสมใน buffer ลง Sheet เป็น batch
 * เรียกเมื่อ buffer เต็ม หรือเมื่อ execution ใกล้จบ
 */
function flushLogBuffer_() {
  if (_LOG_BUFFER.length === 0) return;
  try {
    const ss    = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(SHEET.SYS_LOG);
    if (sheet) {
      sheet.getRange(sheet.getLastRow() + 1, 1, _LOG_BUFFER.length, _LOG_BUFFER[0].length)
           .setValues(_LOG_BUFFER);
    }
    _LOG_BUFFER = [];

    // ล้าง Log เก่าถ้าเกิน 5000 แถว
    if (sheet && sheet.getLastRow() > 5001) {
      clearOldLogs_(sheet, 1000);
    }
  } catch (e) {
    // ถ้าเขียน Log ไม่ได้ ไม่ throw
  }
}

// ============================================================
// SECTION 9: clearOldLogs_
// ============================================================

/**
 * clearOldLogs_ — ล้าง Log เก่า
 * [FIX v003] เปลี่ยนจาก deleteRow ทีละแถว (ช้ามาก) → filter + batch rewrite
 *
 * @param {GoogleAppsScript.Spreadsheet.Sheet} logSheet
 * @param {number} keepRows - จำนวนแถวที่จะเก็บไว้ (ล่าสุด)
 */
function clearOldLogs_(logSheet, keepRows) {
  // [FIX v5.5.001] Guard flag ป้องกัน recursive call (logInfo → writeLog_ → clearOldLogs_)
  if (_isClearingOldLogs_) return;
  _isClearingOldLogs_ = true;

  try {
  const totalRows = logSheet.getLastRow() - 1; // ไม่นับ Header
  if (totalRows <= keepRows) return;

  const schemaLen = getSheetHeaders(SHEET.SYS_LOG).length;
  const allData   = logSheet.getRange(2, 1, totalRows, schemaLen).getValues();

  // เก็บเฉพาะ keepRows แถวล่าสุด
  const keepData = allData.slice(allData.length - keepRows);

  // [FIX v5.4.001] ใช้ clearContent + setValues แทน deleteRows
  // เพื่อป้องกัน Google Sheets แวปเป็น Table format (dropdown filter ปรากฏชั่วขณะ)
  // 1. ล้างข้อมูลเก่าทั้งหมด (ไม่ลบแถว จะได้ไม่ trigger Table auto-detect)
  logSheet.getRange(2, 1, totalRows, schemaLen).clearContent();

  // 2. เขียนข้อมูลที่ต้องการเก็บกลับลงไป
  if (keepData.length > 0) {
    logSheet.getRange(2, 1, keepData.length, schemaLen)
            .setValues(keepData);
  }

  // 3. ลบแถวว่างที่เหลือ (ถ้ามี) — ทำหลังเขียนข้อมูลแล้วเพื่อลดการกระพริบ
  const remainingEmpty = totalRows - keepData.length;
  if (remainingEmpty > 0) {
    try {
      logSheet.deleteRows(2 + keepData.length, remainingEmpty);
    } catch (e) {
      // ถ้าลบไม่ได้ (แถวน้อยเกินไป) ไม่เป็นไร — แถวว่างไม่มีผลกระทบ
    }
  }

  // [FIX v5.5.001] ใช้ console.log แทน logInfo เพื่อหลีกเลี่ยง recursion
  console.log(`[INFO][SetupSheets] clearOldLogs_: เก็บ ${keepRows} แถวล่าสุด`);

  } finally {
    _isClearingOldLogs_ = false;
  }
}

// ============================================================
// SECTION 10: setupInputSheet_ — [NEW v5.2.014]
// ============================================================

/**
 * setupInputSheet_ — จัดโครงสร้างชีต Input เป็นฟอร์มแนวตั้ง (Vertical Form Layout)
 * A1 = "COOKIE"
 * A3 = "ShipmentNos"
 * ไม่มี frozen rows, ไม่มีหัวตาราง Row 1
 *
 * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} ss
 */
function setupInputSheet_(ss) {
  let sheet = ss.getSheetByName(SHEET.INPUT);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET.INPUT);
    logInfo('SetupSheets', `สร้างชีต: ${SHEET.INPUT} (ฟอร์มแนวตั้ง)`);
  }

  // ปลดล็อกการแช่แข็งแถว (Frozen Rows) เพื่อไม่ให้ขวางฟอร์มแนวตั้ง
  if (sheet.getFrozenRows() > 0) {
    sheet.setFrozenRows(0);
  }

  // เซ็ตป้ายกำกับของเซลล์หลัก
  sheet.getRange('A1').setValue('COOKIE')
       .setFontWeight('bold')
       .setBackground('#4a86e8')
       .setFontColor('#ffffff')
       .setHorizontalAlignment('center');

  sheet.getRange('A3').setValue('ShipmentNos')
       .setFontWeight('bold')
       .setBackground('#4a86e8')
       .setFontColor('#ffffff')
       .setHorizontalAlignment('center');

  // ล้างค่าและสไตล์ของหัวตารางเดิมที่หลงเหลือหรือสร้างขึ้นมาผิดในแถวที่ 1 คอลัมน์ B และ C
  const b1Range = sheet.getRange('B1');
  const b1Val = String(b1Range.getValue()).trim();
  if (b1Val === 'Shipment_No' || b1Val === 'COOKIE') {
    b1Range.clearContent();
  }

  const c1Range = sheet.getRange('C1');
  const c1Val = String(c1Range.getValue()).trim();
  if (c1Val === 'หมายเหตุ') {
    c1Range.clearContent();
  }

  // ตรวจสอบและทำความสะอาดแถว 1 คอลัมน์ที่เหลือ
  const lastCol = Math.max(3, sheet.getLastColumn());
  for (let col = 2; col <= lastCol; col++) {
    const cell = sheet.getRange(1, col);
    const val = String(cell.getValue()).trim();
    if (val === 'Shipment_No' || val === 'หมายเหตุ') {
      cell.clearContent().setFontWeight('normal').setBackground(null).setFontColor(null);
    }
  }

  logInfo('SetupSheets', `จัดโครงสร้างฟอร์มแนวตั้งชีต Input (A1=COOKIE, A3=ShipmentNos) เรียบร้อยครับ`);
}
