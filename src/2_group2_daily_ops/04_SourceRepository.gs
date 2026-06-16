/**
 * VERSION: 5.5.004
 * FILE: 04_SourceRepository.gs
 * LMDS V5.5 — Source Data Repository
 * ===================================================
 * PURPOSE:
 *   จัดการข้อมูลต้นทาง (Source Sheet) สำหรับ Pipeline
 *   เป็น Single Entry Point สำหรับการอ่านและเขียนข้อมูลต้นฉบับ
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
 *   v5.4.003 (2026-05-24) — Refactor-06: RAM cache for source rows:
 *     - [REFACTOR] Add _SOURCE_ROWS_RAM_CACHE for in-execution caching
 *     - [REFACTOR] getAllSourceRows() checks RAM cache → CacheService → Sheet
 *     - [REFACTOR] invalidateSourceCache() clears RAM cache first
 *   v5.4.001 (2026-05-24) — Single Writer Pattern:
 *     - [ADD] Comprehensive header documentation
 *   v5.4.000 (2026-05-24):
 *     - [UPGRADE] Version bump to 5.4.000
 *     - [ADD] Comprehensive header documentation
 *     - [ADD] DEPENDENCIES section with module relationships
 *     - [ENHANCE] Detailed module interconnection mapping
 *   v5.2.001 (PH2 Hardening):
 *     - [REFACTOR] Separate Load from Match Engine (No Double Processing)
 *     - [UPGRADE] updateSyncStatus_ supports SUCCESS/ERROR
 *     - [FIX] buildSourceObj_ mapping (Text Priority ready)
 * ===================================================
 * DEPENDENCIES:
 *   REQUIRES (Load Order):
 *     - 01_Config (SHEET.*, SRC_IDX.*, SCG_CONFIG.*, AI_CONFIG.*)
 *     - 02_Schema (SCHEMA[SHEET.SOURCE])
 *     - 14_Utils (normalizeInvoiceNo, parseLatLng, isValidLatLng, callSpreadsheetWithRetry)
 *   CALLS (Invokes):
 *     - normalizeInvoiceNo() → 14_Utils
 *     - parseLatLng() → 14_Utils
 *     - isValidLatLng() → 14_Utils
 *     - callSpreadsheetWithRetry() → 14_Utils
 *     - columnToLetterHelper_() → (self)
 *     - logInfo/logError/logWarn/logDebug() → 03_SetupSheets
 *     - updateSyncStatus_() → (self)
 *     - processOneRow() → 10_MatchEngine
 *   EXPORTS TO:
 *     - 10_MatchEngine (getUnprocessedRows, getAllSourceRows, buildSourceObj_)
 *     - 00_App (runFullPipeline, runLoadSource)
 *   SHEETS ACCESSED:
 *     - SHEET.SOURCE (Read+Write: source data & sync status)
 *     - SHEET.FACT_DELIVERY (Read: processed invoice lookup)
 * ===================================================
 * ARCHITECTURE:
 *   Source Data Hub
 *   ┌─────────────────────────────────────────────┐
 *   │ runLoadSource                               │
 *   │   └→ invalidateCache                        │
 *   │   └→ getUnprocessedRows                     │
 *   │        └→ getAllSourceRows → buildSourceObj_ │
 *   │        └→ getProcessedInvoiceSet_            │
 *   │             └→ FACT_DELIVERY lookup          │
 *   │                                             │
 *   │ processSrcBatch_ → processOneRow             │
 *   │ updateSyncStatus_ (batch status update)      │
 *   └─────────────────────────────────────────────┘
 * ===================================================
 */

// ============================================================
// SECTION 1: Constants
// ============================================================

// Cache key สำหรับ Source data
const CACHE_KEY_SOURCE   = 'SOURCE_ROWS_V3';
const CACHE_KEY_INVOICES = 'PROCESSED_INVOICES_V3';

