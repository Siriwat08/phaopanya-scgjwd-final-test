/**
 * VERSION: 5.5.004
 * FILE: 12_ReviewService.gs
 * LMDS V5.5 — Review Queue Service
 * [FIX BUG-B2] v5.4.003: updateReviewRowStatus_() helper — 1 setValues แทน 5× setValue
 * [FIX BUG-B2] v5.4.003: applyAllPendingDecisions — Time Guard + Batch Status
 * [FIX BUG-A2] v5.4.003: applyAllPendingDecisions — เพิ่ม try-catch outer
 * [FIX v5.5.005] แก้ Syntax Error บรรทัด 259 (try block ไม่มี catch/finally)
 * [FIX v5.5.005] เพิ่ม return statement ใน applyReviewDecision() — ทำให้ Review เขียน FACT_DELIVERY ได้
 * [FIX v5.5.005] ลบ dead code resolveGeoAndDest_() — ละเมิดกฎ Architecture
 * ===================================================
 * PURPOSE:
 * จัดการคิวรีวิว Q_REVIEW — พักข้อมูลที่ต้องให้คนตัดสินใจ
 * ===================================================
 * v5.5.005 (2026-06-16) — CRITICAL Fix:
 * - [FIX] Syntax Error: Missing catch/finally after try (line 259)
 * - [FIX] applyReviewDecision() ไม่มี return statement → Review ไม่เขียน FACT_DELIVERY
 * - [FIX] ลบ dead code resolveGeoAndDest_()
 * v5.5.004 (2026-06-15) — full sync cycle:
 * - [SYNC] All 22 files version bump 5.5.003 → 5.5.004
 * - [SYNC] Documentation audit: 28 inconsistencies fixed
 * v5.5.003 (2026-06-12) — post-REFACTOR sync:
 * - [SYNC] Version header V5.4 → V5.5, VERSION → 5.5.003
 * - [SYNC] CHANGELOG entries added for 5 Audit Cycles
 * v5.5.002 (2026-06-11) — CRITICAL Fix Cycle (8 issues):
 * - [FIX] CRIT-001 through CRIT-008 — see CRITICAL audit report
 * - [FIX] RAM Cache, Safe Batching, Checkpoint+Resume enhancements
 * v5.5.001 (2026-06-04) — 22-file bug fix + RAM Cache:
 * - [FIX] 22 files updated — bug fixes per CRITICAL/PERFORMANCE audits
 * - [ADD] RAM Cache layer (_SOURCE_ROWS_RAM_CACHE, _MAPS_SHEET_CACHE)
 * - [ADD] SearchKey, safeUiAlert_, JSON.parse guard
 * v5.4.001 (2026-05-24) — Single Writer Pattern:
 * - [ADD] Comprehensive header documentation
 * v5.4.000 (2026-05-24):
 * - [UPGRADE] Version bump to 5.4.000
 * - [ADD] Comprehensive header documentation
 * - [ADD] DEPENDENCIES section with module relationships
 * - [ENHANCE] Detailed module interconnection mapping
 * v5.2.010 (PH2 Hardening):
 * - [UPGRADE] อัปเกรดระบบเป็น 5.2.010
 * ===================================================
 * DEPENDENCIES:
 * REQUIRES (Load Order):
 * - 01_Config (SHEET.Q_REVIEW, SHEET.SOURCE, REVIEW_IDX.*, SRC_IDX.*, APP_CONST.*)
 * - 02_Schema (SCHEMA)
 * - 10_MatchEngine (resolveAndPersist_ gateway)
 * - 07_PlaceService (getEnrichedGeoData)
 * - 11_TransactionService (upsertFactDelivery)
 * - 14_Utils (generateShortId, normalizeInvoiceNo)
 * - 03_SetupSheets (logError, logInfo, logWarn, logDebug, safeUiAlert_)
 * CALLS (Invokes):
 * - resolveAndPersist_() → 10_MatchEngine (Gateway for Group 1 CRUD)
 * - getEnrichedGeoData() → 07_PlaceService (Optional enrichment)
 * - maskReviewerEmail_() → Local security helper
 * - logError/logInfo/logWarn/logDebug() → 03_SetupSheets
 * 
 * NOTE: ไม่เรียก Group 1 CRUD functions โดยตรงอีกต่อไป
 * ใช้ resolveAndPersist_() gateway แทน (REF-001)
 * EXPORTS TO:
 * - 00_App (openReviewQueue, applyAllPendingDecisions, applyReviewDecision, highlightHighPriorityReviews)
 * - 10_MatchEngine (enqueueReview)
 * SHEETS ACCESSED:
 * - SHEET.Q_REVIEW (Read+Write: review queue entries)
 * - SHEET.SOURCE (Read: restore delivery date/time)
 * ===================================================
 * ARCHITECTURE:
 * Review Queue Manager
 * ┌──────────────────────────────────────────────┐
 * │ enqueueReview                                │
 * │ └─ add pending review to Q_REVIEW            │
 * │ applyAllPendingDecisions                     │
 * │ └─ batch process all pending decisions       │
 * │ applyReviewDecision                          │
 * │ ├─ CREATE_NEW → resolve + create masters     │
 * │ ├─ MERGE_TO_CANDIDATE → merge person recs    │
 * │ ├─ ESCALATE → mark as Escalated              │
 * │ └─ IGNORE → mark as Done                     │
 * │ getReviewStats                               │
 * │ └─ queue statistics (pending/done/escalated) │
 * │ highlightHighPriorityReviews                 │
 * │ └─ visual priority marking (batch colors)    │
 * └──────────────────────────────────────────────┘
 * ===================================================
 */

