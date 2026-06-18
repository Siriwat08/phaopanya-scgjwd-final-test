/**
 * VERSION: 5.5.011
 * FILE: 15_GoogleMapsAPI.gs
 * LMDS V5.5 — Google Maps API Service (Hybrid Cache)
 * ===================================================
 * PURPOSE:
 *   ให้บริการ Geocoding (ที่อยู่ → พิกัด) และ Reverse Geocoding (พิกัด → ที่อยู่)
 *   พร้อมระบบแคช 3 ชั้น: RAM Cache → Sheet Cache → Google Maps API
 *   รองรับการดึงข้อมูลจังหวัด/อำเภอจากพิกัด เพื่อใช้ในระบบ Enrichment
 * ===================================================
 *   v5.5.010 (2026-06-18) — CACHE HOTFIX + Q_REVIEW Post-Processor:
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
 *   v5.5.001 (2026-06-05) — RAM Cache + Batch hit_count:
 *     - [FIX] getFromSheetCache_: เพิ่ม RAM cache layer (_MAPS_SHEET_CACHE) ไม่อ่านชีตทุกครั้ง
 *     - [FIX] getFromSheetCache_: batch hit_count updates แทน setValue ทุกครั้ง
 *     - [FIX] clearMapsCache / saveToSheetCache_: invalidate RAM cache เมื่อข้อมูลเปลี่ยน
 *   v5.4.001 (2026-05-24) — Single Writer Pattern:
 *     - [REVIEW] clearMapsCache: ต้องตรวจสอบ bug — keys จาก sheet อาจไม่ตรงกับ CacheService keys
 *   v5.4.000 (2026-05-23):
 *     - [UPGRADE] Version bump to 5.4.000
 *   v5.2.010:
 *     - [UPGRADE] อัปเกรดระบบเป็น 5.2.010
 *   v5.2.009:
 *     - [FIX] clearMapsCache: ดึงรายชื่อ Cache Key จากชีตก่อนลบ เพื่อลบ CacheService ได้ถูกต้อง
 *   v5.2.003:
 *     - [FIX] geocodeAddress: Normalize address ก่อน Hash + break ใน if(OK)
 *     - [FIX] reverseGeocode: เพิ่ม .setRegion('TH') + Cache รองรับ province/district
 *     - [FIX] getRouteDistanceKm: guard routes + legs ก่อนใช้
 *     - [FIX] Sheet Cache: ใช้ MC_* constants แทน hardcode + คืน province/district
 * ===================================================
 * DEPENDENCIES:
 *   REQUIRES (Load Order):
 *     - 01_Config.gs          (SHEET.MAPS_CACHE, AI_CONFIG, APP_CONST)
 *     - 02_Schema.gs          (SCHEMA[SHEET.MAPS_CACHE])
 *     - 14_Utils.gs           (generateMd5Hash, isValidLatLng, parseLatLng)
 *     - 03_SetupSheets.gs     (logError, logInfo)
 *   CALLS (Invokes):
 *     - (Google Maps API via Maps.newGeocoder / Maps.newDirectionFinder)
 *   EXPORTS TO:
 *     - 08_GeoService.gs       (geocodeAddress, reverseGeocode)
 *     - 07_PlaceService.gs     (geocodeAddress — Geo enrichment)
 *     - 00_App.gs              (clearMapsCache — menu)
 *   SHEETS ACCESSED:
 *     - SHEET.MAPS_CACHE       (Read+Write: 3-layer cache, geocode/reverse results)
 * ===================================================
 * ARCHITECTURE:
 *   ┌─────────────────────────────────────────────────────────────┐
 *   │  15_GoogleMapsAPI.gs (Maps Service + Hybrid Cache)          │
 *   │  ├── geocodeAddress()   — Address → LatLng (3-layer cache) │
 *   │  │   ├── ชั้น 1: RAM Cache (CacheService)                    │
 *   │  │   ├── ชั้น 2: Sheet Cache (MAPS_CACHE)                   │
 *   │  │   └── ชั้น 3: Google Maps API + retry                    │
 *   │  ├── reverseGeocode()  — LatLng → Address (3-layer cache) │
 *   │  ├── getRouteDistanceKm() — Road distance between 2 points │
 *   │  ├── getFromSheetCache_()  — Read MAPS_CACHE               │
 *   │  ├── saveToSheetCache_()   — Write MAPS_CACHE              │
 *   │  └── clearMapsCache()      — Clear all cache layers        │
 *   │      └── [V5.5.008 P2 #10] calls _flushHitCounts_() BEFORE │
 *   │          clearing to persist _MAPS_SHEET_HIT_DIRTY →       │
 *   │          hit_count analytics (was lost on clear)           │
 *   └─────────────────────────────────────────────────────────────┘
 * ===================================================
 */

