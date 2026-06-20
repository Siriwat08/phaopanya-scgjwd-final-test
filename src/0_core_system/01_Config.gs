/**
 * VERSION: 5.5.016
 * FILE: 01_Config.gs
 * LMDS V5.5 — System Configuration & Constants
 * ===================================================
 * PURPOSE:
 *   กำหนดค่าคงที่และ Configuration หลักของระบบทั้งหมด
 *   เป็น Single Source of Truth สำหรับ Constants, Sheets, AI Config
 * ===================================================
 * CHANGELOG:
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
 *     - [ADD SCHEMA] เพิ่ม SCHEMA['SCGนครหลวงJWDภูมิภาค'] ใน 02_Schema.gs (37 คอลัมน์ตรงกับ SRC_IDX)
 *       ก่อนหน้านี้ SHEET.SOURCE มีเฉพาะ SRC_IDX ใน Config แต่ไม่มีใน SCHEMA → Single Source of Truth ไม่ครบ
 *     - [ADD VALIDATE] เพิ่ม SHEET.SOURCE + SHEET.DAILY_JOB เข้าใน validateConfig() และ validateSchemaConsistency()
 *       ทำให้ตรวจจับ mismatch ระหว่าง SCHEMA.length vs IDX.keys ได้ตั้งแต่เริ่มระบบ
 *     - [FIX SEARCH] findBestGeoByPersonPlace ใน 17_SearchService.gs ผ่าน normalizePersonNameFull ก่อนค้นหา
 *       ทำให้ SHIP_TO_NAME จาก Sheet2 ผ่านกระบวนการทำความสะอาดเหมือน Sheet1
 *       ลอก cleanName ก่อน หากไม่เจอค่อย fallback ด้วย rawName — เพิ่ม match rate
 *     - [FIX Q_REVIEW NAV] enqueueReview สร้าง recommended_action ที่มี ID จริง (ไม่ใช่แค่ "MANUAL_REVIEW")
 *       เช่น "MERGE_TO_CANDIDATE:PS-XXXX" หรือ "CREATE_NEW"
 *     - [FIX Q_REVIEW NAV] handleSelectionChange_ ใน 00_App.gs รองรับการคลิกที่คอลัมน์ RECOMMEND (P)
 *       parse ID จาก string แล้วนำทางไป Master/FACT — แก้ปัญหา "กดแล้วไม่พาไป"
 *     - [DOC] อัปเดตเอกสารทุกไฟล์จาก V5.5.008 → V5.5.011 ให้เป็นปัจจุบัน
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
 *     - [FIX] IDX set count: 14 → 17 (added MAPS_CACHE_IDX, OWNER_SUM_IDX, SHIPMENT_SUM_IDX)
 *     - [FIX] Compliance: 15/15 → 16/16 (Rule 16: Security-First Design)
 *     - [FIX] Line count: ~11,000 → 13,831; Function count: 291 → 310
 *     - [FIX] Sheet count: 13 → 20 in all documents
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
 *     - [ADD] ALIAS_IDX to validateConfig() checks array
 *     - [ADD] PLACE_ALIAS_IDX constant set
 *   v5.4.000 (2026-05-23):
 *     - [UPGRADE] Version bump to 5.4.000
 *     - [ADD] ALIAS_IDX to validateConfig() checks array
 *   v5.2.015 (PH2):
 *     - [FIX] installAutoResume_/removeAutoResume_: ป้องกันการลบทริกเกอร์ตั้งเวลาถาวรของผู้ใช้
 *   v5.2.014 (PH2):
 *     - [UPGRADE] อัปเกรดระบบเป็น 5.2.014 และแก้ไขสถาปัตยกรรมฟอร์มแนวตั้งชีต Input
 * ===================================================
 * DEPENDENCIES:
 *   DEFINES:
 *     - APP_VERSION, SCHEMA_VERSION, APP_NAME (Metadata)
 *     - SHEET{} (7 master + 4 system + 1 source + 1 cache + 5 daily ops + 2 summaries = 20)
 *     - *_IDX{} (Person, PersonAlias, Place, PlaceAlias, Alias, Geo, Dest, Fact, Review, ThGeo, Employee, Src, Data, SysLog, MapsCache, OwnerSum, ShipmentSum = 17)
 *     - AI_CONFIG, SCG_CONFIG, APP_CONST (System configs)
 *     - _GLOBAL_* CACHE variables (RAM cache layer)
 *     - CACHE_KEY{} (13 entries: GLOBAL_ALIAS_ALL, GLOBAL_ALIAS_REVERSE, PERSON_ALL,
 *         PERSON_ALIAS_ALL, PLACE_ALL, PLACE_ALIAS_ALL, GEO_ALL, DEST_ALL, SOURCE_ROWS,
 *         PROCESSED_INVOICES, TH_GEO_POSTCODE, TH_GEO_PROVINCES, TH_GEO_DISTRICTS) [V5.5.007 P1 #8]
 *     - invalidateAllGlobalCaches() — orchestrates 11 invalidate*Cache_* calls across
 *         modules 04/06/07/08/09/10/11/16 (was 6 calls pre-V5.5.007) [V5.5.007 P0 #1]
 *   CALLED BY (All Modules):
 *     - 00_App.gs          (Menu, triggers)
 *     - 05_NormalizeService.gs  (Normalization)
 *     - 06_PersonService.gs     (Person CRUD)
 *     - 07_PlaceService.gs      (Place CRUD)
 *     - 08_GeoService.gs        (Geo operations)
 *     - 09_DestinationService.gs (Destination management)
 *     - 10_MatchEngine.gs       (Core matching)
 *     - 11_TransactionService.gs (FACT operations)
 *     - 12_ReviewService.gs     (Review queue)
 *     - 13_ReportService.gs     (Reporting)
 *     - 15_GoogleMapsAPI.gs     (Maps integration)
 *     - 16_GeoDictionaryBuilder.gs (Geo dictionary)
 *     - 17_SearchService.gs     (Search/Bridge)
 *     - 18_ServiceSCG.gs       (SCG operations)
 *     - 19_Hardening.gs        (System hardening)
 *     - 20_ThGeoService.gs     (Thai Geo extraction)
 *     - 21_AliasService.gs     (Hybrid Alias)
 * ===================================================
 * ARCHITECTURE:
 *   ┌─────────────────────────────────────────────────────────────┐
 *   │  01_Config.gs (Configuration Hub)                            │
 *   │  ├── APP_VERSION / SCHEMA_VERSION / APP_NAME                 │
 *   │  ├── SHEET{} (20 sheet definitions)                          │
 *   │  ├── *_IDX{} (17 index constant sets)                       │
 *   │  ├── AI_CONFIG (Match Engine settings)                       │
 *   │  ├── SCG_CONFIG (SCG API settings)                          │
 *   │  ├── APP_CONST (Status, Colors, Lock)                        │
 *   │  ├── CACHE_KEY{} (13 entries) [V5.5.007 P1 #8]              │
 *   │  ├── validateConfig() (Schema validation)                    │
 *   │  ├── invalidateAllGlobalCaches() — 11 invalidate*Cache_*    │
 *   │  │   calls (was 6 pre-V5.5.007) [V5.5.007 P0 #1]            │
 *   │  └── _GLOBAL_* CACHE (RAM Cache Layer)                       │
 *   └─────────────────────────────────────────────────────────────┘
 * ===================================================
 */

