/**
 * VERSION: 5.5.020
 * FILE: 13_ReportService.gs
 * LMDS V5.5 — Data Quality Report Service
 * ===================================================
 * PURPOSE:
 *   สร้างรายงาน Data Quality ของระบบ LMDS
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
 *     - 01_Config (SHEET.RPT_QUALITY, SHEET.FACT_DELIVERY, SHEET.M_PERSON, SHEET.M_PLACE, SHEET.M_GEO_POINT, SHEET.M_DESTINATION, FACT_IDX.*, PERSON_IDX.*, PLACE_IDX.*, GEO_IDX.*, DEST_IDX.*, APP_CONST.*)
 *     - 02_Schema (SCHEMA)
 *     - 06_PersonService (loadAllPersons_)
 *     - 07_PlaceService (loadAllPlaces_)
 *     - 08_GeoService (loadAllGeos_)
 *     - 09_DestinationService (loadAllDestinations_)
 *     - 12_ReviewService (getReviewStats)
 *   CALLS (Invokes):
 *     - getReviewStats() → 12_ReviewService
 *     - logError/logInfo() → 03_SetupSheets
 *   EXPORTS TO:
 *     - 00_App (buildFullQualityReport — menu trigger)
 *   SHEETS ACCESSED:
 *     - SHEET.RPT_QUALITY (Write: quality report output)
 *     - SHEET.FACT_DELIVERY (Read: match status counts)
 *     - SHEET.M_PERSON (Read: active row count)
 *     - SHEET.M_PLACE (Read: active row count)
 *     - SHEET.M_GEO_POINT (Read: active row count)
 *     - SHEET.M_DESTINATION (Read: destination count)
 * ===================================================
 * ARCHITECTURE:
 *   Report Builder
 *   ┌──────────────────────────────────────────────┐
 *   │  buildFullQualityReport                      │
 *   │  ├─ auto/review/new/error counts from FACT   │
 *   │  ├─ match rates (auto & processed)           │
 *   │  ├─ master data counts (person/place/geo/dst)│
 *   │  └─ write to RPT_DATA_QUALITY sheet          │
 *   │  countActiveRows_                            │
 *   │  └─ active row counter per sheet             │
 *   │  safeUiAlert_                                │
 *   │  └─ trigger-safe UI alert                    │
 *   └──────────────────────────────────────────────┘
 * ===================================================
 */

// ============================================================
// SECTION 1: buildFullQualityReport
// ============================================================

/**
 * buildFullQualityReport — สร้างรายงาน Data Quality และเขียนลง RPT_DATA_QUALITY
 * [REF-008] Orchestrator: collect stats → compute metrics → write report → alert
 * [FIX v003] แยก autoMatchRate vs processedRate
 * [FIX v003] reviewCount จาก getReviewStats().pending (รอ Review จริง)
 * [FIX v003] totalFact กรอง Active rows เท่านั้น
 * [FIX v003] เพิ่ม unclassifiedCount
 * [FIX v003] guard ui.alert() กัน Trigger Error
 * [FIX BUG-A2] v5.4.003: เพิ่ม try-catch outer
 */

