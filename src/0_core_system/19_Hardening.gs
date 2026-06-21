/**
 * VERSION: 5.5.020
 * FILE: 19_Hardening.gs
 * LMDS V5.5 — System Hardening & Preflight Audit
 * [FIX BUG-A2] v5.4.003: runPreflightAudit() เพิ่ม try-catch
 * [ADD v5.4.003] buildGlobalAliasDedupSet_() — helper ที่ generatePersonAliasesFromHistory ต้องใช้
 * ===================================================
 * PURPOSE:
 *   ตรวจสอบความสมบูรณ์ของข้อมูลก่อนประมวลผล (Preflight Audit)
 *   และตรวจจับปัญหาซ้ำซ้อน
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
 *     - 01_Config (SHEET.*, SRC_IDX.*, FACT_IDX.*, PERSON_ALIAS_IDX.*, SCHEMA)
 *     - 02_Schema (SCHEMA)
 *     - 06_PersonService (loadAllPersons_, loadAllAliases_)
 *     - 07_PlaceService (loadAllPlaces_)
 *     - 08_GeoService (loadAllGeos_)
 *     - 09_DestinationService (loadAllDestinations_)
 *     - 11_TransactionService (loadAllFacts_)
 *     - 05_NormalizeService (normalizeForCompare)
 *     - 14_Utils (generateShortId, normalizeInvoiceNo)
 *   CALLS (Invokes):
 *     - loadAllPersons_() → 06_PersonService
 *     - loadAllAliases_() → 06_PersonService
 *     - normalizeForCompare() → 05_NormalizeService
 *     - generateShortId() → 14_Utils
 *     - normalizeInvoiceNo() → 14_Utils
 *     - invalidateAliasCache_() → 06_PersonService
 *     - logInfo() → 03_SetupSheets
 *     - flushLogBuffer_() → 03_SetupSheets (called in finally of runPreflightAudit) [V5.5.008 P2 #11]
 *   EXPORTS TO:
 *     - 00_App (runPreflightAudit, detectDoubleProcessing, generatePersonAliasesFromHistory — menu trigger)
 *   SHEETS ACCESSED:
 *     - SHEET.SOURCE (Read: sync status integrity check)
 *     - SHEET.FACT_DELIVERY (Read: double processing detection)
 *     - SHEET.M_PERSON_ALIAS (Write: alias generation output)
 *     - All SHEET.* constants (Read: iterated via runPreflightAudit)
 * ===================================================
 * ARCHITECTURE:
 *   ┌─────────────────────────────────────────────────────┐
 *   │                19_Hardening.gs                      │
 *   │           System Hardening & Audit                  │
 *   ├─────────────────────────────────────────────────────┤
 *   │                                                     │
 *   │  runPreflightAudit ─── Schema integrity check       │
 *   │       │                  + API key validation       │
 *   │       │                  + flushLogBuffer_() in     │
 *   │       │                    finally [V5.5.008 #11]   │
 *   │                                                     │
 *   │  fixMissingSyncStatus ── Batch sync status repair   │
 *   │                                                     │
 *   │  detectDoubleProcessing ─ Duplicate detection       │
 *   │       │                  in FACT_DELIVERY           │
 *   │       │                                             │
 *   │  generatePersonAliasesFromHistory                   │
 *   │       └── Auto-alias generation from                │
 *   │           delivery history (FACT_DELIVERY)          │
 *   │                                                     │
 *   └─────────────────────────────────────────────────────┘
 * ===================================================
 */

// [PERF-007] Checkpoint key for generatePersonAliasesFromHistory Resume mechanism
const HARDENING_ALIAS_CHECKPOINT_KEY = 'HARDENING_ALIAS_CHECKPOINT';

// ============================================================
// SECTION 1: runPreflightAudit
// [FIX BUG-A2] เพิ่ม try-catch outer
// ============================================================