// ============================================================
// SECTION 1: enqueueReview
// ============================================================

function enqueueReview(srcObj, decision, personResult, placeResult, geoResult) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(SHEET.Q_REVIEW);
    if (!sheet) {
      logError('ReviewService', 'ไม่พบชีต ' + SHEET.Q_REVIEW);
      return null;
    }

    const now = new Date();
    const newId = generateShortId('R');
    const candPersonIds = personResult && personResult.personId
      ? JSON.stringify([personResult.personId]) : JSON.stringify([]);
    const candPlaceIds = placeResult && placeResult.placeId
      ? JSON.stringify([placeResult.placeId]) : JSON.stringify([]);

    let candGeoIds = JSON.stringify([]);
    if (geoResult) {
      if (geoResult.candidateGeoIds && geoResult.candidateGeoIds.length > 0) {
        candGeoIds = JSON.stringify(geoResult.candidateGeoIds);
      } else if (geoResult.geoId) {
        candGeoIds = JSON.stringify([geoResult.geoId]);
      }
    }

    const newRow = new Array(SCHEMA[SHEET.Q_REVIEW].length).fill('');
    newRow[REVIEW_IDX.REVIEW_ID] = newId;
    newRow[REVIEW_IDX.ISSUE_TYPE] = decision ? decision.reason : 'UNKNOWN';
    newRow[REVIEW_IDX.PRIORITY] = decision ? (decision.priority || 2) : 2;
    newRow[REVIEW_IDX.SOURCE_REC_ID] = srcObj.sourceId || '';
    newRow[REVIEW_IDX.SOURCE_ROW] = srcObj.sourceRow || 0;
    newRow[REVIEW_IDX.INVOICE_NO] = srcObj.invoiceNo || '';
    newRow[REVIEW_IDX.RAW_PERSON] = srcObj.rawPersonName || '';

    let rawPlace = srcObj.rawPlaceName || '';
    const rawAddr = srcObj.rawAddress || '';

    // [FIX v5.5.001] ทำให้ getEnrichedGeoData() เป็น optional
    // ถ้าเรียกไม่ได้ (เช่น Maps API error) ก็ข้ามไป ไม่ใช่ข้อมูลจำเป็นสำหรับ review row
    try {
      const enrich = getEnrichedGeoData(rawAddr, rawPlace);
      if (enrich && enrich.fullAddress) {
        const hasGeoInfo = /จังหวัด|อำเภอ|เขต|ตำบล|แขวง/.test(rawPlace);
        if (rawPlace.length < 10 || !hasGeoInfo) {
          rawPlace = rawPlace ? rawPlace + ' (' + enrich.fullAddress + ')' : enrich.fullAddress;
        }
      }
    } catch (enrichErr) {
      logDebug('ReviewService', 'enqueueReview: getEnrichedGeoData ข้าม — ' + enrichErr.message);
    }

    newRow[REVIEW_IDX.RAW_PLACE] = rawPlace || rawAddr;
    newRow[REVIEW_IDX.RAW_SYS_ADDR] = rawAddr;
    newRow[REVIEW_IDX.RAW_LAT] = srcObj.rawLat || 0;
    newRow[REVIEW_IDX.RAW_LNG] = srcObj.rawLng || 0;
    newRow[REVIEW_IDX.CAND_PERSONS] = candPersonIds;
    newRow[REVIEW_IDX.CAND_PLACES] = candPlaceIds;
    newRow[REVIEW_IDX.CAND_GEOS] = candGeoIds;
    newRow[REVIEW_IDX.CAND_DESTS] = JSON.stringify([]);
    newRow[REVIEW_IDX.MATCH_SCORE] = decision ? (decision.confidence || 0) : 0;
    newRow[REVIEW_IDX.RECOMMEND] = 'MANUAL_REVIEW';
    newRow[REVIEW_IDX.STATUS] = 'Pending';
    newRow[REVIEW_IDX.REVIEWER] = '';
    newRow[REVIEW_IDX.REVIEWED_AT] = '';
    newRow[REVIEW_IDX.DECISION] = '';
    newRow[REVIEW_IDX.NOTE] = decision ? (decision.reason || '') : '';

    return { reviewId: newId, rowData: newRow };

  } catch (e) {
    logError('ReviewService', 'enqueueReview ล้มเหลว: ' + e.message);
    return null;
  }
}

