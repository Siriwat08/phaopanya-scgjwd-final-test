/**
 * VERSION: 5.5.015
 * FILE: 19_Hardening.gs
 * LMDS V5.5 — System Hardening & Preflight Audit
 * [FIX BUG-A2] v5.4.003: runPreflightAudit() เพิ่ม try-catch
 * [ADD v5.4.003] buildGlobalAliasDedupSet_() — helper ที่ generatePersonAliasesFromHistory ต้องใช้
 * ===================================================
 * PURPOSE:
 *   ตรวจสอบความสมบูรณ์ของข้อมูลก่อนประมวลผล (Preflight Audit)
 *   และตรวจจับปัญหาซ้ำซ้อน
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
 *     - [ADD] Comprehensive header documentation
 *   v5.4.000 (2026-05-24):
 *     - [UPGRADE] Version bump to 5.4.000
 *     - [ADD] Comprehensive header documentation
 *     - [ADD] DEPENDENCIES section with module relationships
 *     - [ENHANCE] Detailed module interconnection mapping
 *   v5.2.010:
 *     - [ADD] generatePersonAliasesFromHistory: สร้าง Alias อัตโนมัติจาก FACT_DELIVERY
 * ===================================================
 * DEPENDENCIES:
 *   REQUIRES (Load Order):
 *     - 01_Config (SHEET.*, SRC_IDX.*, FACT_IDX.*, PERSON_ALIAS_IDX.*, SCHEMA)
 *     - 02_Schema (SCHEMA)
 *     - 06_PersonService (loadAllPersons_, loadAllAliases_)
 *     - 07_PlaceService (loadAllPlaces_)
 *     - 08_GeoService (loadAllGeos_)
 *     - 09_DestinationService (loadAllDestinations_)
 *     - 11_TransactionService (loadAllFacts_)
 *     - 05_NormalizeService (normalizeForCompare)
 *     - 14_Utils (generateShortId, normalizeInvoiceNo)
 *   CALLS (Invokes):
 *     - loadAllPersons_() → 06_PersonService
 *     - loadAllAliases_() → 06_PersonService
 *     - normalizeForCompare() → 05_NormalizeService
 *     - generateShortId() → 14_Utils
 *     - normalizeInvoiceNo() → 14_Utils
 *     - invalidateAliasCache_() → 06_PersonService
 *     - logInfo() → 03_SetupSheets
 *     - flushLogBuffer_() → 03_SetupSheets (called in finally of runPreflightAudit) [V5.5.008 P2 #11]
 *   EXPORTS TO:
 *     - 00_App (runPreflightAudit, detectDoubleProcessing, generatePersonAliasesFromHistory — menu trigger)
 *   SHEETS ACCESSED:
 *     - SHEET.SOURCE (Read: sync status integrity check)
 *     - SHEET.FACT_DELIVERY (Read: double processing detection)
 *     - SHEET.M_PERSON_ALIAS (Write: alias generation output)
 *     - All SHEET.* constants (Read: iterated via runPreflightAudit)
 * ===================================================
 * ARCHITECTURE:
 *   ┌─────────────────────────────────────────────────────┐
 *   │                19_Hardening.gs                      │
 *   │           System Hardening & Audit                  │
 *   ├─────────────────────────────────────────────────────┤
 *   │                                                     │
 *   │  runPreflightAudit ─── Schema integrity check       │
 *   │       │                  + API key validation       │
 *   │       │                  + flushLogBuffer_() in     │
 *   │       │                    finally [V5.5.008 #11]   │
 *   │                                                     │
 *   │  fixMissingSyncStatus ── Batch sync status repair   │
 *   │                                                     │
 *   │  detectDoubleProcessing ─ Duplicate detection       │
 *   │       │                  in FACT_DELIVERY           │
 *   │       │                                             │
 *   │  generatePersonAliasesFromHistory                   │
 *   │       └── Auto-alias generation from                │
 *   │           delivery history (FACT_DELIVERY)          │
 *   │                                                     │
 *   └─────────────────────────────────────────────────────┘
 * ===================================================
 */

// [PERF-007] Checkpoint key for generatePersonAliasesFromHistory Resume mechanism
var HARDENING_ALIAS_CHECKPOINT_KEY = 'HARDENING_ALIAS_CHECKPOINT';