function buildFullQualityReport() {
  try {
    const ss       = SpreadsheetApp.getActiveSpreadsheet();
    const rptSheet = ss.getSheetByName(SHEET.RPT_QUALITY);
    if (!rptSheet) {
      // [FIX R13-06 REVIEW15] Rule 13: ส่ง Error object เพื่อ stack trace ชี้ตำแหน่งที่เกิด
      logError('ReportService',
        'ไม่พบชีต ' + SHEET.RPT_QUALITY,
        new Error('SHEET_NOT_FOUND'));
      return;
    }

  // [REF-008] Step 1: Collect all system statistics
  const stats = collectSystemStats_(ss);

  // [REF-008] Step 2: Compute derived metrics from stats
  const metrics = computeReportMetrics_(stats);

  // [REF-008] Step 3: Write report row to sheet
  // [FIX B11 v5.5.002] ใช้ getRange+setValues แทน appendRow (consistent batch pattern)
  const nextRow = rptSheet.getLastRow() + 1;
  rptSheet.getRange(nextRow, 1, 1, metrics.reportRow.length).setValues([metrics.reportRow]);

  logInfo('ReportService',
    `Report เสร็จ — Total:${stats.totalFact} Auto:${metrics.autoMatchRate}% ` +
    `Processed:${metrics.processedRate}% Q_Pending:${stats.pendingInQueue}`);

  // [FIX v003] guard ui.alert() — ถ้ารันจาก Trigger จะ Error
  safeUiAlert_(
    '📊 Data Quality Report\n\n' +
    `รวมทั้งหมด (Active):  ${stats.totalFact} รายการ\n` +
    `Auto Match:            ${stats.autoCount} (${metrics.autoMatchRate}%)\n` +
    `สร้างใหม่:            ${stats.newCount}\n` +
    `รอ Review (Q):         ${stats.pendingInQueue}\n` +
    `Error:                 ${stats.errorCount}\n` +
    `Unclassified:          ${stats.unclassifiedCount}\n\n` +
    `Master Data:\n` +
    `  Person:  ${stats.personCount}\n` +
    `  Place:   ${stats.placeCount}\n` +
    `  Geo:     ${stats.geoCount}\n` +
    `  Dest:    ${stats.destCount}`
  );
} catch (err) {
    logError('ReportService', 'buildFullQualityReport: ' + err.message, err);
    safeUiAlert_('❌ สร้างรายงานล้มเหลว: ' + err.message);
  }
}

// ============================================================
// SECTION 1a: collectSystemStats_ — [REF-008] Collect system statistics
// ============================================================

/**
 * collectSystemStats_ — [REF-008] รวบรวมสถิติทั้งหมดจาก FACT_DELIVERY + Master Data
 * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} ss
 * @return {{ totalFact, autoCount, newCount, reviewCount, errorCount, unclassifiedCount, pendingInQueue, personCount, placeCount, geoCount, destCount }}
 */
function collectSystemStats_(ss) {
  // --- นับจาก FACT_DELIVERY (Active rows เท่านั้น) ---
  const factSheet = ss.getSheetByName(SHEET.FACT_DELIVERY);
  let totalFact   = 0;
  let autoCount   = 0;
  let newCount    = 0;
  let reviewCount = 0;
  let errorCount  = 0;
  let unclassifiedCount = 0; // [FIX v003]

  if (factSheet && factSheet.getLastRow() > 1) {
    const totalRows    = factSheet.getLastRow() - 1;

    // [FIX v5.5.001] อ่านเฉพาะ 2 คอลัมน์ MATCH_STATUS และ RECORD_STATUS
    // แทนการอ่านตั้งแต่คอลัมน์ 1 ถึง maxCol (over-reading)
    const statusCol    = FACT_IDX.MATCH_STATUS  + 1;
    const recStatusCol = FACT_IDX.RECORD_STATUS + 1;

    const matchStatusData = factSheet.getRange(2, statusCol, totalRows, 1).getValues();
    const recStatusData   = factSheet.getRange(2, recStatusCol, totalRows, 1).getValues();

    for (let i = 0; i < totalRows; i++) {
      const recStatus = String(recStatusData[i][0] || '').trim();

      // [FIX v003] กรอง Active rows เท่านั้น
      if (recStatus !== APP_CONST.STATUS_ACTIVE) continue;

      totalFact++;
      const matchStatus = String(matchStatusData[i][0] || '').trim();

      switch (matchStatus) {
        case APP_CONST.MATCH_FULL:
        case APP_CONST.MATCH_GEO:
        case APP_CONST.MATCH_FUZZY:
        case 'AUTO_MATCH':
          autoCount++; break;
        case APP_CONST.MATCH_NEW:
        case 'CREATE_NEW':
          newCount++; break;
        case APP_CONST.MATCH_REVIEW:
        case 'REVIEW':
        case 'NEEDS_REVIEW':
          reviewCount++; break;
        case APP_CONST.MATCH_ERROR:
        case 'ERROR':
          errorCount++; break;
        default:
          // [FIX v003] นับ unclassified
          if (matchStatus) unclassifiedCount++;
          break;
      }
    }
  }

  // [FIX v003] reviewCount ที่แม่นยำ = Pending ใน Q_REVIEW จริงๆ
  const reviewStats     = getReviewStats();
  const pendingInQueue  = reviewStats.pending;

  // นับ Master Data
  const personCount = countActiveRows_(ss, SHEET.M_PERSON,     PERSON_IDX.STATUS);
  const placeCount  = countActiveRows_(ss, SHEET.M_PLACE,      PLACE_IDX.STATUS);
  const geoCount    = countActiveRows_(ss, SHEET.M_GEO_POINT,  GEO_IDX.STATUS);
  const destCount   = countActiveRows_(ss, SHEET.M_DESTINATION,DEST_IDX.STATUS);

  return {
    totalFact, autoCount, newCount, reviewCount, errorCount, unclassifiedCount,
    pendingInQueue, personCount, placeCount, geoCount, destCount,
  };
}