// ============================================================
// SECTION 2: applyAllPendingDecisions
// [FIX BUG-B2] Time Guard (ป้องกัน Timeout กับ Queue ใหญ่)
// [FIX BUG-A2] try-catch outer
// [FIX v5.5.005] แก้ Syntax Error — ลบ try block ที่ไม่มี catch/finally
// ============================================================

function applyAllPendingDecisions() {
  // [FIX CRIT-006] เพิ่ม LockService — ป้องกัน Race Condition เมื่อ 2 ผู้ใช้รันพร้อมกัน
  const lock = LockService.getScriptLock();
  try {
    lock.tryLock(APP_CONST.LOCK_TIMEOUT_MS);
  } catch (e) {
    safeUiAlert_('⚠️ ไม่สามารถประมวลผล Review ได้ — มีการรันซ้อนอยู่');
    return;
  }
  
  if (!lock.hasLock()) {
    safeUiAlert_('⚠️ ระบบกำลังประมวลผล Review อยู่ กรุณารอสักครู่');
    return;
  }

  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(SHEET.Q_REVIEW);
    if (!sheet || sheet.getLastRow() < 2) return;

    // [FIX BUG-B2] Time Guard
    const startTime = new Date();
    const timeLimit = AI_CONFIG.TIME_LIMIT_MS || (5 * 60 * 1000);

    const data = sheet.getRange(2, 1, sheet.getLastRow() - 1,
      SCHEMA[SHEET.Q_REVIEW].length).getValues();

    let processed = 0;
    let timedOut = false;

    // [PERF-006] Batch status updates for IGNORE/ESCALATE (no side effects)
    const pendingStatusUpdates = [];
    const pendingFactRows = []; // [PERF-002] สะสม FACT_DELIVERY rows
    const batchNow = new Date();
    let reviewer = 'System';

    try {
      // [SEC-007] Mask reviewer email สำหรับ Audit Trail
      const rawEmail = Session.getActiveUser().getEmail() || Session.getEffectiveUser().getEmail() || 'Admin';
      reviewer = maskReviewerEmail_(rawEmail);
    } catch (e) {
      reviewer = 'Admin (Auto)';
    }

    for (let i = 0; i < data.length; i++) {
      // [FIX BUG-B2] Time Guard ทุก 20 แถว
      if (i % 20 === 0 && i > 0 && (new Date() - startTime) > timeLimit) {
        logWarn('ReviewService', 'applyAllPendingDecisions: Time Guard หยุดที่แถว ' + i + '/' + data.length);
        timedOut = true;
        break;
      }

      const rowResult = reviewProcessOneRow_(data[i], i + 2, reviewer, batchNow);
      if (rowResult.statusUpdate) pendingStatusUpdates.push(rowResult.statusUpdate);
      if (rowResult.factRow) pendingFactRows.push(rowResult.factRow);
      processed += rowResult.processed;
    }

    // [PERF-006] Flush batch status updates
    if (pendingStatusUpdates.length > 0) {
      batchUpdateReviewStatus_(sheet, pendingStatusUpdates);
    }

    // [PERF-002] Flush batch FACT_DELIVERY writes — เขียนทั้งหมดครั้งเดียวหลังลูป
    if (pendingFactRows.length > 0) {
      var factSheet = ss.getSheetByName(SHEET.FACT_DELIVERY);
      if (factSheet) {
        factSheet.getRange(factSheet.getLastRow() + 1, 1, pendingFactRows.length, pendingFactRows[0].length)
          .setValues(pendingFactRows);
        if (typeof invalidateFactInvoiceCache_ === 'function') invalidateFactInvoiceCache_();
      }
    }

    logInfo('ReviewService',
      'applyAllPendingDecisions: ประมวลผล ' + processed + ' รายการ' +
      ' (batch status: ' + pendingStatusUpdates.length + ')' +
      (timedOut ? ' (หยุดก่อนครบ — Time Guard)' : '')
    );

    if (timedOut) {
      safeUiAlert_('⚠️ ประมวลผลไป ' + processed + ' รายการ แต่หยุดกลางคันเพราะใกล้ Timeout\nกรุณารันอีกครั้ง');
    }

    return processed;

  } catch (err) {
    logError('ReviewService', 'applyAllPendingDecisions: ' + err.message, err);
    safeUiAlert_('❌ เกิดข้อผิดพลาด: ' + err.message);
  } finally {
    // [FIX CRIT-006] ปล่อย Lock เสมอ แม้เกิด error
    lock.releaseLock();
    // [PERF-012] Flush log buffer ก่อน execution จบ — ป้องกัน log entries สูญหาย
    if (typeof flushLogBuffer_ === 'function') flushLogBuffer_();
  }
}