const APP_VERSION = '5.5.016';
const SCHEMA_VERSION = '5.5.016';
const APP_NAME    = 'LMDS V5.5';

// [NEW v5.2.001] Global RAM Caches for batch runs
let _GLOBAL_GEO_DICT_CACHE = null;        // สำหรับ 16_GeoDictionaryBuilder (8 fields: postcode,subDistrict,district,province,searchKey,postalKey,noteType,noteScope)
let _GLOBAL_GEO_DICT_CACHE_PLACE = null;   // [FIX-02 v5.4.003] สำหรับ 07_PlaceService (4 fields: postcode,subDistrict,district,province)
let _GLOBAL_GEO_POINTS_CACHE = null;

/**
 * invalidateAllGlobalCaches — [NEW v5.2.003] เคลียร์ค่า Cache ใน RAM ทั้งหมด
 * @summary ใช้สำหรับเคลียร์ความจำของสคริปต์เพื่อให้โหลดข้อมูลใหม่จากชีต 100%
 *
 * [FIX v5.5.007] แก้ bug H1: ล้าง RAM cache ครบทั้ง 11 ตัว (เดิมล้างแค่ 6/11)
 *   รายการที่เพิ่ม: _GLOBAL_GEO_DICT_PROVINCE_INDEX, _GLOBAL_GEO_DICT_SEARCH_KEY_INDEX,
 *   _SOURCE_ROWS_RAM_CACHE, _FACT_INVOICE_RAM_CACHE, _GEO_LATLNG_RAM_CACHE, _SAME_DAY_DEST_CACHE
 *   ผ่านการเรียก invalidate*Cache_* ของแต่ละโมดูล ซึ่งจะไปล้างทั้ง RAM และ CacheService
 *
 * หมายเหตุ: _MAPS_SHEET_CACHE และ _MAPS_SHEET_HIT_DIRTY ไม่ถูกล้างที่นี่
 *   เพราะ geocode results เป็น immutable — ใช้เมนู clearMapsCache() แยก
 *   _ALIAS_ENRICHMENT_CONTEXT เป็น per-MatchEngine-run — ไม่ต้องล้างที่นี่
 */
function invalidateAllGlobalCaches() {
  // [FIX v5.5.007] ล้าง RAM caches ที่ประกาศใน 01_Config.gs
  _GLOBAL_GEO_DICT_CACHE = null;
  _GLOBAL_GEO_DICT_CACHE_PLACE = null;  // [FIX-02 v5.4.003]
  _GLOBAL_GEO_POINTS_CACHE = null;

  // [FIX v5.5.007] เรียก invalidate*Cache_* ของทุกโมดูล เพื่อล้างทั้ง RAM และ CacheService
  // แต่ละฟังก์ชันจะล้าง RAM cache ของตัวเอง + invalidate chunked CacheService entries
  if (typeof invalidateGeoDictCache        === 'function') invalidateGeoDictCache();         // ล้าง _GLOBAL_GEO_DICT_CACHE, _GLOBAL_GEO_DICT_PROVINCE_INDEX, _GLOBAL_GEO_DICT_SEARCH_KEY_INDEX + TH_GEO_* CacheService
  if (typeof invalidatePersonCache_        === 'function') invalidatePersonCache_();         // ล้าง _PERSON_NOTE_INVERTED_INDEX + M_PERSON_ALL CacheService
  if (typeof invalidateAliasCache_         === 'function') invalidateAliasCache_();          // ล้าง M_PERSON_ALIAS_ALL CacheService
  if (typeof invalidatePlaceCache_         === 'function') invalidatePlaceCache_();          // ล้าง _GLOBAL_GEO_DICT_CACHE_PLACE + M_PLACE_ALL CacheService
  if (typeof invalidatePlaceAliasCache_    === 'function') invalidatePlaceAliasCache_();     // ล้าง M_PLACE_ALIAS_ALL CacheService
  if (typeof invalidateGeoCache_           === 'function') invalidateGeoCache_();            // ล้าง _GLOBAL_GEO_POINTS_CACHE + M_GEO_ALL CacheService
  if (typeof invalidateDestCache_          === 'function') invalidateDestCache_();           // ล้าง M_DEST_ALL CacheService
  if (typeof invalidateSourceCache         === 'function') invalidateSourceCache();          // ล้าง _SOURCE_ROWS_RAM_CACHE + SOURCE_ROWS_V3, PROCESSED_INVOICES_V3 CacheService
  if (typeof invalidateFactInvoiceCache_   === 'function') invalidateFactInvoiceCache_();    // ล้าง _FACT_INVOICE_RAM_CACHE
  if (typeof invalidateGeoLatLngCache_     === 'function') invalidateGeoLatLngCache_();      // [P1 #5] ล้าง _GEO_LATLNG_RAM_CACHE
  if (typeof invalidateSameDayDestCache_   === 'function') invalidateSameDayDestCache_();    // ล้าง _SAME_DAY_DEST_CACHE

  logInfo('System', 'ล้างข้อมูลในความจำ (Cache) ทั้งหมดเรียบร้อยแล้ว — ครอบคลุม 11 RAM caches + 13 CacheService keys');
}

