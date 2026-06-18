/**
 * VERSION: 5.5.008
 * FILE: 09_DestinationService.gs
 * LMDS V5.5 — Destination Master Service
 * ===================================================
 * PURPOSE:
 *   จัดการ Master Destination — จับคู่ Person+Place+Geo เป็นจุดหมายปลายทาง
 * ===================================================
 *   v5.5.008 (2026-06-18) — CACHE CLEANUP (P2):
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
 *   v003 (Round 1 — Critical Fixes):
 *     - [FIX] resolveDestination: && → || (Trinity ต้องครบ 3)
 *     - [FIX] loadAllDestinations_: filter ARCHIVED + MERGED
 *     - [FIX] updateDestinationStats: โหลดเฉพาะ dest_id + DEST_IDX + guard
 *     - [FIX] Query functions: !== ARCHIVED → === ACTIVE
 *     - [FIX] loadAllDestinations_: เพิ่ม route_label ใน map
 *     - [FIX] createDestination: deliveryDate instanceof Date check
 *     - [FIX] createDestination: Number() validate lat/lng
 * ===================================================
 * DEPENDENCIES:
 *   REQUIRES (Load Order):
 *     - 01_Config (SHEET.M_DESTINATION, DEST_IDX.*, AI_CONFIG.CACHE_TTL_SEC, APP_CONST.*)
 *     - 02_Schema (SCHEMA)
 *   CALLS (Invokes):
 *     - generateShortId() → 14_Utils
 *     - logDebug/logWarn/logError() → 03_SetupSheets
 *   EXPORTS TO:
 *     - 10_MatchEngine (resolveDestination, createDestination, updateDestinationStats, loadAllDestinations_)
 *     - 17_SearchService (getDestsByPersonId, getDestsByPersonAndPlace, getDestsByPlaceId)
 *     - 21_AliasService (destination lookups)
 *   SHEETS ACCESSED:
 *     - SHEET.M_DESTINATION (Read+Write: destination master data)
 * ===================================================
 * ARCHITECTURE:
 *   ┌─────────────────────────────────────────────────┐
 *   │           Destination Master Hub                 │
 *   ├─────────────────────────────────────────────────┤
 *   │  resolveDestination                              │
 *   │    └─► Trinity check: personId+placeId+geoId     │
 *   │  createDestination                               │
 *   │  updateDestinationStats                          │
 *   │  Query Helpers:                                  │
 *   │    ├─► getDestsByPersonId                        │
 *   │    ├─► getDestsByPlaceId                         │
 *   │    ├─► getDestsByPersonAndPlace                  │
 *   │    └─► getDominantDestByGeo                      │
 *   │  Data Loader:                                    │
 *   │    └─► loadAllDestinations_ (cached)             │
 *   └─────────────────────────────────────────────────┘
 * ===================================================
 */

// ============================================================
// SECTION 1: resolveDestination
// ============================================================

/**
 * resolveDestination — ค้นหา Destination จาก Trinity
 * [FIX v003] && → || : ถ้าขาดตัวใดตัวหนึ่งให้ reject ทันที
 *            เดิม: !personId && !placeId && !geoId (ต้องว่างทั้ง 3)
 *            ถูก:  !personId || !placeId || !geoId (ขาดตัวเดียวก็ reject)
 */
function resolveDestination(personId, placeId, geoId) {
  // [FIX v003] Trinity ต้องครบ 3 จึงจะค้นหาได้
  if (!personId || !placeId || !geoId) {
    return { destId: null, status: 'INSUFFICIENT', isNew: false };
  }

  // Normalize กัน null/'' ปน
  const pId = String(personId || '').trim();
  const plId = String(placeId  || '').trim();
  const gId  = String(geoId    || '').trim();

  if (!pId || !plId || !gId) {
    return { destId: null, status: 'INSUFFICIENT', isNew: false };
  }

  const allDests = loadAllDestinations_();

  // Exact Match ด้วย Trinity ทั้ง 3
  const exactMatch = allDests.find(d =>
    d.personId === pId && d.placeId === plId && d.geoId === gId
  );
  if (exactMatch) {
    return { destId: exactMatch.destId, status: 'FOUND', isNew: false };
  }

  // Partial Match (Person + Geo) — fallback กรณียังไม่รู้ Place
  const partialMatch = allDests.find(d =>
    d.personId === pId && d.geoId === gId
  );
  if (partialMatch) {
    return { destId: partialMatch.destId, status: 'PARTIAL_MATCH', isNew: false };
  }

  return { destId: null, status: 'NOT_FOUND', isNew: false };
}