// ============================================================
// SECTION 1b: computeReportMetrics_ — [REF-008] Compute derived metrics
// ============================================================

/**
 * computeReportMetrics_ — [REF-008] คำนวณตัวเลขอนุพันธ์จาก stats
 * @param {{ totalFact, autoCount, newCount, pendingInQueue, errorCount, unclassifiedCount, personCount, placeCount, geoCount, destCount }} stats
 * @return {{ autoMatchRate, processedRate, note, reportRow }}
 */
function computeReportMetrics_(stats) {
  // [FIX v003] autoMatchRate = เฉพาะ AUTO_MATCH (ไม่รวม CREATE_NEW)
  const autoMatchRate = stats.totalFact > 0
    ? Math.round((stats.autoCount / stats.totalFact) * 100) : 0;

  // processedRate = AUTO + CREATE_NEW (ทั้งหมดที่ผ่าน Match Engine)
  const processedRate = stats.totalFact > 0
    ? Math.round(((stats.autoCount + stats.newCount) / stats.totalFact) * 100) : 0;

  const note = [
    `Person:${stats.personCount}`,
    `Place:${stats.placeCount}`,
    `Geo:${stats.geoCount}`,
    `Dest:${stats.destCount}`,
    `Q_Pending:${stats.pendingInQueue}`,
    `Unclassified:${stats.unclassifiedCount}`,
  ].join(' | ');

  const reportRow = [
    new Date(),       // report_date
    stats.totalFact,  // total_records
    stats.autoCount,  // auto_matched
    stats.pendingInQueue, // reviewed (Pending จริงใน Q_REVIEW)
    stats.newCount,   // created_new
    stats.errorCount, // failed
    `Auto:${autoMatchRate}% / Processed:${processedRate}%`, // match_rate
    note,             // notes
  ];

  return { autoMatchRate, processedRate, note, reportRow };
}

// ============================================================
// SECTION 2: Helper Functions
// ============================================================

/**
 * countActiveRows_ — นับแถว Active ใน Master Sheet
 * [FIX v003] กรอง Active เท่านั้น ไม่ใช่ นับทุกแถว
 */
function countActiveRows_(ss, sheetName, statusIdx) {
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet || sheet.getLastRow() < 2) return 0;

  const statusCol = statusIdx + 1;
  const totalRows = sheet.getLastRow() - 1;
  const data      = sheet.getRange(2, statusCol, totalRows, 1).getValues();

  return data.filter(r =>
    String(r[0] || '').trim() === APP_CONST.STATUS_ACTIVE
  ).length;
}

// [REMOVED v5.4.003] safeUiAlert_Report_ — ย้ายไป 14_Utils.gs (ชื่อ safeUiAlert_) แล้ว
// ทุก caller เรียก safeUiAlert_() โดยตรงจาก 14_Utils.gs
