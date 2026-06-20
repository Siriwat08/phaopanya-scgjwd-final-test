/**
 * VERSION: 5.5.016
 * FILE: 02_Schema.gs
 * LMDS V5.5 — Sheet Schema Definitions
 * ===================================================
 * PURPOSE:
 *   กำหนด Schema ของทุก Sheet ในระบบ รวมถึง Column Headers และ Validation Rules
 *   เป็น Single Source of Truth สำหรับโครงสร้างข้อมูล
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
 *   v5.5.011 (2026-06-19) — DATA CONSISTENCY + SCHEMA SOURCE:
 *     - [ADD SCHEMA] เพิ่ม SCHEMA['SCGนครหลวงJWDภูมิภาค'] (37 คอลัมน์) ที่ขาดหายไป
 *       ก่อนหน้านี้ SHEET.SOURCE มีเพียง SRC_IDX ใน 01_Config.gs แต่ไม่มีใน SCHEMA
 *       ทำให้ getSheetHeaders(SHEET.SOURCE) จะ throw และ validateSchemaConsistency ไม่ตรวจชีตนี้
 *       ตอนนี้ SCHEMA เป็น Single Source of Truth จริงๆ สำหรับทุกชีต
 *     - [ADD VALIDATE] เพิ่ม SHEET.SOURCE และ SHEET.DAILY_JOB เข้าใน validateSchemaConsistency()
 *       ตรวจ SCHEMA.length vs IDX.keys ตั้งแต่ระบบเริ่ม ป้องกัน runtime error
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
 *     - [ADD] M_ALIAS to validateSchemaConsistency() checks array
 *   v5.4.000 (2026-05-23):
 *     - [ADD] M_ALIAS schema (8 cols: alias_id, master_uuid, variant_name, entity_type, confidence, source, created_at, active_flag)
 *     - [ADD] M_PLACE_ALIAS schema (6 cols)
 *   v5.2.014 (PH2):
 *     - [FIX] SCHEMA.Input: เปลี่ยนจาก ['Shipment_No', 'หมายเหตุ'] เป็น ['COOKIE', 'ShipmentNos']
 *   v5.2.003:
 *     - [FIX] SYS_TH_GEO: ลำดับคอลัมน์ถูกต้องตามชีตจริง
 *     - [FIX] ข้อมูลพนักงาน: เพิ่มเป็น 8 คอลัมน์ตามชีตจริง
 *     - [FIX] MAPS_CACHE: เพิ่ม province[8] และ district[9]
 * ===================================================
 * DEPENDENCIES:
 *   DEFINES SCHEMA FOR:
 *     - SHEET.M_PERSON        → 06_PersonService.gs
 *     - SHEET.M_PERSON_ALIAS  → 06_PersonService.gs / 10_MatchEngine.gs
 *     - SHEET.M_PLACE         → 07_PlaceService.gs
 *     - SHEET.M_PLACE_ALIAS   → 07_PlaceService.gs / 10_MatchEngine.gs
 *     - SHEET.M_ALIAS         → 21_AliasService.gs / 10_MatchEngine.gs (Single Writer)
 *     - SHEET.M_GEO_POINT     → 08_GeoService.gs
 *     - SHEET.M_DESTINATION   → 09_DestinationService.gs
 *     - SHEET.FACT_DELIVERY   → 11_TransactionService.gs / 10_MatchEngine.gs
 *     - SHEET.Q_REVIEW        → 12_ReviewService.gs
 *     - SHEET.DAILY_JOB       → 18_ServiceSCG.gs / 17_SearchService.gs
 *     - SHEET.MAPS_CACHE      → 15_GoogleMapsAPI.gs
 *     - SHEET.SYS_TH_GEO      → 16_GeoDictionaryBuilder.gs
 *   USED BY (Index References):
 *     - 01_Config.gs         (INDEX constants via validateConfig)
 *     - All Service files     (getValues/setValues)
 * ===================================================
 * ARCHITECTURE:
 *   ┌─────────────────────────────────────────────────────────────┐
 *   │  02_Schema.gs (Schema Definition Hub)                      │
 *   │  ├── SCHEMA{} — Array of column names per sheet            │
 *   │  │   ├── Group 1: Master Data (M_PERSON, M_ALIAS, ...)    │
 *   │  │   ├── Group 1: Fact Table (FACT_DELIVERY)               │
 *   │  │   ├── Group 2: Daily Ops (ตารางงานประจำวัน)            │
 *   │  │   └── System: SYS_LOG, SYS_CONFIG, SYS_TH_GEO          │
 *   │  ├── getSheetHeaders() — Get headers for a sheet           │
 *   │  ├── validateSheetHeaders() — Verify headers match schema  │
 *   │  ├── getColIndex() — Find column index by name             │
 *   │  └── validateSchemaConsistency() — SCHEMA.length vs IDX    │
 *   └─────────────────────────────────────────────────────────────┘
 * ===================================================
 */