// ============================================================
// SECTION 1: SCHEMA Index สำหรับ MAPS_CACHE
// ============================================================

// MAPS_CACHE columns — ดู MAPS_CACHE_IDX ใน 01_Config.gs
// [FIX v5.4.003] MC_* constants ถูกแทนที่ด้วย MAPS_CACHE_IDX.*
// MC_KEY  → MAPS_CACHE_IDX.KEY  (0)
// MC_LAT  → MAPS_CACHE_IDX.LAT  (2)
// MC_LNG  → MAPS_CACHE_IDX.LNG  (3)
// MC_ADDR → MAPS_CACHE_IDX.ADDR (4)
// MC_HIT  → MAPS_CACHE_IDX.HIT  (7)
// MC_PROV → MAPS_CACHE_IDX.PROV_NAME (8)
// MC_DIST → MAPS_CACHE_IDX.DIST_NAME (9)

// [FIX v5.5.001] RAM Cache Layer — ไม่อ่าน MAPS_CACHE sheet ทุกครั้ง
let _MAPS_SHEET_CACHE = null;       // Map: cacheKey → {rowIdx, lat, lng, resolvedAddr, province, district, hitCount}
let _MAPS_SHEET_HIT_DIRTY = null;   // Map: cacheKey → pending hit_count increment

/**
 * _loadSheetCache_ — โหลด MAPS_CACHE sheet ลง _MAPS_SHEET_CACHE ทั้งหมด (ครั้งเดียว)
 * [NEW v5.5.001]
 */
function _loadSheetCache_() {
  if (_MAPS_SHEET_CACHE !== null) return; // โหลดแล้ว ข้าม

  // [FIX B6 v5.5.002] กำหนดค่า Map ก่อน try — ถ้า sheet read พัง จะได้มี empty Map เป็น fallback
  _MAPS_SHEET_CACHE = new Map();
  _MAPS_SHEET_HIT_DIRTY = new Map();

  try {
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET.MAPS_CACHE);

  if (!sheet || sheet.getLastRow() < 2) return;

  const totalCols = SCHEMA[SHEET.MAPS_CACHE].length;
  const data      = sheet.getRange(2, 1, sheet.getLastRow() - 1, totalCols).getValues();

  for (let i = 0; i < data.length; i++) {
    const key = String(data[i][MAPS_CACHE_IDX.KEY]).trim();
    if (!key) continue;
    _MAPS_SHEET_CACHE.set(key, {
      rowIdx:       i,
      lat:          Number(data[i][MAPS_CACHE_IDX.LAT])  || 0,
      lng:          Number(data[i][MAPS_CACHE_IDX.LNG])  || 0,
      resolvedAddr: String(data[i][MAPS_CACHE_IDX.ADDR]) || '',
      province:     String(data[i][MAPS_CACHE_IDX.PROV_NAME]) || '',
      district:     String(data[i][MAPS_CACHE_IDX.DIST_NAME]) || '',
      hitCount:     Number(data[i][MAPS_CACHE_IDX.HIT] || 0),
    });
  }
  } catch (e) {
    logError('MapsAPI', '_loadSheetCache_ ล้มเหลว: ' + e.message, e);
    // _MAPS_SHEET_CACHE เป็น empty Map — fallback ไปใช้ API โดยตรง
  }
}