// ============================================================
// SECTION 2: CRUD
// ============================================================

/**
 * createDestination — สร้าง Destination ใหม่ (Trinity)
 * [FIX v003] deliveryDate instanceof Date check
 * [FIX v003] Number() validate lat/lng
 */
function createDestination(personId, placeId, geoId, lat, lng, deliveryDate) {
  try {
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET.M_DESTINATION);
  const now   = new Date();
  const newId = generateShortId('D');

  // [FIX v003] Validate lat/lng เป็น Number
  const numLat = Number(lat);
  const numLng = Number(lng);
  // [FIX v5.5.001] เก็บ '' แทน 0,0 เมื่อพิกัดไม่ถูกต้อง — 0,0 เป็นพิกัดที่ทำให้เสียใจ
  const safeLat = !isNaN(numLat) && numLat !== 0 ? numLat : '';
  const safeLng = !isNaN(numLng) && numLng !== 0 ? numLng : '';

  // [FIX v003] deliveryDate instanceof Date check แทน || now
  let safeDate = now;
  if (deliveryDate instanceof Date && !isNaN(deliveryDate.getTime())) {
    safeDate = deliveryDate;
  } else if (deliveryDate) {
    const parsed = new Date(deliveryDate);
    safeDate = !isNaN(parsed.getTime()) ? parsed : now;
  }

  const newRow = [
    newId,
    personId  || '',
    placeId   || '',
    geoId     || '',
    safeLat,
    safeLng,
    '',
    safeDate,
    1,
    now,
    APP_CONST.STATUS_ACTIVE,
  ];

  // [FIX-05 v5.4.003] ใช้ getRange+setValues แทน appendRow เพื่อความเสถียร
  const lastRow = sheet.getLastRow();
  sheet.getRange(lastRow + 1, 1, 1, newRow.length).setValues([newRow]);
  invalidateDestCache_();
  logDebug('DestinationService',
    `createDestination: ${newId} P:${personId} PL:${placeId} G:${geoId}`);
  return newId;
  } catch (err) {
    // [FIX B3 v5.5.002] เพิ่ม try-catch ตาม Rule 12
    logError('DestinationService', `createDestination ล้มเหลว: ${err.message}`, err);
    return null;
  }
}

/**
 * updateDestinationStats
 * [FIX v003] โหลดเฉพาะ dest_id + ใช้ DEST_IDX + guard + const now
 * [FIX v5.4.002] เปลี่ยนจาก row-by-row setValue เป็น batch setValues (Performance)
 */
function updateDestinationStats(destId, deliveryDate) {
  if (!destId) return;
  try {
    const ss      = SpreadsheetApp.getActiveSpreadsheet();
    const sheet   = ss.getSheetByName(SHEET.M_DESTINATION);
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return;

    const idCol   = DEST_IDX.DEST_ID + 1;
    const idData  = sheet.getRange(2, idCol, lastRow - 1, 1).getValues();
    let targetRow = -1;

    for (let i = 0; i < idData.length; i++) {
      if (String(idData[i][0]).trim() === destId) {
        targetRow = i + 2; break;
      }
    }

    if (targetRow === -1) {
      logWarn('DestinationService', `updateDestinationStats: ไม่พบ destId ${destId}`);
      return;
    }

    // [FIX v5.4.002] Batch write — อ่าน 3 คอลัมน์ แก้ 3 คอลัมน์ ในครั้งเดียว
    const lastSeenCol    = DEST_IDX.LAST_SEEN      + 1;
    const usageCountCol  = DEST_IDX.USAGE_COUNT    + 1;
    const delivDateCol   = DEST_IDX.DELIVERY_DATE  + 1;

    const now = new Date();

    // สร้าง Array สำหรับ Batch Write (3 คอลัมน์ติดกัน: LAST_SEEN, USAGE_COUNT, DELIVERY_DATE)
    const minCol = Math.min(lastSeenCol, usageCountCol, delivDateCol);
    const maxCol = Math.max(lastSeenCol, usageCountCol, delivDateCol);
    const numCols = maxCol - minCol + 1;

    // [FIX v5.5.001] อ่านแถวปัจจุบันครั้งเดียว + ดึง usageCount จาก rowData แทน getValue() แยก
    const rowData = sheet.getRange(targetRow, minCol, 1, numCols).getValues()[0];
    const currUsageCount = Number(rowData[usageCountCol - minCol]) || 0;

    // แก้ไขค่าที่ต้องการ
    rowData[lastSeenCol - minCol]    = now;
    rowData[usageCountCol - minCol]  = currUsageCount + 1;

    if (deliveryDate) {
      const safeDate = deliveryDate instanceof Date ? deliveryDate : new Date(deliveryDate);
      if (!isNaN(safeDate.getTime())) {
        rowData[delivDateCol - minCol] = safeDate;
      }
    }

    // Batch Write ทีเดียว
    sheet.getRange(targetRow, minCol, 1, numCols).setValues([rowData]);

    invalidateDestCache_();

  } catch (err) {
    // [FIX LAW-13 v5.4.003] ส่ง err object เพื่อให้ stack trace เข้า SYS_LOG
    logError('DestinationService', `updateDestinationStats ล้มเหลว: ${err.message}`, err);
  }
}

