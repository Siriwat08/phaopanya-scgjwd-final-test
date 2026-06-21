/**
 * VERSION: 5.5.020
 * FILE: 11_TransactionService.gs
 * LMDS V5.5 — FACT_DELIVERY Transaction Service
 * ===================================================
 * PURPOSE:
 *   จัดการตาราง FACT_DELIVERY — บันทึกประวัติการจัดส่งทั้งหมด
 *   เป็น Single Source of Truth สำหรับประวัติขนส่ง
 * ===================================================
 * ===================================================
 * CHANGELOG: See /docs/CHANGELOG.md for full history.
 *   Latest 3 versions:
 *     v5.5.020 (2026-06-22) — REFACTOR_CYCLE6_RESIDUAL (REF-005 cleanup + REF-011 pilot)
 *     v5.5.019 (2026-06-22) — REFACTOR_CYCLE6 (12 issues — REF-001 to REF-012)
 *     v5.5.018 (2026-06-21) — REVIEW15 CLEAN CODE FIX (14 issues)
 * ===================================================
 * DEPENDENCIES:
 *   REQUIRES (Load Order):
 *     - 01_Config (SHEET.FACT_DELIVERY, SHEET.SOURCE, FACT_IDX.*, APP_CONST.*)
 *     - 02_Schema (SCHEMA)
 *     - 08_GeoService (loadAllGeos_)
 *     - 14_Utils (generateShortId, normalizeInvoiceNo)
 *     - 06_PersonService (loadAllPersons_)
 *     - 07_PlaceService (loadAllPlaces_)
 *   CALLS (Invokes):
 *     - loadAllGeos_() → 08_GeoService
 *     - generateShortId() → 14_Utils
 *     - normalizeInvoiceNo() → 14_Utils
 *     - logError() → 03_SetupSheets
 *   EXPORTS TO:
 *     - 10_MatchEngine (upsertFactDelivery)
 *     - 12_ReviewService (upsertFactDelivery)
 *     - 08_GeoService (invalidateGeoLatLngCache_ — NEW V5.5.007 P1 #5; called
 *       from invalidateGeoCache_ to clear _GEO_LATLNG_RAM_CACHE so new
 *       createGeoPoint results are visible to getGeoLatLng_ on next lookup)
 *   SHEETS ACCESSED:
 *     - SHEET.FACT_DELIVERY (Read+Write: delivery transaction records)
 *     - SHEET.SOURCE (Read: source data reference)
 * ===================================================
 * ARCHITECTURE:
 *   Transaction Writer
 *   ┌──────────────────────────────────┐
 *   │  upsertFactDelivery              │
 *   │  ├─ INSERT: new row with TX ID   │
 *   │  └─ UPDATE: merge into existing  │
 *   │  findFactRowByInvoice_           │
 *   │  └─ TextFinder batch lookup      │
 *   │  getGeoLatLng_                   │
 *   │  └─ fetch lat/lng from Geo cache │
 *   │  formatTimeValue_                │
 *   │  └─ time formatting helper       │
 *   │  invalidateFactInvoiceCache_()   │
 *   │  └─ clears _FACT_INVOICE_RAM_CACHE│
 *   │  invalidateGeoLatLngCache_()     │
 *   │  └─ NEW V5.5.007 P1 #5: clears   │
 *   │     _GEO_LATLNG_RAM_CACHE; called│
 *   │     by 08_GeoService.invalidateGeo│
 *   │     Cache_ on geo point creation │
 *   └──────────────────────────────────┘
 * ===================================================
 */

// ============================================================
// SECTION 1: upsertFactDelivery
// ============================================================

/**
 * upsertFactDelivery — สร้างหรืออัปเดต FACT_DELIVERY
 * [FIX v003] เรียก getGeoLatLng_ ครั้งเดียว + fallback to rawLat/rawLng
 */