// [FIX S7 v5.5.002] SRC_READ_COLS ย้ายไปประกาศที่ 01_Config.gs แล้ว (Single Source of Truth)
// เดิมประกาศซ้ำที่นี่ → SyntaxError: Identifier already declared
// ใช้ SRC_READ_COLS จาก 01_Config.gs โดยตรง

// [REFACTOR-06] RAM cache สำหรับ source rows ภายใน execution เดียว
// เร็วกว่า CacheService 100× — หายเมื่อ execution จบ (ปลอดภัยตาม GAS architecture)
let _SOURCE_ROWS_RAM_CACHE = null;

// ============================================================
// SECTION 2: Entry Point
// ============================================================

/**
 * runLoadSource — โหลดข้อมูลดิบจากชีต Source
 * เรียกจาก runFullPipeline() หรือ Menu
 */
function runLoadSource() {
  try {
  const ss       = SpreadsheetApp.getActiveSpreadsheet();
  const srcSheet = ss.getSheetByName(SHEET.SOURCE);

  if (!srcSheet) {
    logError('SourceRepo', `ไม่พบชีต: ${SHEET.SOURCE}`, new Error('SHEET_NOT_FOUND'));
    throw new Error(`ไม่พบชีต "${SHEET.SOURCE}" กรุณาตรวจสอบชื่อชีต`);
  }

  logInfo('SourceRepo', 'เริ่มโหลด Source (Refreshing Cache)');
  invalidateSourceCache();

  const pending = getUnprocessedRows();
  logInfo('SourceRepo', `ตรวจพบแถวที่ต้องประมวลผล: ${pending.length} แถว`);
  
  if (pending.length > 0) {
    SpreadsheetApp.getActiveSpreadsheet().toast(`🚀 โหลดข้อมูลสำเร็จ: ${pending.length} แถว พร้อมประมวลผล`, APP_NAME);
  } else {
    SpreadsheetApp.getActiveSpreadsheet().toast(`✅ ข้อมูลเป็นปัจจุบันอยู่แล้ว`, APP_NAME);
  }
  } catch (err) {
    logError('SourceRepo', 'runLoadSource ล้มเหลว: ' + err.message, err);
    // [FIX B2 v5.5.002] เปลี่ยน getUi().alert() → safeUiAlert_() — trigger-safe
    safeUiAlert_('เกิดข้อผิดพลาด: ' + err.message);
  }
}

// ============================================================
// SECTION 3: ดึงข้อมูล Source
// ============================================================

/**
 * getAllSourceRows — คืน Array ของ Source Objects ทั้งหมด
 * [REFACTOR-06] เพิ่ม RAM cache layer (เร็วสุด, หายเมื่อ execution จบ)
 * Priority: RAM cache → CacheService → Sheet read
 */
function getAllSourceRows() {
  try {
  // [REFACTOR-06] RAM cache ก่อน (เร็วสุด, หายเมื่อ execution จบ)
  if (_SOURCE_ROWS_RAM_CACHE) return _SOURCE_ROWS_RAM_CACHE;

  const cache  = CacheService.getScriptCache();
  // ลองอ่านจาก chunked cache
  const cached = loadSourceRowsFromCache_(cache);

  if (cached) {
    _SOURCE_ROWS_RAM_CACHE = cached;
    return cached;
  }

  const ss       = SpreadsheetApp.getActiveSpreadsheet();
  const srcSheet = ss.getSheetByName(SHEET.SOURCE);
  if (!srcSheet || srcSheet.getLastRow() < 2) return [];

  const colsToRead = Math.min(SRC_READ_COLS, srcSheet.getLastColumn());
  const totalRows  = srcSheet.getLastRow() - 1;
  const allData    = srcSheet.getRange(2, 1, totalRows, colsToRead)
                             .getValues();

  const result = allData
    .map((row, i) => ({ row, sourceRow: i + 2 }))
    .filter(({ row }) => row[SRC_IDX.INVOICE_NO])
    .filter(({ row }) => {
      const sync = String(row[SRC_IDX.SYNC_STATUS] || '').trim();
      // [FIX CRIT-006] กรองทั้ง SUCCESS และ REVIEW — REVIEW = อยู่ในคิวรอตรวจ ไม่ต้องประมวลผลซ้ำ
      return sync !== SCG_CONFIG.SYNC_DONE_VALUE && sync !== 'REVIEW';
    })
    .map(({ row, sourceRow }) => buildSourceObj_(row, sourceRow));

  // บันทึกล RAM cache
  _SOURCE_ROWS_RAM_CACHE = result;

  // บันทึกลง CacheService ด้วย (สำหรับ execution ถัดไป)
  saveSourceRowsToCache_(result);

  return result;

  } catch (e) {
    logError('04_SourceRepository', 'getAllSourceRows ล้มเหลว: ' + e.message);
    return _SOURCE_ROWS_RAM_CACHE || [];
  }
}

