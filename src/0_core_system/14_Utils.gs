/**
 * VERSION: 5.5.011
 * FILE: 14_Utils.gs
 * LMDS V5.5 — Utility Functions
 * ===================================================
 * PURPOSE:
 *   รวบรวมฟังก์ชันช่วยทั่วไปที่ใช้ร่วมกันทั่วระบบ
 *   เช่น ID Generator, Hash, String similarity, LatLng parser
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
 *   v5.4.001 (2026-05-24) — Single Writer Pattern:
 *     - [ADD] Comprehensive header documentation
 *   v5.4.000 (2026-05-24):
 *     - [UPGRADE] Version bump to 5.4.000
 *     - [ADD] Comprehensive header documentation
 *     - [ADD] DEPENDENCIES section with module relationships
 *     - [ENHANCE] Detailed module interconnection mapping
 *   v5.2.001 (PH2 Hardening):
 *     - [FIX] Consolidated all GPS & String utilities
 *     - [ADD] AI Reasoning Tier F Support
 * ===================================================
 * DEPENDENCIES:
 *   REQUIRES (Load Order):
 *     - 01_Config (SHEET.SOURCE, SRC_IDX.SYNC_STATUS, AI_CONFIG.MODEL)
 *   CALLS (Invokes):
 *     - logError/logInfo/logWarn() → 03_SetupSheets
 *     - getGeminiApiKey() → 01_Config
 *   EXPORTS TO:
 *     - ALL modules (06-21) — Most widely used utility module
 *     - safeCacheGet_/safeCachePut_/safeCacheRemoveAll_ — try-catch wrappers around
 *         CacheService.get/put/removeAll (NEW V5.5.007 P1 #9); consumed by 04/07/16/21
 *     - saveChunkedCache_/loadChunkedCache_/invalidateChunkedCache_ — centralized
 *         chunked-cache helpers (byte-based chunking + putAll/getAll + orphan cleanup);
 *         consumed by 04/07/16/21 [V5.5.007 P1 #7, V5.5.008 P2 #13]
 *   SHEETS ACCESSED:
 *     - SHEET.SOURCE (Write: resetSourceSyncStatus clears sync column)
 * ===================================================
 * ARCHITECTURE:
 *   Shared Utility Library
 *   ┌──────────────────────────────────────────────┐
 *   │  String Similarity                           │
 *   │  ├─ levenshteinDistance (edit distance)       │
 *   │  └─ diceCoefficient / buildBigramSet_        │
 *   │  GPS & Distance                              │
 *   │  ├─ haversineDistanceM (meters)              │
 *   │  ├─ haversineDistanceKm (kilometers)         │
 *   │  ├─ isValidLatLng (Thailand bounds check)    │
 *   │  └─ parseLatLng (string → object)            │
 *   │  ID Generation                               │
 *   │  ├─ generateShortId (12-char UUID prefix)    │
 *   │  └─ generateMd5Hash (cache key)              │
 *   │  AI Integration                              │
 *   │  ├─ callGeminiAPI (Gemini REST API)          │
 *   │  └─ cleanAIResponse_ (strip markdown)        │
 *   │  Infrastructure                              │
 *   │  ├─ callSpreadsheetWithRetry (exponential bf)│
 *   │  ├─ toThaiDateStr (Buddhist calendar)        │
 *   │  ├─ normalizeInvoiceNo (e-notation safe)     │
 *   │  └─ resetSourceSyncStatus (UI-driven reset)  │
 *   │  Cache Helpers (SECTIONS 9-12)               │
 *   │  ├─ saveChunkedCache_ / loadChunkedCache_    │
 *   │  │   + cleanupOrphanedChunks_ (V5.5.008 #13) │
 *   │  ├─ invalidateChunkedCache_ (ramVarResetFn)  │
 *   │  └─ safeCacheGet_/Put_/RemoveAll_ (V5.5.007) │
 *   └──────────────────────────────────────────────┘
 * ===================================================
 */

// ============================================================
// SECTION 1: String Similarity
// ============================================================

/**
 * levenshteinDistance — ระยะห่างระหว่าง 2 String
 * @param {string} strA
 * @param {string} strB
 * @return {number}
 */