function upsertFactDelivery(srcObj, personId, placeId, geoId, destId, decision) {
  try {
  const ss         = SpreadsheetApp.getActiveSpreadsheet();
  const factSheet  = ss.getSheetByName(SHEET.FACT_DELIVERY);
  if (!factSheet) {
    logError('TransactionService', `ไม่พบชีต ${SHEET.FACT_DELIVERY}`, new Error('SHEET_NOT_FOUND'));
    return null;
  }

  const existingRow = findFactRowByInvoice_(factSheet, srcObj.invoiceNo);
  const now         = new Date();

  // [FIX v003] เรียก getGeoLatLng_ ครั้งเดียว แล้ว destructure
  // [FIX CRIT-001] เปลี่ยน initialization จาก 0 เป็น null — ป้องกันพิกัดถูกต้องถูกเขียนทับด้วย 0
  let resolvedLat = null;
  let resolvedLng = null;

  if (geoId) {
    const geoLL = getGeoLatLng_(geoId);
    if (geoLL) {
      resolvedLat = geoLL.lat;
      resolvedLng = geoLL.lng;
    }
  }

  // [FIX v003] fallback → rawLat/rawLng ถ้า getGeoLatLng_ คืน null
  // [FIX CRIT-001] เปลี่ยนเงื่อนไขจาก === 0 เป็น === null
  if (resolvedLat === null || resolvedLng === null) {
    if (srcObj.rawLat && srcObj.rawLng &&
        !isNaN(Number(srcObj.rawLat)) && !isNaN(Number(srcObj.rawLng))) {
      resolvedLat = Number(srcObj.rawLat);
      resolvedLng = Number(srcObj.rawLng);
    }
  }

  // แยก deliveryDate/deliveryTime
  let deliveryDateVal = '';
  let deliveryTimeVal = '';
  if (srcObj.deliveryTime) {
    deliveryTimeVal = formatTimeValue_(srcObj.deliveryTime);
  }

  if (srcObj.deliveryDate) {
    try {
      deliveryDateVal = new Date(srcObj.deliveryDate);
    } catch (e) {
      deliveryDateVal = srcObj.deliveryDate;
    }
  }

  if (existingRow > 0) {
    // --- UPDATE ---
    const rowRange = factSheet.getRange(existingRow, 1, 1,
                      SCHEMA[SHEET.FACT_DELIVERY].length);
    const rowData  = rowRange.getValues()[0];
    return factUpdateRow_(rowRange, rowData, personId, placeId, geoId, destId,
                          decision, resolvedLat, resolvedLng, now, srcObj);

  } else {
    // --- INSERT ---
    return factCreateRow_(srcObj, personId, placeId, geoId, destId, decision,
                          resolvedLat, resolvedLng, deliveryDateVal, deliveryTimeVal, now);
  }

  } catch (e) {
    // [FIX R13-05 REVIEW15] Rule 13: ส่ง e เพื่อรักษา stack trace ของ error จริง
    logError('TransactionService', 'upsertFactDelivery ล้มเหลว: ' + e.message, e);
    return null;
  }
}

// ============================================================
// SECTION 2: Helper Functions
// ============================================================

/**
 * factUpdateRow_ — handles the UPDATE path of upsertFactDelivery
 * Merges new values into existing row data, preserving non-null existing values
 * @param {GoogleAppsScript.Spreadsheet.Range} rowRange - the sheet range for the existing row
 * @param {Array} rowData - current row values
 * @param {string} personId
 * @param {string} placeId
 * @param {string} geoId
 * @param {string} destId
 * @param {Object} decision - { action, confidence, reason, evidence }
 * @param {number|null} resolvedLat
 * @param {number|null} resolvedLng
 * @param {Date} now
 * @return {{ txId: string, isNew: boolean, rowData: null }}
 */