/**
 * getUnprocessedRows — ดึงเฉพาะแถวที่ยังไม่ผ่าน Match Engine
 */
function getUnprocessedRows() {
  const allRows = getAllSourceRows();
  if (allRows.length === 0) return [];
  
  const doneSet = getProcessedInvoiceSet_();
  const unprocessed = [];
  const skipped = [];
  
  allRows.forEach(row => {
    if (doneSet.has(row.invoiceNo)) {
      skipped.push(row);
    } else {
      unprocessed.push(row);
    }
  });
  
  // [UPGRADE v5.2.006] อัปเดตสถานะให้แถวที่เคยทำเสร็จแล้ว (มีใน FACT_DELIVERY) เป็น SUCCESS ทันที
  // เพื่อป้องกันไม่ให้ผู้ใช้สับสนว่าทำไมสถานะในชีต SOURCE ถึงยังว่างอยู่
  if (skipped.length > 0) {
    updateSyncStatus_(skipped, 'SUCCESS');
    logInfo('SourceRepo', `ข้าม ${skipped.length} แถวที่เคยเข้า FACT_DELIVERY ไปแล้ว (ปรับเป็น SUCCESS)`);
  }
  
  return unprocessed;
}

/**
 * getProcessedInvoiceSet_ — อ่าน Invoice ที่มีใน FACT_DELIVERY แล้ว
 * [FIX CRIT-008] ใช้ chunked cache pattern เพื่อรองรับข้อมูลเกิน 100KB
 */
function getProcessedInvoiceSet_() {
  const cache    = CacheService.getScriptCache();
  // [FIX CRIT-008] ใช้ chunked cache loader แทน cache.get ตรง — ป้องกัน 100KB limit
  const cached   = loadProcessedInvoicesFromCache_(cache);
  if (cached) return cached;

  const ss        = SpreadsheetApp.getActiveSpreadsheet();
  const factSheet = ss.getSheetByName(SHEET.FACT_DELIVERY);
  const doneSet   = new Set();

  if (!factSheet || factSheet.getLastRow() < 2) return doneSet;

  const invoiceCol  = FACT_IDX.INVOICE_NO + 1;
  const lastRow     = factSheet.getLastRow() - 1;
  const invoiceData = factSheet.getRange(2, invoiceCol, lastRow, 1)
                               .getValues();

  invoiceData.forEach(r => {
    if (r[0]) doneSet.add(normalizeInvoiceNo(r[0]));
  });

  // [FIX CRIT-008] บันทึกด้วย chunked pattern
  saveProcessedInvoicesToCache_(cache, doneSet);

  return doneSet;
}

/**
 * saveProcessedInvoicesToCache_ — [FIX CRIT-008] Chunked cache for processed invoices
 * Pattern เดียวกับ saveSourceRowsToCache_ ที่มีอยู่แล้วในไฟล์นี้
 * @param {GoogleAppsScript.Cache.Cache} cache
 * @param {Set<string>} doneSet
 */
