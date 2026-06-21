/**
 * VERSION: 5.5.020
 * FILE: 16_GeoDictionaryBuilder.gs
 * LMDS V5.5 — Geo Dictionary Builder (SYS_TH_GEO)
 * ===================================================
 * PURPOSE:
 *   สร้างและดูแลฐานข้อมูลภูมิศาสตร์ไทย (SYS_TH_GEO) 16 คอลัมน์
 *   สำหรับการแกะที่อยู่อัตโนมัติ
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
 *     - 01_Config (SHEET.SYS_TH_GEO, TH_GEO_IDX.*, AI_CONFIG.CACHE_TTL_SEC)
 *     - 02_Schema (SCHEMA)
 *     - 05_NormalizeService (normalizeForCompare)
 *     - 20_ThGeoService (populateGeoMetadata)
 *     - 14_Utils (diceCoefficient,
 *                saveChunkedCache_, loadChunkedCache_ [V5.5.007 P1 #7],
 *                flushLogBuffer_ (in finally of buildGeoDictionary) [V5.5.008 P2 #11])
 *   CALLS (Invokes):
 *     - normalizeForCompare() → 05_NormalizeService
 *     - diceCoefficient() → 14_Utils
 *     - saveChunkedCache_/loadChunkedCache_ → 14_Utils (postcode/province/district
 *       maps migrated from raw cache.put/get to chunked putAll/getAll) [V5.5.007 P1 #7]
 *     - flushLogBuffer_() → 03_SetupSheets (buildGeoDictionary finally) [V5.5.008 P2 #11]
 *     - logWarn/logInfo() → 03_SetupSheets
 *   EXPORTS TO:
 *     - 00_App (buildGeoDictionary, populateGeoMetadata — menu trigger)
 *     - 07_PlaceService (lookupByPostcode, lookupPostcodeByArea, lookupProvinceFromAddress, scanAddressAgainstDictionary, isValidProvince)
 *     - 20_ThGeoService (loadCachedGeoRows_, safeUiAlert_)
 *   SHEETS ACCESSED:
 *     - SHEET.SYS_TH_GEO (Read+Write: 16-column dictionary)
 * ===================================================
 * ARCHITECTURE:
 *   ┌─────────────────────────────────────────────────┐
 *   │         Thai Geo Dictionary (SYS_TH_GEO)        │
 *   ├─────────────────────────────────────────────────┤
 *   │  buildGeoDictionary                             │
 *   │    ├─ populate search/postal keys               │
 *   │    └─ clean columns → CacheService + RAM        │
 *   ├─────────────────────────────────────────────────┤
 *   │  Lookup Functions:                              │
 *   │    lookupByPostcode(postcode → area info)       │
 *   │    lookupPostcodeByArea(tambon/amphoe/province) │
 *   │    lookupProvinceFromAddress(raw → province)    │
 *   │    scanAddressAgainstDictionary(raw → geo)      │
 *   │    isValidProvince(name → boolean)              │
 *   │    lookupDistrictsByProvince(province → [])     │
 *   ├─────────────────────────────────────────────────┤
 *   │  Fuzzy Matching: diceCoefficient-based          │
 *   ├─────────────────────────────────────────────────┤
 *   │  Cache Layer:                                   │
 *   │    RAM: _GLOBAL_GEO_DICT_CACHE (in-memory)     │
 *   │    CacheService: chunked postcode/prov/district │
 *   │    loadCachedGeoRows_ / getCachedPostcodeMap_   │
 *   │    savePostcodeMapToCache_ / getCachedProvinces_│
 *   │    getCachedDistricts_ (write-back on miss      │
 *   │      — V5.5.008 P2 #14) / invalidateGeoDictCache│
 *   │    + nulls _GLOBAL_GEO_DICT_SEARCH_KEY_INDEX    │
 *   │      (V5.5.007 P0 #2)                           │
 *   │    [V5.5.007 P1 #7] chunked cache migration     │
 *   │      (saveChunkedCache_/loadChunkedCache_)      │
 *   │    [V5.5.008 P2 #11] flushLogBuffer_() in finally│
 *   │      of buildGeoDictionary                      │
 *   ├─────────────────────────────────────────────────┤
 *   │  Helpers: safeUiAlert_ (→ 14_Utils)              │
 *   └─────────────────────────────────────────────────┘
 * ===================================================
 */