/**
 * _flushHitCounts_ — เขียน hit_count ที่สะสมไว้ลงชีต (batch)
 * [FIX B1 v5.5.002] ใช้ range read+write 1 ครั้ง แทน N× setValue
 */
function _flushHitCounts_() {
  if (!_MAPS_SHEET_HIT_DIRTY || _MAPS_SHEET_HIT_DIRTY.size === 0) return;
  if (!_MAPS_SHEET_CACHE || _MAPS_SHEET_CACHE.size === 0) return;

  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET.MAPS_CACHE);
  if (!sheet) return;

  const hitCol    = MAPS_CACHE_IDX.HIT + 1;

  // [FIX B1] Batch approach: อ่าน hit column range → update in RAM → setValues 1 ครั้ง
  const rowNumbers = Array.from(_MAPS_SHEET_HIT_DIRTY.keys())
    .map(k => _MAPS_SHEET_CACHE.get(k))
    .filter(e => e != null)
    .map(e => e.rowIdx + 2);

  if (rowNumbers.length === 0) { _MAPS_SHEET_HIT_DIRTY.clear(); return; }

  // [FIX B3 v5.5.002] ใช้ reduce() แทน Math.min/max(...spread) — ป้องกัน stack overflow เมื่อ MAPS_CACHE ใหญ่
  const minRow = rowNumbers.reduce((a, b) => a < b ? a : b);
  const maxRow = rowNumbers.reduce((a, b) => a > b ? a : b);

  const range = sheet.getRange(minRow, hitCol, maxRow - minRow + 1, 1);
  const vals  = range.getValues(); // 1 read

  _MAPS_SHEET_HIT_DIRTY.forEach((increment, cacheKey) => {
    const entry = _MAPS_SHEET_CACHE.get(cacheKey);
    if (!entry) return;
    const offsetRow = entry.rowIdx + 2 - minRow;
    if (offsetRow >= 0 && offsetRow < vals.length) {
      vals[offsetRow][0] = entry.hitCount;
    }
  });

  range.setValues(vals); // 1 write
  _MAPS_SHEET_HIT_DIRTY.clear();
}

// ============================================================
// SECTION 2: 3-Layer Cache Pattern — Generic Helper
// [REF-016] Extracted common RAM→Sheet→API pattern
// ============================================================

/**
 * cachedGeoLookup_ — [REF-016] Generic 3-layer cache lookup for geocoding operations
 * Implements: RAM Cache → Sheet Cache → API Call with Retry → Save to both caches
 * @param {string} cacheKey - Cache key for RAM + Sheet lookup
 * @param {string} inputAddr - Original input string (for Sheet Cache storage)
 * @param {Function} apiCallFn - Function that returns result object on success, null on non-OK status
 *   (should throw on API exception to trigger retry)
 * @param {string} callerName - Name for logging (e.g. 'geocodeAddress')
 * @return {Object|null} Result object or null
 */
function cachedGeoLookup_(cacheKey, inputAddr, apiCallFn, callerName) {
  // [FIX B7/B8 v5.5.002] outer try-catch — cache read error must fallback to API, not crash
  try {
  // Layer 1: RAM Cache
  const ramCache  = CacheService.getScriptCache();
  const ramCached = ramCache.get(cacheKey);
  if (ramCached) {
    try { return JSON.parse(ramCached); } catch(e) { logDebug('MapsAPI', callerName + ' RAM cache parse error: ' + e.message); }
  }

  // Layer 2: Sheet Cache
  const sheetResult = getFromSheetCache_(cacheKey);
  if (sheetResult) {
    ramCache.put(cacheKey, JSON.stringify(sheetResult), AI_CONFIG.CACHE_TTL_SEC);
    return sheetResult;
  }

  // Layer 3: API Call with Retry
  let result  = null;
  let retries = 0;

  while (retries < APP_CONST.MAX_RETRIES) {
    try {
      result = apiCallFn();
      if (result) break; // Non-null = success (API returned OK status)
      // null = non-OK status → retry
      retries++;
      if (retries < APP_CONST.MAX_RETRIES) Utilities.sleep(1000 * retries);

    } catch (apiErr) {
      retries++;
      if (retries < APP_CONST.MAX_RETRIES) {
        Utilities.sleep(1000 * retries);
      } else {
        logError('MapsAPI', callerName + ' ล้มเหลว: ' + apiErr.message, apiErr);
      }
    }
  }

  if (result) {
    ramCache.put(cacheKey, JSON.stringify(result), AI_CONFIG.CACHE_TTL_SEC);
    saveToSheetCache_(cacheKey, inputAddr, result);
  }

  return result;

  } catch (e) {
    logError('MapsAPI', callerName + ' ล้มเหลว (outer): ' + e.message, e);
    return null;
  }
}

