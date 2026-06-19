/**
 * VERSION: 5.5.013
 * FILE: 10_MatchEngine.gs
 * LMDS V5.5 — Core Match & Resolution Engine
 * ===================================================
 * PURPOSE:
 *   ประมวลผลข้อมูลต้นทาง → จับคู่ Person/Place/Geo → ตัดสินใจ → บันทึกผล
 *   เป็นหัวใจหลักของ Pipeline และเป็น Single Writer สำหรับ M_ALIAS
 * ===================================================
 *   v5.5.013 (2026-06-19) — GOOGLE MAPS REFACTOR:
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
 *   v5.4.003 (2026-06-04) — REFACTOR-04 SRP Split:
 *     - [REFACTOR] executeDecision split into handleAutoMatch_, handleCreateNew_, handleReview_
 *     - [KEEP] REVIEW null-FK guard (FIX-03 from previous PR)
 *   v5.4.001 (2026-05-24) — Single Writer Pattern:
 *     - [REWRITE] autoEnrichAliasesFromFactBatch_: จุดเขียนเดียวสำหรับ M_ALIAS
 *       ❌ ไม่เรียก createGlobalAlias() / syncAliasToEntityTable_() อีกต่อไป
 *       ✅ เขียน Batch ตรงทั้ง 3 ชีต: M_ALIAS + M_PERSON_ALIAS + M_PLACE_ALIAS
 *       ✅ รวม Canonical Name เข้า M_ALIAS (เดิมข้าม → ทำให้ Group 2 ค้นไม่เจอ)
 *       ✅ รองรับ PLACE aliases จาก SHIP_TO_ADDR (เดิมทำแค่ PERSON)
 *   v5.4.000 (2026-05-23):
 *     - [ADD] autoEnrichAliasesFromFactBatch_: เขียน alias เข้า M_ALIAS (Hybrid Architecture)
 *   v5.2.013:
 *     - [FIX] executeDecision: ส่ง placeId แทน decision.placeId (undefined) ไปยัง createGeoPoint
 *   v5.2.010:
 *     - [ADD] autoEnrichAliasesFromFactBatch_: สร้าง Alias อัตโนมัติจาก FACT แบบ Real-time
 *   v5.2.007:
 *     - [FIX] ลบ Checkpoint Index — เริ่มจาก 0 เสมอ ป้องกัน Array หดทำให้ตำแหน่งชี้ผิด
 *   v5.2.003:
 *     - [ADD] Auto-Trigger System สำหรับ Resume เมื่อ Timeout
 *   v5.2.001:
 *     - [ADD] flushBatches_ — Internal helper for transaction writing
 * ===================================================
 * DEPENDENCIES:
 *   REQUIRES (Load Order):
 *     - 01_Config.gs          (SHEET.*, FACT_IDX.*, ALIAS_IDX.*, AI_CONFIG)
 *     - 02_Schema.gs          (SCHEMA definitions)
 *     - 03_SetupSheets.gs     (logInfo, logWarn, logError)
 *     - 05_NormalizeService.gs (normalizeForCompare)
 *     - 14_Utils.gs           (generateShortId)
 *   CALLS (Invokes):
 *     - resolvePerson()                    → 06_PersonService.gs
 *     - resolvePlace()                     → 07_PlaceService.gs
 *     - resolveGeo()                       → 08_GeoService.gs
 *     - createPerson()                     → 06_PersonService.gs
 *     - createPlace()                      → 07_PlaceService.gs
 *     - createGeoPoint()                   → 08_GeoService.gs
 *     - resolveDestination() / createDestination() → 09_DestinationService.gs
 *     - upsertFactDelivery()               → 11_TransactionService.gs
 *     - enqueueReview()                    → 12_ReviewService.gs
 *     - loadAllPersons_()                  → 06_PersonService.gs
 *     - loadAllPlaces_()                   → 07_PlaceService.gs
 *     - loadAllAliases_()                  → 06_PersonService.gs
 *     - loadAllPlaceAliases_()             → 07_PlaceService.gs
 *     - getUnprocessedRows()               → 04_SourceRepository.gs (Group 2)
 *     - updateSyncStatus_()                → 04_SourceRepository.gs (Group 2)
 *     - toThaiDateStr()                    → 14_Utils.gs (Group 0)
 *   EXPORTS TO:
 *     - 00_App.gs             (runMatchEngine — Pipeline menu)
 *   SHEETS ACCESSED (Read + Write):
 *     - SHEET.FACT_DELIVERY   (Read: FACT_IDX, Write: batch append)
 *     - SHEET.Q_REVIEW        (Write: batch append with color)
 *     - SHEET.M_ALIAS         (Write: Single Writer — PERSON canonical/variant + PLACE canonical/variant)
 *     - SHEET.M_PERSON_ALIAS  (Write: variant names only)
 *     - SHEET.M_PLACE_ALIAS   (Write: variant addresses only)
 *   ⚠️ SINGLE WRITER RULE:
 *     - M_ALIAS ถูกเขียนที่นี่เท่านั้น (autoEnrichAliasesFromFactBatch_)
 *     - ห้ามเรียก createGlobalAlias() ใน auto pipeline
 *     - createGlobalAlias() ใช้สำหรับ Migration/Admin เท่านั้น
 * ===================================================
 * ARCHITECTURE:
 *   ┌─────────────────────────────────────────────────────────────┐
 *   │  10_MatchEngine.gs (Pipeline Core + M_ALIAS Single Writer)  │
 *   │  ├── runMatchEngine()       — Main entry (Lock + Time Guard)│
 *   │  ├── processOneRow()        — Resolve → Decide → Execute    │
 *   │  ├── makeMatchDecision()    — 8 Rules (INVALID→FULL_MATCH)  │
 *   │  ├── executeDecision()      — AUTO_MATCH / CREATE_NEW / REVIEW│
 *   │  ├── flushBatches_()        — Transaction write (FACT+Alias) │
 *   │  │   └── autoEnrichAliasesFromFactBatch_()  ← SINGLE WRITER │
 *   │  │       ├── M_ALIAS (PERSON canon+variant, PLACE canon+var)│
 *   │  │       ├── M_PERSON_ALIAS (variant ≠ canonical only)      │
 *   │  │       └── M_PLACE_ALIAS  (variant ≠ canonical only)      │
 *   │  └── Auto-Resume (installAutoResume_ / removeAutoResume_)   │
 *   └─────────────────────────────────────────────────────────────┘
 * ===================================================
 */

// ============================================================
// SECTION 1: runMatchEngine
// ============================================================

// [FIX CRIT-018] Module-level cache สำหรับ alias enrichment context
// ลดการอ่านชีตซ้ำซ้อนเมื่อ flushBatches_ เรียก autoEnrich หลายครั้งใน execution เดียวกัน
let _ALIAS_ENRICHMENT_CONTEXT = null;

/**
 * [FIX CRIT-005] เพิ่ม entity ใหม่เข้า alias enrichment context แบบ incremental
 * เรียกจาก handleCreateNew_ หลังสร้าง Person/Place สำเร็จ
 * ทำให้ entity ใหม่มี alias ทันทีใน batch flush รอบเดียวกัน
 * @param {string} entityType - 'PERSON' หรือ 'PLACE'
 * @param {string} entityId - personId หรือ placeId
 * @param {string} masterUuid - UUID v4
 * @param {string} canonical - Canonical name
 * @param {string} normalized - Normalized name
 */
function addEntityToEnrichmentContext_(entityType, entityId, masterUuid, canonical, normalized) {
  if (!_ALIAS_ENRICHMENT_CONTEXT) return;
  if (entityType === 'PERSON' && entityId) {
    _ALIAS_ENRICHMENT_CONTEXT.personMap[entityId] = {
      canonical:  canonical,
      normalized: normalized,
      masterUuid: masterUuid
    };
  } else if (entityType === 'PLACE' && entityId) {
    _ALIAS_ENRICHMENT_CONTEXT.placeMap[entityId] = {
      canonical:  canonical,
      normalized: normalized,
      masterUuid: masterUuid
    };
  }
}

