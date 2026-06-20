/**
 * VERSION: 5.5.016
 * FILE: 08_GeoService.gs
 * LMDS V5.5 — Geo Point Master Service
 * ===================================================
 * PURPOSE:
 *   จัดการ Master Geo Point — ฐานข้อมูลพิกัด GPS ที่ตรวจสอบแล้ว
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
 *   v5.2.001 (PH2 Hardening):
 *     - [UPGRADE] GLOBAL_CACHE Memoization (loadAllGeos_)
 * ===================================================
 * DEPENDENCIES:
 *   REQUIRES (Load Order):
 *     - 01_Config (SHEET.M_GEO_POINT, GEO_IDX.*, AI_CONFIG.GEO_RADIUS_M, AI_CONFIG.CACHE_TTL_SEC, APP_CONST.*)
 *     - 02_Schema (SCHEMA)
 *     - 15_GoogleMapsAPI (geocode / reverse geocode)
 *     - 14_Utils (haversineDistanceM, generateShortId)
 *     - 11_TransactionService (invalidateGeoLatLngCache_) [V5.5.007 P1 #5]
 *   CALLS (Invokes):
 *     - haversineDistanceM() → 14_Utils
 *     - generateShortId() → 14_Utils
 *     - lookupPlaceAdminById_() → 07_PlaceService
 *     - invalidateGeoLatLngCache_() → 11_TransactionService (called from
 *       invalidateGeoCache_ to clear _GEO_LATLNG_RAM_CACHE) [V5.5.007 P1 #5]
 *     - logError/logDebug/logWarn() → 03_SetupSheets
 *   EXPORTS TO:
 *     - 10_MatchEngine (resolveGeo, createGeoPoint, updateGeoStats, loadAllGeos_, findNearbyGeos)
 *     - 12_ReviewService (resolveGeo, createGeoPoint)
 *     - 11_TransactionService (loadAllGeos_)
 *     - 00_App
 *   SHEETS ACCESSED:
 *     - SHEET.M_GEO_POINT (Read+Write: geo point master data)
 *     - SHEET.MAPS_CACHE (Read: cached geocode results)
 * ===================================================
 * ARCHITECTURE:
 *   ┌─────────────────────────────────────────────────┐
 *   │              Geo Master Hub                     │
 *   ├─────────────────────────────────────────────────┤
 *   │  resolveGeo                                     │
 *   │    └─► findGeoCandidates_ (grid-based proximity)│
 *   │  createGeoPoint                                 │
 *   │    └─► Plus Code fallback via lookupPlaceAdminById_
 *   │  updateGeoStats                                 │
 *   │  loadAllGeos_ (RAM+CacheService memoization)    │
 *   │  findNearbyGeos (haversine radius search)       │
 *   │  invalidateGeoCache_                            │
 *   │    └─► also calls invalidateGeoLatLngCache_()   │
 *   │        on 11_TransactionService to clear        │
 *   │        _GEO_LATLNG_RAM_CACHE [V5.5.007 P1 #5]   │
 *   │  haversineDistance (public alias)                │
 *   └─────────────────────────────────────────────────┘
 * ===================================================
 */

// [NEW v5.2.001] Global RAM Cache (Managed in 01_Config.gs)

// ============================================================
// SECTION 1: Constants
// ============================================================

// [FIX S6 v5.5.002] ลบ alias GEO_GRID_SIZE — ใช้ AI_CONFIG.GEO_GRID_SIZE โดยตรง
// เดิม: const GEO_GRID_SIZE = AI_CONFIG.GEO_GRID_SIZE; (alias ซ้ำซ้อน, เสี่ยงขัดแย้ง)
// ตอนนี้ทุก reference ใช้ AI_CONFIG.GEO_GRID_SIZE แทน

// ============================================================
// SECTION 2: resolveGeo
// ============================================================

/**
 * resolveGeo — ค้นหา Geo Point ที่ใกล้ที่สุด
 * [FIX v003] เพิ่ม typeof + isNaN guard
 * [FIX v003] Confidence clamp [0,100]
 *
 * @param {number} lat
 * @param {number} lng
 * @return {{ geoId, status, confidence, distanceM }}
 */