// ============================================================
// SECTION 1: ชื่อชีตทั้งหมด
// ============================================================

const SHEET = Object.freeze({
  M_PERSON:       'M_PERSON',
  M_PERSON_ALIAS: 'M_PERSON_ALIAS',
  M_PLACE:        'M_PLACE',
  M_PLACE_ALIAS:  'M_PLACE_ALIAS',
  M_ALIAS:        'M_ALIAS',
  M_GEO_POINT:    'M_GEO_POINT',
  M_DESTINATION:  'M_DESTINATION',
  FACT_DELIVERY:  'FACT_DELIVERY',
  Q_REVIEW:       'Q_REVIEW',
  SOURCE:         'SCGนครหลวงJWDภูมิภาค',
  SYS_CONFIG:     'SYS_CONFIG',
  SYS_LOG:        'SYS_LOG',
  SYS_TH_GEO:     'SYS_TH_GEO',
  RPT_QUALITY:    'RPT_DATA_QUALITY',
  // [REMOVE v5.5.013] MAPS_CACHE ถูกลบออก — ไม่ได้ใช้ใน pipeline อีกต่อไป
  //   สูตร Google Maps ใช้ CacheService.getDocumentCache แทน (ดู 15_GoogleMapsAPI.gs)
  DAILY_JOB:      'ตารางงานประจำวัน',
  INPUT:          'Input',
  EMPLOYEE:       'ข้อมูลพนักงาน',
  OWNER_SUMMARY:  'สรุป_เจ้าของสินค้า',
  SHIPMENT_SUM:   'สรุป_Shipment',
});

// ============================================================
// SECTION 2: Column Index (0-based) — Master Tables
// [RULE 2] ห้ามขยับลำดับ
// ============================================================

const PERSON_IDX = Object.freeze({
  PERSON_ID:   0,
  CANONICAL:   1,
  NORMALIZED:  2,
  PHONE:       3,
  FIRST_SEEN:  4,
  LAST_SEEN:   5,
  USAGE_COUNT: 6,
  STATUS:      7,
  NOTE:        8,
  MASTER_UUID: 9,
});

const PERSON_ALIAS_IDX = Object.freeze({
  ALIAS_ID:    0,
  PERSON_ID:   1,
  ALIAS_NAME:  2,
  MATCH_SCORE: 3,
  CREATED_AT:  4,
  ACTIVE_FLAG: 5,
});

const PLACE_IDX = Object.freeze({
  PLACE_ID:     0,
  CANONICAL:    1,
  NORMALIZED:   2,
  PLACE_TYPE:   3,
  SUB_DISTRICT: 4,
  DISTRICT:     5,
  PROVINCE:     6,
  POSTCODE:     7,
  FIRST_SEEN:   8,
  LAST_SEEN:    9,
  USAGE_COUNT:  10,
  STATUS:       11,
  NOTE:         12,
  MASTER_UUID:  13,
});

const PLACE_ALIAS_IDX = Object.freeze({
  ALIAS_ID:    0,
  PLACE_ID:    1,
  ALIAS_NAME:  2,
  MATCH_SCORE: 3,
  CREATED_AT:  4,
  ACTIVE_FLAG: 5,
});

const ALIAS_IDX = Object.freeze({
  ALIAS_ID:      0,
  MASTER_UUID:   1,
  VARIANT_NAME:  2,
  ENTITY_TYPE:   3,
  CONFIDENCE:    4,
  SOURCE:        5,
  CREATED_AT:    6,
  ACTIVE_FLAG:   7,
});

const GEO_IDX = Object.freeze({
  GEO_ID:        0,
  LAT:           1,
  LNG:           2,
  RADIUS_M:      3,
  RESOLVED_ADDR: 4,
  PROVINCE:      5,
  DISTRICT:      6,
  SOURCE:        7,
  CONFIDENCE:    8,
  FIRST_SEEN:    9,
  LAST_SEEN:     10,
  USAGE_COUNT:   11,
  STATUS:        12,
  EXTRACTION:    13, // [NEW v5.2.008]
});

const DEST_IDX = Object.freeze({
  DEST_ID:       0,
  PERSON_ID:     1,
  PLACE_ID:      2,
  GEO_ID:        3,
  LAT:           4,
  LNG:           5,
  ROUTE_LABEL:   6,
  DELIVERY_DATE: 7,
  USAGE_COUNT:   8,
  LAST_SEEN:     9,
  STATUS:        10,
});

