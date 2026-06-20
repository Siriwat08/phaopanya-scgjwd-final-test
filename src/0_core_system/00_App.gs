/**
 * VERSION: 5.5.015
 * FILE: 00_App.gs
 * LMDS V5.5 — Application Entry Point & Menu Controller
 * ===================================================
 * PURPOSE:
 *   จุดเริ่มต้นหลักของระบบ LMDS ควบคุม Custom Menu และ Pipeline Triggers
 *   ทำหน้าที่เป็น Gateway สำหรับการเรียกใช้งานระบบทั้งหมด
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
 *     - [ADD] SHEET.M_ALIAS + SHEET.M_PLACE_ALIAS to requiredSheets in checkSystemIntegrity()
 *     - [ADD] Migration menu items for Hybrid Alias System
 *     - [ADD] 21_AliasService.gs to version info
 *     - [ADD] populateAliasFromSCGRawData_ menu item
 *     - [ADD] assignMasterUuidIfMissing menu item
 *   v5.4.000 (2026-05-23):
 *     - [UPGRADE] Version bump to 5.4.000
 *     - [ADD] Comprehensive header documentation
 *   v5.2.014 (PH2):
 *     - [FIX] setupInputSheet_: อัปเกรดระบบเพื่อปรับปรุงการทำงานหน้าชีต Input เป็นฟอร์มแนวตั้ง
 *   v5.2.013:
 *     - [FIX] executeDecision: ส่ง placeId แทน decision.placeId (undefined) ไปยัง createGeoPoint
 *   v5.2.012:
 *     - [REVERT] กู้คืนระบบดึงข้อมูลจาก SCG API ให้เป็นแบบ Batch ดั้งเดิม
 *   v5.2.011:
 *     - [ADD] onSelectionChange: เพิ่มระบบคลิกเพื่อนำทางอัตโนมัติ (Smart Navigation)
 * ===================================================
 * DEPENDENCIES:
 *   REQUIRES (Load Order):
 *     - 01_Config.gs     (Configuration & Constants)
 *     - 02_Schema.gs     (Schema Definitions)
 *   CALLS (Invokes):
 *     - runMatchEngine()                       → 10_MatchEngine.gs
 *     - runLookupEnrichment()                 → 17_SearchService.gs
 *     - buildFullQualityReport()              → 13_ReportService.gs
 *     - fetchDataFromSCGJWD()                 → 18_ServiceSCG.gs
 *     - buildGeoDictionary()                  → 16_GeoDictionaryBuilder.gs
 *     - applyMasterCoordinatesToDailyJob()    → 18_ServiceSCG.gs
 *     - MIGRATION_HybridAliasSystem()         → 21_AliasService.gs
 *     - populateAliasFromSCGRawData_()        → 21_AliasService.gs
 *     - assignMasterUuidIfMissing()           → 21_AliasService.gs
 *   EXPORTS TO:
 *     - All modules (onOpen trigger, menu system)
 *   SHEETS ACCESSED:
 *     - SHEET.SOURCE        (Read: Pipeline input)
 *     - SHEET.DAILY_JOB     (Read+Write: SCG Daily Operations)
 *     - SHEET.Q_REVIEW      (Read+Write: Review Queue, onEdit trigger)
 *   TRIGGERS:
 *     - onOpen()     → เรียก createMenu_() ทุกครั้งที่เปิด Spreadsheet
 *     - onEdit()     → ดักจับการแก้ไขใน Q_REVIEW
 *     - installSmartNavTrigger() → ติดตั้ง Smart Navigation (Installable)
 * ===================================================
 * ARCHITECTURE:
 *   ┌─────────────────────────────────────────────────────────────┐
 *   │  00_App.gs (Entry Point / Gateway)                         │
 *   │  ├── onOpen() → createMenu_()                               │
 *   │  └── Custom Menu → Pipeline Actions                         │
 *   │      ├── "Run Full Pipeline" → runFullPipeline()           │
 *   │      ├── "🟩 กลุ่ม 1" → runMatchEngine()                  │
 *   │      ├── "🟦 กลุ่ม 2" → fetchDataFromSCGJWD()             │
 *   │      ├── "🔧 ระบบ" → setupAllSheets / buildGeoDictionary  │
 *   │      │   ├── "Migration: Hybrid Alias" → MIGRATION_HybridAliasSystem()│
 *   │      │   ├── "ตรวจสอบ Master UUID" → assignMasterUuidIfMissing()  │
 *   │      │   └── "ดึงชื่อจาก SCG ดิบ" → populateAliasFromSCGRawData_() │
 *   │      └── "Audit" → runPreflightAudit()                      │
 *   └─────────────────────────────────────────────────────────────┘
 * ===================================================
 */

// constants are defined in 01_Config.gs

// ============================================================
// SECTION 1: onOpen Trigger
// ============================================================

