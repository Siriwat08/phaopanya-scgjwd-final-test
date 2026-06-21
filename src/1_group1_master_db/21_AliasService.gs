/**
 * VERSION: 5.5.016
 * FILE: 21_AliasService.gs
 * LMDS V5.5 — Hybrid Alias Architecture (Global M_ALIAS + Entity-Specific Views)
 * ===================================================
 * PURPOSE:
 *   จัดการตารางกลาง M_ALIAS — เชื่อมโยงชื่อสกปรก/ย่อ/ผิด → master_uuid → พิกัด
 *   เป็น Single Source of Truth สำหรับ Alias Resolution ที่ Group 2 ใช้ค้นหา
 *   ⚠️ Auto Pipeline ไม่เขียน M_ALIAS ที่นี่ — เขียนที่ autoEnrichAliasesFromFactBatch_() เท่านั้น
 * ===================================================
 *   v5.5.016 (2026-06-21) — PERFORMANCE FIX (13 issues, Cycle 13):
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
 *     - [REMOVE] syncAliasToEntityTable_(): ลบฟังก์ชัน sync ย้อน เพราะทำให้เกิด circular dependency
 *     - [REMOVE] createGlobalAlias(): ลบ syncAliasToEntityTable_() call — เขียนแค่ M_ALIAS
 *     - [UPDATE] createGlobalAlias(): ใช้สำหรับ Migration/Admin เท่านั้น (ไม่ใช่ auto pipeline)
 *   v5.4.000 (2026-05-23):
 *     - [ADD] Hybrid Alias Architecture: M_ALIAS ตารางกลาง + entity-specific cached views
 *     - [ADD] assignMasterUuidIfMissing(): ตรวจสอบและเพิ่ม master_uuid ให้ทุกแถวใน M_PERSON/M_PLACE
 *     - [ADD] MIGRATION_HybridAliasSystem(): ย้ายข้อมูลจาก M_PERSON_ALIAS/M_PLACE_ALIAS → M_ALIAS
 *     - [ADD] populateAliasFromSCGRawData_(): ดึงชื่อปลายทางจากชีต SCG ดิบ → M_ALIAS
 *     - [ADD] fastLookupByShipToName(): ค้นหาพิกัดจาก ShipToName เท่านั้น (Fast Track สำหรับ Daily Job)
 *     - [ADD] loadGlobalAliasesMap_() / loadGlobalAliasReverseIndex_(): Cached loaders
 *     - [ADD] resolveMasterUuidViaGlobalAlias(): Variant → masterUuid lookup
 *     - [ADD] UUID ↔ Entity ID converters (convertUuidToPersonId, etc.)
 * ===================================================
 * DEPENDENCIES:
 *   REQUIRES (Load Order):
 *     - 01_Config.gs          (SHEET.M_ALIAS, ALIAS_IDX.*, AI_CONFIG, CACHE_KEY.GLOBAL_ALIAS_ALL,
 *                              CACHE_KEY.GLOBAL_ALIAS_REVERSE [V5.5.007 P1 #8])
 *     - 02_Schema.gs          (SCHEMA[SHEET.M_ALIAS], SCHEMA[SHEET.M_PERSON], SCHEMA[SHEET.M_PLACE])
 *     - 03_SetupSheets.gs     (logInfo, logWarn, logError, logDebug, flushLogBuffer_ [V5.5.008 P2 #11])
 *     - 05_NormalizeService.gs (normalizeForCompare)
 *     - 14_Utils.gs           (generateShortId,
 *                              saveChunkedCache_, loadChunkedCache_, invalidateChunkedCache_ [V5.5.007 P1 #7])
 *   CALLS (Invokes):
 *     - loadAllPersons_()                 → 06_PersonService.gs (UUID converters)
 *     - loadAllPlaces_()                  → 07_PlaceService.gs (UUID converters)
 *     - getDestsByPersonId()              → 09_DestinationService.gs (fastLookupByShipToName)
 *     - getDestsByPlaceId()               → 09_DestinationService.gs (fastLookupByShipToName)
 *     - saveChunkedCache_/loadChunkedCache_ → 14_Utils.gs (saveAliasCacheChunked_/
 *       loadAliasCacheChunked_ now delegate here) [V5.5.007 P1 #7]
 *     - invalidateChunkedCache_ → 14_Utils.gs (migrateStep1_AssignUuid_ uses this
 *       instead of raw removeAll to avoid orphaned chunk keys) [V5.5.007 P0 #4]
 *     - flushLogBuffer_() → 03_SetupSheets (MIGRATION_HybridAliasSystem finally) [V5.5.008 P2 #11]
 *   EXPORTS TO:
 *     - 06_PersonService.gs   (resolveMasterUuidViaGlobalAlias, convertUuidToPersonId)
 *     - 07_PlaceService.gs    (resolveMasterUuidViaGlobalAlias, convertUuidToPlaceId)
 *     - 10_MatchEngine.gs     (convertPersonIdToUuid — in legacy Migration code)
 *     - 17_SearchService.gs   (fastLookupByShipToName — Group 2 Fast Track)
 *   SHEETS ACCESSED:
 *     - SHEET.M_ALIAS         (Read+Write: Global alias table — ⚠️ Single Writer = autoEnrich)
 *     - SHEET.M_PERSON        (Read: UUID ↔ personId conversion)
 *     - SHEET.M_PLACE         (Read: UUID ↔ placeId conversion)
 *     - SHEET.M_PERSON_ALIAS  (Read: Migration source, dedup check)
 *     - SHEET.M_PLACE_ALIAS   (Read: Migration source, dedup check)
 *     - SHEET.SOURCE          (Read: SCG Raw data → populateAliasFromSCGRawData_)
 *     - SHEET.FACT_DELIVERY   (Read: populateAliasFromFactDelivery_)
 * ===================================================
 * ARCHITECTURE:
 *   ┌─────────────────────────────────────────────────────────────┐
 *   │  21_AliasService.gs (Hybrid Alias — Read Path + Migration)  │
 *   │  │                                                          │
 *   │  │  ⚠️ WRITE PATH: autoEnrichAliasesFromFactBatch_() ONLY   │
 *   │  │     (this file does NOT auto-write M_ALIAS in pipeline)  │
 *   │  │                                                          │
 *   │  ├── [Read Path — Group 2 Fast Track]                      │
 *   │  │   ├── fastLookupByShipToName()                           │
 *   │  │   │   └── M_ALIAS → masterUuid → entityId → dest → lat,lng│
 *   │  │   ├── loadGlobalAliasReverseIndex_() (variant → masterUuid)│
 *   │  │   └── resolveMasterUuidViaGlobalAlias() (Person/Place)   │
 *   │  │                                                          │
 *   │  ├── [Read Path — Group 1 Candidate Search]                │
 *   │  │   └── loadGlobalAliasesMap_() (uuid → variants[])        │
 *   │  │                                                          │
 *   │  ├── [Write Path — Migration/Admin ONLY]                   │
 *   │  │   ├── createGlobalAlias() — Append to M_ALIAS (no sync) │
 *   │  │   ├── MIGRATION_HybridAliasSystem() — 5-step migration  │
 *   │  │   │   └── [V5.5.007 P0 #4] migrateStep1_AssignUuid_     │
 *   │  │   │       uses invalidateChunkedCache_ (was             │
 *   │  │   │       raw removeAll — avoids orphaned chunk keys)  │
 *   │  │   │   └── [V5.5.008 P2 #11] flushLogBuffer_() in finally│
 *   │  │   ├── populateAliasFromSCGRawData_()                    │
 *   │  │   └── populateAliasFromFactDelivery_()                  │
 *   │  │                                                          │
 *   │  ├── [Cache — V5.5.007 P1 #7] saveAliasCacheChunked_/      │
 *   │  │   loadAliasCacheChunked_ now delegate to centralized    │
 *   │  │   saveChunkedCache_/loadChunkedCache_ (14_Utils, putAll)│
 *   │  │                                                          │
 *   │  └── [Utilities]                                           │
 *   │      ├── UUID ↔ Entity ID converters (4 functions)         │
 *   │      ├── assignMasterUuidIfMissing()                       │
 *   │      └── generateUUID()                                    │
 *   └─────────────────────────────────────────────────────────────┘
 * ===================================================
 */