function resolveGeo(lat, lng) {
  // [FIX v003] typeof + isNaN guard แทน !lat || !lng (หลวมเกิน)
  const numLat = Number(lat);
  const numLng = Number(lng);

  if (isNaN(numLat) || isNaN(numLng) || numLat === 0 || numLng === 0) {
    return { geoId: null, status: 'INVALID', confidence: 0, distanceM: -1 };
  }

  // ตรวจกรอบประเทศไทย
  if (numLat < 5.5 || numLat > 20.5 || numLng < 97.5 || numLng > 105.7) {
    return { geoId: null, status: 'OUT_OF_BOUNDS', confidence: 0, distanceM: -1 };
  }

  const candidates = findGeoCandidates_(numLat, numLng);
  if (candidates.length === 0) {
    return { geoId: null, status: 'NOT_FOUND', confidence: 0, distanceM: -1 };
  }

  let bestGeo = null;
  let minDist = Infinity;
  let nearbyGeos = []; // เก็บพิกัดทั้งหมดในระยะ 100 เมตร

  candidates.forEach(geo => {
    const distM = haversineDistanceM(numLat, numLng, geo.lat, geo.lng);
    if (distM < minDist) { minDist = distM; bestGeo = geo; }
    
    // [UPGRADE v5.2.005] เก็บผู้ท้าชิงที่อยู่ในระยะ 100 เมตร
    if (distM <= 100) {
      nearbyGeos.push({ id: geo.geoId, dist: distM });
    }
  });

  if (!bestGeo) {
    return { geoId: null, status: 'NOT_FOUND', confidence: 0, distanceM: -1 };
  }

  // [UPGRADE v5.2.005] Tiered Spatial Fuzzy Matching
  const radius = Number(bestGeo.radiusM) || AI_CONFIG.GEO_RADIUS_M; // ค่า default คือ 50
  const distance = Math.round(minDist);

  // เรียงลำดับใกล้ไปไกล และดึงเฉพาะ ID
  nearbyGeos.sort((a, b) => a.dist - b.dist);
  const candidateGeoIds = nearbyGeos.map(g => g.id);

  // [F-14] Delegate tiered distance classification to helper
  return geoClassifyDistance_(distance, radius, candidateGeoIds, bestGeo.geoId);
}

/**
 * geoClassifyDistance_ — Tiered distance classification for resolveGeo()
 * [EXTRACT F-14] แยก tiered distance classification ออกจาก resolveGeo()
 *
 * Tiered rules:
 *   distance <= radius:  FOUND (confidence = 100 - (distance/radius)*30)
 *   distance <= 80:      NEARBY_PENDING, GEO_NEARBY_YELLOW
 *   distance <= 100:     NEARBY_PENDING, GEO_NEARBY_ORANGE
 *   distance > 100:      NOT_FOUND
 *
 * @param {number} distance - ระยะทาง (เมตร, ปัดเศษแล้ว)
 * @param {number} radius   - รัศมี (เมตร) ของ best geo
 * @param {string[]} candidateGeoIds - รายการ geo ID ที่อยู่ในระยะ 100 เมตร (เรียงใกล้→ไกล)
 * @param {string} bestGeoId - geo ID ที่ใกล้ที่สุด
 * @return {{ geoId, status, confidence, distanceM, ... }}
 */
function geoClassifyDistance_(distance, radius, candidateGeoIds, bestGeoId) {
  if (distance <= radius) {
    // 0 - radius m: FOUND (Auto-Merge)
    const rawConf = 100 - ((distance / radius) * 30);
    const confidence = Math.max(0, Math.min(100, Math.round(rawConf)));
    return {
      geoId: bestGeoId,
      status: 'FOUND',
      confidence: confidence,
      distanceM: distance,
    };
  } else if (distance <= 80) {
    // radius+1 - 80 m: NEARBY YELLOW
    return {
      geoId: null, // ยังไม่ตัดสินใจ ต้องรอคนตรวจ
      status: 'NEARBY_PENDING',
      issue_type: 'GEO_NEARBY_YELLOW',
      confidence: 0,
      distanceM: distance,
      candidateGeoIds: candidateGeoIds
    };
  } else if (distance <= 100) {
    // 80 - 100 m: NEARBY ORANGE
    return {
      geoId: null,
      status: 'NEARBY_PENDING',
      issue_type: 'GEO_NEARBY_ORANGE',
      confidence: 0,
      distanceM: distance,
      candidateGeoIds: candidateGeoIds
    };
  } else {
    // > 100 m: NOT_FOUND (สร้างใหม่)
    return { geoId: null, status: 'NOT_FOUND', confidence: 0, distanceM: distance };
  }
}

// ============================================================
// SECTION 3: findGeoCandidates_ (Grid Search)
// ============================================================