function onOpen() {
  // [ADD v003] ตรวจ Config ทันทีที่เปิด Spreadsheet
  try {
    validateConfig();
  } catch (cfgErr) {
    // [FIX BUG-04 v5.5.001] เปลี่ยน getUi().alert() เป็น safeUiAlert_() — trigger-safe (onOpen)
    safeUiAlert_(
      '⚠️ Config Warning:\n' + cfgErr.message +
      '\n\nระบบยังใช้งานได้ แต่กรุณาตรวจสอบก่อนรัน Pipeline'
    );
  }

  // [FIX v5.2.016] พยายามติดตั้ง Smart Navigation อัตโนมัติ
  // [FIX v5.5.001] เพิ่ม logDebug แทน catch เงียบ — กฎข้อ 13 (Logging with Context)
  try { autoInstallSmartNav_(); } catch (navErr) { logDebug('App', 'autoInstallSmartNav_: ' + navErr.message); }

  const ui = SpreadsheetApp.getUi();

  ui.createMenu(`🚚 ${APP_NAME}`)
    .addItem('🚀 Run Full Pipeline',  'runFullPipeline')
    .addItem('📍 จับคู่พิกัดวันนี้', 'applyMasterCoordinatesToDailyJob')
    .addSeparator()

    .addSubMenu(
      ui.createMenu('🟩 กลุ่ม 1: ล้างข้อมูล & Master')
        .addItem('▶️ รัน Full Pipeline (ทั้งหมด)', 'runFullPipeline')
        .addSeparator()
        .addItem('Step 1 — โหลดข้อมูลดิบจากแหล่ง', 'runLoadSource')
        .addItem('Step 2 — Normalize ชื่อ/ที่อยู่',  'runNormalize')
        .addItem('Step 3 — Match Engine',              'runMatchEngine')
        .addSeparator()
        .addItem('📋 เปิด Review Queue',       'openReviewQueue')
        .addItem('▶️ รันคำสั่งที่เลือกไว้ทั้งหมด', 'applyAllPendingDecisions')
        .addItem('📊 รายงาน Data Quality',     'buildFullQualityReport')
    )

    .addSubMenu(
      ui.createMenu('🟦 กลุ่ม 2: งานประจำวัน (SCG)')
        .addItem('📥 ดึงข้อมูล SCG API',   'fetchDataFromSCGJWD')
        .addItem('📍 จับคู่พิกัด',          'applyMasterCoordinatesToDailyJob')
        .addSeparator()
        .addItem('🗑️ ล้างข้อมูลทั้งหมด',  'clearAllSCGSheets_UI')
        .addSeparator()
        .addItem('🔐 ตั้งค่า SCG Cookie',  'setSCGCookie_UI')
    )

    .addSeparator()

    .addSubMenu(
      ui.createMenu('🔧 ระบบ & ตั้งค่า')
        .addItem('⚙️ ตั้งค่า API Key',           'setupEnvironment')
        .addItem('🔐 ตั้งค่า SCG Cookie',         'setSCGCookie_UI')
        .addItem('👥 ตั้งค่ารายชื่อ Admin',       'setupAdminList_UI')
        .addItem('🏗️ สร้างชีตทั้งหมด',          'setupAllSheets')
        .addItem('🌍 อัปเดตฐานข้อมูลภูมิศาสตร์ (SYS_TH_GEO)', 'buildGeoDictionary')
        .addItem('🛠️ เติมข้อมูลภูมิศาสตร์ (16 คอลัมน์)', 'populateGeoMetadata')
        .addItem('🔗 สร้าง Alias อัตโนมัติจากประวัติ (FACT)', 'generatePersonAliasesFromHistory')
        .addItem('🔄 Migration: Hybrid Alias System', 'MIGRATION_HybridAliasSystem')
        .addItem('🔗 ตรวจสอบ Master UUID', 'assignMasterUuidIfMissing')
        .addItem('📥 ดึงชื่อจาก SCG ดิบ → M_ALIAS', 'populateAliasFromSCGRawData')
        .addSeparator()
        .addItem('🛡️ ป้องกันข้อมูล Sensitive',  'applySheetProtection_UI')
        .addSeparator()
        .addItem('🛡️ [PH2] Preflight Audit',      'runPreflightAudit')
        .addItem('🧹 [PH2] Detect Duplicates',     'detectDoubleProcessing')
        .addItem('✅ ตรวจสอบ System Integrity',   'checkSystemIntegrity')
        .addItem('🔍 วินิจฉัย Pipeline (Diagnostic)', 'diagnoseSystemState')
        .addSeparator()
        .addItem('🔄 รีเซ็ตสถานะ SYNC (เพื่อรันใหม่)', 'resetSourceSyncStatus')
        .addItem('🧹 ล้างความจำระบบ (Clear Cache)',  'invalidateAllGlobalCaches')
        .addItem('📖 ดู Version Info',            'showVersionInfo')
        .addSeparator()
        .addItem('🚀 ติดตั้ง Smart Navigation (คลิกนำทาง)',  'installSmartNavTrigger')
    )

    .addToUi();
}

// ============================================================
// SECTION 2: onEdit Trigger
// ============================================================

/**
 * onEdit — ดักจับการแก้ไขใน Spreadsheet
 * [ADD v003] รองรับการเลือก Decision ใน Q_REVIEW
 */
function onEdit(e) {
  if (!e || !e.range) return;
  const sheet = e.range.getSheet();
  const name  = sheet.getName();

  // 1. ตรวจสอบว่าแก้ไขในชีต Q_REVIEW หรือไม่
  if (name === SHEET.Q_REVIEW) {
    const col = e.range.getColumn();
    const row = e.range.getRow();

    // 2. ตรวจสอบว่าแก้ในคอลัมน์ DECISION (V) หรือไม่
    if (col === REVIEW_IDX.DECISION + 1 && row > 1) {
      const decision = String(e.value || '').trim();
      if (!decision) return;

      const reviewId = String(sheet.getRange(row, REVIEW_IDX.REVIEW_ID + 1).getValue()).trim();
      if (!reviewId) return;

      try {
        // [FIX v003] ประมวลผลทันทีที่เลือก
        applyReviewDecision(reviewId, decision);

        // ทาสีแถวให้เป็นสีตามผลลัพธ์
        highlightHighPriorityReviews();

        sheet.getParent().toast(`✅ ประมวลผล ${reviewId} สำเร็จ`, APP_NAME, 3);
      } catch (err) {
        logError('App_onEdit', `reviewId ${reviewId} ล้มเหลว: ${err.message}`, err);
        // [FIX BUG-04 v5.5.001] เปลี่ยน getUi().alert() เป็น safeUiAlert_() — trigger-safe (onEdit)
        safeUiAlert_(`❌ ประมวลผลล้มเหลว: ${err.message}`);
      }
    }
  }
}

// ============================================================
// SECTION 2.5: Smart Navigation (Installable Trigger)
// ============================================================

/**
 * installSmartNavTrigger — [FIX v5.2.016] ติดตั้ง Installable Trigger สำหรับ Smart Navigation
 * สาเหตุ: Simple Trigger (onSelectionChange) ไม่มีสิทธิ์เรียก getUi().alert() ทำให้ล้มเหลวเงียบๆ
 * Installable Trigger มีสิทธิ์เต็มรูปแบบ รวมถึง UI dialog
 */
function installSmartNavTrigger() {
  // [FIX S1 v5.5.002] เพิ่ม try-catch ครอบทั้งฟังก์ชัน — Rule 12
  try {
  // ลบ Smart Nav trigger เก่าก่อน (ถ้ามี)
  const triggers = ScriptApp.getProjectTriggers();
  let deletedCount = 0;
  for (const t of triggers) {
    if (t.getHandlerFunction() === 'handleSelectionChange_') {
      ScriptApp.deleteTrigger(t);
      deletedCount++;
    }
  }

  // ติดตั้งใหม่
  ScriptApp.newTrigger('handleSelectionChange_')
    .forSpreadsheet(SpreadsheetApp.getActive())
    .onSelectionChange()
    .create();

  // [FIX BUG-04 v5.5.001] เปลี่ยน getUi().alert() เป็น safeUiAlert_() — trigger-safe
  safeUiAlert_(
    '✅ ติดตั้ง Smart Navigation สำเร็จ!\n\n' +
    (deletedCount > 0 ? `(ลบ Trigger เก่า ${deletedCount} ตัว)\n\n` : '') +
    'วิธีใช้: ไปที่ชีต Q_REVIEW แล้วคลิกที่:\n' +
    '  • คอลัมน์ Candidate ID (L-O) — นำทางไป Master/FACT ของ candidate นั้น\n' +
    '  • คอลัมน์ recommended_action (P) — นำทางตามที่ระบบแนะนำ [V5.5.011]\n\n' +
    'ระบบจะถามว่าต้องการนำทางไปตารางหลัก (Master) หรือ ประวัติขนส่ง (FACT)'
  );
  } catch (err) {
    logError('App', 'installSmartNavTrigger: ' + err.message, err);
    safeUiAlert_('❌ ติดตั้ง Smart Navigation ล้มเหลว: ' + err.message);
  }
}

/**
 * autoInstallSmartNav_ — [FIX v5.4.002] ติดตั้ง Smart Nav แบบเงียบ (ไม่ถามผู้ใช้)
 * ถูกเรียกจาก onOpen() — ตรวจสอบว่ามี trigger อยู่แล้วหรือไม่ ถ้าไม่มีค่อยติดตั้ง
 * แก้ไข Bug: เดิมเรียก autoInstallSmartNav_() แต่ไม่มี function นี้ → Fake Call
 */