function runPreflightAudit() {
  // [FIX BUG-A2] try-catch ครอบ
  // [FIX BUG-04 v5.5.001] เปลี่ยน ui.alert() เป็น safeUiAlert_() — trigger-safe
  try {
    const logs = [];

    logInfo('Hardening', 'เริ่มรัน Preflight Audit');

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    Object.keys(SHEET).forEach(key => {
      const sheetName = SHEET[key];
      const sheet     = ss.getSheetByName(sheetName);
      if (!sheet) {
        logs.push('❌ ไม่พบชีต: ' + sheetName);
      } else {
        const expectedCols = SCHEMA[sheetName] ? SCHEMA[sheetName].length : 0;
        if (expectedCols > 0 && sheet.getLastColumn() < expectedCols) {
          logs.push('⚠️ ชีต ' + sheetName + ' มีคอลัมน์น้อยกว่า Schema (' +
                    sheet.getLastColumn() + '/' + expectedCols + ')');
        }
      }
    });

    const props = PropertiesService.getScriptProperties().getProperties();
    if (!props.GEMINI_API_KEY) {
      logs.push('⚠️ ยังไม่ได้ตั้งค่า GEMINI_API_KEY');
    }

    const srcSheet = ss.getSheetByName(SHEET.SOURCE);
    if (srcSheet) {
      const lastRow = srcSheet.getLastRow();
      if (lastRow > 1) {
        const statusCol  = SRC_IDX.SYNC_STATUS + 1;
        const statusData = srcSheet.getRange(2, statusCol, lastRow - 1, 1).getValues();
        const emptyCount = statusData.filter(r => !r[0]).length;
        if (emptyCount > 0) {
          logs.push('ℹ️ พบแถวที่ไม่มีสถานะ Sync ใน Source: ' + emptyCount + ' แถว');
        }
      }
    }

    if (logs.length === 0) {
      safeUiAlert_('✅ Preflight Audit: ระบบพร้อมทำงาน 100%');
    } else {
      safeUiAlert_('📊 ผลการตรวจสอบ Preflight Audit:\n\n' +
               logs.join('\n') +
               '\n\nพบจุดที่ควรตรวจสอบ ' + logs.length + ' รายการ');
    }

  } catch (err) {
    logError('Hardening', 'runPreflightAudit: ' + err.message, err);
    safeUiAlert_('❌ Preflight Audit ล้มเหลว: ' + err.message);
  } finally {
    // [FIX v5.5.008 P2 #11] flush log buffer ก่อน exit — ป้องกัน log entries <50 หาย
    if (typeof flushLogBuffer_ === 'function') flushLogBuffer_();
  }
}

// ============================================================
// SECTION 2: fixMissingSyncStatus [FIX v5.5.001: เพิ่ม try-catch]
// ============================================================

function fixMissingSyncStatus() {
  // [FIX v5.5.001] เพิ่ม try-catch ครอบทั้งฟังก์ชัน — เช่นเดียวกับ entry-point อื่นๆ
  try {
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET.SOURCE);
  if (!sheet) return;
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return;

  const statusCol = SRC_IDX.SYNC_STATUS + 1;
  const range     = sheet.getRange(2, statusCol, lastRow - 1, 1);
  const data      = range.getValues();
  let   fixed     = 0;

  for (let i = 0; i < data.length; i++) {
    if (!data[i][0]) { data[i][0] = 'PENDING'; fixed++; }
  }
  if (fixed > 0) {
    range.setValues(data);
    SpreadsheetApp.getActiveSpreadsheet()
      .toast('✅ ซ่อมแซมสถานะ Sync สำเร็จ: ' + fixed + ' แถว', 'Hardening');
  }
  } catch (e) {
    logError('Hardening', 'fixMissingSyncStatus ล้มเหลว: ' + e.message, e);
    safeUiAlert_('❌ fixMissingSyncStatus ล้มเหลว: ' + e.message);
  }
}

// ============================================================
// SECTION 3: detectDoubleProcessing (ไม่เปลี่ยน)
// ============================================================

function detectDoubleProcessing() {
  try {
    const ss    = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(SHEET.FACT_DELIVERY);
    if (!sheet || sheet.getLastRow() < 2) return;

    const invoiceData = sheet.getRange(
      2, FACT_IDX.INVOICE_NO + 1, sheet.getLastRow() - 1, 1
    ).getValues();
    const counts     = {};
    const duplicates = [];

    invoiceData.forEach(r => {
      const inv = normalizeInvoiceNo(r[0]);
      if (!inv) return;
      counts[inv] = (counts[inv] || 0) + 1;
    });
    Object.keys(counts).forEach(inv => {
      if (counts[inv] > 1) duplicates.push(inv + ' (' + counts[inv] + ' ครั้ง)');
    });

    // [FIX BUG-05 v5.5.001] เปลี่ยน getUi().alert() เป็น safeUiAlert_() — trigger-safe
    if (duplicates.length === 0) {
      safeUiAlert_('✅ ไม่พบข้อมูลซ้ำใน FACT_DELIVERY');
    } else {
      safeUiAlert_(
        '⚠️ พบ Invoice ซ้ำ ' + duplicates.length + ' รายการ:\n\n' +
        duplicates.slice(0, 10).join('\n') +
        (duplicates.length > 10 ? '\n...และอื่นๆ' : '')
      );
    }
  } catch (err) {
    logError('Hardening', 'detectDoubleProcessing ล้มเหลว: ' + err.message, err);
    safeUiAlert_('เกิดข้อผิดพลาด: ' + err.message);
  }
}

// ============================================================
// SECTION 4: [REF-012] buildGlobalAliasDedupSet_ MOVED to 14_Utils.gs
// The function is now centralized in 14_Utils.gs Section 11.
// All callers (Hardening, AliasService) use the global function.
// ============================================================

