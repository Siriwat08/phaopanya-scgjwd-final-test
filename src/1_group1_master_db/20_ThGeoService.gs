/**
 * VERSION: 5.5.006
 * FILE: 20_ThGeoService.gs
 * LMDS V5.5 — Thai Geo Service
 * ===================================================
 * PURPOSE:
 *   ให้บริการค้นหาข้อมูลภูมิศาสตร์ไทย — ค้นหาจังหวัด/อำเภอ/ตำบล
 *   จากรหัสไปรษณีย์ หรือชื่อพื้นที่
 * ===================================================
 *   v5.5.006 (2026-06-18) — Consistency Sync:
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
 *   CALLS (Invokes):
 *     - normalizeForCompare() → 05_NormalizeService
 *     - loadCachedGeoRows_() → 16_GeoDictionaryBuilder
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

  // [FIX CRIT-011] ล้าง geo dict cache เพื่อให้ lookup ถัดไปเห็นข้อมูลใหม่
  _GLOBAL_GEO_DICT_CACHE = null;
  _GLOBAL_GEO_DICT_SEARCH_KEY_INDEX = null; // [PERF-006]
  _GLOBAL_GEO_DICT_CACHE_PLACE = null;
  if (typeof invalidateGeoDictCache === 'function') invalidateGeoDictCache();
  logInfo('GeoMigration', 'เติมข้อมูล Metadata เสร็จสิ้น!');
  safeUiAlert_('✅ เติมข้อมูล Geo Metadata สำเร็จ!\nกรุณากด "สร้าง Geo Dictionary" อีกครั้งเพื่อใช้งาน');
  } catch (err) {
    logError('ThGeoService', 'populateGeoMetadata ล้มเหลว: ' + err.message, err);
    // [FIX B3 v5.5.002] ใช้ safeUiAlert_() แทน raw SpreadsheetApp.getUi().alert() กัน crash ใน non-UI context
    safeUiAlert_('❌ เกิดข้อผิดพลาด: ' + err.message);
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