function autoInstallSmartNav_() {
  const triggers = ScriptApp.getProjectTriggers();
  let hasSmartNav = false;
  for (let i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'handleSelectionChange_') {
      hasSmartNav = true;
      break;
    }
  }
  if (!hasSmartNav) {
    ScriptApp.newTrigger('handleSelectionChange_')
      .forSpreadsheet(SpreadsheetApp.getActive())
      .onSelectionChange()
      .create();
  }
}

/**
 * handleSelectionChange_ — [FIX v5.2.016] ฟังก์ชันหลักสำหรับ Smart Navigation
 * [REFACTOR v5.5.001] แยก sub-functions เพื่อลดความยาว (97→42 บรรทัด) — กฎข้อ 1.1
 * ถูกเรียกโดย Installable Trigger (มีสิทธิ์ getUi/alert/toast ครบ)
 *
 * [V5.5.011] ขยายขอบเขตการนำทาง:
 *   - คลิกที่ Candidate ID columns (L-O, idx 11-14) → นำทางไป Master/FACT (พฤติกรรมเดิม)
 *   - คลิกที่ Recommended Action column (P, idx 16) → parse ID จากคำแนะนำ
 *     เช่น "MERGE_TO_CANDIDATE:PS-XXXX" → นำทางไปยัง PS-XXXX ใน M_PERSON + FACT_DELIVERY
 *     ทำให้ผู้ review คลิกที่คอลัมน์ "ระบบแนะนำ" แล้วระบบพาไปหน้ายืนยันได้ตามที่เคยทำงาน
 */
function handleSelectionChange_(e) {
  if (!e || !e.range) return;
  try {
    const sheet = e.range.getSheet();
    if (sheet.getName() !== SHEET.Q_REVIEW) return;

    const col = e.range.getColumn();
    const row = e.range.getRow();
    if (row <= 1) return;

    // [V5.5.011] กรณี A: คลิกที่คอลัมน์ RECOMMEND (idx 16, col P)
    //   parse ID จาก string เช่น "MERGE_TO_CANDIDATE:PS-XXXX" แล้วนำทาง
    if (col === REVIEW_IDX.RECOMMEND + 1) {
      handleRecommendClick_(sheet, row, e.range);
      return;
    }

    // กรณี B: คลิกที่ Candidate ID columns (idx 11-14, cols L-O) — พฤติกรรมเดิม
    if (col < REVIEW_IDX.CAND_PERSONS + 1 || col > REVIEW_IDX.CAND_DESTS + 1) return;

    const cellValue = String(e.range.getValue() || '').trim();
    if (!cellValue) return;

    const matches = cellValue.match(/(PS|PL|GP|DE|DS)\w+/gi);
    if (!matches || matches.length === 0) return;

    const targetId = matches[0].toUpperCase().trim();
    const prefix = targetId.substring(0, 2);
    const targetSheetName = resolveTargetSheetName_(prefix);
    if (!targetSheetName) return;

    const ss = sheet.getParent();
    const targetSheet = ss.getSheetByName(targetSheetName);
    if (!targetSheet || targetSheet.getLastRow() < 2) return;

    const targetRowIndex = findRowByIdInSheet_(targetSheet, targetId);
    if (targetRowIndex === -1) return;

    const factSheet = ss.getSheetByName(SHEET.FACT_DELIVERY);
    const factColIdx = resolveFactColIdx_(prefix);
    const factRowIndex = (factSheet && factSheet.getLastRow() >= 2 && factColIdx !== -1)
      ? findRowByIdInSheetByCol_(factSheet, targetId, factColIdx) : -1;

    navigateToMasterOrFact_(ss, targetId, targetSheet, targetRowIndex, factSheet, factRowIndex, targetSheetName);
  } catch (err) {
    try { logError('SmartNav', err.message, err); } catch (_) {}
  }
}

/**
 * handleRecommendClick_ — [V5.5.011] จัดการการคลิกที่คอลัมน์ RECOMMEND (recommended_action)
 *
 * ค่าในคอลัมน์ RECOMMEND อาจเป็น:
 *   - "MERGE_TO_CANDIDATE:PS-XXXX" → parse PS-XXXX แล้วนำทางไป M_PERSON + FACT_DELIVERY
 *   - "MERGE_TO_CANDIDATE:PL-XXXX" → parse PL-XXXX แล้วนำทางไป M_PLACE + FACT_DELIVERY
 *   - "CREATE_NEW:GP-XXXX"         → parse GP-XXXX แล้วนำทางไป M_GEO_POINT + FACT_DELIVERY
 *   - "CREATE_NEW"                 → แจ้งเตือนให้ reviewer ยืนยันด้วยตนเอง (ไม่มี ID สำหรับนำทาง)
 *   - "MANUAL_REVIEW"              → แจ้งเตือนให้ reviewer พิจารณาเอง
 *
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet - Q_REVIEW sheet
 * @param {number} row - 1-based row number
 * @param {GoogleAppsScript.Spreadsheet.Range} cell - the clicked cell
 */
function handleRecommendClick_(sheet, row, cell) {
  const cellValue = String(cell.getValue() || '').trim();
  if (!cellValue) return;

  // Parse ID จาก string รูปแบบ "ACTION:ID"
  // รองรับ prefix: PS (Person), PL (Place), GP (GeoPoint), DE/DS (Destination)
  const idMatch = cellValue.match(/(PS|PL|GP|DE|DS)[\w\-]+/i);
  if (!idMatch) {
    // ไม่มี ID ในคำแนะนำ (เช่น "CREATE_NEW" ล้วน หรือ "MANUAL_REVIEW")
    // แสดงคำอธิบายให้ reviewer ทราบ
    const reviewId = String(sheet.getRange(row, REVIEW_IDX.REVIEW_ID + 1).getValue() || '').trim();
    const rawPerson = String(sheet.getRange(row, REVIEW_IDX.RAW_PERSON + 1).getValue() || '').trim();
    const ui = SpreadsheetApp.getUi();
    ui.alert(
      '📋 คำแนะนำจากระบบ',
      'Review ID: ' + reviewId + '\n' +
      'ชื่อปลายทาง: ' + rawPerson + '\n\n' +
      'ระบบแนะนำ: ' + cellValue + '\n\n' +
      'การกระทำที่เหมาะสม:\n' +
      (cellValue === 'CREATE_NEW'
        ? '→ สร้างระเบียนใหม่ใน M_PERSON/M_PLACE (ไม่มี candidate ให้ merge)'
        : '→ ตรวจสอบด้วยตนเองและเลือก Decision ในคอลัมน์ V'),
      ui.ButtonSet.OK
    );
    return;
  }

  const targetId = idMatch[0].toUpperCase().trim();
  const prefix = targetId.substring(0, 2);
  const targetSheetName = resolveTargetSheetName_(prefix);
  if (!targetSheetName) return;

  const ss = sheet.getParent();
  const targetSheet = ss.getSheetByName(targetSheetName);
  if (!targetSheet || targetSheet.getLastRow() < 2) {
    SpreadsheetApp.getUi().alert(
      '⚠️ ไม่พบข้อมูล',
      'ไม่พบชีต ' + targetSheetName + ' หรือชีตว่างเปล่า',
      SpreadsheetApp.getUi().ButtonSet.OK
    );
    return;
  }

  const targetRowIndex = findRowByIdInSheet_(targetSheet, targetId);
  if (targetRowIndex === -1) {
    SpreadsheetApp.getUi().alert(
      '⚠️ ไม่พบ ID',
      'ไม่พบ ' + targetId + ' ในชีต ' + targetSheetName,
      SpreadsheetApp.getUi().ButtonSet.OK
    );
    return;
  }

  const factSheet = ss.getSheetByName(SHEET.FACT_DELIVERY);
  const factColIdx = resolveFactColIdx_(prefix);
  const factRowIndex = (factSheet && factSheet.getLastRow() >= 2 && factColIdx !== -1)
    ? findRowByIdInSheetByCol_(factSheet, targetId, factColIdx) : -1;

  // [V5.5.011] แสดงหน้ายืนยันพร้อมบอกว่าเป็นการกระทำที่ระบบแนะนำ
  navigateFromRecommend_(ss, cellValue, targetId, targetSheet, targetRowIndex,
    factSheet, factRowIndex, targetSheetName);
}