// ============================================================
// SECTION 2a: geocodeAddress — Address → LatLng
// [REF-016] Now a thin wrapper around cachedGeoLookup_
// ============================================================

/**
 * geocodeAddress — แปลงที่อยู่เป็นพิกัด GPS
 * [FIX v003] Normalize address ก่อน Hash
 * [FIX v003] break อยู่ใน if(OK) ป้องกัน break แม้ API ล้มเหลว
 * [REF-016] Refactored to use cachedGeoLookup_ — preserves all behavior
 */
function geocodeAddress(address) {
  if (!address || String(address).trim().length < 5) return null;

  // [FIX v003] Normalize ก่อน Hash → "บางนา กรุงเทพ" = "บางนา,กรุงเทพ"
  const normalizedAddr = String(address).trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
  const cacheKey = 'GEO_' + generateMd5Hash(normalizedAddr);

  return cachedGeoLookup_(cacheKey, String(address).trim(), function() {
    const geoResult = Maps.newGeocoder()
                          .setLanguage('th')
                          .setRegion('TH')
                          .geocode(String(address).trim());

    // [FIX v003] break อยู่ใน if(OK) → return result only if status OK
    if (geoResult.status === 'OK' && geoResult.results.length > 0) {
      const loc        = geoResult.results[0].geometry.location;
      const components = geoResult.results[0].address_components || [];
      return {
        lat:          loc.lat,
        lng:          loc.lng,
        resolvedAddr: geoResult.results[0].formatted_address || '',
        province:     extractAddrComponent_(components, 'administrative_area_level_1'),
        district:     extractAddrComponent_(components, 'administrative_area_level_2'),
      };
    }
    return null; // Non-OK status → will retry in cachedGeoLookup_
  }, 'geocodeAddress');
}

// ============================================================
// SECTION 2b: reverseGeocode — LatLng → Address
// [REF-016] Now a thin wrapper around cachedGeoLookup_
// ============================================================

/**
 * reverseGeocode — แปลงพิกัด GPS เป็นที่อยู่
 * [FIX v003] เพิ่ม .setRegion('TH')
 * [FIX v003] Cache schema รองรับ province/district
 * [REF-016] Refactored to use cachedGeoLookup_ — preserves all behavior
 */
function reverseGeocode(lat, lng) {
  if (!isValidLatLng(lat, lng)) return null;

  const cacheKey = 'RGEO_' + generateMd5Hash(`${lat},${lng}`);

  return cachedGeoLookup_(cacheKey, `${lat},${lng}`, function() {
    // [FIX v003] เพิ่ม .setRegion('TH') ป้องกัน format ต่างประเทศ
    const geoResult = Maps.newGeocoder()
                          .setLanguage('th')
                          .setRegion('TH')
                          .reverseGeocode(lat, lng);

    if (geoResult.status === 'OK' && geoResult.results.length > 0) {
      const components = geoResult.results[0].address_components || [];
      return {
        resolvedAddr: geoResult.results[0].formatted_address || '',
        province:     extractAddrComponent_(components, 'administrative_area_level_1'),
        district:     extractAddrComponent_(components, 'administrative_area_level_2'),
        lat:          lat,
        lng:          lng,
      };
    }
    return null; // Non-OK status → will retry in cachedGeoLookup_
  }, 'reverseGeocode');
}