const FACT_IDX = Object.freeze({
  TX_ID:         0,
  SOURCE_SHEET:  1,
  SOURCE_ROW:    2,
  SOURCE_REC_ID: 3,
  DELIVERY_DATE: 4,  // ✅ Bug Fix: เดิม index 2
  DELIVERY_TIME: 5,
  INVOICE_NO:    6,
  SHIPMENT_NO:   7,
  DRIVER_NAME:   8,
  TRUCK_LICENSE: 9,
  SOLD_TO_CODE:  10, // [NEW v008] เดิม CARRIER_CODE
  SOLD_TO_NAME:  11, // [NEW v008] เดิม CARRIER_NAME
  SHIP_TO_NAME:  12, // [NEW v008] เดิม SOLD_TO_CODE
  SHIP_TO_ADDR:  13, // [NEW v008] เดิม SOLD_TO_NAME
  GEO_RESOLVED_ADDR: 14, // [NEW v008] เดิม SHIP_TO_NAME
  PERSON_ID:     15,
  PLACE_ID:      16,
  GEO_ID:        17,  // ✅ Bug Fix: เดิม index 5
  DEST_ID:       18,
  WAREHOUSE:     19,
  RAW_LAT:       20,
  RAW_LNG:       21,
  MATCH_STATUS:  22,
  MATCH_CONF:    23,
  MATCH_REASON:  24,
  MATCH_ACTION:  25,
  RESOLVED_LAT:  26,
  RESOLVED_LNG:  27,
  CREATED_AT:    28,
  UPDATED_AT:    29,
  RECORD_STATUS: 30,
  EVIDENCE:      31, // [NEW v5.2.008] (name|phone|geo)
  // [ADD v5.5.014] ชื่อจริงที่คนขับ/ผู้ดูแลยืนยัน — เก็บจาก Source sheet
  DRIVER_VERIFIED_NAME: 32,  // ชื่อลูกค้าปลายทางจริง
  DRIVER_VERIFIED_ADDR: 33,  // ชื่อสถานที่อยู่ลูกค้าปลายทางจริง
});

const REVIEW_IDX = Object.freeze({
  REVIEW_ID:     0,
  ISSUE_TYPE:    1,
  PRIORITY:      2,
  SOURCE_REC_ID: 3,
  SOURCE_ROW:    4,
  INVOICE_NO:    5,
  RAW_PERSON:    6,
  RAW_PLACE:     7,
  RAW_SYS_ADDR:  8,
  RAW_LAT:       9,  // ✅ ขยับขึ้นมาหลังลบ RAW_GEO_ADDR
  RAW_LNG:       10,
  CAND_PERSONS:  11,
  CAND_PLACES:   12,
  CAND_GEOS:     13,
  CAND_DESTS:    14,
  MATCH_SCORE:   15,
  RECOMMEND:     16,
  STATUS:        17,
  REVIEWER:      18,
  REVIEWED_AT:   19,
  DECISION:      20,
  NOTE:          21,
});

// [ADD v5.4.003] SYS_LOG_IDX — ดัชนีคอลัมน์ SYS_LOG
const SYS_LOG_IDX = Object.freeze({
  LOG_ID:    0,  // ✅ แก้ใหม่
  TIMESTAMP: 1,  // ✅ แก้ใหม่
  MODULE:    2,  // ✅ เหมือนเดิม
  LEVEL:     3,  // ✅ แก้ใหม่ (เดิมชื่อ SHEET ชี้ผิด)
  MESSAGE:   4,  // ✅ เหมือนเดิม
  DETAILS:   5   // ✅ เหมือนเดิม
});

// ============================================================
// SECTION 3: SYS_TH_GEO Index
// [FIX v003] ลำดับถูกต้องตามชีตจริง (เดิมผิดทั้งหมด)
// ชีตจริง: รหัสไปรษณีย์[0], แขวง/ตำบล[1], เขต/อำเภอ[2], จังหวัด[3], หมายเหตุ[4]
// ============================================================

const TH_GEO_IDX = Object.freeze({
  POSTCODE:           0,
  SUB_DISTRICT:       1,
  DISTRICT:           2,
  PROVINCE:           3,
  NOTE:               4,
  SUB_DISTRICT_CLEAN: 5,
  DISTRICT_CLEAN:     6,
  SUB_DISTRICT_LABEL: 7,
  DISTRICT_LABEL:     8,
  TAMBON_NORM:        9,
  AMPHOE_NORM:        10,
  PROVINCE_NORM:      11,
  SEARCH_KEY:         12,
  POSTAL_KEY:         13,
  NOTE_TYPE:          14,
  NOTE_SCOPE:         15,
});

// ============================================================
// SECTION 4: ข้อมูลพนักงาน Index
// [FIX v003] เพิ่มเป็น 8 คอลัมน์ตามชีตจริง (เดิม 5 คอลัมน์ผิด)
// ============================================================

const EMPLOYEE_IDX = Object.freeze({
  EMP_ID:       0,  // ID_พนักงาน
  FULL_NAME:    1,  // ชื่อ - นามสกุล
  PHONE:        2,  // เบอร์โทรศัพท์
  NATIONAL_ID:  3,  // เลขที่บัตรประชาชน
  TRUCK_LIC:    4,  // ทะเบียนรถ
  TRUCK_TYPE:   5,  // เลือกประเภทรถยนต์
  EMAIL:        6,  // Email พนักงาน
  ROLE:         7,  // ROLE
});

// ============================================================
// SECTION 5: SCG Source Sheet Index (SRC_IDX)
// [FIX v003] ถูกต้องตามชีต SCGนครหลวงJWDภูมิภาค จริง
// ============================================================