function runMatchEngine() {
  const lock = LockService.getScriptLock();
  // [FIX CRIT-009] ใช้ tryLock แทน waitLock — ไม่รอคิว แจ้ง user ทันที่ถ้า lock ไม่ได้
  try {
    lock.tryLock(APP_CONST.LOCK_TIMEOUT_MS);
  } catch (e) {
    logWarn('MatchEngine', 'ไม่สามารถ Lock ได้ — อาจมีการรันซ้อน กรุณารันใหม่ภายหลัง');
    safeUiAlert_('⚠️ ไม่สามารถรัน Match Engine ได้ — มีการรันซ้อนอยู่\nกรุณารอให้การรันก่อนหน้าเสร็จก่อน แล้วลองใหม่');
    return;
  }
  if (!lock.hasLock()) {
    logWarn('MatchEngine', 'ไม่สามารถ Lock ได้ — อาจมีการรันซ้อน กรุณารันใหม่ภายหลัง');
    safeUiAlert_('⚠️ ไม่สามารถรัน Match Engine ได้ — มีการรันซ้อนอยู่\nกรุณารอให้การรันก่อนหน้าเสร็จก่อน แล้วลองใหม่');
    return;
  }

  const startTime = new Date();
  const timeLimit = AI_CONFIG.TIME_LIMIT_MS || (5 * 60 * 1000);
  let processed = 0, autoMatched = 0, created = 0, queued = 0, errorCount = 0;

  let factBatch     = [];
  let reviewBatch   = [];
  let successRows   = []; // Rows to mark SUCCESS
  let failedRows    = []; // Rows to mark ERROR

  // [PERF-001] Defer stats updates — collect IDs for batch processing
  let personIdsToStats = new Set();
  let placeIdsToStats  = new Set();
  let geoIdsToStats    = new Set();
  let destStatsQueue   = []; // { destId, deliveryDate }

  try {
    logInfo('MatchEngine', 'เริ่ม Match Engine');

    // [FIX v5.2.007] ลบ Checkpoint Index — เริ่มจาก 0 เสมอ
    // เหตุผล: getAllSourceRows() กรอง SUCCESS ออกอยู่แล้ว
    //   ดังนั้น Array ที่ได้จะมีเฉพาะแถวที่ยังไม่ได้ทำ
    //   Checkpoint เดิมเก็บ "ตำแหน่ง" ใน Array แต่ Array หดเล็กลงทุกรอบ
    //   ทำให้ตำแหน่งชี้ผิด → ข้อมูลถูกข้ามไป (BUG)
    resetProcessingState_();  // [REF-018] renamed from clearCheckpoint_ — ล้าง stale processing state
    const startIndex = 0;
    const pendingRows = loadSourceBatch_(); // [REF-002] Abstraction layer

    if (pendingRows.length === 0) {
      logInfo('MatchEngine', 'ไม่มีแถวที่ต้องประมวลผล');
      removeAutoResume_();  // ลบ trigger ที่ค้างอยู่ด้วย
      return;
    }

    logInfo('MatchEngine', `ประมวลผล ${pendingRows.length} แถว (เริ่มจาก index ${startIndex})`);

    for (let i = startIndex; i < pendingRows.length; i++) {
      if (new Date() - startTime > timeLimit) {
        logWarn('MatchEngine', `Time Guard: หยุดที่แถว ${i}/${pendingRows.length} (ติดตั้ง Auto-Trigger)`);
        // [FIX v5.2.007] ไม่บันทึก checkpoint อีกต่อไป — SYNC_STATUS ทำหน้าที่แทน
        installAutoResume_('runMatchEngine');
        break;
      }
      
      const srcObj = pendingRows[i];
      try {
        const result = processOneRow(srcObj);
        processed++;
        
        if (result.action === 'AUTO_MATCH')  autoMatched++;
        if (result.action === 'CREATE_NEW')  created++;
        if (result.action === 'REVIEW')      queued++;

        if (result.factData)   factBatch.push(result.factData);
        if (result.reviewData) reviewBatch.push(result.reviewData);
        
        // [PERF-001] เก็บ stats IDs ไว้อัปเดตเป็น batch ใน flushBatches_
        if (result.statsToDefer) {
          result.statsToDefer.personIds.forEach(function(id) { personIdsToStats.add(id); });
          result.statsToDefer.placeIds.forEach(function(id) { placeIdsToStats.add(id); });
          result.statsToDefer.geoIds.forEach(function(id) { geoIdsToStats.add(id); });
          result.statsToDefer.destStats.forEach(function(item) { destStatsQueue.push(item); });
        }
        
        successRows.push(srcObj);

      } catch (rowErr) {
        errorCount++;
        failedRows.push(srcObj);
        logError('MatchEngine', `แถว ${srcObj.sourceRow} (Invoice: ${srcObj.invoiceNo}): ${rowErr.message}`, rowErr);
      }

      // Batch Write & Sync Status every BATCH_SIZE
      if (processed % AI_CONFIG.BATCH_SIZE === 0 && processed > 0) {
        flushBatches_(factBatch, reviewBatch, successRows, failedRows,
          personIdsToStats, placeIdsToStats, geoIdsToStats, destStatsQueue);
        factBatch = []; reviewBatch = []; successRows = []; failedRows = [];
        personIdsToStats = new Set();
        placeIdsToStats  = new Set();
        geoIdsToStats    = new Set();
        destStatsQueue   = [];
      }
    }

    // Final Flush
    flushBatches_(factBatch, reviewBatch, successRows, failedRows,
      personIdsToStats, placeIdsToStats, geoIdsToStats, destStatsQueue);

    // [FIX v5.2.007] ถ้าประมวลผลครบทุกแถว → ลบ Auto-Trigger
    if (processed + errorCount >= pendingRows.length) {
      removeAutoResume_();
    }

    const elapsedSec = Math.round((new Date() - startTime) / 1000);
    logInfo('MatchEngine',
      `เสร็จสิ้น — รัน:${processed} Match:${autoMatched} ` +
      `สร้างใหม่:${created} Review:${queued} Error:${errorCount} (${elapsedSec}s)`);

  } catch (err) {
    logError('MatchEngine', `runMatchEngine ล้มเหลว: ${err.message}`, err);
    // [FIX CRIT-013] แจ้ง user ก่อน throw — ป้องกัน silent failure
    safeUiAlert_('❌ Match Engine ล้มเหลว:\n' + err.message + '\n\nกรุณาตรวจสอบ SYS_LOG');
    throw err;
  } finally {
    lock.releaseLock();
    // [FIX CRIT-018] ล้าง alias enrichment context เมื่อ execution จบ
    _ALIAS_ENRICHMENT_CONTEXT = null;
    // [PERF-012] Flush log buffer ก่อน execution จบ — ป้องกัน log entries สูญหาย
    if (typeof flushLogBuffer_ === 'function') flushLogBuffer_();
  }
}

/**
 * [NEW v5.2.001] flushBatches_ — Internal helper for transaction writing
 * [PERF-001] เพิ่ม batch stats update parameters เพื่อลด API calls จาก O(N) เหลือ O(1) per entity type
 * [REF-002] Delegates fact+review persistence to persistResult_()
 */
function flushBatches_(factBatch, reviewBatch, successRows, failedRows,
  personIdsToStats, placeIdsToStats, geoIdsToStats, destStatsQueue) {

  // [REF-002] Persist fact + review data via abstraction layer
  persistResult_(factBatch, reviewBatch);

  // [PERF-001] Batch stats updates — อ่านทั้ง column 1 ครั้ง แก้ใน RAM ทั้งหมด เขียนทีเดียว
  // ลดจาก O(N × 4 entity types × 2-3 API calls) → O(4 entity types × 2 API calls) = ~8 calls
  if (personIdsToStats && personIdsToStats.size > 0) {
    batchUpdatePersonStats_(personIdsToStats);
  }
  if (placeIdsToStats && placeIdsToStats.size > 0) {
    batchUpdatePlaceStats_(placeIdsToStats);
  }
  if (geoIdsToStats && geoIdsToStats.size > 0) {
    batchUpdateGeoStats_(geoIdsToStats);
  }
  if (destStatsQueue && destStatsQueue.length > 0) {
    batchUpdateDestinationStats_(destStatsQueue);
  }

  if (successRows.length > 0) {
    updateSyncStatus_(successRows, 'SUCCESS');
  }

  if (failedRows.length > 0) {
    updateSyncStatus_(failedRows, 'ERROR');
  }
}