// ============================================================
// SECTION 0: [REF-014] Thai Admin Prefix Stripping Helpers
// Single Source of Truth สำหรับการตัดคำนำหน้าภาษาไทย
// ============================================================

/**
 * stripThaiAdminPrefix_ — [REF-014] ตัดคำนำหน้าตำบล/อำเภอ ออกจากข้อความ
 * ใช้ร่วมกันทั้งใน lookupPostcodeByArea, listAllAreasByPostcode, และ 20_ThGeoService
 * @param {string} text - ข้อความที่ต้องการตัด prefix
 * @return {string} ข้อความที่ตัด prefix แล้ว
 */
function stripThaiAdminPrefix_(text) {
  if (!text) return '';
  return String(text).replace(/(ตำบล|ต\.|บ้าน|บ\.)/g, '')
    .replace(/(อำเภอ|อ\.|เขต|ข\.)/g, '')
    .trim();
}

/**
 * stripThaiProvincePrefix_ — [REF-014] ตัดคำนำหน้าจังหวัด ออกจากข้อความ
 * @param {string} text - ข้อความที่ต้องการตัด prefix
 * @return {string} ข้อความที่ตัด prefix แล้ว
 */
function stripThaiProvincePrefix_(text) {
  if (!text) return '';
  return String(text).replace(/(จังหวัด|จ\.)/g, '').trim();
}

// [NEW v5.2.001] Global RAM Cache for batch runs (Managed in 01_Config.gs)
// [PERF-005] Province Index Map สำหรับ lookupPostcodeByArea — ลด scan จาก O(N) เป็น O(N/province)
var _GLOBAL_GEO_DICT_PROVINCE_INDEX = null;

// ============================================================
// SECTION 1: buildGeoDictionary — Entry Point
// ============================================================