// ============================================================
// SECTION 1: runPreflightAudit
// [FIX BUG-A2] เพิ่ม try-catch outer
// ============================================================

function runPreflightAudit() {
  // [FIX BUG-A2] try-catch ครอบ
  // [FIX BUG-04 v5.5.001] เปลี่ยน ui.alert() เป็น safeUiAlert_() — trigger-safe
  try {
    const logs = [];

    logInfo('Hardening', 'เริ่มรัน Preflight Audit');

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    Object.keys(SHEET).forEach(key => {
      const sheetName = SHEET[key];
      const sheet     = ss.getSheetByName(sheetName);
      if (!sheet) {
        logs.push('❌ ไม่พบชีต: ' + sheetName);
      } else {
        const expectedCols = SCHEMA[sheetName] ? SCHEMA[sheetName].length : 0;
        if (expectedCols > 0 && sheet.getLastColumn() < expectedCols) {
          logs.push('⚠️ ชีต ' + sheetName + ' มีคอลัมน์น้อยกว่า Schema (' +
                    sheet.getLastColumn() + '/' + expectedCols + ')');
        }
      }
    });

    const props = PropertiesService.getScriptProperties().getProperties();
    if (!props.GEMINI_API_KEY) {
      logs.push('⚠️ ยังไม่ได้ตั้งค่า GEMINI_API_KEY');
    }

    const srcSheet = ss.getSheetByName(SHEET.SOURCE);
    if (srcSheet) {
      const lastRow = srcSheet.getLastRow();
      if (lastRow > 1) {
        const statusCol  = SRC_IDX.SYNC_STATUS + 1;
        const statusData = srcSheet.getRange(2, statusCol, lastRow - 1, 1).getValues();
        const emptyCount = statusData.filter(r => !r[0]).length;
        if (emptyCount > 0) {
          logs.push('ℹ️ พบแถวที่ไม่มีสถานะ Sync ใน Source: ' + emptyCount + ' แถว');
        }
      }
    }

    if (logs.length === 0) {
      safeUiAlert_('✅ Preflight Audit: ระบบพร้อมทำงาน 100%');
    } else {
      safeUiAlert_('📊 ผลการตรวจสอบ Preflight Audit:\n\n' +
               logs.join('\n') +
               '\n\nพบจุดที่ควรตรวจสอบ ' + logs.length + ' รายการ');
    }

  } catch (err) {
    logError('Hardening', 'runPreflightAudit: ' + err.message, err);
    safeUiAlert_('❌ Preflight Audit ล้มเหลว: ' + err.message);
  } finally {
    // [FIX v5.5.008 P2 #11] flush log buffer ก่อน exit — ป้องกัน log entries <50 หาย
    if (typeof flushLogBuffer_ === 'function') flushLogBuffer_();
  }
}

// ============================================================
// SECTION 2: fixMissingSyncStatus [FIX v5.5.001: เพิ่ม try-catch]
// ============================================================

function fixMissingSyncStatus() {
  // [FIX v5.5.001] เพิ่ม try-catch ครอบทั้งฟังก์ชัน — เช่นเดียวกับ entry-point อื่นๆ
  try {
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET.SOURCE);
  if (!sheet) return;
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return;

  const statusCol = SRC_IDX.SYNC_STATUS + 1;
  const range     = sheet.getRange(2, statusCol, lastRow - 1, 1);
  const data      = range.getValues();
  let   fixed     = 0;

  for (let i = 0; i < data.length; i++) {
    if (!data[i][0]) { data[i][0] = 'PENDING'; fixed++; }
  }
  if (fixed > 0) {
    range.setValues(data);
    SpreadsheetApp.getActiveSpreadsheet()
      .toast('✅ ซ่อมแซมสถานะ Sync สำเร็จ: ' + fixed + ' แถว', 'Hardening');
  }
  } catch (e) {
    logError('Hardening', 'fixMissingSyncStatus ล้มเหลว: ' + e.message, e);
    safeUiAlert_('❌ fixMissingSyncStatus ล้มเหลว: ' + e.message);
  }
}

// ============================================================
// SECTION 3: detectDoubleProcessing (ไม่เปลี่ยน)
// ============================================================