// [ADD v5.4.003] Checkpoint Key สำหรับ Migration Resume
// [FIX B4 v5.5.002] เปลี่ยนจาก var เป็น const ตาม Rule 9
const MIGRATION_CHECKPOINT_KEY = 'MIGRATION_ALIAS_STEP';

// ============================================================
// [FIX CRIT-001] Chunked Cache Helpers สำหรับ M_ALIAS
// [FIX v5.5.007 P1 #7] Delegate ไปที่ centralized saveChunkedCache_ / loadChunkedCache_
//   ใน 14_Utils.gs ที่ใช้ putAll() / getAll() แบบ batch (เร็วกว่า 5-10×)
// ============================================================

/**
 * saveAliasCacheChunked_ — [FIX v5.5.007 P1 #7] ใช้ centralized saveChunkedCache_
 *   เดิมใช้ sequential cache.put() ใน loop + แบ่ง chunk ตามจำนวน keys (200/chunk)
 *   ตอนนี้ delegate ไปที่ saveChunkedCache_ ที่แบ่งตามขนาด KB (90KB/chunk) + putAll()
 * [PERF-011] Removed legacy fallback — saveChunkedCache_ is required dependency
 * @param {string} cacheKey - Cache key prefix
 * @param {Object} data - Data object to cache
 */
function saveAliasCacheChunked_(cacheKey, data) {
  // [PERF-011] Defensive check — saveChunkedCache_ is required dependency from 14_Utils.gs
  if (typeof saveChunkedCache_ !== 'function') {
    throw new Error('saveAliasCacheChunked_: saveChunkedCache_ not loaded — check 14_Utils.gs');
  }
  var cache = CacheService.getScriptCache();
  saveChunkedCache_(cache, cacheKey, data);
}

/**
 * loadAliasCacheChunked_ — [FIX v5.5.007 P1 #7] ใช้ centralized loadChunkedCache_
 *   เดิมใช้ sequential cache.get() ใน loop (ช้ากว่า getAll() 5-10×)
 * [PERF-011] Removed legacy fallback — loadChunkedCache_ is required dependency
 * @param {string} cacheKey - Cache key prefix
 * @return {Object|null} Parsed data or null if not found
 */
function loadAliasCacheChunked_(cacheKey) {
  // [PERF-011] Defensive check — loadChunkedCache_ is required dependency from 14_Utils.gs
  if (typeof loadChunkedCache_ !== 'function') {
    throw new Error('loadAliasCacheChunked_: loadChunkedCache_ not loaded — check 14_Utils.gs');
  }
  var cache = CacheService.getScriptCache();
  var cached = loadChunkedCache_(cache, cacheKey);
  if (cached && typeof cached === 'object') {
    return cached;
  }
  return null;
}

// ============================================================
// SECTION 1: createGlobalAlias — สร้าง Alias ในตารางกลาง M_ALIAS
// ============================================================

/**
 * createGlobalAlias — สร้าง Alias ใน M_ALIAS (สำหรับ Migration/Admin เท่านั้น)
 * ⚠️ Auto Pipeline ใช้ autoEnrichAliasesFromFactBatch_() แทน — ไม่เรียกฟังก์ชันนี้
 * @param {string} masterUuid - UUID v4 ของ master entity
 * @param {string} variantName - ชื่อที่เขียนผิด/ย่อ/สกปรก
 * @param {string} entityType - 'PERSON' หรือ 'PLACE'
 * @param {number} confidence - 0-100
 * @param {string} source - 'AI'/'HUMAN'/'AUTO'/'MERGE'/'MIGRATION'/'SCG_RAW'
 * @return {string|null} aliasId หรือ null ถ้าซ้ำ
 */
function createGlobalAlias(masterUuid, variantName, entityType, confidence, source) {
  try {
  if (!masterUuid || !variantName || !entityType) return null;
  const cleanVariant = normalizeForCompare(variantName);
  if (!cleanVariant || cleanVariant.length < 2) return null;

  // ตรวจสอบ duplicate ใน RAM cache ก่อน (เร็วกว่าอ่านชีต)
  const existingMap = loadGlobalAliasesMap_();
  const uidKey = entityType + '_' + masterUuid;
  if (existingMap[uidKey] && existingMap[uidKey].includes(cleanVariant)) {
    return null; // มีอยู่แล้ว ข้าม
  }

  // เขียนลง M_ALIAS sheet
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET.M_ALIAS);
  if (!sheet) return null;

  const aliasId = generateShortId('A');
  const now = new Date();
  const newRow = [
    aliasId,
    masterUuid,
    variantName,           // เก็บชื่อดิบไว้ (ยังไม่ normalize)
    entityType,
    confidence || 100,
    source || 'MANUAL',
    now,
    true
  ];
  // [FIX v5.5.001] ใช้ getRange+setValues แทน appendRow เพื่อความเสถียร (consistent with other CRUD)
  const lastRow = sheet.getLastRow();
  sheet.getRange(lastRow + 1, 1, 1, newRow.length).setValues([newRow]);

  // [REMOVED v5.4.001] ไม่เรียก syncAliasToEntityTable_() อีกต่อไป
  // เพื่อป้องกัน circular dependency (createGlobalAlias → sync → createPersonAlias → createGlobalAlias)
  // M_PERSON_ALIAS / M_PLACE_ALIAS เขียนที่ autoEnrichAliasesFromFactBatch_() เท่านั้น

  // ล้าง Cache เพื่อให้การค้นหาครั้งถัดไปเห็นข้อมูลใหม่
  // [FIX CRIT-002] Use CACHE_KEY constants instead of hardcoded strings — Single Source of Truth
  CacheService.getScriptCache().removeAll([CACHE_KEY.GLOBAL_ALIAS_ALL, CACHE_KEY.GLOBAL_ALIAS_REVERSE]);

  logDebug('AliasService', `createGlobalAlias: ${aliasId} [${entityType}] (variant hash: ${generateMd5Hash(String(variantName || '')).substring(0, 8)}) → ${masterUuid.substring(0, 8)}... (${source})`);
  return aliasId;
  } catch (err) {
    // [FIX B3 v5.5.002] เพิ่ม try-catch ตาม Rule 12
    logError('AliasService', `createGlobalAlias ล้มเหลว: ${err.message}`, err);
    return null;
  }
}

// ============================================================
// SECTION 2: loadGlobalAliasesMap_ — โหลดข้อมูล M_ALIAS ทั้งหมดเข้า RAM
// ============================================================

/**
 * loadGlobalAliasesMap_ — โหลด M_ALIAS เป็น Map: { "PERSON_uuid": ["variant1","variant2"] }
 * ใช้ CacheService เพื่อลดการอ่านชีต
 * @return {Object} aliasMap
 */
function loadGlobalAliasesMap_() {
  const cacheKey = 'M_GLOBAL_ALIAS_ALL';
  // [FIX CRIT-001] ใช้ chunked cache loader แทน cache.get ตรง — ป้องกัน 100KB limit
  const cached = loadAliasCacheChunked_(cacheKey);
  if (cached) return cached;

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET.M_ALIAS);
  const resultObj = {};

  if (!sheet || sheet.getLastRow() < 2) return resultObj;

  const schemaLen = SCHEMA[SHEET.M_ALIAS].length;
  const data = sheet.getRange(2, 1, sheet.getLastRow() - 1, schemaLen).getValues();
  data.forEach(function(row) {
    if (row[ALIAS_IDX.ACTIVE_FLAG] !== true && String(row[ALIAS_IDX.ACTIVE_FLAG]).toUpperCase() !== 'TRUE') return;
    var masterId = String(row[ALIAS_IDX.MASTER_UUID] || '');
    var eType = String(row[ALIAS_IDX.ENTITY_TYPE] || '');
    var cleanName = normalizeForCompare(row[ALIAS_IDX.VARIANT_NAME]);
    if (!masterId || !eType || !cleanName) return;

    var dictKey = eType + '_' + masterId;
    if (!resultObj[dictKey]) resultObj[dictKey] = [];
    resultObj[dictKey].push(cleanName);
  });

  // [FIX CRIT-001] ใช้ chunked cache saver แทน cache.put ตรง — ป้องกัน 100KB limit
  saveAliasCacheChunked_(cacheKey, resultObj);
  return resultObj;
}

// ============================================================
// SECTION 3: loadGlobalAliasReverseIndex_ — ค้นหา variant → masterUuid
// ============================================================

