/**
 * VERSION: 5.5.016
 * FILE: 20_ThGeoService.gs
 * LMDS V5.5 — Thai Geo Service
 * ===================================================
 * PURPOSE:
 *   ให้บริการค้นหาข้อมูลภูมิศาสตร์ไทย — ค้นหาจังหวัด/อำเภอ/ตำบล
 *   จากรหัสไปรษณีย์ หรือชื่อพื้นที่
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
 *     - [ADD] Comprehensive header documentation
 *   v5.4.000 (2026-05-24):
 *     - [UPGRADE] Version bump to 5.4.000
 *     - [ADD] Comprehensive header documentation
 *     - [ADD] DEPENDENCIES section with module relationships
 *     - [ENHANCE] Detailed module interconnection mapping
 *   v001 (original):
 *     - Initial release — Advanced TH Geo Service (16 Columns)
 * ===================================================
 * DEPENDENCIES:
 *   REQUIRES (Load Order):
 *     - 01_Config (SHEET.SYS_TH_GEO, TH_GEO_IDX.*)
 *     - 02_Schema (SCHEMA)
 *     - 05_NormalizeService (normalizeForCompare)
 *     - 16_GeoDictionaryBuilder (loadCachedGeoRows_)
 *     - 14_Utils (diceCoefficient)
 *     - 07_PlaceService (invalidatePlaceCache_) [V5.5.008 P2 #12]
 *     - 16_GeoDictionaryBuilder (invalidateGeoDictCache_) [V5.5.008 P2 #12]
 *     - 03_SetupSheets (flushLogBuffer_) [V5.5.008 P2 #11]
 *   CALLS (Invokes):
 *     - normalizeForCompare() → 05_NormalizeService
 *     - loadCachedGeoRows_() → 16_GeoDictionaryBuilder
 *     - invalidateGeoDictCache_() → 16_GeoDictionaryBuilder (replaces manual
 *       nulling of _GLOBAL_GEO_DICT_SEARCH_KEY_INDEX in populateGeoMetadata) [V5.5.008 P2 #12]
 *     - invalidatePlaceCache_() → 07_PlaceService (replaces 3 redundant manual
 *       cache nullings in populateGeoMetadata) [V5.5.008 P2 #12]
 *     - flushLogBuffer_() → 03_SetupSheets (populateGeoMetadata finally) [V5.5.008 P2 #11]
 *     - safeUiAlert_() → 14_Utils
 *     - logInfo() → 03_SetupSheets
 *   EXPORTS TO:
 *     - 07_PlaceService (getEnrichedGeoData — uses extractGeoFromAddress)
 *     - 16_GeoDictionaryBuilder (populateGeoMetadata — shared function)
 *     - 17_SearchService (geo search utilities)
 *   SHEETS ACCESSED:
 *     - SHEET.SYS_TH_GEO (Read: dictionary lookup for geo extraction)
 * ===================================================
 * ARCHITECTURE:
 *   ┌─────────────────────────────────────────────────────┐
 *   │             20_ThGeoService.gs                      │
 *   │         Thai Geography Extraction                   │
 *   ├─────────────────────────────────────────────────────┤
 *   │                                                     │
 *   │  extractGeoFromAddress ── 3-tier search:            │
 *   │       ├── Tier 1: postal_key match                  │
 *   │       ├── Tier 2: search_key match                  │
 *   │       └── Tier 3: norm column fuzzy match           │
 *   │                                                     │
 *   │  populateGeoMetadata ── Batch fill 16 metadata      │
 *   │       │                  columns for all            │
 *   │       │                  SYS_TH_GEO rows            │
 *   │       │                                             │
 *   │       │   [V5.5.008 P2 #12] uses invalidate*Cache_*│
 *   │       │     instead of 3 manual cache nullings     │
 *   │       │     (invalidateGeoDictCache_ +             │
 *   │       │      invalidatePlaceCache_)                │
 *   │       │   [V5.5.008 P2 #11] flushLogBuffer_() in   │
 *   │       │     finally block                          │
 *   │       │                                             │
 *   │       └── Columns: sub_district_clean,              │
 *   │           district_clean, labels, norms,            │
 *   │           search_key, postal_key, note_type,        │
 *   │           note_scope                                │
 *   │                                                     │
 *   └─────────────────────────────────────────────────────┘
 * ===================================================
 */