/**
 * navigateFromRecommend_ — [V5.5.011] นำทางจากการคลิกที่ RECOMMEND column
 * แสดงหน้าต่างยืนยันพร้อมบอกว่าเป็นคำแนะนำจากระบบ และให้ reviewer ยืนยัน
 *
 * @param {Spreadsheet} ss
 * @param {string} recommendAction - ค่า recommended_action เช่น "MERGE_TO_CANDIDATE:PS-XXXX"
 * @param {string} targetId - ID ที่ parse ได้ เช่น "PS-XXXX"
 * @param {Sheet} targetSheet - ชีต Master เป้าหมาย
 * @param {number} targetRowIndex - 1-based row index ใน Master sheet
 * @param {Sheet} factSheet - ชีต FACT_DELIVERY
 * @param {number} factRowIndex - 1-based row index ใน FACT_DELIVERY (-1 ถ้าไม่พบ)
 * @param {string} targetSheetName - ชื่อชีต Master
 */
function navigateFromRecommend_(ss, recommendAction, targetId, targetSheet, targetRowIndex,
  factSheet, factRowIndex, targetSheetName) {
  const ui = SpreadsheetApp.getUi();

  // แยก action ออกจาก ID เช่น "MERGE_TO_CANDIDATE:PS-XXXX" → "MERGE_TO_CANDIDATE"
  const actionOnly = recommendAction.split(':')[0];

  const msg = '🎯 ระบบแนะนำ: ' + actionOnly + '\n' +
    'สำหรับ ID: ' + targetId + '\n\n' +
    'ต้องการให้ระบบนำทางไปยังส่วนใด?\n\n' +
    '👉 [YES] ไปยังหน้าข้อมูลหลัก Master (' + targetSheetName + ' แถวที่ ' + targetRowIndex + ')\n' +
    '👉 [NO] ไปยังหน้าประวัติการส่งสินค้าจริง (FACT_DELIVERY ' +
    (factRowIndex !== -1 ? 'แถวที่ ' + factRowIndex : '- ไม่พบประวัติ') + ')\n' +
    '👉 [CANCEL] ยกเลิกการนำทาง';

  const response = ui.alert('🚀 Smart Navigation (จากคำแนะนำระบบ)', msg, ui.ButtonSet.YES_NO_CANCEL);
  if (response === ui.Button.YES) {
    targetSheet.activate();
    targetSheet.getRange(targetRowIndex, 1, 1, targetSheet.getLastColumn()).activate();
    ss.toast('🎯 นำทางไปยังตารางหลัก ' + targetSheetName + ' แถว ' + targetRowIndex + ' สำเร็จ',
      'LMDS Navigation');
  } else if (response === ui.Button.NO) {
    if (factRowIndex !== -1) {
      factSheet.activate();
      factSheet.getRange(factRowIndex, 1, 1, factSheet.getLastColumn()).activate();
      ss.toast('🎯 นำทางไปยังประวัติขนส่ง FACT_DELIVERY แถว ' + factRowIndex + ' สำเร็จ',
        'LMDS Navigation');
    } else {
      safeUiAlert_('❌ ไม่พบประวัติของ ' + targetId + ' ในชีต FACT_DELIVERY');
    }
  }
}

/**
 * resolveTargetSheetName_ — แมป ID prefix → ชื่อชีต Master
 * [REFACTOR v5.5.001] แยกจาก handleSelectionChange_ — กฎข้อ 1.1
 * @param {string} prefix — 2-char prefix (PS, PL, GP, DE, DS)
 * @return {string} sheet name หรือ '' ถ้าไม่ตรง
 */
function resolveTargetSheetName_(prefix) {
  if (prefix === 'PS') return SHEET.M_PERSON;
  if (prefix === 'PL') return SHEET.M_PLACE;
  if (prefix === 'GP') return SHEET.M_GEO_POINT;
  if (prefix === 'DE' || prefix === 'DS') return SHEET.M_DESTINATION;
  return '';
}

/**
 * resolveFactColIdx_ — แมป ID prefix → FACT_IDX column index
 * [REFACTOR v5.5.001] แยกจาก handleSelectionChange_ — กฎข้อ 1.1
 * @param {string} prefix — 2-char prefix
 * @return {number} column index หรือ -1
 */
function resolveFactColIdx_(prefix) {
  if (prefix === 'PS') return FACT_IDX.PERSON_ID;
  if (prefix === 'PL') return FACT_IDX.PLACE_ID;
  if (prefix === 'GP') return FACT_IDX.GEO_ID;
  if (prefix === 'DE' || prefix === 'DS') return FACT_IDX.DEST_ID;
  return -1;
}

/**
 * findRowByIdInSheet_ — ค้นหาแถวในชีตจาก ID (คอลัมน์ A)
 * [REFACTOR v5.5.001] แยกจาก handleSelectionChange_ — กฎข้อ 1.1
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
 * @param {string} targetId — ID ที่ต้องการหา (case-insensitive)
 * @return {number} 1-based row index หรือ -1 ถ้าไม่เจอ
 */
function findRowByIdInSheet_(sheet, targetId) {
  const ids = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues();
  for (let i = 0; i < ids.length; i++) {
    if (String(ids[i][0]).toUpperCase().trim() === targetId) return i + 2;
  }
  return -1;
}

/**
 * findRowByIdInSheetByCol_ — ค้นหาแถวในชีตจาก ID ในคอลัมน์ที่กำหนด
 * [REFACTOR v5.5.001] แยกจาก handleSelectionChange_ — กฎข้อ 1.1
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
 * @param {string} targetId
 * @param {number} colIdx — 0-based column index
 * @return {number} 1-based row index หรือ -1
 */
function findRowByIdInSheetByCol_(sheet, targetId, colIdx) {
  const ids = sheet.getRange(2, colIdx + 1, sheet.getLastRow() - 1, 1).getValues();
  for (let i = 0; i < ids.length; i++) {
    if (String(ids[i][0]).toUpperCase().trim() === targetId) return i + 2;
  }
  return -1;
}