/**
 * autoEnrichAliasesFromFactBatch_ — [REWRITE v5.4.001] Single Writer Pattern
 * ============================================================
 * 🟩 จุดเขียนเดียวสำหรับ M_ALIAS — ทุก alias เกิดที่นี่เท่านั้น
 * ============================================================
 * ทำงานอัตโนมัติเมื่อมี Fact ใหม่ → สร้าง alias ใน:
 *   1. M_ALIAS (Global) — PERSON canonical(100) + variant(95), PLACE canonical(100) + variant(90)
 *   2. M_PERSON_ALIAS  — variant name (ถ้า ≠ canonical)
 *   3. M_PLACE_ALIAS   — variant address (ถ้า ≠ canonical)
 *
 * ❌ ไม่เรียก createGlobalAlias() / syncAliasToEntityTable_()
 * ❌ ไม่เรียก createPersonAlias() / createPlaceAlias()
 * ✅ เขียน Batch ตรงทั้ง 3 ชีตเอง — เร็ว + ไม่มี circular dependency
 * ✅ รวม Canonical Name เข้า M_ALIAS ด้วย (เดิมข้าม → ทำให้ค้นไม่เจอ)
 */
function autoEnrichAliasesFromFactBatch_(factBatch) {
  if (!factBatch || factBatch.length === 0) return;
  
  try {
    // 1. เตรียมข้อมูล (Extract Data Loading)
    var context = prepareAliasEnrichmentData_();
    
    // 2. ประมวลผลหา Alias ใหม่ (Extract Processing Logic)
    var results = processFactRowsForAliases_(factBatch, context);
    
    // 3. บันทึกผลลงฐานข้อมูล (Extract Writing Logic)
    commitAliasChanges_(results, context);
    
    // 4. Log
    var totalGlobal = results.globalAliasRows.length;
    var totalPerson = results.personAliasRows.length;
    var totalPlace = results.placeAliasRows.length;
    
    if (totalGlobal > 0 || totalPerson > 0 || totalPlace > 0) {
      logInfo('MatchEngine',
        'Auto-Enrich (Single Writer v5.4.001): ' +
        'M_ALIAS=' + totalGlobal +
        ' M_PERSON_ALIAS=' + totalPerson +
        ' M_PLACE_ALIAS=' + totalPlace
      );
    }
  } catch (err) {
    logError('autoEnrichAliasesFromFactBatch_', err.message, err);
    throw err;
  }
}

/**
 * [Helper 1] โหลดและเตรียม Map ข้อมูลจาก Sheets
 * @returns {Object} context object พร้อม entity maps และ alias sets
 */
function prepareAliasEnrichmentData_() {
  // [FIX CRIT-018] ใช้ cached context ถ้ามีอยู่แล้ว — ลดการอ่านชีตซ้ำซ้อน
  if (_ALIAS_ENRICHMENT_CONTEXT) return _ALIAS_ENRICHMENT_CONTEXT;

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  
  // Person map: personId → { canonical, normalized, masterUuid }
  var allPersons = loadAllPersons_();
  var personMap = {};
  allPersons.forEach(function(p) {
    if (p.personId && p.masterUuid) {
      personMap[p.personId] = {
        canonical:  p.canonical,
        normalized: p.normalized,
        masterUuid: p.masterUuid
      };
    }
  });
  
  // Place map: placeId → { canonical, normalized, masterUuid }
  var allPlaces = loadAllPlaces_();
  var placeMap = {};
  allPlaces.forEach(function(p) {
    if (p.placeId && p.masterUuid) {
      placeMap[p.placeId] = {
        canonical:  p.canonical,
        normalized: p.normalized,
        masterUuid: p.masterUuid
      };
    }
  });
  
  // === 2. โหลด Alias ที่มีอยู่แล้ว เพื่อ Dedup ===
  var dedupSets = matchBuildDedupSets_();
  var existingPersonAliasSet = dedupSets.existingPersonAliasSet;
  var existingPlaceAliasSet  = dedupSets.existingPlaceAliasSet;
  var existingGlobalAliasSet = dedupSets.existingGlobalAliasSet;
  var mAliasSheet = ss.getSheetByName(SHEET.M_ALIAS);
  
  var contextObj = {
    ss: ss,
    personMap: personMap,
    placeMap: placeMap,
    existingPersonAliasSet: existingPersonAliasSet,
    existingPlaceAliasSet: existingPlaceAliasSet,
    existingGlobalAliasSet: existingGlobalAliasSet,
    mAliasSheet: mAliasSheet
  };

  // [FIX CRIT-018] Cache the context for reuse within same execution
  _ALIAS_ENRICHMENT_CONTEXT = contextObj;

  return contextObj;
}

/**
 * matchBuildDedupSets_ — [F-11] สร้าง Dedup Sets สำหรับ alias enrichment
 * แยกออกจาก prepareAliasEnrichmentData_() เพื่อ SRP
 * @returns {Object} { existingPersonAliasSet, existingPlaceAliasSet, existingGlobalAliasSet }
 */
function matchBuildDedupSets_() {
  // M_PERSON_ALIAS dedup: "personId::normalized"
  var existingPersonAliasSet = new Set();
  var existingPersonAliasData = loadAllAliases_();
  existingPersonAliasData.forEach(function(r) {
    if (!r[PERSON_ALIAS_IDX.ACTIVE_FLAG]) return;
    var pId  = String(r[PERSON_ALIAS_IDX.PERSON_ID] || '').trim();
    var aNorm = normalizeForCompare(r[PERSON_ALIAS_IDX.ALIAS_NAME]);
    if (pId && aNorm) existingPersonAliasSet.add(pId + '::' + aNorm);
  });

  // M_PLACE_ALIAS dedup: "placeId::normalized"
  var existingPlaceAliasSet = new Set();
  var existingPlaceAliasData = loadAllPlaceAliases_();
  existingPlaceAliasData.forEach(function(r) {
    if (!r[PLACE_ALIAS_IDX.ACTIVE_FLAG]) return;
    var plId  = String(r[PLACE_ALIAS_IDX.PLACE_ID] || '').trim();
    var aNorm = normalizeForCompare(r[PLACE_ALIAS_IDX.ALIAS_NAME]);
    if (plId && aNorm) existingPlaceAliasSet.add(plId + '::' + aNorm);
  });

  // M_ALIAS dedup: "ENTITY_TYPE::masterUuid::normalized"
  // [PERF-008] ใช้ buildGlobalAliasDedupSet_() แทนการอ่าน Sheet ตรง — ใช้ cache ที่มีอยู่แล้ว
  var existingGlobalAliasSet = buildGlobalAliasDedupSet_();

  return {
    existingPersonAliasSet: existingPersonAliasSet,
    existingPlaceAliasSet: existingPlaceAliasSet,
    existingGlobalAliasSet: existingGlobalAliasSet
  };
}

/**
 * [Helper 2] วนลูปตรวจสอบ Fact Rows และสร้าง Row ใหม่
 * @param {Array} factBatch - แถวข้อมูลจาก M_FACT
 * @param {Object} context - ข้อมูลที่เตรียมจาก prepareAliasEnrichmentData_()
 * @returns {Object} results object พร้อม rows ใหม่ทั้ง 3 ประเภท
 */
function processFactRowsForAliases_(factBatch, context) {
  var personMap = context.personMap;
  var placeMap = context.placeMap;

  var newGlobalAliasRows  = [];  // M_ALIAS
  var newPersonAliasRows  = [];  // M_PERSON_ALIAS
  var newPlaceAliasRows   = [];  // M_PLACE_ALIAS
  var now = new Date();

  factBatch.forEach(function(r) {
    var pId   = String(r[FACT_IDX.PERSON_ID]   || '').trim();
    var plId  = String(r[FACT_IDX.PLACE_ID]     || '').trim();
    var pInfo = pId  ? personMap[pId]  : null;
    var plInfo = plId ? placeMap[plId] : null;

    // ─── PERSON: Canonical + Variant ───
    if (pInfo) {
      matchEnrichPersonAliases_(r, pInfo, context, newGlobalAliasRows, newPersonAliasRows, now);
    }

    // ─── PLACE: Canonical + Variant ───
    if (plInfo) {
      matchEnrichPlaceAliases_(r, plInfo, context, newGlobalAliasRows, newPlaceAliasRows, now);
    }
  });

  return {
    globalAliasRows: newGlobalAliasRows,
    personAliasRows: newPersonAliasRows,
    placeAliasRows: newPlaceAliasRows
  };
}