/**
 * reviewProcessOneRow_ — processes 1 review row for applyAllPendingDecisions
 * Checks status/decision, handles IGNORE/ESCALATE batch paths and CREATE_NEW/MERGE side effects
 * @param {Array} rowData - single row from Q_REVIEW data
 * @param {number} rowIndex - 1-based row number in sheet (i + 2)
 * @param {string} reviewer - masked reviewer email
 * @param {Date} batchNow - timestamp for batch operations
 * @return {{ statusUpdate: Object|null, factRow: Array|null, processed: number, error: Error|null }}
 */
function reviewProcessOneRow_(rowData, rowIndex, reviewer, batchNow) {
  const status = String(rowData[REVIEW_IDX.STATUS] || '').trim();
  const decision = String(rowData[REVIEW_IDX.DECISION] || '').trim();
  const reviewId = String(rowData[REVIEW_IDX.REVIEW_ID] || '').trim();

  if (status === 'Done' || !decision) {
    return { statusUpdate: null, factRow: null, processed: 0, error: null };
  }

  try {
    // [PERF-006] IGNORE/ESCALATE don't have side effects → batch update
    if (decision === 'IGNORE') {
      return {
        statusUpdate: {
          targetRow: rowIndex, status: 'Done', reviewer: reviewer, now: batchNow,
          decisionVal: decision, note: ''
        },
        factRow: null,
        processed: 1,
        error: null
      };
    } else if (decision === 'ESCALATE') {
      return {
        statusUpdate: {
          targetRow: rowIndex, status: 'Escalated', reviewer: reviewer, now: batchNow,
          decisionVal: decision, note: ''
        },
        factRow: null,
        processed: 1,
        error: null
      };
    } else {
      // CREATE_NEW / MERGE_TO_CANDIDATE — have side effects, call normally
      // [PERF-002] เก็บ factData ที่ส่งคืนมาเพื่อเขียน batch ทีเดียวหลังลูป
      var reviewResult = applyReviewDecision(reviewId, decision, rowData, rowIndex);
      var factRow = (reviewResult && reviewResult.factRowData) ? reviewResult.factRowData : null;
      return {
        statusUpdate: null,
        factRow: factRow,
        processed: 1,
        error: null
      };
    }
  } catch (err) {
    logError('ReviewService', 'applyAllPendingDecisions row ' + reviewId + ': ' + err.message, err);
    return { statusUpdate: null, factRow: null, processed: 0, error: err };
  }
}

/**
 * batchUpdateReviewStatus_ — [PERF-006] Batch update status columns for multiple rows
 * Instead of updateReviewRowStatus_ per row (2N API calls),
 * read range once → modify in RAM → write once (2 API calls total)
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
 * @param {Array} updates - [{ targetRow, status, reviewer, now, decisionVal, note }]
 */