/**
 * navigateToMasterOrFact_ — แสดงกล่องเลือกแล้วนำทางไป Master หรือ FACT
 * [REFACTOR v5.5.001] แยกจาก handleSelectionChange_ — กฎข้อ 1.1
 */
function navigateToMasterOrFact_(ss, targetId, targetSheet, targetRowIndex, factSheet, factRowIndex, targetSheetName) {
  const ui = SpreadsheetApp.getUi();
  const msg = `ต้องการให้ระบบนำทางไปยังส่วนใดสำหรับ ID: ${targetId} ?\n\n` +
    `👉 [YES] ไปยังหน้าข้อมูลหลัก Master (${targetSheetName} แถวที่ ${targetRowIndex})\n` +
    `👉 [NO] ไปยังหน้าประวัติการส่งสินค้าจริง (FACT_DELIVERY ${factRowIndex !== -1 ? 'แถวที่ ' + factRowIndex : '- ไม่พบประวัติ'})\n` +
    `👉 [CANCEL] ยกเลิกการนำทาง`;

  const response = ui.alert('🚀 Smart Navigation', msg, ui.ButtonSet.YES_NO_CANCEL);
  if (response === ui.Button.YES) {
    targetSheet.activate();
    targetSheet.getRange(targetRowIndex, 1, 1, targetSheet.getLastColumn()).activate();
    ss.toast(`🎯 นำทางไปยังตารางหลัก ${targetSheetName} แถว ${targetRowIndex} สำเร็จ`, 'LMDS Navigation');
  } else if (response === ui.Button.NO) {
    if (factRowIndex !== -1) {
      factSheet.activate();
      factSheet.getRange(factRowIndex, 1, 1, factSheet.getLastColumn()).activate();
      ss.toast(`🎯 นำทางไปยังประวัติขนส่ง FACT_DELIVERY แถว ${factRowIndex} สำเร็จ`, 'LMDS Navigation');
    } else {
      safeUiAlert_(`❌ ไม่พบประวัติของ ${targetId} ในชีต FACT_DELIVERY`);
    }
  }
}

/**
 * onSelectionChange — [DEPRECATED v5.2.016]
 * ถูกแทนที่ด้วย handleSelectionChange_ (Installable Trigger)
 * คงไว้เป็น stub เปล่าเพื่อไม่ให้ GAS สร้าง Simple Trigger ซ้ำซ้อน
 */
function onSelectionChange(e) {
  // Intentionally empty — ใช้ installSmartNavTrigger() แทน
}

// ============================================================
// SECTION 3: safeRun — Global Error Handler
// ============================================================

function safeRun(funcName, fn) {
  try {
    fn();
  } catch (err) {
    logError(funcName, err.message || String(err), err);
    // [FIX BUG-04 v5.5.001] เปลี่ยน getUi().alert() เป็น safeUiAlert_()
    safeUiAlert_(
      `❌ ${funcName} ล้มเหลว:\n${err.message}`
    );
  }
}

// ============================================================
// SECTION 4: Full Pipeline
// ============================================================

function runFullPipeline() {
  const ui = SpreadsheetApp.getUi();

  // [ADD v003] LockService กัน double-click
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(3000)) {
    // [FIX BUG-04 v5.5.001] เปลี่ยน ui.alert() เป็น safeUiAlert_()
    safeUiAlert_('⚠️ มี Pipeline กำลังทำงานอยู่\nกรุณารอให้เสร็จก่อน');
    return;
  }

  try {
    const ss        = SpreadsheetApp.getActiveSpreadsheet();
    const startTime = new Date();

    logInfo('App', `Full Pipeline เริ่มต้น — v${APP_VERSION}`);
    ss.toast('🚀 เริ่มต้นรัน Full Pipeline (ทำงานเบื้องหลัง)...', APP_NAME, 5);

    // [FIX v5.4.001] ล้าง Cache ทั้งหมดก่อนเริ่ม Pipeline เพื่อให้อ่านข้อมูลใหม่จากชีต
    invalidateAllGlobalCaches();

    safeRun('runFullPipeline', () => {
      ss.toast('Step 1/3: กำลังโหลดข้อมูลดิบ...', APP_NAME, 10);
      runLoadSource();

      ss.toast('Step 2/3: กำลัง Normalize...', APP_NAME, 10);
      runNormalize();

      ss.toast('Step 3/3: กำลัง Match Engine...', APP_NAME, 10);
      runMatchEngine();

      const elapsedSec = Math.round((new Date() - startTime) / 1000);
      logInfo('App', `Full Pipeline สำเร็จ — ${elapsedSec} วินาที`);

      // [FIX v5.4.001] แสดงสรุปผลลัพธ์แบบละเอียด พร้อมตรวจเตือนถ้ามีปัญหา
      const diagResult = getPipelineDiagnosticSummary_();
      let alertMsg = `✅ Full Pipeline สำเร็จ!\nใช้เวลา: ${elapsedSec} วินาที\n\n` + diagResult.summary;
      if (diagResult.warnings.length > 0) {
        alertMsg += '\n\n⚠️ คำเตือน:\n' + diagResult.warnings.join('\n');
      }
      // [FIX BUG-04 v5.5.001] เปลี่ยน ui.alert() เป็น safeUiAlert_()
      safeUiAlert_(alertMsg);
    });

  } finally {
    lock.releaseLock();
    // [PERF-012] Flush log buffer ก่อน execution จบ — ป้องกัน log entries สูญหาย
    if (typeof flushLogBuffer_ === 'function') flushLogBuffer_();
  }
}

/**
 * getPipelineDiagnosticSummary_ — [NEW v5.4.001] สรุปสถานะหลัง Pipeline รันเสร็จ
 * ตรวจสอบจำนวนข้อมูลในแต่ละชีต และแจ้งเตือนถ้าชีตว่าง
 * @return {{ summary: string, warnings: string[] }}
 */