function buildGeoDictionary() {
  // [SEC-012 FIX] Authorization Guard — rebuild cache ทั้งหมดต้องเป็น Admin เท่านั้น
  if (typeof isAuthorizedUser_ === 'function' && !isAuthorizedUser_()) {
    safeUiAlert_('🔒 คุณไม่มีสิทธิ์รัน Build Geo Dictionary\nกรุณาติดต่อ Admin');
    return;
  }
  // [REF-011 V5.5.020 PILOT] Apply withEntryPointGuard_ for standardized error handling
  //   - Preserve Behavior 100%: errorPrefix='เกิดข้อผิดพลาด: ' (same as original alert message)
  //   - finally block (flushLogBuffer_) handled by guard automatically
  withEntryPointGuard_('GeoDictBuilder', 'buildGeoDictionary', function() {
  // [G-1] Load checkpoint for resume support
  const props = PropertiesService.getScriptProperties();
  const checkpointRaw = props.getProperty('GEO_DICT_CHECKPOINT');
  const savedRowIndex = checkpointRaw ? (Number(JSON.parse(checkpointRaw).rowIndex) || 0) : 0;

  if (savedRowIndex > 0) {
    logInfo('GeoDictBuilder', 'Resume buildGeoDictionary จากแถว ' + savedRowIndex);
  }

  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET.SYS_TH_GEO);

  if (!sheet || sheet.getLastRow() < 2) {
    logWarn('GeoDictBuilder', 'SYS_TH_GEO ว่างอยู่');
    safeUiAlert_('⚠️ SYS_TH_GEO ยังไม่มีข้อมูล\nกรุณา Import ข้อมูลภูมิศาสตร์ไทยก่อน');
    return;
  }

  logInfo('GeoDictBuilder', 'เริ่มสร้าง Geo Dictionary');

  const colsToRead = SCHEMA[SHEET.SYS_TH_GEO].length;
  const totalRows  = sheet.getLastRow() - 1;
  const allData    = sheet.getRange(2, 1, totalRows, colsToRead).getValues();

  const postcodeMap  = {};
  const provinceSet  = new Set();
  const districtMap  = {};

  // [G-1] Time Guard + Checkpoint
  const startTime = new Date();
  const timeLimit = AI_CONFIG.TIME_LIMIT_MS || (5 * 60 * 1000);
  let timedOut = false;
  let lastProcessedIndex = 0;

  for (let i = 0; i < allData.length; i++) {
    const row = allData[i];
    const postcode   = String(row[TH_GEO_IDX.POSTCODE]     || '').trim().padStart(5, '0');
    const subDistrict= String(row[TH_GEO_IDX.SUB_DISTRICT] || '').trim();
    const district   = String(row[TH_GEO_IDX.DISTRICT]     || '').trim();
    const province   = String(row[TH_GEO_IDX.PROVINCE]     || '').trim();

    if (!province) continue;

    // [UPGRADE v5.2.008] Cache full row data for ThGeoService
    if (postcode && postcode !== '00000' && !postcodeMap[postcode]) {
      postcodeMap[postcode] = {
        province, district, subDistrict,
        searchKey: row[TH_GEO_IDX.SEARCH_KEY] || '',
        postalKey: row[TH_GEO_IDX.POSTAL_KEY] || '',
        noteType:  row[TH_GEO_IDX.NOTE_TYPE]  || 'FULL_AREA'
      };
    }

    provinceSet.add(province);

    if (!districtMap[province]) districtMap[province] = new Set();
    if (district) districtMap[province].add(district);

    lastProcessedIndex = i;

    // [G-1] Time Guard every 500 rows
    if (i > 0 && i % 500 === 0 && hasTimePassed_(startTime, timeLimit)) {
      props.setProperty('GEO_DICT_CHECKPOINT', JSON.stringify({ rowIndex: i }));
      timedOut = true;
      logInfo('GeoDictBuilder', 'Time guard ที่แถว ' + i + ' — บันทึก checkpoint');
      break;
    }
  }

  if (timedOut) {
    safeUiAlert_(
      '⚠️ buildGeoDictionary หยุดกลางคัน (Timeout)!\n\n' +
      'ดำเนินการถึงแถว: ' + lastProcessedIndex + ' / ' + totalRows + '\n\n' +
      '💡 รันอีกครั้งเพื่อดำเนินการต่อ'
    );
    return;
  }

  const districtMapArr = {};
  Object.keys(districtMap).forEach(prov => {
    districtMapArr[prov] = [...districtMap[prov]];
  });

  const cache = CacheService.getScriptCache();

  savePostcodeMapToCache_(postcodeMap);
  _GLOBAL_GEO_DICT_CACHE = null; // [FIX v5.2.009] ล้าง RAM Cache เมื่อมีการ rebuild ใหม่

  try {
    cache.put('TH_GEO_PROVINCES', JSON.stringify([...provinceSet]), AI_CONFIG.CACHE_TTL_SEC);
  } catch (e) {
    logWarn('GeoDictBuilder', 'Cache PROVINCES ล้มเหลว: ' + e.message);
  }

  try {
    cache.put('TH_GEO_DISTRICTS', JSON.stringify(districtMapArr), AI_CONFIG.CACHE_TTL_SEC);
  } catch (e) {
    logWarn('GeoDictBuilder', 'Cache DISTRICTS ล้มเหลว: ' + e.message);
  }

  // [G-1] Clear checkpoint on completion
  props.deleteProperty('GEO_DICT_CHECKPOINT');

  logInfo('GeoDictBuilder', 'สร้าง Dictionary เสร็จ — ' + totalRows + ' แถว ' + provinceSet.size + ' จังหวัด ' + Object.keys(postcodeMap).length + ' ไปรษณีย์');

  safeUiAlert_(
    '✅ สร้าง Geo Dictionary เสร็จ!\n\n' +
    '  จำนวนแถว:     ' + totalRows + '\n' +
    '  จังหวัด:       ' + provinceSet.size + '\n' +
    '  รหัสไปรษณีย์: ' + Object.keys(postcodeMap).length
  );
  }, { errorPrefix: 'เกิดข้อผิดพลาด: ' });
}