// ============================================================
// SECTION 5: generatePersonAliasesFromHistory
// [REFACTOR-05] แยก helper: buildExistingPersonAliasSet_, flushPersonAliasRows_
// ============================================================

function generatePersonAliasesFromHistory() {
  // [REF-006] V5.5.019: Refactored into 4 section helpers for Separation of Concerns
  //   1. acquireAliasHistoryLock_   — SECTION A: AuthZ guard + early validation
  //   2. prepareAliasHistoryContext_ — SECTION B: Load FACT_DELIVERY + Person maps + checkpoint
  //   3. runAliasHistoryLoop_       — SECTION C: Main loop with Time Guard + partial flush
  //   4. finalizeAliasHistory_      — SECTION D: Final flush + clear checkpoint + report
  // Preserve Behavior 100% — same AuthZ, same checkpoint, same flush pattern, same report message

  var setup = acquireAliasHistoryLock_();
  if (!setup) return;

  try {
    var ctx = prepareAliasHistoryContext_(setup.ss);
    if (ctx === null) return;  // empty/error path already handled in prepare

    var loopResult = runAliasHistoryLoop_(ctx, setup.ss);
    finalizeAliasHistory_(ctx, loopResult, setup.ss);
  } catch (err) {
    logError('Hardening', 'generatePersonAliasesFromHistory ล้มเหลว: ' + err.message, err);
    safeUiAlert_('เกิดข้อผิดพลาด: ' + err.message);
  } finally {
    // [PERF-007] flushLogBuffer_ ใน finally — กัน log entries สูญหายเมื่อ Timeout
    if (typeof flushLogBuffer_ === 'function') flushLogBuffer_();
  }
}

/**
 * acquireAliasHistoryLock_ — [REF-006] SECTION A: AuthZ guard + sheet validation
 *   รักษา behavior เดิม 100% — same AuthZ message, same sheet existence check
 * @return {{ss: object}|null} null ถ้า AuthZ fail หรือ sheet missing
 * @private
 */
function acquireAliasHistoryLock_() {
  // [SEC-002] Authorization Guard
  if (typeof isAuthorizedUser_ === 'function' && !isAuthorizedUser_()) {
    safeUiAlert_('🔒 คุณไม่มีสิทธิ์รัน Hardening\nกรุณาติดต่อ Admin');
    return null;
  }

  const ss         = SpreadsheetApp.getActiveSpreadsheet();
  const factSheet  = ss.getSheetByName(SHEET.FACT_DELIVERY);
  const aliasSheet = ss.getSheetByName(SHEET.M_PERSON_ALIAS);
  if (!factSheet || !aliasSheet) {
    safeUiAlert_('❌ ไม่พบชีต FACT_DELIVERY หรือ M_PERSON_ALIAS');
    return null;
  }

  const factRows = factSheet.getLastRow();
  if (factRows < 2) {
    safeUiAlert_('ℹ️ ไม่มีข้อมูลประวัติใน FACT_DELIVERY');
    return null;
  }

  ss.toast('กำลังวิเคราะห์ประวัติการจัดส่งเพื่อสร้าง Alias...', 'Processing', 5);

  return { ss: ss };
}

/**
 * prepareAliasHistoryContext_ — [REF-006] SECTION B: Load FACT_DELIVERY + Person maps + checkpoint
 *   รักษา behavior เดิม 100% — same checkpoint load, same Person Map build, same dedup set
 * @param {object} ss - Active spreadsheet
 * @return {Object|null} context object หรือ null ถ้า error
 * @private
 */
function prepareAliasHistoryContext_(ss) {
  const factSheet  = ss.getSheetByName(SHEET.FACT_DELIVERY);
  const aliasSheet = ss.getSheetByName(SHEET.M_PERSON_ALIAS);
  const factRows   = factSheet.getLastRow();

  const factData = factSheet.getRange(
    2, 1, factRows - 1, SCHEMA[SHEET.FACT_DELIVERY].length
  ).getValues();

  // ─── [PERF-007] โหลด Checkpoint ───
  //   ถ้ามี checkpoint (จากการ Time Guard หยุดกลางคันรอบก่อน) → เริ่มจาก idx นั้น
  //   ถ้าไม่มี → เริ่มจาก 0
  //   Stale protection: checkpoint เก่ากว่า 24 ชม. → auto clear (กัน garbage)
  var checkpoint = loadHardeningAliasCheckpoint_();
  var startIdx = checkpoint.startIdx || 0;

  if (startIdx > 0) {
    ss.toast('🔄 Resume จากแถว ' + (startIdx + 1) + '...', APP_NAME, 5);
    logInfo('Hardening', 'generatePersonAliasesFromHistory: resume จาก idx ' + startIdx);
  }

  // โหลด Person Map
  const allPersons        = loadAllPersons_();
  const personCanonicalMap = new Map();
  const personUuidMap      = new Map();
  allPersons.forEach(function(p) {
    if (p.personId && p.canonical)   personCanonicalMap.set(p.personId, normalizeForCompare(p.canonical));
    if (p.personId && p.masterUuid)  personUuidMap.set(p.personId, p.masterUuid);
  });

  // [REFACTOR-05] ใช้ buildExistingPersonAliasSet_() แทน inline code
  const existingAliasSet = buildExistingPersonAliasSet_();

  // [FIX BUG-B1] buildGlobalAliasDedupSet_ โหลด M_ALIAS ครั้งเดียว
  const existingGlobalAliasSet = buildGlobalAliasDedupSet_();

  return {
    ss: ss,
    aliasSheet: aliasSheet,
    factData: factData,
    startIdx: startIdx,
    personCanonicalMap: personCanonicalMap,
    personUuidMap: personUuidMap,
    existingAliasSet: existingAliasSet,
    existingGlobalAliasSet: existingGlobalAliasSet,
    newAliasRows: [],
    newGlobalRows: [],
    now: new Date(),
    hardeningStart: new Date(),
    hardeningLimit: AI_CONFIG.TIME_LIMIT_MS || 300000,  // 5 นาที
    ALIAS_ENRICH_SCORE: 95  // [FIX v5.5.001] Named constant
  };
}