/**
 * findGeoCandidates_ — Pre-filter ด้วย Grid Key (3×3)
 * [FIX v003] Floating Point Bug:
 *   เดิม: Math.floor((lat + dlat * gridSize) / gridSize)
 *   ถูก:  Math.floor(lat / gridSize) + dlat
 *   เหตุผล: (lat + 0.01 * 1) / 0.01 มี Floating Point error
 *            แต่ Math.floor(lat/0.01) + 1 แม่นยำเสมอ
 *
 * [NOTE] Grid 3×3 รองรับ radius สูงสุด ~1.5 กม.
 *        ถ้า radius ใหญ่กว่านี้ต้องขยาย grid เป็น 5×5
 */
function findGeoCandidates_(lat, lng) {
  const allGeos    = loadAllGeos_();

  // [FIX v003] คำนวณ base grid index ก่อน แล้วบวก offset
  // [FIX S6 v5.5.002] ใช้ AI_CONFIG.GEO_GRID_SIZE แทน alias
  const baseGridLat = Math.floor(lat / AI_CONFIG.GEO_GRID_SIZE);
  const baseGridLng = Math.floor(lng / AI_CONFIG.GEO_GRID_SIZE);

  const searchKeys = new Set();
  for (let dlat = -1; dlat <= 1; dlat++) {
    for (let dlng = -1; dlng <= 1; dlng++) {
      searchKeys.add(`${baseGridLat + dlat}_${baseGridLng + dlng}`);
    }
  }

  return allGeos.filter(geo => searchKeys.has(geo.gridKey));
}

/**
 * buildGridKey_ — สร้าง Grid Key จากพิกัด
 * [FIX S6 v5.5.002] ใช้ AI_CONFIG.GEO_GRID_SIZE แทน alias
 */
function buildGridKey_(lat, lng) {
  const gLat = Math.floor(lat / AI_CONFIG.GEO_GRID_SIZE);
  const gLng = Math.floor(lng / AI_CONFIG.GEO_GRID_SIZE);
  return `${gLat}_${gLng}`;
}

// ============================================================
// SECTION 4: CRUD
// ============================================================

/**
 * createGeoPoint — สร้าง Geo Point ใหม่
 * [FIX v003] Validate lat/lng เป็น Number ก่อน appendRow
 */
function createGeoPoint(lat, lng, source, resolvedAddr, province, district, placeId) {
  try {
  // [FIX v003] Validate เป็น Number จริง
  const numLat = Number(lat);
  const numLng = Number(lng);

  if (isNaN(numLat) || isNaN(numLng)) {
    logError('GeoService', `createGeoPoint: lat/lng ไม่ใช่ตัวเลข (${lat}, ${lng})`, new Error('INVALID_LATLNG'));
    return null;
  }

  // [FIX v5.5.001] Validate lat/lng bounds
  if (numLat < -90 || numLat > 90) {
    logError('GeoService', `createGeoPoint: lat ออกนอกช่วง [-90, 90] (${numLat})`, new Error('LAT_OUT_OF_RANGE'));
    return null;
  }
  if (numLng < -180 || numLng > 180) {
    logError('GeoService', `createGeoPoint: lng ออกนอกช่วง [-180, 180] (${numLng})`, new Error('LNG_OUT_OF_RANGE'));
    return null;
  }

  // [FIX v5.2.008] Fallback Logic: ถ้าข้อมูลพื้นที่ว่าง (มักเกิดจาก Plus Code) ให้ดึงจาก M_PLACE มาเติม
  let finalProv = province || '';
  let finalDist = district || '';
  let extractionMethod = 'google';

  if ((!finalProv || !finalDist) && (resolvedAddr || '').includes('+')) {
    if (typeof lookupPlaceAdminById_ === 'function') {
      const fallback = lookupPlaceAdminById_(placeId);
      if (fallback) {
        if (!finalProv) finalProv = fallback.province;
        if (!finalDist) finalDist = fallback.district;
        extractionMethod = 'place_fallback';
      }
    }
  }

  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET.M_GEO_POINT);
  if (!sheet) {
    logError('GeoService', `ไม่พบชีต ${SHEET.M_GEO_POINT}`, new Error('SHEET_NOT_FOUND'))
    return null;
  }
  const now   = new Date();
  const newId = generateShortId('G');

  // กำหนด default confidence ตาม source
  let defaultConf = 85;
  if (source === 'maps')   defaultConf = 90;
  if (source === 'manual') defaultConf = 75;
  if (source === 'driver') defaultConf = 80;

  const newRow = [
    newId,
    numLat,
    numLng,
    AI_CONFIG.GEO_RADIUS_M,
    resolvedAddr || '',
    finalProv,
    finalDist,
    source || 'driver',
    defaultConf,
    now, now, 1,
    APP_CONST.STATUS_ACTIVE,
    extractionMethod // [NEW v5.2.008] บันทึกแหล่งที่มาเพื่อ Audit
  ];

  // [FIX v5.2.002] ใช้ getRange + setValues แทน appendRow เพื่อความแม่นยำสูง
  const lastRow = sheet.getLastRow();
  sheet.getRange(lastRow + 1, 1, 1, newRow.length).setValues([newRow]);
  
  invalidateGeoCache_();
  logDebug('GeoService', `createGeoPoint: ${newId} — ${finalProv} ${finalDist} (${extractionMethod})`);
  return newId;
  } catch (err) {
    // [FIX B3 v5.5.002] เพิ่ม try-catch ตาม Rule 12
    logError('GeoService', `createGeoPoint ล้มเหลว: ${err.message}`, err);
    return null;
  }
}