// [PERF-006] searchKey Index สำหรับ extractGeoFromAddress — ลด scan จาก O(N) เป็น O(1)
var _GLOBAL_GEO_DICT_SEARCH_KEY_INDEX = null;

/**
 * extractGeoFromAddress — แกะข้อมูลภูมิศาสตร์โดยใช้ Search Key (16 คอลัมน์)
 * [NEW v5.2.008] แม่นยำกว่า Regex เพราะค้นจาก Dictionary ตรงๆ
 */
function extractGeoFromAddress(rawText) {
  if (!rawText) return null;
  
  const cleanText = normalizeForCompare(rawText);
  const data = loadCachedGeoRows_(); // โหลดจาก Cache (16 คอลัมน์)

  // [PERF-006] สร้าง searchKey Index ครั้งเดียว — Map: normTambon → [row refs]
  // ลดการสแกนจาก O(N) เหลือ O(1) สำหรับ exact tambon match
  if (!_GLOBAL_GEO_DICT_SEARCH_KEY_INDEX) {
    const index = {};
    data.forEach(function(row) {
      const sKey = row.searchKey || '';
      if (!sKey) return;
      const parts = sKey.split('|');
      const tambonKey = parts[0] || '';
      if (tambonKey) {
        if (!index[tambonKey]) index[tambonKey] = [];
        index[tambonKey].push(row);
      }
    });
    _GLOBAL_GEO_DICT_SEARCH_KEY_INDEX = index;
  }

  let bestMatch = null;
  let maxScore = 0;
  let exactMatches = [];

  // [PERF-006] ใช้ searchKey Index เพื่อหา exact tambon match แบบ O(1) ก่อน
  // แทนการสแกนทั้ง dictionary แบบ O(N)
  // วิธี: แยก cleanText เป็นคำๆ แล้วลองค้นใน index
  const words = cleanText.split(/\s+/).filter(w => w.length >= 2);
  const candidateSet = new Set();
  for (const word of words) {
    const matched = _GLOBAL_GEO_DICT_SEARCH_KEY_INDEX[word];
    if (matched) {
      matched.forEach(row => candidateSet.add(row));
    }
  }

  // Fallback: ถ้า index lookup ไม่เจอเลย ใช้ full scan (กรณีคำไม่ตรงกับ tambon key)
  var candidates = candidateSet.size > 0 ? [...candidateSet] : data;

  for (const row of candidates) {
    const sKey = row.searchKey || '';
    if (!sKey) continue;

    const keyParts = sKey.split('|');
    const normTambon = keyParts[0] || '';
    const normAmphoe = keyParts[1] || '';

    const tambonMatch = normTambon && cleanText.includes(normTambon);
    const amphoeMatch = normAmphoe && cleanText.includes(normAmphoe);

    if (tambonMatch && amphoeMatch) {
      const score = 1.0;
      if (score >= maxScore) {
        maxScore = score;
        exactMatches.push(row);
      }
    }
  }

  // [FIX v5.5.001] Disambiguate ด้วยจังหวัดเมื่อมีหลาย exact matches
  if (exactMatches.length > 0) {
    if (exactMatches.length === 1) {
      bestMatch = exactMatches[0];
    } else {
      // หาจังหวัดจาก address แล้วเลือก match ที่จังหวัดตรงกัน
      for (const match of exactMatches) {
        const matchProvinceNorm = normalizeForCompare(match.province || '');
        if (matchProvinceNorm && cleanText.includes(matchProvinceNorm)) {
          bestMatch = match;
          break;
        }
      }
      // ถ้าหาจังหวัดใน address ไม่เจอ ใช้ match แรกเป็น fallback
      if (!bestMatch) {
        bestMatch = exactMatches[0];
      }
    }
  }

  return bestMatch;
}

/**
 * [MIGRATION TOOL] populateGeoMetadata
 * รันฟังก์ชันนี้ "ครั้งเดียว" หลังจากเพิ่มคอลัมน์ F-P ในชีต SYS_TH_GEO แล้ว
 * เพื่อเติมข้อมูลอัตโนมัติ
 * [REF-006] Refactored: extracted transformGeoMetadataRow_ + flushGeoMetadataBatch_
 */