// ============================================================
// SECTION 2: Lookup Functions
// ============================================================

function lookupByPostcode(postcode) {
  const clean = String(postcode || '').replace(/[^0-9]/g, '').padStart(5, '0');
  if (clean.length !== 5 || clean === '00000') return null;
  const cached = getCachedPostcodeMap_();
  return cached[clean] || null;
}

function lookupProvinceFromAddress(rawAddress) {
  if (!rawAddress) return '';
  const addr      = String(rawAddress).trim();
  const provinces = getCachedProvinces_();

  for (const province of provinces) {
    if (province.length >= 4 && addr.includes(province)) return province;
  }

  const match = addr.match(/(?:จ\.?|จังหวัด)\s*([ก-๙]{2,})/);
  if (match && match[1]) {
    const found = provinces.find(p => p.includes(match[1]) && p.length >= 4);
    if (found) return found;
  }

  const postcodeMatch = addr.match(/\b[0-9]{5}\b/);
  if (postcodeMatch) {
    const loc = lookupByPostcode(postcodeMatch[0]);
    if (loc && loc.province) return loc.province;
  }
  return '';
}

/**
 * lookupPostcodeByArea — ค้นหาย้อนกลับแบบ Fuzzy
 * @return {{postcode, subDistrict, district, province}}
 */
function lookupPostcodeByArea(tambon, amphoe, province) {
  // [FIX v008] ถ้าไม่มีจังหวัด ให้พยายามหาจากตำบล+อำเภอ (ห้าม return null ทันที)
  if (!province && (!tambon || !amphoe)) return null;

  // [REF-014] ใช้ stripThaiAdminPrefix_ และ stripThaiProvincePrefix_ แทน inline regex
  const cleanT = stripThaiAdminPrefix_(tambon);
  const cleanA = stripThaiAdminPrefix_(amphoe);
  const cleanP = stripThaiProvincePrefix_(province);

  // [UPGRADE v5.2.001] Use GLOBAL_CACHE to avoid sheet loop
  const data = loadCachedGeoRows_();
  if (!data || data.length === 0) return null;

  // [PERF-005] Province Index Map — ลดจำนวนแถวที่ต้องสแกนจาก ~10,000 เหลือ ~130 ต่อจังหวัด
  // สร้าง index ถ้ายังไม่มี แล้วเก็บไว้ใน module-level cache
  if (!_GLOBAL_GEO_DICT_PROVINCE_INDEX) {
    const index = {};
    data.forEach(function(row) {
      const prov = String(row.province || '').trim();
      if (prov) {
        if (!index[prov]) index[prov] = [];
        index[prov].push(row);
      }
    });
    _GLOBAL_GEO_DICT_PROVINCE_INDEX = index;
  }

  // ถ้ามีจังหวัด ให้ค้นเฉพาะแถวของจังหวัดนั้น (O(~130) แทน O(~10,000))
  var candidates = cleanP ? (_GLOBAL_GEO_DICT_PROVINCE_INDEX[cleanP] || []) : data;

  // Fallback: ถ้า cleanP ไม่ตรงกับ key ใน index (อาจต่าง prefix) ให้ลองค้นแบบ loose
  if (cleanP && candidates.length === 0) {
    for (const provKey of Object.keys(_GLOBAL_GEO_DICT_PROVINCE_INDEX)) {
      const provClean = provKey.replace(/จังหวัด|จ\./g, '').trim();
      if (provClean === cleanP || provKey.includes(cleanP) || cleanP.includes(provClean)) {
        candidates = _GLOBAL_GEO_DICT_PROVINCE_INDEX[provKey];
        break;
      }
    }
  }

  // ถ้ายังไม่เจอ ใช้ข้อมูลทั้งหมด
  if (candidates.length === 0) candidates = data;

  let bestMatch = null;
  let maxScore  = 0;

  for (const row of candidates) {
    // [REF-014] ใช้ stripThaiProvincePrefix_ แทน inline regex
    const rowP = stripThaiProvincePrefix_(row.province);
    if (cleanP && rowP !== cleanP) continue;

    // [REF-014] ใช้ stripThaiAdminPrefix_ แทน inline regex
    const rowT = stripThaiAdminPrefix_(row.subDistrict);
    const rowA = stripThaiAdminPrefix_(row.district);

    const s1 = diceCoefficient(normalizeForCompare(cleanT), normalizeForCompare(rowT));
    const s2 = diceCoefficient(normalizeForCompare(cleanA), normalizeForCompare(rowA));
    const score = (cleanT ? s1 * 0.7 : 0) + (s2 * 0.3);

    if (score > maxScore) {
      maxScore = score;
      bestMatch = {
        postcode:    String(row.postcode || '').trim().padStart(5, '0'),
        subDistrict: String(row.subDistrict || '').trim(),
        district:    String(row.district || '').trim(),
        province:    String(row.province || '').trim()
      };
    }
    if (maxScore === 1.0) break;
  }

  return (maxScore > 0.5) ? bestMatch : null;
}