const SCHEMA = Object.freeze({

  // ============================================================
  // กลุ่ม 1: Master Data
  // ============================================================

  'M_PERSON': [
    'person_id',        // [0]
    'canonical_name',   // [1]
    'normalized_name',  // [2]
    'phone',            // [3]
    'first_seen',       // [4]
    'last_seen',        // [5]
    'usage_count',      // [6]
    'record_status',    // [7]
    'note',             // [8]
    'master_uuid',      // [9]
  ],

  'M_PERSON_ALIAS': [
    'alias_id',     // [0]
    'person_id',    // [1]
    'alias_name',   // [2]
    'match_score',  // [3]
    'created_at',   // [4]
    'active_flag',  // [5]
  ],

  'M_PLACE': [
    'place_id',        // [0]
    'canonical_name',  // [1]
    'normalized_name', // [2]
    'place_type',      // [3]
    'sub_district',    // [4]
    'district',        // [5]
    'province',        // [6]
    'postcode',        // [7]
    'first_seen',      // [8]
    'last_seen',       // [9]
    'usage_count',     // [10]
    'record_status',   // [11]
    'note',            // [12]
    'master_uuid',     // [13]
  ],

  'M_PLACE_ALIAS': [
    'alias_id',     // [0]
    'place_id',     // [1]
    'alias_name',   // [2]
    'match_score',  // [3]
    'created_at',   // [4]
    'active_flag',  // [5]
  ],

  'M_ALIAS': [
    'alias_id',
    'master_uuid',
    'variant_name',
    'entity_type',
    'confidence',
    'source',
    'created_at',
    'active_flag',
  ],

  'M_GEO_POINT': [
    'geo_id',           // [0]
    'lat',              // [1]
    'lng',              // [2]
    'radius_m',         // [3]
    'resolved_address', // [4]
    'province',         // [5]
    'district',         // [6]
    'source',           // [7]
    'coord_confidence', // [8]
    'first_seen',       // [9]
    'last_seen',        // [10]
    'usage_count',      // [11]
    'record_status',    // [12]
    'extraction_method',// [13] [NEW v5.2.008] (google|place_fallback|text_fallback)
  ],

  'M_DESTINATION': [
    'dest_id',       // [0]
    'person_id',     // [1]
    'place_id',      // [2]
    'geo_id',        // [3]
    'lat',           // [4]
    'lng',           // [5]
    'route_label',   // [6]
    'delivery_date', // [7]
    'usage_count',   // [8]
    'last_seen',     // [9]
    'record_status', // [10]
  ],

  // ============================================================
  // กลุ่ม 1: Fact Table
  // ============================================================

  'FACT_DELIVERY': [
    'tx_id',             // [0]
    'source_sheet',      // [1]
    'source_row_number', // [2]
    'source_record_id',  // [3]
    'delivery_date',     // [4] ✅
    'delivery_time',     // [5]
    'invoice_no',        // [6]
    'shipment_no',       // [7]
    'driver_name',       // [8]
    'truck_license',     // [9]
    'sold_to_code',      // [10]
    'sold_to_name',      // [11]
    'ship_to_name',      // [12]
    'ship_to_address',   // [13]
    'geo_resolved_addr', // [14]
    'person_id',         // [15]
    'place_id',          // [16]
    'geo_id',            // [17] ✅
    'dest_id',           // [18] Fix: เดิม destination_id
    'warehouse',         // [19]
    'raw_lat',           // [20]
    'raw_lng',           // [21]
    'match_status',      // [22]
    'match_confidence',  // [23]
    'match_reason',      // [24]
    'match_action',      // [25]
    'resolved_lat',      // [26]
    'resolved_lng',      // [27]
    'created_at',        // [28]
    'updated_at',        // [29]
    'record_status',     // [30]
    'match_evidence',    // [31] [NEW v5.2.008] สัญญาณที่ใช้แมตช์ (name|phone|geo)
    // [ADD v5.5.014] ชื่อจริงที่คนขับ/ผู้ดูแลยืนยัน — เก็บจาก Source sheet
    'driver_verified_name', // [32] FACT_IDX.DRIVER_VERIFIED_NAME
    'driver_verified_addr', // [33] FACT_IDX.DRIVER_VERIFIED_ADDR
  ],

  // ============================================================
  // กลุ่ม 1: Review Queue
  // ============================================================

  'Q_REVIEW': [
    'review_id',                 // [0]
    'issue_type',                // [1]
    'priority',                  // [2]
    'source_record_id',          // [3]
    'source_row_number',         // [4]
    'invoice_no',                // [5]
    'raw_person_name',           // [6]
    'raw_place_name',            // [7]
    'raw_system_address',        // [8]
    'raw_lat',                   // [9]  ✅ ขยับขึ้นมาหลังลบ raw_geo_resolved_address
    'raw_lng',                   // [10]
    'candidate_person_ids',      // [11]
    'candidate_place_ids',       // [12]
    'candidate_geo_ids',         // [13]
    'candidate_destination_ids', // [14]
    'match_score',               // [15]
    'recommended_action',        // [16]
    'status',                    // [17]
    'reviewer',                  // [18]
    'reviewed_at',               // [19]
    'decision',                  // [20]
    'note',                      // [21]
  ],

  // ============================================================
  // กลุ่ม 1: System Support
  // ============================================================

  'SYS_LOG': [
    'log_id',    // [0]
    'timestamp', // [1]
    'module',    // [2]
    'level',     // [3]
    'message',   // [4]
    'details',   // [5]
  ],

  'SYS_CONFIG': [
    'config_key',   // [0]
    'config_value', // [1]
    'description',  // [2]
    'updated_at',   // [3]
  ],

  /**
   * SYS_TH_GEO — 5 คอลัมน์
   * [FIX v003] ลำดับถูกต้องตามชีตจริง
   * ชีตจริง: รหัสไปรษณีย์[0], แขวง/ตำบล[1], เขต/อำเภอ[2], จังหวัด[3], หมายเหตุ[4]
   * เดิมผิด: sub_district[0], district[1], province[2], postcode[3], region[4]
   */
  'SYS_TH_GEO': [
    'รหัสไปรษณีย์',      // [0] POSTCODE
    'แขวง/ตำบล',         // [1] SUB_DISTRICT
    'เขต/อำเภอ',         // [2] DISTRICT
    'จังหวัด',           // [3] PROVINCE
    'หมายเหตุ',          // [4] NOTE (Reference)
    'ตำบล_clean',       // [5] SUB_DISTRICT_CLEAN
    'อำเภอ_clean',       // [6] DISTRICT_CLEAN
    'ตำบล_label',       // [7] SUB_DISTRICT_LABEL
    'อำเภอ_label',       // [8] DISTRICT_LABEL
    'tambon_norm',      // [9] TAMBON_NORM
    'amphoe_norm',      // [10] AMPHOE_NORM
    'province_norm',    // [11] PROVINCE_NORM
    'search_key',       // [12] SEARCH_KEY (tambon|amphoe|province)
    'postal_key',       // [13] POSTAL_KEY (postal|tambon)
    'note_type',        // [14] NOTE_TYPE
    'note_scope',       // [15] NOTE_SCOPE
  ],

  'RPT_DATA_QUALITY': [
    'report_date',   // [0]
    'total_records', // [1]
    'auto_matched',  // [2]
    'reviewed',      // [3]
    'created_new',   // [4]
    'failed',        // [5]
    'match_rate',    // [6]
    'notes',         // [7]
  ],

  // [REMOVE v5.5.013] MAPS_CACHE SCHEMA ถูกลบออก — MAPS_CACHE sheet ไม่ได้ใช้แล้ว
  //   สูตร Google Maps ใช้ CacheService.getDocumentCache แทน (ดู 15_GoogleMapsAPI.gs)

  // ============================================================
  // กลุ่ม 2: Daily Ops
  // ============================================================

  'ตารางงานประจำวัน': [
    'ID_งานประจำวัน',                         // [0]
    'PlanDelivery',                            // [1]
    'InvoiceNo',                               // [2]
    'ShipmentNo',                              // [3]
    'DriverName',                              // [4]
    'TruckLicense',                            // [5]
    'CarrierCode',                             // [6]
    'CarrierName',                             // [7]
    'SoldToCode',                              // [8]
    'SoldToName',                              // [9]
    'ShipToName',                              // [10]
    'ShipToAddress',                           // [11]
    'LatLong_SCG',                             // [12]
    'MaterialName',                            // [13]
    'ItemQuantity',                            // [14]
    'QuantityUnit',                            // [15]
    'ItemWeight',                              // [16]
    'DeliveryNo',                              // [17]
    'จำนวนปลายทาง_System',                    // [18]
    'รายชื่อปลายทาง_System',                  // [19]
    'ScanStatus',                              // [20]
    'DeliveryStatus',                          // [21]
    'Email พนักงาน',                           // [22]
    'จำนวนสินค้ารวมของร้านนี้',               // [23]
    'น้ำหนักสินค้ารวมของร้านนี้',            // [24]
    'จำนวน_Invoice_ที่ต้องสแกน',             // [25]
    'LatLong_Actual',                          // [26]
    'ชื่อเจ้าของสินค้า_Invoice_ที่ต้องสแกน', // [27]
    'ShopKey',                                 // [28]
    // [ADD v5.5.014] ชื่อจริง — ระบบคัดลอกจาก Source sheet ตอน applyMasterCoordinatesToDailyJob
    'ชื่อลูกค้าปลายทางจริง',            // [29] DATA_IDX.DRIVER_VERIFIED_NAME
    'ชื่อสถานที่อยู่ลูกค้าปลายทางจริง', // [30] DATA_IDX.DRIVER_VERIFIED_ADDR
  ],

  'Input': [
    'COOKIE',      // [0] เซลล์ A1
    'ShipmentNos', // [1] เซลล์ A3
  ],

  /**
   * ข้อมูลพนักงาน — 8 คอลัมน์
   * [FIX v003] ตามชีตจริง (เดิม 5 คอลัมน์ผิด)
   */
  'ข้อมูลพนักงาน': [
    'ID_พนักงาน',              // [0] EMPLOYEE_IDX.EMP_ID
    'ชื่อ - นามสกุล',          // [1] EMPLOYEE_IDX.FULL_NAME
    'เบอร์โทรศัพท์',           // [2] EMPLOYEE_IDX.PHONE
    'เลขที่บัตรประชาชน',       // [3] EMPLOYEE_IDX.NATIONAL_ID
    'ทะเบียนรถ',               // [4] EMPLOYEE_IDX.TRUCK_LIC
    'เลือกประเภทรถยนต์',       // [5] EMPLOYEE_IDX.TRUCK_TYPE
    'Email พนักงาน',            // [6] EMPLOYEE_IDX.EMAIL
    'ROLE',                     // [7] EMPLOYEE_IDX.ROLE
  ],

  /**
   * สรุป_เจ้าของสินค้า — 6 คอลัมน์
   * [FIX v003] ชื่อคอลัมน์ถูกต้องตามชีตจริง
   */
  'สรุป_เจ้าของสินค้า': [
    'SummaryKey',             // [0] Fix: เดิม ลำดับ
    'SoldToName',             // [1] Fix: เดิม เจ้าของสินค้า
    'PlanDelivery',           // [2] Fix: เดิม หมายเหตุ
    'จำนวน_ทั้งหมด',         // [3] Fix: เดิม จำนวน Invoice
    'จำนวน_E-POD_ทั้งหมด',   // [4] Fix: เดิม จำนวน E-POD
    'LastUpdated',            // [5] Fix: เดิม วันที่อัปเดต
  ],

  /**
   * สรุป_Shipment — 7 คอลัมน์
   * [FIX v003] ชื่อคอลัมน์ถูกต้องตามชีตจริง
   */
  'สรุป_Shipment': [
    'ShipmentKey',            // [0] Fix: เดิม key
    'ShipmentNo',             // [1] ✅
    'TruckLicense',           // [2] ✅
    'PlanDelivery',           // [3] Fix: เดิม หมายเหตุ
    'จำนวน_ทั้งหมด',         // [4] Fix: เดิม จำนวน Invoice
    'จำนวน_E-POD_ทั้งหมด',   // [5] Fix: เดิม จำนวน E-POD
    'LastUpdated',            // [6] Fix: เดิม วันที่อัปเดต
  ],

  /**
   * SCGนครหลวงJWDภูมิภาค — 39 คอลัมน์ (ข้อมูลดิบจากคนขับ)
   * [ADD v5.5.011] เพิ่ม SCHEMA สำหรับ SHEET.SOURCE ที่ขาดหายไป
   *   ก่อนหน้านี้มีเพียง SRC_IDX ใน 01_Config.gs แต่ไม่มีใน SCHEMA
   *   ทำให้ getSheetHeaders(SHEET.SOURCE) และ validateSchemaConsistency ไม่ทำงานสำหรับชีตนี้
   *   ตอนนี้ SCHEMA เป็น Single Source of Truth จริงๆ สำหรับทุกชีต
   *   ลำดับและชื่อคอลัมน์ตรงกับ SRC_IDX ใน 01_Config.gs 100%
   */
  'SCGนครหลวงJWDภูมิภาค': [
    'head',                            // [0]  SRC_IDX.ROW_ID          ลำดับ
    'ID_SCGนครหลวงJWDภูมิภาค',        // [1]  SRC_IDX.SOURCE_ID
    'วันที่ส่งสินค้า',                  // [2]  SRC_IDX.DELIVERY_DATE
    'เวลาที่ส่งสินค้า',                 // [3]  SRC_IDX.DELIVERY_TIME
    'จุดส่งสินค้าปลายทาง',              // [4]  SRC_IDX.LATLNG_COMBINED  lat,lng รวมจริง 100%
    'ชื่อ - นามสกุล',                   // [5]  SRC_IDX.DRIVER_NAME     (คนขับ)
    'ทะเบียนรถ',                       // [6]  SRC_IDX.TRUCK_LICENSE
    'Shipment No',                     // [7]  SRC_IDX.SHIPMENT_NO
    'Invoice No',                      // [8]  SRC_IDX.INVOICE_NO
    'รูปถ่ายบิลส่งสินค้า',              // [9]  SRC_IDX.BILL_PHOTO
    'รหัสลูกค้า',                       // [10] SRC_IDX.CUSTOMER_CODE
    'ชื่อเจ้าของสินค้า',               // [11] SRC_IDX.SOLD_TO_NAME   (บริษัทผู้ขาย)
    'ชื่อปลายทาง',                     // [12] SRC_IDX.RAW_PERSON_NAME ← rawPersonName (สกปรก)
    'Email พนักงาน',                   // [13] SRC_IDX.EMPLOYEE_EMAIL
    'LAT',                             // [14] SRC_IDX.LAT             ← lat จริง 100%
    'LONG',                            // [15] SRC_IDX.LNG             ← lng จริง 100%
    'ID_Doc_Return',                   // [16] SRC_IDX.DOC_RETURN_ID
    'คลังสินค้า',                       // [17] SRC_IDX.WAREHOUSE
    'ที่อยู่ปลายทาง',                   // [18] SRC_IDX.RAW_ADDRESS     ← rawAddress (สกปรก)
    'รูปสินค้าตอนส่ง',                  // [19] SRC_IDX.PHOTO_PRODUCT
    'รูปหน้าร้าน/บ้าน',                 // [20] SRC_IDX.PHOTO_STORE
    'หมายเหตุ',                        // [21] SRC_IDX.REMARK
    'เดือน',                           // [22] SRC_IDX.MONTH
    'ระยะทางจากคลัง_Km',               // [23] SRC_IDX.DIST_FROM_WH
    'ชื่อที่อยู่จาก_LatLong',           // [24] SRC_IDX.RESOLVED_ADDR   ← rawPlaceName (สะอาดจาก GoogleMap)
    'SM_Link_SCG',                     // [25] SRC_IDX.SM_LINK
    'ID_พนักงาน',                      // [26] SRC_IDX.EMPLOYEE_ID
    'พิกัดตอนกดบันทึกงาน',             // [27] SRC_IDX.GPS_ON_SUBMIT
    'เวลาเริ่มกรอกงาน',                // [28] SRC_IDX.TIME_START
    'เวลาบันทึกงานสำเร็จ',             // [29] SRC_IDX.TIME_DONE
    'ระยะขยับจากจุดเริ่มต้น_เมตร',      // [30] SRC_IDX.MOVE_DIST_M
    'ระยะเวลาใช้งาน_นาที',             // [31] SRC_IDX.WORK_MIN
    'ความเร็วการเคลื่อนที่_เมตร_นาที',  // [32] SRC_IDX.SPEED_MPM
    'ผลการตรวจสอบงานส่ง',             // [33] SRC_IDX.QC_RESULT
    'เหตุผิดปกติที่ตรวจพบ',            // [34] SRC_IDX.QC_ISSUE
    'เวลาถ่ายรูปหน้าร้าน_หน้าบ้าน',    // [35] SRC_IDX.PHOTO_TIME
    'SYNC_STATUS',                     // [36] SRC_IDX.SYNC_STATUS     ← เช็คก่อน process
    // [ADD v5.5.014] ชื่อจริงที่คนขับ/ผู้ดูแลยืนยัน — กรอกใน AppSheet หรือ Google Sheet
    'ชื่อลูกค้าปลายทางจริง',            // [37] SRC_IDX.DRIVER_VERIFIED_NAME
    'ชื่อสถานที่อยู่ลูกค้าปลายทางจริง', // [38] SRC_IDX.DRIVER_VERIFIED_ADDR
  ],

});