function detectDoubleProcessing() {
  try {
    const ss    = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(SHEET.FACT_DELIVERY);
    if (!sheet || sheet.getLastRow() < 2) return;

    const invoiceData = sheet.getRange(
      2, FACT_IDX.INVOICE_NO + 1, sheet.getLastRow() - 1, 1
    ).getValues();
    const counts     = {};
    const duplicates = [];

    invoiceData.forEach(r => {
      const inv = normalizeInvoiceNo(r[0]);
      if (!inv) return;
      counts[inv] = (counts[inv] || 0) + 1;
    });
    Object.keys(counts).forEach(inv => {
      if (counts[inv] > 1) duplicates.push(inv + ' (' + counts[inv] + ' ครั้ง)');
    });

    // [FIX BUG-05 v5.5.001] เปลี่ยน getUi().alert() เป็น safeUiAlert_() — trigger-safe
    if (duplicates.length === 0) {
      safeUiAlert_('✅ ไม่พบข้อมูลซ้ำใน FACT_DELIVERY');
    } else {
      safeUiAlert_(
        '⚠️ พบ Invoice ซ้ำ ' + duplicates.length + ' รายการ:\n\n' +
        duplicates.slice(0, 10).join('\n') +
        (duplicates.length > 10 ? '\n...และอื่นๆ' : '')
      );
    }
  } catch (err) {
    logError('Hardening', 'detectDoubleProcessing ล้มเหลว: ' + err.message, err);
    safeUiAlert_('เกิดข้อผิดพลาด: ' + err.message);
  }
}

// ============================================================
// SECTION 4: [REF-012] buildGlobalAliasDedupSet_ MOVED to 14_Utils.gs
// The function is now centralized in 14_Utils.gs Section 11.
// All callers (Hardening, AliasService) use the global function.
// ============================================================

// ============================================================
// SECTION 5: generatePersonAliasesFromHistory
// [REFACTOR-05] แยก helper: buildExistingPersonAliasSet_, flushPersonAliasRows_
// ============================================================