/**
 * matchEnrichEntityAliases_ — [REF-015] Generic alias enricher for both Person and Place
 * Replaces duplicate logic in matchEnrichPersonAliases_ and matchEnrichPlaceAliases_.
 * @param {string} entityType - 'PERSON' or 'PLACE'
 * @param {string} entityId - person_id or place_id
 * @param {string} masterUuid - master UUID for the entity
 * @param {string} canonical - Canonical name (clean version)
 * @param {string} canonicalNorm - Normalized canonical name
 * @param {string} rawVariant - Raw variant name/address from source
 * @param {number} variantConfidence - Confidence score for variant (95 for PERSON, 90 for PLACE)
 * @param {Object} context - { existingGlobalAliasSet, entityAliasSet, source }
 * @param {Array} globalRows - M_ALIAS accumulator
 * @param {Array} entityRows - M_PERSON_ALIAS or M_PLACE_ALIAS accumulator
 * @param {Date} now - timestamp
 */
function matchEnrichEntityAliases_(entityType, entityId, masterUuid, canonical, canonicalNorm, rawVariant, variantConfidence, context, globalRows, entityRows, now) {
  var entityAliasSet = context.entityAliasSet;

  // 3a/3c. Canonical Name → M_ALIAS (confidence 100)
  if (canonicalNorm && canonicalNorm.length >= 2) {
    var canonKey = entityType + '::' + masterUuid + '::' + canonicalNorm;
    if (!context.existingGlobalAliasSet.has(canonKey)) {
      context.existingGlobalAliasSet.add(canonKey);
      globalRows.push([
        generateShortId('A'),
        masterUuid,
        canonical,
        entityType,
        100,
        context.source || 'AUTO_ENRICH_FACT',
        now,
        true
      ]);
    }
  }

  // 3b/3d. Variant → M_ALIAS + Entity Alias
  if (rawVariant && rawVariant.length >= 2) {
    var rawNorm = normalizeForCompare(rawVariant);
    if (rawNorm && rawNorm.length >= 2) {

      // M_ALIAS variant
      var variantKey = entityType + '::' + masterUuid + '::' + rawNorm;
      if (!context.existingGlobalAliasSet.has(variantKey)) {
        context.existingGlobalAliasSet.add(variantKey);
        globalRows.push([
          generateShortId('A'),
          masterUuid,
          rawVariant,
          entityType,
          variantConfidence,
          context.source || 'AUTO_ENRICH_FACT',
          now,
          true
        ]);
      }

      // Entity-specific alias (เฉพาะ variant ≠ canonical)
      if (rawNorm !== canonicalNorm) {
        var eaKey = entityId + '::' + rawNorm;
        if (!entityAliasSet.has(eaKey)) {
          entityAliasSet.add(eaKey);
          var entityPrefix = entityType === 'PERSON' ? 'PA' : 'PLA';
          entityRows.push([
            generateShortId(entityPrefix),
            entityId,
            rawVariant,
            variantConfidence,
            now,
            true
          ]);
        }
      }
    }
  }
}

/**
 * matchEnrichPersonAliases_ — [REF-015] Thin wrapper → matchEnrichEntityAliases_
 * Preserves original signature for backward compatibility.
 * @param {Array} factRow - แถวข้อมูลจาก M_FACT
 * @param {Object} pInfo - { canonical, normalized, masterUuid } จาก personMap
 * @param {Object} context - dedup sets + maps
 * @param {Array} globalRows - shared M_ALIAS accumulator (mutated in-place)
 * @param {Array} personRows - shared M_PERSON_ALIAS accumulator (mutated in-place)
 * @param {Date} now - timestamp
 */
function matchEnrichPersonAliases_(factRow, pInfo, context, globalRows, personRows, now) {
  var pId           = String(factRow[FACT_IDX.PERSON_ID]    || '').trim();
  var rawPersonName = String(factRow[FACT_IDX.SHIP_TO_NAME] || '').trim();
  matchEnrichEntityAliases_(
    'PERSON', pId, pInfo.masterUuid, pInfo.canonical, pInfo.normalized,
    rawPersonName, 95,
    { existingGlobalAliasSet: context.existingGlobalAliasSet, entityAliasSet: context.existingPersonAliasSet, source: 'AUTO_ENRICH_FACT' },
    globalRows, personRows, now
  );
}

/**
 * matchEnrichPlaceAliases_ — [REF-015] Thin wrapper → matchEnrichEntityAliases_
 * Preserves original signature for backward compatibility.
 * @param {Array} factRow - แถวข้อมูลจาก M_FACT
 * @param {Object} plInfo - { canonical, normalized, masterUuid } จาก placeMap
 * @param {Object} context - dedup sets + maps
 * @param {Array} globalRows - shared M_ALIAS accumulator (mutated in-place)
 * @param {Array} placeRows - shared M_PLACE_ALIAS accumulator (mutated in-place)
 * @param {Date} now - timestamp
 */
function matchEnrichPlaceAliases_(factRow, plInfo, context, globalRows, placeRows, now) {
  var plId          = String(factRow[FACT_IDX.PLACE_ID]    || '').trim();
  var rawPlaceAddr  = String(factRow[FACT_IDX.SHIP_TO_ADDR] || '').trim();
  matchEnrichEntityAliases_(
    'PLACE', plId, plInfo.masterUuid, plInfo.canonical, plInfo.normalized,
    rawPlaceAddr, 90,
    { existingGlobalAliasSet: context.existingGlobalAliasSet, entityAliasSet: context.existingPlaceAliasSet, source: 'AUTO_ENRICH_FACT' },
    globalRows, placeRows, now
  );
}

/**
 * [Helper 3] บันทึกข้อมูลลง Sheet ทั้ง 3 แบบ Batch
 * [F-12] Delegates to matchCommit* helpers for SRP
 * @param {Object} results - ผลลัพธ์จาก processFactRowsForAliases_()
 * @param {Object} context - Context ที่เตรียมไว้
 */
function commitAliasChanges_(results, context) {
  matchCommitGlobalAlias_(context.mAliasSheet, results.globalAliasRows);
  matchCommitPersonAlias_(context.ss, results.personAliasRows, context);
  matchCommitPlaceAlias_(context.ss, results.placeAliasRows, context);
}

/**
 * matchCommitGlobalAlias_ — [F-12] เขียน M_ALIAS + cache invalidation
 * @param {Sheet} mAliasSheet - Sheet object สำหรับ M_ALIAS
 * @param {Array} rows - Array of row arrays สำหรับ M_ALIAS
 */
function matchCommitGlobalAlias_(mAliasSheet, rows) {
  if (rows.length > 0 && mAliasSheet) {
    mAliasSheet.getRange(
      mAliasSheet.getLastRow() + 1, 1,
      rows.length, SCHEMA[SHEET.M_ALIAS].length
    ).setValues(rows);
    // [FIX CRIT-002] Use CACHE_KEY constants instead of hardcoded strings — Single Source of Truth
    CacheService.getScriptCache().removeAll([CACHE_KEY.GLOBAL_ALIAS_ALL, CACHE_KEY.GLOBAL_ALIAS_REVERSE]);
  }
}

/**
 * matchCommitPersonAlias_ — [F-12] เขียน M_PERSON_ALIAS + cache + dedup update
 * @param {Spreadsheet} ss - Active spreadsheet
 * @param {Array} rows - Array of row arrays สำหรับ M_PERSON_ALIAS
 * @param {Object} context - Context สำหรับ dedup set update
 */
function matchCommitPersonAlias_(ss, rows, context) {
  if (rows.length > 0) {
    var paSheet = ss.getSheetByName(SHEET.M_PERSON_ALIAS);
    if (paSheet) {
      paSheet.getRange(
        paSheet.getLastRow() + 1, 1,
        rows.length, SCHEMA[SHEET.M_PERSON_ALIAS].length
      ).setValues(rows);
      invalidateAliasCache_();
      // [FIX CRIT-018] Update in-memory dedup sets incrementally
      if (_ALIAS_ENRICHMENT_CONTEXT) {
        rows.forEach(function(paRow) {
          var pId = String(paRow[PERSON_ALIAS_IDX.PERSON_ID]  || '').trim();
          var aNorm = normalizeForCompare(paRow[PERSON_ALIAS_IDX.ALIAS_NAME]);
          if (pId && aNorm) _ALIAS_ENRICHMENT_CONTEXT.existingPersonAliasSet.add(pId + '::' + aNorm);
        });
      }
    }
  }
}

/**
 * matchCommitPlaceAlias_ — [F-12] เขียน M_PLACE_ALIAS + cache + dedup update
 * @param {Spreadsheet} ss - Active spreadsheet
 * @param {Array} rows - Array of row arrays สำหรับ M_PLACE_ALIAS
 * @param {Object} context - Context สำหรับ dedup set update
 */