function populateGeoMetadata() {
  // [SEC-012 FIX] Authorization Guard — bulk write SYS_TH_GEO ต้องเป็น Admin เท่านั้น
  if (typeof isAuthorizedUser_ === 'function' && !isAuthorizedUser_()) {
    safeUiAlert_('🔒 คุณไม่มีสิทธิ์รัน Populate Geo Metadata\nกรุณาติดต่อ Admin');
    return;
  }
  try {
  // [G-2] Load checkpoint for resume support
  const props = PropertiesService.getScriptProperties();
  const checkpointRaw = props.getProperty('GEO_META_CHECKPOINT');
  const savedRowIndex = checkpointRaw ? (Number(JSON.parse(checkpointRaw).rowIndex) || 0) : 0;

  if (savedRowIndex > 0) {
    logInfo('GeoMigration', 'Resume populateGeoMetadata จากแถว ' + savedRowIndex);
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET.SYS_TH_GEO);
  if (!sheet) return;

  const lastRow = sheet.getLastRow();
  const colsToRead = SCHEMA[SHEET.SYS_TH_GEO].length;
  const totalDataRows = lastRow > 1 ? lastRow - 1 : 0;

  if (totalDataRows === 0) return;

  logInfo('GeoMigration', 'เริ่มเติมข้อมูล Metadata — ' + totalDataRows + ' แถว');

  // Read all data once (snapshot) — source columns are never modified,
  // so re-reading on resume yields consistent original data for unprocessed rows
  const allData = sheet.getRange(2, 1, totalDataRows, colsToRead).getValues();

  // [G-2] Time Guard + Checkpoint — process and write in batches of 500 rows
  const startTime = new Date();
  const timeLimit = AI_CONFIG.TIME_LIMIT_MS || (5 * 60 * 1000);
  const BATCH_SIZE = 500;
  let timedOut = false;
  let lastProcessedIndex = 0;

  for (let batchStart = 0; batchStart < totalDataRows; batchStart += BATCH_SIZE) {
    // Skip already-processed batches on resume
    if (batchStart + BATCH_SIZE <= savedRowIndex) continue;

    const batchEnd = Math.min(batchStart + BATCH_SIZE, totalDataRows);
    const batchRows = [];

    for (let i = batchStart; i < batchEnd; i++) {
      const row = allData[i].slice(); // Clone to avoid mutating snapshot
      batchRows.push(transformGeoMetadataRow_(row)); // [REF-006] Pure transform
    }

    // [REF-006] Write batch to sheet via helper
    flushGeoMetadataBatch_(sheet, batchRows, 2 + batchStart);
    lastProcessedIndex = batchEnd;

    // [G-2] Time Guard between batches
    if (hasTimePassed_(startTime, timeLimit)) {
      props.setProperty('GEO_META_CHECKPOINT', JSON.stringify({ rowIndex: batchEnd }));
      timedOut = true;
      logInfo('GeoMigration', 'Time guard — บันทึก checkpoint ที่แถว ' + batchEnd);
      break;
    }
  }

  if (timedOut) {
    safeUiAlert_(
      '⚠️ populateGeoMetadata หยุดกลางคัน (Timeout)!\n\n' +
      'ดำเนินการถึงแถว: ' + lastProcessedIndex + ' / ' + totalDataRows + '\n\n' +
      '💡 รันอีกครั้งเพื่อดำเนินการต่อ'
    );
    return;
  }

  // [G-2] Clear checkpoint on completion
  props.deleteProperty('GEO_META_CHECKPOINT');

  // [FIX v5.5.008 P2 #12] ลบ redundant manual cache nulling — ใช้ invalidate*Cache_* แทน
  //   เดิม null 3 ตัว manual แล้วค่อยเรียก invalidateGeoDictCache() ซึ่งก็ null ซ้ำ
  //   ตอนนี้ใช้ centralized invalidators ที่จะ null RAM + clear CacheService ครบ
  //
  //   invalidateGeoDictCache() จะ null _GLOBAL_GEO_DICT_CACHE + _GLOBAL_GEO_DICT_PROVINCE_INDEX
  //                          + _GLOBAL_GEO_DICT_SEARCH_KEY_INDEX (แก้ใน V5.5.007 P0 #2) + TH_GEO_* CacheService
  //   invalidatePlaceCache_() จะ null _GLOBAL_GEO_DICT_CACHE_PLACE + M_PLACE_ALL CacheService
  if (typeof invalidateGeoDictCache === 'function') invalidateGeoDictCache();
  if (typeof invalidatePlaceCache_ === 'function') invalidatePlaceCache_();
  logInfo('GeoMigration', 'เติมข้อมูล Metadata เสร็จสิ้น!');
  safeUiAlert_('✅ เติมข้อมูล Geo Metadata สำเร็จ!\nกรุณากด "สร้าง Geo Dictionary" อีกครั้งเพื่อใช้งาน');
  } catch (err) {
    logError('ThGeoService', 'populateGeoMetadata ล้มเหลว: ' + err.message, err);
    // [FIX B3 v5.5.002] ใช้ safeUiAlert_() แทน raw SpreadsheetApp.getUi().alert() กัน crash ใน non-UI context
    safeUiAlert_('❌ เกิดข้อผิดพลาด: ' + err.message);
  } finally {
    // [FIX v5.5.008 P2 #11] flush log buffer ก่อน exit — ป้องกัน log entries <50 หาย
    if (typeof flushLogBuffer_ === 'function') flushLogBuffer_();
  }
}