function batchUpdateReviewStatus_(sheet, updates) {
  if (!updates || updates.length === 0) return;

  const minCol = Math.min(
    REVIEW_IDX.STATUS, REVIEW_IDX.REVIEWER, REVIEW_IDX.REVIEWED_AT,
    REVIEW_IDX.DECISION, REVIEW_IDX.NOTE
  ) + 1;

  const maxCol = Math.max(
    REVIEW_IDX.STATUS, REVIEW_IDX.REVIEWER, REVIEW_IDX.REVIEWED_AT,
    REVIEW_IDX.DECISION, REVIEW_IDX.NOTE
  ) + 1;

  const numCols = maxCol - minCol + 1;
  const minRow = Math.min(...updates.map(u => u.targetRow));
  const maxRow = Math.max(...updates.map(u => u.targetRow));
  const rowCount = maxRow - minRow + 1;

  const range = sheet.getRange(minRow, minCol, rowCount, numCols);
  const allVals = range.getValues();

  updates.forEach(function(u) {
    const rowIdx = u.targetRow - minRow;
    if (rowIdx < 0 || rowIdx >= rowCount) return;
    allVals[rowIdx][REVIEW_IDX.STATUS - (minCol - 1)] = u.status;
    allVals[rowIdx][REVIEW_IDX.REVIEWER - (minCol - 1)] = u.reviewer;
    allVals[rowIdx][REVIEW_IDX.REVIEWED_AT - (minCol - 1)] = u.now;
    allVals[rowIdx][REVIEW_IDX.DECISION - (minCol - 1)] = u.decisionVal;
    allVals[rowIdx][REVIEW_IDX.NOTE - (minCol - 1)] = u.note || '';
  });

  range.setValues(allVals);
}

// ============================================================
// SECTION 3: applyReviewDecision
// [FIX BUG-B2] ใช้ updateReviewRowStatus_() แทน 5× setValue
// [REF-004] Refactored to Decision Router (~30 lines) + helper functions
// [REF-013] buildSrcObjFromReview_ extracted for srcObj construction
// [FIX v5.5.005] เพิ่ม return statement — ทำให้ Review เขียน FACT_DELIVERY ได้
// ============================================================

/**
 * applyReviewDecision — [REF-004] Decision Router
 * Delegates to step-specific helpers for each decision type.
 * Preserves all existing behavior.
 * [FIX v5.5.005] เพิ่ม return statement เพื่อส่ง factRowData กลับไป caller
 */
function applyReviewDecision(reviewId, decisionVal, rowData, optTargetRow) {
  // [FIX B1 v5.5.002] เพิ่ม try-catch outer — menu entry point ต้องมี error handling
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(SHEET.Q_REVIEW);
    if (!sheet) return null;

    const now = new Date();
    let reviewer = 'System';

    try {
      const rawEmail = Session.getActiveUser().getEmail() || Session.getEffectiveUser().getEmail() || 'Admin';
      reviewer = maskReviewerEmail_(rawEmail);
    } catch (e) {
      reviewer = 'Admin (Auto)';
    }

    // [FIX B2] ใช้ optTargetRow จาก caller ถ้ามี → ไม่ต้องอ่าน sheet ซ้ำ
    let targetRow = optTargetRow || -1;
    let rowArr = rowData;

    if (targetRow === -1 || !rowArr) {
      const data = sheet.getRange(2, 1, sheet.getLastRow() - 1,
        SCHEMA[SHEET.Q_REVIEW].length).getValues();
      for (let i = 0; i < data.length; i++) {
        if (String(data[i][REVIEW_IDX.REVIEW_ID]).trim() === reviewId) {
          targetRow = i + 2;
          if (!rowArr) rowArr = data[i];
          break;
        }
      }
    }

    if (targetRow === -1 || !rowArr) {
      logWarn('ReviewService', 'applyReviewDecision: ไม่พบ reviewId ' + reviewId);
      return null;
    }

    // [REF-004] Decision Router — delegates to helpers
    // [FIX v5.5.005] เก็บ result จาก helper เพื่อ return กลับไป caller
    let result = null;

    switch (decisionVal) {
      case 'CREATE_NEW':
        result = executeReviewCreateNew_(ss, sheet, targetRow, rowArr, reviewer, now, decisionVal);
        break;
      case 'MERGE_TO_CANDIDATE':
        result = executeMergeDecision_(ss, sheet, targetRow, rowArr, reviewer, now, decisionVal);
        break;
      case 'ESCALATE':
        updateReviewRowStatus_(sheet, targetRow, 'Escalated', reviewer, now, decisionVal, '');
        break;
      case 'IGNORE':
        updateReviewRowStatus_(sheet, targetRow, 'Done', reviewer, now, decisionVal, '');
        break;
      default:
        logWarn('ReviewService', 'applyReviewDecision: Unknown decision ' + decisionVal);
        break;
    }

    logInfo('ReviewService', 'applyReviewDecision: ' + reviewId + ' → ' + decisionVal + ' โดย ' + reviewer);

    // [FIX v5.5.005] return result เพื่อให้ caller ได้ factRowData
    return result;

  } catch (e) {
    logError('ReviewService', 'applyReviewDecision ล้มเหลว: ' + e.message, e);
    safeUiAlert_('เกิดข้อผิดพลาดในการประมวลผล Review: ' + e.message);
    return null;
  }
}