function matchCommitPlaceAlias_(ss, rows, context) {
  if (rows.length > 0) {
    var plaSheet = ss.getSheetByName(SHEET.M_PLACE_ALIAS);
    if (plaSheet) {
      plaSheet.getRange(
        plaSheet.getLastRow() + 1, 1,
        rows.length, SCHEMA[SHEET.M_PLACE_ALIAS].length
      ).setValues(rows);
      invalidatePlaceAliasCache_();
      // [FIX CRIT-018] Update in-memory dedup sets incrementally
      if (_ALIAS_ENRICHMENT_CONTEXT) {
        rows.forEach(function(plaRow) {
          var plId = String(plaRow[PLACE_ALIAS_IDX.PLACE_ID]   || '').trim();
          var aNorm = normalizeForCompare(plaRow[PLACE_ALIAS_IDX.ALIAS_NAME]);
          if (plId && aNorm) _ALIAS_ENRICHMENT_CONTEXT.existingPlaceAliasSet.add(plId + '::' + aNorm);
        });
      }
    }
  }
}
// ============================================================
// SECTION 2: processOneRow
// ============================================================

/**
 * processOneRow — ประมวลผล 1 Source Record
 * [FIX v003] resolvePlace ส่ง rawPlaceName + province
 */
function processOneRow(srcObj) {
  const personResult = resolvePerson(srcObj.rawPersonName);

  // [FIX v003] ส่ง rawPlaceName (สะอาด) + province แทน rawAddress ซ้ำ
  const placeResult  = resolvePlace(
    srcObj.rawPlaceName || srcObj.rawAddress,
    srcObj.province || ''
  );

  const geoResult    = resolveGeo(srcObj.rawLat, srcObj.rawLng);

  const decision = makeMatchDecision(srcObj, personResult, placeResult, geoResult);
  const result   = executeDecision(srcObj, decision, personResult, placeResult, geoResult);

  // [PERF-001] ส่ง statsToDefer กลับให้ runMatchEngine เก็บรวมใน Set
  return { 
    action:       decision.action, 
    txId:         result.txId,
    factData:     result.factData,
    reviewData:   result.reviewData,
    statsToDefer: result.statsToDefer || null  // [PERF-001]
  };
}

// ============================================================
// SECTION 3: makeMatchDecision — 8 Rules
// ============================================================

/**
 * makeMatchDecision
 * [FIX v003] Rule 1: !hasGeo (เดิม Logic ผิด)
 * [FIX v003] Rule 3: ใช้ srcObj.province แทน placeResult.normResult.province
 * [FIX v003] Rule 5: Weight รวม = 1.0 (เดิม 1.2)
 * [FIX v003] Rule 7: !isPersonOk && !isPlaceOk (เดิม hasPerson ผิด)
 */
function makeMatchDecision(srcObj, personResult, placeResult, geoResult) {
  const isGeoInMaster   = geoResult.status === 'FOUND';
  const isPersonInMaster = personResult.status === 'FOUND';
  const isPlaceInMaster  = placeResult.status  === 'FOUND' ||
                          placeResult.status  === 'BRANCH_MATCH';

  // [FIX v003] เรียก getGeoProvince_ ครั้งเดียวก่อนเข้า Rule
  const geoProvince = isGeoInMaster ? getGeoProvince_(geoResult.geoId) : '';

  // [UPGRADE v5.2.003] ใช้สถานะจาก Source Sheet ประกอบการตัดสินใจ
  const hasGeoInSource = srcObj.hasGeo;

  // Rule 1: ไม่มีพิกัดใน Source Sheet เลย (พิกัดเป็น 0,0 หรือว่าง)
  if (!hasGeoInSource) {
    return {
      action: 'REVIEW', reason: 'INVALID_LATLNG',
      confidence: 0, priority: 1,
    };
  }

  // Rule 2: ชื่อคุณภาพต่ำ (สั้นเกินไปหรือมั่ว)
  if (personResult.status === 'LOW_QUALITY' || placeResult.status === 'LOW_QUALITY') {
    return {
      action: 'REVIEW', reason: 'LOW_QUALITY_DATA',
      confidence: 0, priority: 2,
    };
  }

  // Rule 3: ตรวจสอบเรื่องจังหวัดข้ามโซน (ถ้าพิกัดอยู่ใน Master แล้ว)
  if (isGeoInMaster && geoProvince && srcObj.province && geoProvince !== srcObj.province) {
    return {
      action: 'REVIEW', reason: 'GEO_PROVINCE_CONFLICT',
      confidence: 50, priority: 2,
    };
  }

  // [UPGRADE v5.2.005] Rule 3.5: Tiered Spatial Fuzzy Matching (รอคนตรวจตัดสินใจรวมพิกัด)
  if (geoResult.status === 'NEARBY_PENDING') {
    return {
      action: 'REVIEW',
      reason: geoResult.issue_type, // 'GEO_NEARBY_YELLOW' or 'GEO_NEARBY_ORANGE'
      confidence: 50,
      priority: 1, // สำคัญระดับ 1 เพราะต้องให้คนตัดสินใจว่าพิกัดเดียวกันไหม
    };
  }

  // Rule 4: พบครบทั้ง 3 อย่างใน Master -> AUTO_MATCH (Full)
  if (isGeoInMaster && isPersonInMaster && isPlaceInMaster) {
    const confidence = matchCalcFullScore_(
      geoResult.confidence, personResult.confidence, placeResult.confidence
    );
    return {
      action: 'AUTO_MATCH', reason: APP_CONST.MATCH_FULL,
      confidence, priority: 0,
      evidence: 'name|place|geo' // [NEW v5.2.008]
    };
  }

  // Rule 5: พบพิกัดใน Master + อย่างใดอย่างหนึ่ง (คน หรือ สถานที่) -> AUTO_MATCH (Partial)
  if (isGeoInMaster && (isPersonInMaster || isPlaceInMaster)) {
    const confidence = matchCalcGeoAnchorScore_(
      geoResult.confidence, personResult.confidence, placeResult.confidence, isPersonInMaster
    );
    const evidence = isPersonInMaster ? 'name|geo' : 'place|geo';
    return {
      action: 'AUTO_MATCH', reason: APP_CONST.MATCH_GEO,
      confidence, priority: 0,
      evidence: evidence // [NEW v5.2.008]
    };
  }

  // Rule 6: มีความกำกวม (Fuzzy Match / Needs Review)
  if (personResult.status === 'NEEDS_REVIEW' || placeResult.status === 'NEEDS_REVIEW') {
    const confidence = Math.max(
      personResult.confidence, placeResult.confidence
    );
    return {
      action: 'REVIEW', reason: APP_CONST.MATCH_FUZZY,
      confidence, priority: 2,
    };
  }

  // Rule 7: ทุกอย่างใหม่หมด แต่ Driver ส่งพิกัดมาให้ -> CREATE_NEW
  if (hasGeoInSource && !isGeoInMaster && !isPersonInMaster && !isPlaceInMaster) {
    return {
      action: 'CREATE_NEW', reason: 'ALL_NEW_WITH_GEO',
      confidence: geoResult.confidence || 100,
      priority: 0,
    };
  }

  // Rule 8: Default
  return {
    action: 'REVIEW', reason: 'NEW_RECORD_PENDING',
    confidence: 0, priority: 3,
  };
}

/**
 * matchCalcFullScore_ — [F-8] Confidence for Rule 4 (Full Match: geo + person + place)
 * Weight: geo=0.5, person=0.3, place=0.2
 * @param {number} geoConf - geoResult.confidence
 * @param {number} personConf - personResult.confidence
 * @param {number} placeConf - placeResult.confidence
 * @returns {number} confidence (0-100)
 */
function matchCalcFullScore_(geoConf, personConf, placeConf) {
  return Math.round(
    geoConf    * 0.5 +
    personConf * 0.3 +
    placeConf  * 0.2
  );
}

/**
 * matchCalcGeoAnchorScore_ — [F-8] Confidence for Rule 5 (Geo Anchor: geo + one of person/place)
 * Weight: geo=0.60, person=0.25, place=0.15 (capped at 95)
 * @param {number} geoConf - geoResult.confidence
 * @param {number} personConf - personResult.confidence (0 if not found)
 * @param {number} placeConf - placeResult.confidence (0 if not found)
 * @param {boolean} hasPerson - true if person matched, false if place matched
 * @returns {number} confidence (0-95)
 */