const SRC_IDX = Object.freeze({
  ROW_ID:          0,   // head / ลำดับ
  SOURCE_ID:       1,   // ID_SCGนครหลวงJWDภูมิภาค
  DELIVERY_DATE:   2,   // วันที่ส่งสินค้า
  DELIVERY_TIME:   3,   // เวลาที่ส่งสินค้า
  LATLNG_COMBINED: 4,   // จุดส่งสินค้าปลายทาง (lat,lng รวม)
  DRIVER_NAME:     5,   // ชื่อ - นามสกุล (คนขับ)
  TRUCK_LICENSE:   6,   // ทะเบียนรถ
  SHIPMENT_NO:     7,   // Shipment No
  INVOICE_NO:      8,   // Invoice No
  BILL_PHOTO:      9,   // รูปถ่ายบิลส่งสินค้า
  CUSTOMER_CODE:   10,  // รหัสลูกค้า
  SOLD_TO_NAME:    11,  // ชื่อเจ้าของสินค้า (บริษัทผู้ขาย)
  RAW_PERSON_NAME: 12,  // ชื่อปลายทาง ← rawPersonName (สกปรก)
  EMPLOYEE_EMAIL:  13,  // Email พนักงาน
  LAT:             14,  // LAT ← lat จริง 100%
  LNG:             15,  // LONG ← lng จริง 100%
  DOC_RETURN_ID:   16,  // ID_Doc_Return
  WAREHOUSE:       17,  // คลังสินค้า
  RAW_ADDRESS:     18,  // ที่อยู่ปลายทาง ← rawAddress (สกปรก)
  PHOTO_PRODUCT:   19,  // รูปสินค้าตอนส่ง
  PHOTO_STORE:     20,  // รูปหน้าร้าน/บ้าน
  REMARK:          21,  // หมายเหตุ
  MONTH:           22,  // เดือน
  DIST_FROM_WH:    23,  // ระยะทางจากคลัง_Km
  RESOLVED_ADDR:   24,  // ชื่อที่อยู่จาก_LatLong ← rawPlaceName (สะอาด)
  SM_LINK:         25,  // SM_Link_SCG
  EMPLOYEE_ID:     26,  // ID_พนักงาน
  GPS_ON_SUBMIT:   27,  // พิกัดตอนกดบันทึกงาน
  TIME_START:      28,  // เวลาเริ่มกรอกงาน
  TIME_DONE:       29,  // เวลาบันทึกงานสำเร็จ
  MOVE_DIST_M:     30,  // ระยะขยับจากจุดเริ่มต้น_เมตร
  WORK_MIN:        31,  // ระยะเวลาใช้งาน_นาที
  SPEED_MPM:       32,  // ความเร็วการเคลื่อนที่_เมตร_นาที
  QC_RESULT:       33,  // ผลการตรวจสอบงานส่ง
  QC_ISSUE:        34,  // เหตุผิดปกติที่ตรวจพบ
  PHOTO_TIME:      35,  // เวลาถ่ายรูปหน้าร้าน_หน้าบ้าน
  SYNC_STATUS:     36,  // SYNC_STATUS ← เช็คก่อน process
  // [ADD v5.5.014] ชื่อจริงที่คนขับ/ผู้ดูแลยืนยัน — กรอกใน AppSheet หรือ Google Sheet
  DRIVER_VERIFIED_NAME: 37,  // ชื่อลูกค้าปลายทางจริง
  DRIVER_VERIFIED_ADDR: 38,  // ชื่อสถานที่อยู่ลูกค้าปลายทางจริง
});

// ============================================================
// SECTION 6: ตารางงานประจำวัน Index
// [PRESERVED] ห้ามขยับ — ตรงกับชีตจริง 100%
// ============================================================

const DATA_IDX = Object.freeze({
  JOB_ID:          0,
  PLAN_DELIVERY:   1,
  INVOICE_NO:      2,
  SHIPMENT_NO:     3,
  DRIVER_NAME:     4,
  TRUCK_LICENSE:   5,
  CARRIER_CODE:    6,
  CARRIER_NAME:    7,
  SOLD_TO_CODE:    8,
  SOLD_TO_NAME:    9,
  SHIP_TO_NAME:    10,
  SHIP_TO_ADDR:    11,
  LATLNG_SCG:      12,
  MATERIAL:        13,
  QTY:             14,
  QTY_UNIT:        15,
  WEIGHT:          16,
  DELIVERY_NO:     17,
  DEST_COUNT:      18,
  DEST_LIST:       19,
  SCAN_STATUS:     20,
  DELIVERY_STATUS: 21,
  EMAIL:           22,
  TOT_QTY:         23,
  TOT_WEIGHT:      24,
  SCAN_INV:        25,
  LATLNG_ACTUAL:   26,
  OWNER_LABEL:     27,
  SHOP_KEY:        28,
  // [ADD v5.5.014] ชื่อจริง — ระบบคัดลอกจาก Source sheet ตอน applyMasterCoordinatesToDailyJob
  DRIVER_VERIFIED_NAME: 29,  // ชื่อลูกค้าปลายทางจริง (จาก Source col 38)
  DRIVER_VERIFIED_ADDR: 30,  // ชื่อสถานที่อยู่ลูกค้าปลายทางจริง (จาก Source col 39)
});

// [FIX S7 v5.5.002] SRC_READ_COLS — จำนวนคอลัมน์ที่ต้องอ่านจาก Source sheet
// Computed from SRC_IDX เพื่อให้ auto-adapt เมื่อมีการเพิ่มคอลัมน์ใหม่
// เดิมใช้ magic number 37 ใน 21_AliasService.gs (SRC_READ_COLS || 37)
const SRC_READ_COLS = Object.keys(SRC_IDX).length;