// ============================================================
// SECTION 3: Query Functions
// ============================================================

/**
 * getDestsByPersonId
 * [FIX v003] !== ARCHIVED → === ACTIVE
 */
function getDestsByPersonId(personId) {
  const allDests = loadAllDestinations_();
  return allDests
    .filter(d => d.personId === personId && d.status === APP_CONST.STATUS_ACTIVE)
    .sort((a, b) => (b.usageCount || 0) - (a.usageCount || 0));
}

function getDestsByPlaceId(placeId) {
  const allDests = loadAllDestinations_();
  return allDests
    .filter(d => d.placeId === placeId && d.status === APP_CONST.STATUS_ACTIVE)
    .sort((a, b) => (b.usageCount || 0) - (a.usageCount || 0));
}

function getDestsByPersonAndPlace(personId, placeId) {
  const allDests = loadAllDestinations_();
  return allDests
    .filter(d =>
      d.personId === personId &&
      d.placeId  === placeId  &&
      d.status   === APP_CONST.STATUS_ACTIVE
    )
    .sort((a, b) => (b.usageCount || 0) - (a.usageCount || 0));
}

function getDominantDestByGeo(geoId) {
  const allDests  = loadAllDestinations_();
  const filtered  = allDests
    .filter(d => d.geoId === geoId && d.status === APP_CONST.STATUS_ACTIVE)
    .sort((a, b) => (b.usageCount || 0) - (a.usageCount || 0));
  return filtered.length > 0 ? filtered[0] : null;
}

// ============================================================
// SECTION 4: Data Loaders
// ============================================================

function loadAllDestinations_() {
  const cacheKey = 'M_DEST_ALL';
  const cache    = CacheService.getScriptCache();
  // [PERF-004] [REF-010] ใช้ centralized loadChunkedCache_ จาก 14_Utils.gs
  var cachedData = loadChunkedCache_(cache, cacheKey);
  if (cachedData) return cachedData;

  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET.M_DESTINATION);
  if (!sheet || sheet.getLastRow() < 2) return [];

  // [FIX v5.5.001] Math.min guard: ป้องกัน Range error ถ้า sheet มีคอลัมน์น้อยกว่า SCHEMA
  const sheetCols = sheet.getLastColumn();
  const schemaCols = SCHEMA[SHEET.M_DESTINATION].length;
  const colsToRead = Math.min(sheetCols, schemaCols);
  const rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, colsToRead).getValues();

  const result = rows
    .filter(r => r[DEST_IDX.DEST_ID])
    // [FIX v003] filter ก่อน map — กรอง ARCHIVED และ MERGED
    .filter(r => r[DEST_IDX.STATUS] !== APP_CONST.STATUS_ARCHIVED &&
                 r[DEST_IDX.STATUS] !== APP_CONST.STATUS_MERGED)
    .map(r => ({
      destId:     String(r[DEST_IDX.DEST_ID]      || ''),
      personId:   String(r[DEST_IDX.PERSON_ID]    || ''),
      placeId:    String(r[DEST_IDX.PLACE_ID]     || ''),
      geoId:      String(r[DEST_IDX.GEO_ID]       || ''),
      lat:        Number(r[DEST_IDX.LAT]           || 0),
      lng:        Number(r[DEST_IDX.LNG]           || 0),
      routeLabel: String(r[DEST_IDX.ROUTE_LABEL]  || ''),  // [FIX v003] เพิ่ม
      usageCount: Number(r[DEST_IDX.USAGE_COUNT]  || 0),
      lastSeen:   r[DEST_IDX.LAST_SEEN]            || '',
      status:     String(r[DEST_IDX.STATUS]        || ''),
    }));

  // [PERF-004] [REF-010] ใช้ centralized saveChunkedCache_ จาก 14_Utils.gs
  saveChunkedCache_(cache, cacheKey, result);
  return result;
}