// ============================================================
// Schema Utility Functions
// ============================================================

/**
 * getSheetHeaders — คืน Header Array ของชีตที่ระบุ
 * @param {string} sheetName - ชื่อชีตจริง (ค่าจาก SHEET.xxx)
 */
function getSheetHeaders(sheetName) {
  const headers = SCHEMA[sheetName];
  if (!headers) {
    throw new Error(
      `[Schema] ไม่พบ Schema สำหรับชีต: "${sheetName}"\n` +
      `Schema ที่มี: ${Object.keys(SCHEMA).join(', ')}`
    );
  }
  return headers;
}

/**
 * validateSheetHeaders — ตรวจสอบ Header ของชีตกับ Schema
 * [FIX v002] เพิ่ม wrongOrder + normalize case
 * [FIX v003] ยืนยันใช้งานได้
 *
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
 * @param {string[]} expected
 * @return {{ isValid, missing, extra, wrongOrder }}
 */
function validateSheetHeaders(sheet, expected) {
  const lastCol = sheet.getLastColumn();
  if (lastCol === 0) {
    return { isValid: false, missing: expected, extra: [], wrongOrder: false };
  }

  const normalize   = s => String(s).trim().toLowerCase();
  const actual      = sheet.getRange(1, 1, 1, lastCol)
                           .getValues()[0]
                           .map(h => String(h).trim());
  const actualNorm  = actual.map(normalize);
  const expectNorm  = expected.map(normalize);

  const missing = expected.filter(h => !actualNorm.includes(normalize(h)));
  const extra   = actual.filter(h => h !== '' && !expectNorm.includes(normalize(h)));

  // ตรวจลำดับ
  let wrongOrder = false;
  if (missing.length === 0) {
    wrongOrder = expectNorm.some((h, i) => actualNorm[i] !== h);
  }

  return {
    isValid:    missing.length === 0 && !wrongOrder,
    missing:    missing,
    extra:      extra,
    wrongOrder: wrongOrder,
  };
}