function getPipelineDiagnosticSummary_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const checks = [
    { name: SHEET.M_PERSON,       label: 'M_PERSON' },
    { name: SHEET.M_PERSON_ALIAS, label: 'M_PERSON_ALIAS' },
    { name: SHEET.M_PLACE,        label: 'M_PLACE' },
    { name: SHEET.M_PLACE_ALIAS,  label: 'M_PLACE_ALIAS' },
    { name: SHEET.M_GEO_POINT,    label: 'M_GEO_POINT' },
    { name: SHEET.M_ALIAS,        label: 'M_ALIAS' },
    { name: SHEET.FACT_DELIVERY,  label: 'FACT_DELIVERY' },
    { name: SHEET.Q_REVIEW,       label: 'Q_REVIEW' },
  ];

  const warnings = [];
  const lines = [];

  checks.forEach(c => {
    const sheet = ss.getSheetByName(c.name);
    const dataRows = sheet ? Math.max(0, sheet.getLastRow() - 1) : -1;
    if (dataRows === -1) {
      lines.push(`  ❌ ${c.label}: ไม่พบชีต`);
      warnings.push(`ไม่พบชีต ${c.label} — รัน "สร้างชีตทั้งหมด" ก่อน`);
    } else if (dataRows === 0) {
      lines.push(`  ⚠️ ${c.label}: 0 แถว (ว่าง)`);
    } else {
      lines.push(`  ✅ ${c.label}: ${dataRows} แถว`);
    }
  });

  // ตรวจสอบ Source Sheet
  const srcSheet = ss.getSheetByName(SHEET.SOURCE);
  if (srcSheet && srcSheet.getLastRow() > 1) {
    const srcTotal = srcSheet.getLastRow() - 1;
    // นับแถวที่ SYNC_STATUS = 'SUCCESS'
    const syncCol = SRC_IDX.SYNC_STATUS + 1;
    const syncData = srcSheet.getRange(2, syncCol, srcTotal, 1).getValues();
    const doneCount = syncData.filter(r => String(r[0]).trim() === SCG_CONFIG.SYNC_DONE_VALUE).length;
    const pendingCount = srcTotal - doneCount;
    lines.push(`\n  📊 Source: ${srcTotal} แถว (ประมวลผลแล้ว: ${doneCount}, ค้างอยู่: ${pendingCount})`);
    if (pendingCount === 0 && srcTotal > 0) {
      warnings.push('Source ทั้งหมดถูกประมวลผลแล้ว (SYNC_STATUS=SUCCESS) — ถ้าต้องการรันใหม่ กดเมนู "รีเซ็ตสถานะ SYNC"');
    }
  } else {
    warnings.push('ไม่พบข้อมูลในชีต Source — ตรวจสอบชื่อชีต: ' + SHEET.SOURCE);
  }

  // ตรวจสอบ column mismatch
  [SHEET.M_PERSON, SHEET.M_PLACE].forEach(sn => {
    const sheet = ss.getSheetByName(sn);
    if (sheet) {
      const actualCols = sheet.getLastColumn();
      const schemaCols = SCHEMA[sn] ? SCHEMA[sn].length : 0;
      if (schemaCols > 0 && actualCols < schemaCols) {
        warnings.push(`${sn}: ชีตมี ${actualCols} คอลัมน์ แต่ SCHEMA ต้องการ ${schemaCols} — รัน "สร้างชีตทั้งหมด" เพื่อเพิ่มคอลัมน์ที่ขาด`);
      }
    }
  });

  return { summary: lines.join('\n'), warnings: warnings };
}

// ============================================================
// SECTION 5: Navigation Helpers
// ============================================================

function openReviewQueue() {
  // [FIX S1 v5.5.002] เพิ่ม try-catch ครอบทั้งฟังก์ชัน — Rule 12
  try {
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET.Q_REVIEW);
  if (sheet) {
    ss.setActiveSheet(sheet);
    ss.toast('กำลังแสดง Review Queue', APP_NAME, 3);
  } else {
    // [FIX BUG-04 v5.5.001] เปลี่ยน getUi().alert() เป็น safeUiAlert_()
    safeUiAlert_('❌ ไม่พบชีต Q_REVIEW\nกรุณารัน "สร้างชีตทั้งหมด" ก่อน');
  }
  } catch (err) {
    logError('App', 'openReviewQueue: ' + err.message, err);
    safeUiAlert_('❌ เปิด Review Queue ล้มเหลว: ' + err.message);
  }
}

// ============================================================
// SECTION 6: System Tools
// ============================================================

// [FIX BUG-A2] v5.4.003: เพิ่ม try-catch outer
function checkSystemIntegrity() {
  try {
    const ss     = SpreadsheetApp.getActiveSpreadsheet();
    const errors = [];
    const warns  = [];

    const requiredSheets = [
      SHEET.M_PERSON, SHEET.M_PERSON_ALIAS, SHEET.M_PLACE, SHEET.M_PLACE_ALIAS,
      SHEET.M_ALIAS, SHEET.M_GEO_POINT, SHEET.M_DESTINATION,
      SHEET.FACT_DELIVERY, SHEET.Q_REVIEW, SHEET.SYS_LOG, SHEET.SYS_CONFIG,
      SHEET.SYS_TH_GEO, SHEET.RPT_QUALITY,
      SHEET.DAILY_JOB, SHEET.INPUT, SHEET.EMPLOYEE, SHEET.SOURCE,
    ];

    requiredSheets.forEach(name => {
      if (!ss.getSheetByName(name)) errors.push('ไม่พบชีต: ' + name);
    });

    try {
      const apiKey = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
      if (!apiKey)            warns.push('GEMINI_API_KEY ยังไม่ได้ตั้งค่า');
      else if (apiKey.length < 20) warns.push('GEMINI_API_KEY อาจไม่ถูกต้อง');
    } catch (e) {
      warns.push('ไม่สามารถอ่าน GEMINI_API_KEY: ' + e.message);
    }

    if (errors.length === 0 && warns.length === 0) {
      // [FIX BUG-04 v5.5.001] เปลี่ยน ui.alert() เป็น safeUiAlert_()
      safeUiAlert_('✅ System Integrity: ปกติทุกอย่าง!\nVersion: ' + APP_VERSION);
      return;
    }

    let msg = '';
    if (errors.length > 0) {
      msg += '❌ พบ Error ' + errors.length + ' รายการ:\n';
      msg += errors.map(e => '  • ' + e).join('\n') + '\n\n💡 รัน สร้างชีตทั้งหมด\n\n';
    }
    if (warns.length > 0) {
      msg += '⚠️ พบ Warning ' + warns.length + ' รายการ:\n';
      msg += warns.map(w => '  • ' + w).join('\n');
    }
    // [FIX BUG-04 v5.5.001] เปลี่ยน ui.alert() เป็น safeUiAlert_()
    safeUiAlert_(msg);

  } catch (err) {
    logError('App', 'checkSystemIntegrity: ' + err.message, err);
    safeUiAlert_('❌ checkSystemIntegrity ล้มเหลว: ' + err.message);
  }
}