function saveProcessedInvoicesToCache_(cache, doneSet) {
  const invoiceArr = [...doneSet];
  const json = JSON.stringify(invoiceArr);

  // ถ้าขนาดเล็กพอ → cache ทีเดียว
  if (json.length < 90000) {
    try {
      cache.put(CACHE_KEY_INVOICES, json, AI_CONFIG.CACHE_TTL_SEC);
      cache.put(CACHE_KEY_INVOICES + '_CHUNKS', '0', AI_CONFIG.CACHE_TTL_SEC);
      return;
    } catch (e) {
      logWarn('SourceRepo', 'PROCESSED_INVOICES Cache write error (< 90KB): ' + e.message);
      return;
    }
  }

  // ขนาดใหญ่ → แบ่งเป็น chunks
  const CHUNK_SIZE = 200;
  const totalChunks = Math.ceil(invoiceArr.length / CHUNK_SIZE);

  try { cache.put(CACHE_KEY_INVOICES + '_CHUNKS', String(totalChunks), AI_CONFIG.CACHE_TTL_SEC); } catch(e) {
    logWarn('SourceRepo', 'PROCESSED_INVOICES _CHUNKS write error: ' + e.message);
    return;
  }

  for (let i = 0; i < totalChunks; i++) {
    const chunk = invoiceArr.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
    try {
      cache.put(CACHE_KEY_INVOICES + '_' + i, JSON.stringify(chunk), AI_CONFIG.CACHE_TTL_SEC);
    } catch (e) {
      logWarn('SourceRepo', 'PROCESSED_INVOICES chunk ' + i + '/' + totalChunks + ' write error: ' + e.message);
      // ลบ chunks ที่เขียนไปแล้ว
      try {
        const keysToRemove = [];
        for (let j = 0; j <= i; j++) keysToRemove.push(CACHE_KEY_INVOICES + '_' + j);
        keysToRemove.push(CACHE_KEY_INVOICES + '_CHUNKS');
        cache.removeAll(keysToRemove);
      } catch (_) {}
      return;
    }
  }
  logDebug('SourceRepo', 'Chunked invoice cache: ' + invoiceArr.length + ' items → ' + totalChunks + ' chunks');
}

/**
 * loadProcessedInvoicesFromCache_ — [FIX CRIT-008] อ่าน processed invoices แบบ chunked
 * @param {GoogleAppsScript.Cache.Cache} cache
 * @return {Set<string>|null}
 */
function loadProcessedInvoicesFromCache_(cache) {
  // ลองอ่านแบบเดิมก่อน (กรณีขนาดเล็ก)
  const singleCached = cache.get(CACHE_KEY_INVOICES);
  if (singleCached) {
    try { return new Set(JSON.parse(singleCached)); } catch (e) { logDebug('SourceRepo', 'PROCESSED_INVOICES Cache parse error: ' + e.message); }
  }

  // ลองอ่าน chunked cache
  const totalStr = cache.get(CACHE_KEY_INVOICES + '_CHUNKS');
  if (!totalStr) return null;

  const totalChunks = Number(totalStr);
  if (isNaN(totalChunks) || totalChunks <= 0) return null;

  let isComplete = true;
  const merged = [];
  for (let i = 0; i < totalChunks; i++) {
    const chunkStr = cache.get(CACHE_KEY_INVOICES + '_' + i);
    if (!chunkStr) { isComplete = false; break; }
    try {
      const chunk = JSON.parse(chunkStr);
      for (let j = 0; j < chunk.length; j++) merged.push(chunk[j]);
    } catch (e) { isComplete = false; break; }
  }

  if (isComplete && merged.length > 0) {
    logDebug('SourceRepo', 'Chunked invoice cache hit: ' + merged.length + ' items from ' + totalChunks + ' chunks');
    return new Set(merged);
  }

  return null;
}

// ============================================================
// SECTION 4: Builder
// ============================================================

/**
 * buildSourceObj_ — แปลง Row Array เป็น Source Object
 */