/**
 * loadGlobalAliasReverseIndex_ — สร้าง reverse index: { "normalized_variant": [{masterUuid, entityType}] }
 * ใช้สำหรับค้นหาจาก ShipToName เท่านั้น (Fast Track)
 * @return {Object} reverseIndex
 */
function loadGlobalAliasReverseIndex_() {
  const cacheKey = 'M_GLOBAL_ALIAS_REVERSE';
  // [FIX CRIT-001] ใช้ chunked cache loader แทน cache.get ตรง — ป้องกัน 100KB limit
  const cached = loadAliasCacheChunked_(cacheKey);
  if (cached) return cached;

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET.M_ALIAS);
  const reverseIndex = {};

  if (!sheet || sheet.getLastRow() < 2) return reverseIndex;

  const schemaLen = SCHEMA[SHEET.M_ALIAS].length;
  const data = sheet.getRange(2, 1, sheet.getLastRow() - 1, schemaLen).getValues();
  data.forEach(function(row) {
    if (row[ALIAS_IDX.ACTIVE_FLAG] !== true && String(row[ALIAS_IDX.ACTIVE_FLAG]).toUpperCase() !== 'TRUE') return;
    var masterUuid = String(row[ALIAS_IDX.MASTER_UUID] || '');
    var eType = String(row[ALIAS_IDX.ENTITY_TYPE] || '');
    var cleanName = normalizeForCompare(row[ALIAS_IDX.VARIANT_NAME]);
    if (!masterUuid || !eType || !cleanName) return;

    if (!reverseIndex[cleanName]) reverseIndex[cleanName] = [];
    reverseIndex[cleanName].push({ masterUuid: masterUuid, entityType: eType });
  });

  // [FIX CRIT-001] ใช้ chunked cache saver แทน cache.put ตรง — ป้องกัน 100KB limit
  saveAliasCacheChunked_(cacheKey, reverseIndex);
  return reverseIndex;
}

// ============================================================
// SECTION 4: resolveMasterUuidViaGlobalAlias — ค้นหาจาก variant name
// ============================================================

/**
 * resolveMasterUuidViaGlobalAlias — ค้นหา masterUuid จาก variant name
 * ใช้โดย findPersonCandidates() และ findPlaceCandidates()
 * @param {string} queryName - ชื่อที่ต้องการค้นหา
 * @param {string} entityType - 'PERSON' หรือ 'PLACE'
 * @return {Object|null} { masterUuid, score } หรือ null
 */
function resolveMasterUuidViaGlobalAlias(queryName, entityType) {
  var cleanQ = normalizeForCompare(queryName);
  if (!cleanQ || cleanQ.length < 2) return { masterUuid: null, score: 0 };

  // [FIX v5.5.001] ใช้ reverse index แทน iteration ทั้ง aliasesMap — O(1) exact lookup
  var reverseIndex = loadGlobalAliasReverseIndex_();

  // 1. Exact match (O(1) lookup)
  var exactMatches = reverseIndex[cleanQ];
  if (exactMatches && exactMatches.length > 0) {
    // กรองตาม entityType
    for (var i = 0; i < exactMatches.length; i++) {
      if (exactMatches[i].entityType === entityType) {
        return { masterUuid: exactMatches[i].masterUuid, score: 100 };
      }
    }
  }

  // 2. Substring match fallback (iterate keys only when exact match fails)
  var bestMatch = null;
  var bestScore = 0;
  var maxIterations = 500; // [FIX CRIT-016] จำกัด iteration ป้องกัน timeout
  var iterated = 0;
  for (var key in reverseIndex) {
    if (++iterated > maxIterations) break; // [FIX CRIT-016]
    var entries = reverseIndex[key];
    // กรอง entries ตาม entityType
    var hasCorrectType = false;
    for (var j = 0; j < entries.length; j++) {
      if (entries[j].entityType === entityType) { hasCorrectType = true; break; }
    }
    if (!hasCorrectType) continue;

    var score = 0;
    if (key.length >= 4 && cleanQ.includes(key)) {
      score = 95; // Substring match
    } else if (cleanQ.length >= 4 && key.includes(cleanQ)) {
      score = 90; // Reverse substring match
    }

    if (score > bestScore) {
      bestScore = score;
      // หา masterUuid ของ entityType ที่ถูกต้อง
      for (var k = 0; k < entries.length; k++) {
        if (entries[k].entityType === entityType) {
          bestMatch = entries[k].masterUuid;
          break;
        }
      }
    }
  }

  return { masterUuid: bestMatch, score: bestScore };
}

// ============================================================
// SECTION 5: fastLookupByShipToName — Fast Track สำหรับ Daily Job
// ============================================================

/**
 * fastLookupByShipToName — ค้นหาพิกัดจาก ShipToName เท่านั้น (Fast Track)
 * ใช้สำหรับชีตตารางงานประจำวัน ที่ค้นหาด้วย ShipToName → M_ALIAS → masterUuid → destination → lat,lng
 * ไม่ต้องผ่าน resolvePerson หรือ resolvePlace ที่หนัก
 * @param {string} shipToName - ชื่อปลายทางจากคอลัมน์ ShipToName
 * @return {Object|null} { lat, lng, destId, status, confidence, reason } หรือ null
 */
function fastLookupByShipToName(shipToName) {
  if (!shipToName) return null;
  var cleanName = normalizeForCompare(shipToName);
  if (!cleanName || cleanName.length < 2) return null;

  // 1. ค้นหาจาก M_ALIAS reverse index (O(1) lookup)
  var reverseIndex = loadGlobalAliasReverseIndex_();
  var matches = reverseIndex[cleanName];

  if (!matches || matches.length === 0) {
    // 2. Fallback: ลองค้นหาแบบ substring
    var maxIterations = 500; // [FIX CRIT-017] จำกัด iteration ป้องกัน timeout
    var iterated = 0;
    for (var key in reverseIndex) {
      if (++iterated > maxIterations) break; // [FIX CRIT-017]
      if (key.length >= 4 && (cleanName.includes(key) || key.includes(cleanName))) {
        matches = reverseIndex[key];
        break;
      }
    }
  }

  if (!matches || matches.length === 0) return null;

  // 3. แปลง masterUuid → entityId → destination → coordinates
  // ลองทุก match ที่เจอ เอาอันแรกที่มีพิกัด
  for (var i = 0; i < matches.length; i++) {
    var match = matches[i];
    var entityId = null;
    var dests = [];

    if (match.entityType === 'PERSON') {
      entityId = convertUuidToPersonId(match.masterUuid);
      if (entityId) {
        dests = getDestsByPersonId(entityId);
      }
    } else if (match.entityType === 'PLACE') {
      entityId = convertUuidToPlaceId(match.masterUuid);
      if (entityId) {
        dests = getDestsByPlaceId(entityId);
      }
    }

    if (dests.length > 0) {
      // Sort by usageCount descending
      dests.sort(function(a, b) { return (b.usageCount || 0) - (a.usageCount || 0); });
      var topDest = dests[0];
      return {
        lat: topDest.lat,
        lng: topDest.lng,
        destId: topDest.destId,
        status: 'FOUND_ALIAS_FAST',
        confidence: 90,
        reason: 'M_ALIAS Fast Track: ' + match.entityType + ' via "' + shipToName + '"'
      };
    }
  }

  return null;
}

// ============================================================
// SECTION 6: [REMOVED v5.4.001] syncAliasToEntityTable_ — ลบแล้ว
// ============================================================
// ไม่ต้อง sync จาก M_ALIAS → M_PERSON_ALIAS/M_PLACE_ALIAS อีกต่อไป
// เพราะทำให้เกิด circular dependency:
//   createGlobalAlias() → syncAliasToEntityTable_() → createPersonAlias() → createGlobalAlias()
//
// ตอนนี้ M_PERSON_ALIAS + M_PLACE_ALIAS เขียนที่ autoEnrichAliasesFromFactBatch_() เท่านั้น
// ============================================================

// ============================================================
// SECTION 7: UUID ↔ Entity ID Converters
// [REF-003] Moved to 14_Utils.gs — these are pure mapping functions that
//   call loadAllPersons_()/loadAllPlaces_() from Group 1 services.
//   Moved here to avoid bidirectional coupling between AliasService ↔ PersonService/PlaceService.
//   Functions still available in global scope from 14_Utils.gs — no caller changes needed.
//   Moved functions: convertUuidToPersonId, convertUuidToPlaceId,
//                    convertPersonIdToUuid, convertPlaceIdToUuid
// ============================================================