/**
 * scanAddressAgainstDictionary — ค้นหาตำบล/อำเภอ/จังหวัดจากประโยคยาวๆ (แก้ปัญหา Regex หลุด)
 * @return {{postcode, subDistrict, district, province}}
 */
function scanAddressAgainstDictionary(rawAddress, knownPostcode) {
  if (!rawAddress) return null;
  const data = loadCachedGeoRows_();
  if (!data || data.length === 0) return null;

  let candidates = data;
  const pcMatch = knownPostcode || (rawAddress.match(/\b[0-9]{5}\b/) || [])[0];
  if (pcMatch) {
    candidates = data.filter(r => String(r.postcode).trim().padStart(5, '0') === pcMatch);
  }

  // 1. Try to find an exact match for both Subdistrict and District
  for (const row of candidates) {
    const s = String(row.subDistrict || '').trim();
    const district = String(row.district || '').trim();
    if (s && district && rawAddress.includes(s) && rawAddress.includes(district)) {
      return {
        postcode: String(row.postcode || '').trim().padStart(5, '0'),
        subDistrict: s,
        district: district,
        province: String(row.province || '').trim()
      };
    }
  }

  // 2. Fallback: Try to find District and Province
  for (const row of candidates) {
    const district = String(row.district || '').trim();
    const p = String(row.province || '').trim();
    if (district && p && rawAddress.includes(district) && rawAddress.includes(p)) {
      return {
        postcode: String(row.postcode || '').trim().padStart(5, '0'),
        subDistrict: '', // We don't know the subdistrict for sure
        district: district,
        province: p
      };
    }
  }

  return null;
}

/**
 * listAllAreasByPostcode — ดึงพื้นที่ทั้งหมดตามรหัสไปรษณีย์
 * @public สาธารณะ query API สำหรับ admin/debug
 */
function listAllAreasByPostcode(postcode) {
  const clean = String(postcode || '').replace(/[^0-9]/g, '').padStart(5, '0');
  if (clean.length !== 5) return [];

  // [PERF-009] ใช้ loadCachedGeoRows_() แทนการอ่าน Sheet ตรง — ใช้ RAM cache ที่มีอยู่แล้ว
  const data = loadCachedGeoRows_();
  return data.filter(r => String(r.postcode || '').trim().padStart(5, '0') === clean)
             .map(r => ({
               // [REF-014] ใช้ stripThaiAdminPrefix_ และ stripThaiProvincePrefix_ แทน inline regex
               subDistrict: stripThaiAdminPrefix_(r.subDistrict),
               district:    stripThaiAdminPrefix_(r.district),
               province:    stripThaiProvincePrefix_(r.province)
             }));
}