function levenshteinDistance(strA, strB) {
  const lenA = strA.length;
  const lenB = strB.length;
  if (lenA === 0) return lenB;
  if (lenB === 0) return lenA;
  if (strA === strB) return 0;

  const matrix = [];
  for (let i = 0; i <= lenA; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= lenB; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= lenA; i++) {
    for (let j = 1; j <= lenB; j++) {
      const cost = strA[i - 1] === strB[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j]     + 1,
        matrix[i][j - 1]     + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }
  return matrix[lenA][lenB];
}

/**
 * diceCoefficient — Dice Similarity ด้วย Bigram
 * @param {string} strA
 * @param {string} strB
 * @return {number} 0.0 – 1.0
 */
function diceCoefficient(strA, strB) {
  if (!strA || !strB) return 0;
  if (strA === strB) return 1;
  if (strA.length < 2 || strB.length < 2) return 0;

  const bigramsA    = buildBigramSet_(strA);
  const bigramsB    = buildBigramSet_(strB);
  let intersection  = 0;

  bigramsA.forEach(bg => {
    if (bigramsB.has(bg)) intersection++;
  });

  return (2 * intersection) / (bigramsA.size + bigramsB.size);
}

/**
 * buildBigramSet_ — สร้าง Set ของ Bigram จาก String
 */
function buildBigramSet_(str) {
  const set = new Set();
  for (let i = 0; i < str.length - 1; i++) {
    set.add(str.substring(i, i + 2));
  }
  return set;
}

/**
 * resetSourceSyncStatus — [NEW v5.2.003] เคลียร์ค่า SYNC_STATUS เพื่อรันใหม่
 * @summary ใช้สำหรับกรณีที่ต้องการประมวลผลข้อมูลในชีตต้นทางใหม่อีกครั้ง
 */
function resetSourceSyncStatus() {
  // [SEC-002] Authorization Guard
  if (typeof isAuthorizedUser_ === 'function' && !isAuthorizedUser_()) {
    safeUiAlert_('🔒 คุณไม่มีสิทธิ์รีเซ็ตสถานะ SYNC\nกรุณาติดต่อ Admin');
    return;
  }
  // [FIX BUG-04 v5.4.003] หุ้ม try-catch ครอบทั้งฟังก์ชัน — ก่อนหน้านี้ ui.alert() นอก try-catch ทำให้ throw ได้
  try {
  const ui = SpreadsheetApp.getUi();
  const resp = ui.alert(
    '🔄 ยืนยันการรีเซ็ตสถานะ?',
    'ระบบจะล้างค่าในคอลัมน์ SYNC_STATUS ของชีตต้นทางทั้งหมด\n' +
    'เพื่อให้ระบบกลับมาประมวลผลแถวเหล่านั้นใหม่อีกครั้งเมื่อกด Run Pipeline\n\n' +
    'ยืนยันการดำเนินการหรือไม่?',
    ui.ButtonSet.YES_NO
  );
  
  if (resp !== ui.Button.YES) return;

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET.SOURCE);
  if (!sheet) {
    // [FIX BUG-04 v5.5.001] เปลี่ยน ui.alert() เป็น safeUiAlert_()
    safeUiAlert_('❌ ไม่พบชีตต้นทาง: ' + SHEET.SOURCE);
    return;
  }

  const lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    // [FIX BUG-04 v5.5.001] เปลี่ยน ui.alert() เป็น safeUiAlert_()
    safeUiAlert_('ℹ️ ไม่มีข้อมูลให้รีเซ็ต');
    return;
  }

  // คอลัมน์ SYNC_STATUS (Index 36 = คอลัมน์ AK)
  const colIdx = SRC_IDX.SYNC_STATUS + 1; 
  
  sheet.getRange(2, colIdx, lastRow - 1, 1).clearContent();
  // ระบายสีพื้นหลังกลับเป็นปกติ
  sheet.getRange(2, colIdx, lastRow - 1, 1).setBackground(null);
  
  // [FIX BUG-04 v5.5.001] เปลี่ยน ui.alert() เป็น safeUiAlert_()
  safeUiAlert_('✅ รีเซ็ตสถานะสำเร็จ!\n\nคุณสามารถกดเมนู "Run Full Pipeline" เพื่อเริ่มประมวลผลใหม่ได้เลยครับ');
  logInfo('Utils', 'รีเซ็ตสถานะ SYNC ในชีตต้นทางเรียบร้อยแล้ว');
  } catch (err) {
    logError('Utils', 'resetSourceSyncStatus ล้มเหลว: ' + err.message, err);
    safeUiAlert_('❌ เกิดข้อผิดพลาด: ' + err.message);
  }
}

// ============================================================
// SECTION 2: GPS Distance
// ============================================================

/**
 * haversineDistanceM — ระยะทางระหว่าง 2 พิกัด GPS (เมตร)
 * [FIX v003] เพิ่ม Math.min(1, aVal) ป้องกัน aVal>1 → sqrt(NaN)
 */
function haversineDistanceM(lat1, lng1, lat2, lng2) {
  const earthRadius = 6371000;
  const toRad       = Math.PI / 180;

  const diffLat    = (lat2 - lat1) * toRad;
  const diffLng    = (lng2 - lng1) * toRad;

  const sinHalfLat = Math.sin(diffLat / 2);
  const sinHalfLng = Math.sin(diffLng / 2);

  const aVal = sinHalfLat * sinHalfLat +
    Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) *
    sinHalfLng * sinHalfLng;

  // [FIX v003] clamp aVal ให้อยู่ใน [0,1] ป้องกัน Floating Point error
  const safeAVal    = Math.min(1, Math.max(0, aVal));
  const centralAngle = 2 * Math.atan2(Math.sqrt(safeAVal),
                                       Math.sqrt(1 - safeAVal));
  return earthRadius * centralAngle;
}

/**
 * haversineDistanceKm — ระยะทาง (กิโลเมตร)
 */
function haversineDistanceKm(lat1, lng1, lat2, lng2) {
  return haversineDistanceM(lat1, lng1, lat2, lng2) / 1000;
}

// ============================================================
// SECTION 3: UUID / Hash
// ============================================================

/**
 * generateShortId — สร้าง ID สั้น 12 ตัวอักษร
 */
function generateShortId(prefix) {
  const raw = Utilities.getUuid().replace(/-/g, '').toUpperCase();
  return (prefix || '') + raw.substring(0, 12);
}

/**
 * generateMd5Hash — สร้าง MD5 Hex สำหรับ Cache Key
 */
function generateMd5Hash(input) {
  const rawBytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.MD5,
    String(input)
  );
  return rawBytes.map(b => {
    const hex = (b < 0 ? b + 256 : b).toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  }).join('');
}

// ============================================================
// SECTION 4: Date Utilities
// ============================================================

/**
 * toThaiDateStr — แปลง Date เป็น String รูปแบบไทย
 * [FIX v003] เพิ่ม Invalid Date guard
 */
function toThaiDateStr(date) {
  if (!date) return '';
  const parsedDate = new Date(date);

  // [FIX v003] ป้องกัน Invalid Date → คืน '' แทน 'NaN/NaN/NaN'
  if (isNaN(parsedDate.getTime())) return '';

  const day   = String(parsedDate.getDate()).padStart(2, '0');
  const month = String(parsedDate.getMonth() + 1).padStart(2, '0');
  const year  = parsedDate.getFullYear() + 543;
  return `${day}/${month}/${year}`;
}