function buildSourceObj_(row, rowNum) {
  const rawLatNum = Number(row[SRC_IDX.LAT]);
  const rawLngNum = Number(row[SRC_IDX.LNG]);

  let rawLat = (!isNaN(rawLatNum) && rawLatNum !== 0) ? rawLatNum : 0;
  let rawLng = (!isNaN(rawLngNum) && rawLngNum !== 0) ? rawLngNum : 0;

  if (rawLat === 0 || rawLng === 0) {
    const combined = String(row[SRC_IDX.LATLNG_COMBINED] || '').trim();
    if (combined) {
      const parsed = parseLatLng(combined);
      if (parsed && isValidLatLng(parsed.lat, parsed.lng)) {
        rawLat = parsed.lat;
        rawLng = parsed.lng;
      }
    }
  }

  const hasGeo = !isNaN(rawLat) && !isNaN(rawLng) &&
                 rawLat !== 0    && rawLng !== 0;

  const resolvedAddr = String(row[SRC_IDX.RESOLVED_ADDR] || '').trim();
  const rawAddr      = String(row[SRC_IDX.RAW_ADDRESS]   || '').trim();
  
  // [UPGRADE v5.2.003] ปรับปรุง Mapping ให้ตรงตามความต้องการ Fact-Checking
  // 1. rawPlaceName = RAW_ADDRESS (18) — ข้อมูลมั่วๆ จาก SCG แต่จำเป็นต้องเก็บ
  // 2. resolvedAddr = RESOLVED_ADDR (24) — ข้อมูลที่แปลงจาก LatLong เชื่อถือได้
  const scgAddr      = String(row[SRC_IDX.RAW_ADDRESS]   || '').trim();
  const sysAddr      = String(row[SRC_IDX.RESOLVED_ADDR] || '').trim();

  let deliveryDate = '';
  if (row[SRC_IDX.DELIVERY_DATE]) {
    try {
      deliveryDate = new Date(row[SRC_IDX.DELIVERY_DATE]).toISOString();
    } catch (e) {
      deliveryDate = String(row[SRC_IDX.DELIVERY_DATE]);
    }
  }

  return {
    sourceSheet:     SHEET.SOURCE,
    sourceRow:       rowNum,
    invoiceNo:       normalizeInvoiceNo(row[SRC_IDX.INVOICE_NO]),
    shipmentNo:      String(row[SRC_IDX.SHIPMENT_NO]     || '').trim(),
    deliveryDate:    deliveryDate,
    deliveryTime:    row[SRC_IDX.DELIVERY_TIME],
    driverName:      String(row[SRC_IDX.DRIVER_NAME]     || '').trim(),
    truckLicense:    String(row[SRC_IDX.TRUCK_LICENSE]   || '').trim(),
    carrierCode:     '',
    carrierName:     '',
    soldToCode:      String(row[SRC_IDX.CUSTOMER_CODE]   || '').trim(),
    soldToName:      String(row[SRC_IDX.SOLD_TO_NAME]    || '').trim(),
    rawPersonName:   String(row[SRC_IDX.RAW_PERSON_NAME] || '').trim(),
    rawPlaceName:    scgAddr,     // [FIX v5.2.003] = RAW_ADDRESS(18)
    rawAddress:      sysAddr,     // [FIX v5.2.003] = RESOLVED_ADDR(24) — ใช้เป็นฐานใน Match Engine
    scgAddress:      scgAddr,     // [NEW v5.2.003] เก็บไว้ลง FACT_DELIVERY โดยเฉพาะ
    resolvedAddr:    sysAddr,     // [KEEP]
    rawLat:          rawLat,
    rawLng:          rawLng,
    hasGeo:          hasGeo,
    warehouse:       String(row[SRC_IDX.WAREHOUSE]       || '').trim(),
    // [FIX CRIT-001] Extract province from address using extractProvince_() — Rule 3 (GEO_PROVINCE_CONFLICT) was never triggering
    province:        (typeof extractProvince_ === 'function') ? extractProvince_(sysAddr || scgAddr) : '',
    sourceId:        String(row[SRC_IDX.SOURCE_ID]       || '').trim(),
    remark:          String(row[SRC_IDX.REMARK]          || '').trim(),
  };
}

