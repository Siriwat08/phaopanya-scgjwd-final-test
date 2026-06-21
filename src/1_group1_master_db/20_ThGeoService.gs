/**
 * VERSION: 5.5.020
 * FILE: 20_ThGeoService.gs
 * LMDS V5.5 — Thai Geo Service
 * ===================================================
 * PURPOSE:
 *   ให้บริการค้นหาข้อมูลภูมิศาสตร์ไทย — ค้นหาจังหวัด/อำเภอ/ตำบล
 *   จากรหัสไปรษณีย์ หรือชื่อพื้นที่
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
 *     - 01_Config (SHEET.SYS_TH_GEO, TH_GEO_IDX.*)
 *     - 02_Schema (SCHEMA)
 *     - 05_NormalizeService (normalizeForCompare)
 *     - 16_GeoDictionaryBuilder (loadCachedGeoRows_)
 *     - 14_Utils (diceCoefficient)
 *     - 07_PlaceService (invalidatePlaceCache_) [V5.5.008 P2 #12]
 *     - 16_GeoDictionaryBuilder (invalidateGeoDictCache) [V5.5.008 P2 #12]
 *     - 03_SetupSheets (flushLogBuffer_) [V5.5.008 P2 #11]
 *   CALLS (Invokes):
 *     - normalizeForCompare() → 05_NormalizeService
 *     - loadCachedGeoRows_() → 16_GeoDictionaryBuilder
 *     - invalidateGeoDictCache() → 16_GeoDictionaryBuilder (replaces manual
 *       nulling of _GLOBAL_GEO_DICT_SEARCH_KEY_INDEX in populateGeoMetadata) [V5.5.008 P2 #12]
 *     - invalidatePlaceCache_() → 07_PlaceService (replaces 3 redundant manual
 *       cache nullings in populateGeoMetadata) [V5.5.008 P2 #12]
 *     - flushLogBuffer_() → 03_SetupSheets (populateGeoMetadata finally) [V5.5.008 P2 #11]
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
 *   │       │   [V5.5.008 P2 #12] uses invalidate*Cache_*│
 *   │       │     instead of 3 manual cache nullings     │
 *   │       │     (invalidateGeoDictCache +                │
 *   │       │      invalidatePlaceCache_)                │
 *   │       │   [V5.5.008 P2 #11] flushLogBuffer_() in   │
 *   │       │     finally block                          │
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
  // [SEC-012 FIX] Authorization Guard — bulk write SYS_TH_GEO ต้องเป็น Admin เท่านั้น
  if (typeof isAuthorizedUser_ === 'function' && !isAuthorizedUser_()) {
    safeUiAlert_('🔒 คุณไม่มีสิทธิ์รัน Populate Geo Metadata\nกรุณาติดต่อ Admin');
    return;
  }
  // [REF-011 V5.5.020 PILOT] Apply withEntryPointGuard_ for standardized error handling
  //   - Preserve Behavior 100%: errorPrefix='เกิดข้อผิดพลาด: ' (same as original alert message)
  //   - finally block (flushLogBuffer_) handled by guard automatically
  withEntryPointGuard_('ThGeoService', 'populateGeoMetadata', function() {
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

  // [FIX v5.5.008 P2 #12] ลบ redundant manual cache nulling — ใช้ invalidate*Cache_* แทน
  //   เดิม null 3 ตัว manual แล้วค่อยเรียก invalidateGeoDictCache() ซึ่งก็ null ซ้ำ
  //   ตอนนี้ใช้ centralized invalidators ที่จะ null RAM + clear CacheService ครบ
  //
  //   invalidateGeoDictCache() จะ null _GLOBAL_GEO_DICT_CACHE + _GLOBAL_GEO_DICT_PROVINCE_INDEX
  //                          + _GLOBAL_GEO_DICT_SEARCH_KEY_INDEX (แก้ใน V5.5.007 P0 #2) + TH_GEO_* CacheService
  //   invalidatePlaceCache_() จะ null _GLOBAL_GEO_DICT_CACHE_PLACE + M_PLACE_ALL CacheService
  if (typeof invalidateGeoDictCache === 'function') invalidateGeoDictCache();
  if (typeof invalidatePlaceCache_ === 'function') invalidatePlaceCache_();
  logInfo('GeoMigration', 'เติมข้อมูล Metadata เสร็จสิ้น!');
  safeUiAlert_('✅ เติมข้อมูล Geo Metadata สำเร็จ!\nกรุณากด "สร้าง Geo Dictionary" อีกครั้งเพื่อใช้งาน');
  }, { errorPrefix: 'เกิดข้อผิดพลาด: ' });
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