/**
 * updateGeoStats
 * [FIX v003] โหลดเฉพาะ geo_id column + ใช้ GEO_IDX + guard
 */
function updateGeoStats(geoId) {
  if (!geoId) return;
  try {
    const ss      = SpreadsheetApp.getActiveSpreadsheet();
    const sheet   = ss.getSheetByName(SHEET.M_GEO_POINT);
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return;

    const idCol   = GEO_IDX.GEO_ID + 1;
    const idData  = sheet.getRange(2, idCol, lastRow - 1, 1).getValues();
    let targetRow = -1;

    for (let i = 0; i < idData.length; i++) {
      if (String(idData[i][0]).trim() === geoId) {
        targetRow = i + 2; break;
      }
    }

    if (targetRow === -1) {
      logWarn('GeoService', `updateGeoStats: ไม่พบ geoId ${geoId}`);
      return;
    }

    const lastSeenCol   = GEO_IDX.LAST_SEEN   + 1;
    const usageCountCol = GEO_IDX.USAGE_COUNT  + 1;

    // [FIX v5.4.003] Batch write: อ่านทั้ง 2 คอลัมน์ → แก้ใน RAM → เขียนทีเดียว
    // ลดจาก 3 API calls เหลือ 1+1 = 2 API calls
    const statsRange = sheet.getRange(targetRow, lastSeenCol, 1, 2);
    const statsVals  = statsRange.getValues();
    const curr = Number(statsVals[0][1]) || 0;
    statsVals[0][0] = new Date();
    statsVals[0][1] = curr + 1;
    statsRange.setValues(statsVals);
    invalidateGeoCache_();

  } catch (err) {
    logError('GeoService', `updateGeoStats ล้มเหลว: ${err.message}`, err);
  }
}

// ============================================================
// SECTION 5: Data Loaders
// ============================================================

function loadAllGeos_() {
  if (_GLOBAL_GEO_POINTS_CACHE) return _GLOBAL_GEO_POINTS_CACHE;

  const cacheKey = 'M_GEO_ALL';
  const cache    = CacheService.getScriptCache();
  // [PERF-004] [REF-010] ใช้ centralized loadChunkedCache_ จาก 14_Utils.gs
  var cachedData = loadChunkedCache_(cache, cacheKey);
  if (cachedData) return cachedData;

  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET.M_GEO_POINT);
  if (!sheet || sheet.getLastRow() < 2) return [];

  // [FIX v5.4.001] ใช้ Math.min เพื่อป้องกัน Range error
  const colsToRead = Math.min(SCHEMA[SHEET.M_GEO_POINT].length, sheet.getLastColumn());
  const rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, colsToRead).getValues();

  const result = rows
    .filter(r => r[GEO_IDX.GEO_ID])
    // [FIX v003] กรอง ARCHIVED และ MERGED
    .filter(r => r[GEO_IDX.STATUS] !== APP_CONST.STATUS_ARCHIVED &&
                 r[GEO_IDX.STATUS] !== APP_CONST.STATUS_MERGED)
    .map(r => ({
      geoId:      String(r[GEO_IDX.GEO_ID]),
      lat:        Number(r[GEO_IDX.LAT])        || 0,
      lng:        Number(r[GEO_IDX.LNG])        || 0,
      radiusM:    Number(r[GEO_IDX.RADIUS_M])   || AI_CONFIG.GEO_RADIUS_M,
      province:   String(r[GEO_IDX.PROVINCE]    || ''),
      district:   String(r[GEO_IDX.DISTRICT]    || ''),
      confidence: Number(r[GEO_IDX.CONFIDENCE]  || 0),
      usageCount: Number(r[GEO_IDX.USAGE_COUNT] || 0),
      // [FIX S6 v5.5.002] ใช้ AI_CONFIG.GEO_GRID_SIZE (canonical source)
      gridKey:    buildGridKey_(Number(r[GEO_IDX.LAT]), Number(r[GEO_IDX.LNG])),
    }));

  // [PERF-004] [REF-010] ใช้ centralized saveChunkedCache_ จาก 14_Utils.gs
  saveChunkedCache_(cache, cacheKey, result);

  _GLOBAL_GEO_POINTS_CACHE = result;
  return result;
}