// ============================================================
// SECTION 3a: Review Helper Functions [REF-004 + REF-013]
// ============================================================

/**
 * parseCandidatesFromReview_ — [REF-004] Parse candidate JSON from review row
 * Safely parses CAND_PERSONS and CAND_PLACES JSON strings
 * @param {Array} rowData - Review row data array
 * @return {{ candPersonIds: Array, candPlaceIds: Array }}
 */
function parseCandidatesFromReview_(rowData) {
  const candPersonStr = String(rowData[REVIEW_IDX.CAND_PERSONS] || '[]').trim();
  const candPlaceStr = String(rowData[REVIEW_IDX.CAND_PLACES] || '[]').trim();

  let candPersonIds = [];
  let candPlaceIds = [];

  try { candPersonIds = JSON.parse(candPersonStr); } catch (e) {}
  try { candPlaceIds = JSON.parse(candPlaceStr); } catch (e) {}

  return { candPersonIds: candPersonIds, candPlaceIds: candPlaceIds };
}

/**
 * buildSrcObjFromReview_ — [REF-004 + REF-013] Construct srcObj from review row data
 * Reads delivery date/time from SOURCE sheet if available.
 * @param {Spreadsheet} ss - Active spreadsheet
 * @param {Array} rowData - Review row data array
 * @return {Object} srcObj literal for upsertFactDelivery
 */
function buildSrcObjFromReview_(ss, rowData) {
  const rawPerson = String(rowData[REVIEW_IDX.RAW_PERSON] || '').trim();
  const rawPlace = String(rowData[REVIEW_IDX.RAW_PLACE] || '').trim();
  const rawAddr = String(rowData[REVIEW_IDX.RAW_SYS_ADDR] || '').trim();
  const rawLat = Number(rowData[REVIEW_IDX.RAW_LAT] || 0);
  const rawLng = Number(rowData[REVIEW_IDX.RAW_LNG] || 0);
  const sourceRowIdx = Number(rowData[REVIEW_IDX.SOURCE_ROW] || 0);

  let deliveryDate = '', deliveryTime = '';

  if (sourceRowIdx > 1) {
    const srcSheet = ss.getSheetByName(SHEET.SOURCE);
    if (srcSheet) {
      const srcData = srcSheet.getRange(sourceRowIdx, 1, 1, srcSheet.getLastColumn()).getValues()[0];
      if (srcData[SRC_IDX.DELIVERY_DATE]) {
        try { deliveryDate = new Date(srcData[SRC_IDX.DELIVERY_DATE]).toISOString(); }
        catch (e) { deliveryDate = String(srcData[SRC_IDX.DELIVERY_DATE]); }
      }
      deliveryTime = srcData[SRC_IDX.DELIVERY_TIME];
    }
  }

  return {
    invoiceNo: normalizeInvoiceNo(rowData[REVIEW_IDX.INVOICE_NO]),
    sourceRow: sourceRowIdx,
    sourceId: String(rowData[REVIEW_IDX.SOURCE_REC_ID] || '').trim(),
    rawPersonName: rawPerson, rawPlaceName: rawPlace,
    rawAddress: rawAddr, rawLat: rawLat, rawLng: rawLng,
    hasGeo: !isNaN(rawLat) && !isNaN(rawLng) && rawLat !== 0 && rawLng !== 0,
    province: '', warehouse: '', driverName: '', truckLicense: '',
    soldToCode: '', soldToName: '', carrierCode: '', carrierName: '',
    shipmentNo: '', deliveryDate: deliveryDate, deliveryTime: deliveryTime,
    sourceSheet: SHEET.Q_REVIEW,
  };
}