function generatePersonAliasesFromHistory() {
  // [SEC-002] Authorization Guard
  if (typeof isAuthorizedUser_ === 'function' && !isAuthorizedUser_()) {
    safeUiAlert_('🔒 คุณไม่มีสิทธิ์รัน Hardening\nกรุณาติดต่อ Admin');
    return;
  }
  // [FIX v5.5.001] Named constant สำหรับ alias enrichment confidence score
  const ALIAS_ENRICH_SCORE = 95;

  try {
    const ss         = SpreadsheetApp.getActiveSpreadsheet();
    const factSheet  = ss.getSheetByName(SHEET.FACT_DELIVERY);
    const aliasSheet = ss.getSheetByName(SHEET.M_PERSON_ALIAS);
    if (!factSheet || !aliasSheet) {
      safeUiAlert_('❌ ไม่พบชีต FACT_DELIVERY หรือ M_PERSON_ALIAS');
      return;
    }

    const factRows = factSheet.getLastRow();
    if (factRows < 2) {
      safeUiAlert_('ℹ️ ไม่มีข้อมูลประวัติใน FACT_DELIVERY');
      return;
    }

    ss.toast('กำลังวิเคราะห์ประวัติการจัดส่งเพื่อสร้าง Alias...', 'Processing', 5);

    const factData = factSheet.getRange(
      2, 1, factRows - 1, SCHEMA[SHEET.FACT_DELIVERY].length
    ).getValues();

    // ─── [PERF-007] โหลด Checkpoint ───
    //   ถ้ามี checkpoint (จากการ Time Guard หยุดกลางคันรอบก่อน) → เริ่มจาก idx นั้น
    //   ถ้าไม่มี → เริ่มจาก 0
    //   Stale protection: checkpoint เก่ากว่า 24 ชม. → auto clear (กัน garbage)
    var checkpoint = loadHardeningAliasCheckpoint_();
    var startIdx = checkpoint.startIdx || 0;

    if (startIdx > 0) {
      ss.toast('🔄 Resume จากแถว ' + (startIdx + 1) + '...', APP_NAME, 5);
      logInfo('Hardening', 'generatePersonAliasesFromHistory: resume จาก idx ' + startIdx);
    }

    // โหลด Person Map
    const allPersons        = loadAllPersons_();
    const personCanonicalMap = new Map();
    const personUuidMap      = new Map();
    allPersons.forEach(function(p) {
      if (p.personId && p.canonical)   personCanonicalMap.set(p.personId, normalizeForCompare(p.canonical));
      if (p.personId && p.masterUuid)  personUuidMap.set(p.personId, p.masterUuid);
    });

    // [REFACTOR-05] ใช้ buildExistingPersonAliasSet_() แทน inline code
    const existingAliasSet = buildExistingPersonAliasSet_();

    // [FIX BUG-B1] buildGlobalAliasDedupSet_ โหลด M_ALIAS ครั้งเดียว
    const existingGlobalAliasSet = buildGlobalAliasDedupSet_();

    let newAliasRows  = [];   // M_PERSON_ALIAS
    let newGlobalRows = [];   // M_ALIAS
    const now           = new Date();
    const hardeningStart = new Date();
    const hardeningLimit = AI_CONFIG.TIME_LIMIT_MS || 300000;  // 5 นาที
    let timedOut       = false;

    // NOTE: ALIAS_ENRICH_SCORE ประกาศที่ต้นฟังก์ชัน (บรรทัด 248)

    // ─── [PERF-007] เริ่มลูปจาก startIdx (จาก checkpoint) แทน 0 ───
    //   เดิม: ทุกครั้งเริ่มจาก idx 0 → รอบที่ 2 ประมวลผล 1,500 แถวแรกซ้ำ (CPU waste ~30-60s)
    //   ใหม่: resume จาก checkpoint → ประหยัดเวลา ~50-70% สำหรับการ hardening ครั้งใหญ่
    for (let idx = startIdx; idx < factData.length; idx++) {
      // [REFACTOR-05] Time Guard: flush แล้ว break + บันทึก checkpoint
      if (idx % 100 === 0 && (new Date() - hardeningStart) > (hardeningLimit - 30000)) {
        if (newAliasRows.length + newGlobalRows.length > 0) {
          const flushedPA = flushPersonAliasRows_(aliasSheet, newAliasRows);
          const flushedGA = flushGlobalAliasRows_(ss, newGlobalRows);
          newAliasRows = [];
          newGlobalRows = [];
          logWarn('Hardening', `generatePersonAliasesFromHistory: flushed partial at ${idx}/${factData.length} (PA:${flushedPA}, GA:${flushedGA})`);
        }
        // [PERF-007] บันทึก checkpoint ก่อน break → resume รอบถัดไป
        saveHardeningAliasCheckpoint_(idx);
        timedOut = true;
        break;
      }

      const aliasResult = hardeningBuildOneAliasRow_(
        factData[idx], personCanonicalMap, personUuidMap,
        existingAliasSet, existingGlobalAliasSet, ALIAS_ENRICH_SCORE, now
      );
      if (aliasResult.paRow) newAliasRows.push(aliasResult.paRow);
      if (aliasResult.gaRow) newGlobalRows.push(aliasResult.gaRow);
    }

    // Final flush
    const totalPA = flushPersonAliasRows_(aliasSheet, newAliasRows);
    const totalGA = flushGlobalAliasRows_(ss, newGlobalRows);

    // [PERF-007] ล้าง checkpoint เมื่อเสร็จสมบูรณ์ (ถ้าไม่ Timeout)
    if (!timedOut) {
      clearHardeningAliasCheckpoint_();
    }

    const timeoutMsg = timedOut
      ? '\n\n⚠️ หยุดก่อนเพราะ Timeout — บันทึกตำแหน่งไว้แล้ว กด Run ใหม่จะทำต่อ'
      : '';
    safeUiAlert_(
      (totalPA > 0 || totalGA > 0)
        ? '✅ สร้าง Alias สำเร็จ!\n' +
          '- M_PERSON_ALIAS: ' + totalPA + ' รายการ\n' +
          '- M_ALIAS: ' + totalGA + ' รายการ' +
          timeoutMsg
        : 'ℹ️ ตรวจสอบเรียบร้อย: ข้อมูล Alias อัปเดตถ้วนแล้ว' +
          timeoutMsg
    );

  } catch (err) {
    logError('Hardening', 'generatePersonAliasesFromHistory ล้มเหลว: ' + err.message, err);
    safeUiAlert_('เกิดข้อผิดพลาด: ' + err.message);
  } finally {
    // [PERF-007] flushLogBuffer_ ใน finally — กัน log entries สูญหายเมื่อ Timeout
    if (typeof flushLogBuffer_ === 'function') flushLogBuffer_();
  }
}