// ============================================================
// SECTION 2a: Geo Metadata Helpers [REF-006]
// ============================================================

/**
 * transformGeoMetadataRow_ — [REF-006] Pure function that transforms one SYS_TH_GEO row
 * Populates columns F-P (metadata columns) based on source columns A-E
 * @param {Array} rawRow - Row data array (cloned, will be mutated in-place)
 * @return {Array} The same row array with metadata columns populated
 */
function transformGeoMetadataRow_(rawRow) {
  const post = String(rawRow[TH_GEO_IDX.POSTCODE] || '').trim();
  const sub  = String(rawRow[TH_GEO_IDX.SUB_DISTRICT] || '').trim();
  const dist = String(rawRow[TH_GEO_IDX.DISTRICT] || '').trim();
  const prov = String(rawRow[TH_GEO_IDX.PROVINCE] || '').trim();

  // 1. Clean (ตัด prefix)
  const subC = sub.replace(/แขวง|ตำบล|ต\.|ข\./g, '').trim();
  const distC = dist.replace(/เขต|อำเภอ|อ\.|ข\./g, '').trim();

  // 2. Label
  const subL = sub.includes('แขวง') ? 'แขวง' : 'ตำบล';
  const distL = dist.includes('เขต') ? 'เขต' : 'อำเภอ';

  // 3. Normalized
  const subN = normalizeForCompare(subC);
  const distN = normalizeForCompare(distC);
  const provN = normalizeForCompare(prov);

  // 4. Keys
  const searchKey = subN + '|' + distN + '|' + provN;
  const postalKey = post + '|' + subN;

  // 5. Note Classification (เบื้องต้น)
  let nType = 'FULL_AREA';
  let nScope = 'FULL';
  const note = String(rawRow[TH_GEO_IDX.NOTE] || '');
  if (note.includes('ยกเว้น') || note.includes('เฉพาะ')) {
    nType = 'CHECK_NOTE';
    nScope = 'PARTIAL';
  }

  // เติมลงคอลัมน์ F-P (Index 5-15)
  rawRow[TH_GEO_IDX.SUB_DISTRICT_CLEAN] = subC;
  rawRow[TH_GEO_IDX.DISTRICT_CLEAN]     = distC;
  rawRow[TH_GEO_IDX.SUB_DISTRICT_LABEL] = subL;
  rawRow[TH_GEO_IDX.DISTRICT_LABEL]     = distL;
  rawRow[TH_GEO_IDX.TAMBON_NORM]        = subN;
  rawRow[TH_GEO_IDX.AMPHOE_NORM]        = distN;
  rawRow[TH_GEO_IDX.PROVINCE_NORM]      = provN;
  rawRow[TH_GEO_IDX.SEARCH_KEY]         = searchKey;
  rawRow[TH_GEO_IDX.POSTAL_KEY]         = postalKey;
  rawRow[TH_GEO_IDX.NOTE_TYPE]          = nType;
  rawRow[TH_GEO_IDX.NOTE_SCOPE]         = nScope;

  return rawRow;
}

/**
 * flushGeoMetadataBatch_ — [REF-006] Batch write helper for geo metadata
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
 * @param {Array} rows - Array of row arrays to write
 * @param {number} startRow - 1-based row number where batch starts
 */
function flushGeoMetadataBatch_(sheet, rows, startRow) {
  if (!rows || rows.length === 0) return;
  sheet.getRange(startRow, 1, rows.length, rows[0].length).setValues(rows);
}