// ============================================================
// SECTION 8: assignMasterUuidIfMissing — ตรวจสอบและเพิ่ม UUID ให้ทุก entity
// ============================================================

/**
 * assignMasterUuidIfMissing — ตรวจสอบว่าทุกแถวใน M_PERSON และ M_PLACE มี master_uuid แล้ว
 * ถ้ายังไม่มี → สร้าง UUID v4 ให้อัตโนมัติ
 * ควรรันหลังจาก setup sheets หรือก่อน migration
 * [SEC-003 FIX] Authorization Guard + Confirmation dialog — ป้องกัน bulk overwrite โดยไม่ตั้งใจ
 */
function assignMasterUuidIfMissing() {
  // [SEC-003 FIX] Authorization Guard
  if (typeof isAuthorizedUser_ === 'function' && !isAuthorizedUser_()) {
    safeUiAlert_('🔒 คุณไม่มีสิทธิ์ Assign Master UUID\nกรุณาติดต่อ Admin');
    return 0;
  }

  // [SEC-003 FIX] Confirmation dialog — ป้องกันการรันโดยไม่ตั้งใจ
  try {
    const ui = SpreadsheetApp.getUi();
    const confirm = ui.alert(
      '⚠️ ยืนยันการ Assign Master UUID',
      'ฟังก์ชันนี้จะสร้าง master_uuid ใหม่ให้แถวที่ยังไม่มี UUID ใน:\n' +
      '  • M_PERSON\n' +
      '  • M_PLACE\n\n' +
      'หาก M_ALIAS มีข้อมูลอ้างอิง UUID เดิมอยู่ จะใช้งานไม่ได้หลังจากนี้\n\n' +
      'แนะนำให้รัน Hybrid Alias Migration ครบถ้วนก่อน\n\n' +
      'ดำเนินการต่อ?',
      ui.ButtonSet.YES_NO
    );
    if (confirm !== ui.Button.YES) {
      logInfo('AliasService', 'assignMasterUuidIfMissing: ผู้ใช้ยกเลิก');
      return 0;
    }
  } catch (e) {
    // Trigger context ไม่มี UI — ข้าม confirmation แต่ยังอยู่ใน guard
    logWarn('AliasService', 'assignMasterUuidIfMissing: ข้าม confirmation (no UI context)');
  }

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var fixedTotal = 0;

  [SHEET.M_PERSON, SHEET.M_PLACE].forEach(function(sheetName) {
    try { // [FIX CRIT-015] Per-sheet isolation — error ใน sheet หนึ่งไม่ทำให้ sheet อื่นเสีย
    var sheet = ss.getSheetByName(sheetName);
    if (!sheet) return;

    // [FIX S3 v5.5.002] ใช้ *_IDX constant แทน headers.indexOf() — Rule 2
    var mUuidColIdx = sheetName === SHEET.M_PERSON
      ? PERSON_IDX.MASTER_UUID
      : PLACE_IDX.MASTER_UUID;

    // Guard: ตรวจว่าคอลัมน์มีอยู่จริงในชีต
    if (mUuidColIdx >= sheet.getLastColumn()) {
      logWarn('AliasService', sheetName + ': คอลัมน์ master_uuid เกินขอบเขตชีต — ข้าม');
      return;
    }

    var lr = sheet.getLastRow();
    if (lr < 2) return;

    var uuidColRange = sheet.getRange(2, mUuidColIdx + 1, lr - 1, 1);
    var uidData = uuidColRange.getValues();
    var fixedCount = 0;

    for (var i = 0; i < uidData.length; i++) {
      if (!uidData[i][0]) {
        uidData[i][0] = Utilities.getUuid();
        fixedCount++;
      }
    }

    if (fixedCount > 0) {
      uuidColRange.setValues(uidData);
      logInfo('AliasService', sheetName + ': มอบ master_uuid ให้ ' + fixedCount + ' แถวที่ยังไม่มี');
    }
    fixedTotal += fixedCount;
    } catch (sheetErr) {
      logError('AliasService', sheetName + ': ' + sheetErr.message, sheetErr);
    }
  });

  // ล้าง Cache เพื่อให้ loader เห็นข้อมูลใหม่
  if (fixedTotal > 0) {
    invalidateAllGlobalCaches();
  }

  return fixedTotal;
}

// ============================================================
// SECTION 9: MIGRATION — ย้ายข้อมูลจาก Entity Alias → M_ALIAS
// [FIX BUG-A3] v5.4.003: var uuidFixed = 0 ก่อน if-block กัน undefined บน resume
// [FIX BUG-A2] v5.4.003: เพิ่ม try-catch ครอบ outer
// [FIX v5.5.001] แก้ duplicate Section numbering (เดิมมี Section 8 และ 9 ซ้ำกัน)
// [REF-005] Step Orchestrator pattern — each step extracted to private helper
// ============================================================

/**
 * MIGRATION_HybridAliasSystem — Entry Point (Menu)
 * [REF-005] Refactored to Step Orchestrator (~50 lines)
 *   Each step delegated to migrateStep*_ helper for SRP.
 *   Checkpoint resume + Time Guard preserved.
 */
function MIGRATION_HybridAliasSystem() {
  // [SEC-002] Authorization Guard
  if (typeof isAuthorizedUser_ === 'function' && !isAuthorizedUser_()) {
    safeUiAlert_('🔒 คุณไม่มีสิทธิ์รัน Migration\nกรุณาติดต่อ Admin');
    return;
  }
  const ui = SpreadsheetApp.getUi();

  const confirmation = ui.alert(
    '🔄 Migration: Hybrid Alias System',
    'ระบบจะดำเนินการดังนี้:\n' +
    '1. ตรวจสอบและเพิ่ม master_uuid ให้ทุก entity ที่ยังไม่มี\n' +
    '2. ย้ายข้อมูลจาก M_PERSON_ALIAS → M_ALIAS\n' +
    '3. ย้ายข้อมูลจาก M_PLACE_ALIAS → M_ALIAS\n' +
    '4. ดึงชื่อปลายทางจากชีต SCG ดิบ → M_ALIAS\n\n' +
    '⚠️ มี Time Guard ป้องกัน Timeout (5 นาที)\n' +
    'หากข้อมูลเยอะ อาจต้องรันหลายครั้ง\n\n' +
    'พร้อมดำเนินการหรือไม่?',
    ui.ButtonSet.YES_NO
  );
  if (confirmation !== ui.Button.YES) return;

  // [FIX BUG-A2] try-catch ครอบ execution ทั้งหมด
  try {
    const state     = loadMigrationCheckpoint_();
    const ss        = SpreadsheetApp.getActiveSpreadsheet();
    const startTime = new Date();
    const timeLimit = AI_CONFIG.TIME_LIMIT_MS || (5 * 60 * 1000);
    let   timedOut  = false;

    // ─── Step 1: ตรวจสอบ master_uuid ─── [REF-005]
    var uuidFixed = migrateStep1_AssignUuid_(ss, state);

    var migrateCount = 0;

    // ─── Step 2: ย้าย M_PERSON_ALIAS → M_ALIAS ─── [REF-005]
    if (!timedOut && state.step <= 2) {
      var step2Result = migrateStep2_PersonAlias_(ss, state, startTime, timeLimit);
      migrateCount += step2Result.count;
      timedOut = timedOut || step2Result.timedOut;
    }

    // ─── Step 3: ย้าย M_PLACE_ALIAS → M_ALIAS ─── [REF-005]
    if (!timedOut && state.step <= 3) {
      var step3Result = migrateStep3_PlaceAlias_(ss, state, startTime, timeLimit);
      migrateCount += step3Result.count;
      timedOut = timedOut || step3Result.timedOut;
    }

    // ─── Step 4: ดึงจาก SCG ดิบ ─── [REF-005]
    var scgCount = 0;
    if (!timedOut && state.step <= 4) {
      var step4Result = migrateStep4_SCGData_(ss, state, startTime, timeLimit);
      scgCount = step4Result.count;
      timedOut = timedOut || step4Result.timedOut;
    }

    // ─── Step 5: ดึงจาก FACT ─── [REF-005]
    var factCount = 0;
    if (!timedOut && state.step <= 5) {
      var step5Result = migrateStep5_FactData_(ss, state, startTime, timeLimit);
      factCount = step5Result.count;
      timedOut = timedOut || step5Result.timedOut;
    }

    const elapsedSec   = Math.round((new Date() - startTime) / 1000);
    const totalMigrated = migrateCount + scgCount + factCount;

    if (!timedOut) clearMigrationCheckpoint_();

    logInfo('AliasService',
      'Migration: UUID=' + uuidFixed +
      ' PersonAlias→M_ALIAS=' + migrateCount +
      ' SCG→M_ALIAS=' + scgCount +
      ' FACT→M_ALIAS=' + factCount +
      ' รวม=' + totalMigrated +
      (timedOut ? ' ⚠️ TIMEOUT' : '') +
      ' (' + elapsedSec + 's)'
    );

    const uuidLabel = (state.step <= 1)
      ? ('• เพิ่ม master_uuid: ' + uuidFixed + ' รายการ\n')
      : '• master_uuid: ข้าม (Checkpoint Resume)\n';  // [FIX BUG-A3]

    // [FIX B2 v5.5.002] เปลี่ยน ui.alert() เป็น safeUiAlert_() — trigger-safe (Rule 4)
    safeUiAlert_(
      (timedOut ? '⚠️ Migration หยุดกลางคัน (Timeout)!\n\n' : '✅ Migration เสร็จสิ้น!\n\n') +
      uuidLabel +
      '• PersonAlias → M_ALIAS: ' + migrateCount + ' รายการ\n' +
      '• SCG Raw → M_ALIAS: ' + scgCount + ' รายการ\n' +
      '• FACT → M_ALIAS: ' + factCount + ' รายการ\n' +
      '• รวมทั้งหมด: ' + totalMigrated + ' รายการ\n' +
      '• ใช้เวลา: ' + elapsedSec + ' วินาที' +
      (timedOut ? '\n\n💡 รัน Migration อีกครั้งเพื่อดำเนินการต่อ' : '')
    );

  } catch (err) {
    logError('AliasService', 'MIGRATION_HybridAliasSystem: ' + err.message, err);
    // [FIX B2 v5.5.002] เปลี่ยน ui.alert() เป็น safeUiAlert_() — trigger-safe (Rule 4)
    safeUiAlert_('❌ Migration ล้มเหลว: ' + err.message);
  } finally {
    // [FIX v5.5.008 P2 #11] flush log buffer ก่อน exit — ป้องกัน log entries <50 หาย
    if (typeof flushLogBuffer_ === 'function') flushLogBuffer_();
  }
}