/**
 * runAliasHistoryLoop_ — [REF-006] SECTION C: Main loop with Time Guard + partial flush
 *   รักษา behavior เดิม 100% — same Time Guard (idx % 100), same partial flush, same checkpoint save
 * @param {Object} ctx - context from prepareAliasHistoryContext_
 * @param {object} ss - Active spreadsheet
 * @return {{timedOut: boolean, lastIdx: number}}
 * @private
 */
function runAliasHistoryLoop_(ctx, ss) {
  let timedOut = false;
  let lastIdx = ctx.startIdx;

  // ─── [PERF-007] เริ่มลูปจาก startIdx (จาก checkpoint) แทน 0 ───
  //   เดิม: ทุกครั้งเริ่มจาก idx 0 → รอบที่ 2 ประมวลผล 1,500 แถวแรกซ้ำ (CPU waste ~30-60s)
  //   ใหม่: resume จาก checkpoint → ประหยัดเวลา ~50-70% สำหรับการ hardening ครั้งใหญ่
  for (let idx = ctx.startIdx; idx < ctx.factData.length; idx++) {
    lastIdx = idx;
    // [REFACTOR-05] Time Guard: flush แล้ว break + บันทึก checkpoint
    if (idx % 100 === 0 && (new Date() - ctx.hardeningStart) > (ctx.hardeningLimit - 30000)) {
      if (ctx.newAliasRows.length + ctx.newGlobalRows.length > 0) {
        const flushedPA = flushPersonAliasRows_(ctx.aliasSheet, ctx.newAliasRows);
        const flushedGA = flushGlobalAliasRows_(ss, ctx.newGlobalRows);
        ctx.newAliasRows = [];
        ctx.newGlobalRows = [];
        logWarn('Hardening', `generatePersonAliasesFromHistory: flushed partial at ${idx}/${ctx.factData.length} (PA:${flushedPA}, GA:${flushedGA})`);
      }
      // [PERF-007] บันทึก checkpoint ก่อน break → resume รอบถัดไป
      saveHardeningAliasCheckpoint_(idx);
      timedOut = true;
      break;
    }

    const aliasResult = hardeningBuildOneAliasRow_(
      ctx.factData[idx], ctx.personCanonicalMap, ctx.personUuidMap,
      ctx.existingAliasSet, ctx.existingGlobalAliasSet, ctx.ALIAS_ENRICH_SCORE, ctx.now
    );
    if (aliasResult.paRow) ctx.newAliasRows.push(aliasResult.paRow);
    if (aliasResult.gaRow) ctx.newGlobalRows.push(aliasResult.gaRow);
  }

  return { timedOut: timedOut, lastIdx: lastIdx };
}

/**
 * finalizeAliasHistory_ — [REF-006] SECTION D: Final flush + clear checkpoint + report
 *   รักษา behavior เดิม 100% — same final flush, same clearCheckpoint condition, same alert message
 * @param {Object} ctx
 * @param {Object} loopResult - {timedOut, lastIdx}
 * @param {object} ss
 * @private
 */
function finalizeAliasHistory_(ctx, loopResult, ss) {
  // Final flush
  const totalPA = flushPersonAliasRows_(ctx.aliasSheet, ctx.newAliasRows);
  const totalGA = flushGlobalAliasRows_(ss, ctx.newGlobalRows);

  // [PERF-007] ล้าง checkpoint เมื่อเสร็จสมบูรณ์ (ถ้าไม่ Timeout)
  if (!loopResult.timedOut) {
    clearHardeningAliasCheckpoint_();
  }

  const timeoutMsg = loopResult.timedOut
    ? '\n\n⚠️ หยุดก่อนเพราะ Timeout — บันทึกตำแหน่งไว้แล้ว กด Run ใหม่จะทำต่อ'
    : '';
  safeUiAlert_(
    (totalPA > 0 || totalGA > 0)
      ? '✅ สร้าง Alias สำเร็จ!\n' +
        '- M_PERSON_ALIAS: ' + totalPA + ' รายการ\n' +
        '- M_ALIAS: ' + totalGA + ' รายการ' +
        timeoutMsg
      : 'ℹ️ ตรวจสอบเรียบร้อย: ข้อมูล Alias อัปเดตถ้วนแล้ว' +
        timeoutMsg
  );
}