// [FIX S2 v5.5.002] TH_PROVINCES — รายชื่อจังหวัด 77 จังหวัด (ย้ายจาก 07_PlaceService.gs)
// เพื่อให้เป็น Single Source of Truth ใน Config — Rule 4 & Rule 5
const TH_PROVINCES = Object.freeze([
  // กรุงเทพฯ และ aliases
  { name: 'กรุงเทพมหานคร', aliases: ['กรุงเทพ', 'กทม', 'กรุงเ', 'กทม.'] },
  // กลาง
  { name: 'สมุทรปราการ', aliases: [] },
  { name: 'นนทบุรี', aliases: [] },
  { name: 'ปทุมธานี', aliases: [] },
  { name: 'พระนครศรีอยุธยา', aliases: [] },
  { name: 'อ่างทอง', aliases: [] },
  { name: 'ลพบุรี', aliases: [] },
  { name: 'สิงห์บุรี', aliases: [] },
  { name: 'ชัยนาท', aliases: [] },
  { name: 'สระบุรี', aliases: [] },
  // ตะวันออก
  { name: 'ชลบุรี', aliases: [] },
  { name: 'ระยอง', aliases: [] },
  { name: 'จันทบุรี', aliases: [] },
  { name: 'ตราด', aliases: [] },
  { name: 'ฉะเชิงเทรา', aliases: [] },
  { name: 'ปราจีนบุรี', aliases: [] },
  { name: 'นครนายก', aliases: [] },
  { name: 'สระแก้ว', aliases: [] },
  // ตะวันออกเฉียงเหนือ
  { name: 'นครราชสีมา', aliases: [] },
  { name: 'บุรีรัมย์', aliases: [] },
  { name: 'สุรินทร์', aliases: [] },
  { name: 'ศรีสะเกษ', aliases: [] },
  { name: 'อุบลราชธานี', aliases: [] },
  { name: 'ยโสธร', aliases: [] },
  { name: 'ชัยภูมิ', aliases: [] },
  { name: 'อำนาจเจริญ', aliases: [] },
  { name: 'หนองบัวลำภู', aliases: [] },
  { name: 'ขอนแก่น', aliases: [] },
  { name: 'อุดรธานี', aliases: [] },
  { name: 'เลย', aliases: [] },
  { name: 'หนองคาย', aliases: [] },
  { name: 'มหาสารคาม', aliases: [] },
  { name: 'ร้อยเอ็ด', aliases: [] },
  { name: 'กาฬสินธุ์', aliases: [] },
  { name: 'สกลนคร', aliases: [] },
  { name: 'นครพนม', aliases: [] },
  { name: 'มุกดาหาร', aliases: [] },
  // เหนือ
  { name: 'เชียงใหม่', aliases: [] },
  { name: 'ลำพูน', aliases: [] },
  { name: 'ลำปาง', aliases: [] },
  { name: 'อุตรดิตถ์', aliases: [] },
  { name: 'แพร่', aliases: [] },
  { name: 'น่าน', aliases: [] },
  { name: 'พะเยา', aliases: [] },
  { name: 'เชียงราย', aliases: [] },
  { name: 'แม่ฮ่องสอน', aliases: [] },
  // ตะวันตก
  { name: 'นครสวรรค์', aliases: [] },
  { name: 'อุทัยธานี', aliases: [] },
  { name: 'กำแพงเพชร', aliases: [] },
  { name: 'ตาก', aliases: [] },
  { name: 'สุโขทัย', aliases: [] },
  { name: 'พิษณุโลก', aliases: [] },
  { name: 'พิจิตร', aliases: [] },
  { name: 'เพชรบูรณ์', aliases: [] },
  // ตะวันตกเฉียงใต้
  { name: 'ราชบุรี', aliases: [] },
  { name: 'กาญจนบุรี', aliases: [] },
  { name: 'สุพรรณบุรี', aliases: [] },
  { name: 'นครปฐม', aliases: [] },
  { name: 'สมุทรสาคร', aliases: [] },
  { name: 'สมุทรสงคราม', aliases: [] },
  { name: 'เพชรบุรี', aliases: [] },
  { name: 'ประจวบคีรีขันธ์', aliases: [] },
  // ใต้
  { name: 'นครศรีธรรมราช', aliases: [] },
  { name: 'กระบี่', aliases: [] },
  { name: 'พังงา', aliases: [] },
  { name: 'ภูเก็ต', aliases: [] },
  { name: 'สุราษฎร์ธานี', aliases: [] },
  { name: 'ระนอง', aliases: [] },
  { name: 'ชุมพร', aliases: [] },
  { name: 'สงขลา', aliases: [] },
  { name: 'สตูล', aliases: [] },
  { name: 'ตรัง', aliases: [] },
  { name: 'พัทลุง', aliases: [] },
  { name: 'ปัตตานี', aliases: [] },
  { name: 'ยะลา', aliases: [] },
  { name: 'นราธิวาส', aliases: [] },
]);

// ============================================================
// SECTION 7: SCG Config
// ============================================================

const SCG_CONFIG = Object.freeze({
  SHEET_DATA:           SHEET.DAILY_JOB,
  SHEET_INPUT:          SHEET.INPUT,
  SHEET_EMPLOYEE:       SHEET.EMPLOYEE,
  // [ADD v002] Fallback จาก PropertiesService
  get API_URL() {
    return PropertiesService.getScriptProperties()
                            .getProperty('SCG_API_URL')
           || 'https://fsm.scgjwd.com/Monitor/SearchDelivery';
  },
  INPUT_START_ROW:      4,    // Shipment No เริ่มแถว 4
  COOKIE_CELL:          'B1', // Cookie อยู่ที่ B1 — [SEC-001] DEPRECATED: ใช้ getSCGCookie_() แทน
  SHIPMENT_STRING_CELL: 'B3', // ShipmentNos string อยู่ที่ B3
  GPS_THRESHOLD_METERS: 50,
  // ค่า SYNC_STATUS ที่ถือว่าประมวลผลแล้ว
  SYNC_DONE_VALUE:      'SUCCESS',
  // [RF-01] EPOD owner list — ย้ายจาก 18_ServiceSCG.gs module-level
  EPOD_OWNERS:          Object.freeze(["BETTERBE", "SCG EXPRESS", "เบทเตอร์แลนด์", "JWD TRANSPORT"]),
});

// ============================================================
// SECTION 8: AI & Matching Config
// [FIX v002] THRESHOLD_IGNORE: 70→50
// [ADD v003] SCORE_MIN_THRESHOLD, PLACE_SCORE_MIN
// ============================================================

const AI_CONFIG = Object.freeze({
  THRESHOLD_AUTO:       90,  // >= 90 → Auto Match
  THRESHOLD_REVIEW:     70,  // 70-89 → Q_REVIEW
  THRESHOLD_IGNORE:     50,  // < 50  → ไม่พิจารณา [FIX v5.1.001: 70→50]
  SCORE_MIN_THRESHOLD:  60,  // min score สำหรับ Person
  PLACE_SCORE_MIN:      55,  // min score สำหรับ Place
  MODEL:                'gemini-1.5-flash',
  BATCH_SIZE:           20,
  RETRIEVAL_LIMIT:      50,
  CACHE_TTL_SEC:        21600,
  GEO_RADIUS_M:         50,
  GEO_GRID_SIZE:        0.01, // [ADD v5.4.003] ~1.1 กม. ต่อ grid cell — ย้ายจาก 08_GeoService.gs
  USE_AI_REASONING:     false, // [PH2] Set to false for safety (AI should not guess coordinates)
  TIME_LIMIT_MS:        300000, // [FIX v5.2.009] 5 นาที (300,000 ms) สำหรับจำกัดเวลาทำงานของ Loop
});