// ============================================================
// SECTION 9a: Migration Step Helpers [REF-005]
// Each step encapsulates its own logic + checkpoint management
// ============================================================

/**
 * migrateStep1_AssignUuid_ — [REF-005] Step 1: Assign UUID to persons/places
 * @param {Spreadsheet} ss - Active spreadsheet
 * @param {Object} state - Checkpoint state { step, rowIndex }
 * @return {number} Number of UUIDs assigned (0 if skipped)
 */
function migrateStep1_AssignUuid_(ss, state) {
  var uuidFixed = 0;
  if (state.step <= 1) {
    logInfo('AliasService', 'Step 1: ตรวจสอบ master_uuid...');
    uuidFixed = assignMasterUuidIfMissing();
    logInfo('AliasService', 'เพิ่ม master_uuid ให้ ' + uuidFixed + ' entities');
    // [FIX v5.5.007 P0 #4] ใช้ invalidateChunkedCache_ แทน raw removeAll
    // เดิมใช้ removeAll แค่ base keys ทำให้ chunk keys (_CHUNKS, _0, _1, ...) ตกค้าง
    // และ loadAliasCacheChunked_ จะอ่านข้อมูลเก่าจาก chunks ที่ตกค้าง → cache เก่าในขั้นตอนถัดไป
    if (typeof invalidateChunkedCache_ === 'function') {
      invalidateChunkedCache_(CACHE_KEY.PERSON_ALL, function() {
        if (typeof _PERSON_NOTE_INVERTED_INDEX !== 'undefined') _PERSON_NOTE_INVERTED_INDEX = null;
      });
      invalidateChunkedCache_(CACHE_KEY.PLACE_ALL, function() {
        if (typeof _GLOBAL_GEO_DICT_CACHE_PLACE !== 'undefined') _GLOBAL_GEO_DICT_CACHE_PLACE = null;
      });
      invalidateChunkedCache_(CACHE_KEY.GLOBAL_ALIAS_ALL);
      invalidateChunkedCache_(CACHE_KEY.GLOBAL_ALIAS_REVERSE);
    } else {
      // Fallback: ถ้า invalidateChunkedCache_ ไม่พร้อม (ไม่ควรเกิดใน V5.5.007+)
      CacheService.getScriptCache().removeAll(
        ['M_PERSON_ALL', 'M_PLACE_ALL', 'M_GLOBAL_ALIAS_ALL', 'M_GLOBAL_ALIAS_REVERSE']
      );
    }
    saveMigrationCheckpoint_(2, 0);
  } else {
    logInfo('AliasService', 'Step 1: ข้าม (เสร็จแล้วจาก Checkpoint)');
  }
  return uuidFixed;
}

/**
 * migrateStep2_PersonAlias_ — [REF-005] Step 2: Migrate Person Alias to Global
 * @param {Spreadsheet} ss - Active spreadsheet
 * @param {Object} state - Checkpoint state { step, rowIndex }
 * @param {Date} startTime - Start time for Time Guard
 * @param {number} timeLimit - Time limit in ms
 * @return {{ count: number, timedOut: boolean }}
 */
function migrateStep2_PersonAlias_(ss, state, startTime, timeLimit) {
  var count = 0;
  var timedOut = false;
  logInfo('AliasService', 'Step 2: ย้าย M_PERSON_ALIAS → M_ALIAS (Batch)...');
  count = migrateEntityAliasToGlobalBatch_(
    ss, 'PERSON', SHEET.M_PERSON_ALIAS, PERSON_ALIAS_IDX,
    state.step === 2 ? state.rowIndex : 0,
    startTime, timeLimit,
    function(uuid) { saveMigrationCheckpoint_(2, uuid); timedOut = true; }
  );
  if (!timedOut) saveMigrationCheckpoint_(3, 0);
  return { count: count, timedOut: timedOut };
}

/**
 * migrateStep3_PlaceAlias_ — [REF-005] Step 3: Migrate Place Alias to Global
 * @param {Spreadsheet} ss - Active spreadsheet
 * @param {Object} state - Checkpoint state { step, rowIndex }
 * @param {Date} startTime - Start time for Time Guard
 * @param {number} timeLimit - Time limit in ms
 * @return {{ count: number, timedOut: boolean }}
 */
function migrateStep3_PlaceAlias_(ss, state, startTime, timeLimit) {
  var count = 0;
  var timedOut = false;
  logInfo('AliasService', 'Step 3: ย้าย M_PLACE_ALIAS → M_ALIAS (Batch)...');
  count = migrateEntityAliasToGlobalBatch_(
    ss, 'PLACE', SHEET.M_PLACE_ALIAS, PLACE_ALIAS_IDX,
    state.step === 3 ? state.rowIndex : 0,
    startTime, timeLimit,
    function(uuid) { saveMigrationCheckpoint_(3, uuid); timedOut = true; }
  );
  if (!timedOut) saveMigrationCheckpoint_(4, 0);
  return { count: count, timedOut: timedOut };
}

/**
 * migrateStep4_SCGData_ — [REF-005] Step 4: Populate from SCG Raw Data
 * @param {Spreadsheet} ss - Active spreadsheet
 * @param {Object} state - Checkpoint state { step, rowIndex }
 * @param {Date} startTime - Start time for Time Guard
 * @param {number} timeLimit - Time limit in ms
 * @return {{ count: number, timedOut: boolean }}
 */
function migrateStep4_SCGData_(ss, state, startTime, timeLimit) {
  var count = 0;
  var timedOut = false;
  if ((new Date() - startTime) > timeLimit) {
    saveMigrationCheckpoint_(4, 0);
    timedOut = true;
  } else {
    logInfo('AliasService', 'Step 4: ดึงชื่อจากชีต SCG ดิบ → M_ALIAS...');
    count = populateAliasFromSCGRawData_();
    // [FIX CRIT-012] Only advance checkpoint if we got results OR source is empty
    const sourceSheetForCheck = ss.getSheetByName(SHEET.SOURCE);
    if (count > 0 || !sourceSheetForCheck || sourceSheetForCheck.getLastRow() < 2) {
      saveMigrationCheckpoint_(5, 0);
    } else {
      logWarn('AliasService', 'Step 4: ไม่ได้สร้าง alias ใหม่ — อาจเป็น partial failure, checkpoint ยังอยู่ที่ Step 4');
      saveMigrationCheckpoint_(4, 0);
    }
  }
  return { count: count, timedOut: timedOut };
}