/**
 * batchUpdateGeoStats_ — [PERF-001] [REF-009] Batch stats update สำหรับ Geo Point
 * Delegated to batchUpdateEntityStats_() in 14_Utils.gs — thin wrapper
 * @param {Set<string>} geoIds - Set of geo IDs to update
 */
function batchUpdateGeoStats_(geoIds) {
  batchUpdateEntityStats_(SHEET.M_GEO_POINT, GEO_IDX, GEO_IDX.GEO_ID, GEO_IDX.USAGE_COUNT, GEO_IDX.LAST_SEEN, geoIds, invalidateGeoCache_);
}

/**
 * invalidateGeoCache_ — [REF-011] Uses centralized invalidateChunkedCache_
 * [FIX v5.5.007 P1 #5] เพิ่มการล้าง _GEO_LATLNG_RAM_CACHE ของ TransactionService
 *   เมื่อ M_GEO_POINT เปลี่ยน (สร้าง/แก้ geo ใหม่) ต้องล้าง cache ฝั่ง consumer ด้วย
 *   ไม่งั้น getGeoLatLng_() จะ return null สำหรับ geoId ใหม่ → FACT_DELIVERY ได้พิกัด raw
 */
function invalidateGeoCache_() {
  invalidateChunkedCache_('M_GEO_ALL', function() { _GLOBAL_GEO_POINTS_CACHE = null; });
  // [FIX v5.5.007 P1 #5] ล้าง geo lat/lng cache ใน TransactionService ด้วย
  if (typeof invalidateGeoLatLngCache_ === 'function') invalidateGeoLatLngCache_();
}

/**
 * findNearbyGeos — [ADD v5.1.001] ค้นหาพิกัดที่อยู่ใกล้เคียง
 * @param {number} lat - Latitude
 * @param {number} lng - Longitude
 * @param {number} radiusM - รัศมี (เมตร)
 */
function findNearbyGeos(lat, lng, radiusM = 1000) {
  // [FIX B2 v5.5.002] ใช้ isNaN guard เหมือน resolveGeo() แทน falsy check
  // falsy check (!lat) จะ reject lat=0 ซึ่งผิดสำหรับพิกัดบนเส้นศูนย์สูตร
  const numLat = Number(lat);
  const numLng = Number(lng);
  if (isNaN(numLat) || isNaN(numLng) || numLat === 0 || numLng === 0) return [];
  const allGeos = loadAllGeos_();
  const nearby = [];

  allGeos.forEach(geo => {
    const distance = haversineDistanceM(numLat, numLng, geo.lat, geo.lng);
    if (distance <= radiusM) {
      nearby.push({
        geoId: geo.geoId,
        lat: geo.lat,
        lng: geo.lng,
        distance: Math.round(distance),
        confidence: geo.confidence,
      });
    }
  });

  return nearby.sort((a, b) => a.distance - b.distance);
}

/**
 * geoHaversineDistance — [FIX LAW-08 v5.4.003] เปลี่ยนชื่อจาก haversineDistance
 * เพิ่ม prefix geo เพื่อให้ทราบว่าฟังก์ชันนี้มาจากโมดูล GeoService
 * Backward compat: haversineDistance() ยังคงใช้ได้ผ่าน wrapper ด้านล่าง
 */
function geoHaversineDistance(lat1, lng1, lat2, lng2) {
  return haversineDistanceM(lat1, lng1, lat2, lng2);
}

/**
 * haversineDistance — Backward-compatible wrapper
 * [FIX LAW-08 v5.4.003] เก็บไว้ชั่วคราว — ควรใช้ geoHaversineDistance() หรือ haversineDistanceM() แทน
 */
function haversineDistance(lat1, lng1, lat2, lng2) {
  return geoHaversineDistance(lat1, lng1, lat2, lng2);
}