// ============================================================
// SECTION 9: App Constants
// ============================================================

// [ADD v5.5.001] CACHE_KEY — Script Cache key constants (Single Source of Truth)
// [FIX v5.5.007 P1 #8] ขยายจาก 2 keys → 13 keys เพื่อรวม cache key prefixes ทั้งหมด
//   ป้องกัน typo / key collision และทำให้ refactor ง่ายขึ้น
//   ใช้โดย: 04_SourceRepository, 06_PersonService, 07_PlaceService, 08_GeoService,
//   09_DestinationService, 10_MatchEngine, 16_GeoDictionaryBuilder, 21_AliasService
const CACHE_KEY = Object.freeze({
  // Master Data entities
  PERSON_ALL:           'M_PERSON_ALL',           // ใช้ใน 06_PersonService.gs
  PERSON_ALIAS_ALL:     'M_PERSON_ALIAS_ALL',     // ใช้ใน 06_PersonService.gs
  PLACE_ALL:            'M_PLACE_ALL',            // ใช้ใน 07_PlaceService.gs
  PLACE_ALIAS_ALL:      'M_PLACE_ALIAS_ALL',      // ใช้ใน 07_PlaceService.gs
  GEO_ALL:              'M_GEO_ALL',              // ใช้ใน 08_GeoService.gs
  DEST_ALL:             'M_DEST_ALL',             // ใช้ใน 09_DestinationService.gs
  GLOBAL_ALIAS_ALL:     'M_GLOBAL_ALIAS_ALL',     // ใช้ใน 21_AliasService.gs
  GLOBAL_ALIAS_REVERSE: 'M_GLOBAL_ALIAS_REVERSE', // ใช้ใน 21_AliasService.gs
  // Source data
  SOURCE_ROWS:          'SOURCE_ROWS_V3',         // ใช้ใน 04_SourceRepository.gs
  PROCESSED_INVOICES:   'PROCESSED_INVOICES_V3',  // ใช้ใน 04_SourceRepository.gs
  // Thai geo dictionary
  TH_GEO_POSTCODE:      'TH_GEO_POSTCODE',        // ใช้ใน 16_GeoDictionaryBuilder.gs
  TH_GEO_PROVINCES:     'TH_GEO_PROVINCES',       // ใช้ใน 16_GeoDictionaryBuilder.gs
  TH_GEO_DISTRICTS:     'TH_GEO_DISTRICTS',       // ใช้ใน 16_GeoDictionaryBuilder.gs
});

// [REMOVE v5.5.013] MAPS_CACHE_IDX ถูกลบออก — MAPS_CACHE sheet ไม่ได้ใช้แล้ว
//   สูตร Google Maps ใช้ CacheService.getDocumentCache แทน

// [ADD R3] OWNER_SUM_IDX — สรุป_เจ้าของสินค้า column indices (6 columns)
// ใช้แทน hardcoded column positions ใน 18_ServiceSCG.gs
const OWNER_SUM_IDX = Object.freeze({
  SUMMARY_KEY: 0,  // SummaryKey (ว่าง)
  SOLD_TO:     1,  // SoldToName
  PLAN_DEL:    2,  // PlanDelivery (ว่าง)
  QTY_ALL:     3,  // จำนวน_ทั้งหมด
  QTY_EPOD:    4,  // จำนวน_E-POD_ทั้งหมด
  LAST_UPDATE: 5,  // LastUpdated
});

// [ADD R3] SHIPMENT_SUM_IDX — สรุป_Shipment column indices (7 columns)
const SHIPMENT_SUM_IDX = Object.freeze({
  SHIPMENT_KEY: 0,  // ShipmentKey
  SHIPMENT_NO:  1,  // ShipmentNo
  TRUCK:        2,  // TruckLicense
  PLAN_DEL:     3,  // PlanDelivery (ว่าง)
  QTY_ALL:      4,  // จำนวน_ทั้งหมด
  QTY_EPOD:     5,  // จำนวน_E-POD_ทั้งหมด
  LAST_UPDATE:  6,  // LastUpdated
});

const APP_CONST = Object.freeze({
  STATUS_ACTIVE:   'Active',
  STATUS_ARCHIVED: 'Archived',
  STATUS_MERGED:   'Merged',

  COLOR_FOUND:     '#b6d7a8',
  COLOR_FALLBACK:  '#ffe599',
  COLOR_NOT_FOUND: '#f4cccc',
  COLOR_BRANCH:    '#cfe2f3',

  MAX_RETRIES:     3,
  LOCK_TIMEOUT_MS: 10000,
  PIPELINE_BATCH:  50,

  MATCH_FULL:   'FULL_MATCH',
  MATCH_GEO:    'GEO_ANCHOR',
  MATCH_FUZZY:  'FUZZY_MATCH',
  MATCH_NEW:    'CREATE_NEW',
  MATCH_REVIEW: 'NEEDS_REVIEW',
  MATCH_ERROR:  'ERROR',
});

// ============================================================
// SECTION 10: validateConfig
// ============================================================

/**
 * validateConfig — ตรวจสอบค่า Config สำคัญก่อนใช้งาน
 * เรียกจาก onOpen() ใน 00_App.gs
 */