function setupEnvironment() {
  // [FIX S1 v5.5.002] เพิ่ม try-catch ครอบทั้งฟังก์ชัน — Rule 12
  try {
    const ui = SpreadsheetApp.getUi();

    const result = ui.prompt(
      '⚙️ ตั้งค่า Gemini API Key',
      'กรุณาใส่ Gemini API Key:\n(ได้จาก https://aistudio.google.com/app/apikey)\n\n' +
      'รองรับทั้งรูปแบบเก่า (AIza...) และรูปแบบใหม่ (AQ...)',
      ui.ButtonSet.OK_CANCEL
    );

    if (result.getSelectedButton() !== ui.Button.OK) return;

    const inputKey = result.getResponseText().trim();

    // [FIX v5.5.006] รองรับ Gemini API Key ทั้ง 2 รูปแบบ:
    // - Legacy (v1): ขึ้นต้นด้วย "AIza" + 35 ตัวอักษร (รวม 39 ตัว)
    // - New (v2):    ขึ้นต้นด้วย "AQ."   + Base64URL chars (40-80 ตัว)
    // Charset ที่อนุญาต: A-Z, a-z, 0-9, -, _ (Base64 URL-safe)
    const legacyPattern = /^AIza[0-9A-Za-z\-_]{35}$/;
    const newPattern    = /^AQ\.[0-9A-Za-z\-_]{30,80}$/;
    const isValidKey    = legacyPattern.test(inputKey) || newPattern.test(inputKey);

    if (!inputKey || !isValidKey) {
      // [FIX BUG-04 v5.5.001] เปลี่ยน ui.alert() เป็น safeUiAlert_()
      safeUiAlert_(
        '❌ API Key ไม่ถูกต้อง\n\n' +
        'รูปแบบที่รองรับ:\n' +
        '• รูปแบบเก่า: ขึ้นต้นด้วย "AIza" ยาว 39 ตัวอักษร\n' +
        '• รูปแบบใหม่: ขึ้นต้นด้วย "AQ."   ยาว 33-83 ตัวอักษร\n\n' +
        'กรุณาตรวจสอบคีย์อีกครั้ง หรือขอคีย์ใหม่จาก\n' +
        'https://aistudio.google.com/app/apikey'
      );
      return;
    }

    PropertiesService.getScriptProperties()
                     .setProperty('GEMINI_API_KEY', inputKey);
    logInfo('App', 'ตั้งค่า GEMINI_API_KEY สำเร็จ (รูปแบบ: ' + (inputKey.startsWith('AQ.') ? 'v2' : 'v1') + ')');
    // [FIX BUG-04 v5.5.001] เปลี่ยน ui.alert() เป็น safeUiAlert_()
    safeUiAlert_('✅ บันทึก API Key เรียบร้อยแล้วครับ!');
  } catch (err) {
    logError('App', 'setupEnvironment: ' + err.message, err);
    safeUiAlert_('❌ ตั้งค่า API Key ล้มเหลว: ' + err.message);
  }
}

/**
 * populateAliasFromSCGRawData — [FIX-01 v5.4.003] Public wrapper สำหรับเรียกจาก Menu
 * GAS Menu ไม่สามารถเรียกฟังก์ชัน private (ขึ้นต้นด้วย _) ได้
 * จึงต้องมี public wrapper เพื่อให้ Menu เรียกได้
 */
function populateAliasFromSCGRawData() {
  return populateAliasFromSCGRawData_();
}

function showVersionInfo() {
  const msg =
    `🚚 ${APP_NAME}\n` +
    `Version: ${APP_VERSION}\n` +
    `Schema: v${SCHEMA_VERSION}\n` +
    `Audit Cycles: 11 (CRITICAL → PERF → SECURITY → REVIEW15 → REFACTOR → SYNC → CACHE-FIX → CACHE-CLEANUP → DOC-SYNC → GOOGLE-MAPS-REFACTOR → DRIVER-VERIFIED)\n\n` +
    `📦 Modules (22 files):\n` +
    `  00_App.gs                v5.5.015\n` +
    `  01_Config.gs             v5.5.015\n` +
    `  02_Schema.gs             v5.5.015\n` +
    `  03_SetupSheets.gs        v5.5.015\n` +
    `  04_SourceRepository.gs   v5.5.015\n` +
    `  05_NormalizeService.gs   v5.5.015\n` +
    `  06_PersonService.gs      v5.5.015\n` +
    `  07_PlaceService.gs       v5.5.015\n` +
    `  08_GeoService.gs         v5.5.015\n` +
    `  09_DestinationService.gs v5.5.015\n` +
    `  10_MatchEngine.gs        v5.5.015\n` +
    `  11_TransactionService.gs v5.5.015\n` +
    `  12_ReviewService.gs      v5.5.015\n` +
    `  13_ReportService.gs      v5.5.015\n` +
    `  14_Utils.gs              v5.5.015\n` +
    `  15_GoogleMapsAPI.gs      v5.5.015\n` +
    `  16_GeoDictionaryBuilder.gs     v5.5.015\n` +
    `  17_SearchService.gs      v5.5.015\n` +
    `  18_ServiceSCG.gs         v5.5.015\n` +
    `  19_Hardening.gs          v5.5.015\n` +
    `  20_ThGeoService.gs       v5.5.015\n` +
    `  21_AliasService.gs       v5.5.015\n\n` +
    `⚙️ Core System (Group 0): App, Config, Schema, Setup, Utils, Hardening\n` +
    `🟩 Group 1 — Master DB: Normalize, Person, Place, Geo, Dest, Match, GeoDict, ThGeo, Alias\n` +
    `🟦 Group 2 — Daily Ops: SourceRepo, Transaction, Review, Report, Maps, Search, SCG`;

  // [FIX BUG-04 v5.5.001] เปลี่ยน ui.alert() เป็น safeUiAlert_()
  safeUiAlert_(msg);
}

// ============================================================
// SECTION 7: Diagnostic Tool — [NEW v5.4.001]
// ============================================================

/**
 * diagnoseSystemState — วินิจฉัยปัญหา Pipeline แบบครบวงจร
 * [REFACTOR v5.5.001] แยกเป็น 4 sub-functions เพื่อลดความยาว (145→28 บรรทัด) — กฎข้อ 1.1
 * ตรวจสอบ: ชีตมีอยู่ไหม, คอลัมน์ครบไหม, ข้อมูลว่างไหม, SYNC_STATUS, Cache, ฯลฯ
 * เรียกจากเมนู: 🔧 ระบบ > 🔍 วินิจฉัย Pipeline (Diagnostic)
 */
function diagnoseSystemState() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const lines = [];
    const fixes = [];

    lines.push('=== 🔍 LMDS Pipeline Diagnostic ===');
    lines.push(`Version: ${APP_VERSION} | Schema: v${SCHEMA_VERSION}`);

    diagnoseRequiredSheets_(ss, lines, fixes);
    diagnoseColumnMismatch_(ss, lines, fixes);
    diagnoseSourceData_(ss, lines, fixes);
    diagnoseRecentErrors_(ss, lines, fixes);

    if (fixes.length > 0) {
      lines.push('');
      lines.push('🔧 วิธีแก้ปัญหา:');
      fixes.forEach((f, i) => { lines.push(`  ${i + 1}. ${f}`); });
    } else {
      lines.push('');
      lines.push('✅ ไม่พบปัญหาที่ชัดเจน — ระบบน่าจะทำงานปกติ');
    }
    safeUiAlert_(lines.join('\n'));
  } catch (err) {
    logError('App', 'diagnoseSystemState: ' + err.message, err);
    safeUiAlert_('❌ Diagnostic ล้มเหลว: ' + err.message);
  }
}

/**
 * diagnoseRequiredSheets_ — [REFACTOR v5.5.001] ตรวจชีตที่จำเป็น
 * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} ss
 * @param {string[]} lines - output lines array
 * @param {string[]} fixes - output fixes array
 */