/**
 * isValidLatLng — ตรวจสอบว่าพิกัดอยู่ในประเทศไทย
 * [FIX v003] && → || ป้องกัน lat=0.1, lng=0 ผ่านผิด
 */
function isValidLatLng(lat, lng) {
  const numLat = Number(lat);
  const numLng = Number(lng);
  if (isNaN(numLat) || isNaN(numLng)) return false;

  // [FIX v003] เปลี่ยนเป็น || — ถ้า lat=0 หรือ lng=0 ถือว่าไม่มีพิกัด
  if (numLat === 0 || numLng === 0) return false;

  // กรอบประเทศไทย
  return numLat >= 5.5  && numLat <= 20.5 &&
         numLng >= 97.5 && numLng <= 105.7;
}

/**
 * parseLatLng — แปลง String "lat,lng" เป็น Object
 */
function parseLatLng(latLngStr) {
  if (!latLngStr) return null;
  const cleaned = String(latLngStr).trim();

  // รองรับ separator: , / | หรือ space
  const parts = cleaned.split(/[,\/|\s]+/);
  if (parts.length < 2) return null;

  const lat = parseFloat(parts[0].trim());
  const lng = parseFloat(parts[1].trim());
  if (isNaN(lat) || isNaN(lng)) return null;
  return { lat, lng };
}

// ============================================================
// SECTION 5: AI Integration
// ============================================================

/**
 * callGeminiAPI — เรียกใช้งาน Google Gemini API
 * [ADD v003] รองรับ AI Reasoning Tier F
 */