function factUpdateRow_(rowRange, rowData, personId, placeId, geoId, destId, decision, resolvedLat, resolvedLng, now, srcObj) {
  // [FIX v5.5.001] ใช้ nullish coalescing logic แทน ||
  // เพื่อไม่ให้ค่าว่าง '' ถูกมองเป็น falsy แล้ว fallback ไปใช้ค่าเก่า
  rowData[FACT_IDX.PERSON_ID]    = personId  != null ? personId  : rowData[FACT_IDX.PERSON_ID];
  rowData[FACT_IDX.PLACE_ID]     = placeId   != null ? placeId   : rowData[FACT_IDX.PLACE_ID];
  rowData[FACT_IDX.GEO_ID]       = geoId     != null ? geoId     : rowData[FACT_IDX.GEO_ID];
  rowData[FACT_IDX.DEST_ID]      = destId    != null ? destId    : rowData[FACT_IDX.DEST_ID];
  // [FIX CRIT-001] ใช้ strict !== null เพื่อให้ null (ไม่มีพิกัด) รักษาค่าเดิม ไม่เขียนทับด้วย 0
  rowData[FACT_IDX.RESOLVED_LAT] = resolvedLat !== null ? resolvedLat : rowData[FACT_IDX.RESOLVED_LAT];
  rowData[FACT_IDX.RESOLVED_LNG] = resolvedLng !== null ? resolvedLng : rowData[FACT_IDX.RESOLVED_LNG];
  rowData[FACT_IDX.MATCH_STATUS] = decision.action  || rowData[FACT_IDX.MATCH_STATUS];
  rowData[FACT_IDX.MATCH_CONF]   = decision.confidence;
  rowData[FACT_IDX.MATCH_REASON] = decision.reason  || '';
  rowData[FACT_IDX.MATCH_ACTION] = decision.action  || '';
  rowData[FACT_IDX.UPDATED_AT]   = now;
  rowData[FACT_IDX.EVIDENCE]     = decision.evidence || rowData[FACT_IDX.EVIDENCE] || '';
  // [FIX CRIT-001] เขียน DRIVER_VERIFIED ใน UPDATE path — merge mode (ไม่เขียนทับค่าเดิม)
  if (srcObj && srcObj.driverVerifiedName) {
    rowData[FACT_IDX.DRIVER_VERIFIED_NAME] = srcObj.driverVerifiedName;
  }
  if (srcObj && srcObj.driverVerifiedAddr) {
    rowData[FACT_IDX.DRIVER_VERIFIED_ADDR] = srcObj.driverVerifiedAddr;
  }

  rowRange.setValues([rowData]);
  return { txId: rowData[FACT_IDX.TX_ID], isNew: false, rowData: null };
}

/**
 * factCreateRow_ — handles the INSERT path of upsertFactDelivery
 * Builds a new FACT_DELIVERY row from source object and resolved IDs
 * @param {Object} srcObj - source data object
 * @param {string} personId
 * @param {string} placeId
 * @param {string} geoId
 * @param {string} destId
 * @param {Object} decision - { action, confidence, reason, evidence }
 * @param {number|null} resolvedLat
 * @param {number|null} resolvedLng
 * @param {*} deliveryDateVal - parsed delivery date
 * @param {string} deliveryTimeVal - formatted delivery time
 * @param {Date} now
 * @return {{ txId: string, isNew: boolean, rowData: Array }}
 */