// ============================================================
// SECTION 5: Batch Processor
// ============================================================

/**
 * processSrcBatch_ — ส่ง Source Batch เข้า Match Engine
 * [FIX v003] คืนค่า Batch สำหรับเขียนทีเดียว
 */
function processSrcBatch_(batch) {
  let processed = 0;
  const factBatch = [];
  const reviewBatch = [];

  batch.forEach(srcObj => {
    try {
      const result = processOneRow(srcObj);
      processed++;
      if (result.factData)   factBatch.push(result.factData);
      if (result.reviewData) reviewBatch.push(result.reviewData);
    } catch (err) {
      logError('SourceRepo',
        `processSrcBatch_ แถว ${srcObj.sourceRow} — ${err.message}`);
    }
  });
  return { processed, factBatch, reviewBatch };
}

// ============================================================
// SECTION 6: Cache Management
// ============================================================

/** invalidateSourceCache — ล้าง Cache ของ Source */
function invalidateSourceCache() {
  // [REFACTOR-06] ล้าง RAM cache ด้วย
  _SOURCE_ROWS_RAM_CACHE = null;
  const cache = CacheService.getScriptCache();
  // ล้าง chunked cache
  const totalStr = cache.get(CACHE_KEY_SOURCE + '_TOTAL');
  const totalChunks = totalStr ? Number(totalStr) : 0;
  const keysToRemove = [CACHE_KEY_SOURCE, CACHE_KEY_SOURCE + '_TOTAL', CACHE_KEY_INVOICES];
  for (let i = 0; i < totalChunks; i++) {
    keysToRemove.push(CACHE_KEY_SOURCE + '_' + i);
  }
  // [FIX CRIT-008] ล้าง chunked invoice cache ด้วย
  const invoiceChunksStr = cache.get(CACHE_KEY_INVOICES + '_CHUNKS');
  const invoiceChunks = invoiceChunksStr ? Number(invoiceChunksStr) : 0;
  for (let i = 0; i < invoiceChunks; i++) {
    keysToRemove.push(CACHE_KEY_INVOICES + '_' + i);
  }
  keysToRemove.push(CACHE_KEY_INVOICES + '_CHUNKS');
  cache.removeAll(keysToRemove);
}

/**
 * saveSourceRowsToCache_ — [FIX BUG-09 v5.4.003] Chunked cache pattern
 * แบ่งข้อมูล Source เป็นก้อนๆ เพื่อไม่ให้เกิน 100KB limit ของ CacheService
 * Pattern เดียวกับ savePostcodeMapToCache_() ใน 16_GeoDictionaryBuilder.gs
 * @param {Object[]} result - Source objects array
 */
function saveSourceRowsToCache_(result) {
  if (!result || result.length === 0) return;
  const cache = CacheService.getScriptCache();
  const json = JSON.stringify(result);

  // ถ้าขนาดเล็กพอ → cache ทีเดียว
  if (json.length < 90000) {
    try {
      cache.put(CACHE_KEY_SOURCE, json, AI_CONFIG.CACHE_TTL_SEC);
      cache.put(CACHE_KEY_SOURCE + '_TOTAL', '0', AI_CONFIG.CACHE_TTL_SEC); // 0 = ไม่มี chunks
      return;
    } catch (e) {
      logWarn('SourceRepo', 'Cache put ล้มเหลว (แม้ขนาด < 90KB): ' + e.message);
      return;
    }
  }

  // ขนาดใหญ่ → แบ่งเป็น chunks
  const CHUNK_SIZE = 200; // items per chunk
  const totalChunks = Math.ceil(result.length / CHUNK_SIZE);

  try { cache.put(CACHE_KEY_SOURCE + '_TOTAL', String(totalChunks), AI_CONFIG.CACHE_TTL_SEC); } catch(e) {
    logWarn('SourceRepo', 'Cache _TOTAL write ล้มเหลว: ' + e.message);
    return;
  }

  for (let i = 0; i < totalChunks; i++) {
    const chunk = result.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
    try {
      cache.put(CACHE_KEY_SOURCE + '_' + i, JSON.stringify(chunk), AI_CONFIG.CACHE_TTL_SEC);
    } catch (e) {
      logWarn('SourceRepo', `Cache chunk ${i}/${totalChunks} write ล้มเหลว: ${e.message}`);
      // ลบ chunks ที่เขียนไปแล้ว เพื่อไม่ให้ cache ไม่สมบูรณ์
      try {
        const keysToRemove = [];
        for (let j = 0; j <= i; j++) keysToRemove.push(CACHE_KEY_SOURCE + '_' + j);
        keysToRemove.push(CACHE_KEY_SOURCE + '_TOTAL');
        cache.removeAll(keysToRemove);
      } catch (_) {}
      return;
    }
  }
  logDebug('SourceRepo', `Chunked cache: ${result.length} items → ${totalChunks} chunks`);
}