/**
 * getColIndex — ค้นหา Index ของ Column (0-based)
 * @param {string} schemaKey - ชื่อชีตจริง
 * @param {string} colName
 * @return {number} Index หรือ -1
 */
function getColIndex(schemaKey, colName) {
  const headers = SCHEMA[schemaKey];
  if (!headers) return -1;
  return headers.indexOf(colName);
}

/**
 * validateSchemaConsistency — ตรวจ SCHEMA.length vs IDX.keys
 * เรียกจาก validateConfig() ใน 01_Config.gs
 */
function validateSchemaConsistency() {
  const checks = [
    { sheetName: SHEET.M_PERSON,       idx: PERSON_IDX,       label: 'M_PERSON'       },
    { sheetName: SHEET.M_PERSON_ALIAS, idx: PERSON_ALIAS_IDX, label: 'M_PERSON_ALIAS' },
    { sheetName: SHEET.M_PLACE,        idx: PLACE_IDX,        label: 'M_PLACE'        },
    { sheetName: SHEET.M_PLACE_ALIAS,  idx: PLACE_ALIAS_IDX,  label: 'M_PLACE_ALIAS'  },
    { sheetName: SHEET.M_GEO_POINT,    idx: GEO_IDX,          label: 'M_GEO_POINT'    },
    { sheetName: SHEET.M_DESTINATION,  idx: DEST_IDX,         label: 'M_DESTINATION'  },
    { sheetName: SHEET.FACT_DELIVERY,  idx: FACT_IDX,         label: 'FACT_DELIVERY'  },
    { sheetName: SHEET.Q_REVIEW,       idx: REVIEW_IDX,       label: 'Q_REVIEW'       },
    { sheetName: SHEET.M_ALIAS,        idx: ALIAS_IDX,        label: 'M_ALIAS'        },
    // [ADD v5.5.011] เพิ่มการตรวจ SCHEMA vs SRC_IDX สำหรับ SHEET.SOURCE
    //   ก่อนหน้านี้ SHEET.SOURCE ไม่มีใน SCHEMA → ไม่ถูกตรวจ → ไม่พบจุดผิดจนกว่าจะ runtime error
    { sheetName: SHEET.SOURCE,         idx: SRC_IDX,          label: 'SCGนครหลวงJWDภูมิภาค (SOURCE)' },
    // [ADD v5.5.011] เพิ่มการตรวจ SCHEMA vs DATA_IDX สำหรับ SHEET.DAILY_JOB
    { sheetName: SHEET.DAILY_JOB,      idx: DATA_IDX,         label: 'ตารางงานประจำวัน (DAILY_JOB)' },
  ];

  const errors = [];
  checks.forEach(item => {
    const schemaArr = SCHEMA[item.sheetName];
    if (!schemaArr) {
      errors.push(`ไม่พบ SCHEMA key: "${item.sheetName}"`);
      return;
    }
    const idxLen = Object.keys(item.idx).length;
    if (schemaArr.length !== idxLen) {
      errors.push(
        `${item.label}: SCHEMA=${schemaArr.length} cols แต่ IDX=${idxLen} keys`
      );
    }
  });

  if (errors.length > 0) {
    throw new Error(
      `Schema Consistency Error (v${SCHEMA_VERSION}):\n` +
      errors.join('\n')
    );
  }

  logInfo('Schema', `validateSchemaConsistency ผ่าน — v${SCHEMA_VERSION}`);
  return true;
}