function isValidProvince(provinceName) {
  if (!provinceName || provinceName.length < 4) return false;
  const provinces = getCachedProvinces_();
  return provinces.includes(provinceName.trim());
}

function lookupDistrictsByProvince(provinceName) {
  if (!provinceName) return [];
  const cached = getCachedDistricts_();
  return cached[provinceName] || [];
}

// ============================================================
// SECTION 3: Cache Getters
// ============================================================

/**
 * [NEW v5.2.001] loadCachedGeoRows_ — Memoization loader
 * [UPGRADE v5.2.008] รองรับ 16 คอลัมน์
 */
function loadCachedGeoRows_() {
  if (_GLOBAL_GEO_DICT_CACHE) return _GLOBAL_GEO_DICT_CACHE;

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET.SYS_TH_GEO);
  if (!sheet || sheet.getLastRow() < 2) return [];

  // อ่านครบ 16 คอลัมน์
  const data = sheet.getRange(2, 1, sheet.getLastRow() - 1, SCHEMA[SHEET.SYS_TH_GEO].length).getValues();
  _GLOBAL_GEO_DICT_CACHE = data.map(row => ({
    postcode:    String(row[TH_GEO_IDX.POSTCODE]     || '').trim(),
    subDistrict: String(row[TH_GEO_IDX.SUB_DISTRICT] || '').trim(),
    district:    String(row[TH_GEO_IDX.DISTRICT]     || '').trim(),
    province:    String(row[TH_GEO_IDX.PROVINCE]     || '').trim(),
    searchKey:   String(row[TH_GEO_IDX.SEARCH_KEY]   || '').trim(),
    postalKey:   String(row[TH_GEO_IDX.POSTAL_KEY]   || '').trim(),
    noteType:    String(row[TH_GEO_IDX.NOTE_TYPE]    || 'FULL_AREA'),
    noteScope:   String(row[TH_GEO_IDX.NOTE_SCOPE]   || 'FULL')
  }));

  return _GLOBAL_GEO_DICT_CACHE;
}

function getCachedPostcodeMap_() {
  const cache  = CacheService.getScriptCache();

  // [FIX v5.5.007 P1 #7] ใช้ centralized loadChunkedCache_ (getAll + batch read)
  if (typeof loadChunkedCache_ === 'function') {
    const cached = loadChunkedCache_(cache, 'TH_GEO_POSTCODE');
    if (cached && typeof cached === 'object') {
      return cached;
    }
  } else {
    // Fallback: legacy chunked read pattern
    const totalStr = cache.get('TH_GEO_POSTCODE_TOTAL');
    if (totalStr) {
      const totalChunks = Number(totalStr);
      if (!isNaN(totalChunks) && totalChunks > 0) {
        let isComplete = true;
        const merged = {};
        for (let i = 0; i < totalChunks; i++) {
          const chunkStr = cache.get('TH_GEO_POSTCODE_' + i);
          if (!chunkStr) { isComplete = false; break; }
          try { Object.assign(merged, JSON.parse(chunkStr)); } catch(e) { isComplete = false; break; }
        }
        if (isComplete) return merged;
      }
    }
  }

  const result = buildPostcodeMapFromSheet_();
  savePostcodeMapToCache_(result);
  return result;
}

/**
 * savePostcodeMapToCache_ — [FIX v5.5.007 P1 #7] ใช้ centralized saveChunkedCache_
 *   เดิมแบ่ง chunk ตามจำนวน keys (350/chunk) + sequential cache.put()
 *   ตอนนี้ใช้ saveChunkedCache_ ที่แบ่งตามขนาด KB (90KB/chunk) + putAll() แบบ batch
 *   ปลอดภัยกว่าเพราะ chunk size ปรับตามขนาดข้อมูลจริง ไม่ใช่จำนวน items
 * [PERF-011] Removed legacy fallback — saveChunkedCache_ is required dependency
 */