function matchCalcGeoAnchorScore_(geoConf, personConf, placeConf, hasPerson) {
  return Math.min(95, Math.round(
    geoConf                                      * 0.60 +
    (hasPerson ? personConf : 0)                 * 0.25 +
    (hasPerson ? 0           : placeConf)        * 0.15
  ));
}

// ============================================================
// SECTION 4: executeDecision — [REFACTOR-04] Dispatcher Pattern
// แยก AUTO_MATCH / CREATE_NEW / REVIEW ออกเป็น handler แยก
// ============================================================

/**
 * executeDecision — [REFACTOR-04] Dispatcher: เรียก handler ตาม action
 * REVIEW ไม่สร้าง FACT row — ป้องกัน null-FK garbage rows
 */
function executeDecision(srcObj, decision, personResult, placeResult, geoResult) {
  let personId = personResult ? personResult.personId : null;
  let placeId  = placeResult  ? placeResult.placeId  : null;
  let geoId    = geoResult    ? geoResult.geoId    : null;

  // [FIX v5.5.001] Only call getEnrichedGeoData() for AUTO_MATCH and CREATE_NEW
  // REVIEW rows don't need expensive geo enrichment
  let geoEnrich = null;
  const needsGeoEnrich = (decision.action === 'AUTO_MATCH' || decision.action === 'CREATE_NEW');

  if (needsGeoEnrich) {
    geoEnrich = getEnrichedGeoData(srcObj.rawAddress, srcObj.rawPlaceName);

    // [FIX v5.5.001] Only create GeoPoint for AUTO_MATCH and CREATE_NEW, not REVIEW
    // REVIEW rows should not create GeoPoints — they need human review first
    if (!geoId && srcObj.hasGeo && geoResult && geoResult.status !== 'NEARBY_PENDING') {
      geoId = createGeoPoint(
        srcObj.rawLat,
        srcObj.rawLng,
        'driver',
        geoEnrich.fullAddress || srcObj.rawAddress,
        geoEnrich.province    || srcObj.province,
        geoEnrich.district    || srcObj.district,
        placeId
      );
      if (geoResult) geoResult.geoId = geoId;
    }
  }

  // ─── Dispatch to handler ───────────────────────────────────
  switch (decision.action) {
    case 'AUTO_MATCH':
      return handleAutoMatch_(srcObj, decision, personId, placeId, geoId);
    case 'CREATE_NEW':
      return handleCreateNew_(srcObj, decision, personResult, placeResult, geoId, geoEnrich);
    case 'REVIEW':
      return handleReview_(srcObj, decision, personResult, placeResult, geoResult);
    default:
      logError('MatchEngine', `executeDecision: Unknown action: ${decision.action}`, new Error('UNKNOWN_ACTION:' + decision.action));
      return { txId: null, factData: null, reviewData: null };
  }
}

/**
 * handleAutoMatch_ — [REFACTOR-04] AUTO_MATCH handler
 * [PERF-001] เปลี่ยนจากเรียก stats update ทันที → ส่ง ID กลับให้ caller เก็บไว้ batch
 * เหตุผล: เดิมเรียก updatePersonStats/PlaceStats/GeoStats/DestStats ทุกแถว
 *         แต่ละฟังก์ชันใช้ 2-3 API calls (getValues+setValues+cache invalidate)
 *         ทำให้ N แถว = N×4×2-3 = 8-12N API calls เฉพาะ stats
 *         แก้แล้ว: เก็บ ID ใน Set/Array → flush ทีเดียวใน flushBatches_()
 *         ใช้ Set เพื่อ dedup: ถ้า personId เดียวกันโดนหลายแถว → อัปเดตครั้งเดียว
 */
function handleAutoMatch_(srcObj, decision, personId, placeId, geoId) {
  // [PERF-001] Defer stats updates — collect IDs instead of calling immediately
  // Stats updates will be done in flushBatches_() via processOneRow() return values
  const statsToDefer = {
    personIds: [],
    placeIds:  [],
    geoIds:    [],
    destStats: []
  };

  if (personId) statsToDefer.personIds.push(personId);
  if (placeId)  statsToDefer.placeIds.push(placeId);
  if (geoId)    statsToDefer.geoIds.push(geoId);

  const destResult = resolveDestination(personId, placeId, geoId);
  let destId = null;
  if (destResult.status === 'FOUND' || destResult.status === 'PARTIAL_MATCH') {
    destId = destResult.destId;
    if (destId) statsToDefer.destStats.push({ destId: destId, deliveryDate: srcObj.deliveryDate });
  } else {
    destId = createDestination(
      personId, placeId, geoId,
      srcObj.rawLat, srcObj.rawLng,
      srcObj.deliveryDate
    );
  }

  const txRes = upsertFactDelivery(srcObj, personId, placeId, geoId, destId, decision);
  return {
    txId:       txRes ? txRes.txId : null,
    factData:   txRes && txRes.isNew ? txRes.rowData : null,
    reviewData: null,
    statsToDefer: statsToDefer  // [PERF-001] ส่งกลับให้ caller
  };
}

/**
 * handleCreateNew_ — [REFACTOR-04] CREATE_NEW handler
 * Create Person/Place/Geo/Dest → write FACT
 * [PERF-001] NOTE: CREATE_NEW intentionally does NOT return statsToDefer because
 *   createPerson()/createPlace()/createGeoPoint()/createDestination() already set
 *   initial usage_count = 1 and last_seen = now. Deferring stats would double-count.
 *   Only handleAutoMatch_ (which reuses existing entities) needs deferred stats.
 */
function handleCreateNew_(srcObj, decision, personResult, placeResult, geoId, geoEnrich) {
  let personId = personResult ? personResult.personId : null;
  let placeId  = placeResult  ? placeResult.placeId  : null;
  let destId   = null;

  if (!personId && personResult.normResult) {
    personId = createPerson(personResult.normResult);
    // [FIX CRIT-005] เพิ่ม Person ใหม่เข้า alias enrichment context — ป้องกัน stale cache
    if (personId) {
      var pUuid = (typeof convertPersonIdToUuid === 'function') ? convertPersonIdToUuid(personId) : null;
      addEntityToEnrichmentContext_('PERSON', personId, pUuid, personResult.canonical || '', personResult.normalized || '');
    }
  }
  if (!placeId && placeResult.normResult) {
    const placeNorm = placeResult.normResult || {};
    placeNorm.fullAddress = srcObj.rawAddress || srcObj.rawPlaceName || geoEnrich.fullAddress;
    placeId = createPlace(
      placeNorm,
      geoEnrich.province,
      geoEnrich.district,
      geoEnrich.subDistrict,
      geoEnrich.postcode
    );
    // [FIX CRIT-005] เพิ่ม Place ใหม่เข้า alias enrichment context — ป้องกัน stale cache
    if (placeId) {
      var plUuid = (typeof convertPlaceIdToUuid === 'function') ? convertPlaceIdToUuid(placeId) : null;
      addEntityToEnrichmentContext_('PLACE', placeId, plUuid, placeNorm.canonical || '', placeNorm.normalized || '');
    }
  }
  // geoId created before switch (v5.2.003)

  if (geoId && (personId || placeId)) {
    destId = createDestination(
      personId, placeId, geoId,
      srcObj.rawLat, srcObj.rawLng,
      srcObj.deliveryDate
    );
  }

  const txRes = upsertFactDelivery(srcObj, personId, placeId, geoId, destId, decision);
  return {
    txId:       txRes ? txRes.txId : null,
    factData:   txRes && txRes.isNew ? txRes.rowData : null,
    reviewData: null
  };
}

/**
 * handleReview_ — [REFACTOR-04] REVIEW handler
 * ❌ ไม่สร้าง FACT row — REVIEW ไม่มี personId/placeId/geoId/destId ครบ
 * REVIEW ถูกบันทึกใน Q_REVIEW แทน
 */
function handleReview_(srcObj, decision, personResult, placeResult, geoResult) {
  const qRes = enqueueReview(srcObj, decision, personResult, placeResult, geoResult);
  if (qRes && qRes.rowData) {
    // [FIX CRIT-006] ใช้ 'REVIEW' แทน 'SUCCESS' — แถวยังไม่ได้ประมวลผลจริง แค่อยู่ในคิวรอตรวจ
    updateSyncStatus_([srcObj], 'REVIEW');
  }
  return {
    txId:       null,
    factData:   null,
    reviewData: qRes ? qRes.rowData : null
  };
}