/**
 * extractAddrComponent_ — ดึงค่าจาก Address Component
 */
function extractAddrComponent_(components, typeName) {
  const comp = components.find(c => c.types && c.types.includes(typeName));
  if (!comp) return '';
  // ใช้ long_name ก่อน fallback short_name
  return comp.long_name || comp.short_name || '';
}

// ============================================================
// SECTION 4: getRouteDistanceKm
// ============================================================

/**
 * getRouteDistanceKm — ระยะทางบนถนนจริง
 * [FIX v003] guard legs ก่อนใช้
 * [NOTE] ใช้ Maps Directions API Quota สูง — อย่ารันใน Loop
 */
function getRouteDistanceKm(originAddr, destAddr) {
  try {
    const directions = Maps.newDirectionFinder()
      .setOrigin(originAddr)
      .setDestination(destAddr)
      .setMode(Maps.DirectionFinder.Mode.DRIVING)
      .getDirections();

    if (directions.status !== 'OK') return -1;

    // [FIX v003] guard routes + legs ก่อนใช้
    const routes = directions.routes;
    if (!routes || routes.length === 0) return -1;

    const legs = routes[0].legs;
    if (!legs || legs.length === 0) return -1;

    const totalMeters = legs.reduce((sum, leg) => sum + (leg.distance.value || 0), 0);
    return Math.round(totalMeters / 100) / 10;

  } catch (err) {
    logError('MapsAPI', `getRouteDistanceKm ล้มเหลว: ${err.message}`, err);
    return -1;
  }
}

// ============================================================
// SECTION 5: Sheet Cache — Persistent Storage
// ============================================================

/**
 * getFromSheetCache_ — ดึงข้อมูลจาก MAPS_CACHE Sheet
 * [FIX v5.5.001] ใช้ RAM cache layer ไม่อ่านชีตทุกครั้ง
 * [FIX v5.5.001] batch hit_count updates แทน setValue ทุกครั้ง
 * [FIX v003] ใช้ MAPS_CACHE_IDX constants แทน hardcode index
 * [FIX v003] คืน province + district ด้วย
 */
function getFromSheetCache_(cacheKey) {
  _loadSheetCache_(); // โหลด RAM cache ถ้ายังไม่ได้โหลด

  const entry = _MAPS_SHEET_CACHE.get(cacheKey);
  if (!entry) return null;

  // [FIX v5.5.001] สะสม hit_count ใน memory แทน setValue ทุกครั้ง
  entry.hitCount++;
  _MAPS_SHEET_HIT_DIRTY.set(cacheKey, (_MAPS_SHEET_HIT_DIRTY.get(cacheKey) || 0) + 1);

  return {
    lat:          entry.lat,
    lng:          entry.lng,
    resolvedAddr: entry.resolvedAddr,
    province:     entry.province,
    district:     entry.district,
  };
}

/**
 * saveToSheetCache_ — บันทึกผลลง MAPS_CACHE Sheet
 * [FIX v5.5.001] flush dirty hit_counts ก่อนเขียน + update RAM cache
 * [FIX v003] เพิ่ม province + district ใน row
 */