// ============================================================
// SECTION 6b: [PERF-007] generatePersonAliasesFromHistory Checkpoint Helpers
//   ใช้ PropertiesService เก็บตำแหน่ง idx ปัจจุบัน — เหมือน MIGRATION_HybridAliasSystem pattern
// ============================================================

/**
 * saveHardeningAliasCheckpoint_ — [PERF-007] บันทึกตำแหน่ง generatePersonAliasesFromHistory ปัจจุบัน
 *   เรียกเมื่อ Time Guard หยุดกลางคัน → resume รอบถัดไปเริ่มจาก idx นี้
 * @param {number} idx - ตำแหน่ง array index ปัจจุบัน (0-based)
 */
function saveHardeningAliasCheckpoint_(idx) {
  PropertiesService.getScriptProperties().setProperty(
    HARDENING_ALIAS_CHECKPOINT_KEY,
    JSON.stringify({ startIdx: idx, timestamp: Date.now() })
  );
}

/**
 * loadHardeningAliasCheckpoint_ — [PERF-007] โหลดตำแหน่ง generatePersonAliasesFromHistory ที่บันทึกไว้
 *   Stale protection: checkpoint เก่ากว่า 24 ชม. → auto clear (กัน garbage)
 * @return {{ startIdx: number, timestamp: number }}
 */
function loadHardeningAliasCheckpoint_() {
  var raw = PropertiesService.getScriptProperties().getProperty(HARDENING_ALIAS_CHECKPOINT_KEY);
  if (!raw) return { startIdx: 0 };
  try {
    var cp = JSON.parse(raw);
    // Stale protection: เก่ากว่า 24 ชม. → clear
    if (cp.timestamp && (Date.now() - cp.timestamp) > 24 * 60 * 60 * 1000) {
      clearHardeningAliasCheckpoint_();
      return { startIdx: 0 };
    }
    return cp;
  } catch (e) {
    return { startIdx: 0 };
  }
}

/**
 * clearHardeningAliasCheckpoint_ — [PERF-007] ล้าง checkpoint หลัง generatePersonAliasesFromHistory เสร็จสมบูรณ์
 */
function clearHardeningAliasCheckpoint_() {
  PropertiesService.getScriptProperties().deleteProperty(HARDENING_ALIAS_CHECKPOINT_KEY);
}

/**
 * hardeningBuildOneAliasRow_ — processes 1 fact row for generatePersonAliasesFromHistory
 * Checks personId, rawName, canonical match, dedup sets, and builds PA/GA rows
 * @param {Array} factRow - single row from FACT_DELIVERY data
 * @param {Map} personCanonicalMap - personId → normalizedCanonical
 * @param {Map} personUuidMap - personId → masterUuid
 * @param {Set} existingAliasSet - dedup set for M_PERSON_ALIAS (mutated in place)
 * @param {Set} existingGlobalAliasSet - dedup set for M_ALIAS (mutated in place)
 * @param {number} aliasEnrichScore - confidence score for alias rows
 * @param {Date} now - timestamp
 * @return {{ paRow: Array|null, gaRow: Array|null }}
 */
function hardeningBuildOneAliasRow_(factRow, personCanonicalMap, personUuidMap, existingAliasSet, existingGlobalAliasSet, aliasEnrichScore, now) {
  const pId     = String(factRow[FACT_IDX.PERSON_ID]   || '').trim();
  const rawName = String(factRow[FACT_IDX.SHIP_TO_NAME] || '').trim();
  if (!pId || !rawName) return { paRow: null, gaRow: null };

  const rawNorm = normalizeForCompare(rawName);
  if (!rawNorm || rawNorm.length < 2) return { paRow: null, gaRow: null };

  const canonicalNorm = personCanonicalMap.get(pId);
  if (canonicalNorm && canonicalNorm === rawNorm) return { paRow: null, gaRow: null };

  let paRow = null;
  let gaRow = null;

  // M_PERSON_ALIAS
  const paKey = pId + '::' + rawNorm;
  if (!existingAliasSet.has(paKey)) {
    existingAliasSet.add(paKey);
    paRow = [generateShortId('PA'), pId, rawName, aliasEnrichScore, now, true];
  }

  // M_ALIAS (Batch — ไม่เรียก createGlobalAlias ใน loop)
  const masterUuid = personUuidMap.get(pId);
  if (masterUuid) {
    const globalKey = 'PERSON::' + masterUuid + '::' + rawNorm;
    if (!existingGlobalAliasSet.has(globalKey)) {
      existingGlobalAliasSet.add(globalKey);
      gaRow = [
        generateShortId('A'), masterUuid, rawName, 'PERSON',
        aliasEnrichScore, 'HISTORY_ENRICH', now, true
      ];
    }
  }

  return { paRow: paRow, gaRow: gaRow };
}