// ============================================================
// SECTION 5: Helper Functions
// ============================================================

/**
 * getSameDayDestinations
 * [FIX v003] ใช้ Utilities.formatDate แทน toDateString (timezone safe)
 * [FIX v003] อ่านเฉพาะ DELIVERY_DATE + GEO_ID + TX_ID + PERSON_ID + PLACE_ID
 */
// [PERF-005] RAM cache สำหรับ getSameDayDestinations — ลดการอ่านชีต FACT_DELIVERY ซ้ำซ้อน
// Key: "yyyy-MM-dd::geoId" → Array of results
let _SAME_DAY_DEST_CACHE = null;

/**
 * getSameDayDestinations
 * [FIX v003] ใช้ Utilities.formatDate แทน toDateString (timezone safe)
 * [FIX v003] อ่านเฉพาะ DELIVERY_DATE + GEO_ID + TX_ID + PERSON_ID + PLACE_ID
 * [PERF-005] เพิ่ม RAM cache — อ่านชีต FACT_DELIVERY ครั้งเดียว แล้ว index ด้วย Map
 *            เดิม: ทุกครั้งที่เรียก = 1 getRange().getValues() + O(N) loop
 *            ใหม่: อ่าน 1 ครั้ง → สร้าง Map → ค้นหาด้วย key O(1)
 */
function getSameDayDestinations(deliveryDate, geoId) {
  if (!deliveryDate || !geoId) return [];

  const tz         = Session.getScriptTimeZone();
  const targetDate = Utilities.formatDate(
    new Date(deliveryDate), tz, 'yyyy-MM-dd'
  );
  const cacheKey   = targetDate + '::' + geoId;

  // [PERF-005] สร้าง RAM cache ถ้ายังไม่มี
  if (!_SAME_DAY_DEST_CACHE) {
    _SAME_DAY_DEST_CACHE = new Map();
    const ss    = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(SHEET.FACT_DELIVERY);
    if (!sheet || sheet.getLastRow() < 2) return [];

    const colsNeeded = [
      FACT_IDX.TX_ID, FACT_IDX.PERSON_ID, FACT_IDX.PLACE_ID,
      FACT_IDX.GEO_ID, FACT_IDX.DELIVERY_DATE
    ];
    const maxCol = Math.max(...colsNeeded) + 1;
    const data   = sheet.getRange(2, 1, sheet.getLastRow() - 1, maxCol).getValues();

    // Index ทั้งชีตเป็น Map: "date::geoId" → results[]
    for (let i = 0; i < data.length; i++) {
      const rowDate = data[i][FACT_IDX.DELIVERY_DATE];
      if (!rowDate) continue;
      const formattedDate = Utilities.formatDate(
        new Date(rowDate), tz, 'yyyy-MM-dd'
      );
      const rowGeoId = String(data[i][FACT_IDX.GEO_ID] || '');
      if (!rowGeoId) continue;
      const key = formattedDate + '::' + rowGeoId;
      if (!_SAME_DAY_DEST_CACHE.has(key)) {
        _SAME_DAY_DEST_CACHE.set(key, []);
      }
      _SAME_DAY_DEST_CACHE.get(key).push({
        txId:     data[i][FACT_IDX.TX_ID],
        personId: data[i][FACT_IDX.PERSON_ID],
        placeId:  data[i][FACT_IDX.PLACE_ID],
        geoId:    rowGeoId,
      });
    }
  }

  return _SAME_DAY_DEST_CACHE.has(cacheKey) ? _SAME_DAY_DEST_CACHE.get(cacheKey) : [];
}

/**
 * invalidateSameDayDestCache_ — [PERF-005] ล้าง RAM cache เมื่อ FACT_DELIVERY เปลี่ยน
 */
function invalidateSameDayDestCache_() {
  _SAME_DAY_DEST_CACHE = null;
}

function detectSameGeoMultiPerson(geoId, currentPersonId) {
  const allDests = loadAllDestinations_();
  return allDests.some(d =>
    d.geoId    === geoId &&
    d.personId !== currentPersonId &&
    d.status   === APP_CONST.STATUS_ACTIVE
  );
}

function getGeoProvince_(geoId) {
  if (!geoId) return '';
  const allGeos = loadAllGeos_();
  const geo     = allGeos.find(g => g.geoId === geoId);
  return geo ? (geo.province || '') : '';
}

// ============================================================
// SECTION 6: Processing State Reset + Auto-Resume
// [REF-018] ลบ saveCheckpoint_, loadCheckpoint_ (dead code)
// เปลี่ยนชื่อ clearCheckpoint_ → resetProcessingState_ (ชัดเจนขึ้น)
// ============================================================

/**
 * resetProcessingState_ — [REF-018] ล้าง stale processing state จาก PropertiesService
 * เดิมชื่อ clearCheckpoint_ — เปลี่ยนชื่อเพื่อให้ชัดเจนว่าคือ reset state ไม่ใช่ checkpoint
 * รักษาพฤติกรรมเดิม 100% — ลบ MATCH_CHECKPOINT_INDEX และ MATCH_CHECKPOINT_ROW
 */
function resetProcessingState_() {
  try {
    var props = PropertiesService.getScriptProperties();
    props.deleteProperty('MATCH_CHECKPOINT_INDEX');
    props.deleteProperty('MATCH_CHECKPOINT_ROW');
  } catch (e) { /* ignore — cleanup only */ }
  logInfo('MatchEngine', 'ล้าง Processing State เรียบร้อย');
}

// [REF-018] DELETED: saveCheckpoint_ — ไม่ถูกเรียกใช้แล้ว (SYNC_STATUS ทำหน้าที่แทน)
// [REF-018] DELETED: loadCheckpoint_ — ไม่ถูกเรียกใช้แล้ว (SYNC_STATUS ทำหน้าที่แทน)

/**
 * [NEW v5.2.003] Auto-Trigger System
 * [FIX v5.2.015] ป้องกันการลบทริกเกอร์ตั้งเวลาถาวรของผู้ใช้โดยการจำ ID
 */
function installAutoResume_(funcName) {
  removeAutoResume_(); // ลบของเก่าก่อนถ้ามี
  const trigger = ScriptApp.newTrigger(funcName)
    .timeBased()
    .after(60 * 1000) // ให้รันต่อในอีก 1 นาที (หลบ Timeout)
    .create();
  const triggerId = trigger.getUniqueId();
  PropertiesService.getScriptProperties().setProperty('AUTO_RESUME_TRIGGER_ID', triggerId);
  logInfo('MatchEngine', `ติดตั้ง Auto-Trigger: ${funcName} (ID: ${triggerId}) จะทำงานต่อใน 1 นาที`);
}

function removeAutoResume_() {
  const props = PropertiesService.getScriptProperties();
  const autoResumeTriggerId = props.getProperty('AUTO_RESUME_TRIGGER_ID');
  const triggers = ScriptApp.getProjectTriggers();
  let deletedCount = 0;
  
  for (const trigger of triggers) {
    const triggerId = trigger.getUniqueId();
    if (autoResumeTriggerId && triggerId === autoResumeTriggerId) {
      ScriptApp.deleteTrigger(trigger);
      deletedCount++;
    }
  }
  
  props.deleteProperty('AUTO_RESUME_TRIGGER_ID');
  
  if (deletedCount > 0) {
    logInfo('MatchEngine', `ลบ Auto-Trigger ที่ค้างอยู่ (${deletedCount} รายการ)`);
  }
}

// ============================================================
// SECTION 6: Abstraction Layer [REF-002]
// Thin wrappers around Group 2 calls for decoupling
// ============================================================

/**
 * loadSourceBatch_ — [REF-002] Load unprocessed rows from source
 * Thin wrapper around getUnprocessedRows() from 04_SourceRepository
 * @return {Array} Array of source objects to process
 */
function loadSourceBatch_() {
  return getUnprocessedRows();
}

/**
 * persistResult_ — [REF-002] Persist fact delivery + review data to sheets
 * Encapsulates the write logic for FACT_DELIVERY and Q_REVIEW sheets,
 * including alias enrichment and color coding.
 * @param {Array} factData - Array of fact row arrays to write to FACT_DELIVERY
 * @param {Array} reviewData - Array of review row arrays to write to Q_REVIEW
 */