function factCreateRow_(srcObj, personId, placeId, geoId, destId, decision, resolvedLat, resolvedLng, deliveryDateVal, deliveryTimeVal, now) {
  const txId   = generateShortId('TX');
  const newRow = new Array(SCHEMA[SHEET.FACT_DELIVERY].length).fill('');

  newRow[FACT_IDX.TX_ID]          = txId;
  newRow[FACT_IDX.SOURCE_SHEET]   = srcObj.sourceSheet   || SHEET.SOURCE;
  newRow[FACT_IDX.SOURCE_ROW]     = srcObj.sourceRow     || 0;
  newRow[FACT_IDX.SOURCE_REC_ID]  = srcObj.sourceId      || '';
  newRow[FACT_IDX.DELIVERY_DATE]  = deliveryDateVal;
  newRow[FACT_IDX.DELIVERY_TIME]  = deliveryTimeVal;
  newRow[FACT_IDX.INVOICE_NO]     = srcObj.invoiceNo     || '';
  newRow[FACT_IDX.SHIPMENT_NO]    = srcObj.shipmentNo    || '';
  newRow[FACT_IDX.DRIVER_NAME]    = srcObj.driverName    || '';
  newRow[FACT_IDX.TRUCK_LICENSE]  = srcObj.truckLicense  || '';
  newRow[FACT_IDX.SOLD_TO_CODE]   = srcObj.soldToCode    || '';
  newRow[FACT_IDX.SOLD_TO_NAME]   = srcObj.soldToName    || '';
  newRow[FACT_IDX.SHIP_TO_NAME]   = srcObj.rawPersonName || '';
  newRow[FACT_IDX.SHIP_TO_ADDR]   = srcObj.scgAddress    || ''; // [FIX v5.2.003] ใช้ต้นฉบับจาก SCG (คอลัมน์ 18)
  newRow[FACT_IDX.GEO_RESOLVED_ADDR] = srcObj.resolvedAddr || ''; // [FIX v5.2.003] ใช้ที่อยู่ที่ระบบหาได้ (คอลัมน์ 24)
  newRow[FACT_IDX.PERSON_ID]      = personId             || '';
  newRow[FACT_IDX.PLACE_ID]       = placeId              || '';
  newRow[FACT_IDX.GEO_ID]         = geoId                || '';
  newRow[FACT_IDX.DEST_ID]        = destId               || '';
  newRow[FACT_IDX.WAREHOUSE]      = srcObj.warehouse     || '';
  newRow[FACT_IDX.RAW_LAT]        = srcObj.rawLat        || 0;
  newRow[FACT_IDX.RAW_LNG]        = srcObj.rawLng        || 0;
  newRow[FACT_IDX.MATCH_STATUS]   = decision.action      || '';
  newRow[FACT_IDX.MATCH_CONF]     = decision.confidence  || 0;
  newRow[FACT_IDX.MATCH_REASON]   = decision.reason      || '';
  newRow[FACT_IDX.MATCH_ACTION]   = decision.action      || '';
  // [FIX CRIT-001] INSERT path: เขียน 0 เมื่อไม่มีพิกัด (รักษา Schema contract ที่ชีตไม่ควรมี null)
  newRow[FACT_IDX.RESOLVED_LAT]   = resolvedLat !== null ? resolvedLat : 0;
  newRow[FACT_IDX.RESOLVED_LNG]   = resolvedLng !== null ? resolvedLng : 0;
  newRow[FACT_IDX.CREATED_AT]     = now;
  newRow[FACT_IDX.UPDATED_AT]     = now;
  newRow[FACT_IDX.RECORD_STATUS]  = APP_CONST.STATUS_ACTIVE;
  newRow[FACT_IDX.EVIDENCE]       = decision.evidence || '';
  // [ADD v5.5.014] เก็บชื่อจริงที่คนขับ/ผู้ดูแลยืนยัน — จาก Source sheet col 38-39
  newRow[FACT_IDX.DRIVER_VERIFIED_NAME] = srcObj.driverVerifiedName || '';
  newRow[FACT_IDX.DRIVER_VERIFIED_ADDR] = srcObj.driverVerifiedAddr || '';

  // [RULE 4] คืนค่าแถวเพื่อให้ caller ทำ batch write แทน appendRow ในลูป
  return { txId: txId, isNew: true, rowData: newRow };
}

// [FIX B5 v5.5.002] RAM cache สำหรับ invoice lookup — ลด O(N²) เป็น O(N)
let _FACT_INVOICE_RAM_CACHE = null; // Map: normalizedInvoice → rowIndex (1-based)

/**
 * findFactRowByInvoice_ — ค้นหาแถวใน FACT_DELIVERY จาก Invoice No
 * [FIX B5 v5.5.002] ใช้ RAM cache แทนการอ่านชีตทุกครั้ง
 * @return {number} หมายเลขแถว (1-based) หรือ -1 ถ้าไม่พบ
 */
function findFactRowByInvoice_(factSheet, invoiceNo) {
  if (!invoiceNo || factSheet.getLastRow() < 2) return -1;

  const targetInvoice = normalizeInvoiceNo(invoiceNo);

  // [FIX B5] สร้าง RAM cache ถ้ายังไม่มี
  if (!_FACT_INVOICE_RAM_CACHE) {
    _FACT_INVOICE_RAM_CACHE = new Map();
    const invoiceCol = FACT_IDX.INVOICE_NO + 1;
    const lastRow    = factSheet.getLastRow() - 1;
    const data       = factSheet.getRange(2, invoiceCol, lastRow, 1).getValues();
    for (let i = 0; i < data.length; i++) {
      const norm = normalizeInvoiceNo(data[i][0]);
      if (norm) _FACT_INVOICE_RAM_CACHE.set(norm, i + 2);
    }
  }

  return _FACT_INVOICE_RAM_CACHE.has(targetInvoice) ? _FACT_INVOICE_RAM_CACHE.get(targetInvoice) : -1;
}