/**
 * buildExistingPersonAliasSet_ — [REFACTOR-05] โหลด M_PERSON_ALIAS เป็น dedup Set
 * Format key: "personId::normalizedAlias"
 * @return {Set<string>}
 */
function buildExistingPersonAliasSet_() {
  const set = new Set();
  const existingAliasData = loadAllAliases_();
  existingAliasData.forEach(function(r) {
    if (!r[PERSON_ALIAS_IDX.ACTIVE_FLAG]) return;
    const pId   = String(r[PERSON_ALIAS_IDX.PERSON_ID]  || '').trim();
    const aNorm = normalizeForCompare(r[PERSON_ALIAS_IDX.ALIAS_NAME]);
    if (pId && aNorm) set.add(pId + '::' + aNorm);
  });
  return set;
}

/**
 * flushPersonAliasRows_ — [REFACTOR-05] Batch write M_PERSON_ALIAS + invalidate cache
 * @param {GoogleAppsScript.Spreadsheet.Sheet} aliasSheet
 * @param {Array[]} rows - new alias rows to write
 * @return {number} number of rows written
 */
function flushPersonAliasRows_(aliasSheet, rows) {
  if (!rows || rows.length === 0) return 0;
  aliasSheet.getRange(
    aliasSheet.getLastRow() + 1, 1,
    rows.length, SCHEMA[SHEET.M_PERSON_ALIAS].length
  ).setValues(rows);
  invalidateAliasCache_();
  return rows.length;
}

/**
 * flushGlobalAliasRows_ — [PERF-003] Batch write M_ALIAS + Pre-loaded dedup
 * เปลี่ยนจากการเรียก createGlobalAlias() ทีละแถว (O(N) reads + O(N) writes)
 * เป็นการโหลด dedup set 1 ครั้ง → ตรวจใน RAM → สะสมแถวใหม่ → batch setValues 1 ครั้ง
 * ลดจาก ~400-600 API calls (200 aliases) เหลือ ~2-3 API calls
 * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} ss
 * @param {Array[]} rows - new global alias rows: [aliasId, masterUuid, variantName, entityType, confidence, source, createdAt, activeFlag]
 * @return {number} number of rows written
 */
function flushGlobalAliasRows_(ss, rows) {
  if (!rows || rows.length === 0) return 0;

  // [PERF-003] โหลด dedup set 1 ครั้งก่อนลูป แทนที่จะเรียก createGlobalAlias() ทุกรอบ
  var existingSet = buildGlobalAliasDedupSet_();

  var newRows = [];
  rows.forEach(function(aliasRow) {
    var masterUuid   = String(aliasRow[ALIAS_IDX.MASTER_UUID]  || '');
    var variantName  = String(aliasRow[ALIAS_IDX.VARIANT_NAME] || '');
    var entityType   = String(aliasRow[ALIAS_IDX.ENTITY_TYPE]  || '');
    var confidence   = Number(aliasRow[ALIAS_IDX.CONFIDENCE]   || 100);
    var source       = String(aliasRow[ALIAS_IDX.SOURCE]       || 'MANUAL');

    // Dedup check ใน RAM
    var norm = normalizeForCompare(variantName);
    var dedupKey = entityType + '::' + masterUuid + '::' + norm;
    if (!norm || existingSet.has(dedupKey)) return;

    // เพิ่มเข้า set เพื่อป้องกัน duplicate ใน batch เดียวกัน
    existingSet.add(dedupKey);
    newRows.push(aliasRow);
  });

  // Batch write ทั้งหมดครั้งเดียว
  if (newRows.length > 0) {
    var mAliasSheet = ss.getSheetByName(SHEET.M_ALIAS);
    if (mAliasSheet) {
      mAliasSheet.getRange(
        mAliasSheet.getLastRow() + 1, 1,
        newRows.length, SCHEMA[SHEET.M_ALIAS].length
      ).setValues(newRows);

      // [FIX REV7-001] Invalidate M_ALIAS cache โดยตรง — รูปแบบเดียวกับ 10_MatchEngine.gs
      CacheService.getScriptCache().removeAll([CACHE_KEY.GLOBAL_ALIAS_ALL, CACHE_KEY.GLOBAL_ALIAS_REVERSE]);
    }
  }

  return newRows.length;
}

// ============================================================
// SECTION 6: Sheet Protection (SEC-005 Fix)
// ============================================================