// ============================================================
// SECTION 6b: [PERF-007] generatePersonAliasesFromHistory Checkpoint Helpers
//   ใช้ PropertiesService เก็บตำแหน่ง idx ปัจจุบัน — เหมือน MIGRATION_HybridAliasSystem pattern
// ============================================================

/**
 * saveHardeningAliasCheckpoint_ — [PERF-007] บันทึกตำแหน่ง generatePersonAliasesFromHistory ปัจจุบัน
 *   เรียกเมื่อ Time Guard หยุดกลางคัน → resume รอบถัดไปเริ่มจาก idx นี้
 * @param {number} idx - ตำแหน่ง array index ปัจจุบัน (0-based)
 */
function saveHardeningAliasCheckpoint_(idx) {
  PropertiesService.getScriptProperties().setProperty(
    HARDENING_ALIAS_CHECKPOINT_KEY,
    JSON.stringify({ startIdx: idx, timestamp: Date.now() })
  );
}

/**
 * loadHardeningAliasCheckpoint_ — [PERF-007] โหลดตำแหน่ง generatePersonAliasesFromHistory ที่บันทึกไว้
 *   Stale protection: checkpoint เก่ากว่า 24 ชม. → auto clear (กัน garbage)
 * @return {{ startIdx: number, timestamp: number }}
 */
function loadHardeningAliasCheckpoint_() {
  var raw = PropertiesService.getScriptProperties().getProperty(HARDENING_ALIAS_CHECKPOINT_KEY);
  if (!raw) return { startIdx: 0 };
  try {
    var cp = JSON.parse(raw);
    // Stale protection: เก่ากว่า 24 ชม. → clear
    if (cp.timestamp && (Date.now() - cp.timestamp) > 24 * 60 * 60 * 1000) {
      clearHardeningAliasCheckpoint_();
      return { startIdx: 0 };
    }
    return cp;
  } catch (e) {
    return { startIdx: 0 };
  }
}

/**
 * clearHardeningAliasCheckpoint_ — [PERF-007] ล้าง checkpoint หลัง generatePersonAliasesFromHistory เสร็จสมบูรณ์
 */
function clearHardeningAliasCheckpoint_() {
  PropertiesService.getScriptProperties().deleteProperty(HARDENING_ALIAS_CHECKPOINT_KEY);
}

/**
 * hardeningBuildOneAliasRow_ — processes 1 fact row for generatePersonAliasesFromHistory
 * Checks personId, rawName, canonical match, dedup sets, and builds PA/GA rows
 * @param {Array} factRow - single row from FACT_DELIVERY data
 * @param {Map} personCanonicalMap - personId → normalizedCanonical
 * @param {Map} personUuidMap - personId → masterUuid
 * @param {Set} existingAliasSet - dedup set for M_PERSON_ALIAS (mutated in place)
 * @param {Set} existingGlobalAliasSet - dedup set for M_ALIAS (mutated in place)
 * @param {number} aliasEnrichScore - confidence score for alias rows
 * @param {Date} now - timestamp
 * @return {{ paRow: Array|null, gaRow: Array|null }}
 */
function hardeningBuildOneAliasRow_(factRow, personCanonicalMap, personUuidMap, existingAliasSet, existingGlobalAliasSet, aliasEnrichScore, now) {
  const pId     = String(factRow[FACT_IDX.PERSON_ID]   || '').trim();
  const rawName = String(factRow[FACT_IDX.SHIP_TO_NAME] || '').trim();
  if (!pId || !rawName) return { paRow: null, gaRow: null };

  const rawNorm = normalizeForCompare(rawName);
  if (!rawNorm || rawNorm.length < 2) return { paRow: null, gaRow: null };

  const canonicalNorm = personCanonicalMap.get(pId);
  if (canonicalNorm && canonicalNorm === rawNorm) return { paRow: null, gaRow: null };

  let paRow = null;
  let gaRow = null;

  // M_PERSON_ALIAS
  const paKey = pId + '::' + rawNorm;
  if (!existingAliasSet.has(paKey)) {
    existingAliasSet.add(paKey);
    paRow = [generateShortId('PA'), pId, rawName, aliasEnrichScore, now, true];
  }

  // M_ALIAS (Batch — ไม่เรียก createGlobalAlias ใน loop)
  const masterUuid = personUuidMap.get(pId);
  if (masterUuid) {
    const globalKey = 'PERSON::' + masterUuid + '::' + rawNorm;
    if (!existingGlobalAliasSet.has(globalKey)) {
      existingGlobalAliasSet.add(globalKey);
      gaRow = [
        generateShortId('A'), masterUuid, rawName, 'PERSON',
        aliasEnrichScore, 'HISTORY_ENRICH', now, true
      ];
    }
  }

  return { paRow: paRow, gaRow: gaRow };
}