function callGeminiAPI(prompt, modelName = AI_CONFIG.MODEL) {
  // [FIX v5.5.001] ใช้ getGeminiApiKey() แทน duplicate validation — consistency + format check
  const apiKey = getGeminiApiKey();

  // [SEC-006] เปลี่ยนจาก Query Parameter → x-goog-api-key Header
  // ลดความเสี่ยง API Key รั่วผ่าน Stackdriver Logging
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent`;
  
  const payload = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.1,
      topP: 1,
      topK: 1,
      maxOutputTokens: 2048,
    }
  };

  const options = {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
    headers: { 'x-goog-api-key': apiKey }  // [SEC-006] ส่งผ่าน Header แทน URL
  };

  try {
    const response = UrlFetchApp.fetch(url, options);
    const resCode  = response.getResponseCode();
    const resText  = response.getContentText();

    if (resCode !== 200) {
      logError('Utils', `Gemini API Error (${resCode}): ${resText}`, new Error(`GEMINI_API_${resCode}`));
      return null;
    }

    const json = JSON.parse(resText);
    if (json.candidates && json.candidates[0].content && json.candidates[0].content.parts) {
      return json.candidates[0].content.parts[0].text;
    }
    return null;

  } catch (err) {
    logError('Utils', `callGeminiAPI ล้มเหลว: ${err.message}`, err);
    return null;
  }
}

/**
 * cleanAIResponse_ — ล้าง Markdown หรือข้อความส่วนเกินจาก AI
 */
function cleanAIResponse_(text) {
  if (!text) return '';
  return text.replace(/```json/g, '')
             .replace(/```/g, '')
             .trim();
}

/**
 * callSpreadsheetWithRetry — [NEW v5.2.015] ป้องกันความล้มเหลวชั่วคราวของ Google Spreadsheet Service
 * @param {Function} apiFunc - ฟังก์ชันที่เข้าถึงสเปรดชีต
 * @param {number} maxRetries - จำนวนครั้งสูงสุดในการลองใหม่
 * @param {number} baseDelayMs - เวลาหน่วงตั้งต้น (ms)
 * @return {*}
 */
function callSpreadsheetWithRetry(apiFunc, maxRetries = 3, baseDelayMs = 500) {
  let lastErr = null;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return apiFunc();
    } catch (err) {
      lastErr = err;
      const errMsg = err.message || '';
      // เช็คว่ามีคำสำคัญเกี่ยวกับความผิดพลาดของระบบ Google Spreadsheet หรือไม่
      if (
        errMsg.indexOf('Spreadsheet') !== -1 ||
        errMsg.indexOf('สเปรดชีต') !== -1 ||
        errMsg.indexOf('Action not allowed') !== -1 ||
        errMsg.indexOf('Service error') !== -1 ||
        errMsg.indexOf('failed while accessing') !== -1 ||
        errMsg.indexOf('หยุดทำงานขณะเข้าถึงเอกสาร') !== -1
      ) {
        logWarn('Utils', `Spreadsheet Service Crash (Attempt ${attempt}/${maxRetries}): ${errMsg}. กำลังรอเพื่อลองใหม่...`);
        if (attempt < maxRetries) {
          Utilities.sleep(baseDelayMs * attempt * (1 + Math.random())); // Exponential backoff + jitter
          continue;
        }
      }
      throw err;
    }
  }
  throw lastErr;
}

/**
 * normalizeInvoiceNo — [NEW v5.2.016] จัดรูปแบบเลขที่ Invoice ให้เป็น String ปกติ
 * ช่วยป้องกันความซ้ำซ้อนและการประมวลผลวนลูปเมื่อ Google อ่านค่า 122,206,552,193,122,000,000,000 
 * เป็น e-notation (เช่น 1.22206552193122e+23) หรือมีลูกน้ำปนเป
 * @param {*} inv - เลขที่ Invoice
 * @return {string}
 */
function normalizeInvoiceNo(inv) {
  if (inv === null || inv === undefined) return '';
  let str = String(inv).trim();
  str = str.replace(/,/g, '');
  if (/^\d+(\.\d+)?[eE]\+?\d+$/.test(str)) {
    try {
      const parts = str.toLowerCase().split('e');
      let numStr = parts[0];
      const exp = parseInt(parts[1], 10);
      const dotIndex = numStr.indexOf('.');
      if (dotIndex !== -1) {
        const decimals = numStr.length - dotIndex - 1;
        numStr = numStr.replace('.', '');
        if (exp >= decimals) {
          str = numStr + '0'.repeat(exp - decimals);
        } else {
          str = numStr.slice(0, dotIndex + exp) + '.' + numStr.slice(dotIndex + exp);
        }
      } else {
        str = numStr + '0'.repeat(exp);
      }
    } catch (e) { logDebug('Utils', 'normalizeInvoiceNo e-notation parse error: ' + e.message); }
  }
  if (str.endsWith('.0')) str = str.slice(0, -2);
  return str;
}

/**
 * safeUiAlert_ — แสดง alert เฉพาะเมื่อมี UI context (trigger-safe)
 * [NEW v5.4.002] ย้ายมาจาก 13_ReportService.gs + 16_GeoDictionaryBuilder.gs
 * เพื่อไม่ให้ซ้ำกัน — ฟังก์ชันเดียวกันใช้ได้ทุกโมดูล
 * @param {string} message - ข้อความที่จะแสดง
 * @param {string} [title] - หัวข้อ (optional)
 */
function safeUiAlert_(message, title) {
  try {
    if (title) {
      SpreadsheetApp.getUi().alert(title, message, SpreadsheetApp.getUi().ButtonSet.OK);
    } else {
      SpreadsheetApp.getUi().alert(message);
    }
  } catch (e) {
    // รันจาก Trigger ไม่มี UI context → log เงียบๆ
    try { logInfo('System', `[UI Message] ${String(message).substring(0, 200)}`); } catch (_) {}
  }
}

// ============================================================
// SECTION 6: Time Guard Utility
// [FIX CRIT-003] Centralized hasTimePassed_() — LMDS V5.5 Standard
// ============================================================

/**
 * hasTimePassed_ — ตรวจสอบว่าเกินเวลาที่กำหนดหรือไม่ (Centralized Time Guard)
 * [NEW CRIT-003] ตามมาตรฐาน LMDS V5.5 — ทุกโมดูลควรใช้ฟังก์ชันนี้แทน inline time check
 * @param {Date} startTime - เวลาเริ่มต้น (Date object)
 * @param {number} limitMs - เวลาจำกัด (millisecond) — ใช้ AI_CONFIG.TIME_LIMIT_MS เป็นค่า default
 * @param {number} [bufferMs=30000] - เวลา buffer ก่อนถึง limit (default 30 วินาที)
 * @return {boolean} true ถ้าเกินเวลาแล้ว (ควรหยุด loop)
 */
function hasTimePassed_(startTime, limitMs, bufferMs) {
  if (!startTime) return false;
  var effectiveLimit = limitMs || (typeof AI_CONFIG !== 'undefined' ? AI_CONFIG.TIME_LIMIT_MS : 300000);
  var effectiveBuffer = (typeof bufferMs === 'number') ? bufferMs : 30000;
  return (new Date() - startTime) > (effectiveLimit - effectiveBuffer);
}

// ============================================================
// SECTION 7: UUID ↔ Entity ID Converters
// [REF-003] Moved from 21_AliasService.gs — pure mapping functions
//   that don't need AliasService state (they call loadAllPersons_/loadAllPlaces_
//   from Group 1 services). Keeping in Utils avoids bidirectional coupling.
// ============================================================

/**
 * convertUuidToPersonId — แปลง masterUuid → personId
 * [REF-003] Moved from 21_AliasService.gs — pure mapping function
 */
function convertUuidToPersonId(masterUuid) {
  if (!masterUuid) return null;
  var allPersons = loadAllPersons_();
  var hit = allPersons.find(function(p) { return p.masterUuid === masterUuid; });
  return hit ? hit.personId : null;
}

/**
 * convertUuidToPlaceId — แปลง masterUuid → placeId
 * [REF-003] Moved from 21_AliasService.gs — pure mapping function
 */
function convertUuidToPlaceId(masterUuid) {
  if (!masterUuid) return null;
  var allPlaces = loadAllPlaces_();
  var hit = allPlaces.find(function(p) { return p.masterUuid === masterUuid; });
  return hit ? hit.placeId : null;
}

/**
 * convertPersonIdToUuid — แปลง personId → masterUuid
 * [REF-003] Moved from 21_AliasService.gs — pure mapping function
 */
function convertPersonIdToUuid(personId) {
  if (!personId) return null;
  var allPersons = loadAllPersons_();
  var hit = allPersons.find(function(p) { return p.personId === personId; });
  return hit ? hit.masterUuid : null;
}

/**
 * convertPlaceIdToUuid — แปลง placeId → masterUuid
 * [REF-003] Moved from 21_AliasService.gs — pure mapping function
 */
function convertPlaceIdToUuid(placeId) {
  if (!placeId) return null;
  var allPlaces = loadAllPlaces_();
  var hit = allPlaces.find(function(p) { return p.placeId === placeId; });
  return hit ? hit.masterUuid : null;
}

// ============================================================
// SECTION 8: Authorization (SEC-002 Fix)
// ============================================================

/**
 * isAuthorizedUser_ — [SEC-002] ตรวจสอบว่าผู้ใช้ปัจจุบันเป็น Admin หรือไม่
 * อ่านรายชื่อ Admin จาก Script Property 'LMDS_ADMINS' (คั่นด้วยจุลภาค)
 * @return {boolean}
 */
function isAuthorizedUser_() {
  try {
    const email = String(Session.getActiveUser().getEmail() || '').trim().toLowerCase();
    if (!email) {
      logWarn('Security', '[SEC-002] ไม่สามารถอ่าน Email ผู้ใช้ได้ — ปฏิเสธการเข้าถึง');
      return false;
    }

    const adminsStr = String(
      PropertiesService.getScriptProperties().getProperty('LMDS_ADMINS') || ''
    ).trim();

    if (!adminsStr) {
      // ถ้ายังไม่ได้ตั้ง Admin list → ปล่อยผ่าน (Backward Compatibility)
      // แต่ log เตือน
      logWarn('Security', '[SEC-002] LMDS_ADMINS ยังไม่ได้ตั้งค่า — ควรตั้งผ่านเมนูเพื่อความปลอดภัย');
      return true;
    }

    const admins = adminsStr.split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
    const isAuthorized = admins.includes(email);

    if (!isAuthorized) {
      logWarn('Security', `[SEC-002] ปฏิเสธการเข้าถึง: ${email} ไม่อยู่ในรายชื่อ Admin`);
    }

    return isAuthorized;
  } catch (e) {
    logError('Security', '[SEC-002] isAuthorizedUser_ ล้มเหลว: ' + e.message, e);
    return false;
  }
}

/**
 * setupAdminList_UI — [SEC-002] ตั้งค่ารายชื่อ Admin
 * เก็บใน Script Property 'LMDS_ADMINS' (คั่นด้วยจุลภาค)
 */
function setupAdminList_UI() {
  try {
    const ui = SpreadsheetApp.getUi();
    const currentAdmins = String(
      PropertiesService.getScriptProperties().getProperty('LMDS_ADMINS') || ''
    ).trim();

    const result = ui.prompt(
      '👥 ตั้งค่ารายชื่อ Admin',
      'ใส่ Email ของ Admin คั่นด้วยจุลภาค (,):\n\n' +
      'ตัวอย่าง: admin@company.com, manager@company.com\n\n' +
      'Admin เท่านั้นที่สามารถรัน Operation ขั้นสูง\n' +
      '(Migration, Hardening, Clear Data, Reset Sync)\n\n' +
      (currentAdmins ? 'ค่าปัจจุบัน: ' + currentAdmins : '⚠️ ยังไม่ได้ตั้งค่า'),
      ui.ButtonSet.OK_CANCEL
    );

    if (result.getSelectedButton() !== ui.Button.OK) return;

    const newAdmins = String(result.getResponseText() || '').trim();
    if (newAdmins) {
      // Validate format
      const emails = newAdmins.split(',').map(e => e.trim()).filter(Boolean);
      const invalidEmails = emails.filter(e => !e.includes('@'));
      if (invalidEmails.length > 0) {
        safeUiAlert_('❌ Email ไม่ถูกต้อง: ' + invalidEmails.join(', '));
        return;
      }
      PropertiesService.getScriptProperties().setProperty('LMDS_ADMINS', emails.join(','));
      logInfo('Security', '[SEC-002] ตั้งค่า Admin List สำเร็จ: ' + emails.length + ' คน');
      safeUiAlert_('✅ ตั้งค่ารายชื่อ Admin สำเร็จ!\n\nAdmin: ' + emails.join('\n'));
    } else {
      // ล้างค่า → กลับไป Backward Compatibility mode
      PropertiesService.getScriptProperties().deleteProperty('LMDS_ADMINS');
      logInfo('Security', '[SEC-002] ล้างรายชื่อ Admin → Backward Compatibility mode');
      safeUiAlert_('ℹ️ ล้างรายชื่อ Admin แล้ว\nระบบจะปล่อยผ่านทุกคนชั่วคราวจนกว่าจะตั้งค่าใหม่');
    }
  } catch (e) {
    logError('Security', 'setupAdminList_UI ล้มเหลว: ' + e.message, e);
    safeUiAlert_('❌ ตั้งค่า Admin ล้มเหลว: ' + e.message);
  }
}

// ============================================================
// SECTION 8: [REF-009] Generic Batch Stats Helper
// ============================================================

/**
 * batchUpdateEntityStats_ — [REF-009] Generic batch stats update for any entity sheet
 * Centralizes the identical pattern used in Person, Place, Geo services
 * @param {string} sheetName - Sheet name (e.g., SHEET.M_PERSON)
 * @param {Object} idxObj - Index constant object (e.g., PERSON_IDX)
 * @param {number} idColIdx - Column index for entity ID
 * @param {number} usageCountIdx - Column index for usage_count
 * @param {number} lastSeenIdx - Column index for last_seen
 * @param {Set|Array} idSet - Set or Array of entity IDs to update
 * @param {Function} cacheFn - Cache invalidation function to call after update
 * @param {Function} [extraUpdatesFn] - Optional callback(row, id) for extra field updates
 */
function batchUpdateEntityStats_(sheetName, idxObj, idColIdx, usageCountIdx, lastSeenIdx, idSet, cacheFn, extraUpdatesFn) {
  var ids = (idSet instanceof Set) ? Array.from(idSet) : (Array.isArray(idSet) ? idSet : [idSet]);
  if (ids.length === 0) return;
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  if (!sheet) return;
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return;
  var allIdx = Object.keys(idxObj).map(function(k) { return idxObj[k]; });
  var minCol = Math.min.apply(null, allIdx) + 1;
  var maxCol = Math.max.apply(null, allIdx) + 1;
  var numCols = maxCol - minCol + 1;
  var allData = sheet.getRange(2, minCol, lastRow - 1, numCols).getValues();
  var idOffset = idColIdx - (minCol - 1);
  var usageOffset = usageCountIdx - (minCol - 1);
  var seenOffset = lastSeenIdx - (minCol - 1);
  var now = new Date();
  var updated = 0;
  ids.forEach(function(id) {
    for (var i = 0; i < allData.length; i++) {
      if (String(allData[i][idOffset]) === String(id)) {
        allData[i][usageOffset] = (Number(allData[i][usageOffset]) || 0) + 1;
        allData[i][seenOffset] = now;
        if (extraUpdatesFn) extraUpdatesFn(allData[i], id);
        updated++;
      }
    }
  });
  if (updated > 0) {
    sheet.getRange(2, minCol, lastRow - 1, numCols).setValues(allData);
    if (typeof cacheFn === 'function') cacheFn();
  }
}

// ============================================================
// SECTION 9: [REF-010] Centralized Chunked Cache Helpers
// [FIX v5.5.007] แก้ bug: แบ่ง chunk ตามขนาด KB แทนจำนวน items
// [PERF] ใช้ putAll()/getAll() สำหรับ batch operations
// ============================================================

/**
 * saveChunkedCache_ — [REF-010] Centralized chunked cache writer
 * [FIX v5.5.007] แบ่ง chunk ตามขนาด KB (90 KB/chunk) แทนจำนวน items
 * [FIX v5.5.008 P2 #13] ล้าง orphaned chunk keys เมื่อขนาดข้อมูลลดลง
 * [FIX v5.5.010 HOTFIX #1] แบ่ง putAll เป็น batch ย่อย 5 chunks ต่อครั้ง
 *   + ลด chunk size จาก 90KB → 80KB (safety margin)
 *   Root cause: GAS putAll มี limit total payload size (~1MB ต่อ call)
 *   เมื่อมี 48 chunks × 90KB = 4.3MB → "อาร์กิวเมนต์มากเกินไป: value" error
 *   ตอนนี้แบ่งเป็น batch 5 chunks ต่อ putAll (5 × 80KB = 400KB ต่อ call)
 * [PERF] ใช้ putAll()/getAll() สำหรับ batch operations — เร็วขึ้น 5-10 เท่า
 *
 * @param {CacheService.Cache} cache - CacheService instance
 * @param {string} keyPrefix - Base key prefix for cache entries
 * @param {*} data - Any JSON-serializable data
 * @param {number} [optChunkSizeKB=80] - ขนาดแต่ละ chunk ในหน่วย KB (default: 80 KB)
 */
function saveChunkedCache_(cache, keyPrefix, data, optChunkSizeKB) {
  // [FIX v5.5.010] ลด chunk size จาก 90KB → 80KB (safety margin สำหรับ JSON overhead)
  var CHUNK_SIZE_BYTES = (optChunkSizeKB || 80) * 1000; // 80 KB = 80,000 chars
  var ttl = (typeof AI_CONFIG !== 'undefined' && AI_CONFIG.CACHE_TTL_SEC) ? AI_CONFIG.CACHE_TTL_SEC : 21600;

  // [FIX v5.5.010] จำนวน chunks ต่อ putAll batch — 5 chunks × 80KB = 400KB ต่อ call
  // GAS putAll limit ~1MB total payload, ใช้ 400KB เผื่อ safety margin
  var BATCH_SIZE = 5;

  var json = JSON.stringify(data);

  // [FIX v5.5.008 P2 #13] Helper: ล้าง orphaned chunks จาก previous large-cache write
  var cleanupOrphanedChunks_ = function(currentNumChunks) {
    try {
      var prevChunksStr = cache.get(keyPrefix + '_CHUNKS');
      if (!prevChunksStr) return;
      var prevNumChunks = Number(prevChunksStr);
      if (isNaN(prevNumChunks)) return;

      var orphanStart = currentNumChunks;
      if (orphanStart >= prevNumChunks) return;

      var orphanKeys = [];
      for (var i = orphanStart; i < prevNumChunks; i++) {
        orphanKeys.push(keyPrefix + '_' + i);
      }
      if (orphanKeys.length > 0) {
        cache.removeAll(orphanKeys);
        logDebug('Utils', 'saveChunkedCache_: cleaned up ' + orphanKeys.length +
                  ' orphaned chunks for ' + keyPrefix + ' (prev=' + prevNumChunks +
                  ', current=' + currentNumChunks + ')');
      }
    } catch (e) {
      logWarn('Utils', 'saveChunkedCache_ orphan cleanup error: ' + e.message);
    }
  };

  // [OPTIMIZATION] ถ้าข้อมูลเล็กกว่า chunk size → เขียนทีเดียว (fast path)
  if (json.length <= CHUNK_SIZE_BYTES) {
    try {
      cache.put(keyPrefix, json, ttl);
      cache.remove(keyPrefix + '_CHUNKS');
      cleanupOrphanedChunks_(0);
      logDebug('Utils', 'saveChunkedCache_: ' + keyPrefix + ' — single put (' + json.length + ' chars)');
      return;
    } catch (e) {
      logWarn('Utils', 'saveChunkedCache_ single put error: ' + e.message);
      return;
    }
  }

  // [FIX v5.5.007] แบ่งข้อมูลตามขนาด KB แทนจำนวน items
  var numChunks = Math.ceil(json.length / CHUNK_SIZE_BYTES);

  // [PERF] สร้าง cache entries ทั้งหมดใน RAM ก่อน
  var cacheEntries = {};
  cacheEntries[keyPrefix + '_CHUNKS'] = String(numChunks);

  for (var i = 0; i < numChunks; i++) {
    var start = i * CHUNK_SIZE_BYTES;
    var end = Math.min(start + CHUNK_SIZE_BYTES, json.length);
    var chunk = json.substring(start, end);

    // [SAFETY] ตรวจสอบขนาด chunk ก่อนเขียน
    if (chunk.length > 95000) {
      logError('Utils', 'saveChunkedCache_: chunk ' + i + ' ใหญ่เกินไป (' + chunk.length + ' chars) — abort');
      return;
    }

    cacheEntries[keyPrefix + '_' + i] = chunk;
  }

  // [FIX v5.5.010 HOTFIX #1] แบ่ง putAll เป็น batch ย่อย แทนที่จะทั้งหมดทีเดียว
  // Root cause: GAS putAll มี limit total payload size (~1MB ต่อ call)
  // เมื่อมี 48 chunks × 90KB = 4.3MB → "อาร์กิวเมนต์มากเกินไป: value" error
  // ตอนนี้แบ่งเป็น batch 5 chunks ต่อ putAll (5 × 80KB = 400KB ต่อ call)
  var allKeys = Object.keys(cacheEntries);
  var totalBatches = Math.ceil(allKeys.length / BATCH_SIZE);
  var successBatches = 0;
  var failedChunks = [];

  for (var batchIdx = 0; batchIdx < totalBatches; batchIdx++) {
    var batchStart = batchIdx * BATCH_SIZE;
    var batchEnd = Math.min(batchStart + BATCH_SIZE, allKeys.length);
    var batchEntries = {};

    for (var j = batchStart; j < batchEnd; j++) {
      var key = allKeys[j];
      batchEntries[key] = cacheEntries[key];
    }

    try {
      cache.putAll(batchEntries, ttl);
      successBatches++;
    } catch (batchErr) {
      // putAll batch ล้มเหลว → ลองเขียนทีละ chunk ใน batch นี้
      logWarn('Utils', 'saveChunkedCache_ putAll batch ' + (batchIdx + 1) + '/' + totalBatches +
              ' ล้มเหลว: ' + batchErr.message + ' — ลองเขียนทีละ chunk');

      for (var k in batchEntries) {
        try {
          cache.put(k, batchEntries[k], ttl);
        } catch (chunkErr) {
          failedChunks.push(k);
          logError('Utils', 'saveChunkedCache_ chunk ' + k + ' ล้มเหลว: ' + chunkErr.message, chunkErr);
        }
      }
    }
  }

  // [FIX v5.5.008 P2 #13] ล้าง orphaned chunks ที่อยู่เกิน numChunks ปัจจุบัน
  cleanupOrphanedChunks_(numChunks);

  if (failedChunks.length === 0) {
    logDebug('Utils', 'saveChunkedCache_: ' + keyPrefix + ' — ' + numChunks + ' chunks, ' +
             json.length + ' chars (' + totalBatches + ' batches, all succeeded)');
  } else {
    logWarn('Utils', 'saveChunkedCache_: ' + keyPrefix + ' — ' + numChunks + ' chunks, ' +
            failedChunks.length + ' failed (batches: ' + successBatches + '/' + totalBatches + ' succeeded)');
  }
}

/**
 * loadChunkedCache_ — [REF-010] Centralized chunked cache reader
 * [FIX v5.5.007] ใช้ getAll() สำหรับ batch read — เร็วขึ้น 5-10 เท่า
 * 
 * @param {CacheService.Cache} cache - CacheService instance
 * @param {string} keyPrefix - Base key prefix for cache entries
 * @return {*|null} Parsed data or null if not found
 */
function loadChunkedCache_(cache, keyPrefix) {
  // [FAST PATH] ลองอ่านแบบ single key ก่อน
  var single = cache.get(keyPrefix);
  if (single) {
    try { 
      var result = JSON.parse(single);
      logDebug('Utils', 'loadChunkedCache_: ' + keyPrefix + ' — single get (' + single.length + ' chars)');
      return result;
    } catch (e) { 
      logDebug('Utils', 'loadChunkedCache_ single parse error: ' + e.message); 
    }
  }
  
  // [CHUNKED PATH] อ่าน chunk count
  var chunkCountStr = cache.get(keyPrefix + '_CHUNKS');
  if (!chunkCountStr) {
    logDebug('Utils', 'loadChunkedCache_: ' + keyPrefix + ' — ไม่พบ data');
    return null;
  }
  
  var totalChunks = Number(chunkCountStr);
  if (isNaN(totalChunks) || totalChunks <= 0) {
    logWarn('Utils', 'loadChunkedCache_: ' + keyPrefix + ' — _CHUNKS ไม่ถูกต้อง: ' + chunkCountStr);
    return null;
  }
  
  // [PERF] ใช้ getAll() สำหรับ batch read
  var keys = [];
  for (var i = 0; i < totalChunks; i++) {
    keys.push(keyPrefix + '_' + i);
  }
  
  var chunks;
  try {
    chunks = cache.getAll(keys);
  } catch (e) {
    logError('Utils', 'loadChunkedCache_ getAll ล้มเหลว: ' + e.message, e);
    return null;
  }
  
  // รวม chunks
  var jsonStr = '';
  for (var j = 0; j < totalChunks; j++) {
    var key = keyPrefix + '_' + j;
    var chunk = chunks[key];
    if (!chunk) {
      logWarn('Utils', 'loadChunkedCache_: ขาด chunk ' + j + ' — cache ไม่สมบูรณ์');
      return null;
    }
    jsonStr += chunk;
  }
  
  try {
    var parsed = JSON.parse(jsonStr);
    logDebug('Utils', 'loadChunkedCache_: ' + keyPrefix + ' — ' + totalChunks + ' chunks, ' + jsonStr.length + ' chars');
    return parsed;
  } catch (e) {
    logError('Utils', 'loadChunkedCache_ JSON parse ล้มเหลว: ' + e.message, e);
    return null;
  }
}

// ============================================================
// SECTION 10: [REF-011] Centralized Cache Invalidation Helper
// ============================================================

/**
 * invalidateChunkedCache_ — [REF-011] Centralized cache invalidation
 * Clears both RAM cache (via callback) and CacheService chunked entries
 * @param {string} cacheKeyPrefix - Base key prefix (e.g., 'M_PERSON_ALL')
 * @param {Function} [ramVarResetFn] - Callback to nullify RAM cache variable
 * @param {string[]} [extraKeys] - Additional cache keys to remove
 */
function invalidateChunkedCache_(cacheKeyPrefix, ramVarResetFn, extraKeys) {
  if (typeof ramVarResetFn === 'function') ramVarResetFn();
  var cache = CacheService.getScriptCache();
  var keysToRemove = [cacheKeyPrefix];
  var chunkCount = cache.get(cacheKeyPrefix + '_CHUNKS');
  if (chunkCount) {
    keysToRemove.push(cacheKeyPrefix + '_CHUNKS');
    for (var i = 0; i < Number(chunkCount); i++) {
      keysToRemove.push(cacheKeyPrefix + '_' + i);
    }
  }
  if (extraKeys && extraKeys.length > 0) {
    keysToRemove = keysToRemove.concat(extraKeys);
  }
  try { cache.removeAll(keysToRemove); } catch (e) { /* ignore */ }
}

// ============================================================
// SECTION 11: [REF-012] Alias Dedup Set Builder
// Moved from 19_Hardening.gs — shared by Hardening + AliasService
// ============================================================

/**
 * buildGlobalAliasDedupSet_ — โหลด M_ALIAS เป็น dedup Set
 * Format key: "ENTITY_TYPE::masterUuid::normalizedVariant"
 * [REF-012] Moved from 19_Hardening.gs — used by generatePersonAliasesFromHistory,
 * migrateEntityAliasToGlobalBatch_, populateAliasFromSCGRawData_, populateAliasFromFactDelivery_
 * @return {Set<string>}
 */
function buildGlobalAliasDedupSet_() {
  var dedupSet = new Set();
  try {
    var ss         = SpreadsheetApp.getActiveSpreadsheet();
    var mAliasSheet = ss.getSheetByName(SHEET.M_ALIAS);
    if (!mAliasSheet || mAliasSheet.getLastRow() < 2) return dedupSet;

    var data = mAliasSheet.getRange(
      2, 1, mAliasSheet.getLastRow() - 1, SCHEMA[SHEET.M_ALIAS].length
    ).getValues();

    data.forEach(function(row) {
      if (row[ALIAS_IDX.ACTIVE_FLAG] !== true && String(row[ALIAS_IDX.ACTIVE_FLAG]).toUpperCase() !== 'TRUE') return;
      var eType = String(row[ALIAS_IDX.ENTITY_TYPE] || '');
      var mUuid = String(row[ALIAS_IDX.MASTER_UUID]  || '');
      var norm  = normalizeForCompare(row[ALIAS_IDX.VARIANT_NAME]);
      if (eType && mUuid && norm) {
        dedupSet.add(eType + '::' + mUuid + '::' + norm);
      }
    });
  } catch (err) {
    logWarn('Utils', 'buildGlobalAliasDedupSet_: ' + err.message);
  }
  return dedupSet;
}

// ============================================================
// SECTION 12: [ADD v5.5.007 P1 #9] Safe Cache Helpers
// ป้องกัน cache.get()/put() ล้มเหลวจาก quota exceeded หรือ transient errors
// ทำให้ calling function crash — ปัจจุบัน fallback ไป sheet read ได้
// ============================================================

/**
 * safeCacheGet_ — [ADD v5.5.007 P1 #9] Safe wrapper สำหรับ CacheService.get()
 *   ถ้า cache.get() throw exception (quota, transient) → คืน null แทน และ log warning
 *   ทำให้ caller สามารถ fallback ไป sheet read ได้โดยไม่ crash
 * @param {GoogleAppsScript.Cache.Cache} cache - CacheService instance
 * @param {string} key - Cache key
 * @return {string|null} Cached value หรือ null ถ้าไม่พบ/error
 */
function safeCacheGet_(cache, key) {
  if (!cache || !key) return null;
  try {
    return cache.get(key);
  } catch (e) {
    logWarn('Utils', 'safeCacheGet_ error for key "' + key + '": ' + e.message);
    return null;
  }
}

/**
 * safeCachePut_ — [ADD v5.5.007 P1 #9] Safe wrapper สำหรับ CacheService.put()
 *   ถ้า cache.put() throw exception (quota, >100KB, transient) → log warning แล้วไม่ crash
 * @param {GoogleAppsScript.Cache.Cache} cache - CacheService instance
 * @param {string} key - Cache key
 * @param {string} value - Value to cache (string)
 * @param {number} [ttl] - TTL in seconds (default: 21600 = 6h)
 * @return {boolean} true ถ้าสำเร็จ, false ถ้าล้มเหลว
 */
function safeCachePut_(cache, key, value, ttl) {
  if (!cache || !key || !value) return false;
  var effectiveTtl = ttl || (typeof AI_CONFIG !== 'undefined' && AI_CONFIG.CACHE_TTL_SEC) ? (ttl || AI_CONFIG.CACHE_TTL_SEC) : 21600;
  try {
    cache.put(key, value, effectiveTtl);
    return true;
  } catch (e) {
    logWarn('Utils', 'safeCachePut_ error for key "' + key + '" (size: ' + value.length + ' chars): ' + e.message);
    return false;
  }
}

/**
 * safeCacheRemoveAll_ — [ADD v5.5.007 P1 #9] Safe wrapper สำหรับ CacheService.removeAll()
 *   ถ้า removeAll() throw exception → log warning แล้วไม่ crash
 * @param {GoogleAppsScript.Cache.Cache} cache - CacheService instance
 * @param {string[]} keys - Array of keys to remove
 * @return {boolean} true ถ้าสำเร็จ, false ถ้าล้มเหลว
 */
function safeCacheRemoveAll_(cache, keys) {
  if (!cache || !keys || keys.length === 0) return false;
  try {
    cache.removeAll(keys);
    return true;
  } catch (e) {
    logWarn('Utils', 'safeCacheRemoveAll_ error for ' + keys.length + ' keys: ' + e.message);
    return false;
  }
}