/**
 * executeMergeDecision_ — [REF-004] Handle MERGE_TO_CANDIDATE decision
 * [REF-001] Now delegates to resolveAndPersist_() instead of calling Group 1 CRUD directly
 * Extracted from applyReviewDecision MERGE_TO_CANDIDATE case.
 * @param {Spreadsheet} ss
 * @param {Sheet} sheet - Q_REVIEW sheet
 * @param {number} targetRow - 1-based row number
 * @param {Array} rowArr - row data array
 * @param {string} reviewer
 * @param {Date} now
 * @param {string} decisionVal
 */
function executeMergeDecision_(ss, sheet, targetRow, rowArr, reviewer, now, decisionVal) {
  // [REF-004] Parse candidates via helper
  const candidates = parseCandidatesFromReview_(rowArr);

  // [REF-004 + REF-013] Build srcObj via helper
  const srcObj = buildSrcObjFromReview_(ss, rowArr);

  // [REF-001] Delegate to resolveAndPersist_ gateway — no direct Group 1 CRUD calls
  const result = resolveAndPersist_(srcObj, 'MERGE_TO_CANDIDATE', candidates);

  // [PERF-002] สะสม factData ส่งคืนแทนการเขียนทันที — ลดจาก N API calls เหลือ 1 batch write
  if (result && result.factRowData) {
    return { factRowData: result.factRowData };
  }

  // [FIX BUG-B2] 1 setValues
  updateReviewRowStatus_(sheet, targetRow, 'Done', reviewer, now, decisionVal, '');
  return null;
}

// ============================================================
// SECTION 3.5: updateReviewRowStatus_ [NEW BUG-B2 Helper]
// รวม 5× getRange().setValue() → 1× getRange().setValues()
// ลด 5 API calls → 1 API call ต่อ decision
// ============================================================

/**
 * updateReviewRowStatus_ — Batch update status columns ใน Q_REVIEW
 * [NEW v5.4.003] แทนที่ 5× setValue ที่กระจายใน applyReviewDecision()
 */
function updateReviewRowStatus_(sheet, targetRow, status, reviewer, now, decisionVal, note) {
  // อ่าน block คอลัมน์ที่ต้องอัปเดต (STATUS ถึง NOTE เป็น consecutive range)
  const minCol = Math.min(
    REVIEW_IDX.STATUS, REVIEW_IDX.REVIEWER, REVIEW_IDX.REVIEWED_AT,
    REVIEW_IDX.DECISION, REVIEW_IDX.NOTE
  ) + 1; // 1-based

  const maxCol = Math.max(
    REVIEW_IDX.STATUS, REVIEW_IDX.REVIEWER, REVIEW_IDX.REVIEWED_AT,
    REVIEW_IDX.DECISION, REVIEW_IDX.NOTE
  ) + 1; // 1-based

  const numCols = maxCol - minCol + 1;
  const range = sheet.getRange(targetRow, minCol, 1, numCols);
  const vals = range.getValues()[0]; // อ่าน 1 ครั้ง

  // แก้ค่าใน RAM (0-based relative offset)
  vals[REVIEW_IDX.STATUS - (minCol - 1)] = status;
  vals[REVIEW_IDX.REVIEWER - (minCol - 1)] = reviewer;
  vals[REVIEW_IDX.REVIEWED_AT - (minCol - 1)] = now;
  vals[REVIEW_IDX.DECISION - (minCol - 1)] = decisionVal;
  vals[REVIEW_IDX.NOTE - (minCol - 1)] = note || '';

  range.setValues([vals]); // ✅ 1 write API call
}

// ============================================================
// SECTION 3.6: executeReviewCreateNew_ [RF-02 Extracted from applyReviewDecision]
// แยก CREATE_NEW case ออกจาก applyReviewDecision เพื่อลด cognitive load
// [REF-004 + REF-013] Uses buildSrcObjFromReview_ for srcObj construction
// Logic เดิมทั้งหมด ไม่เปลี่ยน behavior
// ============================================================