/**
 * applySheetProtection_UI — [SEC-005] ตั้งค่า Protected Ranges และ Hidden Sheets
 * สำหรับชีตที่มีข้อมูล Sensitive (PII)
 * เฉพาะ Script Owner / Admin เท่านั้นที่สามารถแก้ไขชีตเหล่านี้ได้
 * [SEC-009 FIX] ขยาย protection ครอบ M_PLACE, M_ALIAS, FACT_DELIVERY, Q_REVIEW
 *               + เพิ่ม LMDS_ADMINS ทั้งหมดเป็น editor
 *               + Q_REVIEW ใช้ Range Protection (ปกป้อง A1:Q — ปล่อย R-V ให้ reviewer แก้ DECISION/STATUS/NOTE)
 */
function applySheetProtection_UI() {
  // [REF-010] V5.5.019: Refactored into helpers for Separation of Concerns + schema-safe range
  //   1. applySheetLevelProtection_  — per-sheet protection (PII sheets)
  //   2. applyReviewRangeProtection_ — Q_REVIEW range protection (uses REVIEW_IDX.* instead of hardcoded 17)
  //   3. applyGeoPointProtection_    — M_GEO_POINT protection
  //   4. buildProtectionReport_      — summary report builder
  // Preserve Behavior 100% — same sheets protected, same editors, same messages

  // [SEC-002] Authorization Guard — เฉพาะ Admin เท่านั้น
  if (typeof isAuthorizedUser_ === 'function' && !isAuthorizedUser_()) {
    safeUiAlert_('🔒 คุณไม่มีสิทธิ์ตั้งค่าการป้องกันชีต\nกรุณาติดต่อ Admin');
    return;
  }

  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const me = Session.getEffectiveUser().getEmail();
    const results = [];

    // [SEC-009 FIX] ดึงรายชื่อ Admin ทั้งหมดเพื่อเพิ่มเป็น editor
    const adminsStr = String(
      PropertiesService.getScriptProperties().getProperty('LMDS_ADMINS') || ''
    ).trim();
    const adminEmails = adminsStr
      ? adminsStr.split(',').map(function(e) { return e.trim(); }).filter(Boolean)
      : [];

    // === 1. Protected Ranges: ชีตที่มี PII ===
    // [SEC-009 FIX] ขยาย protectedSheets ครอบทุกชีตที่มี PII/Single Writer
    const protectedSheets = [
      { name: SHEET.EMPLOYEE,       reason: 'ข้อมูลพนักงาน (เลขบัตร, เบอร์โทร)', hide: true },
      { name: SHEET.M_PERSON,       reason: 'ข้อมูลบุคคล (เบอร์โทร)', hide: false },
      { name: SHEET.M_PLACE,        reason: 'ที่อยู่ลูกค้า + master_uuid (PII)', hide: false },
      { name: SHEET.M_ALIAS,        reason: 'Global Alias Ledger (Single Writer Pattern)', hide: false },
      { name: SHEET.FACT_DELIVERY,  reason: 'ประวัติการขนส่ง (Invoice + ชื่อ + ที่อยู่ PII)', hide: false },
      { name: SHEET.SOURCE,         reason: 'ข้อมูลต้นทาง (ที่อยู่, Email, ชื่อลูกค้า)', hide: true },
    ];

    protectedSheets.forEach(config => {
      const msg = applySheetLevelProtection_(ss, config, me, adminEmails);
      results.push(msg);
    });

    // [SEC-009 FIX] === 1b. Q_REVIEW ใช้ Range Protection ===
    const reviewMsg = applyReviewRangeProtection_(ss, me, adminEmails);
    if (reviewMsg) results.push(reviewMsg);

    // === 2. ป้องกันชีต M_GEO_POINT ===
    const geoMsg = applyGeoPointProtection_(ss, me, adminEmails);
    if (geoMsg) results.push(geoMsg);

    logInfo('Hardening', '[SEC-005] ตั้งค่า Sheet Protection สำเร็จ (7 sheets + M_GEO_POINT, Q_REVIEW Range Protection)');
    safeUiAlert_('🛡️ ตั้งค่าการป้องกันข้อมูล Sensitive สำเร็จ!\n\n' + results.join('\n'));

  } catch (err) {
    logError('Hardening', '[SEC-005] applySheetProtection_UI ล้มเหลว: ' + err.message, err);
    safeUiAlert_('❌ ตั้งค่าการป้องกันล้มเหลว: ' + err.message);
  }
}

/**
 * applySheetLevelProtection_ — [REF-010] Protect single PII sheet
 *   รักษา behavior เดิม 100% — same protection.setDescription, same editor management, same hide logic
 * @param {object} ss - Active spreadsheet
 * @param {Object} config - {name, reason, hide}
 * @param {string} me - Script Owner email
 * @param {Array} adminEmails - LMDS_ADMINS array
 * @return {string} status message for results array
 * @private
 */