/**
 * loadSourceRowsFromCache_ — [FIX BUG-09 v5.4.003] อ่าน chunked cache
 * @param {GoogleAppsScript.Cache.Cache} cache
 * @return {Object[]|null}
 */
function loadSourceRowsFromCache_(cache) {
  // ลองอ่าแบบเดิมก่อน (กรณีขนาดเล็ก)
  const singleCached = cache.get(CACHE_KEY_SOURCE);
  if (singleCached) {
    try { return JSON.parse(singleCached); } catch (e) { logDebug('SourceRepo', 'SOURCE_ROWS_V3 Cache parse error: ' + e.message); }
  }

  // ลองอ่าน chunked cache
  const totalStr = cache.get(CACHE_KEY_SOURCE + '_TOTAL');
  if (!totalStr) return null;

  const totalChunks = Number(totalStr);
  if (isNaN(totalChunks) || totalChunks <= 0) return null;

  let isComplete = true;
  const merged = [];
  for (let i = 0; i < totalChunks; i++) {
    const chunkStr = cache.get(CACHE_KEY_SOURCE + '_' + i);
    if (!chunkStr) { isComplete = false; break; }
    try {
      const chunk = JSON.parse(chunkStr);
      // [FIX B5 v5.5.002] ใช้ for-loop แทน Array.prototype.push.apply — ป้องกัน stack overflow เมื่อ chunk ใหญ่
      for (let j = 0; j < chunk.length; j++) merged.push(chunk[j]);
    } catch (e) { isComplete = false; break; }
  }

  if (isComplete && merged.length > 0) {
    logDebug('SourceRepo', `Chunked cache hit: ${merged.length} items from ${totalChunks} chunks`);
    return merged;
  }

  return null;
}

/**
 * updateSyncStatus_ — [UPGRADE v5.2.001] Supports SUCCESS/ERROR
 * @param {Object[]} batchRows - รายการ sourceObj ที่ประมวลผลแล้ว
 * @param {string} status - SCG_CONFIG.SYNC_DONE_VALUE หรือ 'ERROR'
 */