/**
 * getGeoLatLng_ — ดึง lat/lng จาก M_GEO_POINT
 * [FIX v003] คืน null แทน {lat:0,lng:0} เมื่อไม่เจอ
 *            ป้องกัน Marker ตกทะเล (0,0)
 * @param {string} geoId
 * @return {{ lat: number, lng: number } | null}
 */
// [FIX v5.5.001] RAM cache สำหรับ geos ภายใน execution เดียว
// ป้องกัน loadAllGeos_() อ่านชีต M_GEO_POINT ทุกครั้ง
let _GEO_LATLNG_RAM_CACHE = null;

function getGeoLatLng_(geoId) {
  if (!geoId) return null;

  // [FIX v5.5.001] ใช้ RAM cache แทนการเรียก loadAllGeos_() ทุกครั้ง
  if (!_GEO_LATLNG_RAM_CACHE) {
    const allGeos = loadAllGeos_();
    _GEO_LATLNG_RAM_CACHE = {};
    allGeos.forEach(g => {
      if (g.geoId) _GEO_LATLNG_RAM_CACHE[g.geoId] = { lat: g.lat, lng: g.lng };
    });
  }

  const geo = _GEO_LATLNG_RAM_CACHE[geoId];

  // [FIX v003] คืน null ถ้าไม่เจอ หรือ lat/lng = 0
  if (!geo || geo.lat === 0 || geo.lng === 0) return null;
  return { lat: geo.lat, lng: geo.lng };
}

/**
 * invalidateFactInvoiceCache_ — [FIX CRIT-003] ล้าง RAM cache ของ FACT invoice lookup
 * ต้องเรียกหลังจาก flushBatches_ เขียน FACT ใหม่ เพื่อให้ cache ถูก rebuild ใน lookup ถัดไป
 */
function invalidateFactInvoiceCache_() {
  _FACT_INVOICE_RAM_CACHE = null;
}

/**
 * invalidateGeoLatLngCache_ — [ADD v5.5.007 P1 #5] ล้าง RAM cache ของ geo lat/lng lookup
 *
 * เดิมไม่มี invalidator สำหรับ _GEO_LATLNG_RAM_CACHE ทำให้เมื่อ createGeoPoint() สร้าง
 * geo point ใหม่ระหว่าง execution, getGeoLatLng_(newGeoId) จะ return null เพราะ cache
 * ถูก build ก่อนที่จะมี geo ใหม่ → FACT_DELIVERY ได้พิกัด raw GPS แทน master geo lat/lng
 *
 * ต้องเรียกหลังจาก createGeoPoint() และหลัง batchUpdateGeoStats_() เพื่อให้ cache
 * ถูก rebuild ในการ lookup ถัดไป
 */
function invalidateGeoLatLngCache_() {
  _GEO_LATLNG_RAM_CACHE = null;
}

/**
 * formatTimeValue_ — [ADD v008] จัดรูปแบบเวลาให้ไม่ติดปี 1899
 */
function formatTimeValue_(timeVal) {
  if (!timeVal) return '';
  
  // 1. ถ้าเป็น Date object ให้ Format เป็นเวลาทันที
  if (timeVal instanceof Date) {
    return Utilities.formatDate(timeVal, Session.getScriptTimeZone(), 'HH:mm:ss');
  }

  // 2. ถ้าเป็น String ให้ลองเช็คว่ามีรูปแบบวันที่ติดมาไหม
  let timeStr = String(timeVal).trim();
  if (timeStr.includes('1899')) {
    // ถ้าเจอปี 1899 ให้พยายามตัดเอาเฉพาะส่วนเวลา (ปกติจะเป็นส่วนท้าย)
    const match = timeStr.match(/\d{2}:\d{2}:\d{2}/);
    if (match) return match[0];
  }

  return timeStr;
}