/**
 * migrateStep5_FactData_ — [REF-005] Step 5: Populate from FACT Delivery
 * @param {Spreadsheet} ss - Active spreadsheet
 * @param {Object} state - Checkpoint state { step, rowIndex }
 * @param {Date} startTime - Start time for Time Guard
 * @param {number} timeLimit - Time limit in ms
 * @return {{ count: number, timedOut: boolean }}
 */
function migrateStep5_FactData_(ss, state, startTime, timeLimit) {
  var count = 0;
  var timedOut = false;
  if ((new Date() - startTime) > timeLimit) {
    saveMigrationCheckpoint_(5, 0);
    timedOut = true;
  } else {
    logInfo('AliasService', 'Step 5: ดึงชื่อจาก FACT_DELIVERY → M_ALIAS...');
    count = populateAliasFromFactDelivery_();
  }
  return { count: count, timedOut: timedOut };
}

// ============================================================
// SECTION 9a: migrateEntityAliasToGlobalBatch_ — [FIX B1 v5.5.002]
// Batch pattern สำหรับ Migration Step 2 & 3
// แทนการเรียก createGlobalAlias() ต่อแถว (O(N²))
// ============================================================

/**
 * migrateEntityAliasToGlobalBatch_ — ย้าย Entity Alias → M_ALIAS แบบ Batch
 * อ่านข้อมูล alias ทั้งหมด → แปลง UUID → dedup → batch setValues
 * @param {Spreadsheet} ss - Active spreadsheet
 * @param {string} entityType - 'PERSON' หรือ 'PLACE'
 * @param {string} aliasSheetName - Sheet name (e.g. SHEET.M_PERSON_ALIAS)
 * @param {Object} aliasIdx - Index constants (PERSON_ALIAS_IDX or PLACE_ALIAS_IDX)
 * @param {number} startIdx - Resume index (from checkpoint)
 * @param {Date} startTime - Start time for Time Guard
 * @param {number} timeLimit - Time limit in ms
 * @param {Function} onTimeout - Callback when timeout (receives current index)
 * @return {number} จำนวน alias ที่สร้างใหม่
 */
function migrateEntityAliasToGlobalBatch_(ss, entityType, aliasSheetName, aliasIdx, startIdx, startTime, timeLimit, onTimeout) {
  var aliasSheet = ss.getSheetByName(aliasSheetName);
  if (!aliasSheet || aliasSheet.getLastRow() < 2) return 0;

  var aliasData = aliasSheet.getRange(
    2, 1, aliasSheet.getLastRow() - 1, SCHEMA[aliasSheetName].length
  ).getValues();

  // โหลด dedup set ครั้งเดียว [REF-012] ใช้ centralized buildGlobalAliasDedupSet_()
  var existingAliasSet = buildGlobalAliasDedupSet_();
  var mAliasSheet = ss.getSheetByName(SHEET.M_ALIAS);

  // UUID converter
  var uuidConverter = entityType === 'PERSON' ? convertPersonIdToUuid : convertPlaceIdToUuid;

  // Build new rows
  var newRows = [];
  var now = new Date();
  var count = 0;

  for (var i = startIdx; i < aliasData.length; i++) {
    // Time Guard ทุก 50 แถว
    if (i % 50 === 0 && i > startIdx && (new Date() - startTime) > timeLimit) {
      if (typeof onTimeout === 'function') onTimeout(i);
      break;
    }

    var aliasRow = aliasData[i];
    var entityId   = String(aliasRow[aliasIdx[entityType === 'PERSON' ? 'PERSON_ID' : 'PLACE_ID']] || '').trim();
    var aliasName  = String(aliasRow[aliasIdx.ALIAS_NAME] || '').trim();
    var matchScore = Number(aliasRow[aliasIdx.MATCH_SCORE] || 100);
    if (!entityId || !aliasName || !aliasRow[aliasIdx.ACTIVE_FLAG]) continue;

    var masterUuid = uuidConverter(entityId);
    if (!masterUuid) continue;

    var normKey = normalizeForCompare(aliasName);
    var dedupKey = entityType + '::' + masterUuid + '::' + normKey;
    if (existingAliasSet.has(dedupKey)) continue;

    existingAliasSet.add(dedupKey);
    newRows.push([generateShortId('A'), masterUuid, aliasName, entityType, matchScore, 'V52_LEGACY_MIGRATION', now, true]);
    count++;
  }

  // Batch write ครั้งเดียว
  if (newRows.length > 0 && mAliasSheet) {
    mAliasSheet.getRange(
      mAliasSheet.getLastRow() + 1, 1, newRows.length, SCHEMA[SHEET.M_ALIAS].length
    ).setValues(newRows);
    // [FIX CRIT-002] Use CACHE_KEY constants instead of hardcoded strings — Single Source of Truth
    CacheService.getScriptCache().removeAll([CACHE_KEY.GLOBAL_ALIAS_ALL, CACHE_KEY.GLOBAL_ALIAS_REVERSE]);
  }

  logInfo('AliasService',
    'migrateEntityAliasToGlobalBatch_[' + entityType + ']: ' +
    'ตรวจ ' + aliasData.length + ' แถว → สร้าง ' + count + ' alias ใหม่'
  );
  return count;
}

// ============================================================
// SECTION 9b: populateAliasFromSCGRawData_
// [FIX BUG-B1] v5.4.003: Batch pattern — ลบ createGlobalAlias() ออกจาก loop
//              O(N²) → O(N): load dedup set ครั้งเดียว + batch setValues
// [FIX BUG-B3] v5.4.003: เพิ่ม Time Guard ทุก 100 records
// ============================================================

/**
 * populateAliasFromSCGRawData_ — ดึงชื่อจากชีต SCG ดิบ → M_ALIAS (Batch)
 * ⚠️ ไม่เรียก createGlobalAlias() ใน loop — เขียน batch ตรงแทน
 * @return {number} จำนวน alias ใหม่
 */