/**
 * buildExistingPersonAliasSet_ — [REFACTOR-05] โหลด M_PERSON_ALIAS เป็น dedup Set
 * Format key: "personId::normalizedAlias"
 * @return {Set<string>}
 */
function buildExistingPersonAliasSet_() {
  const set = new Set();
  const existingAliasData = loadAllAliases_();
  existingAliasData.forEach(function(r) {
    if (!r[PERSON_ALIAS_IDX.ACTIVE_FLAG]) return;
    const pId   = String(r[PERSON_ALIAS_IDX.PERSON_ID]  || '').trim();
    const aNorm = normalizeForCompare(r[PERSON_ALIAS_IDX.ALIAS_NAME]);
    if (pId && aNorm) set.add(pId + '::' + aNorm);
  });
  return set;
}

/**
 * flushPersonAliasRows_ — [REFACTOR-05] Batch write M_PERSON_ALIAS + invalidate cache
 * @param {GoogleAppsScript.Spreadsheet.Sheet} aliasSheet
 * @param {Array[]} rows - new alias rows to write
 * @return {number} number of rows written
 */
function flushPersonAliasRows_(aliasSheet, rows) {
  if (!rows || rows.length === 0) return 0;
  aliasSheet.getRange(
    aliasSheet.getLastRow() + 1, 1,
    rows.length, SCHEMA[SHEET.M_PERSON_ALIAS].length
  ).setValues(rows);
  invalidateAliasCache_();
  return rows.length;
}

/**
 * flushGlobalAliasRows_ — [PERF-003] Batch write M_ALIAS + Pre-loaded dedup
 * เปลี่ยนจากการเรียก createGlobalAlias() ทีละแถว (O(N) reads + O(N) writes)
 * เป็นการโหลด dedup set 1 ครั้ง → ตรวจใน RAM → สะสมแถวใหม่ → batch setValues 1 ครั้ง
 * ลดจาก ~400-600 API calls (200 aliases) เหลือ ~2-3 API calls
 * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} ss
 * @param {Array[]} rows - new global alias rows: [aliasId, masterUuid, variantName, entityType, confidence, source, createdAt, activeFlag]
 * @return {number} number of rows written
 */
function flushGlobalAliasRows_(ss, rows) {
  if (!rows || rows.length === 0) return 0;

  // [PERF-003] โหลด dedup set 1 ครั้งก่อนลูป แทนที่จะเรียก createGlobalAlias() ทุกรอบ
  var existingSet = buildGlobalAliasDedupSet_();

  var newRows = [];
  rows.forEach(function(aliasRow) {
    var masterUuid   = String(aliasRow[ALIAS_IDX.MASTER_UUID]  || '');
    var variantName  = String(aliasRow[ALIAS_IDX.VARIANT_NAME] || '');
    var entityType   = String(aliasRow[ALIAS_IDX.ENTITY_TYPE]  || '');
    var confidence   = Number(aliasRow[ALIAS_IDX.CONFIDENCE]   || 100);
    var source       = String(aliasRow[ALIAS_IDX.SOURCE]       || 'MANUAL');

    // Dedup check ใน RAM
    var norm = normalizeForCompare(variantName);
    var dedupKey = entityType + '::' + masterUuid + '::' + norm;
    if (!norm || existingSet.has(dedupKey)) return;

    // เพิ่มเข้า set เพื่อป้องกัน duplicate ใน batch เดียวกัน
    existingSet.add(dedupKey);
    newRows.push(aliasRow);
  });

  // Batch write ทั้งหมดครั้งเดียว
  if (newRows.length > 0) {
    var mAliasSheet = ss.getSheetByName(SHEET.M_ALIAS);
    if (mAliasSheet) {
      mAliasSheet.getRange(
        mAliasSheet.getLastRow() + 1, 1,
        newRows.length, SCHEMA[SHEET.M_ALIAS].length
      ).setValues(newRows);

      // [FIX REV7-001] Invalidate M_ALIAS cache โดยตรง — รูปแบบเดียวกับ 10_MatchEngine.gs
      CacheService.getScriptCache().removeAll([CACHE_KEY.GLOBAL_ALIAS_ALL, CACHE_KEY.GLOBAL_ALIAS_REVERSE]);
    }
  }

  return newRows.length;
}