function savePostcodeMapToCache_(postcodeMap) {
  // [PERF-011] Defensive check — saveChunkedCache_ is required dependency from 14_Utils.gs
  if (typeof saveChunkedCache_ !== 'function') {
    throw new Error('savePostcodeMapToCache_: saveChunkedCache_ not loaded — check 14_Utils.gs');
  }
  const cache = CacheService.getScriptCache();
  saveChunkedCache_(cache, 'TH_GEO_POSTCODE', postcodeMap);
  // [FIX] ล้าง legacy keys ที่อาจตกค้างจาก version เก่า
  try {
    const legacyTotal = cache.get('TH_GEO_POSTCODE_TOTAL');
    if (legacyTotal) {
      const legacyChunks = Number(legacyTotal);
      const keysToRemove = ['TH_GEO_POSTCODE_TOTAL'];
      for (let i = 0; i < legacyChunks; i++) keysToRemove.push('TH_GEO_POSTCODE_' + i);
      cache.removeAll(keysToRemove);
    }
  } catch (e) { /* ignore cleanup errors */ }
}

function getCachedProvinces_() {
  const cache  = CacheService.getScriptCache();
  const cached = cache.get('TH_GEO_PROVINCES');
  if (cached) { try { return JSON.parse(cached); } catch(e) { logDebug('GeoDictBuilder', 'TH_GEO_PROVINCES Cache parse error: ' + e.message); } }
  const result = buildProvincesFromSheet_();
  try { cache.put('TH_GEO_PROVINCES', JSON.stringify(result), AI_CONFIG.CACHE_TTL_SEC); } catch(e) { logDebug('GeoDictBuilder', 'TH_GEO_PROVINCES Cache write error: ' + e.message); }
  return result;
}

function getCachedDistricts_() {
  const cache  = CacheService.getScriptCache();
  const cached = cache.get('TH_GEO_DISTRICTS');
  if (cached) { try { return JSON.parse(cached); } catch(e) { logDebug('GeoDictBuilder', 'TH_GEO_DISTRICTS Cache parse error: ' + e.message); } }
  const result = buildDistrictsMapFromSheet_();
  // [FIX v5.5.008 P2 #14] write-back to cache on miss — consistent with getCachedProvinces_ pattern
  //   เดิม getCachedDistricts_ อ่านจาก sheet แต่ไม่ write-back to cache
  //   ทำให้ call ถัดไปต้องอ่าน sheet ใหม่ทุกครั้ง ถ้า buildGeoDictionary ยังไม่ได้รัน
  //   ตอนนี้ write-back to cache เหมือน getCachedProvinces_ ที่ line 554
  try { cache.put('TH_GEO_DISTRICTS', JSON.stringify(result), AI_CONFIG.CACHE_TTL_SEC); }
  catch(e) { logDebug('GeoDictBuilder', 'TH_GEO_DISTRICTS Cache write error: ' + e.message); }
  return result;
}

function buildPostcodeMapFromSheet_() {
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET.SYS_TH_GEO);
  if (!sheet || sheet.getLastRow() < 2) return {};
  const data = sheet.getRange(2, 1, sheet.getLastRow() - 1, SCHEMA[SHEET.SYS_TH_GEO].length).getValues();
  const result = {};
  data.forEach(row => {
    const postcode = String(row[TH_GEO_IDX.POSTCODE] || '').trim().padStart(5, '0');
    if (postcode && postcode !== '00000' && !result[postcode]) {
      result[postcode] = {
        province:    String(row[TH_GEO_IDX.PROVINCE]     || '').trim(),
        district:    String(row[TH_GEO_IDX.DISTRICT]     || '').trim(),
        subDistrict: String(row[TH_GEO_IDX.SUB_DISTRICT] || '').trim(),
        searchKey:   String(row[TH_GEO_IDX.SEARCH_KEY]   || '').trim(),
        postalKey:   String(row[TH_GEO_IDX.POSTAL_KEY]   || '').trim(),
        noteType:    String(row[TH_GEO_IDX.NOTE_TYPE]    || 'FULL_AREA'),
      };
    }
  });
  return result;
}