function populateAliasFromSCGRawData_() {
  const ss          = SpreadsheetApp.getActiveSpreadsheet();
  const sourceSheet = ss.getSheetByName(SHEET.SOURCE);
  if (!sourceSheet || sourceSheet.getLastRow() < 2) {
    logWarn('AliasService', 'populateAliasFromSCGRawData_: ชีต SOURCE ว่าง');
    return 0;
  }

  // [FIX BUG-B3] Time Guard
  const startTime = new Date();
  const timeLimit = AI_CONFIG.TIME_LIMIT_MS || (5 * 60 * 1000);

  // [FIX S7 v5.5.002] ใช้ SRC_READ_COLS จาก 01_Config.gs แทน magic number 37
  const schemaLen = SRC_READ_COLS;
  const srcData   = sourceSheet.getRange(2, 1, sourceSheet.getLastRow() - 1, schemaLen).getValues();

  // ─── 1. รวบชื่อไม่ซ้ำจาก Source ───
  const nameCount = {};
  srcData.forEach(function(r) {
    const rawName = String(r[SRC_IDX.RAW_PERSON_NAME] || '').trim();
    if (!rawName || rawName.length < 2) return;
    const normKey = normalizeForCompare(rawName);
    if (!normKey || normKey.length < 2) return;
    if (!nameCount[normKey]) nameCount[normKey] = { rawName: rawName, count: 0 };
    nameCount[normKey].count++;
  });

  // ─── 2. โหลด Person/Place map (UUID lookup) ───
  const allPersons    = loadAllPersons_();
  const allPlaces     = loadAllPlaces_();
  const personNormMap = {};
  const placeNormMap  = {};
  allPersons.forEach(function(p) { if (p.normalized && p.masterUuid) personNormMap[p.normalized] = p.masterUuid; });
  allPlaces.forEach(function(p)  { if (p.normalized && p.masterUuid) placeNormMap[p.normalized]  = p.masterUuid; });

  // [PERF-002] Build prefix indexes ครั้งเดียวก่อนลูป — ลด substring fallback จาก O(N) → O(K)
  //   เดิม: 1,000 unique names × 1,000 persons = 1M substring comparisons
  //   ใหม่: 1,000 names × avg 8 candidates per prefix = 8,000 comparisons (ลด ~95%)
  var personPrefixMap = buildPrefixIndex_(personNormMap);
  var placePrefixMap  = buildPrefixIndex_(placeNormMap);

  // ─── 3. [FIX BUG-B1] [REF-012] โหลด dedup set ครั้งเดียว (แทน loadGlobalAliasesMap_ ใน loop) ───
  // [REF-012] Uses centralized buildGlobalAliasDedupSet_() from 14_Utils.gs
  const existingAliasSet = buildGlobalAliasDedupSet_();
  const mAliasSheet    = ss.getSheetByName(SHEET.M_ALIAS);

  // ─── 4. Build new rows (pure memory ops) ───
  const newRows   = [];
  const now       = new Date();
  let   processed = 0;

  for (const normKey in nameCount) {
    // [FIX BUG-B3] Time Guard ทุก 100 records
    if (processed % 100 === 0 && processed > 0 && (new Date() - startTime) > timeLimit) {
      logWarn('AliasService', 'populateAliasFromSCGRawData_: Time Guard หยุดที่ ' + processed);
      break;
    }
    processed++;

    const rawName = nameCount[normKey].rawName;

    // [REF-021] หา UUID: ลอง Person ก่อน → Place (delegated to lookup helpers)
    // [PERF-002] ส่ง prefix map เข้าไป → substring fallback เป็น O(K) แทน O(N)
    let matchedUuid = findMatchingPerson_(normKey, personNormMap, personPrefixMap);
    let matchedType = 'PERSON';
    if (!matchedUuid) {
      matchedUuid = findMatchingPlace_(normKey, placeNormMap, placePrefixMap);
      matchedType = 'PLACE';
    }

    if (!matchedUuid) continue;

    const dedupKey = matchedType + '::' + matchedUuid + '::' + normKey;
    if (existingAliasSet.has(dedupKey)) continue;
    existingAliasSet.add(dedupKey); // update in-memory กัน dup ในรอบเดียวกัน
    newRows.push([generateShortId('A'), matchedUuid, rawName, matchedType, 90, 'SCG_RAW_IMPORT', now, true]);
  }

  // ─── 5. [FIX BUG-B1] Batch write ครั้งเดียว ───
  if (newRows.length > 0 && mAliasSheet) {
    mAliasSheet.getRange(
      mAliasSheet.getLastRow() + 1, 1, newRows.length, SCHEMA[SHEET.M_ALIAS].length
    ).setValues(newRows);
    // [FIX CRIT-002] Use CACHE_KEY constants instead of hardcoded strings — Single Source of Truth
    CacheService.getScriptCache().removeAll([CACHE_KEY.GLOBAL_ALIAS_ALL, CACHE_KEY.GLOBAL_ALIAS_REVERSE]);
  }

  logInfo('AliasService',
    'populateAliasFromSCGRawData_: ตรวจ ' + Object.keys(nameCount).length +
    ' ชื่อ → สร้าง ' + newRows.length + ' alias ใหม่ (' + processed + ' processed)'
  );
  return newRows.length;
}

// ============================================================
// SECTION 10: populateAliasFromFactDelivery_
// [FIX BUG-B1] v5.4.003: Batch pattern เหมือน Section 9
// [FIX BUG-B3] v5.4.003: เพิ่ม Time Guard
// ============================================================

/**
 * populateAliasFromFactDelivery_ — ดึงชื่อจาก FACT → M_ALIAS (Batch)
 * @return {number} จำนวน alias ใหม่
 */
function populateAliasFromFactDelivery_() {
  const ss        = SpreadsheetApp.getActiveSpreadsheet();
  const factSheet = ss.getSheetByName(SHEET.FACT_DELIVERY);
  if (!factSheet || factSheet.getLastRow() < 2) return 0;

  // [FIX BUG-B3] Time Guard
  const startTime = new Date();
  const timeLimit = AI_CONFIG.TIME_LIMIT_MS || (5 * 60 * 1000);

  const factData = factSheet.getRange(
    2, 1, factSheet.getLastRow() - 1, SCHEMA[SHEET.FACT_DELIVERY].length
  ).getValues();

  // ─── 1. รวบชื่อไม่ซ้ำ + FK จาก FACT ───
  const nameMap = {};
  factData.forEach(function(r) {
    const rawName  = String(r[FACT_IDX.SHIP_TO_NAME] || '').trim();
    const personId = String(r[FACT_IDX.PERSON_ID]    || '').trim();
    const placeId  = String(r[FACT_IDX.PLACE_ID]     || '').trim();
    // [FIX CRIT-005] อ่าน DRIVER_VERIFIED ด้วย
    const dvName   = String(r[FACT_IDX.DRIVER_VERIFIED_NAME] || '').trim();
    const dvAddr   = String(r[FACT_IDX.DRIVER_VERIFIED_ADDR] || '').trim();

    if (!rawName || rawName.length < 2) return;
    const normKey = normalizeForCompare(rawName);
    if (!normKey || normKey.length < 2) return;
    if (!nameMap[normKey]) nameMap[normKey] = { rawName: rawName, personId: personId, placeId: placeId };

    // [FIX CRIT-005] เพิ่ม DRIVER_VERIFIED เข้า nameMap ด้วย
    if (dvName && dvName.length >= 2) {
      var dvNormKey = normalizeForCompare(dvName);
      if (dvNormKey && dvNormKey.length >= 2 && !nameMap[dvNormKey]) {
        nameMap[dvNormKey] = { rawName: dvName, personId: personId, placeId: placeId, source: 'DRIVER_VERIFIED_RECOVERY' };
      }
    }
  });

  // ─── 2. [REF-012] โหลด dedup set ครั้งเดียว — centralized buildGlobalAliasDedupSet_() ───
  const existingAliasSet = buildGlobalAliasDedupSet_();
  const mAliasSheet      = ss.getSheetByName(SHEET.M_ALIAS);

  // ─── 2b. [PERF-003] Build ID→UUID maps ครั้งเดียวก่อนลูป — O(1) lookup แทน convertPersonIdToUuid O(N) ───
  //   เดิม: 1,000 names × O(1,000 persons) find = 1M iterations (via convertPersonIdToUuid)
  //   ใหม่: 1,000 names × 1 map lookup = 1,000 iterations (ลด ~99%)
  var allPersons = loadAllPersons_();
  var allPlaces  = loadAllPlaces_();
  var personIdToUuidMap = {};
  var placeIdToUuidMap  = {};
  allPersons.forEach(function(p) {
    if (p.personId && p.masterUuid) personIdToUuidMap[p.personId] = p.masterUuid;
  });
  allPlaces.forEach(function(p) {
    if (p.placeId && p.masterUuid) placeIdToUuidMap[p.placeId] = p.masterUuid;
  });

  // ─── 3. Build new rows ───
  const newRows   = [];
  const now       = new Date();
  let   processed = 0;

  for (const normKey in nameMap) {
    // [FIX BUG-B3] Time Guard ทุก 100 records
    if (processed % 100 === 0 && processed > 0 && (new Date() - startTime) > timeLimit) {
      logWarn('AliasService', 'populateAliasFromFactDelivery_: Time Guard หยุดที่ ' + processed);
      break;
    }
    processed++;

    const info     = nameMap[normKey];
    let   matchedUuid = null;
    let   matchedType = 'PERSON';

    // [PERF-003] O(1) map lookup แทน convertPersonIdToUuid() O(N)
    //   personIdToUuidMap build ครั้งเดียวก่อนลูป — lookup เป็น O(1)
    if (info.personId && personIdToUuidMap[info.personId]) {
      matchedUuid = personIdToUuidMap[info.personId];
      matchedType = 'PERSON';
    }
    if (!matchedUuid && info.placeId && placeIdToUuidMap[info.placeId]) {
      matchedUuid = placeIdToUuidMap[info.placeId];
      matchedType = 'PLACE';
    }
    if (!matchedUuid) continue;

    const dedupKey = matchedType + '::' + matchedUuid + '::' + normKey;
    if (existingAliasSet.has(dedupKey)) continue;
    existingAliasSet.add(dedupKey);
    newRows.push([generateShortId('A'), matchedUuid, info.rawName, matchedType, 95, 'FACT_DELIVERY_IMPORT', now, true]);
  }

  // ─── 4. Batch write ครั้งเดียว ───
  if (newRows.length > 0 && mAliasSheet) {
    mAliasSheet.getRange(
      mAliasSheet.getLastRow() + 1, 1, newRows.length, SCHEMA[SHEET.M_ALIAS].length
    ).setValues(newRows);
    // [FIX CRIT-002] Use CACHE_KEY constants instead of hardcoded strings — Single Source of Truth
    CacheService.getScriptCache().removeAll([CACHE_KEY.GLOBAL_ALIAS_ALL, CACHE_KEY.GLOBAL_ALIAS_REVERSE]);
  }

  logInfo('AliasService',
    'populateAliasFromFactDelivery_: ตรวจ ' + Object.keys(nameMap).length +
    ' ชื่อ → สร้าง ' + newRows.length + ' alias ใหม่'
  );
  return newRows.length;
}