function applySheetLevelProtection_(ss, config, me, adminEmails) {
  const sheet = ss.getSheetByName(config.name);
  if (!sheet) {
    return '⚠️ ไม่พบชีต: ' + config.name;
  }

  // Protected Range: ทั้งชีต
  const protection = sheet.protect();
  protection.setDescription(`[SEC-005] ${config.reason} — เฉพาะ Admin เท่านั้น`);

  // ลบ Editor เดิมทั้งหมด
  const editors = protection.getEditors();
  editors.forEach(editor => {
    try { protection.removeEditor(editor.getEmail()); } catch (e) {}
  });
  // [SEC-009 FIX] เพิ่ม Script Owner
  if (me) {
    try { protection.addEditor(me); } catch (e) {}
  }
  // [SEC-009 FIX] เพิ่ม Admin ทั้งหมดจาก LMDS_ADMINS
  adminEmails.forEach(email => {
    try { protection.addEditor(email); } catch (e) {}
  });

  // Hidden Sheet (ถ้ากำหนด)
  if (config.hide) {
    try { sheet.hideSheet(); } catch (e) {}
  }

  return `✅ ${config.name}: Protected${config.hide ? ' + Hidden' : ''}`;
}

/**
 * applyReviewRangeProtection_ — [REF-010] Q_REVIEW range protection using REVIEW_IDX.* (schema-safe)
 *   แทน hardcoded `getRange(1, 1, reviewMaxRows, 17)` ด้วย REVIEW_IDX.RECOMMEND + 1
 *   ปกป้อง cols A-Q (REVIEW_ID ถึง RECOMMEND) — ปล่อย cols R-V (STATUS, REVIEWER, REVIEWED_AT, DECISION, NOTE)
 * @param {object} ss
 * @param {string} me
 * @param {Array} adminEmails
 * @return {string|null} status message หรือ null ถ้า sheet missing
 * @private
 */
function applyReviewRangeProtection_(ss, me, adminEmails) {
  const reviewSheet = ss.getSheetByName(SHEET.Q_REVIEW);
  if (!reviewSheet) return null;

  const reviewMaxRows = Math.max(reviewSheet.getMaxRows(), 100);
  // [REF-010] ใช้ REVIEW_IDX.RECOMMEND + 1 (1-based) แทน magic number 17
  //   REVIEW_IDX.RECOMMEND = 16 (0-based) → +1 = 17 (1-based, cols A-Q)
  //   Schema-safe: ถ้าเพิ่ม/ลดคอลัมน์ก่อน RECOMMEND ในอนาคต ค่านี้จะปรับอัตโนมัติ
  const protectedColCount = (REVIEW_IDX.RECOMMEND || 16) + 1;
  const protectedRange = reviewSheet.getRange(1, 1, reviewMaxRows, protectedColCount);
  const rangeProtection = protectedRange.protect();
  rangeProtection.setDescription('[SEC-005] Q_REVIEW candidate/system columns — ป้องกันการแก้ไขตรง (reviewer แก้ได้เฉพาะ cols R-V)');

  const reviewEditors = rangeProtection.getEditors();
  reviewEditors.forEach(editor => {
    try { rangeProtection.removeEditor(editor.getEmail()); } catch (e) {}
  });
  if (me) {
    try { rangeProtection.addEditor(me); } catch (e) {}
  }
  adminEmails.forEach(email => {
    try { rangeProtection.addEditor(email); } catch (e) {}
  });
  return '✅ Q_REVIEW: Range Protected (A1:Q — reviewer แก้ R-V ได้)';
}

/**
 * applyGeoPointProtection_ — [REF-010] M_GEO_POINT protection (separate from PII sheets)
 *   รักษา behavior เดิม 100% — same description, same editor management
 * @param {object} ss
 * @param {string} me
 * @param {Array} adminEmails
 * @return {string|null} status message หรือ null ถ้า sheet missing
 * @private
 */
function applyGeoPointProtection_(ss, me, adminEmails) {
  const geoSheet = ss.getSheetByName(SHEET.M_GEO_POINT);
  if (!geoSheet) return null;

  const geoProtection = geoSheet.protect();
  geoProtection.setDescription('[SEC-005] ข้อมูลพิกัด — เฉพาะ Script เท่านั้นที่เขียน');
  const geoEditors = geoProtection.getEditors();
  geoEditors.forEach(editor => {
    try { geoProtection.removeEditor(editor.getEmail()); } catch (e) {}
  });
  if (me) {
    try { geoProtection.addEditor(me); } catch (e) {}
  }
  // [SEC-009 FIX] เพิ่ม admin สำหรับ M_GEO_POINT ด้วย
  adminEmails.forEach(email => {
    try { geoProtection.addEditor(email); } catch (e) {}
  });
  return '✅ M_GEO_POINT: Protected';
}