// ============================================================
// SECTION 6: Sheet Protection (SEC-005 Fix)
// ============================================================

/**
 * applySheetProtection_UI — [SEC-005] ตั้งค่า Protected Ranges และ Hidden Sheets
 * สำหรับชีตที่มีข้อมูล Sensitive (PII)
 * เฉพาะ Script Owner / Admin เท่านั้นที่สามารถแก้ไขชีตเหล่านี้ได้
 */
function applySheetProtection_UI() {
  // [SEC-002] Authorization Guard — เฉพาะ Admin เท่านั้น
  if (typeof isAuthorizedUser_ === 'function' && !isAuthorizedUser_()) {
    safeUiAlert_('🔒 คุณไม่มีสิทธิ์ตั้งค่าการป้องกันชีต\nกรุณาติดต่อ Admin');
    return;
  }

  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const me = Session.getEffectiveUser().getEmail();
    const results = [];

    // === 1. Protected Ranges: ชีตที่มี PII ===
    const protectedSheets = [
      { name: SHEET.EMPLOYEE, reason: 'ข้อมูลพนักงาน (เลขบัตร, เบอร์โทร)', hide: true },
      { name: SHEET.M_PERSON, reason: 'ข้อมูลบุคคล (เบอร์โทร)', hide: false },
      { name: SHEET.SOURCE,   reason: 'ข้อมูลต้นทาง (ที่อยู่, Email, ชื่อลูกค้า)', hide: true },
    ];

    protectedSheets.forEach(config => {
      const sheet = ss.getSheetByName(config.name);
      if (!sheet) {
        results.push('⚠️ ไม่พบชีต: ' + config.name);
        return;
      }

      // Protected Range: ทั้งชีต
      const protection = sheet.protect();
      protection.setDescription(`[SEC-005] ${config.reason} — เฉพาะ Admin เท่านั้น`);
      
      // ลบ Editor เดิมทั้งหมด แล้วเพิ่มเฉพาะ Script Owner
      const editors = protection.getEditors();
      editors.forEach(editor => {
        try { protection.removeEditor(editor.getEmail()); } catch (e) {}
      });
      if (me) {
        try { protection.addEditor(me); } catch (e) {}
      }

      // Hidden Sheet (ถ้ากำหนด)
      if (config.hide) {
        try { sheet.hideSheet(); } catch (e) {}
      }

      results.push(`✅ ${config.name}: Protected${config.hide ? ' + Hidden' : ''}`);
    });

    // === 2. ป้องกันชีต M_GEO_POINT จากการแก้ไขโดยผู้ใช้ทั่วไป ===
    const geoSheet = ss.getSheetByName(SHEET.M_GEO_POINT);
    if (geoSheet) {
      const geoProtection = geoSheet.protect();
      geoProtection.setDescription('[SEC-005] ข้อมูลพิกัด — เฉพาะ Script เท่านั้นที่เขียน');
      const geoEditors = geoProtection.getEditors();
      geoEditors.forEach(editor => {
        try { geoProtection.removeEditor(editor.getEmail()); } catch (e) {}
      });
      if (me) {
        try { geoProtection.addEditor(me); } catch (e) {}
      }
      results.push('✅ M_GEO_POINT: Protected');
    }

    logInfo('Hardening', '[SEC-005] ตั้งค่า Sheet Protection สำเร็จ');
    safeUiAlert_('🛡️ ตั้งค่าการป้องกันข้อมูล Sensitive สำเร็จ!\n\n' + results.join('\n'));

  } catch (err) {
    logError('Hardening', '[SEC-005] applySheetProtection_UI ล้มเหลว: ' + err.message, err);
    safeUiAlert_('❌ ตั้งค่าการป้องกันล้มเหลว: ' + err.message);
  }
}