function diagnoseRequiredSheets_(ss, lines, fixes) {
  lines.push('');
  lines.push('📋 ชีตที่จำเป็น:');
  const requiredSheets = [
    SHEET.SOURCE, SHEET.M_PERSON, SHEET.M_PERSON_ALIAS,
    SHEET.M_PLACE, SHEET.M_PLACE_ALIAS, SHEET.M_ALIAS,
    SHEET.M_GEO_POINT, SHEET.M_DESTINATION, SHEET.FACT_DELIVERY,
    SHEET.Q_REVIEW, SHEET.SYS_LOG, SHEET.SYS_TH_GEO
  ];
  requiredSheets.forEach(name => {
    const sheet = ss.getSheetByName(name);
    if (!sheet) {
      lines.push(`  ❌ ${name}: ไม่พบชีต`);
      fixes.push(`สร้างชีต ${name} — รัน "สร้างชีตทั้งหมด"`);
    } else {
      lines.push(`  ✅ ${name}: ${Math.max(0, sheet.getLastRow() - 1)} แถวข้อมูล`);
    }
  });
}

/**
 * diagnoseColumnMismatch_ — [REFACTOR v5.5.001] ตรวจ Column Mismatch
 */
function diagnoseColumnMismatch_(ss, lines, fixes) {
  lines.push('');
  lines.push('📐 ตรวจสอบคอลัมน์ (SCHEMA vs ชีตจริง):');
  const schemaChecks = [
    { name: SHEET.M_PERSON,       label: 'M_PERSON' },
    { name: SHEET.M_PLACE,        label: 'M_PLACE' },
    { name: SHEET.M_GEO_POINT,    label: 'M_GEO_POINT' },
    { name: SHEET.M_ALIAS,        label: 'M_ALIAS' },
    { name: SHEET.FACT_DELIVERY,  label: 'FACT_DELIVERY' },
  ];
  schemaChecks.forEach(c => {
    const sheet = ss.getSheetByName(c.name);
    const schema = SCHEMA[c.name];
    if (!sheet || !schema) return;
    const actualCols = sheet.getLastColumn();
    const schemaCols = schema.length;
    if (actualCols < schemaCols) {
      lines.push(`  ❌ ${c.label}: ชีตมี ${actualCols} คอลัมน์ แต่ SCHEMA ต้องการ ${schemaCols}`);
      fixes.push(`เพิ่มคอลัมน์ใน ${c.label} — รัน "สร้างชีตทั้งหมด" (Auto-Repair)`);
    } else {
      lines.push(`  ✅ ${c.label}: ${actualCols}/${schemaCols} คอลัมน์`);
    }
  });
}

/**
 * diagnoseSourceData_ — [REFACTOR v5.5.001] ตรวจข้อมูลต้นทาง (Source)
 */
function diagnoseSourceData_(ss, lines, fixes) {
  lines.push('');
  lines.push('📊 ข้อมูลต้นทาง (Source):');
  const srcSheet = ss.getSheetByName(SHEET.SOURCE);
  if (!srcSheet || srcSheet.getLastRow() <= 1) {
    lines.push(`  ❌ ไม่พบข้อมูลในชีต: ${SHEET.SOURCE}`);
    fixes.push(`ตรวจสอบชื่อชีต Source: "${SHEET.SOURCE}"`);
    return;
  }
  const srcTotal = srcSheet.getLastRow() - 1;
  const srcCols = srcSheet.getLastColumn();
  lines.push(`  แถวทั้งหมด: ${srcTotal} | คอลัมน์: ${srcCols}`);

  const sampleMax = Math.min(srcTotal, 500);

  // ตรวจ SYNC_STATUS
  const syncCol = SRC_IDX.SYNC_STATUS + 1;
  if (srcCols >= syncCol) {
    const syncData = srcSheet.getRange(2, syncCol, sampleMax, 1).getValues();
    const doneCount = syncData.filter(r => String(r[0]).trim() === SCG_CONFIG.SYNC_DONE_VALUE).length;
    const pendingCount = srcTotal - doneCount;
    lines.push(`  SYNC_STATUS: ประมวลผลแล้ว=${doneCount} ค้างอยู่=${pendingCount}`);
    if (pendingCount === 0) {
      lines.push(`  ⚠️ ทุกแถวถูกประมวลผลแล้ว — Pipeline จะไม่สร้างข้อมูลใหม่`);
      fixes.push('รีเซ็ต SYNC_STATUS — รัน "รีเซ็ตสถานะ SYNC (เพื่อรันใหม่)"');
    }
  } else {
    lines.push(`  ⚠️ ชีต Source ไม่มีคอลัมน์ SYNC_STATUS (col ${syncCol}) แต่มีแค่ ${srcCols} คอลัมน์`);
  }

  // ตรวจ INVOICE_NO
  const invCol = SRC_IDX.INVOICE_NO + 1;
  if (srcCols >= invCol) {
    const invData = srcSheet.getRange(2, invCol, sampleMax, 1).getValues();
    const hasInvCount = invData.filter(r => String(r[0]).trim()).length;
    lines.push(`  INVOICE_NO: ${hasInvCount}/${sampleMax} แถวมีค่า`);
    if (hasInvCount === 0) fixes.push('ชีต Source ไม่มี Invoice No — ตรวจสอบโครงสร้างชีต');
  }

  // ตรวจ LAT/LNG
  const latCol = SRC_IDX.LAT + 1;
  const lngCol = SRC_IDX.LNG + 1;
  if (srcCols >= lngCol) {
    const latLngData = srcSheet.getRange(2, latCol, sampleMax, 2).getValues();
    const hasGeoCount = latLngData.filter(r => Number(r[0]) !== 0 && Number(r[1]) !== 0 && !isNaN(Number(r[0])) && !isNaN(Number(r[1]))).length;
    lines.push(`  LAT/LNG: ${hasGeoCount}/${sampleMax} แถวมีพิกัด`);
    if (hasGeoCount === 0) {
      lines.push(`  ⚠️ ไม่มีพิกัดเลย — ทุกแถวจะเข้า REVIEW (INVALID_LATLNG)`);
      fixes.push('ข้อมูล Source ไม่มีพิกัด — ตรวจสอบคอลัมน์ LAT/LNG');
    }
  }
}

/**
 * diagnoseRecentErrors_ — [REFACTOR v5.5.001] ตรวจ Error ล่าสุดใน SYS_LOG
 */
function diagnoseRecentErrors_(ss, lines, fixes) {
  lines.push('');
  lines.push('⚠️ Error ล่าสุดใน SYS_LOG:');
  const logSheet = ss.getSheetByName(SHEET.SYS_LOG);
  if (!logSheet || logSheet.getLastRow() <= 1) return;

  const logRows = Math.min(20, logSheet.getLastRow() - 1);
  const logData = logSheet.getRange(logSheet.getLastRow() - logRows + 1, 1, logRows, 6).getValues();
  const errors = logData.filter(r => String(r[SYS_LOG_IDX.LEVEL]).trim() === 'ERROR').slice(-5);
  if (errors.length === 0) {
    lines.push('  ✅ ไม่มี Error ใน 20 แถวล่าสุด');
  } else {
    errors.forEach(e => {
      const mod = String(e[SYS_LOG_IDX.MODULE] || '').substring(0, 20);
      const msg = String(e[SYS_LOG_IDX.MESSAGE] || '').substring(0, 80);
      lines.push(`  ❌ [${mod}] ${msg}`);
    });
    fixes.push('ตรวจสอบ Error ใน SYS_LOG — อาจเป็นสาเหตุที่ชีตว่าง');
  }
}