/**
 * executeReviewCreateNew_ — ดำเนินการ CREATE_NEW decision
 * [RF-02] แยกจาก applyReviewDecision CREATE_NEW case (~80 บรรทัด)
 * [REF-013] Uses buildSrcObjFromReview_ for srcObj construction
 * [REF-001] Now delegates to resolveAndPersist_() instead of calling Group 1 CRUD directly
 * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} ss
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet - Q_REVIEW sheet
 * @param {number} targetRow - 1-based row number
 * @param {Array} rowArr - row data array
 * @param {string} reviewer - reviewer name
 * @param {Date} now - current timestamp
 * @param {string} decisionVal - decision value ('CREATE_NEW')
 */
function executeReviewCreateNew_(ss, sheet, targetRow, rowArr, reviewer, now, decisionVal) {
  // [REF-013] Build srcObj via shared helper instead of inline construction
  const srcObj = buildSrcObjFromReview_(ss, rowArr);

  // [REF-001] Delegate to resolveAndPersist_ gateway — no direct Group 1 CRUD calls
  const result = resolveAndPersist_(srcObj, 'CREATE_NEW', null);

  // [PERF-002] สะสม factData ส่งคืนแทนการเขียนทันที — ลดจาก N API calls เหลือ 1 batch write
  // caller (applyAllPendingDecisions) จะเขียน batch หลังลูปจบ
  if (result && result.factRowData) {
    return { factRowData: result.factRowData };
  }

  updateReviewRowStatus_(sheet, targetRow, 'Done', reviewer, now, decisionVal, 'Resolved (Created New)');
  return null;
}

// ============================================================
// SECTION 4: Stats & Report (ไม่เปลี่ยน)
// ============================================================

function getReviewStats() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET.Q_REVIEW);
  const stats = { pending: 0, done: 0, escalated: 0, total: 0 };

  if (!sheet || sheet.getLastRow() < 2) return stats;

  const statusCol = REVIEW_IDX.STATUS + 1;
  const totalRows = sheet.getLastRow() - 1;
  const statusData = sheet.getRange(2, statusCol, totalRows, 1).getValues();

  statusData.forEach(r => {
    const s = String(r[0] || '').trim();
    stats.total++;
    if (s === 'Done') stats.done++;
    else if (s === 'Escalated') stats.escalated++;
    else stats.pending++;
  });

  return stats;
}

function highlightHighPriorityReviews() {
  // [FIX B2 v5.5.002] เพิ่ม try-catch — menu entry point ต้องมี error handling
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(SHEET.Q_REVIEW);
    if (!sheet || sheet.getLastRow() < 2) return;

    const totalRows = sheet.getLastRow() - 1;
    const totalCols = SCHEMA[SHEET.Q_REVIEW].length;
    const data = sheet.getRange(2, 1, totalRows, totalCols).getValues();

    const bgColors = [];
    data.forEach(row => {
      const priority = Number(row[REVIEW_IDX.PRIORITY] || 0);
      const status = String(row[REVIEW_IDX.STATUS] || '').trim();
      let color = null;

      if (status === 'Done') color = '#d9ead3';
      else if (priority >= 3) color = '#f4cccc';
      else if (priority === 2) color = '#fff2cc';

      bgColors.push(Array(totalCols).fill(color));
    });

    sheet.getRange(2, 1, totalRows, totalCols).setBackgrounds(bgColors);
    logDebug('ReviewService', 'highlightHighPriorityReviews: ' + totalRows + ' แถว');
  } catch (e) {
    logError('ReviewService', 'highlightHighPriorityReviews ล้มเหลว: ' + e.message, e);
  }
}

// ============================================================
// SECTION 5: Security Helpers (SEC-007 Fix)
// ============================================================

/**
 * maskReviewerEmail_ — [SEC-007] ปกปิด Email ผู้ Review สำหรับ Audit Trail
 * แสดงเฉพาะส่วนต้น + @ + domain ไม่แสดงชื่อเต็ม
 * ตัวอย่าง: "somchai@company.com" → "s***i@company.com"
 * @param {string} email
 * @return {string}
 */
function maskReviewerEmail_(email) {
  if (!email || email === 'Admin' || email === 'Admin (Auto)' || email === 'System') return email;

  const parts = String(email).split('@');
  if (parts.length !== 2) return email;

  const local = parts[0];
  const domain = parts[1];

  if (local.length <= 2) return local[0] + '***@' + domain;
  return local[0] + '***' + local[local.length - 1] + '@' + domain;
}