function updateSyncStatus_(batchRows, status = 'SUCCESS') {
  if (!batchRows || batchRows.length === 0) return;
  
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET.SOURCE);
  if (!sheet) return;

  // [FIX CRIT-006] รองรับ status 'REVIEW' — แถวที่อยู่ในคิวรอตรวจ
  var statusVal;
  if (status === 'SUCCESS') {
    statusVal = SCG_CONFIG.SYNC_DONE_VALUE;
  } else if (status === 'REVIEW') {
    statusVal = 'REVIEW';
  } else {
    statusVal = 'ERROR';
  }
  const statusCol = SRC_IDX.SYNC_STATUS + 1;
  // [FIX B12 v5.5.002] ย้าย columnToLetterHelper ออกจาก map loop — ค่าคงที่ไม่ต้องคำนวณทุกรอบ
  const colLetter = columnToLetterHelper_(statusCol);
  const a1Notations = batchRows.map(row => `${colLetter}${row.sourceRow}`);

  try {
    callSpreadsheetWithRetry(() => {
      // [PERF-002] รวม setValue + setBackground เป็นครั้งเดียวเมื่อ SUCCESS
      // เดิม: เรียก getRangeList 2 ครั้งเสมอ (setValue + setBackground) แม้ SUCCESS ไม่ต้องการสี
      // ใหม่: SUCCESS เรียกแค่ setValue 1 ครั้ง, ERROR เรียก setValue+setBackground 2 ครั้ง
      sheet.getRangeList(a1Notations).setValue(statusVal);
      // [FIX CRIT-006] REVIEW ใช้สีเหลืองอ่อน แยกจาก ERROR (แดง)
      if (status === 'ERROR') {
        sheet.getRangeList(a1Notations).setBackground('#f4cccc');
      } else if (status === 'REVIEW') {
        sheet.getRangeList(a1Notations).setBackground('#fff2cc');
      }
    });
    // [PERF-007] Selective RAM cache update แทน invalidateSourceCache() ทั้งก้อน
    // ลบเฉพาะแถวที่ถูกประมวลผลแล้วออกจาก RAM cache แทนที่จะล้างทั้งหมด
    // ทำให้ getUnprocessedRows() ครั้งถัดไปไม่ต้องอ่าน Sheet ใหม่ทั้งหมด
    if (_SOURCE_ROWS_RAM_CACHE) {
      const batchSourceRows = new Set(batchRows.map(r => r.sourceRow));
      _SOURCE_ROWS_RAM_CACHE = _SOURCE_ROWS_RAM_CACHE.filter(r => !batchSourceRows.has(r.sourceRow));
    }
    // ล้าง CacheService cache เท่านั้น (เพื่อให้ execution ถัดไปเห็นข้อมูลใหม่)
    // แต่ไม่ล้าง RAM cache เพราะเราอัปเดตเฉพาะส่วนแล้วด้านบน
    const cache = CacheService.getScriptCache();
    const keysToRemove = [CACHE_KEY_SOURCE, CACHE_KEY_SOURCE + '_TOTAL', CACHE_KEY_INVOICES];
    // ล้าง chunked cache keys ด้วย
    const totalStr = cache.get(CACHE_KEY_SOURCE + '_TOTAL');
    const totalChunks = totalStr ? Number(totalStr) : 0;
    for (let i = 0; i < totalChunks; i++) {
      keysToRemove.push(CACHE_KEY_SOURCE + '_' + i);
    }
    const invoiceChunksStr = cache.get(CACHE_KEY_INVOICES + '_CHUNKS');
    const invoiceChunks = invoiceChunksStr ? Number(invoiceChunksStr) : 0;
    for (let i = 0; i < invoiceChunks; i++) {
      keysToRemove.push(CACHE_KEY_INVOICES + '_' + i);
    }
    keysToRemove.push(CACHE_KEY_INVOICES + '_CHUNKS');
    cache.removeAll(keysToRemove);
    logDebug('SourceRepo', `อัปเดต SYNC_STATUS (${statusVal}): ${batchRows.length} แถว`);
  } catch (e) {
    logError('SourceRepo', `updateSyncStatus_ ล้มเหลว: ${e.message}`, e);
  }
}

/** 
 * columnToLetterHelper_ — [REF-019] แปลงเลขคอลัมน์เป็นตัวอักษร (เช่น 1 -> A, 37 -> AK)
 * เพิ่ม _ suffix ตามกฎ Private Function (Rule 8 — ใช้ภายในโมดูลเท่านั้น)
 */
function columnToLetterHelper_(column) {
  let temp, letter = '';
  while (column > 0) {
    temp = (column - 1) % 26;
    letter = String.fromCharCode(temp + 65) + letter;
    column = (column - temp - 1) / 26;
  }
  return letter;
}
