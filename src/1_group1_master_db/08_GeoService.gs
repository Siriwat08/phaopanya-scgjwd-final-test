/**
 * VERSION: 5.5.004
 * FILE: 08_GeoService.gs
 * LMDS V5.5 — Geo Point Master Service
 * ===================================================
 * PURPOSE:
 *   จัดการ Master Geo Point — ฐานข้อมูลพิกัด GPS ที่ตรวจสอบแล้ว
 * ===================================================
 *   v5.5.004 (2026-06-15) — full sync cycle:
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
 *   CALLS (Invokes):
 *     - haversineDistanceM() → 14_Utils
 *     - generateShortId() → 14_Utils
 *     - lookupPlaceAdminById_() → 07_PlaceService
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
 */
function invalidateGeoCache_() {
  invalidateChunkedCache_('M_GEO_ALL', function() { _GLOBAL_GEO_POINTS_CACHE = null; });
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