function saveToSheetCache_(cacheKey, inputAddr, result) {
  try {
    const ss    = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(SHEET.MAPS_CACHE);
    if (!sheet) return;

    // [FIX v5.5.001] flush dirty hit_counts ก่อนเขียน row ใหม่
    _flushHitCounts_();

    // [FIX LAW-04 v5.4.003] ใช้ getRange+setValues แทน appendRow เพื่อความเสถียร
    const newRow = [[
      cacheKey,
      inputAddr,
      result.lat          || 0,
      result.lng          || 0,
      result.resolvedAddr || '',
      'maps_api',
      new Date(),
      1,
      result.province     || '',  // [FIX v003] col [8]
      result.district     || '',  // [FIX v003] col [9]
    ]];
    const lastRow = sheet.getLastRow();
    sheet.getRange(lastRow + 1, 1, 1, newRow[0].length).setValues(newRow);

    // [FIX v5.5.001] update RAM cache ด้วย row ใหม่
    if (_MAPS_SHEET_CACHE !== null) {
      _MAPS_SHEET_CACHE.set(cacheKey, {
        rowIdx:       lastRow - 1, // 0-based index (row 2 = index 0)
        lat:          result.lat          || 0,
        lng:          result.lng          || 0,
        resolvedAddr: result.resolvedAddr || '',
        province:     result.province     || '',
        district:     result.district     || '',
        hitCount:     1,
      });
    }
  } catch (err) {
    logError('MapsAPI', `saveToSheetCache_ ล้มเหลว: ${err.message}`, err);
  }
}

/**
 * clearMapsCache — ล้าง MAPS_CACHE Sheet และ RAM Cache ทั้งหมด
 * [FIX v5.5.001] invalidate RAM cache เมื่อล้างข้อมูล
 * [FIX v5.5.008 P2 #10] flush pending hit_count ก่อนล้าง เพื่อรักษา analytics
 *   เดิม null _MAPS_SHEET_HIT_DIRTY เลย → pending hit_count increments หายเงียบๆ
 *   ตอนนี้เรียก _flushHitCounts_() ก่อน เพื่อ persist ค่า hit_count ลงชีต
 *   แม้ว่าจะ clear cache อยู่ ก็ยังเก็บ analytics สะสมไว้ในชีตก่อนลบ
 */
function clearMapsCache() {
  // [FIX B3 v5.5.002] เพิ่ม try-catch — menu entry point ต้องมี error handling
  try {
  // [FIX v5.5.008 P2 #10] flush pending hit counts ก่อนล้าง — รักษา analytics
  //   ถ้าไม่ flush, hit_count ที่สะสมใน _MAPS_SHEET_HIT_DIRTY จะหายไปเงียบๆ
  //   flush ที่นี่จะ persist ค่า hit_count ลง MAPS_CACHE sheet ก่อนที่จะลบแถวทิ้ง
  //   (user อาจเลือกล้าง cache เพื่อ rebuild แต่ยังอยากเก็บ analytics สะสม)
  try {
    if (typeof _flushHitCounts_ === 'function') _flushHitCounts_();
  } catch (flushErr) {
    // ไม่บล็อกการ clear cache ถ้า flush ล้มเหลว
    logWarn('MapsAPI', '_flushHitCounts_ ล้มเหลวก่อน clearMapsCache: ' + flushErr.message);
  }

  // [FIX v5.5.001] invalidate RAM cache layer
  _MAPS_SHEET_CACHE = null;
  _MAPS_SHEET_HIT_DIRTY = null;

  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET.MAPS_CACHE);

  if (sheet && sheet.getLastRow() > 1) {
    // [FIX v5.2.009] ดึงรายชื่อ Cache Key ทั้งหมดจากชีตก่อนลบ เพื่อนำไปลบใน CacheService ได้ถูกต้อง
    const keys = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues().map(r => String(r[0] || '').trim()).filter(Boolean);
    if (keys.length > 0) {
      // ลบทีละ 200 keys เพื่อไม่ให้เกิน limit ของ CacheService.removeAll
      const cache = CacheService.getScriptCache();
      for (let i = 0; i < keys.length; i += 200) {
        cache.removeAll(keys.slice(i, i + 200));
      }
    }
    sheet.deleteRows(2, sheet.getLastRow() - 1);
  }

  logInfo('MapsAPI', 'ล้าง MAPS_CACHE เรียบร้อย (pending hit_count ถูก persist ก่อนล้าง)');

  } catch (e) {
    logError('MapsAPI', 'clearMapsCache ล้มเหลว: ' + e.message, e);
    safeUiAlert_('เกิดข้อผิดพลาดในการล้าง Cache: ' + e.message);
  }
}