function buildProvincesFromSheet_() {
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET.SYS_TH_GEO);
  if (!sheet || sheet.getLastRow() < 2) return [];
  const data = sheet.getRange(2, TH_GEO_IDX.PROVINCE + 1, sheet.getLastRow() - 1, 1).getValues();
  const provinceSet = new Set();
  data.forEach(row => {
    const province = String(row[0] || '').trim();
    if (province && province.length >= 4) provinceSet.add(province);
  });
  return [...provinceSet];
}

function buildDistrictsMapFromSheet_() {
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET.SYS_TH_GEO);
  if (!sheet || sheet.getLastRow() < 2) return {};
  const data = sheet.getRange(2, 1, sheet.getLastRow() - 1, SCHEMA[SHEET.SYS_TH_GEO].length).getValues();
  const result = {};
  data.forEach(row => {
    const province = String(row[TH_GEO_IDX.PROVINCE] || '').trim();
    const district = String(row[TH_GEO_IDX.DISTRICT] || '').trim();
    if (!province || !district) return;
    if (!result[province]) result[province] = new Set();
    result[province].add(district);
  });
  const arr = {};
  Object.keys(result).forEach(p => { arr[p] = [...result[p]]; });
  return arr;
}

function invalidateGeoDictCache() {
  _GLOBAL_GEO_DICT_CACHE = null;
  _GLOBAL_GEO_DICT_PROVINCE_INDEX = null; // [PERF-005]
  // [FIX v5.5.007 P0 #2] ล้าง _GLOBAL_GEO_DICT_SEARCH_KEY_INDEX ที่ประกาศใน 20_ThGeoService.gs
  // เดิมลืมล้าง index นี้ ทำให้หลัง rebuild dictionary การค้นหาด้วย searchKey ยังใช้ข้อมูลเก่า
  if (typeof _GLOBAL_GEO_DICT_SEARCH_KEY_INDEX !== 'undefined') {
    _GLOBAL_GEO_DICT_SEARCH_KEY_INDEX = null;
  }
  const cache = CacheService.getScriptCache();
  const keysToRemove = ['TH_GEO_PROVINCES', 'TH_GEO_DISTRICTS', 'TH_GEO_POSTCODE_TOTAL', 'TH_GEO_POSTCODE'];
  // [FIX v5.5.001] ดึงจำนวน chunks จาก cache แทน hardcoded 10
  // เดิมลบแค่ chunk 0-9 ทำให้ cache เก่าไม่ถูกลบเมื่อมีมากกว่า 10 chunks
  // Fallback เป็น 50 ถ้าอ่าน total ไม่ได้ — ครอบคลุมกรณีมี postcode มาก
  const totalStr = cache.get('TH_GEO_POSTCODE_TOTAL');
  const totalChunks = totalStr ? Number(totalStr) : 50;
  const chunkLimit = Math.max(totalChunks, 50);
  for (let i = 0; i < chunkLimit; i++) keysToRemove.push('TH_GEO_POSTCODE_' + i);
  cache.removeAll(keysToRemove);
  logInfo('GeoDictBuilder', 'ล้าง Geo Dictionary Cache เรียบร้อย — รวม _GLOBAL_GEO_DICT_SEARCH_KEY_INDEX');
}

// [REMOVED v5.4.003] safeAlert_ — ย้ายไป 14_Utils.gs (ชื่อ safeUiAlert_) แล้ว
// ทุก caller ถูกเปลี่ยนให้เรียก safeUiAlert_() โดยตรง