function persistResult_(factData, reviewData) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  if (factData.length > 0) {
    const factSheet = ss.getSheetByName(SHEET.FACT_DELIVERY);
    factSheet.getRange(factSheet.getLastRow() + 1, 1, factData.length, factData[0].length).setValues(factData);
    // [FIX CRIT-003] ล้าง FACT invoice RAM cache เพราะมีแถวใหม่ถูกเขียน
    if (typeof invalidateFactInvoiceCache_ === 'function') invalidateFactInvoiceCache_();
    // [PERF-005] ล้าง same-day dest cache เพราะ FACT_DELIVERY เปลี่ยน
    if (typeof invalidateSameDayDestCache_ === 'function') invalidateSameDayDestCache_();
    // [UPGRADE v5.2.010] สร้าง Alias อัตโนมัติแบบ Real-time ทันทีที่บันทึก FACT สำเร็จ
    // [FIX v5.4.001] ห่อด้วย try-catch เพื่อป้องกัน alias error ทำให้ SYNC_STATUS ไม่ถูกอัปเดต
    try {
      autoEnrichAliasesFromFactBatch_(factData);
    } catch (aliasErr) {
      // [FIX CRIT-014] เพิ่ม invoice list ใน error message เพื่อให้สามารถตรวจสอบได้
      var failedInvoices = factData.map(function(r) { return normalizeInvoiceNo(r[FACT_IDX.INVOICE_NO]); }).filter(Boolean);
      logError('MatchEngine', 'autoEnrichAliases ล้มเหลว — M_ALIAS ขาดสำหรับ Invoice: ' + failedInvoices.join(', ') + '. กรุณารัน generatePersonAliasesFromHistory เพื่อซ่อมแซม: ' + aliasErr.message, aliasErr);
    }
  }

  if (reviewData.length > 0) {
    const reviewSheet = ss.getSheetByName(SHEET.Q_REVIEW);
    const startRow = reviewSheet.getLastRow() + 1;
    const numCols = reviewData[0].length;
    reviewSheet.getRange(startRow, 1, reviewData.length, numCols).setValues(reviewData);

    // [UPGRADE v5.2.005] ระบายสีแถว Q_REVIEW ตาม issue_type
    const backgrounds = reviewData.map(row => {
      const issueType = String(row[REVIEW_IDX.ISSUE_TYPE] || '').trim();
      let color = null;
      if (issueType === 'GEO_NEARBY_YELLOW') color = '#fff2cc';
      else if (issueType === 'GEO_NEARBY_ORANGE') color = '#fce5cd';
      return new Array(numCols).fill(color);
    });
    reviewSheet.getRange(startRow, 1, reviewData.length, numCols).setBackgrounds(backgrounds);
  }
}

// ============================================================
// SECTION 7: Group 1 Gateway [REF-001]
// resolveAndPersist_ — Encapsulates resolve-create-enrich-upsert sequence
// so Group 2 (ReviewService) doesn't call Group 1 CRUD directly
// ============================================================

/**
 * resolveAndPersist_ — [REF-001] Gateway function for Group 1 CRUD operations
 * Encapsulates the full resolve-create-enrich-upsert sequence.
 * Used by ReviewService to avoid direct Group 1 CRUD calls.
 *
 * For MERGE_TO_CANDIDATE:
 *   - Resolves person, merges if needed
 *   - Resolves geo and destination
 *   - Calls upsertFactDelivery
 *
 * For CREATE_NEW:
 *   - Resolves/creates person, place, geo, destination
 *   - Enriches geo data
 *   - Calls upsertFactDelivery
 *
 * @param {Object} srcObj - Source object with raw data
 * @param {string} decisionType - 'MERGE_TO_CANDIDATE' or 'CREATE_NEW'
 * @param {Object} candidates - { candPersonIds: [], candPlaceIds: [] } for MERGE
 * @return {Object|null} { factRowData } or null
 */
function resolveAndPersist_(srcObj, decisionType, candidates) {
  if (decisionType === 'MERGE_TO_CANDIDATE') {
    return resolveAndPersistMerge_(srcObj, candidates);
  } else if (decisionType === 'CREATE_NEW') {
    return resolveAndPersistCreate_(srcObj);
  }
  logWarn('MatchEngine', 'resolveAndPersist_: Unknown decisionType ' + decisionType);
  return null;
}

/**
 * resolveAndPersistMerge_ — [REF-001] MERGE path within resolveAndPersist_
 * @param {Object} srcObj
 * @param {Object} candidates - { candPersonIds: [], candPlaceIds: [] }
 * @return {Object|null} { factRowData } or null
 */
function resolveAndPersistMerge_(srcObj, candidates) {
  var targetPersonId = null;
  if (candidates && candidates.candPersonIds && candidates.candPersonIds.length > 0) {
    var personResult = resolvePerson(srcObj.rawPersonName);
    if (personResult.personId && personResult.personId !== candidates.candPersonIds[0]) {
      mergePersonRecords(personResult.personId, candidates.candPersonIds[0]);
    }
    targetPersonId = candidates.candPersonIds[0];
  }

  var targetPlaceId = (candidates && candidates.candPlaceIds && candidates.candPlaceIds.length > 0)
    ? candidates.candPlaceIds[0] : null;

  // Geo + Dest resolution
  var targetGeoId = null;
  var targetDestId = null;
  if (srcObj.hasGeo) {
    var geoResult = resolveGeo(srcObj.rawLat, srcObj.rawLng);
    targetGeoId = geoResult ? geoResult.geoId : null;
  }
  if (targetPersonId || targetPlaceId) {
    var destResult = resolveDestination(targetPersonId, targetPlaceId, targetGeoId);
    if (destResult && (destResult.status === 'FOUND' || destResult.status === 'PARTIAL_MATCH')) {
      targetDestId = destResult.destId;
    }
  }

  var factResult = upsertFactDelivery(srcObj, targetPersonId, targetPlaceId, targetGeoId, targetDestId,
    { action: 'MERGE_TO_CANDIDATE', reason: 'REVIEW_MERGE_APPROVED', confidence: 90, priority: 0 });

  if (factResult && factResult.isNew && factResult.rowData) {
    return { factRowData: factResult.rowData };
  }
  return null;
}

/**
 * resolveAndPersistCreate_ — [REF-001] CREATE_NEW path within resolveAndPersist_
 * @param {Object} srcObj
 * @return {Object|null} { factRowData } or null
 */
function resolveAndPersistCreate_(srcObj) {
  var rawPerson = srcObj.rawPersonName || '';
  var rawPlace  = srcObj.rawPlaceName || '';
  var rawAddr   = srcObj.rawAddress || '';

  // Geo enrichment
  var geoEnrich = null;
  try {
    geoEnrich = getEnrichedGeoData(rawAddr, rawPlace);
  } catch (geoErr) {
    logDebug('MatchEngine', 'resolveAndPersistCreate_: getEnrichedGeoData ข้าม — ' + geoErr.message);
  }
  var safeGeoEnrich = geoEnrich || {};

  // Person
  var personResult = resolvePerson(rawPerson);
  var personId = personResult.personId;
  if (!personId) personId = createPerson(personResult.normResult);

  // Place
  var placeResult = resolvePlace(rawPlace, rawAddr);
  var placeId = placeResult.placeId;
  if (!placeId) {
    var placeNorm = placeResult.normResult || {};
    if (safeGeoEnrich.fullAddress) placeNorm.fullAddress = safeGeoEnrich.fullAddress;
    placeId = createPlace(placeNorm, safeGeoEnrich.province, safeGeoEnrich.district,
                          safeGeoEnrich.subDistrict, safeGeoEnrich.postcode);
  }

  // Geo
  var geoId = null;
  if (srcObj.hasGeo) {
    var geoRes = resolveGeo(srcObj.rawLat, srcObj.rawLng);
    geoId = geoRes.geoId;
    if (!geoId) {
      geoId = createGeoPoint(srcObj.rawLat, srcObj.rawLng, 'manual',
        safeGeoEnrich.fullAddress || rawAddr,
        safeGeoEnrich.province,
        safeGeoEnrich.district, placeId);
    }
  }

  // Destination
  var destId = null;
  if (geoId && (personId || placeId)) {
    destId = createDestination(personId, placeId, geoId, srcObj.rawLat, srcObj.rawLng, null);
  }

  var factResult = upsertFactDelivery(srcObj, personId, placeId, geoId, destId,
    { action: 'CREATE_NEW', reason: 'REVIEW_APPROVED', confidence: 95, priority: 0 });

  if (factResult && factResult.isNew && factResult.rowData) {
    return { factRowData: factResult.rowData };
  }
  return null;
}