/**
 * batchUpdateDestinationStats_ — [PERF-001] Batch stats update สำหรับ Destination
 * [REF-009 NOTE] Destination is a special case with extra deliveryDate + multi-count logic,
 * so it does NOT use batchUpdateEntityStats_() like Person/Place/Geo.
 * The Person/Place/Geo batch update pattern is deduplicated via batchUpdateEntityStats_ in 14_Utils.gs.
 * อ่านข้อมูลทั้ง column 1 ครั้ง แก้ใน RAM ทั้งหมด แล้วเขียนทีเดียว
 * ลดจาก N × 2 API calls เหลือ 2 API calls (getValues + setValues)
 * @param {Array} destStatsQueue - Array of {destId, deliveryDate} objects
 */
function batchUpdateDestinationStats_(destStatsQueue) {
  if (!destStatsQueue || destStatsQueue.length === 0) return;
  try {
    var ss      = SpreadsheetApp.getActiveSpreadsheet();
    var sheet   = ss.getSheetByName(SHEET.M_DESTINATION);
    var lastRow = sheet.getLastRow();
    if (lastRow < 2) return;

    var idCol         = DEST_IDX.DEST_ID        + 1;
    var lastSeenCol   = DEST_IDX.LAST_SEEN      + 1;
    var usageCountCol = DEST_IDX.USAGE_COUNT    + 1;
    var delivDateCol  = DEST_IDX.DELIVERY_DATE  + 1;
    var minCol = Math.min(idCol, lastSeenCol, usageCountCol, delivDateCol);
    var maxCol = Math.max(idCol, lastSeenCol, usageCountCol, delivDateCol);
    var numCols = maxCol - minCol + 1;

    var allData = sheet.getRange(2, minCol, lastRow - 1, numCols).getValues();

    // Build a map from destId to {index, deliveryDate} for efficient lookup
    var destIdMap = {};
    destStatsQueue.forEach(function(item) {
      var did = String(item.destId || '').trim();
      if (did) {
        // Keep the latest deliveryDate per destId
        if (!destIdMap[did]) {
          destIdMap[did] = { count: 0, deliveryDate: item.deliveryDate };
        }
        destIdMap[did].count++;
      }
    });

    var now = new Date();
    var updated = 0;

    for (var i = 0; i < allData.length; i++) {
      var did = String(allData[i][idCol - minCol] || '').trim();
      if (destIdMap[did]) {
        allData[i][lastSeenCol - minCol] = now;
        var currCount = Number(allData[i][usageCountCol - minCol]) || 0;
        allData[i][usageCountCol - minCol] = currCount + destIdMap[did].count;
        if (destIdMap[did].deliveryDate) {
          var safeDate = destIdMap[did].deliveryDate instanceof Date
            ? destIdMap[did].deliveryDate
            : new Date(destIdMap[did].deliveryDate);
          if (!isNaN(safeDate.getTime())) {
            allData[i][delivDateCol - minCol] = safeDate;
          }
        }
        updated++;
        delete destIdMap[did]; // Prevent double-update
      }
    }

    if (updated > 0) {
      sheet.getRange(2, minCol, lastRow - 1, numCols).setValues(allData);
      invalidateDestCache_();
    }
  } catch (err) {
    logError('DestinationService', 'batchUpdateDestinationStats_ ล้มเหลว: ' + err.message, err);
  }
}

/**
 * invalidateDestCache_ — [REF-011] Uses centralized invalidateChunkedCache_
 */
function invalidateDestCache_() {
  invalidateChunkedCache_('M_DEST_ALL', null);
}

/**
 * getDestinationsByPerson — [ADD v5.1.001] ดึง Destination ทั้งหมดของบุคคล
 * @public สาธารณะ convenience wrapper สำหรับ external caller
 * @deprecated [REF-020] Use getDestsByPersonId() instead. This pass-through wrapper
 *   adds no logic and will be removed in a future version.
 * @param {string} personId
 */
function getDestinationsByPerson(personId) {
  return getDestsByPersonId(personId);
}

/**
 * getDestinationsByPlace — [ADD v5.1.001] ดึง Destination ทั้งหมดของสถานที่
 * @public สาธารณะ convenience wrapper สำหรับ external caller
 * @deprecated [REF-020] Use getDestsByPlaceId() instead. This pass-through wrapper
 *   adds no logic and will be removed in a future version.
 * @param {string} placeId
 */
function getDestinationsByPlace(placeId) {
  return getDestsByPlaceId(placeId);
}