// ============================================================
// SECTION 10b: Entity Lookup Helpers [REF-021]
// Extracted from populateAliasFromSCGRawData_ triple-nested loop
// ============================================================

/**
 * buildPrefixIndex_ — [PERF-002] Build prefix index for substring fallback
 *   Index: { first4chars: [{ fullNorm: string, uuid: string }] }
 *   ใช้สำหรับลด substring fallback ใน findMatchingPerson_/findMatchingPlace_ จาก O(N) → O(K)
 *   โดย K = entities ที่มี prefix 4 ตัวแรกตรงกัน (avg 5-10)
 * @param {Object} normMap — { normalized_name: masterUuid }
 * @return {Object} prefix index: { "abcd": [{ fullNorm, uuid }, ...] }
 * @private
 */
function buildPrefixIndex_(normMap) {
  var prefixMap = {};
  for (var normName in normMap) {
    if (normName.length < 4) continue;  // substring fallback เดิมใช้ length>=4
    var prefix = normName.substring(0, 4);
    if (!prefixMap[prefix]) prefixMap[prefix] = [];
    prefixMap[prefix].push({ fullNorm: normName, uuid: normMap[normName] });
  }
  return prefixMap;
}

/**
 * findMatchingPerson_ — [REF-021] Single-responsibility Person UUID lookup
 * Tries exact match first, then substring fallback
 * [PERF-002] เพิ่ม optPrefixMap parameter — ลด substring fallback จาก O(N) → O(K)
 *   ถ้าส่ง prefixMap → substring fallback ใช้ prefix index lookup O(K) แทน full scan O(N)
 *   ถ้าไม่ส่ง → ใช้ legacy full scan (backward compat)
 * @param {string} normName - Normalized name to search for
 * @param {Object} personNormMap - Map: normalized name → masterUuid
 * @param {Object} [optPrefixMap] - Optional prefix index from buildPrefixIndex_()
 * @return {string|null} masterUuid if found, null otherwise
 */
function findMatchingPerson_(normName, personNormMap, optPrefixMap) {
  // 1. Exact match (O(1))
  if (personNormMap[normName]) return personNormMap[normName];

  // 2. [PERF-002] Substring fallback — ใช้ prefix index ถ้ามี (O(K) แทน O(N))
  if (optPrefixMap && normName.length >= 4) {
    var prefix = normName.substring(0, 4);
    var candidates = optPrefixMap[prefix];
    if (!candidates || candidates.length === 0) return null;  // skip substring ทั้งหมด

    for (var ci = 0; ci < candidates.length; ci++) {
      var c = candidates[ci];
      if (c.fullNorm.length >= 4 &&
          (normName.includes(c.fullNorm) || c.fullNorm.includes(normName))) {
        return c.uuid;
      }
    }
    return null;  // candidates มีแต่ไม่ match → ไม่ fallback ไป full scan (preserve behavior เดิมในกรณี common)
  }

  // 3. Legacy fallback (กรณี caller ไม่ส่ง prefixMap — backward compat)
  for (const pNorm in personNormMap) {
    if (pNorm.length >= 4 && (normName.includes(pNorm) || pNorm.includes(normName))) {
      return personNormMap[pNorm];
    }
  }
  return null;
}

/**
 * findMatchingPlace_ — [REF-021] Single-responsibility Place UUID lookup
 * Tries exact match first, then substring fallback
 * [PERF-002] เพิ่ม optPrefixMap parameter — ลด substring fallback จาก O(N) → O(K)
 *   ถ้าส่ง prefixMap → substring fallback ใช้ prefix index lookup O(K) แทน full scan O(N)
 *   ถ้าไม่ส่ง → ใช้ legacy full scan (backward compat)
 * @param {string} normName - Normalized name to search for
 * @param {Object} placeNormMap - Map: normalized name → masterUuid
 * @param {Object} [optPrefixMap] - Optional prefix index from buildPrefixIndex_()
 * @return {string|null} masterUuid if found, null otherwise
 */
function findMatchingPlace_(normName, placeNormMap, optPrefixMap) {
  // 1. Exact match (O(1))
  if (placeNormMap[normName]) return placeNormMap[normName];

  // 2. [PERF-002] Substring fallback — ใช้ prefix index ถ้ามี (O(K) แทน O(N))
  if (optPrefixMap && normName.length >= 4) {
    var prefix = normName.substring(0, 4);
    var candidates = optPrefixMap[prefix];
    if (!candidates || candidates.length === 0) return null;

    for (var ci = 0; ci < candidates.length; ci++) {
      var c = candidates[ci];
      if (c.fullNorm.length >= 4 &&
          (normName.includes(c.fullNorm) || c.fullNorm.includes(normName))) {
        return c.uuid;
      }
    }
    return null;
  }

  // 3. Legacy fallback (กรณี caller ไม่ส่ง prefixMap — backward compat)
  for (const plNorm in placeNormMap) {
    if (plNorm.length >= 4 && (normName.includes(plNorm) || plNorm.includes(normName))) {
      return placeNormMap[plNorm];
    }
  }
  return null;
}

// ============================================================
// SECTION 11: UUID Generation — สร้าง UUID v4
// [FIX LAW-08 v5.4.003] เพิ่ม aliasGenerateUUID_() เป็นชื่อที่สื่อความหมาย
// generateUUID() เก็บไว้เป็น backward compat wrapper
// ============================================================

/**
 * aliasGenerateUUID_ — [NEW LAW-08 v5.4.003] สร้าง UUID v4 สำหรับ master_uuid
 * ใช้ prefix alias เพื่อให้ทราบว่าฟังก์ชันนี้มาจากโมดูลไหน
 * @return {string} UUID string
 */
function aliasGenerateUUID_() {
  return Utilities.getUuid();
}

/**
 * generateUUID — Backward-compatible wrapper
 * (เรียกจาก createPerson/createPlace ใน 06/07)
 * [FIX LAW-08 v5.4.003] เก็บไว้ชั่วคราวเพื่อ backward compat — ควรใช้ aliasGenerateUUID_() แทน
 */
function generateUUID() {
  return aliasGenerateUUID_();
}

// ============================================================
// SECTION 12: Migration Checkpoint Helpers
// [ADD v5.4.003] เพิ่ม Checkpoint สำหรับ Resume Migration
// ============================================================

/**
 * saveMigrationCheckpoint_ — บันทึกตำแหน่ง Migration ปัจจุบัน
 * [ADD v5.4.003] เพิ่ม Checkpoint สำหรับ Resume Migration
 */
function saveMigrationCheckpoint_(step, rowIndex) {
  PropertiesService.getScriptProperties().setProperty(
    MIGRATION_CHECKPOINT_KEY,
    JSON.stringify({ step: step, rowIndex: rowIndex })
  );
}

/**
 * loadMigrationCheckpoint_ — โหลดตำแหน่ง Migration ที่บันทึกไว้
 */
function loadMigrationCheckpoint_() {
  var raw = PropertiesService.getScriptProperties()
    .getProperty(MIGRATION_CHECKPOINT_KEY);
  if (raw) { try { return JSON.parse(raw); } catch(e) {} }
  return { step: 1, rowIndex: 0 };
}

/**
 * clearMigrationCheckpoint_ — ลบ Checkpoint หลัง Migration เสร็จ
 */
function clearMigrationCheckpoint_() {
  PropertiesService.getScriptProperties()
    .deleteProperty(MIGRATION_CHECKPOINT_KEY);
}