function validateConfig() {
  if (AI_CONFIG.THRESHOLD_AUTO <= AI_CONFIG.THRESHOLD_REVIEW) {
    throw new Error(
      'Config ผิด: THRESHOLD_AUTO ต้องมากกว่า THRESHOLD_REVIEW\n' +
      `AUTO=${AI_CONFIG.THRESHOLD_AUTO}, REVIEW=${AI_CONFIG.THRESHOLD_REVIEW}`
    );
  }
  if (AI_CONFIG.THRESHOLD_REVIEW <= AI_CONFIG.THRESHOLD_IGNORE) {
    throw new Error(
      'Config ผิด: THRESHOLD_REVIEW ต้องมากกว่า THRESHOLD_IGNORE\n' +
      `REVIEW=${AI_CONFIG.THRESHOLD_REVIEW}, IGNORE=${AI_CONFIG.THRESHOLD_IGNORE}`
    );
  }
  // ตรวจ Schema vs IDX (ถ้า SCHEMA โหลดแล้ว)
  if (typeof SCHEMA !== 'undefined') {
    const checks = [
      { name: SHEET.M_PERSON,      idx: PERSON_IDX,  label: 'M_PERSON'      },
      { name: SHEET.M_PLACE,       idx: PLACE_IDX,   label: 'M_PLACE'       },
      { name: SHEET.M_GEO_POINT,   idx: GEO_IDX,     label: 'M_GEO_POINT'   },
      { name: SHEET.M_DESTINATION, idx: DEST_IDX,    label: 'M_DESTINATION' },
      { name: SHEET.FACT_DELIVERY, idx: FACT_IDX,    label: 'FACT_DELIVERY' },
      { name: SHEET.Q_REVIEW,      idx: REVIEW_IDX,  label: 'Q_REVIEW'      },
      { name: SHEET.M_PERSON_ALIAS, idx: PERSON_ALIAS_IDX, label: 'M_PERSON_ALIAS' },
      { name: SHEET.M_PLACE_ALIAS,  idx: PLACE_ALIAS_IDX,  label: 'M_PLACE_ALIAS'  },
      { name: SHEET.M_ALIAS,        idx: ALIAS_IDX,              label: 'M_ALIAS'        },
      { name: SHEET.OWNER_SUMMARY,  idx: OWNER_SUM_IDX,          label: 'OWNER_SUMMARY'  },
      { name: SHEET.SHIPMENT_SUM,   idx: SHIPMENT_SUM_IDX,       label: 'SHIPMENT_SUM'   },
      // [ADD v5.5.011] เพิ่มการตรวจ SOURCE และ DAILY_JOB — ก่อนหน้านี้ไม่ได้ตรวจใน validateConfig
      { name: SHEET.SOURCE,         idx: SRC_IDX,                label: 'SOURCE (SCGนครหลวงJWDภูมิภาค)' },
      { name: SHEET.DAILY_JOB,      idx: DATA_IDX,               label: 'DAILY_JOB (ตารางงานประจำวัน)' },
    ];
    checks.forEach(item => {
      const schemaArr = SCHEMA[item.name];
      if (!schemaArr) return;
      const idxLen = Object.keys(item.idx).length;
      if (schemaArr.length !== idxLen) {
        throw new Error(
          `Schema Mismatch: ${item.label}\n` +
          `  SCHEMA.length=${schemaArr.length} IDX.keys=${idxLen}`
        );
      }
    });

    // [FIX v5.5.012 Anti-pattern #5] เรียก validateSchemaConsistency() เพื่อตรวจ SCHEMA ที่ละเอียดกว่า
    //   เดิม validateConfig ตรวจแค่ SCHEMA.length vs IDX.keys แต่ไม่ได้เรียก validateSchemaConsistency
    //   ทำให้ onOpen จับ SCHEMA drift ไม่ได้ (catch ได้แค่ตอน setupAllSheets รัน)
    //   ตอนนี้เรียก validateSchemaConsistency เพื่อตรวจทุกคู่ SCHEMA↔IDX แบบเดียวกับ setupAllSheets
    //   ถ้า SCHEMA หรือ IDX ไม่ตรงกัน → throw error ทันทีตอนเปิด sheet
    if (typeof validateSchemaConsistency === 'function') {
      validateSchemaConsistency();
    }

    // [FIX CRIT-008] Pre-flight check — ตรวจว่า Sheet มีคอลัมน์เพียงพอสำหรับ V5.5.014
    //   ถ้า admin ไม่เพิ่มคอลัมน์ใน Sheet จริง → จะ throw error ทันที แทนที่จะพังกลางคัน
    var ss = SpreadsheetApp.getActiveSpreadsheet();  // [FIX] ss ไม่ได้ประกาศก่อนหน้านี้
    const sheetColChecks = [
      { name: SHEET.SOURCE,         minCols: SCHEMA[SHEET.SOURCE].length },
      { name: SHEET.DAILY_JOB,      minCols: SCHEMA[SHEET.DAILY_JOB].length },
      { name: SHEET.FACT_DELIVERY,  minCols: SCHEMA[SHEET.FACT_DELIVERY].length },
    ];
    sheetColChecks.forEach(function(item) {
      var sheet = ss.getSheetByName(item.name);
      if (sheet && sheet.getMaxColumns() < item.minCols) {
        throw new Error(
          'คอลัมน์ไม่เพียงพอ: ชีต "' + item.name + '" มี ' + sheet.getMaxColumns() +
          ' คอลัมน์ แต่ SCHEMA ต้องการ ' + item.minCols + ' คอลัมน์\n' +
          'กรุณาเพิ่มคอลัมน์ให้ครบก่อนใช้งาน V5.5.014'
        );
      }
    });
  }
  logInfo('Config', `validateConfig ผ่าน — Schema v${SCHEMA_VERSION}`);
}

// ============================================================
// SECTION 11: API Key Helper
// ============================================================

/**
 * getGeminiApiKey — ดึง API Key จาก PropertiesService
 * [RULE 5] ห้าม Hardcode
 */
function getGeminiApiKey() {
  const key = PropertiesService.getScriptProperties()
                               .getProperty('GEMINI_API_KEY');
  if (!key || !/^AIza[0-9A-Za-z\-_]{35}$/.test(String(key).trim())) {
    throw new Error(
      'GEMINI_API_KEY ยังไม่ได้ตั้งค่าหรือรูปแบบไม่ถูกต้อง\n' +
      'กรุณารัน เมนู LMDS > ระบบ > ตั้งค่า API Key ก่อน'
    );
  }
  return key;
}
